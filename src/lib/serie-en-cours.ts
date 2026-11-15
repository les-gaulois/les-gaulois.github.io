/**
 * La série de victoires en cours d'un membre, pour la flamme de série (demande du pilote, 15 novembre 2026 : « une petite
 * flamme près du Gaulois tant que sa série de victoires dure, à partir de 5 d'affilée ; elle s'éteint à la première
 * défaite »). Même source et mêmes règles que les plus longues séries des podiums de Records (`src/lib/podiums.ts`) : la
 * liste officielle des parties du membre, `/public/player/:id/sessions`, réduite aux lignes de `stats.team` (publiques, en
 * équipe, hors classé, sous le tag), gardée dans `.cache/member-games/results.json`.
 *
 * - Une défaite coupe toujours la série, même sans session du clan : elle compte dans `stats.team`.
 * - Une victoire ne compte qu'avec une session du clan pour cette partie, et pas seul contre des robots : sinon elle ne
 *   compte pas et ne coupe rien (Humains contre Nations, que cette liste range en équipe).
 * - Une victoire plus récente que les sessions relevées (`coveredUntil`) ne peut pas encore être reconnue : elle attend le
 *   passage suivant, et le chiffre est alors un minimum (`auMoins`).
 * - Si aucune défaite n'est lue et que l'historique du membre n'est pas lu jusqu'au bout, la série peut commencer plus tôt :
 *   le chiffre est aussi un minimum.
 *
 * Rien n'est du temps réel. Le robot ne relit les parties d'un membre que quand son total de parties sous le tag change
 * (`seen` de `pipeline.ts`) : si ce total est celui de la liste officielle du moment, la série est à jour à l'heure de
 * cette liste (`releve`) ; sinon, des parties attendent d'être lues, la série n'est pas connue, et la flamme ne s'allume
 * pas (une flamme périmée vaut moins que pas de flamme). Un membre qui ne joue plus garde sa série, qui n'a pas pris fin
 * (choix du pilote, 15 novembre 2026 : « elle reste jusqu'à la prochaine défaite », aucune extinction après un temps sans jouer) :
 * ses dates s'écrivent toujours avec elle (`datesDeLaSerie`), pour qu'une série de septembre ne se lise pas comme d'aujourd'hui.
 */
import { fmtInt } from "./format";
import { MIN_STREAK, plusLongueSerie, podiumDates, rangeesDuMembre } from "./podiums";
import type { StoredMemberResult, StoredMemberResults, StoredSession } from "./schemas";
import { parisParts } from "./time";

/** La flamme s'allume à partir de 5 victoires d'affilée. */
export const FLAMME_DES = 5;

export interface SerieEnCours {
  /** Les victoires reconnues depuis la dernière défaite, 0 s'il vient de perdre. */
  victoires: number;
  /** Le chiffre est un minimum : une victoire attend encore sa session, ou le début de la série n'est pas encore lu. */
  auMoins: boolean;
  /** Le début de la première victoire de la série (heure ISO), `null` sans série. */
  depuis: string | null;
  /** Le début de la dernière victoire comptée (heure ISO), `null` sans série. */
  jusqua: string | null;
  /** L'heure à laquelle la série est connue : celle de la liste officielle quand ses parties sont toutes lues, sinon celle de leur lecture. */
  releve: string;
}

/** Les heures ISO se comparent comme du texte. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * La série en cours d'un membre. `null` : pas de données (ses parties jamais lues, les sessions du clan pas relevées, ou
 * des parties pas encore lues), ce qui n'est pas une série de zéro. `liste` : son total de parties sous le tag dans la liste
 * officielle du moment (`stats.team`, victoires et défaites) et l'heure de cette liste.
 */
