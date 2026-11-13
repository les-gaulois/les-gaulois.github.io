/**
 * La version des fichiers publiés de la carte (`public/generated/carte/`, faits par `scripts/generate-clanmap.ts`).
 *
 * GitHub Pages laisse chaque navigateur garder un fichier dix minutes sous la même adresse. Les scripts du site changent
 * de nom dès que leur contenu change, pas ces fichiers : le 13 novembre 2026, juste après la mise en ligne de la mer bleue, le pilote a
 * vu les vagues du nouveau script sur l'ancien fond sombre. La page ajoute donc cette version à l'adresse de chaque
 * fichier (`?v=…`, `adresseVersionnee` dans `adresse.ts`, que lisent aussi les scripts du navigateur) : elle change dès
 * que l'un d'eux change, et le navigateur va chercher le nouveau. Ce module-ci lit les fichiers : il ne sert qu'au build.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Les fichiers que la page Carte lit, dans cet ordre. */
export const FICHIERS_DE_LA_CARTE = ["film.json", "film.bin.gz", "terrain.webp", "vagues.webp", "etat.bin.gz", "finale-800.webp", "finale-1400.webp"] as const;

/** Douze caractères de l'empreinte des fichiers présents ; `null` s'il n'y en a aucun. */
export function versionDeLaCarte(dossier: string): string | null {
  const empreinte = createHash("sha256");
  let vus = 0;
  for (const nom of FICHIERS_DE_LA_CARTE) {
    const chemin = join(dossier, nom);
    if (!existsSync(chemin)) continue;
    // Le nom aussi : un fichier qui apparaît ou disparaît change la version.
    empreinte.update(nom).update(readFileSync(chemin));
    vus++;
  }
  return vus === 0 ? null : empreinte.digest("hex").slice(0, 12);
}
