import { describe, expect, it } from "vitest";
import { OBJETS, POILS } from "../../supabase/functions/code-discord/gaulois";
import { CH, CL, GESTES_DU_VINGT_ET_UN, HT, LC, LT, TENUES_DES_FIGURES, TENUE_DU_DRUIDE, busteDeFigure, caisse, decor, dos, druide, face, iconesDesGestes, lueurDuVingtEtUn, miseEnPage, placeDesTrois, placesDesCartes, rond, sabot } from "../../src/lib/jeu/casino-vingt-et-un";
import { SONS_DU_VINGT_ET_UN } from "../../src/lib/jeu/casino-vingt-et-un-sons";
import { BORDEAUX, Toile } from "../../src/lib/jeu/casino-toile";
import { conseil, distribuer, jouerUnCoup, coupsPermis, complement, miseeDeLaMain, renduDeLaMain, faitsMontres, tavernierMontre, carteDuNombre, nombreDeLaCarte, type EtatDuVingtEtUn } from "../../src/lib/village/casino/vingt-et-un";
import type { CarteDuVingtEtUn, FaitDuVingtEtUn, ReponseDuVingtEtUn, TableDuVingtEtUn } from "../../src/lib/village/contrat-casino";
import { resumeDeLaPartie, resumeDuCoup } from "../../src/lib/village/ecran-casino";
import { MOTS_DU_DRUIDE, NOMS_DES_GESTES, cartesDites, coupDuVingtEtUn, finDeLaMain, gestesPermis, motsDeLaSuite, motsDesTrois, motsDuRefusEnMain, nomDuGeste, pastille, rubanDuBilan, tableDesGainsDesTrois, troisDites } from "../../src/lib/village/ecran-vingt-et-un";

// L'écran du vingt-et-un du casino de « Mon Gaulois » (maquette « Le Palais d'or » de Claude Fable 5.2, validée par le pilote
// le 22 novembre 2026) : le jeu de cartes gaulois, la mise en page de la table, et ce que l'écran dit de ce que le serveur a
// tiré. Les règles et les chances sont celles du serveur, testées avec lui (`casino-serveur.test.ts`).

const pleins = (t: Toile): number => {
  let n = 0;
  for (let i = 3; i < t.d.length; i += 4) if (t.d[i]) n++;
  return n;
};
const empreinte = (t: Toile): string => {
  let h = 2166136261;
  for (const v of t.d) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h.toString(16);
};
const carte = (r: number, e = 0): CarteDuVingtEtUn => ({ r, e });

/** Une table comme le serveur la rend, d'après la machine des règles (la même que le serveur, comparée à lui en SQL). */
function tableDe(e: EtatDuVingtEtUn, faits: FaitDuVingtEtUn[], extra: Partial<TableDuVingtEtUn> = {}): TableDuVingtEtUn {
  return {
    partie: 7,
    god: false,
    mise: e.mise,
    misee: miseeDeLaMain(e),
    tavernier: tavernierMontre(e),
    cachee: e.phase !== "fini",
    mains: e.mains,
    courante: e.courante,
    separee: e.separee,
    phase: e.phase,
    tour: 0,
    permis: coupsPermis(e),
    complement: complement(e),
    rendu: e.phase === "fini" ? renduDeLaMain(e) : 0,
    faits: faitsMontres(faits),
    commence_le: "2026-11-23T20:00:00Z",
    ...extra,
  };
}
/** Une source de cartes écrite d'avance : joueur, croupier, joueur, croupier (cachée), puis la suite. */
const source = (cartes: CarteDuVingtEtUn[]) => {
  const l = cartes.map(nombreDeLaCarte);
  return () => {
    const n = l.shift();
    if (n === undefined) throw new Error("plus de cartes");
    return n;
  };
};

