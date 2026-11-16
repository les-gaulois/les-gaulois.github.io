/**
 * Le rangement de « La boutique » (15 novembre 2026 ; page `/boutique`, puis onglet de `/village` le même jour) : les achats en statères au même
 * endroit. Dans chaque rayon d'objets, ce que vend la boutique du clan et ce que vendent les membres au marché, l'un sous
 * l'autre, réduits ensemble à une rareté ; un seul Gaulois essaie l'un comme l'autre. Après l'arme, le rayon des bannières,
 * puis celui des pochettes.
 *
 * Ici, seulement des calculs purs : ce qu'un rayon montre, combien d'offres de membres attendent dans chacun, ce qui
 * empêche d'acheter ce qu'on essaie. Rien ne décide d'un droit ni d'un prix : le serveur le fait (`contrat.ts`), et
 * l'écran (`src/components/village/Boutique.tsx`) ne range que ce qu'il a reçu.
 */
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, type RareteDObjet, type Vignette } from "../gaulois";
import type { RefObjet } from "./contrat";
import { RAISON_EN_VENTE, estEnVente, manque, stateres } from "./ecran-boutique";
import { offresAAcheter, type OffreLisible } from "./ecran-marche";
import { compterParRarete, filtreEffectif, filtrerParRarete, rangerLeRayon, type Entree, type Filtre } from "./vestiaire-rayons";

/** La boutique : l'onglet de « Mon Gaulois » (`/boutique` y renvoie). */
export const ADRESSE_BOUTIQUE = "/village#boutique";

/** L'adresse d'une partie de la boutique (`/village#marche`, `/village#familiers`) : elle ouvre l'onglet, qui y descend. */
export const adresseDansLaBoutique = (ancre: string): string => `/village#${ancre}`;

/** L'ancre du marché des membres dans la boutique : `/village#marche` ouvre l'onglet et y descend. */
export const ANCRE_MARCHE = "marche";

/**
 * Gardé dans l'onglet le temps de la connexion par Discord, comme `RETOUR_VILLAGE_KEY` : la page de compte, où Discord
 * ramène, renvoie alors à la boutique.
 */
export const RETOUR_BOUTIQUE_KEY = "gal-boutique-retour";

/** Les rayons des objets : un par emplacement d'objets. Le corps, gratuit, n'en a pas. */
export const RAYONS_OBJETS = EMPLACEMENTS_OBJETS;
export type RayonObjet = (typeof RAYONS_OBJETS)[number];

/** Le rayon des bannières de /gaulois. */
export const RAYON_BANNIERE = "banniere";

/** Le rayon des Gaulois uniques : leur pochette et les onze corps de créature (`modeles.ts`). */
export const RAYON_UNIQUES = "uniques";

/**
 * Les pochettes (la surprise, les familiers, les statères, les bannières, les Gaulois uniques) : huitième rayon de la
 * boutique le matin du 16 novembre 2026, puis, le soir, une partie de « Mon Gaulois » à elles, entre la boutique et la
 * vitrine (`/village#pochettes`), à la demande du pilote (« une section à part pour les pochettes et plus dans la
 * boutique »). L'écran de la boutique les dessine toujours : ouvert sur cette partie, il ne montre qu'elles.
 */
export const RAYON_POCHETTES = "pochettes";

/**
 * Les rayons de la boutique, dans l'ordre de la barre. Le 15 novembre 2026, le pilote trouvait la page longue : les
 * bannières, jusque-là une section entière au-dessus du marché, sont devenues un onglet après l'arme (« ranger les
 * bannières et futur ajout dans la suite tête, haut, bas, pied, arme, bannière »). Ce qui s'ajoutera à la boutique
 * prendra de même un onglet à la suite, plutôt qu'une section de plus sur la page : les Gaulois uniques sont le septième.
 * Les pochettes n'en sont plus : elles ont leur partie de la page (`RAYON_POCHETTES`).
 */
export const RAYONS_BOUTIQUE = [...RAYONS_OBJETS, RAYON_BANNIERE, RAYON_UNIQUES] as const;
export type RayonBoutique = (typeof RAYONS_BOUTIQUE)[number];
/** Ce que l'écran de la boutique montre : un de ses rayons, ou les pochettes seules. */
export type RayonOuvert = RayonBoutique | typeof RAYON_POCHETTES;

/** Le nom des onglets qui ne sont pas des rayons d'objets. « Uniques », pour « Gaulois uniques ». */
const NOMS_DES_AUTRES_RAYONS: Readonly<Record<string, string>> = { [RAYON_BANNIERE]: "Bannière", [RAYON_UNIQUES]: "Uniques" };

/** Le nom de chaque onglet de la barre. */
export const NOMS_RAYONS = Object.fromEntries(RAYONS_BOUTIQUE.map((rayon) => [rayon, NOMS_DES_AUTRES_RAYONS[rayon] ?? NOMS_EMPLACEMENTS[rayon as RayonObjet]])) as Readonly<Record<RayonBoutique, string>>;

/** Un rayon d'objets (la boutique du clan et le marché des membres), et non celui des bannières, des Gaulois uniques ou des pochettes ? */
export const estUnRayonDObjets = (rayon: RayonOuvert): rayon is RayonObjet => (RAYONS_OBJETS as readonly string[]).includes(rayon);

