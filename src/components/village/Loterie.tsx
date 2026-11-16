import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { ServerError, call } from "../../lib/compte/api";
import { motionAllowed } from "../../lib/fx/motion";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, lireTenue } from "../../lib/gaulois";
import { addDays } from "../../lib/time";
import { PREMIER_TIRAGE_LOTERIE, type MaLoterie, type PartDeLoterie } from "../../lib/village/contrat";
import { instant, manque, nombre, pourcent, stateres } from "../../lib/village/ecran-boutique";
import {
  NOMS_DES_RANGS,
  abscisseDuBillet,
  achatPossible,
  apresLAchat,
  billetsDe,
  bonsEnMots,
  bustesDeLaJauge,
  dispositionDeLaJauge,
  dureeDuTirage,
  etatDuTirage,
  gagnants,
  jourCourt,
  jourEnMots,
  lireAchatDeBillets,
  lireLoterie,
  maPart,
  messageDuRefusDeLoterie,
  ordreDeLaJauge,
  partEnPourcent,
  pochettesDuLot,
  pointeDeLaJauge,
  semaineDuTirage,
  totalDesBillets,
  type CadreDeJauge,
  type Rang,
} from "../../lib/village/loterie";
import { Loading, Problem, messageOf } from "../compte/common";
import { Prix } from "./BoutiquePixels";

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";
/** Refus après lesquels réessayer ne sert à rien. */
const SANS_RETOUR = new Set(["not_signed_in", "suspended", "not_validated"]);
/** Le dernier tirage dont ce navigateur a vu l'animation : elle ne se joue seule qu'une fois. */
const CLE_VU = "gal-loterie-vu";

/* ---------- Le dessin de la jauge ---------- */

/** Les couleurs des marches : la face, son ombre, sa lumière. L'écriture y reste celle de la page. */
const MEDAILLES: Readonly<Record<Rang, { face: string; ombre: string; lumiere: string }>> = {
  1: { face: "#f2b632", ombre: "#a86d0c", lumiere: "#ffdd80" },
  2: { face: "#c9d1e6", ombre: "#7a88b4", lumiere: "#f1f4fb" },
  3: { face: "#d98a4e", ombre: "#8f4f1f", lumiere: "#f0b483" },
};
const HAUTEURS: Readonly<Record<Rang, number>> = { 1: 84, 2: 64, 3: 46 };
/** L'or des billets achetés : celui du statère. */
const OR = "#f2b632";

/** Les mesures de la toile : large (ordinateur) ou étroite (téléphone), avec ou sans podium. */
interface Mesures {
  largeur: number;
  hauteur: number;
  cadre: CadreDeJauge;
  /** La taille d'une case des Gaulois du podium. */
  echelle: number;
  marche: number;
  podium: boolean;
}
const NOMS_Y = 40;
const BUSTE_BAS = 128;
const BARRE_Y = 136;
const BARRE_H = 36;
/** La taille de la toile selon la place : 0 le téléphone, 1 l'ordinateur, 2 le grand écran, où plus de Gaulois tiennent. */
type Taille = 0 | 1 | 2;
const tailleDe = (largeur: number): Taille => (largeur >= 1100 ? 2 : largeur >= 560 ? 1 : 0);
const mesures = (taille: Taille, podium: boolean): Mesures =>
  taille === 2
    ? { largeur: 1200, hauteur: podium ? 500 : 190, cadre: { x: 30, largeur: 1140, joint: 4, buste: 66 }, echelle: 3, marche: 180, podium }
    : taille === 1
      ? { largeur: 800, hauteur: podium ? 500 : 190, cadre: { x: 30, largeur: 740, joint: 4, buste: 66 }, echelle: 3, marche: 180, podium }
      : { largeur: 420, hauteur: podium ? 432 : 190, cadre: { x: 16, largeur: 388, joint: 3, buste: 66 }, echelle: 2, marche: 126, podium };

interface Dessin {
  toile: HTMLCanvasElement;
  /** La dernière rangée dessinée : les pieds. */
  bas: number;
}

