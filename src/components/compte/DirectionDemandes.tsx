/** L'onglet Demandes de la Direction : les demandes d'adhésion à valider ou refuser. */
import { useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { announcePendingChange } from "../../lib/compte/pending";
import { READY_REASONS, requestWait, requestsSummary } from "../../lib/compte/requests";
import type { RequestRow } from "../../lib/compte/types";
import { fmtDateTime, fmtInt } from "../../lib/format";
import { useAction, useList } from "./AdminPanels";
import { Empty, Loading, Problem, Success, useNow } from "./common";
import { PartieTete } from "./Onglets";

export default function DirectionDemandes() {
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
