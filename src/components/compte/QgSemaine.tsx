import { useEffect, useRef, useState } from "preact/hooks";
import { clan } from "../../../config/clan";
import { casesDuStatere, type TailleStatere } from "../../../supabase/functions/code-discord/statere";
import { counted } from "../../lib/compte/qg";
import {
  PREDICTION_MAX,
  clanGap,
  clanGoalSentence,
  clanWeekOf,
  closesLabel,
  isOfficialClan,
  predictionProblem,
  stakeProblem,
  stakeValue,
  weekSpan,
  type ClosedWeek,
  type Predictions,
  type WeeklyGoal,
} from "../../lib/compte/outils";
import {
  PREDICTION_CLOSED,
  alreadyCounted,
  clanBars,
  clanGoalState,
  closedSummary,
  closestWords,
  gapWords,
  mineWords,
  moneyWords,
  nextReread,
  potWords,
  predictionClosed,
  predictionState,
  stakeWords,
  untilClose,
  winsGoalState,
  type Rereads,
} from "../../lib/compte/qg-semaine";
import { fmtCount, fmtDayAndTime, fmtInt, fmtScore } from "../../lib/format";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { Loading, Problem, useNow } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

const PIECES = new Map<TailleStatere, (string | null)[]>();

/**
 * Le statère, la pièce en pixels du site, partout où des statères sont dits : décorative, le mot reste écrit à côté. Le
 * dessin est celui du village (`casesDuStatere` de `statere.ts`, le même que `Piece` de `BoutiquePixels.tsx`), peint ici
 * dans sa propre toile : importer `BoutiquePixels.tsx` au QG ferait entrer les classes du village dans une page qui ne
 * charge pas leur feuille (`tests/unit/feuilles.test.ts`). Chaque case vaut `echelle` pixels, un nombre entier.
 */
function Piece({ taille = 16, echelle = 1 }: { taille?: TailleStatere; echelle?: number }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const contexte = toile.current?.getContext("2d");
    if (!contexte) return;
    let cases = PIECES.get(taille);
    if (!cases) PIECES.set(taille, (cases = casesDuStatere(taille)));
    const image = contexte.createImageData(taille, taille);
    cases.forEach((couleur, i) => {
      if (!couleur) return;
      image.data[i * 4] = parseInt(couleur.slice(1, 3), 16);
      image.data[i * 4 + 1] = parseInt(couleur.slice(3, 5), 16);
      image.data[i * 4 + 2] = parseInt(couleur.slice(5, 7), 16);
      image.data[i * 4 + 3] = 255;
    });
    contexte.putImageData(image, 0, 0);
  }, [taille]);
  return <canvas ref={toile} width={taille} height={taille} class="qg-semaine-piece" style={{ width: `${taille * echelle}px`, height: `${taille * echelle}px` }} aria-hidden="true" />;
}

/** Une mise en mots (`stakeWords`), la pièce devant : la pièce et le nombre ne se séparent pas en fin de ligne. */
function Mise({ stake, taille }: { stake: number; taille?: TailleStatere }) {
  const words = stakeWords(stake);
  if (stake < 1) return <>{words}</>;
  const cut = words.indexOf(" ");
  return (
    <>
      <span class="qg-semaine-insecable">
        <Piece taille={taille} />
        {words.slice(0, cut)}
      </span>
      {words.slice(cut)}
    </>
  );
}

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
 * Une semaine close, en une ligne : le résultat et son état (réglé, final, provisoire avec l'heure du relevé, pas de
 * données), la cagnotte et à qui elle est allée, qui était le plus près, et le pronostic du membre avec son écart. Dessous,
 * repliés, le pronostic de chacun, sa mise et ce qu'il a reçu. Le fichier en lecture n'est pas « Pas de données ».
 */
