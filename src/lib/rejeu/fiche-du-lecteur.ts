/**
 * La fiche que lit le vrai lecteur du jeu pour une partie, d'après son lien (`adresseDuLecteur` de `lecteur-jeu.ts`). La page
 * « Revoir une partie » la demande avant de montrer le lecteur dans son cadre, et montre le film si elle manque (dépôt en panne
 * ou en retard). Module à part, chargé par la page : `lecteur-jeu.ts`, lui, ne sert qu'à construire et publier le lecteur.
 * `null` : lien inattendu, ou sur l'adresse du clan, où le lecteur ne vit jamais.
 */
export function ficheDuLecteur(jeu: string): string | null {
  const m = /^(https:\/\/[a-z0-9-]+\.github\.io)\/jeu\/[0-9a-f]{10}\/#replay-viewer=([A-Za-z0-9]{1,32})$/.exec(jeu);
  if (!m || m[1] === "https://les-gaulois.github.io") return null;
  return m[1] + "/jeu/api/game/" + m[2] + "/";
}
