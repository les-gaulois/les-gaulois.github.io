/**
 * La scène de l'image d'une victoire en duel de cartes (« Coup pour coup », chantier du 22 novembre 2026) : les deux Gaulois
 * devant la bannière du vaincu, qui était le lieu du duel, case par case. Le vainqueur est debout à gauche, tel que /gaulois
 * le dessine ; le vaincu est couché sur le côté à droite, les yeux fermés, trois étoiles au-dessus de la tête, comme à la
 * fin d'un duel dans le jeu (maquette validée par le pilote). Chaque familier se tient du côté de son maître, tourné vers le
 * milieu.
 *
 * Mise en page « La grande scène », choisie parmi trois propositions de Claude Fable 5.2 (design), codée par Claude Opus 5.5
 * : la bannière (124 × 80 cases) accrochée au milieu d'un mur d'encre, avec des coulisses de 32 cases de chaque côté, sur
 * un plancher, où les familiers ont la place de se tenir. Sans bannière, la place du village au moment du duel (`decors/`).
 *
 * Aucune pose ne redessine un objet : la grille de 48 × 64 de `casesDuGaulois` est seulement retournée (miroir) et tournée
 * d'un quart de tour. Toute tenue et tout Gaulois unique passent donc, sans liste à tenir à jour.
 *
 * Calcul pur, sans bibliothèque : la fonction code-discord (Deno) peut le lire, et le site le pose dans l'image que le robot
 * de la GitHub Action envoie (`src/lib/duels-image.ts`), avec les textes. Les étoiles sont un dessin original.
 */
import { dessinDeLaBanniere } from "./bannieres/index.ts";
import { HAUTEUR, LARGEUR, PIEDS, type Decor } from "./decors/commun.ts";
import { decorDe } from "./decors/index.ts";
import type { FamilierAPoser } from "./familiers/familier.ts";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, type Tenue } from "./gaulois.ts";
import { momentDeParis } from "./scene.ts";

