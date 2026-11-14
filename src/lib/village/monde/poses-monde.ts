/**
 * La pose du dormeur dans le monde du village : les maisons se voient de côté, comme des maisons de poupée, et le lit
 * aussi. Le Gaulois endormi (`casesEndormies` de `../poses`, les yeux fermés, sans arme) est couché sur le dos, la tête à
 * gauche sur l'oreiller, sous une couverture de laine qui se soulève d'une case quand il respire. Le lit vide du décor
 * (`pieces.ts`) a les mêmes mesures : le dormeur vient se poser dessus. Design : Claude Fable 5.2.
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, type Tenue } from "../../gaulois";
import { type Decor, Planche, alea } from "../decor";
import { casesEndormies } from "../poses";

/** La boîte d'un lit vu de côté, en cases. */
export const LIT_LARGEUR = 72;
export const LIT_HAUTEUR = 40;

const COUVERTURES = [
  { fond: "#a8483a", sombre: "#7e3028", clair: "#c96a58" },
  { fond: "#3f5f9a", sombre: "#2c4474", clair: "#5f80ba" },
  { fond: "#4f7d3a", sombre: "#36572a", clair: "#6f9d56" },
  { fond: "#b98a3a", sombre: "#8e6828", clair: "#d6aa5a" },
] as const;

/**
 * Le Gaulois endormi dans son lit, vu de côté. `souffle` : 0 ou 1, la couverture se soulève d'une case. `rang` choisit la
 * couleur de la couverture.
 */
export function poseAuLit(tenue: Tenue, souffle: 0 | 1, rang: number): Decor {
  const planche = new Planche(LIT_LARGEUR, LIT_HAUTEUR);
  // Le lit : la tête et le pied de lit, le matelas de paille, la traverse, l'oreiller.
  planche.rect(0, 12, 3, LIT_HAUTEUR - 12, (i) => (i === 0 ? "#8a5a30" : "#4a301c"));
  planche.rect(LIT_LARGEUR - 3, 20, 3, LIT_HAUTEUR - 20, (i) => (i === LIT_LARGEUR - 3 ? "#8a5a30" : "#4a301c"));
  planche.rect(3, 27, LIT_LARGEUR - 6, 7, (i, j) => (j === 27 ? "#dcc480" : alea(i + 40, j + 7) < 0.14 ? "#b3964f" : "#cdb26a"));
  planche.rect(2, 34, LIT_LARGEUR - 4, 3, (_i, j) => (j === 34 ? "#8a5a30" : "#4a301c"));
  planche.rect(4, 20, 19, 8, (i, j) => ((i === 4 || i === 22) && j === 20 ? null : j === 27 ? "#cfc5aa" : "#e9e2cf"));
  // Le dormeur : la case (x, y) du Gaulois debout va en (y + 4, 43 − x), la tête à gauche.
  const endormi = casesEndormies(tenue);
  for (let y = 0; y < GAULOIS_HAUTEUR; y++) {
    for (let x = 0; x < GAULOIS_LARGEUR; x++) {
      const couleur = endormi[y * GAULOIS_LARGEUR + x];
      if (couleur && 43 - x <= 33) planche.poser(y + 4, 43 - x, couleur);
    }
  }
  // La couverture, des épaules aux pieds : un revers clair, des rayures, le renflement du corps.
  const laine = COUVERTURES[((rang % COUVERTURES.length) + COUVERTURES.length) % COUVERTURES.length]!;
  const haut = 9 - souffle;
  for (let x = 36; x <= 68; x++) {
    // Le dessus s'arrondit vers les pieds.
    const creux = x > 60 ? Math.round(((x - 60) * (x - 60)) / 9) : 0;
    for (let y = haut + creux; y <= 33; y++) {
      let couleur: string = laine.fond;
      if (x < 39) couleur = "#efe6d0";
      else if (x === 39 || y === haut + creux || x === 68) couleur = laine.sombre;
      else if ((x - 36) % 7 === 6) couleur = laine.sombre;
      else if (y < haut + creux + 7) couleur = (x + y) % 2 === 0 || y < haut + creux + 4 ? laine.clair : laine.fond;
      planche.poser(x, y, couleur);
    }
  }
  return planche.decor();
}
