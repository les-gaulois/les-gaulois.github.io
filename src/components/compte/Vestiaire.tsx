import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import {
  EMPLACEMENTS_OBJETS,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  NOMS_EMPLACEMENTS,
  OBJETS,
  PEAUX,
  POILS,
  RARETES,
  RETOUR_VILLAGE_KEY,
  TEINTE_CHEVEUX,
  TENUE_DE_DEPART,
  casesDuGaulois,
  changerObjet,
  decrireGaulois,
  memeTenue,
  tenueAuHasard,
  tenueDuServeur,
  tenueGratuite,
  vignetteDeLObjet,
  type Emplacement,
  type Objet,
  type Tenue,
  type Vignette,
} from "../../lib/gaulois";
import { CodeLogin, DiscordButton, Loading, Problem, Success, codeLoginShown, messageOf, useMe } from "./common";

/** Des cases de couleur peintes telles quelles dans une toile, que la feuille de style agrandit sans flou. */
function peindre(toile: HTMLCanvasElement | null, largeur: number, hauteur: number, cases: readonly (string | null)[]): void {
  const contexte = toile?.getContext("2d");
  if (!contexte) return;
  const image = contexte.createImageData(largeur, hauteur);
  cases.forEach((couleur, i) => {
    if (!couleur) return;
    image.data[i * 4] = parseInt(couleur.slice(1, 3), 16);
    image.data[i * 4 + 1] = parseInt(couleur.slice(3, 5), 16);
    image.data[i * 4 + 2] = parseInt(couleur.slice(5, 7), 16);
    image.data[i * 4 + 3] = 255;
  });
  contexte.putImageData(image, 0, 0);
}

/** Le Gaulois dessiné case par case, agrandi sans flou par la feuille de style. Son texte de remplacement le décrit. */
export function ApercuGaulois({ tenue, class: classe = "" }: { tenue: Tenue; class?: string }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, GAULOIS_LARGEUR, GAULOIS_HAUTEUR, casesDuGaulois(tenue)), [tenue]);
  return <canvas ref={toile} width={GAULOIS_LARGEUR} height={GAULOIS_HAUTEUR} class={`gaulois-apercu ${classe}`} role="img" aria-label={decrireGaulois(tenue)} data-testid="gaulois-apercu" />;
}

/** Le côté, en pixels, de la place réservée à l'image dans une case : la vignette s'y agrandit d'un nombre entier de fois. */
const COTE_IMAGE = 80;

/** L'image d'une case : décorative, le nom de la case est écrit dessous. Une case du dessin vaut 1, 2 ou 3 pixels. */
function ImageDeCase({ vignette }: { vignette: Vignette }) {
  const toile = useRef<HTMLCanvasElement>(null);
  useEffect(() => peindre(toile.current, vignette.largeur, vignette.hauteur, vignette.cases), [vignette]);
  const echelle = Math.max(1, Math.min(3, Math.floor(COTE_IMAGE / Math.max(vignette.largeur, vignette.hauteur))));
  return <canvas ref={toile} width={vignette.largeur} height={vignette.hauteur} class="case-dessin" style={{ width: `${vignette.largeur * echelle}px`, height: `${vignette.hauteur * echelle}px` }} aria-hidden="true" />;
}

/** Le visage du Gaulois, pour les cases des cheveux et de la barbe : un carré de 40 cases pris dans le dessin entier. */
function portrait(tenue: Tenue, haut: number): Vignette {
  const cote = 40;
  const gauche = (GAULOIS_LARGEUR - cote) / 2;
  const entier = casesDuGaulois({ ...tenue, tete: "aucun", arme: "aucune" });
  const cases: (string | null)[] = [];
  for (let y = haut; y < haut + cote; y++) for (let x = gauche; x < gauche + cote; x++) cases.push(entier[y * GAULOIS_LARGEUR + x] ?? null);
  return { largeur: cote, hauteur: cote, cases };
}

/** Noté juste avant de partir vers Discord : la page de compte, où Discord ramène, renvoie alors au village. */
function noterLeRetour(): void {
  try {
    sessionStorage.setItem(RETOUR_VILLAGE_KEY, String(Date.now()));
  } catch {
    // Stockage refusé : la connexion se fait quand même, le joueur revient au village par le menu.
  }
}

/** Le cadenas d'une case de la boutique. */
function Cadenas() {
  return (
    <svg class="case-cadenas" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 5V3.5a3 3 0 0 1 6 0V5h1v6H2V5zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0z" fill="currentColor" />
    </svg>
  );
}

/**
 * Une case : l'image de l'objet, son nom, sa rareté écrite et comptée en losanges (la couleur du cadre n'est jamais le seul
 * repère). Une case de la boutique porte un cadenas : elle s'essaie sur le Gaulois, elle ne se porte pas.
 */
