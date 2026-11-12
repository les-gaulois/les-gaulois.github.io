import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  cleanImageName,
  DISCORD_IMAGES_BUCKET,
  IMAGE_NAME_MAX,
  IMAGE_PATH,
  imageNameProblem,
  imagePathOf,
  imageUrl,
  INVENTORY_MAX,
  nameLength,
  parseInventory,
  savedImageAt,
  suggestedName,
  usableImages,
  type SavedImage,
} from "../../src/lib/compte/discord-images";
import { ERROR_MESSAGES, errorMessage } from "../../src/lib/compte/errors";

const BASE = "https://exemple.supabase.co";
const PATH = "0f1e2d3c-4b5a-4978-8796-a5b4c3d2e1f0.png";
const URL_OF = `${BASE}/storage/v1/object/public/discord-images/${PATH}`;

const image = (id: number, name: string, extra: Partial<SavedImage> = {}): SavedImage => ({
  id,
  name,
  path: `${String(id).padStart(8, "0")}-4b5a-4978-8796-a5b4c3d2e1f0.png`,
  url: imageUrl(BASE, `${String(id).padStart(8, "0")}-4b5a-4978-8796-a5b4c3d2e1f0.png`),
  size: 1000,
  missing: false,
  savedAt: "2026-11-12T10:00:00Z",
  savedBy: "Chef",
  ...extra,
});

describe("l'adresse d'une image de l'inventaire", () => {
  it("est celle que donne supabase-js pour le même fichier", () => {
    const sb = createClient(BASE, "sb_publishable_x", { auth: { persistSession: false, autoRefreshToken: false } });
    expect(imageUrl(BASE, PATH)).toBe(sb.storage.from(DISCORD_IMAGES_BUCKET).getPublicUrl(PATH).data.publicUrl);
    expect(imageUrl(`${BASE}/`, PATH)).toBe(URL_OF);
  });

  it("se reconnaît, et rien d'autre", () => {
    expect(imagePathOf(BASE, URL_OF)).toBe(PATH);
    expect(imagePathOf(BASE, `  ${URL_OF}  `)).toBe(PATH);
    expect(imagePathOf(BASE, `${BASE}/storage/v1/object/public/donation-proofs/${PATH}`)).toBeNull();
    expect(imagePathOf(BASE, `https://autre.supabase.co/storage/v1/object/public/discord-images/${PATH}`)).toBeNull();
    expect(imagePathOf(BASE, `${BASE}/storage/v1/object/public/discord-images/dossier/${PATH}`)).toBeNull();
    expect(imagePathOf(BASE, `${BASE}/storage/v1/object/public/discord-images/${PATH.toUpperCase()}`)).toBeNull();
    expect(imagePathOf(BASE, `${URL_OF}?download`)).toBeNull();
    expect(imagePathOf(BASE, "https://cdn.discordapp.com/attachments/1/2/logo.png")).toBeNull();
    expect(imagePathOf(BASE, "")).toBeNull();
  });
});

describe("le nom d'une image", () => {
  it("se remet en forme comme sur le serveur", () => {
    expect(cleanImageName("  Logo\tGAL\u0001 ")).toBe("Logo GAL");
    expect(cleanImageName("\n \t")).toBe("");
    expect(nameLength("🐓🐓")).toBe(2);
  });

  it("est refusé vide, trop long ou déjà pris, sauf pour l'image qu'on renomme", () => {
    const images = [image(1, "Logo GAL"), image(2, "Bannière")];
    expect(imageNameProblem("   ", images)).toBe(errorMessage("invalid_image_name"));
    expect(imageNameProblem("x".repeat(IMAGE_NAME_MAX + 1), images)).toBe(errorMessage("invalid_image_name"));
    expect(imageNameProblem("🐓".repeat(IMAGE_NAME_MAX), images)).toBeNull();
    expect(imageNameProblem(" logo gal ", images)).toBe(errorMessage("image_name_taken"));
    expect(imageNameProblem("LOGO GAL", images, 1)).toBeNull();
    expect(imageNameProblem("bannière", images, 1)).toBe(errorMessage("image_name_taken"));
    expect(imageNameProblem("Logo du clan", images)).toBeNull();
  });

  it("est proposé d'après le nom du fichier, sans son extension", () => {
    expect(suggestedName("logo-gal.png")).toBe("logo-gal");
    expect(suggestedName("Capture d'écran 2026-11-12.jpeg")).toBe("Capture d'écran 2026-11-12");
    expect(suggestedName("image")).toBe("image");
    expect(suggestedName(`${"a".repeat(70)}.webp`)).toBe("a".repeat(IMAGE_NAME_MAX));
    expect(suggestedName(".png")).toBe("");
  });
});

