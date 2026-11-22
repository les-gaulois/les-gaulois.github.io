import type { ComponentChildren } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { RARETES_DES_OBJETS } from "../../lib/gaulois";
import { CARTE_DE_SORTIE, motDeLaChose, placerDansLaZone, placerQuiDeborde, prolongerLaScene, zoneDansLaScene, type ImageEnCases, type PlaceDeLaChose, type PoseDansLaCarte } from "../../lib/jeu/cartes-d-objets";
import { accentDeLaChose, fondSeul } from "../../lib/village/fonds-objets";
import { MarqueDeRarete, Pixels } from "./BoutiquePixels";
import { FicheDesEffets, HabitDeCarte, RangDuDuel, RefletDeCarte } from "./CarteDObjet";
import type { EffetsDeCarte } from "./effets-des-cartes";
import { IconeDeRarete } from "./IconeDeRarete";

/**
 * Les cartes des raretés hautes (22 novembre 2026, choix du pilote sur les modèles de Claude Fable 5.2) : « pour les
 * mystiques Par le haut, le nom devant ; et divin et légendaire Les bandeaux fins », en grand à la sortie des boosters
 * comme en petit dans les cases (« dans les cases je préfère B et 1 »).
 * - La pleine image (légendaire, saison, divin) : la scène de la chose couvre toute la carte, sous un liseré en cases ; un
 *   bandeau fin en haut (le nom, la rareté), un en bas (le rang du duel) ; la chose en grand entre les deux. En grand, la fiche
 *   des effets monte du bas au survol, au toucher ou au clavier.
 * - Le débordement (mystique) : la carte d'avant, son cadre en cases, mais la chose sort de sa fenêtre par le haut et passe
 *   sur le cadre ; le nom reste écrit devant elle, cerné de clair.
 * Les corps sont posés dans la case (`Case`, `CaseObjet`, `CaseMontree`, la case de la forge) ou dans la carte de sortie
 * (`CarteDeSortie.tsx`), qui leur donnent l'élément, ses classes, ses variables et ses gestes. La scène et la chose sont
 * décoratives : le nom, la rareté et les effets sont écrits.
 */

/** Le nom d'une rareté, en mots. */
export const nomDeLaRarete = (r: string): string => (RARETES_DES_OBJETS as Readonly<Record<string, { nom: string }>>)[r]?.nom ?? r;

/** La taille d'un élément, en pixels, et sa place dans la carte, suivies quand elles changent (et quand les polices arrivent). */
function useBoite<T extends HTMLElement>(): [{ current: T | null }, { l: number; h: number; gauche: number; haut: number }] {
  const ref = useRef<T>(null);
  const [b, setB] = useState({ l: 0, h: 0, gauche: 0, haut: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let fini = false;
    const mesurer = (): void => {
      if (fini) return;
      const l = el.clientWidth;
      const h = el.clientHeight;
      const gauche = el.offsetLeft;
      const haut = el.offsetTop;
      setB((a) => (a.l === l && a.h === h && a.gauche === gauche && a.haut === haut ? a : { l, h, gauche, haut }));
    };
    mesurer();
    // Sa place change aussi quand ce qui la précède change de taille : la carte entière est suivie.
    void document.fonts?.ready.then(mesurer);
    if (typeof ResizeObserver !== "function") return () => void (fini = true);
    const o = new ResizeObserver(mesurer);
    o.observe(el);
    if (el.parentElement) o.observe(el.parentElement);
    return () => {
      fini = true;
      o.disconnect();
    };
  }, []);
  return [ref, b];
}

/** Où la chose est posée dans sa scène, en cases : la scène garde cette place calme et pose son sol sous elle. */
type PlaceDansLaScene = ReturnType<typeof zoneDansLaScene>;

