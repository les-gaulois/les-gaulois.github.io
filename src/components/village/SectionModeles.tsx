import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { motionAllowed } from "../../lib/fx/motion";
import { type Rarete, type Tenue } from "../../lib/gaulois";
import type { AchatModeleReponse, MesModeles, PochetteModelesReponse } from "../../lib/village/contrat";
import { pourcent, stateres } from "../../lib/village/ecran-boutique";
import { albumDesModeles, bandeDesModeles, lignesDesChances, modelesDeLaPochette, resteADecouvrir, surCombien, type ActionDeLEssai } from "../../lib/village/ecran-modeles";
import { MODELES, apercuDuModele, decrireLeModele, etatDuModele, idsDesModeles, modeleNu, modeleParId, modelesParFamille, raisonPochetteFermee, silhouetteDuModele, type DessinDuModele, type EtatDuModele, type ModeleRange } from "../../lib/village/modeles";
import { Problem } from "../compte/common";
import { AlbumDePochette } from "./AlbumPochette";
import { Compte, Dialogue, Refus, type BandeVue, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Prix, peindre } from "./BoutiquePixels";
import type { EtatDesModeles } from "./Modeles";
import { BoutonSon, Tambour, preparerLeSon, useSonDuTambour } from "./Tambour";

/**
 * Les Gaulois uniques sur « La boutique » (15 novembre 2026, demande du pilote : « mets-les en pochette dédiée et en
 * boutique ») : la pochette des Gaulois uniques, la vitrine des onze modèles par famille, et les deux fenêtres (ouvrir une
 * pochette, acheter un modèle). Un modèle s'essaie comme un objet de la boutique : sur le seul Gaulois d'essayage de la
 * page, celui du membre, avec tout ce qu'il porte. Le serveur décide de tout (`Modeles.tsx`, `useModeles`).
 */

/**
 * Un dessin de 48 cases sur 64, agrandi d'un nombre entier de fois par la feuille de style (`--uniques-e`), sans flou.
 * Décoratif, sauf si `nom` le dit : c'est alors une image, avec son texte de remplacement.
 */
function Dessin({ dessin, nom, class: classe = "" }: { dessin: DessinDuModele; nom?: string; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, dessin.largeur, dessin.hauteur, dessin.cases), [dessin]);
  return <canvas ref={toile} width={dessin.largeur} height={dessin.hauteur} class={`pixels uniques-dessin ${classe}`} {...(nom ? { role: "img", "aria-label": nom } : { "aria-hidden": "true" })} />;
}

/** Les dessins des modèles seuls et leurs silhouettes, calculés une fois pour la page. */
const NUS = new Map<string, DessinDuModele | null>();
const nuDe = (id: string): DessinDuModele | null => {
  if (!NUS.has(id)) NUS.set(id, modeleNu(id));
  return NUS.get(id) ?? null;
};
const SILHOUETTES = new Map<string, DessinDuModele | null>();
const silhouetteDe = (id: string): DessinDuModele | null => {
  if (!SILHOUETTES.has(id)) SILHOUETTES.set(id, silhouetteDuModele(id));
  return SILHOUETTES.get(id) ?? null;
};

/** Le Gaulois du membre avec ce modèle, en grand : dans les fenêtres. Une image, que son texte de remplacement décrit. */
function GauloisUnique({ tenue, modele }: { tenue: Tenue; modele: ModeleRange }) {
  const dessin = useMemo(() => apercuDuModele(tenue, modele.id), [tenue, modele.id]);
  return <Dessin dessin={dessin} nom={`Votre Gaulois en ${decrireLeModele(modele.id)}. ${modele.description}`} class="uniques-dessin-grand" />;
}

/** La rareté d'un modèle hors d'une case : écrite et comptée en losanges, dans la couleur de la rareté. */
function RareteDuModele({ rarete }: { rarete: Rarete }) {
  return (
    <span class="uniques-rarete" data-rarete={rarete}>
      <MarqueDeRarete rarete={rarete} />
    </span>
  );
}

