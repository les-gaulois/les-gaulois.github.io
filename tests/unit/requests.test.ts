import { describe, expect, it } from "vitest";
import {
  GAME_ROLES,
  LATE_REQUEST_HOURS,
  READY_REASONS,
  REQUESTS_LIMIT,
  decisionMessage,
  dropDraft,
  gameRoleLabel,
  keepDrafts,
  reasonToggleLabel,
  requestDetails,
  requestTone,
  requestWait,
  requestWho,
  requestsSummary,
  rosterDetail,
  rosterLabel,
  rosterLine,
} from "../../src/lib/compte/requests";
import { fmtDuration } from "../../src/lib/format";

const NOW = new Date("2026-11-08T12:00:00Z");
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const beforeMs = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3_600_000;

describe("fmtDuration", () => {
  it("écrit une durée en minutes, en heures, puis en jours, arrondie vers le bas", () => {
    expect(fmtDuration(-1)).toBe("0 min");
    expect(fmtDuration(59_999)).toBe("0 min");
    expect(fmtDuration(12 * 60_000)).toBe("12 min");
    expect(fmtDuration(60 * 60_000)).toBe("1 h");
    expect(fmtDuration(47 * 3_600_000 + 59 * 60_000)).toBe("47 h");
    expect(fmtDuration(48 * 3_600_000)).toBe("2 jours");
    expect(fmtDuration(9 * 86_400_000 + 5)).toBe("9 jours");
  });
});

describe("l'attente d'une demande", () => {
  it("dit depuis combien de temps elle attend", () => {
    expect(requestWait(before(0), NOW)).toEqual({ text: "en attente depuis moins d'une minute", short: "moins d'une minute", late: false });
    expect(requestWait(before(45), NOW)).toEqual({ text: "en attente depuis 45 min", short: "45 min", late: false });
    expect(requestWait(before(26 * 60), NOW)).toEqual({ text: "en attente depuis 26 h", short: "26 h", late: false });
  });

  it("donne aussi la durée seule, pour la colonne de la liste", () => {
    expect(requestWait(before(0), NOW).short).toBe("moins d'une minute");
    expect(requestWait(before(45), NOW).short).toBe("45 min");
    expect(requestWait(before(4 * 24 * 60), NOW).short).toBe("4 jours");
  });

  it("passe en retard au-delà de deux jours, pas avant", () => {
    expect(LATE_REQUEST_HOURS).toBe(48);
    expect(requestWait(before(48 * 60), NOW).late).toBe(false);
    expect(requestWait(before(48 * 60 + 1), NOW)).toEqual({ text: "en attente depuis 2 jours", short: "2 jours", late: true });
    expect(requestWait(before(4 * 24 * 60), NOW)).toEqual({ text: "en attente depuis 4 jours", short: "4 jours", late: true });
  });

  it("bascule en jaune à la seconde près, autour de deux jours", () => {
    expect(requestWait(beforeMs(48 * HOUR - 1_000), NOW)).toEqual({ text: "en attente depuis 47 h", short: "47 h", late: false });
    expect(requestWait(beforeMs(48 * HOUR), NOW)).toEqual({ text: "en attente depuis 2 jours", short: "2 jours", late: false });
    expect(requestWait(beforeMs(48 * HOUR + 1_000), NOW)).toEqual({ text: "en attente depuis 2 jours", short: "2 jours", late: true });
  });

  it("dit « moins d'une minute » pour une demande d'il y a quelques secondes, et même un peu « dans le futur »", () => {
    expect(requestWait(beforeMs(5_000), NOW)).toEqual({ text: "en attente depuis moins d'une minute", short: "moins d'une minute", late: false });
    expect(requestWait(beforeMs(59_999), NOW).short).toBe("moins d'une minute");
    expect(requestWait(beforeMs(60_000), NOW).short).toBe("1 min");
    // L'horloge du serveur peut avoir quelques secondes d'avance sur celle de l'écran.
    expect(requestWait(beforeMs(-4_000), NOW)).toEqual({ text: "en attente depuis moins d'une minute", short: "moins d'une minute", late: false });
  });

  it("s'écrit au singulier comme au pluriel", () => {
    expect(requestWait(before(1), NOW).short).toBe("1 min");
    expect(requestWait(before(59), NOW).short).toBe("59 min");
    expect(requestWait(before(60), NOW).short).toBe("1 h");
    expect(requestWait(before(47 * 60 + 59), NOW).short).toBe("47 h");
    // Les jours commencent à deux : jamais « 1 jours ».
    expect(requestWait(before(72 * 60), NOW).short).toBe("3 jours");
  });
});

