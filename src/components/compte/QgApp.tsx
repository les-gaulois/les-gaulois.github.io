import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { basePath, call } from "../../lib/compte/api";
import { othersPlanned, parseQgTools, type QgTools } from "../../lib/compte/outils";
import { seriesNote } from "../../lib/compte/news";
import { pendingWords } from "../../lib/compte/pending";
import {
  IDEA_MAX,
  IDEA_NOTE_MAX,
  IDEA_STATUS_LABELS,
  counted,
  decidedIdeas,
  ideaProblem,
  keepOrder,
  openIdeas,
  othersLabel,
  parseQg,
  pollsAwaitingVote,
  supportLabel,
  type IdeaStatus,
  type QgData,
  type QgEvent,
  type QgIdea,
} from "../../lib/compte/qg";
import { waitingOthers } from "../../lib/compte/salons";
import { ROLE_LABELS, type Me } from "../../lib/compte/types";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";
import { tabsFor } from "../../lib/onglets";
import type { StoredMembers } from "../../lib/schemas";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { Log, Members, Requests } from "./AdminPanels";
import { subscribe } from "./appels";
import { Avatar, DeleteButton, DiscordButton, Loading, Problem, messageOf, useMe, useNow, usePendingCount, type Loadable } from "./common";
import { Onglets, Partie, PartieTete, useTabs, type TabItem } from "./Onglets";
import QgCeSoir from "./QgCeSoir";
import QgMoi from "./QgMoi";
import QgMur from "./QgMur";
import QgPolls from "./QgPolls";
import QgSalons from "./QgSalons";
import QgSemaine from "./QgSemaine";

/** Les décisions passées montrées d'abord ; les suivantes restent repliées, à portée. */
const PAST_SHOWN = 2;

/**
 * Les onglets du QG. Ceux de l'encadrement viennent après : l'administration (demandes, comptes, journal) a rejoint le QG
 * le 10 novembre 2026. L'affichage suit le rang, mais chaque fonction du serveur revérifie : masquer un onglet ne protège rien.
 * « Moi », « Ce soir » et « La semaine » viennent des outils du QG (11 novembre 2026, `get_qg_tools`) : sans eux, le QG
 * s'ouvre sur « Salons », comme avant.
 */
const QG_TABS = [
  { id: "moi", label: "Moi" },
  { id: "salons", label: "Salons" },
  { id: "ce-soir", label: "Ce soir" },
  { id: "semaine", label: "La semaine" },
  { id: "decisions", label: "Décisions" },
  { id: "evenements", label: "Événements" },
  { id: "idees", label: "Idées" },
  { id: "mur", label: "Le mur" },
  { id: "demandes", label: "Demandes", rank: 2, staff: true },
  // « Comptes » et non « Membres » : l'onglet de rubrique « Membres », juste au-dessus, mène à la page publique des membres.
  { id: "comptes", label: "Comptes", rank: 2, staff: true },
  { id: "journal", label: "Journal", rank: 3, staff: true },
] as const;

/** La porte du QG, pour un visiteur ou un compte pas encore validé : ce qu'il y a derrière, et comment entrer. */
function Door({ me }: { me: Me }) {
  const base = basePath();
  return (
    <section class="card max-w-3xl p-6" data-testid="qg-door">
      <h2 class="text-2xl">Réservé aux membres de GAL</h2>
      <p class="mt-3 text-muted">Salons, sondages, idées, événements et mur des membres.</p>
      <ol class="mt-4 list-decimal space-y-2 pl-6">
        <li>Connectez-vous avec Discord.</li>
        <li>Indiquez votre pseudo ou votre identifiant OpenFront dans « Mon compte ».</li>
        <li>Le site vérifie qu'il figure dans la liste des membres de GAL.</li>
        <li>Un officier confirme que c'est bien vous. Ensuite, le site vous reconnaît à chaque visite.</li>
      </ol>
      {!me.signed_in && (
        <>
          <div class="mt-6">
            <DiscordButton returnPath="/compte" />
          </div>
          <p class="mt-3 text-sm text-muted">
            Le site ne reçoit jamais votre mot de passe. <a href={`${base}/confidentialite`}>Ce qu'il conserve</a>
          </p>
        </>
      )}
      {me.signed_in && me.status === "pending" && (
        <p class="mt-6" data-testid="qg-pending">
          <strong>Votre compte attend sa validation.</strong> Faites ou suivez votre demande dans <a href={`${base}/compte`}>Mon compte</a>.
        </p>
      )}
      {me.signed_in && me.status === "suspended" && (
        <p class="form-problem mt-6" data-testid="qg-suspended">
          Ce compte est suspendu{me.status_reason ? ` : ${me.status_reason}` : "."} Le QG lui est fermé.
        </p>
      )}
    </section>
  );
}

