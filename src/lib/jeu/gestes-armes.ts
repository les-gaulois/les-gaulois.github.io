/**
 * Les gestes du Gaulois dans le duel « Coup pour coup » de « Mon Gaulois » (22 novembre 2026, chantier 8 du duel) : le
 * Gaulois se sert vraiment de l'objet de la carte jouée, au lieu d'une simple poussée. La lame tranche en arc, la masse
 * s'abat de haut, la lance pique, l'arc et la fronde tirent un projectile qui vole jusqu'à l'adversaire ; la tête cogne, le
 * haut garde, les pieds prennent de l'élan, le bas souffle. Chorégraphies et dessins de Claude Fable 5.2, code de Claude
 * Opus 5.5.
 *
 * Tout ici est pur, sans navigateur. L'écran du duel (`src/components/village/duel/`) :
 * 1. prend le geste d'une carte (`gesteDeLaCarte`) et les dessins du Gaulois, une fois par tenue (`dessinsDuGaulois`) ;
 * 2. à chaque image, demande la pose du geste à l'instant voulu (`poseDuGeste`), puis ses cases (`imageDeLaPose`) ;
 * 3. peint ces cases sur une toile de `IMAGE_DU_GESTE` cases, posée à une échelle entière : la case (`MARGES.gauche`,
 *    `MARGES.haut`) de l'image est le coin du Gaulois au repos ; il ajoute l'élan, `pose.elan` fois la distance d'élan du
 *    geste (`distanceDElan`, ou `distancesDElanFaceAFace` quand les deux frappent ensemble, calculée une fois par coup pour
 *    que l'arme tenue touche juste l'adversaire), arrondi à un nombre entier de cases ;
 * 4. peint le projectile à part (`placeDuProjectile`, `imageDuProjectile`), parti du poing ou du bout de l'objet
 *    (`departDuProjectile`, relevé à `instantDuLacher`) ;
 * 5. pour que deux coups se touchent ensemble, lance chaque geste à l'instant voulu moins son `instantDeLImpact`, et fait
 *    réagir l'adversaire à cet instant (secousse, chiffres) : ce module ne le fait pas.
 *
 * Le Gaulois regarde vers la droite : l'adversaire est du côté des x croissants. Le Gaulois de droite se retourne comme
 * dans la maquette (`scaleX(-1)`), autour du milieu du Gaulois et non de l'image (`MILIEU_DU_GAULOIS`). Les angles sont en
 * degrés : 0, l'objet tel qu'il est dessiné, debout ; 90, couché vers l'adversaire ; les négatifs le portent en arrière.
 *
 * Les pixels restent nets : décalages en cases entières, rotation de l'objet en cases (l'objet est agrandi huit fois par
 * Scale2x puis relu case par case, comme le font les dessinateurs en pixels), rien qui clignote ; un court arrêt avant
 * chaque impact. Sous `prefers-reduced-motion`, chaque geste n'est qu'une pose fixe, lisible (`calme`).
 */
import { casesDuGaulois, changerObjet, couleursDeBase, GAULOIS_HAUTEUR, GAULOIS_LARGEUR, modeleDuGaulois, OBJETS, type Tenue } from "../../../supabase/functions/code-discord/gaulois";

/** Un point, en cases. */
export interface Point {
  x: number;
  y: number;
}

/** Des cases, rangée par rangée : une couleur « #rrggbb » ou `null` (vide), comme `casesDuGaulois`. */
export type Cases = readonly (string | null)[];

// ---------------------------------------------------------------------------------------------------------------------
// Les familles d'armes
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Les familles d'armes, chacune son geste : les lames, les masses (marteaux, haches, gourdins), les hampes (lances, fourches),
 * le tir (arc, arbalète, fronde, objets lancés), les boucliers, les instruments de musique, les objets drôles, et les mains
 * nues.
 */
export const FAMILLES_D_ARMES = ["lame", "masse", "hampe", "tir", "bouclier", "son", "drole", "poings"] as const;
export type FamilleDArme = (typeof FAMILLES_D_ARMES)[number];

/** Le nom de chaque famille, tel qu'il s'affiche. */
export const NOMS_DES_FAMILLES: Readonly<Record<FamilleDArme, string>> = {
  lame: "Épées et lames",
  masse: "Masses et marteaux",
  hampe: "Lances et fourches",
  tir: "Arcs, frondes et objets lancés",
  bouclier: "Boucliers",
  son: "Instruments",
  drole: "Objets drôles",
  poings: "Mains nues",
};

/** La famille de chacune des 75 armes de la garde-robe (22 novembre 2026), d'après son nom et son dessin. */
const FAMILLE_DE_CHAQUE_ARME: Readonly<Record<string, FamilleDArme>> = {
  aucune: "poings",
  // Les lames : elles tranchent en arc.
  dague: "lame",
  coutelas: "lame",
  "epee-bois": "lame",
  "epee-courte": "lame",
  "epee-longue": "lame",
  "sabre-courbe": "lame",
  "faux-guerre": "lame",
  epee: "lame",
  "epee-bronze": "lame",
  "epee-flamboyante": "lame",
  "epee-or": "lame",
  // Les masses : elles s'abattent de haut.
  gourdin: "masse",
  hache: "masse",
  "hache-double": "masse",
  "marteau-guerre": "masse",
  "marteau-forgeron": "masse",
  masse: "masse",
  "masse-ailettes": "masse",
  "fleau-armes": "masse",
  torche: "masse",
  "pelle-tranchee": "masse",
  "sceptre-bois-flotte": "masse",
  // Les hampes : elles piquent.
  lance: "hampe",
  "fourche-guerre": "hampe",
  hallebarde: "hampe",
  trident: "hampe",
  "lance-ceremonie": "hampe",
  "baton-marche": "hampe",
  rateau: "hampe",
  drapeau: "hampe",
  etendard: "hampe",
  "fourchette-geante": "hampe",
  // Le tir : un projectile vole jusqu'à l'adversaire.
  arc: "tir",
  arbalete: "tir",
  fronde: "tir",
  "lance-patates": "tir",
  javelot: "tir",
  // Les boucliers : ils chargent.
  "bouclier-bois": "bouclier",
  "bouclier-rond-peint": "bouclier",
  "bouclier-long": "bouclier",
  "bouclier-umbo": "bouclier",
  "bouclier-bronze": "bouclier",
  "rondache-bronze": "bouclier",
  "bouclier-or-cisele": "bouclier",
  // Les instruments : le son vole jusqu'à l'adversaire.
  "cor-guerre": "son",
  clairon: "son",
  carnyx: "son",
  cornemuse: "son",
  tambour: "son",
  "harpe-or": "son",
  talkie: "son",
  // Les objets drôles.
  baguette: "drole",
  poele: "drole",
  "rouleau-patisserie": "drole",
  balai: "drole",
  louche: "drole",
  saucisson: "drole",
  "tue-mouche": "drole",
  poulet: "drole",
  gamelle: "drole",
  jumelles: "drole",
  parapluie: "drole",
  "canne-peche": "drole",
  jambon: "drole",
  lanterne: "drole",
  oie: "drole",
  "sucre-orge": "drole",
  chat: "drole",
  "pelle-tarte-or": "drole",
  "plume-or": "drole",
  "panneau-d-erreur": "drole",
  "pancarte-par-ici": "drole",
  "gros-bouton-rouge": "drole",
  "telecommande-de-tir": "drole",
};

/** Pour une arme ajoutée plus tard : les mots de son nom qui disent sa famille, dans cet ordre. Sinon, elle est drôle. */
const MOTS_DES_FAMILLES: readonly (readonly [RegExp, FamilleDArme])[] = [
  [/bouclier|rondache|ecu\b|pavois/, "bouclier"],
  [/\barc\b|arbalete|fronde|javelot|lance-(?:patates|pierres?)|sarbacane|propulseur/, "tir"],
  [/\bcor\b|clairon|carnyx|cornemuse|tambour|harpe|flute|trompe|lyre|corne\b/, "son"],
  [/epee|lame|dague|sabre|coutelas|glaive|faux\b|faucille|serpe|poignard/, "lame"],
  [/masse|marteau|hache|gourdin|fleau|massue|maillet|pioche|torche|sceptre|pelle de tranchee/, "masse"],
  [/lance|fourche|hallebarde|trident|pique|epieu|baton|rateau|drapeau|etendard|hampe/, "hampe"],
];

/** Un texte en minuscules, sans accents. */
const simple = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * La famille d'une arme : celle de la table pour les 75 armes connues, sinon celle que disent les mots de son nom (ou de
 * son identifiant), sinon un objet drôle. Sans arme (`aucune`, vide), les mains nues.
 */
export function familleDeLArme(id: string | null | undefined, nom?: string): FamilleDArme {
  if (!id || id === "aucune") return "poings";
  const connue = FAMILLE_DE_CHAQUE_ARME[id];
  if (connue) return connue;
  const texte = simple(`${nom ?? OBJETS.arme[id]?.nom ?? ""} ${id}`);
  for (const [mots, famille] of MOTS_DES_FAMILLES) if (mots.test(texte)) return famille;
  return "drole";
}

/** Les armes que la table range (pour les tests). */
export const ARMES_RANGEES: readonly string[] = Object.keys(FAMILLE_DE_CHAQUE_ARME);

// ---------------------------------------------------------------------------------------------------------------------
// Les gestes
// ---------------------------------------------------------------------------------------------------------------------

/** Les rôles des cartes du duel, comme dans la maquette : l'arme frappe, la tête cogne, le haut garde, les pieds prennent de l'élan, le bas souffle. */
export const ROLES_DU_DUEL = ["frappe", "tete", "garde", "elan", "souffle"] as const;
export type RoleDuDuel = (typeof ROLES_DU_DUEL)[number];

/** Les gestes : un par famille d'armes, et un pour chacun des quatre autres rôles. */
export const GESTES = [...FAMILLES_D_ARMES, "cogne", "garde", "elan", "souffle"] as const;
export type Geste = (typeof GESTES)[number];

/** Le geste d'une carte jouée : celui de la famille de son arme pour une frappe, celui de son rôle sinon. */
export function gesteDeLaCarte(role: RoleDuDuel, arme?: string | null): Geste {
  if (role === "frappe") return familleDeLArme(arme);
  return role === "tete" ? "cogne" : role;
}

/** Ce qui vole vers l'adversaire : une pierre, une flèche, un carreau, une patate, le son, ou l'objet lui-même. */
export const SORTES_DE_PROJECTILES = ["pierre", "fleche", "carreau", "patate", "onde", "objet"] as const;
export type SorteDeProjectile = (typeof SORTES_DE_PROJECTILES)[number];

/** Le projectile d'une arme de tir. */
const PROJECTILE_DE_CHAQUE_ARME: Readonly<Record<string, SorteDeProjectile>> = {
  fronde: "pierre",
  arc: "fleche",
  arbalete: "carreau",
  "lance-patates": "patate",
  javelot: "objet",
};

/** Ce que tire un geste : le son pour un instrument, le projectile de l'arme pour le tir (une pierre si elle n'en a pas), rien sinon. */
export function projectileDuGeste(geste: Geste, arme?: string | null): SorteDeProjectile | null {
  if (geste === "son") return "onde";
  if (geste === "tir") return PROJECTILE_DE_CHAQUE_ARME[arme ?? ""] ?? (/arbalete/.test(arme ?? "") ? "carreau" : /\barc\b|^arc-/.test(arme ?? "") ? "fleche" : "pierre");
  return null;
}

