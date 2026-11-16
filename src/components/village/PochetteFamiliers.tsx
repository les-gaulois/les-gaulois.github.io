import { useCallback, useEffect, useState } from "preact/hooks";
import type { Rarete } from "../../lib/gaulois";
import { albumDeLaMenagerie } from "../../lib/village/album-pochette";
import type { MesFamiliers, PochetteFamiliersReponse } from "../../lib/village/contrat";
import { pourcent, stateres } from "../../lib/village/ecran-boutique";
import { ANCRE_FAMILIERS, idsPossedes, lignesDesChances, raisonPochetteFermee, vignetteDuFamilier } from "../../lib/village/ecran-familiers";
import { FAMILIERS, familierDe, tailleDuFamilier, TAILLES, type Familier } from "../../lib/village/familiers";
import { motionAllowed } from "../../lib/fx/motion";
import { bandeDesFamiliers } from "../../lib/village/tambour";
import { Compte, Dialogue, Refus, type BandeVue, type Issue } from "./BoutiqueDialogue";
import { AlbumDePochette } from "./AlbumPochette";
import { Pixels, Prix } from "./BoutiquePixels";
import { DessinFamilier, RareteDuFamilier } from "./Familiers";
import { POCHETTE_FAMILIERS_COTE, casesDeLaPochetteFamiliers } from "./PochetteFamiliersDessin";
import { BoutonSon, Tambour, preparerLeSon, useSonDuTambour } from "./Tambour";

const CASES_POCHETTE = casesDeLaPochetteFamiliers();

/** Le dessin de la pochette des familiers, décoratif : son nom est écrit à côté. */
function DessinPochetteFamiliers({ echelle, class: classe = "" }: { echelle: number; class?: string }) {
  return <Pixels largeur={POCHETTE_FAMILIERS_COTE} hauteur={POCHETTE_FAMILIERS_COTE} cases={CASES_POCHETTE} echelle={echelle} class={classe} />;
}

/** Le nom d'une taille : « Minuscule », « Géant »… */
const nomDeLaTaille = (familier: Familier): string => TAILLES.find((taille) => taille.id === tailleDuFamilier(familier).classe)?.nom ?? "";

