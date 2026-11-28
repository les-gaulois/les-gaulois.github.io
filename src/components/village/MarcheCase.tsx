import { useMemo } from "preact/hooks";
import { casesDuStatere, type TailleStatere } from "../../../supabase/functions/code-discord/statere";
import { fmtInt } from "../../lib/format";
import { nombre } from "../../lib/village/ecran-boutique";
import { vignetteDeLObjet } from "../../lib/gaulois";
import type { ObjetDuMarche } from "../../lib/village/ecran-marche";
import { Toile } from "./PlaceToile";
import { cleDeLObjet } from "../../lib/village/fonds-objets";
import { CarteDeCosmetique } from "./CarteDeCosmetique";

/** La pièce, en pixels nets : décorative, le mot « statères » est écrit ou dit à côté. */
export function Piece({ taille = 16, echelle = 1 }: { taille?: TailleStatere; echelle?: number }) {
  const cases = useMemo(() => casesDuStatere(taille), [taille]);
  return <Toile largeur={taille} hauteur={taille} cases={cases} echelle={echelle} class="marche-piece" />;
}

/** Un prix : la pièce et le nombre ; « statères » est dit aux lecteurs d'écran. */
export function Prix({ valeur, class: classe = "" }: { valeur: number; class?: string }) {
  return (
    <span class={`marche-prix tnum ${classe}`}>
      <Piece />
      {nombre(valeur)}
      <span class="sr-only"> {Math.abs(valeur) > 1 ? "statères" : "statère"}</span>
    </span>
  );
}

/**
 * La carte d'un objet du marché : la carte des cosmétiques, modèle unique (28 novembre 2026). `quantite` : le nombre
 * d'exemplaires, écrit sous la carte à partir de deux. `mention` : quelques mots de plus sous la carte.
 */
export function CaseObjet({ objet, quantite, mention }: { objet: ObjetDuMarche; quantite?: number; mention?: string }) {
  const vignette = useMemo(() => vignetteDeLObjet(objet.emplacement, objet.objet), [objet.emplacement, objet.objet]);
  const plusieurs = quantite !== undefined && quantite > 1;
  return (
    <CarteDeCosmetique
      nom={objet.nom}
      rarete={objet.rarete}
      cle={cleDeLObjet(objet.emplacement, objet.objet)}
      dessin={vignette}
      etat={
        plusieurs || mention ? (
          <>
            {plusieurs && <span class="marche-case-nombre tnum">{fmtInt(quantite)} exemplaires</span>}
            {mention && <span class="marche-case-nombre">{mention}</span>}
          </>
        ) : null
      }
    />
  );
}
