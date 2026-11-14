/**
 * La place de repos du Gaulois compagnon (revue du site, 14 novembre 2026) : arrêté, il ne couvre jamais du texte ni une
 * commande. Posé au coin bas gauche, il cachait la ligne de [GAL] du classement, des rangs, des liens, des boutons.
 *
 * `src/scripts/compagnon.ts` donne les rectangles occupés de la fenêtre (le texte, les commandes, les lignes de tableau,
 * les images qui disent quelque chose, ce qui est fixé) ; ces calculs purs en font une carte, puis choisissent la place
 * libre la plus proche de celle qu'il voudrait (à côté du curseur, son coin, sa place gardée). Sans place libre pour lui
 * en entier, il s'enfonce sous le bord bas de la fenêtre et n'en laisse dépasser que le haut, sa coiffe et ses yeux ;
 * sans place même pour sa tête, il se cache sous le bord, le temps qu'une place se libère.
 *
 * Les longueurs sont en pixels de la page, dans la fenêtre ; une place est le coin haut gauche de son dessin.
 */
import { CASES_H, CASES_L, placeDeLaBulle, touche, type Bornes, type Cadre, type Point } from "./mouvement";

/** Ce que couvre sa boîte, en cases depuis son coin haut gauche : tout son dessin, marges vides comprises. */
export const EMPREINTE: Cadre = { gauche: 0, droite: CASES_L, haut: 0, bas: CASES_H };
/** Couché, son lit en plus : 68 × 40 cases peintes, centré sous lui (`.compagnon-lit`). */
export const EMPREINTE_ENDORMI: Cadre = { gauche: -10, droite: CASES_L + 10, haut: 0, bas: CASES_H };
/** Enfoncé sous le bord bas, il laisse voir le haut de son dessin jusqu'à cette rangée : sa coiffe et ses yeux. */
export const TETE = 30;
/** L'air qu'il laisse autour de ce qu'il ne couvre pas, en pixels. */
export const AIR = 6;
/** Le côté des cases de la carte et le pas des places essayées, en pixels. */
export const PAS = 8;
/** Un pixel enfoncé sous le bord pèse trois pixels de marche : il préfère se montrer en entier, si ce n'est pas loin. */
export const PENALITE_ENFONCE = 3;

/** Entier, enfoncé jusqu'à la tête, ou caché sous le bord bas de la fenêtre. */
export type Forme = "entier" | "tete" | "cache";
const RANG: Readonly<Record<Forme, number>> = { entier: 2, tete: 1, cache: 0 };
/** La forme `a` le montre-t-elle davantage que `b` ? */
export const plusVisible = (a: Forme, b: Forme): boolean => RANG[a] > RANG[b];

/** Sa boîte (ou celle de son lit), à une place donnée, `cote` pixels par case. */
export const empreinteA = (p: Point, cote: number, e: Cadre = EMPREINTE): Cadre => ({
  gauche: p.x + e.gauche * cote,
  droite: p.x + e.droite * cote,
  haut: p.y + e.haut * cote,
  bas: p.y + e.bas * cote,
});

/** La place la plus basse où sa tête dépasse encore du bord bas d'une fenêtre de `hauteurFenetre` pixels. */
export const fondDeLaFenetre = (b: Bornes, cote: number, hauteurFenetre: number): number => Math.max(b.bas, hauteurFenetre - TETE * cote);

/** Sa forme à une place : entier dans les bornes, sa tête seule au-dessus du bord bas, ou caché dessous. */
export function formeA(p: Point, b: Bornes, cote: number, hauteurFenetre: number): Forme {
  if (p.y <= b.bas + 0.5) return "entier";
  return p.y <= fondDeLaFenetre(b, cote, hauteurFenetre) + 0.5 ? "tete" : "cache";
}

/**
 * La fenêtre en cases de `PAS` pixels : occupée là où touche un rectangle (élargi de `air`), avec ses sommes cumulées,
 * pour savoir en quatre lectures si un cadre touche une case occupée.
 */
export interface Carte {
  pas: number;
  colonnes: number;
  lignes: number;
  /** Sommes cumulées des cases occupées, sur (colonnes + 1) × (lignes + 1). */
  sommes: Int32Array;
}

