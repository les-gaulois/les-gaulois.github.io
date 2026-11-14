import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois } from "../../../lib/gaulois";
import type { Decor } from "../../../lib/village/decor";
import { type Bulles, avancerLesBulles, bullesAuDepart, chopeLevee, gesteDeCombat, hasardDe, souffleDuDormeur, tourneEnReunion } from "../../../lib/village/mouvement";
import { type Acteur as ActeurDuMonde, arriver, relireLesActeurs, unTemps } from "../../../lib/village/monde/acteurs";
import { type Boite, type Figure, type Obstacle, type PlanDeVue, OMBRE, PREMIER_PLAN, boiteDansLeCalque, calquesDeLaFoule, caseDuPlan, cleDuPlan, contient, couverture, decalageDuPlan, milieuPourVoir, nomsSousChacun, ordreDeDessin, planDeLaPlace, seCroisent, sousLeDoigt, vueDuPlan } from "../../../lib/village/monde/foule";
import { poseDuMarcheur } from "../../../lib/village/monde/marche";
import type { Plan } from "../../../lib/village/monde/plan";
import { BOITES_DU_MONDE, type Place, type Tenue, piedDeLEscalier, placesDEnFace, placesDuLieu, seuilDuLieu, surLaGrandRue, tenueDuLieu, zoneDuPromeneur } from "../../../lib/village/monde/postes";
import { poseAuLit } from "../../../lib/village/monde/poses-monde";
import { casesDeLAdversaire, casesDesPieds, poseAttable, poseDeMarche, sansArme } from "../../../lib/village/poses";
import { type Habitant, LIEUX, type Lieu } from "../../../lib/village/vie";
import { BulleDuToucher, type Parole } from "../PlaceToucher";
import type { CameraDuMonde } from "./camera-du-monde";
import { Atelier, type DessinPret, preparer } from "./foule-dessins";
import type { Horloge } from "./horloge";
import type { Mesure } from "./MondeDecor";
import { PlaquesDuGaulois } from "./MondePlaques";

/** La clé d'un habitant, d'une relecture du serveur à la suivante. */
export const cleDe = (habitant: Habitant): string => `${habitant.rang}-${habitant.gaulois.nom}`;

/** Un habitant dans le monde (`acteurs.ts`). */
type Acteur = ActeurDuMonde<Habitant>;

/** Ce que la foule montre de quelqu'un à cet instant : sa boîte, sa profondeur, et de quoi le dessiner. */
interface Figurant extends Figure {
  cle: string;
  /** `null` : un guerrier d'en face. */
  habitant: Habitant | null;
  tenue: Tenue;
  /** La pose : debout, gauche, droite (la marche), posee, levee (la chope), assis, lit0, lit1 (le souffle), adverse. */
  dessin: string;
  vers: 1 | -1;
  /** Le rang de l'habitant (la couverture de son lit), ou celui du guerrier d'en face. */
  rang: number;
  /** Le saut du dessin seul, en cases (il sursaute quand on l'agace). */
  saut: number;
  parle: boolean;
  serre: boolean;
  /** Son plan (`echelle`, `parallaxe` de sa place), et la clé de ce plan. */
  planDeVue: PlanDeVue;
  cleDuPlan: string;
}

/** Un plan tel qu'il est peint : le côté de ses cases à l'écran, son décalage, et ce qui en est peint (en cases du plan). */
interface PlanPeint {
  plan: PlanDeVue;
  case: number;
  decalage: { x: number; y: number };
  couverture: Boite;
}

/**
 * Le plan d'un acteur : celui de sa place (`Place` de `postes.ts`). En chemin d'un lieu à l'autre, il marche sur la
 * grand-rue, au premier plan (les terrasses et les lits se rejoignent d'un saut, au bout du chemin).
 */
const planDeLActeur = (acteur: { etat: string; place: unknown }): PlanDeVue => (acteur.etat === "chemin" ? PREMIER_PLAN : planDeLaPlace(acteur.place as Place));

/** Une étiquette posée sur un Gaulois : son nom, et ce qui le place là au survol. */
interface Etiquette {
  habitant: Habitant;
  /** Le survol, ou son effacement : « ce qui le place là » est dans la page. */
  info: boolean;
}

/** La moitié de la plus large étiquette (14 rem), en pixels, et un peu d'air : plus près d'un bord, elle sortirait. */
const PRES_DU_BORD = 116;
/** Le temps de faire les dessins qui manquent, à chaque peinture, en millisecondes : le reste attend l'image suivante. */
const BUDGET_DES_DESSINS = 6;
/** L'étiquette du survol s'efface en 0,8 seconde (la feuille de style) : elle reste dans la page une seconde. */
const EFFACEMENT = 1000;

/** La marge peinte autour de la vue, en cases : la caméra y glisse sans qu'il faille repeindre. */
const margeDe = (vue: number): number => Math.round(Math.min(240, Math.max(96, vue * 0.15)));

