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
import { podiumDates } from "./podiums";
import type { StoredMemberResult, StoredSession } from "./schemas";
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

/** « 7 victoires d'affilée », « au moins 7 victoires d'affilée ». Seulement pour une flamme allumée (5 et plus : toujours au pluriel). */
export const serieEnMots = (serie: SerieEnCours): string => `${serie.auMoins ? "au moins " : ""}${fmtInt(serie.victoires)} victoires d'affilée`;

/** Les jours de Paris de ses victoires, comme aux podiums : « le 2 nov. 2026 », « du 18 au 21 sept. 2026 ». Vide sans série. */
export function datesDeLaSerie(serie: SerieEnCours): string {
  if (!serie.depuis || !serie.jusqua) return "";
  return podiumDates({ from: parisParts(serie.depuis).date, to: parisParts(serie.jusqua).date });
}
