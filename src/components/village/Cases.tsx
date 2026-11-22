import { useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { RARETES_DES_OBJETS, type Objet, type RareteDObjet, type Tenue, type Vignette } from "../../lib/gaulois";
import { motionAllowed } from "../../lib/fx/motion";
import { tabKeyTarget } from "../../lib/onglets";
import type { DecorDeBanniere } from "../../lib/village/decor-banniere";
import { exemplaires } from "../../lib/village/ecran-boutique";
import { decrireLApercu, tailleDeLApercu } from "../../lib/village/ecran-familiers";
import { motsDeLaPlaque } from "../../lib/village/ecran-forge";
import { apercuAvecFamilier, type Familier } from "../../lib/village/familiers";
import { echelleEntiere } from "../../lib/village/vestiaire-rayons";
import type { PoseDeLaChose } from "../../lib/village/fonds-objets";
import { MarqueDeRarete, PetitePlaque, Prix, peindre } from "./BoutiquePixels";
import { suivreLePointeur, variablesDeLaCarte } from "./CarteDObjet";
import { faconDeLaCarte, styleDeCarte } from "../../lib/jeu/cartes-d-objets";
import { CorpsDePoche, EmplacementDePoche } from "./CarteDePoche";
import { DessinSurFond } from "./DessinSurFond";
import { useEffetsDeLaChose } from "./effets-des-cartes";

/**
 * Les pièces que partagent le vestiaire de « Mon Gaulois » (`/village`) et son onglet « La boutique » (`#boutique`) : le
 * Gaulois dessiné, la case d'un objet et la barre des rayons. Sorties de `Vestiaire.tsx` le 15 novembre 2026, quand la
 * boutique a pris sa propre page : rien n'y a changé d'apparence.
 */

/** L'annonce d'une joie du Gaulois : son détail porte la rareté de l'objet reçu. */
export const JOIE_DU_GAULOIS = "gal:gaulois-joie";
/** Le rang de rareté à partir duquel un objet reçu le fait sauter de joie : l'épique. Un palier du sentier, toujours. */
const RANG_DE_LA_JOIE = 3;

/**
 * Le Gaulois saute de joie (17 novembre 2026, choix du pilote parmi cinq idées) : à appeler quand la fenêtre d'un objet
 * reçu se ferme, pour qu'on le voie. Deux petits sauts et quelques éclats de la couleur de la rareté, une fois ; rien pour
 * un objet courant hors du sentier. De l'habillage : il ne dit rien de plus que la fenêtre qui vient de se fermer.
 */
export function feterLObjet(rarete: RareteDObjet, palier = false): void {
  if (!palier && RARETES_DES_OBJETS[rarete].rang < RANG_DE_LA_JOIE) return;
  window.dispatchEvent(new CustomEvent(JOIE_DU_GAULOIS, { detail: { rarete } }));
}

/**
 * Fait jouer la joie sur un dessin quand elle est annoncée : la classe `gaulois-joie` le temps de l'animation, et la
 * couleur des éclats (`--joie`) sur `cadre`. Rien quand les animations sont coupées.
 */
export function useJoie(dessin: { current: HTMLElement | null }, cadre: { current: HTMLElement | null }): void {
  useEffect(() => {
    const jouer = (e: Event): void => {
      const el = dessin.current;
      // Un Gaulois d'un onglet fermé ne joue rien : son animation ne finirait pas, et la classe lui resterait.
      if (!el || el.offsetParent === null || !motionAllowed() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rarete = (e as CustomEvent<{ rarete?: unknown }>).detail?.rarete;
      const boite = cadre.current;
      if (boite && typeof rarete === "string" && /^[a-z-]+$/.test(rarete)) {
        boite.style.setProperty("--joie", `var(--rarete-${rarete})`);
        boite.setAttribute("data-joie", "");
      }
      el.classList.remove("gaulois-joie");
      void el.offsetWidth;
      el.classList.add("gaulois-joie");
      const finir = (): void => {
        el.classList.remove("gaulois-joie");
        boite?.removeAttribute("data-joie");
      };
      el.addEventListener("animationend", finir, { once: true });
      // La pause pressée en plein saut arrête l'animation sans la finir : la classe ne doit pas rester.
      window.setTimeout(finir, 1800);
    };
    window.addEventListener(JOIE_DU_GAULOIS, jouer);
    return () => window.removeEventListener(JOIE_DU_GAULOIS, jouer);
  }, [dessin, cadre]);
}

/**
 * Le Gaulois dessiné case par case, agrandi sans flou par la feuille de style. Son texte de remplacement le décrit. Avec le
 * familier qu'il montre (15 novembre 2026), une seule grille : le Gaulois à gauche, le familier à droite, les pieds sur la
 * même rangée. La grille s'élargit : la feuille de style lit sa largeur en cases (`--cases`) et sa taille
 * (`data-familier`, « petit » ou « large »), et réduit la case d'un nombre entier de pixels quand il le faut. La scène qui
 * porte l'aperçu reçoit la même taille (`tailleDeLApercu`), pour se ranger autrement sur téléphone.
 */
export function ApercuGaulois({ tenue, familier = null, decor = null, class: classe = "" }: { tenue: Tenue; familier?: Familier | null; decor?: DecorDeBanniere | null; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const fond = useRef<HTMLCanvasElement>(null);
  const cadre = useRef<HTMLSpanElement>(null);
  useJoie(toile, cadre);
  // Le contenu de la tenue, pas son objet : un écran qui la recompose à chaque dessin (un essayage) ne redessine rien.
  const signature = Object.keys(tenue)
    .sort()
    .map((cle) => `${cle}=${tenue[cle] ?? ""}`)
    .join("|");
  const grille = useMemo(() => apercuAvecFamilier(tenue, familier), [signature, familier]);
  useEffect(() => peindre(toile.current, grille.largeur, grille.hauteur, grille.cases), [grille]);
  // Il saute une fois quand on l'habille (17 novembre 2026) : un essayage, un objet porté. Pas au premier dessin, ni
  // pour un familier qui arrive, ni quand les animations sont coupées.
  const dessine = useRef<string | null>(null);
  useEffect(() => {
    const el = toile.current;
    const avant = dessine.current;
    dessine.current = signature;
    if (avant === null || avant === signature) return;
    if (!el || !motionAllowed()) return;
    el.classList.remove("gaulois-saut");
    // Relire la mise en page relance l'animation si elle tournait encore.
    void el.offsetWidth;
    el.classList.add("gaulois-saut");
    const fini = (): void => el.classList.remove("gaulois-saut");
    el.addEventListener("animationend", fini, { once: true });
    return () => el.removeEventListener("animationend", fini);
  }, [signature]);
  useEffect(() => {
    if (decor) peindre(fond.current, decor.largeur, decor.hauteur, decor.cases);
  }, [decor]);
  // Il cligne des yeux de temps en temps (17 novembre 2026) : le même dessin, les yeux clos, un instant. Rien d'autre ne
  // change ; ni avec « réduire les animations », ni avec le bouton pause du site, ni dans un onglet caché.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const clos = apercuAvecFamilier(tenue, familier, { yeuxFermes: true });
    let rouvre = 0;
    let attente = 0;
    const cligner = (): void => {
      if (!document.hidden && motionAllowed()) {
        peindre(toile.current, clos.largeur, clos.hauteur, clos.cases);
        rouvre = window.setTimeout(() => peindre(toile.current, grille.largeur, grille.hauteur, grille.cases), CLIGNEMENT.ferme);
      }
      attente = window.setTimeout(cligner, CLIGNEMENT.entre + Math.random() * CLIGNEMENT.hasard);
    };
    attente = window.setTimeout(cligner, CLIGNEMENT.entre);
    return () => {
      window.clearTimeout(attente);
      window.clearTimeout(rouvre);
    };
  }, [grille, signature, familier]);
  const taille = tailleDeLApercu(familier);
  return (
    <span ref={cadre} class="gaulois-cadre" data-decor={decor ? "" : undefined} data-testid="gaulois-cadre">
      {/* La bannière qu'il montre sur /gaulois, derrière lui : décorative, son nom est écrit à l'onglet « Mon Gaulois ». */}
      {decor && <canvas ref={fond} width={decor.largeur} height={decor.hauteur} class="pixels gaulois-decor" aria-hidden="true" data-testid="gaulois-decor" />}
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
    </span>
  );
}

/** Le clignement, en millisecondes : les yeux clos, l'attente la plus courte entre deux, et ce que le hasard y ajoute. */
const CLIGNEMENT = { ferme: 170, entre: 4200, hasard: 3800 } as const;

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
 * `place` ; un gros plan du visage, jusqu'à 4. Avec `fond`, la chose est posée sur son fond d'objet, qui remplit la place
 * de l'image (`DessinSurFond`).
 */
function ImageDeCase({ vignette, place = COTE_IMAGE, maximum = 3, fond = null, rarete = null, pose = "centre" }: { vignette: Vignette; place?: number; maximum?: number; fond?: string | null; rarete?: string | null; pose?: PoseDeLaChose }) {
  return <DessinSurFond dessin={vignette} fond={fond} rarete={rarete} place={place} maximum={maximum} pose={pose} class="case-dessin" />;
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
/**
 * Ce que dit une case : combien on en possède, ou son prix à la boutique. `revient` : l'objet n'est pas en rayon cette
 * semaine (boutique tournante, 19 novembre 2026), et la case dit son retour au lieu de son prix.
 */
export type Vente = { possede: number } | { prix: number | null; revient?: string | null };

/**
 * Une case : l'image de l'objet, son nom, sa rareté écrite avec son icône (en pleine image, son icône seule à l'écran et
 * son nom pour les lecteurs d'écran ; la couleur du cadre n'est jamais le seul repère). Une case de la boutique porte son prix : elle s'essaie sur le Gaulois, elle ne se porte qu'une fois achetée.
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
  nouveau = false,
  fond = null,
  pose = "centre",
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
  /** Arrivé depuis la dernière visite, pas encore essayé : la case porte « Nouveau ». */
  nouveau?: boolean;
  /** La clé de son fond d'objet (`cleDeLObjet`, `cleDuFamilier`, `cleDuModele`) : la chose y est posée. Sans clé, sur la case nue. */
  fond?: string | null;
  /** Où poser la chose sur son fond : au milieu (un objet), au sol (un familier), contre le bas (un buste). */
  pose?: PoseDeLaChose;
  onClick: () => void;
}) {
  const aVendre = vente && "prix" in vente ? vente : null;
  const possede = vente && "possede" in vente ? vente.possede : 0;
  // Une chose posée sur son fond (objet, familier, Gaulois unique) est une carte (22 novembre 2026) ; un trait du visage,
  // une coupe ou « rien » gardent la case d'avant.
  const carte = !visage && !!fond && !!vignette;
  const style = carte ? styleDeCarte(objet.rarete) : null;
  const effets = useEffetsDeLaChose(carte ? fond : null);
  const suivre = style && style !== "lisse" ? suivreLePointeur() : null;
  // Les marques posées sur la case (« à vous », « en vente », « Nouveau », « essai », la plaque) : sur une carte, dans les
  // coins de son image, pour ne jamais couvrir son nom ni se couvrir entre elles.
  const marquesDuHaut = (
    <>
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
    </>
  );
  const marquesDuBas = (
    <>
      {nouveau && !essayee && !portee && (
        <span class="case-nouveau" data-testid="case-nouveau">
          <span class="sr-only">, </span>Nouveau
        </span>
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
    </>
  );
  // Le prix de la case (ou son retour, ou le cadenas) : sous la carte, dans le bandeau du bas d'une carte rare.
  const prixDeLaCase = aVendre && (
    <>
      <span class="sr-only">, à la boutique, </span>
      {aVendre.revient ? (
        <span class="case-revient" data-testid="case-revient">
          {aVendre.revient}
        </span>
      ) : aVendre.prix === null ? (
        <Cadenas />
      ) : (
        <Prix montant={aVendre.prix} class="case-prix" />
      )}
      <span class="sr-only">, à essayer</span>
    </>
  );
  const attributs = {
    type: "button" as const,
    "data-rarete": objet.rarete ?? "aucune",
    "data-boutique": aVendre ? "" : undefined,
    "data-etat": essayee ? "essayee" : portee ? "portee" : "libre",
    "aria-pressed": portee || essayee,
    "data-grave": plaque ? "" : undefined,
    "data-nouveau": nouveau ? "" : undefined,
    title: plaque ? motsDeLaPlaque(plaque) : undefined,
    onClick,
  };
  // Une chose sur son fond : la carte de poche (22 novembre 2026, « des véritables cartes avec les infos dessus »), les
  // effets du duel écrits dessus. Ses marques dans les coins de l'image ; « À vous » ou « Porté » à la place du prix.
  if (carte && vignette && fond) {
    const rarete = objet.rarete ?? "commun";
    const facon = faconDeLaCarte(rarete);
    const marques = (
      <>
        {nouveau && !essayee && !portee && (
          <span class="case-nouveau" data-testid="case-nouveau">
            <span class="sr-only">, </span>Nouveau
          </span>
        )}
        {/* Mis en vente par le membre : il ne s'achète pas à la boutique tant que l'offre est ouverte. */}
        {enVente ? (
          <span class="case-marque" data-testid="case-en-vente">
            <span class="sr-only">, </span>en vente{possede > 1 && `, ${exemplaires(possede)}`}
          </span>
        ) : (
          possede > 1 && (
            <span class="case-marque">
              <span class="sr-only">, </span>
              {exemplaires(possede)}
            </span>
          )
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
      </>
    );
    const etat = portee ? (
      <span class="co-porte" data-testid="case-portee">
        <span class="co-coche" aria-hidden="true" />
        <span class="sr-only">, </span>Porté
      </span>
    ) : prixDeLaCase ? (
      prixDeLaCase
    ) : possede > 0 ? (
      <span class="co-avous" data-testid="case-a-vous">
        <span class="sr-only">, </span>À vous
      </span>
    ) : null;
    return (
      <EmplacementDePoche nom={objet.nom} rarete={rarete} effets={effets}>
        <button
          {...attributs}
          class={`case case-carte co-carte co-poche${facon !== "simple" ? ` co-${facon}` : ""}`}
          data-carte={style ?? undefined}
          style={variablesDeLaCarte(rarete)}
          onPointerMove={suivre?.onPointerMove}
          onPointerLeave={suivre?.onPointerLeave}
          onPointerCancel={suivre?.onPointerCancel}
        >
          <CorpsDePoche nom={objet.nom} rarete={rarete} cle={fond} dessin={vignette} effets={effets} pose={pose} image={<ImageDeCase vignette={vignette} fond={fond} rarete={rarete} pose={pose} />} marques={marques} etat={etat} />
        </button>
      </EmplacementDePoche>
    );
  }
  // Un trait du visage, une coupe, « rien », « Aucun » : la case d'avant.
  return (
    <button {...attributs} class="case">
      <span class="case-image">
        {vignette ? visage ? <ImageDeCase vignette={vignette} place={COTE_VISAGE} maximum={4} /> : <ImageDeCase vignette={vignette} fond={fond} rarete={objet.rarete} pose={pose} /> : <span class="case-rien" aria-hidden="true" />}
      </span>
      <span class="case-nom">{objet.nom}</span>
      {objet.rarete && <MarqueDeRarete rarete={objet.rarete} />}
      {marquesDuHaut}
      {prixDeLaCase}
      {marquesDuBas}
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
  marque,
  onChoisir,
}: {
  prefixe: string;
  label: string;
  rayons: readonly R[];
  noms: Readonly<Record<R, string>>;
  rayon: R;
  vignette: (rayon: R) => Vignette | null;
  mention?: (rayon: R) => string | null;
  /** Quelques mots en pastille au coin d'un onglet (« Nouveau », au vestiaire). */
  marque?: (rayon: R) => string | null;
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
        const pastille = marque?.(id) ?? null;
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
            {pastille && (
              <span class="vestiaire-rayon-marque" data-testid={`rayon-marque-${id}`}>
                <span class="sr-only">, </span>
                {pastille}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
