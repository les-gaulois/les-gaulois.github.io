import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheDesFinitions, finitionsDuCache, journalDesFinitions, lireFinitionsDesJoueurs } from "../../src/lib/finitions-joueurs";
import { FINITIONS, FINITIONS_ANIMEES } from "../../src/lib/fx/finitions-carte";
import { empreinte } from "../../src/lib/gaulois-joueurs";
import { CARTES, REFLETS, finitionParId, lireMesCartes, refusDeCarte } from "../../src/lib/village/cartes";

const MIGRATION = readFileSync("supabase/migrations/20261117001200_cartes_du_gaulois.sql", "utf8").replace(/\r\n/g, "\n");
const FEUILLE = readFileSync("src/styles/feuilles/04-poste.css", "utf8");

describe("le rayon « Cartes » de la boutique", () => {
  it("compte trente-trois finitions : dix reflets et vingt-trois animations, toutes dessinées", () => {
    expect(CARTES).toHaveLength(33);
    expect(CARTES.filter((c) => !c.animee).map((c) => c.id).sort()).toEqual([...REFLETS].sort());
    expect(CARTES.filter((c) => c.animee).map((c) => c.id).sort()).toEqual([...FINITIONS_ANIMEES].sort());
    for (const id of FINITIONS_ANIMEES) expect(typeof FINITIONS[id]).toBe("function");
    for (const id of REFLETS) expect(FEUILLE, id).toContain(`.podium-carte[data-finition="${id}"] .podium-carte-holo`);
    for (const c of CARTES) expect(c.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("range les finitions de la plus commune à la plus rare, sans rareté hors de celles des bannières", () => {
    const ordre = ["commun", "peu-commun", "epique", "mystique", "legendaire"];
    const rangs = CARTES.map((c) => ordre.indexOf(c.rarete));
    expect(rangs.every((r) => r >= 0)).toBe(true);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  it("a la même liste que le serveur, finition par finition et rareté par rareté", () => {
    const bloc = MIGRATION.slice(MIGRATION.indexOf("-- <cartes>"), MIGRATION.indexOf("-- </cartes>"));
    const duServeur = [...bloc.matchAll(/\('([a-z-]+)', '([a-z-]+)'\)/g)].map((m) => [m[1], m[2]]);
    expect(duServeur).toEqual(CARTES.map((c) => [c.id, c.rarete]));
  });

  it("vend au prix d'une bannière, sans créer de statères, et refuse l'achat pendant un essai en mode GOD", () => {
    expect(MIGRATION).toContain("v_prix := internal.banniere_prix(v_rarete);");
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'achat', v_prix, 'carte/' || p_finition);");
    expect(MIGRATION).toContain("perform internal.fail('mode_god');");
    // Avant la sauvegarde, reprise ligne pour ligne, rien ne touche au journal des statères autrement que par le débit.
    expect(MIGRATION.slice(0, MIGRATION.indexOf("-- La sauvegarde chiffrée"))).not.toMatch(/village_crediter|stateres_mouvements/);
    // La lecture du site : la clé de service seulement.
    expect(MIGRATION).toContain("grant execute on function public.cartes_des_joueurs(text[]) to service_role;");
    expect(MIGRATION).not.toContain("grant execute on function public.cartes_des_joueurs(text[]) to authenticated");
  });

  it("lit la réponse du serveur, ignore une finition inconnue et ne montre qu'une finition possédée", () => {
    const mes = lireMesCartes({
      ok: true,
      solde: 1200,
      peut_acheter: true,
      prix: { commun: 300, legendaire: 7500, inconnue: 5 },
      finitions: [{ finition: "radar" }, { finition: "nexiste-pas" }, 4],
      porte: "radar",
    });
    expect(mes).toEqual({ solde: 1200, peutAcheter: true, prix: { commun: 300, legendaire: 7500 }, possedees: ["radar"], porte: "radar" });
    expect(lireMesCartes({ ok: true, solde: 0, peut_acheter: false, prix: {}, finitions: [], porte: "plasma" })?.porte).toBeNull();
    expect(lireMesCartes({ ok: false })).toBeNull();
    expect(lireMesCartes({ ok: true, solde: -1, peut_acheter: true, prix: {}, finitions: [] })).toBeNull();
    expect(finitionParId("plasma")?.nom).toBe("Plasma");
    expect(finitionParId("reflet")).toBeNull();
    expect(refusDeCarte("mode_god")).toContain("mode GOD");
    expect(refusDeCarte("autre")).toContain("réessayez");
  });
});

describe("la finition des cartes du podium, lue avant la construction", () => {
  const cle = "clé-de-service";
  it("range les finitions par identifiant, ignore l'inconnu, et n'envoie que des empreintes", async () => {
    const envoyees: string[] = [];
    const lecture = await lireFinitionsDesJoueurs(["a", "b", "c"], "https://exemple.test", cle, (_url, _key, empreintes) => {
      envoyees.push(...empreintes);
      return Promise.resolve({ ok: true, cartes: { [empreinte("a")]: "supernova", [empreinte("b")]: "nexiste-pas" } });
    });
    expect(envoyees).toEqual(["a", "b", "c"].map(empreinte));
    expect([...lecture.finitions]).toEqual([["a", "supernova"]]);
    expect(lecture.etat).toBe("lu");
  });

  it("ne lève jamais : sans réglage, sans la migration ou en panne, aucune finition et un mot sans secret", async () => {
    expect((await lireFinitionsDesJoueurs(["a"], undefined, undefined)).etat).toBe("sans-reglage");
    const absente = await lireFinitionsDesJoueurs(["a"], "https://exemple.test", cle, () => Promise.reject(Object.assign(new Error("x"), { code: "PGRST202" })));
    expect(absente.etat).toBe("fonction-absente");
    expect(journalDesFinitions(absente)).toMatch(/^::notice::/);
    const panne = await lireFinitionsDesJoueurs(["a"], "https://exemple.test", cle, () => Promise.reject(new Error(`refus ${cle}`)));
    expect(panne.etat).toBe("panne");
    expect(journalDesFinitions(panne)).toMatch(/^::warning::/);
    expect(journalDesFinitions(panne)).not.toContain(cle);
  });

  it("garde le fichier par empreinte et le relit pour les seuls identifiants demandés", () => {
    const fichier = join(mkdtempSync(join(tmpdir(), "finitions-")), "finitions.json");
    const cache = cacheDesFinitions(new Map([["a", "radar"]]), new Date("2026-11-17T12:00:00Z"));
    expect(Object.keys(cache.finitions)).toEqual([empreinte("a")]);
    writeFileSync(fichier, JSON.stringify(cache));
    expect([...finitionsDuCache(fichier, ["a", "z"])]).toEqual([["a", "radar"]]);
    expect(finitionsDuCache(join(tmpdir(), "absent.json"), ["a"]).size).toBe(0);
  });
});
