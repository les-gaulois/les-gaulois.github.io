import { useEffect, useMemo, useState } from "preact/hooks";
import LineChart from "./LineChart";
import { clanFigures, firstRival, gapPoints, type ClanFigures, type ScoreHistory } from "../lib/compare";
import { fmtCount, fmtDay, fmtDec1, fmtGap, fmtInt, fmtPct, fmtRank, fmtScore, NO_DATA } from "../lib/format";
import type { FaceOff } from "../lib/games";
import { findClan, type RankedClan } from "../lib/stats";

const ROWS: { label: string; value: (f: ClanFigures) => string }[] = [
  { label: "Rang", value: (f) => fmtRank(f.rank) },
  { label: "Score", value: (f) => fmtScore(f.score) },
  { label: "Parties", value: (f) => fmtInt(f.games) },
  { label: "Victoires", value: (f) => fmtInt(f.wins) },
  { label: "Défaites", value: (f) => fmtInt(f.losses) },
  { label: "Taux de victoire", value: (f) => fmtPct(f.rate) },
  { label: "Victoires ÷ défaites, pondérées", value: (f) => fmtScore(f.wlRatio) },
  { label: "Joueurs du clan par partie", value: (f) => (f.playersPerGame === null ? NO_DATA : fmtDec1(f.playersPerGame)) },
];


interface Props {
  clans: RankedClan[];
  tag: string;
  /** Les face-à-face publiés sur la page : `[]` s'ils sont suspendus. */
  faceOffs: FaceOff[];
  /** Le fichier des scores relevés chaque jour. */
  src: string;
}

/** Deux clans de la liste officielle, côte à côte. Rien n'est noté : le rang et le score sont ceux de la liste, et le reste se calcule à partir de ses chiffres. */
export default function ClanCompare({ clans, tag, faceOffs, src }: Props) {
  const me = useMemo(() => findClan(clans, tag), [clans, tag]);
  const [selected, setSelected] = useState(firstRival(clans, tag)?.clanTag ?? "");
  const [history, setHistory] = useState<ScoreHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json: ScoreHistory) => {
        if (!cancelled) setHistory(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const other = useMemo(() => clans.find((c) => c.clanTag === selected) ?? null, [clans, selected]);
  if (!me || !other) return null;
  const mine = clanFigures(me);
  const theirs = clanFigures(other);
  const faceOff = faceOffs.find((row) => row.tag === theirs.tag) ?? null;
  const points = history ? gapPoints(history, mine.tag, theirs.tag) : [];

  return (
    <div>
      <label class="block max-w-sm" htmlFor="compare-clan">
        <span class="mb-1 block text-sm font-semibold">Clan à comparer</span>
        <select id="compare-clan" class="field" value={selected} onChange={(e) => setSelected(e.currentTarget.value)}>
          {clans
            .filter((c) => c.clanTag !== me.clanTag)
            .map((c) => (
              <option key={c.clanTag} value={c.clanTag}>{fmtRank(c.rank)} · [{c.clanTag}]</option>
            ))}
        </select>
      </label>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="panel !p-0">
          <table class="data-table tnum w-full text-sm [overflow-wrap:break-word]" data-testid="compare-table">
            <caption class="sr-only">Les chiffres de [{mine.tag}] et de [{theirs.tag}] dans la liste officielle</caption>
            <thead>
              <tr>
                <th scope="col">Sur 90 jours</th>
                <th scope="col" class="num">[{mine.tag}]</th>
                <th scope="col" class="num">[{theirs.tag}]</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} data-testid="compare-row">
                  <th scope="row" class="!text-sm !font-normal !normal-case !tracking-normal">{row.label}</th>
                  <td class="num whitespace-nowrap font-semibold">{row.value(mine)}</td>
                  <td class="num whitespace-nowrap font-semibold">{row.value(theirs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="space-y-4">
          <p class="tnum font-display text-xl font-bold" role="status" data-testid="compare-gap">
            {fmtGap(mine.score - theirs.score)} pour [{mine.tag}]
          </p>
          {points.length > 0 && <LineChart key={theirs.tag} title={`Écart de score avec [${theirs.tag}], jour après jour`} points={points} format={fmtGap} />}
          {points.length > 1 && (
            <details data-testid="compare-gap-table">
              <summary class="cursor-pointer font-semibold">Voir le tableau de l'écart</summary>
              <div class="mt-3 max-h-96 overflow-auto" tabIndex={0} aria-label="Tableau de l'écart, zone défilante">
                <table class="data-table tnum w-full text-sm">
                  <caption class="sr-only">Écart de score entre [{mine.tag}] et [{theirs.tag}], relevé chaque jour. Positif : [{mine.tag}] est devant.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col" class="num">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map((p) => (
                      <tr key={p.date}>
                        <td>{fmtDay(p.date)}</td>
                        <td class="num">{p.value === null ? NO_DATA : `${p.value >= 0 ? "+" : "−"}${fmtScore(Math.abs(p.value))}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {failed && <p class="text-sm text-muted" role="status">La courbe de l'écart n'a pas pu être chargée. Les chiffres du tableau restent valables.</p>}
          <p class="tnum text-sm text-muted" data-testid="compare-face-off">
            {faceOff
              ? `Face-à-face, sur les parties dont le détail est lu : ${fmtCount(faceOff.meetings, "partie")}. L'équipe de [${mine.tag}] gagne ${fmtInt(faceOff.ours)} fois, celle de [${theirs.tag}] ${fmtInt(faceOff.theirs)} fois, une autre équipe ${fmtInt(faceOff.others)} fois.`
              : `Pas de face-à-face à afficher avec [${theirs.tag}].`}
          </p>

        </div>
      </div>
    </div>
  );
}
