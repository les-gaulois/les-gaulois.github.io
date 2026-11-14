import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Decor, paletteDuDehors } from "../../../lib/village/decor";
import { type Lumiere, cleDeLumiere, instantDeParis } from "../../../lib/village/lumiere";
import type { EtatDuMonde } from "../../../lib/village/monde-etat";
import { NUAGES_HAUTEUR, PLANS_LOINTAINS, brumeDuMatin, composerCiel, composerNuages, composerPlanLointain } from "../../../lib/village/monde/ciel";
import { type Anime, animesDuMonde, chemineesDuPlan, composerTuile, tuilesDuMonde } from "../../../lib/village/monde/composition";
import { SOUS_LA_FOULE, caseDuPlan, decalageDuPlan, fondDuPlan, vueDuPlan } from "../../../lib/village/monde/foule";
import { bandeDeLaTerrasse, composerTuileDeTerrasse, tuilesDeLaTerrasse } from "../../../lib/village/monde/lointain";
import { MODELES, fumeeDeLaMaison } from "../../../lib/village/monde/maisons";
import { CIEL, ECHELLE_DU_FOND, type Plan, TUILE } from "../../../lib/village/monde/plan";
import { DESSINS_OPENFRONT } from "../../../lib/village/openfront";
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

/** La ville lointaine : la part du déplacement de la caméra qu'elle suit, et sa hauteur au-dessus de la ligne du fond. */
const VILLE = { glisse: 0.1, pied: CIEL - 46 };

/**
 * Le fond du monde, qui ne suit la caméra que de haut en bas (et de loin, de gauche à droite) : le ciel de l'heure, deux
 * couches de nuages qui dérivent très lentement, les plans lointains en parallaxe (montagnes, collines, une ville au
 * loin, forêt, lisière), puis quelques oiseaux le jour et des lucioles les nuits d'été. Tout est décoratif (`aria-hidden`
 * sur la scène) et rien ne dit un chiffre. Les toiles ne se repeignent que quand la lumière change d'un pas
 * (`cleDeLumiere`) ou que l'écran change de taille ; le mouvement est du CSS, coupé par le bouton pause.
 *
 * La plus haute ligne du monde est toujours à la rangée `CIEL` : le ciel et les lointains se posent juste au-dessus.
 */
