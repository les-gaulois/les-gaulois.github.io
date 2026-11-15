/**
 * L'écran des intérieurs (idée « Entrer dans les bâtiments », choisie par le pilote le 15 novembre 2026) : qui peut entrer
 * où, l'adresse de la fenêtre, la taille d'une case à l'écran, l'image du mouvement lent, et le dedans peint avec le Gaulois
 * du visiteur. Calculs purs, testés dans `tests/unit/village-interieurs-fenetre.test.ts` ; la fenêtre est
 * `src/components/village/monde/FenetreInterieur.tsx`, les dessins sont dans `./interieurs/` (design Claude Fable 5.2).
 *
 * On n'entre que dans un bâtiment que les points rapportés au clan ont fini, et seulement s'il a son dessin : un bâtiment
 * en chantier, à venir, ou sans données du chantier ne s'ouvre pas (« pas de données » n'est jamais montré comme bâti).
 */
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, type Tenue, casesDuGaulois } from "../gaulois";
import { BATIMENTS } from "./chantier-liste";
import type { Decor } from "./decor";
import { BATIMENTS_A_INTERIEUR, type DessinDInterieur, type InterieurId, interieurDe } from "./interieurs";
import { type Lumiere, PLEIN_JOUR, melanger } from "./lumiere";
import type { EtatDuMonde } from "./monde-etat";
import { OMBRE } from "./monde/foule";

/**
 * Les bâtiments où l'on peut entrer, dans l'ordre du chantier : finis (`fini_le`, la règle de `etatDuLot`) et dessinés.
 * `dessinDe` : où chercher les dessins (les tests y mettent un intérieur d'essai).
 */
export function interieursOuverts(etat: Pick<EtatDuMonde, "chantier">, dessinDe: (id: InterieurId) => DessinDInterieur | null = interieurDe): InterieurId[] {
  const chantier = etat.chantier;
  if (!chantier) return [];
  return BATIMENTS_A_INTERIEUR.filter((id) => chantier.batiments.some((b) => b.id === id && b.fini_le !== null) && dessinDe(id) !== null);
}

/* ---------- L'adresse ---------- */

/** Le nom de la fenêtre d'un intérieur, qui est aussi son adresse : `#interieur-moulin`. */
export type FenetreDInterieur = `interieur-${InterieurId}`;
const PREFIXE = "interieur-";

export const fenetreDeLInterieur = (id: InterieurId): FenetreDInterieur => `${PREFIXE}${id}`;

/** L'intérieur que nomme une fenêtre (« interieur-moulin »), ou `null` : une autre fenêtre, ou aucune. */
export function interieurDeLaFenetre(nom: string | null | undefined): InterieurId | null {
  if (!nom?.startsWith(PREFIXE)) return null;
  const id = nom.slice(PREFIXE.length);
  return (BATIMENTS_A_INTERIEUR as readonly string[]).includes(id) ? (id as InterieurId) : null;
}

/**
 * L'intérieur que demande l'ancre de l'adresse (`#interieur-moulin`), s'il s'ouvre aujourd'hui ; sinon `null`, et le monde
 * reste seul, comme pour le marché d'un visiteur.
 */
