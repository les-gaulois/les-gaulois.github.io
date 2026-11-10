import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { IDEA_MAX, IDEA_MIN, IDEA_NOTE_MAX, IDEA_OPEN_MAX, IDEA_STATUS_LABELS, decidedIdeas, ideaProblem, initialOf, keepOrder, openIdeas, othersLabel, memberFacesOf, parseQg, pollsAwaitingVote, qgWaiting, safeAvatar, supportLabel, type QgIdea } from "../../src/lib/compte/qg";

const SQL = readFileSync("supabase/migrations/20261109000100_qg_des_membres.sql", "utf8");

const AVATAR = "https://cdn.discordapp.com/avatars/123456789012345678/a_0f1e2d3c4b5a69788796a5b4c3d2e1f0.png";
const poll = { id: 1, question: "Quel soir ?", options: ["Vendredi", "Samedi"], counts: [3, 1], created_at: "2026-11-08T10:00:00Z", closes_at: null, ended_at: null, is_open: true, mine: 1 };
const event = { id: 4, title: "Soirée clan", description: null, url: "https://exemple.fr/soiree", starts_at: "2026-11-13T20:00:00Z", going: 3, mine: true, series: { left: 4, until: "2026-12-04T20:00:00Z" }, faces: [{ name: "Recrue", role: "member", avatar: AVATAR }] };
const idea = { id: 7, body: "Un tournoi interne le samedi soir.", status: "open", staff_note: null, created_at: "2026-11-08T10:00:00Z", decided_at: null, author: "Recrue", mine: false, supports: 2, supported: true };
const answer = { ok: true, me: { visible: true, avatar: AVATAR }, members: 12, welcome: { body: "Bienvenue.", updated_at: "2026-11-08T09:00:00Z" }, polls: [poll], events: [event], ideas: [idea], wall: [{ name: "Chef", role: "founder", avatar: null }] };

describe("la réponse du QG", () => {
  it("se lit telle que le serveur la donne", () => {
    expect(parseQg(answer)).toEqual({
      me: { visible: true, avatar: AVATAR },
      members: 12,
      welcome: { body: "Bienvenue.", updated_at: "2026-11-08T09:00:00Z" },
      polls: [poll],
      events: [event],
      ideas: [idea],
      wall: [{ name: "Chef", role: "founder", avatar: null }],
    });
  });

  it("n'ouvre pas un QG vide quand la réponse n'a pas la forme attendue", () => {
    expect(parseQg(null)).toBeNull();
    expect(parseQg({ ok: false, error: "not_validated" })).toBeNull();
    expect(parseQg({ ...answer, polls: undefined })).toBeNull();
    expect(parseQg({ ...answer, members: "12" })).toBeNull();
    expect(parseQg({ ...answer, me: null })).toBeNull();
  });

  it("ne montre pas un sondage aux totaux illisibles : un total absent n'est pas zéro", () => {
    const data = parseQg({ ...answer, polls: [poll, { id: 2, question: "Sans choix" }, null, { ...poll, id: 3, options: [1, 2] }, { ...poll, id: 4, counts: [3] }, { ...poll, id: 5, counts: [3, null] }] });
    expect(data?.polls).toEqual([poll]);
  });

  it("ne retient un choix que s'il existe dans le sondage", () => {
    expect(parseQg({ ...answer, polls: [{ ...poll, mine: 2 }] })?.polls[0]?.mine).toBeNull();
    expect(parseQg({ ...answer, polls: [{ ...poll, mine: null }] })?.polls[0]?.mine).toBeNull();
    expect(parseQg({ ...answer, polls: [{ ...poll, mine: 0 }] })?.polls[0]?.mine).toBe(0);
  });

  it("écarte un lien ou une photo qui ne viennent pas d'où ils doivent", () => {
    const data = parseQg({
      ...answer,
      me: { visible: false, avatar: "https://exemple.fr/moi.png" },
      events: [{ ...event, url: "javascript:alert(1)", faces: [{ name: "Recrue", role: "member", avatar: "https://cdn.discordapp.com.exemple.fr/avatars/123456789012345678/abc.png" }, { name: "", role: "member" }, { name: "Intrus", role: "roi" }] }],
    });
    expect(data?.me).toEqual({ visible: false, avatar: null });
    expect(data?.events[0]?.url).toBeNull();
    expect(data?.events[0]?.faces).toEqual([{ name: "Recrue", role: "member", avatar: null }]);
  });

  it("ne montre ni une idée au statut inconnu, ni un mot d'accueil vide", () => {
    const data = parseQg({ ...answer, welcome: { body: "  ", updated_at: null }, ideas: [idea, { ...idea, id: 8, status: "toString" }, { ...idea, id: 9, supports: -1 }, { ...idea, id: 10, supports: undefined }] });
    expect(data?.welcome).toBeNull();
    expect(data?.ideas.map((i) => i.id)).toEqual([7]);
    expect(parseQg({ ...answer, welcome: null })?.welcome).toBeNull();
  });
});

