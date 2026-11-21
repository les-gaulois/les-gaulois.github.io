/**
 * Le kit en pixels dans la page : une planche devient une image (`data:` PNG) par une toile du navigateur, une fois, gardée
 * en mémoire. Sert aux mots et aux nombres qui changent (menu, chiffres de « Ma carte », pastilles) ; les images fixes du
 * kit viennent de `/village/kit.css`, faite à la construction (`kit-css.ts`).
 *
 * Les couleurs d'écriture qui changent avec le thème (`texte`, `doux`, `or`) donnent deux images, une par thème : la feuille
 * du jeu montre la bonne (`.jeu-px`, 16-jeu.css), sans rien redessiner quand le visiteur change de thème.
 */
import { ecrire, enCapitales, largeurDuTexte } from "./ecriture";
import { compteur, etiquette } from "./pieces";
import type { TonDEtiquette } from "./palette";
import type { Planche } from "./planche";

const URLS = new Map<string, string>();

/** L'image d'une planche, en adresse `data:` ; `cle` la garde en mémoire. Chaîne vide hors d'un navigateur. */
export function urlDeLaPlanche(cle: string, fabriquer: () => Planche): string {
  const deja = URLS.get(cle);
  if (deja !== undefined) return deja;
  if (typeof document === "undefined") return "";
  const p = fabriquer();
  const toile = document.createElement("canvas");
  toile.width = p.width;
  toile.height = p.height;
  const g = toile.getContext("2d");
  if (!g) return "";
  g.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  const url = `url("${toile.toDataURL()}")`;
  URLS.set(cle, url);
  return url;
}

/** Les couleurs de l'écriture en pixels : les trois premières suivent le thème du site. */
export const COULEURS_D_ECRITURE = {
  texte: { clair: "#0a1230", sombre: "#f6f1e3" },
  doux: { clair: "#3d4a80", sombre: "#aab6e8" },
  or: { clair: "#8a5a00", sombre: "#ffd84a" },
  creme: "#f6f1e3",
  orvif: "#ffd84a",
  encre: "#231503",
  rouge: "#e0263a",
  marine: "#0a1230",
  // Les raretés, pour les boosters (21 novembre 2026, Claude Fable 5.2) : les jetons --rarete-*-texte du site, clair et
  // sombre ; « rendu » : l'ardoise des statères rendus, qui n'est la couleur d'aucune rareté.
  commun: { clair: "#0b5cad", sombre: "#b5d8ff" },
  "peu-commun": { clair: "#2a3bc4", sombre: "#bcc5ff" },
  epique: { clair: "#6a1fd0", sombre: "#dcbcff" },
  mystique: { clair: "#a50f24", sombre: "#ffb5bd" },
  legendaire: { clair: "#7d5900", sombre: "#ffdd80" },
  divin: { clair: "#00706a", sombre: "#c4fff7" },
  rendu: { clair: "#3d4763", sombre: "#c3cbe0" },
} as const;
export type CouleurDEcriture = keyof typeof COULEURS_D_ECRITURE;

/** Le relief d'un mot : rien, une ombre d'une case dessous, ou un cerne d'encre tout autour (sur les boutons). */
export type ReliefDEcriture = "plat" | "ombre" | "cerne";

/** Un mot en pixels : son image au thème clair et au thème sombre (la même si sa couleur ne change pas), et sa taille en cases. */
export interface MotEnPixels {
  clair: string;
  sombre: string;
  largeur: number;
  hauteur: number;
}

/** Les images d'un mot (déjà en capitales), dans une couleur et un relief. */
export function motEnPixels(mot: string, couleur: CouleurDEcriture, relief: ReliefDEcriture = "plat"): MotEnPixels {
  const c = COULEURS_D_ECRITURE[couleur];
  const dessin = (coul: string): Planche => ecrire(mot, coul, relief === "ombre" ? "rgba(4,7,22,.75)" : null, relief === "cerne" ? "#070b1f" : null);
  const cle = (coul: string): string => `mot|${mot}|${coul}|${relief}`;
  const couleurClaire = typeof c === "string" ? c : c.clair;
  const clair = urlDeLaPlanche(cle(couleurClaire), () => dessin(couleurClaire));
  const sombre = typeof c === "string" ? clair : urlDeLaPlanche(cle(c.sombre), () => dessin(c.sombre));
  const cerne = relief === "cerne" ? 2 : 0;
  return { clair, sombre, largeur: largeurDuTexte(mot) + cerne, hauteur: 9 + cerne / 2 };
}

/** Un texte en mots en pixels : capitales, un mot par image (pour qu'il se plie à la ligne). */
export function texteEnPixels(texte: string, couleur: CouleurDEcriture, relief: ReliefDEcriture = "plat", plie = false): MotEnPixels[] {
  const t = enCapitales(texte).trim();
  return (plie ? t.split(/\s+/) : [t]).filter(Boolean).map((m) => motEnPixels(m, couleur, relief));
}

/** L'image d'une étiquette (« NOUVEAU », « 3 », « +90 ») et sa taille. */
export function etiquetteEnPixels(texte: string, ton: TonDEtiquette): { url: string; largeur: number; hauteur: number } {
  const t = enCapitales(texte);
  const p = etiquette(t, ton);
  return { url: urlDeLaPlanche(`etq|${t}|${ton}`, () => p), largeur: p.width, hauteur: p.height };
}

/** L'image du compteur des points et sa taille. */
export function compteurEnPixels(n: number): { url: string; largeur: number; hauteur: number } {
  const p = compteur(n);
  return { url: urlDeLaPlanche(`compteur|${Math.round(n)}`, () => p), largeur: p.width, hauteur: p.height };
}
