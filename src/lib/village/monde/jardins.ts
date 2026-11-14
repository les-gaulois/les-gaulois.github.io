/**
 * Les petits ouvrages des jardins du monde du village, tous vus de côté et posés sur leur sol : la clôture, la haie, le
 * muret, le banc, le petit puits, le linge qui sèche, les ruches, la meule de foin, les fleurs ; et le bord du pré du
 * bas. Ils garnissent les places de maison encore libres des terrasses du fond (`lointain.ts`), le fond de la grand-rue
 * et le pré du bas. Depuis la proposition « les terrasses » (pilote, 14 novembre 2026), plus rien n'est semé sur la face
 * d'une pente ni vu du dessus : ni potager, ni mare, ni sentier en lacet.
 *
 * Tout est dessiné case par case, à l'échelle des Gaulois. Rien n'est tiré au hasard : `alea` donne un grain qui ne bouge
 * pas. Design : Claude Fable 5.2.
 */
import { type Palette, type Planche, alea } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";

export type Teintes = ReturnType<typeof teintesDuJardin>;

/** Les couleurs propres aux jardins, à cette heure. */
export function teintesDuJardin(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  return {
    terre: c("#6b4a2e", "#33241a"),
    sillon: c("#553a24", "#281c14"),
    chou: c("#7fbf6a", "#35583c"),
    salade: c("#a5d86a", "#47673c"),
    carotte: c("#f08a2a", "#6e4420"),
    courge: c("#e2a83c", "#6e5424"),
    rouge: c("#c8283a", "#5c1c26"),
    rose: c("#e8a0b8", "#6a4a5c"),
    blanc: c("#f4ecd8", "#7f8aa6"),
    jaune: c("#ffd75a", "#8a7a55"),
    bleu: c("#5f80ba", "#2c3c60"),
    sapin: c("#2a6a4a", "#10302a"),
    sapinClair: c("#3f8a5f", "#1a443a"),
    sapinSombre: c("#1c4a36", "#0a2020"),
    ecorce: c("#e9e2cf", "#77788a"),
    ecorceTrait: c("#3d2616", "#1c120a"),
    feuilleJaune: c("#c9c24a", "#56582c"),
    paille: c("#d9b04e", "#6e5a2c"),
    pailleClaire: c("#f0cc68", "#857038"),
    pailleSombre: c("#b48c3a", "#57451e"),
    pierre: c("#8a8274", "#474550"),
    pierreClaire: c("#b3aa9a", "#5e5c66"),
    pierreSombre: c("#5c564c", "#2c2a30"),
    eau: c("#3f86c4", "#16305c"),
    eauClaire: c("#8cc4ee", "#3c5f96"),
    vigne: c("#4f8a3a", "#234026"),
    raisin: c("#6a3f8a", "#2f1f44"),
  };
}

/** Une clôture de bois : des piquets tous les huit cases, deux lisses. `y` : la rangée de son pied. */
export function poserCloture(pl: Planche, p: Palette, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    if ((x - x0) % 8 === 0 || x === x1) pl.rect(x, y - 9, 2, 10, (i, j) => (j === y - 9 ? p.bois.clair : i === x ? p.bois.fond : p.bois.sombre));
    else {
      pl.poser(x, y - 7, p.bois.clair);
      pl.poser(x, y - 3, p.bois.fond);
    }
  }
}

/** Une haie taillée, bosselée, haute de sept cases. */
export function poserHaie(pl: Planche, p: Palette, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    const haut = 6 + ((x * 7) % 5 === 0 ? 1 : 0) + (alea(x, y) < 0.3 ? 1 : 0);
    for (let k = 0; k < haut; k++) pl.poser(x, y - k, k === haut - 1 ? p.feuilles.claire : k < 2 || alea(x, y + k) < 0.2 ? p.feuilles.sombre : p.feuilles.fond);
  }
}

/** Un muret de pierres sèches, haut de six cases. */
export function poserMuret(pl: Planche, t: Teintes, x0: number, x1: number, y: number): void {
  pl.rect(x0, y - 5, x1 - x0 + 1, 6, (i, j) => {
    const lit = Math.floor((y - j) / 3);
    if ((y - j) % 3 === 2 && j !== y - 5) return t.pierreSombre;
    if ((i + lit * 4) % 7 === 0) return t.pierreSombre;
    return j === y - 5 ? t.pierreClaire : alea(Math.floor((i + lit * 4) / 7), lit) < 0.4 ? t.pierreClaire : t.pierre;
  });
}





/** Un banc de bois, vu de face. */
export function poserBanc(pl: Planche, p: Palette, x: number, y: number): void {
  pl.rect(x, y - 9, 22, 2, p.bois.clair);
  pl.rect(x, y - 6, 22, 2, p.bois.fond);
  pl.rect(x - 1, y - 4, 24, 2, (_i, j) => (j === y - 4 ? p.bois.clair : p.bois.sombre));
  for (const px of [x + 1, x + 19]) pl.rect(px, y - 10, 2, 11, p.bois.sombre);
}

