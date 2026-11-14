/**
 * Le terrain des étages du monde du village (`plan.ts`) : la colline vue de face. Chaque fonction dessine dans le repère
 * de son étage (la ligne du fond à la rangée 300), en colonnes du monde :
 * - une terrasse : son herbe, son sentier, son mur de soutènement, puis la pente qui descend jusqu'à l'étage du dessous ;
 * - la pente sous la grand-rue, où le ruisseau tombe en cascade vers le bas ;
 * - le bas : le pré, le ballast de la voie, le ravin du ruisseau sous le viaduc, puis la falaise, le rivage et la mer ;
 * - les escaliers de pierre qui relient les étages ;
 * - dehors, la terrasse de tables de la taverne et les bancs de la salle de réunion.
 * Rien n'est tiré au hasard : `alea(x, y)` donne un grain qui ne bouge pas. Design : Claude Fable 5.2.
 */
import { type Palette, type Planche, alea } from "../decor";
import { type Lumiere, couleurDuDehors, melanger } from "../lumiere";
import { poserBordDuPre, poserJardinsDeLaPente } from "./jardins";
import { couleursDeLEau, poserBuisson } from "./pieces";
import { type Dehors, DESCENTE, LIGNE, MER_FOND, PAS_DE_TERRASSE, type Plan, RAIL, RUE_HAUTEUR, SIEGE_DEHORS, TERRASSE_FIN, TERRASSE_MUR } from "./plan";

/** La première colonne où les pentes portent des jardins : avant, c'est le bord du monde. */
const LISIERE_DES_JARDINS = 60;

/** Les couleurs de la roche et de la pierre taillée, à cette heure. */
export function couleursDeLaRoche(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  return { clair: c("#b3aa9a", "#5e5c66"), fond: c("#8a8274", "#474550"), sombre: c("#6f685c", "#3a3840"), creux: c("#5c564c", "#2c2a30"), mousse: c("#5f8a4a", "#2a4a36") };
}

/**
 * Une pente d'herbe, de la rangée `haut` à la rangée `bas` : à l'ombre du mur en haut, plus claire en descendant, rayée de
 * plis, semée de pierres, de fleurs et de buissons.
 */
export function poserPente(planche: Planche, p: Palette, l: Lumiere, de: number, a: number, haut: number, bas: number, graine: number): void {
  const roche = couleursDeLaRoche(l);
  const ombre = melanger(p.herbe.sombre, "#0a1230", 0.25);
  // Le versant est à contre-jour : un ton plus sombre que l'herbe des rues.
  const versant = melanger(p.herbe.fond, p.herbe.sombre, 0.6);
  for (let y = haut; y < bas; y++) {
    const part = (y - haut) / Math.max(1, bas - haut);
    for (let x = de; x < a; x++) {
      const g = alea(x + graine * 31, y + 2003);
      // Les plis de la pente : de longues rides sombres, un peu en biais.
      const pli = (y * 3 + Math.round(9 * Math.sin((x + graine * 57) / 61)) + Math.floor(x / 5)) % 34;
      let couleur: string = g < 0.04 ? p.herbe.fond : g < 0.14 ? ombre : versant;
      // Des ressauts courent le long de la pente, tous les 46 rangs : un rebord clair, son ombre dessous.
      const ressaut = (y - haut + Math.round(5 * Math.sin((x + graine * 131) / 97))) % 46;
      if (part < 0.1 && (part < 0.04 || (x + y) % 2 === 0)) couleur = ombre;
      else if (ressaut === 30) couleur = g < 0.8 ? p.herbe.claire : p.herbe.fond;
      else if (ressaut === 31 || ressaut === 32 || (ressaut === 33 && (x + y) % 2 === 0)) couleur = ombre;
      else if (pli === 0 && g > 0.3) couleur = ombre;
      else if (pli === 17 && g > 0.6) couleur = p.herbe.fond;
      planche.poser(x, y, couleur);
    }
  }
  // Les pierres, les fleurs et les buissons, toujours aux mêmes endroits.
  for (let y = haut + 10; y < bas - 12; y += 7) {
    for (let x = de - (de % 11); x < a; x += 11) {
      const g = alea(Math.floor(x / 11) + graine * 7, Math.floor(y / 7) + 77);
      if (g < 0.018) {
        planche.lettres(x, y, [".ccf.", "cfffs", "ffsss"], { c: roche.clair, f: roche.fond, s: roche.sombre });
      } else if (g < 0.03) {
        planche.poser(x, y, couleurDuDehors(g < 0.024 ? "#f4ecc8" : "#ffd75a", "#7f8aa6", l));
        planche.poser(x, y + 1, p.herbe.sombre);
      } else if (g > 0.9978) poserBuisson(planche, p, x, y + 12, 0.9 + (g - 0.9978) * 200);
    }
  }
}

