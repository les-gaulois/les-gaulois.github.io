import { describe, expect, it } from "vitest";
import {
  POLLS_LIMIT,
  POLL_FILTERS,
  fmtPollShare,
  inPollFilter,
  leadMark,
  openPollCount,
  openPollsBadge,
  pollEnd,
  pollEndBounds,
  pollFilterAnnouncement,
  pollFilterCounts,
  pollResult,
  pollTon,
  pollWhen,
} from "../../src/lib/compte/direction-sondages";
import { pollRows } from "../../src/lib/compte/polls";
import { fmtDateTime } from "../../src/lib/format";

const open = { is_open: true };
const closed = { is_open: false };
/** L'espace insécable entre le nombre et « % » : la part ne se coupe jamais en fin de ligne. */
const NB = String.fromCharCode(0xa0);
const pct = (text: string) => text.replace(/ %$/, `${NB}%`);
const leads = (counts: number[]) => pollResult({ options: counts.map((_, i) => `Choix ${i + 1}`), counts });

describe("le résultat d'un sondage, à la Direction", () => {
  it("marque le choix qui a le plus de voix", () => {
    const result = pollResult({ options: ["Mercredi", "Vendredi", "Samedi"], counts: [4, 11, 7] });
    expect(result?.total).toBe(22);
    expect(result?.tie).toBe(false);
    expect(result?.rows.map((r) => r.lead)).toEqual([false, true, false]);
  });

  it("ne désigne personne à égalité : tous ceux du haut sont marqués", () => {
    const result = pollResult({ options: ["Bleu", "Rouge", "Blanc"], counts: [9, 9, 2] });
    expect(result?.tie).toBe(true);
    expect(result?.rows.map((r) => r.lead)).toEqual([true, true, false]);
  });

  it("marque les trois choix du haut quand ils sont à égalité", () => {
    const result = leads([4, 4, 1, 4]);
    expect(result?.tie).toBe(true);
    expect(result?.rows.map((r) => r.lead)).toEqual([true, true, false, true]);
  });

  it("ne marque rien pour une égalité plus bas que le premier", () => {
    const result = leads([5, 2, 2]);
    expect(result?.tie).toBe(false);
    expect(result?.rows.map((r) => r.lead)).toEqual([true, false, false]);
  });

  it("met en tête, seul, le choix qui a l'unique voix", () => {
    const result = leads([0, 1, 0]);
    expect(result).toMatchObject({ total: 1, tie: false });
    expect(result?.rows.map((r) => r.lead)).toEqual([false, true, false]);
    expect(result?.rows.map((r) => r.shareText)).toEqual([pct("0 %"), pct("100 %"), pct("0 %")]);
  });

  it("ne marque rien et n'écrit aucune part tant que personne n'a voté", () => {
    const result = pollResult({ options: ["Oui", "Non"], counts: [0, 0] });
    expect(result).toMatchObject({ total: 0, tie: false });
    expect(result?.rows.some((r) => r.lead)).toBe(false);
    expect(result?.rows.map((r) => r.shareText)).toEqual(["", ""]);
    expect(result?.rows.map((r) => r.bar)).toEqual([0, 0]);
  });

  it("ne donne aucun résultat si les totaux ne sont pas lisibles : un total absent n'est pas zéro", () => {
    expect(pollResult({ options: ["A", "B"], counts: [3] })).toBeNull();
    expect(pollResult({ options: ["A", "B"] })).toBeNull();
    expect(pollResult({ options: ["A", "B"], counts: [null, 3] })).toBeNull();
    expect(pollResult({ options: ["A", "B"], counts: [Number.NaN, 3] })).toBeNull();
    expect(pollResult({ options: ["A", "B"], counts: null })).toBeNull();
  });
});

