import { describe, expect, it } from "vitest";
import { BANNIERES } from "../../supabase/functions/code-discord/bannieres/index";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import {
  COFFRE_FILE,
  COFFRE_MESSAGES,
  DRUIDE_MODELE,
  FORME_DE_LA_REPONSE,
  INDICE_MAX,
  PERCEURS_FILE,
  RAISON_DU_ROLE,
  ROLE_DU_CHAMPION,
  coffreCommand,
  formeDite,
  lireLaReponse,
  motComplet,
  parsePerceurs,
  perceursCommand,
  semaineEnMots,
  placesValides,
} from "../../supabase/functions/code-discord/coffre";
import {
  FICHES_DES_GARDIENS,
  FICHES_DES_HUMEURS,
  GARDIENS,
  GRANDE,
  HUMEURS,
  ECHELLE_DU_PODIUM,
  IMAGE_DU_COFFRE,
  MARCHES_DU_PODIUM,
  TIERS_DU_PODIUM,
  PETITE,
  SIGNES_DES_HUMEURS,
  casesDuCoffre,
  casesDuMot,
  decrireLEssai,
  decrireLaVictoire,
  decrireLePalmares,
  indicesDuTableau,
  largeurDuTexte,
  pngDeLEssai,
  pngDeLaVictoire,
  pngDuPalmares,
  tenueDuGardien,
  type DessinDeLEssai,
} from "../../supabase/functions/code-discord/coffre-image";
import { lireTenue, TENUE_DE_DEPART } from "../../supabase/functions/code-discord/gaulois";
import type { DemandeClaude, DiscordCall, ReponseClaude } from "../../supabase/functions/code-discord/index";

const GUILD = "1350905494600024094";
const JOUEUR = "111111111111111111";
const ANCIEN = "666666666666666666";
const ROLE = "777777777777777777";
const APP = "222222222222222222";
const TOKEN = "jeton-de-l-interaction-0123456789";

