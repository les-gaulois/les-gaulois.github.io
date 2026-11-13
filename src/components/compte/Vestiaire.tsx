import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import {
  EMPLACEMENTS,
  GAMMES,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  PEAUX,
  RETOUR_VILLAGE_KEY,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  cleTeinte,
  decrireGaulois,
  memeTenue,
  tenueAuHasard,
  tenueDuServeur,
  type Emplacement,
  type Tenue,
} from "../../lib/gaulois";
import { CodeLogin, DiscordButton, Loading, Problem, Success, codeLoginShown, messageOf, useMe } from "./common";

/** Le Gaulois dessiné case par case, agrandi sans flou par la feuille de style. Son texte de remplacement le décrit. */
export function ApercuGaulois({ tenue, class: classe = "" }: { tenue: Tenue; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const contexte = toile.current?.getContext("2d");
    if (!contexte) return;
    const image = contexte.createImageData(GAULOIS_LARGEUR, GAULOIS_HAUTEUR);
    casesDuGaulois(tenue).forEach((couleur, i) => {
      if (!couleur) return;
      image.data[i * 4] = parseInt(couleur.slice(1, 3), 16);
      image.data[i * 4 + 1] = parseInt(couleur.slice(3, 5), 16);
      image.data[i * 4 + 2] = parseInt(couleur.slice(5, 7), 16);
      image.data[i * 4 + 3] = 255;
    });
    contexte.putImageData(image, 0, 0);
  }, [tenue]);
  return <canvas ref={toile} width={GAULOIS_LARGEUR} height={GAULOIS_HAUTEUR} class={`gaulois-apercu ${classe}`} role="img" aria-label={decrireGaulois(tenue)} data-testid="gaulois-apercu" />;
}

/** Noté juste avant de partir vers Discord : la page de compte, où Discord ramène, renvoie alors au village. */
function noterLeRetour(): void {
  try {
    sessionStorage.setItem(RETOUR_VILLAGE_KEY, String(Date.now()));
  } catch {
    // Stockage refusé : la connexion se fait quand même, le joueur revient au village par le menu.
  }
}

/** Les choix d'un emplacement : un bouton par objet, puis une pastille par teinte si l'objet en a. */
function Emplacement({ emplacement, tenue, onChange }: { emplacement: Emplacement; tenue: Tenue; onChange: (tenue: Tenue) => void }) {
  const id = `vestiaire-${emplacement}`;
  const porte = OBJETS[emplacement][tenue[emplacement] ?? ""];
  const gamme = porte?.gamme ? GAMMES[porte.gamme] : null;
  const cle = cleTeinte(emplacement);
  // La peau se choisit comme une teinte : une pastille par couleur de peau.
  const peau = emplacement === "peau";
  return (
    <div class="vestiaire-emplacement" data-testid={id}>
      <p id={id} class="nom-champ text-sm font-semibold">
        {NOMS_EMPLACEMENTS[emplacement]}
      </p>
      {!peau && (
        <div class="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby={id}>
          {Object.entries(OBJETS[emplacement]).map(([objet, info]) => (
            <button key={objet} type="button" class="chip" aria-pressed={tenue[emplacement] === objet} onClick={() => onChange(changerObjet(tenue, emplacement, objet))}>
              {info.nom}
            </button>
          ))}
        </div>
      )}
      {(peau || gamme) && (
        <div class="mt-3 flex flex-wrap gap-3" role="group" aria-label={peau ? "Couleur de la peau" : emplacement === "cheveux" ? "Couleur des cheveux et de la barbe" : `Couleur : ${porte?.nom ?? ""}`}>
          {peau
            ? Object.entries(PEAUX).map(([objet, info]) => (
                <Pastille key={objet} nom={info.nom} couleur={info.couleurs.s} choisie={tenue["peau"] === objet} onClick={() => onChange(changerObjet(tenue, "peau", objet))} />
              ))
            : Object.entries(gamme ?? {}).map(([teinte, info]) => (
                <Pastille key={teinte} nom={info.nom} couleur={Object.values(info.couleurs)[0] ?? "#000000"} seconde={info.couleurs["q"]} choisie={tenue[cle] === teinte} onClick={() => onChange({ ...tenue, [cle]: teinte })} />
              ))}
        </div>
      )}
    </div>
  );
}

