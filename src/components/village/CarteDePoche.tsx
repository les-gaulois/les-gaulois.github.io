import type { ComponentChildren, JSX } from "preact";
import { useId, useRef, useState } from "preact/hooks";
import type { RareteDObjet as Rarete } from "../../lib/gaulois";
import { faconDeLaCarte, motDeLaChose, styleDeCarte } from "../../lib/jeu/cartes-d-objets";
import { lignesDePoche } from "../../lib/village/carte-de-poche";
import { MarqueDeRarete } from "./BoutiquePixels";
import { FicheDesEffets, HabitDeCarte, RefletDeCarte, variablesDeLaCarte } from "./CarteDObjet";
import { PetiteDeborde, PetitePleine, nomDeLaRarete } from "./CartesRares";
import type { EffetsDeCarte } from "./effets-des-cartes";

/**
 * La carte de poche (22 novembre 2026, demande du pilote : « le même affichage pour la boutique et les vestiaires : des
 * véritables cartes avec les infos dessus » ; dessin de Claude Fable 5.2) : la version serrée de la grande carte, dans les
 * grilles de la boutique et du vestiaire. De haut en bas : le prix en énergie, le nom, la tuile du rôle et la force ;
 * l'image de la chose sur son fond, ses marques dans les coins ; la rareté et le repos ; les effets du duel écrits
 * (l'effet unique, les mots-clés, la phrase du rôle : une ligne entière ou rien) ; la panoplie ; l'état (prix, « À vous »,
 * « Porté »). « Tout lire » retourne la carte : son dos porte toute la fiche. Les trois façons et les deux mises en page
 * rares sont gardées. Le bouton de la carte reste `button.case` : le glisser du vestiaire (`Essayage.tsx`) le trouve. Le
 * pli et le dos sont à côté de lui, dans l'emplacement, jamais un bouton dans un bouton.
 *
 * Les effets ne viennent que de qui voit le duel (`useEffetsDeLaChose`) : sans eux, la carte n'a ni texte ni pli.
 */

