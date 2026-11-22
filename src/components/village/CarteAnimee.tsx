import { useEffect, useMemo, useRef } from "preact/hooks";
import { familierAPoser } from "../../../supabase/functions/code-discord/familiers/familier.ts";
import { poseSurLaCarte } from "../../lib/carte-familier-pose";
import { HAUTEUR_DU_CADRE, LARGEUR_DU_CADRE, type CadreDeCarte } from "../../lib/fx/cadres-carte";
import { HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE } from "../../lib/fx/finitions-carte";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, type Tenue } from "../../lib/gaulois";
import type { FinitionDuRayon } from "../../lib/village/cartes";
import type { Familier } from "../../lib/village/familiers";
import { monterLesCartes } from "../../scripts/cartes-mouvement";
import { peindre } from "./BoutiquePixels";

/**
 * La carte d'un membre, animée, dans « Mon Gaulois » : la même que celles de l'accueil et de la fiche (`04-poste.css`),
 * avec son Gaulois devant une bannière et une finition. Elle est la carte du milieu du défilé des finitions et des cadres
 * (`Cartes.tsx`, `Cadres.tsx`) et paraît dans les aperçus de la bannière (`Bannieres.tsx`). Sans finition : le reflet
 * offert. Décorative.
 *
 * Le familier du membre, s'il en montre un, est posé en bas à droite, devant le Gaulois (demande du pilote, 17 novembre
 * 2026 ; `src/lib/carte-familier-pose.ts`).
 */
export function CarteAnimee({ finition, tenue, fond, classe, sonde = false, familier = null, cadre = null, nom = null }: { finition: FinitionDuRayon | null; tenue: Tenue; fond: string | undefined; classe: string; sonde?: boolean; familier?: Familier | null; cadre?: CadreDeCarte | null; /** Le pseudo sur la plaque du bas, comme sur le podium et la fiche (« Ma carte ») ; sans lui, pas de plaque. */ nom?: string | null }) {
  const racine = useRef<HTMLDivElement>(null);
  const gaulois = useRef<HTMLCanvasElement>(null);
  const cases = useMemo(() => casesDuGaulois(tenue), [tenue]);
  const cle = `${finition?.id ?? "offert"}/${cadre ?? ""}`;
  const compagnon = useRef<HTMLCanvasElement>(null);
  const pose = useMemo(() => (familier ? familierAPoser(familier) : null), [familier]);
  const place = pose ? poseSurLaCarte(pose) : null;
  useEffect(() => {
    peindre(gaulois.current, GAULOIS_LARGEUR, GAULOIS_HAUTEUR, cases);
    if (pose) peindre(compagnon.current, pose.largeur, pose.hauteur, pose.cases);
  }, [cases, cle, pose]);
  // À chaque finition, la carte est refaite (`key`) et son mouvement repart.
  useEffect(() => (racine.current ? monterLesCartes(racine.current, { sonde }) : undefined), [cle, sonde]);
  return (
    <div ref={racine} class={classe} aria-hidden="true">
      <div class="podium-carte-case">
        <div key={cle} class="podium-carte" data-metal="or" data-finition={finition?.id} data-reflet={finition && !finition.animee ? "" : undefined} data-cadre={cadre ?? undefined}>
          <span class="podium-carte-face" style={fond}>
            <canvas class="podium-carte-fx" data-toile="fond" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
            <i class="podium-carte-holo" />
            <i class="podium-carte-eclat" />
          </span>
          <span class="podium-carte-gaulois" style={`--w:${GAULOIS_LARGEUR};--h:${GAULOIS_HAUTEUR};--e:0.78`}>
            <canvas ref={gaulois} width={GAULOIS_LARGEUR} height={GAULOIS_HAUTEUR} />
          </span>
          <canvas class="podium-carte-fx podium-carte-fx-devant" data-toile="devant" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
          {cadre && <canvas class="podium-carte-cadre" data-toile="cadre" width={LARGEUR_DU_CADRE} height={HAUTEUR_DU_CADRE} />}
          {pose && place && <canvas ref={compagnon} class="podium-carte-familier" width={pose.largeur} height={pose.hauteur} style={`--fw:${pose.largeur};--fh:${pose.hauteur};--fe:${place.echelle.toFixed(3)};--lever:${place.lever}`} />}
          {nom && (
            <span class="podium-carte-bas">
              <span class="podium-carte-nom">{nom}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Le reflet d'une finition étiré sur un bloc, comme sur le premier bloc de la fiche d'un membre (`.bloc-effet`,
 * `04-poste.css`) : pour un aperçu, immobile, légèrement incliné pour que le dessin se voie. Rien pour une animation en
 * pixels, qui reste sur la carte.
 */
export function RefletDeBloc({ finition }: { finition: FinitionDuRayon | null }) {
  if (!finition || finition.animee) return null;
  return (
    <span class="bloc-effet" aria-hidden="true" data-testid="apercu-reflet">
      <span class="podium-carte" data-finition={finition.id} data-reflet="" style="--carte-mx:0.3;--carte-my:-0.15">
        <span class="podium-carte-face">
          <i class="podium-carte-holo" />
          <i class="podium-carte-eclat" />
        </span>
      </span>
    </span>
  );
}
