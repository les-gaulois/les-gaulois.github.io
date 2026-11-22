/**
 * Les dessins des salles du duel « Coup pour coup » dans « Mon Gaulois » : les matchs en direct, avec mise, entre deux
 * membres du clan (« plusieurs salles 25 50 100 250 500 1000 statères en match », demande du pilote).
 * Dessins de Claude Fable 5.2 (22 novembre 2026), au style des icônes du duel (`../duel/dessins-ecran.ts`) et du kit
 * (`src/lib/jeu/icones.ts`) : les couleurs de la palette, un cerne d'encre, le volume (lumière en haut à gauche). Les mêmes
 * images servent dans les deux thèmes : aucune couleur n'y dépend du fond. Aucun ne rappelle une œuvre existante.
 *
 * - `iconeDesSalles` (24 cases) : l'entrée « Les salles » de l'accueil du duel. Deux cartes debout, face à face, une bleue
 *   (toi) et une rouge (l'autre Gaulois), et la pièce de la mise posée devant, entre elles.
 * - `emblemeDeSalle(mise)` (32 cases, la même taille pour les six) : la richesse qui monte de salle en salle, toujours
 *   posée sur la même planche de bois. 25 : une pièce ; 50 : deux pièces ; 100 : deux piles et une pièce ; 250 : une bourse
 *   de cuir nouée de rouge ; 500 : un coffret de bois ferré, ouvert sur ses pièces ; 1 000 : un grand coffre d'or qui
 *   déborde, une pierre rouge, des éclats.
 * - `iconeCagnotte` (24) : la cagnotte de la saison. Un chaudron de fer sur ses trois pieds, plein de pièces à ras bord.
 * - `sablier(part)` (13 × 21) : le temps de la manche. `part` va de 1 (tout le sable en haut) à 0 (tout en bas), arrondi à
 *   sept paliers (`PALIERS_DU_SABLIER`, de 6 à 0, cinq secondes chacun) ; aux cinq dernières secondes, le sable est rouge. Une image par
 *   palier : le sable ne bouge que d'un cran à la fois, rien ne clignote.
 * - `placeVide` (32) : la place d'en face pendant l'attente. Un tabouret de bois, et au-dessus la silhouette en pointillé
 *   du Gaulois qui n'est pas encore là.
 * - `iconePose` (24) : « l'autre a posé ». Un dos de carte (marine, bord d'or, comme celui de la scène) et une pastille
 *   verte à coche blanche.
 * - `iconeReflechit` (24) : « l'autre réfléchit ». Le même dos, à la même place, et une bulle à trois points.
 * - `iconeMachine` (24) : la machine d'en face pendant l'essai. Une tête d'automate en bois : deux yeux de verre, une
 *   bouche à lattes, des boulons aux tempes et une clé à remonter sur le crâne.
 * - `iconeVerrou` (16) : une salle fermée pour soi. Un cadenas d'or à l'anse d'acier.
 * - `iconeRendue` (24) : l'égalité, « mise rendue ». Deux pièces côte à côte, chacune au-dessus de la couleur de son joueur (bleu : toi ; rouge : l'autre).
 *
 * Chaque dessin est fait une fois, puis gardé en mémoire.
 */
import { PAL } from "../../../lib/jeu/palette";
import { Planche, R, cerne, ell, lig, poly, rr, volume } from "../../../lib/jeu/planche";

const { k, n, o, O, y, Y, r, R: Rg, p, b, B, c, w, W, g: vf, G, h, s, S, t, m, M, N, j } = PAL;

const MARINE = "#1f3aa8";
const TREILLIS = "#2f55d8";
const BLANC = "#ffffff";
const VERRE = "#dbe8ff";
const VERRE_OMBRE = "#b3c8f2";

/** Les mises des six salles, les mêmes que `SALLES_DU_DUEL` du contrat. */
export type MiseDEmbleme = 25 | 50 | 100 | 250 | 500 | 1000;

const DEJA = new Map<string, Planche>();
/** Garde un dessin en mémoire : il n'est fait qu'une fois. */
function garde(nom: string, fabriquer: () => Planche): Planche {
  let pl = DEJA.get(nom);
  if (!pl) {
    pl = fabriquer();
    DEJA.set(nom, pl);
  }
  return pl;
}

