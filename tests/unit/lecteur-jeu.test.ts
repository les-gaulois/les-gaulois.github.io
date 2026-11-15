import { describe, expect, it } from "vitest";
import {
  adresseDuLecteur,
  adresseJsDelivr,
  commandeDeConstruction,
  dependanceHorsRegistre,
  dossierDuLecteur,
  drapeauxDeLaFiche,
  ficheNettoyee,
  IMAGE_DU_LECTEUR,
  MANIFESTE_DU_JEU,
  MANIFESTE_DU_SITE,
  manifesteDuLecteur,
  noticeDuLecteur,
  origineDuLecteur,
  pageDuLecteur,
  regleDeSecurite,
  svgRepris,
} from "../../src/lib/rejeu/lecteur-jeu";

const COMMIT = "8b5d071eed95f07c701b32e4c64e95b03f8577c1";

/** Un modèle de page dans la forme de celui du jeu (static/index.html), avec ses scripts de publicité et de mesure. */
const MODELE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title data-i18n="main.title">OpenFront (ALPHA)</title>
    <meta name="description" content="OpenFront est un jeu" />
    <meta property="og:title" content="OpenFront" />
    <link rel="manifest" href="<%- manifestHref %>" />
    <link rel="preconnect" href="https://www.googletagmanager.com" />
    <link rel="dns-prefetch" href="//cdn.intergient.com" />
    <link rel="modulepreload" crossorigin href="/jeu/8b5d071eed/assets/vendor-abc.js" />
    <script type="application/ld+json">{"@type":"VideoGame","name":"OpenFront"}</script>
    <script>
      window.BOOTSTRAP_CONFIG = {
        gitCommit: <%- gitCommit %>,
        assetManifest: <%- assetManifest %>,
        cdnBase: <%- cdnBase %>,
        gameEnv: <%- gameEnv %>,<%- typeof cluster !== "undefined" && cluster ? "\\n cluster: " + cluster + "," : "" %>
        turnstileSiteKey: <%- turnstileSiteKey %>,
        jwtAudience: <%- jwtAudience %>,
        instanceId: <%- instanceId %>,
      };
    </script>
    <script>function __loadThirdPartyScript(src) { var s = document.createElement("script"); s.src = src; document.head.appendChild(s); }</script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <script src="//cdn.ailleurs.example/x.js"></script>
    <script id="HgWESkOz" data-cfasync="false">(function(){ new WebSocket("wss://ailleurs") })()</script>
    <script>window.googletag = window.googletag || { cmd: [] };</script>
    <script>__loadThirdPartyScript("https://www.googletagmanager.com/gtag/js?id=AW-1");</script>
    <script>window.dataLayer = window.dataLayer || []; function gtag() { dataLayer.push(arguments); }</script>
    <script type="module" crossorigin src="/jeu/8b5d071eed/assets/index-abc.js"></script>
    <script>window.addEventListener("load", function () { document.documentElement.classList.remove("preload"); });</script>
  </head>
  <body>
    <div style="background-image: url('<%- backgroundImageUrl %>')"></div>
    <script>__loadThirdPartyScript("https://static.cloudflareinsights.com/beacon.min.js");</script>
    <footer><script data-cfasync="false">__loadThirdPartyScript("//cdn.intergient.com/ramp.js");</script></footer>
  </body>
