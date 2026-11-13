/**
 * La page Carte : elle tient dans l'écran, le rail (ou la rangée du bas, sur téléphone) ouvre une fenêtre à la fois, lue
 * dans la colonne de droite, ou sous la carte quand tout s'empile. Ce script ne change aucune valeur : il montre ou cache
 * ce que la page contient déjà. Sans lui, la page défile et toutes les fenêtres se lisent l'une sous l'autre. Les règles
 * sont dans `src/lib/carte-console.ts`, testées.
 */
import { ECRAN_POSE, fenetreApresClic, fenetreApresFermeture, fenetreDeLAncre, fenetreInitiale, type FenetreId } from "../lib/carte-console";
import { brancherFenetreLibre } from "./fenetre-libre";

function init(): void {
  const root = document.querySelector<HTMLElement>("[data-carte]");
  if (!root) return;
  const html = document.documentElement;

  const fenetres = new Map<FenetreId, HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-fenetre]")) fenetres.set(el.dataset.fenetre as FenetreId, el);
  const existe = (id: FenetreId) => fenetres.has(id);
  const entrees = [...root.querySelectorAll<HTMLAnchorElement>("[data-ouvre]")];
  const panneaux = root.querySelector<HTMLElement>("[data-carte-panneaux]");
  const pose = matchMedia(ECRAN_POSE);

  let ouverte: FenetreId = fenetreInitiale(location.hash, existe);

  /** Ouvre une fenêtre. `adresse` : l'ancre suit, sans ajouter de page à l'historique. */
  function montrer(id: FenetreId, options: { focus?: boolean; adresse?: boolean } = {}): void {
    if (!existe(id)) return;
    const change = id !== ouverte;
    ouverte = id;
    for (const [nom, el] of fenetres) el.classList.toggle("est-ouverte", nom === id);
    for (const entree of entrees) {
      if (entree.dataset.ouvre === id) entree.setAttribute("aria-current", "true");
      else entree.removeAttribute("aria-current");
    }
    root!.dataset.ouverte = id;
    // Une nouvelle fenêtre se lit depuis son début.
    if (change && panneaux) panneaux.scrollTop = 0;
    if (options.adresse) history.replaceState(history.state, "", `#${id}`);
    if (options.focus) fenetres.get(id)?.focus({ preventScroll: true });
    // La carte de l'alliance prend la place du film, ou la lui rend : le film recadre la carte.
    root!.dispatchEvent(new CustomEvent("carte:fenetre"));
  }

  const entreeDe = (id: FenetreId) => entrees.find((entree) => entree.dataset.ouvre === id && entree.getClientRects().length > 0);

  /** Ferme la fenêtre qui a une barre (la carte de l'alliance) : l'objectif revient, le focus va à l'entrée quittée. */
  function fermer(): boolean {
    const suivante = fenetreApresFermeture(ouverte, existe);
    if (suivante === null) return false;
    const entree = entreeDe(ouverte);
    montrer(suivante, { adresse: true });
    entree?.focus();
    return true;
  }

  /** Un clic ordinaire : celui qui ouvre un autre onglet ou une autre fenêtre du navigateur garde son rôle. */
  const clicSimple = (event: MouseEvent) => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

  for (const entree of entrees) {
    entree.addEventListener("click", (event) => {
      if (!clicSimple(event)) return;
      event.preventDefault();
      const suivante = fenetreApresClic(ouverte, entree.dataset.ouvre as FenetreId, existe);
      // Recliquer l'entrée ouverte ramène seulement à sa fenêtre, et l'adresse la retient.
      if (suivante === ouverte) {
        fenetres.get(suivante)?.focus({ preventScroll: true });
        history.replaceState(history.state, "", `#${suivante}`);
      } else montrer(suivante, { focus: true, adresse: true });
    });
  }
  for (const bouton of root.querySelectorAll<HTMLButtonElement>("[data-ferme]")) bouton.addEventListener("click", () => fermer());

  // Échap referme la carte de l'alliance, après ce qui passe avant elle : un menu de l'en-tête ou un pop-up des appels, qui
  // écoutent aussi cette touche. À la capture : les menus se ferment à la remontée, et paraîtraient déjà fermés ici.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || ouverte !== "alliance") return;
      if (document.querySelector("details[data-menu][open], [data-testid='appels-popup']")) return;
      fermer();
    },
    true,
  );

  // Une ancre tapée ou suivie dans la page ouvre sa fenêtre.
  window.addEventListener("hashchange", () => {
    const demandee = fenetreDeLAncre(location.hash);
    if (demandee && existe(demandee)) montrer(demandee, { focus: true });
  });

  // L'écran change (téléphone tourné, fenêtre du navigateur redimensionnée) : la carte change de taille.
  const ecranChange = () => root.dispatchEvent(new CustomEvent("carte:fenetre"));
  // Un ancien Safari ne connaît que `addListener`.
  if (pose.addEventListener) pose.addEventListener("change", ecranChange);
  else pose.addListener(ecranChange);

  // Le rail des entrées s'arrête sous le titre, quelle que soit sa hauteur : un avertissement de collecte l'allonge. La
  // feuille de style lit `--session-bas`.
  const session = root.querySelector<HTMLElement>(".carte-session");
  if (session && "ResizeObserver" in window) {
    const mesurer = () => root.style.setProperty("--session-bas", `${session.offsetTop + session.offsetHeight}px`);
    new ResizeObserver(mesurer).observe(session);
    mesurer();
  }
  // Le bord droit du rail : sur la carte de l'alliance, ses outils et sa légende se rangent à sa droite. La feuille de style
  // lit `--rail-droite`.
  const rail = root.querySelector<HTMLElement>(".carte-dock");
  if (rail && "ResizeObserver" in window) {
    const mesurerRail = () => root.style.setProperty("--rail-droite", `${rail.offsetLeft + rail.offsetWidth}px`);
    new ResizeObserver(mesurerRail).observe(rail);
    mesurerRail();
  }

  // Une fenêtre libre (la fenêtre « Alliance ») se déplace, change de taille, s'agrandit ou se réduit sur la carte.
  for (const fenetre of fenetres.values()) if (fenetre.hasAttribute("data-libre")) brancherFenetreLibre(root, fenetre, pose);

  // La page est prête : elle garde sa mise en page d'écran (voir le script en ligne de carte.astro).
  html.dataset.cartePrete = "";
  html.classList.add("carte-console");
  montrer(ouverte);
}

init();
