import { useEffect, useRef, useState } from "preact/hooks";
import { clan } from "../../../config/clan";
import { counted } from "../../lib/compte/qg";
import { PREDICTION_MAX, clanGap, clanGoalSentence, clanWeekOf, closesLabel, isOfficialClan, predictionProblem, weekSpan, type ClosedWeek, type Predictions, type WeeklyGoal } from "../../lib/compte/outils";
import {
  PREDICTION_CLOSED,
  alreadyCounted,
  clanBars,
  clanGoalState,
  closedSummary,
  closestWords,
  gapWords,
  mineWords,
  nextReread,
  predictionClosed,
  predictionState,
  untilClose,
  winsGoalState,
  type Rereads,
} from "../../lib/compte/qg-semaine";
import { fmtCount, fmtDayAndTime, fmtInt, fmtScore } from "../../lib/format";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { Loading, Problem, useNow } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

/** `undefined` : en lecture ; `null` : le fichier public n'a pas pu être lu. */
type WeekFile = ClanWeekFile | null | undefined;

/** Les données manquent : dit d'un mot, en gris. Ce n'est pas zéro. */
const SansDonnees = ({ testid }: { testid?: string }) => (
  <Pastille ton="muted" testid={testid}>
    Pas de données
  </Pastille>
);

/**
 * L'objectif fixé par l'encadrement, et où en est le clan, d'après les données publiques du site : l'état en pastille
 * (`winsGoalState`, `clanGoalState`), le chiffre, la barre, puis l'heure du relevé. Aucune projection.
 */
function Goal({ goal, file }: { goal: WeeklyGoal; file: WeekFile }) {
  // Un tag ne s'affiche que s'il est au classement officiel relevé (CLAUDE.md, Données), même choisi par l'encadrement.
  const official = goal.kind === "clan" && isOfficialClan(file?.clans, goal.clan);
  const title = goal.kind === "wins" ? `Objectif : ${fmtCount(goal.wins, "victoire")}` : official ? `Objectif : ${clan.tag} face à ${goal.clan}` : "Objectif de la semaine";
  let etat = null;
  let body = null;
  if (file === undefined) body = <Loading />;
  else if (goal.kind === "wins") {
    const state = winsGoalState(goal.wins, file ? clanWeekOf(file.weeks, goal.week) : null);
    if (state && file?.until) {
      etat = (
        <Pastille ton={state.ton} testid="qg-objectif-etat">
          {state.mot}
        </Pastille>
      );
      body = (
        <>
          <p class="qg-semaine-chiffre console-valeur font-display tnum" data-testid="qg-objectif-chiffre">
            {fmtInt(state.done)} <span class="text-muted">/ {fmtInt(state.target)}</span>
          </p>
          <div class="meter meter-lg" aria-hidden="true">
            <i style={{ "--v": `${state.share * 100}%` }}></i>
          </div>
          <p class="qg-semaine-note tnum">
            {state.missing > 0 && !state.final && `Encore ${fmtCount(state.missing, "victoire")}. `}
            {state.final ? "Semaine entièrement relevée." : `Parties relevées jusqu'au ${fmtDayAndTime(file.until)}.`}
          </p>
        </>
      );
    } else etat = <SansDonnees testid="qg-objectif-etat" />;
  } else {
    const gap = official ? clanGap(file?.clans ?? null, clan.tag, goal.clan) : null;
    const bars = official ? clanBars(file?.clans, clan.tag, goal.clan) : null;
    if (gap !== null && bars && file?.clans) {
      const state = clanGoalState(gap);
      etat = (
        <Pastille ton={state.ton} testid="qg-objectif-etat">
          {state.mot}
        </Pastille>
      );
      body = (
        <>
          <p class="qg-semaine-phrase tnum" data-testid="qg-objectif-clan">
            {clanGoalSentence(goal.clan, gap)}
          </p>
          <dl class="qg-semaine-duel tnum">
            <div>
              <dt>{clan.tag}</dt>
              <dd class="meter meter-lg meter-gal" aria-hidden="true">
                <i style={{ "--v": `${bars.oursShare * 100}%` }}></i>
              </dd>
              <dd>{fmtScore(bars.ours)}</dd>
            </div>
            <div>
              <dt>{goal.clan}</dt>
              <dd class="meter meter-lg meter-other" aria-hidden="true">
                <i style={{ "--v": `${bars.theirsShare * 100}%` }}></i>
              </dd>
              <dd>{fmtScore(bars.theirs)}</dd>
            </div>
          </dl>
          <p class="qg-semaine-note tnum">Classement d'OpenFront arrêté au {fmtDayAndTime(file.clans.end)}.</p>
        </>
      );
    } else etat = <SansDonnees testid="qg-objectif-etat" />;
  }
  return (
    <section class="card qg-semaine-bloc" aria-labelledby="objectif-titre" data-testid="qg-objectif">
      <div class="qg-semaine-tete">
        <h3 id="objectif-titre">{title}</h3>
        {etat}
      </div>
      {body}
    </section>
  );
}

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);

