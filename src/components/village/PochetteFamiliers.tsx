import { useEffect, useState } from "preact/hooks";
import { ORDRE_RARETES, RARETES, type Rarete } from "../../lib/gaulois";
import type { MesFamiliers, PochetteFamiliersReponse } from "../../lib/village/contrat";
import { pourcent, stateres } from "../../lib/village/ecran-boutique";
import { ANCRE_FAMILIERS, idsPossedes, lignesDesChances, raisonPochetteFermee, rangerLaMenagerie, surCombien, vignetteDuFamilier } from "../../lib/village/ecran-familiers";
import { FAMILIERS, chanceDuFamilier, familierDe, tailleDuFamilier, TAILLES, type Familier } from "../../lib/village/familiers";
import { motionAllowed } from "../../lib/fx/motion";
import { bandeDesFamiliers } from "../../lib/village/tambour";
import { TOUT, type Filtre } from "../../lib/village/vestiaire-rayons";
import { Compte, Dialogue, Refus, type BandeVue, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Pixels, Prix } from "./BoutiquePixels";
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

/** Un choix du filtre de la ménagerie : une rareté et le nombre de ses familiers. */
function ChoixDeRarete({ filtre, nom, rang, nombre, choisi, onClick }: { filtre: Filtre; nom: string; rang: number; nombre: number; choisi: boolean; onClick: () => void }) {
  return (
    <button type="button" class="chip filtre" data-rarete={filtre} aria-pressed={choisi} disabled={nombre === 0} onClick={onClick} data-testid={`menagerie-filtre-${filtre}`}>
      {rang > 0 && <Losanges rang={rang} class="filtre-rang" />}
      {nom}
      <span class="filtre-nombre tnum">{nombre}</span>
      <span class="sr-only"> {nombre > 1 ? "familiers" : "familier"}</span>
    </button>
  );
}

/**
 * Une case de la ménagerie. Un familier qu'on a : son dessin en couleur et « à vous ». Un familier à recevoir : sa
 * silhouette, son nom, sa rareté, et sa chance dans la prochaine pochette de ce compte. La case ne se clique pas : un
 * familier ne s'achète pas, et se choisit dans « Mon Gaulois ».
 */
function CaseDeMenagerie({ familier, possede, montre, chance }: { familier: Familier; possede: boolean; montre: boolean; chance: number }) {
  return (
    <li class="case familier-case" data-rarete={familier.rarete} data-possede={possede ? "" : undefined} data-testid="menagerie-case" data-familier={familier.id}>
      <span class="case-image">
        <DessinFamilier familier={familier} place={80} maximum={3} silhouette={!possede} />
      </span>
      <span class="case-nom">{familier.nom}</span>
      <MarqueDeRarete rarete={familier.rarete} />
      {possede ? (
        <span class="case-marque">
          <span class="sr-only">, </span>
          {montre ? "montré" : "à vous"}
        </span>
      ) : (
        <span class="familier-chance tnum">
          <span class="sr-only">, à recevoir, </span>
          {pourcent(chance)}
          <span class="sr-only"> de chance dans votre prochaine pochette</span>
        </span>
      )}
    </li>
  );
}

/**
 * La ménagerie : les cent familiers, famille par famille, réduits à une rareté si on le veut. Ceux du compte en couleur,
 * les autres en silhouette : la ménagerie ne se montre qu'ici (le choix du familier montré, dans « Mon Gaulois », ne
 * liste que ceux qu'on a). Repliée à l'ouverture de la page : cent cases, avant le marché et les rayons.
 */
function Menagerie({ mes }: { mes: MesFamiliers }) {
  const [ouverte, setOuverte] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>(TOUT);
  const possedes = idsPossedes(mes);
  const range = rangerLaMenagerie(possedes, filtre);
  return (
    <details class="fold familiers-menagerie" open={ouverte} onToggle={(e) => setOuverte(e.currentTarget.open)} data-testid="menagerie">
      <summary>
        La ménagerie{" "}
        <span class="info-discrete" data-testid="menagerie-compte">
          {surCombien(range.possedes, range.total)}
        </span>
      </summary>
      {/* Les cases ne se dessinent qu'une fois la ménagerie ouverte : cent toiles de moins à peindre à l'arrivée. */}
      {ouverte && (
        <div class="familiers-menagerie-corps">
          <div class="vestiaire-filtre" role="group" aria-label="Montrer une rareté" data-testid="menagerie-filtre">
            <ChoixDeRarete filtre={TOUT} nom="Tout" rang={0} nombre={range.total} choisi={range.retenu === TOUT} onClick={() => setFiltre(TOUT)} />
            {ORDRE_RARETES.map((rarete) => (
              <ChoixDeRarete key={rarete} filtre={rarete} nom={RARETES[rarete].nom} rang={RARETES[rarete].rang} nombre={range.comptes[rarete]} choisi={range.retenu === rarete} onClick={() => setFiltre(range.retenu === rarete ? TOUT : rarete)} />
            ))}
          </div>
          {range.possedes < range.total && <p class="pochette-note">Sous une silhouette : sa chance de sortir de votre prochaine pochette.</p>}
          {range.familles.map(({ famille, possedes: nombre, total, familiers }, index) => (
            <section key={famille} class="familiers-famille" aria-labelledby={`menagerie-famille-${index}`} data-testid="menagerie-famille">
              <h4 id={`menagerie-famille-${index}`} class="vestiaire-boutique">
                {famille} <span class="tnum familiers-famille-compte">{surCombien(nombre, total)}</span>
              </h4>
              <ul class="cases familiers-cases">
                {familiers.map((familier) => (
                  <CaseDeMenagerie key={familier.id} familier={familier} possede={possedes.has(familier.id)} montre={mes.porte === familier.id} chance={chanceDuFamilier(familier.id, mes.pochette.chances, possedes)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </details>
  );
}

/**
 * La pochette des familiers, sur « La boutique » : la seule façon d'avoir un familier. Son dessin, son prix (celui du
 * serveur), les chances de ce compte par rareté, toujours écrites avant d'ouvrir, combien de familiers il a, et le bouton
 * d'ouverture, ou la raison pour laquelle il ne peut pas ouvrir. Puis la ménagerie. `solde` : le dernier que le serveur a
 * donné à la page.
 */
export function PochetteFamiliers({ mes, solde, onOuvrir }: { mes: MesFamiliers; solde: number; onOuvrir: () => void }) {
  const possedes = idsPossedes(mes);
  const lignes = lignesDesChances(mes.pochette.chances, possedes);
  const raison = raisonPochetteFermee(mes, solde);
  return (
    <section id={ANCRE_FAMILIERS} class="familiers" aria-labelledby="familiers-titre" data-testid="familiers">
      <div class="familiers-vitrine">
        <DessinPochetteFamiliers echelle={4} class="familiers-dessin" />
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
      <Menagerie mes={mes} />
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
