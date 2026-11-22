import { useMemo } from "preact/hooks";
import { casesDuStatere, type TailleStatere } from "../../../supabase/functions/code-discord/statere";
import { fmtInt } from "../../lib/format";
import { nombre } from "../../lib/village/ecran-boutique";
import { RARETES, vignetteDeLObjet } from "../../lib/gaulois";
import type { ObjetDuMarche } from "../../lib/village/ecran-marche";
import { Toile } from "./PlaceToile";
import { IconeDeRarete } from "./IconeDeRarete";
import { DessinSurFond } from "./DessinSurFond";
import { cleDeLObjet } from "../../lib/village/fonds-objets";
import { HabitDeCarte, RangDuDuel, RefletDeCarte, suivreLePointeur, useBulleDesEffets, variablesDeLaCarte } from "./CarteDObjet";
import { styleDeCarte } from "../../lib/jeu/cartes-d-objets";
import { useEffetsDeLaChose } from "./effets-des-cartes";

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

/** Le côté, en pixels, de la place de l'image dans une case : la vignette s'y agrandit d'un nombre entier de fois. */
const COTE_IMAGE = 80;

/**
 * La case d'un objet, comme au vestiaire : son image en pixels nets, son nom, sa rareté écrite, avec son icône (la
 * couleur du cadre n'est jamais le seul repère). `quantite` : le nombre d'exemplaires, écrit à partir de deux. `mention` :
 * quelques mots de plus sous la rareté.
 */
export function CaseObjet({ objet, quantite, mention }: { objet: ObjetDuMarche; quantite?: number; mention?: string }) {
  const vignette = useMemo(() => vignetteDeLObjet(objet.emplacement, objet.objet), [objet.emplacement, objet.objet]);
  const rarete = RARETES[objet.rarete];
  const cle = cleDeLObjet(objet.emplacement, objet.objet);
  const effets = useEffetsDeLaChose(cle);
  const bulle = useBulleDesEffets(objet.nom, effets);
  const style = styleDeCarte(objet.rarete);
  const suivre = style !== "lisse" ? suivreLePointeur() : null;
  // Une carte, comme au vestiaire (22 novembre 2026) : le nom en haut, l'image, la rareté, et pour qui voit le duel son rang.
  return (
    <span
      class="marche-case case-carte co-carte"
      data-carte={style}
      data-rarete={objet.rarete}
      style={variablesDeLaCarte(objet.rarete)}
      onPointerMove={suivre?.onPointerMove}
      onPointerLeave={(e) => {
        suivre?.onPointerLeave(e);
        bulle.onPointerLeave();
      }}
      onPointerEnter={bulle.onPointerEnter}
    >
      <HabitDeCarte rarete={objet.rarete} />
      <span class="marche-case-nom co-nom">{objet.nom}</span>
      <span class="marche-case-image" data-fond={vignette ? "" : undefined}>
        {vignette && <DessinSurFond dessin={vignette} fond={cle} rarete={objet.rarete} place={COTE_IMAGE} />}
        <RefletDeCarte rarete={objet.rarete} />
      </span>
      <span class="marche-case-rarete">
        <span class="marche-case-rang" aria-hidden="true">
          <IconeDeRarete rarete={objet.rarete} />
        </span>
        {rarete.nom}
      </span>
      {effets?.duel && <RangDuDuel duel={effets.duel} />}
      {quantite !== undefined && quantite > 1 && (
        <span class="marche-case-nombre tnum">{fmtInt(quantite)} exemplaires</span>
      )}
      {mention && <span class="marche-case-nombre">{mention}</span>}
    </span>
  );
}
