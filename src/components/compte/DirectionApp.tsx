import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { MemberFilter } from "../../lib/compte/admin-members";
import { basePath, call } from "../../lib/compte/api";
import { toLocalInput } from "../../lib/compte/news";
import { pendingWords } from "../../lib/compte/pending";
import { ROLE_LABELS, type MemberRow, type Role } from "../../lib/compte/types";
import { setPlayerView } from "../../lib/compte/vue-joueur";
import type { SiteHealthInput } from "../../lib/etat-site";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";
import type { LogoMatriceData } from "../../lib/logo-matrice";
import { tabsFor } from "../../lib/onglets";
import LogoMatrice from "../LogoMatrice";
import { Log, Members, Requests, type MembersAsk } from "./AdminPanels";
import { DeleteButton, DiscordButton, Loading, Problem, Success, messageOf, useMe, usePendingCount, useRun } from "./common";
import DirectionActivite from "./DirectionActivite";
import DirectionDiscord from "./DirectionDiscord";
import DirectionObjectif from "./DirectionObjectif";
import DirectionPolls, { EMPTY_POLL, type PollDraft } from "./DirectionPolls";
import DirectionWelcome from "./DirectionWelcome";
import DirectionWeeklyPick, { EMPTY_WEEKLY_PICK, type WeeklyPickDraft } from "./DirectionWeeklyPick";
import { Onglets, Partie, PartieTete, reducedMotion, useTabs, type TabItem } from "./Onglets";
import SiteHealth from "./SiteHealth";
import Telemetrie from "./Telemetrie";

interface NewsRow {
  id: number;
  title: string;
  url: string | null;
  author: string | null;
  editable: boolean;
}
interface AnnouncementRow extends NewsRow {
  body: string;
  created_at: string;
}
interface EventRow extends NewsRow {
  description: string | null;
  starts_at: string;
}
interface Overview {
  pending_requests: number;
  members: number;
  officers: number;
  suspended: number;
  roster: { total: number; read_at: string } | null;
  announcements: AnnouncementRow[];
  events: EventRow[];
}

/**
 * Les onglets de la Direction. Le journal et Discord ne sont montrés qu'aux admins et au fondateur, le dernier qu'au fondateur.
 * Demandes, Comptes et Journal : l'administration, au QG du 10 au 12 novembre 2026, ici depuis (demande du pilote : elle est
 * destinée à l'encadrement). L'affichage suit le rang, mais chaque fonction du serveur revérifie : masquer un onglet ne protège rien.
 * `icon` : la petite icône de la partie dans le menu (`src/lib/icones-parties.ts`). Événements et Sondages ont celles des
 * Événements et des Décisions du QG : c'est la même chose, vue de l'autre côté.
 */
const DIRECTION_TABS = [
  { id: "ensemble", label: "Vue d'ensemble", icon: "tour" },
  // Les visites du site, comptées par le site lui-même (demande du pilote, 13 novembre 2026) : src/lib/activite-site.ts.
  { id: "activite", label: "Activité du site", icon: "oeil" },
  { id: "demandes", label: "Demandes", icon: "porte" },
  // « Comptes » : les comptes du site, validés, en attente ou suspendus, et non la page publique des membres.
  { id: "comptes", label: "Comptes", icon: "bouclier" },
  { id: "journal", label: "Journal", icon: "tablette", rank: 3 },
  { id: "annonces", label: "Annonces", icon: "cor" },
  { id: "evenements", label: "Événements", icon: "banniere" },
  { id: "sondages", label: "Sondages", icon: "balance" },
  { id: "accueil", label: "Mot d'accueil", icon: "hutte" },
  { id: "semaine", label: "Gaulois de la semaine", icon: "coq" },
  { id: "objectif", label: "Objectif", icon: "cible" },
  { id: "discord", label: "Discord", icon: "corbeau", rank: 3 },
  { id: "fondateur", label: "Fondateur", icon: "cle", rank: 4 },
] as const;

