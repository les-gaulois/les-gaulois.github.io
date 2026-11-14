/**
 * Le mouvement des Gaulois du village : calculs purs, que l'écran rejoue huit fois par seconde. Goûts du pilote : des
 * mouvements lents et espacés, rien d'agressif, rien qui clignote. Chacun vit sur place (il frappe, il boit, il se tourne
 * vers son voisin, il respire) ; la marche d'un point à un autre est dans `monde/marche.ts`. Une animation ne change
 * jamais une valeur : seuls les dessins bougent.
 */

/** Le rythme du dessin : huit temps par seconde suffisent à une animation en pixels. */
export const TEMPS_PAR_SECONDE = 8;

/** Un générateur de hasard à graine : la même graine rejoue la même promenade. */
export function hasardDe(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ce qui rythme les pas de celui qui marche : son but (`null` à l'arrêt) et ses temps de marche depuis le départ. */
export interface Promeneur {
  cible: unknown;
  pas: number;
}

export type Pas = "debout" | "gauche" | "droite";
/** La pose d'un promeneur : debout à l'arrêt ; en marche, un pied, debout, l'autre pied, debout, un quart de seconde chacun. */
export function pasDuPromeneur(p: Pick<Promeneur, "cible" | "pas">): Pas {
  if (p.cible === null) return "debout";
  return (["gauche", "debout", "droite", "debout"] as const)[Math.floor(p.pas / 2) % 4]!;
}

/** Le tour de combat : sept secondes. Le Gaulois porte son coup au début, le guerrier d'en face à la moitié. */
const TOUR_DE_COMBAT = 7 * TEMPS_PAR_SECONDE;
const COUP = [1, 2, 3, 3, 3, 2, 1] as const;
const RECUL = [0, 0, 0, 1, 2, 1, 1] as const;

/**
 * Le décalage d'un combattant à un temps donné, en cases : `x` vers l'adversaire (un coup porté) ou à l'opposé (un coup
 * reçu), `y` un petit saut au plus fort du coup. `rang` décale les combattants entre eux : ils ne frappent pas ensemble.
 */
export function gesteDeCombat(temps: number, rang: number, camp: "gaulois" | "adverse"): { x: number; y: number } {
  const moment = (((temps + rang * 17) % TOUR_DE_COMBAT) + TOUR_DE_COMBAT) % TOUR_DE_COMBAT;
  const moitie = TOUR_DE_COMBAT / 2;
  const mien = camp === "gaulois" ? moment : moment - moitie;
  const sien = camp === "gaulois" ? moment - moitie : moment;
  const coup = COUP[mien] ?? 0;
  const recul = RECUL[sien] ?? 0;
  const sens = camp === "gaulois" ? 1 : -1;
  return { x: sens * (coup - recul), y: coup === 3 ? -1 : 0 };
}

/** À la taverne : la chope se lève une seconde et demie toutes les quinze secondes, chacun à son tour. */
export function chopeLevee(temps: number, rang: number): boolean {
  const tour = 15 * TEMPS_PAR_SECONDE;
  return (((temps + rang * 37) % tour) + tour) % tour < 12;
}

/** En réunion : chacun se tourne vers son voisin un moment, toutes les trente secondes. */
export function tourneEnReunion(temps: number, rang: number): 1 | -1 {
  const tour = 30 * TEMPS_PAR_SECONDE;
  return (((temps + rang * 53) % tour) + tour) % tour < 9 * TEMPS_PAR_SECONDE ? -1 : 1;
}

/** Dans son lit : la couverture se soulève deux secondes, retombe deux secondes. */
export function souffleDuDormeur(temps: number, rang: number): 0 | 1 {
  const tour = 4 * TEMPS_PAR_SECONDE;
  return (((temps + rang * 11) % tour) + tour) % tour < tour / 2 ? 0 : 1;
}

/**
 * Les bulles : sept secondes chacune, cinq secondes au moins entre deux apparitions, jamais plus de deux à la fois, et
 * vingt secondes de silence pour celui qui vient de parler.
 */
export const BULLES_MAX = 2;
const BULLE_DUREE = 7 * TEMPS_PAR_SECONDE;
const BULLE_ECART = 5 * TEMPS_PAR_SECONDE;
const BULLE_SILENCE = 20 * TEMPS_PAR_SECONDE;

export interface Bulles {
  /** Les bulles ouvertes : qui parle, et le temps où il se tait. */
  ouvertes: { qui: number; fin: number }[];
  /** Le temps avant lequel aucune bulle ne s'ouvre. */
  prochaine: number;
  /** Le tour de parole. */
  tour: number;
  /** Pour chacun, le temps avant lequel il ne reparle pas. */
  silences: Map<number, number>;
}

export const bullesAuDepart = (): Bulles => ({ ouvertes: [], prochaine: 3 * TEMPS_PAR_SECONDE, tour: 0, silences: new Map() });

/**
 * Un temps des bulles : celles qui ont assez duré se ferment ; s'il y a de la place et que l'écart est passé, le suivant
 * de `parleurs` (ceux qui ont une réplique, dans l'ordre) ouvre la sienne. Rend ceux dont la bulle est ouverte.
 */
export function avancerLesBulles(bulles: Bulles, temps: number, parleurs: readonly number[]): number[] {
  bulles.ouvertes = bulles.ouvertes.filter((b) => b.fin > temps && parleurs.includes(b.qui));
  if (bulles.ouvertes.length < BULLES_MAX && temps >= bulles.prochaine && parleurs.length > 0) {
    for (let essai = 0; essai < parleurs.length; essai++) {
      const qui = parleurs[(bulles.tour + essai) % parleurs.length]!;
      if (bulles.ouvertes.some((b) => b.qui === qui) || (bulles.silences.get(qui) ?? 0) > temps) continue;
      bulles.ouvertes.push({ qui, fin: temps + BULLE_DUREE });
      bulles.silences.set(qui, temps + BULLE_DUREE + BULLE_SILENCE);
      bulles.tour = (bulles.tour + essai + 1) % parleurs.length;
      bulles.prochaine = temps + BULLE_ECART;
      break;
    }
  }
  return bulles.ouvertes.map((b) => b.qui);
}
