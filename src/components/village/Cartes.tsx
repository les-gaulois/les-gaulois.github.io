import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { FINITIONS, HAUTEUR_DE_TOILE, LARGEUR_DE_TOILE, finitionAnimee, fusionDeLaFinition, type FinitionDeCarte } from "../../lib/fx/finitions-carte";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, RARETES, TENUE_DE_DEPART, casesDuGaulois, type Tenue } from "../../lib/gaulois";
import type { EtatDeLaBanniere } from "../../lib/village/bannieres";
import { CARTES, finitionParId, lireMesCartes, refusDeCarte, type FinitionDuRayon, type IdDeFinition, type MesCartes } from "../../lib/village/cartes";
import { manque, stateres } from "../../lib/village/ecran-boutique";
import { monterLesCartes } from "../../scripts/cartes-mouvement";
import { Problem, Success, messageOf } from "../compte/common";
import { BANNIERE_CHOISIE } from "./Bannieres";
import { Compte, Dialogue, Refus, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Prix, peindre } from "./BoutiquePixels";
import { LivreDesBannieres, type DessinDuLivre } from "./LivreDesBannieres";

/**
 * Le rayon « Cartes » de la boutique (`src/lib/village/cartes.ts`) : les trente-trois finitions de la carte du membre,
 * celle qui paraît en haut de l'accueil quand il est sur le podium de la semaine. Présenté comme le rayon des bannières,
 * à la demande du pilote (17 novembre 2026 : « exactement comme la boutique bannière, le style de livre ») : le même livre
 * (`LivreDesBannieres.tsx`, avec un autre dessin), où la finition touchée s'envole et se dresse en carte, animée, devant
 * la bannière que le membre montre ; à côté, sa fiche, son prix et le bouton d'achat ; au-dessus, le filtre par rareté.
 * Rien n'est caché derrière un prix : toute finition se voit avant l'achat. Le serveur décide de tout (`get_mes_cartes`,
 * `acheter_carte`, `choisir_carte`) ; l'écran ne montre que ce qu'il a reçu, et jamais le solde d'un autre.
 */
type Etat = { kind: "lecture" } | { kind: "panne" } | { kind: "pret"; mes: MesCartes };

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
const RARETES_DES_CARTES = ["commun", "peu-commun", "epique", "mystique", "legendaire"] as const;
/** La carte dressée dans le livre : un quart de sa largeur, au milieu, plus haute que large. */
const PLACE_DE_LA_CARTE = { gauche: 0.375, largeur: 0.25, hauteurSurLargeur: HAUTEUR_DE_TOILE / LARGEUR_DE_TOILE };

/** L'instant où chaque animation est la plus parlante, en secondes : l'image fixe de sa case. Les autres sont prises à 2,4 s. */
const INSTANT_DE_LA_VIGNETTE: Partial<Record<FinitionDeCarte, number>> = {
  "champignon-atomique": 4.2,
  explosion: 0.8,
  "feu-d-artifice": 1.9,
  foudre: 0.12,
  piratage: 4,
  lancement: 2.6,
  supernova: 1,
};

