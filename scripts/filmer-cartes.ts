/**
 * Filme en GIF la carte de chaque membre qui a un Gaulois, pour la commande /macarte de Discord (`src/lib/cartes-gif.ts`) :
 *   npm run cartes:filmer
 * Lancé par la GitHub Action après « Construire le site » (`.github/workflows/site.yml`). Le film est celui de la vraie
 * carte de la fiche (`src/components/CarteDeMembre.astro`) : les pages de `dist/` sont ouvertes dans le Chromium de
 * Playwright, sans serveur et sans réseau (toute adresse hors de `dist/` est refusée : aucune visite n'est comptée, rien
 * n'est envoyé), l'horloge de la page est tenue par le script, et chaque image est prise à un instant exact.
 *
 * Le curseur fait un tour autour du milieu de la carte par boucle : l'inclinaison revient à son point de départ. Le fond
 * est transparent (demande du pilote : « avoir que la carte de visible »), et le nombre de victoires est retiré : un
 * chiffre sans date n'a pas sa place dans une image qui reste dans un salon.
 *
 * Les GIF sont gardés dans `.cache/cartes-gif/` (cache du workflow, jamais dans Git), avec leur liste. À chaque passage,
 * seules les cartes nouvelles ou changées sont filmées, quelques-unes au plus : le reste attend la construction suivante.
 * Sont publiées dans `dist/cartes/` celles qui sont à jour, avec `index.json`, que le robot relit.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { CACHE_DES_CARTES, cartesAFilmer, DOSSIER_DES_CARTES, dureeDeLaBoucle, imagesDeLaBoucle, INDEX_DES_CARTES, lireIndexDesCartes, pasDuFilm, versionDeLaCarte, type CarteGif } from "../src/lib/cartes-gif";

const DIST = process.env["CARTES_DIST"] ?? "dist";
const BASE = (process.env["BASE_PATH"] ?? "").replace(/\/$/, "");
/** Combien de cartes filmer à ce passage, et en combien de temps au plus : un film prend près d'une minute. */
const PAR_PASSAGE = Number(process.env["CARTES_PAR_PASSAGE"] ?? 8);
const TEMPS_MS = Number(process.env["CARTES_TEMPS_S"] ?? 300) * 1000;
/** Un GIF plus lourd est refait plus petit : Discord et le paquet du site ont leurs limites. */
const POIDS_MAX = 3_000_000;
/** Au-delà, les cartes suivantes ne sont pas publiées : le paquet du site a sa limite. */
const POIDS_TOTAL_MAX = 100_000_000;
/** Passé ce temps, le script n'ouvre plus de fiche et publie ce qu'il a contrôlé : l'étape du workflow est coupée à huit minutes. */
const ARRET_MS = TEMPS_MS + 90_000;
const ORIGINE = "http://cartes.invalid";
const MARGE = 20;
const ELAN_MS = 2000;
/** Un point et demi par pixel de la page : la carte fait 276 pixels de large dans le GIF. */
const ECHELLE = 1.5;

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
};

/** Le fichier de `dist/` d'une adresse du site, ou `null` : hors du dossier, ou absent. */
function fichierDe(chemin: string): string | null {
  if (BASE && !chemin.startsWith(`${BASE}/`)) return null;
  let relatif: string;
  try {
    relatif = decodeURIComponent(chemin.slice(BASE.length));
  } catch {
    return null;
  }
  const racine = normalize(join(process.cwd(), DIST));
  let fichier = normalize(join(racine, relatif));
  if (fichier !== racine && !fichier.startsWith(racine + sep)) return null;
  if (existsSync(fichier) && statSync(fichier).isDirectory()) fichier = join(fichier, "index.html");
  return existsSync(fichier) ? fichier : null;
}

/** Les membres dont la fiche montre une carte : ceux qui ont un Gaulois. */
function membresAvecCarte(): string[] {
  const dossier = join(DIST, "membres");
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((id) => /^[A-Za-z0-9]{1,32}$/.test(id) && existsSync(join(dossier, id, "index.html")) && readFileSync(join(dossier, id, "index.html"), "utf8").includes("data-carte-membre"))
    .sort();
}

interface Releve {
  version: string;
  finition: string | null;
}