/** La clé d'une tenue (ses pièces, dans l'ordre), calculée une fois par tenue reçue. */
const CLES_DES_TENUES = new WeakMap<object, string>();
function cleDeTenue(tenue: Readonly<Record<string, string>>): string {
  let cle = CLES_DES_TENUES.get(tenue);
  if (cle === undefined) {
    cle = Object.keys(tenue)
      .sort()
      .map((piece) => `${piece}=${tenue[piece]}`)
      .join(";");
    CLES_DES_TENUES.set(tenue, cle);
  }
  return cle;
}

/** La clé du dessin tout fait d'un figurant : sa tenue et sa pose (et la couverture de son lit). */
function cleDuDessin(f: Figurant): string {
  if (!f.habitant) return `adverse:${f.rang}`;
  const tenue = cleDeTenue(f.habitant.gaulois.tenue);
  return f.dessin === "lit0" || f.dessin === "lit1" ? `${tenue}|${f.dessin}|${((f.rang % 4) + 4) % 4}` : `${tenue}|${f.dessin}`;
}

/** Le dessin d'un figurant, en cases : celui que posait chaque petite toile. */
function decorDe(f: Figurant): Decor {
  if (!f.habitant) return { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: casesDeLAdversaire(f.rang) };
  const tenue = f.habitant.gaulois.tenue;
  const pose = f.dessin;
  if (pose === "lit0" || pose === "lit1") return poseAuLit(tenue, pose === "lit1" ? 1 : 0, f.rang);
  if (pose === "posee" || pose === "levee") return poseAttable(casesDuGaulois(sansArme(tenue)), pose);
  if (pose === "assis") return poseAttable(casesDuGaulois(sansArme(tenue)), null);
  const cases = casesDuGaulois(tenue);
  return { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: pose === "gauche" || pose === "droite" ? poseDeMarche(cases, pose, casesDesPieds(tenue)) : cases };
}

/**
 * Le grossissement de l'optique (1, sauf pendant le passage d'un niveau d'approche à l'autre) : le calque du monde mesure
 * `plan.largeur × cote` pixels, l'écran le montre plus ou moins grand.
 */
function optiqueDe(r: DOMRect, plan: Plan, cote: number): number {
  return r.width / (plan.largeur * cote);
}

/** Le point du calque du monde (en pixels, au niveau d'approche) sous ce point de l'écran ; `null` si le monde n'est pas posé. */
function versLeCalque(monde: Element, plan: Plan, cote: number, clientX: number, clientY: number): { x: number; y: number } | null {
  const r = monde.getBoundingClientRect();
  const optique = optiqueDe(r, plan, cote);
  if (!(optique > 0)) return null;
  return { x: (clientX - r.left) / optique, y: (clientY - r.top) / optique };
}

/**
 * Les dessins du décor rangés en profondeur avec les Gaulois, autour de ce qui est peint : tout ce qui, dans le monde,
 * porte un z-index écrit dans la page (les bêtes, le grand feu, les bâtiments qui bougent, la fumée, le train…), sauf la
 * foule elle-même. Leur boîte est lue dans la page, en pixels du calque du monde ; une fumée, sans taille, prend celle de
 * ses bouffées.
 */
function obstaclesDuMonde(monde: Element, plan: Plan, cote: number, autour: Boite): Obstacle[] {
  const r = monde.getBoundingClientRect();
  const echelle = optiqueDe(r, plan, cote);
  if (!(echelle > 0)) return [];
  const liste: Obstacle[] = [];
  for (const el of monde.querySelectorAll<HTMLElement>("[style*='z-index']:not([data-foule])")) {
    const z = parseInt(el.style.zIndex, 10);
    if (!Number.isFinite(z)) continue;
    let { left, top, right, bottom } = el.getBoundingClientRect();
    if (right - left <= 0 || bottom - top <= 0) {
      left = top = Infinity;
      right = bottom = -Infinity;
      for (const enfant of el.children) {
        const e = enfant.getBoundingClientRect();
        if (e.width <= 0 || e.height <= 0) continue;
        left = Math.min(left, e.left);
        top = Math.min(top, e.top);
        right = Math.max(right, e.right);
        bottom = Math.max(bottom, e.bottom);
      }
      if (!(right > left && bottom > top)) continue;
    }
    const boite = { x: (left - r.left) / echelle, y: (top - r.top) / echelle, largeur: (right - left) / echelle, hauteur: (bottom - top) / echelle, z };
    if (seCroisent(boite, autour)) liste.push(boite);
  }
  return liste;
}

