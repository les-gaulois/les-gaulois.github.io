import { useEffect, useRef, useState } from "preact/hooks";
import { IDEA_MAX, IDEA_MIN, IDEA_NOTE_MAX, IDEA_OPEN_MAX, IDEA_STATUS_LABELS, decidedIdeas, ideaProblem, keepOrder, openIdeas, supportLabel, type IdeaStatus, type QgIdea } from "../../lib/compte/qg";
import {
  IDEA_DECISION_VERBS,
  IDEA_FILTERS,
  IDEA_SEARCH_FROM,
  IDEA_STATUS_ORDER,
  IDEA_TONES,
  defaultIdeaFilter,
  filterAfterSend,
  filterIdeas,
  ideaCounts,
  ideaDecision,
  ideaFocusAfter,
  isLongIdea,
  searchIdeas,
  type IdeaDecision,
  type IdeaFilter,
} from "../../lib/compte/qg-idees";
import { fmtDate, fmtInt } from "../../lib/format";
import { DeleteButton, Problem } from "./common";
import { Pastille, useBarreCollante } from "./direction-kit";
import { PartieTete } from "./Onglets";

const STATUSES = IDEA_STATUS_ORDER;
/** Ce que l'encadrement peut décider d'une idée à l'étude, dans l'ordre des boutons de la ligne. */
const DECISIONS = Object.keys(IDEA_DECISION_VERBS) as (keyof typeof IDEA_DECISION_VERBS)[];

/** Le clavier a perdu sa place : sur la page elle-même, ou sur un élément retiré ou caché (formulaire replié). */
function focusLost(): boolean {
  const active = document.activeElement;
  return !(active instanceof HTMLElement) || active === document.body || !active.isConnected || active.offsetParent === null;
}

/**
 * Pour l'encadrement : le mot facultatif qui accompagne une décision, et son envoi, sous la ligne. Pour une idée à l'étude,
 * la décision vient du bouton de la ligne (`status`) ; pour une idée déjà tranchée (`choices`), elle se change ici.
 * Ce qui part au serveur est calculé par `ideaDecision` : rien quand rien ne change, jamais de mot avec « À l'étude ».
 */
