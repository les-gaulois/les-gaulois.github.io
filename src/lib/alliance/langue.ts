/**
 * La langue de la fenêtre « Alliance » de la carte : français ou anglais, rien d'autre (choix du pilote, 13 novembre 2026,
 * pour les joueurs des clans alliés venus d'autres pays). Le reste du site reste en français.
 *
 * Le choix est gardé dans ce navigateur seulement. Sans choix gardé, un joueur qui arrive par un lien d'invitation, ou un
 * allié déjà entré, lit la langue de son navigateur (le français s'il est en français, l'anglais sinon) ; un Gaulois lit
 * le français.
 */
export type Langue = "fr" | "en";

export const LANGUE_KEY = "gal-alliance-langue";

/** Les deux choix, dans l'ordre du sélecteur. `nom` est écrit dans sa propre langue, pour qui ne lit pas l'autre. */
export const LANGUES: readonly { id: Langue; nom: string }[] = [
  { id: "fr", nom: "Français" },
  { id: "en", nom: "English" },
];

export const langueValable = (v: unknown): v is Langue => v === "fr" || v === "en";

/**
 * La langue d'arrivée. `gardee` : le choix gardé dans ce navigateur ; `navigateur` : ses langues, la préférée d'abord
 * (`navigator.languages`) ; `allie` : un joueur invité ou allié, et non un Gaulois.
 */
export function langueDeDepart(gardee: string | null, navigateur: readonly string[], allie: boolean): Langue {
  if (langueValable(gardee)) return gardee;
  if (!allie) return "fr";
  const premiere = (navigateur[0] ?? "fr").toLowerCase();
  return premiere.startsWith("fr") ? "fr" : "en";
}
