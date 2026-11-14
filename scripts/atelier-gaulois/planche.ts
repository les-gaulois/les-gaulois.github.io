/**
 * L'atelier de dessin du Gaulois : les planches de contrôle.
 *
 * Mode d'emploi, pour dessiner ou retoucher un objet :
 *   1. Les grilles de `supabase/functions/code-discord/gaulois.ts` (bloc « <dessins> ») font foi : 48 cases de large,
 *      « . » pour une case vide, une lettre par couleur (minuscule : la couleur ; majuscule : son ombre). La lumière vient
 *      d'en haut à gauche : ombres à droite et en bas, lumières (n, y, z) en haut à gauche.
 *   2. Voir une grille avec sa règle, ou la remplacer par celle d'un fichier texte : `grille.ts` (même dossier).
 *   3. Regarder le résultat, toujours porté ET en vignette, aux tailles réelles :
 *        npx tsx scripts/atelier-gaulois/planche.ts            toutes les planches
 *        npx tsx scripts/atelier-gaulois/planche.ts un/dossier  ailleurs que dans test-results/atelier-gaulois/
 *      Les images vont dans un dossier ignoré par Git. L'ordre des objets, écrit dans le terminal, est celui du catalogue.
 *   4. Un nouvel objet s'ajoute aussi au catalogue `OBJETS` et à la liste du serveur (nouvelle migration) : un test compare.
 *      Il se juge assemblé avec les autres : aucune tenue ne doit faire reconnaître un personnage d'une œuvre existante.
 *
 * Les planches :
 *   objets.png            tous les objets en vignette, à la taille des cases du vestiaire, une rangée par emplacement
 *   portes-<emplacement>  chaque objet porté, à 4 pixels par case (ordinateur, Discord) puis à 3 (téléphone)
 *   corps.png             coupes, barbes, peaux, couleurs de cheveux
 *   coiffes.png           chaque coiffe sur chaque coupe, à 2 pixels par case
 *   tenues.png            des tenues complètes, dont la plus riche et la plus simple
 *   discord-<n>.png       l'image de /gaulois telle que Discord la reçoit
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ecrirePng } from "../../supabase/functions/code-discord/billets";
import {
  EMPLACEMENTS_OBJETS,
  GAULOIS_HAUTEUR as H,
  GAULOIS_LARGEUR as L,
  OBJETS,
  PEAUX,
  POILS,
  TENUE_DE_DEPART,
  casesDuGaulois,
  lireTenue,
  pngDuGaulois,
  vignetteDeLObjet,
  type Emplacement,
  type Tenue,
} from "../../supabase/functions/code-discord/gaulois";

const SORTIE = process.argv[2] ?? join("test-results", "atelier-gaulois");
const FOND = "#0a1230";
const SURFACE = "#101b45";
/** Les couleurs des raretés, comme les jetons `--rarete-…` de la feuille de style. */
const RARETES: Readonly<Record<string, string>> = { commun: "#2f8cff", "peu-commun": "#2b3fc4", epique: "#8b3fe0", mystique: "#d9203a", legendaire: "#e0a81c" };
/** Le côté de l'image d'une case du vestiaire (`COTE_IMAGE` de Vestiaire.tsx) : la vignette s'y agrandit 1, 2 ou 3 fois. */
const COTE_IMAGE = 80;

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

class Toile {
  readonly rgba: Uint8Array<ArrayBuffer>;
  constructor(
    readonly largeur: number,
    readonly hauteur: number,
  ) {
    this.rgba = new Uint8Array(new ArrayBuffer(largeur * hauteur * 4));
    this.rect(0, 0, largeur, hauteur, FOND);
  }
  rect(x: number, y: number, l: number, h: number, couleur: string): void {
    const [r, g, b] = rgb(couleur);
    for (let j = Math.max(0, y); j < Math.min(this.hauteur, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.largeur, x + l); i++) {
        this.rgba.set([r, g, b, 255], (j * this.largeur + i) * 4);
      }
    }
  }
  cases(x: number, y: number, largeur: number, cases: readonly (string | null)[], echelle: number): void {
    cases.forEach((couleur, i) => {
      if (couleur) this.rect(x + (i % largeur) * echelle, y + Math.floor(i / largeur) * echelle, echelle, echelle, couleur);
    });
  }
  gaulois(x: number, y: number, tenue: Tenue, echelle: number): void {
    if (!lireTenue(tenue)) throw new Error(`tenue refusée : ${JSON.stringify(tenue)}`);
    this.rect(x, y, L * echelle, H * echelle, SURFACE);
    this.cases(x, y, L, casesDuGaulois(tenue), echelle);
  }
  async ecrire(nom: string): Promise<void> {
    writeFileSync(join(SORTIE, nom), await ecrirePng({ largeur: this.largeur, hauteur: this.hauteur, rgba: this.rgba }));
  }
}

