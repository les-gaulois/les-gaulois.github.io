import { useEffect, useMemo, useRef } from "preact/hooks";
import type { Decor } from "../../../lib/village/decor";
import { type Lumiere, cleDeLumiere } from "../../../lib/village/lumiere";
import { hasardDe } from "../../../lib/village/mouvement";
import { TAILLES_DES_BETES, betesDuPlan, dessinDeLaBete } from "../../../lib/village/monde/betes";
import { type Lutin, enMiroir, fusee, gerbe, lutinsDesEvenements, tourne } from "../../../lib/village/monde/evenements";
import { type Marcheur, marcheurA, promener } from "../../../lib/village/monde/marche";
import type { Plan } from "../../../lib/village/monde/plan";
import { DESSINS_OPENFRONT, type PieceOpenFrontId } from "../../../lib/village/openfront";
import { peindre } from "../PlaceToile";
import type { CameraDuMonde } from "./camera-du-monde";
import type { Horloge } from "./horloge";
import type { Mesure } from "./MondeDecor";

const tailleDe = (id: PieceOpenFrontId) => DESSINS_OPENFRONT[id];

/** Ce qui est à l'écran pour un lutin : sa toile, et ce qu'elle montre déjà. */
interface Pose {
  toile: HTMLCanvasElement;
  dessin: string;
  place: string;
  coupe: string;
}

/**
 * Les événements du monde d'OpenFront (`evenements.ts`) : le train, les tirs des navires, le missile, l'interception. À
 * chaque temps de l'horloge, le calcul dit quoi montrer et où ; ici, une petite toile par dessin, créée quand il paraît,
 * ôtée quand il s'en va, repeinte seulement quand son image change. Figé (bouton pause, « réduire les animations ») ou
 * page cachée, il ne se passe rien, et rien ne reste à l'écran. C'est un décor : caché aux lecteurs d'écran avec le reste
 * du dessin, il ne dit rien du clan.
 */
