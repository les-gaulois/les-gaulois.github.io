/**
 * Le programme de l'almanach des petits moments (`type.ts`) : quel moment passe à quel instant. Calcul pur, sur l'heure
 * de l'horloge (`tempsDuMonde`, en huitièmes de seconde depuis 1970) : le même instant donne le même moment pour tout le
 * monde, sur le même site.
 *
 * - **Le créneau.** Les événements d'OpenFront (`../evenements.ts`) tournent sur un cycle de dix minutes ; l'almanach, sur
 *   deux cycles. Dans le second, entre la fin du premier échange de tirs et le début du second, il y a deux minutes et
 *   demie : une minute de calme au moins, le moment (deux minutes au plus), une minute de calme encore. Quand un moment y
 *   passe, le missile de ce cycle reste dans son silo (`lutinsDesEvenements`, `lancement` à faux) : un moment ne joue
 *   jamais en même temps qu'un événement, et il y a toujours une minute au moins entre deux choses. Un moment toutes les
 *   vingt minutes, au plus : c'est rare.
 * - **Le choix.** Seulement les moments dont la phase est celle de l'heure du créneau (`lumiere.ts`), dont le lieu, les
 *   figurants et les bâtiments sont là (les bâtiments finis au chantier du monde). Chaque journée (de minuit à minuit, à
 *   l'heure de Paris) a son ordre des moments, tiré d'elle seule ; chaque créneau prend le premier qui convient et n'est pas
 *   encore passé ce jour-là. Quand il n'en reste plus, celui qui est passé le plus tôt revient.
 * - **Rien.** Sans moments, sans figurants dessinés, ou quand aucun ne convient : il ne se passe rien, et le missile part.
 */
import type { BatimentId } from "../../chantier-liste";
import { type Phase, instantDeParis, lumiereDuVillage } from "../../lumiere";
import { TEMPS_PAR_SECONDE } from "../../mouvement";
import { CYCLE, DUELS, DUREE_DU_DUEL } from "../evenements";
import type { Plan } from "../plan";
import { type Ancre, ancreDe } from "./ancres";
import { type LutinDeLAlmanach, lutinsDuMoment } from "./jeu";
import type { Moment } from "./moment";
import type { Figurant } from "./type";

/** Une minute, en temps (huitièmes de seconde). */
export const MINUTE = 60 * TEMPS_PAR_SECONDE;
/** Le cycle de l'almanach : deux cycles des événements, vingt minutes. Un créneau par cycle. */
export const CYCLE_DE_L_ALMANACH = 2 * CYCLE;
/**
 * Le créneau, dans le cycle de l'almanach : dans le second cycle des événements, d'une minute après la fin du premier
 * échange de tirs à une minute avant le second (deux minutes et demie).
 */
export const CRENEAU = { debut: CYCLE + DUELS[0] + DUREE_DU_DUEL + MINUTE, fin: CYCLE + DUELS[1] - MINUTE } as const;

/** Le temps de l'horloge à cet instant (en millisecondes depuis 1970) : huit temps par seconde, le rythme du monde. */
export const tempsDuMonde = (ms: number): number => Math.floor((ms * TEMPS_PAR_SECONDE) / 1000);
const msDuTemps = (temps: number): number => (temps * 1000) / TEMPS_PAR_SECONDE;

/** Le créneau qui contient ce temps (son rang depuis 1970) ; et le temps où il s'ouvre. */
export const creneauDuTemps = (temps: number): number => Math.floor(temps / CYCLE_DE_L_ALMANACH);
export const ouvertureDuCreneau = (n: number): number => n * CYCLE_DE_L_ALMANACH + CRENEAU.debut;

/** Le début d'un moment de cette durée (en secondes) dans le créneau `n` : au milieu du créneau, le calme partagé des deux côtés. */
export function debutDuMoment(n: number, duree: number): number {
  return ouvertureDuCreneau(n) + Math.max(0, Math.floor((CRENEAU.fin - CRENEAU.debut - Math.ceil(duree * TEMPS_PAR_SECONDE)) / 2));
}

/** Le jour de Paris d'un instant : le nombre de jours depuis le 1er janvier 1970 à minuit, heure de Paris. */
export function jourDeParis(ms: number): number {
  const ecart = instantDeParis(new Date(ms)).ete ? 2 : 1;
  return Math.floor((ms + ecart * 3_600_000) / 86_400_000);
}

/** Ce que le programme sait : les moments (dans l'ordre de `moments.json`), les figurants dessinés, les bâtiments finis. */
export interface ContexteDuProgramme {
  moments: readonly Moment[];
  figurants: ReadonlyMap<string, Figurant>;
  finis: ReadonlySet<BatimentId>;
}

