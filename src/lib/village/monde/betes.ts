/**
 * Les bêtes du village et la charrette (demande du pilote, 14 novembre 2026 : « un monde vivant ») : des poules, un chien,
 * des chèvres, des vaches près de l'étable, une charrette tirée par un âne. Dessins originaux, case par case, à l'échelle
 * des Gaulois (48 × 64), tournés vers la droite, en deux images de marche. Où elles vivent : `betesDuPlan`. Elles vont et
 * viennent calmement dans leur coin, comme les promeneurs (`marche.ts`). Rien ne dit un chiffre. Design : Claude Fable 5.2.
 */
import { type Decor, Planche } from "../decor";
import { BANDE_BAS, BANDE_HAUT, BAS_BANDE_BAS, BAS_BANDE_HAUT, type Plan, emplacementDuBatiment, emplacementOpenFront } from "./plan";

export type Bete = "poule" | "chien" | "chevre" | "vache" | "charrette";

const TRAIT = "#1a1410";

/** La taille de chaque dessin, en cases. */
export const TAILLES_DES_BETES: Readonly<Record<Bete, { largeur: number; hauteur: number }>> = {
  poule: { largeur: 13, hauteur: 12 },
  chien: { largeur: 27, hauteur: 18 },
  chevre: { largeur: 30, hauteur: 26 },
  vache: { largeur: 46, hauteur: 31 },
  charrette: { largeur: 92, hauteur: 40 },
};

/** Quatre pattes : deux avancent pendant que deux reculent, d'une image à l'autre. */
function pattes(pl: Planche, xs: readonly number[], haut: number, bas: number, image: number, couleur: string, sabot: string): void {
  xs.forEach((x, k) => {
    const leve = (k + image) % 2 === 0 ? 1 : 0;
    pl.rect(x, haut, 3, bas - haut - leve, (i) => (i === x || i === x + 2 ? TRAIT : couleur));
    pl.rect(x, bas - leve, 3, 1, sabot);
  });
}

function poule(image: number, variante: number): Decor {
  const pl = new Planche(13, 12);
  const [plume, ombre] = variante % 2 === 0 ? ["#f4ecd8", "#cfc5aa"] : ["#b0683c", "#8a4c28"];
  pl.disque(5, 6, 4, (dx, dy) => (dx * dx + dy * dy > 15 ? TRAIT : dy > 1 ? ombre : plume));
  pl.rect(0, 3, 3, 4, (i, j) => (i === 0 && j < 5 ? null : j === 3 ? TRAIT : ombre));
  pl.disque(9, 3, 2, (dx, dy) => (dx * dx + dy * dy > 4 ? TRAIT : plume));
  pl.poser(10, 3, TRAIT);
  pl.rect(11, 3, 2, 1, "#e2a83c");
  pl.rect(8, 0, 3, 1, "#c8283a");
  pl.poser(10, 5, "#c8283a");
  const pas = image % 2;
  pl.rect(4 - pas, 10, 1, 2, "#e2a83c");
  pl.rect(6 + pas, 10, 1, 2, "#e2a83c");
  return pl.decor();
}

function chien(image: number): Decor {
  const pl = new Planche(27, 18);
  const [poil, sombre] = ["#b07a44", "#8a5a30"];
  pattes(pl, [4, 8, 16, 20], 11, 17, image, poil, TRAIT);
  pl.rect(3, 6, 21, 7, (i, j) => (j === 6 || j === 12 || i === 3 || i === 23 ? TRAIT : j > 10 ? sombre : poil));
  pl.rect(0, 3 + (image % 2), 4, 2, (i) => (i === 0 ? TRAIT : sombre));
  pl.rect(19, 1, 7, 7, (i, j) => (j === 1 || j === 7 || i === 19 || i === 25 ? TRAIT : poil));
  pl.rect(18, 0, 3, 4, (i, j) => (j === 0 || i === 18 ? TRAIT : sombre));
  pl.rect(24, 4, 3, 3, (i, j) => (i === 26 || j === 4 || j === 6 ? TRAIT : "#f2c9a0"));
  pl.poser(23, 3, TRAIT);
  return pl.decor();
}