/** Une grille de cases : « #rrggbb », ou `null` pour une case vide. */
export interface Grille {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** Les coulisses, de chaque côté de la bannière, en cases : un familier de 30 cases y tient sans toucher son maître. */
export const COULISSES = 32;
/** La scène entière, en cases : la bannière et ses deux coulisses. */
export const SCENE_DU_DUEL = { largeur: LARGEUR + 2 * COULISSES, hauteur: HAUTEUR } as const;

/** Le lieu où pose le vainqueur, sans bannière du vaincu : la place du village, au moment du duel. */
export const LIEU_DE_SECOURS = "place";

/** Les couleurs des coulisses : l'encre des images du robot (`CARD_COLORS` de src/lib/gazette-image.ts), écrites ici pour Deno. */
export const COULISSE = { mur: "#0a1433", mur2: "#0d1a40", sol: "#13214d", joint: "#1b2b5e", ombre: "#050b1f" } as const;

/** La colonne de la bannière où se pose la grille du vainqueur, et celle où finit le vaincu couché. */
const PLACE_DU_VAINQUEUR = 6;
const DROITE_DU_VAINCU = 121;
/** Les rangées de la grille du Gaulois sous la tête : là se cherche le bord du corps, contre lequel se serre un familier. */
const SOUS_LA_TETE = 34;
const SEMELLES = 61;
/** Un familier de cette largeur au plus passe devant son maître quand la place manque ; plus large, il reste derrière. */
const PETIT_FAMILIER = 26;
/** La distance entre les étoiles et le bout du vaincu où est sa tête, en cases. */
const ETOILES_DEPUIS_LA_TETE = 28;

const vide = (largeur: number, hauteur: number): Grille => ({ largeur, hauteur, cases: new Array<string | null>(largeur * hauteur).fill(null) });
const lire = (g: Grille, x: number, y: number): string | null => (x < 0 || y < 0 || x >= g.largeur || y >= g.hauteur ? null : (g.cases[y * g.largeur + x] ?? null));

/** La grille vue dans un miroir : ce qui était à droite passe à gauche. */
export function miroir(g: Grille): Grille {
  const s = vide(g.largeur, g.hauteur);
  for (let y = 0; y < g.hauteur; y++) for (let x = 0; x < g.largeur; x++) s.cases[y * g.largeur + (g.largeur - 1 - x)] = lire(g, x, y);
  return s;
}

/** Un quart de tour dans le sens des aiguilles d'une montre : le haut passe à droite. */
export function quartDeTour(g: Grille): Grille {
  const s = vide(g.hauteur, g.largeur);
  for (let y = 0; y < g.hauteur; y++) for (let x = 0; x < g.largeur; x++) s.cases[x * s.largeur + (g.hauteur - 1 - y)] = lire(g, x, y);
  return s;
}

/** La grille rognée à son contour ; une grille vide devient une seule case vide. */
export function rogner(g: Grille): Grille {
  let [x0, x1, y0, y1] = [g.largeur, -1, g.hauteur, -1];
  for (let y = 0; y < g.hauteur; y++) {
    for (let x = 0; x < g.largeur; x++) {
      if (!lire(g, x, y)) continue;
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
    }
  }
  if (x1 < 0) return vide(1, 1);
  const s = vide(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < s.hauteur; y++) for (let x = 0; x < s.largeur; x++) s.cases[y * s.largeur + x] = lire(g, x0 + x, y0 + y);
  return s;
}

/** Pose `dessus` sur `g`, son coin haut gauche en (ox, oy) ; ce qui dépasse est coupé, une case vide ne cache rien. */
export function poser(g: Grille, dessus: Grille, ox: number, oy: number): void {
  for (let y = 0; y < dessus.hauteur; y++) {
    for (let x = 0; x < dessus.largeur; x++) {
      const c = dessus.cases[y * dessus.largeur + x];
      const [X, Y] = [ox + x, oy + y];
      if (c && X >= 0 && Y >= 0 && X < g.largeur && Y < g.hauteur) g.cases[Y * g.largeur + X] = c;
    }
  }
}

const gaulois = (tenue: Tenue, yeuxFermes = false): Grille => ({ largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: casesDuGaulois(tenue, { yeuxFermes }) });

/**
 * Le vaincu couché sur le côté, la tête à droite (à l'opposé du vainqueur), les yeux fermés, l'arme au-dessus de lui :
 * sa grille retournée puis tournée d'un quart de tour, rognée à son contour. Sa dernière rangée touche le sol.
 */
export const vaincuATerre = (tenue: Tenue): Grille => rogner(quartDeTour(miroir(gaulois(tenue, true))));

/** Trois étoiles au-dessus de la tête du vaincu : il est sonné. Dessin original, 5 × 5 cases chacune. */
const ETOILE = [".kyk.", "kyYyk", "yYwYy", "kyYyk", ".kyk."] as const;
const TEINTES_ETOILE: Readonly<Record<string, string>> = { k: "#3a2a12", y: "#f2b632", Y: "#ffdd80", w: "#fff6d8" };
export function etoiles(): Grille {
  const s = vide(19, 8);
  for (const [ox, oy] of [
    [0, 3],
    [7, 0],
    [14, 3],
  ] as const) {
    ETOILE.forEach((ligne, y) => [...ligne].forEach((l, x) => l !== "." && (s.cases[(oy + y) * s.largeur + ox + x] = TEINTES_ETOILE[l] ?? null)));
  }
  return s;
}

/** Une ombre au sol en ellipse, comme celle de /gaulois (`ombreAuSol` de gaulois.ts), centrée en `cx`. */
function ombre(g: Grille, cx: number, rayon: number, couleur: string): void {
  for (let y = Math.max(0, PIEDS - 3); y <= Math.min(g.hauteur - 1, PIEDS + 3); y++) {
    for (let x = 0; x < g.largeur; x++) if (((x + 0.5 - cx) / rayon) ** 2 + ((y + 0.5 - PIEDS - 0.5) / 2.9) ** 2 <= 1) g.cases[y * g.largeur + x] = couleur;
  }
}

/** La première colonne pleine du corps debout, sous la tête : là où un familier peut se serrer contre son maître. */
function gaucheDuCorps(g: Grille): number {
  for (let x = 0; x < g.largeur; x++) for (let y = SOUS_LA_TETE; y <= SEMELLES; y++) if (lire(g, x, y)) return x;
  return 8;
}

/** Un des deux Gaulois du duel : sa tenue (lue par `lireTenue`) et son familier posé (`familierAPoser`), s'il en montre un. */
export interface Duelliste {
  tenue: Tenue;
  familier: FamilierAPoser | null;
}

/** Le fond d'un duel : la bannière du vaincu, cadre compris, ou, sans elle, la place du village au moment du duel. */
export function fondDuDuel(banniere: string | null, le: Date): Decor {
  return dessinDeLaBanniere(banniere) ?? decorDe(LIEU_DE_SECOURS, momentDeParis(le));
}

/**
 * La scène, en cases : `SCENE_DU_DUEL.largeur` × `SCENE_DU_DUEL.hauteur` couleurs « #rrggbb », rangée par rangée, sans case
 * vide. Ordre du dessin, du fond vers l'avant : le mur et le plancher des coulisses, la bannière, les ombres, les familiers
 * trop larges pour passer devant, le vaincu, ses étoiles, le vainqueur, puis les petits familiers qui passent devant.
 */
export function casesDuDuel(vainqueur: Duelliste, vaincu: Duelliste, fond: Decor): string[] {
  const { largeur, hauteur } = SCENE_DU_DUEL;
  const s = vide(largeur, hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const planche = y - PIEDS + 3;
      const joint = planche % 4 === 0 || (x + (Math.floor(planche / 4) % 2) * 9) % 18 === 0;
      s.cases[y * largeur + x] = planche >= 0 ? (joint ? COULISSE.joint : COULISSE.sol) : (x + y) % 8 === 0 ? COULISSE.mur2 : COULISSE.mur;
    }
  }
  // L'ombre de la toile sur le mur : la bannière est accrochée, pas collée.
  for (let y = 0; y < PIEDS - 3; y++) for (const x of [COULISSES - 1, COULISSES + LARGEUR]) s.cases[y * largeur + x] = COULISSE.ombre;
  poser(s, { largeur: LARGEUR, hauteur: HAUTEUR, cases: [...fond.cases] }, COULISSES, 0);
  const ombreEn = (x: number) => (x < COULISSES || x >= COULISSES + LARGEUR ? COULISSE.ombre : fond.ombre);

