/**
 * Le tambour des pochettes, choisi par le pilote le 15 novembre 2026 parmi dix roues essayées dans une galerie (« je
 * préfère le 4 tambour ») : à l'ouverture d'une pochette, de vrais objets (ou de vrais familiers) défilent sur un cylindre,
 * ralentissent, et celui qui s'arrête au milieu est celui que le serveur a tiré. Ici, les calculs ; le dessin est dans
 * `src/components/village/Tambour.tsx`.
 *
 * Le tambour ne triche pas. Le serveur tire d'abord ; le tambour ne tourne qu'avec sa réponse, posée d'avance à la rangée
 * où il s'arrêtera. Chaque autre rangée qui passe est tirée aux chances réelles de la pochette, comme le serveur tire : la
 * rareté selon les chances qu'il donne (une rareté sans rien à donner est sautée), puis une de ses valeurs à chances
 * égales. Ce qu'on voit défiler ressemble donc à ce que la pochette donne vraiment, sans rangée arrangée pour faire croire
 * qu'on a frôlé mieux. L'animation ne change rien au tirage.
 */
import { OBJETS, ORDRE_RARETES, ORDRE_RARETES_DES_OBJETS, type Catalogue, type Rarete, type RareteDObjet } from "../gaulois";
import { objetsDeLaPochette } from "./boutique";
import type { RefObjet } from "./contrat";
import { FAMILIERS, chancesPourMoi, type Familier } from "./familiers";

/** Des chances par rareté : celles d'une pochette à cinq raretés, ou celles de la pochette surprise, divin compris. Une rareté absente vaut 0. */
type Valeurs = Readonly<Record<Rarete, number>> & { readonly divin?: number; readonly saison?: number };
const chanceDe = (chances: Valeurs, rarete: RareteDObjet): number => Math.max(0, chances[rarete] ?? 0);

/** Une rangée du tambour : ce qu'elle montre, et sa rareté. */
export interface Rangee<T> {
  valeur: T;
  rarete: RareteDObjet;
}

/** Les rangées d'un tour de tambour : `depart` est au milieu quand il commence, `cible` (le résultat) quand il s'arrête. */
export interface Bande<T> {
  rangees: Rangee<T>[];
  depart: number;
  cible: number;
}

/** Le nombre de rangées qui défilent entre le départ et le résultat. */
export const COURSE_DU_TAMBOUR = 34;
/** La rangée au milieu du tambour avant qu'il tourne : trois rangées sont déjà visibles au-dessus d'elle. */
export const DEPART_DU_TAMBOUR = 3;
/** La rangée du résultat, la dernière qui passe au milieu. Trois rangées la suivent, pour que le tambour arrêté soit plein. */
export const CIBLE_DU_TAMBOUR = DEPART_DU_TAMBOUR + COURSE_DU_TAMBOUR;
/** La durée d'un tour, en millisecondes. */
export const DUREE_DU_TAMBOUR = 6000;
/**
 * La durée de la fête qui suit l'arrêt, en millisecondes : après, le tambour ne bouge plus. Moins de cinq secondes, parce
 * qu'à ce moment la fenêtre n'a plus de bouton pour l'arrêter (WCAG 2.2.2).
 */
export const DUREE_DE_LA_FETE = 4800;

/**
 * Une rareté tirée selon des chances (en pour cent ou dans toute autre unité positive), par un nombre `u` de 0 à 1 : les
 * raretés se suivent dans l'ordre, chacune sur une longueur égale à sa chance. `null` si aucune chance n'est positive.
 */
export function rareteSelon(chances: Valeurs, u: number): RareteDObjet | null {
  const total = ORDRE_RARETES_DES_OBJETS.reduce((somme, rarete) => somme + chanceDe(chances, rarete), 0);
  if (!(total > 0)) return null;
  let reste = Math.min(Math.max(u, 0), 1) * total;
  let derniere: RareteDObjet | null = null;
  for (const rarete of ORDRE_RARETES_DES_OBJETS) {
    const chance = chanceDe(chances, rarete);
    if (chance <= 0) continue;
    derniere = rarete;
    if (reste < chance) return rarete;
    reste -= chance;
  }
  return derniere;
}

/**
 * Une rangée tirée comme le serveur tire : la rareté selon `chances`, en sautant celles qui n'ont rien à donner (les autres
 * se partagent leurs chances à proportion), puis une des valeurs de cette rareté, à chances égales. `null` si rien ne peut sortir.
 */
