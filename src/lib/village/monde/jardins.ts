/**
 * Les jardins du monde du village (demande du pilote, 15 novembre 2026 : « ajouter des jardins, des clôtures, des arbres
 * et des chemins pour remplir ») : ce qui garnit les pentes entre les terrasses, les places de maison encore libres et le
 * pré du bas. Des potagers clos, des vergers, des vignes, des bosquets de sapins et de bouleaux, des sentiers à marches,
 * des murets, des haies, du linge qui sèche, des bancs, de petits puits, des ruches, des meules de foin, une mare.
 *
 * Tout est dessiné case par case, à l'échelle des Gaulois, dans le repère d'un étage. Rien n'est tiré au hasard : chaque
 * parcelle prend son motif d'après sa colonne (`alea`), la même à chaque dessin. Rien ne se pose là où marchent les
 * Gaulois : les pentes n'ont pas de promeneurs, et dans le pré du bas tout est bas ou au bord. Design : Claude Fable 5.2.
 */
import { type Palette, type Planche, alea } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import { poserBuisson, poserGrandArbre } from "./pieces";

type Teintes = ReturnType<typeof teintesDuJardin>;

/** Les couleurs propres aux jardins, à cette heure. */
function teintesDuJardin(l: Lumiere) {
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
function poserMuret(pl: Planche, t: Teintes, x0: number, x1: number, y: number): void {
  pl.rect(x0, y - 5, x1 - x0 + 1, 6, (i, j) => {
    const lit = Math.floor((y - j) / 3);
    if ((y - j) % 3 === 2 && j !== y - 5) return t.pierreSombre;
    if ((i + lit * 4) % 7 === 0) return t.pierreSombre;
    return j === y - 5 ? t.pierreClaire : alea(Math.floor((i + lit * 4) / 7), lit) < 0.4 ? t.pierreClaire : t.pierre;
  });
}

/** Un potager clos : des planches de terre, des rangs de choux, de salades, de carottes et de courges, une clôture autour. */
function poserPotager(pl: Planche, p: Palette, t: Teintes, x: number, y: number, largeur: number, graine: number): void {
  const haut = y - 22;
  pl.rect(x, haut, largeur, 22, (i, j) => ((j - haut) % 6 === 5 ? t.sillon : alea(i, j) < 0.08 ? t.sillon : t.terre));
  for (let rang = 0; rang < 3; rang++) {
    const sorte = Math.floor(alea(graine + rang, 3) * 4);
    const ry = haut + 3 + rang * 6;
    for (let i = x + 4; i < x + largeur - 4; i += sorte === 3 ? 9 : 5) {
      if (sorte === 0) pl.lettres(i - 1, ry - 2, [".c.", "ccc", ".c."], { c: t.chou });
      else if (sorte === 1) pl.lettres(i - 1, ry - 1, ["s.s", ".s."], { s: t.salade });
      else if (sorte === 2) pl.lettres(i, ry - 2, ["v", "v", "o"], { v: t.salade, o: t.carotte });
      else pl.lettres(i - 2, ry - 2, [".v...", "ooo..", "ooov."], { o: t.courge, v: t.chou });
    }
  }
  pl.rect(x - 2, haut - 1, largeur + 4, 1, p.bois.sombre);
  poserCloture(pl, p, x - 3, x + largeur + 2, y + 2);
  // Le portillon et un arrosoir de bois.
  pl.rect(x + Math.floor(largeur / 2) - 4, y - 6, 8, 9, (i, j) => ((i + j) % 3 === 0 ? p.bois.clair : p.bois.fond));
}

/** Un arbre fruitier : un tronc court, une ramure ronde piquée de fruits. */
function poserFruitier(pl: Planche, p: Palette, cx: number, pied: number, fruit: string, taille = 1): void {
  const r = Math.round(12 * taille);
  pl.rect(cx - 1, pied - Math.round(14 * taille), 3, Math.round(14 * taille) + 1, (i) => (i === cx - 1 ? p.tronc.clair : i === cx + 1 ? p.tronc.sombre : p.tronc.fond));
  pl.disque(cx, pied - Math.round(14 * taille) - r + 3, r, (dx, dy) => {
    const pente = (dx * 0.6 + dy) / r;
    if (dx * dx + dy * dy > r * r * 0.8 && pente > -0.2) return p.feuilles.sombre;
    if (alea(cx + dx * 3, dy * 5 + 7) < 0.07) return fruit;
    return pente < -0.5 ? p.feuilles.claire : pente > 0.4 ? p.feuilles.sombre : p.feuilles.fond;
  });
}

/** Un sapin : des étages de branches en dents de scie, éclairés à gauche. */
function poserSapin(pl: Planche, p: Palette, t: Teintes, cx: number, pied: number, hauteur: number): void {
  pl.rect(cx - 1, pied - 6, 3, 7, (i) => (i === cx + 1 ? p.tronc.sombre : p.tronc.fond));
  const etages = Math.max(3, Math.round(hauteur / 11));
  for (let e = 0; e < etages; e++) {
    const bas = pied - 5 - Math.round((e * (hauteur - 6)) / etages);
    const large = Math.round((hauteur / 4.2) * (1 - e / (etages + 0.6))) + 2;
    const haut = Math.round((hauteur - 6) / etages) + 4;
    for (let k = 0; k < haut; k++) {
      const demi = Math.max(0, Math.round(large * (1 - k / haut)));
      for (let dx = -demi; dx <= demi; dx++) pl.poser(cx + dx, bas - k, dx < -demi / 3 ? t.sapinClair : dx > demi / 3 || k === 0 ? t.sapinSombre : t.sapin);
    }
  }
}

/** Un bouleau : un tronc blanc rayé de noir, un feuillage léger et jaune-vert. */
function poserBouleau(pl: Planche, p: Palette, t: Teintes, cx: number, pied: number, hauteur: number): void {
  pl.rect(cx - 1, pied - hauteur + 12, 3, hauteur - 11, (i, j) => ((j * 3 + i) % 7 === 0 ? t.ecorceTrait : i === cx + 1 ? melanger(t.ecorce, t.ecorceTrait, 0.3) : t.ecorce));
  for (const [dx, dy, r] of [
    [0, -hauteur + 10, 9],
    [-6, -hauteur + 17, 7],
    [6, -hauteur + 16, 7],
    [1, -hauteur + 22, 6],
  ] as const) {
    pl.disque(cx + dx, pied + dy, r, (i, j) => {
      if ((i + j * 2 + cx) % 3 === 0) return null;
      return (i * 0.6 + j) / r < -0.3 ? t.feuilleJaune : alea(cx + i, j + dy) < 0.3 ? p.feuilles.claire : p.feuilles.fond;
    });
  }
}

/** Un banc de bois, vu de face. */
function poserBanc(pl: Planche, p: Palette, x: number, y: number): void {
  pl.rect(x, y - 9, 22, 2, p.bois.clair);
  pl.rect(x, y - 6, 22, 2, p.bois.fond);
  pl.rect(x - 1, y - 4, 24, 2, (_i, j) => (j === y - 4 ? p.bois.clair : p.bois.sombre));
  for (const px of [x + 1, x + 19]) pl.rect(px, y - 10, 2, 11, p.bois.sombre);
}

/** Un petit puits de terrasse : une margelle de pierre, deux montants, un toit de planches, un seau. */
function poserPetitPuits(pl: Planche, p: Palette, t: Teintes, x: number, y: number): void {
  pl.rect(x, y - 9, 20, 10, (i, j) => ((j - y) % 4 === 0 || (i + Math.floor((y - j) / 4) * 3) % 6 === 0 ? t.pierreSombre : i < x + 5 ? t.pierreClaire : t.pierre));
  pl.rect(x - 1, y - 10, 22, 2, t.pierreClaire);
  for (const px of [x + 1, x + 17]) pl.rect(px, y - 24, 2, 14, p.bois.fond);
  for (let k = 0; k < 7; k++) pl.rect(x - 3 + k, y - 25 - (6 - k), 26 - k * 2, 1, k % 2 === 0 ? p.bois.clair : p.bois.sombre);
  pl.rect(x + 9, y - 22, 1, 7, p.bois.corde);
  pl.rect(x + 7, y - 15, 5, 4, (i, j) => (j === y - 15 ? p.bois.clair : i === x + 7 || i === x + 11 ? p.bois.sombre : p.bois.fond));
}

/** Du linge qui sèche : deux perches, une corde, des draps et des tuniques de couleur. */
function poserLinge(pl: Planche, p: Palette, t: Teintes, x: number, y: number, largeur: number, graine: number): void {
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
function poserRuches(pl: Planche, p: Palette, t: Teintes, x: number, y: number): void {
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
function poserMeule(pl: Planche, t: Teintes, cx: number, y: number, r = 13): void {
  for (let dy = -r - 4; dy <= 0; dy++) {
    const demi = Math.round(r * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((r + 4) * (r + 4)))));
    for (let dx = -demi; dx <= demi; dx++) pl.poser(cx + dx, y + dy, Math.abs(dx) === demi ? t.pailleSombre : (dx + dy * 2) % 5 === 0 ? t.pailleSombre : dx < -demi / 3 ? t.pailleClaire : t.paille);
  }
  pl.rect(cx, y - r - 8, 1, 5, t.ecorceTrait);
}

/** Une vigne : des rangs de ceps sur des piquets, piqués de grappes. */
function poserVigne(pl: Planche, p: Palette, t: Teintes, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    if ((x - x0) % 12 === 0) pl.rect(x, y - 9, 1, 10, p.bois.sombre);
    for (let k = 3; k < 9; k++) {
      if (alea(x, y + k) < 0.25) continue;
      pl.poser(x, y - k, k > 6 ? p.feuilles.claire : alea(x * 3, k) < 0.08 ? t.raisin : t.vigne);
    }
  }
}

