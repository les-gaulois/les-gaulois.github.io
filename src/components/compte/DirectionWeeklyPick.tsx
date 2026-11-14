import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { basePath, call } from "../../lib/compte/api";
import {
  TYPED_LABELS,
  WEEK_STATE_LABELS,
  countLabel,
  findChoice,
  pickChoices,
  previewNote,
  readMembersList,
  searchChoices,
  showsPreview,
  shownOnHome,
  typedState,
  weekShort,
  weekState,
} from "../../lib/compte/direction-semaine";
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

/** Le bouton pressé s'est désactivé pendant l'envoi, ou a disparu : le focus va au message, plutôt qu'au haut de la page. */
function refocus(target: HTMLElement | null) {
  const now = document.activeElement;
  if (!now || now === document.body) target?.focus();
}

/**
 * Le Gaulois de la semaine : l'encadrement choisit un membre de la liste officielle, avec un mot facultatif. L'accueil le
 * montre à tous, sans dire qui l'a choisi. Le serveur vérifie le rang et le pseudo (`save_weekly_pick`) : la liste proposée
 * ici n'est qu'une aide à la saisie. `draft` est gardé par l'espace Direction, comme les autres brouillons.
 *
 * L'écran (14 novembre 2026, « comme pour la section Comptes ») : l'état de la semaine en pastille près du titre, la liste
 * des membres à parcourir ou à chercher à chaque lettre, et à côté ce que l'accueil montre, puis ce qu'il montrera une fois
 * le choix enregistré. Les règles sont dans `src/lib/compte/direction-semaine.ts`.
 *
 * Le champ suit le modèle d'une liste à saisie (combobox ARIA) : le focus reste dans le champ, les flèches désignent un nom
 * (`aria-activedescendant`), Entrée le prend, Échap retire la désignation sans toucher au texte ; sans nom désigné, Entrée
 * envoie le formulaire. Le nom retenu porte `aria-selected`.
 */