  const sol = PIEDS - 1;
  const couche = vaincuATerre(vaincu.tenue);
  const gx = COULISSES + PLACE_DU_VAINQUEUR;
  const vx = COULISSES + DROITE_DU_VAINCU - couche.largeur + 1;
  ombre(s, gx + GAULOIS_LARGEUR / 2, 19, fond.ombre);
  ombre(s, vx + couche.largeur / 2, Math.max(17, couche.largeur * 0.48), fond.ombre);

  // Les familiers : contre leur maître, vers le bord ; trop larges, ils restent derrière lui plutôt que de sortir.
  const debout = gaulois(vainqueur.tenue);
  const devant: (() => void)[] = [];
  const fg = vainqueur.familier;
  if (fg) {
    const voulu = gx + gaucheDuCorps(debout) - 1 - fg.largeur;
    const x = Math.max(1, voulu);
    // Tourné vers le vainqueur, donc vers la droite : son dessin regarde à gauche.
    const dessin = miroir({ largeur: fg.largeur, hauteur: fg.hauteur, cases: fg.cases });
    if (fg.auSol) ombre(s, x + fg.largeur / 2, Math.max(4, fg.largeur * 0.45), ombreEn(x + fg.largeur / 2));
    const dessiner = () => poser(s, dessin, x, PIEDS - 62 + fg.haut);
    if (x > voulu && fg.largeur <= PETIT_FAMILIER) devant.push(dessiner);
    else dessiner();
  }
  const fv = vaincu.familier;
  if (fv) {
    const voulu = vx + couche.largeur + 1;
    const x = Math.min(largeur - 1 - fv.largeur, voulu);
    if (fv.auSol) ombre(s, x + fv.largeur / 2, Math.max(4, fv.largeur * 0.45), ombreEn(x + fv.largeur / 2));
    const dessiner = () => poser(s, { largeur: fv.largeur, hauteur: fv.hauteur, cases: fv.cases }, x, PIEDS - 62 + fv.haut);
    if (x < voulu && fv.largeur <= PETIT_FAMILIER) devant.push(dessiner);
    else dessiner();
  }

  poser(s, couche, vx, sol - couche.hauteur + 1);
  const et = etoiles();
  poser(s, et, vx + couche.largeur - ETOILES_DEPUIS_LA_TETE, Math.max(0, sol - couche.hauteur - et.hauteur));
  poser(s, debout, gx, PIEDS - 62);
  for (const dessiner of devant) dessiner();
  return s.cases.map((c) => c ?? COULISSE.mur);
}