/** Un petit puits de terrasse : une margelle de pierre, deux montants, un toit de planches, un seau. */
export function poserPetitPuits(pl: Planche, p: Palette, t: Teintes, x: number, y: number): void {
  pl.rect(x, y - 9, 20, 10, (i, j) => ((j - y) % 4 === 0 || (i + Math.floor((y - j) / 4) * 3) % 6 === 0 ? t.pierreSombre : i < x + 5 ? t.pierreClaire : t.pierre));
  pl.rect(x - 1, y - 10, 22, 2, t.pierreClaire);
  for (const px of [x + 1, x + 17]) pl.rect(px, y - 24, 2, 14, p.bois.fond);
  for (let k = 0; k < 7; k++) pl.rect(x - 3 + k, y - 25 - (6 - k), 26 - k * 2, 1, k % 2 === 0 ? p.bois.clair : p.bois.sombre);
  pl.rect(x + 9, y - 22, 1, 7, p.bois.corde);
  pl.rect(x + 7, y - 15, 5, 4, (i, j) => (j === y - 15 ? p.bois.clair : i === x + 7 || i === x + 11 ? p.bois.sombre : p.bois.fond));
}

/** Du linge qui sèche : deux perches, une corde, des draps et des tuniques de couleur. */
export function poserLinge(pl: Planche, p: Palette, t: Teintes, x: number, y: number, largeur: number, graine: number): void {
  for (const px of [x, x + largeur]) pl.rect(px, y - 26, 2, 27, (i) => (i === px ? p.bois.clair : p.bois.sombre));
  for (let i = x + 2; i < x + largeur; i++) pl.poser(i, y - 24 + Math.round(3 * 4 * ((i - x) / largeur) * (1 - (i - x) / largeur)), p.bois.corde);
  const teintes = [t.blanc, t.bleu, t.rouge, t.blanc, t.jaune, t.rose];
  for (let k = 0, i = x + 5; i + 9 < x + largeur; k++, i += 11) {
    const couleur = teintes[Math.floor(alea(graine + k, 9) * teintes.length)]!;
    const haut = 8 + Math.floor(alea(graine + k, 4) * 6);
    const dy = y - 23 + Math.round(3 * 4 * ((i + 4 - x) / largeur) * (1 - (i + 4 - x) / largeur));
    pl.rect(i, dy, 8, haut, (ix, j) => (ix === i + 7 || j === dy + haut - 1 ? melanger(couleur, "#1a1410", 0.25) : couleur));
  }
}

/** Trois ruches de paille sur une planche. */
export function poserRuches(pl: Planche, p: Palette, t: Teintes, x: number, y: number): void {
  pl.rect(x - 2, y - 3, 34, 2, p.bois.fond);
  for (const px of [x, x + 28]) pl.rect(px, y - 1, 2, 2, p.bois.sombre);
  for (let k = 0; k < 3; k++) {
    const cx = x + 5 + k * 10;
    for (let r = 0; r < 9; r++) {
      const demi = r < 2 ? 1 + r : r > 6 ? 4 : 4;
      for (let dx = -demi; dx <= demi; dx++) pl.poser(cx + dx, y - 12 + r, r % 3 === 2 ? t.pailleSombre : dx < 0 ? t.pailleClaire : t.paille);
    }
    pl.poser(cx, y - 5, t.ecorceTrait);
  }
}

/** Une meule de foin : un dôme de paille, un piquet au sommet. */
export function poserMeule(pl: Planche, t: Teintes, cx: number, y: number, r = 13): void {
  for (let dy = -r - 4; dy <= 0; dy++) {
    const demi = Math.round(r * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((r + 4) * (r + 4)))));
    for (let dx = -demi; dx <= demi; dx++) pl.poser(cx + dx, y + dy, Math.abs(dx) === demi ? t.pailleSombre : (dx + dy * 2) % 5 === 0 ? t.pailleSombre : dx < -demi / 3 ? t.pailleClaire : t.paille);
  }
  pl.rect(cx, y - r - 8, 1, 5, t.ecorceTrait);
}




/** Un parterre de fleurs : des touffes de deux couleurs, serrées. */
export function poserFleurs(pl: Planche, p: Palette, x: number, y: number, largeur: number, hauteur: number, a: string, b: string): void {
  for (let j = y; j < y + hauteur; j++) {
    for (let i = x; i < x + largeur; i++) {
      const g = alea(i * 3 + 1, j * 5 + 2);
      if (g < 0.1) pl.poser(i, j, g < 0.05 ? a : b);
      else if (g < 0.16) pl.poser(i, j, p.herbe.claire);
    }
  }
}


/**
 * Le bord du pré du bas : une clôture le long de la voie, des bosquets et des meules derrière elle, des parterres et une
 * mare au tout premier plan. Rien n'est plus haut qu'une clôture là où passent les promeneurs. `libre` : la colonne est
 * dans le pré (ni ravin, ni gare, ni rivage).
 */
export function poserBordDuPre(pl: Planche, p: Palette, l: Lumiere, de: number, a: number, voie: number, bas: number, libre: (x0: number, x1: number) => boolean): void {
  const t = teintesDuJardin(l);
  for (let k = Math.floor((de - 220) / 220); k * 220 < a + 220; k++) {
    const x = k * 220;
    if (x < 60 || !libre(x, x + 210)) continue;
    const g = alea(k, 517);
    // Au ras de la voie, derrière les promeneurs : la clôture, et de loin en loin une meule, un bouleau, une barrière.
    poserCloture(pl, p, x + 4, x + 180, voie + 22);
    if (g < 0.3) poserMeule(pl, t, x + 40, voie + 26, 11);
    else if (g < 0.75) poserHaie(pl, p, x + 30, x + 110, voie + 27);
    // Tout devant, au bord de l'écran : des fleurs, parfois une mare.
    poserFleurs(pl, p, x + 10, bas - 9, 190, 8, g < 0.5 ? t.jaune : t.rouge, t.blanc);
  }
}
