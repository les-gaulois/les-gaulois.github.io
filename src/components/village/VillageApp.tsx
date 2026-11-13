import { Loading, useMe } from "../compte/common";
import { Onglets, Partie, useTabs, type TabItem } from "../compte/Onglets";
import Vestiaire from "../compte/Vestiaire";
import MarcheDuVillage from "./MarcheDuVillage";
import PlaceDuVillage from "./PlaceDuVillage";

/** Les trois parties du village, dans l'ordre de la barre. L'onglet ouvert se retient dans l'adresse (`#place`). */
const ONGLETS: TabItem[] = [
  { id: "gaulois", label: "Mon Gaulois" },
  { id: "place", label: "La place" },
  { id: "marche", label: "Le marché" },
];
const IDS = ONGLETS.map((onglet) => onglet.id);
const PREFIXE = "village";

/**
 * La page du village : un visiteur voit le Gaulois de départ et la porte, comme avant les onglets ; un compte connecté a
 * trois onglets, comme au QG : son Gaulois (le vestiaire), la place où se tiennent les Gaulois des membres, et le marché.
 * La place et le marché ne lisent le serveur qu'à leur première ouverture ; il décide de ce que chacun peut y voir.
 */
export default function VillageApp() {
  const { me } = useMe();
  const { active, slide, shown, select, call } = useTabs(IDS);

  if (me === null) return <Loading label="Lecture de votre compte…" />;

  if (!me.signed_in) {
    return (
      <section aria-labelledby="vestiaire-titre">
        <h2 id="vestiaire-titre" class="section-title-sm">
          Votre Gaulois
        </h2>
        <div class="mt-8">
          <Vestiaire />
        </div>
      </section>
    );
  }

  return (
    <div class="village" data-testid="village">
      <Onglets label="Les parties du village" prefix={PREFIXE} tabs={ONGLETS} active={active} onSelect={select} call={call} />
      <Partie prefix={PREFIXE} id="gaulois" active={active} slide={slide}>
        <h2 class="sr-only">Mon Gaulois</h2>
        <Vestiaire />
      </Partie>
      <Partie prefix={PREFIXE} id="place" active={active} slide={slide}>
        <h2 class="sr-only">La place du village</h2>
        {shown.has("place") && <PlaceDuVillage actif={active === "place"} />}
      </Partie>
      <Partie prefix={PREFIXE} id="marche" active={active} slide={slide}>
        <h2 class="sr-only">Le marché du village</h2>
        {shown.has("marche") && <MarcheDuVillage actif={active === "marche"} />}
      </Partie>
    </div>
  );
}
