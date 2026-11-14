/**
 * La tenue du Gaulois compagnon. Pour l'instant, personne n'a la sienne : tout le monde voit le Gaulois de départ, qui
 * invite à l'habiller au village. C'est ici, et seulement ici, que se branchera la tenue enregistrée du membre connecté
 * (`get_mon_gaulois`), sans charger Supabase sur chaque page : par exemple une copie gardée dans ce navigateur par le
 * vestiaire et par la connexion.
 *
 * Ce fichier ne charge pas le dessin du Gaulois (`gaulois.ts`, lourd) : il rend la tenue telle qu'elle a été gardée, que
 * `src/lib/compagnon/dessin.ts` relit par `lireTenue`. Une tenue absente ou illisible donne le Gaulois de départ.
 */
export function tenueBruteDuCompagnon(): unknown {
  return null;
}
