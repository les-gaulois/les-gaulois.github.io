/**
 * La vue joueur : un officier, un admin ou le fondateur voit le site comme un membre sans grade,
 * pour vérifier ce que voit le reste du clan. Seul l'affichage change : le serveur garde le vrai rôle
 * et revérifie chaque action. Le choix reste dans ce navigateur, jusqu'à ce qu'on en sorte ou qu'on se déconnecte.
 */
import type { Me } from "./types";

export const PLAYER_VIEW_KEY = "gal-vue-joueur";
const CHANGE_EVENT = "gal-vue-joueur";

/** Seul l'encadrement validé a quelque chose à masquer : un membre voit déjà le site ainsi. */
export function canUsePlayerView(me: Me | null | undefined): boolean {
  return me?.signed_in === true && me.status === "validated" && (me.rank ?? 0) >= 2;
}

/** Le compte tel que le site l'affiche : en vue joueur, l'encadrement y apparaît membre sans grade. */
export function viewedAccount(me: Me, playerView: boolean): Me {
  return playerView && canUsePlayerView(me) ? { ...me, role: "member", rank: 1 } : me;
}

/**
 * La vue joueur reste-t-elle ouverte, d'après ce qu'a répondu le serveur : le compte, ou le code de son refus ?
 * Personne de connecté, ou plus de grade : elle se ferme. Pas de réponse (`network`) : elle reste,
 * car seul l'encadrement a pu l'ouvrir, et il doit pouvoir en sortir.
 */
export function keepsPlayerView(answer: Me | { error: string }): boolean {
  if ("error" in answer) return answer.error !== "not_signed_in";
  return canUsePlayerView(answer);
}

/** Ce que le navigateur a gardé. Toute autre valeur : la vue normale. */
export const isPlayerViewOn = (raw: string | null): boolean => raw === "on";

// Quand le navigateur refuse d'écrire, la vue tient le temps de la page. `null` : le stockage fait foi.
let memory: boolean | null = null;
// Ouverte depuis cette page, et pas encore annoncée : la bande y amène le focus une fois.
let openedHere = false;

export function readPlayerView(): boolean {
  if (memory !== null) return memory;
  try {
    return isPlayerViewOn(localStorage.getItem(PLAYER_VIEW_KEY));
  } catch {
    return false;
  }
}

// La vue que montre cette page : lue à son chargement, puis changée seulement d'ici. Un autre onglet peut avoir
// changé le stockage entre-temps : c'est à la page qu'on compare, pas au stockage.
let pageView = readPlayerView();

/** Ouvre ou quitte la vue joueur, et prévient les éléments de cette page. */
export function setPlayerView(on: boolean): void {
  openedHere = on && !pageView;
  pageView = on;
  try {
    if (on) localStorage.setItem(PLAYER_VIEW_KEY, "on");
    else localStorage.removeItem(PLAYER_VIEW_KEY);
    memory = null;
  } catch {
    memory = on;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Vrai une seule fois après une ouverture faite sur cette page même. */
export function takeOpenedHere(): boolean {
  const was = openedHere;
  openedHere = false;
  return was;
}

/**
 * Prévient quand la vue change sur cette page. Renvoie de quoi arrêter l'écoute.
 * Les pages déjà ouvertes dans d'autres onglets gardent leur vue jusqu'à leur prochain chargement :
 * changer de vue sous leurs yeux fermerait un formulaire en cours. Le bouton pause des animations fait de même.
 */
export function onPlayerViewChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