/** Un mur de soutènement en pierres sèches, de la rangée `haut` à la rangée `bas`, coiffé d'herbe. */
function poserMur(planche: Planche, p: Palette, l: Lumiere, de: number, a: number, haut: number, bas: number): void {
  const roche = couleursDeLaRoche(l);
  for (let y = haut; y < bas; y++) {
    const lit = Math.floor((y - haut) / 4);
    for (let x = de; x < a; x++) {
      const pierre = Math.floor((x + lit * 5) / 10);
      let couleur: string = alea(pierre, lit + 9) < 0.3 ? roche.clair : alea(pierre, lit + 9) > 0.8 ? roche.sombre : roche.fond;
      if ((y - haut) % 4 === 3 || (x + lit * 5) % 10 === 0) couleur = roche.creux;
      if (y === haut) couleur = alea(x, 5) < 0.6 ? p.herbe.claire : p.herbe.fond;
      else if (y === haut + 1 && alea(x, 6) < 0.35) couleur = p.herbe.fond;
      else if (alea(x, y + 40) < 0.02) couleur = roche.mousse;
      planche.poser(x, y, couleur);
    }
  }
}

/** Un escalier de pierre vu de face, de la rangée `haut` à la rangée `bas` : des marches, deux murets, un palier au milieu. */
export function poserEscalier(planche: Planche, l: Lumiere, cx: number, haut: number, bas: number): void {
  const roche = couleursDeLaRoche(l);
  const demi = 11;
  for (let y = haut; y < bas; y++) {
    const marche = (y - haut) % 5;
    for (let dx = -demi - 3; dx <= demi + 3; dx++) {
      let couleur: string;
      if (Math.abs(dx) > demi) couleur = dx < 0 ? roche.clair : roche.sombre;
      else if (marche === 0) couleur = roche.clair;
      else if (marche === 4) couleur = roche.creux;
      else couleur = alea(cx + dx, y) < 0.08 ? roche.sombre : roche.fond;
      planche.poser(cx + dx, y, couleur);
    }
  }
  for (const dx of [-demi - 4, demi + 4]) planche.rect(cx + dx, haut - 3, 1, bas - haut + 3, roche.creux);
}

/**
 * Une terrasse de la colline : l'herbe et le sentier où l'on marche, le mur de soutènement, puis la pente jusqu'à l'étage
 * du dessous, avec son escalier. `t` : son rang (1 : juste au-dessus de la grand-rue).
 */
export function poserTerrasse(planche: Planche, p: Palette, l: Lumiere, plan: Plan, de: number, a: number, t: number): void {
  for (let y = LIGNE; y < TERRASSE_MUR; y++) {
    for (let x = de; x < a; x++) {
      const g = alea(x + 3 + t * 13, y + 1009);
      let couleur: string = g < 0.045 ? p.herbe.claire : g < 0.08 ? p.herbe.sombre : p.herbe.fond;
      if (y === LIGNE) couleur = g < 0.5 ? p.herbe.bord : p.herbe.fond;
      // Le sentier de la terrasse, d'un bout de forêt à l'autre : de la terre battue, aux bords mêlés d'herbe.
      if (x > plan.hauts.de - 20 && x < plan.hauts.a + 20) {
        const ecart = Math.abs(y - (334 + Math.round(3 * Math.sin((x + t * 90) / 71))));
        const s = alea(x, y + 300 + t);
        if (ecart <= 7) couleur = s < 0.1 ? p.terre.claire : s < 0.2 ? p.terre.sombre : p.terre.fond;
        else if (ecart <= 10 && (x + y) % 2 === 0) couleur = s < 0.5 ? p.terre.fond : p.terre.sombre;
      }
      planche.poser(x, y, couleur);
    }
  }
  poserMur(planche, p, l, de, a, TERRASSE_MUR, TERRASSE_FIN);
  poserPente(planche, p, l, de, a, TERRASSE_FIN, LIGNE + PAS_DE_TERRASSE, t);
  // Les jardins de la pente, partout où ne passe pas un escalier.
  const escaliers = plan.escaliers.filter((e) => e.de === t).map((e) => e.x);
  poserJardinsDeLaPente(planche, p, l, de, a, TERRASSE_FIN + 4, LIGNE + PAS_DE_TERRASSE - 4, t, (x0, x1) => x0 > plan.hauts.de && x1 < plan.hauts.a && escaliers.every((x) => x < x0 - 22 || x > x1 + 22));
  for (const escalier of plan.escaliers) {
    if (escalier.de === t && escalier.x + 20 > de && escalier.x - 20 < a) poserEscalier(planche, l, escalier.x, TERRASSE_MUR - 2, LIGNE + PAS_DE_TERRASSE + 2);
  }
}

