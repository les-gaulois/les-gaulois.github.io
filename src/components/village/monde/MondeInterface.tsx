import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { clan } from "../../../../config/clan";
import { basePath } from "../../../lib/compte/api";
import type { Decor } from "../../../lib/village/decor";
import { ICONES_DES_FENETRES, ICONES_DES_QUARTIERS } from "../../../lib/village/monde/icones";
import type { Plan, QuartierId } from "../../../lib/village/monde/plan";
import { FENETRES_DU_MONDE, type FenetreDuMonde } from "../../../lib/village/monde/textes";
import type { Habitant, Lieu } from "../../../lib/village/vie";
import { Toile } from "../PlaceToile";
import type { CameraDuMonde } from "./camera-du-monde";

/**
 * Ce qui se pose sur le monde du village sans le suivre : le titre de la page, la petite carte d'ensemble, la rangée
 * d'icônes qui ouvre les fenêtres, les fenêtres elles-mêmes, et la ligne discrète qui garde le code source, les mentions
 * légales et la mention d'OpenFront (la page ne défile plus, son pied de page est caché). Tout porte `data-monde-ui` :
 * la scène n'y prend ni le glissement ni la molette. Même famille que les fenêtres de la Carte, au style du site.
 */

/**
 * Où est le Gaulois du membre dans le monde (`null` : il n'est pas au village) : les Gaulois le disent à chaque pas, la
 * caméra peut aller à lui.
 */
export class RepereDuMoi {
  point: { x: number; y: number } | null = null;
  poser(point: { x: number; y: number } | null): void {
    this.point = point === null ? null : { x: Math.round(point.x), y: Math.round(point.y) };
  }
}

/** Le titre de la page : les onglets de la rubrique, posés sur le ciel, le montrent déjà (« Le village »). */
export function MondeTete() {
  return <h1 class="sr-only monde-titre">Le village</h1>;
}

/**
 * La petite carte d'ensemble : un bouton par quartier du monde (son icône, le nombre de Gaulois des lieux de vie), dans
 * l'ordre où on les trouve : la grand-rue d'ouest en est, puis le bas (la gare, l'usine, le port). Un clic y mène : la
 * caméra glisse lentement. Le quartier où l'on est porte le fond clair, et son nom s'écrit dessous.
 */
/**
 * Le quartier où l'on est : celui dont la vue (là où la caméra irait si on cliquait son bouton) est la plus proche de ce
 * que l'écran montre. Sur un grand écran qui voit la grand-rue et le bas à la fois, deux quartiers l'un sous l'autre ont
 * la même vue : le premier de la liste l'emporte, sauf si l'on vient de demander l'autre (`voulu`).
 */
function quartierDeLaVue(plan: Plan, camera: CameraDuMonde, voulu: QuartierId | null): QuartierId {
  let choisi = plan.quartiers[0]!.id;
  let ecart = Infinity;
  for (const q of plan.quartiers) {
    const [x, y] = camera.ouIrait(q.vue, q.vueY);
    const d = Math.hypot(x - camera.milieu, y - camera.milieuY) - (q.id === voulu ? 1 : 0);
    if (d < ecart) {
      ecart = d;
      choisi = q.id;
    }
  }
  return choisi;
}

