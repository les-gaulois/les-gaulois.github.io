import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import {
  EMPLACEMENTS_VISAGE,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  PEAUX,
  POILS,
  RETOUR_VILLAGE_KEY,
  TEINTE_CHEVEUX,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  memeTenue,
  objetPorte,
  tenueAuHasard,
  tenueDuServeur,
  vignetteDeLObjet,
  type Emplacement,
  type EmplacementDuVisage,
  type Tenue,
  type Vignette,
} from "../../lib/gaulois";
import { EVENEMENT_ENREGISTRE } from "../../lib/compagnon/tenue";
import type { MesStateres } from "../../lib/stateres";
import type { MaBoutique, PlaqueVue } from "../../lib/village/contrat";
import { SOLDE_INCONNU, lireBoutique, lireStateres, motStatere, nombre, quantitePossedee, soldeAffiche } from "../../lib/village/ecran-boutique";
import { tailleDeLApercu } from "../../lib/village/ecran-familiers";
import { PLAQUES_CHANGEES } from "../../lib/village/ecran-forge";
import { familierDe } from "../../lib/village/familiers";
import { lirePlaques, plaqueDe } from "../../lib/village/forge";
import { NOMS_RAYONS, RAYONS, RAYON_CORPS, cadreDuVisage, grosPlan, rangerLeRayon, visageNu, type Rayon } from "../../lib/village/vestiaire-rayons";
import { MaBanniere } from "../village/Bannieres";
import { Piece } from "../village/BoutiquePixels";
import { ApercuGaulois, BarreDesRayons, Case, noterLeRetour, useSceneCollee } from "../village/Cases";
import { MonFamilier, useFamiliers } from "../village/Familiers";
import { CodeLogin, DiscordButton, Loading, Problem, Success, codeLoginShown, messageOf, useMe } from "./common";

/** Le cadre des gros plans du visage, calculé une fois d'après les dessins du catalogue. */
const CADRE_VISAGE = cadreDuVisage();

/** Le visage du Gaulois, pour les cases des cheveux et de la barbe : un carré de 40 cases pris dans le dessin entier. */
function portrait(tenue: Tenue, haut: number): Vignette {
  const cote = 40;
  const gauche = (GAULOIS_LARGEUR - cote) / 2;
  const entier = casesDuGaulois({ ...tenue, tete: "aucun", arme: "aucune" });
  const cases: (string | null)[] = [];
  for (let y = haut; y < haut + cote; y++) for (let x = gauche; x < gauche + cote; x++) cases.push(entier[y * GAULOIS_LARGEUR + x] ?? null);
  return { largeur: cote, hauteur: cote, cases };
}

/** Une pastille de couleur, son nom à côté : la couleur n'est jamais le seul repère. */
function Pastille({ nom, couleur, choisie, onClick }: { nom: string; couleur: string; choisie: boolean; onClick: () => void }) {
  return (
    <button type="button" class="vestiaire-teinte" aria-pressed={choisie} onClick={onClick}>
      <span class="vestiaire-teinte-rond" style={{ background: couleur }} aria-hidden="true" />
      {nom}
    </button>
  );
}

interface Choix {
  tenue: Tenue;
  /** L'inventaire du membre ; `null` tant que le serveur ne l'a pas donné : seuls les objets gratuits se montrent. */
  boutique: MaBoutique | null;
  /** Les plaques de la forge sur ses objets. */
  plaques: readonly PlaqueVue[];
  onChange: (tenue: Tenue) => void;
}

/** Le titre d'une partie du vestiaire et son contenu. */
function Partie({ emplacement, children }: { emplacement: Emplacement; children: ComponentChildren }) {
  return (
    <div class="vestiaire-emplacement" data-testid={`vestiaire-${emplacement}`}>
      <p id={`vestiaire-${emplacement}`} class="nom-champ vestiaire-titre">
        {NOMS_EMPLACEMENTS[emplacement]}
      </p>
      {children}
    </div>
  );
}

/** La peau : une pastille par couleur. */
function Peau({ tenue, onChange }: Choix) {
  return (
    <Partie emplacement="peau">
      <div class="vestiaire-pastilles" role="group" aria-labelledby="vestiaire-peau">
        {Object.entries(PEAUX).map(([id, peau]) => (
          <Pastille key={id} nom={peau.nom} couleur={peau.couleurs.s} choisie={tenue["peau"] === id} onClick={() => onChange(changerObjet(tenue, "peau", id))} />
        ))}
      </div>
    </Partie>
  );
}

