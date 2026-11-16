/**
 * Les Gaulois des membres sur les pages du site (demande du pilote, 16 novembre 2026) : le Gaulois qu'un membre a créé
 * paraît à côté de son pseudo dans la gazette, les records, la page Membres et les dernières parties de « Revoir une partie ».
 *
 * Même chemin que les images des fiches (`gaulois-joueurs.ts`) : l'étape « Lire les Gaulois des fiches » de la GitHub
 * Action, seule à avoir la clé de service, range les tenues dans `.cache/gaulois-fiches.json` ; la construction les relit
 * ici, une fois. N'y figurent que les membres au pseudo public, validés, qui ont enregistré leur Gaulois : le serveur en
 * décide. Rien n'est du temps réel : la page montre les Gaulois relevés à sa dernière construction. Sans ce fichier
 * (un poste, une panne), aucun Gaulois : les pages s'affichent comme avant.
 *
 * Une image par membre, `/gaulois/<identifiant public>.png` (`src/pages/gaulois/[id].png.ts`) : le Gaulois entier, une
 * case par pixel, rogné à son contour. La page l'agrandit d'un nombre entier, sans lissage, et montre le Gaulois en pied
 * ou son buste, en ne laissant voir que le haut de la même image (`buste`, en pixels de l'image).
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { loadMemberResultsOnce, loadMembers } from "./data";
import { GAULOIS_FICHES_FILE, gauloisDuCache, type GauloisParJoueur } from "./gaulois-joueurs";
import { BUST_CUT, placeSprite, spritePixels, tenueOf, type SpritePlacement } from "./gaulois-sprite";
import { nommesParPartie } from "./serie-en-cours";

let lus: GauloisParJoueur | null = null;

/** Les Gaulois des membres au pseudo public de la liste, relus une fois par construction. */
export function gauloisDuSite(): GauloisParJoueur {
  return (lus ??= gauloisDuCache(
    GAULOIS_FICHES_FILE,
    (loadMembers()?.members ?? []).map((m) => (m.username ? m.publicId : null)),
  ));
}

/** Ce qu'une page sait du Gaulois d'un membre : l'adresse de son image (sans la base du site) et ses mesures, en pixels de l'image. */
export interface PortraitDeGaulois {
  image: string;
  largeur: number;
  hauteur: number;
  /** La hauteur du buste : le haut de l'image, jusque sous les épaules. */
  buste: number;
}

/** Le Gaulois entier d'une tenue, une case par pixel, rogné à son contour. `null` : rien à dessiner. */
const enPied = (gaulois: GauloisParJoueur, id: string | null | undefined): SpritePlacement | null => {
  const tenue = tenueOf(gaulois, id);
  return tenue ? placeSprite(tenue, { axis: 0, bottom: 0, scale: 1 }) : null;
};

/** Le portrait d'un membre, ou `null` s'il n'a pas créé de Gaulois (ou n'a pas de pseudo public). */
export function portraitDuGaulois(id: string | null | undefined, gaulois: GauloisParJoueur = gauloisDuSite()): PortraitDeGaulois | null {
  const place = enPied(gaulois, id);
  if (!place || !id) return null;
  const { width, height, top } = place.crop;
  const buste = BUST_CUT - top;
  // L'adresse change avec la tenue : un Gaulois rhabillé ne reste pas dans le cache du navigateur.
  const version = createHash("sha256")
    .update(
      Object.keys(place.tenue)
        .sort()
        .map((cle) => `${cle}=${place.tenue[cle]}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 8);
  return { image: `/gaulois/${encodeURIComponent(id)}.png?v=${version}`, largeur: width, hauteur: height, buste: buste >= 1 && buste < height ? buste : height };
}

/** L'image d'un membre, en PNG. `null` : pas de Gaulois. */
export async function pngDuGaulois(id: string, gaulois: GauloisParJoueur = gauloisDuSite()): Promise<Buffer | null> {
  const place = enPied(gaulois, id);
  if (!place) return null;
  const { data, width, height } = spritePixels(place);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Un membre nommé d'une partie qui a créé son Gaulois. */
export interface GauloisDePartie {
  id: string;
  username: string;
  portrait: PortraitDeGaulois;
}

let parPartie: ReadonlyMap<string, GauloisDePartie[]> | null = null;

/**
 * Pour chaque partie, les membres au pseudo public qui l'ont jouée sous le tag d'après leur liste officielle
 * (`.cache/member-games/results.json`, celle des podiums) et qui ont créé leur Gaulois, par ordre de pseudo. Une partie
 * absente : personne à montrer, ou des listes pas encore lues.
 */
export function gauloisParPartie(
  results = loadMemberResultsOnce(),
  membres: readonly { publicId: string | null; username: string | null }[] = loadMembers()?.members ?? [],
  gaulois: GauloisParJoueur = gauloisDuSite(),
): ReadonlyMap<string, GauloisDePartie[]> {
  const nommes = new Map(membres.flatMap((m) => (m.username && m.publicId ? [[m.publicId, m.username] as const] : [])));
  const index = new Map<string, GauloisDePartie[]>();
  if (gaulois.size === 0) return index;
  const portraits = new Map<string, PortraitDeGaulois | null>();
  for (const [partie, { gagnants, perdants }] of nommesParPartie(results, nommes)) {
    const presents: GauloisDePartie[] = [];
    for (const id of [...gagnants, ...perdants]) {
      if (!portraits.has(id)) portraits.set(id, portraitDuGaulois(id, gaulois));
      const portrait = portraits.get(id);
      const username = nommes.get(id);
      if (portrait && username) presents.push({ id, username, portrait });
    }
    if (presents.length > 0) index.set(partie, presents.sort((a, b) => a.username.localeCompare(b.username, "fr")));
  }
  return index;
}

/** Le même index, calculé une fois par construction. */
export const gauloisDesParties = (): ReadonlyMap<string, GauloisDePartie[]> => (parPartie ??= gauloisParPartie());
