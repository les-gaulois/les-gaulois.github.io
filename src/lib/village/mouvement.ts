/**
 * Le mouvement des Gaulois du village : calculs purs, que l'écran rejoue huit fois par seconde. Goûts du pilote : des
 * mouvements lents et espacés, rien d'agressif, rien qui clignote. Sur la place, chacun va d'un poste libre à un autre,
 * une case à la fois, puis s'arrête un bon moment ; ailleurs, chacun reste à son poste et vit sur place (il frappe, il
 * boit, il se tourne vers son voisin, il respire). Une animation ne change jamais une valeur : seuls les dessins bougent.
 */
import type { Poste } from "./lieux";

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

/** Un promeneur : où il est, en cases, vers quel poste il va, de quel côté il regarde, et combien de temps il attend. */
export interface Promeneur {
  poste: number;
  /** Le poste visé pendant la marche ; `null` à l'arrêt. */
  cible: number | null;
  x: number;
  y: number;
  /** 1 : il regarde à droite, comme son dessin ; -1 : à gauche. */
  vers: 1 | -1;
  /** Les temps de marche depuis le départ : ils rythment les pas. */
  pas: number;
  /** Les temps d'arrêt qui restent avant de repartir. */
  attente: number;
}

/** Les arrêts durent de 8 à 30 secondes : on marche peu, on s'arrête longtemps. */
const ARRET_MIN = 8 * TEMPS_PAR_SECONDE;
const ARRET_DE_PLUS = 22 * TEMPS_PAR_SECONDE;

/**
 * Les postes de départ sur la place : la foule s'étale sur toute la grille, et le premier (le sien, s'il y est) prend le
 * poste le plus proche du feu. `feuX` : la colonne du feu, en cases. Le premier départ vient vite (8 secondes au plus) :
 * le village a l'air vivant dès l'arrivée.
 */
export function departDeLaPlace(nombre: number, postes: readonly Poste[], feuX: number, hasard: () => number): Promeneur[] {
  const pris: number[] = [];
  for (let i = 0; i < nombre && i < postes.length; i++) pris.push(Math.min(postes.length - 1, Math.floor(((i + 0.5) * postes.length) / nombre)));
  if (pris.length > 0) {
    const ecart = (rang: number): number => postes[rang]!.rang * 1000 + Math.abs(postes[rang]!.x + 24 - feuX);
    let pres = 0;
    for (let i = 1; i < pris.length; i++) if (ecart(pris[i]!) < ecart(pris[pres]!)) pres = i;
    [pris[0], pris[pres]] = [pris[pres]!, pris[0]!];
  }
  return pris.map((poste) => ({ poste, cible: null, x: postes[poste]!.x, y: postes[poste]!.y, vers: hasard() < 0.5 ? 1 : -1, pas: 0, attente: Math.floor(hasard() * ARRET_MIN) }));
}

/** Un temps de la place : chacun attend, repart vers un poste libre voisin, ou avance d'une case. Modifie `promeneurs`. */
export function avancerLaPlace(promeneurs: Promeneur[], postes: readonly Poste[], hasard: () => number): void {
  const occupes = new Set<number>();
  for (const p of promeneurs) {
    occupes.add(p.poste);
    if (p.cible !== null) occupes.add(p.cible);
  }
  for (const p of promeneurs) {
    if (p.cible === null) {
      if (p.attente > 0) {
        p.attente--;
        // De loin en loin, il se retourne sans bouger.
        if (hasard() < 0.004) p.vers = p.vers === 1 ? -1 : 1;
        continue;
      }
      const ici = postes[p.poste]!;
      const voisins: number[] = [];
      postes.forEach((poste, rang) => {
        if (!occupes.has(rang) && Math.abs(poste.col - ici.col) <= 1 && Math.abs(poste.rang - ici.rang) <= 1) voisins.push(rang);
      });
      if (voisins.length === 0) {
        p.attente = ARRET_MIN + Math.floor(hasard() * ARRET_DE_PLUS);
        continue;
      }
      p.cible = voisins[Math.floor(hasard() * voisins.length)]!;
      occupes.add(p.cible);
      p.pas = 0;
      const dx = postes[p.cible]!.x - p.x;
      if (dx !== 0) p.vers = dx > 0 ? 1 : -1;
      continue;
    }
    const but = postes[p.cible]!;
    p.pas++;
    if (p.x !== but.x) p.x += p.x < but.x ? 1 : -1;
    // De haut en bas, il va deux fois moins vite : la place se voit de face.
    if (p.y !== but.y && (p.pas % 2 === 0 || p.x === but.x)) p.y += p.y < but.y ? 1 : -1;
    if (p.x === but.x && p.y === but.y) {
      occupes.delete(p.poste);
      p.poste = p.cible;
      p.cible = null;
      p.pas = 0;
      p.attente = ARRET_MIN + Math.floor(hasard() * ARRET_DE_PLUS);
    }
  }
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

/** L'image de la flamme : elle change deux fois par seconde, en revenant à celle du décor une fois sur deux. */
export function imageDeLaFlamme(temps: number): 0 | 1 | 2 {
  return ([0, 1, 0, 2] as const)[Math.floor(temps / 4) % 4]!;
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