export function MondeFond({ plan, lumiere, date, mesure, camera }: { plan: Plan; lumiere: Lumiere; date: Date; mesure: Mesure; camera: CameraDuMonde }) {
  const { cote, colonnes, rangees } = mesure;
  const calque = useRef<HTMLDivElement>(null);
  const ciel = useRef<HTMLCanvasElement>(null);
  const nuages = useRef<(HTMLCanvasElement | null)[]>([]);
  const lointains = useRef<(HTMLCanvasElement | null)[]>([]);
  const ville = useRef<HTMLCanvasElement>(null);
  const cle = cleDeLumiere(lumiere, colonnes);
  const jour = Math.floor(date.getTime() / 86_400_000);
  // Quand l'écran est plus haut que le monde, le ciel s'allonge vers le haut pour le remplir.
  const enPlus = Math.max(0, rangees - plan.hauteur);
  const hauteurDuCiel = enPlus + CIEL + 40;
  const periode = periodeDesNuages(colonnes);
  const largeurs = PLANS_LOINTAINS.map((q) => colonnes + Math.ceil(Math.max(0, plan.largeur - colonnes) * q.glisse) + 2);
  const dessinDeLaVille = DESSINS_OPENFRONT["ville-lointaine"];

  useEffect(() => {
    const dessin = composerCiel(colonnes, hauteurDuCiel, enPlus + CIEL, lumiere, date);
    peindre(ciel.current, dessin.largeur, dessin.hauteur, dessin.cases);
  }, [colonnes, hauteurDuCiel, cle, jour]);

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
    const dessin = dessinDeLaVille.dessiner(lumiere, 0);
    peindre(ville.current, dessin.largeur, dessin.hauteur, dessin.cases);
  }, [largeurs.join(), cle]);

  // Le fond monte et descend avec la caméra ; les lointains la suivent de loin, chacun sa part du déplacement.
  useLayoutEffect(() => {
    const placer = () => {
      if (calque.current) calque.current.style.transform = `translate3d(0, ${-Math.round(camera.y * cote)}px, 0)`;
      PLANS_LOINTAINS.forEach((q, i) => {
        const toile = lointains.current[i];
        if (toile) toile.style.transform = `translate3d(${-Math.round(camera.x * q.glisse * cote)}px, 0, 0)`;
      });
      if (ville.current) ville.current.style.transform = `translate3d(${-Math.round(camera.x * VILLE.glisse * cote)}px, 0, 0)`;
    };
    placer();
    return camera.ecouter(placer);
  }, [camera, cote]);

  const { mois } = instantDeParis(date);
  const oiseaux = lumiere.jour > 0.6;
  const lucioles = lumiere.jour < 0.25 && mois >= 6 && mois <= 8;
  // La ville lointaine se tient au-dessus du marché : au milieu de l'est du village.
  const villeX = Math.round(colonnes * 0.5 + plan.village.a * 0.72 * VILLE.glisse);
  return (
    <>
      <div ref={calque} class="monde-fond">
        <canvas ref={ciel} width={colonnes} height={hauteurDuCiel} class="village-pixels monde-ciel" style={{ top: `${-enPlus * cote}px`, width: `${colonnes * cote}px`, height: `${hauteurDuCiel * cote}px` }} />
        {([0, 1] as const).map((couche) => (
          <div key={couche} class="monde-nuages" data-couche={couche} style={{ top: `${(CIEL - 300) * cote}px`, width: `${periode * 2 * cote}px`, height: `${NUAGES_HAUTEUR * cote}px` }}>
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
          <>
            {/* La ville lointaine : devant les collines, derrière la forêt. */}
            {q.id === "foret" && (
              <canvas
                key="ville"
                ref={ville}
                width={dessinDeLaVille.largeur}
                height={dessinDeLaVille.hauteur}
                class="village-pixels monde-lointain"
                style={{ left: `${villeX * cote}px`, top: `${(VILLE.pied - dessinDeLaVille.hauteur) * cote}px`, width: `${dessinDeLaVille.largeur * cote}px`, height: `${dessinDeLaVille.hauteur * cote}px` }}
              />
            )}
            <canvas
              key={q.id}
              ref={(el) => {
                lointains.current[i] = el;
              }}
              width={largeurs[i]}
              height={q.hauteur}
              class="village-pixels monde-lointain"
              style={{ top: `${(CIEL + 1 - q.hauteur) * cote}px`, width: `${largeurs[i]! * cote}px`, height: `${q.hauteur * cote}px` }}
            />
          </>
        ))}
      </div>
      {oiseaux && (
        <div class="monde-oiseaux">
          {[0, 1, 2].map((k) => (
            <span key={k} class="monde-oiseau" style={{ "--monde-retard": `${-k * 37}s`, "--monde-haut": `${10 + k * 8}%` }}>
              <i />
              <i />
            </span>
          ))}
        </div>
      )}
      {lucioles && (
        <div class="monde-lucioles">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <i key={k} style={{ "--monde-retard": `${-k * 2.7}s`, left: `${6 + ((k * 37) % 88)}%`, top: `${48 + ((k * 17) % 40)}%` }} />
          ))}
        </div>
      )}
    </>
  );
}

/** Les tuiles d'une terrasse à garder peintes : de la première à la dernière, ou `null` quand l'écran ne la voit pas. */
type PorteeDuFond = ({ tx0: number; tx1: number } | null)[];

function porteeDuFond(camera: CameraDuMonde, plan: Plan, cote: number): PorteeDuFond {
  return plan.lointaines.map((t) => {
    const vue = vueDuPlan(camera, cote, { echelle: ECHELLE_DU_FOND, parallaxe: t.parallaxe });
    const bande = bandeDeLaTerrasse(t);
    if (bande.haut > vue.y + vue.hauteur + 120 || bande.haut + bande.hauteur < vue.y - 120) return null;
    const dernier = tuilesDeLaTerrasse(t) - 1;
    const borne = (v: number) => Math.min(dernier, Math.max(0, v));
    return { tx0: borne(Math.floor((vue.x - 200) / TUILE)), tx1: borne(Math.floor((vue.x + vue.largeur + 200) / TUILE)) };
  });
}

/**
 * Les terrasses du fond (la proposition « les terrasses » du pilote) : derrière la grand-rue, des rues de maisons
 * dessinées deux fois plus petites, pâlies par la distance, qui glissent moins vite que le premier plan. Chacune est un
 * calque du monde, rangé sous le décor du premier plan et sous ses propres Gaulois (`fondDuPlan`), décalé de ce que la
 * caméra a parcouru sans lui (`decalageDuPlan`), peint par tuiles seulement autour de ce que l'écran voit. Rien n'y
 * bouge : la parallaxe est le déplacement de la caméra, pas une animation.
 */
