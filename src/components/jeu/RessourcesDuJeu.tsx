import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import { SOLDE_ANNONCE } from "../../lib/compte/api";
import type { MonSentier } from "../../lib/village/contrat";
import { motStatere } from "../../lib/village/ecran-boutique";
import { motPas, palierAtteint, versLeSuivant } from "../../lib/village/sentier";
import { nombreEcrit } from "../../lib/jeu/ecriture";
import { Piece } from "../village/BoutiquePixels";
import { Icone, Px } from "./Pixels";

/**
 * Les ressources du joueur, dans la barre du jeu (BarreDuJeu.astro, `#jeu-ressources`) : son palier du pass et ses XP vers le
 * suivant (un clic y mène), et sa bourse de statères. Elles remplacent le bandeau du joueur d'avant (BandeauDuJoueur.tsx,
 * 17 novembre 2026), avec les mêmes règles : le palier vient de `sentier.ts`, la bourse est le dernier solde que le serveur
 * a donné (`SOLDE_ANNONCE`). Un solde nul ou inconnu ne s'écrit pas : le serveur rend aussi zéro pour une bourse pas encore
 * comptée. Rien n'est calculé de neuf.
 */
export function RessourcesDuJeu({ sentier, versLePass }: { sentier: MonSentier | null; versLePass: () => void }) {
  const [solde, setSolde] = useState<number | null>(sentier?.solde ?? null);
  const soldeDuSentier = sentier?.solde ?? null;
  useEffect(() => {
    if (soldeDuSentier !== null) setSolde(soldeDuSentier);
  }, [soldeDuSentier]);
  useEffect(() => {
    const annonce = (e: Event): void => {
      const s = (e as CustomEvent<{ solde?: number }>).detail?.solde;
      if (typeof s === "number") setSolde(s);
    };
    window.addEventListener(SOLDE_ANNONCE, annonce);
    return () => window.removeEventListener(SOLDE_ANNONCE, annonce);
  }, []);

  const place = typeof document !== "undefined" ? document.getElementById("jeu-ressources") : null;
  if (!place) return null;
  const saison = sentier?.saison ?? null;
  const atteint = sentier && saison ? palierAtteint(sentier.pas, saison) : null;
  const suivant = sentier && saison ? versLeSuivant(sentier.pas, saison) : null;

  return createPortal(
    <>
      {sentier && saison && atteint !== null && (
        <button type="button" class="jeu-capsule-lien" onClick={versLePass} data-testid="jeu-pass">
          <span class="sr-only">
            Le pass : palier {atteint} sur {saison.paliers}
            {suivant ? `, ${motPas(suivant.fait)} sur ${suivant.cible} avant le palier ${suivant.palier}` : ", dernier palier atteint"}
          </span>
          <Px t={`Palier ${atteint}`} couleur="doux" muet classe="jeu-capsule-palier" />
          <span class="jeu-capsule jeu-n9" aria-hidden="true">
            <Icone nom="xp" />
            <span class="jeu-plein jeu-n9 jeu-plein-bleu" style={`--part:${suivant ? suivant.fait / Math.max(1, suivant.cible) : 1}`} />
            <Px t={suivant ? `${suivant.fait}/${suivant.cible}` : `${saison.paliers}/${saison.paliers}`} couleur="creme" relief="cerne" muet />
          </span>
        </button>
      )}
      {solde !== null && solde > 0 && (
        <span class="jeu-capsule jeu-capsule-bourse jeu-n9" data-testid="jeu-bourse">
          <span class="jeu-capsule-image" aria-hidden="true">
            <Piece taille={24} echelle={2} />
          </span>
          <Px t={nombreEcrit(solde)} couleur="creme" relief="cerne" muet />
          <span class="sr-only">
            {nombreEcrit(solde)} {motStatere(solde)}
          </span>
        </span>
      )}
    </>,
    place,
  );
}
