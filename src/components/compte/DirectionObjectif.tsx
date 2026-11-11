import { useEffect, useState } from "preact/hooks";
import { clan } from "../../../config/clan";
import { basePath, call } from "../../lib/compte/api";
import { GOAL_WINS_MAX, clanGap, clanGoalSentence, clanWeekOf, isOfficialClan, parseQgTools, weekSpan, winsProgress, type WeeklyGoal } from "../../lib/compte/outils";
import { currentPickWeek } from "../../lib/compte/news";
import { fmtCount, fmtInt, fmtScore } from "../../lib/format";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { DeleteButton, Loading, Problem, Success, useRun } from "./common";
import { PartieTete } from "./Onglets";

type Kind = WeeklyGoal["kind"];

/**
 * L'objectif de la semaine, fixé par l'encadrement : un nombre de victoires du clan, ou un clan du classement à dépasser
 * (ou à garder derrière). Les membres le voient au QG, dans « La semaine », avec la progression calculée sur les données
 * publiques du site. Le serveur vérifie le rang et le tag (`save_weekly_goal`) ; la liste des clans n'est qu'une aide :
 * seuls les clans du classement officiel y sont, jamais un tag lu dans une partie.
 */
export default function DirectionObjectif() {
  // `undefined` tant que ce n'est pas lu ; `null` : pas d'objectif cette semaine.
  const [goal, setGoal] = useState<WeeklyGoal | null | undefined>(undefined);
  const [readFailed, setReadFailed] = useState<string | null>(null);
  const [file, setFile] = useState<ClanWeekFile | null | undefined>(undefined);
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

  const describe = (current: WeeklyGoal) => {
    if (current.kind === "wins") {
      const progress = winsProgress(current.wins, week);
      return `${fmtCount(current.wins, "victoire")}${progress ? ` : ${fmtInt(progress.done)} pour l'instant` : ""}.`;
    }
    // Un tag ne s'affiche que s'il est au classement officiel relevé.
    const gap = isOfficialClan(file?.clans, current.clan) ? clanGap(file?.clans ?? null, clan.tag, current.clan) : null;
    return gap === null ? "Un clan du classement : pas de données." : clanGoalSentence(current.clan, gap);
  };

  const submit = () => {
    if (kind === "wins") {
      const value = Number(wins.trim());
      void run(() => call("save_weekly_goal", { p_kind: "wins", p_wins: Number.isInteger(value) ? value : null, p_clan: null }), "Objectif enregistré : les membres le voient au QG.");
    } else {
      void run(() => call("save_weekly_goal", { p_kind: "clan", p_wins: null, p_clan: target }), "Objectif enregistré : les membres le voient au QG.");
    }
  };

  return (
    <section aria-labelledby="objectif-title" data-testid="direction-objectif">
      <PartieTete id="objectif-title" title="Objectif de la semaine">
        <p>Les membres le voient au QG, avec la progression du clan.</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div class="card p-5">
          <h3 class="text-lg">Semaine {weekSpan(thisWeek)}</h3>
          <Problem message={readFailed} onRetry={() => void read()} />
          {goal === undefined ? (
            !readFailed && (
              <div class="mt-3">
                <Loading />
              </div>
            )
          ) : goal ? (
            <div class="mt-3" data-testid="direction-objectif-actuel">
              <p class="tnum">{describe(goal)}</p>
              <div class="mt-4">
                <DeleteButton busy={busy} label="l'objectif de la semaine" onConfirm={() => void run(() => call("delete_weekly_goal"), "Objectif retiré : le QG ne le montre plus.")} />
              </div>
            </div>
          ) : (
            <p class="mt-3 text-muted">Pas encore d'objectif.</p>
          )}
        </div>

        <form
          class="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submit();
          }}
        >
          <h3 class="text-lg">{goal ? "Changer l'objectif" : "Fixer l'objectif"}</h3>
          <fieldset class="grid gap-2">
            <legend class="text-sm font-semibold">Le but</legend>
            <label class="flex min-h-11 items-center gap-3">
              <input type="radio" name="objectif-sorte" class="size-5" checked={kind === "wins"} onChange={() => setKind("wins")} />
              Un nombre de victoires du clan
            </label>
            <label class="flex min-h-11 items-center gap-3">
              <input type="radio" name="objectif-sorte" class="size-5" checked={kind === "clan"} onChange={() => setKind("clan")} disabled={clans.length === 0} />
              Un clan du classement à dépasser, ou à garder derrière
            </label>
          </fieldset>
          {kind === "wins" ? (
            <div>
              <label for="objectif-victoires" class="text-sm font-semibold">
                Victoires visées cette semaine
              </label>
              <input id="objectif-victoires" class="field mt-1 max-w-48" type="number" inputMode="numeric" min={1} max={GOAL_WINS_MAX} step={1} required value={wins} onInput={(e) => setWins(e.currentTarget.value)} />
              {week && <p class="tnum mt-1 text-sm text-muted">Déjà {fmtCount(week.wins, "victoire")} cette semaine.</p>}
            </div>
          ) : (
            <div>
              <label for="objectif-clan" class="text-sm font-semibold">
                Le clan
              </label>
              <select id="objectif-clan" class="field mt-1" required value={target} onChange={(e) => setTarget(e.currentTarget.value)}>
                <option value="">Choisir un clan</option>
                {clans.map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.tag} ({fmtScore(c.score)} points)
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || (kind === "wins" ? wins.trim() === "" : target === "")}>
              {goal ? "Changer l'objectif" : "Fixer l'objectif"}
            </button>
          </div>
          <Problem message={error} />
          {done && <Success message={done} />}
        </form>
      </div>
    </section>
  );
}
