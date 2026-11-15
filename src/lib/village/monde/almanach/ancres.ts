/**
 * Les lieux de l'almanach des petits moments (`type.ts`) : une liste fermée de points du monde où un moment peut se
 * passer. L'API Claude qui écrit les moments ne connaît que ces lieux, leur description et leur place ; un moment dit le
 * chemin de chaque figurant en cases comptées depuis le point de son lieu. Le moteur pose ce point dans le monde du
 * village, quel qu'en soit le nombre de Gaulois (de 0 à 1 000) : chaque point se lit sur le plan (`../plan.ts`), et ce
 * qui l'entoure ne change pas d'un village à l'autre (un test le garde, pour 0, 1, 50, 300 et 1 000 Gaulois).
 *
 * Seulement le premier plan (la grand-rue), le bas (le pré, le port, la mer) et le ciel au-dessus d'eux : jamais les
 * terrasses du fond, dessinées deux fois plus petites, où un figurant du premier plan paraîtrait géant.
 *
 * Un lieu a :
 * - sa **place** : la boîte où tout dessin du moment doit tenir, en cases à gauche, à droite, au-dessus et au-dessous du
 *   point (au-dessous : vers nous, pour le sol) ;
 * - ses **zones** : pour chaque milieu (`Milieu` de `type.ts`), les rectangles où peut se trouver le pied d'un figurant de
 *   ce milieu, toute sa largeur comprise : l'herbe et le chemin pour le sol, le lit du ruisseau ou la mer pour l'eau, l'air
 *   au-dessus des toits pour le ciel, le faîte d'un toit pour ce qui s'y pose. Un milieu sans zone n'a rien à faire là ;
 * - les **bâtiments** du chantier qu'il demande : devant le moulin, il faut que le moulin soit bâti.
 *
 * Les rangées de la grand-rue se comptent dans son repère (`LIGNE`, la ligne du fond, à la rangée 300 ; les Gaulois y
 * marchent de 326 à 372), celles du bas dans le sien (le pré de 340 à 388, la mer à partir de 262). Calcul pur.
 */
import type { BatimentId } from "../../chantier-liste";
import { taillesDesDessins } from "../composition";
import { MODELES, maisonRetournee } from "../maisons";
import { litDuRuisseau } from "../pieces";
import { type Emplacement, type Plan, PIED, emplacementDuBatiment, emplacementOpenFront, emplacementsDe, hautDansLeMonde, planDuMonde } from "../plan";
import type { Milieu } from "./type";

/** Un rectangle d'un lieu, en cases depuis son point : de la colonne `de` à la colonne `a`, de la rangée `haut` à la rangée `bas`, bornes comprises. */
export interface ZoneDuLieu {
  milieu: Milieu;
  de: number;
  a: number;
  haut: number;
  bas: number;
}

/** La place d'un lieu : en cases depuis son point, ce qu'un dessin peut occuper à gauche, à droite, au-dessus et au-dessous. */
export interface PlaceDuLieu {
  gauche: number;
  droite: number;
  dessus: number;
  dessous: number;
}

export interface Ancre {
  /** Son identifiant, en minuscules et tirets : « gue-du-ruisseau ». */
  id: string;
  /** Où c'est et ce qu'on y voit, en une phrase, pour la consigne de l'API. */
  description: string;
  /** Ce qu'il est d'abord : le sol, l'eau, le ciel ou un toit. */
  milieu: Milieu;
  place: PlaceDuLieu;
  zones: readonly ZoneDuLieu[];
  /** Les bâtiments du chantier qu'il demande, finis. */
  batiments: readonly BatimentId[];
  /**
   * Sur un toit, la profondeur de ce qui s'y pose, en rangées depuis le point : juste devant la maison, derrière les
   * Gaulois de la rue. Ailleurs (absent), un figurant se range comme les Gaulois : par la rangée sous son pied.
   */
  profondeur?: number;
  /** Son point dans le monde de ce plan, en cases du monde. */
  point(plan: Plan): { x: number; y: number };
}

