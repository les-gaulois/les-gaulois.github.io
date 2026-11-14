/**
 * Les règles de l'onglet « Mot d'accueil » de la Direction : ce que le serveur garde du champ, ce que le QG en montre, l'état
 * du mot (pastille), l'aperçu et le compteur de caractères.
 *
 * Le serveur (`save_welcome`, migration `20261108000200_vie_du_clan.sql`) garde `btrim(p_body)` : il ne retire que les
 * ESPACES du début et de la fin, pas les retours à la ligne ni les tabulations. Il refuse plus de 2 000 caractères, et un
 * texte vide efface le mot. Le QG (`parseQg`, `src/lib/compte/qg.ts`) n'affiche pas un mot fait seulement de blancs, et
 * écrit les autres tels quels, en `white-space: pre-line` (`QgApp.tsx`) : retours à la ligne gardés, blancs répétés réduits
 * à un seul, aucun lien rendu cliquable.
 */
import { fmtInt } from "../format";

/** Le plus long mot que `save_welcome` accepte, et la limite du champ (`maxLength`). */
export const WELCOME_MAX = 2000;

/** À ce reste ou moins, le compteur passe au jaune et dit combien de caractères il reste. */
export const WELCOME_NEAR = 100;

/** Au-delà de ce nombre de caractères, l'aperçu de la Direction se lit dans un cadre qui défile. Le QG, lui, montre tout. */
export const WELCOME_TALL_CHARS = 600;

/** Au-delà de ce nombre de lignes, l'aperçu défile aussi. */
export const WELCOME_TALL_LINES = 10;

/** Les couleurs d'état de la Direction (`DirTon` de `direction-kit.tsx`). */
export type WelcomeTone = "ok" | "warn" | "danger" | "muted";

/** Le texte que `save_welcome` garde du champ : `btrim(coalesce(p_body, ''))`, qui ne retire que l'espace (U+0020). */
export function welcomeStored(text: string | null): string {
  const value = text ?? "";
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === " ") start++;
  while (end > start && value[end - 1] === " ") end--;
  return value.slice(start, end);
}

/** Ce que le QG montre d'un mot enregistré : `null` (rien, pas même la fenêtre) s'il n'a que des blancs, sinon le texte tel quel. */
export function welcomeShown(stored: string | null): string | null {
  return stored !== null && stored.trim() !== "" ? stored : null;
}

export interface WelcomeState {
  /** `unread` : le mot enregistré n'a pas pu être lu. `changed` : enregistrer le champ changerait le mot gardé. */
  kind: "online" | "none" | "changed" | "unread";
  tone: WelcomeTone;
  /** Le mot de la pastille. */
  label: string;
}

/**
 * L'état du mot d'accueil. `saved` : le texte enregistré, tel que `get_welcome` le rend (`null` s'il n'a pas pu être lu,
 * « » sans mot). `draft` : le champ, `null` tant qu'il n'est pas rempli. Le champ est « modifié » quand le serveur en
 * garderait un autre texte : des espaces ajoutés autour ne comptent pas, un retour à la ligne si.
 */
export function welcomeState(saved: string | null, draft: string | null): WelcomeState {
  if (saved === null) return { kind: "unread", tone: "danger", label: "Pas lu" };
  if (draft !== null && welcomeStored(draft) !== saved) return { kind: "changed", tone: "warn", label: "Modifié, pas enregistré" };
  return welcomeShown(saved) === null ? { kind: "none", tone: "muted", label: "Pas de mot" } : { kind: "online", tone: "ok", label: "En ligne" };
}

export interface WelcomePreview {
  /** Le titre de la colonne : le QG d'aujourd'hui, ou celui d'après l'enregistrement. */
  title: string;
  /** Le texte que la fenêtre « motd » du QG montrera, tel quel, ou `null` : le QG n'affiche rien à cette place. */
  body: string | null;
  /** Quand le QG n'affiche rien : la phrase qui le dit. */
  empty: string | null;
  /** Vrai quand la date du mot enregistré vaut pour l'aperçu : le champ est le mot en ligne. */
  dated: boolean;
}

/** L'aperçu du QG : le mot en ligne ou, si le champ diffère (ou si le mot n'a pas été lu), celui que le QG montrera après l'enregistrement. */
export function welcomePreview(saved: string | null, draft: string | null): WelcomePreview {
  const state = welcomeState(saved, draft);
  const pending = state.kind === "changed" || state.kind === "unread";
  const body = welcomeShown(pending ? welcomeStored(draft) : saved);
  let empty: string | null = null;
  if (body === null) {
    if (!pending) empty = "Pas de mot : le QG n'affiche rien à cette place.";
    else if (welcomeShown(saved) === null) empty = "Pas de mot : le QG n'affichera rien à cette place.";
    else empty = "Plus de mot : le QG n'affichera rien à cette place.";
  }
  return { title: pending ? "Au QG, après l'enregistrement" : "Au QG, en ce moment", body, empty, dated: state.kind === "online" };
}

/** Le message de réussite d'un enregistrement : un champ qui ne laisse rien à montrer au QG efface le mot. */
export function welcomeSavedMessage(draft: string): string {
  return welcomeShown(welcomeStored(draft)) === null ? "Mot d'accueil effacé." : "Mot d'accueil enregistré : les membres validés le voient au QG.";
}

export interface WelcomeCount {
  used: number;
  left: number;
  /** Vrai quand il reste `WELCOME_NEAR` caractères ou moins. */
  near: boolean;
}

/**
 * Le compteur du champ : la longueur que le champ lui-même limite (`maxLength`, en unités UTF-16, blancs compris). Le
 * serveur compte en caractères, après avoir retiré les espaces autour : un texte que le champ accepte ne dépasse jamais sa limite.
 */
export function welcomeCount(draft: string): WelcomeCount {
  const used = draft.length;
  const left = Math.max(0, WELCOME_MAX - used);
  return { used, left, near: left <= WELCOME_NEAR };
}

/** Le texte du compteur : « 126 sur 2 000 caractères », « Il reste 1 caractère », « Limite atteinte : 2 000 caractères ». */
export function welcomeCountLabel(count: WelcomeCount): string {
  if (count.left === 0) return `Limite atteinte : ${fmtInt(WELCOME_MAX)} caractères`;
  if (count.near) return `Il reste ${fmtInt(count.left)} caractère${count.left > 1 ? "s" : ""}`;
  return `${fmtInt(count.used)} sur ${fmtInt(WELCOME_MAX)} caractères`;
}

/** Vrai pour un mot long, ou de beaucoup de lignes : son aperçu défile dans son cadre, pour que l'onglet tienne dans un écran. */
export function welcomeIsTall(text: string): boolean {
  return text.length > WELCOME_TALL_CHARS || text.split("\n").length > WELCOME_TALL_LINES;
}