export function carteDesZones(zones: readonly Cadre[], largeur: number, hauteur: number, air = AIR, pas = PAS): Carte {
  const colonnes = Math.max(1, Math.ceil(Math.max(0, largeur) / pas));
  const lignes = Math.max(1, Math.ceil(Math.max(0, hauteur) / pas));
  const occupe = new Uint8Array(colonnes * lignes);
  for (const z of zones) {
    if (!(z.droite > z.gauche && z.bas > z.haut)) continue;
    const g = Math.max(0, Math.floor((z.gauche - air) / pas));
    const d = Math.min(colonnes, Math.ceil((z.droite + air) / pas));
    const h = Math.max(0, Math.floor((z.haut - air) / pas));
    const b = Math.min(lignes, Math.ceil((z.bas + air) / pas));
    for (let j = h; j < b; j++) occupe.fill(1, j * colonnes + g, j * colonnes + Math.max(g, d));
  }
  const l = colonnes + 1;
  const sommes = new Int32Array(l * (lignes + 1));
  for (let j = 0; j < lignes; j++) {
    let ligne = 0;
    for (let i = 0; i < colonnes; i++) {
      ligne += occupe[j * colonnes + i] ?? 0;
      sommes[(j + 1) * l + i + 1] = (sommes[j * l + i + 1] ?? 0) + ligne;
    }
  }
  return { pas, colonnes, lignes, sommes };
}

/** Le nombre de cases occupées que touche un cadre. Ce qui sort de la fenêtre (sous le bord bas) ne compte pas. */
export function casesOccupees(carte: Carte, c: Cadre): number {
  const g = Math.max(0, Math.floor(c.gauche / carte.pas));
  const d = Math.min(carte.colonnes, Math.ceil(c.droite / carte.pas));
  const h = Math.max(0, Math.floor(c.haut / carte.pas));
  const b = Math.min(carte.lignes, Math.ceil(c.bas / carte.pas));
  if (d <= g || b <= h) return 0;
  const l = carte.colonnes + 1;
  const s = carte.sommes;
  return (s[b * l + d] ?? 0) - (s[h * l + d] ?? 0) - (s[b * l + g] ?? 0) + (s[h * l + g] ?? 0);
}

/** Un cadre ne touche-t-il aucune case occupée ? */
export const estLibre = (carte: Carte, c: Cadre): boolean => casesOccupees(carte, c) === 0;

const borner = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max));

/** Les valeurs de `min` à `max` au pas de `PAS`, `max` et les valeurs `aussi` comprises, sans doublon. */
function suite(min: number, max: number, ...aussi: number[]): number[] {
  const haut = Math.max(min, max);
  const valeurs = new Set<number>([haut, ...aussi.map((v) => borner(v, min, haut))]);
  for (let v = min; v < haut; v += PAS) valeurs.add(v);
  return [...valeurs];
}

export interface Repos {
  place: Point;
  forme: Forme;
}

/**
 * Sa place de repos : la place libre la plus proche de `voulue`, dans la fenêtre (`bornes`, sous l'en-tête), sa boîte à
 * `AIR` pixels au moins de chaque case occupée de `carte` et de chaque cadre de `aussi` (le curseur). Entier si possible ;
 * sinon enfoncé sous le bord bas jusqu'à la tête (chaque pixel enfoncé pèse `PENALITE_ENFONCE` pixels de marche) ; sinon
 * caché sous le bord, à l'aplomb de `voulue`. `endormi` : la place de son lit en plus.
 */
export function placeDeRepos(voulue: Point, carte: Carte, b: Bornes, cote: number, hauteurFenetre: number, aussi: readonly Cadre[] = [], endormi = false): Repos {
  const fond = fondDeLaFenetre(b, cote, hauteurFenetre);
  // Un lit ne se pose pas sous le bord : couché, il reste entier.
  const meilleure = chercher(voulue, carte, b, cote, endormi ? b.bas : fond, endormi ? EMPREINTE_ENDORMI : EMPREINTE, aussi);
  if (meilleure) return { place: meilleure, forme: formeA(meilleure, b, cote, hauteurFenetre) };
  return { place: { x: borner(voulue.x, b.gauche, b.droite), y: Math.max(fond, hauteurFenetre) }, forme: "cache" };
}

