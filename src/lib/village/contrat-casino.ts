/**
 * Le contrat du casino des Gaulois (chantier du 22 novembre 2026), entre les écrans de l'onglet « Le casino » de
 * « Mon Gaulois » et le serveur. Décisions du pilote : six jeux en statères (la roue du charron, le vingt-et-un, la machine
 * du forgeron, la course des familiers, la palissade et les dés), « oui plafond de 2000 par jour », « le casino tu peux
 * l'ouvrir » (ouvert à tous les comptes validés dès la mise en ligne). Le 24 novembre 2026, le plafond passe à 12 500
 * (« 12500 plutôt ! », migration `20261124000100_casino_plafond_12500`).
 *
 * Le serveur décide et tire tout, d'abord (migration `20261123000100_casino_des_gaulois`, appels `casino` de
 * `src/lib/compte/api.ts`) : il vérifie le compte, les paris, la bourse et le plafond du jour, prend la mise au journal des
 * statères, tire le résultat avec le générateur sûr de Postgres, rend le gain. L'écran ne fait que montrer ce qu'il a reçu.
 * Les règles et les chances, au chiffre près des maquettes validées, sont dans `src/lib/village/casino/` (une par jeu) :
 * l'écran s'en sert pour dessiner, jamais pour décider.
 *
 * Fonctions SQL (toutes rendent `{ ok: true, … }` ou `{ ok: false, error }`, un code de `REFUS_DU_CASINO`) :
 * - `get_casino()` : tout l'écran d'un coup (`EtatDuCasino`) ;
 * - un appel par jeu à un coup : `jouer_roue(p_paris)`, `jouer_machine(p_mise)`, `jouer_course(p_couloir, p_mise)`,
 *   `jouer_palissade(p_mise)`, `jouer_des(p_paris)` (formes `CoupDeLaRoue` et suivantes) ;
 * - le vingt-et-un en plusieurs appels : `distribuer_vingt_et_un(p_mise)`, `jouer_vingt_et_un(p_partie, p_tour, p_coup)`,
 *   `lire_vingt_et_un()` (formes `ReponseDuVingtEtUn` et `LectureDuVingtEtUn`).
 *
 * Le solde après un coup s'appelle `solde_apres`, jamais `solde` : `call` annonce tout `solde` à la page dès la réponse
 * (`SOLDE_ANNONCE`), ce qui montrerait le résultat dans la barre du jeu avant la fin de l'animation. C'est à l'écran
 * d'annoncer `solde_apres`, quand le résultat est montré.
 *
 * Le casino ne crée aucun statère : chaque jeu à un coup rend exactement la mise en moyenne, le vingt-et-un 99,43 % joué au
 * mieux (calcul exact). Aucune cagnotte, aucun classement des gains ni des soldes, jamais rien d'un autre compte.
 */

/* ---------- Les jeux et les chiffres ---------- */

/** Les six jeux, dans l'ordre du hall. */
export const JEUX_DU_CASINO = ["roue", "vingt-et-un", "machine", "course", "palissade", "des"] as const;
export type JeuDuCasino = (typeof JEUX_DU_CASINO)[number];

/** Les jetons, en statères. Toute mise est une somme de jetons. */
export const JETONS_DU_CASINO = [10, 20, 50, 100, 200] as const;
/** Toute mise, et chaque pari d'une table, est un multiple de 10 : ainsi chaque gain est un nombre entier de statères. */
export const PAS_DES_MISES = 10;
/**
 * La mise de départ d'un tour, au plus : la somme des paris sur la table (roue, dés), un lâcher (palissade), un tirage
 * (machine), un couloir (course), la mise de départ (vingt-et-un).
 */
export const MISE_DE_DEPART_AU_PLUS = 200;
/**
 * Les statères misés par jour et par compte, au plus, tous jeux confondus, compléments du vingt-et-un compris (jour de Paris) :
 * 12 500 depuis le 24 novembre 2026 (2 000 avant). Le serveur fait foi : l'écran montre le `plafond` de `get_casino`, jamais
 * ce chiffre-ci, qui n'en est que la valeur attendue.
 */
export const PLAFOND_DU_JOUR_DU_CASINO = 12500;
/** Au vingt-et-un, doubler et séparer ajoutent chacun la mise de la main en cours : au plus 3 fois la mise de départ en tout. */
export const COMPLEMENTS_AU_PLUS = 3;
/** Les dernières parties du compte que `get_casino` rend. */
export const DERNIERES_PARTIES_DU_CASINO = 10;

