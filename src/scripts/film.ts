/**
 * Lecteur du film de la carte. Le HTML contient déjà la carte finale et tous les
 * chiffres : ce script n'ajoute que le mouvement, et ne change aucune valeur.
 *
 * Halo, lueurs et plans rapprochés sont décoratifs : ils disparaissent avec « réduire
 * les animations » ou le bouton pause du site, et le film ne démarre alors que sur demande.
 * Les grands moments viennent des chiffres de chaque image. La caméra glisse sans à-coup
 * (`src/lib/fx/camera.ts`) et ne s'approche seule que de quelques grands moments, jamais coup sur coup.
 * La vitesse va de × 0,1 à × 1 (`src/lib/fx/speed.ts`) : le film ne va jamais plus vite que × 1.
 *
 * Depuis le 12 novembre 2026, la carte se manie aussi : molette ou pincement pour le zoom, glisser ou flèches pour se
 * déplacer, clic sur un territoire pour nommer son clan (`src/lib/clanmap/vue.ts`). Une vue choisie par le visiteur reste
 * pendant la lecture : la caméra ne la reprend pas.
 */
import { clanRgb, type DecodedFrames } from "../lib/clanmap/codec";
import { filmDayMarks, placeDayLabels } from "../lib/clanmap/days";
import { findMoments, type Moment } from "../lib/clanmap/moments";
import { filmResume } from "../lib/clanmap/reprise";
import { borner, cadreDuClan, decaler, estVueDEnsemble, ligneDuClan, pointDeCarte, positionSurLaCarte, zoomer } from "../lib/clanmap/vue";
import { fmtDay, fmtEpochDay, fmtEpochHour } from "../lib/format";
import { CAMERA_CLICK_MS, CAMERA_SMOOTH_MS, FILM_MS, SHOT_MAX_ZOOM, SHOT_MS, SHOT_SPACING_MS, moveCamera, pickShots, placeCamera, type Camera } from "../lib/fx/camera";
import { motionAllowed } from "../lib/fx/motion";
import { filmSpeed, speedLabel, speedText } from "../lib/fx/speed";
import { frNumber } from "../lib/nombre";
import type { StoredClanMapFilm } from "../lib/schemas";
import { nextVisitState, readVisitState, VISIT_KEY, type VisitSnapshot } from "../lib/visite";
import { loadFilmData } from "./film-data";

const AUTOPLAY_DELAY_MS = 1_500;
const GAIN = "#7dd3fc";
const MAX_PULSES = 4;
const BLOOM_DIVISOR = 6;
/** Un grand moment : un sous-titre, et parfois un plan rapproché lent. */
const CAPTION_MS = 3_400;
/** Sur une machine lente, le film renonce à ses effets les plus coûteux plutôt que de saccader. */
const SLOW_FRAME_MS = 40;
const SLOW_FRAMES_LIMIT = 24;
const LOW_POWER_RESOLUTION = 0.7;
/** Largeur d'une date sous la frise, en rem : voir `.film-date`. */
const DAY_LABEL_REM = 3.5;
/** Une journée rejouée dure au moins ce temps à la vitesse × 1 : un long historique lui laisse peu d'images. */
const DAY_REPLAY_MS = 4_000;
/** La suite du film, pour celui qui revient, dure au moins ce temps. */
const RESUME_MIN_MS = 6_000;
/** Après un saut dans le film, l'ancienne image s'efface en fondu pendant ce temps. */
const FADE_MS = 500;
/** Le zoom ne s'approche pas plus : quatre pixels d'écran par case du film. */
const MAX_CELL_PX = 4;
/** Un cran de zoom, pour une touche ou un bouton. */
const ZOOM_STEP = 1.6;
/** Quand le visiteur manie la carte lui-même, la caméra le suit de près, toujours sans à-coup. */
const CAMERA_FREE_MS = 140;
/** En deçà, un appui est un clic ; au-delà, un déplacement. En pixels CSS. */
const DRAG_PX = 5;
/** Le pas d'une flèche du clavier : une part de la largeur affichée. */
const KEY_PAN = 0.18;
/** Le quadrillage de la carte, comme sur une table d'état-major : seize colonnes. */
const GRID_COLUMNS = 16;

