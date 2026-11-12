import { useState } from "preact/hooks";
import { fmtCount, fmtInt } from "../../lib/format";
import { BATIMENTS, chantier, type BatimentId } from "../../lib/guide-clan";
import type { IconePartieNom } from "../../lib/icones-parties";
import IconePartie from "../compte/IconePartie";

/** Le dessin de chaque bâtiment : la hutte pour la Ville, le bateau pour le Port, la locomotive pour l'Usine. */
const ICONES: Record<BatimentId, IconePartieNom> = { ville: "hutte", port: "bateau", usine: "train" };

interface Props {
  /** Le nom et le rôle de chaque bâtiment, écrits dans le chapitre, dans l'ordre de `BATIMENTS`. */
  points: readonly { titre: string; texte: string }[];
}

/**
 * Chapitre 6 : le prix du prochain bâtiment. On construit d'un clic, et les prix montent : la Ville a son compteur, le
 * Port et l'Usine partagent le même. Chaque prix vient de `chantier`.
 */
export default function EssaiBatiments({ points }: Props) {
  const [construits, setConstruits] = useState<BatimentId[]>([]);
  // Ce qui vient de changer, pour les lecteurs d'écran : les prix bougent sans que le focus quitte le bouton.
  const [annonce, setAnnonce] = useState("");
  const etat = chantier(construits);
  const vide = construits.length === 0;
  const nomDe = (id: BatimentId) => points[BATIMENTS.findIndex((b) => b.id === id)]?.titre ?? id;
  const construire = (id: BatimentId) => {
    const suite = [...construits, id];
    const apres = chantier(suite);
    setConstruits(suite);
    setAnnonce(`${nomDe(id)} construit. Prochains prix : ${BATIMENTS.map((b) => `${nomDe(b.id)} ${fmtInt(apres.prochain[b.id])}`).join(", ")}.`);
  };
  const remettre = () => {
    if (vide) return;
    setConstruits([]);
    setAnnonce(`Chantier remis à zéro : chaque bâtiment revient à ${fmtInt(chantier([]).prochain.ville)}.`);
  };

  return (
    <div data-testid="essai-batiments">
      <ul class="guide-batiments">
        {BATIMENTS.map((b, i) => (
          <li key={b.id} class="guide-batiment">
            <IconePartie nom={ICONES[b.id]} classe="guide-pion guide-pion-vif" />
            <p class="guide-batiment-nom">
              {points[i]?.titre ?? b.id}
              {etat.nombre[b.id] > 0 && <span class="guide-batiment-nombre tnum"> × {etat.nombre[b.id]}</span>}
            </p>
            <p class="guide-batiment-role">{points[i]?.texte}</p>
            <div class="guide-batiment-prix">
              <p class="guide-etiquette">Prochain</p>
              <p class="tnum font-display text-xl font-extrabold text-white" data-testid={`essai-batiments-${b.id}`}>
                {fmtInt(etat.prochain[b.id])}
              </p>
            </div>
            <button type="button" class="chip" aria-label={`Construire : ${points[i]?.titre ?? b.id}`} onClick={() => construire(b.id)}>
              Construire
            </button>
          </li>
        ))}
      </ul>
      <div class="guide-batiments-pied">
        <p class="tnum" data-testid="essai-batiments-total">
          <span class="guide-etiquette">Or dépensé</span> <strong class="text-white">{fmtInt(etat.depense)}</strong>
          <span class="text-muted"> · {fmtCount(construits.length, "bâtiment")}</span>
        </p>
        {/* Inactif sans rien de construit, mais jamais retiré du clavier : après une remise à zéro, le focus reste sur lui. */}
        <button type="button" class="chip" aria-disabled={vide} onClick={remettre}>
          Remettre à zéro
        </button>
      </div>
      <p class="sr-only" role="status">
        {annonce}
      </p>
    </div>
  );
}