/** Efface le bord d'une case tout autour : la place du cerne. */
function bord(g: Planche): void {
  g.clearRect(0, 0, g.width, 1);
  g.clearRect(0, g.height - 1, g.width, 1);
  g.clearRect(0, 0, 1, g.height);
  g.clearRect(g.width - 1, 0, 1, g.height);
}

/** Un dessin de `l` cases sur `ht` : le bord effacé, puis le cerne et le volume. */
const dessin = (nom: string, l: number, ht: number, peindre: (g: Planche) => void): Planche =>
  garde(nom, () => {
    const cv = new Planche(l, ht);
    peindre(cv);
    bord(cv);
    return volume(cerne(cv));
  });

/** Une petite étoile de lumière : une croix de trois cases. */
function eclat(g: Planche, x: number, yy: number, coul: string = Y): void {
  R(g, x, yy - 1, 1, 3, coul);
  R(g, x - 1, yy, 3, 1, coul);
}

/** Une pièce de statère vue de face, son tour d'encre compris : tranche d'or sombre, face claire, anneau frappé. */
function piece(g: Planche, cx: number, cy: number, ray: number): void {
  ell(g, cx, cy, ray + 1, ray + 1, k);
  ell(g, cx, cy, ray, ray, O);
  ell(g, cx - 0.4, cy - 0.4, ray - 0.9, ray - 0.9, y);
  if (ray >= 6) {
    ell(g, cx, cy, ray - 2.6, ray - 2.6, O);
    ell(g, cx - 0.3, cy - 0.3, ray - 3.5, ray - 3.5, y);
    R(g, Math.round(cx - 1), Math.round(cy - 1), 2, 2, O);
    R(g, Math.round(cx - 1), Math.round(cy - 1), 1, 1, Y);
  } else if (ray >= 3.5) {
    R(g, Math.round(cx - 1), Math.round(cy - 1), 2, 2, O);
  }
  // la lumière, en haut à gauche
  const d = ray * 0.62;
  R(g, Math.round(cx - d), Math.round(cy - d), Math.max(1, Math.round(ray / 3)), 1, Y);
  R(g, Math.round(cx - d), Math.round(cy - d), 1, Math.max(1, Math.round(ray / 3)), Y);
}

/** Une pile de pièces vues de côté : `n` pièces de `l` cases, posées sur la rangée `bas`, le dessus de la pile en ovale. */
function pile(g: Planche, x: number, bas: number, l: number, n: number): void {
  const haut = bas - n * 3 + 1;
  R(g, x - 1, haut - 2, l + 2, n * 3 + 3, k);
  for (let i = 0; i < n; i++) {
    const yy = haut + i * 3;
    R(g, x, yy, l, 1, y);
    R(g, x, yy + 1, l, 1, O);
    R(g, x, yy + 2, l, 1, o);
    R(g, x, yy, 2, 1, Y);
    R(g, x + l - 2, yy, 2, 2, O);
    for (let xx = x + 2; xx < x + l - 1; xx += 3) R(g, xx, yy + 1, 1, 1, y);
  }
  // le dessus
  R(g, x + 1, haut - 2, l - 2, 1, y);
  R(g, x, haut - 1, l, 1, y);
  R(g, x + 1, haut - 2, 3, 1, Y);
  R(g, x + l - 4, haut - 1, 3, 1, O);
  g.clearRect(x - 1, haut - 2, 1, 1);
  g.clearRect(x + l, haut - 2, 1, 1);
}

/** La planche de bois où tout emblème est posé. */
function table(g: Planche): void {
  R(g, 2, 26, 28, 4, M);
  R(g, 2, 26, 28, 1, N);
  R(g, 2, 29, 28, 1, m);
  for (const x of [9, 16, 23]) R(g, x, 27, 1, 2, m);
}

