/**
 * Les places des Gaulois dans le monde du village : pour chaque lieu de vie (`vie.ts`), où se tient chacun de ceux qui s'y
 * trouvent. À la taverne et dans la salle de réunion, deux rangs de tables ; dans les trois maisons, deux lits par étage ;
 * au champ de bataille, trois rangs face aux guerriers d'en face ; sur la place, n'importe où dans le village, où ils se
 * promènent (`marche.ts`). Quand un lieu est plein, on s'y serre : le panorama ne s'allonge jamais, et personne ne
 * disparaît. Calculs purs : la même foule donne les mêmes places.
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR } from "../../gaulois";
import { ATTABLE_HAUTEUR } from "../poses";
import type { Lieu } from "../vie";
import { MAISON_LITS, MAISON_SOUPENTE, SALLE_RECUL, SALLE_SIEGE_DERRIERE, SALLE_SIEGE_DEVANT, SIEGE, SIEGES_DERRIERE, SIEGES_DEVANT } from "./pieces";
import { BANDE_BAS, BANDE_HAUT, PLANCHER, type Plan, emplacementsDe } from "./plan";
import { LIT_HAUTEUR, LIT_LARGEUR } from "./poses-monde";

/** La boîte d'un Gaulois selon ce qu'il fait, en cases, et la rangée où s'écrit son nom, comptée du haut de la boîte. */
export const BOITES_DU_MONDE = {
  debout: { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, nom: GAULOIS_HAUTEUR + 1, nomLargeur: 50 },
  attable: { largeur: GAULOIS_LARGEUR, hauteur: ATTABLE_HAUTEUR, nom: 68, nomLargeur: 37 },
  couche: { largeur: LIT_LARGEUR, hauteur: LIT_HAUTEUR, nom: LIT_HAUTEUR + 1, nomLargeur: 70 },
} as const;
export type Tenue = keyof typeof BOITES_DU_MONDE;

/** Une place : le coin haut gauche de la boîte, en cases du monde. `serre` : on y est à l'étroit, le nom ne s'écrit pas dessous. */
export interface Place {
  x: number;
  y: number;
  serre: boolean;
}

/** Un rang où l'on se range : de la colonne `de` à la colonne `a` (coins gauches des boîtes), `aise` places à l'écart `pas`. */
interface Rang {
  de: number;
  y: number;
  aise: number;
  pas: number;
}

/**
 * Range `nombre` personnes dans des rangs, dans l'ordre : tant qu'il y a de la place à l'aise, les rangs se remplissent
 * l'un après l'autre, chacun centré ; au-delà, tous les rangs se partagent la foule et se serrent.
 */
function ranger(nombre: number, rangs: readonly Rang[]): Place[] {
  const places: Place[] = [];
  const aise = rangs.reduce((somme, r) => somme + r.aise, 0);
  if (nombre <= aise) {
    let reste = nombre;
    for (const r of rangs) {
      const ici = Math.min(r.aise, reste);
      reste -= ici;
      const retrait = Math.floor(((r.aise - ici) * r.pas) / 2);
      for (let k = 0; k < ici; k++) places.push({ x: r.de + retrait + k * r.pas, y: r.y, serre: nombre > rangs[0]!.aise });
    }
    return places;
  }
  let reste = nombre;
  rangs.forEach((r, i) => {
    const ici = i === rangs.length - 1 ? reste : Math.min(reste, Math.ceil((nombre * r.aise) / aise));
    reste -= ici;
    const long = (r.aise - 1) * r.pas;
    for (let k = 0; k < ici; k++) places.push({ x: r.de + (ici > 1 ? Math.round((k * long) / (ici - 1)) : Math.floor(long / 2)), y: r.y, serre: true });
  });
  return places;
}

/** Le front du champ de bataille : la colonne du premier Gaulois de chaque rang, et l'écart entre deux combattants. */
const FRONT = 240;
const PAS_DE_COMBAT = 40;
const RANGS_DE_COMBAT = [340, 356, 372] as const;