describe("le nombre de l'onglet Décisions", () => {
  it("compte les sondages ouverts sans la voix du membre, et rien d'autre", () => {
    expect(pollsAwaitingVote([])).toBe(0);
    expect(
      pollsAwaitingVote([
        { is_open: true, mine: null },
        { is_open: true, mine: 0 },
        { is_open: false, mine: null },
        { is_open: true, mine: null },
      ]),
    ).toBe(2);
  });
});

describe("la photo de profil", () => {
  it("n'accepte qu'une photo choisie par le membre, sur le serveur d'images de Discord, comme le fait le serveur du site", () => {
    expect(safeAvatar(AVATAR)).toBe(AVATAR);
    expect(safeAvatar("https://cdn.discordapp.com/avatars/123456789012345678/0f1e2d3c4b5a69788796a5b4c3d2e1f0.gif")).not.toBeNull();
    expect(safeAvatar("http://cdn.discordapp.com/avatars/123456789012345678/abc.png")).toBeNull();
    expect(safeAvatar("https://cdn.discordapp.com/avatars/123456789012345678/abc.png?size=64")).toBeNull();
    expect(safeAvatar('https://cdn.discordapp.com/avatars/123456789012345678/abc.png" onerror="x')).toBeNull();
    expect(safeAvatar("https://cdn.discordapp.com/avatars/../attachments/1/2/fichier.png")).toBeNull();
    expect(safeAvatar("https://cdn.discordapp.com/attachments/123456789012345678/abc.png")).toBeNull();
    expect(safeAvatar("https://cdn.discordapp.com.exemple.fr/avatars/123456789012345678/abc.png")).toBeNull();
    expect(safeAvatar(null)).toBeNull();
    expect(safeAvatar(42)).toBeNull();
    // La même règle, écrite dans la migration : si l'une change, l'autre doit suivre.
    expect(SQL).toContain("'^https://cdn\\.discordapp\\.com/avatars/[0-9]{5,25}/[A-Za-z0-9_]{1,80}\\.(png|gif|webp|jpg)$'");
  });

  it("n'affiche pas le logo de Discord : l'image par défaut d'un compte sans photo laisse la place à l'initiale", () => {
    expect(safeAvatar("https://cdn.discordapp.com/embed/avatars/3.png")).toBeNull();
    expect(SQL).not.toContain("embed/avatars)");
  });

  it("laisse la place à une initiale", () => {
    expect(initialOf("judom FR")).toBe("J");
    expect(initialOf("  élodie")).toBe("É");
    expect(initialOf("")).toBe("?");
  });
});

