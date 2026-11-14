import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois } from "../../../lib/gaulois";
import type { GauloisDeLaPlace } from "../../../lib/village/contrat";
import type { Decor } from "../../../lib/village/decor";
import { type Bulles, avancerLesBulles, bullesAuDepart, chopeLevee, gesteDeCombat, hasardDe, souffleDuDormeur, tourneEnReunion } from "../../../lib/village/mouvement";
import { type Acteur as ActeurDuMonde, arriver, relireLesActeurs, unTemps } from "../../../lib/village/monde/acteurs";
import { poseDuMarcheur } from "../../../lib/village/monde/marche";
import type { Plan } from "../../../lib/village/monde/plan";
import { BOITES_DU_MONDE, type Tenue, piedDeLEscalier, placesDEnFace, placesDuLieu, seuilDuLieu, surLaGrandRue, tenueDuLieu, zoneDuPromeneur } from "../../../lib/village/monde/postes";
import { poseAuLit } from "../../../lib/village/monde/poses-monde";
import { casesDeLAdversaire, casesDesPieds, poseAttable, poseDeMarche, sansArme } from "../../../lib/village/poses";
import { type Habitant, LIEUX, type Lieu } from "../../../lib/village/vie";
import { Toile, peindre } from "../PlaceToile";
import { BulleDuToucher, type Parole } from "../PlaceToucher";
import type { CameraDuMonde } from "./camera-du-monde";
import type { Horloge } from "./horloge";
import type { Mesure } from "./MondeDecor";
import { PlaquesDuGaulois } from "./MondePlaques";

/** La clé d'un habitant, d'une relecture du serveur à la suivante. */
export const cleDe = (habitant: Habitant): string => `${habitant.rang}-${habitant.gaulois.nom}`;

/** Un habitant dans le monde (`acteurs.ts`). */
type Acteur = ActeurDuMonde<Habitant>;

/** Ce qui est déjà à l'écran pour un acteur : on n'y retouche que si cela change. */
interface Pose {
  place: string;
  dessin: string;
  vers: number;
  bord: string;
  parle: boolean;
  tenue: Tenue;
  serre: boolean;
  /** Hors de l'écran : sa toile n'est pas redessinée, et ne compte pas pour le navigateur. */
  cache: boolean;
}

/** La moitié de la plus large étiquette (14 rem), en pixels, et un peu d'air : plus près d'un bord, elle sortirait. */
const PRES_DU_BORD = 116;
/** Au-delà de ce nombre de Gaulois, vus de loin, leurs noms ne s'écrivent plus sous chacun (sauf le sien) : ils se liraient mal. */
const FOULE = 60;

/** Les dessins d'un Gaulois, pose par pose, faits à la demande et gardés tant que sa tenue ne change pas. */
function dessinsDe(memoire: WeakMap<GauloisDeLaPlace, Map<string, Decor>>, habitant: Habitant, pose: string): Decor {
  let faits = memoire.get(habitant.gaulois);
  if (!faits) {
    faits = new Map();
    memoire.set(habitant.gaulois, faits);
  }
  let dessin = faits.get(pose);
  if (!dessin) {
    const tenue = habitant.gaulois.tenue;
    if (pose === "lit0" || pose === "lit1") dessin = poseAuLit(tenue, pose === "lit1" ? 1 : 0, habitant.rang);
    else if (pose === "posee" || pose === "levee") dessin = poseAttable(casesDuGaulois(sansArme(tenue)), pose);
    else if (pose === "assis") dessin = poseAttable(casesDuGaulois(sansArme(tenue)), null);
    else {
      const cases = casesDuGaulois(tenue);
      dessin = { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: pose === "gauche" || pose === "droite" ? poseDeMarche(cases, pose, casesDesPieds(tenue)) : cases };
    }
    faits.set(pose, dessin);
  }
  return dessin;
}

/**
 * Les Gaulois du monde : chacun est une petite toile posée sur le décor, dans son lieu (`vie.ts` décide lequel), et s'anime
 * huit fois par seconde. À la taverne il lève sa chope, en réunion il se tourne vers son voisin, dans son lit il respire,
 * au champ de bataille il frappe ; ceux de la place se promènent dans tout le village. Quand le lieu d'un Gaulois change
 * (relecture du serveur), il sort sur le pas de la porte et marche jusqu'au nouveau. Figé (bouton pause, « réduire les
 * animations »), chacun est posé à sa place, debout, assis ou couché.
 *
 * C'est un dessin : la fenêtre « Qui est où » dit la même chose en texte. Un clic sur un Gaulois le fait parler
 * (`PlaceToucher.tsx`). La marche et les relectures : `acteurs.ts` et `marche.ts`, testés.
 */