/** L'objet tenu, son poing compris. */
export interface PoseDeLObjet {
  /** Décalage du poing, en cases, par rapport au buste. */
  x: number;
  y: number;
  /** Rotation autour du poing, en degrés : 90 le couche vers l'adversaire, les négatifs le portent en arrière. */
  angle: number;
  /** L'objet glisse le long de son manche, vers sa pointe (positif) ou vers l'arrière, le poing restant en place : la lance qui pique. */
  glisse: number;
  /** Faux quand l'objet a quitté la main : le javelot lancé. */
  visible: boolean;
  /** Vrai quand l'objet passe derrière le Gaulois (porté en arrière) ; le poing reste devant. */
  derriere: boolean;
}

/** Le projectile en vol : sa sorte et la part du chemin faite, de 0 (au poing) à 1 (sur l'adversaire). */
export interface ProjectileEnVol {
  sorte: SorteDeProjectile;
  avance: number;
}

/** La pose du Gaulois à un instant d'un geste. */
export interface Pose {
  /** Le Gaulois entier vers l'adversaire, en part de la distance d'élan de l'écran : 0 chez lui, 1 au contact ; négatif, il recule. */
  elan: number;
  /** Le Gaulois entier, en cases : négatif, il saute. */
  saut: number;
  /** La tête (rangées 0 à 33), en cases, par rapport au buste. */
  tete: Point;
  /** Le buste et les bras (rangées 34 à 49), en cases, par rapport aux jambes. */
  buste: Point;
  bras: Bras;
  objet: PoseDeLObjet;
  /** La traînée d'une lame : l'angle d'où elle part, jusqu'à l'angle de l'objet ; `null`, aucune. */
  traine: number | null;
  projectile: ProjectileEnVol | null;
}

/** Le Gaulois au repos, tel que le dessine `casesDuGaulois`. */
export const POSE_DE_REPOS: Pose = Object.freeze({
  elan: 0,
  saut: 0,
  tete: Object.freeze({ x: 0, y: 0 }),
  buste: Object.freeze({ x: 0, y: 0 }),
  bras: "repos",
  objet: Object.freeze({ x: 0, y: 0, angle: 0, glisse: 0, visible: true, derriere: false }),
  traine: null,
  projectile: null,
}) as Pose;

/** Une pose écrite dans une chorégraphie : ce qui n'est pas écrit est au repos. */
export interface PoseEcrite {
  elan?: number;
  saut?: number;
  tete?: Partial<Point>;
  buste?: Partial<Point>;
  bras?: Bras;
  objet?: Partial<Omit<PoseDeLObjet, "visible">>;
  /** La traînée : l'angle d'où elle part, pendant qu'on arrive à cette clé. */
  traine?: number;
  /**
   * Le lâcher du projectile : la première clé qui porte `tir` (à 0). Il vole ensuite seul, à vitesse égale, jusqu'à
   * l'impact ; les `tir` des clés suivantes ne servent qu'à se relire.
   */
  tir?: number;
}

/**
 * Comment on arrive à une clé depuis la précédente : d'un coup (`net`), à vitesse égale (`lineaire`, le vol d'un
 * projectile), en douceur (`doux`), vite puis en douceur (`vif`, les coups), ou lentement puis vite (`lance`).
 */
export type Douceur = "net" | "lineaire" | "doux" | "vif" | "lance";

const ADOUCIR: Readonly<Record<Douceur, (u: number) => number>> = {
  net: (u) => (u < 1 ? 0 : 1),
  lineaire: (u) => u,
  doux: (u) => u * u * (3 - 2 * u),
  vif: (u) => 1 - (1 - u) ** 3,
  lance: (u) => u ** 3,
};

/** Une clé : un instant (en millisecondes depuis le début du geste), la pose qu'on y atteint, et comment on l'atteint. */
export interface Cle {
  t: number;
  douceur?: Douceur;
  pose: PoseEcrite;
}

/** La chorégraphie d'un geste. */
export interface Choregraphie {
  /** Ce que fait le Gaulois, en quelques mots. */
  dit: string;
  /** Sa durée, en millisecondes : il revient au repos à la fin. */
  duree: number;
  /** L'instant où le coup touche l'adversaire (ou, pour la garde, où elle encaisse) ; `null` pour un geste sans coup. */
  impact: number | null;
  /** Le court arrêt avant l'impact : la pose ne bouge pas entre ces deux instants. */
  arret: readonly [number, number] | null;
  /** Les clés, de 0 à `duree`. La première et la dernière sont au repos. */
  cles: readonly Cle[];
  /** La pose fixe montrée pendant tout le geste sous `prefers-reduced-motion`. */
  calme: PoseEcrite;
}

// <choregraphies>
/**
 * Les chorégraphies des douze gestes (Claude Fable 5.2). Chacune raconte la même petite histoire : le Gaulois se prépare
 * en douceur, s'arrête un instant, donne son coup vite, puis revient sans se presser. Le tir et le son envoient leur
 * projectile juste après l'arrêt : il touche à l'impact.
 *
 * Un bras dessiné ne change que deux fois par geste (il se lève, puis il retombe). Il se lève ou se tend à l'instant où le
 * coup part, ou pendant la préparation, jamais au milieu d'un mouvement lent ; il retombe pendant le retour, et le
 * Gaulois finit par un petit tassement (`RETOMBE`) qui adoucit ce changement.
 */

/** Le bras vient de retomber : le Gaulois est un peu tassé, puis se redresse en douceur jusqu'au repos. */
const RETOMBE: PoseEcrite = { tete: { y: 1 }, buste: { y: 1 } };

/**
 * Un instrument tenu dans les bras (tambour, harpe, cornemuse) : il le prépare (`leve`), s'arrête, puis en joue (`joue`) ;
 * le son part à cet instant et vole jusqu'à l'adversaire.
 */
function jouerDansLesBras(dit: string, leve: PoseEcrite, joue: PoseEcrite): Choregraphie {
  return {
    dit,
    duree: 920,
    impact: 700,
    arret: [240, 330],
    cles: [
      { t: 0, pose: {} },
      { t: 240, douceur: "doux", pose: leve },
      { t: 330, douceur: "net", pose: leve },
      { t: 400, douceur: "vif", pose: { ...joue, tir: 0 } },
      { t: 700, douceur: "lineaire", pose: { ...joue, tir: 1 } },
      { t: 701, douceur: "net", pose: joue },
      { t: 920, douceur: "doux", pose: {} },
    ],
    calme: joue,
  };
}

/**
 * Une bête tenue dans les bras (le chat, l'oie) : on ne la fait ni tournoyer ni voler. Il la tend à bout de bras, et c'est
 * elle qui donne le coup, en se penchant de `penche` degrés vers l'adversaire.
 */
function tendreLaBete(dit: string, penche: number): Choregraphie {
  return {
    dit,
    duree: 880,
    impact: 430,
    arret: [280, 360],
    cles: [
      { t: 0, pose: {} },
      { t: 130, douceur: "doux", pose: { buste: { x: -1 } } },
      { t: 131, douceur: "net", pose: { bras: "tendu", buste: { x: -1 }, objet: { x: -3, y: 3 } } },
      { t: 280, douceur: "doux", pose: { elan: -0.08, bras: "tendu", tete: { x: -1 }, buste: { x: -2 }, objet: { x: -2, angle: -6 } } },
      { t: 360, douceur: "net", pose: { elan: -0.08, bras: "tendu", tete: { x: -1 }, buste: { x: -2 }, objet: { x: -2, angle: -6 } } },
      { t: 430, douceur: "vif", pose: { elan: 0.85, bras: "tendu", tete: { x: 1 }, buste: { x: 3 }, objet: { x: 3, angle: penche } } },
      { t: 530, douceur: "doux", pose: { elan: 0.81, bras: "tendu", buste: { x: 2 }, objet: { x: 1, angle: Math.round(penche / 3) } } },
      { t: 690, douceur: "doux", pose: { elan: 0.34, bras: "tendu", objet: { y: 2 } } },
      { t: 691, douceur: "net", pose: { elan: 0.34, ...RETOMBE } },
      { t: 880, douceur: "doux", pose: {} },
    ],
    calme: { bras: "tendu", buste: { x: 2 }, objet: { x: 2, angle: penche } },
  };
}