describe("la boîte à idées", () => {
  const make = (id: number, over: Partial<QgIdea>): QgIdea => ({ ...(idea as QgIdea), id, ...over });

  it("garde les mêmes bornes que le serveur", () => {
    expect(SQL).toContain(`char_length(v_body) not between ${IDEA_MIN} and ${IDEA_MAX}`);
    expect(SQL).toContain(`status = 'open') >= ${IDEA_OPEN_MAX}`);
    expect(SQL).toContain(`char_length(coalesce(v_note, '')) > ${IDEA_NOTE_MAX}`);
    // Chaque statut du serveur a son libellé, et aucun autre.
    expect(SQL).toContain(`check (status in (${Object.keys(IDEA_STATUS_LABELS).map((s) => `'${s}'`).join(", ")}))`);
    // Les messages du serveur citent les mêmes nombres.
    expect(ERROR_MESSAGES["invalid_idea"]).toContain(`${IDEA_MIN} à ${IDEA_MAX}`);
    expect(ERROR_MESSAGES["too_many_ideas"]).toContain(`${IDEA_OPEN_MAX} idées`);
  });

  it("dit ce qui empêche d'envoyer une idée", () => {
    expect(ideaProblem("Un tournoi interne.", 0)).toBeNull();
    expect(ideaProblem("  court  ", 0)).toBe(`Écrivez votre idée en ${IDEA_MIN} à ${IDEA_MAX} caractères.`);
    expect(ideaProblem("x".repeat(IDEA_MAX + 1), 0)).toMatch(/^Écrivez votre idée/);
    expect(ideaProblem("x".repeat(IDEA_MAX), 0)).toBeNull();
    expect(ideaProblem("Un tournoi interne.", IDEA_OPEN_MAX)).toMatch(/^Vous avez déjà 3 idées à l'étude/);
  });

  it("classe les idées à l'étude par soutiens, puis par date", () => {
    const ideas = [make(1, { supports: 1, created_at: "2026-11-01T10:00:00Z" }), make(2, { supports: 5 }), make(3, { supports: 1, created_at: "2026-11-05T10:00:00Z" }), make(4, { status: "kept", supports: 9 })];
    expect(openIdeas(ideas).map((i) => i.id)).toEqual([2, 3, 1]);
  });

  it("garde les idées à la place où le membre les a vues, les nouvelles en tête", () => {
    const sorted = [make(2, { supports: 5 }), make(9, {}), make(1, { supports: 4 }), make(3, { supports: 1 })];
    // L'idée 1 vient de gagner des soutiens : elle reste troisième, là où elle était affichée. L'idée 9 est nouvelle.
    expect(keepOrder([2, 3, 1], sorted).map((i) => i.id)).toEqual([9, 2, 3, 1]);
    // Première lecture : l'ordre des soutiens.
    expect(keepOrder([], sorted).map((i) => i.id)).toEqual([2, 9, 1, 3]);
    // Une idée retirée ou tranchée quitte la liste sans déplacer les autres.
    expect(keepOrder([2, 3, 1], [make(1, {}), make(2, {})]).map((i) => i.id)).toEqual([2, 1]);
  });

  it("classe les idées tranchées par décision la plus récente", () => {
    const ideas = [make(1, { status: "kept", decided_at: "2026-11-02T10:00:00Z" }), make(2, {}), make(3, { status: "declined", decided_at: "2026-11-06T10:00:00Z" }), make(4, { status: "done", decided_at: null })];
    expect(decidedIdeas(ideas).map((i) => i.id)).toEqual([3, 1, 4]);
  });

  it("écrit les soutiens, zéro compris", () => {
    expect(supportLabel(0)).toBe("0 soutien");
    expect(supportLabel(1)).toBe("1 soutien");
    expect(supportLabel(12)).toBe("12 soutiens");
  });
});

describe("ceux qui viennent", () => {
  it("compte ceux qui ne se montrent pas, sans les nommer", () => {
    expect(othersLabel(0, 0)).toBeNull();
    expect(othersLabel(2, 2)).toBeNull();
    expect(othersLabel(1, 0)).toBe("1 membre vient");
    expect(othersLabel(3, 0)).toBe("3 membres viennent");
    expect(othersLabel(3, 2)).toBe("et 1 autre membre");
    expect(othersLabel(5, 2)).toBe("et 3 autres membres");
  });
});

describe("les visages ailleurs sur le site", () => {
  const OTHER = "https://cdn.discordapp.com/avatars/223456789012345678/0f1e2d3c4b5a69788796a5b4c3d2e1f0.webp";

  it("donnent la photo de chaque membre qui se montre, par son pseudo exact d'aujourd'hui", () => {
    const photos = memberFacesOf({
      ok: true,
      faces: [
        { pseudo: "Ancien Gaulois", avatar: AVATAR },
        { pseudo: "Recrue", avatar: OTHER },
      ],
    });
    expect(photos?.get("Ancien Gaulois")).toBe(AVATAR);
    expect(photos?.get("Recrue")).toBe(OTHER);
    expect(photos?.get("ancien gaulois")).toBeUndefined();
  });

  it("laissent l'initiale à un membre sans photo lisible, et à un pseudo porté par deux membres, plutôt que la photo d'un autre", () => {
    const photos = memberFacesOf({
      ok: true,
      faces: [
        { pseudo: "Sans photo", avatar: null },
        { pseudo: "Logo", avatar: "https://cdn.discordapp.com/embed/avatars/0.png" },
        { pseudo: "Double", avatar: AVATAR },
        { pseudo: "DOUBLE", avatar: OTHER },
        { pseudo: "", avatar: AVATAR },
        null,
      ],
    });
    expect([...(photos?.keys() ?? ["?"])]).toEqual([]);
  });

  it("ne devinent rien d'une réponse illisible", () => {
    expect(memberFacesOf(null)).toBeNull();
    expect(memberFacesOf({ ok: false, error: "not_validated" })).toBeNull();
  });
});

describe("ce qui attend les membres au QG", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");

  it("compte les sondages ouverts, les idées à l'étude et les événements à venir", () => {
    const data = {
      polls: [{ ...poll, is_open: true }, { ...poll, id: 2, is_open: false }],
      ideas: [idea, { ...idea, id: 8 }, { ...idea, id: 9, status: "kept" }],
      events: [event, { ...event, id: 5, starts_at: "2026-11-09T20:00:00Z" }],
    } as unknown as Parameters<typeof qgWaiting>[0];
    expect(qgWaiting(data, now)).toBe("1 sondage ouvert, 2 idées à l'étude et 1 événement à venir.");
  });

  it("ne dit que ce qui existe, et rien du tout quand rien n'attend", () => {
    expect(qgWaiting({ polls: [], ideas: [], events: [] }, now)).toBeNull();
    const ideas = [idea, { ...idea, id: 8 }] as unknown as Parameters<typeof qgWaiting>[0]["ideas"];
    expect(qgWaiting({ polls: [], ideas, events: [] }, now)).toBe("2 idées à l'étude.");
  });
});

