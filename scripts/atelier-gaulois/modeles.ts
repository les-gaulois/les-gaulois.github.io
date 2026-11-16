/**
 * L'atelier des modèles uniques du Gaulois : contrôle et planches d'un lot (`supabase/functions/code-discord/modeles/`).
 *
 *   npx tsx scripts/atelier-gaulois/modeles.ts a           contrôle le lot « a » et écrit ses planches
 *   npx tsx scripts/atelier-gaulois/modeles.ts a lezard    le même, plus le modèle « lezard » seul en grand
 *   npx tsx scripts/atelier-gaulois/modeles.ts tous        tous les lots
 *
 * Les planches vont dans `test-results/atelier-modeles/` (ignoré par Git) :
 *   lot-<x>-nus.png        le Gaulois humain nu, puis chaque modèle nu, à 6 pixels par case, sur la page claire du site
 *                          puis sur le bleu nuit des images du robot
 *   lot-<x>-tenues.png     chaque modèle (une rangée) dans sept tenues, à 3 pixels par case, sur la page claire
 *   lot-<x>-nuit.png       les mêmes à 2 pixels par case sur le bleu nuit (taille téléphone)
 *   lot-<x>-discord.png    chaque modèle dans la tenue de départ, sur le décor de nuit de /gaulois, à 4 pixels par case
 *   <id>.png               un modèle à 10 pixels par case : nu avec une grille fine (un trait fort toutes les 8 cases)
 *                          et des points rouges sur le contour du corps humain, puis nu, puis dans deux tenues
 * Le terminal donne pour chacun ses lettres, son nombre de couleurs et les cases du corps humain qu'il laisse vides (là où
 * un objet flotterait), par zone.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ecrirePng } from "../../supabase/functions/code-discord/billets";
import {
  DECOR_HAUTEUR,
  DECOR_LARGEUR,
  GAULOIS_HAUTEUR as H,
  GAULOIS_LARGEUR as L,
  TENUE_DE_DEPART,
  casesDuDecor,
  casesDuGaulois,
  couleursDeBase,
  lireTenue,
  type Tenue,
} from "../../supabase/functions/code-discord/gaulois";
import { LOTS_DE_MODELES, MODELES } from "../../supabase/functions/code-discord/modeles/index";
import { CLE_DU_MODELE, LETTRES_PARTAGEES, MODELE_COULEURS_MAX, type ModeleDuGaulois } from "../../supabase/functions/code-discord/modeles/modele";

/** Le Gaulois dans cette tenue, avec ce modèle à la place du corps humain. */
const casesDuModele = (modele: ModeleDuGaulois, tenue: Tenue) => casesDuGaulois({ ...tenue, [CLE_DU_MODELE]: modele.id });

const SORTIE = join("test-results", "atelier-modeles");
const CLAIR = "#f4f7fc";
const NUIT = "#0a1230";
const SURFACE_CLAIRE = "#e6ecf6";
const SURFACE_NUIT = "#101b45";

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

class Toile {
  readonly rgba: Uint8Array<ArrayBuffer>;
  constructor(
    readonly largeur: number,
    readonly hauteur: number,
    fond: string,
  ) {
    this.rgba = new Uint8Array(new ArrayBuffer(largeur * hauteur * 4));
    this.rect(0, 0, largeur, hauteur, fond);
  }
  rect(x: number, y: number, l: number, h: number, couleur: string): void {
    const [r, g, b] = rgb(couleur);
    for (let j = Math.max(0, y); j < Math.min(this.hauteur, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.largeur, x + l); i++) this.rgba.set([r, g, b, 255], (j * this.largeur + i) * 4);
    }
  }
  cases(x: number, y: number, largeur: number, cases: readonly (string | null)[], echelle: number): void {
    cases.forEach((couleur, i) => {
      if (couleur) this.rect(x + (i % largeur) * echelle, y + Math.floor(i / largeur) * echelle, echelle, echelle, couleur);
    });
  }
  async ecrire(nom: string): Promise<void> {
    writeFileSync(join(SORTIE, nom), await ecrirePng({ largeur: this.largeur, hauteur: this.hauteur, rgba: this.rgba }));
  }
}