/** La pente sous la grand-rue, jusqu'au bas : son mur, l'herbe, l'escalier, et le ruisseau qui tombe en cascade. */
export function poserPenteDeLaRue(planche: Planche, p: Palette, l: Lumiere, plan: Plan, de: number, a: number): void {
  const bas = LIGNE + DESCENTE;
  poserMur(planche, p, l, de, a, RUE_HAUTEUR, RUE_HAUTEUR + 12);
  poserPente(planche, p, l, de, a, RUE_HAUTEUR + 12, bas, 0);
  // Les jardins de la grande pente : ni sur l'escalier, ni sur la cascade, ni au-dessus de la falaise.
  const descentes = plan.escaliers.filter((e) => e.de === 0).map((e) => e.x);
  poserJardinsDeLaPente(
    planche,
    p,
    l,
    de,
    a,
    RUE_HAUTEUR + 16,
    bas - 4,
    0,
    (x0, x1) => x0 > LISIERE_DES_JARDINS && x1 < plan.mer.de - 40 && descentes.every((x) => x < x0 - 22 || x > x1 + 22) && (plan.ruisseau.x < x0 - 40 || plan.ruisseau.x > x1 + 40),
  );
  for (const escalier of plan.escaliers) {
    if (escalier.de === 0 && escalier.x + 20 > de && escalier.x - 20 < a) poserEscalier(planche, l, escalier.x, RUE_HAUTEUR - 2, bas + 2);
  }
  // La cascade : le ruisseau quitte la grand-rue par une brèche du mur et dévale la pente, d'un rocher à l'autre.
  const eau = couleursDeLEau(l);
  const roche = couleursDeLaRoche(l);
  const cx = plan.ruisseau.x;
  const demi = Math.max(14, Math.round(plan.ruisseau.largeur * 0.3));
  if (cx + demi + 20 < de || cx - demi - 20 > a) return;
  for (let y = RUE_HAUTEUR; y < bas + 20; y++) {
    const milieu = cx + Math.round(4 * Math.sin((y - RUE_HAUTEUR) / 23));
    for (let dx = -demi - 4; dx <= demi + 4; dx++) {
      const x = milieu + dx;
      const g = alea(x, y >> 1);
      let couleur: string;
      if (Math.abs(dx) > demi) couleur = alea(x >> 1, y >> 2) < 0.5 ? roche.fond : roche.sombre;
      else if ((y - RUE_HAUTEUR) % 46 < 3) couleur = eau.ecume;
      else couleur = g < 0.22 ? eau.ecume : g < 0.5 ? eau.claire : eau.fond;
      planche.poser(x, y, couleur);
    }
  }
}

/**
 * Le bas : le pré devant la voie et son ballast, le ravin du ruisseau (que le viaduc enjambe), puis, à l'est, la falaise
 * sous le champ de bataille, le rivage de pierre et la mer jusqu'au bord du monde.
 */
