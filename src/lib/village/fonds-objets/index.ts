/**
 * Les fonds d'objets (voir `socle.ts`) : la scène derrière chaque objet, familier et Gaulois unique, et la chose posée
 * dessus. Ce que les écrans appellent : une clé (`cleDeLObjet`, `cleDuFamilier`, `cleDuModele`), puis `imageSurFond` (la
 * chose sur son fond, en une seule grille) ou `fondSeul` (le fond sans la chose, quand l'écran la pose lui-même).
 *
 * Le fond partage le grain de la chose : une case du fond vaut une case du dessin. Un écran qui agrandit l'image d'un
 * nombre entier de fois choisit donc la taille du fond d'après la place et cet agrandissement (`tailleDuFond`).
 */
import { ACCENTS, ATTRIBUTION } from "./attribution";
import { poserLaFinition } from "./finition";
import { SCENES_A } from "./scenes-a";
import { SCENES_B } from "./scenes-b";
import { SCENES_C } from "./scenes-c";
import { SCENES_D } from "./scenes-d";
import { SCENES_E } from "./scenes-e";
import { SCENES_F } from "./scenes-f";
import { TAILLE_MAX, TAILLE_MIN, Planche, adoucir, degrade, graineDe, luminance, type IdDeScene, type ParametresDuFond, type SceneDeFond, type Zone } from "./socle";

export { CATALOGUE_DES_SCENES, IDS_DES_SCENES, type IdDeScene, type SceneDeFond } from "./socle";

/** Toutes les scènes dessinées, par identifiant. */
export const SCENES: ReadonlyMap<IdDeScene, SceneDeFond> = new Map([...SCENES_A, ...SCENES_B, ...SCENES_C, ...SCENES_D, ...SCENES_E, ...SCENES_F].map((s) => [s.id, s]));

/** La clé du fond d'un objet du vestiaire. */
export const cleDeLObjet = (emplacement: string, id: string): string => `objet/${emplacement}/${id}`;
/** La clé du fond d'un familier. */
export const cleDuFamilier = (id: string): string => `familier/${id}`;
/** La clé du fond d'un Gaulois unique. */
export const cleDuModele = (id: string): string => `modele/${id}`;

/** La scène d'une clé absente de la table : la prairie, toujours dessinée. */
const SCENE_PAR_DEFAUT: IdDeScene = "prairie";

/** La scène attribuée à une clé. */
export const sceneDe = (cle: string): IdDeScene => ATTRIBUTION[cle] ?? SCENE_PAR_DEFAUT;

/** Le rang d'une rareté, 1 (commun) à 6 (divin) ; 1 sans rareté. */
export function rangDeLaRarete(rarete: string | null | undefined): number {
  switch (rarete) {
    case "peu-commun":
      return 2;
    case "epique":
      return 3;
    case "mystique":
      return 4;
    case "legendaire":
    case "saison":
      return 5;
    case "divin":
      return 6;
    default:
      return 1;
  }
}

/** Un dessin en cases, rangée par rangée, `null` pour une case vide. */
export interface DessinEnCases {
  largeur: number;
  hauteur: number;
  cases: readonly (string | null)[];
}

/** Le gris bleuté d'une chose sans couleur franche. */
const ACCENT_NEUTRE = "#8a96b8";

/**
 * La couleur propre d'une chose : parmi ses couleurs franches (ni contour presque noir, ni presque blanc, ni grise), la
 * plus présente, les plus vives comptant davantage (la garde dorée d'une épée l'emporte sur son manche brun) ; sinon un
 * gris bleuté.
 */
