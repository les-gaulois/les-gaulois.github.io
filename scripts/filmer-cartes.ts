/**
 * Filme en GIF la carte de chaque membre qui a un Gaulois, pour les commandes /macarte et /gaulois de Discord
 * (`src/lib/cartes-gif.ts`) :
 *   npm run cartes:filmer
 * Lancé par la GitHub Action après « Construire le site » (`.github/workflows/site.yml`). Le film est celui de la vraie
 * carte de la fiche (`src/components/CarteDeMembre.astro`) : les pages de `dist/` sont ouvertes dans le Chromium de
 * Playwright, sans serveur et sans réseau (toute adresse hors de `dist/` est refusée : aucune visite n'est comptée, rien
 * n'est envoyé), l'horloge de la page est tenue par le script, et chaque image est prise à un instant exact.
 *
 * Le curseur fait un tour autour du milieu de la carte par boucle : l'inclinaison revient à son point de départ. Le fond
 * est transparent (demande du pilote : « avoir que la carte de visible »), et le nombre de victoires est retiré : un
 * chiffre sans date n'a pas sa place dans une image qui reste dans un salon.
 *
 * Deux films par membre (demandes du pilote, 17 novembre 2026) :
 * - `carte`, pour /macarte : la carte en hauteur, telle que la fiche la montre ;
 * - `paysage`, pour /gaulois (« que /gaulois soit pareil », « en mode paysage », « je veux voir le niv et la flamme ») :
 *   la même carte élargie aux proportions de sa bannière, 124 cases sur 80, avec, dans les coins du haut, le niveau du
 *   compte et la flamme de série repris tels que la fiche les dessine. Ils ne paraissent que si `/fiches.json` les donne
 *   au robot, qui écrit sous le GIF l'heure du relevé de la série et la mention d'OpenFront, comme sous l'image fixe.
 *   Le cadre animé du rayon « Cadres », dessiné pour la carte en hauteur, n'y paraît pas.
 *
 * Les GIF sont gardés dans `.cache/cartes-gif/` (cache du workflow, jamais dans Git), avec leur liste. À chaque passage,
 * seuls les films nouveaux ou changés sont faits, quelques-uns au plus : le reste attend la construction suivante.
 * Sont publiés dans `dist/cartes/` ceux qui sont à jour, avec `index.json`, que le robot relit.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { CACHE_DES_CARTES, DOSSIER_DES_CARTES, dureeDeLaBoucle, fichierDuGif, imagesDeLaBoucle, INDEX_DES_CARTES, insignesDuFilm, lireIndexDesCartes, listeDeLaSorte, pasDuFilm, SORTES_DE_FILM, versionDeLaCarte, type CarteGif, type IndexDesCartes, type InsignesDuFilm, type SorteDeFilm } from "../src/lib/cartes-gif";

const DIST = process.env["CARTES_DIST"] ?? "dist";
const BASE = (process.env["BASE_PATH"] ?? "").replace(/\/$/, "");
/** Combien de films faire à ce passage, et en combien de temps au plus : un film prend une vingtaine de secondes. */
const PAR_PASSAGE = Number(process.env["CARTES_PAR_PASSAGE"] ?? 10);
const TEMPS_MS = Number(process.env["CARTES_TEMPS_S"] ?? 300) * 1000;
/** Passé ce temps, le script n'ouvre plus de fiche et publie ce qu'il a contrôlé : l'étape du workflow est coupée à huit minutes. */
const ARRET_MS = TEMPS_MS + 90_000;
/** Un GIF plus lourd est refait plus petit : Discord et le paquet du site ont leurs limites. */
const POIDS_MAX = 3_500_000;
/** Au-delà, les films suivants ne sont pas publiés : le paquet du site a sa limite. */
const POIDS_TOTAL_MAX = 200_000_000;
const ORIGINE = "http://cartes.invalid";
/** Autour de la carte : son inclinaison, et le cadre animé du rayon « Cadres », qui la dépasse. */
const MARGE = 30;
const ELAN_MS = 2000;
/**
 * Les points de l'image par pixel de la page. La carte en hauteur fait 144 pixels de large sur la fiche : à un et demi,
 * 216 dans un GIF de 306. Le paysage en fait 372 : à un pour un, dans un GIF de 432 sur 300, il pèse à peu près autant.
 */
const ECHELLES: Readonly<Record<SorteDeFilm, number>> = { carte: 1.5, paysage: 1 };

