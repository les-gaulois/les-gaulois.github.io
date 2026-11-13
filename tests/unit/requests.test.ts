import { describe, expect, it } from "vitest";
import { LATE_REQUEST_HOURS, READY_REASONS, REQUESTS_LIMIT, requestWait, requestsSummary } from "../../src/lib/compte/requests";
import { fmtDuration } from "../../src/lib/format";

const NOW = new Date("2026-11-08T12:00:00Z");
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

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
    expect(requestWait(before(0), NOW)).toMatchObject({ text: "en attente depuis moins d'une minute", late: false });
    expect(requestWait(before(45), NOW)).toMatchObject({ text: "en attente depuis 45 min", late: false });
    expect(requestWait(before(26 * 60), NOW)).toMatchObject({ text: "en attente depuis 26 h", late: false });
  });

  it("donne aussi la durée seule, pour la colonne de la liste", () => {
    expect(requestWait(before(0), NOW).short).toBe("moins d'une minute");
    expect(requestWait(before(45), NOW).short).toBe("45 min");
    expect(requestWait(before(4 * 24 * 60), NOW).short).toBe("4 jours");
  });

  it("passe en retard au-delà de deux jours, pas avant", () => {
    expect(LATE_REQUEST_HOURS).toBe(48);
    expect(requestWait(before(48 * 60), NOW).late).toBe(false);
    expect(requestWait(before(48 * 60 + 1), NOW)).toMatchObject({ text: "en attente depuis 2 jours", late: true });
    expect(requestWait(before(4 * 24 * 60), NOW)).toMatchObject({ text: "en attente depuis 4 jours", late: true });
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
