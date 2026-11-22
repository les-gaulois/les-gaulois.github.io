/**
 * Le défilé des cartes (22 novembre 2026), à la place du livre des bannières. Demande du pilote : « pour les cartes,
 * bannières et cadres, je voulais revoir l'animation à la boutique et au vestiaire, et au lieu que ça soit un livre, ça
 * affiche les cartes en gros qui défilent de gauche à droite » ; maquette de Claude Fable 5.2, choix faits par Claude à sa
 * demande (« Choisis pour moi »). La carte du milieu en grand, ses voisines aux trois quarts, les suivantes à la moitié ; on
 * passe de l'une à l'autre au doigt, à la souris, aux flèches ou au clavier. Écran : `src/components/village/DefileDeCartes.tsx`.
 *
 * Ici, des calculs purs : la place de chaque carte, le ressort qui l'amène au milieu, le geste, le clavier. Rien ne décide
 * de ce qui est acheté ou porté : le serveur le fait.
 */

/**
 * Les choses triées par rareté (demande du pilote, 16 novembre 2026 : « je veux que ça soit trié par rareté »), de la plus
 * courante à la plus rare, dans l'ordre de `ordre` ; à rareté égale, l'ordre reçu est gardé. Une rareté inconnue de `ordre`
 * passe à la fin. Rien n'est modifié.
 */
export function trierParRarete<T extends { rarete: string }>(choses: readonly T[], ordre: readonly string[]): T[] {
  const rang = (rarete: string): number => {
    const i = ordre.indexOf(rarete);
    return i < 0 ? ordre.length : i;
  };
  return choses.map((b, i) => ({ b, i })).sort((p, q) => rang(p.b.rarete) - rang(q.b.rarete) || p.i - q.i).map(({ b }) => b);
}

/** L'échelle d'une carte à `a` places du milieu : 1 au milieu, trois quarts à côté, la moitié ensuite. */
export function echelleDansLeDefile(a: number): number {
  const d = Math.abs(a);
  return d <= 1 ? 1 - 0.25 * d : d <= 2 ? 0.75 - 0.25 * (d - 1) : 0.5;
}

/**
 * Les ancres : où se tient le milieu d'une carte à 0, 1, 2… places du milieu, en pixels depuis le milieu de la bande, pour
 * des cartes de `largeur` pixels à leur plus grand, séparées de `ecart` pixels. `n` places en tout, et une de plus.
 */
export function ancresDuDefile(largeur: number, ecart: number, n: number): number[] {
  const ancres = [0];
  for (let k = 1; k <= Math.max(1, n) + 1; k++) ancres.push(ancres[k - 1]! + (largeur * echelleDansLeDefile(k - 1)) / 2 + ecart + (largeur * echelleDansLeDefile(k)) / 2);
  return ancres;
}

/** L'ancre d'une place `a` (positive) qui n'est pas entière : entre ses deux voisines. */
export function ancreDe(ancres: readonly number[], a: number): number {
  if (ancres.length < 2) return 0;
  const k = Math.max(0, Math.min(Math.floor(a), ancres.length - 2));
  return ancres[k]! + (ancres[k + 1]! - ancres[k]!) * (a - k);
}

/** Ce que la bande sait de ses mesures : la carte au plus grand, l'air au-dessus et au-dessous, la largeur de la bande. */
export interface MesuresDuDefile {
  largeur: number;
  hauteur: number;
  marge: number;
  bande: number;
  ancres: readonly number[];
}

/** La place d'une carte dans la bande : son coin haut gauche, son échelle, sa profondeur, son opacité ; hors de la bande, cachée. */
export interface PlaceDansLeDefile {
  x: number;
  y: number;
  echelle: number;
  z: number;
  opacite: number;
  cachee: boolean;
}

/**
 * La place de la carte `i` quand la position du défilé est `pos` (la carte au milieu, pas forcément entière pendant le
 * mouvement). Au repos, tout tombe sur un pixel entier, pour des cases nettes. Les cartes loin du milieu pâlissent un peu.
 */
export function placeDansLeDefile(i: number, pos: number, m: MesuresDuDefile, auRepos: boolean): PlaceDansLeDefile {
  const d = i - pos;
  const a = Math.abs(d);
  const s = echelleDansLeDefile(a);
  let x = m.bande / 2 + Math.sign(d) * ancreDe(m.ancres, a) - (m.largeur * s) / 2;
  let y = m.marge + (m.hauteur - m.hauteur * s) / 2;
  if (auRepos) {
    x = Math.round(x);
    y = Math.round(y);
  }
  const cachee = x > m.bande + 4 || x + m.largeur * s < -4;
  return { x, y, echelle: s, z: 200 - Math.round(a * 10), opacite: a <= 1.4 ? 1 : Math.max(0.72, 1 - (a - 1.4) * 0.4), cachee };
}

/** Un pas du ressort sans rebond qui amène la bande à `cible` : la position et la vitesse après `dt` secondes ; posée tout près. */
export function pasDuRessort(pos: number, vitesse: number, cible: number, dt: number, raideur = 15): { pos: number; vitesse: number; posee: boolean } {
  const t = Math.min(0.05, Math.max(0, dt));
  const v = vitesse + (-2 * raideur * vitesse - raideur * raideur * (pos - cible)) * t;
  const p = pos + v * t;
  if (Math.abs(p - cible) < 0.0015 && Math.abs(v) < 0.02) return { pos: cible, vitesse: 0, posee: true };
  return { pos: p, vitesse: v, posee: false };
}

/** La carte où mène une touche, depuis la carte `i` parmi `n` : flèches d'une carte, pages de trois, Début et Fin ; sinon `null`. */
export function toucheDuDefile(touche: string, i: number, n: number): number | null {
  if (n < 1) return null;
  const pas: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -3, PageDown: 3 };
  const borne = (k: number): number => Math.max(0, Math.min(n - 1, k));
  if (touche in pas) return borne(i + pas[touche]!);
  if (touche === "Home") return 0;
  if (touche === "End") return n - 1;
  return null;
}

/** En deçà de ce déplacement, en pixels, un glissement sans élan ne change pas de carte (celui du livre d'avant). */
export const SEUIL_DU_GESTE = 40;

/** Ce que demande un glissement de `dx` pixels : vers la gauche, la carte suivante ; vers la droite, la précédente ; trop peu, rien. */
export function sensDuGeste(dx: number): 1 | -1 | 0 {
  if (!Number.isFinite(dx) || Math.abs(dx) <= SEUIL_DU_GESTE) return 0;
  return dx < 0 ? 1 : -1;
}

/** La position pendant un glissement de `dx` pixels, parti de `pos0`, une carte tous les `pas` pixels : la bande résiste aux deux bouts. */
export function posDuGlissement(pos0: number, dx: number, pas: number, n: number): number {
  const p = pos0 - dx / Math.max(1, pas);
  const max = Math.max(0, n - 1);
  if (p < 0) return p / 3;
  if (p > max) return max + (p - max) / 3;
  return p;
}

/**
 * La carte où s'arrête un glissement lâché à la position `pos`, le doigt filant à `vitesse` pixels par milliseconde (vers
 * la gauche, négatif) : un peu plus loin dans le sens du geste, trois cartes au plus, dans la liste.
 */
export function arretDuGlissement(pos: number, vitesse: number, pas: number, n: number): number {
  const elan = Math.max(-3, Math.min(3, (-vitesse * 160) / Math.max(1, pas)));
  return Math.max(0, Math.min(Math.max(0, n - 1), Math.round(pos + elan)));
}
