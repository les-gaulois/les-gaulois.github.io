/**
 * Le point des nouveautés, sur le bouton de l'en-tête et dans le menu : il s'allume quand le site a reçu
 * une mise à jour depuis le dernier coup d'œil du visiteur, et s'éteint quand il ouvre les nouveautés.
 * Seule la marque de la dernière mise à jour vue reste dans son navigateur. Sans stockage, aucun point ne s'allume.
 */
import { NOUVEAUTES_KEY, newsDot } from "../lib/nouveautes";

const marker = document.body.dataset.nouveautesMarker ?? null;
const dots = document.querySelectorAll<HTMLElement>("[data-nouveautes-dot]");
// Le bouton Menu a déjà un nom, « Ouvrir le menu » : un point allumé y devient sa description pour les lecteurs d'écran.
// Sur grand écran, les nouveautés ne sont pas dans le menu, et le bouton « Nouveautés » le dit lui-même.
const described = document.querySelector<HTMLElement>("[data-nouveautes-described]");
const LARGE = "(min-width: 64rem)";

function light(on: boolean) {
  for (const dot of dots) dot.hidden = !on;
  if (on && !matchMedia(LARGE).matches) described?.setAttribute("aria-describedby", "nouveautes-menu-note");
  else described?.removeAttribute("aria-describedby");
}

function stored(): string | null {
  try {
    return localStorage.getItem(NOUVEAUTES_KEY);
  } catch {
    return null;
  }
}

/** Les nouveautés sont sous les yeux du visiteur : on retient la dernière, et le point s'éteint. */
function seen() {
  if (marker === null) return;
  try {
    localStorage.setItem(NOUVEAUTES_KEY, marker);
  } catch {
    // Stockage indisponible : le point ne s'allumera pas, le reste fonctionne.
  }
  light(false);
}

if (document.querySelector("[data-nouveautes-page]")) {
  seen();
} else {
  const { dot, remember } = newsDot(stored(), marker);
  if (remember) seen();
  light(dot);
}

const panel = document.querySelector<HTMLDetailsElement>("[data-nouveautes-menu]");
panel?.addEventListener("toggle", () => {
  if (panel.open) seen();
});
