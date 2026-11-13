/** L'adresse d'un fichier publié de la carte, avec sa version quand elle est connue (`version.ts`). */
export function adresseVersionnee(dossier: string, nom: string, version: string | null | undefined): string {
  return version ? `${dossier}${nom}?v=${encodeURIComponent(version)}` : `${dossier}${nom}`;
}
