import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Tenue } from "../../../lib/gaulois";
import type { Decor } from "../../../lib/village/decor";
import { type DedansALEcran, dedansALEcran, dedansAvecLeGaulois, gauloisDebout, imageDuDedans, phraseDuDedans } from "../../../lib/village/ecran-interieur";
import type { DessinDInterieur } from "../../../lib/village/interieurs";
import { ICONES_DES_LIEUX } from "../../../lib/village/lieux-icones";
import { type Lumiere, cleDeLumiere } from "../../../lib/village/lumiere";
import { TEMPS_PAR_SECONDE } from "../../../lib/village/mouvement";
import { peindre } from "../PlaceToile";
import type { Horloge } from "./horloge";
import { CadreDeFenetre } from "./MondeInterface";

/**
 * La fenêtre d'un intérieur (idée « Entrer dans les bâtiments », 15 novembre 2026) : un bâtiment du chantier fini s'ouvre
 * sur son dedans, dessiné case par case et vu de côté comme une maison de poupée (`../../../lib/village/interieurs/`,
 * design Claude Fable 5.2), avec le Gaulois du visiteur debout à sa place. Une seule fenêtre à la fois, comme les autres :
 * même barre, même Échap, et l'adresse `#interieur-moulin`. Le titre est celui du dessin : « Dans le moulin ».
 *
 * Le dessin est peint sur une toile à la plus grande case entière qui tienne (`dedansALEcran`), sans flou, centré dans
 * son cadre ; il suit la lumière du village à l'heure où l'on regarde. S'il a plusieurs images, il en change une fois par
 * seconde, au battement de l'horloge du monde : rien en pause ni avec « réduire les animations » (l'image 0), rien quand
 * la page est cachée (l'horloge s'arrête). La toile est cachée aux lecteurs d'écran : une phrase dit ce qu'elle montre.
 * Aucun chiffre, aucun texte dans le dessin.
 */
export function FenetreInterieur({ dessin, lumiere, horloge, fige, tenue, onFermer }: { dessin: DessinDInterieur; lumiere: Lumiere; horloge: Horloge; fige: boolean; tenue: Tenue | null; onFermer: () => void }) {
  return (
    <CadreDeFenetre id="interieur" titre={dessin.titre} icone={ICONES_DES_LIEUX.maisons} sorte="interieur" interieur={dessin.id} ouverte onFermer={onFermer}>
      <DedansPeint dessin={dessin} lumiere={lumiere} horloge={horloge} fige={fige} tenue={tenue} />
    </CadreDeFenetre>
  );
}

const memeTaille = (a: DedansALEcran | null, b: DedansALEcran | null): boolean => a === b || (a !== null && b !== null && a.css === b.css && a.gauche === b.gauche && a.haut === b.haut);

/**
 * Le dedans peint. Le cadre prend la largeur de la fenêtre et la hauteur qu'y donnerait le dessin entier, sans dépasser
 * ce que la fenêtre laisse (la feuille de style) ; la toile s'y pose, mesurée à chaque changement de taille du cadre (le
 * zoom du navigateur compris). `tenue` : celle du Gaulois du visiteur, ou `null` (la pièce vide).
 */
function DedansPeint({ dessin, lumiere, horloge, fige, tenue }: { dessin: DessinDInterieur; lumiere: Lumiere; horloge: Horloge; fige: boolean; tenue: Tenue | null }) {
  const cadre = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [taille, setTaille] = useState<DedansALEcran | null>(null);

  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const mesurer = () => {
      const suivante = dedansALEcran(dessin, { largeur: el.clientWidth, hauteur: el.clientHeight }, window.devicePixelRatio);
      setTaille((avant) => (memeTaille(avant, suivante) ? avant : suivante));
    };
    mesurer();
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(el);
    return () => observateur?.disconnect();
  }, [dessin]);

  // Le Gaulois du visiteur, et les images déjà composées : une par image du mouvement, à cette lumière, avec lui.
  const gaulois = useMemo(() => (tenue ? gauloisDebout(tenue) : null), [tenue]);
  const cle = cleDeLumiere(lumiere, dessin.largeur);
  const lumiereDuMoment = useRef(lumiere);
  lumiereDuMoment.current = lumiere;
  const images = useMemo(() => new Map<number, Decor>(), [dessin, cle, gaulois]);

  // L'image du moment, repeinte seulement quand elle change ; l'horloge ne bat pas quand tout est figé ni page cachée.
  useEffect(() => {
    let peinte = -1;
    const montrer = (temps: number) => {
      const image = imageDuDedans(temps / TEMPS_PAR_SECONDE, dessin.images, fige);
      if (image === peinte) return;
      let decor = images.get(image);
      if (!decor) {
        decor = dedansAvecLeGaulois(dessin, lumiereDuMoment.current, image, gaulois);
        images.set(image, decor);
      }
      peindre(toile.current, decor.largeur, decor.hauteur, decor.cases);
      if (toile.current) toile.current.dataset["image"] = String(image);
      peinte = image;
    };
    montrer(horloge.temps);
    if (fige || dessin.images <= 1) return;
    return horloge.ecouter(montrer);
  }, [images, fige, horloge]);

  return (
    <div ref={cadre} class="monde-dedans" data-testid="monde-dedans" style={{ "--dedans-l": String(dessin.largeur), "--dedans-h": String(dessin.hauteur) }}>
      <canvas
        ref={toile}
        width={dessin.largeur}
        height={dessin.hauteur}
        class="village-pixels monde-dedans-toile"
        aria-hidden="true"
        data-testid="monde-dedans-toile"
        data-images={String(dessin.images)}
        data-pixels={taille ? String(taille.pixels) : undefined}
        data-net={taille ? String(taille.net) : undefined}
        style={
          taille
            ? { width: `${taille.largeur}px`, height: `${taille.hauteur}px`, left: `${taille.gauche}px`, top: `${taille.haut}px`, imageRendering: taille.net ? undefined : "auto" }
            : { visibility: "hidden" }
        }
      />
      <p class="sr-only">{phraseDuDedans(dessin.id)}.</p>
    </div>
  );
}
