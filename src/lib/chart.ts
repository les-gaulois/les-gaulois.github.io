/**
 * L'axe vertical d'un graphique de comptes (des parties) : des graduations rondes, entières, de 0 au haut de l'axe.
 * Le pas vaut 1, 2 ou 5 × 10ⁿ, pour trois intervalles environ ; le haut est le premier multiple du pas qui couvre la plus grande valeur.
 * Une graduation écrite tombe donc toujours sur sa valeur exacte, sans arrondi.
 */
export interface Axis {
  /** Le haut de l'axe : la hauteur des barres se calcule sur lui. */
  max: number;
  /** Les graduations, de la plus haute à 0. */
  ticks: number[];
}

export function countAxis(largest: number): Axis {
  if (!Number.isFinite(largest) || largest <= 0) return { max: 1, ticks: [1, 0] };
  const raw = largest / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude);
  const max = Math.ceil(largest / step) * step;
  const ticks: number[] = [];
  for (let value = max; value >= 0; value -= step) ticks.push(value);
  return { max, ticks };
}
