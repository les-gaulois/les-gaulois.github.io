import { describe, expect, it } from "vitest";
import { BackupError, MIN_PASSPHRASE, SCRYPT, backupName, backupSummary, backupWeekStart, open, passphraseProblem, seal, type ScryptSettings } from "../../src/lib/sauvegarde";

const PASS = "Brume-Falaise-Hibou-Carte-Lanterne-92";
// Des réglages plus rapides pour les tests : le fichier porte les siens, que `open` relit.
const FAST: ScryptSettings = { logN: 14, r: 8, p: 1 };
const content = Buffer.from(JSON.stringify({ profiles: [{ display_name: "Essai" }], polls: [] }));
const sealFast = (plain: Buffer, pass = PASS) => seal(plain, pass, undefined, FAST);

describe("la sauvegarde chiffrée", () => {
  it("se rouvre avec la bonne phrase, à l'identique", () => {
    expect(open(sealFast(content), PASS).equals(content)).toBe(true);
  });

  it("porte ses réglages : par défaut, scrypt à N = 2^18", () => {
    expect(SCRYPT).toEqual({ logN: 18, r: 8, p: 1 });
    const sealed = seal(content, PASS);
    expect([...sealed.subarray(8, 11)]).toEqual([18, 8, 1]);
    expect(open(sealed, PASS).equals(content)).toBe(true);
  });

  it("ne laisse rien lire en clair, et change à chaque sauvegarde", () => {
    const a = sealFast(content);
    const b = sealFast(content);
    expect(a.toString("latin1")).not.toContain("Essai");
    expect(a.subarray(0, 8).toString("ascii")).toBe("GALSAUV1");
    expect(a.equals(b)).toBe(false);
  });

  it("refuse une phrase fausse, un en-tête ou un contenu modifiés, ou un autre fichier", () => {
    const sealed = sealFast(content);
    expect(() => open(sealed, `${PASS} !`)).toThrow(BackupError);
    for (const at of [12, 30, sealed.length - 1]) {
      const tampered = Buffer.from(sealed);
      tampered[at] = (tampered[at] ?? 0) ^ 1;
      expect(() => open(tampered, PASS), `octet ${at}`).toThrow(BackupError);
    }
    // Des réglages de scrypt hors des bornes ne sont même pas essayés.
    const absurd = Buffer.from(sealed);
    absurd[8] = 40;
    expect(() => open(absurd, PASS)).toThrow(BackupError);
    expect(() => open(Buffer.from("pas une sauvegarde du tout, mais un texte assez long pour l'en-tête"), PASS)).toThrow("Ce fichier n'est pas une sauvegarde du site.");
  });

  it("ne tient pas compte d'un retour à la ligne collé avec la phrase", () => {
    expect(open(sealFast(content, `${PASS}\n`), PASS).equals(content)).toBe(true);
  });

  it("refuse une phrase de passe trop courte ou trop simple", () => {
    expect(passphraseProblem("x".repeat(MIN_PASSPHRASE - 1))).toMatch(/au moins/);
    expect(passphraseProblem("lesgauloislesgaulois")).toMatch(/trop simple/);
    expect(passphraseProblem(PASS)).toBeNull();
    expect(() => sealFast(content, "lesgauloislesgaulois")).toThrow(BackupError);
  });

  it("donne le jour à son fichier", () => {
    expect(backupName(new Date("2026-11-09T03:41:00Z"))).toBe("gal-sauvegarde-2026-11-09.bin");
  });

  it("résume une sauvegarde ouverte par ses seuls nombres de lignes", () => {
    const summary = backupSummary({ profiles: [{ display_name: "Essai" }, { display_name: "Autre" }], polls: [], welcome: { text: "Bienvenue" } });
    expect(summary).toBe("profiles 2, polls 0");
    expect(summary).not.toContain("Essai");
    expect(() => backupSummary([1, 2])).toThrow(BackupError);
    expect(() => backupSummary(null)).toThrow(BackupError);
  });

  it("fait commencer la semaine de sauvegarde le lundi à 3 h UTC", () => {
    const start = (iso: string) => backupWeekStart(new Date(iso)).toISOString();
    // Le 9 novembre 2026 est un lundi.
    expect(start("2026-11-09T06:33:00Z")).toBe("2026-11-09T03:00:00.000Z");
    expect(start("2026-11-09T03:00:00Z")).toBe("2026-11-09T03:00:00.000Z");
    expect(start("2026-11-09T02:59:59Z")).toBe("2026-11-02T03:00:00.000Z");
    expect(start("2026-11-11T12:00:00Z")).toBe("2026-11-09T03:00:00.000Z");
    expect(start("2026-11-15T23:30:00Z")).toBe("2026-11-09T03:00:00.000Z");
    // Au passage d'une année : le vendredi 1er janvier 2027 est dans la semaine du lundi 28 décembre.
    expect(start("2027-01-01T10:00:00Z")).toBe("2026-12-28T03:00:00.000Z");
  });
});
