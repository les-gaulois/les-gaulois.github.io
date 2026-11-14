/**
 * L'onglet Demandes de la Direction : les demandes d'adhésion à valider ou refuser.
 *
 * Une ligne par demande, comme dans l'onglet Comptes : le trait au bord et la pastille disent si le pseudo est dans la liste
 * officielle (vert) ou non (rouge), l'attente passe en jaune au-delà de deux jours (`requestWait`). La raison, facultative,
 * ne prend de la place que lorsqu'on ouvre « Raison ». Les textes et les couleurs sont dans `src/lib/compte/requests.ts`, le
 * dessin dans `global.css`, section « Direction, onglet Demandes ».
 *
 * `list.reload` peut être appelé de l'extérieur (relecture automatique) : les raisons écrites et les champs ouverts sont rangés
 * par numéro de demande, hors de la liste, et survivent à une relecture ; seule une demande qui a quitté la liste perd le sien.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { announcePendingChange } from "../../lib/compte/pending";
import {
  LATE_REQUEST_HOURS,
  READY_REASONS,
  decisionMessage,
  dropDraft,
  gameRoleLabel,
  keepDrafts,
  reasonToggleLabel,
  requestDetails,
  requestTone,
  requestWait,
  requestWho,
  requestsSummary,
  rosterDetail,
  rosterLabel,
  rosterLine,
  type RosterRead,
} from "../../lib/compte/requests";
import type { RequestRow } from "../../lib/compte/types";
import { useAction, useList } from "./AdminPanels";
import { Loading, useNow } from "./common";
import { Pastille } from "./direction-kit";
import { PartieTete } from "./Onglets";

/**
 * Vrai si le focus est resté sur la ligne de la demande (`line`, prise avant l'envoi) ou s'est perdu : nulle part, sur un
 * bouton grisé pendant l'envoi, ou retombé sur un cadre (un second clic sur un bouton grisé le donne à la partie). Faux s'il
 * est sur un champ ou un bouton ailleurs : on y est allé pendant l'envoi.
 */
