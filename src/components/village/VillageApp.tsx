import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call as appeler } from "../../lib/compte/api";
import { useArrivee } from "../compte/arrivee";
import { DemandeLienOpenFront } from "../compte/LienOpenFront";
import { Partie, useTabs } from "../compte/Onglets";
import { Loading, useMe } from "../compte/common";
import Vestiaire from "../compte/Vestiaire";
import MaCarte, { useCarteDuJoueur } from "../jeu/MaCarte";
import { MenuDuJeu, type OngletDuJeu } from "../jeu/MenuDuJeu";
import { RessourcesDuJeu } from "../jeu/RessourcesDuJeu";
import { ANCRE_MARCHE, RAYON_POCHETTES } from "../../lib/village/boutique-rayons";
import { ANCRE_BANNIERES } from "../../lib/village/ecran-bannieres";
import { ANCRE_FAMILIERS } from "../../lib/village/ecran-familiers";
import { ANCRE_LOTERIE, joursAvantLeTirage, lirePochettesGagnees, motsAvantLeTirage } from "../../lib/village/loterie";
import { ANCRE_MODELES } from "../../lib/village/modeles";
import { ANCRE_SENTIER } from "../../lib/village/sentier";
import Boutique from "./Boutique";
import LoterieDuMardi from "./Loterie";
import AtelierDeLaForge from "./Forge";
import VestiaireDuJeu from "./VestiaireDuJeu";
import LeSentier, { objetsQuiAttendent, useSentier } from "./Sentier";
import VitrineDuJeu from "./VitrineDuJeu";
import { ANCRE_DUEL, useAccesAuDuel } from "./duel/acces";
import { ANCRE_CASINO, casinoDejaVu, noterCasinoVu, useCasinoDuServeur } from "./casino/acces";
import { iconeDuDuel } from "./duel/dessins-ecran";
import { urlDeLaPlanche } from "../../lib/jeu/dans-la-page";

/** « Ma carte », la première partie du jeu depuis le 21 novembre 2026 : `/village` s'ouvre sur elle. */
export const ANCRE_MA_CARTE = "ma-carte";

/**
 * Les parties du jeu, dans l'ordre du menu : « Ma carte » (21 novembre 2026, l'écran d'accueil du jeu), « Le duel » (22
 * novembre 2026, le duel de cartes, visible du seul pilote tant que le serveur le dit fermé), puis les sept
 * d'avant, chacune avec son icône dessinée et le mot de son bouton. Leurs adresses ne changent pas (`#gaulois`, `#sentier`,
 * `#forge`, `#boutique`, `#pochettes`, `#vitrine`, `#loterie`), ni leurs noms internes : seuls leurs noms à l'écran changent,
 * à la demande du pilote (fiche de projet « Mon Gaulois », 20-21 novembre 2026) : « Les pochettes » devient « Les boosters »,
 * « Le sentier » devient « Le pass ».
 *
 * Avant : « Le sentier » (`#sentier`, 16 novembre 2026, « un peu comme un passe de combat ») vient juste après « Le
 * vestiaire » (« Mon Gaulois » jusqu'au 18 novembre 2026) ; son onglet dit combien d'objets des paliers attendent d'être
 * pris. « La boutique » (la bourse, la pochette surprise, les rayons et le marché des membres) a eu sa page, `/boutique`,
 * le 15 novembre 2026 ; le même jour, le pilote l'a voulue ici (« déplace la boutique »). `/boutique` renvoie à `#boutique` ;
 * `#marche` (l'adresse de l'ancien onglet du marché), `#bannieres` et `#gaulois-uniques` (les liens du vestiaire vers les
 * bannières et les Gaulois uniques) ouvrent la boutique, qui y descend alors. Les adresses du monde du village, retiré le 15
 * novembre 2026 (`#place`, `#chantier`, `#feu`, `#qui`, `#interieur-…`), ne nomment plus de partie : elles ouvrent « Ma
 * carte ». « La vitrine » (`#vitrine`, 16 novembre 2026) montre tous les Gaulois du clan. « Les pochettes » (`#pochettes`,
 * le soir du 16 novembre 2026) ont quitté les rayons de la boutique pour leur partie ; `#familiers` l'ouvre et descend à la
 * pochette des familiers. « La loterie » (`#loterie`, 16 novembre 2026) : le tirage du mardi à 21 h 30.
 */
