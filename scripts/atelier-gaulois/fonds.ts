/**
 * L'atelier des fonds d'objets (`src/lib/village/fonds-objets/`) : des planches pour juger chaque scène aux tailles où les
 * écrans la montrent, avec une chose posée devant, et chaque chose sur le fond que la table lui donne.
 *
 *   npx tsx scripts/atelier-gaulois/fonds.ts              toutes les planches
 *   npx tsx scripts/atelier-gaulois/fonds.ts c            seulement les scènes du lot C (et leurs choses)
 *   npx tsx scripts/atelier-gaulois/fonds.ts foret-de-chenes   une seule scène
 *
 * Les images vont dans `.cache/atelier-fonds/` (ignoré par Git) :
 *   scenes-<lot>.png   une rangée par scène du lot : une épée à 2 pixels par case (56 × 38, la case du vestiaire), un
 *                      chapeau à 3 (37 × 25), un familier à 1 (112 × 76), la face d'un booster (62 × 34), la plus petite
 *                      (24 × 20) et la plus grande (128 × 88) taille, puis les rangs 1, 3, 4, 5 et 6 (56 × 38) ;
 *                      chaque vignette agrandie pour être jugée à l'œil, toutes à la même hauteur ;
 *   choses-<scene>.png toutes les choses que la table pose sur cette scène, en cases du vestiaire (56 × 38 à 3 pixels
 *                      par case), dans l'ordre écrit au terminal.
 * Le terminal écrit, par scène, la luminance moyenne à chaque rang (au moins LUMINANCE_MIN) et les choses attribuées.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ecrirePng } from "../../supabase/functions/code-discord/billets";
import { EMPLACEMENTS_OBJETS, OBJETS, TENUE_DE_DEPART, casesDuGaulois, changerModele, vignetteDeLObjet, GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../src/lib/gaulois";
import { vignetteDuFamilier } from "../../src/lib/village/ecran-familiers";
import { FAMILIERS } from "../../src/lib/village/familiers";
import { MODELES } from "../../src/lib/village/modeles";
import { CATALOGUE_DES_SCENES, IDS_DES_SCENES, SCENES, cleDeLObjet, cleDuFamilier, cleDuModele, imageSurFond, sceneDe, type DessinEnCases, type IdDeScene } from "../../src/lib/village/fonds-objets";
import { ATTRIBUTION } from "../../src/lib/village/fonds-objets/attribution";
import { LUMINANCE_MIN, luminanceMoyenne } from "../../src/lib/village/fonds-objets/socle";

const SORTIE = join(".cache", "atelier-fonds");
const choix = (process.argv[2] ?? "").toLowerCase();
const scenesChoisies: IdDeScene[] = IDS_DES_SCENES.filter((id) => !choix || id === choix || CATALOGUE_DES_SCENES[id].lot === choix);
if (scenesChoisies.length === 0) {
  console.error(`Rien à dessiner pour « ${choix} » : un lot (a à f) ou une scène de CATALOGUE_DES_SCENES.`);
  process.exit(1);
}

const FOND_PLANCHE: [number, number, number] = [0x10, 0x1b, 0x45];
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Une planche d'images, sur le bleu nuit du site. */
class Toile {
  readonly rgba: Uint8Array<ArrayBuffer>;
  constructor(
    readonly largeur: number,
    readonly hauteur: number,
  ) {
    this.rgba = new Uint8Array(new ArrayBuffer(largeur * hauteur * 4));
    for (let i = 0; i < largeur * hauteur; i++) this.rgba.set([...FOND_PLANCHE, 255], i * 4);
  }
  poser(d: DessinEnCases, x0: number, y0: number, e: number): void {
    for (let j = 0; j < d.hauteur; j++) {
      for (let i = 0; i < d.largeur; i++) {
        const c = d.cases[j * d.largeur + i];
        if (!c) continue;
        const [r, v, b] = rgb(c);
        for (let dy = 0; dy < e; dy++) {
          for (let dx = 0; dx < e; dx++) {
            const x = x0 + i * e + dx;
            const y = y0 + j * e + dy;
            if (x < 0 || y < 0 || x >= this.largeur || y >= this.hauteur) continue;
            this.rgba.set([r, v, b, 255], (y * this.largeur + x) * 4);
          }
        }
      }
    }
  }
}