export function accentDuDessin(dessin: DessinEnCases | null): string {
  if (!dessin) return ACCENT_NEUTRE;
  const poids = new Map<string, number>();
  for (const c of dessin.cases) {
    if (!c || !/^#[0-9a-f]{6}$/i.test(c)) continue;
    const l = luminance(c);
    if (l < 0.04 || l > 0.85) continue;
    const r = parseInt(c.slice(1, 3), 16);
    const v = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    const ecart = Math.max(r, v, b) - Math.min(r, v, b);
    if (ecart < 40) continue;
    const vivacite = ecart / Math.max(r, v, b);
    poids.set(c.toLowerCase(), (poids.get(c.toLowerCase()) ?? 0) + vivacite * vivacite);
  }
  let meilleure = ACCENT_NEUTRE;
  let plus = 0;
  for (const [c, p] of poids) {
    if (p > plus) {
      meilleure = c;
      plus = p;
    }
  }
  return meilleure;
}

/** Une taille de fond ramenée entre la plus petite et la plus grande qu'une scène sait dessiner. */
export function tailleBornee(largeur: number, hauteur: number): { largeur: number; hauteur: number } {
  return {
    largeur: Math.max(TAILLE_MIN.largeur, Math.min(TAILLE_MAX.largeur, Math.round(largeur))),
    hauteur: Math.max(TAILLE_MIN.hauteur, Math.min(TAILLE_MAX.hauteur, Math.round(hauteur))),
  };
}

/**
 * La taille du fond, en cases, pour une place de `placeLargeur` × `placeHauteur` pixels où le dessin est agrandi `echelle`
 * fois : le fond remplit la place au même grain, et jamais moins que le dessin (qui dépasserait sinon).
 */
export function tailleDuFond(placeLargeur: number, placeHauteur: number, echelle: number, dessin: Pick<DessinEnCases, "largeur" | "hauteur"> | null): { largeur: number; hauteur: number } {
  const e = Math.max(1, Math.floor(echelle));
  const l = Math.max(Math.floor(placeLargeur / e), dessin?.largeur ?? 0);
  const h = Math.max(Math.floor(placeHauteur / e), dessin?.hauteur ?? 0);
  return tailleBornee(l, h);
}

/** Ce qu'un écran dit d'un fond à dessiner. */
export interface OptionsDuFond {
  largeur: number;
  hauteur: number;
  /** La rareté de la chose (`commun`… `divin`), qui règle la finition. */
  rarete?: string | null;
  /** La couleur propre de la chose ; sinon celle de la table, sinon un gris bleuté. */
  accent?: string | null;
  /** La place de la chose ; par défaut, le tiers du milieu. */
  zone?: Zone;
  /** La rangée du sol ; par défaut, juste sous la zone. */
  sol?: number;
  /** Une autre scène que celle de la table : pour l'atelier et les tests. */
  scene?: IdDeScene;
}

/** Une scène pas encore dessinée : un ciel clair sur une herbe claire, pour que rien ne manque pendant le dessin. */
function peindreProvisoire(p: Planche, o: ParametresDuFond): void {
  degrade(p, 0, o.sol, "#dce8fb", "#f4f7fd", 3);
  degrade(p, o.sol + 1, p.hauteur - 1, adoucir("#9fd18b", 0.2), "#c7e3b6", 3);
}

/**
 * Les fonds déjà peints, gardés tant que leur nombre total de cases reste sous `CASES_GARDEES_AU_PLUS` (le plus ancien est
 * oublié d'abord) : toutes les cases de la boutique et du vestiaire y tiennent. Chaque couleur n'est gardée qu'une fois
 * (`couleurUnique`) : un fond ne pèse que ses renvois.
 */
const DEJA_PEINTS = new Map<string, readonly string[]>();
const CASES_GARDEES_AU_PLUS = 1_500_000;
let casesGardees = 0;
const COULEURS = new Map<string, string>();
const couleurUnique = (c: string): string => {
  const deja = COULEURS.get(c);
  if (deja !== undefined) return deja;
  COULEURS.set(c, c);
  return c;
};

/** Le fond seul d'une clé, toutes ses cases remplies, sans la chose. Le même pour les mêmes options. */
export function fondSeul(cle: string, options: OptionsDuFond): DessinEnCases {
  const { largeur, hauteur } = tailleBornee(options.largeur, options.hauteur);
  // La zone, ramenée dans la planche : une chose rognée la dépasserait.
  const brute = options.zone ?? { x: Math.floor(largeur / 3), y: Math.floor(hauteur / 4), largeur: Math.ceil(largeur / 3), hauteur: Math.ceil(hauteur / 2) };
  const zx = Math.max(0, Math.min(largeur - 1, brute.x));
  const zy = Math.max(0, Math.min(hauteur - 1, brute.y));
  const zone: Zone = { x: zx, y: zy, largeur: Math.max(1, Math.min(largeur - zx, brute.x + brute.largeur - zx)), hauteur: Math.max(1, Math.min(hauteur - zy, brute.y + brute.hauteur - zy)) };
  const sol = Math.max(0, Math.min(hauteur - 1, options.sol ?? zone.y + zone.hauteur));
  const rang = rangDeLaRarete(options.rarete);
  const accent = options.accent ?? ACCENTS[cle] ?? ACCENT_NEUTRE;
  const scene = options.scene ?? sceneDe(cle);
  const memoire = `${cle}|${scene}|${largeur}x${hauteur}|${zone.x},${zone.y},${zone.largeur},${zone.hauteur}|${sol}|${rang}|${accent}`;
  const garde = DEJA_PEINTS.get(memoire);
  if (garde) return { largeur, hauteur, cases: garde };
  const p = new Planche(largeur, hauteur, "#eef2fa");
  const parametres: ParametresDuFond = { largeur, hauteur, graine: graineDe(cle), accent, rang, zone, sol };
  const dessin = SCENES.get(scene);
  if (dessin) dessin.peindre(p, parametres);
  else peindreProvisoire(p, parametres);
  poserLaFinition(p, parametres);
  // Une case laissée vide par une scène prend la couleur claire de la planche : le fond reste plein.
  const cases = p.cases.map((c) => couleurUnique(c ?? "#eef2fa"));
  while (DEJA_PEINTS.size > 0 && casesGardees + cases.length > CASES_GARDEES_AU_PLUS) {
    const [ancienne, oubliees] = DEJA_PEINTS.entries().next().value!;
    DEJA_PEINTS.delete(ancienne);
    casesGardees -= oubliees.length;
  }
  DEJA_PEINTS.set(memoire, cases);
  casesGardees += cases.length;
  return { largeur, hauteur, cases };
}

/**
 * Où poser la chose : au milieu (un objet), les pieds au sol un peu au-dessus du bas (un familier, un Gaulois unique en
 * entier), ou contre le bas (un buste, coupé à la poitrine).
 */
export type PoseDeLaChose = "centre" | "sol" | "bas";

/**
 * La chose sur son fond, en une seule grille de `largeur` × `hauteur` cases (bornées entre TAILLE_MIN et TAILLE_MAX),
 * posée selon `pose`. Au sol, la marge sous les pieds rétrécit quand la place manque : la tête n'est jamais coupée pour
 * elle. Une chose plus grande que le fond est rognée (au milieu, ou par le haut si elle est posée au sol ou contre le bas) :
 * l'écran choisit une taille qui la contient (`tailleDuFond`).
 */
export function imageSurFond(cle: string, chose: DessinEnCases | null, options: Omit<OptionsDuFond, "zone" | "sol"> & { pose?: PoseDeLaChose }): DessinEnCases {
  const { largeur, hauteur } = tailleBornee(options.largeur, options.hauteur);
  const l = chose?.largeur ?? 0;
  const h = chose?.hauteur ?? 0;
  const marge = options.pose === "bas" ? 0 : Math.min(Math.max(1, Math.round(hauteur * 0.08)), Math.max(0, hauteur - h));
  const x = Math.floor((largeur - l) / 2);
  const y = options.pose === "sol" || options.pose === "bas" ? hauteur - marge - h : Math.floor((hauteur - h) / 2);
  const zone: Zone = chose ? { x, y, largeur: l, hauteur: h } : { x: Math.floor(largeur / 3), y: Math.floor(hauteur / 4), largeur: Math.ceil(largeur / 3), hauteur: Math.ceil(hauteur / 2) };
  const sol = options.pose === "sol" || options.pose === "bas" ? Math.min(hauteur - 1, y + h) : Math.min(hauteur - 1, zone.y + zone.hauteur + 1);
  const accent = options.accent ?? ACCENTS[cle] ?? accentDuDessin(chose);
  const fond = fondSeul(cle, { largeur, hauteur, rarete: options.rarete ?? null, accent, zone, sol, ...(options.scene ? { scene: options.scene } : {}) });
  if (!chose) return fond;
  const cases = fond.cases.slice();
  for (let j = 0; j < h; j++) {
    const yy = y + j;
    if (yy < 0 || yy >= hauteur) continue;
    for (let i = 0; i < l; i++) {
      const xx = x + i;
      const c = chose.cases[j * l + i];
      if (c && xx >= 0 && xx < largeur) cases[yy * largeur + xx] = c;
    }
  }
  return { largeur, hauteur, cases };
}
