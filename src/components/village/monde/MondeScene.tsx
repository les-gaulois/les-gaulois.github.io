import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Lumiere } from "../../../lib/village/lumiere";
import type { EtatDuMonde } from "../../../lib/village/monde-etat";
import { DUREE_DE_L_APPROCHE, NIVEAUX, niveauDeDepart, niveauVoisin } from "../../../lib/village/monde/camera";
import { lotEnCours } from "../../../lib/village/monde/composition";
import { LIGNE, type Plan, emplacementsDe, hautDansLeMonde, quartierDuLieu } from "../../../lib/village/monde/plan";
import { avancementDuBatiment, batimentEnCours } from "../../../lib/village/chantier";
import { type FenetreDuMonde, nomDuFeu, phraseDuChantier, pointsDuFeu } from "../../../lib/village/monde/textes";
import { type Habitant, type Lieu, NOMS_DES_LIEUX, phraseDuReleve } from "../../../lib/village/vie";
import type { Parole } from "../PlaceToucher";
import type { CameraDuMonde } from "./camera-du-monde";
import { type Horloge } from "./horloge";
import { type Mesure, MondeDecor, MondeFond } from "./MondeDecor";
import { MondeHabitants } from "./MondeHabitants";
import { MondeBetes, MondeEvenements } from "./MondeVie";