/**
 * Une case de la vue d'ensemble : elle ouvre la partie où l'on décide. C'est un vrai lien (`#demandes`) : le clic droit et
 * l'ouverture dans un nouvel onglet restent. Au clic simple, `onOpen` ouvre la partie et y mène le focus.
 * `filter` : la case ouvre l'onglet Comptes avec ce filtre déjà choisi (« Suspendus » montre les comptes suspendus).
 */
function Tile({ label, value, part, filter, onOpen, alert = false }: { label: string; value: number; part: string; filter?: MemberFilter; onOpen: (part: string, filter?: MemberFilter) => void; alert?: boolean }) {
  return (
    <a
      href={`#${part}`}
      class="card block p-5 hover:border-white"
      data-testid="direction-tile"
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen(part, filter);
      }}
    >
      {/* `console-*` : l'ambiance console de la page, voir global.css. */}
      <span class="console-libelle font-semibold text-muted">{label}</span>
      <span class={`console-valeur tnum mt-1 block font-display text-4xl font-extrabold ${alert ? "text-warn" : ""}`}>{fmtInt(value)}</span>
    </a>
  );
}

const EMPTY_ANNOUNCEMENT = { id: null as number | null, title: "", body: "", url: "" };
type AnnouncementDraft = typeof EMPTY_ANNOUNCEMENT;
// `repeat` et `weeks` : seulement pour un nouvel événement. Une série crée un événement par semaine, chacun modifiable seul.
const EMPTY_EVENT = { id: null as number | null, title: "", description: "", url: "", start: "", repeat: false, weeks: "4" };
type EventDraft = typeof EMPTY_EVENT;
const SERIES_WEEKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** « Modifier » remplit le formulaire, puis y mène : sur téléphone, il est au-dessus de la liste. */
const focusField = (id: string) => window.setTimeout(() => document.getElementById(id)?.focus(), 0);

