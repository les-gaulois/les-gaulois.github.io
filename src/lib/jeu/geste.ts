/**
 * Le geste qui prend une carte du vestiaire du jeu « Mon Gaulois » (21 novembre 2026), sans navigateur : de quoi décider,
 * d'un appui qui bouge, s'il prend la carte, s'il défile la rangée ou la page, ou s'il n'a pas encore assez bougé pour le
 * dire. L'écran (`src/components/village/Essayage.tsx`) n'a plus qu'à appliquer la réponse.
 *
 * Au doigt, défiler ne doit jamais prendre une carte : le geste suit le sens que la feuille de style laisse défiler à la
 * carte (`touch-action`). Une carte d'une rangée qui défile de côté (`pan-x`) se prend en partant vers le haut ou le bas ;
 * une carte d'une grille qui défile avec la page (`pan-y`), en partant de côté. La souris et le stylet prennent dans tous
 * les sens. Partout, quelques pixels d'abord : un clic qui tremble reste un clic.
 */

/** Les pixels qu'un appui doit parcourir avant de prendre la carte, ou de défiler. */
export const SEUIL_DU_GESTE = 8;

/** Le sens qui prend la carte : tous (souris), ou celui où elle ne défile pas. */
export type SensDeLaPrise = "tous" | "vertical" | "horizontal";

/** Ce que devient un appui qui bouge. */
export type Geste = "attendre" | "prendre" | "defiler";

/**
 * Le sens qui prend la carte, d'après le pointeur (`mouse`, `pen`, `touch`) et ce que la feuille de style laisse défiler à
 * la carte (la valeur calculée de `touch-action`). Une carte qui laisse tout défiler, ou rien, se prend dans tous les sens.
 */
export function sensDeLaPrise(pointeur: string, touchAction: string): SensDeLaPrise {
  if (pointeur !== "touch") return "tous";
  const tout = /\b(auto|manipulation)\b/.test(touchAction);
  const x = tout || /\bpan-(x|left|right)\b/.test(touchAction);
  const y = tout || /\bpan-(y|up|down)\b/.test(touchAction);
  if (x && !y) return "vertical";
  if (y && !x) return "horizontal";
  return "tous";
}

/**
 * Le geste d'un appui parti de `dx`, `dy` pixels : il attend tant qu'il n'a pas franchi le seuil, puis il prend la carte
 * s'il part dans son sens, ou laisse défiler sinon. À égalité, la prise l'emporte.
 */
export function gesteDeLAppui(dx: number, dy: number, sens: SensDeLaPrise): Geste {
  if (Math.hypot(dx, dy) < SEUIL_DU_GESTE) return "attendre";
  if (sens === "vertical" && Math.abs(dx) > Math.abs(dy)) return "defiler";
  if (sens === "horizontal" && Math.abs(dy) > Math.abs(dx)) return "defiler";
  return "prendre";
}

/** Un point est-il dans un cadre (bords compris) ? Le centre de la carte tenue au-dessus de la scène du Gaulois. */
export function dansLeCadre(point: { x: number; y: number }, cadre: { left: number; top: number; right: number; bottom: number }): boolean {
  return point.x >= cadre.left && point.x <= cadre.right && point.y >= cadre.top && point.y <= cadre.bottom;
}
