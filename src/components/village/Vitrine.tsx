import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { GAULOIS as PLACE_DU_GAULOIS, LARGEUR as DECOR_LARGEUR, HAUTEUR as DECOR_HAUTEUR } from "../../../supabase/functions/code-discord/decors/commun";
import type { ComponentChildren, JSX } from "preact";
import { decrireGaulois, vignetteDeLObjet, type RareteDObjet as Rarete } from "../../lib/gaulois";
import { modeleNu } from "../../lib/village/modeles";
import { echelleEntiere } from "../../lib/village/vestiaire-rayons";
import { call } from "../../lib/compte/api";
import { FINITIONS, HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE, finitionAnimee, fusionDeLaFinition } from "../../lib/fx/finitions-carte";
import { finitionParId } from "../../lib/village/cartes";
import { INSTANT_DE_LA_VIGNETTE } from "../../lib/village/cartes-vignette";
import { monterLesCartes } from "../../scripts/cartes-mouvement";
import { apercuAvecFamilier, familierDe } from "../../lib/village/familiers";
import { demanderLaPochette, demanderLeRayon } from "../../lib/village/boutique-rayons";
import type { PochetteDeLEtal } from "../../lib/village/etal";
import type { ObjetPossede } from "../../lib/village/contrat";
import { lireBoutique, quantitePossedee } from "../../lib/village/ecran-boutique";
import { lignesPortees, provenanceDeLObjet, rareteDuCadre, type GauloisVitrine, type Provenance } from "../../lib/village/vitrine";
import { Dialogue } from "./BoutiqueDialogue";
import { charger as chargerLesBannieres } from "./Bannieres";
import { MarqueDeRarete, Pixels } from "./BoutiquePixels";
import { DessinFamilier } from "./Familiers";
import { Toile, peindre } from "./PlaceToile";

/**
 * La vitrine des Gaulois du clan, l'onglet « La vitrine » de « Mon Gaulois » (demande du pilote, 15 novembre 2026 : « une
 * vitrine dans la page gaulois avec tous les gaulois avec leurs cosmétiques + nom »). Dessin de Claude Fable 5.2 : le
 * pilote a choisi les cartes parmi cinq dispositions, puis voulu, le 16 novembre, « derrière leur bannière qu'ils ont
 * choisie en faible opacité, je veux voir la bannière mais aussi les codes couleurs ». Une carte par Gaulois, avec sa tenue,
 * son familier, sa bannière et son nom. L'ordre est celui du serveur (`get_village`, leur création) : rien n'est trié,
 * compté ni noté. La couleur d'une carte est la rareté de l'objet le plus rare porté, un fait du catalogue, jamais un score.
 */

interface Dessin {
  largeur: number;
  hauteur: number;
  cases: readonly (string | null)[];
}

/** Un Gaulois prêt à montrer : son dessin fait une fois, et ce qu'il porte de plus rare (la couleur de sa carte). */
interface Fiche {
  cle: number;
  /** Une clé qui suit le Gaulois quand la recherche retire des cartes : son nom, et son rang parmi ses homonymes. */
  nomCle: string;
  gaulois: GauloisVitrine;
  /** Le Gaulois et son familier côte à côte, comme au vestiaire. */
  groupe: Dessin;
  rarete: Rarete | null;
  description: string;
}

function fichesDe(gaulois: readonly GauloisVitrine[]): Fiche[] {
  const vus = new Map<string, number>();
  return gaulois.map((g, cle) => {
    const familier = familierDe(g.familier);
    const rang = vus.get(g.nom) ?? 0;
    vus.set(g.nom, rang + 1);
    return {
      cle,
      nomCle: `${g.nom}#${rang}`,
      gaulois: g,
      groupe: apercuAvecFamilier(g.tenue, familier),
      rarete: rareteDuCadre(g.tenue),
      description: `${decrireGaulois(g.tenue)}${familier ? ` Familier : ${familier.nom.toLowerCase()}.` : ""}`,
    };
  });
}

