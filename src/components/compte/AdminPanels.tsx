/**
 * L'administration : les onglets Demandes, Comptes et Journal de la Direction (au QG du 10 au 12 novembre 2026).
 * L'affichage suit le rôle (voir `DirectionApp.tsx`), mais chaque fonction du serveur revérifie : masquer un onglet ne protège rien.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { LOG_CATEGORIES, LOG_LIMIT, LOG_PAGE, describe, filterLog, logPeople, type LogCategory } from "../../lib/compte/admin-log";
import {
  MEMBERS_LIMIT,
  MEMBER_FILTERS,
  ROSTER_CELL_LABELS,
  allyStatusParts,
  canRedoRequest,
  filterCounts,
  inFilter,
  listMayBeCut,
  matchesSearch,
  memberState,
  notFoundHelp,
  openRequests,
  redoRequestDone,
  redoRequestQuestion,
  rosterCell,
  rosterTone,
  statusTone,
  type AllyMark,
  type MemberFilter,
  type MemberTone,
} from "../../lib/compte/admin-members";
import { call } from "../../lib/compte/api";
import { announcePendingChange } from "../../lib/compte/pending";
import { READY_REASONS, requestWait, requestsSummary } from "../../lib/compte/requests";
import { ROLE_LABELS, type LogRow, type Me, type MemberRow, type RequestRow, type Role } from "../../lib/compte/types";
import { fmtCount, fmtDateTime, fmtInt } from "../../lib/format";
import { Empty, Loading, Problem, Success, messageOf, useAutoReload, useNow } from "./common";
import { PartieTete } from "./Onglets";

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
      <PartieTete id="demandes-titre" title="Demandes d'adhésion">
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

/** Le filtre qu'une case de la vue d'ensemble demande à l'onglet Comptes. `n` change à chaque demande, même pour le même filtre. */
export interface MembersAsk {
  filter: MemberFilter;
  n: number;
}

/** Une pastille : un point de couleur et le mot. La couleur n'est jamais seule à dire l'état. */
function Pastille({ tone, plain = false, testid, children }: { tone: MemberTone; plain?: boolean; testid?: string; children: ComponentChildren }) {
  return (
    <span class={plain ? "comptes-point" : "comptes-pastille"} data-tone={tone} data-testid={testid}>
      {children}
    </span>
  );
}

/**
 * Les comptes du site. Demande du pilote, 13 novembre 2026 : « c'est chiant de descendre la page pour voir les membres »,
 * « ajoute des codes couleur ». Une barre qui reste sous l'en-tête (recherche à chaque lettre, filtres avec leur nombre),
 * une ligne courte par compte, une couleur par état. Les règles sont dans `src/lib/compte/admin-members.ts`, le dessin dans
 * `global.css`, section « L'onglet Comptes de la Direction » : tout y est sous la classe `comptes`.
 */
