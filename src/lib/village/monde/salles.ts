/**
 * Les deux salles de la grand-rue du monde du village, dessinées case par case avec le soin des maisons (`maisons.ts`) :
 * - la taverne : une grande chaumière au faîte qui fléchit, une croupe à gauche, une lucarne, la souche de pierre de sa
 *   cheminée, le cellier de pierre adossé à droite sous son appentis de chaume, l'enseigne à la chope au bout d'une
 *   potence, une guirlande de houblon sous la sablière ;
 * - la salle de réunion : une halle de charpente sous un toit de bardeaux, un fronton au milieu qui porte le bouclier du
 *   clan et deux cornes croisées, une tourelle de pierre à droite sous son toit pointu, le mât et la bannière à gauche,
 *   deux marches de pierre.
 *
 * L'intérieur reste ouvert sur les tables, et l'ouverture suit la charpente : deux grands aisseliers cintrés, des
 * pendentifs sous le fronton. Les places assises ne changent pas (`SALLE_*`, `SIEGE*` de `pieces.ts`, relus par
 * `postes.ts`) : deux rangs de tables dedans, huit et sept sièges, à la même place qu'avant depuis le bord gauche.
 * Rien n'est tiré au hasard : `alea(x, y)` donne un grain qui ne bouge pas. Aucun dessin ne rappelle une œuvre existante.
 * Design : Claude Fable 5.2.
 */
import { type Palette, type Planche, alea } from "../decor";
import { type Lumiere, couleurDuDedans, couleurDuDehors, melanger } from "../lumiere";
import { type Chantier, biais, chantierSur, fenetre, pierres, porte, poteau, poutre, toit, torchis } from "./maisons";
import { SALLE_AVANT_TOIT, TRICOLORE, poserEtagere, poserFenetre, poserFut, poserLanterne, poserPiece, poserTables, poserTonneau, poserTorche } from "./pieces";
import { type Emplacement, PLANCHER } from "./plan";

type Teinte = (couleur: string) => string;

/** La largeur de la salle elle-même, là où sont les tables : le reste de l'emplacement est son annexe, à droite. */
export const SALLE_LARGEUR = 372;

/** D'où sort la fumée de la taverne : depuis le bord gauche de son emplacement, et au-dessus de son pied. */
export const FUMEE_DE_LA_TAVERNE = { x: 360, y: 212 };

/** Le cadre de l'ouverture d'une salle : deux poteaux sur leur dé de pierre, la sablière, et deux grands aisseliers cintrés. */
function cadre(c: Chantier, x: number, avantToit: number): void {
  const { pl, p, g } = c;
  for (const px of [x + 4, x + SALLE_LARGEUR - 11]) {
    poteau(c, px, avantToit, 7, g - avantToit - 8);
    pierres(c, px - 3, g - 9, 13, 10);
  }
  // Les aisseliers : un quart de cercle, du poteau à la sablière ; l'ouverture se referme en anse de panier.
  const r = 36;
  for (let a = 0; a <= r; a++) {
    const chute = r - Math.round(Math.sqrt(r * r - (r - a) * (r - a)));
    for (const bx of [x + 11 + a, x + SALLE_LARGEUR - 12 - a]) pl.rect(bx, avantToit + 3 + chute, 1, 5, (_i, j) => (j === avantToit + 3 + chute ? p.bois.clair : j === avantToit + 7 + chute ? p.bois.creux : p.bois.sombre));
  }
  poutre(c, x + 1, avantToit - 2, SALLE_LARGEUR - 2, 6);
  // Le bout des solives, sous la sablière.
  for (let sx = x + 48; sx < x + SALLE_LARGEUR - 48; sx += 23) pl.rect(sx, avantToit + 4, 4, 3, (i, j) => (j === avantToit + 6 || i === sx + 3 ? p.bois.creux : p.bois.fond));
}

/** Une lucarne sur un toit : un petit pignon, une fenêtre qui s'éclaire la nuit. */
function lucarne(c: Chantier, x: number, y: number, bardeaux: boolean): void {
  const { pl, p } = c;
  const tons = bardeaux ? { bord: p.bois.creux, fond: p.bois.fond, rang: p.bois.sombre } : { bord: p.chaume.bord, fond: p.chaume.fond, rang: p.chaume.rang };
  for (let j = 0; j < 13; j++) pl.rect(x - 3 - j, y + j, 20 + j * 2, 1, (i) => (i === x - 3 - j || i === x + 16 + j || j % 6 === 5 ? tons.bord : (i + j) % 5 === 0 ? tons.rang : tons.fond));
  torchis(c, x - 8, y + 13, 30, 17);
  fenetre(c, x, y + 15, 14, 11);
}

