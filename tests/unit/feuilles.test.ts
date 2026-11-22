import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FEUILLES, feuillesDeLaPage } from "../../src/lib/feuilles";
import {
  attributsHtmlDe,
  DOSSIER_FEUILLES,
  ENTETE_MORCEAU,
  exigences,
  feuilleSansEntete,
  fichiersDuDossier,
  graphe,
  jetonsDuFichier,
  jetonsDuGraphe,
  MOTS_OUTILS,
  peutToucher,
  present,
  regles,
  remplie,
  sansCommentaires,
  type Exigence,
  type Jetons,
  type PasUneClasse,
  type Regle,
} from "./feuilles-graphe";

// La feuille de style en morceaux (src/lib/feuilles.ts, docs/DESIGN.md « Les feuilles de style, en morceaux ») : chaque
// page ne charge que ses morceaux, dans l'ordre de la cascade. Ce test vérifie, sans construire le site, qu'aucune règle
// d'un morceau qu'une page ne charge pas ne peut toucher ce qu'elle affiche, y compris ce qu'on ne voit qu'une fois
// connecté (menu du compte, appels du QG, barre « voir comme un joueur », compagnon habillé…) : il lit tout ce que la page
// assemble, de proche en proche, et chaque nom que ce code peut écrire.

const RACINE = resolve(".");
const rel = (f: string) => relative(RACINE, f).replace(/\\/g, "/");

/**
 * Des mots que ces fichiers écrivent sans jamais en faire une classe de la page, relus un par un : sans cette liste, le
 * test croirait que la page peut porter ces classes et demanderait le morceau qui les dessine. Un mot ajouté ici se relit
 * dans le fichier, à la main ; le test refuse une ligne dont le mot a disparu du fichier.
 */
const PAS_DES_CLASSES: PasUneClasse[] = [
  { fichier: "src/scripts/compagnon.ts", mots: ["embed"], raison: "un nom de balise (BALISES_D_IMAGE), comparé à tagName" },
  {
    fichier: "src/lib/gazette-image.ts",
    mots: ["cases", "pixels"],
    raison: "la police « cases » et l'unité « pixels » de l'image de la gazette, dessinée à la construction pour Discord",
  },
  { fichier: "src/lib/alliance/capture.ts", mots: ["pixels"], raison: "l'unité écrite sur l'image capturée de la carte de l'alliance" },
  { fichier: "src/lib/alliance/textes.ts", mots: ["pixels"], raison: "un libellé de la carte de l'alliance, écrit comme texte" },
  { fichier: "src/components/compte/QgApp.tsx", mots: ["outils"], raison: "ce que le QG relit après une action (« qg », « outils » ou « tout »)" },
  { fichier: "src/pages/boutique.astro", mots: ["village"], raison: "l'adresse /village, où l'ancienne page de la boutique renvoie" },
  { fichier: "src/pages/membres/[id].astro", mots: ["bannieres"], raison: "le dossier des images des bannières, /bannieres/, dans l'adresse du fond des scènes" },
];

/** Les pages du site (les .astro de src/pages) et leur route, comme `Astro.routePattern`. */
function pages(): { fichier: string; route: string }[] {
  const sortie: { fichier: string; route: string }[] = [];
  const parcourir = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (p.endsWith(".astro")) sortie.push({ fichier: resolve(p), route: `/${rel(p).replace(/^src\/pages\//, "").replace(/\.astro$/, "").replace(/(^|\/)index$/, "")}` });
    }
  };
  parcourir("src/pages");
  return sortie.sort((a, b) => a.route.localeCompare(b.route));
}

const MORCEAUX = FEUILLES.map((f) => f.fichier);
const TEXTES = new Map(MORCEAUX.map((f) => [f, readFileSync(join(DOSSIER_FEUILLES, f), "utf8").replace(/\r\n/g, "\n")]));
const REGLES = new Map<string, Regle[]>(MORCEAUX.map((f) => [f, regles(TEXTES.get(f)!)]));
const AUTRES = [...fichiersDuDossier("content"), ...fichiersDuDossier("config")];
const BASE = resolve("src/layouts/Base.astro");

