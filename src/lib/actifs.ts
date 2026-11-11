/**
 * Les plus actifs : chaque jour, sur le salon de la gazette, les membres avec pseudo qui ont joué le plus de parties en équipe
 * sous le tag depuis le message précédent.
 *
 * - La mesure est la différence entre deux relevés de la liste des membres (`stats.team`, victoires et défaites), relue environ
 *   une fois par jour : celui du dernier message, et le dernier. Même podium que « les plus actifs » de la semaine (`weekActive`) :
 *   trois places, cinq lignes au plus en cas d'égalité. Les victoires de la même période sont dites à côté.
 * - Un membre sans relevé de départ (arrivé depuis, pseudo récent) n'est pas compté. Un anonyme n'a pas d'identifiant dans les
 *   fichiers du site : il ne peut être ni suivi ni cité. Un membre parti ou sans pseudo est oublié à chaque passage de la
 *   collecte, même sans lien Discord (`forgetActiveMembers`).
 * - À partir de 17 h, jamais la nuit, une fois par jour, et pas avant que le site montre le nouveau relevé. Une période de plus
 *   de trois jours (robot ou Discord en panne) n'est pas envoyée : le dernier relevé sert de nouveau départ.
 * - Au premier passage, le relevé du moment sert de départ : rien n'est envoyé.
 * Cela compte le temps de jeu, pas le niveau.
 */
import { z } from "zod";
import { MAP_SITE_DELAY_MS } from "./alerts";
import { fmtCount } from "./format";
import { ParisDay, SEND_FROM_HOUR, sendWindow } from "./salon-discord";
import type { StoredMembers } from "./schemas";
import { parisParts } from "./time";
import { namedGames, namedWins, weekActive } from "./week-players";

const count = z.number().int().nonnegative();

export const ActiveReading = z.object({
  /** L'heure du relevé de la liste. */
  at: z.iso.datetime(),
  /** Parties jouées (victoires et défaites) et victoires de chaque membre avec pseudo, selon `stats.team`. */
  games: z.record(z.string(), count),
  wins: z.record(z.string(), count),
});
export type ActiveReading = z.infer<typeof ActiveReading>;

export const ActiveState = z.object({
  /** Le relevé de départ : celui du dernier message, ou du premier passage. */
  base: ActiveReading,
  /** Le jour, à Paris, du dernier message envoyé. */
  lastSentOn: ParisDay.nullable(),
});
export type ActiveState = z.infer<typeof ActiveState>;

/** Au-delà, la période ne dirait plus « depuis la veille » : pas de message, et le dernier relevé sert de nouveau départ. */
export const MAX_PERIOD_MS = 72 * 3_600_000;

export const activeReading = (members: StoredMembers): ActiveReading => ({ at: members.fetchedAt, games: namedGames(members), wins: namedWins(members) });

/** Les membres avec pseudo de la liste, comme les garde la collecte. */
export const namedIds = (members: StoredMembers) => new Set(members.members.flatMap((m) => (m.username && m.publicId ? [m.publicId] : [])));

/**
 * Oublie les membres qui ne sont plus dans `current` : partis, sans pseudo ou supprimés. La collecte l'appelle à chaque passage,
 * même sans lien Discord : un identifiant ne doit rester nulle part. Renvoie le même objet s'il n'y a rien à changer.
 */
export function forgetActiveMembers(state: ActiveState, current: ReadonlySet<string>): ActiveState {
  const keep = (record: Record<string, number>) => Object.fromEntries(Object.entries(record).filter(([id]) => current.has(id)));
  const games = keep(state.base.games);
  const wins = keep(state.base.wins);
  if (Object.keys(games).length === Object.keys(state.base.games).length && Object.keys(wins).length === Object.keys(state.base.wins).length) return state;
  return { ...state, base: { ...state.base, games, wins } };
}

export interface ActivePlayer {
  id: string;
  username: string;
  games: number;
  wins: number;
  /** 1 pour le premier : deux joueurs à égalité partagent la même place. */
  place: number;
}

/** Le podium entre le relevé de départ et la liste du moment, avec les pseudos du moment. À égalité, par ordre alphabétique. */
export function activePlayers(base: ActiveReading, members: StoredMembers): ActivePlayer[] {
  const now = activeReading(members);
  const names = new Map(members.members.flatMap((m) => (m.username && m.publicId && m.team ? [[m.publicId, m.username] as const] : [])));
  const rows = weekActive(base.games, now.games);
  return rows
    .flatMap((row) => {
      const username = names.get(row.id);
      const before = base.wins[row.id];
      const after = now.wins[row.id];
      // Sans victoires aux deux relevés, celles de la période ne se calculent pas : le joueur n'est pas cité, plutôt que mal compté.
      if (!username || before === undefined || after === undefined) return [];
      return [{ id: row.id, username, games: row.games, wins: Math.max(0, after - before), place: 1 + rows.filter((other) => other.games > row.games).length }];
    })
    .sort((a, b) => a.place - b.place || a.username.localeCompare(b.username, "fr"));
}

/** Faut-il envoyer maintenant ? `restart` : la période est trop longue, le dernier relevé doit servir de nouveau départ. */
export function activeDue(state: ActiveState, members: StoredMembers, now: Date): { due: boolean; reason: string; restart: boolean } {
  const start = Date.parse(state.base.at);
  const end = Date.parse(members.fetchedAt);
  if (end <= start) return { due: false, reason: "pas de nouveau relevé de la liste depuis le dernier message", restart: false };
  if (end - start > MAX_PERIOD_MS) return { due: false, reason: "plus de trois jours depuis le relevé de départ : le dernier relevé sert de nouveau départ", restart: true };
  const window = sendWindow(now, SEND_FROM_HOUR.actifs, state.lastSentOn);
  if (!window.open) return { due: false, reason: window.reason, restart: false };
  if (now.getTime() - end < MAP_SITE_DELAY_MS) return { due: false, reason: "le message attend que le site montre le nouveau relevé", restart: false };
  return { due: true, reason: "", restart: false };
}

/** Après un envoi accepté : la liste du moment devient le départ, et le jour est noté. */
export const markActiveSent = (members: StoredMembers, now: Date): ActiveState => ({ base: activeReading(members), lastSentOn: parisParts(now).date });

/* ---------- Les mots du message, pour le texte et pour l'image ---------- */

export const ACTIVE_TITLE = "Les plus actifs";

/** « 45 parties, 29 victoires ». */
export const activityWords = (player: Pick<ActivePlayer, "games" | "wins">) => `${fmtCount(player.games, "partie")}, ${fmtCount(player.wins, "victoire")}`;

export const ACTIVE_NOTE = "Compte le temps de jeu, pas le niveau.";
