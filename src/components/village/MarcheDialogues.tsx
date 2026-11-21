import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fmtInt } from "../../lib/format";
import { EMPLACEMENTS_OBJETS, NOMS_EMPLACEMENTS, OBJETS, type Emplacement, type RareteDObjet } from "../../lib/gaulois";
import { objetsADemander } from "../../lib/village/boutique-jeu";
import { motsDeLaClasse, regleDeLaRevente, type MaRevente, type ObjetRevendable } from "../../lib/village/revente";
import { stateres } from "../../lib/village/ecran-boutique";
import { MARCHE_DUREE_JOURS } from "../../lib/village/contrat";
import { MESSAGES_DU_MARCHE, examinerAchat, lirePrix, raisonDeLOffre, seVend, type BoutiqueLue, type DemandeLisible, type ObjetDuMarche, type OffreLisible, type PossedeLisible } from "../../lib/village/ecran-marche";
import type { RefObjet } from "../../lib/village/contrat";
import { Problem } from "../compte/common";
import { CaseObjet, Prix } from "./MarcheCase";

/**
 * Une fenêtre du marché, par-dessus la page : le navigateur y garde le focus, Échap la ferme et le focus revient au bouton
 * qui l'a ouverte. Un clic sur le fond la ferme aussi.
 */
