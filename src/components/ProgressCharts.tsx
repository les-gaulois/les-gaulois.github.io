import { useMemo, useState } from "preact/hooks";
import AnimatedNumber from "./AnimatedNumber";
import LineChart from "./LineChart";
import { countAxis } from "../lib/chart";
import { fmtDay, fmtInt, fmtPct, fmtScore } from "../lib/format";
import type { HistorySnapshot } from "../lib/schemas";
import { bucketize, filterRange, type Bucket, type DayStat, type RangeKey } from "../lib/sessions";
import { addDays } from "../lib/time";
import { winRate } from "../lib/stats";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7", label: "7 jours" },
  { key: "30", label: "30 jours" },
  { key: "all", label: "Tout" },
];

const bucketLabel = (b: Bucket) => (b.date === b.endDate ? fmtDay(b.date) : `${fmtDay(b.date)} au ${fmtDay(b.endDate)}`);

function GamesChart({ buckets, weekly }: { buckets: Bucket[]; weekly: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  // Des graduations rondes et entières, chacune écrite sur son trait (src/lib/chart.ts).
  const { max, ticks } = countAxis(Math.max(0, ...buckets.map((b) => b.games)));
  const shown = hover === null ? null : buckets[hover];
  const labelIdx = new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]);

  return (
    <figure class="m-0">
      <figcaption class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span class="font-semibold">Parties {weekly ? "par semaine" : "par jour"}</span>
        <span class="flex items-center gap-2"><i class="inline-block size-3.5 rounded-sm bg-win" aria-hidden="true" />Victoires</span>
        <span class="flex items-center gap-2"><i class="inline-block size-3.5 rounded-sm bg-loss" aria-hidden="true" />Défaites</span>
      </figcaption>
      <p class="tnum mt-2 min-h-5 text-sm text-muted" aria-hidden="true">
        {shown
          ? `${bucketLabel(shown)} : ${fmtInt(shown.games)} parties, ${fmtInt(shown.wins)} victoires, ${fmtInt(shown.losses)} défaites, ${fmtPct(shown.winRate)}${shown.partial ? " (en cours)" : ""}`
          : "Survolez une barre pour le détail."}
      </p>
      <div class="relative mt-2 h-64 pl-10" aria-hidden="true" onPointerLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <div key={tick} class="absolute inset-x-0 border-t border-line" style={{ bottom: `${(tick / max) * 100}%` }}>
            <span class="tnum absolute -top-2.5 left-0 bg-navy pr-2 text-xs text-muted">{fmtInt(tick)}</span>
          </div>
        ))}
        <div class="absolute inset-y-0 left-10 right-0">
          {hover !== null && shown && (
            <>
              <div class="chart-cursor" style={{ left: `${(hover / buckets.length) * 100}%`, width: `${100 / buckets.length}%` }} />
              <div class="chart-guide" style={{ bottom: `${(shown.games / max) * 100}%` }} />
              <div
                class="chart-label tnum"
                data-testid="chart-label"
                style={{ left: `${((hover + 0.5) / buckets.length) * 100}%`, bottom: `${(shown.games / max) * 100}%` }}
              >
                {fmtInt(shown.games)}
              </div>
            </>
          )}
          <div class="absolute inset-0 flex items-end">
            {buckets.map((b, i) => (
              <div
                key={b.date}
                class="flex h-full flex-1 items-end px-px"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              >
                {b.games > 0 && (
                  <div class="bar-stack" style={{ height: `${(b.games / max) * 100}%`, opacity: b.partial ? 0.55 : 1 }}>
                    {b.losses > 0 && <div class="min-h-px bg-loss" style={{ flexGrow: b.losses, flexBasis: 0 }} />}
                    {b.wins > 0 && <div class="min-h-px bg-win" style={{ flexGrow: b.wins, flexBasis: 0 }} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div class="relative mt-1 h-5 pl-10 text-xs text-muted" aria-hidden="true">
        <div class="flex">
          {buckets.map((b, i) => (
            <div key={b.date} class="relative flex-1">
              {labelIdx.has(i) && (
                <span
                  class={`tnum absolute top-0 whitespace-nowrap ${i === 0 ? "left-0" : i === buckets.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"}`}
                >
                  {fmtDay(b.date)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {buckets.some((b) => b.partial) && <p class="mt-2 text-xs text-muted">Barre plus pâle : période encore en cours.</p>}
    </figure>
  );
}

interface Props {
  days: DayStat[];
  history: HistorySnapshot[];
}

export default function ProgressCharts({ days, history }: Props) {
  const [range, setRange] = useState<RangeKey>("30");
  const visibleDays = useMemo(() => filterRange(days, range), [days, range]);
  const weekly = range === "all";
  const buckets = useMemo(() => bucketize(visibleDays, weekly ? 7 : 1), [visibleDays, weekly]);
  const lastDay = days[days.length - 1]?.date;
  const snaps = useMemo(() => {
    if (range === "all" || !lastDay) return history;
    const from = addDays(lastDay, -(Number(range) - 1));
    return history.filter((h) => h.date >= from);
  }, [history, range, lastDay]);

  const games = visibleDays.reduce((n, d) => n + d.games, 0);
  const wins = visibleDays.reduce((n, d) => n + d.wins, 0);
  const rate = winRate(wins, games);

  if (days.length === 0) {
    return <p class="border-y border-line py-6 text-muted">Pas de données : aucune session n'a encore été collectée.</p>;
  }

  return (
    <div>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Période affichée">
        {RANGES.map((r) => (
          <button key={r.key} type="button" class="chip" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <dl class="mt-7 grid grid-cols-3 border-y border-line py-6" aria-live="polite">
        {[
          { label: "Parties", value: games, format: fmtInt },
          { label: "Victoires", value: wins, format: fmtInt },
          { label: "Taux de victoire", value: rate, format: fmtPct },
        ].map(({ label, value, format }) => (
          <div key={label} class="min-w-0 border-l border-line px-3 first:border-l-0 first:pl-0 sm:px-6">
            <dt class="label">{label}</dt>
            <dd class="figure mt-2 text-2xl sm:text-4xl">
              <AnimatedNumber value={value} format={format} testId={`summary-${label}`} />
              {label === "Taux de victoire" && rate !== null && (
                <div class="meter mt-3 max-w-40" aria-hidden="true">
                  <i style={{ "--v": `${rate}%` }} />
                </div>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <section class="mt-8">
        <GamesChart buckets={buckets} weekly={weekly} />
        <details class="mt-4">
          <summary class="cursor-pointer font-semibold">Voir le tableau des parties</summary>
          <div class="mt-3 max-h-96 overflow-auto" tabIndex={0} aria-label="Tableau des parties, zone défilante">
            <table class="data-table tnum w-full text-sm">
              <caption class="sr-only">Parties, victoires, défaites et taux par période</caption>
              <thead>
                <tr>
                  <th scope="col">Période</th>
                  <th scope="col" class="num">Parties</th>
                  <th scope="col" class="num">Victoires</th>
                  <th scope="col" class="num">Défaites</th>
                  <th scope="col" class="num">Taux</th>
                </tr>
              </thead>
              <tbody>
                {[...buckets].reverse().map((b) => (
                  <tr key={b.date}>
                    <td>{bucketLabel(b)}{b.partial ? " (en cours)" : ""}</td>
                    <td class="num">{fmtInt(b.games)}</td>
                    <td class="num">{fmtInt(b.wins)}</td>
                    <td class="num">{fmtInt(b.losses)}</td>
                    <td class="num">{fmtPct(b.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section class="band mt-12">
      <h2 class="section-title">Relevés de chaque jour</h2>
      <p class="mt-3 max-w-3xl text-muted">
        Le rang et le score viennent du classement officiel, sur sa fenêtre glissante de 90 jours : ils ne se comparent donc pas aux parties par jour ci-dessus. Le nombre de membres vient de la liste officielle du clan, anonymes compris. Ces trois mesures ne sont connues que depuis le premier relevé. Chaque courbe a sa propre échelle : le tableau donne les valeurs exactes.
      </p>
      <div class="mt-8 grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
        <LineChart
          title="Rang"
          invert
          points={snaps.map((h) => ({ date: h.date, value: h.rank }))}
          format={(n) => `${n}${n === 1 ? "er" : "e"}`}
        />
        <LineChart title="Score" points={snaps.map((h) => ({ date: h.date, value: h.score }))} format={fmtScore} />
        <LineChart title="Membres" points={snaps.map((h) => ({ date: h.date, value: h.membersTotal }))} format={fmtInt} />
      </div>
      {snaps.length > 0 && (
        <details class="mt-4">
          <summary class="cursor-pointer font-semibold">Voir le tableau des relevés</summary>
          <div class="mt-3 max-h-96 overflow-auto" tabIndex={0} aria-label="Tableau des relevés, zone défilante">
            <table class="data-table tnum w-full text-sm">
              <caption class="sr-only">Rang, score et nombre de membres relevés chaque jour</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col" class="num">Rang</th>
                  <th scope="col" class="num">Score</th>
                  <th scope="col" class="num">Membres</th>
                </tr>
              </thead>
              <tbody>
                {[...snaps].reverse().map((h) => (
                  <tr key={h.date}>
                    <td>{fmtDay(h.date)}</td>
                    <td class="num">{h.rank === null ? "Hors classement" : h.rank}</td>
                    <td class="num">{fmtScore(h.score)}</td>
                    <td class="num">{fmtInt(h.membersTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      </section>
    </div>
  );
}
