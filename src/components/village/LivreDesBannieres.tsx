import type { ComponentChildren, JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { motionAllowed } from "../../lib/fx/motion";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, RARETES, casesDuGaulois, type Tenue } from "../../lib/gaulois";
import { basePath } from "../../lib/compte/api";
import type { Banniere, EtatDeLaBanniere } from "../../lib/village/bannieres";
import type { FinitionDuRayon } from "../../lib/village/cartes";
import { BANNIERE_HAUTEUR, BANNIERE_LARGEUR } from "../../lib/village/ecran-bannieres";
import type { Familier } from "../../lib/village/familiers";
import { casesDuLivre, pageDeLaCase, pageVoisine, pagesDuLivre, sensDuGeste, volVersLeDecor, type CaseDuLivre, type PlaceDuDecor } from "../../lib/village/livre-bannieres";
import { Problem } from "../compte/common";
import type { Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, peindre } from "./BoutiquePixels";
import { CarteAnimee, RefletDeBloc } from "./CarteAnimee";
import { CartesDeLaVitrine } from "./Vitrine";

/**
 * Le livre des bannières de « Mon Gaulois » (16 novembre 2026, dessin de Claude Fable 5.2, choisi par le pilote parmi dix
 * livres puis cinq variantes) : un album couché, qu'on penche avec la souris. Sur la page du bas, une vignette par
 * bannière du compte, et « le décor de mon lieu » ; la vignette touchée se décolle, vole au-dessus du livre et se dresse
 * en décor, le Gaulois du membre devant elle. Aucun bouton de page : on glisse la page, on touche son coin corné, ou on
 * prend les flèches du clavier. Sous le livre, trois aperçus changent dès le survol d'une vignette : l'image de /gaulois, la
 * bannière en tête de sa fiche de membre et sa carte dans « La vitrine ».
 *
 * Le serveur décide (`choisir_banniere`) : le décor ne se dresse qu'après sa réponse, et reste l'ancien s'il refuse. Avec
 * le bouton pause ou « réduire les animations », tout se pose sans mouvement. Calculs : `src/lib/village/livre-bannieres.ts`.
 */
type Lib = typeof import("../../lib/village/bannieres");

const attendre = (ms: number): Promise<void> => new Promise((fini) => setTimeout(fini, ms));
const NOM_DU_LIEU = "Le décor de mon lieu";

/** Un dessin en pixels, décoratif : ce qu'il montre est toujours écrit à côté. */
function Toile({ largeur, hauteur, cases, class: classe }: { largeur: number; hauteur: number; cases: readonly (string | null)[]; class: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    peindre(toile.current, largeur, hauteur, cases);
  }, [largeur, hauteur, cases]);
  return <canvas ref={toile} width={largeur} height={hauteur} class={`pixels ${classe}`} aria-hidden="true" />;
}

/** Ce que le livre sait de ce qu'il montre : une bannière, ou tout ce qui a un nom et une rareté (une finition de carte). */
export type ElementDuLivre = Pick<Banniere, "id" | "nom" | "rarete">;

/** L'image d'une case : ses mesures, et de quoi la peindre sur une toile de cette taille. */
export interface ImageDeCase {
  largeur: number;
  hauteur: number;
  peindre: (toile: HTMLCanvasElement) => void;
}

/**
 * Un autre dessin que celui des bannières (17 novembre 2026, le rayon « Cartes », à la demande du pilote : « exactement
 * comme la boutique bannière, le style de livre ») : le même livre, les mêmes gestes, d'autres images. Sans ce réglage, le
 * livre est celui des bannières, inchangé.
 */