/* ---------- Les mesures communes ---------- */

/** Dans la grand-rue, la rangée du point d'un lieu au sol : au milieu de la bande où marchent les Gaulois. */
const RUE = 350;
/** Dans le bas, la rangée du point d'un lieu du pré : au milieu de sa bande. */
const PRE = 364;
/** Dans le bas, la rangée du point d'un lieu de la mer. */
const MER = 360;

/** Le sol de la grand-rue, depuis un point à la rangée `RUE` : de la rangée 328 à la rangée 372. */
const solDeLaRue = (de: number, a: number): ZoneDuLieu => ({ milieu: "sol", de, a, haut: 328 - RUE, bas: 372 - RUE });
/**
 * L'air au-dessus de la grand-rue : le pied d'un oiseau des rangées -40 à 110 de son repère, au-dessus de presque tous les
 * toits (la plupart finissent sous la rangée 110 ; la salle de réunion monte à 74), dans le haut de l'écran sur un écran
 * ordinaire : plus haut, on ne le verrait souvent pas. Un oiseau passe devant tout le décor (`PROFONDEUR_DU_CIEL` de
 * `jeu.ts`). Depuis un point à la rangée `depuis`.
 */
const cielDeLaRue = (de: number, a: number, depuis = RUE): ZoneDuLieu => ({ milieu: "ciel", de, a, haut: -40 - depuis, bas: 110 - depuis });
/**
 * Une nappe (brume, feuilles, pluie fine, fumée) sur la grand-rue : son pied du haut des toits (rangée 100 de son repère,
 * pour une fumée qui traîne au-dessus d'eux) jusqu'au bord de la rue (rangée 380, pour une brume au ras du sol).
 */
const nappeDeLaRue = (de: number, a: number): ZoneDuLieu => ({ milieu: "nappe", de, a, haut: 100 - RUE, bas: 380 - RUE });

/** Au gué, la rangée du point, dans la grand-rue. */
const GUE = 360;

/**
 * Les zones du gué, lues sur le lit du ruisseau (`litDuRuisseau` de `../pieces.ts`) : il vient du fond, s'élargit vers
 * nous et serpente un peu. Par bandes de huit rangées, l'eau d'une rive à l'autre (deux cases en dedans de son bord, pour
 * que la ligne d'eau d'un figurant, deux à quatre rangées au-dessus de son pied, y soit encore), et les deux rives d'herbe
 * jusqu'au bord de l'eau, dans la bande où l'on marche. L'eau commence sous le pied du pont (rangée 338) : un figurant
 * d'eau passe en aval. En colonnes depuis le milieu du ruisseau, qui ne dépend pas du nombre de Gaulois.
 */
function zonesDuGue(): ZoneDuLieu[] {
  const lit = planDuMonde(taillesDesDessins(), 0).ruisseau;
  const bords = (y0: number, y1: number): { gauche: number; droite: number } => {
    let gauche = -Infinity;
    let droite = Infinity;
    for (let y = y0 - 4; y <= y1; y++) {
      const l = litDuRuisseau({ ruisseau: lit } as Plan, y);
      gauche = Math.max(gauche, l.x - lit.x - l.demi);
      droite = Math.min(droite, l.x - lit.x + l.demi);
    }
    return { gauche, droite };
  };
  const zones: ZoneDuLieu[] = [];
  for (let y0 = 338; y0 <= 392; y0 += 8) {
    const y1 = Math.min(392, y0 + 7);
    const { gauche, droite } = bords(y0, y1);
    zones.push({ milieu: "eau", de: gauche + 2, a: droite - 2, haut: y0 - GUE, bas: y1 - GUE });
  }
  for (let y0 = 328; y0 <= 372; y0 += 8) {
    const y1 = Math.min(372, y0 + 7);
    // Les rives : tout ce qui n'est l'eau d'aucune rangée de la bande.
    let gauche = Infinity;
    let droite = -Infinity;
    for (let y = y0; y <= y1; y++) {
      const l = litDuRuisseau({ ruisseau: lit } as Plan, y);
      gauche = Math.min(gauche, l.x - lit.x - l.demi);
      droite = Math.max(droite, l.x - lit.x + l.demi);
    }
    zones.push({ milieu: "sol", de: -300, a: gauche - 1, haut: y0 - GUE, bas: y1 - GUE });
    zones.push({ milieu: "sol", de: droite + 1, a: 300, haut: y0 - GUE, bas: y1 - GUE });
  }
  return zones;
}
/** La place d'un lieu au sol de la grand-rue : assez haute pour les oiseaux et les nappes, jusqu'au bord de la rue en bas. */
const placeDeLaRue = (gauche: number, droite: number): PlaceDuLieu => ({ gauche, droite, dessus: 500, dessous: 40 });
/** Un lieu au sol de la grand-rue : son sol, l'air au-dessus de ses toits, et ses nappes. */
const auSol = (gauche: number, droite: number): Pick<Ancre, "milieu" | "place" | "zones"> => ({
  milieu: "sol",
  place: placeDeLaRue(gauche, droite),
  zones: [solDeLaRue(-gauche, droite), cielDeLaRue(-gauche, droite), nappeDeLaRue(-gauche, droite)],
});

