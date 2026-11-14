import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import { HAUTEUR, LARGEUR } from "../../supabase/functions/code-discord/decors/commun";
import { DESSINS_DES_LIEUX, decorDe } from "../../supabase/functions/code-discord/decors/index";
import { IMAGE_GAULOIS, PLACE_DU_LOGO, TENUE_DE_DEPART, decrireLaScene, imageDeLaScene, imageDuGaulois, pngDuGaulois } from "../../supabase/functions/code-discord/gaulois";
import { LOGO_DU_CLAN } from "../../supabase/functions/code-discord/logo-du-clan";
import { LIEUX, PHASES, lieuDuGaulois, momentDeParis, sceneDuGaulois, type Moment, type Scene } from "../../supabase/functions/code-discord/scene";
import { lumiereDuVillage } from "../../src/lib/village/lumiere";
import { lieuDuGaulois as lieuDeLaPlace } from "../../src/lib/village/vie";

const MIGRATION = readFileSync("supabase/migrations/20261114000500_gaulois_scene_sur_discord.sql", "utf8");

/** Un tirage reproductible. */
function hasardFixe(graine: number): () => number {
  let etat = graine;
  return () => (etat = (etat * 48271) % 2147483647) / 2147483647;
}

/** Un moment type de chaque phase, l'astre à mi-course. */
const MOMENTS: Record<(typeof PHASES)[number], Moment> = {
  aube: { phase: "aube", astre: { sorte: "soleil", course: 0.01, hauteur: 0.03 } },
  jour: { phase: "jour", astre: { sorte: "soleil", course: 0.45, hauteur: 0.98 } },
  crepuscule: { phase: "crepuscule", astre: { sorte: "soleil", course: 0.99, hauteur: 0.03 } },
  nuit: { phase: "nuit", astre: { sorte: "lune", course: 0.5, hauteur: 1 } },
};