/* ---------- La taverne ---------- */

/** La taverne : la salle ouverte sur ses deux longues tables, sous une grande chaumière ; à droite, le cellier de pierre. */
export function poserTaverne(planche: Planche, p: Palette, l: Lumiere, e: Emplacement): void {
  const t: Teinte = (couleur) => couleurDuDedans(couleur, l);
  const c = chantierSur(planche, p, l, e.pied, 7);
  const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const x = e.x;
  const g = e.pied;
  const avantToit = g - SALLE_AVANT_TOIT;
  const fond = PLANCHER - 36;
  // Le mur du fond en planches couchées, le plancher en lames qui viennent vers nous.
  const planches = (i: number, j: number): string => {
    const bande = Math.floor((j - avantToit) / 7);
    if ((j - avantToit) % 7 === 6 || (i + bande * 17) % 41 === 0) return "#4a2f1a";
    if (alea(i >> 1, bande + 60) < 0.012) return "#523419";
    return bande % 2 === 0 ? "#7a5232" : "#70492c";
  };
  poserPiece(
    planche,
    {
      de: x + 10,
      a: x + SALLE_LARGEUR - 11,
      haut: avantToit,
      fond,
      devant: PLANCHER,
      fuite: 18,
      mur: planches,
      cote: planches,
      sol: (i, j, part) => {
        const lame = Math.floor((j - fond) / 6);
        if ((j - fond) % 6 === 0) return "#7a5c3a";
        if ((i + lame * 41) % 83 === 0) return "#6a4f32";
        return alea(i, j) < 0.04 ? "#94744a" : part > 0.5 ? "#a8865a" : "#9a784c";
      },
    },
    t,
  );
  // Le long du mur : des tonneaux, une fenêtre, des étagères de cruches, le grand fût sur son chevalet.
  poserEtagere(planche, x + 78, x + 156, avantToit + 34, t);
  poserFenetre(planche, x + 176, avantToit + 16, l, t);
  poserEtagere(planche, x + 218, x + 290, avantToit + 34, t);
  poserTonneau(planche, x + 34, fond + 2, t);
  poserTonneau(planche, x + 52, fond + 2, t);
  poserTonneau(planche, x + 43, fond - 18, t);
  poserFut(planche, x + SALLE_LARGEUR - 50, fond + 3, t);
  for (const tx of [x + 66, x + 164, x + 206, x + 302]) poserTorche(planche, tx, avantToit + 28, l);
  poserTables(planche, e, t);
  // Le seuil de planches, vu par la tranche.
  planche.rect(x + 4, PLANCHER + 1, SALLE_LARGEUR - 8, g - PLANCHER, (i, j) => (j === PLANCHER + 1 ? p.bois.clair : j === g ? p.bois.creux : (i - x) % 21 === 0 ? p.bois.sombre : p.bois.autre));
  cadre(c, x, avantToit);
  // La guirlande de houblon, d'une lanterne à l'autre sous la sablière.
  const feuille = [k("#5f9a3c", "#274a2c"), k("#7fb04a", "#345a34"), k("#3f7a30", "#1c3a26")];
  const cone = k("#c9c24a", "#5c5a2c");
  for (let i = x + 50; i <= x + SALLE_LARGEUR - 50; i++) {
    const creux = avantToit + 6 + Math.round(7 * Math.sin((Math.PI * ((i - x - 50) % 68)) / 68) ** 2);
    if (alea(i, 71) < 0.82) planche.poser(i, creux, feuille[Math.floor(alea(i, 3) * 3)]!);
    if (alea(i, 72) < 0.5) planche.poser(i, creux + 1, feuille[Math.floor(alea(i, 5) * 3)]!);
    if ((i - x) % 9 === 4) planche.rect(i, creux + 2, 2, 3, cone);
  }
  for (const lx of [x + 118, x + 186, x + 254]) poserLanterne(planche, p, lx, avantToit + 4);

  // Le cellier, adossé au pignon : un mur de pierre qui s'abaisse, une porte basse sous son arc, des tonneaux dehors.
  const pente = (i: number): number => g - 112 + Math.round(((i - (x + SALLE_LARGEUR)) * 50) / 78);
  for (let i = x + SALLE_LARGEUR - 3; i <= x + SALLE_LARGEUR + 74; i++) {
    const haut = pente(i) + 10;
    for (let j = haut; j <= g; j++) {
      const lit = Math.floor((g - j) / 5);
      const pierre = Math.floor((i + lit * 6) / 11);
      const ton = alea(pierre, lit + 31);
      let couleur = ton < 0.3 ? k("#9a917f", "#504e58") : ton < 0.65 ? k("#8a8274", "#474550") : k("#7a7468", "#403e48");
      if ((g - j) % 5 === 4 || (i + lit * 6) % 11 === 0) couleur = k("#5c564c", "#2c2a30");
      else if ((g - j) % 5 === 3) couleur = k("#b3aa9a", "#5e5c66");
      if (j < haut + 3) couleur = k("#5c564c", "#2c2a30");
      planche.poser(i, j, couleur);
    }
  }
  const px = x + SALLE_LARGEUR + 14;
  for (let a = -17; a <= 17; a++) {
    const haut = g - 46 - Math.round(Math.sqrt(Math.max(0, 17 * 17 - a * a)) * 0.5);
    planche.rect(px + 13 + a, haut - 5, 1, 5, (_i, j) => ((a + 40) % 7 === 0 ? k("#5c564c", "#2c2a30") : j === haut - 5 ? k("#c4bbaa", "#666470") : k("#a39a8a", "#56545e")));
    planche.rect(px + 13 + a, haut, 1, g - 44 - haut, p.bois.creux);
  }
  porte(c, px, g - 44, 26, 44);
  poserTonneau(planche, x + SALLE_LARGEUR + 50, g, (couleur) => couleurDuDehors(couleur, melanger(couleur, "#141a34", 0.5), l));
  poserTonneau(planche, x + SALLE_LARGEUR + 62, g - 1, (couleur) => couleurDuDehors(couleur, melanger(couleur, "#141a34", 0.5), l));

  // Le toit : une grande chaumière, en croupe à gauche ; son faîte fléchit, son avant-toit ondule.
  const faite = g - 206;
  const flechi = (i: number): number => faite + Math.round(3 * Math.sin((Math.PI * Math.min(290, Math.max(0, i - x - 54))) / 290));
  const bords = (y: number): readonly [number, number] => {
    const part = Math.min(1, (y - faite) / (avantToit - 2 - faite));
    return [x - 9 + Math.round(62 * (1 - part)), x + SALLE_LARGEUR + 7 - Math.round(26 * (1 - part))];
  };
  toit(c, { haut: faite, bas: avantToit - 2, bords, hautDe: flechi, basDe: (i) => avantToit - 2 + Math.round(1.6 * Math.sin(i / 21)), mousse: true });
  for (let i = x + 52; i <= x + SALLE_LARGEUR - 18; i++) {
    const y = flechi(i);
    planche.poser(i, y - 1, (i & 3) === 0 ? p.chaume.bord : p.chaume.rang);
    if ((i & 7) < 3) planche.poser(i, y - 2, p.chaume.bord);
    if ((i - x) % 104 === 70) {
      biais(c, i - 7, y + 7, i + 3, y - 5, 2);
      biais(c, i + 7, y + 7, i - 3, y - 5, 2);
    }
  }
  lucarne(c, x + 148, g - 180, false);
  // Le chaume du cellier, vu par sa rive : une bande épaisse qui descend vers la droite.
  for (let i = x + SALLE_LARGEUR - 6; i <= x + SALLE_LARGEUR + 83; i++) {
    const haut = pente(i);
    for (let j = 0; j < 12; j++) planche.poser(i, haut + j, j === 0 || j >= 10 ? p.chaume.bord : j % 4 === 3 ? p.chaume.rang : alea(i, haut + j) < 0.16 ? p.chaume.brin : j < 4 ? p.chaume.clair : p.chaume.fond);
    if (alea(i, 9) < 0.5) planche.poser(i, haut + 12, p.chaume.bord);
  }
  // La souche de la cheminée, entre la salle et le cellier : elle dépasse le faîte.
  pierres(c, x + 350, g - 208, 20, 98);
  planche.rect(x + 348, g - 212, 24, 4, (_i, j) => (j === g - 212 ? k("#b3aa9a", "#5e5c66") : k("#6f685c", "#3a3840")));

  // L'enseigne, au bout de sa potence : une chope.
  poutre(c, x - 26, avantToit + 8, 32, 3);
  biais(c, x + 4, avantToit + 26, x - 12, avantToit + 11, 2);
  const ex = x - 24;
  planche.rect(ex + 6, avantToit + 11, 1, 4, p.bois.creux);
  planche.rect(ex + 17, avantToit + 11, 1, 4, p.bois.creux);
  planche.rect(ex, avantToit + 15, 24, 20, (i, j) => (i === ex || i === ex + 23 || j === avantToit + 15 || j === avantToit + 34 ? p.bois.creux : p.bois.clair));
  planche.lettres(ex + 6, avantToit + 18, ["..fffff...", ".fffffff..", ".aaaaaaa..", ".assSssaaa", ".assSssa.a", ".assSssa.a", ".assSssaaa", ".assSssa..", ".aaaaaaa.."], { a: "#1a1410", s: "#8d95a6", S: "#c0c9e2", f: "#fff6dc" });
}