/** Le milieu d'un emplacement, et le point au sol devant lui, dans la grand-rue. */
const devant = (plan: Plan, e: Emplacement, decalage = 0): { x: number; y: number } => ({ x: e.x + Math.floor(e.largeur / 2) + decalage, y: plan.dy0 + RUE });
const maisonDuRang = (plan: Plan, rang: number): Emplacement => emplacementsDe(plan, "maison")[rang]!;

/**
 * Le faîte d'une maison de la grand-rue, en colonnes de son dessin tourné vers la droite (`de` à `a`), et la rangée où
 * repose le pied de ce qui s'y pose (juste au-dessus de la coiffe). La maison peut être retournée (`maisonRetournee`).
 */
function surLeFaite(plan: Plan, rang: number, faite: { de: number; a: number; pied: number }): { x: number; y: number } {
  const e = maisonDuRang(plan, rang);
  const variante = e.piece.sorte === "maison" ? e.piece.variante : 0;
  const milieu = Math.floor((faite.de + faite.a) / 2);
  const colonne = maisonRetournee(variante) ? e.largeur - 1 - milieu : milieu;
  return { x: e.x + colonne, y: hautDansLeMonde(e) + faite.pied };
}

/** La chaumière (rang 0) : sa coiffe de chaume court des colonnes 40 à 152, à la rangée 7 ; on s'y pose de 44 à 108, loin de la cheminée. */
const FAITE_DE_LA_CHAUMIERE = { de: 44, a: 108, pied: 6 };
/** La maison à colombages (rang 2) : son faîtage de planches court des colonnes 58 à 170, aux rangées 8 et 9. */
const FAITE_DES_COLOMBAGES = { de: 62, a: 166, pied: 7 };
/** Ce qui se pose sur un toit se range juste devant la maison, derrière tous les Gaulois de la rue (dont les pieds sont de 326 à 372). */
const DEVANT_LA_MAISON = PIED + 2;
/** Cette profondeur, en rangées depuis le point posé sur le faîte d'une maison de cette hauteur (son pied à la rangée `PIED`). */
const profondeurSurLeFaite = (hauteur: number, faite: { pied: number }): number => DEVANT_LA_MAISON - (PIED - hauteur + 1 + faite.pied);

/* ---------- Les lieux ---------- */

