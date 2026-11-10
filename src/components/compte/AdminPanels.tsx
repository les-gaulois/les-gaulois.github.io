/**
 * L'administration, au QG depuis le 10 novembre 2026 : les onglets Demandes, Comptes et Journal de l'encadrement.
 * L'affichage suit le rôle (voir `QgApp.tsx`), mais chaque fonction du serveur revérifie : masquer un onglet ne protège rien.
 */
import { useEffect, useState } from "preact/hooks";
import { LOG_CATEGORIES, LOG_LIMIT, LOG_PAGE, describe, filterLog, logPeople, type LogCategory } from "../../lib/compte/admin-log";
import { ROSTER_CELL_LABELS, ROSTER_CELL_WARN, canRedoRequest, notFoundHelp, openRequests, redoRequestDone, redoRequestQuestion, rosterCell } from "../../lib/compte/admin-members";
import { call } from "../../lib/compte/api";
import { announcePendingChange } from "../../lib/compte/pending";
import { READY_REASONS, requestWait, requestsSummary } from "../../lib/compte/requests";
import { ROLE_LABELS, type LogRow, type Me, type MemberRow, type RequestRow, type Role } from "../../lib/compte/types";
import { fmtCount, fmtDateTime, fmtInt } from "../../lib/format";
import { Empty, Loading, Problem, Success, messageOf, useNow } from "./common";
import { PartieTete } from "./Onglets";

const STAFF = "Encadrement";

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

