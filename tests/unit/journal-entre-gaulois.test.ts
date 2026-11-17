import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESSAIS_MAX, indexVide, nomDuJournal, noterEchec, noterFilm, partiesARefilmer } from "../../src/lib/rejeu/films-index";
import { CODES, FAITS_MAX, faitsJusquA, faitsParFamille, journalALEcran, journalDeLaPartie, journalPublie, lireJournal, montantAffiche, montantDit, nomDit, phrasesDuJeu, pseudoEnPartie, secondesDuFait, totauxDesDons } from "../../src/lib/rejeu/journal";
import { pageDuLecteur } from "../../src/lib/rejeu/lecteur-jeu";

const PARTIE = "abc12345";
// 1 à 3 : Gaulois (équipe Red) ; 4 : coéquipier sans tag ; 5 : adversaire d'un clan officiel ; 6 : adversaire sans tag ;
// 7 : nation ; 8 : robot.
const joueurs = [
  { n: 1, client: "g1", equipe: "Red", type: "HUMAN" },
  { n: 2, client: "g2", equipe: "Red", type: "HUMAN" },
  { n: 3, client: "g3", equipe: "Red", type: "HUMAN" },
  { n: 4, client: "e4", equipe: "Red", type: "HUMAN" },
  { n: 5, client: "a5", equipe: "Blue", type: "HUMAN" },
  { n: 6, client: "a6", equipe: "Blue", type: "HUMAN" },
  { n: 7, client: null, equipe: "Blue", type: "NATION" },
  { n: 8, client: null, equipe: null, type: "BOT" },
];
const meta = (faits?: unknown) => JSON.stringify({ format: 1, partie: PARTIE, commit: "a".repeat(40), largeur: 10, hauteur: 10, tours: 1000, toursFiche: 1000, empreintes: 5, joueurs, ...(faits === undefined ? {} : { faits }) });
const phrases = phrasesDuJeu(JSON.stringify({ chat: { title: "Chat", cat: { help: "Aide" }, help: { troops: "Donne-moi des troupes !", send_gold_to: "Envoie de l'or à [P1] !" }, misc: { join_discord: "Rejoins le Discord !", go: "C'est parti !" }, greet: { mauvais: "<b>", gg: 12 } } }));
const partie = { partie: PARTIE, clients: new Set(["g1", "g2", "g3"]), noms: new Map([["g1", "Judom FR"], ["g2", "[GAL]"], ["a5", "[UN]"]]), phrases };
const journal = (faits: unknown) => journalDeLaPartie(meta(faits), partie)!;