/** Ce qui ne garde à l'écran que la carte, sans son nombre de victoires. */
const STYLE_DU_FILM =
  "html,body{background:transparent!important}body *{visibility:hidden!important}[data-film],[data-film] *{visibility:visible!important}[data-film] .podium-carte-score{display:none!important}";
/**
 * Le paysage : la carte prend la largeur de sa bannière (124 cases pour 80 de haut), posée seule en haut de la page. Les
 * toiles de la finition gardent leurs cases carrées et couvrent la carte ; le familier reste à côté du Gaulois ; la plaque
 * du nom se resserre au milieu ; le cadre animé, dessiné pour la carte en hauteur, est retiré.
 */
const STYLE_DU_PAYSAGE = [
  "[data-carte-membre]{--px:3px!important;float:none!important;display:block!important;position:absolute!important;left:60px!important;top:60px!important;margin:0!important;padding:0!important}",
  "[data-film]{width:calc(var(--px)*124)!important}",
  "[data-film] .podium-carte-fx{object-fit:cover!important}",
  "[data-film] .podium-carte-cadre{display:none!important}",
  "[data-film] .podium-carte-familier{right:calc(var(--px)*41)!important}",
  "[data-film] .podium-carte-bas{left:calc(var(--px)*32)!important;right:calc(var(--px)*32)!important}",
].join("");

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
};

/** Le fichier de `dist/` d'une adresse du site, ou `null` : hors du dossier, ou absent. */
function fichierDe(chemin: string): string | null {
  if (BASE && !chemin.startsWith(`${BASE}/`)) return null;
  let relatif: string;
  try {
    relatif = decodeURIComponent(chemin.slice(BASE.length));
  } catch {
    return null;
  }
  const racine = normalize(join(process.cwd(), DIST));
  let fichier = normalize(join(racine, relatif));
  if (fichier !== racine && !fichier.startsWith(racine + sep)) return null;
  if (existsSync(fichier) && statSync(fichier).isDirectory()) fichier = join(fichier, "index.html");
  return existsSync(fichier) ? fichier : null;
}

/** Les membres dont la fiche montre une carte : ceux qui ont un Gaulois. */
function membresAvecCarte(): string[] {
  const dossier = join(DIST, "membres");
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((id) => /^[A-Za-z0-9]{1,32}$/.test(id) && existsSync(join(dossier, id, "index.html")) && readFileSync(join(dossier, id, "index.html"), "utf8").includes("data-carte-membre"))
    .sort();
}
/** Pour un essai sur son poste : `CARTES_D_ABORD=<identifiant>,<identifiant>` filme ces membres avant les autres. */
const D_ABORD = (process.env["CARTES_D_ABORD"] ?? "").split(",").filter(Boolean);

/** Ce que la fiche montre du membre, lu dans `dist/fiches.json`, le fichier que relit le robot, avec sa règle. */
type Insignes = InsignesDuFilm;
function insignesDesFiches(): Map<string, Insignes> {
  const fichier = join(DIST, "fiches.json");
  const lus = new Map<string, Insignes>();
  if (!existsSync(fichier)) return lus;
  try {
    const { fiches } = JSON.parse(readFileSync(fichier, "utf8")) as { fiches?: { id?: unknown; niveau?: unknown; flamme?: unknown }[] };
    for (const fiche of fiches ?? []) if (typeof fiche.id === "string") lus.set(fiche.id, insignesDuFilm(fiche));
  } catch {
    // Un fichier illisible : les paysages sont filmés sans insigne, et le robot n'écrit rien dessous.
  }
  return lus;
}

/** Ce qui dessine les deux films d'une carte : leur version, et la finition, qui règle la durée de la boucle. */
interface Releve {
  versions: Record<SorteDeFilm, string>;
  finition: string | null;
}