export const ANCRES: readonly Ancre[] = [
  {
    id: "lisiere-ouest",
    description: "À la lisière ouest de la forêt, au bout du monde : le chemin de terre sort des grands arbres, avant le moulin et le ruisseau.",
    ...auSol(100, 150),
    batiments: [],
    point: (plan) => ({ x: plan.chemin.de, y: plan.dy0 + RUE }),
  },
  {
    id: "devant-le-moulin",
    description: "Devant le moulin à eau, sur la rive ouest du ruisseau : sa roue tourne dans le bief, le chemin passe devant sa porte.",
    ...auSol(130, 100),
    batiments: ["moulin"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "moulin")),
  },
  {
    id: "gue-du-ruisseau",
    description:
      "Au gué du ruisseau, en aval du pont : une eau claire et peu profonde qui coule du fond vers nous et s'élargit en approchant, entre deux rives d'herbe et de roseaux. Le point est au milieu de l'eau ; les zones d'eau et de rive suivent ses bords, bande par bande.",
    milieu: "eau",
    place: { gauche: 300, droite: 300, dessus: 510, dessous: 34 },
    zones: [...zonesDuGue(), { milieu: "nappe", de: -160, a: 160, haut: -60, bas: 34 }, cielDeLaRue(-300, 300, GUE)],
    batiments: [],
    point: (plan) => ({ x: plan.ruisseau.x, y: plan.dy0 + GUE }),
  },
  {
    id: "ciel-du-ruisseau",
    description: "Haut dans le ciel à l'ouest, au-dessus du ruisseau, du moulin et des premières maisons, plus haut que les toits.",
    milieu: "ciel",
    place: { gauche: 460, droite: 920, dessus: 130, dessous: 110 },
    zones: [{ milieu: "ciel", de: -440, a: 900, haut: -40, bas: 110 }],
    batiments: [],
    point: (plan) => ({ x: plan.ruisseau.x, y: plan.dy0 }),
  },
  {
    id: "devant-le-lavoir",
    description: "Devant le lavoir couvert, sur la rive est du ruisseau, où l'on vient laver le linge, au pied du rempart.",
    ...auSol(80, 120),
    batiments: ["lavoir"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "lavoir")),
  },
  {
    id: "devant-le-potager",
    description: "Devant le potager clos de gaules tressées, ses choux et ses courges, entre le rempart et la première maison.",
    ...auSol(110, 110),
    batiments: ["potager"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "potager")),
  },
  {
    id: "rue-des-maisons",
    description: "Dans la rue des maisons, devant la chaumière, la grande hutte ronde et la maison à colombages : de la terre battue, de l'herbe.",
    ...auSol(400, 400),
    batiments: [],
    point: (plan) => devant(plan, maisonDuRang(plan, 1)),
  },
  {
    id: "toit-de-la-chaumiere",
    description: "Sur la coiffe de chaume de la première maison, la chaumière : un faîte étroit et plat, loin de sa cheminée. On s'y pose et on y reste.",
    milieu: "toit",
    place: { gauche: 40, droite: 40, dessus: 80, dessous: 4 },
    zones: [{ milieu: "toit", de: -32, a: 32, haut: 0, bas: 0 }],
    batiments: [],
    profondeur: profondeurSurLeFaite(MODELES.chaumiere.hauteur, FAITE_DE_LA_CHAUMIERE),
    point: (plan) => surLeFaite(plan, 0, FAITE_DE_LA_CHAUMIERE),
  },
  {
    id: "toit-des-colombages",
    description: "Sur le faîtage de planches de la maison à colombages, la plus haute de la rue : une poutre plate assez longue pour y marcher un peu.",
    milieu: "toit",
    place: { gauche: 60, droite: 60, dessus: 80, dessous: 4 },
    zones: [{ milieu: "toit", de: -52, a: 52, haut: 0, bas: 0 }],
    batiments: [],
    profondeur: profondeurSurLeFaite(MODELES.colombages.hauteur, FAITE_DES_COLOMBAGES),
    point: (plan) => surLeFaite(plan, 2, FAITE_DES_COLOMBAGES),
  },
  {
    id: "devant-l-etable",
    description: "Devant l'étable, son abreuvoir et sa meule de foin, au bout de la rue des maisons.",
    ...auSol(90, 110),
    batiments: ["etable"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "etable")),
  },
  {
    id: "sous-le-grand-chene",
    description: "Sous le grand chêne de la place, sa balançoire de corde et son banc, à l'ombre du feuillage.",
    ...auSol(100, 110),
    batiments: ["chene"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "chene")),
  },
  {
    id: "au-puits",
    description: "Au puits de la place : sa margelle de pierres, son petit toit, son seau pendu au treuil.",
    ...auSol(60, 110),
    batiments: ["puits"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "puits")),
  },
  {
    id: "sur-la-place",
    description: "Sur la place du village, dans la clairière de terre battue autour du grand feu, qui brûle au point même : on passe devant lui, on ne s'arrête pas juste devant.",
    ...auSol(220, 220),
    batiments: [],
    point: (plan) => ({ x: plan.feu.x, y: plan.dy0 + RUE }),
  },
  {
    id: "ciel-de-la-place",
    description: "Haut dans le ciel au-dessus de la place et du grand feu, plus haut que les toits, des maisons jusqu'à la taverne.",
    milieu: "ciel",
    place: { gauche: 1000, droite: 1000, dessus: 130, dessous: 110 },
    zones: [{ milieu: "ciel", de: -1000, a: 1000, haut: -40, bas: 110 }],
    batiments: [],
    point: (plan) => ({ x: plan.feu.x, y: plan.dy0 }),
  },
  {
    id: "devant-le-four",
    description: "Devant le four à pain, son dôme de terre, sa pelle à enfourner et son tas de bûches, au bord de la place.",
    ...auSol(70, 90),
    batiments: ["four"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "four")),
  },
  {
    id: "devant-la-taverne",
    description: "Devant la taverne, grande chaumière ouverte sur la rue, son enseigne et sa guirlande de houblon.",
    ...auSol(200, 200),
    batiments: [],
    point: (plan) => devant(plan, emplacementsDe(plan, "taverne")[0]!),
  },
  {
    id: "devant-la-forge",
    description: "Devant la forge, son enclume et son foyer, entre le grenier sur pilotis et le colombier.",
    ...auSol(110, 110),
    batiments: [],
    point: (plan) => devant(plan, emplacementsDe(plan, "forge")[0]!),
  },
  {
    id: "ciel-de-la-forge",
    description: "Haut dans le ciel à l'est, au-dessus de la forge, du colombier et de la salle de réunion, plus haut que les toits.",
    milieu: "ciel",
    place: { gauche: 900, droite: 900, dessus: 130, dessous: 110 },
    zones: [{ milieu: "ciel", de: -900, a: 900, haut: -40, bas: 110 }],
    batiments: [],
    point: (plan) => ({ ...devant(plan, emplacementsDe(plan, "forge")[0]!), y: plan.dy0 }),
  },
  {
    id: "devant-le-marche",
    description: "Devant l'étal du marché, ses paniers et ses étoffes, avant la tour de guet.",
    ...auSol(90, 120),
    batiments: [],
    point: (plan) => devant(plan, emplacementsDe(plan, "etal")[0]!),
  },
  {
    id: "porte-du-village",
    description: "Devant la porte de la palissade, à l'est du village : deux gros poteaux, deux battants ouverts, le chemin qui sort vers les prés.",
    ...auSol(100, 140),
    batiments: ["palissade"],
    point: (plan) => devant(plan, emplacementDuBatiment(plan, "palissade")),
  },
  {
    id: "pre-du-bas",
    description: "Dans le pré du bas, sous la grand-rue, entre la cascade et la gare : de l'herbe, des fleurs, des haies, des meules, la clôture le long de la voie ferrée.",
    milieu: "sol",
    place: { gauche: 700, droite: 700, dessus: 330, dessous: 30 },
    zones: [
      { milieu: "sol", de: -700, a: 700, haut: 342 - PRE, bas: 386 - PRE },
      { milieu: "ciel", de: -700, a: 700, haut: 60 - PRE, bas: 250 - PRE },
      { milieu: "nappe", de: -700, a: 700, haut: 290 - PRE, bas: 392 - PRE },
    ],
    batiments: [],
    point: (plan) => ({ x: plan.ruisseau.x + 1000, y: plan.dyBas + PRE }),
  },
  {
    id: "pre-du-rivage",
    description: "Dans le pré du bas, à l'est, entre la batterie et le port : l'herbe descend vers les galets du rivage.",
    milieu: "sol",
    place: { gauche: 200, droite: 200, dessus: 330, dessous: 30 },
    zones: [
      { milieu: "sol", de: -200, a: 200, haut: 342 - PRE, bas: 386 - PRE },
      { milieu: "ciel", de: -200, a: 200, haut: 60 - PRE, bas: 250 - PRE },
      { milieu: "nappe", de: -200, a: 200, haut: 290 - PRE, bas: 392 - PRE },
    ],
    batiments: [],
    point: (plan) => {
      const batterie = emplacementOpenFront(plan, "batterie");
      return { x: batterie.x + batterie.largeur + 220, y: plan.dyBas + PRE };
    },
  },
  {
    id: "au-port",
    description:
      "Au port, le long du quai de bois où mouillent le navire de transport et notre navire de guerre : l'eau calme du bassin, la falaise derrière. La mer commence à la colonne 0 et s'étend vers la droite ; à gauche, le rivage de galets et d'herbe.",
    milieu: "eau",
    place: { gauche: 210, droite: 700, dessus: 320, dessous: 38 },
    zones: [
      { milieu: "eau", de: 2, a: 640, haut: 270 - MER, bas: 392 - MER },
      { milieu: "sol", de: -200, a: -1, haut: 342 - MER, bas: 386 - MER },
      { milieu: "ciel", de: -40, a: 680, haut: 62 - MER, bas: 242 - MER },
      { milieu: "nappe", de: 0, a: 700, haut: 280 - MER, bas: 398 - MER },
    ],
    batiments: [],
    point: (plan) => ({ x: plan.mer.de, y: plan.dyBas + MER }),
  },
  {
    id: "au-large",
    description: "Au large, sur la mer, au pied de la falaise, entre les navires et le bord du monde : de longues vagues qui roulent lentement.",
    milieu: "eau",
    place: { gauche: 740, droite: 739, dessus: 320, dessous: 38 },
    zones: [
      { milieu: "eau", de: -700, a: 700, haut: 270 - MER, bas: 394 - MER },
      { milieu: "ciel", de: -700, a: 700, haut: 62 - MER, bas: 242 - MER },
      { milieu: "nappe", de: -740, a: 739, haut: 280 - MER, bas: 398 - MER },
    ],
    batiments: [],
    point: (plan) => ({ x: plan.mer.de + 760, y: plan.dyBas + MER }),
  },
];