/** Les cheveux ou la barbe : une case par coupe, avec le visage du Gaulois ; pour les cheveux, leur couleur dessous. */
function Poils({ emplacement, tenue, onChange }: Choix & { emplacement: "cheveux" | "barbe" }) {
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {Object.entries(OBJETS[emplacement]).map(([id, objet]) => (
          <Case key={id} objet={objet} vignette={portrait(changerObjet(tenue, emplacement, id), emplacement === "cheveux" ? 2 : 8)} portee={tenue[emplacement] === id} onClick={() => onChange(changerObjet(tenue, emplacement, id))} />
        ))}
      </div>
      {emplacement === "cheveux" && (
        <div class="vestiaire-pastilles" role="group" aria-label="Couleur des cheveux et de la barbe">
          {Object.entries(POILS).map(([id, poils]) => (
            <Pastille key={id} nom={poils.nom} couleur={poils.couleurs.h} choisie={tenue[TEINTE_CHEVEUX] === id} onClick={() => onChange({ ...tenue, [TEINTE_CHEVEUX]: id })} />
          ))}
        </div>
      )}
    </Partie>
  );
}

/**
 * Les yeux, la bouche ou la cicatrice : une case par modèle, avec un gros plan du visage du Gaulois, sans barbe ni coiffe,
 * pour voir le trait qu'on choisit. Gratuits, sans rareté.
 */
function Visage({ emplacement, tenue, onChange }: Choix & { emplacement: EmplacementDuVisage }) {
  const nu = visageNu(tenue);
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {Object.entries(OBJETS[emplacement]).map(([id, objet]) => (
          <Case key={id} objet={objet} vignette={grosPlan(casesDuGaulois(changerObjet(nu, emplacement, id)), CADRE_VISAGE)} visage portee={objetPorte(tenue, emplacement) === id} onClick={() => onChange(changerObjet(tenue, emplacement, id))} />
        ))}
      </div>
    </Partie>
  );
}

/**
 * Le rayon d'un emplacement : ce qui se porte, les objets gratuits et ceux que le membre possède. Ce qui reste à acheter
 * est à la boutique (l'onglet « La boutique » de `/village`), plus ici, depuis le 15 novembre 2026.
 */
function Objets({ emplacement, tenue, boutique, plaques, onChange }: Choix & { emplacement: Emplacement }) {
  const possede = (id: string): number => (boutique ? quantitePossedee(boutique.inventaire, emplacement, id) : 0);
  return (
    <div class="vestiaire-rayon" data-testid={`vestiaire-${emplacement}`}>
      {/* Le nom du rayon est écrit dans son onglet : ici, il ne sert qu'à nommer le groupe de cases. */}
      <p id={`vestiaire-${emplacement}`} class="sr-only">
        {NOMS_EMPLACEMENTS[emplacement]}
      </p>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {rangerLeRayon(OBJETS[emplacement], possede).aMoi.map(([id, objet]) => (
          <Case
            key={id}
            objet={objet}
            vignette={vignetteDeLObjet(emplacement, id, tenue)}
            portee={tenue[emplacement] === id}
            vente={objet.gratuit ? undefined : { possede: possede(id) }}
            plaque={plaqueDe(plaques, { emplacement, objet: id })}
            onClick={() => onChange(changerObjet(tenue, emplacement, id))}
          />
        ))}
      </div>
    </div>
  );
}

/** Le visage du Gaulois dans l'onglet du corps : avec sa barbe, sans coiffe ni arme. */
function visageDuRayon(tenue: Tenue): Vignette {
  return grosPlan(casesDuGaulois({ ...tenue, tete: "aucun", arme: "aucune" }), CADRE_VISAGE);
}

/**
 * La bourse en une ligne. Le détail de la bourse (d'où viennent les statères, les derniers reçus) est dans l'onglet « La
 * boutique », à côté ; le bouton « Aller à la boutique » est parti le 15 novembre 2026 avec la boutique en onglet (demande
 * du pilote). Un solde qui ne se sait pas encore ne s'écrit pas zéro.
 */
