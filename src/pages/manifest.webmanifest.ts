/**
 * Le fichier d'installation du site : sur téléphone ou ordinateur, « Ajouter à l'écran d'accueil » en fait une icône
 * qui ouvre le site en plein écran. Rien n'est stocké ni suivi : c'est une description, pas une application.
 */
import type { APIRoute } from "astro";
import { clan } from "../../config/clan";

export const GET: APIRoute = () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const manifest = {
    name: `[${clan.tag}] ${clan.name}`,
    short_name: clan.tag,
    description: clan.tagline,
    lang: "fr",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#0A1230",
    theme_color: "#0A1230",
    icons: [
      { src: `${base}/generated/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/generated/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } });
};
