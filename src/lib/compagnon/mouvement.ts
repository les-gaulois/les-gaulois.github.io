/**
 * Le mouvement du Gaulois compagnon : calculs purs, que `src/scripts/compagnon.ts` rejoue à chaque image. Il marche sur
 * toute la fenêtre, en long et en large, vers le curseur (ou vers le coin bas du côté touché, au doigt), sans jamais
 * courir. Goûts du pilote : des mouvements lents et doux, rien d'agressif, rien qui clignote. Il ne part que si le
 * visiteur s'est éloigné pour de bon, prend son élan, ralentit avant d'arriver et s'arrête à côté du curseur, jamais
 * dessous. Le 14 novembre 2026, le pilote a demandé qu'il suive « sur tout l'écran et pas que en bas de la page ».
 *
 * Les longueurs sont en pixels de la page (pixels CSS), les durées en millisecondes. Une place est le coin haut gauche de
 * son dessin, dans la fenêtre.
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

/** La petite prison où il attend, rangé : environ un pixel de la page par case, toujours un nombre entier de pixels de l'écran. */
export function echelleDeLaPrison(pixelsParPoint: number): { parCase: number; cote: number } {
  const dpr = Number.isFinite(pixelsParPoint) && pixelsParPoint > 0 ? pixelsParPoint : 1;
  const parCase = Math.max(1, Math.floor(dpr + 0.5));
  return { parCase, cote: parCase / dpr };
}

/** Sa vitesse de marche : 54 pixels par seconde, vingt-cinq secondes pour traverser un grand écran. */
export const VITESSE = 54;
/** Son élan : il met une demi-seconde à atteindre sa vitesse, autant à s'arrêter. */
export const ELAN = 110;
/** Il ne part que si sa place à côté du curseur est à plus de 150 pixels… */
export const DEPART = 150;
/** … depuis au moins 0,7 seconde : un curseur qui passe ne le fait pas bouger. */
export const ATTENTE_MS = 700;
/** L'écart entre le curseur et le bord de son dessin, quand il s'arrête à côté : à côté, pas dessous. */
export const ECART_DU_CURSEUR = 16;
/** Où tombe le curseur, de haut en bas, à côté de lui : un peu sous la moitié de sa hauteur, à hauteur de main. */
export const HAUTEUR_DU_CURSEUR = 0.55;

export interface Point {
  x: number;
  y: number;
}

/** Les places possibles de son coin haut gauche : toute la fenêtre, moins les marges (son lit) et l'en-tête collé en haut. */
export interface Bornes {
  gauche: number;
  droite: number;
  haut: number;
  bas: number;
}

/** Un rectangle de la fenêtre : un champ, un lien, ce qu'il ne doit pas couvrir. */
export interface Cadre {
  gauche: number;
  droite: number;
  haut: number;
  bas: number;
}

export interface Marcheur extends Point {
  /** 1 : il regarde à droite, comme son dessin ; -1 : à gauche. */
  vers: 1 | -1;
  vitesse: number;
  enMarche: boolean;
  /** Sa direction de marche, de longueur 1 : un demi-tour l'arrête. */
  capX: number;
  capY: number;
  /** Le temps de marche depuis le départ : il rythme les pas. */
  pasMs: number;
  /** Depuis quand le visiteur est assez loin pour qu'il parte. */
  attenteMs: number;
}

export const marcheurA = (x: number, y: number, vers: 1 | -1 = 1): Marcheur => ({ x, y, vers, vitesse: 0, enMarche: false, capX: 0, capY: 0, pasMs: 0, attenteMs: 0 });

const borner = (valeur: number, min: number, max: number): number => Math.min(Math.max(valeur, min), Math.max(min, max));

/** Une place ramenée dans la fenêtre. */
export const bornerLaPlace = (p: Point, b: Bornes): Point => ({ x: borner(p.x, b.gauche, b.droite), y: borner(p.y, b.haut, b.bas) });

/** À quelle distance de sa cible il se met en route, selon son allure. */
export const seuilDeDepart = (allure: Allure): number => (allure === "suivre" ? DEPART : allure === "rejoindre" ? 12 : 0.5);

/**
 * Sa façon d'aller à sa cible. `suivre` : à côté du curseur d'une souris ; il part s'il est loin, après son attente.
 * `rejoindre` : un coin bas de l'écran, sur téléphone ; il attend comme pour suivre, puis va jusqu'au bout. `ecarter` : il
 * dégage un champ de saisie, un lien atteint au clavier ou ce qui est fixé sur la fenêtre, part tout de suite et va
 * jusqu'au bout.
 */
export type Allure = "suivre" | "rejoindre" | "ecarter";

/**
 * Sa place à côté du curseur : du côté où il est déjà (il ne passe pas devant le visiteur pour rien), le curseur à
 * hauteur de main ; de l'autre côté si celui-ci sort de la fenêtre.
 */