describe("le résumé des demandes", () => {
  const wait = requestWait(before(3 * 24 * 60), NOW);
  it("se lit au singulier comme au pluriel", () => {
    expect(requestsSummary(1, wait)).toBe("1 demande, en attente depuis 3 jours.");
    expect(requestsSummary(2, wait)).toBe("2 demandes, de la plus ancienne à la plus récente. La première est en attente depuis 3 jours.");
  });
  it("dit quand l'écran n'a pas toutes les demandes", () => {
    expect(requestsSummary(REQUESTS_LIMIT - 1, wait)).not.toContain("plus anciennes");
    expect(requestsSummary(REQUESTS_LIMIT, wait)).toContain(`L'écran montre les ${REQUESTS_LIMIT} plus anciennes.`);
  });
});

describe("la phrase sur la liste officielle", () => {
  it("ne dit rien tant que le serveur n'a pas répondu : pas de réponse n'est pas « jamais relue »", () => {
    expect(rosterLine(undefined)).toBeNull();
  });

  it("dit en jaune que la liste n'a jamais été relue, quand le serveur le dit", () => {
    expect(rosterLine(null)).toEqual({ text: "La liste officielle n'a encore jamais été relue : aucun contrôle automatique pour l'instant.", never: true });
  });

  it("donne la date de lecture à l'heure de Paris, et le nombre de membres accordé", () => {
    // 23 h 30 à Greenwich le 8, minuit et demi à Paris le 9.
    expect(rosterLine({ total: 41, read_at: "2026-11-08T23:30:00Z" })).toEqual({ text: "Liste officielle relue le 9 nov. 2026, 00:30 : 41 membres.", never: false });
    expect(rosterLine({ total: 1, read_at: "2026-11-08T12:00:00Z" })?.text).toBe("Liste officielle relue le 8 nov. 2026, 13:00 : 1 membre.");
    expect(rosterLine({ total: 0, read_at: "2026-11-08T12:00:00Z" })?.text).toBe("Liste officielle relue le 8 nov. 2026, 13:00 : 0 membre.");
  });
});

describe("une ligne de demande", () => {
  const row = {
    name: "Gaulois n° 101",
    discord_name: "épona_des_éduens",
    discord_id: "123456789012345678",
    created_at: "2026-11-08T23:30:00Z",
    in_roster: false,
    roster_username: null,
    claimed_text: null,
  };

  it("désigne le joueur par son nom Discord, sinon par son nom sur le site", () => {
    expect(requestWho(row)).toBe("épona_des_éduens");
    expect(requestWho({ ...row, discord_name: null })).toBe("Gaulois n° 101");
  });

  it("est verte dans la liste officielle, rouge absente, et le dit en toutes lettres", () => {
    expect(requestTone({ in_roster: true })).toBe("ok");
    expect(rosterLabel({ in_roster: true })).toBe("Dans la liste");
    expect(requestTone({ in_roster: false })).toBe("danger");
    expect(rosterLabel({ in_roster: false })).toBe("Absent de la liste");
  });

  it("met à côté de la pastille le pseudo trouvé, ou ce que le joueur a indiqué", () => {
    expect(rosterDetail({ in_roster: true, roster_username: "VercingetorixLeTresGrandChef", claimed_text: "autre chose" })).toBe("VercingetorixLeTresGrandChef");
    expect(rosterDetail({ in_roster: true, roster_username: null, claimed_text: null })).toBe("membre sans pseudo public");
    expect(rosterDetail({ in_roster: false, roster_username: null, claimed_text: "Épona_GAL" })).toBe("a indiqué « Épona_GAL »");
    expect(rosterDetail({ in_roster: false, roster_username: null, claimed_text: null })).toBe("");
    expect(rosterDetail({ in_roster: false, roster_username: null, claimed_text: "" })).toBe("");
  });

  it("écrit ses détails : nom sur le site, Discord, date de la demande à l'heure de Paris", () => {
    expect(requestDetails(row)).toBe("Gaulois n° 101 · Discord : 123456789012345678 · demandé le 9 nov. 2026, 00:30");
    // Sans nom Discord, le nom du site est déjà au-dessus : pas de doublon.
    expect(requestDetails({ ...row, discord_name: null })).toBe("Discord : 123456789012345678 · demandé le 9 nov. 2026, 00:30");
    expect(requestDetails({ ...row, discord_id: null })).toBe("Gaulois n° 101 · demandé le 9 nov. 2026, 00:30");
    expect(requestDetails({ ...row, discord_name: null, discord_id: null })).toBe("demandé le 9 nov. 2026, 00:30");
  });
});

