import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { BatimentId } from "../../../lib/village/chantier-liste";
import type { Decor } from "../../../lib/village/decor";
import { type Lumiere, cleDeLumiere, melanger } from "../../../lib/village/lumiere";
import type { EtatDuMonde } from "../../../lib/village/monde-etat";
import { hasardDe } from "../../../lib/village/mouvement";
import { FIGURANTS } from "../../../lib/village/monde/almanach/figurants";
import type { LutinDeLAlmanach } from "../../../lib/village/monde/almanach/jeu";
import type { Moment } from "../../../lib/village/monde/almanach/moment";
import { ProgrammeDeLAlmanach, lireLesMoments, tempsDuMonde } from "../../../lib/village/monde/almanach/programme";
import { TAILLES_DES_BETES, betesDuPlan, dessinDeLaBete } from "../../../lib/village/monde/betes";
import { type Lutin, enMiroir, fusee, gerbe, lutinsDesEvenements, tourne } from "../../../lib/village/monde/evenements";
import { PREMIER_PLAN, caseDuPlan, decalageDuPlan, fondDuPlan, vueDuPlan } from "../../../lib/village/monde/foule";
import { brumeDuFond } from "../../../lib/village/monde/lointain";
import { type Marcheur, marcheurA, marcheurDansSonCoin, promener } from "../../../lib/village/monde/marche";
import { ECHELLE_DU_FOND, type Plan } from "../../../lib/village/monde/plan";
import { DESSINS_OPENFRONT, type PieceOpenFrontId } from "../../../lib/village/openfront";
import { peindre } from "../PlaceToile";
import type { CameraDuMonde } from "./camera-du-monde";
import type { Horloge } from "./horloge";
import type { Mesure } from "./MondeDecor";

const tailleDe = (id: PieceOpenFrontId) => DESSINS_OPENFRONT[id];

/** Les figurants de l'almanach des petits moments, par identifiant. */
const FIGURANTS_PAR_ID = new Map(FIGURANTS.map((f) => [f.id, f]));

/** Ce qui est à l'écran pour un lutin : sa toile, et ce qu'elle montre déjà. */
interface Pose {
  toile: HTMLCanvasElement;
  dessin: string;
  place: string;
  coupe: string;
  opacite: string;
}

/** Les bâtiments finis au chantier du monde ; sans données, aucun. */
function batimentsFinis(etat: EtatDuMonde | undefined): ReadonlySet<BatimentId> {
  return new Set((etat?.chantier?.batiments ?? []).filter((b) => b.fini_le !== null).map((b) => b.id));
}

/**
 * Les événements du monde d'OpenFront (`evenements.ts`) : le train, les tirs des navires, le missile, l'interception ; et,
 * entre eux, de loin en loin, un petit moment de l'almanach (`almanach/programme.ts`) : une charrette, un vol d'oies, la
 * brume sur le ruisseau. Tout est réglé sur l'heure de l'horloge, la même pour tous (`tempsDuMonde`) : le même instant
 * donne la même scène sur chaque écran ; l'horloge du monde ne fait que battre la mesure. À chaque temps, le calcul dit
 * quoi montrer et où ; ici, une petite toile par dessin, créée quand il paraît, ôtée quand il s'en va, repeinte seulement
 * quand son image change. Les dessins sont gardés en mémoire tant que la lumière ne change pas. Figé (bouton pause,
 * « réduire les animations ») ou page cachée, il ne se passe rien, et rien ne reste à l'écran. C'est un décor : caché aux
 * lecteurs d'écran avec le reste du dessin, il ne dit rien du clan.
 *
 * `etat` : l'état du monde, pour ne jouer que les moments dont les bâtiments sont finis ; sans lui, seulement ceux qui
 * n'en demandent aucun.
 */
