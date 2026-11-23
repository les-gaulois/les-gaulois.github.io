import type { FabriqueDImages, ImageDeLaScene, Pinceau } from "../../../lib/jeu/casino-scene";
import { versLaToile, type Toile } from "../../../lib/jeu/casino-toile";

/**
 * Les images des scènes animées du casino (la course des familiers, la palissade), faites dans la page : une toile en points
 * devient un `<canvas>` hors de la page, une surface est un `<canvas>` vide et son pinceau. Voir `casino-scene.ts`.
 */
export const FABRIQUE_DE_LA_PAGE: FabriqueDImages = {
  image(t: Toile): ImageDeLaScene {
    const c = document.createElement("canvas");
    versLaToile(c, t);
    return c;
  },
  surface(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    return { image: c, pinceau: g as Pinceau };
  },
};

/** Une toile en points en image de fond pour la feuille (`url(…)`), pour les pièces en neuf parts d'un jeu. */
export function urlDeLaToile(t: Toile): string {
  const c = document.createElement("canvas");
  versLaToile(c, t);
  return `url(${c.toDataURL()})`;
}
