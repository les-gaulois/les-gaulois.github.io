import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TENUE_DE_DEPART, type Tenue } from "../../src/lib/gaulois";
import { hashPublicId } from "../../src/lib/compte/roster";
import {
  AUCUN_GAULOIS,
  cacheDesGaulois,
  empreinte,
  GAULOIS_FICHES_FILE,
  GAULOIS_LOT,
  GAULOIS_TIMEOUT_MS,
  gauloisDuCache,
  gauloisPourLeRobot,
  journalDesGaulois,
  lireGauloisDesJoueurs,
  type GauloisCall,
} from "../../src/lib/gaulois-joueurs";

// Des valeurs d'essai, qui ne désignent personne.
const URL_ESSAI = "https://projet-essai.supabase.co";
// Courte, comme dans les autres tests : une fausse clé à la forme d'une vraie ferait réagir les contrôles de secrets.
const CLE = "sb_secret_essai";
const A = "EssaiAaa1";
const B = "EssaiBbb2";
const C = "EssaiCcc3";
const BLOND: Tenue = { ...TENUE_DE_DEPART, teinte_cheveux: "blond", cheveux: "longs" };

/** Un serveur qui rend la tenue des empreintes connues, et note ce qu'on lui envoie. */
function serveur(tenues: Record<string, unknown>) {
  const envois: string[][] = [];
  const call: GauloisCall = async (url, key, empreintes) => {
    expect(url).toBe(URL_ESSAI);
    expect(key).toBe(CLE);
    envois.push([...empreintes]);
    const gaulois: Record<string, unknown> = {};
    for (const [id, tenue] of Object.entries(tenues)) if (empreintes.includes(empreinte(id))) gaulois[empreinte(id)] = tenue;
    return { ok: true, gaulois };
  };
  return { call, envois };
}
const repond =
  (data: unknown): GauloisCall =>
  async () =>
    data;
const echoue =
  (erreur: unknown): GauloisCall =>
  async () => {
    throw erreur;
  };
const avecCode = (message: string, code: string) => Object.assign(new Error(message), { code });

/** Aucun secret ni identifiant dans un texte écrit au journal. */
function propre(texte: string | null, ids: readonly string[] = [A, B, C]) {
  const t = texte ?? "";
  expect(t).not.toContain(CLE);
  expect(t).not.toContain("sb_secret");
  expect(t).not.toContain("projet-essai");
  for (const id of ids) {
    expect(t).not.toContain(id);
    expect(t).not.toContain(empreinte(id));
  }
  expect(t).not.toMatch(/[0-9a-f]{64}/);
}

