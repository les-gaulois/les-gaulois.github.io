import { useEffect, useRef, useState } from "preact/hooks";
import { OBJETS, modeleDuGaulois, objetPorte, vignetteDeLObjet, type Vignette } from "../../lib/gaulois";
import type { DecorDeBanniere } from "../../lib/village/decor-banniere";
import { tailleDeLApercu, vignetteDuFamilier } from "../../lib/village/ecran-familiers";
import { NOMS_RAYONS, RAYON_CORPS, echelleEntiere } from "../../lib/village/vestiaire-rayons";
import { tabKeyTarget } from "../../lib/onglets";
import {
  BANNIERE,
  CLES_DU_CORPS,
  ChoixDeLaBanniere,
  ChoixDuFamilier,
  FAMILIER,
  MessagesDuVestiaire,
  PanneDeLInventaire,
  RayonDesObjets,
  RayonDuCorps,
  TenuesEtCollection,
  avantLeGaulois,
  estUnRayon,
  useVestiaire,
  visageDuRayon,
  type LeVestiaire,
  type OngletDuVestiaire,
} from "../compte/Vestiaire";
import { Px } from "../jeu/Pixels";
import { Pixels, peindre } from "./BoutiquePixels";
import { ApercuGaulois } from "./Cases";
import { useEssayage } from "./Essayage";

/**
 * Le vestiaire du jeu « Mon Gaulois » (`/village#gaulois`, 21 novembre 2026, maquette validée par le pilote) : le Gaulois du
 * membre en grand devant sa bannière, ses huit emplacements autour de lui, et dessous les cartes du rayon ouvert. On
 * attrape une carte et on la lâche sur le Gaulois (`useEssayage`, Essayage.tsx) : elle vole vers son emplacement, le
 * Gaulois change de tenue et saute. Un clic, Entrée ou Espace sur la carte font la même chose.
 *
 * Les emplacements sont les onglets des rayons d'avant (mêmes identifiants, `vestiaire-rayon-<rayon>`), plus le familier et
 * la bannière, qui avaient chacun leur pli au-dessus des rayons. Tout le reste vient du vestiaire d'avant
 * (`useVestiaire` et ses pièces, `src/components/compte/Vestiaire.tsx`), sans rien en retirer : l'essai jusqu'à
 * l'enregistrement, « Au hasard », les couleurs, les Gaulois uniques, « Nouveau », « à vous », « essai », la collection
 * (« 12 sur 62 »), les tenues gardées, le livre des bannières, et la création du Gaulois à l'inscription, où seuls ses
 * six premiers emplacements paraissent. La bourse n'y est plus : la barre du jeu la montre toujours.
 */

/**
 * Les emplacements autour du Gaulois : à sa gauche, de la tête aux pieds ; à sa droite, son corps, son arme, son familier
 * et sa bannière. C'est aussi l'ordre des onglets au clavier.
 */
const A_GAUCHE: readonly OngletDuVestiaire[] = ["tete", "haut", "bas", "pieds"];
const A_DROITE: readonly OngletDuVestiaire[] = [RAYON_CORPS, "arme", FAMILIER, BANNIERE];
const NOMS_ONGLETS: Readonly<Record<OngletDuVestiaire, string>> = { ...NOMS_RAYONS, [FAMILIER]: "Familier", [BANNIERE]: "Bannière" };
/** La place, en pixels, du dessin dans un emplacement : il s'y agrandit d'un nombre entier de fois. */
const PLACE_EMPLACEMENT = 44;

/** Ce que montre un emplacement : son dessin, la rareté de ce qu'il porte, et ce qu'il dit aux lecteurs d'écran. */
interface VueDEmplacement {
  id: OngletDuVestiaire;
  cote: "gauche" | "droite";
  dessin: Vignette | null;
  /** La bannière : un décor entier, posé en fond de l'emplacement. */
  decor: DecorDeBanniere | null;
  rarete: string | null;
  /** Le nom de ce qu'il porte, pour les lecteurs d'écran et la bulle du survol. */
  porte: string | null;
  /** La collection du rayon, « 12 sur 62 ». */
  mention: string | null;
  nouveau: boolean;
  essai: boolean;
}

