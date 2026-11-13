/**
 * Les règles de l'onglet « Mot d'accueil » de la Direction : l'état du mot (ce que le QG montre, face à ce qui est écrit
 * dans le champ) et le compteur de caractères. Le serveur garde le dernier mot (`save_welcome`) : il retire les blancs du
 * début et de la fin, refuse plus de 2 000 caractères, et un texte vide efface le mot.
 */

/** Le plus long mot que `save_welcome` accepte. */
export const WELCOME_MAX = 2000;

/** Sous ce reste, le compteur passe au jaune et dit combien de caractères il reste. */
export const WELCOME_NEAR = 100;

/** Les couleurs d'état de la Direction (`DirTon` de `direction-kit.tsx`). */
export type WelcomeTone = "ok" | "warn" | "danger" | "muted";

export interface WelcomeState {
  /** `unread` : le mot enregistré n'a pas pu être lu. */
  kind: "online" | "none" | "changed" | "unread";
  tone: WelcomeTone;
  /** Le mot de la pastille. */
  label: string;
}

/** Le texte tel que le serveur le garde : sans blancs au début ni à la fin. */
export const welcomeText = (text: string | null): string => (text ?? "").trim();

/**
 * L'état du mot d'accueil. `saved` : le texte enregistré, `null` s'il n'a pas été lu. `draft` : le champ, `null` tant
 * qu'il n'est pas rempli. Un brouillon qui ne diffère du mot enregistré que par des blancs autour n'est pas « modifié ».
 */
export function welcomeState(saved: string | null, draft: string | null): WelcomeState {
  if (saved === null) return { kind: "unread", tone: "danger", label: "Pas lu" };
  if (draft !== null && welcomeText(draft) !== welcomeText(saved)) return { kind: "changed", tone: "warn", label: "Modifié, pas enregistré" };
  return welcomeText(saved) === "" ? { kind: "none", tone: "muted", label: "Pas de mot" } : { kind: "online", tone: "ok", label: "En ligne" };
}

export interface WelcomeCount {
  used: number;
  left: number;
  /** Vrai quand il reste `WELCOME_NEAR` caractères ou moins. */
  near: boolean;
}

/** Le compteur du champ : la longueur que le champ lui-même limite (`maxLength`), blancs compris. */
export function welcomeCount(draft: string): WelcomeCount {
  const used = draft.length;
  const left = Math.max(0, WELCOME_MAX - used);
  return { used, left, near: left <= WELCOME_NEAR };
}

/** Au-delà, l'aperçu de la Direction se lit dans un cadre qui défile : l'onglet tient dans un écran. Le QG, lui, montre tout. */
export const WELCOME_TALL_CHARS = 600;
export const WELCOME_TALL_LINES = 10;

/** Vrai pour un mot long, ou de beaucoup de lignes : son aperçu défile dans son cadre. */
export function welcomeIsTall(text: string): boolean {
  return text.length > WELCOME_TALL_CHARS || text.split("\n").length > WELCOME_TALL_LINES;
}
