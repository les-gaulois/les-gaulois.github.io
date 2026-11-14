/**
 * Le socle des dessins du village (docs/DIRECTION.md, « Le village des Gaulois »), en pixels : dessinés case par case pour
 * ce site, sans emprunt à une œuvre existante. Ici, la planche à dessin, le grain qui ne bouge pas et les couleurs du
 * dehors à chaque heure ; le monde du village se compose dans `monde/` (les bâtiments du chantier dans `batiments/`).
 *
 * Tout est calculé, rien n'est tiré au hasard à l'écran : la même largeur et la même lumière donnent toujours le même
 * dessin. Les couleurs du dehors suivent l'heure (`lumiere.ts`) : chacune a sa teinte de jour et sa teinte de nuit. Ce qui
 * éclaire (feu, portes, astres) garde sa couleur. Design : Claude Fable 5.2.
 */
import { type Lumiere, cielDuVillage, couleurDuDehors, melanger } from "./lumiere";

/** Un dessin en cases : `largeur` × `hauteur` couleurs « #rrggbb », rangée par rangée, `null` pour une case vide. */
export interface Decor {
  largeur: number;
  hauteur: number;
  cases: (string | null)[];
}

/** Un nombre de 0 à 1 qui ne dépend que de la case : le même à chaque dessin. */
export function alea(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Une planche à dessin : on y pose des cases, ce qui sort du cadre est ignoré. */
export class Planche {
  readonly cases: (string | null)[];
  constructor(
    readonly largeur: number,
    readonly hauteur: number,
    fond: string | null = null,
  ) {
    this.cases = new Array<string | null>(largeur * hauteur).fill(fond);
  }
  poser(x: number, y: number, couleur: string | null): void {
    if (x >= 0 && x < this.largeur && y >= 0 && y < this.hauteur) this.cases[y * this.largeur + x] = couleur;
  }
  lire(x: number, y: number): string | null {
    return x >= 0 && x < this.largeur && y >= 0 && y < this.hauteur ? (this.cases[y * this.largeur + x] ?? null) : null;
  }
  /** Un rectangle plein, ou coloré case par case. */
  rect(x: number, y: number, l: number, h: number, couleur: string | ((x: number, y: number) => string | null)): void {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + l; i++) {
        const c = typeof couleur === "string" ? couleur : couleur(i, j);
        if (c !== null) this.poser(i, j, c);
      }
    }
  }
  /** Un disque plein. */
  disque(cx: number, cy: number, r: number, couleur: string | ((dx: number, dy: number) => string | null)): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r * 0.4) continue;
        const c = typeof couleur === "string" ? couleur : couleur(dx, dy);
        if (c !== null) this.poser(cx + dx, cy + dy, c);
      }
    }
  }
  /** Un dessin écrit en lettres, une couleur par lettre ; une lettre sans couleur laisse la case. */
  lettres(x: number, y: number, lignes: readonly string[], couleurs: Readonly<Record<string, string>>): void {
    lignes.forEach((ligne, dy) => {
      for (let dx = 0; dx < ligne.length; dx++) {
        const couleur = couleurs[ligne[dx]!];
        if (couleur) this.poser(x + dx, y + dy, couleur);
      }
    });
  }
  decor(): Decor {
    return { largeur: this.largeur, hauteur: this.hauteur, cases: this.cases };
  }
}

/** Les couleurs du dehors à une lumière donnée. */
export function paletteDuDehors(l: Lumiere) {
  const c = (deJour: string, deNuit: string) => couleurDuDehors(deJour, deNuit, l);
  const nuit = 1 - l.jour;
  return {
    nuit,
    ciel: cielDuVillage(l),
    herbe: { fond: c("#3f8a3c", "#1f4a2c"), claire: c("#5aa84a", "#2f6a3d"), sombre: c("#2f6e33", "#173a22"), bord: c("#4f9a45", "#2a5c36") },
    terre: { fond: c("#8a6a45", "#5a4630"), claire: c("#a07d52", "#6b5439"), sombre: c("#735638", "#4a3926") },
    bois: {
      fond: c("#8a5a30", "#5d3d22"),
      autre: c("#966437", "#684627"),
      clair: c("#b07a44", "#7d5631"),
      sombre: c("#6a4424", "#472d19"),
      creux: c("#3d2616", "#2a1a10"),
      corde: c("#c9b278", "#8a7a55"),
      cordeSombre: c("#a08c5c", "#6a5c3e"),
    },
    chaume: { fond: c("#d9b04e", "#a8853a"), clair: c("#f0cc68", "#c29f4c"), sombre: c("#b48c3a", "#86682b"), brin: c("#9c7a30", "#735826"), rang: c("#a8823a", "#7c6029"), bord: c("#80622a", "#5f4a1f") },
    mur: { fond: c("#d8b47a", "#b08f5c"), clair: c("#ecca90", "#c4a46e"), sombre: c("#b89260", "#8f7045"), trame: c("#c4a06a", "#9c7c4c"), ombre: c("#987650", "#74593a") },
    feuilles: { fond: c("#2f8a48", "#1d5a36"), claire: c("#48ad5c", "#2c7a48"), sombre: c("#216b38", "#134226") },
    tronc: { clair: c("#7a5230", "#5f3f25"), fond: c("#63411f", "#4a301c"), sombre: c("#4f3218", "#38230f") },
    foret: { loin: c("#5f9a8a", "#0c1d36"), pres: c("#2f7a55", "#0f2c33"), presClaire: c("#3d8c5f", "#143a3c") },
    /** L'autre clan, de l'autre côté du champ : des toiles prune. */
    prune: { fond: c("#7a5a94", "#3f2f58"), clair: c("#9a7ab4", "#54406e"), sombre: c("#5a4070", "#2c2040"), trait: c("#3a2848", "#1c1428") },
    /** L'herbe éclairée par le feu : à peine le jour, nettement la nuit. */
    lueur: melanger(c("#3f8a3c", "#1f4a2c"), "#8a8f3a", 0.1 + 0.34 * nuit),
  };
}
export type Palette = ReturnType<typeof paletteDuDehors>;

/** Où est l'astre dans un ciel de cette largeur : le milieu de son disque, en cases. */
export function placeDeLAstre(l: Lumiere, largeur: number): { x: number; y: number } | null {
  if (!l.astre) return null;
  return { x: Math.round(14 + l.astre.course * (largeur - 28)), y: Math.round(44 - l.astre.hauteur * 34) };
}
