/**
 * Écrit `supabase/functions/code-discord/logo-du-clan.ts` : le badge du clan (`public/brand/badge.png`) réduit à 64 × 64
 * pixels, en RVBA, pour l'image de /gaulois sur Discord. La fonction code-discord ne lit que son dossier : le logo y est
 * écrit en clair (base64). À relancer après tout changement du badge : `npx tsx scripts/logo-du-clan-gaulois.ts`.
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";

export const COTE = 64;

/** Le badge réduit, en RVBA. */
export async function logoReduit(): Promise<Buffer> {
  return sharp("public/brand/badge.png").resize(COTE, COTE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" }).ensureAlpha().raw().toBuffer();
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/logo-du-clan-gaulois.ts")) {
  const rgba = await logoReduit();
  const texte = `/**
 * Le badge du clan [GAL] (public/brand/badge.png), réduit à ${COTE} × ${COTE} pixels en RVBA, pour l'image de /gaulois.
 * Écrit par scripts/logo-du-clan-gaulois.ts : ne pas modifier à la main.
 */
export const LOGO_DU_CLAN = {
  cote: ${COTE},
  rgba: "${rgba.toString("base64")}",
} as const;
`;
  writeFileSync("supabase/functions/code-discord/logo-du-clan.ts", texte);
  console.log(`logo-du-clan.ts : ${COTE} × ${COTE}, ${rgba.length} octets`);
}
