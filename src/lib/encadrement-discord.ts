/**
 * Prévenir l'encadrement, sur un salon Discord privé, des demandes d'adhésion qui attendent. Lancé par la GitHub Action.
 * Le message ne contient ni nom ni identifiant : seulement le nombre de demandes, leur attente et le lien de l'administration.
 * Il part quand une nouvelle demande arrive, puis une fois par jour au plus tant qu'une demande attend depuis plus de 24 h.
 * Au tout premier passage, s'il n'y a aucune demande à annoncer, un message de mise en service part une seule fois :
 * il prouve que le lien du salon marche, sans attendre une vraie demande. Rien la nuit, comme les alertes de place.
 * Depuis le 12 novembre 2026, le serveur annonce lui-même une demande dès son arrivée quand le lien du salon est réglé dans
 * la Direction (migration `20261112000600_demandes_annoncees_aussitot.sql`) ; `staff_digest` compte alors cet avis comme
 * annoncé, et le robot ne le double pas. Il garde la nuit, les rappels, le secret GitHub et les avis que Discord a refusés.
 */
import { QUIET_FROM_HOUR, QUIET_UNTIL_HOUR } from "./alerts";
import { fmtDuration } from "./format";
import { isWebhookUrl } from "./gazette-discord";
import { sourceWords, type LinkSource } from "./salon-lien";
import { parisParts } from "./time";

const HOUR_MS = 3_600_000;
/** Une demande qui attend plus longtemps vaut un rappel. */
export const REMIND_AFTER_HOURS = 24;
/** Au plus un rappel par jour. */
export const REMIND_EVERY_HOURS = 24;

/** Ce que le serveur donne (`staff_digest`) : jamais de nom. */
export interface StaffDigest {
  pending: number;
  oldest_at: string | null;
  newest_id: number | null;
  /** Ce qui a déjà été annoncé. `null` au tout premier passage. */
  notice: StaffNoticeState | null;
  /** Ce que ce passage vient de relire des avis postés par le serveur dès la demande. Absent avant la migration 20261112000600. */
  instant?: { accepted: number; refused: number };
}

/**
 * Les notes (« notice ») du passage sur les avis partis dès la demande, lisibles sans compte GitHub : l'avis du serveur n'en
 * laisse aucune lui-même. Ni nombre, ni nom, ni lien.
 */
export function instantNotes(digest: Pick<StaffDigest, "instant">): string[] {
  const lines: string[] = [];
  if ((digest.instant?.accepted ?? 0) > 0) lines.push("::notice::Encadrement : avis parti dès la demande, accepté par Discord.");
  if ((digest.instant?.refused ?? 0) > 0) lines.push("::notice::Encadrement : avis parti dès la demande, refusé par Discord ou resté sans réponse : il ne compte pas comme annoncé.");
  return lines;
}
export interface StaffNoticeState {
  newest_id: number | null;
  reminded_at: string | null;
}

export type StaffDecision = { send: false; reason: string } | { send: true; kind: "nouvelle" | "rappel" | "service"; text: string; note: StaffNoticeState };

function waiting(pending: number): string {
  return pending === 1 ? "Une demande d'adhésion attend" : `${pending} demandes d'adhésion attendent`;
}