/**
 * La scène d'une chose, sans la chose, qui remplit `l` sur `h` pixels à `p` pixels la case, dans la couleur de la chose.
 * Plus grande qu'une scène ne sait se dessiner (128 sur 88 cases), elle se prolonge (`prolongerLaScene`), son milieu sur
 * celui de la chose.
 */
function Scene({ cle, rarete, l, h, p, accent, place }: { cle: string; rarete: string; l: number; h: number; p: number; accent: string; place: PlaceDansLaScene }) {
  const W = Math.max(24, Math.floor(l / p));
  const H = Math.max(20, Math.floor(h / p));
  const { zone, sol } = place;
  const image = useMemo<ImageEnCases>(() => {
    const lb = Math.min(W, 128);
    const hb = Math.min(H, 88);
    const ox = Math.round((W - lb) / 2);
    const oy = Math.max(0, Math.min(H - hb, Math.round(zone.y + zone.hauteur / 2 - hb / 2)));
    const fond = fondSeul(cle, { largeur: lb, hauteur: hb, rarete, accent, zone: { ...zone, x: zone.x - ox, y: zone.y - oy }, sol: sol - oy });
    return lb === W && hb === H ? fond : prolongerLaScene(fond, W, H, ox, oy);
    // La zone par ses nombres : elle est un nouvel objet à chaque mesure.
  }, [cle, rarete, W, H, accent, zone.x, zone.y, zone.largeur, zone.hauteur, sol]);
  return <Pixels largeur={image.largeur} hauteur={image.hauteur} cases={image.cases} echelle={p} class="co-scene" />;
}

/** Le dessin de la chose, en cases nettes, à sa place : `e` pixels la case. */
function Chose({ dessin, place }: { dessin: ImageEnCases; place: PlaceDeLaChose }) {
  return (
    <span class="co-chose" style={{ left: `${place.gauche}px`, top: `${place.haut}px` }} aria-hidden="true">
      <Pixels largeur={dessin.largeur} hauteur={dessin.hauteur} cases={dessin.cases} echelle={place.e} />
    </span>
  );
}

/** Les joyaux au milieu des bords du liseré : le divin et le légendaire de saison. */
function Joyaux({ rarete }: { rarete: string }) {
  if (rarete !== "divin" && rarete !== "saison") return null;
  return (
    <>
      <span class="co-joyau" data-bord="haut" aria-hidden="true" />
      <span class="co-joyau" data-bord="bas" aria-hidden="true" />
      <span class="co-joyau" data-bord="gauche" aria-hidden="true" />
      <span class="co-joyau" data-bord="droite" aria-hidden="true" />
    </>
  );
}

/** Ce que les corps reçoivent : la chose, sa scène, ses effets, et ce que la case pose dessus ou dessous. */
export interface ProprietesDuCorps {
  nom: string;
  rarete: string;
  /** La clé du fond de la chose (`cleDeLObjet`, `cleDuFamilier`, `cleDuModele`). */
  cle: string;
  dessin: ImageEnCases;
  effets: EffetsDeCarte | null;
  /** Les marques de la case (« à vous », « essai », la coche, la plaque) : dans les coins de l'image. */
  marques?: ComponentChildren;
  /** Ce qui suit, dans la carte (le prix, « revient… »). */
  pied?: ComponentChildren;
  /** Quelques mots de plus (la taille d'un familier, la description d'un Gaulois unique). */
  sous?: string | null;
  /** Où poser la chose : au milieu (un objet), au sol (un familier), contre le bas (un buste). */
  pose?: PoseDansLaCarte;
  /** La carte de poche (`CarteDePoche.tsx`) : sa tête à la place du nom, et son bas à la place du rang et du pied. */
  tete?: ComponentChildren;
  bas?: ComponentChildren;
}

/* ---------- En petit, dans les cases ---------- */

const P_PETIT = 2;