/** Un tas de pièces vu de face : une bosse d'or entre `x0` et `x1`, son sommet à `haut`, sa base à `bas`. */
function tas(g: Planche, x0: number, x1: number, haut: number, bas: number): void {
  const cx = (x0 + x1 + 1) / 2;
  const rx = (x1 - x0 + 1) / 2;
  const ry = bas - haut + 1;
  for (let yy = haut; yy <= bas; yy++)
    for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((bas + 1 - yy - 0.5) / ry) ** 2;
      if (d > 1) continue;
      const bosse = (x * 3 + yy * 5) % 7;
      R(g, x, yy, 1, 1, d > 0.72 ? (bosse < 3 ? y : O) : bosse === 0 ? O : bosse === 3 ? Y : y);
    }
}

/** Les salles : deux cartes debout face à face, la pièce de la mise devant. */
export const iconeDesSalles = (): Planche =>
  dessin("salles", 24, 24, (g) => {
    // la carte bleue, à gauche, penchée vers le milieu
    poly(g, [[1, 3], [9, 1], [12, 16], [4, 18]], w);
    poly(g, [[2.6, 4.2], [7.8, 2.9], [10.2, 14.8], [5, 16.1]], (x, yy) => (x + yy > 16 ? b : B));
    lig(g, 3, 4, 7, 3, c);
    R(g, 1, 3, 1, 1, BLANC);
    // la carte rouge, à droite
    poly(g, [[23, 3], [15, 1], [12, 16], [20, 18]], W);
    poly(g, [[22, 3], [15, 1], [12, 15], [19, 17]], w);
    poly(g, [[21.4, 4.2], [16.2, 2.9], [13.8, 14.8], [19, 16.1]], (x, yy) => (yy - x > -6 ? r : Rg));
    lig(g, 17, 3, 20, 4, p);
    R(g, 11, 3, 2, 12, k);
    // la pièce de la mise
    piece(g, 12, 16.5, 5.5);
  });

