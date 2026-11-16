import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { GAULOIS as PLACE_DU_GAULOIS, LARGEUR as DECOR_LARGEUR, HAUTEUR as DECOR_HAUTEUR } from "../../../supabase/functions/code-discord/decors/commun";
import { decrireGaulois, type Rarete } from "../../lib/gaulois";
import { ServerError, call } from "../../lib/compte/api";
import { apercuAvecFamilier, familierDe } from "../../lib/village/familiers";
import { lireVitrine, rareteDuCadre, type GauloisVitrine } from "../../lib/village/vitrine";
import { Loading, Problem, messageOf } from "../compte/common";
import { charger as chargerLesBannieres } from "./Bannieres";
import { MarqueDeRarete } from "./BoutiquePixels";
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
  gaulois: GauloisVitrine;
  /** Le Gaulois et son familier côte à côte, comme au vestiaire. */
  groupe: Dessin;
  rarete: Rarete | null;
  description: string;
}

function fichesDe(gaulois: readonly GauloisVitrine[]): Fiche[] {
  return gaulois.map((g, cle) => {
    const familier = familierDe(g.familier);
    return {
      cle,
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

/** Les cartes : une par Gaulois, aussi large que lui et son familier, au cadre de la rareté la plus haute portée. */
function Cartes({ gaulois }: { gaulois: readonly GauloisVitrine[] }) {
  const fiches = useMemo(() => fichesDe(gaulois), [gaulois]);
  const echelle = useEcranDe(768) ? 3 : 2;
  const lib = useLibDesBannieres(fiches.some((f) => Boolean(f.gaulois.banniere)));
  if (fiches.length === 0) return null;
  return (
    <ul class="vitrine-cartes" data-testid="vitrine" aria-label="Les Gaulois du clan">
      {fiches.map((f) => {
        const banniere = lib?.banniereParId(f.gaulois.banniere) ?? null;
        const large = f.groupe.largeur * echelle;
        return (
          <li key={f.cle} class="vitrine-carte vitrine-teinte" data-rarete={f.rarete ?? undefined} data-moi={f.gaulois.moi || undefined} data-banniere={banniere?.id} style={{ "--vitrine-l": `${large}px` }}>
            <div class="vitrine-carte-image">
              {/* À l'échelle du Gaulois, ou d'un cran de plus si la carte peut être plus large que la bannière. */}
              {lib && banniere && <FondDeBanniere lib={lib} id={banniere.id} echelle={Math.max(echelle, Math.ceil((large + MARGE_DE_CARTE) / FOND.largeur))} />}
              <Toile largeur={f.groupe.largeur} hauteur={f.groupe.hauteur} cases={f.groupe.cases} echelle={echelle} class="vitrine-carte-dessin" />
            </div>
            <div class="vitrine-carte-pied">
              <span class="vitrine-nom">{f.gaulois.nom}</span>
              <span class="sr-only"> {f.description}</span>
              {banniere && <span class="sr-only"> Bannière : {banniere.nom}.</span>}
              {f.rarete && <MarqueDeRarete rarete={f.rarete} />}
            </div>
            {f.gaulois.moi && <span class="vitrine-moi">Moi</span>}
          </li>
        );
      })}
    </ul>
  );
}

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
/** Les refus qu'une nouvelle lecture ne changera pas : pas de « Réessayer ». */
const SANS_RETOUR = new Set(["not_validated", "suspended", "not_signed_in"]);

type Lecture = { kind: "attente" } | { kind: "lecture" } | { kind: "erreur"; message: string; reessayer: boolean } | { kind: "prete"; gaulois: GauloisVitrine[] };

/**
 * L'onglet « La vitrine » : lit `get_village` à sa première ouverture, puis discrètement à chaque retour (un membre a pu
 * changer sa tenue, son familier ou sa bannière) ; une relecture qui échoue garde les cartes à l'écran. Le serveur décide de
 * qui la voit : un compte validé ou de l'encadrement.
 */
export default function VitrineDuClan({ actif }: { actif: boolean }) {
  const [lecture, setLecture] = useState<Lecture>({ kind: "attente" });

  const lire = async (discret: boolean) => {
    if (!discret) setLecture({ kind: "lecture" });
    try {
      const gaulois = lireVitrine(await call<unknown>("get_village"));
      if (gaulois) setLecture({ kind: "prete", gaulois });
      else if (!discret) setLecture({ kind: "erreur", message: ILLISIBLE, reessayer: true });
    } catch (e) {
      if (!discret) setLecture({ kind: "erreur", message: messageOf(e), reessayer: !(e instanceof ServerError && SANS_RETOUR.has(e.code)) });
    }
  };

  useEffect(() => {
    if (actif) void lire(lecture.kind === "prete");
  }, [actif]);

  if (lecture.kind === "attente" || lecture.kind === "lecture") return <Loading label="Lecture de la vitrine…" />;
  if (lecture.kind === "erreur") return <Problem message={lecture.message} onRetry={lecture.reessayer ? () => void lire(false) : undefined} />;
  return <Cartes gaulois={lecture.gaulois} />;
}
