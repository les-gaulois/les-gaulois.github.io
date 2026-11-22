/**
 * Le boss du jour du duel : les 11 Gaulois uniques, chacun avec sa main, son pouvoir, son lieu et ses répliques ; la règle du
 * jour ; et l'essai qui montre que chaque boss tombe près de sa cible : dur, mais battable par un joueur de bon sens.
 */
import { describe, expect, it } from "vitest";
import { BOSS, CIBLES_DES_BOSS, ORDRE_DES_BOSS, bossDuJour, bossParId, optionsDuBoss } from "../../supabase/functions/code-discord/duel/contenu/boss";
import { PREMIER_JOUR_DU_CYCLE, jourAParis, joursEntre, rangDuJour } from "../../supabase/functions/code-discord/duel/contenu/rotation";
import { CATALOGUE_DU_DUEL } from "../../supabase/functions/code-discord/duel/catalogue";
import { CLES_DES_ATOUTS, EMPLACEMENTS_DU_DUEL } from "../../supabase/functions/code-discord/duel/effets";
import { P, camp, carte, prixDeLaMain } from "../../supabase/functions/code-discord/duel/regles";
import { BANNIERES } from "../../supabase/functions/code-discord/bannieres/index";
import { MODELES, RARETES_DES_MODELES } from "../../supabase/functions/code-discord/modeles/index";
import { bonSensContreLeBoss } from "../../src/lib/village/essai-duel-contenu";

const SIGNES_INTERDITS = /[÷×>=<+]/;
const motsDe = (texte: string): number => texte.trim().split(/\s+/).length;
const COULEUR = /^#[0-9a-f]{6}$/i;

describe("les boss du jour", () => {
  it("sont les 11 Gaulois uniques, chacun une fois", () => {
    expect(BOSS.map((b) => b.id).sort()).toEqual(MODELES.map((m) => m.id).sort());
    expect([...ORDRE_DES_BOSS].sort()).toEqual(MODELES.map((m) => m.id).sort());
  });

  it("ont une main de cinq objets, un par emplacement, dans la bourse de tout le monde", () => {
    for (const b of BOSS) {
      b.main.forEach((id, i) => {
        expect(Object.hasOwn(CATALOGUE_DU_DUEL, id), `${b.id} : ${id}`).toBe(true);
        expect(CATALOGUE_DU_DUEL[id]!.e, `${b.id} : ${id}`).toBe(EMPLACEMENTS_DU_DUEL[i]);
      });
      const cartes = b.main.map(carte);
      expect(prixDeLaMain(cartes), b.id).toBeLessThanOrEqual(P.BOURSE);
      expect(cartes.filter((c) => c.r === "divin" || c.r === "saison").length, b.id).toBe(0);
      expect(cartes.filter((c) => c.r === "legendaire").length, b.id).toBeLessThanOrEqual(1);
    }
  });

  it("ont chacun un pouvoir à lui, fait des atouts que le moteur sait jouer", () => {
    const vus = new Set<string>();
    for (const b of BOSS) {
      const cles = Object.keys(b.pouvoir.passif);
      expect(cles.length, b.id).toBeGreaterThanOrEqual(1);
      for (const k of cles) {
        expect((CLES_DES_ATOUTS as readonly string[]).includes(k), `${b.id} : ${k}`).toBe(true);
        const v = b.pouvoir.passif[k as keyof typeof b.pouvoir.passif]!;
        expect(Number.isSafeInteger(v) && v >= 1, `${b.id} : ${k} ${v}`).toBe(true);
      }
      const empreinte = JSON.stringify(Object.entries(b.pouvoir.passif).sort());
      expect(vus.has(empreinte), `${b.id} : même pouvoir qu'un autre`).toBe(false);
      vus.add(empreinte);
    }
    expect(new Set(BOSS.map((x) => x.pouvoir.nom)).size).toBe(BOSS.length);
  });

  it("ont une icône de 11 cases sur 11, aux couleurs écrites", () => {
    for (const b of BOSS) {
      const { rangees, teintes } = b.pouvoir.icone;
      expect(rangees.length, b.id).toBe(11);
      for (const r of rangees) {
        expect(r.length, b.id).toBe(11);
        for (const l of r) if (l !== ".") expect(teintes[l], `${b.id} : lettre ${l}`).toMatch(COULEUR);
      }
      expect(rangees.join("").replace(/\./g, "").length, `${b.id} : icône vide`).toBeGreaterThan(20);
    }
  });

  it("se battent devant une vraie bannière, qui n'est pas un trésor de la pochette", () => {
    for (const b of BOSS) {
      const ban = BANNIERES.find((x) => x.id === b.lieu.banniere);
      expect(ban, `${b.id} : ${b.lieu.banniere}`).toBeDefined();
      expect(ban!.famille, b.id).toBe(b.lieu.famille);
      expect(ban!.famille, b.id).not.toBe("tresors");
    }
  });

  it("parlent en mots, sans signes, et en douze mots au plus", () => {
    for (const b of BOSS) {
      for (const texte of [b.titre, b.pouvoir.nom, b.pouvoir.phrase, b.repliques.entree, b.repliques.vaincu, b.repliques.vainqueur]) {
        expect(SIGNES_INTERDITS.test(texte), `${b.id} : « ${texte} »`).toBe(false);
        expect(texte.trim().length, b.id).toBeGreaterThan(0);
      }
      for (const r of Object.values(b.repliques)) expect(motsDe(r), `${b.id} : « ${r} »`).toBeLessThanOrEqual(12);
      expect(motsDe(b.pouvoir.nom), b.id).toBeLessThanOrEqual(3);
    }
  });

  it("donnent leur pouvoir à leur camp seul, et le lieu aux deux", () => {
    for (const b of BOSS) {
      const lui = camp(b.main.map(carte), optionsDuBoss(b));
      const sans = camp(b.main.map(carte), { lieu: b.lieu.famille });
      for (const [k, v] of Object.entries(b.pouvoir.passif)) expect((lui.at[k as keyof typeof lui.at] ?? 0) - (sans.at[k as keyof typeof sans.at] ?? 0), `${b.id} : ${k}`).toBe(v);
      expect(optionsDuBoss(b).lieu, b.id).toBe(b.lieu.famille);
      expect(bossParId(b.id)).toBe(b);
    }
    expect(bossParId("inconnu")).toBeNull();
  });
});