export function serieEnCours(
  entry: StoredMemberResult | undefined,
  byId: ReadonlyMap<string, Pick<StoredSession, "totalPlayerCount">>,
  coveredUntil: string | null,
  liste?: { parties: number; le: string },
): SerieEnCours | null {
  if (!entry || coveredUntil === null) return null;
  if (liste && entry.seen !== liste.parties) return null;
  const seen = new Set<string>();
  const rows = entry.games
    .filter(([gameId]) => {
      if (seen.has(gameId)) return false;
      seen.add(gameId);
      return true;
    })
    .sort(([a, startA], [b, startB]) => compare(startA, startB) || compare(a, b));

  let victoires = 0;
  let depuis: string | null = null;
  let jusqua: string | null = null;
  let enAttente = false;
  let defaiteLue = false;
  for (const [gameId, start, won] of rows) {
    if (won === 0) {
      victoires = 0;
      depuis = null;
      jusqua = null;
      enAttente = false;
      defaiteLue = true;
      continue;
    }
    if (start > coveredUntil) {
      enAttente = true;
      continue;
    }
    const session = byId.get(gameId);
    if (!session || session.totalPlayerCount < 2) continue;
    victoires++;
    if (victoires === 1) depuis = start;
    jusqua = start;
  }
  const debutPasLu = !defaiteLue && entry.older !== null;
  // La plus récente des deux heures : celle de la liste, ou celle de la lecture de ses parties si elle a dû attendre un passage.
  const releve = liste && liste.le > entry.readAt ? liste.le : entry.readAt;
  return { victoires, auMoins: victoires > 0 && (enAttente || debutPasLu), depuis, jusqua, releve };
}

/** La flamme est-elle allumée ? */
export const flammeAllumee = (serie: SerieEnCours | null): serie is SerieEnCours => serie !== null && serie.victoires >= FLAMME_DES;

/** « 7 victoires d'affilée », « au moins 7 victoires d'affilée ». Seulement à partir de 2 (toujours au pluriel). */
export const serieEnMots = (serie: Pick<SerieEnCours, "victoires" | "auMoins">): string => `${serie.auMoins ? "au moins " : ""}${fmtInt(serie.victoires)} victoires d'affilée`;

/**
 * Le record personnel d'un membre (demande du pilote, 15 novembre 2026) : sa plus longue série de victoires d'affilée sous
 * le tag, la même que celle des podiums de Records (`plusLongueSerie`), comptée depuis la première de ses parties lues.
 * Chacun se mesure à lui-même : ce n'est pas un classement.
 */
export interface RecordPersonnel {
  victoires: number;
  /** Un minimum : c'est la série en cours, et une de ses victoires attend sa session (`SerieEnCours.auMoins`). */
  auMoins: boolean;
  /** Le début de la première et de la dernière victoire de cette série (heures ISO). */
  debut: string;
  fin: string;
  /** Le début de la première de ses parties lues et comptées : la série la plus longue se compte depuis ce jour. */
  luesDepuis: string;
  /**
   * La série en cours bat l'ancien record du membre, qui avait lui-même eu sa flamme (5 et plus) : la flamme passe à l'or.
   * Une première série, ou une ancienne plus courte que 5, ne suffit pas : mesuré le 15 novembre 2026, battre n'importe
   * quelle série d'avant aurait doré 6 flammes sur 11, battre une ancienne flamme 1 sur 11. À égalité, non. Seulement quand
   * tout son historique est lu : une série plus ancienne, pas encore lue, pourrait être plus longue.
   */
  doree: boolean;
  /** Ce record est la série en cours, qui n'a pas pris fin : « sans défaite depuis », toujours avec ses dates. */
  courante: boolean;
  /** Son record d'avant la série en cours, quand celle-ci le bat ; sinon `null`. */
  ancien: number | null;
}

/**
 * Le record personnel d'un membre. `null` : pas de données, ou pas de série d'au moins 2 victoires, le seuil des podiums.
 * Comme aux podiums de Records, il se donne même quand des parties récentes attendent d'être lues : sa plus longue série
 * passée reste juste. `serie` : sa série en cours (`null` quand ses parties ne sont pas toutes lues), pour savoir si elle
 * est ce record : seule elle peut le dire en cours ou doré.
 */
