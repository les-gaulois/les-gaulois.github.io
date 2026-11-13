import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { basePath, call } from "../../lib/compte/api";
import { TYPED_LABELS, WEEK_STATE_LABELS, countLabel, findChoice, pickChoices, searchChoices, shownOnHome, typedState, weekShort, weekState, type PickChoice } from "../../lib/compte/direction-semaine";
import { currentPickWeek, fetchLiveNews, pickWeekEnding, WEEKLY_PICK_NOTE_MAX, WEEKLY_PICK_PLAYER_MAX, type WeeklyPick } from "../../lib/compte/news";
import { DeleteButton, Problem, Success, useRun } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

export interface WeeklyPickDraft {
  player: string;
  note: string;
}
export const EMPTY_WEEKLY_PICK: WeeklyPickDraft = { player: "", note: "" };

/** Le bloc tel que l'accueil le montre (`WeeklyPickCard`) : son titre, sa semaine, le pseudo en grand et le mot. */
function Honneur({ week, player, note }: { week: string; player: string; note: string | null }) {
  return (
    <div class="dir-semaine-honneur">
      <p class="dir-semaine-surtitre">À l'honneur</p>
      <p class="dir-semaine-pour">Choisi par l'encadrement, pour {pickWeekEnding(week)}</p>
      <p class="dir-semaine-pseudo">{player}</p>
      {note && <p class="dir-semaine-mot">« {note} »</p>}
    </div>
  );
}

/**
 * Le Gaulois de la semaine : l'encadrement choisit un membre de la liste officielle, avec un mot facultatif. L'accueil le
 * montre à tous, sans dire qui l'a choisi. Le serveur vérifie le rang et le pseudo (`save_weekly_pick`) : la liste proposée
 * ici n'est qu'une aide à la saisie. `draft` est gardé par l'espace Direction, comme les autres brouillons.
 *
 * L'écran (14 novembre 2026, « comme pour la section Comptes ») : l'état de la semaine en pastille près du titre, la liste
 * des membres à parcourir ou à chercher à chaque lettre, et à côté ce que l'accueil montre, puis ce qu'il montrera une fois
 * le choix enregistré. Les règles sont dans `src/lib/compte/direction-semaine.ts`.
 */