export const CHOREGRAPHIES: Readonly<Record<Geste, Choregraphie>> = {
  // La lame : ramenée en travers du corps, elle part en revers et tranche un grand arc par-dessus la tête ; la traînée
  // suit sa pointe.
  lame: {
    dit: "Il ramène la lame en travers du corps, puis tranche un grand arc devant lui.",
    duree: 800,
    impact: 340,
    arret: [190, 270],
    cles: [
      { t: 0, pose: {} },
      { t: 190, douceur: "doux", pose: { elan: -0.1, tete: { x: -1 }, buste: { x: -2 }, objet: { angle: -78 } } },
      { t: 270, douceur: "net", pose: { elan: -0.1, tete: { x: -1 }, buste: { x: -2 }, objet: { angle: -78 } } },
      { t: 271, douceur: "net", pose: { elan: -0.1, bras: "tendu", tete: { x: -1 }, buste: { x: -2 }, objet: { angle: -78 } } },
      { t: 340, douceur: "vif", pose: { elan: 0.6, bras: "tendu", tete: { x: 2 }, buste: { x: 3 }, objet: { angle: 104 }, traine: -78 } },
      { t: 440, douceur: "doux", pose: { elan: 0.56, bras: "tendu", tete: { x: 1 }, buste: { x: 2 }, objet: { angle: 116 }, traine: 40 } },
      { t: 600, douceur: "doux", pose: { elan: 0.27, bras: "tendu", buste: { x: 1 }, objet: { angle: 70 } } },
      { t: 601, douceur: "net", pose: { elan: 0.27, objet: { angle: 40 }, ...RETOMBE } },
      { t: 800, douceur: "doux", pose: {} },
    ],
    calme: { bras: "tendu", tete: { x: 1 }, buste: { x: 2 }, objet: { angle: 104 } },
  },
  // La masse : lourde. Il plie les genoux, la hisse au-dessus de sa tête, puis elle tombe de plus en plus vite et
  // rebondit un peu sur le coup.
  masse: {
    dit: "Il hisse la masse au-dessus de sa tête, puis l'abat de tout son poids.",
    duree: 900,
    impact: 410,
    arret: [250, 340],
    cles: [
      { t: 0, pose: {} },
      { t: 100, douceur: "doux", pose: RETOMBE },
      { t: 101, douceur: "net", pose: { bras: "plie", objet: { angle: -6 }, ...RETOMBE } },
      { t: 250, douceur: "doux", pose: { elan: -0.05, saut: -2, bras: "plie", tete: { y: -1 }, buste: { y: -1 }, objet: { angle: -30 } } },
      { t: 340, douceur: "net", pose: { elan: -0.05, saut: -2, bras: "plie", tete: { y: -1 }, buste: { y: -1 }, objet: { angle: -30 } } },
      { t: 410, douceur: "lance", pose: { elan: 0.62, bras: "plie", tete: { x: 1, y: 3 }, buste: { x: 2, y: 3 }, objet: { angle: 100 } } },
      { t: 480, douceur: "doux", pose: { elan: 0.62, bras: "plie", tete: { x: 1, y: 2 }, buste: { x: 2, y: 2 }, objet: { angle: 86 } } },
      { t: 580, douceur: "doux", pose: { elan: 0.58, bras: "plie", tete: { x: 1, y: 2 }, buste: { x: 2, y: 2 }, objet: { angle: 96 } } },
      { t: 720, douceur: "doux", pose: { elan: 0.25, bras: "plie", objet: { angle: 30 } } },
      { t: 721, douceur: "net", pose: { elan: 0.25, objet: { angle: 16 }, ...RETOMBE } },
      { t: 900, douceur: "doux", pose: {} },
    ],
    calme: { bras: "plie", tete: { x: 1, y: 2 }, buste: { x: 2, y: 2 }, objet: { angle: 96 } },
  },
  // La lance : couchée contre la hanche et ramenée en arrière, elle part tout droit, le bras tendu ; la hampe file dans
  // la main.
  hampe: {
    dit: "Il couche la lance, la ramène contre lui, puis pique droit devant.",
    duree: 820,
    impact: 350,
    arret: [210, 290],
    cles: [
      { t: 0, pose: {} },
      { t: 210, douceur: "doux", pose: { elan: -0.12, tete: { x: -1 }, buste: { x: -2 }, objet: { angle: 90, glisse: -7 } } },
      { t: 290, douceur: "net", pose: { elan: -0.12, tete: { x: -1 }, buste: { x: -2 }, objet: { angle: 90, glisse: -7 } } },
      { t: 291, douceur: "net", pose: { elan: -0.12, bras: "tendu", tete: { x: -1 }, buste: { x: -2 }, objet: { y: 4, angle: 90, glisse: -7 } } },
      { t: 350, douceur: "vif", pose: { elan: 0.47, bras: "tendu", tete: { x: 1 }, buste: { x: 3 }, objet: { angle: 90, glisse: 6 } } },
      { t: 460, douceur: "doux", pose: { elan: 0.44, bras: "tendu", buste: { x: 2 }, objet: { angle: 90, glisse: 3 } } },
      { t: 620, douceur: "doux", pose: { elan: 0.19, bras: "tendu", objet: { y: 3, angle: 84, glisse: -2 } } },
      { t: 621, douceur: "net", pose: { elan: 0.19, objet: { angle: 62 }, ...RETOMBE } },
      { t: 820, douceur: "doux", pose: {} },
    ],
    calme: { bras: "tendu", tete: { x: 1 }, buste: { x: 2 }, objet: { angle: 90, glisse: 5 } },
  },
  // Le tir, celui de l'arc : le bras tendu tient l'arc, la main tire la corde jusqu'au menton, le corps part en arrière ;
  // il lâche, et la flèche vole.
  tir: {
    dit: "Il tend son arc, la main au menton, s'arrête, et lâche : la flèche vole jusqu'à l'adversaire.",
    duree: 820,
    impact: 570,
    arret: [240, 340],
    cles: [
      { t: 0, pose: {} },
      { t: 110, douceur: "doux", pose: { buste: { x: 1 } } },
      { t: 111, douceur: "net", pose: { bras: "vise", buste: { x: 1 } } },
      { t: 240, douceur: "doux", pose: { elan: -0.05, bras: "vise", tete: { x: -1 }, buste: { x: -1 }, objet: { angle: -6 } } },
      { t: 340, douceur: "net", pose: { elan: -0.05, bras: "vise", tete: { x: -1 }, buste: { x: -1 }, objet: { angle: -6 } } },
      { t: 341, douceur: "net", pose: { elan: -0.05, bras: "vise", objet: { angle: 5 }, tir: 0 } },
      { t: 570, douceur: "lineaire", pose: { elan: -0.05, bras: "vise", objet: { angle: 5 }, tir: 1 } },
      { t: 571, douceur: "net", pose: { elan: -0.05, bras: "vise", objet: { angle: 5 } } },
      { t: 680, douceur: "doux", pose: { bras: "vise" } },
      { t: 681, douceur: "net", pose: RETOMBE },
      { t: 820, douceur: "doux", pose: {} },
    ],
    calme: { bras: "vise", tete: { x: -1 }, buste: { x: -1 }, objet: { angle: -6 } },
  },
  // Le bouclier : il se ramasse derrière, puis charge, le bouclier en avant, un peu penché.
  bouclier: {
    dit: "Il se ramasse derrière son bouclier, puis charge, le bouclier en avant.",
    duree: 820,
    impact: 340,
    arret: [200, 280],
    cles: [
      { t: 0, pose: {} },
      { t: 200, douceur: "doux", pose: { elan: -0.14, tete: { x: -1, y: 2 }, buste: { x: -2, y: 1 }, objet: { x: -5, y: -3 } } },
      { t: 280, douceur: "net", pose: { elan: -0.14, tete: { x: -1, y: 2 }, buste: { x: -2, y: 1 }, objet: { x: -5, y: -3 } } },
      { t: 281, douceur: "net", pose: { elan: -0.14, bras: "tendu", tete: { x: -1, y: 2 }, buste: { x: -2, y: 1 }, objet: { x: -8, y: 5 } } },
      { t: 340, douceur: "vif", pose: { elan: 0.92, bras: "tendu", tete: { x: 1, y: 1 }, buste: { x: 4, y: 1 }, objet: { x: 1, y: 4, angle: 8 } } },
      { t: 450, douceur: "doux", pose: { elan: 0.85, bras: "tendu", tete: { y: 1 }, buste: { x: 3, y: 1 }, objet: { y: 4, angle: 4 } } },
      { t: 610, douceur: "doux", pose: { elan: 0.37, bras: "tendu", buste: { x: 1 }, objet: { x: -3, y: 6 } } },
      { t: 611, douceur: "net", pose: { elan: 0.37, objet: { x: 1, y: -1 }, ...RETOMBE } },
      { t: 820, douceur: "doux", pose: {} },
    ],
    calme: { bras: "tendu", tete: { x: 1, y: 1 }, buste: { x: 3, y: 1 }, objet: { x: 1, y: 4, angle: 8 } },
  },
  // L'instrument : porté à la bouche, il gonfle la poitrine en arrière, puis souffle en avant ; le son part.
  son: {
    dit: "Il porte l'instrument à sa bouche, gonfle la poitrine et souffle : le son vole jusqu'à l'adversaire.",
    duree: 900,
    impact: 660,
    arret: [260, 350],
    cles: [
      { t: 0, pose: {} },
      { t: 120, douceur: "doux", pose: RETOMBE },
      { t: 121, douceur: "net", pose: { bras: "plie", objet: { angle: -6 }, ...RETOMBE } },
      { t: 260, douceur: "doux", pose: { bras: "plie", tete: { x: -1, y: -1 }, buste: { x: -1, y: -1 }, objet: { angle: -16 } } },
      { t: 350, douceur: "net", pose: { bras: "plie", tete: { x: -1, y: -1 }, buste: { x: -1, y: -1 }, objet: { angle: -16 } } },
      { t: 351, douceur: "net", pose: { bras: "plie", tete: { x: 1 }, buste: { x: 1 }, objet: { angle: 12 }, tir: 0 } },
      { t: 660, douceur: "lineaire", pose: { bras: "plie", tete: { x: 1 }, buste: { x: 1 }, objet: { angle: 12 }, tir: 1 } },
      { t: 661, douceur: "net", pose: { bras: "plie", tete: { x: 1 }, buste: { x: 1 }, objet: { angle: 12 } } },
      { t: 770, douceur: "doux", pose: { bras: "plie" } },
      { t: 771, douceur: "net", pose: RETOMBE },
      { t: 900, douceur: "doux", pose: {} },
    ],
    calme: { bras: "plie", tete: { x: 1 }, buste: { x: 1 }, objet: { angle: 12 } },
  },
  // L'objet drôle : un moulinet de jongleur, un petit saut, et il l'abat sur l'adversaire ; l'objet rebondit une fois.
  drole: {
    dit: "Il fait un moulinet, puis l'abat sur l'adversaire : l'objet rebondit.",
    duree: 1000,
    impact: 520,
    arret: [370, 450],
    cles: [
      { t: 0, pose: {} },
      { t: 110, douceur: "doux", pose: RETOMBE },
      { t: 111, douceur: "net", pose: { bras: "plie", ...RETOMBE } },
      { t: 370, douceur: "doux", pose: { bras: "plie", saut: -2, tete: { y: -1 }, objet: { angle: 318 } } },
      { t: 450, douceur: "net", pose: { bras: "plie", saut: -2, tete: { y: -1 }, objet: { angle: 318 } } },
      { t: 520, douceur: "vif", pose: { elan: 0.7, bras: "plie", tete: { x: 1, y: 2 }, buste: { x: 2, y: 2 }, objet: { angle: 442 } } },
      { t: 600, douceur: "doux", pose: { elan: 0.68, bras: "plie", tete: { x: 1, y: 1 }, buste: { x: 2, y: 1 }, objet: { angle: 408 } } },
      { t: 690, douceur: "doux", pose: { elan: 0.64, bras: "plie", tete: { x: 1, y: 1 }, buste: { x: 2, y: 1 }, objet: { angle: 428 } } },
      { t: 820, douceur: "doux", pose: { elan: 0.28, bras: "plie", objet: { angle: 380 } } },
      { t: 821, douceur: "net", pose: { elan: 0.28, objet: { angle: 372 }, ...RETOMBE } },
      { t: 1000, douceur: "doux", pose: { objet: { angle: 360 } } },
    ],
    calme: { bras: "plie", tete: { x: 1, y: 1 }, buste: { x: 2, y: 1 }, objet: { angle: 78 } },
  },
  // Les mains nues : l'épaule recule, puis le poing part tout droit.
  poings: {
    dit: "Il recule l'épaule, puis envoie son poing droit devant.",
    duree: 740,
    impact: 310,
    arret: [170, 250],
    cles: [
      { t: 0, pose: {} },
      { t: 170, douceur: "doux", pose: { elan: -0.1, tete: { x: -1 }, buste: { x: -3 } } },
      { t: 250, douceur: "net", pose: { elan: -0.1, tete: { x: -1 }, buste: { x: -3 } } },
      { t: 251, douceur: "net", pose: { elan: -0.1, bras: "tendu", tete: { x: -1 }, buste: { x: -3 } } },
      { t: 310, douceur: "vif", pose: { elan: 1, bras: "tendu", tete: { x: 1 }, buste: { x: 4 } } },
      { t: 420, douceur: "doux", pose: { elan: 0.94, bras: "tendu", tete: { x: 1 }, buste: { x: 3 } } },
      { t: 540, douceur: "doux", pose: { elan: 0.45, bras: "tendu", buste: { x: 1 } } },
      { t: 541, douceur: "net", pose: { elan: 0.45, ...RETOMBE } },
      { t: 740, douceur: "doux", pose: {} },
    ],
    calme: { bras: "tendu", tete: { x: 1 }, buste: { x: 3 } },
  },
  // La tête cogne : le front en avant, plus bas que les épaules, l'arme traînée derrière.
  cogne: {
    dit: "Il baisse la tête et fonce, le front en avant.",
    duree: 800,
    impact: 340,
    arret: [190, 270],
    cles: [
      { t: 0, pose: {} },
      { t: 190, douceur: "doux", pose: { elan: -0.12, tete: { x: 1, y: 3 }, buste: { y: 1 }, objet: { angle: -12, derriere: true } } },
      { t: 270, douceur: "net", pose: { elan: -0.12, tete: { x: 1, y: 3 }, buste: { y: 1 }, objet: { angle: -12, derriere: true } } },
      { t: 340, douceur: "vif", pose: { elan: 1, tete: { x: 5, y: 4 }, buste: { x: 2, y: 2 }, objet: { angle: -28, derriere: true } } },
      { t: 450, douceur: "doux", pose: { elan: 0.92, tete: { x: 3, y: 3 }, buste: { x: 1, y: 1 }, objet: { angle: -20, derriere: true } } },
      { t: 640, douceur: "doux", pose: { elan: 0.3, tete: { x: 1, y: 1 }, objet: { angle: -6 } } },
      { t: 800, douceur: "doux", pose: {} },
    ],
    calme: { tete: { x: 4, y: 4 }, buste: { x: 2, y: 2 }, objet: { angle: -24, derriere: true } },
  },
  // Le haut garde : les bras se lèvent, l'arme dressée ; il se tasse, encaisse le coup, recule d'un pas et tient bon.
  garde: {
    dit: "Il lève les bras, se tasse et encaisse le coup.",
    duree: 800,
    impact: 340,
    arret: [200, 320],
    cles: [
      { t: 0, pose: {} },
      { t: 110, douceur: "doux", pose: RETOMBE },
      { t: 111, douceur: "net", pose: { bras: "garde", objet: { angle: -8 }, ...RETOMBE } },
      { t: 200, douceur: "doux", pose: { bras: "garde", tete: { y: 2 }, buste: { y: 1 }, objet: { angle: -22 } } },
      { t: 320, douceur: "net", pose: { bras: "garde", tete: { y: 2 }, buste: { y: 1 }, objet: { angle: -22 } } },
      { t: 340, douceur: "vif", pose: { elan: -0.14, bras: "garde", tete: { x: -1, y: 2 }, buste: { x: -1, y: 1 }, objet: { angle: -30 } } },
      { t: 520, douceur: "doux", pose: { elan: -0.06, bras: "garde", tete: { y: 1 }, buste: { y: 1 }, objet: { angle: -20 } } },
      { t: 640, douceur: "doux", pose: { bras: "garde", objet: { angle: -8 } } },
      { t: 641, douceur: "net", pose: RETOMBE },
      { t: 800, douceur: "doux", pose: {} },
    ],
    calme: { bras: "garde", tete: { y: 2 }, buste: { y: 1 }, objet: { angle: -22 } },
  },
  // Les pieds prennent de l'élan : il recule, se ramasse, puis se détend d'un petit bond sur place.
  elan: {
    dit: "Il recule, ramasse son poids, et se détend d'un bond.",
    duree: 880,
    impact: null,
    arret: null,
    cles: [
      { t: 0, pose: {} },
      { t: 320, douceur: "doux", pose: { elan: -0.32, tete: { x: -1, y: 3 }, buste: { x: -1, y: 2 }, objet: { angle: -16 } } },
      { t: 470, douceur: "net", pose: { elan: -0.32, tete: { x: -1, y: 3 }, buste: { x: -1, y: 2 }, objet: { angle: -16 } } },
      { t: 590, douceur: "vif", pose: { elan: -0.14, saut: -4, tete: { y: -1 }, objet: { angle: 10 } } },
      { t: 720, douceur: "lance", pose: { elan: -0.06, ...RETOMBE } },
      { t: 880, douceur: "doux", pose: {} },
    ],
    calme: { elan: -0.32, tete: { x: -1, y: 3 }, buste: { x: -1, y: 2 }, objet: { angle: -16 } },
  },
  // Le bas souffle : il relâche tout, puis prend une grande inspiration qui le grandit.
  souffle: {
    dit: "Il relâche les épaules, puis respire à fond et se redresse.",
    duree: 1160,
    impact: null,
    arret: null,
    cles: [
      { t: 0, pose: {} },
      { t: 280, douceur: "doux", pose: { tete: { y: 2 }, buste: { y: 1 }, objet: { angle: 8 } } },
      { t: 620, douceur: "doux", pose: { tete: { y: -2 }, buste: { y: -1 }, objet: { angle: -4 } } },
      { t: 780, douceur: "net", pose: { tete: { y: -2 }, buste: { y: -1 }, objet: { angle: -4 } } },
      { t: 1160, douceur: "doux", pose: {} },
    ],
    calme: { tete: { y: -2 }, buste: { y: -1 }, objet: { angle: -4 } },
  },
};