describe("le jeu de cartes gaulois", () => {
  it("a 52 faces différentes, toutes de 45 points sur 64, et un dos", () => {
    const vues = new Set<string>();
    for (let n = 0; n < 52; n++) {
      const t = face(carteDuNombre(n));
      expect([t.w, t.h]).toEqual([CL, CH]);
      expect(pleins(t)).toBe(CL * CH - 12); // les coins arrondis seuls sont vides
      vues.add(empreinte(t));
    }
    expect(vues.size).toBe(52);
    expect([dos().w, dos().h]).toEqual([CL, CH]);
    expect(face(carte(5, 2))).toBe(face(carte(5, 2))); // gardée en mémoire
  });
  it("habille les figures et le druide d'objets qui existent dans la garde-robe", () => {
    for (const tenue of [...TENUES_DES_FIGURES.flat(), TENUE_DU_DRUIDE]) {
      for (const [emplacement, id] of Object.entries(tenue)) {
        if (emplacement === "teinte_cheveux") expect(POILS, id).toHaveProperty(id);
        else expect(OBJETS[emplacement as keyof typeof OBJETS]?.[id], `${emplacement} ${id}`).toBeDefined();
      }
    }
  });
  it("donne à chaque figure un vrai Gaulois du site, différent des autres", () => {
    const vus = new Set<string>();
    for (let e = 0; e < 4; e++)
      for (let f = 0; f < 3; f++) {
        const b = busteDeFigure(e, f);
        expect([b.w, b.h]).toEqual([48, 46]);
        expect(pleins(b)).toBeGreaterThan(400);
        vus.add(empreinte(b));
      }
    expect(vus.size).toBe(12);
    expect(pleins(druide())).toBeGreaterThan(120);
  });
  it("peint le sabot, la caisse, le rond, la lueur et les quatre icônes des gestes", () => {
    expect([sabot().w, sabot().h]).toEqual([36, 34]);
    expect([caisse().w, caisse().h]).toEqual([44, 20]);
    expect([rond().w, rond().h]).toEqual([32, 32]);
    expect(pleins(lueurDuVingtEtUn(170, 112))).toBeGreaterThan(500);
    const ic = iconesDesGestes();
    for (const k of GESTES_DU_VINGT_ET_UN) {
      expect([ic[k].w, ic[k].h]).toEqual([16, 16]);
      expect(pleins(ic[k])).toBeGreaterThan(20);
    }
  });
  it("tisse le dos et le feutre en bordeaux, jamais en pourpre", () => {
    const tons = new Set(BORDEAUX.c.map((c) => c.join()));
    const d = dos();
    let bordeaux = 0;
    for (let i = 0; i < d.d.length; i += 4) if (tons.has(`${d.d[i]},${d.d[i + 1]},${d.d[i + 2]}`)) bordeaux++;
    expect(bordeaux).toBeGreaterThan(400);
    // Le pourpre de la maquette (#643aad, #4a2788…) n'est plus nulle part.
    const pourpre = (t: Toile): boolean => {
      for (let i = 0; i < t.d.length; i += 4) if (t.d[i + 3] && t.d[i + 2]! > t.d[i]! + 40 && t.d[i]! > t.d[i + 1]! + 20) return true;
      return false;
    };
    expect(pourpre(d)).toBe(false);
    expect(pourpre(sabot())).toBe(false);
    expect(pourpre(decor(miseEnPage(1060)))).toBe(false);
  });
});

