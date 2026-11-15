/**
 * Le rangement de la page « La boutique » (`/boutique`, 15 novembre 2026) : les achats en statères au même
 * endroit. Dans chaque rayon, ce que vend la boutique du clan et ce que vendent les membres au marché, l'un sous l'autre,
 * réduits ensemble à une rareté ; un seul Gaulois essaie l'un comme l'autre.
 *
 * Ici, seulement des calculs purs : ce qu'un rayon montre, combien d'offres de membres attendent dans chacun, ce qui
 * empêche d'acheter ce qu'on essaie. Rien ne décide d'un droit ni d'un prix : le serveur le fait (`contrat.ts`), et
 * l'écran (`src/components/village/Boutique.tsx`) ne range que ce qu'il a reçu.
 */
import { EMPLACEMENTS_OBJETS, OBJETS, type Rarete } from "../gaulois";
import type { RefObjet } from "./contrat";
import { RAISON_EN_VENTE, estEnVente, manque, stateres } from "./ecran-boutique";
import { offresAAcheter, type OffreLisible } from "./ecran-marche";
import { compterParRarete, filtreEffectif, filtrerParRarete, rangerLeRayon, type Entree, type Filtre } from "./vestiaire-rayons";

/** La page de la boutique. */
export const ADRESSE_BOUTIQUE = "/boutique";

/** L'ancre du marché des membres dans la page : `/village#marche`, l'ancien onglet, y mène. */
export const ANCRE_MARCHE = "marche";

/**
 * Gardé dans l'onglet le temps de la connexion par Discord, comme `RETOUR_VILLAGE_KEY` : la page de compte, où Discord
 * ramène, renvoie alors à la boutique.
 */
export const RETOUR_BOUTIQUE_KEY = "gal-boutique-retour";

/** Les rayons de la boutique, dans l'ordre de la barre : un par emplacement d'objets. Le corps, gratuit, n'en a pas. */
export const RAYONS_BOUTIQUE = EMPLACEMENTS_OBJETS;
export type RayonBoutique = (typeof RAYONS_BOUTIQUE)[number];

/** Un rayon rangé : ce que vend la boutique du clan, ce que vendent les membres, et de quoi les réduire à une rareté. */
export interface RayonRange {
  /** Les objets de la boutique que le membre n'a pas, dans l'ordre du catalogue, pour le filtre retenu. */
  boutique: Entree[];
  /** Les offres des autres membres dans ce rayon, dans l'ordre du serveur, pour le filtre retenu. */
  offres: OffreLisible[];
  /** Combien d'objets à vendre par rareté, boutique et membres ensemble, sans filtre. */
  comptes: Record<Rarete, number>;
  /** Tout ce qui se vend dans le rayon, sans filtre. */
  total: number;
  /** Le filtre qui s'applique vraiment : une rareté sans objet remontre tout. */
  retenu: Filtre;
}

/**
 * Un rayon de la boutique : les objets du catalogue que le membre n'a pas (d'après `possede`) et les offres des autres
 * membres pour cet emplacement, réduits ensemble par le filtre.
 */
export function rangerLaBoutique(rayon: RayonBoutique, possede: (id: string) => number, offres: readonly OffreLisible[], filtre: Filtre | undefined): RayonRange {
  const boutique = rangerLeRayon(OBJETS[rayon], possede).boutique;
  const membres = offresAAcheter(offres, rayon);
  const comptes = compterParRarete(boutique);
  for (const offre of membres) comptes[offre.rarete] += 1;
  const retenu = filtreEffectif(filtre, comptes);
  return {
    boutique: filtrerParRarete(boutique, retenu),
    offres: retenu === "tout" ? membres : membres.filter((offre) => offre.rarete === retenu),
    comptes,
    total: boutique.length + membres.length,
    retenu,
  };
}

/** Combien d'offres d'autres membres attendent dans chaque rayon. */
export function offresParRayon(offres: readonly OffreLisible[]): Record<RayonBoutique, number> {
  const comptes = Object.fromEntries(RAYONS_BOUTIQUE.map((rayon) => [rayon, 0])) as Record<RayonBoutique, number>;
  for (const offre of offres) if (!offre.a_moi && offre.emplacement in comptes) comptes[offre.emplacement as RayonBoutique] += 1;
  return comptes;
}

/** « 1 offre », « 3 offres » : ce que l'onglet d'un rayon dit des offres des membres. */
export const motsDesOffres = (n: number): string => `${n} ${n > 1 ? "offres" : "offre"}`;

/** L'adresse demande-t-elle le marché des membres (`#marche`) ? */
export const demandeLeMarche = (hash: string): boolean => hash === `#${ANCRE_MARCHE}`;

/**
 * Le rayon ouvert à l'arrivée : le premier. Arrivé par l'adresse du marché, le premier rayon où un membre vend quelque
 * chose, s'il y en a un.
 */
export function rayonDOuverture(offres: readonly OffreLisible[], versLeMarche: boolean): RayonBoutique {
  const comptes = offresParRayon(offres);
  return (versLeMarche ? RAYONS_BOUTIQUE.find((rayon) => comptes[rayon] > 0) : undefined) ?? RAYONS_BOUTIQUE[0];
}

/** Ce que le Gaulois essaie : un objet de la boutique du clan, ou l'offre d'un membre. Il ne porte que ce qui est acheté. */
export type Essai = (RefObjet & { source: "boutique" }) | (RefObjet & { source: "marche"; offre: number });

/** L'offre qu'on essaie, si elle est encore au marché. */
export function offreEssayee(essai: Essai | null, offres: readonly OffreLisible[]): OffreLisible | null {
  return essai?.source === "marche" ? (offres.find((offre) => offre.id === essai.offre && !offre.a_moi) ?? null) : null;
}

/** L'essai qui tient encore : l'offre d'un membre partie entre-temps (achetée, retirée, finie) ne s'essaie plus. */
export function essaiValide(essai: Essai | null, offres: readonly OffreLisible[]): Essai | null {
  return essai?.source === "marche" && !offreEssayee(essai, offres) ? null : essai;
}

/**
 * Ce qui empêche d'acheter à la boutique l'objet qu'on essaie, en mots ; `null` : rien. Dans l'ordre : la boutique fermée
 * à ce compte (`fermee`), l'objet déjà mis en vente par le membre, le solde trop court. Le serveur revérifie tout.
 */
export function raisonDeLEssai(essai: RefObjet, prix: number | null, solde: number | null, fermee: string | null, enVente: readonly RefObjet[]): string | null {
  if (fermee) return fermee;
  if (estEnVente(enVente, essai.emplacement, essai.objet)) return RAISON_EN_VENTE;
  const il_manque = prix !== null && solde !== null ? manque(solde, prix) : 0;
  return il_manque > 0 ? `Il vous manque ${stateres(il_manque)}.` : null;
}