/** L'écran est-il au moins aussi large que cela, en pixels ? Dès la tablette, les dessins gagnent une taille. */
function useEcranDe(largeur: number): boolean {
  const [grand, setGrand] = useState(() => matchMedia(`(min-width: ${largeur}px)`).matches);
  useEffect(() => {
    const media = matchMedia(`(min-width: ${largeur}px)`);
    const suivre = () => setGrand(media.matches);
    media.addEventListener("change", suivre);
    return () => media.removeEventListener("change", suivre);
  }, [largeur]);
  return grand;
}

/** Le code des bannières (`src/lib/village/bannieres.ts`), lourd : il ne vient que par le chargeur de `Bannieres.tsx`. */
type LibDesBannieres = Awaited<ReturnType<typeof chargerLesBannieres>>;

/**
 * Le fond d'une bannière pour une carte : la bannière sans les trois cases de son bord, où se pose le cadre de sa rareté.
 * Sur une carte, le cadre dit la rareté de la tenue : celui de la bannière, d'une autre rareté, brouillerait la couleur.
 */
const BORD_DE_BANNIERE = 3;
const FOND = { largeur: DECOR_LARGEUR - 2 * BORD_DE_BANNIERE, hauteur: DECOR_HAUTEUR - 2 * BORD_DE_BANNIERE } as const;
/** Les cases de la bannière sous les semelles du Gaulois, comme sur /gaulois : le fond se cale sur ses pieds. */
const FOND_SOUS_LES_PIEDS = DECOR_HAUTEUR - BORD_DE_BANNIERE - (PLACE_DU_GAULOIS.y + PLACE_DU_GAULOIS.hauteur);
/** Ce qu'une carte peut prendre de large en plus de son dessin (feuille de style : 6 rem). */
const MARGE_DE_CARTE = 96;

const fonds = new Map<string, readonly string[] | null>();
function fondDe(lib: LibDesBannieres, id: string): readonly string[] | null {
  let fond = fonds.get(id);
  if (fond === undefined) {
    const dessin = lib.dessinDeLaBanniere(id);
    fond = dessin ? Array.from({ length: FOND.largeur * FOND.hauteur }, (_, i) => dessin.cases[(BORD_DE_BANNIERE + Math.floor(i / FOND.largeur)) * DECOR_LARGEUR + BORD_DE_BANNIERE + (i % FOND.largeur)] ?? "#000000") : null;
    fonds.set(id, fond);
  }
  return fond;
}

/* Les fonds se peignent un à un, chacun dans son tour de la boucle du navigateur : la page ne se fige pas. */
const aPeindre: (() => void)[] = [];
let peintureEnCours = false;
function peindreLeSuivant(): void {
  const tache = aPeindre.shift();
  if (!tache) {
    peintureEnCours = false;
    return;
  }
  tache();
  setTimeout(peindreLeSuivant, 0);
}
function peindrePlusTard(tache: () => void): void {
  aPeindre.push(tache);
  if (peintureEnCours) return;
  peintureEnCours = true;
  setTimeout(peindreLeSuivant, 0);
}

/**
 * La bannière choisie, derrière le Gaulois d'une carte : décorative et pâle, peinte quand la carte approche de l'écran,
 * puis montrée par un fondu lent (feuille de style). `echelle` : le côté d'une case, entier.
 */
function FondDeBanniere({ lib, id, echelle }: { lib: LibDesBannieres; id: string; echelle: number }) {
  const toile = useRef<HTMLCanvasElement>(null);
  const [peinte, setPeinte] = useState(false);
  useEffect(() => {
    const element = toile.current;
    if (!element) return;
    let vivante = true;
    const dessiner = () =>
      peindrePlusTard(() => {
        const fond = vivante ? fondDe(lib, id) : null;
        if (!fond) return;
        peindre(element, FOND.largeur, FOND.hauteur, fond);
        setPeinte(true);
      });
    if (typeof IntersectionObserver !== "function") {
      dessiner();
      return () => {
        vivante = false;
      };
    }
    const guetteur = new IntersectionObserver(
      (entrees) => {
        if (!entrees.some((entree) => entree.isIntersecting)) return;
        guetteur.disconnect();
        dessiner();
      },
      { rootMargin: "400px" },
    );
    guetteur.observe(element);
    return () => {
      vivante = false;
      guetteur.disconnect();
    };
  }, [lib, id]);
  return (
    <canvas
      ref={toile}
      width={FOND.largeur}
      height={FOND.hauteur}
      class="village-pixels vitrine-carte-fond"
      data-peinte={peinte ? "" : undefined}
      style={{ width: `${FOND.largeur * echelle}px`, height: `${FOND.hauteur * echelle}px`, "--vitrine-fond-bas": `${FOND_SOUS_LES_PIEDS * echelle}px` }}
      aria-hidden="true"
    />
  );
}

