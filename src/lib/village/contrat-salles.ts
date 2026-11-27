/**
 * Le contrat des salles en direct du duel « Coup pour coup » (vague 2, 22 novembre 2026), entre l'écran des salles et le
 * serveur. Demande du pilote : le défi entre membres « joué entre deux vrais joueurs IRL, avec à la clé un montant de
 * statères de participation, plusieurs salles 25 50 100 250 500 1000 statères en match ».
 *
 * Le serveur décide de tout (migration `20261122001000_duel_salles_en_direct`, appels `salles` de
 * `src/lib/compte/api.ts`) : il apparie les deux joueurs, prend et garde les mises, garde la carte posée de chacun sans la
 * montrer à l'autre, résout chaque manche avec le moteur du duel (`internal.duel_manche`, sans en changer une règle), compte
 * le temps et partage le pot. Ce fichier dit la forme de ses réponses, ses refus et ses chiffres. Les écrans interrogent
 * l'état environ chaque seconde (`get_salles_duel`), sans abonnement en temps réel.
 *
 * Fonctions SQL :
 * - `get_salles_duel()` : tout l'écran (`EtatDesSalles`) ; donne aussi des nouvelles de qui attend ;
 * - `entrer_salle_duel(p_mise, p_main)` : entrer dans une salle avec sa main ; rejoint le premier qui y attend et peut
 *   jouer (le match commence), sinon attend ;
 * - `poser_carte_salle(p_match, p_manche, p_carte)` : poser sa carte ; la manche se résout quand les deux ont posé ;
 * - `quitter_salle_duel(p_match)` : quitter sa salle (rien n'est perdu) ; avec un match, le quitter aussi (il est perdu).
 *   Sans match, un match qui viendrait de commencer n'est jamais touché.
 * Chacune rend l'état entier, comme `get_salles_duel`.
 *
 * Tant que le duel est fermé, seul le titulaire (le pilote) voit les salles ; personne ne peut le rejoindre, alors la
 * machine prend la place d'en face au bout de quelques secondes : c'est un essai, rien n'est misé.
 */
import type { MainDuDuel, GauloisDuDuel, OptionsDUnCamp } from "./contrat-duel";

/** Les six salles : le prix d'entrée, qui est la mise de chacun des deux joueurs (`internal.duel_salles_mises`). */
export const SALLES_DU_DUEL = [25, 50, 100, 250, 500, 1000] as const;
export type MiseDeSalle = (typeof SALLES_DU_DUEL)[number];

/** Les secondes pour poser sa carte à chaque manche ; celui qui ne pose pas à temps perd le match. */
export const SECONDES_PAR_MANCHE = 30;
/** Les secondes de la révélation (et de l'entrée, à la première manche), avant que le temps de poser ne commence. */
export const SECONDES_DE_REVELATION = 4;
/** La part du pot qui va à la cagnotte de la saison, en pour cent. */
export const PART_DE_LA_CAGNOTTE = 10;
/** Les matchs avec mise permis par jour (heure de Paris), contre tous. */
export const MATCHS_PAR_JOUR = 10;
/**
 * Les matchs avec mise permis par jour contre un même adversaire : autant que contre tous depuis le 27 novembre 2026 (3
 * avant, retiré à la demande du pilote, migration 20261127000200).
 */
export const MATCHS_CONTRE_UN_MEME = MATCHS_PAR_JOUR;
/** Sans nouvelles de l'écran depuis ce nombre de secondes, qui attend quitte la salle. */
export const SECONDES_SANS_NOUVELLES = 10;

/** Ce qui va à la cagnotte quand un match a un gagnant : 10 % des deux mises. */
export const partDeLaCagnotte = (mise: number): number => Math.floor((2 * mise * PART_DE_LA_CAGNOTTE) / 100);
/** Ce que reçoit le gagnant : les deux mises, moins la part de la cagnotte. */
export const gainDuGagnant = (mise: number): number => 2 * mise - partDeLaCagnotte(mise);

/** Une salle, vue par un membre : son prix, et rien d'autre de personne. */
export interface SalleDuDuel {
  mise: MiseDeSalle;
  /** Un autre Gaulois y attend un adversaire (ni son nom, ni rien de lui). */
  attente: boolean;
  /** Tu peux y entrer : tu as la mise, il te reste des matchs aujourd'hui, tu n'es pas en essai du mode GOD (toujours vrai pendant l'essai du duel fermé). */
  permise: boolean;
}

/** Ton attente dans une salle. */
export interface AttenteDeSalle {
  mise: MiseDeSalle;
  depuis: string;
  main: MainDuDuel;
}

/**
 * Comment un match a fini : un Gaulois tombe (ou les 40 manches), une carte pas posée à temps, un départ (ou un compte
 * effacé), le duel fermé pendant le match (égalité, mises rendues).
 */
