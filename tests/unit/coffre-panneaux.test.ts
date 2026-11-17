import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import {
  AIDE_FILE,
  ALERTE_FILE,
  aideCommand,
  BILAN_FILE,
  COFFRE_MESSAGES,
  COFFRE_SALON_ID,
  coffreCommand,
  DRUIDE_MODELE,
  indiceCommand,
  indicesCommand,
  MISE_DU_COFFRE,
  parseTableau,
  perceursCommand,
  PRIX_DES_LETTRES,
  refusDeLaLettre,
  SEUILS_DE_CAGNOTTE,
  seuilPasse,
  TABLEAU_FILE,
} from "../../supabase/functions/code-discord/coffre";
import {
  decrireLAide,
  decrireLAlerte,
  decrireLeBilan,
  decrireLeTableau,
  dureeEnMots,
  IMAGE_DU_COFFRE,
  INDICES_GARDES,
  lignesDeLAide,
  pngDeLAide,
  pngDeLAlerte,
  pngDuBilan,
  pngDuTableau,
  type DessinDuTableau,
} from "../../supabase/functions/code-discord/coffre-image";
import { AIDE_COMMAND, COMMANDS, INDICE_COMMAND, INDICES_COMMAND } from "../../supabase/functions/code-discord/definitions";
import type { DiscordCall } from "../../supabase/functions/code-discord/index";

const GUILD = "1350905494600024094";
const JOUEUR = "111111111111111111";
const APP = "222222222222222222";
const TOKEN = "jeton-de-l-interaction-0123456789";
const LF = String.fromCharCode(10);

function monde(rpc: Record<string, (args: Record<string, unknown>) => Record<string, unknown> | null> = {}) {
  const calls = { rpc: [] as { name: string; args: Record<string, unknown> }[], webhook: [] as { method: string; path: string; call?: DiscordCall }[], log: [] as string[] };
  const tasks: Promise<unknown>[] = [];
  const deps: Parameters<typeof coffreCommand>[1] = {
    guildId: GUILD,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return rpc[name]?.(args) ?? null;
    },
    webhook: async (method, path, call) => {
      calls.webhook.push({ method, path, call });
      return { status: 200, body: null };
    },
    discord: async () => ({ status: 200, body: [] }),
    background: (task) => void tasks.push(task),
    log: (message) => void calls.log.push(message),
    sleep: async () => undefined,
    claude: async () => ({ texte: JSON.stringify({ reponse: "Non, villageois.", humeur: "mefiant", longueur_dite: false, lettres: [], indice: "" }), modele: DRUIDE_MODELE, entree: 10, sortie: 10 }),
  };
  return { deps, calls, fini: () => Promise.all(tasks) };
}

const appel = (name: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 2,
  id: "333333333333333333",
  application_id: APP,
  token: TOKEN,
  guild_id: GUILD,
  channel_id: COFFRE_SALON_ID,
  member: { nick: "Jod", user: { id: JOUEUR, username: "jod" } },
  data: { name },
  ...extra,
});

const corps = async (res: Response): Promise<Record<string, unknown>> => (await res.json()) as Record<string, unknown>;
/** Une réponse faite d'une image : ce que dit sa partie `payload_json`, et son fichier. */
async function enImage(res: Response): Promise<{ charge: { type: number; data: { flags?: number; attachments: { filename: string; description: string }[] } }; fichier: File }> {
  const form = await res.formData();
  return { charge: JSON.parse(String(form.get("payload_json"))), fichier: form.get("files[0]") as File };
}

const manche = (extra: Record<string, unknown> = {}) => ({ id: 7, mot: "chaudron", essais: 12, gardien: "forgeron", longueur_dite: true, lettres: [1, 4], indices: ["un objet", "en métal"], ...extra });
const tableau = (extra: Record<string, unknown> = {}) => ({ ok: true, ouvert: true, manche: manche(), numero: 7, niveau: 6, soir: null, cagnotte: 480, essais_par_membre: 30, prix_lettre: 50, ...extra });
const dessin: DessinDuTableau = { gardien: "forgeron", tableau: { mot: "chaudron", longueurDite: true, lettres: [1, 4], indices: ["un objet", "en métal"] }, manche: 7, essais: 12, garde: 3, cagnotte: 480, prixLettre: 50 };

