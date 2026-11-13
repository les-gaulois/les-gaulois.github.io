/**
 * Les salons Discord du robot, réglés dans l'espace Direction par les admins et le fondateur (migration
 * `20261111000300_salons_discord.sql`) : le salon des nouvelles et celui de l'encadrement, puis celui des victoires (migration
 * `20261111000500_salon_des_victoires.sql`). Le robot de la GitHub Action y poste avec le lien réglé ici, sinon avec le secret
 * GitHub ; à chaque passage, il demande à Discord si le webhook existe, sans rien poster, et note la réponse. La page ne voit
 * jamais le lien. Ici, de quoi relire la réponse du serveur sans rien inventer.
 */
import { lastSendSentence, outcomeSentence, type LastSend, type SendOutcome } from "./discord-appels";

export type RobotSalonId = "nouvelles" | "encadrement" | "victoires" | "alliance";

export interface RobotSalonText {
  id: RobotSalonId;
  title: string;
  intro: string;
  /**
   * Le secret GitHub qui sert quand rien n'est réglé ici, et en secours si Supabase ne répond pas. `null` : un salon où
   * poste le serveur lui-même, sans robot ni secret ; sans lien réglé ici, rien n'y part.
   */
  secret: string | null;
  /** Ce que le secret ne fait pas, dit quand rien n'est réglé ici. */
  secretNote?: string;
  /** Ajouté après les autres : un serveur sans sa migration ne le rend pas, et la page ne le montre pas. */
  optional?: boolean;
}

export const ROBOT_SALON_TEXTS: readonly RobotSalonText[] = [
  {
    id: "nouvelles",
    title: "Le salon des nouvelles",
    intro: "La gazette, les alertes, les paliers franchis, les messages du jour et la course du soir, postés par le robot du site.",
    secret: "DISCORD_WEBHOOK_GAZETTE",
  },
  {
    id: "encadrement",
    title: "Le salon de l'encadrement",
    // Le 12 novembre 2026, le pilote n'avait rien vu arriver dans le salon voulu et cherchait où le régler : l'intro dit ce qui
    // part, et quand. Le serveur annonce une demande dès son arrivée avec le lien réglé ici (migration
    // 20261112000600_demandes_annoncees_aussitot.sql) ; avec le seul secret, c'est le robot horaire, dans l'heure.
    intro: "Chaque nouvelle demande d'adhésion, jour et nuit, dès son arrivée ou dans l'heure, un rappel par jour pour une demande qui attend plus de 24 h, et le compte rendu des sauvegardes. Sans aucun nom : choisissez un salon privé de l'encadrement.",
    secret: "DISCORD_WEBHOOK_ENCADREMENT",
    secretNote: "Avec ce secret, une demande n'est annoncée qu'au passage du robot, dans l'heure : collez le lien ici pour qu'elle le soit dès son arrivée.",
  },
  {
    id: "victoires",
    title: "Le salon des victoires",
    intro: "Chaque victoire du clan, avec l'image de la carte et tous les Gaulois de la partie, postée par le robot du site peu après la partie, jour et nuit : une quarantaine de messages par jour. Prenez un salon à part.",
    secret: "DISCORD_WEBHOOK_VICTOIRES",
    optional: true,
  },
  {
    // Migration 20261113001000 : le serveur y poste lui-même chaque zone nouvelle (dessinée par l'encadrement ou par un
    // allié) et chaque changement d'état, dix au plus en dix minutes. Les alliés d'autres pays le lisent : les messages sont
    // en français et en anglais.
    id: "alliance",
    title: "Le salon de l'alliance",
    intro: "Chaque zone nouvelle de la carte de l'alliance, et chaque zone dont l'état change (à prendre, en cours, tenue, abandonnée), en français et en anglais, avec le lien de la carte. Sans mention. Prenez un salon que lisent les alliés.",
    secret: null,
    optional: true,
  },
];

/** Le dernier contrôle du robot : d'où venait le lien, et ce que Discord a répondu (0 : pas de réponse). */
export interface RobotCheck {
  at: string;
  source: "direction" | "secret" | "none";
  status: number | null;
  name: string | null;
}

export interface RobotSalon {
  id: RobotSalonId;
  set: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Le dernier essai envoyé par le serveur. */
  last: LastSend | null;
  check: RobotCheck | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const timeOf = (value: unknown): number | null => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
const textOf = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** La réponse de pg_net est effacée au bout de six heures, et pg_net envoie en moins d'une seconde d'ordinaire. */
const RESPONSE_KEPT_MS = 6 * 3_600_000;
const ANSWER_EXPECTED_MS = 60_000;

/** Même lecture que pour les appels : la réponse gardée par le serveur, ou l'attente, ou l'oubli. */
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
  const at = timeOf(raw["at"]);
  if (raw["kind"] !== "test" || at === null) return null;
  return { kind: "test", at: raw["at"] as string, outcome: outcomeOf(raw, at, now) };
}

