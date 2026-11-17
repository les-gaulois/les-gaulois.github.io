/**
 * Quels films de parties le robot fait et garde (`scripts/filmer-parties.ts`), et la liste que lisent les pages
 * (`scripts/publier-films.ts`, page « Revoir une partie »). Le clan joue environ 75 parties par jour (novembre 2026), un film
 * pèse 60 à 320 Ko (165 Ko en moyenne sur les 14 premiers) : seules les parties des derniers jours restent, les plus récentes
 * d'abord, dans un budget de place, soit environ trois jours de parties.
 *
 * Les films vivent hors de Git, dans le cache du workflow (`.cache/films/`) : le dépôt n'en garde aucune trace. Perdu, le cache
 * se refait en quelques passages, les parties les plus récentes d'abord.
 */
import { z } from "zod";
import { FAITS_MAX } from "./journal-ecran";

export const DOSSIER_FILMS = ".cache/films";
export const INDEX_DES_FILMS = `${DOSSIER_FILMS}/index.json`;
/** Ce que la page lit, copié au build par `scripts/publier-films.ts` ; hors de Git. */
export const DOSSIER_PUBLIC_FILMS = "public/films";
export const LISTE_DES_FILMS = `${DOSSIER_PUBLIC_FILMS}/liste.json`;

/** Les parties de moins de tant de jours seulement. */
export const JOURS_DE_FILMS = 7;
/**
 * Au plus tant d'octets de films en tout : le paquet du site, publié chaque heure, en garde la taille raisonnable (17 Mo sans
 * eux, le 10 novembre 2026).
 */
export const BUDGET_FILMS_OCTETS = 40_000_000;
/** Un film plus lourd n'est pas gardé : aucune des 14 premières parties n'a dépassé 320 Ko. */
export const MAX_OCTETS_FILM = 2_000_000;
/** Ni une fois décompressé : 160 000 cases de terrain et 360 images de plages changées. Le même seuil au filmage et à la publication. */
export const MAX_OCTETS_FILM_DECOMPRESSE = 24_000_000;
/** Une partie qui échoue autant de fois n'est plus essayée. */
export const ESSAIS_MAX = 3;

const Partie = z.string().regex(/^[A-Za-z0-9]{1,32}$/);
const Debut = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

export const IndexDesFilms = z.object({
  // 2 depuis les films à noms et unités (version 2 de film.ts) : un index plus ancien repart de zéro, et ses films se refont.
  format: z.literal(2),
  /** `commit` : la version du jeu qui a joué la partie (depuis le vrai lecteur du jeu, 15 novembre 2026), pour lui trouver son lecteur. */
  /** `journal` : le journal « Entre Gaulois » (17 novembre 2026, `journal.ts`) est gardé avec le film ; `false`, le moteur de cette version ne note pas les faits ; absent, le film date d'avant et se refait (`partiesARefilmer`). `pseudos` : `2`, ce journal nomme chaque joueur humain par son pseudo de la partie (17 novembre 2026) ; absent ou `true` (les Gaulois seuls, premier jet du même jour) sur un journal gardé, il se refait aussi. */
  films: z.array(z.object({ partie: Partie, debut: Debut, octets: z.number().int().min(1).max(MAX_OCTETS_FILM), commit: z.string().regex(/^[0-9a-f]{40}$/).optional(), journal: z.boolean().optional(), pseudos: z.union([z.literal(true), z.literal(2)]).optional() })).max(10_000),
  /** Les parties qui n'ont pas pu être filmées : `definitive`, elles ne le seront jamais (fiche inutilisable, partie trop longue). */
  ratees: z.array(z.object({ partie: Partie, debut: Debut, raison: z.string().max(200), essais: z.number().int().min(1), definitive: z.boolean() })).max(10_000),
  /** La fin du dernier passage du robot des films allé à son terme : la date que la page montre. `null` : aucun encore. */
  passage: Debut.nullable().default(null),
});
export type IndexDesFilms = z.infer<typeof IndexDesFilms>;

export const indexVide = (): IndexDesFilms => ({ format: 2, films: [], ratees: [], passage: null });

/** L'index du cache. Absent ou illisible : vide, et les films se refont. */
export function lireIndex(texte: string | null): IndexDesFilms {
  if (texte === null) return indexVide();
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return indexVide();
  }
  const lu = IndexDesFilms.safeParse(brut);
  if (lu.success) return lu.data;
  // Un index de la version 1 : ses films se refont, mais ses échecs pour de bon restent (une partie trop longue ne reprend pas
  // les 9 minutes d'un passage), comme la date de son dernier passage.
  const ancien = IndexDesFilms.extend({ format: z.literal(1) }).safeParse(brut);
  if (ancien.success) return { ...indexVide(), ratees: ancien.data.ratees.filter((r) => r.definitive), passage: ancien.data.passage };
  return indexVide();
}

