import type { ComponentChildren, JSX } from "preact";
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";
import {
  CARTE,
  CARTE_COUCHEE,
  CONTOURS,
  REBORDS,
  RAYON_DE_LA_ROUELLE,
  agrandir,
  caseQuiTient,
  contourDe,
  cosmos,
  devant,
  etoilesDuDivin,
  estLisse,
  finitionDe,
  flottantDe,
  graineDe,
  hachures,
  masqueDe,
  motDeLaChose,
  placerLaChose,
  plancheDe,
  rareteDeLaCarte,
  rouelle,
  sceneDeLaCarte,
  sceneQuiCouvre,
  spirales,
  tonsDe,
  type FormeDeLaCarte,
  type ImageEnCases,
  type Pose,
  type RareteDeLaCarte,
} from "../../lib/jeu/carte-du-cosmetique";
import { accentDeLaChose } from "../../lib/village/fonds-objets";
import { IconeDeRarete } from "./IconeDeRarete";
import { suivreLaCarte } from "./lumiere-des-cartes";
import { useEffetsDeLaChose, type EffetsDeCarte } from "./effets-des-cartes";

/**
 * La carte d'un cosmétique : le modèle unique du site (28 novembre 2026, demande du pilote : « je veux qu'un seul modèle de
 * cartes et NON plusieurs ! »), celui de l'aperçu « Cartes pleine image » qu'il a validé rareté par rareté. Partout où un
 * objet, un familier ou un Gaulois unique paraît en carte : boutique, vestiaire, marché, forge, pass, vitrine, fenêtres
 * d'achat, ouverture des boosters.
 *
 * La forme d'une carte à collectionner (63 sur 88, 70 sur 98 cases), coins arrondis, un rebord léger de deux cases. Trois
 * plans en relief qui bougent avec une inclinaison lente : la scène de la chose (et sa finition : prisme et cosmos du divin,
 * dorure à spirales du légendaire, rouelle d'émail du mystique, gravure de l'épique), la chose seule en grand, cernée d'une
 * case à la couleur de sa rareté et qui s'allume au survol, puis le devant (étoiles, feuilles d'or, perles d'émail,
 * éclats ; les bandeaux pleins du commun et du peu commun). En tête : le coût en énergie dans une pièce, le nom et le rôle au
 * duel, la force dans un écusson ; la boîte des effets (mots-clés et repos) s'ouvre d'un appui sur toutes les lignes du
 * duel ; en pied : la rareté, l'emplacement, le numéro du duel. Les effets ne paraissent qu'à qui voit le duel.
 *
 * Tout ce qui est écrit vient du site : le dessin de la chose, sa scène (`fondSeul`), les effets du duel (`ficheDe` par
 * `useEffetsDeLaChose`), les icônes de rareté. Les dessins sont décoratifs : le nom, la rareté et les effets sont écrits.
 * La carte se dessine à l'approche de l'écran, et ne bouge que vue (`lumiere-des-cartes.ts`).
 */

/** Les noms des raretés, en mots. */
const NOMS_DES_RARETES: Readonly<Record<RareteDeLaCarte, string>> = {
  base: "De base",
  commun: "Commun",
  "peu-commun": "Peu commun",
  epique: "Épique",
  mystique: "Mystique",
  legendaire: "Légendaire",
  saison: "Saison",
  divin: "Divin",
};
export const nomDeLaRarete = (r: string | null | undefined): string => NOMS_DES_RARETES[rareteDeLaCarte(r)];