/** La pleine image en petit : la scène sur toute la carte, le nom et l'icône de rareté en haut, le rang du duel en bas. */
export function PetitePleine({ nom, rarete, cle, dessin, effets, marques, pied, pose = "centre", tete, bas }: ProprietesDuCorps) {
  const p = P_PETIT;
  const [fond, boiteFond] = useBoite<HTMLSpanElement>();
  const [zone, boiteZone] = useBoite<HTMLSpanElement>();
  const accent = useMemo(() => accentDeLaChose(cle, dessin), [cle, dessin]);
  const place = boiteZone.l > 0 ? placerDansLaZone(dessin, boiteZone.l, boiteZone.h, p, pose, [2, 1.5, 1]) : null;
  // La scène commence au liseré, trois cases dans la carte.
  const dansLaScene = place && boiteFond.l > 0 ? zoneDansLaScene(place, boiteZone.gauche - 3 * p, boiteZone.haut - 3 * p, p, Math.floor(boiteFond.l / p), Math.floor(boiteFond.h / p), pose) : null;
  return (
    <>
      <span ref={fond} class="co-pleine-fond" aria-hidden="true">
        {dansLaScene && <Scene cle={cle} rarete={rarete} l={boiteFond.l} h={boiteFond.h} p={p} accent={accent} place={dansLaScene} />}
        <RefletDeCarte rarete={rarete} />
      </span>
      <span class="co-lisere" aria-hidden="true" />
      <Joyaux rarete={rarete} />
      <span class="co-feuille-cadre" aria-hidden="true" />
      <span class="co-bande" data-bord="haut">
        {tete ?? (
          <>
            <span class="case-nom co-nom">{nom}</span>
            <IconeDeRarete rarete={rarete} />
            <span class="sr-only">, {nomDeLaRarete(rarete)}</span>
          </>
        )}
      </span>
      <span ref={zone} class="case-image co-zone">
        {place && <Chose dessin={dessin} place={place} />}
        {marques}
      </span>
      <span class="co-bande" data-bord="bas">
        {bas ?? (
          <>
            {effets?.duel ? (
              <RangDuDuel duel={effets.duel} />
            ) : (
              <span class="co-bande-mot">
                <span class="sr-only">, </span>
                {motDeLaChose(cle) || nomDeLaRarete(rarete)}
              </span>
            )}
            {pied}
          </>
        )}
      </span>
    </>
  );
}

/** La chose qui sort de sa fenêtre, et où elle est dans la scène de la fenêtre. */
function useDebordement(cle: string, dessin: ImageEnCases, p: number, dessus: number, pose: PoseDansLaCarte, echelles: readonly number[]) {
  const [fenetre, boite] = useBoite<HTMLSpanElement>();
  const accent = useMemo(() => accentDeLaChose(cle, dessin), [cle, dessin]);
  const place = boite.l > 0 ? placerQuiDeborde(dessin, boite.l / p, boite.h / p, boite.haut / p, p, dessus, pose, echelles) : null;
  const dansLaScene = place ? zoneDansLaScene(place, 0, 0, p, Math.floor(boite.l / p), Math.floor(boite.h / p), pose) : null;
  return { fenetre, boite, accent, place, dansLaScene };
}

/** Le débordement en petit : le cadre en cases, le nom devant, la chose qui sort de la fenêtre par le haut. */
export function PetiteDeborde({ nom, rarete, cle, dessin, effets, marques, pied, pose = "centre", tete, bas }: ProprietesDuCorps) {
  const p = P_PETIT;
  const { fenetre, boite, accent, place, dansLaScene } = useDebordement(cle, dessin, p, 4, pose, [2, 1.5, 1]);
  return (
    <>
      <HabitDeCarte rarete={rarete} />
      {tete ?? <span class="case-nom co-nom co-nom-devant">{nom}</span>}
      <span ref={fenetre} class="case-image co-fenetre">
        <span class="co-fenetre-fond" aria-hidden="true">
          {dansLaScene && <Scene cle={cle} rarete={rarete} l={boite.l} h={boite.h} p={p} accent={accent} place={dansLaScene} />}
          <RefletDeCarte rarete={rarete} />
        </span>
        {place && <Chose dessin={dessin} place={place} />}
        {marques}
      </span>
      {bas ?? (
        <>
          <MarqueDeRarete rarete={rarete as Parameters<typeof MarqueDeRarete>[0]["rarete"]} />
          {effets?.duel && <RangDuDuel duel={effets.duel} />}
          {pied}
        </>
      )}
    </>
  );
}