describe("la table", () => {
  it("se met en page d'après sa largeur, en pixels pairs", () => {
    for (const w of [310, 390, 439, 440, 520, 700, 1060]) {
      const G = miseEnPage(w);
      expect(G.W % 2).toBe(0);
      expect(G.etroit).toBe(G.W < 440);
      expect(G.yT < G.yL && G.yL < G.yJ && G.yJ < G.yM && G.yM < G.H).toBe(true);
      const t = decor(G);
      expect([t.w, t.h]).toEqual([G.W >> 1, G.H >> 1]);
    }
    expect(miseEnPage(1060).H).toBe(518); // deux lignes de règles, et le nom de « Trois cartes » sous sa place
  });
  it("pose « Trois cartes » à gauche de la mise, sans toucher le rond, les cartes du joueur ni le bord", () => {
    for (let w = 300; w <= 1100; w += 2) {
      const G = miseEnPage(w);
      const p = { x0: G.trois.x, x1: G.trois.x + LT, y0: G.trois.y, y1: G.trois.y + HT };
      expect(p.x0 % 2 + (p.y0 % 2), String(w)).toBe(0);
      // le rond de la mise et le bord de la table (jonc et filet)
      expect(p.x1 + 8, String(w)).toBeLessThanOrEqual(G.cx - 32);
      expect(p.x0, String(w)).toBeGreaterThanOrEqual(22);
      // sous les cartes du joueur, et son nom gravé au-dessus du filet du bas
      expect(p.y0, String(w)).toBeGreaterThan(G.yJ + 128);
      expect(p.y1 + 2 + 16, String(w)).toBeLessThanOrEqual(G.H - 22);
    }
    expect(miseEnPage(720).trois).toEqual({ x: 54, y: miseEnPage(720).yM - 6 });
  });
  it("dessine la place de « Trois cartes », éteinte et allumée, de la même taille", () => {
    const [eteinte, allumee] = [placeDesTrois(false), placeDesTrois(true)];
    expect([eteinte.w * 2, eteinte.h * 2]).toEqual([LT, HT]);
    expect([allumee.w, allumee.h]).toEqual([eteinte.w, eteinte.h]);
    expect(empreinte(allumee)).not.toBe(empreinte(eteinte));
    expect(pleins(eteinte)).toBeGreaterThan(600);
  });
  it("garde toutes les cartes d'une main sur la table, même onze cartes, même deux mains", () => {
    for (let w = 300; w <= 1100; w += 2) {
      const G = miseEnPage(w);
      for (let n = 1; n <= 11; n++) {
        const seule = placesDesCartes(G, n, G.cx, G.yJ, false);
        expect(seule[0]!.x, `${w} ${n}`).toBeGreaterThanOrEqual(0);
        expect(seule[n - 1]!.x + LC, `${w} ${n}`).toBeLessThanOrEqual(G.W);
        for (const s of [-1, 1]) {
          const p = placesDesCartes(G, n, G.cx + s * G.sep, G.yJ, true);
          expect(p[0]!.x).toBeGreaterThanOrEqual(0);
          expect(p[n - 1]!.x + LC).toBeLessThanOrEqual(G.W);
        }
        // Les cartes vont de gauche à droite, chacune à une place paire.
        expect(seule.every((p, i) => p.x % 2 === 0 && (!i || p.x >= seule[i - 1]!.x))).toBe(true);
      }
    }
  });
});

