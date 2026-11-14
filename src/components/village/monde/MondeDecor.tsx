import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { paletteDuDehors } from "../../../lib/village/decor";
import { type Lumiere, cleDeLumiere, instantDeParis } from "../../../lib/village/lumiere";
import type { EtatDuMonde } from "../../../lib/village/monde-etat";
import { NUAGES_HAUTEUR, PLANS_LOINTAINS, brumeDuMatin, composerCiel, composerNuages, composerPlanLointain } from "../../../lib/village/monde/ciel";
import { type Anime, animesDuMonde, composerTuile, nombreDeTuiles } from "../../../lib/village/monde/composition";
import { chemineesDuPlan } from "../../../lib/village/monde/pieces";
import { LIGNE, MONDE_HAUTEUR, type Plan, TUILE } from "../../../lib/village/monde/plan";
import { peindre } from "../PlaceToile";
import type { CameraDuMonde } from "./camera-du-monde";
import type { Horloge } from "./horloge";

/** La mesure de la scène : le côté d'une case en pixels, et la taille de la vue en cases. */
export interface Mesure {
  cote: number;
  colonnes: number;
  rangees: number;
}

/** La largeur d'une couche de nuages qui se répète, en cases : au moins la vue. */
const periodeDesNuages = (colonnes: number): number => Math.max(480, Math.ceil(colonnes / 60) * 60);

/**
 * Le fond du monde, qui ne suit pas la caméra ou la suit de loin : le ciel de l'heure, deux couches de nuages qui dérivent
 * très lentement, quatre plans lointains en parallaxe, puis quelques oiseaux le jour et des lucioles les nuits d'été. Tout
 * est décoratif (`aria-hidden` sur la scène) et rien ne dit un chiffre. Les toiles ne se repeignent que quand la lumière
 * change d'un pas (`cleDeLumiere`) ou que l'écran change de taille ; le mouvement est du CSS, coupé par le bouton pause.
 */
