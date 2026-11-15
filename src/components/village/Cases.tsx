import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import type { Objet, Tenue, Vignette } from "../../lib/gaulois";
import { tabKeyTarget } from "../../lib/onglets";
import { exemplaires } from "../../lib/village/ecran-boutique";
import { decrireLApercu, tailleDeLApercu } from "../../lib/village/ecran-familiers";
import { motsDeLaPlaque } from "../../lib/village/ecran-forge";
import { apercuAvecFamilier, type Familier } from "../../lib/village/familiers";
import { echelleEntiere } from "../../lib/village/vestiaire-rayons";
import { MarqueDeRarete, PetitePlaque, Pixels, Prix, peindre } from "./BoutiquePixels";

/**
 * Les pièces que partagent le vestiaire de « Mon Gaulois » (`/village`) et son onglet « La boutique » (`#boutique`) : le
 * Gaulois dessiné, la case d'un objet et la barre des rayons. Sorties de `Vestiaire.tsx` le 15 novembre 2026, quand la
 * boutique a pris sa propre page : rien n'y a changé d'apparence.
 */

/**
 * Le Gaulois dessiné case par case, agrandi sans flou par la feuille de style. Son texte de remplacement le décrit. Avec le
 * familier qu'il montre (15 novembre 2026), une seule grille : le Gaulois à gauche, le familier à droite, les pieds sur la
 * même rangée. La grille s'élargit : la feuille de style lit sa largeur en cases (`--cases`) et sa taille
 * (`data-familier`, « petit » ou « large »), et réduit la case d'un nombre entier de pixels quand il le faut. La scène qui
 * porte l'aperçu reçoit la même taille (`tailleDeLApercu`), pour se ranger autrement sur téléphone.
 */
export function ApercuGaulois({ tenue, familier = null, class: classe = "" }: { tenue: Tenue; familier?: Familier | null; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const grille = useMemo(() => apercuAvecFamilier(tenue, familier), [tenue, familier]);
  useEffect(() => peindre(toile.current, grille.largeur, grille.hauteur, grille.cases), [grille]);
  const taille = tailleDeLApercu(familier);
  return (
    <canvas
      ref={toile}
      width={grille.largeur}
      height={grille.hauteur}
      class={`gaulois-apercu ${classe}`}
      style={taille ? `--cases:${grille.largeur}` : undefined}
      data-familier={taille ?? undefined}
      role="img"
      aria-label={decrireLApercu(tenue, familier)}
      data-testid="gaulois-apercu"
    />
  );
}

/**
 * La scène collée, commune au vestiaire et à la boutique : les quatre repères de la page (`racine`, `scene` le Gaulois,
 * `barre` celle des rayons, `panneau` le rayon ouvert) et les deux réglages qui en dépendent.
 *
 * Sur téléphone, le Gaulois reste collé en haut de l'écran et la barre des rayons se colle juste dessous : la feuille de
 * style a besoin de la hauteur du Gaulois (`--vestiaire-scene`), qui change avec un essayage. `pret` : ce qui dit que la
 * scène est dessinée ; elle est mesurée de nouveau quand il change.
 *
 * Quand un autre rayon s'ouvre, si le haut du rayon est déjà passé sous la barre (on avait descendu dans les cases), la
 * page remonte pour le montrer depuis sa première case. Sans glissement : le contenu vient de changer d'un coup.
 */
export function useSceneCollee(rayon: string, pret: unknown) {
  const racine = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const barre = useRef<HTMLDivElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const cadre = racine.current;
    const bloc = scene.current;
    if (!cadre || !bloc) return;
    const mesurer = () => cadre.style.setProperty("--vestiaire-scene", `${Math.round(bloc.getBoundingClientRect().height)}px`);
    mesurer();
    const observateur = typeof ResizeObserver === "function" ? new ResizeObserver(mesurer) : null;
    observateur?.observe(bloc);
    return () => observateur?.disconnect();
  }, [pret]);
  const rayonVu = useRef(rayon);
  useLayoutEffect(() => {
    if (rayonVu.current === rayon) return;
    rayonVu.current = rayon;
    const sous = barre.current?.getBoundingClientRect().bottom;
    const haut = panneau.current?.getBoundingClientRect().top;
    if (sous !== undefined && haut !== undefined && haut < sous) window.scrollBy({ top: haut - sous - 12, behavior: "instant" });
  }, [rayon]);
  return { racine, scene, barre, panneau };
}

