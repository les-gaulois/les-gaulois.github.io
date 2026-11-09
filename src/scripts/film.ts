/**
 * Lecteur du film de la carte. Le HTML contient déjà la carte finale et tous les
 * chiffres : ce script n'ajoute que le mouvement, et ne change aucune valeur.
 *
 * Halo, lueurs et plans rapprochés sont décoratifs : ils disparaissent avec « réduire
 * les animations » ou le bouton pause du site, et le film ne démarre alors que sur demande.
 * Les grands moments viennent des chiffres de chaque image. La caméra glisse sans à-coup
 * (`src/lib/fx/camera.ts`) et ne s'approche seule qu'à la vitesse × 1, jamais coup sur coup.
 */
import { clanRgb, type DecodedFrames } from "../lib/clanmap/codec";
import { filmDayMarks, placeDayLabels } from "../lib/clanmap/days";
import { findMoments, type Moment } from "../lib/clanmap/moments";
import { filmResume } from "../lib/clanmap/reprise";
import { fmtDay, fmtEpochDay, fmtEpochHour } from "../lib/format";
import { CAMERA_CLICK_MS, CAMERA_SMOOTH_MS, FILM_MS, SHOT_MAX_ZOOM, SHOT_MS, SHOT_SPACING_MS, moveCamera, pickShots, placeCamera, type Camera } from "../lib/fx/camera";
import { motionAllowed } from "../lib/fx/motion";
import { frNumber } from "../lib/nombre";
import type { StoredClanMapFilm } from "../lib/schemas";
import { nextVisitState, readVisitState, VISIT_KEY, type VisitSnapshot } from "../lib/visite";
import { loadFilmData } from "./film-data";

