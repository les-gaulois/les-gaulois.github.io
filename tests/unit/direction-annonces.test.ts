import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_URL_MAX,
  HOME_ANNOUNCEMENTS,
  LISTED_ANNOUNCEMENTS,
  announcementCount,
  announcementExcerpt,
  announcementLink,
  announcementState,
  announcementsCapped,
  draftGone,
  fieldCount,
  homePlaces,
} from "../../src/lib/compte/direction-annonces";
import { mergeAnnouncements, type LiveAnnouncement } from "../../src/lib/compte/news";

/** Le corps de la dernière version d'une fonction SQL, dans l'ordre des migrations (le nom de fichier commence par la date). */
function lastVersion(name: string): { file: string; body: string } {
  const files = readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .reverse();
  for (const file of files) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace(/\r\n/g, "\n");
    const start = sql.search(new RegExp(`create (or replace )?function ${name.replace(".", "\\.")}\\(`));
    if (start < 0) continue;
    const open = sql.indexOf("$$", start);
    return { file, body: sql.slice(open, sql.indexOf("$$", open + 2)) };
  }
  throw new Error(`fonction introuvable : ${name}`);
}

/** Des heures de création distinctes, la plus récente d'abord, comme les écrit le serveur. */
const times = (count: number) => Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 10, 14, 12) - i * 60_000).toISOString());

describe("les annonces de l'accueil, d'après le serveur", () => {
  it("l'accueil reçoit les 10 plus récentes, sans autre filtre", () => {
    // HOME_ANNOUNCEMENTS vient de `get_site_news` : « order by created_at desc limit 10 », dernière version de la fonction
    // dans supabase/migrations/20261109000200_gaulois_de_la_semaine.sql. Une migration qui la change fait échouer ce test.
    expect(HOME_ANNOUNCEMENTS).toBe(10);
    const news = lastVersion("public.get_site_news");
    expect(news.file).toBe("20261109000200_gaulois_de_la_semaine.sql");
    expect(news.body).toContain(`select id, title, body, url, created_at from public.site_announcements order by created_at desc limit ${HOME_ANNOUNCEMENTS}\n`);
  });

  it("la Direction liste les 50 plus récentes, dans le même ordre", () => {
    // LISTED_ANNOUNCEMENTS vient de `get_direction_overview` : « order by a.created_at desc limit 50 »,
    // supabase/migrations/20261105000900_direction.sql. Même table, même ordre que l'accueil : ses 10 premières lignes sont
    // celles de l'accueil.
    expect(LISTED_ANNOUNCEMENTS).toBe(50);
    const overview = lastVersion("public.get_direction_overview");
    expect(overview.body).toContain(`from public.site_announcements a order by a.created_at desc limit ${LISTED_ANNOUNCEMENTS}\n`);
    expect(overview.body).toContain("'announcements', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]')");
  });

  it("l'accueil affiche toutes celles que le serveur donne", () => {
    const live: LiveAnnouncement[] = times(HOME_ANNOUNCEMENTS).map((at, i) => ({ id: i + 1, title: `A${i}`, body: "x", url: null, created_at: at }));
    const shown = mergeAnnouncements([{ date: "2026-11-14", title: "Du dépôt", body: "y" }], live);
    expect(shown.filter((item) => item.key.startsWith("live-"))).toHaveLength(HOME_ANNOUNCEMENTS);
    const board = readFileSync("src/components/NewsBoard.tsx", "utf8");
    expect(board).toContain("const allAnnouncements = mergeAnnouncements(announcements, news.announcements);");
    expect(board).toContain('<Items items={allAnnouncements} date={fmtDate} testId="news-announcements" />');
  });

  it("garde les limites des champs du serveur", () => {
    const save = lastVersion("public.save_announcement").body;
    expect(save).toContain(`char_length(v_title) not between 1 and ${ANNOUNCEMENT_TITLE_MAX}`);
    expect(save).toContain(`char_length(v_body) not between 1 and ${ANNOUNCEMENT_BODY_MAX}`);
    expect(lastVersion("internal.check_news_url").body).toContain(`char_length(v_url) > ${ANNOUNCEMENT_URL_MAX}`);
  });
});