describe("les parts en pour cent", () => {
  it("gardent l'arrondi du QG (polls.ts) entre les deux bouts", () => {
    const counts = [128, 97, 64, 12, 3, 0];
    const result = leads(counts);
    const qg = pollRows({ options: counts.map(String), counts }).rows.map((r) => r.share);
    expect(result?.rows.map((r) => r.share)).toEqual(qg);
    expect(result?.rows.map((r) => r.shareText)).toEqual(["42 %", "32 %", "21 %", "4 %", "1 %", "0 %"].map(pct));
  });

  it("n'affichent jamais 0 % pour un choix qui a des voix, ni 100 % pour un choix qui ne les a pas toutes", () => {
    expect(leads([1, 999])?.rows.map((r) => r.shareText)).toEqual([pct("moins de 1 %"), pct("plus de 99 %")]);
    expect(leads([2, 997, 1])?.rows.map((r) => r.shareText)).toEqual([pct("moins de 1 %"), pct("plus de 99 %"), pct("moins de 1 %")]);
  });

  it("disent 100 % seulement quand un choix a toutes les voix, et 0 % seulement sans aucune voix", () => {
    expect(leads([7, 0])?.rows.map((r) => r.shareText)).toEqual([pct("100 %"), pct("0 %")]);
    expect(fmtPollShare({ count: 0, share: 0 }, 1000)).toBe(pct("0 %"));
  });

  it("ne sont pas retouchées pour faire 100 à elles toutes : chacune reste au plus près de sa vraie valeur", () => {
    const thirds = leads([1, 1, 1]);
    expect(thirds?.rows.map((r) => r.share)).toEqual([33, 33, 33]);
    expect(leads([4, 11, 7, 1])?.rows.map((r) => r.share)).toEqual([17, 48, 30, 4]);
    const eighths = leads([1, 1, 1, 1, 1, 1, 1, 1])?.rows.map((r) => r.share) ?? [];
    expect(eighths.every((s) => s === 13)).toBe(true);
    expect(eighths.reduce((a: number, b) => a + (b ?? 0), 0)).toBe(104);
  });

  it("n'écrivent rien sans base", () => {
    expect(fmtPollShare({ count: 0, share: null }, 0)).toBe("");
  });

  it("tracent les barres à la vraie proportion, sans arrondi", () => {
    const bars = leads([1, 2])?.rows.map((r) => r.bar) ?? [];
    expect(bars[0]).toBeCloseTo(100 / 3, 6);
    expect(bars[1]).toBeCloseTo(200 / 3, 6);
    expect(leads([1, 999])?.rows[0]?.bar).toBeCloseTo(0.1, 6);
  });
});

describe("le repère du choix du haut et la couleur d'un sondage", () => {
  it("dit « En tête » en vert pour un seul choix, « Égalité » en jaune pour plusieurs", () => {
    expect(leadMark(false)).toEqual({ label: "En tête", ton: "ok" });
    expect(leadMark(true)).toEqual({ label: "Égalité", ton: "warn" });
  });

  it("est verte ouvert, grise fermé, jaune si les totaux ne se lisent pas", () => {
    expect(pollTon({ is_open: true, options: ["A", "B"], counts: [1, 0] })).toBe("ok");
    expect(pollTon({ is_open: false, options: ["A", "B"], counts: [1, 0] })).toBe("muted");
    expect(pollTon({ is_open: true, options: ["A", "B"], counts: [1] })).toBe("warn");
    expect(pollTon({ is_open: false, options: ["A", "B"] })).toBe("warn");
  });

  it("donne aux filtres la couleur de leur état", () => {
    expect(POLL_FILTERS.map((f) => [f.id, f.ton])).toEqual([
      ["all", undefined],
      ["open", "ok"],
      ["closed", "muted"],
    ]);
  });
});

describe("les filtres et le nombre de sondages ouverts", () => {
  it("comptent les sondages ouverts et fermés", () => {
    expect(pollFilterCounts([open, closed, closed])).toEqual({ all: 3, open: 1, closed: 2 });
    expect(pollFilterCounts([])).toEqual({ all: 0, open: 0, closed: 0 });
    expect(inPollFilter(open, "all")).toBe(true);
    expect(inPollFilter(open, "open")).toBe(true);
    expect(inPollFilter(open, "closed")).toBe(false);
    expect(inPollFilter(closed, "closed")).toBe(true);
    expect(inPollFilter(closed, "open")).toBe(false);
  });

  it("annoncent combien de sondages restent après un filtre, accordé", () => {
    expect(pollFilterAnnouncement(3, "open")).toBe("3 sondages pour ce choix.");
    expect(pollFilterAnnouncement(1, "closed")).toBe("1 sondage pour ce choix.");
    expect(pollFilterAnnouncement(0, "open")).toBe("0 sondage pour ce choix.");
    expect(pollFilterAnnouncement(8, "all")).toBe("");
  });

  it("ne donnent pas le nombre d'ouverts quand la liste a pu être coupée", () => {
    expect(openPollCount([open, open, closed])).toBe(2);
    expect(openPollCount([])).toBe(0);
    expect(openPollCount(Array.from({ length: POLLS_LIMIT - 1 }, () => open))).toBe(POLLS_LIMIT - 1);
    expect(openPollCount(Array.from({ length: POLLS_LIMIT }, () => closed))).toBeNull();
  });

  it("écrivent « 2 ouverts sur 3 », en jaune à la limite", () => {
    expect(openPollsBadge(0)).toEqual({ text: "0 ouvert sur 3", ton: "ok", full: false });
    expect(openPollsBadge(1)).toEqual({ text: "1 ouvert sur 3", ton: "ok", full: false });
    expect(openPollsBadge(2)).toEqual({ text: "2 ouverts sur 3", ton: "ok", full: false });
    expect(openPollsBadge(3)).toEqual({ text: "3 ouverts sur 3", ton: "warn", full: true });
  });
});

