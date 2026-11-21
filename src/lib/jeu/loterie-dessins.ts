/**
 * Les dessins du booster de loterie de « Mon Gaulois » (21 novembre 2026, dessin de Claude Fable 5.2) : la carte qui sort du
 * booster du jour, le billet, le ticket d'or et les petits boosters de la semaine. Le paquet lui-même, `loterie`, est avec
 * les autres dans `boosters-dessins.ts`.
 *
 * La règle (décision du pilote des 20 et 21 novembre 2026) : un booster par jour joué avec le clan, autant de billets que de
 * points rapportés au clan ce jour-là, et une fois sur dix un ticket d'or qui vaut des billets de plus. Le serveur tire ;
 * ces dessins montrent seulement ce qu'il a tiré. La carte n'a pas de rareté : elle prend les couleurs et la lumière du
 * commun (sans ticket) ou du légendaire (avec), sans jamais en écrire le nom ni en porter les losanges.
 *
 * Tout est en planches, sans navigateur, et fixe : rien ne clignote.
 */
import { PAL } from "./palette";
import { Planche, R, grille, lireCouleur, rr } from "./planche";
import { ecrire, largeurDuTexte, nombreEcrit } from "./ecriture";
import { CARTE_HAUTEUR, CARTE_LARGEUR, LUMIERES, TONS, auCentre, fondDeFace, type CarteDeScene, type Tons } from "./boosters";
import { dansUnTicket } from "./boosters-dessins";

/* ---------- Le billet ---------- */

export const BILLET_LARGEUR = 18;
export const BILLET_HAUTEUR = 10;

/** Un billet de loterie : crème, un talon à perforation, deux lignes bleue et rouge, une encoche de chaque côté (18 × 10). */
export function billet(): Planche {
  const g = new Planche(BILLET_LARGEUR, BILLET_HAUTEUR);
  rr(g, 0, 0, 18, 10, 1, PAL.k);
  R(g, 1, 1, 16, 8, PAL.w);
  R(g, 1, 1, 16, 1, "#ffffff");
  R(g, 1, 7, 16, 2, PAL.W);
  // La perforation du talon.
  for (let y = 1; y < 9; y += 2) R(g, 5, y, 1, 1, PAL.S);
  R(g, 2, 3, 2, 1, PAL.S);
  R(g, 2, 5, 2, 1, PAL.S);
  R(g, 8, 3, 7, 1, PAL.B);
  R(g, 8, 5, 5, 1, PAL.R);
  // Les deux encoches.
  g.clearRect(0, 4, 1, 2);
  g.clearRect(17, 4, 1, 2);
  R(g, 1, 4, 1, 2, PAL.k);
  R(g, 16, 4, 1, 2, PAL.k);
  return g;
}

/** La place d'un billet absent : son contour en pointillés. */
function billetVide(coul: string): Planche {
  const g = new Planche(BILLET_LARGEUR, BILLET_HAUTEUR);
  for (let x = 1; x < 17; x++)
    if (x % 3 !== 0) {
      R(g, x, 0, 1, 1, coul);
      R(g, x, 9, 1, 1, coul);
    }
  for (let y = 1; y < 9; y++)
    if (y % 3 !== 0) {
      R(g, 0, y, 1, 1, coul);
      R(g, 17, y, 1, 1, coul);
    }
  return g;
}

/** Le petit tas de la carte : autant de billets que le booster en donne, trois au plus ; aucun : la place d'un billet. */
function tasDeBillets(n: number, vide: string): Planche {
  if (n <= 0) return billetVide(vide);
  const k = Math.min(3, n);
  const g = new Planche(BILLET_LARGEUR + (k - 1) * 3, BILLET_HAUTEUR + (k - 1) * 4);
  const b = billet();
  for (let i = 0; i < k; i++) g.drawImage(b, (k - 1 - i) * 3, i * 4);
  return g;
}