export function recordPersonnel(
  entry: StoredMemberResult | undefined,
  byId: ReadonlyMap<string, Pick<StoredSession, "totalPlayerCount">>,
  coveredUntil: string | null,
  serie: SerieEnCours | null,
): RecordPersonnel | null {
  if (!entry || coveredUntil === null) return null;
  const best = plusLongueSerie(entry, byId, coveredUntil);
  const premiere = rangeesDuMembre(entry, coveredUntil)[0];
  if (!best || best.value < MIN_STREAK || !premiere) return null;
  // La plus longue série garde la première atteinte : si elle finit sur la dernière victoire de la série en cours, celle-ci la
  // bat. Son record d'avant se lit dans les parties d'avant le début de la série en cours.
  const courante = serie !== null && serie.victoires === best.value && serie.depuis !== null && serie.jusqua === best.to;
  const ancien = courante && flammeAllumee(serie) ? (plusLongueSerie({ ...entry, games: entry.games.filter(([, start]) => start < serie.depuis!) }, byId, coveredUntil)?.value ?? 0) : 0;
  const doree = ancien >= FLAMME_DES && entry.older === null;
  return { victoires: best.value, auMoins: courante && serie.auMoins, debut: best.from, fin: best.to, luesDepuis: premiere[1], doree, courante, ancien: doree ? ancien : null };
}

/**
 * Les compagnons de flamme (demande du pilote, 15 novembre 2026, idée de Claude Fable 5.2) : les Gaulois qui ont gagné avec
 * le membre au moins une partie de sa série en cours. Seuls les membres au pseudo public de la liste officielle sont nommés,
 * reconnus dans leur propre liste de parties (la même partie, gagnée) ; un anonyme n'est jamais nommé.
 */
export interface CompagnonsDeFlamme {
  /** Du plus présent dans la série au moins présent, puis par ordre alphabétique. Aucun nombre n'est montré. */
  noms: { id: string; username: string }[];
  /**
   * Une partie de la série comptait plus de Gaulois du clan (`clanPlayerCount` de sa session) que lui, ceux nommés, et les
   * membres nommés dont la liste la donne perdue : des membres sans pseudo public, partis, ou dont les parties ne sont pas
   * encore lues. Un membre nommé qui l'a perdue selon OpenFront (parti avant la fin) n'en est pas.
   */
  autres: boolean;
}

/** Pour chaque partie, les membres nommés qui l'ont gagnée et ceux qui l'ont perdue : construit une fois pour toutes les fiches. */
export function nommesParPartie(results: StoredMemberResults, nommes: ReadonlyMap<string, string>): Map<string, { gagnants: Set<string>; perdants: Set<string> }> {
  const index = new Map<string, { gagnants: Set<string>; perdants: Set<string> }>();
  for (const [id, entry] of Object.entries(results)) {
    if (!nommes.has(id)) continue;
    for (const [gameId, , won] of entry.games) {
      let partie = index.get(gameId);
      if (!partie) index.set(gameId, (partie = { gagnants: new Set(), perdants: new Set() }));
      (won === 1 ? partie.gagnants : partie.perdants).add(id);
    }
  }
  return index;
}

/**
 * Les parties de la série en cours d'un membre : ses victoires reconnues (une session du clan, pas seul contre des robots)
 * depuis sa dernière défaite, jusqu'aux sessions relevées. Les mêmes que compte `serieEnCours` quand la flamme est allumée :
 * une défaite plus récente que les sessions l'aurait éteinte.
 */
export function partiesDeLaSerie(entry: StoredMemberResult, byId: ReadonlyMap<string, Pick<StoredSession, "totalPlayerCount">>, coveredUntil: string): string[] {
  const rangees = rangeesDuMembre(entry, coveredUntil);
  let derniereDefaite = -1;
  rangees.forEach(([, , won], i) => {
    if (won === 0) derniereDefaite = i;
  });
  return rangees.slice(derniereDefaite + 1).flatMap(([gameId]) => {
    const session = byId.get(gameId);
    return session && session.totalPlayerCount >= 2 ? [gameId] : [];
  });
}

