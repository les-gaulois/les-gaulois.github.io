/**
 * L'image du guichet des tickets sur Discord (docs/DIRECTION.md, « Les tickets d'assistance ») : /tickets la pose au-dessus
 * des trois boutons du guichet. Elle dit ce que fait chacun, dans leur ordre. Le même dessin que les autres images du robot
 * (`salon-image.ts`) ; elle se dessine à la construction du site avec les images des commandes
 * (`src/pages/commandes/[nom].png.ts`), et la fonction `code-discord` la lit dans `/commandes.json`, sous `guichet`.
 * Ce fichier dit quoi écrire et où ; il se teste sans police.
 */
import { CARD_COLORS as C, fitted, pageHead, type CardText, type GazetteCard, type Measure } from "./gazette-image";
import { shownAddress } from "./salon-discord";
import { assembleCard, CARD_MARGIN, CARD_WIDTH, footParts, FOOTER_HEIGHT, rowParts, type CardRow } from "./salon-image";

export const GUICHET_TITLE = "Besoin d'aide ?";
export const GUICHET_KICKER = "Le guichet des Gaulois";
export const GUICHET_PERIOD = "Un salon privé s'ouvre, rien qu'avec vous et l'encadrement";
/** Les trois boutons du guichet, dans leur ordre (`KINDS` de `tickets.ts` : un test vérifie qu'ils portent ces noms). */
export const GUICHET_ROWS: readonly { name: string; detail: string }[] = [
  { name: "Rejoindre le clan", detail: "votre pseudo dans OpenFront" },
  { name: "Poser une question", detail: "le jeu, le clan, le site" },
  { name: "Signaler un tricheur", detail: "son pseudo, la partie" },
];
export const GUICHET_NOTES = ["Choisissez le bouton qui correspond, sous l'image.", "Un ticket à la fois : il se ferme quand c'est réglé."] as const;
/** L'invite de l'en-tête : `gal@clan:~$ ./aide`. Le guichet ne mène à aucune page. */
const PROMPT_PATH = "/aide";
const BADGE_WIDTH = 64;

export function guichetCard(siteUrl: string, measure: Measure): GazetteCard {
  const head = pageHead({ path: PROMPT_PATH, title: GUICHET_TITLE, kicker: GUICHET_KICKER, period: GUICHET_PERIOD }, measure);
  const rows: CardRow[] = GUICHET_ROWS.map((row, i) => ({ badge: String(i + 1), strong: true, name: row.name, detail: row.detail }));
  const body = rowParts(rows, head.bottom, BADGE_WIDTH, false, measure);
  const notes: CardText[] = GUICHET_NOTES.map((line, i) => ({
    ...fitted(line, "body", 26, 18, CARD_WIDTH - 2 * CARD_MARGIN, measure),
    x: CARD_MARGIN,
    y: body.bottom + 48 + i * 40,
    font: "body",
    color: C.MUTED,
  }));
  const height = body.bottom + 48 + (GUICHET_NOTES.length - 1) * 40 + 12 + FOOTER_HEIGHT;
  const address = shownAddress(siteUrl, "");
  return assembleCard(height, [head, body, { rects: [], texts: notes }, footParts(address, "", height, measure)]);
}

/** Sa description, que Discord lit aux lecteurs d'écran : tout ce que l'image écrit. */
export function guichetImageAlt(): string {
  const rows = GUICHET_ROWS.map((row, i) => `${i + 1}. ${row.name} : ${row.detail}.`);
  return [`${GUICHET_TITLE} ${GUICHET_KICKER}. ${GUICHET_PERIOD}.`, ...rows, ...GUICHET_NOTES].join(" ");
}
