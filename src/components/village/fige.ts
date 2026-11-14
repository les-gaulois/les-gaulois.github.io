import { useLayoutEffect, useState } from "preact/hooks";

/**
 * Les animations du village sont coupées : par le bouton pause de l'en-tête (`fx-off` sur la page, posé par `fx.ts`) ou
 * par le réglage « réduire les animations ». Ce qui bouge reste alors posé, complet : chacun à sa place, les feux allumés.
 * Relu dès que l'un ou l'autre change.
 */
export function useFige(): boolean {
  const [fige, setFige] = useState(false);
  useLayoutEffect(() => {
    const racine = document.documentElement;
    const reglage = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lire = () => setFige(racine.classList.contains("fx-off") || reglage.matches);
    lire();
    const veille = new MutationObserver(lire);
    veille.observe(racine, { attributes: true, attributeFilter: ["class"] });
    reglage.addEventListener("change", lire);
    return () => {
      veille.disconnect();
      reglage.removeEventListener("change", lire);
    };
  }, []);
  return fige;
}
