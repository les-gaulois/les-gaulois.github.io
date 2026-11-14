import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { fmtInt } from "../../lib/format";
import { MARCHE_DUREE_JOURS } from "../../lib/village/contrat";
import { MESSAGES_DU_MARCHE, enStateres, examinerAchat, lirePrix, seVend, type BoutiqueLue, type OffreLisible, type PossedeLisible } from "../../lib/village/ecran-marche";
import { Problem } from "../compte/common";
import { CaseObjet, Prix } from "./MarcheCase";

/**
 * Une fenêtre du marché, par-dessus la page : le navigateur y garde le focus, Échap la ferme et le focus revient au bouton
 * qui l'a ouverte. Un clic sur le fond la ferme aussi.
 */
function Dialogue({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ComponentChildren }) {
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
      class="marche-dialogue"
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
  const empeche =
    examen.refus === "deja_en_vente"
      ? "Vous avez déjà cet objet en vente."
      : examen.refus === "deja_possede"
        ? MESSAGES_DU_MARCHE.deja_possede
        : examen.refus === "solde_insuffisant"
          ? `Il vous manque ${enStateres(examen.manque)}.`
          : null;
  return (
    <Dialogue titre="Acheter cet objet" onFermer={onFermer}>
      <div class="marche-dialogue-objet">
        <CaseObjet objet={offre} />
        <dl class="marche-compte">
          <div>
            <dt>Vendu par</dt>
            <dd>{offre.vendeur}</dd>
          </div>
          <div>
            <dt>Prix</dt>
            <dd>
              <Prix valeur={offre.prix} />
            </dd>
          </div>
          <div>
            <dt>Votre solde</dt>
            <dd>
              <Prix valeur={solde} />
            </dd>
          </div>
          {examen.refus !== "solde_insuffisant" && (
            <div data-testid="marche-solde-apres">
              <dt>Solde après l'achat</dt>
              <dd>
                <Prix valeur={examen.soldeApres} />
              </dd>
            </div>
          )}
        </dl>
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
  onVendre,
  onFermer,
}: {
  boutique: BoutiqueLue | null;
  offresOuvertes: number;
  offresMax: number;
  occupe: boolean;
  probleme: string | null;
  onVendre: (objet: PossedeLisible, prix: number) => void;
  onFermer: () => void;
}) {
  const [choix, setChoix] = useState<PossedeLisible | null>(null);
  const [texte, setTexte] = useState("");
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