describe("les panneaux du coffre", () => {
  it("chaque panneau a la taille des images du coffre, large pour Discord", async () => {
    const images = [
      await pngDuTableau(dessin),
      await pngDuTableau({ ...dessin, tableau: { ...dessin.tableau, indices: Array.from({ length: INDICES_GARDES }, (_, i) => `un indice assez long numéro ${i + 10}`) }, achat: { nom: "Jod", place: 3, prix: 50 }, prixLettre: null }),
      await pngDeLAide({ mise: MISE_DU_COFFRE, prixDesLettres: PRIX_DES_LETTRES, essais: 30 }),
      await pngDeLAlerte({ gardien: "marchande", tenue: null, seuil: 1000, cagnotte: 1010, garde: 2 }),
      await pngDuBilan({ gardien: "druide", mot: "chaudron", manche: 7, gagnant: "Jod", essais: 132, joueurs: 9, acharne: { nom: "Un", essais: 41 }, lettresAchetees: 2, minutes: 187 }),
    ];
    for (const png of images) {
      const image = await lirePng(png);
      expect(image).toMatchObject({ largeur: IMAGE_DU_COFFRE.largeur, hauteur: IMAGE_DU_COFFRE.hauteur });
      expect(IMAGE_DU_COFFRE.largeur / IMAGE_DU_COFFRE.hauteur).toBeGreaterThanOrEqual(1.55);
    }
  });

  it("le tableau dit en mots tout ce qu'il montre, sans jamais dire une lettre cachée", () => {
    const dit = decrireLeTableau(dessin);
    expect(dit).toContain("Le mot : C _ _ U _ _ _ _.".split("_").join("…"));
    expect(dit).toContain("Indices : 8 lettres, un objet, en métal.");
    expect(dit).toContain("La prochaine lettre coûte 50 statères, avec /indice.");
    expect(dit).not.toMatch(/chaudron/i);
    expect(decrireLeTableau({ ...dessin, prixLettre: null, achat: { nom: "Jod", place: 4, prix: 100 } })).toContain("Jod achète la lettre 4 du mot pour 100 statères");
    expect(decrireLeTableau({ ...dessin, prixLettre: null })).toContain("Plus de lettre à vendre dans cette manche.");
  });

  it("l'aide dit la mise, les prix et les essais du serveur, et chaque commande du jeu", () => {
    const aide = { mise: MISE_DU_COFFRE, prixDesLettres: PRIX_DES_LETTRES, essais: 30 };
    const { regles, commandes } = lignesDeLAide(aide);
    expect(regles).toContain("Chaque essai : 10 statères dans la cagnotte.");
    expect(regles).toContain("30 essais par jour pour chacun.");
    // Sans réponse du serveur, aucun nombre d'essais n'est écrit.
    expect(lignesDeLAide({ ...aide, essais: null }).regles.some((ligne) => ligne.includes("essais par jour"))).toBe(false);
    expect(commandes.map((c) => c.nom)).toEqual(["/coffre", "/indices", "/indice", "/perceurs", "/help coffre"]);
    expect(commandes[2]?.role).toBe("Une lettre : 50, 100, 200 statères");
    expect(decrireLAide(aide)).toContain("Les statères viennent des points rapportés au clan.");
    // Chaque ligne tient dans l'image à la grande taille : 12 pixels par signe, 592 de large.
    for (const ligne of regles) expect(ligne.length).toBeLessThanOrEqual(49);
    for (const c of commandes) expect(c.role.length).toBeLessThanOrEqual(35);
  });

  it("une durée se dit en mots", () => {
    expect([0, 1, 12, 60, 187, 1440, 2950].map(dureeEnMots)).toEqual(["moins d'une minute", "1 minute", "12 minutes", "1 heure", "3 heures 07", "1 jour", "2 jours 1 heure"]);
    expect(decrireLeBilan({ gardien: "druide", mot: "menhir", manche: 3, gagnant: "Jod", essais: 1, joueurs: 1, acharne: null, lettresAchetees: 0, minutes: 5 })).toBe(
      "Bilan de la manche 3 : le mot « menhir », gardé par le druide, a été trouvé par Jod en 5 minutes. 1 essai, 1 villageois, 0 lettre achetée.",
    );
    expect(decrireLAlerte({ gardien: "barde", tenue: null, seuil: 1000, cagnotte: 1010, garde: 2 })).toBe("La cagnotte du coffre passe 1 000 statères : elle est de 1 010 statères, multipliée par 3 pour qui ouvre le coffre.");
  });
});