/** Un dessin rogné à ses cases pleines. */
function rogner(largeur: number, hauteur: number, cases: readonly (string | null)[]): DessinEnCases {
  let x0 = largeur;
  let y0 = hauteur;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (!cases[y * largeur + x]) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return { largeur: 1, hauteur: 1, cases: [null] };
  const out: (string | null)[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(cases[y * largeur + x] ?? null);
  return { largeur: x1 - x0 + 1, hauteur: y1 - y0 + 1, cases: out };
}

/** Une chose de l'atelier : sa clé, son nom, sa rareté, son dessin, et si elle se pose au sol. */
interface Chose {
  cle: string;
  nom: string;
  rarete: string | null;
  dessin: DessinEnCases | null;
  sol: boolean;
}

const CHOSES: Chose[] = [];
for (const emplacement of EMPLACEMENTS_OBJETS) {
  for (const [id, objet] of Object.entries(OBJETS[emplacement])) {
    if (!objet.dessin || !objet.rarete) continue;
    CHOSES.push({ cle: cleDeLObjet(emplacement, id), nom: objet.nom, rarete: objet.rarete, dessin: vignetteDeLObjet(emplacement, id), sol: false });
  }
}
for (const f of FAMILIERS) CHOSES.push({ cle: cleDuFamilier(f.id), nom: f.nom, rarete: f.rarete, dessin: vignetteDuFamilier(f), sol: true });
for (const m of MODELES) {
  CHOSES.push({ cle: cleDuModele(m.id), nom: m.nom, rarete: m.rarete, dessin: rogner(GAULOIS_LARGEUR, GAULOIS_HAUTEUR, casesDuGaulois(changerModele(TENUE_DE_DEPART, m.id))), sol: true });
}
const chose = (cle: string): Chose => CHOSES.find((c) => c.cle === cle)!;
const EPEE = chose(cleDeLObjet("arme", "epee"));
const CHAPEAU = chose(cleDeLObjet("tete", "tricorne"));
const FAMILIER = chose(cleDuFamilier("chat-tigre")) ?? CHOSES.find((c) => c.cle.startsWith("familier/"))!;

/** Une case d'essai : la taille du fond en cases, l'agrandissement d'atelier, la chose et son rang. */
interface Essai {
  largeur: number;
  hauteur: number;
  vue: number;
  chose: Chose | null;
  rarete?: string;
}
const RANGS = ["commun", "epique", "mystique", "legendaire", "divin"] as const;
const ESSAIS: Essai[] = [
  { largeur: 56, hauteur: 38, vue: 4, chose: EPEE },
  { largeur: 37, hauteur: 25, vue: 6, chose: CHAPEAU },
  { largeur: 112, hauteur: 76, vue: 2, chose: FAMILIER ?? null },
  { largeur: 62, hauteur: 34, vue: 4, chose: CHAPEAU },
  { largeur: 24, hauteur: 20, vue: 6, chose: null },
  { largeur: 128, hauteur: 88, vue: 2, chose: null },
  ...RANGS.map((rarete): Essai => ({ largeur: 56, hauteur: 38, vue: 4, chose: EPEE, rarete })),
];
const MARGE = 8;

mkdirSync(SORTIE, { recursive: true });
let fautes = 0;

const lots = [...new Set(scenesChoisies.map((id) => CATALOGUE_DES_SCENES[id].lot))];
for (const lot of lots) {
  const ids = scenesChoisies.filter((id) => CATALOGUE_DES_SCENES[id].lot === lot);
  const hauteurRangee = Math.max(...ESSAIS.map((e) => e.hauteur * e.vue)) + MARGE;
  const largeurTotale = ESSAIS.reduce((s, e) => s + e.largeur * e.vue + MARGE, MARGE);
  const toile = new Toile(largeurTotale, MARGE + ids.length * hauteurRangee);
  ids.forEach((id, rangee) => {
    let x = MARGE;
    const y = MARGE + rangee * hauteurRangee;
    const lums: string[] = [];
    for (const essai of ESSAIS) {
      const cle = essai.chose?.cle ?? `essai/${id}`;
      const image = imageSurFond(cle, essai.chose?.dessin ?? null, { largeur: essai.largeur, hauteur: essai.hauteur, rarete: essai.rarete ?? essai.chose?.rarete ?? "commun", pose: essai.chose?.sol ? "sol" : "centre", scene: id });
      toile.poser(image, x, y, essai.vue);
      x += essai.largeur * essai.vue + MARGE;
    }
    for (const rarete of RANGS) {
      const l = luminanceMoyenne(imageSurFond(`essai/${id}`, null, { largeur: 56, hauteur: 38, rarete, scene: id }).cases);
      lums.push(`${rarete} ${l.toFixed(2)}`);
      if (l < LUMINANCE_MIN) fautes++;
    }
    const dessinee = SCENES.has(id) ? "" : "  (PAS ENCORE DESSINÉE)";
    console.log(`${id}${dessinee}\n  luminance : ${lums.join(", ")}${lums.some((t) => Number(t.split(" ")[1]) < LUMINANCE_MIN) ? `  TROP SOMBRE (au moins ${LUMINANCE_MIN})` : ""}`);
  });
  const fichier = join(SORTIE, choix && !/^[a-f]$/.test(choix) ? `scenes-${choix}.png` : `scenes-${lot}.png`);
  writeFileSync(fichier, await ecrirePng(toile));
  console.log(`→ ${fichier}`);
}

for (const id of scenesChoisies) {
  const choses = CHOSES.filter((c) => sceneDe(c.cle) === id);
  if (choses.length === 0) continue;
  const colonnes = Math.min(8, choses.length);
  const L = 56;
  const H = 38;
  const vue = 3;
  const toile = new Toile(MARGE + colonnes * (L * vue + MARGE), MARGE + Math.ceil(choses.length / colonnes) * (H * vue + MARGE));
  choses.forEach((c, i) => {
    const image = imageSurFond(c.cle, c.dessin, { largeur: L, hauteur: H, rarete: c.rarete, pose: c.sol ? "sol" : "centre" });
    toile.poser(image, MARGE + (i % colonnes) * (L * vue + MARGE), MARGE + Math.floor(i / colonnes) * (H * vue + MARGE), vue);
  });
  const fichier = join(SORTIE, `choses-${id}.png`);
  writeFileSync(fichier, await ecrirePng(toile));
  console.log(`${id} : ${choses.length} choses → ${fichier}\n  ${choses.map((c) => c.nom).join(" ; ")}`);
}

const sansTable = CHOSES.filter((c) => !(c.cle in ATTRIBUTION));
console.log(`\n${CHOSES.length} choses, dont ${sansTable.length} pas encore dans la table ; ${SCENES.size} scènes dessinées sur ${IDS_DES_SCENES.length}.`);
if (fautes > 0) {
  console.log(`${fautes} fond(s) trop sombre(s).`);
  process.exitCode = 1;
}
