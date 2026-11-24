import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Visage } from "../../../lib/jeu/casino-dessins";
import { SONS } from "../../../lib/jeu/casino-sons";
import type { CoupDuCasino, EtatDuCasino } from "../../../lib/village/contrat-casino";
import { niveauDuTour, type LimitesDuPupitre, type NiveauDuTour } from "../../../lib/village/ecran-casino";
import { annoncerLeSolde } from "./commun";
import type { CroupierDuJeu } from "./Croupier";
import { pluie } from "./Pieces";

/**
 * Ce que le casino donne à chaque jeu (`useCasino()`) : l'état lu au serveur, la bourse de la barre, les limites du pupitre,
 * et les deux temps d'un tour, la mise prise (`prendreLaMise`) et la fin (`finDeTour`). Un jeu n'annonce jamais la bourse
 * lui-même : il passe par ces deux gestes, dans cet ordre.
 */
export interface Casino {
  etat: EtatDuCasino;
  /** La bourse de la barre, le dernier solde du serveur. */
  bourse: number | null;
  limites: LimitesDuPupitre;
  /** Revenir au hall. */
  retour(): void;
  /** Relire l'état du casino au serveur (`get_casino`) : le reste du jour, le plafond, les parties, la bourse. */
  relire(): void;
  /** Le serveur a répondu : la barre montre la bourse sans la mise (le gain attend la fin de l'animation). */
  prendreLaMise(coup: CoupDuCasino): void;
  /**
   * La fin d'un tour, d'un seul geste, une fois le résultat montré : la barre reçoit le solde du serveur, le son juste joue
   * (rien, rendu partiel, mise rendue, gain, grand gain), le visage du croupier suit, et les statères d'un grand gain
   * pleuvent devant `scene`. `muet` : tout sauf le son (un jeu qui a le sien pour ce cas). Rend le niveau du tour.
   */
  finDeTour(f: { coup: CoupDuCasino; grand?: boolean; croupier?: CroupierDuJeu; scene?: HTMLElement | null; muet?: boolean }): NiveauDuTour;
}

export const ContexteDuCasino = createContext<Casino | null>(null);

/** Le casino autour d'un jeu. Un jeu n'existe que dans le casino. */
export function useCasino(): Casino {
  const c = useContext(ContexteDuCasino);
  if (!c) throw new Error("un jeu du casino se pose dans LeCasino");
  return c;
}

const VISAGES_DU_NIVEAU: Readonly<Record<NiveauDuTour, Visage>> = { perdu: "Clin", partiel: "", rendue: "", gain: "Joie", grand: "Bee" };

/** Les gestes de fin de tour, communs à tous les jeux (le casino les relie à son état). */
export function gestesDeFinDeTour(surCoup: (coup: CoupDuCasino) => void): Pick<Casino, "prendreLaMise" | "finDeTour"> {
  return {
    prendreLaMise(coup) {
      // En essai GOD, rien n'est pris : la bourse ne bouge pas.
      if (!coup.god) annoncerLeSolde(coup.solde_apres - coup.rendu);
    },
    finDeTour({ coup, grand = false, croupier, scene, muet = false }) {
      annoncerLeSolde(coup.solde_apres);
      surCoup(coup);
      const n = niveauDuTour(coup.rendu, coup.mise, grand);
      if (!muet) {
        if (n === "perdu") SONS.perdu();
        else if (n === "partiel") SONS.partiel();
        else if (n === "rendue") SONS.egal();
        else if (n === "grand") SONS.grandGain();
        else SONS.gain(Math.min(6, 2 + Math.round((coup.rendu - coup.mise) / 80)));
      }
      croupier?.visage(VISAGES_DU_NIVEAU[n]);
      if (n === "grand") pluie(scene ?? null);
      return n;
    },
  };
}