function chevre(image: number, variante: number): Decor {
  const pl = new Planche(30, 26);
  const [poil, sombre] = variante % 2 === 0 ? ["#efe6d0", "#cfc5aa"] : ["#8d95a6", "#5c6474"];
  pattes(pl, [5, 9, 18, 22], 15, 25, image, poil, "#3d2616");
  pl.rect(3, 8, 23, 9, (i, j) => (j === 8 || j === 16 || i === 3 || i === 25 ? TRAIT : j > 13 ? sombre : poil));
  pl.rect(1, 7, 3, 3, (i, j) => (i === 1 || j === 7 ? TRAIT : poil));
  pl.rect(22, 2, 7, 8, (i, j) => (j === 2 || j === 9 || i === 22 || i === 28 ? TRAIT : poil));
  pl.rect(21, 0, 2, 4, "#8a7a55");
  pl.rect(24, 0, 2, 3, "#8a7a55");
  pl.poser(26, 5, TRAIT);
  pl.rect(26, 10, 2, 3, sombre);
  return pl.decor();
}

function vache(image: number, variante: number): Decor {
  const pl = new Planche(46, 31);
  const tache = variante % 2 === 0 ? "#3d2616" : "#8a5a30";
  pattes(pl, [7, 12, 28, 33], 19, 30, image, "#efe6d0", "#3d2616");
  pl.rect(4, 8, 34, 13, (i, j) => {
    if (j === 8 || j === 20 || i === 4 || i === 37) return TRAIT;
    const dansTache = ((i - 12) * (i - 12)) / 30 + (j - 12) * (j - 12) < 16 || ((i - 27) * (i - 27)) / 20 + (j - 16) * (j - 16) < 12;
    return dansTache ? tache : j > 17 ? "#cfc5aa" : "#efe6d0";
  });
  pl.rect(17, 20, 6, 3, (i, j) => (j === 22 ? TRAIT : "#e8a0a0"));
  pl.rect(1, 9, 4, 2, TRAIT);
  pl.rect(0, 11, 2, 8 + (image % 2), (i) => (i === 0 ? TRAIT : tache));
  pl.rect(34, 2, 11, 11, (i, j) => (j === 2 || j === 12 || i === 34 || i === 44 ? TRAIT : i > 40 && j > 8 ? "#e8a0a0" : i < 38 && j < 7 ? tache : "#efe6d0"));
  pl.rect(34, 0, 2, 3, "#e9e2cf");
  pl.rect(41, 0, 2, 3, "#e9e2cf");
  pl.poser(41, 6, TRAIT);
  pl.poser(43, 10, TRAIT);
  return pl.decor();
}

function charrette(image: number): Decor {
  const pl = new Planche(92, 40);
  const [bois, clair, sombre] = ["#8a5a30", "#b07a44", "#5d3d22"];
  // La caisse et son chargement de foin.
  pl.rect(4, 6, 44, 10, (i, j) => (j === 6 && (i + j) % 3 === 0 ? null : (i + j * 2) % 5 === 0 ? "#b48c3a" : j < 9 ? "#f0cc68" : "#d9b04e"));
  pl.rect(2, 15, 48, 11, (i, j) => (j === 15 || j === 25 || i === 2 || i === 49 ? TRAIT : (i - 2) % 8 === 0 ? sombre : j === 16 ? clair : bois));
  // Les deux roues : leurs rayons tournent d'un huitième de tour d'une image à l'autre.
  for (const cx of [14, 38]) {
    pl.disque(cx, 30, 9, (dx, dy) => {
      const d = dx * dx + dy * dy;
      if (d > 72) return TRAIT;
      if (d > 49) return sombre;
      if (d <= 3) return TRAIT;
      const rayon = image % 2 === 0 ? dx === 0 || dy === 0 : Math.abs(dx) === Math.abs(dy);
      return rayon ? clair : null;
    });
  }
  // Les brancards et l'âne.
  pl.rect(50, 21, 20, 2, (_i, j) => (j === 21 ? clair : sombre));
  const [poil, ventre] = ["#8d95a6", "#c0c9e2"];
  pattes(pl, [60, 64, 76, 80], 25, 39, image, poil, TRAIT);
  pl.rect(58, 14, 26, 12, (i, j) => (j === 14 || j === 25 || i === 58 || i === 83 ? TRAIT : j > 22 ? ventre : poil));
  pl.rect(56, 16, 3, 7 + (image % 2), (i) => (i === 56 ? TRAIT : poil));
  pl.rect(80, 5, 10, 12, (i, j) => (j === 5 || j === 16 || i === 80 || i === 89 ? TRAIT : i > 86 && j > 11 ? ventre : poil));
  pl.rect(80, 0, 3, 6, (i, j) => (i === 80 || j === 0 ? TRAIT : poil));
  pl.rect(84, 0, 3, 6, (i, j) => (i === 86 || j === 0 ? TRAIT : poil));
  pl.poser(86, 9, TRAIT);
  pl.rect(66, 13, 6, 2, "#c8283a");
  return pl.decor();
}

