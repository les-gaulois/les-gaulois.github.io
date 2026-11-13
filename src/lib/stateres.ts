/**
 * Le statère, la monnaie du village des Gaulois (docs/DIRECTION.md, « Le village des Gaulois », lot 2), décidée par le pilote le
 * 13 novembre 2026 : elle vient des points de classement des victoires où le membre a joué sous le tag du clan.
 *
 * - Le point d'une victoire est le `score` positif de la session du clan, celui que montre l'image de la victoire sur Discord
 *   (`Victory.points`, `victoires.ts`). Une défaite ne retire rien.
 * - Règle « entiers à chacun » (choix du pilote) : chaque Gaulois présent, c'est-à-dire avec des stats dans la partie et le
 *   tag du clan, reçoit tous les points de la victoire, sans partage. Un point vaut 10 statères, arrondi à l'entier le plus
 *   proche (une demie vers le haut), et une victoire qui rapporte des points donne au moins 1 statère. 1,67 point : 17
 *   statères à chacun des Gaulois de la partie.
 * - La même règle est écrite côté serveur (`internal.stateres_de_victoire`, migration 20261113001800) : l'essai de la
 *   migration compare les deux. Chaque crédit garde ses données brutes (partie, début, points, nombre de Gaulois) et le nom de
 *   sa règle : la règle peut changer sans perdre l'historique.
 * - Le calcul se fait sur l'écriture décimale du nombre, comme le fait Postgres sur le JSON reçu : 1,65 point donne 17, là où
 *   `Math.round(1.65 * 10)` donnerait 16.
 *
 * Ce fichier ne dépend de rien de Node : l'interface du village peut s'en servir. La relecture des victoires, qui calcule les
 * empreintes, est dans `stateres-releve.ts`.
 */
import { parisParts, parisStartOf } from "./time";

/** Le nom de la règle en vigueur, gardé dans chaque crédit. */
export const REGLE_STATERES = "entier";
/** Ce que vaut un point de classement. */
export const STATERES_PAR_POINT = 10;

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
 * Les statères que reçoit chaque Gaulois présent dans une victoire. `points` : le score de la session du clan (`null`, nul ou
 * négatif : rien). `gaulois` : le nombre de Gaulois de la partie (`clanPlayerCount`), gardé avec le crédit ; la règle
 * « entiers à chacun » ne s'en sert pas, mais une partie sans Gaulois ne donne rien.
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
 * La date de départ d'un Gaulois : seules comptent les victoires commencées depuis le 1er du mois de sa création, à Paris.
 * Un ancien n'a donc pas tout dès le premier jour.
 */
export const departDuGaulois = (creeLe: Date | string): string => debutDuMoisParis(creeLe);

/**
 * Depuis quand la relecture cherche des victoires : le début du mois d'il y a deux jours, à Paris. Le 1er du mois, une
 * victoire de la veille au soir est encore relue. Le serveur garde les victoires du mois en cours et du mois précédent.
 */
export const fenetreDesVictoires = (now: Date): string => debutDuMoisParis(new Date(now.getTime() - 2 * 86_400_000));

/** Ce que `get_mes_stateres()` répond à un compte connecté (migration 20261113001800). */
export interface MesStateres {
  ok: true;
  /** Compte validé par un officier : seuls ceux-là reçoivent des statères. */
  valide: boolean;
  /** Compte relié à un joueur OpenFront (empreinte de son identifiant), par lequel ses victoires sont reconnues. */
  lie: boolean;
  /** Le Gaulois est créé : sans lui, aucun crédit. */
  gaulois: boolean;
  /** Début des victoires qui comptent : 1er du mois de création du Gaulois, à Paris. `null` sans Gaulois. */
  depart: string | null;
  solde: number;
  /** Les 30 derniers crédits de victoire, du plus récent au plus ancien. */
  credits: { partie: string; debut: string; points: number; gaulois: number; stateres: number; regle: string }[];
  /** La dernière relecture des victoires par le serveur. `null` : jamais. */
  releve: string | null;
  regle: string;
}
