import { useEffect, useMemo, useState } from "preact/hooks";
import { basePath } from "../../lib/compte/api";
import { fmtDay, fmtDayAndTime, fmtDec1, fmtInt, fmtLongDay, fmtPct, fmtRank, fmtScore } from "../../lib/format";
import { GROUP_LABELS, GROUP_SIZES, dailyPoints, type GroupSize, type Scenario } from "../../lib/simulateur";
import type { SimData } from "../../lib/simulateur-donnees";
import { HORIZONS, backtestSince, defaultTarget, marginFor, marginReady, objective, parseSimData, scenarioFrom, simulate, tableRows, victoryValue, type Horizon } from "../../lib/simulateur-vue";
import LineChart from "../LineChart";
import { Loading, Problem } from "./common";
import { PartieTete } from "./Onglets";

/** Ce que le membre tape, gardé tel quel pendant la saisie. */
type Fields = Record<GroupSize, { games: string; win: string }>;

const toFields = (scenario: Scenario): Fields =>
  Object.fromEntries(GROUP_SIZES.map((s) => [s, { games: String(Math.round(scenario[s].games * 10) / 10), win: String(Math.round(scenario[s].winRate * 100)) }])) as Fields;

/** Un nombre tapé, virgule comprise. `null` : vide, illisible ou hors des bornes. */
function numberOf(text: string, max: number): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

const approx = (n: number) => `≈ ${fmtInt(Math.round(n))}`;
const gapLabel = (n: number) => (n >= 0 ? `${fmtInt(Math.round(n))} d'avance` : `${fmtInt(Math.round(-n))} de retard`);
const lower = (text: string) => text.toLocaleLowerCase("fr");

/**
 * Le simulateur de classement, au QG : le score d'OpenFront refait à partir des parties de GAL, puis projeté selon un
 * scénario (parties par jour et victoires, par taille de groupe). Il dit le score et le rang au bout de l'horizon, les
 * clans qui passent devant ou derrière, ce qu'il faut pour finir devant un clan, et sa propre marge d'erreur, mesurée sur
 * l'archive de GAL. Tout vient des données publiques du site (`/simulateur.json`) : rien n'est envoyé au serveur.
 */