/** L'emblème d'une salle : la richesse qui monte avec la mise. */
export function emblemeDeSalle(mise: MiseDEmbleme): Planche {
  return dessin(`embleme-${mise}`, 32, 32, (g) => {
    table(g);
    if (mise === 25) {
      piece(g, 16, 18, 7);
      eclat(g, 26, 8);
    } else if (mise === 50) {
      piece(g, 11.5, 17, 7);
      piece(g, 20.5, 18.5, 6.5);
      eclat(g, 27, 7);
    } else if (mise === 100) {
      pile(g, 4, 25, 11, 5);
      pile(g, 17, 25, 11, 3);
      piece(g, 16, 21, 4);
      eclat(g, 24, 9);
    } else if (mise === 250) {
      // deux pièces au pied
      R(g, 20, 22, 10, 4, k);
      R(g, 21, 23, 8, 1, y);
      R(g, 21, 24, 8, 1, O);
      R(g, 21, 25, 8, 1, o);
      R(g, 21, 23, 2, 1, Y);
      // la bourse : le col froncé, la panse
      poly(g, [[9, 3], [12, 5], [15, 3], [18, 5], [21, 3], [20, 9], [10, 9]], N);
      R(g, 10, 4, 1, 4, "#f2cf9a");
      R(g, 19, 5, 1, 4, M);
      ell(g, 14.5, 17.5, 10, 8, k);
      ell(g, 14.5, 17.5, 9.2, 7.2, M);
      ell(g, 13.6, 16.6, 8, 6, N);
      ell(g, 15, 18.2, 7.6, 5.6, M);
      ell(g, 13.4, 16.2, 5.6, 3.8, N);
      R(g, 8, 13, 3, 1, "#f2cf9a");
      R(g, 7, 14, 1, 3, "#f2cf9a");
      R(g, 19, 19, 3, 3, m);
      R(g, 15, 22, 5, 2, m);
      // le lien rouge
      R(g, 9, 9, 12, 2, Rg);
      R(g, 9, 9, 12, 1, p);
      R(g, 18, 10, 3, 1, r);
      R(g, 20, 11, 2, 4, Rg);
      R(g, 21, 12, 1, 3, r);
      // le fermoir d'or
      R(g, 13, 17, 3, 3, y);
      R(g, 13, 17, 1, 1, Y);
      R(g, 15, 19, 1, 1, O);
      piece(g, 25, 20.5, 3.5);
    } else if (mise === 500) {
      // le couvercle levé, vu de l'intérieur
      rr(g, 5, 3, 22, 9, 2, m);
      rr(g, 6, 4, 20, 7, 1, M);
      R(g, 7, 4, 18, 1, N);
      R(g, 6, 9, 20, 2, m);
      for (const x of [9, 21]) {
        R(g, x, 3, 2, 9, S);
        R(g, x, 3, 1, 9, t);
      }
      // les pièces
      R(g, 5, 11, 22, 6, k);
      tas(g, 6, 25, 10, 16);
      // la caisse
      R(g, 4, 16, 24, 10, k);
      R(g, 5, 17, 22, 9, M);
      R(g, 5, 17, 22, 1, N);
      R(g, 5, 21, 22, 1, m);
      R(g, 5, 25, 22, 1, m);
      for (const x of [5, 25]) {
        R(g, x, 17, 2, 9, S);
        R(g, x, 17, 1, 9, t);
        R(g, x, 19, 1, 1, s);
        R(g, x, 23, 1, 1, s);
      }
      R(g, 14, 16, 4, 5, k);
      R(g, 15, 17, 2, 3, S);
      R(g, 15, 17, 1, 1, t);
      R(g, 15, 19, 1, 1, k);
      eclat(g, 12, 12, BLANC);
    } else {
      // le couvercle d'or, bombé, levé
      rr(g, 3, 1, 26, 9, 3, O);
      rr(g, 4, 2, 24, 7, 2, y);
      R(g, 6, 2, 20, 1, Y);
      R(g, 4, 7, 24, 2, O);
      for (const x of [8, 22]) {
        R(g, x, 1, 2, 9, Rg);
        R(g, x, 1, 1, 9, p);
      }
      // les pièces qui débordent
      R(g, 2, 9, 28, 8, k);
      tas(g, 3, 28, 7, 16);
      R(g, 9, 11, 3, 3, k);
      R(g, 10, 11, 1, 1, G);
      R(g, 9, 12, 3, 1, G);
      R(g, 10, 13, 1, 1, vf);
      R(g, 9, 12, 1, 1, h);
      R(g, 20, 10, 3, 3, k);
      R(g, 21, 10, 1, 1, B);
      R(g, 20, 11, 3, 1, B);
      R(g, 21, 12, 1, 1, b);
      R(g, 20, 11, 1, 1, c);
      // le coffre
      R(g, 2, 15, 28, 11, k);
      R(g, 3, 16, 26, 10, y);
      R(g, 3, 16, 26, 1, Y);
      R(g, 3, 23, 26, 3, O);
      R(g, 3, 20, 26, 1, O);
      for (const x of [3, 26]) {
        R(g, x, 16, 3, 10, Rg);
        R(g, x, 16, 1, 10, p);
        R(g, x + 2, 16, 1, 10, r);
      }
      // la serrure : une pierre rouge sertie d'or
      R(g, 13, 15, 6, 7, k);
      R(g, 14, 16, 4, 5, Y);
      R(g, 15, 17, 2, 3, Rg);
      R(g, 15, 17, 1, 1, p);
      R(g, 16, 19, 1, 1, r);
      eclat(g, 15, 8, BLANC);
      eclat(g, 25, 12, BLANC);
      eclat(g, 6, 11, BLANC);
    }
  });
}

/** La cagnotte de la saison : un chaudron de fer plein de pièces. */
export const iconeCagnotte = (): Planche =>
  dessin("cagnotte", 24, 24, (g) => {
    // les trois pieds
    R(g, 4, 20, 3, 3, s);
    R(g, 17, 20, 3, 3, s);
    R(g, 11, 21, 2, 2, s);
    // la panse
    ell(g, 12, 15, 10, 7.6, k);
    ell(g, 12, 15, 9.2, 6.8, S);
    ell(g, 13, 16, 8, 5.6, s);
    ell(g, 11.4, 14.6, 7.4, 5, S);
    R(g, 5, 13, 1, 4, t);
    R(g, 6, 11, 2, 2, t);
    R(g, 7, 12, 2, 1, BLANC);
    // les pièces, à ras bord
    R(g, 3, 4, 18, 6, k);
    tas(g, 4, 19, 3, 9);
    // le rebord et ses anses
    R(g, 2, 9, 20, 3, k);
    R(g, 3, 9, 18, 2, t);
    R(g, 3, 9, 18, 1, BLANC);
    R(g, 15, 10, 6, 1, S);
    R(g, 1, 11, 2, 4, S);
    R(g, 21, 11, 2, 4, s);
    eclat(g, 12, 5, BLANC);
    eclat(g, 21, 3);
    R(g, 2, 5, 1, 1, Y);
  });

