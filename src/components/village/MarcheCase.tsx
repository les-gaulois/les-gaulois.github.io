import { useMemo } from "preact/hooks";
import { casesDuStatere, type TailleStatere } from "../../../supabase/functions/code-discord/statere";
import { fmtInt } from "../../lib/format";
import { RARETES, vignetteDeLObjet } from "../../lib/gaulois";
import type { ObjetDuMarche } from "../../lib/village/ecran-marche";
import { Toile } from "./PlaceToile";

/** La pièce, en pixels nets : décorative, le mot « statères » est écrit ou dit à côté. */
export function Piece({ taille = 16 }: { taille?: TailleStatere }) {
  const cases = useMemo(() => casesDuStatere(taille), [taille]);
  return <Toile largeur={taille} hauteur={taille} cases={cases} echelle={1} class="marche-piece" />;
}

/** Un prix : la pièce et le nombre ; « statères » est dit aux lecteurs d'écran. */
export function Prix({ valeur, class: classe = "" }: { valeur: number; class?: string }) {
  return (
    <span class={`marche-prix tnum ${classe}`}>
      <Piece />
      {fmtInt(valeur)}
      <span class="sr-only"> {Math.abs(valeur) > 1 ? "statères" : "statère"}</span>
    </span>
  );
}

/** Le côté, en pixels, de la place de l'image dans une case : la vignette s'y agrandit d'un nombre entier de fois. */
const COTE_IMAGE = 80;

/**
 * La case d'un objet, comme au vestiaire : son image en pixels nets, son nom, sa rareté écrite et comptée en losanges (la
 * couleur du cadre n'est jamais le seul repère). `quantite` : le nombre d'exemplaires, écrit à partir de deux. `mention` :
 * quelques mots de plus sous la rareté.
 */
export function CaseObjet({ objet, quantite, mention }: { objet: ObjetDuMarche; quantite?: number; mention?: string }) {
  const vignette = useMemo(() => vignetteDeLObjet(objet.emplacement, objet.objet), [objet.emplacement, objet.objet]);
  const rarete = RARETES[objet.rarete];
  const echelle = vignette ? Math.max(1, Math.min(3, Math.floor(COTE_IMAGE / Math.max(vignette.largeur, vignette.hauteur)))) : 1;
  return (
    <span class="marche-case" data-rarete={objet.rarete}>
      <span class="marche-case-image">{vignette && <Toile largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} />}</span>
      <span class="marche-case-nom">{objet.nom}</span>
      <span class="marche-case-rarete">
        <span class="marche-case-rang" aria-hidden="true">
          {Array.from({ length: rarete.rang }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        {rarete.nom}
      </span>
      {quantite !== undefined && quantite > 1 && (
        <span class="marche-case-nombre tnum">{fmtInt(quantite)} exemplaires</span>
      )}
      {mention && <span class="marche-case-nombre">{mention}</span>}
    </span>
  );
}