/**
 * Les Gaulois du monde : chacun est dans son lieu (`vie.ts` décide lequel), et s'anime huit fois par seconde. À la
 * taverne il lève sa chope, en réunion il se tourne vers son voisin, dans son lit il respire, au champ de bataille il
 * frappe ; ceux de la place se promènent dans tout le village. Quand le lieu d'un Gaulois change (relecture du serveur),
 * il sort sur le pas de la porte et marche jusqu'au nouveau. Figé (bouton pause, « réduire les animations »), chacun est
 * posé à sa place, debout, assis ou couché.
 *
 * Le moteur (pour 250 à 350 Gaulois, et jusqu'à 1 000) : ils ne sont plus chacun un élément de la page. Toute la foule
 * se peint dans quelques toiles posées sur le décor, à la taille des cases (la feuille de style les agrandit sans flou),
 * à partir de dessins tout faits par tenue et par pose (`foule-dessins.ts`), et seulement autour de ce que l'écran voit.
 * Une seule toile tant que rien du décor ne passe entre deux Gaulois ; une de plus là où une bête, le grand feu, une fumée
 * ou le train passe devant les uns et derrière les autres (`foule.ts`, testé). La caméra glisse sans rien repeindre tant
 * qu'elle reste dans la marge peinte. Les noms, bulles et étiquettes restent du texte de la page, posés seulement sur
 * ceux qui en ont besoin : le sien, ceux dont le nom s'écrit (de près, ou dans un petit village), qui parle, qui dort,
 * qui est survolé, qui vient d'être touché.
 *
 * C'est un dessin : la fenêtre « Qui est où » dit la même chose en texte. Un clic ou un toucher trouve le Gaulois sous le
 * doigt (le plus en avant) et le fait parler (`PlaceToucher.tsx`). La marche et les relectures : `acteurs.ts` et
 * `marche.ts`, testés.
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
  const jeu = useRef<{ bulles: Bulles; hasard: () => number }>({ bulles: bullesAuDepart(), hasard: hasardDe(20261114) });
  // Là où se promène chacun : la rue de sa maison, la grand-rue, ou le pré du bas (`zoneDuPromeneur`).
  const zones = useMemo(() => new Map(habitants.map((h) => [cleDe(h), zoneDuPromeneur(plan, h.rang)])), [plan, habitants]);

  const foule = useRef<HTMLDivElement>(null);
  const calque = useRef<HTMLDivElement>(null);
  const atelier = useMemo(() => new Atelier(), []);
  const ombre = useRef<DessinPret | null | undefined>(undefined);
  const toiles = useRef<HTMLCanvasElement[]>([]);
  /** Ce que montre la foule à cet instant (tout le village), puis ce qui est autour de la vue à la dernière peinture. */
  const figurants = useRef<Figurant[]>([]);
  const vus = useRef<Figurant[]>([]);
  /** Les plans tels qu'ils ont été peints, et pour chaque toile, son plan et son coin (en cases de son plan). */
  const plansPeints = useRef(new Map<string, PlanPeint>());
  const placees = useRef<{ cle: string; x: number; y: number }[]>([]);
  const etiquettes = useRef(new Map<string, HTMLDivElement>());
  const montrees = useRef<readonly Etiquette[]>([]);
  const changerLesEtiquettes = useRef<((liste: readonly Etiquette[]) => void) | null>(null);
  const survol = useRef<{ cle: string | null; avant: string | null; fini: number; souris: { x: number; y: number } | null; demande: number }>({ cle: null, avant: null, fini: 0, souris: null, demande: 0 });
  const sursaut = useRef<{ cle: string; debut: number } | null>(null);
  const encore = useRef(0);
  const toucher = useRef(onToucher);
  toucher.current = onToucher;

  // La relecture (`acteurs.ts`) : chacun retrouve sa place ; celui dont le lieu a changé se met en chemin, ou y est d'un
  // coup si tout est figé ; celui qui arrive paraît à sa place ; celui qui part est oublié.
  const planDAvant = useRef(plan);
  useLayoutEffect(() => {
    // Le village a changé de taille (une maison, une terrasse de plus) : tout le monde reparaît à sa place, sans marcher.
    if (planDAvant.current !== plan) {
      planDAvant.current = plan;
      acteurs.current.clear();
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
  }, [lieux, plan]);

  // Il sursaute d'une case quand on l'agace (le dessin seul, de 0,12 à 0,48 seconde après le toucher, comme la feuille de
  // style le faisait), seulement quand les animations tournent.
  useEffect(() => {
    sursaut.current = parole?.saut && !fige ? { cle: `${parole.rang}-${parole.nom}`, debut: performance.now() } : null;
  }, [parole?.tour]);

  /**
   * Met la foule à l'heure : la place, la pose et le côté de chacun, et qui parle. `pose` : tout le monde au repos, à sa
   * place. Rien n'est peint ici.
   */
  const calculer = (pose: boolean, temps: number) => {
    const parleurs: number[] = [];
    if (!pose) {
      habitants.forEach((h, i) => {
        const acteur = acteurs.current.get(cleDe(h));
        if (!acteur || !h.gaulois.replique || (acteur.etat === "poste" && acteur.lieu === "maisons")) return;
        // Seuls ceux qu'on voit prennent la parole (la vue de leur plan).
        if (seCroisent({ x: acteur.marche.x, y: acteur.marche.y, largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR }, vueDuPlan(camera, cote, planDeLActeur(acteur)))) parleurs.push(i);
      });
    }
    const parlent = pose ? [] : avancerLesBulles(jeu.current.bulles, temps, parleurs);
    const liste: Figurant[] = [];

    // Les guerriers d'en face : un devant chaque Gaulois au combat, posés avant eux (à profondeur égale, derrière).
    const auCombat = lieux.bataille.map((h) => acteurs.current.get(cleDe(h))).filter((a): a is Acteur => a !== undefined);
    const enFace = placesDEnFace(
      plan,
      auCombat.map((a) => a.place),
    );
    enFace.forEach((place, i) => {
      const combattant = auCombat[i];
      if (combattant?.etat !== "poste") return;
      const geste = pose ? { x: 0, y: 0 } : gesteDeCombat(temps, i, "adverse");
      // Dans le plan de celui qu'il affronte.
      const plan = planDeLActeur(combattant);
      liste.push({ cle: `a${i}`, habitant: null, x: place.x + geste.x, y: place.y + geste.y, largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, z: place.y + GAULOIS_HAUTEUR - 1, ordre: liste.length, tenue: "debout", dessin: "adverse", vers: 1, rang: i, saut: 0, parle: false, serre: place.serre, planDeVue: plan, cleDuPlan: cleDuPlan(plan) });
    });

    let moi: { x: number; y: number } | null = null;
    const saute = sursaut.current && !pose ? sursaut.current : null;
    const depuis = saute ? performance.now() - saute.debut : 0;
    habitants.forEach((habitant, i) => {
      const cle = cleDe(habitant);
      const acteur = acteurs.current.get(cle);
      if (!acteur) return;
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
      let vers: 1 | -1 = 1;
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
      const plan = planDeLActeur(acteur);
      // Le sien : le milieu de la vue qui le montre au milieu de l'écran (dans son plan, s'il est au fond).
      if (habitant.gaulois.moi) moi = milieuPourVoir({ x: x + boite.largeur / 2, y: y + boite.hauteur / 2 }, camera, cote, plan);
      const saut = saute && saute.cle === cle && depuis >= 120 && depuis < 480 ? -1 : 0;
      liste.push({ cle, habitant, x, y, largeur: boite.largeur, hauteur: boite.hauteur, z: y + boite.hauteur, ordre: liste.length, tenue, dessin, vers, rang: habitant.rang, saut, parle: parlent.includes(i), serre: auPoste && acteur.place.serre, planDeVue: plan, cleDuPlan: cleDuPlan(plan) });
    });
    figurants.current = liste;
    moiA?.(moi);
  };

  /** Le plan d'une figure tel qu'il est à l'écran maintenant : le côté de ses cases et son décalage (la caméra a pu bouger). */
  const planALEcran = (f: Figurant): { case: number; decalage: { x: number; y: number } } => ({ case: caseDuPlan(cote, f.planDeVue.echelle), decalage: decalageDuPlan(camera, cote, f.planDeVue.parallaxe) });

  /** La boîte d'une figure dans le calque du monde, en pixels, maintenant. */
  const boitePx = (f: Figurant): Boite => {
    const p = planALEcran(f);
    return boiteDansLeCalque(f, p.case, p.decalage);
  };

  /** Près d'un bord de l'écran (ou de la rangée d'icônes, à gauche), l'étiquette et la bulle s'alignent sur lui. */
  const bordDe = (f: Figurant): string => {
    const b = boitePx(f);
    const milieu = b.x + b.largeur / 2 - Math.round(camera.x * cote);
    return milieu < PRES_DU_BORD + margeGauche ? "gauche" : camera.vue * cote - milieu < PRES_DU_BORD ? "droite" : "";
  };

  /**
   * Les étiquettes posées : leur place, leur taille (celle d'une case de leur plan), leur bord, et si elles parlent, sont
   * serrées ou ouvertes.
   */
  const poserEtiquettes = () => {
    const parCle = new Map(vus.current.map((f) => [f.cle, f]));
    for (const [cle, el] of etiquettes.current) {
      const f = parCle.get(cle);
      if (!f) continue;
      const boite = BOITES_DU_MONDE[f.tenue];
      const b = boitePx(f);
      const place = `translate(${b.x}px, ${b.y}px)`;
      if (el.style.transform !== place) {
        el.style.transform = place;
        el.style.zIndex = String(f.z);
      }
      // Au fond, ses cases sont plus petites : sa boîte, son nom et ses bulles se posent à leur taille.
      const casePx = caseDuPlan(cote, f.planDeVue.echelle);
      const caseDuPlanPx = casePx === cote ? "" : `${casePx}px`;
      if (el.style.getPropertyValue("--place-case") !== caseDuPlanPx) {
        if (caseDuPlanPx) el.style.setProperty("--place-case", caseDuPlanPx);
        else el.style.removeProperty("--place-case");
      }
      if (el.dataset["tenue"] !== (f.tenue === "debout" ? "pied" : f.tenue)) {
        // Debout, son ombre est peinte dans la toile : l'étiquette ne la redessine pas (`data-tenue="debout"` la poserait).
        el.dataset["tenue"] = f.tenue === "debout" ? "pied" : f.tenue;
        el.style.setProperty("--vie-l", String(boite.largeur));
        el.style.setProperty("--vie-h", String(boite.hauteur));
        el.style.setProperty("--vie-nom", String(boite.nom));
        el.style.setProperty("--vie-nom-l", String(boite.nomLargeur));
      }
      const bord = bordDe(f);
      if (el.dataset["bord"] !== bord) el.dataset["bord"] = bord;
      // Juste posée, une étiquette attend une image avant de s'ouvrir : le fondu de la feuille de style a lieu.
      const neuve = "neuve" in el.dataset;
      basculer(el, "parle", f.parle && !neuve);
      basculer(el, "serre", f.serre);
      basculer(el, "ouvert", survol.current.cle === cle && !neuve);
    }
  };

  /** Qui porte une étiquette : le sien, ceux dont le nom s'écrit, qui parle ou parlera, qui dort, le survolé, le touché. */
  const choisirLesEtiquettes = () => {
    const noms = nomsSousChacun(cote, habitants.length);
    const maintenant = performance.now();
    const { cle: survole, avant, fini } = survol.current;
    const liste: Etiquette[] = [];
    for (const f of vus.current) {
      const h = f.habitant;
      if (!h) continue;
      const dort = h.presence.lieu === "maisons";
      const touche = parole !== null && parole.rang === h.rang && parole.nom === h.gaulois.nom;
      const info = f.cle === survole || (f.cle === avant && maintenant - fini < EFFACEMENT);
      if (h.gaulois.moi || (noms && !f.serre) || (h.gaulois.replique && !dort) || f.tenue === "couche" || info || touche) liste.push({ habitant: h, info });
    }
    const avantListe = montrees.current;
    const pareil = avantListe.length === liste.length && avantListe.every((e, i) => e.habitant === liste[i]!.habitant && e.info === liste[i]!.info);
    if (!pareil) {
      montrees.current = liste;
      changerLesEtiquettes.current?.(liste);
    }
    poserEtiquettes();
  };

  /** Le Gaulois sous ce point de l'écran (le plus en avant, tous plans confondus), son corps ou son nom écrit ; `null` : personne. */
  const trouver = (clientX: number, clientY: number): Habitant | null => {
    const monde = calque.current?.closest(".monde-monde");
    if (!monde) return null;
    const point = versLeCalque(monde, plan, cote, clientX, clientY);
    if (!point) return null;
    // Tout se compare dans le calque du monde, en pixels : chaque plan a sa taille de case et son décalage.
    const touchables: (Figure & { habitant: Habitant })[] = [];
    const parCle = new Map<string, Figure & { habitant: Habitant }>();
    for (const f of vus.current) {
      if (!f.habitant) continue;
      const t = { ...boitePx(f), z: f.z, ordre: f.ordre, habitant: f.habitant };
      touchables.push(t);
      parCle.set(f.cle, t);
    }
    // Un nom écrit sous un Gaulois se touche aussi, comme avant.
    const r = monde.getBoundingClientRect();
    const optique = optiqueDe(r, plan, cote);
    for (const [cle, el] of etiquettes.current) {
      const t = parCle.get(cle);
      const nom = el.querySelector(".place-nom");
      if (!t || !nom) continue;
      const n = nom.getBoundingClientRect();
      if (n.width <= 0 || n.height <= 0) continue;
      touchables.push({ ...t, x: (n.left - r.left) / optique, y: (n.top - r.top) / optique, largeur: n.width / optique, hauteur: n.height / optique });
    }
    const i = sousLeDoigt(touchables, point.x, point.y);
    return i === null ? null : touchables[i]!.habitant;
  };

  /** Le survol de la souris : l'étiquette de celui qui est dessous s'ouvre, la main le montre. */
  const suivreLaSouris = () => {
    const s = survol.current;
    const scene = foule.current?.closest<HTMLElement>(".monde-scene");
    const habitant = s.souris && scene && !("glisse" in scene.dataset) ? trouver(s.souris.x, s.souris.y) : null;
    const cle = habitant ? cleDe(habitant) : null;
    if (scene) scene.style.cursor = cle ? "pointer" : "";
    if (cle === s.cle) return;
    if (s.cle) {
      s.avant = s.cle;
      s.fini = performance.now();
    }
    s.cle = cle;
    choisirLesEtiquettes();
  };

  /** Peint la foule autour de la vue, dans ses toiles, du fond vers le devant, chaque plan à sa taille. */
  const peindre = () => {
    const conteneur = calque.current;
    const monde = conteneur?.closest(".monde-monde");
    if (!conteneur || !monde) return;
    if (ombre.current === undefined) ombre.current = preparer(OMBRE.largeur, OMBRE.hauteur, OMBRE.masque, 0, Math.round(OMBRE.opacite * 255));
    // Ce que chaque plan garde peint : sa vue et une marge autour, en cases de ce plan.
    const marge = margeDe(camera.vue);
    const plans = new Map<string, PlanPeint>();
    const planDe = (f: Figurant): PlanPeint => {
      let p = plans.get(f.cleDuPlan);
      if (!p) {
        const casePx = caseDuPlan(cote, f.planDeVue.echelle);
        p = { plan: f.planDeVue, case: casePx, decalage: decalageDuPlan(camera, cote, f.planDeVue.parallaxe), couverture: couverture(vueDuPlan(camera, cote, f.planDeVue), (marge * cote) / casePx) };
        plans.set(f.cleDuPlan, p);
      }
      return p;
    };
    planDe({ planDeVue: PREMIER_PLAN, cleDuPlan: "" } as Figurant);
    const ici = figurants.current.filter((f) => seCroisent(f, planDe(f).couverture));
    plansPeints.current = plans;
    vus.current = ici;
    // L'ordre et les toiles se décident dans le calque du monde, en pixels, où le décor dit aussi sa place.
    const enPixels: Figure[] = ici.map((f) => {
      const p = planDe(f);
      return { ...boiteDansLeCalque(f, p.case, p.decalage), z: f.z, ordre: f.ordre, plan: f.cleDuPlan };
    });
    const ordre = ordreDeDessin(enPixels);
    const autour = boiteDansLeCalque(plans.get("")!.couverture, cote, { x: 0, y: 0 });
    const calques = calquesDeLaFoule(enPixels, ordre, ici.length > 0 ? obstaclesDuMonde(monde, plan, cote, autour) : []);
    const debut = performance.now();
    let manque = false;
    calques.forEach((c, k) => {
      let toile = toiles.current[k];
      if (!toile) {
        toile = document.createElement("canvas");
        toile.className = "village-pixels";
        toile.dataset["foule"] = "";
        toile.setAttribute("aria-hidden", "true");
        Object.assign(toile.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
        conteneur.appendChild(toile);
        toiles.current[k] = toile;
      }
      // Sa boîte, en cases de son plan.
      const p = plans.get(c.plan)!;
      let boite: Boite | null = null;
      for (let m = c.debut; m < c.fin; m++) {
        const f = ici[ordre[m]!]!;
        if (!boite) boite = { x: f.x, y: f.y, largeur: f.largeur, hauteur: f.hauteur };
        else {
          const x = Math.min(boite.x, f.x);
          const y = Math.min(boite.y, f.y);
          boite = { x, y, largeur: Math.max(boite.x + boite.largeur, f.x + f.largeur) - x, hauteur: Math.max(boite.y + boite.hauteur, f.y + f.hauteur) - y };
        }
      }
      if (!boite) return;
      // Le sursaut d'une case vers le haut reste dans la toile.
      boite = { x: boite.x, y: boite.y - 1, largeur: boite.largeur, hauteur: boite.hauteur + 1 };
      // Une toile à peine plus grande que ce qu'elle porte (par pas de 32 cases : elle change rarement de taille).
      const largeur = Math.ceil(boite.largeur / 32) * 32;
      const hauteur = Math.ceil(boite.hauteur / 32) * 32;
      if (toile.width !== largeur || toile.height !== hauteur) {
        toile.width = largeur;
        toile.height = hauteur;
      }
      const taille = `${largeur * p.case}px`;
      if (toile.style.width !== taille || toile.style.height !== `${hauteur * p.case}px`) {
        toile.style.width = taille;
        toile.style.height = `${hauteur * p.case}px`;
      }
      placees.current[k] = { cle: c.plan, x: boite.x, y: boite.y };
      toile.style.transform = `translate(${boite.x * p.case + p.decalage.x}px, ${boite.y * p.case + p.decalage.y}px)`;
      toile.style.zIndex = String(c.z);
      toile.style.display = "";
      const contexte = toile.getContext("2d");
      if (!contexte) return;
      contexte.setTransform(1, 0, 0, 1, 0, 0);
      contexte.clearRect(0, 0, largeur, hauteur);
      contexte.imageSmoothingEnabled = false;
      for (let m = c.debut; m < c.fin; m++) {
        const f = ici[ordre[m]!]!;
        const x = f.x - boite.x;
        const y = f.y - boite.y;
        // Debout, son ombre sous lui, puis lui.
        if (f.tenue === "debout" && ombre.current) contexte.drawImage(ombre.current.source, x + OMBRE.x, y + OMBRE.y);
        const cle = cleDuDessin(f);
        let dessin = atelier.deja(cle);
        if (dessin === undefined) {
          // Faire tous les dessins qui manquent d'un coup ferait sauter une image : le reste attend l'image suivante.
          if (performance.now() - debut > BUDGET_DES_DESSINS) {
            manque = true;
            continue;
          }
          dessin = atelier.prendre(cle, () => decorDe(f));
        }
        if (!dessin) continue;
        if (f.vers === 1) contexte.drawImage(dessin.source, x, y + f.saut);
        else {
          contexte.setTransform(-1, 0, 0, 1, x + dessin.largeur, y + f.saut);
          contexte.drawImage(dessin.source, 0, 0);
          contexte.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
    });
    // Les toiles en trop se cachent ; au-delà de quatre de réserve, elles s'en vont.
    placees.current.length = calques.length;
    for (let k = calques.length; k < toiles.current.length; k++) toiles.current[k]!.style.display = "none";
    while (toiles.current.length > calques.length + 4) toiles.current.pop()!.remove();
    if (foule.current && foule.current.dataset["dessines"] !== String(ici.length)) foule.current.dataset["dessines"] = String(ici.length);
    choisirLesEtiquettes();
    if (survol.current.souris) suivreLaSouris();
    if (manque && !encore.current) {
      encore.current = requestAnimationFrame(() => {
        encore.current = 0;
        moteur.current.peindre();
      });
    }
  };

  /**
   * La caméra a bougé. Tant que la vue de chaque plan reste dans ce qui en est peint, rien ne se repeint : seules les toiles
   * des plans qui glissent moins vite (parallaxe) se déplacent d'autant, et les étiquettes suivent ; sinon, tout se repeint.
   */
  const suivreLaCamera = () => {
    for (const p of plansPeints.current.values()) {
      if (!contient(p.couverture, vueDuPlan(camera, cote, p.plan))) {
        peindre();
        return;
      }
    }
    for (const [k, placee] of placees.current.entries()) {
      const p = plansPeints.current.get(placee.cle);
      const toile = toiles.current[k];
      if (!p || !toile || p.plan.parallaxe === 1) continue;
      p.decalage = decalageDuPlan(camera, cote, p.plan.parallaxe);
      toile.style.transform = `translate(${placee.x * p.case + p.decalage.x}px, ${placee.y * p.case + p.decalage.y}px)`;
    }
    poserEtiquettes();
  };

  /** Le survol, au plus une fois par image : la souris, ou le monde qui glisse sous elle. */
  const relireLeSurvol = () => {
    if (survol.current.demande) return;
    survol.current.demande = requestAnimationFrame(() => {
      survol.current.demande = 0;
      moteur.current.suivreLaSouris();
    });
  };

  // Ce que les écoutes appellent : toujours la version du dernier rendu (le plan, l'approche, la parole du moment).
  const grandRue = useMemo(() => zoneDuPromeneur(plan, 0), [plan]);
  const moteur = useRef({ calculer, peindre, suivreLaCamera, poserEtiquettes, suivreLaSouris, trouver, relireLeSurvol, avancer: (() => {}) as (temps: number) => void });
  moteur.current = {
    calculer,
    peindre,
    suivreLaCamera,
    poserEtiquettes,
    suivreLaSouris,
    trouver,
    relireLeSurvol,
    avancer: (temps: number) => {
      for (const [cle, acteur] of acteurs.current) {
        const zone = zones.get(cle) ?? grandRue;
        unTemps(acteur, zone, zone.rue ? plan.feu.x : -9999, jeu.current.hasard);
      }
      calculer(false, temps);
      peindre();
    },
  };

  /** Pour les étiquettes qui viennent d'être posées dans la page : la foule leur donne leur place. */
  const poserLesEtiquettes = useMemo(() => () => moteur.current.poserEtiquettes(), []);

  // Le monde posé, après chaque rendu : rien ne dépend de la boucle pour être complet.
  useLayoutEffect(() => {
    calculer(fige, horloge.temps);
    peindre();
  });

  // Un temps : ceux de la place se promènent (chacun dans son coin), ceux qui changent de lieu avancent, puis la foule se
  // repeint. Entre deux temps, la caméra glisse sans rien repeindre tant que la vue reste dans ce qui est peint ; au-delà,
  // la foule se repeint tout de suite autour de la nouvelle vue. Figé, plus rien ne bat : c'est la caméra qui repeint.
  useEffect(() => {
    const arreter = [
      camera.ecouter(() => {
        moteur.current.suivreLaCamera();
        if (survol.current.souris) moteur.current.relireLeSurvol();
      }),
    ];
    if (!fige) arreter.push(horloge.ecouter((temps) => moteur.current.avancer(temps)));
    return () => arreter.forEach((f) => f());
  }, [fige, horloge, camera]);

  // Le clic ou le toucher sur un Gaulois, et le survol de la souris : la scène les reçoit, la foule trouve qui est dessous.
  useEffect(() => {
    const scene = foule.current?.closest<HTMLElement>(".monde-scene");
    if (!scene) return;
    /** Le point est-il sur le monde, et non sur une fenêtre, un bouton de l'écran ou une étiquette posée devant les Gaulois ? */
    const surLeMonde = (cible: EventTarget | null): boolean => cible instanceof Element && cible.closest(".monde-monde") !== null && cible.closest(".monde-etiquette") === null;
    const clic = (e: MouseEvent) => {
      // Un glissement, ou un clic venu du clavier (Entrée sur un bouton) : ce n'est pas un toucher.
      if (aGlisse.current || e.detail === 0 || !surLeMonde(e.target)) return;
      const habitant = moteur.current.trouver(e.clientX, e.clientY);
      if (!habitant) return;
      e.preventDefault();
      e.stopPropagation();
      toucher.current(habitant);
    };
    // Un Gaulois devant une maison ou l'étal : le bouton de dessous ne prend pas le focus (la caméra irait à lui).
    const appui = (e: MouseEvent) => {
      if (e.button !== 0 || !surLeMonde(e.target) || !(e.target as Element).closest("button")) return;
      if (moteur.current.trouver(e.clientX, e.clientY)) e.preventDefault();
    };
    const bouge = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      survol.current.souris = surLeMonde(e.target) ? { x: e.clientX, y: e.clientY } : null;
      moteur.current.relireLeSurvol();
    };
    const sort = () => {
      survol.current.souris = null;
      moteur.current.suivreLaSouris();
    };
    scene.addEventListener("click", clic, true);
    scene.addEventListener("mousedown", appui, true);
    scene.addEventListener("pointermove", bouge, { passive: true });
    scene.addEventListener("pointerleave", sort);
    return () => {
      scene.removeEventListener("click", clic, true);
      scene.removeEventListener("mousedown", appui, true);
      scene.removeEventListener("pointermove", bouge);
      scene.removeEventListener("pointerleave", sort);
      cancelAnimationFrame(survol.current.demande);
      survol.current.demande = 0;
      scene.style.cursor = "";
    };
  }, []);

  // Tout s'arrête et se rend à la fin : la peinture en attente et les dessins tout faits.
  useEffect(
    () => () => {
      cancelAnimationFrame(encore.current);
      atelier.vider();
    },
    [atelier],
  );

  return (
    <div ref={foule} class="monde-habitants" data-foule={nomsSousChacun(cote, habitants.length) ? undefined : ""} data-testid="monde-foule">
      <div ref={calque} style={{ display: "contents" }} />
      <EtiquettesDeLaFoule
        brancher={(changer) => {
          changerLesEtiquettes.current = changer;
        }}
        depart={montrees.current}
        parole={parole}
        elements={etiquettes.current}
        onRendu={poserLesEtiquettes}
      />
    </div>
  );
}

/** Ajoute ou ôte un attribut `data-…` sans valeur. */
function basculer(el: HTMLElement, nom: string, oui: boolean): void {
  if (oui === nom in el.dataset) return;
  if (oui) el.dataset[nom] = "";
  else delete el.dataset[nom];
}

/**
 * Les étiquettes de la foule : du texte de la page, posé sur les Gaulois qui en ont besoin (la foule dit lesquels). Les
 * mêmes classes qu'avant (`.vie-acteur`, `.place-nom`, `.vie-info`, `.vie-bulle`, la bulle du toucher) : la feuille de
 * style les dessine comme avant. Elles ne prennent ni le clic ni le survol : la scène les donne à la foule, qui sait qui
 * est devant. Leur place est posée par la foule (`onRendu`), sans passer par ici.
 */
function EtiquettesDeLaFoule({ brancher, depart, parole, elements, onRendu }: { brancher: (changer: (liste: readonly Etiquette[]) => void) => void; depart: readonly Etiquette[]; parole: Parole | null; elements: Map<string, HTMLDivElement>; onRendu: () => void }) {
  const [liste, setListe] = useState<readonly Etiquette[]>(depart);
  useLayoutEffect(() => brancher(setListe), []);
  useLayoutEffect(() => onRendu());
  return (
    <>
      {liste.map(({ habitant, info }) => (
        <EtiquetteDuGaulois key={cleDe(habitant)} habitant={habitant} info={info} parole={parole} elements={elements} onRendu={onRendu} />
      ))}
    </>
  );
}

/** L'étiquette d'un Gaulois : rangée par sa clé tant qu'elle est dans la page. */
function EtiquetteDuGaulois({ habitant, info, parole, elements, onRendu }: { habitant: Habitant; info: boolean; parole: Parole | null; elements: Map<string, HTMLDivElement>; onRendu: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const cle = cleDe(habitant);
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return;
    elements.set(cle, el);
    // Neuve : elle s'ouvre (survol, bulle) à l'image suivante, pour que le fondu de la feuille de style ait lieu.
    el.dataset["neuve"] = "";
    const demande = requestAnimationFrame(() => {
      delete el.dataset["neuve"];
      onRendu();
    });
    return () => {
      cancelAnimationFrame(demande);
      if (elements.get(cle) === el) elements.delete(cle);
    };
  }, [cle]);
  const dort = habitant.presence.lieu === "maisons";
  return (
    <div ref={boite} class="vie-acteur monde-acteur" data-moi={habitant.gaulois.moi ? "" : undefined} data-foule="" data-testid="monde-gaulois-etiquette" style={{ pointerEvents: "none" }}>
      {dort && <span class="vie-ronfle" style={{ "--vie-retard": `${-((habitant.rang * 1.7) % 6)}s` }} />}
      {habitant.gaulois.moi && <span class="place-fleche" />}
      <span class="place-nom">{habitant.gaulois.nom}</span>
      {info && (
        <span class="vie-info">
          <span class="vie-info-nom">{habitant.gaulois.nom}</span>
          {habitant.presence.raison}
          <PlaquesDuGaulois gaulois={habitant.gaulois} />
        </span>
      )}
      {habitant.gaulois.replique && !dort && <span class="vie-bulle">{habitant.gaulois.replique}</span>}
      <BulleDuToucher parole={parole} habitant={habitant} plaques={<PlaquesDuGaulois gaulois={habitant.gaulois} />} />
    </div>
  );
}
