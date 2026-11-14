import { describe, expect, it } from "vitest";
import { taillesDesDessins } from "../../src/lib/village/monde/composition";
import { CYCLE, lutinsDesEvenements } from "../../src/lib/village/monde/evenements";
import { cadreDeLArbre } from "../../src/lib/village/monde/arbres";
import { TAILLES_DES_BETES, betesDuPlan } from "../../src/lib/village/monde/betes";
import { SALLE_LARGEUR } from "../../src/lib/village/monde/salles";
import { bandeDeLaTerrasse } from "../../src/lib/village/monde/lointain";
import { MODELES, litsDeLaMaison } from "../../src/lib/village/monde/maisons";
import { AU_DESSUS, BANDE_BAS, CIEL, HABITANTS_MAX, LIGNE, LISIERE_DU_FOND, PAS_DE_TERRASSE, PREMIERE_TERRASSE, type Plan, cadrageDuMonde, emplacementsDe, logisDuRang, maisonsPour, planDuMonde } from "../../src/lib/village/monde/plan";
import { placesDuLieu, zoneDuPromeneur } from "../../src/lib/village/monde/postes";
import { DESSINS_OPENFRONT } from "../../src/lib/village/openfront";

const tailles = taillesDesDessins();
const rangs = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
/** Le nombre de maisons du village : trois sur la grand-rue, les autres sur les terrasses du fond. */
const maisonsDuPlan = (plan: Plan): number => emplacementsDe(plan, "maison").length + plan.lointaines.reduce((somme, t) => somme + t.places.filter((p) => p.rang !== null).length, 0);