describe("l'inventaire lu sur le serveur", () => {
  it("garde les images valables, avec leur adresse, rangées par nom dans l'ordre du français", () => {
    const raw = {
      ok: true,
      images: [
        { id: 3, name: "Image 10", path: "00000003-4b5a-4978-8796-a5b4c3d2e1f0.gif", size: 12, missing: false, saved_at: "2026-11-12T10:00:00Z", saved_by: "Chef" },
        { id: 1, name: "écusson", path: "00000001-4b5a-4978-8796-a5b4c3d2e1f0.png", size: null, missing: true, saved_at: null, saved_by: "" },
        { id: 2, name: "Image 2", path: "00000002-4b5a-4978-8796-a5b4c3d2e1f0.webp", size: -4, saved_at: 5 },
        { id: 4, name: "Bannière", path: "00000004-4b5a-4978-8796-a5b4c3d2e1f0.jpg", size: 2048 },
        { id: 5, name: "Mauvais fichier", path: "../secret.png" },
        { id: "6", name: "Mauvais numéro", path: "00000006-4b5a-4978-8796-a5b4c3d2e1f0.png" },
        { id: 7, name: " ", path: "00000007-4b5a-4978-8796-a5b4c3d2e1f0.png" },
        "pas un objet",
      ],
    };
    const images = parseInventory(raw, BASE);
    expect(images?.map((i) => i.name)).toEqual(["Bannière", "écusson", "Image 2", "Image 10"]);
    expect(images?.find((i) => i.id === 3)).toEqual({
      id: 3,
      name: "Image 10",
      path: "00000003-4b5a-4978-8796-a5b4c3d2e1f0.gif",
      url: `${BASE}/storage/v1/object/public/discord-images/00000003-4b5a-4978-8796-a5b4c3d2e1f0.gif`,
      size: 12,
      missing: false,
      savedAt: "2026-11-12T10:00:00Z",
      savedBy: "Chef",
    });
    expect(images?.find((i) => i.id === 1)).toMatchObject({ size: null, missing: true, savedAt: null, savedBy: null });
    expect(images?.find((i) => i.id === 2)).toMatchObject({ size: null, missing: false, savedAt: null });
  });

  it("est illisible sans réponse valable", () => {
    expect(parseInventory(null, BASE)).toBeNull();
    expect(parseInventory({ ok: false, error: "forbidden" }, BASE)).toBeNull();
    expect(parseInventory({ ok: true, images: "non" }, BASE)).toBeNull();
    expect(parseInventory({ ok: true, images: [] }, BASE)).toEqual([]);
  });

  it("ne propose pas une image dont le fichier manque, et retrouve celle d'une adresse", () => {
    const images = [image(1, "Logo"), image(2, "Absente", { missing: true })];
    expect(usableImages(images).map((i) => i.id)).toEqual([1]);
    expect(usableImages(null)).toEqual([]);
    expect(savedImageAt(images, BASE, images[0]!.url)?.id).toBe(1);
    expect(savedImageAt(images, BASE, images[1]!.url)).toBeNull();
    expect(savedImageAt(images, BASE, URL_OF)).toBeNull();
    expect(savedImageAt(null, BASE, images[0]!.url)).toBeNull();
  });
});

