import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import { VIGNETTE_ICONES, vignetteSvg } from "../../../lib/emojis-discord";
import type { IconePartieNom } from "../../../lib/icones-parties";

/**
 * Les vignettes des rôles et des demandes de ticket (src/lib/emojis-discord.ts) : la fonction `code-discord` les pose à côté
 * de la réponse à un clic sur le panneau des rôles et du message d'accueil d'un ticket, par leur adresse dans /commandes.json.
 */
export const getStaticPaths = (() => VIGNETTE_ICONES.map((icone) => ({ params: { nom: icone }, props: { icone } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { icone } = props as { icone: IconePartieNom };
  const png = await sharp(Buffer.from(vignetteSvg(icone))).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