/** Un sentier de terre qui descend la pente en lacet, avec des marches de rondins. */
function poserSentier(pl: Planche, p: Palette, x: number, haut: number, bas: number, largeur: number): void {
  for (let y = haut; y < bas; y++) {
    const part = (y - haut) / (bas - haut);
    // Deux lacets : il va d'un bord à l'autre de la parcelle, puis revient.
    const milieu = x + Math.round((largeur / 2) * (1 + 0.8 * Math.sin(part * Math.PI * 2.2)));
    for (let dx = -5; dx <= 5; dx++) {
      const g = alea(milieu + dx, y + 300);
      if (Math.abs(dx) === 5 && (milieu + dx + y) % 2 === 0) continue;
      pl.poser(milieu + dx, y, (y - haut) % 9 === 0 ? p.bois.clair : g < 0.12 ? p.terre.claire : g < 0.25 ? p.terre.sombre : p.terre.fond);
    }
  }
}

/** Une mare : de l'eau calme, des joncs, deux nénuphars. */
function poserMare(pl: Planche, p: Palette, t: Teintes, cx: number, cy: number, rx: number, ry: number): void {
  for (let dy = -ry - 2; dy <= ry + 2; dy++) {
    for (let dx = -rx - 2; dx <= rx + 2; dx++) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d > 1.25) continue;
      pl.poser(cx + dx, cy + dy, d > 1 ? p.terre.sombre : d > 0.82 ? melanger(t.eau, "#0a1230", 0.3) : (dx + dy * 3) % 11 === 0 ? t.eauClaire : t.eau);
    }
  }
  for (const dx of [-rx + 2, -rx + 5, rx - 4]) pl.rect(cx + dx, cy - ry - 5, 1, 7, p.feuilles.fond);
  pl.rect(cx - 4, cy, 4, 2, p.feuilles.claire);
  pl.rect(cx + 5, cy - 2, 3, 2, p.feuilles.claire);
  pl.poser(cx + 6, cy - 3, t.rose);
}