/** Le Gaulois d'une part, dessiné une fois à une case par pixel ; `null` si sa tenue est illisible. */
function dessinDuGaulois(tenue: unknown): Dessin | null {
  let lue = null;
  try {
    lue = lireTenue(tenue);
  } catch {
    return null;
  }
  if (!lue) return null;
  const toile = document.createElement("canvas");
  toile.width = GAULOIS_LARGEUR;
  toile.height = GAULOIS_HAUTEUR;
  const contexte = toile.getContext("2d");
  if (!contexte) return null;
  const image = contexte.createImageData(GAULOIS_LARGEUR, GAULOIS_HAUTEUR);
  let bas = -1;
  casesDuGaulois(lue).forEach((couleur, i) => {
    if (!couleur || !/^#[0-9a-f]{6}$/i.test(couleur)) return;
    const n = parseInt(couleur.slice(1), 16);
    image.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4);
    bas = Math.max(bas, Math.floor(i / GAULOIS_LARGEUR));
  });
  if (bas < 0) return null;
  contexte.putImageData(image, 0, 0);
  return { toile, bas };
}

interface Encres {
  ecriture: string;
  discret: string;
  filet: string;
  bleu: string;
  /** La police des titres (les marches, le lot en cours). */
  police: string;
  /** La police du texte courant : un nom ne s'écrit jamais en onciale. */
  sans: string;
}

function ecrire(c: CanvasRenderingContext2D, police: string, texte: string, x: number, y: number, taille: number, couleur: string, alignement: CanvasTextAlign = "center", graisse = 600, largeurMax?: number, bords?: readonly [number, number]) {
  c.font = `${graisse} ${taille}px ${police}`;
  c.fillStyle = couleur;
  c.textAlign = alignement;
  c.textBaseline = "middle";
  let ecrit = texte;
  if (largeurMax !== undefined && c.measureText(ecrit).width > largeurMax) {
    while (ecrit.length > 1 && c.measureText(`${ecrit}…`).width > largeurMax) ecrit = ecrit.slice(0, -1);
    ecrit = `${ecrit.trimEnd()}…`;
  }
  // Un texte centré près d'un bord de la toile glisse vers l'intérieur plutôt que d'être rogné.
  let ou = x;
  if (bords && alignement === "center") {
    const demi = c.measureText(ecrit).width / 2;
    ou = Math.min(Math.max(x, bords[0] + demi), bords[1] - demi);
  }
  c.fillText(ecrit, ou, y);
}

/** Un cadre de couleur cerné d'écriture, pour se lire sur la page blanche. */
function cadreDeCouleur(c: CanvasRenderingContext2D, encres: Encres, x: number, y: number, largeur: number, hauteur: number, couleur: string) {
  c.beginPath();
  c.roundRect(x, y, largeur, hauteur, 8);
  c.strokeStyle = encres.ecriture;
  c.lineWidth = 7;
  c.stroke();
  c.strokeStyle = couleur;
  c.lineWidth = 4;
  c.stroke();
}

/**
 * Peint la jauge à l'instant `t` du tirage (en secondes ; `Infinity` : le bilan), ou, sans tirage (`t` null), les parts
 * du tirage à venir. Rien n'est décidé ici : le billet tiré est celui que le serveur a noté.
 */