const AUTOPLAY_DELAY_MS = 1_500;
const ROW_HEIGHT = 38;
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
  const followChip = one<HTMLButtonElement>("[data-film-follow]");
  const worldChip = one<HTMLButtonElement>("[data-film-world]");

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
  // La liste des grands moments est sous le film, hors de son bloc : on la cherche dans toute la page.
  const momentButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-film-moment]")];
  /** Les moments filmés de près à la vitesse × 1 : les plus importants, jamais coup sur coup. */
  const shotFrames = pickShots(moments, FILM_MS / F);
  /** Le moment qu'on vient de demander dans la liste : lui a toujours son plan rapproché. */
  let requestedMoment = 0;
  /** Le début du dernier plan rapproché : un plan automatique attend au moins `SHOT_SPACING_MS`, même après un clic. */
  let lastShotAt = -Infinity;
  let shot: (View & { until: number }) | null = null;
  let captionTimer = 0;

  function showCaption(text: string, keep = false): void {
    window.clearTimeout(captionTimer);
    // Un sous-titre déjà affiché change de texte sans réapparaître : rien ne saute à vitesse rapide.
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
    if (!motionAllowed() || follow || manual) return;
    // À × 2 et × 4, la caméra reste où elle est : seul le moment demandé dans la liste est filmé de près.
    if (!requested && (speed !== 1 || !shotFrames.has(moment.frame) || now - lastShotAt < SHOT_SPACING_MS)) return;
    const cam = film.frames[moment.frame - 1]?.cam;
    if (!cam) return;
    const target = galView(cam, SHOT_MAX_ZOOM);
    shot = { ...target, until: now + SHOT_MS };
    lastShotAt = now;
    addPulse(target.x, target.y, 120, GAIN);
  }

  /* ---------- Caméra : des mouvements lents, sans à-coup ---------- */

  const camera: Camera = { x: W / 2, y: H / 2, s: 1, vx: 0, vy: 0, vz: 0 };
  let follow = false;
  let manual: View | null = null;
  let dpr = 1;

  function worldView(): View {
    return { x: W / 2, y: H / 2, s: Math.min(view.width / W, view.height / H) };
  }

  /** Tout le territoire de GAL, sans s'approcher plus que `maxZoom` fois la vue d'ensemble. */
  function galView(c: readonly [number, number, number, number], maxZoom = Infinity): View {
    const world = worldView().s;
    const halfW = Math.max(c[2] * 2.7, 255);
    const halfH = Math.max(c[3] * 2.7, 165);
    const fit = Math.min(view.width / (2 * halfW), view.height / (2 * halfH));
    return { x: c[0], y: c[1], s: Math.min(Math.max(fit, world), 3 * dpr, world * maxZoom) };
  }

  function cameraTarget(): View {
    if (manual) return manual;
    if (shot) return shot;
    const c = cur > 0 ? film.frames[cur - 1]?.cam : null;
    if (follow && c) return galView(c);
    return worldView();
  }

  function stepCamera(dt: number, snap: boolean): boolean {
    const target = cameraTarget();
    if (snap || !motionAllowed()) {
      const moved = camera.x !== target.x || camera.y !== target.y || camera.s !== target.s;
      placeCamera(camera, target);
      return moved;
    }
    return moveCamera(camera, target, dt, manual ? CAMERA_CLICK_MS : CAMERA_SMOOTH_MS);
  }

  function resize(): void {
    const r = map.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2) * (lowPower ? LOW_POWER_RESOLUTION : 1);
    const width = Math.max(1, Math.round(r.width * dpr));
    const height = Math.max(1, Math.round(r.height * dpr));
    if (width === view.width && height === view.height) return;
    view.width = width;
    view.height = height;
    fade = 0;
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
      c.font = `700 ${size}px "Red Hat Text Variable", system-ui, sans-serif`;
      const pillW = c.measureText("GAL").width + 12 * dpr;
      const pillH = size + 8 * dpr;
      const sx = view.width / 2 + (cam[0] - camera.x) * camera.s;
      const sy = view.height / 2 + (cam[1] - camera.y) * camera.s - pillH;
      c.fillStyle = "rgb(6 11 34 / 0.88)";
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

    // Le zoom par rapport à la vue d'ensemble, lu par les tests : 1 tant que la caméra ne s'approche pas.
    const zoom = (camera.s / worldView().s).toFixed(2);
    if (view.dataset.zoom !== zoom) view.dataset.zoom = zoom;
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
    rank.className = "text-muted";
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
      row.el.style.transform = `translateY(${position * ROW_HEIGHT}px)`;
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

  /** Retire tout regard posé sur un front ou une zone. */
  function releaseView(): void {
    manual = null;
    worldChip.hidden = true;
    hideCaption();
    if (highlighted !== null) {
      highlighted = null;
      buildPalette();
      repaint();
    }
    invalidate();
  }

  playButton.addEventListener("click", () => {
    cancelAutoplay();
    if (playing) {
      setPlaying(false);
      return;
    }
    releaseView();
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

  const speedChips = [...root.querySelectorAll<HTMLButtonElement>("[data-film-speed]")];
  for (const chip of speedChips) {
    chip.addEventListener("click", () => {
      speed = Number(chip.dataset.filmSpeed);
      for (const other of speedChips) other.setAttribute("aria-pressed", String(other === chip));
      // Plus vite, la caméra quitte le plan rapproché et revient doucement à la vue choisie.
      if (speed !== 1) {
        shot = null;
        invalidate();
      }
    });
  }

  focusChip.addEventListener("click", () => {
    focus = !focus;
    focusChip.setAttribute("aria-pressed", String(focus));
    buildPalette();
    repaint();
    invalidate();
  });

  function setFollow(on: boolean): void {
    follow = on;
    if (on) manual = null;
    shot = null;
    followChip.setAttribute("aria-pressed", String(on));
    invalidate();
  }
  followChip.addEventListener("click", () => setFollow(!follow));
  worldChip.addEventListener("click", releaseView);

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

  // Regarder un front ou une zone : la carte d'aujourd'hui, cadrée sur cet endroit.
  for (const button of document.querySelectorAll<HTMLElement>("[data-film-look]")) {
    button.addEventListener("click", () => {
      cancelAutoplay();
      shot = null;
      setPlaying(false);
      markMoment(null);
      if (cur < F) {
        crossfade();
        seek(F);
      }
      const halfW = Math.max(Number(button.dataset.halfWidth), 130);
      const halfH = Math.max(Number(button.dataset.halfHeight), 85);
      const clan = button.dataset.clan;
      highlighted = clan === undefined ? null : Number(clan);
      buildPalette();
      repaint();
      manual = {
        x: Number(button.dataset.x),
        y: Number(button.dataset.y),
        s: Math.min(Math.max(Math.min(view.width / (2.4 * halfW), view.height / (2.4 * halfH)), worldView().s), 4 * dpr),
      };
      worldChip.hidden = false;
      showCaption(button.dataset.filmLook ?? "", true);
      status.textContent = button.dataset.filmLook ?? "";
      revealMap();
      invalidate();
    });
  }

  // Avec « réduire les animations » demandé en cours de route, le film s'arrête et ses lueurs s'éteignent.
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    if (!e.matches) return;
    cancelAutoplay();
    clearEffects();
    shot = null;
    if (playing) setPlaying(false);
    invalidate();
  });

  /* ---------- Survol : quel clan occupe ce territoire ---------- */

  function showTip(e: PointerEvent): void {
    const r = view.getBoundingClientRect();
    const scale = view.width / r.width;
    const x = Math.floor(((e.clientX - r.left) * scale - view.width / 2) / camera.s + camera.x);
    const y = Math.floor(((e.clientY - r.top) * scale - view.height / 2) / camera.s + camera.y);
    const clan = x >= 0 && y >= 0 && x < W && y < H ? owner[y * W + x]! : 0;
    if (clan === 0) {
      tip.hidden = true;
      return;
    }
    tip.textContent = film.clans[clan]?.tag ?? "Clan supprimé";
    tip.hidden = false;
    const left = Math.min(r.width - tip.offsetWidth - 4, e.clientX - r.left + 12);
    tip.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, e.clientY - r.top - 30)}px)`;
  }
  view.addEventListener("pointermove", showTip);
  view.addEventListener("pointerdown", showTip);
  view.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });

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
  if (matchMedia("(max-width: 43.75rem)").matches) setFollow(true);
  if (resume && !motionAllowed()) {
    // Sans animation, le film attend une demande : le visiteur lit au moins ce qui a changé.
    showCaption(resume.caption, true);
    status.textContent = resume.caption;
  }

  view.hidden = false;
  for (const el of document.querySelectorAll<HTMLElement>("[data-film-ready]")) el.hidden = false;
  new ResizeObserver(resize).observe(map);
  resize();
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
