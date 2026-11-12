import type { APIRoute, GetStaticPaths } from "astro";
import { commandImagesForBuild, renderCommandImage, type CommandImage } from "../../lib/commandes-discord";
import { guideChapters } from "../../lib/guide-collection";

/**
 * Les images des commandes du robot sur Discord : /records, /carte, une par chapitre du guide, une par clan de la liste
 * officielle (src/lib/commandes-discord.ts). La fonction `code-discord` les montre par leur adresse, lue dans /commandes.json.
 */
export const getStaticPaths = (async () => {
  const { images } = await commandImagesForBuild(await guideChapters());
  return images.map((image) => ({ params: { nom: image.name }, props: { image } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { fonts } = await commandImagesForBuild(await guideChapters());
  const png = await renderCommandImage((props as { image: CommandImage }).image, fonts);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