/** Ce que montre chaque emplacement, d'après la tenue à l'écran, l'enregistrée, le familier et la bannière. */
function vueDe(v: LeVestiaire, id: OngletDuVestiaire): VueDEmplacement {
  const cote = A_GAUCHE.includes(id) ? "gauche" : "droite";
  const vide: VueDEmplacement = { id, cote, dessin: null, decor: null, rarete: null, porte: null, mention: null, nouveau: false, essai: false };
  const { tenue, enregistree } = v;
  if (id === RAYON_CORPS) {
    const modele = modeleDuGaulois(tenue);
    const essai = enregistree !== null && CLES_DU_CORPS.some((cle) => (tenue[cle] ?? "") !== (enregistree[cle] ?? ""));
    return { ...vide, dessin: visageDuRayon(tenue), rarete: modele?.rarete ?? null, porte: modele ? modele.nom : null, essai };
  }
  if (id === FAMILIER) {
    const montre = v.familiers.montre;
    return { ...vide, dessin: montre ? vignetteDuFamilier(montre) : null, rarete: montre?.rarete ?? null, porte: montre ? montre.nom : "aucun" };
  }
  if (id === BANNIERE) return { ...vide, decor: v.decor, porte: v.decor ? null : "le décor de son lieu" };
  if (!estUnRayon(id)) return vide;
  const objet = OBJETS[id][tenue[id] ?? ""];
  return {
    ...vide,
    dessin: vignetteDeLObjet(id, tenue[id] ?? "", tenue),
    rarete: objet?.rarete ?? null,
    porte: objet?.nom ?? null,
    mention: v.collection(id),
    nouveau: v.nouveauDans(id),
    essai: enregistree !== null && objetPorte(tenue, id) !== objetPorte(enregistree, id),
  };
}

/** Une bannière entière dans le petit cadre d'un emplacement : décorative, l'emplacement se nomme à côté. */
function FondDEmplacement({ decor }: { decor: DecorDeBanniere }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, decor.largeur, decor.hauteur, decor.cases), [decor]);
  return <canvas ref={toile} width={decor.largeur} height={decor.hauteur} class="pixels vj-emplacement-fond" aria-hidden="true" />;
}

/**
 * Un emplacement à côté du Gaulois : ce qu'il y porte, en image, dans un cadre de la couleur de sa rareté. C'est l'onglet de
 * son rayon : il ouvre, sous le Gaulois, les cartes à lui mettre. Il dit « Nouveau » quand un objet du rayon vient
 * d'arriver, et son essai quand la tenue à l'écran y diffère de l'enregistrée. Les cartes lâchées sur le Gaulois volent
 * jusqu'à lui (`emplacementDe` d'Essayage.tsx, par son identifiant).
 */
function Emplacement({ vue, ouvert, onChoisir, onClavier }: { vue: VueDEmplacement; ouvert: boolean; onChoisir: () => void; onClavier: (e: KeyboardEvent) => void }) {
  const nom = NOMS_ONGLETS[vue.id];
  const mots = [vue.porte, vue.mention, vue.essai ? "en essai" : null].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      role="tab"
      id={`vestiaire-rayon-${vue.id}`}
      class="vj-emplacement"
      data-emplacement={vue.id}
      data-cote={vue.cote}
      data-rarete={vue.rarete ?? "aucune"}
      data-essai={vue.essai ? "" : undefined}
      aria-selected={ouvert}
      aria-controls="vestiaire-panneau"
      tabIndex={ouvert ? 0 : -1}
      title={vue.porte ? `${nom} : ${vue.porte}` : nom}
      onClick={onChoisir}
      onKeyDown={onClavier}
      data-testid={`rayon-${vue.id}`}
    >
      <span class="vj-emplacement-image" aria-hidden="true">
        {vue.decor ? (
          <FondDEmplacement decor={vue.decor} />
        ) : vue.dessin ? (
          <Pixels largeur={vue.dessin.largeur} hauteur={vue.dessin.hauteur} cases={vue.dessin.cases} echelle={echelleEntiere(vue.dessin.largeur, vue.dessin.hauteur, PLACE_EMPLACEMENT, 3)} class="vj-emplacement-dessin" />
        ) : (
          <span class="case-rien" />
        )}
      </span>
      <Px t={nom} couleur="texte" muet classe="vj-emplacement-nom" />
      <span class="sr-only">
        {nom}
        {mots ? ` : ${mots}` : ""}
      </span>
      {vue.nouveau && (
        <span class="vestiaire-rayon-marque" data-testid={`rayon-marque-${vue.id}`}>
          <span class="sr-only">, </span>Nouveau
        </span>
      )}
    </button>
  );
}

