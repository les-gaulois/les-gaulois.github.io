import { useEffect, useState } from "preact/hooks";
import { basePath, call } from "../../lib/compte/api";
import { toLocalInput } from "../../lib/compte/news";
import { ROLE_LABELS, type MemberRow, type Role } from "../../lib/compte/types";
import { setPlayerView } from "../../lib/compte/vue-joueur";
import type { SiteHealthInput } from "../../lib/etat-site";
import { fmtDate, fmtDateTime, fmtInt } from "../../lib/format";
import { DeleteButton, DiscordButton, Loading, Problem, Success, messageOf, useMe, useRun } from "./common";
import DirectionPolls, { EMPTY_POLL, type PollDraft } from "./DirectionPolls";
import DirectionWelcome from "./DirectionWelcome";
import SiteHealth from "./SiteHealth";

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

function Tile({ label, value, href, alert = false }: { label: string; value: number; href: string; alert?: boolean }) {
  return (
    <a href={href} class="card block p-4 hover:border-white" data-testid="direction-tile">
      <span class="text-sm font-semibold text-muted">{label}</span>
      <span class={`tnum mt-1 block font-display text-3xl font-extrabold ${alert ? "text-warn" : ""}`}>{fmtInt(value)}</span>
    </a>
  );
}

const EMPTY_ANNOUNCEMENT = { id: null as number | null, title: "", body: "", url: "" };
type AnnouncementDraft = typeof EMPTY_ANNOUNCEMENT;
// `repeat` et `weeks` : seulement pour un nouvel événement. Une série crée un événement par semaine, chacun modifiable seul.
const EMPTY_EVENT = { id: null as number | null, title: "", description: "", url: "", start: "", repeat: false, weeks: "4" };
type EventDraft = typeof EMPTY_EVENT;
const SERIES_WEEKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function Announcements({ rows, reload, form, setForm }: { rows: AnnouncementRow[]; reload: () => Promise<void>; form: AnnouncementDraft; setForm: (draft: AnnouncementDraft) => void }) {
  const empty = EMPTY_ANNOUNCEMENT;
  const { busy, error, done, run } = useRun(reload);

  const save = async () => {
    const ok = await run(() => call("save_announcement", { p_id: form.id, p_title: form.title, p_body: form.body, p_url: form.url || null }), form.id ? "Annonce modifiée." : "Annonce publiée : elle est visible sur l'accueil.");
    if (ok) setForm(empty);
  };

  return (
    <section class="card p-5" aria-labelledby="ann-title" data-testid="direction-announcements">
      <h2 id="ann-title" class="text-xl">
        Annonces
      </h2>
      <form
        class="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
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
          <textarea id="ann-b" class="field mt-1" required rows={4} maxLength={2000} value={form.body} onInput={(e) => setForm({ ...form, body: e.currentTarget.value })} />
        </div>
        <div>
          <label for="ann-u" class="text-sm font-semibold">
            Lien en https (facultatif)
          </label>
          <input id="ann-u" class="field mt-1" type="url" maxLength={500} value={form.url} onInput={(e) => setForm({ ...form, url: e.currentTarget.value })} />
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary" disabled={busy}>
            {form.id ? "Enregistrer" : "Publier l'annonce"}
          </button>
          {form.id && (
            <button type="button" class="btn btn-ghost" onClick={() => setForm(empty)}>
              Annuler
            </button>
          )}
        </div>
      </form>
      <Problem message={error} />
      {done && <Success message={done} />}
      {rows.length > 0 && (
        <ul class="mt-5 grid gap-3">
          {rows.map((a) => (
            <li key={a.id} class="border-t border-line pt-3" data-testid="direction-announcement">
              <p class="font-semibold">{a.title}</p>
              <p class="tnum text-xs text-muted">
                {fmtDate(a.created_at)}
                {a.author ? ` · ${a.author}` : ""}
              </p>
              {a.editable && (
                <div class="mt-2 flex flex-wrap gap-2">
                  <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" disabled={busy} aria-label={`Modifier « ${a.title} »`} onClick={() => setForm({ id: a.id, title: a.title, body: a.body, url: a.url ?? "" })}>
                    Modifier
                  </button>
                  <DeleteButton busy={busy} label={a.title} onConfirm={() => void run(() => call("delete_announcement", { p_id: a.id }), "Annonce supprimée.")} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
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
    <section class="card p-5" aria-labelledby="evt-title" data-testid="direction-events">
      <h2 id="evt-title" class="text-xl">
        Événements
      </h2>
      <form
        class="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
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
            <label class="flex min-h-11 items-center gap-2 text-sm font-semibold">
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
        <div class="flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary" disabled={busy}>
            {form.id ? "Enregistrer" : form.repeat ? `Publier ${form.weeks} événements` : "Publier l'événement"}
          </button>
          {form.id && (
            <button type="button" class="btn btn-ghost" onClick={() => setForm(empty)}>
              Annuler
            </button>
          )}
        </div>
      </form>
      <Problem message={error} />
      {done && <Success message={done} />}
      {rows.length > 0 && attendance === null && <p class="mt-3 text-sm text-warn">Les réponses « Je viens » n'ont pas pu être lues : rechargez la page.</p>}
      {rows.length > 0 && (
        <ul class="mt-5 grid gap-3">
          {rows.map((ev) => {
            const names = attendance?.get(ev.id) ?? [];
            return (
              <li key={ev.id} class="border-t border-line pt-3" data-testid="direction-event">
                <p class="font-semibold">{ev.title}</p>
                <p class="tnum text-xs text-muted">
                  {fmtDateTime(ev.starts_at)}
                  {ev.author ? ` · ${ev.author}` : ""}
                </p>
                {names.length > 0 && (
                  <p class="mt-1 text-sm" data-testid="direction-event-going">
                    {names.length === 1 ? "1 vient" : `${fmtInt(names.length)} viennent`} : {names.join(", ")}
                  </p>
                )}
                {ev.editable && (
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
                      disabled={busy}
                      aria-label={`Modifier « ${ev.title} »`}
                      onClick={() => setForm({ ...EMPTY_EVENT, id: ev.id, title: ev.title, description: ev.description ?? "", url: ev.url ?? "", start: toLocalInput(ev.starts_at) })}
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
      )}
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
    <section class="card p-5" aria-labelledby="founder-title" data-testid="direction-founder">
      <h2 id="founder-title" class="text-xl">
        Transmettre le rôle de fondateur
      </h2>
      <p class="mt-2 text-sm text-muted">Vous devenez admin, et seul le nouveau fondateur pourra vous rendre ce rôle. Le clan garde toujours un fondateur : c'est aussi ce qui vous permet ensuite de supprimer votre compte.</p>
      {members === null ? (
        <Loading />
      ) : members.length === 0 ? (
        <p class="mt-3 text-muted">Aucun autre membre validé pour l'instant.</p>
      ) : (
        <form
          class="mt-4 grid gap-3"
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
    </section>
  );
}

/** `health` : l'état de la collecte et de la gazette, lu au moment de la construction du site (voir direction.astro). */
export default function DirectionApp({ health }: { health: Omit<SiteHealthInput, "roster"> }) {
  const { me, failed, refresh } = useMe();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Les brouillons sont gardés ici : un aller-retour en vue joueur ferme les formulaires sans effacer le texte en cours.
  const [announcementDraft, setAnnouncementDraft] = useState(EMPTY_ANNOUNCEMENT);
  const [eventDraft, setEventDraft] = useState(EMPTY_EVENT);
  const [pollDraft, setPollDraft] = useState<PollDraft>(EMPTY_POLL);
  const [welcomeDraft, setWelcomeDraft] = useState<string | null>(null);
  // Qui vient, événement par événement : `undefined` tant que ce n'est pas lu, `null` si le serveur ne l'a pas donné.
  // Dans ce dernier cas, la liste des événements le dit, et reste lisible.
  const [attendance, setAttendance] = useState<Map<number, string[]> | null | undefined>(undefined);
  const rank = me?.rank ?? 0;
  const base = basePath();

  const load = async () => {
    try {
      setOverview(await call<Overview>("get_direction_overview"));
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    }
    try {
      const data = await call<{ rows: { event_id: number; names: string[] }[] }>("list_event_attendance");
      setAttendance(new Map(data.rows.map((r) => [r.event_id, r.names])));
    } catch {
      setAttendance(null);
    }
  };

  useEffect(() => {
    if (rank >= 2) void load();
  }, [rank]);

  if (me === null) return <Loading />;
  if (failed) return <Problem message="Le service de connexion ne répond pas pour l'instant. Le reste du site continue de fonctionner." onRetry={() => void refresh()} />;
  if (!me.signed_in) {
    return (
      <section class="card max-w-xl p-5" data-testid="direction-signed-out">
        <p class="mb-4">Cet espace est réservé aux officiers et aux chefs du clan.</p>
        <DiscordButton returnPath="/direction" />
      </section>
    );
  }
  if (rank < 2) {
    return (
      <section class="card max-w-xl p-5" data-testid="direction-forbidden">
        <p>
          Cet espace est réservé aux officiers et aux chefs du clan. <a href={`${base}/compte`}>Voir mon compte</a>
        </p>
      </section>
    );
  }

  const admin = `${base}/admin`;
  return (
    <div class="grid gap-6" data-testid="direction">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-muted">
          Connecté en tant que <strong>{me.name}</strong>, {ROLE_LABELS[me.role as Role].toLowerCase()}. <a href={`${base}/compte`}>Mon compte</a> ·{" "}
          {/* Les idées des membres se tranchent au QG, là où ils les lisent. */}
          <a href={`${base}/qg`} data-testid="direction-qg">
            Le QG, où trancher les idées
          </a>
        </p>
        {/* Tout le site passe en vue de membre sans grade, jusqu'à « Quitter la vue joueur » en haut de chaque page. Le serveur garde le vrai rôle. */}
        <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" data-player-view-start data-testid="player-view-start" onClick={() => setPlayerView(true)}>
          Voir le site comme un joueur
        </button>
      </div>
      <Problem message={error} onRetry={() => void load()} />
      {overview === null ? (
        !error && <Loading />
      ) : (
        <>
          <section aria-label="Ce qui attend une décision">
            <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Demandes à traiter" value={overview.pending_requests} href={admin} alert={overview.pending_requests > 0} />
              <Tile label="Membres validés" value={overview.members} href={admin} />
              <Tile label="Encadrement" value={overview.officers} href={admin} />
              <Tile label="Suspendus" value={overview.suspended} href={admin} />
            </div>
            <p class="mt-3 text-sm text-muted">
              <a href={admin}>Ouvrir l'administration</a> pour valider les membres, gérer les rôles et lire le journal.
            </p>
          </section>
          <SiteHealth meta={health.meta} gazette={health.gazette} roster={overview.roster} />
          <div class="grid items-start gap-6 lg:grid-cols-2">
            <Announcements rows={overview.announcements} reload={load} form={announcementDraft} setForm={setAnnouncementDraft} />
            <Events rows={overview.events} attendance={attendance} reload={load} form={eventDraft} setForm={setEventDraft} />
          </div>
          <div class="grid items-start gap-6 lg:grid-cols-2">
            <DirectionPolls form={pollDraft} setForm={setPollDraft} />
            <DirectionWelcome draft={welcomeDraft} setDraft={setWelcomeDraft} />
          </div>
          {me.role === "founder" && (
            <FounderTransfer
              onDone={async () => {
                await refresh();
                await load();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
