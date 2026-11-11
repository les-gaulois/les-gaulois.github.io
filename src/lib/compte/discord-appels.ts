/**
 * Les appels aux salons sur Discord, réglés dans l'espace Direction par les admins et le fondateur. Le serveur poste
 * lui-même chaque nouvel appel par le webhook du salon choisi (migration `20261111000100_appels_sur_discord.sql`), avec la
 * mention du rôle réglé quand l'appel demande un ping (`20261111000200_appels_discord_ping_au_choix.sql`) : la page ne
 * voit jamais le lien, qui permet d'écrire dans le salon. Ici, de quoi vérifier ce qu'on colle avant l'envoi et lire la
 * réponse du serveur sans rien inventer.
 */

/** Un lien de webhook de Discord, tel que le serveur l'accepte (`internal.discord_webhook_of`) : un test compare les deux. */
export const WEBHOOK_PATTERN = "^https://(?:(?:ptb|canary)\\.)?discord(?:app)?\\.com/api/(?:v[0-9]{1,2}/)?webhooks/([0-9]{17,20})/([A-Za-z0-9_-]{20,100})/?(?:\\?\\S*)?$";
/** L'identifiant d'un rôle, seul ou tel que Discord l'écrit (`<@&…>`) : la règle de `internal.discord_role_of`. */
export const ROLE_PATTERN = "^(?:<@&)?([0-9]{17,20})>?$";

const WEBHOOK = new RegExp(WEBHOOK_PATTERN);
const ROLE = new RegExp(ROLE_PATTERN);

/** Le texte collé mène-t-il à un webhook de Discord ? Le serveur refait le contrôle. */
export const isWebhookLink = (text: string): boolean => WEBHOOK.test(text.trim());

/** Ce qu'on a tapé pour le rôle : son identifiant, `null` si c'est vide (personne n'est mentionné), `false` si c'est illisible, son nom par exemple. */
export function roleOf(text: string): string | null | false {
  const value = text.trim();
  if (value === "") return null;
  return ROLE.exec(value)?.[1] ?? false;
}

/** La réponse de pg_net est effacée au bout de six heures : au-delà, le site ne sait plus ce qu'a répondu Discord. */
const RESPONSE_KEPT_MS = 6 * 3_600_000;
/** pg_net envoie en moins d'une seconde d'ordinaire : au-delà d'une minute sans réponse, quelque chose cloche. */
const ANSWER_EXPECTED_MS = 60_000;

/** Où en est le dernier envoi, d'après la réponse que le serveur a gardée. */
export type SendOutcome =
  | { state: "accepted" }
  | { state: "refused"; status: number }
  | { state: "timeout" }
  /** Le message n'a pas pu partir : l'envoi a échoué sur le serveur, ou pg_net n'a pas joint Discord. */
  | { state: "unsent"; detail: string | null }
  /** Moins d'une minute : la réponse de Discord arrive. */
  | { state: "waiting" }
  | { state: "silent" }
  /** Plus de six heures : la réponse n'est plus gardée. */
  | { state: "forgotten" };

export interface LastSend {
  kind: "call" | "test";
  at: string;
  outcome: SendOutcome;
}

export interface DiscordCalls {
  set: boolean;
  /** L'identifiant du rôle mentionné ; `null` : aucun. */
  role: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  last: LastSend | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const timeOf = (value: unknown): number | null => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
const textOf = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

function outcomeOf(raw: Record<string, unknown>, at: number, now: number): SendOutcome {
  const detail = textOf(raw["error"]);
  if (raw["failed"] === true) return { state: "unsent", detail };
  if (raw["answered"] === true) {
    const status = raw["status"];
    if (raw["timed_out"] === true) return { state: "timeout" };
    if (typeof status !== "number" || !Number.isInteger(status)) return { state: "unsent", detail };
    return status >= 200 && status < 300 ? { state: "accepted" } : { state: "refused", status };
  }
  const age = now - at;
  if (age < ANSWER_EXPECTED_MS) return { state: "waiting" };
  return age < RESPONSE_KEPT_MS ? { state: "silent" } : { state: "forgotten" };
}

function lastOf(raw: unknown, now: number): LastSend | null {
  if (!isRecord(raw)) return null;
  const kind = raw["kind"];
  const at = timeOf(raw["at"]);
  if ((kind !== "call" && kind !== "test") || at === null) return null;
  return { kind, at: raw["at"] as string, outcome: outcomeOf(raw, at, now) };
}

/** La réponse de `get_discord_calls`, relue ; l'âge d'un envoi se compte à l'heure du serveur. `null` : réponse illisible. */
export function parseDiscordCalls(raw: unknown): DiscordCalls | null {
  if (!isRecord(raw) || typeof raw["set"] !== "boolean") return null;
  const now = timeOf(raw["now"]);
  if (now === null) return null;
  if (!raw["set"]) return { set: false, role: null, updatedAt: null, updatedBy: null, last: null };
  const role = typeof raw["role"] === "string" && /^[0-9]{17,20}$/.test(raw["role"]) ? raw["role"] : null;
  return {
    set: true,
    role,
    updatedAt: timeOf(raw["updated_at"]) === null ? null : (raw["updated_at"] as string),
    updatedBy: textOf(raw["updated_by"]),
    last: lastOf(raw["last"], now),
  };
}

/** Ce que Discord a répondu, en une phrase. `null` : rien à dire, la réponse n'est plus gardée. */
export function outcomeSentence(last: LastSend): string | null {
  const { outcome } = last;
  switch (outcome.state) {
    case "accepted":
      return last.kind === "test" ? "Discord a accepté l'essai : il est dans le salon." : "Discord a accepté le message.";
    case "refused":
      if (outcome.status === 404) return "Discord ne connaît pas ce lien : le webhook a sans doute été supprimé. Collez le lien d'un nouveau webhook.";
      if (outcome.status === 401 || outcome.status === 403) return `Discord refuse ce lien (erreur ${outcome.status}). Collez le lien d'un nouveau webhook.`;
      if (outcome.status === 400) return "Discord refuse le message (erreur 400). C'est souvent un salon de type forum : choisissez un salon textuel ordinaire.";
      if (outcome.status === 429) return "Discord a reçu trop de messages et demande d'attendre (erreur 429).";
      if (outcome.status >= 500) return `Discord ne répond pas correctement pour l'instant (erreur ${outcome.status}).`;
      return `Discord refuse le message (erreur ${outcome.status}).`;
    case "timeout":
      return "Discord n'a pas répondu à temps.";
    case "unsent":
      return `Le message n'a pas pu partir du serveur${outcome.detail ? ` : ${outcome.detail}` : ""}.`;
    case "waiting":
      return "En attente de la réponse de Discord…";
    case "silent":
      return "Discord n'a pas répondu.";
    case "forgotten":
      return null;
  }
}

/** « Dernier envoi : l'essai, le 11 nov. 2026 à 14:02. Discord a accepté l'essai : il est dans le salon. » `when` écrit la date. */
export function lastSendSentence(last: LastSend, when: (iso: string) => string): string {
  const head = `Dernier envoi : ${last.kind === "test" ? "l'essai" : "un appel"}, le ${when(last.at)}.`;
  const outcome = outcomeSentence(last);
  return outcome === null ? head : `${head} ${outcome}`;
}

/** La réponse de Discord est attendue : la page relit le réglage dans un instant. */
export const isWaiting = (state: DiscordCalls | null): boolean => state?.last?.outcome.state === "waiting";
