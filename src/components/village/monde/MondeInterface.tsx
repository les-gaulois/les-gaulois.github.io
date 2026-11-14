import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { clan } from "../../../../config/clan";
import { basePath } from "../../../lib/compte/api";
import { ICONES_DES_FENETRES, ICONES_DES_QUARTIERS } from "../../../lib/village/monde/icones";
import { type Plan, type QuartierId, quartierDe } from "../../../lib/village/monde/plan";
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

/** Le titre de la page : les onglets de la rubrique, posés sur le ciel, le montrent déjà (« Le village »). */
export function MondeTete() {
  return <h1 class="sr-only monde-titre">Le village</h1>;
}

/**
 * La petite carte d'ensemble : le panorama en une bande, un bouton par quartier (son icône, son nom quand la place le
 * permet, le nombre de Gaulois des lieux de vie), et un cadre qui montre ce que l'écran voit. Un clic y mène : la caméra
 * glisse lentement. Le triangle blanc marque le Gaulois du membre.
 */
export function MondeCarte({ plan, camera, comptes, moi }: { plan: Plan; camera: CameraDuMonde; comptes: Record<Lieu, number> | null; moi: { current: number | null } }) {
  const vue = useRef<HTMLSpanElement>(null);
  const marque = useRef<HTMLSpanElement>(null);
  const [ici, setIci] = useState<QuartierId>(() => quartierDe(plan, camera.milieu).id);

  useLayoutEffect(() => {
    const placer = () => {
      if (vue.current) {
        vue.current.style.left = `${(camera.x / plan.largeur) * 100}%`;
        vue.current.style.width = `${Math.min(100, (camera.vue / plan.largeur) * 100)}%`;
      }
      const quartier = quartierDe(plan, camera.milieu).id;
      setIci((avant) => (avant === quartier ? avant : quartier));
    };
    placer();
    return camera.ecouter(placer);
  }, [camera, plan]);

  // Le repère du Gaulois du membre : relu deux fois par seconde, il marche lentement.
  useEffect(() => {
    const placer = () => {
      const el = marque.current;
      if (!el) return;
      el.hidden = moi.current === null;
      if (moi.current !== null) el.style.left = `${(moi.current / plan.largeur) * 100}%`;
    };
    placer();
    const minuterie = window.setInterval(placer, 500);
    return () => window.clearInterval(minuterie);
  }, [plan, moi]);

  return (
    <nav class="monde-carte" aria-label="Aller à un quartier du village" data-monde-ui data-testid="monde-carte">
      <div class="monde-carte-bande">
        {plan.quartiers.map((quartier) => {
          const icone = ICONES_DES_QUARTIERS[quartier.id];
          const nombre = comptes && quartier.lieu ? comptes[quartier.lieu] : null;
          return (
            <button
              key={quartier.id}
              type="button"
              class="monde-carte-quartier"
              data-quartier={quartier.id}
              aria-current={ici === quartier.id ? "true" : undefined}
              title={quartier.nom}
              style={{ "--monde-q-x": `${(quartier.x / plan.largeur) * 100}%`, "--monde-q-l": `${(quartier.largeur / plan.largeur) * 100}%` }}
              onClick={() => camera.aller(quartier.vue)}
            >
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
        <span ref={vue} class="monde-carte-vue" aria-hidden="true" />
        <span ref={marque} class="monde-carte-moi" aria-hidden="true" hidden />
      </div>
    </nav>
  );
}

/** La rangée d'icônes : une entrée par fenêtre. En rail à gauche sur un écran large, en rangée du bas sur un téléphone. */
export function MondeDock({ ouverte, onChoisir, membre }: { ouverte: FenetreDuMonde | null; onChoisir: (id: FenetreDuMonde) => void; membre: boolean }) {
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
  const icone = ICONES_DES_FENETRES[id];
  const cadre = useRef<HTMLElement>(null);
  const dejaOuverte = useRef(false);
  // À l'ouverture, la fenêtre prend le focus : le clavier et les lecteurs d'écran y sont.
  useEffect(() => {
    if (ouverte && !dejaOuverte.current) cadre.current?.focus({ preventScroll: true });
    dejaOuverte.current = ouverte;
  }, [ouverte]);
  return (
    <section ref={cadre} id={`monde-fenetre-${id}`} class="monde-fenetre" data-grande={fenetre.grande ? "" : undefined} hidden={!ouverte} aria-labelledby={`monde-fenetre-${id}-titre`} tabIndex={-1} data-monde-ui data-testid={`monde-fenetre-${id}`}>
      <header class="monde-fenetre-barre">
        <Toile largeur={icone.largeur} hauteur={icone.hauteur} cases={icone.cases} echelle={2} class="monde-fenetre-icone" />
        <h2 id={`monde-fenetre-${id}-titre`} class="monde-fenetre-titre">
          {fenetre.titre}
        </h2>
        <button type="button" class="monde-fermer" aria-label={`Fermer la fenêtre ${fenetre.titre}`} data-testid="monde-fermer" onClick={onFermer}>
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
