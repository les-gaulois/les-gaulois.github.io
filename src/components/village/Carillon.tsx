import { useEffect, useState } from "preact/hooks";
import { ORDRE_RARETES_DES_OBJETS as ORDRE_RARETES, type RareteDObjet as Rarete } from "../../lib/gaulois";
import { SON_CHANGE, basculerLeSon, preparerLeSon as preparerLeSonDuJeu, sonVoulu } from "../../lib/jeu/sons";

/**
 * Le carillon des objets reçus hors des boosters (un achat, un palier du pass, la fusion de la forge) et le réglage du son
 * de ces écrans. Il était dans le tambour des pochettes, retiré le 21 novembre 2026 avec l'arrivée de l'animation des
 * boosters ; il passe maintenant par le contexte audio et le seul réglage du son du jeu (`src/lib/jeu/sons.ts`).
 */

let maitre: { ac: AudioContext; gain: GainNode } | null = null;

/** Ouvre le son de la page : à appeler dans le clic qui le demande, sinon certains navigateurs le gardent muet. */
export function preparerLeSon(): void {
  const ac = preparerLeSonDuJeu();
  if (!ac || (maitre && maitre.ac === ac)) return;
  const gain = ac.createGain();
  gain.gain.value = 0.6;
  gain.connect(ac.destination);
  maitre = { ac, gain };
}

/** Le son voulu sur cet appareil, et de quoi le couper ou le remettre. Un seul réglage : tous les boutons le suivent. */
export function useSonDuJeu(): [boolean, () => void] {
  const [son, setSon] = useState(sonVoulu);
  useEffect(() => {
    const relire = (): void => setSon(sonVoulu());
    window.addEventListener(SON_CHANGE, relire);
    return () => window.removeEventListener(SON_CHANGE, relire);
  }, []);
  const basculer = (): void => {
    const voulu = basculerLeSon();
    if (voulu) preparerLeSon();
    setSon(voulu);
  };
  return [son, basculer];
}

function note(frequence: number, dans: number, duree: number, volume: number, forme: OscillatorType): void {
  if (!maitre) return;
  const { ac, gain } = maitre;
  const t = ac.currentTime + dans;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = forme;
  o.frequency.value = frequence;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g);
  g.connect(gain);
  o.start(t);
  o.stop(t + duree + 0.05);
}

/** Une note par rang de rareté, puis un accord tenu pour mystique, légendaire et divin ; une seule note basse hors rareté (rang 0). */
export function carillon(rang: number): void {
  if (!maitre || maitre.ac.state !== "running") return;
  if (rang === 0) note(392, 0.03, 0.6, 0.06, "triangle");
  const gamme = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
  for (let i = 0; i < rang; i++) note(gamme[i] ?? 523.25, 0.03 + i * 0.11, 0.7, 0.07, "triangle");
  if (rang >= 4) for (const f of rang >= 5 ? [523.25, 783.99, 1046.5, 1318.5, 1567.98] : [523.25, 783.99, 1046.5]) note(f, 0.08 + rang * 0.11, 2.4, 0.03, "sine");
}

/** Pour un objet reçu (un achat, un palier du pass) : le son s'ouvre dans le clic, s'il n'est pas coupé. */
export function preparerLeSonSiVoulu(): void {
  if (sonVoulu()) preparerLeSon();
}

/** La note de la rareté d'un objet reçu, si le son n'est pas coupé et qu'un clic l'a ouvert. */
export function carillonSiVoulu(rang: number): void {
  if (sonVoulu()) carillon(rang);
}

/** Couper ou remettre le son : le bouton dit ce qu'il va faire. */
export function BoutonSon({ son, onBasculer, testid }: { son: boolean; onBasculer: () => void; testid: string }) {
  return (
    <button type="button" class="btn btn-ghost" onClick={onBasculer} data-testid={testid}>
      {son ? "Couper le son" : "Remettre le son"}
    </button>
  );
}

// ---------- Les couleurs des raretés (le moule de la forge) ----------

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** Mélange deux couleurs `#rrggbb` : `t` de 0 (la première) à 1 (la seconde). */
export const melange = (a: string, b: string, t: number): string => {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) =>
    Math.round(v + ((B[i] ?? 0) - v) * t)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
};

/** Les couleurs des raretés, lues sur les jetons du site (`--rarete-…`) ; celles de `docs/DESIGN.md` si un jeton manque. */
const REPLI: Readonly<Partial<Record<Rarete, string>>> = {
  commun: "#4aa3ff",
  "peu-commun": "#3a4fe8",
  epique: "#9b4dff",
  mystique: "#ff2e4a",
  legendaire: "#f2b632",
  // Le légendaire de saison ne sort d'aucun booster : sa couleur est celle du légendaire.
  saison: "#f2b632",
  divin: "#19d3c5",
};
export function couleursDuSite(el: Element): Record<Rarete, string> {
  const style = getComputedStyle(el);
  return Object.fromEntries(
    ORDRE_RARETES.map((rarete) => {
      const valeur = style.getPropertyValue(`--rarete-${rarete}`).trim();
      return [rarete, /^#[0-9a-f]{6}$/i.test(valeur) ? valeur : (REPLI[rarete] ?? "#4aa3ff")];
    }),
  ) as Record<Rarete, string>;
}
