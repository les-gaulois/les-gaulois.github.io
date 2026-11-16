/**
 * L'album d'une pochette (16 novembre 2026, choix du pilote parmi cinq modèles : « l'album à loupe ») : quand le curseur
 * passe sur le dessin d'une pochette de « La boutique », ce qu'elle peut donner s'ouvre en petites cases, avec une loupe
 * qui montre en grand celle qu'on survole. La pochette surprise montre ses objets, rayon par rayon ; la pochette des
 * familiers, la ménagerie ; la pochette des bannières, ses trésors par rareté (`albumDesTresors` de `bannieres.ts`, chargé
 * à la demande) ; la pochette des Gaulois uniques, ses modèles par famille (`albumDesModeles` de `ecran-modeles.ts`).
 * C'est l'ordre des puces ; les cases, elles, se montrent toujours par rareté (`casesDuGroupe`).
 * Écran dans `src/components/village/AlbumPochette.tsx`.
 *
 * Des calculs purs : ce que contient chaque pochette pour ce compte, avec la chance de chaque élément calculée comme le
 * tirage du serveur (`chanceDeLObjet`, `chanceDuFamilier`), et la place du panneau près du dessin. Rien ne décide d'un
 * droit ni d'un tirage : les chances viennent de la réponse du serveur (`get_ma_boutique`, `get_mes_familiers`,
 * `get_mes_bannieres`, `get_mes_modeles`).
 */
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, ORDRE_RARETES_DES_OBJETS, RARETE_DIVINE, RARETES_DES_OBJETS, vignetteDeLObjet, type Catalogue, type Emplacement, type RareteDObjet } from "../gaulois";
import { chanceDeLObjet, objetsDeLaPochette, quantitePossedee } from "./boutique";
import type { MesFamiliers, ObjetPossede } from "./contrat";
import { pourcent } from "./ecran-boutique";
import { idsPossedes, silhouetteDuFamilier, surCombien, vignetteDuFamilier, type DessinEnCases } from "./ecran-familiers";
import { FAMILIERS, TAILLES, chanceDuFamilier, tailleDuFamilier, type Familier } from "./familiers";
import { TOUT } from "./vestiaire-rayons";

/** Le groupe « tout » de l'album : celui du filtre des rayons. */
export const TOUS = TOUT;

/** Une case de l'album : un objet, un familier, un trésor des bannières ou un Gaulois unique que la pochette peut donner. */
export interface ElementDeLAlbum {
  id: string;
  nom: string;
  rarete: RareteDObjet;
  /** Le rayon d'un objet, la famille d'un familier ou d'un Gaulois unique, la rareté d'un trésor : les puces de l'album. */
  groupe: string;
  /** Ce que la loupe écrit sous la rareté : le rayon, la famille et la taille, ou « Les trésors de la pochette ». */
  detail: string;
  /** Le dessin, rogné à son cadre ; la silhouette d'un familier que le compte n'a pas. `null` pour un dessin vide. */
  dessin: DessinEnCases | null;
  silhouette: boolean;
  /** Le compte l'a déjà. Un objet peut ressortir en double ; un familier, un trésor ou un Gaulois unique, jamais. */
  possede: boolean;
  /** Le familier que le compte montre à côté de son Gaulois. */
  montre: boolean;
  /** La chance, en pour cent, que la prochaine pochette de ce compte le donne ; 0 quand elle ne le peut plus. */
  chance: number;
}

/** Ce qu'une pochette peut donner, rangé pour l'album. */
export interface Album {
  titre: string;
  /** La ligne sous le titre : « 245 objets », « 12 sur 100 à vous ». */
  sous: string;
  /** Ce que disent les puces aux lecteurs d'écran : « Montrer un rayon », « Montrer une famille ». */
  libelleDesGroupes: string;
  elements: ElementDeLAlbum[];
}

const DESSINS_D_OBJETS = new Map<string, DessinEnCases | null>();

