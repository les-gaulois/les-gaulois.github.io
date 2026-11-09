import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS_PER_WEEK, relaunchBackupIfDue, type BackupRun } from "../../src/lib/sauvegarde-relance";

// Le lundi 16 novembre 2026, au passage de 8 h 53 UTC. La semaine de sauvegarde a commencé à 3 h UTC.
const NOW = new Date("2026-11-16T08:53:00Z");
const WEEK_START = "2026-11-16T03:00:00Z";
const run = (id: number, createdAt: string, conclusion: string | null = "success", status = "completed"): BackupRun => ({ id, status, conclusion, created_at: createdAt });

interface Fake {
  runs?: BackupRun[];
  artifacts?: Record<number, { expired?: boolean }[]>;
  listStatus?: number;
  artifactsStatus?: number;
  dispatchStatus?: number;
}

function fakeGitHub({ runs = [], artifacts = {}, listStatus = 200, artifactsStatus = 200, dispatchStatus = 204 }: Fake = {}) {
  const calls: { path: string; method: string; body?: string }[] = [];
  const api = async (path: string, init?: { method: "POST"; body: string }) => {
    calls.push({ path, method: init?.method ?? "GET", body: init?.body });
    if (path.startsWith("/actions/workflows/sauvegarde.yml/runs")) return new Response(JSON.stringify({ workflow_runs: runs }), { status: listStatus });
    const artifactsOf = /^\/actions\/runs\/(\d+)\/artifacts$/.exec(path);
    if (artifactsOf) return new Response(JSON.stringify({ artifacts: artifacts[Number(artifactsOf[1])] ?? [] }), { status: artifactsStatus });
    if (path === "/actions/workflows/sauvegarde.yml/dispatches" && init?.method === "POST") return new Response(null, { status: dispatchStatus });
    return new Response("{}", { status: 404 });
  };
  return { api, calls, launches: () => calls.filter((c) => c.method === "POST") };
}

async function relaunch(fake: ReturnType<typeof fakeGitHub>, passphraseSet = true) {
  const lines: string[] = [];
  const result = await relaunchBackupIfDue({ api: fake.api, now: NOW, passphraseSet, ref: "main", log: (line) => lines.push(line) });
  return { result, lines };
}

describe("la sauvegarde de la semaine lancée par le robot", () => {
  it("sans phrase de passe, ne lance rien, ne demande rien à GitHub, et le signale", async () => {
    const fake = fakeGitHub();
    const { result, lines } = await relaunch(fake, false);
    expect(result).toBe("off");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^::warning::.*SAUVEGARDE_CLE/);
    expect(fake.calls).toEqual([]);
  });

  it("n'avertit de rien quand la semaine a sa sauvegarde", async () => {
    const { result, lines } = await relaunch(fakeGitHub({ runs: [run(4, "2026-11-16T03:10:00Z")], artifacts: { 4: [{ expired: false }] } }));
    expect(result).toBe("done");
    expect(lines.some((line) => line.startsWith("::"))).toBe(false);
  });

  it("lance la sauvegarde quand la semaine n'en a pas encore, sur la branche donnée", async () => {
    // Celle de la semaine passée, gardée, ne compte pas pour celle-ci.
    const fake = fakeGitHub({ runs: [run(2, "2026-11-09T06:33:00Z")], artifacts: { 2: [{ expired: false }] } });
    const { result, lines } = await relaunch(fake);
    expect(result).toBe("launched");
    expect(lines).toEqual(["Sauvegarde de la semaine lancée."]);
    expect(fake.launches()).toEqual([{ path: "/actions/workflows/sauvegarde.yml/dispatches", method: "POST", body: JSON.stringify({ ref: "main" }) }]);
    expect(fake.calls.some((c) => c.path === "/actions/runs/2/artifacts")).toBe(false);
  });

  it("ne relance pas une semaine qui a son fichier", async () => {
    const fake = fakeGitHub({ runs: [run(5, "2026-11-16T03:54:00Z", "failure"), run(4, "2026-11-16T03:10:00Z")], artifacts: { 4: [{ expired: false }] } });
    expect((await relaunch(fake)).result).toBe("done");
    expect(fake.launches()).toEqual([]);
  });

  it("fait commencer la semaine au lundi 3 h UTC tout rond", async () => {
    const kept = { 8: [{ expired: false }] };
    expect((await relaunch(fakeGitHub({ runs: [run(8, WEEK_START)], artifacts: kept }))).result).toBe("done");
    expect((await relaunch(fakeGitHub({ runs: [run(8, "2026-11-16T02:59:59Z")], artifacts: kept }))).result).toBe("launched");
  });

  it("ne compte pas une exécution réussie qui n'a rien gardé, ni un fichier expiré", async () => {
    for (const kept of [[], [{ expired: true }]]) {
      const fake = fakeGitHub({ runs: [run(6, "2026-11-16T03:10:00Z")], artifacts: { 6: kept } });
      expect((await relaunch(fake)).result).toBe("launched");
    }
  });

  it("attend la fin d'une sauvegarde déjà en cours ou en file", async () => {
    for (const status of ["in_progress", "queued"]) {
      const fake = fakeGitHub({ runs: [run(7, "2026-11-16T08:50:00Z", null, status)] });
      const { result, lines } = await relaunch(fake);
      expect(result).toBe("running");
      expect(lines).toEqual(["Une sauvegarde est déjà en cours."]);
      expect(fake.launches()).toEqual([]);
    }
  });

  it("signale une sauvegarde restée plus d'une heure sans finir, sans en lancer une autre", async () => {
    const fake = fakeGitHub({ runs: [run(9, "2026-11-16T07:30:00Z", null, "queued")] });
    const { result, lines } = await relaunch(fake);
    expect(result).toBe("running");
    expect(lines[0]).toMatch(/^::warning::.*plus d'une heure/);
    expect(fake.launches()).toEqual([]);
  });

  it(`s'arrête après ${MAX_ATTEMPTS_PER_WEEK} essais sans fichier dans la semaine, et le signale`, async () => {
    const failed = Array.from({ length: MAX_ATTEMPTS_PER_WEEK }, (_, i) => run(10 + i, `2026-11-16T0${3 + i}:55:00Z`, "failure"));
    const fake = fakeGitHub({ runs: failed });
    const { result, lines } = await relaunch(fake);
    expect(result).toBe("gave-up");
    expect(lines[0]).toMatch(/^::warning::/);
    expect(fake.launches()).toEqual([]);
    // Un essai de moins : le robot réessaie.
    expect((await relaunch(fakeGitHub({ runs: failed.slice(1) }))).result).toBe("launched");
  });

  it("signale une réponse d'erreur de GitHub, sans rien lancer de plus", async () => {
    const down = fakeGitHub({ listStatus: 500 });
    const listed = await relaunch(down);
    expect(listed.result).toBe("failed");
    expect(listed.lines[0]).toMatch(/^::warning::.*500/);
    expect(down.launches()).toEqual([]);

    const noFiles = fakeGitHub({ runs: [run(6, "2026-11-16T03:10:00Z")], artifactsStatus: 502 });
    const files = await relaunch(noFiles);
    expect(files.result).toBe("failed");
    expect(files.lines[0]).toMatch(/^::warning::.*502/);
    expect(noFiles.launches()).toEqual([]);

    const refused = await relaunch(fakeGitHub({ dispatchStatus: 403 }));
    expect(refused.result).toBe("failed");
    expect(refused.lines[0]).toMatch(/^::warning::.*403/);
  });
});
