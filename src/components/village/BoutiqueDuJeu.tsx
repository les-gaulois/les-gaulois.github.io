import type { ComponentChildren, RefObject } from "preact";
import { RARETES_DES_OBJETS, type Vignette } from "../../lib/gaulois";
import { tabKeyTarget } from "../../lib/onglets";
import { jusquAuChangement, resteAvantLeChangement } from "../../lib/village/boutique-jeu";
import { nombre } from "../../lib/village/ecran-boutique";
import type { ObjetDuMarche } from "../../lib/village/ecran-marche";
import { echelleEntiere, type Filtre } from "../../lib/village/vestiaire-rayons";
import { Etiquette, Px } from "../jeu/Pixels";
import { Pixels } from "./BoutiquePixels";
import { CaseObjet } from "./MarcheCase";

/**
 * Les pièces de « La boutique » habillée en écran de jeu (21 novembre 2026, maquette validée par le pilote) : la sélection de
 * la semaine, les onglets des rayons, les filtres de rareté, les prix et les lots du marché, dessinés avec le kit en pixels de
 * `src/components/jeu/`. Leur feuille : `19-jeu-boutique.css`, tout sous `.boutique-jeu`. Chaque mot écrit en pixels a son
 * texte pour les lecteurs d'écran ; les dessins seuls sont cachés.
 */

/** Un titre de bloc, en ruban : le `<h…>` porte le texte, le ruban n'est qu'un dessin. */
export function Ruban({ t, niveau = 4, bleu = false, id }: { t: string; niveau?: 3 | 4; bleu?: boolean; id?: string }) {
  const Balise = niveau === 3 ? "h3" : "h4";
  return (
    <Balise id={id} class="boutique-jeu-ruban">
      <span class={`jeu-ruban ${bleu ? "jeu-ruban-bleu" : ""} jeu-n9`}>
        <Px t={t} couleur="creme" relief="ombre" />
      </span>
    </Balise>
  );
}

/** Un sous-titre en pixels, dans la couleur douce du thème. */
export function SousTitre({ t, id, children }: { t: string; id?: string; children?: ComponentChildren }) {
  return (
    <h4 id={id} class="boutique-jeu-sous-titre">
      <Px t={t} couleur="doux" plie />
      {children}
    </h4>
  );
}

/** La pièce du kit, décorative : 9 cases. */
export const PieceDuJeu = () => <i class="boutique-jeu-piece" aria-hidden="true" />;

/**
 * Un prix en pixels : la pièce et le nombre. Les lecteurs d'écran entendent « 800 statères ». `couleur` : `texte` sur un fond
 * de page, `encre` sur un bouton d'or.
 */
export function PrixDuJeu({ valeur, couleur = "texte", classe = "" }: { valeur: number; couleur?: "texte" | "encre" | "creme"; classe?: string }) {
  return (
    <span class={`boutique-jeu-prix ${classe}`}>
      <PieceDuJeu />
      <Px t={nombre(valeur)} couleur={couleur} relief={couleur === "creme" ? "cerne" : "plat"} dit={`${nombre(valeur)} ${Math.abs(valeur) > 1 ? "statères" : "statère"}`} />
    </span>
  );
}

/**
 * Un bouton du jeu : d'or pour l'action, bleu pour le reste ; son texte en pixels. `dit` : son nom entier pour les lecteurs
 * d'écran, quand le mot écrit ne suffit pas (« Acheter », de quel objet ?).
 */
export function BoutonDuJeu({
  t,
  bleu = false,
  dit,
  disabled = false,
  onClick,
  testid,
  classe = "",
  children,
}: {
  t: string;
  bleu?: boolean;
  dit?: string;
  disabled?: boolean;
  onClick: () => void;
  testid?: string;
  classe?: string;
  children?: ComponentChildren;
}) {
  return (
    <button type="button" class={`jeu-btn ${bleu ? "jeu-btn-bleu" : ""} jeu-n9 ${classe}`} disabled={disabled} aria-label={dit} onClick={onClick} data-testid={testid}>
      <Px t={t} couleur={bleu ? "creme" : "encre"} relief={bleu ? "cerne" : "plat"} muet={Boolean(dit)} />
      {children}
    </button>
  );
}

/**
 * La sélection de la semaine (boutique tournante) : un tiers des objets en rayon, jusqu'au mardi 21 h 30, avec son compte à
 * rebours. La règle se lit en court sous le compte à rebours ; la phrase entière, avec le jour du changement, est dite aux
 * lecteurs d'écran.
 */