/** Une pastille de couleur, son nom à côté : la couleur n'est jamais le seul repère. Deux couleurs pour un motif. */
function Pastille({ nom, couleur, seconde, choisie, onClick }: { nom: string; couleur: string; seconde?: string | undefined; choisie: boolean; onClick: () => void }) {
  const fond = seconde ? `linear-gradient(135deg, ${couleur} 50%, ${seconde} 50%)` : couleur;
  return (
    <button type="button" class="vestiaire-teinte" aria-pressed={choisie} onClick={onClick}>
      <span class="vestiaire-teinte-rond" style={{ background: fond }} aria-hidden="true" />
      {nom}
    </button>
  );
}

type Etat = { kind: "lecture" } | { kind: "erreur"; message: string } | { kind: "pret"; enregistree: Tenue | null };

/**
 * Le vestiaire de `/village` : le visiteur voit le Gaulois de départ et la porte ; un compte lié à Discord habille le sien
 * et l'enregistre. Le serveur vérifie la tenue (`enregistrer_mon_gaulois`) : le site ne fait que la proposer.
 */
export default function Vestiaire() {
  const { me, refresh } = useMe();
  const [etat, setEtat] = useState<Etat>({ kind: "lecture" });
  const [tenue, setTenue] = useState<Tenue>(TENUE_DE_DEPART);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [reussite, setReussite] = useState<string | null>(null);

  const lire = async () => {
    setEtat({ kind: "lecture" });
    try {
      const enregistree = tenueDuServeur(await call<unknown>("get_mon_gaulois"));
      setEtat({ kind: "pret", enregistree });
      if (enregistree) setTenue(enregistree);
    } catch (e) {
      setEtat({ kind: "erreur", message: messageOf(e) });
    }
  };

  useEffect(() => {
    if (me?.signed_in) void lire();
  }, [me?.signed_in]);

  const changer = (suite: Tenue) => {
    setTenue(suite);
    setReussite(null);
    setProbleme(null);
  };

  const enregistrer = async () => {
    setOccupe(true);
    setProbleme(null);
    setReussite(null);
    try {
      const enregistree = tenueDuServeur(await call<unknown>("enregistrer_mon_gaulois", { p_tenue: tenue }));
      setEtat({ kind: "pret", enregistree });
      setReussite("Votre Gaulois est enregistré. Tapez /gaulois dans le Discord du clan pour le montrer.");
    } catch (e) {
      setProbleme(messageOf(e));
    } finally {
      setOccupe(false);
    }
  };

  if (me === null) return <Loading label="Lecture de votre compte…" />;

  if (!me.signed_in) {
    return (
      <div class="vestiaire" data-testid="vestiaire-porte">
        <ApercuGaulois tenue={TENUE_DE_DEPART} />
        <div class="vestiaire-porte">
          <p class="text-lg">Connectez-vous pour habiller votre Gaulois.</p>
          <div class="mt-5">
            <DiscordButton returnPath="/compte" avant={noterLeRetour} />
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
  return (
    <div class="vestiaire" data-testid="vestiaire">
      <div class="vestiaire-scene">
        <ApercuGaulois tenue={tenue} />
        <button type="button" class="btn btn-ghost" onClick={() => changer(tenueAuHasard(Math.random))}>
          Au hasard
        </button>
      </div>
      <form
        class="vestiaire-choix"
        onSubmit={(e) => {
          e.preventDefault();
          void enregistrer();
        }}
      >
        {EMPLACEMENTS.map((emplacement) => (
          <Emplacement key={emplacement} emplacement={emplacement} tenue={tenue} onChange={changer} />
        ))}
        <div class="vestiaire-envoi">
          <button type="submit" class="btn btn-primary btn-lg" disabled={occupe || !change} data-testid="vestiaire-enregistrer">
            {occupe ? "Enregistrement…" : etat.enregistree ? "Enregistrer ma tenue" : "Créer mon Gaulois"}
          </button>
          {change && etat.enregistree && (
            <button type="button" class="btn btn-ghost" onClick={() => changer(etat.enregistree ?? TENUE_DE_DEPART)}>
              Annuler les changements
            </button>
          )}
        </div>
        <Problem message={probleme} />
        <Success message={reussite} />
        {!etat.enregistree && !reussite && <p class="text-sm text-muted">Votre Gaulois n'existe qu'une fois enregistré.</p>}
      </form>
    </div>
  );
}
