/**
 * Le mouvement du Gaulois compagnon : calculs purs, que `src/scripts/compagnon.ts` rejoue à chaque image. Il marche au
 * bas de la fenêtre, de gauche à droite seulement, vers le curseur (ou le dernier endroit touché), sans jamais courir.
 * Goûts du pilote : des mouvements lents et doux, rien d'agressif, rien qui clignote. Il ne part que si le visiteur s'est
 * éloigné pour de bon, prend son élan, ralentit avant d'arriver et s'arrête à côté, jamais dessous.
 *
 * Les longueurs sont en pixels de la page (pixels CSS), les durées en millisecondes.
 */
import { TEMPS_PAR_SECONDE, pasDuPromeneur } from "../village/mouvement";

/** Le dessin du Gaulois : 48 × 64 cases (`GAULOIS_LARGEUR`, `GAULOIS_HAUTEUR` de `gaulois.ts`, qu'un test compare). */
export const CASES_L = 48;
export const CASES_H = 64;
/** Le lit où il dort (`LIT_LARGEUR`, `LIT_HAUTEUR` de `src/lib/village/poses.ts`). */
export const LIT_L = 68;
export const LIT_H = 44;

/** Sous cette largeur de fenêtre, il est plus petit : un téléphone. */
export const FENETRE_ETROITE = 640;

/**
 * La taille d'une case. Toujours un nombre entier de pixels de l'écran, pour un dessin net : deux pixels de la page par
 * case sur ordinateur (96 × 128), un et quart environ sur téléphone (64 × 85 sur un écran à trois pixels par point,
 * 72 × 96 à deux). `parCase` : pixels de l'écran ; `cote` : la même longueur en pixels de la page.
 */
export function echelleDuCompagnon(largeurFenetre: number, pixelsParPoint: number): { parCase: number; cote: number } {
  const dpr = Number.isFinite(pixelsParPoint) && pixelsParPoint > 0 ? pixelsParPoint : 1;
  const voulu = (largeurFenetre < FENETRE_ETROITE ? 1.25 : 2) * dpr;
  // Le nombre entier le plus proche ; à égalité, le plus grand (il reste lisible).
  const parCase = Math.max(1, Math.floor(voulu + 0.5));
  return { parCase, cote: parCase / dpr };
}

/** Sa vitesse de marche : 54 pixels par seconde, vingt-cinq secondes pour traverser un grand écran. */
export const VITESSE = 54;
/** Son élan : il met une demi-seconde à atteindre sa vitesse, autant à s'arrêter. */
export const ELAN = 110;
/** Il ne part que si le visiteur est à plus de 150 pixels… */
export const DEPART = 150;
/** … depuis au moins 0,7 seconde : un curseur qui passe ne le fait pas bouger. */
export const ATTENTE_MS = 700;
/** Il s'arrête à 70 pixels : à côté du curseur, pas dessous. */
export const ARRIVEE = 70;

export interface Marcheur {
  /** Le bord gauche de son dessin. */
  x: number;
  /** 1 : il regarde à droite, comme son dessin ; -1 : à gauche. */
  vers: 1 | -1;
  vitesse: number;
  enMarche: boolean;
  /** Le temps de marche depuis le départ : il rythme les pas. */
  pasMs: number;
  /** Depuis quand le visiteur est assez loin pour qu'il parte. */
  attenteMs: number;
}

export const marcheurA = (x: number, vers: 1 | -1 = 1): Marcheur => ({ x, vers, vitesse: 0, enMarche: false, pasMs: 0, attenteMs: 0 });

const borner = (valeur: number, min: number, max: number): number => Math.min(Math.max(valeur, min), Math.max(min, max));

/** À quelle distance de sa cible il se met en route, selon son allure. */
export const seuilDeDepart = (allure: Allure): number => (allure === "suivre" ? DEPART : allure === "rejoindre" ? 12 : 0.5);

/**
 * Sa façon d'aller à sa cible. `suivre` : le curseur d'une souris ; il part s'il est loin, s'arrête à côté. `rejoindre` :
 * un coin de l'écran, sur téléphone ; il attend comme pour suivre, puis va jusqu'au bout. `ecarter` : il dégage un champ
 * de saisie, part tout de suite et va jusqu'au bout.
 */
export type Allure = "suivre" | "rejoindre" | "ecarter";

/** Sur téléphone, il va dans le coin du côté touché : le doigt est rarement là, et le milieu de la page reste libre. */
export const coinDuCote = (toucheX: number, largeurFenetre: number, min: number, max: number): number => (toucheX < largeurFenetre / 2 ? min : Math.max(min, max));

/**
 * Un pas de temps. `cible` : où son bord gauche doit aller, `null` s'il n'a rien à suivre. Il ne dépasse jamais sa cible
 * ni les bords `min` et `max`.
 */