function Case({ objet, vignette, etat, onClick }: { objet: Objet; vignette: Vignette | null; etat: "libre" | "portee" | "essayee"; onClick: () => void }) {
  const rarete = objet.rarete ? RARETES[objet.rarete] : null;
  return (
    <button type="button" class="case" data-rarete={objet.rarete ?? "aucune"} data-boutique={objet.gratuit ? undefined : ""} data-etat={etat} aria-pressed={etat !== "libre"} onClick={onClick}>
      <span class="case-image">{vignette ? <ImageDeCase vignette={vignette} /> : <span class="case-rien" aria-hidden="true" />}</span>
      <span class="case-nom">{objet.nom}</span>
      {rarete && (
        <span class="case-rarete">
          <span class="case-rang" aria-hidden="true">
            {Array.from({ length: rarete.rang }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          {rarete.nom}
        </span>
      )}
      {!objet.gratuit && (
        <>
          <Cadenas />
          <span class="sr-only">, à la boutique, à essayer</span>
        </>
      )}
    </button>
  );
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

/** Un objet essayé : il se voit sur le Gaulois, il n'entre pas dans la tenue. */
interface Essai {
  emplacement: Emplacement;
  id: string;
}

interface Choix {
  tenue: Tenue;
  essai: Essai | null;
  onChange: (tenue: Tenue) => void;
  onEssai: (essai: Essai | null) => void;
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
          <Case key={id} objet={objet} vignette={portrait(changerObjet(tenue, emplacement, id), emplacement === "cheveux" ? 2 : 8)} etat={tenue[emplacement] === id ? "portee" : "libre"} onClick={() => onChange(changerObjet(tenue, emplacement, id))} />
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

/** Les objets d'un emplacement : ceux qui se portent, puis ceux de la boutique, de la rareté la plus courante à la plus rare. */
function Objets({ emplacement, tenue, essai, onChange, onEssai }: Choix & { emplacement: Emplacement }) {
  const objets = Object.entries(OBJETS[emplacement]);
  const essaye = essai?.emplacement === emplacement ? essai.id : null;
  const cases = (liste: [string, Objet][]) =>
    liste.map(([id, objet]) => {
      const porte = tenue[emplacement] === id;
      return (
        <Case
          key={id}
          objet={objet}
          vignette={vignetteDeLObjet(emplacement, id, tenue)}
          etat={essaye === id ? "essayee" : porte && !essaye ? "portee" : "libre"}
          onClick={() => {
            if (objet.gratuit) onChange(changerObjet(tenue, emplacement, id));
            else if (!porte) onEssai(essaye === id ? null : { emplacement, id });
          }}
        />
      );
    });
  const boutique = objets.filter(([, objet]) => !objet.gratuit);
  return (
    <Partie emplacement={emplacement}>
      <div class="cases" role="group" aria-labelledby={`vestiaire-${emplacement}`}>
        {cases(objets.filter(([, objet]) => objet.gratuit))}
      </div>
      {boutique.length > 0 && (
        <>
          <p id={`boutique-${emplacement}`} class="vestiaire-boutique">
            <Cadenas />
            Boutique
          </p>
          <div class="cases" role="group" aria-label={`${NOMS_EMPLACEMENTS[emplacement]}, à la boutique`}>
            {cases(boutique)}
          </div>
        </>
      )}
    </Partie>
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
  const [essai, setEssai] = useState<Essai | null>(null);
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
    setEssai(null);
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
        <div class="vestiaire-scene">
          <ApercuGaulois tenue={TENUE_DE_DEPART} />
        </div>
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
  const essaye = essai ? OBJETS[essai.emplacement][essai.id] : undefined;
  const choix: Choix = { tenue, essai, onChange: changer, onEssai: setEssai };
  return (
    <div class="vestiaire" data-testid="vestiaire">
      <div class="vestiaire-scene">
        <ApercuGaulois tenue={essai ? changerObjet(tenue, essai.emplacement, essai.id) : tenue} />
        <div class="vestiaire-scene-actions">
          <button type="button" class="btn btn-ghost" onClick={() => changer(tenueAuHasard(Math.random))}>
            Au hasard
          </button>
          <p class="vestiaire-essai" role="status" data-testid="vestiaire-essai">
            {essaye && (
              <>
                <span>
                  Essayage : <strong>{essaye.nom}</strong>
                </span>
                <button type="button" class="chip" onClick={() => setEssai(null)}>
                  Retirer
                </button>
              </>
            )}
          </p>
        </div>
      </div>
      <form
        class="vestiaire-choix"
        onSubmit={(e) => {
          e.preventDefault();
          void enregistrer();
        }}
      >
        <Peau {...choix} />
        <Poils emplacement="cheveux" {...choix} />
        <Poils emplacement="barbe" {...choix} />
        {EMPLACEMENTS_OBJETS.map((emplacement) => (
          <Objets key={emplacement} emplacement={emplacement} {...choix} />
        ))}
        <div class="vestiaire-envoi">
          <button type="submit" class="btn btn-primary btn-lg" disabled={occupe || !change || !tenueGratuite(tenue)} data-testid="vestiaire-enregistrer">
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
