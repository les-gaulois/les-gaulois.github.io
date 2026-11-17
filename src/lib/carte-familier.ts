/**
 * Le familier d'un membre sur sa carte (17 novembre 2026, à la demande du pilote : « faut qu'on puisse ajouter le familier
 * s'ils en ont ») : posé en bas à droite de la carte, devant le Gaulois, les pattes à la hauteur des siennes ; un familier
 * qui vole garde sa hauteur. Il tient dans seize cases de large et vingt-deux de haut, jamais plus grand que le Gaulois.
 * Son image est publiée sous `/familiers/<identifiant>.png` (`src/pages/familiers/[id].png.ts`), une case par pixel.
 */
import sharp from "sharp";
import { familierAPoser } from "../../supabase/functions/code-discord/familiers/familier.ts";
import { familierDe } from "../../supabase/functions/code-discord/familiers/index.ts";
import { octetsDeLaCouleur } from "./banniere-image";
import { poseSurLaCarte } from "./carte-familier-pose";

/** Ce qu'une carte sait du familier : son image, ses mesures en pixels, sa taille et sa hauteur au-dessus du sol, en cases. */
export interface FamilierDeCarte {
  id: string;
  nom: string;
  /** L'adresse de son image, sans la base du site. */
  image: string;
  largeur: number;
  hauteur: number;
  /** Cases de la carte par pixel de son image. */
  echelle: number;
  /** Ses pattes au-dessus du sol, en pixels de son image : zéro pour un familier posé. */
  lever: number;
}

export { poseSurLaCarte };

/** Le familier de cet identifiant, prêt pour une carte ; `null` : inconnu du dessin, ou sans dessin. */
export function familierDeCarte(id: string | null | undefined): FamilierDeCarte | null {
  const familier = id ? familierDe(id) : null;
  const pose = familier ? familierAPoser(familier) : null;
  if (!familier || !pose) return null;
  return { id: familier.id, nom: familier.nom, image: `/familiers/${encodeURIComponent(familier.id)}.png`, largeur: pose.largeur, hauteur: pose.hauteur, ...poseSurLaCarte(pose) };
}

/** L'image d'un familier, rogné à son cadre, en PNG ; `null` pour un identifiant inconnu. */
export async function pngDuFamilier(id: string): Promise<Buffer | null> {
  const familier = familierDe(id);
  const pose = familier ? familierAPoser(familier) : null;
  if (!pose) return null;
  const points = Buffer.alloc(pose.largeur * pose.hauteur * 4);
  pose.cases.forEach((couleur, i) => {
    if (!couleur) return;
    points.set(octetsDeLaCouleur(couleur), i * 4);
    points[i * 4 + 3] = 255;
  });
  return sharp(points, { raw: { width: pose.largeur, height: pose.hauteur, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