describe("ce que dit l'écran", () => {
  it("écrit une main souple du joueur « 7 ou 17 », et ce qui dépasse 21 en rouge", () => {
    expect(pastille([carte(0), carte(5)], true)).toEqual({ texte: "7 ou 17", rouge: false });
    expect(pastille([carte(0), carte(5)], false)).toEqual({ texte: "17", rouge: false });
    expect(pastille([carte(0), carte(9)], true)).toEqual({ texte: "21", rouge: false });
    expect(pastille([carte(9), carte(8), carte(4)], true)).toEqual({ texte: "24", rouge: true });
    expect(pastille([], true)).toBeNull();
  });
  it("annonce la main du joueur et la carte du croupier", () => {
    const { etat, faits } = distribuer(50, source([carte(4), carte(11), carte(6), carte(3)]));
    expect(motsDeLaSuite(tableDe(etat, faits))).toEqual(["À vous", "Vous avez 12. Le croupier montre une dame"]);
    const b = distribuer(50, source([carte(0), carte(0, 1), carte(5), carte(3)]));
    expect(motsDeLaSuite(tableDe(b.etat, b.faits))).toEqual(["À vous", "Vous avez 7 ou 17. Le croupier montre un as"]);
    // Un lecteur d'écran entend aussi ses cartes, en mots.
    expect(cartesDites(tableDe(b.etat, b.faits))).toBe("Vos cartes : as de torques, 6 de torques.");
  });
  it("ferme doubler et séparer quand la bourse ou le reste du jour ne suffit pas, sauf en essai", () => {
    const { etat, faits } = distribuer(100, source([carte(7), carte(4), carte(7, 2), carte(5)]));
    const t = tableDe(etat, faits);
    expect(t.permis).toEqual({ tirer: true, rester: true, doubler: true, separer: true });
    expect(gestesPermis(t, { bourse: 500, reste: 1000, god: false })).toEqual({ tirer: true, rester: true, doubler: true, separer: true, raison: "" });
    const pauvre = gestesPermis(t, { bourse: 90, reste: 1000, god: false });
    expect(pauvre).toEqual({ tirer: true, rester: true, doubler: false, separer: false, raison: "bourse" });
    expect(nomDuGeste("doubler", pauvre, t.permis)).toBe("Doubler la mise, une seule carte de plus (la bourse ne suffit pas)");
    expect(nomDuGeste("tirer", pauvre, t.permis)).toBe(NOMS_DES_GESTES.tirer[1]);
    const plafond = gestesPermis(t, { bourse: 5000, reste: 60, god: false });
    expect(plafond.raison).toBe("plafond_du_jour");
    expect(nomDuGeste("separer", plafond, t.permis)).toBe("Séparer en deux mains (le plafond du jour ne suffit pas)");
    expect(gestesPermis(t, { bourse: 0, reste: 0, god: true }).doubler).toBe(true);
    // Hors de la main du joueur, rien n'est permis.
    expect(gestesPermis(null, { bourse: 500, reste: 500, god: false })).toEqual({ tirer: false, rester: false, doubler: false, separer: false, raison: "" });
    expect(motsDuRefusEnMain("solde_insuffisant")).toEqual(["À vous", "La bourse ne suffit pas"]);
    expect(motsDuRefusEnMain("casino_plafond")).toEqual(["À vous", "Le plafond du jour ne suffit pas"]);
    expect(motsDuRefusEnMain("main_en_cours")[0]).toBe("Une main attend");
  });
  it("le druide conseille d'après ce qu'on voit : séparer deux 8, rester sur 20, doubler 11", () => {
    const tous = { tirer: true, rester: true, doubler: true, separer: true };
    expect(conseil([carte(7), carte(7, 1)], carte(9), tous).coup).toBe("separer");
    expect(conseil([carte(9), carte(10)], carte(5), tous).coup).toBe("rester");
    expect(conseil([carte(5), carte(4)], carte(5), tous).coup).toBe("doubler");
    // Sans doubler permis (la bourse), il conseille de tirer.
    expect(conseil([carte(5), carte(4)], carte(5), { ...tous, doubler: false, separer: false }).coup).toBe("tirer");
    for (const k of ["tirer", "rester", "doubler", "separer"] as const) expect(MOTS_DU_DRUIDE[k][0].length).toBeGreaterThan(2);
  });
  it("pose la bonne étiquette sur chaque bilan", () => {
    expect(rubanDuBilan({ t: "bilan", main: 0, issue: "perdu", recu: 0, saute: true })).toEqual({ mot: "Plus de 21", ton: "rouge", fete: false });
    expect(rubanDuBilan({ t: "bilan", main: 0, issue: "perdu", recu: 0 }).mot).toBe("Perdu");
    expect(rubanDuBilan({ t: "bilan", main: 0, issue: "egal", recu: 50 }).ton).toBe("bleu");
    expect(rubanDuBilan({ t: "bilan", main: 0, issue: "vingt-et-un", recu: 125 })).toEqual({ mot: "21 d'entrée", ton: "or", fete: true });
    expect(rubanDuBilan({ t: "bilan", main: 0, issue: "gagne", recu: 100 })).toEqual({ mot: "Gagné", ton: "or", fete: false });
  });
});

