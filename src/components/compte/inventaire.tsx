import { createContext, type ComponentChildren } from "preact";
import { useContext, useRef, useState } from "preact/hooks";
import { call, ServerError, SUPABASE_URL, uploadDiscordImage } from "../../lib/compte/api";
import { imagePathOf, imageUrl, parseInventory, sortImages, type SavedImage } from "../../lib/compte/discord-images";
import { messageOf } from "./common";

/**
 * L'inventaire d'images de l'onglet Discord de la Direction (12 novembre 2026, demande du pilote : « enregistrer des
 * images pour la prochaine fois, afin d'avoir un inventaire »). Partagé par les rubriques : une image gardée dans
 * « Inventaire d'images » se choisit aussitôt dans « Message Discord », et inversement. Lu une seule fois, à la première
 * rubrique qui en a besoin. Chaque fonction du serveur revérifie l'appelant : masquer un bouton ne protège rien.
 */
export interface Inventaire {
  /** `null` : pas encore lu, ou illisible ; `problem` dit alors pourquoi. */
  images: SavedImage[] | null;
  problem: string | null;
  /** Lit l'inventaire, s'il ne l'est pas déjà. */
  ensure: () => void;
  reload: () => Promise<SavedImage[] | null>;
  /**
   * Dépose un fichier dans l'espace des images et rend son nom dans l'espace, à garder ensuite par `keep`. `key` :
   * l'emplacement du fichier dans un champ du message, noté dans `uploads`.
   */
  upload: (file: Blob, extension: string, key?: string) => Promise<string>;
  /**
   * Les fichiers des champs du message déjà déposés (emplacement → adresse publique), partagés avec l'envoi du message :
   * un fichier déposé pour l'un ne repart pas pour l'autre.
   */
  uploads: Map<string, string>;
  /** Garde sous ce nom une image déjà dans l'espace. */
  keep: (path: string, name: string) => Promise<SavedImage>;
  rename: (id: number, name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const InventaireContext = createContext<Inventaire | null>(null);

/** L'inventaire, ou `null` hors de l'onglet Discord : les champs d'image s'en passent alors. */
export const useInventaire = (): Inventaire | null => useContext(InventaireContext);

export function InventaireProvider({ children }: { children: ComponentChildren }) {
  const [images, setImages] = useState<SavedImage[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);
  const uploads = useRef(new Map<string, string>()).current;

  const reload = async (): Promise<SavedImage[] | null> => {
    try {
      const next = parseInventory(await call<unknown>("get_discord_images"), SUPABASE_URL);
      if (next === null) {
        setProblem("La réponse du serveur est illisible.");
        return null;
      }
      setImages(next);
      setProblem(null);
      return next;
    } catch (e) {
      setProblem(messageOf(e));
      return null;
    }
  };

  const keep = async (path: string, name: string): Promise<SavedImage> => {
    const result = await call<{ id?: unknown; name?: unknown }>("save_discord_image", { p_path: path, p_name: name });
    const found = (await reload())?.find((image) => image.path === path);
    if (found) return found;
    // Gardée, mais la relecture a échoué : l'image entre dans la liste d'après la réponse du serveur.
    const kept: SavedImage = {
      id: typeof result.id === "number" ? result.id : -1,
      name: typeof result.name === "string" ? result.name : name,
      path,
      url: imageUrl(SUPABASE_URL, path),
      size: null,
      missing: false,
      savedAt: null,
      savedBy: null,
    };
    setImages((list) => sortImages([...(list ?? []).filter((image) => image.path !== path), kept]));
    return kept;
  };

  const value: Inventaire = {
    images,
    problem,
    ensure: () => {
      if (started.current) return;
      started.current = true;
      void reload();
    },
    reload,
    upload: async (file, extension, key) => {
      const url = await uploadDiscordImage(file, extension);
      const path = imagePathOf(SUPABASE_URL, url);
      if (path === null) throw new ServerError("image_upload_failed");
      if (key !== undefined) uploads.set(key, url);
      return path;
    },
    uploads,
    keep,
    rename: async (id, name) => {
      await call("rename_discord_image", { p_id: id, p_name: name });
      await reload();
    },
    remove: async (id) => {
      await call("remove_discord_image", { p_id: id });
      await reload();
    },
  };
  return <InventaireContext.Provider value={value}>{children}</InventaireContext.Provider>;
}
