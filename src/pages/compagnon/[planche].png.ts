import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import { dessinDuCompagnon, rgbaDeLaPlanche } from "../../lib/compagnon/dessin";

/**
 * Les images du Gaulois de départ du compagnon, peintes à la construction du site : ses quatre poses (debout, un pied levé,
 * l'autre, les yeux fermés) et son lit, chacune en une planche PNG, une case par pixel, agrandie sans flou par le CSS. Un
 * visiteur, ou un membre qui n'a pas encore son Gaulois, ne télécharge ainsi ni le dessin du Gaulois ni les poses du
 * village : seulement ces deux petites images, gardées par le navigateur. `src/scripts/compagnon.ts` les demande avec la
 * version du dessin (`?v=`, posée par `GauloisCompagnon.astro`) : un dessin changé les fait recharger.
 */
export const getStaticPaths = (() => [{ params: { planche: "depart-gaulois" } }, { params: { planche: "depart-lit" } }]) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const dessin = dessinDuCompagnon(null);
  const planche = params.planche === "depart-lit" ? dessin.lit : dessin.gaulois;
  const png = await sharp(rgbaDeLaPlanche(planche), { raw: { width: planche.largeur * planche.images.length, height: planche.hauteur, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
