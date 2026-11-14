import type { Decor } from "../../../lib/village/decor";

/**
 * Les dessins tout faits de la foule (`MondeHabitants.tsx`) : chaque Gaulois, dans chaque pose qu'on lui voit, est peint
 * une fois dans une petite image gardée en mémoire, que la toile de la foule recopie d'un coup à chaque temps. Une image
 * toute faite (`ImageBitmap`) quand le navigateur sait la faire tout de suite, sinon une petite toile : le dessin est le
 * même. Les plus anciennes s'oublient au-delà de `max` (la mémoire reste stable, même à 1 000 Gaulois).
 */

/** Un dessin prêt à poser : sa source et sa taille, en cases. */
export interface DessinPret {
  source: CanvasImageSource;
  largeur: number;
  hauteur: number;
}

/** Les couleurs déjà lues : « #rrggbb » vers leurs trois nombres, dans un seul entier. */
const LUES = new Map<string, number>();

function rvb(couleur: string): number {
  let valeur = LUES.get(couleur);
  if (valeur === undefined) {
    valeur = parseInt(couleur.slice(1, 7), 16);
    LUES.set(couleur, valeur);
  }
  return valeur;
}

/** Une toile hors de la page, de cette taille : `OffscreenCanvas` si le navigateur l'a, sinon une toile ordinaire jamais posée. */
function toileHorsPage(largeur: number, hauteur: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(largeur, hauteur);
  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  return toile;
}

/**
 * Peint des cases dans une image toute faite, case pour case. `alpha` : l'opacité des cases peintes (0 à 255) ; une case
 * vide reste transparente.
 */
export function preparer(largeur: number, hauteur: number, cases: readonly (string | boolean | null)[], couleur = 0, alpha = 255): DessinPret | null {
  const toile = toileHorsPage(largeur, hauteur);
  const contexte = toile.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!contexte) return null;
  const image = contexte.createImageData(largeur, hauteur);
  const donnees = image.data;
  for (let i = 0; i < cases.length && i < largeur * hauteur; i++) {
    const c = cases[i];
    if (!c) continue;
    const valeur = typeof c === "string" ? rvb(c) : couleur;
    donnees[i * 4] = (valeur >> 16) & 255;
    donnees[i * 4 + 1] = (valeur >> 8) & 255;
    donnees[i * 4 + 2] = valeur & 255;
    donnees[i * 4 + 3] = alpha;
  }
  contexte.putImageData(image, 0, 0);
  // Une image toute faite, tout de suite, quand le navigateur sait la donner ; sinon la petite toile elle-même.
  if ("transferToImageBitmap" in toile && typeof toile.transferToImageBitmap === "function") {
    try {
      return { source: toile.transferToImageBitmap(), largeur, hauteur };
    } catch {
      // la toile sert telle quelle
    }
  }
  return { source: toile, largeur, hauteur };
}

/** Oublie une image toute faite : sa mémoire est rendue tout de suite. */
function oublier(dessin: DessinPret): void {
  if (typeof ImageBitmap === "function" && dessin.source instanceof ImageBitmap) dessin.source.close();
}

/**
 * L'atelier : les dessins tout faits, par clé (la tenue et la pose). `prendre` rend celui de la clé, fait à la demande ;
 * le plus ancien non servi s'oublie au-delà de `max`. `faire` peut rendre `null` (le dessin n'existe pas) : rien n'est posé.
 */
export class Atelier {
  private dessins = new Map<string, DessinPret | null>();
  constructor(private readonly max = 2400) {}

  get taille(): number {
    return this.dessins.size;
  }

  /** Le dessin de cette clé s'il est déjà fait (`undefined` sinon), sans le faire. */
  deja(cle: string): DessinPret | null | undefined {
    const dessin = this.dessins.get(cle);
    if (dessin !== undefined) {
      // Servi : il passe en dernier, loin de l'oubli.
      this.dessins.delete(cle);
      this.dessins.set(cle, dessin);
    }
    return dessin;
  }

  prendre(cle: string, faire: () => Decor | null): DessinPret | null {
    const deja = this.deja(cle);
    if (deja !== undefined) return deja;
    const decor = faire();
    const dessin = decor ? preparer(decor.largeur, decor.hauteur, decor.cases) : null;
    this.dessins.set(cle, dessin);
    while (this.dessins.size > this.max) {
      const [ancienne, vieux] = this.dessins.entries().next().value as [string, DessinPret | null];
      if (vieux) oublier(vieux);
      this.dessins.delete(ancienne);
    }
    return dessin;
  }

  vider(): void {
    for (const dessin of this.dessins.values()) if (dessin) oublier(dessin);
    this.dessins.clear();
  }
}