describe("les gardiens et leurs humeurs", () => {
  it("chaque gardien, dans chaque humeur, a une tenue que la garde-robe du site sait lire, et un visage qui change", () => {
    for (const gardien of GARDIENS) {
      const visages = new Set<string>();
      for (const humeur of HUMEURS) {
        const { yeux, bouche } = FICHES_DES_HUMEURS[humeur];
        // La tenue écrite ici est acceptée telle quelle : aucun repli sur le Gaulois de départ.
        expect(lireTenue({ ...FICHES_DES_GARDIENS[gardien].tenue, yeux, bouche }), `${gardien} ${humeur}`).not.toBeNull();
        const tenue = tenueDuGardien(gardien, humeur);
        expect(tenue).not.toEqual(TENUE_DE_DEPART);
        visages.add(`${tenue["yeux"]} ${tenue["bouche"]}`);
      }
      expect(visages.size).toBe(HUMEURS.length);
    }
  });

  it("chaque humeur se dit trois fois : un mot, une couleur, un signe de bulle", () => {
    expect(new Set(HUMEURS.map((h) => FICHES_DES_HUMEURS[h].mot)).size).toBe(HUMEURS.length);
    expect(new Set(HUMEURS.map((h) => FICHES_DES_HUMEURS[h].couleur)).size).toBe(HUMEURS.length);
    expect(new Set(HUMEURS.map((h) => SIGNES_DES_HUMEURS[h].join("")))).toHaveProperty("size", HUMEURS.length);
    for (const humeur of HUMEURS) {
      expect(SIGNES_DES_HUMEURS[humeur]).toHaveLength(9);
      for (const rangee of SIGNES_DES_HUMEURS[humeur]) expect(rangee).toMatch(/^[.#]{9}$/);
    }
  });
});

describe("l'écriture en cases", () => {
  it("toutes les lettres existent dans les deux tailles, à la bonne hauteur", () => {
    for (const lettre of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      expect(PETITE[lettre], lettre).toHaveLength(5);
      expect(GRANDE[lettre], lettre).toHaveLength(7);
    }
    for (const chiffre of "0123456789") expect(PETITE[chiffre], chiffre).toHaveLength(5);
  });

  it("un accent ne change pas la largeur, et un signe inconnu ne prend pas de place", () => {
    expect(largeurDuTexte(PETITE, "méfiant", 2)).toBe(largeurDuTexte(PETITE, "mefiant", 2));
    expect(largeurDuTexte(PETITE, "ça", 2)).toBe(largeurDuTexte(PETITE, "ca", 2));
    expect(largeurDuTexte(PETITE, "œuf", 2)).toBe(largeurDuTexte(PETITE, "oeuf", 2));
    expect(largeurDuTexte(PETITE, `a${String.fromCodePoint(0x1f525)}b`, 2)).toBe(largeurDuTexte(PETITE, "ab", 2));
    expect(largeurDuTexte(PETITE, "", 2)).toBe(0);
  });
});

describe("le tableau des indices", () => {
  it("sans longueur dite, les cases ne disent pas combien de lettres a le mot", () => {
    expect(casesDuMot({ mot: "menhir", longueurDite: false, lettres: [], indices: [] })).toEqual(["?", "?", "?"]);
    expect(casesDuMot({ mot: "menhir", longueurDite: false, lettres: [1], indices: [] })).toEqual(["m", "?"]);
    expect(casesDuMot({ mot: "menhir", longueurDite: false, lettres: [3], indices: [] })).toEqual(["_", "_", "n", "?"]);
  });

  it("la longueur dite, chaque lettre a sa case, et seules les lettres données s'écrivent", () => {
    expect(casesDuMot({ mot: "menhir", longueurDite: true, lettres: [1, 4, 9, 0], indices: [] })).toEqual(["m", "_", "_", "h", "_", "_"]);
    expect(indicesDuTableau({ mot: "menhir", longueurDite: true, lettres: [], indices: ["une pierre"] })).toEqual(["6 lettres", "une pierre"]);
    expect(indicesDuTableau({ mot: "menhir", longueurDite: false, lettres: [], indices: [] })).toEqual([]);
  });

  it("toutes les lettres données, le mot est donné", () => {
    expect(motComplet("menhir", [1, 2, 3, 4, 5, 6])).toBe(true);
    expect(motComplet("menhir", [1, 2, 3, 4, 5])).toBe(false);
    expect(motComplet("menhir", [1, 1, 2, 3, 4, 5, 9])).toBe(false);
    expect(placesValides([3, 1, 1, 0, 7, 2.5, "2"], 6)).toEqual([1, 3]);
  });
});

describe("la réponse de Claude, lue sans rien croire", () => {
  const dire = (objet: unknown): string => JSON.stringify(objet);

  it("garde l'humeur, les places et l'indice quand ils ont la bonne forme", () => {
    expect(lireLaReponse(dire({ reponse: "Six lettres, pas une de plus.", humeur: "flatte", longueur_dite: true, lettres: [1, 9], indice: "  une  pierre " }), "menhir")).toEqual({
      reponse: "Six lettres, pas une de plus.",
      humeur: "flatte",
      longueurDite: true,
      lettres: [1],
      indice: "une pierre",
    });
  });

  it("refuse une humeur inconnue, « vaincu » que seul le jeu décide, un indice trop long ou qui dit le mot", () => {
    expect(lireLaReponse(dire({ reponse: "Non.", humeur: "vaincu", longueur_dite: "oui", lettres: "1", indice: "x".repeat(INDICE_MAX + 1) }), "menhir")).toEqual({ reponse: "Non.", humeur: "mefiant", longueurDite: false, lettres: [], indice: "" });
    expect(lireLaReponse(dire({ reponse: "Non.", humeur: "joyeux", longueur_dite: false, lettres: [], indice: "un menhir" }), "menhir").indice).toBe("");
    expect(lireLaReponse(dire({ reponse: "Non.", humeur: "agace", longueur_dite: false, lettres: [], indice: "m-e-n-h-i-r" }), "menhir").indice).toBe("");
  });

  it("un texte qui n'a pas la forme demandée est pris pour la parole du gardien, méfiant", () => {
    expect(lireLaReponse("Passe ton chemin.", "menhir")).toEqual({ reponse: "Passe ton chemin.", humeur: "mefiant", longueurDite: false, lettres: [], indice: "" });
    // Un objet coupé ou sans parole ne se montre jamais tel quel au salon.
    expect(lireLaReponse(dire({ humeur: "confiant" }), "menhir")).toMatchObject({ reponse: "", humeur: "mefiant" });
    expect(lireLaReponse('{"reponse": "Non, vill', "menhir").reponse).toBe("");
  });

  it("le code lit lui-même, dans la réponse, la longueur et les lettres du bout, et ne garde que ce qui est vrai du mot", () => {
    // La réponse vue par le pilote au premier essai en images : un rappel, que Claude n'avait pas signalé.
    expect(formeDite("Tu as déjà six lettres, un T et une rime : à toi de faire chauffer ta cervelle.", "tamise")).toEqual({ longueurDite: true, lettres: [] });
    expect(formeDite("Il a 6 lettres et commence par un T.", "tamise")).toEqual({ longueurDite: true, lettres: [1] });
    expect(formeDite("Mon mot commence par la lettre « M » et se termine par R.", "menhir")).toEqual({ longueurDite: false, lettres: [1, 6] });
    expect(formeDite("Il finit par un R, foi de gardien !", "menhir")).toEqual({ longueurDite: false, lettres: [6] });
    // Un chiffre ou une lettre qui ne sont pas ceux du mot ne vont jamais au tableau.
    expect(formeDite("Sept lettres ? Non ! Et il ne commence pas par un Z.", "menhir")).toEqual({ longueurDite: false, lettres: [] });
    expect(formeDite("Je n'ai écrit que trois lettres à ma mère.", "menhir")).toEqual({ longueurDite: false, lettres: [] });
    expect(formeDite("Passe ton chemin.", "menhir")).toEqual({ longueurDite: false, lettres: [] });
  });

  it("un rappel du gardien remplit le tableau, même si Claude ne l'a pas signalé", async () => {
    const m = monde({ rpc: { coffre_ouvrir: () => ouverture({ manche: { id: 2, mot: "menhir", essais: 3, gardien: "druide", longueur_dite: false, lettres: [], indices: [] } }), coffre_clore: () => clos({ tableau: { longueur_dite: true, lettres: [1], indices: [] } }) }, claude: () => structure({ reponse: "Tu as déjà six lettres, et il commence par un M : à toi de jouer.", humeur: "confiant" }) });
    await coffreCommand(interaction("salut"), m.deps);
    await m.fini();
    expect(m.calls.rpc[1]?.args).toMatchObject({ p_gagne: false, p_longueur: true, p_lettres: [1] });
    const jointe = (dernier(m.calls.webhook).call?.body as { attachments: { description: string }[] }).attachments[0];
    expect(jointe?.description).toContain("Le mot : M … … … … ….");
    expect(jointe?.description).toContain("Indices : 6 lettres.");
  });

  it("la forme demandée à Claude ne propose pas « vaincu » et exige ses cinq parties", () => {
    expect(FORME_DE_LA_REPONSE.properties.humeur.enum).toEqual(HUMEURS.filter((h) => h !== "vaincu"));
    expect(FORME_DE_LA_REPONSE.required).toEqual(Object.keys(FORME_DE_LA_REPONSE.properties));
    expect(FORME_DE_LA_REPONSE.additionalProperties).toBe(false);
  });
});

describe("les images", () => {
  const essai: DessinDeLEssai = { gardien: "forgeron", humeur: "panique", tenue: null, tableau: { mot: "enclume", longueurDite: true, lettres: [1, 4], indices: ["un outil"] }, manche: 5, essai: 23, garde: 3, cagnotte: 1260, soir: "cervoise" };

  it("ont la taille annoncée, plus de 1,55 fois plus larges que hautes, et sont de vrais PNG", async () => {
    expect(IMAGE_DU_COFFRE.largeur / IMAGE_DU_COFFRE.hauteur).toBeGreaterThanOrEqual(1.55);
    const images = [
      await pngDeLEssai(essai),
      await pngDeLEssai({ ...essai, gardien: "marchande", humeur: "flatte", tenue: TENUE_DE_DEPART, soir: null, tableau: { mot: "enclume", longueurDite: false, lettres: [], indices: [] } }),
      await pngDeLaVictoire({ gardien: "barde", tenue: null, mot: "parapluie", manche: 1, essai: 2, gain: 340 }),
      await pngDuPalmares([{ nom: "Un", coffres: 7, tenue: null }, { nom: "Deux", coffres: 4, tenue: TENUE_DE_DEPART }, { nom: "Trois", coffres: 1, tenue: null }]),
      await pngDuPalmares([{ nom: "Seul", coffres: 1, tenue: null }]),
    ];
    for (const png of images) {
      const image = await lirePng(png);
      expect(image).toMatchObject({ largeur: IMAGE_DU_COFFRE.largeur, hauteur: IMAGE_DU_COFFRE.hauteur });
    }
  });

  it("le fond du podium se partage en trois tiers qui couvrent toute la largeur, chacun derrière sa marche", () => {
    const bords = [...TIERS_DU_PODIUM].sort((a, b) => a.gauche - b.gauche);
    expect(bords[0]?.gauche).toBe(0);
    expect(bords[2]?.droite).toBe(IMAGE_DU_COFFRE.largeur);
    expect(bords[0]?.droite).toBe(bords[1]?.gauche);
    expect(bords[1]?.droite).toBe(bords[2]?.gauche);
    MARCHES_DU_PODIUM.forEach((marche, rang) => {
      expect(marche.cx).toBeGreaterThan(TIERS_DU_PODIUM[rang]?.gauche ?? Infinity);
      expect(marche.cx).toBeLessThan(TIERS_DU_PODIUM[rang]?.droite ?? -Infinity);
    });
  });

  it("la bannière d'un perceur change le fond de son tiers, et de lui seul ; une bannière inconnue ne change rien", async () => {
    const [une, autre] = BANNIERES;
    if (!une || !autre) throw new Error("le catalogue des bannières est vide");
    const trois = (bannieres: (string | null)[]) => bannieres.map((banniere, i) => ({ nom: `M${i}`, coffres: 3 - i, tenue: null, banniere }));
    const pixels = async (bannieres: (string | null)[]) => (await lirePng(await pngDuPalmares(trois(bannieres))))?.rgba ?? new Uint8Array();
    const sans = await pixels([null, null, null]);
    const premier = await pixels([une.id, null, null]);
    const dernier = await pixels([null, null, autre.id]);
    const inconnue = await pixels(["banniere-qui-n-existe-pas", null, null]);
    // Un point en haut de chaque tiers, loin des Gaulois et du filet : (x, 3).
    const point = (rgba: Uint8Array, x: number) => [...rgba.slice((3 * IMAGE_DU_COFFRE.largeur + x) * 4, (3 * IMAGE_DU_COFFRE.largeur + x) * 4 + 3)].join(",");
    const [gauche, milieu, droite] = [20, 225, 600];
    expect(point(premier, milieu)).not.toBe(point(sans, milieu));
    expect(point(premier, gauche)).toBe(point(sans, gauche));
    expect(point(premier, droite)).toBe(point(sans, droite));
    expect(point(dernier, droite)).not.toBe(point(sans, droite));
    expect(point(dernier, milieu)).toBe(point(sans, milieu));
    expect(Buffer.from(inconnue).equals(Buffer.from(sans))).toBe(true);
    expect(decrireLePalmares(trois([une.id, null, null]))).toContain(`1. M0, 3 coffres, devant sa bannière « ${une.nom} »`);
  });

  it("sur le podium, chaque Gaulois tient tout entier dans l'image, de la tête aux pieds", () => {
    const scene = IMAGE_DU_COFFRE.hauteur - IMAGE_DU_COFFRE.bandeau;
    for (const marche of MARCHES_DU_PODIUM) {
      // Sa grille fait 48 cases sur 64 : rien ne dépasse en haut, sur les côtés, ni sous la scène, et sa marche garde la place de deux lignes.
      expect(marche.haut).toBeGreaterThanOrEqual(0);
      expect(marche.cx - 24 * ECHELLE_DU_PODIUM).toBeGreaterThanOrEqual(0);
      expect(marche.cx + 24 * ECHELLE_DU_PODIUM).toBeLessThanOrEqual(IMAGE_DU_COFFRE.largeur);
      expect(scene - (marche.haut + 63 * ECHELLE_DU_PODIUM)).toBeGreaterThanOrEqual(38);
    }
    expect(MARCHES_DU_PODIUM[0].haut).toBeLessThan(MARCHES_DU_PODIUM[1].haut);
    expect(MARCHES_DU_PODIUM[1].haut).toBeLessThan(MARCHES_DU_PODIUM[2].haut);
  });

  it("l'humeur change vraiment l'image, et le coffre ouvert n'est pas le coffre fermé", async () => {
    const calme = await pngDeLEssai({ ...essai, humeur: "confiant" });
    const affole = await pngDeLEssai({ ...essai, humeur: "panique" });
    expect(Buffer.from(calme).equals(Buffer.from(affole))).toBe(false);
    expect(casesDuCoffre(true).cases).not.toEqual(casesDuCoffre(false).cases);
    expect(casesDuCoffre(false).cases).toHaveLength(casesDuCoffre(false).largeur * casesDuCoffre(false).hauteur);
  });

  it("se disent en mots, sans jamais écrire une lettre que le tableau ne montre pas", () => {
    const mots = decrireLEssai(essai);
    expect(mots).toContain("Le forgeron, paniqué");
    expect(mots).toContain("Le mot : E … … L … … ….");
    expect(mots).toContain("Indices : 7 lettres, un outil.");
    expect(mots).toContain("Manche 5, essai 23. Garde du gardien : 3 sur 4. Cagnotte : 1260 statères.");
    expect(mots).toContain("Soir de cervoise.");
    expect(mots).not.toContain("enclume");
    expect(decrireLEssai({ ...essai, soir: null, tableau: { mot: "enclume", longueurDite: false, lettres: [], indices: [] } })).toContain("Rien n'est encore connu du mot.");
    expect(decrireLaVictoire({ gardien: "barde", tenue: null, mot: "parapluie", manche: 1, essai: 2, gain: 340 })).toContain("La cagnotte de 340 statères est gagnée.");
    expect(decrireLePalmares([{ nom: "Un", coffres: 7, tenue: null }, { nom: "Deux", coffres: 1, tenue: null }])).toBe("Les perceurs de coffres de la semaine : 1. Un, 7 coffres ; 2. Deux, 1 coffre.");
  });
});

/** Un monde de test : le serveur, Claude et Discord répondent ce qu'on leur dit, et tout ce qui part est noté. */
function monde(options: { rpc?: Record<string, (args: Record<string, unknown>) => Record<string, unknown> | null>; claude?: (demande: DemandeClaude) => ReponseClaude | null; roles?: unknown }) {
  const calls = { rpc: [] as { name: string; args: Record<string, unknown> }[], webhook: [] as { method: string; path: string; call?: DiscordCall }[], discord: [] as { method: string; path: string; call?: DiscordCall }[], log: [] as string[] };
  const tasks: Promise<unknown>[] = [];
  const deps: Parameters<typeof coffreCommand>[1] = {
    guildId: GUILD,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return options.rpc?.[name]?.(args) ?? null;
    },
    webhook: async (method, path, call) => {
      calls.webhook.push({ method, path, call });
      return { status: 200, body: null };
    },
    discord: async (method, path, call) => {
      calls.discord.push({ method, path, call });
      return { status: method === "GET" ? 200 : 204, body: method === "GET" ? (options.roles ?? []) : null };
    },
    background: (task) => void tasks.push(task),
    log: (message) => void calls.log.push(message),
    sleep: async () => undefined,
    claude: async (demande) => (options.claude ? options.claude(demande) : { texte: "Non.", modele: DRUIDE_MODELE, entree: 10, sortie: 10 }),
  };
  return { deps, calls, fini: () => Promise.all(tasks) };
}

const interaction = (message: string, mise?: number): Record<string, unknown> => ({
  type: 2,
  id: "333333333333333333",
  application_id: APP,
  token: TOKEN,
  guild_id: GUILD,
  channel: { id: "444444444444444444", type: 0, name: "coffre-du-druide" },
  member: { nick: "Jod", user: { id: JOUEUR, username: "jod" } },
  data: { name: "coffre", options: [{ name: "message", type: 3, value: message }, ...(mise === undefined ? [] : [{ name: "mise", type: 4, value: mise }])] },
});

const ouverture = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ok: true,
  essai: 9,
  manche: { id: 2, mot: "menhir", essais: 3, gardien: "barde", longueur_dite: false, lettres: [1, 2, 3], indices: [] },
  niveau: 1,
  passes: ["menhir"],
  ruses: [],
  historique: [],
  restants: 7,
  soir: null,
  cagnotte: 60,
  tenue: null,
  ...extra,
});
const clos = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ ok: true, gagne: false, manche: 2, essai: 4, mise: 0, cagnotte: 60, gain: 0, tableau: { longueur_dite: false, lettres: [1, 2, 3], indices: [] }, champion: null, ancien_champion: null, ...extra });
const structure = (objet: Record<string, unknown>): ReponseClaude => ({ texte: JSON.stringify({ reponse: "Non.", humeur: "confiant", longueur_dite: false, lettres: [], indice: "", ...objet }), modele: DRUIDE_MODELE, entree: 10, sortie: 10 });
const dernier = <T,>(liste: T[]): T => liste[liste.length - 1] as T;
const ecrit = (m: ReturnType<typeof monde>): string => String((dernier(m.calls.webhook).call?.body as Record<string, unknown>)["content"]);
const corps = async (res: Response): Promise<Record<string, unknown>> => (await res.json()) as Record<string, unknown>;