describe("le rang dans le jeu", () => {
  it("ne mentionne que le chef et l'officier", () => {
    expect(Object.keys(GAME_ROLES)).toEqual(["leader", "officer"]);
    expect(gameRoleLabel("leader")).toBe("Chef dans le jeu");
    expect(gameRoleLabel("officer")).toBe("Officier dans le jeu");
    expect(gameRoleLabel("member")).toBeNull();
    expect(gameRoleLabel(null)).toBeNull();
  });

  it("ignore un rang inconnu, même un nom de propriété d'objet", () => {
    expect(gameRoleLabel("admin")).toBeNull();
    expect(gameRoleLabel("constructor")).toBeNull();
    expect(gameRoleLabel("toString")).toBeNull();
  });
});

describe("après une décision", () => {
  it("le message nomme le joueur", () => {
    expect(decisionMessage("épona", true)).toBe("Membre validé : épona.");
    expect(decisionMessage("Gaulois n° 105", false)).toBe("Demande refusée : Gaulois n° 105.");
  });
});

describe("le bouton « Raison »", () => {
  it("dit « Raison écrite » une fois refermé sur un texte, pas sur des espaces", () => {
    expect(reasonToggleLabel(false, "")).toBe("Raison");
    expect(reasonToggleLabel(false, "   ")).toBe("Raison");
    expect(reasonToggleLabel(false, "Demande en double.")).toBe("Raison écrite");
    // Ouvert, le champ se voit : le bouton reste « Raison ».
    expect(reasonToggleLabel(true, "Demande en double.")).toBe("Raison");
    expect(reasonToggleLabel(true, "")).toBe("Raison");
  });
});

describe("les brouillons de raison", () => {
  const drafts = { 1: "Pas reconnu sur Discord.", 2: "", 7: "Demande en double." };

  it("ne gardent que les demandes encore dans la liste", () => {
    expect(keepDrafts(drafts, [1, 2, 3])).toEqual({ 1: "Pas reconnu sur Discord.", 2: "" });
    expect(keepDrafts(drafts, [])).toEqual({});
    expect(keepDrafts({}, [1])).toEqual({});
  });

  it("rendent le même objet quand rien ne part, pour ne pas redessiner l'écran", () => {
    expect(keepDrafts(drafts, [1, 2, 7, 9])).toBe(drafts);
    expect(keepDrafts(drafts, new Set([7, 2, 1]))).toBe(drafts);
  });

  it("perdent celui d'une demande traitée, et lui seul", () => {
    expect(dropDraft(drafts, 7)).toEqual({ 1: "Pas reconnu sur Discord.", 2: "" });
    expect(dropDraft({ 4: true, 5: false }, 4)).toEqual({ 5: false });
    expect(dropDraft(drafts, 99)).toBe(drafts);
  });
});

describe("les raisons toutes prêtes", () => {
  it("sont des raisons de refus : le membre ne lit jamais la raison d'une validation", () => {
    expect(READY_REASONS.some((reason) => /^Reconnu/.test(reason))).toBe(false);
  });

  it("tiennent dans le champ, sans doublon, et se lisent après « refusée : »", () => {
    expect(new Set(READY_REASONS).size).toBe(READY_REASONS.length);
    for (const reason of READY_REASONS) {
      // Le champ et le serveur acceptent 300 caractères.
      expect(reason.length, reason).toBeLessThanOrEqual(300);
      expect(reason, reason).toMatch(/^[A-ZÉ].*\.$/);
    }
  });
});