/**
 * Les armes qui ont leur propre geste dans leur famille : il remplace celui de la famille quand le Gaulois la tient.
 * La fronde tournoie, le javelot part de la main, l'arbalète s'épaule, le lance-patates tire en cloche ; le tambour se
 * frappe, la harpe se pince, la cornemuse se presse ; le chat et l'oie ne tournoient jamais, ce sont eux qui attaquent ;
 * la télécommande se pointe et se presse, de loin.
 */
export const CHOREGRAPHIES_PROPRES: Readonly<Record<string, Choregraphie>> = {
  // La fronde : deux tours à côté de la tête, un arrêt, la poche en arrière, puis le
  // lâcher ; la fronde finit son tour pendant que la pierre vole en cloche.
  fronde: {
    dit: "Il fait tournoyer sa fronde, s'arrête, et lâche : la pierre vole en cloche.",
    duree: 1060,
    impact: 890,
    arret: [500, 580],
    cles: [
      { t: 0, pose: {} },
      { t: 110, douceur: "doux", pose: RETOMBE },
      { t: 111, douceur: "net", pose: { bras: "plie", ...RETOMBE } },
      { t: 500, douceur: "doux", pose: { elan: -0.05, bras: "plie", tete: { x: -1 }, buste: { x: -1 }, objet: { angle: 855 } } },
      { t: 580, douceur: "net", pose: { elan: -0.05, bras: "plie", tete: { x: -1 }, buste: { x: -1 }, objet: { angle: 855 } } },
      { t: 640, douceur: "vif", pose: { bras: "plie", tete: { x: 1 }, buste: { x: 2 }, objet: { angle: 990 }, tir: 0 } },
      { t: 890, douceur: "lineaire", pose: { bras: "plie", tete: { x: 1 }, buste: { x: 1 }, objet: { angle: 1080 }, tir: 1 } },
      { t: 891, douceur: "net", pose: { bras: "plie", tete: { x: 1 }, buste: { x: 1 }, objet: { angle: 1080 } } },
      { t: 940, douceur: "doux", pose: { bras: "plie", objet: { angle: 1080 } } },
      { t: 941, douceur: "net", pose: { objet: { angle: 1080 }, ...RETOMBE } },
      { t: 1060, douceur: "doux", pose: { objet: { angle: 1080 } } },
    ],
    calme: { bras: "plie", tete: { x: 1 }, buste: { x: 1 }, objet: { angle: 135 } },
  },
  // Le javelot : porté à l'épaule, ramené en arrière, puis lancé ; il quitte la main et vole presque droit.
  javelot: {
    dit: "Il porte le javelot à l'épaule, le ramène en arrière, et le lance : il vole jusqu'à l'adversaire.",
    duree: 900,
    impact: 650,
    arret: [260, 350],
    cles: [
      { t: 0, pose: {} },
      { t: 110, douceur: "doux", pose: RETOMBE },
      { t: 111, douceur: "net", pose: { bras: "plie", objet: { angle: 20 }, ...RETOMBE } },
      { t: 260, douceur: "doux", pose: { elan: -0.1, bras: "plie", tete: { x: -1 }, buste: { x: -3 }, objet: { angle: 78, glisse: -6 } } },
      { t: 350, douceur: "net", pose: { elan: -0.1, bras: "plie", tete: { x: -1 }, buste: { x: -3 }, objet: { angle: 78, glisse: -6 } } },
      { t: 410, douceur: "vif", pose: { elan: 0.22, bras: "plie", tete: { x: 1, y: 1 }, buste: { x: 3, y: 1 }, objet: { angle: 90, glisse: 6 }, tir: 0 } },
      { t: 650, douceur: "lineaire", pose: { elan: 0.22, bras: "plie", tete: { x: 1, y: 1 }, buste: { x: 3, y: 1 }, objet: { angle: 90, glisse: 6 }, tir: 1 } },
      { t: 651, douceur: "net", pose: { elan: 0.22, bras: "plie", tete: { x: 1, y: 1 }, buste: { x: 3, y: 1 } } },
      { t: 770, douceur: "doux", pose: { elan: 0.08, bras: "plie" } },
      { t: 771, douceur: "net", pose: { elan: 0.08, ...RETOMBE } },
      { t: 900, douceur: "doux", pose: {} },
    ],
    calme: { bras: "plie", tete: { x: -1 }, buste: { x: -2 }, objet: { angle: 78, glisse: -4 } },
  },
  // L'arbalète : épaulée à bout de bras, la joue contre le fût ; le carreau part vite et droit, l'arme recule d'un cran.
  arbalete: {
    dit: "Il épaule son arbalète, vise, et tire : le carreau file droit sur l'adversaire.",
    duree: 860,
    impact: 530,
    arret: [270, 360],
    cles: [
      { t: 0, pose: {} },
      { t: 130, douceur: "doux", pose: { objet: { angle: 40 } } },
      { t: 131, douceur: "net", pose: { bras: "tendu", objet: { x: -2, y: 3, angle: 52 } } },
      { t: 270, douceur: "doux", pose: { bras: "tendu", tete: { x: 2, y: 1 }, buste: { x: -1 }, objet: { x: -2, angle: 90 } } },
      { t: 360, douceur: "net", pose: { bras: "tendu", tete: { x: 2, y: 1 }, buste: { x: -1 }, objet: { x: -2, angle: 90 } } },
      { t: 361, douceur: "net", pose: { bras: "tendu", tete: { x: 1, y: 1 }, buste: { x: -2 }, objet: { x: -3, angle: 84 }, tir: 0 } },
      { t: 530, douceur: "lineaire", pose: { bras: "tendu", tete: { x: 1, y: 1 }, buste: { x: -2 }, objet: { x: -3, angle: 84 }, tir: 1 } },
      { t: 531, douceur: "net", pose: { bras: "tendu", tete: { x: 1, y: 1 }, buste: { x: -2 }, objet: { x: -3, angle: 84 } } },
      { t: 690, douceur: "doux", pose: { bras: "tendu", objet: { x: -2, y: 3, angle: 56 } } },
      { t: 691, douceur: "net", pose: { objet: { angle: 34 }, ...RETOMBE } },
      { t: 860, douceur: "doux", pose: {} },
    ],
    calme: { bras: "tendu", tete: { x: 2, y: 1 }, buste: { x: -1 }, objet: { x: -2, angle: 90 } },
  },
  // Le lance-patates : penché comme un mortier ; le coup le fait reculer, la patate monte haut et retombe.
  "lance-patates": {
    dit: "Il penche son lance-patates, s'arrête, et tire : la patate monte haut et retombe sur l'adversaire.",
    duree: 960,
    impact: 730,
    arret: [250, 340],
    cles: [
      { t: 0, pose: {} },
      { t: 250, douceur: "doux", pose: { tete: { x: -1 }, buste: { x: -1 }, objet: { angle: 52 } } },
      { t: 340, douceur: "net", pose: { tete: { x: -1 }, buste: { x: -1 }, objet: { angle: 52 } } },
      { t: 341, douceur: "net", pose: { elan: -0.06, tete: { x: -1, y: 1 }, buste: { x: -3, y: 1 }, objet: { angle: 44, glisse: -4 }, tir: 0 } },
      { t: 730, douceur: "lineaire", pose: { elan: -0.06, tete: { x: -1 }, buste: { x: -1 }, objet: { angle: 52 }, tir: 1 } },
      { t: 731, douceur: "net", pose: { elan: -0.06, tete: { x: -1 }, buste: { x: -1 }, objet: { angle: 52 } } },
      { t: 960, douceur: "doux", pose: {} },
    ],
    calme: { tete: { x: -1 }, buste: { x: -1 }, objet: { angle: 52 } },
  },
  // Le tambour : il le soulève, puis le rabat d'un coup sec ; le son part au choc.
  tambour: jouerDansLesBras(
    "Il soulève son tambour et frappe un grand coup : le son vole jusqu'à l'adversaire.",
    { tete: { y: -1 }, buste: { y: -1 }, objet: { y: -4, angle: -8 } },
    { tete: { x: 1, y: 1 }, buste: { x: 1, y: 1 }, objet: { y: 2, angle: 4 } },
  ),
  // La harpe : serrée contre lui, puis penchée vers l'adversaire d'un grand geste qui pince les cordes.
  "harpe-or": jouerDansLesBras(
    "Il serre sa harpe contre lui, puis pince les cordes d'un grand geste : le son vole jusqu'à l'adversaire.",
    { tete: { x: -1 }, buste: { x: -1 }, objet: { x: -2, angle: -14 } },
    { tete: { x: 1 }, buste: { x: 1 }, objet: { x: 2, angle: 12 } },
  ),
  // La cornemuse : il la gonfle en se grandissant, puis presse la poche contre lui.
  cornemuse: jouerDansLesBras(
    "Il gonfle sa cornemuse, puis presse la poche contre lui : le son vole jusqu'à l'adversaire.",
    { tete: { y: -2 }, buste: { y: -1 }, objet: { x: 2, y: -3, angle: 8 } },
    { tete: { x: 1, y: 1 }, buste: { x: 1, y: 1 }, objet: { x: -2, y: 1, angle: -6 } },
  ),
  // Le chat : tendu à bout de bras, il bondit des pattes vers l'adversaire.
  chat: tendreLaBete("Il tend son chat à bout de bras : c'est le chat qui donne le coup de patte.", 16),
  // L'oie : tendue à bout de bras, elle donne un grand coup de bec.
  oie: tendreLaBete("Il tend son oie à bout de bras : c'est l'oie qui donne le coup de bec.", 30),
  // La télécommande : il ne bouge pas de chez lui, vise, et presse le bouton.
  "telecommande-de-tir": {
    dit: "Sans bouger de sa place, il pointe sa télécommande sur l'adversaire et presse le bouton.",
    duree: 880,
    impact: 440,
    arret: [300, 380],
    cles: [
      { t: 0, pose: {} },
      { t: 130, douceur: "doux", pose: { objet: { angle: 34 } } },
      { t: 131, douceur: "net", pose: { bras: "tendu", objet: { x: -2, y: 3, angle: 46 } } },
      { t: 300, douceur: "doux", pose: { bras: "tendu", tete: { x: 1, y: 1 }, objet: { x: -2, angle: 90 } } },
      { t: 380, douceur: "net", pose: { bras: "tendu", tete: { x: 1, y: 1 }, objet: { x: -2, angle: 90 } } },
      { t: 440, douceur: "vif", pose: { bras: "tendu", tete: { x: 2, y: 1 }, buste: { x: 2 }, objet: { x: 3, angle: 90 } } },
      { t: 560, douceur: "doux", pose: { bras: "tendu", tete: { x: 1 }, objet: { angle: 90 } } },
      { t: 710, douceur: "doux", pose: { bras: "tendu", objet: { x: -2, y: 3, angle: 50 } } },
      { t: 711, douceur: "net", pose: { objet: { angle: 30 }, ...RETOMBE } },
      { t: 880, douceur: "doux", pose: {} },
    ],
    calme: { bras: "tendu", tete: { x: 2, y: 1 }, buste: { x: 2 }, objet: { x: 3, angle: 90 } },
  },
};
// </choregraphies>

