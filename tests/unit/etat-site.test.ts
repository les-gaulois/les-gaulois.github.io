import { describe, expect, it } from "vitest";
import { ROSTER_MAX_AGE_HOURS, RUN_MAX_AGE_HOURS, SOURCES, ago, heureDeCollecte, siteHealth, sourceHealth, type SiteHealthInput } from "../../src/lib/etat-site";
import { MAX_AGE_HOURS } from "../../src/lib/freshness";
import { emptyMeta, type Meta } from "../../src/lib/schemas";

const NOW = new Date("2026-11-08T10:00:00Z");
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const ok = (minutes: number) => ({ lastSuccessAt: before(minutes), lastErrorAt: null, lastError: null });

function freshMeta(): Meta {
  const meta = emptyMeta();
  meta.lastRunAt = before(20);
  for (const { key } of SOURCES) Object.assign(meta[key], ok(20));
  return meta;
}
const input = (over: Partial<SiteHealthInput> = {}): SiteHealthInput => ({
  meta: freshMeta(),
  gazette: { lastSent: "2026-11-02", sentAt: before(60 * 25), format: 3 },
  roster: { total: 31, read_at: before(90) },
  ...over,
});
const line = (health: ReturnType<typeof siteHealth>, label: string) => health.lines.find((l) => l.label === label);

describe("ago", () => {
  it("écrit un âge en minutes, en heures, puis en jours", () => {
    expect(ago(-5_000)).toBe("à l'instant");
    expect(ago(30_000)).toBe("à l'instant");
    expect(ago(24 * 60_000)).toBe("il y a 24 min");
    expect(ago(59 * 60_000 + 59_000)).toBe("il y a 59 min");
    expect(ago(60 * 60_000)).toBe("il y a 1 h");
    expect(ago(47 * 3_600_000 + 59 * 60_000)).toBe("il y a 47 h");
    expect(ago(48 * 3_600_000)).toBe("il y a 2 jours");
  });
});

