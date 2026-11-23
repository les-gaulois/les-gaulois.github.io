import { useCallback, useEffect, useState } from "preact/hooks";
import type { EtatDuCasino } from "../../../lib/village/contrat-casino";

/**
 * Qui voit « Le casino » dans le menu du jeu (22 novembre 2026) : un compte dont le Gaulois existe, quand le serveur répond
 * à `get_casino`, et, tant que `CASINO_POUR_TOUS` est faux, seulement le pilote. Sans la migration du casino, la fonction
 * n'existe pas : l'onglet ne paraît pas, comme le rayon « Cartes ». Le serveur décide de tout le reste (compte validé,
 * casino ouvert, plafond du jour).
 *
 * Ce module ne charge rien des écrans du casino : la lecture de `get_casino` (`serveur.ts`, avec ce qu'elle tire de l'écran)
 * vient quand le Gaulois existe, `LeCasino.tsx` à l'ouverture de sa partie.
 */

/** L'adresse de la partie du casino dans « Mon Gaulois » : `/village#casino`. */
export const ANCRE_CASINO = "casino";

/**
 * L'ouverture du casino à tous les membres, le seul endroit qui la décide. Mise en ligne en deux temps (décision de la
 * session qui coordonne le chantier, 23 novembre 2026) : tant que c'est faux, l'onglet ne paraît qu'au titulaire du mode
 * GOD, le pilote, que le serveur reconnaît par `get_village_god` (`permis`), qui essaie la roue avec son vrai compte pendant
 * que les autres jeux sont portés ; à vrai, il paraît à tout compte dont le Gaulois existe, avec la grande nouveauté. Le
 * serveur, lui, est déjà ouvert (`internal.casino_ouvert`) : ceci ne protège rien, c'est l'annonce qui attend.
 * Ouvert à tous le 23 novembre 2026, les six jeux en ligne (le pilote : « le casino tu peux l'ouvrir ») ; comme le duel,
 * l'onglet ne paraît qu'à un compte qui peut jouer (`peut_jouer` de `get_casino`, vu par `VillageApp.tsx`).
 */
export const CASINO_POUR_TOUS = true;

/** Où l'on en est : `undefined` en lecture, `null` si le serveur n'a pas de casino, son état sinon. */
export type CasinoDuServeur = EtatDuCasino | null | undefined;

/** Retenu sur l'appareil : le visiteur a déjà ouvert le casino (son onglet ne dit plus « Nouveau »). */
const CLE_VU = "gal-casino-vu";
export function casinoDejaVu(): boolean {
  try {
    return localStorage.getItem(CLE_VU) === "oui";
  } catch {
    return true;
  }
}
export function noterCasinoVu(): void {
  try {
    localStorage.setItem(CLE_VU, "oui");
  } catch {
    // Stockage refusé : l'étiquette reviendra, rien de plus.
  }
}

/** L'état du casino, lu une fois que le Gaulois du membre existe ; `relire` le relit (retour au hall). */
export function useCasinoDuServeur(actif: boolean): { etat: CasinoDuServeur; relire: () => void } {
  const [etat, setEtat] = useState<CasinoDuServeur>(undefined);
  const [fois, setFois] = useState(0);
  useEffect(() => {
    if (!actif) return;
    let fini = false;
    void import("./serveur")
      .then(({ lireLeCasino }) => lireLeCasino())
      .catch(() => null)
      .then((e) => {
        // Une relecture qui échoue garde l'état d'avant : l'onglet ne disparaît pas sous les doigts du joueur.
        if (!fini) setEtat((avant) => e ?? (avant === undefined ? null : avant));
      });
    return () => {
      fini = true;
    };
  }, [actif, fois]);
  const relire = useCallback(() => setFois((n) => n + 1), []);
  return { etat, relire };
}
