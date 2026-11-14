import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Lumiere } from "../../../lib/village/lumiere";
import type { EtatDuMonde } from "../../../lib/village/monde-etat";
import { coteDeLaCase } from "../../../lib/village/monde/camera";
import { lotEnCours } from "../../../lib/village/monde/composition";
import { LIGNE, MONDE_HAUTEUR, type Plan, emplacementsDe, quartierDuLieu } from "../../../lib/village/monde/plan";
import { type FenetreDuMonde, batimentEnCours, nomDuFeu, phraseDuChantier, pointsDuFeu } from "../../../lib/village/monde/textes";
import { type Habitant, type Lieu, NOMS_DES_LIEUX, phraseDuReleve } from "../../../lib/village/vie";
import type { Parole } from "../PlaceToucher";
import type { CameraDuMonde } from "./camera-du-monde";
import { type Horloge } from "./horloge";
import { type Mesure, MondeDecor, MondeFond } from "./MondeDecor";
import { MondeHabitants } from "./MondeHabitants";

/** Le déplacement du doigt ou de la souris, en pixels, à partir duquel on glisse le monde au lieu de cliquer. */
const SEUIL_DU_GLISSEMENT = 6;
/** Le pas des flèches du clavier, en cases. */
const PAS_DES_FLECHES = 90;

/** Une étiquette posée sur le dessin : un vrai bouton, qui dit en mots ce que le dessin montre. */
interface Etiquette {
  cle: string;
  /** La colonne de son milieu et la rangée de son bas, en cases du monde. */
  x: number;
  y: number;
  ouvre: FenetreDuMonde | null;
  sorte: "chantier" | "feu" | "lieu";
  contenu: ComponentChildren;
}

/** Une zone cliquable posée sur un bâtiment : elle ouvre sa fenêtre. */
interface Zone {
  cle: string;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  ouvre: FenetreDuMonde;
  nom: string;
}

/**
 * La scène du monde du village : tout l'écran sous l'en-tête. Le fond (ciel, nuages, lointains), puis le calque du monde
 * qui suit la caméra (décor, Gaulois, étiquettes), puis ce que la page pose par-dessus (`children` : le titre, la petite
 * carte, la rangée d'icônes, les fenêtres).
 *
 * On s'y déplace en glissant (souris, doigt), à la molette, aux flèches du clavier (la scène prend le focus), et par les
 * boutons qui mènent à un lieu. Le dessin est caché aux lecteurs d'écran ; ce qu'il montre est écrit dans les étiquettes
 * (de vrais boutons, atteints par Tab : la caméra vient à eux) et dans les fenêtres.
 */
