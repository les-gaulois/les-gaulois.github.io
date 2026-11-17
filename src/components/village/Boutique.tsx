import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { fmtInt } from "../../lib/format";
import { ADRESSE_VILLAGE, OBJETS, ORDRE_RARETES, RARETES, TENUE_DE_DEPART, changerObjet, tenueDuServeur, vignetteDeLObjet, type Emplacement, type Tenue } from "../../lib/gaulois";
import type { MesStateres } from "../../lib/stateres";
import {
  ANCRE_MARCHE,
  IMAGE_DU_RAYON_BANNIERE,
  IMAGE_DU_RAYON_CARTES,
  IMAGE_DU_RAYON_UNIQUES,
  NOMS_RAYONS,
  RAYONS_BOUTIQUE,
  RAYON_BANNIERE,
  RAYON_CARTES,
  RAYON_POCHETTES,
  RAYON_UNIQUES,
  demandeLeMarche,
  essaiValide,
  estUnRayonDObjets,
  motsDesOffres,
  offreEssayee,
  offresParRayon,
  raisonDeLEssai,
  rangerLaBoutique,
  rayonDOuverture,
  type Essai,
  type RayonBoutique,
  type RayonOuvert,
  pochetteDemandeeUneFois,
  rayonDemandeUneFois,
} from "../../lib/village/boutique-rayons";
import type { MaBoutique, PochetteFamiliersReponse, PochetteGagnee, PochetteReponse, PochetteStateresReponse, RefObjet } from "../../lib/village/contrat";
import { bonsEnMots, lirePochettesGagnees } from "../../lib/village/loterie";
import { demandeLesBannieres } from "../../lib/village/ecran-bannieres";
import { avecUnExemplaire, lireAchat, lireBoutique, lirePochette, lireStateres, manque, messageDuRefus, objetPayant, prixDeLObjet, quantitePossedee, raisonBoutiqueFermee, stateres } from "../../lib/village/ecran-boutique";
import { ANCRE_FAMILIERS, demandeLesFamiliers, idsPossedes, tailleDeLApercu } from "../../lib/village/ecran-familiers";
import { actionDeLEssai, essaiDuModeleValide } from "../../lib/village/ecran-modeles";
import { finDeLOffre, lireBoutique as lireBoutiqueDuMarche, lireMarche, mesOffres, messageDuMarche, raisonDeLOffre, type MarcheLu, type OffreLisible, type PossedeLisible } from "../../lib/village/ecran-marche";
import { pochetteDOuverture, type PochetteDeLEtal } from "../../lib/village/etal";
import { familierDe } from "../../lib/village/familiers";
import { lireMaRevente, lireRevente, messageDeLaRevente, type MaRevente, type ObjetRevendable } from "../../lib/village/revente";
import { demandeLesModeles, messageDuRefusDesModeles, modeleParId, raisonDeLAchat, tenueAvecModele } from "../../lib/village/modeles";
import { TOUT, choisirFiltre, collectionDuRayon, motsDeLaCollection, type Filtre, type Filtres } from "../../lib/village/vestiaire-rayons";
import { Loading, Problem, Success, messageOf, useNow } from "../compte/common";
import { DessinPochetteBannieres, SectionDesBannieres, useDecorDuGaulois } from "./Bannieres";
import { Bourse } from "./Bourse";
import { DialogueAchat, DialoguePochette, PochetteGagneeIci, type Issue } from "./BoutiqueDialogue";
import { Pixels, Prix } from "./BoutiquePixels";
import { ApercuGaulois, BarreDesRayons, Case, useSceneCollee } from "./Cases";
import { useFamiliers } from "./Familiers";
import { CaseObjet, Prix as PrixDuMarche } from "./MarcheCase";
import { useModeles } from "./Modeles";
import { DialogueAchat as DialogueOffre, DialogueRevente, DialogueVente } from "./MarcheDialogues";
import { EtalDesPochettes } from "./Etal";
import { DessinPochette, Pochette } from "./Pochette";
import { DessinPochetteFamiliers, DialogueFamiliers, PochetteFamiliers } from "./PochetteFamiliers";
import { DessinPochetteStateres, DialogueStateres, PochetteStateres, usePochetteStateres } from "./PochetteStateres";
import { SectionDesCartes } from "./Cartes";
import { DessinDeLaPochette, DialogueAchatModele, DialogueModeles, EssaiDuModele, SectionDesModeles } from "./SectionModeles";
import { pochetteDeRarete } from "./SentierDessins";

