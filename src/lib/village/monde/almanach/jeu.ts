/**
 * Le jeu d'un moment de l'almanach (`type.ts`) : où est chaque figurant à un instant, de quel côté il regarde, quelle image
 * de son mouvement il montre et à quel point il est visible. La même règle sert au moteur qui joue les moments à l'écran
 * (`MondeVie.tsx`) et à la validation qui les contrôle avant de les garder (`moment.ts`) : ce que la validation a vu est
 * exactement ce que l'écran montre, case pour case, huit fois par seconde. Calcul pur, sans hasard.
 */
import { TEMPS_PAR_SECONDE } from "../../mouvement";
import type { Ancre } from "./ancres";
import type { Etape, Moment } from "./moment";
import { reglageDe } from "./reglages-figurants";
import type { Allure, Figurant } from "./type";

/**
 * Le rythme des images de chaque allure, en temps (huitièmes de seconde) par image : lent, toujours (règle du pilote,
 * rien de vif). Une bête au pas montre deux images par seconde, un oiseau bat des ailes au même rythme ; ce qui est posé
 * ne change d'image qu'une fois par seconde et demie.
 */
export const RYTHMES: Readonly<Record<Allure, number>> = { posee: 12, lente: 8, pas: 4, vol: 4 };

/** Un rôle à un instant : son pied en cases depuis le point du lieu, son sens, sa part de visibilité, et s'il bouge. */
export interface InstantDuRole {
  x: number;
  y: number;
  /** 1 : tourné vers la droite, comme son dessin ; -1 : retourné. */
  vers: 1 | -1;
  /** De 0 (invisible) à 1, au centième. */
  opacite: number;
  bouge: boolean;
}

const entre = (a: number, b: number, part: number): number => a + (b - a) * part;

/**
 * Le sens d'un rôle sur le tronçon qui part de l'étape `i` : celui où il va ; à l'arrêt, celui du dernier tronçon où il
 * allait de côté (il ne se retourne pas en s'arrêtant), sinon celui du premier où il ira, sinon vers la droite.
 */
function sensDuTroncon(etapes: readonly Etape[], i: number): 1 | -1 {
  const dx = (k: number): number => etapes[k + 1]!.x - etapes[k]!.x;
  for (let k = Math.min(i, etapes.length - 2); k >= 0; k--) if (dx(k) !== 0) return dx(k) > 0 ? 1 : -1;
  for (let k = i + 1; k < etapes.length - 1; k++) if (dx(k) !== 0) return dx(k) > 0 ? 1 : -1;
  return 1;
}

/**
 * Le rôle à `secondes` du début du moment : entre deux étapes, il va en ligne droite, à vitesse égale, et son opacité
 * glisse de l'une à l'autre. Avant sa première étape ou après sa dernière, il n'est pas là (`null`). Les cases sont
 * entières : c'est ce que l'écran pose.
 */
export function instantDuRole(etapes: readonly Etape[], secondes: number): InstantDuRole | null {
  const premiere = etapes[0];
  const derniere = etapes[etapes.length - 1];
  if (!premiere || !derniere || secondes < premiere.t || secondes > derniere.t) return null;
  let i = 0;
  while (i < etapes.length - 2 && etapes[i + 1]!.t <= secondes) i++;
  const a = etapes[i]!;
  const b = etapes[i + 1] ?? a;
  const part = b.t > a.t ? Math.min(1, Math.max(0, (secondes - a.t) / (b.t - a.t))) : 1;
  return {
    x: Math.round(entre(a.x, b.x, part)),
    y: Math.round(entre(a.y, b.y, part)),
    vers: etapes.length < 2 ? 1 : sensDuTroncon(etapes, i),
    opacite: Math.round(entre(a.o, b.o, part) * 100) / 100,
    bouge: a.x !== b.x || a.y !== b.y,
  };
}

/** L'image de son mouvement qu'un figurant montre : en boucle au rythme de son allure quand il bouge (toujours, s'il est posé), la première à l'arrêt. */
export function imageDuFigurant(figurant: Pick<Figurant, "allure" | "images">, instant: Pick<InstantDuRole, "bouge">, temps: number): number {
  if (figurant.images <= 1 || (!instant.bouge && figurant.allure !== "posee")) return 0;
  return Math.floor(Math.max(0, temps) / RYTHMES[figurant.allure]) % figurant.images;
}

/**
 * La profondeur de ce qui vole : devant tout le décor et tous les Gaulois (le monde n'a pas 1 500 rangées), derrière les
 * étiquettes de l'écran (9 000). Un oiseau qui passe devant un toit passe devant lui, pas derrière.
 */
export const PROFONDEUR_DU_CIEL = 5000;

/** Ce que l'écran pose pour un rôle : son dessin, son image, son coin haut gauche dans le monde, son sens, son opacité, sa profondeur. */
export interface LutinDeLAlmanach {
  cle: string;
  figurant: string;
  image: number;
  x: number;
  y: number;
  miroir: boolean;
  opacite: number;
  /** La rangée de sa profondeur : ce qui est plus bas à l'écran passe devant (comme les Gaulois et les bêtes). */
  pied: number;
}

/**
 * Ce qu'un moment montre, `temps` huitièmes de seconde après son début, posé au point `point` de son lieu : un dessin par
 * rôle visible. Un rôle dont le figurant n'est pas dessiné ne montre rien.
 */
export function lutinsDuMoment(moment: Pick<Moment, "roles">, ancre: Pick<Ancre, "profondeur">, point: { x: number; y: number }, figurants: ReadonlyMap<string, Figurant>, temps: number): LutinDeLAlmanach[] {
  const lutins: LutinDeLAlmanach[] = [];
  const secondes = temps / TEMPS_PAR_SECONDE;
  moment.roles.forEach((role, k) => {
    const figurant = figurants.get(role.figurant);
    const instant = instantDuRole(role.etapes, secondes);
    if (!figurant || !instant || instant.opacite <= 0) return;
    lutins.push({
      cle: `almanach-${k}`,
      figurant: figurant.id,
      image: imageDuFigurant(figurant, instant, temps),
      x: point.x + instant.x - Math.floor(figurant.largeur / 2),
      y: point.y + instant.y - figurant.hauteur + 1,
      // L'étoile filante et la fumée ne sont justes que dans le sens de leur dessin : jamais retournées.
      miroir: instant.vers === -1 && !reglageDe(figurant)?.versLaDroite,
      opacite: Math.min(1, instant.opacite),
      pied: figurant.milieu === "ciel" ? PROFONDEUR_DU_CIEL : point.y + (ancre.profondeur ?? instant.y),
    });
  });
  return lutins;
}
