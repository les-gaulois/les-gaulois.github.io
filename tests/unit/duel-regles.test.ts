import { describe, expect, it } from "vitest";
import { MANCHES_AU_PLUS, P, atoutsDe, camp, carte, cartesDeLaMain, fatigueDe, forceJouee, jouerUnDuel, libres, manche, panopliesDe, prixDeLaMain, refusDeLaMain, verdict, vieDeLaMain } from "../../supabase/functions/code-discord/duel/index";
import type { Camp, Carte, MainParEmplacement } from "../../supabase/functions/code-discord/duel/index";
import { hasardDEssai, joueurAuHasard, mainAuHasard, GARDE_ROBES } from "../../src/lib/village/essai-duel";

/** La main de base : gourdin, bonnet, tunique, bottes, braies. */
const BASE: MainParEmplacement = { arme: "gourdin", tete: "bonnet", haut: "tunique", pieds: "bottes", bas: "braies" };
const main = (m: Partial<MainParEmplacement> = {}): Carte[] => cartesDeLaMain({ ...BASE, ...m });

describe("les cartes", () => {
  it("prennent leur rôle de l'emplacement, leur prix de la rareté, et deux de force en plus", () => {
    const g = carte("gourdin");
    expect([g.role, g.c, g.f, g.repos]).toEqual(["frappe", 0, 2, 2]);
    const e = carte("epee");
    expect([e.r, e.c, e.f]).toEqual(["epique", 3, 5]);
    expect(carte("bonnet").role).toBe("tete");
    expect(carte("tunique").role).toBe("garde");
    expect(carte("bottes").role).toBe("elan");
    expect(carte("braies").role).toBe("souffle");
    expect(carte("couronne-solstice").c).toBe(5);
    expect(carte("ogive").c).toBe(6);
  });

  it("se reposent selon leurs mots-clés : vif une manche, lourd trois avec deux de force en plus, infatigable jamais", () => {
    const vif = carte("sandales"), lourd = carte("heaume-couronne"), plume = carte("plume-or");
    expect(vif.mots.vif).toBe(1);
    expect(vif.repos).toBe(1);
    expect(lourd.mots.lourd).toBe(1);
    expect([lourd.repos, lourd.f]).toEqual([3, lourd.c + 4]);
    expect(plume.repos).toBe(0);
  });

  it("refusent un objet inconnu", () => {
    expect(() => carte("pas-un-objet")).toThrow();
  });
});

describe("la main", () => {
  it("vaut 18 de vie, plus 2 par point de bourse gardé", () => {
    expect(vieDeLaMain(main())).toBe(18 + 12 * 2);
    expect(vieDeLaMain(main({ arme: "epee-or" }))).toBe(18 + 7 * 2);
  });

  it("est légale avec une carte par emplacement, à sa place, dans la bourse de 12", () => {
    expect(refusDeLaMain(BASE)).toBeNull();
    expect(refusDeLaMain({ ...BASE, arme: "inconnu" })).toBe("main_invalide");
    expect(refusDeLaMain({ ...BASE, arme: "bonnet" })).toBe("main_invalide");
    expect(refusDeLaMain({ ...BASE, arme: "panneau-d-erreur", tete: "ogive", haut: "fuselage" })).toBe("main_trop_chere");
    expect(refusDeLaMain({ ...BASE, tete: "ogive", haut: "fuselage" })).toBeNull();
    expect(prixDeLaMain(main({ tete: "ogive", haut: "fuselage" }))).toBe(P.BOURSE);
  });

  it("réunit une panoplie avec assez de pièces, et ses atouts s'ajoutent à ceux du compagnon et du lieu", () => {
    const fusee = main({ tete: "ogive", haut: "fuselage" });
    expect(panopliesDe(fusee)).toEqual(["fusee"]);
    expect(atoutsDe(fusee, { compagnon: "Forêt", lieu: "legendes" })).toEqual({ premierCoup: 5, energieDepart: 2 });
    expect(camp(fusee, { compagnon: "Forêt", lieu: "legendes" }).energie).toBe(5);
    expect(panopliesDe(main({ tete: "ogive" }))).toEqual([]);
    expect(atoutsDe(main(), { passifs: [{ vie: 2 }, { vie: 1, rage: 1 }] })).toEqual({ vie: 3, rage: 1 });
  });
});

