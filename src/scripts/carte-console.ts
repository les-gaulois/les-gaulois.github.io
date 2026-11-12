/**
 * La console de la page Carte : la page tient dans l'écran, et la rangée du bas ouvre une fenêtre à la fois, sur la carte.
 * Ce script ne change aucune valeur : il montre ou cache ce que la page contient déjà. Sans lui, la page défile et toutes
 * les fenêtres se lisent l'une sous l'autre. Les règles sont dans `src/lib/carte-console.ts`, testées.
 */
import {
  ECRAN_POSE,
  LARGEUR_OBJECTIF_OUVERT,
  LARGEUR_REGLAGES_POSES,
  fenetreApresClic,
  fenetreApresEcran,
  fenetreDeLAncre,
  fenetreExiste,
  fenetreInitiale,
  type EcranConsole,
  type FenetreId,
} from "../lib/carte-console";

function init(): void {
  const root = document.querySelector<HTMLElement>("[data-carte]");
  if (!root) return;
  const html = document.documentElement;

  const fenetres = new Map<FenetreId, HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-fenetre]")) fenetres.set(el.dataset.fenetre as FenetreId, el);
  const entrees = [...root.querySelectorAll<HTMLAnchorElement>("[data-ouvre]")];
  const panneaux = root.querySelector<HTMLElement>("[data-carte-panneaux]");

  const pose = matchMedia(ECRAN_POSE);
  const large = matchMedia(`(min-width: ${LARGEUR_OBJECTIF_OUVERT})`);
  const reglagesPoses = matchMedia(`${ECRAN_POSE} and (min-width: ${LARGEUR_REGLAGES_POSES})`);
  const ecran = (): EcranConsole => ({ empile: !pose.matches, large: large.matches, reglagesPoses: reglagesPoses.matches });

  let ouverte: FenetreId | null = null;

  /** Ouvre une fenêtre, ou les ferme toutes. `adresse` : l'ancre suit, sans ajouter de page à l'historique. */
  function montrer(id: FenetreId | null, options: { focus?: boolean; adresse?: boolean } = {}): void {
    const cible = id !== null && fenetres.has(id) ? id : null;
    const change = cible !== ouverte;
    ouverte = cible;
    for (const [nom, el] of fenetres) el.classList.toggle("est-ouverte", nom === cible);
    for (const entree of entrees) {
      if (entree.dataset.ouvre === cible) entree.setAttribute("aria-current", "true");
      else entree.removeAttribute("aria-current");
    }
    if (cible) root!.dataset.ouverte = cible;
    else delete root!.dataset.ouverte;
    // Une nouvelle fenêtre se lit depuis son début.
    if (change && panneaux) panneaux.scrollTop = 0;
    if (options.adresse) history.replaceState(history.state, "", cible ? `#${cible}` : `${location.pathname}${location.search}`);
    if (cible && options.focus) fenetres.get(cible)?.focus({ preventScroll: true });
    // Le film recadre la carte : une fenêtre posée dessus en couvre une partie.
    root!.dispatchEvent(new CustomEvent("carte:fenetre"));
  }

  const entreeDe = (id: FenetreId | null) => entrees.find((entree) => entree.dataset.ouvre === id && entree.getClientRects().length > 0);

  /** Ferme la fenêtre ouverte et rend le focus à son entrée. Quand tout s'empile, une fenêtre reste toujours ouverte. */
  function fermer(): boolean {
    if (ouverte === null || ecran().empile) return false;
    const entree = entreeDe(ouverte);
    montrer(null, { adresse: true });
    entree?.focus();
    return true;
  }

  /** Un clic ordinaire : celui qui ouvre un autre onglet ou une autre fenêtre du navigateur garde son rôle. */
  const clicSimple = (event: MouseEvent) => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

  for (const entree of entrees) {
    entree.addEventListener("click", (event) => {
      if (!clicSimple(event)) return;
      event.preventDefault();
      const cliquee = entree.dataset.ouvre as FenetreId;
      const suivante = fenetreApresClic(ouverte, cliquee, ecran());
      if (suivante === ouverte) {
        // Quand tout s'empile, recliquer l'entrée ouverte ramène seulement à sa fenêtre.
        if (suivante) fenetres.get(suivante)?.focus({ preventScroll: true });
        return;
      }
      montrer(suivante, { focus: suivante !== null, adresse: true });
    });
  }
  for (const bouton of root.querySelectorAll<HTMLButtonElement>("[data-ferme]")) bouton.addEventListener("click", () => fermer());

  // Un autre lien de la page vers une fenêtre (le crédit de la carte mène à la légende) l'ouvre comme son entrée.
  root.addEventListener("click", (event) => {
    const lien = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]:not([data-ouvre])') : null;
    if (!lien || !clicSimple(event)) return;
    const demandee = fenetreDeLAncre(lien.hash);
    if (!demandee || !fenetreExiste(demandee, ecran())) return;
    event.preventDefault();
    montrer(demandee, { focus: true, adresse: true });
  });

  // Échap ferme la fenêtre ouverte, après ce qui passe avant elle : un menu de l'en-tête ou un pop-up des appels, qui
  // écoutent aussi cette touche. À la capture : les menus se ferment à la remontée, et paraîtraient déjà fermés ici.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("details[data-menu][open], [data-testid='appels-popup']")) return;
      fermer();
    },
    true,
  );

  // Une ancre tapée ou suivie dans la page ouvre sa fenêtre.
  window.addEventListener("hashchange", () => {
    const demandee = fenetreDeLAncre(location.hash);
    if (demandee && fenetreExiste(demandee, ecran())) montrer(demandee, { focus: true });
  });

  // L'écran change (téléphone tourné, fenêtre du navigateur redimensionnée) : la fenêtre ouverte suit ses règles.
  const ecranChange = () => {
    const suivante = fenetreApresEcran(ouverte, ecran());
    if (suivante !== ouverte) montrer(suivante);
    else root.dispatchEvent(new CustomEvent("carte:fenetre"));
  };
  for (const media of [pose, large, reglagesPoses]) {
    // Un ancien Safari ne connaît que `addListener`.
    if (media.addEventListener) media.addEventListener("change", ecranChange);
    else media.addListener(ecranChange);
  }

  // Posé sur la carte, le podium s'arrête sous la session, quelle que soit sa hauteur : un avertissement de collecte
  // l'allonge, et il doit rester lisible en entier. La feuille de style lit `--session-bas`.
  const session = root.querySelector<HTMLElement>(".carte-session");
  if (session && "ResizeObserver" in window) {
    const mesurer = () => root.style.setProperty("--session-bas", `${session.offsetTop + session.offsetHeight}px`);
    new ResizeObserver(mesurer).observe(session);
    mesurer();
  }

  // La console est prête : la page garde sa mise en page d'écran (voir le script en ligne de carte.astro).
  html.dataset.cartePrete = "";
  html.classList.add("carte-console");
  montrer(fenetreInitiale(location.hash, ecran()));

  // En dernier, une fois la console sûre de tenir : elle n'a pas de bas de page, et le pied de page du site se range dans
  // la fenêtre « À propos ». Si quelque chose casse plus haut, il reste à sa place, sous une page qui défile.
  const pied = document.querySelector<HTMLElement>("body > footer");
  const place = root.querySelector<HTMLElement>("[data-carte-pied]");
  if (pied && place) place.append(pied);
}

init();
