import { useEffect } from "preact/hooks";
import { useArrivee } from "../compte/arrivee";
import { DemandeLienOpenFront } from "../compte/LienOpenFront";
import { Onglets, Partie, useTabs, type TabItem } from "../compte/Onglets";
import { Loading, useMe } from "../compte/common";
import Vestiaire from "../compte/Vestiaire";
import { ANCRE_MARCHE, RAYON_POCHETTES } from "../../lib/village/boutique-rayons";
import { ANCRE_BANNIERES } from "../../lib/village/ecran-bannieres";
import { ANCRE_FAMILIERS } from "../../lib/village/ecran-familiers";
import { ANCRE_LOTERIE } from "../../lib/village/loterie";
import { ANCRE_MODELES } from "../../lib/village/modeles";
import { ANCRE_SENTIER } from "../../lib/village/sentier";
import Boutique from "./Boutique";
import LoterieDuLundi from "./Loterie";
import AtelierDeLaForge from "./Forge";
import LeSentier, { objetsQuiAttendent, useSentier } from "./Sentier";
import VitrineDuClan from "./Vitrine";

/**
 * Les sept parties de la page, dans l'ordre de la barre. « Le sentier » (`#sentier`, 16 novembre 2026, demande du pilote :
 * « un peu comme un passe de combat ») vient juste après « Mon Gaulois » : c'est ce qui change chaque jour ; son onglet dit
 * combien d'objets des paliers attendent d'être pris. L'onglet ouvert se retient dans l'adresse (`#forge`,
 * `#boutique`). « La boutique » (la bourse, la pochette surprise, les rayons et le marché des membres) a eu sa page,
 * `/boutique`, le 15 novembre 2026 ; le même jour, le pilote l'a voulue ici, en onglet à côté de la forge (« déplace la
 * boutique »). `/boutique` renvoie à `#boutique` ; `#marche` (l'adresse de l'ancien onglet du marché), `#bannieres` et `#gaulois-uniques` (les liens du
 * vestiaire vers les bannières et les Gaulois uniques) ouvrent la boutique, qui y descend alors. Les adresses du monde du village, retiré le 15 novembre 2026 (`#place`, `#chantier`,
 * `#feu`, `#qui`, `#interieur-…`), ne nomment plus d'onglet : elles ouvrent « Mon Gaulois ». « La vitrine » (`#vitrine`, 16
 * novembre 2026, demande du pilote) montre tous les Gaulois du clan, chacun sur sa carte. « Les pochettes » (`#pochettes`,
 * le soir du 16 novembre 2026) ont quitté les rayons de la boutique pour leur partie, juste avant la vitrine ;
 * `#familiers` l'ouvre et descend à la pochette des familiers. « La loterie » (`#loterie`, 16 novembre 2026, demande du
 * pilote) vient à la suite : le tirage du lundi à 21 h 30 et la jauge des parts.
 */
const ONGLETS: TabItem[] = [
  { id: "gaulois", label: "Mon Gaulois" },
  { id: ANCRE_SENTIER, label: "Le sentier" },
  { id: "forge", label: "La forge" },
  { id: "boutique", label: "La boutique" },
  { id: RAYON_POCHETTES, label: "Les pochettes" },
  { id: "vitrine", label: "La vitrine" },
  { id: ANCRE_LOTERIE, label: "La loterie" },
];
const IDS = ONGLETS.map((onglet) => onglet.id);
const ALIAS: Readonly<Record<string, string>> = { [ANCRE_MARCHE]: "boutique", [ANCRE_FAMILIERS]: RAYON_POCHETTES, [ANCRE_BANNIERES]: "boutique", [ANCRE_MODELES]: "boutique" };
const PREFIXE = "village";

/**
 * La page de son Gaulois (`/village`). Le monde du village en pixels est retiré depuis le 15 novembre 2026, à la demande
 * du pilote (« enlève la partie villages ») : il garde le Gaulois et ses objets, qui paraissent sur les images du clan.
 * Un visiteur voit le Gaulois de départ et la porte. Un compte connecté finit d'abord son inscription
 * (src/lib/compte/arrivee.ts, 15 novembre 2026) : le lien de son profil OpenFront, puis son Gaulois, seul au vestiaire ;
 * la forge et la boutique attendent qu'il soit créé. Ensuite, sept onglets, comme au QG : son Gaulois (le vestiaire : ce
 * qui est à lui), le sentier de la saison, la forge, où l'on grave une de ses parties sur un objet, la boutique, où l'on
 * achète, les pochettes, la vitrine, où paraissent tous les Gaulois du clan, et la loterie du lundi.
 * Chaque onglet ne lit le serveur qu'à son ouverture ; la forge et la boutique se relisent à chaque retour, et le
 * vestiaire aussi : un objet acheté y paraît aussitôt.
 */
