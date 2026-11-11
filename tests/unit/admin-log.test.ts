import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GONE_OBJECT, GONE_SUBJECT, LOG_CATEGORIES, categoryOf, describe as describeLine, filterLog, logPeople } from "../../src/lib/compte/admin-log";
import type { LogRow } from "../../src/lib/compte/types";

const row = (action: string, details: Record<string, unknown> = {}, actor: string | null = "Chef", target: string | null = "Recrue", id = 1): LogRow => ({
  id,
  at: "2026-11-08T09:00:00Z",
  action,
  details,
  actor,
  target,
});
const when = (iso: string) => `[${iso}]`;
const sentence = (r: LogRow) => {
  const { who, what } = describeLine(r, when);
  return `${who} ${what}`;
};

// Les migrations des fonctions que le site appelle encore. « Effacer mon compte » est dans celle des dons.
const SITE_SQL = ["20261105000100_comptes_et_roles", "20261105000200_validation_des_membres", "20261105000900_direction", "20261106000100_roles_prevus", "20261108000200_vie_du_clan", "20261109000100_qg_des_membres", "20261109000200_gaulois_de_la_semaine", "20261109000400_refaire_la_demande", "20261111000100_appels_sur_discord", "20261111000200_appels_discord_ping_au_choix", "20261111000300_salons_discord", "20261111000400_outils_du_qg", "20261111000600_messages_discord"]
  .map((name) => readFileSync(`supabase/migrations/${name}.sql`, "utf8"))
  .join("\n");