describe("le boss du jour, choisi par la date", () => {
  it("commence le lundi 23 novembre 2026 et suit l'ordre du cycle", () => {
    expect(PREMIER_JOUR_DU_CYCLE).toBe("2026-11-23");
    for (let n = 0; n < 30; n++) {
      const midi = new Date(Date.UTC(2026, 10, 23 + n, 11));
      expect(bossDuJour(midi).id).toBe(ORDRE_DES_BOSS[n % ORDRE_DES_BOSS.length]);
    }
  });

  it("change à minuit, heure de Paris, en hiver comme en été", () => {
    expect(jourAParis(new Date("2026-11-23T22:59:59Z"))).toBe("2026-11-23");
    expect(jourAParis(new Date("2026-11-23T23:00:00Z"))).toBe("2026-11-24");
    expect(jourAParis(new Date("2027-07-01T21:59:59Z"))).toBe("2027-07-01");
    expect(jourAParis(new Date("2027-07-01T22:00:00Z"))).toBe("2027-07-02");
    expect(bossDuJour(new Date("2026-11-23T22:59:59Z")).id).toBe(ORDRE_DES_BOSS[0]);
    expect(bossDuJour(new Date("2026-11-23T23:00:00Z")).id).toBe(ORDRE_DES_BOSS[1]);
  });

  it("marche avant le premier jour, et d'une année sur l'autre", () => {
    expect(rangDuJour(new Date("2026-11-22T12:00:00Z"), 11)).toBe(10);
    expect(joursEntre("2026-11-23", "2027-11-23")).toBe(365);
    expect(rangDuJour(new Date("2027-11-23T12:00:00Z"), 11)).toBe(365 % 11);
    expect(() => rangDuJour(new Date(), 0)).toThrow();
  });

  it("ne met jamais deux jours de suite la même famille, ni la même rareté, même au retour du cycle", () => {
    const rangee = (id: string) => MODELES.find((m) => m.id === id)!;
    for (let i = 0; i < ORDRE_DES_BOSS.length; i++) {
      const a = rangee(ORDRE_DES_BOSS[i]!), b = rangee(ORDRE_DES_BOSS[(i + 1) % ORDRE_DES_BOSS.length]!);
      expect(a.famille, `${a.id} puis ${b.id}`).not.toBe(b.famille);
      expect(a.rarete, `${a.id} puis ${b.id}`).not.toBe(b.rarete);
    }
  });
});

describe("l'essai des boss", () => {
  // Le joueur de bon sens, avec une main tirée d'une garde-robe aisée, contre chaque boss joué par la machine des boss. Les
  // mêmes mains pour les onze, pour comparer les boss entre eux. Mesure complète (scripts/essai-duel-contenu.ts, 600 duels) :
  // tous à 5 points au plus de leur cible ; ici 150 duels, d'où la marge.
  it("vise des cibles de plus en plus dures avec la rareté, toutes plus dures qu'un duel ordinaire contre le guerrier", () => {
    const c = CIBLES_DES_BOSS;
    expect(c.commun > c["peu-commun"] && c["peu-commun"] > c.epique && c.epique > c.mystique && c.mystique > c.legendaire).toBe(true);
    expect(c.commun).toBeLessThan(50);
    expect(c.legendaire).toBeGreaterThanOrEqual(20);
  });
  it.each(BOSS.map((b) => [b.id, b] as const))("%s tombe près de sa cible", (_id, b) => {
    const cible = CIBLES_DES_BOSS[RARETES_DES_MODELES[b.id]!];
    const part = bonSensContreLeBoss(b, 150);
    expect(Math.abs(part - cible), `le joueur gagne ${part.toFixed(1)} sur 100, cible ${cible}`).toBeLessThanOrEqual(10);
  }, 60_000);
});
