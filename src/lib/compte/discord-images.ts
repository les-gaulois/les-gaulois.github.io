/**
 * L'inventaire d'images des messages Discord (migration `20261112000200_inventaire_images_discord.sql`) : des images de
 * l'espace public `discord-images`, gardées sous un nom par l'encadrement pour resservir (le logo du clan, une
 * bannière…). Rien n'est inventé ici : la page relit la réponse du serveur, range les images par nom et retrouve
 * celle qu'une adresse montre. Le serveur refait chaque contrôle.
 */
import { errorMessage } from "./errors";

/**
 * Les limites du serveur : 60 caractères par nom, 200 images et 500 Mo en tout (migration
 * `20261112000300_inventaire_200_images.sql`). Les fichiers comptent dans le 1 Go du forfait gratuit de Supabase.
 */
export const IMAGE_NAME_MAX = 60;
export const INVENTORY_MAX = 200;
export const INVENTORY_MAX_BYTES = 500 * 1024 * 1024;

/** L'espace de fichiers des images des messages (migration `20261111000600_messages_discord.sql`). */
export const DISCORD_IMAGES_BUCKET = "discord-images";
/** Le nom d'un fichier de cet espace : tiré au sort au dépôt, la règle d'accès du stockage n'en accepte pas d'autre. */
export const IMAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

/** Une image de l'inventaire. `missing` : son fichier n'est plus dans l'espace ; elle n'est plus proposée. */
export interface SavedImage {
  id: number;
  name: string;
  path: string;
  url: string;
  size: number | null;
  missing: boolean;
  savedAt: string | null;
  savedBy: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** L'adresse publique d'un fichier de l'espace, telle que la donne supabase-js (`getPublicUrl`) : un test le vérifie. */
export const imageUrl = (base: string, path: string): string => encodeURI(`${base.replace(/\/+$/, "")}/storage/v1/object/public/${DISCORD_IMAGES_BUCKET}/${path}`);

/** Le fichier de l'espace qu'une adresse montre, ou `null` : une image d'ailleurs, ou une adresse qui n'est pas celle d'un fichier. */
export function imagePathOf(base: string, url: string): string | null {
  const prefix = imageUrl(base, "");
  const value = url.trim();
  if (!value.startsWith(prefix)) return null;
  const path = value.slice(prefix.length);
  return IMAGE_PATH.test(path) ? path : null;
}

/** Le nom remis en forme comme le fait le serveur : les caractères de contrôle deviennent des espaces, les blancs du bout partent. */
export const cleanImageName = (name: string): string => name.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();

/** La longueur d'un nom comme la compte le serveur : un emoji compte pour un caractère. */
export const nameLength = (name: string): number => Array.from(name).length;

/** Pourquoi ce nom ne convient pas, ou `null`. `except` : l'image qu'on renomme, qui peut garder son nom. */
export function imageNameProblem(name: string, images: readonly SavedImage[], except: number | null = null): string | null {
  const clean = cleanImageName(name);
  if (clean === "" || nameLength(clean) > IMAGE_NAME_MAX) return errorMessage("invalid_image_name");
  const lower = clean.toLowerCase();
  if (images.some((image) => image.id !== except && image.name.toLowerCase() === lower)) return errorMessage("image_name_taken");
  return null;
}

/** Le nom proposé pour un fichier : son nom sans l'extension, remis en forme, coupé à 60 caractères. */
export function suggestedName(fileName: string): string {
  const name = cleanImageName(fileName.replace(/\.[A-Za-z0-9]{1,5}$/, ""));
  return Array.from(name).slice(0, IMAGE_NAME_MAX).join("").trim();
}

/** Les images rangées par nom, dans l'ordre du français (« Image 2 » avant « Image 10 »). */
export const sortImages = (images: SavedImage[]): SavedImage[] => images.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base", numeric: true }) || a.id - b.id);

/** La réponse de `get_discord_images`, relue et rangée par nom. `null` : illisible. */
export function parseInventory(raw: unknown, base: string): SavedImage[] | null {
  if (!isRecord(raw) || raw["ok"] !== true || !Array.isArray(raw["images"])) return null;
  const images: SavedImage[] = [];
  for (const item of raw["images"]) {
    if (!isRecord(item)) continue;
    const { id, name, path, size } = item;
    if (typeof id !== "number" || !Number.isInteger(id) || typeof name !== "string" || name.trim() === "" || typeof path !== "string" || !IMAGE_PATH.test(path)) continue;
    images.push({
      id,
      name,
      path,
      url: imageUrl(base, path),
      size: typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : null,
      missing: item["missing"] === true,
      savedAt: typeof item["saved_at"] === "string" ? item["saved_at"] : null,
      savedBy: typeof item["saved_by"] === "string" && item["saved_by"] !== "" ? item["saved_by"] : null,
    });
  }
  return sortImages(images);
}

/** Le poids de l'inventaire, compté comme le serveur : un poids inconnu compte pour rien. */
export const inventoryWeight = (images: readonly SavedImage[]): number => images.reduce((sum, image) => sum + (image.size ?? 0), 0);

/** Pourquoi l'inventaire ne peut pas prendre un fichier de plus de ce poids (`null` : inconnu), ou `null` s'il le peut. */
export function inventoryRoomProblem(images: readonly SavedImage[], size: number | null): string | null {
  if (images.length >= INVENTORY_MAX) return errorMessage("inventory_full");
  if (size !== null && inventoryWeight(images) + size > INVENTORY_MAX_BYTES) return errorMessage("inventory_too_heavy");
  return null;
}

/** Au-delà de ce nombre d'images, une recherche par nom aide à s'y retrouver ; la rubrique les montre par paquets. */
export const SEARCH_FROM = 12;
export const INVENTORY_PAGE = 12;

/** Un nom comparé sans accents ni majuscules : « Bannière » se trouve en tapant « banniere ». */
export const searchKey = (text: string): string => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Les images dont le nom contient la recherche, dans le même ordre ; toutes si la recherche est vide. */
export function filterImages(images: readonly SavedImage[], query: string): SavedImage[] {
  const key = searchKey(query);
  return key === "" ? [...images] : images.filter((image) => searchKey(image.name).includes(key));
}

/** Les images qu'on peut choisir dans un message : celles dont le fichier est toujours dans l'espace. */
export const usableImages = (images: readonly SavedImage[] | null): SavedImage[] => (images ?? []).filter((image) => !image.missing);

/** L'image de l'inventaire qu'une adresse montre, ou `null`. */
export function savedImageAt(images: readonly SavedImage[] | null, base: string, url: string): SavedImage | null {
  const path = imagePathOf(base, url);
  return path === null ? null : (usableImages(images).find((image) => image.path === path) ?? null);
}