describe("l'alerte de cagnotte", () => {
  it("ne dit que le plus haut seuil passé, et seulement en le passant", () => {
    expect(seuilPasse(490, 500)).toBe(500);
    expect(seuilPasse(500, 510)).toBeNull();
    expect(seuilPasse(0, 499)).toBeNull();
    expect(seuilPasse(900, 2100)).toBe(2000);
    expect(seuilPasse(480, 480)).toBeNull();
    expect([...SEUILS_DE_CAGNOTTE]).toEqual([...SEUILS_DE_CAGNOTTE].sort((a, b) => a - b));
  });

  it("une mise qui fait passer un seuil poste une image de plus ; une autre non", async () => {
    const ouverture = { ok: true, essai: 9, manche: manche(), niveau: 6, passes: [], ruses: [], historique: [], restants: 5, soir: null, cagnotte: 490, tenue: null };
    const clos = (cagnotte: number) => ({ ok: true, gagne: false, manche: 7, essai: 13, mise: 10, cagnotte, gain: 0, fois: 1 });
    const passe = monde({ coffre_ouvrir: () => ouverture, coffre_clore: () => clos(500) });
    await coffreCommand(appel("coffre", { data: { name: "coffre", options: [{ name: "message", type: 3, value: "Bonjour gardien" }] } }), passe.deps);
    await passe.fini();
    const envois = passe.calls.webhook.filter((w) => w.method === "POST");
    expect(envois).toHaveLength(1);
    expect(envois[0]?.call?.files?.[0]?.name).toBe(ALERTE_FILE);
    const reste = monde({ coffre_ouvrir: () => ouverture, coffre_clore: () => clos(520) });
    await coffreCommand(appel("coffre", { data: { name: "coffre", options: [{ name: "message", type: 3, value: "Bonjour gardien" }] } }), reste.deps);
    await reste.fini();
    expect(reste.calls.webhook.filter((w) => w.method === "POST")).toHaveLength(0);
  });
});

describe("le bilan d'une manche", () => {
  it("part en image quand le coffre s'ouvre, avant le vide entre deux manches", async () => {
    const m = monde({
      coffre_ouvrir: () => ({ ok: true, essai: 9, manche: manche(), niveau: 6, passes: [], ruses: [], historique: [], restants: 5, soir: null, cagnotte: 300, tenue: null }),
      coffre_clore: () => ({ ok: true, gagne: true, manche: 7, essai: 13, mise: 10, cagnotte: 0, gain: 930, fois: 3, garde: 2 }),
      coffre_bilan: () => ({ ok: true, essais: 13, joueurs: 4, acharne: { nom: " [GAL] Un ", essais: 6 }, lettres_achetees: 1, minutes: 42 }),
    });
    await coffreCommand(appel("coffre", { data: { name: "coffre", options: [{ name: "message", type: 3, value: "C'est un chaudron" }] } }), m.deps);
    await m.fini();
    expect(m.calls.rpc.find((c) => c.name === "coffre_bilan")?.args).toEqual({ p_manche: 7 });
    const envois = m.calls.webhook.filter((w) => w.method === "POST");
    expect(envois).toHaveLength(2);
    expect(envois[0]?.call?.files?.[0]?.name).toBe(BILAN_FILE);
    expect((envois[0]?.call?.body as { attachments: { description: string }[] }).attachments[0]?.description).toContain("13 essais, 4 villageois, 1 lettre achetée. Le plus acharné : GAL Un, 6 essais.");
    expect(String((envois[1]?.call?.body as { content: string }).content)).toContain("# Manche 8");
  });

  it("sans réponse du serveur, le jeu continue sans bilan", async () => {
    const m = monde({
      coffre_ouvrir: () => ({ ok: true, essai: 9, manche: manche(), niveau: 6, passes: [], ruses: [], historique: [], restants: 5, soir: null, cagnotte: 300, tenue: null }),
      coffre_clore: () => ({ ok: true, gagne: true, manche: 7, essai: 13, mise: 10, cagnotte: 0, gain: 930, fois: 3, garde: 2 }),
    });
    await coffreCommand(appel("coffre", { data: { name: "coffre", options: [{ name: "message", type: 3, value: "C'est un chaudron" }] } }), m.deps);
    await m.fini();
    expect(m.calls.webhook.filter((w) => w.method === "POST")).toHaveLength(1);
  });
});