describe("le plan du monde du village, de 0 à 1 000 Gaulois", () => {
  it("bâtit une maison de 4 lits par tranche de 4 Gaulois, trois au moins", () => {
    expect(maisonsPour(0)).toBe(3);
    expect(maisonsPour(12)).toBe(3);
    expect(maisonsPour(13)).toBe(4);
    expect(maisonsPour(100)).toBe(25);
    expect(maisonsPour(1000)).toBe(250);
    expect(maisonsPour(5000)).toBe(250);
    for (const n of [0, 15, 100, 300, 1000]) {
      const plan = planDuMonde(tailles, n);
      expect(emplacementsDe(plan, "maison")).toHaveLength(3);
      expect(maisonsDuPlan(plan)).toBe(maisonsPour(n));
      // Chaque maison a son rang, une seule fois.
      const rangsDesMaisons = plan.lointaines.flatMap((t) => t.places.flatMap((p) => (p.rang === null ? [] : [p.rang])));
      expect(new Set(rangsDesMaisons).size).toBe(rangsDesMaisons.length);
      expect([...rangsDesMaisons].sort((a, b) => a - b)).toEqual(Array.from({ length: maisonsPour(n) - 3 }, (_, i) => i + 3));
    }
  });

  it("donne le même monde pour le même nombre, et ne le fait bouger que quand le nombre change de tranche", () => {
    expect(planDuMonde(tailles, 100)).toEqual(planDuMonde(tailles, 100));
    const a = planDuMonde(tailles, 13);
    const b = planDuMonde(tailles, 16);
    expect(a.lointaines).toEqual(b.lointaines);
    expect(a.dy0).toBe(b.dy0);
  });

  it("étage les maisons sur des terrasses du fond : deux au moins, des jardins sur une place sur cinq, la plus haute juste sous les lointains", () => {
    for (const n of [0, 15, 100, 300, 400, 1000]) {
      const plan = planDuMonde(tailles, n);
      expect(plan.terrasses).toBe(plan.lointaines.length);
      expect(plan.terrasses).toBeGreaterThanOrEqual(2);
      const ligne = plan.dy0 + LIGNE;
      plan.lointaines.forEach((t, k) => {
        expect(t.rang).toBe(k + 1);
        // Une case du fond vaut une demi-case du monde : la ligne de la terrasse, en rangées du monde.
        expect(t.sol / 2).toBe(ligne - PREMIERE_TERRASSE - k * PAS_DE_TERRASSE);
        if (k > 0) expect(t.parallaxe).toBeLessThan(plan.lointaines[k - 1]!.parallaxe);
        expect(t.parallaxe).toBeGreaterThan(0);
        expect(t.parallaxe).toBeLessThan(1);
        // Les places se suivent sans se chevaucher, entre les deux bouts de forêt ; jamais deux voisines du même modèle.
        t.places.forEach((p, i) => {
          expect(p.x).toBeGreaterThanOrEqual(LISIERE_DU_FOND);
          expect(p.x + MODELES[p.modele].largeur).toBeLessThanOrEqual(t.largeur - LISIERE_DU_FOND);
          if (i > 0) {
            const avant = t.places[i - 1]!;
            expect(p.x).toBeGreaterThanOrEqual(avant.x + MODELES[avant.modele].largeur + 60);
            expect(p.modele).not.toBe(avant.modele);
          }
        });
        expect(t.places.filter((p) => p.rang !== null).length).toBeLessThanOrEqual(Math.floor(t.places.length * 0.8));
        // Le talus descend jusque derrière ce qui est devant la terrasse.
        const bande = bandeDeLaTerrasse(t);
        const devant = k === 0 ? ligne : plan.lointaines[k - 1]!.sol / 2;
        expect((bande.haut + bande.hauteur) / 2).toBeGreaterThan(devant);
        // Le plus grand arbre tient dans la bande.
        expect(t.sol - bande.haut).toBeGreaterThanOrEqual(cadreDeLArbre("hetre", 0, 1.14).hauteur);
      });
      expect(plan.lointaines[plan.terrasses - 1]!.sol / 2).toBe(CIEL + AU_DESSUS);
      expect(plan.hauteur).toBeGreaterThan(plan.dyBas);
      expect(plan.largeur).toBeGreaterThan(plan.mer.de);
    }
    // La cible du pilote : 250 à 350 Gaulois vivent bien, sur peu de terrasses ; 1 000 tiennent encore.
    expect(planDuMonde(tailles, 250).terrasses).toBeLessThanOrEqual(3);
    expect(planDuMonde(tailles, 350).terrasses).toBeLessThanOrEqual(4);
    expect(planDuMonde(tailles, 1000).terrasses).toBeLessThanOrEqual(12);
  });

  it("cadre la grand-rue en bas de l'écran, la colline au-dessus d'elle ; ailleurs, le point visé au milieu", () => {
    const plan = planDuMonde(tailles, 300);
    const cadrer = cadrageDuMonde(plan);
    expect(cadrer(plan.dy0 + 190, 500) + 500).toBe(plan.dy0 + BANDE_BAS + 14);
    expect(cadrer(plan.dyBas + 230, 500)).toBe(plan.dyBas + 230 - 250);
    expect(cadrer(100, 400)).toBe(-100);
  });

  it("donne à chacun des 1 000 Gaulois son lit, dans la maison de son rang, sur la grand-rue ou sur sa terrasse", () => {
    const plan = planDuMonde(tailles, HABITANTS_MAX);
    const lits = placesDuLieu(plan, "maisons", rangs(HABITANTS_MAX));
    expect(new Set(lits.map((p) => `${p.parallaxe ?? 1}:${p.x},${p.y}`)).size).toBe(HABITANTS_MAX);
    lits.forEach((lit, rang) => {
      const logis = logisDuRang(plan, rang);
      const modele = MODELES[logis.modele];
      expect(lit.x).toBeGreaterThanOrEqual(logis.x);
      expect(lit.x + 72).toBeLessThanOrEqual(logis.x + modele.largeur);
      expect(lit.y).toBeGreaterThan(logis.pied - modele.hauteur);
      expect(lit.y + 40).toBeLessThanOrEqual(logis.pied);
      // Les douze premiers dorment sur la grand-rue, au premier plan ; les autres au fond, à l'échelle de leur terrasse.
      if (rang < 12) expect(lit.echelle).toBeUndefined();
      else {
        expect(lit.echelle).toBe(0.5);
        expect(lit.parallaxe).toBe(logis.terrasse!.parallaxe);
        expect(lit.saut).toBe(true);
      }
    });
    // Dans une maison retournée, les lits restent dans la maison.
    for (const modele of Object.values(MODELES)) for (const variante of [1, 2, 3, 4, 5, 6]) for (const lit of litsDeLaMaison(modele, variante)) expect(lit.x >= 0 && lit.x + 72 <= modele.largeur && lit.y <= modele.hauteur && lit.y >= 40).toBe(true);
  });

  it("garde les tables des deux salles dans la salle elle-même, l'annexe à droite, et met des bêtes sur chaque terrasse", () => {
    const plan = planDuMonde(tailles, 300);
    for (const lieu of ["taverne", "reunion"] as const) {
      const e = emplacementsDe(plan, lieu)[0]!;
      expect(e.largeur).toBeGreaterThan(SALLE_LARGEUR);
      // Les quinze sièges du dedans tiennent entre les deux poteaux de la salle.
      for (const place of placesDuLieu(plan, lieu, rangs(15))) {
        expect(place.x).toBeGreaterThanOrEqual(e.x + 12);
        expect(place.x + 48).toBeLessThanOrEqual(e.x + SALLE_LARGEUR - 12);
      }
    }
    const betes = betesDuPlan(plan);
    for (const t of plan.lointaines) {
      const ici = betes.filter((b) => b.fond?.parallaxe === t.parallaxe);
      expect(ici.length).toBeGreaterThanOrEqual(4);
      for (const b of ici) {
        expect(b.fond!.voile).toBe(t.voile);
        expect(b.zone.de).toBeLessThan(b.zone.a);
        expect(b.zone.de).toBeGreaterThanOrEqual(0);
        expect(b.zone.a).toBeLessThan(t.largeur);
        // Ses pattes restent sur le sentier de la terrasse.
        expect(b.zone.haut + TAILLES_DES_BETES[b.bete].hauteur).toBeGreaterThan(t.sol);
        expect(b.zone.bas + TAILLES_DES_BETES[b.bete].hauteur).toBeLessThan(t.sol + 26);
      }
    }
    expect(betes.filter((b) => !b.fond).length).toBeGreaterThanOrEqual(8);
  });

  it("assoit à l'aise un quart des Gaulois à la taverne et un cinquième à la réunion, et range les combattants sur le pré", () => {
    for (const n of [15, 100, 1000]) {
      const plan = planDuMonde(tailles, n);
      for (const [lieu, part] of [
        ["taverne", 4],
        ["reunion", 5],
      ] as const) {
        const nombre = Math.ceil(n / part);
        const places = placesDuLieu(plan, lieu, rangs(nombre));
        expect(places).toHaveLength(nombre);
        expect(new Set(places.map((p) => `${p.x},${p.y}`)).size).toBe(nombre);
      }
      const combat = placesDuLieu(plan, "bataille", rangs(Math.ceil(n / 5)));
      for (const p of combat) {
        expect(p.x).toBeGreaterThanOrEqual(plan.pre.x - 60);
        expect(p.x).toBeLessThan(plan.pre.front);
      }
    }
  });

  it("promène chacun dans le monde : sa zone tient dans le monde, sa place de départ dans sa zone", () => {
    const plan = planDuMonde(tailles, 1000);
    const places = placesDuLieu(plan, "place", rangs(1000));
    places.forEach((place, rang) => {
      const zone = zoneDuPromeneur(plan, rang);
      expect(zone.de).toBeLessThan(zone.a);
      expect(zone.haut).toBeLessThanOrEqual(zone.bas);
      if (zone.echelle) {
        // Sur une terrasse du fond : la zone tient sur son sentier, et la place porte le plan de la terrasse.
        const t = logisDuRang(plan, rang).terrasse!;
        expect(zone.de).toBeGreaterThanOrEqual(0);
        expect(zone.a + 48).toBeLessThanOrEqual(t.largeur);
        expect(zone.haut + 64).toBeGreaterThan(t.sol);
        expect(zone.bas + 64).toBeLessThan(t.sol + 26);
        expect(place.echelle).toBe(0.5);
        expect(place.parallaxe).toBe(t.parallaxe);
      } else {
        expect(zone.bas).toBeLessThan(plan.hauteur);
        expect(place.echelle).toBeUndefined();
      }
      expect(place.x).toBeGreaterThanOrEqual(zone.de);
      expect(place.x).toBeLessThanOrEqual(zone.a);
      expect(place.y).toBeGreaterThanOrEqual(zone.haut);
      expect(place.y).toBeLessThanOrEqual(zone.bas);
    });
  });
});