function LaBourse({ solde }: { solde: number | null }) {
  return (
    <p class="vestiaire-bourse" data-testid="vestiaire-bourse">
      <span class="vestiaire-bourse-solde">
        <span class="sr-only">Votre bourse : </span>
        <Piece />
        {solde === null ? (
          <span class="bourse-inconnu">{SOLDE_INCONNU}</span>
        ) : (
          <span>
            <strong class="tnum">{nombre(solde)}</strong> {motStatere(solde)}
          </span>
        )}
      </span>
    </p>
  );
}

type Etat = { kind: "lecture" } | { kind: "erreur"; message: string } | { kind: "pret"; enregistree: Tenue | null };

/**
 * « Mon Gaulois », sur `/village` : le visiteur voit le Gaulois de départ et la porte ; un compte lié à Discord habille le
 * sien avec ce qui est à lui, les objets gratuits et son inventaire. Le serveur décide de tout (tenue, inventaire) :
 * l'écran ne fait que proposer et montrer ce qu'il a reçu. Sans réponse de l'inventaire, le vestiaire reste, avec les
 * objets gratuits.
 *
 * Depuis le 14 novembre 2026, le vestiaire s'ouvre un rayon à la fois (`src/lib/village/vestiaire-rayons.ts`) : le corps
 * (peau, cheveux, barbe, et le visage au choix : yeux, bouche, cicatrice), puis la tête, le haut, le bas, les pieds et
 * l'arme. Depuis le 15 novembre 2026, les achats (la boutique de chaque rayon, la pochette surprise, le marché) et la
 * bourse détaillée sont dans l'onglet « La boutique » (`src/components/village/Boutique.tsx`), à côté de celui-ci :
 * ici, la bourse tient en une ligne.
 *
 * Le familier montré à côté du Gaulois (15 novembre 2026) se choisit au-dessus des rayons, parmi ceux qu'on a
 * (`MonFamilier` de `src/components/village/Familiers.tsx`) : le choix part tout de suite au serveur
 * (`choisir_familier`), sans passer par l'enregistrement de la tenue, qui ne change pas. Il ne s'annonce pas par
 * `gal:gaulois-enregistre` : cette annonce porte la tenue enregistrée, que le Gaulois compagnon garde, et le compagnon
 * n'a pas de familier.
 */
