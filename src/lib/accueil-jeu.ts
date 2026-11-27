/**
 * Le jeu des Gaulois sur l'accueil (22 novembre 2026, demande du pilote : « mettre en valeur les Gaulois (le jeu) […] donner
 * envie au joueur de s'empresser de créer son Gaulois » ; il a retenu deux maquettes, « Le booster sur la table » et « Du
 * commun au divin »). Ce module ne fait que choisir et compter, à partir des Gaulois que la construction a relevés (les
 * mêmes que la vitrine des visiteurs de « Mon Gaulois », src/lib/village/vitrine-publique.ts) et du catalogue du jeu :
 * aucun Gaulois, aucune rareté ni aucun nombre n'est inventé. Les écrans sont dans src/components/accueil/.
 */
import type { PortraitDeGaulois } from "./gaulois-site";
import { STATERES_PAR_POINT } from "./stateres";

/** Les raretés qu'un Gaulois peut porter, de la plus simple à la plus haute (le légendaire de saison compte pour légendaire). */
export const RARETES_DE_L_ECHELLE = ["commun", "peu-commun", "epique", "mystique", "legendaire", "divin"] as const;
export type RareteDeLEchelle = (typeof RARETES_DE_L_ECHELLE)[number];

/** Les noms des raretés, comme le jeu les écrit. */
export const NOMS_DES_RARETES: Readonly<Record<RareteDeLEchelle, string>> = {
  commun: "Commun",
  "peu-commun": "Peu commun",
  epique: "Épique",
  mystique: "Mystique",
  legendaire: "Légendaire",
  divin: "Divin",
};

/** Un Gaulois montré sur l'accueil : celui d'un membre au pseudo public, tel que la construction l'a relevé. */
export interface GauloisDeLAccueil {
  id: string;
  pseudo: string;
  /** Les victoires sous le tag, de la liste officielle ; `null` : pas de données. */
  victoires: number | null;
  /** La rareté la plus haute qu'il porte (`rareteDuCadre`), ou `null` s'il n'en porte aucune (aucun objet à rareté). */
  rarete: string | null;
}

/** Un Gaulois tel que l'accueil le pose : son image relevée (src/lib/gaulois-site.ts) et la bannière choisie par le membre. */
export interface GauloisMontre extends GauloisDeLAccueil {
  banniere: string | null;
  portrait: PortraitDeGaulois;
}

/** Le rang d'une rareté dans l'échelle, ou -1 pour une rareté inconnue ou absente. */
export const rangDeRarete = (rarete: string | null): number => (rarete === null ? -1 : RARETES_DE_L_ECHELLE.indexOf(rarete as RareteDeLEchelle));

/** Une marche de l'échelle « Du commun au divin » : une rareté, et le Gaulois d'un membre qui la porte. */
export interface MarcheDeLEchelle<G extends GauloisDeLAccueil = GauloisDeLAccueil> {
  rarete: RareteDeLEchelle;
  nom: string;
  gaulois: G;
}

/**
 * L'échelle des raretés : pour chaque rareté, du commun au divin, le Gaulois du membre qui a le plus de victoires parmi ceux
 * dont c'est la rareté la plus haute portée (à égalité, l'ordre reçu, celui de la vitrine). Une rareté que personne ne porte
 * n'a pas de marche : l'échelle ne montre que de vrais Gaulois.
 */
export function echelleDesRaretes<G extends GauloisDeLAccueil>(gaulois: readonly G[]): MarcheDeLEchelle<G>[] {
  return RARETES_DE_L_ECHELLE.flatMap((rarete): MarcheDeLEchelle<G>[] => {
    let meilleur: G | null = null;
    for (const g of gaulois) {
      if (g.rarete !== rarete) continue;
      if (meilleur === null || (g.victoires ?? -1) > (meilleur.victoires ?? -1)) meilleur = g;
    }
    return meilleur ? [{ rarete, nom: NOMS_DES_RARETES[rarete], gaulois: meilleur }] : [];
  });
}

/**
 * Les Gaulois posés de chaque côté du booster d'essai : les plus hautes raretés portées d'abord, puis le plus de victoires,
 * jamais deux fois le même membre. Un Gaulois sans rareté (aucun objet à rareté porté) n'y paraît pas.
 */
export function gauloisEnVedette<G extends GauloisDeLAccueil>(gaulois: readonly G[], combien = 2): G[] {
  return gaulois
    .map((g, ordre) => ({ g, ordre }))
    .filter(({ g }) => rangDeRarete(g.rarete) >= 0)
    .sort((a, b) => rangDeRarete(b.g.rarete) - rangDeRarete(a.g.rarete) || (b.g.victoires ?? -1) - (a.g.victoires ?? -1) || a.ordre - b.ordre)
    .slice(0, combien)
    .map(({ g }) => g);
}

/** Ce que le catalogue du jeu contient, compté par la page à la construction. */
export interface CatalogueDuJeu {
  /** Les objets de la garde-robe : leur rareté (ou `null`) et s'ils sont donnés à tous. */
  objets: readonly { rarete: string | null; gratuit?: boolean }[];
  familiers: number;
  uniques: number;
  bannieres: number;
  cadres: number;
}

/** Un nombre du jeu, écrit sous son icône. */
export interface NombreDuJeu {
  cle: "objets" | "familiers" | "uniques" | "bannieres" | "cadres";
  n: number;
  mot: string;
}

/**
 * Les nombres du jeu à collectionner : les objets à rareté qui ne sont pas donnés à tous, les familiers, les Gaulois
 * uniques, les bannières et les cadres. Un nombre nul n'est pas écrit.
 */
export function nombresDuJeu(c: CatalogueDuJeu): NombreDuJeu[] {
  const objets = c.objets.filter((o) => o.rarete !== null && !o.gratuit).length;
  const tous: NombreDuJeu[] = [
    { cle: "objets", n: objets, mot: objets > 1 ? "objets" : "objet" },
    { cle: "familiers", n: c.familiers, mot: c.familiers > 1 ? "familiers" : "familier" },
    { cle: "uniques", n: c.uniques, mot: c.uniques > 1 ? "Gaulois uniques" : "Gaulois unique" },
    { cle: "bannieres", n: c.bannieres, mot: c.bannieres > 1 ? "bannières" : "bannière" },
    { cle: "cadres", n: c.cadres, mot: c.cadres > 1 ? "cadres" : "cadre" },
  ];
  return tous.filter((x) => x.n > 0);
}

/**
 * Les statères des points rapportés au clan, la règle du jeu : 60 par point depuis le 27 novembre 2026 (30 avant), repris de
 * `stateres.ts` pour que l'exemple suive toujours la vraie règle (CLAUDE.md, « Le village des Gaulois »).
 */
export { STATERES_PAR_POINT };

/**
 * L'exemple de la bourse de « Du commun au divin », qui suit le défilement : `part` va de 0 à 1, les points de 0 à
 * `points`, et les statères suivent la règle. Ce n'est le solde de personne : l'écran le dit.
 */
export function bourseDExemple(part: number, points = 100): { points: number; stateres: number } {
  const p = Math.round(Math.min(1, Math.max(0, Number.isFinite(part) ? part : 0)) * points);
  return { points: p, stateres: p * STATERES_PAR_POINT };
}