/** Un dessin sans ses rangées vides du haut et du bas : une vignette d'objet garde toute la hauteur du Gaulois. */
export function rognerLesRangees(dessin: DessinEnCases): DessinEnCases | null {
  const { largeur, hauteur, cases } = dessin;
  const pleine = (y: number): boolean => cases.slice(y * largeur, (y + 1) * largeur).some((c) => c !== null);
  let haut = 0;
  while (haut < hauteur && !pleine(haut)) haut++;
  if (haut === hauteur) return null;
  let bas = hauteur - 1;
  while (bas > haut && !pleine(bas)) bas--;
  return { largeur, hauteur: bas - haut + 1, cases: cases.slice(haut * largeur, (bas + 1) * largeur) };
}

/** Un dessin sans ses rangées ni ses colonnes vides : un Gaulois unique garde toute la grille du Gaulois. */
export function rognerLeDessin(dessin: DessinEnCases): DessinEnCases | null {
  const rangees = rognerLesRangees(dessin);
  if (!rangees) return null;
  const { largeur, hauteur, cases } = rangees;
  const pleine = (x: number): boolean => Array.from({ length: hauteur }, (_, y) => cases[y * largeur + x]).some((c) => c !== null && c !== undefined);
  let gauche = 0;
  while (!pleine(gauche)) gauche++;
  let droite = largeur - 1;
  while (droite > gauche && !pleine(droite)) droite--;
  const l = droite - gauche + 1;
  return { largeur: l, hauteur, cases: Array.from({ length: hauteur }, (_, y) => cases.slice(y * largeur + gauche, y * largeur + droite + 1)).flat() };
}

/** Le dessin d'un objet du catalogue pour l'album, rogné de tous les côtés. Calculé une fois par objet du vrai catalogue. */
function dessinDeLObjet(emplacement: Emplacement, objet: string, catalogue: Catalogue): DessinEnCases | null {
  const cle = `${emplacement}/${objet}`;
  if (catalogue === OBJETS && DESSINS_D_OBJETS.has(cle)) return DESSINS_D_OBJETS.get(cle) ?? null;
  const vignette = vignetteDeLObjet(emplacement, objet, undefined, catalogue);
  const dessin = vignette && rognerLesRangees(vignette);
  if (catalogue === OBJETS) DESSINS_D_OBJETS.set(cle, dessin);
  return dessin;
}

/** « 245 objets », « 1 objet ». */
const objets = (n: number): string => `${n} ${n > 1 ? "objets" : "objet"}`;

/**
 * La pochette surprise : tous les objets payants qu'elle peut donner, rayon par rayon (tête, haut, bas, pieds, arme), du
 * plus courant au plus rare dans chaque rayon. La chance de chacun : celle de sa rareté, partagée entre les objets payants
 * de cette rareté, comme le tirage (`chanceDeLObjet`). Un objet que le compte a déjà reste dans l'album, avec sa chance :
 * il peut ressortir en double. Les objets divins n'y sont que si la pochette peut les donner (un serveur d'avant le divin
 * ne leur donne aucune chance).
 */
export function albumDeLaPochetteSurprise(chances: Readonly<Record<RareteDObjet, number>>, inventaire: readonly ObjetPossede[], catalogue: Catalogue = OBJETS): Album {
  const elements: ElementDeLAlbum[] = [];
  for (const emplacement of EMPLACEMENTS_OBJETS) {
    for (const rarete of ORDRE_RARETES_DES_OBJETS) {
      if (rarete === RARETE_DIVINE && !(chances[rarete] > 0)) continue;
      for (const ref of objetsDeLaPochette(rarete, catalogue)) {
        if (ref.emplacement !== emplacement) continue;
        const fiche = catalogue[emplacement][ref.objet];
        if (!fiche) continue;
        elements.push({
          id: `${emplacement}/${ref.objet}`,
          nom: fiche.nom,
          rarete,
          groupe: NOMS_EMPLACEMENTS[emplacement],
          detail: NOMS_EMPLACEMENTS[emplacement],
          dessin: dessinDeLObjet(emplacement, ref.objet, catalogue),
          silhouette: false,
          possede: quantitePossedee(inventaire, emplacement, ref.objet) > 0,
          montre: false,
          chance: chanceDeLObjet(emplacement, ref.objet, chances, catalogue),
        });
      }
    }
  }
  return { titre: "Dans la pochette surprise", sous: objets(elements.length), libelleDesGroupes: "Montrer un rayon", elements };
}