export default function Vestiaire({ actif }: { actif?: boolean } = {}) {
  const { me, refresh } = useMe();
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [tenue, setTenue] = useState<Tenue>(TENUE_DE_DEPART);
  const [bourse, setBourse] = useState<MesStateres | null>(null);
  const [boutique, setBoutique] = useState<MaBoutique | null>(null);
  const [plaques, setPlaques] = useState<PlaqueVue[]>([]);
  const [panne, setPanne] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);
  // Le rayon ouvert. Le corps d'abord : c'est par lui qu'on crée son Gaulois.
  const [rayon, setRayon] = useState<Rayon>(RAYON_CORPS);
  // Le Gaulois existait déjà à la dernière lecture : vrai ou faux jusqu'à la suivante, même une fois le Gaulois créé, pour
  // que rien ne change de place sous les yeux de qui vient le créer (ici comme à l'inscription, dans « Mon compte »).
  const [existait, setExistait] = useState(false);
  // Le familier montré : son choix a son propre envoi, ses propres mots.
  const familiers = useFamiliers();
  const [occupeFamilier, setOccupeFamilier] = useState(false);
  const [problemeFamilier, setProblemeFamilier] = useState<string | null>(null);
  const [annonceFamilier, setAnnonceFamilier] = useState<string | null>(null);

  /** L'inventaire (dans la réponse de la boutique) et l'état de la bourse, relus ensemble : sans eux, le vestiaire reste. */
  const lireLInventaire = async (): Promise<void> => {
    const [b, s] = await Promise.all([call<unknown>("get_ma_boutique").then(lireBoutique, () => null), call<unknown>("get_mes_stateres").then(lireStateres, () => null)]);
    setBoutique(b);
    setBourse(s);
    setPanne(!b);
  };

  const lire = async () => {
    setEtat({ kind: "lecture" });
    try {
      const [reponse] = await Promise.all([call<unknown>("get_mon_gaulois"), lireLInventaire(), familiers.lire()]);
      const enregistree = tenueDuServeur(reponse);
      setEtat({ kind: "pret", enregistree });
      setPlaques(lirePlaques((reponse as { gravures?: unknown } | null)?.gravures));
      setExistait(enregistree !== null);
      if (enregistree) setTenue(enregistree);
    } catch (e) {
      setEtat({ kind: "erreur", message: messageOf(e) });
    }
  };

  useEffect(() => {
    if (me?.signed_in) void lire();
  }, [me?.signed_in]);

  // De retour sur « Mon Gaulois » après la forge : la bourse a pu changer. Relecture discrète, sans rien effacer de
  // l'écran ni de la tenue en cours.
  const avant = useRef(actif);
  useEffect(() => {
    const revenu = actif === true && avant.current === false;
    avant.current = actif;
    if (revenu && etat.kind === "pret") void lireLInventaire();
  }, [actif]);

  // « Le porter », dans l'onglet « La boutique » voisin, enregistre une tenue et l'annonce : le vestiaire la prend,
  // sinon il montrerait l'ancienne, et son « Enregistrer » retirerait l'objet tout juste porté. Sa propre annonce lui
  // revient aussi : c'est la tenue qu'il vient d'enregistrer, rien ne change.
  useEffect(() => {
    const prendre = (e: Event) => {
      const enregistree = tenueDuServeur((e as CustomEvent<unknown>).detail);
      if (!enregistree) return;
      setTenue(enregistree);
      setEtat((x) => (x.kind === "pret" ? { kind: "pret", enregistree } : x));
    };
    window.addEventListener(EVENEMENT_ENREGISTRE, prendre);
    return () => window.removeEventListener(EVENEMENT_ENREGISTRE, prendre);
  }, []);

  // Une plaque gravée ou effacée à la forge (l'onglet voisin) : les plaques du vestiaire se relisent, sans rien
  // toucher à la tenue en cours. Une relecture qui échoue garde celles qu'on avait.
  useEffect(() => {
    const relire = () => {
      void call<unknown>("get_mon_gaulois").then(
        (reponse) => setPlaques(lirePlaques((reponse as { gravures?: unknown } | null)?.gravures)),
        () => {},
      );
    };
    window.addEventListener(PLAQUES_CHANGEES, relire);
    return () => window.removeEventListener(PLAQUES_CHANGEES, relire);
  }, []);

  const changer = (suite: Tenue) => {
    setTenue(suite);
    setReussite(null);
    setProbleme(null);
  };

  const enregistrer = async () => {
    const premiereFois = etat.kind === "pret" && !etat.enregistree;
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    try {
      const enregistree = tenueDuServeur(await call<unknown>("enregistrer_mon_gaulois", { p_tenue: tenue }));
      setEtat({ kind: "pret", enregistree });
      // Le script du Gaulois compagnon (src/scripts/compagnon.ts), absent du village, garde la tenue annoncée par
      // « gal:gaulois-enregistre » pour les pages suivantes.
      if (enregistree) window.dispatchEvent(new CustomEvent("gal:gaulois-enregistre", { detail: { tenue: enregistree } }));
      setReussite("Votre Gaulois est enregistré. Tapez /gaulois dans le Discord du clan pour le montrer.");
      // Un Gaulois tout juste créé reçoit ses statères du mois : on relit.
      if (premiereFois) await lireLInventaire();
    } catch (e) {
      setProbleme(messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  const choisirLeFamilier = async (id: string | null) => {
    setOccupeFamilier(true);
    setProblemeFamilier(null);
    setAnnonceFamilier(null);
    const issue = await familiers.choisir(id);
    if (issue.ok) setAnnonceFamilier(issue.valeur ? `« ${familierDe(issue.valeur)?.nom ?? "Ce familier"} » se tient à côté de votre Gaulois.` : "Votre Gaulois ne montre plus de familier.");
    else setProblemeFamilier(issue.message);
    setOccupeFamilier(false);
  };

  const { racine, scene, barre, panneau } = useSceneCollee(rayon, etat.kind);

  if (me === null) return <Loading label="Lecture de votre compte…" />;

  if (!me.signed_in) {
    return (
      <div class="vestiaire" data-testid="vestiaire-porte">
        <div class="vestiaire-scene">
          <ApercuGaulois tenue={TENUE_DE_DEPART} />
        </div>
        <div class="vestiaire-porte">
          <p class="text-lg">Connectez-vous pour habiller votre Gaulois.</p>
          <div class="mt-5">
            <DiscordButton returnPath="/compte" avant={() => noterLeRetour(RETOUR_VILLAGE_KEY)} />
          </div>
          {codeLoginShown() && (
            <div class="mt-6">
              <CodeLogin connecte={() => void refresh()} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (etat.kind === "lecture") return <Loading label="Lecture de votre Gaulois…" />;
  if (etat.kind === "erreur") return <Problem message={etat.message} onRetry={() => void lire()} />;

  const change = !memeTenue(tenue, etat.enregistree);
  const choix: Choix = { tenue, boutique, plaques, onChange: changer };
  return (
    <div ref={racine} class="vestiaire" data-testid="vestiaire">
      <div ref={scene} class="vestiaire-scene" data-familier={tailleDeLApercu(familiers.montre) ?? undefined}>
        <ApercuGaulois tenue={tenue} familier={familiers.montre} />
        <div class="vestiaire-scene-actions">
          <button type="button" class="btn btn-ghost" onClick={() => changer(tenueAuHasard(Math.random))}>
            Au hasard
          </button>
        </div>
      </div>
      <div class="vestiaire-colonne">
        {/* La bourse et la boutique ne servent qu'une fois le Gaulois créé : la ligne ne paraît que pour un Gaulois qui
            existait déjà à la lecture, jamais sous les yeux de qui vient de le créer. */}
        {existait && boutique && <LaBourse solde={soldeAffiche(boutique.solde, bourse)} />}
        {/* Sans réponse de l'inventaire, le vestiaire marche quand même : un compte qui crée son Gaulois ne voit rien de plus. */}
        {panne && existait && (
          <div data-testid="vestiaire-panne">
            <Problem message="Votre inventaire ne répond pas pour l'instant : seuls les objets gratuits se montrent." onRetry={() => void lireLInventaire()} />
          </div>
        )}
        {/* Le familier ne se montre qu'à côté d'un Gaulois qui existe : rien pendant l'inscription. */}
        {existait && <MonFamilier etat={familiers.etat} occupe={occupeFamilier} probleme={problemeFamilier} annonce={annonceFamilier} onChoisir={(id) => void choisirLeFamilier(id)} onRelire={() => void familiers.lire()} />}
        {/* La bannière montrée sur /gaulois, comme le familier : pour un Gaulois qui existe. */}
        {existait && <MaBanniere actif={actif} />}
        <form
          class="vestiaire-choix"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <div ref={barre} class="vestiaire-barre">
            <BarreDesRayons
              prefixe="vestiaire"
              label="Les rayons du vestiaire"
              rayons={RAYONS}
              noms={NOMS_RAYONS}
              rayon={rayon}
              vignette={(id) => (id === RAYON_CORPS ? visageDuRayon(tenue) : vignetteDeLObjet(id, tenue[id] ?? "", tenue))}
              onChoisir={setRayon}
            />
          </div>
          <div ref={panneau} id="vestiaire-panneau" class="vestiaire-panneau" role="tabpanel" aria-labelledby={`vestiaire-rayon-${rayon}`}>
            {rayon === RAYON_CORPS ? (
              <>
                <Peau {...choix} />
                <Poils emplacement="cheveux" {...choix} />
                <Poils emplacement="barbe" {...choix} />
                {EMPLACEMENTS_VISAGE.map((emplacement) => (
                  <Visage key={emplacement} emplacement={emplacement} {...choix} />
                ))}
              </>
            ) : (
              <Objets key={rayon} emplacement={rayon} {...choix} />
            )}
          </div>
          <div class="vestiaire-envoi" data-colle={change ? "" : undefined}>
            <div class="vestiaire-envoi-boutons">
              <button type="submit" class="btn btn-primary btn-lg" disabled={occupe || !change} data-testid="vestiaire-enregistrer">
                {occupe ? "Enregistrement…" : etat.enregistree ? "Enregistrer ma tenue" : "Créer mon Gaulois"}
              </button>
              {change && etat.enregistree && (
                <button type="button" class="btn btn-ghost" onClick={() => changer(etat.enregistree ?? TENUE_DE_DEPART)}>
                  Annuler
                </button>
              )}
            </div>
            <Problem message={probleme} />
            <Success message={reussite} />
            {!etat.enregistree && !reussite && <p class="text-sm text-muted">Votre Gaulois n'existe qu'une fois enregistré.</p>}
          </div>
        </form>
      </div>
    </div>
  );
}