export function poserSolDuBas(planche: Planche, p: Palette, l: Lumiere, plan: Plan, de: number, a: number): void {
  const eau = couleursDeLEau(l);
  const roche = couleursDeLaRoche(l);
  const ballast = { fond: couleurDuDehors("#8f8a80", "#45434c", l), clair: couleurDuDehors("#aba59a", "#56545e", l), sombre: couleurDuDehors("#6f6a62", "#34323a", l) };
  const large = melanger(eau.fond, eau.sombre, 0.45);
  const ravin = { de: plan.ruisseau.x - 60, a: plan.ruisseau.x + 60 };
  for (let y = 40; y < RUE_HAUTEUR; y++) {
    for (let x = de; x < a; x++) {
      const g = alea(x + 5, y + 4001);
      const enMer = x >= plan.mer.de;
      // La falaise, au-dessus de la mer : des bancs de roche, des fissures, de l'herbe qui déborde en haut.
      if (y < LIGNE) {
        if (x < plan.mer.de - 26 || y >= MER_FOND) {
          if (enMer && y >= MER_FOND) planche.poser(x, y, y === MER_FOND ? eau.ecume : g < 0.06 ? eau.claire : (x + y) % 2 === 0 && y < MER_FOND + 8 ? eau.sombre : large);
          continue;
        }
        const bord = x < plan.mer.de ? plan.mer.de - x : 99;
        // Le bord de la falaise descend en biais vers le port.
        if (bord < 26 && y < 60 + (26 - bord) * 7) continue;
        // Des bancs de roche inégaux, qui ondulent ; des fissures qui descendent ; le pied dans l'ombre.
        const onde = y + Math.round(7 * Math.sin(x / 61) + 3 * Math.sin(x / 17 + 1));
        const banc = Math.floor(onde / 19);
        const dansLeBanc = onde % 19;
        const clarte = 0.5 + 0.5 * Math.sin(x / 89 + banc * 1.7);
        let couleur: string = clarte > 0.72 ? roche.clair : clarte < 0.25 ? roche.sombre : roche.fond;
        if (dansLeBanc === 18 || (dansLeBanc === 17 && g < 0.5)) couleur = roche.creux;
        else if (dansLeBanc < 2 && g < 0.6) couleur = roche.clair;
        else if ((x + Math.round(4 * Math.sin(y / 9 + banc))) % 53 === 0 && alea(Math.floor(x / 53), banc) < 0.6) couleur = roche.creux;
        else if (g < 0.05) couleur = roche.sombre;
        else if (g > 0.975) couleur = roche.mousse;
        if (y > MER_FOND - 26 && (x + y) % 2 === 0) couleur = roche.creux;
        if (y < 52 + Math.round(3 * Math.sin(x / 9)) && g < 0.7) couleur = p.herbe.fond;
        planche.poser(x, y, couleur);
        continue;
      }
      let couleur: string;
      if (enMer) {
        // La mer : plus sombre au large, des crêtes claires, de l'écume contre le quai.
        const vague = (y * 2 + Math.round(3 * Math.sin(x / 17 + y / 9))) % 22;
        couleur = vague === 0 && g < 0.7 ? eau.claire : vague === 11 && g < 0.4 ? eau.sombre : g < 0.02 ? eau.ecume : y > 350 ? eau.fond : large;
      } else if (x >= ravin.de && x < ravin.a && y >= RAIL + 14) {
        // Le ravin : deux parois de roche, la cascade au fond, un bassin en bas.
        const dx = x - plan.ruisseau.x;
        if (y > 372) couleur = g < 0.1 ? eau.ecume : g < 0.3 ? eau.claire : eau.fond;
        else if (Math.abs(dx) < 16) couleur = g < 0.25 ? eau.ecume : g < 0.55 ? eau.claire : eau.fond;
        else couleur = (y + Math.abs(dx)) % 11 === 0 ? roche.creux : alea(x >> 2, y >> 2) < 0.4 ? roche.sombre : roche.creux;
      } else if (y < RAIL + 16 && x < plan.voie.a) {
        // Le ballast de la voie.
        couleur = g < 0.2 ? ballast.clair : g < 0.4 ? ballast.sombre : ballast.fond;
        if (y === LIGNE) couleur = g < 0.5 ? p.herbe.bord : ballast.fond;
      } else {
        couleur = g < 0.045 ? p.herbe.claire : g < 0.08 ? p.herbe.sombre : p.herbe.fond;
        if (y === LIGNE) couleur = g < 0.5 ? p.herbe.bord : p.herbe.fond;
        // Le rivage : l'herbe laisse place aux galets près de l'eau.
        const rivage = plan.mer.de - x;
        if (rivage < 30 && g < 1 - rivage / 30) couleur = g < 0.3 ? roche.clair : roche.fond;
      }
      planche.poser(x, y, couleur);
    }
  }
  // Le bord du pré : la clôture le long de la voie, des meules, des haies, des fleurs au premier plan.
  poserBordDuPre(planche, p, l, de, a, RAIL, RUE_HAUTEUR, (x0, x1) => x1 < plan.mer.de - 60 && (x1 < ravin.de - 30 || x0 > ravin.a + 30));
  // Les touffes et les fleurs du pré.
  for (let y = RAIL + 22; y < RUE_HAUTEUR - 1; y++) {
    for (let x = Math.max(de - 2, 0); x < Math.min(a + 2, plan.mer.de - 34); x++) {
      const g = alea(x + 71, y + 913);
      if (g > 0.006 || (x >= ravin.de - 3 && x < ravin.a + 3)) continue;
      if (g < 0.0016) {
        planche.poser(x, y, couleurDuDehors(alea(x, y + 5) < 0.5 ? "#f4ecc8" : "#ffd75a", "#7f8aa6", l));
        planche.poser(x, y + 1, p.herbe.sombre);
      } else {
        planche.poser(x, y, p.herbe.claire);
        planche.poser(x - 1, y - 1, p.herbe.claire);
        planche.poser(x + 1, y - 1, p.herbe.claire);
      }
    }
  }
}

