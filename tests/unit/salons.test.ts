import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES } from "../../src/lib/compte/errors";
import { FORMAT_ORDER, GAME_ID_PATTERN, LOBBY_FORMATS, TEAM_SIZE, callKey, callSentence, freshCalls, lobbyIdOf, lobbyUrl, parseLobbyCalls, salonOf, seatsNote, sinceLabel, type LobbyCall } from "../../src/lib/compte/salons";

const SQL = readFileSync("supabase/migrations/20261109000300_appels_aux_salons.sql", "utf8");

const AVATAR = "https://cdn.discordapp.com/avatars/123456789012345678/a_0f1e2d3c4b5a69788796a5b4c3d2e1f0.png";
const row = { id: 3, game: "cA4qqR72uf", format: "trios", created_at: "2026-11-09T20:00:00Z", expires_at: "2026-11-09T20:15:00Z", mine: false, name: "Recrue", avatar: AVATAR };
const call = (over: Partial<LobbyCall> = {}): LobbyCall => ({ id: 3, game: "cA4qqR72uf", format: "trios", createdAt: "2026-11-09T20:00:00Z", expiresAt: "2026-11-09T20:15:00Z", mine: false, name: "Recrue", avatar: null, ...over });

describe("le lien collé par un membre", () => {
  it("donne l'identifiant de la partie, quelle que soit la forme que le jeu a copiée", () => {
    // Le bouton de copie de l'écran du salon, avec le numéro de serveur, puis la fin du lien d'un salon privé, qui ne sert pas à rejoindre.
    expect(lobbyIdOf("https://openfront.io/w3/game/cA4qqR72uf")).toBe("cA4qqR72uf");
    expect(lobbyIdOf("https://openfront.io/game/cA4qqR72uf?lobby&s=ab12c")).toBe("cA4qqR72uf");
    // La barre d'adresse, avec ou sans « https:// », et l'identifiant seul, espaces compris.
    expect(lobbyIdOf("openfront.io/game/dnH1jfKbGh")).toBe("dnH1jfKbGh");
    expect(lobbyIdOf("https://www.openfront.io/game/dnH1jfKbGh/")).toBe("dnH1jfKbGh");
    expect(lobbyIdOf("  c3Am2goVAe  ")).toBe("c3Am2goVAe");
    // Une page d'une version précise du jeu, que openfront.io lit aussi (`/v/<commit>/`).
    expect(lobbyIdOf("https://openfront.io/v/ac60675/w12/game/cA4qqR72uf")).toBe("cA4qqR72uf");
  });

  it("refuse tout ce qui ne mène pas à une partie d'openfront.io", () => {
    for (const text of [
      "",
      "https://exemple.fr/game/cA4qqR72uf",
      "https://openfront.io.exemple.fr/game/cA4qqR72uf",
      "https://exemple.fr/?openfront.io/game/cA4qqR72uf",
      "https://openfront.io/game/court",
      "https://openfront.io/game/cA4qqR72uf9999",
      // Onze caractères : le jeu lui-même refuserait cet identifiant (GAME_ID_REGEX, de 8 à 10).
      "cA4qqR72ufX",
      "https://openfront.io/game/cA4qqR72ufX",
      "https://openfront.io/replay/cA4qqR72uf",
      "https://openfront.io/game/cA4qqR72uf extra",
      "javascript:alert(1)",
      "cA4qq R72uf",
    ]) {
      expect(lobbyIdOf(text), text).toBeNull();
    }
  });

  it("devient une adresse refaite par le site, sur openfront.io seulement", () => {
    expect(lobbyUrl("cA4qqR72uf")).toBe("https://openfront.io/game/cA4qqR72uf");
  });
});

describe("la réponse des appels", () => {
  it("se lit telle que le serveur la donne", () => {
    expect(parseLobbyCalls({ ok: true, now: "2026-11-09T20:03:00Z", calls: [row] })).toEqual({
      now: Date.parse("2026-11-09T20:03:00Z"),
      calls: [{ id: 3, game: "cA4qqR72uf", format: "trios", createdAt: "2026-11-09T20:00:00Z", expiresAt: "2026-11-09T20:15:00Z", mine: false, name: "Recrue", avatar: AVATAR }],
    });
  });

  it("ne montre pas un appel illisible plutôt que de le deviner", () => {
    const answer = parseLobbyCalls({
      ok: true,
      now: "2026-11-09T20:03:00Z",
      calls: [
        row,
        { ...row, id: 4, game: "../../piege" },
        { ...row, id: 5, format: "ffa" },
        { ...row, id: 6, name: "  " },
        { ...row, id: 7, created_at: "hier" },
        { ...row, id: 8, avatar: "https://exemple.fr/photo.png" },
        "illisible",
      ],
    });
    expect(answer?.calls.map((c) => c.id)).toEqual([3, 8]);
    // Une photo hors du serveur d'images de Discord laisse la place à l'initiale.
    expect(answer?.calls[1]?.avatar).toBeNull();
  });

  it("dit qu'une réponse sans heure ni liste est illisible", () => {
    expect(parseLobbyCalls({ ok: true, calls: [row] })).toBeNull();
    expect(parseLobbyCalls({ ok: true, now: "2026-11-09T20:03:00Z" })).toBeNull();
    expect(parseLobbyCalls(null)).toBeNull();
  });
});

