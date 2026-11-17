/**
 * Les cartes des membres en GIF, pour la commande /macarte de Discord (demande du pilote, 17 novembre 2026 : « Oui,
 * /macarte », après l'essai d'un GIF de la carte du champion). Le robot n'a pas de navigateur : c'est le site qui filme,
 * après chaque construction, la carte de la fiche de chaque membre qui a un Gaulois (`scripts/filmer-cartes.ts`), et qui
 * publie les GIF sous `/cartes/<identifiant public>.gif` avec leur liste, `/cartes/index.json`, que le robot relit
 * (`supabase/functions/code-discord/macarte.ts`).
 *
 * Ici, ce qui se calcule sans navigateur : la durée de la boucle de chaque finition, la version d'une carte (elle change
 * dès que la carte change, et Discord ne montre pas le GIF qu'il a gardé), le choix des cartes à filmer dans le temps
 * laissé, et la forme de la liste publiée. Le GIF ne porte que le pseudo : aucun chiffre, qui n'y serait pas daté.
 */
import { createHash } from "node:crypto";

/** Le dossier des GIF dans le site publié, et dans le cache du workflow (`.cache/cartes-gif`, hors de Git). */
export const DOSSIER_DES_CARTES = "cartes";
export const CACHE_DES_CARTES = ".cache/cartes-gif";
export const INDEX_DES_CARTES = "index.json";

/**
 * La version du film : à monter d'un cran quand le dessin des cartes change (feuille de style, finitions, cadrage), pour
 * que toutes les cartes soient filmées de nouveau. Les changements d'une seule carte, eux, se voient dans sa version.
 */
export const VERSION_DU_FILM = 1;

/**
 * Douze images et demie par seconde, ou onze quand la boucle ne se divise pas en pas de 80 millisecondes (neuf secondes) :
 * un GIF compte en centièmes de seconde, et la boucle doit durer un nombre entier d'images.
 */
export const PAS_DU_FILM_MS = 80;
const PAS_LONG_MS = 90;

/** La boucle d'une carte sans finition à durée propre, en millisecondes. */
export const BOUCLE_ORDINAIRE_MS = 6000;
/**
 * Les finitions dont le dessin recommence à heure fixe (`src/lib/fx/finitions-carte.ts`) : la boucle du GIF dure un nombre
 * entier de leurs tours, et ne se voit pas. Les autres tombent sans fin : leur boucle est coupée à six secondes.
 */
const BOUCLES_MS: Readonly<Record<string, number>> = {
  "champignon-atomique": 9000,
  piratage: 9000,
  explosion: 8000,
  supernova: 6000,
};
export const dureeDeLaBoucle = (finition: string | null | undefined): number => (finition && BOUCLES_MS[finition]) || BOUCLE_ORDINAIRE_MS;
export const pasDuFilm = (finition: string | null | undefined): number => (dureeDeLaBoucle(finition) % PAS_DU_FILM_MS === 0 ? PAS_DU_FILM_MS : PAS_LONG_MS);
export const imagesDeLaBoucle = (finition: string | null | undefined): number => dureeDeLaBoucle(finition) / pasDuFilm(finition);

/** La version d'une carte : douze signes tirés de ce qui la dessine (sa description et ses images), et de la version du film. */
export function versionDeLaCarte(html: string, images: readonly Uint8Array[]): string {
  const empreinte = createHash("sha256").update(`film ${VERSION_DU_FILM}\n`).update(html);
  for (const image of images) empreinte.update("\n").update(image);
  return empreinte.digest("hex").slice(0, 12);
}

/** Une carte publiée : l'identifiant public du membre et la version de son GIF. */
export interface CarteGif {
  id: string;
  v: string;
}
export interface IndexDesCartes {
  cartes: CarteGif[];
}

const ID = /^[A-Za-z0-9]{1,32}$/;
const VERSION = /^[0-9a-f]{12}$/;

/** La liste gardée ou publiée, relue sans confiance : une entrée mal formée est écartée, un fichier illisible vaut une liste vide. */
export function lireIndexDesCartes(texte: string | null): IndexDesCartes {
  try {
    const cartes: unknown = texte === null ? null : (JSON.parse(texte) as { cartes?: unknown }).cartes;
    if (!Array.isArray(cartes)) return { cartes: [] };
    return {
      cartes: cartes.flatMap((c: unknown): CarteGif[] => {
        const { id, v } = (c ?? {}) as { id?: unknown; v?: unknown };
        return typeof id === "string" && ID.test(id) && typeof v === "string" && VERSION.test(v) ? [{ id, v }] : [];
      }),
    };
  } catch {
    return { cartes: [] };
  }
}

/**
 * Les cartes à filmer à ce passage : celles dont le GIF manque ou n'est plus à jour, dans l'ordre donné, tant qu'il reste
 * du temps. Un film dure à peu près le même temps pour toutes : on en compte `parPassage` au plus, le reste attend la
 * construction suivante, une heure après au plus tard.
 */
export function cartesAFilmer(voulues: readonly CarteGif[], gardees: readonly CarteGif[], parPassage: number): CarteGif[] {
  const faites = new Map(gardees.map((c) => [c.id, c.v]));
  return voulues.filter((c) => faites.get(c.id) !== c.v).slice(0, Math.max(0, parPassage));
}

/** L'adresse du GIF d'une carte depuis la racine du site, avec sa version. */
export const adresseDeLaCarte = (carte: CarteGif): string => `/${DOSSIER_DES_CARTES}/${carte.id}.gif?v=${carte.v}`;