function IdeaDecisionPanel({
  id,
  idea,
  status,
  choices,
  busy,
  onStatus,
  onDecide,
  onCancel,
}: {
  id: string;
  idea: QgIdea;
  status: IdeaStatus;
  choices: boolean;
  busy: boolean;
  onStatus: (status: IdeaStatus) => void;
  onDecide: (decision: IdeaDecision) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState(idea.staff_note ?? "");
  const panel = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // Une idée remise à l'étude n'a pas de mot : le champ ne s'affiche pas, et le serveur efface celui qu'elle avait.
  const back = status === "open";
  // À l'ouverture, le clavier arrive là où l'on continue : le statut choisi pour une décision à changer, sinon le mot à
  // écrire. Seulement une fois la touche traitée : si le champ prenait le focus pendant l'appui sur Entrée qui ouvre le
  // panneau, cette même touche enverrait la décision.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const target = choices ? panel.current?.querySelector<HTMLElement>('[data-testid="qg-idea-choice"][aria-pressed="true"]') : field.current;
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const decision = ideaDecision(idea, status, note);
  const blocked = busy || decision === null;
  return (
    <form
      ref={panel}
      id={id}
      class="qg-idees-decision"
      data-testid="qg-idea-decision"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && decision) onDecide(decision);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onCancel();
      }}
    >
      {choices && (
        <div class="qg-idees-choix" role="group" aria-label="Décision de l'encadrement">
          {STATUSES.map((value) => (
            <button key={value} type="button" class="dir-bouton" data-dir-ton={IDEA_TONES[value]} aria-pressed={status === value} data-testid="qg-idea-choice" data-decision={value} onClick={() => onStatus(value)}>
              {IDEA_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
      )}
      {back ? (
        idea.staff_note && (
          <p class="qg-idees-efface" data-testid="qg-idea-reopen">
            Le mot de l'encadrement sera effacé.
          </p>
        )
      ) : (
        <div class="qg-idees-mot-champ">
          <label for={`idea-note-${idea.id}`}>Un mot pour les membres (facultatif)</label>
          <input
            ref={field}
            id={`idea-note-${idea.id}`}
            class="field dir-champ"
            maxLength={IDEA_NOTE_MAX}
            value={note}
            onInput={(e) => setNote(e.currentTarget.value)}
            // Entrée gardée enfoncée sur « Retenir » se répète dans le champ : elle n'envoie pas la décision.
            onKeyDown={(e) => e.key === "Enter" && e.repeat && e.preventDefault()}
          />
        </div>
      )}
      <div class="qg-idees-decision-boutons">
        <button type="submit" class="dir-bouton" data-dir-ton={IDEA_TONES[status]} aria-disabled={blocked || undefined} data-testid="qg-idea-decision-send">
          Enregistrer : {IDEA_STATUS_LABELS[status].toLowerCase()}
        </button>
        <button type="button" class="dir-bouton" data-dir-ton="muted" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function IdeaRow({
  idea,
  staff,
  busy,
  problem,
  onSupport,
  onDelete,
  onDecide,
}: {
  idea: QgIdea;
  staff: boolean;
  busy: boolean;
  /** Le refus du serveur pour une action sur cette idée : il s'affiche ici, là où le membre regarde. */
  problem: string | null;
  onSupport: (idea: QgIdea) => void;
  onDelete: (idea: QgIdea) => void;
  /** `back` : le bouton d'où la décision est partie, où le clavier revient une fois la décision enregistrée. */
  onDecide: (idea: QgIdea, decision: IdeaDecision, back: HTMLElement | null) => Promise<boolean>;
}) {
  const open = idea.status === "open";
  const long = isLongIdea(idea.body);
  const [unfolded, setUnfolded] = useState(false);
  // La décision en cours de saisie par l'encadrement. Le panneau se referme quand le serveur l'a acceptée, même si la
  // relecture du QG a échoué ; refusée, elle reste ouverte avec son refus, pour réessayer.
  const [deciding, setDeciding] = useState<IdeaStatus | null>(null);
  /** Le bouton d'où la décision est partie : le clavier y revient si on annule. */
  const trigger = useRef<HTMLButtonElement | null>(null);
  // L'envoi peut finir après que la ligne a quitté la liste (l'idée a changé de filtre) : rien ne s'y écrit plus alors.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const who = idea.mine ? "votre idée" : `l'idée de ${idea.author}`;
  const label = supportLabel(idea.supports);
  const cut = label.lastIndexOf(" ");
  const panelId = `idea-decision-${idea.id}`;
  // Un bouton de décision déjà choisi se relâche : le panneau se ferme, le clavier reste dessus.
  const decide = (status: IdeaStatus) => (e: MouseEvent) => {
    trigger.current = e.currentTarget as HTMLButtonElement;
    setDeciding(deciding === status ? null : status);
  };

  return (
    <li class="qg-idees-ligne" tabIndex={-1} data-dir-ton={IDEA_TONES[idea.status]} data-statut={idea.status} data-idea={idea.id} data-testid="qg-idea">
      <div class="qg-idees-voix">
        <span class="qg-idees-soutiens" data-testid="qg-idea-supports">
          <strong class="tnum">{label.slice(0, cut)}</strong> {label.slice(cut + 1)}
        </span>
        {open && !idea.mine && (
          <button type="button" class="dir-filtre qg-idees-soutenir" aria-pressed={idea.supported} aria-disabled={busy || undefined} aria-label={`Je soutiens l'idée de ${idea.author}`} data-testid="qg-idea-support" onClick={() => !busy && onSupport(idea)}>
            Je soutiens
          </button>
        )}
      </div>

      <div class="qg-idees-corps">
        <p id={`idea-text-${idea.id}`} class="qg-idees-texte" data-coupe={long && !unfolded ? "" : undefined}>
          {idea.body}
        </p>
        {long && (
          <button type="button" class="qg-idees-suite" aria-expanded={unfolded} aria-controls={`idea-text-${idea.id}`} data-testid="qg-idea-more" onClick={() => setUnfolded(!unfolded)}>
            {unfolded ? "Réduire" : "Lire la suite"}
          </button>
        )}
        {!open && idea.staff_note && (
          <p class="qg-idees-mot" data-testid="qg-idea-note">
            <span class="qg-idees-mot-titre">Mot de l'encadrement</span> {idea.staff_note}
          </p>
        )}
        <div class="qg-idees-pied">
          <p class="qg-idees-meta">
            <Pastille ton={IDEA_TONES[idea.status]} plain testid="qg-idea-status">
              {IDEA_STATUS_LABELS[idea.status]}
            </Pastille>
            {!open && idea.decided_at && <span class="tnum">le {fmtDate(idea.decided_at)}</span>}
            <span class="qg-idees-auteur">{idea.mine ? "Votre idée" : idea.author}</span>
            <span class="tnum">{open ? fmtDate(idea.created_at) : `proposée le ${fmtDate(idea.created_at)}`}</span>
          </p>
          {(staff || idea.mine) && (
            <div class="qg-idees-actions">
              {staff &&
                open &&
                DECISIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    class="dir-bouton"
                    data-dir-ton={IDEA_TONES[status]}
                    aria-pressed={deciding === status}
                    aria-controls={deciding === status ? panelId : undefined}
                    aria-label={`${IDEA_DECISION_VERBS[status]} : ${who}`}
                    data-testid="qg-idea-decide"
                    data-decision={status}
                    onClick={decide(status)}
                  >
                    {IDEA_DECISION_VERBS[status]}
                  </button>
                ))}
              {staff && !open && (
                <button
                  type="button"
                  class="dir-bouton"
                  aria-expanded={deciding !== null}
                  aria-controls={deciding !== null ? panelId : undefined}
                  aria-label={`Modifier la décision : ${who}`}
                  data-testid="qg-idea-decide"
                  onClick={deciding === null ? decide(idea.status) : () => setDeciding(null)}
                >
                  Modifier
                </button>
              )}
              <DeleteButton busy={busy} label={who} onConfirm={() => onDelete(idea)} />
            </div>
          )}
        </div>
        {staff && deciding && (
          <IdeaDecisionPanel
            id={panelId}
            idea={idea}
            status={deciding}
            choices={!open}
            busy={busy}
            onStatus={setDeciding}
            onDecide={(decision) =>
              void onDecide(idea, decision, trigger.current).then((accepted) => {
                if (accepted && alive.current) setDeciding(null);
              })
            }
            onCancel={() => {
              setDeciding(null);
              trigger.current?.focus();
            }}
          />
        )}
        {/* Sous le panneau de décision : un refus se lit à côté du bouton qui l'a envoyé. */}
        <Problem message={problem} />
      </div>
    </li>
  );
}

function IdeaForm({ openMine, busy, refusal, onSend }: { openMine: number; busy: boolean; refusal: string | null; onSend: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Sur téléphone, le formulaire est replié sous son bouton : la liste reste dans le premier écran. Sur grand écran, la
  // feuille de style le montre toujours, à côté de la liste. Un refus le garde ouvert ; refermé, il garde le texte commencé.
  const [asked, setAsked] = useState(false);
  const shown = asked || problem !== null || refusal !== null;
  const field = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // À la limite, rien ne part : la raison est écrite au-dessus du champ, et le champ la fait lire (`aria-describedby`).
  const full = openMine >= IDEA_OPEN_MAX;
  const length = body.trim().length;
  const blocked = busy || length === 0 || full;
  return (
    <div class="qg-idees-proposer" data-ouvert={shown}>
      <div class="qg-idees-ouvrir">
        <button
          ref={opener}
          type="button"
          class="btn btn-ghost w-full"
          aria-expanded={shown}
          aria-controls="idea-form"
          data-testid="qg-idea-open-form"
          onClick={() => {
            if (shown) {
              setAsked(false);
              setProblem(null);
            } else {
              setAsked(true);
              // Le champ n'existe à l'écran qu'après le rendu.
              requestAnimationFrame(() => field.current?.focus());
            }
          }}
        >
          Proposer une idée
        </button>
      </div>
      <form
        id="idea-form"
        class="card qg-idees-form"
        data-testid="qg-idea-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (blocked) return;
          const found = ideaProblem(body, openMine);
          setProblem(found);
          if (found) return;
          void onSend(body).then((sent) => {
            if (!sent) return;
            setBody("");
            setAsked(false);
            // Sur téléphone, le formulaire se replie avec le bouton qui vient d'envoyer : le clavier revient à son bouton.
            window.setTimeout(() => {
              if (focusLost() && opener.current?.offsetParent) opener.current.focus();
            }, 0);
          });
        }}
      >
        <label for="idea-body" class="qg-idees-form-titre">
          Votre idée pour le clan
        </label>
        {/* Ses idées à l'étude ne se comptent que s'il y en a ; à la limite, la raison du refus se lit avant d'écrire. */}
        {full ? (
          <p id="idea-quota" class="form-problem" data-testid="qg-idea-quota">
            {ideaProblem(body, openMine)}
          </p>
        ) : (
          openMine > 0 && (
            <p class="qg-idees-quota" data-testid="qg-idea-quota">
              <Pastille ton="muted" plain>
                <span class="tnum">
                  {fmtInt(openMine)} sur {fmtInt(IDEA_OPEN_MAX)}
                </span>{" "}
                de vos idées à l'étude
              </Pastille>
            </p>
          )
        )}
        <textarea ref={field} id="idea-body" class="field" rows={4} maxLength={IDEA_MAX} aria-describedby={full ? "idea-quota idea-help" : "idea-help"} value={body} onInput={(e) => setBody(e.currentTarget.value)} />
        <div class="qg-idees-form-pied">
          <p id="idea-help" class="tnum info-discrete">
            {fmtInt(length)} sur {fmtInt(IDEA_MAX)} caractères
          </p>
          <button type="submit" class="btn btn-primary" aria-disabled={blocked || undefined}>
            Proposer
          </button>
        </div>
        <Problem message={problem ?? refusal} />
        <details class="fold qg-idees-regles">
          <summary>Règles de la boîte</summary>
          <ul>
            <li>
              Une idée s'écrit en {fmtInt(IDEA_MIN)} à {fmtInt(IDEA_MAX)} caractères et paraît sous votre nom.
            </li>
            <li>{fmtInt(IDEA_OPEN_MAX)} idées à l'étude au plus par membre.</li>
            <li>Les soutiens restent anonymes.</li>
            <li>L'encadrement tranche : retenue, faite ou écartée.</li>
          </ul>
        </details>
      </form>
    </div>
  );
}

/**
 * « Idées » : la boîte à idées. Un membre propose, les autres soutiennent (anonymement), l'encadrement tranche (`staff`).
 * Les actions passent par `QgApp`, qui relit le QG ensuite : ce qui s'affiche vient toujours du serveur. `onSend`,
 * `onDelete` et `onDecide` rendent `true` quand le serveur a accepté.
 * `problemAt` : le refus du serveur, affiché là où l'on agit (`idea-form`, `idea-<id>`).
 *
 * Dessin du 14 novembre 2026, sur le modèle de l'onglet Comptes de la Direction : des filtres à bascule avec leur nombre,
 * une ligne courte par idée avec son statut en pastille (couleurs dans `IDEA_TONES`, `src/lib/compte/qg-idees.ts`), le
 * formulaire étroit à côté de la liste (replié sous un bouton sur téléphone), la décision de l'encadrement sur la ligne.
 */
export default function QgIdees({
  ideas,
  staff,
  busy,
  problemAt,
  onSend,
  onSupport,
  onDelete,
  onDecide,
}: {
  ideas: QgIdea[];
  staff: boolean;
  busy: boolean;
  problemAt: (at: string) => string | null;
  onSend: (body: string) => Promise<boolean>;
  onSupport: (idea: QgIdea) => void;
  onDelete: (idea: QgIdea) => Promise<boolean>;
  onDecide: (idea: QgIdea, decision: IdeaDecision) => Promise<boolean>;
}) {
  // L'ordre des idées à l'étude tel que le membre l'a vu : un soutien ne déplace pas la liste sous son doigt.
  const shown = useRef<number[]>([]);
  const ideasOpen = keepOrder(shown.current, openIdeas(ideas));
  shown.current = ideasOpen.map((idea) => idea.id);
  const openMine = ideasOpen.filter((idea) => idea.mine).length;
  const totals = ideaCounts(ideas);

  // Le filtre ouvert à l'arrivée ne change plus ensuite que par le membre : la liste ne saute pas après une décision.
  // Seule exception, après l'envoi d'une idée : la liste montre où elle a paru (`filterAfterSend`).
  const [filter, setFilter] = useState<IdeaFilter>(() => defaultIdeaFilter(totals));
  const [query, setQuery] = useState("");
  const searchable = ideas.length >= IDEA_SEARCH_FROM;
  const typed = searchable ? query : "";
  // Les nombres des filtres comptent ce que la recherche laisse : chaque filtre dit combien de lignes il montre.
  const found = searchIdeas([...ideasOpen, ...decidedIdeas(ideas)], typed);
  const counts = ideaCounts(found);
  const list = filterIdeas(found, filter);
  const current = IDEA_FILTERS.find((f) => f.id === filter);
  // La barre est toujours là, cachée tant qu'il n'y a pas d'idée : sa hauteur se mesure dès qu'elle paraît.
  const { root, bar } = useBarreCollante<HTMLElement>();

  // Les idées affichées au dernier rendu, pour rendre sa place au clavier après une action (`refocus`).
  const listed = useRef<number[]>([]);
  listed.current = list.map((idea) => idea.id);
  /**
   * Après une action sur une idée, si le clavier a perdu sa place : `back` (le bouton d'où elle est partie) s'il est
   * encore à l'écran, sinon la ligne de l'idée ou celle qui a pris sa place, le filtre ouvert, ou le formulaire.
   */
  const refocus = (id: number, index: number, back: HTMLElement | null = null) => {
    window.setTimeout(() => {
      const section = root.current;
      if (!section || !focusLost()) return;
      const target = ideaFocusAfter(listed.current, id, index);
      const candidates = [
        back,
        target === null ? null : section.querySelector<HTMLElement>(`[data-testid="qg-idea"][data-idea="${target}"]`),
        section.querySelector<HTMLElement>('[data-testid="qg-idea-filter"][aria-pressed="true"]'),
        section.querySelector<HTMLElement>("#idea-body"),
        section.querySelector<HTMLElement>('[data-testid="qg-idea-open-form"]'),
      ];
      candidates.find((el) => el?.isConnected && el.offsetParent !== null)?.focus();
    }, 0);
  };

  // Un filtre choisi ou une recherche tapée plus bas dans la liste la raccourcit : la page revient au début de la liste,
  // sans mouvement, comme dans l'onglet Comptes. Pas à l'arrivée : la page se place alors toute seule.
  const top = useRef<HTMLDivElement>(null);
  const arrived = useRef(false);
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    const mark = top.current;
    if (!mark || mark.offsetParent === null) return;
    const header = document.querySelector<HTMLElement>("header.barre");
    const gap = mark.getBoundingClientRect().top - (header?.offsetHeight ?? 0);
    // « instant » : sinon, le `scroll-behavior: smooth` de la page ferait glisser la liste à chaque lettre tapée.
    if (gap < 0) window.scrollBy({ top: gap, behavior: "instant" });
  }, [filter, typed]);

  return (
    <section ref={root} class="qg-idees" aria-labelledby="idees-titre" data-testid="qg-ideas">
      <PartieTete
        id="idees-titre"
        title="Boîte à idées"
        aside={
          staff &&
          ideas.length > 0 && (
            <p class="qg-idees-a-trancher" data-testid="qg-ideas-todo">
              {totals.open > 0 ? (
                <Pastille ton="warn">
                  <span class="tnum">{fmtInt(totals.open)}</span> à trancher
                </Pastille>
              ) : (
                <Pastille ton="ok">Tout est tranché</Pastille>
              )}
            </p>
          )
        }
      />
      <div class="qg-idees-plan">
        <IdeaForm
          openMine={openMine}
          busy={busy}
          refusal={problemAt("idea-form")}
          onSend={(body) =>
            onSend(body).then((sent) => {
              if (sent) {
                setFilter(filterAfterSend(filter));
                setQuery("");
              }
              return sent;
            })
          }
        />
        <div class="qg-idees-colonne" hidden={ideas.length === 0 || undefined}>
          <p class="sr-only" role="status">
            {ideas.length > 0 ? `${current?.label ?? ""} : ${fmtInt(list.length)}` : ""}
          </p>
          <div ref={top} />
          <div ref={bar} class="dir-outils">
            {searchable && (
              <div class="dir-recherche" role="search">
                <label class="sr-only" for="idea-search">
                  Chercher une idée ou un auteur
                </label>
                <input id="idea-search" type="search" class="field dir-champ" placeholder="Chercher une idée" autocomplete="off" value={query} data-testid="qg-idea-search" onInput={(e) => setQuery(e.currentTarget.value)} />
              </div>
            )}
            <div class="dir-filtres" role="group" aria-label="Filtrer les idées">
              {IDEA_FILTERS.map((f) => (
                <button key={f.id} type="button" class="dir-filtre" data-dir-ton={f.tone} data-testid="qg-idea-filter" data-filter={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                  <span class="dir-nombre tnum">{fmtInt(counts[f.id])}</span>
                </button>
              ))}
            </div>
          </div>
          {list.length > 0 && (
            <ul class="qg-idees-liste" data-testid={filter === "open" ? "qg-ideas-open" : filter === "mine" ? "qg-ideas-mine" : "qg-ideas-decided"}>
              {list.map((idea, index) => (
                <IdeaRow
                  key={idea.id}
                  idea={idea}
                  staff={staff}
                  busy={busy}
                  problem={problemAt(`idea-${idea.id}`)}
                  onSupport={onSupport}
                  onDelete={(target) => void onDelete(target).then(() => refocus(target.id, index))}
                  onDecide={(target, decision, back) =>
                    onDecide(target, decision).then((accepted) => {
                      if (accepted) refocus(target.id, index, back);
                      return accepted;
                    })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