describe("la place d'une annonce à l'accueil", () => {
  it("met les 10 premières sur l'accueil et les suivantes hors de l'accueil", () => {
    const places = homePlaces(times(12));
    expect(places.slice(0, 10)).toEqual(Array(10).fill("home"));
    expect(places.slice(10)).toEqual(["off", "off"]);
  });

  it("met toute une liste courte sur l'accueil", () => {
    expect(homePlaces([])).toEqual([]);
    expect(homePlaces(times(1))).toEqual(["home"]);
    expect(homePlaces(times(10))).toEqual(Array(10).fill("home"));
  });

  it("ne tranche pas quand deux annonces de la même heure se partagent la dixième place", () => {
    const at = times(12);
    at[10] = at[9]!;
    const places = homePlaces(at);
    expect(places.slice(0, 9)).toEqual(Array(9).fill("home"));
    expect(places[9]).toBe("unsure");
    expect(places[10]).toBe("unsure");
    expect(places[11]).toBe("off");
  });

  it("tranche une égalité qui ne touche pas la dixième place", () => {
    const at = times(12);
    at[1] = at[0]!;
    at[11] = at[10]!;
    const places = homePlaces(at);
    expect(places.slice(0, 10)).toEqual(Array(10).fill("home"));
    expect(places.slice(10)).toEqual(["off", "off"]);
  });

  it("compare l'heure à la microseconde, comme le serveur l'écrit", () => {
    const at = times(11);
    at[9] = "2026-11-14T10:00:00.123456+00:00";
    at[10] = "2026-11-14T10:00:00.123455+00:00";
    expect(homePlaces(at).slice(9)).toEqual(["home", "off"]);
  });
});

describe("l'état d'une annonce de la Direction", () => {
  it("met en vert celles de l'accueil", () => {
    expect(announcementState("home", false)).toEqual({ ton: "ok", label: "Sur l'accueil", editing: false });
  });
  it("met en gris celles que l'accueil ne montre plus", () => {
    expect(announcementState("off", false)).toEqual({ ton: "muted", label: "Hors de l'accueil", editing: false });
  });
  it("met en gris, avec un mot prudent, celle dont la place n'est pas sûre", () => {
    expect(announcementState("unsure", false)).toEqual({ ton: "muted", label: "Accueil incertain", editing: false });
  });
  it("met en jaune celle du formulaire, quelle que soit sa place", () => {
    for (const place of ["home", "off", "unsure"] as const) expect(announcementState(place, true)).toEqual({ ton: "warn", label: "En modification", editing: true });
  });
});

describe("le brouillon d'une annonce disparue", () => {
  it("se vide quand l'annonce n'est plus dans la liste", () => {
    expect(draftGone(5, [7, 6, 4])).toBe(true);
    expect(draftGone(5, [])).toBe(true);
  });
  it("reste tant qu'elle y est, ou pour une annonce nouvelle", () => {
    expect(draftGone(5, [6, 5, 4])).toBe(false);
    expect(draftGone(null, [])).toBe(false);
    expect(draftGone(null, [1, 2])).toBe(false);
  });
});

