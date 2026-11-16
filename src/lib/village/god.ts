/**
 * Le mode GOD du village : l'essai sans trace d'un seul compte (migration `20261116000900_village_mode_god.sql`,
 * docs/DIRECTION.md, « Le mode GOD du village »). Le serveur décide qui y a droit : pour tout autre compte il répond
 * `permis: false`, et l'onglet Village de la Direction ne montre rien.
 */
export type ModeGod = { permis: false } | { permis: true; actif: boolean; depuis: string | null; somme: number };

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** La réponse de `get_village_god`, `activer_village_god` ou `desactiver_village_god`. `null` : illisible. */
export function lireModeGod(raw: unknown): ModeGod | null {
  if (!estObjet(raw) || raw["ok"] !== true || typeof raw["permis"] !== "boolean") return null;
  if (!raw["permis"]) return { permis: false };
  const { actif, depuis, somme } = raw;
  if (typeof actif !== "boolean") return null;
  if (typeof somme !== "number" || !Number.isSafeInteger(somme) || somme <= 0) return null;
  if (actif) {
    if (typeof depuis !== "string" || Number.isNaN(Date.parse(depuis))) return null;
    return { permis: true, actif: true, depuis, somme };
  }
  return { permis: true, actif: false, depuis: null, somme };
}