export function MondeTerrasses({ plan, lumiere, mesure, camera }: { plan: Plan; lumiere: Lumiere; mesure: Mesure; camera: CameraDuMonde }) {
  const { cote } = mesure;
  const casePx = caseDuPlan(cote, ECHELLE_DU_FOND);
  const cle = cleDeLumiere(lumiere, 700);
  const calques = useRef<(HTMLDivElement | null)[]>([]);
  const toiles = useRef(new Map<string, HTMLCanvasElement | null>());
  const composees = useRef<{ signature: object; tuiles: Map<string, Decor> }>({ signature: {}, tuiles: new Map() });
  const [portee, setPortee] = useState<PorteeDuFond>(() => porteeDuFond(camera, plan, cote));

  useLayoutEffect(() => {
    const suivre = () => {
      plan.lointaines.forEach((t, k) => {
        const calque = calques.current[k];
        if (calque) calque.style.transform = `translate3d(${decalageDuPlan(camera, cote, t.parallaxe).x}px, 0, 0)`;
      });
      const p = porteeDuFond(camera, plan, cote);
      setPortee((avant) => (JSON.stringify(avant) === JSON.stringify(p) ? avant : p));
    };
    suivre();
    return camera.ecouter(suivre);
  }, [camera, plan, cote]);

  const signature = useMemo(() => ({}), [plan, cle]);
  const cles = useMemo(() => {
    const liste: { cle: string; k: number; tx: number }[] = [];
    portee.forEach((p, k) => {
      if (p) for (let tx = p.tx0; tx <= p.tx1; tx++) liste.push({ cle: `${k}:${tx}`, k, tx });
    });
    return liste;
  }, [portee]);

  // Les tuiles pas encore peintes à cette lumière : les plus proches d'abord (les premières terrasses), une à la fois.
  useEffect(() => {
    if (composees.current.signature !== signature) composees.current = { signature, tuiles: new Map() };
    const memoire = composees.current.tuiles;
    const file = cles.filter((t) => {
      const toile = toiles.current.get(t.cle) as (HTMLCanvasElement & { peinte?: object }) | null | undefined;
      return toile && toile.peinte !== signature;
    });
    let minuterie = 0;
    const peindreTuile = (t: { cle: string; k: number; tx: number }) => {
      const toile = toiles.current.get(t.cle) as (HTMLCanvasElement & { peinte?: object }) | null | undefined;
      const terrasse = plan.lointaines[t.k];
      if (!toile || !terrasse) return;
      let dessin = memoire.get(t.cle);
      if (!dessin) {
        dessin = composerTuileDeTerrasse(terrasse, lumiere, t.tx);
        if (memoire.size >= 64) memoire.delete(memoire.keys().next().value!);
        memoire.set(t.cle, dessin);
      }
      peindre(toile, dessin.largeur, dessin.hauteur, dessin.cases);
      toile.peinte = signature;
    };
    const suite = (rang: number) => {
      if (rang >= file.length) return;
      peindreTuile(file[rang]!);
      minuterie = window.setTimeout(() => suite(rang + 1), 24);
    };
    minuterie = window.setTimeout(() => suite(0), 0);
    return () => window.clearTimeout(minuterie);
  }, [cles, signature]);

  return (
    <>
      {plan.lointaines.map((t, k) => {
        const bande = bandeDeLaTerrasse(t);
        const p = portee[k];
        const tuiles: number[] = [];
        if (p) for (let tx = p.tx0; tx <= p.tx1; tx++) tuiles.push(tx);
        return (
          <div
            key={t.rang}
            ref={(el) => {
              calques.current[k] = el;
            }}
            class="monde-terrasse"
            data-testid="monde-terrasse"
            style={{ "--monde-rang": `${fondDuPlan({ echelle: ECHELLE_DU_FOND, parallaxe: t.parallaxe }) - SOUS_LA_FOULE}`, "--place-case": `${casePx}px` }}
          >
            {tuiles.map((tx) => {
              const largeur = Math.min(TUILE, t.largeur - tx * TUILE);
              return (
                <canvas
                  key={tx}
                  ref={(el) => {
                    if (el) toiles.current.set(`${k}:${tx}`, el);
                    else toiles.current.delete(`${k}:${tx}`);
                  }}
                  width={largeur}
                  height={bande.hauteur}
                  class={casePx < 1 ? "monde-tuile" : "village-pixels monde-tuile"}
                  style={{ left: `${tx * TUILE * casePx}px`, top: `${bande.haut * casePx}px`, width: `${largeur * casePx}px`, height: `${bande.hauteur * casePx}px` }}
                />
              );
            })}
            {/* Une fumée lente à la cheminée d'une maison sur deux, à l'échelle de la terrasse, pâlie comme elle. */}
            {p &&
              t.places.map((place, n) => {
                if (place.rang === null || n % 2 !== 0 || place.x + 400 < p.tx0 * TUILE || place.x > (p.tx1 + 1) * TUILE) return null;
                const fumee = fumeeDeLaMaison(MODELES[place.modele], place.variante);
                return (
                  <div key={`f${n}`} class="monde-fumee" style={{ left: `${(place.x + fumee.x) * casePx}px`, top: `${(t.sol - fumee.y) * casePx}px`, opacity: 1 - t.voile, "--monde-retard": `${-((place.x * 7) % 15)}s` }}>
                    <i />
                    <i />
                    <i />
                  </div>
                );
              })}
          </div>
        );
      })}
    </>
  );
}