describe("le journal « Entre Gaulois »", () => {
  it("ne garde des dons que ceux entre joueurs au tag du clan, dans l'ordre, avec les seuls noms publiables", () => {
    const j = journal([[300, 1, 2, 1, 50_000], [120, 0, 1, 2, 1_250_000], [200, 0, 1, 4, 999], [210, 1, 5, 1, 999], [220, 1, 7, 1, 999], [400, 0, 3, 1, 70]]);
    expect(j).toEqual({ format: 1, partie: PARTIE, fin: 1000, joueurs: [["Judom FR", 0], [null, 0], [null, 0]], faits: [[120, 0, 0, 1, 1_250_000], [300, 1, 1, 0, 50_000], [400, 0, 2, 0, 70]] });
    // Ni identifiant en partie, ni tag à la place du pseudo d'un Gaulois.
    expect(JSON.stringify(j)).not.toMatch(/"g1"|"g2"|\[GAL\]/);
  });
  it("garde une élimination, une bombe ou une alliance dès qu'un Gaulois y est, jamais avec un robot", () => {
    const j = journal([
      [10, 2, 1, 5, 4150],
      [11, 2, 6, 3, 0],
      [12, 2, 1, 8, 50],
      [13, 2, 5, 6, 900],
      [20, 3, 1, 0, 1],
      [21, 3, 6, 2, 2],
      [22, 3, 5, 6, 0],
      [30, 7, 6, 1],
      [31, 9, 6, 1],
      [32, 8, 1, 4],
      [33, 10, 5, 6],
      [34, 11, 1, 7],
    ]);
    expect(j.joueurs).toEqual([["Judom FR", 0], ["[UN]", 2], [null, 2], [null, 0], [null, 0], [null, 1], [null, 3]]);
    expect(j.faits).toEqual([
      [10, 2, 0, 1, 4150],
      [11, 2, 2, 3, 0],
      [20, 3, 0, -1, 1],
      [21, 3, 2, 4, 2],
      [30, 7, 2, 0],
      [31, 9, 2, 0],
      [32, 8, 0, 5],
      [34, 11, 0, 6],
    ]);
  });
  it("garde les émojis du jeu, les cibles et les phrases toutes faites d'un Gaulois, jamais un texte libre", () => {
    const j = journal([
      [10, 4, 1, 0, "👍"],
      [11, 4, 5, 2, "😡"],
      [12, 4, 7, 1, "❤️"],
      [13, 4, 1, 2, "salut"],
      [14, 4, 5, 6, "👍"],
      [20, 5, 1, 5],
      [21, 5, 5, 1],
      [30, 6, 1, 2, 0, "help.troops"],
      [31, 6, 1, 2, 5, "help.send_gold_to"],
      [32, 6, 1, 2, 0, "help.send_gold_to"],
      [33, 6, 1, 2, 0, "misc.join_discord"],
      [34, 6, 1, 2, 0, "greet.mauvais"],
      [35, 6, 1, 2, 0, "greet.gg"],
      [36, 6, 5, 1, 0, "help.troops"],
      [37, 6, 1, 2, 0, "Texte libre"],
    ]);
    expect(j.faits).toEqual([
      [10, 4, 0, -1, "👍"],
      [11, 4, 1, 2, "😡"],
      [20, 5, 0, 1],
      [30, 6, 0, 2, -1, "Donne-moi des troupes !"],
      [31, 6, 0, 2, 1, "Envoie de l'or à [P1] !"],
    ]);
    expect([...phrases.keys()].sort()).toEqual(["help.send_gold_to", "help.troops", "misc.go"]);
    expect(phrasesDuJeu("{").size).toBe(0);
    expect(phrasesDuJeu("{}").size).toBe(0);
  });
  it("laisse les embargos, que le jeu pose de lui-même, et tout fait qu'il ne sait pas lire", () => {
    expect(journal([[10, 12, 1, 5], [11, 13, 1, 5], [12, 2, 1, 99, 5], [13, 2, 1], [14, 3, 1, 5, 7], [1000, 2, 1, 5, 5], [15, 0, 1, 1, 5], [16, 0, 1, 2, 0]]).faits).toEqual([]);
  });
  it("sans faits notés par le moteur, ne dit rien : ce n'est pas « aucun fait »", () => {
    expect(journalDeLaPartie(meta(), partie)).toBeNull();
    expect(journal([])).toEqual({ format: 1, partie: PARTIE, fin: 1000, joueurs: [], faits: [] });
  });
  it("refuse une description qui ne convient pas", () => {
    expect(() => journalDeLaPartie(meta([[10, 99, 1, 2, 5]]), partie)).toThrow("faits au mauvais format");
    expect(() => journalDeLaPartie(meta([[10, 0, 1, 2, -5]]), partie)).toThrow("faits au mauvais format");
    expect(() => journalDeLaPartie(meta(Array.from({ length: FAITS_MAX + 1 }, () => [10, 0, 1, 2, 5])), partie)).toThrow("faits au mauvais format");
    expect(() => journalDeLaPartie(meta([]), { ...partie, partie: "autre" })).toThrow("autre partie");
    expect(() => journalDeLaPartie("{", partie)).toThrow("illisible");
  });
  it("se relit, et perd à la publication un pseudo ou un tag qui n'est plus publiable", () => {
    const j = journal([[120, 0, 1, 2, 1_250_000], [130, 2, 1, 5, 10]]);
    expect(lireJournal(JSON.stringify(j), PARTIE)).toEqual(j);
    expect(() => lireJournal(JSON.stringify(j), "autre")).toThrow("autre partie");
    expect(() => lireJournal(JSON.stringify({ ...j, faits: [[120, 0, 0, 7, 5]] }), PARTIE)).toThrow("mauvais format");
    expect(() => lireJournal(JSON.stringify({ ...j, faits: [[120, 4, 0, 1, "<script>"]] }), PARTIE)).toThrow("mauvais format");
    expect(() => lireJournal(JSON.stringify({ ...j, faits: [[130, 2, 0, 1, 1], [120, 0, 0, 1, 5]] }), PARTIE)).toThrow("mauvais format");
    expect(() => lireJournal(JSON.stringify({ ...j, joueurs: [["<b>", 0], [null, 0], [null, 2]] }), PARTIE)).toThrow("mauvais format");
    expect(journalPublie(j, () => false).joueurs).toEqual([[null, 0], [null, 0], [null, 2]]);
    expect(journalPublie(j, (n) => n === "[UN]").joueurs).toEqual([[null, 0], [null, 0], ["[UN]", 2]]);
  });
});