/** Le fichier du film d'une partie. L'identifiant vient de l'API : vérifié avant d'en faire un nom de fichier. */
export function nomDuFilm(partie: string): string | null {
  return Partie.safeParse(partie).success ? `${partie}.film` : null;
}

/** La fiche nettoyée de la partie, compressée, gardée avec son film pour le vrai lecteur du jeu (`ficheNettoyee`, lecteur-jeu.ts). */
export function nomDeLaFiche(partie: string): string | null {
  return Partie.safeParse(partie).success ? `${partie}.fiche.json.gz` : null;
}

/** Le journal « Entre Gaulois » de la partie, gardé avec son film (`Journal`, journal.ts). */
export function nomDuJournal(partie: string): string | null {
  return Partie.safeParse(partie).success ? `${partie}.journal.json` : null;
}

const ageMs = (debut: string, now: Date) => now.getTime() - Date.parse(debut);
const recent = (debut: string, now: Date) => ageMs(debut, now) <= JOURS_DE_FILMS * 86_400_000;

/**
 * Les parties à filmer, de la plus récente à la plus ancienne : celles des derniers jours, sans film, qui n'ont pas échoué
 * pour de bon ni trop souvent. Quand le budget est plein, une partie plus ancienne que le plus ancien film gardé ne se filme
 * pas : son film serait retiré aussitôt.
 */
export function partiesAFilmer<S extends { gameId: string; gameStart: string }>(sessions: readonly S[], index: IndexDesFilms, now: Date): S[] {
  const faites = new Set(index.films.map((f) => f.partie));
  const abandonnees = new Set(index.ratees.filter((r) => r.definitive || r.essais >= ESSAIS_MAX).map((r) => r.partie));
  const total = index.films.reduce((s, f) => s + f.octets, 0);
  const plusAncien = index.films.reduce<string | null>((m, f) => (m === null || f.debut < m ? f.debut : m), null);
  // Plein : un film de plus, du poids moyen des films gardés, ne tiendrait pas. Le rangement s'arrête juste sous le budget
  // (`rangerLesFilms`), jamais dessus : comparer le total au budget seul laissait le robot filmer à chaque passage, pendant
  // tout son temps, des parties anciennes aussitôt retirées (vu le 17 novembre 2026 : 4 minutes par heure pour rien, et les
  // films à refaire pour leur journal n'étaient jamais atteints).
  const plein = index.films.length > 0 && total + total / index.films.length > BUDGET_FILMS_OCTETS;
  const vues = new Set<string>();
  return sessions
    .filter((s) => {
      if (vues.has(s.gameId)) return false;
      vues.add(s.gameId);
      if (!Partie.safeParse(s.gameId).success || !Debut.safeParse(s.gameStart).success) return false;
      if (!recent(s.gameStart, now) || faites.has(s.gameId) || abandonnees.has(s.gameId)) return false;
      return !(plein && plusAncien !== null && s.gameStart < plusAncien);
    })
    .sort((a, b) => b.gameStart.localeCompare(a.gameStart) || a.gameId.localeCompare(b.gameId));
}

/**
 * Les parties déjà filmées à refaire pour leur journal « Entre Gaulois », de la plus récente à la plus ancienne : celles dont le film
 * date d'avant le journal (17 novembre 2026), ou dont le journal date d'avant les pseudos de la partie. Elles passent après les parties sans film, s'il reste du temps au passage, et
 * une partie qui échoue trop souvent n'est plus essayée : son film d'avant reste.
 */
export function partiesARefilmer<S extends { gameId: string; gameStart: string }>(sessions: readonly S[], index: IndexDesFilms, now: Date): S[] {
  const sansJournal = new Set(index.films.filter((f) => f.journal === undefined || (f.journal && f.pseudos !== 2)).map((f) => f.partie));
  const abandonnees = new Set(index.ratees.filter((r) => r.definitive || r.essais >= ESSAIS_MAX).map((r) => r.partie));
  const vues = new Set<string>();
  return sessions
    .filter((s) => {
      if (vues.has(s.gameId)) return false;
      vues.add(s.gameId);
      return sansJournal.has(s.gameId) && !abandonnees.has(s.gameId) && Debut.safeParse(s.gameStart).success && recent(s.gameStart, now);
    })
    .sort((a, b) => b.gameStart.localeCompare(a.gameStart) || a.gameId.localeCompare(b.gameId));
}

