import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { PRIX_PAR_RARETE } from "../../src/lib/village/contrat";
import type { RefusMarche } from "../../src/lib/village/contrat";
import {
  MESSAGES_DU_MARCHE,
  emplacementsEnVente,
  enStateres,
  examinerAchat,
  finDeLOffre,
  lireBoutique,
  lireMarche,
  lirePrix,
  mesOffres,
  messageDuMarche,
  objetDuMarche,
  offresAAcheter,
  seVend,
} from "../../src/lib/village/ecran-marche";

const offre = (id: number, emplacement: string, objet: string, prix: number, aMoi = false) => ({ id, emplacement, objet, prix, vendeur: `Vendeur ${id}`, a_moi: aMoi, expire_le: "2026-11-27T12:00:00.000Z" });
const MARCHE = {
  ok: true,
  solde: 300,
  offres_max: 5,
  offres: [offre(1, "tete", "casque-or", 2000), offre(2, "arme", "hache", 120, true), offre(3, "tete", "bandeau", 60), offre(4, "arme", "poele", 90)],
};

describe("la lecture du marché", () => {
  it("reconnaît un objet payant du catalogue, et lui seul", () => {
    expect(objetDuMarche("tete", "casque-or")).toEqual({ emplacement: "tete", objet: "casque-or", nom: "Casque d'or", rarete: "legendaire" });
    // Un objet gratuit, une case « rien », le corps, un objet inconnu : rien de tout cela ne se vend.
    expect(objetDuMarche("tete", "bonnet")).toBeNull();
    expect(objetDuMarche("tete", "aucun")).toBeNull();
    expect(objetDuMarche("cheveux", "courts")).toBeNull();
    expect(objetDuMarche("tete", "inconnu")).toBeNull();
    expect(objetDuMarche("ailleurs", "casque-or")).toBeNull();
    expect(objetDuMarche("tete", 3)).toBeNull();
  });

  it("garde les offres lisibles, dans l'ordre du serveur", () => {
    const marche = lireMarche({ ...MARCHE, offres: [...MARCHE.offres, offre(5, "tete", "inconnu", 10), offre(6, "tete", "bonnet", 10), { id: 7 }, null, offre(8, "tete", "beret", 0)] });
    expect(marche?.solde).toBe(300);
    expect(marche?.offresMax).toBe(5);
    expect(marche?.offres.map((o) => o.id)).toEqual([1, 2, 3, 4]);
    expect(marche?.offres[0]).toMatchObject({ nom: "Casque d'or", rarete: "legendaire", prix: 2000, vendeur: "Vendeur 1", a_moi: false });
  });

  it("refuse une réponse qui n'a pas la forme du contrat", () => {
    expect(lireMarche(null)).toBeNull();
    expect(lireMarche({ ok: true, offres: [], offres_max: 5 })).toBeNull();
    expect(lireMarche({ ok: true, solde: -1, offres: [], offres_max: 5 })).toBeNull();
    expect(lireMarche({ ok: true, solde: 10, offres_max: 5 })).toBeNull();
    expect(lireMarche({ ok: true, solde: 10, offres: [] })).toBeNull();
  });

  it("lit les prix de la boutique et l'inventaire, du plus rare au plus courant", () => {
    const boutique = lireBoutique({
      ok: true,
      solde: 300,
      peut_acheter: true,
      prix: PRIX_PAR_RARETE,
      pochette: { prix: 200, chances: {} },
      inventaire: [
        { emplacement: "tete", objet: "bandeau", quantite: 2, origine: "pochette", acquis_le: "2026-11-13T10:00:00.000Z" },
        { emplacement: "tete", objet: "casque-or", quantite: 1, origine: "marche", acquis_le: "2026-11-13T10:00:00.000Z" },
        { emplacement: "tete", objet: "bonnet", quantite: 1, origine: "achat", acquis_le: "2026-11-13T10:00:00.000Z" },
        { emplacement: "arme", objet: "hache", quantite: 0, origine: "achat", acquis_le: "2026-11-13T10:00:00.000Z" },
      ],
    });
    expect(boutique?.prix).toEqual(PRIX_PAR_RARETE);
    expect(boutique?.inventaire.map((p) => [p.objet, p.quantite])).toEqual([
      ["casque-or", 1],
      ["bandeau", 2],
    ]);
    expect(lireBoutique({ ok: true, prix: { commun: 100 }, inventaire: [] })).toBeNull();
    expect(lireBoutique({ ok: true, prix: PRIX_PAR_RARETE })).toBeNull();
  });
});