/* ---------- Le ticket d'or ---------- */

export const TICKET_LARGEUR = 40;
export const TICKET_HAUTEUR = 20;

const ETOILE = [".....w.....", ".....w.....", "....www....", "wwwwwwwwwww", ".wwwwwwwww.", "..wwwwwww..", "...wwwww...", "..wwwwwww..", "..www.www..", ".ww.....ww.", ".w.......w."];

/** Le ticket d'or : deux encoches, un talon à perforation, un filet en pointillés et l'étoile (40 × 20). */
export function ticketDOr(): Planche {
  const L = TICKET_LARGEUR;
  const H = TICKET_HAUTEUR;
  const g = new Planche(L, H);
  const dans = (x: number, y: number): boolean => dansUnTicket(x, y, L, H, 2.6);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      if (!dans(x, y)) continue;
      const bord = !dans(x - 1, y) || !dans(x + 1, y) || !dans(x, y - 1) || !dans(x, y + 1);
      R(g, x, y, 1, 1, bord ? PAL.k : y <= 1 ? "#fffbe6" : y <= 3 ? "#fff2a8" : y <= 12 ? "#ffd84a" : y <= 15 ? "#ffc61a" : y <= 17 ? "#e8aa14" : "#b97a0c");
    }
  // Le talon : trois traits gravés, puis la perforation.
  for (const y of [4, 9, 14]) {
    R(g, 5, y, 4, 2, "#c8860e");
    R(g, 5, y, 4, 1, "#fffbe6");
  }
  for (let y = 2; y < H - 2; y += 3) {
    R(g, 11, y, 1, 2, "#9c6a0c");
    R(g, 12, y, 1, 2, "#fff2a8");
  }
  // Le filet en pointillés autour de l'étoile.
  for (let x = 15; x < 35; x += 2) {
    R(g, x, 3, 1, 1, "#c8860e");
    R(g, x, 16, 1, 1, "#8a5206");
  }
  for (let y = 5; y < 16; y += 2) {
    R(g, 14, y, 1, 1, "#c8860e");
    if (Math.abs(y + 0.5 - H / 2) > 4) R(g, 35, y, 1, 1, "#c8860e");
  }
  // L'étoile, claire, cernée de brun, entre deux grains.
  const cx = 19;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) g.drawImage(grille(ETOILE, { w: "#8a5206" }), cx + dx, 4 + dy);
  g.drawImage(grille(ETOILE, { w: "#fffbe6" }), cx, 4);
  for (const x of [16, 32]) {
    R(g, x, 9, 2, 2, "#8a5206");
    R(g, x, 9, 1, 1, "#fffbe6");
  }
  return g;
}

/* ---------- La carte du booster ---------- */

const PETITE_ETOILE = ["...w...", "...w...", "wwwwwww", ".wwwww.", "..www..", ".ww.ww.", ".w...w."];

/** La perforation en travers du bas de la face, à la place des losanges : la carte n'a pas de rareté. */
function perforation(g: Planche, y: number, [, , bord]: Tons): void {
  for (let x = 7; x < CARTE_LARGEUR - 7; x += 3) R(g, x, y, 2, 1, bord);
  for (const x of [1, CARTE_LARGEUR - 3]) {
    R(g, x, y - 2, 2, 5, bord);
    R(g, x === 1 ? 3 : x - 1, y - 1, 1, 3, bord);
  }
}

const mots = (billets: number): string => `${nombreEcrit(billets)} ${billets > 1 ? "billets" : "billet"}`;

/**
 * La carte que montre la scène à l'ouverture d'un booster de loterie (face de 68 × 88). Sans ticket d'or : les couleurs et
 * la lumière du commun, un petit tas de billets, « +12 », « BILLETS », « LOTERIE ». Avec : celles du légendaire, le ticket
 * d'or, « +12 », « BILLETS », le cartouche « +5 » du ticket, « TICKET D'OR ». Ni losange, ni nom de rareté.
 */
