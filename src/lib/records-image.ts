/**
 * L'image d'un record battu : une case par record, sa nouvelle marque en grand, sa date, et l'ancienne marque à droite.
 * Même dessin que les autres images du robot (`salon-image.ts`). Tout vient de l'alerte : rien n'est recalculé.
 * Chargée seulement au moment d'envoyer : si elle ne se dessine pas, le message part en texte.
 */
import type { GazetteCard, Measure } from "./gazette-image";
import { RECORD_KICKER, RECORD_LABELS, recordBefore, recordCollected, recordHeadline, recordLine, recordMark, recordScope, type RecordAlert } from "./records-discord";
import { shownAddress } from "./salon-discord";
import { factsCard } from "./salon-image";

/** Quoi écrire et où, à partir de l'alerte seule : se teste sans police. */
export function recordCard(alert: RecordAlert, tag: string, siteUrl: string, archiveStart: string, coveredUntil: string, measure: Measure): GazetteCard {
  return factsCard(
    {
      kicker: RECORD_KICKER,
      title: recordHeadline(alert, tag),
      period: recordScope(archiveStart),
      facts: alert.beaten.map((b) => ({ label: RECORD_LABELS[b.key], value: recordMark(b.key, alert.records), detail: recordBefore(b.before) })),
      address: shownAddress(siteUrl, "/records"),
      note: recordCollected(coveredUntil),
    },
    measure,
  );
}

/** Ce que l'image dit, pour un lecteur d'écran : Discord le lit comme description du fichier. */
export function recordImageAlt(alert: RecordAlert, tag: string, archiveStart: string, coveredUntil: string): string {
  const lines = alert.beaten.map((b) => recordLine(b, alert.records));
  return [`${recordHeadline(alert, tag)}.`, ...lines, `${RECORD_KICKER}. ${recordScope(archiveStart)}. ${recordCollected(coveredUntil)}.`].join(" ").slice(0, 1024);
}