/** Les paliers du sablier : 6 (plein en haut) à 0 (vide) ; sur 30 secondes, un palier dure 5 secondes. */
export const PALIERS_DU_SABLIER = 6;

/** Le palier d'une part du temps (1 : tout reste ; 0 : plus rien). Il ne descend à 0 qu'à la fin. */
export const palierDuSablier = (part: number): number => (part <= 0 ? 0 : Math.min(PALIERS_DU_SABLIER, Math.max(1, Math.ceil(part * PALIERS_DU_SABLIER))));

/** La demi-largeur du verre, du haut d'une ampoule vers le col. */
const AMPOULE = [4, 4, 4, 3, 3, 2, 1] as const;

/** Le sablier des 30 secondes : `part` de 1 à 0, le sable qui reste en haut. */
export function sablier(part: number): Planche {
  const reste = palierDuSablier(Number.isFinite(part) ? part : 0);
  return garde(`sablier-${reste}`, () => {
    const g = new Planche(13, 21);
    const presse = reste <= 1;
    const clair = presse ? p : y;
    const corps = presse ? Rg : j;
    const fonce = presse ? r : O;
    // le verre : l'ampoule du haut (rangées 3 à 9), le col (10), l'ampoule du bas (11 à 17)
    for (let i = 0; i < 7; i++) {
      const hw = AMPOULE[i]!;
      for (const yy of [3 + i, 17 - i]) {
        R(g, 6 - hw, yy, hw * 2 + 1, 1, VERRE);
        R(g, 6 + hw, yy, 1, 1, VERRE_OMBRE);
        if (hw > 1) R(g, 6 - hw, yy, 1, 1, BLANC);
      }
    }
    R(g, 6, 10, 1, 1, VERRE);
    // le sable du haut : les rangées du bas de l'ampoule, une par palier
    for (let i = 7 - reste; i < 7; i++) {
      const hw = AMPOULE[i]!;
      const large = Math.max(0, hw - (hw > 1 ? 1 : 0));
      R(g, 6 - large, 3 + i, large * 2 + 1, 1, i === 7 - reste ? clair : corps);
      if (large > 0) R(g, 6 + large, 3 + i, 1, 1, fonce);
    }
    // le sable du bas : un tas qui monte
    const tombe = PALIERS_DU_SABLIER - reste;
    for (let i = 0; i < tombe; i++) {
      const hw = AMPOULE[i]!;
      const large = Math.max(0, Math.min(hw - (hw > 1 ? 1 : 0), tombe - i + (tombe > 4 ? 1 : 0)));
      R(g, 6 - large, 17 - i, large * 2 + 1, 1, corps);
      if (large > 0) R(g, 6 + large, 17 - i, 1, 1, fonce);
      R(g, 6, 17 - i, 1, 1, i === tombe - 1 ? clair : corps);
    }
    // le filet qui coule
    if (reste > 0 && reste < PALIERS_DU_SABLIER) for (let yy = 10; yy <= 17 - tombe; yy++) R(g, 6, yy, 1, 1, corps);
    cerne(g);
    // les deux traverses de bois, cerclées d'or
    for (const yy of [1, 18]) {
      R(g, 0, yy - 1, 13, 4, k);
      R(g, 1, yy, 11, 2, M);
      R(g, 1, yy, 11, 1, N);
      R(g, 1, yy, 1, 2, y);
      R(g, 11, yy, 1, 2, O);
    }
    bord(g);
    for (const yy of [1, 18]) {
      R(g, 1, yy, 11, 2, M);
      R(g, 1, yy, 11, 1, N);
      R(g, 1, yy, 1, 2, y);
      R(g, 11, yy, 1, 2, O);
    }
    return cerne(g);
  });
}