function focusStayedOn(line: Element | null): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  if (active instanceof HTMLButtonElement && active.disabled) return true;
  if (line && (line.contains(active) || active.contains(line))) return true;
  return !active.matches("input, textarea, select, button, a[href], summary, [contenteditable]");
}

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
  // La demande en cours d'envoi. La référence arrête un second clic avant même que l'écran n'ait grisé les boutons.
  const sending = useRef(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  // À l'ouverture, le focus va au champ ; après une décision, au message (la ligne traitée a quitté la liste) ou au refus du
  // serveur ; Échap dans le champ le rend au bouton « Raison ».
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (focus === null) return;
    document.getElementById(focus)?.focus();
    setFocus(null);
  }, [focus]);
  // Une demande qui a quitté la liste, traitée ici ou par un autre officier, emporte son brouillon.
  useEffect(() => {
    if (!list.rows) return;
    const ids = list.rows.map((r) => r.id);
    setReasons((all) => keepDrafts(all, ids));
    setOpen((all) => keepDrafts(all, ids));
  }, [list.rows]);
  // `undefined` tant que le serveur n'a pas répondu : on ne dit alors rien de la liste officielle.
  const roster = rosterLine(list.extra["roster"] as RosterRead | null | undefined);
  const now = useNow();
  // Le serveur les donne de la plus ancienne à la plus récente.
  const oldest = list.rows?.[0] ? requestWait(list.rows[0].created_at, now) : null;
  const problem = list.error ?? action.error;

  const decide = async (r: RequestRow, approve: boolean) => {
    if (sending.current) return;
    sending.current = true;
    setSendingId(r.id);
    const line = document.getElementById(`raison-${r.id}`)?.closest("li") ?? null;
    const outcome = { accepted: false };
    try {
      await action.run(async () => {
        await call("review_membership", { p_request: r.id, p_approve: approve, p_reason: reasons[r.id] || null });
        outcome.accepted = true;
      }, decisionMessage(requestWho(r), approve));
    } finally {
      sending.current = false;
      setSendingId(null);
    }
    if (outcome.accepted) {
      setReasons((all) => dropDraft(all, r.id));
      setOpen((all) => dropDraft(all, r.id));
    }
    // Les zones s'annoncent d'elles-mêmes ; le focus n'y va que s'il était resté sur cette demande (ou s'est perdu avec son
    // bouton grisé) : il n'est jamais arraché à un champ où l'on a commencé à écrire pendant l'envoi.
    if (focusStayedOn(line)) setFocus(outcome.accepted ? "requests-done" : "requests-problem");
  };

  const closeReason = (id: number) => {
    setOpen((all) => ({ ...all, [id]: false }));
    setFocus(`reason-toggle-${id}`);
  };

  return (
    <section class="dir-demandes" aria-labelledby="demandes-titre" data-testid="admin-requests">
      <PartieTete id="demandes-titre" title="Demandes d'adhésion">
        {roster && (
          <p data-testid="requests-roster-date">
            {roster.never ? <span class="text-warn">{roster.text}</span> : roster.text} Cette liste est publique : y figurer ne prouve pas qu'on est ce membre. Vérifiez sur Discord.
          </p>
        )}
      </PartieTete>
      {/* Les deux zones existent avant leur message : un lecteur d'écran l'annonce quand elle se remplit. */}
      <div id="requests-problem" class="dir-demandes-zone" role="alert" tabIndex={-1} data-testid="requests-problem">
        {problem && (
          <p class="form-problem">
            {problem}{" "}
            <button type="button" class="underline" onClick={() => void list.reload()}>
              Réessayer
            </button>
          </p>
        )}
      </div>
      <div id="requests-done" class="dir-demandes-zone" role="status" tabIndex={-1}>
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
              const who = requestWho(r);
              const reason = reasons[r.id] ?? "";
              const shown = open[r.id] === true;
              const toggle = reasonToggleLabel(shown, reason);
              const gameRole = gameRoleLabel(r.game_role);
              const inFlight = sendingId === r.id;
              return (
                <li key={r.id} class="dir-ligne dir-demandes-ligne" data-dir-ton={requestTone(r)} data-testid="request-row" aria-busy={inFlight || undefined}>
                  <div class="dir-demandes-qui">
                    <p class="dir-demandes-nom">{who}</p>
                    <p class="dir-demandes-meta tnum">{requestDetails(r)}</p>
                  </div>
                  <div class="dir-demandes-controle">
                    <p data-testid="request-roster">
                      <Pastille ton={requestTone(r)}>{rosterLabel(r)}</Pastille> <span class="dir-demandes-pseudo">{rosterDetail(r)}</span>
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
                    <button type="button" class="dir-bouton dir-demandes-oui" data-dir-ton="ok" disabled={action.busy} aria-label={`Valider ${who}`} onClick={() => void decide(r, true)}>
                      Valider
                    </button>
                    {/* Gris tant qu'on ne le vise pas : six boutons rouges feraient un mur. */}
                    <button type="button" class="dir-bouton dir-demandes-non" data-dir-ton="muted" disabled={action.busy} aria-label={`Refuser ${who}`} onClick={() => void decide(r, false)}>
                      Refuser
                    </button>
                    <button
                      id={`reason-toggle-${r.id}`}
                      type="button"
                      class="dir-bouton"
                      data-dir-ton={toggle === "Raison écrite" ? "ally" : "muted"}
                      disabled={inFlight}
                      aria-expanded={shown}
                      aria-controls={`raison-${r.id}`}
                      aria-label={`${toggle}, ${who}`}
                      data-testid="request-reason-toggle"
                      onClick={() => {
                        setOpen((all) => ({ ...all, [r.id]: !shown }));
                        if (!shown) setFocus(`reason-${r.id}`);
                      }}
                    >
                      {toggle}
                    </button>
                  </div>
                  {r.note && (
                    <p class="dir-demandes-mot" data-testid="request-note">
                      « {r.note} »
                    </p>
                  )}
                  <div
                    id={`raison-${r.id}`}
                    class="dir-demandes-raison"
                    hidden={!shown}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return;
                      e.preventDefault();
                      closeReason(r.id);
                    }}
                  >
                    <label class="dir-demandes-libelle" for={`reason-${r.id}`}>
                      Raison (facultative)
                    </label>
                    {/* En lecture seule pendant l'envoi : ce qui est écrit est ce qui part. */}
                    <input id={`reason-${r.id}`} class="field dir-champ" maxLength={300} value={reason} readOnly={inFlight} onInput={(e) => setReasons((all) => ({ ...all, [r.id]: e.currentTarget.value }))} />
                    {/* Remplit le champ sans rien envoyer : la raison d'un refus est montrée telle quelle au membre. */}
                    <div class="dir-demandes-pretes" role="group" aria-labelledby={`ready-${r.id}`}>
                      <span id={`ready-${r.id}`} class="text-sm text-muted">
                        Pour un refus :
                      </span>
                      {READY_REASONS.map((ready) => (
                        <button key={ready} type="button" class="dir-bouton" data-dir-ton="muted" disabled={inFlight} onClick={() => setReasons((all) => ({ ...all, [r.id]: ready }))}>
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