function peindreLaJauge(c: CanvasRenderingContext2D, m: Mesures, encres: Encres, parts: readonly PartDeLoterie[], ordre: readonly number[], avecBuste: ReadonlySet<number>, dessins: ReadonlyMap<number, Dessin>, t: number | null) {
  const podium = t === null ? [] : gagnants(parts);
  const etat = t === null ? null : etatDuTirage(t, podium.length);
  const fermetures = parts.map(() => 0);
  if (etat) podium.forEach((g, k) => (fermetures[g.index] = etat.fermetures[k] ?? 0));
  const segments = dispositionDeLaJauge(parts, ordre, fermetures, m.cadre, avecBuste);
  const segmentDe = (index: number) => segments.find((s) => s.index === index);
  c.imageSmoothingEnabled = false;

  // Les noms sur deux rangées, une sur deux, d'après la place du Gaulois parmi tous ceux de la jauge, ouverts ou non : un
  // nom ne change pas de rangée quand la part d'un voisin se referme. Chacun a la place qui le sépare du nom le plus
  // proche de sa rangée, avant d'être coupé.
  let place = 0;
  const noms = new Map<number, { x: number; rangee: number }>();
  for (const s of segments) {
    if (s.buste === null) continue;
    const rangee = place++ % 2;
    if (s.ouverture > 0.01 && s.largeur > 0) noms.set(s.index, { x: s.buste, rangee });
  }
  const largeurDuNom = (index: number): number => {
    const nom = noms.get(index)!;
    let libre = 2 * m.cadre.buste;
    for (const [autre, voisin] of noms) if (autre !== index && voisin.rangee === nom.rangee) libre = Math.min(libre, Math.abs(voisin.x - nom.x));
    return Math.max(24, libre - 10);
  };
  for (const s of segments) {
    if (s.ouverture <= 0.01 || s.largeur <= 0) continue;
    const part = parts[s.index]!;
    const n = billetsDe(part);
    c.globalAlpha = s.ouverture;
    if (s.buste !== null) {
      c.strokeStyle = encres.filet;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(s.buste, BUSTE_BAS);
      c.lineTo(s.x + s.largeur / 2, BARRE_Y);
      c.stroke();
      const dessin = dessins.get(s.index);
      if (dessin) c.drawImage(dessin.toile, 8, 0, 32, 38, Math.round(s.buste - 32), BUSTE_BAS - 76, 64, 76);
      ecrire(c, encres.sans, part.nom, s.buste, noms.get(s.index)?.rangee === 1 ? NOMS_Y - 15 : NOMS_Y, 12, part.moi ? encres.ecriture : encres.discret, "center", part.moi ? 700 : 500, largeurDuNom(s.index), [2, m.largeur - 2]);
    }
    c.save();
    c.beginPath();
    c.roundRect(s.x, BARRE_Y, s.largeur, BARRE_H, Math.min(6, s.largeur / 2));
    c.clip();
    c.fillStyle = encres.bleu;
    c.fillRect(s.x, BARRE_Y, s.largeur, BARRE_H);
    c.fillStyle = OR;
    c.fillRect(s.x + s.gagnes, BARRE_Y, s.largeur - s.gagnes + 1, BARRE_H);
    if (s.largeur / n > 5) {
      c.fillStyle = "rgb(10 18 48 / 0.35)";
      for (let k = 1; k < n; k++) c.fillRect(s.x + (s.largeur * k) / n - 0.5, BARRE_Y, 1, BARRE_H);
    }
    c.restore();
    c.globalAlpha = 1;
  }

  if (etat) {
    podium.forEach((g, k) => {
      const s = segmentDe(g.index);
      if (!s) return;
      if (etat.arrives[k] && s.ouverture > 0.01) {
        c.globalAlpha = s.ouverture;
        cadreDeCouleur(c, encres, s.x - 3, BARRE_Y - 3, s.largeur + 6, BARRE_H + 6, MEDAILLES[g.rang].face);
        c.globalAlpha = 1;
      }
      const avancee = etat.pointes[k];
      const visible = etat.visibles[k] ?? 0;
      if (avancee === null || avancee === undefined || visible <= 0) return;
      const px = pointeDeLaJauge(abscisseDuBillet(s, g.part, g.billet), m.cadre, avancee);
      c.globalAlpha = visible;
      c.beginPath();
      c.moveTo(px, BARRE_Y + BARRE_H + 8);
      c.lineTo(px - 10, BARRE_Y + BARRE_H + 26);
      c.lineTo(px + 10, BARRE_Y + BARRE_H + 26);
      c.closePath();
      c.fillStyle = MEDAILLES[g.rang].face;
      c.fill();
      c.strokeStyle = encres.ecriture;
      c.lineWidth = 1.5;
      c.lineJoin = "round";
      c.stroke();
      ecrire(c, encres.police, NOMS_DES_RANGS[g.rang], px, BARRE_Y + BARRE_H + 39, 12, encres.ecriture, "center", 700);
      c.globalAlpha = 1;
    });
    if (etat.enCours !== null) {
      const g = podium[etat.enCours]!;
      c.beginPath();
      c.arc(m.cadre.x + 7, 10, 6, 0, Math.PI * 2);
      c.fillStyle = MEDAILLES[g.rang].face;
      c.fill();
      c.strokeStyle = encres.ecriture;
      c.lineWidth = 1.5;
      c.stroke();
      ecrire(c, encres.police, `Tirage : ${NOMS_DES_RANGS[g.rang].toLowerCase()}`, m.cadre.x + 21, 10, 13, encres.ecriture, "left", 700);
    }
  }

  if (!m.podium) return;
  const sol = m.hauteur - 22;
  const milieu = m.largeur / 2;
  const gauche: Readonly<Record<Rang, number>> = { 1: milieu - m.marche / 2, 2: milieu - m.marche * 1.5, 3: milieu + m.marche / 2 };
  c.fillStyle = encres.ecriture;
  c.fillRect(gauche[2] - 16, sol, m.marche * 3 + 32, 2);
  for (const rang of [2, 1, 3] as const) {
    const medaille = MEDAILLES[rang];
    const x = gauche[rang];
    const haut = sol - HAUTEURS[rang];
    const k = podium.findIndex((g) => g.rang === rang);
    const g = k < 0 ? null : podium[k]!;
    const montee = g && etat ? (etat.montees[k] ?? 0) : 0;
    if (g && montee > 0) {
      const dessin = dessins.get(g.index);
      if (dessin) {
        const pose = 1 - Math.pow(1 - montee, 3);
        c.save();
        c.beginPath();
        c.rect(x - 30, 0, m.marche + 60, haut);
        c.clip();
        c.drawImage(dessin.toile, Math.round(x + m.marche / 2 - (GAULOIS_LARGEUR / 2) * m.echelle), Math.round(haut + (1 - pose) * (GAULOIS_HAUTEUR * m.echelle + 6) - (dessin.bas + 1) * m.echelle), GAULOIS_LARGEUR * m.echelle, GAULOIS_HAUTEUR * m.echelle);
        c.restore();
      }
    }
    c.fillStyle = medaille.face;
    c.fillRect(x, haut, m.marche, HAUTEURS[rang]);
    c.fillStyle = medaille.lumiere;
    c.fillRect(x, haut, m.marche, 6);
    c.fillStyle = medaille.ombre;
    c.fillRect(x + m.marche - 8, haut + 6, 8, HAUTEURS[rang] - 6);
    c.strokeStyle = encres.ecriture;
    c.lineWidth = 2;
    c.strokeRect(x, haut, m.marche, HAUTEURS[rang]);
    // Sur les marches, l'écriture est le marine de la page, quel que soit le thème : les faces sont claires.
    ecrire(c, encres.police, NOMS_DES_RANGS[rang].toUpperCase(), x + m.marche / 2 - 4, haut + 18, 11, "#0a1230", "center", 700);
    if (g && montee > 0) {
      c.globalAlpha = Math.min(1, montee * 2);
      ecrire(c, encres.sans, g.part.nom, x + m.marche / 2 - 4, haut + 35, 14, "#0a1230", "center", 600, m.marche - 22);
      c.globalAlpha = 1;
    }
  }
}

