import { feuilleDuKit } from "../../lib/jeu/kit-css";

/**
 * Les images du kit en pixels de « Mon Gaulois » (`src/lib/jeu/kit-css.ts`) : pièces, icônes, insignes et logo, en variables
 * CSS. Base.astro la lie aux pages en cadre de jeu, avec sa version dans l'adresse.
 */
export async function GET() {
  const { css } = await feuilleDuKit();
  return new Response(css, { headers: { "Content-Type": "text/css; charset=utf-8" } });
}
