/**
 * Les fonds de l'écran de jeu « Mon Gaulois » (21 novembre 2026). Huit paysages animés dessinés en cases par Claude
 * Fable 5.2, que le pilote a tous retenus sur la galerie d'essai : « tu peux toutes les mettre et les intervaller de
 * 15 minutes entre eux ». Chacun a une version de jour (thème clair) et une de nuit (thème sombre). Ils remplacent la
 * bannière du joueur et les collines pâles derrière tout l'écran du jeu ; la bannière reste sur la carte du joueur.
 *
 * Le fond change toutes les 15 minutes, au quart d'heure de l'horloge. Tous les visiteurs voient donc le même au même
 * moment, et une page restée ouverte passe d'elle-même au suivant.
 *
 * Chaque paysage est un script classique de `public/paysages/<id>.js`, chargé seulement quand son tour vient
 * (src/scripts/jeu.ts). Il ajoute à `window.FONDS` un objet qui suit le contrat `FondDuJeu` ci-dessous. Ce module ne
 * contient que les calculs purs : quel fond à quel moment, et la taille de la toile en cases.
 */

/** Les huit paysages, dans l'ordre où ils tournent. */
export const FONDS_DU_JEU = ["p1-camp", "p2-foret", "p3-falaises", "p4-sommets", "p5-plaine", "p6-oppidum", "p7-nuages", "p8-lac"] as const;
export type IdDeFond = (typeof FONDS_DU_JEU)[number];

/** Les noms que la galerie d'essai leur donnait, et que chaque script déclare (le test les compare). Le fond est décoratif
 * (`aria-hidden`) : aucun lecteur d'écran ne les lit. */
export const NOMS_DES_FONDS: Readonly<Record<IdDeFond, string>> = {
  "p1-camp": "Le camp de guerre",
  "p2-foret": "La forêt des chênes",
  "p3-falaises": "Les falaises et la flotte",
  "p4-sommets": "Les sommets",
  "p5-plaine": "La plaine dorée",
  "p6-oppidum": "La cité sur la colline",
  "p7-nuages": "Au-dessus des nuages",
  "p8-lac": "Le lac miroir",
};

/** Un fond reste 15 minutes, choix du pilote. */
export const DUREE_D_UN_FOND_MS = 15 * 60 * 1000;

/** À changer quand un fichier de `public/paysages/` change : il s'ajoute à son adresse pour passer les caches. */
export const VERSION_DES_FONDS = "1";

/** Le fond du moment et l'instant où il laisse la place au suivant. */
export interface FondDuMoment {
  id: IdDeFond;
  indice: number;
  finMs: number;
}

/**
 * Le fond affiché à l'instant `ms` (millisecondes depuis 1970, comme `Date.now()`). Les tours sont comptés depuis
 * 1970 : chaque quart d'heure de l'horloge en commence un, et les huit fonds reviennent toutes les deux heures.
 */
export function fondDuMoment(ms: number): FondDuMoment {
  const tour = Math.floor(ms / DUREE_D_UN_FOND_MS);
  const n = FONDS_DU_JEU.length;
  const indice = ((tour % n) + n) % n;
  return { id: FONDS_DU_JEU[indice]!, indice, finMs: (tour + 1) * DUREE_D_UN_FOND_MS };
}

/**
 * La taille de la toile en cases : environ 640 × 360 cases sur un écran d'ordinateur, chaque case agrandie d'un nombre
 * entier de pixels (deux au moins), pour des pixels nets. Les paysages composent leur image selon cette taille.
 */
export function toileDuFond(largeurPx: number, hauteurPx: number): { largeur: number; hauteur: number; echelle: number } {
  const l = Math.max(1, largeurPx);
  const h = Math.max(1, hauteurPx);
  const echelle = Math.max(2, Math.round(Math.min(l / 640, h / 360)));
  return { largeur: Math.ceil(l / echelle), hauteur: Math.ceil(h / echelle), echelle };
}

/** Le contrat d'un paysage, tel que le pose son script dans `window.FONDS`. */
export interface FondDuJeu {
  id: string;
  nom: string;
  famille: string;
  monter(reglages: { largeur: number; hauteur: number; sombre: boolean; echelle: number }): void;
  dessiner(ctx: CanvasRenderingContext2D, t: number, souris: { x: number; y: number }): void;
}

/** Vrai si un objet trouvé dans `window.FONDS` a bien la forme d'un paysage. */
export function estUnFond(o: unknown): o is FondDuJeu {
  if (typeof o !== "object" || o === null) return false;
  const f = o as Record<string, unknown>;
  return typeof f["id"] === "string" && typeof f["nom"] === "string" && typeof f["famille"] === "string" && typeof f["monter"] === "function" && typeof f["dessiner"] === "function";
}