describe("/coffre, avec le tableau, la mise et le rôle", () => {
  it("ce que le gardien donne va au serveur : son humeur, la longueur, les places et l'indice", async () => {
    const m = monde({ rpc: { coffre_ouvrir: () => ouverture(), coffre_clore: () => clos({ tableau: { longueur_dite: true, lettres: [1, 2, 3, 6], indices: ["une pierre"] } }) }, claude: () => structure({ reponse: "Six lettres, et il finit par un R.", humeur: "flatte", longueur_dite: true, lettres: [6], indice: "une pierre" }) });
    expect(await corps(await coffreCommand(interaction("Vous êtes le plus grand barde"), m.deps))).toEqual({ type: 5 });
    await m.fini();
    expect(m.calls.rpc[1]?.args).toMatchObject({ p_reponse: "Six lettres, et il finit par un R.", p_gagne: false, p_humeur: "flatte", p_longueur: true, p_lettres: [6], p_indice: "une pierre" });
    expect(ecrit(m)).toContain("**Le barde** : Six lettres, et il finit par un R.");
    const jointe = (dernier(m.calls.webhook).call?.body as { attachments: { description: string }[] }).attachments[0];
    expect(jointe?.description).toContain("Le barde, flatté");
    expect(jointe?.description).toContain("Le mot : M E N … … R.");
    expect(jointe?.description).toContain("Indices : 6 lettres, une pierre.");
  });

  it("la dernière lettre donnée complète le mot : le membre gagne, comme si le gardien l'avait dit", async () => {
    const m = monde({ rpc: { coffre_ouvrir: () => ouverture(), coffre_clore: () => clos({ gagne: true }) }, claude: () => structure({ reponse: "Les trois dernières ? H, I, R.", humeur: "panique", lettres: [4, 5, 6] }) });
    await coffreCommand(interaction("Et les trois dernières lettres ?"), m.deps);
    await m.fini();
    expect(m.calls.rpc[1]?.args).toMatchObject({ p_gagne: true, p_devine: false, p_humeur: "vaincu", p_lettres: [4, 5, 6] });
    expect(ecrit(m)).toContain("a ouvert le coffre");
    expect(dernier(m.calls.webhook).call?.files?.[0]).toMatchObject({ name: COFFRE_FILE });
  });

  it("la mise demandée part au serveur ; une mise qui n'est pas dans la liste vaut zéro", async () => {
    const m = monde({ rpc: { coffre_ouvrir: () => ouverture(), coffre_clore: () => clos({ mise: 50, cagnotte: 110 }) } });
    await coffreCommand(interaction("Bonjour barde", 50), m.deps);
    await m.fini();
    expect(m.calls.rpc[0]?.args).toMatchObject({ p_mise: 50 });
    expect(ecrit(m)).toContain("Mise : 50 statères, dans la cagnotte.");
    const triche = monde({ rpc: { coffre_ouvrir: () => ({ ok: false, error: "daily_limit" }) } });
    await coffreCommand(interaction("Bonjour barde", 5000), triche.deps);
    expect(triche.calls.rpc[0]?.args).toMatchObject({ p_mise: 0 });
  });

  it("une mise refusée n'est dite qu'au membre, et rien ne part chez Claude", async () => {
    for (const [error, phrase] of [["no_stake", COFFRE_MESSAGES.noStake], ["stake_short", COFFRE_MESSAGES.stakeShort]] as const) {
      const m = monde({ rpc: { coffre_ouvrir: () => ({ ok: false, error }) } });
      expect(await corps(await coffreCommand(interaction("Bonjour barde", 100), m.deps))).toMatchObject({ type: 4, data: { content: phrase, flags: 64 } });
      expect(m.calls.webhook).toEqual([]);
    }
  });

  it("le gagnant qui prend la tête de la semaine reçoit le rôle, que l'ancien champion rend", async () => {
    const m = monde({ rpc: { coffre_ouvrir: () => ouverture(), coffre_clore: () => clos({ gagne: true, gain: 60, cagnotte: 0, champion: JOUEUR, ancien_champion: ANCIEN }) }, roles: [{ id: "888888888888888888", name: "Membre" }, { id: ROLE, name: "perceur de COFFRES", managed: false, permissions: "0" }] });
    await coffreCommand(interaction("menhir"), m.deps);
    await m.fini();
    expect(ecrit(m)).toContain("Il remporte la cagnotte : 60 statères.");
    expect(m.calls.discord).toEqual([
      { method: "GET", path: `/guilds/${GUILD}/roles`, call: undefined },
      { method: "DELETE", path: `/guilds/${GUILD}/members/${ANCIEN}/roles/${ROLE}`, call: { reason: RAISON_DU_ROLE } },
      { method: "PUT", path: `/guilds/${GUILD}/members/${JOUEUR}/roles/${ROLE}`, call: { reason: RAISON_DU_ROLE } },
    ]);
    expect(ROLE_DU_CHAMPION).toBe("Perceur de coffres");
  });

  it("sans rôle de ce nom sur le serveur, ou si le champion ne change pas, le robot ne touche à aucun rôle", async () => {
    // Un autre nom, un rôle géré par une intégration, ou un rôle qui donne des droits : aucun ne se donne.
    const sansRole = monde({ rpc: { coffre_ouvrir: () => ouverture(), coffre_clore: () => clos({ gagne: true, champion: JOUEUR, ancien_champion: null }) }, roles: [{ id: ROLE, name: "Autre rôle" }, { id: ROLE, name: ROLE_DU_CHAMPION, managed: true }, { id: ROLE, name: ROLE_DU_CHAMPION, permissions: "8" }] });
    await coffreCommand(interaction("menhir"), sansRole.deps);
    await sansRole.fini();
    expect(sansRole.calls.discord.map((c) => c.method)).toEqual(["GET"]);
    const meme = monde({ rpc: { coffre_ouvrir: () => ouverture(), coffre_clore: () => clos({ gagne: true, champion: JOUEUR, ancien_champion: JOUEUR }) }, roles: [{ id: ROLE, name: ROLE_DU_CHAMPION }] });
    await coffreCommand(interaction("menhir"), meme.deps);
    await meme.fini();
    expect(meme.calls.discord).toEqual([]);
  });
});