/** Un parterre de fleurs : des touffes de deux couleurs, serrées. */
function poserFleurs(pl: Planche, p: Palette, x: number, y: number, largeur: number, hauteur: number, a: string, b: string): void {
  for (let j = y; j < y + hauteur; j++) {
    for (let i = x; i < x + largeur; i++) {
      const g = alea(i * 3 + 1, j * 5 + 2);
      if (g < 0.1) pl.poser(i, j, g < 0.05 ? a : b);
      else if (g < 0.16) pl.poser(i, j, p.herbe.claire);
    }
  }
}

/** Une cabane de jardin en planches, sous un petit toit de chaume. */
function poserCabane(pl: Planche, p: Palette, x: number, y: number): void {
  pl.rect(x, y - 20, 28, 21, (i, j) => ((i - x) % 5 === 4 ? p.bois.sombre : j === y ? p.bois.creux : p.bois.fond));
  pl.rect(x + 9, y - 14, 9, 15, (i, j) => (i === x + 9 || i === x + 17 || j === y - 14 ? p.bois.creux : p.bois.sombre));
  for (let r = 0; r < 11; r++) {
    const demi = 4 + r * 1.3;
    for (let dx = -Math.round(demi); dx <= Math.round(demi); dx++) pl.poser(x + 14 + dx, y - 31 + r, r === 10 || Math.abs(dx) >= Math.round(demi) ? p.chaume.bord : dx < -demi / 3 ? p.chaume.clair : dx > demi / 3 ? p.chaume.sombre : p.chaume.fond);
  }
}

