/**
 * L'image d'une bannière du Gaulois, pour la liste des membres (`src/lib/bannieres-joueurs.ts`) : le dessin de /gaulois,
 * cadre compris, case pour case, en PNG de 124 × 80 points. La page l'agrandit sans le lisser. Publiée sous
 * `/bannieres/<id>.png` par `src/pages/bannieres/[id].png.ts`.
 */
import sharp from "sharp";
import { dessinDeLaBanniere } from "../../supabase/functions/code-discord/bannieres/index.ts";
import { HAUTEUR, LARGEUR } from "../../supabase/functions/code-discord/decors/commun.ts";

/** Les trois octets d'une couleur écrite `#rgb` ou `#rrggbb`. Lève une erreur pour toute autre écriture : un dessin faux ne se publie pas. */
export function octetsDeLaCouleur(couleur: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(couleur)?.[1];
  if (!hex) throw new Error(`couleur illisible dans une bannière : ${couleur.slice(0, 20)}`);
  const long = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [parseInt(long.slice(0, 2), 16), parseInt(long.slice(2, 4), 16), parseInt(long.slice(4, 6), 16)];
}

/** Le PNG d'une bannière, ou `null` pour un identifiant que le catalogue ne connaît pas. */
export async function pngDeLaBanniere(id: string): Promise<Buffer | null> {
  const dessin = dessinDeLaBanniere(id);
  if (!dessin) return null;
  const points = Buffer.alloc(LARGEUR * HAUTEUR * 3);
  dessin.cases.forEach((couleur, i) => points.set(octetsDeLaCouleur(couleur), i * 3));
  return sharp(points, { raw: { width: LARGEUR, height: HAUTEUR, channels: 3 } }).png({ compressionLevel: 9, palette: true }).toBuffer();
}