describe("les événements du monde d'OpenFront", () => {
  const plan = planDuMonde(tailles, 15);
  const taille = (id: keyof typeof DESSINS_OPENFRONT) => DESSINS_OPENFRONT[id];

  it("rejouent la même scène à la même heure du cycle", () => {
    expect(lutinsDesEvenements(plan, taille, 1234)).toEqual(lutinsDesEvenements(plan, taille, 1234 + CYCLE));
  });

  it("restent calmes : la plupart du temps rien d'autre que le train, jamais plus d'un combat à la fois", () => {
    let vides = 0;
    for (let t = 0; t < CYCLE; t += 8) {
      const lutins = lutinsDesEvenements(plan, taille, t).filter((l) => !l.cle.startsWith("train"));
      if (lutins.length === 0) vides++;
      const sortes = new Set(lutins.map((l) => (l.cle.startsWith("notre") || l.cle.startsWith("leur") ? "duel" : l.cle.startsWith("silo") || l.cle === "missile" || l.cle === "explosion" ? "missile" : "interception")));
      expect(sortes.size).toBeLessThanOrEqual(1);
    }
    // Plus des trois quarts du temps, ni tir ni missile.
    expect(vides / (CYCLE / 8)).toBeGreaterThan(0.75);
  });

  it("gardent chaque dessin dans le monde ou juste à son bord, et le train sur sa voie", () => {
    for (let t = 0; t < CYCLE; t += 4) {
      for (const lutin of lutinsDesEvenements(plan, taille, t)) {
        expect(lutin.x).toBeGreaterThan(-700);
        expect(lutin.x).toBeLessThan(plan.largeur + 100);
        expect(lutin.y).toBeGreaterThan(-200);
        expect(lutin.y).toBeLessThan(plan.hauteur);
        // Le train ne se voit jamais au-delà du dépôt du port, au bout de la voie.
        if (lutin.cle.startsWith("train")) expect(lutin.coupeADroite).toBeLessThanOrEqual(plan.voie.a);
      }
    }
  });
});