export function interieurDeLAncre(ancre: string, ouverts: readonly InterieurId[]): InterieurId | null {
  const id = interieurDeLaFenetre(ancre.replace(/^#/, ""));
  return id !== null && ouverts.includes(id) ? id : null;
}

/* ---------- Les mots ---------- */

/** Le nom d'un bâtiment dans une phrase, avec son article : « le four à pain ». */
export const nomDuBatiment = (id: InterieurId): string => BATIMENTS.find((b) => b.id === id)!.nom;

/** « du moulin », « de la tour de guet », « de l'étable » : l'article contracté devant le nom. */
function duBatiment(nom: string): string {
  if (nom.startsWith("le ")) return `du ${nom.slice(3)}`;
  if (nom.startsWith("les ")) return `des ${nom.slice(4)}`;
  return `de ${nom}`;
}

/** Ce que dit le bouton posé sur un bâtiment fini : « Entrer dans le moulin ». */
export const entrerDans = (id: InterieurId): string => `Entrer dans ${nomDuBatiment(id)}`;

/** La phrase posée à côté du dessin, pour les lecteurs d'écran : ce que c'est, rien de plus. */
export const phraseDuDedans = (id: InterieurId): string => `Le dedans ${duBatiment(nomDuBatiment(id))}, dessiné en pixels`;

/* ---------- La taille à l'écran ---------- */

/** Le dessin à l'écran : le côté d'une case, la taille et la place de la toile dans son cadre, en pixels de la page. */
export interface DedansALEcran {
  /** Le côté d'une case en pixels de l'écran : un entier quand `net`, moins d'un pixel sinon. */
  pixels: number;
  /** Le même côté en pixels de la page (CSS) : `pixels` divisé par la densité de l'écran. */
  css: number;
  /** Vrai quand une case fait un nombre entier de pixels de l'écran : le dessin est net. */
  net: boolean;
  largeur: number;
  hauteur: number;
  /** Le coin de la toile dans son cadre, centrée, posée sur un pixel de l'écran. */
  gauche: number;
  haut: number;
}

/**
 * La plus grande case qui laisse tout le dessin tenir dans son cadre (`place`, en pixels de la page), en pixels entiers de
 * l'écran : sur un écran dense (un téléphone, deux ou trois pixels de l'écran par pixel de la page), une case peut faire
 * un ou deux pixels de l'écran et rester nette là où un pixel de la page entier ne tiendrait pas. Le monde fait de même
 * avec ses cases entières. Si même un pixel de l'écran par case ne tient pas, le dessin est réduit à la taille du cadre et
 * le navigateur l'adoucit (`net` faux), comme le fond vu de loin. `null` : le cadre n'a pas encore de taille.
 */
export function dedansALEcran(dessin: { largeur: number; hauteur: number }, place: { largeur: number; hauteur: number }, densiteDeLEcran: number): DedansALEcran | null {
  if (!(place.largeur > 0 && place.hauteur > 0 && dessin.largeur > 0 && dessin.hauteur > 0)) return null;
  const densite = Number.isFinite(densiteDeLEcran) && densiteDeLEcran > 0 ? densiteDeLEcran : 1;
  // Combien de pixels de l'écran par case tiennent, en largeur et en hauteur ; un millionième d'écart ne compte pas.
  const tient = Math.min((place.largeur * densite) / dessin.largeur, (place.hauteur * densite) / dessin.hauteur);
  const entier = Math.floor(tient + 1e-6);
  const net = entier >= 1;
  const pixels = net ? entier : tient;
  const css = pixels / densite;
  const largeur = dessin.largeur * css;
  const hauteur = dessin.hauteur * css;
  // Centrée dans son cadre, sur un pixel de l'écran : un demi-pixel de décalage rendrait les cases inégales.
  const coin = (cadre: number, toile: number): number => Math.max(0, Math.round(((cadre - toile) / 2) * densite) / densite);
  return { pixels, css, net, largeur, hauteur, gauche: coin(place.largeur, largeur), haut: coin(place.hauteur, hauteur) };
}

/* ---------- Le mouvement ---------- */

/**
 * L'image du mouvement lent à cet instant (`secondes` : le temps de l'horloge du monde) : une nouvelle image par seconde,
 * en boucle. Figé (pause, « réduire les animations ») ou sans mouvement, toujours l'image 0.
 */
export function imageDuDedans(secondes: number, images: number, fige: boolean): number {
  const n = Math.floor(images);
  if (fige || !(n > 1) || !Number.isFinite(secondes)) return 0;
  return ((Math.floor(secondes) % n) + n) % n;
}

/* ---------- Le dedans et le Gaulois du visiteur ---------- */

/** Le Gaulois du visiteur debout, tourné vers la droite (le sens du dessin), dans sa tenue : 48 cases sur 64. */
export const gauloisDebout = (tenue: Tenue): Decor => ({ largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: casesDuGaulois(tenue) });

/** La boîte du Gaulois posé à la place de l'intérieur : la colonne de son milieu en `place.x`, ses pieds sur `place.pied`. */
export function boiteDuGaulois(place: DessinDInterieur["place"], gaulois: { largeur: number; hauteur: number }): { x: number; y: number } {
  return { x: place.x - Math.floor(gaulois.largeur / 2), y: place.pied - gaulois.hauteur + 1 };
}

/** Une boîte du dessin, en cases. */
interface Boite {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/**
 * La lumière de la pièce à cet endroit : pour le rouge, le vert et le bleu, la part de son plein jour que le dessin garde
 * à cette heure, mesurée sur toutes les cases de la boîte (`maintenant` et `deJour` : le même dessin, à cette lumière et
 * en plein jour). 1 en plein jour ; plus sombre et plus bleue la nuit si le dessin l'est ; jamais plus que le plein jour,
 * même près d'une lanterne. Une boîte hors du dessin, ou noire en plein jour, ne change rien.
 */
export function lumiereDeLEndroit(maintenant: Decor, deJour: Decor, boite: Boite): readonly [number, number, number] {
  const somme = [0, 0, 0];
  const jour = [0, 0, 0];
  for (let y = Math.max(0, boite.y); y < Math.min(maintenant.hauteur, boite.y + boite.hauteur); y++) {
    for (let x = Math.max(0, boite.x); x < Math.min(maintenant.largeur, boite.x + boite.largeur); x++) {
      const a = maintenant.cases[y * maintenant.largeur + x];
      const b = deJour.cases[y * deJour.largeur + x];
      if (!a || !b) continue;
      for (let k = 0; k < 3; k++) {
        somme[k]! += parseInt(a.slice(1 + 2 * k, 3 + 2 * k), 16);
        jour[k]! += parseInt(b.slice(1 + 2 * k, 3 + 2 * k), 16);
      }
    }
  }
  const part = (k: number): number => (jour[k]! > 0 ? Math.min(1, somme[k]! / jour[k]!) : 1);
  return [part(0), part(1), part(2)];
}

/** Une couleur « #rrggbb » sous cette lumière : chaque composante multipliée par sa part. */
function sousLaLumiere(couleur: string, part: readonly [number, number, number]): string {
  let sortie = "#";
  for (let k = 0; k < 3; k++) sortie += Math.round(parseInt(couleur.slice(1 + 2 * k, 3 + 2 * k), 16) * part[k]!).toString(16).padStart(2, "0");
  return sortie;
}

/**
 * Le dedans à cette lumière et à cette image, avec le Gaulois du visiteur par-dessus (`gaulois`, ou `null` : la pièce
 * vide). Comme dans le monde pour le sien : son ombre d'abord (l'ellipse de `OMBRE`, qui assombrit ce qui est dessous),
 * puis lui ; rien du dessin ne passe devant lui. Ce qui sortirait du dessin est ignoré. Le dessin reçu n'est pas modifié.
 *
 * Il est éclairé comme la pièce là où il se tient (remarque du dessinateur, 15 novembre 2026 : peint tel quel, il
 * paraissait bien plus clair que la pièce la nuit). Chaque dessin a sa nuit (`couleurDuDedans`, un voile bleu, la lueur
 * d'une lanterne) : ses couleurs prennent la part de leur plein jour que garde la pièce sur sa boîte
 * (`lumiereDeLEndroit`), en comparant le dessin à cette lumière et en plein jour. En plein jour, il est inchangé ; sa
 * tenue ne change pas.
 */
/**
 * Le plein jour de la pièce ouverte, image par image : il ne change jamais, et le refaire à chaque changement de lumière
 * doublait le travail (un dessin coûte de 50 à 90 ms). Seule la dernière pièce est gardée, pour ne pas tenir sept pièces
 * en mémoire. Il n'est que lu (`lumiereDeLEndroit`), jamais modifié.
 */
let jourGarde: { dessin: DessinDInterieur; images: Map<number, Decor> } | null = null;
function pleinJourDe(dessin: DessinDInterieur, image: number): Decor {
  if (jourGarde?.dessin !== dessin) jourGarde = { dessin, images: new Map() };
  let jour = jourGarde.images.get(image);
  if (!jour) {
    jour = dessin.dessiner(PLEIN_JOUR, image);
    jourGarde.images.set(image, jour);
  }
  return jour;
}

export function dedansAvecLeGaulois(dessin: DessinDInterieur, lumiere: Lumiere, image: number, gaulois: Decor | null): Decor {
  const fond = dessin.dessiner(lumiere, image);
  if (!gaulois) return fond;
  const { largeur, hauteur } = fond;
  const cases = fond.cases.slice();
  const coin = boiteDuGaulois(dessin.place, gaulois);
  const dedans = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < largeur && y < hauteur;
  const part = lumiereDeLEndroit(fond, pleinJourDe(dessin, image), { ...coin, largeur: gaulois.largeur, hauteur: gaulois.hauteur });
  // Ses couleurs à cette lumière : quelques dizaines, calculées une fois chacune.
  const eclairees = new Map<string, string>();
  const eclairer = (couleur: string): string => {
    let c = eclairees.get(couleur);
    if (c === undefined) {
      c = sousLaLumiere(couleur, part);
      eclairees.set(couleur, c);
    }
    return c;
  };
  for (let j = 0; j < OMBRE.hauteur; j++) {
    for (let i = 0; i < OMBRE.largeur; i++) {
      const x = coin.x + OMBRE.x + i;
      const y = coin.y + OMBRE.y + j;
      const couleur = dedans(x, y) ? cases[y * largeur + x] : null;
      if (OMBRE.masque[j * OMBRE.largeur + i] && couleur) cases[y * largeur + x] = melanger(couleur, "#000000", OMBRE.opacite);
    }
  }
  for (let j = 0; j < gaulois.hauteur; j++) {
    for (let i = 0; i < gaulois.largeur; i++) {
      const couleur = gaulois.cases[j * gaulois.largeur + i];
      const x = coin.x + i;
      const y = coin.y + j;
      if (couleur && dedans(x, y)) cases[y * largeur + x] = eclairer(couleur);
    }
  }
  return { largeur, hauteur, cases };
}