/** La tête : le prix en énergie, le nom (devant la chose qui déborde), la tuile du rôle et la force. */
function TeteDePoche({ nom, effets, devant = false }: { nom: string; effets: EffetsDeCarte | null; devant?: boolean }) {
  const duel = effets?.duel ?? null;
  return (
    <span class="co-tete">
      {/* Le nom d'abord, pour les lecteurs d'écran ; la grille le pose au milieu. */}
      <span class={`case-nom co-nom${devant ? " co-nom-devant" : ""}`}>{nom}</span>
      {duel && duel.cout > 0 ? (
        <span class="co-cout tnum">
          <i class="co-eclair" aria-hidden="true" />
          <span class="sr-only">, coût </span>
          {duel.cout}
          <span class="sr-only"> d'énergie</span>
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      {duel ? (
        <span class="co-force-poche">
          <i class="co-tuile" style={{ backgroundImage: duel.urlDuRole, "--co-n": "15" }} aria-hidden="true" />
          <span class="sr-only">, force </span>
          <b class="tnum" style={{ color: duel.couleurDuRole }}>
            {duel.force}
          </b>
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
    </span>
  );
}

/** Le bas de la carte : la rareté et le repos, les effets écrits, la panoplie, l'état. */
function BasDePoche({ rarete, cle, effets, etat }: { rarete: Rarete; cle: string; effets: EffetsDeCarte | null; etat: ComponentChildren }) {
  const duel = effets?.duel ?? null;
  const mot = cle.startsWith("objet/") ? null : motDeLaChose(cle);
  const { ecrites, panoplie } = effets ? lignesDePoche(effets.lignes) : { ecrites: [], panoplie: null };
  return (
    <>
      <span class="co-rang">
        <span class="sr-only">, </span>
        <MarqueDeRarete rarete={rarete} />
        {duel ? (
          <span class="co-repos">
            <span class="sr-only">, </span>Repos {duel.repos}
          </span>
        ) : (
          mot && (
            <span class="co-repos">
              <span class="sr-only">, </span>
              {mot}
            </span>
          )
        )}
      </span>
      {/* Les effets écrits : tout est aussi au dos, que les lecteurs d'écran lisent par « Tout lire ». */}
      {ecrites.length > 0 && (
        <span class="co-texte" data-court={duel ? undefined : ""} aria-hidden="true">
          {ecrites.map((l, i) =>
            l.ton === "unique" ? (
              <span key={i} class="co-unique-poche">
                <small>Effet unique</small> <b>{l.texte}</b>
              </span>
            ) : (
              <span key={i} class="co-effet">
                {l.icone && <i class="co-tuile" style={{ backgroundImage: l.icone, "--co-n": "11" }} />}
                <span>
                  <b>{l.gras}</b> {l.texte}
                </span>
              </span>
            ),
          )}
        </span>
      )}
      {panoplie && (
        <span class="co-pied-poche" aria-hidden="true">
          {panoplie.gras}
        </span>
      )}
      <span class="co-etat" data-seul={effets ? undefined : ""}>
        {etat}
      </span>
    </>
  );
}

/** Ce que la carte de poche reçoit : la chose, son fond, ses effets, son image (simple), ses marques et son état. */
export interface ProprietesDePoche {
  nom: string;
  rarete: Rarete;
  /** La clé du fond de la chose (`cleDeLObjet`, `cleDuFamilier`, `cleDuModele`). */
  cle: string;
  /** Le dessin de la chose, pour les cartes rares qui la posent elles-mêmes. */
  dessin: { largeur: number; hauteur: number; cases: readonly (string | null)[] };
  effets: EffetsDeCarte | null;
  pose?: "centre" | "sol" | "bas";
  /** L'image d'une carte simple : la chose sur son fond, posée par la case. */
  image: ComponentChildren;
  /** Les marques des coins de l'image (« Nouveau », « en vente », « 2 exemplaires », « essai », la plaque). */
  marques?: ComponentChildren;
  /** L'état, en bas : le prix, le cadenas, « Revient… », « À vous », « Porté ». */
  etat: ComponentChildren;
}

/** L'intérieur du bouton de la carte de poche, selon sa mise en page : simple, pleine image ou débordement. */
export function CorpsDePoche({ nom, rarete, cle, dessin, effets, pose = "centre", image, marques, etat }: ProprietesDePoche) {
  const facon = faconDeLaCarte(rarete);
  const bas = <BasDePoche rarete={rarete} cle={cle} effets={effets} etat={etat} />;
  if (facon === "pleine") return <PetitePleine nom={nom} rarete={rarete} cle={cle} dessin={dessin} effets={effets} marques={marques} pose={pose} tete={<TeteDePoche nom={nom} effets={effets} />} bas={bas} />;
  if (facon === "deborde") return <PetiteDeborde nom={nom} rarete={rarete} cle={cle} dessin={dessin} effets={effets} marques={marques} pose={pose} tete={<TeteDePoche nom={nom} effets={effets} devant />} bas={bas} />;
  return (
    <>
      <HabitDeCarte rarete={rarete} />
      <TeteDePoche nom={nom} effets={effets} />
      <span class="case-image" data-fond="">
        {image}
        <RefletDeCarte rarete={rarete} />
        {marques}
      </span>
      {bas}
    </>
  );
}

/**
 * L'emplacement d'une carte de poche dans sa grille : le bouton de la carte (`children`), et à côté, quand elle a des
 * effets, le pli « Tout lire » et le dos qu'il ouvre. Échap referme le dos et rend le focus au pli.
 */
export function EmplacementDePoche({ nom, rarete, effets, children, testid }: { nom: string; rarete: Rarete; effets: EffetsDeCarte | null; children: ComponentChildren; testid?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const id = useId();
  const pli = useRef<HTMLButtonElement>(null);
  const fermer = (e: JSX.TargetedKeyboardEvent<HTMLElement>): void => {
    if (!ouvert || e.key !== "Escape") return;
    e.stopPropagation();
    setOuvert(false);
    pli.current?.focus();
  };
  const duel = effets?.duel ?? null;
  return (
    <div class="co-emplacement" data-carte={styleDeCarte(rarete)} data-facon={faconDeLaCarte(rarete)} data-ouvert={ouvert ? "" : undefined} style={variablesDeLaCarte(rarete)} onKeyDown={fermer} data-testid={testid}>
      {children}
      {effets && (
        <>
          <button ref={pli} type="button" class="co-pli" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert((o) => !o)} data-testid="carte-tout-lire">
            {ouvert ? "Fermer" : "Tout lire"}
            <span class="sr-only"> : les effets de « {nom} »</span>
          </button>
          <div class="co-dos" id={id} role="group" aria-label={`Les effets de « ${nom} »`} tabIndex={ouvert ? 0 : -1}>
            <span class="co-dos-nom">
              {nom}
              <small>{nomDeLaRarete(rarete)}</small>
            </span>
            <FicheDesEffets effets={effets} avecPied={false} />
            {duel && (
              <span class="co-dos-pied">
                <span>
                  Repos : {duel.repos} manche{duel.repos > 1 ? "s" : ""}
                </span>
                <span class="tnum">
                  n° {duel.numero}/{duel.total}
                </span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
