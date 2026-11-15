import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, OBJETS, type Emplacement, type Rarete } from "../../src/lib/gaulois";
import {
  RAYONS_BOUTIQUE,
  demandeLeMarche,
  essaiValide,
  motsDesOffres,
  offreEssayee,
  offresParRayon,
  raisonDeLEssai,
  rangerLaBoutique,
  rayonDOuverture,
  type Essai,
} from "../../src/lib/village/boutique-rayons";
import { RAISON_EN_VENTE } from "../../src/lib/village/ecran-boutique";
import { MESSAGES_DU_MARCHE, raisonDeLOffre, type OffreLisible } from "../../src/lib/village/ecran-marche";

// « La boutique », onglet de « Mon Gaulois » (/village#boutique) : ce que montre un rayon, boutique du clan et offres des membres ensemble, et ce qui
// empêche d'acheter ce qu'on essaie. Les objets viennent du vrai catalogue : rien n'est inventé ici.

/** Les objets payants d'un emplacement, dans l'ordre du catalogue. */
const payants = (emplacement: Emplacement) => Object.entries(OBJETS[emplacement]).filter(([, objet]) => !objet.gratuit && objet.rarete);
/** Le premier objet payant d'une rareté, dans un emplacement. */
function objetDe(emplacement: Emplacement, rarete: Rarete): string {
  const trouve = payants(emplacement).find(([, objet]) => objet.rarete === rarete);
  if (!trouve) throw new Error(`pas d'objet ${rarete} dans ${emplacement}`);
  return trouve[0];
}

let numero = 0;
function offre(emplacement: Emplacement, objet: string, plus: Partial<OffreLisible> = {}): OffreLisible {
  const fiche = OBJETS[emplacement][objet]!;
  return { id: ++numero, emplacement, objet, nom: fiche.nom, rarete: fiche.rarete!, prix: 40, vendeur: "Vendeur", a_moi: false, expire_le: "2026-11-29T12:00:00Z", ...plus };
}

describe("les rayons de la boutique", () => {
  it("sont les emplacements d'objets : le corps, gratuit, n'a pas de rayon", () => {
    expect(RAYONS_BOUTIQUE).toEqual(EMPLACEMENTS_OBJETS);
  });

  it("un rayon montre les objets que le membre n'a pas, et les offres des autres membres pour cet emplacement", () => {
    const possede = objetDe("tete", "commun");
    const rayon = rangerLaBoutique("tete", (id) => (id === possede ? 1 : 0), [offre("tete", possede), offre("haut", objetDe("haut", "commun")), offre("tete", objetDe("tete", "epique"), { a_moi: true })], undefined);
    expect(rayon.boutique.map(([id]) => id)).toEqual(payants("tete").map(([id]) => id).filter((id) => id !== possede));
    expect(rayon.boutique.every(([, objet]) => !objet.gratuit)).toBe(true);
    // Ni l'offre d'un autre rayon, ni la sienne.
    expect(rayon.offres.map((o) => o.objet)).toEqual([possede]);
    expect(rayon.total).toBe(payants("tete").length - 1 + 1);
    expect(rayon.retenu).toBe("tout");
  });

  it("le filtre réduit la boutique et les offres à la même rareté, et compte les deux ensemble", () => {
    const commun = objetDe("arme", "commun");
    const epique = objetDe("arme", "epique");
    const offres = [offre("arme", commun), offre("arme", epique)];
    const tout = rangerLaBoutique("arme", () => 0, offres, undefined);
    const epiques = payants("arme").filter(([, objet]) => objet.rarete === "epique").length;
    expect(tout.comptes.epique).toBe(epiques + 1);
    const filtre = rangerLaBoutique("arme", () => 0, offres, "epique");
    expect(filtre.retenu).toBe("epique");
    expect(filtre.boutique.every(([, objet]) => objet.rarete === "epique")).toBe(true);
    expect(filtre.boutique).toHaveLength(epiques);
    expect(filtre.offres.map((o) => o.objet)).toEqual([epique]);
    // Les comptes et le total ne changent pas avec le filtre : ce sont eux que les choix du filtre écrivent.
    expect(filtre.comptes).toEqual(tout.comptes);
    expect(filtre.total).toBe(tout.total);
  });

  it("une rareté qui n'a plus rien à vendre remontre tout", () => {
    const tous = new Set(payants("pieds").filter(([, objet]) => objet.rarete === "legendaire").map(([id]) => id));
    const rayon = rangerLaBoutique("pieds", (id) => (tous.has(id) ? 1 : 0), [], "legendaire");
    expect(rayon.comptes.legendaire).toBe(0);
    expect(rayon.retenu).toBe("tout");
    expect(rayon.boutique.length).toBe(rayon.total);
  });

  it("compte les offres des autres membres par rayon, sans les siennes", () => {
    const offres = [offre("tete", objetDe("tete", "commun")), offre("tete", objetDe("tete", "epique")), offre("bas", objetDe("bas", "commun")), offre("arme", objetDe("arme", "commun"), { a_moi: true })];
    expect(offresParRayon(offres)).toEqual({ tete: 2, haut: 0, bas: 1, pieds: 0, arme: 0 });
    expect(offresParRayon([])).toEqual({ tete: 0, haut: 0, bas: 0, pieds: 0, arme: 0 });
    expect(motsDesOffres(1)).toBe("1 offre");
    expect(motsDesOffres(3)).toBe("3 offres");
  });

  it("ouvre le premier rayon, ou, venu par l'adresse du marché, le premier où un membre vend", () => {
    const offres = [offre("bas", objetDe("bas", "commun")), offre("arme", objetDe("arme", "commun"))];
    expect(rayonDOuverture(offres, false)).toBe("tete");
    expect(rayonDOuverture(offres, true)).toBe("bas");
    expect(rayonDOuverture([], true)).toBe("tete");
    expect(rayonDOuverture([offre("pieds", objetDe("pieds", "commun"), { a_moi: true })], true)).toBe("tete");
    expect(demandeLeMarche("#marche")).toBe(true);
    expect(demandeLeMarche("#forge")).toBe(false);
    expect(demandeLeMarche("")).toBe(false);
  });
});

