/**
 * Ce que les écrans des Gaulois uniques déduisent de ce qu'ils ont reçu (15 novembre 2026) : la section « Gaulois
 * uniques » de « La boutique » et le choix du corps dans « Mon Gaulois » (`src/components/village/Modeles.tsx`). Des
 * calculs purs : les lignes des chances de la pochette, la bande de son tambour, les modèles du compte, l'essayage. Rien
 * ne décide d'un droit, d'un prix ni d'un tirage : le serveur le fait, et `modeles.ts` lit ses réponses.
 */
import { RARETES } from "../gaulois";
import { rognerLeDessin, type Album, type ElementDeLAlbum } from "./album-pochette";
import type { MesModeles } from "./contrat";
import type { DessinEnCases } from "./ecran-familiers";
import { MODELES, RARETES_DES_GAULOIS_UNIQUES, chancesDeLaPochetteDesModeles, chancesPourMoi, type RareteDUnique, etatDuModele, modeleNu, modelesParRarete, restantsParRarete, type EtatDuModele, type ModeleRange, type PochetteDesModeles } from "./modeles";
import { CIBLE_DU_TAMBOUR, DEPART_DU_TAMBOUR, rangeeAuHasard } from "./tambour";

/** Un remboursement de la pochette : la part du prix rendue, en pour cent, et les statères rendus. */
export interface Rendu {
  pourcent: number;
  rendu: number;
}

/**
 * Ce que la pochette rend quand elle ne donne pas de Gaulois unique : la part des pochettes qui remboursent, en pour cent,
 * et chaque palier avec ses statères, du plus petit au plus grand (arrondis comme le serveur, `round(prix × palier / 100)`).
 * La part est celle de ce compte : celle du serveur, plus les chances des raretés où il a déjà tous les modèles
 * (`chancesDeLaPochetteDesModeles`). `null` pour une pochette qui ne rend rien.
 */
export function rendusDeLaPochette(pochette: Pick<PochetteDesModeles, "prix" | "chances" | "remboursement" | "paliers">, possedes: ReadonlySet<string> = new Set(), liste: readonly ModeleRange[] = MODELES): { chance: number; paliers: Rendu[] } | null {
  const chance = chancesDeLaPochetteDesModeles(pochette, possedes, liste)?.remboursement ?? pochette.remboursement;
  if (!(chance > 0) || pochette.paliers.length === 0) return null;
  const paliers = [...pochette.paliers].sort((a, b) => a - b).map((pourcent) => ({ pourcent, rendu: Math.round((pochette.prix * pourcent) / 100) }));
  return { chance, paliers };
}

/** Une ligne des chances de la pochette des Gaulois uniques, pour ce compte. */
export interface LigneDeChance {
  rarete: RareteDUnique;
  nom: string;
  rang: number;
  /** La chance réelle pour ce compte, en pour cent de toutes les pochettes, remboursements compris : 0 quand il a déjà tous les modèles de cette rareté. */
  chance: number;
  /** Les modèles de cette rareté qu'il lui reste à recevoir, et combien il y en a en tout. */
  reste: number;
  total: number;
}

/**
 * Les chances de la pochette pour ce compte, de la rareté la plus courante à la plus rare, en pour cent de toutes les
 * pochettes : celles du serveur, prises dans la part qui donne un modèle, une rareté où il a tout tombant à 0 au profit des statères rendus
 * (`chancesDeLaPochetteDesModeles`). Avec la part des remboursements (`rendusDeLaPochette`), elles font cent. `null` quand il n'a
 * plus rien à recevoir.
 */