export function MondeFond({ plan, lumiere, date, mesure, camera }: { plan: Plan; lumiere: Lumiere; date: Date; mesure: Mesure; camera: CameraDuMonde }) {
  const { cote, colonnes, rangees } = mesure;
  const ciel = useRef<HTMLCanvasElement>(null);
  const nuages = useRef<(HTMLCanvasElement | null)[]>([]);
  const lointains = useRef<(HTMLCanvasElement | null)[]>([]);
  const cle = cleDeLumiere(lumiere, colonnes);
  const jour = Math.floor(date.getTime() / 86_400_000);
  const horizon = rangees - (MONDE_HAUTEUR - LIGNE);
  const periode = periodeDesNuages(colonnes);
  const largeurs = PLANS_LOINTAINS.map((q) => colonnes + Math.ceil(Math.max(0, plan.largeur - colonnes) * q.glisse) + 2);

  useEffect(() => {
    const dessin = composerCiel(colonnes, rangees, horizon, lumiere, date);
    peindre(ciel.current, dessin.largeur, dessin.hauteur, dessin.cases);
  }, [colonnes, rangees, cle, jour]);

  useEffect(() => {
    for (const couche of [0, 1] as const) {
      const dessin = composerNuages(periode, couche, lumiere);
      peindre(nuages.current[couche] ?? null, dessin.largeur, dessin.hauteur, dessin.cases);
    }
  }, [periode, cle]);

  useEffect(() => {
    const p = paletteDuDehors(lumiere);
    const brume = brumeDuMatin(lumiere);
    PLANS_LOINTAINS.forEach((q, i) => {
      const dessin = composerPlanLointain(q.id, largeurs[i]!, p, lumiere, brume);
      peindre(lointains.current[i] ?? null, dessin.largeur, dessin.hauteur, dessin.cases);
    });
  }, [largeurs.join(), cle]);

  // Les lointains suivent la caméra de loin : chacun sa part du déplacement.
  useLayoutEffect(() => {
    const placer = () => {
      PLANS_LOINTAINS.forEach((q, i) => {
        const toile = lointains.current[i];
        if (toile) toile.style.transform = `translate3d(${-Math.round(camera.x * q.glisse * cote)}px, 0, 0)`;
      });
    };
    placer();
    return camera.ecouter(placer);
  }, [camera, cote]);

  const { mois } = instantDeParis(date);
  const oiseaux = lumiere.jour > 0.6;
  const lucioles = lumiere.jour < 0.25 && mois >= 6 && mois <= 8;
  return (
    <>
      <canvas ref={ciel} width={colonnes} height={rangees} class="village-pixels monde-ciel" style={{ width: `${colonnes * cote}px`, height: `${rangees * cote}px` }} />
      {([0, 1] as const).map((couche) => (
        <div key={couche} class="monde-nuages" data-couche={couche} style={{ width: `${periode * 2 * cote}px`, height: `${NUAGES_HAUTEUR * cote}px` }}>
          <canvas
            ref={(el) => {
              nuages.current[couche] = el;
            }}
            width={periode * 2}
            height={NUAGES_HAUTEUR}
            class="village-pixels"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      ))}
      {PLANS_LOINTAINS.map((q, i) => (
        <canvas
          key={q.id}
          ref={(el) => {
            lointains.current[i] = el;
          }}
          width={largeurs[i]}
          height={q.hauteur}
          class="village-pixels monde-lointain"
          style={{ width: `${largeurs[i]! * cote}px`, height: `${q.hauteur * cote}px`, bottom: `${(MONDE_HAUTEUR - LIGNE - 1) * cote}px` }}
        />
      ))}
      {oiseaux && (
        <div class="monde-oiseaux">
          {[0, 1, 2].map((k) => (
            <span key={k} class="monde-oiseau" style={{ "--monde-retard": `${-k * 37}s`, "--monde-haut": `${12 + k * 9}%` }}>
              <i />
              <i />
            </span>
          ))}
        </div>
      )}
      {lucioles && (
        <div class="monde-lucioles">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <i key={k} style={{ "--monde-retard": `${-k * 2.7}s`, left: `${6 + ((k * 37) % 88)}%`, bottom: `${(MONDE_HAUTEUR - LIGNE + 6 + ((k * 17) % 46)) * cote}px` }} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Le premier plan du monde, dans le calque qui suit la caméra : le décor fixe, peint par tuiles (celles qu'on voit
 * d'abord, les autres juste après), ce qui bouge lentement par-dessus (le grand feu, les ailes du moulin, la fumée du
 * four, le soufflet de la forge, les reflets du ruisseau), et la fumée des cheminées. Une animation ne change jamais une
 * valeur : figé, tout reste à sa première image.
 */
export function MondeDecor({ plan, etat, lumiere, mesure, camera, horloge, fige }: { plan: Plan; etat: EtatDuMonde; lumiere: Lumiere; mesure: Mesure; camera: CameraDuMonde; horloge: Horloge; fige: boolean }) {
  const { cote } = mesure;
  const cle = cleDeLumiere(lumiere, 700);
  const tuiles = useRef<(HTMLCanvasElement | null)[]>([]);
  const nombre = nombreDeTuiles(plan);

  // Les tuiles : d'abord celles de la vue, puis les autres une à une, sans bloquer la page.
  useEffect(() => {
    const milieu = camera.milieu;
    const ordre = Array.from({ length: nombre }, (_, k) => k).sort((a, b) => Math.abs((a + 0.5) * TUILE - milieu) - Math.abs((b + 0.5) * TUILE - milieu));
    let minuterie = 0;
    const peindreTuile = (k: number) => {
      const dessin = composerTuile(plan, etat, lumiere, k);
      peindre(tuiles.current[k] ?? null, dessin.largeur, dessin.hauteur, dessin.cases);
    };
    const suite = (rang: number) => {
      if (rang >= ordre.length) return;
      peindreTuile(ordre[rang]!);
      minuterie = window.setTimeout(() => suite(rang + 1), 16);
    };
    const premieres = Math.min(ordre.length, 3);
    for (let rang = 0; rang < premieres; rang++) peindreTuile(ordre[rang]!);
    minuterie = window.setTimeout(() => suite(premieres), 16);
    return () => window.clearTimeout(minuterie);
  }, [plan, etat, cle]);

  // Ce qui bouge : une petite toile chacun, repeinte quand son image change.
  const animes = useMemo(() => animesDuMonde(plan, etat, lumiere), [plan, etat, cle]);
  const toiles = useRef(new Map<string, HTMLCanvasElement | null>());
  useEffect(() => {
    const images = new Map<string, ReturnType<Anime["dessiner"]>>();
    const peintes = new Map<string, number>();
    const montrer = (temps: number) => {
      for (const anime of animes) {
        const image = fige ? 0 : Math.floor(temps / anime.duree) % anime.images;
        if (peintes.get(anime.cle) === image) continue;
        const nom = `${anime.cle}:${image}`;
        let dessin = images.get(nom);
        if (!dessin) {
          dessin = anime.dessiner(image);
          images.set(nom, dessin);
        }
        peindre(toiles.current.get(anime.cle) ?? null, dessin.largeur, dessin.hauteur, dessin.cases);
        peintes.set(anime.cle, image);
      }
    };
    montrer(horloge.temps);
    return horloge.ecouter(montrer);
  }, [animes, horloge, fige]);

  const cheminees = useMemo(() => chemineesDuPlan(plan), [plan]);
  return (
    <>
      {Array.from({ length: nombre }, (_, k) => {
        const largeur = Math.min(TUILE, plan.largeur - k * TUILE);
        return (
          <canvas
            key={k}
            ref={(el) => {
              tuiles.current[k] = el;
            }}
            width={largeur}
            height={MONDE_HAUTEUR}
            class="village-pixels monde-tuile"
            style={{ left: `${k * TUILE * cote}px`, width: `${largeur * cote}px`, height: `${MONDE_HAUTEUR * cote}px` }}
          />
        );
      })}
      {animes.map((anime) => (
        <canvas
          key={anime.cle}
          ref={(el) => {
            toiles.current.set(anime.cle, el);
          }}
          width={anime.largeur}
          height={anime.hauteur}
          class="village-pixels monde-anime"
          style={{ left: `${anime.x * cote}px`, top: `${anime.y * cote}px`, width: `${anime.largeur * cote}px`, height: `${anime.hauteur * cote}px`, zIndex: anime.pied }}
        />
      ))}
      {cheminees.map((cheminee, k) => (
        <div key={k} class="monde-fumee" style={{ left: `${cheminee.x * cote}px`, top: `${cheminee.y * cote}px`, "--monde-retard": `${-k * 3.1}s` }}>
          <i />
          <i />
          <i />
        </div>
      ))}
    </>
  );
}
