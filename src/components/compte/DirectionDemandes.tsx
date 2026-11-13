/**
 * L'onglet Demandes de la Direction : les demandes d'adhésion à valider ou refuser.
 *
 * Une ligne par demande, comme dans l'onglet Comptes : le trait au bord et la pastille disent si le pseudo est dans la liste
 * officielle (vert) ou non (rouge), l'attente passe en jaune au-delà de deux jours (`requestWait`). La raison, facultative,
 * ne prend de la place que lorsqu'on ouvre « Raison ». Le dessin est dans `global.css`, section « Direction, onglet Demandes ».
 */
import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { announcePendingChange } from "../../lib/compte/pending";
import { LATE_REQUEST_HOURS, READY_REASONS, requestWait, requestsSummary } from "../../lib/compte/requests";
import type { RequestRow } from "../../lib/compte/types";
import { fmtDateTime, fmtInt } from "../../lib/format";
import { useAction, useList } from "./AdminPanels";
import { Loading, Problem, useNow } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

/** Le rang dans le jeu, quand il aide à décider. Un simple membre n'a pas de mention. */
const GAME_ROLES: Record<string, string> = { leader: "Chef dans le jeu", officer: "Officier dans le jeu" };

export default function DirectionDemandes() {
  const list = useList<RequestRow>("list_membership_requests");
  // La pastille de l'en-tête et le nombre de l'onglet suivent : une demande traitée ici n'y compte plus.
  const action = useAction(async () => {
    announcePendingChange();
    await list.reload();
  });
  const [reasons, setReasons] = useState<Record<number, string>>({});
  // Les demandes dont le champ « Raison » est ouvert. Fermé, il garde son texte, et le bouton le dit (« Raison écrite »).
  const [open, setOpen] = useState<Record<number, boolean>>({});
  // À l'ouverture, le focus va au champ ; après une décision, au message : la ligne traitée a quitté la liste.
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (focus === null || action.busy) return;
    document.getElementById(focus)?.focus();
    setFocus(null);
  }, [focus, action.busy]);
  const roster = list.extra["roster"] as { total: number; read_at: string } | null | undefined;
  const now = useNow();
  // Le serveur les donne de la plus ancienne à la plus récente.
  const oldest = list.rows?.[0] ? requestWait(list.rows[0].created_at, now) : null;

  const decide = (r: RequestRow, who: string, approve: boolean) => {
    void action.run(() => call("review_membership", { p_request: r.id, p_approve: approve, p_reason: reasons[r.id] || null }), approve ? `Membre validé : ${who}.` : `Demande refusée : ${who}.`).then(() => setFocus("requests-done"));
  };

  return (
    <section class="dir-demandes" aria-labelledby="demandes-titre" data-testid="admin-requests">
      <PartieTete id="demandes-titre" title="Demandes d'adhésion">
        <p data-testid="requests-roster-date">
          {roster ? `Liste officielle relue le ${fmtDateTime(roster.read_at)} : ${fmtInt(roster.total)} ${roster.total > 1 ? "membres" : "membre"}.` : <span class="text-warn">La liste officielle n'a encore jamais été relue : aucun contrôle automatique pour l'instant.</span>} Cette liste est publique : y figurer ne prouve pas qu'on est ce membre. Vérifiez sur Discord.
        </p>
      </PartieTete>
      <Problem message={list.error ?? action.error} onRetry={() => void list.reload()} />
      {/* La zone existe avant le message : un lecteur d'écran l'annonce quand elle se remplit. */}
      <div id="requests-done" class="dir-demandes-fait" role="status" tabIndex={-1}>
        {action.done && <p class="form-success">{action.done}</p>}
      </div>
      {list.rows === null ? (
        !list.error && (
          <div class="mt-4">
            <Loading />
          </div>
        )
      ) : list.rows.length === 0 ? (
        <p class="mt-4" data-testid="requests-empty">
          <Pastille ton="ok">Aucune demande en attente</Pastille>
        </p>
      ) : (
        <>
          {oldest && (
            <p class={`dir-demandes-resume ${oldest.late ? "font-semibold text-warn" : "text-muted"}`} data-testid="requests-summary">
              {requestsSummary(list.rows.length, oldest)}
            </p>
          )}
          <ul class="dir-liste">
            {list.rows.map((r) => {
              const wait = requestWait(r.created_at, now);
              const who = r.discord_name ?? r.name;
              const reason = reasons[r.id] ?? "";
              const shown = open[r.id] === true;
              const gameRole = r.game_role ? GAME_ROLES[r.game_role] : undefined;
              return (
                <li key={r.id} class="dir-ligne dir-demandes-ligne" data-dir-ton={r.in_roster ? "ok" : "danger"} data-testid="request-row">
                  <div class="dir-demandes-qui">
                    <p class="dir-demandes-nom">{who}</p>
                    <p class="dir-demandes-meta tnum">
                      {r.discord_name ? `${r.name} · ` : ""}
                      {r.discord_id ? `Discord : ${r.discord_id} · ` : ""}demandé le {fmtDateTime(r.created_at)}
                    </p>
                  </div>
                  <div class="dir-demandes-controle">
                    <p data-testid="request-roster">
                      <Pastille ton={r.in_roster ? "ok" : "danger"}>{r.in_roster ? "Dans la liste" : "Absent de la liste"}</Pastille>{" "}
                      <span class="dir-demandes-pseudo">{r.in_roster ? (r.roster_username ?? "membre sans pseudo public") : r.claimed_text ? `a indiqué « ${r.claimed_text} »` : ""}</span>
                    </p>
                    {gameRole && (
                      <p>
                        <Pastille ton="ally" plain testid="request-game-role">
                          {gameRole}
                        </Pastille>
                      </p>
                    )}
                  </div>
                  <p class="dir-demandes-attente tnum">
                    <Pastille ton={wait.late ? "warn" : "muted"} plain testid="request-wait">
                      depuis {wait.short}
                    </Pastille>
                  </p>
                  <div class="dir-demandes-actions">
                    <button type="button" class="dir-bouton dir-demandes-oui" data-dir-ton="ok" disabled={action.busy} aria-label={`Valider ${who}`} onClick={() => decide(r, who, true)}>
                      Valider
                    </button>
                    {/* Gris tant qu'on ne le vise pas : six boutons rouges feraient un mur. */}
                    <button type="button" class="dir-bouton dir-demandes-non" data-dir-ton="muted" disabled={action.busy} aria-label={`Refuser ${who}`} onClick={() => decide(r, who, false)}>
                      Refuser
                    </button>
                    <button
                      type="button"
                      class="dir-bouton"
                      data-dir-ton={!shown && reason ? "ally" : "muted"}
                      aria-expanded={shown}
                      aria-controls={`raison-${r.id}`}
                      aria-label={`${!shown && reason ? "Raison écrite" : "Raison"}, ${who}`}
                      data-testid="request-reason-toggle"
                      onClick={() => {
                        setOpen({ ...open, [r.id]: !shown });
                        if (!shown) setFocus(`reason-${r.id}`);
                      }}
                    >
                      {!shown && reason ? "Raison écrite" : "Raison"}
                    </button>
                  </div>
                  {r.note && (
                    <p class="dir-demandes-mot" data-testid="request-note">
                      « {r.note} »
                    </p>
                  )}
                  <div id={`raison-${r.id}`} class="dir-demandes-raison" hidden={!shown}>
                    <label class="dir-demandes-libelle" for={`reason-${r.id}`}>
                      Raison (facultative)
                    </label>
                    <input id={`reason-${r.id}`} class="field dir-champ" maxLength={300} value={reason} onInput={(e) => setReasons({ ...reasons, [r.id]: e.currentTarget.value })} />
                    {/* Remplit le champ sans rien envoyer : la raison d'un refus est montrée telle quelle au membre. */}
                    <div class="dir-demandes-pretes" role="group" aria-labelledby={`ready-${r.id}`}>
                      <span id={`ready-${r.id}`} class="text-sm text-muted">
                        Pour un refus :
                      </span>
                      {READY_REASONS.map((ready) => (
                        <button key={ready} type="button" class="dir-bouton" data-dir-ton="muted" onClick={() => setReasons({ ...reasons, [r.id]: ready })}>
                          {ready}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <details class="fold mt-4">
            <summary class="font-semibold">Comment lire cette liste</summary>
            <div class="grid gap-3 pb-1 text-muted">
              <p>
                Vert : le pseudo est dans la liste officielle. Rouge : il n'y est pas. Jaune : la demande attend depuis plus de {LATE_REQUEST_HOURS} heures. Bleu : le rang dans le jeu.
              </p>
              <p>Le rang dans le jeu vient de la liste publique. Il ne donne aucun droit ici : à vous de le nommer après vérification.</p>
              <p>La raison est facultative. Celle d'un refus est montrée telle quelle au membre, dans « Mon compte ».</p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