describe("la migration de l'inventaire", () => {
  const SQL = readFileSync("supabase/migrations/20261112000200_inventaire_images_discord.sql", "utf8").replaceAll("\r\n", "\n");
  const body = (name: string) => {
    const start = SQL.indexOf(`function ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    const end = SQL.indexOf("$$;", start);
    expect(end, name).toBeGreaterThan(start);
    return SQL.slice(start, end);
  };

  it("ferme chaque délimiteur de fonction", () => {
    const opens = [...SQL.matchAll(/\bas \$\$/g)].length;
    const closes = [...SQL.matchAll(/^(?:end )?\$\$;$/gm)].length;
    expect(opens).toBe(5);
    expect(closes).toBe(opens);
  });

  it("ne retire aucune donnée existante, ni aucun fichier", () => {
    expect(SQL).not.toMatch(/\bdrop\s+(table|column|function|policy|index)\b/i);
    expect(SQL).not.toMatch(/\btruncate\b/i);
    // Le seul effacement : une ligne de l'inventaire, à la demande d'un admin. Le fichier reste dans l'espace.
    expect([...SQL.matchAll(/\bdelete from ([a-z_.]+)/gi)].map((m) => m[1])).toEqual(["internal.discord_images"]);
    expect(SQL).not.toMatch(/\b(update|delete from|insert into)\s+storage\./i);
    expect(SQL).not.toMatch(/create policy/i);
  });

  it("n'ouvre les fonctions qu'aux comptes connectés, chaque fonction vérifiant le rang d'admin", () => {
    for (const [name, args] of [
      ["get_discord_images", ""],
      ["save_discord_image", "text, text"],
      ["rename_discord_image", "bigint, text"],
      ["remove_discord_image", "bigint"],
    ] as const) {
      expect(SQL).toContain(`revoke all on function public.${name}(${args}) from public, anon, authenticated;`);
      expect(SQL).toContain(`grant execute on function public.${name}(${args}) to authenticated;`);
      expect(body(`public.${name}`)).toContain("internal.require_rank(3)");
      expect(body(`public.${name}`)).toContain("security definer set search_path = public, pg_temp");
    }
    expect([...SQL.matchAll(/^grant /gm)]).toHaveLength(4);
    expect(SQL).toContain("revoke all on function internal.discord_image_name(text) from public, anon, authenticated;");
    expect(SQL).toContain("alter table internal.discord_images enable row level security;");
    expect(SQL).toContain("revoke all on internal.discord_images from public, anon, authenticated;");
  });

  it("a les mêmes limites que la page", () => {
    expect(SQL).toContain(`check (char_length(name) between 1 and ${IMAGE_NAME_MAX})`);
    expect(body("internal.discord_image_name")).toContain(`between 1 and ${IMAGE_NAME_MAX}`);
    expect(body("public.save_discord_image")).toContain(`(select count(*) from internal.discord_images) >= ${INVENTORY_MAX}`);
    // Le nom d'un fichier : celui que la règle d'accès du stockage impose au dépôt.
    const rule = `'${IMAGE_PATH.source}'`;
    expect(SQL).toContain(`check (path ~ ${rule})`);
    expect(body("public.save_discord_image")).toContain(`p_path !~ ${rule}`);
    expect(readFileSync("supabase/migrations/20261111000600_messages_discord.sql", "utf8")).toContain(`name ~ ${rule}`);
  });

  it("ne garde qu'une image déjà déposée dans l'espace des messages, et n'en rend jamais l'adresse", () => {
    expect(body("public.save_discord_image")).toContain("if not exists (select 1 from storage.objects where bucket_id = 'discord-images' and name = p_path) then perform internal.fail('image_not_on_server'); end if;");
    expect(body("public.get_discord_images")).toContain("left join storage.objects o on o.bucket_id = 'discord-images' and o.name = i.path");
    expect(body("public.get_discord_images")).not.toMatch(/'url'|http/);
  });

  it("note au journal le nom de l'image, jamais son fichier", () => {
    const logs = [...SQL.matchAll(/internal\.log_admin\(v_actor, '([a-z_]+)', null, (jsonb_build_object\([^)]*\))\)/g)];
    expect(logs.map((m) => m[1])).toEqual(["discord_image_saved", "discord_image_renamed", "discord_image_removed"]);
    for (const m of logs) expect(m[2]).not.toContain("path");
  });

  it("a un message en français pour chacun de ses refus", () => {
    const codes = new Set([...SQL.matchAll(/internal\.(?:fail|error_json)\('([a-z_]+)'/g)].map((m) => m[1]!));
    expect([...codes].sort()).toEqual(["image_already_saved", "image_name_taken", "image_not_on_server", "invalid_image", "invalid_image_name", "inventory_full", "rate_limited", "saved_image_not_found"]);
    expect([...codes].filter((code) => !(code in ERROR_MESSAGES))).toEqual([]);
  });
});
