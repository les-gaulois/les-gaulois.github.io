import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Rarete, type Tenue } from "../../lib/gaulois";
import { carteDUnRendu, carteDeRarete, type CarteDeScene } from "../../lib/jeu/boosters";
import { cleDuModele } from "../../lib/village/fonds-objets";
import { reveillerLeSon } from "../../lib/jeu/sons-des-boosters";
import type { AchatModeleReponse, MesModeles, PochetteModelesReponse } from "../../lib/village/contrat";
import { nombre, pourcent, stateres } from "../../lib/village/ecran-boutique";
import { albumDesModeles, lignesDesChances, rendusDeLaPochette, resteADecouvrir, surCombien, type ActionDeLEssai, type Rendu } from "../../lib/village/ecran-modeles";
import { MODELES, apercuDuModele, decrireLeModele, etatDuModele, idsDesModeles, modeleNu, modeleParId, modelesParFamille, raisonPochetteFermee, type DessinDuModele, type EtatDuModele, type ModeleRange } from "../../lib/village/modeles";
import { Problem } from "../compte/common";
import { Px } from "../jeu/Pixels";
import { BoutonDuJeu, PrixDuJeu } from "./BoutiqueDuJeu";
import { Compte, Dialogue, Refus, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Prix, peindre } from "./BoutiquePixels";
import { BoutonDesBoosters, ConfirmerLeBooster, FenetreDuBooster, FicheDuBooster, ResteEnPixels } from "./KitDesBoosters";
import type { EtatDesModeles } from "./Modeles";
import { OuvertureDuBooster } from "./OuvertureDuBooster";
import { CarteDeStateres } from "./CarteDeStateres";
import { CarteDeSortie } from "./CarteDeSortie";

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

/** Le Gaulois du membre avec ce modèle, en grand : dans les fenêtres. Une image, que son texte de remplacement décrit. */
function GauloisUnique({ tenue, modele }: { tenue: Tenue; modele: ModeleRange }) {
  const dessin = useMemo(() => apercuDuModele(tenue, modele.id), [tenue, modele.id]);
  return <Dessin dessin={dessin} nom={`Votre Gaulois en ${decrireLeModele(modele.id)}. ${modele.description}`} class="uniques-dessin-grand" />;
}

/** La rareté d'un modèle hors d'une case : écrite, avec son icône, dans la couleur de la rareté. */
function RareteDuModele({ rarete }: { rarete: Rarete }) {
  return (
    <span class="uniques-rarete" data-rarete={rarete}>
      <MarqueDeRarete rarete={rarete} />
    </span>
  );
}


/** « 600 à 1 800 » : le plus petit et le plus grand remboursement, en statères. */
const etendueDesRendus = (paliers: readonly Rendu[]): string => {
  const petit = paliers[0]?.rendu ?? 0;
  const grand = paliers[paliers.length - 1]?.rendu ?? petit;
  return petit === grand ? nombre(petit) : `${nombre(petit)} à ${nombre(grand)}`;
};

/**
 * Ce que la pochette rend, dans son album, entre le titre et les cases des modèles : la part des pochettes qui
 * remboursent, puis les paliers en statères, du plus petit au plus grand, tous à chances égales.
 */
