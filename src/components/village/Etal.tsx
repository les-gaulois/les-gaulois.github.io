import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { DecorDeBanniere } from "../../lib/village/decor-banniere";
import { NOMS_ENTIERS, NOMS_SUR_L_ETAL, POCHETTES_DE_L_ETAL, motsDesGagnees, type PochetteDeLEtal } from "../../lib/village/etal";
import { Prix, peindre } from "./BoutiquePixels";

/**
 * L'étal des pochettes (17 novembre 2026, « B, une à la fois », choisi par le pilote sur exemples). Dessin de Claude
 * Fable 5.2 : un auvent rayé, une planche de bois, les cinq pochettes posées dessus devant la bannière du membre, comme le
 * sentier la prend pour décor. Chaque pochette est un bouton : celle qui est choisie se soulève, et l'onglet ne montre
 * dessous que sa carte. Son étiquette dit son nom, son prix quand il est lu, et combien ont été gagnées à la loterie.
 */
export function EtalDesPochettes({
  choisie,
  dessins,
  prix,
  gagnees,
  decor,
  onChoisir,
}: {
  choisie: PochetteDeLEtal;
  dessins: Readonly<Record<PochetteDeLEtal, ComponentChildren>>;
  /** Le prix de chaque pochette ; `null` tant qu'il n'est pas lu : il ne s'écrit pas. */
  prix: Readonly<Record<PochetteDeLEtal, number | null>>;
  gagnees: Readonly<Partial<Record<PochetteDeLEtal, number>>>;
  decor: DecorDeBanniere | null;
  onChoisir: (pochette: PochetteDeLEtal) => void;
}) {
  // La bannière en fond : peinte une fois hors de l'écran, puis posée en image de fond, répétée sur la largeur.
  const etal = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = etal.current;
    if (!el) return;
    if (!decor) {
      el.style.removeProperty("--etal-fond");
      return;
    }
    const toile = document.createElement("canvas");
    toile.width = decor.largeur;
    toile.height = decor.hauteur;
    peindre(toile, decor.largeur, decor.hauteur, decor.cases);
    try {
      el.style.setProperty("--etal-fond", `url(${toile.toDataURL()})`);
    } catch {
      // Sans image de fond, l'étal garde sa couleur unie.
    }
  }, [decor]);
  return (
    <div ref={etal} class="etal" data-decor={decor ? "" : undefined} data-testid="etal">
      <span class="etal-auvent" aria-hidden="true" />
      <div class="etal-rang" role="group" aria-label="Choisir un booster">
        {POCHETTES_DE_L_ETAL.map((id, i) => {
          const gagnee = motsDesGagnees(gagnees[id]);
          const montant = prix[id];
          return (
            <button key={id} type="button" class="etal-pochette" style={`--i:${i}`} aria-pressed={id === choisie} onClick={() => onChoisir(id)} data-testid={`etal-${id}`}>
              <span class="etal-dessin" aria-hidden="true">
                {dessins[id]}
              </span>
              <b class="etal-nom">
                <span class="sr-only">{NOMS_ENTIERS[id]}</span>
                <span aria-hidden="true">{NOMS_SUR_L_ETAL[id]}</span>
              </b>
              {montant !== null && (
                <>
                  <span class="sr-only">, </span>
                  <Prix montant={montant} class="etal-prix" />
                </>
              )}
              {gagnee && (
                <span class="etal-gagnee" data-testid={`etal-gagnee-${id}`}>
                  <span class="sr-only">, </span>
                  {gagnee}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <span class="etal-planche" aria-hidden="true" />
    </div>
  );
}