/** Note un échec : `definitive`, la partie ne sera plus essayée ; sinon, au plus `ESSAIS_MAX` fois. */
export function noterEchec(index: IndexDesFilms, partie: string, debut: string, raison: string, definitive: boolean): IndexDesFilms {
  const avant = index.ratees.find((r) => r.partie === partie);
  const ratee = { partie, debut, raison: raison.slice(0, 200), essais: (avant?.essais ?? 0) + 1, definitive };
  return { ...index, ratees: [...index.ratees.filter((r) => r.partie !== partie), ratee] };
}

/** Note un film fait : la partie sort des échecs. `journal` : son journal est gardé (`true`), ou le moteur ne note pas les faits (`false`). */
export function noterFilm(index: IndexDesFilms, partie: string, debut: string, octets: number, commit?: string, journal?: boolean): IndexDesFilms {
  return { ...index, films: [...index.films.filter((f) => f.partie !== partie), { partie, debut, octets, ...(commit ? { commit } : {}), ...(journal !== undefined ? { journal } : {}), ...(journal ? { pseudos: 2 as const } : {}) }], ratees: index.ratees.filter((r) => r.partie !== partie) };
}

/**
 * Ce qui reste : les films des derniers jours, du plus récent au plus ancien, tant que le budget le permet, et les échecs des
 * derniers jours. `retires` : les films à effacer du cache.
 */
export function rangerLesFilms(index: IndexDesFilms, now: Date): { index: IndexDesFilms; retires: string[] } {
  const tries = [...index.films].sort((a, b) => b.debut.localeCompare(a.debut) || a.partie.localeCompare(b.partie));
  const gardes: IndexDesFilms["films"] = [];
  const retires: string[] = [];
  let total = 0;
  for (const f of tries) {
    if (recent(f.debut, now) && total + f.octets <= BUDGET_FILMS_OCTETS) {
      gardes.push(f);
      total += f.octets;
    } else retires.push(f.partie);
  }
  return { index: { format: 2, films: gardes, ratees: index.ratees.filter((r) => recent(r.debut, now)), passage: index.passage }, retires };
}

/** Un film de la liste publiée : ce que la page en montre avant de l'ouvrir. */
export const FilmPublie = z.object({
  partie: Partie,
  debut: Debut,
  carte: z.string().min(1).max(80),
  victoire: z.boolean(),
  equipes: z.string().min(1).max(20),
  gaulois: z.number().int().min(0),
  joueurs: z.number().int().min(0),
  /** La durée rejouée, en secondes : les étapes du jeu jusqu'au dernier contrôle. */
  secondes: z.number().int().min(0),
  /** La forme de la carte, largeur sur hauteur : le cadre du replay la prend, pour que la carte le remplisse sans gris. */
  forme: z.number().positive().max(100).nullable().default(null),
  /**
   * Le vrai lecteur du jeu pour cette partie, sur son site à lui (`https://<…>.github.io/jeu/<version>/#replay-viewer=<partie>`),
   * s'il est construit et réglé ; sinon le film seul.
   */
  jeu: z
    .string()
    .regex(/^https:\/\/[a-z0-9-]+\.github\.io\/jeu\/[0-9a-f]{10}\/#replay-viewer=[A-Za-z0-9]{1,32}$/)
    // Jamais l'adresse du clan : la page l'encadre avec ses scripts, qui n'y tournent qu'à part (src/lib/rejeu/lecteur-jeu.ts).
    .refine((a) => !a.startsWith("https://les-gaulois.github.io/"), "le lecteur du jeu ne vit jamais sur l'adresse du clan")
    .nullable()
    .default(null),
  /** Les faits du journal « Entre Gaulois » de la partie, publié dans `<partie>.journal.json` ; `null` : pas relevés (ce n'est pas zéro). */
  faits: z.number().int().min(0).max(FAITS_MAX).nullable().default(null),
  octets: z.number().int().min(1).max(MAX_OCTETS_FILM),
});
export type FilmPublie = z.infer<typeof FilmPublie>;

/**
 * La liste publiée avec les films, la plus récente partie d'abord. `fait` : la fin du dernier passage du robot des films (pas
 * l'heure du build) ; une panne du robot se voit donc à sa date. `null` : inconnue.
 */
export const ListeDesFilms = z.object({ format: z.literal(1), fait: Debut.nullable(), films: z.array(FilmPublie).max(10_000) });
export type ListeDesFilms = z.infer<typeof ListeDesFilms>;