/** La case de la carte, qui ne tourne pas, remise à l'écran : sa place en pixels de la page. */
const cadrer = (page: Page) =>
  page.locator("[data-film]").evaluate((el) => {
    // Sans le défilement doux de la page, qui durerait pendant la prise de vue.
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = (el.parentElement ?? el).getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

/**
 * Ouvre la fiche, horloge arrêtée, ne garde à l'écran que la carte, et relève ce qui la dessine. En paysage, la carte
 * est élargie, et le niveau et la flamme de la fiche sont copiés dans ses coins du haut : ils s'inclinent avec elle.
 */
async function ouvrir(contexte: BrowserContext, id: string, sorte: SorteDeFilm, insignes: Insignes | null): Promise<{ page: Page; releve: Releve }> {
  const page = await contexte.newPage();
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.goto(`${ORIGINE}${BASE}/membres/${id}/`, { waitUntil: "load" });
  await page.clock.pauseAt(new Date("2026-01-01T12:05:00Z"));
  const carte = page.locator("[data-carte-membre] .podium-carte").first();
  await carte.evaluate((el) => el.setAttribute("data-film", ""));
  await page.addStyleTag({ content: sorte === "paysage" ? STYLE_DU_FILM + STYLE_DU_PAYSAGE : STYLE_DU_FILM });
  // Les images de la carte, chargées et décodées avant la première prise de vue.
  const lu = await carte.evaluate(
    async (el, { montre, paysage }) => {
      const images = [...el.querySelectorAll("img")];
      await Promise.all(images.map((i) => i.decode().catch(() => undefined)));
      const face = el.querySelector<HTMLElement>(".podium-carte-face");
      const banniere = /url\("?([^")]+)"?\)/.exec(face?.style.getPropertyValue("--banniere") ?? "")?.[1] ?? null;
      const adresses = [...new Set([...images.map((i) => i.getAttribute("src") ?? ""), ...(banniere ? [banniere] : [])])].filter(Boolean).sort();
      // Ce qui dessine la carte, sans ce que les scripts de la page y changent en route (son inclinaison, ses toiles).
      const dessin = [
        el.getAttribute("data-finition"),
        el.hasAttribute("data-reflet"),
        el.hasAttribute("data-champion"),
        el.getAttribute("data-metal"),
        el.querySelector(".podium-carte-nom")?.textContent ?? "",
        images.map((i) => [i.className, i.getAttribute("src"), i.getAttribute("width"), i.getAttribute("height")]),
        adresses,
        // Le cadre animé du rayon « Cadres », à la suite et seulement s'il y en a un : une carte sans cadre garde sa version.
        ...(el.getAttribute("data-cadre") ? [el.getAttribute("data-cadre")] : []),
      ];
      // Les insignes de la fiche : l'emblème du niveau et la flamme de série, s'ils sont aussi dans /fiches.json.
      const embleme = montre?.niveau ? document.querySelector('[data-testid="member-level"] svg') : null;
      const flamme = montre?.flamme ? document.querySelector('[data-testid="member-streak"] svg') : null;
      const insignes = [embleme ? `niveau ${embleme.innerHTML}` : null, flamme && montre?.flamme ? `flamme ${montre.flamme.victoires} ${montre.flamme.doree}` : null];
      if (paysage) {
        // Sans fonction nommée ici : tsx leur ajoute une aide que la page ne connaît pas.
        for (const [cote, source] of [
          ["left", embleme],
          ["right", flamme],
        ] as const) {
          if (!source) continue;
          const boite = document.createElement("span");
          boite.style.cssText = `position:absolute;top:8px;${cote}:9px;z-index:5;display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateZ(18px);pointer-events:none`;
          const copie = source.cloneNode(true) as SVGElement;
          // L'emblème à 46 pixels ; la flamme à trois pixels par case au lieu de quatre, chaque case restant entière.
          const largeur = cote === "left" ? 46 : ((Number(source.getAttribute("width")) || 44) * 3) / 4;
          const hauteur = cote === "left" ? 46 : ((Number(source.getAttribute("height")) || 60) * 3) / 4;
          copie.setAttribute("width", String(largeur));
          copie.setAttribute("height", String(hauteur));
          copie.style.filter = "drop-shadow(0 1px 2px rgb(0 0 0 / 0.6))";
          boite.append(copie);
          if (cote === "right" && montre?.flamme) {
            const nombre = document.createElement("span");
            nombre.textContent = String(montre.flamme.victoires);
            nombre.style.cssText = "font:800 14px/1 var(--font-display, system-ui);color:#f4f6ff;background:rgb(10 18 48 / 0.88);border-radius:4px;padding:2px 5px;font-variant-numeric:tabular-nums";
            boite.append(nombre);
          }
          el.append(boite);
        }
      }
      return { carte: JSON.stringify(dessin), paysage: JSON.stringify([dessin, insignes, "paysage"]), adresses, finition: el.getAttribute("data-finition") };
    },
    { montre: insignes, paysage: sorte === "paysage" },
  );
  const images = lu.adresses.flatMap((adresse) => {
    const fichier = fichierDe(new URL(adresse, ORIGINE).pathname);
    return fichier ? [readFileSync(fichier)] : [];
  });
  return { page, releve: { versions: { carte: versionDeLaCarte(lu.carte, images), paysage: versionDeLaCarte(lu.paysage, images) }, finition: lu.finition } };
}

