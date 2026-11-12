/**
 * Le guerrier de l'accueil en relief (`src/scripts/holo.ts`) : la grille de caractères du logo (`logo-matrice.ts`)
 * devient un nuage de points, chaque caractère à sa profondeur, qui tourne la tête vers le curseur. Décoratif : aucune
 * donnée. Tout ici est un calcul pur, testé. Les longueurs sont en largeurs de logo (1 = la largeur du dessin), les
 * angles en radians ; x va vers la droite, y vers le bas, z vers celui qui regarde.
 *
 * Le relief est un dôme centré sur le cercle du logo, qui s'arrête avant l'anneau. Dans un profil, ce qui est le plus
 * près de celui qui regarde est la joue et l'oreille, au centre ; le nez, les pointes des plumes, des cheveux et de la
 * barbe rejoignent le plan de l'anneau, au fond. Chaque forme est en plus un peu bombée : plus haute en son milieu
 * qu'à son bord.
 *
 * De face, le nuage se projette exactement sur le dessin à plat : le relief ne se voit qu'en tournant, et le logo du
 * clan n'est jamais déformé au repos.
 */

const DEGRE = Math.PI / 180;

export const HOLO = {
  /** La hauteur du dôme : au centre, le guerrier sort d'un cinquième de la largeur du logo. */
  hauteur: 0.2,
  /** Le bombé de chaque forme, en plus du dôme. */
  gonfle: 0.035,
  /** À partir de ce nombre de cases depuis son bord, une forme a tout son bombé. */
  gonfleCases: 3,
  /** Le dôme s'arrête à cette part du rayon du cercle : l'anneau reste à plat, au fond. */
  rayon: 0.82,
  /** La profondeur de l'axe autour duquel le guerrier tourne : un peu devant l'anneau, la tête tourne dans son cercle. */
  pivot: 0.06,
  /** La distance de celui qui regarde : plus elle est courte, plus ce qui approche grossit. */
  camera: 2.4,
  /** Jusqu'où la tête tourne : à droite et à gauche, vers le haut et le bas, et le menton qui se lève. */
  lacetMax: 30 * DEGRE,
  tangageMax: 20 * DEGRE,
  roulisMax: 6 * DEGRE,
  /** À cette distance du centre, la tête a fait la moitié de son chemin : elle réagit surtout de près. */
  portee: 0.8,
  /** Ce qui s'éloigne pâlit, de cette part par largeur de logo, sans descendre sous `pale`. */
  ombre: 2.4,
  pale: 0.42,
  /** L'épaisseur de chaque caractère, et le nombre de tranches qui la dessinent derrière lui : vu de côté, il a un flanc. */
  epaisseur: 0.013,
  tranches: 3,
  /**
   * Un flanc d'un demi-pixel ne se voit pas : il n'est pas dessiné. Il est entier à un pixel et demi. Le seuil est
   * juste au-dessus de ce que donne la flânerie sur un téléphone (10° sur un logo de 224 px) : elle n'en dessine aucun.
   */
  flancMin: 0.55,
  flancPlein: 1.5,
} as const;

/**
 * L'œil du guerrier : une fente sombre, penchée vers le nez. Mesuré sur le logo envoyé par le pilote le 11 novembre
 * 2026 (`public/brand/tete.png`), en parts de la largeur depuis le coin haut gauche. Si le logo change, mesurer de
 * nouveau : `oeilLibre` et son test le signalent, et la page n'allume pas de regard là où il n'y a plus de fente.
 */
export const OEIL = {
  x: 0.6986,
  y: 0.5688,
  /** La direction de la fente, du coin arrière de l'œil vers le nez. */
  axe: [0.933, 0.361] as const,
  /** Jusqu'où la pupille glisse le long de la fente, et en travers. */
  course: 0.036,
  travers: 0.0035,
  /** Le rayon de la pupille, lueur comprise. */
  rayon: 0.016,
  /** À cette distance de l'œil, le regard a fait la moitié de son chemin. */
  portee: 0.35,
} as const;

/** L'orientation de la tête : à droite (lacet), vers le haut (tangage), le nez qui descend (roulis). */
export interface Pose {
  lacet: number;
  tangage: number;
  roulis: number;
}

/** Les caractères du logo dans l'espace, au repos : `z` se compte depuis l'axe de rotation. */
export interface Nuage {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
}