describe("les offres à l'écran", () => {
  const offres = lireMarche(MARCHE)!.offres;

  it("met ses offres à part de celles des autres", () => {
    expect(mesOffres(offres).map((o) => o.id)).toEqual([2]);
    expect(offresAAcheter(offres, "tout").map((o) => o.id)).toEqual([1, 3, 4]);
  });

  it("filtre par emplacement, et ne propose que les emplacements en vente chez les autres", () => {
    expect(offresAAcheter(offres, "tete").map((o) => o.id)).toEqual([1, 3]);
    expect(offresAAcheter(offres, "arme").map((o) => o.id)).toEqual([4]);
    expect(offresAAcheter(offres, "bas")).toEqual([]);
    expect(emplacementsEnVente(offres)).toEqual(["tete", "arme"]);
    expect(emplacementsEnVente(mesOffres(offres))).toEqual([]);
  });

  it("annonce le solde après l'achat, ou ce qui l'empêche", () => {
    expect(examinerAchat(offres[2]!, 300, [])).toEqual({ soldeApres: 240, refus: null, manque: 0 });
    expect(examinerAchat(offres[2]!, 60, null)).toEqual({ soldeApres: 0, refus: null, manque: 0 });
    expect(examinerAchat(offres[0]!, 300, [])).toEqual({ soldeApres: -1700, refus: "solde_insuffisant", manque: 1700 });
    expect(examinerAchat(offres[2]!, 300, [{ emplacement: "tete", objet: "bandeau" }])).toMatchObject({ refus: "deja_possede" });
    // Un inventaire pas lu : l'écran ne devine rien, le serveur décidera.
    expect(examinerAchat(offres[2]!, 300, null).refus).toBeNull();
  });

  it("n'accepte qu'un prix entier, de 1 statère au prix de la boutique", () => {
    expect(lirePrix("1", 250)).toBe(1);
    expect(lirePrix(" 250 ", 250)).toBe(250);
    expect(lirePrix("251", 250)).toBeNull();
    expect(lirePrix("0", 250)).toBeNull();
    expect(lirePrix("-5", 250)).toBeNull();
    expect(lirePrix("12,5", 250)).toBeNull();
    expect(lirePrix("12.5", 250)).toBeNull();
    expect(lirePrix("1e2", 250)).toBeNull();
    expect(lirePrix("", 250)).toBeNull();
  });

  it("ne laisse pas remettre en vente le seul exemplaire d'un objet acheté au marché", () => {
    expect(seVend({ quantite: 1, origine: "marche" })).toBe(false);
    expect(seVend({ quantite: 1, origine: "achat" })).toBe(true);
    expect(seVend({ quantite: 1, origine: "pochette" })).toBe(true);
    // Plusieurs exemplaires : l'écran ne sait pas d'où vient chacun, le serveur décide.
    expect(seVend({ quantite: 2, origine: "marche" })).toBe(true);
  });

  it("dit la fin d'une offre en mots", () => {
    const maintenant = new Date("2026-11-13T12:00:00.000Z");
    expect(finDeLOffre("2026-11-27T12:00:00.000Z", maintenant)).toBe("Fin dans 14 jours");
    expect(finDeLOffre("2026-11-15T11:00:00.000Z", maintenant)).toBe("Fin dans 1 jour");
    expect(finDeLOffre("2026-11-14T11:00:00.000Z", maintenant)).toBe("Fin dans moins d'un jour");
    expect(finDeLOffre("2026-11-13T11:00:00.000Z", maintenant)).toBe("Offre finie");
    expect(finDeLOffre("pas une date", maintenant)).toBe("");
  });

  it("écrit un nombre de statères", () => {
    expect(enStateres(1)).toBe("1 statère");
    expect(enStateres(0)).toBe("0 statère");
    expect(enStateres(1700).replace(/\s/g, " ")).toBe("1 700 statères");
  });
});

describe("les refus du marché", () => {
  const REFUS: RefusMarche[] = ["not_validated", "pas_possede", "objet_porte", "achete_au_marche", "prix_invalide", "trop_d_offres", "offre_fermee", "offre_a_soi", "deja_possede", "solde_insuffisant"];

  it("ont chacun leur message, en français, sans signe à la place d'un mot", () => {
    expect(Object.keys(MESSAGES_DU_MARCHE).sort()).toEqual([...REFUS].sort());
    for (const code of REFUS) {
      const message = messageDuMarche(code);
      expect(message, code).toBeTruthy();
      expect(message!.length, code).toBeGreaterThan(15);
      expect(message, code).not.toMatch(/[<>=÷×]/);
    }
    expect(new Set(REFUS.map((code) => messageDuMarche(code))).size).toBe(REFUS.length);
  });

  it("gardent dans errors.ts les refus qui n'existent qu'au marché", () => {
    for (const code of ["pas_possede", "objet_porte", "achete_au_marche", "prix_invalide", "trop_d_offres", "offre_fermee", "offre_a_soi"] as const) {
      expect(ERROR_MESSAGES[code], code).toBe(MESSAGES_DU_MARCHE[code]);
    }
  });

  it("laissent passer un refus qui n'est pas du marché", () => {
    expect(messageDuMarche("network")).toBeNull();
    expect(messageDuMarche("rate_limited")).toBeNull();
  });
});
