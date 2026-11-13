/**
 * Le lien d'invitation d'un joueur allié : `/carte#invitation=<32 signes>`. L'ancre ne part jamais vers un serveur, pas même
 * vers GitHub Pages : seul le navigateur la lit, puis l'envoie au serveur du site pour l'acceptation, qui ne garde que son
 * empreinte. Le serveur décide de tout : un lien faux, annulé, déjà servi ou de plus de 7 jours est refusé là-bas.
 */

const JETON = /^[0-9a-f]{32}$/;

/** Le jeton d'invitation d'une ancre d'adresse, ou `null`. */
export function invitationDeLAncre(hash: string): string | null {
  const m = /^#?invitation=([0-9a-f]{32})$/.exec(hash.trim());
  return m ? m[1]! : null;
}

export const jetonValable = (jeton: string): boolean => JETON.test(jeton);

/** Le lien que l'encadrement envoie au joueur. */
export const lienInvitation = (origine: string, base: string, jeton: string): string => `${origine}${base}/carte#invitation=${jeton}`;

/**
 * Gardés dans l'onglet le temps de la connexion : la connexion par Discord passe par la page de compte, seule adresse de
 * retour admise par le serveur avec la Direction ; elle ramène ensuite à la carte, avec l'invitation.
 */
export const INVITATION_KEY = "gal-alliance-invitation";
export const RETOUR_CARTE_KEY = "gal-alliance-retour";

/** L'adresse de la carte de l'alliance, où la page de compte renvoie après la connexion. */
export const ADRESSE_ALLIANCE = "/carte#alliance";