/** Le code des bannières, demandé une fois si une carte en montre une ; `null` tant qu'il n'est pas là, ou s'il ne vient pas. */
function useLibDesBannieres(utile: boolean): LibDesBannieres | null {
  const [lib, setLib] = useState<LibDesBannieres | null>(null);
  useEffect(() => {
    if (!utile) return;
    let vivant = true;
    // Un échec ne dit rien : les cartes restent sur leur fond de rareté.
    chargerLesBannieres().then(
      (charge) => {
        if (vivant) setLib(charge);
      },
      () => undefined,
    );
    return () => {
      vivant = false;
    };
  }, [utile]);
  return lib;
}

/**
 * La finition de carte d'un Gaulois de la vitrine (rayon « Cartes ») : entre sa bannière et lui, sur toute l'image de sa
 * carte. Au repos, rien ne bouge : un reflet, ou l'image fixe d'une animation en pixels. Seule la carte survolée (`vive`)
 * s'anime et suit la souris : une page de dizaines de cartes ne doit pas ramer. Décorative.
 */
const REPOS_DU_REFLET = { mx: "0.3", my: "-0.15" } as const;

function FinitionDeVitrine({ id, vive }: { id: string; vive: boolean }) {
  const finition = finitionParId(id);
  const racine = useRef<HTMLSpanElement>(null);
  const fond = useRef<HTMLCanvasElement>(null);
  const devant = useRef<HTMLCanvasElement>(null);
  const cle = finition?.id ?? null;
  useEffect(() => {
    if (!cle || !racine.current) return undefined;
    // En pause ou avec « réduire les animations », la carte survolée garde son image fixe : le script la viderait.
    const anime = !document.documentElement.classList.contains("fx-off") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (vive && anime) {
      const carte = racine.current.querySelector<HTMLElement>(".podium-carte");
      const demonter = monterLesCartes(racine.current, { immobile: true });
      return () => {
        demonter();
        // Le reflet revient à sa place de repos, la même que sur les cartes jamais survolées.
        carte?.style.setProperty("--carte-mx", REPOS_DU_REFLET.mx);
        carte?.style.setProperty("--carte-my", REPOS_DU_REFLET.my);
      };
    }
    const nom = finitionAnimee(cle);
    const f = fond.current?.getContext("2d");
    const d = devant.current?.getContext("2d");
    if (!nom || !f || !d || !fond.current) return undefined;
    fond.current.style.mixBlendMode = fusionDeLaFinition(nom);
    for (const t of [f, d]) {
      t.globalAlpha = 1;
      t.globalCompositeOperation = "source-over";
      t.clearRect(0, 0, LARGEUR_DE_TOILE, HAUTEUR_DE_TOILE);
    }
    FINITIONS[nom](f, d, INSTANT_DE_LA_VIGNETTE[nom] ?? 2.4, 0, 0);
    return undefined;
  }, [cle, vive]);
  if (!finition) return null;
  return (
    <span ref={racine} class="bloc-effet vitrine-finition" aria-hidden="true" data-testid="vitrine-finition" data-finition={finition.id}>
      <span class="podium-carte" data-finition={finition.id} data-reflet={finition.animee ? undefined : ""} style={`--carte-mx:${REPOS_DU_REFLET.mx};--carte-my:${REPOS_DU_REFLET.my}`}>
        <span class="podium-carte-face">
          <canvas ref={fond} class="podium-carte-fx" data-toile="fond" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
          <i class="podium-carte-holo" />
          <i class="podium-carte-eclat" />
        </span>
        <canvas ref={devant} class="podium-carte-fx podium-carte-fx-devant" data-toile="devant" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
      </span>
    </span>
  );
}