/** Les losanges d'une rareté, de un à cinq : le repère de forme des cases. */
function Losanges({ rang, class: classe }: { rang: number; class: string }) {
  return (
    <span class={classe} aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/**
 * La pochette des familiers, sur « La boutique » : la seule façon d'avoir un familier. Son dessin, son prix (celui du
 * serveur), les chances de ce compte par rareté, toujours écrites avant d'ouvrir, combien de familiers il a, et le bouton
 * d'ouverture, ou la raison pour laquelle il ne peut pas ouvrir. Le dessin ouvre la ménagerie (l'album de la pochette,
 * `AlbumPochette.tsx`) : les cent familiers, ceux du compte en couleur, les autres en silhouette avec leur chance.
 * `solde` : le dernier que le serveur a donné à la page.
 */
export function PochetteFamiliers({ mes, solde, onOuvrir }: { mes: MesFamiliers; solde: number; onOuvrir: () => void }) {
  const possedes = idsPossedes(mes);
  const lignes = lignesDesChances(mes.pochette.chances, possedes);
  const raison = raisonPochetteFermee(mes, solde);
  const lireAlbum = useCallback(() => albumDeLaMenagerie(mes), [mes]);
  return (
    <section id={ANCRE_FAMILIERS} class="familiers" aria-labelledby="familiers-titre" data-testid="familiers">
      <div class="familiers-vitrine">
        <AlbumDePochette lireAlbum={lireAlbum} nombre={FAMILIERS.length} nom="Voir la ménagerie : les familiers de cette pochette" testid="familiers">
          <DessinPochetteFamiliers echelle={4} class="familiers-dessin" />
        </AlbumDePochette>
        <div class="familiers-nom">
          <h3 id="familiers-titre" class="nom-champ familiers-titre">
            La pochette des familiers
          </h3>
          <Prix montant={mes.pochette.prix} class="familiers-prix" />
          <p class="familiers-compte" data-testid="familiers-compte">
            <strong class="tnum">{possedes.size}</strong> sur {FAMILIERS.length} familiers à vous
          </p>
          {raison ? (
            <p class="pochette-raison" data-testid="familiers-raison">
              {raison}
            </p>
          ) : (
            <div>
              <button type="button" class="btn btn-primary" onClick={onOuvrir} data-testid="familiers-ouvrir">
                Ouvrir une pochette
              </button>
            </div>
          )}
        </div>
        {lignes && (
          <ul class="pochette-chances familiers-chances" aria-label="Vos chances par rareté" data-testid="familiers-chances">
            {lignes.map(({ rarete, nom, rang, chance, reste }) => (
              <li key={rarete} data-rarete={rarete}>
                <Losanges rang={rang} class="case-rang" />
                <span class="pochette-rarete">{nom}</span>
                {reste > 0 ? <span class="tnum">{pourcent(chance)}</span> : <span class="familiers-complet">tous à vous</span>}
              </li>
            ))}
          </ul>
        )}
        <p class="pochette-note familiers-regle">Un familier ne s'obtient qu'ici, jamais à la boutique ni au marché. La pochette ne donne jamais un familier que vous avez déjà.</p>
      </div>
    </section>
  );
}

/**
 * Ouvrir une pochette des familiers : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis fait tourner le
 * tambour (`Tambour.tsx`) jusqu'au familier reçu et, un instant après l'arrêt, le montre en grand avec son nom, sa rareté
 * et sa taille. Le tambour ne fait défiler que des familiers que ce compte n'avait pas, aux chances qu'avait sa pochette
 * (`bandeDesFamiliers`) : il ne fait que montrer ce que le serveur a déjà tiré. « Passer » l'arrête ; animations coupées, il
 * ne tourne pas. Si le serveur refuse, le compte de l'ouverture s'efface : il ne reste que les mots du refus et « Fermer ».
 */
export function DialogueFamiliers({ prix, chances, possedes, solde, village, ouvrir, dejaMontre, onMontrer, onFermer }: { prix: number; chances: Readonly<Record<Rarete, number>>; possedes: ReadonlySet<string>; solde: number; village: string; ouvrir: () => Promise<Issue<PochetteFamiliersReponse>>; dejaMontre: (id: string) => boolean; onMontrer: (id: string) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "tourne" | "arrete" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteFamiliersReponse | null>(null);
  const [bande, setBande] = useState<BandeVue | null>(null);
  const [passer, setPasser] = useState(false);
  const [son, basculerSon] = useSonDuTambour();
  // Le compte montré est celui du moment où la fenêtre s'ouvre : il ne bouge pas quand le solde change derrière.
  const [depart] = useState(solde);
  // Ce que ce compte avait en ouvrant : la pochette a tiré parmi les autres familiers, le tambour aussi.
  const [avant] = useState(possedes);
  const envoyer = async () => {
    if (son) preparerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir();
    const familier = issue.ok ? familierDe(issue.valeur.familier.familier) : null;
    if (issue.ok && familier) {
      const tour = bandeDesFamiliers(familier, chances, avant);
      setBande({ depart: tour.depart, cible: tour.cible, rangees: tour.rangees.map((rangee) => ({ nom: rangee.valeur.nom, rarete: rangee.rarete, dessin: vignetteDuFamilier(rangee.valeur) })) });
      setTirage(issue.valeur);
      setEtape("tourne");
    } else if (issue.ok) {
      setTirage(issue.valeur);
      setEtape("revele");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  // Le tambour arrêté reste un instant, le temps de voir la rareté fêtée, puis le familier paraît en grand.
  useEffect(() => {
    if (etape !== "arrete") return;
    const minuterie = window.setTimeout(() => setEtape("revele"), motionAllowed() ? 1600 : 0);
    return () => window.clearTimeout(minuterie);
  }, [etape]);
  const recu = tirage ? familierDe(tirage.familier.familier) : null;
  const tourne = etape === "tourne" || etape === "arrete";
  return (
    <Dialogue titre={recu && tourne ? "La pochette s'ouvre…" : recu ? "Un nouveau familier" : refus ? "La pochette reste fermée" : "Ouvrir une pochette des familiers ?"} etape={tourne ? "tourne" : etape === "revele" ? "revele" : "confirmer"} occupe={etape === "envoi" || tourne} onFermer={onFermer} testid="dialogue-familiers">
      {tourne && recu && bande ? (
        <>
          <Tambour rangees={bande.rangees} depart={bande.depart} cible={bande.cible} passer={passer} son={son} onArrive={() => setEtape((e) => (e === "tourne" ? "arrete" : e))} />
          <div class="boutique-dialogue-actions">
            {/* « Passer » montre le familier tout de suite, sans attendre la toile : la fenêtre ne reste jamais bloquée. */}
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                setPasser(true);
                setEtape("revele");
              }}
              data-testid="familiers-passer"
            >
              Passer
            </button>
            <BoutonSon son={son} onBasculer={basculerSon} testid="familiers-son" />
          </div>
        </>
      ) : tirage && recu ? (
        <div class="familier-recu">
          <div class="pochette-revelation familier-revelation" data-rarete={recu.rarete} data-testid="familiers-tirage" data-familier={recu.id}>
            <DessinFamilier familier={recu} place={256} maximum={8} />
          </div>
          <p class="familier-revelation-nom" data-testid="familiers-tirage-nom">
            {recu.nom}
          </p>
          <p class="familier-revelation-traits">
            <RareteDuFamilier rarete={recu.rarete} />
            <span class="familier-taille">{nomDeLaTaille(recu)}</span>
          </p>
          <p class="boutique-dialogue-texte">
            Il vous reste {stateres(tirage.solde)}. {tirage.reste > 0 ? `Encore ${tirage.reste} ${tirage.reste > 1 ? "familiers" : "familier"} à recevoir.` : "Vous les avez tous."}
          </p>
          <div class="boutique-dialogue-actions">
            {!dejaMontre(recu.id) && (
              <button type="button" class="btn btn-primary familier-montrer" onClick={() => onMontrer(recu.id)} data-testid="familiers-montrer">
                Le montrer à côté de mon Gaulois
              </button>
            )}
            <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="familiers-fermer">
              Fermer
            </button>
          </div>
          <a class="familier-revelation-lien" href={village} data-testid="familiers-vers-village">
            Voir dans Mon Gaulois
          </a>
        </div>
      ) : (
        <>
          <div class="pochette-attente" data-envoi={etape === "envoi" ? "" : undefined}>
            <DessinPochetteFamiliers echelle={4} />
          </div>
          {!refus && <Compte prix={prix} solde={depart} />}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="familiers-confirmer">
                {etape === "envoi" ? "Ouverture…" : "Ouvrir"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="familiers-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}
