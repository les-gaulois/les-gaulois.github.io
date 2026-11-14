/**
 * L'onglet « Décisions » du QG : l'état d'un sondage pour le membre connecté, l'ordre de la liste, les filtres et leur
 * nombre, le choix en tête d'un sondage fermé et le temps qui reste avant la fermeture. Calculs purs : les voix et les
 * dates viennent du serveur (`get_qg`), rien n'est deviné. Personne ne voit qui a voté quoi.
 */
import { fmtInt } from "../format";
import type { PollRow } from "./polls";
import type { QgPoll } from "./qg";

/** Ce que le membre a à faire d'un sondage : `a-voter` ouvert sans son vote, `vote` ouvert avec son vote, `ferme`. */
export type EtatSondage = "a-voter" | "vote" | "ferme";

export function etatSondage(poll: Pick<QgPoll, "is_open" | "mine">): EtatSondage {
  if (!poll.is_open) return "ferme";
  return poll.mine === null ? "a-voter" : "vote";
}

/** Les filtres de la liste. « Ouverts » compte aussi les sondages à voter. */
export type FiltreSondages = "a-voter" | "ouverts" | "fermes";

/** Au-delà de ce nombre de sondages, la liste a ses filtres ; jusque-là, elle se lit sans eux. */
export const FILTRES_DES = 6;

export function passeLeFiltre(poll: Pick<QgPoll, "is_open" | "mine">, filtre: FiltreSondages | null): boolean {
  if (filtre === null) return true;
  if (filtre === "fermes") return !poll.is_open;
  if (filtre === "ouverts") return poll.is_open;
  return etatSondage(poll) === "a-voter";
}

/** Le nombre écrit sur chaque filtre. */
export function compterSondages(polls: readonly Pick<QgPoll, "is_open" | "mine">[]): Record<FiltreSondages, number> {
  const compte: Record<FiltreSondages, number> = { "a-voter": 0, ouverts: 0, fermes: 0 };
  for (const poll of polls) {
    if (!poll.is_open) compte.fermes += 1;
    else {
      compte.ouverts += 1;
      if (poll.mine === null) compte["a-voter"] += 1;
    }
  }
  return compte;
}

/**
 * Ce que la liste montre sous un filtre. `gardes` : les sondages où l'on vient de voter sous ce filtre ; ils restent à
 * l'écran même s'ils n'y passent plus (votés, ou fermés entre-temps), pour que le bouton cliqué ne disparaisse pas sous le
 * doigt ou sous le focus du clavier. Un filtre qui ne laisse plus rien passer se lève de lui-même (`actif` nul) : la liste
 * n'est jamais vide.
 */
export function filtrerSondages<P extends Pick<QgPoll, "id" | "is_open" | "mine">>(polls: readonly P[], filtre: FiltreSondages | null, gardes: ReadonlySet<number>): { actif: FiltreSondages | null; montres: P[] } {
  if (filtre !== null) {
    const montres = polls.filter((poll) => passeLeFiltre(poll, filtre) || gardes.has(poll.id));
    if (montres.length > 0) return { actif: filtre, montres };
  }
  return { actif: null, montres: [...polls] };
}

const RANG: Record<EtatSondage, number> = { "a-voter": 0, vote: 1, ferme: 2 };

/** Une date du serveur en millisecondes. `null` : absente ou illisible. */
function instant(iso: string | null): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * L'état de chaque sondage la première fois que la page l'a vu : `avant`, plus les sondages nouveaux. Rend `avant`
 * lui-même quand il n'y a rien de neuf. Sert à `rangerSondages` : un sondage où l'on vient de voter garde sa place.
 */
export function etatsVus(avant: ReadonlyMap<number, EtatSondage>, polls: readonly Pick<QgPoll, "id" | "is_open" | "mine">[]): ReadonlyMap<number, EtatSondage> {
  let apres: Map<number, EtatSondage> | null = null;
  for (const poll of polls) {
    if (avant.has(poll.id) || apres?.has(poll.id)) continue;
    apres ??= new Map(avant);
    apres.set(poll.id, etatSondage(poll));
  }
  return apres ?? avant;
}

/**
 * L'ordre de la liste : les sondages à voter d'abord, puis ceux où l'on a voté, puis les fermés. Parmi les ouverts, celui
 * qui ferme le plus tôt passe devant, un sondage sans date de fermeture après les autres. Parmi les fermés, le plus
 * récemment fermé d'abord, un sondage sans date de fin après les autres. À égalité, l'ordre du serveur est gardé.
 *
 * `vus` (`etatsVus`) : un sondage ouvert est rangé selon son état à son arrivée sur la page. Celui où l'on vient de voter
 * reste donc parmi les « à voter », à sa place ; un sondage qui ferme pendant la visite rejoint les fermés, à sa date.
 */