describe("la scène de /gaulois", () => {
  it("a le même moment de la journée et le même astre que la place du village, toute l'année", () => {
    const hasard = hasardFixe(2026);
    const debut = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 4000; i++) {
      const date = new Date(debut + Math.floor(hasard() * 366 * 86_400_000));
      const place = lumiereDuVillage(date);
      expect(momentDeParis(date), date.toISOString()).toEqual({ phase: place.phase, astre: place.astre });
    }
  });

  it("met le Gaulois au même lieu que la place, partie, vocal et heure compris", () => {
    const hasard = hasardFixe(7);
    const debut = Date.UTC(2026, 10, 1);
    const ecarts = [null, -5, 0, 10, 44.9, 45, 100, 179.9, 180, 600, 2000];
    for (let i = 0; i < 3000; i++) {
      const maintenant = new Date(debut + Math.floor(hasard() * 30 * 86_400_000));
      const avant = (minutes: number | null) => (minutes === null ? null : new Date(maintenant.getTime() - minutes * 60_000).toISOString());
      const partie_le = avant(ecarts[Math.floor(hasard() * ecarts.length)] ?? null);
      const vocal = [true, false, null][Math.floor(hasard() * 3)] ?? null;
      const releve = avant(ecarts[Math.floor(hasard() * ecarts.length)] ?? null);
      expect(lieuDuGaulois({ partie_le, vocal }, maintenant, releve), JSON.stringify({ maintenant, partie_le, vocal, releve })).toBe(lieuDeLaPlace({ partie_le, vocal }, maintenant, releve).lieu);
    }
    // Un fait illisible ou absent compte pour rien.
    const midi = new Date("2026-11-14T11:00:00Z");
    expect(lieuDuGaulois({ partie_le: "n'importe quoi", vocal: "oui" }, midi)).toBe("place");
    expect(sceneDuGaulois({}, midi)).toEqual({ lieu: "place", moment: momentDeParis(midi) });
  });

  it("a un décor pour chacun des 20 fonds : 124 × 80 couleurs, toujours les mêmes, tous différents", () => {
    const vus = new Set<string>();
    for (const lieu of LIEUX) {
      expect(DESSINS_DES_LIEUX[lieu], lieu).toBeDefined();
      for (const phase of PHASES) {
        const decor = decorDe(lieu, MOMENTS[phase]);
        expect(decor.cases, `${lieu} ${phase}`).toHaveLength(LARGEUR * HAUTEUR);
        for (const couleur of decor.cases) expect(couleur, `${lieu} ${phase}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(decor.ombre).toMatch(/^#[0-9a-f]{6}$/);
        expect(DESSINS_DES_LIEUX[lieu](MOMENTS[phase]).cases).toEqual(decor.cases);
        vus.add(decor.cases.join(""));
      }
    }
    expect(vus.size).toBe(LIEUX.length * PHASES.length);
  });

  it("pose le logo du clan en haut à gauche, à la place du drapeau, et le Gaulois au milieu", async () => {
    expect(LOGO_DU_CLAN.cote).toBe(64);
    expect(Uint8Array.from(atob(LOGO_DU_CLAN.rgba), (c) => c.charCodeAt(0))).toHaveLength(64 * 64 * 4);
    const scene: Scene = { lieu: "place", moment: MOMENTS.jour };
    const image = imageDeLaScene(TENUE_DE_DEPART, scene);
    expect([image.largeur, image.hauteur]).toEqual([IMAGE_GAULOIS.largeur, IMAGE_GAULOIS.hauteur]);
    const pixel = (x: number, y: number) => Array.from(image.rgba.slice((y * image.largeur + x) * 4, (y * image.largeur + x) * 4 + 4));
    // Le centre du logo est opaque : ce n'est plus le décor.
    const centre = PLACE_DU_LOGO.x + PLACE_DU_LOGO.cote / 2;
    const decor = decorDe("place", MOMENTS.jour);
    const caseDuDecor = decor.cases[Math.floor(centre / 4) * LARGEUR + Math.floor(centre / 4)]!;
    expect(pixel(centre, centre).slice(0, 3)).not.toEqual([1, 3, 5].map((i) => parseInt(caseDuDecor.slice(i, i + 2), 16)));
    // Toute l'image est opaque.
    for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i] !== 255) throw new Error(`pixel transparent ${i}`);
    // Le PNG se relit, aux mêmes dimensions ; sans scène, l'image d'avant ne change pas.
    expect(await lirePng(await pngDuGaulois(TENUE_DE_DEPART, scene))).toMatchObject({ largeur: 496, hauteur: 320 });
    expect(Array.from((await lirePng(await pngDuGaulois(TENUE_DE_DEPART)))!.rgba)).toEqual(Array.from(imageDuGaulois(TENUE_DE_DEPART).rgba));
    expect(decrireLaScene(TENUE_DE_DEPART, { lieu: "taverne", moment: MOMENTS.crepuscule })).toMatch(/ Il est à la taverne, après sa dernière partie, au crépuscule\.$/);
  });

  it("garde le logo du badge du clan : le réduire de nouveau donne les mêmes pixels, à quelques nuances près", async () => {
    const { logoReduit, COTE } = await import("../../scripts/logo-du-clan-gaulois");
    expect(LOGO_DU_CLAN.cote).toBe(COTE);
    const frais = await logoReduit();
    const garde = Uint8Array.from(atob(LOGO_DU_CLAN.rgba), (c) => c.charCodeAt(0));
    expect(frais.length).toBe(garde.length);
    let ecart = 0;
    for (let i = 0; i < garde.length; i++) ecart = Math.max(ecart, Math.abs((frais[i] ?? 0) - (garde[i] ?? 0)));
    expect(ecart, "relancer npx tsx scripts/logo-du-clan-gaulois.ts").toBeLessThanOrEqual(8);
  });
});

describe("le serveur de /gaulois", () => {
  it("rend la dernière partie et le vocal comme la place, pour un compte validé seulement, à la clé de service seule", () => {
    expect(MIGRATION).toContain("create or replace function public.discord_gaulois(p_discord_id text) returns jsonb");
    expect(MIGRATION).toContain("if v_status = 'validated' then");
    expect(MIGRATION).toContain("select d.debut into v_partie from internal.village_vie_partie(v_uid) d;");
    expect(MIGRATION).toContain("internal.village_vie_vocal(v.vocal, v.vocal_le)");
    expect(MIGRATION).toContain("revoke all on function public.discord_gaulois(text) from public, anon, authenticated;");
    expect(MIGRATION).toContain("grant execute on function public.discord_gaulois(text) to service_role;");
    expect(MIGRATION).not.toMatch(/grant execute on function public\.discord_gaulois\(text\) to (anon|authenticated)/);
    expect(MIGRATION).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });
});
