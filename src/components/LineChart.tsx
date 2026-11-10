import { useId, useState } from "preact/hooks";
import { fmtDay } from "../lib/format";

export interface LinePoint {
  date: string;
  value: number | null;
}

/**
 * Une courbe posée sur le décor, sans cadre : la dernière mesure écrite en grand au-dessus, des repères à peine visibles,
 * l'aire sous la courbe qui s'efface vers le fond et un point au bout. Chaque courbe a sa propre échelle, du plus bas au
 * plus haut relevé de la période. Le tableau qui l'accompagne donne toutes les valeurs.
 */
export default function LineChart({
  title,
  points,
  invert,
  format,
  showValue = true,
}: {
  title: string;
  points: LinePoint[];
  invert?: boolean;
  format: (n: number) => string;
  /** `false` quand la page écrit déjà la dernière valeur juste au-dessus (le comparateur de clans) : elle n'est pas répétée en grand. */
  showValue?: boolean;
}) {
  // Les dégradés de chaque courbe ont leur propre identifiant : plusieurs courbes, et plusieurs îlots, se partagent une page.
  const id = `${useId()}-${title.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-")}`;
  const [hover, setHover] = useState<number | null>(null);
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const measured = values.length;
  const lastIndex = points.findLastIndex((p) => p.value !== null);
  const last = lastIndex === -1 ? null : points[lastIndex];

  if (measured === 0 || !last || last.value === null) {
    return (
      <div class="chart-open fx-block">
        <h3 class="kpi-label">{title}</h3>
        <p class="mt-2 text-sm text-muted">Pas de données sur cette période.</p>
      </div>
    );
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const y = (v: number) => {
    const t = (v - lo) / span;
    return (invert ? t : 1 - t) * 86 + 7;
  };
  // 3 % de marge de chaque côté : le point du bout de la courbe reste dans son cadre.
  const x = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 94 + 3);
  // Un trou dans les mesures (hors classement) coupe la courbe : chaque morceau a son trait et son aire.
  const runs: number[][] = [];
  let run: number[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push(i);
    }
  });
  if (run.length > 0) runs.push(run);
  const lineOf = (indexes: number[]) => indexes.map((i, k) => `${k === 0 ? "M" : "L"}${x(i)} ${y(points[i]?.value as number)}`).join("");
  const areaOf = (indexes: number[]) => `${lineOf(indexes)}L${x(indexes[indexes.length - 1] as number)} 100L${x(indexes[0] as number)} 100Z`;
  const shown = hover === null ? null : points[hover];
  const first = points[0];
  const end = points[points.length - 1];

  return (
    <div class="chart-open fx-block">
      <h3 class="kpi-label">{title}</h3>
      {showValue && (
        <p class="kpi-value kpi-value-sm">
          {format(last.value)}
          <span class="sr-only">, dernière mesure le {fmtDay(last.date)}</span>
        </p>
      )}
      <p class="tnum mt-2 min-h-6 text-sm text-muted" aria-hidden="true">
        {shown
          ? `${fmtDay(shown.date)} : ${shown.value === null ? "hors classement" : format(shown.value)}`
          : `Dernière mesure, ${fmtDay(last.date)}${showValue ? "" : ` : ${format(last.value)}`}`}
      </p>
      {measured < 2 ? (
        <p class="mt-3 text-sm text-muted">
          <span class="beacon" aria-hidden="true" />
          Une seule mesure : la courbe se construira jour après jour.
        </p>
      ) : (
        <>
          <div
            class="relative mt-4 h-32 sm:h-44"
            aria-hidden="true"
            onPointerLeave={() => setHover(null)}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const pct = ((e.clientX - r.left) / r.width) * 100;
              setHover(Math.max(0, Math.min(points.length - 1, Math.round(((pct - 3) / 94) * (points.length - 1)))));
            }}
          >
            {/* Repères : le plus haut et le plus bas relevés de la période. */}
            <div class="chart-gridline" style={{ top: "7%" }} />
            <div class="chart-gridline" style={{ top: "93%" }} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="chart-draw absolute inset-0 size-full overflow-visible">
              <defs>
                {/* En unités de la vue : un trait tout plat (un rang qui ne bouge pas) garde son dégradé. */}
                <linearGradient id={`${id}-aire`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
                  <stop offset="0" style={{ stopColor: "var(--color-win)", stopOpacity: 0.36 }} />
                  <stop offset="1" style={{ stopColor: "var(--color-win)", stopOpacity: 0 }} />
                </linearGradient>
                <linearGradient id={`${id}-trait`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
                  <stop offset="0" style={{ stopColor: "var(--color-win)" }} />
                  <stop offset="0.7" style={{ stopColor: "var(--chart-trait-milieu)" }} />
                  <stop offset="1" style={{ stopColor: "var(--chart-trait-fin)" }} />
                </linearGradient>
              </defs>
              {/* Un rang n'est pas une quantité : sa courbe, à l'axe inversé, n'a pas d'aire dessous. */}
              {!invert && runs.map((r) => (r.length > 1 ? <path key={`a${r[0]}`} d={areaOf(r)} fill={`url(#${id}-aire)`} /> : null))}
              {runs.map((r) => (
                <path key={`h${r[0]}`} d={lineOf(r)} fill="none" stroke="var(--color-win)" stroke-opacity="0.28" stroke-width="7" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
              ))}
              {runs.map((r) => (
                <path key={`t${r[0]}`} d={lineOf(r)} fill="none" stroke={`url(#${id}-trait)`} stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
              ))}
            </svg>
            <span class="chart-end" style={{ left: `${x(lastIndex)}%`, top: `${y(last.value)}%` }} />
            {shown && shown.value !== null && hover !== null && (
              <>
                <div class="absolute inset-y-0 w-px bg-white/40" style={{ left: `${x(hover)}%` }} />
                <span
                  class="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-navy bg-white"
                  style={{ left: `${x(hover)}%`, top: `${y(shown.value)}%` }}
                />
              </>
            )}
          </div>
          <div class="tnum mt-2 flex justify-between gap-4 text-xs text-muted" aria-hidden="true">
            <span>{first && fmtDay(first.date)}</span>
            <span>{end && fmtDay(end.date)}</span>
          </div>
        </>
      )}
    </div>
  );
}
