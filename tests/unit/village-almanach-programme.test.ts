import { describe, expect, it } from "vitest";
import type { BatimentId } from "../../src/lib/village/chantier-liste";
import type { Phase } from "../../src/lib/village/lumiere";
import {
  CRENEAU,
  CYCLE_DE_L_ALMANACH,
  type ContexteDuProgramme,
  MINUTE,
  ProgrammeDeLAlmanach,
  creneauDuTemps,
  jourDuCreneau,
  lireLesMoments,
  momentDuCreneau,
  momentsJouables,
  ouvertureDuCreneau,
  phaseDuCreneau,
  tempsDuMonde,
} from "../../src/lib/village/monde/almanach/programme";
import { taillesDesDessins } from "../../src/lib/village/monde/composition";
import { CYCLE, LANCEMENT, lutinsDesEvenements } from "../../src/lib/village/monde/evenements";
import { planDuMonde } from "../../src/lib/village/monde/plan";
import { DESSINS_OPENFRONT, type PieceOpenFrontId } from "../../src/lib/village/openfront";
import { PAR_ID, momentsDEssai } from "./village-almanach-outils";

const PHASES: Phase[] = ["aube", "jour", "crepuscule", "nuit"];
/** Beaucoup de moments, de chaque phase : plus qu'il n'y a de créneaux dans une journée. */
const NOMBREUX = momentsDEssai(Array.from({ length: 300 }, (_v, i) => ({ phases: [PHASES[i % 4]!] })));
const TOUS_FINIS = new Set<BatimentId>(["puits", "moulin", "palissade"]);
const contexte = (moments = NOMBREUX, finis: ReadonlySet<BatimentId> = TOUS_FINIS, figurants = PAR_ID): ContexteDuProgramme => ({ moments, figurants, finis });

/** Les créneaux d'un jour de Paris, le 16 novembre 2026. */
const premier = creneauDuTemps(tempsDuMonde(Date.parse("2026-11-15T23:30:00Z")));
const JOUR = Array.from({ length: 80 }, (_v, k) => premier + k).filter((n) => jourDuCreneau(n) === jourDuCreneau(premier + 40));