/**
 * La fenêtre où un Gaulois de la vitrine s'ouvre en grand. Par défaut, celle de la boutique d'avant, avec « Fermer » ;
 * l'écran de jeu de « Mon Gaulois » donne la sienne (`VitrineDuJeu.tsx`, 21 novembre 2026) : ce fichier, que « Mon compte »
 * atteint par le livre des bannières, ne connaît rien du jeu. `titre` : le nom du Gaulois.
 */
export type FenetreDeLaVitrine = (p: { titre: string; onFermer: () => void; children: ComponentChildren }) => JSX.Element;

const FenetreDAvant: FenetreDeLaVitrine = ({ titre, onFermer, children }) => (
  <Dialogue titre={titre} etape="vue" occupe={false} onFermer={onFermer} testid="vitrine-grand">
    {children}
    <div class="boutique-dialogue-actions">
      <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="vitrine-grand-fermer">
        Fermer
      </button>
    </div>
  </Dialogue>
);

/**
 * Les cartes : une par Gaulois, aussi large que lui et son familier, au cadre de la rareté la plus haute portée. Le livre
 * des bannières (`LivreDesBannieres.tsx`) s'en sert aussi pour montrer au membre sa propre carte avec la bannière qu'il essaie.
 * `Fenetre` : la fenêtre d'un Gaulois ouvert en grand ; `moi` : la marque de la carte du membre qui regarde.
 */
export function CartesDeLaVitrine({
  gaulois,
  testid = "vitrine",
  label = "Les Gaulois du clan",
  enGrand = false,
  Fenetre = FenetreDAvant,
  moi = <span class="vitrine-moi">Moi</span>,
}: {
  gaulois: readonly GauloisVitrine[];
  testid?: string;
  label?: string;
  enGrand?: boolean;
  Fenetre?: FenetreDeLaVitrine;
  moi?: ComponentChildren;
}) {
  const fiches = useMemo(() => fichesDe(gaulois), [gaulois]);
  // La carte ouverte en grand : sa place dans la liste ; rien tant qu'on n'a cliqué sur aucune.
  const [ouverte, setOuverte] = useState<number | null>(null);
  // La carte sous la souris ou au clavier : la seule dont la finition s'anime.
  const [survolee, setSurvolee] = useState<string | null>(null);
  const enVue = ouverte === null ? null : (fiches[ouverte] ?? null);
  // « Où trouver cet objet » : pour dire « à vous », l'inventaire de qui regarde, lu une seule fois, à la première
  // fenêtre ouverte sur le Gaulois d'un autre. `undefined` : pas encore demandé ; `null` : en panne.
  const [inventaire, setInventaire] = useState<readonly ObjetPossede[] | null | undefined>(undefined);
  const aLire = enVue !== null && !enVue.gaulois.moi && inventaire === undefined;
  useEffect(() => {
    if (!aLire) return;
    void call<unknown>("get_ma_boutique")
      .then(lireBoutique, () => null)
      .then((boutique) => setInventaire(boutique ? boutique.inventaire : null));
  }, [aLire]);
  const echelle = useEcranDe(768) ? 3 : 2;
  const lib = useLibDesBannieres(fiches.some((f) => Boolean(f.gaulois.banniere)));
  if (fiches.length === 0) return null;
  return (
    <>
    <ul class="vitrine-cartes" data-testid={testid} aria-label={label}>
      {fiches.map((f) => {
        const banniere = lib?.banniereParId(f.gaulois.banniere) ?? null;
        const large = f.groupe.largeur * echelle;
        return (
          <li key={f.nomCle} class="vitrine-carte vitrine-teinte" onPointerEnter={() => setSurvolee(f.nomCle)} onPointerLeave={() => setSurvolee((c) => (c === f.nomCle ? null : c))} onFocusCapture={() => setSurvolee(f.nomCle)} onBlurCapture={() => setSurvolee((c) => (c === f.nomCle ? null : c))} data-rarete={f.rarete ?? undefined} data-moi={f.gaulois.moi || undefined} data-banniere={banniere?.id} style={{ "--vitrine-l": `${large}px` }}>
            <div class="vitrine-carte-image">
              {/* À l'échelle du Gaulois, ou d'un cran de plus si la carte peut être plus large que la bannière. */}
              {lib && banniere && <FondDeBanniere lib={lib} id={banniere.id} echelle={Math.max(echelle, Math.ceil((large + MARGE_DE_CARTE) / FOND.largeur))} />}
              {f.gaulois.carte && <FinitionDeVitrine id={f.gaulois.carte} vive={survolee === f.nomCle} />}
              <Toile largeur={f.groupe.largeur} hauteur={f.groupe.hauteur} cases={f.groupe.cases} echelle={echelle} class="vitrine-carte-dessin" />
            </div>
            <div class="vitrine-carte-pied">
              <span class="vitrine-nom">{f.gaulois.nom}</span>
              <span class="sr-only"> {f.description}</span>
              {banniere && <span class="sr-only"> Bannière : {banniere.nom}.</span>}
              {f.rarete && <MarqueDeRarete rarete={f.rarete} />}
            </div>
            {f.gaulois.moi && moi}
            {/* Toute la carte ouvre le Gaulois en grand : un bouton sans dessin, posé par-dessus. */}
            {enGrand && <button type="button" class="vitrine-carte-ouvrir" aria-label={`Voir ${f.gaulois.nom} en grand`} onClick={() => setOuverte(f.cle)} data-testid="vitrine-ouvrir" />}
          </li>
        );
      })}
    </ul>
    {enVue && <GauloisEnGrand fiche={enVue} lib={lib} inventaire={inventaire ?? null} Fenetre={Fenetre} onFermer={() => setOuverte(null)} />}
    </>
  );
}

