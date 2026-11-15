/**
 * Les familiers du Gaulois (demande du pilote, 15 novembre 2026 : « des pets pour les gaulois obtenables uniquement en
 * pochettes prix min 2000 », puis « 100 variantes de pets que je choisis, avec Fable 5.2 », puis « des pets beaucoup plus
 * détaillés et de toutes les tailles »). Un familier est un animal ou une créature en pixels qui se tient à côté du
 * Gaulois, au même grain que lui : une case du familier vaut une case du Gaulois. Il va de la souris (une dizaine de
 * cases) à la bête aussi haute que le Gaulois (64 cases).
 *
 * Une grille s'écrit comme celles du Gaulois (`gaulois.ts`) : rangée par rangée, « . » pour une case vide, une lettre par
 * couleur. Une minuscule est la couleur, sa majuscule son ombre ; la lumière vient d'en haut à gauche. Le contour est `k`.
 * Les couleurs sont celles du Gaulois (`FIXES` de `gaulois.ts`, sans la peau ni les cheveux), puis celles du familier
 * (`couleurs`), qui l'emportent ; seul `k`, le contour, ne se remplace pas.
 *
 * La grille fait toujours FAMILIER_LARGEUR cases sur FAMILIER_HAUTEUR : le familier se tient à droite du Gaulois, tourné
 * vers lui (vers la gauche), les pattes sur la dernière rangée, celle des pieds du Gaulois. Un familier qui vole flotte
 * plus haut, sans ombre au sol. Pour le poser, son dessin est rogné à son cadre (`familierAPoser`) et placé à
 * ECART_DU_FAMILIER case de la grille du Gaulois, chaque rangée à la même hauteur que celle du Gaulois (`gauloisEtFamilier`
 * sur le site, `imageDeLaScene` de `gaulois.ts` pour /gaulois).
 *
 * Les familiers ne s'obtiennent que dans la pochette des familiers (migration 20261115000800_familiers_du_gaulois) : le
 * serveur garde sa propre liste, qu'un test garde identique à `FAMILIERS`.
 *
 * Un fichier de lot n'importe d'ici que des types : ses couleurs s'écrivent en clair, pour qu'aucun import ne tourne en rond.
 */
import { couleursDeBase, ECART_DU_FAMILIER, TENUE_DE_DEPART, type Rarete } from "../gaulois.ts";

export { ECART_DU_FAMILIER };

export const FAMILIER_LARGEUR = 64;
export const FAMILIER_HAUTEUR = 64;
/** Le nombre de couleurs d'un familier, contour compris, au plus. */
export const FAMILIER_COULEURS_MAX = 18;

/** Les classes de taille, d'après le plus grand côté du dessin (largeur ou hauteur), en cases. */
export const TAILLES = [
  { id: "minuscule", nom: "Minuscule", jusqua: 18 },
  { id: "petit", nom: "Petit", jusqua: 30 },
  { id: "moyen", nom: "Moyen", jusqua: 44 },
  { id: "grand", nom: "Grand", jusqua: 56 },
  { id: "geant", nom: "Géant", jusqua: 64 },
] as const;
export type Taille = (typeof TAILLES)[number]["id"];

/** Un familier proposé : son identifiant, son nom, sa famille (pour ranger la galerie), sa rareté, ses couleurs, sa grille. */
export interface Familier {
  /** De 1 à 40 lettres minuscules sans accent et tirets, la première une lettre (règle du serveur pour les objets). */
  id: string;
  /** Son nom en français, court : « Chouette des neiges », « Renardeau roux ». */
  nom: string;
  /** Sa famille, pour la galerie : « Ferme », « Forêt », « Ciel et eaux », « Légendes », « Drôles ». */
  famille: string;
  rarete: Rarete;
  /** Les couleurs propres au familier, par lettre de la grille : « #rrggbb ». */
  couleurs?: Readonly<Record<string, string>>;
  /** FAMILIER_HAUTEUR rangées de FAMILIER_LARGEUR cases. */
  dessin: readonly string[];
}

