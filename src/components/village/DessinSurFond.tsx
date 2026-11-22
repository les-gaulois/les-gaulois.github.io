import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { imageSurFond, tailleDuFond, type DessinEnCases, type PoseDeLaChose } from "../../lib/village/fonds-objets";
import { echelleEntiere } from "../../lib/village/vestiaire-rayons";
import { Pixels, peindre } from "./BoutiquePixels";

/**
 * Le dessin d'une chose (objet, familier, Gaulois unique) sur son fond d'objet (`src/lib/village/fonds-objets/`, demande
 * du pilote du 22 novembre 2026 : « un fond derrière qui soit propre »). La chose garde la taille qu'elle avait sans fond :
 * agrandie d'un nombre entier de fois pour tenir dans `place` pixels. Le fond, au même grain, remplit la boîte où le dessin
 * est posé (sa largeur et sa hauteur mesurées), à une case près. Décoratif : ce qu'il montre est écrit à côté.
 *
 * Sans `fond`, le dessin seul, comme avant.
 */
export function DessinSurFond({
  dessin,
  fond,
  rarete = null,
  place = 80,
  maximum = 3,
  pose = "centre",
  class: classe = "",
}: {
  dessin: DessinEnCases;
  /** La clé du fond (`cleDeLObjet`, `cleDuFamilier`, `cleDuModele`), ou `null` pour le dessin seul. */
  fond: string | null;
  rarete?: string | null;
  place?: number;
  maximum?: number;
  pose?: PoseDeLaChose;
  class?: string;
}) {
  const echelle = echelleEntiere(dessin.largeur, dessin.hauteur, place, maximum);
  if (!fond) return <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={echelle} class={classe} />;
  return <Composition dessin={dessin} fond={fond} rarete={rarete} echelle={echelle} pose={pose} classe={classe} />;
}

/** La boîte par défaut, avant la première mesure : celle de la case du vestiaire d'avant. */
const BOITE_PAR_DEFAUT = { largeur: 112, hauteur: 76 } as const;

function Composition({ dessin, fond, rarete, echelle, pose, classe }: { dessin: DessinEnCases; fond: string; rarete: string | null; echelle: number; pose: PoseDeLaChose; classe: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const boite = useBoiteDuParent(toile);
  const taille = tailleDuFond(boite.largeur, boite.hauteur, echelle, dessin);
  const image = useMemo(() => imageSurFond(fond, dessin, { largeur: taille.largeur, hauteur: taille.hauteur, rarete, pose }), [fond, dessin, taille.largeur, taille.hauteur, rarete, pose]);
  useEffect(() => peindre(toile.current, image.largeur, image.hauteur, image.cases), [image]);
  return (
    <canvas
      ref={toile}
      width={image.largeur}
      height={image.hauteur}
      class={`pixels dessin-sur-fond ${classe}`}
      style={{ width: `${image.largeur * echelle}px`, height: `${image.hauteur * echelle}px` }}
      aria-hidden="true"
      data-fond={fond}
    />
  );
}

/**
 * Les boîtes observées et ce qu'il faut rappeler quand l'une change de taille (plusieurs dessins peuvent partager une
 * boîte) : un seul observateur pour toute la page.
 */
const RAPPELS = new WeakMap<Element, Set<() => void>>();
let observateur: ResizeObserver | null = null;
const observer = (el: Element, rappel: () => void): (() => void) => {
  if (typeof ResizeObserver !== "function") return () => undefined;
  observateur ??= new ResizeObserver((entrees) => {
    for (const e of entrees) for (const r of RAPPELS.get(e.target) ?? []) r();
  });
  let rappels = RAPPELS.get(el);
  if (!rappels) {
    rappels = new Set();
    RAPPELS.set(el, rappels);
    observateur.observe(el);
  }
  rappels.add(rappel);
  return () => {
    const restants = RAPPELS.get(el);
    restants?.delete(rappel);
    if (restants && restants.size === 0) {
      RAPPELS.delete(el);
      observateur?.unobserve(el);
    }
  };
};

/**
 * La place, en pixels, que la boîte qui porte la toile lui laisse (sa largeur et sa hauteur sans les marges intérieures),
 * suivie quand elle change. La toile elle-même ne compte pas : la boîte doit avoir sa propre taille (`.case-image`).
 */
function useBoiteDuParent(toile: { current: HTMLCanvasElement | null }): { largeur: number; hauteur: number } {
  const [boite, setBoite] = useState<{ largeur: number; hauteur: number }>(BOITE_PAR_DEFAUT);
  useLayoutEffect(() => {
    const parent = toile.current?.parentElement;
    if (!parent) return;
    const mesurer = (): void => {
      const style = getComputedStyle(parent);
      const largeur = Math.floor(parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const hauteur = Math.floor(parent.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      // Une boîte pas encore dans la page (la vraie carte d'un booster, dessinée avant d'être posée) ne se mesure pas.
      if (!(largeur > 0) || !(hauteur > 0)) return;
      setBoite((avant) => (avant.largeur === largeur && avant.hauteur === hauteur ? avant : { largeur, hauteur }));
    };
    mesurer();
    return observer(parent, mesurer);
  }, [toile]);
  return boite;
}
