/**
 * Les paliers franchis : un message sur Discord quand des membres avec pseudo passent 50, 100, 250, 500, 1 000, 2 500 ou 5 000
 * victoires en équipe sous le tag. Ce sont les paliers du site (`paliers.ts`), à partir de 50 depuis le 11 novembre 2026, à la
 * demande du pilote, pour que le salon vive : à ce seuil, un message part presque chaque jour, surtout pour les nouveaux.
 * Jusque-là, ils partaient à partir de 100 (relevés du 5 au 8 novembre 2026 : README). Le bilan de la semaine garde 100.
 *
 * - La liste des membres est relue environ une fois par jour. Chaque relecture est comparée à la précédente : un membre avec pseudo
 *   présent aux deux, qui a franchi un palier entre elles, est noté. Un nouveau membre ou un pseudo apparu n'a pas de point de départ :
 *   rien n'est noté pour lui. Un anonyme n'a pas d'identifiant dans les fichiers du site : il ne peut être ni suivi ni cité.
 * - Un seul message par jour à Paris, jamais la nuit, avec tous les paliers notés depuis le précédent. Il attend le passage suivant
 *   la relecture, quand le site montre le nouveau palier.
 * - Un membre parti ou sans pseudo est oublié à chaque passage de la collecte, même sans lien Discord (`forgetMilestoneMembers`) :
 *   il n'est plus cité, et son identifiant n'est plus gardé. Un membre sans stats l'est à l'envoi suivant.
 * - Un palier ne se note qu'une fois, même si le chiffre recule puis remonte.
 * - Au premier passage, les paliers du moment servent de départ : rien n'est envoyé.
 * Un palier compte des victoires, donc d'abord des parties jouées : il ne dit pas qui joue le mieux.
 */
import { z } from "zod";
import { MAP_SITE_DELAY_MS, QUIET_FROM_HOUR, QUIET_UNTIL_HOUR } from "./alerts";
import { fmtDayAndTime, fmtInt } from "./format";
import { WIN_TIERS } from "./paliers";
import type { StoredMembers } from "./schemas";
import { parisParts } from "./time";

/** Les paliers cités dans le bilan de la semaine (gazette et accueil, `week-players.ts`) : ceux du site à partir de 100. */
export const ANNOUNCED_TIERS: readonly number[] = WIN_TIERS.filter((tier) => tier >= 100);

/** Le plus haut palier de la semaine atteint, 0 en dessous du premier. */
export const announcedTier = (wins: number) => ANNOUNCED_TIERS.findLast((tier) => wins >= tier) ?? 0;

/** Le premier palier annoncé sur Discord, depuis le 11 novembre 2026. Avant, c'était 100. */
export const FIRST_DISCORD_TIER = 50;

/** Les paliers du site annoncés sur Discord. */
export const DISCORD_TIERS: readonly number[] = WIN_TIERS.filter((tier) => tier >= FIRST_DISCORD_TIER);

/** Le plus haut palier annoncé sur Discord atteint, 0 en dessous du premier. */
export const discordTier = (wins: number) => DISCORD_TIERS.findLast((tier) => wins >= tier) ?? 0;

const isoDate = z.iso.datetime();

