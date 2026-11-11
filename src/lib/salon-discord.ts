/**
 * Ce que partagent les messages du jour sur le salon de la gazette : « Hier chez les Gaulois », les plus actifs, la bienvenue
 * et les nouveautés du site, demandés par le pilote le 11 novembre 2026 pour que le salon vive tous les jours.
 *
 * Chacun part au plus une fois par jour à Paris, jamais la nuit, et à partir d'une heure à lui : les messages s'étalent dans la
 * journée au lieu de partir ensemble. Le robot passe vers la 53e minute de chaque heure : un message de 17 h part vers 17 h 53.
 * Comme les alertes, aucun ne part avant la gazette du lundi 9 novembre, premier message du salon (`alertsStarted`).
 */
import { z } from "zod";
import { QUIET_FROM_HOUR, QUIET_UNTIL_HOUR } from "./alerts";
import { parisParts } from "./time";

/** Un jour de Paris, AAAA-MM-JJ. */
export const ParisDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** L'heure de Paris à partir de laquelle part chaque message. La course du soir (`course-soir.ts`) suit les mêmes règles. */
export const SEND_FROM_HOUR = { hier: 9, bienvenue: 12, actifs: 17, nouveautes: 19, course: 21 } as const;

/** Le message peut-il partir maintenant ? Jamais la nuit, pas avant son heure, et une fois par jour à Paris. */
export function sendWindow(now: Date, fromHour: number, lastSentOn: string | null): { open: boolean; reason: string } {
  const { date, hour } = parisParts(now);
  if (hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR) return { open: false, reason: `la nuit : le message attend ${fromHour} h` };
  if (hour < fromHour) return { open: false, reason: `le message part à partir de ${fromHour} h` };
  if (lastSentOn === date) return { open: false, reason: "déjà un message aujourd'hui : la suite attend demain" };
  return { open: true, reason: "" };
}

/** Lit l'état noté par le robot. Illisible : `null` et un avertissement, et le passage repart comme au premier. */
export function parseNoted<T>(schema: z.ZodType<T>, raw: string | null, restart: string): { state: T | null; warning: string | null } {
  if (raw === null) return { state: null, warning: null };
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return { state: parsed.data, warning: null };
  } catch {
    // Même suite qu'un fichier au mauvais format.
  }
  return { state: null, warning: `l'état noté est illisible : ${restart}` };
}

/** Le lien d'une page du site, sans barre en trop. */
export const siteLink = (siteUrl: string, path: string) => `${siteUrl.replace(/\/$/, "")}${path}`;

/** L'adresse écrite sur une image, sans « https:// ». */
export const shownAddress = (siteUrl: string, path: string) => siteLink(siteUrl, path).replace(/^https?:\/\//, "");