const fmt = frNumber();
const fmtPct = frNumber({ minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Pulse {
  x: number;
  y: number;
  size: number;
  color: string;
  t: number;
}
interface View {
  x: number;
  y: number;
  s: number;
}

const rgba = (r: number, g: number, b: number, a: number) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

function mount(root: HTMLElement, film: StoredClanMapFilm, frames: DecodedFrames, terrain: HTMLImageElement): void {
  const one = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`élément manquant : ${selector}`);
    return el;
  };
  const makeLayer = (width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("dessin indisponible");
    return [canvas, context];
  };

  const view = one<HTMLCanvasElement>("[data-film-canvas]");
  const ctx = view.getContext("2d");
  if (!ctx) throw new Error("dessin indisponible");

  const W = film.cols;
  const H = film.rows;
  const N = W * H;
  const F = film.frames.length;
  const GAL = film.gal;
  const totalEvents = film.frames[F - 1]?.ev ?? 0;
  const { offsets, cells, owners } = frames;
  const monde = { width: W, height: H };

  const [layer, layerCtx] = makeLayer(W, H);
  const [glowCanvas, glowCtx] = makeLayer(W, H);
  const [galCanvas, galCtx] = makeLayer(W, H);
  const bloomW = Math.ceil(W / BLOOM_DIVISOR);
  const bloomH = Math.ceil(H / BLOOM_DIVISOR);
  const [glowBloom, glowBloomCtx] = makeLayer(bloomW, bloomH);
  const [galBloom, galBloomCtx] = makeLayer(bloomW, bloomH);
  const [fadeCanvas, fadeCtx] = makeLayer(1, 1);

  const map = one<HTMLElement>("[data-film-map]");
  const playButton = one<HTMLButtonElement>("[data-film-play]");
  const playLabel = one<HTMLElement>("[data-film-play-label]");
  const playIcon = one<SVGPathElement>("[data-film-play-icon]");
  const pos = one<HTMLInputElement>("[data-film-pos]");
  const rowsBox = one<HTMLElement>("[data-film-rows]");
  const pinned = one<HTMLElement>("[data-film-pinned]");
  const eventLabel = one<HTMLElement>("[data-film-event]");
  const dateLabel = one<HTMLElement>("[data-film-date]");
  const landLabel = one<HTMLElement>("[data-film-land]");
  const clansLabel = one<HTMLElement>("[data-film-clans]");
  const status = one<HTMLElement>("[data-film-status]");
  const tip = one<HTMLElement>("[data-film-tip]");
  const caption = one<HTMLElement>("[data-film-caption]");
  const focusChip = one<HTMLButtonElement>("[data-film-focus]");
  const speedInput = one<HTMLInputElement>("[data-film-speed]");
  const speedValue = one<HTMLElement>("[data-film-speed-value]");
  const worldChip = one<HTMLButtonElement>("[data-film-world]");
  const mire = one<HTMLElement>("[data-film-mire]");
  const coords = one<HTMLElement>("[data-film-coords]");
  const [mireV, mireH] = [...mire.querySelectorAll<HTMLElement>("i")];

  /* ---------- Couleurs et état de la carte ---------- */

  const image = layerCtx.createImageData(W, H);
  const pix = new Uint32Array(image.data.buffer);
  const glowImage = glowCtx.createImageData(W, H);
  const glowPix = new Uint32Array(glowImage.data.buffer);
  const galImage = galCtx.createImageData(W, H);
  const galPix = new Uint32Array(galImage.data.buffer);
  const owner = new Uint16Array(N);
  const palette = new Uint32Array(film.clans.length);
  const [galR, galG, galB] = clanRgb(GAL === null ? null : (film.clans[GAL]?.color ?? null));
  const galMask = rgba(galR, galG, galB, 255);
  let focus = false;
  let highlighted: number | null = null;
  let galDirty = true;

  function buildPalette(): void {
    palette[0] = 0;
    const dim = focus || highlighted !== null;
    for (let i = 1; i < palette.length; i++) {
      const [r, g, b] = clanRgb(film.clans[i]?.color ?? null);
      const keep = i === GAL || i === highlighted;
      palette[i] = dim && !keep ? rgba(120, 130, 155, 95) : rgba(r, g, b, i === GAL ? 245 : 215);
    }
  }

  function repaint(): void {
    for (let i = 0; i < N; i++) {
      const v = owner[i]!;
      pix[i] = palette[v]!;
      galPix[i] = v === GAL ? galMask : 0;
    }
    layerCtx.putImageData(image, 0, 0);
    galCtx.putImageData(galImage, 0, 0);
    galDirty = true;
  }

  let cur = 0;
  function applyUpTo(target: number): void {
    if (target < cur) {
      owner.fill(0);
      cur = 0;
    }
    const end = offsets[target]!;
    for (let k = offsets[cur]!; k < end; k++) owner[cells[k]!] = owners[k]!;
    cur = target;
  }

  function seek(target: number): void {
    applyUpTo(target);
    clearEffects();
    repaint();
    updateHud();
    invalidate();
  }

  /* ---------- Lueurs de conquête : douces, sans étincelle ni éclair ---------- */

  const GLOW_GAIN = 1;
  const GLOW_LOSS = 2;
  const GLOW_OTHER = 3;
  const glowColors = [new Uint32Array(0), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let a = 0; a < 256; a++) {
    glowColors[GLOW_GAIN]![a] = rgba(210, 245, 255, a);
    glowColors[GLOW_LOSS]![a] = rgba(255, 70, 85, a);
    glowColors[GLOW_OTHER]![a] = rgba(255, 255, 255, Math.round(a * 0.25));
  }
  const life = new Uint8Array(N);
  const kind = new Uint8Array(N);
  let active = new Int32Array(1 << 14);
  let activeCount = 0;
  const pulses: Pulse[] = [];
  /** L'ancienne image, qui s'efface en fondu après un saut dans le film : 1 = encore entière. */
  let fade = 0;

  function addGlow(cell: number, type: number): void {
    if (life[cell] === 0) {
      if (activeCount === active.length) {
        const bigger = new Int32Array(active.length * 2);
        bigger.set(active);
        active = bigger;
      }
      active[activeCount++] = cell;
    }
    life[cell] = 255;
    kind[cell] = type;
  }

  function clearEffects(): void {
    for (let i = 0; i < activeCount; i++) {
      life[active[i]!] = 0;
      glowPix[active[i]!] = 0;
    }
    activeCount = 0;
    pulses.length = 0;
    glowCtx.clearRect(0, 0, W, H);
    glowBloomCtx.clearRect(0, 0, bloomW, bloomH);
  }

  function stepGlow(dt: number): boolean {
    if (activeCount === 0) return false;
    const fade = Math.max(1, Math.round(dt * 0.3));
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    let kept = 0;
    for (let i = 0; i < activeCount; i++) {
      const cell = active[i]!;
      const level = life[cell]! > fade ? life[cell]! - fade : 0;
      life[cell] = level;
      glowPix[cell] = level ? glowColors[kind[cell]!]![level]! : 0;
      const x = cell % W;
      const y = Math.floor(cell / W);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (level) active[kept++] = cell;
    }
    activeCount = kept;
    if (x1 >= 0) glowCtx.putImageData(glowImage, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    return true;
  }

  function addPulse(x: number, y: number, size: number, color: string): void {
    if (pulses.length >= MAX_PULSES) pulses.shift();
    pulses.push({ x, y, size, color, t: 0 });
  }

  /** Garde l'image affichée pour la fondre dans la suivante : un saut dans le film ne fait pas de coupure sèche. */
  function crossfade(): void {
    if (!motionAllowed() || view.width === 0) return;
    fadeCanvas.width = view.width;
    fadeCanvas.height = view.height;
    fadeCtx.drawImage(view, 0, 0);
    fade = 1;
  }

  /** Avance d'une image et ne redessine que la zone modifiée. */
  function advance(now: number): void {
    const effects = motionAllowed();
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let k = offsets[cur]!; k < offsets[cur + 1]!; k++) {
      const cell = cells[k]!;
      const v = owners[k]!;
      const previous = owner[cell]!;
      owner[cell] = v;
      pix[cell] = palette[v]!;
      galPix[cell] = v === GAL ? galMask : 0;
      const x = cell % W;
      const y = Math.floor(cell / W);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (!effects) continue;
      if (v === GAL) addGlow(cell, GLOW_GAIN);
      else if (previous === GAL) addGlow(cell, GLOW_LOSS);
      else if (!focus && v !== 0) addGlow(cell, GLOW_OTHER);
    }
    if (x1 >= 0) {
      layerCtx.putImageData(image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      galCtx.putImageData(galImage, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      galDirty = true;
    }
    cur++;
    const moment = momentAt.get(cur);
    if (moment) {
      playMoment(moment, now, moment.frame === requestedMoment);
      if (moment.frame === requestedMoment) requestedMoment = 0;
    }
  }

  /* ---------- Les grands moments : un sous-titre, et parfois un plan rapproché lent ---------- */

  const moments = findMoments(film.frames);
  const momentAt = new Map<number, Moment>(moments.map((m) => [m.frame, m]));
  // La liste des grands moments est dans sa fenêtre : on la cherche dans toute la page.
  const momentButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-film-moment]")];
  /** Les moments filmés de près : les plus importants, jamais coup sur coup. Plus lent que × 1, ils s'espacent encore. */
  const shotFrames = pickShots(moments, FILM_MS / F);
  /** Le moment qu'on vient de demander dans la liste : lui a toujours son plan rapproché. */
  let requestedMoment = 0;
  /** Le début du dernier plan rapproché : un plan automatique attend au moins `SHOT_SPACING_MS`, même après un clic. */
  let lastShotAt = -Infinity;
  let shot: (View & { until: number }) | null = null;
  let captionTimer = 0;

  function showCaption(text: string, keep = false): void {
    window.clearTimeout(captionTimer);
    // Un sous-titre déjà affiché change de texte sans réapparaître : rien ne saute quand deux moments se suivent.
    const appearing = caption.hidden;
    caption.textContent = text;
    caption.hidden = false;
    if (appearing && motionAllowed()) {
      caption.animate(
        [
          { opacity: 0, translate: "0 12px", scale: 0.96 },
          { opacity: 1, translate: "0 0", scale: 1 },
        ],
        { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
    if (!keep) {
      captionTimer = window.setTimeout(() => {
        caption.hidden = true;
      }, CAPTION_MS);
    }
  }

  function hideCaption(): void {
    window.clearTimeout(captionTimer);
    caption.hidden = true;
  }

  function markMoment(moment: Moment | null): void {
    for (const button of momentButtons) {
      if (moment && Number(button.dataset.filmMoment) === moment.frame) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  function playMoment(moment: Moment, now: number, requested: boolean): void {
    showCaption(moment.title);
    markMoment(moment);
    status.textContent = moment.at === null ? moment.title : `${fmtEpochDay(moment.at)} : ${moment.title}`;
    if (!motionAllowed() || manual) return;
    // Seuls les moments choisis d'avance, ou celui demandé dans la liste, sont filmés de près, jamais coup sur coup.
    if (!requested && (!shotFrames.has(moment.frame) || now - lastShotAt < SHOT_SPACING_MS)) return;
    const cam = film.frames[moment.frame - 1]?.cam;
    if (!cam) return;
    const target = galView(cam, SHOT_MAX_ZOOM);
    shot = { ...target, until: now + SHOT_MS };
    lastShotAt = now;
    addPulse(target.x, target.y, 120, GAIN);
  }

  /* ---------- Caméra : des mouvements lents, sans à-coup ---------- */

  const camera: Camera = { x: W / 2, y: H / 2, s: 1, vx: 0, vy: 0, vz: 0 };
  /** Une vue choisie : par un regard posé sur une zone, un front ou un clan, ou par le visiteur lui-même (`free`). */
  let manual: View | null = null;
  /** `true` : le visiteur a zoomé ou déplacé la carte. Sa vue reste pendant la lecture, et rien ne la décale. */
  let free = false;
  let dpr = 1;
  /** La largeur du dessin que couvre la fenêtre ouverte quand elle est posée sur la carte : une cible se centre dans le reste. */
  let covered = 0;

  const ecran = () => ({ width: view.width, height: view.height });

  function worldView(): View {
    return { x: W / 2, y: H / 2, s: Math.min(view.width / W, view.height / H) };
  }

  /** Tout le territoire de GAL, sans s'approcher plus que `maxZoom` fois la vue d'ensemble. */
  function galView(c: readonly [number, number, number, number], maxZoom: number): View {
    const world = worldView().s;
    const halfW = Math.max(c[2] * 2.7, 255);
    const halfH = Math.max(c[3] * 2.7, 165);
    const fit = Math.min((view.width - covered) / (2 * halfW), view.height / (2 * halfH));
    return { x: c[0], y: c[1], s: Math.min(Math.max(fit, world), 3 * dpr, world * maxZoom) };
  }

  /** Un endroit de la carte d'aujourd'hui, cadré dans la partie du dessin qu'aucune fenêtre ne couvre. */
  function lookAt(x: number, y: number, halfWidth: number, halfHeight: number): View {
    const halfW = Math.max(halfWidth, 130);
    const halfH = Math.max(halfHeight, 85);
    const fit = Math.min((view.width - covered) / (2.4 * halfW), view.height / (2.4 * halfH));
    return { x, y, s: Math.min(Math.max(fit, worldView().s), MAX_CELL_PX * dpr) };
  }

  function cameraTarget(): View {
    if (manual) return free ? manual : decaler(manual, covered);
    if (shot) return decaler(shot, covered);
    return worldView();
  }

  function stepCamera(dt: number, snap: boolean): boolean {
    const target = cameraTarget();
    if (snap || !motionAllowed()) {
      const moved = camera.x !== target.x || camera.y !== target.y || camera.s !== target.s;
      placeCamera(camera, target);
      return moved;
    }
    return moveCamera(camera, target, dt, manual ? (free ? CAMERA_FREE_MS : CAMERA_CLICK_MS) : CAMERA_SMOOTH_MS);
  }

  /** Mesure ce que la fenêtre ouverte couvre de la carte : rien quand elle est sous la carte, ou fermée. */
  function measure(): void {
    const fenetre = root.querySelector<HTMLElement>("[data-fenetre].est-ouverte");
    const m = map.getBoundingClientRect();
    const f = fenetre?.getBoundingClientRect();
    covered = !f || f.width === 0 || m.width === 0 || f.bottom <= m.top || f.top >= m.bottom ? 0 : Math.max(0, m.right - f.left) * (view.width / m.width);
    if (manual && free) manual = borner(manual, monde, ecran(), MAX_CELL_PX * dpr, covered);
  }

  /** La page défile-t-elle ? Seulement sur un écran trop bas pour la console, ou si elle n'a pas pu se poser. */
  const pageScrolls = () => document.documentElement.scrollHeight > window.innerHeight + 1;

  /** Sur un écran si bas que la page défile, le doigt garde le défilement vertical ; ailleurs, il déplace la carte. */
  function syncTouch(): void {
    view.style.touchAction = pageScrolls() ? "pan-y" : "";
  }

  function resize(): void {
    const r = map.getBoundingClientRect();
    syncTouch();
    dpr = Math.min(window.devicePixelRatio || 1, 2) * (lowPower ? LOW_POWER_RESOLUTION : 1);
    const width = Math.max(1, Math.round(r.width * dpr));
    const height = Math.max(1, Math.round(r.height * dpr));
    if (width === view.width && height === view.height) return;
    view.width = width;
    view.height = height;
    fade = 0;
    measure();
    stepCamera(0, true);
    invalidate();
  }

  function draw(): void {
    const c = ctx!;
    const effects = motionAllowed();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.fillStyle = "#091426";
    c.fillRect(0, 0, view.width, view.height);
    c.setTransform(camera.s, 0, 0, camera.s, view.width / 2 - camera.x * camera.s, view.height / 2 - camera.y * camera.s);
    c.imageSmoothingEnabled = camera.s < 1;
    c.drawImage(terrain, 0, 0, W, H);
    c.drawImage(layer, 0, 0);

    // Le quadrillage de la carte : fixe sur le monde, il suit la caméra. Décoratif.
    const pas = W / GRID_COLUMNS;
    c.beginPath();
    for (let x = pas; x < W - 1; x += pas) {
      c.moveTo(x, 0);
      c.lineTo(x, H);
    }
    for (let y = pas; y < H - 1; y += pas) {
      c.moveTo(0, y);
      c.lineTo(W, y);
    }
    c.lineWidth = dpr / camera.s;
    c.strokeStyle = "rgb(125 170 255 / 0.1)";
    c.stroke();

    if (effects) {
      c.globalCompositeOperation = "lighter";
      if (!lowPower) {
        // Le territoire de GAL garde un halo doux, tiré d'une version réduite.
        if (galDirty) {
          galBloomCtx.clearRect(0, 0, bloomW, bloomH);
          galBloomCtx.drawImage(galCanvas, 0, 0, bloomW, bloomH);
          galDirty = false;
        }
        c.imageSmoothingEnabled = true;
        // Un halo fixe : le territoire de GAL ne clignote pas.
        c.globalAlpha = 0.3;
        c.drawImage(galBloom, 0, 0, W, H);
        if (activeCount > 0) {
          glowBloomCtx.clearRect(0, 0, bloomW, bloomH);
          glowBloomCtx.drawImage(glowCanvas, 0, 0, bloomW, bloomH);
          c.globalAlpha = 0.8;
          c.drawImage(glowBloom, 0, 0, W, H);
        }
        c.imageSmoothingEnabled = camera.s < 1;
      }
      c.globalAlpha = 1;
      c.drawImage(glowCanvas, 0, 0);
      c.globalCompositeOperation = "source-over";
    }

    // Un seul cercle doux marque l'endroit d'un plan rapproché.
    for (const p of pulses) {
      c.beginPath();
      c.arc(p.x, p.y, p.size * (0.25 + p.t), 0, Math.PI * 2);
      c.lineWidth = Math.max(1.2, 2.5 * (1 - p.t)) * (dpr / camera.s);
      c.globalAlpha = (1 - p.t) * 0.6;
      c.strokeStyle = p.color;
      c.stroke();
    }
    c.globalAlpha = 1;

    // Étiquette au-dessus du territoire de GAL : elle ne cache pas ses premiers pixels.
    const cam = cur > 0 ? film.frames[cur - 1]?.cam : null;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (cam && !manual) {
      const size = 12 * dpr;
      c.font = `700 ${size}px "JetBrains Mono Variable", ui-monospace, monospace`;
      const pillW = c.measureText("GAL").width + 12 * dpr;
      const pillH = size + 8 * dpr;
      const sx = view.width / 2 + (cam[0] - camera.x) * camera.s;
      const sy = view.height / 2 + (cam[1] - camera.y) * camera.s - pillH;
      c.fillStyle = "rgb(1 4 16 / 0.88)";
      c.fillRect(sx - pillW / 2, sy - pillH / 2, pillW, pillH);
      c.strokeStyle = "#fff";
      c.lineWidth = dpr;
      c.strokeRect(sx - pillW / 2, sy - pillH / 2, pillW, pillH);
      c.fillStyle = "#fff";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("GAL", sx, sy + dpr / 2);
    }

    if (fade > 0) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = fade;
      c.drawImage(fadeCanvas, 0, 0);
      c.globalAlpha = 1;
    }

    // Le zoom par rapport à la vue d'ensemble, lu par les tests : 1 tant que la caméra ne s'approche pas. Et le centre de
    // la vue, en cases du film : il ne bouge que si la carte se déplace.
    const zoom = (camera.s / worldView().s).toFixed(2);
    if (view.dataset.zoom !== zoom) view.dataset.zoom = zoom;
    const centre = `${Math.round(camera.x)},${Math.round(camera.y)}`;
    if (view.dataset.centre !== centre) view.dataset.centre = centre;
  }

  /* ---------- Boucle : elle s'arrête dès qu'il n'y a plus rien à animer ---------- */

  let raf = 0;
  let last = 0;
  let playing = false;
  let started = false;
  let speed = 1;
  let elapsed = 0;
  let needDraw = true;
  let inView = false;
  let lowPower = false;
  let slowFrames = 0;
  const frameMs = FILM_MS / F;
  /** La fin de la journée rejouée : le film s'y arrête. */
  let stopAt: number | null = null;
  let dayFrameMs = 0;

  function schedule(): void {
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function invalidate(): void {
    needDraw = true;
    schedule();
  }

  function loop(now: number): void {
    raf = 0;
    const dt = last ? Math.min(now - last, 100) : 16;
    if (playing && inView && !lowPower && last) {
      slowFrames = dt > SLOW_FRAME_MS ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames >= SLOW_FRAMES_LIMIT) {
        lowPower = true;
        resize();
      }
    }
    last = now;
    let dirty = needDraw;
    if (shot && now >= shot.until) shot = null;
    if (playing && inView) {
      elapsed += dt;
      const step = Math.max(frameMs, dayFrameMs) / speed;
      let moved = false;
      while (elapsed >= step && cur < (stopAt ?? F)) {
        advance(now);
        elapsed -= step;
        moved = true;
      }
      if (moved) {
        updateHud();
        dirty = true;
      }
      if (cur >= (stopAt ?? F)) setPlaying(false);
      if (playing) dirty = true;
    }
    if (stepGlow(dt)) dirty = true;
    if (pulses.length > 0) {
      for (const p of pulses) p.t += dt / 1600;
      for (let i = pulses.length - 1; i >= 0; i--) if (pulses[i]!.t >= 1) pulses.splice(i, 1);
      dirty = true;
    }
    if (fade > 0) {
      fade = Math.max(0, fade - dt / FADE_MS);
      if (fade === 0) {
        // L'ancienne image ne sert plus : on rend sa mémoire.
        fadeCanvas.width = 1;
        fadeCanvas.height = 1;
      }
      dirty = true;
    }
    const moving = stepCamera(dt, false);
    if (moving) dirty = true;
    if (dirty) draw();
    needDraw = false;
    const busy = (playing && inView) || activeCount > 0 || pulses.length > 0 || fade > 0 || shot !== null || moving;
    if (busy) schedule();
    else last = 0;
  }

  /* ---------- Classement et compteurs ---------- */

  const rows = new Map<number, { el: HTMLLIElement; rank: HTMLElement; value: HTMLElement; fill: HTMLElement }>();
  rowsBox.replaceChildren();

  function rowFor(clan: number) {
    let row = rows.get(clan);
    if (row) return row;
    const el = document.createElement("li");
    el.className = clan === GAL ? "film-row is-gal" : "film-row";
    const rank = document.createElement("span");
    rank.className = "film-row-rank";
    const tag = document.createElement("span");
    tag.className = "truncate font-semibold";
    tag.textContent = film.clans[clan]?.tag ?? "Clan supprimé";
    const value = document.createElement("span");
    const bar = document.createElement("span");
    bar.className = "film-bar";
    const fill = document.createElement("i");
    const [r, g, b] = clanRgb(film.clans[clan]?.color ?? null);
    fill.style.background = `rgb(${r} ${g} ${b})`;
    bar.append(fill);
    el.append(rank, tag, value, bar);
    rowsBox.append(el);
    row = { el, rank, value, fill };
    rows.set(clan, row);
    return row;
  }

  function updateHud(): void {
    const frame = cur > 0 ? film.frames[cur - 1] : null;
    const events = frame?.ev ?? 0;
    const when = frame?.at === undefined ? null : fmtEpochHour(frame.at);
    dateLabel.textContent = when;
    dateLabel.hidden = when === null;
    eventLabel.textContent = `${fmt.format(events)} / ${fmt.format(totalEvents)}`;
    landLabel.textContent = fmtPct.format(((frame?.total ?? 0) / film.land) * 100);
    clansLabel.textContent = fmt.format(frame?.clans ?? 0);
    pos.value = String(cur);
    pos.setAttribute("aria-valuetext", `${when === null ? "Événement" : `${when}, événement`} ${fmt.format(events)} sur ${fmt.format(totalEvents)}`);

    const top = frame?.top ?? [];
    const lead = top[0]?.[1] ?? 1;
    const shown = new Set<number>();
    top.forEach(([clan, pixels], position) => {
      shown.add(clan);
      const row = rowFor(clan);
      row.el.hidden = false;
      // La place de la ligne : sa hauteur est dans la feuille de style, le podium se resserre sur un écran bas.
      row.el.style.setProperty("--rang", String(position));
      row.rank.textContent = String(position + 1);
      row.value.textContent = fmt.format(pixels);
      row.fill.style.width = `${((pixels / lead) * 100).toFixed(1)}%`;
    });
    for (const [clan, row] of rows) if (!shown.has(clan)) row.el.hidden = true;

    if (!frame || frame.gal === 0 || frame.rank === null) pinned.textContent = "GAL n'est pas encore sur la carte.";
    else pinned.textContent = `GAL : ${frame.rank}${frame.rank === 1 ? "er" : "e"} avec ${fmt.format(frame.gal)} pixels.`;
  }

  /* ---------- Commandes ---------- */

  const ICON_PLAY = "M2 1l11 6-11 6z";
  const ICON_PAUSE = "M2 1h4v12H2zM8 1h4v12H8z";

  function setPlaying(on: boolean): void {
    playing = on;
    stopAt = null;
    dayFrameMs = 0;
    if (on) started = true;
    const label = on ? "Pause" : cur < F ? "Lecture" : started ? "Rejouer" : "Lancer le film";
    playIcon.setAttribute("d", on ? ICON_PAUSE : ICON_PLAY);
    playLabel.textContent = label;
    if (on) {
      elapsed = 0;
      schedule();
    } else if (started) {
      const frame = cur > 0 ? film.frames[cur - 1] : null;
      const when = frame?.at === undefined ? "" : `le ${fmtEpochHour(frame.at)}, `;
      status.textContent = `Film arrêté ${when}à l'événement ${fmt.format(frame?.ev ?? 0)} sur ${fmt.format(totalEvents)}. ${pinned.textContent}`;
    }
  }

  let autoplayTimer = 0;
  let autoplayPending = motionAllowed();
  function cancelAutoplay(): void {
    autoplayPending = false;
    window.clearTimeout(autoplayTimer);
  }

  /* ---------- Le clan choisi : mis en évidence sur la carte, et dans la liste des clans ---------- */

  // Ce que la carte dit de chaque clan : sa place et son territoire au dernier relevé du film (`standings`).
  const clanLines = film.clans.map((c, i) => (i === 0 ? "" : ligneDuClan(c.tag, film.standings)));
  const clanButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-film-clan]")];

  function markClan(clan: number | null): void {
    for (const button of clanButtons) {
      if (clan !== null && Number(button.dataset.filmClan) === clan) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  /** Le bouton « Vue d'ensemble » n'est là que s'il y a quelque chose à quitter : une vue choisie, ou un clan mis en évidence. */
  function syncWorldChip(): void {
    worldChip.hidden = manual === null && highlighted === null;
  }

  function highlight(clan: number | null): void {
    if (highlighted !== clan) {
      highlighted = clan;
      buildPalette();
      repaint();
    }
    markClan(clan);
    syncWorldChip();
  }

  /** Nomme le clan choisi d'un clic sur la carte, sans bouger la caméra : le visiteur a choisi l'endroit. */
  function selectClan(clan: number | null): void {
    highlight(clan);
    if (clan === null) {
      hideCaption();
    } else {
      const line = clanLines[clan] ?? "";
      showCaption(line, true);
      status.textContent = line;
    }
    invalidate();
  }

  /**
   * Retire tout regard posé sur un front, une zone ou un clan. `keepFree` : une vue que le visiteur a choisie lui-même
   * (zoom, déplacement) reste en place.
   */
  function releaseView(keepFree = false): void {
    if (!(keepFree && free)) {
      manual = null;
      free = false;
    }
    hideCaption();
    highlight(null);
    invalidate();
  }

  playButton.addEventListener("click", () => {
    cancelAutoplay();
    if (playing) {
      setPlaying(false);
      return;
    }
    // Le film se regarde d'où le visiteur a mis la carte.
    releaseView(true);
    markMoment(null);
    requestedMoment = 0;
    if (cur >= F) {
      crossfade();
      seek(0);
    }
    setPlaying(true);
  });

  pos.addEventListener("input", () => {
    cancelAutoplay();
    shot = null;
    requestedMoment = 0;
    setPlaying(false);
    markMoment(null);
    hideCaption();
    seek(Number(pos.value));
  });

  /** Le curseur de vitesse, de × 0,1 à × 1 : le film ralentit dès l'image suivante, sans saut. */
  function setSpeed(value: number): void {
    speed = filmSpeed(value);
    speedValue.textContent = speedLabel(speed);
    speedInput.setAttribute("aria-valuetext", speedText(speed));
  }
  speedInput.addEventListener("input", () => setSpeed(Number(speedInput.value)));

  focusChip.addEventListener("click", () => {
    focus = !focus;
    focusChip.setAttribute("aria-pressed", String(focus));
    buildPalette();
    repaint();
    invalidate();
  });

  worldChip.addEventListener("click", () => releaseView());

  function revealMap(): void {
    map.scrollIntoView({ block: "start", behavior: motionAllowed() ? "smooth" : "auto" });
  }

  /** Rejoue un grand moment, en repartant juste avant lui. */
  function jumpToMoment(frame: number): void {
    cancelAutoplay();
    releaseView();
    revealMap();
    requestedMoment = frame;
    if (motionAllowed()) {
      crossfade();
      seek(Math.max(0, frame - 5));
      setPlaying(true);
      return;
    }
    seek(frame);
    setPlaying(false);
    const moment = momentAt.get(frame);
    if (moment) playMoment(moment, performance.now(), true);
  }
  for (const button of momentButtons) {
    button.addEventListener("click", () => jumpToMoment(Number(button.dataset.filmMoment)));
  }

  /** Rejoue une journée et s'arrête à sa fin. Sans mouvement : directement la carte de la fin de ce jour. */
  function replayDay(start: number, end: number, label: string): void {
    cancelAutoplay();
    releaseView();
    markMoment(null);
    revealMap();
    shot = null;
    requestedMoment = 0;
    if (motionAllowed()) {
      crossfade();
      seek(start);
      setPlaying(true);
      stopAt = end;
      dayFrameMs = DAY_REPLAY_MS / Math.max(1, end - start);
    } else {
      seek(end);
      setPlaying(false);
    }
    showCaption(label);
    status.textContent = label;
  }
  for (const button of document.querySelectorAll<HTMLElement>("[data-film-day]")) {
    button.addEventListener("click", () => replayDay(Number(button.dataset.filmDay), Number(button.dataset.filmDayEnd), button.dataset.filmDayLabel ?? ""));
  }

  /** La carte d'aujourd'hui, à l'arrêt : un regard sur une zone, un front ou un clan se pose sur elle. */
  function showToday(): void {
    cancelAutoplay();
    shot = null;
    setPlaying(false);
    markMoment(null);
    if (cur < F) {
      crossfade();
      seek(F);
    }
  }

  /** Pose un regard : la caméra cadre l'endroit, la légende reste, et « Vue d'ensemble » permet d'en sortir. */
  function look(target: View | null, clan: number | null, label: string): void {
    manual = target;
    free = false;
    highlight(clan);
    showCaption(label, true);
    status.textContent = label;
    revealMap();
    invalidate();
  }

  // Regarder un front ou une zone : la carte d'aujourd'hui, cadrée sur cet endroit.
  for (const button of document.querySelectorAll<HTMLElement>("[data-film-look]")) {
    button.addEventListener("click", () => {
      showToday();
      const clan = button.dataset.clan;
      look(lookAt(Number(button.dataset.x), Number(button.dataset.y), Number(button.dataset.halfWidth), Number(button.dataset.halfHeight)), clan === undefined ? null : Number(clan), button.dataset.filmLook ?? "");
    });
  }

  // Regarder un clan de la liste : la carte d'aujourd'hui, cadrée sur son territoire. Le cadre vient du film affiché, et
  // ne sert qu'à la caméra ; les chiffres dits sont ceux du dernier relevé (`standings`), comptés sur la carte complète.
  for (const button of clanButtons) {
    button.addEventListener("click", () => {
      const clan = Number(button.dataset.filmClan);
      showToday();
      const cadre = cadreDuClan(owner, W, H, clan);
      look(cadre ? lookAt(cadre.x, cadre.y, cadre.halfWidth, cadre.halfHeight) : null, clan, clanLines[clan] ?? "");
    });
  }

  // Le bouton pause du site arrête aussi le film.
  new MutationObserver(() => {
    if (motionAllowed()) return;
    cancelAutoplay();
    clearEffects();
    shot = null;
    if (playing) setPlaying(false);
    invalidate();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    if (e.matches && playing) setPlaying(false);
  });

  /* ---------- La carte se manie : zoom, déplacement, clic sur un territoire ---------- */

  /** La position d'un pointeur dans le dessin, en pixels du dessin. */
  const inCanvas = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = view.getBoundingClientRect();
    const k = r.width === 0 ? 1 : view.width / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };

  /** La vue d'où part un geste du visiteur : celle qu'il a déjà choisie, sinon celle qu'il a sous les yeux. */
  const currentView = (): View => (manual && free ? manual : { x: camera.x, y: camera.y, s: camera.s });

  /** Pose une vue choisie par le visiteur. Revenue à la carte entière, elle rend la main à la caméra. */
  function setFree(target: View, snap: boolean): void {
    const bornee = borner(target, monde, ecran(), MAX_CELL_PX * dpr, covered);
    shot = null;
    if (estVueDEnsemble(bornee, monde, ecran())) {
      manual = null;
      free = false;
    } else {
      manual = bornee;
      free = true;
    }
    syncWorldChip();
    if (snap) placeCamera(camera, cameraTarget());
    invalidate();
  }

  /** Zoome autour d'un point du dessin : par défaut, le milieu de ce qu'aucune fenêtre ne couvre. */
  function zoomBy(factor: number, px = (view.width - covered) / 2, py = view.height / 2): void {
    const from = currentView();
    const echelle = Math.min(Math.max(from.s * factor, worldView().s), MAX_CELL_PX * dpr);
    setFree(zoomer(from, echelle, px, py, ecran()), false);
  }

  /** Déplace la carte de (dx, dy) pixels du dessin, comme si on la tirait. */
  function panBy(dx: number, dy: number, snap: boolean): void {
    const from = currentView();
    setFree({ x: from.x - dx / from.s, y: from.y - dy / from.s, s: from.s }, snap);
  }

  /** Le clan qui occupe la case sous un pointeur. 0 : la mer, une terre neutre, ou hors de la carte. */
  function clanUnder(e: { clientX: number; clientY: number }): number {
    const [px, py] = inCanvas(e);
    const [mx, my] = pointDeCarte(camera, px, py, ecran());
    const x = Math.floor(mx);
    const y = Math.floor(my);
    return x >= 0 && y >= 0 && x < W && y < H ? owner[y * W + x]! : 0;
  }

  /* Survol : quel clan occupe ce territoire, et où l'on est sur la carte complète. */
  function showTip(e: PointerEvent): void {
    const r = view.getBoundingClientRect();
    const clan = clanUnder(e);
    if (clan === 0) {
      tip.hidden = true;
      return;
    }
    tip.textContent = film.clans[clan]?.tag ?? "Clan supprimé";
    tip.hidden = false;
    const left = Math.min(r.width - tip.offsetWidth - 4, e.clientX - r.left + 12);
    tip.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, e.clientY - r.top - 30)}px)`;
  }

  /** La mire suit la souris, et la position sur la carte complète s'écrit à côté de la date (`film.scale` pixels par case du film). */
  function showAim(e: PointerEvent): void {
    if (e.pointerType !== "mouse") return;
    const r = view.getBoundingClientRect();
    mire.hidden = false;
    if (mireV) mireV.style.transform = `translateX(${Math.round(e.clientX - r.left)}px)`;
    if (mireH) mireH.style.transform = `translateY(${Math.round(e.clientY - r.top)}px)`;
    const [px, py] = inCanvas(e);
    const [mx, my] = pointDeCarte(camera, px, py, ecran());
    const position = positionSurLaCarte(mx, my, monde, film.scale);
    coords.textContent = position ?? "";
    coords.hidden = position === null;
  }

  function hideAim(): void {
    tip.hidden = true;
    mire.hidden = true;
    coords.hidden = true;
  }

  const pointers = new Map<number, { x: number; y: number }>();
  /** Un doigt ou la souris : le point de départ, le dernier point, et si le geste est devenu un déplacement. */
  let drag: { x0: number; y0: number; x: number; y: number; moved: boolean } | null = null;
  /** Deux doigts : l'écart et la vue du début du pincement. */
  let pinch: { distance: number; from: View; x: number; y: number } | null = null;
  /** Après un déplacement, le clic que le navigateur envoie quand même ne compte pas. */
  let swallowClick = false;

  const twoFingers = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  };

  view.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const [x, y] = inCanvas(e);
    pointers.set(e.pointerId, { x, y });
    try {
      // Le geste continue même si le pointeur sort de la carte.
      view.setPointerCapture(e.pointerId);
    } catch {
      // Un pointeur déjà relâché ne se capture pas : le geste reste suivi tant qu'il est sur la carte.
    }
    swallowClick = false;
    if (pointers.size === 1) {
      drag = { x0: x, y0: y, x, y, moved: false };
      showTip(e);
    } else {
      // Un deuxième doigt : le geste devient un pincement, plus un clic.
      const fingers = twoFingers();
      pinch = fingers ? { ...fingers, from: currentView() } : null;
      drag = null;
      swallowClick = true;
      hideAim();
    }
  });

  view.addEventListener("pointermove", (e) => {
    const held = pointers.get(e.pointerId);
    if (!held) {
      showTip(e);
      showAim(e);
      return;
    }
    const [x, y] = inCanvas(e);
    held.x = x;
    held.y = y;
    if (pinch) {
      const fingers = twoFingers();
      if (!fingers || pinch.distance === 0) return;
      // Le point de la carte tenu entre les deux doigts au départ reste entre eux.
      const echelle = Math.min(Math.max(pinch.from.s * (fingers.distance / pinch.distance), worldView().s), MAX_CELL_PX * dpr);
      const [mx, my] = pointDeCarte(pinch.from, pinch.x, pinch.y, ecran());
      setFree({ x: mx - (fingers.x - view.width / 2) / echelle, y: my - (fingers.y - view.height / 2) / echelle, s: echelle }, true);
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < DRAG_PX * dpr) return;
    if (!drag.moved) {
      drag.moved = true;
      view.classList.add("est-saisie");
      hideAim();
    }
    panBy(x - drag.x, y - drag.y, true);
    drag.x = x;
    drag.y = y;
  });

  const release = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      // Un doigt reste après un pincement : il continue en déplacement, sans clic au bout.
      const [rest] = [...pointers.values()];
      drag = rest ? { x0: rest.x, y0: rest.y, x: rest.x, y: rest.y, moved: true } : null;
      return;
    }
    view.classList.remove("est-saisie");
    const clicked = drag !== null && !drag.moved && !swallowClick && e.type === "pointerup";
    if (drag?.moved) swallowClick = true;
    drag = null;
    if (!clicked) return;
    // Un clic sur un territoire nomme son clan ; un deuxième clic, ou un clic ailleurs, le relâche.
    const clan = clanUnder(e);
    if (clan === 0 || clan === highlighted) {
      if (highlighted !== null) selectClan(null);
    } else {
      selectClan(clan);
    }
  };
  view.addEventListener("pointerup", release);
  view.addEventListener("pointercancel", release);
  view.addEventListener("pointerleave", (e) => {
    if (!pointers.has(e.pointerId)) hideAim();
  });
  // Les effets du site lancent une onde à chaque clic : pas au bout d'un déplacement de la carte.
  view.addEventListener("click", (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
  });
  // Au doigt, le navigateur envoie son clic après coup, à ce qui se trouve alors sous le doigt : le bouton « Vue
  // d'ensemble », qui vient d'apparaître, relâcherait aussitôt le clan qu'on vient de toucher. La carte a déjà traité le
  // toucher : ce clic n'a pas lieu.
  view.addEventListener("touchend", (e) => {
    if (e.cancelable) e.preventDefault();
  });

  view.addEventListener(
    "wheel",
    (e) => {
      // Sur un écran si bas que la page défile, la molette garde son rôle : Ctrl + molette zoome alors la carte.
      if (!e.ctrlKey && pageScrolls()) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const [px, py] = inCanvas(e);
      // Un pavé tactile pince par petits pas (Ctrl + molette) : ils comptent davantage.
      zoomBy(Math.exp(-delta / (e.ctrlKey ? 110 : 320)), px, py);
    },
    { passive: false },
  );

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-film-zoom]")) {
    button.addEventListener("click", () => zoomBy(Number(button.dataset.filmZoom) > 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
  }

  // Au clavier, une fois la carte choisie : flèches, plus et moins, zéro pour la vue d'ensemble. La ligne d'aide de la
  // page le dit aux lecteurs d'écran.
  map.tabIndex = 0;
  map.setAttribute("aria-describedby", "carte-clavier");
  map.addEventListener("keydown", (e) => {
    // La carte de l'alliance, à la place du film, a ses propres touches (src/scripts/alliance-ecran.ts).
    if (e.target !== map || e.ctrlKey || e.metaKey || e.altKey || map.dataset.vue === "alliance") return;
    const stepX = view.width * KEY_PAN;
    const stepY = view.height * KEY_PAN;
    if (e.key === "ArrowLeft") panBy(stepX, 0, false);
    else if (e.key === "ArrowRight") panBy(-stepX, 0, false);
    else if (e.key === "ArrowUp") panBy(0, stepY, false);
    else if (e.key === "ArrowDown") panBy(0, -stepY, false);
    else if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
    else if (e.key === "-") zoomBy(1 / ZOOM_STEP);
    // La touche du zéro, avec ou sans Maj : sur un clavier français, elle écrit « à » sans elle.
    else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") releaseView();
    else return;
    e.preventDefault();
  });

  // Une fenêtre s'ouvre, se ferme ou change de place : ce qu'elle couvre de la carte change (src/scripts/carte-console.ts).
  root.addEventListener("carte:fenetre", () => {
    measure();
    invalidate();
  });
  // La carte de l'alliance prend la place du film (src/scripts/alliance-ecran.ts) : le film s'arrête là où il en est.
  root.addEventListener("carte:alliance", (e) => {
    if (!(e as CustomEvent<{ on: boolean }>).detail.on) return;
    cancelAutoplay();
    if (playing) setPlaying(false);
  });
  window.addEventListener("resize", syncTouch);

  /* ---------- Démarrage : la carte finale d'abord, puis le film s'il est visible ---------- */

  const peak = Math.max(1, ...film.frames.map((f) => f.gal));
  let curve = "M0 42";
  film.frames.forEach((f, i) => {
    curve += `L${i + 1} ${(42 - (f.gal / peak) * 38).toFixed(1)}`;
  });
  const curveSvg = one<SVGSVGElement>("[data-film-curve]");
  curveSvg.setAttribute("viewBox", `0 0 ${F} 42`);
  curveSvg.querySelector("path")?.setAttribute("d", `${curve}L${F} 42Z`);
  pos.max = String(F);
  const ticks = one<HTMLElement>("[data-film-ticks]");
  for (const moment of moments) {
    const tick = document.createElement("i");
    tick.className = "film-tick";
    tick.style.left = `${(moment.frame / F) * 100}%`;
    ticks.append(tick);
  }

  // Les vrais jours sous la frise : autant de dates écrites que la largeur en laisse.
  const dayMarks = filmDayMarks(film.frames);
  const dates = one<HTMLElement>("[data-film-dates]");
  for (const mark of dayMarks) {
    const tick = document.createElement("i");
    tick.className = "film-day";
    tick.style.left = `${(mark.frame / F) * 100}%`;
    dates.append(tick);
  }
  const dayLabels: HTMLElement[] = [];
  const writeDayLabels = () => {
    for (const label of dayLabels.splice(0)) label.remove();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    for (const { mark, left } of placeDayLabels(dayMarks, F, dates.clientWidth, DAY_LABEL_REM * rem)) {
      const label = document.createElement("span");
      label.className = "film-date";
      label.style.left = `${left}px`;
      label.textContent = fmtDay(mark.date);
      dates.append(label);
      dayLabels.push(label);
    }
  };
  new ResizeObserver(writeDayLabels).observe(dates);

  /* ---------- Reprendre là où le visiteur en était ---------- */

  // Le même relevé que « Depuis votre dernière visite » sur l'accueil : il reste dans le navigateur.
  const resume = ((): ReturnType<typeof filmResume> => {
    const raw = root.dataset.visit;
    if (!raw) return null;
    try {
      const snapshot = JSON.parse(raw) as VisitSnapshot;
      const stored = readVisitState(localStorage.getItem(VISIT_KEY));
      const state = nextVisitState(stored, snapshot, new Date());
      localStorage.setItem(VISIT_KEY, JSON.stringify(state));
      return stored ? filmResume(film.frames, state.baseline.mapAt, state.since, state.baseline.pixels) : null;
    } catch {
      // Stockage indisponible : le film complet, comme à une première visite.
      return null;
    }
  })();

  buildPalette();
  applyUpTo(F);
  repaint();
  updateHud();
  setPlaying(false);
  // Le navigateur peut rendre au curseur la vitesse d'une visite précédente (retour arrière) : le film la reprend.
  setSpeed(Number(speedInput.value));
  if (resume && !motionAllowed()) {
    // Sans animation, le film attend une demande : le visiteur lit au moins ce qui a changé.
    showCaption(resume.caption, true);
    status.textContent = resume.caption;
  }

  view.hidden = false;
  for (const el of document.querySelectorAll<HTMLElement>("[data-film-ready]")) el.hidden = false;
  new ResizeObserver(resize).observe(map);
  resize();
  measure();
  stepCamera(0, true);
  invalidate();

  new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1]?.isIntersecting ?? false;
      if (!inView) return;
      schedule();
      if (autoplayPending) {
        autoplayPending = false;
        autoplayTimer = window.setTimeout(() => {
          if (!motionAllowed()) return;
          crossfade();
          if (resume && resume.start > 0 && resume.start < F) {
            // Celui qui revient ne revoit que la suite, jamais en moins de quelques secondes.
            seek(resume.start);
            setPlaying(true);
            dayFrameMs = RESUME_MIN_MS / (F - resume.start);
          } else {
            seek(0);
            setPlaying(true);
          }
          if (resume) {
            showCaption(resume.caption);
            status.textContent = resume.caption;
          }
        }, AUTOPLAY_DELAY_MS);
      }
    },
    { threshold: 0.2 },
  ).observe(map);
}

function init(): void {
  const root = document.querySelector<HTMLElement>("[data-film]");
  if (!root) return;
  const message = root.querySelector<HTMLElement>("[data-film-message]");
  const retry = root.querySelector<HTMLButtonElement>("[data-film-retry]");
  const text = root.querySelector<HTMLElement>("[data-film-message-text]");

  const start = async () => {
    if (message) message.hidden = true;
    try {
      const { film, frames, terrain } = await loadFilmData(root.dataset.assets ?? "");
      mount(root, film, frames, terrain);
    } catch (e) {
      console.warn("Film de la carte indisponible :", e);
      if (text) text.textContent = "Le film n'a pas pu être chargé. La carte finale et tous les chiffres restent affichés.";
      if (message) message.hidden = false;
    }
  };
  retry?.addEventListener("click", () => void start());
  void start();
}

init();
