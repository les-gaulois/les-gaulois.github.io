import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

interface Props {
  /** Les hauteurs de la courbe, de gauche à droite, en pour cent de la hauteur du graphique. */
  hauteurs: readonly number[];
  /** Où se trouve le repère, en pour cent de la largeur, et sa hauteur. */
  repere: { x: number; y: number };
  /** Les graduations : leur place en pour cent, et ce qu'elles disent. */
  axeX: readonly { place: number; texte: string }[];
  axeY: readonly { place: number; texte: string }[];
  /** Ce que mesure chaque axe, en une ligne sous le graphique. */
  legende: string;
  /** Un geste sur le graphique règle la valeur : la place du doigt ou de la souris, de 0 à 1. */
  onPlace: (part: number) => void;
  /** Une zone mise en évidence, en pour cent de la largeur, et son nom. */
  zone?: { de: number; a: number; nom: string };
  /** Un trait vertical à une place donnée, et son nom. */
  seuil?: { place: number; nom: string };
  /** Le dessin posé sur le repère, à la place du point. */
  pion?: ComponentChildren;
  testId?: string;
}

/**
 * Une courbe calculée, pour les essais du guide du clan : la croissance des troupes, le paiement d'un bateau. Sans case,
 * comme les graphiques du site (docs/DESIGN.md) : des repères à peine visibles et une aire qui s'efface vers le bas.
 * Décorative pour les lecteurs d'écran : le curseur placé dessous donne chaque valeur en clair.
 */
export default function Courbe({ hauteurs, repere, axeX, axeY, legende, onPlace, zone, seuil, pion, testId }: Props) {
  // Le dégradé de l'aire a son propre identifiant : la page porte plusieurs courbes.
  const id = `${useId()}-aire`;
  const dernier = Math.max(1, hauteurs.length - 1);
  const trait = hauteurs.map((h, i) => `${i === 0 ? "M" : "L"}${(i / dernier) * 100} ${100 - h}`).join("");
  const place = (e: MouseEvent) => {
    const cadre = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onPlace(Math.max(0, Math.min(1, (e.clientX - cadre.left) / cadre.width)));
  };

  return (
    <div class="guide-courbe select-none" aria-hidden="true" data-testid={testId}>
      {zone && (
        <span class="guide-courbe-nom tnum" style={{ left: `${(zone.de + zone.a) / 2}%` }}>
          {zone.nom}
        </span>
      )}
      {seuil && (
        <span class="guide-courbe-nom tnum" style={{ left: `${seuil.place}%` }}>
          {seuil.nom}
        </span>
      )}
      {/* Un clic ou un toucher place le repère, et la souris le fait glisser, bouton enfoncé. Un doigt qui fait défiler
          la page en passant sur la courbe ne change rien : au doigt, on glisse sur le curseur du dessous. */}
      <div
        class="guide-courbe-zone"
        onClick={place}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" && e.buttons > 0) place(e);
        }}
      >
        {axeY.map((g) => (
          <div key={g.place} class="chart-gridline" style={{ top: `${100 - g.place}%` }}>
            <span class="tnum absolute -top-2 right-full whitespace-nowrap pr-2 text-xs text-muted">{g.texte}</span>
          </div>
        ))}
        {zone && <div class="absolute inset-y-0 bg-white/15" style={{ left: `${zone.de}%`, width: `${zone.a - zone.de}%` }} />}
        {seuil && <div class="guide-courbe-seuil" style={{ left: `${seuil.place}%` }} />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
              <stop offset="0" style={{ stopColor: "var(--color-win)", stopOpacity: 0.34 }} />
              <stop offset="1" style={{ stopColor: "var(--color-win)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={`${trait}L100 100L0 100Z`} fill={`url(#${id})`} />
          <path d={trait} fill="none" stroke="var(--color-win)" stroke-opacity="0.28" stroke-width="7" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
          <path d={trait} fill="none" stroke="var(--color-win)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
        <div class="guide-courbe-fil" style={{ left: `${repere.x}%` }} />
        <span class={pion ? "guide-courbe-pion" : "guide-courbe-point"} style={{ left: `${repere.x}%`, top: `${100 - repere.y}%` }}>
          {pion}
        </span>
      </div>
      <div class="relative mt-2 h-4 text-xs text-muted">
        {axeX.map((g) => (
          <span key={g.place} class="tnum absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${g.place}%` }}>
            {g.texte}
          </span>
        ))}
      </div>
      <p class="mt-2 text-xs text-muted">{legende}</p>
    </div>
  );
}