/** Noté juste avant de partir vers Discord : la page de compte, où Discord ramène, renvoie alors à la page d'où l'on vient. */
export function noterLeRetour(cle: string): void {
  try {
    sessionStorage.setItem(cle, String(Date.now()));
  } catch {
    // Stockage refusé : la connexion se fait quand même, le joueur revient par le menu.
  }
}

/** Le côté, en pixels, de la place réservée à l'image dans une case : la vignette s'y agrandit d'un nombre entier de fois. */
const COTE_IMAGE = 80;
/** La place d'un gros plan du visage : toute la largeur d'une case, pour que les yeux se lisent (4 pixels par case du dessin). */
const COTE_VISAGE = 88;
/** La place de l'image dans un onglet de la barre des rayons : sa hauteur, et sa largeur dans une barre serrée ou large. */
const RAYON_HAUTEUR = 44;
const RAYON_SERRE = 56;
const RAYON_LARGE = 96;

/**
 * L'image d'une case : décorative, le nom de la case est écrit dessous. Une case du dessin vaut 1, 2 ou 3 pixels dans
 * `place` ; un gros plan du visage, jusqu'à 4.
 */
function ImageDeCase({ vignette, place = COTE_IMAGE, maximum = 3 }: { vignette: Vignette; place?: number; maximum?: number }) {
  return <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelleEntiere(vignette.largeur, vignette.hauteur, place, maximum)} class="case-dessin" />;
}

/**
 * L'image d'un onglet de rayon, décorative : ce que le Gaulois y porte. Elle est agrandie une ou deux fois, selon la place
 * que l'onglet lui laisse : la feuille de style choisit entre les deux agrandissements d'après la largeur de l'écran.
 */
function ImageDeRayon({ vignette }: { vignette: Vignette }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, vignette.largeur, vignette.hauteur, vignette.cases), [vignette]);
  const echelle = (place: number): number => Math.min(echelleEntiere(vignette.largeur, 1, place, 2), echelleEntiere(1, vignette.hauteur, RAYON_HAUTEUR, 2));
  return <canvas ref={toile} width={vignette.largeur} height={vignette.hauteur} class="pixels rayon-dessin" style={`--l:${vignette.largeur};--h:${vignette.hauteur};--serre:${echelle(RAYON_SERRE)};--large:${echelle(RAYON_LARGE)}`} aria-hidden="true" />;
}

/** Le cadenas d'une case de la boutique, tant que ses prix ne sont pas connus. */
function Cadenas() {
  return (
    <svg class="case-cadenas" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 5V3.5a3 3 0 0 1 6 0V5h1v6H2V5zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0z" fill="currentColor" />
    </svg>
  );
}

/** Ce que la boutique dit d'une case : son prix (`null` tant que les prix manquent), ou le nombre d'exemplaires possédés. */
export type Vente = { possede: number } | { prix: number | null };

/**
 * Une case : l'image de l'objet, son nom, sa rareté écrite et comptée en losanges (la couleur du cadre n'est jamais le seul
 * repère). Une case de la boutique porte son prix : elle s'essaie sur le Gaulois, elle ne se porte qu'une fois achetée.
 * Une case achetée porte la marque « à vous ». `portee` et `essayee` se disent à part : pendant un essayage, l'objet
 * réellement porté garde sa coche. Un objet gravé à la forge porte sa petite plaque dorée dans un coin ; son texte est dans
 * le nom de la case et se lit au survol.
 */
