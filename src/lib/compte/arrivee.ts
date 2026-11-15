/**
 * L'inscription d'un nouveau compte, en trois étapes, à la demande du pilote (15 novembre 2026) : « lors de la première
 * connexion il soit obligatoire de donner son code ou connexion discord suivi d'un lien openfront », puis « pour avoir
 * accès au reste il doivent créer leur gaulois ».
 *
 * 1. Se connecter, avec Discord ou avec un code demandé dans le Discord du clan.
 * 2. Donner le lien de son profil OpenFront (`lien-openfront.ts`), qui envoie la demande de validation.
 * 3. Créer son Gaulois au vestiaire.
 *
 * Tant qu'une étape manque, le QG, le village (hors « Mon Gaulois ») et la carte de l'alliance le demandent, et « Mon
 * compte » mène de l'une à l'autre. Un écran, pas un droit : le serveur ne change pas ce qu'il donne à un compte, comme pour
 * le lien du 14 novembre. La Direction ne demande rien, pour que l'encadrement valide toujours les nouveaux venus. Un joueur
 * allié invité n'est pas un Gaulois : il n'a pas d'inscription à finir. Un compte suspendu non plus : son écran le dit.
 */
import { lienAttendu } from "./lien-openfront";
import type { Me } from "./types";

export type EtapeArrivee = "connexion" | "lien" | "gaulois";

/** Les étapes, dans l'ordre, et leur nom à l'écran. */
export const ETAPES_ARRIVEE: readonly { id: EtapeArrivee; nom: string }[] = [
  { id: "connexion", nom: "Connexion" },
  { id: "lien", nom: "Lien OpenFront" },
  { id: "gaulois", nom: "Votre Gaulois" },
];

/** Le numéro d'une étape, de 1 à 3. */
export const numeroDeLEtape = (etape: EtapeArrivee): number => ETAPES_ARRIVEE.findIndex((e) => e.id === etape) + 1;

/**
 * L'étape qui reste à faire, ou `null` s'il n'y en a plus, `undefined` le temps de le savoir.
 * `allie` : le compte est un joueur allié invité (`undefined` en lecture) ; seul un compte en attente peut l'être.
 * `gaulois` : le compte a créé son Gaulois ; `undefined` en lecture, `null` si le serveur n'a pas pu le dire. Faute de
 * réponse, rien n'est fermé : l'étape n'est qu'un écran, le serveur revérifie chaque droit.
 */
export function etapeAFaire(me: Me | null, allie: boolean | undefined, gaulois: boolean | null | undefined): EtapeArrivee | null | undefined {
  if (me === null) return undefined;
  if (!me.signed_in) return "connexion";
  if (me.status === "suspended") return null;
  if (allie === undefined) return undefined;
  if (allie) return null;
  if (lienAttendu(me)) return "lien";
  if (gaulois === undefined) return undefined;
  return gaulois === false ? "gaulois" : null;
}

/** Faut-il demander au serveur si le compte a son Gaulois ? Seulement quand c'est la dernière chose à savoir. */
export const gauloisASavoir = (me: Me | null, allie: boolean | undefined): boolean =>
  me !== null && me.signed_in && me.status !== "suspended" && allie === false && !lienAttendu(me);

/** Annoncé par le formulaire du lien, une fois la demande partie : l'en-tête relit le compte, pour passer à l'étape suivante. */
export const EVENEMENT_LIEN_ENVOYE = "gal:lien-envoye";

/** Ce que dit une porte (QG, carte de l'alliance, en-tête) quand une étape manque, et son bouton vers « Mon compte ». */
export const PORTE_ARRIVEE: Record<Exclude<EtapeArrivee, "connexion">, { manque: string; bouton: string }> = {
  lien: { manque: "Il manque le lien de votre profil OpenFront.", bouton: "Donner mon lien OpenFront" },
  gaulois: { manque: "Il manque votre Gaulois.", bouton: "Créer mon Gaulois" },
};