describe("l'essayage de la boutique", () => {
  const tete = objetDe("tete", "commun");

  it("l'offre d'un membre ne s'essaie plus une fois partie ; un objet de la boutique s'essaie toujours", () => {
    const o = offre("tete", tete);
    const essai: Essai = { source: "marche", offre: o.id, emplacement: "tete", objet: tete };
    expect(offreEssayee(essai, [o])).toBe(o);
    expect(essaiValide(essai, [o])).toBe(essai);
    expect(essaiValide(essai, [])).toBeNull();
    // Devenue la sienne (ce qui n'arrive pas) ou remplacée par une autre offre du même objet : ce n'est plus elle.
    expect(essaiValide(essai, [{ ...o, a_moi: true }])).toBeNull();
    expect(essaiValide(essai, [offre("tete", tete)])).toBeNull();
    const duClan: Essai = { source: "boutique", emplacement: "tete", objet: tete };
    expect(offreEssayee(duClan, [o])).toBeNull();
    expect(essaiValide(duClan, [])).toBe(duClan);
    expect(essaiValide(null, [o])).toBeNull();
  });

  it("dit ce qui empêche d'acheter à la boutique : la boutique fermée, l'objet en vente par soi, puis le solde", () => {
    const ref = { emplacement: "tete" as const, objet: tete };
    expect(raisonDeLEssai(ref, 100, 500, null, [])).toBeNull();
    expect(raisonDeLEssai(ref, 100, 100, null, [])).toBeNull();
    expect(raisonDeLEssai(ref, 100, 40, null, [])).toMatch(/^Il vous manque 60\sstatères\.$/);
    expect(raisonDeLEssai(ref, 100, 500, null, [ref])).toBe(RAISON_EN_VENTE);
    expect(raisonDeLEssai(ref, 100, 0, "La boutique est fermée.", [ref])).toBe("La boutique est fermée.");
    // Sans prix ou sans solde, l'écran ne devine pas un manque.
    expect(raisonDeLEssai(ref, null, 0, null, [])).toBeNull();
    expect(raisonDeLEssai(ref, 100, null, null, [])).toBeNull();
  });

  it("dit ce qui empêche d'acheter l'offre d'un membre, dans les mots de la fenêtre du marché", () => {
    const o = offre("tete", tete, { prix: 80 });
    const ref = { emplacement: "tete" as const, objet: tete };
    expect(raisonDeLOffre(o, 80, [], [])).toBeNull();
    expect(raisonDeLOffre(o, 30, [], [])).toMatch(/^Il vous manque 50\sstatères\.$/);
    expect(raisonDeLOffre(o, 500, [ref], [])).toBe(MESSAGES_DU_MARCHE.deja_possede);
    expect(raisonDeLOffre(o, 500, [], [ref])).toBe("Vous avez déjà cet objet en vente.");
    // Inventaire pas lu : l'écran ne sait pas si l'objet est possédé, seul le solde parle.
    expect(raisonDeLOffre(o, 500, null, [])).toBeNull();
  });
});
