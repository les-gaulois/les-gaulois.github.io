import { describe, expect, it } from "vitest";
import { ancreDe } from "../../src/lib/village/monde/almanach/ancres";
import { FIGURANTS } from "../../src/lib/village/monde/almanach/figurants";
import { PROFONDEUR_DU_CIEL, imageDuFigurant, instantDuRole, lutinsDuMoment } from "../../src/lib/village/monde/almanach/jeu";
import { MOMENTS, type MomentEcrit, type RaisonDuRefus, sontDoublons, validerMoment } from "../../src/lib/village/monde/almanach/moment";
import moments from "../../src/lib/village/monde/almanach/moments.json";
import { REGLAGES } from "../../src/lib/village/monde/almanach/reglages-figurants";
import { ESSAI_CIEL, ESSAI_SOL, PAR_ID, traversee } from "./village-almanach-outils";

const catalogue = { figurants: PAR_ID, ancre: ancreDe };
const raison = (m: MomentEcrit): RaisonDuRefus | null => validerMoment(m, catalogue)?.raison ?? null;
/** La traversée d'essai, avec ses étapes changées. */
const avecEtapes = (etapes: MomentEcrit["roles"][number]["etapes"], options: Partial<MomentEcrit> = {}): MomentEcrit => traversee({ roles: [{ figurant: "essai-sol", etapes }], ...options });