/**
 * La jauge des parts, dessinée sur une toile. Sans `tirage` : les parts du tirage à venir, immobiles. Avec : le dernier
 * tirage et son podium ; chaque changement de `lecture` (au-dessus de zéro) rejoue l'animation, si les animations sont
 * permises (bouton pause de l'en-tête, réglage du système), sinon le bilan est posé tout de suite. Décorative : tout ce
 * qu'elle montre est écrit à côté.
 */
function JaugeDesParts({ parts, tirage = false, lecture = 0, onFini }: { parts: readonly PartDeLoterie[]; tirage?: boolean; lecture?: number; onFini?: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [taille, setTaille] = useState<Taille>(1);
  const m = useMemo(() => mesures(taille, tirage), [taille, tirage]);
  const ordre = useMemo(() => ordreDeLaJauge(parts), [parts]);
  const avecBuste = useMemo(() => bustesDeLaJauge(parts, Math.floor(m.cadre.largeur / m.cadre.buste)), [parts, m]);
  const dessins = useMemo(() => {
    const table = new Map<number, Dessin>();
    parts.forEach((part, i) => {
      if (!avecBuste.has(i) && part.rang === null) return;
      const dessin = dessinDuGaulois(part.tenue);
      if (dessin) table.set(i, dessin);
    });
    return table;
  }, [parts, avecBuste]);
  const fini = useRef(onFini);
  fini.current = onFini;
  // La dernière lecture déjà jouée : une relecture du serveur ou un changement de largeur ne rejoue pas le tirage.
  const jouee = useRef(0);

  // La largeur se mesure avant le premier dessin : sans cela, le premier passage de l'observateur changerait la toile
  // juste après le départ du tirage, et l'arrêterait.
  useLayoutEffect(() => {
    if (boite.current) setTaille(tailleDe(boite.current.clientWidth));
  }, []);

  useEffect(() => {
    const el = boite.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observateur = new ResizeObserver(() => setTaille(tailleDe(el.clientWidth)));
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  // Le thème change (clair ou sombre, bouton de l'en-tête ; thème rouge de l'équipe) : la toile lit ses couleurs dans
  // les jetons de la page au moment de peindre, elle se repeint donc avec les nouvelles.
  const [theme, setTheme] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observateur = new MutationObserver(() => setTheme((n) => n + 1));
    observateur.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-theme"] });
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    const el = toile.current;
    const c = el?.getContext("2d");
    if (!el || !c) {
      if (tirage && lecture > 0) fini.current?.();
      return;
    }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = m.largeur * dpr;
    el.height = m.hauteur * dpr;
    const style = getComputedStyle(el);
    const jeton = (nom: string, secours: string) => style.getPropertyValue(nom).trim() || secours;
    const encres: Encres = {
      ecriture: jeton("--ecriture", "#0a1230"),
      discret: jeton("--color-muted", "#4a5677"),
      filet: jeton("--color-line-strong", "#7a88b4"),
      bleu: jeton("--color-blue", "#0b5fff"),
      police: jeton("--font-display", "system-ui, sans-serif"),
      sans: jeton("--font-sans", "system-ui, sans-serif"),
    };
    // Faux si le navigateur ne sait pas dessiner la jauge (un très vieux navigateur) : le tirage s'arrête là, et le
    // podium écrit dessous le dit quand même.
    const peindre = (t: number | null): boolean => {
      try {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, m.largeur, m.hauteur);
        c.globalAlpha = 1;
        peindreLaJauge(c, m, encres, parts, ordre, avecBuste, dessins, t);
        return true;
      } catch {
        return false;
      }
    };
    if (!tirage) {
      peindre(null);
      return;
    }
    const duree = dureeDuTirage(gagnants(parts).length);
    if (lecture < 1 || lecture === jouee.current || duree === 0 || !motionAllowed()) {
      jouee.current = lecture;
      peindre(Infinity);
      if (lecture > 0) fini.current?.();
      return;
    }
    jouee.current = lecture;
    let image = 0;
    const debut = performance.now();
    const boucle = (maintenant: number) => {
      const t = (maintenant - debut) / 1000;
      // Mises en pause en cours de route (bouton de l'en-tête) : le bilan, tout de suite.
      if (t >= duree || !motionAllowed() || !peindre(t)) {
        peindre(Infinity);
        fini.current?.();
        return;
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(image);
  }, [m, parts, ordre, avecBuste, dessins, tirage, lecture, theme]);

  return (
    <div ref={boite} class="loterie-jauge">
      <canvas ref={toile} class="loterie-toile" style={{ aspectRatio: `${m.largeur} / ${m.hauteur}` }} aria-hidden="true" />
    </div>
  );
}

/* ---------- L'écran ---------- */

type Etat = { kind: "attente" } | { kind: "lecture" } | { kind: "erreur"; message: string; reessayer: boolean } | { kind: "prete"; ma: MaLoterie };

/** Toutes les parts d'un tirage, en tableau : ce que la jauge dessine, en chiffres. */
function TableDesParts({ parts, fait }: { parts: readonly PartDeLoterie[]; fait: boolean }) {
  return (
    <details class="fold">
      <summary>Toutes les parts</summary>
      <div class="mt-3 max-h-96 overflow-auto" tabIndex={0} aria-label="Tableau des parts, zone défilante">
        <table class="data-table tnum w-full text-sm">
          <caption class="sr-only">Les billets de chaque Gaulois dans ce tirage, et sa part de tous les billets.</caption>
          <thead>
            <tr>
              <th scope="col">Gaulois</th>
              <th scope="col">Billets gagnés</th>
              <th scope="col">Billets achetés</th>
              <th scope="col">Part</th>
              {fait && <th scope="col">Podium</th>}
            </tr>
          </thead>
          <tbody>
            {parts.map((part, i) => (
              <tr key={i} class={part.moi ? "loterie-moi" : undefined}>
                <th scope="row">
                  {part.nom}
                  {part.moi ? " (vous)" : ""}
                </th>
                <td>{nombre(part.gratuits)}</td>
                <td>{nombre(part.achetes)}</td>
                <td>{pourcent(partEnPourcent(part, parts))}</td>
                {fait && <td>{part.rang === null ? "" : NOMS_DES_RANGS[part.rang]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** L'achat de billets : le nombre, le prix, et une seconde pression pour confirmer. Rien ne part au premier clic. */
function AchatDeBilletsDeLoterie({ ma, onAchete }: { ma: MaLoterie; onAchete: (apres: MaLoterie) => void }) {
  const { max, raison } = achatPossible(ma);
  const [voulu, setVoulu] = useState(1);
  const [etape, setEtape] = useState<"choix" | "confirme" | "envoi">("choix");
  const [refus, setRefus] = useState<string | null>(null);
  const n = Math.max(1, Math.min(max, voulu));

  const acheter = async () => {
    setEtape("envoi");
    setRefus(null);
    try {
      const achat = lireAchatDeBillets(await call<unknown>("acheter_billets_loterie", { p_nombre: n, p_prix_vu: ma.prix }));
      if (achat) onAchete(apresLAchat(ma, achat));
      else setRefus(ILLISIBLE);
    } catch (e) {
      const code = e instanceof ServerError ? e.code : "network";
      setRefus(messageDuRefusDeLoterie(code, { manque: manque(ma.solde, n * ma.prix) }));
    }
    setEtape("choix");
    setVoulu(1);
  };

  if (raison) {
    return (
      <p class="pochette-note" data-testid="loterie-raison">
        {raison}
      </p>
    );
  }
  return (
    <div class="loterie-achat" data-testid="loterie-achat">
      <label class="nom-champ" for="loterie-nombre">
        Billets à acheter, {stateres(ma.prix)} le billet ({nombre(max)} au plus)
      </label>
      <div class="loterie-achat-ligne">
        <input
          id="loterie-nombre"
          class="field max-w-28"
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          step={1}
          value={n}
          disabled={etape !== "choix"}
          onInput={(e) => setVoulu(Math.floor(Number((e.currentTarget as HTMLInputElement).value)) || 1)}
        />
        {etape === "choix" ? (
          <button type="button" class="btn btn-secondary" onClick={() => setEtape("confirme")} data-testid="loterie-acheter">
            Acheter pour {stateres(n * ma.prix)}
          </button>
        ) : (
          <>
            <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void acheter()} data-testid="loterie-confirmer">
              {etape === "envoi" ? "Achat…" : `Confirmer : ${nombre(n)} ${n > 1 ? "billets" : "billet"}, ${stateres(n * ma.prix)}`}
            </button>
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={() => setEtape("choix")}>
              Annuler
            </button>
          </>
        )}
      </div>
      <Problem message={refus} />
    </div>
  );
}

/** Le dernier tirage : la jauge animée, son podium en toutes lettres, et le bouton pour le revoir. */
function DernierTirage({ dernier }: { dernier: NonNullable<MaLoterie["dernier"]> }) {
  const [lecture, setLecture] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const podium = gagnants(dernier.parts);
  const semaine = semaineDuTirage(dernier.tirage);

  // La première fois que ce navigateur voit ce tirage, il se joue seul ; ensuite, le bilan attend.
  useEffect(() => {
    let vu: string | null = null;
    try {
      vu = localStorage.getItem(CLE_VU);
      localStorage.setItem(CLE_VU, dernier.tirage);
    } catch {
      // Sans stockage, le tirage se joue à chaque ouverture : rien de grave.
    }
    if (vu !== dernier.tirage && podium.length > 0 && motionAllowed()) {
      setEnCours(true);
      setLecture(1);
    }
  }, [dernier.tirage]);

  // Un garde-fou : quoi qu'il arrive au dessin, le podium écrit paraît au plus tard quatre secondes après la fin prévue.
  useEffect(() => {
    if (!enCours) return;
    const minuterie = setTimeout(() => setEnCours(false), (dureeDuTirage(podium.length) + 4) * 1000);
    return () => clearTimeout(minuterie);
  }, [enCours, lecture]);

  if (dernier.parts.length === 0) return null;
  return (
    <section class="loterie-bloc" aria-labelledby="loterie-dernier-titre" data-testid="loterie-dernier">
      <div class="loterie-bloc-tete">
        <h3 id="loterie-dernier-titre" class="nom-champ vestiaire-titre">
          Tirage du {jourEnMots(dernier.tirage)}
        </h3>
        <button
          type="button"
          class="btn btn-ghost"
          disabled={enCours}
          onClick={() => {
            setEnCours(true);
            setLecture((n) => n + 1);
          }}
          data-testid="loterie-revoir"
        >
          Revoir le tirage
        </button>
      </div>
      <p class="pochette-note">
        Points du {jourCourt(semaine.debut)} au {jourCourt(semaine.fin)}, {nombre(totalDesBillets(dernier.parts))} billets.
      </p>
      <JaugeDesParts parts={dernier.parts} tirage lecture={lecture} onFini={() => setEnCours(false)} />
      {/* Le podium en toutes lettres : caché pendant que la jauge le dévoile, pour ne pas le dire avant elle, puis
          annoncé aux lecteurs d'écran quand il paraît. */}
      <div aria-live="polite">
        {!enCours && (
          <ol class="loterie-podium" aria-label="Le podium du tirage" data-testid="loterie-podium">
            {podium.map((g) => (
              <li key={g.rang} data-rang={g.rang}>
                <span class="loterie-rang">{NOMS_DES_RANGS[g.rang]}</span>
                <span>
                  {g.part.nom}
                  {g.part.moi ? " (vous)" : ""}
                </span>
                <span class="pochette-note">billet {g.billet < g.part.gratuits ? "gagné" : "acheté"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {!enCours && <TableDesParts parts={dernier.parts} fait />}
    </section>
  );
}

/**
 * L'onglet « La loterie » de « Mon Gaulois » (16 novembre 2026). Chaque lundi à 21 h 30, le serveur tire l'or, l'argent
 * puis le bronze parmi les billets de la semaine passée : un billet par point rapporté au clan, plus ceux qu'on achète.
 * L'écran montre les lots, la jauge des parts du tirage à venir, ses propres billets, et rejoue le dernier tirage. Tout
 * vient de `get_loterie` ; rien n'est du temps réel : la page se relit à l'ouverture de l'onglet, après un achat, et
 * autour de l'heure du tirage.
 */
export default function LoterieDuLundi({ actif }: { actif: boolean }) {
  const [etat, setEtat] = useState<Etat>({ kind: "attente" });

  const lire = useCallback(async (discret: boolean) => {
    if (!discret) setEtat({ kind: "lecture" });
    try {
      const ma = lireLoterie(await call<unknown>("get_loterie"));
      if (ma) setEtat({ kind: "prete", ma });
      else if (!discret) setEtat({ kind: "erreur", message: ILLISIBLE, reessayer: true });
    } catch (e) {
      if (!discret) setEtat({ kind: "erreur", message: messageOf(e), reessayer: !(e instanceof ServerError && SANS_RETOUR.has(e.code)) });
    }
  }, []);

  useEffect(() => {
    if (actif) void lire(etat.kind === "prete");
  }, [actif]);

  const ma = etat.kind === "prete" ? etat.ma : null;
  // Le tirage attendu n'est pas encore lu : l'heure vient de passer, le serveur le fait dans la minute. Au-delà de vingt
  // minutes, l'écran n'attend plus : il ne promet pas un tirage qui n'est pas venu.
  const attendu = ma ? addDays(ma.tirage, -7) : null;
  const depuis = ma ? Date.now() - (Date.parse(ma.heure) - 7 * 86_400_000) : 0;
  const enAttente = ma !== null && attendu !== null && attendu >= PREMIER_TIRAGE_LOTERIE && (ma.dernier?.tirage ?? "") < attendu && depuis >= 0 && depuis < 20 * 60_000;

  // Autour de l'heure : une relecture juste après le tirage, puis toutes les 40 secondes tant qu'il n'est pas lu.
  useEffect(() => {
    if (!actif || !ma) return;
    const avant = Date.parse(ma.heure) - Date.now();
    const delai = enAttente ? 40_000 : avant > 0 && avant < 6 * 3600_000 ? avant + 45_000 : null;
    if (delai === null) return;
    const minuterie = setTimeout(() => void lire(true), delai);
    return () => clearTimeout(minuterie);
  }, [actif, ma, enAttente, lire]);

  if (etat.kind === "attente" || etat.kind === "lecture") return <Loading label="Lecture de la loterie…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={etat.reessayer ? () => void lire(false) : undefined} />;

  const { ma: loterie } = etat;
  const semaine = semaineDuTirage(loterie.tirage);
  const moi = maPart(loterie.parts);
  const gagnees = bonsEnMots(loterie.bons);
  return (
    <div class="loterie" data-testid="loterie">
      <div class="loterie-tete">
        <p class="loterie-quand" data-testid="loterie-quand">
          Tirage {jourEnMots(loterie.tirage)} à 21 h 30, heure de Paris
        </p>
        <p class="pochette-note">
          Un billet par point rapporté au clan du {jourCourt(semaine.debut)} au {jourCourt(semaine.fin)}
          {loterie.close ? " : la semaine est finie, seuls les billets achetés peuvent encore s'ajouter" : ""}. L'or est tiré d'abord, puis l'argent et le bronze ; un gagnant ne regagne pas.
        </p>
        {loterie.releve && (
          <p class="info-discrete" data-testid="loterie-releve">
            Parties relues le {instant(loterie.releve)}
          </p>
        )}
      </div>

      <ol class="loterie-lots" aria-label="Les lots du podium" data-testid="loterie-lots">
        {loterie.lots.map((lot) => (
          <li key={lot.rang} data-rang={lot.rang}>
            <span class="loterie-rang">{NOMS_DES_RANGS[lot.rang]}</span>
            <Prix montant={lot.gain} />
            {pochettesDuLot(lot).map((texte) => (
              <span key={texte} class="loterie-lot-pochette">
                {texte}
              </span>
            ))}
          </li>
        ))}
      </ol>

      {gagnees.length > 0 && (
        <p class="loterie-gagnees" data-testid="loterie-gagnees">
          Vos pochettes gagnées, à ouvrir sans rien payer : {gagnees.join(", ")}. <a href="#pochettes">Les ouvrir</a>
        </p>
      )}

      {enAttente && (
        <p class="pochette-raison" role="status" data-testid="loterie-attente">
          Le tirage du {jourEnMots(attendu ?? loterie.tirage)} arrive dans la minute.
        </p>
      )}

      <section class="loterie-bloc" aria-labelledby="loterie-parts-titre">
        <h3 id="loterie-parts-titre" class="nom-champ vestiaire-titre">
          Les parts du prochain tirage
        </h3>
        {loterie.parts.length > 0 && (
          <>
            <JaugeDesParts parts={loterie.parts} />
            <ul class="loterie-legende">
              <li>
                <i class="loterie-puce" />
                billets gagnés
              </li>
              <li>
                <i class="loterie-puce loterie-puce-or" />
                billets achetés
              </li>
            </ul>
          </>
        )}
        <p class="loterie-mes-billets" data-testid="loterie-mes-billets">
          {moi ? (
            <>
              Vos billets : <strong class="tnum">{nombre(moi.gratuits)}</strong> gagnés, <strong class="tnum">{nombre(moi.achetes)}</strong> achetés, soit <strong class="tnum">{pourcent(partEnPourcent(moi, loterie.parts))}</strong> des{" "}
              <span class="tnum">{nombre(totalDesBillets(loterie.parts))}</span> billets.
            </>
          ) : (
            <>
              <span class="tnum">{nombre(totalDesBillets(loterie.parts))}</span> billets dans le tirage.
            </>
          )}
        </p>
        <AchatDeBilletsDeLoterie ma={loterie} onAchete={(apres) => setEtat({ kind: "prete", ma: apres })} />
        {loterie.parts.length > 0 && <TableDesParts parts={loterie.parts} fait={false} />}
      </section>

      {loterie.dernier && <DernierTirage key={loterie.dernier.tirage} dernier={loterie.dernier} />}
    </div>
  );
}