/** Les lettres de la peau et des cheveux du Gaulois : un familier ne les emprunte pas, il les nomme dans `couleurs` s'il s'en sert. */
const LETTRES_DU_GAULOIS = ["s", "S", "t", "T", "h", "H"] as const;

/** Les couleurs d'un familier : celles du Gaulois sans sa peau ni ses cheveux, puis les siennes ; le contour reste le contour. */
export function couleursDuFamilier(familier: Familier): Readonly<Record<string, string>> {
  const base: Record<string, string> = { ...couleursDeBase(TENUE_DE_DEPART) };
  for (const lettre of LETTRES_DU_GAULOIS) delete base[lettre];
  const contour = base["k"];
  return { ...base, ...(familier.couleurs ?? {}), ...(contour ? { k: contour } : {}) };
}

/** Le familier case par case, rangée par rangée : FAMILIER_LARGEUR × FAMILIER_HAUTEUR couleurs, `null` pour une case vide. */
export function casesDuFamilier(familier: Familier): (string | null)[] {
  const couleurs = couleursDuFamilier(familier);
  const cases: (string | null)[] = [];
  for (let y = 0; y < FAMILIER_HAUTEUR; y++) {
    const ligne = familier.dessin[y] ?? "";
    for (let x = 0; x < FAMILIER_LARGEUR; x++) {
      const lettre = ligne[x] ?? ".";
      cases.push(lettre === "." ? null : (couleurs[lettre] ?? null));
    }
  }
  return cases;
}

/** Le cadre du dessin : ses cases pleines les plus à gauche, à droite, en haut et en bas ; `null` pour une grille vide. */
export function cadreDuFamilier(familier: Familier): { gauche: number; droite: number; haut: number; bas: number } | null {
  let gauche = FAMILIER_LARGEUR;
  let droite = -1;
  let haut = FAMILIER_HAUTEUR;
  let bas = -1;
  familier.dessin.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      if (ligne[x] === ".") continue;
      gauche = Math.min(gauche, x);
      droite = Math.max(droite, x);
      haut = Math.min(haut, y);
      bas = Math.max(bas, y);
    }
  });
  return droite < 0 ? null : { gauche, droite, haut, bas };
}

/** La taille du dessin en cases et sa classe (`TAILLES`), d'après son plus grand côté. */
export function tailleDuFamilier(familier: Familier): { largeur: number; hauteur: number; classe: Taille } {
  const cadre = cadreDuFamilier(familier);
  const largeur = cadre ? cadre.droite - cadre.gauche + 1 : 0;
  const hauteur = cadre ? cadre.bas - cadre.haut + 1 : 0;
  const cote = Math.max(largeur, hauteur);
  const classe: Taille = TAILLES.find((taille) => cote <= taille.jusqua)?.id ?? "geant";
  return { largeur, hauteur, classe };
}

const ID = /^[a-z][a-z-]{0,39}$/;
const HEX = /^#[0-9a-f]{6}$/;
const RARETES_CONNUES = ["commun", "peu-commun", "epique", "mystique", "legendaire"];

