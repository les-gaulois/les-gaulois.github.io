/**
 * Ce que les écrans des Gaulois uniques déduisent de ce qu'ils ont reçu (15 novembre 2026) : la section « Gaulois
 * uniques » de « La boutique » et le choix du corps dans « Mon Gaulois » (`src/components/village/Modeles.tsx`). Des
 * calculs purs : les lignes des chances de la pochette, la bande de son tambour, les modèles du compte, l'essayage. Rien
 * ne décide d'un droit, d'un prix ni d'un tirage : le serveur le fait, et `modeles.ts` lit ses réponses.
 */
import { RARETES, type Rarete } from "../gaulois";
import { rognerLeDessin, type Album, type ElementDeLAlbum } from "./album-pochette";
import type { MesModeles } from "./contrat";
import type { DessinEnCases } from "./ecran-familiers";
import { MODELES, RARETES_DES_GAULOIS_UNIQUES, chancesPourMoi, type RareteDUnique, etatDuModele, modeleNu, modelesParRarete, restantsParRarete, type EtatDuModele, type ModeleRange } from "./modeles";
import { bandeDuTambour, rangeeAuHasard, type Bande } from "./tambour";

type Valeurs = Readonly<Record<RareteDUnique, number>>;

/** Une ligne des chances de la pochette des Gaulois uniques, pour ce compte. */
export interface LigneDeChance {
  rarete: RareteDUnique;
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
  return RARETES_DES_GAULOIS_UNIQUES.map((rarete) => ({ rarete, nom: RARETES[rarete].nom, rang: RARETES[rarete].rang, chance: pourMoi[rarete], reste: restants[rarete], total: totaux[rarete] }));
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
  const parRarete = Object.fromEntries(RARETES_DES_GAULOIS_UNIQUES.map((rarete) => [rarete, liste.filter((m) => m.rarete === rarete && !possedes.has(m.id))])) as Record<Rarete, ModeleRange[]>;
  const pourMoi = chancesPourMoi(chances, possedes, liste) ?? chances;
  return bandeDuTambour({ valeur: recu, rarete: recu.rarete }, () => rangeeAuHasard(pourMoi, (rarete) => parRarete[rarete] ?? [], hasard));
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
 * L'album de la pochette des Gaulois uniques (16 novembre 2026, `AlbumPochette.tsx`) : les modèles famille par famille,
 * en couleur comme dans la vitrine, avec leur chance dans la prochaine pochette de ce compte, comme le tirage : la rareté
 * selon ses chances pour lui (`chancesPourMoi`), puis un de ses modèles manquants, à chances égales ; 0 pour un modèle
 * déjà reçu, la pochette ne le redonne jamais.
 */
export function albumDesModeles(mes: Pick<MesModeles, "modeles" | "pochette">, liste: readonly ModeleRange[] = MODELES): Album {
  const possedes = new Set(mes.modeles.map((ligne) => ligne.modele));
  const pourMoi = chancesPourMoi(mes.pochette.chances, possedes, liste);
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
