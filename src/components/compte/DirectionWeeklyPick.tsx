import { useEffect, useState } from "preact/hooks";
import { basePath, call } from "../../lib/compte/api";
import { currentPickWeek, fetchLiveNews, pickWeekEnding, pickWeekLabel, WEEKLY_PICK_NOTE_MAX, WEEKLY_PICK_PLAYER_MAX, type WeeklyPick } from "../../lib/compte/news";
import { DeleteButton, Loading, Problem, Success, useRun } from "./common";
import { PartieTete } from "./Onglets";

export interface WeeklyPickDraft {
  player: string;
  note: string;
}
export const EMPTY_WEEKLY_PICK: WeeklyPickDraft = { player: "", note: "" };

/**
 * Le Gaulois de la semaine : l'encadrement choisit un membre de la liste officielle, avec un mot facultatif. L'accueil le
 * montre à tous, sans dire qui l'a choisi. Le serveur vérifie le rang et le pseudo (`save_weekly_pick`) : la liste proposée
 * ici n'est qu'une aide à la saisie. `draft` est gardé par l'espace Direction, comme les autres brouillons.
 */
export default function DirectionWeeklyPick({ draft, setDraft }: { draft: WeeklyPickDraft; setDraft: (draft: WeeklyPickDraft) => void }) {
  // `undefined` tant que ce n'est pas lu ; `null` : le serveur n'a pas répondu.
  const [shown, setShown] = useState<WeeklyPick | null | undefined>(undefined);
  const [readFailed, setReadFailed] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const thisWeek = currentPickWeek(new Date());

  const read = async () => {
    const news = await fetchLiveNews();
    setReadFailed(news === null);
    setShown(news?.weeklyPick ?? null);
  };
  const { busy, error, done, run } = useRun(read);

  useEffect(() => {
    void read();
    // Les pseudos de la liste publique, pour aider la saisie : sans elle, le champ reste libre et le serveur vérifie.
    fetch(`${basePath()}/data/members.json`)
      .then((res) => (res.ok ? (res.json() as Promise<{ members?: { username?: string | null }[] }>) : null))
      .then((list) => setNames([...new Set((list?.members ?? []).flatMap((m) => (m.username ? [m.username] : [])))].sort((a, b) => a.localeCompare(b, "fr"))))
      .catch(() => setNames([]));
  }, []);

  const player = draft.player.trim();

  return (
    <section aria-labelledby="pick-title" data-testid="direction-weekly-pick">
      <PartieTete id="pick-title" title="Gaulois de la semaine">
        <p>L'accueil le montre à tous, sans dire qui l'a choisi.</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div class="card p-5">
          <h3 class="text-lg">Sur l'accueil</h3>
          <Problem message={readFailed ? "Le serveur ne répond pas pour l'instant : le choix en cours n'a pas pu être lu." : null} onRetry={() => void read()} />
          {shown === undefined ? (
            <div class="mt-3">
              <Loading />
            </div>
          ) : shown ? (
            // Le choix que l'accueil montre, de cette semaine ou de la précédente : il se retire d'ici dans les deux cas.
            <div class="mt-3" data-testid="direction-weekly-pick-current">
              <p>
                {shown.week === thisWeek ? (
                  <>Choisi pour {pickWeekLabel(shown.week)} : </>
                ) : (
                  <>
                    Rien n'est encore choisi pour {pickWeekEnding(thisWeek)} L'accueil montre encore celui de {pickWeekLabel(shown.week)} :{" "}
                  </>
                )}
                <strong class="[overflow-wrap:anywhere]">{shown.player}</strong>
              </p>
              {shown.note && <p class="mt-2 whitespace-pre-line text-muted [overflow-wrap:anywhere]">« {shown.note} »</p>}
              <div class="mt-4">
                <DeleteButton busy={busy} label={`le choix de ${shown.player}`} onConfirm={() => void run(() => call("delete_weekly_pick"), "Choix retiré : l'accueil ne le montre plus.")} />
              </div>
            </div>
          ) : (
            <p class="mt-3 text-muted" data-testid="direction-weekly-pick-none">
              Rien n'est encore choisi pour {pickWeekEnding(thisWeek)}
            </p>
          )}
        </div>
        <form
          class="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            // Le pseudo s'affiche ensuite tel que le serveur l'a enregistré, avec l'orthographe exacte de la liste.
            void run(() => call("save_weekly_pick", { p_player: player, p_note: draft.note }), "Gaulois de la semaine enregistré : l'accueil le montre.").then((ok) => {
              if (ok) setDraft(EMPTY_WEEKLY_PICK);
            });
          }}
        >
          <h3 class="text-lg">{shown && shown.week === thisWeek ? "Changer de Gaulois" : "Choisir le Gaulois"}</h3>
          <div>
            <label for="pick-player" class="text-sm font-semibold">
              Pseudo du membre
            </label>
            <input id="pick-player" class="field mt-1" list="pick-names" autocomplete="off" required maxLength={WEEKLY_PICK_PLAYER_MAX} value={draft.player} onInput={(e) => setDraft({ ...draft, player: e.currentTarget.value })} />
            <datalist id="pick-names">
              {names.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p class="mt-1 text-sm text-muted">Tel qu'il est dans la liste officielle du clan, sur la page Membres.</p>
          </div>
          <div>
            <label for="pick-note" class="text-sm font-semibold">
              Le mot de l'encadrement <span class="font-normal text-muted">(facultatif)</span>
            </label>
            <textarea id="pick-note" class="field mt-1" rows={3} maxLength={WEEKLY_PICK_NOTE_MAX} value={draft.note} onInput={(e) => setDraft({ ...draft, note: e.currentTarget.value })} />
            <p class="tnum mt-1 text-sm text-muted">
              {draft.note.length} / {WEEKLY_PICK_NOTE_MAX} caractères
            </p>
          </div>
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || player === ""}>
              {shown && shown.week === thisWeek ? "Changer le Gaulois de la semaine" : "Choisir pour cette semaine"}
            </button>
          </div>
          <Problem message={error} />
          {done && <Success message={done} />}
        </form>
      </div>
    </section>
  );
}