describe("la porte du QG, côté serveur", () => {
  const functions = [...SQL.matchAll(/create function (public\.[a-z_]+)\(/g)].map((m) => m[1]!);

  it("ferme chaque nouvelle fonction à tout le monde avant d'ouvrir quoi que ce soit", () => {
    expect(functions.sort()).toEqual(["public.decide_idea", "public.delete_idea", "public.get_qg", "public.save_idea", "public.set_member_visibility", "public.support_idea"]);
    for (const name of functions) {
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated;`));
      // Jamais ouverte à un visiteur sans compte.
      expect(SQL, name).not.toMatch(new RegExp(`grant execute on function ${name.replace(".", "\\.")}\\([^)]*\\) to [^;]*anon`));
    }
  });

  it("vérifie le compte dans chaque fonction : validé pour lire et proposer, encadrement pour trancher", () => {
    const body = (name: string) => SQL.slice(SQL.indexOf(`create function ${name}(`), SQL.indexOf("end $$;", SQL.indexOf(`create function ${name}(`)));
    for (const name of functions) expect(body(name), name).toContain("internal.require_rank(");
    expect(body("public.get_qg")).toContain("internal.require_rank(1)");
    expect(body("public.decide_idea")).toContain("internal.require_rank(2)");
    // Retirer l'idée d'un autre demande d'être de l'encadrement.
    expect(body("public.delete_idea")).toContain("v_row.author_id <> v_actor and internal.current_rank() < 2");
  });

  it("ne montre un nom et une photo que d'un membre validé qui a choisi de se montrer", () => {
    const body = SQL.slice(SQL.indexOf("create function public.get_qg("), SQL.indexOf("create or replace function public.get_site_news()"));
    // Le mur, puis ceux qui viennent à un événement : les deux seuls endroits où un visage sort.
    expect(body.split("internal.member_face(").length - 1).toBe(2);
    expect(body).toContain("where p.status = 'validated' and p.show_to_members");
    expect(body).toContain("join public.profiles pr on pr.user_id = a.user_id and pr.status = 'validated' and pr.show_to_members");
    // La photo de l'appelant lui-même, pour lui seul.
    expect(body.split("internal.discord_avatar(").length - 1).toBe(1);
    expect(body).toContain("internal.discord_avatar(p.user_id)) from public.profiles p where p.user_id = v_actor");
    // Personne ne se montre sans l'avoir choisi.
    expect(SQL).toContain("add column show_to_members boolean not null default false");
  });

  it("ne donne plus de sondage à l'accueil public", () => {
    const news = SQL.slice(SQL.indexOf("create or replace function public.get_site_news()"), SQL.indexOf("create or replace function public.export_site()"));
    expect(news).toContain("'polls', '[]'::jsonb");
    expect(news).not.toContain("poll_counts");
  });

  it("ne sauvegarde des soutiens que leur nombre", () => {
    const backup = SQL.slice(SQL.indexOf("create or replace function public.export_site()"));
    expect(backup).toContain("select idea_id, count(*) as supports from internal.idea_supports group by idea_id");
    expect(backup).not.toMatch(/to_jsonb\(t\)[^\n]*from internal\.idea_supports/);
  });
});