/* ---------- La salle de réunion ---------- */

/** La salle de réunion : la halle ouverte sur ses tables, sous un toit de bardeaux à fronton ; à droite, la tourelle de pierre. */
export function poserReunion(planche: Planche, p: Palette, l: Lumiere, e: Emplacement): void {
  const t: Teinte = (couleur) => couleurDuDedans(couleur, l);
  const c = chantierSur(planche, p, l, e.pied, 11);
  const k = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const drapeau = (couleur: string): string => k(couleur, melanger(couleur, "#0a1230", 0.55));
  const x = e.x;
  const g = e.pied;
  const avantToit = g - SALLE_AVANT_TOIT;
  const fond = PLANCHER - 36;
  // Le mur du fond : du torchis sur un soubassement de pierres ; au sol, de larges dalles.
  const mur = (i: number, j: number): string => {
    if (j >= fond - 26) {
      const lit = Math.floor((j - (fond - 26)) / 6);
      if ((j - (fond - 26)) % 6 === 5 || (i + lit * 9) % 18 === 0) return "#4d4840";
      return alea(Math.floor((i + lit * 9) / 18), lit + 3) < 0.4 ? "#7d766a" : "#6a645a";
    }
    if ((j - avantToit) % 9 === 8) return "#a88a5c";
    return alea(i, j) < 0.05 ? "#b0935f" : "#bfa16c";
  };
  poserPiece(
    planche,
    {
      de: x + 10,
      a: x + SALLE_LARGEUR - 11,
      haut: avantToit,
      fond,
      devant: PLANCHER,
      fuite: 18,
      mur,
      cote: mur,
      sol: (i, j) => {
        const lit = Math.floor((j - fond) / 12);
        if ((j - fond) % 12 === 0 || (i + lit * 19) % 38 === 0) return "#94846a";
        return alea(Math.floor((i + lit * 19) / 38), lit + 40) < 0.35 ? "#a89878" : "#9e8e70";
      },
    },
    t,
  );
  // La grande bannière du clan, au milieu : trois bandes sous une hampe, le bas en pointes.
  const centre = x + Math.floor(SALLE_LARGEUR / 2);
  planche.rect(centre - 26, avantToit + 13, 53, 2, (_i, j) => t(j === avantToit + 13 ? "#8a5a30" : "#472d19"));
  for (let i = 0; i < 45; i++) {
    const bande = Math.floor(i / 15);
    const pointe = avantToit + 44 + (7 - Math.abs((i % 15) - 7));
    for (let j = avantToit + 15; j <= pointe; j++) planche.poser(centre - 22 + i, j, t(i % 15 === 14 && bande < 2 ? "#9a968c" : TRICOLORE[bande]!));
  }
  // De part et d'autre : une fenêtre et deux boucliers accrochés.
  for (const [fx, bx] of [
    [x + 70, x + 128],
    [x + 282, x + 244],
  ] as const) {
    poserFenetre(planche, fx, avantToit + 16, l, t);
    for (const [dx, a, b] of [
      [-9, TRICOLORE[0], TRICOLORE[1]],
      [9, TRICOLORE[2], TRICOLORE[1]],
    ] as const) {
      planche.disque(bx + dx, avantToit + 27, 8, (i, j) => {
        const d = i * i + j * j;
        if (d > 56) return t("#3d2616");
        if (d <= 3) return t("#8d95a6");
        return t(i * j >= 0 ? a : b);
      });
    }
  }
  for (const tx of [x + 50, x + 106, x + 262, x + 318]) poserTorche(planche, tx, avantToit + 30, l);
  // Les tables : une carte déroulée au milieu de celle de devant, des bougies.
  poserTables(planche, e, t);
  const table = PLANCHER - 68 + 47;
  planche.rect(centre - 14, table + 1, 28, 3, (i, j) => (i === centre - 14 || i === centre + 13 ? t("#b89c6a") : j === table + 2 && (i - centre) % 5 === 0 ? t("#8a6238") : t("#e9dcb8")));
  for (const bx of [x + 62, x + 138, x + 232, x + 308]) {
    planche.rect(bx, table - 4, 2, 5, t("#e9e2cf"));
    planche.rect(bx, table - 6, 2, 2, "#ffd75a");
    planche.poser(bx, table - 7, "#f58a1f");
  }
  // Deux marches de pierre, plus larges que la halle.
  const marche = (mx: number, my: number, large: number, haute: number): void =>
    planche.rect(mx, my, large, haute, (i, j) => (j === my ? k("#c4bbaa", "#666470") : j === my + haute - 1 || (i - x + 400) % 26 === 0 ? k("#5c564c", "#2c2a30") : k("#8a8274", "#474550")));
  marche(x + 2, PLANCHER + 1, SALLE_LARGEUR - 4, 2);
  marche(x - 5, PLANCHER + 3, SALLE_LARGEUR + 10, g - PLANCHER - 2);
  cadre(c, x, avantToit);
  for (const lx of [x + 96, x + 276]) poserLanterne(planche, p, lx, avantToit + 4);

  // La tourelle de pierre, à droite : ronde, deux meurtrières qui s'éclairent la nuit, une porte basse.
  const tx0 = x + SALLE_LARGEUR + 4;
  const tourHaut = g - 150;
  pierres(c, tx0, tourHaut, 60, 151);
  planche.rect(tx0, tourHaut, 5, 151, (i, j) => melanger(planche.lire(i, j) ?? "#8a8274", k("#f4ecd8", "#8088a0"), 0.22));
  planche.rect(tx0 + 50, tourHaut, 10, 151, (i, j) => melanger(planche.lire(i, j) ?? "#8a8274", k("#2c2a30", "#101018"), 0.3 + (i - tx0 - 50) * 0.03));
  const lueur = melanger(k("#2a3048", "#161a2c"), "#f5b04a", 0.8 * (1 - l.jour));
  for (const [mx, my] of [
    [tx0 + 18, tourHaut + 26],
    [tx0 + 38, tourHaut + 62],
  ] as const) {
    planche.rect(mx - 1, my - 1, 6, 16, k("#5c564c", "#2c2a30"));
    planche.rect(mx, my, 4, 14, lueur);
  }
  porte(c, tx0 + 18, g - 40, 22, 40);
  // Son toit pointu, en bardeaux, qui déborde ; un épi au sommet.
  const pointe = g - 218;
  toit(c, { haut: pointe, bas: tourHaut + 4, bords: (y) => [tx0 + 30 - Math.round(3 + (35 * (y - pointe)) / (tourHaut + 4 - pointe)), tx0 + 30 + Math.round(3 + (35 * (y - pointe)) / (tourHaut + 4 - pointe))], bardeaux: true });
  planche.rect(tx0 + 30, pointe - 7, 1, 7, p.bois.creux);
  planche.rect(tx0 + 29, pointe - 9, 3, 3, k("#e2b23c", "#7a6430"));

  // Le toit de bardeaux de la halle, en croupe aux deux bouts.
  const faite = g - 192;
  const bords = (y: number): readonly [number, number] => {
    const part = Math.min(1, (y - faite) / (avantToit - 2 - faite));
    return [x - 7 + Math.round(46 * (1 - part)), x + SALLE_LARGEUR + 6 - Math.round(46 * (1 - part))];
  };
  toit(c, { haut: faite, bas: avantToit - 2, bords, bardeaux: true });
  planche.rect(x + 36, faite - 2, SALLE_LARGEUR - 72, 2, (i) => ((i & 1) === 0 ? p.bois.clair : p.bois.fond));
  // Le fronton, au milieu : un pignon de torchis et de pans de bois, le bouclier du clan, deux cornes croisées au sommet.
  const sommet = g - 214;
  const base = avantToit - 3;
  const demi = (y: number): number => Math.round((78 * (y - sommet)) / (base - sommet));
  for (let y = sommet + 6; y <= base; y++) {
    const d = demi(y) - 5;
    for (let i = centre - d; i <= centre + d; i++) {
      const grain = alea(i >> 1, y >> 1);
      planche.poser(i, y, grain < 0.08 ? p.mur.trame : i - centre < -d * 0.5 ? p.mur.clair : i - centre > d * 0.6 ? p.mur.sombre : p.mur.fond);
    }
  }
  poteau(c, centre - 2, sommet + 8, 5, base - sommet - 8);
  poutre(c, centre - demi(base - 26) + 5, base - 28, demi(base - 26) * 2 - 9, 4);
  biais(c, centre - 52, base - 2, centre - 6, base - 26, 3);
  biais(c, centre + 52, base - 2, centre + 6, base - 26, 3);
  poutre(c, centre - 76, base - 2, 153, 5);
  planche.disque(centre, base - 46, 11, (i, j) => {
    const d = i * i + j * j;
    if (d > 110) return p.bois.creux;
    if (d <= 4) return k("#c0c9e2", "#6a7088");
    return drapeau(i * j >= 0 ? (i < 0 ? TRICOLORE[0] : TRICOLORE[2]) : TRICOLORE[1]);
  });
  // Les deux rives du fronton : des bardeaux épais, qui débordent ; puis les cornes.
  for (let y = sommet; y <= base + 3; y++) {
    const d = demi(Math.min(y, base)) + (y > base ? y - base : 0);
    for (const sens of [-1, 1]) planche.rect(centre + sens * d - (sens === 1 ? 6 : 0), y, 7, 1, (i) => ((i - centre) * sens >= d - 1 ? p.bois.creux : (y - sommet) % 6 === 5 ? p.bois.creux : sens === -1 ? p.bois.clair : p.bois.sombre));
  }
  biais(c, centre - 10, sommet + 8, centre + 9, sommet - 12, 3);
  biais(c, centre + 10, sommet + 8, centre - 9, sommet - 12, 3);
  // Sous le fronton, deux pendentifs sculptés.
  for (const sx of [centre - 76, centre + 73]) {
    poteau(c, sx, avantToit + 4, 4, 12);
    planche.rect(sx - 1, avantToit + 16, 6, 4, p.bois.sombre);
    planche.rect(sx, avantToit + 20, 4, 2, p.bois.creux);
  }
  lucarne(c, x + 62, g - 176, true);
  lucarne(c, x + 296, g - 176, true);

  // Le mât et la longue bannière du clan, à gauche ; deux fanions sous l'avant-toit.
  const mat = x - 16;
  poteau(c, mat, g - 172, 3, 173);
  planche.rect(mat - 1, g - 175, 5, 3, k("#e2b23c", "#7a6430"));
  planche.rect(mat + 3, g - 166, 17, 2, p.bois.creux);
  for (let i = 0; i < 15; i++) {
    const long = 64 + (3 - Math.abs((i % 5) - 2)) * 2;
    for (let j = 0; j < long; j++) planche.poser(mat + 4 + i, g - 164 + j, drapeau(i % 5 === 4 && i < 14 ? "#9a968c" : TRICOLORE[Math.floor(i / 5)]!));
  }
  for (const fx of [x + 24, x + SALLE_LARGEUR - 38]) {
    planche.rect(fx - 1, avantToit + 4, 14, 1, p.bois.creux);
    for (let i = 0; i < 12; i++) {
      const bout = avantToit + 26 + (2 - Math.abs((i % 4) - 2));
      for (let j = avantToit + 5; j <= bout; j++) planche.poser(fx + i, j, drapeau(TRICOLORE[Math.floor(i / 4)]!));
    }
  }
}