/** Combien d'objets la pochette surprise peut donner : tous les objets payants, chacun une fois ; les divins, si elle peut les donner. */
export const nombreDansLaPochetteSurprise = (chances: Readonly<Record<RareteDObjet, number>>, catalogue: Catalogue = OBJETS): number =>
  ORDRE_RARETES_DES_OBJETS.reduce((n, rarete) => n + (rarete === RARETE_DIVINE && !(chances[rarete] > 0) ? 0 : objetsDeLaPochette(rarete, catalogue).length), 0);

/** Le nom d'une taille de familier : « Minuscule », « Géant »… */
const nomDeLaTaille = (familier: Familier): string => TAILLES.find((taille) => taille.id === tailleDuFamilier(familier).classe)?.nom ?? "";

/**
 * La pochette des familiers : la ménagerie, famille par famille dans l'ordre des dessins. Ceux du compte en couleur ; les
 * autres en silhouette, avec leur chance dans sa prochaine pochette (`chanceDuFamilier` : jamais un familier déjà reçu).
 */
export function albumDeLaMenagerie(mes: Pick<MesFamiliers, "familiers" | "porte" | "pochette">, liste: readonly Familier[] = FAMILIERS): Album {
  const possedes = idsPossedes(mes);
  const elements = liste.map((familier): ElementDeLAlbum => {
    const possede = possedes.has(familier.id);
    const taille = nomDeLaTaille(familier);
    return {
      id: familier.id,
      nom: familier.nom,
      rarete: familier.rarete,
      groupe: familier.famille,
      detail: taille ? `${familier.famille} · ${taille}` : familier.famille,
      dessin: possede ? vignetteDuFamilier(familier) : silhouetteDuFamilier(familier),
      silhouette: !possede,
      possede,
      montre: possede && mes.porte === familier.id,
      chance: chanceDuFamilier(familier.id, mes.pochette.chances, possedes, liste),
    };
  });
  return { titre: "La ménagerie", sous: `${surCombien(elements.filter((e) => e.possede).length, elements.length)} à vous`, libelleDesGroupes: "Montrer une famille", elements };
}

/** Un choix des puces de l'album : un groupe et son nombre de cases. */
export interface GroupeDeLAlbum {
  groupe: string;
  nom: string;
  nombre: number;
}

/** Les puces de l'album : « Tout », puis chaque groupe dans l'ordre où il paraît. */
export function groupesDeLAlbum(elements: readonly ElementDeLAlbum[]): GroupeDeLAlbum[] {
  const nombres = new Map<string, number>();
  for (const element of elements) nombres.set(element.groupe, (nombres.get(element.groupe) ?? 0) + 1);
  return [{ groupe: TOUS, nom: "Tout", nombre: elements.length }, ...[...nombres].map(([groupe, nombre]) => ({ groupe, nom: groupe, nombre }))];
}

/**
 * Les cases d'un groupe ; tout l'album pour « Tout » ou un groupe inconnu. Toujours rangées par rareté, de la plus courante
 * à la plus rare (demande du pilote, 16 novembre 2026) ; dans une rareté, l'ordre de l'album : les rayons de la pochette
 * surprise, les familles de la ménagerie. Les puces, elles, gardent l'ordre de l'album (`groupesDeLAlbum`).
 */
export function casesDuGroupe(elements: readonly ElementDeLAlbum[], groupe: string): readonly ElementDeLAlbum[] {
  const choisis = elements.filter((element) => element.groupe === groupe);
  const cases = groupe === TOUS || choisis.length === 0 ? elements : choisis;
  // Le tri de JavaScript garde l'ordre des cases de même rareté.
  return [...cases].sort((a, b) => RARETES_DES_OBJETS[a.rarete].rang - RARETES_DES_OBJETS[b.rarete].rang);
}

/**
 * Ce que la loupe montre à l'ouverture : le plus rare que la pochette peut encore donner à ce compte, le premier dans
 * l'ordre de l'album ; sinon la première case. `null` pour un album vide.
 */
export function premiereALaLoupe(elements: readonly ElementDeLAlbum[]): ElementDeLAlbum | null {
  let choisi: ElementDeLAlbum | null = null;
  for (const element of elements) {
    if (element.chance <= 0) continue;
    if (!choisi || RARETES_DES_OBJETS[element.rarete].rang > RARETES_DES_OBJETS[choisi.rarete].rang) choisi = element;
  }
  return choisi ?? elements[0] ?? null;
}

