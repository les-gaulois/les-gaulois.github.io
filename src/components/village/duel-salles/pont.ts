/**
 * Le pont entre la scène du duel (`../duel/SceneDuDuel.ts`, à la session de l'écran du duel) et un match en direct : la
 * scène croit jouer contre « le serveur » (`jouer`) ; ici, poser sa carte attend que l'autre ait posé la sienne, ce que
 * dit la relecture de l'état chaque seconde. Sans navigateur, pour pouvoir l'essayer.
 *
 * - `attendre(manche)` : la promesse que la scène attend, réglée par `relire(etat)` dès que la manche est résolue au
 *   serveur (la carte d'en face), ou rejetée si le match finit sans elle (le temps, un départ) ;
 * - `enRetard(etat)` : la scène a des manches de retard sur le serveur (une page rechargée après avoir posé, un envoi
 *   perdu) : il faut la remonter à partir des coups du serveur.
 */
import type { MatchDeSalle } from "../../../lib/village/contrat-salles";
import { saCarteALaManche } from "../../../lib/village/ecran-salles";

/** Le match a fini sans que la manche attendue soit résolue (le temps, un départ). */
export class FinSansCombat extends Error {
  constructor(readonly match: MatchDeSalle) {
    super("Le match est fini.");
  }
}

interface Attente {
  manche: number;
  ok: (carte: number) => void;
  non: (e: unknown) => void;
}

export class PontDuMatch {
  private attente: Attente | null = null;
  /** Les manches que la scène a résolues (elle part des coups du serveur au montage). */
  jouees: number;

  constructor(
    readonly id: number,
    depart: number,
  ) {
    this.jouees = depart;
  }

  /** La scène pose sa carte pour la manche `manche` : la promesse de la carte d'en face. */
  attendre(manche: number): Promise<number> {
    this.attente?.non(new Error("Une autre carte est posée."));
    return new Promise<number>((ok, non) => {
      this.attente = { manche, ok, non };
    });
  }

  /** L'envoi de la carte a échoué : la scène rend la carte à la main. */
  echouer(e: unknown): void {
    const a = this.attente;
    this.attente = null;
    a?.non(e);
  }

  /** L'état relu : règle la promesse si la manche attendue est résolue, la rejette si le match a fini sans elle. */
  relire(match: MatchDeSalle | null): void {
    const a = this.attente;
    if (!a || !match || match.match !== this.id) return;
    const carte = saCarteALaManche(match, a.manche);
    if (carte !== null) {
      this.attente = null;
      this.jouees = Math.max(this.jouees, a.manche);
      a.ok(carte);
      return;
    }
    if (match.fini) {
      this.attente = null;
      a.non(new FinSansCombat(match));
    }
  }

  /** Une promesse attend encore. */
  get enAttente(): boolean {
    return this.attente !== null;
  }

  /** La manche dont la scène attend la carte d'en face, ou `null`. */
  get mancheAttendue(): number | null {
    return this.attente?.manche ?? null;
  }

  /** La scène a du retard sur le serveur, sans rien attendre : il faut la remonter. */
  enRetard(match: MatchDeSalle): boolean {
    return match.match === this.id && !this.enAttente && match.coups.length > this.jouees;
  }

  /** Plus rien n'attend (la scène s'arrête). */
  fermer(): void {
    this.attente = null;
  }
}
