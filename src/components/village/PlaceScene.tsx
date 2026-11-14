import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { casesDuGaulois } from "../../lib/gaulois";
import { type Decor, FEU_HAUTEUR, flammesDuFeu } from "../../lib/village/decor";
import { CASE_DE_LOIN, caseDeLaScene, estSansNom, largeurDuDecor } from "../../lib/village/ecran-place";
import { BOITES, composerLieu } from "../../lib/village/lieux";
import { type Lumiere, cleDeLumiere } from "../../lib/village/lumiere";
import {
  type Bulles,
  type Promeneur,
  TEMPS_PAR_SECONDE,
  avancerLaPlace,
  avancerLesBulles,
  bullesAuDepart,
  chopeLevee,
  departDeLaPlace,
  gesteDeCombat,
  hasardDe,
  imageDeLaFlamme,
  pasDuPromeneur,
  souffleDuDormeur,
  tourneEnReunion,
} from "../../lib/village/mouvement";
import { casesDeLAdversaire, poseAttable, poseCouche, poseDeMarche, sansArme } from "../../lib/village/poses";
import type { Habitant, Lieu } from "../../lib/village/vie";
import { Toile, peindre } from "./PlaceToile";

/**
 * Les animations sont coupées : par le bouton pause de l'en-tête (`fx-off` sur la page, posé par `fx.ts`) ou par le
 * réglage « réduire les animations ». La scène reste alors posée, complète : chacun à son poste, debout, le feu allumé.
 */
function useFige(): boolean {
  const [fige, setFige] = useState(false);
  useLayoutEffect(() => {
    const racine = document.documentElement;
    const reglage = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lire = () => setFige(racine.classList.contains("fx-off") || reglage.matches);
    lire();
    const veille = new MutationObserver(lire);
    veille.observe(racine, { attributes: true, attributeFilter: ["class"] });
    reglage.addEventListener("change", lire);
    return () => {
      veille.disconnect();
      reglage.removeEventListener("change", lire);
    };
  }, []);
  return fige;
}

/** Ce qui change d'un temps à l'autre, gardé hors du rendu : la marche de chacun, les bulles, le compte des temps. */
interface Jeu {
  cle: string;
  temps: number;
  promeneurs: Promeneur[];
  bulles: Bulles;
  hasard: () => number;
}

/** Ce qui est déjà à l'écran pour un acteur : on n'y retouche que si cela change. */
interface Pose {
  place: string;
  dessin: string;
  vers: number;
  bord: string;
  parle: boolean;
}

const FLAMMES = flammesDuFeu();
/** La moitié de la plus large étiquette (14 rem), en pixels, et un peu d'air : plus près d'un bord, elle sortirait. */
const PRES_DU_BORD = 116;

/**
 * Un lieu du village et ceux qui s'y trouvent. Le décor est une toile, à la largeur de l'écran ; chaque Gaulois est posé
 * dessus à son poste, et s'anime huit fois par seconde : il marche sur la place, frappe au champ de bataille, lève sa
 * chope à la taverne, se tourne vers son voisin en réunion, respire dans son lit. Rien ne tourne quand l'onglet n'est pas
 * ouvert (`actif`), quand la page est cachée, ni quand les animations sont coupées.
 *
 * La scène est un dessin : les lecteurs d'écran et le clavier ont la liste « Qui est où », sous elle. Au survol ou au
 * toucher, un Gaulois montre ce qui le place là. Sur un téléphone, un lieu plein se regarde de plus loin (`data-loin`) :
 * les noms ne s'écrivent plus sous chacun, sauf le sien ; ils restent au toucher et dans la liste.
 */