const PAR_ID = new Map(ANCRES.map((a) => [a.id, a]));

/** Le lieu de cet identifiant, ou `null`. */
export const ancreDe = (id: string): Ancre | null => PAR_ID.get(id) ?? null;

/** Les zones de ce lieu pour ce milieu. */
export const zonesDuMilieu = (ancre: Pick<Ancre, "zones">, milieu: Milieu): ZoneDuLieu[] => ancre.zones.filter((z) => z.milieu === milieu);

/**
 * Les colonnes `de` à `a` du pied, à la rangée `y` (en cases depuis le point du lieu), tiennent-elles dans une même zone
 * de ce milieu ? Toute la largeur compte : un berger n'a pas un mouton dans le ruisseau.
 */
export function piedDansUneZone(ancre: Pick<Ancre, "zones">, milieu: Milieu, de: number, a: number, y: number): boolean {
  return ancre.zones.some((z) => z.milieu === milieu && de >= z.de && a <= z.a && y >= z.haut && y <= z.bas);
}

/** Le dessin entier, son pied à (`x`, `y`) depuis le point du lieu, tient-il dans la place du lieu ? */
export function dansLaPlace(ancre: Pick<Ancre, "place">, x: number, y: number, largeur: number, hauteur: number): boolean {
  const gauche = x - Math.floor(largeur / 2);
  const { place } = ancre;
  return gauche >= -place.gauche && gauche + largeur - 1 <= place.droite && y - hauteur + 1 >= -place.dessus && y <= place.dessous;
}
