import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois } from "../../../lib/gaulois";
import type { GauloisDeLaPlace } from "../../../lib/village/contrat";
import type { Decor } from "../../../lib/village/decor";
import { type Bulles, avancerLesBulles, bullesAuDepart, chopeLevee, gesteDeCombat, hasardDe, souffleDuDormeur, tourneEnReunion } from "../../../lib/village/mouvement";
import { type Marcheur, avancer, marcheurA, poseDuMarcheur, promener } from "../../../lib/village/monde/marche";
import type { Plan } from "../../../lib/village/monde/plan";
import { BOITES_DU_MONDE, type Place, type Tenue, placesDEnFace, placesDuLieu, seuilDuLieu, tenueDuLieu, zoneDeLaPlace } from "../../../lib/village/monde/postes";
import { poseAuLit } from "../../../lib/village/monde/poses-monde";
import { casesDeLAdversaire, casesDesPieds, poseAttable, poseDeMarche, sansArme } from "../../../lib/village/poses";
import { type Habitant, LIEUX, type Lieu } from "../../../lib/village/vie";
import { Toile, peindre } from "../PlaceToile";
import { BulleDuToucher, type Parole } from "../PlaceToucher";
import type { CameraDuMonde } from "./camera-du-monde";
import type { Horloge } from "./horloge";
import type { Mesure } from "./MondeDecor";

/** La clé d'un habitant, d'une relecture du serveur à la suivante. */
export const cleDe = (habitant: Habitant): string => `${habitant.rang}-${habitant.gaulois.nom}`;

/**
 * Un habitant dans le monde. `poste` : il est à sa place dans son lieu (attablé, couché, au combat) ; `promene` : il est
 * de la place et va et vient dans le village ; `chemin` : son lieu vient de changer, il marche jusqu'au nouveau.
 */
interface Acteur {
  habitant: Habitant;
  lieu: Lieu;
  etat: "poste" | "promene" | "chemin";
  marche: Marcheur;
  place: Place;
}

/** Ce qui est déjà à l'écran pour un acteur : on n'y retouche que si cela change. */
interface Pose {
  place: string;
  dessin: string;
  vers: number;
  bord: string;
  parle: boolean;
  tenue: Tenue;
  serre: boolean;
}

/** La moitié de la plus large étiquette (14 rem), en pixels, et un peu d'air : plus près d'un bord, elle sortirait. */
const PRES_DU_BORD = 116;
/** La vitesse de celui qui change de lieu, en cases par temps : au pas, un peu plus vif que la promenade. */
const VITESSE_DU_CHEMIN = 2;

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
 * (`PlaceToucher.tsx`). PREMIÈRE VERSION de la marche (designer) : le développeur du monde la reprend.
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
  /** Où est le Gaulois du membre, en colonnes du monde : la petite carte le marque. */
  moiA?: (x: number | null) => void;
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
  const zone = useMemo(() => zoneDeLaPlace(plan), [plan]);

  // La relecture : chacun retrouve sa place ; celui dont le lieu a changé se met en chemin.
  useLayoutEffect(() => {
    const vus = new Set<string>();
    for (const lieu of LIEUX) {
      const places = placesDuLieu(plan, lieu, lieux[lieu].length);
      lieux[lieu].forEach((habitant, i) => {
        const cle = cleDe(habitant);
        const place = places[i]!;
        vus.add(cle);
        const acteur = acteurs.current.get(cle);
        if (!acteur) {
          acteurs.current.set(cle, { habitant, lieu, etat: lieu === "place" ? "promene" : "poste", marche: marcheurA(place.x, place.y, jeu.current.hasard), place });
          return;
        }
        acteur.habitant = habitant;
        if (acteur.lieu !== lieu) {
          // Il sort par la porte de l'ancien lieu, et vise celle du nouveau (ou un coin du village, s'il va se promener).
          if (acteur.etat === "poste") {
            const sortie = seuilDuLieu(plan, acteur.lieu, acteur.place);
            acteur.marche.x = sortie.x;
            acteur.marche.y = sortie.y;
          }
          acteur.marche.but = lieu === "place" ? { x: place.x, y: place.y } : seuilDuLieu(plan, lieu, place);
          acteur.marche.pas = 0;
          acteur.etat = "chemin";
          acteur.lieu = lieu;
        }
        acteur.place = place;
      });
    }
    for (const cle of [...acteurs.current.keys()]) {
      if (vus.has(cle)) continue;
      acteurs.current.delete(cle);
      poses.current.delete(cle);
    }
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
        if (acteur.marche.x + GAULOIS_LARGEUR > camera.x && acteur.marche.x < camera.x + camera.vue) parleurs.push(i);
      });
    }
    const parlent = pose ? [] : avancerLesBulles(jeu.current.bulles, temps, parleurs);
    let moi: number | null = null;

    habitants.forEach((habitant, i) => {
      const cle = cleDe(habitant);
      const acteur = acteurs.current.get(cle);
      const el = elements.current.get(cle);
      const toile = toiles.current.get(cle);
      if (!acteur || !el || !toile) return;
      // Figé, celui qui était en chemin est arrivé.
      if (pose && acteur.etat === "chemin") {
        acteur.etat = acteur.lieu === "place" ? "promene" : "poste";
        acteur.marche.but = null;
        if (acteur.lieu === "place") {
          acteur.marche.x = acteur.place.x;
          acteur.marche.y = acteur.place.y;
        }
      }
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
      if (habitant.gaulois.moi) moi = x + boite.largeur / 2;

      const place = `translate(${x * cote}px, ${y * cote}px)`;
      // Près d'un bord de l'écran, l'étiquette et la bulle s'alignent sur lui.
      const milieu = (x + boite.largeur / 2 - camera.x) * cote;
      const bord = milieu < PRES_DU_BORD ? "gauche" : largeurVue - milieu < PRES_DU_BORD ? "droite" : "";
      const parle = parlent.includes(i);
      const serre = auPoste && acteur.place.serre;
      const avant = poses.current.get(cle);
      if (!avant || avant.tenue !== tenue) {
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
      if (!avant || avant.dessin !== dessin || avant.tenue !== tenue) {
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
      poses.current.set(cle, { place, dessin, vers, bord, parle, tenue, serre });
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

  // Un temps : ceux de la place se promènent, ceux qui changent de lieu avancent, puis tout se redessine.
  useEffect(() => {
    if (fige) return;
    return horloge.ecouter((temps) => {
      for (const acteur of acteurs.current.values()) {
        if (acteur.etat === "promene") promener(acteur.marche, zone, plan.feu.x, jeu.current.hasard);
        else if (acteur.etat === "chemin" && avancer(acteur.marche, VITESSE_DU_CHEMIN)) acteur.etat = acteur.lieu === "place" ? "promene" : "poste";
      }
      dessiner(false, temps);
    });
  }, [fige, horloge, habitants, plan, cote, zone]);

  const adversaires = useMemo(() => lieux.bataille.map((_, i) => casesDeLAdversaire(i)), [lieux.bataille.length]);

  return (
    <>
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
            </span>
            {habitant.gaulois.replique && !dort && <span class="vie-bulle">{habitant.gaulois.replique}</span>}
            <BulleDuToucher parole={parole} habitant={habitant} />
          </div>
        );
      })}
    </>
  );
}