/** La largeur d'une parcelle de pente, en cases. */
const PARCELLE = 168;
/** L'écart entre deux ressauts d'une pente (`etages.ts`), où se posent les jardins. */
const RESSAUT = 46;

/**
 * Les jardins d'une pente, de la colonne `de` à la colonne `a` : une parcelle toutes les 168 cases, chacune son motif
 * (potager et verger, bosquet, linge et puits, sentier en lacet, verger et ruches, vigne et meule, pré fleuri, cabane),
 * posée sur les ressauts de la pente. `haut` et `bas` : les rangées de la pente ; `libre` dit si une colonne est libre
 * (ni escalier, ni cascade, ni falaise).
 */
export function poserJardinsDeLaPente(pl: Planche, p: Palette, l: Lumiere, de: number, a: number, haut: number, bas: number, graine: number, libre: (x0: number, x1: number) => boolean): void {
  const t = teintesDuJardin(l);
  const fruits = [t.rouge, t.jaune, t.carotte];
  for (let k = Math.floor((de - PARCELLE) / PARCELLE); k * PARCELLE < a + PARCELLE; k++) {
    const x = k * PARCELLE + 10;
    if (x < 30 || !libre(x - 6, x + PARCELLE - 14)) continue;
    const motif = Math.floor(alea(k, graine * 31 + 7) * 8);
    // Les ressauts de cette parcelle : là où le terrain est à peu près plat.
    const ressauts: number[] = [];
    for (let y = haut + 30; y < bas - 8; y += RESSAUT) ressauts.push(y - 2);
    const r = (i: number): number => ressauts[Math.min(ressauts.length - 1, i)] ?? haut + 28;
    const fruit = fruits[Math.abs(k) % 3]!;
    if (motif === 0) {
      poserPotager(pl, p, t, x + 8, r(0), 96, k);
      for (let i = 0; i < 4; i++) poserFruitier(pl, p, x + 20 + i * 34, r(1), fruit, 0.9);
      poserFleurs(pl, p, x + 4, r(2) - 10, 140, 10, t.blanc, t.jaune);
      poserBanc(pl, p, x + 112, r(0));
    } else if (motif === 1) {
      for (const [dx, i, h] of [
        [14, 0, 44],
        [44, 0, 58],
        [82, 0, 40],
        [26, 1, 52],
        [112, 1, 46],
        [64, 2, 60],
        [128, 2, 42],
      ] as const)
        poserSapin(pl, p, t, x + dx, r(i), h);
      poserBouleau(pl, p, t, x + 118, r(0), 50);
      poserBouleau(pl, p, t, x + 70, r(1), 46);
      poserBuisson(pl, p, x + 20, r(2) + 2, 1);
      poserBuisson(pl, p, x + 96, r(2) + 2, 0.8);
    } else if (motif === 2) {
      poserLinge(pl, p, t, x + 6, r(0), 84, k);
      poserPetitPuits(pl, p, t, x + 110, r(0));
      poserHaie(pl, p, x, x + 146, r(1));
      poserBanc(pl, p, x + 20, r(2));
      poserFleurs(pl, p, x + 50, r(2) - 12, 90, 12, t.rose, t.blanc);
      poserFruitier(pl, p, x + 132, r(2), fruit, 0.8);
    } else if (motif === 3) {
      poserSentier(pl, p, x + 8, haut + 4, bas - 2, 120);
      poserMuret(pl, t, x, x + 44, r(0));
      poserMuret(pl, t, x + 96, x + 146, r(1));
      poserBouleau(pl, p, t, x + 136, r(0), 48);
      poserSapin(pl, p, t, x + 12, r(2), 46);
      poserBuisson(pl, p, x + 84, r(2) + 2, 0.9);
    } else if (motif === 4) {
      for (let i = 0; i < 4; i++) poserFruitier(pl, p, x + 16 + i * 38, r(0), fruit, 1);
      for (let i = 0; i < 4; i++) poserFruitier(pl, p, x + 34 + i * 36, r(1), fruits[(Math.abs(k) + 1) % 3]!, 0.9);
      poserRuches(pl, p, t, x + 8, r(2));
      poserCloture(pl, p, x + 56, x + 146, r(2) + 1);
      poserFleurs(pl, p, x + 60, r(2) - 14, 84, 10, t.jaune, t.blanc);
    } else if (motif === 5) {
      for (let i = 0; i < 3; i++) {
        poserVigne(pl, p, t, x + 4, x + 104, r(i));
        poserVigne(pl, p, t, x + 4, x + 104, r(i) - 16);
      }
      poserMeule(pl, t, x + 128, r(0), 12);
      poserMeule(pl, t, x + 126, r(2), 14);
      poserCabane(pl, p, x + 114, r(1));
    } else if (motif === 6) {
      poserGrandArbre(pl, p, x + 74, r(1), 0.55);
      poserFleurs(pl, p, x, r(0) - 16, 150, 16, t.rouge, t.blanc);
      poserFleurs(pl, p, x, r(2) - 16, 150, 16, t.jaune, t.rose);
      poserBanc(pl, p, x + 100, r(1));
      poserMare(pl, p, t, x + 30, r(2) - 14, 22, 7);
      poserBouleau(pl, p, t, x + 136, r(2), 44);
    } else {
      poserCabane(pl, p, x + 6, r(0));
      poserPotager(pl, p, t, x + 46, r(0), 92, k + 5);
      poserHaie(pl, p, x + 2, x + 70, r(1));
      poserLinge(pl, p, t, x + 80, r(1), 62, k + 3);
      poserSapin(pl, p, t, x + 20, r(2), 50);
      poserFruitier(pl, p, x + 70, r(2), fruit, 0.9);
      poserFruitier(pl, p, x + 112, r(2), fruit, 1);
    }
  }
}

