/**
 * Le boss du jour du duel « Coup pour coup » : un par jour, le même pour tous, choisi par la date seule, sans aucun tirage.
 *
 * La règle : le jour se lit à Paris et change à minuit, heure de Paris ; on compte les jours depuis le lundi 23 novembre
 * 2026, le premier jour du cycle, et l'on prend le boss de ce rang dans l'ordre du cycle, en recommençant au premier après
 * le dernier. Le rang va de 0 au nombre de boss moins 1, même avant le premier jour. Le même calcul en SQL, où `%` garde le
 * signe : `n = (now() at time zone 'Europe/Paris')::date - date '2026-11-23'`, puis `((n % nombre) + nombre) % nombre`.
 *
 * Calculs purs, sans rien de Node ni de Deno : le site et le robot les lisent tels quels.
 */

/** Le premier jour du cycle, à Paris : le boss de rang 0 ce jour-là. */
export const PREMIER_JOUR_DU_CYCLE = "2026-11-23";

const PARIS = "Europe/Paris";
const JOUR_A_PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" });
const JOUR_EN_MS = 86_400_000;

/** Le jour de cette date à Paris, écrit « AAAA-MM-JJ ». */
export function jourAParis(date: Date): string {
  const parts = Object.fromEntries(JOUR_A_PARIS.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

/** Le nombre de jours entre deux jours « AAAA-MM-JJ » (négatif si `jour` vient avant `depuis`). */
export function joursEntre(depuis: string, jour: string): number {
  return Math.round((Date.parse(`${jour}T00:00:00Z`) - Date.parse(`${depuis}T00:00:00Z`)) / JOUR_EN_MS);
}

/** Le rang dans le cycle du boss de ce jour, de 0 au nombre de boss moins 1, même avant le premier jour. */
export function rangDuJour(date: Date, nombre: number): number {
  if (!Number.isSafeInteger(nombre) || nombre < 1) throw new Error("il faut au moins un boss");
  const n = joursEntre(PREMIER_JOUR_DU_CYCLE, jourAParis(date));
  return ((n % nombre) + nombre) % nombre;
}
