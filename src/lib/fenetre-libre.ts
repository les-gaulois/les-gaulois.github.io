/**
 * Une fenêtre libre de la console de la carte (13 novembre 2026, demande du pilote : « qu'on puisse la mettre en grand ou
 * en petit, la déplacer comme on le veut ») : la fenêtre « Alliance » se déplace par sa barre de titre, change de taille
 * par ses bords, s'agrandit à toute la carte ou se réduit à sa barre. Ici, seulement les calculs, testés ; le navigateur
 * les applique dans `src/scripts/fenetre-libre.ts`. Toutes les mesures sont en pixels CSS, dans le calque des fenêtres
 * posé sur la carte (`.carte-panneaux`).
 */

/** La place et la taille choisies. `h` à `null` : la hauteur suit le contenu, jusqu'au bas de la carte. */
export interface Geometrie {
  x: number;
  y: number;
  w: number;
  h: number | null;
}

/** Normale (à sa place ou là où on l'a posée), agrandie à toute la carte, ou réduite à sa barre de titre. */
export type EtatFenetre = "normal" | "grand" | "petit";

/** Ce qui est gardé dans ce navigateur : la géométrie choisie (`null` : la place d'origine) et l'état. */
export interface FenetreGardee {
  g: Geometrie | null;
  etat: EtatFenetre;
}