/** Le nuage vu par celui qui regarde : la place de chaque caractère, sa taille par rapport au repos, et ce dont il a avancé. */
export interface Projection {
  x: Float32Array;
  y: Float32Array;
  echelle: Float32Array;
  avance: Float32Array;
}

export const projectionDe = (n: number): Projection => ({ x: new Float32Array(n), y: new Float32Array(n), echelle: new Float32Array(n), avance: new Float32Array(n) });

/**
 * Pour chaque case pleine, sa distance en cases à la case vide la plus proche (1 pour une case du bord d'une forme) ;
 * 0 pour une case vide. Le dehors de la grille compte comme vide. Deux passages, pas de 1 et de 1,4 en diagonale.
 */
export function distanceAuBord(plein: ArrayLike<number>, colonnes: number, lignes: number): Float32Array {
  const loin = colonnes + lignes;
  const d = new Float32Array(colonnes * lignes);
  const lu = (x: number, y: number): number => (x < 0 || y < 0 || x >= colonnes || y >= lignes ? 0 : (d[y * colonnes + x] ?? 0));
  for (let i = 0; i < d.length; i++) d[i] = plein[i] ? loin : 0;
  for (let y = 0; y < lignes; y++) {
    for (let x = 0; x < colonnes; x++) {
      const i = y * colonnes + x;
      if (!plein[i]) continue;
      d[i] = Math.min(d[i] ?? 0, lu(x - 1, y) + 1, lu(x, y - 1) + 1, lu(x - 1, y - 1) + 1.4, lu(x + 1, y - 1) + 1.4);
    }
  }
  for (let y = lignes - 1; y >= 0; y--) {
    for (let x = colonnes - 1; x >= 0; x--) {
      const i = y * colonnes + x;
      if (!plein[i]) continue;
      d[i] = Math.min(d[i] ?? 0, lu(x + 1, y) + 1, lu(x, y + 1) + 1, lu(x + 1, y + 1) + 1.4, lu(x - 1, y + 1) + 1.4);
    }
  }
  return d;
}

/**
 * La profondeur de chaque case pleine du logo, en largeurs de logo : 0 au fond (le plan de l'anneau), au plus
 * `hauteur + gonfle` ; 0 pour une case vide. Le cercle du logo se lit sur le dessin : sa largeur est celle des cases
 * pleines, et son haut la première rangée pleine (le bas du cercle est caché par les cheveux et la barbe).
 */
export function reliefDe(plein: ArrayLike<number>, colonnes: number, lignes: number): Float32Array {
  const relief = new Float32Array(colonnes * lignes);
  let gauche = colonnes;
  let droite = -1;
  let haut = lignes;
  for (let i = 0; i < relief.length; i++) {
    if (!plein[i]) continue;
    const x = i % colonnes;
    const y = Math.floor(i / colonnes);
    if (x < gauche) gauche = x;
    if (x > droite) droite = x;
    if (y < haut) haut = y;
  }
  if (droite < 0) return relief;
  const rayon = (droite - gauche + 1) / 2;
  const cx = gauche + rayon;
  const cy = haut + rayon;
  const bord = distanceAuBord(plein, colonnes, lignes);
  for (let i = 0; i < relief.length; i++) {
    if (!plein[i]) continue;
    const d = Math.hypot((i % colonnes) + 0.5 - cx, Math.floor(i / colonnes) + 0.5 - cy) / (rayon * HOLO.rayon);
    const dome = d < 1 ? 1 - d * d : 0;
    const bombe = Math.sqrt(Math.min(1, (bord[i] ?? 0) / HOLO.gonfleCases));
    relief[i] = HOLO.hauteur * dome + HOLO.gonfle * bombe;
  }
  return relief;
}

/**
 * Un point du dessin (en parts de la largeur depuis le coin haut gauche) à la profondeur `relief`, placé dans l'espace
 * au repos. Il est rapproché de l'axe d'autant qu'il est près de celui qui regarde : vu de face, il retombe ainsi
 * exactement à sa place sur le dessin à plat.
 */
export function placer(u: number, v: number, relief: number): [number, number, number] {
  const z = relief - HOLO.pivot;
  const k = (HOLO.camera - z) / HOLO.camera;
  return [(u - 0.5) * k, (v - 0.5) * k, z];
}

/**
 * Le nuage des cases `indices` (numéro de case, rangée par rangée) d'une grille carrée de `colonnes` cases de côté,
 * reculé de `recul` : la tranche d'un caractère est le même nuage, plus en arrière (voir `decalageTranche`).
 */