export interface DessinDuLivre {
  /** Le genre de ce que le livre montre, pour la feuille de style (`data-genre`). */
  genre: string;
  /** Le nom du groupe des cases, pour les lecteurs d'écran. */
  label: string;
  /** L'image d'une case, et de son vol. `null` : rien à dessiner. */
  image: (id: string) => ImageDeCase | null;
  /** Ce qui se dresse au-dessus du livre, à la place de la vignette et du Gaulois. */
  decor: (id: CaseDuLivre) => ComponentChildren;
  /** L'élément de cet identifiant quand une rareté filtrée l'a sorti de la liste. */
  parId: (id: string) => ElementDuLivre | null;
  /** La place du décor couché, pour le vol de la vignette. */
  place: PlaceDuDecor;
}

/** Une image seule ; une place en pointillés pour le décor du lieu ou une image inconnue du dessin. */
function Vignette({ image, id }: { image: (id: string) => ImageDeCase | null; id: CaseDuLivre }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const vignette = useMemo(() => (id ? image(id) : null), [image, id]);
  useEffect(() => {
    if (vignette && toile.current) vignette.peindre(toile.current);
  }, [vignette]);
  return vignette ? <canvas ref={toile} width={vignette.largeur} height={vignette.hauteur} class="pixels livre-ban" style={`aspect-ratio:${vignette.largeur} / ${vignette.hauteur}`} aria-hidden="true" /> : <span class="livre-lieu" aria-hidden="true" />;
}

/** L'aperçu de /gaulois : le Gaulois du membre devant la bannière, comme le robot le montrera, sans le logo ni les insignes. */
function ApercuDeGaulois({ lib, banniere, tenue, familier }: { lib: Lib; banniere: ElementDuLivre | null; tenue: Tenue; familier: Familier | null }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(() => (banniere ? lib.sceneDeLaBanniere(banniere.id, tenue, familier) : null), [lib, banniere, tenue, familier]);
  useEffect(() => {
    if (scene) peindre(toile.current, scene.largeur, scene.hauteur, scene.cases);
  }, [scene]);
  if (!banniere || !scene) {
    return (
      <p class="livre-apercu-lieu" data-testid="livre-apercu-lieu">
        Votre Gaulois devant le décor de son lieu.
      </p>
    );
  }
  return <canvas ref={toile} width={BANNIERE_LARGEUR} height={BANNIERE_HAUTEUR} class="pixels livre-apercu-scene" role="img" aria-label={`Votre Gaulois devant la bannière « ${banniere.nom} »`} data-testid="livre-apercu-scene" data-banniere={banniere.id} />;
}

/**
 * `mode` « choix » (« Mon Gaulois ») : `miennes` sont les bannières du compte, `montree` celle de /gaulois, `choisir`
 * demande au serveur de la changer ; le décor du lieu a sa case et les aperçus suivent. `mode` « boutique » (l'onglet
 * « Bannière ») : `miennes` sont toutes les bannières, `montree` celle que la fiche d'à côté décrit, `choisir` ne fait que
 * la montrer ; `etatDe` marque celles du compte, `motDe` dit leur prix ou leur état à qui ne voit pas la vignette.
 */
export interface LivreDesBannieresProps {
  /** Le dessin des bannières. Inutile avec `dessin`, qui apporte le sien (mode « boutique » seulement). */
  lib?: Lib;
  dessin?: DessinDuLivre;
  mode?: "choix" | "boutique";
  miennes: readonly ElementDuLivre[];
  montree: ElementDuLivre | null;
  /** Le nom du membre, pour sa carte de la vitrine (mode « choix »). */
  nom?: string;
  tenue: Tenue;
  familier: Familier | null;
  choisir: (id: string | null) => Promise<Issue<string | null>>;
  etatDe?: (id: string) => EtatDeLaBanniere;
  motDe?: (id: string) => string;
  /**
   * La finition de carte que le membre montre (mode « choix », rayon « Cartes ») : l'aperçu de sa fiche porte son reflet,
   * et un aperçu de plus montre sa carte devant la bannière survolée. `null` : le reflet offert.
   */
  finition?: FinitionDuRayon | null;
  /** D'autres aperçus sous le livre, pour ce qui est survolé (mode « boutique », avec `dessin`). */
  apercus?: (vue: CaseDuLivre) => ComponentChildren;
}