/**
 * L'image de l'onglet des bannières, décorative : une bannière pendue à sa traverse, rouge à liseré d'or, dans les
 * couleurs des objets du Gaulois (le contour, le bois, l'or et le rouge de `gaulois.ts`). Les autres onglets montrent ce
 * que le Gaulois porte ; celui-ci, ce qu'on y trouve.
 */
const DESSIN_ONGLET_BANNIERE = [
  ".kkkkkkkkkkk.",
  "kgffffffffFgk",
  ".kkkkkkkkkkk.",
  "..kgggggggk..",
  "..kgrrrrRgk..",
  "..kgrrrrRgk..",
  "..kgrryrRgk..",
  "..kgryyyRgk..",
  "..kgrryrRgk..",
  "..kgrrrrRgk..",
  "..kgrrrrRgk..",
  "..kgrrrrRgk..",
  "..kggrrRggk..",
  "...kggRggk...",
  "....kgggk....",
  ".....kgk.....",
  "......k......",
] as const;
const COULEURS_ONGLET_BANNIERE: Readonly<Record<string, string>> = { k: "#1a1410", f: "#9a6b3f", F: "#6e4a28", g: "#d4a017", y: "#ffe07a", r: "#e0283a", R: "#a51c2a" };
const vignetteDOnglet = (dessin: readonly string[], couleurs: Readonly<Record<string, string>>): Vignette => ({
  largeur: dessin[0]?.length ?? 0,
  hauteur: dessin.length,
  cases: dessin.flatMap((ligne) => [...ligne].map((lettre) => couleurs[lettre] ?? null)),
});
export const IMAGE_DU_RAYON_BANNIERE: Vignette = vignetteDOnglet(DESSIN_ONGLET_BANNIERE, COULEURS_ONGLET_BANNIERE);

/**
 * L'image de l'onglet des Gaulois uniques, décorative : une tête de créature à écailles vertes, deux cornes dorées, vue
 * de face. Aucun des onze modèles en particulier : ce qu'on trouve dans l'onglet, des corps qui ne sont pas humains.
 */
const DESSIN_ONGLET_UNIQUES = [
  "..kk.....kk..",
  ".kok.....kok.",
  ".kook...kook.",
  "..kokkkkkok..",
  "..kgggggggk..",
  ".kgGgggggGgk.",
  "kggggggggggGk",
  "kgyykgggkyygk",
  "kgykkgggkkygk",
  "kggggggggggGk",
  ".kggkgggkgGk.",
  ".kGgggggggGk.",
  "..kGvvvvvGk..",
  "...kkvvvkk...",
  ".....kkk.....",
] as const;
const COULEURS_ONGLET_UNIQUES: Readonly<Record<string, string>> = { k: "#1a1410", g: "#3fae5a", G: "#2a7d3f", o: "#d4a017", y: "#ffe07a", v: "#f1e3a0" };
export const IMAGE_DU_RAYON_UNIQUES: Vignette = {
  largeur: DESSIN_ONGLET_UNIQUES[0].length,
  hauteur: DESSIN_ONGLET_UNIQUES.length,
  cases: DESSIN_ONGLET_UNIQUES.flatMap((ligne) => [...ligne].map((lettre) => COULEURS_ONGLET_UNIQUES[lettre] ?? null)),
};

/** Un rayon rangé : ce que vend la boutique du clan, ce que vendent les membres, et de quoi les réduire à une rareté. */
export interface RayonRange {
  /** Les objets de la boutique que le membre n'a pas, dans l'ordre du catalogue, pour le filtre retenu. */
  boutique: Entree[];
  /** Les offres des autres membres dans ce rayon, dans l'ordre du serveur, pour le filtre retenu. */
  offres: OffreLisible[];
  /** Combien d'objets à vendre par rareté, boutique et membres ensemble, sans filtre. */
  comptes: Record<RareteDObjet, number>;
  /** Tout ce qui se vend dans le rayon, sans filtre. */
  total: number;
  /** Le filtre qui s'applique vraiment : une rareté sans objet remontre tout. */
  retenu: Filtre;
}

/**
 * Un rayon de la boutique : les objets du catalogue que le membre n'a pas (d'après `possede`) et les offres des autres
 * membres pour cet emplacement, réduits ensemble par le filtre.
 */
export function rangerLaBoutique(rayon: RayonObjet, possede: (id: string) => number, offres: readonly OffreLisible[], filtre: Filtre | undefined): RayonRange {
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

/** Combien d'offres d'autres membres attendent dans chaque rayon d'objets (une bannière ne se revend pas). */
export function offresParRayon(offres: readonly OffreLisible[]): Record<RayonObjet, number> {
  const comptes = Object.fromEntries(RAYONS_OBJETS.map((rayon) => [rayon, 0])) as Record<RayonObjet, number>;
  for (const offre of offres) if (!offre.a_moi && offre.emplacement in comptes) comptes[offre.emplacement as RayonObjet] += 1;
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
export function rayonDOuverture(offres: readonly OffreLisible[], versLeMarche: boolean): RayonObjet {
  const comptes = offresParRayon(offres);
  return (versLeMarche ? RAYONS_OBJETS.find((rayon) => comptes[rayon] > 0) : undefined) ?? RAYONS_OBJETS[0];
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
