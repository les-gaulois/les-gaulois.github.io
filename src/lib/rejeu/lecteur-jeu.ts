/**
 * Le vrai lecteur de replay d'OpenFront (demande du pilote du 15 novembre 2026 : « tu peux pas me faire une version copie-collé
 * de ce qui existe déjà », « je veux reconnaître le jeu »). OpenFront interdit d'encadrer son site (docs/API_AUDIT.md) : le site
 * construit lui-même le lecteur du jeu (`src/client/replay/`, `<replay-viewer>`), à partir de son code libre (AGPL-3.0,
 * https://github.com/openfrontio/OpenFrontIO), à la version de chaque partie, et le sert avec la fiche de la partie.
 *
 * **Sur une autre adresse que le site** (choix du pilote du 15 novembre 2026, après relecture) : le code du jeu, et chaque
 * nouvelle version construite sans relecture, ne doit jamais tourner là où les membres ont leur connexion (stockage local de
 * les-gaulois.github.io). Le lecteur est préparé par le job « build » du workflow du site, puis déposé par le job « lecteur » sur
 * un second site GitHub Pages, à lui seul (`REPLAY_SITE`, par exemple `gal-replay.github.io`). Le site du clan le montre dans un
 * cadre (`<iframe>` sous `sandbox`, sans navigation de sa page ni formulaires) : un autre site (github.io est sur la liste
 * publique des suffixes), donc sans accès à la connexion ni au stockage du site du clan.
 *
 * Retiré de la page du jeu : tous les scripts de publicité et de mesure (Google, Playwire/RAMP, AdShield, CrazyGames, Turnstile,
 * Cloudflare Insights), ses balises qui la présentent comme le jeu officiel, et son titre « OpenFront », que le jeu ne peut plus
 * remettre (conditions ajoutées à sa licence, section 7 : pas de titre « OpenFront » pour une version modifiée, « © OpenFront and
 * Contributors » visible). Sans partie choisie, la page renvoie vers « Revoir une partie » : l'accueil du jeu (boutique,
 * connexion) n'est jamais montré. Une règle de sécurité du navigateur (CSP) n'autorise que l'adresse du lecteur et les fichiers
 * du dépôt du jeu sur GitHub : aucune publicité ni mesure ne peut se charger. Retiré de la fiche : l'identifiant public et
 * persistant de chaque joueur (un anonyme ne doit pas être reconnaissable, CLAUDE.md) et ses cosmétiques payants (propriété
 * d'OpenFront), sauf son drapeau, fichier libre du jeu ; des tribus de robots ne reste que le nom, dont le moteur a besoin pour
 * rejouer la partie (noms achetés en boutique : l'exception est dite dans la notice). Les pseudos restent, comme dans le jeu :
 * choix du pilote du 15 novembre 2026. Les tags de clan aussi, même libres (choix du pilote du 16 novembre 2026) : c'est la seule
 * exception à la règle du site, qui n'affiche ailleurs que les tags de la liste officielle ; elle vaut pour ce lecteur, sur son
 * site à part et non indexé, jamais pour les pages du site du clan ni pour les films.
 */

import { VITESSE_D_OFFICE } from "./fiche-du-lecteur";

/** Le dépôt du jeu, et ce que le site en prend pour construire le lecteur : tout, sauf les fichiers propriétaires, les cartes et les outils. */
export const DEPOT_DU_JEU = "https://github.com/openfrontio/OpenFrontIO.git";
export const MOTIFS_DU_LECTEUR = ["/*", "!/proprietary/", "!/map-generator/", "!/resources/maps/", "!/tests/", "!/.npmrc"] as const;

/**
 * Les bibliothèques du jeu viennent toutes du registre public de npm : `npm ci` les installe sur la machine du workflow, hors du
 * conteneur, et une dépendance tirée de Git ou d'une autre adresse pourrait y faire tourner du code. Les paquets du dépôt lui-même
 * (liens vers un de ses dossiers) restent permis. Rend le nom du premier paquet qui vient d'ailleurs, `null` si aucun.
 */
export function dependanceHorsRegistre(verrou: string): string | null {
  const lu = JSON.parse(verrou) as { packages?: Record<string, { resolved?: unknown; link?: unknown }> };
  if (!lu.packages || typeof lu.packages !== "object") return "(verrou sans paquets)";
  for (const [nom, p] of Object.entries(lu.packages)) {
    if (p.resolved === undefined) continue;
    if (typeof p.resolved !== "string") return nom || "(racine)";
    if (p.resolved.startsWith("https://registry.npmjs.org/")) continue;
    if (p.link === true && /^[A-Za-z0-9_@./-]+$/.test(p.resolved) && !p.resolved.split("/").includes("..") && !p.resolved.startsWith("/")) continue;
    return nom || "(racine)";
  }
  return null;
}

