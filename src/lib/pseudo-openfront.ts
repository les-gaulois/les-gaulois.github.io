/**
 * Le pseudo public d'un membre est le nom d'utilisateur de son compte OpenFront : le champ `username` de la liste des
 * membres, que le jeu décrit comme « Account username […] (null = never set) » (`ClanMemberSchema`,
 * packages/shared/src/ClanApiSchemas.ts). Un membre sans pseudo n'a donc jamais choisi ce nom.
 *
 * Le jeu le fait choisir dans sa fenêtre « Changer le nom d'utilisateur » (src/client/ChangeUsernameModal.ts), ouverte par
 * le menu du compte, « Changer de nom d'utilisateur », ou directement par ce lien : son routeur ouvre la fenêtre que nomme
 * `#modal=` (src/client/ModalRouter.ts). Lu dans le code du jeu (commit aac56bb) et ouvert en simple visiteur le
 * 12 novembre 2026 : la fenêtre s'affiche, avec « Nouveau nom » et « Sauvegarder ». Le jeu prévient lui-même, avant
 * d'enregistrer, que le nom est ensuite gardé 30 jours. Il faut le faire avec le compte qui est dans le clan : un autre
 * compte, ou un appareil où l'on n'est pas connecté, aurait son propre nom. Le site relit la liste des membres une fois par
 * jour : le pseudo y apparaît à la relecture suivante.
 *
 * Si le jeu change cette adresse, la corriger ici et dans `supabase/functions/code-discord/index.ts` : un test compare les
 * deux.
 */
export const CHOOSE_NAME_URL = "https://openfront.io/#modal=change-username";
