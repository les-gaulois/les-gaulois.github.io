/**
 * Fait lancer la sauvegarde chiffrée de la semaine par le robot horaire.
 *
 * Le planning de GitHub saute la plupart de ses passages sur ce dépôt : les 6, 7 et 8 novembre 2026, quatre exécutions
 * planifiées sur vingt-quatre ont démarré chaque jour, et la première sauvegarde du lundi n'a pas eu lieu. Le robot
 * horaire, lancé par cron-job.org, passe lui toutes les heures. À chaque passage, il regarde si la semaine a sa
 * sauvegarde, et sinon, il lance l'Action « Sauvegarde chiffrée ». La semaine commence le lundi à 3 h UTC (`backupWeekStart`).
 * Une sauvegarde ratée est relancée au passage suivant, avec trois essais au plus dans la semaine, lancements à la main
 * compris : au-delà, le robot le signale en avertissement et attend la semaine suivante, pour ne pas répéter toutes les
 * heures la même erreur. Tant qu'une exécution n'est pas finie, il ne lance rien ; si elle attend depuis plus d'une heure
 * (incident de GitHub), il le signale aussi. Sans le secret SAUVEGARDE_CLE, il ne lance rien et le signale à chaque
 * passage : un avertissement se lit sur la page de l'exécution, et par l'API publique, sans ouvrir le journal.
 */
import { backupWeekStart } from "./sauvegarde";

export const BACKUP_WORKFLOW = "sauvegarde.yml";
export const MAX_ATTEMPTS_PER_WEEK = 3;
/** Au-delà, une exécution non finie est signalée : celle de la sauvegarde s'arrête d'elle-même au bout de 10 minutes. */
export const STUCK_AFTER_MS = 60 * 60 * 1000;

/** Ce que l'API GitHub dit d'une exécution : seuls ces champs servent. */
export interface BackupRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
}

export type RelaunchResult = "off" | "running" | "done" | "gave-up" | "launched" | "failed";

export interface RelaunchDeps {
  /** Appelle l'API GitHub du dépôt ; `path` commence par `/actions/`. */
  api: (path: string, init?: { method: "POST"; body: string }) => Promise<Response>;
  now: Date;
  /** Le secret SAUVEGARDE_CLE est-il posé ? Sans lui, une sauvegarde ne ferait rien. */
  passphraseSet: boolean;
  /** La branche dont l'Action est lancée. */
  ref: string;
  log: (line: string) => void;
}

export async function relaunchBackupIfDue({ api, now, passphraseSet, ref, log }: RelaunchDeps): Promise<RelaunchResult> {
  if (!passphraseSet) {
    // En avertissement, visible sur la page de l'exécution sans ouvrir le journal : sans phrase, plus aucune sauvegarde.
    log("::warning::Sauvegarde : ce job ne voit pas le secret SAUVEGARDE_CLE (absent des secrets du dépôt, ou non transmis par site.yml), aucune sauvegarde ne se fait. Voir docs/DIRECTION.md, « La sauvegarde chiffrée ».");
    return "off";
  }
  const listed = await api(`/actions/workflows/${BACKUP_WORKFLOW}/runs?per_page=30`);
  if (!listed.ok) {
    log(`::warning::Sauvegarde : GitHub a répondu ${listed.status} à la liste des exécutions. Nouvel essai au prochain passage.`);
    return "failed";
  }
  const runs = ((await listed.json()) as { workflow_runs?: BackupRun[] }).workflow_runs ?? [];
  const unfinished = runs.filter((run) => run.status !== "completed");
  if (unfinished.length > 0) {
    const stuck = unfinished.some((run) => now.getTime() - Date.parse(run.created_at) > STUCK_AFTER_MS);
    log(
      stuck
        ? "::warning::Sauvegarde : une exécution attend depuis plus d'une heure sans finir. Voir l'onglet Actions, « Sauvegarde chiffrée » : l'annuler laisse le robot en relancer une."
        : "Une sauvegarde est déjà en cours.",
    );
    return "running";
  }
  const weekStart = backupWeekStart(now).getTime();
  const thisWeek = runs.filter((run) => Date.parse(run.created_at) >= weekStart).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  // Une exécution réussie n'a pas forcément sauvegardé (phrase absente à ce moment-là) : seul un fichier gardé compte.
  for (const run of thisWeek.filter((r) => r.conclusion === "success")) {
    const res = await api(`/actions/runs/${run.id}/artifacts`);
    if (!res.ok) {
      log(`::warning::Sauvegarde : GitHub a répondu ${res.status} à la liste des fichiers. Nouvel essai au prochain passage.`);
      return "failed";
    }
    const { artifacts = [] } = (await res.json()) as { artifacts?: { expired?: boolean }[] };
    if (artifacts.some((artifact) => !artifact.expired)) {
      log("La sauvegarde de la semaine est faite.");
      return "done";
    }
  }
  if (thisWeek.length >= MAX_ATTEMPTS_PER_WEEK) {
    log(`::warning::Sauvegarde : ${thisWeek.length} essais cette semaine, aucun fichier gardé. Plus d'essai avant lundi prochain : voir l'onglet Actions, « Sauvegarde chiffrée ».`);
    return "gave-up";
  }
  const dispatched = await api(`/actions/workflows/${BACKUP_WORKFLOW}/dispatches`, { method: "POST", body: JSON.stringify({ ref }) });
  if (!dispatched.ok) {
    log(`::warning::Sauvegarde : GitHub a répondu ${dispatched.status} au lancement. Nouvel essai au prochain passage.`);
    return "failed";
  }
  log("Sauvegarde de la semaine lancée.");
  return "launched";
}
