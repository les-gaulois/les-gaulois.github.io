/**
 * Les places des Gaulois dans le monde du village : pour chaque lieu de vie (`vie.ts`), où se tient chacun de ceux qui s'y
 * trouvent, en cases du monde. Le village accueille jusqu'à 1 000 Gaulois (`plan.ts`) :
 * - dans les maisons, chacun a son lit : celui de son rang (sa place dans la réponse du serveur), quatre par maison ;
 * - à la taverne et dans la salle de réunion, deux rangs de tables dedans, puis les sièges du dehors ;
 * - au champ de bataille, trois rangs face aux guerriers d'en face, sur un pré qui s'allonge avec le village ;
 * - ceux de la place se promènent : chacun dans sa rue (celle de sa maison), sur la grand-rue, ou dans le pré du bas.
 * Quand un lieu est plus plein que prévu, on s'y serre : personne ne disparaît. Calculs purs : la même foule donne les
 * mêmes places.
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../gaulois";
import { alea } from "../decor";
import { ATTABLE_HAUTEUR } from "../poses";
import type { Lieu } from "../vie";
import { RANGS_DEHORS } from "./etages";
import { MAISON_LITS, MAISON_SOUPENTE, SALLE_RECUL, SALLE_SIEGE_DERRIERE, SALLE_SIEGE_DEVANT, SIEGE, SIEGES_DERRIERE, SIEGES_DEVANT } from "./pieces";
import { BANDE_BAS, BANDE_HAUT, BAS_BANDE_BAS, BAS_BANDE_HAUT, type Dehors, LITS_PAR_MAISON, PLANCHER, type Plan, SIEGE_DEHORS, TERRASSE_BANDE_BAS, TERRASSE_BANDE_HAUT, emplacementOpenFront, emplacementsDe, maisonDuRang } from "./plan";
import { LIT_HAUTEUR, LIT_LARGEUR } from "./poses-monde";

/** La boîte d'un Gaulois selon ce qu'il fait, en cases, et la rangée où s'écrit son nom, comptée du haut de la boîte. */
export const BOITES_DU_MONDE = {
  debout: { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, nom: GAULOIS_HAUTEUR + 1, nomLargeur: 50 },
  attable: { largeur: GAULOIS_LARGEUR, hauteur: ATTABLE_HAUTEUR, nom: 68, nomLargeur: 37 },
  couche: { largeur: LIT_LARGEUR, hauteur: LIT_HAUTEUR, nom: LIT_HAUTEUR + 1, nomLargeur: 70 },
} as const;
export type Tenue = keyof typeof BOITES_DU_MONDE;

/**
 * Une place : le coin haut gauche de la boîte, en cases du monde. `serre` : on y est à l'étroit, le nom ne s'écrit pas
 * dessous. `saut` : elle n'est pas sur la grand-rue ; on y arrive par l'escalier, d'un coup.
 */
export interface Place {
  x: number;
  y: number;
  serre: boolean;
  saut?: boolean;
}

/** Un rang où l'on se range : `aise` places à l'écart `pas`, à partir de la colonne `de` (coins gauches des boîtes). */
interface Rang {
  de: number;
  y: number;
  aise: number;
  pas: number;
}

/**
 * Range `nombre` personnes dans des rangs, dans l'ordre : tant qu'il y a de la place à l'aise, les rangs se remplissent
 * l'un après l'autre ; au-delà, tous les rangs se partagent la foule et se serrent.
 */
function ranger(nombre: number, rangs: readonly Rang[], centre: boolean): Place[] {
  const places: Place[] = [];
  const aise = rangs.reduce((somme, r) => somme + r.aise, 0);
  if (nombre <= aise) {
    let reste = nombre;
    for (const r of rangs) {
      const ici = Math.min(r.aise, reste);
      reste -= ici;
      const retrait = centre ? Math.floor(((r.aise - ici) * r.pas) / 2) : 0;
      for (let k = 0; k < ici; k++) places.push({ x: r.de + retrait + k * r.pas, y: r.y, serre: nombre > rangs[0]!.aise });
    }
    return places;
  }
  let reste = nombre;
  rangs.forEach((r, i) => {
    const ici = i === rangs.length - 1 ? reste : Math.min(reste, Math.ceil((nombre * r.aise) / aise));
    reste -= ici;
    const long = Math.max(0, r.aise - 1) * r.pas;
    for (let k = 0; k < ici; k++) places.push({ x: r.de + (ici > 1 ? Math.round((k * long) / (ici - 1)) : Math.floor(long / 2)), y: r.y, serre: true });
  });
  return places;
}