function RendusDeLAlbum({ chance, paliers }: { chance: number; paliers: readonly Rendu[] }) {
  return (
    <div class="uniques-album-rendus" data-testid="uniques-album-rendus">
      <p class="uniques-album-rendus-titre">
        <strong class="tnum">{pourcent(chance)}</strong> statères rendus
      </p>
      <ul class="uniques-album-paliers" aria-label="Ce qu'une pochette peut rendre, à chances égales">
        {paliers.map((palier) => (
          <li key={palier.pourcent}>
            <Prix montant={palier.rendu} />
          </li>
        ))}
      </ul>
    </div>
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
 * puis la pochette (son prix, les chances réelles de ce compte, remboursements compris, ce qu'il lui reste à découvrir), puis les onze modèles,
 * famille par famille. `solde` : le dernier que le serveur a donné à la page. `essaye` : le modèle que le Gaulois de la
 * page essaie.
 *
 * `partie` (16 novembre 2026) : « modeles », l'onglet « Uniques », sans la pochette ; « pochette », la seule pochette, pour
 * l'onglet « Pochettes » de la boutique, où le pilote a voulu toutes les pochettes. La section ne garde rien : la boutique
 * la rend dans les deux onglets à partir de la même lecture.
 */
export function SectionDesModeles({ partie = "modeles", etat, solde, pochetteGagnee = false, boostersGagnes = 0, essaye, occupe, onEssayer, onOuvrir, onHumain, onRelire }: { partie?: "modeles" | "pochette"; etat: EtatDesModeles; solde: number | null; /** Une pochette des Gaulois uniques gagnée à la loterie attend : elle s'ouvre sans rien payer. */ pochetteGagnee?: boolean; /** Combien en attendent (l'étiquette « 2 gagnés »). */ boostersGagnes?: number; essaye: string | null; occupe: boolean; onEssayer: (id: string | null) => void; onOuvrir: () => void; onHumain: () => void; onRelire: () => void }) {
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
  const lignes = lignesDesChances(mes.pochette, possedes);
  const rendus = rendusDeLaPochette(mes.pochette, possedes);
  const raison = raisonPochetteFermee(mes, pochetteGagnee ? Math.max(soldeConnu, mes.pochette.prix) : soldeConnu);
  const reste = resteADecouvrir(possedes);
  // L'album de la pochette : les onze modèles, chacun avec sa chance (`albumDesModeles`). Calculé à l'ouverture, puis à
  // chaque rendu de la section tant qu'il est ouvert : onze cases aux dessins gardés, sans coût notable. Pas de
  // useCallback ici : la section rend plus tôt pendant la lecture, un hook après ce retour casserait leur ordre.
  const lireAlbum = () => albumDesModeles(mes);
  const pochette = (
    <FicheDuBooster
      sorte="modeles"
      nom="Booster des Gaulois uniques"
      testid="uniques-pochette"
      album={{ lireAlbum, nombre: MODELES.length, nom: "Voir ce que ce booster peut donner", entete: lignes && rendus ? <RendusDeLAlbum chance={rendus.chance} paliers={rendus.paliers} /> : undefined }}
      contenu={`${MODELES.length} Gaulois`}
      prix={mes.pochette.prix}
      compte={reste > 0 ? `${reste} à découvrir` : null}
      gagnees={boostersGagnes}
      raison={raison}
      onOuvrir={onOuvrir}
      lignes={
        lignes
          ? [...(rendus ? [{ kind: "rendu" as const, etendue: etendueDesRendus(rendus.paliers), chance: pourcent(rendus.chance) }] : []), ...lignes.map(({ rarete, chance, reste: aRecevoir }) => ({ kind: "rarete" as const, rarete, chance: aRecevoir > 0 ? pourcent(chance) : null, touteA: "tous à vous" }))]
          : null
      }
      regle={lignes ? <p>Jamais deux fois le même.</p> : null}
    />
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
      {/* Les pièces du jeu (21 novembre 2026), comme l'essai d'un objet de la boutique. */}
      <Px t={modele.nom} plie classe="boutique-jeu-essai-nom" dit={`Essayage : ${modele.nom}`} />
      {action === "acheter" && <PrixDuJeu valeur={prix} classe="vestiaire-essai-prix" />}
      {action === "acheter" && raison && (
        <span class="vestiaire-essai-raison" data-testid="uniques-essai-raison">
          {raison}
        </span>
      )}
      <span class="vestiaire-essai-actions boutique-jeu-essai-actions">
        {action === "acheter" && !raison && <BoutonDuJeu t="Acheter" icone="action-acheter" dit={`Acheter « ${modele.nom} » pour ${stateres(prix)}`} onClick={onAcheter} testid="uniques-acheter" />}
        {action === "porter" && <BoutonDuJeu t="Le porter" icone="action-porter" disabled={occupe} onClick={onPorter} testid="uniques-porter" />}
        <BoutonDuJeu t="Arrêter" bleu dit="Arrêter l'essai" onClick={onFin} testid="uniques-fin-essai" />
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
 * Ouvrir un booster des Gaulois uniques : la fenêtre dit le prix et ce qu'il restera, demande au serveur, puis le joueur
 * ouvre le paquet et retourne la carte de ce que le serveur a tiré (`OuvertureDuBooster.tsx`, qui remplace le tambour
 * depuis le 21 novembre 2026) : un Gaulois unique, ou des statères rendus (une carte sans rareté, à la lumière neutre).
 * Dessous, le modèle en grand sur le Gaulois du membre avec « Le porter », ou ce qui est rendu, sa part du prix et la
 * bourse. Si le serveur refuse, le compte de l'ouverture s'efface : il ne reste que les mots du refus et « Fermer ».
 */
export function DialogueModeles({ mes, solde, tenue, ouvrir, onPorter, onFermer }: { mes: MesModeles; solde: number; tenue: Tenue; ouvrir: (prixVu: number) => Promise<Issue<PochetteModelesReponse>>; onPorter: (id: string) => void; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "ouvre" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [tirage, setTirage] = useState<PochetteModelesReponse | null>(null);
  const [carte, setCarte] = useState<CarteDeScene | null>(null);
  // Le compte, le booster (prix, remboursements) et les modèles du moment où la fenêtre s'ouvre.
  const [depart] = useState(solde);
  const [pochette] = useState(mes.pochette);
  const prix = pochette.prix;
  const envoyer = async () => {
    // Dans le clic : sinon certains navigateurs gardent la scène muette.
    reveillerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await ouvrir(prix);
    const modele = issue.ok && issue.valeur.modele ? modeleParId(issue.valeur.modele.modele) : null;
    if (issue.ok && issue.valeur.remboursement) {
      setCarte(carteDUnRendu(issue.valeur.remboursement.rendu, issue.valeur.remboursement.pourcent));
      setTirage(issue.valeur);
      setEtape("ouvre");
    } else if (issue.ok && modele) {
      setCarte(carteDeRarete(modele.nom, modele.rarete, nuDe(modele.id), { cle: cleDuModele(modele.id), pose: "sol" }));
      setTirage(issue.valeur);
      setEtape("ouvre");
    } else {
      // Un modèle inconnu de ce code ne peut pas arriver ici (`lirePochetteModeles` l'écarte) : la page est à recharger.
      setRefus(issue.ok ? "Ce Gaulois unique n'existe pas. Rechargez la page." : issue.message);
      setEtape("confirmer");
    }
  };
  const recu = tirage?.modele ? modeleParId(tirage.modele.modele) : null;
  // Le Gaulois du membre dans son nouveau corps, pour la grande carte : calculé une fois.
  const apercuRecu = useMemo(() => (recu ? apercuDuModele(tenue, recu.id) : null), [tenue, recu]);
  const rendu = tirage?.remboursement ?? null;
  const sorti = recu !== null || rendu !== null;
  const ouverte = (etape === "ouvre" || etape === "revele") && sorti && carte !== null;
  const revele = etape === "revele";
  return (
    <FenetreDuBooster titre={ouverte && revele && rendu ? "Statères rendus" : ouverte && revele && recu ? "Nouveau Gaulois unique" : refus ? "Le booster reste fermé" : "Booster des Gaulois uniques"} etape={ouverte ? "ouvre" : "confirmer"} occupe={etape === "envoi" || etape === "ouvre"} scene={ouverte} onFermer={onFermer} testid="dialogue-modeles">
      {ouverte && tirage && carte && rendu ? (
        <OuvertureDuBooster
          sorte="modeles"
          carte={carte}
          revelee={revele}
          onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}
          carteFinale={<CarteDeStateres rang={0} gain={rendu.rendu} pourcent={rendu.pourcent} testid="uniques-rendu" />}
        >
          {/* Un remboursement : la carte dit ce qui revient et la part du prix ; dessous, la bourse. */}
          <span hidden data-pourcent={rendu.pourcent} />
          <div data-testid="uniques-rendu-solde">
            <ResteEnPixels solde={tirage.solde} />
          </div>
          <div class="bst-actions">
            <BoutonDesBoosters t="Fermer" or onClick={onFermer} testid="uniques-rendu-fermer" />
          </div>
        </OuvertureDuBooster>
      ) : ouverte && tirage && carte && recu ? (
        <OuvertureDuBooster
          sorte="modeles"
          carte={carte}
          revelee={revele}
          onRevelee={() => setEtape((e) => (e === "ouvre" ? "revele" : e))}
          carteFinale={
            <CarteDeSortie
              objet={{ nom: recu.nom, dessin: null, couleurs: {}, rarete: recu.rarete, gratuit: false }}
              rarete={recu.rarete}
              vignette={apercuRecu}
              fond={cleDuModele(recu.id)}
              pose="bas"
              sous={`Votre Gaulois en ${decrireLeModele(recu.id)}. ${recu.description}`}
              testid="uniques-tirage"
            />
          }
        >
          {/* La carte montre votre Gaulois dans son nouveau corps, son nom et sa rareté : dessous, la bourse et les boutons. */}
          <span hidden data-modele={recu.id} />
          <ResteEnPixels solde={tirage.solde} />
          <p class="bst-mot">{tirage.reste > 0 ? `Encore ${tirage.reste} à découvrir.` : "Vous les avez tous."}</p>
          <div class="bst-actions">
            <BoutonDesBoosters t="Le porter" or onClick={() => onPorter(recu.id)} testid="uniques-tirage-porter" />
            <BoutonDesBoosters t="Fermer" onClick={onFermer} testid="uniques-tirage-fermer" />
          </div>
        </OuvertureDuBooster>
      ) : (
        // Un booster qui peut rendre une part de son prix : ce qu'il restera est un minimum.
        <ConfirmerLeBooster sorte="modeles" prix={prix} solde={depart} auMoins={mes.pochette.remboursement > 0} refus={refus} envoi={etape === "envoi"} onOuvrir={() => void envoyer()} onFermer={onFermer} testid="uniques" />
      )}
    </FenetreDuBooster>
  );
}