export function nuageDe(indices: ArrayLike<number>, relief: ArrayLike<number>, colonnes: number, recul = 0): Nuage {
  const n = indices.length;
  const nuage: Nuage = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const c = indices[i] ?? 0;
    const [x, y, z] = placer(((c % colonnes) + 0.5) / colonnes, (Math.floor(c / colonnes) + 0.5) / colonnes, (relief[c] ?? 0) - recul);
    nuage.x[i] = x;
    nuage.y[i] = y;
    nuage.z[i] = z;
  }
  return nuage;
}

/** De combien la tranche `k` est en arrière de la face (1 : juste derrière elle ; la dernière : de toute l'épaisseur). */
export const reculTranche = (k: number): number => (HOLO.epaisseur * k) / HOLO.tranches;

/**
 * Le flanc d'un caractère : des copies de sa face, de plus en plus en arrière sur son épaisseur. De face, chaque copie
 * est exactement derrière son caractère ; quand la tête tourne, une copie se projette comme la face entière décalée
 * d'un même vecteur, à moins de trois quarts de pixel près : 0,67 px mesuré, à la pose la plus tournée, sur le plus
 * grand logo de l'accueil (512 px). C'est ce décalage, en largeurs de logo, pour la tranche `k` : le script recopie
 * ainsi l'image de la face au lieu de redessiner chaque caractère.
 */
export function decalageTranche(m: ArrayLike<number>, k: number): [number, number] {
  const recul = reculTranche(k);
  return [-(m[2] ?? 0) * recul, -(m[5] ?? 0) * recul];
}

/**
 * Ce qu'on voit des flancs, de 0 (rien) à 1, pour la rotation `m` et un logo large de `largeur` pixels : la largeur
 * du flanc à l'écran grandit avec l'obliquité du logo. De face, et tant que le flanc ferait un demi-pixel à peine (un
 * petit logo qui tourne peu, sur téléphone), les tranches ne sont pas dessinées : le logo garde exactement ses traits.
 */
export function flanc(m: ArrayLike<number>, largeur: number): number {
  const pixels = HOLO.epaisseur * Math.hypot(m[2] ?? 0, m[5] ?? 0) * largeur;
  return Math.min(1, Math.max(0, (pixels - HOLO.flancMin) / (HOLO.flancPlein - HOLO.flancMin)));
}

/** L'éclat de la tranche `k` (1 : juste derrière la face) : de plus en plus sombre vers l'arrière. */
export const eclatTranche = (k: number): number => 0.42 - (0.26 * (k - 1)) / Math.max(1, HOLO.tranches - 1);

/**
 * La rotation d'une pose, en neuf nombres rangée par rangée : le roulis d'abord (dans le plan du dessin), puis le
 * lacet, puis le tangage. Un lacet positif tourne le logo vers la droite : son bord droit s'éloigne. Un tangage
 * positif le tourne vers le haut : son bord haut s'éloigne.
 */
export function orienter(pose: Pose, m: Float32Array = new Float32Array(9)): Float32Array {
  const cl = Math.cos(pose.lacet);
  const sl = Math.sin(pose.lacet);
  const ct = Math.cos(pose.tangage);
  const st = Math.sin(pose.tangage);
  const cr = Math.cos(pose.roulis);
  const sr = Math.sin(pose.roulis);
  m[0] = cl * cr;
  m[1] = -cl * sr;
  m[2] = sl;
  m[3] = ct * sr + st * sl * cr;
  m[4] = ct * cr - st * sl * sr;
  m[5] = -st * cl;
  m[6] = st * sr - ct * sl * cr;
  m[7] = st * cr + ct * sl * sr;
  m[8] = ct * cl;
  return m;
}

/** Tourne un point et le projette : sa place (depuis le centre du logo), sa taille par rapport au repos, ce dont il a avancé. */
export function projeterPoint(x: number, y: number, z: number, m: ArrayLike<number>): [number, number, number, number] {
  const rx = (m[0] ?? 0) * x + (m[1] ?? 0) * y + (m[2] ?? 0) * z;
  const ry = (m[3] ?? 0) * x + (m[4] ?? 0) * y + (m[5] ?? 0) * z;
  const rz = (m[6] ?? 0) * x + (m[7] ?? 0) * y + (m[8] ?? 0) * z;
  const s = HOLO.camera / (HOLO.camera - rz);
  return [rx * s, ry * s, (HOLO.camera - z) / (HOLO.camera - rz), rz - z];
}