function Events({ events, busy, problemAt, onAnswer }: { events: QgEvent[]; busy: boolean; problemAt: (at: string) => string | null; onAnswer: (event: number, going: boolean) => void }) {
  return (
    <ul class="mt-5 grid gap-4 md:grid-cols-2" data-testid="qg-events-list">
      {events.map((event) => {
        const series = seriesNote(event.series);
        const others = othersLabel(event.going, event.faces.length);
        return (
          <li key={event.id} class="card p-5" data-testid="qg-event">
            <p class="tnum text-sm text-muted">{fmtDateTime(event.starts_at)}</p>
            <h3 class="mt-1 text-xl [overflow-wrap:anywhere]">{event.title}</h3>
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
            <div class="mt-4 flex flex-wrap items-center gap-3">
              {/* Pas de `disabled` pendant l'envoi : un bouton désactivé perd le focus du clavier. */}
              <button type="button" class="chip" aria-pressed={event.mine} aria-disabled={busy || undefined} onClick={() => !busy && onAnswer(event.id, !event.mine)} data-testid="qg-going">
                Je viens
              </button>
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
      class="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-end"
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
        <select id={`idea-status-${idea.id}`} class="field mt-1" value={status} onChange={(e) => setStatus(e.currentTarget.value as IdeaStatus)}>
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
      <div class="sm:col-span-2">
        <button type="submit" class="btn btn-ghost" disabled={busy || unchanged}>
          Enregistrer la décision
        </button>
      </div>
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
        <p class="mt-3" data-testid="qg-idea-status">
          <strong>{IDEA_STATUS_LABELS[idea.status]}</strong>
          {idea.decided_at ? ` le ${fmtDate(idea.decided_at)}` : ""}
          {idea.staff_note ? ` : ${idea.staff_note}` : "."}
        </p>
      )}
      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <span class="tnum text-muted" data-testid="qg-idea-supports">
          {supportLabel(idea.supports)}
        </span>
        {open && !idea.mine && (
          <button type="button" class="chip" aria-pressed={idea.supported} aria-disabled={busy || undefined} aria-label={`Je soutiens l'idée de ${idea.author}`} onClick={() => !busy && onSupport(idea)}>
            Je soutiens
          </button>
        )}
        {(idea.mine || staff) && <DeleteButton busy={busy} label={idea.mine ? "votre idée" : `l'idée de ${idea.author}`} onConfirm={() => onDelete(idea)} />}
      </div>
      <Problem message={problem} />
      {staff && <IdeaDecision idea={idea} busy={busy} onDecide={(status, note) => onDecide(idea, status, note)} />}
    </li>
  );
}

function IdeaForm({ openMine, busy, refusal, onSend }: { openMine: number; busy: boolean; refusal: string | null; onSend: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      class="card grid gap-4 p-5"
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
        <label for="idea-body" class="font-semibold">
          Votre idée pour le clan
        </label>
        <textarea id="idea-body" class="field mt-2" rows={4} maxLength={IDEA_MAX} aria-describedby="idea-help" value={body} onInput={(e) => setBody(e.currentTarget.value)} />
        <p id="idea-help" class="tnum mt-2 text-sm text-muted">
          {fmtInt(body.trim().length)} / {fmtInt(IDEA_MAX)} caractères. Elle paraît sous votre nom.
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

/**
 * Le QG, pour un membre validé : une partie à la fois, sous ses onglets. `rank` : celui du compte affiché (en vue joueur,
 * l'encadrement s'y voit membre sans grade, sans ses onglets ni ses commandes de décision). Le serveur revérifie chaque action.
 * Les salons et les onglets de l'encadrement ne dépendent pas de la lecture du QG (`get_qg`) : si elle échoue, l'encadrement
 * garde ses demandes, ses comptes et son journal. Les onglets attendent la réponse des outils (`get_qg_tools`), six secondes
 * au plus : au-delà, le QG s'ouvre sans eux, et ils paraissent à leur réponse.
 */
function Inside({ me, rank }: { me: Me; rank: number }) {
  const staff = rank >= 2;
  const [state, setState] = useState<Loadable<QgData>>({ status: "loading" });
  // Les outils du QG : un serveur d'avant leur migration répond par un refus, et leurs onglets ne paraissent pas.
  const [tools, setTools] = useState<Loadable<QgTools>>({ status: "loading" });
  // Les données publiques que lisent « Moi » et « La semaine » : `undefined` en lecture, `null` si illisibles.
  const [members, setMembers] = useState<StoredMembers | null | undefined>(undefined);
  const [weekFile, setWeekFile] = useState<ClanWeekFile | null | undefined>(undefined);
  const [toolsLate, setToolsLate] = useState(false);
  // Chaque minute : une heure de « Ce soir » qui finit quitte le nombre de son onglet.
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  // Le refus du serveur s'affiche à l'endroit de l'action, dans sa partie : un message en haut de page ne se verrait pas.
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  // L'ordre des idées à l'étude tel que le membre l'a vu : un soutien ne déplace pas la liste sous son doigt.
  const shown = useRef<number[]>([]);
  // Ce que les lecteurs d'écran entendent après une action : la zone existe déjà, seul son texte change.
  const [said, setSaid] = useState("");
  // Les autres Gaulois qui attendent dans un salon, d'après la dernière lecture des appels.
  const [waiting, setWaiting] = useState(0);
  const pending = usePendingCount(staff);
  const data = state.status === "ready" ? state.data : null;
  const kit = tools.status === "ready" ? tools.data : null;
  // Une partie vide n'a pas d'onglet : décisions et événements n'en ont un qu'une fois lus, s'il y a quelque chose. Le mur garde
  // le sien, qui porte le choix de se montrer. Si le QG ne se lit pas, ses parties s'effacent ; les salons et l'encadrement restent.
  // Un lien vers un onglet absent au premier rendu l'ouvre dès qu'il paraît.
  const present = (id: string) => {
    if (id === "decisions") return (data?.polls.length ?? 0) > 0;
    if (id === "evenements") return (data?.events.length ?? 0) > 0;
    if (id === "idees" || id === "mur") return state.status !== "error";
    if (id === "moi" || id === "ce-soir" || id === "semaine") return kit !== null;
    return true;
  };
  const tabs = tabsFor(QG_TABS, rank).filter((tab) => present(tab.id));
  const { active, slide, shown: opened, select, call: called, hold } = useTabs(tabs.map((tab) => tab.id));
  const base = basePath();
  const name = me.name ?? "Membre";

  /** Relit le QG. Rend le refus, ou `null`. Déjà lu, il garde ce qui est à l'écran : le refus se dit là où l'on agit. */
  const load = useCallback(async (): Promise<string | null> => {
    let message: string;
    try {
      const read = parseQg(await call<unknown>("get_qg"));
      if (read) {
        setState({ status: "ready", data: read });
        return null;
      }
      message = "La réponse du serveur est illisible. Rechargez la page.";
    } catch (e) {
      message = messageOf(e);
    }
    setState((s) => (s.status === "ready" ? s : { status: "error", message }));
    return message;
  }, []);

  /** Relit les outils du QG. Même règle que `load` : déjà lus, ils restent à l'écran si la relecture échoue. */
  const loadTools = useCallback(async (): Promise<string | null> => {
    let message: string;
    try {
      const read = parseQgTools(await call<unknown>("get_qg_tools"));
      if (read) {
        setTools({ status: "ready", data: read });
        return null;
      }
      message = "La réponse du serveur est illisible. Rechargez la page.";
    } catch (e) {
      message = messageOf(e);
    }
    setTools((s) => (s.status === "ready" ? s : { status: "error", message }));
    return message;
  }, []);

  useEffect(() => {
    void load();
    void loadTools();
    const late = window.setTimeout(() => setToolsLate(true), 6_000);
    return () => window.clearTimeout(late);
  }, [load, loadTools]);

  // Le QG s'est ouvert sans les outils : l'onglet affiché reste, même quand « Moi » paraît en tête à leur réponse.
  const toolsPending = tools.status === "loading";
  useEffect(() => {
    if (toolsLate && toolsPending) hold();
  }, [toolsLate, toolsPending, hold]);

  // Les chiffres publics du site, lus une fois que les outils répondent : sans eux, rien ne les affiche.
  const toolsReady = kit !== null;
  useEffect(() => {
    if (!toolsReady) return;
    const base = basePath();
    const read = <T,>(path: string) =>
      fetch(`${base}${path}`)
        .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
        .catch(() => null);
    void read<StoredMembers>("/data/members.json").then((list) => setMembers(list && Array.isArray(list.members) ? list : null));
    void read<ClanWeekFile>("/semaine-du-clan.json").then((file) => setWeekFile(file && Array.isArray(file.weeks) ? file : null));
  }, [toolsReady]);

  // Le relevé des appels est celui de tout le site (`appels.ts`) : l'onglet compte ceux des autres Gaulois.
  useEffect(() => subscribe((next) => setWaiting(waitingOthers(next.data?.calls ?? []))), []);

  /**
   * Une action, puis une relecture : ce qui s'affiche vient toujours du serveur, jamais d'un calcul fait ici. `reread` :
   * ce que l'action change, le QG (`get_qg`) ou ses outils (`get_qg_tools`) ; se montrer change les deux.
   */
  const act = async (at: string, action: () => Promise<unknown>, done: string, reread: "qg" | "outils" | "tout" = "qg"): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setSaid("");
    try {
      try {
        await action();
      } catch (e) {
        setError({ at, message: messageOf(e) });
        return false;
      }
      // Le serveur a accepté. Si la relecture échoue, l'écran garde l'état d'avant : il le dit.
      const [qgFailed, toolsFailed] = await Promise.all([reread === "outils" ? null : load(), reread === "qg" ? null : loadTools()]);
      if (qgFailed !== null || toolsFailed !== null) setError({ at, message: "C'est enregistré, mais l'affichage n'a pas pu être relu. Rechargez la page." });
      setSaid(done);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const openPolls = data?.polls.filter((poll) => poll.is_open) ?? [];
  const pastPolls = data?.polls.filter((poll) => !poll.is_open) ?? [];
  const ideasOpen = data ? keepOrder(shown.current, openIdeas(data.ideas)) : [];
  if (data) shown.current = ideasOpen.map((idea) => idea.id);
  const problemAt = (at: string) => (error?.at === at ? error.message : null);
  const ideasDecided = data ? decidedIdeas(data.ideas) : [];
  const openMine = ideasOpen.filter((idea) => idea.mine).length;
  const notVoted = pollsAwaitingVote(data?.polls ?? []);
  const vote = (poll: number, choice: number) => void act("polls", () => call("vote_poll", { p_poll: poll, p_choice: choice }), "Vote enregistré.");

  // Le nombre d'un onglet dit ce qui attend le membre derrière lui, jamais un total à lire : il disparaît une fois l'affaire faite.
  const counts: Partial<Record<string, TabItem["count"]>> = {
    salons: { value: waiting, words: counted(waiting, "Gaulois attend dans un salon", "Gaulois attendent dans un salon"), tone: "vif" },
    "ce-soir": kit ? { value: othersPlanned(kit.plans, now), words: counted(othersPlanned(kit.plans, now), "autre Gaulois a dit son heure", "autres Gaulois ont dit leur heure") } : null,
    semaine: kit?.predictions && kit.predictions.mine === null ? { value: 1, words: "1 pronostic à faire" } : null,
    decisions: { value: notVoted, words: counted(notVoted, "sondage attend votre voix", "sondages attendent votre voix") },
    idees: staff ? { value: ideasOpen.length, words: counted(ideasOpen.length, "idée à trancher", "idées à trancher") } : null,
    demandes: pending !== null && pending > 0 ? { value: pending, words: `${fmtInt(pending)} ${pendingWords(pending) ?? ""}`, tone: "alerte" } : null,
  };
  const items: TabItem[] = tabs.map((tab) => ({ id: tab.id, label: tab.label, staff: "staff" in tab ? tab.staff : false, count: counts[tab.id] ?? null }));
  const part = { prefix: "qg", active, slide };
  const opening = <Loading label="Ouverture du QG…" />;

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
    <div class="grid grid-cols-1 gap-6" data-testid="qg">
      <div class={`grid grid-cols-1 items-start gap-4 ${data?.welcome ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}`}>
        <section class="card flex flex-wrap items-center gap-4 p-5" aria-label="Vous, au QG" data-testid="qg-me">
          <Avatar name={name} avatar={data?.me.avatar ?? null} large />
          {/* Le nom garde sa largeur : faute de place, les liens passent dessous. */}
          <div class="min-w-0 flex-[1_1_11rem]">
            <p class="font-display text-2xl font-extrabold [overflow-wrap:anywhere]" data-testid="qg-name">
              {name}
            </p>
            <p class="text-muted">{ROLE_LABELS[me.role ?? "member"]}</p>
          </div>
          {/* Sur téléphone, l'en-tête n'a que « QG » : le compte et la Direction s'ouvrent d'ici, même en panne. */}
          <div class="flex flex-wrap gap-2">
            <a class="btn btn-ghost" href={`${base}/compte`}>
              Mon compte
            </a>
            {staff && (
              <a class="btn btn-ghost" href={`${base}/direction`} data-testid="qg-direction">
                Direction
              </a>
            )}
          </div>
        </section>

        {data?.welcome && (
          <section class="card p-5" aria-labelledby="welcome-title" data-testid="qg-welcome">
            <h2 id="welcome-title" class="text-xl">
              Le mot de l'encadrement
            </h2>
            <p class="mt-2 whitespace-pre-line">{data.welcome.body}</p>
            {data.welcome.updated_at && <p class="tnum mt-2 text-sm text-muted">Mis à jour le {fmtDate(data.welcome.updated_at)}</p>}
          </section>
        )}
      </div>

      {state.status === "error" && (
        <div data-testid="qg-closed">
          <Problem message={state.message} onRetry={() => void load()} />
        </div>
      )}

      <p class="sr-only" role="status">
        {said}
      </p>

      {/* Les onglets attendent la réponse des outils, refus compris : sinon la page s'ouvrirait sur « Salons », puis sauterait sur « Moi ». */}
      {tools.status === "loading" && !toolsLate ? (
        opening
      ) : (
        <div class="grid grid-cols-1 gap-5">
          <Onglets label="Les parties du QG" prefix="qg" tabs={items} active={active} onSelect={(id) => select(id)} call={called} />

          {kit && (
            <Partie {...part} id="moi">
              <QgMoi me={kit.me} members={members} file={weekFile} />
            </Partie>
          )}

          <Partie {...part} id="salons">
            <QgSalons voice={kit?.voice ?? null} />
          </Partie>

          {kit && (
            <Partie {...part} id="ce-soir">
              <QgCeSoir
                plans={kit.plans}
                busy={busy}
                problem={problemAt("plan")}
                onChoose={(at) => void act("plan", () => call("set_play_plan", { p_at: at }), at === null ? "Votre heure est retirée." : "Votre heure est notée.", "outils")}
              />
            </Partie>
          )}

          {kit && (
            <Partie {...part} id="semaine">
              <QgSemaine
                goal={kit.goal}
                predictions={kit.predictions}
                file={weekFile}
                busy={busy}
                problem={problemAt("pronostic")}
                onPredict={(wins) => act("pronostic", () => call("save_prediction", { p_wins: wins }), "Pronostic enregistré.", "outils")}
                onExpired={() => void loadTools()}
              />
            </Partie>
          )}

          {data && data.polls.length > 0 && (
            <Partie {...part} id="decisions">
              <section aria-labelledby="decisions-titre" data-testid="qg-decisions">
                <PartieTete id="decisions-titre" title="Décisions">
                  <p>Vote secret, modifiable tant que le sondage est ouvert.</p>
                </PartieTete>
                {openPolls.length > 0 && (
                  <>
                    <h3 class="mt-6 text-lg">Sondages ouverts</h3>
                    <QgPolls polls={openPolls} busy={busy} onVote={vote} testId="qg-polls-open" />
                  </>
                )}
                <Problem message={problemAt("polls")} />
                {pastPolls.length > 0 && (
                  <>
                    <h3 class="mt-8 text-lg">Décisions passées</h3>
                    <QgPolls polls={pastPolls.slice(0, PAST_SHOWN)} busy={busy} onVote={vote} testId="qg-polls-past" />
                    {pastPolls.length > PAST_SHOWN && (
                      <details class="fold mt-4">
                        <summary class="font-semibold">Voir les {fmtInt(pastPolls.length - PAST_SHOWN)} autres</summary>
                        <QgPolls polls={pastPolls.slice(PAST_SHOWN)} busy={busy} onVote={vote} testId="qg-polls-older" />
                      </details>
                    )}
                  </>
                )}
              </section>
            </Partie>
          )}

          {data && data.events.length > 0 && (
            <Partie {...part} id="evenements">
              <section aria-labelledby="evenements-titre" data-testid="qg-events">
                <PartieTete id="evenements-titre" title="Événements à venir" />
                <Events
                  events={data.events}
                  busy={busy}
                  problemAt={problemAt}
                  onAnswer={(event, going) => void act(`event-${event}`, () => call("set_attendance", { p_event: event, p_going: going }), going ? "Votre présence est notée." : "Votre présence est retirée.")}
                />
              </section>
            </Partie>
          )}

          {present("idees") && (
            <Partie {...part} id="idees">
              {data ? (
                <section aria-labelledby="idees-titre" data-testid="qg-ideas">
                  <PartieTete id="idees-titre" title="Boîte à idées">
                    <p>L'encadrement tranche. Les soutiens restent anonymes.</p>
                  </PartieTete>
                  <div class="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <IdeaForm openMine={openMine} busy={busy} refusal={problemAt("idea-form")} onSend={(body) => act("idea-form", () => call("save_idea", { p_body: body }), "Idée proposée.")} />
                    <div>
                      {ideasOpen.length > 0 && (
                        <>
                          <h3 class="text-lg">À l'étude</h3>
                          <ul class="mt-3 grid gap-4" data-testid="qg-ideas-open">
                            {ideaList(ideasOpen)}
                          </ul>
                        </>
                      )}
                      {ideasDecided.length > 0 && (
                        <>
                          <h3 class={`${ideasOpen.length > 0 ? "mt-8 " : ""}text-lg`}>Idées tranchées</h3>
                          <ul class="mt-3 grid gap-4" data-testid="qg-ideas-decided">
                            {ideaList(ideasDecided.slice(0, PAST_SHOWN))}
                          </ul>
                          {ideasDecided.length > PAST_SHOWN && (
                            <details class="fold mt-4">
                              <summary class="font-semibold">Voir les {fmtInt(ideasDecided.length - PAST_SHOWN)} autres</summary>
                              <ul class="mt-1 grid gap-4">{ideaList(ideasDecided.slice(PAST_SHOWN))}</ul>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </section>
              ) : (
                opening
              )}
            </Partie>
          )}

          {present("mur") && (
            <Partie {...part} id="mur">
              {data ? (
                <QgMur
                  data={data}
                  tools={kit}
                  busy={busy}
                  problemAt={problemAt}
                  onVisible={(on) => void act("me", () => call("set_member_visibility", { p_on: on }), on ? "Vous êtes montré aux autres membres." : "Vous n'êtes plus montré aux autres membres.", "tout")}
                  onGg={(member) => void act("gg", () => call("give_gg", { p_member: member.number, p_on: !member.given }), member.given ? `GG retiré à ${member.name}.` : `GG envoyé à ${member.name}.`, "outils")}
                  onMentor={(on) => void act("mentor", () => call("set_mentor", { p_on: on }), on ? "Vous êtes parrain." : "Vous n'êtes plus parrain.", "outils")}
                />
              ) : (
                opening
              )}
            </Partie>
          )}

          {/* L'administration : lue au premier passage sur son onglet, puis gardée, avec ses champs remplis. */}
          {staff && (
            <Partie {...part} id="demandes" staff>
              {opened.has("demandes") && <Requests />}
            </Partie>
          )}
          {staff && (
            <Partie {...part} id="comptes" staff>
              {opened.has("comptes") && <Members me={me} />}
            </Partie>
          )}
          {rank >= 3 && (
            <Partie {...part} id="journal" staff>
              {opened.has("journal") && <Log />}
            </Partie>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Le QG des membres, et depuis le 10 novembre 2026 l'administration de l'encadrement. Rien de ce qui s'affiche ici ne
 * protège quoi que ce soit : le serveur ne donne le contenu qu'à un compte validé, et revérifie chaque action.
 */
export default function QgApp() {
  const { me, failed, refresh } = useMe();

  if (me === null) return <Loading label="Lecture de votre compte…" />;
  if (failed) return <Problem message="Votre compte n'a pas pu être lu pour l'instant. Réessayez dans un moment." onRetry={() => void refresh()} />;
  if (!me.signed_in || me.status !== "validated") return <Door me={me} />;
  return <Inside me={me} rank={me.rank ?? 0} />;
}
