/**
 * Les chiffres de la carte de l'alliance. Tout vient de la collecte publique du site (le film et l'état pixel par pixel de
 * la carte, au même dernier relevé) et de calculs documentés ici ; les troupes viennent des déclarations des clans.
 * Ces calculs ne changent aucune donnée collectée.
 */
import { ENEMY_PIXEL_BASE_TROOPS, NEUTRAL_PIXEL_TROOPS } from "../clanmap/economy";
import { ETAT_MER, ETAT_NEUTRE } from "../clanmap/etat";
import { forEachPixel, type Masque } from "./masque";
import type { AllianceLigne, TroupesLigne } from "./types";

export interface BilanZone {
  pixels: number;
  /** Pixels déjà tenus par un clan de notre alliance. */
  alliance: number;
  /** Terre neutre : 1 000 troupes le pixel. */
  neutres: number;
  /** Tenus par un clan hors de notre alliance, du plus gros au plus petit. */
  autres: { tag: string | null; pixels: number }[];
  /** Pixels tenus par un autre clan, en tout. */
  ennemis: number;
  /** La mer, qui ne se prend pas : seulement dans une zone dessinée avant un changement du terrain. */
  mer: number;
  /** Part de la zone déjà tenue par l'alliance, de 0 à 1. */
  part: number;
  /** Troupes pour la terre neutre qui reste, selon la règle du jeu. */
  coutNeutres: number;
  /** Au moins ce nombre de troupes pour les pixels ennemis : leurs troupes ne sont pas connues. */
  coutEnnemisMinimum: number;
}

/**
 * Ce que contient une zone au dernier relevé : la terre neutre, les pixels de l'alliance et ceux des autres clans.
 * `valeurs` : l'état pixel par pixel (`src/lib/clanmap/etat.ts`) ; `clans` : les clans du film, par index ; `alliance` :
 * les tags des clans de notre alliance.
 */
export function bilanZone(masque: Masque, valeurs: Uint16Array, width: number, clans: readonly { tag: string | null }[], alliance: ReadonlySet<string>): BilanZone {
  let pixels = 0;
  let allies = 0;
  let neutres = 0;
  let mer = 0;
  const autres = new Map<number, number>();
  const height = Math.floor(valeurs.length / width);
  forEachPixel(masque, (x, y) => {
    pixels++;
    // Hors de la carte (une zone posée au-delà par un appel direct), rien ne se prend : compté comme la mer.
    const v = x < width && y < height ? (valeurs[y * width + x] ?? ETAT_MER) : ETAT_MER;
    if (v === ETAT_MER) mer++;
    else if (v === ETAT_NEUTRE) neutres++;
    else {
      const tag = clans[v - 1]?.tag ?? null;
      if (tag !== null && alliance.has(tag)) allies++;
      else autres.set(v - 1, (autres.get(v - 1) ?? 0) + 1);
    }
  });
  const ennemis = [...autres.values()].reduce((a, b) => a + b, 0);
  return {
    pixels,
    alliance: allies,
    neutres,
    autres: [...autres.entries()].map(([i, n]) => ({ tag: clans[i]?.tag ?? null, pixels: n })).sort((a, b) => b.pixels - a.pixels || (a.tag ?? "").localeCompare(b.tag ?? "")),
    ennemis,
    mer,
    part: pixels === 0 ? 0 : allies / pixels,
    coutNeutres: neutres * NEUTRAL_PIXEL_TROOPS,
    coutEnnemisMinimum: ennemis * ENEMY_PIXEL_BASE_TROOPS,
  };
}

export interface TotalAlliance {
  id: number;
  name: string;
  color: number;
  /** Ses clans, du plus grand territoire au plus petit ; `pixels: 0` pour un clan absent de la carte au dernier relevé. */
  clans: { tag: string; pixels: number }[];
  pixels: number;
  /** Part de la terre peinte, de 0 à 1. */
  part: number;
  /** Place parmi les alliances, par territoire. */
  rang: number;
}

/**
 * Le territoire de chaque alliance au dernier relevé : la somme des pixels de ses clans (`standings` du film). Un tag porté
 * par deux clans de la carte compte les deux : la carte officielle ne dit pas lequel est lequel.
 */
export function totauxAlliances(alliances: readonly AllianceLigne[], standings: readonly { tag: string | null; pixels: number }[], claimed: number): TotalAlliance[] {
  const parTag = new Map<string, number>();
  for (const s of standings) if (s.tag !== null) parTag.set(s.tag, (parTag.get(s.tag) ?? 0) + s.pixels);
  const totaux = alliances.map((a) => {
    const clans = a.clans.map((tag) => ({ tag, pixels: parTag.get(tag) ?? 0 })).sort((x, y) => y.pixels - x.pixels || x.tag.localeCompare(y.tag));
    const pixels = clans.reduce((n, c) => n + c.pixels, 0);
    return { id: a.id, name: a.name, color: a.color, clans, pixels, part: claimed > 0 ? pixels / claimed : 0, rang: 0 };
  });
  const ordre = [...totaux].sort((a, b) => b.pixels - a.pixels || a.id - b.id);
  ordre.forEach((t, i) => (t.rang = i + 1));
  return totaux;
}

export interface TroupesAlliance {
  /** La somme des troupes déclarées. */
  total: number;
  /** Clans de l'alliance qui ont déclaré, et clans en tout. */
  declares: number;
  clans: number;
  /** La plus ancienne déclaration comptée : le total n'est pas plus récent qu'elle. */
  plusAncienne: string | null;
}

/** Les troupes déclarées par les clans de notre alliance. Un clan sans déclaration n'est pas un zéro : il n'est pas compté. */
export function troupesDeLAlliance(clans: readonly string[], troupes: readonly TroupesLigne[]): TroupesAlliance {
  const membres = new Set(clans);
  const comptees = troupes.filter((t) => membres.has(t.tag));
  const plusAncienne = comptees.reduce<string | null>((min, t) => (min === null || t.at < min ? t.at : min), null);
  return { total: comptees.reduce((n, t) => n + t.troops, 0), declares: comptees.length, clans: membres.size, plusAncienne };
}

/**
 * Le texte d'un nombre de troupes tapé : chiffres, espaces et séparateurs de milliers acceptés. `null` : pas un nombre
 * valable. Les milliers se séparent par un point en français, par une virgule en anglais (« 1,500,000 », l'exemple affiché
 * dans la fenêtre en anglais) ; une virgule française, qui annonce des décimales, reste refusée : une troupe ne se coupe pas.
 */
export function lireTroupes(texte: string, langue: "fr" | "en" = "fr"): number | null {
  const net = texte.replace(langue === "en" ? /[\s  ,]/g : /[\s  .]/g, "");
  if (!/^\d{1,13}$/.test(net)) return null;
  const n = Number(net);
  return n <= 1_000_000_000_000 ? n : null;
}
