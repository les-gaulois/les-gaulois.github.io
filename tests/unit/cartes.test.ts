import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheDesFinitions, finitionsDuCache, journalDesFinitions, lireFinitionsDesJoueurs } from "../../src/lib/finitions-joueurs";
import { FINITIONS, FINITIONS_ANIMEES } from "../../src/lib/fx/finitions-carte";
import { empreinte } from "../../src/lib/gaulois-joueurs";
import { CARTES, REFLETS, finitionParId, lireMesCartes, refusDeCarte } from "../../src/lib/village/cartes";
import { PLACE_DE_LA_BANNIERE, volVersLeDecor } from "../../src/lib/village/livre-bannieres";
import { VIGNETTE_HAUTEUR, VIGNETTE_LARGEUR, lireLePng, vignetteDeLaCarte } from "../../src/lib/village/cartes-vignettes";
import { lireReponseDesAchats, nouveautes, titreEnMots, vignetteDeLAchat, choseDe } from "../../src/lib/achats-discord";

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
    // La fiche du rayon : une phrase par finition, courte et terminée.
    for (const c of CARTES) {
      expect(c.description.length, c.id).toBeGreaterThan(20);
      expect(c.description.length, c.id).toBeLessThanOrEqual(110);
      expect(c.description, c.id).toMatch(/[.»]$/);
    }
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

describe("les reflets et l'inclinaison de la carte", () => {
  it("ne fait glisser que l'arc-en-ciel offert, jamais la feuille d'un reflet acheté", () => {
    // La compression de la feuille supprimait un « translate: none » : la règle du glissement vise donc les seules cartes
    // sans reflet, au lieu d'être annulée ensuite. Sans cela, un reflet glissait hors de la carte en s'inclinant.
    expect(FEUILLE).toContain(".podium-carte:not([data-reflet]) .podium-carte-holo {");
    const base = FEUILLE.slice(FEUILLE.indexOf("}\n.podium-carte-holo {"), FEUILLE.indexOf(".podium-carte:not([data-reflet]) .podium-carte-holo {"));
    // Sans les commentaires de la feuille, qui racontent l'ancienne règle.
    expect(base.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("translate:");
    // Un motif qui suit l'inclinaison ne se déplace pas de plus de 45 % : au-delà, sa couture se verrait.
    const reflets = FEUILLE.slice(FEUILLE.indexOf("/* Les dix reflets du rayon"), FEUILLE.indexOf("@keyframes podium-reflet-braise"));
    for (const m of reflets.matchAll(/var\(--carte-m[xy]\) \* (\d+)%/g)) expect(Number(m[1])).toBeLessThanOrEqual(45);
  });
});

describe("le livre des bannières avec un autre dessin", () => {
  it("fait voler une vignette vers la place d'une bannière par défaut, et vers celle d'une carte si on la donne", () => {
    const livre = { largeur: 1000, hauteur: 800 };
    const vignette = { x: 100, y: 500, largeur: 100 };
    expect(volVersLeDecor(livre, vignette)).toEqual(volVersLeDecor(livre, vignette, PLACE_DE_LA_BANNIERE));
    // Une carte : un quart de la largeur du livre, au milieu, plus haute que large.
    const vol = volVersLeDecor(livre, vignette, { gauche: 0.375, largeur: 0.25, hauteurSurLargeur: 160 / 96 });
    expect(vol?.echelle).toBeCloseTo(2.5);
    expect(vol?.dx).toBeCloseTo(275);
    expect(vol?.dy).toBeCloseTo(400 - 250 * (160 / 96) - 500);
  });
});

describe("les images fixes des finitions, pour l'annonce des achats sur Discord", () => {
  it("a une image de 48 sur 80 pour chacune des trente-trois finitions, sans case vide", () => {
    for (const c of CARTES) {
      const v = vignetteDeLaCarte(c.id);
      expect(v, c.id).not.toBeNull();
      expect([v?.largeur, v?.hauteur], c.id).toEqual([VIGNETTE_LARGEUR, VIGNETTE_HAUTEUR]);
      expect(v?.cases.every((couleur) => couleur !== null && /^#[0-9a-f]{6}$/.test(couleur)), c.id).toBe(true);
    }
    expect(vignetteDeLaCarte("nexiste-pas")).toBeNull();
    expect(vignetteDeLaCarte("radar", "dossier/absent")).toBeNull();
    expect(lireLePng(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("annonce une finition achetée à la boutique, avec son image, son nom et sa rareté", () => {
    const achat = { emplacement: "carte", objet: "champignon-atomique" } as const;
    expect(choseDe(achat)).toEqual({ nom: "Champignon atomique", rarete: "legendaire", place: "finition de carte" });
    expect(vignetteDeLAchat(achat)?.largeur).toBe(VIGNETTE_LARGEUR);
    expect(nouveautes([achat])).toBe("1 nouvelle finition de carte");
    expect(nouveautes([achat, achat])).toBe("2 nouvelles finitions de carte");
    const ligne = { id: 1, nature: "achat", emplacement: "carte", objet: "radar", compte: 7, nom: "Gaulois n° 7", discord: "Exemple", le: "2026-11-17T20:05:00.000Z" };
    expect(titreEnMots({ nom: "Gaulois n° 7", discord: "Exemple", achats: [{ ...ligne, nature: "achat", emplacement: "carte" }] }, "@Exemple")).toBe("@Exemple a une nouvelle finition de carte");
    // Le serveur : la finition est lue ; sous une autre nature, ou inconnue du rayon, la ligne est écartée.
    const lue = lireReponseDesAchats({ ok: true, jusqu_a: 3, achats: [ligne, { ...ligne, id: 2, nature: "pochette" }, { ...ligne, id: 3, objet: "nexiste-pas" }] });
    expect(lue?.achats.map((a) => [a.id, a.emplacement, a.objet])).toEqual([[1, "carte", "radar"]]);
  });
});

describe("le régime économe des cartes", () => {
  it("compte comme lente une fenêtre où plus de la moitié des images ont mis plus de 34 millièmes de seconde", async () => {
    const { fenetreLente, imageLente } = await import("../../src/scripts/cartes-mouvement");
    // 60 et 30 images par seconde : des images à l'heure. 27 et 4 : des images lentes.
    expect([16.7, 33.3].map(imageLente)).toEqual([false, false]);
    expect([37, 250].map(imageLente)).toEqual([true, true]);
    // Un à-coup isolé dans une fenêtre fluide ne compte pas ; une page qui rame, si. Il faut deux fenêtres de suite.
    expect(fenetreLente(3, 100)).toBe(false);
    expect(fenetreLente(50, 100)).toBe(false);
    expect(fenetreLente(51, 100)).toBe(true);
    expect(fenetreLente(8, 8)).toBe(true);
    expect(fenetreLente(2, 2)).toBe(false);
  });
});
