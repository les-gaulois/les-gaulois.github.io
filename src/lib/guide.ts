/**
 * Le parcours du guide du clan (/debuter) : un chapitre à la fois, rangé en groupes. Ici, seulement ce qui se calcule ;
 * la page est src/pages/debuter.astro, et ce qui tourne dans le navigateur src/scripts/guide.ts.
 */

/** Les groupes du sommaire, dans l'ordre où ils se lisent. */
export const GROUPES = [
  { id: "combat", nom: "Combat" },
  { id: "economie", nom: "Économie" },
  { id: "alliances", nom: "Alliances" },
  { id: "memo", nom: "Aide-mémoire" },
] as const;
export type GroupeId = (typeof GROUPES)[number]["id"];

/** Les chapitres, déjà dans l'ordre, rangés sous leur groupe. Un groupe sans chapitre n'existe pas. */
export function parGroupe<T extends { groupe: GroupeId }>(chapitres: readonly T[]): { id: GroupeId; nom: string; chapitres: T[] }[] {
  return GROUPES.map((g) => ({ ...g, chapitres: chapitres.filter((c) => c.groupe === g.id) })).filter((g) => g.chapitres.length > 0);
}

/** L'ancre d'un chapitre dans la page : « 03-attaque » donne « chapitre-03-attaque », l'adresse qu'il a toujours eue. */
export const ancreDuChapitre = (id: string): string => `chapitre-${id}`;

/** La commande décorative d'un chapitre : « 04-poste-neutre » donne « poste-neutre ». */
export const commandeDuChapitre = (id: string): string => id.replace(/^\d+-/, "");

/** Le numéro d'un chapitre sur deux chiffres : 3 donne « 03 ». */
export const numeroDuChapitre = (ordre: number): string => String(ordre).padStart(2, "0");

/** Le chapitre que nomme l'adresse (« #chapitre-03-attaque »), s'il est dans la page. `null` : une autre ancre, ou rien. */
export function chapitreDeLAdresse(hash: string, ancres: readonly string[]): string | null {
  let nom: string;
  try {
    nom = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  return ancres.includes(nom) ? nom : null;
}

/** De quel côté arrive le chapitre qu'on ouvre : de droite quand on avance, de gauche quand on revient. */
export function sensDuPassage(ancres: readonly string[], de: string | null, vers: string): "droite" | "gauche" | null {
  const depart = de === null ? -1 : ancres.indexOf(de);
  const arrivee = ancres.indexOf(vers);
  if (depart < 0 || arrivee < 0 || depart === arrivee) return null;
  return arrivee > depart ? "droite" : "gauche";
}

/**
 * Faut-il faire défiler la page jusqu'au haut du chapitre qu'on vient d'ouvrir ? Oui s'il commence sous l'en-tête collant
 * (on a cliqué « Suivant » en bas du précédent) ou trop bas pour se lire d'emblée. `haut` : sa distance au haut de la fenêtre.
 */
export function doitDefiler(haut: number, hauteurFenetre: number, enTete = 88): boolean {
  return haut < enTete || haut > hauteurFenetre * 0.45;
}

/** Un titre « Les bases : population, troupes et tuiles » se lit en deux lignes : le titre, puis ce qu'il précise. */
export function titreEnDeux(titre: string): { titre: string; precision: string | null } {
  const coupe = titre.match(/^(.*?)\s:\s(.+)$/);
  return coupe?.[1] && coupe[2] ? { titre: coupe[1], precision: coupe[2] } : { titre, precision: null };
}

/**
 * Les morceaux d'un titre, pour qu'un mot composé (« Aide-mémoire ») ne se coupe pas à son trait d'union : sans cela, un
 * téléphone écrit « AIDE- » sur une ligne et « MÉMOIRE COMBAT » sur la suivante. Mis bout à bout, les morceaux redonnent
 * le titre, au caractère près.
 */
export function motsComposes(titre: string): { texte: string; insecable: boolean }[] {
  return titre
    .split(/(\S+-\S+)/)
    .map((texte, i) => ({ texte, insecable: i % 2 === 1 }))
    .filter((m) => m.texte !== "");
}

export interface Morceau {
  texte: string;
  gras: boolean;
}

/** Les morceaux d'une phrase où `**…**` marque le gras. Rien d'autre du Markdown : le reste est du texte, écrit tel quel. */
export function morceauxGras(phrase: string): Morceau[] {
  return phrase
    .split("**")
    .map((texte, i) => ({ texte, gras: i % 2 === 1 }))
    .filter((m) => m.texte !== "");
}