/** Le film d'une carte : deux secondes d'élan, puis une boucle prise image par image, réunie en GIF. */
async function filmer(page: Page, finition: string | null, echelle: number): Promise<Buffer> {
  const boucle = dureeDeLaBoucle(finition);
  const pas = pasDuFilm(finition);
  // Les scripts de la page ont fini de la mettre en place avant le cadrage : la carte ne bouge plus ensuite.
  await page.clock.runFor(1500);
  // Les animations de la feuille de style (la carte flotte, le reflet passe) ne suivent pas l'horloge de la page : elles
  // sont arrêtées, puis posées à l'instant de chaque image.
  const caler = (instant: number) =>
    page.evaluate((a) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = a;
      }
    }, instant);
  await caler(0);
  const boite = await cadrer(page);
  const cx = boite.x + boite.width / 2;
  const cy = boite.y + boite.height / 2;
  const cadre = { x: Math.round(boite.x - MARGE), y: Math.round(boite.y - MARGE), width: Math.round(boite.width + MARGE * 2), height: Math.round(boite.height + MARGE * 2) };
  // Le curseur tourne à la même distance du milieu pour les deux films : l'inclinaison est celle de la carte en hauteur.
  const rayon = Math.min(boite.width, 144) * 0.42;
  const viser = (t: number) => page.mouse.move(cx + Math.cos((t / boucle) * Math.PI * 2) * rayon, cy + Math.sin((t / boucle) * Math.PI * 2) * boite.height * 0.3);
  // L'élan : l'inclinaison rejoint le curseur, qui arrive au départ de la boucle au moment de la première image.
  let t = -ELAN_MS;
  for (; t < 0; t += pas) {
    await viser(t);
    await page.clock.runFor(pas);
  }
  const images: Buffer[] = [];
  for (let i = 0; i < imagesDeLaBoucle(finition); i++, t += pas) {
    await viser(t);
    await page.clock.runFor(pas);
    await caler(t);
    images.push(await page.screenshot({ clip: cadre, omitBackground: true }));
  }
  // Une réduction se fait image par image, avant de les réunir : réduire le film réuni n'en garderait qu'une.
  const encoder = async (largeur: number | null) => {
    const vues = largeur ? await Promise.all(images.map((image) => sharp(image).resize({ width: largeur }).png().toBuffer())) : images;
    return sharp(vues, { join: { animated: true } }).gif({ delay: pas, loop: 0, effort: 7, colours: 128, dither: 0.6, interFrameMaxError: 6 }).toBuffer();
  };
  let gif = await encoder(null);
  if (gif.length > POIDS_MAX) gif = await encoder(Math.round(cadre.width * echelle * 0.75));
  return gif;
}

const debut = Date.now();
const ids = membresAvecCarte();
const insignes = insignesDesFiches();
const cache = join(process.cwd(), CACHE_DES_CARTES);
mkdirSync(cache, { recursive: true });
const fichierIndex = join(cache, INDEX_DES_CARTES);
const gardees = lireIndexDesCartes(existsSync(fichierIndex) ? readFileSync(fichierIndex, "utf8") : null);

/** La version du GIF gardé de chaque membre, par sorte de film ; un GIF absent du cache n'est pas compté. */
const faites: Record<SorteDeFilm, Map<string, string>> = { carte: new Map(), paysage: new Map() };
for (const sorte of SORTES_DE_FILM) for (const c of listeDeLaSorte(gardees, sorte)) if (existsSync(join(cache, fichierDuGif(c.id, sorte)))) faites[sorte].set(c.id, c.v);
const enListe = (versions: ReadonlyMap<string, string>): CarteGif[] => [...versions].map(([id, v]) => ({ id, v }));
/** La liste du cache, réécrite après chaque film : un passage coupé en route ne perd pas ses films. */
const noter = () => writeFileSync(fichierIndex, `${JSON.stringify({ cartes: enListe(faites.carte), paysages: enListe(faites.paysage) } satisfies IndexDesCartes)}\n`);

