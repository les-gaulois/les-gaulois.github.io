import { describe, expect, it } from "vitest";
import { BANNIERES, messageDesBannieres, vignetteDeLaBanniere } from "../../src/lib/village/bannieres";
import type { MesBannieres } from "../../src/lib/village/contrat";
import { PRIX_BANNIERE_PAR_RARETE } from "../../src/lib/village/contrat";
import {
  ANCRE_BANNIERES,
  BANNIERE_HAUTEUR,
  BANNIERE_LARGEUR,
  apresLAchat,
  banniereDOuverture,
  demandeLesBannieres,
  idsDesBannieres,
  messageDuRefusDAchat,
  raisonDeLaBanniere,
  sansBanniere,
  surCombien,
} from "../../src/lib/village/ecran-bannieres";

const IDS = BANNIERES.map((b) => b.id);
const [premiere, deuxieme, troisieme] = IDS as [string, string, string];
const mes = (plus: Partial<MesBannieres> = {}): MesBannieres => ({ ok: true, solde: 1000, peut_acheter: true, prix: { ...PRIX_BANNIERE_PAR_RARETE }, bannieres: [], porte: null, ...plus });
const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const lisible = (texte: string): string => texte.split(NBSP).join(" ").split(NNBSP).join(" ");

describe("l'adresse des bannières", () => {
  it("ne reconnaît que son ancre", () => {
    expect(demandeLesBannieres(`#${ANCRE_BANNIERES}`)).toBe(true);
    expect(demandeLesBannieres("#boutique")).toBe(false);
    expect(demandeLesBannieres("")).toBe(false);
  });
});

describe("la toile d'une bannière", () => {
  it("a les dimensions des dessins", () => {
    const vignette = vignetteDeLaBanniere(premiere);
    expect(vignette?.largeur).toBe(BANNIERE_LARGEUR);
    expect(vignette?.hauteur).toBe(BANNIERE_HAUTEUR);
  });
});

describe("sansBanniere", () => {
  it("ne dit vrai que pour une réponse acceptée à la liste vide", () => {
    expect(sansBanniere({ ok: true, bannieres: [] })).toBe(true);
    expect(sansBanniere({ ok: true, bannieres: [{ banniere: premiere, acquis_le: "2026-11-15T10:00:00Z" }] })).toBe(false);
    expect(sansBanniere({ ok: false, bannieres: [] })).toBe(false);
    expect(sansBanniere({ ok: true })).toBe(false);
    expect(sansBanniere(null)).toBe(false);
    expect(sansBanniere("rien")).toBe(false);
  });
});

describe("après un achat", () => {
  it("met la bannière en tête et prend le solde du serveur", () => {
    const avant = mes({ bannieres: [{ banniere: deuxieme, acquis_le: "2026-11-14T10:00:00Z" }] });
    const apres = apresLAchat(avant, { ok: true, solde: 700, banniere: { banniere: premiere, rarete: "commun" } }, "2026-11-15T10:00:00Z");
    expect(apres.solde).toBe(700);
    expect(apres.bannieres.map((l) => l.banniere)).toEqual([premiere, deuxieme]);
    expect([...idsDesBannieres(apres)]).toEqual([premiere, deuxieme]);
    expect(avant.bannieres).toHaveLength(1);
  });
  it("ne compte pas deux fois une bannière déjà là", () => {
    const avant = mes({ bannieres: [{ banniere: premiere, acquis_le: "2026-11-14T10:00:00Z" }] });
    expect(apresLAchat(avant, { ok: true, solde: 700, banniere: { banniere: premiere, rarete: "commun" } }, "2026-11-15T10:00:00Z").bannieres).toHaveLength(1);
  });
});

describe("la bannière de la vitrine à l'ouverture", () => {
  it("est celle de /gaulois, sinon la dernière achetée, sinon la première", () => {
    const lignes = [
      { banniere: troisieme, acquis_le: "2026-11-15T10:00:00Z" },
      { banniere: deuxieme, acquis_le: "2026-11-14T10:00:00Z" },
    ];
    expect(banniereDOuverture(mes({ bannieres: lignes, porte: deuxieme }), IDS)).toBe(deuxieme);
    expect(banniereDOuverture(mes({ bannieres: lignes }), IDS)).toBe(troisieme);
    expect(banniereDOuverture(mes(), IDS)).toBe(premiere);
    expect(banniereDOuverture(null, IDS)).toBe(premiere);
  });
  it("ne rend jamais une bannière hors de la liste", () => {
    expect(banniereDOuverture(mes({ porte: "inconnue" }), IDS)).toBe(premiere);
    expect(banniereDOuverture(mes(), [])).toBeNull();
  });
});

describe("ce qui empêche d'acheter", () => {
  it("rien quand le solde suffit", () => {
    expect(raisonDeLaBanniere(mes(), 300, 300)).toBeNull();
  });
  it("dit ce qui manque", () => {
    expect(lisible(raisonDeLaBanniere(mes(), 1250, 7500) ?? "")).toBe("Il vous manque 6 250 statères.");
  });
  it("dit qu'un compte pas encore validé n'achète pas, même riche", () => {
    expect(raisonDeLaBanniere(mes({ peut_acheter: false }), 9000, 300)).toMatch(/validé/);
  });
});

describe("les mots d'un refus d'achat", () => {
  it("disent ce qui manque d'après le serveur, quand il a répondu", () => {
    expect(lisible(messageDuRefusDAchat("solde_insuffisant", messageDesBannieres, { manque: 290 }))).toBe("Il vous manque 290 statères.");
    expect(messageDuRefusDAchat("solde_insuffisant", messageDesBannieres)).toMatch(/assez de statères/);
  });
  it("gardent les mots des bannières pour le reste", () => {
    expect(messageDuRefusDAchat("deja_possede", messageDesBannieres)).toBe("Vous avez déjà cette bannière.");
    expect(messageDuRefusDAchat("prix_change", messageDesBannieres)).toMatch(/prix vient de changer/);
    expect(messageDuRefusDAchat("not_validated", messageDesBannieres)).toMatch(/validé/);
  });
});

describe("surCombien", () => {
  it("écrit « 3 sur 40 »", () => {
    expect(surCombien(3, 40)).toBe("3 sur 40");
  });
});
