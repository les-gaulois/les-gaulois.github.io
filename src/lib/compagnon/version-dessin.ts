// L'empreinte du dessin du Gaulois de départ, calculée à la construction du site seulement : elle change dès que change le
// dessin du Gaulois (son catalogue, garde-robe comprise), les poses du village, le dessin du compagnon ou sa prison. Les
// images peintes à la construction (`src/pages/compagnon/[planche].png.ts`) se demandent à l'adresse `?v=<empreinte>` :
// le compagnon (`GauloisCompagnon.astro`) et la porte du village de l'accueil (`AccueilVillage.astro`) lisent la même,
// pour que le navigateur ne télécharge l'image qu'une fois et ne garde jamais un ancien dessin.
// Rien de ces fichiers n'est écrit dans la page : seuls leurs textes sont lus, pour l'empreinte.
import { createHash } from "node:crypto";

const sources = import.meta.glob<string>(
  [
    "../../../supabase/functions/code-discord/gaulois.ts",
    "../../../supabase/functions/code-discord/billets.ts",
    "../../../supabase/functions/code-discord/garde-robe/**/*.ts",
    "../village/{poses,decor,lumiere}.ts",
    "./{dessin,prison}.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

// Un fichier déplacé rendrait l'empreinte aveugle à ses changements : la construction s'arrête plutôt.
for (const attendu of ["/gaulois.ts", "/poses.ts", "/dessin.ts", "/prison.ts"]) {
  if (!Object.keys(sources).some((chemin) => chemin.endsWith(attendu))) throw new Error(`version-dessin.ts : ${attendu} introuvable pour l'empreinte du dessin`);
}

const empreinte = createHash("sha256");
for (const chemin of Object.keys(sources).sort()) empreinte.update(`${chemin}\u0000${sources[chemin]}\u0000`);

/** Douze caractères hexadécimaux : la version des images du compagnon. */
export const VERSION_DESSIN = empreinte.digest("hex").slice(0, 12);