</html>`;

const VALEURS = { commit: COMMIT, manifeste: { "atlases/icon-atlas.png": adresseJsDelivr(COMMIT, "atlases/icon-atlas.png") }, apiHost: "/jeu/api", retour: "https://les-gaulois.github.io/revoir", notice: "/jeu/LISEZ-MOI.txt" };

describe("le vrai lecteur du jeu : où il vit, d'où il lit", () => {
  it("vit sur une adresse à lui, jamais celle du clan, et range chaque version dans son dossier", () => {
    expect(origineDuLecteur("gal-replay.github.io")).toBe("https://gal-replay.github.io");
    expect(origineDuLecteur("https://gal-replay.github.io/")).toBe("https://gal-replay.github.io");
    expect(origineDuLecteur("")).toBeNull();
    expect(origineDuLecteur(undefined)).toBeNull();
    expect(origineDuLecteur("https://ailleurs.example")).toBeNull();
    expect(origineDuLecteur("gal-replay.github.io/x")).toBeNull();
    expect(origineDuLecteur("les-gaulois.github.io")).toBeNull();
    expect(origineDuLecteur("https://Les-Gaulois.github.io/")).toBeNull();
    expect(dossierDuLecteur(COMMIT)).toBe("jeu/8b5d071eed/");
    expect(() => dossierDuLecteur("../x")).toThrow();
    expect(adresseDuLecteur("https://gal-replay.github.io", COMMIT, "abc123")).toBe("https://gal-replay.github.io/jeu/8b5d071eed/#replay-viewer=abc123");
  });
  it("lit les fichiers du jeu sur jsDelivr, au commit, sauf les SVG, servis par son site, et sans logos de marques", () => {
    const m = manifesteDuLecteur(["atlases/icon-atlas.png", "maps/world/map.bin", "images/CityIconWhite.svg", "images/DiscordLogo.svg", "images/PlutoniumIcon.svg", "icons/github-mark-white.svg", "flags/fr.svg", "public/robots.txt", "../x.png"], COMMIT, "/");
    expect(m["atlases/icon-atlas.png"]).toBe(`https://cdn.jsdelivr.net/gh/openfrontio/OpenFrontIO@${COMMIT}/resources/atlases/icon-atlas.png`);
    expect(m["maps/world/map.bin"]).toBe(`https://cdn.jsdelivr.net/gh/openfrontio/OpenFrontIO@${COMMIT}/resources/maps/world/map.bin`);
    expect(m["images/CityIconWhite.svg"]).toBe("/jeu/8b5d071eed/res/images/CityIconWhite.svg");
    expect(m["flags/fr.svg"]).toBe("/jeu/drapeaux/fr.svg");
    for (const ecarte of ["images/DiscordLogo.svg", "images/PlutoniumIcon.svg", "icons/github-mark-white.svg", "public/robots.txt", "../x.png"]) expect(m[ecarte]).toBeUndefined();
    expect(svgRepris("images/ShieldIconWhite.svg")).toBe(true);
    expect(svgRepris("images/GoogleLogo.svg")).toBe(false);
    expect(svgRepris("icons/wiki-logo.svg")).toBe(false);
    expect(svgRepris("icons/discord.svg")).toBe(false);
    // Les logos et les icônes de l'application, quel que soit leur format, n'ont pas d'adresse ; les images du jeu gardent la leur.
    const autres = manifesteDuLecteur(["icons/icon512_maskable.png", "images/OfmWintersLogo.png", "manifest.json", "images/CrownIcon.png", "sounds/x.mp3"], COMMIT, "/");
    expect(Object.keys(autres).sort()).toEqual(["images/CrownIcon.png", "sounds/x.mp3"]);
    expect(manifesteDuLecteur(["a b.png"], COMMIT, "/")["a b.png"]).toContain("a%20b.png");
  });
  it("n'installe que des bibliothèques du registre npm, et les paquets du dépôt du jeu lui-même", () => {
    const verrou = (paquets: Record<string, unknown>) => JSON.stringify({ packages: { "": { name: "openfront" }, ...paquets } });
    const registre = { resolved: "https://registry.npmjs.org/vite/-/vite-7.0.0.tgz", integrity: "sha512-x" };
    expect(dependanceHorsRegistre(verrou({ "node_modules/vite": registre, "node_modules/@of/shared": { resolved: "packages/shared", link: true }, packages: {} }))).toBeNull();
    expect(dependanceHorsRegistre(verrou({ "node_modules/x": { resolved: "git+ssh://git@github.com/a/b.git#abc" } }))).toBe("node_modules/x");
    expect(dependanceHorsRegistre(verrou({ "node_modules/y": { resolved: "https://ailleurs.example/y.tgz" } }))).toBe("node_modules/y");
    expect(dependanceHorsRegistre(verrou({ "node_modules/z": { resolved: "../hors-du-depot", link: true } }))).toBe("node_modules/z");
    expect(dependanceHorsRegistre(verrou({ "node_modules/w": { resolved: "file:/tmp/w.tgz" } }))).toBe("node_modules/w");
    expect(dependanceHorsRegistre(JSON.stringify({ lockfileVersion: 3 }))).not.toBeNull();
  });
  it("le construit dans un conteneur Node 24 sans réseau ni droits, à la base de son dossier", () => {
    const args = commandeDeConstruction("/w/construction", COMMIT, "lecteur-x");
    for (const option of ["run", "--rm", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534"]) expect(args).toContain(option);
    expect(IMAGE_DU_LECTEUR).toMatch(/^node:24[\w.-]*@sha256:[0-9a-f]{64}$/);
    expect(args.filter((a) => a.startsWith("--volume="))).toEqual(["--volume=/w/construction:/jeu"]);
    expect(args.filter((a) => a.startsWith("--env="))).toEqual(["--env=GAME_ENV=prod", "--env=GAL_MANIFEST=/jeu/gal-manifest.json", "--env=HOME=/tmp"]);
    // Ce qu'elle crée reste effaçable par le workflow ; la base est passée en argument, jamais collée dans la commande.
    expect(args.slice(-4)).toEqual(["sh", "-c", 'umask 0000 && exec node node_modules/vite/bin/vite.js build --base "$0"', "/jeu/8b5d071eed/"]);
  });
});

