import { describe, expect, it } from "vitest";
import { backupReport, sendBackupReport } from "../../src/lib/sauvegarde-discord";

// Le lundi 16 novembre 2026 à 8 h 54 à Paris (heure d'hiver : UTC+1), juste après le passage du robot.
const NOW = new Date("2026-11-16T07:54:00Z");
const RUN = "https://github.com/les-gaulois/les-gaulois.github.io/actions/runs/42573711367";
const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/jeton-faux_ABC";

describe("le compte rendu d'une sauvegarde", () => {
  it("dit qu'elle est faite, et jusqu'à quand GitHub la garde, sans aucune donnée", () => {
    // 90 jours plus tard : le 14 février 2027.
    expect(backupReport("faite", NOW, RUN)).toBe("Sauvegarde chiffrée faite le 16 nov., 08:54. GitHub la garde jusqu'au 14 févr. 2027.");
  });

  it("dit qu'elle a échoué, avec le lien de l'exécution, et comment elle repart", () => {
    expect(backupReport("ratee", NOW, RUN)).toBe(
      `La sauvegarde chiffrée a échoué. Le robot la relance au passage suivant, trois essais au plus par semaine ; au-delà, elle se relance à la main, onglet Actions. Détail : ${RUN}`,
    );
    // Un lien qui ne mène pas à une exécution du dépôt n'est pas recopié.
    expect(backupReport("ratee", NOW, "https://exemple.fr/piege")).not.toContain("exemple.fr");
  });

  it("distingue une phrase ou un réglage absent d'une panne, sans promettre de relance", () => {
    const report = backupReport("reglage", NOW, RUN);
    expect(report).toBe(
      `La sauvegarde chiffrée n'a rien gardé : la phrase de passe ou un autre réglage manque dans les secrets du dépôt. Sans phrase, le robot n'en lance aucune. Détail : ${RUN}`,
    );
    expect(report).not.toContain("relance");
  });
});

describe("l'envoi du compte rendu", () => {
  const send = async (over: Partial<Parameters<typeof sendBackupReport>[0]>, status = 204) => {
    const lines: string[] = [];
    const calls: { url: string; init: RequestInit }[] = [];
    const result = await sendBackupReport({
      webhook: WEBHOOK,
      outcome: "faite",
      now: NOW,
      runUrl: RUN,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status });
      }) as unknown as typeof fetch,
      log: (line) => lines.push(line),
      ...over,
    });
    return { result, lines, calls };
  };

  it("poste sans mention et sans écrire le lien du salon dans le journal", async () => {
    const { result, calls, lines } = await send({});
    expect(result).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.redirect).toBe("error");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ content: expect.stringContaining("Sauvegarde chiffrée faite") as unknown, allowed_mentions: { parse: [] } });
    expect(lines.join("\n")).not.toContain("jeton-faux");
  });

  it("ne poste rien sans lien ou avec un faux lien", async () => {
    expect((await send({ webhook: undefined })).calls).toEqual([]);
    const invalid = await send({ webhook: "https://exemple.fr/webhook" });
    expect(invalid.result).toBe("invalid");
    expect(invalid.calls).toEqual([]);
  });

  it("poste la nuit aussi", async () => {
    // 3 h à Paris : plus d'heures de silence depuis le 14 novembre 2026.
    const night = await send({ now: new Date("2026-11-16T02:00:00Z") });
    expect(night.result).toBe("sent");
    expect(night.calls).toHaveLength(1);
  });

  it("signale un refus de Discord, sans le lien", async () => {
    const { result, lines } = await send({}, 401);
    expect(result).toBe("failed");
    expect(lines[0]).toMatch(/^::warning::.*401/);
    expect(lines.join("\n")).not.toContain("jeton-faux");
  });
});