describe("la manche", () => {
  const deux = (ma: Carte[], mb: Carte[]): [Camp, Camp] => [camp(ma), camp(mb)];

  it("la garde arrête le coup et le renvoie", () => {
    const [a, b] = deux(main(), main());
    const r = manche(a, b, 0, 2, 1); // gourdin (force 2) contre tunique (garde 2)
    expect(r.fb.pare).toBe(2);
    expect(r.fa.degats).toBe(0);
    expect(r.fa.subis).toBe(2);
    expect(r.a.vie).toBe(a.vie - 2);
    expect(r.b.vie).toBe(b.vie);
  });

  it("un coup qui porte fait perdre sa force et donne un d'élan au coup suivant", () => {
    const [a, b] = deux(main(), main());
    const r = manche(a, b, 0, 4, 1); // gourdin contre braies (souffle)
    expect(r.fa.degats).toBe(2);
    expect(r.a.elan).toBe(P.ENCHAINEMENT);
    expect(forceJouee(r.a, r.a.main[1]!, r.b)).toBe(2 + P.ENCHAINEMENT);
  });

  it("le coup de tête coûte un de vie et coupe le souffle d'en face", () => {
    const [a, b] = deux(main(), main());
    const r = manche(a, b, 1, 4, 1);
    expect(r.fa.recul).toBe(1);
    expect(r.fb.coupe).toBe(true);
    expect(r.fb.soin).toBe(0);
  });

  it("une carte jouée se repose deux manches, et l'énergie remonte de trois jusqu'au plafond de six", () => {
    const [a, b] = deux(main({ arme: "epee" }), main());
    const r = manche(a, b, 0, 2, 1);
    expect(r.a.repos).toEqual([2, 0, 0, 0, 0]);
    expect(r.a.energie).toBe(Math.min(P.ENERGIE_PLAFOND, P.ENERGIE_DEPART - 3 + P.ENERGIE_PAR_MANCHE));
    const r2 = manche(r.a, r.b, 1, 2, 2);
    expect(r2.a.repos).toEqual([1, 2, 0, 0, 0]);
  });

  it("une carte trop chère pour l'énergie qui reste se joue essoufflée : force un, sans mot-clé", () => {
    const [a, b] = deux(main({ arme: "panneau-d-erreur", haut: "fuselage" }), main());
    const essoufle = { ...a, energie: 2 };
    const r = manche(essoufle, b, 0, 4, 1);
    expect(r.fa.essouffle).toBe(true);
    expect(r.fa.force).toBe(P.FORCE_ESSOUFFLEE);
    expect(r.fa.paye).toBe(2);
    expect(r.fa.mots).toEqual({});
  });

  it("la fatigue frappe dès la sixième manche : un, puis deux, puis trois", () => {
    expect([5, 6, 7, 8].map((m) => fatigueDe(m))).toEqual([0, 1, 2, 3]);
    const [a, b] = deux(main(), main());
    expect(manche(a, b, 2, 2, 6).fatigue).toEqual({ a: 1, b: 1 });
    expect(fatigueDe(6, camp(main(), { lieu: "cartes" }))).toBe(0);
  });

  it("le saignement coûte un de vie par manche, à partir de la suivante", () => {
    const [a, b] = deux(main({ arme: "epee" }), main());
    const r = manche(a, b, 0, 4, 1);
    expect(r.fa.evts.some((e) => e.mot === "saigne")).toBe(true);
    expect(r.b.saignes).toEqual([{ n: 1, t: carte("epee").mots.saigne, neuf: false }]);
    const r2 = manche(r.a, r.b, 2, 2, 2);
    expect(r2.fb.saignement).toBe(1);
  });

  it("ne touche pas aux camps qu'on lui donne", () => {
    const [a, b] = deux(main({ arme: "epee" }), main());
    const avant = JSON.stringify([a, b]);
    manche(a, b, 0, 0, 1);
    expect(JSON.stringify([a, b])).toBe(avant);
  });
});

describe("le duel", () => {
  it("le verdict : celui qui reste debout gagne ; si les deux tombent, celui qui tombe de moins haut", () => {
    expect(verdict({ vie: 3 }, { vie: 0 })).toBe(1);
    expect(verdict({ vie: -1 }, { vie: 2 })).toBe(-1);
    expect(verdict({ vie: -1 }, { vie: -3 })).toBe(1);
    expect(verdict({ vie: -2 }, { vie: -2 })).toBe(0);
    expect(verdict({ vie: 4 }, { vie: 5 })).toBe(0);
  });

  it("quand toutes les cartes se reposent, celles qui ont le moins de repos restent jouables", () => {
    expect(libres({ repos: [0, 2, 1, 0, 3] })).toEqual([0, 3]);
    expect(libres({ repos: [2, 1, 3, 1, 4] })).toEqual([1, 3]);
  });

  it("finit toujours, avant la limite de manches, au hasard comme entre mains tirées au hasard", () => {
    const alea = hasardDEssai(4242), h = joueurAuHasard(alea);
    let pire = 0;
    for (let i = 0; i < 300; i++) {
      const d = jouerUnDuel(mainAuHasard(GARDE_ROBES.divine!, true, alea), mainAuHasard(GARDE_ROBES.riche!, true, alea), h, h, { compagnon: "Drôles" }, { lieu: "front" });
      expect(d.derniere?.fini).toBe(true);
      pire = Math.max(pire, d.manches);
    }
    expect(pire).toBeLessThan(MANCHES_AU_PLUS);
  });
});
