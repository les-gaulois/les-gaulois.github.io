import { casesDuStatere } from "../../../supabase/functions/code-discord/statere";
import { rayonsDOr } from "../../lib/jeu/carte-du-cosmetique";
import { LOTS_DESSINES, motsDeLaCarteDeStateres, nombreEnCases, rangDeStateres } from "../../lib/jeu/cartes-de-stateres";
import { CarteDeCosmetique } from "./CarteDeCosmetique";

/**
 * La carte de statères, en grand à la fin d'un booster : les statères rendus par un booster des bannières ou des Gaulois
 * uniques (`rang` 0, avec la part du prix), ou un lot du booster de statères (`rang` 1 à 6, parmi `total` lots). Le modèle
 * unique des cosmétiques (28 novembre 2026), idée « La pièce » choisie par le pilote : une grosse pièce de statère au
 * milieu, sur des rayons d'or, le montant à la place du nom, le nom du lot dessous ; toujours en or, et plus le lot est gros,
 * plus la carte brille (sans reflet jusqu'à la petite pile, la gravure pour la bourse et le coffret, la dorure au-delà).
 * Le montant, la part et le nombre de lots sont ceux de la réponse du serveur ; la phrase entière est dite aux lecteurs
 * d'écran.
 */

/** La pièce de 24 cases et les rayons, dessinés une fois. */
const PIECE = { largeur: 24, hauteur: 24, cases: casesDuStatere(24) };
let rayons: ReturnType<typeof rayonsDOr> | null = null;

/** Ce qui brille selon le lot : rien pour les petits, la gravure de l'épique, la dorure du légendaire pour les gros. */
const eclatDuLot = (rang: number): string => (rang <= 2 ? "commun" : rang <= 4 ? "epique" : "legendaire");

export function CarteDeStateres({ rang: rangLu, gain, pourcent = null, total = 6, testid }: { rang: number; gain: number; pourcent?: number | null; total?: number; testid?: string }) {
  const rang = rangDeStateres(rangLu);
  rayons ??= rayonsDOr();
  return (
    <CarteDeCosmetique
      nom={`+${nombreEnCases(gain)}`}
      rarete={eclatDuLot(rang)}
      tons="legendaire"
      cle={`stateres/${rang}`}
      dessin={PIECE}
      scene={rayons}
      type={LOTS_DESSINES[rang].nom}
      effets={null}
      sous={rang === 0 && pourcent !== null ? `${pourcent} % du prix rendu.` : null}
      pied={["Statères", "", rang === 0 ? "Rendu" : `Lot ${rang} sur ${total}`]}
      dit={<span class="sr-only">{motsDeLaCarteDeStateres(rang, gain, pourcent, total)}</span>}
      grande
      testid={testid}
    />
  );
}