export function placeAcoteDuCurseur(curseur: Point, ici: Point, largeur: number, hauteur: number, b: Bornes): Point {
  const aGauche = curseur.x - ECART_DU_CURSEUR - largeur;
  const aDroite = curseur.x + ECART_DU_CURSEUR;
  const tientAGauche = aGauche >= b.gauche;
  const tientADroite = aDroite <= b.droite;
  const deCeCote = ici.x + largeur / 2 <= curseur.x ? (tientAGauche || !tientADroite ? aGauche : aDroite) : tientADroite || !tientAGauche ? aDroite : aGauche;
  return bornerLaPlace({ x: deCeCote, y: curseur.y - hauteur * HAUTEUR_DU_CURSEUR }, b);
}

/** Sur téléphone, il va dans le coin bas du côté touché : le doigt est rarement là, et le milieu de la page reste libre. */
export const coinDuCote = (toucheX: number, largeurFenetre: number, b: Bornes): Point => ({ x: toucheX < largeurFenetre / 2 ? b.gauche : Math.max(b.gauche, b.droite), y: Math.max(b.haut, b.bas) });

/** Son regard suit sa marche, mais une marche presque droite vers le haut ou le bas ne le fait pas se retourner. */
function regard(vers: 1 | -1, dx: number, loin: number): 1 | -1 {
  if (loin <= 0 || dx * vers >= 0 || Math.abs(dx) < loin * 0.3) return vers;
  return dx > 0 ? 1 : -1;
}

/**
 * Un pas de temps. `cible` : où son coin haut gauche doit aller, `null` s'il n'a rien à suivre. Il marche en ligne
 * droite, ne dépasse jamais sa cible ni les bornes.
 */