/** Le dossier du lecteur d'une version du jeu, sous la racine du site du lecteur : `jeu/<10 premiers caractères du commit>/`. */
export function dossierDuLecteur(commit: string): string {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("commit inattendu");
  return `jeu/${commit.slice(0, 10)}/`;
}
/** Les lecteurs construits, gardés par le cache du workflow (`scripts/construire-lecteurs.ts`). */
export const DOSSIER_DES_LECTEURS = ".cache/lecteurs";
/** Le site du lecteur, prêt à déposer sur son adresse à lui : jamais dans `public/`, donc jamais sur le site du clan. */
export const DOSSIER_SITE_DU_LECTEUR = ".cache/site-du-lecteur";
/** Les drapeaux du jeu, communs à toutes les versions : un seul exemplaire. */
export const DOSSIER_DES_DRAPEAUX = "jeu/drapeaux/";
/** Les fiches des parties, lues par le lecteur à `<apiHost>/game/<partie>` : un dossier par partie, servi par son index.html. */
export const DOSSIER_DES_FICHES = "jeu/api/";

/** Le site du clan : le lecteur n'y vit jamais. */
export const SITE_DU_CLAN = "https://les-gaulois.github.io";

/**
 * L'adresse du site du lecteur, d'après `REPLAY_SITE` (`gal-replay.github.io`, ou une adresse complète). `null` : pas réglé,
 * ou pas l'adresse d'un autre site GitHub Pages.
 */
export function origineDuLecteur(reglage: string | undefined): string | null {
  const v = (reglage ?? "").trim().replace(/\/+$/, "").toLowerCase();
  if (!v) return null;
  const adresse = /^https:\/\//.test(v) ? v : `https://${v}`;
  return /^https:\/\/[a-z0-9-]+\.github\.io$/.test(adresse) && adresse !== SITE_DU_CLAN ? adresse : null;
}

/** Le lien du vrai lecteur pour une partie. Sa fiche, que la page demande avant de le montrer : `fiche-du-lecteur.ts`. */
export function adresseDuLecteur(origine: string, commit: string, partie: string): string {
  return `${origine}/${dossierDuLecteur(commit)}#replay-viewer=${encodeURIComponent(partie)}`;
}

/**
 * Les fichiers du dépôt du jeu, au commit, lus tels quels sur GitHub (raw.githubusercontent.com, CORS ouvert). Jusqu'au
 * 17 novembre 2026, ils venaient de jsDelivr, qui refuse les fichiers d'un dépôt de plus de 50 Mo qu'il n'a pas déjà gardés
 * (et tout fichier de plus de 20 Mo), tantôt oui, tantôt non selon le serveur qui répond : des replays ne s'ouvraient pas, et
 * le lien de secours du jeu menait à une page « 404 ». Ces adresses sont aussi écrites dans le code construit du lecteur : un
 * lecteur d'avant la recette 5 (`RECETTE_DES_FICHIERS_SUR_GITHUB`) garde jsDelivr, page et règle de sécurité comprises, le temps
 * d'être refait.
 */
export const RECETTE_DES_FICHIERS_SUR_GITHUB = 5;
export const racineDuDepot = (commit: string, recette: number = RECETTE_DES_FICHIERS_SUR_GITHUB) =>
  recette >= RECETTE_DES_FICHIERS_SUR_GITHUB ? `https://raw.githubusercontent.com/openfrontio/OpenFrontIO/${commit}/` : `https://cdn.jsdelivr.net/gh/openfrontio/OpenFrontIO@${commit}/`;
