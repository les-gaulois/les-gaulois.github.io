import type { ComponentChildren } from "preact";
import { fmtInt } from "../../lib/format";
import type { Rarete } from "../../lib/gaulois";
import { PAS_DONNE, nomRarete } from "../../lib/village/direction";

/*
 * Les pièces communes de l'onglet Village de la Direction (DirectionVillage.tsx) et de son tableau du marché
 * (DirectionMarche.tsx) : le dessin est dans 03-direction.css, section « Direction, onglet Village ».
 */

/** Une case de tableau : le nombre, qui ne se coupe jamais, ou « pas donné ». */
export const Case = ({ n }: { n: number | null }) => <td class="dir-village-nombre">{n === null ? <span class="text-muted">{PAS_DONNE}</span> : fmtInt(n)}</td>;

/** Une rareté : sa couleur du site (`--rarete-*`), jamais seule, toujours avec son nom. */
export const NomRarete = ({ r }: { r: Rarete }) => (
  <span class="dir-village-rarete" data-rarete={r}>
    {nomRarete(r)}
  </span>
);

/**
 * Un tableau en lignes serrées (`.dir-table` des pièces communes) qui ne coupe ni les mots ni les nombres (le site coupe
 * partout ailleurs, `overflow-wrap: anywhere`). Encore trop large, il défile de côté dans son cadre, comme le tableau des
 * comptes : la page, elle, ne défile jamais de côté.
 */
export function Defile({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="dir-village-cadre" tabIndex={0} role="region" aria-label={label}>
      <table class="dir-table tnum">{children}</table>
    </div>
  );
}

/**
 * Un bloc de l'onglet : son titre, son état en pastille à droite, son contenu. `trait` : la couleur de l'état, au bord.
 * `niveau` : 4 pour un bloc rangé sous un titre de niveau 3 (le tableau du marché).
 */
export function Bloc({ id, titre, aside, trait, testId, niveau = 3, children }: { id: string; titre: string; aside?: ComponentChildren; trait?: string; testId: string; niveau?: 3 | 4; children: ComponentChildren }) {
  const Titre = niveau === 4 ? "h4" : "h3";
  return (
    <section class="dir-village-bloc card" aria-labelledby={id} data-trait={trait} data-testid={testId}>
      <div class="dir-village-tete">
        <Titre id={id}>{titre}</Titre>
        {aside}
      </div>
      {children}
    </section>
  );
}
