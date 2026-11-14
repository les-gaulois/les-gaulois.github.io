/**
 * Le lien du profil OpenFront, que chaque compte donne en se connectant, avec Discord ou avec un code : obligatoire pour
 * demander sa validation, à la demande du pilote (14 novembre 2026).
 *
 * Le jeu le donne dans sa fenêtre « Compte » : en haut, le bouton « Partager le profil » copie
 * `https://openfront.io/player/<identifiant public>` (`playerProfileUrl`, src/client/utilities/PlayerProfileUrl.ts).
 * Cette fenêtre est enregistrée sous le nom `account` (src/client/Main.ts), et son routeur ouvre la fenêtre que nomme
 * `#modal=` (src/client/ModalRouter.ts) : `COMPTE_OPENFRONT_URL` y mène tout droit. Lu dans le code du jeu, commit 7f34e15
 * du 14 novembre 2026. Devant `/player/`, le chemin peut porter la version du jeu (`/v/<version>`) ou le serveur de jeu
 * (`/w<numéro>`) ; l'ancienne forme du lien, `#modal=profile&publicID=<identifiant>`, s'ouvre encore. Un identifiant public
 * tient en 22 signes au plus : lettres, chiffres, « _ » et « - ».
 *
 * Le site ne garde jamais cet identifiant : il l'envoie au serveur, qui n'en garde que l'empreinte et revérifie sa forme
 * (`request_membership_link`, migration 20261114000800_lien_openfront_obligatoire.sql). Si le jeu change ces adresses,
 * les corriger ici.
 */
import type { Me } from "./types";

/** La fenêtre « Compte » du jeu, où le joueur connecté copie le lien de son profil. */
export const COMPTE_OPENFRONT_URL = "https://openfront.io/#modal=account";

/** Le début de tout lien de profil, montré dans le champ. */
export const DEBUT_DU_LIEN = "https://openfront.io/player/";

/** La forme d'un identifiant public, la même que celle que le serveur revérifie. */
const IDENTIFIANT = /^[A-Za-z0-9_-]{1,22}$/;

const HOTES = new Set(["openfront.io", "www.openfront.io"]);

/** Le profil public d'un joueur, chez OpenFront. */
export const profilOpenFront = (identifiant: string): string => `${DEBUT_DU_LIEN}${encodeURIComponent(identifiant)}`;

/** L'identifiant d'une seule adresse, ou `null`. */
function identifiantDe(adresse: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`);
  } catch {
    return null;
  }
  if (!HOTES.has(url.hostname)) return null;
  const parties = url.pathname.split("/").slice(1);
  if (parties.at(-1) === "") parties.pop();
  if (parties[0] === "v" && parties.length >= 2) parties.splice(0, 2);
  if (parties[0] !== undefined && /^w\d+$/.test(parties[0])) parties.shift();
  if (parties.length === 2 && parties[0] === "player") {
    const identifiant = parties[1]!;
    return IDENTIFIANT.test(identifiant) ? identifiant : null;
  }
  if (parties.length === 0) {
    const ancre = new URLSearchParams(url.hash.slice(1));
    const identifiant = ancre.get("publicID");
    if (ancre.get("modal") === "profile" && identifiant !== null && IDENTIFIANT.test(identifiant)) return identifiant;
  }
  return null;
}

/**
 * L'identifiant public que nomme un lien de profil collé, ou `null` si ce n'est pas un tel lien. Le texte peut entourer le
 * lien de mots ou d'espaces : le premier lien de profil compte. Un pseudo ou un identifiant seul ne suffit pas : c'est le
 * lien qui est demandé, celui que le jeu copie.
 */
export function identifiantDuLien(texte: string): string | null {
  for (const mot of texte.trim().split(/\s+/)) {
    if (mot === "") continue;
    const identifiant = identifiantDe(mot);
    if (identifiant !== null) return identifiant;
  }
  return null;
}

/**
 * Le compte n'a encore rien donné : connecté, en attente, sans aucune demande. Le village et la porte du QG le lui demandent
 * avant tout. Un compte dont la demande est refusée, annulée ou à refaire a déjà donné quelque chose : il en renvoie une dans
 * « Mon compte », où le formulaire reste ouvert, sans que le village se ferme. Un compte validé a déjà son profil lié ; un
 * compte suspendu ne demande rien. Pour l'affichage seulement : le serveur n'exige le lien que pour la demande.
 */
export const lienAttendu = (me: Me): boolean => me.signed_in && me.status === "pending" && !me.request;
