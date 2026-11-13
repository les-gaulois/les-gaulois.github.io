import { useEffect, useRef } from "preact/hooks";
import { casesDuStatere, type TailleStatere } from "../../../supabase/functions/code-discord/statere";
import { RARETES, type Rarete } from "../../lib/gaulois";
import { nombre } from "../../lib/village/ecran-boutique";

/** Des cases de couleur peintes telles quelles dans une toile, que la feuille de style agrandit sans flou. */
export function peindre(toile: HTMLCanvasElement | null, largeur: number, hauteur: number, cases: readonly (string | null)[]): void {
  const contexte = toile?.getContext("2d");
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
}

/**
 * Un dessin en pixels, décoratif : chaque case vaut `echelle` pixels, un nombre entier, pour des bords nets. Ce qu'il
 * montre est toujours écrit à côté.
 */
export function Pixels({ largeur, hauteur, cases, echelle, class: classe = "" }: { largeur: number; hauteur: number; cases: readonly (string | null)[]; echelle: number; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, largeur, hauteur, cases), [largeur, hauteur, cases]);
  return <canvas ref={toile} width={largeur} height={hauteur} class={`pixels ${classe}`} style={{ width: `${largeur * echelle}px`, height: `${hauteur * echelle}px` }} aria-hidden="true" />;
}

const PIECES = new Map<TailleStatere, (string | null)[]>();
const piece = (taille: TailleStatere): (string | null)[] => {
  let cases = PIECES.get(taille);
  if (!cases) PIECES.set(taille, (cases = casesDuStatere(taille)));
  return cases;
};

/** Le statère, la pièce du village : décorative, le mot « statères » est toujours écrit ou dit à côté. */
export function Piece({ taille = 16, echelle = 1 }: { taille?: TailleStatere; echelle?: number }) {
  return <Pixels largeur={taille} hauteur={taille} cases={piece(taille)} echelle={echelle} class="piece" />;
}

/** Un prix : la pièce et le nombre. Les lecteurs d'écran entendent « 2 500 statères ». */
export function Prix({ montant, class: classe = "" }: { montant: number; class?: string }) {
  return (
    <span class={`prix ${classe}`}>
      <Piece />
      <span class="tnum">{nombre(montant)}</span>
      <span class="sr-only"> statères</span>
    </span>
  );
}

/** La rareté, écrite et comptée en losanges, de un à cinq : la couleur n'est jamais le seul repère. */
export function MarqueDeRarete({ rarete }: { rarete: Rarete }) {
  return (
    <span class="case-rarete">
      <span class="case-rang" aria-hidden="true">
        {Array.from({ length: RARETES[rarete].rang }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      {RARETES[rarete].nom}
    </span>
  );
}
