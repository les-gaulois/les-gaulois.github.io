import { ORDRE_RARETES_DES_OBJETS, type Emplacement, type RareteDObjet } from "../gaulois";
import { objetsDeLaPochette } from "./boutique";
import { CHANCES_DU_TIRAGE } from "./contrat";

/**
 * Le booster d'essai des visiteurs de « Mon Gaulois » (21 novembre 2026, choix du pilote dans la fiche de projet : la vitrine
 * en démonstration, avec un booster de démonstration). Un visiteur qui n'est pas connecté ouvre un booster surprise avec la
 * même animation que les membres, sur un tirage d'exemple fait dans son navigateur, comme le serveur fait le vrai : une
 * rareté selon les chances de départ du tirage (`CHANCES_DU_TIRAGE`, écrites dans `contrat.ts`), puis un objet payant de
 * cette rareté, à chances égales (`objetsDeLaPochette`). Rien n'est envoyé au serveur, rien n'est enregistré ni donné :
 * l'écran le dit.
 */
export interface TirageDEssai {
  emplacement: Emplacement;
  objet: string;
  rarete: RareteDObjet;
}

/** Un tirage d'exemple ; `alea` rend un nombre de 0 (compris) à 1 (exclu). `null` si le catalogue n'a rien à tirer. */
export function tirageDEssai(alea: () => number = Math.random): TirageDEssai | null {
  const possibles = ORDRE_RARETES_DES_OBJETS.filter((rarete) => CHANCES_DU_TIRAGE[rarete] > 0 && objetsDeLaPochette(rarete).length > 0);
  const total = possibles.reduce((somme, rarete) => somme + CHANCES_DU_TIRAGE[rarete], 0);
  const derniere = possibles[possibles.length - 1];
  if (!derniere || total <= 0) return null;
  let reste = Math.min(Math.max(alea(), 0), 0.999999) * total;
  let rarete: RareteDObjet = derniere;
  for (const r of possibles) {
    if (reste < CHANCES_DU_TIRAGE[r]) {
      rarete = r;
      break;
    }
    reste -= CHANCES_DU_TIRAGE[r];
  }
  const objets = objetsDeLaPochette(rarete);
  const choisi = objets[Math.min(objets.length - 1, Math.floor(Math.min(Math.max(alea(), 0), 0.999999) * objets.length))];
  return choisi ? { emplacement: choisi.emplacement, objet: choisi.objet, rarete } : null;
}