/* ---------- En grand, à la sortie des boosters ---------- */

/** Le prix en énergie et la force, de part et d'autre du nom. */
function PrixEtForce({ effets, children }: { effets: EffetsDeCarte | null; children: ComponentChildren }) {
  const duel = effets?.duel ?? null;
  return (
    <>
      {duel && duel.cout > 0 && (
        <span class="co-cout tnum">
          <i class="co-eclair" aria-hidden="true" />
          <span class="sr-only">Prix : </span>
          {duel.cout}
          <span class="sr-only"> d'énergie. </span>
        </span>
      )}
      {children}
      {duel && (
        <span class="co-force-grande">
          <small>Force</small>
          <b class="tnum">{duel.force}</b>
        </span>
      )}
    </>
  );
}

/** Le pied d'une grande carte : le repos et le numéro de la carte, pour qui voit le duel. */
function PiedDuDuel({ effets }: { effets: EffetsDeCarte | null }) {
  const duel = effets?.duel;
  if (!duel) return null;
  return (
    <span class="co-pied-fiche co-pied-grand">
      <span>
        Repos : {duel.repos} manche{duel.repos > 1 ? "s" : ""}
      </span>
      <span class="tnum">
        n° {duel.numero}/{duel.total}
      </span>
    </span>
  );
}

/** Les cases d'une grande carte. */
const GRANDE = CARTE_DE_SORTIE;

/** La fiche des effets d'une pleine image en grand : ouverte ou non, et ce qui l'ouvre. */
export interface TiroirDesEffets {
  ouverte: boolean;
  basculer: () => void;
  id: string;
}

/**
 * La pleine image en grand (« Les bandeaux fins ») : 70 sur 116 cases. En haut, le prix, le nom et sa rareté, la force ; en
 * bas, le rôle et les icônes des mots-clés, qui sont le bouton de la fiche des effets : elle monte du bas au survol ou d'un
 * appui qui la garde ouverte.
 */