export function LivreDesBannieres({ lib, dessin, mode = "choix", miennes, montree, nom = "Moi", tenue, familier, choisir, etatDe, motDe, finition = null, apercus }: LivreDesBannieresProps) {
  const enBoutique = mode === "boutique";
  // L'image d'une case : celle du dessin donné, sinon la vignette de la bannière, cadre compris.
  const image = useMemo(
    () =>
      dessin?.image ??
      ((id: string): ImageDeCase | null => {
        const v = lib?.vignetteDeLaBanniere(id) ?? null;
        return v ? { largeur: v.largeur, hauteur: v.hauteur, peindre: (toile) => peindre(toile, v.largeur, v.hauteur, v.cases) } : null;
      }),
    [dessin, lib],
  );
  const actuel: CaseDuLivre = montree?.id ?? null;
  const parId = useMemo(() => new Map(miennes.map((b) => [b.id, b])), [miennes]);
  const cases = useMemo(() => casesDuLivre(miennes.map((b) => b.id), !enBoutique), [miennes, enBoutique]);
  const pages = useMemo(() => pagesDuLivre(cases), [cases]);
  const [pageVoulue, setPage] = useState(() => pageDeLaCase(cases, actuel));
  const page = Math.min(pageVoulue, pages.length - 1);
  const pageVue = useRef(page);
  pageVue.current = page;
  const actuelVu = useRef(actuel);
  actuelVu.current = actuel;
  /** Ce que le décor dressé montre : la bannière du serveur, sauf le temps d'un changement. */
  const [dresse, setDresse] = useState<CaseDuLivre>(actuel);
  const dresseVu = useRef(dresse);
  dresseVu.current = dresse;
  const [enVol, setEnVol] = useState<CaseDuLivre | undefined>(undefined);
  const [essai, setEssai] = useState<CaseDuLivre | undefined>(undefined);
  const [leve, setLeve] = useState(false);
  const [fete, setFete] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [invite, setInvite] = useState(true);
  const corps = useRef<HTMLDivElement>(null);
  const grille = useRef<HTMLDivElement>(null);
  const enCours = useRef(false);
  const tourne = useRef(false);
  const vivant = useRef(true);
  const geste = useRef<{ x: number; glisse: boolean } | null>(null);
  const vientDeGlisser = useRef(false);
  const focusARendre = useRef(false);
  const suivante = useRef<{ c: CaseDuLivre; bouton: HTMLElement } | null>(null);

  // À l'ouverture, le décor se dresse.
  useEffect(() => {
    vivant.current = true;
    const image = requestAnimationFrame(() => {
      setLeve(true);
      setFete(true);
    });
    return () => {
      vivant.current = false;
      cancelAnimationFrame(image);
    };
  }, []);
  // La page tournée au clavier : le focus passe à sa première vignette, sinon il serait perdu avec l'ancienne page.
  useEffect(() => {
    if (!focusARendre.current) return;
    focusARendre.current = false;
    grille.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, [page]);
  // La liste change (une rareté choisie à la boutique ; dans « Mon Gaulois », une bannière achetée) : le livre s'ouvre à la
  // page de la bannière montrée.
  // Comparée par son contenu : la page qui porte le livre refait sa liste à chaque rendu, sans qu'elle ait changé.
  const cleDesCases = cases.map((c) => c ?? "").join("|");
  const cleVue = useRef(cleDesCases);
  useEffect(() => {
    if (cleVue.current === cleDesCases) return;
    cleVue.current = cleDesCases;
    setPage(pageDeLaCase(cases, enCours.current ? dresseVu.current : actuelVu.current));
  }, [cleDesCases, cases]);
  // Une bannière choisie ailleurs (au retour de la boutique) : le livre la suit.
  useEffect(() => {
    if (!enCours.current) setDresse(actuel);
  }, [actuel]);

  /** La bannière de cet identifiant : dans la liste du livre, sinon au catalogue (une rareté filtrée l'a sortie de la liste). */
  const banniereDe = (id: string): ElementDuLivre | null => parId.get(id) ?? (dessin ? dessin.parId(id) : (lib?.banniereParId(id) ?? null));
  const nomDe = (c: CaseDuLivre): string => (c === null ? NOM_DU_LIEU : (banniereDe(c)?.nom ?? "Cette bannière"));
  const nomEtRarete = (c: CaseDuLivre): string => {
    const banniere = c === null ? null : banniereDe(c);
    return banniere ? `${banniere.nom}, ${RARETES[banniere.rarete].nom.toLowerCase()}` : nomDe(c);
  };
  const absente = enVol !== undefined ? enVol : dresse;
  const vue = essai !== undefined ? essai : dresse;
  // À la boutique, le cartel suit la vignette survolée : son nom, sa rareté, son prix ou ce qu'elle est pour le compte.
  const auCartel: CaseDuLivre = enBoutique ? vue : dresse;
  const duCartel = auCartel === null ? null : banniereDe(auCartel);

  /** Tourne la page ; rend faux si elle ne peut pas tourner maintenant. */
  function tourner(sens: 1 | -1): boolean {
    if (pages.length < 2 || tourne.current || enCours.current) return false;
    setInvite(false);
    const el = grille.current;
    focusARendre.current = el !== null && el.contains(document.activeElement);
    const anime = el !== null && motionAllowed() && typeof el.animate === "function";
    const suite = (): void => {
      tourne.current = false;
      if (!vivant.current) return;
      const arrivee = pageVoisine(Math.min(pageVue.current, pages.length - 1), sens, pages.length);
      setPage(arrivee);
      setAnnonce(`Page ${arrivee + 1} sur ${pages.length}.`);
      if (el) el.style.transform = "";
      if (el && anime) el.animate([{ opacity: 0, transform: `translateX(${sens * 14}%)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.3,1)" });
    };
    if (!el || !anime) {
      suite();
      return true;
    }
    tourne.current = true;
    el.animate([{ opacity: 1 }, { opacity: 0, transform: `translateX(${-sens * 14}%)` }], { duration: 220, easing: "ease-in" }).finished.then(suite, suite);
    return true;
  }

  /** La vignette quitte sa case et vole jusqu'à la place du décor couché. */
  async function voler(id: string, bouton: HTMLElement, duree: number): Promise<void> {
    const livre = corps.current;
    const vignette = image(id);
    if (!livre || !vignette || typeof livre.animate !== "function") return;
    let x = 0;
    let y = 0;
    for (let e: HTMLElement | null = bouton; e && e !== livre; e = e.offsetParent instanceof HTMLElement ? e.offsetParent : null) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    const largeur = livre.offsetWidth;
    // Avec un autre dessin, l'image ne remplit pas forcément sa case : le vol part de l'image, au milieu de la case.
    const depart = dessin ? (bouton.querySelector("canvas")?.offsetWidth ?? bouton.offsetWidth) : bouton.offsetWidth;
    x += (bouton.offsetWidth - depart) / 2;
    const vol = volVersLeDecor({ largeur, hauteur: livre.offsetHeight }, { x, y, largeur: depart }, dessin?.place);
    if (!vol) return;
    const toile = document.createElement("canvas");
    toile.width = vignette.largeur;
    toile.height = vignette.hauteur;
    toile.className = "pixels livre-vol";
    toile.setAttribute("aria-hidden", "true");
    toile.style.left = `${x}px`;
    toile.style.top = `${y}px`;
    toile.style.width = `${depart}px`;
    vignette.peindre(toile);
    livre.append(toile);
    await toile
      .animate(
        [
          { transform: "translate3d(0,0,2px) rotate(0deg) scale(1)" },
          { transform: `translate3d(0,0,${largeur * 0.05}px) rotate(-6deg) scale(1.1)`, offset: 0.2 },
          { transform: `translate3d(${vol.dx * 0.5}px,${vol.dy * 0.5}px,${largeur * 0.2}px) rotate(5deg) scale(${(1 + vol.echelle) / 2})`, offset: 0.6 },
          { transform: `translate3d(${vol.dx}px,${vol.dy}px,3px) rotate(0deg) scale(${vol.echelle})` },
        ],
        { duration: duree, easing: "cubic-bezier(.45,.05,.35,1)" },
      )
      .finished.catch(() => undefined);
    toile.remove();
  }

  async function dresser(c: CaseDuLivre, bouton: HTMLElement): Promise<void> {
    if (enCours.current) {
      // À la boutique, la dernière bannière touchée pendant un vol se dresse ensuite : feuilleter ne perd aucun clic.
      if (enBoutique) suivante.current = { c, bouton };
      return;
    }
    if (c === dresseVu.current) return;
    enCours.current = true;
    setOccupe(true);
    setProbleme(null);
    setAnnonce(null);
    setEssai(undefined);
    setInvite(false);
    const anime = motionAllowed();
    // Le décor se couche pendant que le serveur répond.
    setLeve(false);
    setFete(false);
    const [issue] = await Promise.all([choisir(c), attendre(anime ? (enBoutique ? 320 : 700) : 0)]);
    if (!vivant.current) return;
    if (issue.ok) {
      if (anime && c !== null) {
        setEnVol(c);
        await voler(c, bouton, enBoutique ? 800 : 1300);
        if (!vivant.current) return;
      }
      setDresse(issue.valeur);
      dresseVu.current = issue.valeur;
      setEnVol(undefined);
      if (!enBoutique) setAnnonce(issue.valeur ? `« ${nomDe(issue.valeur)} » est sur /gaulois.` : "Sur /gaulois, votre Gaulois retrouve le décor de son lieu.");
    } else {
      setProbleme(issue.message);
      setDresse(actuelVu.current);
    }
    setLeve(true);
    await attendre(anime ? (enBoutique ? 150 : 350) : 0);
    enCours.current = false;
    if (!vivant.current) return;
    setFete(true);
    setOccupe(false);
    const apres = suivante.current;
    suivante.current = null;
    if (apres && apres.c !== dresseVu.current && apres.bouton.isConnected) void dresser(apres.c, apres.bouton);
  }

  // Le livre se penche un peu sous la souris.
  const pencher = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const livre = corps.current;
    if (!livre || e.pointerType === "touch" || !motionAllowed()) return;
    const cadre = e.currentTarget.getBoundingClientRect();
    livre.style.setProperty("--livre-rz", `${(((e.clientX - cadre.left) / cadre.width - 0.5) * -3.2).toFixed(2)}deg`);
    livre.style.setProperty("--livre-rx", `${(((e.clientY - cadre.top) / cadre.height - 0.5) * -3.6).toFixed(2)}deg`);
  };
  const redresser = (): void => {
    corps.current?.style.removeProperty("--livre-rz");
    corps.current?.style.removeProperty("--livre-rx");
  };

  // Glisser la page : elle suit le doigt, puis tourne si on l'a tirée assez loin.
  const prendre = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    vientDeGlisser.current = false;
    if (e.button === 0 && pages.length > 1 && !enCours.current && !tourne.current) geste.current = { x: e.clientX, glisse: false };
  };
  const tirer = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const g = geste.current;
    if (!g) return;
    // Plus aucun bouton enfoncé (un menu du clic droit a mangé le relâchement) : la page revient à sa place.
    if (e.buttons === 0) {
      geste.current = null;
      e.currentTarget.style.transform = "";
      return;
    }
    const dx = e.clientX - g.x;
    if (!g.glisse && Math.abs(dx) > 8) {
      g.glisse = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Sans capture, la page suit quand même tant que le pointeur reste dessus.
      }
    }
    if (g.glisse) e.currentTarget.style.transform = `translateX(${Math.max(-60, Math.min(60, dx * 0.5))}px)`;
  };
  const lacher = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const g = geste.current;
    if (!g) return;
    geste.current = null;
    vientDeGlisser.current = g.glisse;
    const sens = g.glisse ? sensDuGeste(e.clientX - g.x) : 0;
    if (sens === 0 || !tourner(sens)) e.currentTarget.style.transform = "";
  };
  // Le clic qui termine un glissement ne choisit rien.
  const retenirLeClic = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    if (!vientDeGlisser.current) return;
    vientDeGlisser.current = false;
    e.stopPropagation();
    e.preventDefault();
  };
  const auClavier = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowRight") tourner(1);
    else if (e.key === "ArrowLeft") tourner(-1);
  };

  const dessinDuGaulois = useMemo(() => casesDuGaulois(tenue), [tenue]);
  const essayer = (c: CaseDuLivre) => (e: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "touch" && !enCours.current) setEssai(c);
  };
  const finDEssai = (): void => setEssai(undefined);
  /** Sa propre carte de la vitrine, avec la bannière vue : la même carte que dans l'onglet « La vitrine ». */
  const maCarte = useMemo(() => [{ nom, tenue, moi: true, familier: familier?.id ?? null, banniere: vue }], [nom, tenue, familier, vue]);
  const enEssai = essai !== undefined && essai !== dresse;

  return (
    <div class="livre" data-testid="livre-bannieres" data-mode={mode} data-genre={dessin?.genre} aria-busy={occupe}>
      <div class="livre-vue" onPointerMove={pencher} onPointerLeave={redresser} onKeyDown={auClavier}>
        <div ref={corps} class={`livre-corps${leve ? " leve" : ""}${fete ? " fete" : ""}${enVol !== undefined ? " vol" : ""}`}>
          <div class="livre-haut" />
          <div class="livre-bas">
            <div ref={grille} class="livre-grille" role="group" aria-label={dessin ? dessin.label : enBoutique ? "Les bannières" : "Mes bannières"} onPointerDown={prendre} onPointerMove={tirer} onPointerUp={lacher} onPointerCancel={lacher} onClickCapture={retenirLeClic}>
              {(pages[page] ?? []).map((c) => (
                <button
                  key={c ?? "lieu"}
                  type="button"
                  class="livre-case"
                  data-vide={c === absente ? "" : undefined}
                  data-etat={c !== null && etatDe ? etatDe(c) : undefined}
                  data-testid="livre-case"
                  data-banniere={c ?? "lieu"}
                  aria-pressed={c === dresse}
                  aria-label={c !== null && motDe ? `${nomEtRarete(c)}, ${motDe(c)}` : nomEtRarete(c)}
                  title={c !== null && motDe ? `${nomDe(c)}, ${motDe(c)}` : nomDe(c)}
                  onClick={(e) => void dresser(c, e.currentTarget)}
                  onPointerEnter={essayer(c)}
                  onPointerLeave={finDEssai}
                  onFocus={() => {
                    if (!enCours.current) setEssai(c);
                  }}
                  onBlur={finDEssai}
                >
                  <Vignette image={image} id={c} />
                </button>
              ))}
            </div>
            <p class="livre-cartel" data-testid="livre-cartel">
              <b>{nomDe(auCartel)}</b>
              {duCartel && !(enBoutique && motDe) && (
                <span class="banniere-rarete" data-rarete={duCartel.rarete}>
                  <MarqueDeRarete rarete={duCartel.rarete} />
                </span>
              )}
              {enBoutique && motDe && auCartel !== null && <span class="livre-cartel-mot">{motDe(auCartel)}</span>}
            </p>
            {pages.length > 1 && (
              <>
                <div class="livre-points" aria-hidden="true">
                  {pages.map((_, k) => (
                    <i key={k} data-ici={k === page ? "" : undefined} />
                  ))}
                </div>
                <button type="button" class="livre-coin" data-cote="gauche" aria-label="Page précédente" onClick={() => tourner(-1)} data-testid="livre-coin-gauche">
                  <span />
                </button>
                <button type="button" class="livre-coin" data-cote="droite" data-invite={invite ? "" : undefined} aria-label="Page suivante" onClick={() => tourner(1)} data-testid="livre-coin-droite">
                  <span />
                </button>
              </>
            )}
          </div>
          <span class="livre-ombre" />
          <span class="livre-eventail" />
          <div class="livre-decor" data-testid="livre-decor" data-banniere={dresse ?? "lieu"}>
            <div class="livre-decor-in">{dessin ? dessin.decor(dresse) : <Vignette image={image} id={dresse} />}</div>
          </div>
          <span class="livre-fanion" data-cote="gauche" />
          <span class="livre-fanion" data-cote="droite" />
          {/* Avec un autre dessin, le décor dressé porte déjà le Gaulois (la carte). */}
          {!dessin && (
            <div class="livre-gaulois">
              <Toile largeur={GAULOIS_LARGEUR} hauteur={GAULOIS_HAUTEUR} cases={dessinDuGaulois} class="livre-gaulois-dessin" />
            </div>
          )}
        </div>
      </div>
      {!enBoutique && lib && (
      <div class="livre-apercus" data-essai={enEssai ? "" : undefined}>
        <p class="livre-apercus-titre" data-testid="livre-apercu-nom">
          {enEssai ? `Essai : « ${nomDe(vue)} »` : nomDe(vue)}
        </p>
        <figure class="livre-apercu">
          <figcaption>Sur /gaulois</figcaption>
          <ApercuDeGaulois lib={lib} banniere={vue === null ? null : (parId.get(vue) ?? null)} tenue={tenue} familier={familier} />
        </figure>
        <figure class="livre-apercu" data-testid="livre-apercu-fiche">
          <figcaption>Sur ma fiche</figcaption>
          {vue === null ? (
            <p class="livre-apercu-lieu">Pas de bannière sur votre fiche.</p>
          ) : (
            <div class="fiche-banniere">
              <Vignette image={image} id={vue} />
              <RefletDeBloc finition={finition} />
              <span class="fiche-banniere-titre">Ses parties sous le tag</span>
            </div>
          )}
          <p class="livre-apercu-note">À la prochaine mise à jour du site, si votre pseudo est public.</p>
        </figure>
        <figure class="livre-apercu" data-testid="livre-apercu-carte">
          <figcaption>Ma carte</figcaption>
          <CarteAnimee finition={finition} tenue={tenue} fond={vue ? `--banniere:url("${basePath()}/bannieres/${vue}.png")` : undefined} classe="livre-apercu-carte" familier={familier} />
          <p class="livre-apercu-note">Sur ma fiche, et en haut de l'accueil si je suis sur le podium de la semaine.</p>
        </figure>
        <figure class="livre-apercu">
          <figcaption>Dans la vitrine</figcaption>
          <CartesDeLaVitrine gaulois={maCarte} testid="livre-apercu-vitrine" label="Ma carte de la vitrine" />
        </figure>
      </div>
      )}
      {enBoutique && dessin && apercus && (
        <div class="livre-apercus" data-essai={enEssai ? "" : undefined}>
          <p class="livre-apercus-titre" data-testid="livre-apercu-nom">
            {enEssai ? `Essai : « ${nomDe(vue)} »` : nomDe(vue)}
          </p>
          {apercus(vue)}
        </div>
      )}
      <Problem message={probleme} />
      <p class="sr-only" role="status" data-testid="banniere-annonce">
        {annonce}
      </p>
    </div>
  );
}