export type FinDeMatch = "combat" | "temps" | "quitte" | "ferme";

/**
 * Un match, vu par un de ses deux joueurs. Le camp `a` est celui qui attendait dans la salle, `b` celui qui l'a rejoint ;
 * `moi` dit lequel tu es. L'écran rejoue `coups` avec le moteur, depuis les deux camps de départ
 * (`camp(cartesDeLaMain(mains.a), options.a)`), dans l'ordre du serveur ; le moteur rend le même résultat quand on échange
 * les camps, alors chacun peut se voir à gauche. La carte que l'autre a posée pour la manche en cours n'y est jamais.
 */
export interface MatchDeSalle {
  match: number;
  mise: MiseDeSalle;
  /** Le duel est fermé : la machine tient la place d'en face, rien n'est misé. */
  essai: boolean;
  moi: "a" | "b";
  /** Le Gaulois d'en face ; `null` pendant un essai (la machine), ou si son compte a été effacé. */
  adversaire: GauloisDuDuel | null;
  /** La bannière de celui qui attendait : le lieu du match, pour les deux. */
  banniere: string | null;
  mains: { a: MainDuDuel; b: MainDuDuel };
  options: { a: OptionsDUnCamp; b: OptionsDUnCamp };
  /** Les cartes posées à chaque manche résolue : [celle de a, celle de b]. */
  coups: readonly (readonly [number, number])[];
  /** La manche à jouer (la première est 1). */
  manche: number;
  vies: { a: number; b: number };
  /** Ta carte posée pour cette manche (de 0 à 4), en attendant l'autre ; `null` tant que tu n'as pas posé. */
  pose: number | null;
  /** L'autre a posé sa carte pour cette manche ; laquelle, tu le sauras à la révélation. */
  adverse_pose: boolean;
  /** Le temps de poser commence à `ouverte_le` (après la révélation) et finit à `limite`. */
  ouverte_le: string;
  limite: string;
  fini: boolean;
  /** De ton côté : 1 gagné, -1 perdu, 0 égalité ; `null` tant que le match dure. */
  verdict: -1 | 0 | 1 | null;
  fin: FinDeMatch | null;
  /** Ce que tu as reçu à la fin : le gain (gagné), ta mise (égalité), 0 (perdu) ; `null` pendant le match ou un essai. */
  gain: number | null;
  /** Ce qui est allé à la cagnotte ; `null` pour une égalité ou un essai. */
  cagnotte: number | null;
  commence_le: string;
  fini_le: string | null;
}

/** La cagnotte de la saison du pass, faite des parts des matchs ; c'est le tableau de la saison qui la partagera. */
export interface CagnotteDeSaison {
  /** La saison du pass, ou « a-venir ». */
  saison: string;
  nom: string | null;
  montant: number;
}

/** La réponse de `get_salles_duel` (et des trois autres fonctions des salles). */
export interface EtatDesSalles {
  ok: true;
  /** Le duel est ouvert à tous ; faux pendant l'essai du titulaire. */
  ouvert: boolean;
  /** L'heure du serveur, pour compter le temps de la manche sans se fier à l'horloge de l'appareil. */
  maintenant: string;
  /** Ton solde, pour la bourse de la barre du jeu ; l'écran des salles ne le montre pas. */
  solde: number;
  salles: readonly SalleDuDuel[];
  regles: { secondes: number; revelation: number; part_cagnotte: number; par_jour: number; meme_adversaire: number };
  jour: { jour: string; joues: number; au_plus: number };
  cagnotte: CagnotteDeSaison;
  attente: AttenteDeSalle | null;
  match: MatchDeSalle | null;
  /** Ton dernier match fini depuis moins de 10 minutes, pour en montrer l'issue. */
  dernier: MatchDeSalle | null;
}

/**
 * Les refus propres aux salles (leur message en français est dans `src/lib/compte/errors.ts`) ; s'y ajoutent ceux du duel
 * (`duel_ferme`, `main_invalide`, `carte_non_possedee`, `main_trop_chere`, `mauvaise_manche`, `carte_au_repos`), du village
 * (`solde_insuffisant`, `mode_god`) et de tout le site (`rate_limited`…).
 */
export const REFUS_DES_SALLES = [
  /** Une salle qui n'existe pas. */
  "salle_inconnue",
  /** Tu joues déjà un match. */
  "match_en_cours",
  /** Les dix matchs avec mise du jour sont joués. */
  "trop_de_matchs",
  /** Ce match n'existe pas, ou tu n'y joues pas. */
  "match_inconnu",
  /** Le match est fini (le temps a pu passer). */
  "match_fini",
  /** Ta carte est déjà posée pour cette manche. */
  "deja_pose",
] as const;
export type RefusDesSalles = (typeof REFUS_DES_SALLES)[number];