export function avancer(m: Marcheur, cible: number | null, dtMs: number, min: number, max: number, allure: Allure = "suivre"): Marcheur {
  const dt = Math.min(Math.max(dtMs, 0), 100) / 1000;
  const x = borner(m.x, min, max);
  if (cible === null) return { ...m, x, vitesse: 0, enMarche: false, pasMs: 0, attenteMs: 0 };
  const but = borner(cible, min, max);
  const ecart = but - x;
  const loin = Math.abs(ecart);
  const precis = allure === "ecarter";
  const arrivee = allure === "suivre" ? ARRIVEE : 0;
  if (!m.enMarche) {
    if (loin <= seuilDeDepart(allure)) return { ...m, x, vitesse: 0, attenteMs: 0 };
    const attenteMs = m.attenteMs + dt * 1000;
    if (!precis && attenteMs < ATTENTE_MS) return { ...m, x, vitesse: 0, attenteMs };
    return { x, vers: ecart > 0 ? 1 : -1, vitesse: 0, enMarche: true, pasMs: 0, attenteMs: 0 };
  }
  const reste = loin - arrivee;
  // Arrivé, ou le visiteur est passé de l'autre côté : il s'arrête, et ne repartira qu'après son attente.
  if (reste <= 0 || (ecart > 0 ? 1 : -1) !== m.vers) return { ...m, x, vitesse: 0, enMarche: false, pasMs: 0, attenteMs: 0 };
  // Il prend son élan, et ralentit assez tôt pour s'arrêter sans à-coup.
  const vitesse = Math.max(6, Math.min(m.vitesse + ELAN * dt, VITESSE, Math.sqrt(2 * ELAN * reste)));
  const pas = Math.min(vitesse * dt, reste);
  const suivant = borner(x + m.vers * pas, min, max);
  const arrive = pas >= reste || suivant === x;
  return { x: suivant, vers: m.vers, vitesse: arrive ? 0 : vitesse, enMarche: !arrive, pasMs: arrive ? 0 : m.pasMs + dt * 1000, attenteMs: 0 };
}

/** Les images de sa planche : debout, un pied levé, l'autre, les yeux fermés. */
export const IMAGES = { debout: 0, piedGauche: 1, piedDroit: 2, yeuxFermes: 3 } as const;
export const NOMBRE_D_IMAGES = 4;
/** Le rythme du village : huit temps par seconde (`TEMPS_PAR_SECONDE`), et un pas de deux temps, un quart de seconde. */
export const PAS_MS = (2 * 1000) / TEMPS_PAR_SECONDE;

/**
 * L'image de la marche, au pas des promeneurs de la place (`pasDuPromeneur`) : un pied, debout, l'autre pied, debout.
 * `leve` : il rebondit d'une case quand un pied est levé.
 */
export function imageDeMarche(pasMs: number): { image: number; leve: boolean } {
  const pas = pasDuPromeneur({ cible: 0, pas: Math.floor((Math.max(0, pasMs) * TEMPS_PAR_SECONDE) / 1000) });
  if (pas === "gauche") return { image: IMAGES.piedGauche, leve: true };
  if (pas === "droite") return { image: IMAGES.piedDroit, leve: true };
  return { image: IMAGES.debout, leve: false };
}

/** Sans mouvement du visiteur, il ferme les yeux après 25 secondes et se couche après 70. */
export const SOMNOLE_MS = 25_000;
export const DORT_MS = 70_000;
export type Repos = "debout" | "somnole" | "dort";
export function reposApres(immobileMs: number): Repos {
  return immobileMs >= DORT_MS ? "dort" : immobileMs >= SOMNOLE_MS ? "somnole" : "debout";
}

/** Endormi, sa couverture se soulève : une respiration toutes les cinq secondes. */
export const SOUFFLE_MS = 2_500;
export const souffleA = (dortDepuisMs: number): 0 | 1 => (Math.floor(Math.max(0, dortDepuisMs) / SOUFFLE_MS) % 2 === 1 ? 1 : 0);

/** La marge entre lui et le bord de la fenêtre : la place du lit, plus large que lui, et quatre pixels. */
export const margeDuBord = (cote: number): number => Math.ceil(((LIT_L - CASES_L) / 2) * cote) + 4;

/** Où il se tient à sa première apparition : en bas à gauche, à l'écart des boutons du bas à droite. */
export const placeDeDepart = (min: number, max: number): number => borner(min + (max - min) * 0.04, min, max);

/** Sa place d'une page à l'autre et d'une taille de fenêtre à l'autre : une part de la largeur, de 0 à 1. */
export const enPart = (x: number, min: number, max: number): number => (max > min ? borner((x - min) / (max - min), 0, 1) : 0);
export const depuisPart = (part: number, min: number, max: number): number => borner(min + borner(Number.isFinite(part) ? part : 0, 0, 1) * (max - min), min, max);

/**
 * Où aller pour ne pas couvrir un champ de saisie : `null` s'il ne le touche pas. Sinon le côté le plus proche où il
 * tient en entier, à huit pixels du champ ; s'il ne tient d'aucun côté, le bord le plus éloigné du milieu du champ.
 */
export function ecarterDuChamp(x: number, largeur: number, champ: { gauche: number; droite: number }, min: number, max: number): number | null {
  const jeu = 8;
  if (x + largeur <= champ.gauche - jeu || x >= champ.droite + jeu) return null;
  const aGauche = champ.gauche - jeu - largeur;
  const aDroite = champ.droite + jeu;
  const tientAGauche = aGauche >= min;
  const tientADroite = aDroite <= max;
  if (tientAGauche && tientADroite) return x - aGauche <= aDroite - x ? aGauche : aDroite;
  if (tientAGauche) return aGauche;
  if (tientADroite) return aDroite;
  return (champ.gauche + champ.droite) / 2 > (min + max + largeur) / 2 ? min : max;
}

/** La bulle au-dessus de lui : son bord gauche, sans sortir de la fenêtre, et la place de sa queue, vers sa tête. */
export function placeDeLaBulle(centre: number, largeurBulle: number, largeurFenetre: number): { gauche: number; queue: number } {
  const bord = 8;
  const gauche = borner(centre - largeurBulle * 0.36, bord, largeurFenetre - bord - largeurBulle);
  return { gauche, queue: borner(centre - gauche, 18, largeurBulle - 26) };
}
