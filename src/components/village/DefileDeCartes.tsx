import type { ComponentChildren, JSX } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { motionAllowed } from "../../lib/fx/motion";
import { RARETES, type Rarete } from "../../lib/gaulois";
import { jouer, type NomDeSon } from "../../lib/jeu/sons";
import { nombre } from "../../lib/village/ecran-boutique";
import { ancresDuDefile, arretDuGlissement, pasDuRessort, placeDansLeDefile, posDuGlissement, sensDuGeste, toucheDuDefile, type MesuresDuDefile } from "../../lib/village/defile";
import { Prix } from "./BoutiquePixels";
import { IconeDeRarete } from "./IconeDeRarete";

/**
 * Le défilé des cartes (22 novembre 2026), à la place du livre des bannières : demande du pilote, « au lieu que ça soit un
 * livre, ça affiche les cartes en gros qui défilent de gauche à droite », pour les bannières, les finitions de la carte et
 * les cadres, à la boutique et au vestiaire. Maquette de Claude Fable 5.2 ; choix faits par Claude à la demande du pilote
 * (« Choisis pour moi ») : la lumière holographique sur le cadre seul, la carte du membre sur la table marine, le vestiaire
 * avec ce qui est possédé.
 *
 * La carte du milieu en grand, ses voisines aux trois quarts, les suivantes à la moitié (calculs purs dans
 * `src/lib/village/defile.ts`). Tout est dans la carte : le nom, la rareté, le prix ou ce qu'elle est pour le compte, la
 * marque « portée ». Ce qu'on en fait (acheter, porter) est sous la bande, posé par la page (`children`). On passe d'une
 * carte à l'autre en glissant (doigt ou souris, avec élan), en touchant une voisine, par les flèches de l'écran, par celles
 * du clavier (Début, Fin, pages de trois), ou par la molette de côté. Avec le bouton pause ou « réduire les animations »,
 * la carte change sans glisser. Un petit bruit du jeu quand une carte part vers le milieu (`tic`), un autre aux flèches
 * (`clic`), seulement dans l'écran du jeu et si le son du jeu est voulu.
 *
 * Accessibilité : la bande est une liste à choix unique (`listbox`, une `option` par carte, `aria-activedescendant`), un
 * seul arrêt de tabulation ; les flèches de l'écran sont de vrais boutons. Les images sont décoratives : la carte se lit par
 * son nom, sa rareté et ce qu'elle dit. Classes `dc-…` (24-cartes.css).
 */

/** Ce que la carte dit d'elle-même : son nom, sa rareté, son prix ou un mot, et la marque de ce qui est porté. */
export interface CarteDuDefile {
  id: string;
  nom: string;
  rarete: Rarete;
  /** Le prix à la boutique, en statères ; `null` : la carte dit `mot` à la place. */
  prix: number | null;
  /** Ce qu'elle est pour le compte, au pied de la carte : « À vous », « Du booster »… */
  mot: string | null;
  /** La marque de tête quand elle est portée (« Sur /gaulois », « Sur ma carte ») ; `null` : rien. */
  marque: string | null;
}

/** La forme des images : une bannière en paysage, la carte du membre avec sa finition, ou avec son cadre autour. */
export type FormeDuDefile = "banniere" | "finition" | "cadre";

/** Combien de cartes de part et d'autre du milieu ont leur image dessinée : les autres sont hors de la bande. */
const PORTEE = 3;

/** Un petit bruit du jeu, seulement dans l'écran du jeu (« Mon compte » garde la page d'avant, sans rien du jeu). */
export function bruitDuJeu(nom: NomDeSon, retard = 0): void {
  if (document.documentElement.getAttribute("data-ecran") === "jeu") jouer(nom, retard);
}

/** Ce qu'une carte dit aux lecteurs d'écran. */
function motsDeLaCarte(c: CarteDuDefile): string {
  const pied = c.prix !== null ? `${nombre(c.prix)} statères` : (c.mot ?? "");
  return [c.nom, RARETES[c.rarete].nom.toLowerCase(), pied.toLowerCase(), c.marque?.toLowerCase()].filter(Boolean).join(", ");
}

/**
 * Le pied d'une carte du défilé posée dans la carte des cosmétiques (`carte`) : sa rareté, sa marque (« Sur ma carte »), son
 * prix ou ce qu'elle est pour le compte (« À vous »).
 */