export function SelectionDeLaSemaine({ changeLe, maintenant, regle }: { changeLe: string; maintenant: Date; regle: string }) {
  const reste = resteAvantLeChangement(changeLe, maintenant);
  const jusqua = jusquAuChangement(changeLe);
  return (
    <section class="boutique-jeu-selection jeu-panneau jeu-n9" aria-labelledby="boutique-selection-titre" data-testid="boutique-selection">
      <h3 id="boutique-selection-titre" class="boutique-jeu-selection-titre">
        <Px t="La sélection de la semaine" plie />
      </h3>
      <Etiquette t={reste.court} ton="rouge" dit={reste.dit} classe="boutique-jeu-reste" />
      {jusqua && <Px t={jusqua} couleur="doux" plie classe="boutique-jeu-jusqua" />}
      <Px t="Un tiers des objets, les autres en booster ou au marché" couleur="doux" plie muet classe="boutique-jeu-regle" />
      <p class="sr-only" data-testid="boutique-rotation">
        {regle}
      </p>
    </section>
  );
}

/** La place de l'image d'un onglet de rayon : sa largeur et sa hauteur, en pixels. */
const ONGLET_LARGE = 48;
const ONGLET_HAUT = 36;

/** L'image d'un onglet de rayon, agrandie d'un nombre entier de fois pour tenir dans sa place ; décorative. */
function ImageDOnglet({ vignette }: { vignette: Vignette }) {
  const echelle = Math.min(echelleEntiere(vignette.largeur, 1, ONGLET_LARGE, 3), echelleEntiere(1, vignette.hauteur, ONGLET_HAUT, 3));
  return <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelle} class="boutique-jeu-onglet-dessin" />;
}

/**
 * Les onglets des rayons, dessinés : l'image de ce que le Gaulois y porte (ou du rayon), son nom en pixels, et dessous ce qui
 * l'attend (« 2 offres », « 3 sur 50 »). Une pastille « Nouveau » sur un rayon dont la sélection de la semaine n'a pas été
 * ouverte. De vrais onglets : flèches, Début et Fin, un seul onglet dans l'ordre de tabulation ; le rayon ouvert se lit dans
 * le panneau `boutique-panneau`. Mêmes identifiants qu'avant (`boutique-rayon-<id>`).
 */