export function MondeEvenements({ plan, lumiere, mesure, horloge, fige, etat }: { plan: Plan; lumiere: Lumiere; mesure: Mesure; horloge: Horloge; fige: boolean; etat?: EtatDuMonde }) {
  const { cote } = mesure;
  const calque = useRef<HTMLDivElement>(null);
  const cle = cleDeLumiere(lumiere, 700);
  // Les moments de l'almanach : un fichier à part, chargé seulement quand le monde s'anime et qu'il y a des figurants à
  // jouer. Illisible ou absent : une liste vide, il ne se passe rien.
  const [moments, setMoments] = useState<readonly Moment[] | null>(null);
  useEffect(() => {
    if (fige || moments !== null || FIGURANTS.length === 0) return;
    let vivant = true;
    import("../../../lib/village/monde/almanach/moments.json")
      .then((module) => vivant && setMoments(lireLesMoments(module.default)))
      .catch(() => vivant && setMoments([]));
    return () => {
      vivant = false;
    };
  }, [fige, moments]);
  const finis = useMemo(() => [...batimentsFinis(etat)].sort().join(","), [etat]);
  const programme = useMemo(() => new ProgrammeDeLAlmanach({ moments: moments ?? [], figurants: FIGURANTS_PAR_ID, finis: new Set(finis.split(",").filter(Boolean) as BatimentId[]) }), [moments, finis]);

  useEffect(() => {
    const el = calque.current;
    if (!el || fige) return;
    const poses = new Map<string, Pose>();
    const dessins = new Map<string, Decor>();
    const nomDuLutin = (lutin: Lutin): string => `${lutin.dessin}:${lutin.image}:${lutin.miroir ? 1 : 0}:${lutin.angle ?? 0}`;
    const dessinDe = (lutin: Lutin): Decor => {
      const nom = nomDuLutin(lutin);
      let dessin = dessins.get(nom);
      if (!dessin) {
        if (lutin.dessin === "gerbe") dessin = gerbe(lumiere, lutin.image);
        else if (lutin.dessin === "fusee") dessin = fusee(lutin.image, false);
        else if (lutin.dessin === "fusee-d-en-face") dessin = fusee(lutin.image, true);
        else {
          const piece = DESSINS_OPENFRONT[lutin.dessin];
          // Chaque pièce ramène le compteur d'images à son propre nombre ; le tir de la batterie a ses images à part.
          dessin = piece.dessiner(lumiere, lutin.dessin === "batterie" || lutin.dessin === "silo" ? lutin.image : lutin.image % piece.images);
        }
        if (lutin.miroir) dessin = enMiroir(dessin);
        if (lutin.angle) dessin = tourne(dessin, lutin.angle);
        dessins.set(nom, dessin);
      }
      return dessin;
    };
    const nomDuFigurant = (lutin: LutinDeLAlmanach): string => `almanach:${lutin.figurant}:${lutin.image}:${lutin.miroir ? 1 : 0}`;
    const dessinDuFigurant = (lutin: LutinDeLAlmanach): Decor | null => {
      const nom = nomDuFigurant(lutin);
      let dessin = dessins.get(nom);
      if (!dessin) {
        const figurant = FIGURANTS_PAR_ID.get(lutin.figurant);
        if (!figurant) return null;
        dessin = figurant.dessiner(lumiere, lutin.image % Math.max(1, figurant.images));
        if (lutin.miroir) dessin = enMiroir(dessin);
        dessins.set(nom, dessin);
      }
      return dessin;
    };
    const vus = new Set<string>();
    /** Pose un dessin à l'écran : sa toile, créée au besoin, repeinte si son image change, déplacée si sa place change. */
    const poser = (cleDuLutin: string, nom: string, dessin: Decor, x: number, y: number, pied: number, coupe: string, opacite: number) => {
      vus.add(cleDuLutin);
      let pose = poses.get(cleDuLutin);
      if (!pose) {
        const toile = document.createElement("canvas");
        toile.className = "village-pixels monde-lutin";
        el.appendChild(toile);
        pose = { toile, dessin: "", place: "", coupe: "", opacite: "" };
        poses.set(cleDuLutin, pose);
      }
      if (pose.dessin !== nom) {
        pose.toile.width = dessin.largeur;
        pose.toile.height = dessin.hauteur;
        pose.toile.style.width = `${dessin.largeur * cote}px`;
        pose.toile.style.height = `${dessin.hauteur * cote}px`;
        peindre(pose.toile, dessin.largeur, dessin.hauteur, dessin.cases);
        pose.dessin = nom;
      }
      const place = `translate(${Math.round(x) * cote}px, ${Math.round(y) * cote}px)`;
      if (pose.place !== place) {
        pose.toile.style.transform = place;
        pose.toile.style.zIndex = String(pied);
        pose.place = place;
      }
      if (pose.coupe !== coupe) {
        pose.toile.style.clipPath = coupe;
        pose.coupe = coupe;
      }
      // Les fondus d'entrée et de sortie des figurants : au centième, et rien à écrire tant qu'elle ne change pas.
      const visible = opacite >= 1 ? "" : String(opacite);
      if (pose.opacite !== visible) {
        pose.toile.style.opacity = visible;
        pose.opacite = visible;
      }
    };
    const montrer = () => {
      const temps = tempsDuMonde(Date.now());
      vus.clear();
      // Pendant le cycle d'un petit moment, le missile reste dans son silo : jamais deux choses à la fois.
      for (const lutin of lutinsDesEvenements(plan, tailleDe, temps, { lancement: programme.duCycle(temps) === null })) {
        const dessin = dessinDe(lutin);
        // Le missile encore dans son silo : ce qui est sous la bouche ne se voit pas.
        const cache = lutin.coupe === undefined ? 0 : Math.max(0, Math.round(lutin.y) + dessin.hauteur - lutin.coupe);
        // Le train qui entre au dépôt : ce qui a passé la porte ne se voit plus.
        const cacheADroite = lutin.coupeADroite === undefined ? 0 : Math.max(0, Math.round(lutin.x) + dessin.largeur - lutin.coupeADroite);
        const coupe = cache > 0 || cacheADroite > 0 ? `inset(0 ${cacheADroite * cote}px ${cache * cote}px 0)` : "";
        poser(lutin.cle, nomDuLutin(lutin), dessin, lutin.x, lutin.y, lutin.pied, coupe, 1);
      }
      for (const lutin of programme.lutins(plan, temps)) {
        const dessin = dessinDuFigurant(lutin);
        if (dessin) poser(lutin.cle, nomDuFigurant(lutin), dessin, lutin.x, lutin.y, lutin.pied, "", lutin.opacite);
      }
      for (const [nom, pose] of poses) {
        if (vus.has(nom)) continue;
        pose.toile.remove();
        poses.delete(nom);
      }
    };
    montrer();
    const arreter = horloge.ecouter(montrer);
    return () => {
      arreter();
      for (const pose of poses.values()) pose.toile.remove();
    };
  }, [plan, cle, cote, horloge, fige, programme]);

  return <div ref={calque} class="monde-evenements" />;
}