export function Case({
  objet,
  vignette,
  portee,
  essayee = false,
  vente,
  enVente = false,
  visage = false,
  plaque = null,
  onClick,
}: {
  objet: Objet;
  vignette: Vignette | null;
  portee: boolean;
  essayee?: boolean;
  vente?: Vente | undefined;
  enVente?: boolean;
  /** Un gros plan du visage : il prend toute la place de l'image. */
  visage?: boolean;
  /** Le texte de sa plaque de la forge, s'il est gravé. */
  plaque?: string | null;
  onClick: () => void;
}) {
  const aVendre = vente && "prix" in vente ? vente : null;
  const possede = vente && "possede" in vente ? vente.possede : 0;
  return (
    <button type="button" class="case" data-rarete={objet.rarete ?? "aucune"} data-boutique={aVendre ? "" : undefined} data-etat={essayee ? "essayee" : portee ? "portee" : "libre"} aria-pressed={portee || essayee} data-grave={plaque ? "" : undefined} title={plaque ? motsDeLaPlaque(plaque) : undefined} onClick={onClick}>
      <span class="case-image">{vignette ? visage ? <ImageDeCase vignette={vignette} place={COTE_VISAGE} maximum={4} /> : <ImageDeCase vignette={vignette} /> : <span class="case-rien" aria-hidden="true" />}</span>
      <span class="case-nom">{objet.nom}</span>
      {objet.rarete && <MarqueDeRarete rarete={objet.rarete} />}
      {possede > 0 && (
        <span class="case-marque" data-testid="case-a-vous">
          {/* Des mots, pas de signe (règle du pilote) : « à vous, 2 exemplaires », le nombre collé à son mot. */}
          <span class="sr-only">, </span>à vous{possede > 1 && `, ${exemplaires(possede)}`}
        </span>
      )}
      {/* Mis en vente par le membre : il ne s'achète pas à la boutique tant que l'offre est ouverte. */}
      {enVente && (
        <span class="case-marque" data-testid="case-en-vente">
          <span class="sr-only">, </span>en vente
        </span>
      )}
      {aVendre && (
        <>
          <span class="sr-only">, à la boutique, </span>
          {aVendre.prix === null ? <Cadenas /> : <Prix montant={aVendre.prix} class="case-prix" />}
          <span class="sr-only">, à essayer</span>
        </>
      )}
      {essayee && (
        <span class="case-essai">
          <span class="sr-only">, en </span>essai
        </span>
      )}
      {plaque && (
        <>
          <PetitePlaque />
          <span class="sr-only" data-testid="case-plaque">
            . {motsDeLaPlaque(plaque)}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * La barre des rayons : un onglet par rayon, avec l'image de ce que le Gaulois y porte. Au clavier : flèches, Début et
 * Fin, comme tout groupe d'onglets ; un seul onglet dans l'ordre de tabulation. `prefixe` : celui des identifiants de la
 * page (`vestiaire`, `boutique`) ; le rayon ouvert se lit dans le panneau `<prefixe>-panneau`. `mention` : quelques mots
 * sous le nom d'un rayon (les offres des membres, à la boutique).
 */
export function BarreDesRayons<R extends string>({
  prefixe,
  label,
  rayons,
  noms,
  rayon,
  vignette,
  mention,
  onChoisir,
}: {
  prefixe: string;
  label: string;
  rayons: readonly R[];
  noms: Readonly<Record<R, string>>;
  rayon: R;
  vignette: (rayon: R) => Vignette | null;
  mention?: (rayon: R) => string | null;
  onChoisir: (rayon: R) => void;
}) {
  const auClavier = (e: KeyboardEvent, index: number) => {
    const suivant = rayons[tabKeyTarget(e.key, index, rayons.length) ?? -1];
    if (!suivant) return;
    e.preventDefault();
    onChoisir(suivant);
    document.getElementById(`${prefixe}-rayon-${suivant}`)?.focus();
  };
  return (
    <div class="vestiaire-rayons" role="tablist" aria-label={label} data-testid={`${prefixe}-rayons`}>
      {rayons.map((id, index) => {
        const image = vignette(id);
        const mots = mention?.(id) ?? null;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${prefixe}-rayon-${id}`}
            class="vestiaire-rayon-onglet"
            aria-selected={rayon === id}
            aria-controls={`${prefixe}-panneau`}
            tabIndex={rayon === id ? 0 : -1}
            onClick={() => onChoisir(id)}
            onKeyDown={(e) => auClavier(e, index)}
            data-testid={`rayon-${id}`}
          >
            <span class="vestiaire-rayon-image">{image ? <ImageDeRayon vignette={image} /> : <span class="case-rien" aria-hidden="true" />}</span>
            {noms[id]}
            {mots && (
              <span class="vestiaire-rayon-mention tnum">
                <span class="sr-only">, </span>
                {mots}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