/**
 * La place libre la plus proche de `voulue` pour l'empreinte `e` (en cases), entre `b.haut` et `fond` (sous `b.bas`, il
 * est enfoncé : chaque pixel pèse `PENALITE_ENFONCE` pixels de marche) ; `null` s'il n'y en a aucune.
 */
function chercher(voulue: Point, carte: Carte, b: Bornes, cote: number, fond: number, e: Cadre, aussi: readonly Cadre[]): Point | null {
  if (b.droite < b.gauche || fond < b.haut) return null;
  const vx = borner(voulue.x, b.gauche, b.droite);
  const vy = borner(voulue.y, b.haut, fond);
  const libre = (p: Point): boolean => {
    const cadre = empreinteA(p, cote, e);
    return estLibre(carte, cadre) && aussi.every((z) => !touche(cadre, z, AIR));
  };
  // Les colonnes de la plus proche à la plus lointaine ; les rangées dans l'ordre de leur coût le plus petit.
  const xs = suite(b.gauche, b.droite, vx).sort((p, q) => Math.abs(p - vx) - Math.abs(q - vx));
  const rangees = suite(b.haut, fond, vy, Math.min(b.bas, fond))
    .map((y) => {
      const enfonce = Math.max(0, y - b.bas);
      return { y, enfonce, minimum: Math.abs(y - vy) + PENALITE_ENFONCE * enfonce };
    })
    .sort((p, q) => p.minimum - q.minimum);
  let meilleure: Point | null = null;
  let cout = Infinity;
  for (const r of rangees) {
    if (r.minimum >= cout) break;
    const dy = r.y - vy;
    for (const x of xs) {
      const c = Math.hypot(x - vx, dy) + PENALITE_ENFONCE * r.enfonce;
      if (c >= cout) break;
      if (libre({ x, y: r.y })) {
        meilleure = { x, y: r.y };
        cout = c;
        break;
      }
    }
  }
  return meilleure;
}

/** La taille d'une bulle, et la fenêtre où elle se pose : `haut`, le bas de l'en-tête collé en haut. */
export interface Taille {
  largeur: number;
  hauteur: number;
}
export interface Fenetre {
  largeur: number;
  hauteur: number;
  haut: number;
}

/** Le cadre de sa bulle, posée à `gauche`, au-dessus de lui ou sous ses pieds (règles `.compagnon-bulle` de global.css). */
export function cadreDeLaBulle(corps: Point, cote: number, bulle: Taille, gauche: number, dessous: boolean): Cadre {
  const haut = dessous ? corps.y + (CASES_H - 1) * cote : corps.y + 3 * cote - bulle.hauteur;
  return { gauche, droite: gauche + bulle.largeur, haut, bas: haut + bulle.hauteur };
}

/**
 * Sa bulle, posée au mieux : là où elle couvre le moins de cases occupées de `carte` (aucune, si possible), au-dessus de
 * lui de préférence, sa queue toujours vers sa tête, sans sortir de la fenêtre. Sans place entière ni au-dessus ni
 * dessous, la règle de `placeDeLaBulle`. `libre` : elle ne couvre rien.
 */
export function bulleAuMieux(corps: Point, cote: number, bulle: Taille, fenetre: Fenetre, carte: Carte | null): { gauche: number; queue: number; dessous: boolean; libre: boolean } {
  const centre = corps.x + (CASES_L / 2) * cote;
  const defaut = placeDeLaBulle(centre, bulle.largeur, fenetre.largeur, {
    hauteur: bulle.hauteur,
    dessus: corps.y + 3 * cote - fenetre.haut,
    dessous: fenetre.hauteur - (corps.y + (CASES_H - 1) * cote),
  });
  const couvre = (gauche: number, dessous: boolean): number => (carte ? casesOccupees(carte, cadreDeLaBulle(corps, cote, bulle, gauche, dessous)) : 0);
  const queue = (gauche: number): number => borner(centre - gauche, 18, bulle.largeur - 26);
  // La queue reste sur sa tête : entre 18 pixels du bord gauche de la bulle et 26 de son bord droit.
  const min = Math.max(8, centre - (bulle.largeur - 26));
  const max = Math.min(fenetre.largeur - 8 - bulle.largeur, centre - 18);
  const gauches = max >= min ? suite(min, max, defaut.gauche) : [defaut.gauche];
  let meilleure: { gauche: number; dessous: boolean; n: number; score: number } | null = null;
  for (const dessous of [defaut.dessous, !defaut.dessous]) {
    const cadre = cadreDeLaBulle(corps, cote, bulle, 0, dessous);
    if (cadre.haut < fenetre.haut || cadre.bas > fenetre.hauteur) continue;
    for (const gauche of gauches) {
      const n = couvre(gauche, dessous);
      const score = n * 1e6 + (dessous === defaut.dessous ? 0 : 1_000) + Math.abs(gauche - defaut.gauche);
      if (!meilleure || score < meilleure.score) meilleure = { gauche, dessous, n, score };
    }
  }
  if (!meilleure) return { gauche: defaut.gauche, queue: defaut.queue, dessous: defaut.dessous, libre: couvre(defaut.gauche, defaut.dessous) === 0 };
  return { gauche: meilleure.gauche, queue: queue(meilleure.gauche), dessous: meilleure.dessous, libre: meilleure.n === 0 };
}