/** Les places d'un lieu pour `nombre` Gaulois. Sur la place : leurs points de départ, répartis dans le village. */
export function placesDuLieu(plan: Plan, lieu: Lieu, nombre: number): Place[] {
  if (nombre <= 0) return [];
  if (lieu === "taverne" || lieu === "reunion") {
    const e = emplacementsDe(plan, lieu)[0]!;
    const y = PLANCHER - 68;
    return ranger(nombre, [
      { de: e.x + SALLE_SIEGE_DEVANT, y, aise: SIEGES_DEVANT, pas: SIEGE },
      { de: e.x + SALLE_SIEGE_DERRIERE, y: y - SALLE_RECUL, aise: SIEGES_DERRIERE, pas: SIEGE },
    ]);
  }
  if (lieu === "maisons") {
    const maisons = emplacementsDe(plan, "maison");
    const pas = MAISON_LITS[1] - MAISON_LITS[0];
    // Celle du milieu d'abord, au rez-de-chaussée ; puis les autres, puis les soupentes.
    const ordre = [maisons[1]!, maisons[0]!, maisons[2]!];
    const rangs: Rang[] = [];
    for (const m of ordre) rangs.push({ de: m.x + MAISON_LITS[0], y: PLANCHER - LIT_HAUTEUR, aise: 2, pas });
    for (const m of ordre) rangs.push({ de: m.x + MAISON_LITS[0], y: m.pied - MAISON_SOUPENTE - LIT_HAUTEUR, aise: 2, pas });
    return ranger(nombre, rangs).map((place) => ({ ...place, serre: nombre > 12 }));
  }
  if (lieu === "bataille") {
    const front = plan.pre.x + FRONT;
    const parRang = nombre <= 15 ? 5 : Math.ceil(nombre / 3);
    const pas = nombre <= 15 ? PAS_DE_COMBAT : Math.max(10, Math.floor((PAS_DE_COMBAT * 4) / Math.max(1, parRang - 1)));
    const places: Place[] = [];
    for (let k = 0; k < nombre; k++) {
      const rang = Math.floor(k / parRang);
      places.push({ x: front - (k % parRang) * pas - rang * 14, y: RANGS_DE_COMBAT[rang % 3]! - GAULOIS_HAUTEUR, serre: nombre > 15 });
    }
    return places;
  }
  // La place : le premier (le sien, s'il y est) près du grand feu, les autres de part et d'autre, de plus en plus loin.
  const places: Place[] = [];
  for (let k = 0; k < nombre; k++) {
    const cote = k % 2 === 0 ? 1 : -1;
    const ecart = 70 + Math.floor(k / 2) * 86;
    const x = Math.min(plan.village.a - 80, Math.max(plan.village.de + 40, plan.feu.x + cote * ecart - GAULOIS_LARGEUR / 2));
    const pieds = BANDE_HAUT + 14 + ((k * 23) % (BANDE_BAS - BANDE_HAUT - 14));
    places.push({ x, y: pieds - GAULOIS_HAUTEUR, serre: false });
  }
  return places;
}

/** Les guerriers d'en face : un par Gaulois au combat, tournés vers eux. */
export function placesDEnFace(plan: Plan, places: readonly Place[]): Place[] {
  const front = plan.pre.x + FRONT;
  return places.map((place) => ({ x: front + 51 + (front - place.x), y: place.y, serre: place.serre })).filter((place) => place.x < plan.pre.x + plan.pre.largeur + 40);
}

/** La tenue qu'on a dans un lieu : debout dehors, attablé dans les salles, couché dans les maisons. */
export const tenueDuLieu = (lieu: Lieu): Tenue => (lieu === "taverne" || lieu === "reunion" ? "attable" : lieu === "maisons" ? "couche" : "debout");

/** Le pas de la porte d'un lieu : le point du chemin, devant lui, par où l'on y entre et d'où l'on en sort. */
export function seuilDuLieu(plan: Plan, lieu: Lieu, place: Place | null): { x: number; y: number } {
  const y = BANDE_HAUT + 4 - GAULOIS_HAUTEUR;
  if (lieu === "taverne" || lieu === "reunion") {
    const e = emplacementsDe(plan, lieu)[0]!;
    return { x: e.x + Math.floor(e.largeur / 2) - GAULOIS_LARGEUR / 2, y };
  }
  if (lieu === "maisons") {
    const maisons = emplacementsDe(plan, "maison");
    const m = (place && maisons.find((e) => place.x >= e.x && place.x < e.x + e.largeur)) || maisons[1]!;
    return { x: m.x + Math.floor(m.largeur / 2) - GAULOIS_LARGEUR / 2, y };
  }
  if (lieu === "bataille") return { x: plan.pre.x + 40, y: (place?.y ?? RANGS_DE_COMBAT[1] - GAULOIS_HAUTEUR) };
  return { x: place?.x ?? plan.feu.x, y: place?.y ?? y + 20 };
}

/** Là où ceux de la place peuvent marcher : tout le dehors du village, de la rive du ruisseau à la porte. */
export function zoneDeLaPlace(plan: Plan): { de: number; a: number; haut: number; bas: number } {
  return { de: plan.village.de + 30, a: plan.village.a - 70, haut: BANDE_HAUT - GAULOIS_HAUTEUR, bas: BANDE_BAS - GAULOIS_HAUTEUR };
}