describe("la validation d'un moment de l'almanach", () => {
  it("garde un moment qui suit toutes les règles", () => {
    expect(validerMoment(traversee(), catalogue)).toBeNull();
  });

  it("refuse un titre vide, trop long ou fait de signes", () => {
    expect(raison(traversee({ titre: "" }))).toBe("titre invalide");
    expect(raison(traversee({ titre: "Une très longue phrase qui ne sert à rien d'autre qu'à dépasser la limite" }))).toBe("titre invalide");
    expect(raison(traversee({ titre: "<b>oies</b>" }))).toBe("titre invalide");
  });

  it("refuse des phases vides, répétées ou inconnues", () => {
    expect(raison(traversee({ phases: [] }))).toBe("phases invalides");
    expect(raison(traversee({ phases: ["jour", "jour"] }))).toBe("phases invalides");
    expect(raison(traversee({ phases: ["midi" as "jour"] }))).toBe("phases invalides");
  });

  it("refuse un bâtiment inconnu ou répété", () => {
    expect(raison(traversee({ batiments: ["donjon" as "puits"] }))).toBe("bâtiment inconnu");
    expect(raison(traversee({ batiments: ["puits", "puits"] }))).toBe("bâtiment inconnu");
    expect(raison(traversee({ batiments: ["puits"] }))).toBeNull();
  });

  it("refuse un lieu inconnu", () => {
    expect(raison(traversee({ ancre: "la-lune" }))).toBe("lieu inconnu");
  });

  it("borne la durée de 15 à 120 secondes", () => {
    expect(raison(traversee({ duree: 10 }))).toBe("durée hors des bornes");
    expect(raison(traversee({ duree: 121 }))).toBe("durée hors des bornes");
  });

  it("veut de 1 à 4 rôles", () => {
    expect(raison(traversee({ roles: [] }))).toBe("nombre de rôles hors des bornes");
    const role = traversee().roles[0]!;
    expect(raison(traversee({ roles: [role, role, role, role, role] }))).toBe("nombre de rôles hors des bornes");
  });

  it("ne connaît que les figurants du catalogue, à leurs heures", () => {
    expect(raison(traversee({ roles: [{ ...traversee().roles[0]!, figurant: "dragon" }] }))).toBe("figurant inconnu");
    expect(raison(traversee({ roles: [{ ...traversee().roles[0]!, figurant: "essai-nuit" }] }))).toBe("figurant hors de ses heures");
    expect(raison(traversee({ phases: ["nuit"], roles: [{ ...traversee().roles[0]!, figurant: "essai-nuit" }] }))).toBeNull();
  });

  it("refuse un figurant dont le milieu n'a pas de zone au lieu", () => {
    expect(raison(traversee({ roles: [{ ...traversee().roles[0]!, figurant: "essai-eau" }] }))).toBe("milieu absent du lieu");
    expect(raison(traversee({ roles: [{ ...traversee().roles[0]!, figurant: "essai-toit" }] }))).toBe("milieu absent du lieu");
  });

  it("veut de 2 à 12 étapes, dans l'ordre et dans la durée", () => {
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }]))).toBe("nombre d'étapes hors des bornes");
    const treize = Array.from({ length: 13 }, (_v, i) => ({ t: i * 2, x: 0, y: 0, o: i === 0 || i === 12 ? 0 : 1 }));
    expect(raison(avecEtapes(treize))).toBe("nombre d'étapes hors des bornes");
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 30, x: 0, y: 0, o: 0 }]))).toBe("étapes en désordre");
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 31, x: 0, y: 0, o: 0 }]))).toBe("étapes en désordre");
    expect(raison(avecEtapes([{ t: 0, x: 0.5, y: 0, o: 0 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 30, x: 0, y: 0, o: 0 }]))).toBe("étapes en désordre");
  });

  it("veut une entrée et une sortie en fondu, sans rien qui clignote", () => {
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 1 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 30, x: 0, y: 0, o: 0 }]))).toBe("entrée brusque");
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }, { t: 1, x: 0, y: 0, o: 0.4 }, { t: 30, x: 0, y: 0, o: 0 }]))).toBe("entrée brusque");
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 30, x: 0, y: 0, o: 0.2 }]))).toBe("sortie brusque");
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 29, x: 0, y: 0, o: 1 }, { t: 30, x: 0, y: 0, o: 0 }]))).toBe("sortie brusque");
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }, { t: 5, x: 0, y: 0, o: 1 }, { t: 6, x: 0, y: 0, o: 0.2 }, { t: 10, x: 0, y: 0, o: 1 }, { t: 30, x: 0, y: 0, o: 0 }]))).toBe("fondu trop vif");
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 0, o: 0 }, { t: 5, x: 0, y: 0, o: 0.3 }, { t: 30, x: 0, y: 0, o: 0 }]))).toBe("rôle jamais visible");
  });

  it("borne la vitesse par l'allure du figurant, et ne laisse pas bouger ce qui est posé", () => {
    // Au pas : 12 cases par seconde au plus.
    expect(raison(avecEtapes([{ t: 0, x: -200, y: 0, o: 0 }, { t: 3, x: -170, y: 0, o: 1 }, { t: 20, x: 170, y: 0, o: 1 }, { t: 30, x: 200, y: 0, o: 0 }]))).toBe("trop vite pour son allure");
    const pose = { figurant: "essai-pose", etapes: [{ t: 0, x: 0, y: 0, o: 0 }, { t: 4, x: 0, y: 0, o: 1 }, { t: 26, x: 1, y: 0, o: 1 }, { t: 30, x: 1, y: 0, o: 0 }] };
    expect(raison(traversee({ roles: [pose] }))).toBe("trop vite pour son allure");
    pose.etapes[2]!.x = 0;
    pose.etapes[3]!.x = 0;
    expect(raison(traversee({ roles: [pose] }))).toBeNull();
  });

  it("garde un figurant de sol sur le sol, jusqu'au bout de sa largeur, et dans la place du lieu", () => {
    // Le pied à 40 cases sous le point : hors de la rue.
    expect(raison(avecEtapes([{ t: 0, x: 0, y: 40, o: 0 }, { t: 5, x: 0, y: 40, o: 1 }, { t: 30, x: 0, y: 40, o: 0 }]))).toBe("hors de son milieu");
    // Le milieu du pied à 390 : le bout droit du dessin (40 cases de large) dépasse la zone, qui finit à 400.
    expect(raison(avecEtapes([{ t: 0, x: 390, y: 0, o: 0 }, { t: 5, x: 390, y: 0, o: 1 }, { t: 30, x: 390, y: 0, o: 0 }]))).toBe("hors de son milieu");
    // Un oiseau qui vole au ras du sol de la rue n'est pas dans le ciel.
    const vol = (y: number, figurant = "essai-ciel") => ({ figurant, etapes: [{ t: 0, x: -100, y, o: 0 }, { t: 3, x: -40, y, o: 1 }, { t: 27, x: 40, y, o: 1 }, { t: 30, x: 100, y, o: 0 }] });
    expect(raison(traversee({ roles: [vol(0)] }))).toBe("hors de son milieu");
    expect(raison(traversee({ roles: [vol(-300)] }))).toBeNull();
    // Un grand oiseau tout en haut de sa zone : son pied est dans le ciel, sa tête sort de la place du lieu.
    const ancre = ancreDe("rue-des-maisons")!;
    const grand = { ...ESSAI_CIEL, id: "essai-grand", hauteur: 130 };
    const zone = ancre.zones.find((z) => z.milieu === "ciel")!;
    expect(zone.haut - grand.hauteur + 1).toBeLessThan(-ancre.place.dessus);
    const avecLeGrand = { figurants: new Map([...PAR_ID, ["essai-grand", grand]]), ancre: ancreDe };
    expect(validerMoment(traversee({ roles: [vol(zone.haut, "essai-grand")] }), avecLeGrand)?.raison).toBe("hors de la place du lieu");
  });

  it("contrôle chaque huitième de seconde du chemin, pas seulement les étapes", () => {
    // Au gué : deux étapes sur la rive ouest et sur la rive est, la ligne droite entre elles passe dans l'eau.
    const gue = ancreDe("gue-du-ruisseau")!;
    const sols = gue.zones.filter((z) => z.milieu === "sol" && z.haut <= 0 && z.bas >= 0);
    const ouest = sols.find((z) => z.de < 0)!;
    const est = sols.find((z) => z.de > 0)!;
    const y = 0;
    const etapes = [
      { t: 0, x: ouest.a - 100, y, o: 0 },
      { t: 3, x: ouest.a - 70, y, o: 1 },
      { t: 27, x: est.de + 70, y, o: 1 },
      { t: 30, x: est.de + 100, y, o: 0 },
    ];
    expect(etapes.every((e) => (e.x - 20 >= est.de || e.x + 19 <= ouest.a))).toBe(true);
    expect(raison(avecEtapes(etapes, { ancre: "gue-du-ruisseau" }))).toBe("hors de son milieu");
  });

  it("veut que la dernière étape tombe à la durée, à trois secondes près", () => {
    expect(raison(traversee({ duree: 40 }))).toBe("durée qui ne colle pas aux étapes");
    expect(raison(traversee({ duree: 32 }))).toBeNull();
  });

  it("dit en nombres et en identifiants le détail d'un refus", () => {
    const refus = validerMoment(avecEtapes([{ t: 0, x: 0, y: 40, o: 0 }, { t: 5, x: 0, y: 40, o: 1 }, { t: 30, x: 0, y: 40, o: 0 }]), catalogue);
    expect(refus?.detail).toMatch(/^rôle 1 à [0-9.]+ s : 0, 40$/);
  });
});