export function rangeeAuHasard<T>(chances: Valeurs, valeursDe: (rarete: RareteDObjet) => readonly T[], hasard: () => number): Rangee<T> | null {
  const possibles = Object.fromEntries(ORDRE_RARETES_DES_OBJETS.map((rarete) => [rarete, valeursDe(rarete).length > 0 ? chanceDe(chances, rarete) : 0])) as Record<RareteDObjet, number>;
  const rarete = rareteSelon(possibles, hasard());
  if (!rarete) return null;
  const valeurs = valeursDe(rarete);
  const valeur = valeurs[Math.min(valeurs.length - 1, Math.floor(hasard() * valeurs.length))];
  return valeur === undefined ? null : { valeur, rarete };
}

/** La bande d'un tour : des rangées tirées par `tirer`, et le résultat à la place `CIBLE_DU_TAMBOUR`. */
export function bandeDuTambour<T>(resultat: Rangee<T>, tirer: () => Rangee<T> | null): Bande<T> {
  const rangees = Array.from({ length: CIBLE_DU_TAMBOUR + 4 }, (_, i) => (i === CIBLE_DU_TAMBOUR ? resultat : (tirer() ?? resultat)));
  return { rangees, depart: DEPART_DU_TAMBOUR, cible: CIBLE_DU_TAMBOUR };
}

/** La bande de la pochette surprise : les objets payants du catalogue, aux chances de la pochette ; l'objet tiré au bout. */
export function bandeDeLaPochette(tire: RefObjet & { rarete: RareteDObjet }, chances: Valeurs, hasard: () => number = Math.random, catalogue: Catalogue = OBJETS): Bande<RefObjet> {
  const parRarete = Object.fromEntries(ORDRE_RARETES_DES_OBJETS.map((rarete) => [rarete, objetsDeLaPochette(rarete, catalogue)])) as Record<RareteDObjet, RefObjet[]>;
  return bandeDuTambour(
    {
      valeur: { emplacement: tire.emplacement, objet: tire.objet },
      rarete: tire.rarete,
    },
    () => rangeeAuHasard(chances, (rarete) => parRarete[rarete], hasard),
  );
}

/**
 * La bande de la pochette des familiers, pour un compte : seulement les familiers qu'il n'avait pas avant d'ouvrir (la
 * pochette ne donne jamais un familier déjà reçu), aux chances qu'elle avait pour lui (`chancesPourMoi`) ; le familier reçu au bout.
 */
export function bandeDesFamiliers(recu: Familier, chances: Valeurs, possedes: ReadonlySet<string>, hasard: () => number = Math.random, liste: readonly Familier[] = FAMILIERS): Bande<Familier> {
  const parRarete = Object.fromEntries(ORDRE_RARETES.map((rarete) => [rarete, liste.filter((f) => f.rarete === rarete && !possedes.has(f.id))])) as Partial<Record<string, Familier[]>>;
  const pourMoi = chancesPourMoi(chances, possedes, liste) ?? chances;
  return bandeDuTambour({ valeur: recu, rarete: recu.rarete }, () => rangeeAuHasard(pourMoi, (rarete) => parRarete[rarete] ?? [], hasard));
}

// La vitesse du tambour, de 0 à 1 du temps : elle monte en douceur (un quart de sinus sur les 8 premiers centièmes), puis
// décroît comme (1 − s) puissance 2,6 jusqu'à zéro. Le chemin est l'intégrale de cette vitesse, ramenée de 0 à 1 : un départ
// sans à-coup, une longue fin qui ralentit, un arrêt sans rebond (les animations du site restent calmes).
const MONTEE = 0.08;
const FREIN = 2.6;
const PAS = 800;
const CHEMIN: readonly number[] = (() => {
  const vitesse = (u: number): number => (u < MONTEE ? Math.sin(((u / MONTEE) * Math.PI) / 2) : Math.pow(1 - (u - MONTEE) / (1 - MONTEE), FREIN));
  const chemin = [0];
  for (let i = 1; i <= PAS; i++) chemin.push((chemin[i - 1] ?? 0) + (vitesse((i - 1) / PAS) + vitesse(i / PAS)) / 2);
  const total = chemin[PAS] ?? 1;
  return chemin.map((d) => d / total);
})();

/** La part du chemin faite au temps `u` (de 0 au début à 1 à l'arrêt). */
export function cheminDuTambour(u: number): number {
  if (!(u > 0)) return 0;
  if (u >= 1) return 1;
  const x = u * PAS;
  const i = Math.floor(x);
  const a = CHEMIN[i] ?? 1;
  const b = CHEMIN[i + 1] ?? 1;
  return a + (b - a) * (x - i);
}

/** La position du tambour, en rangées, `ecoule` millisecondes après son départ. */
export function positionDuTambour(bande: Pick<Bande<unknown>, "depart" | "cible">, ecoule: number, duree: number = DUREE_DU_TAMBOUR): number {
  return bande.depart + (bande.cible - bande.depart) * cheminDuTambour(duree > 0 ? ecoule / duree : 1);
}
