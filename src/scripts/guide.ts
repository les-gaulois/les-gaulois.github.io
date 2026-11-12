/**
 * Le guide du clan (/debuter), dans le navigateur : un chapitre à la fois. Les liens du sommaire et les boutons
 * « Précédent » et « Suivant » sont de vrais liens vers l'ancre d'un chapitre : l'adresse garde le chapitre ouvert, et le
 * bouton Retour du navigateur revient au chapitre d'avant. Ce script ouvre le chapitre que nomme l'adresse, le marque
 * dans le sommaire, y amène la page et le focus. Ce qui se calcule est dans src/lib/guide.ts.
 * S'il ne se charge pas, le script en ligne de la page ouvre encore le chapitre que nomme l'adresse ; sans JavaScript du
 * tout, la page donne tous les chapitres à la suite.
 */
import { motionAllowed } from "../lib/fx/motion";
import { chapitreDeLAdresse, doitDefiler, sensDuPassage } from "../lib/guide";

const guide = document.querySelector<HTMLElement>("[data-guide]");

if (guide) {
  const chapitres = [...guide.querySelectorAll<HTMLElement>("[data-guide-chapitre]")];
  const ancres = chapitres.map((c) => c.id);
  const liens = [...guide.querySelectorAll<HTMLAnchorElement>("[data-guide-lien]")];
  const plan = guide.querySelector<HTMLElement>("[data-guide-plan]");
  const bouton = guide.querySelector<HTMLButtonElement>("[data-guide-bouton]");
  const ici = guide.querySelector<HTMLElement>("[data-guide-ici]");
  let ouvert: string | null = null;

  /** Le sommaire replié du téléphone : ouvert ou fermé. Sur grand écran, il est toujours là et le bouton n'existe pas. */
  const plier = (ouvrir: boolean): void => {
    plan?.classList.toggle("guide-plan-ouvert", ouvrir);
    bouton?.setAttribute("aria-expanded", String(ouvrir));
  };

  /** Montre un chapitre et cache les autres. `visiteur` : il l'a demandé, la page et le focus le suivent. */
  const ouvrir = (ancre: string, visiteur: boolean): void => {
    const cible = chapitres.find((c) => c.id === ancre);
    if (!cible) return;
    const sens = visiteur ? sensDuPassage(ancres, ouvert, ancre) : null;
    for (const c of chapitres) {
      c.classList.toggle("guide-ouvert", c === cible);
      c.classList.remove("guide-de-droite", "guide-de-gauche");
    }
    if (sens) cible.classList.add(sens === "droite" ? "guide-de-droite" : "guide-de-gauche");
    for (const lien of liens) {
      if (lien.dataset.guideLien === ancre) lien.setAttribute("aria-current", "step");
      else lien.removeAttribute("aria-current");
    }
    if (ici) ici.textContent = cible.dataset.court ?? "";
    ouvert = ancre;
    plier(false);
    if (!visiteur) return;
    if (doitDefiler(cible.getBoundingClientRect().top, innerHeight)) cible.scrollIntoView({ block: "start", behavior: motionAllowed() ? "smooth" : "auto" });
    // Le focus passe au titre du chapitre : au clavier et au lecteur d'écran, la lecture reprend à son début.
    cible.querySelector<HTMLElement>("[data-guide-titre]")?.focus({ preventScroll: true });
  };

  /** Le chapitre que demande l'adresse ; sans ancre de chapitre, celui qui est déjà ouvert, sinon le premier. */
  const suivreLAdresse = (visiteur: boolean): void => {
    const nomme = chapitreDeLAdresse(location.hash, ancres);
    const ancre = nomme ?? (location.hash.length > 1 ? ouvert : null) ?? ancres[0];
    if (ancre) ouvrir(ancre, visiteur && nomme !== null);
  };

  guide.classList.add("guide-pas-a-pas");
  suivreLAdresse(false);
  addEventListener("hashchange", () => suivreLAdresse(true));

  bouton?.addEventListener("click", () => plier(bouton.getAttribute("aria-expanded") !== "true"));
  // Un lien vers le chapitre déjà ouvert ne change pas l'adresse : il referme au moins le sommaire, et ramène au titre.
  for (const lien of liens) {
    lien.addEventListener("click", () => {
      if (lien.dataset.guideLien === ouvert) ouvrir(ouvert, true);
    });
  }
  // Échap referme le sommaire du téléphone et rend le focus à son bouton.
  plan?.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || bouton?.getAttribute("aria-expanded") !== "true") return;
    plier(false);
    bouton.focus();
  });
}
