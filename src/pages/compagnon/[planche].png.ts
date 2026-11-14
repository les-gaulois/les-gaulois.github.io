import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import { dessinDuCompagnon, rgbaDeLaPlanche, type Planche } from "../../lib/compagnon/dessin";
import { dessinDeLaPrison } from "../../lib/compagnon/prison";

/**
 * Les images du compagnon peintes à la construction du site : les quatre poses du Gaulois de départ (debout, un pied levé,
 * l'autre, les yeux fermés), son lit, et la petite prison où il attend, rangé (son fond et son devant, dessin de Claude
 * Fable 5.2), chacune en une planche PNG, une case par pixel, agrandie sans flou par le CSS. Un visiteur, ou un membre qui
 * n'a pas encore son Gaulois, ne télécharge ainsi ni le dessin du Gaulois ni les poses du village : seulement ces petites
 * images, gardées par le navigateur. `GauloisCompagnon.astro` les demande avec la version du dessin (`?v=`) : un dessin
 * changé les fait recharger.
 */
export const getStaticPaths = (() => [{ params: { planche: "depart-gaulois" } }, { params: { planche: "depart-lit" } }, { params: { planche: "prison" } }]) satisfies GetStaticPaths;

function laPlanche(nom: string | undefined): Planche {
  if (nom === "prison") return dessinDeLaPrison();
  const dessin = dessinDuCompagnon(null);
  return nom === "depart-lit" ? dessin.lit : dessin.gaulois;
}

export const GET: APIRoute = async ({ params }) => {
  const planche = laPlanche(params.planche);
  const png = await sharp(rgbaDeLaPlanche(planche), { raw: { width: planche.largeur * planche.images.length, height: planche.hauteur, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