describe("la fin d'une main, avec les nombres du serveur", () => {
  const rep = (t: TableDuVingtEtUn): ReponseDuVingtEtUn => ({ ok: true, table: t, solde_apres: 1000, mise_du_jour: 300, reste_du_jour: 1700 });

  it("un 21 d'entrée : payé 3 pour 2, la fête douce, la pluie", () => {
    const { etat, faits } = distribuer(50, source([carte(0), carte(5), carte(10, 3), carte(8)]));
    const t = tableDe(etat, faits);
    expect(t.phase).toBe("fini");
    expect(t.rendu).toBe(125);
    const f = finDeLaMain(t);
    expect(f).toMatchObject({ titre: "21 d'entrée", sous: "Croupier : 15", signe: "21", ton: "or", fete: true });
    expect(f.dire).toBe("Rendu : 125 statères, mise comprise.");
    // La carte cachée n'arrive qu'avec « retourne ».
    expect(t.faits.find((x) => x.t === "carte" && x.a === "tavernier" && x.cachee)).toMatchObject({ carte: carte(8) });
  });
  it("21 d'entrée des deux côtés : la mise est rendue, sans fête", () => {
    const { etat, faits } = distribuer(40, source([carte(0), carte(0, 2), carte(12), carte(9, 1)]));
    const t = tableDe(etat, faits);
    expect(t.rendu).toBe(40);
    expect(faits.some((x) => x.t === "regarde")).toBe(true);
    expect(finDeLaMain(t)).toMatchObject({ titre: "Égalité", sous: "Croupier : 21 d'entrée", ton: "bleue", fete: false, dire: "Mise rendue : 40 statères." });
  });
  it("le croupier a 21 d'entrée : on ne perd que sa mise", () => {
    const { etat, faits } = distribuer(40, source([carte(9), carte(0, 2), carte(7), carte(11, 1)]));
    expect(finDeLaMain(tableDe(etat, faits))).toMatchObject({ titre: "Perdu", sous: "Croupier : 21 d'entrée", signe: "18", ton: "rouge", dire: "Rien cette fois." });
  });
  it("plus de 21 : le croupier ne montre rien de plus", () => {
    const s = source([carte(9), carte(5), carte(5), carte(6), carte(8)]);
    const { etat, faits } = distribuer(20, s);
    const suite = jouerUnCoup(etat, "tirer", s);
    const t = tableDe(etat, [...faits, ...suite]);
    expect(finDeLaMain(t)).toMatchObject({ titre: "Plus de 21", sous: "", signe: "25", ton: "rouge" });
  });
  it("deux mains séparées puis doublées : chaque main a sa mise, le total est celui du serveur", () => {
    // 8 et 8 contre un 6 ; la première reçoit 3 (11) et double (un 10 : 21), la seconde reçoit 2 (10) et double (un 9 : 19) ;
    // le croupier découvre un 10 (16), tire un 10 : plus de 21.
    const s = source([carte(7), carte(5), carte(7, 1), carte(9, 2), carte(2), carte(9, 3), carte(1), carte(8), carte(11)]);
    const { etat, faits } = distribuer(50, s);
    const tous = [...faits];
    tous.push(...jouerUnCoup(etat, "separer", s));
    expect(complement(etat)).toBe(50);
    tous.push(...jouerUnCoup(etat, "doubler", s));
    tous.push(...jouerUnCoup(etat, "doubler", s));
    const t = tableDe(etat, tous);
    expect(t.phase).toBe("fini");
    expect(t.misee).toBe(200);
    expect(t.rendu).toBe(400);
    expect(t.mains.map((m) => m.issue)).toEqual(["gagne", "gagne"]);
    expect(finDeLaMain(t)).toMatchObject({ titre: "Gagné", signe: "", ton: "feutre", sous: "Croupier : plus de 21", dire: "Première main gagnée, seconde gagnée. Rendu : 400 statères, mise comprise." });
    const coup = coupDuVingtEtUn(rep(t));
    expect(coup).toMatchObject({ jeu: "vingt-et-un", partie: 7, mise: 200, rendu: 400, god: false, solde_apres: 1000, reste_du_jour: 1700, issues: ["gagne", "gagne"] });
    // Le hall l'inscrit aussitôt dans « Vos dernières parties ».
    const resume = resumeDuCoup(coup as never);
    expect(resume).toEqual({ jeu: "vingt-et-un", issues: ["gagne", "gagne"] });
    expect(resumeDeLaPartie(resume!)).toBe("Deux mains : gagnée et gagnée");
    // Les faits suivent l'ordre de la maquette : séparer, la main suivante, les doubles, le croupier, deux bilans.
    const sortes = t.faits.map((f) => f.t);
    expect(sortes.indexOf("separe")).toBeLessThan(sortes.indexOf("main"));
    expect(sortes.filter((x) => x === "double")).toHaveLength(2);
    expect(sortes.filter((x) => x === "bilan")).toHaveLength(2);
  });
  it("une main sur deux", () => {
    const s = source([carte(7), carte(5), carte(7, 1), carte(9, 2), carte(9), carte(4), carte(11)]);
    const { etat, faits } = distribuer(50, s);
    const tous = [...faits, ...jouerUnCoup(etat, "separer", s), ...jouerUnCoup(etat, "rester", s), ...jouerUnCoup(etat, "rester", s)];
    const t = tableDe(etat, tous);
    // 18 et 13 contre 6 + 10 + 10 = 26 : le croupier saute, les deux gagnent. Refaisons contre un 20.
    expect(t.mains.map((m) => m.issue)).toEqual(["gagne", "gagne"]);
    const s2 = source([carte(7), carte(9), carte(7, 1), carte(9, 2), carte(9), carte(4)]);
    const b = distribuer(50, s2);
    const tous2 = [...b.faits, ...jouerUnCoup(b.etat, "separer", s2), ...jouerUnCoup(b.etat, "rester", s2), ...jouerUnCoup(b.etat, "rester", s2)];
    const t2 = tableDe(b.etat, tous2);
    expect(t2.mains.map((m) => m.issue)).toEqual(["perdu", "perdu"]);
    expect(finDeLaMain(t2)).toMatchObject({ titre: "Perdu", dire: "Première main perdue, seconde perdue. Rien cette fois." });
    expect(finDeLaMain({ ...t2, rendu: 50, mains: [{ ...t2.mains[0]!, issue: "egal", recu: 50 }, t2.mains[1]!] })).toMatchObject({ titre: "Une main sur deux", dire: "Première main à égalité, seconde perdue. Rendu : 50 statères sur 100 misés." });
    expect(finDeLaMain({ ...t2, rendu: 100 })).toMatchObject({ titre: "Mise rendue" });
  });
});