/**
 * Les bêtes du village et la charrette (`betes.ts`) : chacune va et vient calmement dans son coin, comme un promeneur,
 * et s'arrête longtemps. Une petite toile chacune, repeinte quand son pas change ; celles qu'on ne voit pas ne sont pas
 * redessinées. Figé, elles restent posées là où elles sont.
 */
export function MondeBetes({ plan, lumiere, mesure, camera, horloge, fige }: { plan: Plan; lumiere: Lumiere; mesure: Mesure; camera: CameraDuMonde; horloge: Horloge; fige: boolean }) {
  const { cote } = mesure;
  const brume = brumeDuFond(lumiere);
  const betes = useMemo(() => betesDuPlan(plan), [plan]);
  const toiles = useRef(new Map<string, HTMLCanvasElement | null>());
  const marches = useRef(new Map<string, Marcheur>());

  useEffect(() => {
    const hasard = hasardDe(4711 + plan.habitants);
    const peintes = new Map<string, string>();
    for (const bete of betes) {
      // Une bête déjà là reste où elle est, tant qu'elle est encore dans son coin, but compris. Quand le plan change (le
      // monde d'abord bâti sans Gaulois puis pour tous, une terrasse de plus, la rue qui descend), son coin bouge : elle y
      // est reposée d'un coup, au lieu de traverser la colline pendant des minutes (relecture du 14 novembre 2026).
      const avant = marches.current.get(bete.cle);
      if (!avant || !marcheurDansSonCoin(avant, bete.zone)) marches.current.set(bete.cle, marcheurA(bete.zone.de + hasard() * (bete.zone.a - bete.zone.de), bete.zone.haut + hasard() * (bete.zone.bas - bete.zone.haut), hasard));
    }
    for (const nom of [...marches.current.keys()]) if (!betes.some((b) => b.cle === nom)) marches.current.delete(nom);
    const montrer = (temps: number, avance: boolean) => {
      for (const bete of betes) {
        const marche = marches.current.get(bete.cle)!;
        if (avance && temps % bete.lenteur === 0) promener(marche, bete.zone, -9999, hasard);
        const toile = toiles.current.get(bete.cle);
        if (!toile) continue;
        const taille = TAILLES_DES_BETES[bete.bete];
        // Une bête du fond se compte en cases de sa terrasse : sa vue, sa case à l'écran et son décalage sont ceux de ce plan.
        const vue = bete.fond ? { echelle: ECHELLE_DU_FOND, parallaxe: bete.fond.parallaxe } : PREMIER_PLAN;
        const v = vueDuPlan(camera, cote, vue);
        if (marche.x > v.x + v.largeur + 60 || marche.x + taille.largeur < v.x - 60 || marche.y > v.y + v.hauteur + 60 || marche.y + taille.hauteur < v.y - 60) continue;
        const casePx = caseDuPlan(cote, vue.echelle);
        const decalage = decalageDuPlan(camera, cote, vue.parallaxe).x;
        const image = marche.but && !fige ? Math.floor(marche.pas / 2) % 2 : 0;
        const nom = `${image}:${marche.vers}:${marche.x}:${marche.y}:${decalage}`;
        if (peintes.get(bete.cle) === nom) continue;
        if (!peintes.get(bete.cle)?.startsWith(`${image}:`)) {
          const dessin = dessinDeLaBete(bete.bete, image, bete.variante);
          // La distance la pâlit comme sa terrasse.
          const voile = bete.fond?.voile ?? 0;
          peindre(toile, dessin.largeur, dessin.hauteur, voile > 0 ? dessin.cases.map((couleur) => (couleur ? melanger(couleur, brume, voile) : null)) : dessin.cases);
        }
        toile.style.transform = `translate(${marche.x * casePx + decalage}px, ${marche.y * casePx}px)${marche.vers === 1 ? "" : " scaleX(-1)"}`;
        toile.style.zIndex = String(marche.y + taille.hauteur + fondDuPlan(vue));
        peintes.set(bete.cle, nom);
      }
    };
    montrer(horloge.temps, false);
    const arreter = [fige ? () => {} : horloge.ecouter((temps) => montrer(temps, true)), camera.ecouter(() => montrer(horloge.temps, false))];
    return () => arreter.forEach((f) => f());
  }, [betes, cote, camera, horloge, fige, brume]);

  return (
    <>
      {betes.map((bete) => {
        const taille = TAILLES_DES_BETES[bete.bete];
        const casePx = caseDuPlan(cote, bete.fond ? ECHELLE_DU_FOND : 1);
        return (
          <canvas
            key={bete.cle}
            ref={(el) => {
              toiles.current.set(bete.cle, el);
            }}
            width={taille.largeur}
            height={taille.hauteur}
            class="village-pixels monde-bete"
            style={{ width: `${taille.largeur * casePx}px`, height: `${taille.hauteur * casePx}px` }}
          />
        );
      })}
    </>
  );
}