/** Vrai entre 23 h et 8 h à Paris : aucun message à l'encadrement ne part alors. */
export function isQuietHour(now: Date): boolean {
  const hour = parisParts(now).hour;
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

export function staffNotice(digest: StaffDigest, now: Date, siteUrl: string): StaffDecision {
  const quiet = isQuietHour(now);
  // Les demandes se traitent dans la Direction depuis le 12 novembre 2026 ; les anciennes adresses (/admin, /qg#demandes) y mènent aussi.
  const link = `${siteUrl.replace(/\/$/, "")}/direction#demandes`;
  if (digest.pending < 1) {
    // Rien n'a encore jamais été noté : le lien vient d'être posé. Une seule fois, de jour.
    if (digest.notice === null && !quiet) {
      return {
        send: true,
        kind: "service",
        text: `L'avis à l'encadrement est en place : ce salon sera prévenu dans l'heure des demandes d'adhésion qui attendent sur le site du clan, sans aucun nom, et du résultat de chaque sauvegarde chiffrée, jamais entre ${QUIET_FROM_HOUR} h et ${QUIET_UNTIL_HOUR} h. Les demandes se traitent ici : ${link}`,
        note: { newest_id: null, reminded_at: null },
      };
    }
    return { send: false, reason: "aucune demande en attente" };
  }
  if (quiet) return { send: false, reason: `la nuit : le message attend ${QUIET_UNTIL_HOUR} h` };

  const age = digest.oldest_at ? now.getTime() - Date.parse(digest.oldest_at) : 0;
  const old = age > REMIND_AFTER_HOURS * HOUR_MS ? ` La plus ancienne attend depuis ${fmtDuration(age)}.` : "";
  const known = digest.notice?.newest_id ?? null;

  if (digest.newest_id !== null && (known === null || digest.newest_id > known)) {
    return {
      send: true,
      kind: "nouvelle",
      text: `${waiting(digest.pending)} sur le site du clan.${old} À traiter : ${link}`,
      // Un message vaut aussi rappel : le suivant attend au moins un jour.
      note: { newest_id: digest.newest_id, reminded_at: now.toISOString() },
    };
  }

  const reminded = digest.notice?.reminded_at ? Date.parse(digest.notice.reminded_at) : null;
  if (old && (reminded === null || now.getTime() - reminded >= REMIND_EVERY_HOURS * HOUR_MS)) {
    return { send: true, kind: "rappel", text: `Rappel : ${waiting(digest.pending).charAt(0).toLowerCase()}${waiting(digest.pending).slice(1)} sur le site du clan.${old} À traiter : ${link}`, note: { newest_id: known ?? digest.newest_id, reminded_at: now.toISOString() } };
  }
  return { send: false, reason: "rien de nouveau depuis le dernier message" };
}

export interface StaffSendDeps {
  webhook: string | undefined;
  digest: StaffDigest;
  now: Date;
  siteUrl: string;
  fetch: typeof fetch;
  note: (state: StaffNoticeState) => Promise<void>;
  log: (line: string) => void;
  /** D'où vient le lien, pour la note de l'envoi. Une provenance et non un texte : aucun lien ne peut s'y glisser. */
  via?: LinkSource;
}

/**
 * Envoie le message s'il y a lieu, puis note ce qui a été annoncé. Le lien du salon vaut un mot de passe :
 * il n'est écrit dans aucun message, même d'erreur. Un envoi raté n'est pas noté : il repart au passage suivant.
 */
export async function sendStaffNotice({ webhook, digest, now, siteUrl, fetch: post, note, log, via }: StaffSendDeps): Promise<"off" | "invalid" | "quiet" | "sent" | "failed"> {
  const link = webhook?.trim();
  if (!link) {
    log("Pas de lien Discord pour l'encadrement : rien à envoyer.");
    return "off";
  }
  if (!isWebhookUrl(link)) {
    log("::warning::Encadrement : le lien Discord n'a pas la forme attendue, rien n'est envoyé.");
    return "invalid";
  }
  const decision = staffNotice(digest, now, siteUrl);
  if (!decision.send) {
    log(`Encadrement : rien à envoyer (${decision.reason}).`);
    return "quiet";
  }
  if (decision.kind === "service") {
    // Noté avant l'envoi : ce message part une fois au plus, même si l'enregistrement échouait après coup.
    // Si Discord le refuse, son avertissement suffit à signaler un mauvais lien.
    await note(decision.note);
    if (!(await postStaffMessage(link, decision.text, post, log, "Le message de mise en service ne repartira pas : vérifier le lien du salon."))) return "failed";
  } else {
    if (!(await postStaffMessage(link, decision.text, post, log, "Nouvel essai au prochain passage."))) return "failed";
    await note(decision.note);
  }
  // Une note (« notice ») se lit sans compte GitHub, dans les annotations de l'exécution, quand les journaux en demandent un :
  // le 12 novembre 2026, rien ne permettait de dire d'ici si l'avis d'une demande était parti, ni par quel lien.
  log(`::notice::Encadrement : message « ${decision.kind} » envoyé sur Discord${via ? ` (${sourceWords(via)})` : ""}.`);
  return "sent";
}

/**
 * Poste un texte sur le salon de l'encadrement, sans mention : le message ne doit faire sonner personne en particulier.
 * `link` est déjà vérifié par `isWebhookUrl`, et n'est jamais écrit dans le journal. `false` si Discord refuse ou ne répond pas.
 */
export async function postStaffMessage(link: string, text: string, post: typeof fetch, log: (line: string) => void, retry: string): Promise<boolean> {
  try {
    const response = await post(link, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
    });
    if (response.ok) return true;
    log(`::warning::Encadrement : Discord a répondu ${response.status}. ${retry}`);
  } catch {
    log(`::warning::Encadrement : Discord n'a pas répondu. ${retry}`);
  }
  return false;
}
