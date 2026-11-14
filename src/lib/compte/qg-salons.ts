/**
 * L'onglet « Salons » du QG, d'un coup d'œil : une ligne par appel. Ici, les calculs purs de cette liste — l'ordre des
 * lignes, le temps qui reste à un appel, et ses états en couleur, chacun avec son mot — et ceux des envois : les arguments
 * de `save_lobby_call` et ce que la page annonce de la réponse du serveur. Rien n'est deviné : tout vient de la réponse de
 * `get_lobby_calls`, relue par `salons.ts`, et de l'heure du serveur.
 */
import { fmtInt } from "../format";
import { pingRefusal, type LobbyCall } from "./salons";

/** Les couleurs d'état des onglets (`direction-kit.tsx`, `DirTon`) : le même nom, sans dépendre d'un composant. */
export type SalonTon = "ok" | "warn" | "danger" | "ally" | "muted";

/** À ce nombre de minutes ou moins, un appel « finit bientôt » : sa ligne passe au jaune. Un choix de dessin. */
export const ENDING_SOON_MINUTES = 3;

/**
 * Les minutes entières qui restent à un appel, arrondies vers le haut : « encore 1 min » jusqu'à la dernière seconde.
 * 0 : l'appel est fini. `null` : la date de fin est illisible, la page ne dit rien plutôt que d'inventer.
 */
export function remainingMinutes(expiresAt: string, now: number): number | null {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.ceil((end - now) / 60_000));
}

/** « encore 11 min », ou « se termine » quand il ne reste rien. `null` : pas de date de fin lisible. */
export function remainingLabel(expiresAt: string, now: number): string | null {
  const minutes = remainingMinutes(expiresAt, now);
  if (minutes === null) return null;
  return minutes === 0 ? "se termine" : `encore ${fmtInt(minutes)} min`;
}

/** L'appel finit bientôt : il reste `ENDING_SOON_MINUTES` minutes ou moins. Sans date lisible : non. */
export function endingSoon(expiresAt: string, now: number): boolean {
  const minutes = remainingMinutes(expiresAt, now);
  return minutes !== null && minutes <= ENDING_SOON_MINUTES;
}

/**
 * La couleur du bord d'une ligne : bleu pour mon appel, jaune pour un appel qui finit bientôt, vert pour un appel ouvert.
 * La couleur ne dit jamais rien seule : « Le mien » et le temps restant sont écrits sur la ligne.
 */
export function callTon(call: Pick<LobbyCall, "mine" | "expiresAt">, now: number): SalonTon {
  if (call.mine) return "ally";
  return endingSoon(call.expiresAt, now) ? "warn" : "ok";
}

export interface SalonMark {
  key: "mine" | "ping" | "discord";
  ton: SalonTon;
  label: string;
}

/**
 * Les états d'un appel, chacun avec sa couleur et son mot. Un ping part toujours avec le message Discord : « Ping parti »
 * remplace alors « Sur Discord », pour ne pas dire deux fois la même chose. Le serveur ne dit pas ce que Discord a fait du
 * message : les mots disent « parti », pas « reçu ».
 */
export function callMarks(call: Pick<LobbyCall, "mine" | "discord" | "ping">): SalonMark[] {
  const marks: SalonMark[] = [];
  if (call.mine) marks.push({ key: "mine", ton: "ally", label: "Le mien" });
  if (call.discord && call.ping) marks.push({ key: "ping", ton: "ok", label: "Ping parti" });
  else if (call.discord) marks.push({ key: "discord", ton: "muted", label: "Sur Discord" });
  return marks;
}

/**
 * L'ordre des lignes : mon appel d'abord, puis les appels les plus récents — un salon ouvert à l'instant a plus de chances
 * d'attendre encore qu'un salon ouvert il y a 14 minutes. À date égale, l'ordre du serveur est gardé. Ne modifie pas la
 * liste reçue.
 */
export function sortCalls<T extends Pick<LobbyCall, "mine" | "createdAt">>(calls: readonly T[]): T[] {
  const time = (call: T) => Date.parse(call.createdAt) || 0;
  return calls
    .map((call, index) => ({ call, index }))
    .sort((a, b) => Number(b.call.mine) - Number(a.call.mine) || time(b.call) - time(a.call) || a.index - b.index)
    .map(({ call }) => call);
}

/**
 * « depuis 4 min », « à l'instant » : depuis quand le Gaulois attend, d'après l'heure du serveur. Un départ un peu en avance
 * sur cette heure se dit « à l'instant ». `null` : une date illisible, dont la page ne dit rien plutôt que d'inventer
 * « à l'instant ». Proche de `sinceLabel` (`salons.ts`, « il y a 4 min »), que garde le pop-up des appels.
 */
export function waitingLabel(createdAt: string, now: number): string | null {
  const start = Date.parse(createdAt);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return null;
  const minutes = Math.floor((now - start) / 60_000);
  return minutes < 1 ? "à l'instant" : `depuis ${fmtInt(minutes)} min`;
}

/**
 * Les arguments de `save_lobby_call`. Plus de format à choisir (migration `20261110000100_appels_sans_format.sql`) : le lien
 * suffit. `p_ping` n'est envoyé que coché : la page marche aussi avec un serveur d'avant la migration
 * `20261111000200_appels_discord_ping_au_choix.sql`, qui ne connaît pas ce paramètre.
 */
export function saveCallArgs(game: string, ping: boolean): { p_game: string; p_format: null; p_ping?: true } {
  return ping ? { p_game: game, p_format: null, p_ping: true } : { p_game: game, p_format: null };
}

/**
 * Ce que la page annonce après un appel lancé, d'après la réponse de `save_lobby_call`. `discord` : le message est parti vers
 * Discord, sans savoir encore ce que Discord en fait. `ping` : 'sent', ou la raison d'un ping refusé (`pingRefusal`).
 */
export function savedNotice(answer: { discord?: unknown; ping?: unknown } | null | undefined): string {
  const discord = answer?.ping === "sent" ? " L'appel part aussi sur Discord, avec un ping." : answer?.discord === true ? " L'appel part aussi sur Discord." : "";
  const refusal = pingRefusal(answer?.ping);
  return `Les Gaulois sont prévenus.${discord}${refusal ? ` ${refusal}` : ""}`;
}

/** Ce que la page annonce après « Ping sur Discord » (`ping_lobby_call`) : parti, la raison d'un refus, ou rien pour un code inconnu. */
export function pingNotice(answer: { ping?: unknown } | null | undefined): string {
  return answer?.ping === "sent" ? "Ping parti sur Discord." : (pingRefusal(answer?.ping) ?? "");
}
