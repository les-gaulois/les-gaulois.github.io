import type { JSX, RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { motionAllowed } from "../../lib/fx/motion";
import { dansLeCadre, gesteDeLAppui, sensDeLaPrise, type SensDeLaPrise } from "../../lib/jeu/geste";
import { jouer } from "../../lib/jeu/sons";

/**
 * L'essayage du vestiaire de « Mon Gaulois » (21 novembre 2026, maquette validée par le pilote) : on attrape une carte
 * d'objet et on la lâche sur le Gaulois. Elle vole vers son emplacement, le Gaulois change de tenue (un essai, jusqu'à
 * l'enregistrement, comme avant), saute, et le vestiaire fait son petit bruit. Un clic, Entrée ou Espace sur la carte font
 * la même chose, sans rien glisser : le clavier et le doigt qui tape ont tout.
 *
 * Rien n'est décidé ici. Les cartes restent les cases du vestiaire (`Case` de Cases.tsx), avec leur propre clic : la prise
 * se fait sur le panneau qui les porte (délégation), et la carte lâchée sur le Gaulois reçoit, à l'arrivée, le même clic
 * qu'un visiteur aurait fait. Le Gaulois qui saute, c'est `ApercuGaulois` : sa tenue a changé.
 *
 * Au doigt, défiler la rangée ne prend jamais une carte : le geste suit le sens que la feuille de style laisse défiler à la
 * carte (`touch-action`, décision dans `src/lib/jeu/geste.ts`). Une rangée qui défile de côté (`pan-x`) ne prend une carte
 * que si le doigt part vers le haut ou le bas ; une grille qui défile avec la page (`pan-y`), que s'il part de côté. La
 * souris prend dans tous les sens, après quelques pixels : un clic qui tremble reste un clic.
 *
 * Le bouton pause du site et « réduire les animations » : la carte ne vole plus, le changement se fait d'un coup. La carte
 * suit toujours le doigt ou la souris qui la tient : c'est le visiteur qui la bouge.
 */

/** Le vol vers l'emplacement, et le retour d'une carte lâchée à côté, en millisecondes. */
const VOL = 380;
const RETOUR = 260;
/** Après une prise, le clic qui suit le relâché n'est pas un clic : il est ignoré pendant ce temps. */
const APRES_PRISE = 400;

interface Prise {
  pointeur: number;
  x: number;
  y: number;
  carte: HTMLButtonElement;
  /** Le sens qui prend la carte au doigt : celui où elle ne défile pas (`src/lib/jeu/geste.ts`). */
  sens: SensDeLaPrise;
  /** La copie de la carte qui suit le pointeur, une fois la prise faite. */
  fantome: HTMLElement | null;
  dx: number;
  dy: number;
}

/** L'emplacement d'une cible autour du Gaulois : l'onglet du vestiaire qui porte son nom. */
export const emplacementDe = (cible: string): HTMLElement | null => document.getElementById(`vestiaire-rayon-${cible}`);

/** Une carte qu'on glisse : la carte d'un cosmétique (CarteDeCosmetique.tsx), ou une case d'avant (un trait du visage). */
const CARTE_QUI_SE_GLISSE = "button.cc-carte, button.case";

/** La carte sous un appui : une case du panneau, qui marche. */
function carteSous(cible: EventTarget | null, panneau: HTMLElement | null): HTMLButtonElement | null {
  const carte = cible instanceof Element ? cible.closest<HTMLButtonElement>(CARTE_QUI_SE_GLISSE) : null;
  return carte && panneau?.contains(carte) && !carte.disabled ? carte : null;
}

/**
 * La copie de la carte qui vole : posée sur la page à la place exacte de la carte, dans une enveloppe qui porte la classe du
 * vestiaire (les règles des cartes s'y appliquent) et qu'aucun lecteur d'écran ni aucune touche n'atteint. Les dessins
 * des toiles sont recopiés : une toile copiée naît vide.
 */
function fantomeDe(carte: HTMLElement): HTMLElement {
  const r = carte.getBoundingClientRect();
  const enveloppe = document.createElement("div");
  enveloppe.className = "vestiaire-jeu vj-fantome";
  enveloppe.setAttribute("aria-hidden", "true");
  enveloppe.inert = true;
  const copie = carte.cloneNode(true) as HTMLElement;
  for (const el of [copie, ...copie.querySelectorAll<HTMLElement>("[id], [data-testid]")]) {
    el.removeAttribute("id");
    el.removeAttribute("data-testid");
  }
  const sources = carte.querySelectorAll("canvas");
  copie.querySelectorAll("canvas").forEach((toile, i) => {
    const source = sources[i];
    if (source && source.width > 0 && source.height > 0) toile.getContext("2d")?.drawImage(source, 0, 0);
  });
  copie.style.width = `${r.width}px`;
  copie.style.height = `${r.height}px`;
  copie.style.margin = "0";
  enveloppe.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:70;pointer-events:none`;
  enveloppe.append(copie);
  document.body.append(enveloppe);
  return enveloppe;
}

/** Le centre d'un élément, dans la fenêtre. */
function centre(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Le centre de la carte tenue est-il au-dessus de la zone du Gaulois ? */
function dansLaZone(fantome: HTMLElement, zone: HTMLElement | null): boolean {
  return zone !== null && dansLeCadre(centre(fantome), zone.getBoundingClientRect());
}

/**
 * La carte est-elle déjà sur le Gaulois, à l'écran ? Celle de l'essai (`essayee`) ; ou celle qui porte la coche de la tenue
 * enregistrée, tant qu'aucune autre carte de son groupe n'est en essai. Pendant un essai, la carte cochée remet la tenue
 * enregistrée : elle vole comme une autre (`aria-pressed` ne suffit pas, il vaut pour les deux).
 */
function dejaSurLeGaulois(carte: HTMLElement): boolean {
  const etat = carte.getAttribute("data-etat");
  if (etat === "essayee") return true;
  if (etat !== "portee") return false;
  return !carte.closest('[role="group"]')?.querySelector(':is(button.cc-carte, button.case)[data-etat="essayee"]');
}

/** Fait jouer une classe d'animation une fois : retirée à la fin, ou au plus tard après `duree`. */
function jouerUneFois(el: HTMLElement | null, classe: string, duree: number): void {
  if (!el || !motionAllowed()) return;
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
  const fini = (): void => el.classList.remove(classe);
  el.addEventListener("animationend", fini, { once: true });
  window.setTimeout(fini, duree);
}

/**
 * L'essayage d'un panneau de cartes. `panneau` : l'élément qui porte les cartes (ses gestionnaires sont ceux que rend la
 * fonction) ; `zone` : la scène du Gaulois, où lâcher ; `cible` : l'emplacement où vont les cartes du panneau ouvert
 * (`tete`, `corps`, `familier`…), ou `null` : rien ne se glisse, le clic reste un clic. `annoncer` : la phrase pour les
 * lecteurs d'écran, quand une carte arrive sur le Gaulois.
 */
export function useEssayage({ panneau, zone, cible, annoncer }: { panneau: RefObject<HTMLElement>; zone: RefObject<HTMLElement>; cible: string | null; annoncer: (texte: string) => void }) {
  const prise = useRef<Prise | null>(null);
  // Le clic qu'on rejoue sur la carte à son arrivée : il passe sans être retenu.
  const laisser = useRef(false);
  const ignorerJusqua = useRef(0);
  const cibleVue = useRef(cible);
  cibleVue.current = cible;
  const dire = useRef(annoncer);
  dire.current = annoncer;
  // Les cartes en vol : un double clic ou Entrée tenue ne les fait pas repartir.
  const enVol = useRef(new WeakSet<HTMLElement>()).current;

  /** Ce que la carte dit d'elle : son nom, écrit dans la case. */
  const nomDe = (carte: HTMLElement): string => carte.querySelector(".cc-nom, .case-nom")?.textContent?.trim() ?? "";

  /** La carte arrive : le clic de la carte, le bruit, l'emplacement qui la reçoit, la phrase. */
  const arriver = (carte: HTMLButtonElement, vers: HTMLElement | null, dejaPortee: boolean): void => {
    laisser.current = true;
    try {
      carte.click();
    } finally {
      laisser.current = false;
    }
    if (dejaPortee) return;
    jouer("enfile");
    jouer("enfile2", 0.09);
    jouerUneFois(vers, "vj-recoit", 700);
    // Le familier se choisit au serveur, et son choix s'annonce déjà (`MonFamilier`) : une seule phrase.
    const nom = nomDe(carte);
    if (nom && cibleVue.current !== "familier") dire.current(`${nom} : sur votre Gaulois.`);
  };

  /** Fait voler la carte (ou sa copie déjà tenue) jusqu'à l'emplacement, puis la fait arriver. */
  const poser = (carte: HTMLButtonElement, tenue: { fantome: HTMLElement; dx: number; dy: number } | null): void => {
    const vers = cibleVue.current ? emplacementDe(cibleVue.current) : null;
    const dejaPortee = dejaSurLeGaulois(carte);
    if (!vers || !motionAllowed() || !carte.isConnected) {
      tenue?.fantome.remove();
      arriver(carte, vers, dejaPortee);
      return;
    }
    const fantome = tenue?.fantome ?? fantomeDe(carte);
    const depart = fantome.style.transform || "none";
    const a = centre(fantome);
    const b = centre(vers);
    const dx = (tenue?.dx ?? 0) + b.x - a.x;
    const dy = (tenue?.dy ?? 0) + b.y - a.y;
    const vol = fantome.animate([{ transform: depart }, { transform: `translate(${dx}px, ${dy}px) scale(0.32)`, opacity: 0.55 }], { duration: VOL, easing: "cubic-bezier(.4,0,.5,1)", fill: "forwards" });
    enVol.add(carte);
    let fini = false;
    const finir = (): void => {
      if (fini) return;
      fini = true;
      enVol.delete(carte);
      fantome.remove();
      arriver(carte, vers, dejaPortee);
    };
    vol.onfinish = finir;
    vol.oncancel = finir;
  };

  /** Une carte lâchée à côté du Gaulois revient à sa place. */
  const rendre = (fantome: HTMLElement): void => {
    jouer("flap");
    if (!motionAllowed()) {
      fantome.remove();
      return;
    }
    const retour = fantome.animate([{ transform: fantome.style.transform || "none" }, { transform: "none" }], { duration: RETOUR, easing: "cubic-bezier(.3,1.4,.5,1)" });
    retour.onfinish = () => fantome.remove();
    retour.oncancel = () => fantome.remove();
  };

  /** La prise se défait : la carte se rallume, la scène et l'emplacement ne sont plus désignés. */
  const lacher = (p: Prise): void => {
    prise.current = null;
    p.carte.removeAttribute("data-prise");
    zone.current?.removeAttribute("data-attente");
    zone.current?.removeAttribute("data-survol");
    if (cibleVue.current) emplacementDe(cibleVue.current)?.removeAttribute("data-cible");
    window.removeEventListener("keydown", ecouteEchap);
  };

  // Un appui relâché hors du panneau avant d'avoir pris la carte (la souris est sortie avant les quelques pixels, la fenêtre a
  // perdu la main) : le relâché n'arrive qu'à la fenêtre. Elle défait alors l'appui, qui sinon resterait en attente et
  // prendrait la carte au prochain passage de la souris. Elle écoute après le panneau (sans capture) : un relâché que le
  // panneau a reçu y est déjà traité.
  const finirLAppui = useRef<(e: PointerEvent) => void>(() => undefined);
  const ecouteFin = useRef((e: PointerEvent): void => finirLAppui.current(e)).current;
  finirLAppui.current = (e: PointerEvent): void => {
    const p = prise.current;
    if (p && e.pointerId === p.pointeur) {
      if (p.fantome) {
        const fantome = p.fantome;
        lacher(p);
        rendre(fantome);
      } else prise.current = null;
    }
    window.removeEventListener("pointerup", ecouteFin);
    window.removeEventListener("pointercancel", ecouteFin);
  };

  // Échap pendant une prise : la carte revient, rien ne change. L'écouteur posé sur la fenêtre reste le même d'un dessin à
  // l'autre (`ecouteEchap`), pour pouvoir être retiré.
  const echapper = useRef<(e: KeyboardEvent) => void>(() => undefined);
  const ecouteEchap = useRef((e: KeyboardEvent): void => echapper.current(e)).current;
  echapper.current = (e: KeyboardEvent): void => {
    const p = prise.current;
    if (e.key !== "Escape" || !p?.fantome) return;
    e.preventDefault();
    const fantome = p.fantome;
    try {
      p.carte.releasePointerCapture(p.pointeur);
    } catch {
      // Déjà relâchée.
    }
    lacher(p);
    ignorerJusqua.current = performance.now() + APRES_PRISE;
    rendre(fantome);
  };

  // Le vestiaire se ferme pendant une prise : la copie qui suivait le pointeur s'en va avec lui.
  useEffect(
    () => () => {
      const p = prise.current;
      if (p) {
        p.fantome?.remove();
        lacher(p);
      }
      window.removeEventListener("pointerup", ecouteFin);
      window.removeEventListener("pointercancel", ecouteFin);
    },
    [],
  );

  const gestionnaires: Pick<JSX.HTMLAttributes<HTMLElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onClickCapture"> = {
    onPointerDown: (e) => {
      // Une carte déjà tenue reste tenue ; un appui resté en attente sans prise est remplacé par le nouveau.
      if (e.button !== 0 || !cibleVue.current || prise.current?.fantome) return;
      // Avec une touche tenue, la souris garde ses gestes à elle (sélection, menu du navigateur).
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const carte = carteSous(e.target, panneau.current);
      if (!carte || enVol.has(carte)) {
        prise.current = null;
        return;
      }
      prise.current = { pointeur: e.pointerId, x: e.clientX, y: e.clientY, carte, sens: sensDeLaPrise(e.pointerType, getComputedStyle(carte).touchAction), fantome: null, dx: 0, dy: 0 };
      window.addEventListener("pointerup", ecouteFin);
      window.addEventListener("pointercancel", ecouteFin);
    },
    onPointerMove: (e) => {
      const p = prise.current;
      if (!p || e.pointerId !== p.pointeur) return;
      // La souris revient sans bouton enfoncé : son appui s'est fini ailleurs, ce n'est pas une prise.
      if (!p.fantome && e.pointerType === "mouse" && e.buttons === 0) {
        prise.current = null;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.fantome) {
        const geste = gesteDeLAppui(dx, dy, p.sens);
        if (geste === "attendre") return;
        // Le doigt défile la rangée (ou la page) : ce n'est pas une prise.
        if (geste === "defiler") {
          prise.current = null;
          return;
        }
        try {
          p.carte.setPointerCapture(p.pointeur);
        } catch {
          // Le pointeur est déjà parti : la prise se fait quand même, sans capture.
        }
        p.fantome = fantomeDe(p.carte);
        p.carte.setAttribute("data-prise", "");
        zone.current?.setAttribute("data-attente", "");
        if (cibleVue.current) emplacementDe(cibleVue.current)?.setAttribute("data-cible", "");
        window.addEventListener("keydown", ecouteEchap);
      }
      e.preventDefault();
      p.dx = dx;
      p.dy = dy;
      const penche = motionAllowed() ? Math.max(-12, Math.min(12, e.movementX * 1.2)) : 0;
      p.fantome.style.transform = `translate(${dx}px, ${dy}px) rotate(${penche}deg) scale(1.06)`;
      if (dansLaZone(p.fantome, zone.current)) zone.current?.setAttribute("data-survol", "");
      else zone.current?.removeAttribute("data-survol");
    },
    onPointerUp: (e) => {
      const p = prise.current;
      if (!p || e.pointerId !== p.pointeur) return;
      const fantome = p.fantome;
      if (!fantome) {
        // Un simple appui : le clic qui suit fait le reste.
        prise.current = null;
        return;
      }
      const surLeGaulois = dansLaZone(fantome, zone.current);
      lacher(p);
      ignorerJusqua.current = performance.now() + APRES_PRISE;
      if (surLeGaulois) poser(p.carte, { fantome, dx: p.dx, dy: p.dy });
      else rendre(fantome);
    },
    onPointerCancel: (e) => {
      const p = prise.current;
      if (!p || e.pointerId !== p.pointeur) return;
      lacher(p);
      if (p.fantome) rendre(p.fantome);
    },
    onLostPointerCapture: (e) => {
      const p = prise.current;
      // Au doigt, le navigateur capture d'abord le pointeur sur ce qui est sous le doigt (l'image de la carte) : quand la
      // prise le reprend pour la carte entière, cette première capture se perd. Seule compte la perte de la nôtre.
      if (!p?.fantome || e.pointerId !== p.pointeur || e.target !== p.carte) return;
      // La capture perdue sans relâché (fenêtre qui perd la main) : la carte revient.
      const fantome = p.fantome;
      lacher(p);
      ignorerJusqua.current = performance.now() + APRES_PRISE;
      rendre(fantome);
    },
    onClickCapture: (e) => {
      if (laisser.current) return;
      if (performance.now() < ignorerJusqua.current) {
        if (carteSous(e.target, panneau.current)) {
          e.stopPropagation();
          e.preventDefault();
        }
        return;
      }
      if (!cibleVue.current) return;
      const carte = carteSous(e.target, panneau.current);
      if (!carte) return;
      // Une carte en vol ne repart pas : le clic de son arrivée suffit.
      if (enVol.has(carte)) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      // Une carte déjà sur le Gaulois n'a rien à faire voler : son clic passe, comme avant.
      if (dejaSurLeGaulois(carte)) return;
      e.stopPropagation();
      e.preventDefault();
      poser(carte, null);
    },
  };
  return gestionnaires;
}