export function carteDuBoosterDeLoterie(o: { billets: number; ticketOr: boolean; billetsOr: number }): CarteDeScene {
  const billets = Math.max(0, Math.round(o.billets));
  const billetsOr = Math.max(0, Math.round(o.billetsOr));
  const rarete = o.ticketOr ? "legendaire" : "commun";
  const tons = TONS[rarete];
  const g = new Planche(CARTE_LARGEUR, CARTE_HAUTEUR);
  fondDeFace(g, tons);
  const compte = billets > 0 ? `+${nombreEcrit(billets)}` : "0";
  const unite = billets > 1 ? "Billets" : "Billet";
  if (!o.ticketOr) {
    const t = tasDeBillets(billets, tons[2]);
    g.drawImage(t, Math.round(CARTE_LARGEUR / 2 - t.width), Math.round(23 - t.height), t.width * 2, t.height * 2);
    auCentre(g, compte, 46, "#0a1230");
    auCentre(g, unite, 55, "#0a1230");
    perforation(g, 68, tons);
    auCentre(g, "Loterie", 74, tons[3]);
    return { face: g, rarete, rang: 1, nom: mots(billets), mot: "Loterie", tons, lumiere: LUMIERES[rarete] };
  }
  // Le ticket d'or, posé sur son ombre.
  const t = ticketDOr();
  const x0 = Math.round(CARTE_LARGEUR / 2 - t.width / 2);
  R(g, x0 + 3, 26, t.width - 6, 1, tons[2]);
  g.drawImage(t, x0, 6);
  auCentre(g, compte, 30, "#0a1230");
  auCentre(g, unite, 39, "#0a1230");
  // Le cartouche du ticket : son étoile et ce qu'il vaut de plus.
  const plus = `+${nombreEcrit(billetsOr)}`;
  const l = 4 + 7 + 3 + largeurDuTexte(plus) + 4;
  const cx = Math.round(CARTE_LARGEUR / 2 - l / 2);
  rr(g, cx, 50, l, 13, 2, tons[3]);
  rr(g, cx + 1, 51, l - 2, 11, 1, "#ffd84a");
  R(g, cx + 2, 51, l - 4, 1, "#fffbe6");
  R(g, cx + 2, 61, l - 4, 1, "#e8aa14");
  g.drawImage(grille(PETITE_ETOILE, { w: "#3a2606" }), cx + 4, 53);
  g.drawImage(ecrire(plus, "#3a2606"), cx + 14, 53);
  perforation(g, 68, tons);
  auCentre(g, "Ticket d'or", 74, tons[3]);
  return {
    face: g,
    rarete,
    rang: 5,
    // Sous la carte, la scène écrit le mot en grand pour un légendaire : court, comme « Légendaire ». Ce que vaut le ticket
    // va dans le nom.
    nom: `${mots(billets)} et ${nombreEcrit(billetsOr)} de plus`,
    mot: "Ticket d'or",
    tons,
    lumiere: LUMIERES[rarete],
  };
}

/* ---------- Les petits boosters de la semaine ---------- */

export const MINI_BOOSTER_LARGEUR = 15;
export const MINI_BOOSTER_HAUTEUR = 22;
export type EtatDuMiniBooster = "ferme" | "ouvert" | "vide";