describe("les sons du jeu de cartes", () => {
  it("ne font rien sans contexte audio", () => {
    for (const f of Object.values(SONS_DU_VINGT_ET_UN)) expect(() => f()).not.toThrow();
  });
});

describe("Trois cartes à l'écran", () => {
  it("dit la main faite : le croupier, l'étiquette de la place et le lecteur d'écran", () => {
    expect(motsDesTrois("suite-enseigne", 390)).toEqual({ titre: "Suite de même enseigne", sous: "Trois cartes : 390 statères, mise comprise", etiquette: "39 fois la mise" });
    expect(motsDesTrois("enseigne", 70).etiquette).toBe("7 fois la mise");
    expect(troisDites({ mise: 10, combinaison: "brelan", recu: 280 })).toBe("Trois cartes : brelan, 280 statères, mise comprise.");
    expect(troisDites({ mise: 20, combinaison: null, recu: 0 })).toBe("Trois cartes : rien, 20 statères perdus.");
  });
});

describe("la table des gains de Trois cartes", () => {
  it("donne chaque main, ce qu'elle rend et une fois sur combien, du calcul exact", () => {
    const g = tableDesGainsDesTrois();
    expect(g.lignes.map((l) => [l.nom, l.fois, l.uneSur])).toEqual([
      ["Brelan de même enseigne", 100, 2704],
      ["Suite de même enseigne", 39, 488],
      ["Brelan", 28, 180],
      ["Suite", 10, 33],
      ["Même enseigne", 7, 17],
    ]);
    // 13 888 tirages gagnants sur 140 608
    expect(g.uneSur).toBe(10);
  });
});