export function MondeScene({
  plan,
  etat,
  lumiere,
  date,
  lieux,
  camera,
  horloge,
  fige,
  parole,
  onToucher,
  ouvrir,
  membre,
  moiA,
  children,
}: {
  plan: Plan;
  etat: EtatDuMonde;
  lumiere: Lumiere;
  date: Date;
  lieux: Record<Lieu, Habitant[]>;
  camera: CameraDuMonde;
  horloge: Horloge;
  fige: boolean;
  parole: Parole | null;
  onToucher: (habitant: Habitant) => void;
  ouvrir: (id: FenetreDuMonde) => void;
  /** Un membre dont le village est lu : les lieux portent leur compte, et mènent à « Qui est où ». */
  membre: boolean;
  moiA?: (x: number | null) => void;
  children?: ComponentChildren;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const monde = useRef<HTMLDivElement>(null);
  const aGlisse = useRef(false);
  const [mesure, setMesure] = useState<Mesure | null>(null);

  // La taille de la scène donne celle des cases : toujours un nombre entier de pixels.
  useLayoutEffect(() => {
    const el = scene.current;
    if (!el) return;
    const mesurer = () => {
      const largeur = el.clientWidth;
      const hauteur = el.clientHeight;
      if (largeur === 0 || hauteur === 0) return;
      const cote = coteDeLaCase(hauteur, largeur);
      const suivante = { cote, colonnes: Math.ceil(largeur / cote), rangees: Math.ceil(hauteur / cote) };
      camera.regler(largeur / cote, plan.largeur);
      setMesure((avant) => (avant && avant.cote === suivante.cote && avant.colonnes === suivante.colonnes && avant.rangees === suivante.rangees ? avant : suivante));
    };
    mesurer();
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(el);
    return () => observateur?.disconnect();
  }, [camera, plan]);

  const cote = mesure?.cote ?? 2;

  // Le calque du monde suit la caméra, au pixel.
  useLayoutEffect(() => {
    const placer = () => {
      if (monde.current) monde.current.style.transform = `translate3d(${-Math.round(camera.x * cote)}px, 0, 0)`;
    };
    placer();
    return camera.ecouter(placer);
  }, [camera, cote, mesure !== null]);

  useEffect(() => {
    camera.fige = fige;
  }, [camera, fige]);

  // Glisser le monde : à la souris ou au doigt. Un simple clic, lui, va à ce qu'il touche.
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    let depart: { x: number; dernier: number; quand: number; vitesse: number; glisse: boolean; id: number } | null = null;
    const horsDuMonde = (cible: EventTarget | null): boolean => cible instanceof Element && cible.closest("[data-monde-ui]") !== null;
    const appui = (e: PointerEvent) => {
      if (e.button !== 0 || horsDuMonde(e.target)) return;
      depart = { x: e.clientX, dernier: e.clientX, quand: e.timeStamp, vitesse: 0, glisse: false, id: e.pointerId };
    };
    const mouvement = (e: PointerEvent) => {
      if (!depart || e.pointerId !== depart.id) return;
      if (!depart.glisse && Math.abs(e.clientX - depart.x) < SEUIL_DU_GLISSEMENT) return;
      if (!depart.glisse) {
        depart.glisse = true;
        el.dataset["glisse"] = "";
      }
      const dx = e.clientX - depart.dernier;
      const dt = Math.max(1, e.timeStamp - depart.quand);
      // La vitesse du geste, lissée, en cases par seconde : elle donne l'élan au lâcher.
      depart.vitesse = depart.vitesse * 0.7 + ((-dx / cote / dt) * 1000) * 0.3;
      depart.dernier = e.clientX;
      depart.quand = e.timeStamp;
      camera.tirer(-dx / cote);
    };
    const relache = (e: PointerEvent) => {
      if (!depart || e.pointerId !== depart.id) return;
      if (depart.glisse) {
        delete el.dataset["glisse"];
        camera.lacher(e.timeStamp - depart.quand < 80 ? depart.vitesse : 0);
        // Le clic qui suit le lâcher n'est pas un clic.
        aGlisse.current = true;
        window.setTimeout(() => (aGlisse.current = false), 0);
      }
      depart = null;
    };
    const clic = (e: MouseEvent) => {
      if (!aGlisse.current) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const molette = (e: WheelEvent) => {
      if (horsDuMonde(e.target) || e.ctrlKey) return;
      e.preventDefault();
      const pixels = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 32 : 1);
      camera.pousser(pixels / cote);
    };
    el.addEventListener("pointerdown", appui);
    window.addEventListener("pointermove", mouvement);
    window.addEventListener("pointerup", relache);
    window.addEventListener("pointercancel", relache);
    el.addEventListener("click", clic, true);
    el.addEventListener("wheel", molette, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", appui);
      window.removeEventListener("pointermove", mouvement);
      window.removeEventListener("pointerup", relache);
      window.removeEventListener("pointercancel", relache);
      el.removeEventListener("click", clic, true);
      el.removeEventListener("wheel", molette);
    };
  }, [camera, cote]);

  /** Les flèches du clavier, quand la scène ou une de ses étiquettes a le focus. */
  const touche = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest("[data-monde-ui]")) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowLeft") camera.pousser(-PAS_DES_FLECHES);
    else if (e.key === "ArrowRight") camera.pousser(PAS_DES_FLECHES);
    else if (e.key === "PageUp") camera.pousser(-camera.vue * 0.8);
    else if (e.key === "PageDown") camera.pousser(camera.vue * 0.8);
    else if (e.key === "Home") camera.aller(0);
    else if (e.key === "End") camera.aller(plan.largeur);
    else return;
    e.preventDefault();
  };

  // Ce que le dessin montre, en mots : le chantier, le grand feu, le nom des lieux et ceux qui s'y trouvent.
  const etiquettes = useMemo(() => {
    const liste: Etiquette[] = [];
    const lot = lotEnCours(plan, etat);
    const enCours = etat.chantier ? batimentEnCours(etat.chantier) : null;
    if (lot && enCours) {
      liste.push({
        cle: "chantier",
        x: lot.x + Math.floor(lot.largeur / 2),
        y: Math.min(lot.pied - lot.hauteur - 22, LIGNE - 60),
        ouvre: "chantier",
        sorte: "chantier",
        contenu: (
          <>
            <span class="monde-etiquette-titre">{phraseDuChantier(enCours)}</span>
            <span class="monde-jauge" aria-hidden="true">
              <i style={{ width: `${Math.max(2, Math.min(100, (enCours.poses / enCours.cout) * 100))}%` }} />
            </span>
          </>
        ),
      });
    }
    if (etat.feu) {
      const releve = phraseDuReleve(etat.releve);
      liste.push({
        cle: "feu",
        x: plan.feu.x,
        y: plan.feu.pied - 116,
        ouvre: "feu",
        sorte: "feu",
        contenu: (
          <>
            <span class="monde-etiquette-titre">{nomDuFeu(etat.feu)}</span>
            <span>{pointsDuFeu(etat.feu)}</span>
            {releve && <span class="monde-etiquette-note">{releve}</span>}
          </>
        ),
      });
    }
    const plaque = (lieu: Lieu, x: number, y: number): void => {
      const nombre = lieux[lieu].length;
      liste.push({
        cle: `lieu-${lieu}`,
        x,
        y,
        ouvre: membre ? "qui" : null,
        sorte: "lieu",
        contenu: (
          <>
            {NOMS_DES_LIEUX[lieu].nom}
            {membre && (
              <>
                <span class="sr-only"> : </span>
                {nombre > 0 ? <span class="monde-etiquette-compte">{nombre}</span> : <span class="sr-only">personne</span>}
              </>
            )}
          </>
        ),
      });
    };
    const maisons = emplacementsDe(plan, "maison");
    const taverne = emplacementsDe(plan, "taverne")[0]!;
    const reunion = emplacementsDe(plan, "reunion")[0]!;
    plaque("maisons", maisons[1]!.x + Math.floor(maisons[1]!.largeur / 2), maisons[1]!.pied - 132);
    plaque("place", plan.feu.x - 118, LIGNE - 8);
    plaque("taverne", taverne.x + Math.floor(taverne.largeur / 2), taverne.pied - 136);
    plaque("reunion", reunion.x + Math.floor(reunion.largeur / 2), reunion.pied - 136);
    plaque("bataille", quartierDuLieu(plan, "bataille").vue, LIGNE - 8);
    return liste.sort((a, b) => a.x - b.x);
  }, [plan, etat, lieux, membre]);

  const zones = useMemo(() => {
    const liste: Zone[] = [];
    emplacementsDe(plan, "maison").forEach((e, i) => liste.push({ cle: `maison-${i}`, x: e.x, y: e.pied - e.hauteur, largeur: e.largeur, hauteur: e.hauteur, ouvre: "gaulois", nom: "Mon Gaulois" }));
    for (const e of emplacementsDe(plan, "forge")) liste.push({ cle: "forge", x: e.x, y: e.pied - e.hauteur + 20, largeur: e.largeur, hauteur: e.hauteur - 20, ouvre: "forge", nom: "La forge" });
    for (const e of emplacementsDe(plan, "etal")) liste.push({ cle: "etal", x: e.x, y: e.pied - e.hauteur, largeur: e.largeur, hauteur: e.hauteur, ouvre: "marche", nom: "Le marché" });
    const lot = lotEnCours(plan, etat);
    if (lot) liste.push({ cle: "lot", x: lot.x, y: lot.pied - lot.hauteur, largeur: lot.largeur, hauteur: lot.hauteur, ouvre: "chantier", nom: "Le chantier" });
    if (etat.feu) liste.push({ cle: "grand-feu", x: plan.feu.x - 40, y: plan.feu.pied - 100, largeur: 80, hauteur: 104, ouvre: "feu", nom: "Le grand feu" });
    return liste.filter((zone) => membre || zone.ouvre !== "marche").sort((a, b) => a.x - b.x);
  }, [plan, etat, membre]);

  /** Une étiquette ou une zone atteinte au clavier : la caméra vient à elle si on ne la voit pas. */
  const venirA = (x: number) => {
    if (x < camera.x + 80 || x > camera.x + camera.vue - 80) camera.aller(x);
  };

  return (
    <div
      ref={scene}
      class="monde-scene"
      data-testid="monde"
      data-loin={cote === 1 ? "" : undefined}
      style={{ "--place-case": `${cote}px` }}
      tabIndex={0}
      role="group"
      aria-label="Le monde du village, en pixels. Flèches gauche et droite pour s'y déplacer ; les fenêtres le disent en texte."
      onKeyDown={touche}
    >
      {mesure && (
        <div class="monde-dessin" aria-hidden="true">
          <MondeFond plan={plan} lumiere={lumiere} date={date} mesure={mesure} camera={camera} />
        </div>
      )}
      {mesure && (
        <div ref={monde} class="monde-monde" style={{ width: `${plan.largeur * cote}px`, height: `${MONDE_HAUTEUR * cote}px` }}>
          <div class="monde-dessin" aria-hidden="true">
            <MondeDecor plan={plan} etat={etat} lumiere={lumiere} mesure={mesure} camera={camera} horloge={horloge} fige={fige} />
            <MondeHabitants plan={plan} lieux={lieux} mesure={mesure} camera={camera} horloge={horloge} fige={fige} parole={parole} onToucher={onToucher} aGlisse={aGlisse} moiA={moiA} />
          </div>
          {zones.map((zone) => (
            <button
              key={zone.cle}
              type="button"
              class="monde-zone"
              data-testid={`monde-zone-${zone.cle}`}
              aria-label={`${zone.nom} : ouvrir la fenêtre`}
              title={zone.nom}
              style={{ left: `${zone.x * cote}px`, top: `${zone.y * cote}px`, width: `${zone.largeur * cote}px`, height: `${zone.hauteur * cote}px` }}
              onFocus={() => venirA(zone.x + zone.largeur / 2)}
              onClick={() => ouvrir(zone.ouvre)}
            />
          ))}
          {etiquettes.map((etiquette) =>
            etiquette.ouvre ? (
              <button
                key={etiquette.cle}
                type="button"
                class="monde-etiquette"
                data-sorte={etiquette.sorte}
                data-testid={`monde-etiquette-${etiquette.cle}`}
                style={{ left: `${etiquette.x * cote}px`, top: `${etiquette.y * cote}px` }}
                onFocus={() => venirA(etiquette.x)}
                onClick={() => ouvrir(etiquette.ouvre!)}
              >
                {etiquette.contenu}
              </button>
            ) : (
              <p key={etiquette.cle} class="monde-etiquette" data-sorte={etiquette.sorte} data-testid={`monde-etiquette-${etiquette.cle}`} style={{ left: `${etiquette.x * cote}px`, top: `${etiquette.y * cote}px` }}>
                {etiquette.contenu}
              </p>
            ),
          )}
        </div>
      )}
      {children}
    </div>
  );
}
