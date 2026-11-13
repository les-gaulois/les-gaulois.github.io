/**
 * Une fenêtre libre de la console de la carte (`data-libre`, la fenêtre « Alliance ») : elle se déplace par sa barre de
 * titre, change de taille par ses bords et ses coins, s'agrandit à toute la carte (bouton, ou double-clic sur la barre) ou
 * se réduit à sa barre. Au clavier : les flèches sur la poignée de la barre la déplacent, sur la poignée du coin elles
 * changent sa taille ; Maj va plus vite. Sa place et son état sont gardés dans ce navigateur seulement.
 *
 * Seulement quand la carte prend tout l'écran et que les fenêtres se posent dessus : quand tout s'empile (téléphone,
 * tablette debout), la fenêtre est sous la carte et n'a pas de barre. Ce script ne change aucune valeur affichée. Les
 * calculs sont dans `src/lib/fenetre-libre.ts`, testés.
 */
import {
  BORDS,
  borner,
  deplacer,
  largeurCouverte,
  largeurCouverteAGauche,
  geometrieAgrandie,
  lireFenetreGardee,
  MARGE,
  pasDeLaFleche,
  redimensionner,
  reserveDuBas,
  textesFenetre,
  type Bord,
  type Cadre,
  type EtatFenetre,
  type FenetreGardee,
  type Geometrie,
} from "../lib/fenetre-libre";
import { motionAllowed } from "../lib/fx/motion";

const lire = (cle: string): string | null => {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
};
const ecrire = (cle: string, valeur: string | null): void => {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    // Stockage refusé : la fenêtre se déplace quand même, et reprend sa place au prochain passage.
  }
};

/** Un mouvement doux qui démarre vite et se pose lentement. */
const EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";

