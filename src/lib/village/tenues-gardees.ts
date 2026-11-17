/**
 * Les tenues gardées du vestiaire (17 novembre 2026, choix du pilote : « des tenues enregistrées, trois emplacements pour
 * garder une tenue complète et la remettre d'un clic »). Le serveur décide de tout (migration
 * `20261117000300_tenues_gardees.sql`) : `get_mes_tenues` les donne, `garder_tenue` en range une. Ici, seulement la lecture
 * prudente de ses réponses. Remettre une tenue gardée ne fait que la reposer à l'écran du vestiaire : c'est
 * « Enregistrer ma tenue » qui la fait porter, et le serveur la refuse alors si un de ses objets n'est plus au compte.
 *
 * Un serveur qui n'a pas encore ces fonctions ne répond pas : `lireMesTenues` rend `null`, et le vestiaire ne montre rien
 * de plus qu'avant.
 */
import { lireTenue, type Tenue } from "../gaulois";

/** Le nombre de places que l'écran sait montrer : le même que celui du serveur. */
export const PLACES_DE_TENUES = 3;

export interface TenueGardee {
  /** De 1 à `places`. */
  place: number;
  tenue: Tenue;
  /** Le moment où elle a été gardée. */
  gardee_le: string;
}

export interface MesTenues {
  places: number;
  /** Les places occupées, dans l'ordre ; une place vide n'y est pas. */
  tenues: TenueGardee[];
}

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * La réponse de `get_mes_tenues` ou de `garder_tenue` ; `null` si elle est illisible. Une tenue que ce site ne sait pas
 * lire (un serveur en avance, un objet retiré) est laissée de côté, sans cacher les autres : sa place paraît vide.
 */
export function lireMesTenues(reponse: unknown): MesTenues | null {
  if (!estObjet(reponse) || reponse["ok"] !== true || !Array.isArray(reponse["tenues"])) return null;
  const places = reponse["places"];
  if (typeof places !== "number" || !Number.isSafeInteger(places) || places < 1 || places > PLACES_DE_TENUES) return null;
  const tenues: TenueGardee[] = [];
  for (const ligne of reponse["tenues"]) {
    if (!estObjet(ligne)) return null;
    const { place, gardee_le } = ligne;
    if (typeof place !== "number" || !Number.isSafeInteger(place) || place < 1 || place > places) return null;
    if (typeof gardee_le !== "string" || !Number.isFinite(Date.parse(gardee_le))) return null;
    if (tenues.some((t) => t.place === place)) return null;
    const tenue = lireTenue(ligne["tenue"]);
    if (tenue) tenues.push({ place, tenue, gardee_le });
  }
  tenues.sort((a, b) => a.place - b.place);
  return { places, tenues };
}

/** La tenue gardée à une place, ou `null` si la place est vide. */
export const tenueDeLaPlace = (mes: MesTenues, place: number): TenueGardee | null => mes.tenues.find((t) => t.place === place) ?? null;
