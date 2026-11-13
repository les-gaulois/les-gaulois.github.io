import { useEffect, useState } from "preact/hooks";
import { clan } from "../../../config/clan";
import { basePath, call } from "../../lib/compte/api";
import { goalState, winsLeft, type GoalState } from "../../lib/compte/direction-objectif";
import { GOAL_WINS_MAX, clanGoalSentence, clanWeekOf, parseQgTools, weekSpan, type WeeklyGoal } from "../../lib/compte/outils";
import { currentPickWeek } from "../../lib/compte/news";
import { fmtCount, fmtDayAndTime, fmtInt, fmtScore } from "../../lib/format";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { Loading, Problem, Success, useRun } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

type Kind = WeeklyGoal["kind"];

/** `undefined` : en lecture ; `null` : le fichier public n'a pas pu être lu. */
type WeekFile = ClanWeekFile | null | undefined;

/** Le retrait de l'objectif ne part qu'au second clic. Gris au repos : il ne prend sa couleur qu'au survol, au clavier ou armé. */
function Retirer({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      class="dir-bouton dir-objectif-retirer"
      data-dir-ton="danger"
      data-arme={armed ? "" : undefined}
      data-testid="direction-objectif-supprimer"
      disabled={busy}
      aria-label={armed ? "Confirmer la suppression de « l'objectif de la semaine »" : "Supprimer « l'objectif de la semaine »"}
      onClick={() => {
        if (armed) onConfirm();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirmer la suppression" : "Supprimer"}
    </button>
  );
}

/** Ce que l'objectif donne au QG : son titre, puis l'avancement que les données publiques permettent d'écrire. */
function Avancement({ goal, state, file }: { goal: WeeklyGoal; state: GoalState; file: ClanWeekFile | null }) {
  // Un tag ne s'affiche que s'il est au classement officiel relevé (CLAUDE.md, Données) : `goalState` ne donne alors pas d'écart.
  const title = goal.kind === "wins" ? fmtCount(goal.wins, "victoire") : "gap" in state ? `${clan.tag} face à ${goal.clan}` : "Un clan du classement";
  return (
    <>
      <p class="dir-objectif-but">{title}</p>
      {"progress" in state && file?.until ? (
        <>
          <p class="dir-objectif-chiffre tnum" data-testid="direction-objectif-chiffre">
            {fmtInt(state.progress.done)} <span>sur {fmtInt(state.progress.target)}</span>
          </p>
          <div class="meter meter-lg" aria-hidden="true">
            <i style={{ "--v": `${state.progress.share * 100}%` }}></i>
          </div>
          <p class="dir-note tnum">
            {state.progress.reached ? "" : `Il en manque ${fmtInt(winsLeft(state.progress))}. `}Parties relevées jusqu'au {fmtDayAndTime(file.until)}.
          </p>
        </>
      ) : goal.kind === "clan" && "gap" in state && file?.clans ? (
        <>
          <p class="dir-objectif-phrase tnum">{clanGoalSentence(goal.clan, state.gap)}</p>
          <p class="dir-note tnum">Classement d'OpenFront arrêté au {fmtDayAndTime(file.clans.end)}.</p>
        </>
      ) : null}
    </>
  );
}

/**
 * L'objectif de la semaine, fixé par l'encadrement : un nombre de victoires du clan, ou un clan du classement à dépasser
 * (ou à garder derrière). Les membres le voient au QG, dans « La semaine », avec la progression calculée sur les données
 * publiques du site. Le serveur vérifie le rang et le tag (`save_weekly_goal`) ; la liste des clans n'est qu'une aide :
 * seuls les clans du classement officiel y sont, jamais un tag lu dans une partie.
 *
 * À gauche, l'état : une couleur et son mot (`goalState`), puis ce que le QG affiche. À droite, le formulaire, en trois
 * lignes. Les explications sont repliées.
 */
export default function DirectionObjectif() {
  // `undefined` tant que ce n'est pas lu ; `null` : pas d'objectif cette semaine.
  const [goal, setGoal] = useState<WeeklyGoal | null | undefined>(undefined);
  const [readFailed, setReadFailed] = useState<string | null>(null);
  const [file, setFile] = useState<WeekFile>(undefined);
  const [kind, setKind] = useState<Kind>("wins");
  const [wins, setWins] = useState("");
  const [target, setTarget] = useState("");
  const thisWeek = currentPickWeek(new Date());

  const read = async () => {
    try {
      const tools = parseQgTools(await call<unknown>("get_qg_tools"));
      if (tools === null) {
        setReadFailed("La réponse du serveur est illisible.");
        return;
      }
      setGoal(tools.goal && tools.goal.week === thisWeek ? tools.goal : null);
      setReadFailed(null);
    } catch {
      setReadFailed("Le serveur ne répond pas pour l'instant : l'objectif en cours n'a pas pu être lu.");
    }
  };
  const { busy, error, done, run } = useRun(read);

  useEffect(() => {
    void read();
    fetch(`${basePath()}/semaine-du-clan.json`)
      .then((res) => (res.ok ? (res.json() as Promise<ClanWeekFile>) : null))
      .then((next) => setFile(next && Array.isArray(next.weeks) ? next : null))
      .catch(() => setFile(null));
  }, []);

  // Les clans du classement officiel, du plus haut score au plus bas, sans le nôtre.
  const clans = (file?.clans?.scores ?? []).filter((c) => c.tag !== clan.tag).sort((a, b) => b.score - a.score);
  const week = file ? clanWeekOf(file.weeks, thisWeek) : null;
  // L'état attend les deux lectures : sans cela, « Pas de données » passerait un instant à l'écran.
  const state = goal === undefined || file === undefined ? null : goalState(goal, file, clan.tag);
  // Le clan choisi dans le formulaire, avant l'envoi : où il est aujourd'hui, avec les mots du QG.
  const draft = kind === "clan" && target !== "" && file ? goalState({ week: thisWeek, kind: "clan", clan: target }, file, clan.tag) : null;

  const submit = () => {
    if (kind === "wins") {
      const value = Number(wins.trim());
      void run(() => call("save_weekly_goal", { p_kind: "wins", p_wins: Number.isInteger(value) ? value : null, p_clan: null }), "Objectif enregistré : les membres le voient au QG.");
    } else {
      void run(() => call("save_weekly_goal", { p_kind: "clan", p_wins: null, p_clan: target }), "Objectif enregistré : les membres le voient au QG.");
    }
  };

  return (
    <section class="dir-objectif" aria-labelledby="objectif-title" data-testid="direction-objectif">
      <PartieTete id="objectif-title" title="Objectif de la semaine">
        <p>Semaine {weekSpan(thisWeek)}</p>
      </PartieTete>
      <div class="dir-objectif-grille">
        <div class="dir-objectif-etat" data-dir-ton={state?.tone ?? (readFailed ? "danger" : "muted")} data-testid="direction-objectif-etat">
          <div class="dir-objectif-tete">
            <h3>Au QG</h3>
            {/* La zone existe avant la lecture : un lecteur d'écran annonce l'état quand il arrive ou change. */}
            <span role="status">
              {state ? (
                <Pastille ton={state.tone} testid="direction-objectif-pastille">
                  {state.word}
                </Pastille>
              ) : (
                readFailed && <Pastille ton="danger">Pas lu</Pastille>
              )}
            </span>
          </div>
          <Problem message={readFailed} onRetry={() => void read()} />
          {goal === undefined || state === null ? (
            !readFailed && <Loading />
          ) : goal ? (
            <div data-testid="direction-objectif-actuel">
              <Avancement goal={goal} state={state} file={file ?? null} />
              <div class="dir-objectif-actions">
                <a class="dir-bouton" href={`${basePath()}/qg/#semaine`}>
                  Voir au QG
                </a>
                <Retirer busy={busy} onConfirm={() => void run(() => call("delete_weekly_goal"), "Objectif retiré : le QG ne le montre plus.")} />
              </div>
            </div>
          ) : (
            <p class="dir-note">Le QG ne montre pas d'objectif.</p>
          )}
        </div>

        <form
          class="dir-objectif-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submit();
          }}
        >
          <h3>{goal ? "Changer l'objectif" : "Fixer l'objectif"}</h3>
          <fieldset class="dir-objectif-sortes">
            <legend class="sr-only">Le but</legend>
            <label class="dir-objectif-sorte" data-choisi={kind === "wins" ? "" : undefined}>
              <input type="radio" name="objectif-sorte" checked={kind === "wins"} onChange={() => setKind("wins")} />
              Des victoires du clan
            </label>
            <label class="dir-objectif-sorte" data-choisi={kind === "clan" ? "" : undefined} data-bloque={clans.length === 0 ? "" : undefined}>
              <input type="radio" name="objectif-sorte" checked={kind === "clan"} onChange={() => setKind("clan")} disabled={clans.length === 0} />
              Un clan du classement
            </label>
          </fieldset>
          <div class="dir-objectif-saisie">
            {kind === "wins" ? (
              <div>
                <label for="objectif-victoires">Victoires visées cette semaine</label>
                <input id="objectif-victoires" class="field dir-champ" type="number" inputMode="numeric" min={1} max={GOAL_WINS_MAX} step={1} required value={wins} onInput={(e) => setWins(e.currentTarget.value)} />
              </div>
            ) : (
              <div>
                <label for="objectif-clan">Le clan visé</label>
                <select id="objectif-clan" class="field dir-champ" required value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
                  <option value="">Choisir un clan</option>
                  {clans.map((c) => (
                    <option key={c.tag} value={c.tag}>
                      {c.tag} ({fmtScore(c.score)} points)
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" class="btn btn-primary" disabled={busy || (kind === "wins" ? wins.trim() === "" : target === "")}>
              {goal ? "Changer l'objectif" : "Fixer l'objectif"}
            </button>
          </div>
          {kind === "wins"
            ? week && <p class="dir-note tnum">Déjà {fmtCount(week.wins, "victoire")} cette semaine.</p>
            : draft &&
              "gap" in draft && (
                <p class="dir-note dir-objectif-apercu" data-testid="direction-objectif-apercu">
                  <Pastille ton={draft.tone} plain>
                    {draft.word}
                  </Pastille>
                  <span class="tnum">{clanGoalSentence(target, draft.gap)}</span>
                </p>
              )}
          <Problem message={error} />
          {done && <Success message={done} />}
        </form>
      </div>
      <details class="fold dir-objectif-aide">
        <summary class="font-semibold">Comment lire cet objectif</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Les membres le voient au QG, dans « La semaine », avec la progression du clan. Un seul objectif par semaine, du lundi au dimanche : le changer remplace le précédent. Un clan visé est à dépasser s'il est devant, à garder derrière sinon.</p>
          <p>Bleu : en cours, ou à égalité. Vert : atteint, ou devant le clan visé. Jaune : derrière le clan visé. Gris : pas d'objectif, ou pas de données.</p>
          <p>Les victoires sont celles des parties relevées par le site, l'écart de score celui du classement d'OpenFront.</p>
        </div>
      </details>
    </section>
  );
}
