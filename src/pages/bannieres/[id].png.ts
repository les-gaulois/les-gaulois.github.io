import type { APIRoute, GetStaticPaths } from "astro";
import { BANNIERES } from "../../../supabase/functions/code-discord/bannieres/index.ts";
import { pngDeLaBanniere } from "../../lib/banniere-image";

/**
 * Les images des bannières du Gaulois, pour le fond des lignes de la liste des membres (src/lib/bannieres-joueurs.ts).
 * Tout le catalogue, pas seulement les bannières portées : la liste des images ne dit rien de qui porte quoi.
 */
export const getStaticPaths = (() => BANNIERES.map(({ id }) => ({ params: { id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const png = await pngDeLaBanniere(params["id"] ?? "");
  if (!png) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