/**
 * Les moments qui peuvent passer, quelle que soit l'heure : leur lieu et leurs figurants sont connus, leurs bâtiments
 * finis, et ils tiennent dans le créneau. Leurs rangs dans la liste.
 */
export function momentsJouables(ctx: ContexteDuProgramme): number[] {
  const place = (CRENEAU.fin - CRENEAU.debut) / TEMPS_PAR_SECONDE;
  const jouables: number[] = [];
  ctx.moments.forEach((m, i) => {
    const ancre = ancreDe(m.ancre);
    if (!ancre || m.duree > place || m.roles.length === 0) return;
    if (!m.roles.every((r) => ctx.figurants.has(r.figurant))) return;
    if (![...ancre.batiments, ...m.batiments].every((b) => ctx.finis.has(b))) return;
    jouables.push(i);
  });
  return jouables;
}

/** Un tirage fixe, tiré d'un seul nombre : le même jour donne le même ordre partout. */
function tirage(graine: number): () => number {
  let a = (graine * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** L'ordre des moments d'une journée : un mélange des rangs jouables, tiré du seul numéro du jour. */
export function ordreDuJour(jour: number, jouables: readonly number[]): number[] {
  const ordre = [...jouables];
  const hasard = tirage(jour + 1);
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [ordre[i], ordre[j]] = [ordre[j]!, ordre[i]!];
  }
  return ordre;
}

/** La phase de la journée à l'ouverture d'un créneau. */
export const phaseDuCreneau = (n: number): Phase => lumiereDuVillage(new Date(msDuTemps(ouvertureDuCreneau(n)))).phase;
/** Le jour de Paris d'un créneau, à son ouverture. */
export const jourDuCreneau = (n: number): number => jourDeParis(msDuTemps(ouvertureDuCreneau(n)));

/**
 * Le choix des créneaux d'une journée, de son premier créneau jusqu'à `jusqua` : pour chacun, le rang du moment qui y
 * passe, ou `null`. Chacun prend, dans l'ordre du jour, le premier moment de sa phase qui n'est pas encore passé ce
 * jour-là ; s'il n'en reste aucun, celui de sa phase qui est passé le plus tôt.
 */
function choisirLaJournee(premier: number, jusqua: number, ctx: ContexteDuProgramme, ordre: readonly number[], phaseDe: (n: number) => Phase): Map<number, number | null> {
  const choix = new Map<number, number | null>();
  const passe = new Map<number, number>();
  for (let n = premier; n <= jusqua; n++) {
    const phase = phaseDe(n);
    let pris: number | null = null;
    let plusTot: number | null = null;
    for (const i of ordre) {
      if (!ctx.moments[i]!.phases.includes(phase)) continue;
      const quand = passe.get(i);
      if (quand === undefined) {
        pris = i;
        break;
      }
      if (plusTot === null || quand < passe.get(plusTot)!) plusTot = i;
    }
    if (pris === null) pris = plusTot;
    if (pris !== null) passe.set(pris, n);
    choix.set(n, pris);
  }
  return choix;
}

/** Le premier créneau du jour de Paris du créneau `n`. */
function premierDuJour(n: number, jourDe: (n: number) => number): number {
  const jour = jourDe(n);
  let premier = n;
  // Vingt minutes par créneau : un jour en compte au plus 73.
  while (premier > n - 80 && jourDe(premier - 1) === jour) premier--;
  return premier;
}

/** Le moment du créneau `n` : son rang dans la liste, ou `null` s'il ne se passe rien. Sans cache : voir `ProgrammeDeLAlmanach`. */
export function momentDuCreneau(n: number, ctx: ContexteDuProgramme): number | null {
  const jouables = momentsJouables(ctx);
  if (jouables.length === 0) return null;
  const premier = premierDuJour(n, jourDuCreneau);
  return choisirLaJournee(premier, n, ctx, ordreDuJour(jourDuCreneau(n), jouables), phaseDuCreneau).get(n) ?? null;
}

/** Un moment prévu : lequel, à quel lieu, dans quel créneau, et le temps de l'horloge où il commence et finit. */
export interface MomentPrevu {
  moment: Moment;
  ancre: Ancre;
  creneau: number;
  debut: number;
  fin: number;
}

/**
 * Le programme d'un écran : les mêmes choix que `momentDuCreneau`, gardés en mémoire. Le choix d'une journée se fait une
 * fois, et s'allonge d'un créneau toutes les vingt minutes : à chaque image, l'écran ne fait que lire.
 */
export class ProgrammeDeLAlmanach {
  private readonly jouables: number[];
  private journee: { jour: number; premier: number; jusqua: number; choix: Map<number, number | null> } | null = null;
  private dernier: { n: number; prevu: MomentPrevu | null } | null = null;

  constructor(private readonly ctx: ContexteDuProgramme) {
    this.jouables = momentsJouables(ctx);
  }

  /** Y a-t-il un moment à jouer, un jour ou l'autre ? */
  get vide(): boolean {
    return this.jouables.length === 0;
  }

  /** Le moment du créneau `n`, ou `null`. */
  creneau(n: number): MomentPrevu | null {
    if (this.dernier?.n === n) return this.dernier.prevu;
    let prevu: MomentPrevu | null = null;
    if (this.jouables.length > 0) {
      const jour = jourDuCreneau(n);
      let j = this.journee;
      if (!j || j.jour !== jour || n < j.premier) {
        const premier = premierDuJour(n, jourDuCreneau);
        j = this.journee = { jour, premier, jusqua: n, choix: choisirLaJournee(premier, n, this.ctx, ordreDuJour(jour, this.jouables), phaseDuCreneau) };
      } else if (n > j.jusqua) {
        j.choix = choisirLaJournee(j.premier, n, this.ctx, ordreDuJour(jour, this.jouables), phaseDuCreneau);
        j.jusqua = n;
      }
      const i = j.choix.get(n) ?? null;
      const moment = i === null ? null : this.ctx.moments[i]!;
      const ancre = moment ? ancreDe(moment.ancre) : null;
      if (moment && ancre) {
        const debut = debutDuMoment(n, moment.duree);
        prevu = { moment, ancre, creneau: n, debut, fin: debut + Math.ceil(moment.duree * TEMPS_PAR_SECONDE) };
      }
    }
    this.dernier = { n, prevu };
    return prevu;
  }

  /**
   * Le moment du cycle des événements où tombe ce temps : seulement dans le second cycle de l'almanach, celui du créneau.
   * Tant qu'il y en a un, le missile de ce cycle ne part pas.
   */
  duCycle(temps: number): MomentPrevu | null {
    const dans = temps - creneauDuTemps(temps) * CYCLE_DE_L_ALMANACH;
    return dans >= CYCLE ? this.creneau(creneauDuTemps(temps)) : null;
  }

  /** Ce que l'almanach montre à ce temps de l'horloge, dans ce monde : rien la plupart du temps. */
  lutins(plan: Plan, temps: number): LutinDeLAlmanach[] {
    const prevu = this.duCycle(temps);
    if (!prevu || temps < prevu.debut || temps > prevu.fin) return [];
    return lutinsDuMoment(prevu.moment, prevu.ancre, pointDuLieu(plan, prevu.ancre), this.ctx.figurants, temps - prevu.debut);
  }
}

/** Le point d'un lieu dans ce plan, gardé en mémoire : le plan ne change pas d'une image à l'autre. */
const POINTS = new WeakMap<Plan, Map<string, { x: number; y: number }>>();
function pointDuLieu(plan: Plan, ancre: Ancre): { x: number; y: number } {
  let points = POINTS.get(plan);
  if (!points) POINTS.set(plan, (points = new Map()));
  let point = points.get(ancre.id);
  if (!point) points.set(ancre.id, (point = ancre.point(plan)));
  return point;
}

/* ---------- La lecture de moments.json ---------- */

const PHASES: readonly Phase[] = ["aube", "jour", "crepuscule", "nuit"];
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Les moments de `moments.json`, tels que l'écran les lit : déjà contrôlés à l'écriture (`moment.ts`), ils ne sont ici que
 * relus dans leur forme, sans Zod (que l'écran ne charge pas). Ce qui n'a pas la forme d'un moment est laissé de côté ;
 * une liste illisible donne une liste vide.
 */
export function lireLesMoments(donnees: unknown): Moment[] {
  if (!Array.isArray(donnees)) return [];
  return donnees.filter((m): m is Moment => {
    if (!estObjet(m) || typeof m["id"] !== "string" || typeof m["titre"] !== "string" || typeof m["ancre"] !== "string" || !nombre(m["duree"])) return false;
    if (!Array.isArray(m["phases"]) || !m["phases"].every((p) => PHASES.includes(p as Phase))) return false;
    if (!Array.isArray(m["batiments"]) || !m["batiments"].every((b) => typeof b === "string")) return false;
    if (!Array.isArray(m["roles"]) || m["roles"].length === 0) return false;
    return m["roles"].every(
      (r) =>
        estObjet(r) &&
        typeof r["figurant"] === "string" &&
        Array.isArray(r["etapes"]) &&
        r["etapes"].length >= 2 &&
        r["etapes"].every((e) => estObjet(e) && nombre(e["t"]) && nombre(e["x"]) && nombre(e["y"]) && nombre(e["o"])),
    );
  });
}