/** Le bois des tables du dehors, à cette heure. */
function boisDuDehors(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  return { dessus: c("#d0a468", "#6e5636"), fond: c("#b98a52", "#5f4830"), veine: c("#a07a48", "#523e28"), bord: c("#8a6238", "#44321e"), pied: c("#6a4424", "#36240f"), ombre: c("#3d2616", "#1c120a") };
}

/** La rangée du haut de la boîte d'un convive du dehors : le rang du fond, puis celui de devant. */
export const RANGS_DEHORS = [LIGNE + 6 - 68, LIGNE + 38 - 68] as const;

/**
 * Les sièges du dehors, à côté d'une salle : deux rangs de longues tables (la terrasse de la taverne, sous ses lanternes)
 * ou de pupitres (les bancs de la salle de réunion, sous les fanions du clan). Les convives s'y assoient comme dedans.
 */
export function poserSiegesDehors(planche: Planche, p: Palette, l: Lumiere, dehors: Dehors, sorte: "taverne" | "reunion"): void {
  if (dehors.sieges <= 0) return;
  const bois = boisDuDehors(l);
  const longueur = dehors.parRang * SIEGE_DEHORS + 16;
  const x0 = dehors.x + 4;
  // La terre battue sous les tables.
  for (let y = LIGNE + 2; y < LIGNE + 46; y++) {
    for (let x = x0 - 6; x < x0 + longueur + 6; x++) {
      const g = alea(x, y + 300);
      if ((y < LIGNE + 5 || y > LIGNE + 42 || x < x0 - 3 || x > x0 + longueur + 2) && (x + y) % 2 === 0) continue;
      planche.poser(x, y, g < 0.1 ? p.terre.claire : g < 0.2 ? p.terre.sombre : p.terre.fond);
    }
  }
  for (const haut of RANGS_DEHORS) {
    const y = haut + 47;
    // Une table tous les six sièges, avec un passage entre deux.
    for (let debut = 0; debut < dehors.parRang; debut += 6) {
      const sieges = Math.min(6, dehors.parRang - debut);
      const tx = x0 + debut * SIEGE_DEHORS + 2;
      const large = sieges * SIEGE_DEHORS + 8;
      planche.rect(tx + 2, y + 19, large - 4, 2, (i, j) => ((i + j) % 2 === 0 ? bois.ombre : null));
      for (const px of [tx + 4, tx + large - 8]) planche.rect(px, y + 9, 4, 10, (i) => (i === px ? bois.bord : bois.pied));
      planche.rect(tx + 1, y + 6, large - 2, 3, bois.bord);
      planche.rect(tx, y, large, sorte === "taverne" ? 6 : 4, (i, j) => (j === y ? bois.dessus : (i - tx) % 13 === 12 ? bois.veine : bois.fond));
    }
  }
  // Au-dessus : des poteaux, et entre eux une guirlande de lanternes (taverne) ou de fanions bleu, blanc, rouge (réunion).
  const poteaux: number[] = [];
  for (let x = x0; x <= x0 + longueur; x += Math.max(60, Math.round(longueur / Math.max(1, Math.round(longueur / 150))))) poteaux.push(x);
  if (poteaux[poteaux.length - 1]! < x0 + longueur - 20) poteaux.push(x0 + longueur);
  for (const x of poteaux) planche.rect(x, LIGNE - 96, 3, 98, (i) => (i === x ? p.bois.clair : i === x + 2 ? p.bois.creux : p.bois.fond));
  const tricolore = ["#2456b8", "#e8e6e0", "#c8283a"] as const;
  for (let k = 0; k + 1 < poteaux.length; k++) {
    const de = poteaux[k]! + 1;
    const a = poteaux[k + 1]! + 1;
    for (let x = de; x <= a; x++) {
      const part = (x - de) / (a - de);
      const y = LIGNE - 94 + Math.round(4 * 5 * part * (1 - part));
      planche.poser(x, y, p.bois.cordeSombre);
      if ((x - de) % 14 !== 7) continue;
      if (sorte === "taverne") {
        planche.rect(x - 1, y + 1, 3, 4, "#ffd75a");
        planche.poser(x, y + 2, "#fff1a8");
        planche.rect(x - 1, y + 5, 3, 1, p.bois.creux);
      } else {
        const teinte = tricolore[Math.floor((x - de) / 14) % 3]!;
        const couleur = couleurDuDehors(teinte, melanger(teinte, "#0a1230", 0.55), l);
        planche.lettres(x - 2, y + 1, ["ccccc", ".ccc.", "..c.."], { c: couleur });
      }
    }
  }
}