/** La chorégraphie d'un geste, pour l'arme tenue : la sienne si elle en a une dans sa famille, celle du geste sinon. */
export function choregraphieDe(geste: Geste, arme?: string | null): Choregraphie {
  const propre = arme ? CHOREGRAPHIES_PROPRES[arme] : undefined;
  return propre && familleDeLArme(arme) === geste ? propre : CHOREGRAPHIES[geste];
}

/** Une pose écrite, complétée par le repos. */
function poseComplete(p: PoseEcrite): Pose {
  return {
    elan: p.elan ?? 0,
    saut: p.saut ?? 0,
    tete: { x: p.tete?.x ?? 0, y: p.tete?.y ?? 0 },
    buste: { x: p.buste?.x ?? 0, y: p.buste?.y ?? 0 },
    bras: p.bras ?? "repos",
    objet: {
      x: p.objet?.x ?? 0,
      y: p.objet?.y ?? 0,
      angle: p.objet?.angle ?? 0,
      glisse: p.objet?.glisse ?? 0,
      visible: true,
      derriere: p.objet?.derriere ?? false,
    },
    traine: null,
    projectile: null,
  };
}

const entre = (a: number, b: number, u: number): number => a + (b - a) * u;
const millieme = (v: number): number => Math.round(v * 1000) / 1000 + 0;
const entier = (v: number): number => Math.round(v) + 0;

/** Les options d'une pose : l'arme tenue (pour son projectile), et le mouvement réduit (`prefers-reduced-motion`). */
export interface OptionsDuGeste {
  arme?: string | null;
  calme?: boolean;
}

/** La durée d'un geste, en millisecondes, pour l'arme tenue. */
export const dureeDuGeste = (geste: Geste, arme?: string | null): number => choregraphieDe(geste, arme).duree;

/**
 * L'instant où le coup d'un geste touche l'adversaire (où la garde encaisse), en millisecondes depuis son début, pour
 * l'arme tenue ; `null` pour l'élan et le souffle. Pour que deux coups se touchent ensemble, l'écran lance chaque geste à
 * l'instant voulu moins le sien.
 */
export const instantDeLImpact = (geste: Geste, arme?: string | null): number | null => choregraphieDe(geste, arme).impact;

/**
 * L'instant où le projectile d'un geste part (le lâcher), en millisecondes depuis son début, pour l'arme tenue ; `null`
 * pour un geste qui ne tire rien. L'écran relève à cet instant le point de départ (`departDuProjectile`) : la fronde, elle,
 * continue de tourner pendant le vol.
 */
export function instantDuLacher(geste: Geste, arme?: string | null): number | null {
  if (!projectileDuGeste(geste, arme)) return null;
  return choregraphieDe(geste, arme).cles.find((k) => k.pose.tir !== undefined)?.t ?? null;
}

/**
 * La pose d'un geste à l'instant `t` (en millisecondes depuis son début) : au repos avant et après. Les décalages sont en
 * cases entières, les angles en degrés entiers ; l'élan et l'avance du projectile au millième. Sous `calme`, la pose fixe
 * du geste pendant toute sa durée.
 */
export function poseDuGeste(geste: Geste, t: number, options: OptionsDuGeste = {}): Pose {
  const c = choregraphieDe(geste, options.arme);
  if (!(t > 0) || t >= c.duree) return poseComplete({});
  const sorte = projectileDuGeste(geste, options.arme);
  if (options.calme) return poseComplete(c.calme);
  let i = 1;
  while (i < c.cles.length - 1 && (c.cles[i]?.t ?? 0) <= t) i++;
  const avant = c.cles[i - 1] as Cle;
  const apres = c.cles[i] as Cle;
  const brut = apres.t > avant.t ? (t - avant.t) / (apres.t - avant.t) : 1;
  const u = ADOUCIR[apres.douceur ?? "doux"](Math.min(1, Math.max(0, brut)));
  const a = poseComplete(avant.pose);
  const b = poseComplete(apres.pose);
  const arrivee = u >= 1;
  const pose: Pose = {
    elan: millieme(entre(a.elan, b.elan, u)),
    saut: entier(entre(a.saut, b.saut, u)),
    tete: { x: entier(entre(a.tete.x, b.tete.x, u)), y: entier(entre(a.tete.y, b.tete.y, u)) },
    buste: { x: entier(entre(a.buste.x, b.buste.x, u)), y: entier(entre(a.buste.y, b.buste.y, u)) },
    bras: arrivee ? b.bras : a.bras,
    objet: {
      x: entier(entre(a.objet.x, b.objet.x, u)),
      y: entier(entre(a.objet.y, b.objet.y, u)),
      angle: entier(entre(a.objet.angle, b.objet.angle, u)),
      glisse: entier(entre(a.objet.glisse, b.objet.glisse, u)),
      visible: true,
      derriere: arrivee ? b.objet.derriere : a.objet.derriere,
    },
    // La traînée suit la lame pendant qu'elle arrive à une clé qui en porte une, et à l'instant même de cette clé.
    traine: u > 0 ? (apres.pose.traine ?? null) : brut <= 0 ? (avant.pose.traine ?? null) : null,
    projectile: null,
  };
  // Le projectile part à la première clé qui porte `tir` (le lâcher) et vole à vitesse égale jusqu'à l'impact, quelles que
  // soient les clés posées pendant son vol.
  const lacher = instantDuLacher(geste, options.arme) ?? undefined;
  if (sorte && lacher !== undefined && c.impact !== null && t >= lacher && t <= c.impact) {
    pose.projectile = { sorte, avance: millieme((t - lacher) / Math.max(1, c.impact - lacher)) };
  }
  // L'objet lancé (le javelot) quitte la main au lâcher et n'y revient qu'à la fin du geste.
  if (sorte === "objet" && lacher !== undefined && t >= lacher) pose.objet.visible = false;
  return pose;
}

// ---------------------------------------------------------------------------------------------------------------------
// Les dessins : le Gaulois en trois bandes, ses bras, son objet
// ---------------------------------------------------------------------------------------------------------------------

/** La dernière rangée de la tête, et celle du buste (les mains comprises) ; les jambes sont dessous. */
export const BANDES = { tete: 33, buste: 49 } as const;

/** Le poing qui tient l'objet, sur la grille du Gaulois : le milieu des cases de peau de la main (x 38 à 39, y 46 à 48). */
export const POING: Point = Object.freeze({ x: 39, y: 47.5 });

/** Les cases ajoutées autour du Gaulois dans l'image d'une pose, pour que l'objet tourne sans sortir. */
export const MARGES = { gauche: 16, droite: 52, haut: 26, bas: 16 } as const;

/** La taille de l'image d'une pose, en cases. */
export const IMAGE_DU_GESTE = {
  largeur: MARGES.gauche + GAULOIS_LARGEUR + MARGES.droite,
  hauteur: MARGES.haut + GAULOIS_HAUTEUR + MARGES.bas,
} as const;

/** Le milieu du Gaulois dans l'image d'une pose, en cases depuis la gauche : l'axe autour duquel se retourne celui de droite. */
export const MILIEU_DU_GAULOIS = MARGES.gauche + GAULOIS_LARGEUR / 2;