export function MondeCarte({ plan, camera, comptes }: { plan: Plan; camera: CameraDuMonde; comptes: Record<Lieu, number> | null }) {
  const voulu = useRef<QuartierId | null>(null);
  const [ici, setIci] = useState<QuartierId>(() => quartierDeLaVue(plan, camera, null));

  useLayoutEffect(() => {
    const placer = () => {
      const quartier = quartierDeLaVue(plan, camera, voulu.current);
      setIci((avant) => (avant === quartier ? avant : quartier));
    };
    placer();
    return camera.ecouter(placer);
  }, [camera, plan]);

  return (
    <nav class="monde-carte" aria-label="Aller à un quartier du village" data-monde-ui data-testid="monde-carte">
      <div class="monde-carte-bande">
        {plan.quartiers.map((quartier) => {
          const icone = ICONES_DES_QUARTIERS[quartier.id];
          const nombre = comptes && quartier.lieu ? comptes[quartier.lieu] : null;
          return (
            <button key={quartier.id} type="button" class="monde-carte-quartier" data-quartier={quartier.id} aria-current={ici === quartier.id ? "true" : undefined} title={quartier.nom} onClick={() => {
              voulu.current = quartier.id;
              camera.aller(quartier.vue, quartier.vueY);
              setIci(quartierDeLaVue(plan, camera, quartier.id));
            }}>
              <Toile largeur={icone.largeur} hauteur={icone.hauteur} cases={icone.cases} echelle={2} class="monde-carte-icone" />
              <span class="monde-carte-nom">{quartier.nom}</span>
              {nombre !== null && nombre > 0 && (
                <span class="monde-carte-compte">
                  <span class="sr-only"> : </span>
                  {nombre}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * La rangée d'icônes : une entrée par fenêtre. En rail à gauche sur un écran large, en rangée du bas sur un téléphone.
 * `ouverte` : la fenêtre ouverte, qui peut être celle d'un intérieur (aucune icône n'est alors ouverte).
 */
export function MondeDock({ ouverte, onChoisir, membre }: { ouverte: string | null; onChoisir: (id: FenetreDuMonde) => void; membre: boolean }) {
  return (
    <nav class="monde-dock" aria-label="Les fenêtres du village" data-monde-ui data-testid="monde-dock">
      <ul>
        {FENETRES_DU_MONDE.filter((f) => membre || !f.compte).map((f) => {
          const icone = ICONES_DES_FENETRES[f.id];
          return (
            <li key={f.id}>
              <button type="button" class="monde-dock-entree" id={`monde-entree-${f.id}`} aria-expanded={ouverte === f.id} aria-controls={`monde-fenetre-${f.id}`} data-testid={`monde-entree-${f.id}`} onClick={() => onChoisir(f.id)}>
                <Toile largeur={icone.largeur} hauteur={icone.hauteur} cases={icone.cases} echelle={3} class="monde-dock-icone" />
                <span class="monde-dock-nom">{f.court}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Une fenêtre posée sur le monde : une barre (son icône, son titre, le bouton qui la ferme), puis son contenu, qui défile
 * dans son cadre. À droite sur un écran large ; un panneau qui monte du bas sur un téléphone. Elle garde son contenu une
 * fois ouverte : la rouvrir ne perd rien.
 */
export function MondeFenetre({ id, ouverte, onFermer, children }: { id: FenetreDuMonde; ouverte: boolean; onFermer: () => void; children: ComponentChildren }) {
  const fenetre = FENETRES_DU_MONDE.find((f) => f.id === id)!;
  return (
    <CadreDeFenetre id={id} titre={fenetre.titre} icone={ICONES_DES_FENETRES[id]} grande={fenetre.grande} ouverte={ouverte} onFermer={onFermer}>
      {children}
    </CadreDeFenetre>
  );
}

/**
 * Le cadre de toute fenêtre du monde, celles de la rangée d'icônes comme celle d'un intérieur : la barre (l'icône, le
 * titre, le bouton qui ferme) et le corps. `sorte` et `interieur` se lisent dans la page (`data-sorte`, `data-interieur`).
 */
export function CadreDeFenetre({ id, titre, icone, grande = false, sorte, interieur, ouverte, onFermer, children }: { id: string; titre: string; icone: Decor; grande?: boolean; sorte?: string; interieur?: string; ouverte: boolean; onFermer: () => void; children: ComponentChildren }) {
  const cadre = useRef<HTMLElement>(null);
  const dejaOuverte = useRef(false);
  // À l'ouverture, la fenêtre prend le focus : le clavier et les lecteurs d'écran y sont. Tout de suite après l'affichage
  // (et non plus tard) : Échap pressée aussitôt rend le focus à l'icône, sans qu'il revienne ensuite à une fenêtre fermée.
  useLayoutEffect(() => {
    if (ouverte && !dejaOuverte.current) cadre.current?.focus({ preventScroll: true });
    dejaOuverte.current = ouverte;
  }, [ouverte]);
  return (
    <section ref={cadre} id={`monde-fenetre-${id}`} class="monde-fenetre" data-grande={grande ? "" : undefined} data-sorte={sorte} data-interieur={interieur} hidden={!ouverte} aria-labelledby={`monde-fenetre-${id}-titre`} tabIndex={-1} data-monde-ui data-testid={`monde-fenetre-${id}`}>
      <header class="monde-fenetre-barre">
        <Toile largeur={icone.largeur} hauteur={icone.hauteur} cases={icone.cases} echelle={2} class="monde-fenetre-icone" />
        <h2 id={`monde-fenetre-${id}-titre`} class="monde-fenetre-titre">
          {titre}
        </h2>
        <button type="button" class="monde-fermer" aria-label={`Fermer la fenêtre ${titre}`} data-testid="monde-fermer" onClick={onFermer}>
          <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M2 1 1 2l4 4-4 4 1 1 4-4 4 4 1-1-4-4 4-4-1-1-4 4z" fill="currentColor" />
          </svg>
        </button>
      </header>
      <div class="monde-fenetre-corps">{children}</div>
    </section>
  );
}

/** La ligne que le pied de page du site ne montre plus ici : le code source, les mentions légales, la mention d'OpenFront. */
export function MondeCredit() {
  const base = basePath();
  return (
    <p class="monde-credit" data-monde-ui data-testid="monde-credit">
      <a href={clan.links.source} rel="noopener">
        Code source
      </a>
      <a href={`${base}/mentions-legales`}>Mentions légales</a>
      <a href={`${base}/mentions-legales#credits`}>© OpenFront and Contributors</a>
    </p>
  );
}

/** Le compte des Gaulois de chaque lieu, pour la petite carte. */
export function comptesDesLieux(lieux: Record<Lieu, Habitant[]>): Record<Lieu, number> {
  return { place: lieux.place.length, taverne: lieux.taverne.length, reunion: lieux.reunion.length, bataille: lieux.bataille.length, maisons: lieux.maisons.length };
}