const ONGLETS: OngletDuJeu[] = [
  { id: ANCRE_MA_CARTE, label: "Ma carte", mot: "Ma carte", dessin: "ma-carte" },
  // « Le duel » (22 novembre 2026), le duel de cartes « Coup pour coup » : son icône est dessinée avec ses écrans. Il ne
  // paraît qu'au pilote tant que le serveur le dit fermé (`useAccesAuDuel`).
  { id: ANCRE_DUEL, label: "Le duel", mot: "Duel" },
  { id: "gaulois", label: "Le vestiaire", mot: "Vestiaire", dessin: "vestiaire" },
  { id: ANCRE_SENTIER, label: "Le pass", mot: "Pass", dessin: "sentier" },
  { id: "forge", label: "La forge", mot: "Forge", dessin: "forge" },
  { id: "boutique", label: "La boutique", mot: "Boutique", dessin: "boutique" },
  { id: RAYON_POCHETTES, label: "Les boosters", mot: "Boosters", dessin: "pochettes" },
  { id: "vitrine", label: "La vitrine", mot: "Vitrine", dessin: "vitrine" },
  { id: ANCRE_LOTERIE, label: "La loterie", mot: "Loterie", dessin: "loterie" },
  // « Le casino » (22 novembre 2026, direction « Le Palais d'or » validée par le pilote) : six jeux en statères, ouvert à tous
  // les membres validés. Son icône est dans `/village/kit.css` (`casino-pieces.ts`). Il ne paraît que si le serveur répond à
  // `get_casino` (`useCasinoDuServeur`).
  { id: ANCRE_CASINO, label: "Le casino", mot: "Casino", image: "var(--jeu-ic-casino)" },
];
const IDS = ONGLETS.map((onglet) => onglet.id);
const ALIAS: Readonly<Record<string, string>> = { [ANCRE_MARCHE]: "boutique", [ANCRE_FAMILIERS]: RAYON_POCHETTES, [ANCRE_BANNIERES]: "boutique", [ANCRE_MODELES]: "boutique" };
const PREFIXE = "village";

/** Un écran du jeu : un cadre en cases autour des parties d'avant, qui gardent leurs couleurs et toutes leurs fonctions. */
function Ecran({ children }: { children: ComponentChildren }) {
  return <div class="jeu-ecran jeu-n9">{children}</div>;
}

/**
 * Le jeu « Mon Gaulois » (`/village`), en plein écran depuis le 21 novembre 2026 (cadre de jeu de Base.astro, kit en pixels
 * de `src/lib/jeu/`, maquette validée par le pilote). Le monde du village en pixels est retiré depuis le 15 novembre 2026
 * (« enlève la partie villages ») : il garde le Gaulois et ses objets, qui paraissent sur les images du clan.
 *
 * Un visiteur voit le Gaulois de départ et la porte. Un compte connecté finit d'abord son inscription
 * (src/lib/compte/arrivee.ts, 15 novembre 2026) : le lien de son profil OpenFront, puis son Gaulois, seul au vestiaire ; le
 * reste attend qu'il soit créé. Ensuite, le menu du jeu (MenuDuJeu.tsx) et ses parties : « Ma carte », « Le duel », le
 * vestiaire, le pass, la forge, la boutique, les boosters, la vitrine, la loterie et « Le casino » (22 novembre 2026, dès que
 * le serveur répond à `get_casino`). Chaque partie ne lit le serveur qu'à son
 * ouverture ; la forge et la boutique se relisent à chaque retour, et le vestiaire aussi : un objet acheté y paraît
 * aussitôt. Le palier du pass et la bourse sont dans la barre du jeu (RessourcesDuJeu.tsx).
 */
