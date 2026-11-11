/**
 * Le lien des salons où poste le robot de la GitHub Action. Depuis le 11 novembre 2026, il se règle dans l'espace
 * Direction, onglet Discord (migration `20261111000300_salons_discord.sql`) ; sans réglage, le robot garde le secret
 * GitHub, comme avant.
 * - Le salon des nouvelles : la gazette, les alertes, les paliers, les messages du jour et la course du soir.
 * - Le salon de l'encadrement : les demandes qui attendent et le compte rendu des sauvegardes.
 * - Le salon des victoires, depuis le 11 novembre 2026 (migration `20261111000500_salon_des_victoires.sql`) : chaque victoire du
 *   clan, avec l'image de la carte. Un serveur sans cette migration ne le connaît pas : le robot prend alors son secret.
 * À chaque passage, le robot lit aussi chaque webhook sans rien poster (`probeWebhook`) et note la réponse de Discord pour
 * l'espace Direction : un webhook supprimé s'y voit.
 * Le lien vaut un mot de passe pour le salon : il n'est écrit dans aucun journal, même d'erreur.
 */
import { isWebhookUrl } from "./gazette-discord";

export type RobotSalon = "nouvelles" | "encadrement" | "victoires";
export const ROBOT_SALONS: readonly RobotSalon[] = ["nouvelles", "encadrement", "victoires"];

/** Le secret GitHub de chaque salon, qui sert quand rien n'est réglé dans la Direction. */
export const SALON_SECRETS: Record<RobotSalon, string> = { nouvelles: "DISCORD_WEBHOOK_GAZETTE", encadrement: "DISCORD_WEBHOOK_ENCADREMENT", victoires: "DISCORD_WEBHOOK_VICTOIRES" };

/** « Salon des nouvelles », pour le journal de l'Action. */
export const SALON_LABELS: Record<RobotSalon, string> = { nouvelles: "Salon des nouvelles", encadrement: "Salon de l'encadrement", victoires: "Salon des victoires" };

/** D'où vient le lien : réglé dans la Direction, secret GitHub, ou aucun. */
export type LinkSource = "direction" | "secret" | "none";

export interface SalonLink {
  link: string | null;
  source: LinkSource;
  /** Les liens de la Direction n'ont pas pu être lus : le secret a servi. Jamais le lien lui-même. */
  warning: string | null;
}

/** Les liens réglés dans la Direction, salon par salon. `null` pour un salon : rien de réglé. Absent : le serveur ne connaît pas ce salon. */
export type DirectionLinks = Partial<Record<RobotSalon, string | null>>;

/** Lit `robot_discord_salons` avec la clé de service. Lève une erreur si le serveur refuse ou ne répond pas. */
export type DirectionCall = (url: string, key: string) => Promise<unknown>;

/** Le lien de la Direction d'abord, sinon le secret. Un copier-coller peut laisser une espace autour du secret. */
export function chooseLink(salon: RobotSalon, direction: DirectionLinks | null, secret: string | undefined): Omit<SalonLink, "warning"> {
  const fromDirection = direction?.[salon]?.trim();
  if (fromDirection) return { link: fromDirection, source: "direction" };
  const fromSecret = secret?.trim();
  if (fromSecret) return { link: fromSecret, source: "secret" };
  return { link: null, source: "none" };
}

/** Un message d'erreur qui ne peut pas contenir de lien de webhook. */
const safeMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "…").slice(0, 160);

/**
 * Au-delà, Supabase est tenu pour absent : le secret sert. Sans ce délai, un serveur muet ferait attendre chaque étape
 * Discord jusqu'à son propre délai, sans rien envoyer, et le passage du robot pourrait être coupé avant de publier le site.
 */
export const DIRECTION_TIMEOUT_MS = 10_000;

