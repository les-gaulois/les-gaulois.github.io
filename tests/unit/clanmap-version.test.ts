import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adresseVersionnee } from "../../src/lib/clanmap/adresse";
import { versionDeLaCarte } from "../../src/lib/clanmap/version";

describe("la version des fichiers de la carte", () => {
  const dossiers: string[] = [];
  const dossier = () => {
    const d = mkdtempSync(join(tmpdir(), "gal-carte-"));
    dossiers.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("reste la même tant que les fichiers ne changent pas", () => {
    const d = dossier();
    writeFileSync(join(d, "film.json"), "{}");
    writeFileSync(join(d, "terrain.webp"), "fond");
    const v = versionDeLaCarte(d);
    expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(versionDeLaCarte(d)).toBe(v);
  });

  it("change dès qu'un fichier change, apparaît ou disparaît", () => {
    const d = dossier();
    writeFileSync(join(d, "film.json"), "{}");
    writeFileSync(join(d, "terrain.webp"), "fond sombre");
    const avant = versionDeLaCarte(d);
    writeFileSync(join(d, "terrain.webp"), "fond bleu");
    const bleu = versionDeLaCarte(d);
    expect(bleu).not.toBe(avant);
    writeFileSync(join(d, "vagues.webp"), "vagues");
    expect(versionDeLaCarte(d)).not.toBe(bleu);
    // Un fichier que la page ne lit pas ne compte pas.
    const v = versionDeLaCarte(d);
    writeFileSync(join(d, "autre.txt"), "rien");
    expect(versionDeLaCarte(d)).toBe(v);
    // Le fichier des vagues disparaît : la version redevient celle d'avant lui.
    rmSync(join(d, "vagues.webp"));
    expect(versionDeLaCarte(d)).toBe(bleu);
  });

  it("n'existe pas sans fichier", () => {
    expect(versionDeLaCarte(dossier())).toBeNull();
    expect(versionDeLaCarte(join(tmpdir(), "gal-carte-absent-a1b2c3"))).toBeNull();
  });

  it("s'ajoute à l'adresse de chaque fichier, quand elle est connue", () => {
    expect(adresseVersionnee("/generated/carte/", "terrain.webp", "0123456789ab")).toBe("/generated/carte/terrain.webp?v=0123456789ab");
    expect(adresseVersionnee("/generated/carte/", "terrain.webp", null)).toBe("/generated/carte/terrain.webp");
    expect(adresseVersionnee("/generated/carte/", "terrain.webp", undefined)).toBe("/generated/carte/terrain.webp");
    expect(adresseVersionnee("/generated/carte/", "terrain.webp", "")).toBe("/generated/carte/terrain.webp");
  });
});