export default function DirectionWeeklyPick({ draft, setDraft }: { draft: WeeklyPickDraft; setDraft: (draft: WeeklyPickDraft) => void }) {
  // `undefined` tant que ce n'est pas lu ; `null` : rien n'est choisi, ou le serveur n'a pas répondu (`readFailed`).
  const [shown, setShown] = useState<WeeklyPick | null | undefined>(undefined);
  const [readFailed, setReadFailed] = useState(false);
  // `undefined` : lecture en cours ; `null` : la liste publique n'a pas pu être lue, le champ reste libre.
  const [choices, setChoices] = useState<PickChoice[] | null | undefined>(undefined);
  // Ce qui filtre la liste : le texte tapé. Un clic sur un nom remplit le champ sans refermer la liste autour de lui.
  const [query, setQuery] = useState("");
  // Le nom désigné au clavier (flèches), dans la liste filtrée ; -1 : aucun.
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
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
      .then((list) => setChoices(list && Array.isArray(list.members) ? pickChoices(list.members) : null))
      .catch(() => setChoices(null));
  }, []);

  const player = draft.player.trim();
  const list = choices ?? null;
  const found = useMemo(() => (list ? searchChoices(list, query) : []), [list, query]);
  const picked = list ? findChoice(list, player) : null;
  const typed = choices === undefined ? "empty" : typedState(list, player);
  const state = shown === undefined ? null : weekState(shown, thisWeek, readFailed);
  const chosenNow = state === "chosen" && shown ? shown.player : null;
  const onHome = shown && list ? shownOnHome(list, shown.player) : null;
  const optionId = (index: number) => `pick-option-${index}`;

  const pick = (name: string) => {
    setDraft({ ...draft, player: name });
    setActive(-1);
  };
  const move = (to: number) => {
    setActive(to);
    listRef.current?.querySelector(`#${optionId(to)}`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <section class="dir-semaine" aria-labelledby="pick-title" data-testid="direction-weekly-pick">
      <PartieTete
        id="pick-title"
        title="Gaulois de la semaine"
        aside={
          <p class="dir-semaine-etat" role="status" data-testid="direction-weekly-pick-state">
            {state === null ? (
              <span class="text-muted">Lecture en cours…</span>
            ) : (
              <>
                <Pastille ton={WEEK_STATE_LABELS[state].tone}>{WEEK_STATE_LABELS[state].label}</Pastille>
                <span class="text-muted">{weekShort(thisWeek)}</span>
              </>
            )}
          </p>
        }
      />
      <div class="dir-semaine-grille">
        <form
          class="card dir-semaine-choix"
          onSubmit={(e) => {
            e.preventDefault();
            // Le pseudo s'affiche ensuite tel que le serveur l'a enregistré, avec l'orthographe exacte de la liste.
            void run(() => call("save_weekly_pick", { p_player: player, p_note: draft.note }), "Gaulois de la semaine enregistré : l'accueil le montre.").then((ok) => {
              if (!ok) return;
              setDraft(EMPTY_WEEKLY_PICK);
              setQuery("");
              setActive(-1);
            });
          }}
        >
          <h3 class="text-lg">{state === "chosen" ? "Changer de Gaulois" : "Choisir le Gaulois"}</h3>
          <div>
            <label for="pick-player" class="text-sm font-semibold">
              Pseudo du membre
            </label>
            <input
              id="pick-player"
              class="field dir-champ mt-1"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              required
              maxLength={WEEKLY_PICK_PLAYER_MAX}
              placeholder={list ? "Chercher dans la liste" : undefined}
              role={list ? "combobox" : undefined}
              aria-controls={list ? "pick-list" : undefined}
              aria-expanded={list ? found.length > 0 : undefined}
              aria-autocomplete={list ? "list" : undefined}
              aria-activedescendant={list && active >= 0 && active < found.length ? optionId(active) : undefined}
              aria-describedby="pick-typed"
              value={draft.player}
              onInput={(e) => {
                setDraft({ ...draft, player: e.currentTarget.value });
                setQuery(e.currentTarget.value);
                setActive(-1);
              }}
              onKeyDown={(e) => {
                if (!list || found.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(Math.min(active + 1, found.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(Math.max(active - 1, 0));
                } else if (e.key === "Enter" && active >= 0 && active < found.length) {
                  // Entrée choisit le nom désigné ; sans nom désigné, elle enregistre comme dans tout formulaire.
                  e.preventDefault();
                  pick(found[active]!.name);
                } else if (e.key === "Escape") {
                  setActive(-1);
                }
              }}
            />
            <div class="dir-semaine-sous">
              <p id="pick-typed" role="status" data-testid="direction-weekly-pick-typed">
                {typed === "listed" || typed === "twin" || typed === "unlisted" ? <Pastille ton={TYPED_LABELS[typed].tone} plain>{TYPED_LABELS[typed].label}</Pastille> : null}
              </p>
              {list && (
                <p class="text-muted" data-testid="direction-weekly-pick-count">
                  {countLabel(found.length, list.length, query.trim() !== "")}
                </p>
              )}
            </div>
            {/* La liste existe dès qu'elle est lue, même sans résultat : le champ la désigne (aria-controls). */}
            {list && (
              <ul id="pick-list" ref={listRef} class="dir-semaine-noms" role="listbox" aria-label="Membres du clan" hidden={found.length === 0} data-testid="direction-weekly-pick-list">
                {found.map((choice, index) => (
                  // Un clic ne prend pas le focus au champ : on continue de taper ou de descendre avec les flèches.
                  <li
                    key={choice.name}
                    id={optionId(index)}
                    role="option"
                    aria-selected={picked?.name === choice.name}
                    class="dir-semaine-nom"
                    data-actif={index === active ? "" : undefined}
                    data-dir-ton={choice.name === chosenNow ? "ok" : choice.twin ? "warn" : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(choice.name)}
                  >
                    <span class="dir-semaine-nom-texte">{choice.name}</span>
                    {choice.name === chosenNow ? <span class="dir-semaine-marque">Choisi</span> : choice.twin ? <span class="dir-semaine-marque">En double</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {list && found.length === 0 && <p class="dir-note">Aucun pseudo de la liste ne contient ce texte.</p>}
            {choices === null && <p class="dir-note">La liste des membres n'a pas pu être lue : écrivez le pseudo exact, le serveur le vérifie.</p>}
          </div>
          <div>
            <div class="dir-semaine-sous">
              <label for="pick-note" class="text-sm font-semibold">
                Le mot de l'encadrement <span class="font-normal text-muted">(facultatif)</span>
              </label>
              <p class="tnum text-muted">
                {draft.note.length} / {WEEKLY_PICK_NOTE_MAX} caractères
              </p>
            </div>
            <textarea id="pick-note" class="field mt-1" rows={3} maxLength={WEEKLY_PICK_NOTE_MAX} value={draft.note} onInput={(e) => setDraft({ ...draft, note: e.currentTarget.value })} />
          </div>
          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || player === ""}>
              {state === "chosen" ? "Changer le Gaulois de la semaine" : "Choisir pour cette semaine"}
            </button>
          </div>
          <Problem message={error} />
          <Success message={done} />
        </form>

        <div class="dir-semaine-vues">
          <div class="card dir-semaine-vue">
            <h3 class="text-lg">Sur l'accueil</h3>
            <Problem message={readFailed ? "Le serveur ne répond pas pour l'instant : le choix en cours n'a pas pu être lu." : null} onRetry={() => void read()} />
            {shown ? (
              // Le choix que l'accueil montre, de cette semaine ou de la précédente : il se retire d'ici dans les deux cas.
              <div data-testid="direction-weekly-pick-current">
                <div class="dir-semaine-pastilles">
                  {onHome === false ? (
                    <Pastille ton="danger">Plus dans la liste : l'accueil ne le montre pas</Pastille>
                  ) : (
                    <Pastille ton="ok">En ligne</Pastille>
                  )}
                  {state === "previous" && <Pastille ton="warn">De la semaine passée</Pastille>}
                </div>
                <Honneur week={shown.week} player={shown.player} note={shown.note} />
                <div class="dir-semaine-retirer">
                  <DeleteButton busy={busy} label={`le choix de ${shown.player}`} onConfirm={() => void run(() => call("delete_weekly_pick"), "Choix retiré : l'accueil ne le montre plus.")} />
                </div>
              </div>
            ) : shown === null && !readFailed ? (
              <p class="dir-semaine-rien" data-testid="direction-weekly-pick-none">
                Rien n'est encore choisi pour {pickWeekEnding(thisWeek)}
              </p>
            ) : null}
          </div>
          {/* Pas d'aperçu d'un pseudo que le serveur refusera : la ligne sous le champ dit pourquoi. */}
          {(typed === "listed" || typed === "free") && (
            <div class="card dir-semaine-vue" data-testid="direction-weekly-pick-preview">
              <h3 class="text-lg">Aperçu</h3>
              <div class="dir-semaine-pastilles">
                <Pastille ton="ally">Pas encore enregistré</Pastille>
              </div>
              <Honneur week={thisWeek} player={picked?.name ?? player} note={draft.note.trim() === "" ? null : draft.note.trim()} />
            </div>
          )}
        </div>
      </div>
      <details class="fold mt-6">
        <summary class="font-semibold">Comment ça marche</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>L'accueil montre le Gaulois de la semaine à tous, sans dire qui l'a choisi.</p>
          <p>Seul un membre de la liste officielle peut être choisi, sous son pseudo exact. Le serveur le vérifie, et refuse un pseudo porté par plusieurs membres.</p>
          <p>Un choix reste sur l'accueil sa semaine, puis la suivante tant qu'aucun autre n'est fait. Si le joueur quitte la liste des membres, l'accueil ne le montre plus.</p>
        </div>
      </details>
    </section>
  );
}