export function piedDuDefile(c: CarteDuDefile): readonly [ComponentChildren, ComponentChildren, ComponentChildren] {
  return [
    <>
      <IconeDeRarete rarete={c.rarete} />
      {RARETES[c.rarete].nom}
    </>,
    c.marque ?? "",
    c.prix !== null ? <Prix montant={c.prix} class="dc-prix" /> : (c.mot ?? ""),
  ];
}

export function DefileDeCartes({
  cartes,
  choisie,
  onChoisir,
  forme,
  label,
  carte,
  children,
  testid,
}: {
  cartes: readonly CarteDuDefile[];
  /** La carte au milieu ; la première si elle n'est pas dans la liste. */
  choisie: string | null;
  /** Une autre carte arrive au milieu par un geste du membre. */
  onChoisir: (id: string) => void;
  forme: FormeDuDefile;
  /** Le nom de la liste, pour les lecteurs d'écran (« Les bannières »). */
  label: string;
  /**
   * La carte, celle des cosmétiques (`CarteDeCosmetique.tsx`, modèle unique du 28 novembre 2026) ; `milieu` : c'est la
   * carte du milieu. Elle ne se pose que près du milieu.
   */
  carte: (c: CarteDuDefile, milieu: boolean) => ComponentChildren;
  /** Sous la bande : la fiche et les actions de la carte du milieu. */
  children?: ComponentChildren;
  testid: string;
}) {
  const n = cartes.length;
  const indexChoisi = Math.max(0, cartes.findIndex((c) => c.id === choisie));
  const [cible, setCible] = useState(indexChoisi);
  const piste = useRef<HTMLDivElement>(null);
  const elements = useRef<(HTMLDivElement | null)[]>([]);
  const mesures = useRef<MesuresDuDefile | null>(null);
  const pos = useRef(indexChoisi);
  const vitesse = useRef(0);
  const cibleVue = useRef(indexChoisi);
  const animation = useRef(0);
  const avant = useRef(0);
  const glisse = useRef<{ pret: boolean; actif: boolean; x0: number; pos0: number; x: number; t: number; v: number; id: number } | null>(null);
  const [glisseActif, setGlisseActif] = useState(false);
  // Les identifiants des cartes, pour `aria-activedescendant` : uniques dans la page.
  const base = useId();
  const idDe = (i: number): string => `${base}-${i}`;

  /** Pose chaque carte à sa place pour la position du moment. */
  const poser = (): void => {
    const m = mesures.current;
    if (!m) return;
    const auRepos = pos.current === cibleVue.current;
    elements.current.forEach((el, i) => {
      if (!el) return;
      const p = placeDansLeDefile(i, pos.current, m, auRepos);
      // La carte choisie n'est jamais cachée, même loin pendant le mouvement : un lecteur d'écran l'annonce tout de suite.
      el.style.visibility = p.cachee && i !== cibleVue.current ? "hidden" : "";
      el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${p.echelle.toFixed(4)})`;
      el.style.zIndex = String(p.z);
      el.style.opacity = p.opacite < 1 ? p.opacite.toFixed(3) : "";
    });
  };

  /** Mesure la bande et ses cartes : la plus grande, l'air autour, les ancres. */
  const mesurer = (): void => {
    const bande = piste.current;
    const premiere = elements.current.find((el) => el);
    if (!bande || !premiere) return;
    for (const el of elements.current) if (el) el.style.minHeight = "";
    const largeur = premiere.offsetWidth;
    const hauteur = Math.max(...elements.current.map((el) => el?.offsetHeight ?? 0));
    for (const el of elements.current) if (el) el.style.minHeight = `${hauteur}px`;
    const ecart = parseFloat(getComputedStyle(bande).getPropertyValue("--dc-ecart")) || 16;
    const marge = largeur < 300 ? 22 : 30;
    bande.style.height = `${hauteur + 2 * marge}px`;
    mesures.current = { largeur, hauteur, marge, bande: bande.clientWidth, ancres: ancresDuDefile(largeur, ecart, n) };
    poser();
  };

  const mesurerVu = useRef(mesurer);
  mesurerVu.current = mesurer;

  /** Le mouvement : un ressort sans rebond vers la carte choisie, image par image. */
  const tourner = (maintenant: number): void => {
    animation.current = 0;
    const dt = Math.min(0.05, (maintenant - avant.current) / 1000 || 0.016);
    avant.current = maintenant;
    if (glisse.current?.actif || pos.current === cibleVue.current) return;
    const pas = pasDuRessort(pos.current, vitesse.current, cibleVue.current, dt);
    pos.current = pas.pos;
    vitesse.current = pas.vitesse;
    poser();
    if (!pas.posee) animation.current = requestAnimationFrame(tourner);
  };
  const lancer = (): void => {
    if (animation.current) return;
    avant.current = performance.now();
    animation.current = requestAnimationFrame(tourner);
  };

  /** Amène la carte `i` au milieu ; `parLeMembre` : un geste, qui le dit à la page. */
  const aller = (i: number, parLeMembre: boolean): void => {
    if (n === 0) return;
    const k = Math.max(0, Math.min(n - 1, i));
    const change = k !== cibleVue.current;
    cibleVue.current = k;
    setCible(k);
    if (!motionAllowed()) {
      pos.current = k;
      vitesse.current = 0;
      poser();
    } else lancer();
    if (change && parLeMembre) {
      bruitDuJeu("tic");
      onChoisir(cartes[k]!.id);
    }
  };

  // La carte choisie par la page (une rareté filtrée, une bannière reçue) : la bande y va ; si elle n'est pas dans la liste,
  // la fiche de la page suit la carte du milieu, pour que l'une et l'autre montrent toujours la même chose.
  const absente = n > 0 && !cartes.some((c) => c.id === choisie);
  useEffect(() => {
    if (indexChoisi !== cibleVue.current) aller(indexChoisi, false);
    const milieu = cartes[cibleVue.current];
    if (absente && milieu) onChoisir(milieu.id);
  }, [indexChoisi, absente]);
  // La liste change : on se pose sans glisser, et on remesure.
  const cleDesCartes = cartes.map((c) => c.id).join("|");
  useLayoutEffect(() => {
    elements.current.length = n;
    cibleVue.current = Math.min(indexChoisi, Math.max(0, n - 1));
    setCible(cibleVue.current);
    pos.current = cibleVue.current;
    vitesse.current = 0;
    mesurer();
  }, [cleDesCartes]);
  // La bande change de largeur (l'écran tourne, un panneau s'ouvre) : on remesure. L'observateur démarre avec la première carte.
  const avecCartes = n > 0;
  useEffect(() => {
    const bande = piste.current;
    if (!bande || typeof ResizeObserver !== "function") return;
    const o = new ResizeObserver(() => mesurerVu.current());
    o.observe(bande);
    return () => o.disconnect();
  }, [avecCartes]);
  useEffect(
    () => () => {
      cancelAnimationFrame(animation.current);
      animation.current = 0;
    },
    [],
  );

  /* ---------- Les gestes ---------- */
  const auClavier = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    const k = toucheDuDefile(e.key, cibleVue.current, n);
    if (k === null) return;
    e.preventDefault();
    aller(k, true);
  };
  const prendre = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || !mesures.current) return;
    glisse.current = { pret: true, actif: false, x0: e.clientX, pos0: pos.current, x: e.clientX, t: e.timeStamp, v: 0, id: e.pointerId };
  };
  const tirer = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const g = glisse.current;
    const m = mesures.current;
    if (!g?.pret || e.pointerId !== g.id || !m) return;
    // Plus aucun bouton enfoncé (un menu du clic droit a mangé le relâchement) : la bande revient à sa carte.
    if (e.buttons === 0) {
      glisse.current = null;
      setGlisseActif(false);
      aller(cibleVue.current, false);
      return;
    }
    const dx = e.clientX - g.x0;
    if (!g.actif && Math.abs(dx) > 6) {
      g.actif = true;
      setGlisseActif(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Sans capture, la bande suit quand même tant que le pointeur reste dessus.
      }
    }
    if (!g.actif) return;
    const dt = Math.max(1, e.timeStamp - g.t);
    g.v = 0.6 * g.v + 0.4 * ((e.clientX - g.x) / dt);
    g.x = e.clientX;
    g.t = e.timeStamp;
    if (!motionAllowed()) return;
    pos.current = posDuGlissement(g.pos0, dx, m.ancres[1] ?? 1, n);
    poser();
  };
  const lacher = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const g = glisse.current;
    const m = mesures.current;
    if (!g?.pret || e.pointerId !== g.id || !m) return;
    glisse.current = null;
    const dx = e.clientX - g.x0;
    if (!g.actif) {
      // Un simple appui sur une voisine l'amène au milieu.
      if (e.type !== "pointerup") return;
      const carte = (e.target as Element | null)?.closest?.("[data-dc-index]");
      const i = carte ? Number(carte.getAttribute("data-dc-index")) : -1;
      if (i >= 0 && i !== cibleVue.current) aller(i, true);
      return;
    }
    setGlisseActif(false);
    if (!motionAllowed()) {
      aller(cibleVue.current + sensDuGeste(dx), true);
      return;
    }
    vitesse.current = (-g.v * 1000) / (m.ancres[1] ?? 1);
    // Même revenue à sa carte, la bande y est ramenée par le ressort (`aller` le relance).
    aller(arretDuGlissement(pos.current, g.v, m.ancres[1] ?? 1, n), true);
  };
  // La molette de côté (pavé tactile, Maj et molette) ; la molette de haut en bas reste à la page.
  const roule = useRef({ cumul: 0, dernier: 0 });
  useEffect(() => {
    const bande = piste.current;
    if (!bande) return;
    const molette = (e: WheelEvent): void => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const r = roule.current;
      r.cumul += e.deltaX;
      if (Math.abs(r.cumul) > 50 && e.timeStamp - r.dernier > 160) {
        aller(cibleVue.current + Math.sign(r.cumul), true);
        r.cumul = 0;
        r.dernier = e.timeStamp;
      }
    };
    bande.addEventListener("wheel", molette, { passive: false });
    return () => bande.removeEventListener("wheel", molette);
  });

  /** Une flèche de l'écran ; au bout de la liste, elle reste un bouton (le focus ne se perd pas) mais ne fait rien. */
  const fleche = (sens: 1 | -1): void => {
    const k = cibleVue.current + sens;
    if (k < 0 || k > n - 1) return;
    bruitDuJeu("clic");
    aller(k, true);
  };

  if (n === 0) return null;
  return (
    <div class="dc-defile" data-forme={forme} data-testid={testid}>
      <div class="dc-bande">
        <button type="button" class="dc-fleche" data-sens="-1" aria-label="Carte précédente" aria-disabled={cible <= 0} onClick={() => fleche(-1)} data-testid="defile-precedente">
          <svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">
            <path fill="currentColor" d="M6 0h2v2H6zM4 2h2v2H4zM2 4h2v2H2zM4 6h2v2H4zM6 8h2v2H6z" />
          </svg>
        </button>
        <div
          ref={piste}
          class={`dc-piste${glisseActif ? " dc-glisse" : ""}`}
          role="listbox"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={`${label}, une carte à la fois`}
          aria-activedescendant={idDe(cible)}
          onKeyDown={auClavier}
          onPointerDown={prendre}
          onPointerMove={tirer}
          onPointerUp={lacher}
          onPointerCancel={lacher}
          data-testid="defile-piste"
        >
          <span class="dc-socle" aria-hidden="true" />
          {cartes.map((c, i) => {
            const proche = Math.abs(i - cible) <= PORTEE;
            return (
              <div
                key={c.id}
                ref={(el) => {
                  elements.current[i] = el;
                }}
                id={idDe(i)}
                class="dc-carte dc-unique"
                role="option"
                aria-selected={i === cible}
                aria-setsize={n}
                aria-posinset={i + 1}
                aria-label={motsDeLaCarte(c)}
                data-rarete={c.rarete}
                data-dc-index={i}
                data-id={c.id}
                data-testid="defile-carte"
              >
                {proche && carte(c, i === cible && !glisseActif)}
              </div>
            );
          })}
        </div>
        <button type="button" class="dc-fleche" data-sens="1" aria-label="Carte suivante" aria-disabled={cible >= n - 1} onClick={() => fleche(1)} data-testid="defile-suivante">
          <svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">
            <path fill="currentColor" d="M2 0h2v2H2zM4 2h2v2H4zM6 4h2v2H6zM4 6h2v2H4zM2 8h2v2H2z" />
          </svg>
        </button>
      </div>
      <p class="dc-compte tnum" aria-hidden="true">
        {cible + 1} sur {n}
      </p>
      {children}
    </div>
  );
}