/* ---------- Les paris ---------- */

/** La roue du charron : les 36 numéros, puis les paris de groupe. */
export const PARIS_DE_LA_ROUE = [
  ...Array.from({ length: 36 }, (_, i) => `n${i + 1}` as const),
  "rouge", "bleu", "pair", "impair", "bas", "haut", "t1", "t2", "t3", "c1", "c2", "c3",
] as const;
export type PariDeLaRoue = `n${number}` | "rouge" | "bleu" | "pair" | "impair" | "bas" | "haut" | "t1" | "t2" | "t3" | "c1" | "c2" | "c3";

/** Les dés : moins de 7, un double, plus de 7, puis chaque somme de 2 à 12. */
export const PARIS_DES_DES = ["moins", "double", "plus", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"] as const;
export type PariDesDes = (typeof PARIS_DES_DES)[number];

/**
 * Les paris d'une table (roue ou dés), tels que l'écran les envoie : `{ pari: statères }`. Au moins un pari ; chaque montant
 * est un multiple de 10 plus grand que zéro, écrit en chiffres seuls (`10`, jamais `10.0`) ; la somme fait au plus
 * `MISE_DE_DEPART_AU_PLUS`. Sinon refus `pari_invalide` (forme) ou `mise_trop_haute` (somme).
 */
export type MisesDeLaRoue = Partial<Record<PariDeLaRoue, number>>;
export type MisesDesDes = Partial<Record<PariDesDes, number>>;

/** Les six couloirs de la course, de 0 (3 fois, 8 chances sur 24) à 5 (24 fois, 1 chance sur 24). */
export const COULOIRS_DE_LA_COURSE = 6;

/* ---------- Ce qui revient de chaque coup ---------- */

/** Ce que rend tout coup d'un jeu à un coup. */
export interface CoupDuCasino {
  ok: true;
  /** Le numéro de la partie, au serveur. */
  partie: number;
  jeu: JeuDuCasino;
  /** Ce qui a été misé (en essai du mode GOD : ce qui l'aurait été). */
  mise: number;
  /** Ce qui revient, mise comprise : 0 quand tout est perdu. */
  rendu: number;
  /** Un essai du mode GOD : rien n'a été pris ni rendu, rien n'est écrit au journal des statères, rien ne compte pour le plafond. */
  god: boolean;
  /** Le solde après le coup, mise payée et gain reçu. À annoncer par l'écran une fois le résultat montré. */
  solde_apres: number;
  /** Les statères misés aujourd'hui (jour de Paris), ce coup compris. */
  mise_du_jour: number;
  /** Ce qu'il reste à miser aujourd'hui : `PLAFOND_DU_JOUR_DU_CASINO` moins `mise_du_jour`. */
  reste_du_jour: number;
}

/** `jouer_roue(p_paris)` : le numéro sorti (1 à 36) et ce que rend chaque pari, mise comprise. */
export interface CoupDeLaRoue extends CoupDuCasino {
  jeu: "roue";
  numero: number;
  par_pari: Record<string, number>;
}

/** Le résultat de la machine : 0 statère d'or (100 fois), 1 torque d'or (20), 2 enseigne au sanglier (5), 3 amphore (2), 4 gui (mise rendue), -1 rien. */
export type ResultatDeLaMachine = -1 | 0 | 1 | 2 | 3 | 4;

/**
 * `jouer_machine(p_mise)` : le résultat tiré, puis les neuf cases tirées au hasard parmi toutes celles qui donnent ce
 * résultat, jamais arrangées. `cases[rouleau]` : [haut, milieu, bas], des symboles 0 à 4 ; la ligne du milieu dit le résultat.
 */
export interface CoupDeLaMachine extends CoupDuCasino {
  jeu: "machine";
  resultat: ResultatDeLaMachine;
  cases: [[number, number, number], [number, number, number], [number, number, number]];
}

/** `jouer_course(p_couloir, p_mise)` : le couloir parié et le couloir gagnant (0 à 5). La course s'écrit ensuite pour ce gagnant. */
export interface CoupDeLaCourse extends CoupDuCasino {
  jeu: "course";
  couloir: number;
  gagnant: number;
}

/** `jouer_palissade(p_mise)` : les huit choix du statère, 0 à gauche, 1 à droite, et la coupe d'arrivée (0 à 8, le nombre de pas à droite). */
export interface CoupDeLaPalissade extends CoupDuCasino {
  jeu: "palissade";
  chemin: (0 | 1)[];
  coupe: number;
}

/** `jouer_des(p_paris)` : les deux faces (1 à 6) et ce que rend chaque pari, mise comprise. */
export interface CoupDesDes extends CoupDuCasino {
  jeu: "des";
  faces: [number, number];
  par_pari: Record<string, number>;
}

/* ---------- Le vingt-et-un ---------- */

/** Une carte : `r` le rang (0 l'as, 1 à 9 le 2 au 10, 10 valet, 11 dame, 12 roi), `e` l'enseigne (0 torques, 1 flammes, 2 épées, 3 chênes). */
export interface CarteDuVingtEtUn {
  r: number;
  e: number;
}

export type CoupDuVingtEtUn = "tirer" | "rester" | "doubler" | "separer";
export type IssueDuVingtEtUn = "gagne" | "egal" | "perdu" | "vingt-et-un";

/** Une main du joueur (deux après une séparation). `mise` : celle de la main, doublée si elle l'a été. */
export interface MainDuVingtEtUn {
  cartes: CarteDuVingtEtUn[];
  mise: number;
  doublee: boolean;
  finie: boolean;
  issue: IssueDuVingtEtUn | null;
  /** Ce que la main rend, mise comprise (2,5 fois la mise pour un 21 d'entrée). */
  recu: number;
}

/**
 * Ce que l'écran doit montrer, dans l'ordre. Les mêmes faits que la maquette (`c2/jeux/vingt-et-un/regles.js`), avec deux
 * différences : la carte cachée du tavernier arrive à `null` tant qu'elle n'est pas retournée, et « retourne » porte cette
 * carte.
 */
export type FaitDuVingtEtUn =
  | { t: "carte"; a: "joueur"; main: number; carte: CarteDuVingtEtUn }
  | { t: "carte"; a: "tavernier"; carte: CarteDuVingtEtUn | null; cachee?: true }
  | { t: "regarde" }
  | { t: "retourne"; carte: CarteDuVingtEtUn }
  | { t: "double"; main: number }
  | { t: "separe" }
  | { t: "main"; main: number }
  | { t: "bilan"; main: number; issue: IssueDuVingtEtUn; recu: number; entree?: true; saute?: true };

/** Les coups que les règles permettent sur la main en cours (la bourse et le plafond ne sont pas regardés ici). */
export interface CoupsPermis {
  tirer: boolean;
  rester: boolean;
  doubler: boolean;
  separer: boolean;
}

/**
 * Une main du vingt-et-un telle que le serveur la montre : jamais la carte cachée avant qu'elle soit retournée, jamais une
 * carte à venir (elles ne sont tirées qu'au moment d'être données).
 */
export interface TableDuVingtEtUn {
  partie: number;
  god: boolean;
  /** La mise de départ. */
  mise: number;
  /** Tout ce qui a été misé sur cette partie, compléments compris (en essai : ce qui l'aurait été). */
  misee: number;
  /** Les cartes du tavernier déjà montrées : la première seule tant que la carte cachée ne l'est pas. */
  tavernier: CarteDuVingtEtUn[];
  /** Le tavernier a encore une carte face cachée. */
  cachee: boolean;
  mains: MainDuVingtEtUn[];
  /** La main qui se joue (0 ou 1). */
  courante: number;
  separee: boolean;
  phase: "joueur" | "fini";
  /** Le nombre de coups déjà joués : à rendre tel quel à `jouer_vingt_et_un`, qui refuse `main_changee` sinon (un double clic ne tire jamais deux cartes). */
  tour: number;
  permis: CoupsPermis;
  /** Ce que coûtent doubler ou séparer maintenant : la mise de la main en cours (0 quand aucun des deux n'est permis). */
  complement: number;
  /** Ce que la partie rend en tout, mise comprise, une fois finie (0 avant). */
  rendu: number;
  /** Les faits nouveaux de cet appel ; pour `lire_vingt_et_un` et `get_casino`, tous ceux de la main depuis la donne. */
  faits: FaitDuVingtEtUn[];
  commence_le: string;
}

/**
 * `distribuer_vingt_et_un(p_mise)` et `jouer_vingt_et_un(p_partie, p_tour, p_coup)` : la main après l'appel, avec ses faits
 * nouveaux, puis le solde et le compte du jour. Une main finie à la donne (un 21 d'entrée d'un côté) arrive déjà finie.
 */
export interface ReponseDuVingtEtUn {
  ok: true;
  table: TableDuVingtEtUn;
  solde_apres: number;
  mise_du_jour: number;
  reste_du_jour: number;
}

/** `lire_vingt_et_un()` : la main laissée ouverte, à reprendre, ou `null`. Une main ouverte ne se perd jamais : elle attend son joueur. */
export interface LectureDuVingtEtUn {
  ok: true;
  table: TableDuVingtEtUn | null;
}

/* ---------- L'écran entier ---------- */

/** Ce que l'écran écrit d'une partie passée, selon son jeu. */
export type ResumeDePartie =
  | { jeu: "roue"; numero: number }
  | { jeu: "machine"; resultat: ResultatDeLaMachine }
  | { jeu: "course"; couloir: number; gagnant: number }
  | { jeu: "palissade"; coupe: number }
  | { jeu: "des"; faces: [number, number] }
  | { jeu: "vingt-et-un"; issues: IssueDuVingtEtUn[] };

/** Une des dernières parties finies du compte (jamais celles d'un autre). */
export interface PartieDuCasino {
  partie: number;
  jeu: JeuDuCasino;
  mise: number;
  rendu: number;
  god: boolean;
  /** Fin de la partie (ISO). */
  le: string;
  resume: ResumeDePartie;
}

/**
 * `get_casino()` : tout l'écran. Rien d'un autre compte. `peut_jouer` : compte validé avec un Gaulois créé. `ouvert` :
 * l'interrupteur `internal.casino_ouvert` (vrai) ; fermé, aucune partie ne commence, mais une main ouverte du vingt-et-un
 * se finit toujours.
 */
export interface EtatDuCasino {
  ok: true;
  ouvert: boolean;
  peut_jouer: boolean;
  /** Un essai du mode GOD est allumé : on joue sans mise ni gain. */
  god: boolean;
  solde: number;
  /** Le jour de Paris (AAAA-MM-JJ) du plafond. */
  jour: string;
  plafond: number;
  mise_au_plus: number;
  jetons: number[];
  mise_du_jour: number;
  reste_du_jour: number;
  /** Les `DERNIERES_PARTIES_DU_CASINO` dernières parties finies, de la plus récente à la plus ancienne. */
  parties: PartieDuCasino[];
  /** La main du vingt-et-un laissée ouverte, à reprendre, ou `null`. */
  main: TableDuVingtEtUn | null;
}

/* ---------- Les refus ---------- */

/**
 * Les refus du casino, chacun avec ses mots dans `src/lib/compte/errors.ts`. Un refus ne prend rien. Dans l'ordre où le
 * serveur les vérifie :
 * - `rate_limited` : trop d'actions en une minute (la cadence de tout le site) ;
 * - `not_signed_in`, `suspended`, `not_validated`, `no_gaulois` : le compte ne peut pas jouer ;
 * - `casino_ferme` : l'interrupteur est coupé (une main ouverte se finit quand même) ;
 * - `pari_invalide` : un pari inconnu, un montant qui n'est pas un multiple de 10 plus grand que zéro, aucun pari, un
 *   couloir hors de 0 à 5 ;
 * - `mise_trop_haute` : la mise de départ dépasse 200 ;
 * - `main_en_cours` : une main du vingt-et-un attend d'être finie (pour en distribuer une autre) ;
 * - `pas_de_main` : aucune main ouverte de ce compte sous ce numéro ;
 * - `main_changee` : `p_tour` n'est plus celui de la main (relire avec `lire_vingt_et_un`) ;
 * - `coup_refuse` : ce coup n'est pas permis sur la main en cours ;
 * - `mode_god` : une main jouée avec vraie mise ne se continue pas pendant un essai du mode GOD (elle attend la fin de l'essai) ;
 * - `casino_plafond` : la mise ferait passer le compte du jour au-dessus du plafond (12 500) ;
 * - `solde_insuffisant` : la bourse ne suffit pas.
 */
export const REFUS_DU_CASINO = [
  "rate_limited",
  "not_signed_in",
  "suspended",
  "not_validated",
  "no_gaulois",
  "casino_ferme",
  "pari_invalide",
  "mise_trop_haute",
  "main_en_cours",
  "pas_de_main",
  "main_changee",
  "coup_refuse",
  "mode_god",
  "casino_plafond",
  "solde_insuffisant",
] as const;
export type RefusDuCasino = (typeof REFUS_DU_CASINO)[number];
