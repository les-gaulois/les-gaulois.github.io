import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROUPES, ancreDuChapitre, chapitreDeLAdresse, commandeDuChapitre, doitDefiler, morceauxGras, numeroDuChapitre, parGroupe, sensDuPassage, titreEnDeux } from "../../src/lib/guide";
import { ICONES_PARTIES } from "../../src/lib/icones-parties";

const ANCRES = ["chapitre-01-bases", "chapitre-02-croissance", "chapitre-03-attaque"];
const INSECABLE = String.fromCharCode(0xa0);

describe("parGroupe", () => {
  it("range les chapitres sous leur groupe, dans l'ordre des groupes, sans changer leur ordre", () => {
    const chapitres = [
      { id: "a", groupe: "combat" as const },
      { id: "b", groupe: "memo" as const },
      { id: "c", groupe: "combat" as const },
      { id: "d", groupe: "economie" as const },
    ];
    expect(parGroupe(chapitres).map((g) => [g.id, g.chapitres.map((c) => c.id)])).toEqual([
      ["combat", ["a", "c"]],
      ["economie", ["d"]],
      ["memo", ["b"]],
    ]);
  });

  it("n'écrit pas un groupe sans chapitre", () => {
    expect(parGroupe([])).toEqual([]);
    expect(parGroupe([{ groupe: "alliances" as const }]).map((g) => g.nom)).toEqual(["Alliances"]);
  });
});

describe("les chapitres du guide du clan", () => {
  const fichiers = readdirSync("content/guide-clan").filter((f) => f.endsWith(".md"));
  const enTete = (fichier: string) => readFileSync(`content/guide-clan/${fichier}`, "utf8").split(/^---\r?$/m)[1] ?? "";
  const champ = (fichier: string, nom: string) => enTete(fichier).match(new RegExp(`^${nom}: "?([^"\\r\\n]+)"?\\r?$`, "m"))?.[1];

  it("ont chacun un numéro à leur place, un nom court, un groupe et une icône qui existent", () => {
    expect(fichiers.length).toBeGreaterThan(0);
    const groupes: string[] = GROUPES.map((g) => g.id);
    fichiers.sort().forEach((fichier, i) => {
      expect(Number(champ(fichier, "order")), fichier).toBe(i + 1);
      expect(champ(fichier, "court"), fichier).toBeTruthy();
      expect(groupes, fichier).toContain(champ(fichier, "groupe"));
      expect(Object.keys(ICONES_PARTIES), fichier).toContain(champ(fichier, "icone"));
    });
  });

  it("se suivent groupe par groupe : le sommaire ne mélange pas leurs numéros", () => {
    const ordre = fichiers.sort().map((fichier) => GROUPES.findIndex((g) => g.id === champ(fichier, "groupe")));
    expect(ordre).toEqual([...ordre].sort((a, b) => a - b));
  });
});

describe("ancre, commande et numéro d'un chapitre", () => {
  it("garde l'adresse que les chapitres ont toujours eue", () => {
    expect(ancreDuChapitre("03-attaque")).toBe("chapitre-03-attaque");
  });
  it("écrit la commande sans le numéro", () => {
    expect(commandeDuChapitre("04-poste-neutre")).toBe("poste-neutre");
    expect(commandeDuChapitre("trains")).toBe("trains");
  });
  it("écrit le numéro sur deux chiffres", () => {
    expect(numeroDuChapitre(3)).toBe("03");
    expect(numeroDuChapitre(11)).toBe("11");
  });
});

describe("chapitreDeLAdresse", () => {
  it("reconnaît le chapitre que nomme l'adresse", () => {
    expect(chapitreDeLAdresse("#chapitre-02-croissance", ANCRES)).toBe("chapitre-02-croissance");
    expect(chapitreDeLAdresse("chapitre-03-attaque", ANCRES)).toBe("chapitre-03-attaque");
    expect(chapitreDeLAdresse("#chapitre%2D01%2Dbases", ANCRES)).toBe("chapitre-01-bases");
  });
  it("laisse passer une autre ancre, une adresse vide ou mal écrite", () => {
    expect(chapitreDeLAdresse("", ANCRES)).toBeNull();
    expect(chapitreDeLAdresse("#", ANCRES)).toBeNull();
    expect(chapitreDeLAdresse("#contenu", ANCRES)).toBeNull();
    expect(chapitreDeLAdresse("#calculateur", ANCRES)).toBeNull();
    expect(chapitreDeLAdresse("#chapitre-99-rien", ANCRES)).toBeNull();
    expect(chapitreDeLAdresse("#%E0%A4%A", ANCRES)).toBeNull();
  });
});