const SITE_CODES = new Set([...[...SITE_SQL.matchAll(/log_admin\([^,]+,\s*'([a-z_]+)'/g)].map((m) => m[1]!), "account_deleted"]);

describe("le journal en clair", () => {
  it("écrit chaque action du site en une phrase, avec ses détails", () => {
    expect(sentence(row("membership_approved", { in_roster: true }))).toBe("Chef a validé la demande de Recrue.");
    expect(sentence(row("membership_approved", { in_roster: false }))).toBe("Chef a validé la demande de Recrue, hors de la liste officielle.");
    expect(sentence(row("membership_refused", { reason: "Inconnu sur Discord" }))).toBe("Chef a refusé la demande de Recrue : « Inconnu sur Discord ».");
    expect(sentence(row("role_changed", { from: "member", to: "officer" }))).toBe("Chef a changé le rôle de Recrue : Membre → Officier.");
    expect(sentence(row("member_suspended", { reason: "Triche" }))).toBe("Chef a suspendu Recrue : « Triche ».");
    expect(sentence(row("member_reinstated"))).toBe("Chef a rétabli Recrue.");
    expect(sentence(row("founder_transferred"))).toBe("Chef a transmis le rôle de fondateur à Recrue.");
    expect(sentence(row("founder_bootstrap", {}, "Chef", "Chef"))).toBe("Chef reçoit le rôle de fondateur, à l'installation du site.");
    expect(sentence(row("announcement_saved", { id: 3, title: "Tournoi" }, "Chef", null))).toBe("Chef a publié ou modifié l'annonce « Tournoi ».");
    expect(sentence(row("announcement_deleted", { id: 3, title: "Tournoi" }, "Chef", null))).toBe("Chef a supprimé l'annonce « Tournoi ».");
    expect(sentence(row("event_saved", { id: 4, title: "Soirée", starts_at: "2026-11-10T20:00:00+00:00" }, "Chef", null))).toBe(
      "Chef a publié ou modifié l'événement « Soirée », prévu le [2026-11-10T20:00:00+00:00].",
    );
    expect(sentence(row("event_deleted", { id: 4, title: "Soirée" }, "Chef", null))).toBe("Chef a supprimé l'événement « Soirée ».");
    expect(sentence(row("event_series_saved", { title: "Soirée", starts_at: "2026-11-13T20:00:00+00:00", weeks: 4 }, "Chef", null))).toBe(
      "Chef a publié l'événement « Soirée » chaque semaine, 4 semaines de suite, à partir du [2026-11-13T20:00:00+00:00].",
    );
    expect(sentence(row("poll_saved", { id: 2, question: "Quel soir ?" }, "Chef", null))).toBe("Chef a lancé le sondage « Quel soir ? ».");
    expect(sentence(row("poll_closed", { id: 2, question: "Quel soir ?" }, "Chef", null))).toBe("Chef a fermé le sondage « Quel soir ? ».");
    expect(sentence(row("poll_deleted", { id: 2, question: "Quel soir ?" }, "Chef", null))).toBe("Chef a supprimé le sondage « Quel soir ? ».");
    expect(sentence(row("welcome_saved", { empty: false }, "Chef", null))).toBe("Chef a modifié le mot d'accueil.");
    expect(sentence(row("welcome_saved", { empty: true }, "Chef", null))).toBe("Chef a effacé le mot d'accueil.");
    // La boîte à idées du QG : le journal nomme l'auteur de l'idée, jamais son texte.
    expect(sentence(row("idea_decided", { id: 7, status: "kept" }))).toBe("Chef a retenu une idée de Recrue.");
    expect(sentence(row("idea_decided", { id: 7, status: "declined" }))).toBe("Chef a écarté une idée de Recrue.");
    expect(sentence(row("idea_decided", { id: 7, status: "done" }))).toBe("Chef a noté comme faite une idée de Recrue.");
    expect(sentence(row("idea_decided", { id: 7, status: "open" }))).toBe("Chef a remis à l'étude une idée de Recrue.");
    expect(sentence(row("idea_removed", { id: 7 }))).toBe("Chef a retiré une idée de Recrue.");
    // Le Gaulois de la semaine : son pseudo est public, le mot qui l'accompagne n'est pas dans le journal.
    expect(sentence(row("weekly_pick_saved", { week: "2026-11-09", player: "Ancien Gaulois" }, "Chef", null))).toBe("Chef a choisi Ancien Gaulois comme Gaulois de la semaine.");
    expect(sentence(row("weekly_pick_deleted", { week: "2026-11-09", player: "Ancien Gaulois" }, "Chef", null))).toBe("Chef a retiré Ancien Gaulois du Gaulois de la semaine.");
    // Les appels sur Discord : jamais le lien du webhook, seulement s'il y a un rôle à mentionner.
    expect(sentence(row("discord_calls_saved", { mention: true }, "Chef", null))).toBe("Chef a branché le salon Discord des appels, avec un rôle pour les pings.");
    expect(sentence(row("discord_calls_saved", { mention: false }, "Chef", null))).toBe("Chef a branché le salon Discord des appels, sans rôle pour les pings.");
    expect(sentence(row("discord_calls_saved", {}, "Chef", null))).toBe("Chef a branché le salon Discord des appels.");
    expect(sentence(row("discord_calls_cleared", {}, "Chef", null))).toBe("Chef a débranché le salon Discord des appels.");
    expect(sentence(row("discord_salon_saved", { salon: "nouvelles" }, "Chef", null))).toBe("Chef a branché le salon Discord des nouvelles.");
    expect(sentence(row("discord_salon_saved", { salon: "encadrement" }, "Chef", null))).toBe("Chef a branché le salon Discord de l'encadrement.");
    expect(sentence(row("discord_salon_cleared", { salon: "nouvelles" }, "Chef", null))).toBe("Chef a débranché le salon Discord des nouvelles.");
    expect(sentence(row("discord_salon_cleared", { salon: "autre" }, "Chef", null))).toBe("Chef a débranché un salon Discord du robot.");
    expect(sentence(row("weekly_goal_saved", { week: "2026-11-09", kind: "wins", wins: 300 }, "Chef", null))).toBe("Chef a fixé l'objectif de la semaine : 300 victoires.");
    expect(sentence(row("weekly_goal_saved", { week: "2026-11-09", kind: "clan", clan: "ITA" }, "Chef", null))).toBe("Chef a fixé l'objectif de la semaine : face au clan ITA.");
    expect(sentence(row("weekly_goal_saved", {}, "Chef", null))).toBe("Chef a fixé l'objectif de la semaine.");
    expect(sentence(row("weekly_goal_deleted", { week: "2026-11-09" }, "Chef", null))).toBe("Chef a retiré l'objectif de la semaine.");
    expect(sentence(row("voice_channel_saved", {}, "Chef", null))).toBe("Chef a réglé le lien du salon vocal.");
    expect(sentence(row("voice_channel_cleared", {}, "Chef", null))).toBe("Chef a retiré le lien du salon vocal.");
    expect(categoryOf("discord_salon_saved")).toBe("settings");
    expect(categoryOf("discord_calls_saved")).toBe("settings");
    // Les messages Discord de la Direction : le salon seulement, jamais le texte ni le lien du webhook.
    expect(sentence(row("discord_message_sent", { salon: "robot:nouvelles" }, "Chef", null))).toBe("Chef a envoyé un message dans le salon Discord des nouvelles.");
    expect(sentence(row("discord_message_sent", { salon: "appels" }, "Chef", null))).toBe("Chef a envoyé un message dans le salon Discord des appels.");
    expect(sentence(row("discord_message_sent", { salon: "message:3", name: "#annonces" }, "Chef", null))).toBe("Chef a envoyé un message dans le salon Discord « #annonces ».");
    expect(sentence(row("discord_message_sent", { salon: "robot:toString" }, "Chef", null))).toBe("Chef a envoyé un message dans un salon Discord du robot.");
    expect(sentence(row("discord_message_sent", { salon: "appels", unsent: true }, "Chef", null))).toBe("Chef a voulu envoyer un message dans le salon Discord des appels, qui n'a pas pu partir du serveur.");
    expect(sentence(row("discord_message_removed", { salon: "message:3", name: "#annonces" }, "Chef", null))).toBe("Chef a retiré un message du salon Discord « #annonces ».");
    expect(sentence(row("discord_message_removed", { salon: "message:3" }, "Chef", null))).toBe("Chef a retiré un message d'un salon Discord.");
    expect(sentence(row("discord_message_salon_added", { name: "#annonces" }, "Chef", null))).toBe("Chef a ajouté le salon Discord « #annonces » pour les messages.");
    expect(sentence(row("discord_message_salon_removed", { name: "#annonces" }, "Chef", null))).toBe("Chef a retiré le salon Discord « #annonces » des messages.");
    expect(categoryOf("discord_message_sent")).toBe("news");
    expect(categoryOf("discord_message_salon_added")).toBe("settings");
  });

  it("n'écrit pas un détail que le serveur n'a pas donné", () => {
    expect(sentence(row("weekly_pick_saved", {}, "Chef", null))).toBe("Chef a choisi le Gaulois de la semaine.");
    expect(sentence(row("membership_refused"))).toBe("Chef a refusé la demande de Recrue.");
    expect(sentence(row("membership_refused", { reason: "   " }))).toBe("Chef a refusé la demande de Recrue.");
    expect(sentence(row("membership_approved"))).toBe("Chef a validé la demande de Recrue.");
    expect(sentence(row("role_changed", { from: "member" }))).toBe("Chef a changé le rôle de Recrue.");
    expect(sentence(row("role_changed", { from: "member", to: "roi" }))).toBe("Chef a changé le rôle de Recrue.");
    // Un nom hérité d'un objet JavaScript n'est pas un rôle.
    expect(sentence(row("role_changed", { from: "member", to: "toString" }))).toBe("Chef a changé le rôle de Recrue.");
    expect(sentence(row("event_saved", { id: 4 }, "Chef", null))).toBe("Chef a publié ou modifié l'événement.");
    expect(sentence(row("idea_decided", { id: 7 }))).toBe("Chef a tranché une idée de Recrue.");
    expect(sentence(row("idea_decided", { id: 7, status: "toString" }))).toBe("Chef a tranché une idée de Recrue.");
  });

  it("écrit « Refaire la demande », et le nom du moment seulement s'il a changé depuis", () => {
    expect(sentence(row("member_link_reset", { name: "Recrue" }))).toBe("Chef a remis Recrue en attente, pour une nouvelle demande.");
    expect(sentence(row("member_link_reset", {}))).toBe("Chef a remis Recrue en attente, pour une nouvelle demande.");
    // Validé ensuite sous son pseudo, le compte ne s'appelle plus « Gaulois n° 9 » : le journal rappelle son nom d'alors.
    expect(sentence(row("member_link_reset", { name: "Gaulois n° 9" }, "Chef", "SuperSim"))).toBe("Chef a remis SuperSim (alors Gaulois n° 9) en attente, pour une nouvelle demande.");
    expect(sentence(row("member_link_reset", { name: "Gaulois n° 9" }, "Chef", null))).toBe(`Chef a remis ${GONE_OBJECT} en attente, pour une nouvelle demande.`);
    expect(categoryOf("member_link_reset")).toBe("requests");
  });

  it("dit qui reçoit un rôle prévu, quel que soit le chemin", () => {
    // La personne elle-même, à sa demande, ou l'officier qui la valide : c'est elle qui reçoit le rôle.
    expect(sentence(row("role_preset_applied", { role: "officer" }, "Recrue", "Recrue"))).toBe("Recrue reçoit son rôle prévu par la direction : Officier.");
    expect(sentence(row("role_preset_applied", { role: "admin" }, "Chef", "Recrue"))).toBe("Recrue reçoit son rôle prévu par la direction : Admin.");
    expect(sentence(row("membership_approved", { in_roster: true }, "Recrue", "Recrue"))).toBe("Recrue a validé sa propre demande.");
  });

  it("nomme un compte supprimé sans lui inventer de nom", () => {
    expect(sentence(row("member_suspended", { reason: "x" }, null, null))).toBe(`${GONE_SUBJECT} a suspendu ${GONE_OBJECT} : « x ».`);
    expect(sentence(row("membership_approved", {}, "Chef", null))).toBe("Chef a validé la demande d'un compte supprimé.");
    expect(sentence(row("membership_refused", {}, "Chef", null))).toBe("Chef a refusé la demande d'un compte supprimé.");
    expect(sentence(row("role_changed", { from: "officer", to: "member" }, "Chef", null))).toBe("Chef a changé le rôle d'un compte supprimé : Officier → Membre.");
    expect(sentence(row("founder_transferred", {}, "Chef", null))).toBe("Chef a transmis le rôle de fondateur à un compte supprimé.");
    expect(sentence(row("account_deleted", {}, null, null))).toBe("Un membre a supprimé son compte.");
    expect(sentence(row("account_deleted", {}, "Recrue", "Recrue"))).toBe("Recrue a supprimé son compte.");
  });

  it("montre tel quel un code sans libellé", () => {
    expect(sentence(row("season_created", { season: 1 }, "Chef", null))).toBe("Chef a fait une action sans libellé : season_created.");
    expect(categoryOf("season_created")).toBe("other");
  });
});

describe("les filtres du journal", () => {
  const rows = [
    row("membership_approved", {}, "Chef", "Recrue", 1),
    row("role_changed", { from: "member", to: "officer" }, "Chef", "Ami", 2),
    row("member_suspended", { reason: "x" }, "Officier", "Recrue", 3),
    row("announcement_saved", { title: "T" }, "Officier", null, 4),
    row("account_deleted", {}, null, null, 5),
  ];

  it("garde les lignes où la personne agit ou est visée", () => {
    expect(filterLog(rows, { person: "Recrue", category: null }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterLog(rows, { person: "Officier", category: null }).map((r) => r.id)).toEqual([3, 4]);
  });

  it("filtre par type d'action, et combine les deux filtres", () => {
    expect(filterLog(rows, { person: null, category: "requests" }).map((r) => r.id)).toEqual([1]);
    expect(filterLog(rows, { person: null, category: "news" }).map((r) => r.id)).toEqual([4]);
    expect(filterLog(rows, { person: null, category: "other" }).map((r) => r.id)).toEqual([5]);
    expect(filterLog(rows, { person: "Recrue", category: "suspensions" }).map((r) => r.id)).toEqual([3]);
    expect(filterLog(rows, { person: null, category: null })).toHaveLength(rows.length);
  });

  it("propose chaque nom une fois, dans l'ordre alphabétique", () => {
    expect(logPeople(rows)).toEqual(["Ami", "Chef", "Officier", "Recrue"]);
    expect(logPeople([row("membership_approved", {}, "émile", "Zoé"), row("membership_approved", {}, "Eva", "zoé")])).toEqual(["émile", "Eva", "Zoé", "zoé"]);
  });

  it("range chaque action du site dans un type précis, « Autres » restant pour l'effacement d'un compte", () => {
    const offered = new Set(LOG_CATEGORIES.map((c) => c.id));
    for (const code of SITE_CODES) {
      expect(offered.has(categoryOf(code)), code).toBe(true);
      if (code !== "account_deleted") expect(categoryOf(code), code).not.toBe("other");
    }
  });
});

describe("les actions notées par le serveur", () => {
  it("ont toutes une phrase en français", () => {
    expect(SITE_CODES.size).toBeGreaterThan(10);
    for (const code of SITE_CODES) expect(sentence(row(code)), code).not.toContain("sans libellé");
  });
});
