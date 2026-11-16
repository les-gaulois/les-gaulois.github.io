/**
 * Ce que les écrans des Gaulois uniques déduisent de ce qu'ils ont reçu (15 novembre 2026) : la section « Gaulois
 * uniques » de « La boutique » et le choix du corps dans « Mon Gaulois » (`src/components/village/Modeles.tsx`). Des
 * calculs purs : les lignes des chances de la pochette, la bande de son tambour, les modèles du compte, l'essayage. Rien
 * ne décide d'un droit, d'un prix ni d'un tirage : le serveur le fait, et `modeles.ts` lit ses réponses.
 */
import { ORDRE_RARETES, RARETES, type Rarete } from "../gaulois";
import type { MesModeles } from "./contrat";
import { MODELES, chancesPourMoi, etatDuModele, modelesParRarete, restantsParRarete, type EtatDuModele, type ModeleRange } from "./modeles";
import { bandeDuTambour, rangeeAuHasard, type Bande } from "./tambour";

type Valeurs = Readonly<Record<Rarete, number>>;

/** Une ligne des chances de la pochette des Gaulois uniques, pour ce compte. */
export interface LigneDeChance {
  rarete: Rarete;
  nom: string;
  rang: number;
  /** La chance réelle pour ce compte, en pour cent : 0 quand il a déjà tous les modèles de cette rareté. */
  chance: number;
  /** Les modèles de cette rareté qu'il lui reste à recevoir, et combien il y en a en tout. */
  reste: number;
  total: number;
}

/**
 * Les chances de la pochette pour ce compte, de la rareté la plus courante à la plus rare : celles du serveur, une rareté
 * où il a tout étant sautée (`chancesPourMoi`). `null` quand il n'a plus rien à recevoir.
 */
export function lignesDesChances(chances: Valeurs, possedes: ReadonlySet<string>, liste: readonly ModeleRange[] = MODELES): LigneDeChance[] | null {
  const pourMoi = chancesPourMoi(chances, possedes, liste);
  if (!pourMoi) return null;
  const restants = restantsParRarete(possedes, liste);
  const totaux = modelesParRarete(liste);
  return ORDRE_RARETES.map((rarete) => ({ rarete, nom: RARETES[rarete].nom, rang: RARETES[rarete].rang, chance: pourMoi[rarete], reste: restants[rarete], total: totaux[rarete] }));
}

/** Combien de Gaulois uniques ce compte n'a pas encore. */
export const resteADecouvrir = (possedes: ReadonlySet<string>, liste: readonly ModeleRange[] = MODELES): number => liste.filter((modele) => !possedes.has(modele.id)).length;

/** « 3 sur 11 ». */
export const surCombien = (nombre: number, total: number): string => `${nombre} sur ${total}`;

/** Les modèles du compte, dans l'ordre de la galerie : un modèle inconnu de ce dessin est écarté. */
export function modelesPossedes(mes: Pick<MesModeles, "modeles"> | null, liste: readonly ModeleRange[] = MODELES): ModeleRange[] {
  const ids = new Set((mes?.modeles ?? []).map((ligne) => ligne.modele));
  return liste.filter((modele) => ids.has(modele.id));
}

/**
 * La bande du tambour de la pochette des Gaulois uniques, pour un compte : seulement les modèles qu'il n'avait pas avant
 * d'ouvrir (la pochette ne donne jamais un modèle déjà reçu), aux chances qu'elle avait pour lui ; le modèle reçu au bout.
 */
export function bandeDesModeles(recu: ModeleRange, chances: Valeurs, possedes: ReadonlySet<string>, hasard: () => number = Math.random, liste: readonly ModeleRange[] = MODELES): Bande<ModeleRange> {
  const parRarete = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, liste.filter((m) => m.rarete === rarete && !possedes.has(m.id))])) as Record<Rarete, ModeleRange[]>;
  const pourMoi = chancesPourMoi(chances, possedes, liste) ?? chances;
  return bandeDuTambour({ valeur: recu, rarete: recu.rarete }, () => rangeeAuHasard(pourMoi, (rarete) => parRarete[rarete], hasard));
}

/** Les silhouettes de la pochette : jusqu'à trois modèles que le compte n'a pas, ou les trois premiers s'il les a tous. */
export function modelesDeLaPochette(possedes: ReadonlySet<string>, liste: readonly ModeleRange[] = MODELES): ModeleRange[] {
  const restants = liste.filter((modele) => !possedes.has(modele.id));
  return (restants.length > 0 ? restants : liste).slice(0, 3);
}

/** Ce que l'essayage d'un modèle propose : l'acheter, le porter, ou revenir au corps humain. */
export type ActionDeLEssai = "acheter" | "porter" | "enlever";

const ACTIONS: Readonly<Record<EtatDuModele, ActionDeLEssai>> = { "a-obtenir": "acheter", "a-moi": "porter", porte: "enlever" };

export const actionDeLEssai = (id: string, mes: Pick<MesModeles, "modeles" | "porte"> | null): ActionDeLEssai => ACTIONS[etatDuModele(id, mes)];

/** L'essayage tient-il encore ? Un modèle porté ne s'essaie pas : le Gaulois le porte déjà. */
export const essaiDuModeleValide = (id: string | null, mes: Pick<MesModeles, "modeles" | "porte"> | null): string | null => (id !== null && etatDuModele(id, mes) !== "porte" ? id : null);