/** Les rangs d'une salle : ses deux rangs de tables du dedans, puis les deux rangs du dehors s'il y en a. */
function rangsDeLaSalle(plan: Plan, lieu: "taverne" | "reunion"): Rang[] {
  const e = emplacementsDe(plan, lieu)[0]!;
  const y = plan.dy0 + PLANCHER - 68;
  const rangs: Rang[] = [
    { de: e.x + SALLE_SIEGE_DEVANT, y, aise: SIEGES_DEVANT, pas: SIEGE },
    { de: e.x + SALLE_SIEGE_DERRIERE, y: y - SALLE_RECUL, aise: SIEGES_DERRIERE, pas: SIEGE },
  ];
  const dehors: Dehors = lieu === "taverne" ? plan.terrasse : plan.bancs;
  if (dehors.sieges > 0) {
    rangs.push({ de: dehors.x + 4, y: plan.dy0 + RANGS_DEHORS[1], aise: dehors.parRang, pas: SIEGE_DEHORS });
    rangs.push({ de: dehors.x + 4, y: plan.dy0 + RANGS_DEHORS[0], aise: dehors.sieges - dehors.parRang, pas: SIEGE_DEHORS });
  }
  return rangs;
}

/** Les rangées des pieds au champ de bataille, de la plus lointaine à la plus proche. */
const RANGS_DE_COMBAT = [340, 356, 372] as const;

/** Là où se promène le Gaulois de ce rang : la rue de sa maison, la grand-rue, ou le pré du bas. */
export function zoneDuPromeneur(plan: Plan, rang: number): { de: number; a: number; haut: number; bas: number; rue: boolean } {
  const grandRue = { de: plan.village.de + 30, a: plan.village.a - 70, haut: plan.dy0 + BANDE_HAUT - GAULOIS_HAUTEUR, bas: plan.dy0 + BANDE_BAS - GAULOIS_HAUTEUR, rue: true };
  const maison = maisonDuRang(plan, rang);
  // Un Gaulois sur trois descend sur la grand-rue, où sont la place et le marché ; un sur sept va voir les trains.
  if (maison.dy === plan.dy0 || rang % 3 === 0) return grandRue;
  if (rang % 7 === 5) {
    const gare = emplacementOpenFront(plan, "gare");
    return { de: gare.x - 260, a: plan.mer.de - 120, haut: plan.dyBas + BAS_BANDE_HAUT - GAULOIS_HAUTEUR, bas: plan.dyBas + BAS_BANDE_BAS - GAULOIS_HAUTEUR, rue: false };
  }
  const milieu = maison.x + maison.largeur / 2;
  return { de: Math.max(plan.hauts.de + 30, milieu - 520), a: Math.min(plan.hauts.a - 70, milieu + 520), haut: maison.dy + TERRASSE_BANDE_HAUT - GAULOIS_HAUTEUR, bas: maison.dy + TERRASSE_BANDE_BAS - GAULOIS_HAUTEUR, rue: false };
}

/** Les places d'un lieu pour ces Gaulois (leurs rangs dans la réponse du serveur), dans le même ordre. */
export function placesDuLieu(plan: Plan, lieu: Lieu, rangs: readonly number[]): Place[] {
  const nombre = rangs.length;
  if (nombre <= 0) return [];
  if (lieu === "taverne" || lieu === "reunion") return ranger(nombre, rangsDeLaSalle(plan, lieu), false);
  if (lieu === "maisons") {
    const pas = MAISON_LITS[1] - MAISON_LITS[0];
    return rangs.map((rang) => {
      const maison = maisonDuRang(plan, rang);
      const lit = ((rang % LITS_PAR_MAISON) + LITS_PAR_MAISON) % LITS_PAR_MAISON;
      const y = lit < 2 ? maison.dy + PLANCHER - LIT_HAUTEUR : maison.dy + maison.pied - MAISON_SOUPENTE - LIT_HAUTEUR;
      return { x: maison.x + MAISON_LITS[0] + (lit % 2) * pas, y, serre: nombre > 12, saut: maison.dy !== plan.dy0 };
    });
  }
  if (lieu === "bataille") {
    const aise = plan.pre.parRang * 3;
    const parRang = nombre <= aise ? plan.pre.parRang : Math.ceil(nombre / 3);
    const pas = nombre <= aise ? plan.pre.pas : Math.max(8, Math.floor((plan.pre.parRang * plan.pre.pas) / parRang));
    const places: Place[] = [];
    for (let k = 0; k < nombre; k++) {
      const rang = Math.floor(k / parRang);
      places.push({ x: plan.pre.front - 24 - GAULOIS_LARGEUR / 2 - (k % parRang) * pas - rang * 14, y: plan.dy0 + RANGS_DE_COMBAT[rang % 3]! - GAULOIS_HAUTEUR, serre: nombre > 15 });
    }
    return places;
  }
  // La place : chacun part d'un point de sa zone, toujours le même.
  return rangs.map((rang) => {
    const zone = zoneDuPromeneur(plan, rang);
    return { x: Math.round(zone.de + alea(rang, 11) * (zone.a - zone.de)), y: Math.round(zone.haut + alea(rang, 23) * (zone.bas - zone.haut)), serre: false, saut: !zone.rue };
  });
}