function Closed({ week, file }: { week: ClosedWeek; file: WeekFile }) {
  const summary = closedSummary(week, file ? clanWeekOf(file.weeks, week.week) : null);
  const { mine } = summary;
  const closest = closestWords(summary.closest);
  const pot = potWords(summary);
  // Un résultat réglé par le serveur se lit sans le fichier public.
  const reading = file === undefined && summary.settled === null;
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
      {(closest || (mine && !mine.closest) || pot) && (
        <div class="qg-semaine-close-faits tnum">
          {closest && (
            <p data-testid="qg-pronostics-gagnant">
              <span class="text-muted">{closest.label} : </span>
              <span>{closest.text}</span>
            </p>
          )}
          {mine && !mine.closest && (
            <p data-testid="qg-pronostics-moi">
              <span class="text-muted">Vous : </span>
              <span>{mineWords(mine)}</span>
            </p>
          )}
          {pot && (
            <p data-testid="qg-pronostics-cagnotte">
              <span class="text-muted">Cagnotte : </span>
              <span>
                <Piece />
                {pot}
              </span>
            </p>
          )}
        </div>
      )}
      <details class="fold qg-semaine-tous">
        <summary>Qui a misé quoi : {counted(summary.guesses.length, "pronostic", "pronostics")}</summary>
        <ol class="tnum" data-testid="qg-pronostics-tous">
          {summary.guesses.map((guess, i) => (
            <li key={i} class={guess.mine ? "qg-semaine-mien" : undefined}>
              <span>{guess.mine ? `${guess.name} (vous)` : guess.name}</span>
              <span>{fmtInt(guess.wins)}</span>
              <span class="text-muted">
                {[guess.gap !== null && gapWords(guess.gap), moneyWords(guess, summary.settled)].filter((part): part is string => typeof part === "string").join(", ")}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

/**
 * La cagnotte de la semaine ouverte, dans son encart : la somme des mises en grand chiffre, le nombre de pronostics faits,
 * puis qui a misé combien, par nom et dans l'ordre des noms. Les pronostics, eux, restent cachés jusqu'à la clôture : c'est
 * dit sous la liste. La règle du partage se déplie.
 */
function Cagnotte({ predictions, expired }: { predictions: Predictions; expired: boolean }) {
  // « 550 statères » : le nombre en grand, son nom en plus petit, comme « 280 / 250 » à l'objectif.
  const total = fmtCount(predictions.pot, "statère");
  const cut = total.lastIndexOf(" ");
  return (
    <div class="qg-semaine-cagnotte" data-testid="qg-cagnotte">
      <div class="qg-semaine-cagnotte-tete">
        <h4>
          Cagnotte <span>les mises de tous</span>
        </h4>
        {predictions.count > 0 && <p class="qg-semaine-note tnum">{counted(predictions.count, "pronostic fait", "pronostics faits")}</p>}
      </div>
      <p class="qg-semaine-cagnotte-total console-valeur font-display tnum" data-testid="qg-cagnotte-total">
        <Piece taille={16} echelle={2} />
        {total.slice(0, cut)}
        <span class="text-muted">{total.slice(cut)}</span>
      </p>
      {predictions.stakes.length > 0 && (
        <ul class="qg-semaine-mises tnum" aria-label="Qui a misé combien" data-testid="qg-cagnotte-mises">
          {predictions.stakes.map((item, i) => (
            <li key={i} class={item.mine ? "qg-semaine-mien" : undefined}>
              <span>{item.mine ? `${item.name} (vous)` : item.name}</span>
              <span>
                <Piece taille={12} />
                {fmtInt(item.stake)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!expired && <p class="qg-semaine-note">Les pronostics se voient à la clôture, sous les noms.</p>}
      <details class="fold qg-semaine-partage">
        <summary>Le partage</summary>
        <p class="qg-semaine-note">
          La cagnotte va aux mises les plus proches du résultat, partagée selon la mise. Aucun statère n'est créé : on ne gagne que ce que les autres ont misé.
        </p>
      </details>
    </div>
  );
}

/**
 * La semaine du clan : l'objectif fixé par l'encadrement, s'il y en a un, et le pronostic de la semaine. On pronostique la
 * semaine suivante, jusqu'à son lundi 0 h (migration 20261115000500) ; les pronostics des autres ne se voient qu'après la clôture.
 * Les chiffres viennent des données publiques du site, avec leur heure. Le serveur vérifie tout (`place_prediction`).
 *
 * Depuis le 15 novembre 2026 (demande du pilote), un pronostic se pose une fois, avec une mise en statères de 0 à 1 000, et
 * ne change plus : l'écran fait relire le pronostic et la mise, puis demande un second clic, « Poser pour de bon ». La
 * cagnotte et qui a misé combien se voient tout de suite ; à la clôture, le pronostic et la mise de chacun.
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
  onPredict: (week: string, wins: number, stake: number) => Promise<boolean>;
  /** La clôture est passée pendant que la page était ouverte : le QG relit les outils, pour la semaine suivante. */
  onExpired: () => void;
}) {
  const week = predictions?.week ?? null;
  const mine = predictions?.mine ?? null;
  const placed = predictions?.placed ?? false;
  const closesAt = predictions?.closesAt ?? null;
  const [text, setText] = useState(mine === null ? "" : String(mine));
  const [stakeText, setStakeText] = useState("");
  const [formProblem, setFormProblem] = useState<string | null>(null);
  // Le pronostic et la mise relus, en attente du second clic. Changer un champ l'annule.
  const [confirming, setConfirming] = useState<{ week: string; wins: number; stake: number } | null>(null);
  const confirmText = useRef<HTMLParagraphElement>(null);
  // « Poser mon pronostic », qui reprend le focus après « Revenir » (sinon il partirait sur la page).
  const reviewButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  // Un envoi en cours : un second clic, avant que `busy` ne soit rendu, n'envoie rien.
  const sending = useRef(false);
  // Une autre semaine (la clôture passée, page ouverte) repart de son propre pronostic, ou d'un champ vide : jamais du
  // chiffre de la semaine d'avant. Un pronostic d'avant les mises remplit le champ, pour le poser.
  const shownWeek = useRef(week);
  useEffect(() => {
    if (shownWeek.current !== week) {
      shownWeek.current = week;
      setText(mine === null ? "" : String(mine));
      setStakeText("");
      setFormProblem(null);
      setConfirming(null);
    } else if (mine !== null) setText(String(mine));
  }, [mine, week]);
  // Le pronostic posé, la demande de confirmation n'a plus lieu d'être.
  useEffect(() => {
    if (placed) setConfirming(null);
  }, [placed]);
  // La confirmation affichée, le lecteur d'écran la lit : le texte prend le focus, pas le bouton (deux Entrée ne posent rien).
  useEffect(() => {
    if (confirming) confirmText.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      reviewButton.current?.focus();
    }
  }, [confirming]);

  const closed = (predictions?.closed ?? []).filter((item) => item.guesses.length > 0);
  // Un envoi après la clôture serait refusé (`prediction_closed`) : le bouton se bloque à la clôture même, par une
  // minuterie, et la page se réveille aussi chaque minute (veille de l'ordinateur, onglet en arrière-plan).
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

  const etat = predictions ? predictionState(placed, mine, expired) : null;
  // Inactif sans `disabled` : le bouton garde le focus du clavier pendant l'envoi. L'envoi lui-même revérifie.
  const blocked = busy || expired;
  const shownProblem = formProblem ?? problem;
  const winsInvalid = formProblem !== null && formProblem === predictionProblem(text);
  const stakeInvalid = formProblem !== null && !winsInvalid && formProblem !== PREDICTION_CLOSED;
  const aide = predictions
    ? [
        !expired && !placed && `Ouvert ${closesLabel(predictions.closesAt)}. Posé, il ne change plus.`,
        alreadyCounted(predictions.week, goal, file),
      ]
        .filter((part): part is string => typeof part === "string" && part !== "")
        .join(" ")
    : "";
  // « 1 250 statères » : le nombre en grand, son nom en plus petit, comme la cagnotte.
  const bourse = predictions ? fmtCount(predictions.balance, "statère") : "";
  const bourseCut = bourse.lastIndexOf(" ");
  const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;

  /** Relit les deux champs : un problème s'affiche, sinon la confirmation. Rien ne part au serveur. */
  const review = () => {
    if (!predictions) return;
    if (predictionClosed(predictions.closesAt, Date.now())) {
      setFormProblem(PREDICTION_CLOSED);
      setWoke(Date.now());
      return;
    }
    const found = predictionProblem(text) ?? stakeProblem(stakeText, predictions.balance, predictions.stakeMax);
    setFormProblem(found);
    // La semaine relue est gardée avec le reste : c'est elle qui part, même si les outils se relisent entre-temps.
    setConfirming(found ? null : { week: predictions.week, wins: Number(text.trim()), stake: stakeValue(stakeText) });
  };

  /** « Revenir » : la confirmation se ferme, et le focus revient au bouton « Poser mon pronostic ». */
  const back = () => {
    if (busy) return;
    setConfirming(null);
    refocus.current = true;
  };

  /** Le second clic : le pronostic part au serveur, pour la semaine relue. Un double clic n'envoie qu'une fois. */
  const place = () => {
    if (!predictions || !confirming || busy || sending.current) return;
    // L'heure de l'envoi, pas celle du dernier réveil : une minuterie peut partir en retard.
    if (predictionClosed(predictions.closesAt, Date.now())) {
      setFormProblem(PREDICTION_CLOSED);
      setConfirming(null);
      setWoke(Date.now());
      return;
    }
    sending.current = true;
    void onPredict(confirming.week, confirming.wins, confirming.stake).finally(() => {
      sending.current = false;
    });
  };

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
              // Entrée dans un champ relit seulement : poser demande le bouton « Poser pour de bon ».
              if (!busy && !placed) review();
            }}
          >
            <div class="qg-semaine-tete">
              <h3>Mon pronostic</h3>
              <Pastille ton={etat.ton} testid="qg-pronostic-etat">
                {etat.mot}
              </Pastille>
            </div>
            {aide && (
              <p id="pronostic-aide" class="qg-semaine-note qg-semaine-echeance tnum">
                {aide}
              </p>
            )}
            {/* La bourse du membre, la sienne seule, toujours là : avant de poser, à la confirmation, une fois posé et après
                la clôture. En haut du bloc et sans encart, pour ne pas la confondre avec la cagnotte, la somme des mises
                de tous, dans son encart au bas du bloc. */}
            <p id="pronostic-bourse" class="qg-semaine-bourse tnum" data-testid="qg-pronostic-bourse">
              <span class="qg-semaine-question">Votre bourse : </span>
              <strong class="console-valeur font-display">
                <Piece taille={16} echelle={2} />
                {bourse.slice(0, bourseCut)}
                <span class="text-muted">{bourse.slice(bourseCut)}</span>
              </strong>
            </p>
            {placed && mine !== null ? (
              <p class="qg-semaine-pose tnum" data-testid="qg-pronostic-mien">
                <span class="qg-semaine-note">Posé pour les victoires du clan {weekSpan(predictions.week)} : </span>
                <strong class="console-valeur font-display">{fmtCount(mine, "victoire")}</strong>, <Mise stake={predictions.stake ?? 0} />.
              </p>
            ) : (
              <>
                {mine !== null && !expired && (
                  <p class="qg-semaine-note tnum" data-testid="qg-pronostic-ancien">
                    Votre pronostic d'avant les mises : {fmtCount(mine, "victoire")}. Posez-le une dernière fois, avec ou sans mise ; sinon, il compte pour l'honneur.
                  </p>
                )}
                <div class="qg-semaine-champs">
                  <div class="qg-semaine-champ">
                    <label for="pronostic" class="qg-semaine-question">
                      Les victoires du clan <span>{weekSpan(predictions.week)}</span>
                    </label>
                    <input
                      id="pronostic"
                      class="field"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={PREDICTION_MAX}
                      step={1}
                      aria-describedby={describedBy(aide !== "" && "pronostic-aide", winsInvalid && "pronostic-probleme")}
                      aria-invalid={winsInvalid || undefined}
                      value={text}
                      onInput={(e) => {
                        setText(e.currentTarget.value);
                        setConfirming(null);
                      }}
                    />
                  </div>
                  <div class="qg-semaine-champ">
                    <label for="mise" class="qg-semaine-question">
                      Ma mise, en statères
                    </label>
                    {/* Un champ texte, pas `number` : une saisie que le navigateur ne sait pas lire y resterait vide, donc
                        lue comme 0, pour un pronostic qui ne se reprend pas. Ici, `stakeProblem` la refuse en français. */}
                    <input
                      id="mise"
                      class="field"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      spellcheck={false}
                      placeholder="0"
                      aria-describedby={describedBy("mise-aide", "pronostic-bourse", stakeInvalid && "pronostic-probleme")}
                      aria-invalid={stakeInvalid || undefined}
                      value={stakeText}
                      onInput={(e) => {
                        setStakeText(e.currentTarget.value);
                        setConfirming(null);
                      }}
                    />
                  </div>
                  <p id="mise-aide" class="qg-semaine-note tnum">
                    De 0, pour l'honneur, à {fmtInt(predictions.stakeMax)}.
                  </p>
                </div>
              </>
            )}
            {shownProblem && (
              <div id="pronostic-probleme">
                <Problem message={shownProblem} />
              </div>
            )}
            {!(placed && mine !== null) &&
              (confirming ? (
                <div class="qg-semaine-confirme" data-dir-ton="warn" data-testid="qg-pronostic-confirme">
                  <p ref={confirmText} tabIndex={-1} class="tnum">
                    <strong class="console-valeur font-display">
                      {fmtCount(confirming.wins, "victoire")}, <Mise stake={confirming.stake} taille={24} />.
                    </strong>{" "}
                    <span>Une fois posé, ni changement ni retour.</span>
                  </p>
                  <div class="qg-semaine-saisie">
                    <button type="button" class="btn btn-primary" aria-disabled={blocked || undefined} onClick={place} data-testid="qg-pronostic-poser">
                      Poser pour de bon
                    </button>
                    <button type="button" class="btn btn-ghost" aria-disabled={busy || undefined} onClick={back}>
                      Revenir
                    </button>
                  </div>
                </div>
              ) : (
                <div class="qg-semaine-saisie">
                  <button ref={reviewButton} type="submit" class="btn btn-primary" aria-disabled={blocked || undefined}>
                    Poser mon pronostic
                  </button>
                </div>
              ))}
            <Cagnotte predictions={predictions} expired={expired} />
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