/** La place vide : un tabouret, et la silhouette en pointillé de celui qui n'est pas encore là. */
export const placeVide = (): Planche =>
  garde("place-vide", () => {
    const g = new Planche(32, 32);
    // le tabouret
    R(g, 8, 23, 16, 3, N);
    R(g, 8, 23, 16, 1, "#f2cf9a");
    R(g, 8, 25, 16, 1, M);
    poly(g, [[10, 26], [12, 26], [10, 31], [8, 31]], M);
    poly(g, [[20, 26], [22, 26], [24, 31], [22, 31]], m);
    R(g, 11, 28, 10, 1, m);
    bord(g);
    volume(cerne(g));
    // la silhouette, en pointillé : la tête, puis les épaules
    const trait = "#7f8db8";
    const point = (x: number, yy: number, i: number): void => {
      if (i % 3 !== 2) R(g, x, yy, 1, 1, trait);
    };
    let i = 0;
    const tete: [number, number][] = [];
    for (let a = 0; a < 28; a++) {
      const an = (a / 28) * Math.PI * 2 - Math.PI / 2;
      tete.push([Math.round(15.5 + Math.cos(an) * 4.6), Math.round(6.5 + Math.sin(an) * 4.6)]);
    }
    let avant = "";
    for (const [x, yy] of tete) {
      const cle = `${x},${yy}`;
      if (cle === avant) continue;
      avant = cle;
      point(x, yy, i++);
    }
    i = 0;
    // l'épaule gauche, le flanc, puis le même à droite
    const epaule: [number, number][] = [[13, 12], [12, 12], [11, 12], [10, 13], [9, 13], [8, 14], [7, 15], [7, 16], [6, 17], [6, 18], [6, 19], [6, 20], [6, 21]];
    for (const [x, yy] of epaule) {
      point(x, yy, i);
      point(31 - x, yy, i);
      i++;
    }
    return g;
  });

/** Le dos d'une carte, en petit : marine, treillis, bord d'or, un losange d'or au centre. Le même que celui de la scène. */
function dos(g: Planche): void {
  rr(g, 3, 2, 13, 20, 1, O);
  rr(g, 3, 2, 12, 19, 1, y);
  R(g, 4, 2, 10, 1, Y);
  R(g, 5, 4, 9, 16, k);
  R(g, 6, 5, 7, 14, MARINE);
  for (let yy = 5; yy < 19; yy++) for (let x = 6; x < 13; x++) if ((x + yy) % 4 === 0 || (x - yy + 40) % 4 === 0) R(g, x, yy, 1, 1, TREILLIS);
  poly(g, [[9.5, 8], [13, 12], [9.5, 16], [6, 12]], k);
  poly(g, [[9.5, 9.2], [11.8, 12], [9.5, 14.8], [7.2, 12]], y);
  R(g, 9, 11, 1, 1, Y);
}

/** « L'autre a posé » : un dos de carte, une pastille verte à coche. */
export const iconePose = (): Planche =>
  dessin("pose", 24, 24, (g) => {
    dos(g);
    ell(g, 17, 17, 6, 6, k);
    ell(g, 17, 17, 5, 5, vf);
    ell(g, 16.6, 16.6, 4.2, 4.2, G);
    lig(g, 14, 17, 16, 19, w, 1);
    lig(g, 16, 19, 20, 15, w, 1);
    lig(g, 14, 16, 16, 18, BLANC, 1);
    lig(g, 16, 18, 19, 15, BLANC, 1);
  });

/** « L'autre réfléchit » : le même dos, une bulle à trois points. */
export const iconeReflechit = (): Planche =>
  dessin("reflechit", 24, 24, (g) => {
    dos(g);
    rr(g, 10, 0, 14, 11, 3, k);
    R(g, 12, 10, 4, 2, k);
    R(g, 12, 11, 2, 2, k);
    rr(g, 11, 1, 12, 9, 2, w);
    R(g, 12, 1, 9, 1, BLANC);
    R(g, 12, 9, 10, 1, W);
    R(g, 13, 10, 2, 1, w);
    R(g, 13, 11, 1, 1, W);
    for (const x of [13, 16, 19]) {
      R(g, x, 4, 2, 2, s);
      R(g, x, 4, 1, 1, S);
    }
  });