export function MondeHabitants({
  plan,
  lieux,
  mesure,
  camera,
  horloge,
  fige,
  parole,
  onToucher,
  aGlisse,
  moiA,
  margeGauche = 0,
}: {
  plan: Plan;
  lieux: Record<Lieu, Habitant[]>;
  mesure: Mesure;
  camera: CameraDuMonde;
  horloge: Horloge;
  fige: boolean;
  parole: Parole | null;
  onToucher: (habitant: Habitant) => void;
  /** Vrai juste après un glissement du monde : le clic qui suit n'est pas un toucher. */
  aGlisse: { current: boolean };
  /** Où est le Gaulois du membre, dans le monde : la caméra peut aller à lui. */
  moiA?: (point: { x: number; y: number } | null) => void;
  /** La place que prend la rangée d'icônes à gauche de l'écran, en pixels : une bulle ne passe pas dessous. */
  margeGauche?: number;
}) {
  const { cote } = mesure;
  const habitants = useMemo(() => LIEUX.flatMap((lieu) => lieux[lieu]), [lieux]);
  const acteurs = useRef(new Map<string, Acteur>());
  const elements = useRef(new Map<string, HTMLDivElement | null>());
  const toiles = useRef(new Map<string, HTMLCanvasElement | null>());
  const adverses = useRef<(HTMLDivElement | null)[]>([]);
  const poses = useRef(new Map<string, Pose>());
  const dessins = useRef(new WeakMap<GauloisDeLaPlace, Map<string, Decor>>());
  const jeu = useRef<{ bulles: Bulles; hasard: () => number }>({ bulles: bullesAuDepart(), hasard: hasardDe(20261114) });
  // Là où se promène chacun : la rue de sa maison, la grand-rue, ou le pré du bas (`zoneDuPromeneur`).
  const zones = useMemo(() => new Map(habitants.map((h) => [cleDe(h), zoneDuPromeneur(plan, h.rang)])), [plan, habitants]);

  // La relecture (`acteurs.ts`) : chacun retrouve sa place ; celui dont le lieu a changé se met en chemin, ou y est d'un
  // coup si tout est figé ; celui qui arrive paraît à sa place ; celui qui part est oublié.
  const planDAvant = useRef(plan);
  useLayoutEffect(() => {
    // Le village a changé de taille (une maison, une terrasse de plus) : tout le monde reparaît à sa place, sans marcher.
    if (planDAvant.current !== plan) {
      planDAvant.current = plan;
      acteurs.current.clear();
      poses.current.clear();
    }
    const entrees = LIEUX.flatMap((lieu) => {
      const places = placesDuLieu(
        plan,
        lieu,
        lieux[lieu].map((h) => h.rang),
      );
      return lieux[lieu].map((habitant, i) => ({ cle: cleDe(habitant), habitant, lieu, place: places[i]! }));
    });
    // Celui qui se promène sur une terrasse ou dans le bas rejoint la grand-rue par l'escalier, d'un coup, avant de marcher.
    const rejoindre = (point: { x: number; y: number }) => (surLaGrandRue(plan, point.y + 64) ? null : { ...piedDeLEscalier(plan, point.x, point.y > plan.dy0 + 300), saut: true });
    relireLesActeurs(acteurs.current, entrees, (lieu, place) => seuilDuLieu(plan, lieu, place), fige, jeu.current.hasard, rejoindre);
    for (const cle of [...poses.current.keys()]) if (!acteurs.current.has(cle)) poses.current.delete(cle);
  }, [lieux, plan]);

  // Tout ce qui est déjà peint est oublié quand les toiles changent de taille.
  useLayoutEffect(() => {
    poses.current.clear();
  }, [cote, habitants]);

  /** Met le monde à l'heure : la place, la pose et le côté de chacun. `pose` : tout le monde au repos, à sa place. */
  const dessiner = (pose: boolean, temps: number) => {
    const largeurVue = camera.vue * cote;
    const parleurs: number[] = [];
    if (!pose) {
      habitants.forEach((h, i) => {
        const acteur = acteurs.current.get(cleDe(h));
        if (!acteur || !h.gaulois.replique || (acteur.etat === "poste" && acteur.lieu === "maisons")) return;
        // Seuls ceux qu'on voit prennent la parole.
        if (acteur.marche.x + GAULOIS_LARGEUR > camera.x && acteur.marche.x < camera.x + camera.vue && acteur.marche.y + GAULOIS_HAUTEUR > camera.y && acteur.marche.y < camera.y + camera.vueH) parleurs.push(i);
      });
    }
    const parlent = pose ? [] : avancerLesBulles(jeu.current.bulles, temps, parleurs);
    let moi: { x: number; y: number } | null = null;

    habitants.forEach((habitant, i) => {
      const cle = cleDe(habitant);
      const acteur = acteurs.current.get(cle);
      const el = elements.current.get(cle);
      const toile = toiles.current.get(cle);
      if (!acteur || !el || !toile) return;
      // Figé, celui qui était en chemin est arrivé, d'un coup.
      if (pose && acteur.etat === "chemin") arriver(acteur, jeu.current.hasard);
      const auPoste = acteur.etat === "poste";
      if (auPoste) {
        acteur.marche.x = acteur.place.x;
        acteur.marche.y = acteur.place.y;
      }
      const tenue: Tenue = auPoste ? tenueDuLieu(acteur.lieu) : "debout";
      const boite = BOITES_DU_MONDE[tenue];
      let x = acteur.marche.x;
      let y = acteur.marche.y;
      let vers = 1;
      let dessin = "debout";
      if (!auPoste) {
        vers = acteur.marche.vers;
        dessin = pose ? "debout" : poseDuMarcheur(acteur.marche);
      } else if (acteur.lieu === "bataille") {
        if (!pose) {
          const geste = gesteDeCombat(temps, i, "gaulois");
          x += geste.x;
          y += geste.y;
        }
      } else if (acteur.lieu === "taverne") dessin = !pose && chopeLevee(temps, i) ? "levee" : "posee";
      else if (acteur.lieu === "reunion") {
        dessin = "assis";
        vers = pose ? 1 : tourneEnReunion(temps, i);
      } else if (acteur.lieu === "maisons") dessin = pose ? "lit0" : `lit${souffleDuDormeur(temps, i)}`;
      if (habitant.gaulois.moi) moi = { x: x + boite.largeur / 2, y: y + boite.hauteur / 2 };

      // Hors de l'écran : sa toile est mise de côté, rien d'autre n'est touché.
      const avant = poses.current.get(cle);
      const cache = x > camera.x + camera.vue + 80 || x + boite.largeur < camera.x - 80 || y > camera.y + camera.vueH + 80 || y + boite.hauteur < camera.y - 120;
      if (cache) {
        if (!avant || !avant.cache) {
          el.style.display = "none";
          poses.current.set(cle, { place: "", dessin: "", vers: 0, bord: "", parle: false, tenue, serre: false, cache: true });
        }
        return;
      }
      if (avant?.cache) el.style.display = "";
      const place = `translate(${x * cote}px, ${y * cote}px)`;
      // Près d'un bord de l'écran (ou de la rangée d'icônes, à gauche), l'étiquette et la bulle s'alignent sur lui.
      const milieu = (x + boite.largeur / 2 - camera.x) * cote;
      const bord = milieu < PRES_DU_BORD + margeGauche ? "gauche" : largeurVue - milieu < PRES_DU_BORD ? "droite" : "";
      const parle = parlent.includes(i);
      const serre = auPoste && acteur.place.serre;
      if (!avant || avant.cache || avant.tenue !== tenue) {
        toile.width = boite.largeur;
        toile.height = boite.hauteur;
        el.style.setProperty("--vie-l", String(boite.largeur));
        el.style.setProperty("--vie-h", String(boite.hauteur));
        el.style.setProperty("--vie-nom", String(boite.nom));
        el.style.setProperty("--vie-nom-l", String(boite.nomLargeur));
        el.dataset["tenue"] = tenue;
      }
      if (!avant || avant.place !== place) {
        el.style.transform = place;
        el.style.zIndex = String(y + boite.hauteur);
      }
      if (!avant || avant.cache || avant.dessin !== dessin || avant.tenue !== tenue) {
        const image = dessinsDe(dessins.current, habitant, dessin);
        peindre(toile, image.largeur, image.hauteur, image.cases);
      }
      if (!avant || avant.vers !== vers) toile.style.transform = vers === 1 ? "" : "scaleX(-1)";
      if (!avant || avant.bord !== bord) el.dataset["bord"] = bord;
      if (!avant || avant.parle !== parle) {
        if (parle) el.dataset["parle"] = "";
        else delete el.dataset["parle"];
      }
      if (!avant || avant.serre !== serre) {
        if (serre) el.dataset["serre"] = "";
        else delete el.dataset["serre"];
      }
      poses.current.set(cle, { place, dessin, vers, bord, parle, tenue, serre, cache: false });
    });

    // Les guerriers d'en face : un devant chaque Gaulois au combat.
    const auCombat = lieux.bataille.map((h) => acteurs.current.get(cleDe(h))).filter((a): a is Acteur => a !== undefined);
    const enFace = placesDEnFace(
      plan,
      auCombat.map((a) => a.place),
    );
    adverses.current.forEach((el, i) => {
      if (!el) return;
      const place = enFace[i];
      const present = place !== undefined && auCombat[i]?.etat === "poste";
      el.style.visibility = present ? "" : "hidden";
      if (!place) return;
      const geste = pose ? { x: 0, y: 0 } : gesteDeCombat(temps, i, "adverse");
      el.style.transform = `translate(${(place.x + geste.x) * cote}px, ${(place.y + geste.y) * cote}px)`;
      el.style.zIndex = String(place.y + GAULOIS_HAUTEUR - 1);
    });
    moiA?.(moi);
  };

  // Le monde posé, après chaque rendu : rien ne dépend de la boucle pour être complet.
  useLayoutEffect(() => dessiner(fige, horloge.temps));

  // Un temps : ceux de la place se promènent (chacun dans son coin), ceux qui changent de lieu avancent, puis tout se
  // redessine : celui qui entre dans l'écran y paraît au temps suivant (un huitième de seconde, avec une marge autour de
  // la vue). Figé, plus rien ne bat : c'est la caméra qui redessine, dix fois par seconde au plus.
  useEffect(() => {
    const grandRue = zoneDuPromeneur(plan, 0);
    let dernier = 0;
    const arreter = [
      camera.ecouter(() => {
        if (!fige || performance.now() - dernier < 100) return;
        dernier = performance.now();
        dessiner(true, horloge.temps);
      }),
    ];
    if (!fige) {
      arreter.push(
        horloge.ecouter((temps) => {
          for (const [cle, acteur] of acteurs.current) {
            const zone = zones.get(cle) ?? grandRue;
            unTemps(acteur, zone, zone.rue ? plan.feu.x : -9999, jeu.current.hasard);
          }
          dessiner(false, temps);
        }),
      );
    }
    return () => arreter.forEach((f) => f());
  }, [fige, horloge, habitants, plan, cote, zones, camera]);

  const adversaires = useMemo(() => lieux.bataille.map((_, i) => casesDeLAdversaire(i)), [lieux.bataille.length]);

  return (
    <div class="monde-habitants" data-foule={cote === 1 && habitants.length > FOULE ? "" : undefined}>
      {adversaires.map((cases, i) => (
        <div
          key={`a${i}`}
          ref={(el) => {
            adverses.current[i] = el;
          }}
          class="vie-acteur vie-adverse monde-acteur"
          data-tenue="debout"
          style={{ "--vie-l": String(GAULOIS_LARGEUR), "--vie-h": String(GAULOIS_HAUTEUR) }}
        >
          <Toile largeur={GAULOIS_LARGEUR} hauteur={GAULOIS_HAUTEUR} cases={cases} class="vie-toile" />
        </div>
      ))}
      {habitants.map((habitant) => {
        const cle = cleDe(habitant);
        const dort = habitant.presence.lieu === "maisons";
        return (
          <div
            key={cle}
            ref={(el) => {
              elements.current.set(cle, el);
            }}
            class="vie-acteur monde-acteur"
            data-moi={habitant.gaulois.moi ? "" : undefined}
            data-testid="monde-gaulois"
            onClick={() => {
              if (!aGlisse.current) onToucher(habitant);
            }}
          >
            {dort && <span class="vie-ronfle" style={{ "--vie-retard": `${-((habitant.rang * 1.7) % 6)}s` }} />}
            {habitant.gaulois.moi && <span class="place-fleche" />}
            <canvas
              ref={(el) => {
                toiles.current.set(cle, el);
              }}
              width={GAULOIS_LARGEUR}
              height={GAULOIS_HAUTEUR}
              class="village-pixels vie-toile"
            />
            <span class="place-nom">{habitant.gaulois.nom}</span>
            <span class="vie-info">
              <span class="vie-info-nom">{habitant.gaulois.nom}</span>
              {habitant.presence.raison}
              <PlaquesDuGaulois gaulois={habitant.gaulois} />
            </span>
            {habitant.gaulois.replique && !dort && <span class="vie-bulle">{habitant.gaulois.replique}</span>}
            <BulleDuToucher parole={parole} habitant={habitant} plaques={<PlaquesDuGaulois gaulois={habitant.gaulois} />} />
          </div>
        );
      })}
    </div>
  );
}