export default function QgSimulateur() {
  // `undefined` : en lecture ; `null` : fichier absent ou illisible.
  const [data, setData] = useState<SimData | null | undefined>(undefined);
  const [paceDays, setPaceDays] = useState<number>(7);
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [fields, setFields] = useState<Fields | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${basePath()}/simulateur.json`)
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((raw) => setData(parseSimData(raw)))
      .catch(() => setData(null));
  }, []);

  const measured = useMemo(() => {
    const pace = data?.pace.find((p) => p.days === paceDays);
    const month = data?.pace.find((p) => p.days === 30);
    return pace && month ? scenarioFrom(pace, month) : null;
  }, [data, paceDays]);

  // Changer de rythme de départ reprend les chiffres mesurés.
  useEffect(() => {
    if (measured) setFields(toFields(measured));
  }, [measured]);
  useEffect(() => {
    if (data && target === null) setTarget(defaultTarget(data));
  }, [data]);

  // Un champ que le membre n'a pas touché garde le chiffre mesuré exact, pas sa valeur arrondie à l'écran.
  const initial = useMemo(() => (measured ? toFields(measured) : null), [measured]);
  const scenario = useMemo(() => {
    if (!measured || !fields || !initial) return null;
    const out = {} as Scenario;
    for (const size of GROUP_SIZES) {
      const games = fields[size].games === initial[size].games ? measured[size].games : numberOf(fields[size].games, 2000);
      const win = fields[size].win === initial[size].win ? measured[size].winRate * 100 : numberOf(fields[size].win, 100);
      out[size] = { games: games ?? measured[size].games, winRate: win === null ? measured[size].winRate : win / 100, pointsPerWin: measured[size].pointsPerWin };
    }
    return out;
  }, [fields, measured, initial]);

  const sim = useMemo(() => (data && scenario ? simulate(data, scenario, horizon) : null), [data, scenario, horizon]);

  if (data === undefined || (data && !fields)) return <Loading label="Lecture du classement…" />;
  if (data === null) return <Problem message="Les données du simulateur n'ont pas pu être lues. Rechargez la page." />;
  if (data.official === null || data.rank === null || !sim || !scenario || !measured || !fields) {
    return <p class="card p-5 text-muted">{data.tag} n'est pas dans le classement relevé : rien à projeter.</p>;
  }

  const end = sim.dates[horizon] ?? sim.dates[sim.dates.length - 1] ?? "";
  const galEnd = sim.gal[horizon] ?? 0;
  const margin = marginFor(data.backtest, horizon, paceDays);
  const since = backtestSince(data.backtest, paceDays);
  const goal = target ? objective(sim, scenario, target) : null;
  const targetClan = sim.clans.find((c) => c.tag === target);
  const rows = tableRows(sim, target);
  const measuredRate = dailyPoints(measured);
  const changed = initial !== null && GROUP_SIZES.some((s) => fields[s].games !== initial[s].games || fields[s].win !== initial[s].win);
  const best = data.bestDay;
  const ratedClan = data.clans.find((c) => c.rateDays !== null);
  const value4 = victoryValue(measured["4"].pointsPerWin);

  return (
    <section aria-labelledby="sim-titre" data-testid="qg-simulateur">
      <PartieTete id="sim-titre" title="Simulateur de classement">
        <p class="tnum">
          Classement d'OpenFront arrêté au {fmtDayAndTime(data.asOf)} : {data.tag} {fmtRank(data.rank)}, {fmtScore(data.official)}.
        </p>
      </PartieTete>

      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        {/* Le scénario. */}
        <section class="card grid gap-5 p-5" aria-labelledby="sim-scenario" data-testid="sim-scenario">
          <h3 id="sim-scenario" class="text-xl">
            Votre scénario
          </h3>
          <div>
            <p id="sim-horizon" class="text-sm font-semibold">
              Dans
            </p>
            <div class="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="sim-horizon">
              {HORIZONS.map((h) => (
                <button key={h} type="button" class="chip tnum" aria-pressed={horizon === h} onClick={() => setHorizon(h)}>
                  {h} jours
                </button>
              ))}
            </div>
          </div>
          <div>
            <p id="sim-rythme" class="text-sm font-semibold">
              Partir du rythme
            </p>
            <div class="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="sim-rythme">
              {data.pace.map((p) => (
                <button key={p.days} type="button" class="chip" aria-pressed={paceDays === p.days} onClick={() => setPaceDays(p.days)}>
                  des {p.days} derniers jours
                </button>
              ))}
            </div>
          </div>
          <div class="overflow-x-auto" tabIndex={0} role="region" aria-label="Le scénario, par taille de groupe">
            <table class="tnum w-full text-left [overflow-wrap:normal]">
              <thead>
                <tr class="text-sm text-muted">
                  <th scope="col" class="pb-2 pr-2 font-semibold">
                    <span class="sr-only">Groupe</span>
                  </th>
                  <th scope="col" class="pb-2 pr-2 font-semibold">
                    Parties par jour
                  </th>
                  <th scope="col" class="pb-2 pr-2 font-semibold">
                    Victoires (%)
                  </th>
                  <th scope="col" class="hidden pb-2 font-semibold sm:table-cell">
                    Points par victoire
                  </th>
                </tr>
              </thead>
              <tbody>
                {GROUP_SIZES.map((size) => {
                  const gamesBad = numberOf(fields[size].games, 2000) === null;
                  const winBad = numberOf(fields[size].win, 100) === null;
                  return (
                    <tr key={size} data-testid={`sim-groupe-${size}`}>
                      <th scope="row" class="whitespace-nowrap py-1 pr-2 text-left font-semibold">
                        {GROUP_LABELS[size]}
                      </th>
                      <td class="py-1 pr-2">
                        <input
                          class="field w-20 sm:w-24"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={2000}
                          step={0.1}
                          aria-label={`${GROUP_LABELS[size]} : parties par jour`}
                          aria-invalid={gamesBad || undefined}
                          value={fields[size].games}
                          onInput={(e) => setFields({ ...fields, [size]: { ...fields[size], games: e.currentTarget.value } })}
                        />
                      </td>
                      <td class="py-1 pr-2">
                        <input
                          class="field w-20 sm:w-24"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={100}
                          step={1}
                          aria-label={`${GROUP_LABELS[size]} : victoires, en pourcentage`}
                          aria-invalid={winBad || undefined}
                          value={fields[size].win}
                          onInput={(e) => setFields({ ...fields, [size]: { ...fields[size], win: e.currentTarget.value } })}
                        />
                      </td>
                      <td class="hidden py-1 sm:table-cell">{fmtScore(measured[size].pointsPerWin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {GROUP_SIZES.some((s) => numberOf(fields[s].games, 2000) === null || numberOf(fields[s].win, 100) === null) && (
            <p class="form-problem text-sm">Une case vide ou hors des bornes (0 à 2 000 parties, 0 à 100 %) garde le chiffre mesuré.</p>
          )}
          <p class="tnum">
            Points gagnés par jour : <strong data-testid="sim-rythme-total">{fmtScore(sim.rate)}</strong>
            {changed && <span class="text-muted"> (mesuré : {fmtScore(measuredRate)})</span>}
          </p>
          {changed && (
            <div>
              <button type="button" class="btn btn-ghost" onClick={() => setFields(toFields(measured))}>
                Revenir au rythme mesuré
              </button>
            </div>
          )}
        </section>

        {/* Le résultat. */}
        <section class="card grid gap-3 p-5" aria-labelledby="sim-resultat" data-testid="sim-resultat">
          <h3 id="sim-resultat" class="text-xl">
            Au rythme choisi, le {fmtLongDay(end)}
          </h3>
          <p class="console-valeur font-display text-5xl font-extrabold tnum" data-testid="sim-score">
            {approx(galEnd)}
          </p>
          <p class="tnum text-lg">
            {data.tag} serait {fmtRank(sim.us?.rankThen ?? data.rank)}
            {sim.us && sim.us.rankThen !== data.rank && <span class="text-muted"> (aujourd'hui {fmtRank(data.rank)})</span>}
          </p>
          <p class="tnum text-sm text-muted" data-testid="sim-marge">
            {changed
              ? "Scénario modifié : sa marge n'a pas été mesurée."
              : margin !== null
                ? `Marge : ± ${fmtPct(margin * 100)} (9 projections sur 10 y sont restées${since ? ` depuis le ${fmtLongDay(since)}` : ""}, à ce rythme).`
                : "Pas assez de recul pour mesurer la marge à cet horizon : un ordre de grandeur."}
          </p>
          <p class="tnum text-sm">Sans aucune partie : {approx(sim.galWithoutGames[horizon] ?? 0)}.</p>
          {sim.changes.length > 0 && (
            <ul class="grid gap-1" data-testid="sim-changements">
              {sim.changes.map((c) => (
                <li key={`${c.tag}-${c.day}`} class="tnum">
                  Vers le {fmtDay(c.date)} : {c.ahead ? `${data.tag} passerait devant ${c.tag}` : `${c.tag} passerait devant ${data.tag}`}.
                </li>
              ))}
            </ul>
          )}
          <LineChart title={`Score de ${data.tag}, jour après jour`} points={sim.dates.map((date, i) => ({ date, value: sim.gal[i] ?? null }))} format={approx} showValue={false} lastLabel="Projection" />
        </section>
      </div>

      {/* L'objectif. */}
      {goal && targetClan && (
        <section class="card mt-6 grid gap-4 p-5" aria-labelledby="sim-objectif" data-testid="sim-objectif">
          <h3 id="sim-objectif" class="text-xl">
            Objectif
          </h3>
          <div class="max-w-md">
            <label for="sim-cible" class="text-sm font-semibold">
              Finir devant, le {fmtDay(end)}
            </label>
            <select id="sim-cible" class="field mt-1" value={target ?? ""} onChange={(e) => setTarget(e.currentTarget.value)}>
              {data.clans.map((c, i) =>
                c.tag === data.tag ? null : (
                  <option key={c.tag} value={c.tag}>
                    {c.tag} ({fmtRank(i + 1)})
                  </option>
                ),
              )}
            </select>
          </div>
          <div class="grid gap-2" data-testid="sim-objectif-texte">
            {goal.aheadThen ? (
              <p class="tnum text-lg font-semibold">
                {goal.required < 0.005
                  ? `Au rythme choisi, ${data.tag} finirait devant ${goal.tag}, même sans jouer.`
                  : `Au rythme choisi, ${data.tag} finirait devant ${goal.tag} : il suffirait de ${fmtScore(goal.required)} points gagnés par jour, le scénario en donne ${fmtScore(goal.rate)}.`}
              </p>
            ) : (
              <>
                <p class="tnum text-lg font-semibold">
                  Il faudrait {fmtScore(goal.required)} points gagnés par jour, le scénario en donne {fmtScore(goal.rate)}.
                </p>
                {goal.extraGames.length > 0 && (
                  <p class="tnum">
                    En plus, chaque jour :{" "}
                    {goal.extraGames.map((g, i) => (
                      <span key={g.size}>
                        {i > 0 ? (i === goal.extraGames.length - 1 ? " ou " : ", ") : ""}+{fmtInt(Math.ceil(g.games))} parties {lower(GROUP_LABELS[g.size])}
                      </span>
                    ))}
                    .
                  </p>
                )}
                {best && goal.required > best.points && (
                  <p class="tnum text-warn" data-testid="sim-hors-portee">
                    Hors de portée d'ici là : ce serait plus que la meilleure journée de {data.tag} ({fmtScore(best.points)} points, le {fmtLongDay(best.date)}), chaque jour.
                  </p>
                )}
              </>
            )}
          </div>
          <LineChart
            title={`Écart avec ${goal.tag}, jour après jour`}
            points={sim.dates.map((date, i) => ({ date, value: (sim.gal[i] ?? 0) - (targetClan.curve[i] ?? 0) }))}
            format={gapLabel}
            showValue={false}
            lastLabel="Projection"
          />
        </section>
      )}

      {/* Le classement projeté. */}
      <section class="mt-6" aria-labelledby="sim-classement" data-testid="sim-classement">
        <h3 id="sim-classement" class="text-xl">
          Le classement projeté au {fmtDay(end)}
        </h3>
        <div class="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Le classement projeté">
          <table class="w-full text-left [overflow-wrap:normal]">
            <thead>
              <tr class="text-sm text-muted">
                <th scope="col" class="py-2 pr-3 font-semibold">
                  Clan
                </th>
                <th scope="col" class="py-2 pr-3 font-semibold">
                  Rang
                </th>
                <th scope="col" class="py-2 pr-3 font-semibold">
                  Score
                </th>
                <th scope="col" class="py-2 font-semibold">
                  Face à {data.tag}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.tag} class={`tnum whitespace-nowrap border-t border-line ${c.isUs ? "font-bold" : ""}`}>
                  <th scope="row" class="py-2 pr-3 text-left font-semibold">
                    {c.tag}
                  </th>
                  <td class="py-2 pr-3">
                    {fmtRank(c.rankThen)}
                    {c.rankThen !== c.rankNow && <span class="text-muted"> ({fmtRank(c.rankNow)})</span>}
                  </td>
                  <td class="py-2 pr-3">{approx(c.then)}</td>
                  <td class="py-2">{c.isUs ? "—" : gapLabel(galEnd - c.then)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* La méthode, repliée. */}
      <details class="fold mt-6" data-testid="sim-methode">
        <summary>Comment lire ce calcul</summary>
        <div class="mt-3 grid max-w-3xl gap-3 text-muted">
          <p>
            Le score d'OpenFront additionne les points de chaque victoire, qui perdent la moitié de leur valeur tous les 30 jours et sortent du classement au bout de 90 jours. Refait à partir des parties de {data.tag} :{" "}
            <span class="tnum">
              {data.model === null ? "—" : fmtScore(data.model)} pour {fmtScore(data.official)} officiels
            </span>
            . Sur 130 classements relevés du 5 au 11 novembre 2026, l'écart moyen est de 0,03 %.
          </p>
          <p class="tnum">
            Une victoire à 4 et plus vaut en moyenne {fmtScore(value4[0] ?? 0)} points le jour même, {fmtScore(value4[1] ?? 0)} trente jours plus tard, {fmtScore(value4[2] ?? 0)} au bout de soixante, et plus rien à quatre-vingt-dix jours.
          </p>
          <p class="tnum">
            Les autres clans gardent le rythme lu entre deux classements
            {ratedClan?.rateDays ? `, à ${fmtDec1(ratedClan.rateDays)} jours d'écart` : ""} ; ce qui sort de leur fenêtre est estimé.
            {data.rateCheck ? ` Vérifié sur ${data.tag} avec deux relevés à 7 jours d'écart, ce rythme se lit à ${fmtPct(data.rateCheck.mean * 100)} près en moyenne.` : ""} Un clan sans relevé assez ancien est supposé régulier.
          </p>
          <p>Ce n'est pas une prévision : le calcul suppose que chacun garde son rythme. Les changements de place sont donnés au jour près. La marge ne vaut que pour le rythme mesuré, sans case changée.</p>
          <div class="overflow-x-auto" tabIndex={0} role="region" aria-label="Fiabilité du calcul">
            <table class="tnum w-full max-w-xl text-left text-sm">
              <caption class="mb-2 text-left font-semibold">
                Fiabilité au rythme des {paceDays} derniers jours, mesurée sur l'archive de {data.tag}
                {since ? ` depuis le ${fmtLongDay(since)}` : ""}
              </caption>
              <thead>
                <tr>
                  <th scope="col" class="py-1 pr-3">
                    Dans
                  </th>
                  <th scope="col" class="py-1 pr-3">
                    Écart moyen
                  </th>
                  <th scope="col" class="py-1 pr-3">
                    9 fois sur 10, moins de
                  </th>
                  <th scope="col" class="py-1">
                    Départs
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.backtest
                  .filter((row) => row.pace === paceDays)
                  .map((row) => (
                    <tr key={row.horizon} class="border-t border-line">
                      <th scope="row" class="py-1 pr-3 text-left font-normal">
                        {row.horizon} jours
                      </th>
                      {row.gal && marginReady(row) ? (
                        <>
                          <td class="py-1 pr-3">{fmtPct(row.gal.mean * 100)}</td>
                          <td class="py-1 pr-3">{fmtPct(row.gal.p90 * 100)}</td>
                        </>
                      ) : (
                        <td class="py-1 pr-3" colSpan={2}>
                          trop peu de recul
                        </td>
                      )}
                      <td class="py-1">{row.gal ? fmtInt(row.gal.samples) : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
