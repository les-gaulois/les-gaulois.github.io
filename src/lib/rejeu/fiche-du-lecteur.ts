/**
 * Ce que la page « Revoir une partie » sait du vrai lecteur du jeu, sans charger `lecteur-jeu.ts`, qui ne sert qu'à le construire
 * et le publier : la fiche à demander avant de le montrer, et le lien qui le lance d'office.
 */

/** La vitesse de la lecture d'office, dans le cadre de « Revoir une partie » : × 8 (demande du pilote, 16 novembre 2026). */
export const VITESSE_D_OFFICE = 8;

/**
 * Le lien du lecteur qui demande la lecture d'office en × 8 (`?lecture=8`, lu par la page du lecteur, `pageDuLecteur`). La page
 * du clan ne le demande pas à qui veut moins d'animations : bouton pause de son en-tête, ou réglage du système.
 */
export function adresseEnLecture(jeu: string): string {
  return jeu.replace("/#replay-viewer=", "/?lecture=" + VITESSE_D_OFFICE + "#replay-viewer=");
}

/**
 * La fiche que lit le vrai lecteur du jeu pour une partie, d'après son lien (`adresseDuLecteur` de `lecteur-jeu.ts`). La page
 * la demande avant de montrer le lecteur dans son cadre, et montre le film si elle manque (dépôt en panne ou en retard).
 * `null` : lien inattendu, ou sur l'adresse du clan, où le lecteur ne vit jamais.
 */
export function ficheDuLecteur(jeu: string): string | null {
  const m = /^(https:\/\/[a-z0-9-]+\.github\.io)\/jeu\/[0-9a-f]{10}\/#replay-viewer=([A-Za-z0-9]{1,32})$/.exec(jeu);
  if (!m || m[1] === "https://les-gaulois.github.io") return null;
  return m[1] + "/jeu/api/game/" + m[2] + "/";
}
