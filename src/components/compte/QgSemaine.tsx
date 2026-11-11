import { useEffect, useState } from "preact/hooks";
import { clan } from "../../../config/clan";
import { counted } from "../../lib/compte/qg";
import {
  PREDICTION_MAX,
  clanGap,
  clanGoalSentence,
  clanWeekOf,
  closesLabel,
  closestGuesses,
  isOfficialClan,
  predictionProblem,
  weekSpan,
  winsProgress,
  type ClosedWeek,
  type Predictions,
  type WeeklyGoal,
} from "../../lib/compte/outils";
import { fmtCount, fmtDayAndTime, fmtInt } from "../../lib/format";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { Loading, Problem, useNow } from "./common";
import { PartieTete } from "./Onglets";

/** `undefined` : en lecture ; `null` : le fichier public n'a pas pu être lu. */
type WeekFile = ClanWeekFile | null | undefined;

/** L'objectif fixé par l'encadrement, et où en est le clan, d'après les données publiques du site. */
function Goal({ goal, file }: { goal: WeeklyGoal; file: WeekFile }) {
  // Un tag ne s'affiche que s'il est au classement officiel relevé (CLAUDE.md, Données), même choisi par l'encadrement.
  const official = goal.kind === "clan" && isOfficialClan(file?.clans, goal.clan);
  const title = goal.kind === "wins" ? `Objectif : ${fmtCount(goal.wins, "victoire")}` : official ? `Objectif : ${clan.tag} face à ${goal.clan}` : "Objectif de la semaine";
  let body;
  if (file === undefined) body = <Loading />;
  else if (goal.kind === "wins") {
    const progress = winsProgress(goal.wins, file ? clanWeekOf(file.weeks, goal.week) : null);
    body =
      progress && file?.until ? (
        <>
          <p class="mt-3 font-display text-4xl font-extrabold tnum" data-testid="qg-objectif-chiffre">
            {fmtInt(progress.done)} <span class="text-xl text-muted">/ {fmtInt(progress.target)}</span>
          </p>
          <div class="meter meter-lg mt-3" aria-hidden="true">
            <i style={{ "--v": `${progress.share * 100}%` }}></i>
          </div>
          <p class="tnum mt-2 text-sm text-muted">
            {progress.reached ? "Objectif atteint. " : ""}Parties relevées jusqu'au {fmtDayAndTime(file.until)}.
          </p>
        </>
      ) : (
        <p class="mt-3 text-muted">Pas de données.</p>
      );
  } else {
    const gap = official ? clanGap(file?.clans ?? null, clan.tag, goal.clan) : null;
    body =
      gap !== null && file?.clans ? (
        <>
          <p class="mt-3 text-lg font-semibold tnum" data-testid="qg-objectif-clan">
            {clanGoalSentence(goal.clan, gap)}
          </p>
          <p class="tnum mt-2 text-sm text-muted">Classement d'OpenFront arrêté au {fmtDayAndTime(file.clans.end)}.</p>
        </>
      ) : (
        <p class="mt-3 text-muted">Pas de données.</p>
      );
  }
  return (
    <section class="card p-5" aria-labelledby="objectif-titre" data-testid="qg-objectif">
      <h3 id="objectif-titre" class="text-xl">
        {title}
      </h3>
      {body}
    </section>
  );
}

