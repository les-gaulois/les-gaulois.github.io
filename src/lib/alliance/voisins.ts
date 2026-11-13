/**
 * Les clans qui touchent notre alliance sur la carte (demande du pilote, 13 novembre 2026 : « nos voisins »), au dernier
 * relevé, pixel par pixel : pour chacun, combien de ses pixels sont au contact des nôtres, par un des quatre côtés, et son
 * principal point de contact, où la carte se centre. Calculé sur l'état publié (`src/lib/clanmap/etat.ts`) ; rien n'est
 * inventé.
 *
 * Nos territoires sont éparpillés sur toute la carte : le cadre de tout un contact la couvrirait presque entière. Le point
 * de contact principal est le carré de `CASE` pixels de côté où le voisin a le plus de pixels contre les nôtres.
 */
import { ETAT_NEUTRE } from "../clanmap/etat";

export const CASE = 64;
/** Un cadre trop petit zoomerait au plus près : il est agrandi à ce côté au moins, autour de son centre. */
const COTE_MIN = 48;

export interface Voisin {
  /** Son tag ; `null` pour un clan supprimé de la carte. */
  tag: string | null;
  /** Ses pixels au contact des nôtres. */
  contact: number;
  /** Le cadre de son principal point de contact, sur la carte complète. */
  cadre: { x: number; y: number; w: number; h: number };
}

interface Carre {
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Les clans hors de notre alliance qui la touchent, du plus long contact au plus court. Deux clans au même tag n'en font qu'un. */
export function voisinsDe(valeurs: Uint16Array, width: number, clans: readonly { tag: string | null }[], notres: ReadonlySet<string>): Voisin[] {
  // Pour chaque valeur de l'état, un clan de notre alliance ou non.
  const estNotre = new Uint8Array(clans.length + 2);
  for (let i = 1; i < clans.length; i++) {
    const tag = clans[i]?.tag;
    if (tag && notres.has(tag)) estNotre[i + 1] = 1;
  }
  const notreA = (v: number) => v > ETAT_NEUTRE && v < estNotre.length && estNotre[v] === 1;
  const height = Math.floor(valeurs.length / width);
  const colonnes = Math.ceil(width / CASE);
  const parTag = new Map<string, { tag: string | null; contact: number; carres: Map<number, Carre> }>();
  const n = valeurs.length;
  for (let p = 0; p < n; p++) {
    const v = valeurs[p]!;
    if (v <= ETAT_NEUTRE || notreA(v)) continue;
    const x = p % width;
    if (!((x > 0 && notreA(valeurs[p - 1]!)) || (x < width - 1 && notreA(valeurs[p + 1]!)) || (p >= width && notreA(valeurs[p - width]!)) || (p + width < n && notreA(valeurs[p + width]!)))) continue;
    const tag = clans[v - 1]?.tag ?? null;
    const cle = tag ?? "";
    const y = (p - x) / width;
    let voisin = parTag.get(cle);
    if (!voisin) parTag.set(cle, (voisin = { tag, contact: 0, carres: new Map() }));
    voisin.contact++;
    const c = Math.floor(y / CASE) * colonnes + Math.floor(x / CASE);
    const carre = voisin.carres.get(c);
    if (!carre) voisin.carres.set(c, { n: 1, x0: x, y0: y, x1: x, y1: y });
    else {
      carre.n++;
      if (x < carre.x0) carre.x0 = x;
      if (x > carre.x1) carre.x1 = x;
      if (y > carre.y1) carre.y1 = y;
    }
  }
  return [...parTag.values()]
    .map((v) => {
      let meilleur: Carre | null = null;
      for (const c of v.carres.values()) if (!meilleur || c.n > meilleur.n) meilleur = c;
      return { tag: v.tag, contact: v.contact, cadre: cadreAutour(meilleur!, width, height) };
    })
    .sort((a, b) => b.contact - a.contact || (a.tag ?? "").localeCompare(b.tag ?? ""));
}

/** Le cadre d'un carré de contact, agrandi autour de son centre à `COTE_MIN` de côté au moins, sans sortir de la carte. */
function cadreAutour(c: Carre, width: number, height: number): Voisin["cadre"] {
  const w = Math.min(width, Math.max(COTE_MIN, c.x1 - c.x0 + 1));
  const h = Math.min(height, Math.max(COTE_MIN, c.y1 - c.y0 + 1));
  const x = Math.max(0, Math.min(width - w, Math.round((c.x0 + c.x1 + 1) / 2 - w / 2)));
  const y = Math.max(0, Math.min(height - h, Math.round((c.y0 + c.y1 + 1) / 2 - h / 2)));
  return { x, y, w, h };
}