/** Les losanges d'une rareté, de un à cinq. */
function Losanges({ rang }: { rang: number }) {
  return (
    <span class="case-rang" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** Le dessin de la pochette : trois silhouettes de modèles que le compte n'a pas encore, l'une devant l'autre. */
function DessinDeLaPochette({ possedes }: { possedes: ReadonlySet<string> }) {
  return (
    <span class="uniques-ombres" aria-hidden="true">
      {modelesDeLaPochette(possedes).map((modele) => {
        const silhouette = silhouetteDe(modele.id);
        return silhouette && <Dessin key={modele.id} dessin={silhouette} />;
      })}
    </span>
  );
}

/**
 * Une case de la vitrine : le modèle seul, son nom, sa rareté, puis son prix, « à vous » ou « porté ». Un bouton : il
 * l'essaie sur le Gaulois du membre. Celui qu'on porte ne s'essaie pas : sa case arrête l'essayage en cours.
 */
function CaseDeModele({ modele, etat, prix, essaye, onClick }: { modele: ModeleRange; etat: EtatDuModele; prix: number; essaye: boolean; onClick: () => void }) {
  const nu = nuDe(modele.id);
  return (
    <li>
      <button type="button" class="uniques-case" data-rarete={modele.rarete} data-etat={essaye ? "essaye" : etat} aria-pressed={essaye || etat === "porte"} onClick={onClick} data-testid="uniques-case" data-modele={modele.id}>
        <span class="uniques-case-image">{nu && <Dessin dessin={nu} />}</span>
        <span class="uniques-case-nom">{modele.nom}</span>
        <MarqueDeRarete rarete={modele.rarete} />
        <span class="sr-only">, </span>
        {etat === "a-obtenir" ? (
          <Prix montant={prix} class="case-prix" />
        ) : (
          <span class="uniques-etat" data-etat={etat}>
            {etat === "porte" ? "porté" : "à vous"}
          </span>
        )}
        {essaye && (
          <span class="case-essai">
            <span class="sr-only">, en </span>essai
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * « Gaulois uniques », l'onglet « Uniques » des rayons de « La boutique » : le nom de l'onglet sert de titre, celui de la
 * section ne se lit qu'aux lecteurs d'écran. L'adresse `#gaulois-uniques` est suivie par la boutique, qui ouvre cet onglet. En tête, le corps que le Gaulois porte et de quoi revenir à l'humain ;
 * puis la pochette (son prix, les chances réelles de ce compte, ce qu'il lui reste à découvrir), puis les onze modèles,
 * famille par famille. `solde` : le dernier que le serveur a donné à la page. `essaye` : le modèle que le Gaulois de la
 * page essaie.
 *
 * `partie` (16 novembre 2026) : « modeles », l'onglet « Uniques », sans la pochette ; « pochette », la seule pochette, pour
 * l'onglet « Pochettes » de la boutique, où le pilote a voulu toutes les pochettes. La section ne garde rien : la boutique
 * la rend dans les deux onglets à partir de la même lecture.
 */
export function SectionDesModeles({ partie = "modeles", etat, solde, essaye, occupe, onEssayer, onOuvrir, onHumain, onRelire }: { partie?: "modeles" | "pochette"; etat: EtatDesModeles; solde: number | null; essaye: string | null; occupe: boolean; onEssayer: (id: string | null) => void; onOuvrir: () => void; onHumain: () => void; onRelire: () => void }) {
  if (etat.kind !== "pret") {
    return (
      <section class="uniques" aria-labelledby="uniques-titre" data-testid="uniques" data-etat={etat.kind}>
        <h4 id="uniques-titre" class="sr-only">
          Gaulois uniques
        </h4>
        {etat.kind === "lecture" ? (
          <p class="text-muted" role="status">
            Lecture des Gaulois uniques…
          </p>
        ) : (
          <div data-testid="uniques-panne">
            <Problem message="Les Gaulois uniques ne répondent pas pour l'instant." onRetry={onRelire} />
          </div>
        )}
      </section>
    );
  }
  const { mes } = etat;
  const possedes = idsDesModeles(mes);
  const porte = modeleParId(mes.porte);
  const soldeConnu = solde ?? mes.solde;
  const lignes = lignesDesChances(mes.pochette.chances, possedes);
  const raison = raisonPochetteFermee(mes, soldeConnu);
  const reste = resteADecouvrir(possedes);
  // L'album de la pochette : les onze modèles, chacun avec sa chance (`albumDesModeles`). Calculé à l'ouverture, puis à
  // chaque rendu de la section tant qu'il est ouvert : onze cases aux dessins gardés, sans coût notable. Pas de
  // useCallback ici : la section rend plus tôt pendant la lecture, un hook après ce retour casserait leur ordre.
  const lireAlbum = () => albumDesModeles(mes);
  const pochette = (
    <section class="uniques-pochette" aria-labelledby="uniques-pochette-titre" data-testid="uniques-pochette">
      <AlbumDePochette lireAlbum={lireAlbum} nombre={MODELES.length} nom="Voir les Gaulois uniques de cette pochette" testid="uniques-pochette">
        <DessinDeLaPochette possedes={possedes} />
      </AlbumDePochette>
      <div class="uniques-pochette-nom">
        <h4 id="uniques-pochette-titre" class="nom-champ uniques-pochette-titre">
          La pochette des Gaulois uniques
        </h4>
        <Prix montant={mes.pochette.prix} class="uniques-pochette-prix" />
        {reste > 0 && (
          <p class="uniques-compte" data-testid="uniques-reste">
            <strong class="tnum">{reste}</strong> à découvrir
          </p>
        )}
        {raison ? (
          <p class="pochette-raison" data-testid="uniques-raison">
            {raison}
          </p>
        ) : (
          <div>
            <button type="button" class="btn btn-primary" onClick={onOuvrir} data-testid="uniques-ouvrir">
              Ouvrir une pochette
            </button>
          </div>
        )}
      </div>
      {lignes && (
        <ul class="pochette-chances uniques-chances" aria-label="Vos chances par rareté" data-testid="uniques-chances">
          {lignes.map(({ rarete, nom, rang, chance, reste: aRecevoir }) => (
            <li key={rarete} data-rarete={rarete}>
              <Losanges rang={rang} />
              <span class="pochette-rarete">{nom}</span>
              {aRecevoir > 0 ? <span class="tnum">{pourcent(chance)}</span> : <span class="uniques-complet">tous à vous</span>}
            </li>
          ))}
        </ul>
      )}
      {lignes && <p class="pochette-note uniques-regle">Jamais deux fois le même.</p>}
    </section>
  );
  // Dans l'onglet « Pochettes » : la pochette seule, déjà une région à son nom.
  if (partie === "pochette") {
    return (
      <div class="uniques" data-testid="uniques-des-pochettes" data-etat="pret">
        {pochette}
      </div>
    );
  }
  return (
    <section class="uniques" aria-labelledby="uniques-titre" data-testid="uniques" data-etat="pret">
      <div class="uniques-tete">
        <h4 id="uniques-titre" class="sr-only">
          Gaulois uniques
        </h4>
        <p class="uniques-porte" data-testid="uniques-porte">
          <span>
            Votre corps : <strong>{porte ? porte.nom : "humain"}</strong>
          </span>
          {porte && (
            <button type="button" class="chip" disabled={occupe} onClick={onHumain} data-testid="uniques-humain">
              Revenir au corps humain
            </button>
          )}
        </p>
        <p class="uniques-compte" data-testid="uniques-compte">
          <strong class="tnum">{possedes.size}</strong> sur {MODELES.length} à vous
        </p>
      </div>

      <div class="uniques-familles">
        {modelesParFamille().map(({ famille, modeles }, index) => (
          <section key={famille} class="uniques-famille" aria-labelledby={`uniques-famille-${index}`} data-testid="uniques-famille">
            <h5 id={`uniques-famille-${index}`} class="vestiaire-boutique">
              {famille} <span class="tnum uniques-famille-compte">{surCombien(modeles.filter((modele) => possedes.has(modele.id)).length, modeles.length)}</span>
              <span class="sr-only"> à vous</span>
            </h5>
            <ul class="uniques-cases">
              {modeles.map((modele) => {
                const etatDuCase = etatDuModele(modele.id, mes);
                return <CaseDeModele key={modele.id} modele={modele} etat={etatDuCase} prix={mes.prix[modele.rarete]} essaye={essaye === modele.id} onClick={() => onEssayer(etatDuCase === "porte" || essaye === modele.id ? null : modele.id)} />;
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

/**
 * Sous le Gaulois d'essayage : le modèle essayé, sa rareté, puis de quoi l'acheter (son prix, ou ce qui l'empêche), le
 * porter s'il est au compte, et arrêter l'essai.
 */
export function EssaiDuModele({ modele, action, prix, raison, occupe, onAcheter, onPorter, onFin }: { modele: ModeleRange; action: ActionDeLEssai; prix: number; raison: string | null; occupe: boolean; onAcheter: () => void; onPorter: () => void; onFin: () => void }) {
  return (
    <>
      <span>
        Essayage : <strong>{modele.nom}</strong>
      </span>
      {action === "acheter" && <Prix montant={prix} class="vestiaire-essai-prix" />}
      {action === "acheter" && raison && (
        <span class="vestiaire-essai-raison" data-testid="uniques-essai-raison">
          {raison}
        </span>
      )}
      <span class="vestiaire-essai-actions">
        {action === "acheter" && !raison && (
          <button type="button" class="chip chip-fort" onClick={onAcheter} data-testid="uniques-acheter">
            Acheter
          </button>
        )}
        {action === "porter" && (
          <button type="button" class="chip chip-fort" disabled={occupe} onClick={onPorter} data-testid="uniques-porter">
            {occupe ? "Enregistrement…" : "Le porter"}
          </button>
        )}
        <button type="button" class="chip" onClick={onFin} data-testid="uniques-fin-essai">
          Ne plus essayer
        </button>
      </span>
    </>
  );
}

/**
 * Acheter un Gaulois unique : la fenêtre le montre sur le Gaulois du membre, dit son prix et ce qu'il restera, puis demande
 * au serveur. Après l'achat, il se porte tout de suite si le membre le veut. Si le serveur refuse, le compte de
 * l'ouverture s'efface : il ne reste que le modèle, les mots du refus et « Fermer ».
 */
export function DialogueAchatModele({ modele, prix, solde, tenue, acheter, onPorter, onFermer }: { modele: ModeleRange; prix: number; solde: number; tenue: Tenue; acheter: () => Promise<Issue<AchatModeleReponse>>; onPorter: () => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "fait">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [reste, setReste] = useState<number | null>(null);
  // Le compte montré est celui du moment où la fenêtre s'ouvre : il ne bouge pas quand le solde change derrière.
  const [depart] = useState(solde);
  const envoyer = async () => {
    setEtape("envoi");
    setRefus(null);
    const issue = await acheter();
    if (issue.ok) {
      setReste(issue.valeur.solde);
      setEtape("fait");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  return (
    <Dialogue titre={etape === "fait" ? `${modele.nom} est à vous` : refus ? "Achat impossible" : `Acheter ${modele.nom} ?`} etape={etape === "fait" ? "fait" : "confirmer"} occupe={etape === "envoi"} onFermer={onFermer} testid="dialogue-modele">
      <div class="uniques-scene" data-rarete={modele.rarete} data-testid="uniques-achat-scene" data-modele={modele.id}>
        <GauloisUnique tenue={tenue} modele={modele} />
      </div>
      <RareteDuModele rarete={modele.rarete} />
      {etape === "fait" ? (
        <>
          {reste !== null && <p class="boutique-dialogue-texte">Il vous reste {stateres(reste)}.</p>}
          <div class="boutique-dialogue-actions">
            <button type="button" class="btn btn-primary" onClick={onPorter} data-testid="uniques-achat-porter">
              Le porter
            </button>
            <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="uniques-achat-fermer">
              Fermer
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Après un refus, les chiffres de l'ouverture ne valent plus (le solde ou le prix a changé) : le refus seul. */}
          {!refus && <Compte prix={prix} solde={depart} />}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="uniques-achat-confirmer">
                {etape === "envoi" ? "Achat…" : "Acheter"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="uniques-achat-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}

/**
 * Ouvrir une pochette des Gaulois uniques : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis fait
 * tourner le tambour (`Tambour.tsx`) jusqu'au modèle reçu et, un instant après l'arrêt, le montre en grand sur le Gaulois
 * du membre, avec son nom et sa rareté. Le tambour ne fait défiler que des modèles que ce compte n'avait pas, aux chances
 * qu'avait sa pochette (`bandeDesModeles`) : il ne fait que montrer ce que le serveur a déjà tiré. « Passer » l'arrête ;
 * animations coupées, il ne tourne pas. Si le serveur refuse, le compte de l'ouverture s'efface : il ne reste que les
 * mots du refus et « Fermer ».
 */
export function DialogueModeles({ mes, solde, tenue, ouvrir, onPorter, onFermer }: { mes: MesModeles; solde: number; tenue: Tenue; ouvrir: (prixVu: number) => Promise<Issue<PochetteModelesReponse>>; onPorter: (id: string) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "tourne" | "arrete" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteModelesReponse | null>(null);
  const [bande, setBande] = useState<BandeVue | null>(null);
  const [passer, setPasser] = useState(false);
  const [son, basculerSon] = useSonDuTambour();
  // Le compte, le prix, les chances et les modèles du moment où la fenêtre s'ouvre : la pochette a tiré parmi ceux que le
  // compte n'avait pas alors, le tambour aussi.
  const [depart] = useState(solde);
  const [prix] = useState(mes.pochette.prix);
  const [chances] = useState(mes.pochette.chances);
  const [avant] = useState(() => idsDesModeles(mes));
  const envoyer = async () => {
    if (son) preparerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir(prix);
    const modele = issue.ok ? modeleParId(issue.valeur.modele.modele) : null;
    if (issue.ok && modele) {
      const tour = bandeDesModeles(modele, chances, avant);
      setBande({ depart: tour.depart, cible: tour.cible, rangees: tour.rangees.map((rangee) => ({ nom: rangee.valeur.nom, rarete: rangee.rarete, dessin: nuDe(rangee.valeur.id) })) });
      setTirage(issue.valeur);
      setEtape("tourne");
    } else {
      // Un modèle inconnu de ce code ne peut pas arriver ici (`lirePochetteModeles` l'écarte) : la page est à recharger.
      setRefus(issue.ok ? "Ce Gaulois unique n'existe pas. Rechargez la page." : issue.message);
      setEtape("confirmer");
    }
  };
  // Le tambour arrêté reste un instant, le temps de voir la rareté fêtée, puis le modèle paraît en grand.
  useEffect(() => {
    if (etape !== "arrete") return;
    const minuterie = window.setTimeout(() => setEtape("revele"), motionAllowed() ? 1600 : 0);
    return () => window.clearTimeout(minuterie);
  }, [etape]);
  const recu = tirage ? modeleParId(tirage.modele.modele) : null;
  const tourne = etape === "tourne" || etape === "arrete";
  return (
    <Dialogue titre={recu && tourne ? "La pochette s'ouvre…" : recu ? "Un nouveau Gaulois unique" : refus ? "La pochette reste fermée" : "Ouvrir une pochette des Gaulois uniques ?"} etape={tourne ? "tourne" : etape === "revele" ? "revele" : "confirmer"} occupe={etape === "envoi" || tourne} onFermer={onFermer} testid="dialogue-modeles">
      {tourne && recu && bande ? (
        <>
          <Tambour rangees={bande.rangees} depart={bande.depart} cible={bande.cible} passer={passer} son={son} onArrive={() => setEtape((e) => (e === "tourne" ? "arrete" : e))} />
          <div class="boutique-dialogue-actions">
            {/* « Passer » montre le modèle tout de suite, sans attendre la toile : la fenêtre ne reste jamais bloquée. */}
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                setPasser(true);
                setEtape("revele");
              }}
              data-testid="uniques-passer"
            >
              Passer
            </button>
            <BoutonSon son={son} onBasculer={basculerSon} testid="uniques-son" />
          </div>
        </>
      ) : tirage && recu ? (
        <div class="uniques-recu">
          <div class="pochette-revelation uniques-revelation" data-rarete={recu.rarete} data-testid="uniques-tirage" data-modele={recu.id}>
            <GauloisUnique tenue={tenue} modele={recu} />
          </div>
          <p class="uniques-recu-nom" data-testid="uniques-tirage-nom">
            {recu.nom}
          </p>
          <RareteDuModele rarete={recu.rarete} />
          <p class="boutique-dialogue-texte">
            Il vous reste {stateres(tirage.solde)}. {tirage.reste > 0 ? `Encore ${tirage.reste} à découvrir.` : "Vous les avez tous."}
          </p>
          <div class="boutique-dialogue-actions">
            <button type="button" class="btn btn-primary" onClick={() => onPorter(recu.id)} data-testid="uniques-tirage-porter">
              Le porter
            </button>
            <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="uniques-tirage-fermer">
              Fermer
            </button>
          </div>
        </div>
      ) : (
        <>
          <div class="pochette-attente uniques-attente" data-envoi={etape === "envoi" ? "" : undefined}>
            <DessinDeLaPochette possedes={avant} />
          </div>
          {!refus && <Compte prix={prix} solde={depart} />}
          <Refus message={refus} />
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="uniques-confirmer">
                {etape === "envoi" ? "Ouverture…" : "Ouvrir"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="uniques-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}