const NU: Tenue = { ...TENUE_DE_DEPART, barbe: "aucune", tete: "aucun", haut: "aucun", bas: "aucun", pieds: "nus", arme: "aucune" };
const SIMPLE: Tenue = { ...TENUE_DE_DEPART, tete: "aucun", arme: "aucune" };
const dessines = (emplacement: Emplacement): string[] => Object.entries(OBJETS[emplacement]).filter(([, objet]) => objet.dessin).map(([id]) => id);

/** Tous les objets en vignette, dans leur case colorée selon la rareté, à la taille du vestiaire. */
async function plancheDesVignettes(): Promise<void> {
  const cote = 104;
  const pas = cote + 8;
  const rangees = EMPLACEMENTS_OBJETS.map(dessines);
  const toile = new Toile(16 + Math.max(...rangees.map((r) => r.length)) * pas, 16 + rangees.length * pas);
  rangees.forEach((ids, j) => {
    ids.forEach((id, i) => {
      const emplacement = EMPLACEMENTS_OBJETS[j] as Emplacement;
      const vignette = vignetteDeLObjet(emplacement, id);
      if (!vignette) return;
      const x = 16 + i * pas;
      const y = 16 + j * pas;
      toile.rect(x, y, cote, cote, RARETES[OBJETS[emplacement][id]?.rarete ?? ""] ?? "#5469ae");
      toile.rect(x + 4, y + 4, cote - 8, cote - 8, SURFACE);
      const echelle = Math.max(1, Math.min(3, Math.floor(COTE_IMAGE / Math.max(vignette.largeur, vignette.hauteur))));
      toile.cases(x + Math.round((cote - vignette.largeur * echelle) / 2), y + Math.round((cote - vignette.hauteur * echelle) / 2), vignette.largeur, vignette.cases, echelle);
    });
  });
  await toile.ecrire("objets.png");
}

/** Une liste de tenues, en rangées, à 4 pixels par case (ou à une autre échelle) ; puis, si demandé, les mêmes à 3. */
async function plancheDeTenues(nom: string, tenues: readonly Tenue[], parRangee: number, avecTelephone = false, echelle = 4): Promise<void> {
  const marge = 12;
  const rangees = Math.ceil(tenues.length / parRangee);
  const hauteurRangee = H * echelle + marge + (avecTelephone ? H * 3 + marge : 0);
  const toile = new Toile(marge + Math.min(parRangee, tenues.length) * (L * echelle + marge), marge + rangees * hauteurRangee);
  tenues.forEach((tenue, i) => {
    const x = marge + (i % parRangee) * (L * echelle + marge);
    const y = marge + Math.floor(i / parRangee) * hauteurRangee;
    toile.gaulois(x, y, tenue, echelle);
    if (avecTelephone) toile.gaulois(x + (L * echelle - L * 3) / 2, y + H * echelle + marge, tenue, 3);
  });
  await toile.ecrire(nom);
}

mkdirSync(SORTIE, { recursive: true });
await plancheDesVignettes();

for (const emplacement of EMPLACEMENTS_OBJETS) {
  const ids = dessines(emplacement);
  console.log(`portes-${emplacement}.png : ${ids.join(", ")}`);
  await plancheDeTenues(`portes-${emplacement}.png`, ids.map((id) => ({ ...SIMPLE, [emplacement]: id })), 6, true);
}