/**
 * Les compagnons de la série en cours d'un membre. `null` : pas de flamme, ou personne avec lui (des parties gagnées sans
 * autre Gaulois). `nommes` : identifiant public → pseudo, les membres au pseudo public de la liste.
 */
export function compagnonsDeFlamme(
  id: string,
  serie: SerieEnCours | null,
  entry: StoredMemberResult | undefined,
  byId: ReadonlyMap<string, Pick<StoredSession, "totalPlayerCount" | "clanPlayerCount">>,
  coveredUntil: string | null,
  parPartie: ReadonlyMap<string, { gagnants: ReadonlySet<string>; perdants: ReadonlySet<string> }>,
  nommes: ReadonlyMap<string, string>,
): CompagnonsDeFlamme | null {
  if (!flammeAllumee(serie) || !entry || coveredUntil === null) return null;
  const presences = new Map<string, number>();
  let autres = false;
  for (const gameId of partiesDeLaSerie(entry, byId, coveredUntil)) {
    const session = byId.get(gameId)!;
    const partie = parPartie.get(gameId);
    const avec = [...(partie?.gagnants ?? [])].filter((autre) => autre !== id);
    const perdants = [...(partie?.perdants ?? [])].filter((autre) => autre !== id).length;
    for (const autre of avec) presences.set(autre, (presences.get(autre) ?? 0) + 1);
    if (session.clanPlayerCount - 1 - perdants > avec.length) autres = true;
  }
  const noms = [...presences]
    .map(([autre, fois]) => ({ id: autre, username: nommes.get(autre)!, fois }))
    .sort((a, b) => b.fois - a.fois || a.username.localeCompare(b.username, "fr"))
    .map(({ id: autre, username }) => ({ id: autre, username }));
  return noms.length > 0 || autres ? { noms, autres } : null;
}

/** Cinq compagnons nommés au plus sur la fiche : le reste entre dans « et d'autres Gaulois », sans nombre. */
export const MAX_COMPAGNONS = 5;

/**
 * La phrase des compagnons, en morceaux pour la page (conception de Claude Fable 5.2) : « Série gagnée avec : Alba, Brennos
 * et Катя », « … Alba, Brennos et d'autres Gaulois », « Série gagnée avec d'autres Gaulois ». Chaque nom garde son
 * identifiant, pour le lien vers sa fiche ; `avant` est ce qui le précède. `null` : pas de ligne.
 */
export function phraseDesCompagnons(c: CompagnonsDeFlamme | null): { intro: string; noms: { id: string; username: string; avant: string }[]; fin: string } | null {
  if (!c) return null;
  const affiches = c.noms.slice(0, MAX_COMPAGNONS);
  const autres = c.autres || c.noms.length > MAX_COMPAGNONS;
  if (affiches.length === 0 && !autres) return null;
  return {
    intro: affiches.length > 0 ? "Série gagnée avec : " : "Série gagnée avec ",
    noms: affiches.map((n, i) => ({ ...n, avant: i === 0 ? "" : i === affiches.length - 1 && !autres ? " et " : ", " })),
    fin: autres ? `${affiches.length > 0 ? " et " : ""}d'autres Gaulois` : "",
  };
}

/** Les jours de Paris de ses victoires, comme aux podiums : « le 2 nov. 2026 », « du 18 au 21 sept. 2026 ». Vide sans série. */
export function datesDeLaSerie(serie: SerieEnCours): string {
  if (!serie.depuis || !serie.jusqua) return "";
  return podiumDates({ from: parisParts(serie.depuis).date, to: parisParts(serie.jusqua).date });
}

/** Les jours de Paris du record, les mêmes qu'au podium de Records : « le 2 nov. 2026 », « du 3 au 4 oct. 2026 ». */
export const datesDuRecord = (record: RecordPersonnel): string => podiumDates({ from: parisParts(record.debut).date, to: parisParts(record.fin).date });