describe("la page du lecteur", () => {
  const page = pageDuLecteur(MODELE, VALEURS);
  it("garde la configuration, le code du jeu et ses petits scripts d'affichage", () => {
    expect(page).toContain(`gitCommit: "${COMMIT}"`);
    expect(page).toContain('jwtAudience: "localhost"');
    expect(page).toContain('src="/jeu/8b5d071eed/assets/index-abc.js"');
    expect(page).toContain('href="/jeu/8b5d071eed/assets/vendor-abc.js"');
    expect(page).toContain('classList.remove("preload")');
    expect(page).not.toContain("<%");
  });
  it("retire tous les scripts de publicité et de mesure, et ce qui présente la page comme le jeu officiel", () => {
    for (const marque of ["googletag", "gtag", "dataLayer", "intergient", "cloudflareinsights", "challenges.cloudflare.com", "cdn.ailleurs.example", "HgWESkOz", "wss://ailleurs", "__loadThirdPartyScript", "ld+json", "og:title", "OpenFront (ALPHA)", 'rel="manifest"', "preconnect", "dns-prefetch", "data-i18n"]) expect(page).not.toContain(marque);
    expect(page).toContain("<title>Revoir une partie · [GAL] Les Gaulois</title>");
  });
  it("empêche le jeu de remettre son titre, et renvoie au site du clan sans partie choisie", () => {
    const tete = page.slice(0, page.indexOf("BOOTSTRAP_CONFIG"));
    expect(tete).toContain('Object.defineProperty(document, "title"');
    expect(tete).toContain('location.replace("https://les-gaulois.github.io/revoir")');
    expect(tete).toContain("#replay-viewer=");
  });
  it("pose la règle de sécurité, limitée au dépôt du jeu, le refus des moteurs de recherche et l'adresse des fiches avant tout script", () => {
    const tete = page.slice(0, page.indexOf("BOOTSTRAP_CONFIG"));
    const regle = regleDeSecurite(COMMIT);
    expect(tete).toContain(`content="${regle}"`);
    expect(tete).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(tete).toContain('localStorage.setItem("apiHost"');
    expect(regle).toContain(`connect-src 'self' https://cdn.jsdelivr.net/gh/openfrontio/OpenFrontIO@${COMMIT}/`);
    expect(regle).not.toMatch(/googletag|intergient|cloudflare|\*|https:\/\/cdn\.jsdelivr\.net[ ;]/);
  });
  it("écrit le bandeau du site en français : retour, version non officielle, « © OpenFront and Contributors », licences", () => {
    const bandeau = /<div id="gal-bandeau" lang="fr">[\s\S]*?<\/div>/.exec(page)?.[0] ?? "";
    const texte = (b: string) => b.replace(/<[^>]+>/g, "");
    expect(texte(bandeau)).toBe("← Revoir une partie · lecteur de replay d'OpenFront, code libre (AGPL-3.0), modifié par le clan [GAL], non officiel · © OpenFront and Contributors · licences et sources");
    // Sur un téléphone, les morceaux longs se cachent : le retour, « modifié », « non officiel », le © et les licences restent.
    expect(texte(bandeau.replace(/<span class="gal-long">[^<]*<\/span>/g, ""))).toBe("← Revoir une partie · modifié, non officiel · © OpenFront and Contributors · licences");
    expect(page).toMatch(/@media \(max-width:40rem\)\{[^}]*bottom:3rem[^}]*\}#gal-bandeau \.gal-long\{display:none\}\}/);
    expect(page).toContain('href="https://les-gaulois.github.io/revoir"');
    expect(page).toContain('href="/jeu/LISEZ-MOI.txt"');
  });
  it("pose la règle de sécurité juste après l'encodage, avant tout ce qui charge quelque chose", () => {
    expect(page.indexOf('<meta charset="UTF-8" />')).toBeLessThan(page.indexOf("Content-Security-Policy"));
    expect(page.slice(0, page.indexOf("Content-Security-Policy"))).not.toMatch(/<(script|link|style|img)\b/i);
  });
  it("refuse un modèle qu'il ne sait pas remplir, ou où la règle de sécurité arriverait trop tard", () => {
    expect(() => pageDuLecteur("<html><head></head><body></body></html>", VALEURS)).toThrow("modèle");
    expect(() => pageDuLecteur(MODELE.replace("<head>", "<head><head>"), VALEURS)).toThrow("<head>");
    expect(() => pageDuLecteur(MODELE.replace("</body>", "</body></body>"), VALEURS)).toThrow("</body>");
    expect(() => pageDuLecteur(MODELE.replace("<head>", '<script src="/jeu/x.js"></script><head>'), VALEURS)).toThrow("avant la règle");
    // Une tête avec des attributs reçoit la règle aussitôt ouverte, avant ce qu'elle contient.
    expect(pageDuLecteur(MODELE.replace("<head>", '<head lang="en"><img src="/x.png">'), VALEURS)).toMatch(/<head lang="en">\s*<meta http-equiv="Content-Security-Policy"[^>]*>[\s\S]*<img src="\/x.png">/);
    // Une balise dans un commentaire ne trompe pas les contrôles.
    expect(pageDuLecteur(MODELE.replace("<head>", "<!-- <head> </body> --><head>"), VALEURS)).toContain("Content-Security-Policy");
  });
  it("cite les commits, les licences et l'exception des tribus dans sa notice", () => {
    const notice = noticeDuLecteur([COMMIT]);
    expect(notice).toContain(COMMIT);
    expect(notice).toContain("AGPL-3.0");
    expect(notice).toContain("CC BY-SA 4.0");
    expect(notice).toContain("© OpenFront and Contributors");
    expect(notice).toContain("tribus");
    // La modification du code du jeu est écrite en entier : la ligne avant, la ligne après.
    expect(notice).toContain(`avant : ${MANIFESTE_DU_JEU}`);
    expect(notice).toContain(`après : ${MANIFESTE_DU_SITE}`);
  });
});

