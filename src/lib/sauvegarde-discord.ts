/**
 * Le compte rendu d'une sauvegarde chiffrée sur le salon Discord privé de l'encadrement, à la fin de l'Action
 * « Sauvegarde chiffrée » : faite, avec le jour où GitHub l'effacera, ou ratée, avec le lien de l'exécution.
 * Aucune donnée, aucun nom. Jour et nuit, comme les autres messages à l'encadrement depuis le 14 novembre 2026.
 */
import { postStaffMessage } from "./encadrement-discord";
import { fmtDate, fmtDayAndTime } from "./format";
import { isWebhookUrl } from "./gazette-discord";
import { BACKUP_RETENTION_DAYS } from "./sauvegarde";

/** `reglage` : l'Action a tourné sans rien garder, faute de phrase de passe ou d'un autre réglage ; `ratee` : une vraie panne. */
export type BackupOutcome = "faite" | "reglage" | "ratee";

const DAY_MS = 86_400_000;
/** Seul un lien vers une exécution du dépôt figure dans le message. */
const RUN_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/;

/** Le texte du compte rendu. */
export function backupReport(outcome: BackupOutcome, now: Date, runUrl: string): string {
  if (outcome === "faite") {
    const keptUntil = new Date(now.getTime() + BACKUP_RETENTION_DAYS * DAY_MS).toISOString();
    return `Sauvegarde chiffrée faite le ${fmtDayAndTime(now.toISOString())}. GitHub la garde jusqu'au ${fmtDate(keptUntil)}.`;
  }
  const detail = RUN_URL.test(runUrl) ? ` Détail : ${runUrl}` : "";
  if (outcome === "reglage") {
    return `La sauvegarde chiffrée n'a rien gardé : la phrase de passe ou un autre réglage manque dans les secrets du dépôt. Sans phrase, le robot n'en lance aucune.${detail}`;
  }
  return `La sauvegarde chiffrée a échoué. Le robot la relance au passage suivant, trois essais au plus par semaine ; au-delà, elle se relance à la main, onglet Actions.${detail}`;
}

export interface BackupReportDeps {
  webhook: string | undefined;
  outcome: BackupOutcome;
  now: Date;
  runUrl: string;
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Envoie le compte rendu. Le lien du salon vaut un mot de passe : il n'est écrit dans aucun message, même d'erreur. */
export async function sendBackupReport({ webhook, outcome, now, runUrl, fetch: post, log }: BackupReportDeps): Promise<"off" | "invalid" | "sent" | "failed"> {
  const link = webhook?.trim();
  if (!link) {
    log("Pas de lien Discord pour l'encadrement : pas de compte rendu.");
    return "off";
  }
  if (!isWebhookUrl(link)) {
    log("::warning::Encadrement : le lien Discord n'a pas la forme attendue, pas de compte rendu.");
    return "invalid";
  }
  if (!(await postStaffMessage(link, backupReport(outcome, now, runUrl), post, log, "Le compte rendu de cette sauvegarde est perdu, pas la sauvegarde."))) return "failed";
  log(`Encadrement : compte rendu « ${outcome} » envoyé.`);
  return "sent";
}
