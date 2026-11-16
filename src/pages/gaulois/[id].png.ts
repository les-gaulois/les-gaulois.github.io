import type { APIRoute, GetStaticPaths } from "astro";
import { gauloisDuSite, pngDuGaulois, portraitDuGaulois } from "../../lib/gaulois-site";

/**
 * L'image du Gaulois de chaque membre au pseudo public qui a créé le sien, pour les pages qui le montrent à côté de son
 * pseudo (src/lib/gaulois-site.ts). Sans Gaulois relevé avant la construction, aucune image.
 */
export const getStaticPaths = (() => [...gauloisDuSite().keys()].filter((id) => portraitDuGaulois(id) !== null).map((id) => ({ params: { id } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const png = await pngDuGaulois(params["id"] ?? "");
  if (!png) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