export function Members({ me, ask, onReady, active = true }: { me: Me; ask?: MembersAsk | null; onReady?: () => void; active?: boolean }) {
  const [search, setSearch] = useState("");
  // Ce que le serveur a cherché lui-même : seulement quand il a coupé la liste (voir `listMayBeCut`).
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>(ask?.filter ?? "all");
  const list = useList<MemberRow>("list_members", { p_search: query || null, p_limit: MEMBERS_LIMIT });
  // La liste est là : la Direction peut faire remonter la page jusqu'à elle (voir `DirectionApp.tsx`).
  const loaded = list.rows !== null;
  useEffect(() => {
    if (loaded) onReady?.();
  }, [loaded]);
  // Pour un compte en attente, la colonne « Liste » dit s'il a une demande ouverte. Sans cette lecture, elle ne devine rien.
  // La même lecture donne la date de la dernière relecture de la liste officielle.
  const pending = useList<RequestRow>("list_membership_requests");
  const requests = openRequests(pending.error ? null : pending.rows);
  const roster = pending.error ? undefined : (pending.extra["roster"] as { read_at: string } | null | undefined);
  // Les joueurs alliés de la carte de l'alliance, par numéro de compte : sans ce repère, ils ressemblent à de nouveaux Gaulois
  // « En attente ». Un serveur d'avant cette lecture la refuse : la liste reste alors comme avant.
  const [allies, setAllies] = useState<Map<number, AllyMark>>(new Map());
  const readAllies = () =>
    call<{ allies: AllyMark[] }>("list_alliance_allies")
      .then((r) => setAllies(new Map(r.allies.map((a) => [a.number, a]))))
      .catch(() => setAllies(new Map()));
  useEffect(() => {
    void readAllies();
  }, []);
  // Une demande a pu arriver entre-temps, un allié être accepté : chaque relecture reprend les trois listes.
  const reloadAll = async () => {
    await Promise.all([list.reload(), pending.reload(), readAllies()]);
  };
  const action = useAction(reloadAll);
  // Et la liste se relit d'elle-même : à la réouverture de l'onglet, au retour sur la page et chaque minute (`useAutoReload`).
  useAutoReload(reloadAll, active);
  // Une demande arrivée ou traitée depuis la lecture précédente : la pastille de l'en-tête et le nombre de l'onglet Demandes
  // se relisent aussi, pour ne pas dire autre chose que la liste.
  const openCount = pending.error ? null : (pending.rows?.length ?? null);
  const lastOpenCount = useRef<number | null>(null);
  useEffect(() => {
    if (openCount === null) return;
    if (lastOpenCount.current !== null && lastOpenCount.current !== openCount) announcePendingChange();
    lastOpenCount.current = openCount;
  }, [openCount]);
  // Un rôle choisi dans la liste attend une confirmation : au clavier ou d'un doigt, on choisit vite un autre rôle par erreur.
  const [draft, setDraft] = useState<{ user: string; role: Role } | null>(null);
  // Après « Confirmer » ou « Annuler », le focus revient à la liste du rôle, une fois l'envoi fini : sinon, il repartirait du haut de la page.
  const [refocus, setRefocus] = useState<string | null>(null);
  // Si la ligne a quitté le filtre (un officier repassé Membre sous « Encadrement »), le focus va au message de réussite.
  useEffect(() => {
    if (refocus === null || action.busy) return;
    (document.getElementById(`role-${refocus}`) ?? document.getElementById("members-done"))?.focus();
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

  // Une case de la vue d'ensemble a demandé un filtre : il s'applique sur toute la liste, sans recherche en cours.
  useEffect(() => {
    if (!ask) return;
    setFilter(ask.filter);
    setSearch("");
    setQuery("");
  }, [ask?.n]);

  // La recherche se fait ici, à chaque lettre, sur la liste déjà lue. Si le serveur a coupé la liste, Entrée la lui confie.
  // Elle s'applique aussi à ce que le serveur renvoie : elle trouve tout ce qu'il trouve (elle ignore en plus les accents et
  // lit le numéro), et, le temps de sa réponse, l'ancienne liste ne s'affiche pas en entier.
  const cut = listMayBeCut(list.rows?.length ?? 0, query);
  const typed = search.trim();
  const found = (list.rows ?? []).filter((m) => matchesSearch(m, typed));
  const counts = filterCounts(found, requests, allies);
  const visible = found.filter((m) => inFilter(m, filter, requests, allies.get(m.number)));
  // Un brouillon de rôle masqué par un filtre n'est plus annoncé : on ne peut pas le confirmer sans le voir.
  const draftShown = drafted !== undefined && visible.includes(drafted);
  const showAll = () => {
    setFilter("all");
    setSearch("");
    setQuery("");
  };

  // La barre reste sous l'en-tête du site, et les titres des colonnes sous la barre : leurs hauteurs sont mesurées, car la
  // barre passe sur deux lignes selon la largeur. Sans mesure possible, les valeurs de la feuille de style restent.
  const root = useRef<HTMLElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = tools.current;
    if (!bar || typeof ResizeObserver !== "function") return;
    const header = document.querySelector<HTMLElement>("header.barre");
    const measure = () => {
      root.current?.style.setProperty("--comptes-outils", `${bar.offsetHeight}px`);
      if (header) root.current?.style.setProperty("--comptes-haut", `${header.offsetHeight}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    if (header) observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);
  // Un filtre choisi plus bas dans la page raccourcit la liste : la page revient au début de la liste, sans mouvement.
  useEffect(() => {
    const mark = top.current;
    const header = document.querySelector<HTMLElement>("header.barre");
    if (!mark) return;
    const gap = mark.getBoundingClientRect().top - (header?.offsetHeight ?? 0);
    // « instant » : sinon, le `scroll-behavior: smooth` de la page ferait glisser la liste à chaque lettre tapée.
    if (gap < 0) window.scrollBy({ top: gap, behavior: "instant" });
  }, [filter, typed]);

  return (
    <section ref={root} class="comptes" aria-labelledby="membres-titre" data-testid="admin-members">
      <PartieTete id="membres-titre" title="Comptes du site" />
      {/* Toujours présente : un lecteur d'écran annonce ce qui change dans une zone qui existait déjà. */}
      {/* Elle dit aussi combien de comptes restent après une lettre tapée ou un filtre choisi (WCAG 4.1.3). */}
      <p class="sr-only" role="status">
        {draft && drafted && draftShown
          ? `Rôle de ${drafted.name} : ${ROLE_LABELS[drafted.role]} → ${ROLE_LABELS[draft.role]}. Confirmez ou annulez.`
          : list.rows !== null && (typed !== "" || filter !== "all")
            ? `${fmtCount(visible.length, "compte")} pour ce choix.`
            : ""}
      </p>
      <div ref={top} />
      <div ref={tools} class="comptes-outils">
        <form
          class="comptes-recherche"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (!cut) return;
            setQuery(typed);
            void pending.reload();
          }}
        >
          <label class="sr-only" for="member-search">
            Rechercher un compte
          </label>
          <input
            id="member-search"
            class="field comptes-champ"
            type="search"
            placeholder="Rechercher un compte"
            autocomplete="off"
            data-testid="member-search"
            value={search}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setSearch(value);
              // Le champ vidé : la liste entière revient, même après une recherche du serveur.
              if (value.trim() === "") setQuery("");
            }}
          />
        </form>
        <div class="comptes-filtres" role="group" aria-label="Filtrer les comptes">
          {MEMBER_FILTERS.map((f) => (
            <button key={f.id} type="button" class="comptes-filtre" data-tone={f.tone ?? undefined} data-testid="member-filter" data-filter={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}{" "}
              {/* « À vérifier » compte les demandes ouvertes : tant qu'elles ne sont pas lues, pas de nombre plutôt qu'un faux zéro. */}
              <span class="comptes-nombre">{list.rows === null || (f.id === "check" && requests === null) ? "" : fmtInt(counts[f.id])}</span>
            </button>
          ))}
        </div>
      </div>
      {cut && (
        <p class="comptes-note" data-testid="members-cut">
          {query ? `Recherche faite dans tous les comptes : « ${query} ». Videz le champ pour revoir la liste.` : `Seuls les ${fmtInt(MEMBERS_LIMIT)} premiers comptes sont lus : la touche Entrée cherche dans tous.`}
        </p>
      )}
      <Problem message={list.error ?? action.error} onRetry={() => void reloadAll()} />
      {!list.error && <Problem message={pending.error ? "Les demandes n'ont pas pu être lues : la colonne Liste ne dit pas si un compte en attente en a une." : null} onRetry={() => void pending.reload()} />}
      <div id="members-done" tabIndex={-1}>
        {action.done && <Success message={action.done} />}
      </div>
      {list.rows === null ? (
        !list.error && (
          <div class="mt-4">
            <Loading />
          </div>
        )
      ) : visible.length === 0 ? (
        <div class="comptes-vide" data-testid="members-empty">
          <p>Aucun compte pour ce choix.</p>
          {(filter !== "all" || typed !== "" || query !== "") && (
            <button type="button" class="comptes-bouton" onClick={showAll}>
              Tout montrer
            </button>
          )}
        </div>
      ) : (
        // Sur téléphone, chaque ligne devient une petite carte (feuille de style) : rien ne défile de côté. Les rôles sont
        // écrits pour que les lecteurs d'écran gardent le tableau quand la feuille de style change son affichage.
        <table class="comptes-table" role="table" aria-label="Comptes">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">
                Compte
              </th>
              <th role="columnheader" scope="col">
                Statut
              </th>
              <th role="columnheader" scope="col">
                Liste
              </th>
              <th role="columnheader" scope="col">
                Rôle
              </th>
              {rank >= 3 && (
                <th role="columnheader" scope="col">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {visible.map((m) => {
              const editable = rank >= 3 && m.status === "validated" && m.role !== "founder" && (rank >= 4 || m.role !== "admin") && m.user_id !== undefined;
              const chosen = draft?.user === m.user_id ? draft.role : null;
              const cell = rosterCell(m, requests);
              // Seulement pour un compte en attente : un ancien allié devenu Gaulois validé garde sa colonne Liste.
              const ally = m.status === "pending" ? allies.get(m.number) : undefined;
              const allyParts = ally ? allyStatusParts(ally) : null;
              const tone = statusTone(m, ally);
              const redo = canRedoRequest(m, rank);
              const suspend = m.status === "validated" && m.role !== "founder" && (rank >= 4 || m.role !== "admin");
              const reinstate = m.status === "suspended";
              return (
                <tr key={m.user_id} role="row" data-tone={tone} data-state={memberState(m, ally)} data-large={redo || chosen ? "" : undefined} data-testid="member-row">
                  <td role="cell" class="comptes-c-compte">
                    <span class="comptes-nom">{m.name}</span>
                    {m.discord_name && (
                      <span class="comptes-discord">
                        <span class="sr-only">Discord : </span>
                        {m.discord_name}
                      </span>
                    )}
                  </td>
                  <td role="cell" class="comptes-c-statut">
                    {allyParts ? (
                      <span data-testid="member-ally">
                        <Pastille tone={tone} testid="member-status">
                          {allyParts.state}
                        </Pastille>
                        <span class="comptes-suite"> · {allyParts.who}</span>
                      </span>
                    ) : (
                      <>
                        <Pastille tone={tone} testid="member-status">
                          {STATUS_LABELS[m.status]}
                        </Pastille>
                        {m.status_reason && <span class="comptes-suite"> : {m.status_reason}</span>}
                      </>
                    )}
                  </td>
                  <td role="cell" class="comptes-c-liste">
                    {/* Dans une carte de téléphone, le titre de la colonne n'est plus au-dessus : le mot est écrit devant. */}
                    <span class="comptes-mot" aria-hidden="true">
                      Liste
                    </span>
                    {/* Un allié n'a pas de demande à faire : la liste officielle de GAL ne le concerne pas. */}
                    <Pastille tone={rosterTone(cell, ally)} plain testid="member-roster">
                      {ally ? "—" : ROSTER_CELL_LABELS[cell]}
                    </Pastille>
                  </td>
                  <td role="cell" class="comptes-c-role">
                    {editable ? (
                      <>
                        <select
                          id={`role-${m.user_id}`}
                          aria-label={`Rôle de ${m.name}`}
                          class="field comptes-choix"
                          data-role={chosen ?? m.role}
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
                          <div class="comptes-confirme" data-testid="role-confirm">
                            <span aria-hidden="true">
                              {ROLE_LABELS[m.role]} → {ROLE_LABELS[chosen]} ?
                            </span>
                            <button
                              type="button"
                              class="comptes-bouton"
                              data-tone="ok"
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
                              class="comptes-bouton"
                              data-tone="muted"
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
                      <span class="comptes-role" data-role={m.role}>
                        {ROLE_LABELS[m.role]}
                      </span>
                    )}
                  </td>
                  {rank >= 3 && (
                    <td role="cell" class="comptes-c-action">
                      {(redo || suspend || reinstate) && (
                        <div class="comptes-actions">
                          {/* Un compte que la liste ne trouve pas : la personne refait sa demande avec son pseudo exact. */}
                          {redo && (
                            <button
                              type="button"
                              class="comptes-bouton"
                              data-tone="warn"
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
                          {suspend && (
                            <button
                              type="button"
                              class="comptes-bouton"
                              data-tone="danger"
                              aria-label={`Suspendre ${m.name}`}
                              disabled={action.busy}
                              onClick={() => {
                                const reason = window.prompt(`Pourquoi suspendre ${m.name} ?`);
                                if (reason) void action.run(() => call("suspend_member", { p_user: m.user_id, p_reason: reason }), `${m.name} est suspendu.`);
                              }}
                            >
                              Suspendre
                            </button>
                          )}
                          {reinstate && (
                            <button type="button" class="comptes-bouton" data-tone="ok" aria-label={`Rétablir ${m.name}`} disabled={action.busy} onClick={() => void action.run(() => call("reinstate_member", { p_user: m.user_id }), `${m.name} est rétabli.`)}>
                              Rétablir
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {roster !== undefined && (
        <p class="comptes-note" data-testid="members-roster-date">
          {roster ? `Liste officielle relue le ${fmtDateTime(roster.read_at)}.` : "La liste officielle n'a encore jamais été relue."}
        </p>
      )}
      <details class="fold mt-4">
        <summary class="font-semibold">Comment lire cette liste</summary>
        <div class="grid gap-3 pb-1 text-muted">
          <p>Vert : en règle. Jaune : en attente, ou à regarder. Rouge : suspendu. Bleu : joueur allié. Gris : rien à faire.</p>
          <p data-testid="members-names-help">
            Un compte s'appelle « Gaulois n° … » jusqu'à sa validation, puis prend son pseudo de la liste officielle. Validé hors de la liste, ou membre sans pseudo public, il garde ce nom.
            {someNotFound && <span data-testid="members-not-found-help">{` ${notFoundHelp(someRedo)}`}</span>}
          </p>
          <p>Vous êtes {ROLE_LABELS[myRole]}. Le serveur revérifie chaque changement.</p>
        </div>
      </details>
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
      <PartieTete id="journal-titre" title="Journal" />
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