function Announcements({ rows, reload, form, setForm }: { rows: AnnouncementRow[]; reload: () => Promise<void>; form: AnnouncementDraft; setForm: (draft: AnnouncementDraft) => void }) {
  const empty = EMPTY_ANNOUNCEMENT;
  const { busy, error, done, run } = useRun(reload);

  const save = async () => {
    const ok = await run(() => call("save_announcement", { p_id: form.id, p_title: form.title, p_body: form.body, p_url: form.url || null }), form.id ? "Annonce modifiée." : "Annonce publiée : elle est visible sur l'accueil.");
    if (ok) setForm(empty);
  };

  return (
    <section aria-labelledby="ann-title" data-testid="direction-announcements">
      <PartieTete id="ann-title" title="Annonces">
        <p>Visibles aussitôt sur l'accueil. Le nom de l'auteur n'est pas public.</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <form
          class="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 class="text-lg">{form.id ? "Modifier l'annonce" : "Nouvelle annonce"}</h3>
          <div>
            <label for="ann-t" class="text-sm font-semibold">
              Titre
            </label>
            <input id="ann-t" class="field mt-1" required maxLength={120} value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          </div>
          <div>
            <label for="ann-b" class="text-sm font-semibold">
              Texte
            </label>
            <textarea id="ann-b" class="field mt-1" required rows={5} maxLength={2000} value={form.body} onInput={(e) => setForm({ ...form, body: e.currentTarget.value })} />
          </div>
          <div>
            <label for="ann-u" class="text-sm font-semibold">
              Lien en https (facultatif)
            </label>
            <input id="ann-u" class="field mt-1" type="url" maxLength={500} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
          </div>
          <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn btn-primary" disabled={busy}>
              {form.id ? "Enregistrer" : "Publier l'annonce"}
            </button>
            {form.id && (
              <button type="button" class="btn btn-ghost" onClick={() => setForm(empty)}>
                Annuler
              </button>
            )}
          </div>
          <Problem message={error} />
          {done && <Success message={done} />}
        </form>
        {rows.length > 0 && (
          <div>
            <h3 class="text-lg">Publiées depuis le site</h3>
            <ul class="mt-3 grid gap-3">
              {rows.map((a) => (
                <li key={a.id} class="card p-5" data-testid="direction-announcement">
                  <p class="font-semibold [overflow-wrap:anywhere]">{a.title}</p>
                  <p class="tnum mt-1 text-sm text-muted">
                    {fmtDate(a.created_at)}
                    {a.author ? ` · ${a.author}` : ""}
                  </p>
                  {a.editable && (
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
                        disabled={busy}
                        aria-label={`Modifier « ${a.title} »`}
                        onClick={() => {
                          setForm({ id: a.id, title: a.title, body: a.body, url: a.url ?? "" });
                          focusField("ann-t");
                        }}
                      >
                        Modifier
                      </button>
                      <DeleteButton busy={busy} label={a.title} onConfirm={() => void run(() => call("delete_announcement", { p_id: a.id }), "Annonce supprimée.")} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Events({ rows, attendance, reload, form, setForm }: { rows: EventRow[]; attendance: Map<number, string[]> | null | undefined; reload: () => Promise<void>; form: EventDraft; setForm: (draft: EventDraft) => void }) {
  const empty = EMPTY_EVENT;
  const { busy, error, done, run } = useRun(reload);

  const save = async () => {
    const start = form.start ? new Date(form.start).toISOString() : null;
    const series = form.id === null && form.repeat;
    const ok = series
      ? await run(
          () => call("save_event_series", { p_title: form.title, p_description: form.description || null, p_url: form.url || null, p_starts_at: start, p_weeks: Number(form.weeks) }),
          `${form.weeks} événements publiés, un par semaine. L'accueil ne montre que le prochain.`,
        )
      : await run(
          () => call("save_event", { p_id: form.id, p_title: form.title, p_description: form.description || null, p_url: form.url || null, p_starts_at: start }),
          form.id ? "Événement modifié." : "Événement publié : il est visible sur l'accueil.",
        );
    if (ok) setForm(empty);
  };

  return (
    <section aria-labelledby="evt-title" data-testid="direction-events">
      <PartieTete id="evt-title" title="Événements">
        <p>Visibles aussitôt sur l'accueil.</p>
      </PartieTete>
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <form
          class="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 class="text-lg">{form.id ? "Modifier l'événement" : "Nouvel événement"}</h3>
          <div>
            <label for="evt-t" class="text-sm font-semibold">
              Nom de l'événement
            </label>
            <input id="evt-t" class="field mt-1" required maxLength={120} value={form.title} onInput={(e) => setForm({ ...form, title: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-s" class="text-sm font-semibold">
              Date et heure
            </label>
            <input id="evt-s" class="field mt-1" type="datetime-local" required value={form.start} onInput={(e) => setForm({ ...form, start: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-d" class="text-sm font-semibold">
              Description (facultative)
            </label>
            <textarea id="evt-d" class="field mt-1" rows={3} maxLength={2000} value={form.description} onInput={(e) => setForm({ ...form, description: e.currentTarget.value })} />
          </div>
          <div>
            <label for="evt-u" class="text-sm font-semibold">
              Lien en https (facultatif)
            </label>
            <input id="evt-u" class="field mt-1" type="url" maxLength={500} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
          </div>
          {form.id === null && (
            <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
              <label class="flex min-h-11 items-center gap-3 font-semibold">
                <input type="checkbox" class="size-5" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.currentTarget.checked })} />
                Répéter chaque semaine
              </label>
              {form.repeat && (
                <div>
                  <label for="evt-w" class="text-sm font-semibold">
                    Pendant
                  </label>
                  <select id="evt-w" class="field mt-1 !w-auto" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.currentTarget.value })}>
                    {SERIES_WEEKS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n} semaines
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div class="flex flex-wrap gap-3">
            <button type="submit" class="btn btn-primary" disabled={busy}>
              {form.id ? "Enregistrer" : form.repeat ? `Publier ${form.weeks} événements` : "Publier l'événement"}
            </button>
            {form.id && (
              <button type="button" class="btn btn-ghost" onClick={() => setForm(empty)}>
                Annuler
              </button>
            )}
          </div>
          <Problem message={error} />
          {done && <Success message={done} />}
        </form>
        {rows.length > 0 && (
          <div>
            <h3 class="text-lg">À venir</h3>
            {attendance === null && <p class="mt-2 text-warn">Les réponses « Je viens » n'ont pas pu être lues : rechargez la page.</p>}
            <ul class="mt-3 grid gap-3">
              {rows.map((ev) => {
                const names = attendance?.get(ev.id) ?? [];
                return (
                  <li key={ev.id} class="card p-5" data-testid="direction-event">
                    <p class="font-semibold [overflow-wrap:anywhere]">{ev.title}</p>
                    <p class="tnum mt-1 text-sm text-muted">
                      {fmtDateTime(ev.starts_at)}
                      {ev.author ? ` · ${ev.author}` : ""}
                    </p>
                    {names.length > 0 && (
                      <p class="mt-2" data-testid="direction-event-going">
                        {names.length === 1 ? "1 vient" : `${fmtInt(names.length)} viennent`} : {names.join(", ")}
                      </p>
                    )}
                    {ev.editable && (
                      <div class="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
                          disabled={busy}
                          aria-label={`Modifier « ${ev.title} »`}
                          onClick={() => {
                            setForm({ ...EMPTY_EVENT, id: ev.id, title: ev.title, description: ev.description ?? "", url: ev.url ?? "", start: toLocalInput(ev.starts_at) });
                            focusField("evt-t");
                          }}
                        >
                          Modifier
                        </button>
                        <DeleteButton busy={busy} label={ev.title} onConfirm={() => void run(() => call("delete_event", { p_id: ev.id }), "Événement supprimé.")} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** Le fondateur transmet son rôle. Il faut retaper le nom : on ne revient pas seul en arrière. */
function FounderTransfer({ onDone }: { onDone: () => Promise<void> }) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const { busy, error, done, run } = useRun(onDone);

  useEffect(() => {
    call<{ rows: MemberRow[] }>("list_members", { p_limit: 500 })
      .then((data) => setMembers(data.rows.filter((m) => m.status === "validated" && m.role !== "founder")))
      .catch(() => setMembers([]));
  }, []);

  const chosen = members?.find((m) => m.user_id === target);

  return (
    <section aria-labelledby="founder-title" data-testid="direction-founder">
      <PartieTete id="founder-title" title="Transmettre le rôle de fondateur">
        <p>Vous devenez admin, et seul le nouveau fondateur pourra vous rendre ce rôle.</p>
      </PartieTete>
      <div class="card mt-6 max-w-2xl p-5">
        {members === null ? (
          <Loading />
        ) : members.length === 0 ? (
          <p class="text-muted">Aucun autre membre validé pour l'instant.</p>
        ) : (
          <form
            class="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => call("transfer_founder", { p_user: target }), "Rôle transmis.");
            }}
          >
            <div>
              <label for="heir" class="text-sm font-semibold">
                Nouveau fondateur
              </label>
              <select
                id="heir"
                class="field mt-1"
                required
                value={target}
                onChange={(e) => {
                  setTarget(e.currentTarget.value);
                  setTyped("");
                }}
              >
                <option value="">Choisir un membre</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} ({ROLE_LABELS[m.role as Role]})
                  </option>
                ))}
              </select>
            </div>
            {chosen && (
              <div>
                <label for="heir-confirm" class="text-sm font-semibold">
                  Retapez « {chosen.name} » pour confirmer
                </label>
                <input id="heir-confirm" class="field mt-1" autocomplete="off" value={typed} onInput={(e) => setTyped(e.currentTarget.value)} />
              </div>
            )}
            <div>
              <button type="submit" class="btn btn-ghost" disabled={busy || !chosen || typed !== chosen.name}>
                Transmettre le rôle
              </button>
            </div>
          </form>
        )}
        <Problem message={error} />
        {done && <Success message={done} />}
      </div>
    </section>
  );
}

/**
 * L'espace Direction, en onglets : une partie à la fois. `health` : l'état de la collecte et de la gazette, lu au moment
 * de la construction du site (voir direction.astro). Seules la vue d'ensemble, les annonces et les événements attendent
 * `get_direction_overview` : si elle échoue, les autres parties restent, et l'on peut toujours valider un membre.
 */
export default function DirectionApp({ health, logo }: { health: Omit<SiteHealthInput, "roster">; logo?: LogoMatriceData }) {
  const { me, failed, refresh } = useMe();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Les brouillons sont gardés ici : un aller-retour en vue joueur ferme les formulaires sans effacer le texte en cours.
  const [announcementDraft, setAnnouncementDraft] = useState(EMPTY_ANNOUNCEMENT);
  const [eventDraft, setEventDraft] = useState(EMPTY_EVENT);
  const [pollDraft, setPollDraft] = useState<PollDraft>(EMPTY_POLL);
  const [welcomeDraft, setWelcomeDraft] = useState<string | null>(null);
  const [pickDraft, setPickDraft] = useState<WeeklyPickDraft>(EMPTY_WEEKLY_PICK);
  // Qui vient, événement par événement : `undefined` tant que ce n'est pas lu, `null` si le serveur ne l'a pas donné.
  // Dans ce dernier cas, la liste des événements le dit, et reste lisible.
  const [attendance, setAttendance] = useState<Map<number, string[]> | null | undefined>(undefined);
  // Le filtre qu'une case de la vue d'ensemble demande à l'onglet Comptes.
  const [membersAsk, setMembersAsk] = useState<MembersAsk | null>(null);
  // Vrai une fois la liste des comptes lue : avant, la page n'est pas assez haute pour remonter jusqu'à elle.
  const [membersReady, setMembersReady] = useState(false);
  const rank = me?.rank ?? 0;
  const base = basePath();
  const tabs = tabsFor(DIRECTION_TABS, rank);
  const { active, slide, shown, select, call: called } = useTabs(tabs.map((tab) => tab.id));
  // Le nombre de l'onglet Demandes, relu dès qu'une demande est traitée, comme la pastille de l'en-tête.
  const pending = usePendingCount(rank >= 2);
  // Revenir à la vue d'ensemble la relit : une demande, un rôle ou une suspension traités ailleurs changent ses cases.
  const away = useRef(false);
  // Chaque lecture a son numéro : la réponse d'une lecture dépassée par une plus récente est écartée, sans remettre l'ancien état.
  const reads = useRef(0);

  const load = async () => {
    const mine = ++reads.current;
    let next: Overview | null = null;
    let problem: string | null = null;
    try {
      next = await call<Overview>("get_direction_overview");
    } catch (e) {
      problem = messageOf(e);
    }
    if (mine !== reads.current) return;
    if (next) setOverview(next);
    setError(problem);
    let people: Map<number, string[]> | null = null;
    try {
      const data = await call<{ rows: { event_id: number; names: string[] }[] }>("list_event_attendance");
      people = new Map(data.rows.map((r) => [r.event_id, r.names]));
    } catch {
      // Pas de réponse : `null`, et la liste des événements le dit.
    }
    if (mine === reads.current) setAttendance(people);
  };

  useEffect(() => {
    if (rank >= 2) void load();
  }, [rank]);

  useEffect(() => {
    if (active !== "ensemble") away.current = true;
    else if (away.current && rank >= 2) void load();
  }, [active]);

  // Comptes est une longue liste : à son ouverture (menu, case de la vue d'ensemble ou adresse #comptes), le menu des parties
  // remonte sous l'en-tête et la liste remplit l'écran, au lieu d'attendre sous le titre et le guerrier (pilote, 13 novembre
  // 2026 : « c'est chiant de descendre la page pour voir les membres »). La page ne fait que descendre vers la liste : si l'on
  // est déjà plus bas, elle ne bouge pas.
  useEffect(() => {
    if (active !== "comptes" || !membersReady) return;
    const bar = document.querySelector<HTMLElement>('[data-testid="direction"] .onglets');
    if (!bar) return;
    const margin = parseFloat(getComputedStyle(bar).scrollMarginTop) || 0;
    if (bar.getBoundingClientRect().top <= margin + 8) return;
    bar.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [active, membersReady]);

  if (me === null) return <Loading />;
  if (failed) return <Problem message="Le service de connexion ne répond pas pour l'instant. Le reste du site continue de fonctionner." onRetry={() => void refresh()} />;
  if (!me.signed_in) {
    return (
      <section class="card max-w-xl p-6" data-testid="direction-signed-out">
        <p class="mb-4">Cet espace est réservé aux officiers et aux chefs du clan.</p>
        <DiscordButton returnPath="/direction" />
      </section>
    );
  }
  if (rank < 2) {
    return (
      <section class="card max-w-xl p-6" data-testid="direction-forbidden">
        <p>
          Cet espace est réservé aux officiers et aux chefs du clan. <a href={`${base}/compte`}>Voir mon compte</a>
        </p>
      </section>
    );
  }

  const qg = `${base}/qg`;
  const items: TabItem[] = tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    count: tab.id === "demandes" && pending !== null && pending > 0 ? { value: pending, words: `${fmtInt(pending)} ${pendingWords(pending) ?? ""}`, tone: "alerte" } : null,
  }));
  const part = { prefix: "direction", active, slide };

  // Une case de la vue d'ensemble ouvre sa partie, et le focus y va : la case elle-même vient d'être masquée.
  const open = (id: string, filter?: MemberFilter) => {
    if (filter) setMembersAsk((ask) => ({ filter, n: (ask?.n ?? 0) + 1 }));
    select(id, true);
    requestAnimationFrame(() => document.getElementById(`direction-partie-${id}`)?.focus({ preventScroll: true }));
  };

  // Les parties lues par `get_direction_overview` : son refus s'affiche dans chacune, là où l'on regarde.
  const withOverview = (render: (data: Overview) => ComponentChildren) => (
    <>
      <Problem message={error} onRetry={() => void load()} />
      {overview ? <div class={error ? "mt-4" : undefined}>{render(overview)}</div> : !error && <Loading />}
    </>
  );

  return (
    <div class="grid grid-cols-1 gap-6" data-testid="direction">
      <section class="card flex flex-wrap items-center justify-between gap-4 p-5" aria-label="Vous, à la Direction" data-testid="direction-me" data-titre="session">
        <div class="min-w-0 flex-[1_1_11rem]">
          <p class="font-display text-2xl font-extrabold [overflow-wrap:anywhere]">{me.name}</p>
          <Telemetrie role={ROLE_LABELS[me.role as Role]} lastRunAt={health.meta.lastRunAt} testId="direction" />
        </div>
        <div class="flex flex-wrap gap-2">
          {/* Les idées des membres se tranchent au QG, là où les membres les proposent. */}
          <a class="btn btn-ghost" href={qg} data-testid="direction-qg">
            Le QG
          </a>
          <a class="btn btn-ghost" href={`${base}/compte`}>
            Mon compte
          </a>
          {/* Tout le site passe en vue de membre sans grade, jusqu'à « Quitter la vue joueur » en haut de chaque page. Le serveur garde le vrai rôle. */}
          <button type="button" class="btn btn-ghost" data-player-view-start data-testid="player-view-start" onClick={() => setPlayerView(true)}>
            Voir le site comme un joueur
          </button>
        </div>
      </section>
      <div class="grid grid-cols-1 gap-5">
        {/* `menu` : treize parties pour le fondateur, la barre ne les montrait pas toutes ; à la place, un menu déroulant, à toutes les largeurs. */}
        {/* `debut` : le petit logo du guerrier en mode Matrix, en tête du menu (style Terminal). */}
        <Onglets
          label="Les parties de la Direction"
          prefix="direction"
          tabs={items}
          active={active}
          onSelect={(id) => select(id)}
          call={called}
          menu
          debut={logo && <LogoMatrice data={logo} id="logo-menu" class="console-logo-menu" points />}
        />

        <Partie {...part} id="ensemble">
          {withOverview((data) => (
            <section aria-labelledby="ensemble-titre">
              <PartieTete id="ensemble-titre" title="Ce qui attend une décision" />
              <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                <Tile label="Demandes à traiter" value={data.pending_requests} part="demandes" onOpen={open} alert={data.pending_requests > 0} />
                <Tile label="Membres validés" value={data.members} part="comptes" filter="validated" onOpen={open} />
                <Tile label="Encadrement" value={data.officers} part="comptes" filter="staff" onOpen={open} />
                <Tile label="Suspendus" value={data.suspended} part="comptes" filter="suspended" onOpen={open} />
              </div>
              <div class="mt-6">
                <SiteHealth meta={health.meta} gazette={health.gazette} roster={data.roster} />
              </div>
            </section>
          ))}
        </Partie>

        <Partie {...part} id="activite">
          {shown.has("activite") && <DirectionActivite />}
        </Partie>

        {/* L'administration : lue au premier passage sur son onglet, puis gardée, avec ses champs remplis. */}
        <Partie {...part} id="demandes">
          {shown.has("demandes") && <Requests />}
        </Partie>
        <Partie {...part} id="comptes">
          {shown.has("comptes") && <Members me={me} ask={membersAsk} active={active === "comptes"} onReady={() => setMembersReady(true)} />}
        </Partie>
        {rank >= 3 && (
          <Partie {...part} id="journal">
            {shown.has("journal") && <Log />}
          </Partie>
        )}

        <Partie {...part} id="annonces">
          {withOverview((data) => (
            <Announcements rows={data.announcements} reload={load} form={announcementDraft} setForm={setAnnouncementDraft} />
          ))}
        </Partie>

        <Partie {...part} id="evenements">
          {withOverview((data) => (
            <Events rows={data.events} attendance={attendance} reload={load} form={eventDraft} setForm={setEventDraft} />
          ))}
        </Partie>

        {/* Les parties suivantes lisent le serveur au premier passage sur leur onglet, puis restent dans la page. */}
        <Partie {...part} id="sondages">
          {shown.has("sondages") && <DirectionPolls form={pollDraft} setForm={setPollDraft} />}
        </Partie>

        <Partie {...part} id="accueil">
          {shown.has("accueil") && <DirectionWelcome draft={welcomeDraft} setDraft={setWelcomeDraft} />}
        </Partie>

        <Partie {...part} id="semaine">
          {shown.has("semaine") && <DirectionWeeklyPick draft={pickDraft} setDraft={setPickDraft} />}
        </Partie>

        {/* L'objectif de la semaine, que les membres voient au QG (outils du QG, 11 novembre 2026). */}
        <Partie {...part} id="objectif">
          {shown.has("objectif") && <DirectionObjectif />}
        </Partie>

        {/* Le serveur refuse le réglage sous le rang d'admin : l'onglet n'est qu'une commodité. */}
        {rank >= 3 && (
          <Partie {...part} id="discord">
            {shown.has("discord") && <DirectionDiscord />}
          </Partie>
        )}

        {me.role === "founder" && (
          <Partie {...part} id="fondateur">
            {shown.has("fondateur") && (
              <FounderTransfer
                onDone={async () => {
                  await refresh();
                  await load();
                }}
              />
            )}
          </Partie>
        )}
      </div>
    </div>
  );
}
