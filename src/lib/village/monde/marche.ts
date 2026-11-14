/**
 * La marche des Gaulois dans le monde du village, calculs purs que l'écran rejoue huit fois par seconde (`mouvement.ts`).
 * Goûts du pilote : des mouvements lents et espacés. Ceux de la place vont d'un point à un autre du village, une case à la
 * fois, puis s'arrêtent un bon moment. Celui dont le lieu change suit un itinéraire (`etapesVers`) : il sort par le pas de
 * la porte, marche au pas jusqu'au nouveau lieu et y prend sa place. Tout est en cases entières, et chaque temps de marche
 * rapproche du but : la marche arrive toujours (tests/unit/village-monde-marche.test.ts).
 */
import { GAULOIS_LARGEUR } from "../../gaulois";
import { TEMPS_PAR_SECONDE, pasDuPromeneur } from "../mouvement";

/** Un point d'un itinéraire. `saut` : on y est d'un coup, sans marcher (entrer dans son lit, ou couper une trop longue route). */
export interface Etape {
  x: number;
  y: number;
  saut?: boolean;
}

export interface Marcheur {
  x: number;
  y: number;
  /** 1 : il regarde à droite, comme son dessin ; -1 : à gauche. */
  vers: 1 | -1;
  /** Les temps de marche depuis le départ : ils rythment les pas. */
  pas: number;
  /** Les temps d'arrêt qui restent avant de repartir. */
  attente: number;
  /** Le point visé pendant la marche ; `null` à l'arrêt. */
  but: { x: number; y: number } | null;
  /** Les étapes qui suivent le but, dans l'ordre. */
  suite: Etape[];
}

export interface Zone {
  de: number;
  a: number;
  haut: number;
  bas: number;
}

/**
 * Le marcheur est-il encore dans sa zone, lui et tout ce qu'il vise ? Quand le plan du monde change, une zone bouge : un
 * marcheur qui n'y est plus doit y être reposé plutôt que de la rejoindre à travers le monde.
 */
export function marcheurDansSonCoin(m: Pick<Marcheur, "x" | "y" | "but" | "suite">, zone: Zone): boolean {
  const dedans = (p: { x: number; y: number }) => p.x >= zone.de && p.x <= zone.a && p.y >= zone.haut && p.y <= zone.bas;
  return dedans(m) && (m.but === null || dedans(m.but)) && m.suite.every(dedans);
}

/** Les arrêts durent de 8 à 30 secondes ; une promenade ne mène pas à plus de 200 cases. */
const ARRET_MIN = 8 * TEMPS_PAR_SECONDE;
const ARRET_DE_PLUS = 22 * TEMPS_PAR_SECONDE;
const PROMENADE = 200;

/**
 * La route qu'on voit marcher, au plus, de chaque côté d'un long trajet, en cases. Au-delà, le marcheur fait cette route
 * en partant, puis se retrouve à la même distance de l'arrivée et la fait encore : on le voit partir et arriver, et il ne
 * passe jamais plus d'une minute environ sur le chemin, même d'un bout du village à l'autre.
 */
export const ROUTE_VUE = 480;

const entier = (e: Etape): Etape => (e.saut ? { x: Math.round(e.x), y: Math.round(e.y), saut: true } : { x: Math.round(e.x), y: Math.round(e.y) });

export const marcheurA = (x: number, y: number, hasard: () => number): Marcheur => ({ x: Math.round(x), y: Math.round(y), vers: hasard() < 0.5 ? 1 : -1, pas: 0, attente: Math.floor(hasard() * ARRET_MIN), but: null, suite: [] });

/** Passe à l'étape suivante : les sauts se font d'un coup, la première étape à marcher devient le but. */
function prochaine(m: Marcheur): void {
  m.but = null;
  while (m.suite.length > 0) {
    const etape = m.suite.shift()!;
    if (etape.saut) {
      m.x = etape.x;
      m.y = etape.y;
      continue;
    }
    if (etape.x === m.x && etape.y === m.y) continue;
    m.but = { x: etape.x, y: etape.y };
    if (etape.x !== m.x) m.vers = etape.x > m.x ? 1 : -1;
    return;
  }
}

/** Le marcheur part sur ces étapes (la précédente route est oubliée). */
export function partir(m: Marcheur, etapes: readonly Etape[]): void {
  m.suite = etapes.map(entier);
  m.pas = 0;
  prochaine(m);
}

/** Change le point d'arrivée d'une route en cours, sans changer le reste : la place qui l'attend a bougé. */
export function changerLArrivee(m: Marcheur, arrivee: Etape): void {
  const point = entier(arrivee);
  if (m.suite.length > 0) m.suite[m.suite.length - 1] = point;
  else if (m.but) {
    if (point.saut) m.suite = [point];
    else m.but = { x: point.x, y: point.y };
  }
}

