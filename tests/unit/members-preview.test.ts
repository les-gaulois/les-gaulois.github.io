import { describe, expect, it } from "vitest";
import { membersPreview } from "../../src/components/MembersTable";
import { loadMembers } from "../../src/lib/data";
import { sortMembers } from "../../src/lib/members";
import type { StoredMember } from "../../src/lib/schemas";

const member = (publicId: string | null, wins: number | null, username: string | null = publicId): StoredMember => ({
  role: "member",
  joinedAt: "2026-06-01T12:00:00.000Z",
  publicId,
  username,
  team: wins === null ? null : { wins, losses: 1 },
  account: null,
});

// L'aperçu de la liste des membres, rendu dans la page à sa construction : il doit être exactement ce que la liste montre à
// son ouverture, sinon la page change à l'arrivée de la liste entière.
describe("membersPreview", () => {
  it("garde les trente premiers au plus de victoires, sans stats en dernier, et les comptes de toute la liste", () => {
    const list = [member(null, 50, null), member("sans", null), ...Array.from({ length: 40 }, (_, i) => member(`m${i}`, i))];
    const preview = membersPreview({ fetchedAt: "2026-11-14T08:00:00.000Z", total: 45, members: list });
    expect(preview.total).toBe(45);
    expect(preview.count).toBe(42);
    expect(preview.anonymous).toBe(1);
    expect(preview.first).toHaveLength(30);
    expect(preview.first[0]?.team?.wins).toBe(50);
    expect(preview.first.map((m) => m.publicId)).toEqual(sortMembers(list, "wins", "desc").slice(0, 30).map((m) => m.publicId));
    expect(preview.first.some((m) => m.publicId === "sans")).toBe(false);
  });

  it("sans liste collectée, ne montre rien : pas de données n'est pas zéro membre affiché", () => {
    expect(membersPreview(null)).toEqual({ total: 0, count: 0, anonymous: 0, first: [] });
  });

  it("sur la vraie liste, reprend le début du tri d'ouverture", () => {
    const data = loadMembers();
    if (!data) return;
    const preview = membersPreview(data);
    expect(preview.count).toBe(data.members.length);
    expect(preview.first).toEqual(sortMembers(data.members, "wins", "desc").slice(0, 30));
  });
});