export function brancherFenetreLibre(root: HTMLElement, fenetre: HTMLElement, pose: MediaQueryList): void {
  const parent = fenetre.parentElement;
  const barre = fenetre.querySelector<HTMLElement>(".carte-fenetre-barre");
  const corps = fenetre.querySelector<HTMLElement>(".carte-fenetre-corps");
  if (!parent || !barre || !corps) return;
  const calque: HTMLElement = parent;
  const boutons = {
    deplacer: fenetre.querySelector<HTMLButtonElement>("[data-fenetre-deplacer]"),
    taille: fenetre.querySelector<HTMLButtonElement>("[data-fenetre-taille]"),
    reduire: fenetre.querySelector<HTMLButtonElement>("[data-fenetre-reduire]"),
    agrandir: fenetre.querySelector<HTMLButtonElement>("[data-fenetre-agrandir]"),
    replacer: fenetre.querySelector<HTMLButtonElement>("[data-fenetre-replacer]"),
  };
  const cle = `gal-fenetre-${fenetre.dataset.fenetre ?? "libre"}`;
  const gardee: FenetreGardee = lireFenetreGardee(lire(cle));
  let g: Geometrie | null = gardee.g;
  let etat: EtatFenetre = gardee.etat;
  // L'état d'avant la réduction : la fenêtre dépliée retrouve sa taille, agrandie ou non.
  let avantReduction: EtatFenetre = etat === "petit" ? "normal" : etat;
  /** Le mouvement en cours d'un agrandissement ou d'un retour à sa place (`animer`). */
  let glisse: Animation | null = null;

  /** Ce qui reste visible au bas de la carte, quoi qu'on fasse de la fenêtre : la mention d'OpenFront, l'alerte de collecte. */
  const aGarder = [...root.querySelectorAll<HTMLElement>(".carte-credit, .carte-alerte")];
  const reserve = (): number =>
    reserveDuBas(
      calque.getBoundingClientRect(),
      aGarder.filter((el) => el.getClientRects().length > 0).map((el) => el.getBoundingClientRect()),
    );
  /** La place de la fenêtre : le calque, moins le bas de la carte qui reste visible. */
  const cadre = (): Cadre => ({ largeur: calque.clientWidth, hauteur: Math.max(0, calque.clientHeight - reserve()) });
  /** La fenêtre se pose-t-elle sur la carte, ouverte ? Sinon, rien ne bouge. */
  const posee = () => pose.matches && fenetre.classList.contains("est-ouverte");
  /** La place affichée, dans le calque : celle choisie, ou celle d'origine mesurée. */
  const mesuree = (): Geometrie => {
    const f = fenetre.getBoundingClientRect();
    const c = calque.getBoundingClientRect();
    return { x: f.left - c.left, y: f.top - c.top, w: f.width, h: null };
  };

  function garder(): void {
    ecrire(cle, g === null && etat === "normal" ? null : JSON.stringify({ g, etat }));
  }

  /** Les autres scripts de la carte recadrent le film et la carte de l'alliance d'après ce que couvre la fenêtre. */
  function signaler(): void {
    root.dispatchEvent(new CustomEvent("carte:fenetre"));
  }

  /**
   * Ce que couvre la fenêtre, pour la légende, les outils et le crédit posés sur la carte : à droite (`--fenetre-large`),
   * ou à gauche (`--fenetre-gauche`, et les outils de la carte de l'alliance passent à droite).
   */
  function couverture(): void {
    // En plein mouvement, la fenêtre serait mesurée entre deux places : la mesure de la fin du mouvement suit.
    if (glisse?.playState === "running") return;
    if (!posee()) {
      root.style.removeProperty("--fenetre-large");
      root.style.removeProperty("--fenetre-gauche");
      delete root.dataset.fenetreGauche;
      return;
    }
    const c = calque.getBoundingClientRect();
    const f = fenetre.getBoundingClientRect();
    const couverte = largeurCouverte(c, f);
    root.style.setProperty("--fenetre-large", `${couverte > 0 ? Math.round(couverte) + 12 : 0}px`);
    const gauche = largeurCouverteAGauche(c, f);
    if (gauche > 0) {
      root.style.setProperty("--fenetre-gauche", `${Math.round(gauche) + 12}px`);
      root.dataset.fenetreGauche = "";
    } else {
      root.style.removeProperty("--fenetre-gauche");
      delete root.dataset.fenetreGauche;
    }
  }

  /** Le nom de chaque bouton de la barre, lu par les lecteurs d'écran et écrit dans la bulle de la souris : ce sont des icônes. */
  function nommer(): void {
    const t = textesFenetre(fenetre.closest("[lang]")?.getAttribute("lang"));
    const noms: [HTMLButtonElement | null, string][] = [
      [boutons.deplacer, t.deplacer],
      [boutons.taille, t.taille],
      [boutons.replacer, t.replacer],
      [boutons.reduire, etat === "petit" ? t.deplier : t.reduire],
      [boutons.agrandir, etat === "grand" ? t.restaurer : t.agrandir],
    ];
    for (const [bouton, nom] of noms) {
      bouton?.setAttribute("aria-label", nom);
      bouton?.setAttribute("title", nom);
    }
    boutons.reduire?.setAttribute("aria-expanded", String(etat !== "petit"));
  }

  /** Pose la fenêtre là où elle doit être : la feuille de style lit ces valeurs, seulement quand elle est posée sur la carte. */
  function appliquer(): void {
    if (etat === "normal") delete fenetre.dataset.etat;
    else fenetre.dataset.etat = etat;
    // Agrandie, toute la carte ; déplacée ou redimensionnée, sa place ; sinon, celle d'origine, posée par la feuille de style.
    const place = cadre();
    const vue = etat === "grand" ? geometrieAgrandie(place) : g === null ? null : borner(g, place);
    fenetre.style.setProperty("--libre-bas", `${MARGE + calque.clientHeight - place.hauteur}px`);
    if (vue) {
      fenetre.dataset.geometrie = "";
      fenetre.style.setProperty("--libre-x", `${vue.x}px`);
      fenetre.style.setProperty("--libre-y", `${vue.y}px`);
      fenetre.style.setProperty("--libre-w", `${vue.w}px`);
      if (vue.h === null) {
        delete fenetre.dataset.hauteur;
        fenetre.style.removeProperty("--libre-h");
      } else {
        fenetre.dataset.hauteur = "";
        fenetre.style.setProperty("--libre-h", `${vue.h}px`);
      }
    } else {
      delete fenetre.dataset.geometrie;
      delete fenetre.dataset.hauteur;
      for (const v of ["--libre-x", "--libre-y", "--libre-w", "--libre-h"]) fenetre.style.removeProperty(v);
    }
    // « Remettre à sa place » : seulement une fois déplacée ou redimensionnée ; réduite ou agrandie, ses boutons suffisent.
    if (boutons.replacer) boutons.replacer.hidden = g === null;
    nommer();
    couverture();
  }

  /**
   * Un changement d'état animé, sans changer la mise en page pendant le mouvement : la fenêtre passe d'un coup à sa
   * nouvelle place, puis un transform la fait partir de l'ancienne. Rien sans animations (bouton pause, réglage système).
   * La promesse se tient une fois la fenêtre posée : pendant le mouvement, elle se mesurerait à son ancienne place.
   */
  function animer(changer: () => void): Promise<void> {
    // Un mouvement encore en cours se termine d'un coup : on mesure la fenêtre à sa vraie place.
    glisse?.finish();
    if (!motionAllowed() || !posee() || typeof fenetre.animate !== "function") {
      changer();
      return Promise.resolve();
    }
    const avant = fenetre.getBoundingClientRect();
    changer();
    const apres = fenetre.getBoundingClientRect();
    if (avant.width === 0 || apres.width === 0 || apres.height === 0) return Promise.resolve();
    const animation = fenetre.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${avant.left - apres.left}px, ${avant.top - apres.top}px) scale(${avant.width / apres.width}, ${avant.height / apres.height})` },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration: 260, easing: EASING },
    );
    glisse = animation;
    const fini = () => {
      if (glisse === animation) glisse = null;
    };
    return animation.finished.then(fini, fini);
  }

  /** La fenêtre réduite ou dépliée : sa barre reste, le reste se roule ou se déroule sous elle. */
  let enTrainDeRouler = false;
  function rouler(vers: EtatFenetre): void {
    if (enTrainDeRouler) return;
    const hauteurBarre = barre!.offsetHeight + 6;
    const anime = motionAllowed() && posee() && typeof fenetre.animate === "function";
    if (vers === "petit") {
      // Le focus dans ce qui se cache passe au bouton qui déplie.
      const focusDedans = corps!.contains(document.activeElement);
      let roule: Animation | null = null;
      const finir = () => {
        enTrainDeRouler = false;
        etat = "petit";
        appliquer();
        // L'animation gardait la fenêtre roulée jusqu'ici : sans ce relais, elle se montrerait entière une image.
        roule?.cancel();
        garder();
        signaler();
        if (focusDedans) boutons.reduire?.focus();
      };
      if (!anime) return finir();
      enTrainDeRouler = true;
      const h = fenetre.offsetHeight;
      roule = fenetre.animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: `inset(0 0 ${Math.max(0, h - hauteurBarre)}px 0)` }], { duration: 200, easing: EASING, fill: "forwards" });
      roule.finished.then(finir, finir);
      return;
    }
    etat = vers;
    appliquer();
    garder();
    signaler();
    if (!anime) return;
    const h = fenetre.offsetHeight;
    fenetre.animate([{ clipPath: `inset(0 0 ${Math.max(0, h - hauteurBarre)}px 0)` }, { clipPath: "inset(0 0 0 0)" }], { duration: 260, easing: EASING });
  }

  function basculerReduction(): void {
    if (etat === "petit") rouler(avantReduction);
    else {
      avantReduction = etat;
      rouler("petit");
    }
  }

  function basculerAgrandissement(): void {
    void animer(() => {
      etat = etat === "grand" ? "normal" : "grand";
      avantReduction = etat;
      appliquer();
    }).then(signaler);
    garder();
  }

  function replacer(): void {
    void animer(() => {
      g = null;
      etat = "normal";
      avantReduction = "normal";
      appliquer();
    }).then(signaler);
    garder();
  }

  /**
   * Un geste du pointeur (souris, doigt, stylet) : la barre déplace, un bord ou un coin change la taille. Un simple clic,
   * sans mouvement (un double-clic sur la barre, la poignée touchée), ne détache pas la fenêtre de sa place.
   */
  function suivreGeste(depart: PointerEvent, cible: HTMLElement, bouger: (dx: number, dy: number) => void): void {
    depart.preventDefault();
    cible.setPointerCapture(depart.pointerId);
    let image = 0;
    let bouge = false;
    let dernier = { x: depart.clientX, y: depart.clientY };
    const suivre = () => {
      if (!bouge) return;
      bouger(dernier.x - depart.clientX, dernier.y - depart.clientY);
      appliquer();
    };
    const mouvement = (e: PointerEvent) => {
      if (e.pointerId !== depart.pointerId) return;
      dernier = { x: e.clientX, y: e.clientY };
      if (!bouge && Math.hypot(dernier.x - depart.clientX, dernier.y - depart.clientY) < 4) return;
      if (!bouge) fenetre.classList.add("est-saisie");
      bouge = true;
      if (image) return;
      image = requestAnimationFrame(() => {
        image = 0;
        suivre();
      });
    };
    const fin = (e: PointerEvent) => {
      if (e.pointerId !== depart.pointerId) return;
      cancelAnimationFrame(image);
      image = 0;
      cible.removeEventListener("pointermove", mouvement);
      cible.removeEventListener("pointerup", fin);
      cible.removeEventListener("pointercancel", fin);
      if (cible.hasPointerCapture(e.pointerId)) cible.releasePointerCapture(e.pointerId);
      fenetre.classList.remove("est-saisie");
      if (!bouge) return;
      suivre();
      garder();
      signaler();
    };
    cible.addEventListener("pointermove", mouvement);
    cible.addEventListener("pointerup", fin);
    cible.addEventListener("pointercancel", fin);
  }

  barre.addEventListener("pointerdown", (e) => {
    if (!posee() || e.button !== 0 || etat === "grand") return;
    // Les boutons de la barre gardent leur clic ; la poignée, elle, se tire aussi.
    if ((e.target as Element).closest("button:not([data-fenetre-deplacer])")) return;
    const debut = g === null ? mesuree() : borner(g, cadre());
    suivreGeste(e, barre, (dx, dy) => {
      g = deplacer(debut, dx, dy, cadre());
    });
  });
  barre.addEventListener("dblclick", (e) => {
    if (!posee() || (e.target as Element).closest("button")) return;
    if (etat === "petit") basculerReduction();
    else basculerAgrandissement();
  });

  for (const bordEl of fenetre.querySelectorAll<HTMLElement>("[data-bord]")) {
    const bord = bordEl.dataset.bord as Bord;
    if (!BORDS.includes(bord)) continue;
    bordEl.addEventListener("pointerdown", (e) => {
      if (!posee() || e.button !== 0 || etat !== "normal") return;
      const debut = g === null ? mesuree() : borner(g, cadre());
      const hauteur = fenetre.getBoundingClientRect().height;
      suivreGeste(e, bordEl, (dx, dy) => {
        g = redimensionner(debut, bord, dx, dy, cadre(), hauteur);
      });
    });
  }

  // Au clavier : les flèches sur une poignée.
  boutons.deplacer?.addEventListener("keydown", (e) => {
    const pas = pasDeLaFleche(e.key, e.shiftKey);
    if (!pas || !posee() || etat === "grand") return;
    e.preventDefault();
    g = deplacer(g === null ? mesuree() : borner(g, cadre()), pas.dx, pas.dy, cadre());
    appliquer();
    garder();
    signaler();
  });
  boutons.taille?.addEventListener("keydown", (e) => {
    const pas = pasDeLaFleche(e.key, e.shiftKey);
    if (!pas || !posee() || etat !== "normal") return;
    e.preventDefault();
    g = redimensionner(g === null ? mesuree() : borner(g, cadre()), "se", pas.dx, pas.dy, cadre(), fenetre.getBoundingClientRect().height);
    appliquer();
    garder();
    signaler();
  });

  boutons.reduire?.addEventListener("click", basculerReduction);
  boutons.agrandir?.addEventListener("click", basculerAgrandissement);
  boutons.replacer?.addEventListener("click", () => {
    replacer();
    boutons.reduire?.focus();
  });

  // Le focus sur la fenêtre elle-même (elle le reçoit à son ouverture) : les flèches, Page suivante, Début et Fin font
  // défiler son corps, comme elles faisaient défiler la fenêtre avant qu'elle ait une barre fixe.
  fenetre.addEventListener("keydown", (e) => {
    if (e.target !== fenetre || !posee() || etat === "petit" || e.ctrlKey || e.metaKey || e.altKey) return;
    const page = corps.clientHeight * 0.85;
    const pas: Record<string, number> = { ArrowDown: 40, ArrowUp: -40, PageDown: page, PageUp: -page, " ": e.shiftKey ? -page : page, Home: -corps.scrollHeight, End: corps.scrollHeight };
    const dy = pas[e.key];
    if (dy === undefined) return;
    e.preventDefault();
    corps.scrollBy({ top: dy });
  });

  // La fenêtre s'ouvre ou se ferme, l'écran change : elle reste entière dans la carte, et ce qu'elle couvre se remesure.
  // Rouverte depuis la rangée alors qu'on l'avait réduite, elle se déplie : on l'a demandée pour la lire.
  let etaitOuverte = fenetre.classList.contains("est-ouverte");
  root.addEventListener("carte:fenetre", () => {
    const ouverte = fenetre.classList.contains("est-ouverte");
    const deplier = ouverte && !etaitOuverte && etat === "petit";
    etaitOuverte = ouverte;
    if (deplier) {
      etat = avantReduction;
      appliquer();
      garder();
      // Les autres scripts ont peut-être déjà mesuré la fenêtre réduite : ils remesurent, après cet événement.
      queueMicrotask(signaler);
    } else couverture();
  });
  if ("ResizeObserver" in window) {
    const suivre = new ResizeObserver(() => appliquer());
    suivre.observe(calque);
    // La mention d'OpenFront change de hauteur (une ligne de plus quand la place manque) : la place de la fenêtre suit.
    for (const el of aGarder) suivre.observe(el);
  } else addEventListener("resize", () => appliquer());
  // La langue de la fenêtre change (français ou anglais) : les noms des boutons suivent.
  new MutationObserver(nommer).observe(fenetre, { attributes: true, attributeFilter: ["lang"] });

  appliquer();
}