/** Le petit booster scellé : le sachet rouge de la loterie, sa bande d'or et son ticket. */
function miniFerme(): Planche {
  const g = new Planche(MINI_BOOSTER_LARGEUR, MINI_BOOSTER_HAUTEUR);
  for (let x = 1; x < 14; x++) {
    const d = x % 2;
    R(g, x, d, 1, 3 - d, PAL.k);
    R(g, x, 19, 1, 3 - d, PAL.k);
    if (x > 1 && x < 13) {
      R(g, x, d + 1, 1, 2 - d, "#eef2fc");
      R(g, x, 19, 1, 2 - d, "#9aa6c8");
    }
  }
  R(g, 1, 3, 13, 16, PAL.k);
  for (let y = 4; y < 18; y++)
    for (let x = 2; x < 13; x++) {
      const d = x + (y - 4) * 0.7;
      let coul = y > 14 && (x + y) % 2 ? "#9c1227" : "#bb1d32";
      if (d >= 13 && d < 16) coul = d < 14 ? "#fff2a8" : "#ffc61a";
      if (x === 2) coul = "#ffd3d6";
      if (x === 12) coul = "#7c0a1d";
      if (y === 4) coul = x === 2 ? "#ffd3d6" : "#cf2c40";
      R(g, x, y, 1, 1, coul);
    }
  // Le ticket : son cadre d'or, ses deux encoches, son étoile.
  rr(g, 3, 7, 9, 7, 1, PAL.k);
  R(g, 4, 8, 7, 5, PAL.y);
  R(g, 4, 12, 7, 1, PAL.O);
  R(g, 4, 8, 7, 1, PAL.Y);
  R(g, 3, 10, 1, 1, "#bb1d32");
  R(g, 11, 10, 1, 1, "#bb1d32");
  R(g, 4, 10, 1, 1, PAL.k);
  R(g, 10, 10, 1, 1, PAL.k);
  R(g, 6, 9, 3, 3, "#4a0510");
  R(g, 7, 10, 1, 1, PAL.Y);
  return g;
}

/** Fond une planche dans une couleur : `t` de 0 (rien) à 1 (toute la couleur). */
function fondre(g: Planche, coul: string, t: number): Planche {
  const [r, v, b] = lireCouleur(coul);
  for (let i = 0; i < g.data.length; i += 4) {
    if (!g.data[i + 3]) continue;
    g.data[i] = g.data[i]! + (r - g.data[i]!) * t;
    g.data[i + 1] = g.data[i + 1]! + (v - g.data[i + 1]!) * t;
    g.data[i + 2] = g.data[i + 2]! + (b - g.data[i + 2]!) * t;
  }
  return g;
}

/** La hauteur de la déchirure, colonne par colonne. */
const DECHIRURE = [0, 6, 5, 6, 7, 6, 5, 4, 5, 6, 7, 6, 5, 6, 0] as const;

/**
 * Le booster de loterie d'un jour de la semaine, en petit (15 × 22, la même taille pour les trois états) : `ferme`, scellé ;
 * `ouvert`, déchiré en haut et assombri ; `vide`, la place d'un jour sans booster, un contour en pointillés qui se lit sur
 * un fond clair comme sur un fond sombre.
 */
export function miniBooster(etat: EtatDuMiniBooster): Planche {
  if (etat === "ferme") return miniFerme();
  const L = MINI_BOOSTER_LARGEUR;
  const H = MINI_BOOSTER_HAUTEUR;
  if (etat === "ouvert") {
    const g = fondre(miniFerme(), "#4a5578", 0.6);
    for (let x = 1; x < 14; x++) {
      const h = DECHIRURE[x]!;
      g.clearRect(x, 0, 1, h);
      R(g, x, h, 1, 1, PAL.k);
      // L'intérieur vide du sachet, sous le bord déchiré.
      if (x > 1 && x < 13) R(g, x, h + 1, 1, 8 - h, "#1d2546");
    }
    return g;
  }
  const g = new Planche(L, H);
  const coul = "#7783a8";
  for (let x = 2; x < 13; x++)
    if (x % 3 !== 1) {
      R(g, x, 0, 1, 1, coul);
      R(g, x, H - 1, 1, 1, coul);
    }
  for (let y = 1; y < H - 1; y++)
    if (y % 3 !== 0) {
      R(g, 1, y, 1, 1, coul);
      R(g, 13, y, 1, 1, coul);
    }
  return g;
}
