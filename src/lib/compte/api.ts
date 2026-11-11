/**
 * Le seul point de contact entre le navigateur et le serveur de connexion (Supabase).
 * Le code de Supabase n'est chargé que pour un visiteur qui a une session ou qui ouvre une page de compte.
 * Rien de ce qui s'affiche ici ne protège quoi que ce soit : chaque fonction du serveur
 * revérifie l'appelant. Masquer un bouton n'est qu'une politesse.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "./errors";
import { setPlayerView } from "./vue-joueur";

export const SUPABASE_URL = (import.meta.env.PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
export const SUPABASE_KEY = import.meta.env.PUBLIC_SUPABASE_KEY ?? "";
/** Sans ces deux réglages, le site reste entièrement statique et la connexion n'apparaît pas. */
export const AUTH_ENABLED = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

/** Là où la session est gardée dans le navigateur. Ce nom date de l'ancien jeu : le changer déconnecterait tout le monde. */
export const SESSION_KEY = "gal-conquete-session";

export const basePath = (): string => import.meta.env.BASE_URL.replace(/\/$/, "");

/** Le brouillon des messages Discord de la Direction, gardé dans ce navigateur : effacé à la déconnexion. */
export const MESSAGE_DRAFT_KEY = "gal-direction-message";

function forgetDrafts(): void {
  try {
    localStorage.removeItem(MESSAGE_DRAFT_KEY);
  } catch {
    // Stockage refusé : il n'y a rien à effacer.
  }
}

/** Une session est peut-être ouverte ici. Sinon, inutile de télécharger Supabase : il n'y a personne à reconnaître. */
export function mayHaveSession(): boolean {
  try {
    // Au retour de Discord, la session n'est pas encore enregistrée : seul le code de l'adresse l'annonce.
    return localStorage.getItem(SESSION_KEY) !== null || new URLSearchParams(location.search).has("code");
  } catch {
    return false;
  }
}

export class ServerError extends Error {
  constructor(readonly code: string) {
    super(errorMessage(code));
  }
}

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) => {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: SESSION_KEY },
    });
    // Session fermée ou perdue (jeton révoqué, déconnexion ailleurs) : la vue joueur n'a plus de compte à montrer.
    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setPlayerView(false);
        forgetDrafts();
      }
    });
    return sb;
  });
  return client;
}

/** Appelle une fonction du serveur. Lève une ServerError au message en français si elle refuse. */
export async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  let response: Awaited<ReturnType<SupabaseClient["rpc"]>>;
  try {
    response = await sb.rpc(fn, args);
  } catch {
    throw new ServerError("network");
  }
  const { data, error } = response;
  if (error) throw new ServerError(error.code === "42501" ? "not_signed_in" : "network");
  const result = data as ({ ok?: boolean; error?: string } & T) | null;
  if (result?.ok === false) throw new ServerError(result.error ?? "network");
  return result as T;
}

/** L'espace public des images des messages Discord (migration `20261111000600_messages_discord.sql`). */
const DISCORD_IMAGES = "discord-images";

/** Le refus du stockage, ramené à un code de `errors.ts`. */
export function uploadErrorCode(error: { status?: number | undefined; statusCode?: string | undefined; message?: string }): string {
  const status = error.status ?? Number(error.statusCode);
  const message = error.message ?? "";
  if (status === 401) return "not_signed_in";
  if (status === 413 || /maximum allowed size|too large/i.test(message)) return "image_too_large";
  if (status === 415 || /mime type/i.test(message)) return "invalid_image";
  if (status === 403 || /row-level security|unauthorized/i.test(message)) return "forbidden";
  return "image_upload_failed";
}

/**
 * Dépose une image d'un message Discord et rend son adresse publique : Discord ne lit une image d'embed qu'à une adresse.
 * Le seul envoi de fichier du site. Le serveur décide, comme pour les fonctions : la règle d'accès du stockage ne laisse
 * déposer que les admins et le fondateur, sous un nom tiré au sort, et l'espace refuse ce qui n'est pas une image PNG,
 * JPEG, GIF ou WebP de 8 Mo au plus.
 */
export async function uploadDiscordImage(file: Blob, extension: string): Promise<string> {
  const sb = await supabase();
  const bucket = sb.storage.from(DISCORD_IMAGES);
  const path = `${crypto.randomUUID()}.${extension}`;
  let result: Awaited<ReturnType<typeof bucket.upload>>;
  try {
    result = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  } catch {
    throw new ServerError("network");
  }
  if (result.error) throw new ServerError(uploadErrorCode(result.error));
  return bucket.getPublicUrl(path).data.publicUrl;
}

export async function getSession(): Promise<Session | null> {
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signInWithDiscord(returnPath: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: `${location.origin}${basePath()}${returnPath}` },
  });
  if (error) throw new ServerError("network");
}

export async function signOut(): Promise<void> {
  // Le prochain compte ouvert dans ce navigateur repart de la vue normale, sans le brouillon d'un autre.
  setPlayerView(false);
  forgetDrafts();
  const sb = await supabase();
  await sb.auth.signOut();
}