/** Il est arrivé au bout de sa route, d'un coup : la pause, « réduire les animations ». */
export function arriverDUnCoup(m: Marcheur, arrivee: { x: number; y: number }): void {
  m.x = Math.round(arrivee.x);
  m.y = Math.round(arrivee.y);
  m.but = null;
  m.suite = [];
  m.pas = 0;
}

/** Est-il en route ? */
export const enRoute = (m: Pick<Marcheur, "but" | "suite">): boolean => m.but !== null || m.suite.length > 0;

/**
 * L'itinéraire d'un lieu à un autre : de `depart`, par la porte de sortie (s'il était dans un lieu), jusqu'à la porte
 * d'entrée du nouveau (s'il en a une), puis à sa place. Une route plus longue que deux fois `ROUTE_VUE` est coupée en son
 * milieu par un saut.
 */
export function etapesVers(depart: { x: number; y: number }, sortie: Etape | null, entree: Etape | null, arrivee: Etape): Etape[] {
  const etapes: Etape[] = [];
  if (sortie) etapes.push(sortie);
  const de = sortie ?? depart;
  const vers = entree ?? arrivee;
  const ecart = vers.x - de.x;
  if (Math.abs(ecart) > 2 * ROUTE_VUE) {
    const sens = Math.sign(ecart);
    etapes.push({ x: de.x + sens * ROUTE_VUE, y: de.y });
    etapes.push({ x: vers.x - sens * ROUTE_VUE, y: vers.y, saut: true });
  }
  if (entree) etapes.push(entree);
  etapes.push(arrivee);
  return etapes.map(entier);
}

/**
 * Un temps de marche vers son but, de `vitesse` cases au plus ; rend vrai quand il est au bout de sa route. De haut en
 * bas, il va deux fois moins vite (le monde se voit de face), sauf quand il n'a plus qu'à monter ou descendre. Chaque
 * temps le rapproche du but : il arrive toujours.
 */
export function avancer(m: Marcheur, vitesse: number): boolean {
  if (!m.but) prochaine(m);
  const but = m.but;
  if (!but) return true;
  m.pas++;
  const pas = Math.max(1, Math.floor(vitesse));
  const dx = but.x - m.x;
  m.x += Math.sign(dx) * Math.min(Math.abs(dx), pas);
  const dy = but.y - m.y;
  if (dy !== 0 && (m.pas % 2 === 0 || m.x === but.x)) m.y += Math.sign(dy) * Math.min(Math.abs(dy), 1);
  if (m.x !== but.x) m.vers = but.x > m.x ? 1 : -1;
  if (m.x === but.x && m.y === but.y) {
    m.pas = 0;
    prochaine(m);
    return m.but === null;
  }
  return false;
}

/**
 * Un temps de promenade : il attend, choisit un point proche dans la zone, ou avance d'une case. `eviter` : la colonne du
 * grand feu, devant lequel on ne s'arrête pas (on le verrait mal).
 */
export function promener(m: Marcheur, zone: Zone, eviter: number, hasard: () => number): void {
  if (!m.but) {
    if (m.attente > 0) {
      m.attente--;
      // De loin en loin, il se retourne sans bouger.
      if (hasard() < 0.004) m.vers = m.vers === 1 ? -1 : 1;
      return;
    }
    let x = Math.round(Math.min(zone.a, Math.max(zone.de, m.x + (hasard() * 2 - 1) * PROMENADE)));
    const y = Math.round(zone.haut + hasard() * (zone.bas - zone.haut));
    if (Math.abs(x + GAULOIS_LARGEUR / 2 - eviter) < 56) x += x + GAULOIS_LARGEUR / 2 < eviter ? -60 : 60;
    partir(m, [{ x, y }]);
    // Déjà là : il reste un moment.
    if (!m.but) m.attente = ARRET_MIN;
    return;
  }
  if (avancer(m, 1)) m.attente = ARRET_MIN + Math.floor(hasard() * ARRET_DE_PLUS);
}

/** Le temps d'arrêt d'un promeneur qui vient d'arriver sur la place. */
export const arretDuPromeneur = (hasard: () => number): number => ARRET_MIN + Math.floor(hasard() * ARRET_DE_PLUS);

/** La pose d'un marcheur : debout à l'arrêt ; en marche, un pied, debout, l'autre pied, debout (`pasDuPromeneur`). */
export function poseDuMarcheur(m: Pick<Marcheur, "but" | "pas">): "debout" | "gauche" | "droite" {
  return pasDuPromeneur({ cible: m.but, pas: m.pas });
}
