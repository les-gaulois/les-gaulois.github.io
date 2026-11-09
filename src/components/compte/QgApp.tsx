import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { basePath, call } from "../../lib/compte/api";
import { seriesNote } from "../../lib/compte/news";
import {
  IDEA_MAX,
  IDEA_NOTE_MAX,
  IDEA_STATUS_LABELS,
  decidedIdeas,
  ideaProblem,
  initialOf,
  keepOrder,
  openIdeas,
  othersLabel,
  parseQg,
  supportLabel,
  type Face,
  type IdeaStatus,
  type QgData,
  type QgEvent,
  type QgIdea,
} from "../../lib/compte/qg";
import { ROLE_LABELS, type Me } from "../../lib/compte/types";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";
import { DeleteButton, DiscordButton, Loading, Problem, messageOf, useMe, type Loadable } from "./common";
import QgPolls from "./QgPolls";

/** Les décisions passées montrées d'abord ; les suivantes restent repliées, à portée. */
const PAST_SHOWN = 2;

/** La photo Discord d'un membre, ou son initiale si elle manque ou ne se charge pas. Décorative : le nom est écrit à côté. */
function Avatar({ name, avatar, large = false }: { name: string; avatar: string | null; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [avatar]);
  return (
    <span class={`avatar overflow-hidden ${large ? "!size-14 text-xl" : ""}`} aria-hidden="true">
      {avatar && !broken ? (
        <img src={avatar} alt="" width={large ? 56 : 36} height={large ? 56 : 36} loading="lazy" decoding="async" referrerpolicy="no-referrer" class="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}

const roleNote = (face: Face) => (face.role === "member" ? null : ROLE_LABELS[face.role]);

function Section({ id, title, children, testId }: { id: string; title: string; children: ComponentChildren; testId: string }) {
  return (
    <section id={id} class="scroll-mt-24" aria-labelledby={`${id}-title`} data-testid={testId}>
      <h2 id={`${id}-title`} class="text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** La porte du QG, pour un visiteur ou un compte pas encore validé : ce qu'il y a derrière, et comment entrer. */
function Door({ me }: { me: Me }) {
  const base = basePath();
  return (
    <section class="card max-w-3xl p-6" data-testid="qg-door">
      <h2 class="text-2xl">Réservé aux membres de GAL</h2>
      <p class="mt-2 text-muted">Au QG : les sondages et les décisions du clan, la boîte à idées, qui vient aux événements et le mur des membres. Rien de cela n'est visible sans être reconnu comme membre.</p>
      <ol class="mt-4 list-decimal space-y-1 pl-5">
        <li>Connectez-vous avec Discord.</li>
        <li>Indiquez votre pseudo ou votre identifiant OpenFront dans « Mon compte ».</li>
        <li>Le site vérifie qu'il figure dans la liste des membres de GAL.</li>
        <li>Un officier confirme que c'est bien vous. Ensuite, le site vous reconnaît à chaque visite.</li>
      </ol>
      {!me.signed_in && (
        <>
          <div class="mt-5">
            <DiscordButton returnPath="/compte" />
          </div>
          <p class="mt-3 text-sm text-muted">
            Le site ne reçoit jamais votre mot de passe. Ce qui est conservé est décrit dans la <a href={`${base}/confidentialite`}>page de confidentialité</a>.
          </p>
        </>
      )}
      {me.signed_in && me.status === "pending" && (
        <p class="mt-5" data-testid="qg-pending">
          <strong>Votre compte attend sa validation.</strong> Faites ou suivez votre demande dans <a href={`${base}/compte`}>Mon compte</a>.
        </p>
      )}
      {me.signed_in && me.status === "suspended" && (
        <p class="form-problem mt-5" data-testid="qg-suspended">
          Ce compte est suspendu{me.status_reason ? ` : ${me.status_reason}` : "."} Le QG lui est fermé.
        </p>
      )}
    </section>
  );
}

function Events({ events, busy, problemAt, onAnswer }: { events: QgEvent[]; busy: boolean; problemAt: (at: string) => string | null; onAnswer: (event: number, going: boolean) => void }) {
  if (events.length === 0) return <p class="mt-3 text-muted">Aucun événement annoncé pour l'instant.</p>;
  return (
    <ul class="mt-4 grid gap-3 md:grid-cols-2" data-testid="qg-events-list">
      {events.map((event) => {
        const series = seriesNote(event.series);
        const others = othersLabel(event.going, event.faces.length);
        return (
          <li key={event.id} class="card p-5" data-testid="qg-event">
            <p class="tnum text-sm text-muted">{fmtDateTime(event.starts_at)}</p>
            <h3 class="mt-1 text-lg [overflow-wrap:anywhere]">{event.title}</h3>
            {event.description && <p class="mt-2 whitespace-pre-line text-muted">{event.description}</p>}
            {event.url && (
              <a href={event.url} rel="noopener" class="mt-2 inline-block text-blue-text underline">
                En savoir plus
              </a>
            )}
            {series && <p class="tnum mt-2 text-sm text-muted">{series}</p>}
            {event.faces.length > 0 && (
              <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="Ils viennent" data-testid="qg-event-faces">
                {event.faces.map((face, i) => (
                  <li key={i} class="flex items-center gap-2 text-sm">
                    <Avatar name={face.name} avatar={face.avatar} />
                    <span class="[overflow-wrap:anywhere]">{face.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {others && <p class="tnum mt-2 text-sm text-muted">{others}</p>}
            <div class="mt-3 flex flex-wrap items-center gap-2">
              {/* Pas de `disabled` pendant l'envoi : un bouton désactivé perd le focus du clavier. */}
              <button type="button" class="chip !min-h-9" aria-pressed={event.mine} aria-disabled={busy || undefined} onClick={() => !busy && onAnswer(event.id, !event.mine)} data-testid="qg-going">
                Je viens
              </button>
              {event.mine && <span class="text-sm text-muted">Votre présence est notée.</span>}
            </div>
            <Problem message={problemAt(`event-${event.id}`)} />
          </li>
        );
      })}
    </ul>
  );
}

/** Pour l'encadrement : trancher une idée, avec un mot facultatif pour les membres. */
function IdeaDecision({ idea, busy, onDecide }: { idea: QgIdea; busy: boolean; onDecide: (status: IdeaStatus, note: string) => void }) {
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [note, setNote] = useState(idea.staff_note ?? "");
  useEffect(() => {
    setStatus(idea.status);
    setNote(idea.staff_note ?? "");
  }, [idea.status, idea.staff_note]);
  const unchanged = status === idea.status && note.trim() === (idea.staff_note ?? "");
  return (
    <form
      class="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[auto_1fr_auto] sm:items-end"
      data-testid="qg-idea-decision"
      onSubmit={(e) => {
        e.preventDefault();
        onDecide(status, note);
      }}
    >
      <div>
        <label for={`idea-status-${idea.id}`} class="text-sm font-semibold">
          Décision de l'encadrement
        </label>
        <select id={`idea-status-${idea.id}`} class="field mt-1 sm:!w-auto" value={status} onChange={(e) => setStatus(e.currentTarget.value as IdeaStatus)}>
          {(Object.keys(IDEA_STATUS_LABELS) as IdeaStatus[]).map((value) => (
            <option key={value} value={value}>
              {IDEA_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label for={`idea-note-${idea.id}`} class="text-sm font-semibold">
          Un mot pour les membres (facultatif)
        </label>
        <input id={`idea-note-${idea.id}`} class="field mt-1" maxLength={IDEA_NOTE_MAX} value={note} disabled={status === "open"} onInput={(e) => setNote(e.currentTarget.value)} />
      </div>
      <button type="submit" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" disabled={busy || unchanged}>
        Enregistrer
      </button>
    </form>
  );
}

function IdeaCard({
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
  onDecide: (idea: QgIdea, status: IdeaStatus, note: string) => void;
}) {
  const open = idea.status === "open";
  return (
    <li class="card p-5" data-testid="qg-idea">
      <p class="tnum text-sm text-muted">
        {idea.mine ? "Votre idée" : idea.author} · {fmtDate(idea.created_at)}
      </p>
      <p class="mt-2 whitespace-pre-line [overflow-wrap:anywhere]">{idea.body}</p>
      {!open && (
        <p class="mt-3 text-sm" data-testid="qg-idea-status">
          <strong>{IDEA_STATUS_LABELS[idea.status]}</strong>
          {idea.decided_at ? ` le ${fmtDate(idea.decided_at)}` : ""}
          {idea.staff_note ? ` : ${idea.staff_note}` : "."}
        </p>
      )}
      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span class="tnum text-sm text-muted" data-testid="qg-idea-supports">
          {supportLabel(idea.supports)}
        </span>
        {open && !idea.mine && (
          <button type="button" class="chip !min-h-9" aria-pressed={idea.supported} aria-disabled={busy || undefined} aria-label={`Je soutiens l'idée de ${idea.author}`} onClick={() => !busy && onSupport(idea)}>
            Je soutiens
          </button>
        )}
        {open && idea.supported && <span class="text-sm text-muted">Vous soutenez cette idée.</span>}
        {(idea.mine || staff) && <DeleteButton busy={busy} label={idea.mine ? "votre idée" : `l'idée de ${idea.author}`} onConfirm={() => onDelete(idea)} />}
      </div>
      <Problem message={problem} />
      {staff && <IdeaDecision idea={idea} busy={busy} onDecide={(status, note) => onDecide(idea, status, note)} />}
    </li>
  );
}

function IdeaForm({ name, openMine, busy, refusal, onSend }: { name: string; openMine: number; busy: boolean; refusal: string | null; onSend: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      class="card mt-4 grid gap-3 p-5"
      data-testid="qg-idea-form"
      onSubmit={(e) => {
        e.preventDefault();
        const found = ideaProblem(body, openMine);
        setProblem(found);
        if (found) return;
        void onSend(body).then((sent) => {
          if (sent) setBody("");
        });
      }}
    >
      <div>
        <label for="idea-body" class="text-sm font-semibold">
          Votre idée pour le clan
        </label>
        <textarea id="idea-body" class="field mt-1" rows={3} maxLength={IDEA_MAX} aria-describedby="idea-help" value={body} onInput={(e) => setBody(e.currentTarget.value)} />
        <p id="idea-help" class="tnum mt-1 text-sm text-muted">
          {fmtInt(body.trim().length)} / {fmtInt(IDEA_MAX)} caractères. Elle paraît sous votre nom, {name}, pour les seuls membres validés. Vous pouvez la retirer quand vous voulez.
        </p>
      </div>
      <div>
        <button type="submit" class="btn btn-primary" disabled={busy || body.trim() === ""}>
          Proposer cette idée
        </button>
      </div>
      <Problem message={problem ?? refusal} />
    </form>
  );
}

/** Le QG, pour un membre validé. `staff` : l'encadrement, sauf en vue joueur. Le serveur revérifie chaque action. */
function Inside({ me, staff }: { me: Me; staff: boolean }) {
  const [state, setState] = useState<Loadable<QgData>>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  // Le refus du serveur s'affiche à l'endroit de l'action : la page est longue, un message en haut ne se verrait pas.
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  // L'ordre des idées à l'étude tel que le membre l'a vu : un soutien ne déplace pas la liste sous son doigt.
  const shown = useRef<number[]>([]);
  // Ce que les lecteurs d'écran entendent après une action : la zone existe déjà, seul son texte change.
  const [said, setSaid] = useState("");
  const base = basePath();
  const name = me.name ?? "Membre";

  const load = useCallback(async () => {
    try {
      const data = parseQg(await call<unknown>("get_qg"));
      setState(data ? { status: "ready", data } : { status: "error", message: "La réponse du serveur est illisible. Rechargez la page." });
    } catch (e) {
      setState({ status: "error", message: messageOf(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Une action, puis une relecture : ce qui s'affiche vient toujours du serveur, jamais d'un calcul fait ici. */
  const act = async (at: string, action: () => Promise<unknown>, done: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setSaid("");
    try {
      await action();
      await load();
      setSaid(done);
      return true;
    } catch (e) {
      setError({ at, message: messageOf(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (state.status === "loading") return <Loading label="Ouverture du QG…" />;
  if (state.status === "error") {
    return (
      <div data-testid="qg-closed">
        <Problem message={state.message} onRetry={() => void load()} />
        {/* Sur téléphone, l'en-tête d'un membre validé n'a que « QG » : son compte doit rester à portée, même en panne. */}
        <p class="mt-3">
          <a href={`${base}/compte`}>Mon compte</a>
        </p>
      </div>
    );
  }

  const data = state.data;
  const openPolls = data.polls.filter((poll) => poll.is_open);
  const pastPolls = data.polls.filter((poll) => !poll.is_open);
  const ideasOpen = keepOrder(shown.current, openIdeas(data.ideas));
  shown.current = ideasOpen.map((idea) => idea.id);
  const problemAt = (at: string) => (error?.at === at ? error.message : null);
  const ideasDecided = decidedIdeas(data.ideas);
  const openMine = ideasOpen.filter((idea) => idea.mine).length;
  const vote = (poll: number, choice: number) => void act("polls", () => call("vote_poll", { p_poll: poll, p_choice: choice }), "Vote enregistré.");

  const ideaList = (ideas: QgIdea[]) =>
    ideas.map((idea) => (
      <IdeaCard
        key={idea.id}
        idea={idea}
        staff={staff}
        busy={busy}
        problem={problemAt(`idea-${idea.id}`)}
        onSupport={(i) => void act(`idea-${i.id}`, () => call("support_idea", { p_idea: i.id, p_on: !i.supported }), i.supported ? "Soutien retiré." : "Soutien noté.")}
        onDelete={(i) => void act(`idea-${i.id}`, () => call("delete_idea", { p_idea: i.id }), "Idée retirée.")}
        onDecide={(i, status, note) => void act(`idea-${i.id}`, () => call("decide_idea", { p_idea: i.id, p_status: status, p_note: note.trim() || null }), `Décision enregistrée : ${IDEA_STATUS_LABELS[status].toLowerCase()}.`)}
      />
    ));

  return (
    <div class="grid gap-10" data-testid="qg">
      <section class="card p-5" aria-label="Vous, au QG" data-testid="qg-me">
        <div class="flex flex-wrap items-center gap-4">
          <Avatar name={name} avatar={data.me.avatar} large />
          <div class="min-w-0">
            <p class="font-display text-2xl font-extrabold [overflow-wrap:anywhere]" data-testid="qg-name">
              {name}
            </p>
            <p class="text-sm text-muted">
              {ROLE_LABELS[me.role ?? "member"]} · <a href={`${base}/compte`}>Mon compte</a>
              {staff && (
                <>
                  {" "}
                  · <a href={`${base}/direction`}>Direction</a>
                </>
              )}
            </p>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="chip"
            aria-pressed={data.me.visible}
            aria-disabled={busy || undefined}
            data-testid="qg-visible"
            onClick={() => void act("me", () => call("set_member_visibility", { p_on: !data.me.visible }), data.me.visible ? "Vous n'êtes plus montré aux autres membres." : "Vous êtes montré aux autres membres.")}
          >
            Me montrer aux autres membres
          </button>
        </div>
        <p class="mt-2 text-sm text-muted">
          {data.me.visible
            ? "Les membres validés voient votre nom, votre rôle et votre photo Discord sur le mur, et quand vous venez à un événement. L'adresse de cette photo contient votre identifiant Discord : ils peuvent donc le lire."
            : "Pour l'instant, vous n'apparaissez ni sur le mur ni parmi ceux qui viennent. Si vous l'activez, seuls les membres validés voient votre nom, votre rôle et votre photo Discord. L'adresse de cette photo contient votre identifiant Discord : ils pourront donc le lire."}
        </p>
        <Problem message={problemAt("me")} />
      </section>

      <nav class="flex flex-wrap gap-2" aria-label="Dans le QG" data-testid="qg-jumps">
        {[
          ["#decisions", "Décisions"],
          ["#evenements", "Événements"],
          ["#idees", "Boîte à idées"],
          ["#mur", "Le mur"],
        ].map(([href, label]) => (
          <a key={href} class="chip inline-flex items-center" href={href}>
            {label}
          </a>
        ))}
      </nav>

      <p class="sr-only" role="status">
        {said}
      </p>

      {data.welcome && (
        <section class="card p-5" aria-labelledby="welcome-title" data-testid="qg-welcome">
          <h2 id="welcome-title" class="text-xl">
            Le mot de l'encadrement
          </h2>
          <p class="mt-3 whitespace-pre-line">{data.welcome.body}</p>
          {data.welcome.updated_at && <p class="tnum mt-3 text-xs text-muted">Mis à jour le {fmtDate(data.welcome.updated_at)}</p>}
        </section>
      )}

      <Section id="decisions" title="Décisions" testId="qg-decisions">
        <p class="mt-2 text-sm text-muted">Une voix par membre validé, que vous pouvez changer tant que le sondage est ouvert. Personne ne voit qui a voté quoi, pas même l'encadrement.</p>
        <h3 class="mt-5 text-lg">Sondages ouverts</h3>
        {openPolls.length > 0 ? <QgPolls polls={openPolls} busy={busy} onVote={vote} testId="qg-polls-open" /> : <p class="mt-2 text-muted">Aucun sondage ouvert pour l'instant.</p>}
        <Problem message={problemAt("polls")} />
        {pastPolls.length > 0 && (
          <>
            <h3 class="mt-8 text-lg">Décisions passées</h3>
            <QgPolls polls={pastPolls.slice(0, PAST_SHOWN)} busy={busy} onVote={vote} testId="qg-polls-past" />
            {pastPolls.length > PAST_SHOWN && (
              <details class="mt-3">
                <summary class="cursor-pointer font-semibold">Voir les {fmtInt(pastPolls.length - PAST_SHOWN)} autres</summary>
                <QgPolls polls={pastPolls.slice(PAST_SHOWN)} busy={busy} onVote={vote} testId="qg-polls-older" />
              </details>
            )}
          </>
        )}
      </Section>

      <Section id="evenements" title="Événements à venir" testId="qg-events">
        <Events
          events={data.events}
          busy={busy}
          problemAt={problemAt}
          onAnswer={(event, going) => void act(`event-${event}`, () => call("set_attendance", { p_event: event, p_going: going }), going ? "Votre présence est notée." : "Votre présence est retirée.")}
        />
      </Section>

      <Section id="idees" title="Boîte à idées" testId="qg-ideas">
        <p class="mt-2 text-sm text-muted">Proposez, soutenez les idées des autres : l'encadrement tranche. Le nombre de soutiens est visible, pas qui soutient.</p>
        <IdeaForm name={name} openMine={openMine} busy={busy} refusal={problemAt("idea-form")} onSend={(body) => act("idea-form", () => call("save_idea", { p_body: body }), "Idée proposée.")} />
        <h3 class="mt-6 text-lg">À l'étude</h3>
        {ideasOpen.length > 0 ? (
          <ul class="mt-3 grid gap-3" data-testid="qg-ideas-open">
            {ideaList(ideasOpen)}
          </ul>
        ) : (
          <p class="mt-2 text-muted">Aucune idée à l'étude pour l'instant.</p>
        )}
        {ideasDecided.length > 0 && (
          <>
            <h3 class="mt-8 text-lg">Idées tranchées</h3>
            <ul class="mt-3 grid gap-3" data-testid="qg-ideas-decided">
              {ideaList(ideasDecided.slice(0, PAST_SHOWN))}
            </ul>
            {ideasDecided.length > PAST_SHOWN && (
              <details class="mt-3">
                <summary class="cursor-pointer font-semibold">Voir les {fmtInt(ideasDecided.length - PAST_SHOWN)} autres</summary>
                <ul class="mt-3 grid gap-3">{ideaList(ideasDecided.slice(PAST_SHOWN))}</ul>
              </details>
            )}
          </>
        )}
      </Section>

      <Section id="mur" title="Le mur des membres" testId="qg-wall">
        <p class="tnum mt-2 text-sm text-muted" data-testid="qg-wall-count">
          Membres qui ont choisi de se montrer : {fmtInt(data.wall.length)} sur {fmtInt(data.members)} reconnus sur le site.
        </p>
        {data.wall.length > 0 && (
          <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="qg-wall-list">
            {data.wall.map((face, i) => (
              <li key={i} class="card flex items-center gap-3 p-3">
                <Avatar name={face.name} avatar={face.avatar} large />
                <div class="min-w-0">
                  <p class="font-semibold [overflow-wrap:anywhere]">{face.name}</p>
                  {roleNote(face) && <p class="text-sm text-muted">{roleNote(face)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/**
 * Le QG des membres. Rien de ce qui s'affiche ici ne protège quoi que ce soit : le serveur ne donne le contenu
 * qu'à un compte validé, et revérifie chaque action.
 */
export default function QgApp() {
  const { me, failed, refresh } = useMe();

  if (me === null) return <Loading label="Lecture de votre compte…" />;
  if (failed) return <Problem message="Votre compte n'a pas pu être lu pour l'instant. Réessayez dans un moment." onRetry={() => void refresh()} />;
  if (!me.signed_in || me.status !== "validated") return <Door me={me} />;
  return <Inside me={me} staff={(me.rank ?? 0) >= 2} />;
}