/** Le Gaulois sans rien : ni cheveux, ni barbe, ni objet, le visage d'avant. */
const NU: Tenue = {
  peau: "claire",
  cheveux: "aucun",
  teinte_cheveux: "roux",
  barbe: "aucune",
  yeux: "vifs",
  bouche: "sourire",
  cicatrice: "aucune",
  tete: "aucun",
  haut: "aucun",
  bas: "aucun",
  pieds: "nus",
  arme: "aucune",
};

/** Les tenues de la planche : du plus simple au plus riche, avec des coiffes, des capes et des armes de toutes tailles. */
const TENUES: readonly { nom: string; tenue: Tenue }[] = [
  { nom: "nu", tenue: NU },
  { nom: "départ", tenue: TENUE_DE_DEPART },
  {
    nom: "guerrier",
    tenue: { ...NU, cheveux: "longs", teinte_cheveux: "blond", barbe: "grande", yeux: "severe", tete: "casque", haut: "cotte-mailles", bas: "braies-cuir", pieds: "bottes-fer", arme: "epee" },
  },
  {
    nom: "voyageur",
    tenue: { ...NU, cheveux: "longs", teinte_cheveux: "gris", barbe: "courte", tete: "capuche", haut: "cape-voyage", bas: "braies-rayees", pieds: "sandales", arme: "baton-marche" },
  },
  {
    nom: "fête",
    tenue: {
      ...NU,
      cheveux: "crete",
      teinte_cheveux: "garance",
      barbe: "guidon",
      yeux: "rieurs",
      bouche: "grand-sourire",
      cicatrice: "balafre",
      tete: "chapeau-fete",
      haut: "tunique-fete",
      bas: "kilt-carreaux",
      pieds: "poulaines",
      arme: "poulet",
    },
  },
  {
    nom: "légendaire",
    tenue: { ...NU, cheveux: "tresses", teinte_cheveux: "noir", barbe: "fourchue", tete: "casque-or", haut: "armure-doree", bas: "braies-or", pieds: "bottes-or", arme: "epee-or" },
  },
  {
    nom: "royal",
    tenue: { ...NU, cheveux: "boucles", teinte_cheveux: "platine", barbe: "moustache", tete: "couronne", haut: "manteau-hermine", bas: "braies-royales", pieds: "bottes-couronnees", arme: "carnyx" },
  },
];
for (const { nom, tenue } of TENUES) if (!lireTenue(tenue)) throw new Error(`tenue de la planche refusée : ${nom}`);

const HUMAIN_NU = casesDuGaulois(NU);
/** Les couleurs que le modèle peut employer sans les nommer : celles des objets (`FIXES`), et `h` et `H`, les cheveux choisis. */
const COMMUNES: Readonly<Record<string, string>> = couleursDeBase(NU);
const CONTOUR_HUMAIN = "#1a1410";

const ZONES = [
  { nom: "tête", de: 10, a: 31 },
  { nom: "cou et torse", de: 32, a: 46 },
  { nom: "jambes", de: 47, a: 63 },
] as const;

