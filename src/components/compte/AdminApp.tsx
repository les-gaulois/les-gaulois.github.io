import { useEffect, useState } from "preact/hooks";
import { LOG_CATEGORIES, LOG_LIMIT, LOG_PAGE, describe, filterLog, logPeople, type LogCategory } from "../../lib/compte/admin-log";
import { basePath, call } from "../../lib/compte/api";
import { announcePendingChange } from "../../lib/compte/pending";
import { READY_REASONS, requestWait, requestsSummary } from "../../lib/compte/requests";
import { ROLE_LABELS, type LogRow, type Me, type MemberRow, type RequestRow, type Role } from "../../lib/compte/types";
import { fmtCount, fmtDateTime, fmtInt } from "../../lib/format";
import { DiscordButton, Empty, Loading, Problem, Success, messageOf, useMe, useNow } from "./common";

type Tab = "requests" | "members" | "log";

/** L'affichage suit le rôle, mais chaque fonction du serveur revérifie : masquer un onglet ne protège rien. */
const TABS: { id: Tab; label: string; rank: number }[] = [
  { id: "requests", label: "Demandes", rank: 2 },
  { id: "members", label: "Membres", rank: 2 },
  { id: "log", label: "Journal", rank: 3 },
];

const STATUS_LABELS = { pending: "En attente", validated: "Validé", suspended: "Suspendu" } as const;

/** Lit une liste du serveur et donne de quoi la relire après une action. */
function useList<T>(fn: string, args: Record<string, unknown> = {}) {
  const key = JSON.stringify(args);
  const [rows, setRows] = useState<T[] | null>(null);
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    try {
      const data = await call<{ rows: T[] }>(fn, JSON.parse(key) as Record<string, unknown>);
      setRows(data.rows);
      setExtra(data as unknown as Record<string, unknown>);
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    }
  };
  useEffect(() => {
    void reload();
    // Relit quand les arguments changent.
  }, [fn, key]);
  return { rows, extra, error, reload };
}

/** Exécute une action, affiche le refus du serveur ou un message de réussite, puis relit. */
function useAction(after: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await action();
      setDone(success);
      await after();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run };
}