// <bras>
/**
 * Les bras qui bougent, dessinés en lettres sur la grille du Gaulois : `s` la peau, `S` son ombre, `k` le contour. Chacun
 * efface d'abord les avant-bras du dessin (rectangles en cases, bords compris), puis se pose par-dessus la tête et le
 * buste ; l'objet suit le poing droit (`poing`, en cases entières depuis `POING`). La manche du dessin reste : c'est
 * l'épaule, d'où part l'avant-bras nu. Dessins de Claude Fable 5.2, faits rangée par rangée (peau, ombre du côté de
 * l'avant-bras du dessin, contour tout autour).
 */
export interface BrasDessines {
  efface: readonly { x: number; y: number; largeur: number; hauteur: number }[];
  dessin: { y: number; lignes: readonly string[] };
  poing: Point;
}

/** Les bras : ceux du dessin (`repos`), ou l'un des bras dessinés ici (levés en garde, poing tendu…). */
export type Bras = "repos" | keyof typeof BRAS_DESSINES;

export const BRAS_DESSINES = {
  // Le bras droit plié : le coude sous la manche, l'avant-bras levé, le poing à hauteur de joue (la masse levée, l'instrument porté à la bouche).
  plie: {
    efface: [
      { x: 34, y: 42, largeur: 6, hauteur: 8 },
    ],
    dessin: {
      y: 31,
      lignes: [
        ".........................................kkkk...",
        "........................................ksssSk..",
        "........................................ksssSk..",
        "........................................ksssSk..",
        "........................................ksssSk..",
        ".......................................ksssSk...",
        ".......................................ksssSk...",
        "......................................ksssSk....",
        ".....................................ksssSk.....",
        ".....................................ksssSk.....",
        "...................................kksssSk......",
        "..................................kssssSk.......",
        "..................................ksssSk........",
        "...................................kkkk.........",
      ],
    },
    poing: { x: 4, y: -14 },
  },
  // Le bras droit tendu vers l'adversaire, le poing fermé au bout (le coup de poing, la lame qui tranche, la lance qui pique, le bouclier qui charge).
  tendu: {
    efface: [
      { x: 34, y: 42, largeur: 6, hauteur: 8 },
    ],
    dessin: {
      y: 36,
      lignes: [
        "...........................................kkkk.",
        ".......................................kkkkssssk",
        "......................................kssssssssk",
        "......................................kssssssssk",
        "......................................kssssssssk",
        "......................................kSSSSSSSSk",
        "..................................kkkkkkkkkkkkk.",
      ],
    },
    poing: { x: 6, y: -8 },
  },
  // Les deux bras levés : le gauche replié devant le menton, le droit qui dresse l'arme.
  garde: {
    efface: [
      { x: 8, y: 42, largeur: 6, hauteur: 8 },
      { x: 34, y: 42, largeur: 6, hauteur: 8 },
    ],
    dessin: {
      y: 28,
      lignes: [
        "..............kkkkk.............................",
        ".............kssssSk............................",
        ".............kssssSk............................",
        ".............kssssSk.....................kkkk...",
        ".............kssssSk....................ksssSk..",
        ".............ksssSk.....................ksssSk..",
        ".............ksssSk.....................ksssSk..",
        "............ksssSk......................ksssSk..",
        "............ksssSk.....................ksssSk...",
        "...........ksssSk......................ksssSk...",
        "...........ksssSk.....................ksssSk....",
        "..........ksssSk.....................ksssSk.....",
        "..........ksssSk.....................ksssSk.....",
        ".........ksssSk....................kksssSk......",
        ".........ksssSk...................kssssSk.......",
        ".........ksssSk...................ksssSk........",
        "..........kkkk.....................kkkk.........",
      ],
    },
    poing: { x: 4, y: -14 },
  },
  // L'archer : le bras droit tendu tient l'arc, la main gauche tire la corde jusqu'au menton.
  vise: {
    efface: [
      { x: 8, y: 42, largeur: 6, hauteur: 8 },
      { x: 34, y: 42, largeur: 6, hauteur: 8 },
    ],
    dessin: {
      y: 29,
      lignes: [
        "....................kkkkk.......................",
        "...................kssssSk......................",
        "...................kssssSk......................",
        "...................kssssSk......................",
        "...................kssssSk......................",
        "..................ksssSkk.......................",
        ".................ksssSk.........................",
        "................ksssSk.....................kkkk.",
        "...............ksssSk..................kkkkssssk",
        "..............ksssSk..................kssssssssk",
        ".............ksssSk...................kssssssssk",
        "............ksssSk....................kssssssssk",
        "...........ksssSk.....................kSSSSSSSSk",
        "..........ksssSk..................kkkkkkkkkkkkk.",
        ".........ksssSk.................................",
        "..........kkkk..................................",
      ],
    },
    poing: { x: 6, y: -8 },
  },
} as const satisfies Record<string, BrasDessines>;
// </bras>

/** Tous les bras possibles, le repos d'abord. */
export const BRAS = ["repos", ...Object.keys(BRAS_DESSINES)] as readonly Bras[];

// <projectiles>
/**
 * Les projectiles dessinés (Claude Fable 5.2), pointe vers la droite, en lettres : `k` le contour des Gaulois, puis leurs
 * couleurs, prises aux armes du site (l'acier de l'épée, le bois de l'arc, l'or du carnyx). `hauteur` : la flèche de leur
 * courbe, en cases (0, tout droit) ; `tourne` : ils suivent leur courbe (une flèche) ou restent droits (une pierre).
 */
export interface ProjectileDessine {
  lignes: readonly string[];
  couleurs: Readonly<Record<string, string>>;
  hauteur: number;
  tourne: boolean;
}

export const PROJECTILES_DESSINES: Readonly<Record<Exclude<SorteDeProjectile, "objet">, ProjectileDessine>> = {
  // La pierre de fronde : un galet rond, éclairé d'en haut, lancé en cloche.
  pierre: {
    lignes: [".kkkk.", "kwgggk", "kggggk", "kggGGk", "kgGGGk", ".kkkk."],
    couleurs: { k: "#1a1410", w: "#eef2f7", g: "#b8c0cc", G: "#7d8796" },
    hauteur: 9,
    tourne: false,
  },
  // La flèche : empenne rouge, fût de bois, pointe d'acier ; elle suit sa courbe, presque tendue.
  fleche: {
    lignes: [
      ".kk...........kk..",
      "krrkkkkkkkkkkkmmk.",
      ".krbbbbbbbbbbbmwmk",
      "kRRkkkkkkkkkkkMMk.",
      ".kk...........kk..",
    ],
    couleurs: { k: "#1a1410", r: "#e0283a", R: "#a51c2a", b: "#9a6b3f", m: "#b8c0cc", w: "#eef2f7", M: "#7d8796" },
    hauteur: 4,
    tourne: true,
  },
  // Le carreau d'arbalète : court, épais, sombre ; il file tout droit.
  carreau: {
    lignes: [
      "kk.......kk..",
      "kdkkkkkkkmmk.",
      ".kbbbbbbbmwmk",
      "kdkkkkkkkMMk.",
      "kk.......kk..",
    ],
    couleurs: { k: "#1a1410", d: "#5a6270", b: "#6e4a28", m: "#b8c0cc", w: "#eef2f7", M: "#7d8796" },
    hauteur: 1,
    tourne: true,
  },
  // La patate : bosselée, avec ses yeux ; elle monte haut et retombe.
  patate: {
    lignes: ["..kkkk..", ".kqpppk.", "kqppPppk", "kppppqpk", "kpPpppPk", ".kPPpPk.", "..kkkk.."],
    couleurs: { k: "#1a1410", q: "#f6e2b0", p: "#e0a85a", P: "#9a6b3f" },
    hauteur: 15,
    tourne: false,
  },
  // Le son : trois arcs d'or qui s'élargissent, bordés de bronze pour se lire sur un fond clair comme sur un fond sombre.
  onde: {
    lignes: [
      ".........yo....",
      "..........yo...",
      "...........yo..",
      "....yo......yo.",
      ".....yo.....yyo",
      "......yo....yyo",
      ".yo....yo...yyo",
      "..yo...yyo..yyo",
      "..yyo..yyo..yyo",
      "..yyo..yyo..yyo",
      "..yyo..yyo..yyo",
      "..yo...yyo..yyo",
      ".yo....yo...yyo",
      "......yo....yyo",
      ".....yo.....yyo",
      "....yo......yo.",
      "...........yo..",
      "..........yo...",
      ".........yo....",
    ],
    couleurs: { y: "#ffe07a", o: "#9c7410" },
    hauteur: 0,
    tourne: false,
  },
};

/**
 * La traînée d'une lame : sa couleur vive (le bord, là où passe la pointe), sa couleur douce (dedans), son épaisseur et
 * celle de son bord, en cases depuis la pointe ; `trame` : de 0 (pleine) à 1 (son bout le plus ancien s'efface en trame).
 * Crème au bord, or dedans : elle se lit sur un décor clair comme sur un décor sombre.
 */
export const TRAINEE = { vive: "#fffbe6", douce: "#ffd84a", epaisseur: 9, bord: 2, trame: 1 } as const;
/** La courbe du javelot lancé, en cases : presque tendue. */
export const HAUTEUR_DE_L_OBJET_LANCE = 5;
// </projectiles>

/** Les dessins d'un Gaulois, préparés une fois par tenue pour toutes ses poses. */
export interface DessinsDuGaulois {
  /** Le Gaulois sans son objet, 48 × 64 cases. */
  corps: Cases;
  /** L'objet sans le poing, 48 × 64 cases ; `null` à mains nues. */
  objet: Cases | null;
  /** Les cases du poing qui tient l'objet. */
  poing: readonly { x: number; y: number; couleur: string }[];
  /** L'objet agrandi huit fois (Scale2x trois fois), pour le tourner en cases nettes. */
  grand: Cases | null;
  /** Les bords de l'objet, en cases (bords compris). */
  boite: { gauche: number; droite: number; haut: number; bas: number } | null;
  /** La plus grande distance du poing à un coin de l'objet, en cases. */
  portee: number;
  /** Les couleurs de base du Gaulois : sa peau (`s`, `S`), son contour (`k`), ses cheveux. */
  couleurs: Readonly<Record<string, string>>;
  /**
   * Faux pour un Gaulois unique (un corps de créature) : ses bras ne sont pas à la place de ceux du corps humain, les bras
   * dessinés n'y vont pas ; il garde ses bras du dessin, et l'objet son poing du dessin.
   */
  brasMobiles: boolean;
}

/** Scale2x : chaque case devient quatre, les diagonales s'adoucissent sans nouvelle couleur. */
function agrandirParDeux(src: Cases, largeur: number, hauteur: number): (string | null)[] {
  const out = new Array<string | null>(largeur * 2 * hauteur * 2).fill(null);
  const L = largeur * 2;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const p = src[y * largeur + x] ?? null;
      const a = y > 0 ? (src[(y - 1) * largeur + x] ?? null) : p;
      const d = y < hauteur - 1 ? (src[(y + 1) * largeur + x] ?? null) : p;
      const c = x > 0 ? (src[y * largeur + x - 1] ?? null) : p;
      const b = x < largeur - 1 ? (src[y * largeur + x + 1] ?? null) : p;
      const i = y * 2 * L + x * 2;
      out[i] = c === a && c !== d && a !== b ? a : p;
      out[i + 1] = a === b && a !== c && b !== d ? b : p;
      out[i + L] = d === c && d !== b && c !== a ? c : p;
      out[i + L + 1] = b === d && b !== a && d !== c ? d : p;
    }
  }
  return out;
}