/** Un bord ou un coin, par où la fenêtre change de taille. */
export type Bord = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const BORDS: readonly Bord[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** La taille du calque des fenêtres. */
export interface Cadre {
  largeur: number;
  hauteur: number;
}

/** L'écart gardé entre la fenêtre et le bord de la carte, comme la place d'origine (0,75rem). */
export const MARGE = 12;
/** La plus petite fenêtre : ses onglets tiennent encore sur deux lignes, et un champ reste lisible. */
export const LARGEUR_MIN = 288;
export const HAUTEUR_MIN = 200;
/** Le pas d'une flèche du clavier, et avec Maj. */
export const PAS_CLAVIER = 16;
export const PAS_CLAVIER_MAJ = 64;

const entre = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * La géométrie tenue dans la carte : ni plus grande que la place, ni plus petite que le minimum, et entière dans le cadre.
 * Une carte trop petite pour le minimum garde la fenêtre à sa marge, à la taille de la place.
 */
export function borner(g: Geometrie, cadre: Cadre): Geometrie {
  const largeurMax = Math.max(0, cadre.largeur - 2 * MARGE);
  const hauteurMax = Math.max(0, cadre.hauteur - 2 * MARGE);
  const w = Math.round(entre(g.w, Math.min(LARGEUR_MIN, largeurMax), largeurMax));
  const h = g.h === null ? null : Math.round(entre(g.h, Math.min(HAUTEUR_MIN, hauteurMax), hauteurMax));
  // Une hauteur qui suit le contenu ne descend pas sous la carte : la fenêtre garde au moins sa hauteur minimale de place.
  const hauteurPrise = h ?? Math.min(HAUTEUR_MIN, hauteurMax);
  const x = Math.round(entre(g.x, MARGE, cadre.largeur - MARGE - w));
  const y = Math.round(entre(g.y, MARGE, cadre.hauteur - MARGE - hauteurPrise));
  return { x, y, w, h };
}

/** La fenêtre déplacée de (dx, dy), puis tenue dans la carte. */
export function deplacer(g: Geometrie, dx: number, dy: number, cadre: Cadre): Geometrie {
  return borner({ ...g, x: g.x + dx, y: g.y + dy }, cadre);
}

/**
 * La fenêtre tirée par un bord ou un coin de (dx, dy). Le bord opposé ne bouge pas, même quand la taille bute sur son
 * minimum ou sur le bord de la carte. `hauteur` : la hauteur affichée au début du geste, quand elle suivait le contenu.
 */
export function redimensionner(g: Geometrie, bord: Bord, dx: number, dy: number, cadre: Cadre, hauteur: number): Geometrie {
  const largeurMax = Math.max(0, cadre.largeur - 2 * MARGE);
  const hauteurMax = Math.max(0, cadre.hauteur - 2 * MARGE);
  const minW = Math.min(LARGEUR_MIN, largeurMax);
  const minH = Math.min(HAUTEUR_MIN, hauteurMax);
  let { x, y, w } = g;
  let h = g.h ?? hauteur;
  if (bord.includes("e")) w = entre(w + dx, minW, cadre.largeur - MARGE - x);
  if (bord.includes("w")) {
    const droite = x + w;
    x = entre(x + dx, MARGE, droite - minW);
    w = droite - x;
  }
  if (bord.includes("s")) h = entre(h + dy, minH, cadre.hauteur - MARGE - y);
  if (bord.includes("n")) {
    const bas = y + h;
    y = entre(y + dy, MARGE, bas - minH);
    h = bas - y;
  }
  // Tiré par le haut ou le bas, la hauteur est désormais choisie ; tiré par un côté seul, elle continue de suivre le contenu.
  const hauteurChoisie = bord.includes("n") || bord.includes("s") ? h : g.h;
  return borner({ x, y, w, h: hauteurChoisie }, cadre);
}

/** L'écart gardé au-dessus de ce qui doit rester visible au bas de la carte. */
export const ECART_BAS = 8;

/**
 * La hauteur à garder libre au bas de la carte, sous la fenêtre : la mention « © OpenFront and Contributors » et ses liens
 * (la licence du fond de carte veut qu'elle reste visible, `NOTICE.md`), et l'alerte de collecte quand elle paraît. La
 * fenêtre libre, déplacée, agrandie ou redimensionnée, s'arrête au-dessus. `aGarder` : leurs rectangles à l'écran ; un
 * élément caché, ou hors de la carte, ne compte pas.
 */
export function reserveDuBas(carte: { top: number; bottom: number }, aGarder: readonly { top: number; bottom: number }[]): number {
  let haut = carte.bottom;
  for (const r of aGarder) if (r.bottom > r.top && r.bottom > carte.top && r.top < carte.bottom) haut = Math.min(haut, r.top);
  return haut >= carte.bottom ? 0 : Math.max(0, Math.ceil(carte.bottom - haut) + ECART_BAS - MARGE);
}

/** La géométrie de la fenêtre agrandie : toute la carte, à sa marge. */
export function geometrieAgrandie(cadre: Cadre): Geometrie {
  return { x: MARGE, y: MARGE, w: Math.max(0, cadre.largeur - 2 * MARGE), h: Math.max(0, cadre.hauteur - 2 * MARGE) };
}

/** Ce que gardait ce navigateur, relu sans confiance : une valeur abîmée ou d'une autre version rend la place d'origine. */
export function lireFenetreGardee(texte: string | null): FenetreGardee {
  const origine: FenetreGardee = { g: null, etat: "normal" };
  if (!texte) return origine;
  let v: unknown;
  try {
    v = JSON.parse(texte);
  } catch {
    return origine;
  }
  if (typeof v !== "object" || v === null) return origine;
  const o = v as Record<string, unknown>;
  const etat: EtatFenetre = o.etat === "grand" || o.etat === "petit" ? o.etat : "normal";
  const fini = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const g = o.g as Record<string, unknown> | null | undefined;
  const geometrie = g && typeof g === "object" && fini(g.x) && fini(g.y) && fini(g.w) && g.w > 0 && (g.h === null || (fini(g.h) && g.h > 0)) ? { x: g.x, y: g.y, w: g.w, h: g.h as number | null } : null;
  return { g: geometrie, etat };
}

/** Le pas du clavier pour une flèche, `null` pour une autre touche. */
export function pasDeLaFleche(touche: string, maj: boolean): { dx: number; dy: number } | null {
  const pas = maj ? PAS_CLAVIER_MAJ : PAS_CLAVIER;
  if (touche === "ArrowLeft") return { dx: -pas, dy: 0 };
  if (touche === "ArrowRight") return { dx: pas, dy: 0 };
  if (touche === "ArrowUp") return { dx: 0, dy: -pas };
  if (touche === "ArrowDown") return { dx: 0, dy: pas };
  return null;
}

/** Un rectangle mesuré à l'écran (`getBoundingClientRect`). */
export interface RectEcran {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

/**
 * La largeur de la carte, à sa droite, que couvre la fenêtre ouverte : le film et la carte de l'alliance se cadrent dans
 * le reste, et la bulle du survol y reste. Une fenêtre posée sur la moitié gauche, ou plus large que les quatre cinquièmes
 * de la carte (agrandie), ne couvre rien : on l'a mise là exprès, et la carte ne se tasse pas dans une bande de quelques
 * pixels. À sa place d'origine, une fenêtre de 29rem sur une carte de 768 px en couvre six dixièmes : elle compte.
 */
export function largeurCouverte(carte: RectEcran, fenetre: RectEcran | null | undefined): number {
  if (!fenetre || fenetre.width === 0 || carte.width === 0 || fenetre.bottom <= carte.top || fenetre.top >= carte.bottom) return 0;
  if (fenetre.width > carte.width * 0.8) return 0;
  if (fenetre.left + fenetre.right < carte.left + carte.right) return 0;
  return Math.max(0, carte.right - fenetre.left);
}

/**
 * Le pendant de `largeurCouverte` pour une fenêtre posée sur la moitié gauche : ce qu'elle couvre depuis le bord gauche de
 * la carte. Les outils et la légende de la carte de l'alliance passent alors à droite. Rien pour une fenêtre agrandie.
 */
export function largeurCouverteAGauche(carte: RectEcran, fenetre: RectEcran | null | undefined): number {
  if (!fenetre || fenetre.width === 0 || carte.width === 0 || fenetre.bottom <= carte.top || fenetre.top >= carte.bottom) return 0;
  if (fenetre.width > carte.width * 0.8) return 0;
  if (fenetre.left + fenetre.right >= carte.left + carte.right) return 0;
  return Math.max(0, fenetre.right - carte.left);
}

/** Les noms des boutons de la barre. */
export interface TextesFenetre {
  deplacer: string;
  taille: string;
  reduire: string;
  deplier: string;
  agrandir: string;
  restaurer: string;
  replacer: string;
}

/** Les noms des boutons de la barre, dans la langue de la fenêtre (le français, ou l'anglais choisi pour les alliés). */
export const TEXTES_FENETRE: Record<"fr" | "en", TextesFenetre> = {
  fr: {
    deplacer: "Déplacer la fenêtre (flèches du clavier)",
    taille: "Changer la taille de la fenêtre (flèches du clavier)",
    reduire: "Réduire la fenêtre à sa barre",
    deplier: "Déplier la fenêtre",
    agrandir: "Agrandir la fenêtre à toute la carte",
    restaurer: "Rendre à la fenêtre sa taille d'avant",
    replacer: "Remettre la fenêtre à sa place",
  },
  en: {
    deplacer: "Move the window (arrow keys)",
    taille: "Resize the window (arrow keys)",
    reduire: "Collapse the window to its title bar",
    deplier: "Expand the window",
    agrandir: "Maximise the window over the whole map",
    restaurer: "Restore the window's previous size",
    replacer: "Put the window back in its place",
  },
};

export const textesFenetre = (lang: string | null | undefined): TextesFenetre => (lang?.toLowerCase().startsWith("en") ? TEXTES_FENETRE.en : TEXTES_FENETRE.fr);
