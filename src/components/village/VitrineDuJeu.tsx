import { useEffect, useMemo, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import { enCapitales, largeurDuTexte, signesInconnus } from "../../lib/jeu/ecriture";
import { chercherDansLaVitrine, lireVitrine, type GauloisVitrine } from "../../lib/village/vitrine";
import { Loading, Problem, messageOf } from "../compte/common";
import { Etiquette, Px } from "../jeu/Pixels";
import { BoutonDesBoosters, FenetreDuBooster } from "./KitDesBoosters";
import { CartesDeLaVitrine, type FenetreDeLaVitrine } from "./Vitrine";

/**
 * « La vitrine » de « Mon Gaulois » en écran de jeu (21 novembre 2026, maquette validée par le pilote, dessin de Claude
 * Fable 5.2) : tous les Gaulois du clan en cartes, chacune avec sa bannière, sa finition, son familier et son nom, la
 * recherche par nom, et la carte en grand au clic, avec ses objets en cases à rareté et « où trouver cet objet ». Le pilote :
 * « je veux que tu conserves les fonctionnalités existantes du jeu comme dans la vitrine » : les cartes et leur fenêtre sont
 * celles d'avant (`Vitrine.tsx`, 15-17 novembre 2026), seul leur habit change (feuille `21-jeu-vitrine-loterie.css`, tout
 * sous `.vitrine-jeu`). L'ordre est celui du serveur (`get_village`, leur création) : rien n'est trié, compté ni noté.
 */

/** Le plus large, en cases, qu'un nom écrit en pixels prend dans le ruban d'une fenêtre ; au-delà, il s'écrit en lettres du site. */
const NOM_EN_PIXELS_AU_PLUS = 150;

/**
 * La fenêtre d'un Gaulois ouvert en grand : celle des boosters (panneau du jeu, titre en ruban, croix). Un nom que l'écriture
 * en pixels ne sait pas tracer, ou trop long, s'écrit en lettres du site sous un ruban « Un Gaulois du clan » ; un lecteur
 * d'écran entend toujours le nom entier.
 */
const FenetreDuJeu: FenetreDeLaVitrine = ({ titre, onFermer, children }) => {
  const capitales = enCapitales(titre);
  const enPixels = signesInconnus(capitales).length === 0 && largeurDuTexte(capitales) <= NOM_EN_PIXELS_AU_PLUS;
  return (
    <FenetreDuBooster titre={enPixels ? titre : "Un Gaulois du clan"} dit={titre} etape="vue" occupe={false} onFermer={onFermer} testid="vitrine-grand">
      <div class="vitrine-jeu-grand">
        {!enPixels && <p class="vitrine-jeu-grand-nom">{titre}</p>}
        {children}
      </div>
      <div class="bst-actions vitrine-jeu-grand-actions">
        <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="vitrine-grand-fermer" />
      </div>
    </FenetreDuBooster>
  );
};

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
const SANS_GAULOIS: readonly GauloisVitrine[] = [];
/** Les refus qu'une nouvelle lecture ne changera pas : pas de « Réessayer ». */
const SANS_RETOUR = new Set(["not_validated", "suspended", "not_signed_in"]);

type Lecture = { kind: "attente" } | { kind: "lecture" } | { kind: "erreur"; message: string; reessayer: boolean } | { kind: "prete"; gaulois: GauloisVitrine[] };

/** Le titre de la partie, en ruban : un dessin, la partie a déjà son titre caché (`VillageApp.tsx`). */
function Titre() {
  return (
    <div class="vitrine-jeu-titre" aria-hidden="true">
      <span class="jeu-ruban jeu-n9">
        <Px t="La vitrine" couleur="creme" relief="ombre" muet />
      </span>
    </div>
  );
}

/**
 * L'onglet « La vitrine » : lit `get_village` à sa première ouverture, puis discrètement à chaque retour (un membre a pu
 * changer sa tenue, son familier ou sa bannière) ; une relecture qui échoue garde les cartes à l'écran. Le serveur décide de
 * qui la voit : un compte validé ou de l'encadrement.
 */
export default function VitrineDuJeu({ actif }: { actif: boolean }) {
  const [lecture, setLecture] = useState<Lecture>({ kind: "attente" });
  // La recherche par nom : ce qu'on a tapé. Les cartes qui ne correspondent pas se retirent ; l'ordre ne change pas.
  const [cherche, setCherche] = useState("");
  const tous = lecture.kind === "prete" ? lecture.gaulois : SANS_GAULOIS;
  const trouves = useMemo(() => chercherDansLaVitrine(tous, cherche), [tous, cherche]);

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

  if (lecture.kind !== "prete") {
    return (
      <div class="vitrine-jeu" data-testid="vitrine-jeu">
        <Titre />
        <div class="vitrine-jeu-attente jeu-ecran-cadre jeu-n9">
          {lecture.kind === "erreur" ? <Problem message={lecture.message} onRetry={lecture.reessayer ? () => void lire(false) : undefined} /> : <Loading label="Lecture de la vitrine…" />}
        </div>
      </div>
    );
  }
  const compte = `${trouves.length} sur ${tous.length}`;
  return (
    <div class="vitrine-jeu" data-testid="vitrine-jeu">
      <Titre />
      <div class="vitrine-jeu-recherche">
        <label for="vitrine-cherche" class="vitrine-jeu-etiquette">
          <Px t="Chercher un Gaulois" couleur="doux" muet />
          <span class="sr-only">Chercher un Gaulois</span>
        </label>
        <input id="vitrine-cherche" type="search" class="vitrine-jeu-champ" value={cherche} onInput={(e) => setCherche(e.currentTarget.value)} autocomplete="off" spellcheck={false} data-testid="vitrine-cherche" />
        {cherche.trim() !== "" && (
          <p class="vitrine-jeu-compte" role="status" data-testid="vitrine-compte">
            <Px t={compte} dit={compte} />
          </p>
        )}
      </div>
      <CartesDeLaVitrine gaulois={trouves} enGrand Fenetre={FenetreDuJeu} moi={<Etiquette t="Moi" ton="rouge" classe="vitrine-moi" dit="Moi" />} />
    </div>
  );
}
