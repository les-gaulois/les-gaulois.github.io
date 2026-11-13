/**
 * Le statère, la monnaie du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois », lot 2), décidée par le pilote le
 * 13 novembre 2026 : les statères viennent des points rapportés au clan, 30 statères par point rapporté au clan, à chaque
 * Gaulois présent dans la partie. Le premier réglage, 10, a été triplé le soir même, quand la mesure de l'économie
 * (`village/economie.ts`) a montré des gains trois fois plus bas que prévu, les prix restant les mêmes. Aucun crédit n'avait
 * encore été donné.
 *
 * - Les points rapportés au clan par une partie sont le `score` positif de la session du clan, ceux que montre l'image de la
 *   partie sur Discord (`Victory.points`, `victoires.ts`). Une partie qui fait perdre des points ne retire rien. Aujourd'hui,
 *   seule une partie gagnée contre des joueurs rapporte des points (relevé de novembre 2026 : 538 parties à points positifs,
 *   toutes gagnées) : la relecture ne lit donc que celles-là (`stateres-releve.ts`).
 * - Règle « entiers à chacun » (choix du pilote) : chaque Gaulois présent, c'est-à-dire avec des stats dans la partie et le
 *   tag du clan, reçoit tous les points qu'elle a rapportés, sans partage. Un point vaut 30 statères, arrondi à l'entier le
 *   plus proche (une demie vers le haut), et une partie qui rapporte des points donne au moins 1 statère. 1,67 point : 50
 *   statères à chacun des Gaulois de la partie.
 * - La même règle est écrite côté serveur (`internal.stateres_de_victoire`, migration 20261113001800) : l'essai de la
 *   migration compare les deux. Chaque crédit garde ses données brutes (partie, début, points, nombre de Gaulois) et le nom de
 *   sa règle : la règle peut changer sans perdre l'historique.
 * - Le calcul se fait sur l'écriture décimale du nombre, comme le fait Postgres sur le JSON reçu : 2,05 points donnent 62
 *   (61,5 arrondi vers le haut), là où `Math.round(2.05 * 30)` donnerait 61.
 *
 * Les noms techniques (`stateresDeVictoire`, `fenetreDesVictoires`, `victoiresARelire`, et côté serveur `stateres_victoires`,
 * `noter_victoires_stateres`, la nature `'victoire'` du journal) datent de la première écriture : ils désignent les parties
 * qui ont rapporté des points au clan et ne sont jamais montrés à un membre. Tout texte lu par un membre dit « points
 * rapportés au clan ». Le « workflow des victoires » est celui qui envoie les images des parties gagnées sur Discord.
 *
 * Ce fichier ne dépend de rien de Node : l'interface du village peut s'en servir. La relecture des parties, qui calcule les
 * empreintes, est dans `stateres-releve.ts`.
 */
import { parisParts, parisStartOf } from "./time";

/** Le nom de la règle en vigueur, gardé dans chaque crédit : « entiers à chacun », 30 statères par point. */
export const REGLE_STATERES = "entier-30";
/** Ce que vaut un point rapporté au clan, en statères (le pilote, 13 novembre 2026). */
export const STATERES_PAR_POINT = 30;

/** Un nombre tel que JSON l'écrit, en entier et en puissance de dix : 1.65 donne 165 et 2. `null` : pas un nombre fini positif. */
function decimal(x: number): { entier: bigint; echelle: number } | null {
  if (!Number.isFinite(x) || x <= 0) return null;
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(x));
  if (!m) return null;
  const fraction = m[2] ?? "";
  let entier = BigInt(`${m[1]}${fraction}`);
  let echelle = fraction.length - Number(m[3] ?? 0);
  if (echelle < 0) {
    entier *= 10n ** BigInt(-echelle);
    echelle = 0;
  }
  return { entier, echelle };
}

/**
 * Les statères que reçoit chaque Gaulois présent dans une partie, pour les points qu'elle a rapportés au clan. `points` : le
 * score de la session du clan (`null`, nul ou négatif : rien). `gaulois` : le nombre de Gaulois de la partie
 * (`clanPlayerCount`), gardé avec le crédit ; la règle « entiers à chacun » ne s'en sert pas, mais une partie sans Gaulois ne
 * donne rien.
 */
export function stateresDeVictoire(points: number | null, gaulois: number): number {
  if (points === null || !Number.isInteger(gaulois) || gaulois < 1) return 0;
  const d = decimal(points);
  if (!d) return 0;
  const fois = d.entier * BigInt(STATERES_PAR_POINT);
  const unite = 10n ** BigInt(d.echelle);
  const quotient = fois / unite;
  const arrondi = (fois % unite) * 2n >= unite ? quotient + 1n : quotient;
  return Math.max(1, Number(arrondi));
}

/** L'instant où commence, à Paris, le mois de `date`. */
export function debutDuMoisParis(date: Date | string): string {
  return parisStartOf(`${parisParts(date).date.slice(0, 7)}-01`);
}

/** L'instant où commence, à Paris, le mois qui précède celui de `date`. */
export function debutDuMoisPrecedentParis(date: Date | string): string {
  const debut = Date.parse(debutDuMoisParis(date));
  // Douze heures avant le premier du mois : toujours le mois d'avant, changement d'heure compris.
  return debutDuMoisParis(new Date(debut - 12 * 3_600_000));
}

/**
 * La date de départ d'un Gaulois : seules comptent les parties commencées depuis le 1er du mois de sa création, à Paris.
 * Un ancien n'a donc pas tout dès le premier jour.
 */
export const departDuGaulois = (creeLe: Date | string): string => debutDuMoisParis(creeLe);

/**
 * Depuis quand la relecture cherche des parties qui ont rapporté des points : le début du mois d'il y a deux jours, à Paris.
 * Le 1er du mois, une partie de la veille au soir est encore relue. Le serveur garde les parties du mois en cours et du mois
 * précédent.
 */
export const fenetreDesVictoires = (now: Date): string => debutDuMoisParis(new Date(now.getTime() - 2 * 86_400_000));

/** Ce que `get_mes_stateres()` répond à un compte connecté (migration 20261113001800). */
export interface MesStateres {
  ok: true;
  /** Compte validé par un officier : seuls ceux-là reçoivent des statères. */
  valide: boolean;
  /** Compte relié à un joueur OpenFront (empreinte de son identifiant), par lequel ses parties sont reconnues. */
  lie: boolean;
  /** Le Gaulois est créé : sans lui, aucun crédit. */
  gaulois: boolean;
  /** Début des parties qui comptent : 1er du mois de création du Gaulois, à Paris. `null` sans Gaulois. */
  depart: string | null;
  solde: number;
  /** Les 30 derniers crédits, un par partie qui a rapporté des points au clan, du plus récent au plus ancien. */
  credits: { partie: string; debut: string; points: number; gaulois: number; stateres: number; regle: string }[];
  /** La dernière relecture des parties par le serveur. `null` : jamais. */
  releve: string | null;
  regle: string;
}