/** Un fichier de `resources/` du jeu, au commit, sur GitHub (sur jsDelivr pour un lecteur d'avant la recette 5). */
export function adresseDuDepot(commit: string, chemin: string, recette?: number): string {
  return `${racineDuDepot(commit, recette)}resources/${chemin.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Les fichiers du jeu que le site ne reprend pas : les logos (Discord, Google, GitHub, wiki, tournois, OpenFront), les icônes de
 * l'application et son manifeste, la monnaie payante du jeu (Plutonium), le dossier `public/` (dossier de presse) et tout chemin
 * qui remonterait. Le lecteur s'en passe : ils ne servent qu'à l'accueil, à la connexion et à la boutique.
 */
const ECARTES = /(^|\/)[^/]*(logo|plutonium|discord|github-mark|openfront|favicon)[^/]*$|(^|\/)OF\.svg$|^icons\/icon\d|^manifest\.json$/i;
export const fichierRepris = (chemin: string) => !chemin.startsWith("public/") && !chemin.split("/").includes("..") && !ECARTES.test(chemin);
export const svgRepris = (chemin: string) => chemin.endsWith(".svg") && fichierRepris(chemin);

/**
 * Le manifeste des fichiers du lecteur : pour chaque fichier de `resources/` (chemin relatif), son adresse. Les images SVG sont
 * servies par le site du lecteur (GitHub les donne en texte, que les navigateurs refusent d'afficher) : les drapeaux dans un
 * dossier commun, les autres avec le lecteur ; celles que le site ne reprend pas n'ont pas d'adresse. Tout le reste vient de
 * GitHub, au commit. `base` : la racine du site du lecteur (`/`). `recette` : celle du lecteur à qui la page est destinée.
 */
export function manifesteDuLecteur(fichiers: readonly string[], commit: string, base: string, recette?: number): Record<string, string> {
  const racine = base.endsWith("/") ? base : `${base}/`;
  const dossier = dossierDuLecteur(commit);
  const manifeste: Record<string, string> = {};
  for (const f of fichiers) {
    if (!fichierRepris(f)) continue;
    if (f.startsWith("flags/") && f.endsWith(".svg")) manifeste[f] = `${racine}${DOSSIER_DES_DRAPEAUX}${f.slice("flags/".length)}`;
    else if (f.endsWith(".svg")) {
      if (svgRepris(f)) manifeste[f] = `${racine}${dossier}res/${f}`;
    } else manifeste[f] = adresseDuDepot(commit, f, recette);
  }
  return manifeste;
}

/** Les seules adresses que la page du lecteur peut joindre : la sienne et les fichiers du dépôt du jeu, au commit, sur GitHub. */
export function regleDeSecurite(commit: string, recette?: number): string {
  const jeu = racineDuDepot(commit, recette);
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${jeu}`,
    `font-src 'self' data: ${jeu}`,
    `connect-src 'self' ${jeu}`,
    `media-src 'self' blob: ${jeu}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
}

/** Les marques des scripts de publicité ou de mesure, et des balises qui présentent la page comme le jeu officiel. */
const SCRIPTS_RETIRES = /googletag|gtag|dataLayer|ramp|intergient|cloudflareinsights|crazygames|turnstile|HgWESkOz|__loadThirdPartyScript|__onViverse|application\/ld\+json/i;
const TITRE = "Revoir une partie · [GAL] Les Gaulois";

export interface ValeursDeLaPage {
  commit: string;
  manifeste: Record<string, string>;
  /** L'adresse où le lecteur lit les fiches : `<apiHost>/game/<partie>`. Un chemin commençant par « / » part de la page. */
  apiHost: string;
  /** Les liens du bandeau : retour à « Revoir une partie » (sur le site du clan), notice de licence. */
  retour: string;
  notice: string;
  /** La recette du lecteur construit : avant la 5, son code lit encore les fichiers du jeu sur jsDelivr. Sans elle, celle du jour. */
  recette?: number;
}

/**
 * La page du lecteur, à partir du modèle que construit le jeu (`static/index.html`, rempli d'ordinaire par son serveur,
 * src/server/RenderHtml.ts) : les valeurs posées, les scripts de publicité et de mesure retirés, la règle de sécurité, le titre
 * et le bandeau du site ajoutés. Lève une erreur si le modèle ne ressemble plus à ce que le site sait remplir.
 */
export function pageDuLecteur(modele: string, v: ValeursDeLaPage): string {
  if (!modele.includes("window.BOOTSTRAP_CONFIG")) throw new Error("modèle du lecteur inattendu");
  // Le modèle vient d'une construction faite sans relecture : chaque balise que le site complète doit y être une seule fois, et
  // ses commentaires partent, pour qu'une balise écrite dans un commentaire ne trompe pas ces contrôles.
  modele = modele.replace(/<!--[\s\S]*?-->/g, "");
  for (const [nom, motif] of [
    ["<head>", /<head\b[^>]*>/gi],
    ["</head>", /<\/head\s*>/gi],
    ["</body>", /<\/body\s*>/gi],
  ] as const) {
    if ((modele.match(motif) ?? []).length !== 1) throw new Error(`modèle du lecteur inattendu (${nom})`);
  }
  if ((modele.match(/<title\b/gi) ?? []).length > 1) throw new Error("modèle du lecteur inattendu (<title>)");
  const valeurs: Record<string, string> = {
    gitCommit: JSON.stringify(v.commit),
    assetManifest: JSON.stringify(v.manifeste).replace(/</g, "\\u003c"),
    cdnBase: JSON.stringify(""),
    cdnBaseRaw: "",
    gameEnv: JSON.stringify("prod"),
    turnstileSiteKey: JSON.stringify("1x00000000000000000000AA"),
    jwtAudience: JSON.stringify("localhost"),
    instanceId: JSON.stringify(""),
  };
  // Les emplacements simples prennent leur valeur ; les autres (images de partage, logos, options d'un serveur) restent vides.
  let page = modele.replace(/<%-\s*([A-Za-z]+)\s*%>/g, (_, nom: string) => valeurs[nom] ?? "");
  page = page.replace(/<%[\s\S]*?%>/g, "");
  // Les scripts de publicité, de mesure et de présentation du jeu officiel ; un script venu d'ailleurs (`https:`, `//`).
  page = page.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tout, attributs: string, corps: string) => {
    const src = /\bsrc="([^"]*)"/i.exec(attributs)?.[1];
    if (src !== undefined && (!src.startsWith("/") || src.startsWith("//"))) return "";
    // La configuration du jeu reste : elle nomme la clé de Turnstile, sans le charger.
    if (src === undefined && /^\s*window\.BOOTSTRAP_CONFIG\s*=/.test(corps)) return tout;
    if (SCRIPTS_RETIRES.test(attributs) || SCRIPTS_RETIRES.test(corps)) return "";
    return tout;
  });
  // Les balises de partage, de préchargement chez d'autres et le titre du jeu officiel (même avec ses attributs).
  page = page.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, "");
  page = page.replace(/<meta\s+(?:property|name)="(?:og:|twitter:|description|keywords|application-name|apple-mobile-web-app-title)[^"]*"[^>]*>/gi, "");
  page = page.replace(/<link\s+[^>]*rel="(?:manifest|icon|canonical|apple-touch-icon|shortcut icon)"[^>]*>/gi, "");
  page = page.replace(/<link\s+[^>]*rel="(?:preconnect|dns-prefetch|preload|prefetch|modulepreload)"[^>]*>/gi, (lien) => (/href="\/(?!\/)/.test(lien) ? lien : ""));
  if (/googletag|intergient|cloudflareinsights|crazygames/i.test(page.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/gi, ""))) throw new Error("un script de publicité ou de mesure reste dans la page");
  const regle = `<meta http-equiv="Content-Security-Policy" content="${regleDeSecurite(v.commit, v.recette)}">`;
  const tete = [
    regle,
    `<meta name="robots" content="noindex, nofollow">`,
    `<meta name="referrer" content="no-referrer">`,
    `<title>${TITRE}</title>`,
    // Sans partie choisie, pas d'accueil du jeu : retour à « Revoir une partie ».
    `<script>if (!/^#replay-viewer=[A-Za-z0-9]+$/.test(location.hash)) location.replace(${JSON.stringify(v.retour)});</script>`,
    `<script>try { localStorage.setItem("apiHost", ${JSON.stringify(v.apiHost)}.replace(/^\\//, location.origin + "/")); } catch (e) {}</script>`,
    // Le jeu remet son titre en changeant de langue : le titre du site reste.
    `<script>try { Object.defineProperty(document, "title", { configurable: false, get: function () { return ${JSON.stringify(TITRE)}; }, set: function () {} }); } catch (e) {}</script>`,
    // La lecture, confiée par le jeu une fois la partie prête (retouche de ReplayViewer.ts) : d'office en × 8 quand le lien le
    // demande (`?lecture=8`, posé par « Revoir une partie »), jamais pour qui veut moins d'animations ; en pause quand le site du
    // clan, et lui seul, le demande (bouton pause de son en-tête). La demande est écoutée dès le chargement : arrivée pendant que
    // le jeu prépare la partie, elle empêche la lecture d'office. Depuis le 17 novembre 2026, pour le journal « Entre
    // Gaulois » posé à côté du cadre (src/lib/rejeu/journal.ts) : encadrée, la page dit au site du clan, et à lui seul, à quelle étape
    // en est le replay (quatre fois par seconde, quand elle a changé), et y va quand il le demande (clic sur l'heure d'une ligne).
    `<script>(function () { var pause = false, lecture = null, clan = ${JSON.stringify(new URL(v.retour).origin)}; addEventListener("message", function (e) { if (e.origin !== clan || !e.data) return; if (e.data.gal === "aller") { if (lecture && typeof e.data.etape === "number" && e.data.etape >= 0 && e.data.etape < 1e7) { try { lecture.seek(Math.floor(e.data.etape)); } catch (x) {} } return; } if (e.data.gal !== "pause") return; pause = true; if (lecture) lecture.pause(); }); window.galLecture = function (l) { lecture = l; try { if (!pause && new URLSearchParams(location.search).get("lecture") === "${VITESSE_D_OFFICE}" && !matchMedia("(prefers-reduced-motion: reduce)").matches) { l.setSpeed(${VITESSE_D_OFFICE}); l.play(); } } catch (e) {} try { if (window.parent && window.parent !== window) { var dite = null; window.setInterval(function () { var etape = l.frame; if (typeof etape !== "number" || etape === dite) return; dite = etape; window.parent.postMessage({ gal: "temps", etape: etape }, clan); }, 250); } } catch (e) {} }; })();</script>`,
    // Encadrée dans « Revoir une partie » (depuis le 16 novembre 2026, demande du pilote : « met le replay sur cette page »), la
    // page le sait : le retour vers cette même page et les morceaux longs du bandeau se cachent.
    `<script>try { if (window.top !== window.self) document.documentElement.classList.add("gal-encadre"); } catch (e) { document.documentElement.classList.add("gal-encadre"); }</script>`,
    // Le bandeau, en haut à droite, où le jeu ne met rien. Sur un téléphone, le classement du jeu prend tout le haut et sa
    // frise tout le bas (44 px) : le bandeau, plus court, se pose juste au-dessus de la frise, à gauche, sans couvrir de commande.
    `<style>#gal-bandeau{position:fixed;top:0;right:0;z-index:2147483647;max-width:min(36rem,100vw);padding:.35rem .6rem;font:12px/1.35 system-ui,sans-serif;color:#e8ecf8;background:rgba(10,18,48,.86);border-bottom-left-radius:.4rem}#gal-bandeau a{color:#9dbcff}#gal-bandeau .gal-retour{font-weight:700}@media (max-width:40rem){#gal-bandeau{top:auto;right:auto;bottom:3rem;left:0;max-width:min(20rem,100vw);border-radius:0 .4rem .4rem 0}#gal-bandeau .gal-long{display:none}}.gal-encadre #gal-bandeau .gal-long,.gal-encadre #gal-bandeau .gal-retour-bloc{display:none}</style>`,
  ].join("\n    ");
  // Juste après l'encodage s'il ouvre la tête, sinon tout en haut de la tête : avant tout ce qui charge quelque chose.
  const ouverture = /<head\b[^>]*>(\s*<meta\s+charset=["']?[A-Za-z0-9-]+["']?\s*\/?>)?/i;
  page = page.replace(ouverture, (tout) => `${tout}\n    ${tete}`);
  const avant = page.slice(0, page.indexOf(regle));
  if (page.indexOf(regle) < 0 || /<(script|link|style|img|iframe|object|embed|base|svg|video|audio|source|meta\s+http-equiv)\b/i.test(avant)) throw new Error("modèle du lecteur inattendu (avant la règle de sécurité)");
  const bandeau = [
    `<div id="gal-bandeau" lang="fr">`,
    `<span class="gal-retour-bloc"><a class="gal-retour" href="${v.retour}">← Revoir une partie</a> · </span>`,
    `<span class="gal-long">lecteur de replay d'OpenFront, code libre (AGPL-3.0), </span>modifié<span class="gal-long"> par le clan [GAL]</span>, non officiel · © OpenFront and Contributors · `,
    `<a href="${v.notice}" target="_blank" rel="noopener">licences<span class="gal-long"> et sources</span></a></div>`,
  ].join("");
  page = page.replace(/<\/body\s*>/i, `${bandeau}\n  </body>`);
  return page;
}

/**
 * La construction du lecteur exécute le code du jeu (sa configuration Vite) : dans l'Action, seulement dans ce conteneur, Node 24
 * comme le jeu le demande, image officielle fixée par son empreinte (relevée le 15 novembre 2026), sans réseau, sans droits, et
 * qui ne voit que le dossier de la construction.
 */
export const IMAGE_DU_LECTEUR = "node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54";

/**
 * La commande `docker run` qui construit le lecteur dans `dossier`, déjà rempli (code du jeu, bibliothèques, manifeste). Les
 * fichiers que la construction crée appartiennent à l'utilisateur du conteneur : écrits ouverts à tous (`umask 0000`), pour que le
 * workflow puisse ensuite les copier et les effacer (le 15 novembre 2026, sans cela, `.well-known/` ne s'effaçait pas).
 */
export function commandeDeConstruction(dossier: string, commit: string, nom: string): string[] {
  return [
    "run",
    "--rm",
    `--name=${nom}`,
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--user=65534:65534",
    "--pids-limit=512",
    "--memory=4096m",
    "--tmpfs=/tmp:rw,noexec,nosuid,size=256m",
    `--volume=${dossier}:/jeu`,
    "--workdir=/jeu",
    "--env=GAME_ENV=prod",
    "--env=GAL_MANIFEST=/jeu/gal-manifest.json",
    "--env=HOME=/tmp",
    IMAGE_DU_LECTEUR,
    "sh",
    "-c",
    'umask 0000 && exec node node_modules/vite/bin/vite.js build --base "$0"',
    `/${dossierDuLecteur(commit)}`,
  ];
}

/** La ligne de la configuration du jeu que le site remplace : son manifeste des fichiers, par celui du site (`GAL_MANIFEST`). */
export const MANIFESTE_DU_JEU = "__ASSET_MANIFEST__: JSON.stringify(assetManifest),";
export const MANIFESTE_DU_SITE = '__ASSET_MANIFEST__: process.env.GAL_MANIFEST ? fs.readFileSync(process.env.GAL_MANIFEST, "utf8") : JSON.stringify(assetManifest),';

/**
 * La recette du lecteur : à augmenter quand la façon de le construire change. Un lecteur gardé en cache d'une autre recette se
 * refait au prochain passage du job « films » ; en attendant, il reste publié s'il n'est pas plus ancien que `RECETTE_MINIMALE`
 * (sinon la page dit que le replay de ses parties n'est pas disponible pour l'instant). Un lecteur de la recette 3 n'a pas
 * `galLecture` : en attendant d'être refait, il ne part pas tout seul en × 8 et la pause de l'en-tête ne l'arrête pas.
 * 2 (16 novembre 2026) : la retouche CrazyGames, pour le lecteur encadré dans « Revoir une partie ».
 * 3 (16 novembre 2026) : la carte remplit toujours la vue (caméra du lecteur de replay).
 * 4 (16 novembre 2026) : la lecture confiée à la page du lecteur (`galLecture`), qui la lance d'office en ×8 dans le cadre.
 * 5 (17 novembre 2026) : les fichiers du jeu lus sur GitHub, plus sur jsDelivr, qui en refusait une partie (`racineDuDepot`).
 */
export const RECETTE_DU_LECTEUR = 5;

/**
 * La plus ancienne recette encore publiable. Un lecteur gardé en cache d'une recette plus ancienne que celle du jour, mais pas
 * plus que celle-ci, reste en ligne le temps que le job « films » le refasse : une mise en ligne par un push ne le refait pas,
 * et sans cela les parties repassaient au film pendant une heure (le pilote l'a vu le 16 novembre 2026 : « pourquoi c'est
 * revenu comme avant ? »). À relever quand une recette corrige un défaut qu'on ne veut plus jamais montrer : 3, car la 1 ouvrait
 * « Erreur de connexion ! » dans le cadre et la 2 laissait du gris autour de la carte.
 */
export const RECETTE_MINIMALE = 3;

/** Un lecteur de cette recette peut-il être publié ? Ni trop ancien (`RECETTE_MINIMALE`), ni d'une recette à venir. */
export function recettePubliable(recette: number | null): boolean {
  return recette !== null && recette >= RECETTE_MINIMALE && recette <= RECETTE_DU_LECTEUR;
}

/** La recette lue dans `recette.txt` d'un lecteur construit ; `null` si le fichier manque ou ne dit pas un nombre. */
export function lireRecette(texte: string | null): number | null {
  const t = (texte ?? "").trim();
  return /^\d{1,4}$/.test(t) ? Number(t) : null;
}

/** Une retouche du code du jeu : un passage exact de l'un de ses fichiers, remplacé avant la construction. */
export interface Retouche {
  fichier: string;
  avant: string;
  apres: string;
  /** Pourquoi, dit dans la notice du lecteur. */
  raison: string;
}

/**
 * Les retouches du code du jeu, en plus du manifeste. Le jeu prend tout cadre qu'il ne reconnaît pas pour le portail CrazyGames
 * (compte, publicités et salons du portail) : encadré dans « Revoir une partie », il ouvrait « Erreur de connexion ! » par-dessus
 * le replay (16 novembre 2026). Ici, il n'est jamais sur un portail.
 */
export const RETOUCHES_DU_CODE: readonly Retouche[] = [
  {
    fichier: "src/client/CrazyGamesSDK.ts",
    avant: "isOnCrazyGames(): boolean {",
    apres: "isOnCrazyGames(): boolean {\n    /* Site du clan [GAL] : jamais sur CrazyGames, même encadré. */\n    return false;",
    raison: "le lecteur, encadré dans la page du clan, ne se croit jamais sur le portail CrazyGames",
  },
  // La caméra du lecteur de replay cadre la carte à 90 %, laisse dézoomer jusqu'à 0,1 et sortir de la carte : un fond gris
  // l'entoure. Demande du pilote (16 novembre 2026) : « je veux pas voir de gris et pas pouvoir dégrossir au-delà de la taille
  // du replay ». À chaque image, la caméra reçoit la taille de la vue, ne dézoome pas en deçà d'une carte qui la remplit, et
  // garde la carte collée aux bords.
  {
    fichier: "src/client/replay/ReplayCamera.ts",
    avant: "  /** Fit the whole map in view, like the game does at the start. */",
    apres:
      "  /* Site du clan [GAL] : la carte couvre toujours la vue, jamais de fond autour, ni de dézoom au-delà de la carte. */\n" +
      "  vue(viewWidth: number, viewHeight: number): void {\n" +
      "    if (!(viewWidth > 0 && viewHeight > 0)) return;\n" +
      "    this.zoom = Math.min(MAX_ZOOM, Math.max(this.zoom, viewWidth / this.mapWidth, viewHeight / this.mapHeight));\n" +
      "    const demiL = Math.min(viewWidth / 2 / this.zoom, this.mapWidth / 2);\n" +
      "    const demiH = Math.min(viewHeight / 2 / this.zoom, this.mapHeight / 2);\n" +
      "    this.x = Math.min(Math.max(this.x, demiL), this.mapWidth - demiL);\n" +
      "    this.y = Math.min(Math.max(this.y, demiH), this.mapHeight - demiH);\n" +
      "  }\n" +
      "\n" +
      "  /** Fit the whole map in view, like the game does at the start. */",
    raison: "la carte remplit toujours la vue du lecteur, sans fond autour ni dézoom au-delà de la carte",
  },
  {
    fichier: "src/client/replay/ReplayViewer.ts",
    avant: "      camera.step(last === null ? 0 : now - last);",
    apres: "      camera.step(last === null ? 0 : now - last);\n      camera.vue(canvas.clientWidth, canvas.clientHeight); /* Site du clan [GAL] */",
    raison: "la caméra reçoit la taille de la vue à chaque image",
  },
  // La lecture, une fois la partie prête, est confiée à la page du lecteur (`galLecture`, posé par `pageDuLecteur`) : dans le
  // cadre de « Revoir une partie », elle la lance en ×8 (demande du pilote, 16 novembre 2026 : « quand la page se charge la
  // vidéo soit sur play et non sur pause et que la vidéo soit réglée en x8 »), et l'arrête quand le site demande la pause.
  {
    fichier: "src/client/replay/ReplayViewer.ts",
    avant: "    await playback.seek(0);\n    // disconnectedCallback has disposed the renderer by now.\n    if (this.abort.signal.aborted) return;\n",
    apres:
      "    await playback.seek(0);\n    // disconnectedCallback has disposed the renderer by now.\n    if (this.abort.signal.aborted) return;\n" +
      "    /* Site du clan [GAL] : la lecture confiée à la page du lecteur (lecture d'office en ×8 dans le cadre, pause demandée par le site). */\n" +
      "    const galLecture = (globalThis as { galLecture?: (lecture: ReplayPlayback) => void }).galLecture;\n" +
      "    if (typeof galLecture === \"function\") galLecture(playback);\n",
    raison: "la page du lecteur lance la lecture en ×8 dans le cadre du site du clan, et la met en pause à sa demande",
  },
];

/** Applique une retouche à un fichier du jeu. Lève une erreur si le passage n'y est pas exactement une fois : le jeu a changé. */
export function appliquerRetouche(texte: string, r: Retouche): string {
  const morceaux = texte.split(r.avant);
  if (morceaux.length !== 2) throw new Error(`le code du jeu a changé (${r.fichier} : ${morceaux.length - 1} fois au lieu d'une)`);
  return morceaux.join(r.apres);
}

/** La notice posée avec les lecteurs (`/jeu/LISEZ-MOI.txt`) : d'où viennent le code et les fichiers, sous quelles licences, ce qui a changé. */
export function noticeDuLecteur(commits: readonly string[]): string {
  return [
    "Lecteur de replay d'OpenFront, hébergé pour le site du clan [GAL] (https://les-gaulois.github.io/revoir). Version non officielle.",
    "",
    "Code : le client du jeu OpenFront, https://github.com/openfrontio/OpenFrontIO, aux commits :",
    ...commits.map((c) => `  ${c}`),
    "© OpenFront and Contributors, sous licence GNU AGPL-3.0 avec les conditions de sa section 7 (fichier LICENSE du dépôt du jeu).",
    "Modifié par le site du clan depuis le 15 novembre 2026 : construit sans les fichiers propriétaires du jeu ; manifeste des",
    "fichiers remplacé pour lire les fichiers libres du jeu sur GitHub ou sur ce site, par cette seule ligne de vite.config.ts :",
    `  avant : ${MANIFESTE_DU_JEU}`,
    `  après : ${MANIFESTE_DU_SITE}`,
    ...RETOUCHES_DU_CODE.flatMap((r) => [`depuis le 16 novembre 2026, dans ${r.fichier} (${r.raison}) :`, `  avant : ${r.avant}`, `  après : ${r.apres.replace(/\n\s*/g, " ")}`]),
    "page sans aucun script de publicité ni de mesure, avec une règle de sécurité qui n'autorise que ce site et le dépôt du jeu sur",
    "GitHub, un titre, un bandeau, et un renvoi vers le site du clan quand aucune partie n'est choisie ; sans logos ni icônes de",
    "l'application.",
    "La façon de le construire : scripts/construire-lecteurs.ts, src/lib/rejeu/lecteur-jeu.ts et scripts/publier-films.ts du dépôt",
    "du site, https://github.com/les-gaulois/les-gaulois.github.io (AGPL-3.0).",
    "",
    "Fichiers du jeu (images, cartes, drapeaux, sons, langues) : dossier resources/ du même dépôt, © OpenFront and Contributors,",
    "sous licence CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.fr), lus sur GitHub ou copiés tels quels",
    "sur ce site (images SVG du lecteur, drapeaux des joueurs). Aucun fichier du dossier proprietary/ du jeu, aucun logo de marque.",
    "",
    "Fiches des parties : l'API publique d'OpenFront (/public/game/<partie>), sans l'identifiant public ni les cosmétiques des",
    "joueurs (sauf leur drapeau, fichier libre du jeu). Les noms des tribus de robots restent, sans rien d'autre : le moteur du jeu",
    "en a besoin pour rejouer la partie, même quand ce sont des noms achetés dans sa boutique.",
    "",
  ].join("\n");
}

/** Une fiche de partie telle que l'API la donne : seul ce que le site retire est décrit ici. */
interface JoueurDeFiche {
  publicID?: unknown;
  persistentID?: unknown;
  cosmetics?: { flag?: unknown } & Record<string, unknown>;
  [cle: string]: unknown;
}

/**
 * La fiche publiée pour le lecteur : la fiche de l'API, sans l'identifiant public de personne (et l'identifiant persistant vidé,
 * le schéma du jeu exigeant le champ), sans cosmétiques sauf le drapeau quand c'est un fichier libre du jeu (`/flags/…svg`), et
 * des tribus de robots ne garde que le nom. Les caractères `<`, `>` et `&` sont échappés : la fiche est servie comme une page.
 * Lève une erreur si elle n'est pas celle de la partie.
 */
export function ficheNettoyee(texte: string, partie: string): string {
  const fiche = JSON.parse(texte) as { info?: { gameID?: unknown; players?: JoueurDeFiche[]; tribes?: unknown } };
  if (fiche.info?.gameID !== partie || !Array.isArray(fiche.info.players)) throw new Error("fiche d'une autre partie");
  for (const j of fiche.info.players) {
    delete j.publicID;
    // Le schéma du jeu exige le champ, vide permis (`PlayerRecordSchema` : `persistentID` nullable) : vidé, pas retiré.
    j.persistentID = null;
    const drapeau = j.cosmetics?.flag;
    if (typeof drapeau === "string" && /^\/?flags\/[A-Za-z0-9_-]+\.svg$/.test(drapeau)) j.cosmetics = { flag: drapeau };
    else delete j.cosmetics;
  }
  if (Array.isArray(fiche.info.tribes)) {
    fiche.info.tribes = fiche.info.tribes.map((t: unknown) => (typeof t === "object" && t !== null && typeof (t as { name?: unknown }).name === "string" ? { name: (t as { name: string }).name } : t));
  }
  const sortie = JSON.stringify(fiche).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  if (/"publicID"|"persistentID":(?!null)/.test(sortie)) throw new Error("un identifiant reste dans la fiche");
  return sortie;
}

/** Les drapeaux des joueurs d'une fiche publiée : le site ne copie que ceux-là. */
export function drapeauxDeLaFiche(texte: string): string[] {
  const fiche = JSON.parse(texte) as { info?: { players?: { cosmetics?: { flag?: unknown } }[] } };
  const out = new Set<string>();
  for (const j of fiche.info?.players ?? []) {
    const f = j.cosmetics?.flag;
    if (typeof f === "string" && /^\/?flags\/[A-Za-z0-9_-]+\.svg$/.test(f)) out.add(f.replace(/^\/?flags\//, ""));
  }
  return [...out].sort();
}
