/**
 * Le classement « Les plus utiles » tel que le site le construit, pour sa page (`src/pages/utiles.astro`) et pour la fiche
 * de chaque membre (demande du pilote, 17 novembre 2026 : « l'utilité sur la fiche du membre, sa moyenne et ses titres »).
 * Lu une fois par build : les bilans publiés des parties à revoir (`scripts/publier-films.ts`), la liste du clan pour savoir
 * quel pseudo désigne un seul membre.
 *
 * « Monte ou descend » (même demande) : le site ne garde pas le classement de la veille. Il le refait sans les parties
 * commencées le jour du dernier passage du robot des films, heure de Paris (`bilansDAvant`) : c'est le classement
 * tel qu'il serait sans elles, pas un relevé d'hier (une partie sortie depuis de la liste à revoir n'y est plus). L'écran le
 * dit.
 */
import { loadBilan, loadFilms, loadMembers } from "../data";
import { parisParts } from "../time";
import { bilansDAvant, classementGeneral, mouvementsDuClassement, PARTIES_MIN_DU_CLASSEMENT, rangsDuClassement, type LigneDuClassement } from "./bilan";
import { porteursDesPseudos } from "./insignes";

export interface ClassementDuSite {
  lignes: LigneDuClassement[];
  /** Le rang de chaque membre, par pseudo (à utilité égale, le même), et son identifiant public, pour sa fiche. */
  rangs: Map<string, number>;
  ids: Map<string, string>;
  /** Les places gagnées ou perdues sans les parties d'aujourd'hui ; `null` : il n'était pas au classement sans elles. */
  mouvements: Map<string, number | null>;
  /** Les parties comptées (deux Gaulois au moins ont un score), le début de la plus ancienne, et l'heure du dernier passage. */
  parties: number;
  depuis: string | null;
  fait: string | null;
}

let classement: ClassementDuSite | null = null;

export function classementDuSite(): ClassementDuSite {
  if (classement) return classement;
  const liste = loadFilms();
  const films = (liste?.films ?? []).filter((f) => f.jeu && f.bilan);
  const lus = films.flatMap((f) => {
    const bilan = loadBilan(f.partie);
    return bilan ? [{ bilan, debut: f.debut }] : [];
  });
  // Un pseudo public porté par plusieurs membres ne désigne personne : ni ligne, ni fiche, ni Gaulois.
  const porteurs = porteursDesPseudos(loadMembers()?.members ?? []);
  const unSeul = (nom: string) => porteurs.get(nom)?.length === 1;
  const lignes = classementGeneral(lus.map((l) => l.bilan), PARTIES_MIN_DU_CLASSEMENT, unSeul);
  const avant = classementGeneral(bilansDAvant(lus, liste?.fait ?? null, (iso) => parisParts(iso).date), PARTIES_MIN_DU_CLASSEMENT, unSeul);
  classement = {
    lignes,
    rangs: rangsDuClassement(lignes),
    ids: new Map(lignes.map((l) => [l.nom, porteurs.get(l.nom)![0]!])),
    mouvements: mouvementsDuClassement(lignes, avant),
    parties: lus.filter((l) => l.bilan.gaulois.length >= 2).length,
    depuis: films.at(-1)?.debut ?? null,
    fait: liste?.fait ?? null,
  };
  return classement;
}