export default function VillageApp() {
  const { me, refresh } = useMe();
  const { etape } = useArrivee(me);
  const { active, slide, select } = useTabs(IDS, ALIAS);
  // Le pass se lit dès que la page s'ouvre à un compte qui a son Gaulois : la visite du jour est cochée, et la barre dit
  // son palier. Il se relit à chaque retour sur sa partie.
  const sentier = useSentier();
  const lireLeSentier = sentier.lire;
  const gauloisCree = me !== null && me.signed_in && etape !== undefined && etape !== "lien" && etape !== "gaulois";
  const surLeSentier = active === ANCRE_SENTIER;
  useEffect(() => {
    if (gauloisCree) void lireLeSentier();
  }, [gauloisCree, surLeSentier, lireLeSentier]);

  // Le Gaulois vient d'être créé, seul au vestiaire : le membre y reste, au lieu de partir sur « Ma carte », la première
  // partie du menu qui paraît alors.
  const etapeAvant = useRef(etape);
  useEffect(() => {
    if (etapeAvant.current === "gaulois" && etape !== undefined && etape !== "gaulois") select("gaulois");
    etapeAvant.current = etape;
  }, [etape, select]);

  // La carte du joueur : lue à l'ouverture de « Ma carte », et relue à chaque retour (un achat a pu la changer).
  const surMaCarte = active === ANCRE_MA_CARTE;
  const [retours, setRetours] = useState(0);
  useEffect(() => {
    if (surMaCarte) setRetours((n) => n + 1);
  }, [surMaCarte]);
  const carte = useCarteDuJoueur(gauloisCree, retours);

  // « Le duel » : visible si le serveur le dit ouvert, ou au pilote seul tant qu'il est fermé. Une adresse `#duel` qu'on
  // n'a pas le droit d'ouvrir ramène à « Ma carte », sans rien dire du duel.
  const surLeDuel = active === ANCRE_DUEL;
  const acces = useAccesAuDuel(gauloisCree);
  const duelVisible = acces.kind === "ouvert";
  // L'écran du duel (sa scène, le moteur) ne se charge qu'à l'ouverture de sa partie : les autres membres ne le reçoivent pas.
  const [LeDuel, setLeDuel] = useState<typeof import("./duel/LeDuel").default | null>(null);
  useEffect(() => {
    if (!surLeDuel || !duelVisible || LeDuel) return;
    void import("./duel/LeDuel").then(
      (mod) => setLeDuel(() => mod.default),
      () => undefined,
    );
  }, [surLeDuel, duelVisible, LeDuel]);
  useEffect(() => {
    if (surLeDuel && acces.kind === "ferme") select(ANCRE_MA_CARTE);
  }, [surLeDuel, acces.kind, select]);

  // « Le casino » : visible dès que le serveur répond. Son écran (le hall, les jeux, leurs peintures) ne se charge qu'à
  // l'ouverture de sa partie ; le hall relit le serveur à chaque retour d'un jeu. Une adresse `#casino` sans casino ramène
  // à « Ma carte ».
  const surLeCasino = active === ANCRE_CASINO;
  const casinoServeur = useCasinoDuServeur(gauloisCree);
  const casinoVisible = !!casinoServeur.etat;
  const [LeCasino, setLeCasino] = useState<typeof import("./casino/LeCasino").default | null>(null);
  useEffect(() => {
    if (!surLeCasino || !casinoVisible || LeCasino) return;
    void import("./casino/LeCasino").then(
      (mod) => setLeCasino(() => mod.default),
      () => undefined,
    );
  }, [surLeCasino, casinoVisible, LeCasino]);
  useEffect(() => {
    if (surLeCasino && casinoServeur.etat === null) select(ANCRE_MA_CARTE);
  }, [surLeCasino, casinoServeur.etat, select]);
  // « Nouveau » sur son onglet, tant que le casino n'a pas été ouvert sur cet appareil.
  const [casinoNouveau, setCasinoNouveau] = useState(false);
  useEffect(() => setCasinoNouveau(!casinoDejaVu()), []);
  useEffect(() => {
    if (surLeCasino && casinoVisible) {
      noterCasinoVu();
      setCasinoNouveau(false);
    }
  }, [surLeCasino, casinoVisible]);

  // Les boosters gagnés à la loterie qui restent à ouvrir : leur nombre, sur le bouton « Boosters ». Relu quand on quitte
  // cette partie, où ils s'ouvrent ; tant qu'elle est ouverte, l'étiquette ne paraît pas (son nombre y change à chaque
  // ouverture, et la partie le dit elle-même). De l'habillage : une panne n'écrit rien.
  const [aOuvrir, setAOuvrir] = useState(0);
  const surLesPochettes = active === RAYON_POCHETTES;
  useEffect(() => {
    if (!gauloisCree || surLesPochettes) return;
    void appeler<unknown>("get_pochettes_gagnees")
      .then(lirePochettesGagnees, () => null)
      .then((bons) => {
        if (bons) setAOuvrir(Object.values(bons).reduce((somme: number, n) => somme + (n ?? 0), 0));
      });
  }, [gauloisCree, surLesPochettes]);

  // Ce que la page écrit pour les visiteurs (src/pages/village.astro) : la vitrine écrite au build (revue du 18 novembre
  // 2026), les Gaulois déjà créés, et la démonstration du jeu (21 novembre 2026), le booster d'essai et « Rejoins le clan
  // pour jouer ». Pour qui n'est pas connecté seulement : un membre connecté a sa vitrine, dans « La vitrine ».
  useEffect(() => {
    for (const bloc of document.querySelectorAll<HTMLElement>("[data-vitrine-publique], [data-demo-visiteur]")) bloc.hidden = me === null || me.signed_in;
  }, [me]);

  if (me === null) return <Loading label="Lecture de votre compte…" />;

  if (!me.signed_in) {
    return (
      <Ecran>
        <section aria-labelledby="vestiaire-titre" data-testid="village">
          <h2 id="vestiaire-titre" class="section-title-sm">
            Votre Gaulois
          </h2>
          <div class="mt-8">
            <Vestiaire />
          </div>
        </section>
      </Ecran>
    );
  }

  if (etape === undefined) return <Loading label="Lecture de votre compte…" />;
  if (etape === "lien") {
    return (
      <Ecran>
        <div data-testid="village-lien">
          <DemandeLienOpenFront me={me} onSent={refresh} />
        </div>
      </Ecran>
    );
  }

  // Le Gaulois à créer : le vestiaire seul, sous son titre, qui nomme aussi sa partie (`village-onglet-gaulois`, l'onglet
  // qu'il remplace). Il reste à la même place une fois le Gaulois créé : le menu paraît sans qu'il se relise.
  const aCreer = etape === "gaulois";
  const attendent = objetsQuiAttendent(sentier);
  // La partie du pass ne paraît qu'une fois le pass lu : tant que le serveur ne l'a pas (migration pas encore collée), le
  // menu reste celui d'avant. Une adresse `#sentier` l'ouvre quand même, et dit alors que le pass ne répond pas.
  const sentierVisible = sentier.etat.kind === "pret" || active === ANCRE_SENTIER;
  // Le tirage du mardi : les jours qui restent, en mots. Le serveur seul tire ; ceci ne fait que compter jusqu'à mardi.
  const avantLeTirage = motsAvantLeTirage(joursAvantLeTirage(new Date()));
  const onglets = ONGLETS.filter((onglet) => (onglet.id !== ANCRE_SENTIER || sentierVisible) && (onglet.id !== ANCRE_DUEL || duelVisible) && (onglet.id !== ANCRE_CASINO || casinoVisible)).map((onglet): OngletDuJeu => {
    if (onglet.id === ANCRE_CASINO && casinoNouveau) return { ...onglet, count: { value: 1, text: "Nouveau", words: "nouveau", tone: "vif" } };
    if (onglet.id === ANCRE_DUEL) return { ...onglet, image: urlDeLaPlanche("duel-menu", iconeDuDuel) };
    if (onglet.id === ANCRE_SENTIER && attendent > 0) return { ...onglet, count: { value: attendent, words: `${attendent} ${attendent > 1 ? "objets" : "objet"} à prendre`, tone: "vif" } };
    if (onglet.id === RAYON_POCHETTES && aOuvrir > 0 && !surLesPochettes) return { ...onglet, count: { value: aOuvrir, words: `${aOuvrir} ${aOuvrir > 1 ? "boosters gagnés" : "booster gagné"} à ouvrir`, tone: "vif" } };
    if (onglet.id === ANCRE_LOTERIE) return { ...onglet, count: { value: 1, text: avantLeTirage, words: `tirage ${avantLeTirage === "ce soir" || avantLeTirage === "demain" ? avantLeTirage : `dans ${avantLeTirage}`}` } };
    return onglet;
  });
  return (
    <div class={`village jeu-ecrans ${aCreer ? "jeu-sans-menu" : ""}`} data-testid="village">
      {!aCreer && <MenuDuJeu prefix={PREFIXE} onglets={onglets} active={active} onSelect={select} />}
      {!aCreer && <RessourcesDuJeu sentier={sentier.etat.kind === "pret" ? sentier.etat.sentier : null} versLePass={() => select(ANCRE_SENTIER)} />}
      <div class="jeu-parties">
        {aCreer && (
          <Ecran>
            <div data-testid="village-gaulois">
              <h2 id={`${PREFIXE}-onglet-gaulois`} class="section-title-sm">
                Votre Gaulois
              </h2>
              {/* Un compte en attente n'ouvre la forge, la boutique et le QG qu'une fois validé : le texte ne lui promet rien de plus. */}
              <p class="mt-3 text-muted">
                {me.status === "validated" ? "La forge, la boutique, le QG et la carte de l'alliance s'ouvrent dès qu'il est créé." : "Dernière étape de l'inscription : ensuite, un officier valide votre compte."}
              </p>
            </div>
          </Ecran>
        )}
        {!aCreer && (
          <Partie prefix={PREFIXE} id={ANCRE_MA_CARTE} active={active} slide={slide}>
            <h2 class="sr-only">Ma carte</h2>
            {surMaCarte && (
              <MaCarte
                carte={carte}
                pseudo={me.openfront_username}
                nom={me.openfront_username ?? me.name ?? null}
                insignesDeSaison={sentier.etat.kind === "pret" ? (sentier.etat.sentier.insignes ?? []) : []}
                versLeVestiaire={() => select("gaulois")}
              />
            )}
          </Partie>
        )}
        {!aCreer && acces.kind === "ouvert" && (
          <Partie prefix={PREFIXE} id={ANCRE_DUEL} active={active} slide={slide}>
            <h2 class="sr-only">Le duel</h2>
            {surLeDuel && (LeDuel ? <LeDuel serveur={acces.serveur} /> : <Loading label="Préparation du duel…" />)}
          </Partie>
        )}
        <Partie prefix={PREFIXE} id="gaulois" active={aCreer ? "gaulois" : active} slide={aCreer ? null : slide}>
          {/* Le titre caché de la partie, sauf quand « Votre Gaulois », juste au-dessus, la nomme déjà. */}
          {!aCreer && <h2 class="sr-only">Le vestiaire</h2>}
          {/* Le vestiaire du jeu (21 novembre 2026) : le Gaulois et ses cartes posés sur le fond du jeu, comme « Ma carte ». */}
          <VestiaireDuJeu actif={aCreer || active === "gaulois"} />
        </Partie>
        {!aCreer && (
          <Partie prefix={PREFIXE} id={ANCRE_SENTIER} active={active} slide={slide}>
            <h2 class="sr-only">Le pass</h2>
            {/* Le pass et la forge sont habillés en écran de jeu (21 novembre 2026) : leurs propres panneaux, sans le cadre des parties d'avant. */}
            {active === ANCRE_SENTIER && <LeSentier sentier={sentier} />}
          </Partie>
        )}
        {!aCreer && (
          <Partie prefix={PREFIXE} id="forge" active={active} slide={slide}>
            <h2 class="sr-only">La forge</h2>
            {active === "forge" && <AtelierDeLaForge />}
          </Partie>
        )}
        {!aCreer && (
          <Partie prefix={PREFIXE} id="boutique" active={active} slide={slide}>
            <h2 class="sr-only">La boutique</h2>
            {/* La boutique est habillée en écran de jeu (21 novembre 2026) : ses propres panneaux, sans le cadre des parties d'avant. */}
            {active === "boutique" && <Boutique />}
          </Partie>
        )}
        {!aCreer && (
          <Partie prefix={PREFIXE} id={RAYON_POCHETTES} active={active} slide={slide}>
            <h2 class="sr-only">Les boosters</h2>
            {active === RAYON_POCHETTES && (
              <Ecran>
                <Boutique pochettes />
              </Ecran>
            )}
          </Partie>
        )}
        {!aCreer && (
          <Partie prefix={PREFIXE} id="vitrine" active={active} slide={slide}>
            <h2 class="sr-only">La vitrine</h2>
            {/* La vitrine et la loterie sont habillées en écran de jeu (21 novembre 2026) : leurs propres panneaux. */}
            <VitrineDuJeu actif={active === "vitrine"} />
          </Partie>
        )}
        {!aCreer && (
          <Partie prefix={PREFIXE} id={ANCRE_LOTERIE} active={active} slide={slide}>
            <h2 class="sr-only">La loterie</h2>
            <LoterieDuMardi actif={active === ANCRE_LOTERIE} />
          </Partie>
        )}
        {!aCreer && casinoServeur.etat && (
          <Partie prefix={PREFIXE} id={ANCRE_CASINO} active={active} slide={slide}>
            <h2 class="sr-only">Le casino</h2>
            {surLeCasino && (LeCasino ? <LeCasino etatDuServeur={casinoServeur.etat} relire={casinoServeur.relire} /> : <Loading label="Ouverture du casino…" />)}
          </Partie>
        )}
      </div>
    </div>
  );
}