/**
 * Le jardin d'une place de maison encore libre, sur une terrasse (178 cases de large, le pied sur la ligne du fond) : un
 * clos de bois avec son potager et sa cabane, un verger, un puits et du linge, ou des meules. La maison le remplacera.
 */
export function poserJardinDeTerrasse(pl: Planche, p: Palette, l: Lumiere, x: number, pied: number, rang: number): void {
  const t = teintesDuJardin(l);
  const motif = ((rang % 5) + 5) % 5;
  const fruit = [t.rouge, t.jaune, t.carotte][Math.abs(rang) % 3]!;
  if (motif === 0) {
    poserCabane(pl, p, x + 8, pied);
    poserPotager(pl, p, t, x + 48, pied, 112, rang);
  } else if (motif === 1) {
    for (let i = 0; i < 4; i++) poserFruitier(pl, p, x + 24 + i * 42, pied, fruit, 1.25);
    poserCloture(pl, p, x + 4, x + 172, pied + 2);
  } else if (motif === 2) {
    poserPetitPuits(pl, p, t, x + 14, pied);
    poserLinge(pl, p, t, x + 50, pied, 90, rang);
    poserBanc(pl, p, x + 150, pied);
  } else if (motif === 3) {
    poserMeule(pl, t, x + 30, pied, 16);
    poserMeule(pl, t, x + 70, pied, 13);
    poserBouleau(pl, p, t, x + 110, pied, 62);
    poserSapin(pl, p, t, x + 146, pied, 70);
  } else {
    poserHaie(pl, p, x + 4, x + 60, pied);
    poserRuches(pl, p, t, x + 72, pied);
    poserFruitier(pl, p, x + 132, pied, fruit, 1.3);
    poserFleurs(pl, p, x + 6, pied + 3, 160, 6, t.rose, t.jaune);
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
    else if (g < 0.55) poserBouleau(pl, p, t, x + 60, voie + 26, 40);
    else if (g < 0.75) poserHaie(pl, p, x + 30, x + 110, voie + 27);
    // Tout devant, au bord de l'écran : des fleurs, parfois une mare.
    poserFleurs(pl, p, x + 10, bas - 9, 190, 8, g < 0.5 ? t.jaune : t.rouge, t.blanc);
    if (g > 0.86) poserMare(pl, p, t, x + 150, bas - 7, 20, 4);
  }
}