const coupes = Object.keys(OBJETS.cheveux);
const coiffes = dessines("tete");
console.log(`corps.png : coupes (${coupes.join(", ")}), barbes, peaux, couleurs de cheveux`);
await plancheDeTenues(
  "corps.png",
  [
    ...coupes.map((cheveux) => ({ ...NU, cheveux })),
    ...Object.keys(OBJETS.barbe).map((barbe) => ({ ...NU, barbe, teinte_cheveux: "chatain" })),
    ...Object.keys(PEAUX).map((peau) => ({ ...NU, peau, barbe: "courte", cheveux: "longs", teinte_cheveux: "noir" })),
    ...Object.keys(POILS).map((teinte_cheveux) => ({ ...NU, teinte_cheveux, barbe: "grande", cheveux: "tresses" })),
  ],
  5,
);
console.log(`coiffes.png : une rangée par coupe (${coupes.join(", ")}), une colonne par coiffe (${coiffes.join(", ")})`);
await plancheDeTenues("coiffes.png", coupes.flatMap((cheveux) => coiffes.map((tete) => ({ ...SIMPLE, cheveux, tete, teinte_cheveux: "blond" }))), coiffes.length, false, 2);

/** Des tenues complètes : le départ, tout en gratuit, une par rareté montante, puis des mélanges. */
const TENUES: readonly Tenue[] = [
  TENUE_DE_DEPART,
  { ...NU, peau: "doree", cheveux: "longs", teinte_cheveux: "blond", barbe: "longue-moustache", tete: "bonnet", haut: "chemise", bas: "braies", pieds: "bottes", arme: "gourdin" },
  { ...NU, peau: "mate", cheveux: "tresses", teinte_cheveux: "noir", barbe: "courte", tete: "chapeau-paille", haut: "tunique-rouge", bas: "braies-bleues", pieds: "sandales", arme: "baguette" },
  { ...NU, peau: "foncee", cheveux: "herisses", teinte_cheveux: "gris", barbe: "grande", tete: "capuche", haut: "veste-peau", bas: "braies-rayees", pieds: "bottes-fourrees", arme: "hache" },
  { ...NU, peau: "mate", cheveux: "courts", teinte_cheveux: "blanc", barbe: "longue-moustache", tete: "casque", haut: "cotte-mailles", bas: "braies-cuir", pieds: "bottes-fer", arme: "epee" },
  { ...NU, peau: "doree", cheveux: "longs", teinte_cheveux: "roux", barbe: "grande", tete: "casque-crete", haut: "cape-chef", bas: "jambieres-bronze", pieds: "bottes-ecarlates", arme: "bouclier-bronze" },
  { ...NU, peau: "claire", cheveux: "aucun", teinte_cheveux: "chatain", barbe: "moustache", tete: "casque-or", haut: "torque-or", bas: "braies-or", pieds: "bottes-or", arme: "carnyx" },
  { ...NU, peau: "claire", cheveux: "tresses", teinte_cheveux: "blond", tete: "slip", haut: "maillot-clan", bas: "braies-rayees", pieds: "sandales", arme: "poulet" },
  { ...NU, peau: "foncee", cheveux: "courts", teinte_cheveux: "noir", barbe: "courte", tete: "marmite", haut: "chemise", bas: "braies-carreaux", pieds: "bottes", arme: "poele" },
  { ...NU, peau: "doree", cheveux: "herisses", teinte_cheveux: "roux", barbe: "moustache", tete: "couronne", haut: "torque-or", bas: "jambieres-bronze", pieds: "bottes-or", arme: "epee-or" },
  { ...NU, peau: "mate", cheveux: "longs", teinte_cheveux: "chatain", barbe: "aucune", tete: "casque-armee", haut: "veste-peau", bas: "braies-cuir", pieds: "bottes-fer", arme: "lance-patates" },
  { ...NU, peau: "claire", cheveux: "longs", teinte_cheveux: "blanc", barbe: "grande", tete: "tricorne", haut: "cape-chef", bas: "braies-or", pieds: "bottes-ecarlates", arme: "masse" },
];
await plancheDeTenues("tenues.png", TENUES, 6, true);

for (const [n, tenue] of [TENUES[0], TENUES[4], TENUES[6]].entries()) {
  if (tenue) writeFileSync(join(SORTIE, `discord-${n}.png`), await pngDuGaulois(tenue));
}
console.log(`Planches écrites dans ${SORTIE}`);
