/**
 * Les cartes d'essai (17 novembre 2026, à la demande du pilote : « un test automatique des cartes ») : de quoi dessiner
 * les cartes du podium, la carte d'un membre et le reflet d'un bloc de fiche sans aucun vrai Gaulois, pour les tests du
 * navigateur (`tests/e2e/cartes.spec.ts`). Sans les Gaulois relevés par la GitHub Action, l'accueil montre le guerrier :
 * aucun test ne voyait donc les cartes, et trois défauts sont passés (cartes immobiles, reflets coupés, plaque décentrée).
 *
 * Rien d'ici n'est publié : la page d'essai (`src/pages/essai/[page].astro`) n'existe que si la construction est lancée
 * avec `GAL_ESSAI=1`. Les noms sont des noms d'essai, les tenues sont tirées au sort, toujours les mêmes.
 */
import sharp from "sharp";
import { FAMILIERS } from "../../supabase/functions/code-discord/familiers/index.ts";
import { familierDeCarte, type FamilierDeCarte } from "./carte-familier";
import { cartesDuPodium, type CarteDuPodium } from "./cartes-podium";
import { tenueAuHasard, type Tenue } from "./gaulois";
import type { PortraitDeGaulois } from "./gaulois-site";
import { BUST_CUT, SPRITE_AXIS, placeSprite, spritePixels } from "./gaulois-sprite";

/** La page d'essai est-elle demandée ? Seulement par `GAL_ESSAI=1`, à la construction. */
export const essaiDemande = (): boolean => process.env["GAL_ESSAI"] === "1";

/** Un hasard qui redonne toujours la même suite : les cartes d'essai ne changent pas d'une construction à l'autre. */
function suite(graine: number): () => number {
  let etat = graine;
  return () => (etat = (etat * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** Le portrait d'une tenue, avec son image dans l'adresse même : la page d'essai ne dépend d'aucun fichier. */
export async function portraitDEssai(tenue: Tenue): Promise<PortraitDeGaulois | null> {
  const place = placeSprite(tenue, { axis: 0, bottom: 0, scale: 1 });
  if (!place) return null;
  const { data, width, height } = spritePixels(place);
  const png = await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const buste = BUST_CUT - place.crop.top;
  return { image: `data:image/png;base64,${png.toString("base64")}`, largeur: width, hauteur: height, buste: buste >= 1 && buste < height ? buste : height, axe: SPRITE_AXIS - place.crop.left };
}

export interface CartesDEssai {
  /** Trois cartes : le premier avec une bannière et la finition de sa place, le deuxième avec un reflet, le troisième sans rien. */
  podium: CarteDuPodium[];
  /** Le portrait du premier, pour la carte d'un membre seule. */
  portrait: PortraitDeGaulois;
  /** Le premier familier du catalogue, sur la carte du premier et sur celle du membre. */
  familier: FamilierDeCarte | null;
}

/** Les cartes d'essai, ou `null` si un dessin manque. */
export async function cartesDEssai(): Promise<CartesDEssai | null> {
  const hasard = suite(20261117);
  const joueurs = [
    { id: "essai-un", username: "Essai un", place: 1, wins: 30 },
    { id: "essai-deux", username: "Essai deux", place: 2, wins: 20 },
    { id: "essai-trois", username: "Essai trois", place: 3, wins: 10 },
  ];
  const portraits = new Map<string, PortraitDeGaulois | null>();
  for (const j of joueurs) portraits.set(j.id, await portraitDEssai(tenueAuHasard(hasard)));
  const podium = cartesDuPodium(
    joueurs,
    (id) => portraits.get(id) ?? null,
    (id) => (id === "essai-un" ? "/bannieres/aurore-du-lac-gele.png" : null),
    (id) => (id === "essai-deux" ? "arc-en-ciel" : null),
    (id) => (id === "essai-un" ? (FAMILIERS[0]?.id ?? null) : null),
  );
  const portrait = portraits.get("essai-un");
  return podium && portrait ? { podium, portrait, familier: familierDeCarte(FAMILIERS[0]?.id) } : null;
}