describe("la fiche publiée", () => {
  const fiche = JSON.stringify({
    gitCommit: COMMIT,
    info: {
      gameID: "abc123",
      tribes: [{ name: "Les <b>Bretons</b> & co", color: "#fff", extra: { prix: 9 } }],
      players: [
        { clientID: "a", username: "Vercingé", clanTag: "GAL", publicID: "PUB1", persistentID: "PERS1", cosmetics: { flag: "/flags/fr.svg", pattern: { name: "x", patternData: "AAA" }, crown: { url: "https://cdn.ofedge.io/x" } }, stats: { attacks: [] } },
        { clientID: "b", username: "Autre", publicID: "PUB2", cosmetics: { pattern: { name: "y" } } },
      ],
    },
    turns: [{ turnNumber: 0, intents: [] }],
  });
  it("retire l'identifiant public, vide l'identifiant persistant, et ne garde des cosmétiques que le drapeau", () => {
    const propre = JSON.parse(ficheNettoyee(fiche, "abc123"));
    expect(propre.info.players[0]).toEqual({ clientID: "a", username: "Vercingé", clanTag: "GAL", persistentID: null, cosmetics: { flag: "/flags/fr.svg" }, stats: { attacks: [] } });
    expect(propre.info.players[1]).toEqual({ clientID: "b", username: "Autre", persistentID: null });
    expect(propre.turns).toEqual([{ turnNumber: 0, intents: [] }]);
    expect(JSON.stringify(propre)).not.toMatch(/PUB1|PUB2|PERS1|ofedge|patternData/);
  });
  it("ne garde des tribus que le nom, et échappe ce qui pourrait se lire comme du HTML", () => {
    const texte = ficheNettoyee(fiche, "abc123");
    expect(texte).not.toMatch(/[<>&]/);
    expect(JSON.parse(texte).info.tribes).toEqual([{ name: "Les <b>Bretons</b> & co" }]);
  });
  it("donne les drapeaux de ses joueurs, et rien d'autre", () => {
    expect(drapeauxDeLaFiche(ficheNettoyee(fiche, "abc123"))).toEqual(["fr.svg"]);
  });
  it("refuse la fiche d'une autre partie, et un drapeau qui n'est pas un fichier du jeu", () => {
    expect(() => ficheNettoyee(fiche, "autre")).toThrow("autre partie");
    const drapeau = JSON.stringify({ info: { gameID: "p", players: [{ cosmetics: { flag: "https://ailleurs/x.svg" } }] } });
    expect(JSON.parse(ficheNettoyee(drapeau, "p")).info.players[0]).toEqual({ persistentID: null });
  });
});
