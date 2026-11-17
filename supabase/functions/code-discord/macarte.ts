/**
 * Les cartes des membres en GIF, pour /macarte et /gaulois (demandes du pilote, 17 novembre 2026).
 *
 * - /macarte (« Oui, /macarte ») : la carte du membre qui la tape, en hauteur, montrée à tout le salon. C'est la carte de
 *   sa fiche sur le site : son Gaulois devant la bannière qu'il montre, avec la finition qu'il a choisie au rayon « Cartes »
 *   de la boutique, son familier, et la couronne s'il est champion de la semaine.
 * - /gaulois (« que /gaulois soit pareil », « en mode paysage », « je veux voir le niv et la flamme ») : la même carte
 *   élargie en paysage, avec le niveau du compte et la flamme de série dans ses coins. Sans ce GIF (pas de pseudo public,
 *   carte pas encore filmée, site muet), /gaulois garde son image fixe, dessinée par la fonction (`index.ts`).
 *
 * La fonction ne dessine aucun GIF : le site filme les cartes des fiches après chaque construction
 * (`scripts/filmer-cartes.ts`) et les publie sous `/cartes/`, avec leur liste, `/cartes/index.json`
 * (`src/lib/cartes-gif.ts`). La fonction relit cette liste sans lui faire confiance (`parseCartes`) et donne à Discord
 * l'adresse du GIF, avec sa version : quand la carte change, l'adresse change.
 *
 * Rien n'est du temps réel : une tenue ou une finition changée paraît dans le GIF après la construction suivante du site,
 * une heure après au plus tard quand le film a le temps de se faire. Le GIF de /macarte ne porte aucun chiffre ; sous
 * celui de /gaulois, la fonction écrit l'heure du relevé de la série, comme sous l'image fixe.
 */

/** Le nom de la commande, que `definitions.ts` décrit. */
export const MACARTE_COMMAND = "macarte";
/** La liste des cartes que publie le site, depuis sa racine. */
export const CARTES_PATH = "/cartes/index.json";

/** Les GIF publiés : la version de celui de chaque membre, par son identifiant public, pour chaque sorte de film. */
export interface CartesLues {
  /** Les cartes en hauteur, pour /macarte. */
  cartes: ReadonlyMap<string, string>;
  /** Les cartes en paysage, avec niveau et flamme, pour /gaulois. */
  paysages: ReadonlyMap<string, string>;
}

const ID = /^[A-Za-z0-9]{1,32}$/;
const VERSION = /^[0-9a-f]{12}$/;

function lireListe(liste: unknown): Map<string, string> {
  const lues = new Map<string, string>();
  if (!Array.isArray(liste)) return lues;
  for (const item of liste) {
    const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const id = entry?.["id"];
    const v = entry?.["v"];
    if (typeof id === "string" && ID.test(id) && typeof v === "string" && VERSION.test(v)) lues.set(id, v);
  }
  return lues;
}

/**
 * La liste du site, relue sans lui faire confiance : `null` si elle n'a pas la forme attendue ; une entrée mal formée est
 * écartée. Une liste d'avant les paysages (sans `paysages`) se lit, sans paysage.
 */
export function parseCartes(value: unknown): CartesLues | null {
  const body = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!body || !Array.isArray(body["cartes"])) return null;
  return { cartes: lireListe(body["cartes"]), paysages: lireListe(body["paysages"]) };
}

/** L'adresse du GIF d'une carte, avec sa version ; `paysage` : celui de /gaulois. */
export const carteGifUrl = (site: string, id: string, v: string, paysage = false): string => `${site}/cartes/${encodeURIComponent(id)}${paysage ? "-paysage" : ""}.gif?v=${v}`;

/** Ce que /macarte dit au seul joueur qui la tape, quand il n'y a pas de carte à montrer. */
export const macartePasPrete = (site: string): string =>
  `Votre carte n'est pas encore filmée. Il lui faut votre Gaulois, à habiller sur « Mon Gaulois » : <${site}/village>. Le site filme ensuite les cartes après chacune de ses mises à jour, quelques-unes à la fois : réessayez dans une heure ou deux.`;

/** La description du GIF, lue aux lecteurs d'écran. Le pseudo est celui de la liste du clan. */
export const descriptionDeLaCarte = (pseudo: string): string => `La carte animée de ${pseudo} : son Gaulois en pixels sort de sa carte, qui s'incline doucement.`.slice(0, 1024);

/** Un bouton vers une page, sous le GIF. */
export interface BoutonDeCarte {
  label: string;
  url: string;
}

/**
 * Ce que voit tout le salon : le GIF en grand, une ligne dessous s'il y en a une (l'heure du relevé de la série et la
 * mention d'OpenFront, pour le paysage de /gaulois), puis les boutons.
 */
export function carteMessage(gif: { url: string; description: string }, ligne: string | null, boutons: readonly BoutonDeCarte[], composantsV2: number): Record<string, unknown> {
  return {
    flags: composantsV2,
    components: [
      { type: 12, items: [{ media: { url: gif.url }, description: gif.description.slice(0, 1024) }] },
      ...(ligne ? [{ type: 10, content: ligne }] : []),
      { type: 1, components: boutons.map((b) => ({ type: 2, style: 5, label: b.label.slice(0, 80), url: b.url })) },
    ],
    allowed_mentions: { parse: [] },
  };
}

/** /macarte : la carte en hauteur, un bouton vers la fiche du membre et un vers le rayon « Cartes ». */
export function macarteMessage(site: string, fiche: { id: string; pseudo: string }, v: string, composantsV2: number): Record<string, unknown> {
  return carteMessage(
    { url: carteGifUrl(site, fiche.id, v), description: descriptionDeLaCarte(fiche.pseudo) },
    null,
    [
      { label: `Voir la fiche de ${fiche.pseudo}`, url: `${site}/membres/${encodeURIComponent(fiche.id)}/` },
      { label: "Changer ma carte", url: `${site}/village#boutique` },
    ],
    composantsV2,
  );
}
