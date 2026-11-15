/**
 * Un moment de l'almanach (`type.ts`) : une petite scène qui dit quel figurant passe où, quand et par quel chemin. Ici, sa
 * forme (le schéma Zod, que lit aussi l'API Claude qui écrit les moments, en sortie structurée) et sa validation : le code
 * contrôle chaque moment écrit avant de le garder dans le dépôt, et rend la raison de chaque refus.
 *
 * Un moment :
 * - `titre` : quelques mots pour le journal de l'écriture et la Direction, jamais affichés sur la place ;
 * - `phases` : les moments de la journée où il peut passer (`Phase` de `lumiere.ts`) ;
 * - `batiments` : les bâtiments du chantier qu'il demande, en plus de ceux de son lieu ;
 * - `ancre` : son lieu (`ancres.ts`) ;
 * - `duree` : en secondes, de 15 à 120 ;
 * - `roles` : de 1 à 4 figurants, chacun avec ses étapes dans le temps (`t`, en secondes depuis le début), la place de son
 *   pied (`x`, `y`, en cases depuis le point du lieu : le milieu de la dernière rangée de son dessin) et son opacité (`o`,
 *   de 0 à 1). Entre deux étapes, il va en ligne droite, à vitesse égale (`jeu.ts`).
 *
 * Ce module charge Zod : l'écran ne l'importe que pour ses types (il lit les moments déjà contrôlés, `programme.ts`).
 */
import { z } from "zod";
import { BATIMENT_IDS, type BatimentId } from "../../chantier-liste";
import type { Phase } from "../../lumiere";
import { TEMPS_PAR_SECONDE } from "../../mouvement";
import { type Ancre, dansLaPlace, piedDansUneZone, zonesDuMilieu } from "./ancres";
import { instantDuRole } from "./jeu";
import { colonnesDuCorps, colonnesSurLEau, reglageDe } from "./reglages-figurants";
import type { Allure, Figurant } from "./type";

/** Les moments de la journée, dans leur ordre. */
export const PHASES: readonly Phase[] = ["aube", "jour", "crepuscule", "nuit"];

