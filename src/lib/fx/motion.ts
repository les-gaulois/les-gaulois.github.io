/**
 * Les animations sont-elles permises ? Non si le visiteur a demandé à son système de réduire les animations.
 * Seuls le film de la carte, sa simulation, le rejeu du calculateur, le tri des membres et les chiffres d'une période
 * s'animent, et toujours après un geste du visiteur : le reste du site est immobile.
 */
export function motionAllowed(): boolean {
  if (typeof document === "undefined") return false;
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}