function checkOf(raw: unknown): RobotCheck | null {
  if (!isRecord(raw)) return null;
  const at = timeOf(raw["at"]);
  const source = raw["source"];
  if (at === null || (source !== "direction" && source !== "secret" && source !== "none")) return null;
  const status = raw["status"];
  return {
    at: raw["at"] as string,
    source,
    status: typeof status === "number" && Number.isInteger(status) && status >= 0 && status <= 599 ? status : null,
    name: textOf(raw["name"]),
  };
}

/**
 * La réponse de `get_discord_salons`, relue ; l'âge d'un essai se compte à l'heure du serveur. `null` : réponse illisible.
 * Un salon ajouté après les autres (`optional`) peut manquer : le serveur n'a pas encore sa migration, la page s'en passe.
 */
export function parseDiscordSalons(raw: unknown): RobotSalon[] | null {
  if (!isRecord(raw) || !Array.isArray(raw["salons"])) return null;
  const now = timeOf(raw["now"]);
  if (now === null) return null;
  const salons: RobotSalon[] = [];
  for (const text of ROBOT_SALON_TEXTS) {
    const row = raw["salons"].find((item): item is Record<string, unknown> => isRecord(item) && item["salon"] === text.id);
    if (!row && text.optional) continue;
    if (!row || typeof row["set"] !== "boolean") return null;
    salons.push({
      id: text.id,
      set: row["set"],
      updatedAt: row["set"] && timeOf(row["updated_at"]) !== null ? (row["updated_at"] as string) : null,
      updatedBy: row["set"] ? textOf(row["updated_by"]) : null,
      last: row["set"] ? lastOf(row["last"], now) : null,
      check: checkOf(row["check"]),
    });
  }
  return salons;
}

/** Ce que l'essai a donné, en une phrase : comme pour les appels. */
export const testSentence = (last: LastSend, when: (iso: string) => string) => lastSendSentence(last, when);

/** « le webhook « Le Gaulois » » ou « le webhook ». */
const webhookWords = (name: string | null) => (name ? `le webhook « ${name} »` : "le webhook");

/**
 * Le dernier contrôle du robot, en une phrase. Il dit d'où venait le lien et ce que Discord a répondu, sans inventer :
 * un statut inconnu n'est pas une réussite.
 */
export function checkSentence(check: RobotCheck, salon: RobotSalonText, when: (iso: string) => string): string {
  const head = `Contrôle du robot, le ${when(check.at)}`;
  if (check.source === "none") return `${head} : aucun lien${salon.secret ? `, ni ici ni dans le secret GitHub ${salon.secret}` : ""}. Rien ne part dans ce salon.`;
  // La carte nomme déjà le secret quand rien n'est réglé ici : la phrase reste courte, et se coupe mieux sur téléphone.
  const from = check.source === "secret" ? " (lien du secret GitHub)" : "";
  if (check.status === null) return `${head}${from} : le lien n'a pas la forme d'un webhook de Discord. Collez le lien d'un nouveau webhook.`;
  if (check.status === 0) return `${head}${from} : Discord n'a pas répondu.`;
  if (check.status >= 200 && check.status < 300) return `${head}${from} : ${webhookWords(check.name)} répond.`;
  // Le contrôle ne fait que lire le webhook : aucun message n'est posté, donc pas de « salon de type forum » ici.
  if (check.status === 404) return `${head}${from} : Discord ne connaît pas ce lien : le webhook a sans doute été supprimé. Collez le lien d'un nouveau webhook.`;
  if (check.status === 400 || check.status === 401 || check.status === 403) return `${head}${from} : Discord refuse ce lien (erreur ${check.status}). Collez le lien d'un nouveau webhook.`;
  const other = outcomeSentence({ kind: "test", at: check.at, outcome: { state: "refused", status: check.status } });
  return `${head}${from} : ${other ?? `Discord a répondu ${check.status}.`}`;
}

/** Le contrôle annonce-t-il un lien que Discord ne connaît pas, ou mal formé ? La page le met alors en avant. */
export const checkFails = (check: RobotCheck | null): boolean => check !== null && check.source !== "none" && (check.status === null || check.status === 400 || check.status === 401 || check.status === 403 || check.status === 404);

/** Un essai attend la réponse de Discord : la page relit le réglage dans un instant. */
export const isSalonWaiting = (salons: readonly RobotSalon[] | null): boolean => salons?.some((s) => s.last?.outcome.state === "waiting") ?? false;
