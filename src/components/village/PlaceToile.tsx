import { useEffect, useRef } from "preact/hooks";

/** Les couleurs déjà lues : « #rrggbb » vers ses trois nombres. Un décor n'en compte que quelques dizaines. */
const LUES = new Map<string, readonly [number, number, number]>();

/** Peint un dessin en cases dans une toile de la même taille, case pour case. Une case vide reste transparente. */
export function peindre(toile: HTMLCanvasElement | null, largeur: number, hauteur: number, cases: readonly (string | null)[]): void {
  const contexte = toile?.getContext("2d");
  if (!contexte) return;
  const image = contexte.createImageData(largeur, hauteur);
  const donnees = image.data;
  for (let i = 0; i < cases.length; i++) {
    const couleur = cases[i];
    if (!couleur) continue;
    let rvb = LUES.get(couleur);
    if (!rvb) {
      rvb = [parseInt(couleur.slice(1, 3), 16), parseInt(couleur.slice(3, 5), 16), parseInt(couleur.slice(5, 7), 16)];
      LUES.set(couleur, rvb);
    }
    donnees[i * 4] = rvb[0];
    donnees[i * 4 + 1] = rvb[1];
    donnees[i * 4 + 2] = rvb[2];
    donnees[i * 4 + 3] = 255;
  }
  contexte.putImageData(image, 0, 0);
}

/**
 * Un dessin en cases peint tel quel dans une toile, que la feuille de style agrandit sans flou (`.village-pixels`) : le
 * même rendu que le vestiaire. `echelle` : le côté d'une case en pixels, toujours entier ; sans elle, la taille vient de
 * la feuille de style. Décorative par défaut : ce qu'elle montre est écrit à côté.
 */
export function Toile({ largeur, hauteur, cases, echelle, class: classe = "" }: { largeur: number; hauteur: number; cases: readonly (string | null)[]; echelle?: number; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, largeur, hauteur, cases), [largeur, hauteur, cases]);
  return <canvas ref={toile} width={largeur} height={hauteur} class={`village-pixels ${classe}`} style={echelle ? { width: `${largeur * echelle}px`, height: `${hauteur * echelle}px` } : undefined} aria-hidden="true" />;
}