export const MilestoneState = z.object({
  /** La dernière relecture de la liste : son heure, et le plus haut palier annoncé de chaque membre avec pseudo, 0 en dessous du premier. */
  reading: z.object({ at: isoDate, tiers: z.record(z.string(), z.number().int().nonnegative()) }),
  /** Le premier palier annoncé quand ces paliers ont été notés. Absent : 100, avant le 11 novembre 2026. */
  tiersFrom: z.number().int().positive().optional(),
  /** Les paliers notés et pas encore envoyés, franchis entre la relecture `since` et la relecture `until`. */
  pending: z
    .object({ since: isoDate, until: isoDate, players: z.array(z.object({ id: z.string(), tier: z.number().int().positive() })).min(1) })
    .nullable(),
  /** Le jour, à Paris, du dernier message envoyé. */
  lastSentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type MilestoneState = z.infer<typeof MilestoneState>;
export type PendingMilestones = NonNullable<MilestoneState["pending"]>;

/** Comme `parseAlertState` : un état illisible repart des paliers du moment, avec un avertissement. */
export function parseMilestoneState(raw: string | null): { state: MilestoneState | null; warning: string | null } {
  if (raw === null) return { state: null, warning: null };
  try {
    const parsed = MilestoneState.safeParse(JSON.parse(raw));
    if (parsed.success) return { state: parsed.data, warning: null };
  } catch {
    // Même suite qu'un fichier au mauvais format.
  }
  return { state: null, warning: "l'état noté est illisible : les paliers du moment servent de nouveau départ" };
}

/** Le palier annoncé de chaque membre avec pseudo et stats. Jamais un anonyme. */
export function namedTiers(members: StoredMembers): Record<string, number> {
  return Object.fromEntries(members.members.flatMap((m) => (m.username && m.publicId && m.team ? [[m.publicId, discordTier(m.team.wins)]] : [])));
}

/**
 * Passe des paliers notés à partir de 100 à ceux à partir de 50, une seule fois. Un membre noté 0 avait moins de 100 victoires :
 * on ne sait pas quand il a passé 50. Il part donc de 50 s'il y est aujourd'hui, et rien n'est annoncé pour ce palier-là ;
 * un passage à 100 ou plus depuis la relecture notée l'est toujours. Renvoie le même objet s'il n'y a rien à changer.
 */
export function rescaleTiers(state: MilestoneState, members: StoredMembers): MilestoneState {
  if (state.tiersFrom === FIRST_DISCORD_TIER) return state;
  const wins = new Map(members.members.flatMap((m) => (m.publicId && m.team ? [[m.publicId, m.team.wins] as const] : [])));
  const tiers = Object.fromEntries(
    Object.entries(state.reading.tiers).map(([id, tier]) => {
      const now = wins.get(id);
      return [id, tier === 0 && now !== undefined ? Math.min(discordTier(now), FIRST_DISCORD_TIER) : tier];
    }),
  );
  return { ...state, reading: { ...state.reading, tiers }, tiersFrom: FIRST_DISCORD_TIER };
}

/**
 * Oublie les membres qui ne sont plus dans `current` : partis, sans pseudo ou supprimés. La collecte l'appelle à chaque passage,
 * même sans lien Discord, comme pour les relevés du lundi : un identifiant ne doit rester nulle part. Renvoie le même objet s'il n'y a rien à changer.
 */
export function forgetMilestoneMembers(state: MilestoneState, current: ReadonlySet<string>): MilestoneState {
  const tiers = Object.entries(state.reading.tiers).filter(([id]) => current.has(id));
  const players = state.pending?.players.filter((p) => current.has(p.id)) ?? [];
  if (tiers.length === Object.keys(state.reading.tiers).length && players.length === (state.pending?.players.length ?? 0)) return state;
  return { ...state, reading: { ...state.reading, tiers: Object.fromEntries(tiers) }, pending: state.pending && players.length > 0 ? { ...state.pending, players } : null };
}

/**
 * Tient compte de la liste des membres. À chaque passage, oublie les membres partis, sans pseudo ou sans stats.
 * À chaque nouvelle relecture, note les paliers franchis depuis la précédente. Renvoie le même objet s'il n'y a rien à changer.
 */
export function observeMembers(stored: MilestoneState | null, members: StoredMembers): MilestoneState {
  const current = namedTiers(members);
  if (!stored) return { reading: { at: members.fetchedAt, tiers: current }, tiersFrom: FIRST_DISCORD_TIER, pending: null, lastSentOn: null };
  const pruned = forgetMilestoneMembers(rescaleTiers(stored, members), new Set(Object.keys(current)));
  if (Date.parse(members.fetchedAt) <= Date.parse(stored.reading.at)) return pruned;

  const kept = pruned.reading.tiers;
  const stillPending = pruned.pending?.players ?? [];
  const crossed = new Map(stillPending.map((p) => [p.id, p.tier]));
  const tiers: Record<string, number> = {};
  for (const [id, tier] of Object.entries(current)) {
    const before = kept[id];
    // Le plus haut palier déjà vu : un recul puis une remontée ne refont pas l'annonce.
    tiers[id] = Math.max(before ?? 0, tier);
    if (before !== undefined && tier > before) crossed.set(id, Math.max(crossed.get(id) ?? 0, tier));
  }
  const players = [...crossed].map(([id, tier]) => ({ id, tier }));
  const since = pruned.pending ? pruned.pending.since : stored.reading.at;
  return { reading: { at: members.fetchedAt, tiers }, tiersFrom: FIRST_DISCORD_TIER, pending: players.length > 0 ? { since, until: members.fetchedAt, players } : null, lastSentOn: stored.lastSentOn };
}

/**
 * Faut-il envoyer maintenant ? Un message par jour à Paris, jamais la nuit, et pas avant que le site montre les nouveaux paliers :
 * il se reconstruit quelques minutes après le passage qui a relu la liste, comme pour les alertes de la carte.
 */
export function milestonesDue(state: MilestoneState, now: Date): { due: boolean; reason: string } {
  if (!state.pending) return { due: false, reason: "aucun palier franchi depuis le dernier message" };
  const { date, hour } = parisParts(now);
  if (hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR) return { due: false, reason: `la nuit : le message attend ${QUIET_UNTIL_HOUR} h` };
  if (state.lastSentOn === date) return { due: false, reason: "déjà un message aujourd'hui : la suite attend demain" };
  if (now.getTime() - Date.parse(state.pending.until) < MAP_SITE_DELAY_MS) return { due: false, reason: "le message attend que le site montre les nouveaux paliers" };
  return { due: true, reason: "" };
}

/** Après un envoi accepté : plus rien en attente, et le jour est noté. */
export const markMilestonesSent = (state: MilestoneState, now: Date): MilestoneState => ({ ...state, pending: null, lastSentOn: parisParts(now).date });

export interface MilestonePlayer {
  id: string;
  username: string;
  tier: number;
}

/**
 * Les joueurs à citer, avec leur pseudo du moment : du plus haut palier au plus bas, puis par ordre alphabétique.
 * À l'intérieur d'un palier, personne n'est devant personne. Un joueur repassé sous son palier, ou sans stats, n'est pas cité.
 */
export function milestonePlayers(pending: PendingMilestones, members: StoredMembers): MilestonePlayer[] {
  const named = new Map(members.members.flatMap((m) => (m.username && m.publicId && m.team ? [[m.publicId, { username: m.username, wins: m.team.wins }] as const] : [])));
  return pending.players
    .flatMap((p) => {
      const now = named.get(p.id);
      return now && now.wins >= p.tier ? [{ ...p, username: now.username }] : [];
    })
    .sort((a, b) => b.tier - a.tier || a.username.localeCompare(b.username, "fr"));
}

/* ---------- Les mots du message, pour le texte et pour l'image ---------- */

export const milestoneTitle = (count: number) => (count > 1 ? "Paliers franchis" : "Palier franchi");

/** « passe le cap des 1 000 victoires ». */
export const crossingWords = (tier: number) => `passe le cap des ${fmtInt(tier)} victoires`;

/** Entre quelles relectures de la liste, à l'heure de Paris. */
export const periodWords = ({ since, until }: Pick<PendingMilestones, "since" | "until">) =>
  `entre les relevés de la liste des membres du ${fmtDayAndTime(since)} et du ${fmtDayAndTime(until)}`;

/** « Et 1 autre membre. », « Et 3 autres membres. ». */
export const othersWords = (count: number) => (count > 1 ? `Et ${count} autres membres.` : "Et 1 autre membre.");

export const MILESTONE_NOTE = "Un palier compte d'abord les parties jouées, pas le niveau.";