/** Les tuiles à garder peintes autour de la vue : une de marge de chaque côté. */
interface Portee {
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
}

function porteeDe(camera: CameraDuMonde, plan: Plan): Portee {
  const { colonnes, rangees } = tuilesDuMonde(plan);
  const borne = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  return {
    tx0: borne(Math.floor((camera.x - 160) / TUILE), colonnes),
    tx1: borne(Math.floor((camera.x + camera.vue + 160) / TUILE), colonnes),
    ty0: borne(Math.floor((camera.y - 160) / TUILE), rangees),
    ty1: borne(Math.floor((camera.y + camera.vueH + 160) / TUILE), rangees),
  };
}

/** Le plus grand nombre de tuiles composées gardées en mémoire : celles qu'on revoit se repeignent sans calcul. */
const TUILES_GARDEES = 96;

/**
 * Le premier plan du monde, dans le calque qui suit la caméra : le décor fixe, peint par tuiles carrées, seulement autour
 * de ce que l'écran voit (les plus proches du milieu d'abord, une à la fois, sans bloquer la page) ; ce qui bouge
 * lentement par-dessus (le grand feu, les ailes du moulin, la fumée de l'usine, les navires, la houle), repeint seulement
 * quand on le voit ; et la fumée des cheminées. Une animation ne change jamais une valeur : figé, tout reste à sa
 * première image.
 */