/** La chose d'une carte : son nom, sa rareté, la clé de son fond, son dessin, et comment la poser. */
export interface ChoseDeLaCarte {
  nom: string;
  /** Sa rareté ; `null` : un objet gratuit, « de base ». */
  rarete: string | null;
  /** La clé du fond de la chose (`cleDeLObjet`, `cleDuFamilier`, `cleDuModele`). */
  cle: string;
  /** Le dessin de la chose ; `null` : la carte n'a que sa scène (une bannière, le trésor des statères). */
  dessin: ImageEnCases | null;
  /** Au milieu (un objet), au sol (un familier), contre le bas (un Gaulois unique). */
  pose?: Pose;
  /** Le mot sous le nom quand le duel n'en dit rien ; sinon le mot de l'emplacement (« Tête », « Familier »…). */
  type?: string;
  /** Quelques mots de plus, dans la boîte de la carte quand le duel n'en dit rien (la taille d'un familier). */
  sous?: string | null;
}

export interface ProprietesDeLaCarte extends ChoseDeLaCarte {
  /** Les effets à écrire ; sans cette valeur, ceux du duel pour qui le voit (`useEffetsDeLaChose`). */
  effets?: EffetsDeCarte | null;
  /** Une grande carte (ouverture d'un booster) : au repos, sa lumière se promène. */
  grande?: boolean;
  /** Une carte de fenêtre (achat, objet reçu) : plus grande qu'une case, sa lumière se promène aussi. */
  moyenne?: boolean;
  /** Sa largeur, en pixels ; sinon celle de sa place. */
  largeur?: number;
  /** La carte est un bouton (une case du vestiaire, de la boutique) : ses attributs. */
  bouton?: JSX.HTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | undefined>;
  /** Les marques posées dans les coins de l'image (« Nouveau », « en vente », « essai », la plaque). */
  marques?: ComponentChildren;
  /** L'état, sous la carte : le prix, « À vous », « Porté ». */
  etat?: ComponentChildren;
  /** Ce qui se lit en plus, pour les lecteurs d'écran, dans le bouton de la carte. */
  dit?: ComponentChildren;
  /** Une autre scène que celle de la chose (une bannière, le trésor des statères), posée sur toute la carte. */
  scene?: ImageEnCases | null;
  /** Une image du site (la carte du membre et sa finition) posée au milieu de l'image, à la place du dessin. */
  image?: ComponentChildren;
  /** L'image couvre toute la carte, comme une scène. */
  imagePleine?: boolean;
  /** L'agrandissement le plus fort de la chose (3 par défaut). */
  agrandiAuPlus?: number;
  /** Les couleurs d'une autre rareté que celle de la carte (les statères, toujours en or). */
  tons?: string;
  /** La carte couchée, 124 sur 89 cases (une bannière, scène en paysage). */
  couchee?: boolean;
  /** Le milieu et la droite du pied, à la place de l'emplacement et du numéro du duel (« Familier » et sa taille). */
  piedMilieu?: ComponentChildren;
  piedDroit?: ComponentChildren;
  /** Le pied, quand il dit autre chose que la rareté, l'emplacement et le numéro du duel : ses trois places. */
  pied?: readonly [ComponentChildren, ComponentChildren, ComponentChildren];
  testid?: string;
  class?: string;
}

/** Une planche agrandie quatre fois, en adresse d'image : les masques restent nets sur une grande carte. */
const masque = (cle: string, fabriquer: () => ReturnType<typeof masqueDe>): string => urlDeLaPlanche(`cc|${cle}`, () => agrandir(fabriquer(), 4));

/**
 * L'empreinte d'un dessin (FNV-1a sur ses cases) : le même dessin, redonné en un autre tableau, retrouve ses images déjà
 * faites ; la page n'en garde jamais deux pour lui.
 */