describe("/perceurs", () => {
  const appel = { type: 2, guild_id: GUILD, data: { name: "perceurs" } };

  it("lit le podium sans rien croire : trois au plus, un nom propre, un compte de coffres", () => {
    expect(parsePerceurs({ perceurs: [{ nom: " [GAL]  Jod ", coffres: 3, tenue: { peau: "x" } }, { nom: "Sans coffre", coffres: 0 }, { coffres: 2 }, { nom: "B", coffres: 2, tenue: null }, { nom: "C", coffres: 1 }, { nom: "D", coffres: 1 }] })).toEqual([
      { nom: "GAL Jod", coffres: 3, tenue: null, banniere: null },
      { nom: "B", coffres: 2, tenue: null, banniere: null },
      { nom: "C", coffres: 1, tenue: null, banniere: null },
    ]);
    // La bannière : un identifiant de la forme de ceux du catalogue, sinon rien.
    expect(parsePerceurs({ perceurs: [{ nom: "A", coffres: 1, banniere: BANNIERES[0]?.id }, { nom: "B", coffres: 1, banniere: "../secret" }, { nom: "C", coffres: 1, banniere: 4 }] }).map((p) => p.banniere)).toEqual([BANNIERES[0]?.id, null, null]);
    expect(parsePerceurs(null)).toEqual([]);
  });

  it("dit la semaine du podium d'après le lundi de Paris, été comme hiver", () => {
    expect(semaineEnMots("2026-11-15T23:00:00+00:00")).toBe("semaine du 16 novembre");
    expect(semaineEnMots("2026-05-31T22:00:00+00:00")).toBe("semaine du 1er juin");
    expect(semaineEnMots("2026-08-02T22:00:00Z")).toBe("semaine du 3 août");
    expect(semaineEnMots("pas une date")).toBeNull();
    expect(semaineEnMots(null)).toBeNull();
  });

  it("montre le podium en image à tout le salon, sans mentionner personne", async () => {
    const m = monde({ rpc: { coffre_palmares: () => ({ ok: true, perceurs: [{ nom: "Jod", coffres: 3, tenue: null }] }) } });
    const res = await perceursCommand(appel, m.deps);
    const form = await res.formData();
    const charge = JSON.parse(String(form.get("payload_json"))) as { type: number; data: { attachments: { filename: string; description: string }[]; allowed_mentions: unknown; flags?: number } };
    expect(charge.type).toBe(4);
    expect(charge.data.flags).toBeUndefined();
    expect(charge.data.attachments[0]).toMatchObject({ filename: PERCEURS_FILE, description: "Les perceurs de coffres de la semaine : 1. Jod, 3 coffres." });
    expect(charge.data.allowed_mentions).toEqual({ parse: [] });
    expect(form.get("files[0]")).toBeInstanceOf(Blob);
  });

  it("sans gagnant cette semaine, hors du serveur ou sans réponse du serveur, répond au seul membre", async () => {
    const vide = monde({ rpc: { coffre_palmares: () => ({ ok: true, perceurs: [] }) } });
    expect(await corps(await perceursCommand(appel, vide.deps))).toMatchObject({ type: 4, data: { content: COFFRE_MESSAGES.noWinner, flags: 64 } });
    expect(await corps(await perceursCommand(appel, monde({}).deps))).toMatchObject({ type: 4, data: { content: COFFRE_MESSAGES.down, flags: 64 } });
    expect(await corps(await perceursCommand({ ...appel, guild_id: "999999999999999999" }, vide.deps))).toMatchObject({ type: 4, data: { content: COFFRE_MESSAGES.wrongPlace } });
  });
});
