/**
 * Les sessions récentes du clan, lues une seule fois par passage du workflow `.github/workflows/victoires.yml`. L'étape des
 * victoires (`scripts/envoyer-victoires.ts`) les lit sur l'API publique d'OpenFront (`readRecentSessions`), puis les garde dans
 * `SESSIONS_DU_PASSAGE` pour l'étape des statères (`scripts/crediter-stateres.ts`), qui tourne juste après dans le même job et
 * relisait jusqu'ici les mêmes sessions : une lecture de l'API en moins toutes les 5 minutes.
 *
 * - Le fichier est sous `.cache/`, que Git ignore. Le cache du workflow ne garde que `.cache/victoires-envoi.json` : sur
 *   l'Action, il ne passe jamais d'un passage à l'autre.
 * - Il ne contient que l'heure de la lecture et les sessions telles que `readRecentSessions` les rend (`StoredSession` :
 *   partie, début, points, joueurs du clan, joueurs de la partie, issue, nombre d'équipes, format), la forme de `data/sessions/`,
 *   déjà publique : aucun identifiant de joueur.
 * - Il est écrit après l'envoi des messages, jamais avant, et une erreur d'écriture est seulement notée : il ne retarde ni ne
 *   fait échouer l'envoi d'une image.
 * - L'étape des statères ne s'en sert que s'il se lit, a la forme attendue, n'est pas daté du futur et date d'au plus
 *   `VALIDITE_MS`. Sinon (absent, vide, abîmé, trop vieux), elle relit l'API comme avant : jamais de panne à cause de lui.
 */
import { z } from "zod";
import { StoredSession } from "./schemas";

/** Le fichier, hors de Git. */
export const SESSIONS_DU_PASSAGE = ".cache/sessions-du-passage.json";

/**
 * L'âge au-delà duquel le fichier ne sert pas. Dans un même passage, entre la lecture et l'étape des statères, il y a au plus
 * environ 7 min 40 s : l'étape des victoires a 6 minutes (son `timeout-minutes`) et le fichier n'est écrit qu'à sa fin, puis
 * l'enregistrement sur main prend au plus environ 1 min 30 avec ses cinq essais. Plus vieux, il ne vient pas de ce passage.
 */
export const VALIDITE_MS = 8 * 60_000;

export const SessionsDuPassage = z.strictObject({
  /** L'heure de la lecture : la fin de la fenêtre lue sur l'API. */
  lecture: z.iso.datetime(),
  sessions: z.array(StoredSession),
});
export type SessionsDuPassage = z.infer<typeof SessionsDuPassage>;

/**
 * Le texte du fichier : l'heure de la lecture et les sessions, rien d'autre. Chaque session repasse par `StoredSession`, qui ne
 * garde que ses propres champs : un champ de trop ne s'écrit pas.
 */
export function texteDuPassage(sessions: readonly StoredSession[], lecture: Date): string {
  const contenu: SessionsDuPassage = { lecture: lecture.toISOString(), sessions: z.array(StoredSession).parse(sessions) };
  return `${JSON.stringify(contenu)}\n`;
}

const enSecondes = (ms: number) => Math.round(ms / 1000);

/** Les sessions du fichier, si elles viennent de ce passage. Sinon `null` ; la note dit pourquoi, pour le journal. */
export function lireSessionsDuPassage(texte: string | null, now: Date): { sessions: StoredSession[] | null; note: string } {
  if (texte === null) return { sessions: null, note: "pas de sessions gardées à ce passage" };
  let contenu: SessionsDuPassage;
  try {
    const lu = SessionsDuPassage.safeParse(JSON.parse(texte));
    if (!lu.success) return { sessions: null, note: "sessions gardées illisibles" };
    contenu = lu.data;
  } catch {
    return { sessions: null, note: "sessions gardées illisibles" };
  }
  const age = now.getTime() - Date.parse(contenu.lecture);
  if (!Number.isFinite(age)) return { sessions: null, note: "sessions gardées illisibles" };
  if (age < 0) return { sessions: null, note: "sessions gardées datées du futur" };
  if (age > VALIDITE_MS) return { sessions: null, note: `sessions gardées trop vieilles (lues il y a ${enSecondes(age)} s)` };
  return { sessions: contenu.sessions, note: `sessions des dernières heures reprises de ce passage (lues il y a ${enSecondes(age)} s)` };
}

export interface SessionsFraichesDeps {
  /** Lit le fichier. `null` : il n'existe pas. Une erreur levée vaut un fichier illisible. */
  lire: () => string | null;
  now: Date;
  /** La lecture de l'API, comme avant le fichier : `readRecentSessions`. */
  lireApi: () => Promise<StoredSession[]>;
  log: (line: string) => void;
}

/**
 * Les sessions des dernières heures pour l'étape des statères : celles du fichier si elles viennent de ce passage, sinon une
 * seule lecture de l'API, comme avant. `null` : l'API ne les donne pas ; l'erreur est notée telle quelle, et rien n'est relu.
 */
export async function sessionsFraichesDesStateres({ lire, now, lireApi, log }: SessionsFraichesDeps): Promise<StoredSession[] | null> {
  let gardees: { sessions: StoredSession[] | null; note: string };
  try {
    gardees = lireSessionsDuPassage(lire(), now);
  } catch {
    gardees = { sessions: null, note: "sessions gardées illisibles" };
  }
  if (gardees.sessions) {
    log(`Statères : ${gardees.note}, sans nouvelle lecture de l'API.`);
    return gardees.sessions;
  }
  log(`Statères : ${gardees.note}, les sessions des dernières heures sont lues sur l'API.`);
  try {
    return await lireApi();
  } catch (e) {
    log(`Statères : sessions des dernières heures illisibles (${e instanceof Error ? e.message : String(e)}).`);
    return null;
  }
}

export interface GarderDeps {
  /** Écrit le texte dans `SESSIONS_DU_PASSAGE`. */
  ecrire: (texte: string) => void;
  sessions: readonly StoredSession[];
  lecture: Date;
  log: (line: string) => void;
}

/** Garde les sessions pour l'étape des statères. Une erreur est notée, jamais levée : `false`, et l'étape relira l'API. */
export function garderSessionsDuPassage({ ecrire, sessions, lecture, log }: GarderDeps): boolean {
  try {
    ecrire(texteDuPassage(sessions, lecture));
    return true;
  } catch (e) {
    log(`Victoires : sessions des dernières heures non gardées pour l'étape des statères (${e instanceof Error ? e.message : String(e)}), elle relira l'API.`);
    return false;
  }
}