export default function VillageApp() {
  const { me, refresh } = useMe();
  const { etape } = useArrivee(me);
  const { active, slide, select, call } = useTabs(IDS, ALIAS);
  // Le sentier se lit dès que la page s'ouvre à un compte qui a son Gaulois : la visite du jour est cochée, et l'onglet
  // dit ce qui attend. Il se relit à chaque retour sur son onglet.
  const sentier = useSentier();
  const lireLeSentier = sentier.lire;
  const gauloisCree = me !== null && me.signed_in && etape !== undefined && etape !== "lien" && etape !== "gaulois";
  const surLeSentier = active === ANCRE_SENTIER;
  useEffect(() => {
    if (gauloisCree) void lireLeSentier();
  }, [gauloisCree, surLeSentier, lireLeSentier]);

  if (me === null) return <Loading label="Lecture de votre compte…" />;

  if (!me.signed_in) {
    return (
      <section aria-labelledby="vestiaire-titre" data-testid="village">
        <h2 id="vestiaire-titre" class="section-title-sm">
          Votre Gaulois
        </h2>
        <div class="mt-8">
          <Vestiaire />
        </div>
      </section>
    );
  }

  if (etape === undefined) return <Loading label="Lecture de votre compte…" />;
  if (etape === "lien") {
    return (
      <div data-testid="village-lien">
        <DemandeLienOpenFront me={me} onSent={refresh} />
      </div>
    );
  }

  // Le Gaulois à créer : le vestiaire seul, sous son titre, qui nomme aussi sa partie (`village-onglet-gaulois`, l'onglet
  // qu'il remplace). Il reste à la même place une fois le Gaulois créé : les onglets paraissent sans qu'il se relise.
  const aCreer = etape === "gaulois";
  const attendent = objetsQuiAttendent(sentier);
  // L'onglet du sentier ne paraît qu'une fois le sentier lu : tant que le serveur ne l'a pas (migration pas encore collée),
  // la barre reste celle d'avant. Une adresse `#sentier` l'ouvre quand même, et dit alors que le sentier ne répond pas.
  const sentierVisible = sentier.etat.kind === "pret" || active === ANCRE_SENTIER;
  const onglets = ONGLETS.filter((onglet) => onglet.id !== ANCRE_SENTIER || sentierVisible).map((onglet) => (onglet.id === ANCRE_SENTIER && attendent > 0 ? { ...onglet, count: { value: attendent, words: `${attendent} ${attendent > 1 ? "objets" : "objet"} à prendre`, tone: "vif" as const } } : onglet));
  return (
    <div class="village" data-testid="village">
      {aCreer ? (
        <div data-testid="village-gaulois">
          <h2 id={`${PREFIXE}-onglet-gaulois`} class="section-title-sm">
            Votre Gaulois
          </h2>
          {/* Un compte en attente n'ouvre la forge, la boutique et le QG qu'une fois validé : le texte ne lui promet rien de plus. */}
          <p class="mt-3 text-muted">
            {me.status === "validated" ? "La forge, la boutique, le QG et la carte de l'alliance s'ouvrent dès qu'il est créé." : "Dernière étape de l'inscription : ensuite, un officier valide votre compte."}
          </p>
        </div>
      ) : (
        <Onglets label="Les parties de la page" prefix={PREFIXE} tabs={onglets} active={active} onSelect={select} call={call} />
      )}
      <Partie prefix={PREFIXE} id="gaulois" active={aCreer ? "gaulois" : active} slide={aCreer ? null : slide}>
        {/* Le titre caché de la partie, sauf quand « Votre Gaulois », juste au-dessus, la nomme déjà. */}
        {!aCreer && <h2 class="sr-only">Mon Gaulois</h2>}
        <Vestiaire actif={aCreer || active === "gaulois"} />
      </Partie>
      {!aCreer && (
        <Partie prefix={PREFIXE} id={ANCRE_SENTIER} active={active} slide={slide}>
          <h2 class="sr-only">Le sentier</h2>
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
          {active === "boutique" && <Boutique />}
        </Partie>
      )}
      {!aCreer && (
        <Partie prefix={PREFIXE} id={RAYON_POCHETTES} active={active} slide={slide}>
          <h2 class="sr-only">Les pochettes</h2>
          {active === RAYON_POCHETTES && <Boutique pochettes />}
        </Partie>
      )}
      {!aCreer && (
        <Partie prefix={PREFIXE} id="vitrine" active={active} slide={slide}>
          <h2 class="sr-only">La vitrine</h2>
          <VitrineDuClan actif={active === "vitrine"} />
        </Partie>
      )}
      {!aCreer && (
        <Partie prefix={PREFIXE} id={ANCRE_LOTERIE} active={active} slide={slide}>
          <h2 class="sr-only">La loterie</h2>
          <LoterieDuLundi actif={active === ANCRE_LOTERIE} />
        </Partie>
      )}
    </div>
  );
}