/** Les versions voulues à ce passage, pour les fiches que le script a pu ouvrir. */
const voulues: Record<SorteDeFilm, Map<string, string>> = { carte: new Map(), paysage: new Map() };
let filmes = 0;
const aLeTemps = () => filmes < PAR_PASSAGE && Date.now() - debut < TEMPS_MS;
if (ids.length > 0) {
  const navigateur = await chromium.launch();
  try {
    const contextes = {} as Record<SorteDeFilm, BrowserContext>;
    for (const sorte of SORTES_DE_FILM) {
      const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", deviceScaleFactor: ECHELLES[sorte] });
      await contexte.route("**/*", (route) => {
        const adresse = new URL(route.request().url());
        const fichier = adresse.origin === ORIGINE ? fichierDe(adresse.pathname) : null;
        if (!fichier) return route.abort();
        return route.fulfill({ body: readFileSync(fichier), contentType: TYPES[extname(fichier).toLowerCase()] ?? "application/octet-stream" });
      });
      // Aucune liaison ouverte non plus : la page ne parle à personne.
      await contexte.routeWebSocket(/.*/, (liaison) => void liaison.close());
      contextes[sorte] = contexte;
    }
    const garder = (id: string, sorte: SorteDeFilm, version: string, gif: Buffer, finition: string | null) => {
      writeFileSync(join(cache, fichierDuGif(id, sorte)), gif);
      faites[sorte].set(id, version);
      noter();
      filmes++;
      console.log(`${sorte === "carte" ? "Carte" : "Paysage"} ${id} : ${(gif.length / 1_000_000).toFixed(1)} Mo, boucle de ${dureeDeLaBoucle(finition) / 1000} s.`);
    };
    for (const id of [...ids.filter((i) => D_ABORD.includes(i)), ...ids.filter((i) => !D_ABORD.includes(i))]) {
      if (Date.now() - debut > ARRET_MS) {
        console.log("Cartes en GIF : temps écoulé, les fiches suivantes attendent le prochain passage.");
        break;
      }
      try {
        // La fiche ouverte une fois donne les deux versions ; elle sert aussi au film de la carte en hauteur.
        const { page, releve } = await ouvrir(contextes.carte, id, "carte", insignes.get(id) ?? null);
        try {
          for (const sorte of SORTES_DE_FILM) voulues[sorte].set(id, releve.versions[sorte]);
          if (faites.carte.get(id) !== releve.versions.carte && aLeTemps()) garder(id, "carte", releve.versions.carte, await filmer(page, releve.finition, ECHELLES.carte), releve.finition);
        } finally {
          await page.close();
        }
        if (faites.paysage.get(id) !== releve.versions.paysage && aLeTemps()) {
          const large = await ouvrir(contextes.paysage, id, "paysage", insignes.get(id) ?? null);
          try {
            garder(id, "paysage", releve.versions.paysage, await filmer(large.page, releve.finition, ECHELLES.paysage), releve.finition);
          } finally {
            await large.page.close();
          }
        }
      } catch (e) {
        console.log(`Carte ${id} : pas filmée (${e instanceof Error ? (e.message.split("\n")[0] ?? "") : String(e)}).`);
      }
    }
  } finally {
    await navigateur.close();
  }
}

// Le cache ne garde que les membres qui ont encore une carte ; la liste dit la version de chaque GIF gardé.
const encore = new Set(ids);
for (const sorte of SORTES_DE_FILM) for (const id of [...faites[sorte].keys()]) if (!encore.has(id)) faites[sorte].delete(id);
const attendus = new Set(SORTES_DE_FILM.flatMap((sorte) => [...faites[sorte].keys()].map((id) => fichierDuGif(id, sorte))));
for (const fichier of readdirSync(cache)) if (fichier.endsWith(".gif") && !attendus.has(fichier)) rmSync(join(cache, fichier), { force: true });
noter();

// Ne sont publiés que les films à jour : un GIF d'avant un changement de tenue ou de finition attend son nouveau film.
const sortie = join(DIST, DOSSIER_DES_CARTES);
rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
let poids = 0;
const enLigne: Record<SorteDeFilm, CarteGif[]> = { carte: [], paysage: [] };
for (const sorte of SORTES_DE_FILM) {
  for (const [id, v] of faites[sorte]) {
    if (voulues[sorte].get(id) !== v) continue;
    const fichier = fichierDuGif(id, sorte);
    const taille = statSync(join(cache, fichier)).size;
    if (poids + taille > POIDS_TOTAL_MAX) continue;
    copyFileSync(join(cache, fichier), join(sortie, fichier));
    poids += taille;
    enLigne[sorte].push({ id, v });
  }
}
writeFileSync(join(sortie, INDEX_DES_CARTES), `${JSON.stringify({ cartes: enLigne.carte, paysages: enLigne.paysage } satisfies IndexDesCartes)}\n`);
console.log(`Cartes en GIF : ${enLigne.carte.length} cartes et ${enLigne.paysage.length} paysages publiés pour ${ids.length} membres (${(poids / 1_000_000).toFixed(1)} Mo), ${filmes} films à ce passage.`);