export function lignesDesChances(pochette: Pick<PochetteDesModeles, "chances" | "remboursement">, possedes: ReadonlySet<string>, liste: readonly ModeleRange[] = MODELES): LigneDeChance[] | null {
  const chances = chancesDeLaPochetteDesModeles(pochette, possedes, liste);
  if (!chances) return null;
  const restants = restantsParRarete(possedes, liste);
  const totaux = modelesParRarete(liste);
  return RARETES_DES_GAULOIS_UNIQUES.map((rarete) => ({ rarete, nom: RARETES[rarete].nom, rang: RARETES[rarete].rang, chance: chances.parRarete[rarete], reste: restants[rarete], total: totaux[rarete] }));
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

/** Ce qu'une pochette des Gaulois uniques peut sortir, et donc une rangée de son tambour : un modèle, ou un remboursement. */
export type SortieDeLaPochette = { kind: "modele"; modele: ModeleRange } | ({ kind: "rendu" } & Rendu);

/** Les rangées d'un tour du tambour des Gaulois uniques : `depart` au milieu quand il commence, `cible` (le résultat) à l'arrêt. */
export interface BandeDesUniques {
  rangees: SortieDeLaPochette[];
  depart: number;
  cible: number;
}

/**
 * La bande du tambour de la pochette des Gaulois uniques, pour un compte. Chaque rangée est tirée comme le serveur tire :
 * d'abord remboursement ou modèle, selon la part des remboursements de ce compte (raretés terminées comprises) ; un remboursement prend un palier à chances égales ;
 * un modèle, seulement parmi ceux que le compte n'avait pas avant d'ouvrir, aux chances que la pochette avait pour lui. Ce
 * que le serveur a répondu (`recu`) est posé à la rangée de l'arrêt : aucune autre rangée n'est choisie d'après lui.
 */
export function bandeDesModeles(recu: SortieDeLaPochette, pochette: Pick<PochetteDesModeles, "prix" | "chances" | "remboursement" | "paliers">, possedes: ReadonlySet<string>, hasard: () => number = Math.random, liste: readonly ModeleRange[] = MODELES): BandeDesUniques {
  const parRarete = Object.fromEntries(RARETES_DES_GAULOIS_UNIQUES.map((rarete) => [rarete, liste.filter((m) => m.rarete === rarete && !possedes.has(m.id))])) as Partial<Record<string, ModeleRange[]>>;
  const pourMoi = chancesPourMoi(pochette.chances, possedes, liste) ?? pochette.chances;
  const rendus = rendusDeLaPochette(pochette, possedes, liste);
  const tirer = (): SortieDeLaPochette => {
    if (rendus && hasard() * 100 < rendus.chance) {
      const palier = rendus.paliers[Math.min(rendus.paliers.length - 1, Math.floor(hasard() * rendus.paliers.length))];
      if (palier) return { kind: "rendu", ...palier };
    }
    const rangee = rangeeAuHasard(pourMoi, (rarete) => parRarete[rarete] ?? [], hasard);
    return rangee ? { kind: "modele", modele: rangee.valeur } : recu;
  };
  const rangees = Array.from({ length: CIBLE_DU_TAMBOUR + 4 }, (_, i) => (i === CIBLE_DU_TAMBOUR ? recu : tirer()));
  return { rangees, depart: DEPART_DU_TAMBOUR, cible: CIBLE_DU_TAMBOUR };
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

const NUS_ROGNES = new Map<string, DessinEnCases | null>();
/** Le modèle seul, rogné à son dessin : calculé une fois par modèle de la vraie liste. */
function nuRogne(modele: ModeleRange, liste: readonly ModeleRange[]): DessinEnCases | null {
  if (liste === MODELES && NUS_ROGNES.has(modele.id)) return NUS_ROGNES.get(modele.id) ?? null;
  const nu = modeleNu(modele.id);
  const dessin = nu && rognerLeDessin(nu);
  if (liste === MODELES) NUS_ROGNES.set(modele.id, dessin);
  return dessin;
}

/**
 * L'album de la pochette des Gaulois uniques (16 novembre 2026, `AlbumPochette.tsx`) : les modèles famille par famille (montrés par rareté, `casesDuGroupe`),
 * en couleur comme dans la vitrine, avec leur chance dans la prochaine pochette de ce compte, comme le tirage : la part qui
 * donne un modèle, la rareté selon ses chances pour lui (`chancesDeLaPochetteDesModeles`), puis un de ses modèles manquants, à
 * chances égales ; 0 pour un modèle déjà reçu, la pochette ne le redonne jamais. Avec la part des remboursements, que
 * l'écran montre au-dessus des cases (`rendusDeLaPochette`), les chances font cent.
 */
export function albumDesModeles(mes: Pick<MesModeles, "modeles" | "pochette">, liste: readonly ModeleRange[] = MODELES): Album {
  const possedes = new Set(mes.modeles.map((ligne) => ligne.modele));
  const pourMoi = chancesDeLaPochetteDesModeles(mes.pochette, possedes, liste)?.parRarete;
  const restants = restantsParRarete(possedes, liste);
  const elements = liste.map(
    (modele): ElementDeLAlbum => ({
      id: modele.id,
      nom: modele.nom,
      rarete: modele.rarete,
      groupe: modele.famille,
      detail: modele.famille,
      dessin: nuRogne(modele, liste),
      silhouette: false,
      possede: possedes.has(modele.id),
      montre: false,
      chance: possedes.has(modele.id) || !pourMoi || restants[modele.rarete] === 0 ? 0 : pourMoi[modele.rarete] / restants[modele.rarete],
    }),
  );
  return { titre: "Dans la pochette des Gaulois uniques", sous: `${surCombien(elements.filter((e) => e.possede).length, elements.length)} à vous`, libelleDesGroupes: "Montrer une famille", elements };
}