describe("les réglages des vrais figurants", () => {
  const vrais = new Map(FIGURANTS.map((f) => [f.id, f]));
  const reel = { figurants: vrais, ancre: ancreDe };

  it("ne parlent que de figurants dessinés", () => {
    for (const id of Object.keys(REGLAGES)) expect(vrais.has(id), id).toBe(true);
  });

  it("posent le pêcheur sur la rive, son fil dans l'eau, et pas ailleurs", () => {
    const gue = ancreDe("gue-du-ruisseau")!;
    const ouest = gue.zones.find((z) => z.milieu === "sol" && z.de < 0 && z.haut <= -9 && z.bas >= -9)!;
    // Son corps (colonnes 0 à 41) finit au bord de la rive : sa gauche est à 41 cases avant.
    const gauche = ouest.a - 41;
    const x = gauche + 36;
    const peche = (dx: number): MomentEcrit => ({
      titre: "Un pêcheur au gué",
      phases: ["jour"],
      batiments: [],
      ancre: "gue-du-ruisseau",
      duree: 40,
      roles: [{ figurant: "pecheur-sur-la-rive", etapes: [{ t: 0, x: x + dx, y: -9, o: 0 }, { t: 4, x: x + dx, y: -9, o: 1 }, { t: 36, x: x + dx, y: -9, o: 1 }, { t: 40, x: x + dx, y: -9, o: 0 }] }],
    });
    expect(validerMoment(peche(0), reel)).toBeNull();
    // Trop loin de l'eau : son fil tombe dans l'herbe.
    expect(validerMoment(peche(-60), reel)?.raison).toBe("hors de son milieu");
    // Sur la rive est, l'eau à sa gauche : son fil tombe dans l'herbe, il ne se retourne pas.
    const est = gue.zones.find((z) => z.milieu === "sol" && z.de > 0 && z.haut <= -9 && z.bas >= -9)!;
    expect(validerMoment(peche(est.de + 36 - x), reel)?.raison).toBe("hors de son milieu");
  });

  it("ne laissent l'étoile filante et la fumée aller que vers la droite, et ne les retournent jamais", () => {
    const etoile = vrais.get("etoile-filante")!;
    const filer = (sens: 1 | -1): MomentEcrit => ({
      titre: "Une étoile filante",
      phases: ["nuit"],
      batiments: [],
      ancre: "ciel-de-la-place",
      duree: 30,
      roles: [{ figurant: "etoile-filante", etapes: [{ t: 0, x: -50 * sens, y: 0, o: 0 }, { t: 3, x: -38 * sens, y: 0, o: 1 }, { t: 27, x: 38 * sens, y: 0, o: 1 }, { t: 30, x: 50 * sens, y: 0, o: 0 }] }],
    });
    expect(validerMoment(filer(1), reel)).toBeNull();
    expect(validerMoment(filer(-1), reel)?.raison).toBe("à rebours de son dessin");
    // Même si un moment la faisait aller à gauche, l'écran ne la retournerait pas.
    const lutins = lutinsDuMoment(filer(-1), ancreDe("ciel-de-la-place")!, { x: 1000, y: 300 }, vrais, 80);
    expect(lutins.length).toBe(1);
    expect(lutins[0]!.miroir).toBe(false);
    expect(etoile.quand).toEqual(["nuit"]);
  });
});

