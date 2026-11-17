/**
 * La commande /macarte (demande du pilote, 17 novembre 2026 : « Oui, /macarte ») : la carte du membre qui la tape, en
 * GIF, montrée à tout le salon. C'est la carte de sa fiche sur le site : son Gaulois devant la bannière qu'il montre, avec
 * la finition qu'il a choisie au rayon « Cartes » de la boutique, son familier, et la couronne s'il est champion de la semaine.
 *
 * La fonction ne dessine rien : le site filme la carte de chaque membre qui a un Gaulois après chaque construction
 * (`scripts/filmer-cartes.ts`) et publie les GIF sous `/cartes/<identifiant public>.gif`, avec leur liste,
 * `/cartes/index.json` (`src/lib/cartes-gif.ts`). La fonction relit cette liste sans lui faire confiance (`parseCartes`) et
 * donne à Discord l'adresse du GIF, avec sa version : quand la carte change, l'adresse change.
 *
 * Rien n'est du temps réel : une tenue ou une finition changée paraît dans le GIF après la construction suivante du site,
 * une heure après au plus tard quand le film a le temps de se faire. Le GIF ne porte aucun chiffre.
 */

/** Le nom de la commande, que `definitions.ts` décrit. */
export const MACARTE_COMMAND = "macarte";
/** La liste des cartes que publie le site, depuis sa racine. */
export const CARTES_PATH = "/cartes/index.json";

/** Les cartes publiées : la version du GIF de chaque membre, par son identifiant public. */
export type CartesLues = ReadonlyMap<string, string>;

const ID = /^[A-Za-z0-9]{1,32}$/;
const VERSION = /^[0-9a-f]{12}$/;

/** La liste du site, relue sans lui faire confiance : `null` si elle n'a pas la forme attendue ; une entrée mal formée est écartée. */
export function parseCartes(value: unknown): CartesLues | null {
  const cartes = value && typeof value === "object" ? (value as Record<string, unknown>)["cartes"] : null;
  if (!Array.isArray(cartes)) return null;
  const lues = new Map<string, string>();
  for (const item of cartes) {
    const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const id = entry?.["id"];
    const v = entry?.["v"];
    if (typeof id === "string" && ID.test(id) && typeof v === "string" && VERSION.test(v)) lues.set(id, v);
  }
  return lues;
}

/** L'adresse du GIF d'une carte, avec sa version. */
export const carteGifUrl = (site: string, id: string, v: string): string => `${site}/cartes/${encodeURIComponent(id)}.gif?v=${v}`;

/** Ce que /macarte dit au seul joueur qui la tape, quand il n'y a pas de carte à montrer. */
export const macartePasPrete = (site: string): string =>
  `Votre carte n'est pas encore filmée. Il lui faut votre Gaulois, à habiller sur « Mon Gaulois » : <${site}/village>. Le site filme ensuite les cartes après chacune de ses mises à jour, quelques-unes à la fois : réessayez dans une heure ou deux.`;

/** La description du GIF, lue aux lecteurs d'écran. Le pseudo est celui de la liste du clan. */
export const descriptionDeLaCarte = (pseudo: string): string => `La carte animée de ${pseudo} : son Gaulois en pixels sort de sa carte, qui s'incline doucement.`.slice(0, 1024);

/** Ce que voit tout le salon : le GIF de la carte en grand, un bouton vers la fiche du membre et un vers le rayon « Cartes ». */
export function macarteMessage(site: string, fiche: { id: string; pseudo: string }, v: string, composantsV2: number): Record<string, unknown> {
  return {
    flags: composantsV2,
    components: [
      { type: 12, items: [{ media: { url: carteGifUrl(site, fiche.id, v) }, description: descriptionDeLaCarte(fiche.pseudo) }] },
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: `Voir la fiche de ${fiche.pseudo}`.slice(0, 80), url: `${site}/membres/${encodeURIComponent(fiche.id)}/` },
          { type: 2, style: 5, label: "Changer ma carte", url: `${site}/village#boutique` },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