export default function VestiaireDuJeu({ actif }: { actif: boolean }) {
  const v = useVestiaire(actif);
  // L'essayage : les cartes du rayon ouvert se lâchent sur le Gaulois. La bannière se choisit dans son livre, sans rien
  // glisser. La phrase dite aux lecteurs d'écran quand une carte arrive.
  const zone = useRef<HTMLDivElement>(null);
  const cartes = useRef<HTMLDivElement>(null);
  const [annonce, setAnnonce] = useState("");
  // Le familier et la bannière ne se montrent qu'à côté d'un Gaulois qui existe : rien pendant l'inscription.
  const ordre = [...A_GAUCHE, ...A_DROITE].filter((id) => v.existait || (id !== FAMILIER && id !== BANNIERE));
  const ouvert: OngletDuVestiaire = ordre.includes(v.rayon) ? v.rayon : RAYON_CORPS;
  const essayage = useEssayage({ panneau: cartes, zone, cible: ouvert === BANNIERE ? null : ouvert, annoncer: setAnnonce });

  const attente = avantLeGaulois(v);
  if (attente) return attente;

  const { enregistree, familiers } = v;
  const auClavier = (e: KeyboardEvent, index: number): void => {
    // Deux colonnes d'emplacements : les quatre flèches passent de l'un à l'autre, dans l'ordre des onglets.
    const suivant = ordre[tabKeyTarget(e.key, index, ordre.length, true) ?? tabKeyTarget(e.key, index, ordre.length, false) ?? -1];
    if (!suivant) return;
    e.preventDefault();
    v.setRayon(suivant);
    document.getElementById(`vestiaire-rayon-${suivant}`)?.focus();
  };
  const mention = estUnRayon(ouvert) ? v.collection(ouvert) : null;
  return (
    <div class="vestiaire-jeu" data-testid="vestiaire">
      <div class="vj-haut">
        {/* La scène : le Gaulois devant sa bannière, ses emplacements autour. C'est là qu'on lâche une carte. */}
        <div ref={zone} class="vj-scene" data-familier={tailleDeLApercu(familiers.montre) ?? undefined} data-testid="vestiaire-scene">
          <div class="vj-gaulois">
            <span class="vj-lueur" aria-hidden="true" />
            <ApercuGaulois tenue={v.tenue} familier={familiers.montre} decor={v.decor} class="vj-apercu" />
            <span class="vj-socle" aria-hidden="true" />
          </div>
          <div class="vj-emplacements" role="tablist" aria-label="Les emplacements de votre Gaulois" data-testid="vestiaire-rayons">
            {ordre.map((id, index) => (
              <Emplacement key={id} vue={vueDe(v, id)} ouvert={id === ouvert} onChoisir={() => v.setRayon(id)} onClavier={(e) => auClavier(e, index)} />
            ))}
          </div>
        </div>
        <div class="vj-actions">
          <button type="button" class="jeu-btn jeu-btn-bleu jeu-n9" onClick={v.auHasard} data-testid="vestiaire-hasard">
            <Px t="Au hasard" couleur="creme" relief="cerne" />
          </button>
          {v.change && enregistree && (
            <button type="button" class="jeu-btn jeu-btn-bleu jeu-n9" onClick={v.annuler} data-testid="vestiaire-annuler">
              <Px t="Annuler" couleur="creme" relief="cerne" dit="Annuler l'essai" />
            </button>
          )}
          <button type="button" class="jeu-btn jeu-n9" disabled={v.occupe || !v.change} onClick={() => void v.enregistrer()} data-testid="vestiaire-enregistrer">
            <Px t={v.occupe ? "Enregistrement" : enregistree ? "Enregistrer" : "Créer mon Gaulois"} couleur="encre" dit={v.occupe ? "Enregistrement…" : enregistree ? "Enregistrer ma tenue" : "Créer mon Gaulois"} />
          </button>
        </div>
        <div class="vj-messages">
          <MessagesDuVestiaire v={v} />
        </div>
        <p class="sr-only" role="status" data-testid="vestiaire-annonce">
          {annonce}
        </p>
      </div>
      <div id="vestiaire-panneau" class="vj-panneau" role="tabpanel" aria-labelledby={`vestiaire-rayon-${ouvert}`} data-onglet={ouvert}>
        <div class="vj-entete">
          <h3 class="jeu-ruban jeu-n9">
            <Px t={NOMS_ONGLETS[ouvert]} couleur="creme" relief="ombre" />
          </h3>
          {mention && <Px t={mention} couleur="doux" classe="vj-mention" />}
        </div>
        <PanneDeLInventaire v={v} />
        {/* Les cartes du rayon ouvert : on les attrape ici. */}
        <div ref={cartes} class="vj-cartes" {...essayage}>
          {ouvert === RAYON_CORPS && <RayonDuCorps v={v} />}
          {ouvert === FAMILIER && <ChoixDuFamilier v={v} plie={false} />}
          {ouvert === BANNIERE && <ChoixDeLaBanniere v={v} actif={actif} />}
          {estUnRayon(ouvert) && ouvert !== RAYON_CORPS && <RayonDesObjets v={v} emplacement={ouvert} />}
        </div>
      </div>
      <div class="vj-suite">
        <TenuesEtCollection v={v} />
      </div>
    </div>
  );
}