/** La case de la carte, qui ne tourne pas, remise au milieu de l'écran : sa place en pixels de la page. */
const cadrer = (page: Page) =>
  page.locator("[data-film]").evaluate((el) => {
    // Sans le défilement doux de la page, qui durerait pendant la prise de vue.
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = (el.parentElement ?? el).getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

/** Ouvre la fiche, horloge arrêtée, ne garde à l'écran que la carte, et relève ce qui la dessine. */
async function ouvrir(contexte: BrowserContext, id: string): Promise<{ page: Page; releve: Releve }> {
  const page = await contexte.newPage();
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.goto(`${ORIGINE}${BASE}/membres/${id}/`, { waitUntil: "load" });
  await page.clock.pauseAt(new Date("2026-01-01T12:05:00Z"));
  const carte = page.locator("[data-carte-membre] .podium-carte").first();
  await carte.evaluate((el) => el.setAttribute("data-film", ""));
  await page.addStyleTag({
    content: "html,body{background:transparent!important}body *{visibility:hidden!important}[data-film],[data-film] *{visibility:visible!important}[data-film] .podium-carte-score{display:none!important}",
  });
  // Les images de la carte, chargées et décodées avant la première prise de vue.
  const lu = await carte.evaluate(async (el) => {
    const images = [...el.querySelectorAll("img")];
    await Promise.all(images.map((i) => i.decode().catch(() => undefined)));
    const face = el.querySelector<HTMLElement>(".podium-carte-face");
    const banniere = /url\("?([^")]+)"?\)/.exec(face?.style.getPropertyValue("--banniere") ?? "")?.[1] ?? null;
    const adresses = [...new Set([...images.map((i) => i.getAttribute("src") ?? ""), ...(banniere ? [banniere] : [])])].filter(Boolean).sort();
    // Ce qui dessine la carte, sans ce que les scripts de la page y changent en route (son inclinaison, ses toiles).
    const dessin = [
      el.getAttribute("data-finition"),
      el.hasAttribute("data-reflet"),
      el.hasAttribute("data-champion"),
      el.getAttribute("data-metal"),
      el.querySelector(".podium-carte-nom")?.textContent ?? "",
      images.map((i) => [i.className, i.getAttribute("src"), i.getAttribute("width"), i.getAttribute("height")]),
      adresses,
    ];
    return { html: JSON.stringify(dessin), adresses, finition: el.getAttribute("data-finition") };
  });
  const images = lu.adresses.flatMap((adresse) => {
    const fichier = fichierDe(new URL(adresse, ORIGINE).pathname);
    return fichier ? [readFileSync(fichier)] : [];
  });
  return { page, releve: { version: versionDeLaCarte(lu.html, images), finition: lu.finition } };
}

/** Le film d'une carte : deux secondes d'élan, puis une boucle prise image par image, réunie en GIF. */
async function filmer(page: Page, { finition }: Releve): Promise<Buffer> {
  const boucle = dureeDeLaBoucle(finition);
  const pas = pasDuFilm(finition);
  // Les scripts de la page ont fini de la mettre en place avant le cadrage : la carte ne bouge plus ensuite.
  await page.clock.runFor(1500);
  // Les animations de la feuille de style (la carte flotte, le reflet passe) ne suivent pas l'horloge de la page : elles
  // sont arrêtées, puis posées à l'instant de chaque image.
  const caler = (instant: number) =>
    page.evaluate((a) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = a;
      }
    }, instant);
  await caler(0);
  const boite = await cadrer(page);
  const cx = boite.x + boite.width / 2;
  const cy = boite.y + boite.height / 2;
  const cadre = { x: Math.round(boite.x - MARGE), y: Math.round(boite.y - MARGE), width: Math.round(boite.width + MARGE * 2), height: Math.round(boite.height + MARGE * 2) };
  const viser = (t: number) => page.mouse.move(cx + Math.cos((t / boucle) * Math.PI * 2) * boite.width * 0.42, cy + Math.sin((t / boucle) * Math.PI * 2) * boite.height * 0.3);
  // L'élan : l'inclinaison rejoint le curseur, qui arrive au départ de la boucle au moment de la première image.
  let t = -ELAN_MS;
  for (; t < 0; t += pas) {
    await viser(t);
    await page.clock.runFor(pas);
  }
  const images: Buffer[] = [];
  for (let i = 0; i < imagesDeLaBoucle(finition); i++, t += pas) {
    await viser(t);
    await page.clock.runFor(pas);
    await caler(t);
    images.push(await page.screenshot({ clip: cadre, omitBackground: true }));
  }
  const encoder = (largeur: number | null) => {
    const film = sharp(images, { join: { animated: true } });
    return (largeur ? film.resize({ width: largeur }) : film).gif({ delay: pas, loop: 0, effort: 7, colours: 128, dither: 0.6, interFrameMaxError: 6 }).toBuffer();
  };
  let gif = await encoder(null);
  if (gif.length > POIDS_MAX) gif = await encoder(Math.round(cadre.width * ECHELLE * 0.75));
  return gif;
}