describe("le programme de l'almanach", () => {
  it("tient un créneau de deux minutes et demie, une minute après le premier échange de tirs, une minute avant le second", () => {
    expect(CYCLE_DE_L_ALMANACH).toBe(2 * CYCLE);
    expect(CRENEAU.fin - CRENEAU.debut).toBe(150 * 8);
    expect(JOUR.length).toBeGreaterThanOrEqual(71);
    expect(JOUR.length).toBeLessThanOrEqual(73);
  });

  it("donne le même moment au même instant, sur deux écrans comme dans le calcul sans mémoire", () => {
    const a = new ProgrammeDeLAlmanach(contexte());
    const b = new ProgrammeDeLAlmanach(contexte());
    // L'un regarde la journée dans l'ordre, l'autre à rebours : mêmes choix.
    const avant = JOUR.map((n) => a.creneau(n)?.moment.id ?? null);
    const arebours = [...JOUR].reverse().map((n) => b.creneau(n)?.moment.id ?? null).reverse();
    expect(arebours).toEqual(avant);
    for (const n of JOUR.filter((_n, k) => k % 9 === 0)) {
      const i = momentDuCreneau(n, contexte());
      expect(i === null ? null : NOMBREUX[i]!.id).toBe(avant[JOUR.indexOf(n)]);
    }
    expect(avant.every((id) => id !== null)).toBe(true);
  });

  it("ne joue jamais pendant un événement d'OpenFront : une minute de calme avant et après, et le missile reste dans son silo", () => {
    const programme = new ProgrammeDeLAlmanach(contexte());
    const tailles = (id: PieceOpenFrontId) => DESSINS_OPENFRONT[id];
    for (const habitants of [0, 1000]) {
      const plan = planDuMonde(taillesDesDessins(), habitants);
      for (const n of JOUR.slice(0, 6)) {
        const prevu = programme.creneau(n)!;
        expect(prevu.debut).toBeGreaterThanOrEqual(ouvertureDuCreneau(n));
        expect(prevu.fin).toBeLessThanOrEqual(n * CYCLE_DE_L_ALMANACH + CRENEAU.fin);
        for (let t = prevu.debut - MINUTE; t <= prevu.fin + MINUTE; t += 4) {
          expect(programme.duCycle(t)).toBe(prevu);
          expect(lutinsDesEvenements(plan, tailles, t, { lancement: programme.duCycle(t) === null }), `créneau ${n}, temps ${t}`).toEqual([]);
        }
        // Sans le moment, le missile serait parti dans ce créneau.
        const lancement = n * CYCLE_DE_L_ALMANACH + CYCLE + LANCEMENT + 100;
        expect(lutinsDesEvenements(plan, tailles, lancement).length).toBeGreaterThan(0);
        // Dans le premier cycle des vingt minutes, rien n'est prévu : le missile part.
        expect(programme.duCycle(n * CYCLE_DE_L_ALMANACH + LANCEMENT + 100)).toBeNull();
      }
    }
  });

  it("ne choisit que des moments de la phase de l'heure du créneau", () => {
    const programme = new ProgrammeDeLAlmanach(contexte());
    const phases = new Set<Phase>();
    for (const n of JOUR) {
      const phase = phaseDuCreneau(n);
      phases.add(phase);
      expect(programme.creneau(n)!.moment.phases).toContain(phase);
    }
    expect([...phases].sort()).toEqual(["aube", "crepuscule", "jour", "nuit"]);
  });

  it("ne choisit que des moments dont les bâtiments sont finis, ceux du lieu compris", () => {
    const moments = momentsDEssai([
      ...Array.from({ length: 8 }, () => ({ phases: PHASES, batiments: ["moulin"] as BatimentId[] })),
      ...Array.from({ length: 8 }, () => ({ phases: PHASES, ancre: "au-puits" })),
      { phases: PHASES },
    ]);
    const sans = new ProgrammeDeLAlmanach(contexte(moments, new Set()));
    for (const n of JOUR) expect(sans.creneau(n)!.moment.id).toBe("m017");
    expect(momentsJouables(contexte(moments, new Set(["moulin"])))).toHaveLength(9);
    expect(momentsJouables(contexte(moments, new Set(["moulin", "puits"])))).toHaveLength(17);
  });

  it("ne repasse pas un moment dans la journée tant qu'il en reste d'autres, puis reprend le plus ancien", () => {
    const programme = new ProgrammeDeLAlmanach(contexte());
    const vus = JOUR.map((n) => programme.creneau(n)!.moment.id);
    expect(new Set(vus).size).toBe(vus.length);
    // Trois moments de nuit seulement : les trois passent avant qu'aucun ne revienne, puis dans le même ordre.
    const peu = momentsDEssai([{ phases: ["nuit"] }, { phases: ["nuit"] }, { phases: ["nuit"] }]);
    const p = new ProgrammeDeLAlmanach(contexte(peu));
    const nuit = JOUR.filter((n) => phaseDuCreneau(n) === "nuit").slice(0, 9).map((n) => p.creneau(n)!.moment.id);
    expect(new Set(nuit.slice(0, 3)).size).toBe(3);
    expect(nuit.slice(3, 6)).toEqual(nuit.slice(0, 3));
    expect(nuit.slice(6, 9)).toEqual(nuit.slice(0, 3));
    // Le jour, il ne se passe rien : aucun moment n'est de jour.
    expect(JOUR.filter((n) => phaseDuCreneau(n) === "jour").every((n) => p.creneau(n) === null)).toBe(true);
  });

  it("change l'ordre d'un jour à l'autre", () => {
    const programme = new ProgrammeDeLAlmanach(contexte());
    const lendemain = JOUR.map((n) => n + 72);
    const a = JOUR.slice(0, 20).map((n) => programme.creneau(n)!.moment.id);
    const b = lendemain.slice(0, 20).map((n) => programme.creneau(n)?.moment.id ?? null);
    expect(b).not.toEqual(a);
  });

  it("ne fait rien sans moments, sans figurants dessinés, ou quand aucun ne convient", () => {
    const plan = planDuMonde(taillesDesDessins(), 0);
    for (const ctx of [contexte([]), contexte(NOMBREUX, TOUS_FINIS, new Map()), contexte(momentsDEssai([{ phases: PHASES, batiments: ["grande-tour"] }]))]) {
      const programme = new ProgrammeDeLAlmanach(ctx);
      expect(programme.vide).toBe(true);
      for (const n of JOUR.slice(0, 10)) {
        expect(programme.creneau(n)).toBeNull();
        expect(programme.lutins(plan, ouvertureDuCreneau(n) + 400)).toEqual([]);
        expect(momentDuCreneau(n, ctx)).toBeNull();
      }
    }
  });

  it("montre les rôles du moment pendant qu'il passe, et rien avant ni après", () => {
    const programme = new ProgrammeDeLAlmanach(contexte());
    const plan = planDuMonde(taillesDesDessins(), 50);
    const prevu = programme.creneau(JOUR[10]!)!;
    expect(programme.lutins(plan, prevu.debut - 1)).toEqual([]);
    expect(programme.lutins(plan, prevu.fin + 1)).toEqual([]);
    const milieu = programme.lutins(plan, Math.floor((prevu.debut + prevu.fin) / 2));
    expect(milieu).toHaveLength(1);
    const point = prevu.ancre.point(plan);
    expect(milieu[0]!.pied).toBe(point.y);
  });

  it("compte l'heure en huitièmes de seconde depuis 1970", () => {
    expect(tempsDuMonde(0)).toBe(0);
    expect(tempsDuMonde(1000)).toBe(8);
    expect(tempsDuMonde(1124)).toBe(8);
    expect(tempsDuMonde(1125)).toBe(9);
  });
});

describe("la lecture de moments.json par l'écran", () => {
  it("garde les moments bien formés et laisse le reste de côté", () => {
    const [bon] = momentsDEssai([{ phases: ["jour"] }]);
    expect(lireLesMoments([bon])).toEqual([bon]);
    expect(lireLesMoments(null)).toEqual([]);
    expect(lireLesMoments({ moments: [bon] })).toEqual([]);
    expect(lireLesMoments([{ ...bon, phases: ["midi"] }, { ...bon, roles: [] }, { ...bon, duree: "trente" }, bon])).toEqual([bon]);
    expect(lireLesMoments([{ ...bon, roles: [{ figurant: "essai-sol", etapes: [{ t: 0, x: 0, y: 0 }] }] }])).toEqual([]);
  });
});