export function OngletsDesRayons<R extends string>({
  rayons,
  noms,
  rayon,
  vignette,
  mention,
  nouveaux,
  barre,
  onChoisir,
}: {
  rayons: readonly R[];
  noms: Readonly<Record<R, string>>;
  rayon: R;
  vignette: (rayon: R) => Vignette | null;
  mention: (rayon: R) => string | null;
  nouveaux: ReadonlySet<string>;
  barre: RefObject<HTMLDivElement>;
  onChoisir: (rayon: R) => void;
}) {
  const auClavier = (e: KeyboardEvent, index: number) => {
    const suivant = rayons[tabKeyTarget(e.key, index, rayons.length) ?? -1];
    if (!suivant) return;
    e.preventDefault();
    onChoisir(suivant);
    document.getElementById(`boutique-rayon-${suivant}`)?.focus();
  };
  return (
    <div ref={barre} class="boutique-jeu-onglets vestiaire-barre">
      <div class="boutique-jeu-onglets-liste" role="tablist" aria-label="Les rayons de la boutique" data-testid="boutique-rayons">
        {rayons.map((id, index) => {
          const image = vignette(id);
          const mots = mention(id);
          const ouvert = rayon === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`boutique-rayon-${id}`}
              class="boutique-jeu-onglet"
              aria-selected={ouvert}
              aria-controls="boutique-panneau"
              tabIndex={ouvert ? 0 : -1}
              onClick={(e) => {
                onChoisir(id);
                // Dans une barre qui défile (téléphone), l'onglet choisi reste en vue.
                e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
              }}
              onKeyDown={(e) => auClavier(e, index)}
              data-testid={`rayon-${id}`}
            >
              <span class="boutique-jeu-onglet-image">{image && <ImageDOnglet vignette={image} />}</span>
              <Px t={noms[id]} couleur={ouvert ? "encre" : "texte"} classe="boutique-jeu-onglet-nom" dit={noms[id]} />
              {mots && (
                <span class="boutique-jeu-onglet-mention tnum">
                  <span class="sr-only">, </span>
                  {mots}
                </span>
              )}
              {nouveaux.has(id) && (
                <span class="boutique-jeu-onglet-nouveau" data-testid={`rayon-nouveau-${id}`}>
                  <Etiquette t="Nouveau" ton="rouge" dit=", nouvelle sélection" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Les losanges d'une rareté, de un à cinq : le repère de forme, la couleur n'est jamais seule. */
function Losanges({ rang }: { rang: number }) {
  return (
    <span class="boutique-jeu-losanges" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/**
 * Un choix du filtre de rareté d'un rayon : ses losanges, son nom et le nombre d'objets qu'il montre, en pixels. Sans objet,
 * il ne se choisit pas. D'or quand il est retenu, bleu sinon.
 */
export function ChoixDeRarete({ filtre, nombre: n, choisi, onClick }: { filtre: Filtre; nombre: number; choisi: boolean; onClick: () => void }) {
  const rarete = filtre === "tout" ? null : RARETES_DES_OBJETS[filtre];
  const nom = rarete ? rarete.nom : "Tout";
  return (
    <button type="button" class={`jeu-btn ${choisi ? "" : "jeu-btn-bleu"} jeu-n9 boutique-jeu-filtre`} data-rarete={filtre} aria-pressed={choisi} disabled={n === 0} onClick={onClick} data-testid={`filtre-${filtre}`}>
      {rarete && <Losanges rang={rarete.rang} />}
      <Px t={`${nom} ${n}`} couleur={choisi ? "encre" : "creme"} relief={choisi ? "plat" : "cerne"} dit={`${nom}, ${n} ${n > 1 ? "objets" : "objet"}`} />
    </button>
  );
}

/** Les sortes de lots du marché, et l'étiquette qui les dit sur la case. */
export type SorteDeLot = "offre" | "demande" | "mon-offre" | "ma-demande" | "a-servir";
const ETIQUETTES: Readonly<Record<SorteDeLot, { t: string; ton: "bleu" | "rouge" | "or"; dit: string }>> = {
  offre: { t: "À vendre", ton: "bleu", dit: "à vendre par un membre" },
  demande: { t: "Demandé", ton: "rouge", dit: "demandé par un membre" },
  "mon-offre": { t: "À vous", ton: "or", dit: "votre offre" },
  "ma-demande": { t: "À vous", ton: "or", dit: "votre demande" },
  "a-servir": { t: "Cherché", ton: "rouge", dit: "un membre cherche cet objet, que vous avez" },
};

/**
 * Un lot du marché, en image : la case de l'objet, l'étiquette de sa sorte, son prix et sa fin ; jamais le nom d'un membre.
 * `essai` : la case s'essaie sur le Gaulois (une offre d'un autre membre). `action` : le bouton du lot (Acheter, Vendre,
 * Retirer), avec son nom entier pour les lecteurs d'écran.
 */
export function Lot({
  objet,
  sorte,
  prix,
  fin,
  essai,
  action,
  testid,
}: {
  objet: ObjetDuMarche;
  sorte: SorteDeLot;
  prix: number;
  fin: string;
  essai?: { essayee: boolean; onEssai: () => void; testid?: string };
  action?: { t: string; dit: string; bleu?: boolean; disabled: boolean; onClick: () => void; testid?: string };
  testid: string;
}) {
  const etiquette = ETIQUETTES[sorte];
  const kase = <CaseObjet objet={objet} />;
  return (
    <li class="boutique-jeu-lot" data-sorte={sorte} data-testid={testid}>
      {essai ? (
        <button type="button" class="boutique-jeu-lot-case" aria-pressed={essai.essayee} onClick={essai.onEssai} data-testid={essai.testid}>
          {kase}
          <span class="sr-only">{essai.essayee ? ", en essai" : ", à essayer"}</span>
          {essai.essayee && <span class="case-essai" aria-hidden="true">essai</span>}
        </button>
      ) : (
        <span class="boutique-jeu-lot-case">{kase}</span>
      )}
      <Etiquette t={etiquette.t} ton={etiquette.ton} dit={etiquette.dit} classe="boutique-jeu-lot-sorte" />
      <PrixDuJeu valeur={prix} classe="boutique-jeu-lot-prix" />
      {fin && <span class="boutique-jeu-lot-fin">{fin}</span>}
      {action && <BoutonDuJeu t={action.t} bleu={action.bleu} dit={action.dit} disabled={action.disabled} onClick={action.onClick} testid={action.testid} classe="boutique-jeu-lot-bouton" />}
    </li>
  );
}

/** Une rangée de lots, sous son sous-titre ; rien quand elle est vide. */
export function RangeeDeLots({ id, titre, compte, testid, children }: { id: string; titre: string; compte?: string; testid: string; children: ComponentChildren }) {
  return (
    <div class="boutique-jeu-rangee" data-testid={testid}>
      <SousTitre t={titre} id={id}>
        {compte && (
          <span class="boutique-jeu-compte tnum">
            <span class="sr-only">, </span>
            {compte}
          </span>
        )}
      </SousTitre>
      <ul class="boutique-jeu-lots" aria-labelledby={id}>
        {children}
      </ul>
    </div>
  );
}
