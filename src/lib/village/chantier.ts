/**
 * Le calcul du monde du village (idées 1 et 2 du pilote, 14 novembre 2026) : le chantier du village qui se bâtit tout seul
 * et le grand feu de la place, à partir des sessions publiques du clan (`data/sessions/`) et de l'heure de leur relevé.
 * Calcul pur et testé (`tests/unit/village-chantier.test.ts`) ; la lecture des fichiers est dans `monde-site.ts`.
 *
 * Les règles, écrites dans `chantier-liste.ts` et appliquées ici :
 * - **Les points rapportés au clan** d'une partie sont le `score` positif de sa session, comme pour les statères
 *   (`stateres.ts`) : une partie qui fait perdre des points ne retire rien. Une partie qui paraît deux fois (même
 *   `gameId`) ne compte qu'une fois : la première lue, les mois dans l'ordre.
 * - **Le chantier** compte les parties commencées depuis `DEBUT_DU_CHANTIER` et jusqu'au relevé. Les bâtiments de
 *   `BATIMENTS` se remplissent dans l'ordre : le suivant ne reçoit rien tant que le précédent n'est pas fini. Un bâtiment
 *   est fini quand le total depuis le début atteint la somme des coûts jusqu'à lui ; `fini_le` est le début de la partie
 *   qui a fait passer ce seuil (les parties rangées par début, puis par identifiant).
 * - **Le grand feu** compte les parties commencées dans les `FEU_JOURS` × 24 heures qui finissent au relevé : une fenêtre
 *   qui glisse avec le relevé, sans saut à minuit (le feu ne baisse pas d'un coup chaque nuit). Son niveau vient de
 *   `SEUILS_DU_FEU` : 0 sous le premier seuil, puis un niveau de plus à chaque seuil atteint.
 * - **Rien d'inventé.** Les nombres de l'état sont exacts : les scores sont additionnés en décimal (ils ont deux
 *   décimales), sans les erreurs d'arrondi des nombres à virgule : 1 063,91 et non 1 063,9100000000003.
 *
 * « Pas de données » n'est pas zéro :
 * - **Sessions jamais relevées** (`meta.sessions.coveredUntil` absent ou illisible) : `releve`, `chantier` et `feu` sont
 *   `null`.
 * - **Un mois de sessions illisible** (`unreadableSessionFiles` de `data.ts`) qui touche la période comptée : la partie
 *   touchée est `null`, le chantier si le mois est celui du début du chantier ou après, le feu si le mois touche ses
 *   7 jours. Un total sans ce mois serait faux, et un bâtiment fini paraîtrait défait.
 * - **Un relevé d'avant le début du chantier** : `chantier` est `null`.
 * - **Sessions trop vieilles** : si le dernier relevé a plus de `RELEVE_DU_FEU_MAX_MS` (48 heures) au moment du calcul,
 *   `feu` est `null` : un feu d'une autre semaine ne doit pas passer pour celui de la semaine en cours. Le chantier, lui,
 *   reste : il ne fait que grandir, et il est dit « au relevé du … ». Un mois sans aucune session n'a pas de fichier :
 *   c'est un mois sans partie, pas un trou, puisque le relevé couvre la période sans trou.
 *
 * L'arrondi pour l'affichage (l'état garde les nombres exacts) :
 * - Des points rapportés (le total du chantier, les points posés sur un bâtiment, ceux du feu) s'écrivent arrondis vers le
 *   bas, à l'entier (`pointsAffiches`) : on n'écrit jamais plus que ce qui a été rapporté, et un nombre écrit atteint un
 *   seuil entier (un coût, un seuil du feu) seulement si le vrai nombre l'atteint.
 * - « Encore N points pour finir … » : N est le reste arrondi vers le haut (`pointsQuiRestent`), jamais 0 tant que le
 *   bâtiment n'est pas fini. Posés et restants écrits font toujours le coût du bâtiment.
 */
import type { StoredSession } from "../schemas";
import { BATIMENTS, DEBUT_DU_CHANTIER, FEU_JOURS, SEUILS_DU_FEU, type BatimentDuChantier, type BatimentId, type NiveauDuFeu } from "./chantier-liste";
import type { EtatDuBatiment, EtatDuChantier, EtatDuFeu, EtatDuMonde } from "./monde-etat";

/** Ce que le calcul lit d'une session du clan. */
export type SessionDuChantier = Pick<StoredSession, "gameId" | "gameStart" | "score">;

/** Au-delà de cet âge du dernier relevé des sessions, le feu n'est plus montré : 48 heures. */
export const RELEVE_DU_FEU_MAX_MS = 48 * 3_600_000;