/** Le dessin d'une bête, à l'image de marche `image` (0 ou 1). `variante` change sa robe. */
export function dessinDeLaBete(bete: Bete, image: number, variante = 0): Decor {
  if (bete === "poule") return poule(image, variante);
  if (bete === "chien") return chien(image);
  if (bete === "chevre") return chevre(image, variante);
  if (bete === "vache") return vache(image, variante);
  return charrette(image);
}

/** Une bête du village : son coin (colonnes et rangées du monde où elle va et vient, comptées au coin haut gauche de sa boîte). */
export interface BeteDuPlan {
  cle: string;
  bete: Bete;
  variante: number;
  zone: { de: number; a: number; haut: number; bas: number };
  /** Elle avance d'une case tous les `lenteur` temps (huitièmes de seconde). */
  lenteur: number;
}

/** Les bêtes du village, toujours les mêmes pour le même plan : près de l'étable, sur les terrasses, dans le pré du bas. */
export function betesDuPlan(plan: Plan): BeteDuPlan[] {
  const betes: BeteDuPlan[] = [];
  const dans = (bete: Bete, dy: number, haut: number, bas: number, de: number, a: number, variante: number, lenteur: number): void => {
    const h = TAILLES_DES_BETES[bete].hauteur;
    betes.push({ cle: `${bete}-${betes.length}`, bete, variante, zone: { de, a, haut: dy + haut - h, bas: dy + bas - h }, lenteur });
  };
  const etable = emplacementDuBatiment(plan, "etable");
  const potager = emplacementDuBatiment(plan, "potager");
  // Devant l'étable : deux vaches ; près du potager : trois poules ; sur la place : le chien du village.
  dans("vache", plan.dy0, BANDE_HAUT - 6, BANDE_HAUT + 10, etable.x - 40, etable.x + etable.largeur + 10, 0, 4);
  dans("vache", plan.dy0, BANDE_HAUT - 2, BANDE_HAUT + 14, etable.x - 90, etable.x + etable.largeur - 30, 1, 5);
  for (let k = 0; k < 3; k++) dans("poule", plan.dy0, BANDE_HAUT - 8, BANDE_HAUT + 6, potager.x - 20, potager.x + potager.largeur + 60, k, 2);
  dans("chien", plan.dy0, BANDE_HAUT + 6, BANDE_BAS, plan.feu.x - 320, plan.feu.x + 320, 0, 1);
  // La charrette suit le chemin de la grand-rue, d'un bout du village à l'autre.
  dans("charrette", plan.dy0, 362, 364, plan.village.de + 60, plan.village.a - 160, 0, 2);
  // Dans le pré du bas, des chèvres et une vache.
  const gare = emplacementOpenFront(plan, "gare");
  dans("chevre", plan.dyBas, BAS_BANDE_HAUT + 10, BAS_BANDE_BAS, plan.ruisseau.x + 120, gare.x - 60, 0, 3);
  dans("chevre", plan.dyBas, BAS_BANDE_HAUT + 6, BAS_BANDE_BAS, plan.ruisseau.x + 200, gare.x - 20, 1, 4);
  dans("vache", plan.dyBas, BAS_BANDE_HAUT + 16, BAS_BANDE_BAS, 240, plan.ruisseau.x - 110, 1, 5);
  return betes;
}
