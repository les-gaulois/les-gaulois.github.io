/**
 * Clair ou sombre : le bouton de l'en-tête (16 novembre 2026, à la demande du pilote : « beaucoup de personnes m'ont
 * fait des retours comme quoi c'était trop clair, avec la possibilité de choisir clair ou sombre »).
 *
 * Le thème clair est « Neige Marine », le sombre « Nuit Marine » (docs/DESIGN.md). Sans choix du visiteur, le site suit
 * le réglage de son appareil ; dès qu'il appuie sur le bouton, son choix est retenu dans ce navigateur (clé `gal-mode`),
 * et rien n'est envoyé. Le script en ligne de Base.astro pose le thème avant le premier affichage : celui-ci tient le
 * bouton, et suit l'appareil s'il change de réglage en cours de visite.
 */
const CLE = "gal-mode";
type Mode = "clair" | "sombre";

const racine = document.documentElement;
const appareil = matchMedia("(prefers-color-scheme: dark)");
const boutons = document.querySelectorAll<HTMLButtonElement>("[data-mode-toggle]");

function choisi(): Mode | null {
  try {
    const valeur = localStorage.getItem(CLE);
    return valeur === "clair" || valeur === "sombre" ? valeur : null;
  } catch {
    return null;
  }
}

function modeActuel(): Mode {
  return racine.dataset.mode === "sombre" ? "sombre" : "clair";
}

function appliquer(mode: Mode): void {
  if (mode === "sombre") racine.dataset.mode = "sombre";
  else delete racine.dataset.mode;
  document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.setAttribute("content", mode === "sombre" ? "dark" : "light");
  const barre = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const couleur = mode === "sombre" ? barre?.dataset.sombre : barre?.dataset.clair;
  if (barre && couleur) barre.content = couleur;
  const suite = mode === "sombre" ? "Passer au thème clair" : "Passer au thème sombre";
  for (const bouton of boutons) {
    bouton.hidden = false;
    // Le bouton du menu, sur téléphone, écrit où il mène ; celui de l'en-tête, une icône, dit s'il est enfoncé.
    const texte = bouton.querySelector<HTMLElement>("[data-mode-texte]");
    if (texte) texte.textContent = suite;
    else {
      bouton.setAttribute("aria-pressed", String(mode === "sombre"));
      bouton.title = suite;
    }
  }
}

appliquer(modeActuel());

for (const bouton of boutons) {
  bouton.addEventListener("click", () => {
    const mode: Mode = modeActuel() === "sombre" ? "clair" : "sombre";
    try {
      localStorage.setItem(CLE, mode);
    } catch {
      // Stockage indisponible : le choix vaut pour cette page.
    }
    appliquer(mode);
  });
}

// L'appareil change de réglage pendant la visite : le site suit, sauf si le visiteur a choisi lui-même.
appareil.addEventListener?.("change", (e) => {
  if (!choisi()) appliquer(e.matches ? "sombre" : "clair");
});

// Un autre onglet du site a changé de thème : celui-ci suit.
window.addEventListener("storage", (e) => {
  if (e.key === CLE) appliquer(choisi() ?? (appareil.matches ? "sombre" : "clair"));
});