/** La durée comptée par le feu : `FEU_JOURS` fois 24 heures, jusqu'au relevé. */
export const FENETRE_DU_FEU_MS = FEU_JOURS * 24 * 3_600_000;

export interface SourcesDuMonde {
  /** Les sessions du clan, telles que lues dans `data/sessions/`, mois après mois. */
  sessions: readonly SessionDuChantier[];
  /** L'instant jusqu'où les sessions sont relevées sans trou (`meta.sessions.coveredUntil`). `null` : jamais relevées. */
  releve: string | null;
  /** Les mois de sessions illisibles, « AAAA-MM » (le nom de leur fichier). */
  moisIllisibles: readonly string[];
  /** L'heure du calcul : la construction du site. */
  maintenant: Date;
}

/* ---------- Les nombres exacts ---------- */

/** Un score positif écrit en décimal : `entier` × 10^−`echelle`. `null` : nul, négatif ou pas un nombre. */
function enDecimal(x: number): { entier: bigint; echelle: number } | null {
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

/** Des points comptés en entiers, à une échelle commune : `valeur` vaut `valeur / 10^echelle` points. */
interface Compte {
  echelle: number;
  unite: bigint;
}

const compteDe = (echelle: number): Compte => ({ echelle, unite: 10n ** BigInt(echelle) });
const versEchelle = (d: { entier: bigint; echelle: number }, c: Compte): bigint => d.entier * 10n ** BigInt(c.echelle - d.echelle);
/** Le nombre le plus proche du compte exact : 106391 à l'échelle 2 donne 1063.91. */
const versNombre = (valeur: bigint, c: Compte): number => Number(valeur) / Number(c.unite);

/** Les parties qui rapportent des points, une fois chacune, avec leur début lu. */
interface Partie {
  gameId: string;
  debut: number;
  gameStart: string;
  points: { entier: bigint; echelle: number };
}

/** Chaque partie une fois (la première lue), si elle a rapporté des points au clan et que son début se lit. */
function partiesQuiRapportent(sessions: readonly SessionDuChantier[]): Partie[] {
  const vues = new Set<string>();
  const parties: Partie[] = [];
  for (const s of sessions) {
    if (vues.has(s.gameId)) continue;
    vues.add(s.gameId);
    const points = enDecimal(s.score);
    const debut = Date.parse(s.gameStart);
    if (points && Number.isFinite(debut)) parties.push({ gameId: s.gameId, debut, gameStart: s.gameStart, points });
  }
  return parties.sort((a, b) => a.debut - b.debut || (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : 0));
}

/** L'instant lu, ou `null`. */
function instant(iso: string | null): number | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Le mois du fichier où la collecte range une session commencée à cet instant : le jour en temps universel. */
const moisDuFichier = (t: number): string => new Date(t).toISOString().slice(0, 7);

/** Un mois illisible touche-t-il la période qui commence à `depuis` ? */
const moisTouche = (moisIllisibles: readonly string[], depuis: number): boolean => {
  const premier = moisDuFichier(depuis);
  return moisIllisibles.some((mois) => mois >= premier);
};

/* ---------- Le chantier ---------- */

/**
 * Le chantier au relevé : les points rapportés au clan depuis `DEBUT_DU_CHANTIER`, et chaque bâtiment. `null` : pas de
 * relevé, un relevé d'avant le début, ou un mois illisible dans la période (voir l'en-tête).
 */
export function etatDuChantier(sessions: readonly SessionDuChantier[], releve: string | null, moisIllisibles: readonly string[], batiments: readonly BatimentDuChantier[] = BATIMENTS): EtatDuChantier | null {
  const fin = instant(releve);
  const debut = Date.parse(DEBUT_DU_CHANTIER);
  if (fin === null || fin < debut || moisTouche(moisIllisibles, debut)) return null;
  const parties = partiesQuiRapportent(sessions).filter((p) => p.debut >= debut && p.debut <= fin);
  const compte = compteDe(Math.max(0, ...parties.map((p) => p.points.echelle)));

  // Les seuils : la somme des coûts jusqu'à chaque bâtiment, à la même échelle que les points.
  const seuils: bigint[] = [];
  let cumul = 0n;
  for (const b of batiments) {
    cumul += BigInt(b.cout) * compte.unite;
    seuils.push(cumul);
  }

  const finis: (string | null)[] = batiments.map(() => null);
  let total = 0n;
  let prochain = 0;
  for (const p of parties) {
    total += versEchelle(p.points, compte);
    while (prochain < seuils.length && total >= (seuils[prochain] ?? 0n)) finis[prochain++] = p.gameStart;
  }

  let avant = 0n;
  const etats: EtatDuBatiment[] = batiments.map((b, i) => {
    const cout = BigInt(b.cout) * compte.unite;
    const reste = total - avant;
    const poses = reste <= 0n ? 0n : reste >= cout ? cout : reste;
    avant += cout;
    return { id: b.id, nom: b.nom, titre: b.titre, cout: b.cout, poses: versNombre(poses, compte), fini_le: finis[i] ?? null };
  });
  return { depuis: DEBUT_DU_CHANTIER, points: versNombre(total, compte), batiments: etats, en_cours: etats.find((b) => b.fini_le === null)?.id ?? null };
}

/* ---------- Le grand feu ---------- */

/** Le niveau du feu pour ces points rapportés au clan sur 7 jours. */
export function niveauDuFeu(points: number): NiveauDuFeu {
  let niveau = 0;
  for (const seuil of SEUILS_DU_FEU) if (points >= seuil) niveau++;
  return niveau as NiveauDuFeu;
}

/**
 * Le grand feu au relevé : les points rapportés au clan par les parties commencées dans les 7 × 24 heures qui finissent au
 * relevé. `null` : pas de relevé, un relevé de plus de 48 heures au moment du calcul, ou un mois illisible dans ces 7 jours.
 */
export function etatDuFeu(sessions: readonly SessionDuChantier[], releve: string | null, moisIllisibles: readonly string[], maintenant: Date): EtatDuFeu | null {
  const fin = instant(releve);
  if (fin === null || maintenant.getTime() - fin > RELEVE_DU_FEU_MAX_MS) return null;
  const debut = fin - FENETRE_DU_FEU_MS;
  if (moisTouche(moisIllisibles, debut)) return null;
  const parties = partiesQuiRapportent(sessions).filter((p) => p.debut >= debut && p.debut <= fin);
  const compte = compteDe(Math.max(0, ...parties.map((p) => p.points.echelle)));
  const total = versNombre(
    parties.reduce((somme, p) => somme + versEchelle(p.points, compte), 0n),
    compte,
  );
  return { niveau: niveauDuFeu(total), points: total, jours: FEU_JOURS };
}

/* ---------- Le monde ---------- */

/** L'état du monde : le relevé, le chantier et le grand feu. */
export function etatDuMonde({ sessions, releve, moisIllisibles, maintenant }: SourcesDuMonde): EtatDuMonde {
  const fin = instant(releve);
  if (fin === null) return { releve: null, chantier: null, feu: null };
  const iso = new Date(fin).toISOString();
  return { releve: iso, chantier: etatDuChantier(sessions, iso, moisIllisibles), feu: etatDuFeu(sessions, iso, moisIllisibles, maintenant) };
}

/* ---------- L'affichage ---------- */

/** Des points rapportés, tels qu'ils s'écrivent : arrondis vers le bas, à l'entier. 1 063,91 s'écrit 1 063. */
export const pointsAffiches = (points: number): number => Math.max(0, Math.floor(points));

/** Ce qui reste à poser sur un bâtiment, tel qu'il s'écrit : arrondi vers le haut, 0 s'il est fini, jamais 0 sinon. */
export function pointsQuiRestent(batiment: Pick<EtatDuBatiment, "cout" | "poses" | "fini_le">): number {
  if (batiment.fini_le !== null) return 0;
  return Math.max(1, Math.ceil(batiment.cout - batiment.poses));
}

/** La part posée d'un bâtiment, de 0 à 1 : 1 seulement s'il est fini. Pour `dessinDuBatiment`. */
export function avancementDuBatiment(batiment: Pick<EtatDuBatiment, "cout" | "poses" | "fini_le">): number {
  if (batiment.fini_le !== null) return 1;
  return batiment.cout > 0 ? Math.min(Math.max(batiment.poses / batiment.cout, 0), 0.999) : 0;
}

/** Le bâtiment en cours, ou `null` quand tout est bâti (ou sans chantier). */
export function batimentEnCours(chantier: EtatDuChantier | null): EtatDuBatiment | null {
  if (!chantier || chantier.en_cours === null) return null;
  return chantier.batiments.find((b) => b.id === chantier.en_cours) ?? null;
}

/** Les bâtiments finis, dans l'ordre du chantier. */
export const batimentsFinis = (chantier: EtatDuChantier): EtatDuBatiment[] => chantier.batiments.filter((b) => b.fini_le !== null);

/** Le bâtiment de cet identifiant dans l'état, ou `null`. */
export const batimentDe = (chantier: EtatDuChantier, id: BatimentId): EtatDuBatiment | null => chantier.batiments.find((b) => b.id === id) ?? null;