function empreinte(d: ImageEnCases): string {
  let h = 0x811c9dc5;
  for (const c of d.cases) {
    const s = c ?? ".";
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return `${d.largeur}x${d.hauteur}:${(h >>> 0).toString(36)}`;
}
const EMPREINTES = new WeakMap<readonly (string | null)[], string>();
const empreinteDe = (d: ImageEnCases): string => {
  let e = EMPREINTES.get(d.cases);
  if (!e) EMPREINTES.set(d.cases, (e = empreinte(d)));
  return e;
};

/** Les images d'un dessin : la chose, son masque, son contour ; chacune ne se peint qu'une fois dans la page. */
function imagesDe(d: ImageEnCases): { chose: string; masque: string; contour: (couleur: string) => string } {
  const id = empreinteDe(d);
  return {
    chose: urlDeLaPlanche(`cc-chose|${id}`, () => plancheDe(d)),
    masque: masque(`masque|${id}`, () => masqueDe(d)),
    contour: (couleur) => urlDeLaPlanche(`cc-contour|${id}|${couleur}`, () => contourDe(d, couleur)),
  };
}

/** La carte est-elle près de l'écran ? Ses dessins ne se font qu'alors (une boutique en compte des centaines). */
function useProche(ref: { current: HTMLElement | null }): boolean {
  const [proche, setProche] = useState(() => typeof IntersectionObserver !== "function");
  useEffect(() => {
    const el = ref.current;
    if (proche || !el) return;
    const o = new IntersectionObserver(
      (vues) => {
        if (vues.some((v) => v.isIntersecting)) {
          setProche(true);
          o.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [proche]);
  return proche;
}

/** Une couche en cases : une image nette, à sa place dans la carte, en cases. */
function Couche({ classe, image, x, y, l, h, style }: { classe: string; image: string; x: number; y: number; l: number; h: number; style?: Record<string, string> }) {
  return <span class={classe} style={{ "--x": String(x), "--y": String(y), "--l": String(l), "--h": String(h), backgroundImage: image, ...style }} aria-hidden="true" />;
}

/** Les trois plans : la scène et sa finition, la chose, le devant. Décoratifs. */
function Plans({ rarete, teinte, cle, dessin, pose, scene: donnee, forme, auPlus }: { rarete: RareteDeLaCarte; teinte: RareteDeLaCarte; cle: string; dessin: ImageEnCases | null; pose: Pose; scene: ImageEnCases | null; forme: FormeDeLaCarte; auPlus: number }) {
  const W = forme.largeur;
  const H = forme.hauteur;
  const place = useMemo(() => (dessin ? placerLaChose(dessin.largeur, dessin.hauteur, pose, auPlus) : null), [dessin, pose, auPlus]);
  const accent = useMemo(() => accentDeLaChose(cle, dessin), [cle, dessin]);
  const scene = useMemo(() => {
    if (donnee) return urlDeLaPlanche(`cc-scene-donnee|${empreinteDe(donnee)}|${W}x${H}`, () => plancheDe(sceneQuiCouvre(donnee, W, H)));
    const p = place ?? placerLaChose(20, 20, pose);
    return urlDeLaPlanche(`cc-scene|${cle}|${rarete}|${p.x},${p.y},${p.l},${p.h}|${accent}`, () => plancheDe(sceneDeLaCarte(cle, rarete, accent, p)));
  }, [cle, rarete, place, accent, donnee, W, H, pose]);
  const images = dessin ? imagesDe(dessin) : null;
  const { finition, devant: sorte } = finitionDe(rarete);
  const graine = graineDe(cle);
  const cy = place ? Math.round(place.y + place.h / 2) : Math.round((forme.zone[0] + forme.zone[1]) / 2);
  const R = RAYON_DE_LA_ROUELLE;
  return (
    <>
      <span class="cc-art" aria-hidden="true">
        <Couche classe="cc-scene" image={scene} x={0} y={0} l={W} h={H} />
        {finition === "prisme" && (
          <>
            <span class="cc-prisme" />
            <span class="cc-cosmos cc-plan-scene" style={{ "--masque": masque(`cosmos|${graine}|${W}`, () => cosmos(graine, W, H)) }} />
          </>
        )}
        {finition === "dorure" && (
          <>
            <span class="cc-dorure-chaude" />
            <span class="cc-dorure" />
            <span class="cc-spirales" style={{ backgroundImage: urlDeLaPlanche("cc-spirales", spirales) }} />
            <span class="cc-eclat-or" />
          </>
        )}
        {finition === "rouelle" && place && (
          <span class="cc-plan-scene cc-roue" style={{ "--x": String(Math.round(W / 2) - R), "--y": String(cy - R), "--l": String(2 * R + 1), "--h": String(2 * R + 1) }}>
            <span class="cc-rouelle" style={{ backgroundImage: urlDeLaPlanche("cc-rouelle", () => rouelle(false)) }} />
            <span class="cc-rouelle-email" style={{ backgroundImage: urlDeLaPlanche("cc-rouelle-email", () => rouelle(true)) }} />
          </span>
        )}
        {finition === "gravure" && <span class="cc-gravure" style={{ backgroundImage: urlDeLaPlanche("cc-hachures", hachures) }} />}
        <span class="cc-lueur" />
        {place && images && (
          <span class="cc-chose" style={{ "--x": String(place.x), "--y": String(place.y), "--l": String(place.l), "--h": String(place.h), "--k": String(place.k) }}>
            <span class="cc-chose-dessin" style={{ backgroundImage: images.chose }} />
            {!estLisse(rarete) && <span class="cc-objet" style={{ "--masque": images.masque }} />}
            <span class="cc-contour" style={{ backgroundImage: images.contour(CONTOURS[teinte]) }} />
          </span>
        )}
      </span>
      {sorte && (
        <span class="cc-vitre" aria-hidden="true">
          {sorte === "etoiles" ? (
            <span class="cc-etoiles cc-plan-avant" style={{ backgroundImage: urlDeLaPlanche("carte-etoiles", etoilesDuDivin) }} />
          ) : (
            <span class="cc-devant cc-plan-avant" data-sorte={sorte} style={{ backgroundImage: urlDeLaPlanche(`cc-devant|${sorte}|${graine}|${W}`, () => devant(sorte, graine, W, H)) }} />
          )}
        </span>
      )}
    </>
  );
}

/** Le nom tient sur sa ligne : la lettre rapetisse plutôt que d'être coupée (de 6,4 à 3,6 cases). */
function useNomQuiTient(nom: string): { current: HTMLSpanElement | null } {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajuster = (): void => {
      el.style.removeProperty("--nom");
      let f = 6.4;
      while (el.scrollWidth > el.clientWidth + 1 && f > 3.6) {
        f -= 0.2;
        el.style.setProperty("--nom", f.toFixed(1));
      }
    };
    ajuster();
    void document.fonts?.ready.then(ajuster);
    if (typeof ResizeObserver !== "function") return;
    const o = new ResizeObserver(ajuster);
    o.observe(el);
    return () => o.disconnect();
  }, [nom]);
  return ref;
}

/** La boîte des effets : les mots-clés en bref et le repos ; d'un appui, toutes les lignes du duel. Échap la referme. */
function BoiteDesEffets({ nom, effets, attributs }: { nom: string; effets: EffetsDeCarte; attributs: Record<string, unknown> }) {
  const [ouverte, setOuverte] = useState(false);
  const id = `${useId()}-effets`;
  const duel = effets.duel;
  const premiere = effets.lignes[0];
  return (
    <span class="cc-dessus" {...attributs}>
      <button
        type="button"
        class="cc-effets"
        aria-expanded={ouverte}
        aria-controls={id}
        data-testid="carte-effets"
        onClick={(e) => {
          e.stopPropagation();
          setOuverte((o) => !o);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && ouverte) {
            e.stopPropagation();
            setOuverte(false);
          }
        }}
      >
        <span class="sr-only">{ouverte ? "Fermer les effets de" : "Lire les effets de"} « {nom} »</span>
        <span class="cc-bref" aria-hidden="true">
          {duel && duel.icones.length > 0
            ? duel.icones.map((m, i) => (
                <span key={i} class="cc-puce">
                  <i class="cc-icone" style={{ backgroundImage: m.url }} />
                  <span class="cc-puce-nom">{m.nom}</span>
                </span>
              ))
            : premiere && <span class="cc-puce cc-puce-texte">{premiere.texte || premiere.gras}</span>}
          {duel && <span class="cc-repos">Repos {duel.repos}</span>}
        </span>
        <span class="cc-tout" id={id}>
          {effets.lignes.map((l, i) => (
            <span key={i} class="cc-ligne" data-ton={l.ton ?? undefined}>
              {l.icone ? <i class="cc-icone" style={{ backgroundImage: l.icone }} aria-hidden="true" /> : <i class="cc-sans" aria-hidden="true" />}
              <span>
                <b>{l.gras}</b> {l.texte}
              </span>
            </span>
          ))}
          {duel && (
            <span class="cc-ligne cc-ligne-repos">
              <i class="cc-sans" aria-hidden="true" />
              <span>
                Repos : {duel.repos} manche{duel.repos > 1 ? "s" : ""} après avoir servi.
              </span>
            </span>
          )}
        </span>
      </button>
    </span>
  );
}

/**
 * La largeur d'une grande carte (la sortie d'un booster), en pixels, suivie quand l'écran change : quatre pixels la case,
 * moins sur un écran petit ou bas (`caseQuiTient`), et jamais plus large que l'écran (une carte couchée sur un téléphone).
 */
export function useLargeurDeGrandeCarte(couchee = false): number {
  const forme = couchee ? CARTE_COUCHEE : CARTE;
  const lire = (): number => {
    if (typeof window === "undefined") return forme.largeur * 4;
    const p = caseQuiTient(window.innerWidth, window.innerHeight, forme.hauteur);
    return forme.largeur * Math.max(2, Math.min(p, Math.floor((window.innerWidth - 32) / forme.largeur)));
  };
  const [l, setL] = useState(lire);
  useEffect(() => {
    const suivre = (): void => setL(lire());
    window.addEventListener("resize", suivre);
    return () => window.removeEventListener("resize", suivre);
  }, [couchee]);
  return l;
}

/** La carte d'un cosmétique (voir en tête du fichier). */
export function CarteDeCosmetique(p: ProprietesDeLaCarte) {
  const { nom, cle, dessin, pose = "centre", type, sous = null, grande = false, moyenne = false, largeur, bouton, marques, etat, dit, testid, scene = null, image, imagePleine = false, agrandiAuPlus = 3, couchee = false, pied, piedMilieu, piedDroit } = p;
  // Une grande carte sans largeur donnée prend celle qui tient dans l'écran.
  const largeurQuiTient = useLargeurDeGrandeCarte(couchee);
  const large = largeur ?? (grande ? largeurQuiTient : undefined);
  const forme = couchee ? CARTE_COUCHEE : CARTE;
  const rarete = rareteDeLaCarte(p.rarete);
  const lues = useEffetsDeLaChose(p.effets === undefined ? cle : null);
  const effets = p.effets === undefined ? lues : p.effets;
  const duel = effets?.duel ?? null;
  const place = useRef<HTMLDivElement>(null);
  const proche = useProche(place);
  const nomRef = useNomQuiTient(nom);
  useEffect(() => {
    const el = place.current;
    return el ? suivreLaCarte(el, grande || moyenne) : undefined;
  }, [grande, moyenne]);
  const teinte = p.tons ? rareteDeLaCarte(p.tons) : rarete;
  const t = tonsDe(teinte);
  const style = { "--c-haut": t.haut, "--c-bas": t.bas, "--c-bord": t.bord, "--c-encre": t.encre, "--c-rebord": REBORDS[teinte] } as JSX.CSSProperties;
  const mot = type ?? motDeLaChose(cle);
  const emplacement = motDeLaChose(cle);
  // Le pied redit l'emplacement quand le rôle du duel a pris sa place sous le nom ; sans duel, la boîte des effets prise,
  // les mots de plus (la taille d'un familier) vont au pied.
  const ou = duel || mot !== emplacement ? emplacement : effets && sous ? sous : "";
  const lisse = estLisse(rarete);
  const role = duel ? duel.roleNom.charAt(0) + duel.roleNom.slice(1).toLowerCase() : null;
  const face = (
    <span class="cc-face">
      <span class="cc-corps">
        {proche && <Plans rarete={rarete} teinte={teinte} cle={cle} dessin={dessin} pose={pose} scene={scene} forme={forme} auPlus={agrandiAuPlus} />}
        {image && <span class={`cc-image${imagePleine ? " cc-image-pleine" : ""}`}>{image}</span>}
        <span class={`cc-tete${lisse ? " cc-plan-bande" : ""}`}>
          {duel && duel.cout > 0 && (
            <span class="cc-cout" title={`Coût : ${duel.cout} d'énergie`}>
              <i class="cc-eclair" aria-hidden="true" />
              <b class="tnum">{duel.cout}</b>
              <span class="sr-only"> d'énergie</span>
            </span>
          )}
          <span class="cc-titre">
            <span ref={nomRef} class="cc-nom">
              {nom}
            </span>
            <span class="cc-type">
              {duel ? (
                <>
                  <i class="cc-tuile" style={{ backgroundImage: duel.urlDuRole }} aria-hidden="true" />
                  {role}
                </>
              ) : (
                mot
              )}
            </span>
          </span>
          {duel && (
            <span class="cc-force">
              <small>Force</small>
              <b class="tnum">{duel.force}</b>
            </span>
          )}
        </span>
        <span class={`cc-pied${lisse ? " cc-plan-bande" : ""}`}>
          {pied ? (
            <>
              <span class="cc-rar">{pied[0]}</span>
              <span class="cc-ou">{pied[1]}</span>
              <span class="cc-num tnum">{pied[2]}</span>
            </>
          ) : (
            <>
              <span class="cc-rar">
                {rarete !== "base" && <IconeDeRarete rarete={rarete} />}
                {NOMS_DES_RARETES[rarete]}
              </span>
              {piedMilieu !== undefined ? <span class="cc-ou">{piedMilieu}</span> : ou ? <span class="cc-ou">{ou}</span> : <span aria-hidden="true" />}
              <span class="cc-num tnum">{piedDroit !== undefined ? piedDroit : duel ? `n° ${duel.numero}/${duel.total}` : ""}</span>
            </>
          )}
        </span>
        <span class="cc-rebord" aria-hidden="true" />
        {marques && <span class="cc-marques">{marques}</span>}
      </span>
    </span>
  );
  // La rareté, le cran de l'écriture et les couleurs vont sur la carte et sur sa boîte des effets : la copie d'une carte
  // qu'on glisse au vestiaire les garde.
  const marques_ = { "data-rarete": rarete, "data-tons": teinte !== rarete ? teinte : undefined, "data-flottant": flottantDe(rarete) ?? undefined, "data-forme": couchee ? "couchee" : undefined, style };
  // La boîte du bas : les effets du duel ; sans eux, les mots de plus (la description d'un Gaulois unique), à lire en entier
  // d'un appui.
  const boite: EffetsDeCarte | null = effets ?? (sous ? { duel: null, lignes: [{ icone: null, cases: 11, gras: "", texte: sous, ton: null }] } : null);
  const classe = ["cc-carte", p.class, typeof bouton?.class === "string" ? bouton.class : null].filter(Boolean).join(" ");
  return (
    <div ref={place} class="cc-place" data-grande={grande ? "" : undefined} data-taille={couchee ? "couchee" : moyenne ? "moyenne" : undefined} data-testid={testid} style={large ? { width: `${large}px` } : undefined}>
      {bouton ? (
        <button type="button" {...bouton} class={classe} {...marques_}>
          {face}
          {dit}
          {etat && <span class="cc-etat">{etat}</span>}
        </button>
      ) : (
        <div class={classe} {...marques_}>
          {face}
          {dit}
          {etat && <span class="cc-etat">{etat}</span>}
        </div>
      )}
      {boite && <BoiteDesEffets nom={nom} effets={boite} attributs={marques_} />}
    </div>
  );
}