describe("empreinte", () => {
  it("est le SHA-256 en hexadécimal minuscule, comme internal.hash_public_id et la relecture de la liste", () => {
    // Vecteur connu du SHA-256 (FIPS 180-2).
    expect(empreinte("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const id of [A, "8CqaErVw", "é€😀", " espace "]) {
      expect(empreinte(id)).toMatch(/^[0-9a-f]{64}$/);
      expect(empreinte(id)).toBe(hashPublicId(id));
    }
    expect(empreinte(" espace ")).not.toBe(empreinte("espace"));
  });
});

describe("lireGauloisDesJoueurs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sans URL ou sans clé, ne demande rien et le dit sans secret", async () => {
    const call = vi.fn<GauloisCall>();
    for (const [url, key] of [
      [undefined, CLE],
      [URL_ESSAI, undefined],
      ["", ""],
    ] as const) {
      const lecture = await lireGauloisDesJoueurs([A], url, key, call);
      expect(lecture.gaulois).toBe(AUCUN_GAULOIS);
      expect(lecture.etat).toBe("sans-reglage");
      expect(lecture.warning).toMatch(/SUPABASE_URL/);
      expect(journalDesGaulois(lecture)).toMatch(/^::notice::/);
      propre(lecture.warning);
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("sans joueur, ne demande rien", async () => {
    const call = vi.fn<GauloisCall>();
    expect(await lireGauloisDesJoueurs([null, undefined, ""], URL_ESSAI, CLE, call)).toEqual({ gaulois: AUCUN_GAULOIS, warning: null, etat: "lu" });
    expect(call).not.toHaveBeenCalled();
  });

  it("n'envoie que les empreintes, sans doublon ni vide, et remet chaque tenue sous son identifiant", async () => {
    const { call, envois } = serveur({ [A]: TENUE_DE_DEPART, [B]: BLOND, EssaiPasDemande: TENUE_DE_DEPART });
    const lecture = await lireGauloisDesJoueurs([A, B, A, "", null, C, undefined, B], URL_ESSAI, CLE, call);
    expect(envois).toEqual([[empreinte(A), empreinte(B), empreinte(C)]]);
    expect(JSON.stringify(envois)).not.toContain("Essai");
    expect([...lecture.gaulois.entries()]).toEqual([
      [A, TENUE_DE_DEPART],
      [B, BLOND],
    ]);
    expect(lecture.gaulois.has(C)).toBe(false);
    expect(lecture.warning).toBeNull();
    expect(journalDesGaulois(lecture)).toBeNull();
  });

  it("ignore une clé de la réponse qui n'a pas été demandée", async () => {
    const lecture = await lireGauloisDesJoueurs([A], URL_ESSAI, CLE, repond({ ok: true, gaulois: { [empreinte(B)]: BLOND, [B]: BLOND } }));
    expect(lecture.gaulois).toBe(AUCUN_GAULOIS);
    expect(lecture.etat).toBe("lu");
  });

  it("ignore, sans erreur, une tenue que le dessin ne sait pas lire, et le compte", async () => {
    const tenues = {
      [A]: TENUE_DE_DEPART,
      [B]: { ...TENUE_DE_DEPART, tete: "objet-de-demain" },
      [C]: { ...TENUE_DE_DEPART, cle_inconnue: "x" },
      EssaiNul: null,
      EssaiTexte: "tunique",
      EssaiListe: [TENUE_DE_DEPART],
      EssaiIncomplet: { peau: "claire" },
    };
    const lecture = await lireGauloisDesJoueurs(Object.keys(tenues), URL_ESSAI, CLE, serveur(tenues).call);
    expect([...lecture.gaulois.keys()]).toEqual([A]);
    expect(lecture.etat).toBe("lu");
    expect(lecture.warning).toBe("6 tenues que le dessin ne sait pas lire, ignorées");
    expect(journalDesGaulois(lecture)).toBe("::notice::Gaulois des images : 6 tenues que le dessin ne sait pas lire, ignorées.");
    propre(lecture.warning, Object.keys(tenues));
  });

  it("une seule tenue illisible : au singulier", async () => {
    const lecture = await lireGauloisDesJoueurs([A], URL_ESSAI, CLE, serveur({ [A]: { tete: "x" } }).call);
    expect(lecture.gaulois).toBe(AUCUN_GAULOIS);
    expect(lecture.warning).toBe("1 tenue que le dessin ne sait pas lire, ignorée");
  });

  it("migration pas encore collée : aucune image n'a de Gaulois, et ce n'est qu'une note", async () => {
    for (const erreur of [
      avecCode("Could not find the function public.gaulois_des_joueurs(p_empreintes) in the schema cache", "PGRST202"),
      avecCode("function public.gaulois_des_joueurs(text[]) does not exist", "42883"),
      new Error("Could not find the function public.gaulois_des_joueurs(p_empreintes) in the schema cache"),
    ]) {
      const lecture = await lireGauloisDesJoueurs([A], URL_ESSAI, CLE, echoue(erreur));
      expect(lecture.gaulois).toBe(AUCUN_GAULOIS);
      expect(lecture.etat).toBe("fonction-absente");
      expect(lecture.warning).toMatch(/20261114000400/);
      expect(journalDesGaulois(lecture)).toMatch(/^::notice::Gaulois des images : /);
      propre(lecture.warning);
    }
  });

  it("une panne est un avertissement, sans clé, lien, identifiant ni empreinte, même si l'erreur les contient", async () => {
    const erreur = avecCode(`refus pour ${CLE} sur ${URL_ESSAI}/rest/v1/rpc avec ${A} et ${empreinte(B)} (Bearer eyJhbGciOiJIUzI1NiJ9.abc.def)`, "42501");
    const lecture = await lireGauloisDesJoueurs([A, B], URL_ESSAI, CLE, echoue(erreur));
    expect(lecture.gaulois).toBe(AUCUN_GAULOIS);
    expect(lecture.etat).toBe("panne");
    expect(lecture.warning).toMatch(/^lecture impossible \(refus pour … sur … avec … et … \(Bearer …\)\), images sans Gaulois$/);
    expect(journalDesGaulois(lecture)).toMatch(/^::warning::/);
    propre(lecture.warning);
    propre(journalDesGaulois(lecture));
  });

  it("une erreur qui n'est pas une Error ne fait rien planter", async () => {
    const lecture = await lireGauloisDesJoueurs([A], URL_ESSAI, CLE, echoue({ code: "x" }));
    expect(lecture.etat).toBe("panne");
    expect(lecture.gaulois).toBe(AUCUN_GAULOIS);
  });

  it("un serveur muet : images sans Gaulois au bout du délai, et le minuteur est arrêté", async () => {
    vi.useFakeTimers();
    const pending = lireGauloisDesJoueurs([A], URL_ESSAI, CLE, () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(GAULOIS_TIMEOUT_MS);
    const lecture = await pending;
    expect(lecture).toEqual({ gaulois: AUCUN_GAULOIS, warning: "lecture impossible (pas de réponse en 10 s), images sans Gaulois", etat: "panne" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("le délai est court : dix secondes au plus", () => {
    expect(GAULOIS_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("une réponse mal formée : images sans Gaulois", async () => {
    for (const data of [null, undefined, "ok", 3, [], { ok: true }, { ok: true, gaulois: [] }, { ok: true, gaulois: "x" }, { ok: "true", gaulois: {} }]) {
      const lecture = await lireGauloisDesJoueurs([A], URL_ESSAI, CLE, repond(data));
      expect(lecture.gaulois).toBe(AUCUN_GAULOIS);
      expect(lecture.etat).toBe("panne");
      propre(lecture.warning);
    }
  });

  it("un refus du serveur donne son code, et seulement un code", async () => {
    const refus = await lireGauloisDesJoueurs([A], URL_ESSAI, CLE, repond({ ok: false, error: "invalid_request" }));
    expect(refus).toEqual({ gaulois: AUCUN_GAULOIS, warning: "le serveur a refusé la lecture (invalid_request), images sans Gaulois", etat: "panne" });
    const bizarre = await lireGauloisDesJoueurs([A], URL_ESSAI, CLE, repond({ ok: false, error: `${CLE} <script>` }));
    expect(bizarre.warning).toBe("le serveur a refusé la lecture (refus), images sans Gaulois");
  });

  it("une longue liste part par lots, à la limite du serveur", async () => {
    const ids = Array.from({ length: GAULOIS_LOT * 2 + 7 }, (_, i) => `EssaiLot${i}`);
    const { call, envois } = serveur({ [ids[0]!]: TENUE_DE_DEPART, [ids.at(-1)!]: BLOND });
    const lecture = await lireGauloisDesJoueurs(ids, URL_ESSAI, CLE, call);
    expect(envois.map((lot) => lot.length)).toEqual([GAULOIS_LOT, GAULOIS_LOT, 7]);
    expect(new Set(envois.flat()).size).toBe(ids.length);
    expect([...lecture.gaulois.keys()]).toEqual([ids[0], ids.at(-1)]);
  });

  it("un lot en panne : tout ou rien, aucune image à moitié habillée", async () => {
    const ids = Array.from({ length: GAULOIS_LOT + 1 }, (_, i) => `EssaiLot${i}`);
    let appels = 0;
    const lecture = await lireGauloisDesJoueurs(ids, URL_ESSAI, CLE, async (_url, _key, empreintes) => {
      appels++;
      if (appels === 2) throw new Error("coupure");
      return { ok: true, gaulois: { [empreintes[0]!]: TENUE_DE_DEPART } };
    });
    expect(lecture).toEqual({ gaulois: AUCUN_GAULOIS, warning: "lecture impossible (coupure), images sans Gaulois", etat: "panne" });
  });

  it("la limite des lots est celle de la migration, qui n'accepte que des empreintes", () => {
    const sql = readFileSync("supabase/migrations/20261114000400_gaulois_sur_les_images.sql", "utf8");
    expect(sql).toContain(`cardinality(p_empreintes) > ${GAULOIS_LOT}`);
    expect(sql).toContain("'^[0-9a-f]{64}$'");
    expect(sql).toContain("grant execute on function public.gaulois_des_joueurs(text[]) to service_role;");
    expect(sql).toContain("revoke all on function public.gaulois_des_joueurs(text[]) from public, anon, authenticated;");
  });
});

describe("gauloisPourLeRobot", () => {
  it("lit l'environnement de l'Action et note ce qu'il y a à dire", async () => {
    const lignes: string[] = [];
    const gaulois = await gauloisPourLeRobot([A], { SUPABASE_URL: URL_ESSAI, SUPABASE_SECRET_KEY: CLE }, (l) => lignes.push(l), serveur({ [A]: TENUE_DE_DEPART }).call);
    expect([...gaulois.keys()]).toEqual([A]);
    expect(lignes).toEqual([]);
    const sans = await gauloisPourLeRobot([A], {}, (l) => lignes.push(l), echoue(new Error("jamais appelé")));
    expect(sans).toBe(AUCUN_GAULOIS);
    expect(lignes).toEqual(["::notice::Gaulois des images : pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY, images sans Gaulois."]);
  });
  it("ne lève jamais d'erreur", async () => {
    const lignes: string[] = [];
    await expect(gauloisPourLeRobot([A], { SUPABASE_URL: URL_ESSAI, SUPABASE_SECRET_KEY: CLE }, (l) => lignes.push(l), echoue(new Error(`clé ${CLE}`)))).resolves.toBe(AUCUN_GAULOIS);
    expect(lignes).toHaveLength(1);
    propre(lignes[0]!);
  });
});

describe("le fichier des fiches", () => {
  const dossiers: string[] = [];
  const dossier = () => {
    const d = mkdtempSync(join(tmpdir(), "gaulois-fiches-"));
    dossiers.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("est dans .cache, que Git ignore", () => {
    expect(GAULOIS_FICHES_FILE.startsWith(".cache/")).toBe(true);
    expect(readFileSync(".gitignore", "utf8").split(/\r?\n/)).toContain(".cache/");
  });

  it("range les tenues par empreinte, jamais par identifiant, avec l'heure de la lecture", () => {
    const cache = cacheDesGaulois(
      new Map([
        [A, TENUE_DE_DEPART],
        [B, BLOND],
      ]),
      new Date("2026-11-14T10:00:00Z"),
    );
    expect(cache).toEqual({ version: 1, luLe: "2026-11-14T10:00:00.000Z", gaulois: { [empreinte(A)]: TENUE_DE_DEPART, [empreinte(B)]: BLOND } });
    expect(JSON.stringify(cache)).not.toContain("Essai");
  });

  it("se relit pour les identifiants demandés seulement", () => {
    const chemin = join(dossier(), "gaulois-fiches.json");
    writeFileSync(chemin, JSON.stringify(cacheDesGaulois(new Map([[A, TENUE_DE_DEPART], [B, BLOND]]), new Date())));
    expect([...gauloisDuCache(chemin, [A, C, A, null, ""]).entries()]).toEqual([[A, TENUE_DE_DEPART]]);
    expect([...gauloisDuCache(chemin, [B, A]).keys()]).toEqual([B, A]);
    expect(gauloisDuCache(chemin, [C])).toBe(AUCUN_GAULOIS);
  });

  it("absent : aucun Gaulois, sans erreur", () => {
    expect(gauloisDuCache(join(dossier(), "absent.json"), [A])).toBe(AUCUN_GAULOIS);
  });

  it("abîmé ou d'une autre forme : aucun Gaulois, sans erreur", () => {
    const d = dossier();
    const bon = cacheDesGaulois(new Map([[A, TENUE_DE_DEPART]]), new Date());
    const contenus = ["", "{", "null", "[]", '"texte"', JSON.stringify({ ...bon, version: 2 }), JSON.stringify({ ...bon, luLe: "hier" }), JSON.stringify({ ...bon, luLe: undefined }), JSON.stringify({ ...bon, gaulois: [] }), JSON.stringify({ ...bon, gaulois: null })];
    contenus.forEach((contenu, i) => {
      const chemin = join(d, `abime-${i}.json`);
      writeFileSync(chemin, contenu);
      expect(gauloisDuCache(chemin, [A])).toBe(AUCUN_GAULOIS);
    });
  });

  it("une tenue illisible du fichier est ignorée, les autres restent", () => {
    const chemin = join(dossier(), "gaulois-fiches.json");
    writeFileSync(chemin, JSON.stringify({ version: 1, luLe: "2026-11-14T10:00:00.000Z", gaulois: { [empreinte(A)]: { ...TENUE_DE_DEPART, tete: "objet-de-demain" }, [empreinte(B)]: BLOND } }));
    expect([...gauloisDuCache(chemin, [A, B]).keys()]).toEqual([B]);
  });
});

describe("la GitHub Action", () => {
  const job = (texte: string, nom: string) => {
    const debut = texte.indexOf(`\n  ${nom}:`);
    const suite = texte.slice(debut + 1).search(/\n {2}[a-z][\w-]*:\r?\n/);
    return suite < 0 ? texte.slice(debut) : texte.slice(debut, debut + 1 + suite);
  };
  const etape = (texte: string, nom: string) => {
    const debut = texte.indexOf(`- name: ${nom}`);
    expect(debut).toBeGreaterThan(-1);
    const fin = texte.slice(debut + 1).search(/\n\s+- (?:name|id|uses|run):/);
    return { debut, texte: fin < 0 ? texte.slice(debut) : texte.slice(debut, debut + 1 + fin) };
  };

  it("lit les Gaulois des fiches juste avant la construction, qui n'a pas la clé de service", () => {
    const build = job(readFileSync(".github/workflows/site.yml", "utf8"), "build");
    const lire = etape(build, "Lire les Gaulois des fiches");
    const construire = etape(build, "Construire le site");
    expect(lire.debut).toBeLessThan(construire.debut);
    expect(lire.texte).toContain("run: npm run gaulois:fiches");
    expect(lire.texte).toContain("continue-on-error: true");
    expect(lire.texte).toContain("SUPABASE_URL: ${{ vars.SUPABASE_URL }}");
    expect(lire.texte).toContain("SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}");
    expect(construire.texte).not.toContain("SUPABASE_SECRET_KEY");
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["gaulois:fiches"]).toBe("tsx scripts/lire-gaulois-fiches.ts");
  });

  it("chaque envoi d'image sur Discord a de quoi lire les Gaulois", () => {
    for (const fichier of [".github/workflows/site.yml", ".github/workflows/victoires.yml"]) {
      const texte = readFileSync(fichier, "utf8");
      const noms = [...texte.matchAll(/- name: (Envoyer [^\r\n]+)/g)].map((m) => m[1]!);
      expect(noms.length).toBeGreaterThan(0);
      for (const nom of noms) {
        const { texte: bloc } = etape(texte, nom);
        expect(bloc, nom).toContain("SUPABASE_URL: ${{ vars.SUPABASE_URL }}");
        expect(bloc, nom).toContain("SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}");
      }
    }
  });
});