export function MondeDecor({ plan, etat, lumiere, mesure, camera, horloge, fige }: { plan: Plan; etat: EtatDuMonde; lumiere: Lumiere; mesure: Mesure; camera: CameraDuMonde; horloge: Horloge; fige: boolean }) {
  const { cote } = mesure;
  const cle = cleDeLumiere(lumiere, 700);
  const toilesDesTuiles = useRef(new Map<string, HTMLCanvasElement | null>());
  const composees = useRef<{ signature: object; tuiles: Map<string, Decor> }>({ signature: {}, tuiles: new Map() });
  const [portee, setPortee] = useState<Portee>(() => porteeDe(camera, plan));

  // La portée suit la caméra : elle ne change que quand la vue passe d'une tuile à l'autre.
  useLayoutEffect(() => {
    const suivre = () => {
      const p = porteeDe(camera, plan);
      setPortee((avant) => (avant.tx0 === p.tx0 && avant.tx1 === p.tx1 && avant.ty0 === p.ty0 && avant.ty1 === p.ty1 ? avant : p));
    };
    suivre();
    return camera.ecouter(suivre);
  }, [camera, plan]);

  const cles = useMemo(() => {
    const liste: { cle: string; tx: number; ty: number }[] = [];
    for (let ty = portee.ty0; ty <= portee.ty1; ty++) for (let tx = portee.tx0; tx <= portee.tx1; tx++) liste.push({ cle: `${tx},${ty}`, tx, ty });
    return liste;
  }, [portee]);

  // Ce qui est composé ne vaut que pour ce plan, cet état et cette lumière.
  const signature = useMemo(() => ({}), [plan, etat, cle]);

  // Les tuiles de la portée qui ne sont pas encore peintes à cette lumière : les plus proches du milieu d'abord.
  useEffect(() => {
    if (composees.current.signature !== signature) composees.current = { signature, tuiles: new Map() };
    const memoire = composees.current.tuiles;
    const file = cles
      .filter((t) => {
        const toile = toilesDesTuiles.current.get(t.cle);
        return toile && (toile as HTMLCanvasElement & { peinte?: object }).peinte !== signature;
      })
      .sort((a, b) => Math.hypot((a.tx + 0.5) * TUILE - camera.milieu, (a.ty + 0.5) * TUILE - camera.milieuY) - Math.hypot((b.tx + 0.5) * TUILE - camera.milieu, (b.ty + 0.5) * TUILE - camera.milieuY));
    let minuterie = 0;
    const peindreTuile = (t: { cle: string; tx: number; ty: number }) => {
      const toile = toilesDesTuiles.current.get(t.cle) as (HTMLCanvasElement & { peinte?: object }) | null | undefined;
      if (!toile) return;
      let dessin = memoire.get(t.cle);
      if (!dessin) {
        dessin = composerTuile(plan, etat, lumiere, t.tx, t.ty);
        if (memoire.size >= TUILES_GARDEES) memoire.delete(memoire.keys().next().value!);
        memoire.set(t.cle, dessin);
      }
      peindre(toile, dessin.largeur, dessin.hauteur, dessin.cases);
      toile.peinte = signature;
    };
    const suite = (rang: number) => {
      if (rang >= file.length) return;
      peindreTuile(file[rang]!);
      minuterie = window.setTimeout(() => suite(rang + 1), 24);
    };
    // La plus proche du milieu tout de suite, les autres une à une : la caméra glisse sans à-coup pendant ce temps.
    const premieres = Math.min(file.length, 1);
    for (let rang = 0; rang < premieres; rang++) peindreTuile(file[rang]!);
    minuterie = window.setTimeout(() => suite(premieres), 24);
    return () => window.clearTimeout(minuterie);
  }, [cles, signature]);

  // Ce qui bouge : une petite toile chacun, repeinte quand son image change, et seulement près de ce qu'on voit.
  const animes = useMemo(() => animesDuMonde(plan, etat, lumiere), [plan, etat, cle]);
  const toiles = useRef(new Map<string, HTMLCanvasElement | null>());
  useEffect(() => {
    const images = new Map<string, ReturnType<Anime["dessiner"]>>();
    const peintes = new Map<string, number>();
    const montrer = (temps: number) => {
      for (const anime of animes) {
        if (anime.x > camera.x + camera.vue + 200 || anime.x + anime.largeur < camera.x - 200 || anime.y > camera.y + camera.vueH + 200 || anime.y + anime.hauteur < camera.y - 200) continue;
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
    const arreter = [horloge.ecouter(montrer), camera.ecouter(() => montrer(horloge.temps))];
    return () => arreter.forEach((f) => f());
  }, [animes, horloge, fige, camera]);

  const cheminees = useMemo(() => chemineesDuPlan(plan), [plan]);
  const proches = cheminees.filter((c) => c.x > portee.tx0 * TUILE && c.x < (portee.tx1 + 1) * TUILE && c.y > portee.ty0 * TUILE - 60 && c.y < (portee.ty1 + 1) * TUILE);
  return (
    <>
      {cles.map((t) => {
        const largeur = Math.min(TUILE, plan.largeur - t.tx * TUILE);
        const hauteur = Math.min(TUILE, plan.hauteur - t.ty * TUILE);
        return (
          <canvas
            key={t.cle}
            ref={(el) => {
              if (el) toilesDesTuiles.current.set(t.cle, el);
              else toilesDesTuiles.current.delete(t.cle);
            }}
            width={largeur}
            height={hauteur}
            class="village-pixels monde-tuile"
            style={{ left: `${t.tx * TUILE * cote}px`, top: `${t.ty * TUILE * cote}px`, width: `${largeur * cote}px`, height: `${hauteur * cote}px` }}
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
      {proches.map((cheminee) => (
        <div key={`${cheminee.x},${cheminee.y}`} class="monde-fumee" style={{ left: `${cheminee.x * cote}px`, top: `${cheminee.y * cote}px`, zIndex: cheminee.y + 60, "--monde-retard": `${-((cheminee.x * 7) % 15)}s` }}>
          <i />
          <i />
          <i />
        </div>
      ))}
    </>
  );
}
