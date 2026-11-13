/**
 * La page Carte tient dans l'écran (demande du pilote, le 12 novembre 2026 : « tout interactible depuis la carte », « on
 * ne peut plus descendre en bas de la page »). Depuis le 13 novembre 2026 au soir (« le classement en colonne », avec « le
 * film flottant », choisis par le pilote sur maquettes) : sur un écran large, la carte à gauche et une colonne à droite où
 * se lit la fenêtre ouverte au-dessus du classement ; les entrées en rail sur la carte, le film dans une pastille posée en
 * bas de la carte. Sur téléphone, tout s'empile. Une fenêtre est toujours ouverte, l'objectif d'abord. Ici, la liste des
 * fenêtres et leurs règles ; le navigateur les applique dans `src/scripts/carte-console.ts`. Voir « La carte, le
 * classement en colonne » dans docs/DESIGN.md.
 */
import type { IconePartieNom } from "./icones-parties";

export interface Fenetre {
  /** L'ancre de la fenêtre dans l'adresse : `/carte#objectif`. */
  id: string;
  /** Le nom court, dans le rail : huit lettres au plus, pour tenir sur un téléphone de 360 px. */
  label: string;
  /** L'icône en pixels, à côté du nom (`src/lib/icones-parties.ts`). */
  icon: IconePartieNom;
  /** `true` : la fenêtre ne sert qu'une fois le film chargé, et son entrée n'apparaît qu'alors. */
  film?: boolean;
}

/** Dans l'ordre du rail : de haut en bas sur la carte, cinq par ligne sur téléphone. */
export const FENETRES = [
  { id: "objectif", label: "Objectif", icon: "cible" },
  { id: "clans", label: "Clans", icon: "boucliers" },
  // La carte de l'alliance (13 novembre 2026) : seulement avec la connexion du site, pour les Gaulois et les alliés invités.
  { id: "alliance", label: "Alliance", icon: "anneaux" },
  { id: "moments", label: "Moments", icon: "sablier", film: true },
  { id: "journees", label: "Journées", icon: "calendrier" },
  { id: "zones", label: "Zones", icon: "fanion", film: true },
  { id: "fronts", label: "Fronts", icon: "epees" },
  { id: "chiffres", label: "Chiffres", icon: "encoches" },
  { id: "reglages", label: "Réglages", icon: "roue", film: true },
  // « Légende » et « À propos », retirées le 13 novembre 2026 à la demande du pilote (« de trop ») : le crédit posé sur la
  // carte mène aux mentions légales, où sont la licence du fond de carte et le lien que la loi veut sur chaque page.
] as const satisfies readonly Fenetre[];

export type FenetreId = (typeof FENETRES)[number]["id"];

/** Les ancres de la page quand elle se lisait de haut en bas, avant le 12 novembre 2026 : un ancien lien ouvre encore quelque chose. */
const ANCIENNES_ANCRES: Record<string, FenetreId> = { histoire: "moments", details: "journees" };

/** L'écran où la carte et la colonne sont côte à côte : assez large, et plus large que haut. Sinon, tout s'empile. */
export const ECRAN_POSE = "(min-aspect-ratio: 5/4) and (min-width: 48rem)";

/** La fenêtre que demande une ancre de l'adresse. `null` : aucune, ou une ancre inconnue. */
export function fenetreDeLAncre(hash: string): FenetreId | null {
  // Le lien d'invitation d'un joueur allié (`#invitation=…`) ouvre la fenêtre de l'alliance, où il l'accepte.
  if (/^#?invitation=/.test(hash)) return "alliance";
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    // Une ancre mal écrite n'ouvre rien.
    return null;
  }
  return FENETRES.find((f) => f.id === id)?.id ?? ANCIENNES_ANCRES[id] ?? null;
}

/** Les fenêtres que la page contient : une fenêtre sans rien à montrer (l'objectif, sans GAL sur la carte) n'existe pas. */
export type Existe = (id: FenetreId) => boolean;

/** La fenêtre ouverte sans demande : l'objectif, en haut de la colonne ; les clans si la page n'a pas d'objectif. */
export function fenetreParDefaut(existe: Existe): FenetreId {
  return existe("objectif") ? "objectif" : "clans";
}

/** La fenêtre ouverte à l'arrivée : celle de l'adresse si la page la contient, sinon celle par défaut. */
export function fenetreInitiale(hash: string, existe: Existe): FenetreId {
  const demandee = fenetreDeLAncre(hash);
  return demandee && existe(demandee) ? demandee : fenetreParDefaut(existe);
}

/** La fenêtre ouverte après un clic sur une entrée : la sienne. Recliquer l'entrée ouverte ne la referme pas. */
export function fenetreApresClic(ouverte: FenetreId, cliquee: FenetreId, existe: Existe): FenetreId {
  return existe(cliquee) ? cliquee : ouverte;
}

/**
 * La fenêtre ouverte quand on ferme celle qui a une barre (la carte de l'alliance, libre sur la carte) ou qu'on appuie sur
 * Échap : celle par défaut revient. `null` : rien à fermer, la fenêtre par défaut est déjà ouverte.
 */
export function fenetreApresFermeture(ouverte: FenetreId, existe: Existe): FenetreId | null {
  const parDefaut = fenetreParDefaut(existe);
  return ouverte === parDefaut ? null : parDefaut;
}
