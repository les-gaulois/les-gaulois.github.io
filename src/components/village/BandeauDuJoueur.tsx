import { useEffect, useMemo, useState } from "preact/hooks";
import { SOLDE_ANNONCE, call } from "../../lib/compte/api";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, casesDuGaulois, tenueDuServeur, type Tenue } from "../../lib/gaulois";
import type { MonSentier } from "../../lib/village/contrat";
import { motStatere, nombre } from "../../lib/village/ecran-boutique";
import { motPas, palierAtteint, part, versLeSuivant } from "../../lib/village/sentier";
import { Piece, Pixels } from "./BoutiquePixels";
import { useSonDuTambour } from "./Tambour";

/**
 * Le bandeau du joueur, sous les onglets de « Mon Gaulois » (17 novembre 2026, demande du pilote : que la page fasse plus
 * « jeu », à partir de ce qu'elle montre déjà) : le visage de son Gaulois, son palier du sentier avec ce qui manque avant
 * le suivant, et sa bourse. Il ne paraît pas dans l'onglet du sentier, qui dit déjà tout cela en grand.
 *
 * Rien n'y est calculé de neuf : le palier vient de `sentier.ts`, comme dans l'onglet ; la bourse est le dernier solde que
 * le serveur a donné, à n'importe quel onglet (`SOLDE_ANNONCE`). Un solde qui ne se sait pas ne s'écrit pas. Le visage
 * est celui de la tenue enregistrée, et suit un enregistrement (`gal:gaulois-enregistre`). Cliquer le sentier y mène.
 * Le bouton du son est celui du tambour des pochettes (`useSonDuTambour`) : un seul réglage pour tous les sons de la page.
 */
export function BandeauDuJoueur({ sentier, versLeSentier }: { sentier: MonSentier | null; versLeSentier: () => void }) {
  const [tenue, setTenue] = useState<Tenue | null>(null);
  const [solde, setSolde] = useState<number | null>(sentier?.solde ?? null);
  const [son, basculerLeSon] = useSonDuTambour();
  // Le sentier relu donne aussi la bourse : le bandeau monté après sa lecture n'a pas entendu son annonce.
  const soldeDuSentier = sentier?.solde ?? null;
  useEffect(() => {
    if (soldeDuSentier !== null) setSolde(soldeDuSentier);
  }, [soldeDuSentier]);

  useEffect(() => {
    void call<unknown>("get_mon_gaulois").then(
      (reponse) => setTenue(tenueDuServeur(reponse)),
      () => undefined,
    );
    const tenueChangee = (e: Event): void => {
      const nouvelle = (e as CustomEvent<{ tenue?: Tenue }>).detail?.tenue;
      if (nouvelle) setTenue(nouvelle);
    };
    const soldeAnnonce = (e: Event): void => {
      const annonce = (e as CustomEvent<{ solde?: number }>).detail?.solde;
      if (typeof annonce === "number") setSolde(annonce);
    };
    window.addEventListener("gal:gaulois-enregistre", tenueChangee);
    window.addEventListener(SOLDE_ANNONCE, soldeAnnonce);
    return () => {
      window.removeEventListener("gal:gaulois-enregistre", tenueChangee);
      window.removeEventListener(SOLDE_ANNONCE, soldeAnnonce);
    };
  }, []);

  const visage = useMemo(() => (tenue ? casesDuGaulois(tenue) : null), [tenue]);
  const saison = sentier?.saison ?? null;
  const atteint = sentier && saison ? palierAtteint(sentier.pas, saison) : null;
  const suivant = sentier && saison ? versLeSuivant(sentier.pas, saison) : null;
  if (!visage && !(solde !== null && solde > 0) && !saison) return null;

  return (
    <aside class="bandeau-joueur" aria-label="Votre Gaulois en bref" data-testid="bandeau-joueur">
      {visage && (
        <span class="bandeau-portrait" aria-hidden="true">
          <Pixels largeur={GAULOIS_LARGEUR} hauteur={GAULOIS_HAUTEUR} cases={visage} echelle={2} />
        </span>
      )}
      {sentier && saison && atteint !== null && (
        <button type="button" class="bandeau-sentier" onClick={versLeSentier} data-testid="bandeau-sentier">
          <span class="bandeau-sentier-mots">
            <b>
              Le sentier, palier <span class="tnum">{atteint}</span> sur <span class="tnum">{saison.paliers}</span>
            </b>
            <span class="tnum">
              {motPas(sentier.pas)}
              {suivant && `, encore ${motPas(suivant.reste)} avant le palier ${suivant.palier}`}
            </span>
          </span>
          <span class="bandeau-barre" aria-hidden="true">
            <i style={`width:${suivant ? part(suivant.fait, suivant.cible) : 100}%`} />
          </span>
        </button>
      )}
      {/* Un solde nul ne s'écrit pas ici : le serveur rend aussi zéro pour une bourse pas encore comptée (compte pas validé,
          pas relié, jamais relu), et seule la carte « Votre bourse » sait le dire. */}
      {solde !== null && solde > 0 && (
        <span class="bandeau-bourse" data-testid="bandeau-bourse">
          <Piece taille={24} />
          <span class="tnum">{nombre(solde)}</span>
          <small>{motStatere(solde)}</small>
        </span>
      )}
      {/* Le son des pochettes, de la fusion et des objets reçus : le même réglage que dans leurs fenêtres, à portée de main. */}
      <button type="button" class="chip bandeau-son" onClick={basculerLeSon} data-testid="bandeau-son">
        {son ? "Couper le son" : "Remettre le son"}
      </button>
    </aside>
  );
}
