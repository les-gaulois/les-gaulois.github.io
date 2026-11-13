import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GONE_OBJECT,
  GONE_SUBJECT,
  LOG_CATEGORIES,
  categoryOf,
  describe as describeLine,
  fmtLogDay,
  groupByDay,
  logCounts,
  logDay,
  logEntry,
  matchesLogSearch,
  toneOf,
  type LogCategory,
  type LogTone,
} from "../../src/lib/compte/admin-log";
import { ROLE_LABELS, type LogRow, type Role } from "../../src/lib/compte/types";

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
const SITE_SQL = ["20261105000100_comptes_et_roles", "20261105000200_validation_des_membres", "20261105000900_direction", "20261106000100_roles_prevus", "20261108000200_vie_du_clan", "20261109000100_qg_des_membres", "20261109000200_gaulois_de_la_semaine", "20261109000400_refaire_la_demande", "20261111000100_appels_sur_discord", "20261111000200_appels_discord_ping_au_choix", "20261111000300_salons_discord", "20261111000400_outils_du_qg", "20261111000500_salon_des_victoires", "20261111000600_messages_discord", "20261112000100_messages_discord_images_en_grand", "20261112000200_inventaire_images_discord", "20261112000300_inventaire_200_images", "20261113000400_alliances_sur_la_carte", "20261113000500_allies_acceptes_par_l_encadrement", "20261113000700_allies_dessinent_leurs_zones", "20261113001000_zones_etats_epingle_annonces", "20261113001100_zones_des_allies_acceptees"]
  .map((name) => readFileSync(`supabase/migrations/${name}.sql`, "utf8"))
  .join("\n");