describe("sensDuPassage", () => {
  it("vient de droite quand on avance, de gauche quand on revient", () => {
    expect(sensDuPassage(ANCRES, "chapitre-01-bases", "chapitre-03-attaque")).toBe("droite");
    expect(sensDuPassage(ANCRES, "chapitre-03-attaque", "chapitre-02-croissance")).toBe("gauche");
  });
  it("ne glisse pas sans départ, sur place ou vers un chapitre inconnu", () => {
    expect(sensDuPassage(ANCRES, null, "chapitre-02-croissance")).toBeNull();
    expect(sensDuPassage(ANCRES, "chapitre-02-croissance", "chapitre-02-croissance")).toBeNull();
    expect(sensDuPassage(ANCRES, "chapitre-01-bases", "ailleurs")).toBeNull();
    expect(sensDuPassage(ANCRES, "ailleurs", "chapitre-01-bases")).toBeNull();
  });
});

describe("doitDefiler", () => {
  it("ramène au haut d'un chapitre qui commence sous l'en-tête ou au-dessus de l'écran", () => {
    expect(doitDefiler(-900, 800)).toBe(true);
    expect(doitDefiler(40, 800)).toBe(true);
  });
  it("ramène un chapitre qui commence trop bas", () => {
    expect(doitDefiler(500, 800)).toBe(true);
  });
  it("ne bouge pas quand le haut du chapitre est déjà sous les yeux", () => {
    expect(doitDefiler(120, 800)).toBe(false);
    expect(doitDefiler(350, 800)).toBe(false);
  });
});

describe("titreEnDeux", () => {
  it("sépare le titre de ce qu'il précise, avec une espace ordinaire ou insécable", () => {
    expect(titreEnDeux("Les bases : population, troupes et tuiles")).toEqual({ titre: "Les bases", precision: "population, troupes et tuiles" });
    expect(titreEnDeux(`Trahison${INSECABLE}: quoi éviter`)).toEqual({ titre: "Trahison", precision: "quoi éviter" });
  });
  it("laisse entier un titre sans précision", () => {
    expect(titreEnDeux("Comprendre une attaque")).toEqual({ titre: "Comprendre une attaque", precision: null });
    expect(titreEnDeux("Ratio 3:1")).toEqual({ titre: "Ratio 3:1", precision: null });
  });
  it("ne coupe qu'au premier deux-points", () => {
    expect(titreEnDeux("Économie : gagner : dépenser")).toEqual({ titre: "Économie", precision: "gagner : dépenser" });
  });
});

describe("morceauxGras", () => {
  it("marque ce qui est entre deux paires d'astérisques", () => {
    expect(morceauxGras("**Tuile :** une case.")).toEqual([
      { texte: "Tuile :", gras: true },
      { texte: " une case.", gras: false },
    ]);
    expect(morceauxGras("entre **35 % et 42 %** de la capacité")).toEqual([
      { texte: "entre ", gras: false },
      { texte: "35 % et 42 %", gras: true },
      { texte: " de la capacité", gras: false },
    ]);
  });
  it("rend une phrase sans gras telle quelle, et rien pour une phrase vide", () => {
    expect(morceauxGras("Une phrase simple.")).toEqual([{ texte: "Une phrase simple.", gras: false }]);
    expect(morceauxGras("")).toEqual([]);
  });
  it("n'interprète rien d'autre : une balise reste du texte", () => {
    expect(morceauxGras("<b>non</b> et *une* étoile")).toEqual([{ texte: "<b>non</b> et *une* étoile", gras: false }]);
  });
});