export function GrandePleine({ nom, rarete, cle, dessin, effets, sous, p, pose = "centre", tiroir = null }: ProprietesDuCorps & { p: number; tiroir?: TiroirDesEffets | null }) {
  const [zone, boiteZone] = useBoite<HTMLSpanElement>();
  const lisere = 3;
  const accent = useMemo(() => accentDeLaChose(cle, dessin), [cle, dessin]);
  const W = GRANDE.largeur - 2 * lisere;
  const H = GRANDE.hauteur - 2 * lisere;
  const place = boiteZone.l > 0 ? placerDansLaZone(dessin, boiteZone.l, boiteZone.h, p, pose, [3, 2, 1.5, 1]) : null;
  const dansLaScene = place ? zoneDansLaScene(place, boiteZone.gauche - lisere * p, boiteZone.haut - lisere * p, p, W, H, pose) : null;
  const duel = effets?.duel ?? null;
  const contenuDuBas = duel ? (
    <>
      <i class="co-tuile" style={{ backgroundImage: duel.urlDuRole, "--co-n": "15" }} aria-hidden="true" />
      <span class="co-role" style={{ color: duel.couleurDuRole }}>
        {duel.roleNom}
      </span>
      <span class="co-mots" aria-hidden="true">
        {duel.icones.map((ic, i) => (
          <i key={i} class="co-tuile" style={{ backgroundImage: ic.url, "--co-n": "11" }} title={ic.nom} />
        ))}
      </span>
    </>
  ) : sous ? (
    <span class="co-bande-sous">{sous}</span>
  ) : (
    <span class="co-bande-mot">{motDeLaChose(cle)}</span>
  );
  return (
    <>
      <span class="co-pleine-fond" aria-hidden="true">
        {dansLaScene && <Scene cle={cle} rarete={rarete} l={W * p} h={H * p} p={p} accent={accent} place={dansLaScene} />}
        <RefletDeCarte rarete={rarete} />
      </span>
      <span class="co-lisere" aria-hidden="true" />
      <Joyaux rarete={rarete} />
      <span class="co-feuille-cadre" aria-hidden="true" />
      <span class="co-bande" data-bord="haut">
        <PrixEtForce effets={effets}>
          <span class="co-titre">
            <span class="case-nom co-nom">{nom}</span>
            <span class="co-rar">
              <IconeDeRarete rarete={rarete} />
              {nomDeLaRarete(rarete)}
            </span>
          </span>
        </PrixEtForce>
      </span>
      <span ref={zone} class="co-zone">
        {place && <Chose dessin={dessin} place={place} />}
      </span>
      {effets && tiroir ? (
        <button
          type="button"
          class="co-bande co-bande-bouton"
          data-bord="bas"
          aria-expanded={tiroir.ouverte}
          aria-controls={tiroir.id}
          onClick={(e) => {
            e.stopPropagation();
            tiroir.basculer();
          }}
        >
          <span class="sr-only">Les effets{duel ? " : " : ""}</span>
          {contenuDuBas}
        </button>
      ) : (
        <span class="co-bande" data-bord="bas">
          {contenuDuBas}
        </span>
      )}
      {effets && (
        <span class="co-tiroir" id={tiroir?.id} aria-hidden={tiroir && !tiroir.ouverte ? "true" : undefined} tabIndex={tiroir?.ouverte ? 0 : -1}>
          <span class="co-ligne-grande">
            <span>{motDeLaChose(cle)}</span>
            {sous && <span class="co-sous">{sous}</span>}
          </span>
          <FicheDesEffets effets={effets} avecPied={false} />
          <PiedDuDuel effets={effets} />
        </span>
      )}
    </>
  );
}

/**
 * Le débordement en grand (« Par le haut, le nom devant ») : le prix, le nom et la force en tête, devant la chose qui sort
 * de sa fenêtre par le haut et passe sur le cadre ; puis l'emplacement et la rareté, les effets, le repos et le numéro.
 */
export function GrandeDeborde({ nom, rarete, cle, dessin, effets, sous, p, pose = "centre" }: ProprietesDuCorps & { p: number }) {
  const { fenetre, boite, accent, place, dansLaScene } = useDebordement(cle, dessin, p, 6, pose, [3, 2, 1.5, 1]);
  return (
    <>
      <HabitDeCarte rarete={rarete} />
      <span class="co-tete-grande">
        <PrixEtForce effets={effets}>
          <span class="case-nom co-nom co-nom-devant">{nom}</span>
        </PrixEtForce>
      </span>
      <span ref={fenetre} class="case-image co-fenetre">
        <span class="co-fenetre-fond" aria-hidden="true">
          {dansLaScene && <Scene cle={cle} rarete={rarete} l={boite.l} h={boite.h} p={p} accent={accent} place={dansLaScene} />}
          <RefletDeCarte rarete={rarete} />
        </span>
        {place && <Chose dessin={dessin} place={place} />}
      </span>
      <span class="co-ligne-grande">
        <span>{motDeLaChose(cle)}</span>
        <MarqueDeRarete rarete={rarete as Parameters<typeof MarqueDeRarete>[0]["rarete"]} />
      </span>
      {sous && <span class="co-sous">{sous}</span>}
      {effets && <FicheDesEffets effets={effets} avecPied={false} />}
      <PiedDuDuel effets={effets} />
    </>
  );
}
