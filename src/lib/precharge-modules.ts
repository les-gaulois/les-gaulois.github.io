/**
 * Le préchargement des modules de chaque page (23 novembre 2026, « les pages du site ont du mal à charger »).
 *
 * Les scripts d'une page s'importent les uns les autres sur quatre niveaux (le script de la mise en page importe `tenue`,
 * qui importe `api`, qui importe l'aide au chargement…) : le navigateur ne découvre un niveau qu'après avoir reçu le
 * précédent. Juste après chaque publication, le cache de GitHub Pages est vide et chaque fichier met jusqu'à 0,8 s à
 * venir : les niveaux s'additionnaient, 2 à 4 s avant que la page ne tourne (mesuré ce jour-là). Après la construction,
 * chaque page annonce donc en tête, par `<link rel="modulepreload">`, tous les modules dont elle aura besoin tout de suite,
 * qui partent ensemble au lieu de l'un après l'autre.
 *
 * Tout tout de suite : les scripts de la page et leurs imports statiques, et les îles hydratées au chargement, au repos
 * ou dans le seul navigateur (`client:load`, `client:idle`, `client:only`). Pas celles qui attendent d'être vues
 * (`client:visible`, `client:media`), ni les imports dynamiques, chargés plus tard ou jamais.
 *
 * Les fonctions sont pures ; l'intégration qui lit et réécrit `dist/` est dans `src/integrations/precharge-modules.ts`.
 */

/** Les façons d'hydrater une île dont le code est demandé dès le chargement de la page. */
export const ILES_TOUT_DE_SUITE: readonly string[] = ["load", "idle", "only"];

/**
 * Les modules qu'un fichier construit par Vite importe statiquement (`import{a as b}from"./x.js"`, `import"./y.js"`,
 * `export{c}from"./z.js"`), tels qu'écrits : chemins relatifs ou absolus seulement. Les imports dynamiques
 * (`import("./w.js")`) n'en sont pas.
 */
export function importsStatiques(source: string): string[] {
  const vus = new Set<string>();
  for (const m of source.matchAll(/(?:^|[;\s}/])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"'\n]+)["']/g)) {
    const chemin = m[1];
    if (chemin && /^(\.\.?\/|\/)/.test(chemin) && /\.m?js$/.test(chemin)) vus.add(chemin);
  }
  return [...vus];
}

function attribut(balise: string, nom: string): string | null {
  const m = new RegExp(`\\s${nom}="([^"]*)"`).exec(balise);
  return m?.[1] ?? null;
}

/** Ce qu'une page publiée charge d'elle-même : ses scripts de module, et le code des îles hydratées tout de suite. */
export function entreesDeLaPage(html: string): { scripts: string[]; iles: string[] } {
  const scripts = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*>/g)) {
    const balise = m[0];
    if (attribut(balise, "type") !== "module") continue;
    const src = attribut(balise, "src");
    if (src) scripts.add(src);
  }
  const iles = new Set<string>();
  for (const m of html.matchAll(/<astro-island\b[^>]*>/g)) {
    const balise = m[0];
    if (!ILES_TOUT_DE_SUITE.includes(attribut(balise, "client") ?? "")) continue;
    for (const nom of ["component-url", "renderer-url", "before-hydration-url"]) {
      const url = attribut(balise, nom);
      if (url) iles.add(url);
    }
  }
  return { scripts: [...scripts], iles: [...iles] };
}

/** L'adresse d'un import, depuis l'adresse du module qui l'écrit (chemins du site, `/_astro/x.js`). */
export function adresseDeLImport(depuis: string, chemin: string): string {
  return new URL(chemin, new URL(depuis, "https://site.invalid/")).pathname;
}

/**
 * Tous les modules que demanderont ces entrées, par imports statiques, du plus proche au plus lointain, entrées comprises :
 * un script posé à la fin d'une longue page part ainsi dès l'en-tête. `lire` rend le code d'un module du site par son
 * adresse, ou `null` s'il n'est pas un fichier du site : il n'est alors ni suivi ni annoncé.
 */
export function modulesAPrecharger(entrees: { scripts: string[]; iles: string[] }, lire: (adresse: string) => string | null): string[] {
  const ordre: string[] = [];
  let niveau = [...entrees.scripts, ...entrees.iles];
  const parcourus = new Set<string>();
  while (niveau.length > 0) {
    const suivant: string[] = [];
    for (const adresse of niveau) {
      if (parcourus.has(adresse)) continue;
      parcourus.add(adresse);
      const source = lire(adresse);
      if (source === null) continue;
      ordre.push(adresse);
      for (const chemin of importsStatiques(source)) suivant.push(adresseDeLImport(adresse, chemin));
    }
    niveau = suivant;
  }
  return ordre;
}

/**
 * La page avec un `<link rel="modulepreload">` par module, posé juste avant `</head>`. Un module déjà annoncé ne l'est pas
 * deux fois ; une page sans `</head>` reste telle quelle.
 */
export function ajouterPrechargements(html: string, adresses: string[]): string {
  const fin = html.indexOf("</head>");
  if (fin < 0) return html;
  const deja = new Set<string>();
  for (const m of html.slice(0, fin).matchAll(/<link\b[^>]*>/g)) {
    if (attribut(m[0], "rel") === "modulepreload") deja.add(attribut(m[0], "href") ?? "");
  }
  const liens = adresses.filter((a) => !deja.has(a)).map((a) => `<link rel="modulepreload" href="${a.replace(/"/g, "&quot;")}">`);
  if (liens.length === 0) return html;
  return html.slice(0, fin) + liens.join("") + html.slice(fin);
}