export default function DirectionWeeklyPick({ draft, setDraft }: { draft: WeeklyPickDraft; setDraft: (draft: WeeklyPickDraft) => void }) {
  // `undefined` tant que ce n'est pas lu ; `null` : rien n'est choisi, ou le serveur n'a pas répondu (`readFailed`).
  const [shown, setShown] = useState<WeeklyPick | null | undefined>(undefined);
  const [readFailed, setReadFailed] = useState(false);
  // `undefined` : lecture en cours ; sinon la liste publique telle que la page l'a reçue (`null` : elle n'a pas pu être lue).
  const [roster, setRoster] = useState<{ list: unknown } | undefined>(undefined);
  // Ce qui filtre la liste : le texte tapé. Un clic sur un nom remplit le champ sans refermer la liste autour de lui. Au
  // retour sur l'onglet, la recherche reprend le brouillon.
  const [query, setQuery] = useState(draft.player);
  // Le nom désigné au clavier (flèches), dans la liste filtrée ; -1 : aucun.
  const [active, setActive] = useState(-1);
  // Ce que donne la dernière action s'écrit près d'elle : le choix sous le formulaire, le retrait sous « Sur l'accueil ».
  const [lastAction, setLastAction] = useState<"save" | "delete" | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const saveDone = useRef<HTMLDivElement>(null);
  const deleteDone = useRef<HTMLDivElement>(null);
  const readSeq = useRef(0);
  const thisWeek = currentPickWeek(new Date());

  const read = async () => {
    const seq = ++readSeq.current;
    const news = await fetchLiveNews();
    // Une lecture plus récente est partie entre-temps (après un choix, ou « Réessayer ») : celle-ci arrive trop tard.
    if (seq !== readSeq.current) return;
    setReadFailed(news === null);
    setShown(news?.weeklyPick ?? null);
  };
  const { busy, error, done, run } = useRun(read);

  useEffect(() => {
    void read();
    // Les pseudos de la liste publique, pour aider la saisie : sans elle, le champ reste libre et le serveur vérifie.
    void readMembersList(`${basePath()}/data/members.json`).then((list) => setRoster({ list }));
  }, []);

  // Une autre recherche : la liste repart de son haut.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  const player = draft.player.trim();
  const choices = useMemo(() => (roster ? pickChoices(roster.list) : undefined), [roster]);
  const list = choices ?? null;
  const found = useMemo(() => (list ? searchChoices(list, query) : []), [list, query]);
  const picked = list ? findChoice(list, player) : null;
  const typed = choices === undefined ? "empty" : typedState(list, player);
  const typedLabel = TYPED_LABELS[typed];
  const state = shown === undefined ? null : weekState(shown, thisWeek, readFailed);
  const chosenNow = state === "chosen" && shown ? shown.player : null;
  // `null` tant que la liste publique n'est pas lue : l'accueil, lui non plus, ne montre rien avant.
  const onHome = shown && roster ? shownOnHome(roster.list, shown.player) : null;
  const optionId = (index: number) => `pick-option-${index}`;
  const designated = list && active >= 0 && active < found.length ? active : -1;

  const pick = (name: string) => {
    setDraft({ ...draft, player: name });
    setActive(-1);
  };
  const move = (to: number) => {
    setActive(to);
    const box = listRef.current;
    const option = box?.querySelector<HTMLElement>(`#${optionId(to)}`);
    if (!box || !option) return;
    // Le nom désigné se montre dans le cadre de la liste, sans faire bouger la page.
    const top = box.getBoundingClientRect().top + box.clientTop;
    const bottom = top + box.clientHeight;
    const item = option.getBoundingClientRect();
    if (item.top < top) box.scrollTop -= top - item.top;
    else if (item.bottom > bottom) box.scrollTop += item.bottom - bottom;
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
            if (busy) return;
            setLastAction("save");
            // Le pseudo s'affiche ensuite tel que le serveur l'a enregistré, avec l'orthographe exacte de la liste.
            void run(() => call("save_weekly_pick", { p_player: player, p_note: draft.note }), "Gaulois de la semaine enregistré : l'accueil le montre.").then((ok) => {
              if (ok) {
                setDraft(EMPTY_WEEKLY_PICK);
                setQuery("");
                setActive(-1);
              }
              refocus(saveDone.current);
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
              aria-activedescendant={designated >= 0 ? optionId(designated) : undefined}
              aria-describedby="pick-typed"
              value={draft.player}
              onInput={(e) => {
                setDraft({ ...draft, player: e.currentTarget.value });
                setQuery(e.currentTarget.value);
                setActive(-1);
              }}
              onKeyDown={(e) => {
                if (!list || found.length === 0 || e.isComposing) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(Math.min(designated + 1, found.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(Math.max(designated - 1, 0));
                } else if (e.key === "Enter" && designated >= 0) {
                  // Entrée choisit le nom désigné ; sans nom désigné, elle enregistre comme dans tout formulaire.
                  e.preventDefault();
                  pick(found[designated]!.name);
                } else if (e.key === "Escape" && designated >= 0) {
                  // Échap retire la désignation ; le texte tapé reste.
                  e.preventDefault();
                  setActive(-1);
                }
              }}
              // Le focus quitte le champ (Tab, ou un clic ailleurs) : plus de nom désigné. Un clic dans la liste garde le focus.
              onBlur={() => setActive(-1)}
            />
            <div class="dir-semaine-sous">
              <p id="pick-typed" role="status" data-testid="direction-weekly-pick-typed">
                {typedLabel ? (
                  <Pastille ton={typedLabel.tone} plain>
                    {typedLabel.label}
                  </Pastille>
                ) : null}
              </p>
              {list && (
                <p class="text-muted" data-testid="direction-weekly-pick-count">
                  {countLabel(found.length, list.length, query)}
                </p>
              )}
            </div>
            {/* La liste existe dès qu'elle est lue, même sans résultat : le champ la désigne (aria-controls). Elle n'est pas un
                arrêt de la touche Tab, comme le serait un cadre qui défile : on la parcourt aux flèches depuis le champ. */}
            {list && (
              <ul
                id="pick-list"
                ref={listRef}
                class="dir-semaine-noms"
                role="listbox"
                aria-label="Membres du clan"
                tabIndex={-1}
                hidden={found.length === 0}
                data-testid="direction-weekly-pick-list"
              >
                {found.map((choice, index) => (
                  // Un clic ne prend pas le focus au champ : on continue de taper ou de descendre avec les flèches.
                  <li
                    key={choice.name}
                    id={optionId(index)}
                    role="option"
                    aria-selected={picked?.name === choice.name}
                    class="dir-semaine-nom"
                    data-actif={index === designated ? "" : undefined}
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
            {roster && !list && <p class="dir-note">La liste des membres n'a pas pu être lue : écrivez le pseudo exact, le serveur le vérifie.</p>}
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
          <div ref={saveDone} class="dir-semaine-retour" tabIndex={-1} data-testid="direction-weekly-pick-saved">
            <Problem message={lastAction === "save" ? error : null} />
            <Success message={lastAction === "save" ? done : null} />
          </div>
        </form>

        <div class="dir-semaine-vues">
          <div class="card dir-semaine-vue">
            <h3 class="text-lg">Sur l'accueil</h3>
            <Problem message={readFailed ? "Le serveur ne répond pas pour l'instant : le choix en cours n'a pas pu être lu." : null} onRetry={() => void read()} />
            {shown ? (
              // Le choix que l'accueil montre, de cette semaine ou de la précédente : il se retire d'ici dans les deux cas.
              <div data-testid="direction-weekly-pick-current">
                {(onHome !== null || state === "previous") && (
                  <div class="dir-semaine-pastilles">
                    {onHome === false ? <Pastille ton="danger">Plus dans la liste : l'accueil ne le montre pas</Pastille> : onHome ? <Pastille ton="ok">En ligne</Pastille> : null}
                    {state === "previous" && <Pastille ton="warn">De la semaine passée</Pastille>}
                  </div>
                )}
                <Honneur week={shown.week} player={shown.player} note={shown.note} />
                <div class="dir-semaine-retirer">
                  {/* Un bouton neuf pour chaque choix : après un retrait, celui de la semaine passée peut prendre sa place, et ne
                      doit pas hériter de la confirmation déjà donnée (sous Safari, le bouton cliqué ne prend pas le focus, et ne
                      se désarme donc pas en le perdant). */}
                  <DeleteButton
                    key={`${shown.week} ${shown.player}`}
                    busy={busy}
                    label={`le choix de ${shown.player}`}
                    onConfirm={() => {
                      if (busy) return;
                      setLastAction("delete");
                      void run(() => call("delete_weekly_pick"), "Choix retiré : l'accueil ne le montre plus.").then(() => refocus(deleteDone.current));
                    }}
                  />
                </div>
              </div>
            ) : shown === null && !readFailed ? (
              <p class="dir-semaine-rien" data-testid="direction-weekly-pick-none">
                Rien n'est encore choisi pour {pickWeekEnding(thisWeek)}
              </p>
            ) : null}
            <div ref={deleteDone} class="dir-semaine-retour" tabIndex={-1} data-testid="direction-weekly-pick-deleted">
              <Problem message={lastAction === "delete" ? error : null} />
              <Success message={lastAction === "delete" ? done : null} />
            </div>
          </div>
          {/* Pas d'aperçu d'un pseudo que le serveur refusera : la ligne sous le champ dit pourquoi. */}
          {showsPreview(typed) && (
            <div class="card dir-semaine-vue" data-testid="direction-weekly-pick-preview">
              <h3 class="text-lg">Aperçu</h3>
              <div class="dir-semaine-pastilles">
                <Pastille ton="ally">Pas encore enregistré</Pastille>
              </div>
              <Honneur week={thisWeek} player={picked?.name ?? player} note={previewNote(draft.note)} />
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
