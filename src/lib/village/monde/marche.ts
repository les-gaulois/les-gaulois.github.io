/**
 * La marche des Gaulois dans le monde du village, calculs purs que l'écran rejoue huit fois par seconde (`mouvement.ts`).
 * Goûts du pilote : des mouvements lents et espacés. Ceux de la place vont d'un point à un autre du village, une case à la
 * fois, puis s'arrêtent un bon moment. Celui dont le lieu change marche jusqu'au nouveau, au pas, et y prend sa place.
 * PREMIÈRE VERSION (designer, 14 novembre 2026) : le développeur du monde la reprend (relectures du serveur, tests).
 */
import { GAULOIS_LARGEUR } from "../../gaulois";
import { TEMPS_PAR_SECONDE } from "../mouvement";

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
}

export interface Zone {
  de: number;
  a: number;
  haut: number;
  bas: number;
}

/** Les arrêts durent de 8 à 30 secondes ; une promenade ne mène pas à plus de 200 cases. */
const ARRET_MIN = 8 * TEMPS_PAR_SECONDE;
const ARRET_DE_PLUS = 22 * TEMPS_PAR_SECONDE;
const PROMENADE = 200;

export const marcheurA = (x: number, y: number, hasard: () => number): Marcheur => ({ x, y, vers: hasard() < 0.5 ? 1 : -1, pas: 0, attente: Math.floor(hasard() * ARRET_MIN), but: null });

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
    m.but = { x, y };
    m.pas = 0;
    if (x !== m.x) m.vers = x > m.x ? 1 : -1;
    return;
  }
  if (avancer(m, 1)) m.attente = ARRET_MIN + Math.floor(hasard() * ARRET_DE_PLUS);
}

/** Un temps de marche vers son but, de `vitesse` cases ; rend vrai quand il y est. De haut en bas, il va deux fois moins vite. */
export function avancer(m: Marcheur, vitesse: number): boolean {
  const but = m.but;
  if (!but) return true;
  m.pas++;
  for (let k = 0; k < vitesse; k++) {
    if (m.x !== but.x) m.x += m.x < but.x ? 1 : -1;
    if (m.y !== but.y && (m.pas % 2 === 0 || m.x === but.x) && k === 0) m.y += m.y < but.y ? 1 : -1;
  }
  if (m.x !== but.x) m.vers = but.x > m.x ? 1 : -1;
  if (m.x === but.x && m.y === but.y) {
    m.but = null;
    m.pas = 0;
    return true;
  }
  return false;
}

/** La pose d'un marcheur : debout à l'arrêt ; en marche, un pied, debout, l'autre pied, debout. */
export function poseDuMarcheur(m: Pick<Marcheur, "but" | "pas">): "debout" | "gauche" | "droite" {
  if (!m.but) return "debout";
  return (["gauche", "debout", "droite", "debout"] as const)[Math.floor(m.pas / 2) % 4]!;
}