describe("la date d'un sondage", () => {
  it("est la fin prévue d'un sondage ouvert, la fermeture d'un sondage fermé", () => {
    expect(pollEnd({ is_open: true, closes_at: "2026-11-20T20:00:00Z", closed_at: null })).toBe("2026-11-20T20:00:00Z");
    expect(pollEnd({ is_open: true, closes_at: null, closed_at: null })).toBeNull();
    expect(pollEnd({ is_open: false, closes_at: "2026-11-20T20:00:00Z", closed_at: "2026-11-18T10:00:00Z" })).toBe("2026-11-18T10:00:00Z");
    expect(pollEnd({ is_open: false, closes_at: "2026-11-20T20:00:00Z", closed_at: null })).toBe("2026-11-20T20:00:00Z");
  });

  it("s'écrit « jusqu'au … » pour un sondage ouvert, à l'heure de Paris, même le lendemain en temps universel", () => {
    const iso = "2026-11-20T23:30:00Z"; // 21 novembre, 0 h 30 à Paris (heure d'hiver)
    const text = pollWhen({ is_open: true, closes_at: iso, closed_at: null });
    expect(text).toBe(`jusqu'au ${fmtDateTime(iso)}`);
    expect(text).toMatch(/^jusqu'au 21 nov\. 2026\D+00:30$/);
  });

  it("s'écrit « le … » pour un sondage fermé, à l'heure d'été de Paris", () => {
    const iso = "2026-07-01T22:30:00Z"; // 2 juillet, 0 h 30 à Paris (heure d'été)
    expect(pollWhen({ is_open: false, closes_at: "2026-07-05T10:00:00Z", closed_at: iso })).toMatch(/^le 2 juil\. 2026\D+00:30$/);
    expect(pollWhen({ is_open: false, closes_at: iso, closed_at: null })).toMatch(/^le 2 juil\. 2026\D+00:30$/);
  });

  it("dit « sans date de fin » pour un sondage ouvert sans fin, et rien pour un sondage fermé sans date", () => {
    expect(pollWhen({ is_open: true, closes_at: null, closed_at: null })).toBe("sans date de fin");
    expect(pollWhen({ is_open: false, closes_at: null, closed_at: null })).toBeNull();
  });
});

describe("les bornes de la fin du vote", () => {
  const minute = 60_000;
  const back = (local: string) => new Date(local).getTime();

  it("commencent à la minute qui suit et s'arrêtent à 90 jours, à l'heure du navigateur", () => {
    const now = Date.parse("2026-11-14T10:00:30.500Z");
    const { min, max } = pollEndBounds(now);
    expect(min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(max).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(back(min)).toBe(Date.parse("2026-11-14T10:01:00Z"));
    expect(back(max)).toBe(Date.parse("2027-02-12T10:00:00Z"));
  });

  it("ne proposent jamais la minute en cours, que le serveur refuserait", () => {
    const now = Date.parse("2026-11-14T10:00:00.000Z");
    const { min, max } = pollEndBounds(now);
    expect(back(min)).toBeGreaterThan(now);
    expect(back(min) - now).toBeLessThanOrEqual(minute);
    expect(back(max)).toBeLessThanOrEqual(now + 90 * 86_400_000);
  });
});