/**
 * Un Gaulois de la vitrine regardé en grand (17 novembre 2026, choix du pilote parmi cinq idées) : la même fenêtre que
 * celles de la boutique, avec le Gaulois devant sa bannière, comme sur /gaulois, puis ce qu'il porte, case par case.
 * Rien de plus que ce que la vitrine sait déjà : ni bourse, ni total, ni note.
 */
function GauloisEnGrand({ fiche, lib, inventaire, Fenetre, onFermer }: { fiche: Fiche; lib: LibDesBannieres | null; inventaire: readonly ObjetPossede[] | null; Fenetre: FenetreDeLaVitrine; onFermer: () => void }) {
  const grandEcran = useEcranDe(480);
  const g = fiche.gaulois;
  const familier = familierDe(g.familier);
  const banniere = lib?.banniereParId(g.banniere) ?? null;
  const scene = useMemo(() => (lib && banniere ? lib.sceneDeLaBanniere(banniere.id, g.tenue, familier) : null), [lib, banniere, g.tenue, familier]);
  const lignes = useMemo(() => lignesPortees(g.tenue), [g.tenue]);
  const vignette = useMemo(() => (lib && banniere ? lib.vignetteDeLaBanniere(banniere.id) : null), [lib, banniere]);
  // « Où trouver cet objet » : sous chaque case du Gaulois d'un autre, d'où vient l'objet. Tant que l'inventaire de qui
  // regarde n'est pas lu, ou en panne, les objets payants ne disent rien (ni « à vous », ni « à la boutique »).
  const provenance = (emplacement: Parameters<typeof provenanceDeLObjet>[0], id: string): Provenance | null => {
    if (g.moi) return null;
    const trouvee = provenanceDeLObjet(emplacement, id, inventaire ? quantitePossedee(inventaire, emplacement, id) > 0 : false);
    return trouvee && trouvee.kind !== "gratuit" && !inventaire ? null : trouvee;
  };
  const lien = (mots: string, ancre: string, pochette?: PochetteDeLEtal): Provenance | null => (g.moi ? null : { kind: "lien", mots, ancre, ...(pochette ? { pochette } : {}) });
  return (
    <Fenetre titre={g.nom} onFermer={onFermer}>
      <div class="vitrine-grand-scene vitrine-teinte" data-rarete={fiche.rarete ?? undefined} data-banniere={scene ? "" : undefined} role="img" aria-label={fiche.description}>
        {scene ? <Toile largeur={scene.largeur} hauteur={scene.hauteur} cases={scene.cases} echelle={grandEcran ? 3 : 2} /> : <Toile largeur={fiche.groupe.largeur} hauteur={fiche.groupe.hauteur} cases={fiche.groupe.cases} echelle={grandEcran ? 4 : 3} />}
      </div>
      <ul class="vitrine-grand-cases" data-testid="vitrine-grand-liste">
        {lignes.map((ligne) => {
          const dessin = ligne.objet ? vignetteDeLObjet(ligne.objet.emplacement, ligne.objet.id, g.tenue) : ligne.modele ? modeleNu(ligne.modele) : null;
          return (
            <CaseEnGrand key={ligne.partie} partie={ligne.partie} nom={ligne.nom} rarete={ligne.rarete} ou={ligne.objet ? provenance(ligne.objet.emplacement, ligne.objet.id) : lien("Boutique ou booster", "gaulois-uniques")} onAller={onFermer}>
              {dessin && <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={echelleEntiere(dessin.largeur, dessin.hauteur, COTE_DE_CASE, 3)} class="case-dessin" />}
            </CaseEnGrand>
          );
        })}
        {familier && (
          <CaseEnGrand partie="Familier" nom={familier.nom} rarete={familier.rarete} ou={lien("Booster des familiers", "familiers")} onAller={onFermer}>
            <DessinFamilier familier={familier} place={COTE_DE_CASE} maximum={3} class="case-dessin" />
          </CaseEnGrand>
        )}
        {banniere && vignette && (
          <CaseEnGrand partie="Bannière" nom={banniere.nom} rarete={banniere.rarete} ou={lib?.estDeLaPochette(banniere) ? lien("Booster des bannières", "pochettes", "bannieres") : lien("À la boutique", "bannieres")} onAller={onFermer}>
            <Toile largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} class="case-dessin vitrine-grand-banniere" />
          </CaseEnGrand>
        )}
      </ul>
    </Fenetre>
  );
}

