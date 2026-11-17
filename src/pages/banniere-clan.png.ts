import type { APIRoute } from "astro";
import sharp from "sharp";
import { HAUTEUR_DE_LA_BANDE, LARGEUR_DE_LA_BANDE, casesDeLaBanniereDuClan } from "../lib/banniere-clan";
import { octetsDeLaCouleur } from "../lib/banniere-image";

/** L'image de la bannière du clan, case pour case : le fond de la ligne [GAL] du classement (src/lib/banniere-clan.ts). */
export const GET: APIRoute = async () => {
  const points = Buffer.alloc(LARGEUR_DE_LA_BANDE * HAUTEUR_DE_LA_BANDE * 3);
  casesDeLaBanniereDuClan().forEach((couleur, i) => points.set(octetsDeLaCouleur(couleur), i * 3));
  const png = await sharp(points, { raw: { width: LARGEUR_DE_LA_BANDE, height: HAUTEUR_DE_LA_BANDE, channels: 3 } }).png({ compressionLevel: 9, palette: true }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