describe("le compteur d'un champ", () => {
  it("s'écrit en mots", () => {
    expect(fieldCount("", ANNOUNCEMENT_TITLE_MAX)).toEqual({ text: "0 sur 120", near: false });
    expect(fieldCount("abc", ANNOUNCEMENT_BODY_MAX).text.replace(/\s/g, " ")).toBe("3 sur 2 000");
  });

  it("compte comme maxlength : une lettre accentuée vaut un, un émoji deux", () => {
    const accents = "Événement à l’été";
    expect(fieldCount(accents, ANNOUNCEMENT_TITLE_MAX).text).toBe(`${accents.length} sur 120`);
    expect(accents.length).toBe(17);
    // Le même « é » écrit en deux temps (e + accent) compte deux, comme pour le navigateur.
    expect(fieldCount(`e${String.fromCharCode(0x301)}`, ANNOUNCEMENT_TITLE_MAX).text).toBe("2 sur 120");
    const party = String.fromCodePoint(0x1f389);
    expect(fieldCount(party, ANNOUNCEMENT_TITLE_MAX).text).toBe("2 sur 120");
    expect(fieldCount(`Bravo ${party}${party}`, ANNOUNCEMENT_TITLE_MAX).text).toBe("10 sur 120");
  });

  it("prévient à neuf dixièmes de la limite du titre", () => {
    expect(fieldCount("a".repeat(107), ANNOUNCEMENT_TITLE_MAX).near).toBe(false);
    expect(fieldCount("a".repeat(108), ANNOUNCEMENT_TITLE_MAX).near).toBe(true);
    expect(fieldCount("a".repeat(120), ANNOUNCEMENT_TITLE_MAX).near).toBe(true);
  });

  it("prévient à neuf dixièmes de la limite du texte", () => {
    expect(fieldCount("a".repeat(1799), ANNOUNCEMENT_BODY_MAX).near).toBe(false);
    expect(fieldCount("a".repeat(1800), ANNOUNCEMENT_BODY_MAX).near).toBe(true);
    expect(fieldCount("a".repeat(2000), ANNOUNCEMENT_BODY_MAX).near).toBe(true);
    expect(fieldCount("a".repeat(1800), ANNOUNCEMENT_BODY_MAX).text.replace(/\s/g, " ")).toBe("1 800 sur 2 000");
  });

  it("compte un émoji en deux à la frontière du jaune", () => {
    const party = String.fromCodePoint(0x1f389);
    expect(fieldCount(`${"a".repeat(106)}${party}`, ANNOUNCEMENT_TITLE_MAX).near).toBe(true);
    expect(fieldCount(`${"a".repeat(105)}${party}`, ANNOUNCEMENT_TITLE_MAX).near).toBe(false);
  });
});

describe("le texte et le lien d'une annonce", () => {
  it("tient l'extrait sur une ligne", () => {
    expect(announcementExcerpt("  Rendez-vous à 21 h.\n\nSur le vocal.  ")).toBe("Rendez-vous à 21 h. Sur le vocal.");
    expect(announcementExcerpt("Une\tligne\r\nsuivie")).toBe("Une ligne suivie");
  });
  it("donne le nom du site d'un lien en https", () => {
    expect(announcementLink("https://www.example.org/tournoi?x=1")).toEqual({ href: "https://www.example.org/tournoi?x=1", host: "example.org" });
    expect(announcementLink("https://discord.gg/abc")).toEqual({ href: "https://discord.gg/abc", host: "discord.gg" });
  });
  it("refuse un lien absent ou qui n'est pas en https", () => {
    expect(announcementLink(null)).toBeNull();
    expect(announcementLink("")).toBeNull();
    expect(announcementLink("http://example.org")).toBeNull();
    expect(announcementLink("javascript:alert(1)")).toBeNull();
    expect(announcementLink("https://exa mple.org")).toBeNull();
  });
});

describe("le nombre d'annonces", () => {
  it("s'accorde", () => {
    expect(announcementCount(1)).toBe("1 annonce");
    expect(announcementCount(8)).toBe("8 annonces");
    expect(announcementCount(50)).toBe("50 annonces");
  });
  it("signale une liste peut-être coupée à 50", () => {
    expect(announcementsCapped(0)).toBe(false);
    expect(announcementsCapped(49)).toBe(false);
    expect(announcementsCapped(50)).toBe(true);
  });
});
