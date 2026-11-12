/**
 * La console de la page Carte : la page tient dans l'écran, et tout se lit dans des fenêtres ouvertes depuis la rangée du
 * bas, sur la carte. Demande du pilote, le 12 novembre 2026 : « tout interactible depuis la carte », « on ne peut plus
 * descendre en bas de la page ». Ici, seulement la liste des fenêtres et leurs règles ; le navigateur les applique dans
 * `src/scripts/carte-console.ts`. Voir « La carte en console » dans docs/DESIGN.md.
 */
import type { IconePartieNom } from "./icones-parties";

export interface Fenetre {
  /** L'ancre de la fenêtre dans l'adresse : `/carte#objectif`. */
  id: string;
  /** Le nom court, dans la rangée du bas : huit lettres au plus, pour tenir sur un téléphone de 360 px. */
  label: string;
  /** L'icône en pixels, à côté du nom (`src/lib/icones-parties.ts`). */
  icon: IconePartieNom;
  /** `true` : la fenêtre ne sert qu'une fois le film chargé, et son entrée n'apparaît qu'alors. */
  film?: boolean;
  /** `true` : sur un grand écran, son contenu est posé à côté de la frise, et la fenêtre n'existe pas. */
  etroit?: boolean;
}

/** Dans l'ordre de la rangée : cinq par ligne sur téléphone. */
export const FENETRES = [
  { id: "objectif", label: "Objectif", icon: "cible" },
  { id: "clans", label: "Clans", icon: "boucliers" },
  { id: "moments", label: "Moments", icon: "sablier", film: true },
  { id: "journees", label: "Journées", icon: "calendrier" },
  { id: "zones", label: "Zones", icon: "fanion", film: true },
  { id: "fronts", label: "Fronts", icon: "epees" },
  { id: "chiffres", label: "Chiffres", icon: "encoches" },
  { id: "reglages", label: "Réglages", icon: "roue", film: true, etroit: true },
  { id: "legende", label: "Légende", icon: "rouleau" },
  { id: "a-propos", label: "À propos", icon: "torque" },
] as const satisfies readonly Fenetre[];

export type FenetreId = (typeof FENETRES)[number]["id"];

/** Les ancres de la page quand elle se lisait de haut en bas, avant le 12 novembre 2026 : un ancien lien ouvre encore quelque chose. */
const ANCIENNES_ANCRES: Record<string, FenetreId> = { histoire: "moments", details: "journees" };

/** La largeur à partir de laquelle la fenêtre de l'objectif s'ouvre d'elle-même : en dessous, elle couvrirait le territoire de GAL. */
export const LARGEUR_OBJECTIF_OUVERT = "85rem";
/** La largeur à partir de laquelle les réglages du film tiennent à côté de la frise. */
export const LARGEUR_REGLAGES_POSES = "75rem";
/** L'écran où la carte prend tout, les fenêtres posées dessus : assez large, et plus large que haut. Sinon, tout s'empile. */
export const ECRAN_POSE = "(min-aspect-ratio: 5/4) and (min-width: 48rem)";

/** L'écran, pour les règles des fenêtres. */
export interface EcranConsole {
  /** La carte en haut, les fenêtres dessous (téléphone, tablette debout). */
  empile: boolean;
  /** Assez large pour ouvrir l'objectif d'emblée. */
  large: boolean;
  /** Les réglages du film sont posés à côté de la frise : pas de fenêtre « Réglages ». */
  reglagesPoses: boolean;
}

/** La fenêtre que demande une ancre de l'adresse. `null` : aucune, ou une ancre inconnue. */
export function fenetreDeLAncre(hash: string): FenetreId | null {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    // Une ancre mal écrite n'ouvre rien.
    return null;
  }
  return FENETRES.find((f) => f.id === id)?.id ?? ANCIENNES_ANCRES[id] ?? null;
}

/** Cette fenêtre existe-t-elle sur cet écran ? Les réglages n'en ont pas quand ils sont posés à côté de la frise. */
export function fenetreExiste(id: FenetreId, ecran: EcranConsole): boolean {
  const fenetre = FENETRES.find((f) => f.id === id);
  return fenetre !== undefined && !("etroit" in fenetre && fenetre.etroit && ecran.reglagesPoses);
}

/**
 * La fenêtre ouverte sans demande : les clans sous la carte quand tout s'empile (le podium du film y est), l'objectif sur
 * un grand écran, rien entre les deux, où une fenêtre couvrirait le territoire de GAL.
 */
export function fenetreParDefaut(ecran: EcranConsole): FenetreId | null {
  if (ecran.empile) return "clans";
  return ecran.large ? "objectif" : null;
}

/** La fenêtre ouverte à l'arrivée : celle de l'adresse si elle existe sur cet écran, sinon celle par défaut. */
export function fenetreInitiale(hash: string, ecran: EcranConsole): FenetreId | null {
  const demandee = fenetreDeLAncre(hash);
  return demandee && fenetreExiste(demandee, ecran) ? demandee : fenetreParDefaut(ecran);
}

/**
 * La fenêtre ouverte après un clic sur une entrée de la rangée. Sur la carte, recliquer l'entrée ouverte la referme ;
 * quand tout s'empile, une fenêtre reste toujours ouverte sous la carte.
 */
export function fenetreApresClic(ouverte: FenetreId | null, cliquee: FenetreId, ecran: EcranConsole): FenetreId | null {
  if (!fenetreExiste(cliquee, ecran)) return ouverte;
  if (ouverte === cliquee) return ecran.empile ? ouverte : null;
  return cliquee;
}

/**
 * La fenêtre ouverte après un changement d'écran (rotation, fenêtre du navigateur redimensionnée) : celle qui n'existe
 * plus se referme, et un écran empilé retrouve toujours une fenêtre.
 */
export function fenetreApresEcran(ouverte: FenetreId | null, ecran: EcranConsole): FenetreId | null {
  const gardee = ouverte && fenetreExiste(ouverte, ecran) ? ouverte : null;
  return gardee ?? (ecran.empile ? fenetreParDefaut(ecran) : null);
}
