import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OBJETS, TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { joursAvantLeTirage, motsAvantLeTirage } from "../../src/lib/village/loterie";
import { PLACES_DE_TENUES, lireMesTenues, tenueDeLaPlace } from "../../src/lib/village/tenues-gardees";
import { collectionDuRayon, motsDeLaCollection } from "../../src/lib/village/vestiaire-rayons";

// Les tenues gardées du vestiaire, la collection d'un rayon et les jours avant le tirage : ce que l'écran lit et compte.

const MIGRATION = readFileSync("supabase/migrations/20261117000300_tenues_gardees.sql", "utf8");
const quand = "2026-11-17T10:00:00Z";
const reponse = (tenues: unknown[], places: unknown = 3): unknown => ({ ok: true, places, tenues });

describe("les tenues gardées", () => {
  it("lit les places occupées, dans l'ordre", () => {
    const mes = lireMesTenues(reponse([{ place: 3, tenue: TENUE_DE_DEPART, gardee_le: quand }, { place: 1, tenue: { ...TENUE_DE_DEPART, peau: "foncee" }, gardee_le: quand }]));
    expect(mes?.places).toBe(3);
    expect(mes?.tenues.map((t) => t.place)).toEqual([1, 3]);
    expect(mes && tenueDeLaPlace(mes, 1)?.tenue["peau"]).toBe("foncee");
    expect(mes && tenueDeLaPlace(mes, 2)).toBeNull();
  });

  it("lit un compte qui n'a rien gardé", () => {
    expect(lireMesTenues(reponse([]))).toEqual({ places: 3, tenues: [] });
  });

  it("laisse de côté une tenue qu'il ne sait pas lire, sans cacher les autres", () => {
    const mes = lireMesTenues(reponse([{ place: 1, tenue: { peau: "inconnue" }, gardee_le: quand }, { place: 2, tenue: TENUE_DE_DEPART, gardee_le: quand }]));
    expect(mes?.tenues.map((t) => t.place)).toEqual([2]);
  });

  it("refuse une réponse mal formée", () => {
    expect(lireMesTenues(null)).toBeNull();
    expect(lireMesTenues({ ok: false, error: "not_signed_in" })).toBeNull();
    expect(lireMesTenues(reponse([], 0))).toBeNull();
    expect(lireMesTenues(reponse([], PLACES_DE_TENUES + 1))).toBeNull();
    expect(lireMesTenues(reponse([{ place: 4, tenue: TENUE_DE_DEPART, gardee_le: quand }]))).toBeNull();
    expect(lireMesTenues(reponse([{ place: 1, tenue: TENUE_DE_DEPART, gardee_le: "hier" }]))).toBeNull();
    expect(lireMesTenues(reponse([{ place: 1, tenue: TENUE_DE_DEPART, gardee_le: quand }, { place: 1, tenue: TENUE_DE_DEPART, gardee_le: quand }]))).toBeNull();
  });

  it("a le même nombre de places que le serveur, qui n'ouvre ses fonctions qu'aux comptes connectés", () => {
    expect(MIGRATION).toContain(`check (place between 1 and ${PLACES_DE_TENUES})`);
    expect(MIGRATION).toContain(`'places', ${PLACES_DE_TENUES}`);
    for (const fonction of ["public.get_mes_tenues()", "public.garder_tenue(integer, jsonb)"]) {
      expect(MIGRATION).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    expect(MIGRATION).toContain("revoke all on table internal.gaulois_tenues from public, anon, authenticated;");
    // Elle ne fait qu'ajouter.
    expect(MIGRATION).not.toMatch(/\b(drop|truncate|delete from)\b/i);
  });
});

describe("la collection d'un rayon", () => {
  const payants = Object.entries(OBJETS.tete).filter(([, o]) => !o.gratuit && o.rarete);

  it("compte les objets payants possédés sur ceux qui existent", () => {
    const [premier, deuxieme] = payants;
    const miens = new Set([premier?.[0], deuxieme?.[0]]);
    expect(collectionDuRayon("tete", (id) => (miens.has(id) ? 2 : 0))).toEqual({ possedes: 2, existants: payants.length });
    expect(collectionDuRayon("tete", () => 0)).toEqual({ possedes: 0, existants: payants.length });
  });

  it("ne compte pas les objets gratuits, que tout le monde a", () => {
    const gratuits = Object.entries(OBJETS.tete).filter(([, o]) => o.gratuit).map(([id]) => id);
    expect(gratuits.length).toBeGreaterThan(0);
    expect(collectionDuRayon("tete", (id) => (gratuits.includes(id) ? 1 : 0)).possedes).toBe(0);
  });

  it("s'écrit en mots, et ne dit rien d'un rayon sans objet payant", () => {
    expect(motsDeLaCollection({ possedes: 12, existants: 62 })).toBe("12 sur 62");
    expect(motsDeLaCollection({ possedes: 0, existants: 0 })).toBeNull();
  });
});

describe("les jours avant le tirage du mardi à 21 h 30, heure de Paris", () => {
  it("compte de mercredi à lundi", () => {
    expect(joursAvantLeTirage(new Date("2026-11-18T10:00:00Z"))).toBe(6); // mercredi
    expect(joursAvantLeTirage(new Date("2026-11-21T22:00:00Z"))).toBe(3); // samedi soir
    expect(joursAvantLeTirage(new Date("2026-11-22T12:00:00Z"))).toBe(2); // dimanche
    expect(joursAvantLeTirage(new Date("2026-11-23T12:00:00Z"))).toBe(1); // lundi
  });

  it("vaut zéro le mardi avant le tirage, sept après", () => {
    expect(joursAvantLeTirage(new Date("2026-11-17T08:00:00Z"))).toBe(0);
    // 21 h 29 à Paris, en hiver : 20 h 29 UTC.
    expect(joursAvantLeTirage(new Date("2026-11-17T20:29:00Z"))).toBe(0);
    expect(joursAvantLeTirage(new Date("2026-11-17T20:30:00Z"))).toBe(7);
  });

  it("suit l'heure de Paris, pas celle de l'appareil", () => {
    // Lundi 23 h 30 UTC : déjà mardi 0 h 30 à Paris.
    expect(joursAvantLeTirage(new Date("2026-11-23T23:30:00Z"))).toBe(0);
    // En été, 21 h 30 à Paris tombe à 19 h 30 UTC.
    expect(joursAvantLeTirage(new Date("2026-07-07T19:29:00Z"))).toBe(0);
    expect(joursAvantLeTirage(new Date("2026-07-07T19:30:00Z"))).toBe(7);
  });

  it("s'écrit en mots", () => {
    expect(motsAvantLeTirage(0)).toBe("ce soir");
    expect(motsAvantLeTirage(1)).toBe("demain");
    expect(motsAvantLeTirage(6)).toBe("6 jours");
  });
});