/** Une semaine close : les pronostics de chacun, et le résultat une fois la semaine entièrement relevée. */
function Closed({ week, file }: { week: ClosedWeek; file: WeekFile }) {
  const data = file ? clanWeekOf(file.weeks, week.week) : null;
  const closest = data?.complete ? closestGuesses(week.guesses, data.wins) : [];
  return (
    <li class="card p-5" data-testid="qg-pronostics-clos">
      <h4 class="text-lg">Semaine {weekSpan(week.week)}</h4>
      {data ? (
        <p class="tnum mt-1">
          {data.complete ? (
            <>
              Résultat : <strong>{fmtCount(data.wins, "victoire")}</strong>.
            </>
          ) : (
            <>
              En cours : {fmtCount(data.wins, "victoire")}
              {file?.until ? `, jusqu'au ${fmtDayAndTime(file.until)}` : ""}.
            </>
          )}
        </p>
      ) : (
        <p class="mt-1 text-muted">Pas de données pour cette semaine.</p>
      )}
      {closest.length > 0 && (
        <p class="mt-2 font-semibold [overflow-wrap:anywhere]" data-testid="qg-pronostics-gagnant">
          Le plus proche : {closest.map((guess) => `${guess.name} (${fmtInt(guess.wins)})`).join(", ")}.
        </p>
      )}
      <ul class="mt-3 grid gap-1 text-sm">
        {week.guesses.map((guess, i) => (
          <li key={i} class="flex justify-between gap-4">
            <span class={`[overflow-wrap:anywhere] ${guess.mine ? "font-semibold" : ""}`}>{guess.mine ? `${guess.name} (vous)` : guess.name}</span>
            <span class="tnum">{fmtInt(guess.wins)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * La semaine du clan : l'objectif fixé par l'encadrement, s'il y en a un, et le pronostic de la semaine. On pronostique la
 * semaine en cours le lundi et le mardi, la suivante ensuite ; les pronostics des autres ne se voient qu'après la clôture.
 * Les chiffres viennent des données publiques du site, avec leur heure. Le serveur vérifie tout (`save_prediction`).
 */
export default function QgSemaine({
  goal,
  predictions,
  file,
  busy,
  problem,
  onPredict,
  onExpired,
}: {
  goal: WeeklyGoal | null;
  predictions: Predictions | null;
  file: WeekFile;
  busy: boolean;
  problem: string | null;
  onPredict: (wins: number) => Promise<boolean>;
  /** La clôture est passée pendant que la page était ouverte : le QG relit les outils, pour la semaine suivante. */
  onExpired: () => void;
}) {
  const [text, setText] = useState(predictions?.mine === null || predictions?.mine === undefined ? "" : String(predictions.mine));
  const [formProblem, setFormProblem] = useState<string | null>(null);
  // Le pronostic enregistré revient du serveur : le champ le reprend, sauf pendant la saisie d'un autre.
  useEffect(() => {
    if (predictions?.mine !== null && predictions?.mine !== undefined) setText(String(predictions.mine));
  }, [predictions?.mine, predictions?.week]);

  const closed = (predictions?.closed ?? []).filter((week) => week.guesses.length > 0);
  // Un envoi après la clôture irait à la semaine suivante sous l'étiquette de celle-ci : le bouton attend la relecture,
  // redemandée chaque minute tant que le serveur, dont l'horloge peut retarder sur celle du navigateur, n'a pas changé de semaine.
  const now = useNow(60_000);
  const minute = now.getTime();
  const expired = predictions !== null && minute >= Date.parse(predictions.closesAt);
  useEffect(() => {
    if (expired) onExpired();
  }, [expired, minute]);

  return (
    <section aria-labelledby="semaine-titre" data-testid="qg-semaine">
      <PartieTete id="semaine-titre" title="La semaine du clan" />
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        {goal && <Goal goal={goal} file={file} />}

        {predictions && (
          // Le message du site, en français, plutôt que la bulle du navigateur : le serveur revérifie de toute façon.
          <form
            class="card grid gap-4 p-5"
            noValidate
            data-testid="qg-pronostic"
            onSubmit={(e) => {
              e.preventDefault();
              const found = predictionProblem(text);
              setFormProblem(found);
              if (!found) void onPredict(Number(text.trim()));
            }}
          >
            <div>
              <h3 class="text-xl">Pronostic de la semaine</h3>
              <label for="pronostic" class="mt-2 block font-semibold">
                Les victoires du clan {weekSpan(predictions.week)}
              </label>
              <input id="pronostic" class="field mt-2 max-w-48" type="number" inputMode="numeric" min={0} max={PREDICTION_MAX} step={1} aria-describedby="pronostic-aide" value={text} onInput={(e) => setText(e.currentTarget.value)} />
              <p id="pronostic-aide" class="tnum mt-2 text-sm text-muted">
                Ouvert {closesLabel(predictions.closesAt)}, visible des autres ensuite, sous votre nom.
                {predictions.count > 0 && ` ${counted(predictions.count, "pronostic fait", "pronostics faits")}.`}
              </p>
            </div>
            <div>
              <button type="submit" class="btn btn-primary" disabled={busy || expired || text.trim() === ""}>
                {predictions.mine === null ? "Enregistrer mon pronostic" : "Changer mon pronostic"}
              </button>
            </div>
            {predictions.mine !== null && (
              <p class="tnum" data-testid="qg-pronostic-mien">
                Enregistré : <strong>{fmtCount(predictions.mine, "victoire")}</strong>.
              </p>
            )}
            <Problem message={formProblem ?? problem} />
          </form>
        )}
      </div>

      {closed.length > 0 && (
        <ul class="mt-6 grid items-start gap-4 md:grid-cols-2" aria-label="Pronostics clos">
          {closed.map((week) => (
            <Closed key={week.week} week={week} file={file} />
          ))}
        </ul>
      )}
    </section>
  );
}
