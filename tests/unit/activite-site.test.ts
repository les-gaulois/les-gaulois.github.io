import { describe, expect, it } from "vitest";
import { allHours, dayBefore, isDeclaredBot, lastDays, mondayOf, namedPages, pageKey, pageLabel, parisDay, readVisitMark, share, sourceOf, visitFlags, writeVisitMark } from "../../src/lib/activite-site";

/** Une marque posée le 1er septembre 2026, dernière visite à la date donnée. */
const mark = (last: string) => ({ last, since: "2026-09-01" });

describe("le jour de Paris", () => {
  it("suit l'heure de Paris, pas celle du serveur ni l'UTC", () => {
    // 23 h 30 UTC le 13 novembre : déjà le 14 à Paris (UTC+1 en hiver).
    expect(parisDay(new Date("2026-11-13T23:30:00Z"))).toBe("2026-11-14");
    expect(parisDay(new Date("2026-11-13T22:59:00Z"))).toBe("2026-11-13");
    // En été, UTC+2.
    expect(parisDay(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });

  it("trouve le lundi de la semaine", () => {
    expect(mondayOf("2026-11-13")).toBe("2026-11-09"); // vendredi
    expect(mondayOf("2026-11-09")).toBe("2026-11-09"); // lundi
    expect(mondayOf("2026-11-15")).toBe("2026-11-09"); // dimanche
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(dayBefore("2026-12-01")).toBe("2026-11-30");
  });
});

describe("ce que dit le navigateur", () => {
  it("compte un navigateur une fois par jour, par semaine et par mois", () => {
    expect(visitFlags(mark("2026-11-13"), "2026-11-13", true)).toEqual({ newDay: false, newWeek: false, newMonth: false, first: false });
    expect(visitFlags(mark("2026-11-12"), "2026-11-13", true)).toEqual({ newDay: true, newWeek: false, newMonth: false, first: false });
    expect(visitFlags(mark("2026-11-08"), "2026-11-13", true)).toEqual({ newDay: true, newWeek: true, newMonth: false, first: false });
    expect(visitFlags(mark("2026-09-30"), "2026-10-01", true)).toEqual({ newDay: true, newWeek: false, newMonth: true, first: false });
  });

  it("ne prend pour nouveau qu'un navigateur sans aucune trace du site", () => {
    expect(visitFlags(null, "2026-11-13", false)).toEqual({ newDay: true, newWeek: true, newMonth: true, first: true });
    expect(visitFlags(null, "2026-11-13", true)).toMatchObject({ newDay: true, first: false });
  });

  it("lit la marque, et l'oublie illisible, à venir ou posée il y a plus de 13 mois", () => {
    expect(readVisitMark(null, "2026-11-13")).toBeNull();
    expect(readVisitMark("2026-11-12 2026-10-01", "2026-11-13")).toEqual({ last: "2026-11-12", since: "2026-10-01" });
    // Une date seule : posée le même jour.
    expect(readVisitMark("2026-11-12", "2026-11-13")).toEqual({ last: "2026-11-12", since: "2026-11-12" });
    expect(readVisitMark("n'importe quoi", "2026-11-13")).toBeNull();
    expect(readVisitMark("refus", "2026-11-13")).toBeNull();
    expect(readVisitMark("2026-11-20 2026-11-01", "2026-11-13")).toBeNull();
    expect(readVisitMark("2026-11-12 2026-11-13", "2026-11-13")).toBeNull();
    // 13 mois de vie, pas un jour de plus, même si le navigateur revient chaque jour.
    expect(readVisitMark("2027-11-26 2026-11-01", "2027-11-26")).not.toBeNull();
    expect(readVisitMark("2027-11-26 2026-11-01", "2027-11-27")).toBeNull();
  });

  it("garde la date de pose de la marque à chaque visite", () => {
    expect(writeVisitMark(null, "2026-11-13")).toBe("2026-11-13 2026-11-13");
    expect(writeVisitMark({ last: "2026-11-12", since: "2026-10-01" }, "2026-11-13")).toBe("2026-11-13 2026-10-01");
    expect(readVisitMark(writeVisitMark(null, "2026-11-13"), "2026-11-13")).toEqual({ last: "2026-11-13", since: "2026-11-13" });
  });

  it("écarte les robots qui se déclarent, pas les navigateurs ordinaires", () => {
    expect(isDeclaredBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isDeclaredBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isDeclaredBot("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0 Safari/537.36")).toBe(true);
    expect(isDeclaredBot("Mozilla/5.0 (X11; Linux x86_64) Chrome-Lighthouse")).toBe(true);
    expect(isDeclaredBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36")).toBe(false);
    expect(isDeclaredBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isDeclaredBot("Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0")).toBe(false);
  });

  it("range la provenance par famille, sans garder l'adresse", () => {
    const site = "les-gaulois.github.io";
    expect(sourceOf("", site)).toBe("direct");
    expect(sourceOf("https://les-gaulois.github.io/classement", site)).toBe("direct");
    expect(sourceOf("https://discord.com/", site)).toBe("discord");
    expect(sourceOf("https://ptb.discord.com/channels/1/2", site)).toBe("discord");
    expect(sourceOf("https://www.google.fr/", site)).toBe("google");
    expect(sourceOf("https://www.google.com/", site)).toBe("google");
    expect(sourceOf("https://duckduckgo.com/", site)).toBe("moteur");
    expect(sourceOf("https://openfront.io/", site)).toBe("openfront");
    expect(sourceOf("https://www.youtube.com/watch?v=x", site)).toBe("reseaux");
    expect(sourceOf("https://notgoogle.example/", site)).toBe("autre");
    expect(sourceOf("https://discord.com.evil.example/", site)).toBe("autre");
    expect(sourceOf("pas une adresse", site)).toBe("direct");
  });

  it("donne la page par son modèle d'adresse, jamais par l'identifiant d'un joueur", () => {
    expect(pageKey("/")).toBe("/");
    expect(pageKey("/classement/")).toBe("/classement");
    expect(pageKey("/membres/[id]")).toBe("/membres/[id]");
    expect(pageKey("/Membres")).toBe("/membres");
    expect(pageKey("https://exemple.fr/x")).toBe("/autre");
    expect(pageKey(`/${"a".repeat(80)}`)).toBe("/autre");
  });
});

describe("la lecture de l'encadrement", () => {
  it("nomme les pages comme le plan du site", () => {
    expect(pageLabel("/")).toBe("Accueil");
    expect(pageLabel("/classement")).toBe("Classement");
    expect(pageLabel("/membres/[id]")).toBe("Fiches des membres");
    expect(pageLabel("/inconnue")).toBe("Autres pages");
  });

  it("n'écrit jamais une adresse inconnue, et range les autres pages en dernier", () => {
    const rows = namedPages([
      { page: "/insulte-inventee", views: 900 },
      { page: "/", views: 50 },
      { page: "/autre", views: 3 },
      { page: "/classement", views: 70 },
    ]);
    expect(rows).toEqual([
      { label: "Classement", value: 70 },
      { label: "Accueil", value: 50 },
      { label: "Autres pages", value: 903 },
    ]);
  });

  it("sépare les jours sans données des vrais zéros", () => {
    const bars = lastDays(
      {
        today: "2026-11-15",
        since: "2026-11-13",
        days: [
          { day: "2026-11-13", views: 10, visitors: 4, newcomers: 1, touch: 2, signed_in: 1 },
          { day: "2026-11-15", views: 3, visitors: 2, newcomers: 0, touch: 1, signed_in: 0 },
        ],
      },
      5,
    );
    expect(bars).toEqual([
      { day: "2026-11-11", visitors: null, views: null },
      { day: "2026-11-12", visitors: null, views: null },
      { day: "2026-11-13", visitors: 4, views: 10 },
      { day: "2026-11-14", visitors: 0, views: 0 },
      { day: "2026-11-15", visitors: 2, views: 3 },
    ]);
  });

  it("n'invente aucun jour avant le compteur", () => {
    expect(lastDays({ today: "2026-11-13", since: null, days: [] }, 3).every((d) => d.visitors === null)).toBe(true);
  });

  it("donne les 24 heures et des parts sans base vide", () => {
    const hours = allHours([{ hour: 21, views: 7 }]);
    expect(hours).toHaveLength(24);
    expect(hours[21]).toEqual({ hour: 21, views: 7 });
    expect(hours[0]).toEqual({ hour: 0, views: 0 });
    expect(share(1, 3)).toBe(33);
    expect(share(0, 0)).toBeNull();
  });
});