/** Le côté, en pixels, de la place du dessin dans une case de la fenêtre : celui des cases du vestiaire. */
const COTE_DE_CASE = 80;

/**
 * Une case de la fenêtre : la même que celles du vestiaire (cadre et fond de la rareté, losanges), sans être un bouton.
 * Au-dessus du dessin, ce que c'est (« Tête », « Familier ») ; dessous, son nom et sa rareté.
 */
function CaseEnGrand({ partie, nom, rarete, ou = null, onAller, children }: { partie: string; nom: string; rarete: Rarete | null; ou?: Provenance | null; onAller?: () => void; children: ComponentChildren }) {
  return (
    <li class="case case-montree vitrine-grand-case" data-rarete={rarete ?? "aucune"} data-lien={ou?.kind === "lien" ? "" : undefined}>
      <span class="vitrine-grand-partie">{partie}</span>
      <span class="case-image">{children}</span>
      <span class="sr-only"> : </span>
      <span class="case-nom">{nom}</span>
      {rarete && <MarqueDeRarete rarete={rarete} />}
      {ou?.kind === "a-moi" && (
        <span class="case-marque" data-testid="vitrine-a-vous">
          <span class="sr-only">, </span>à vous
        </span>
      )}
      {ou?.kind === "gratuit" && (
        <span class="vitrine-grand-ou">
          <span class="sr-only">, </span>Gratuit
        </span>
      )}
      {/* Le lien couvre toute la case : la fenêtre se ferme, et la page va là où l'objet s'obtient. */}
      {ou?.kind === "lien" && (
        <a
          class="vitrine-grand-ou vitrine-grand-lien"
          href={`#${ou.ancre}`}
          onClick={() => {
            if (ou.rayon) demanderLeRayon(ou.rayon);
            if (ou.pochette) demanderLaPochette(ou.pochette);
            onAller?.();
          }}
          data-testid="vitrine-ou"
        >
          <span class="sr-only">, où le trouver : </span>
          {ou.mots}
        </a>
      )}
    </li>
  );
}
