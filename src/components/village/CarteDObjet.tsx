import { render, type JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { motionAllowed } from "../../lib/fx/motion";
import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";
import {
  cadreEnNeufParts,
  caseQuiTient,
  coinEpique,
  ecussonDeCarte,
  estEnPixels,
  etoilesDuDivin,
  joyauDuLisere,
  lisereEnNeufParts,
  motifDeFeuille,
  styleDeCarte,
  TONS_DES_CADRES,
  tonsDeLaCarte,
} from "../../lib/jeu/cartes-d-objets";
import type { Rarete } from "../../lib/gaulois";
import { MarqueDeRarete, Pixels } from "./BoutiquePixels";
import type { CarteDuDuel, EffetsDeCarte } from "./effets-des-cartes";

/**
 * Les pièces de la carte d'un cosmétique (22 novembre 2026, modèles de Claude Fable 5.2 acceptés par le pilote) : son
 * habit (cadre, coins, écussons, reflet), le rang du duel d'une petite carte et la fiche de ses effets. Les cases du
 * vestiaire, de la boutique, du marché, de la forge et du pass (`Case`, `CaseObjet`, `CaseMontree`) les posent ; la
 * feuille `24-cartes.css` les dessine. Tout l'habit est décoratif : le nom, la rareté et les effets sont écrits.
 *
 * Les noms de classe commencent par `co-` (carte d'objet), sans rien du jeu : « Mon compte » pose aussi ces cartes.
 */

/** Les variables d'une carte : ses tons, et les images de son cadre quand il est en cases. */
export function variablesDeLaCarte(rarete: string | null | undefined): JSX.CSSProperties {
  const t = tonsDeLaCarte(rarete);
  const v: Record<string, string> = { "--co-haut": t.haut, "--co-bas": t.bas, "--co-bord": t.bord, "--co-encre": t.encre };
  if (estEnPixels(rarete)) {
    v["--co-cadre"] = urlDeLaPlanche(`carte-cadre|${rarete}`, () => cadreEnNeufParts(rarete));
    v["--co-filet"] = TONS_DES_CADRES[rarete].encre;
    v["--co-ecusson"] = urlDeLaPlanche(`carte-ecusson|${rarete}`, () => ecussonDeCarte(rarete));
    v["--co-ecusson-bas"] = urlDeLaPlanche(`carte-ecusson-bas|${rarete}`, () => ecussonDeCarte(rarete, true));
    v["--co-motif"] = urlDeLaPlanche(`carte-motif|${rarete}`, () => motifDeFeuille(rarete));
    v["--co-motif-n"] = rarete === "mystique" ? "8" : "16";
    if (rarete === "divin") v["--co-etoiles"] = urlDeLaPlanche("carte-etoiles", etoilesDuDivin);
    if (rarete !== "mystique") v["--co-lisere"] = urlDeLaPlanche(`carte-lisere|${rarete}`, () => lisereEnNeufParts(rarete));
    if (rarete === "divin" || rarete === "saison") {
      v["--co-joyau"] = urlDeLaPlanche(`carte-joyau|${rarete}`, () => joyauDuLisere(rarete));
      v["--co-joyau-debout"] = urlDeLaPlanche(`carte-joyau-debout|${rarete}`, () => joyauDuLisere(rarete, true));
    }
  } else if (rarete === "epique") {
    v["--co-coin"] = urlDeLaPlanche("carte-coin-epique", coinEpique);
  }
  return v as JSX.CSSProperties;
}

/** L'habit d'une carte : son cadre, et selon sa rareté ses coins en cases, ses écussons, la lumière qui passe sur le cadre. */
export function HabitDeCarte({ rarete }: { rarete: string | null | undefined }) {
  const style = styleDeCarte(rarete);
  return (
    <>
      <span class="co-cadre" aria-hidden="true" />
      {style === "entre" && (
        <>
          <span class="co-coin" data-coin="hg" aria-hidden="true" />
          <span class="co-coin" data-coin="hd" aria-hidden="true" />
          <span class="co-coin" data-coin="bg" aria-hidden="true" />
          <span class="co-coin" data-coin="bd" aria-hidden="true" />
        </>
      )}
      {style === "pixel" && (
        <>
          <span class="co-ecusson" data-bord="haut" aria-hidden="true" />
          <span class="co-ecusson" data-bord="bas" aria-hidden="true" />
          <span class="co-feuille-cadre" aria-hidden="true" />
        </>
      )}
    </>
  );
}

/** Les pixels d'une case d'une grande carte de `cases` cases de haut, d'après la taille de l'écran, suivis quand elle change. */
export function useCaseQuiTient(cases: number): number {
  const lire = (): number => (typeof window === "undefined" ? 4 : caseQuiTient(window.innerWidth, window.innerHeight, cases));
  const [p, setP] = useState(lire);
  useEffect(() => {
    const suivre = (): void => setP(lire());
    window.addEventListener("resize", suivre);
    return () => window.removeEventListener("resize", suivre);
  }, [cases]);
  return p;
}

/** La coche d'une carte portée, dans le coin de son image : la case d'avant la posait sur le nom. */
export function CocheDeCarte() {
  return <span class="co-coche" aria-hidden="true" />;
}

/** Le reflet posé sur l'image : la feuille holographique d'une carte en pixels, le reflet doux de l'épique, rien sinon. */
export function RefletDeCarte({ rarete }: { rarete: string | null | undefined }) {
  const style = styleDeCarte(rarete);
  if (style === "pixel")
    return (
      <>
        <span class="co-holo" data-couche="a" aria-hidden="true" />
        <span class="co-holo" data-couche="b" aria-hidden="true" />
        <span class="co-lueur" aria-hidden="true" />
      </>
    );
  if (style === "entre") return <span class="co-reflet" aria-hidden="true" />;
  return null;
}

/**
 * Le reflet suit le pointeur posé sur la carte (`--co-mx`, `--co-my`, de 0 à 1) ; `angle` : la carte s'incline aussi, de
 * `angle` degrés au plus, sauf quand les animations sont coupées. Le reflet ne change aucune valeur.
 */
export function suivreLePointeur(angle = 0): { onPointerMove: (e: PointerEvent) => void; onPointerLeave: (e: PointerEvent) => void; onPointerCancel: (e: PointerEvent) => void } {
  const bouger = (e: PointerEvent): void => {
    const el = e.currentTarget as HTMLElement | null;
    // La pause et « réduire les animations » : le reflet reste posé, la carte ne penche pas.
    if (!el || !motionAllowed() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const mx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const my = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.style.setProperty("--co-mx", mx.toFixed(3));
    el.style.setProperty("--co-my", my.toFixed(3));
    el.setAttribute("data-tenue", "");
    if (angle > 0) {
      el.style.setProperty("--co-rx", `${((0.5 - my) * angle).toFixed(2)}deg`);
      el.style.setProperty("--co-ry", `${((mx - 0.5) * angle).toFixed(2)}deg`);
    }
  };
  const lacher = (e: PointerEvent): void => {
    const el = e.currentTarget as HTMLElement | null;
    if (!el) return;
    el.removeAttribute("data-tenue");
    for (const v of ["--co-mx", "--co-my", "--co-rx", "--co-ry"]) el.style.removeProperty(v);
  };
  return { onPointerMove: bouger, onPointerLeave: lacher, onPointerCancel: lacher };
}

/** Le rang du duel d'une petite carte : la tuile du rôle, la force, le prix en énergie, les icônes des mots-clés. */
export function RangDuDuel({ duel }: { duel: CarteDuDuel }) {
  return (
    <span class="co-duel">
      <i class="co-tuile" style={{ backgroundImage: duel.urlDuRole }} aria-hidden="true" />
      <span class="co-force tnum" style={{ color: duel.couleurDuRole }}>
        <span class="sr-only">, {duel.roleNom.toLowerCase()}, force </span>
        {duel.force}
      </span>
      {duel.cout > 0 && (
        <span class="co-cout tnum">
          <i class="co-eclair" aria-hidden="true" />
          <span class="sr-only">, prix </span>
          {duel.cout}
          <span class="sr-only"> d'énergie</span>
        </span>
      )}
      {duel.icones.length > 0 && (
        <span class="co-mots" aria-hidden="true">
          {duel.icones.map((ic, i) => (
            <i key={i} class="co-tuile co-tuile-mot" style={{ backgroundImage: ic.url }} title={ic.nom} />
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * La fiche des effets d'une carte, en phrases avec leurs icônes : le rôle, l'effet unique, chaque mot-clé, la panoplie ; puis
 * le repos et le numéro dans le recueil du duel.
 */
export function FicheDesEffets({ effets, avecPied = true }: { effets: EffetsDeCarte; avecPied?: boolean }) {
  const duel = effets.duel;
  return (
    <span class="co-fiche" data-testid="carte-effets">
      {duel?.unique && (
        <span class="co-unique">
          <small>Effet unique</small>
          <strong>{duel.unique}</strong>
        </span>
      )}
      {effets.lignes
        .filter((l) => l.ton !== "unique")
        .map((l, i) => (
          <span key={i} class="co-ligne-effet" data-ton={l.ton ?? undefined}>
            {l.icone ? <i class="co-tuile" style={{ backgroundImage: l.icone, "--co-n": String(l.cases) }} aria-hidden="true" /> : <i class="co-tuile co-tuile-vide" aria-hidden="true" />}
            <span>
              <b>{l.gras}</b> {l.texte}
            </span>
          </span>
        ))}
      {duel && avecPied && (
        <span class="co-pied-fiche">
          Repos : {duel.repos} manche{duel.repos > 1 ? "s" : ""}
        </span>
      )}
    </span>
  );
}

/* ---------- La bulle des effets, au survol d'une petite carte ---------- */

/** L'hôte de la bulle, posé une fois dans la page ; une seule bulle à la fois. */
let hote: HTMLDivElement | null = null;
let ancreDeLaBulle: HTMLElement | null = null;

/** Cache la bulle de `ancre`, et seulement la sienne : une carte qui n'en a pas montré ne ferme pas celle d'une autre. */
function cacherLaBulle(ancre: HTMLElement | null): void {
  if (!hote || !ancre || ancre !== ancreDeLaBulle) return;
  render(null, hote);
  hote.hidden = true;
  ancreDeLaBulle = null;
}

/** La bulle à côté de la carte `ancre` : à droite s'il y a la place, sinon à gauche, jamais hors de l'écran. */
function montrerLaBulle(ancre: HTMLElement, nom: string, effets: EffetsDeCarte): void {
  if (typeof document === "undefined") return;
  if (!hote) {
    hote = document.createElement("div");
    hote.className = "co-bulle-hote";
    hote.setAttribute("aria-hidden", "true");
  }
  if (!hote.isConnected) document.body.append(hote);
  ancreDeLaBulle = ancre;
  hote.hidden = false;
  render(
    <span class="co-bulle" style={variablesDeLaCarte(ancre.dataset["rarete"])}>
      <span class="co-bulle-nom">{nom}</span>
      <FicheDesEffets effets={effets} />
    </span>,
    hote,
  );
  const r = ancre.getBoundingClientRect();
  const l = hote.offsetWidth;
  const h = hote.offsetHeight;
  const marge = 12;
  let x = r.right + marge;
  if (x + l > window.innerWidth - 8) x = r.left - l - marge;
  x = Math.max(8, Math.min(x, window.innerWidth - l - 8));
  const y = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - 8));
  hote.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/**
 * Au survol d'une petite carte (souris) ou quand elle a le focus du clavier : une bulle à côté d'elle, avec toutes les
 * phrases de ses effets. Rien sans effets (le duel fermé pour ce compte) ni au doigt : la fenêtre de la carte les montre.
 * Décorative pour les lecteurs d'écran, qui lisent le rôle, la force et le prix dans la carte.
 */
export function useBulleDesEffets(nom: string, effets: EffetsDeCarte | null): { onPointerEnter: (e: PointerEvent) => void; onPointerLeave: () => void; onFocus: (e: FocusEvent) => void; onBlur: () => void } {
  const ancre = useRef<HTMLElement | null>(null);
  useEffect(() => () => cacherLaBulle(ancre.current), []);
  const montrer = (el: HTMLElement): void => {
    // Dans une fenêtre ouverte (marché), la bulle passerait sous son voile : la fenêtre se lit seule.
    if (!effets || el.closest("dialog")) return;
    ancre.current = el;
    montrerLaBulle(el, nom, effets);
  };
  return {
    onPointerEnter: (e) => {
      if (e.pointerType === "mouse") montrer(e.currentTarget as HTMLElement);
    },
    onPointerLeave: () => cacherLaBulle(ancre.current),
    onFocus: (e) => {
      const el = e.currentTarget as HTMLElement;
      if (el.matches(":focus-visible")) montrer(el);
    },
    onBlur: () => cacherLaBulle(ancre.current),
  };
}

/* ---------- La carte d'une bannière ---------- */

/**
 * La carte d'une bannière, en grand et en paysage (22 novembre 2026, demande du pilote : « j'aimerais voir uniquement la
 * bannière avec la rareté et tout affiché, la bannière doit être visible ») : la bannière entière, avec son propre cadre de
 * rareté, agrandie d'un nombre entier de fois, dans le cadre des cartes des cosmétiques ; son nom au-dessus et sa rareté
 * dessous, jamais sur elle. Le reflet holographique passe sur elle du mystique au légendaire.
 */
export function CarteDeBanniere({ nom, rarete, image, testid }: { nom: string; rarete: Rarete; image: { largeur: number; hauteur: number; cases: readonly (string | null)[] }; testid?: string }) {
  const suivre = suivreLePointeur(10);
  const etroit = typeof window !== "undefined" && window.matchMedia("(max-width: 30rem)").matches;
  return (
    <div class="case case-montree case-carte co-carte co-grande co-paysage" data-carte={styleDeCarte(rarete)} data-rarete={rarete} data-testid={testid} style={variablesDeLaCarte(rarete)} {...suivre}>
      <HabitDeCarte rarete={rarete} />
      <span class="case-nom co-nom">{nom}</span>
      <span class="case-image co-banniere">
        <Pixels largeur={image.largeur} hauteur={image.hauteur} cases={image.cases} echelle={etroit ? 2 : 3} />
        <RefletDeCarte rarete={rarete} />
      </span>
      <MarqueDeRarete rarete={rarete} />
    </div>
  );
}