export function Requests() {
  const list = useList<RequestRow>("list_membership_requests");
  // La pastille de l'en-tête et le nombre de l'onglet suivent : une demande traitée ici n'y compte plus.
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
    <section aria-labelledby="demandes-titre" data-testid="admin-requests">
      <PartieTete id="demandes-titre" eyebrow={STAFF} title="Demandes d'adhésion">
        <p>
          {roster ? `Liste officielle relue le ${fmtDateTime(roster.read_at)} : ${fmtInt(roster.total)} ${roster.total > 1 ? "membres" : "membre"}.` : "La liste officielle n'a encore jamais été relue : aucun contrôle automatique pour l'instant."} Cette liste est publique : y figurer ne prouve pas qu'on est ce membre. Vérifiez sur Discord.
        </p>
      </PartieTete>
      <Problem message={list.error ?? action.error} onRetry={() => void list.reload()} />
      {action.done && <Success message={action.done} />}
      {list.rows === null ? (
        !list.error && (
          <div class="mt-4">
            <Loading />
          </div>
        )
      ) : list.rows.length === 0 ? (
        <div class="mt-4">
          <Empty>Aucune demande en attente.</Empty>
        </div>
      ) : (
        <>
          {oldest && (
            <p class={`mt-4 ${oldest.late ? "font-semibold text-warn" : ""}`} data-testid="requests-summary">
              {requestsSummary(list.rows.length, oldest)}
            </p>
          )}
          <ul class="mt-4 grid items-start gap-4 lg:grid-cols-2">
            {list.rows.map((r) => {
              const wait = requestWait(r.created_at, now);
              return (
                <li key={r.id} class="card p-5" data-testid="request-row">
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
                  <div class="mt-4 flex flex-wrap gap-3">
                    <button type="button" class="btn btn-primary" disabled={action.busy} onClick={() => void action.run(() => call("review_membership", { p_request: r.id, p_approve: true, p_reason: reasons[r.id] || null }), "Membre validé.")}>
                      Valider
                    </button>
                    <button type="button" class="btn btn-ghost" disabled={action.busy} onClick={() => void action.run(() => call("review_membership", { p_request: r.id, p_approve: false, p_reason: reasons[r.id] || null }), "Demande refusée.")}>
                      Refuser
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

export function Members({ me }: { me: Me }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const list = useList<MemberRow>("list_members", { p_search: query || null, p_limit: 200 });
  // Pour un compte en attente, la colonne « Liste » dit s'il a une demande ouverte. Sans cette lecture, elle ne devine rien.
  // La même lecture donne la date de la dernière relecture de la liste officielle.
  const pending = useList<RequestRow>("list_membership_requests");
  const requests = openRequests(pending.error ? null : pending.rows);
  const roster = pending.error ? undefined : (pending.extra["roster"] as { read_at: string } | null | undefined);
  // Une demande a pu arriver entre-temps : chaque relecture reprend les deux listes.
  const reloadAll = async () => {
    await Promise.all([list.reload(), pending.reload()]);
  };
  const action = useAction(reloadAll);
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
  // La ligne d'aide n'explique « Pas trouvé dans la liste » que si la case est à l'écran, et le bouton que s'il y est.
  const someNotFound = list.rows?.some((m) => rosterCell(m, null) === "not_found") ?? false;
  const someRedo = list.rows?.some((m) => canRedoRequest(m, rank)) ?? false;
  // Après « Refaire la demande », le bouton disparaît : le focus va au message, qui dit la suite à donner.
  const [focusDone, setFocusDone] = useState(false);
  useEffect(() => {
    if (!focusDone || action.busy) return;
    document.getElementById("members-done")?.focus();
    setFocusDone(false);
  }, [focusDone, action.busy]);

  return (
    <section aria-labelledby="membres-titre" data-testid="admin-members">
      <PartieTete id="membres-titre" eyebrow={STAFF} title="Comptes du site" />
      {/* Toujours présente : un lecteur d'écran annonce ce qui change dans une zone qui existait déjà. */}
      <p class="sr-only" role="status">
        {draft && drafted ? `Rôle de ${drafted.name} : ${ROLE_LABELS[drafted.role]} → ${ROLE_LABELS[draft.role]}. Confirmez ou annulez.` : ""}
      </p>
      <form
        class="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
          void pending.reload();
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
      <Problem message={list.error ?? action.error} onRetry={() => void reloadAll()} />
      {!list.error && <Problem message={pending.error ? "Les demandes n'ont pas pu être lues : la colonne Liste ne dit pas si un compte en attente en a une." : null} onRetry={() => void pending.reload()} />}
      <div id="members-done" tabIndex={-1}>
        {action.done && <Success message={action.done} />}
      </div>
      {list.rows === null ? (
        !list.error && <Loading />
      ) : list.rows.length === 0 ? (
        <Empty>Aucun compte trouvé.</Empty>
      ) : (
        <div class="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Membres">
          {/* Sur téléphone, le tableau défile dans son cadre : coupé n'importe où, comme le reste de la page, il écrirait les mots lettre par lettre. */}
          <table class="data-table w-full [overflow-wrap:break-word]">
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
                const cell = rosterCell(m, requests);
                return (
                  <tr key={m.user_id} data-testid="member-row">
                    <td class="font-semibold">{m.name}</td>
                    <td>{m.discord_name ?? "—"}</td>
                    <td>
                      {STATUS_LABELS[m.status]}
                      {m.status_reason ? ` : ${m.status_reason}` : ""}
                    </td>
                    <td class={ROSTER_CELL_WARN.has(cell) ? "text-warn" : cell === "no_request" ? "text-muted" : undefined} data-testid="member-roster">
                      {ROSTER_CELL_LABELS[cell]}
                    </td>
                    <td>
                      {editable ? (
                        <>
                          <select
                            id={`role-${m.user_id}`}
                            aria-label={`Rôle de ${m.name}`}
                            class="field !min-h-9 min-w-32 !py-1"
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
                        <div class="flex flex-wrap gap-2">
                          {/* Un compte que la liste ne trouve pas : la personne refait sa demande avec son pseudo exact. */}
                          {canRedoRequest(m, rank) && (
                            <button
                              type="button"
                              class="chip !min-h-9 whitespace-nowrap"
                              aria-label={`Refaire la demande de ${m.name}`}
                              data-testid="redo-request"
                              disabled={action.busy}
                              onClick={() => {
                                if (!window.confirm(redoRequestQuestion(m.name, m.role))) return;
                                setFocusDone(true);
                                void action.run(() => call("reset_member_link", { p_user: m.user_id }), redoRequestDone(m.name, m.discord_name));
                              }}
                            >
                              Refaire la demande
                            </button>
                          )}
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
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p class="mt-3 max-w-4xl text-sm text-muted" data-testid="members-names-help">
        <span data-testid="members-roster-date">{roster ? `Liste officielle relue le ${fmtDateTime(roster.read_at)}. ` : roster === null ? "La liste officielle n'a encore jamais été relue. " : ""}</span>
        Un compte s'appelle « Gaulois n° … » jusqu'à sa validation, puis prend son pseudo de la liste officielle. Validé hors de la liste, ou membre sans pseudo public, il garde ce nom.
        {someNotFound && <span data-testid="members-not-found-help">{` ${notFoundHelp(someRedo)}`}</span>}
      </p>
      <p class="mt-1 text-sm text-muted">Vous êtes {ROLE_LABELS[myRole]}. Le serveur revérifie chaque changement.</p>
    </section>
  );
}

/** Le journal en phrases, avec un filtre par personne et par type d'action. Le serveur garde les codes : voir `src/lib/compte/admin-log.ts`. */
export function Log() {
  const list = useList<LogRow>("list_admin_log", { p_limit: LOG_LIMIT });
  const [person, setPerson] = useState("");
  const [category, setCategory] = useState<LogCategory | "">("");
  const [shown, setShown] = useState(LOG_PAGE);
  const rows = list.rows ?? [];
  const filtered = filterLog(rows, { person: person || null, category: category || null });

  return (
    <section aria-labelledby="journal-titre" data-testid="admin-log">
      <PartieTete id="journal-titre" eyebrow={STAFF} title="Journal" />
      <Problem message={list.error} onRetry={() => void list.reload()} />
      {list.rows === null ? (
        !list.error && (
          <div class="mt-4">
            <Loading />
          </div>
        )
      ) : rows.length === 0 ? (
        <div class="mt-4">
          <Empty>Le journal est vide.</Empty>
        </div>
      ) : (
        <>
          <div class="mt-5 flex flex-wrap gap-3">
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
            <button type="button" class="btn btn-ghost mt-3" onClick={() => setShown(shown + LOG_PAGE)}>
              Afficher {fmtInt(Math.min(LOG_PAGE, filtered.length - shown))} de plus
            </button>
          )}
        </>
      )}
    </section>
  );
}