const ARC_EN_CIEL = ["#ff5a8a", "#ffd24a", "#5aff9e", "#4ad2ff", "#a56bff", "#ff5a8a"];
const hasard = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** L'image fixe d'un reflet, pour sa case : le même dessin que la feuille de style, posé une fois sur la toile. */
function peindreLeReflet(c: CanvasRenderingContext2D, id: string): void {
  const W = LARGEUR_DE_TOILE;
  const H = HAUTEUR_DE_TOILE;
  const degrade = (x0: number, y0: number, x1: number, y1: number, arrets: readonly (readonly [number, string])[]): CanvasGradient => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    for (const [p, couleur] of arrets) g.addColorStop(p, couleur);
    return g;
  };
  const halo = (x: number, y: number, rayon: number, couleur: string): void => {
    const g = c.createRadialGradient(x, y, 0, x, y, rayon);
    g.addColorStop(0, couleur);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  };
  const points = (n: number, couleur: string, dans: (x: number, y: number) => boolean): void => {
    c.fillStyle = couleur;
    for (let i = 0; i < n; i++) {
      const x = hasard(i) * W;
      const y = hasard(i + 400) * H;
      if (dans(x, y)) c.fillRect(Math.round(x), Math.round(y), i % 4 ? 1 : 2, i % 4 ? 1 : 2);
    }
  };
  c.globalCompositeOperation = "screen";
  if (id === "arc-en-ciel" || id === "prisme") {
    c.globalAlpha = 0.5;
    if (id === "prisme" && typeof c.createConicGradient === "function") {
      const g = c.createConicGradient(0.6, W / 2, H * 0.62);
      ARC_EN_CIEL.forEach((couleur, i) => g.addColorStop(i / (ARC_EN_CIEL.length - 1), couleur));
      c.fillStyle = g;
    } else {
      c.fillStyle = degrade(
        0,
        0,
        W,
        H * 0.7,
        ARC_EN_CIEL.map((couleur, i) => [i / (ARC_EN_CIEL.length - 1), couleur] as const),
      );
    }
    c.fillRect(0, 0, W, H);
  } else if (id === "tricolore") {
    c.globalAlpha = 0.75;
    c.fillStyle = degrade(0, H * 0.2, W, H * 0.5, [
      [0.1, "transparent"],
      [0.32, "#2b6bff"],
      [0.5, "#f4f7ff"],
      [0.68, "#ff3b4d"],
      [0.9, "transparent"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "pluie-d-eclats") {
    c.globalAlpha = 0.5;
    c.fillStyle = degrade(0, 0, W, H, [
      [0, "#ff8ad0"],
      [0.5, "#8ad0ff"],
      [1, "#b8ff8a"],
    ]);
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
    points(260, "#f4f7ff", (x, y) => Math.abs(x + y * 0.5 - W * 0.9) < 34);
  } else if (id === "cristal") {
    c.globalAlpha = 0.28;
    c.fillStyle = "#f4f7ff";
    for (let y = 0; y < H; y += 12) for (let x = (y / 12) % 2 ? 12 : 0; x < W; x += 24) c.fillRect(x, y, 12, 12);
    c.globalAlpha = 0.4;
    c.fillStyle = degrade(0, 0, W, H, [
      [0, "#8af3ff"],
      [0.4, "#f4f7ff"],
      [0.65, "#c9a8ff"],
      [1, "#8af3ff"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "braise") {
    c.globalAlpha = 0.95;
    halo(W / 2, H * 1.08, H * 0.75, "#ff8a2e");
    halo(W / 2, H * 1.1, H * 0.4, "#ffd27a");
    points(60, "#ffd27a", (_x, y) => y > H * 0.45);
  } else if (id === "feuille-d-or") {
    c.globalAlpha = 0.45;
    c.fillStyle = degrade(0, 0, W * 0.4, H, [
      [0, "#ffd75e"],
      [1, "#b97a12"],
    ]);
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.85;
    c.fillStyle = degrade(0, H * 0.25, W, H * 0.6, [
      [0.25, "transparent"],
      [0.45, "#fff3b0"],
      [0.5, "#ffcf4a"],
      [0.55, "#fff3b0"],
      [0.75, "transparent"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "hologramme") {
    c.globalAlpha = 0.45;
    c.fillStyle = "#78dcff";
    for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
    c.globalAlpha = 0.7;
    c.fillStyle = degrade(0, H * 0.3, 0, H * 0.6, [
      [0, "transparent"],
      [0.5, "#78dcff"],
      [1, "transparent"],
    ]);
    c.fillRect(0, 0, W, H);
  } else if (id === "aurore") {
    c.globalAlpha = 0.7;
    halo(W * 0.2, H * 0.25, W * 0.8, "#3dffb0");
    halo(W * 0.85, H * 0.45, W * 0.9, "#4ab8ff");
    halo(W * 0.4, H * 0.9, W * 0.9, "#b06bff");
  } else if (id === "cosmos") {
    c.globalAlpha = 0.6;
    halo(W * 0.6, H * 0.3, W * 0.9, "#ff6bd6");
    halo(W * 0.3, H * 0.8, W, "#4a6bff");
    c.globalAlpha = 1;
    points(110, "#f4f7ff", () => true);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}

let toilesDeTravail: [CanvasRenderingContext2D, CanvasRenderingContext2D] | null = null;
/** Deux toiles hors de la page, les mêmes pour toutes les cases : le fond et le devant d'une animation, le temps de les poser. */
function travail(): [CanvasRenderingContext2D, CanvasRenderingContext2D] | null {
  if (toilesDeTravail) return toilesDeTravail;
  const faire = (): CanvasRenderingContext2D | null => {
    const toile = document.createElement("canvas");
    toile.width = LARGEUR_DE_TOILE;
    toile.height = HAUTEUR_DE_TOILE;
    return toile.getContext("2d");
  };
  const fond = faire();
  const devant = faire();
  toilesDeTravail = fond && devant ? [fond, devant] : null;
  return toilesDeTravail;
}

/**
 * L'image d'une finition, pour sa case du livre et son vol : la carte sans le Gaulois, devant la bannière du membre (ou le
 * fond marine), avec la finition en image fixe. Rien ne bouge dans les cases : la finition s'anime une fois dressée.
 */
function peindreLaVignette(toile: HTMLCanvasElement, finition: FinitionDuRayon, banniere: HTMLImageElement | null): void {
  const c = toile.getContext("2d");
  if (!c) return;
  const W = LARGEUR_DE_TOILE;
  const H = HAUTEUR_DE_TOILE;
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
  c.imageSmoothingEnabled = false;
  if (banniere && banniere.naturalWidth > 0) {
    // La bannière remplit la carte, comme sur l'accueil : rognée sur les côtés, jamais déformée.
    const echelle = Math.max(W / banniere.naturalWidth, H / banniere.naturalHeight);
    const l = banniere.naturalWidth * echelle;
    const h = banniere.naturalHeight * echelle;
    c.drawImage(banniere, (W - l) / 2, (H - h) / 2, l, h);
  } else {
    const g = c.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, "#2148b8");
    g.addColorStop(0.72, "#0a1230");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  const nom = finitionAnimee(finition.id);
  if (!nom) {
    peindreLeReflet(c, finition.id);
    return;
  }
  const t = travail();
  if (!t) return;
  const [fond, devant] = t;
  for (const x of t) {
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, W, H);
  }
  FINITIONS[nom](fond, devant, INSTANT_DE_LA_VIGNETTE[nom] ?? 2.4, 0.3, -0.15);
  const fusion = fusionDeLaFinition(nom);
  c.globalCompositeOperation = fusion === "normal" ? "source-over" : fusion;
  c.drawImage(fond.canvas, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.drawImage(devant.canvas, 0, 0);
}

/** La carte dressée dans le livre : le Gaulois du membre devant sa bannière et la finition regardée, animée comme sur l'accueil. */
function CarteDuLivre({ finition, tenue, fond }: { finition: FinitionDuRayon; tenue: Tenue; fond: string | undefined }) {
  const racine = useRef<HTMLDivElement>(null);
  const gaulois = useRef<HTMLCanvasElement>(null);
  const cases = useMemo(() => casesDuGaulois(tenue), [tenue]);
  useEffect(() => {
    peindre(gaulois.current, GAULOIS_LARGEUR, GAULOIS_HAUTEUR, cases);
  }, [cases, finition.id]);
  // À chaque finition dressée, la carte est refaite (`key`) et son mouvement repart.
  useEffect(() => (racine.current ? monterLesCartes(racine.current, { sonde: true }) : undefined), [finition.id]);
  return (
    <div ref={racine} class="livre-carte" aria-hidden="true">
      <div class="podium-carte-case">
        <div key={finition.id} class="podium-carte" data-metal="or" data-finition={finition.id} data-reflet={finition.animee ? undefined : ""}>
          <span class="podium-carte-face" style={fond}>
            <canvas class="podium-carte-fx" data-toile="fond" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
            <i class="podium-carte-holo" />
            <i class="podium-carte-eclat" />
          </span>
          <span class="podium-carte-gaulois" style={`--w:${GAULOIS_LARGEUR};--h:${GAULOIS_HAUTEUR};--e:0.78`}>
            <canvas ref={gaulois} width={GAULOIS_LARGEUR} height={GAULOIS_HAUTEUR} />
          </span>
          <canvas class="podium-carte-fx podium-carte-fx-devant" data-toile="devant" width={LARGEUR_DE_TOILE} height={HAUTEUR_DE_TOILE} />
        </div>
      </div>
    </div>
  );
}

export function SectionDesCartes({ tenue, onSolde, onRefus }: { tenue: Tenue | null; onSolde: (reste: number) => void; onRefus: () => void }) {
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [vue, setVue] = useState<IdDeFinition>(CARTES[0]!.id);
  const [rarete, setRarete] = useState<(typeof RARETES_DES_CARTES)[number] | null>(null);
  // La fenêtre d'achat : fermée, à confirmer, en envoi, refusée (il ne reste qu'à fermer) ou faite (« est à vous »).
  const [achat, setAchat] = useState<"ferme" | "confirmer" | "envoi" | "refuse" | "fait">("ferme");
  const [refus, setRefus] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const tenueVue = tenue ?? TENUE_DE_DEPART;

  const lire = useCallback(async (discret = false): Promise<MesCartes | null> => {
    const mes = lireMesCartes(await call<unknown>("get_mes_cartes").catch(() => null));
    if (mes) setEtat({ kind: "pret", mes });
    else if (!discret) setEtat({ kind: "panne" });
    return mes;
  }, []);
  useEffect(() => {
    void lire().then((mes) => {
      if (mes?.porte) setVue(mes.porte);
    });
  }, [lire]);

  // La bannière que le membre montre, pour voir la finition et la bannière ensemble, comme sur l'accueil. De l'habillage :
  // sans bannière, ou si sa lecture échoue, la carte garde son fond marine. Relue quand il en choisit une autre.
  const [banniere, setBanniere] = useState<string | null>(null);
  const [imageDeBanniere, setImageDeBanniere] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const lireLaBanniere = () =>
      void call<unknown>("get_mes_bannieres").then(
        (reponse) => {
          const porte = typeof reponse === "object" && reponse !== null ? (reponse as { porte?: unknown }).porte : null;
          setBanniere(typeof porte === "string" && /^[a-z]+(-[a-z]+)*$/.test(porte) ? porte : null);
        },
        () => setBanniere(null),
      );
    lireLaBanniere();
    window.addEventListener(BANNIERE_CHOISIE, lireLaBanniere);
    return () => window.removeEventListener(BANNIERE_CHOISIE, lireLaBanniere);
  }, []);
  const adresse = banniere ? `${basePath()}/bannieres/${banniere}.png` : null;
  useEffect(() => {
    setImageDeBanniere(null);
    if (!adresse) return;
    const image = new Image();
    image.onload = () => setImageDeBanniere(image);
    image.src = adresse;
    return () => {
      image.onload = null;
    };
  }, [adresse]);
  const fond = adresse ? `--banniere:url("${adresse}")` : undefined;

  const finition = finitionParId(vue) ?? CARTES[0]!;
  const mes = etat.kind === "pret" ? etat.mes : null;
  const prix = mes?.prix[finition.rarete] ?? null;
  const etatDe = (id: string): EtatDeLaBanniere => (mes?.porte === id ? "montree" : mes?.possedees.some((p) => p === id) ? "a-moi" : "a-acheter");
  const etatVu = etatDe(finition.id);
  const montree = mes?.porte ? finitionParId(mes.porte) : null;
  const motDe = (id: string): string => {
    const e = etatDe(id);
    const p = mes?.prix[finitionParId(id)?.rarete ?? "commun"];
    return e === "montree" ? "sur votre carte" : e === "a-moi" ? "à vous" : p ? stateres(p) : "";
  };

  const comptes = useMemo(() => Object.fromEntries(RARETES_DES_CARTES.map((r) => [r, CARTES.filter((c) => c.rarete === r).length])) as Record<(typeof RARETES_DES_CARTES)[number], number>, []);
  const duLivre = useMemo(() => (rarete ? CARTES.filter((c) => c.rarete === rarete) : CARTES), [rarete]);

  // Le dessin du livre : les finitions à la place des bannières. Refait quand la bannière ou la tenue change.
  const dessin = useMemo<DessinDuLivre>(
    () => ({
      genre: "cartes",
      label: "Les finitions",
      image: (id) => {
        const f = finitionParId(id);
        return f ? { largeur: LARGEUR_DE_TOILE, hauteur: HAUTEUR_DE_TOILE, peindre: (toile) => peindreLaVignette(toile, f, imageDeBanniere) } : null;
      },
      decor: (id) => {
        const f = finitionParId(id);
        return f ? <CarteDuLivre finition={f} tenue={tenueVue} fond={fond} /> : null;
      },
      parId: finitionParId,
      place: PLACE_DE_LA_CARTE,
    }),
    [imageDeBanniere, tenueVue, fond],
  );

  /** Dans le livre, toucher une finition ne fait que la montrer : rien ne part au serveur. */
  const voirDansLeLivre = (id: string | null): Promise<Issue<string | null>> => {
    const f = finitionParId(id);
    if (f) setVue(f.id);
    setRefus(null);
    setReussite(null);
    setProbleme(null);
    return Promise.resolve({ ok: true, valeur: id });
  };

  const acheter = async () => {
    if (!mes || prix === null) return;
    setAchat("envoi");
    setRefus(null);
    try {
      const reponse = await call<unknown>("acheter_carte", { p_finition: finition.id, p_prix_vu: prix });
      const solde = typeof reponse === "object" && reponse !== null ? (reponse as { solde?: unknown }).solde : null;
      if (typeof solde !== "number" || !Number.isSafeInteger(solde) || solde < 0) {
        setRefus(ILLISIBLE);
        setAchat("refuse");
        return;
      }
      setEtat({ kind: "pret", mes: { ...mes, solde, possedees: [finition.id, ...mes.possedees] } });
      onSolde(solde);
      setAchat("fait");
    } catch (e) {
      const fraiche = e instanceof ServerError ? await lire(true) : null;
      const reste = fraiche && e instanceof ServerError && e.code === "solde_insuffisant" ? manque(fraiche.solde, fraiche.prix[finition.rarete] ?? prix) : 0;
      setRefus(e instanceof ServerError ? (reste > 0 ? `Il vous manque ${stateres(reste)}.` : refusDeCarte(e.code)) : messageOf(e));
      setAchat("refuse");
      onRefus();
    }
  };

  const choisir = async (id: IdDeFinition | null) => {
    if (!mes) return;
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    try {
      const reponse = await call<unknown>("choisir_carte", { p_finition: id });
      const porte = typeof reponse === "object" && reponse !== null ? (reponse as { porte?: unknown }).porte : undefined;
      if (porte !== null && typeof porte !== "string") setProbleme(ILLISIBLE);
      else {
        const choisie = finitionParId(typeof porte === "string" ? porte : null);
        setEtat({ kind: "pret", mes: { ...mes, porte: choisie?.id ?? null } });
        setReussite(choisie ? `« ${choisie.nom} » est sur votre carte.` : "Votre carte retrouve la finition de votre place.");
      }
    } catch (e) {
      setProbleme(e instanceof ServerError ? refusDeCarte(e.code) : messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <section class="bannieres cartes-rayon" aria-labelledby="cartes-titre" data-testid="rayon-cartes" data-etat={etat.kind}>
      <div class="bannieres-tete">
        <h4 id="cartes-titre" class="sr-only">
          Les cartes
        </h4>
        {mes && (
          <p class="bannieres-compte" data-testid="cartes-compte">
            <strong class="tnum">{mes.possedees.length}</strong> sur {CARTES.length} à vous
          </p>
        )}
      </div>
      <p class="bannieres-porte" data-testid="cartes-porte">
        <span>
          Sur votre carte du podium, en haut de l'accueil : <strong>{montree ? `« ${montree.nom} »` : "la finition de votre place"}</strong>
        </span>
        {montree && (
          <button type="button" class="chip" disabled={occupe} onClick={() => void choisir(null)} data-testid="cartes-place">
            Revenir à la finition de ma place
          </button>
        )}
      </p>
      {etat.kind === "panne" && <Problem message="Le rayon des cartes ne répond pas pour l'instant." onRetry={() => void lire()} />}

      <div class="vestiaire-filtre" role="group" aria-label="Montrer une rareté" data-testid="cartes-raretes">
        <button type="button" class="chip filtre" aria-pressed={rarete === null} onClick={() => setRarete(null)}>
          Tout
          <span class="filtre-nombre tnum">{CARTES.length}</span>
          <span class="sr-only"> finitions</span>
        </button>
        {RARETES_DES_CARTES.map((r) => (
          <button key={r} type="button" class="chip filtre" data-rarete={r} aria-pressed={rarete === r} onClick={() => setRarete(rarete === r ? null : r)}>
            <span class="filtre-rang" aria-hidden="true">
              {Array.from({ length: RARETES[r].rang }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            {RARETES[r].nom}
            <span class="filtre-nombre tnum">{comptes[r]}</span>
            <span class="sr-only"> {comptes[r] > 1 ? "finitions" : "finition"}</span>
          </button>
        ))}
      </div>

      <div class="banniere-vitrine banniere-vitrine-livre" data-rarete={finition.rarete} data-testid="carte-vitrine" data-finition={finition.id} data-etat={etatVu}>
        <div class="banniere-vue">
          <LivreDesBannieres mode="boutique" dessin={dessin} miennes={duLivre} montree={finition} tenue={tenueVue} familier={null} choisir={voirDansLeLivre} etatDe={etatDe} motDe={motDe} />
        </div>
        <div class="banniere-fiche">
          <p class="banniere-famille">{finition.animee ? "Animation en pixels" : "Reflet holographique"}</p>
          <h5 class="banniere-nom" data-testid="carte-vue">
            {finition.nom}
          </h5>
          <span class="banniere-rarete" data-rarete={finition.rarete}>
            <MarqueDeRarete rarete={finition.rarete} />
          </span>
          <p class="banniere-description">{finition.description}</p>
          <div class="banniere-actions">
            {!mes ? null : etatVu === "a-acheter" ? (
              <>
                {prix !== null && <Prix montant={prix} class="banniere-prix" />}
                {prix === null || !mes.peutAcheter ? (
                  <p class="pochette-raison" data-testid="carte-raison">
                    {mes.peutAcheter ? "Cette finition n'a pas de prix pour l'instant." : "Réservé aux membres validés qui ont créé leur Gaulois."}
                  </p>
                ) : (
                  <div>
                    <button type="button" class="btn btn-primary" onClick={() => setAchat("confirmer")} data-testid="carte-acheter">
                      Acheter
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <span class="banniere-etat" data-etat={etatVu}>
                  {etatVu === "montree" ? "Sur votre carte" : "À vous"}
                </span>
                {etatVu === "a-moi" && (
                  <div>
                    <button type="button" class="btn btn-primary" disabled={occupe} onClick={() => void choisir(finition.id)} data-testid="carte-montrer">
                      {occupe ? "Enregistrement…" : "Mettre sur ma carte"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div class="banniere-avis" data-testid="carte-avis">
            <Success message={reussite} />
            <Problem message={probleme} />
          </div>
        </div>
      </div>

      {achat !== "ferme" && mes && prix !== null && (
        <Dialogue titre={`Acheter « ${finition.nom} »`} etape={achat} occupe={achat === "envoi"} onFermer={() => setAchat("ferme")} testid="carte-dialogue">
          {achat === "fait" ? (
            <p class="form-success" role="status" data-testid="carte-faite">
              « {finition.nom} » est à vous.
            </p>
          ) : achat === "refuse" ? (
            <Refus message={refus} />
          ) : (
            <Compte prix={prix} solde={mes.solde} />
          )}
          <div class="mt-4 flex flex-wrap gap-3">
            {(achat === "confirmer" || achat === "envoi") && (
              <button type="button" class="btn btn-primary" disabled={achat === "envoi" || mes.solde < prix} onClick={() => void acheter()} data-testid="carte-confirmer">
                Acheter
              </button>
            )}
            {achat === "fait" && etatVu !== "montree" && (
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => {
                  setAchat("ferme");
                  void choisir(finition.id);
                }}
                data-testid="carte-montrer-aussitot"
              >
                Mettre sur ma carte
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={achat === "envoi"} onClick={() => setAchat("ferme")}>
              {achat === "confirmer" || achat === "envoi" ? "Annuler" : "Fermer"}
            </button>
          </div>
        </Dialogue>
      )}
    </section>
  );
}