describe("le journal à l'écran", () => {
  const publie = { format: 1, partie: PARTIE, fin: 1000, joueurs: [["Judom FR", 0], [null, 0], ["[UN]", 2], [null, 0], [null, 3]], faits: [[120, 0, 0, 1, 1_250_000], [300, 1, 3, 0, 50_000], [310, 2, 0, 2, 4150], [320, 3, 4, 1, 2], [330, 4, 0, -1, "👍"], [340, 6, 0, 1, 2, "Attaque [P1] !"], [350, 9, 2, 0]] };
  const lu = journalALEcran(publie, PARTIE)!;
  it("relit le journal publié, nomme chacun et numérote les Gaulois sans pseudo public", () => {
    expect(lu.fin).toBe(1000);
    expect(lu.faits[0]).toEqual({ etape: 120, code: 0, famille: "dons", de: { nom: "Judom FR", camp: "gaulois", enPartie: false, numero: 0 }, a: { nom: null, camp: "gaulois", enPartie: false, numero: 1 }, cible: null, valeur: 1_250_000, texte: "" });
    expect(lu.faits[1]!.de).toEqual({ nom: null, camp: "gaulois", enPartie: false, numero: 2 });
    expect(lu.faits.map((f) => f.famille)).toEqual(["dons", "dons", "combats", "combats", "chat", "chat", "diplomatie"]);
    expect(lu.faits[4]!.a).toBeNull();
    expect(lu.faits[5]!.cible).toEqual({ nom: "[UN]", camp: "adverse", enPartie: false, numero: 0 });
    expect(faitsParFamille(lu.faits)).toEqual({ dons: 2, combats: 2, chat: 2, diplomatie: 1 });
    // Un seul Gaulois sans pseudo public : pas de numéro.
    expect(journalALEcran({ ...publie, faits: [publie.faits[0]] }, PARTIE)!.faits[0]!.a).toEqual({ nom: null, camp: "gaulois", enPartie: false, numero: 0 });
  });
  it("dit chaque joueur par son nom publiable, sinon par son camp, en mots", () => {
    expect(nomDit({ nom: "Judom FR", camp: "gaulois", enPartie: false, numero: 0 })).toBe("Judom FR");
    expect(nomDit({ nom: null, camp: "gaulois", enPartie: false, numero: 0 }, true)).toBe("Un Gaulois");
    expect(nomDit({ nom: null, camp: "gaulois", enPartie: false, numero: 2 })).toBe("Gaulois 2");
    expect(nomDit({ nom: null, camp: "equipe", enPartie: false, numero: 0 })).toBe("un coéquipier");
    expect(nomDit({ nom: null, camp: "adverse", enPartie: false, numero: 0 }, true)).toBe("Un adversaire");
    expect(nomDit({ nom: null, camp: "nation", enPartie: false, numero: 0 })).toBe("une nation");
    expect(nomDit({ nom: null, camp: "robot", enPartie: false, numero: 0 })).toBe("un robot");
  });
  it("ne montre rien d'un journal qui ne convient pas", () => {
    expect(journalALEcran(publie, "autre")).toBeNull();
    expect(journalALEcran({ ...publie, format: 2 }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, fin: 0 }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, faits: [[120, 0, 0, 9, 10]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, faits: [[120, 14, 0, 1]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, faits: [[120, 0, 0, 1, 1.5]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, faits: [[120, 0, -1, 1, 5]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, faits: [[120, 3, 0, 1, 3]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, faits: [[120, 4, 0, 1, "bonjour"]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, joueurs: [[12, 0]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...publie, joueurs: [["x", 5]] }, PARTIE)).toBeNull();
    expect(journalALEcran(null, PARTIE)).toBeNull();
  });
  it("compte les troupes comme l'écran du jeu (divisées par dix), l'or tel quel, et le temps à dix étapes par seconde", () => {
    expect(montantAffiche(CODES.donTroupes, 1_250_000)).toBe(125_000);
    expect(montantAffiche(CODES.donOr, 50_000)).toBe(50_000);
    expect(secondesDuFait(1205)).toBe(120);
    expect(montantDit(850)).toBe("850");
    expect(montantDit(125_000).replace(/\s/g, " ")).toBe("125 k");
    expect(montantDit(1_250_000).replace(/\s/g, " ")).toBe("1,3 M");
    expect(totauxDesDons(lu.faits)).toEqual({ troupes: { dons: 1, somme: 125_000 }, or: { dons: 1, somme: 50_000 } });
  });
  it("suit le replay : seuls les faits déjà arrivés à son étape, tous tant qu'il n'a rien dit", () => {
    expect(faitsJusquA(lu.faits, null)).toHaveLength(7);
    expect(faitsJusquA(lu.faits, 119)).toHaveLength(0);
    expect(faitsJusquA(lu.faits, 120)).toHaveLength(1);
    expect(faitsJusquA(lu.faits, 5000)).toHaveLength(7);
  });
});

describe("les films à refaire pour leur journal", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const s = (gameId: string, gameStart: string) => ({ gameId, gameStart });
  it("ceux d'avant le journal, les plus récents d'abord ; ni ceux qui l'ont, ni ceux dont le moteur ne note pas les faits", () => {
    let index = indexVide();
    index = noterFilm(index, "vieux1", "2026-11-15T10:00:00Z", 1000, "a".repeat(40));
    index = noterFilm(index, "vieux2", "2026-11-16T10:00:00Z", 1000, "a".repeat(40));
    index = noterFilm(index, "avec", "2026-11-16T11:00:00Z", 1000, "a".repeat(40), true);
    index = noterFilm(index, "sans", "2026-11-16T12:00:00Z", 1000, "a".repeat(40), false);
    index = noterFilm(index, "ancien", "2026-11-01T12:00:00Z", 1000, "a".repeat(40));
    const sessions = [s("vieux1", "2026-11-15T10:00:00Z"), s("vieux2", "2026-11-16T10:00:00Z"), s("avec", "2026-11-16T11:00:00Z"), s("sans", "2026-11-16T12:00:00Z"), s("ancien", "2026-11-01T12:00:00Z"), s("nouvelle", "2026-11-17T11:00:00Z")];
    expect(partiesARefilmer(sessions, index, now).map((p) => p.gameId)).toEqual(["vieux2", "vieux1"]);
    // Une partie qui échoue trop souvent garde son film d'avant.
    for (let k = 0; k < ESSAIS_MAX; k++) index = noterEchec(index, "vieux2", "2026-11-16T10:00:00Z", "panne", false);
    expect(partiesARefilmer(sessions, index, now).map((p) => p.gameId)).toEqual(["vieux1"]);
    expect(nomDuJournal("abc")).toBe("abc.journal.json");
    expect(nomDuJournal("../x")).toBeNull();
  });
  it("un journal d'avant les pseudos de la partie se refait aussi", () => {
    const index = noterFilm(indexVide(), "avec", "2026-11-16T11:00:00Z", 1000, "a".repeat(40), true);
    expect(index.films[0]!.pseudos).toBe(2);
    expect(partiesARefilmer([s("avec", "2026-11-16T11:00:00Z")], index, now)).toEqual([]);
    const avant = { ...index, films: [{ partie: "avec", debut: "2026-11-16T11:00:00Z", octets: 1000, journal: true }] };
    expect(partiesARefilmer([s("avec", "2026-11-16T11:00:00Z")], avant, now).map((p) => p.gameId)).toEqual(["avec"]);
    // Le premier jet, qui ne nommait que les Gaulois, se refait de même.
    const premierJet = { ...index, films: [{ ...avant.films[0]!, pseudos: true as const }] };
    expect(partiesARefilmer([s("avec", "2026-11-16T11:00:00Z")], premierJet, now).map((p) => p.gameId)).toEqual(["avec"]);
  });
});

describe("les pseudos de la partie", () => {
  const pseudos = new Map([["g1", "Autre nom"], ["g2", "Chilimou FR"], ["e4", "Ami"], ["a5", "Adversaire"], ["a6", "Sans clan"]]);
  const avec = (faits: unknown) => journalDeLaPartie(meta(faits), { ...partie, pseudos })!;
  it("nomment chaque joueur humain hors de la liste publique, le tag officiel devant ; le pseudo public passe d'abord", () => {
    const j = avec([[120, 0, 1, 2, 500], [130, 0, 3, 1, 70], [140, 2, 1, 5, 10], [150, 2, 6, 2, 10], [160, 7, 4, 1], [170, 2, 1, 7, 10]]);
    expect(j.joueurs).toEqual([["Judom FR", 0], ["Chilimou FR", 0, 1], [null, 0], ["[UN] Adversaire", 2, 1], ["Sans clan", 2, 1], ["Ami", 1, 1], [null, 3]]);
    // Ni le pseudo de partie d'un membre de la liste publique, ni un identifiant.
    expect(JSON.stringify(j)).not.toMatch(/Autre nom|"g1"|"a5"|"a6"|"e4"/);
  });
  it("un membre de la liste publique hors du tag garde son pseudo public seul ; le tag sorti du classement part à la publication", () => {
    const j = journalDeLaPartie(meta([[140, 2, 1, 5, 10], [160, 7, 4, 1]]), { ...partie, noms: new Map([...partie.noms, ["e4", "Membre Public"]]), pseudos })!;
    expect(j.joueurs).toEqual([["Judom FR", 0], ["[UN] Adversaire", 2, 1], ["Membre Public", 1]]);
    expect(journalPublie(j, () => false).joueurs).toEqual([[null, 0], ["Adversaire", 2, 1], [null, 1]]);
    expect(journalPublie(j, () => true).joueurs).toEqual(j.joueurs);
    expect(pseudoEnPartie("[UN] " + "x".repeat(60), false)).toBe("[UN] " + "x".repeat(35));
  });
  it("sans pseudo lisible, un autre joueur garde le tag officiel de son clan, ou son camp", () => {
    const j = journalDeLaPartie(meta([[140, 2, 1, 5, 10], [150, 2, 6, 2, 10]]), { ...partie, pseudos: new Map([["a5", "[UN]"], ["a6", "<b>"]]) })!;
    expect(j.joueurs).toEqual([["Judom FR", 0], ["[UN]", 2], [null, 2], [null, 0]]);
  });
  it("restent à la publication, et se relisent à l'écran sans Gaulois dessiné ni numéro", () => {
    const j = avec([[120, 0, 1, 2, 500], [130, 0, 3, 1, 70]]);
    const publie = journalPublie(lireJournal(JSON.stringify(j), PARTIE), () => false);
    expect(publie.joueurs).toEqual([[null, 0], ["Chilimou FR", 0, 1], [null, 0]]);
    const lu = journalALEcran(JSON.parse(JSON.stringify(j)), PARTIE)!;
    expect(lu.faits[0]!.de).toEqual({ nom: "Judom FR", camp: "gaulois", enPartie: false, numero: 0 });
    expect(lu.faits[0]!.a).toEqual({ nom: "Chilimou FR", camp: "gaulois", enPartie: true, numero: 0 });
    expect(nomDit(lu.faits[1]!.de, true)).toBe("Un Gaulois");
    // Une troisième case inattendue, ou sur un joueur d'un autre camp : refusée.
    expect(journalALEcran({ ...j, joueurs: [["Judom FR", 0], ["Chilimou FR", 0, 2], [null, 0]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...j, joueurs: [["Judom FR", 0], ["Chilimou FR", 3, 1], [null, 0]] }, PARTIE)).toBeNull();
    expect(journalALEcran({ ...j, joueurs: [["Judom FR", 0], [null, 0, 1], [null, 0]] }, PARTIE)).toBeNull();
    expect(() => lireJournal(JSON.stringify({ ...j, joueurs: [["Judom FR", 0], ["Chilimou FR", 3, 1], [null, 0]] }), PARTIE)).toThrow("mauvais format");
  });
  it("s'écrivent sans leur tag, sur une ligne, ou pas du tout", () => {
    expect(pseudoEnPartie("[GAL] Chilimou FR")).toBe("Chilimou FR");
    expect(pseudoEnPartie("  [GAL][FR]  Deux   mots ")).toBe("Deux mots");
    expect(pseudoEnPartie("Sans tag")).toBe("Sans tag");
    expect(pseudoEnPartie("[GAL]")).toBeNull();
    expect(pseudoEnPartie("[GAL] <b>")).toBeNull();
    expect(pseudoEnPartie("")).toBeNull();
    expect(pseudoEnPartie(null)).toBeNull();
    expect(pseudoEnPartie("x".repeat(60))).toBe("x".repeat(40));
    expect(pseudoEnPartie("x".repeat(39) + String.fromCodePoint(0x1f600))).toBe("x".repeat(39));
  });
});

describe("le lecteur du jeu et le journal", () => {
  const modele = `<!doctype html><html><head><meta charset="UTF-8" /><script>window.BOOTSTRAP_CONFIG = {};</script></head><body></body></html>`;
  const page = pageDuLecteur(modele, { commit: "a".repeat(40), manifeste: {}, apiHost: "/jeu/api", retour: "https://les-gaulois.github.io/revoir", notice: "/jeu/LISEZ-MOI.txt" });
  const corps = /<script>(\(function \(\) \{ var pause = false[\s\S]*?)<\/script>/.exec(page)?.[1] ?? "";
  it("dit son étape au seul site du clan, quand elle change, et y va quand il le demande", () => {
    const ecoutes: ((e: { origin: string; data: unknown }) => void)[] = [];
    const envois: unknown[][] = [];
    let minuterie: (() => void) | null = null;
    const fenetre: { galLecture?: (l: unknown) => void; parent: unknown; setInterval: (f: () => void, ms: number) => void } = {
      parent: { postMessage: (...a: unknown[]) => envois.push(a) },
      setInterval: (f, ms) => {
        expect(ms).toBe(250);
        minuterie = f;
      },
    };
    new Function("window", "location", "matchMedia", "addEventListener", "URLSearchParams", corps)(fenetre, { search: "" }, () => ({ matches: false }), (_: string, f: (e: { origin: string; data: unknown }) => void) => ecoutes.push(f), URLSearchParams);
    const allers: number[] = [];
    const lecture = { frame: -1, setSpeed() {}, play() {}, pause() {}, seek: (n: number) => allers.push(n) };
    fenetre.galLecture!(lecture);
    lecture.frame = 42;
    minuterie!();
    minuterie!();
    lecture.frame = 43;
    minuterie!();
    expect(envois).toEqual([[{ gal: "temps", etape: 42 }, "https://les-gaulois.github.io"], [{ gal: "temps", etape: 43 }, "https://les-gaulois.github.io"]]);
    const message = (origin: string, data: unknown) => ecoutes.forEach((f) => f({ origin, data }));
    message("https://ailleurs.example", { gal: "aller", etape: 10 });
    message("https://les-gaulois.github.io", { gal: "aller", etape: "10" });
    message("https://les-gaulois.github.io", { gal: "aller", etape: -3 });
    message("https://les-gaulois.github.io", { gal: "aller", etape: 120.7 });
    expect(allers).toEqual([120]);
  });
  it("le programme de rejeu note les faits que le moteur annonce, dans la limite et aux codes que le site relit", () => {
    const entree = readFileSync("scripts/rejeu-openfront/entree.ts", "utf8");
    expect(entree).toContain(`const FAITS_MAX = ${FAITS_MAX.toLocaleString("en-US").replace(/,/g, "_")};`);
    for (const [type, code] of [["DonateEvent", "d.donationType === \"gold\" ? 1 : 0"], ["ConquestEvent", String(CODES.elimination)], ["Unit", String(CODES.bombe)], ["Emoji", String(CODES.emoji)], ["TargetPlayer", String(CODES.cible)], ["DisplayChatEvent", String(CODES.message)], ["AllianceRequest", String(CODES.allianceDemandee)], ["BrokeAlliance", String(CODES.allianceRompue)], ["AllianceExpired", String(CODES.allianceFinie)]] as const) {
      const passage = entree.slice(entree.indexOf(`annonces(T.${type})`));
      expect(passage.slice(0, passage.indexOf("noter(") + 60), type).toContain(`noter(${code},`);
    }
    expect(entree).toContain(`noter(a.accepted ? ${CODES.allianceAcceptee} : ${CODES.allianceRefusee},`);
    expect(entree).toContain('const BOMBES_NOTEES = ["Atom Bomb", "Hydrogen Bomb", "MIRV"];');
  });
});
