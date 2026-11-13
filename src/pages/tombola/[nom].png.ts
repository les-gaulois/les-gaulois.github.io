import type { APIRoute, GetStaticPaths } from "astro";
import { TOMBOLA_IMAGES, renderTombolaImage, type TombolaImage } from "../../lib/tombola-image";

/**
 * Les images de la tombola des concours sur Discord (src/lib/tombola-image.ts) : la bannière du message du concours, et les
 * fonds des billets, où la fonction code-discord pose chaque numéro.
 */
export const getStaticPaths = (() => TOMBOLA_IMAGES.map((nom) => ({ params: { nom } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const png = await renderTombolaImage(params["nom"] as TombolaImage);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