const SITE_CODES = new Set([...[...SITE_SQL.matchAll(/log_admin\([^,]+,\s*'([a-z_]+)'/g)].map((m) => m[1]!), "account_deleted"]);

describe("le journal en clair", () => {
  it("dit quand un joueur allié dessine ou supprime une zone de son clan, sans son nom choisi", () => {
    const zone = { zone: 7, title: "Col du Nord", tag: "LUX", pixels: 12 };
    expect(sentence(row("alliance_zone_saved", { ...zone, new: true, ally: true }, "Allie", null))).toBe("Allie a dessiné la zone « Col du Nord » sur la carte de l'alliance, en joueur allié de LUX.");
    expect(sentence(row("alliance_zone_saved", { ...zone, new: false, ally: true }, "Allie", null))).toBe("Allie a modifié la zone « Col du Nord » sur la carte de l'alliance, en joueur allié de LUX.");
    expect(sentence(row("alliance_zone_deleted", { zone: 7, title: "Col du Nord", tag: "LUX", ally: true }, "Allie", null))).toBe("Allie a supprimé la zone « Col du Nord » de la carte de l'alliance, en joueur allié de LUX.");
    // L'encadrement, comme avant : ni « allié », ni clan.
    expect(sentence(row("alliance_zone_saved", { ...zone, new: true, ally: false }, "Chef", null))).toBe("Chef a dessiné la zone « Col du Nord » sur la carte de l'alliance.");
    expect(sentence(row("alliance_zone_deleted", { zone: 7, title: "Col du Nord" }, "Chef", null))).toBe("Chef a supprimé la zone « Col du Nord » de la carte de l'alliance.");
  });

  it("écrit chaque action du site en une phrase, avec ses détails", () => {
    expect(sentence(row("membership_approved", { in_roster: true }))).toBe("Chef a validé la demande de Recrue.");
    expect(sentence(row("membership_approved", { in_roster: false }))).toBe("Chef a validé la demande de Recrue, hors de la liste officielle.");
    expect(sentence(row("membership_refused", { reason: "Inconnu sur Discord" }))).toBe("Chef a refusé la demande de Recrue : « Inconnu sur Discord ».");
    expect(sentence(row("role_changed", { from: "member", to: "officer" }))).toBe("Chef a fait passer Recrue de Membre à Officier.");
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
    expect(sentence(row("discord_salon_saved", { salon: "victoires" }, "Chef", null))).toBe("Chef a branché le salon Discord des victoires.");
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
    expect(sentence(row("discord_image_saved", { name: "Logo GAL" }, "Chef", null))).toBe("Chef a enregistré l'image « Logo GAL » dans l'inventaire des messages Discord.");
    expect(sentence(row("discord_image_renamed", { name: "Logo du clan", from: "Logo GAL" }, "Chef", null))).toBe("Chef a renommé l'image « Logo GAL » en « Logo du clan » dans l'inventaire des messages Discord.");
    expect(sentence(row("discord_image_renamed", { name: "Logo du clan" }, "Chef", null))).toBe("Chef a renommé une image de l'inventaire des messages Discord.");
    expect(sentence(row("discord_image_removed", { name: "Logo GAL" }, "Chef", null))).toBe("Chef a retiré l'image « Logo GAL » de l'inventaire des messages Discord.");
    expect(sentence(row("discord_image_removed", {}, "Chef", null))).toBe("Chef a retiré une image de l'inventaire des messages Discord.");
    expect(categoryOf("discord_image_saved")).toBe("settings");
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
    expect(sentence(row("role_changed", { from: "officer", to: "member" }, "Chef", null))).toBe("Chef a fait passer un compte supprimé d'Officier à Membre.");
    expect(sentence(row("founder_transferred", {}, "Chef", null))).toBe("Chef a transmis le rôle de fondateur à un compte supprimé.");
    expect(sentence(row("account_deleted", {}, null, null))).toBe("Un membre a supprimé son compte.");
    expect(sentence(row("account_deleted", {}, "Recrue", "Recrue"))).toBe("Recrue a supprimé son compte.");
  });

  it("montre tel quel un code sans libellé", () => {
    expect(sentence(row("season_created", { season: 1 }, "Chef", null))).toBe("Chef a fait une action sans libellé : season_created.");
    expect(categoryOf("season_created")).toBe("other");
  });
});

describe("les types d'action du journal", () => {
  it("range chaque action du site dans un type précis, « Autres » restant pour l'effacement d'un compte", () => {
    const offered = new Set(LOG_CATEGORIES.map((c) => c.id));
    for (const code of SITE_CODES) {
      expect(offered.has(categoryOf(code)), code).toBe(true);
      if (code !== "account_deleted") expect(categoryOf(code), code).not.toBe("other");
    }
  });
});

describe("l'état, l'ordre et l'épinglé de la carte de l'alliance", () => {
  it("disent l'état choisi, l'ordre, et l'épingle sans le texte du message", () => {
    expect(sentence(row("alliance_zone_state", { zone: 7, title: "Col du Nord", state: "en_cours" }, "Chef", null))).toBe("Chef a passé la zone « Col du Nord » de la carte de l'alliance à « en cours ».");
    expect(sentence(row("alliance_zone_state", { zone: 7, title: "Col du Nord", state: "inconnu" }, "Chef", null))).toBe("Chef a passé la zone « Col du Nord » de la carte de l'alliance à un autre état.");
    expect(sentence(row("alliance_zones_ordered", { zones: 4 }, "Chef", null))).toBe("Chef a changé l'ordre des priorités des zones de la carte de l'alliance.");
    expect(sentence(row("alliance_message_pinned", { tag: "LUX" }, "Chef", "Allie"))).toBe("Chef a épinglé un message de Allie en haut de la discussion de l'alliance.");
    expect(sentence(row("alliance_message_unpinned", {}, "Chef", null))).toBe("Chef a désépinglé le message en haut de la discussion de l'alliance.");
    expect(sentence(row("alliance_zone_approved", { zone: 7, title: "Col du Nord", tag: "LUX" }, "Chef", "Allie"))).toBe("Chef a accepté la zone « Col du Nord » de LUX, dessinée par Allie, sur la carte de l'alliance.");
    expect(sentence(row("alliance_zone_refused", { zone: 7, title: "Col du Nord", tag: "LUX" }, "Chef", null))).toBe("Chef a refusé la zone « Col du Nord » de LUX, dessinée par un compte supprimé, sur la carte de l'alliance.");
    expect(sentence(row("alliance_zone_refused", { zone: 7, title: "Col du Nord", tag: "LUX", restored: true }, "Chef", "Allie"))).toBe("Chef a refusé la modification de la zone « Col du Nord » de LUX, faite par Allie : sa version acceptée est revenue sur la carte de l'alliance.");
    expect(sentence(row("alliance_zone_approved", { zone: 7, title: "Col du Nord", tag: "LUX", new: false }, "Chef", "Allie"))).toBe("Chef a accepté la modification de la zone « Col du Nord » de LUX, faite par Allie, sur la carte de l'alliance.");
  });
});

describe("les actions notées par le serveur", () => {
  it("ont toutes une phrase en français", () => {
    expect(SITE_CODES.size).toBeGreaterThan(10);
    for (const code of SITE_CODES) expect(sentence(row(code)), code).not.toContain("sans libellé");
  });
});

describe("le changement de rôle, en mots", () => {
  it("dit le rôle d'avant et celui d'après, sans flèche ni signe", () => {
    expect(sentence(row("role_changed", { from: "admin", to: "member" }))).toBe("Chef a fait passer Recrue d'Admin à Membre.");
    expect(sentence(row("role_changed", { from: "officer", to: "admin" }))).toBe("Chef a fait passer Recrue d'Officier à Admin.");
    const roles = Object.keys(ROLE_LABELS) as Role[];
    for (const from of roles) {
      for (const to of roles) {
        const text = sentence(row("role_changed", { from, to }));
        expect(text, `${from} ${to}`).toMatch(/^Chef a fait passer Recrue (de |d')\S+ à \S+\.$/);
        expect(text, `${from} ${to}`).not.toMatch(/[→>=<]/);
      }
    }
  });
});

describe("l'écran du journal", () => {
  /**
   * La couleur de chaque action notée par le serveur, écrite ici une par une : une action ajoutée au serveur sans couleur
   * choisie fait échouer le test ci-dessous.
   */
  const TONES: Record<string, LogTone> = {
    membership_approved: "ok",
    membership_refused: "danger",
    member_link_reset: "warn",
    role_changed: "ally",
    role_preset_applied: "ally",
    founder_bootstrap: "ally",
    founder_transferred: "ally",
    member_suspended: "danger",
    member_reinstated: "ok",
    announcement_saved: "muted",
    announcement_deleted: "muted",
    event_saved: "muted",
    event_series_saved: "muted",
    event_deleted: "muted",
    poll_saved: "muted",
    poll_closed: "muted",
    poll_deleted: "muted",
    welcome_saved: "muted",
    idea_decided: "muted",
    idea_removed: "muted",
    weekly_pick_saved: "muted",
    weekly_pick_deleted: "muted",
    weekly_goal_saved: "muted",
    weekly_goal_deleted: "muted",
    discord_calls_saved: "muted",
    discord_calls_cleared: "muted",
    discord_salon_saved: "muted",
    discord_salon_cleared: "muted",
    voice_channel_saved: "muted",
    voice_channel_cleared: "muted",
    discord_message_sent: "muted",
    discord_message_removed: "muted",
    discord_message_salon_added: "muted",
    discord_message_salon_removed: "muted",
    discord_image_saved: "muted",
    discord_image_renamed: "muted",
    discord_image_removed: "muted",
    alliance_saved: "muted",
    alliance_deleted: "muted",
    alliance_clan_set: "muted",
    alliance_invite_created: "muted",
    alliance_invite_cancelled: "muted",
    alliance_ally_joined: "muted",
    alliance_ally_requested: "warn",
    alliance_ally_approved: "ok",
    alliance_ally_refused: "danger",
    alliance_ally_cancelled: "muted",
    alliance_ally_removed: "muted",
    alliance_ally_left: "muted",
    alliance_zone_saved: "muted",
    alliance_zone_deleted: "muted",
    alliance_zone_state: "muted",
    alliance_zone_approved: "ok",
    alliance_zone_refused: "danger",
    alliance_zones_ordered: "muted",
    alliance_message_deleted: "muted",
    alliance_message_pinned: "muted",
    alliance_message_unpinned: "muted",
    account_deleted: "muted",
  };

  it("donne à chaque action sa couleur : vert accepté, rouge refusé, jaune en attente, bleu un rôle, gris le reste", () => {
    for (const [code, tone] of Object.entries(TONES)) expect(toneOf(row(code)), code).toBe(tone);
    for (const code of SITE_CODES) expect(Object.hasOwn(TONES, code), `couleur à choisir pour ${code}`).toBe(true);
    // Un code inconnu du site reste gris, comme son type « Autres ».
    expect(toneOf(row("season_created"))).toBe("muted");
    expect(toneOf(row("toString"))).toBe("muted");
  });

  it("met en rouge un message Discord qui n'a pas pu partir, et seulement lui", () => {
    expect(toneOf(row("discord_message_sent", { salon: "appels", unsent: true }))).toBe("danger");
    expect(toneOf(row("discord_message_sent", { salon: "appels", unsent: false }))).toBe("muted");
    // Le serveur écrit un booléen : un texte « true » n'est pas un échec.
    expect(toneOf(row("discord_message_sent", { salon: "appels", unsent: "true" }))).toBe("muted");
    expect(toneOf({ action: "discord_message_sent", details: null as unknown as Record<string, unknown> })).toBe("muted");
    // Seul l'envoi porte ce détail : un retrait reste gris.
    expect(toneOf(row("discord_message_removed", { unsent: true }))).toBe("muted");
  });

  it("prépare chaque ligne une fois : phrase, texte de recherche, type, couleur et jour", () => {
    const entry = logEntry(row("member_suspended", { reason: "Insultes répétées" }, "Teutatès", "Épona"), when);
    expect(entry.line).toEqual({ who: "Teutatès", what: "a suspendu Épona : « Insultes répétées »." });
    expect(entry.text).toBe("teutates a suspendu epona : « insultes repetees ».");
    expect(entry.category).toBe("suspensions");
    expect(entry.tone).toBe("danger");
    expect(entry.day).toBe("2026-11-08");
    expect(entry.row.id).toBe(1);
  });

  describe("la recherche", () => {
    const find = (r: LogRow, query: string) => matchesLogSearch(logEntry(r, when), query);
    const role = row("role_changed", { from: "member", to: "officer" }, "Brennos le Grand", "Epona");
    const annonce = row("announcement_saved", { title: "Tournoi du Samedi" }, "Teutatès", null);

    it("ignore les accents et les majuscules, des deux côtés", () => {
      expect(find(annonce, "teutates")).toBe(true);
      expect(find(annonce, "TEUTATÈS")).toBe(true);
      expect(find(annonce, "Teutatés")).toBe(true);
      expect(find(row("event_saved", { title: "Soirée" }, "Chef", null), "evenement")).toBe(true);
      expect(find(row("event_saved", { title: "Soirée" }, "Chef", null), "SOIRÉE")).toBe(true);
      expect(find(row("event_saved", { title: "soiree" }, "Chef", null), "Soirée")).toBe(true);
    });

    it("lit le nom de qui agit, de qui est visé, le titre et le reste de la phrase", () => {
      expect(find(role, "brennos")).toBe(true);
      expect(find(role, "epona")).toBe(true);
      expect(find(role, "officier")).toBe(true);
      expect(find(annonce, "tournoi du samedi")).toBe(true);
      expect(find(annonce, "annonce")).toBe(true);
      expect(find(row("member_suspended", {}, "Chef", null), "compte supprime")).toBe(true);
      expect(find(row("account_deleted", {}, null, null), "un membre")).toBe(true);
    });

    it("garde tout quand le champ est vide ou blanc, et rien quand le texte manque", () => {
      expect(find(role, "")).toBe(true);
      expect(find(role, "   ")).toBe(true);
      expect(find(role, "  epona  ")).toBe(true);
      expect(find(role, "vercingetorix")).toBe(false);
      // Le code du serveur n'est pas à l'écran : il ne se cherche pas.
      expect(find(role, "role_changed")).toBe(false);
    });
  });

  it("compte les lignes de chaque type, zéro compris", () => {
    const zero: Record<LogCategory, number> = { requests: 0, roles: 0, suspensions: 0, news: 0, settings: 0, alliance: 0, other: 0 };
    expect(logCounts([])).toEqual(zero);
    const entries = ["membership_approved", "membership_refused", "role_changed", "poll_saved", "discord_message_sent", "discord_salon_saved", "alliance_zone_saved", "account_deleted", "season_created"].map((code, i) =>
      logEntry(row(code, {}, "Chef", "Recrue", i), when),
    );
    expect(logCounts(entries)).toEqual({ requests: 2, roles: 1, suspensions: 0, news: 2, settings: 1, alliance: 1, other: 2 });
    expect(Object.values(logCounts(entries)).reduce((a, b) => a + b, 0)).toBe(entries.length);
  });

  describe("les jours, à l'heure de Paris", () => {
    it("range une action de 23 h 30 la veille, et une de 0 h 30 le lendemain", () => {
      // Novembre : Paris est à une heure de l'heure universelle.
      expect(logDay("2026-11-13T22:30:00Z")).toBe("2026-11-13");
      expect(logDay("2026-11-13T23:30:00Z")).toBe("2026-11-14");
      expect(logDay("2026-11-13T22:59:59.999Z")).toBe("2026-11-13");
      expect(logDay("2026-11-13T23:00:00Z")).toBe("2026-11-14");
      // Avant le changement d'heure : deux heures d'écart.
      expect(logDay("2026-10-24T21:30:00Z")).toBe("2026-10-24");
      expect(logDay("2026-10-24T22:30:00Z")).toBe("2026-10-25");
      // Un décalage écrit par le serveur se lit pareil.
      expect(logDay("2026-11-14T00:30:00+01:00")).toBe("2026-11-14");
    });

    it("compte vingt-cinq heures au dimanche 25 octobre 2026, jour du passage à l'heure d'hiver", () => {
      expect(logDay("2026-10-24T21:59:59Z")).toBe("2026-10-24");
      expect(logDay("2026-10-24T22:00:00Z")).toBe("2026-10-25");
      // 2 h 30 à Paris, deux fois : avant (heure d'été) et après (heure d'hiver) le retour d'une heure.
      expect(logDay("2026-10-25T00:30:00Z")).toBe("2026-10-25");
      expect(logDay("2026-10-25T01:30:00Z")).toBe("2026-10-25");
      expect(logDay("2026-10-25T22:59:59Z")).toBe("2026-10-25");
      expect(logDay("2026-10-25T23:00:00Z")).toBe("2026-10-26");
    });

    it("écrit le titre du jour en toutes lettres, avec « 1er » le premier du mois", () => {
      expect(fmtLogDay("2026-11-14")).toBe("Samedi 14 novembre 2026");
      expect(fmtLogDay("2026-11-01")).toBe("Dimanche 1er novembre 2026");
      expect(fmtLogDay("2027-01-01")).toBe("Vendredi 1er janvier 2027");
      expect(fmtLogDay("2026-11-11")).toBe("Mercredi 11 novembre 2026");
      expect(fmtLogDay("2026-11-21")).toBe("Samedi 21 novembre 2026");
      expect(fmtLogDay("2026-10-31")).toBe("Samedi 31 octobre 2026");
      expect(fmtLogDay("2026-10-25")).toBe("Dimanche 25 octobre 2026");
      expect(fmtLogDay(logDay("2026-10-31T23:30:00Z"))).toBe("Dimanche 1er novembre 2026");
    });
  });

  describe("le rangement par jour", () => {
    const at = (iso: string, id: number) => logEntry({ ...row("poll_saved", {}, "Chef", null, id), at: iso }, when);

    it("rend une liste vide pour un journal vide, et un jour pour une seule ligne", () => {
      expect(groupByDay([])).toEqual([]);
      const one = at("2026-11-14T10:00:00Z", 1);
      expect(groupByDay([one])).toEqual([{ day: "2026-11-14", rows: [one] }]);
    });

    it("sépare 0 h 30 et 23 h 30 de Paris, en gardant l'ordre du serveur", () => {
      const rows = [at("2026-11-13T23:30:00Z", 4), at("2026-11-13T23:00:00Z", 3), at("2026-11-13T22:30:00Z", 2), at("2026-11-12T08:00:00Z", 1)];
      const days = groupByDay(rows);
      expect(days.map((d) => d.day)).toEqual(["2026-11-14", "2026-11-13", "2026-11-12"]);
      expect(days.map((d) => d.rows.map((e) => e.row.id))).toEqual([[4, 3], [2], [1]]);
    });

    it("garde un seul titre par jour quand deux lignes arrivent croisées autour de minuit", () => {
      // Le serveur range par numéro : la ligne 3, notée avant minuit, arrive avant la ligne 2, notée juste après.
      const rows = [at("2026-11-14T08:00:00Z", 4), at("2026-11-13T22:59:59.900Z", 3), at("2026-11-13T23:00:00.100Z", 2), at("2026-11-13T10:00:00Z", 1)];
      const days = groupByDay(rows);
      expect(days.map((d) => d.day)).toEqual(["2026-11-14", "2026-11-13"]);
      expect(days.map((d) => d.rows.map((e) => e.row.id))).toEqual([[4, 2], [3, 1]]);
      expect(days.flatMap((d) => d.rows)).toHaveLength(rows.length);
    });
  });

  it("donne à chaque type un nom de filtre court, un mot pour la ligne, et l'aide seulement quand le nom ne suffit pas", () => {
    const ids: LogCategory[] = ["requests", "roles", "suspensions", "news", "settings", "alliance", "other"];
    expect(LOG_CATEGORIES.map((c) => c.id)).toEqual(ids);
    expect(LOG_CATEGORIES.map((c) => c.label)).toEqual(["Demandes", "Rôles", "Suspensions", "Publications", "Réglages", "Alliance", "Autres"]);
    expect(LOG_CATEGORIES.map((c) => c.one)).toEqual(["Demande", "Rôle", "Suspension", "Publication", "Réglage", "Alliance", "Autre"]);
    for (const c of LOG_CATEGORIES) {
      // Un nom de filtre tient sur un bouton : un mot, sans deux-points ni liste.
      expect(c.label, c.id).toMatch(/^\S+$/);
      expect(c.one, c.id).toMatch(/^\S+$/);
      // L'écran ajoute le point final de l'aide.
      if (c.help !== null) expect(c.help, c.id).not.toMatch(/[.\s]$/);
    }
    expect(LOG_CATEGORIES.filter((c) => c.help !== null).map((c) => c.id)).toEqual(["news", "settings", "alliance"]);
    // L'aide de « Publications » et de « Réglages » nomme bien ce que le type range : messages Discord, salons, inventaire.
    expect(LOG_CATEGORIES.find((c) => c.id === "news")?.help).toContain("messages Discord");
    expect(LOG_CATEGORIES.find((c) => c.id === "settings")?.help).toContain("inventaire d'images");
  });
});