/** La machine de l'essai : une tête d'automate en bois, une clé à remonter. */
export const iconeMachine = (): Planche =>
  dessin("machine", 24, 24, (g) => {
    // la clé à remonter
    R(g, 11, 4, 2, 4, S);
    R(g, 11, 4, 1, 4, t);
    R(g, 7, 1, 10, 4, k);
    R(g, 8, 1, 3, 3, t);
    R(g, 13, 1, 3, 3, t);
    R(g, 11, 2, 2, 1, t);
    R(g, 9, 2, 1, 1, k);
    R(g, 14, 2, 1, 1, k);
    R(g, 8, 1, 1, 1, BLANC);
    R(g, 13, 1, 1, 1, BLANC);
    R(g, 15, 3, 1, 1, S);
    g.clearRect(7, 1, 1, 1);
    g.clearRect(16, 1, 1, 1);
    g.clearRect(7, 4, 4, 1);
    g.clearRect(13, 4, 4, 1);
    // les boulons des tempes
    R(g, 2, 11, 3, 5, S);
    R(g, 2, 11, 1, 5, t);
    R(g, 19, 11, 3, 5, s);
    R(g, 19, 11, 1, 5, S);
    // la tête : un bloc de bois, ses veines
    rr(g, 4, 7, 16, 14, 2, k);
    rr(g, 5, 8, 14, 12, 1, N);
    R(g, 6, 8, 12, 1, "#f2cf9a");
    R(g, 5, 9, 1, 9, "#f2cf9a");
    R(g, 17, 9, 2, 11, M);
    R(g, 6, 19, 12, 1, M);
    R(g, 8, 10, 4, 1, M);
    R(g, 13, 18, 3, 1, m);
    // les yeux de verre
    for (const x of [7, 13]) {
      R(g, x, 11, 4, 4, k);
      R(g, x + 1, 12, 2, 2, y);
      R(g, x + 1, 12, 1, 1, Y);
    }
    // la bouche à lattes
    R(g, 7, 16, 10, 3, k);
    for (const x of [8, 10, 12, 14]) R(g, x, 17, 1, 1, w);
    // le cou
    R(g, 9, 20, 6, 3, M);
    R(g, 9, 20, 1, 3, N);
    R(g, 13, 20, 2, 3, m);
  });

/** Une salle fermée pour soi : un cadenas. */
export const iconeVerrou = (): Planche =>
  dessin("verrou", 16, 16, (g) => {
    // l'anse
    for (let yy = 1; yy < 8; yy++)
      for (let x = 3; x < 13; x++) {
        const d = Math.hypot(x + 0.5 - 8, yy + 0.5 - 6);
        if (d <= 4.2 && d > 2.1) R(g, x, yy, 1, 1, x < 7 ? t : S);
      }
    R(g, 4, 6, 2, 2, t);
    R(g, 10, 6, 2, 2, S);
    // le corps
    R(g, 2, 7, 12, 8, k);
    rr(g, 3, 8, 10, 6, 1, y);
    R(g, 4, 8, 8, 1, Y);
    R(g, 3, 12, 10, 2, O);
    R(g, 11, 9, 2, 4, O);
    // la serrure
    R(g, 7, 9, 2, 2, k);
    R(g, 7, 11, 2, 2, n);
  });

/** L'égalité, « mise rendue » : deux pièces, chacune au-dessus de la couleur de son joueur. */
export const iconeRendue = (): Planche =>
  dessin("rendue", 24, 24, (g) => {
    piece(g, 7, 10, 4.5);
    piece(g, 17, 10, 4.5);
    // sous chacune, la couleur de son joueur : bleu pour toi, rouge pour l'autre
    R(g, 3, 18, 8, 4, B);
    R(g, 3, 18, 8, 1, c);
    R(g, 3, 21, 8, 1, b);
    R(g, 13, 18, 8, 4, Rg);
    R(g, 13, 18, 8, 1, p);
    R(g, 13, 21, 8, 1, r);
  });