/** Tourne et projette tout le nuage, sans rien créer : `sortie` est réécrite à chaque image. */
export function projeter(nuage: Nuage, m: ArrayLike<number>, sortie: Projection): void {
  const { n, x, y, z } = nuage;
  const camera = HOLO.camera;
  const m0 = m[0] ?? 0;
  const m1 = m[1] ?? 0;
  const m2 = m[2] ?? 0;
  const m3 = m[3] ?? 0;
  const m4 = m[4] ?? 0;
  const m5 = m[5] ?? 0;
  const m6 = m[6] ?? 0;
  const m7 = m[7] ?? 0;
  const m8 = m[8] ?? 0;
  for (let i = 0; i < n; i++) {
    const px = x[i] ?? 0;
    const py = y[i] ?? 0;
    const pz = z[i] ?? 0;
    const rz = m6 * px + m7 * py + m8 * pz;
    const s = camera / (camera - rz);
    sortie.x[i] = (m0 * px + m1 * py + m2 * pz) * s;
    sortie.y[i] = (m3 * px + m4 * py + m5 * pz) * s;
    sortie.echelle[i] = (camera - pz) / (camera - rz);
    sortie.avance[i] = rz - pz;
  }
}

/** L'éclat d'un caractère : entier au repos et quand il approche, plus pâle quand il s'éloigne. */
export const eclat = (avance: number): number => Math.min(1, Math.max(HOLO.pale, 1 + HOLO.ombre * avance));

/** De 0 au centre vers 1 très loin, du même signe que `v` : la moitié du chemin à `portee`. */
const sature = (v: number, portee: number): number => (2 / Math.PI) * Math.atan(v / portee);

/**
 * La pose qui tourne la tête vers un point, donné depuis le centre du logo en largeurs de logo (`dy` positif : plus
 * bas). Le logo fait face au point, de plus en plus lentement à mesure qu'il s'éloigne, sans jamais dépasser ses
 * limites. Le guerrier est de profil, tourné vers la droite : quand le point est devant lui, il lève ou baisse aussi
 * le menton vers lui.
 */
export function viser(dx: number, dy: number): Pose {
  const cote = sature(dx, HOLO.portee);
  const bas = sature(dy, HOLO.portee);
  return { lacet: HOLO.lacetMax * cote, tangage: -HOLO.tangageMax * bas, roulis: HOLO.roulisMax * bas * (0.5 + 0.5 * cote) };
}

/**
 * Où se pose la pupille, pour un point donné depuis l'œil en largeurs de logo : elle glisse le long de la fente vers
 * ce point, et à peine en travers. En parts de la largeur du dessin, depuis le coin haut gauche. Derrière le guerrier,
 * le point le fait regarder du coin de l'œil.
 */
export function regard(dx: number, dy: number): [number, number] {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [OEIL.x, OEIL.y];
  const force = distance / (distance + OEIL.portee);
  const [ax, ay] = OEIL.axe;
  const long = OEIL.course * force * ((dx * ax + dy * ay) / distance);
  const travers = OEIL.travers * force * ((-dx * ay + dy * ax) / distance);
  return [OEIL.x + long * ax - travers * ay, OEIL.y + long * ay + travers * ax];
}

/** La fente de l'œil est-elle bien vide à cet endroit de la grille ? Sinon le logo a changé : pas de regard. */
export function oeilLibre(plein: ArrayLike<number>, colonnes: number, lignes: number): boolean {
  const [ax, ay] = OEIL.axe;
  for (const pas of [-1.5, 0, 1.5]) {
    const x = Math.floor(OEIL.x * colonnes + pas * ax);
    const y = Math.floor(OEIL.y * colonnes + pas * ay);
    if (x < 0 || y < 0 || x >= colonnes || y >= lignes || plein[y * colonnes + x]) return false;
  }
  return true;
}

/** Sans curseur, la tête regarde autour d'elle, très lentement : `t` en secondes. */
export function flaner(t: number): Pose {
  return { lacet: 10 * DEGRE * Math.sin((2 * Math.PI * t) / 17), tangage: 4 * DEGRE * Math.sin((2 * Math.PI * t) / 23 + 1.3), roulis: 0 };
}

/** Le tour complet du clic droit : l'angle ajouté au lacet, pour une avancée de 0 à 1. Il part et s'arrête en douceur. */
export function tourComplet(avancee: number): number {
  const p = Math.min(1, Math.max(0, avancee));
  return 2 * Math.PI * (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
}