export default function PlaceScene({ lieu, habitants, lumiere, actif }: { lieu: Lieu; habitants: readonly Habitant[]; lumiere: Lumiere; actif: boolean }) {
  const cadre = useRef<HTMLDivElement>(null);
  const [mesure, setMesure] = useState<{ cote: number; cases: number } | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const fige = useFige();
  const nombre = habitants.length;

  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const mesurer = () => {
      const cote = caseDeLaScene(window.innerWidth, nombre);
      const cases = largeurDuDecor(el.clientWidth, cote);
      setMesure((avant) => (avant && avant.cote === cote && avant.cases === cases ? avant : { cote, cases }));
    };
    mesurer();
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(el);
    return () => observateur?.disconnect();
  }, [nombre]);

  const cote = mesure?.cote ?? 2;
  const cases = mesure?.cases ?? null;
  const lueur = cases === null ? "" : cleDeLumiere(lumiere, cases);
  // Le décor ne se recompose que si la largeur, la foule ou la lumière changent d'un pas.
  const scene = useMemo(() => (cases === null ? null : composerLieu(lieu, cases, nombre, lumiere)), [lieu, cases, nombre, lueur]);
  const boite = BOITES[lieu];

  // Les dessins de chacun, pose par pose, faits à la demande et gardés tant que la foule ne change pas.
  const dessins = useMemo(() => {
    const debout = new Map<number, (string | null)[]>();
    const faits = new Map<string, Decor>();
    const base = (i: number): (string | null)[] => {
      let cases = debout.get(i);
      if (!cases) {
        const tenue = habitants[i]!.gaulois.tenue;
        cases = casesDuGaulois(lieu === "place" || lieu === "bataille" ? tenue : sansArme(tenue));
        debout.set(i, cases);
      }
      return cases;
    };
    return (i: number, pose: string): Decor => {
      const cle = `${i}:${pose}`;
      let dessin = faits.get(cle);
      if (!dessin) {
        const cases = base(i);
        if (pose === "gauche" || pose === "droite") dessin = { largeur: boite.largeur, hauteur: boite.hauteur, cases: poseDeMarche(cases, pose) };
        else if (pose === "posee" || pose === "levee") dessin = poseAttable(cases, pose);
        else if (pose === "assis") dessin = poseAttable(cases, null);
        else if (pose === "couche0" || pose === "couche1") dessin = poseCouche(cases, pose === "couche1" ? 1 : 0, habitants[i]!.rang);
        else dessin = { largeur: boite.largeur, hauteur: boite.hauteur, cases };
        faits.set(cle, dessin);
      }
      return dessin;
    };
  }, [habitants, lieu]);

  const acteurs = useRef<(HTMLDivElement | null)[]>([]);
  const toiles = useRef<(HTMLCanvasElement | null)[]>([]);
  const adverses = useRef<(HTMLDivElement | null)[]>([]);
  const flamme = useRef<HTMLCanvasElement>(null);
  const jeu = useRef<Jeu | null>(null);
  const poses = useRef<(Pose | undefined)[]>([]);
  const flammePeinte = useRef(-1);

  // Tout ce qui est déjà peint est oublié quand les toiles changent : nouvelle foule, autre lieu, autre taille.
  useLayoutEffect(() => {
    poses.current = [];
    flammePeinte.current = -1;
  }, [dessins, cote, scene?.postes.length]);

  /** Met la scène à l'heure du jeu : la place, la pose et le côté de chacun. `pose` : tout le monde au repos. */
  const dessiner = (pose: boolean) => {
    if (!scene) return;
    const cle = `${lieu}:${scene.decor.largeur}:${nombre}`;
    if (!jeu.current || jeu.current.cle !== cle) {
      const hasard = hasardDe(nombre * 7919 + scene.decor.largeur);
      jeu.current = { cle, temps: 0, promeneurs: lieu === "place" && scene.feu ? departDeLaPlace(nombre, scene.postes, scene.feu.x, hasard) : [], bulles: bullesAuDepart(), hasard };
    }
    const { temps, promeneurs, bulles } = jeu.current;
    const parleurs: number[] = [];
    if (!pose && lieu !== "maisons") habitants.forEach((h, i) => h.gaulois.replique && parleurs.push(i));
    const parlent = pose ? [] : avancerLesBulles(bulles, temps, parleurs);
    const largeurScene = scene.decor.largeur;

    for (let i = 0; i < nombre; i++) {
      const el = acteurs.current[i];
      const toile = toiles.current[i];
      if (!el || !toile) continue;
      const promeneur = promeneurs[i];
      const poste = scene.postes[lieu === "place" ? (promeneur?.poste ?? i) : i];
      if (!poste) continue;
      let x = poste.x;
      let y = poste.y;
      let vers = 1;
      let dessin = "debout";
      if (lieu === "place" && promeneur && !pose) {
        x = promeneur.x;
        y = promeneur.y;
        vers = promeneur.vers;
        dessin = pasDuPromeneur(promeneur);
      } else if (lieu === "bataille" && !pose) {
        const geste = gesteDeCombat(temps, i, "gaulois");
        x += geste.x;
        y += geste.y;
      } else if (lieu === "taverne") dessin = !pose && chopeLevee(temps, i) ? "levee" : "posee";
      else if (lieu === "reunion") {
        dessin = "assis";
        vers = pose ? 1 : tourneEnReunion(temps, i);
      } else if (lieu === "maisons") dessin = pose ? "couche0" : `couche${souffleDuDormeur(temps, i)}`;

      const place = `translate(${x * cote}px, ${y * cote}px)`;
      // Près d'un bord, l'étiquette du survol et la bulle s'alignent sur lui : comptées en pixels, pour toute taille de case.
      const milieu = (x + boite.largeur / 2) * cote;
      const bord = milieu < PRES_DU_BORD ? "gauche" : largeurScene * cote - milieu < PRES_DU_BORD ? "droite" : "";
      const parle = parlent.includes(i);
      const avant = poses.current[i];
      if (!avant || avant.place !== place) {
        el.style.transform = place;
        el.style.zIndex = String(y + boite.hauteur);
      }
      if (!avant || avant.dessin !== dessin) {
        const image = dessins(i, dessin);
        peindre(toile, image.largeur, image.hauteur, image.cases);
      }
      if (!avant || avant.vers !== vers) toile.style.transform = vers === 1 ? "" : "scaleX(-1)";
      if (!avant || avant.bord !== bord) el.dataset["bord"] = bord;
      if (!avant || avant.parle !== parle) {
        if (parle) el.dataset["parle"] = "";
        else delete el.dataset["parle"];
      }
      poses.current[i] = { place, dessin, vers, bord, parle };
    }
    scene.adversaires.forEach((poste, i) => {
      const el = adverses.current[i];
      if (!el) return;
      const geste = pose ? { x: 0, y: 0 } : gesteDeCombat(temps, poste.col + poste.rang * 3, "adverse");
      el.style.transform = `translate(${(poste.x + geste.x) * cote}px, ${(poste.y + geste.y) * cote}px)`;
    });
    const image = pose ? 0 : imageDeLaFlamme(temps);
    if (flamme.current && flammePeinte.current !== image) {
      const dessin = FLAMMES[image]!;
      peindre(flamme.current, dessin.largeur, dessin.hauteur, dessin.cases);
      flammePeinte.current = image;
    }
  };

  // La scène posée, après chaque rendu : rien ne dépend de la boucle pour être complet.
  useLayoutEffect(() => dessiner(fige || !actif));

  // La boucle : un temps tous les huitièmes de seconde, cadencé par le navigateur, qui s'arrête de lui-même page cachée.
  useEffect(() => {
    if (!scene || !actif || fige) return;
    let demande = 0;
    let dernier = 0;
    const tourner = (maintenant: number) => {
      demande = requestAnimationFrame(tourner);
      if (maintenant - dernier < 1000 / TEMPS_PAR_SECONDE) return;
      dernier = maintenant;
      const partie = jeu.current;
      if (!partie) return;
      partie.temps++;
      if (lieu === "place") avancerLaPlace(partie.promeneurs, scene.postes, partie.hasard);
      dessiner(false);
    };
    demande = requestAnimationFrame(tourner);
    return () => cancelAnimationFrame(demande);
  }, [scene, actif, fige, dessins, cote]);

  const adversaires = useMemo(() => (scene ? scene.adversaires.map((poste) => casesDeLAdversaire(poste.col + poste.rang)) : []), [scene?.adversaires.length]);

  return (
    <div
      ref={cadre}
      class="place-scene"
      data-lieu={lieu}
      data-loin={cote === CASE_DE_LOIN ? "" : undefined}
      data-testid="place-scene"
      aria-hidden="true"
      style={{ "--place-case": `${cote}px`, "--vie-l": String(boite.largeur), "--vie-h": String(boite.hauteur), "--vie-nom": String(boite.nom), height: scene ? `${scene.decor.hauteur * cote}px` : undefined }}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest(".vie-acteur")) setOuvert(null);
      }}
    >
      {scene && <Toile largeur={scene.decor.largeur} hauteur={scene.decor.hauteur} cases={scene.decor.cases} echelle={cote} class="place-decor" />}
      {scene?.feu && (
        <div class="vie-feu" style={{ "--feu-x": String(scene.feu.x), "--feu-y": String(scene.feu.y) }}>
          <canvas ref={flamme} width={FLAMMES[0]!.largeur} height={FLAMMES[0]!.hauteur} class="village-pixels vie-flamme" />
          {scene.fumee && (
            <div class="place-fumee" style={{ "--feu-bas": String(FEU_HAUTEUR) }}>
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
      )}
      {scene?.adversaires.map((poste, i) => (
        <div
          key={`a${i}`}
          ref={(el) => {
            adverses.current[i] = el;
          }}
          class="vie-acteur vie-adverse"
          style={{ zIndex: poste.y + boite.hauteur - 1 }}
        >
          <Toile largeur={boite.largeur} hauteur={boite.hauteur} cases={adversaires[i] ?? []} class="vie-toile" />
        </div>
      ))}
      {scene &&
        habitants.map((habitant, i) => (
          <div
            key={`${habitant.rang}-${habitant.gaulois.nom}`}
            ref={(el) => {
              acteurs.current[i] = el;
            }}
            class="vie-acteur"
            data-moi={habitant.gaulois.moi ? "" : undefined}
            data-sans-nom={estSansNom(habitant.gaulois) ? "" : undefined}
            data-ouvert={ouvert === habitant.rang ? "" : undefined}
            data-testid="place-gaulois"
            onClick={() => setOuvert(ouvert === habitant.rang ? null : habitant.rang)}
          >
            {lieu === "maisons" && <span class="vie-ronfle" style={{ "--vie-retard": `${-((habitant.rang * 1.7) % 6)}s` }} />}
            {habitant.gaulois.moi && <span class="place-fleche" />}
            <canvas
              ref={(el) => {
                toiles.current[i] = el;
              }}
              width={boite.largeur}
              height={boite.hauteur}
              class="village-pixels vie-toile"
            />
            <span class="place-nom">{habitant.gaulois.nom}</span>
            <span class="vie-info">
              <span class="vie-info-nom">{habitant.gaulois.nom}</span>
              {habitant.presence.raison}
            </span>
            {habitant.gaulois.replique && lieu !== "maisons" && <span class="vie-bulle">{habitant.gaulois.replique}</span>}
          </div>
        ))}
    </div>
  );
}