/** Les guerriers d'en face : un par Gaulois au combat, tournés vers eux, de l'autre côté du front. */
export function placesDEnFace(plan: Plan, places: readonly Place[]): Place[] {
  const front = plan.pre.front - 24;
  return places.map((place) => ({ x: front + 27 + (front - GAULOIS_LARGEUR / 2 - place.x), y: place.y, serre: place.serre })).filter((place) => place.x < plan.pre.x + plan.pre.largeur + 40);
}

/** La tenue qu'on a dans un lieu : debout dehors, attablé dans les salles, couché dans les maisons. */
export const tenueDuLieu = (lieu: Lieu): Tenue => (lieu === "taverne" || lieu === "reunion" ? "attable" : lieu === "maisons" ? "couche" : "debout");

/** Sur la grand-rue, le pied de l'escalier le plus proche de cette colonne : par là on monte aux terrasses, ou l'on descend au bas. */
export function piedDeLEscalier(plan: Plan, x: number, versLeBas: boolean): { x: number; y: number } {
  const escaliers = plan.escaliers.filter((e) => (versLeBas ? e.de === 0 : e.de === 1));
  const escalier = escaliers.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0] ?? plan.escaliers[0]!;
  return { x: escalier.x - GAULOIS_LARGEUR / 2, y: plan.dy0 + (versLeBas ? BANDE_BAS : BANDE_HAUT + 2) - GAULOIS_HAUTEUR };
}

/** Ce point est-il sur la grand-rue (et non sur une terrasse ou dans le bas) ? */
export function surLaGrandRue(plan: Plan, y: number): boolean {
  return y > plan.dy0 + 200 && y < plan.dy0 + BANDE_BAS;
}

/** Le pas de la porte d'un lieu : le point de la grand-rue, devant lui, par où l'on y entre et d'où l'on en sort. */
export function seuilDuLieu(plan: Plan, lieu: Lieu, place: Place | null): { x: number; y: number } {
  const y = plan.dy0 + BANDE_HAUT + 4 - GAULOIS_HAUTEUR;
  if (lieu === "taverne" || lieu === "reunion") {
    const e = emplacementsDe(plan, lieu)[0]!;
    // Assis dehors : on arrive droit devant sa table.
    if (place && place.x > e.x + e.largeur) return { x: place.x, y: y + 22 };
    return { x: e.x + Math.floor(e.largeur / 2) - GAULOIS_LARGEUR / 2, y };
  }
  if (lieu === "maisons") {
    if (place?.saut) return piedDeLEscalier(plan, place.x, false);
    const maisons = emplacementsDe(plan, "maison").filter((e) => e.dy === plan.dy0);
    const m = (place && maisons.find((e) => place.x >= e.x && place.x < e.x + e.largeur)) || maisons[1]!;
    return { x: m.x + Math.floor(m.largeur / 2) - GAULOIS_LARGEUR / 2, y };
  }
  if (lieu === "bataille") return { x: plan.pre.x + 40, y: place?.y ?? plan.dy0 + RANGS_DE_COMBAT[1] - GAULOIS_HAUTEUR };
  // La place : pour qui se promène ailleurs que sur la grand-rue, l'escalier qui y mène.
  if (place && !surLaGrandRue(plan, place.y + GAULOIS_HAUTEUR)) return piedDeLEscalier(plan, place.x, place.y > plan.dy0 + 300);
  return { x: place?.x ?? plan.feu.x, y: place?.y ?? y + 20 };
}
