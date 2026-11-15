/**
 * L'atelier des familiers : contrôle et planches d'un lot (`supabase/functions/code-discord/familiers/`).
 *
 *   npx tsx scripts/atelier-gaulois/familiers.ts a            contrôle le lot « a » et écrit ses planches
 *   npx tsx scripts/atelier-gaulois/familiers.ts a renardeau  le même, plus un familier seul en grand
 *   npx tsx scripts/atelier-gaulois/familiers.ts tous         tous les lots
 *
 * Les planches vont dans `test-results/atelier-familiers/` (ignoré par Git) :
 *   lot-<x>-portes.png     chaque familier à droite du Gaulois de départ, 3 pixels par case, sur la page claire du site
 *   lot-<x>-nuit.png       les mêmes sur le bleu nuit des images du robot, 2 pixels par case (taille téléphone)
 *   lot-<x>-detail-1.png   les familiers 1 à 10 à 4 pixels par case (image de /gaulois sur Discord) ; -2 : 11 à 20
 *   lot-<x>-cases.png      chaque familier seul dans une case de la couleur de sa rareté, comme la boutique
 *   <id>.png               un familier seul à 9 pixels par case, avec une grille fine pour compter les cases
 * Le terminal donne pour chacun sa classe de taille (`TAILLES`), sa largeur et sa hauteur en cases, ses lettres.
 * L'ordre des familiers, écrit dans le terminal, est celui du fichier, de gauche à droite puis de haut en bas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ecrirePng } from "../../supabase/functions/code-discord/billets";
import { casesDuGaulois, GAULOIS_HAUTEUR, GAULOIS_LARGEUR, TENUE_DE_DEPART } from "../../supabase/functions/code-discord/gaulois";
import {
  casesDuFamilier,
  defautsDuFamilier,
  FAMILIER_HAUTEUR,
  FAMILIER_LARGEUR,
  TAILLES,
  tailleDuFamilier,
  type Familier,
} from "../../supabase/functions/code-discord/familiers/familier";
import { LOTS_DE_FAMILIERS } from "../../supabase/functions/code-discord/familiers/index";

const SORTIE = join("test-results", "atelier-familiers");
const CLAIR = "#f4f7fc";
const NUIT = "#0a1230";
const RARETES: Readonly<Record<string, string>> = { commun: "#4aa3ff", "peu-commun": "#3a4fe8", epique: "#9b4dff", mystique: "#ff2e4a", legendaire: "#f2b632" };

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

const GAULOIS = casesDuGaulois(TENUE_DE_DEPART);
/** Le Gaulois et son familier : le familier à droite, ses pattes sur la rangée des pieds du Gaulois. */
const LARGEUR_SCENE = GAULOIS_LARGEUR + FAMILIER_LARGEUR - 4;

function scene(toile: Toile, x: number, y: number, familier: Familier, echelle: number): void {
  toile.cases(x, y, GAULOIS_LARGEUR, GAULOIS, echelle);
  toile.cases(x + (GAULOIS_LARGEUR - 4) * echelle, y + (GAULOIS_HAUTEUR - FAMILIER_HAUTEUR) * echelle, FAMILIER_LARGEUR, casesDuFamilier(familier), echelle);
}

