import type { APIRoute, GetStaticPaths } from "astro";
import sharp from "sharp";
import { DISCORD_EMOJIS, emojiSvg, type DiscordEmoji } from "../../../lib/emojis-discord";

/**
 * Les émojis du robot sur Discord, en PNG de 128 pixels (src/lib/emojis-discord.ts) : la fonction `code-discord` les lit
 * ici, par leur adresse dans /commandes.json, et les dépose chez Discord la première fois qu'elle en a besoin.
 */
export const getStaticPaths = (() => DISCORD_EMOJIS.map((emoji) => ({ params: { nom: emoji.name }, props: { emoji } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { emoji } = props as { emoji: DiscordEmoji };
  const png = await sharp(Buffer.from(emojiSvg(emoji.icone))).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