describe("les pop-ups", () => {
  it("ne s'ouvrent que pour les appels des autres, une seule fois par salon", () => {
    const mine = call({ id: 1, mine: true });
    const seen = call({ id: 2, game: "dnH1jfKbGh" });
    const fresh = call({ id: 3 });
    expect(freshCalls([mine, seen, fresh], new Set([callKey(seen)]))).toEqual([fresh]);
  });

  it("se rouvrent quand le même membre appelle depuis un autre salon", () => {
    const before = call({ id: 3, game: "cA4qqR72uf" });
    const after = call({ id: 3, game: "dnH1jfKbGh" });
    expect(freshCalls([after], new Set([callKey(before)]))).toEqual([after]);
  });

  it("disent qui attend, et où", () => {
    expect(callSentence(call({ format: "trios" }))).toBe("Recrue attend dans un salon Trios.");
    expect(callSentence(call({ format: "4" }))).toBe("Recrue attend dans un salon à 4 équipes.");
    expect(callSentence(call({ format: "private" }))).toBe("Recrue attend dans un salon privé.");
    expect(salonOf("duos")).toBe("un salon Duos");
  });

  it("comptent les minutes à l'heure du serveur", () => {
    const now = Date.parse("2026-11-09T20:03:30Z");
    expect(sinceLabel("2026-11-09T20:03:00Z", now)).toBe("à l'instant");
    expect(sinceLabel("2026-11-09T20:02:30Z", now)).toBe("il y a 1 min");
    expect(sinceLabel("2026-11-09T19:51:00Z", now)).toBe("il y a 12 min");
  });

  it("disent la place qui reste dans l'équipe, d'après la règle du jeu", () => {
    // La règle, pas des places libres : le site ne sait pas qui a déjà rejoint.
    expect(seatsNote("duos")).toBe("Équipes de 2 joueurs : le jeu met tous les Gaulois dans la même et passe en spectateurs ceux qui n'y tiennent pas.");
    expect(seatsNote("quads")).toBe("Équipes de 4 joueurs : le jeu met tous les Gaulois dans la même et passe en spectateurs ceux qui n'y tiennent pas.");
    expect(seatsNote("private")).toBe("Un salon privé ne compte pas au classement des clans.");
    expect(seatsNote("2")).toBeNull();
    expect(TEAM_SIZE).toEqual({ duos: 2, trios: 3, quads: 4 });
  });
});

describe("les appels, côté serveur", () => {
  const functions = [...SQL.matchAll(/create function (public\.[a-z_]+)\(/g)].map((m) => m[1]!);
  const body = (name: string) => SQL.slice(SQL.indexOf(`create function ${name}(`), SQL.indexOf("end $$;", SQL.indexOf(`create function ${name}(`)));

  it("ferme chaque nouvelle fonction à tout le monde, puis ne l'ouvre qu'aux comptes connectés", () => {
    expect(functions.sort()).toEqual(["public.end_lobby_call", "public.get_lobby_calls", "public.save_lobby_call"]);
    for (const name of functions) {
      const fn = name.replace(".", "\\.");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${fn}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${fn}\\([^)]*\\) to authenticated;`));
      expect(SQL, name).not.toMatch(new RegExp(`grant execute on function ${fn}\\([^)]*\\) to [^;]*anon`));
      // Membre validé, pas moins.
      expect(body(name), name).toContain("internal.require_rank(1)");
    }
    expect(SQL).toContain("alter table internal.lobby_calls enable row level security;");
    expect(SQL).toContain("revoke all on internal.lobby_calls from public, anon, authenticated;");
  });

  it("garde les mêmes règles que la page", () => {
    // Les mêmes formats, et aucun autre : pas de chacun pour soi.
    expect([...FORMAT_ORDER].sort()).toEqual(Object.keys(LOBBY_FORMATS).sort());
    expect(SQL).toContain(`check (team_format in (${FORMAT_ORDER.map((f) => `'${f}'`).join(", ")}))`);
    expect(SQL).toContain(`p_format not in (${FORMAT_ORDER.map((f) => `'${f}'`).join(", ")})`);
    expect(Object.keys(LOBBY_FORMATS)).not.toContain("ffa");
    // Le même identifiant de partie.
    expect(SQL).toContain(`game_id ~ '${GAME_ID_PATTERN}'`);
    expect(SQL).toContain(`v_game !~ '${GAME_ID_PATTERN}'`);
    // La règle du jeu lui-même : GAME_ID_REGEX = /^[A-Za-z0-9]{8,10}$/.
    expect(GAME_ID_PATTERN).toBe("^[A-Za-z0-9]{8,10}$");
    // Un appel montré 15 minutes, un nouveau salon par minute au plus, et le message qui le dit.
    expect(SQL).toContain("now() + interval '15 minutes'");
    expect(SQL).toContain("interval '1 minute' then perform internal.fail('call_too_soon')");
    expect(ERROR_MESSAGES["call_too_soon"]).toContain("une minute");
  });

  it("ne garde jamais l'adresse collée ni ne montre la photo de qui ne se montre pas", () => {
    expect(SQL).not.toMatch(/\burl\b text/);
    expect(body("public.get_lobby_calls")).toContain("case when p.show_to_members then internal.discord_avatar(p.user_id) end as avatar");
    // Un compte suspendu n'appelle plus personne, et les appels finis s'effacent.
    expect(body("public.get_lobby_calls")).toContain("p.status = 'validated'");
    expect(body("public.get_lobby_calls")).toContain("delete from internal.lobby_calls where expires_at <= now();");
  });
});