/** Le déplacement du doigt ou de la souris, en pixels, à partir duquel on glisse le monde au lieu de cliquer. */
const SEUIL_DU_GLISSEMENT = 6;
/** Le pas des flèches du clavier, en pixels de l'écran. */
const PAS_DES_FLECHES = 160;
/** La largeur de la rangée d'icônes, à gauche d'un écran large, en pixels : une bulle ne passe pas dessous. */
const RANGEE_D_ICONES = 104;

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
  moiA?: (point: { x: number; y: number } | null) => void;
  children?: ComponentChildren;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const monde = useRef<HTMLDivElement>(null);
  const aGlisse = useRef(false);
  const optique = useRef<HTMLDivElement>(null);
  const [mesure, setMesure] = useState<Mesure | null>(null);
  // Le niveau d'approche : le côté d'une case, en pixels entiers. `null` tant que la scène n'est pas mesurée.
  const [niveau, setNiveau] = useState<number | null>(null);
  const [large, setLarge] = useState(false);

  // La taille de la scène et le niveau d'approche donnent la vue : toujours un nombre entier de pixels par case.
  useLayoutEffect(() => {
    const el = scene.current;
    if (!el) return;
    const mesurer = () => {
      const largeur = el.clientWidth;
      const hauteur = el.clientHeight;
      if (largeur === 0 || hauteur === 0) return;
      const cote = niveau ?? niveauDeDepart(hauteur);
      if (niveau === null) setNiveau(cote);
      const suivante = { cote, colonnes: Math.ceil(largeur / cote), rangees: Math.ceil(hauteur / cote) };
      camera.regler(largeur / cote, hauteur / cote, plan.largeur, plan.hauteur);
      setLarge(largeur >= 768);
      setMesure((avant) => (avant && avant.cote === suivante.cote && avant.colonnes === suivante.colonnes && avant.rangees === suivante.rangees ? avant : suivante));
    };
    mesurer();
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(el);
    return () => observateur?.disconnect();
  }, [camera, plan, niveau]);

  const cote = mesure?.cote ?? 1;

  // Le calque du monde suit la caméra, au pixel.
  useLayoutEffect(() => {
    const placer = () => {
      if (monde.current) monde.current.style.transform = `translate3d(${-Math.round(camera.x * cote)}px, ${-Math.round(camera.y * cote)}px, 0)`;
    };
    placer();
    return camera.ecouter(placer);
  }, [camera, cote, mesure !== null]);

  useEffect(() => {
    camera.fige = fige;
  }, [camera, fige]);

  /**
   * Voir de plus près ou de plus loin, d'un niveau. Les cases restent entières : le passage se fait en agrandissant ou en
   * rétrécissant doucement tout le dessin (une seconde), puis le monde est redessiné net au nouveau niveau. Vers le loin,
   * le monde est d'abord redessiné au nouveau niveau, agrandi pour paraître inchangé : rien ne manque sur les bords
   * pendant qu'il rétrécit. Figé, le niveau change d'un coup.
   */
  const passage = useRef<{ vers: number; de: number } | null>(null);
  const approcher = (sens: 1 | -1) => {
    if (niveau === null || passage.current) return;
    const vers = niveauVoisin(niveau, sens);
    const el = optique.current;
    if (vers === niveau) return;
    if (fige || !el) {
      setNiveau(vers);
      return;
    }
    passage.current = { vers, de: niveau };
    if (vers > niveau) {
      el.style.transition = `transform ${DUREE_DE_L_APPROCHE}ms cubic-bezier(0.45, 0, 0.2, 1)`;
      el.style.transform = `scale(${vers / niveau})`;
      window.setTimeout(() => setNiveau(vers), DUREE_DE_L_APPROCHE);
    } else setNiveau(vers);
  };
  useLayoutEffect(() => {
    const el = optique.current;
    const enCours = passage.current;
    if (!el || !enCours || enCours.vers !== mesure?.cote) return;
    if (enCours.vers > enCours.de) {
      // Plus près : le dessin agrandi laisse la place au monde net, au même instant.
      el.style.transition = "none";
      el.style.transform = "";
      passage.current = null;
      return;
    }
    el.style.transition = "none";
    el.style.transform = `scale(${enCours.de / enCours.vers})`;
    void el.offsetWidth;
    el.style.transition = `transform ${DUREE_DE_L_APPROCHE}ms cubic-bezier(0.45, 0, 0.2, 1)`;
    el.style.transform = "scale(1)";
    const fin = window.setTimeout(() => {
      el.style.transition = "none";
      el.style.transform = "";
      passage.current = null;
    }, DUREE_DE_L_APPROCHE);
    return () => window.clearTimeout(fin);
  }, [mesure?.cote]);
  const approche = useRef(approcher);
  approche.current = approcher;

  // Glisser le monde : à la souris ou au doigt, dans les deux sens. Un simple clic, lui, va à ce qu'il touche. Deux doigts
  // qui s'écartent ou se rapprochent : un niveau de plus près ou de plus loin. La molette monte et descend ; avec Ctrl,
  // elle approche ou éloigne.
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    let depart: { x: number; y: number; dx: number; dy: number; quand: number; vx: number; vy: number; glisse: boolean; id: number } | null = null;
    const doigts = new Map<number, { x: number; y: number }>();
    let ecart = 0;
    let derniereMolette = 0;
    const horsDuMonde = (cible: EventTarget | null): boolean => cible instanceof Element && cible.closest("[data-monde-ui]") !== null;
    const ecartDesDoigts = (): number => {
      const [a, b] = [...doigts.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const appui = (e: PointerEvent) => {
      if (e.button !== 0 || horsDuMonde(e.target)) return;
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size === 2) {
        ecart = ecartDesDoigts();
        depart = null;
        return;
      }
      depart = { x: e.clientX, y: e.clientY, dx: e.clientX, dy: e.clientY, quand: e.timeStamp, vx: 0, vy: 0, glisse: false, id: e.pointerId };
    };
    const mouvement = (e: PointerEvent) => {
      if (doigts.has(e.pointerId)) doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size === 2 && ecart > 0) {
        const maintenant = ecartDesDoigts();
        if (maintenant > ecart * 1.35 || maintenant < ecart * 0.74) {
          approche.current(maintenant > ecart ? 1 : -1);
          ecart = maintenant;
          aGlisse.current = true;
        }
        return;
      }
      if (!depart || e.pointerId !== depart.id) return;
      if (!depart.glisse && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) < SEUIL_DU_GLISSEMENT) return;
      if (!depart.glisse) {
        depart.glisse = true;
        el.dataset["glisse"] = "";
      }
      const dx = e.clientX - depart.dx;
      const dy = e.clientY - depart.dy;
      const dt = Math.max(1, e.timeStamp - depart.quand);
      // La vitesse du geste, lissée, en cases par seconde : elle donne l'élan au lâcher.
      depart.vx = depart.vx * 0.7 + (-dx / cote / dt) * 1000 * 0.3;
      depart.vy = depart.vy * 0.7 + (-dy / cote / dt) * 1000 * 0.3;
      depart.dx = e.clientX;
      depart.dy = e.clientY;
      depart.quand = e.timeStamp;
      camera.tirer(-dx / cote, -dy / cote);
    };
    const relache = (e: PointerEvent) => {
      doigts.delete(e.pointerId);
      if (doigts.size < 2) ecart = 0;
      if (aGlisse.current && doigts.size === 0) window.setTimeout(() => (aGlisse.current = false), 0);
      if (!depart || e.pointerId !== depart.id) return;
      if (depart.glisse) {
        delete el.dataset["glisse"];
        const vif = e.timeStamp - depart.quand < 80;
        camera.lacher(vif ? depart.vx : 0, vif ? depart.vy : 0);
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
      if (horsDuMonde(e.target)) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Un cran à la fois, et pas plus d'un toutes les demi-secondes : un pavé tactile en envoie des dizaines.
        if (e.timeStamp - derniereMolette > 500 && Math.abs(e.deltaY) > 0) {
          derniereMolette = e.timeStamp;
          approche.current(e.deltaY < 0 ? 1 : -1);
        }
        return;
      }
      const facteur = e.deltaMode === 1 ? 32 : 1;
      // La molette monte et descend ; avec Maj, ou quand le monde tient dans la hauteur de l'écran, elle va de côté.
      const deCote = e.shiftKey || camera.hauteur <= camera.vueH;
      const dx = (deCote && e.deltaX === 0 ? e.deltaY : e.deltaX) * facteur;
      const dy = deCote && e.deltaX === 0 ? 0 : e.deltaY * facteur;
      camera.pousser(dx / cote, dy / cote);
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
    const pas = PAS_DES_FLECHES / cote;
    if (e.key === "ArrowLeft") camera.pousser(-pas);
    else if (e.key === "ArrowRight") camera.pousser(pas);
    else if (e.key === "ArrowUp") camera.pousser(0, -pas);
    else if (e.key === "ArrowDown") camera.pousser(0, pas);
    else if (e.key === "PageUp") camera.pousser(-camera.vue * 0.8);
    else if (e.key === "PageDown") camera.pousser(camera.vue * 0.8);
    else if (e.key === "Home") camera.aller(0);
    else if (e.key === "End") camera.aller(plan.largeur);
    else if (e.key === "+" || e.key === "=") approcher(1);
    else if (e.key === "-") approcher(-1);
    else return;
    e.preventDefault();
  };

  // Ce que le dessin montre, en mots : le chantier, le grand feu, le nom des lieux et ceux qui s'y trouvent.
  const etiquettes = useMemo(() => {
    const liste: Etiquette[] = [];
    const lot = lotEnCours(plan, etat);
    const enCours = batimentEnCours(etat.chantier);
    const releve = phraseDuReleve(etat.releve);
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
              <i style={{ width: `${Math.max(2, avancementDuBatiment(enCours) * 100)}%` }} />
            </span>
            {releve && <span class="monde-etiquette-note">{releve}</span>}
          </>
        ),
      });
    }
    // Sans données (ce n'est pas zéro) : l'écran le dit là où le chantier et le feu se montreraient.
    if (!etat.chantier) {
      liste.push({
        cle: "chantier",
        x: plan.feu.x + 160,
        y: LIGNE - 70,
        ouvre: "chantier",
        sorte: "chantier",
        contenu: (
          <>
            <span class="monde-etiquette-titre">Le chantier</span>
            <span>Pas de données</span>
            {releve && <span class="monde-etiquette-note">{releve}</span>}
          </>
        ),
      });
    }
    if (!etat.feu) {
      liste.push({
        cle: "feu",
        x: plan.feu.x,
        y: plan.feu.pied - 40,
        ouvre: "feu",
        sorte: "feu",
        contenu: (
          <>
            <span class="monde-etiquette-titre">Le grand feu</span>
            <span>Pas de données</span>
            {releve && <span class="monde-etiquette-note">{releve}</span>}
          </>
        ),
      });
    }
    if (etat.feu) {
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
    plaque("place", plan.feu.x - 118, LIGNE - 30);
    plaque("taverne", taverne.x + Math.floor(taverne.largeur / 2), taverne.pied - 136);
    plaque("reunion", reunion.x + Math.floor(reunion.largeur / 2), reunion.pied - 136);
    plaque("bataille", quartierDuLieu(plan, "bataille").vue, LIGNE - 8);
    return liste.sort((a, b) => a.x - b.x);
  }, [plan, etat, lieux, membre]);

  const zones = useMemo(() => {
    const liste: Zone[] = [];
    // Les trois maisons de la grand-rue ouvrent « Mon Gaulois » ; celles des terrasses ne sont pas des boutons (il y en a jusqu'à 250).
    emplacementsDe(plan, "maison")
      .filter((e) => e.dy === plan.dy0)
      .forEach((e, i) => liste.push({ cle: `maison-${i}`, x: e.x, y: e.pied - e.hauteur, largeur: e.largeur, hauteur: e.hauteur, ouvre: "gaulois", nom: "Mon Gaulois" }));
    for (const e of emplacementsDe(plan, "forge")) liste.push({ cle: "forge", x: e.x, y: e.pied - e.hauteur + 20, largeur: e.largeur, hauteur: e.hauteur - 20, ouvre: "forge", nom: "La forge" });
    for (const e of emplacementsDe(plan, "etal")) liste.push({ cle: "etal", x: e.x, y: e.pied - e.hauteur, largeur: e.largeur, hauteur: e.hauteur, ouvre: "marche", nom: "Le marché" });
    const lot = lotEnCours(plan, etat);
    if (lot) liste.push({ cle: "lot", x: lot.x, y: lot.pied - lot.hauteur, largeur: lot.largeur, hauteur: lot.hauteur, ouvre: "chantier", nom: "Le chantier" });
    if (etat.feu) liste.push({ cle: "grand-feu", x: plan.feu.x - 40, y: plan.feu.pied - 100, largeur: 80, hauteur: 104, ouvre: "feu", nom: "Le grand feu" });
    return liste.filter((zone) => membre || zone.ouvre !== "marche").sort((a, b) => a.x - b.x);
  }, [plan, etat, membre]);

  /** Une étiquette ou une zone atteinte au clavier : la caméra vient à elle si on ne la voit pas. */
  const venirA = (x: number, y: number) => {
    const marge = 80 / cote;
    if (x < camera.x + marge || x > camera.x + camera.vue - marge || y < camera.y + marge || y > camera.y + camera.vueH - marge) camera.aller(x, y);
  };
  // Les étiquettes et les zones sont toutes sur la grand-rue : leurs rangées se comptent dans son repère.
  const dy = plan.dy0;
  void hautDansLeMonde;

  return (
    <div
      ref={scene}
      class="monde-scene"
      data-testid="monde"
      data-niveau={cote}
      style={{ "--place-case": `${cote}px` }}
      tabIndex={0}
      role="group"
      aria-label="Le monde du village, en pixels. Les flèches pour s'y déplacer, plus et moins pour s'approcher ou s'éloigner ; les fenêtres le disent en texte."
      onKeyDown={touche}
    >
      <div ref={optique} class="monde-optique">
        {mesure && (
          <div class="monde-dessin" aria-hidden="true">
            <MondeFond plan={plan} lumiere={lumiere} date={date} mesure={mesure} camera={camera} />
          </div>
        )}
        {mesure && (
          <div ref={monde} class="monde-monde" style={{ width: `${plan.largeur * cote}px`, height: `${plan.hauteur * cote}px` }}>
            <div class="monde-dessin" aria-hidden="true">
              <MondeDecor plan={plan} etat={etat} lumiere={lumiere} mesure={mesure} camera={camera} horloge={horloge} fige={fige} />
              <MondeBetes plan={plan} mesure={mesure} camera={camera} horloge={horloge} fige={fige} />
              <MondeEvenements plan={plan} lumiere={lumiere} mesure={mesure} horloge={horloge} fige={fige} />
              <MondeHabitants plan={plan} lieux={lieux} mesure={mesure} camera={camera} horloge={horloge} fige={fige} parole={parole} onToucher={onToucher} aGlisse={aGlisse} moiA={moiA} margeGauche={large ? RANGEE_D_ICONES : 0} />
            </div>
            {zones.map((zone) => (
              <button
                key={zone.cle}
                type="button"
                class="monde-zone"
                data-testid={`monde-zone-${zone.cle}`}
                aria-label={`${zone.nom} : ouvrir la fenêtre`}
                title={zone.nom}
                style={{ left: `${zone.x * cote}px`, top: `${(zone.y + dy) * cote}px`, width: `${zone.largeur * cote}px`, height: `${zone.hauteur * cote}px` }}
                onFocus={() => venirA(zone.x + zone.largeur / 2, zone.y + dy + zone.hauteur / 2)}
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
                  style={{ left: `${etiquette.x * cote}px`, top: `${(etiquette.y + dy) * cote}px` }}
                  onFocus={() => venirA(etiquette.x, etiquette.y + dy)}
                  onClick={() => ouvrir(etiquette.ouvre!)}
                >
                  {etiquette.contenu}
                </button>
              ) : (
                <p key={etiquette.cle} class="monde-etiquette" data-sorte={etiquette.sorte} data-testid={`monde-etiquette-${etiquette.cle}`} style={{ left: `${etiquette.x * cote}px`, top: `${(etiquette.y + dy) * cote}px` }}>
                  {etiquette.contenu}
                </p>
              ),
            )}
          </div>
        )}
      </div>
      <div class="monde-approche" role="group" aria-label="S'approcher ou s'éloigner" data-monde-ui>
        <button type="button" class="monde-approche-bouton" aria-label="Voir de plus près" title="Voir de plus près" data-testid="monde-plus-pres" disabled={cote >= NIVEAUX[NIVEAUX.length - 1]!} onClick={() => approcher(1)}>
          <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M5 1h2v4h4v2H7v4H5V7H1V5h4z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" class="monde-approche-bouton" aria-label="Voir de plus loin" title="Voir de plus loin" data-testid="monde-plus-loin" disabled={cote <= NIVEAUX[0]} onClick={() => approcher(-1)}>
          <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M1 5h10v2H1z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}
