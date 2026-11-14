import { describe, expect, it } from "vitest";
import { aRelirePour, apresLecture, besoinDeLaTenue, cleDeLaTenue, imagesDeDepart, lireLaTenueGardee, tenueBruteDuCompagnon, type Connexion, type TenueGardee } from "../../src/lib/compagnon/tenue";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";

const tenue = { ...TENUE_DE_DEPART, cheveux: "longs" };
const gardee = (relire = false): TenueGardee => ({ tenue, compte: "compte-a", relire });
const ici: Connexion = { compte: "compte-a", depuis: "2026-11-14T08:00:00Z" };

describe("la tenue gardée du Gaulois compagnon", () => {
  it("se relit telle qu'elle a été gardée, et rien d'autre", () => {
    expect(lireLaTenueGardee(JSON.stringify(gardee(true)))).toEqual(gardee(true));
    expect(lireLaTenueGardee(JSON.stringify({ tenue: null }))).toEqual({ tenue: null, compte: null, relire: false });
    expect(lireLaTenueGardee(JSON.stringify({ tenue: null, compte: "compte-a", relire: false, refusee: "" }))?.refusee).toBe("");
    expect(lireLaTenueGardee(JSON.stringify({ tenue: null, compte: "compte-a", relire: false, refusee: true }))?.refusee).toBeUndefined();
    for (const texte of [null, "", "{", "null", "12", "[]", "{}", JSON.stringify({ compte: "compte-a" })]) expect(lireLaTenueGardee(texte), String(texte)).toBeNull();
    // Des champs mal formés ne passent pas pour vrais : pas de compte, pas de relecture.
    expect(lireLaTenueGardee(JSON.stringify({ tenue, compte: 12, relire: "oui" }))).toEqual({ tenue, compte: null, relire: false });
  });

  it("donne le Gaulois de départ sans serveur, sans session, et efface alors ce qui reste du membre", () => {
    for (const [serveur, session] of [
      [false, false],
      [false, true],
      [true, false],
    ] as const) {
      expect(besoinDeLaTenue(serveur, session, gardee())).toEqual({ tenue: null, lire: false, attendre: false, oublier: true });
    }
    // Sans navigateur (ces tests), personne n'est connecté : le Gaulois de départ.
    expect(tenueBruteDuCompagnon()).toBeNull();
  });

  it("ne lit le serveur qu'une fois par onglet, puis après un passage au village", () => {
    // Rien de gardé : on lit, et on attend la réponse plutôt que de montrer d'abord le Gaulois de départ.
    expect(besoinDeLaTenue(true, true, null)).toEqual({ tenue: null, lire: true, attendre: true, oublier: false });
    // Gardée : montrée tout de suite, sans lecture.
    expect(besoinDeLaTenue(true, true, gardee())).toEqual({ tenue, lire: false, attendre: false, oublier: false });
    // Gardée avant un passage au village : montrée tout de suite, et relue.
    expect(besoinDeLaTenue(true, true, gardee(true))).toEqual({ tenue, lire: true, attendre: false, oublier: false });
    // Un membre sans Gaulois : le Gaulois de départ, sans relire.
    expect(besoinDeLaTenue(true, true, { tenue: null, compte: "compte-a", relire: false }).lire).toBe(false);
  });

  it("garde la réponse du serveur, et donne le Gaulois de départ à un refus ou une panne", () => {
    expect(apresLecture({ tenue }, null, ici, false)).toEqual(gardee());
    expect(apresLecture({ tenue: null }, gardee(), ici, false)).toEqual({ tenue: null, compte: "compte-a", relire: false });
    // Lue au village : la page suivante relira.
    expect(apresLecture({ tenue }, null, ici, true)).toEqual(gardee(true));
    // Session que le serveur ne reconnaît pas : le Gaulois de départ, relu seulement à une nouvelle connexion.
    expect(apresLecture({ erreur: "not_signed_in" }, gardee(), ici, false)).toEqual({ tenue: null, compte: "compte-a", relire: false, refusee: ici.depuis });
    expect(apresLecture({ erreur: "not_signed_in" }, null, { compte: "compte-a", depuis: null }, false).refusee).toBe("");
    // Pas de Gaulois pour ce compte : le Gaulois de départ, même si une tenue était gardée.
    for (const erreur of ["discord_required", "suspended", "forbidden"]) expect(apresLecture({ erreur }, gardee(), ici, false)).toEqual({ tenue: null, compte: "compte-a", relire: false });
    // Panne : la tenue d'avant reste, sinon le Gaulois de départ ; dans les deux cas, on ne redemande pas.
    expect(apresLecture({ erreur: "network" }, gardee(true), ici, false)).toEqual(gardee());
    expect(apresLecture({ erreur: "network" }, null, ici, false)).toEqual({ tenue: null, compte: "compte-a", relire: false });
  });

  it("ne relit que pour un autre compte, ou pour une nouvelle connexion après un refus", () => {
    expect(aRelirePour(null, ici)).toBe(false);
    expect(aRelirePour(gardee(), ici)).toBe(false);
    // Une page de plus, un jeton renouvelé : la même connexion.
    expect(aRelirePour(gardee(), { ...ici, depuis: "2026-11-14T09:00:00Z" })).toBe(false);
    expect(aRelirePour(gardee(), { compte: "compte-b", depuis: ici.depuis })).toBe(true);
    // Gardée sans compte (annoncée par le vestiaire avant toute lecture) : elle vaut pour la session ouverte.
    expect(aRelirePour({ tenue, compte: null, relire: false }, { compte: "compte-b", depuis: null })).toBe(false);
    const refusee = apresLecture({ erreur: "not_signed_in" }, null, ici, false);
    expect(aRelirePour(refusee, ici)).toBe(false);
    expect(aRelirePour(refusee, { ...ici, depuis: "2026-11-14T10:30:00Z" })).toBe(true);
  });

  it("donne la même clé d'images à une tenue reçue dans un autre ordre", () => {
    const melangee = Object.fromEntries(Object.entries(tenue).reverse());
    expect(cleDeLaTenue(melangee)).toBe(cleDeLaTenue(tenue));
    expect(cleDeLaTenue({ ...tenue, cheveux: "courts" })).not.toBe(cleDeLaTenue(tenue));
    expect(cleDeLaTenue(null)).toBe(cleDeLaTenue(undefined));
    expect(cleDeLaTenue(null)).not.toBe(cleDeLaTenue(tenue));
  });

  it("reconnaît les images gardées du Gaulois de départ, et tient pour celles d'un membre tout le reste", () => {
    expect(imagesDeDepart(null)).toBe(true);
    expect(imagesDeDepart(JSON.stringify({ cle: "x", gaulois: "a", lit: "b", deDepart: true }))).toBe(true);
    expect(imagesDeDepart(JSON.stringify({ cle: "x", gaulois: "a", lit: "b", deDepart: false }))).toBe(false);
    expect(imagesDeDepart("{")).toBe(false);
  });
});