/** Ce qu'une page peut afficher : les jetons de son graphe et de Base.astro, contenus et configuration compris. */
const dejaLues = new Map<string, Jetons>();
function jetonsDeLaPage(fichier: string): Jetons {
  let j = dejaLues.get(fichier);
  if (!j) dejaLues.set(fichier, (j = jetonsDuGraphe(graphe([fichier, BASE]), AUTRES, RACINE, PAS_DES_CLASSES)));
  return j;
}
/** Lire tout ce que chaque page assemble prend quelques secondes, davantage quand les autres tests tournent en même temps. */
const LONG = 60_000;

/** Les fichiers qui permettent une exigence, pour le message d'erreur. */
function sourcesDe(e: Exigence, fichiers: string[]): string[] {
  if (e.genre === "ou") return e.branches.flat().flatMap((x) => sourcesDe(x, fichiers));
  const nom = e.genre === "valeur" ? e.valeur : e.nom;
  return fichiers.filter((f) => {
    const j = jetonsDuFichier(f);
    return present(nom, j) || present(nom, j.ids) || present(nom, j.valeurs);
  });
}

describe("les morceaux de la feuille de style", () => {
  it("sont, dans le dossier, ceux de src/lib/feuilles.ts, numérotés dans l'ordre de la cascade", () => {
    const dossier = readdirSync(DOSSIER_FEUILLES).filter((f) => f.endsWith(".css")).sort();
    expect(dossier).toEqual(MORCEAUX);
    expect([...MORCEAUX].sort()).toEqual(MORCEAUX);
    expect(existsSync("src/styles/global.css"), "l'ancienne feuille unique est revenue").toBe(false);
  });

  it("le socle seul passe par Tailwind en entier ; chaque autre morceau le lit en référence, sans rien y ajouter", () => {
    const socle = sansCommentaires(TEXTES.get("01-socle.css")!);
    expect(socle).toMatch(/@import "tailwindcss";/);
    expect(socle).toMatch(/@theme \{/);
    for (const f of MORCEAUX.slice(1)) {
      const texte = TEXTES.get(f)!;
      expect(texte, `${f} : son en-tête`).toMatch(ENTETE_MORCEAU);
      // Une directive de Tailwind hors du socle serait compilée à part : un @theme n'y écrirait aucun jeton, un @import
      // "tailwindcss" écrirait une seconde fois toutes les classes.
      const reste = sansCommentaires(feuilleSansEntete(texte));
      expect(reste, `${f} : une directive de Tailwind hors du socle`).not.toMatch(/@(import|reference|theme|tailwind|source|plugin|config|utility|custom-variant)\b/);
    }
  });

  it("chaque morceau commence par le titre d'une section, que ses règles suivent", () => {
    for (const f of MORCEAUX.slice(1)) expect(feuilleSansEntete(TEXTES.get(f)!), f).toMatch(/^\/\* ---------- .+ ---------- \*\/\n/);
  });

  it("les @property et les @font-face sont dans le socle, et chaque @keyframes n'a qu'un nom à lui", () => {
    // Une @property ou une police vaut pour toute la page : dans le socle, aucune page n'en manque. Un nom d'animation
    // écrit deux fois prendrait la dernière définition chargée, qui pourrait changer d'une page à l'autre.
    const noms = new Map<string, string[]>();
    for (const [f, rs] of REGLES) {
      for (const r of rs) {
        if ((r.genre === "property" || r.genre === "font-face") && f !== "01-socle.css") throw new Error(`${f}:${r.ligne} : @${r.genre} hors du socle`);
        if (r.genre === "keyframes") noms.set(r.nom, [...(noms.get(r.nom) ?? []), `${f}:${r.ligne}`]);
      }
    }
    expect([...noms].filter(([, l]) => l.length > 1)).toEqual([]);
  });

  it("chaque page charge les morceaux de toutes les pages, et les siens dans l'ordre de la cascade", () => {
    const communs = FEUILLES.filter((f) => f.pages === "toutes").map((f) => f.fichier);
    expect(communs[0]).toBe("01-socle.css");
    const routes = new Set(pages().map((p) => p.route));
    for (const f of FEUILLES) if (f.pages !== "toutes") for (const r of f.pages) expect(routes.has(r), `${f.fichier} : la page ${r} n'existe pas`).toBe(true);
    for (const { route } of pages()) {
      const liste = feuillesDeLaPage(route);
      for (const c of communs) expect(liste, route).toContain(c);
      const indices = liste.map((f) => MORCEAUX.indexOf(f));
      expect(indices, `${route} : hors de l'ordre de la cascade`).toEqual([...indices].sort((a, b) => a - b));
    }
    // La Direction montre aussi, en aperçu, les écrans des autres pages : elle charge tout.
    expect(feuillesDeLaPage("/direction")).toEqual(MORCEAUX);
  });

  it("aucune règle d'un morceau qu'une page ne charge pas ne peut toucher ce qu'elle affiche", () => {
    const fautes = new Map<string, string[]>();
    for (const { fichier, route } of pages()) {
      const charges = new Set(feuillesDeLaPage(route));
      const j = jetonsDeLaPage(fichier);
      const html = attributsHtmlDe(route, readFileSync(fichier, "utf8"));
      const g = graphe([fichier, BASE]);
      const fichiers = [...g.code, ...AUTRES];
      for (const morceau of MORCEAUX) {
        if (charges.has(morceau)) continue;
        for (const r of REGLES.get(morceau)!) {
          if (r.genre !== "style") continue;
          for (const s of r.selecteurs) {
            if (!peutToucher(s, j, html)) continue;
            const pourquoi = exigences(s)
              .filter((e) => remplie(e, j, html))
              .map((e) => `${JSON.stringify(e)} ← ${sourcesDe(e, fichiers).map(rel).slice(0, 3).join(", ") || "<html>"}`);
            const cle = `${route} ne charge pas ${morceau}`;
            fautes.set(cle, [...(fautes.get(cle) ?? []), `« ${s} » (ligne ${r.ligne}) : ${pourquoi.join(" ; ") || "aucune classe ni attribut demandé"}`]);
          }
        }
      }
    }
    // Une faute : ajouter la page au morceau dans src/lib/feuilles.ts, ou déplacer la règle (et sa section) dans un morceau
    // que la page charge, en gardant l'ordre ; si le mot n'est pas une classe de la page, l'ajouter à PAS_DES_CLASSES.
    expect([...fautes].map(([cle, l]) => `${cle}, mais ${l.length} règle(s) peuvent la toucher, dont ${l.slice(0, 2).join(" | ")}`)).toEqual([]);
  }, LONG);

  it("les animations qu'une page peut lancer ont leur @keyframes dans un morceau qu'elle charge", () => {
    const ou = new Map<string, string>();
    for (const [f, rs] of REGLES) for (const r of rs) if (r.genre === "keyframes") ou.set(r.nom, f);
    const fautes: string[] = [];
    for (const { fichier, route } of pages()) {
      const charges = new Set(feuillesDeLaPage(route));
      const j = jetonsDeLaPage(fichier);
      // Les animations des règles qu'elle charge, et un nom d'animation écrit par son code (style en ligne).
      const noms = new Set<string>();
      for (const f of charges)
        for (const r of REGLES.get(f)!)
          if (r.genre === "style") for (const d of r.corps.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)) for (const m of d[1]!.matchAll(/[A-Za-z_][\w-]*/g)) noms.add(m[0]);
      for (const [nom, f] of ou) if ((noms.has(nom) || j.mots.has(nom)) && !charges.has(f)) fautes.push(`${route} : l'animation ${nom} est dans ${f}, que la page ne charge pas`);
    }
    expect(fautes).toEqual([]);
  }, LONG);

  it("Tailwind relit les morceaux comme ses sources : un jeton de @theme qu'un seul morceau emploie reste écrit", () => {
    // Tailwind n'écrit dans le socle un jeton de @theme que s'il le voit employé : par var() dans le socle, par une classe
    // (text-ally), ou parce qu'il lit `--rarete-epique` dans un fichier du projet. Il lit tous les fichiers que Git
    // n'ignore pas, ces morceaux compris : c'est ce qui garde les jetons des raretés, que seuls le village et la Direction
    // emploient. Ignorer ce dossier (.gitignore) les ferait disparaître de toutes les pages.
    const ignores = readFileSync(".gitignore", "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    for (const l of ignores) expect(/(^|\/)(src|styles|feuilles)(\/|$)|\.css$|^\*$/.test(l), `.gitignore : ${l}`).toBe(false);
    const socle = TEXTES.get("01-socle.css")!;
    const theme = /@theme \{([\s\S]*?)\n\}/.exec(socle)![1]!;
    const jetons = [...theme.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!);
    // Chaque jeton du thème est employé quelque part dans la feuille ou le code : sinon, Tailwind ne l'écrit pas.
    const tout = [...TEXTES.values()].join("\n") + fichiersDuDossier("src").filter((f) => /\.(ts|tsx|astro)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const v of jetons) expect(tout.split(v).length - 1, `${v} n'est employé nulle part`).toBeGreaterThan(1);
  });

  it("les attributs de <html> ne viennent que de Base.astro, selon la règle que le test applique", () => {
    // Le test connaît, page par page, data-theme, data-ecran, data-ambiance, data-console et data-lettres (attributsHtmlDe) :
    // il faut que Base.astro les pose toujours ainsi, et que personne d'autre ne les écrive.
    const base = readFileSync(BASE, "utf8");
    for (const ligne of [
      "data-theme={theme}",
      "data-ecran={cadre}",
      "data-ambiance={ambiance}",
      'data-console={ambiance === "console" ? "terminal" : undefined}',
      'data-lettres={lettresOnciale ? "onciale" : undefined}',
      'const lettresOnciale = !["/qg", "/direction"].includes(path);',
    ])
      expect(base, ligne).toContain(ligne);
    const ecrivent = fichiersDuDossier("src")
      .filter((f) => f !== BASE && /\.(ts|tsx|astro)$/.test(f))
      .filter((f) => {
        const t = readFileSync(f, "utf8");
        return (
          /\sdata-(theme|ecran|ambiance|lettres)=|\sdata-console=/.test(t) ||
          /dataset\.(theme|ecran|ambiance|console|lettres)\s*=[^=]/.test(t) ||
          /setAttribute\(\s*["']data-(theme|ecran|ambiance|console|lettres)["']/.test(t)
        );
      })
      .map(rel);
    expect(ecrivent).toEqual([]);
  });

  it("les mots-outils des phrases ne sont ni des classes ni des valeurs de la feuille", () => {
    const noms = new Set<string>();
    for (const rs of REGLES.values())
      for (const r of rs)
        if (r.genre === "style")
          for (const s of r.selecteurs)
            for (const e of exigences(s).flatMap(function aplatir(x: Exigence): Exigence[] {
              return x.genre === "ou" ? x.branches.flat().flatMap(aplatir) : [x];
            }))
              noms.add(e.genre === "valeur" ? e.valeur : e.genre === "ou" ? "" : e.nom);
    expect([...MOTS_OUTILS].filter((m) => noms.has(m))).toEqual([]);
  });

  it("chaque mot relu de PAS_DES_CLASSES est encore écrit par son fichier", () => {
    for (const { fichier, mots } of PAS_DES_CLASSES) {
      expect(existsSync(fichier), fichier).toBe(true);
      const j = jetonsDuFichier(resolve(fichier));
      for (const m of mots) expect(j.mots.has(m), `${fichier} : ${m}`).toBe(true);
    }
  });
});