/** La promesse, ou une erreur si elle dépasse `ms`. Le minuteur est toujours arrêté : il ne retient pas le script. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`pas de réponse en ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** L'appel du robot : supabase-js, chargé seulement ici, comme dans les autres scripts qui parlent à Supabase. La requête est coupée à temps. */
const callSupabase: DirectionCall = async (url, key) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("robot_discord_salons").abortSignal(AbortSignal.timeout(DIRECTION_TIMEOUT_MS));
  if (error) throw new Error(error.message);
  return data;
};

/**
 * Les liens réglés dans la Direction. Sans `SUPABASE_URL` ni clé de service, rien à lire. Une panne, ou une fonction
 * absente parce que la migration n'est pas installée, rend `null` avec un avertissement : le secret GitHub sert alors.
 */
export async function readDirectionLinks(url: string | undefined, key: string | undefined, call: DirectionCall = callSupabase): Promise<{ links: DirectionLinks | null; warning: string | null }> {
  if (!url || !key) return { links: null, warning: null };
  try {
    const data = await withTimeout(call(url, key), DIRECTION_TIMEOUT_MS);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return { links: null, warning: "réponse illisible du serveur pour les liens de la Direction : le secret GitHub sert de lien" };
    const record = data as Record<string, unknown>;
    const links: DirectionLinks = {};
    for (const salon of ROBOT_SALONS) {
      // Un salon que le serveur ne rend pas lui est inconnu : sa migration n'est pas encore installée.
      if (!Object.hasOwn(record, salon)) continue;
      const value = record[salon];
      links[salon] = typeof value === "string" && isWebhookUrl(value) ? value : null;
    }
    return { links, warning: null };
  } catch (e) {
    return { links: null, warning: `liens de la Direction illisibles (${safeMessage(e)}) : le secret GitHub sert de lien` };
  }
}