/** Des cases agrandies huit fois. */
function agrandirParHuit(src: Cases, largeur: number, hauteur: number): (string | null)[] {
  let g = agrandirParDeux(src, largeur, hauteur);
  g = agrandirParDeux(g, largeur * 2, hauteur * 2);
  return agrandirParDeux(g, largeur * 4, hauteur * 4);
}

/** Les bords des cases pleines, ou `null`. */
function boiteDe(cases: Cases, largeur: number): { gauche: number; droite: number; haut: number; bas: number } | null {
  let gauche = Infinity;
  let droite = -1;
  let haut = Infinity;
  let bas = -1;
  cases.forEach((c, i) => {
    if (!c) return;
    const x = i % largeur;
    const y = Math.floor(i / largeur);
    gauche = Math.min(gauche, x);
    droite = Math.max(droite, x);
    haut = Math.min(haut, y);
    bas = Math.max(bas, y);
  });
  return droite < 0 ? null : { gauche, droite, haut, bas };
}

/**
 * Les dessins d'un Gaulois, à partir de ses cases : le corps sans objet, l'objet seul avec son poing (`casesDuGaulois` avec
 * `seulement: ["arme"]`), et ses couleurs de base. Le poing, ce sont les cases de peau de l'objet près de `POING`.
 */
export function preparerLesDessins(corps: Cases, objetEtPoing: Cases | null, couleurs: Readonly<Record<string, string>>, brasMobiles = true): DessinsDuGaulois {
  const peau = new Set([couleurs["s"], couleurs["S"]].filter((c): c is string => typeof c === "string"));
  const poing: { x: number; y: number; couleur: string }[] = [];
  const objet = objetEtPoing ? objetEtPoing.map((c, i) => {
    if (!c || !peau.has(c)) return c;
    const x = i % GAULOIS_LARGEUR;
    const y = Math.floor(i / GAULOIS_LARGEUR);
    if (Math.abs(x + 0.5 - POING.x) > 3 || Math.abs(y + 0.5 - POING.y) > 3) return c;
    poing.push({ x, y, couleur: c });
    return null;
  }) : null;
  const boite = objet ? boiteDe(objet, GAULOIS_LARGEUR) : null;
  if (!objet || !boite) return { corps, objet: null, poing, grand: null, boite: null, portee: 0, couleurs, brasMobiles };
  let portee = 0;
  objet.forEach((c, i) => {
    if (!c) return;
    const x = i % GAULOIS_LARGEUR;
    const y = Math.floor(i / GAULOIS_LARGEUR);
    for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] as const) portee = Math.max(portee, Math.hypot(cx - POING.x, cy - POING.y));
  });
  return { corps, objet, poing, grand: agrandirParHuit(objet, GAULOIS_LARGEUR, GAULOIS_HAUTEUR), boite, portee, couleurs, brasMobiles };
}

/** Les dessins d'un Gaulois d'après sa tenue (lue par `lireTenue`), une fois par tenue. */
export function dessinsDuGaulois(tenue: Tenue): DessinsDuGaulois {
  const corps = casesDuGaulois(changerObjet(tenue, "arme", "aucune"));
  const arme = tenue["arme"] && tenue["arme"] !== "aucune" ? casesDuGaulois(tenue, { seulement: ["arme"] }) : null;
  return preparerLesDessins(corps, arme, couleursDeBase(tenue), !modeleDuGaulois(tenue));
}

/**
 * L'image d'une pose : ses cases, le poing qui tient l'objet, le bout de l'objet (sa case la plus loin du poing, le poing
 * sans objet), et les cases qui n'y tenaient pas ; en cases de l'image.
 */
export interface ImageDuGeste {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
  poing: Point;
  bout: Point;
  horsCadre: number;
}

/** La matrice de Bayer 4 × 4, pour tramer la traînée. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Un angle en degrés ramené entre `bas` et `bas + 360`. */
const ramener = (angle: number, bas: number): number => {
  let a = angle;
  while (a < bas) a += 360;
  while (a >= bas + 360) a -= 360;
  return a;
};

/**
 * Pose l'objet tourné de `angle` degrés autour de `pivot` (dans l'image), glissé de `glisse` cases vers sa pointe. Un quart
 * de tour se pose case pour case ; tout autre angle relit l'objet agrandi huit fois, au milieu de chaque case.
 */
function poserLObjet(d: DessinsDuGaulois, pivot: Point, angle: number, glisse: number, peindre: (x: number, y: number, c: string) => void): void {
  if (!d.objet || !d.grand || !d.boite) return;
  const rad = (angle * Math.PI) / 180;
  const quart = ((Math.round(angle) % 90) + 90) % 90 === 0;
  const cos = quart ? Math.round(Math.cos(rad)) : Math.cos(rad);
  const sin = quart ? Math.round(Math.sin(rad)) : Math.sin(rad);
  // La boîte de l'objet tourné, pour ne parcourir que là.
  const coins = [
    [d.boite.gauche, d.boite.haut],
    [d.boite.droite + 1, d.boite.haut],
    [d.boite.gauche, d.boite.bas + 1],
    [d.boite.droite + 1, d.boite.bas + 1],
  ].map(([x, y]) => {
    const rx = (x as number) - POING.x;
    const ry = (y as number) - glisse - POING.y;
    return [pivot.x + rx * cos - ry * sin, pivot.y + rx * sin + ry * cos] as const;
  });
  const x0 = Math.floor(Math.min(...coins.map((c) => c[0]))) - 1;
  const x1 = Math.ceil(Math.max(...coins.map((c) => c[0]))) + 1;
  const y0 = Math.floor(Math.min(...coins.map((c) => c[1]))) - 1;
  const y1 = Math.ceil(Math.max(...coins.map((c) => c[1]))) + 1;
  const G = GAULOIS_LARGEUR * 8;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const dx = tx + 0.5 - pivot.x;
      const dy = ty + 0.5 - pivot.y;
      const sx = POING.x + dx * cos + dy * sin;
      const sy = POING.y - dx * sin + dy * cos + glisse;
      let c: string | null | undefined;
      if (quart) {
        const cx = Math.floor(sx);
        const cy = Math.floor(sy);
        if (cx < 0 || cy < 0 || cx >= GAULOIS_LARGEUR || cy >= GAULOIS_HAUTEUR) continue;
        c = d.objet[cy * GAULOIS_LARGEUR + cx];
      } else {
        const gx = Math.floor(sx * 8);
        const gy = Math.floor(sy * 8);
        if (gx < 0 || gy < 0 || gx >= G || gy >= GAULOIS_HAUTEUR * 8) continue;
        c = d.grand[gy * G + gx];
      }
      if (c) peindre(tx, ty, c);
    }
  }
}

/** La traînée d'une lame, de l'angle `de` à l'angle `a`, entre deux cercles autour du pivot ; tramée vers son bout le plus ancien. */
function poserLaTrainee(d: DessinsDuGaulois, pivot: Point, de: number, a: number, glisse: number, peindre: (x: number, y: number, c: string) => void): void {
  const ouverture = Math.abs(a - de);
  if (ouverture < 1 || !d.objet) return;
  const r2 = d.portee + Math.max(0, glisse);
  const r1 = Math.max(3, r2 - TRAINEE.epaisseur);
  const bas = Math.min(de, a);
  for (let ty = Math.floor(pivot.y - r2); ty <= Math.ceil(pivot.y + r2); ty++) {
    for (let tx = Math.floor(pivot.x - r2); tx <= Math.ceil(pivot.x + r2); tx++) {
      const dx = tx + 0.5 - pivot.x;
      const dy = ty + 0.5 - pivot.y;
      const r = Math.hypot(dx, dy);
      if (r < r1 || r > r2) continue;
      const theta = ramener((Math.atan2(dx, -dy) * 180) / Math.PI, bas);
      if (theta > bas + ouverture) continue;
      const vieux = Math.abs(theta - a) / ouverture;
      const seuil = (BAYER[(((ty % 4) + 4) % 4) * 4 + (((tx % 4) + 4) % 4)] ?? 0) / 16;
      if (seuil >= 1 - vieux * TRAINEE.trame) continue;
      peindre(tx, ty, r > r2 - TRAINEE.bord ? TRAINEE.vive : TRAINEE.douce);
    }
  }
}

/** Le pivot de l'objet dans l'image d'une pose : le poing, décalé du buste, des bras et de l'objet. */
function pivotDeLaPose(pose: Pose, brasDeLaPose: Bras): Point {
  const bras = brasDeLaPose === "repos" ? { x: 0, y: 0 } : BRAS_DESSINES[brasDeLaPose].poing;
  return {
    x: MARGES.gauche + POING.x + pose.buste.x + bras.x + pose.objet.x,
    y: MARGES.haut + POING.y + pose.saut + pose.buste.y + bras.y + pose.objet.y,
  };
}

/**
 * Les cases d'une pose : les jambes, le buste puis la tête, chacun à son décalage (une bande qui monte s'étire de sa dernière
 * rangée, sans trou) ; les bras qui bougent ; la traînée ; l'objet tourné autour du poing, puis le poing par-dessus. L'élan
 * n'y est pas : l'écran déplace l'image. Le coin du Gaulois au repos est la case (`MARGES.gauche`, `MARGES.haut`).
 */
