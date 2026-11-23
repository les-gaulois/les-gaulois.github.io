/**
 * Ce qu'une scène animée du casino (la course des familiers, la palissade) demande à la page : des images faites de toiles
 * en points, des surfaces où peindre, et le pinceau d'un `<canvas>`. Les scènes ne touchent jamais au navigateur elles-mêmes :
 * la page leur donne `FabriqueDImages` (`src/components/village/casino/images.ts`), les essais une fabrique sans écran.
 */
import type { Toile } from "./casino-toile";

/** Une image posée par la scène : un `<canvas>` dans la page. */
export type ImageDeLaScene = CanvasImageSource & { readonly width: number; readonly height: number };

/** Le pinceau d'une toile de la page : ce que les scènes utilisent de `CanvasRenderingContext2D`. */
export type Pinceau = Pick<CanvasRenderingContext2D, "clearRect" | "drawImage" | "fillRect" | "save" | "restore" | "beginPath" | "rect" | "clip"> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
};

/** Une surface où peindre à la main, et l'image qu'elle devient. */
export interface SurfaceDeLaScene {
  readonly image: ImageDeLaScene;
  readonly pinceau: Pinceau;
}

export interface FabriqueDImages {
  /** Une toile en points devenue image (un point, un pixel de l'image). */
  image(t: Toile): ImageDeLaScene;
  /** Une surface vide de `w` sur `h` points. */
  surface(w: number, h: number): SurfaceDeLaScene;
}