/**
 * Une semaine close, en une ligne : le résultat et son état (final, provisoire avec l'heure du relevé, pas de données), qui
 * était le plus près, et le pronostic du membre avec son écart. Les pronostics de tous sont repliés dessous. Le fichier en
 * lecture n'est pas « Pas de données ».
 */
function Closed({ week, file }: { week: ClosedWeek; file: WeekFile }) {
  const summary = closedSummary(week, file ? clanWeekOf(file.weeks, week.week) : null);
  const { mine } = summary;
  const closest = closestWords(summary.closest);
  const reading = file === undefined;
  return (
    <li class="dir-ligne qg-semaine-close" data-dir-ton={reading ? "muted" : summary.etat.ton} data-testid="qg-pronostics-clos">
      <h4 class="qg-semaine-close-nom">{capitalized(weekSpan(week.week))}</h4>
      {reading ? (
        <p class="qg-semaine-close-resultat text-muted" role="status">
          Lecture en cours…
        </p>
      ) : (
        <p class="qg-semaine-close-resultat tnum">
          {summary.wins !== null && <strong>{fmtCount(summary.wins, "victoire")}</strong>}
          <Pastille ton={summary.etat.ton} plain testid="qg-pronostics-etat">
            {summary.etat.mot}
          </Pastille>
          {summary.status === "provisoire" && file?.until && <span class="text-muted">jusqu'au {fmtDayAndTime(file.until)}</span>}
        </p>
      )}
      {closest && (
        <p class="qg-semaine-close-pres tnum" data-testid="qg-pronostics-gagnant">
          <span class="text-muted">{closest.label} : </span>
          {closest.text}
        </p>
      )}
      {mine && !mine.closest && (
        <p class="qg-semaine-close-moi tnum" data-testid="qg-pronostics-moi">
          <span class="text-muted">Vous : </span>
          {mineWords(mine)}
        </p>
      )}
      <details class="fold qg-semaine-tous">
        <summary>{counted(summary.guesses.length, "pronostic", "pronostics")}</summary>
        <ol class="tnum">
          {summary.guesses.map((guess, i) => (
            <li key={i} class={guess.mine ? "qg-semaine-mien" : undefined}>
              <span>{guess.mine ? `${guess.name} (vous)` : guess.name}</span>
              <span>{fmtInt(guess.wins)}</span>
              {guess.gap !== null && <span class="text-muted">{gapWords(guess.gap)}</span>}
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

/**
 * La semaine du clan : l'objectif fixé par l'encadrement, s'il y en a un, et le pronostic de la semaine. On pronostique la
 * semaine en cours le lundi et le mardi, la suivante ensuite ; les pronostics des autres ne se voient qu'après la clôture.
 * Les chiffres viennent des données publiques du site, avec leur heure. Le serveur vérifie tout (`save_prediction`).
 *
 * Dessin du 14 novembre 2026, « comme la section Comptes » : l'objectif et le pronostic tiennent dans le premier écran,
 * chacun avec son état en pastille (couleur et mot), et les semaines closes sont des lignes courtes.
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
  const week = predictions?.week ?? null;
  const mine = predictions?.mine ?? null;
  const closesAt = predictions?.closesAt ?? null;
  const [text, setText] = useState(mine === null ? "" : String(mine));
  const [formProblem, setFormProblem] = useState<string | null>(null);
  // Le pronostic enregistré revient du serveur : le champ le reprend, sauf pendant la saisie d'un autre. Une autre semaine
  // (la clôture passée, page ouverte) repart de son propre pronostic, ou d'un champ vide : jamais du chiffre de la semaine d'avant.
  const shownWeek = useRef(week);
  useEffect(() => {
    if (shownWeek.current !== week) {
      shownWeek.current = week;
      setText(mine === null ? "" : String(mine));
      setFormProblem(null);
    } else if (mine !== null) setText(String(mine));
  }, [mine, week]);

  const closed = (predictions?.closed ?? []).filter((item) => item.guesses.length > 0);
  // Un envoi après la clôture irait à la semaine suivante sous l'étiquette de celle-ci : le bouton se bloque à la clôture
  // même, par une minuterie, et la page se réveille aussi chaque minute (veille de l'ordinateur, onglet en arrière-plan).
  const now = useNow(60_000);
  const [woke, setWoke] = useState(0);
  useEffect(() => {
    if (closesAt === null) return;
    const wait = untilClose(closesAt, Date.now());
    if (wait === null) return;
    // Partie trop tôt (horloge changée), la minuterie se repose : `woke` change et relance cet effet.
    const timer = window.setTimeout(() => setWoke(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [closesAt, woke]);
  const nowMs = Math.max(now.getTime(), woke);
  const expired = closesAt !== null && predictionClosed(closesAt, nowMs);
  // La clôture passée, le QG relit les outils pour la semaine suivante : une fois tout de suite, puis chaque minute tant que
  // le serveur, dont l'horloge peut retarder sur celle du navigateur, rend la même semaine, cinq fois au plus (`nextReread`).
  const rereads = useRef<Rereads | null>(null);
  useEffect(() => {
    if (!expired || closesAt === null) return;
    const next = nextReread(rereads.current, closesAt, nowMs);
    if (next === null) return;
    rereads.current = next;
    onExpired();
  }, [expired, closesAt, nowMs]);

  if (!goal && !predictions) {
    return (
      <section class="qg-semaine" aria-labelledby="semaine-titre" data-testid="qg-semaine">
        <PartieTete id="semaine-titre" title="La semaine du clan" />
        <p class="mt-4 text-muted">Pas de données.</p>
      </section>
    );
  }

  const etat = predictions ? predictionState(predictions.mine, expired) : null;
  // Inactif sans `disabled` : le bouton garde le focus du clavier pendant l'envoi. L'envoi lui-même revérifie (Entrée).
  const blocked = busy || expired;
  const shownProblem = formProblem ?? problem;
  const invalid = formProblem !== null && formProblem !== PREDICTION_CLOSED;
  const aide = predictions
    ? [
        !expired && `Ouvert ${closesLabel(predictions.closesAt)}, visible des autres ensuite, sous votre nom.`,
        predictions.count > 0 && `${counted(predictions.count, "pronostic fait", "pronostics faits")}.`,
        alreadyCounted(predictions.week, goal, file),
      ]
        .filter((part): part is string => typeof part === "string" && part !== "")
        .join(" ")
    : "";
  const describedBy = [aide && "pronostic-aide", shownProblem && "pronostic-probleme"].filter(Boolean).join(" ") || undefined;

  return (
    <section class="qg-semaine" aria-labelledby="semaine-titre" data-testid="qg-semaine">
      <PartieTete id="semaine-titre" title="La semaine du clan" />
      <div class="qg-semaine-haut">
        {goal && <Goal goal={goal} file={file} />}

        {predictions && etat && (
          // Le message du site, en français, plutôt que la bulle du navigateur : le serveur revérifie de toute façon.
          <form
            class="card qg-semaine-bloc"
            noValidate
            data-testid="qg-pronostic"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              // L'heure de l'envoi, pas celle du dernier réveil : une minuterie peut partir en retard.
              const at = Date.now();
              if (predictionClosed(predictions.closesAt, at)) {
                setFormProblem(PREDICTION_CLOSED);
                setWoke(at);
                return;
              }
              const found = predictionProblem(text);
              setFormProblem(found);
              if (!found) void onPredict(Number(text.trim()));
            }}
          >
            <div class="qg-semaine-tete">
              <h3>Mon pronostic</h3>
              <Pastille ton={etat.ton} testid="qg-pronostic-etat">
                {etat.mot}
              </Pastille>
            </div>
            <label for="pronostic" class="qg-semaine-question">
              Les victoires du clan {weekSpan(predictions.week)}
            </label>
            <div class="qg-semaine-saisie">
              <input
                id="pronostic"
                class="field"
                type="number"
                inputMode="numeric"
                min={0}
                max={PREDICTION_MAX}
                step={1}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                value={text}
                onInput={(e) => setText(e.currentTarget.value)}
              />
              <button type="submit" class="btn btn-primary" aria-disabled={blocked || undefined}>
                {predictions.mine === null ? "Enregistrer" : "Changer"}
              </button>
            </div>
            {predictions.mine !== null && (
              <p class="tnum" data-testid="qg-pronostic-mien">
                Enregistré : <strong>{fmtCount(predictions.mine, "victoire")}</strong>.
              </p>
            )}
            {aide && (
              <p id="pronostic-aide" class="qg-semaine-note tnum">
                {aide}
              </p>
            )}
            {shownProblem && (
              <div id="pronostic-probleme">
                <Problem message={shownProblem} />
              </div>
            )}
          </form>
        )}
      </div>

      {closed.length > 0 && (
        <section class="qg-semaine-closes" aria-labelledby="semaine-closes-titre">
          <h3 id="semaine-closes-titre">Pronostics clos</h3>
          <ul class="dir-liste">
            {closed.map((item) => (
              <Closed key={item.week} week={item} file={file} />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