export function imageDeLaPose(d: DessinsDuGaulois, pose: Pose): ImageDuGeste {
  const { largeur, hauteur } = IMAGE_DU_GESTE;
  const cases = new Array<string | null>(largeur * hauteur).fill(null);
  let horsCadre = 0;
  const peindre = (x: number, y: number, c: string): void => {
    if (x < 0 || y < 0 || x >= largeur || y >= hauteur) {
      horsCadre++;
      return;
    }
    cases[y * largeur + x] = c;
  };
  // Un Gaulois unique garde ses bras du dessin.
  const brasDeLaPose: Bras = d.brasMobiles ? pose.bras : "repos";
  const pivot = pivotDeLaPose(pose, brasDeLaPose);
  let bout: Point = pivot;
  let loin = -1;
  const poserObjet = (): void => {
    if (!pose.objet.visible || !d.objet) return;
    if (pose.traine !== null) poserLaTrainee(d, pivot, pose.traine, pose.objet.angle, pose.objet.glisse, peindre);
    poserLObjet(d, pivot, pose.objet.angle, pose.objet.glisse, (x, y, c) => {
      const r = Math.hypot(x + 0.5 - pivot.x, y + 0.5 - pivot.y);
      if (r > loin) {
        loin = r;
        bout = { x: x + 0.5, y: y + 0.5 };
      }
      peindre(x, y, c);
    });
  };
  // Porté en arrière, l'objet passe derrière le Gaulois.
  if (pose.objet.derriere) poserObjet();
  const bras = brasDeLaPose === "repos" ? null : (BRAS_DESSINES[brasDeLaPose] as BrasDessines);
  const efface = (x: number, y: number): boolean => bras?.efface.some((r) => x >= r.x && x < r.x + r.largeur && y >= r.y && y < r.y + r.hauteur) ?? false;
  const ox = MARGES.gauche;
  const oy = MARGES.haut + pose.saut;
  const bandes = [
    { de: BANDES.buste + 1, a: GAULOIS_HAUTEUR - 1, dx: 0, dy: 0 },
    { de: BANDES.tete + 1, a: BANDES.buste, dx: pose.buste.x, dy: pose.buste.y },
    { de: 0, a: BANDES.tete, dx: pose.buste.x + pose.tete.x, dy: pose.buste.y + pose.tete.y },
  ];
  let dyDessous = 0;
  for (const bande of bandes) {
    for (let y = bande.de; y <= bande.a; y++) {
      // Une bande qui monte au-dessus de celle d'en dessous s'étire de sa dernière rangée, pour ne pas laisser de trou.
      const etire = y === bande.a ? Math.max(0, dyDessous - bande.dy) : 0;
      for (let x = 0; x < GAULOIS_LARGEUR; x++) {
        const c = d.corps[y * GAULOIS_LARGEUR + x];
        // Les bras qui bougent ont quitté leur place : leurs avant-bras du dessin ne s'y peignent pas.
        if (!c || efface(x, y)) continue;
        for (let e = 0; e <= etire; e++) peindre(ox + x + bande.dx, oy + y + bande.dy + e, c);
      }
    }
    dyDessous = bande.dy;
  }
  if (bras) {
    const bx = ox + pose.buste.x;
    const by = oy + pose.buste.y;
    bras.dessin.lignes.forEach((ligne, dy) => {
      for (let x = 0; x < ligne.length; x++) {
        const lettre = ligne[x];
        const c = lettre && lettre !== "." ? d.couleurs[lettre] : undefined;
        if (c) peindre(bx + x, by + bras.dessin.y + dy, c);
      }
    });
  }
  if (!pose.objet.derriere) poserObjet();
  // Le poing tient l'objet, et reste là quand l'objet est lancé : seul l'objet s'en va.
  const px = Math.round(pivot.x - POING.x);
  const py = Math.round(pivot.y - POING.y);
  for (const p of d.poing) peindre(p.x + px, p.y + py, p.couleur);
  return { largeur, hauteur, cases, poing: pivot, bout, horsCadre };
}

/**
 * D'où part un projectile dans l'image d'une pose : la flèche, le carreau et l'objet lancé partent du poing ; la pierre de
 * la poche de la fronde, la patate de la bouche du lance-patates, le son du pavillon de l'instrument (le bout de l'objet).
 */
export const departDuProjectile = (sorte: SorteDeProjectile, image: ImageDuGeste): Point =>
  sorte === "fleche" || sorte === "carreau" || sorte === "objet" ? image.poing : image.bout;

/** L'avant du Gaulois au repos, son objet mis à part : la colonne qui suit sa case la plus à droite, sur sa grille. */
export function avantDuCorps(d: DessinsDuGaulois): number {
  let avant = 0;
  d.corps.forEach((c, i) => {
    if (c) avant = Math.max(avant, (i % GAULOIS_LARGEUR) + 1);
  });
  return avant;
}

/**
 * Les cases entre l'avant de deux Gaulois au repos, face à face : `ecart`, les cases entre le coin gauche de la grille du
 * premier et celui de la grille du second (retourné autour de son milieu).
 */
export const contactEntre = (premier: DessinsDuGaulois, second: DessinsDuGaulois, ecart: number): number =>
  ecart + GAULOIS_LARGEUR - avantDuCorps(premier) - avantDuCorps(second);

/** La part de `contact` que prend l'élan d'un geste qui ne va pas au contact (le tir, le son, la garde, l'élan, le souffle). */
export const ELAN_SANS_CONTACT = 0.5;

/**
 * Ce qu'un coup au contact avance à l'impact : son `elan` à cet instant, et de combien sa case la plus en avant (objet
 * compris) dépasse l'avant de son corps au repos. `null` pour un geste qui ne va pas au contact (le tir, le son, la garde,
 * l'élan, le souffle).
 */
function allongeDuCoup(d: DessinsDuGaulois, geste: Geste, arme?: string | null): { elan: number; depasse: number } | null {
  const impact = instantDeLImpact(geste, arme);
  const pose = impact === null ? null : poseDuGeste(geste, impact, { arme });
  if (!pose || pose.elan < 0.2 || projectileDuGeste(geste, arme)) return null;
  const image = imageDeLaPose(d, { ...pose, traine: null });
  let devant = 0;
  image.cases.forEach((c, i) => {
    if (c) devant = Math.max(devant, (i % image.largeur) + 1);
  });
  return { elan: pose.elan, depasse: devant - (MARGES.gauche + avantDuCorps(d)) };
}

/**
 * La distance d'élan d'un geste, en cases entières : celle qu'un `elan` de 1 fait parcourir, pour que le coup touche juste
 * l'adversaire resté chez lui à l'impact (la case la plus en avant du Gaulois, objet compris, arrive à l'avant de son
 * corps), qu'on tienne une dague ou une hallebarde. `contact` : les cases entre l'avant des deux Gaulois au repos
 * (`contactEntre`). Un geste qui ne va pas au contact prend `ELAN_SANS_CONTACT` de cette distance ; une arme qui touche déjà
 * de chez elle n'avance pas. Quand les deux Gaulois frappent ensemble : `distancesDElanFaceAFace`.
 */
export function distanceDElan(d: DessinsDuGaulois, geste: Geste, contact: number, arme?: string | null): number {
  const allonge = allongeDuCoup(d, geste, arme);
  if (!allonge) return Math.max(0, Math.round(contact * ELAN_SANS_CONTACT));
  return Math.max(0, Math.round((contact - allonge.depasse) / allonge.elan));
}

/** Un Gaulois et le coup qu'il donne, pour `distancesDElanFaceAFace`. */
export interface CoupDonne {
  d: DessinsDuGaulois;
  geste: Geste;
  arme?: string | null;
}

/**
 * Les distances d'élan de deux Gaulois qui frappent ensemble (leurs impacts au même instant) : ce que leurs deux coups
 * n'atteignent pas de chez eux, ils le parcourent à moitié chacun, et leurs avants se rejoignent ; deux armes longues qui
 * se touchent déjà n'avancent pas. Si l'un des deux ne va pas au contact (une garde, un tir), l'autre va jusqu'à lui comme
 * avec `distanceDElan`.
 */
export function distancesDElanFaceAFace(premier: CoupDonne, second: CoupDonne, contact: number): [number, number] {
  const a = allongeDuCoup(premier.d, premier.geste, premier.arme);
  const b = allongeDuCoup(second.d, second.geste, second.arme);
  if (!a || !b) return [distanceDElan(premier.d, premier.geste, contact, premier.arme), distanceDElan(second.d, second.geste, contact, second.arme)];
  const reste = Math.max(0, contact - a.depasse - b.depasse);
  return [Math.round(reste / 2 / a.elan), Math.round(reste / 2 / b.elan)];
}

// ---------------------------------------------------------------------------------------------------------------------
// Les projectiles
// ---------------------------------------------------------------------------------------------------------------------

/** La courbe d'un projectile, en cases. */
export const hauteurDuProjectile = (sorte: SorteDeProjectile): number => (sorte === "objet" ? HAUTEUR_DE_L_OBJET_LANCE : PROJECTILES_DESSINES[sorte].hauteur);

/**
 * Où est un projectile en vol, de `depart` (le poing) à `arrivee` (l'adversaire), en pixels de l'écran à `echelle` pixels
 * par case : sur une courbe de `hauteurDuProjectile` cases, toujours sur un multiple entier de `echelle` (le départ, qui peut
 * tomber sur une demi-case, s'y arrondit aussi). `angle` : sa direction (90, vers la droite ; -90, vers la gauche).
 */
export function placeDuProjectile(projectile: ProjectileEnVol, depart: Point, arrivee: Point, echelle: number): { x: number; y: number; angle: number } {
  const a = Math.min(1, Math.max(0, projectile.avance));
  const h = hauteurDuProjectile(projectile.sorte) * echelle;
  const pas = (v: number): number => Math.round(v / echelle) * echelle + 0;
  const x = pas(depart.x + (arrivee.x - depart.x) * a);
  const y = pas(depart.y + (arrivee.y - depart.y) * a - 4 * h * a * (1 - a));
  const vx = arrivee.x - depart.x;
  const vy = arrivee.y - depart.y - 4 * h * (1 - 2 * a);
  const angle = Math.round((Math.atan2(vx, -vy) * 180) / Math.PI);
  return { x, y, angle };
}

/** L'image d'un projectile : ses cases et son centre (le point que `placeDuProjectile` place). */
export interface ImageDuProjectile {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
  centre: Point;
}

/**
 * L'image d'un projectile tourné de `angle` degrés (90 : vers la droite, comme il est dessiné). Une pierre ou une patate ne
 * tourne pas ; l'objet lancé, c'est l'objet du Gaulois (`d`), couché dans sa course.
 */
export function imageDuProjectile(sorte: SorteDeProjectile, angle: number, d?: DessinsDuGaulois): ImageDuProjectile {
  if (sorte === "objet") {
    const r = Math.ceil(d?.portee ?? 0) + 2;
    const cote = 2 * r + 1;
    const cases = new Array<string | null>(cote * cote).fill(null);
    if (d) poserLObjet(d, { x: r + 0.5, y: r + 0.5 }, angle, 0, (x, y, c) => {
      if (x >= 0 && y >= 0 && x < cote && y < cote) cases[y * cote + x] = c;
    });
    return { largeur: cote, hauteur: cote, cases, centre: { x: r, y: r } };
  }
  const p = PROJECTILES_DESSINES[sorte];
  const l = Math.max(...p.lignes.map((ligne) => ligne.length));
  const h = p.lignes.length;
  const src: (string | null)[] = [];
  for (const ligne of p.lignes) for (let x = 0; x < l; x++) src.push(p.couleurs[ligne[x] ?? "."] ?? null);
  const tour = p.tourne ? angle - 90 : 0;
  if (Math.round(tour) % 360 === 0) {
    // Un projectile qui ne tourne pas (la pierre, l'onde) se retourne quand il part vers la gauche.
    const gauche = !p.tourne && ((angle % 360) + 360) % 360 > 180;
    const cases = gauche ? src.map((_, i) => src[Math.floor(i / l) * l + (l - 1 - (i % l))] ?? null) : src;
    return { largeur: l, hauteur: h, cases, centre: { x: Math.floor(l / 2), y: Math.floor(h / 2) } };
  }
  const r = Math.ceil(Math.hypot(l, h) / 2) + 1;
  const cote = 2 * r;
  const cases = new Array<string | null>(cote * cote).fill(null);
  const grand = agrandirParHuit(src, l, h);
  const rad = (tour * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let ty = 0; ty < cote; ty++) {
    for (let tx = 0; tx < cote; tx++) {
      const dx = tx + 0.5 - r;
      const dy = ty + 0.5 - r;
      const sx = l / 2 + dx * cos + dy * sin;
      const sy = h / 2 - dx * sin + dy * cos;
      const gx = Math.floor(sx * 8);
      const gy = Math.floor(sy * 8);
      if (gx < 0 || gy < 0 || gx >= l * 8 || gy >= h * 8) continue;
      cases[ty * cote + tx] = grand[gy * l * 8 + gx] ?? null;
    }
  }
  return { largeur: cote, hauteur: cote, cases, centre: { x: r, y: r } };
}