describe("les doublons", () => {
  it("sont les mêmes figurants au même lieu par un chemin voisin", () => {
    expect(sontDoublons(traversee(), traversee({}, 30))).toBe(true);
    expect(sontDoublons(traversee(), traversee({}, 150))).toBe(false);
    expect(sontDoublons(traversee(), traversee({ ancre: "sur-la-place" }))).toBe(false);
    const autre = traversee();
    autre.roles[0]!.figurant = "essai-pose";
    expect(sontDoublons(traversee(), autre)).toBe(false);
  });

  it("ne dépendent pas de l'ordre des rôles", () => {
    const deux = (inverse: boolean): MomentEcrit => {
      const a = traversee().roles[0]!;
      const b = { figurant: "essai-ciel", etapes: [{ t: 0, x: -100, y: -400, o: 0 }, { t: 3, x: -40, y: -400, o: 1 }, { t: 27, x: 40, y: -400, o: 1 }, { t: 30, x: 100, y: -400, o: 0 }] };
      return traversee({ roles: inverse ? [b, a] : [a, b] });
    };
    expect(sontDoublons(deux(false), deux(true))).toBe(true);
  });
});

describe("le jeu d'un moment", () => {
  const role = traversee().roles[0]!;

  it("va en ligne droite d'une étape à l'autre, en cases entières, et n'est pas là hors de ses étapes", () => {
    expect(instantDuRole(role.etapes, -0.1)).toBeNull();
    expect(instantDuRole(role.etapes, 30.1)).toBeNull();
    expect(instantDuRole(role.etapes, 0)).toMatchObject({ x: -150, y: 0, opacite: 0, vers: 1, bouge: true });
    expect(instantDuRole(role.etapes, 1.5)).toMatchObject({ x: -135, opacite: 0.5 });
    expect(instantDuRole(role.etapes, 15)).toMatchObject({ x: 0, opacite: 1 });
    expect(instantDuRole(role.etapes, 30)).toMatchObject({ x: 150, opacite: 0 });
  });

  it("se tourne du côté où il va, et ne se retourne pas en s'arrêtant", () => {
    const allerRetour = [
      { t: 0, x: 0, y: 0, o: 0 },
      { t: 3, x: 30, y: 0, o: 1 },
      { t: 10, x: 30, y: 0, o: 1 },
      { t: 20, x: -60, y: 0, o: 1 },
      { t: 25, x: -60, y: 0, o: 1 },
      { t: 30, x: -60, y: 0, o: 0 },
    ];
    expect(instantDuRole(allerRetour, 1)!.vers).toBe(1);
    expect(instantDuRole(allerRetour, 5)!.vers).toBe(1);
    expect(instantDuRole(allerRetour, 15)!.vers).toBe(-1);
    expect(instantDuRole(allerRetour, 27)!.vers).toBe(-1);
    expect(instantDuRole(allerRetour, 5)!.bouge).toBe(false);
  });

  it("montre ses images en boucle à un rythme lent quand il bouge, la première à l'arrêt ; posé, il boucle toujours", () => {
    expect(imageDuFigurant(ESSAI_SOL, { bouge: true }, 0)).toBe(0);
    expect(imageDuFigurant(ESSAI_SOL, { bouge: true }, 4)).toBe(1);
    expect(imageDuFigurant(ESSAI_SOL, { bouge: true }, 8)).toBe(0);
    expect(imageDuFigurant(ESSAI_SOL, { bouge: false }, 4)).toBe(0);
    expect(imageDuFigurant({ allure: "posee", images: 2 }, { bouge: false }, 12)).toBe(1);
    expect(imageDuFigurant({ allure: "vol", images: 1 }, { bouge: true }, 99)).toBe(0);
  });

  it("pose chaque rôle visible dans le monde, retourné quand il va à gauche, rangé par la rangée de son pied", () => {
    const moment = traversee();
    moment.roles.push({ figurant: "essai-sol", etapes: role.etapes.map((e) => ({ ...e, x: -e.x, y: 10 })) });
    const ancre = ancreDe("rue-des-maisons")!;
    const point = { x: 1000, y: 600 };
    const lutins = lutinsDuMoment(moment, ancre, point, PAR_ID, 15 * 8);
    expect(lutins).toEqual([
      { cle: "almanach-0", figurant: "essai-sol", image: 0, x: 1000 - 20, y: 600 - 29, miroir: false, opacite: 1, pied: 600 },
      { cle: "almanach-1", figurant: "essai-sol", image: 0, x: 1000 - 20, y: 610 - 29, miroir: true, opacite: 1, pied: 610 },
    ]);
    // Invisible au tout début : rien n'est posé.
    expect(lutinsDuMoment(moment, ancre, point, PAR_ID, 0)).toEqual([]);
    // Sur un toit, il se range devant la maison, derrière les Gaulois de la rue.
    const toit = ancreDe("toit-de-la-chaumiere")!;
    expect(toit.profondeur).toBeGreaterThan(0);
    // Ce qui vole passe devant tout le décor, derrière les étiquettes de l'écran.
    const vol = traversee({ roles: [{ figurant: "essai-ciel", etapes: role.etapes.map((e) => ({ ...e, y: -300 })) }] });
    expect(lutinsDuMoment(vol, ancre, point, PAR_ID, 15 * 8)[0]!.pied).toBe(PROFONDEUR_DU_CIEL);
    expect(PROFONDEUR_DU_CIEL).toBeGreaterThan(2000);
    expect(PROFONDEUR_DU_CIEL).toBeLessThan(9000);
  });
});

describe("moments.json", () => {
  it("a la forme des moments gardés, triés, et chacun passe la validation avec les vrais figurants", () => {
    const lus = MOMENTS.parse(moments);
    const ids = lus.map((m) => m.id);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    const vrais = { figurants: new Map(FIGURANTS.map((f) => [f.id, f])), ancre: ancreDe };
    for (const m of lus) expect(validerMoment(m, vrais), m.id).toBeNull();
  });
});
