import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gauloisLusLe } from "../../src/lib/gaulois-joueurs";

// La date du relevé des Gaulois, écrite sous la vitrine des visiteurs de « Mon Gaulois » (18 novembre 2026).
describe("gauloisLusLe", () => {
  const dossier = mkdtempSync(join(tmpdir(), "gaulois-lus-le-"));
  const fichier = (nom: string, contenu: string) => {
    const chemin = join(dossier, nom);
    writeFileSync(chemin, contenu);
    return chemin;
  };

  it("rend la date d'un relevé lisible", () => {
    expect(gauloisLusLe(fichier("bon.json", JSON.stringify({ version: 1, luLe: "2026-11-18T10:54:00.000Z", gaulois: {} })))).toBe("2026-11-18T10:54:00.000Z");
  });

  it("ne rend rien sans relevé, d'une autre version, ou avec une date illisible", () => {
    expect(gauloisLusLe(join(dossier, "absent.json"))).toBeNull();
    expect(gauloisLusLe(fichier("casse.json", "{"))).toBeNull();
    expect(gauloisLusLe(fichier("version.json", JSON.stringify({ version: 2, luLe: "2026-11-18T10:54:00.000Z", gaulois: {} })))).toBeNull();
    expect(gauloisLusLe(fichier("date.json", JSON.stringify({ version: 1, luLe: "hier", gaulois: {} })))).toBeNull();
  });
});
