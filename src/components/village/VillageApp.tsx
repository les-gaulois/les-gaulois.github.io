import { DemandeLienOpenFront, useLienAttendu } from "../compte/LienOpenFront";
import { Onglets, Partie, useTabs, type TabItem } from "../compte/Onglets";
import { Loading, useMe } from "../compte/common";
import Vestiaire from "../compte/Vestiaire";
import AtelierDeLaForge from "./Forge";
import MarcheDuVillage from "./MarcheDuVillage";

/**
 * Les trois parties de la page, dans l'ordre de la barre. L'onglet ouvert se retient dans l'adresse (`#forge`). Les
 * adresses du monde du village, retiré le 15 novembre 2026 (`#place`, `#chantier`, `#feu`, `#qui`, `#interieur-…`), ne
 * nomment plus d'onglet : elles ouvrent « Mon Gaulois ».
 */
const ONGLETS: TabItem[] = [
  { id: "gaulois", label: "Mon Gaulois" },
  { id: "forge", label: "La forge" },
  { id: "marche", label: "Le marché" },
];
const IDS = ONGLETS.map((onglet) => onglet.id);
const PREFIXE = "village";

/**
 * La page de son Gaulois (`/village`). Le monde du village en pixels est retiré depuis le 15 novembre 2026, à la demande
 * du pilote (« enlève la partie villages ») : il garde le Gaulois et ses objets, qui paraissent sur les images du clan.
 * Un visiteur voit le Gaulois de départ et la porte. Un compte qui doit encore donner le lien de son profil OpenFront le
 * donne d'abord. Un compte connecté a trois onglets, comme au QG : son Gaulois (le vestiaire, la bourse, la boutique et la
 * pochette surprise), la forge, où l'on grave une de ses parties sur un objet, et le marché entre membres. Chaque onglet
 * ne lit le serveur qu'à son ouverture ; la forge se relit à chaque retour, la bourse ayant pu changer au vestiaire.
 */
export default function VillageApp() {
  const { me, refresh } = useMe();
  const lien = useLienAttendu(me);
  const { active, slide, shown, select, call } = useTabs(IDS);

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

  if (lien === null) return <Loading label="Lecture de votre compte…" />;
  if (lien) {
    return (
      <div data-testid="village-lien">
        <DemandeLienOpenFront me={me} onSent={refresh} />
      </div>
    );
  }

  return (
    <div class="village" data-testid="village">
      <Onglets label="Les parties de la page" prefix={PREFIXE} tabs={ONGLETS} active={active} onSelect={select} call={call} />
      <Partie prefix={PREFIXE} id="gaulois" active={active} slide={slide}>
        <h2 class="sr-only">Mon Gaulois</h2>
        <Vestiaire actif={active === "gaulois"} />
      </Partie>
      <Partie prefix={PREFIXE} id="forge" active={active} slide={slide}>
        <h2 class="sr-only">La forge</h2>
        {active === "forge" && <AtelierDeLaForge />}
      </Partie>
      <Partie prefix={PREFIXE} id="marche" active={active} slide={slide}>
        <h2 class="sr-only">Le marché</h2>
        {shown.has("marche") && <MarcheDuVillage actif={active === "marche"} />}
      </Partie>
    </div>
  );
}