/** Les bornes d'un moment : sa durée en secondes, ses rôles, les étapes de chacun. */
export const DUREE_MIN = 15;
export const DUREE_MAX = 120;
export const ROLES_MAX = 4;
export const ETAPES_MIN = 2;
export const ETAPES_MAX = 12;
/** Un figurant entre et sort en fondu : sa première et sa dernière étape sont invisibles, à deux secondes au moins de leur voisine. */
export const FONDU_MIN = 2;
/** Son opacité change d'une demie par seconde au plus : rien qui clignote. */
export const FONDU_VITESSE_MAX = 0.5;
/** La dernière étape du moment tombe à sa durée, à trois secondes près. */
export const ECART_DE_LA_FIN = 3;
/** Le titre : de 3 à 60 signes, des lettres, des chiffres et une ponctuation simple. */
export const TITRE = /^[A-Za-zÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇàâäéèêëîïôöùûüÿçŒœÆæ0-9 ,.'’-]{3,60}$/;

/**
 * La vitesse la plus haute de chaque allure, en cases par seconde (un Gaulois qui se promène fait 8 cases par seconde) :
 * posé, il ne bouge pas ; lent, deux fois moins vite qu'un promeneur ; au pas, une fois et demie ; en vol, une traversée
 * d'écran en une vingtaine de secondes. Rien de vif.
 */
export const VITESSES: Readonly<Record<Allure, number>> = { posee: 0, lente: 4, pas: 12, vol: 40 };

/* ---------- La forme ---------- */

const ETAPE = z.object({
  t: z.number().min(0).max(DUREE_MAX).describe("L'instant de l'étape, en secondes depuis le début du moment ; strictement croissant d'une étape à l'autre."),
  x: z.number().int().describe("La colonne du milieu du pied du dessin, en cases depuis le point du lieu (négatif : à gauche)."),
  y: z.number().int().describe("La rangée du pied du dessin, en cases depuis le point du lieu (négatif : plus haut ; positif : plus bas, plus près de nous)."),
  o: z.number().min(0).max(1).describe("L'opacité du dessin, de 0 (invisible) à 1 (plein)."),
});

const ROLE = z.object({
  figurant: z.string().describe("L'identifiant d'un figurant du catalogue."),
  etapes: z.array(ETAPE).min(ETAPES_MIN).max(ETAPES_MAX),
});

const CHAMPS = {
  titre: z.string().describe("Quelques mots, en français, pour le journal : « Un vol d'oies au crépuscule »."),
  phases: z.array(z.enum(["aube", "jour", "crepuscule", "nuit"])).min(1).max(4),
  batiments: z.array(z.enum(BATIMENT_IDS as unknown as [BatimentId, ...BatimentId[]])).max(BATIMENT_IDS.length),
  ancre: z.string().describe("L'identifiant d'un lieu de la liste."),
  duree: z.number().min(DUREE_MIN).max(DUREE_MAX).describe("La durée du moment, en secondes."),
};

/** Un moment tel que l'API l'écrit. */
export const MOMENT_ECRIT = z.object({ ...CHAMPS, roles: z.array(ROLE).min(1).max(ROLES_MAX) });
/** Un moment gardé, avec son identifiant (`m001`), tel que `moments.json` le range. */
export const MOMENT = MOMENT_ECRIT.extend({ id: z.string().regex(/^m[0-9]{3,4}$/) });
export const MOMENTS = z.array(MOMENT);

export type Etape = z.infer<typeof ETAPE>;
export type Role = z.infer<typeof ROLE>;
export type MomentEcrit = z.infer<typeof MOMENT_ECRIT>;
export type Moment = z.infer<typeof MOMENT>;

/**
 * La forme de la réponse demandée à l'API : une liste de moments, dont les figurants et les lieux sont pris dans ces
 * listes. Le SDK en tire le schéma JSON de la sortie structurée (`zodOutputFormat`).
 */
export function schemaDeLaReponse(figurants: readonly string[], ancres: readonly string[]) {
  const enumeration = (valeurs: readonly string[]) => z.enum(valeurs as [string, ...string[]]);
  const role = ROLE.extend({ figurant: enumeration(figurants).describe(ROLE.shape.figurant.description ?? "") });
  const moment = z.object({ ...CHAMPS, ancre: enumeration(ancres).describe(CHAMPS.ancre.description ?? ""), roles: z.array(role).min(1).max(ROLES_MAX) });
  return z.object({ moments: z.array(moment) });
}

/* ---------- La validation ---------- */

/** Les raisons d'un refus, telles que le journal de l'écriture les compte. */
export type RaisonDuRefus =
  | "titre invalide"
  | "phases invalides"
  | "bâtiment inconnu"
  | "lieu inconnu"
  | "durée hors des bornes"
  | "nombre de rôles hors des bornes"
  | "figurant inconnu"
  | "figurant hors de ses heures"
  | "milieu absent du lieu"
  | "nombre d'étapes hors des bornes"
  | "étapes en désordre"
  | "entrée brusque"
  | "sortie brusque"
  | "fondu trop vif"
  | "rôle jamais visible"
  | "trop vite pour son allure"
  | "à rebours de son dessin"
  | "hors de son milieu"
  | "hors de la place du lieu"
  | "durée qui ne colle pas aux étapes";

export interface Refus {
  raison: RaisonDuRefus;
  /** Le détail, en nombres et en identifiants seulement : le rôle, l'étape ou l'instant en cause. */
  detail: string;
}

/** Ce que la validation connaît : les figurants dessinés, par identifiant, et les lieux. */
export interface Catalogue {
  figurants: ReadonlyMap<string, Figurant>;
  ancre(id: string): Ancre | null;
}

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const refus = (raison: RaisonDuRefus, detail = ""): Refus => ({ raison, detail });

/** Les étapes d'un rôle sont-elles lisibles et dans l'ordre, dans la durée du moment ? */
function etapesEnOrdre(etapes: readonly Etape[], duree: number): boolean {
  return etapes.every((e, i) => fini(e.t) && Number.isInteger(e.x) && Number.isInteger(e.y) && fini(e.o) && e.o >= 0 && e.o <= 1 && e.t >= 0 && e.t <= duree && (i === 0 || e.t > etapes[i - 1]!.t));
}

/**
 * Le contrôle d'un rôle : son figurant, ses heures, son milieu, ses étapes, son entrée et sa sortie, sa vitesse, et, à
 * chaque huitième de seconde où l'écran le pose, son pied dans une zone de son milieu et son dessin dans la place du lieu.
 */
function validerRole(role: Role, k: number, moment: MomentEcrit, ancre: Ancre, catalogue: Catalogue): Refus | null {
  const qui = `rôle ${k + 1}`;
  const figurant = catalogue.figurants.get(role.figurant);
  if (!figurant) return refus("figurant inconnu", `${qui} : ${role.figurant}`);
  if (figurant.quand && !moment.phases.every((p) => figurant.quand!.includes(p))) return refus("figurant hors de ses heures", `${qui} : ${figurant.id}`);
  if (zonesDuMilieu(ancre, figurant.milieu).length === 0) return refus("milieu absent du lieu", `${qui} : ${figurant.milieu} à ${ancre.id}`);
  const reglage = reglageDe(figurant);
  const { etapes } = role;
  if (!Array.isArray(etapes) || etapes.length < ETAPES_MIN || etapes.length > ETAPES_MAX) return refus("nombre d'étapes hors des bornes", `${qui} : ${Array.isArray(etapes) ? etapes.length : 0}`);
  if (!etapesEnOrdre(etapes, moment.duree)) return refus("étapes en désordre", qui);
  const premiere = etapes[0]!;
  const seconde = etapes[1]!;
  const avant = etapes[etapes.length - 2]!;
  const derniere = etapes[etapes.length - 1]!;
  if (premiere.o !== 0 || seconde.t - premiere.t < FONDU_MIN) return refus("entrée brusque", qui);
  if (derniere.o !== 0 || derniere.t - avant.t < FONDU_MIN) return refus("sortie brusque", qui);
  if (Math.max(...etapes.map((e) => e.o)) < 0.5) return refus("rôle jamais visible", qui);
  for (let i = 1; i < etapes.length; i++) {
    const a = etapes[i - 1]!;
    const b = etapes[i]!;
    const dt = b.t - a.t;
    if (Math.abs(b.o - a.o) / dt > FONDU_VITESSE_MAX + 1e-9) return refus("fondu trop vif", `${qui}, étape ${i + 1}`);
    if (Math.hypot(b.x - a.x, b.y - a.y) / dt > VITESSES[figurant.allure] + 1e-9) return refus("trop vite pour son allure", `${qui}, étape ${i + 1} : ${figurant.allure}`);
    if (reglage?.versLaDroite && b.x < a.x) return refus("à rebours de son dessin", `${qui}, étape ${i + 1} : ${figurant.id}`);
  }
  // Ce que l'écran posera, huit fois par seconde : le pied dans son milieu (son corps seul, s'il a un réglage, et son fil
  // sur l'eau), le dessin dans la place.
  for (let temps = Math.ceil(premiere.t * TEMPS_PAR_SECONDE); temps <= Math.floor(derniere.t * TEMPS_PAR_SECONDE); temps++) {
    const instant = instantDuRole(etapes, temps / TEMPS_PAR_SECONDE);
    if (!instant) continue;
    const quand = Math.round((temps / TEMPS_PAR_SECONDE) * 10) / 10;
    const gauche = instant.x - Math.floor(figurant.largeur / 2);
    const retourne = instant.vers === -1 && !reglage?.versLaDroite;
    const corps = colonnesDuCorps(figurant, retourne);
    if (!piedDansUneZone(ancre, figurant.milieu, gauche + corps[0], gauche + corps[1], instant.y)) return refus("hors de son milieu", `${qui} à ${quand} s : ${instant.x}, ${instant.y}`);
    const eau = colonnesSurLEau(figurant, retourne);
    if (eau && !piedDansUneZone(ancre, "eau", gauche + eau[0], gauche + eau[1], instant.y)) return refus("hors de son milieu", `${qui} à ${quand} s : ${instant.x}, ${instant.y}, loin de l'eau`);
    if (!dansLaPlace(ancre, instant.x, instant.y, figurant.largeur, figurant.hauteur)) return refus("hors de la place du lieu", `${qui} à ${quand} s : ${instant.x}, ${instant.y}`);
  }
  return null;
}

/** Le contrôle d'un moment écrit : `null` s'il peut être gardé, sinon la première raison de le refuser. */
export function validerMoment(moment: MomentEcrit, catalogue: Catalogue): Refus | null {
  if (typeof moment.titre !== "string" || !TITRE.test(moment.titre.trim())) return refus("titre invalide");
  const phases = Array.isArray(moment.phases) ? moment.phases : [];
  if (phases.length === 0 || new Set(phases).size !== phases.length || !phases.every((p) => PHASES.includes(p))) return refus("phases invalides");
  const batiments = Array.isArray(moment.batiments) ? moment.batiments : [null];
  if (new Set(batiments).size !== batiments.length || !batiments.every((b) => BATIMENT_IDS.includes(b as BatimentId))) return refus("bâtiment inconnu");
  const ancre = catalogue.ancre(moment.ancre);
  if (!ancre) return refus("lieu inconnu", String(moment.ancre));
  if (!fini(moment.duree) || moment.duree < DUREE_MIN || moment.duree > DUREE_MAX) return refus("durée hors des bornes", String(moment.duree));
  const roles = Array.isArray(moment.roles) ? moment.roles : [];
  if (roles.length < 1 || roles.length > ROLES_MAX) return refus("nombre de rôles hors des bornes", String(roles.length));
  for (let k = 0; k < roles.length; k++) {
    const r = validerRole(roles[k]!, k, moment, ancre, catalogue);
    if (r) return r;
  }
  const fin = Math.max(...roles.map((r) => r.etapes[r.etapes.length - 1]!.t));
  if (fin < moment.duree - ECART_DE_LA_FIN) return refus("durée qui ne colle pas aux étapes", `${fin} s sur ${moment.duree} s`);
  return null;
}

/** Les bâtiments qu'un moment demande finis : ceux de son lieu et les siens. */
export const batimentsDuMoment = (moment: Pick<MomentEcrit, "batiments">, ancre: Pick<Ancre, "batiments"> | null): BatimentId[] => [...new Set([...(ancre?.batiments ?? []), ...moment.batiments])];

/* ---------- Les doublons ---------- */

/** Deux chemins dont les pieds restent en moyenne à moins de tant de cases l'un de l'autre sont voisins. */
export const CHEMINS_VOISINS = 60;

/** La place du pied d'un rôle à la part `part` (de 0 à 1) de son passage. */
function pointDuRole(role: Role, part: number): { x: number; y: number } {
  const debut = role.etapes[0]!.t;
  const fin = role.etapes[role.etapes.length - 1]!.t;
  const instant = instantDuRole(role.etapes, debut + (fin - debut) * part);
  return instant ? { x: instant.x, y: instant.y } : { x: 0, y: 0 };
}

/** Les rôles d'un moment dans un ordre qui ne dépend pas de leur rang : par figurant, puis par colonne d'entrée. */
const rolesRanges = (moment: Pick<MomentEcrit, "roles">): Role[] => [...moment.roles].sort((a, b) => a.figurant.localeCompare(b.figurant) || a.etapes[0]!.x - b.etapes[0]!.x);

/**
 * Deux moments sont-ils des doublons : les mêmes figurants, au même lieu, par des chemins voisins (leurs pieds, pris à
 * neuf instants de leur passage, restent en moyenne à moins de `CHEMINS_VOISINS` cases) ?
 */
export function sontDoublons(a: Pick<MomentEcrit, "ancre" | "roles">, b: Pick<MomentEcrit, "ancre" | "roles">): boolean {
  if (a.ancre !== b.ancre || a.roles.length !== b.roles.length) return false;
  const ra = rolesRanges(a);
  const rb = rolesRanges(b);
  if (ra.some((r, i) => r.figurant !== rb[i]!.figurant)) return false;
  return ra.every((r, i) => {
    let somme = 0;
    for (let n = 0; n <= 8; n++) {
      const p = pointDuRole(r, n / 8);
      const q = pointDuRole(rb[i]!, n / 8);
      somme += Math.hypot(p.x - q.x, p.y - q.y);
    }
    return somme / 9 < CHEMINS_VOISINS;
  });
}
