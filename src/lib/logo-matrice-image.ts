/**
 * Lit le logo du guerrier (`public/brand/tete.*`, nom réglé dans `config/clan.ts` ; envoyé par le pilote le 11 novembre
 * 2026) au moment de la construction du site, et le réduit à une grille de `colonnes` × `colonnes` cases pour
 * `logoMatrice`. Sans ce fichier, `null` : la Direction et le QG n'ont pas de logo Matrix, et le site se construit quand même.
 * Côté Node seulement : à n'importer que dans le haut d'une page .astro.
 */
import { join } from "node:path";
import sharp from "sharp";
import { brandFile } from "./brand";
import { logoMatrice, type LogoMatriceData } from "./logo-matrice";

export async function logoMatriceDepuisImage(colonnes: number): Promise<LogoMatriceData | null> {
  const fichier = brandFile("tete");
  if (!fichier) return null;
  const { data, info } = await sharp(join(process.cwd(), "public", fichier)).resize(colonnes, colonnes, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return logoMatrice(data, info.width, info.height, info.channels);
}