async function planchesDuLot(nom: string, lot: readonly Familier[]): Promise<void> {
  if (!lot.length) return;
  const parRangee = 5;
  const rangees = Math.ceil(lot.length / parRangee);
  for (const [fichier, fond, echelle] of [
    [`lot-${nom}-portes.png`, CLAIR, 3],
    [`lot-${nom}-nuit.png`, NUIT, 2],
  ] as const) {
    const marge = 16;
    const l = LARGEUR_SCENE * echelle;
    const h = GAULOIS_HAUTEUR * echelle;
    const toile = new Toile(marge + parRangee * (l + marge), marge + rangees * (h + marge), fond);
    lot.forEach((familier, i) => scene(toile, marge + (i % parRangee) * (l + marge), marge + Math.floor(i / parRangee) * (h + marge), familier, echelle));
    await toile.ecrire(fichier);
  }
  // Chaque moitié du lot à la taille de l'image de /gaulois sur Discord (4 pixels par case), pour juger les détails.
  for (const [partie, debut] of [[1, 0], [2, 10]] as const) {
    const moitie = lot.slice(debut, debut + 10);
    if (!moitie.length) continue;
    const echelle = 4;
    const marge = 16;
    const l = LARGEUR_SCENE * echelle;
    const h = GAULOIS_HAUTEUR * echelle;
    const toile = new Toile(marge + 5 * (l + marge), marge + Math.ceil(moitie.length / 5) * (h + marge), CLAIR);
    moitie.forEach((familier, i) => scene(toile, marge + (i % 5) * (l + marge), marge + Math.floor(i / 5) * (h + marge), familier, echelle));
    await toile.ecrire(`lot-${nom}-detail-${partie}.png`);
  }
  const cote = 2 * FAMILIER_LARGEUR + 16;
  const pas = cote + 10;
  const toile = new Toile(10 + parRangee * pas, 10 + rangees * pas, "#ffffff");
  lot.forEach((familier, i) => {
    const x = 10 + (i % parRangee) * pas;
    const y = 10 + Math.floor(i / parRangee) * pas;
    toile.rect(x, y, cote, cote, RARETES[familier.rarete] ?? "#888888");
    toile.rect(x + 4, y + 4, cote - 8, cote - 8, "#eef2fa");
    toile.cases(x + 8, y + 8, FAMILIER_LARGEUR, casesDuFamilier(familier), 2);
  });
  await toile.ecrire(`lot-${nom}-cases.png`);
}

async function enGrand(familier: Familier): Promise<void> {
  const echelle = 9;
  const toile = new Toile(FAMILIER_LARGEUR * echelle + 1, FAMILIER_HAUTEUR * echelle + 1, "#ffffff");
  for (let i = 0; i <= FAMILIER_LARGEUR; i++) toile.rect(i * echelle, 0, 1, FAMILIER_HAUTEUR * echelle + 1, i % 8 === 0 ? "#9aa6c4" : "#dde3f0");
  for (let j = 0; j <= FAMILIER_HAUTEUR; j++) toile.rect(0, j * echelle, FAMILIER_LARGEUR * echelle + 1, 1, j % 8 === 0 ? "#9aa6c4" : "#dde3f0");
  casesDuFamilier(familier).forEach((couleur, i) => {
    if (couleur) toile.rect((i % FAMILIER_LARGEUR) * echelle + 1, Math.floor(i / FAMILIER_LARGEUR) * echelle + 1, echelle - 1, echelle - 1, couleur);
  });
  await toile.ecrire(`${familier.id}.png`);
}

const [choix = "tous", seul] = process.argv.slice(2);
const noms = choix === "tous" ? Object.keys(LOTS_DE_FAMILIERS) : [choix];
mkdirSync(SORTIE, { recursive: true });
let fautes = 0;
const vus = new Set<string>();
for (const nom of noms) {
  const lot = LOTS_DE_FAMILIERS[nom];
  if (!lot) throw new Error(`lot inconnu « ${nom} » : ${Object.keys(LOTS_DE_FAMILIERS).join(", ")}`);
  console.log(`Lot ${nom} : ${lot.length} familiers`);
  const parTaille = new Map<string, number>();
  lot.forEach((familier, i) => {
    const defauts = defautsDuFamilier(familier);
    if (vus.has(familier.id)) defauts.push("identifiant déjà pris");
    vus.add(familier.id);
    fautes += defauts.length;
    const taille = tailleDuFamilier(familier);
    parTaille.set(taille.classe, (parTaille.get(taille.classe) ?? 0) + 1);
    const couleurs = new Set(familier.dessin.join("").replaceAll(".", "")).size;
    console.log(
      `  ${String(i + 1).padStart(2)}. ${familier.id} — ${familier.nom} (${familier.rarete}, ${taille.classe} ${taille.largeur}×${taille.hauteur}, ${couleurs} lettres)` +
        (defauts.length ? `\n      ✗ ${defauts.join("\n      ✗ ")}` : ""),
    );
  });
  console.log(`  Tailles : ${TAILLES.map((taille) => `${taille.nom.toLowerCase()} ${parTaille.get(taille.id) ?? 0}`).join(", ")}`);
  await planchesDuLot(nom, lot);
  const grand = seul ? lot.find((familier) => familier.id === seul) : undefined;
  if (seul && !grand) console.log(`  « ${seul} » n'est pas dans le lot ${nom}`);
  if (grand) await enGrand(grand);
}
console.log(fautes ? `${fautes} défaut(s) à corriger.` : "Aucun défaut.");
console.log(`Planches dans ${SORTIE}`);
process.exitCode = fautes ? 1 : 0;