describe("/indices, /indice et /help coffre", () => {
  it("lit l'état du tableau sans rien croire", () => {
    expect(parseTableau(tableau())).toMatchObject({ numero: 7, niveau: 6, cagnotte: 480, essaisParMembre: 30, prixLettre: 50, soir: null });
    expect(parseTableau(tableau())?.manche).toMatchObject({ id: 7, mot: "chaudron", lettres: [1, 4, 8], longueurDite: true });
    expect(parseTableau(tableau({ manche: null, prix_lettre: null, essais_par_membre: "30" }))).toMatchObject({ manche: null, prixLettre: null, essaisParMembre: null });
    expect(parseTableau({ ok: false })).toBeNull();
    expect(parseTableau(null)).toBeNull();
    // Une manche garde jusqu'à 12 indices.
    expect(parseTableau(tableau({ manche: manche({ indices: Array.from({ length: 20 }, (_, i) => `indice ${i}`) }) }))?.manche?.indices).toHaveLength(INDICES_GARDES);
  });

  it("/indices montre tout le tableau au seul membre, sans rien écrire", async () => {
    const m = monde({ coffre_tableau: () => tableau() });
    const { charge, fichier } = await enImage(await indicesCommand(appel("indices"), m.deps));
    expect(charge.type).toBe(4);
    expect(charge.data.flags).toBe(64);
    expect(charge.data.attachments[0]).toMatchObject({ filename: TABLEAU_FILE });
    expect(charge.data.attachments[0]?.description).toContain("Indices : 8 lettres, un objet, en métal.");
    expect(charge.data.attachments[0]?.description).not.toMatch(/chaudron/i);
    expect(await lirePng(new Uint8Array(await fichier.arrayBuffer()))).toMatchObject({ largeur: IMAGE_DU_COFFRE.largeur });
    expect(m.calls.rpc.map((c) => c.name)).toEqual(["coffre_tableau"]);
    const vide = monde({ coffre_tableau: () => tableau({ manche: null }) });
    expect(await corps(await indicesCommand(appel("indices"), vide.deps))).toMatchObject({ type: 4, data: { content: COFFRE_MESSAGES.noRound, flags: 64 } });
    expect(await corps(await indicesCommand(appel("indices"), monde().deps))).toMatchObject({ type: 4, data: { content: COFFRE_MESSAGES.down, flags: 64 } });
  });

  it("/indice montre au salon la lettre achetée, et dit chaque refus au seul membre", async () => {
    const m = monde({ coffre_indice: () => ({ ...tableau({ manche: manche({ lettres: [1, 4, 6] }), cagnotte: 530, prix_lettre: 100 }), place: 6, prix: 50, tenue: null }) });
    const { charge } = await enImage(await indiceCommand(appel("indice"), m.deps));
    await m.fini();
    expect(charge.data.flags).toBeUndefined();
    expect(charge.data.attachments[0]?.description).toContain("Jod achète la lettre 6 du mot pour 50 statères, versés dans la cagnotte.");
    expect(m.calls.rpc[0]).toEqual({ name: "coffre_indice", args: { p_discord_id: JOUEUR, p_nom: "Jod" } });
    // 480 avant, 530 après : la cagnotte passe 500, le salon l'apprend.
    expect(m.calls.webhook.filter((w) => w.method === "POST").map((w) => w.call?.files?.[0]?.name)).toEqual([ALERTE_FILE]);
    for (const [error, phrase] of [["sold_out", COFFRE_MESSAGES.soldOut], ["too_few", COFFRE_MESSAGES.tooFew], ["no_round", COFFRE_MESSAGES.noRound], ["no_stake", COFFRE_MESSAGES.letterNoStake], ["closed", COFFRE_MESSAGES.asleep], ["ended", COFFRE_MESSAGES.ended]] as const) {
      expect(await corps(await indiceCommand(appel("indice"), monde({ coffre_indice: () => ({ ok: false, error }) }).deps))).toMatchObject({ type: 4, data: { content: phrase, flags: 64 } });
    }
    expect(refusDeLaLettre("stake_short", 200)).toContain("cette lettre coûte 200 statères");
    expect(refusDeLaLettre("stake_short", null)).toBe(COFFRE_MESSAGES.letterShort);
    expect(refusDeLaLettre("budget", null)).toBe(COFFRE_MESSAGES.budget);
  });

  it("/help coffre montre l'aide au salon, avec les essais par jour que dit le serveur", async () => {
    const m = monde({ coffre_tableau: () => tableau() });
    const { charge } = await enImage(await aideCommand(appel("help", { data: { name: "help", options: [{ type: 1, name: "coffre" }] } }), m.deps));
    expect(charge.data.flags).toBeUndefined();
    expect(charge.data.attachments[0]).toMatchObject({ filename: AIDE_FILE });
    expect(charge.data.attachments[0]?.description).toContain("30 essais par jour pour chacun.");
    // Le serveur muet : l'aide part quand même, sans nombre d'essais.
    const muet = await enImage(await aideCommand(appel("help"), monde().deps));
    expect(muet.charge.data.attachments[0]?.description).not.toContain("essais par jour");
  });

  it("toutes les commandes du coffre ne jouent que dans son salon, et rien n'est alors demandé au serveur", async () => {
    const m = monde({ coffre_tableau: () => tableau(), coffre_indice: () => tableau(), coffre_palmares: () => ({ ok: true, perceurs: [] }) });
    const ailleurs = { channel_id: "555555555555555555" };
    for (const reponse of [await indicesCommand(appel("indices", ailleurs), m.deps), await indiceCommand(appel("indice", ailleurs), m.deps), await aideCommand(appel("help", ailleurs), m.deps), await perceursCommand(appel("perceurs", ailleurs), m.deps)]) {
      expect(await corps(reponse)).toMatchObject({ type: 4, data: { content: COFFRE_MESSAGES.wrongChannel, flags: 64 } });
    }
    expect(await corps(await indicesCommand(appel("indices", { guild_id: "999999999999999999" }), m.deps))).toMatchObject({ type: 4, data: { content: COFFRE_MESSAGES.wrongPlace } });
    expect(m.calls.rpc).toEqual([]);
  });

  it("les commandes sont décrites dans les limites de Discord", () => {
    for (const command of [INDICES_COMMAND, INDICE_COMMAND, AIDE_COMMAND]) {
      expect(COMMANDS).toContain(command);
      expect(command.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(command.description.length).toBeLessThanOrEqual(100);
    }
    expect(AIDE_COMMAND.options).toEqual([{ type: 1, name: "coffre", description: expect.any(String) }]);
    expect(AIDE_COMMAND.options[0].description.length).toBeLessThanOrEqual(100);
    expect(INDICE_COMMAND.description).toContain(PRIX_DES_LETTRES.join(", ").replace(", 200", " puis 200"));
  });
});

describe("la migration de la lettre, du tableau et du bilan", () => {
  const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split(String.fromCharCode(13) + LF).join(LF);
  const sql = lire("20261117000700_coffre_lettre_tableau_bilan");

  it("vend au plus trois lettres, aux prix que dit l'aide, sans jamais vendre le mot entier", () => {
    expect(sql).toContain(`(array[${PRIX_DES_LETTRES.join(", ")}])[1 + (select count(*) from internal.coffre_lettres_achetees a where a.manche_id = m.id)::integer]`);
    expect(sql).toContain("when char_length(m.mot) - cardinality(m.lettres) < 3 then null");
    expect(sql).toContain(">= 3 then");
    // Le prix sort de la bourse de l'acheteur et entre entier dans la cagnotte : rien n'est créé.
    expect(sql).toContain("perform internal.village_debiter(v_compte, 'coffre_indice', v_prix, 'manche/' || m.id::text);");
    expect(sql).toContain("update internal.coffre_reglages set cagnotte = cagnotte + v_prix where id;");
    expect(sql).not.toContain("insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (v_compte, 'coffre_indice'");
    // Un compte en mode GOD n'achète pas : c'est coffre_payeur qui le dit.
    expect(sql).toContain("v_compte := internal.coffre_payeur(p_discord_id);");
  });

  it("ne change, dans la clôture d'un essai, que le nombre d'indices gardés et la base de la prime", () => {
    const corpsDe = (texte: string) => texte.slice(texte.indexOf("create or replace function public.coffre_clore("), texte.indexOf("end $$;", texte.indexOf("create or replace function public.coffre_clore(")));
    const avant = corpsDe(lire("20261117000100_coffre_mise_dix_et_garde")).split(LF);
    const apres = corpsDe(sql);
    expect(apres).toContain(`and cardinality(indices) < ${INDICES_GARDES} and not`);
    // La prime ne multiplie que les mises : le prix des lettres achetées de la manche sort de sa base, jamais de la cagnotte gagnée.
    expect(apres).toContain("select least(v_cagnotte, coalesce(sum(a.prix), 0))::integer into v_lettres from internal.coffre_lettres_achetees a where a.manche_id = p_manche;");
    expect(apres).toContain("values (v_compte, 'coffre_prime', least((v_cagnotte - v_lettres)::bigint * (v_fois - 1), 1000000)::integer, 'manche/' || p_manche::text);");
    expect(apres).toContain("if v_fois > 1 and v_cagnotte - v_lettres > 0 then");
    expect(apres).toContain("values (v_compte, 'coffre_gain', v_cagnotte, 'manche/' || p_manche::text);");
    expect(apres).not.toContain("least(v_cagnotte::bigint * (v_fois - 1)");
    // Hors de ces lignes, la fonction est celle d'avant : toute ligne d'avant qui ne parle ni des indices ni de la prime y est encore.
    const gardees = avant.filter((ligne) => !ligne.includes("cardinality(indices) < 6") && !ligne.includes("(v_fois - 1)") && !ligne.includes("if v_fois > 1 then"));
    expect(gardees.length).toBeGreaterThan(avant.length - 6);
    for (const ligne of gardees) expect(apres).toContain(ligne);
  });

  it("ne vend plus de lettre quand le plafond de dépense est atteint", () => {
    const indice = sql.slice(sql.indexOf("create or replace function public.coffre_indice"), sql.indexOf("create or replace function public.coffre_bilan"));
    expect(indice).toContain("if r.depense_microdollars >= r.plafond_microdollars then");
    expect(indice.indexOf("internal.village_verrou(v_compte)")).toBeLessThan(indice.indexOf("internal.crediter_stateres(v_compte)"));
  });

  it("n'ouvre ses fonctions qu'au robot, et n'efface rien", () => {
    for (const f of ["public.coffre_tableau()", "public.coffre_indice(text, text)", "public.coffre_bilan(bigint)"]) {
      expect(sql).toContain(`revoke all on function ${f} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function ${f} to service_role;`);
    }
    expect(sql).toContain("revoke all on table internal.coffre_lettres_achetees from public, anon, authenticated;");
    expect(sql).not.toMatch(/^(delete|truncate|drop)\b/im);
  });
});
