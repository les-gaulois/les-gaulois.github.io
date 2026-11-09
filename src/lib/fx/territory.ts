/**
 * La grille de cases du rejeu du calculateur (src/components/BotCalculator.tsx) : une vague qui gagne
 * les cases du bot à partir d'un bord, comme une conquête. Fonctions pures, sans DOM, pour pouvoir les tester.
 * Aucune de ces valeurs n'est une donnée du clan. Le fond animé qui s'en servait aussi a été retiré le 9 novembre 2026.
 */
export const TILE_SIZE = 28;

export interface Grid {
  cols: number;
  rows: number;
  size: number;
}

export function makeGrid(width: number, height: number, size = TILE_SIZE): Grid {
  return {
    cols: Math.max(1, Math.ceil(width / size)),
    rows: Math.max(1, Math.ceil(height / size)),
    size,
  };
}

/** Bruit déterministe entre 0 et 1, propre à une case et à une vague. */
export function tileNoise(col: number, row: number, seed: number): number {
  let h = Math.imul(col, 73856093) ^ Math.imul(row, 19349663) ^ Math.imul(seed, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface Arrival {
  /** Indice de la case dans la grille. */
  index: number;
  /** Instant où la vague atteint la case, en secondes après son départ. */
  at: number;
}

/** Rayon maximal d'une vague par rapport au rayon demandé, à cause de sa forme irrégulière. */
export const WAVE_MAX_REACH = 1.25;

/**
 * Prépare une vague partant de (x, y) : les cases touchées, de la plus proche à
 * la plus lointaine. Le contour et le front sont irréguliers, comme une frontière.
 */
export function planWave(grid: Grid, x: number, y: number, radius: number, speed: number, seed = 0): Arrival[] {
  const { cols, rows, size } = grid;
  const span = radius * WAVE_MAX_REACH;
  const minCol = Math.max(0, Math.floor((x - span) / size));
  const maxCol = Math.min(cols - 1, Math.floor((x + span) / size));
  const minRow = Math.max(0, Math.floor((y - span) / size));
  const maxRow = Math.min(rows - 1, Math.floor((y + span) / size));
  const arrivals: Arrival[] = [];

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = (col + 0.5) * size - x;
      const dy = (row + 0.5) * size - y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const lobes = 1 + 0.16 * Math.sin(3 * angle + seed) + 0.09 * Math.sin(7 * angle + seed * 2.3);
      const noise = tileNoise(col, row, seed);
      if (distance > radius * lobes * (0.82 + 0.18 * noise)) continue;
      arrivals.push({ index: row * cols + col, at: (distance / speed) * (0.85 + 0.4 * noise) });
    }
  }
  return arrivals.sort((a, b) => a.at - b.at);
}

/** Plus petit rayon possible d'une vague par rapport au rayon demandé. */
export const WAVE_MIN_REACH = 0.615;

/**
 * Vague qui couvre toutes les cases d'une grille en `duration` secondes au plus,
 * à partir d'un point : l'ordre dans lequel le rejeu du calculateur conquiert le bot.
 */
export function coverWave(grid: Grid, x: number, y: number, duration: number, seed = 0): Arrival[] {
  const width = grid.cols * grid.size;
  const height = grid.rows * grid.size;
  const far =
    Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y)) +
    grid.size;
  return planWave(grid, x, y, far / WAVE_MIN_REACH, (far * 1.25) / duration, seed);
}