/** Ce qui ne va pas dans un familier, en mots ; une liste vide s'il est bon. */
export function defautsDuFamilier(familier: Familier): string[] {
  const defauts: string[] = [];
  if (!ID.test(familier.id)) defauts.push(`identifiant « ${familier.id} » : lettres minuscules sans accent et tirets, 40 au plus`);
  if (!familier.nom.trim()) defauts.push("nom vide");
  if (!familier.famille.trim()) defauts.push("famille vide");
  if (!RARETES_CONNUES.includes(familier.rarete)) defauts.push(`rareté inconnue « ${familier.rarete} »`);
  for (const [lettre, couleur] of Object.entries(familier.couleurs ?? {})) {
    if (lettre.length !== 1 || lettre === "." || lettre === "k") defauts.push(`couleur « ${lettre} » : une seule lettre, ni « . » ni « k »`);
    if (!HEX.test(couleur)) defauts.push(`couleur « ${lettre} » : « ${couleur} » n'est pas « #rrggbb » en minuscules`);
  }
  if (familier.dessin.length !== FAMILIER_HAUTEUR) defauts.push(`${familier.dessin.length} rangées au lieu de ${FAMILIER_HAUTEUR}`);
  const couleurs = couleursDuFamilier(familier);
  const inconnues = new Set<string>();
  let pleines = 0;
  familier.dessin.forEach((ligne, y) => {
    if (ligne.length !== FAMILIER_LARGEUR) defauts.push(`rangée ${y} : ${ligne.length} cases au lieu de ${FAMILIER_LARGEUR}`);
    for (const lettre of ligne) {
      if (lettre === ".") continue;
      pleines++;
      if (!couleurs[lettre]) inconnues.add(lettre);
    }
  });
  if (inconnues.size) defauts.push(`lettres sans couleur : ${[...inconnues].join(" ")}`);
  if (pleines < 30) defauts.push(`seulement ${pleines} cases pleines`);
  const teintes = new Set(familier.dessin.flatMap((ligne) => [...ligne].filter((lettre) => lettre !== ".").map((lettre) => couleurs[lettre])));
  if (teintes.size > FAMILIER_COULEURS_MAX) defauts.push(`${teintes.size} couleurs, ${FAMILIER_COULEURS_MAX} au plus`);
  return defauts;
}

/**
 * Un familier prêt à poser à côté du Gaulois : son dessin rogné à son cadre, la rangée de son haut dans sa grille (pour
 * garder la hauteur d'un familier qui vole), et s'il touche le sol (sa dernière rangée est celle des pattes), pour l'ombre.
 */
export interface FamilierAPoser {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
  haut: number;
  auSol: boolean;
}

/** Le familier rogné à son cadre ; `null` pour une grille vide. */
export function familierAPoser(familier: Familier): FamilierAPoser | null {
  const cadre = cadreDuFamilier(familier);
  if (!cadre) return null;
  const toutes = casesDuFamilier(familier);
  const cases: (string | null)[] = [];
  for (let y = cadre.haut; y <= cadre.bas; y++) {
    for (let x = cadre.gauche; x <= cadre.droite; x++) cases.push(toutes[y * FAMILIER_LARGEUR + x] ?? null);
  }
  return { largeur: cadre.droite - cadre.gauche + 1, hauteur: cadre.bas - cadre.haut + 1, cases, haut: cadre.haut, auSol: cadre.bas === FAMILIER_HAUTEUR - 1 };
}

/**
 * Le Gaulois et son familier sur une seule grille, pour le site : le Gaulois à gauche (ses `GAULOIS_LARGEUR` cases), puis
 * ECART_DU_FAMILIER case, puis le familier, chaque rangée du familier à la même hauteur que celle du Gaulois. Sans familier,
 * la grille du Gaulois seule.
 */
export function gauloisEtFamilier(
  gaulois: readonly (string | null)[],
  familier: FamilierAPoser | null,
  largeurGaulois = 48,
  hauteurGaulois = 64,
): { largeur: number; hauteur: number; cases: (string | null)[] } {
  if (!familier) return { largeur: largeurGaulois, hauteur: hauteurGaulois, cases: [...gaulois] };
  const largeur = largeurGaulois + ECART_DU_FAMILIER + familier.largeur;
  const cases: (string | null)[] = new Array<string | null>(largeur * hauteurGaulois).fill(null);
  for (let y = 0; y < hauteurGaulois; y++) {
    for (let x = 0; x < largeurGaulois; x++) cases[y * largeur + x] = gaulois[y * largeurGaulois + x] ?? null;
  }
  const gauche = largeurGaulois + ECART_DU_FAMILIER;
  for (let y = 0; y < familier.hauteur; y++) {
    const rangee = familier.haut + y;
    if (rangee < 0 || rangee >= hauteurGaulois) continue;
    for (let x = 0; x < familier.largeur; x++) {
      const couleur = familier.cases[y * familier.largeur + x];
      if (couleur) cases[rangee * largeur + gauche + x] = couleur;
    }
  }
  return { largeur, hauteur: hauteurGaulois, cases };
}
