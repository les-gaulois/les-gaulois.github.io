import { describe, expect, it, vi } from "vitest";
import { oldestMembersReading } from "../../src/lib/member-history";

const TOKEN = "jeton-secret-123";
const reading = (fetchedAt: string) => ({ fetchedAt, total: 1, members: [{ role: "member", joinedAt: "2026-05-03T21:26:21.579Z", publicId: "a", username: "Alpha", team: { wins: 10, losses: 1 } }] });
const sha = (n: number) => String(n).repeat(40).slice(0, 40);

/** Un faux GitHub : la liste des commits, du plus récent au plus ancien, puis le fichier de chacun. */
function github(commits: { sha: string; file: unknown; status?: number }[], listStatus = 200) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const get = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string> });
    if (url.includes("/commits?")) return new Response(JSON.stringify(commits.map((c) => ({ sha: c.sha }))), { status: listStatus });
    const found = commits.find((c) => url.includes(`ref=${c.sha}`));
    return new Response(JSON.stringify(found?.file ?? {}), { status: found?.status ?? 200 });
  });
  return { get: get as unknown as typeof fetch, calls };
}
const FROM = "2026-11-01T23:00:00.000Z";
const TO = "2026-11-08T23:00:00.000Z";

describe("oldestMembersReading", () => {
  it("rend le plus ancien relevé de la période, lu au commit de l'époque", async () => {
    const { get, calls } = github([
      { sha: sha(3), file: reading("2026-11-07T05:53:27.005Z") },
      { sha: sha(2), file: reading("2026-11-06T09:26:00.000Z") },
      { sha: sha(1), file: reading("2026-11-05T10:39:31.574Z") },
    ]);
    const found = await oldestMembersReading({ fetch: get, repo: "les-gaulois/les-gaulois.github.io", token: TOKEN }, FROM, TO);
    expect(found?.fetchedAt).toBe("2026-11-05T10:39:31.574Z");
    expect(calls[0]?.url).toBe(`https://api.github.com/repos/les-gaulois/les-gaulois.github.io/commits?path=data%2Fmembers.json&since=${FROM}&until=${TO}&per_page=100`);
    expect(calls[1]?.url).toContain(`ref=${sha(1)}`);
    expect(calls[1]?.headers.Accept).toBe("application/vnd.github.raw+json");
    expect(calls).toHaveLength(2);
  });

  it("écarte un fichier dont le relevé date d'avant la période, même si son commit est dedans", async () => {
    const { get } = github([
      { sha: sha(2), file: reading("2026-11-05T10:39:31.574Z") },
      { sha: sha(1), file: reading("2026-11-01T22:58:00.000Z") },
    ]);
    expect((await oldestMembersReading({ fetch: get, repo: "o/r", token: TOKEN }, FROM, TO))?.fetchedAt).toBe("2026-11-05T10:39:31.574Z");
  });

  it("écarte un fichier illisible et passe au suivant", async () => {
    const { get } = github([
      { sha: sha(2), file: reading("2026-11-06T09:26:00.000Z") },
      { sha: sha(1), file: { cassé: true } },
    ]);
    expect((await oldestMembersReading({ fetch: get, repo: "o/r", token: TOKEN }, FROM, TO))?.fetchedAt).toBe("2026-11-06T09:26:00.000Z");
  });

  it("rend `null` sans relevé dans la période", async () => {
    const { get } = github([]);
    expect(await oldestMembersReading({ fetch: get, repo: "o/r", token: TOKEN }, FROM, TO)).toBeNull();
  });

  it("signale une panne de GitHub sans jamais écrire le jeton", async () => {
    for (const { commits, listStatus } of [
      { commits: [], listStatus: 403 },
      { commits: [{ sha: sha(1), file: {}, status: 500 }], listStatus: 200 },
    ]) {
      const { get } = github(commits, listStatus);
      const error = await oldestMembersReading({ fetch: get, repo: "o/r", token: TOKEN }, FROM, TO).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).message)).toMatch(/HTTP (403|500)/);
      expect(String((error as Error).message)).not.toContain(TOKEN);
    }
  });

  it("s'identifie avec le jeton de l'Action, seulement dans l'en-tête", async () => {
    const { get, calls } = github([{ sha: sha(1), file: reading("2026-11-05T10:39:31.574Z") }]);
    await oldestMembersReading({ fetch: get, repo: "o/r", token: TOKEN }, FROM, TO);
    for (const call of calls) {
      expect(call.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(call.url).not.toContain(TOKEN);
    }
  });
});
