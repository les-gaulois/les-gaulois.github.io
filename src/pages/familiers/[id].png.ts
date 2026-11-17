import type { APIRoute, GetStaticPaths } from "astro";
import { FAMILIERS } from "../../../supabase/functions/code-discord/familiers/index.ts";
import { pngDuFamilier } from "../../lib/carte-familier";

/**
 * Les images des familiers, pour la carte des membres (src/lib/carte-familier.ts). Tout le catalogue, pas seulement les
 * familiers montrés : la liste des images ne dit rien de qui a quoi.
 */
export const getStaticPaths = (() => FAMILIERS.map(({ id }) => ({ params: { id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const png = await pngDuFamilier(params["id"] ?? "");
  if (!png) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