export function MondeEvenements({ plan, lumiere, mesure, horloge, fige }: { plan: Plan; lumiere: Lumiere; mesure: Mesure; horloge: Horloge; fige: boolean }) {
  const { cote } = mesure;
  const calque = useRef<HTMLDivElement>(null);
  const cle = cleDeLumiere(lumiere, 700);

  useEffect(() => {
    const el = calque.current;
    if (!el || fige) return;
    const poses = new Map<string, Pose>();
    const dessins = new Map<string, Decor>();
    const dessinDe = (lutin: Lutin): Decor => {
      const nom = `${lutin.dessin}:${lutin.image}:${lutin.miroir ? 1 : 0}:${lutin.angle ?? 0}`;
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
    const montrer = (temps: number) => {
      const lutins = lutinsDesEvenements(plan, tailleDe, temps);
      const vus = new Set<string>();
      for (const lutin of lutins) {
        vus.add(lutin.cle);
        let pose = poses.get(lutin.cle);
        if (!pose) {
          const toile = document.createElement("canvas");
          toile.className = "village-pixels monde-lutin";
          el.appendChild(toile);
          pose = { toile, dessin: "", place: "", coupe: "" };
          poses.set(lutin.cle, pose);
        }
        const dessin = dessinDe(lutin);
        const nom = `${lutin.dessin}:${lutin.image}:${lutin.miroir ? 1 : 0}:${lutin.angle ?? 0}`;
        if (pose.dessin !== nom) {
          pose.toile.width = dessin.largeur;
          pose.toile.height = dessin.hauteur;
          pose.toile.style.width = `${dessin.largeur * cote}px`;
          pose.toile.style.height = `${dessin.hauteur * cote}px`;
          peindre(pose.toile, dessin.largeur, dessin.hauteur, dessin.cases);
          pose.dessin = nom;
        }
        const place = `translate(${Math.round(lutin.x) * cote}px, ${Math.round(lutin.y) * cote}px)`;
        if (pose.place !== place) {
          pose.toile.style.transform = place;
          pose.toile.style.zIndex = String(lutin.pied);
          pose.place = place;
        }
        // Le missile encore dans son silo : ce qui est sous la bouche ne se voit pas.
        const cache = lutin.coupe === undefined ? 0 : Math.max(0, Math.round(lutin.y) + dessin.hauteur - lutin.coupe);
        const coupe = cache > 0 ? `inset(0 0 ${cache * cote}px 0)` : "";
        if (pose.coupe !== coupe) {
          pose.toile.style.clipPath = coupe;
          pose.coupe = coupe;
        }
      }
      for (const [nom, pose] of poses) {
        if (vus.has(nom)) continue;
        pose.toile.remove();
        poses.delete(nom);
      }
    };
    montrer(horloge.temps);
    const arreter = horloge.ecouter(montrer);
    return () => {
      arreter();
      for (const pose of poses.values()) pose.toile.remove();
    };
  }, [plan, cle, cote, horloge, fige]);

  return <div ref={calque} class="monde-evenements" />;
}

/**
 * Les bêtes du village et la charrette (`betes.ts`) : chacune va et vient calmement dans son coin, comme un promeneur,
 * et s'arrête longtemps. Une petite toile chacune, repeinte quand son pas change ; celles qu'on ne voit pas ne sont pas
 * redessinées. Figé, elles restent posées là où elles sont.
 */
export function MondeBetes({ plan, mesure, camera, horloge, fige }: { plan: Plan; mesure: Mesure; camera: CameraDuMonde; horloge: Horloge; fige: boolean }) {
  const { cote } = mesure;
  const betes = useMemo(() => betesDuPlan(plan), [plan]);
  const toiles = useRef(new Map<string, HTMLCanvasElement | null>());
  const marches = useRef(new Map<string, Marcheur>());

  useEffect(() => {
    const hasard = hasardDe(4711 + plan.habitants);
    const peintes = new Map<string, string>();
    for (const bete of betes) {
      if (!marches.current.has(bete.cle)) marches.current.set(bete.cle, marcheurA(bete.zone.de + hasard() * (bete.zone.a - bete.zone.de), bete.zone.haut + hasard() * (bete.zone.bas - bete.zone.haut), hasard));
    }
    for (const nom of [...marches.current.keys()]) if (!betes.some((b) => b.cle === nom)) marches.current.delete(nom);
    const montrer = (temps: number, avance: boolean) => {
      for (const bete of betes) {
        const marche = marches.current.get(bete.cle)!;
        if (avance && temps % bete.lenteur === 0) promener(marche, bete.zone, -9999, hasard);
        const toile = toiles.current.get(bete.cle);
        if (!toile) continue;
        const taille = TAILLES_DES_BETES[bete.bete];
        if (marche.x > camera.x + camera.vue + 60 || marche.x + taille.largeur < camera.x - 60 || marche.y > camera.y + camera.vueH + 60 || marche.y + taille.hauteur < camera.y - 60) continue;
        const image = marche.but && !fige ? Math.floor(marche.pas / 2) % 2 : 0;
        const nom = `${image}:${marche.vers}:${marche.x}:${marche.y}`;
        if (peintes.get(bete.cle) === nom) continue;
        if (!peintes.get(bete.cle)?.startsWith(`${image}:`)) {
          const dessin = dessinDeLaBete(bete.bete, image, bete.variante);
          peindre(toile, dessin.largeur, dessin.hauteur, dessin.cases);
        }
        toile.style.transform = `translate(${marche.x * cote}px, ${marche.y * cote}px)${marche.vers === 1 ? "" : " scaleX(-1)"}`;
        toile.style.zIndex = String(marche.y + taille.hauteur);
        peintes.set(bete.cle, nom);
      }
    };
    montrer(horloge.temps, false);
    const arreter = [fige ? () => {} : horloge.ecouter((temps) => montrer(temps, true)), camera.ecouter(() => montrer(horloge.temps, false))];
    return () => arreter.forEach((f) => f());
  }, [betes, cote, camera, horloge, fige]);

  return (
    <>
      {betes.map((bete) => {
        const taille = TAILLES_DES_BETES[bete.bete];
        return (
          <canvas
            key={bete.cle}
            ref={(el) => {
              toiles.current.set(bete.cle, el);
            }}
            width={taille.largeur}
            height={taille.hauteur}
            class="village-pixels monde-bete"
            style={{ width: `${taille.largeur * cote}px`, height: `${taille.hauteur * cote}px` }}
          />
        );
      })}
    </>
  );
}