export function avancer(m: Marcheur, cible: Point | null, dtMs: number, b: Bornes, allure: Allure = "suivre"): Marcheur {
  const dt = Math.min(Math.max(dtMs, 0), 100) / 1000;
  const ici = bornerLaPlace(m, b);
  if (cible === null) return { ...m, ...ici, vitesse: 0, enMarche: false, pasMs: 0, attenteMs: 0 };
  const but = bornerLaPlace(cible, b);
  const dx = but.x - ici.x;
  const dy = but.y - ici.y;
  const loin = Math.hypot(dx, dy);
  const precis = allure === "ecarter";
  if (!m.enMarche) {
    if (loin <= seuilDeDepart(allure)) return { ...m, ...ici, vitesse: 0, attenteMs: 0 };
    const attenteMs = m.attenteMs + dt * 1000;
    if (!precis && attenteMs < ATTENTE_MS) return { ...m, ...ici, vitesse: 0, attenteMs };
    return { ...ici, vers: regard(m.vers, dx, loin), vitesse: 0, enMarche: true, capX: dx / loin, capY: dy / loin, pasMs: 0, attenteMs: 0 };
  }
  // Arrivé, ou le visiteur est passé derrière lui : il s'arrête, et ne repartira qu'après son attente.
  if (loin <= 0.001 || (!precis && dx * m.capX + dy * m.capY < 0)) return { ...m, ...ici, vitesse: 0, enMarche: false, pasMs: 0, attenteMs: 0 };
  // Il prend son élan, et ralentit assez tôt pour s'arrêter sans à-coup.
  const vitesse = Math.max(6, Math.min(m.vitesse + ELAN * dt, VITESSE, Math.sqrt(2 * ELAN * loin)));
  const pas = Math.min(vitesse * dt, loin);
  const capX = dx / loin;
  const capY = dy / loin;
  const suivant = bornerLaPlace({ x: ici.x + capX * pas, y: ici.y + capY * pas }, b);
  const arrive = pas >= loin || (suivant.x === ici.x && suivant.y === ici.y);
  return {
    ...suivant,
    vers: regard(m.vers, dx, loin),
    vitesse: arrive ? 0 : vitesse,
    enMarche: !arrive,
    capX,
    capY,
    pasMs: arrive ? 0 : m.pasMs + dt * 1000,
    attenteMs: 0,
  };
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

/** Où il se tient à sa première apparition, et en sortant de prison : en bas à gauche, à l'écart des boutons du bas à droite. */
export const placeDeDepart = (b: Bornes): Point => ({ x: borner(b.gauche + (b.droite - b.gauche) * 0.04, b.gauche, b.droite), y: Math.max(b.haut, b.bas) });

/** Sa place d'une page à l'autre et d'une taille de fenêtre à l'autre : une part de la largeur et de la hauteur, de 0 à 1. */
export const enPart = (v: number, min: number, max: number): number => (max > min ? borner((v - min) / (max - min), 0, 1) : 0);
export const depuisPart = (part: number, min: number, max: number): number => borner(min + borner(Number.isFinite(part) ? part : 0, 0, 1) * (max - min), min, max);

/** Son cadre, à une place donnée. */
export const cadreA = (p: Point, largeur: number, hauteur: number): Cadre => ({ gauche: p.x, droite: p.x + largeur, haut: p.y, bas: p.y + hauteur });

/** Deux cadres se touchent-ils, à `jeu` pixels près ? */
export const touche = (a: Cadre, c: Cadre, jeu = 0): boolean => a.gauche < c.droite + jeu && c.gauche - jeu < a.droite && a.haut < c.bas + jeu && c.haut - jeu < a.bas;

/** L'espace qu'il laisse autour de ce qu'il ne couvre pas. */
export const JEU = 8;

/**
 * Où aller pour ne couvrir aucune des `zones` (un champ en cours de saisie, un lien atteint au clavier, ce qui est fixé
 * sur la fenêtre ; pour sa place à côté du curseur, aussi la mention de licence d'OpenFront) : `null` s'il n'en touche
 * aucune, sa place s'il ne tient nulle part.
 * Sinon la place libre la plus proche, à huit pixels au moins de chaque zone : à gauche, à droite, au-dessus ou au-dessous
 * d'une zone, dans la fenêtre.
 */
export function horsDesZones(ici: Point, largeur: number, hauteur: number, zones: readonly Cadre[], b: Bornes): Point | null {
  const libre = (p: Point): boolean => zones.every((z) => !touche(cadreA(p, largeur, hauteur), z, JEU));
  const depart = bornerLaPlace(ici, b);
  if (libre(depart)) return depart.x === ici.x && depart.y === ici.y ? null : depart;
  const candidats: Point[] = [];
  for (const z of zones) {
    const xs = [z.gauche - JEU - largeur, z.droite + JEU];
    const ys = [z.haut - JEU - hauteur, z.bas + JEU];
    for (const x of xs) candidats.push({ x, y: depart.y });
    for (const y of ys) candidats.push({ x: depart.x, y });
    // Les coins, quand ni les côtés ni le dessus ne suffisent (deux zones voisines).
    for (const x of xs) for (const y of ys) candidats.push({ x, y });
  }
  let meilleure: Point | null = null;
  let distance = Infinity;
  for (const c of candidats) {
    const p = bornerLaPlace(c, b);
    if (!libre(p)) continue;
    const d = Math.hypot(p.x - depart.x, p.y - depart.y);
    if (d < distance - 0.001) {
      meilleure = p;
      distance = d;
    }
  }
  return meilleure ?? ici;
}

/** Ne tient-il nulle part hors des zones ? Il s'efface alors, le temps qu'elles restent. */
export const nullePart = (ici: Point, largeur: number, hauteur: number, zones: readonly Cadre[], b: Bornes): boolean => {
  const place = horsDesZones(ici, largeur, hauteur, zones, b) ?? ici;
  return zones.some((z) => touche(cadreA(place, largeur, hauteur), z, JEU));
};

/**
 * La partie visible de la page (`visualViewport`) est-elle trop petite pour lui ? Agrandie du bout des doigts, il serait
 * grossi et coupé ; un clavier de téléphone ouvert (la partie visible perd plus d'un cinquième de la fenêtre, 150 pixels
 * au moins : plus que la barre d'adresse qui se replie), il couvrirait le peu qui reste. Il s'efface le temps qu'il faut.
 */
export function fenetreGenee(hauteurFenetre: number, visible: { height: number; scale: number } | null | undefined): boolean {
  if (!visible) return false;
  if (visible.scale > 1.01) return true;
  return hauteurFenetre - visible.height > Math.max(150, hauteurFenetre * 0.2);
}

/**
 * Sa bulle : son bord gauche, sans sortir de la fenêtre, la place de sa queue, vers sa tête, et `dessous` quand elle ne
 * tient pas au-dessus de lui (il est en haut de la fenêtre) et qu'il y a plus de place sous lui. `verticale` : la hauteur
 * de la bulle, la place libre au-dessus de lui (jusqu'à l'en-tête) et sous lui (jusqu'au bas de la fenêtre).
 */
export function placeDeLaBulle(
  centre: number,
  largeurBulle: number,
  largeurFenetre: number,
  verticale: { hauteur: number; dessus: number; dessous: number } = { hauteur: 0, dessus: Infinity, dessous: 0 },
): { gauche: number; queue: number; dessous: boolean } {
  const bord = 8;
  const gauche = borner(centre - largeurBulle * 0.36, bord, largeurFenetre - bord - largeurBulle);
  const dessous = verticale.hauteur + bord > verticale.dessus && verticale.dessous > verticale.dessus;
  return { gauche, queue: borner(centre - gauche, 18, largeurBulle - 26), dessous };
}

/** Sous cette hauteur de fenêtre (téléphone couché, page très agrandie), sa prison s'efface : elle prendrait trop de place. */
export const PRISON_FENETRE_MIN = 480;

/** Le cadre de son corps, sans les marges vides du dessin : ce qui couvrirait la mention de licence. */
export const corpsA = (p: Point, cote: number): Cadre => ({ gauche: p.x + 8 * cote, droite: p.x + 40 * cote, haut: p.y + 4 * cote, bas: p.y + CASES_H * cote });
