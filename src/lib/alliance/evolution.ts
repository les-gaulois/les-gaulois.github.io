/**
 * Ce qui a bougé en 24 heures sur la carte de l'alliance (demande du pilote, 13 novembre 2026 : « ce qui a bougé depuis
 * hier ») : les pixels pris et perdus par notre alliance, en tout, par clan et dans chaque zone. Tout vient de la
 * comparaison publiée par le build (`Veille`, `src/lib/clanmap/etat.ts`) : la carte au dernier relevé et celle de 24 heures
 * plus tôt, rejouées depuis l'historique public. Ces calculs ne changent aucune donnée collectée.
 */
import { ETAT_NEUTRE, type Veille } from "../clanmap/etat";
import { dansLeMasque, type Masque } from "./masque";

export interface Mouvement {
  /** Pixels qui sont à lui maintenant et ne l'étaient pas 24 heures plus tôt. */
  pris: number;
  /** Pixels qui étaient à lui 24 heures plus tôt et ne le sont plus. */
  perdus: number;
}

type Clans = readonly { tag: string | null }[];

/** Le tag du clan d'une valeur de l'état ; `null` pour la mer, la terre neutre ou un clan supprimé. */
const tagDe = (v: number, clans: Clans): string | null => (v > ETAT_NEUTRE ? (clans[v - 1]?.tag ?? null) : null);

export interface Mouvements {
  /** Notre alliance : un pixel passé d'un de nos clans à un autre ne compte ni pris ni perdu. */
  alliance: Mouvement;
  /** Chaque clan, par son tag. */
  parClan: Map<string, Mouvement>;
}

/** Les pixels pris et perdus en 24 heures, par notre alliance et par chaque clan. */
export function mouvements(veille: Veille, valeurs: Uint16Array, clans: Clans, notres: ReadonlySet<string>): Mouvements {
  const alliance: Mouvement = { pris: 0, perdus: 0 };
  const parClan = new Map<string, Mouvement>();
  const du = (tag: string): Mouvement => {
    let m = parClan.get(tag);
    if (!m) parClan.set(tag, (m = { pris: 0, perdus: 0 }));
    return m;
  };
  for (let k = 0; k < veille.index.length; k++) {
    const avant = tagDe(veille.avant[k]!, clans);
    const apres = tagDe(valeurs[veille.index[k]!]!, clans);
    if (avant === apres) continue;
    if (apres !== null) du(apres).pris++;
    if (avant !== null) du(avant).perdus++;
    const etaitNotre = avant !== null && notres.has(avant);
    const estNotre = apres !== null && notres.has(apres);
    if (estNotre && !etaitNotre) alliance.pris++;
    else if (etaitNotre && !estNotre) alliance.perdus++;
  }
  return { alliance, parClan };
}

/** Ce que notre alliance a pris et perdu en 24 heures dans une zone. */
export function mouvementZone(veille: Veille, valeurs: Uint16Array, width: number, masque: Masque, clans: Clans, notres: ReadonlySet<string>): Mouvement {
  const m: Mouvement = { pris: 0, perdus: 0 };
  for (let k = 0; k < veille.index.length; k++) {
    const p = veille.index[k]!;
    const x = p % width;
    const y = (p - x) / width;
    if (x < masque.x || y < masque.y || x >= masque.x + masque.w || y >= masque.y + masque.h || !dansLeMasque(masque, x, y)) continue;
    const avant = tagDe(veille.avant[k]!, clans);
    const apres = tagDe(valeurs[p]!, clans);
    const etaitNotre = avant !== null && notres.has(avant);
    const estNotre = apres !== null && notres.has(apres);
    if (estNotre && !etaitNotre) m.pris++;
    else if (etaitNotre && !estNotre) m.perdus++;
  }
  return m;
}

/** Ce qu'est devenu un pixel en 24 heures, pour notre alliance : pris, perdu, ou rien. */
export function sortDuPixel(veille: Veille, valeurs: Uint16Array, k: number, clans: Clans, notres: ReadonlySet<string>): "pris" | "perdu" | null {
  const avant = tagDe(veille.avant[k]!, clans);
  const apres = tagDe(valeurs[veille.index[k]!]!, clans);
  const etaitNotre = avant !== null && notres.has(avant);
  const estNotre = apres !== null && notres.has(apres);
  return estNotre && !etaitNotre ? "pris" : etaitNotre && !estNotre ? "perdu" : null;
}