function Requests() {
  const list = useList<RequestRow>("list_membership_requests");
  // La pastille de l'en-tête suit : une demande traitée ici n'y compte plus.
  const action = useAction(async () => {
    announcePendingChange();
    await list.reload();
  });
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const roster = list.extra["roster"] as { total: number; read_at: string } | null | undefined;
  const now = useNow();
  // Le serveur les donne de la plus ancienne à la plus récente.
  const oldest = list.rows?.[0] ? requestWait(list.rows[0].created_at, now) : null;

  return (
    <div data-testid="admin-requests">
      <p class="text-sm text-muted">
        {roster ? `Liste officielle relue le ${fmtDateTime(roster.read_at)} : ${fmtInt(roster.total)} ${roster.total > 1 ? "membres" : "membre"}.` : "La liste officielle n'a encore jamais été relue : aucun contrôle automatique pour l'instant."} Cette liste est publique : y figurer ne prouve pas qu'on est ce membre. Vérifiez sur Discord.
      </p>
      <Problem message={list.error ?? action.error} onRetry={() => void list.reload()} />
      {action.done && <Success message={action.done} />}
      {list.rows === null ? (
        !list.error && <Loading />
      ) : list.rows.length === 0 ? (
        <Empty>Aucune demande en attente.</Empty>
      ) : (
        <>
          {oldest && (
            <p class={`mt-3 text-sm ${oldest.late ? "font-semibold text-warn" : ""}`} data-testid="requests-summary">
              {requestsSummary(list.rows.length, oldest)}
            </p>
          )}
          <ul class="mt-3 grid gap-3">
            {list.rows.map((r) => {
              const wait = requestWait(r.created_at, now);
              return (
                <li key={r.id} class="card p-4" data-testid="request-row">
                  <p class="font-semibold">
                    {r.discord_name ?? r.name} <span class="text-sm font-normal text-muted">({r.name})</span>
                  </p>
                  <p class={r.in_roster ? "form-success" : "form-problem"} data-testid="request-roster">
                    {r.in_roster ? `Dans la liste${r.roster_username ? ` : ${r.roster_username}` : ", membre sans pseudo public"}` : `Absent de la liste${r.claimed_text ? ` : a indiqué « ${r.claimed_text} »` : ""}`}
                  </p>
                  {(r.game_role === "leader" || r.game_role === "officer") && (
                    <p class="mt-1 text-sm" data-testid="request-game-role">
                      {r.game_role === "leader" ? "Chef" : "Officier"} dans le jeu, d'après la liste publique. Ce rang ne donne aucun droit ici : à vous de le nommer après vérification.
                    </p>
                  )}
                  {r.note && <p class="mt-1 text-sm">« {r.note} »</p>}
                  <p class="tnum mt-1 text-xs text-muted">
                    Demandé le {fmtDateTime(r.created_at)} · <span class={wait.late ? "font-semibold text-warn" : ""} data-testid="request-wait">{wait.text}</span>
                    {r.discord_id ? ` · Discord : ${r.discord_id}` : ""}
                  </p>
                  <label class="mt-3 block text-sm font-semibold" for={`reason-${r.id}`}>
                    Raison (facultative)
                  </label>
                  <input id={`reason-${r.id}`} class="field mt-1" maxLength={300} value={reasons[r.id] ?? ""} onInput={(e) => setReasons({ ...reasons, [r.id]: e.currentTarget.value })} />
                  {/* Remplit le champ sans rien envoyer : la raison d'un refus est montrée telle quelle au membre. */}
                  <div class="mt-2 flex flex-wrap items-center gap-2" role="group" aria-labelledby={`ready-${r.id}`}>
                    <span id={`ready-${r.id}`} class="text-sm text-muted">
                      Pour un refus :
                    </span>
                    {READY_REASONS.map((reason) => (
                      <button key={reason} type="button" class="chip !min-h-9" onClick={() => setReasons({ ...reasons, [r.id]: reason })}>
                        {reason}
                      </button>
                    ))}
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button type="button" class="btn btn-primary btn-sm" disabled={action.busy} onClick={() => void action.run(() => call("review_membership", { p_request: r.id, p_approve: true, p_reason: reasons[r.id] || null }), "Membre validé.")}>
                      Valider
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" disabled={action.busy} onClick={() => void action.run(() => call("review_membership", { p_request: r.id, p_approve: false, p_reason: reasons[r.id] || null }), "Demande refusée.")}>
                      Refuser
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Members({ me }: { me: Me }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const list = useList<MemberRow>("list_members", { p_search: query || null, p_limit: 200 });
  const action = useAction(list.reload);
  // Un rôle choisi dans la liste attend une confirmation : au clavier ou d'un doigt, on choisit vite un autre rôle par erreur.
  const [draft, setDraft] = useState<{ user: string; role: Role } | null>(null);
  // Après « Confirmer » ou « Annuler », le focus revient à la liste du rôle, une fois l'envoi fini : sinon, il repartirait du haut de la page.
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (refocus === null || action.busy) return;
    document.getElementById(`role-${refocus}`)?.focus();
    setRefocus(null);
  }, [refocus, action.busy, list.rows]);
  const rank = me.rank ?? 0;
  const myRole = me.role ?? "member";
  const assignable: Role[] = rank >= 4 ? ["member", "officer", "admin"] : ["member", "officer"];
  const drafted = draft ? list.rows?.find((m) => m.user_id === draft.user) : undefined;

  return (
    <div data-testid="admin-members">
      {/* Toujours présente : un lecteur d'écran annonce ce qui change dans une zone qui existait déjà. */}
      <p class="sr-only" role="status">
        {draft && drafted ? `Rôle de ${drafted.name} : ${ROLE_LABELS[drafted.role]} → ${ROLE_LABELS[draft.role]}. Confirmez ou annulez.` : ""}
      </p>
      <form
        class="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
        }}
      >
        <div class="min-w-48 flex-1">
          <label class="text-sm font-semibold" for="member-search">
            Rechercher un membre
          </label>
          <input id="member-search" class="field mt-1" type="search" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
        </div>
        <button type="submit" class="btn btn-secondary">
          Chercher
        </button>
      </form>
      <Problem message={list.error ?? action.error} onRetry={() => void list.reload()} />
      {action.done && <Success message={action.done} />}
      {list.rows === null ? (
        !list.error && <Loading />
      ) : list.rows.length === 0 ? (
        <Empty>Aucun compte trouvé.</Empty>
      ) : (
        <div class="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Membres">
          <table class="data-table w-full">
            <thead>
              <tr>
                <th scope="col">Nom</th>
                <th scope="col">Discord</th>
                <th scope="col">Statut</th>
                <th scope="col">Liste</th>
                <th scope="col">Rôle</th>
                {rank >= 3 && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {list.rows.map((m) => {
                const editable = rank >= 3 && m.status === "validated" && m.role !== "founder" && (rank >= 4 || m.role !== "admin") && m.user_id !== undefined;
                const chosen = draft?.user === m.user_id ? draft.role : null;
                return (
                  <tr key={m.user_id} data-testid="member-row">
                    <td class="font-semibold">{m.name}</td>
                    <td>{m.discord_name ?? "—"}</td>
                    <td>
                      {STATUS_LABELS[m.status]}
                      {m.status_reason ? ` : ${m.status_reason}` : ""}
                    </td>
                    <td>{m.linked ? (m.in_roster ? "Oui" : <span class="text-warn">Plus dans la liste</span>) : "—"}</td>
                    <td>
                      {editable ? (
                        <>
                          <select
                            id={`role-${m.user_id}`}
                            aria-label={`Rôle de ${m.name}`}
                            class="field !min-h-9 !py-1"
                            value={chosen ?? m.role}
                            disabled={action.busy}
                            onChange={(e) => {
                              const role = e.currentTarget.value as Role;
                              setDraft(role === m.role ? null : { user: m.user_id, role });
                            }}
                          >
                            {assignable.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          {chosen && (
                            <div class="mt-2 flex flex-wrap items-center gap-2" data-testid="role-confirm">
                              <span class="text-sm" aria-hidden="true">
                                {ROLE_LABELS[m.role]} → {ROLE_LABELS[chosen]} ?
                              </span>
                              <button
                                type="button"
                                class="chip !min-h-9"
                                aria-label={`Confirmer le rôle ${ROLE_LABELS[chosen]} pour ${m.name}`}
                                disabled={action.busy}
                                onClick={() => {
                                  setDraft(null);
                                  setRefocus(m.user_id);
                                  void action.run(() => call("set_member_role", { p_user: m.user_id, p_role: chosen }), `Rôle de ${m.name} modifié : ${ROLE_LABELS[m.role]} → ${ROLE_LABELS[chosen]}.`);
                                }}
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                class="chip !min-h-9"
                                aria-label={`Annuler le changement de rôle de ${m.name}`}
                                onClick={() => {
                                  setDraft(null);
                                  setRefocus(m.user_id);
                                }}
                              >
                                Annuler
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        ROLE_LABELS[m.role]
                      )}
                    </td>
                    {rank >= 3 && (
                      <td>
                        {m.status === "validated" && m.role !== "founder" && (rank >= 4 || m.role !== "admin") && (
                          <button
                            type="button"
                            class="chip !min-h-9"
                            disabled={action.busy}
                            onClick={() => {
                              const reason = window.prompt(`Pourquoi suspendre ${m.name} ?`);
                              if (reason) void action.run(() => call("suspend_member", { p_user: m.user_id, p_reason: reason }), `${m.name} est suspendu.`);
                            }}
                          >
                            Suspendre
                          </button>
                        )}
                        {m.status === "suspended" && (
                          <button type="button" class="chip !min-h-9" disabled={action.busy} onClick={() => void action.run(() => call("reinstate_member", { p_user: m.user_id }), `${m.name} est rétabli.`)}>
                            Rétablir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p class="mt-2 text-xs text-muted">Vous êtes {ROLE_LABELS[myRole]}. Le serveur revérifie chaque changement.</p>
    </div>
  );
}

/** Le journal en phrases, avec un filtre par personne et par type d'action. Le serveur garde les codes : voir `src/lib/compte/admin-log.ts`. */
function Log() {
  const list = useList<LogRow>("list_admin_log", { p_limit: LOG_LIMIT });
  const [person, setPerson] = useState("");
  const [category, setCategory] = useState<LogCategory | "">("");
  const [shown, setShown] = useState(LOG_PAGE);
  const rows = list.rows ?? [];
  const filtered = filterLog(rows, { person: person || null, category: category || null });

  return (
    <div data-testid="admin-log">
      <Problem message={list.error} onRetry={() => void list.reload()} />
      {list.rows === null ? (
        !list.error && <Loading />
      ) : rows.length === 0 ? (
        <Empty>Le journal est vide.</Empty>
      ) : (
        <>
          <div class="flex flex-wrap gap-3">
            <div class="min-w-48 flex-1">
              <label class="text-sm font-semibold" for="log-person">
                Personne
              </label>
              <select
                id="log-person"
                class="field mt-1"
                value={person}
                onChange={(e) => {
                  setPerson(e.currentTarget.value);
                  setShown(LOG_PAGE);
                }}
              >
                <option value="">Tout le monde</option>
                {logPeople(rows).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div class="min-w-48 flex-1">
              <label class="text-sm font-semibold" for="log-category">
                Type d'action
              </label>
              <select
                id="log-category"
                class="field mt-1"
                value={category}
                onChange={(e) => {
                  setCategory(e.currentTarget.value as LogCategory | "");
                  setShown(LOG_PAGE);
                }}
              >
                <option value="">Toutes</option>
                {LOG_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p class="mt-3 text-sm text-muted" role="status" data-testid="log-count">
            {fmtCount(filtered.length, "entrée")}
            {rows.length >= LOG_LIMIT ? `, parmi les ${fmtInt(LOG_LIMIT)} dernières : l'écran n'en lit pas davantage.` : "."}
          </p>
          {filtered.length === 0 ? (
            <Empty>Aucune entrée pour ce choix.</Empty>
          ) : (
            <ol class="mt-2" aria-label="Journal d'administration">
              {filtered.slice(0, shown).map((l) => {
                const line = describe(l, fmtDateTime);
                return (
                  <li key={l.id} class="border-t border-line py-3" data-testid="log-row">
                    <p class="tnum text-xs text-muted">
                      <time dateTime={l.at}>{fmtDateTime(l.at)}</time>
                    </p>
                    <p class="mt-0.5">
                      <strong>{line.who}</strong> {line.what}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {filtered.length > shown && (
            <button type="button" class="btn btn-secondary btn-sm mt-2" onClick={() => setShown(shown + LOG_PAGE)}>
              Afficher {fmtInt(Math.min(LOG_PAGE, filtered.length - shown))} de plus
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminApp() {
  const { me, failed, refresh } = useMe();
  const [tab, setTab] = useState<Tab>("requests");

  if (me === null) return <Loading label="Lecture de votre compte…" />;
  if (failed) return <Problem message="Votre compte n'a pas pu être lu pour l'instant." onRetry={() => void refresh()} />;
  if (!me.signed_in) {
    return (
      <section class="card p-6" data-testid="admin-signed-out">
        <p class="mb-4">Cet espace est réservé aux officiers et aux admins du clan.</p>
        <DiscordButton returnPath="/admin" />
      </section>
    );
  }
  const rank = me.rank ?? 0;
  if (rank < 2) {
    return (
      <p class="card p-6" data-testid="admin-denied">
        Cet espace est réservé aux officiers et aux admins du clan. <a href={`${basePath()}/compte`}>Voir mon compte</a>
      </p>
    );
  }

  const tabs = TABS.filter((t) => rank >= t.rank);
  return (
    <div data-testid="admin">
      <div class="flex flex-wrap gap-2" role="tablist" aria-label="Sections de l'administration">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" class="chip" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div class="mt-5" role="tabpanel">
        {tab === "requests" && <Requests />}
        {tab === "members" && <Members me={me} />}
        {tab === "log" && <Log />}
      </div>
    </div>
  );
}