/** Les fautes (qui arrêtent) et les remarques (à regarder) d'un modèle. */
function controler(modele: ModeleDuGaulois, ids: Map<string, string>, lot: string): { fautes: string[]; remarques: string[] } {
  const fautes: string[] = [];
  const remarques: string[] = [];
  if (!/^[a-z][a-z-]{0,39}$/.test(modele.id)) fautes.push(`identifiant « ${modele.id} » : lettres minuscules sans accent et tirets, sans chiffre`);
  const deja = ids.get(modele.id);
  if (deja) fautes.push(`identifiant « ${modele.id} » déjà pris dans le lot ${deja}`);
  ids.set(modele.id, lot);
  if (!modele.nom.trim() || modele.nom.length > 32) fautes.push("nom vide ou de plus de 32 signes");
  if (modele.description.trim().length < 20) fautes.push("description trop courte (une phrase pour qui ne voit pas l'image)");
  const { y, lignes } = modele.corps;
  if (!Number.isInteger(y) || y < 0) fautes.push(`y = ${y} : un entier, 0 ou plus`);
  if (y + lignes.length > H) fautes.push(`le corps descend jusqu'à la rangée ${y + lignes.length - 1} : 63 au plus`);
  lignes.forEach((ligne, i) => {
    if (ligne.length !== L) fautes.push(`rangée ${y + i} : ${ligne.length} cases au lieu de ${L}`);
  });
  if ("k" in modele.couleurs) fautes.push("« k » est le contour commun : il ne se redéfinit pas");
  for (const lettre of LETTRES_PARTAGEES) if (!modele.couleurs[lettre]) fautes.push(`couleur « ${lettre} » obligatoire`);
  for (const [lettre, couleur] of Object.entries(modele.couleurs)) {
    if (!/^#[0-9a-f]{6}$/.test(couleur)) fautes.push(`couleur « ${lettre} » : « ${couleur} » n'est pas au format #rrggbb en minuscules`);
    if (!/^[a-zA-Z]$/.test(lettre)) fautes.push(`lettre « ${lettre} » : une seule lettre de a à z, minuscule ou majuscule`);
  }
  const lettres = new Set<string>();
  for (const ligne of lignes) for (const c of ligne) if (c !== ".") lettres.add(c);
  for (const c of lettres) if (!modele.couleurs[c] && !COMMUNES[c]) fautes.push(`lettre « ${c} » sans couleur`);
  if (lettres.size > MODELE_COULEURS_MAX) fautes.push(`${lettres.size} couleurs : ${MODELE_COULEURS_MAX} au plus, contour compris`);
  const inutiles = Object.keys(modele.couleurs).filter((c) => !lettres.has(c) && !(LETTRES_PARTAGEES as readonly string[]).includes(c));
  if (inutiles.length) remarques.push(`couleurs jamais employées : ${inutiles.join(" ")}`);
  if (!fautes.length) {
    const cases = casesDuModele(modele, NU);
    for (const zone of ZONES) {
      let humain = 0;
      let vides = 0;
      for (let r = zone.de; r <= zone.a; r++) {
        for (let x = 0; x < L; x++) {
          if (!HUMAIN_NU[r * L + x]) continue;
          humain++;
          if (!cases[r * L + x]) vides++;
        }
      }
      if (vides) remarques.push(`${zone.nom} : ${vides} cases du corps humain vides sur ${humain} (un objet y flotterait)`);
    }
  }
  return { fautes, remarques };
}

async function planchesDuLot(nom: string, lot: readonly ModeleDuGaulois[]): Promise<void> {
  if (!lot.length) return;
  // Les nus : l'humain, puis chaque modèle.
  {
    const echelle = 6;
    const pas = (L + 4) * echelle;
    const toile = new Toile(16 + pas * (lot.length + 1), 16 + 2 * (H * echelle + 16), CLAIR);
    toile.rect(0, 16 + H * echelle + 8, toile.largeur, toile.hauteur, NUIT);
    [HUMAIN_NU, ...lot.map((m) => casesDuModele(m, NU))].forEach((cases, i) => {
      toile.cases(16 + i * pas, 16, L, cases, echelle);
      toile.cases(16 + i * pas, 16 + H * echelle + 16, L, cases, echelle);
    });
    await toile.ecrire(`lot-${nom}-nus.png`);
  }
  // Les tenues, en grand sur le clair puis en petit sur la nuit.
  for (const [fichier, fond, surface, echelle] of [
    [`lot-${nom}-tenues.png`, CLAIR, SURFACE_CLAIRE, 3],
    [`lot-${nom}-nuit.png`, NUIT, SURFACE_NUIT, 2],
  ] as const) {
    const pasX = (L + 6) * echelle;
    const pasY = (H + 6) * echelle;
    const toile = new Toile(12 + pasX * TENUES.length, 12 + pasY * lot.length, fond);
    lot.forEach((modele, j) => {
      TENUES.forEach(({ tenue }, i) => {
        toile.rect(12 + i * pasX - 2, 12 + j * pasY - 2, L * echelle + 4, H * echelle + 4, surface);
        toile.cases(12 + i * pasX, 12 + j * pasY, L, casesDuModele(modele, tenue), echelle);
      });
    });
    await toile.ecrire(fichier);
  }
  // L'image de /gaulois : le décor de nuit, le modèle au milieu, les semelles sur le sol.
  {
    const echelle = 4;
    const toile = new Toile((DECOR_LARGEUR * echelle + 12) * Math.min(3, lot.length) + 12, (DECOR_HAUTEUR * echelle + 12) * Math.ceil(lot.length / 3) + 12, "#000000");
    const decor = casesDuDecor();
    lot.forEach((modele, i) => {
      const x0 = 12 + (i % 3) * (DECOR_LARGEUR * echelle + 12);
      const y0 = 12 + Math.floor(i / 3) * (DECOR_HAUTEUR * echelle + 12);
      toile.cases(x0, y0, DECOR_LARGEUR, decor, echelle);
      const ox = Math.floor((DECOR_LARGEUR - L) / 2);
      const oy = 72 - 62;
      casesDuModele(modele, TENUE_DE_DEPART).forEach((couleur, n) => {
        const cx = ox + (n % L);
        const cy = oy + Math.floor(n / L);
        if (couleur && cx >= 0 && cy >= 0 && cx < DECOR_LARGEUR && cy < DECOR_HAUTEUR) toile.rect(x0 + cx * echelle, y0 + cy * echelle, echelle, echelle, couleur);
      });
    });
    await toile.ecrire(`lot-${nom}-discord.png`);
  }
}

async function enGrand(modele: ModeleDuGaulois): Promise<void> {
  const echelle = 10;
  const pas = (L + 4) * echelle;
  const toile = new Toile(16 + pas * 4, 32 + H * echelle, CLAIR);
  // Nu, sur une grille fine, avec le contour du corps humain en points rouges.
  toile.rect(16, 16, L * echelle, H * echelle, "#ffffff");
  toile.cases(16, 16, L, casesDuModele(modele, NU), echelle);
  for (let x = 0; x <= L; x++) toile.rect(16 + x * echelle, 16, x % 8 === 0 ? 2 : 1, H * echelle, x % 8 === 0 ? "#7a86a8" : "#c9d1e3");
  for (let y = 0; y <= H; y++) toile.rect(16, 16 + y * echelle, L * echelle, y % 8 === 0 ? 2 : 1, y % 8 === 0 ? "#7a86a8" : "#c9d1e3");
  HUMAIN_NU.forEach((couleur, n) => {
    if (couleur === CONTOUR_HUMAIN) toile.rect(16 + (n % L) * echelle + 4, 16 + Math.floor(n / L) * echelle + 4, 3, 3, "#ff2e4a");
  });
  const autres = [NU, TENUE_DE_DEPART, (TENUES[2] as { tenue: Tenue }).tenue];
  autres.forEach((tenue, i) => toile.cases(16 + (i + 1) * pas, 16, L, casesDuModele(modele, tenue), echelle));
  await toile.ecrire(`${modele.id}.png`);
}

async function main(): Promise<void> {
  const [quoi = "tous", seul] = process.argv.slice(2);
  mkdirSync(SORTIE, { recursive: true });
  const ids = new Map<string, string>();
  let fautesEnTout = 0;
  for (const [nom, lot] of Object.entries(LOTS_DE_MODELES)) {
    const regarde = quoi === "tous" || quoi === nom;
    for (const modele of lot) {
      const { fautes, remarques } = controler(modele, ids, nom);
      if (!regarde) {
        fautesEnTout += fautes.length;
        continue;
      }
      const lettres = new Set([...modele.corps.lignes.join("")].filter((c) => c !== "."));
      console.log(`${nom} · ${modele.id} (« ${modele.nom} ») : rangées ${modele.corps.y} à ${modele.corps.y + modele.corps.lignes.length - 1}, ${lettres.size} couleurs [${[...lettres].sort().join("")}]`);
      for (const f of fautes) console.log(`   FAUTE : ${f}`);
      for (const r of remarques) console.log(`   remarque : ${r}`);
      fautesEnTout += fautes.length;
    }
    if (regarde && !lot.length) console.log(`${nom} : lot vide`);
  }
  if (fautesEnTout) {
    console.log(`\n${fautesEnTout} faute(s) : planches non écrites.`);
    process.exitCode = 1;
    return;
  }
  for (const [nom, lot] of Object.entries(LOTS_DE_MODELES)) if (quoi === "tous" || quoi === nom) await planchesDuLot(nom, lot);
  if (seul) {
    const modele = MODELES.find((m) => m.id === seul);
    if (!modele) throw new Error(`modèle inconnu : ${seul}`);
    await enGrand(modele);
  }
  console.log(`\nPlanches dans ${SORTIE}/`);
}

await main();
