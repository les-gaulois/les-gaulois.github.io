/**
 * Les Gaulois uniques (demande du pilote, 15 novembre 2026 : « je veux que tu me crées des Gaulois uniques (lézard),
 * (dragon), (axolotl), (ovni), (golem)… sors-moi 15 modèles faits par Fable 5.2, bien travaillés », puis, sur la galerie,
 * « j'aime pas le champignon, l'esprit du chêne, la grenouille et le golem ; tu peux les mettre en pochette dédiée et en
 * boutique »). Un modèle remplace le corps humain du Gaulois (la grille `CORPS` de `gaulois.ts`) par celui d'une créature,
 * au même grain et à la même place : le Gaulois lézard garde ses objets, son visage, ses cheveux et sa barbe, posés
 * par-dessus comme sur le corps humain. Rien ne change pour les objets : ils sont dessinés une fois pour tous les corps.
 *
 * Le modèle porté est une clé de la tenue, `modele`, absente pour le corps humain : partout où le Gaulois d'un membre se
 * dessine (vestiaire, compagnon, /gaulois, images du robot), `casesDuGaulois` le lit sans rien d'autre.
 *
 * Une grille s'écrit comme celles du Gaulois : rangée par rangée, 48 cases de large, « . » pour une case vide, une lettre par
 * couleur. Une minuscule est la couleur, sa majuscule son ombre ; la lumière vient d'en haut à gauche. Le contour est `k`,
 * celui des objets, qui ne se remplace pas.
 *
 * Les couleurs du modèle ne valent que pour sa grille, sauf quatre qui passent aux calques posés dessus : `s` et `S` (sa
 * peau, que reprennent les objets qui laissent voir la peau) et `t` et `T` (la cicatrice, tissu clair et trait sombre).
 * Les autres lettres du modèle peuvent reprendre celles des objets (`g`, `m`…) sans rien changer aux objets ; sans les
 * nommer, il emploie les couleurs des objets (`FIXES` de `gaulois.ts`) et `h`/`H`, la couleur de cheveux choisie.
 *
 * Ce fichier ne contient que des types et des constantes : `gaulois.ts` l'importe, un lot n'en importe que des types.
 */
import type { Calque } from "../gaulois.ts";

/** Un modèle unique : une créature à la place du corps humain. */
export interface ModeleDuGaulois {
  /** De 1 à 40 lettres minuscules sans accent et tirets, la première une lettre (règle du serveur pour les objets). */
  id: string;
  /** Son nom en français, court : « Lézard », « Gaulois de magma ». */
  nom: string;
  /** Une phrase qui le décrit pour qui ne voit pas l'image : son texte de remplacement. */
  description: string;
  /** Sa grille : `y` est sa première rangée sur la grille de 48 × 64 ; la dernière rangée ne dépasse pas 63. */
  corps: Calque;
  /** Ses couleurs, par lettre : « #rrggbb ». `s`, `S`, `t` et `T` sont obligatoires ; `k` est interdit. */
  couleurs: Readonly<Record<string, string>>;
}

/** Le nombre de couleurs d'un modèle, contour compris, au plus. */
export const MODELE_COULEURS_MAX = 22;

/** Les lettres que le modèle donne aussi aux calques posés sur lui. */
export const LETTRES_PARTAGEES = ["s", "S", "t", "T"] as const;

/** La clé de la tenue qui porte le modèle ; absente, le Gaulois a le corps humain. */
export const CLE_DU_MODELE = "modele";

/**
 * Les raretés des Gaulois uniques, de la plus courante à la plus rare : les cinq de la boutique. Une rareté ajoutée plus
 * tard aux objets (comme le divin d'une autre session) ne change ni leurs prix, ni leur pochette, ni leur lecture.
 */
export const RARETES_DES_GAULOIS_UNIQUES = ["commun", "peu-commun", "epique", "mystique", "legendaire"] as const;
export type RareteDUnique = (typeof RARETES_DES_GAULOIS_UNIQUES)[number];
