/**
 * Les Gaulois du village sur les images du robot, branchés sur les envois et sur la construction (demande du pilote,
 * 14 novembre 2026) : le lien entre la lecture au serveur (`gaulois-joueurs.ts`) et les scripts qui dessinent les images
 * (`scripts/envoyer-*.ts`, `scripts/generate-fiches.ts`, `scripts/generate-accueil-image.ts`).
 *
 * - Une seule lecture au serveur par passage d'un script, et seulement au moment de dessiner une image qui nomme un membre :
 *   un passage sans image, ou une image sans membre nommé, ne demande rien (`gauloisDuPassage`).
 * - Chaque image ne reçoit que les Gaulois des membres qu'elle nomme (`seulement`).
 * - Un Gaulois n'empêche jamais un envoi : une lecture qui échoue ou ne se charge pas donne une carte vide, et un dessin qui
 *   échoue avec des Gaulois est refait sans eux (`avecOuSansGaulois`). Le texte de secours et la description de l'image ne
 *   dépendent jamais des Gaulois.
 * La lecture (supabase-js, le dessin du Gaulois) n'est chargée qu'au moment de lire : un script qui importe ce fichier part
 * même si elle ne se charge pas. Rien de ce qui passe ici n'est écrit : ni identifiant, ni empreinte, ni tenue.
 */
import type { Tenue } from "./gaulois";
import type { GauloisCall, GauloisParJoueur } from "./gaulois-joueurs";
import type { StoredMembers } from "./schemas";

/** Un identifiant public tel que les images le portent : `null` pour un joueur sans fiche, jamais lu. */
type Id = string | null | undefined;

/** Aucun Gaulois. Pour le dessin, la même chose que `AUCUN_GAULOIS`, sans charger la lecture. */
const SANS_GAULOIS: GauloisParJoueur = new Map();

/** Les identifiants d'une image : sans doublon, sans vide ni `null`, dans leur ordre. */
export const nommes = (ids: Iterable<Id>): string[] => [...new Set([...ids].filter((id): id is string => typeof id === "string" && id !== ""))];

/** Les identifiants des membres au pseudo public de la liste, ceux qui ont une fiche : les seuls qu'une image peut nommer. */
export const idsAuPseudoPublic = (list: StoredMembers | null): string[] => nommes((list?.members ?? []).flatMap((m) => (m.username && m.publicId ? [m.publicId] : [])));

/** La carte réduite aux membres nommés par une image. Vide : l'image se dessine comme avant. */
export function seulement(gaulois: GauloisParJoueur, ids: Iterable<Id>): GauloisParJoueur {
  if (gaulois.size === 0) return SANS_GAULOIS;
  const carte = new Map<string, Tenue>();
  for (const id of nommes(ids)) {
    const tenue = gaulois.get(id);
    if (tenue) carte.set(id, tenue);
  }
  return carte.size > 0 ? carte : SANS_GAULOIS;
}

/** Lit les Gaulois de ces identifiants. */
export type LireGaulois = (ids: readonly string[]) => Promise<GauloisParJoueur>;

/**
 * La lecture du robot : `gauloisPourLeRobot`, avec `SUPABASE_URL` et `SUPABASE_SECRET_KEY` de l'environnement de l'Action.
 * Elle écrit sa ligne de journal elle-même, sans identifiant ni clé, et ne lève jamais d'erreur.
 */
export const lectureDuRobot =
  (env: Record<string, string | undefined> = process.env, log: (line: string) => void = console.log, call?: GauloisCall): LireGaulois =>
  async (ids) => {
    const { gauloisPourLeRobot } = await import("./gaulois-joueurs");
    return gauloisPourLeRobot(ids, env, log, call);
  };

export interface PassageDeps {
  /**
   * Tous les membres que les images du passage peuvent nommer, lus d'un coup à la première image : un passage qui poste
   * plusieurs images, comme les victoires, ne lit qu'une fois. Sans : les membres de la première image, pour un script qui
   * n'en poste qu'une par passage.
   */
  tous?: () => Iterable<Id>;
  lire?: LireGaulois;
  log?: (line: string) => void;
}

/**
 * Les Gaulois d'un passage d'un script du robot, image par image. La lecture part à la première image qui nomme un membre,
 * jamais avant, et une seule fois ; chaque image reçoit les seuls Gaulois de ceux qu'elle nomme. Ne lève jamais d'erreur :
 * sans lecture, chaque image se dessine comme avant.
 */
export function gauloisDuPassage({ tous, lire = lectureDuRobot(), log = console.log }: PassageDeps = {}): (ids: Iterable<Id>) => Promise<GauloisParJoueur> {
  let lecture: Promise<GauloisParJoueur> | null = null;
  return async (ids) => {
    const voulus = nommes(ids);
    if (voulus.length === 0) return SANS_GAULOIS;
    lecture ??= (async () => {
      try {
        return await lire(tous ? nommes([...voulus, ...tous()]) : voulus);
      } catch {
        // Le message de l'erreur n'est pas écrit : il pourrait citer un identifiant ou une adresse.
        log("::warning::Gaulois des images : la lecture ne se fait pas, les images partent sans Gaulois.");
        return SANS_GAULOIS;
      }
    })();
    return seulement(await lecture, voulus);
  };
}

/**
 * Dessine avec les Gaulois, et refait le dessin sans eux s'il échoue : un Gaulois ne fait jamais partir un message en texte,
 * ni sauter une fiche. Sans Gaulois, le dessin d'avant, et son erreur s'il échoue.
 */
export async function avecOuSansGaulois<T>(gaulois: GauloisParJoueur, dessiner: (gaulois: GauloisParJoueur) => Promise<T>, log: (line: string) => void = console.log): Promise<T> {
  if (gaulois.size === 0) return dessiner(SANS_GAULOIS);
  try {
    return await dessiner(gaulois);
  } catch {
    log("::warning::Gaulois des images : une image ne se dessine pas avec ses Gaulois, elle est dessinée sans eux.");
    return dessiner(SANS_GAULOIS);
  }
}