/** Le repère de forme d'une rareté, de un à cinq losanges : le même que sur les cases. */
function Losanges({ rang }: { rang: number }) {
  return (
    <span class="filtre-rang" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** Un choix du filtre d'un rayon : son nom, et le nombre d'objets qu'il montre. Sans objet, il ne se choisit pas. */
function ChoixDeFiltre({ filtre, nom, rang, nombre, choisi, onClick }: { filtre: Filtre; nom: string; rang: number; nombre: number; choisi: boolean; onClick: () => void }) {
  return (
    <button type="button" class="chip filtre" data-rarete={filtre} aria-pressed={choisi} disabled={nombre === 0} onClick={onClick} data-testid={`filtre-${filtre}`}>
      {rang > 0 && <Losanges rang={rang} />}
      {nom}
      <span class="filtre-nombre tnum">{nombre}</span>
      <span class="sr-only"> {nombre > 1 ? "objets" : "objet"}</span>
    </button>
  );
}

/**
 * L'offre d'un membre : la case de l'objet, qui s'essaie sur le Gaulois comme une case de la boutique, puis son prix, son
 * vendeur, sa fin et « Acheter ».
 */
function Offre({ offre, maintenant, essayee, occupe, onEssai, onAcheter }: { offre: OffreLisible; maintenant: Date; essayee: boolean; occupe: boolean; onEssai: () => void; onAcheter: () => void }) {
  return (
    <li class="marche-offre" data-testid="marche-offre">
      <button type="button" class="marche-offre-essai" aria-pressed={essayee} onClick={onEssai} data-testid="marche-offre-essai">
        <CaseObjet objet={offre} />
        {essayee ? (
          <span class="case-essai">
            <span class="sr-only">, en </span>essai
          </span>
        ) : (
          <span class="sr-only">, à essayer</span>
        )}
      </button>
      <PrixDuMarche valeur={offre.prix} class="marche-offre-prix" />
      <span class="marche-offre-vendeur">Vendu par {offre.vendeur}</span>
      <span class="marche-offre-fin">{finDeLOffre(offre.expire_le, maintenant)}</span>
      <button type="button" class="btn btn-ghost marche-offre-bouton" disabled={occupe} onClick={onAcheter} aria-label={`Acheter « ${offre.nom} », ${fmtInt(offre.prix)} statères`}>
        Acheter
      </button>
    </li>
  );
}

/** Une de ses propres offres : la case, le prix, la fin, et « Retirer ». */
function MonOffre({ offre, maintenant, occupe, onRetirer }: { offre: OffreLisible; maintenant: Date; occupe: boolean; onRetirer: () => void }) {
  return (
    <li class="marche-offre" data-testid="marche-mon-offre">
      <CaseObjet objet={offre} />
      <PrixDuMarche valeur={offre.prix} class="marche-offre-prix" />
      <span class="marche-offre-fin">{finDeLOffre(offre.expire_le, maintenant)}</span>
      <button type="button" class="btn btn-ghost marche-offre-bouton" disabled={occupe} onClick={onRetirer} aria-label={`Retirer « ${offre.nom} », ${fmtInt(offre.prix)} statères`}>
        Retirer
      </button>
    </li>
  );
}

type Etat = { kind: "lecture" } | { kind: "erreur"; message: string } | { kind: "pret"; enregistree: Tenue | null };
/** Le marché des membres : fermé à un compte pas encore validé (la phrase du serveur), en panne, ou lu. */
type EtatDuMarche = { kind: "lecture" } | { kind: "ferme"; message: string } | { kind: "panne"; message: string } | { kind: "pret"; marche: MarcheLu };
type Fenetre = { kind: "achat"; emplacement: Emplacement; id: string; prix: number } | { kind: "pochette" } | { kind: "familiers" } | { kind: "stateres" } | { kind: "modeles" } | { kind: "modele"; id: string; prix: number } | { kind: "offre"; offre: OffreLisible } | { kind: "vente" } | { kind: "revente" } | null;
/** Le dernier objet reçu (boutique, pochette ou marché) : il se porte d'un clic. */
type Acquis = RefObjet & { porte: boolean };
/** Le dernier familier sorti de la pochette des familiers : il se montre d'un clic. */
type FamilierRecu = { id: string; montre: boolean };
/** Le dernier Gaulois unique reçu (boutique ou pochette) : il se porte d'un clic. */
type ModeleRecu = { id: string; porte: boolean };

const refusDe = (e: unknown): string => (e instanceof ServerError ? e.code : "network");
/** Le refus du serveur, dans les mots du marché quand il en a. */
const motsDuMarche = (e: unknown): string => (e instanceof ServerError ? (messageDuMarche(e.code) ?? e.message) : messageOf(e));
const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
const SANS_OFFRE: readonly OffreLisible[] = [];
/** Le dessin de la carte du marché : la bourse en pixels du sentier, déjà dessinée. */
const BOURSE_DU_MARCHE = pochetteDeRarete("peu-commun");
/** Le bloc des rayons (la barre et le rayon ouvert) : l'adresse des bannières y descend. */
const ID_DES_RAYONS = "boutique-rayons-choix";

/**
 * « La boutique », troisième onglet de « Mon Gaulois » (`/village#boutique`, 15 novembre 2026) : les achats en statères
 * (boutique, pochette, marché), au même endroit. Une seule bourse, un seul Gaulois
 * d'essayage : il porte la tenue enregistrée, et essaie un objet de la boutique du clan comme l'offre d'un membre. Chaque
 * rayon d'objets (tête, haut, bas, pieds, arme) montre ce que vendent les membres, puis ce que vend la boutique, réduits
 * ensemble à une rareté. Le sixième onglet, « Bannière », tient les bannières de /gaulois (`Bannieres.tsx`). Jusqu'au 15
 * novembre 2026, elles formaient une section entière de la page ; le pilote trouvait la page trop longue, et elles sont
 * passées dans cet onglet. Le septième, « Uniques », tient les Gaulois uniques (`SectionModeles.tsx`). Ce qui s'ajoutera
 * prendra un onglet à la suite (`RAYONS_BOUTIQUE`). « Vendre un objet » et « Vos offres » sont au-dessus des rayons.
 *
 * Les pochettes ont leur partie de la page depuis le soir du 16 novembre 2026 (`/village#pochettes`, `pochettes` ici) :
 * le même écran, sans le marché ni la barre des rayons. Elle tient les quatre pochettes : la surprise,
 * celle des familiers avec sa ménagerie (`PochetteFamiliers.tsx`), celle des bannières (dans `Bannieres.tsx`) et celle des
 * Gaulois uniques (dans `SectionModeles.tsx`). Jusque-là, les deux premières étaient au-dessus des rayons, les deux autres
 * en tête de leur onglet. Un familier ne s'obtient
 * que là ; `#familiers` ouvre l'onglet. Le familier que le compte montre se tient à côté du Gaulois d'essayage. Leurs fonctions
 * (`get_mes_familiers`, `ouvrir_pochette_familiers`, `choisir_familier`) sont à part : en panne, le reste de la page marche.
 *
 * Les Gaulois uniques (15 novembre 2026, `SectionModeles.tsx`) sont le septième onglet : leur pochette, puis les onze
 * modèles, qui s'essaient sur le Gaulois d'essayage comme un objet (un seul essai à la fois). Un modèle se porte en enregistrant la
 * tenue, comme un objet. Leurs fonctions (`get_mes_modeles`, `acheter_modele`, `ouvrir_pochette_modeles`) sont à part.
 *
 * Le serveur décide de tout (prix, solde, tirage, achat, vente) par les fonctions qui existaient déjà : `get_mon_gaulois`,
 * `get_ma_boutique`, `get_mes_stateres`, `acheter_objet`, `ouvrir_pochette`, `get_marche`, `mettre_en_vente`,
 * `retirer_offre`, `acheter_offre`. L'écran ne fait que proposer et montrer ce qu'il a reçu. Le marché ne s'ouvre qu'aux
 * membres validés : un autre compte voit la boutique, et la phrase du serveur à la place du marché. Une fonction en panne
 * n'emporte pas les autres.
 *
 * « Le porter », après un achat : la tenue enregistrée est relue (`get_mon_gaulois`), l'objet y prend sa place, et le
 * serveur l'enregistre (`enregistrer_mon_gaulois`, qui vérifie la propriété) ; puis `gal:gaulois-enregistre`, comme le
 * vestiaire, pour le Gaulois compagnon et l'inscription.
 */
export default function Boutique({ pochettes = false }: { pochettes?: boolean }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [tenue, setTenue] = useState<Tenue>(TENUE_DE_DEPART);
  const [bourse, setBourse] = useState<MesStateres | null>(null);
  const [boutique, setBoutique] = useState<MaBoutique | null>(null);
  const [etatMarche, setEtatMarche] = useState<EtatDuMarche>({ kind: "lecture" });
  // Le seul solde de la page : le dernier que le serveur a donné, à la boutique ou au marché.
  const [solde, setSolde] = useState<number | null>(null);
  const [panne, setPanne] = useState(false);
  const [essai, setEssai] = useState<Essai | null>(null);
  const [rayonChoisi, setRayon] = useState<RayonBoutique>(RAYONS_BOUTIQUE[0]);
  // Dans la partie « Pochettes » de la page, l'écran ne montre qu'elles : ni marché, ni barre des rayons.
  const rayon: RayonOuvert = pochettes ? RAYON_POCHETTES : rayonChoisi;
  // Les bannières ne se lisent qu'au premier passage dans leur onglet ou dans celui des pochettes (leurs dessins pèsent
  // lourd) ; elles restent ensuite à la page, cachées dans un autre rayon, pour garder la vitrine et les filtres choisis.
  const [bannieresOuvertes, setBannieresOuvertes] = useState(false);
  // De même pour les Gaulois uniques, le septième onglet.
  const [uniquesOuverts, setUniquesOuverts] = useState(false);
  // Les cartes ne se lisent qu'au premier passage dans leur onglet, puis restent, seulement cachées.
  const [cartesOuvertes, setCartesOuvertes] = useState(false);
  // L'onglet des cartes ne paraît que si le serveur connaît le rayon (migration 20261117001200) : tant qu'elle n'est pas
  // collée, `get_mes_cartes` n'existe pas et rien ne change à la barre. Un refus du serveur (visiteur, compte suspendu)
  // prouve qu'il existe.
  const [cartesInstallees, setCartesInstallees] = useState(false);
  useEffect(() => {
    call<unknown>("get_mes_cartes").then(
      () => setCartesInstallees(true),
      (e: unknown) => setCartesInstallees(e instanceof ServerError && e.code !== "network"),
    );
  }, []);
  const rayonsMontres = useMemo(() => (cartesInstallees ? RAYONS_BOUTIQUE : RAYONS_BOUTIQUE.filter((r) => r !== RAYON_CARTES)), [cartesInstallees]);
  const [filtres, setFiltres] = useState<Filtres>({});
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  // Les pochettes gagnées à la loterie du lundi, qui restent à ouvrir : relues à l'ouverture de l'onglet et à chaque
  // fenêtre refermée. Une pochette gagnée s'ouvre sans rien payer : le serveur crédite son prix au moment de le débiter
  // (internal.village_debiter), donc l'écran ne la ferme pas pour un solde trop court.
  const [gagnees, setGagnees] = useState<Partial<Record<PochetteGagnee, number>>>({});
  const relireLesGagnees = () =>
    void call<unknown>("get_pochettes_gagnees")
      .then(lirePochettesGagnees, () => null)
      .then((bons) => {
        if (bons) setGagnees(bons);
      });
  useEffect(() => {
    if (pochettes && fenetre === null) relireLesGagnees();
  }, [pochettes, fenetre]);
  /** Après chaque ouverture, réussie ou refusée : un bon a pu partir, la fenêtre suivante doit le savoir. */
  const puisRelire = <T,>(issue: Promise<Issue<T>>): Promise<Issue<T>> => issue.finally(relireLesGagnees);
  const avecBon = (pochette: PochetteGagnee, solde: number, prix: number): number => (gagnees[pochette] ? Math.max(solde, prix) : solde);
  const gagneesEnMots = bonsEnMots(gagnees);
  // L'étal : la pochette dont la carte est montrée. À l'arrivée, la première gagnée à la loterie, sinon la surprise. Le
  // choix se fige dès qu'il est fait, par un clic ou par cette arrivée : il ne suit plus les pochettes gagnées, qui
  // changent pendant qu'on en ouvre une (la carte, et la fenêtre des bannières qu'elle porte, disparaîtraient).
  const [pochetteChoisie, setPochetteChoisie] = useState<PochetteDeLEtal | null>(null);
  const pochetteSurLEtal = pochetteChoisie ?? "surprise";
  useEffect(() => {
    if (!pochettes || pochetteChoisie !== null || fenetre !== null) return;
    const gagnee = pochetteDOuverture(gagnees);
    if (gagnee !== "surprise") setPochetteChoisie(gagnee);
  }, [pochettes, gagnees, pochetteChoisie, fenetre]);
  // Le prix de la pochette des bannières, que leur section lit elle-même.
  const [prixDesBannieres, setPrixDesBannieres] = useState<number | null>(null);
  const [acquis, setAcquis] = useState<Acquis | null>(null);
  const familiers = useFamiliers();
  const pochetteStateres = usePochetteStateres();
  const [familierRecu, setFamilierRecu] = useState<FamilierRecu | null>(null);
  const modeles = useModeles();
  // Le Gaulois unique que le Gaulois essaie : jamais en même temps qu'un objet.
  const [essaiModele, setEssaiModele] = useState<string | null>(null);
  const [modeleRecu, setModeleRecu] = useState<ModeleRecu | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [problemeFenetre, setProblemeFenetre] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  const [mesOffresOuvertes, setMesOffresOuvertes] = useState(false);
  // Augmenté quand l'adresse demande le marché (`#marche`) : la page y descend une fois dessinée.
  const [appelDuMarche, setAppelDuMarche] = useState(0);
  // De même pour les bannières (`#bannieres`, le lien de « Mon Gaulois ») : leur onglet s'ouvre, la page descend aux rayons.
  const [appelDesRayons, setAppelDesRayons] = useState(0);
  // De même pour la pochette des familiers (`#familiers`, qui ouvre la partie « Pochettes ») : la page y descend.
  const [appelDesFamiliers, setAppelDesFamiliers] = useState(0);
  const maintenant = useNow();
  // La bannière qu'il montre sur /gaulois, derrière le Gaulois d'essayage, comme au vestiaire.
  const decor = useDecorDuGaulois();

  /** La boutique et la bourse, relues ensemble : l'une sans l'autre ne bloque rien. */
  const lireLaBoutique = async (): Promise<void> => {
    const [b, s] = await Promise.all([call<unknown>("get_ma_boutique").then(lireBoutique, () => null), call<unknown>("get_mes_stateres").then(lireStateres, () => null)]);
    setBoutique(b);
    setBourse(s);
    if (b) setSolde(b.solde);
    setPanne(!b || !s);
  };

  // La revente au jeu : ce qui peut partir, et ce que le jeu rend. Un serveur qui ne la connaît pas encore, ou en panne,
  // ne montre pas son bouton.
  const [revente, setRevente] = useState<MaRevente | null>(null);
  const lireLaRevente = async (): Promise<void> => {
    setRevente(await call<unknown>("get_ma_revente").then(lireMaRevente, () => null));
  };
  const revendre = async (objet: ObjetRevendable, nom: string): Promise<void> => {
    setOccupe(true);
    setProblemeFenetre(null);
    setReussite(null);
    try {
      const faite = lireRevente(await call<unknown>("revendre_objet", { p_emplacement: objet.emplacement, p_objet: objet.objet, p_rendu_vu: objet.rendu }));
      if (!faite) throw new ServerError("network");
      setSolde(faite.solde);
      await Promise.all([lireLaBoutique(), lireLaRevente()]);
      setReussite(`« ${nom} » est revendu au jeu : vous recevez ${stateres(faite.rendu)}.`);
      setFenetre(null);
    } catch (e) {
      setProblemeFenetre(e instanceof ServerError ? (messageDeLaRevente(e.code) ?? messageDuMarche(e.code) ?? e.message) : messageOf(e));
      // Ce qui se revend a pu changer : la liste se relit derrière le message.
      void lireLaRevente();
    } finally {
      setOccupe(false);
    }
  };

  const recevoirLeMarche = (reponse: unknown): MarcheLu => {
    const marche = lireMarche(reponse);
    if (!marche) throw new ServerError("network");
    setEtatMarche({ kind: "pret", marche });
    setSolde(marche.solde);
    return marche;
  };

  /** Le marché des membres. `discret` : une relecture, qui ne remplace pas ce qui est à l'écran par une panne. */
  const lireLeMarche = async (discret: boolean): Promise<MarcheLu | null> => {
    try {
      return recevoirLeMarche(await call<unknown>("get_marche"));
    } catch (e) {
      if (e instanceof ServerError && e.code === "not_validated") setEtatMarche({ kind: "ferme", message: motsDuMarche(e) });
      else if (!discret) setEtatMarche({ kind: "panne", message: "Le marché des membres ne répond pas pour l'instant." });
      return null;
    }
  };

  /** Arrivé par l'adresse du marché : le premier rayon où un membre vend s'ouvre, ses offres se déplient, la page y descend. */
  const allerAuMarche = (marche: MarcheLu | null) => {
    if (marche) setRayon(rayonDOuverture(marche.offres, true));
    setMesOffresOuvertes(true);
    setAppelDuMarche((n) => n + 1);
  };

  /** Arrivé par l'adresse des bannières : leur onglet s'ouvre, la page descend aux rayons. */
  const allerAuxBannieres = () => {
    setRayon(RAYON_BANNIERE);
    setAppelDesRayons((n) => n + 1);
  };

  /** Arrivé par l'adresse des Gaulois uniques (`#gaulois-uniques`, le lien de « Mon Gaulois ») : de même. */
  const allerAuxUniques = () => {
    setRayon(RAYON_UNIQUES);
    setAppelDesRayons((n) => n + 1);
  };

  /** Arrivé par l'adresse de la pochette des familiers, dans la partie « Pochettes » : la page y descend. */
  const allerAuxFamiliers = () => {
    if (!pochettes) return;
    setPochetteChoisie("familiers");
    setAppelDesFamiliers((n) => n + 1);
  };

  const lire = async () => {
    setEtat({ kind: "lecture" });
    try {
      const [reponse, , marche] = await Promise.all([call<unknown>("get_mon_gaulois"), lireLaBoutique(), pochettes ? null : lireLeMarche(false), familiers.lire(), pochetteStateres.lire(), pochettes ? null : lireLaRevente()]);
      const enregistree = tenueDuServeur(reponse);
      setEtat({ kind: "pret", enregistree });
      if (enregistree) setTenue(enregistree);
      if (demandeLeMarche(location.hash)) allerAuMarche(marche);
      if (demandeLesBannieres(location.hash)) allerAuxBannieres();
      if (demandeLesModeles(location.hash)) allerAuxUniques();
      if (demandeLesFamiliers(location.hash)) allerAuxFamiliers();
      // Venu de la vitrine (« où trouver cet objet ») : le rayon de l'objet s'ouvre, et la page y descend.
      const pochetteVoulue = pochettes ? pochetteDemandeeUneFois() : null;
      if (pochetteVoulue) setPochetteChoisie(pochetteVoulue);
      const demande = pochettes ? null : rayonDemandeUneFois();
      if (demande) {
        setRayon(demande);
        setAppelDesRayons((n) => n + 1);
      }
    } catch (e) {
      setEtat({ kind: "erreur", message: messageOf(e) });
    }
  };

  useEffect(() => {
    void lire();
  }, []);

  const marcheLu = etatMarche.kind === "pret" ? etatMarche.marche : null;
  const offres = marcheLu?.offres ?? SANS_OFFRE;

  // Un lien vers le marché, les bannières ou la pochette des familiers suivi dans la page elle-même.
  useEffect(() => {
    const surAdresse = () => {
      if (demandeLeMarche(location.hash)) allerAuMarche(marcheLu);
      if (demandeLesBannieres(location.hash)) allerAuxBannieres();
      if (demandeLesModeles(location.hash)) allerAuxUniques();
      if (demandeLesFamiliers(location.hash)) allerAuxFamiliers();
    };
    window.addEventListener("hashchange", surAdresse);
    return () => window.removeEventListener("hashchange", surAdresse);
  }, [marcheLu]);

  useEffect(() => {
    if (appelDuMarche > 0) document.getElementById(ANCRE_MARCHE)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [appelDuMarche]);
  useEffect(() => {
    if (appelDesRayons > 0) document.getElementById(ID_DES_RAYONS)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [appelDesRayons]);

  // La pochette des familiers, si elle est dessinée ; sinon (sa fonction en panne), le haut des rayons.
  useEffect(() => {
    if (appelDesFamiliers > 0) (document.getElementById(ANCRE_FAMILIERS) ?? document.getElementById(ID_DES_RAYONS))?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [appelDesFamiliers]);

  useEffect(() => {
    if (rayon === RAYON_BANNIERE || rayon === RAYON_POCHETTES) setBannieresOuvertes(true);
    if (rayon === RAYON_CARTES) setCartesOuvertes(true);
  }, [rayon]);

  // Les Gaulois uniques ne se lisent qu'au premier passage dans leur onglet, comme les bannières.
  useEffect(() => {
    if ((rayon !== RAYON_UNIQUES && rayon !== RAYON_POCHETTES) || uniquesOuverts) return;
    setUniquesOuverts(true);
    void modeles.lire();
  }, [rayon]);

  // Arrivé par leur adresse : une fois les Gaulois uniques lus, la page a grandi, et redescend aux rayons.
  const uniquesLus = modeles.etat.kind !== "lecture";
  useEffect(() => {
    if (uniquesLus && demandeLesModeles(location.hash)) document.getElementById(ID_DES_RAYONS)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [uniquesLus]);

  // Le modèle qu'on essayait est maintenant porté : l'essayage s'arrête.
  useEffect(() => {
    setEssaiModele((id) => essaiDuModeleValide(id, modeles.mes));
  }, [modeles.mes]);

  // L'offre qu'on essayait est partie (achetée, retirée, finie) : l'essayage s'arrête.
  useEffect(() => {
    setEssai((e) => essaiValide(e, offres));
  }, [offres]);

  const essayer = (suite: Essai | null) => {
    setEssai(suite);
    setEssaiModele(null);
    setReussite(null);
    setProbleme(null);
    setAcquis(null);
    setFamilierRecu(null);
    setModeleRecu(null);
  };

  /** Essayer un Gaulois unique sur le Gaulois de la page (`null` : ne plus l'essayer). L'objet à l'essai est retiré. */
  const essayerLeModele = (id: string | null) => {
    essayer(null);
    setEssaiModele(id);
  };

  /** Après un refus, la boutique est relue : le message dit ce qui manque d'après le solde du serveur, pas d'après l'écran. */
  const refuser = async (e: unknown, prix: number): Promise<Issue<never>> => {
    const fraiche = await call<unknown>("get_ma_boutique").then(lireBoutique, () => null);
    if (fraiche) {
      setBoutique(fraiche);
      setSolde(fraiche.solde);
    }
    return { ok: false, message: messageDuRefus(refusDe(e), { manque: fraiche ? manque(fraiche.solde, prix) : null }) };
  };

  /** Un objet vient d'entrer dans l'inventaire : la page le dit, et propose de le porter. */
  const recevoir = (ref: RefObjet, nom: string) => {
    setEssai(null);
    setEssaiModele(null);
    setProbleme(null);
    setFamilierRecu(null);
    setModeleRecu(null);
    setAcquis({ emplacement: ref.emplacement, objet: ref.objet, porte: tenue[ref.emplacement] === ref.objet });
    setReussite(`« ${nom} » est dans votre inventaire.`);
  };

  const acheter = async (emplacement: Emplacement, id: string, prix: number): Promise<Issue<number>> => {
    try {
      // Le prix affiché dans la fenêtre : s'il a changé entre-temps, le serveur refuse (`prix_change`) sans rien débiter.
      const achat = lireAchat(await call<unknown>("acheter_objet", { p_emplacement: emplacement, p_objet: id, p_prix_vu: prix }));
      if (!achat) return { ok: false, message: ILLISIBLE };
      setBoutique((b) => b && { ...b, solde: achat.solde, inventaire: avecUnExemplaire(b.inventaire, achat.objet, "achat", new Date().toISOString()) });
      setSolde(achat.solde);
      const nom = OBJETS[emplacement][id]?.nom ?? "Objet";
      recevoir(achat.objet, nom);
      return { ok: true, valeur: achat.solde };
    } catch (e) {
      return refuser(e, prix);
    }
  };

  const ouvrirPochette = async (prix: number): Promise<Issue<PochetteReponse>> => {
    try {
      const tirage = lirePochette(await call<unknown>("ouvrir_pochette", { p_prix_vu: prix }));
      if (!tirage) return { ok: false, message: ILLISIBLE };
      setBoutique((b) => b && { ...b, solde: tirage.solde, inventaire: avecUnExemplaire(b.inventaire, tirage.objet, "pochette", new Date().toISOString()) });
      setSolde(tirage.solde);
      recevoir(tirage.objet, OBJETS[tirage.objet.emplacement][tirage.objet.objet]?.nom ?? "Objet");
      return { ok: true, valeur: tirage };
    } catch (e) {
      return refuser(e, prix);
    }
  };

  /**
   * Ouvrir une pochette des familiers : le serveur tire, débite et répond le familier reçu. Le solde de la page suit ;
   * après un refus, la boutique se relit, pour que le solde affiché soit celui du serveur.
   */
  const ouvrirPochetteFamiliers = async (prix: number): Promise<Issue<PochetteFamiliersReponse>> => {
    const issue = await familiers.ouvrir(prix);
    if (!issue.ok) {
      void lireLaBoutique();
      return issue;
    }
    const { solde: reste, familier: recu } = issue.valeur;
    setBoutique((b) => b && { ...b, solde: reste });
    setSolde(reste);
    setProbleme(null);
    setAcquis(null);
    setModeleRecu(null);
    setFamilierRecu({ id: recu.familier, montre: false });
    setReussite(`« ${familierDe(recu.familier)?.nom ?? "Ce familier"} » a rejoint vos familiers.`);
    return issue;
  };

  /**
   * Ouvrir une pochette de statères : le serveur tire, débite le prix, crédite le gain et répond le solde. La bourse de
   * la page suit ; après un refus, la boutique se relit, pour que le solde affiché soit celui du serveur.
   */
  const ouvrirPochetteStateres = async (prix: number): Promise<Issue<PochetteStateresReponse>> => {
    const issue = await pochetteStateres.ouvrir(prix);
    if (!issue.ok) {
      void lireLaBoutique();
      return issue;
    }
    setBoutique((b) => b && { ...b, solde: issue.valeur.solde });
    setSolde(issue.valeur.solde);
    setProbleme(null);
    return issue;
  };

  /** Montrer un familier à côté de son Gaulois : le serveur vérifie qu'il est au compte, et répond celui qu'il montre. */
  const montrerLeFamilier = async (id: string) => {
    setFenetre(null);
    setOccupe(true);
    setProbleme(null);
    const issue = await familiers.choisir(id);
    if (issue.ok) {
      setFamilierRecu((recu) => (recu && recu.id === id ? { ...recu, montre: issue.valeur === id } : recu));
      setReussite(`« ${familierDe(id)?.nom ?? "Ce familier"} » se tient à côté de votre Gaulois.`);
    } else {
      setReussite(null);
      setProbleme(issue.message);
    }
    setOccupe(false);
  };

  /** Un Gaulois unique vient d'entrer au compte (boutique ou pochette) : le solde suit, la page le dit et propose de le porter. */
  const recevoirLeModele = (id: string, reste: number) => {
    setBoutique((b) => b && { ...b, solde: reste });
    setSolde(reste);
    setEssai(null);
    setEssaiModele(null);
    setProbleme(null);
    setAcquis(null);
    setFamilierRecu(null);
    setModeleRecu({ id, porte: false });
    setReussite(`« ${modeleParId(id)?.nom ?? "Ce Gaulois unique"} » est à vous.`);
  };

  /** Acheter un Gaulois unique, ou ouvrir leur pochette : après un refus, la boutique se relit, pour le solde du serveur. */
  const acheterLeModele = async (id: string, prix: number) => {
    const modele = modeleParId(id);
    const issue = modele ? await modeles.acheter(id, modele.rarete, prix) : ({ ok: false, message: messageDuRefusDesModeles("unknown_modele") } as const);
    if (issue.ok) recevoirLeModele(issue.valeur.modele.modele, issue.valeur.solde);
    else void lireLaBoutique();
    return issue;
  };
  const ouvrirPochetteModeles = async (prix: number) => {
    const issue = await modeles.ouvrir(prix);
    if (issue.ok && issue.valeur.modele) recevoirLeModele(issue.valeur.modele.modele, issue.valeur.solde);
    else if (issue.ok) {
      // Un remboursement : rien n'entre au compte, la bourse seule change, et la page le dit.
      const { solde: reste, remboursement } = issue.valeur;
      setBoutique((b) => b && { ...b, solde: reste });
      setSolde(reste);
      setProbleme(null);
      setAcquis(null);
      setFamilierRecu(null);
      setModeleRecu(null);
      setReussite(remboursement ? `La pochette vous a rendu ${stateres(remboursement.rendu)}.` : null);
    } else void lireLaBoutique();
    return issue;
  };

  /**
   * Une action du marché (vendre, retirer, acheter une offre) : le serveur répond le marché à jour, et l'inventaire se
   * relit. `dansFenetre` : le refus s'écrit dans la fenêtre ouverte. Rend vrai si le serveur a accepté.
   */
  const agir = async (fonction: string, args: Record<string, unknown>, dansFenetre: boolean): Promise<boolean> => {
    setOccupe(true);
    setProbleme(null);
    setProblemeFenetre(null);
    setReussite(null);
    setAcquis(null);
    setFamilierRecu(null);
    setModeleRecu(null);
    try {
      recevoirLeMarche(await call<unknown>(fonction, args));
      setFenetre(null);
      void lireLaBoutique();
      return true;
    } catch (e) {
      (dansFenetre ? setProblemeFenetre : setProbleme)(motsDuMarche(e));
      // L'offre a pu partir entre-temps : le marché se relit derrière le message.
      void lireLeMarche(true);
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const vendre = async (objet: PossedeLisible, prix: number) => {
    if (await agir("mettre_en_vente", { p_emplacement: objet.emplacement, p_objet: objet.objet, p_prix: prix }, true)) {
      setReussite(`« ${objet.nom} » est en vente.`);
      setMesOffresOuvertes(true);
    }
  };
  const retirer = async (offre: OffreLisible) => {
    if (await agir("retirer_offre", { p_id: offre.id }, false)) setReussite(`« ${offre.nom} » est revenu dans votre inventaire.`);
  };
  const acheterOffre = async (offre: OffreLisible) => {
    if (await agir("acheter_offre", { p_id: offre.id }, true)) recevoir(offre, offre.nom);
  };

  /**
   * Porter l'objet qu'on vient de recevoir : la tenue enregistrée est relue, l'objet y prend sa place, le serveur
   * l'enregistre. La page ne porte jamais que ce que le serveur a accepté.
   */
  const enregistrerLaTenue = async (changer: (actuelle: Tenue) => Tenue, fait: () => void) => {
    setFenetre(null);
    setOccupe(true);
    setProbleme(null);
    try {
      const actuelle = tenueDuServeur(await call<unknown>("get_mon_gaulois")) ?? tenue;
      const enregistree = tenueDuServeur(await call<unknown>("enregistrer_mon_gaulois", { p_tenue: changer(actuelle) }));
      if (!enregistree) throw new ServerError("network");
      setTenue(enregistree);
      setEtat({ kind: "pret", enregistree });
      setEssai(null);
      setEssaiModele(null);
      modeles.noterLaTenue(enregistree);
      // Comme le vestiaire : le Gaulois compagnon (src/scripts/compagnon.ts) et l'inscription écoutent cette annonce.
      window.dispatchEvent(new CustomEvent("gal:gaulois-enregistre", { detail: { tenue: enregistree } }));
      fait();
    } catch (e) {
      setReussite(null);
      setProbleme(messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  const porter = (ref: RefObjet) =>
    enregistrerLaTenue(
      (actuelle) => changerObjet(actuelle, ref.emplacement, ref.objet),
      () => {
        setAcquis({ ...ref, porte: true });
        setReussite(`Votre Gaulois porte « ${OBJETS[ref.emplacement][ref.objet]?.nom ?? "cet objet"} ».`);
      },
    );

  /**
   * Porter un Gaulois unique, ou revenir au corps humain (`null`) : comme un objet, la tenue enregistrée est relue, le
   * modèle y prend la place du corps, et le serveur l'enregistre s'il est au compte.
   */
  const porterLeModele = (id: string | null) =>
    enregistrerLaTenue(
      (actuelle) => tenueAvecModele(actuelle, id),
      () => {
        setAcquis(null);
        setFamilierRecu(null);
        setModeleRecu((recu) => (recu && recu.id === id ? { ...recu, porte: true } : null));
        setReussite(id ? `Votre Gaulois a le corps « ${modeleParId(id)?.nom ?? "de ce Gaulois unique"} ».` : "Votre Gaulois retrouve son corps humain.");
      },
    );

  const { racine, scene, barre, panneau } = useSceneCollee(rayon, etat.kind);
  // Ce que la section des bannières montre : sa galerie dans « Bannière », sa seule pochette dans « Pochettes ». Cachée sous
  // un autre rayon, elle garde sa dernière forme : la galerie ne se dessine pas pour rien.
  const partieDesBannieres = useRef<"bannieres" | "pochette">("bannieres");
  if (rayon === RAYON_BANNIERE) partieDesBannieres.current = "bannieres";
  else if (rayon === RAYON_POCHETTES) partieDesBannieres.current = "pochette";
  // De même pour les Gaulois uniques : leurs modèles dans « Uniques », leur seule pochette dans « Pochettes ».
  const partieDesUniques = useRef<"modeles" | "pochette">("modeles");
  if (rayon === RAYON_UNIQUES) partieDesUniques.current = "modeles";
  else if (rayon === RAYON_POCHETTES) partieDesUniques.current = "pochette";

  if (etat.kind === "lecture") return <Loading label={pochettes ? "Lecture des pochettes…" : "Lecture de la boutique…"} />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={() => void lire()} />;

  const village = `${basePath()}${ADRESSE_VILLAGE}`;
  if (!etat.enregistree) {
    return (
      <div class="vestiaire" data-testid="boutique-sans-gaulois">
        <div class="vestiaire-scene">
          <ApercuGaulois tenue={TENUE_DE_DEPART} />
        </div>
        <div class="vestiaire-porte">
          <p class="text-lg">{messageDuRefus("no_gaulois")}</p>
          <div class="mt-5">
            <a class="btn btn-primary" href={village}>
              Créer mon Gaulois
            </a>
          </div>
        </div>
      </div>
    );
  }

  const miennes = mesOffres(offres);
  const soldeConnu = solde ?? boutique?.solde ?? null;
  const fermee = boutique && !boutique.peut_acheter ? raisonBoutiqueFermee(true) : null;
  // Le rayon d'objets ouvert, s'il en est un (et non celui des bannières ou des pochettes).
  const rayonObjets = estUnRayonDObjets(rayon) ? rayon : null;
  const possede = (id: string): number => (boutique && rayonObjets ? quantitePossedee(boutique.inventaire, rayonObjets, id) : 0);
  const range = rayonObjets ? rangerLaBoutique(rayonObjets, possede, offres, filtres[rayonObjets]) : null;
  const comptesDesOffres = offresParRayon(offres);

  // Ce que le Gaulois essaie : son nom, son prix, qui le vend, et ce qui empêche de l'acheter.
  const offreEnEssai = offreEssayee(essai, offres);
  const ficheEnEssai = essai ? OBJETS[essai.emplacement][essai.objet] : undefined;
  const prixEssai = essai?.source === "boutique" ? prixDeLObjet(boutique?.prix, essai.emplacement, essai.objet) : (offreEnEssai?.prix ?? null);
  const raisonEssai = !essai ? null : essai.source === "boutique" ? raisonDeLEssai(essai, prixEssai, soldeConnu, fermee, miennes) : offreEnEssai && soldeConnu !== null ? raisonDeLOffre(offreEnEssai, soldeConnu, boutique?.inventaire ?? null, miennes) : null;
  const acheterLEssai = (): void => {
    if (!essai || prixEssai === null) return;
    setProblemeFenetre(null);
    if (essai.source === "boutique") setFenetre({ kind: "achat", emplacement: essai.emplacement, id: essai.objet, prix: prixEssai });
    else if (offreEnEssai) setFenetre({ kind: "offre", offre: offreEnEssai });
  };
  const essaiAchetable = essai !== null && prixEssai !== null && !raisonEssai && (essai.source === "boutique" ? boutique !== null : offreEnEssai !== null);

  const achat = fenetre?.kind === "achat" ? objetPayant(fenetre.emplacement, fenetre.id) : null;
  // Ce que les fenêtres du marché lisent de la boutique déjà lue (ses prix, l'inventaire avec le nom de chaque objet).
  const pourLeMarche = boutique && lireBoutiqueDuMarche(boutique);
  const pochetteOuverte = fenetre?.kind === "pochette" || fenetre?.kind === "familiers" || fenetre?.kind === "stateres" || fenetre?.kind === "modeles";

  // Le Gaulois unique à l'essai : ce qu'on peut en faire, son prix, et ce qui empêche de l'acheter.
  const modeleEnEssai = modeles.mes ? modeleParId(essaiModele) : null;
  const prixDuModeleEssaye = modeleEnEssai && modeles.mes ? modeles.mes.prix[modeleEnEssai.rarete] : 0;
  const modeleAAcheter = fenetre?.kind === "modele" ? modeleParId(fenetre.id) : null;
  const fermerLaFenetre = () => {
    setFenetre(null);
    setProblemeFenetre(null);
  };

  return (
    <div ref={racine} class="vestiaire boutique-page" data-testid="boutique">
      <div ref={scene} class="vestiaire-scene" data-familier={tailleDeLApercu(familiers.montre) ?? undefined}>
        <ApercuGaulois tenue={modeleEnEssai ? tenueAvecModele(tenue, modeleEnEssai.id) : essai ? changerObjet(tenue, essai.emplacement, essai.objet) : tenue} familier={familiers.montre} decor={decor} />
        <div class="vestiaire-scene-actions">
          <div class="vestiaire-essai" role="status" data-testid="boutique-essai">
            {essai && ficheEnEssai && (
              <>
                <span>
                  Essayage : <strong>{ficheEnEssai.nom}</strong>
                </span>
                {prixEssai !== null && <Prix montant={prixEssai} class="vestiaire-essai-prix" />}
                {offreEnEssai && <span class="boutique-essai-vendeur">Vendu par {offreEnEssai.vendeur}</span>}
                {raisonEssai && (
                  <span class="vestiaire-essai-raison" data-testid="boutique-raison">
                    {raisonEssai}
                  </span>
                )}
                <span class="vestiaire-essai-actions">
                  {essaiAchetable && (
                    <button type="button" class="chip chip-fort" onClick={acheterLEssai} data-testid="boutique-acheter">
                      Acheter
                    </button>
                  )}
                  {/* « Retirer » est le mot des offres qu'on retire du marché : ici, on arrête un essai. */}
                  <button type="button" class="chip" onClick={() => essayer(null)} data-testid="boutique-fin-essai">
                    Ne plus essayer
                  </button>
                </span>
              </>
            )}
            {modeleEnEssai && modeles.mes && (
              <EssaiDuModele
                modele={modeleEnEssai}
                action={actionDeLEssai(modeleEnEssai.id, modeles.mes)}
                prix={prixDuModeleEssaye}
                raison={raisonDeLAchat(modeles.mes, modeleEnEssai.id, soldeConnu ?? modeles.mes.solde, prixDuModeleEssaye)}
                occupe={occupe}
                onAcheter={() => setFenetre({ kind: "modele", id: modeleEnEssai.id, prix: prixDuModeleEssaye })}
                onPorter={() => void porterLeModele(modeleEnEssai.id)}
                onFin={() => essayerLeModele(null)}
              />
            )}
          </div>
          {/* Ce qui vient de se passer, près du Gaulois, qui reste en vue : l'objet reçu se porte d'ici. La seule zone de
              la page qui annonce un achat aux lecteurs d'écran ; le solde qui reste est dit dans la fenêtre. Pendant qu'une
              pochette est ouverte, elle se tait : le tambour tourne encore, et la page, visible derrière la fenêtre, ne
              dirait pas avant lui ce qui est sorti. Elle parle quand la fenêtre se ferme. */}
          <div class="boutique-avis" data-testid="boutique-avis">
            <Success message={pochetteOuverte ? null : reussite} />
            <Problem message={probleme} />
            {acquis && !pochetteOuverte && (
              <p class="boutique-avis-suite">
                {!acquis.porte && (
                  <button type="button" class="chip chip-fort" disabled={occupe} onClick={() => void porter(acquis)} data-testid="boutique-porter">
                    {occupe ? "Enregistrement…" : "Le porter"}
                  </button>
                )}
                <a href={`${village}#gaulois`} data-testid="boutique-vers-village">
                  Voir dans Mon Gaulois
                </a>
              </p>
            )}
            {modeleRecu && !pochetteOuverte && (
              <p class="boutique-avis-suite">
                {!modeleRecu.porte && (
                  <button type="button" class="chip chip-fort" disabled={occupe} onClick={() => void porterLeModele(modeleRecu.id)} data-testid="uniques-porter-ici">
                    {occupe ? "Enregistrement…" : "Le porter"}
                  </button>
                )}
                <a href={`${village}#gaulois`} data-testid="uniques-avis-village">
                  Voir dans Mon Gaulois
                </a>
              </p>
            )}
            {familierRecu && !pochetteOuverte && (
              <p class="boutique-avis-suite">
                {!familierRecu.montre && (
                  <button type="button" class="chip chip-fort" disabled={occupe} onClick={() => void montrerLeFamilier(familierRecu.id)} data-testid="familiers-montrer-ici">
                    {occupe ? "Enregistrement…" : "Le montrer"}
                  </button>
                )}
                <a href={`${village}#gaulois`} data-testid="familiers-avis-village">
                  Voir dans Mon Gaulois
                </a>
              </p>
            )}
          </div>
        </div>
      </div>

      <div class="vestiaire-colonne">
        <h3 class="sr-only">Vos statères</h3>
        {bourse && (
          <div class="boutique-tete">
            <Bourse bourse={bourse} solde={soldeConnu} />
          </div>
        )}
        {panne && (
          <div data-testid="boutique-panne">
            <Problem message={bourse || boutique ? "Une partie de la boutique ne répond pas pour l'instant." : "La bourse et la boutique ne répondent pas pour l'instant."} onRetry={() => void lireLaBoutique()} />
          </div>
        )}

        {!pochettes && (
        <section id={ANCRE_MARCHE} class="boutique-membres sentier-carte" data-ton="bleu" aria-labelledby="boutique-membres-titre" data-testid="marche" data-etat={etatMarche.kind}>
          <div class="boutique-membres-tete sentier-carte-tete">
            {/* La même carte que celles du sentier (17 novembre 2026) : une bourse de marchand pour dessin. */}
            <span class="sentier-carte-dessin" aria-hidden="true">
              <Pixels largeur={BOURSE_DU_MARCHE.largeur} hauteur={BOURSE_DU_MARCHE.hauteur} cases={BOURSE_DU_MARCHE.cases} echelle={2} />
            </span>
            <h3 id="boutique-membres-titre">
              Le marché des membres
            </h3>
            {marcheLu && (
              <div class="boutique-membres-actions">
                <button
                  type="button"
                  class="btn btn-secondary"
                  onClick={() => {
                    setProblemeFenetre(null);
                    setFenetre({ kind: "vente" });
                  }}
                  data-testid="marche-vendre"
                >
                  Vendre un objet
                </button>
                {/* Rendre un objet au jeu contre des statères : seulement si le serveur connaît la revente. */}
                {revente && (
                  <button
                    type="button"
                    class="btn btn-ghost"
                    onClick={() => {
                      setProblemeFenetre(null);
                      setFenetre({ kind: "revente" });
                      void lireLaRevente();
                    }}
                    data-testid="revente-ouvrir"
                  >
                    Revendre au jeu
                  </button>
                )}
              </div>
            )}
          </div>
          {etatMarche.kind === "ferme" && (
            <p class="marche-mot place-mot-fort" data-testid="marche-ferme">
              {etatMarche.message}
            </p>
          )}
          {etatMarche.kind === "panne" && (
            <div data-testid="marche-panne">
              <Problem message={etatMarche.message} onRetry={() => void lireLeMarche(false)} />
            </div>
          )}
          {marcheLu && miennes.length > 0 && (
            <details class="fold boutique-mes-offres" open={mesOffresOuvertes} onToggle={(e) => setMesOffresOuvertes(e.currentTarget.open)} data-testid="marche-mes-offres">
              <summary>
                Vos offres{" "}
                <span class="info-discrete">
                  {fmtInt(miennes.length)} sur {fmtInt(marcheLu.offresMax)}
                </span>
              </summary>
              <ul class="marche-offres">
                {miennes.map((offre) => (
                  <MonOffre key={offre.id} offre={offre} maintenant={maintenant} occupe={occupe} onRetirer={() => void retirer(offre)} />
                ))}
              </ul>
            </details>
          )}
        </section>
        )}

        <div id={ID_DES_RAYONS} class="vestiaire-choix boutique-choix">
          {!pochettes && <h3 class="sr-only">Les rayons</h3>}
          {!pochettes && (
          <div ref={barre} class="vestiaire-barre">
            <BarreDesRayons
              prefixe="boutique"
              label="Les rayons de la boutique"
              rayons={rayonsMontres}
              noms={NOMS_RAYONS}
              rayon={rayonChoisi}
              vignette={(id) => (estUnRayonDObjets(id) ? vignetteDeLObjet(id, tenue[id] ?? "", tenue) : id === RAYON_UNIQUES ? IMAGE_DU_RAYON_UNIQUES : id === RAYON_CARTES ? IMAGE_DU_RAYON_CARTES : IMAGE_DU_RAYON_BANNIERE)}
              // Les offres des membres d'abord ; sinon la collection du rayon, ce qu'il possède sur ce qui existe.
              mention={(id) => (!estUnRayonDObjets(id) ? null : comptesDesOffres[id] > 0 ? motsDesOffres(comptesDesOffres[id]) : boutique ? motsDeLaCollection(collectionDuRayon(id, (objet) => quantitePossedee(boutique.inventaire, id, objet))) : null)}
              onChoisir={setRayon}
            />
          </div>
          )}
          <div ref={panneau} id="boutique-panneau" class="vestiaire-panneau" role={pochettes ? undefined : "tabpanel"} aria-labelledby={pochettes ? undefined : `boutique-rayon-${rayon}`} data-testid={`boutique-rayon-${rayon}`}>
            {rayonObjets && range && range.total > 0 && (
              <div class="vestiaire-filtre" role="group" aria-label="Montrer une rareté" data-testid="boutique-filtre">
                <ChoixDeFiltre filtre={TOUT} nom="Tout" rang={0} nombre={range.total} choisi={range.retenu === TOUT} onClick={() => setFiltres((f) => choisirFiltre(f, rayonObjets, TOUT))} />
                {ORDRE_RARETES.map((rarete) => (
                  <ChoixDeFiltre key={rarete} filtre={rarete} nom={RARETES[rarete].nom} rang={RARETES[rarete].rang} nombre={range.comptes[rarete]} choisi={range.retenu === rarete} onClick={() => setFiltres((f) => choisirFiltre(f, rayonObjets, rarete))} />
                ))}
              </div>
            )}
            {range && range.offres.length > 0 && (
              <div class="vestiaire-rayon">
                <h4 id="boutique-des-membres" class="vestiaire-boutique">
                  Vendu par des membres
                </h4>
                <ul class="marche-offres" aria-labelledby={`boutique-rayon-${rayon} boutique-des-membres`} data-testid="marche-offres">
                  {range.offres.map((offre) => (
                    <Offre
                      key={offre.id}
                      offre={offre}
                      maintenant={maintenant}
                      essayee={essai?.source === "marche" && essai.offre === offre.id}
                      occupe={occupe}
                      onEssai={() => essayer(essai?.source === "marche" && essai.offre === offre.id ? null : { source: "marche", offre: offre.id, emplacement: offre.emplacement, objet: offre.objet })}
                      onAcheter={() => {
                        setProblemeFenetre(null);
                        setFenetre({ kind: "offre", offre });
                      }}
                    />
                  ))}
                </ul>
              </div>
            )}
            {rayonObjets && range && range.boutique.length > 0 && (
              <div class="vestiaire-rayon">
                <h4 id="boutique-du-clan" class="vestiaire-boutique">
                  Boutique du clan
                </h4>
                <div class="cases" role="group" aria-labelledby={`boutique-rayon-${rayon} boutique-du-clan`} data-testid="boutique-cases">
                  {range.boutique.map(([id, objet]) => {
                    const essayee = essai?.source === "boutique" && essai.emplacement === rayonObjets && essai.objet === id;
                    return (
                      <Case
                        key={id}
                        objet={objet}
                        vignette={vignetteDeLObjet(rayonObjets, id, tenue)}
                        portee={false}
                        essayee={essayee}
                        vente={{ prix: prixDeLObjet(boutique?.prix, rayonObjets, id) }}
                        enVente={miennes.some((offre) => offre.emplacement === rayonObjets && offre.objet === id)}
                        onClick={() => essayer(essayee ? null : { source: "boutique", emplacement: rayonObjets, objet: id })}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {/* Les pochettes : l'étal, puis la carte de celle qui y est choisie ; celles des bannières et des Gaulois
                uniques viennent de leurs sections, juste dessous. Une fonction en panne n'emporte pas les autres pochettes. */}
            {rayon === RAYON_POCHETTES && (
              <>
                {gagneesEnMots.length > 0 && (
                  <p class="pochettes-gagnees" data-testid="pochettes-gagnees">
                    Gagnées à la loterie, à ouvrir sans rien payer : {gagneesEnMots.join(", ")}.
                  </p>
                )}
                {/* L'étal (17 novembre 2026, choix du pilote sur exemples : « une à la fois ») : les cinq pochettes devant sa
                    bannière ; celle qui est choisie montre sa carte dessous, seule. */}
                <EtalDesPochettes
                  choisie={pochetteSurLEtal}
                  decor={decor}
                  gagnees={gagnees}
                  prix={{
                    surprise: boutique?.pochette.prix ?? null,
                    stateres: pochetteStateres.ma?.prix ?? null,
                    familiers: familiers.mes?.pochette.prix ?? null,
                    bannieres: prixDesBannieres,
                    modeles: modeles.etat.kind === "pret" ? modeles.etat.mes.pochette.prix : null,
                  }}
                  dessins={{
                    surprise: <DessinPochette echelle={4} />,
                    stateres: <DessinPochetteStateres echelle={4} />,
                    familiers: <DessinPochetteFamiliers echelle={4} />,
                    bannieres: <DessinPochetteBannieres echelle={4} />,
                    modeles: <DessinDeLaPochette possedes={new Set(modeles.etat.kind === "pret" ? modeles.etat.mes.modeles.map((ligne) => ligne.modele) : [])} />,
                  }}
                  onChoisir={setPochetteChoisie}
                />
                {((pochetteSurLEtal === "surprise" && boutique) || (pochetteSurLEtal === "stateres" && pochetteStateres.ma)) && (
                  <div class="pochettes-tiers" data-seule="" data-testid="pochettes-tiers">
                    {pochetteSurLEtal === "surprise" && boutique && <Pochette boutique={boutique} solde={avecBon("surprise", soldeConnu ?? boutique.solde, boutique.pochette.prix)} fermee={fermee} onOuvrir={() => setFenetre({ kind: "pochette" })} />}
                    {pochetteSurLEtal === "stateres" && pochetteStateres.ma && (
                      <PochetteStateres ma={pochetteStateres.ma} solde={avecBon("stateres", soldeConnu ?? pochetteStateres.ma.solde, pochetteStateres.ma.prix)} onOuvrir={() => setFenetre({ kind: "stateres" })} />
                    )}
                  </div>
                )}
                {pochetteSurLEtal === "familiers" && familiers.mes && <PochetteFamiliers mes={familiers.mes} solde={avecBon("familiers", soldeConnu ?? familiers.mes.solde, familiers.mes.pochette.prix)} onOuvrir={() => setFenetre({ kind: "familiers" })} />}
                {pochetteSurLEtal === "stateres" && pochetteStateres.etat.kind === "panne" && (
                  <div data-testid="pochette-stateres-panne">
                    <Problem message="La pochette de statères ne répond pas pour l'instant." onRetry={() => void pochetteStateres.lire()} />
                  </div>
                )}
                {pochetteSurLEtal === "familiers" && familiers.etat.kind === "panne" && (
                  <div data-testid="familiers-panne">
                    <Problem message="La pochette des familiers ne répond pas pour l'instant." onRetry={() => void familiers.lire()} />
                  </div>
                )}
              </>
            )}
            {/* Les bannières de /gaulois : derrière la tenue enregistrée, jamais derrière un essayage. Après un achat, la
                bourse de la page prend le solde que le serveur a répondu ; après un refus, elle se relit. Lues à la
                première ouverture de leur onglet ou de celui des pochettes, puis seulement cachées quand un autre rayon
                s'ouvre. Une seule section pour les deux onglets : dans « Pochettes », elle ne montre que sa pochette. */}
            {(bannieresOuvertes || rayon === RAYON_BANNIERE || rayon === RAYON_POCHETTES) && (
              <div hidden={rayon !== RAYON_BANNIERE && !(rayon === RAYON_POCHETTES && pochetteSurLEtal === "bannieres")}>
                <SectionDesBannieres
                  onPrixDeLaPochette={setPrixDesBannieres}
                  partie={partieDesBannieres.current}
                  tenue={etat.enregistree}
                  familier={familiers.montre}
                  solde={soldeConnu}
                  pochetteGagnee={Boolean(gagnees.bannieres)}
                  onSolde={(reste) => {
                    setBoutique((b) => b && { ...b, solde: reste });
                    setSolde(reste);
                    // Une pochette des bannières vient peut-être de s'ouvrir avec un bon de la loterie.
                    if (pochettes) relireLesGagnees();
                  }}
                  onRefus={() => void lireLaBoutique()}
                />
              </div>
            )}
            {/* Les cartes : les finitions de la carte du podium, essayées sur le Gaulois enregistré. Après un achat, la bourse
                de la page prend le solde que le serveur a répondu ; après un refus, elle se relit. */}
            {(cartesOuvertes || rayon === RAYON_CARTES) && (
              <div hidden={rayon !== RAYON_CARTES}>
                <SectionDesCartes
                  tenue={etat.enregistree}
                  onSolde={(reste) => {
                    setBoutique((b) => b && { ...b, solde: reste });
                    setSolde(reste);
                  }}
                  onRefus={() => void lireLaBoutique()}
                />
              </div>
            )}
            {/* Les Gaulois uniques : leur pochette et les onze modèles, qui s'essaient sur le Gaulois de la page. Lus à la
                première ouverture de leur onglet ou de celui des pochettes, puis seulement cachés quand un autre rayon
                s'ouvre. Dans « Pochettes », la section ne montre que leur pochette. */}
            {(uniquesOuverts || rayon === RAYON_UNIQUES || rayon === RAYON_POCHETTES) && (
              <div hidden={rayon !== RAYON_UNIQUES && !(rayon === RAYON_POCHETTES && pochetteSurLEtal === "modeles")}>
                <SectionDesModeles
                  partie={partieDesUniques.current}
                  etat={modeles.etat}
                  solde={soldeConnu}
                  pochetteGagnee={Boolean(gagnees.modeles)}
                  essaye={modeleEnEssai?.id ?? null}
                  occupe={occupe}
                  onEssayer={essayerLeModele}
                  onOuvrir={() => setFenetre({ kind: "modeles" })}
                  onHumain={() => void porterLeModele(null)}
                  onRelire={() => void modeles.lire()}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {fenetre?.kind === "achat" && achat && boutique && (
        <DialogueAchat
          objet={achat.fiche}
          rarete={achat.fiche.rarete}
          vignette={vignetteDeLObjet(achat.emplacement, achat.objet, tenue)}
          prix={fenetre.prix}
          solde={soldeConnu ?? boutique.solde}
          acheter={() => acheter(achat.emplacement, achat.objet, fenetre.prix)}
          onPorter={() => void porter({ emplacement: achat.emplacement, objet: achat.objet })}
          onFermer={fermerLaFenetre}
        />
      )}
      {/* Chaque fenêtre d'ouverture sait si sa pochette a été gagnée à la loterie : elle ne promet alors ni prix ni reste. */}
      {fenetre?.kind === "pochette" && boutique && (
        <PochetteGagneeIci.Provider value={Boolean(gagnees.surprise)}>
          <DialoguePochette
            prix={boutique.pochette.prix}
            chances={boutique.pochette.chances}
            solde={soldeConnu ?? boutique.solde}
            ouvrir={() => puisRelire(ouvrirPochette(boutique.pochette.prix))}
            objetDe={(tire) => OBJETS[tire.emplacement][tire.objet]}
            vignetteDe={(tire) => vignetteDeLObjet(tire.emplacement, tire.objet, tenue)}
            dejaPorte={(tire) => tenue[tire.emplacement] === tire.objet}
            onPorter={(tire) => void porter({ emplacement: tire.emplacement, objet: tire.objet })}
            onFermer={fermerLaFenetre}
          />
        </PochetteGagneeIci.Provider>
      )}
      {fenetre?.kind === "familiers" && familiers.mes && (
        <PochetteGagneeIci.Provider value={Boolean(gagnees.familiers)}>
          <DialogueFamiliers
            prix={familiers.mes.pochette.prix}
            chances={familiers.mes.pochette.chances}
            possedes={idsPossedes(familiers.mes)}
            solde={soldeConnu ?? familiers.mes.solde}
            village={village}
            ouvrir={() => puisRelire(ouvrirPochetteFamiliers(familiers.mes?.pochette.prix ?? 0))}
            dejaMontre={(id) => familiers.mes?.porte === id}
            onMontrer={(id) => void montrerLeFamilier(id)}
            onFermer={fermerLaFenetre}
          />
        </PochetteGagneeIci.Provider>
      )}
      {fenetre?.kind === "stateres" && pochetteStateres.ma && (
        <PochetteGagneeIci.Provider value={Boolean(gagnees.stateres)}>
          <DialogueStateres ma={pochetteStateres.ma} solde={soldeConnu ?? pochetteStateres.ma.solde} ouvrir={() => puisRelire(ouvrirPochetteStateres(pochetteStateres.ma?.prix ?? 0))} onFermer={fermerLaFenetre} />
        </PochetteGagneeIci.Provider>
      )}
      {fenetre?.kind === "modeles" && modeles.mes && (
        <PochetteGagneeIci.Provider value={Boolean(gagnees.modeles)}>
          <DialogueModeles mes={modeles.mes} solde={soldeConnu ?? modeles.mes.solde} tenue={tenue} ouvrir={(prixVu) => puisRelire(ouvrirPochetteModeles(prixVu))} onPorter={(id) => void porterLeModele(id)} onFermer={fermerLaFenetre} />
        </PochetteGagneeIci.Provider>
      )}
      {fenetre?.kind === "modele" && modeleAAcheter && modeles.mes && (
        <DialogueAchatModele
          modele={modeleAAcheter}
          prix={fenetre.prix}
          solde={soldeConnu ?? modeles.mes.solde}
          tenue={tenue}
          acheter={() => acheterLeModele(modeleAAcheter.id, fenetre.prix)}
          onPorter={() => void porterLeModele(modeleAAcheter.id)}
          onFermer={fermerLaFenetre}
        />
      )}
      {fenetre?.kind === "offre" && marcheLu && (
        <DialogueOffre
          offre={fenetre.offre}
          solde={soldeConnu ?? marcheLu.solde}
          boutique={pourLeMarche}
          miennes={miennes}
          occupe={occupe}
          probleme={problemeFenetre}
          onAcheter={() => void acheterOffre(fenetre.offre)}
          onFermer={fermerLaFenetre}
        />
      )}
      {fenetre?.kind === "revente" && revente && <DialogueRevente revente={revente} occupe={occupe} probleme={problemeFenetre} onRevendre={(objet, nom) => void revendre(objet, nom)} onFermer={fermerLaFenetre} />}
      {fenetre?.kind === "vente" && marcheLu && (
        <DialogueVente boutique={pourLeMarche} offresOuvertes={miennes.length} offresMax={marcheLu.offresMax} occupe={occupe} probleme={problemeFenetre} onVendre={(objet, prix) => void vendre(objet, prix)} onFermer={fermerLaFenetre} />
      )}
    </div>
  );
}