const debut = Date.now();
const ids = membresAvecCarte();
const cache = join(process.cwd(), CACHE_DES_CARTES);
mkdirSync(cache, { recursive: true });
const fichierIndex = join(cache, INDEX_DES_CARTES);
const gardees = lireIndexDesCartes(existsSync(fichierIndex) ? readFileSync(fichierIndex, "utf8") : null).cartes.filter((c) => existsSync(join(cache, `${c.id}.gif`)));

const voulues: CarteGif[] = [];
const faites = new Map(gardees.map((c) => [c.id, c.v]));
let filmees = 0;
/** La liste du cache, réécrite après chaque film : un passage coupé en route ne perd pas ses films. */
const noter = () => writeFileSync(fichierIndex, `${JSON.stringify({ cartes: [...faites].flatMap(([id, v]): CarteGif[] => (existsSync(join(cache, `${id}.gif`)) ? [{ id, v }] : [])) })}
`);
if (ids.length > 0) {
  const navigateur = await chromium.launch();
  try {
    const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", deviceScaleFactor: ECHELLE });
    await contexte.route("**/*", (route) => {
      const adresse = new URL(route.request().url());
      const fichier = adresse.origin === ORIGINE ? fichierDe(adresse.pathname) : null;
      if (!fichier) return route.abort();
      return route.fulfill({ body: readFileSync(fichier), contentType: TYPES[extname(fichier).toLowerCase()] ?? "application/octet-stream" });
    });
    // Aucune liaison ouverte non plus : la page ne parle à personne.
    await contexte.routeWebSocket(/.*/, (liaison) => void liaison.close());
    for (const id of ids) {
      if (Date.now() - debut > ARRET_MS) {
        console.log("Cartes en GIF : temps écoulé, les fiches suivantes attendent le prochain passage.");
        break;
      }
      try {
        const { page, releve } = await ouvrir(contexte, id);
        try {
          const carte = { id, v: releve.version };
          voulues.push(carte);
          const aFaire = cartesAFilmer([carte], gardees, 1).length > 0;
          if (aFaire && filmees < PAR_PASSAGE && Date.now() - debut < TEMPS_MS) {
            const gif = await filmer(page, releve);
            writeFileSync(join(cache, `${id}.gif`), gif);
            faites.set(id, releve.version);
            noter();
            filmees++;
            console.log(`Carte ${id} filmée : ${(gif.length / 1_000_000).toFixed(1)} Mo, boucle de ${dureeDeLaBoucle(releve.finition) / 1000} s.`);
          }
        } finally {
          await page.close();
        }
      } catch (e) {
        console.log(`Carte ${id} : pas filmée (${e instanceof Error ? (e.message.split("\n")[0] ?? "") : String(e)}).`);
      }
    }
  } finally {
    await navigateur.close();
  }
}

// Le cache ne garde que les membres qui ont encore une carte ; la liste dit la version de chaque GIF gardé.
const encore = new Set(ids);
for (const fichier of readdirSync(cache)) {
  if (fichier.endsWith(".gif") && !encore.has(fichier.slice(0, -4))) rmSync(join(cache, fichier), { force: true });
}
const aJour = [...faites].flatMap(([id, v]): CarteGif[] => (encore.has(id) && existsSync(join(cache, `${id}.gif`)) ? [{ id, v }] : []));
writeFileSync(fichierIndex, `${JSON.stringify({ cartes: aJour })}\n`);

// Ne sont publiées que les cartes à jour : un GIF d'avant un changement de tenue ou de finition attend son nouveau film.
const sortie = join(DIST, DOSSIER_DES_CARTES);
rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
let poids = 0;
const enLigne: CarteGif[] = [];
for (const carte of aJour) {
  if (!voulues.some((v) => v.id === carte.id && v.v === carte.v)) continue;
  const taille = statSync(join(cache, `${carte.id}.gif`)).size;
  if (poids + taille > POIDS_TOTAL_MAX) continue;
  copyFileSync(join(cache, `${carte.id}.gif`), join(sortie, `${carte.id}.gif`));
  poids += taille;
  enLigne.push(carte);
}
writeFileSync(join(sortie, INDEX_DES_CARTES), `${JSON.stringify({ cartes: enLigne })}\n`);
console.log(`Cartes en GIF : ${enLigne.length} publiées sur ${ids.length} (${(poids / 1_000_000).toFixed(1)} Mo), ${filmees} filmées à ce passage, ${ids.length - enLigne.length} en attente.`);