function Dialogue({ titre, achat = false, onFermer, children }: { titre: string; achat?: boolean; onFermer: () => void; children: ComponentChildren }) {
  const fenetre = useRef<HTMLDialogElement>(null);
  // Retirée de la page, la fenêtre se ferme pour rendre le focus ; le navigateur annonce cette fermeture un peu plus tard,
  // quand une autre fenêtre a pu s'ouvrir : cette annonce-là ne doit plus rien fermer.
  const retiree = useRef(false);
  useEffect(() => {
    const el = fenetre.current;
    if (el && !el.open) el.showModal();
    return () => {
      retiree.current = true;
      if (el?.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={fenetre}
      class={achat ? "marche-dialogue marche-dialogue-achat" : "marche-dialogue"}
      aria-labelledby="marche-dialogue-titre"
      data-testid="marche-dialogue"
      onClose={() => {
        if (!retiree.current) onFermer();
      }}
      onClick={(e) => {
        if (e.target === fenetre.current) onFermer();
      }}
    >
      <div class="marche-dialogue-corps">
        <h3 id="marche-dialogue-titre" class="marche-dialogue-titre">
          {titre}
        </h3>
        {children}
      </div>
    </dialog>
  );
}

/**
 * Avant d'acheter : l'objet, son prix, le solde et ce qu'il en restera. Si l'achat est voué au refus (solde trop court,
 * objet déjà possédé ou déjà mis en vente par soi), la fenêtre le dit et ne propose pas d'acheter ; le serveur revérifie
 * tout de toute façon. `miennes` : ses propres offres ouvertes, dont l'objet compte comme possédé.
 */
export function DialogueAchat({
  offre,
  solde,
  boutique,
  miennes,
  occupe,
  probleme,
  onAcheter,
  onFermer,
}: {
  offre: OffreLisible;
  solde: number;
  boutique: BoutiqueLue | null;
  miennes: readonly OffreLisible[];
  occupe: boolean;
  probleme: string | null;
  onAcheter: () => void;
  onFermer: () => void;
}) {
  const examen = examinerAchat(offre, solde, boutique?.inventaire ?? null, miennes);
  const empeche = raisonDeLOffre(offre, solde, boutique?.inventaire ?? null, miennes);
  return (
    <Dialogue titre={empeche || probleme ? "Achat impossible" : `Acheter ${offre.nom} ?`} achat onFermer={onFermer}>
      <div class="marche-dialogue-objet">
        <CaseObjet objet={offre} />
        {/* Les mêmes lignes qu'à la boutique. Après un refus du serveur, ces chiffres ne valent plus : le refus seul. */}
        {!probleme && (
          <dl class="marche-compte">
            <div>
              <dt>Prix</dt>
              <dd>
                <Prix valeur={offre.prix} />
              </dd>
            </div>
            <div>
              <dt>Votre bourse</dt>
              <dd>
                <Prix valeur={solde} />
              </dd>
            </div>
            {examen.refus === null && (
              <div class="marche-compte-reste" data-testid="marche-solde-apres">
                <dt>Il vous restera</dt>
                <dd>
                  <Prix valeur={examen.soldeApres} />
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {empeche && (
        <p class="form-problem" data-testid="marche-empeche">
          {empeche}
        </p>
      )}
      <Problem message={probleme} />
      <div class="marche-dialogue-actions">
        {/* Après un refus du serveur (offre partie entre-temps, solde changé), comme à la boutique : on ferme, sans racheter. */}
        {!empeche && !probleme && (
          <button type="button" class="btn btn-primary" disabled={occupe} onClick={onAcheter} data-testid="marche-confirmer">
            {occupe ? "Achat…" : "Acheter"}
          </button>
        )}
        <button type="button" class="btn btn-ghost" onClick={onFermer}>
          {empeche || probleme ? "Fermer" : "Annuler"}
        </button>
      </div>
    </Dialogue>
  );
}

/**
 * Vendre : choisir un objet de son inventaire, puis fixer un prix, de 1 statère au prix de la boutique. La règle des offres
 * (combien, combien de temps) est dite ici, une fois.
 */
export function DialogueVente({
  boutique,
  offresOuvertes,
  offresMax,
  occupe,
  probleme,
  initial = null,
  onVendre,
  onFermer,
}: {
  boutique: BoutiqueLue | null;
  offresOuvertes: number;
  offresMax: number;
  occupe: boolean;
  probleme: string | null;
  /** L'objet déjà choisi : un double qui sort d'une pochette (19 novembre 2026). */
  initial?: RefObjet | null;
  onVendre: (objet: PossedeLisible, prix: number) => void;
  onFermer: () => void;
}) {
  const choixDeDepart = initial && boutique ? (boutique.inventaire.find((o) => o.emplacement === initial.emplacement && o.objet === initial.objet && seVend(o)) ?? null) : null;
  const [choix, setChoix] = useState<PossedeLisible | null>(choixDeDepart);
  const [texte, setTexte] = useState(choixDeDepart && boutique ? String(boutique.prix[choixDeDepart.rarete]) : "");
  const [prixRefuse, setPrixRefuse] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const plafond = choix && boutique ? boutique.prix[choix.rarete] : 0;

  const choisir = (objet: PossedeLisible) => {
    setChoix(objet);
    setTexte(String(boutique?.prix[objet.rarete] ?? ""));
    setPrixRefuse(false);
  };
  // Le champ du prix paraît sous les objets : il prend le focus, pour un prix à taper tout de suite.
  useEffect(() => {
    if (choix) champ.current?.focus();
  }, [choix]);

  const plein = offresOuvertes >= offresMax;
  const vide = boutique !== null && boutique.inventaire.length === 0;
  return (
    <Dialogue titre="Vendre un objet" onFermer={onFermer}>
      <p class="marche-regle" data-testid="marche-regle">
        {fmtInt(offresMax)} offres au plus, {MARCHE_DUREE_JOURS} jours chacune. Un objet acheté au marché ne se remet pas en vente.
      </p>
      {boutique === null ? (
        <p class="form-problem" role="alert">
          Votre inventaire ne se lit pas pour l'instant. Réessayez dans un moment.
        </p>
      ) : plein ? (
        <p class="form-problem" data-testid="marche-plein">
          {MESSAGES_DU_MARCHE.trop_d_offres}
        </p>
      ) : vide ? (
        <p class="text-muted" data-testid="marche-inventaire-vide">
          Votre inventaire est vide.
        </p>
      ) : (
        <form
          class="marche-vente"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!choix) return;
            const prix = lirePrix(texte, plafond);
            setPrixRefuse(prix === null);
            if (prix !== null) onVendre(choix, prix);
          }}
        >
          <div class="marche-choix" role="group" aria-label="Votre inventaire">
            {boutique.inventaire.map((objet) =>
              seVend(objet) ? (
                <button key={`${objet.emplacement}-${objet.objet}`} type="button" class="marche-choix-case" aria-pressed={choix?.emplacement === objet.emplacement && choix.objet === objet.objet} onClick={() => choisir(objet)}>
                  <CaseObjet objet={objet} quantite={objet.quantite} />
                </button>
              ) : (
                // Son seul exemplaire vient du marché : il se voit, il ne se choisit pas.
                <span key={`${objet.emplacement}-${objet.objet}`} class="marche-choix-case marche-choix-ferme" data-testid="marche-du-marche">
                  <CaseObjet objet={objet} mention="Acheté au marché" />
                </span>
              ),
            )}
          </div>
          {choix && (
            <div class="marche-champ">
              <label for="marche-prix" class="nom-champ">
                Prix de « {choix.nom} », en statères
              </label>
              <input
                ref={champ}
                id="marche-prix"
                class="field mt-1 max-w-48"
                type="number"
                inputMode="numeric"
                min={1}
                max={plafond}
                step={1}
                required
                aria-describedby="marche-prix-aide"
                aria-invalid={prixRefuse}
                value={texte}
                onInput={(e) => {
                  setTexte(e.currentTarget.value);
                  setPrixRefuse(false);
                }}
                data-testid="marche-prix"
              />
              <p id="marche-prix-aide" class="info-discrete mt-1">
                De 1 à {fmtInt(plafond)}, son prix à la boutique.
              </p>
            </div>
          )}
          {prixRefuse && (
            <p class="form-problem" role="alert">
              {MESSAGES_DU_MARCHE.prix_invalide}
            </p>
          )}
          <Problem message={probleme} />
          <div class="marche-dialogue-actions">
            <button type="submit" class="btn btn-primary" disabled={occupe || !choix} data-testid="marche-mettre-en-vente">
              {occupe ? "Mise en vente…" : "Mettre en vente"}
            </button>
            <button type="button" class="btn btn-ghost" onClick={onFermer}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {(boutique === null || plein || vide) && (
        <div class="marche-dialogue-actions">
          <button type="button" class="btn btn-ghost" onClick={onFermer}>
            Fermer
          </button>
        </div>
      )}
    </Dialogue>
  );
}

/**
 * Revendre un objet au jeu (17 novembre 2026, demande du pilote) : la fenêtre montre ce qui peut partir, avec ce que le jeu
 * rend pour chacun, puis demande de confirmer. Le serveur a déjà dit ce qui se revend et combien (`get_ma_revente`) ;
 * l'écran ne calcule rien. La revente retire l'objet : le bouton qui la fait est à part, sous son avertissement.
 */
export function DialogueRevente({ revente, occupe, probleme, initial = null, onRevendre, onFermer }: { revente: MaRevente; occupe: boolean; probleme: string | null; initial?: RefObjet | null; onRevendre: (objet: ObjetRevendable, nom: string) => void; onFermer: () => void }) {
  const [choix, setChoix] = useState<ObjetRevendable | null>(() => (initial ? (revente.objets.find((o) => o.emplacement === initial.emplacement && o.objet === initial.objet) ?? null) : null));
  // L'objet choisi, tel que le serveur le donne maintenant : après une revente, la liste a changé.
  const choisi = choix ? (revente.objets.find((o) => o.emplacement === choix.emplacement && o.objet === choix.objet) ?? null) : null;
  const nomDe = (o: ObjetRevendable): string => OBJETS[o.emplacement][o.objet]?.nom ?? "";
  return (
    <Dialogue titre="Revendre au jeu" onFermer={onFermer}>
      <p class="marche-regle" data-testid="revente-regle">
        {regleDeLaRevente(revente.taux)}
      </p>
      {revente.objets.length === 0 ? (
        <p class="text-muted" data-testid="revente-rien">
          Rien dans votre inventaire ne se revend au jeu pour l'instant.
        </p>
      ) : (
        <div class="marche-choix" role="group" aria-label="Les objets qui se revendent">
          {revente.objets.map((objet) => {
            const fiche = OBJETS[objet.emplacement][objet.objet];
            const rarete = fiche?.rarete as Exclude<RareteDObjet, "divin" | "saison"> | null | undefined;
            if (!fiche || !rarete) return null;
            return (
              <button key={`${objet.emplacement}-${objet.objet}`} type="button" class="marche-choix-case" aria-pressed={choisi === objet} onClick={() => setChoix(objet)} data-testid="revente-objet">
                <CaseObjet objet={{ emplacement: objet.emplacement, objet: objet.objet, nom: fiche.nom, rarete }} quantite={objet.quantite} mention={`Rend ${fmtInt(objet.rendu)}`} />
              </button>
            );
          })}
        </div>
      )}
      {choisi && (
        <div class="revente-compte" data-testid="revente-compte">
          <p>
            Le jeu rend <strong class="tnum">{stateres(choisi.rendu)}</strong> pour « {nomDe(choisi)} ».
          </p>
          <p class="info-discrete">{motsDeLaClasse(choisi.classe, revente.taux)}</p>
        </div>
      )}
      <Problem message={probleme} />
      {choisi && (
        <div class="revente-envoi">
          <p class="revente-avis">L'objet quitte votre inventaire. Pour le ravoir, il faudra le racheter à son prix.</p>
          <button type="button" class="btn btn-secondary" disabled={occupe} onClick={() => onRevendre(choisi, nomDe(choisi))} data-testid="revente-confirmer">
            {occupe ? "Revente…" : `Revendre pour ${stateres(choisi.rendu)}`}
          </button>
        </div>
      )}
      <div class="marche-dialogue-actions">
        <button type="button" class="btn btn-ghost" onClick={onFermer} data-testid="revente-fermer">
          Fermer
        </button>
      </div>
    </Dialogue>
  );
}

/**
 * Demander un objet au marché (19 novembre 2026) : un prix, de 1 statère au prix de la boutique, et les statères mis de côté
 * tout de suite. Ils reviennent si la demande est retirée, si elle finit sans vendeur, ou si l'objet arrive par un autre
 * chemin. Le serveur revérifie tout (`poser_demande`).
 */
export function DialogueDemande({
  objet,
  plafond,
  solde,
  offre,
  demandesOuvertes,
  demandesMax,
  occupe,
  probleme,
  onDemander,
  onFermer,
}: {
  objet: ObjetDuMarche;
  plafond: number;
  solde: number;
  /** L'offre la moins chère d'un autre membre pour cet objet, s'il y en a une : on peut l'acheter tout de suite. */
  offre: OffreLisible | null;
  demandesOuvertes: number;
  demandesMax: number;
  occupe: boolean;
  probleme: string | null;
  onDemander: (prix: number) => void;
  onFermer: () => void;
}) {
  const [texte, setTexte] = useState(String(plafond));
  const [prixRefuse, setPrixRefuse] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    champ.current?.focus();
  }, []);
  const prix = lirePrix(texte, plafond);
  const plein = demandesOuvertes >= demandesMax;
  const manque = prix !== null && prix > solde ? prix - solde : 0;
  return (
    <Dialogue titre={`Demander « ${objet.nom} »`} onFermer={onFermer}>
      <p class="marche-regle" data-testid="demande-regle">
        Vos statères sont mis de côté. Un membre qui a l'objet peut vous le vendre à ce prix pendant {MARCHE_DUREE_JOURS} jours ; sinon, ou si vous retirez la demande, ils vous reviennent.
      </p>
      {plein ? (
        <p class="form-problem" data-testid="demande-plein">
          {MESSAGES_DU_MARCHE.trop_de_demandes}
        </p>
      ) : (
        <form
          class="marche-vente"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setPrixRefuse(prix === null);
            if (prix !== null && manque === 0) onDemander(prix);
          }}
        >
          <div class="marche-dialogue-objet">
            <CaseObjet objet={objet} />
            <dl class="marche-compte">
              {offre && (
                <div data-testid="demande-offre">
                  <dt>Déjà en vente au marché</dt>
                  <dd>
                    <Prix valeur={offre.prix} />
                  </dd>
                </div>
              )}
              <div>
                <dt>Votre bourse</dt>
                <dd>
                  <Prix valeur={solde} />
                </dd>
              </div>
            </dl>
          </div>
          <div class="marche-champ">
            <label for="demande-prix" class="nom-champ">
              Ce que vous payez pour « {objet.nom} », en statères
            </label>
            <input
              ref={champ}
              id="demande-prix"
              class="field mt-1 max-w-48"
              type="number"
              inputMode="numeric"
              min={1}
              max={plafond}
              step={1}
              required
              aria-describedby="demande-prix-aide"
              aria-invalid={prixRefuse || manque > 0}
              value={texte}
              onInput={(e) => {
                setTexte(e.currentTarget.value);
                setPrixRefuse(false);
              }}
              data-testid="demande-prix"
            />
            <p id="demande-prix-aide" class="info-discrete mt-1">
              De 1 à {fmtInt(plafond)}, son prix à la boutique.
            </p>
          </div>
          {prixRefuse && (
            <p class="form-problem" role="alert">
              {MESSAGES_DU_MARCHE.prix_invalide}
            </p>
          )}
          {manque > 0 && (
            <p class="form-problem" data-testid="demande-manque">
              Il vous manque {stateres(manque)}.
            </p>
          )}
          <Problem message={probleme} />
          <div class="marche-dialogue-actions">
            <button type="submit" class="btn btn-primary" disabled={occupe || manque > 0} data-testid="demande-confirmer">
              {occupe ? "Envoi…" : prix !== null ? `Mettre ${stateres(prix)} de côté` : "Demander"}
            </button>
            <button type="button" class="btn btn-ghost" onClick={onFermer}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {plein && (
        <div class="marche-dialogue-actions">
          <button type="button" class="btn btn-ghost" onClick={onFermer}>
            Fermer
          </button>
        </div>
      )}
    </Dialogue>
  );
}

/**
 * Vendre à une demande (19 novembre 2026) : l'objet, son prix (jamais le nom du membre), et ce que le jeu en rendrait, quand le
 * serveur le dit (`rendu`). L'objet quitte l'inventaire : le bouton qui vend est sous cet avertissement. Le serveur revérifie
 * tout (`servir_demande`).
 */
export function DialogueServir({ demande, rendu, occupe, probleme, onServir, onFermer }: { demande: DemandeLisible; rendu: number | null; occupe: boolean; probleme: string | null; onServir: () => void; onFermer: () => void }) {
  return (
    <Dialogue titre={probleme ? "Vente impossible" : `Vendre « ${demande.nom} » ?`} achat onFermer={onFermer}>
      <div class="marche-dialogue-objet">
        <CaseObjet objet={demande} />
        {!probleme && (
          <dl class="marche-compte">
            <div class="marche-compte-reste">
              <dt>Vous recevez</dt>
              <dd>
                <Prix valeur={demande.prix} />
              </dd>
            </div>
            {rendu !== null && (
              <div data-testid="servir-revente">
                <dt>Revendu au jeu</dt>
                <dd>
                  <Prix valeur={rendu} />
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <Problem message={probleme} />
      {!probleme && <p class="revente-avis">L'objet quitte votre inventaire.</p>}
      <div class="marche-dialogue-actions">
        {!probleme && (
          <button type="button" class="btn btn-primary" disabled={occupe} onClick={onServir} data-testid="servir-confirmer">
            {occupe ? "Vente…" : `Vendre pour ${stateres(demande.prix)}`}
          </button>
        )}
        <button type="button" class="btn btn-ghost" onClick={onFermer}>
          {probleme ? "Fermer" : "Annuler"}
        </button>
      </div>
    </Dialogue>
  );
}

/**
 * Demander un objet qu'on n'a pas (21 novembre 2026, bouton « Demander » du marché) : choisir un emplacement, puis l'objet
 * parmi ceux qui se demandent ; la fenêtre de la demande prend la suite, où se fixe le prix. Le serveur revérifie tout.
 */
export function DialogueChoixDemande({
  inventaire,
  miennes,
  mesDemandes,
  demandesMax,
  onChoisir,
  onFermer,
}: {
  inventaire: readonly RefObjet[] | null;
  miennes: readonly RefObjet[];
  mesDemandes: readonly RefObjet[];
  demandesMax: number;
  onChoisir: (objet: ObjetDuMarche) => void;
  onFermer: () => void;
}) {
  const [emplacement, setEmplacement] = useState<Emplacement>(EMPLACEMENTS_OBJETS[0]);
  const objets = useMemo(() => objetsADemander(emplacement, inventaire, miennes, mesDemandes), [emplacement, inventaire, miennes, mesDemandes]);
  const plein = mesDemandes.length >= demandesMax;
  return (
    <Dialogue titre="Demander un objet" onFermer={onFermer}>
      <p class="marche-regle" data-testid="choix-demande-regle">
        Choisissez l'objet que vous cherchez. Vous fixerez ensuite votre prix, mis de côté pendant {MARCHE_DUREE_JOURS} jours jusqu'à ce qu'un membre vous le vende.
      </p>
      {plein ? (
        <p class="form-problem" data-testid="demande-plein">
          {MESSAGES_DU_MARCHE.trop_de_demandes}
        </p>
      ) : (
        <>
          <div class="marche-emplacements" role="group" aria-label="L'emplacement de l'objet" data-testid="choix-demande-emplacements">
            {EMPLACEMENTS_OBJETS.map((e) => (
              <button key={e} type="button" class="chip" aria-pressed={e === emplacement} onClick={() => setEmplacement(e)}>
                {NOMS_EMPLACEMENTS[e]}
              </button>
            ))}
          </div>
          {objets.length > 0 ? (
            <div class="marche-choix" role="group" aria-label={`Les objets à demander : ${NOMS_EMPLACEMENTS[emplacement].toLowerCase()}`}>
              {objets.map((objet) => (
                <button key={objet.objet} type="button" class="marche-choix-case" onClick={() => onChoisir(objet)} data-testid="choix-demande-objet">
                  <CaseObjet objet={objet} />
                </button>
              ))}
            </div>
          ) : (
            <p class="text-muted" data-testid="choix-demande-vide">
              Tous ces objets sont déjà à vous, en vente ou demandés par vous.
            </p>
          )}
        </>
      )}
      <div class="marche-dialogue-actions">
        <button type="button" class="btn btn-ghost" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </Dialogue>
  );
}