/**
 * Ce que la case dit à un lecteur d'écran, comme la loupe le montre : « Licorne, Mystique, Légendes, Grand, 0,53 % de
 * chance », « Loup gris, Épique, Forêt, Moyen, à vous ».
 */
export function decrireLaCase(element: ElementDeLAlbum): string {
  const morceaux = [element.nom, RARETES_DES_OBJETS[element.rarete].nom, ...element.detail.split(" · ")];
  if (element.possede) morceaux.push(element.montre ? "montré à côté de votre Gaulois" : "à vous");
  if (element.chance > 0) morceaux.push(`${pourcent(element.chance)} de chance`);
  return morceaux.join(", ");
}

/** La largeur d'écran, en pixels, sous laquelle l'album monte du bas de l'écran au lieu de s'ouvrir près du dessin. */
export const ALBUM_ETROIT = 640;

/** Un rectangle de l'écran, en pixels, comme le rend `getBoundingClientRect`. */
export interface Rectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Où poser l'album : à droite du dessin, dessous ou dessus, sa hauteur au plus, et la pointe vers le dessin. */
export interface PlaceDuPanneau {
  cote: "droite" | "dessous" | "dessus" | null;
  left: number;
  top: number;
  hauteurMax: number;
  /** La distance, depuis le bord du panneau, où pointer vers le milieu du dessin. */
  pointe: number;
}

/** La marge gardée au bord de l'écran, l'écart entre le dessin et le panneau, la hauteur au plus du panneau. */
const MARGE = 16;
const ECART = 12;
const HAUTEUR_MAX = 640;
const POINTE = 7;

/**
 * La place de l'album près du dessin de la pochette (`dessin`), dans un écran de `ecran` pixels dont le haut, jusqu'à
 * `ecran.haut`, est pris par la barre du site. À droite du dessin quand il y tient ; sinon dessous, ou dessus s'il y a plus
 * de place au-dessus ; il défile dedans. Il ne couvre le dessin que si l'écran est trop bas des deux côtés. `largeur` et
 * `hauteur` : celles que l'album voudrait.
 */
export function placerLAlbum(dessin: Rectangle, largeur: number, hauteur: number, ecran: { largeur: number; hauteur: number; haut?: number }): PlaceDuPanneau {
  const plafond = Math.max(0, ecran.haut ?? 0) + MARGE;
  const place = ecran.hauteur - MARGE - plafond;
  const haut = Math.min(hauteur, place, HAUTEUR_MAX);
  const milieuY = (dessin.top + dessin.bottom) / 2;
  const milieuX = (dessin.left + dessin.right) / 2;
  if (dessin.right + ECART + largeur <= ecran.largeur - MARGE) {
    const top = Math.min(Math.max(plafond, milieuY - 72), ecran.hauteur - MARGE - haut);
    return { cote: "droite", left: dessin.right + ECART, top, hauteurMax: Math.min(place, HAUTEUR_MAX), pointe: Math.min(Math.max(14, milieuY - top - POINTE), haut - 28) };
  }
  const left = Math.min(Math.max(MARGE, dessin.left), ecran.largeur - MARGE - largeur);
  const pointe = Math.max(16, milieuX - left - POINTE);
  const dessous = ecran.hauteur - MARGE - (dessin.bottom + ECART);
  const dessus = dessin.top - ECART - plafond;
  // Dessous ou dessus seulement s'il y reste de quoi voir des cases ; sinon (un téléphone couché), sur toute la hauteur.
  if (hauteur <= dessous || dessous >= 420 || (dessous >= 320 && dessous >= dessus)) {
    return { cote: "dessous", left, top: dessin.bottom + ECART, hauteurMax: Math.max(0, Math.min(dessous, HAUTEUR_MAX)), pointe };
  }
  if (dessus >= 320) {
    const hauteurMax = Math.min(dessus, HAUTEUR_MAX);
    return { cote: "dessus", left, top: dessin.top - ECART - Math.min(hauteur, hauteurMax), hauteurMax, pointe };
  }
  return { cote: null, left, top: Math.max(plafond, ecran.hauteur - MARGE - haut), hauteurMax: Math.min(place, HAUTEUR_MAX), pointe };
}