/** Le lien d'un salon pour un script du robot, lu dans l'environnement de l'Action. */
export async function salonLink(salon: RobotSalon, env: Record<string, string | undefined> = process.env, call: DirectionCall = callSupabase): Promise<SalonLink> {
  const { links, warning } = await readDirectionLinks(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"], call);
  return { ...chooseLink(salon, links, env[SALON_SECRETS[salon]]), warning };
}

/** « réglé dans la Direction », pour le journal de l'Action. */
export const sourceWords = (source: LinkSource) => (source === "direction" ? "lien réglé dans la Direction" : source === "secret" ? "lien du secret GitHub" : "aucun lien");

/* ---------- Le contrôle du passage ---------- */

/** Les réponses d'un lien faux ou d'un webhook supprimé, lues comme sur l'onglet Discord de la Direction (`checkFails`). */
const UNKNOWN_LINK = [400, 401, 403, 404];

/** Le nom du webhook, réduit aux lettres, chiffres et ponctuation simple : il ne peut rien glisser dans un journal. */
export const safeWebhookName = (name: unknown) => (typeof name === "string" ? name.replace(/[^\p{L}\p{N} '’.-]/gu, "").trim().slice(0, 40) : "");

export interface Probe {
  /** La réponse de Discord, 0 sans réponse. `null` : le lien n'a pas la forme d'un webhook, rien n'a été demandé. */
  status: number | null;
  name: string | null;
}

/**
 * Demande à Discord si le webhook existe : une simple lecture, rien ne part dans le salon. Une redirection n'est pas
 * suivie. Le journal dit ce qu'a répondu Discord, jamais le lien.
 */
export async function probeWebhook(salon: RobotSalon, link: SalonLink, get: typeof fetch, log: (line: string) => void): Promise<Probe> {
  const label = SALON_LABELS[salon];
  if (!link.link) {
    log(`${label} : ${sourceWords("none")}, rien ne part dans ce salon.`);
    return { status: null, name: null };
  }
  const fix = link.source === "direction" ? "collez le lien d'un nouveau webhook dans Direction > Discord" : `collez le lien d'un nouveau webhook dans Direction > Discord, ou remplacez le secret ${SALON_SECRETS[salon]}`;
  if (!isWebhookUrl(link.link)) {
    log(`::warning::${label} : le ${sourceWords(link.source)} n'a pas la forme d'un webhook de Discord : ${fix}.`);
    return { status: null, name: null };
  }
  try {
    const response = await get(link.link, { method: "GET", redirect: "error" });
    if (!response.ok) {
      log(
        UNKNOWN_LINK.includes(response.status)
          ? `::warning::${label} : Discord ne connaît pas ce lien (HTTP ${response.status}), le webhook a sans doute été supprimé. Rien ne peut partir : ${fix}.`
          : `::warning::${label} : Discord a répondu ${response.status}. Nouveau contrôle au prochain passage.`,
      );
      return { status: response.status, name: null };
    }
    const name = safeWebhookName(((await response.json().catch(() => ({}))) as { name?: unknown }).name);
    log(`${label} : le webhook « ${name || "sans nom"} » répond (${sourceWords(link.source)}).`);
    return { status: response.status, name: name || null };
  } catch {
    log(`::warning::${label} : Discord n'a pas répondu. Nouveau contrôle au prochain passage.`);
    return { status: 0, name: null };
  }
}

/** Note le contrôle pour l'espace Direction, avec la clé de service. Lève une erreur si le serveur refuse. */
export type NoteCall = (url: string, key: string, args: { p_salon: RobotSalon; p_source: LinkSource; p_status: number | null; p_name: string | null }) => Promise<void>;

export const noteSupabase: NoteCall = async (url, key, args) => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("note_discord_salon", args).abortSignal(AbortSignal.timeout(DIRECTION_TIMEOUT_MS));
  if (error) throw new Error(error.message);
  if ((data as { ok?: unknown } | null)?.ok !== true) throw new Error("le serveur a refusé le contrôle");
};

export interface CheckDeps {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  log: (line: string) => void;
  call?: DirectionCall;
  note?: NoteCall;
}

/**
 * Le contrôle des salons, à chaque passage. `false` : un salon au moins a un lien que Discord ne connaît pas, ou le contrôle
 * n'a pas pu être noté. Sans Supabase, le contrôle se lit seulement dans le journal de l'Action. Un salon que le serveur ne
 * connaît pas encore se contrôle sans être noté : la Direction ne peut pas le montrer.
 */
export async function checkSalons({ env, fetch: get, log, call = callSupabase, note = noteSupabase }: CheckDeps): Promise<boolean> {
  const url = env["SUPABASE_URL"];
  const key = env["SUPABASE_SECRET_KEY"];
  const { links, warning } = await readDirectionLinks(url, key, call);
  if (warning) log(`::warning::Salons Discord : ${warning}.`);
  let fine = true;
  for (const salon of ROBOT_SALONS) {
    const link = { ...chooseLink(salon, links, env[SALON_SECRETS[salon]]), warning };
    const probe = await probeWebhook(salon, link, get, log);
    // Un lien mal formé ou inconnu de Discord ne laissera rien partir. Une absence de réponse peut n'être que passagère.
    if (link.link && (probe.status === null || UNKNOWN_LINK.includes(probe.status))) fine = false;
    // Sans lecture de la Direction, la source notée serait peut-être fausse : rien n'est noté.
    if (!url || !key || links === null) continue;
    if (!Object.hasOwn(links, salon)) {
      log(`${SALON_LABELS[salon]} : le serveur du site ne connaît pas encore ce salon (mise à jour du serveur à installer), le contrôle n'est pas noté pour la Direction.`);
      continue;
    }
    try {
      await withTimeout(note(url, key, { p_salon: salon, p_source: link.source, p_status: probe.status, p_name: probe.name }), DIRECTION_TIMEOUT_MS);
    } catch (e) {
      log(`::warning::${SALON_LABELS[salon]} : contrôle non noté pour la Direction (${safeMessage(e)}).`);
      fine = false;
    }
  }
  return fine;
}
