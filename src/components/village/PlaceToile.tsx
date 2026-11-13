import { useEffect, useRef } from "preact/hooks";

/**
 * Un dessin en cases peint tel quel dans une toile, que la feuille de style agrandit sans flou (`.village-pixels`) : le
 * même rendu que le vestiaire. `echelle` : le côté d'une case en pixels, toujours entier ; sans elle, la taille vient de
 * la feuille de style. Décorative par défaut : ce qu'elle montre est écrit à côté.
 */
export function Toile({ largeur, hauteur, cases, echelle, class: classe = "" }: { largeur: number; hauteur: number; cases: readonly (string | null)[]; echelle?: number; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const contexte = toile.current?.getContext("2d");
    if (!contexte) return;
    const image = contexte.createImageData(largeur, hauteur);
    cases.forEach((couleur, i) => {
      if (!couleur) return;
      image.data[i * 4] = parseInt(couleur.slice(1, 3), 16);
      image.data[i * 4 + 1] = parseInt(couleur.slice(3, 5), 16);
      image.data[i * 4 + 2] = parseInt(couleur.slice(5, 7), 16);
      image.data[i * 4 + 3] = 255;
    });
    contexte.putImageData(image, 0, 0);
  }, [largeur, hauteur, cases]);
  return <canvas ref={toile} width={largeur} height={hauteur} class={`village-pixels ${classe}`} style={echelle ? { width: `${largeur * echelle}px`, height: `${hauteur * echelle}px` } : undefined} aria-hidden="true" />;
}

/** Le même dessin en image à répéter, pour un fond : son adresse `data:`. `null` hors d'un navigateur. */
export function imageDeFond(largeur: number, hauteur: number, cases: readonly (string | null)[]): string | null {
  if (typeof document === "undefined") return null;
  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext("2d");
  if (!contexte) return null;
  cases.forEach((couleur, i) => {
    if (!couleur) return;
    contexte.fillStyle = couleur;
    contexte.fillRect(i % largeur, Math.floor(i / largeur), 1, 1);
  });
  return toile.toDataURL("image/png");
}