export function rangerSondages<P extends Pick<QgPoll, "id" | "is_open" | "mine" | "closes_at" | "ended_at">>(polls: readonly P[], vus?: ReadonlyMap<number, EtatSondage>): P[] {
  const rang = (poll: P): number => {
    const etat = etatSondage(poll);
    if (etat === "ferme") return RANG.ferme;
    const vu = vus?.get(poll.id);
    return vu === "a-voter" || vu === "vote" ? RANG[vu] : RANG[etat];
  };
  return polls
    .map((poll, index) => ({ poll, index, rang: rang(poll) }))
    .sort((a, b) => {
      if (a.rang !== b.rang) return a.rang - b.rang;
      if (a.rang === RANG.ferme) {
        const fa = instant(a.poll.ended_at);
        const fb = instant(b.poll.ended_at);
        if (fa !== fb) return fa === null ? 1 : fb === null ? -1 : fb - fa;
      } else {
        const ca = instant(a.poll.closes_at);
        const cb = instant(b.poll.closes_at);
        if (ca !== cb) return ca === null ? 1 : cb === null ? -1 : ca - cb;
      }
      return a.index - b.index;
    })
    .map(({ poll }) => poll);
}

/** Les choix qui ont le plus de voix, au moins une chacun. Un total qui n'est pas un nombre fini ne compte pas. */
function enTete(counts: readonly number[]): number[] {
  let best = 0;
  let tete: number[] = [];
  counts.forEach((count, i) => {
    if (!Number.isFinite(count) || count <= 0 || count < best) return;
    if (count > best) {
      best = count;
      tete = [i];
    } else tete.push(i);
  });
  return tete;
}

/**
 * Le choix en tête : l'indice du choix qui a strictement plus de voix que tous les autres. `null` si personne n'a voté ou
 * si plusieurs choix sont à égalité en tête : on ne désigne alors rien.
 */
export function choixEnTete(counts: readonly number[]): number | null {
  const tete = enTete(counts);
  return tete.length === 1 ? (tete[0] ?? null) : null;
}

/** Plusieurs choix à égalité en tête, avec au moins une voix chacun. */
export function egaliteEnTete(counts: readonly number[]): boolean {
  return enTete(counts).length > 1;
}

/**
 * La part d'un choix, écrite avec les mêmes mots qu'à la Direction : l'arrondi de `polls.ts`, sauf aux deux bouts, où il
 * tromperait. Un choix qui a des voix n'affiche jamais « 0 % » (« moins de 1 % »), ni « 100 % » s'il n'a pas toutes les
 * voix (« plus de 99 % ») ; « 0 % » et « 100 % » seulement quand c'est exact. `null` tant que personne n'a voté.
 */
export function partEcrite(row: Pick<PollRow, "count" | "share">, total: number): string | null {
  if (row.share === null || total <= 0) return null;
  if (row.count > 0 && row.share === 0) return "moins de 1\u00a0%";
  if (row.count < total && row.share === 100) return "plus de 99\u00a0%";
  return `${fmtInt(row.share)}\u00a0%`;
}

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Sous ce délai, la fermeture est dite proche : la page la montre en jaune à qui n'a pas voté. */
export const FERMETURE_PROCHE = JOUR;

/**
 * Le temps avant la fermeture, en durée entière écoulée, jamais arrondie vers le haut : « 2 jours » à partir de 48 heures,
 * puis « 47 heures », « 1 heure », « 59 minutes », « moins d'une minute ». `null` : pas de date de fermeture, date
 * illisible ou déjà passée (voir `fermeturePassee`).
 */
export function tempsRestant(closesAt: string | null, now: number): { texte: string; proche: boolean } | null {
  const fin = instant(closesAt);
  if (fin === null) return null;
  const reste = fin - now;
  if (reste <= 0) return null;
  const proche = reste < FERMETURE_PROCHE;
  if (reste >= 2 * JOUR) return { texte: `${Math.floor(reste / JOUR)} jours`, proche };
  if (reste >= HEURE) {
    const heures = Math.floor(reste / HEURE);
    return { texte: heures === 1 ? "1 heure" : `${heures} heures`, proche };
  }
  if (reste >= MINUTE) {
    const minutes = Math.floor(reste / MINUTE);
    return { texte: minutes === 1 ? "1 minute" : `${minutes} minutes`, proche };
  }
  return { texte: "moins d'une minute", proche };
}

/**
 * L'heure de fermeture d'un sondage est atteinte à l'heure de la page. Le serveur l'a dit ouvert à sa dernière lecture et
 * reste seul juge : la page ne le dit pas fermé, elle ne montre plus de temps restant mais « Heure de fermeture passée ».
 * Un vote refusé fait relire le QG, qui le montre alors fermé.
 */
export function fermeturePassee(closesAt: string | null, now: number): boolean {
  const fin = instant(closesAt);
  return fin !== null && fin <= now;
}