describe("l'état du site", () => {
  it("ne signale rien quand tout est à jour", () => {
    const health = siteHealth(input(), NOW);
    expect(health.level).toBe("ok");
    expect(health.lines.map((l) => l.label)).toEqual(["Collecte des données", "API d'OpenFront", "Liste officielle", "Gazette sur Discord"]);
    expect(line(health, "Collecte des données")?.text).toMatch(/^dernière collecte publiée il y a 20 min \(/);
    // Depuis le 10 novembre 2026, les podiums des joueurs sont une source de plus.
    expect(line(health, "API d'OpenFront")?.text).toBe("les 8 sources sont à jour");
    expect(line(health, "Liste officielle")?.text).toMatch(/^relue il y a 1 h \(.*\), 31 membres$/);
    expect(health.sources.every((s) => s.level === "ok")).toBe(true);
  });

  it("signale un robot qui ne passe plus, au-delà du délai du classement", () => {
    const meta = freshMeta();
    meta.lastRunAt = before(RUN_MAX_AGE_HOURS * 60 + 1);
    const health = siteHealth(input({ meta }), NOW);
    expect(health.level).toBe("warn");
    expect(line(health, "Collecte des données")).toMatchObject({ level: "warn", text: expect.stringMatching(/^en retard : dernière collecte publiée il y a 4 h/) as unknown });

    meta.lastRunAt = null;
    expect(line(siteHealth(input({ meta }), NOW), "Collecte des données")).toMatchObject({ level: "warn", text: "aucune collecte publiée" });
  });

  it("nomme la source de l'API en échec, avec son erreur", () => {
    const meta = freshMeta();
    meta.ranked = { lastSuccessAt: before(180), lastErrorAt: before(10), lastError: "HTTP 503" };
    const health = siteHealth(input({ meta }), NOW);
    expect(health.level).toBe("warn");
    expect(line(health, "API d'OpenFront")).toMatchObject({ level: "warn", text: "1 source à surveiller : Classé" });
    const ranked = health.sources.find((s) => s.key === "ranked");
    expect(ranked?.level).toBe("warn");
    expect(ranked?.text).toMatch(/^en échec depuis le .* \(HTTP 503\) ; dernière lecture réussie il y a 3 h \(/);
  });

  it("juge chaque source avec le délai de sa page, pas un délai commun", () => {
    // 30 h : normal pour la liste des membres, relue moins souvent, mais en retard pour le classement.
    expect(sourceHealth(ok(30 * 60), MAX_AGE_HOURS.members, NOW).level).toBe("ok");
    expect(sourceHealth(ok(30 * 60), MAX_AGE_HOURS.leaderboard, NOW)).toMatchObject({ level: "warn", text: expect.stringMatching(/^en retard : dernière lecture il y a 30 h/) as unknown });
    expect(sourceHealth({ lastSuccessAt: null, lastErrorAt: null, lastError: null }, 4, NOW)).toEqual({ level: "warn", text: "jamais lue" });
    expect(sourceHealth({ lastSuccessAt: null, lastErrorAt: null, lastError: "réseau : timeout" }, 4, NOW)).toEqual({ level: "warn", text: "en échec (réseau : timeout) ; jamais lue" });
  });

  it("ne tient plus compte d'une erreur réparée", () => {
    const meta = freshMeta();
    // Le robot garde l'heure de l'ancienne erreur, mais efface son message au succès suivant.
    meta.clanmap = { lastSuccessAt: before(30), lastErrorAt: before(60 * 30), lastError: null };
    expect(siteHealth(input({ meta }), NOW).level).toBe("ok");
  });

  it("signale une liste officielle jamais relue ou trop ancienne", () => {
    expect(line(siteHealth(input({ roster: null }), NOW), "Liste officielle")).toMatchObject({ level: "warn", text: expect.stringMatching(/^jamais relue/) as unknown });
    const old = siteHealth(input({ roster: { total: 1, read_at: before(ROSTER_MAX_AGE_HOURS * 60 + 5) } }), NOW);
    expect(line(old, "Liste officielle")).toMatchObject({ level: "warn", text: expect.stringMatching(/^en retard : relue il y a 36 h/) as unknown });
    expect(line(siteHealth(input({ roster: { total: 1, read_at: before(5) } }), NOW), "Liste officielle")?.text).toMatch(/, 1 membre$/);
    // Les milliers séparés par l'espace insécable du site.
    expect(line(siteHealth(input({ roster: { total: 1234, read_at: before(5) } }), NOW), "Liste officielle")?.text).toMatch(/, 1 234 membres$/);
  });

  it("dit la dernière gazette envoyée, sans juger de son retard", () => {
    const health = siteHealth(input(), NOW);
    expect(line(health, "Gazette sur Discord")).toMatchObject({ level: "info", text: expect.stringMatching(/^semaine du 2 nov\., envoyée il y a 25 h \(/) as unknown });
    const none = siteHealth(input({ gazette: null }), NOW);
    expect(line(none, "Gazette sur Discord")).toEqual({ label: "Gazette sur Discord", level: "info", text: "aucun envoi noté" });
    expect(none.level).toBe("ok");
  });

  it("lit chaque source que la collecte écrit dans data/meta.json", () => {
    const tracked = Object.keys(emptyMeta()).filter((key) => key !== "lastRunAt");
    expect(SOURCES.map((s) => s.key).sort()).toEqual(tracked.sort());
  });
});

// La ligne du rôle, à la Direction : une heure de collecte ne doit jamais se lire comme celle d'aujourd'hui si elle est d'hier.
describe("l'heure de la dernière collecte", () => {
  it("donne l'heure seule le jour même à Paris, sans retard", () => {
    expect(heureDeCollecte("2026-11-11T19:53:00Z", new Date("2026-11-11T21:10:00Z"))).toEqual({ texte: "20:53", enRetard: false });
  });

  it("date une collecte d'un autre jour à Paris, même à moins d'une heure de distance", () => {
    // 22 h 50 à Paris le 11, lue à 0 h 10 le 12 : l'heure seule ferait croire à une collecte du jour.
    const { texte, enRetard } = heureDeCollecte("2026-11-11T21:50:00Z", new Date("2026-11-11T23:10:00Z"));
    expect(texte).toBe("11 nov., 22:50");
    expect(enRetard).toBe(false);
  });

  it("passe en retard au-delà du délai du robot", () => {
    const base = Date.parse("2026-11-11T08:00:00Z");
    expect(heureDeCollecte("2026-11-11T08:00:00Z", new Date(base + RUN_MAX_AGE_HOURS * 3_600_000)).enRetard).toBe(false);
    expect(heureDeCollecte("2026-11-11T08:00:00Z", new Date(base + RUN_MAX_AGE_HOURS * 3_600_000 + 60_000)).enRetard).toBe(true);
  });
});