/**
 * Où se poser pour saluer : la place libre la plus proche de `voulue` où il tient en entier, sa bulle au-dessus de lui à
 * sa place habituelle, l'une et l'autre sans rien couvrir ni sortir de la fenêtre ; `null` s'il n'y en a pas.
 */
export function placePourSaluer(voulue: Point, carte: Carte, b: Bornes, cote: number, fenetre: Fenetre, bulle: Taille): Point | null {
  // La bulle à sa place habituelle, au-dessus de lui (`placeDeLaBulle`) : son bord gauche à 36 % de sa largeur avant sa tête.
  const gaucheBulle = (CASES_L / 2) * cote - bulle.largeur * 0.36;
  const hautBulle = 3 * cote - bulle.hauteur;
  const e: Cadre = {
    gauche: Math.min(0, gaucheBulle) / cote,
    droite: Math.max(CASES_L * cote, gaucheBulle + bulle.largeur) / cote,
    haut: Math.min(0, hautBulle) / cote,
    bas: CASES_H,
  };
  const bornes: Bornes = {
    gauche: Math.max(b.gauche, 8 - gaucheBulle),
    droite: Math.min(b.droite, fenetre.largeur - 8 - gaucheBulle - bulle.largeur),
    haut: Math.max(b.haut, fenetre.haut - hautBulle),
    bas: b.bas,
  };
  return chercher(voulue, carte, bornes, cote, bornes.bas, e, []);
}

/** Sa place, arrêté là : libre (ce qu'il montre de sa boîte ne touche rien), et sa forme. */
export function etatDeLaPlace(ici: Point, carte: Carte, b: Bornes, cote: number, hauteurFenetre: number, aussi: readonly Cadre[] = [], endormi = false): { libre: boolean; forme: Forme } {
  const cadre = empreinteA(ici, cote, endormi ? EMPREINTE_ENDORMI : EMPREINTE);
  return { libre: estLibre(carte, cadre) && aussi.every((z) => !touche(cadre, z, AIR)), forme: formeA(ici, b, cote, hauteurFenetre) };
}

/**
 * Faut-il qu'il bouge, arrêté à `ici` ? Seulement s'il couvre quelque chose, ou s'il peut se montrer davantage qu'enfoncé
 * ou caché : une place libre où il se voit en entier lui reste acquise, il ne court pas d'une place libre à une autre.
 * Renvoie sa nouvelle place, ou `null` s'il reste.
 */
export function placeAprendre(ici: Point, voulue: Point, carte: Carte, b: Bornes, cote: number, hauteurFenetre: number, aussi: readonly Cadre[] = [], endormi = false): Repos | null {
  const etat = etatDeLaPlace(ici, carte, b, cote, hauteurFenetre, aussi, endormi);
  if (etat.libre && etat.forme === "entier") return null;
  const repos = placeDeRepos(voulue, carte, b, cote, hauteurFenetre, aussi, endormi);
  if (etat.libre && !plusVisible(repos.forme, etat.forme)) return null;
  if (Math.abs(repos.place.x - ici.x) < 0.5 && Math.abs(repos.place.y - ici.y) < 0.5) return null;
  return repos;
}
