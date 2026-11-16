import { useEffect, useRef, useState } from "preact/hooks";
import { ServerError, basePath, call } from "../../lib/compte/api";
import { errorMessage } from "../../lib/compte/errors";
import { ORDRE_RARETES, RARETES, vignetteDeLObjet, type Rarete } from "../../lib/gaulois";
import { ADRESSE_BOUTIQUE } from "../../lib/village/boutique-rayons";
import type { FusionDeLaForge, FusionReponse, MaForge, ObjetAFondre } from "../../lib/village/contrat";
import { exemplaires } from "../../lib/village/ecran-boutique";
import { cleDeLObjet, nomDeLObjet } from "../../lib/village/ecran-forge";
import { lireFusionReponse } from "../../lib/village/forge";
import {
  RARETES_A_FONDRE,
  creusetAJour,
  creusetPlein,
  dansLeCreuset,
  demandeDeFusion,
  libresParRarete,
  messageDeLaFusion,
  objetsDeLaRarete,
  poser,
  rareteDeDepart,
  rareteDuCreuset,
  rareteSuivante,
  regleDeLaRarete,
  reprendre,
  resteAPoser,
  type Creuset,
} from "../../lib/village/fusion";
import { echelleEntiere } from "../../lib/village/vestiaire-rayons";
import { Dialogue, type Issue } from "./BoutiqueDialogue";
import { MarqueDeRarete, Pixels } from "./BoutiquePixels";
import { Moule, type DessinDuMoule } from "./Moule";
import { BoutonSon, preparerLeSon, useSonDuTambour } from "./Tambour";

/**
 * La fusion, première partie de l'onglet « La forge » (demande du pilote, 16 novembre 2026) : le membre choisit une rareté,
 * pose trois de ses objets dans le creuset, confirme, et reçoit un objet de la rareté suivante. Le serveur décide de tout
 * (`fusionner_objets`) : ce qui peut se fondre, le nombre d'objets et l'objet reçu viennent de lui. Le moule (`Moule.tsx`,
 * choix du pilote parmi dix animations d'essai) ne fait que montrer ce qu'il a déjà tiré : son creux a la forme de l'objet
 * reçu. Il ne s'anime pas quand les animations sont coupées.
 */

const ILLISIBLE = "La réponse du serveur est illisible. Rechargez la page.";

/** Le dessin d'un objet, à la taille d'une case. */
function Dessin({ objet, place = 80 }: { objet: ObjetAFondre; place?: number }) {
  const vignette = vignetteDeLObjet(objet.emplacement, objet.objet);
  return vignette ? <Pixels largeur={vignette.largeur} hauteur={vignette.hauteur} cases={vignette.cases} echelle={echelleEntiere(vignette.largeur, vignette.hauteur, place, 3)} class="case-dessin" /> : null;
}

/** Les losanges d'un rang de rareté, comme sur les puces de la boutique. */
function Losanges({ rang }: { rang: number }) {
  return (
    <span class="filtre-rang" aria-hidden="true">
      {Array.from({ length: rang }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/**
 * La confirmation, puis le résultat : un vrai `<dialog>` modal. Fondre ne se rattrape pas : la fenêtre nomme ce qui part
 * avant de demander au serveur. Après un refus, il ne reste que ses mots et « Fermer ».
 */
function DialogueFusion({ creuset, suivante, fondre, onFermer }: { creuset: Creuset; suivante: Rarete; fondre: () => Promise<Issue<FusionReponse>>; onFermer: () => void }) {
  const [etape, setEtape] = useState<"confirmer" | "envoi" | "tourne" | "revele">("confirmer");
  const [refus, setRefus] = useState<string | null>(null);
  const [recu, setRecu] = useState<FusionReponse["recu"] | null>(null);
  const [moule, setMoule] = useState<DessinDuMoule | null>(null);
  const [passer, setPasser] = useState(false);
  const [son, basculerSon] = useSonDuTambour();
  // Ce que la fenêtre montre est ce qu'elle a vu en s'ouvrant : le creuset se vide derrière elle après la fusion.
  const [donnes] = useState(creuset);
  const envoyer = async () => {
    if (son) preparerLeSon();
    setEtape("envoi");
    setRefus(null);
    const issue = await fondre();
    if (issue.ok) {
      const tire = issue.valeur.recu;
      const vignette = vignetteDeLObjet(tire.emplacement, tire.objet);
      setRecu(tire);
      // Le creux du moule est le dessin de l'objet reçu. Sans dessin, pas de moule : le résultat s'écrit tout de suite.
      setMoule(vignette);
      setEtape(vignette ? "tourne" : "revele");
    } else {
      setRefus(issue.message);
      setEtape("confirmer");
    }
  };
  const ouverte = (etape === "tourne" || etape === "revele") && recu !== null;
  const titre = ouverte ? (etape === "revele" ? "Sorti de la forge" : "Le métal coule…") : refus ? "Fusion impossible" : `Fondre ces ${donnes.length} objets ?`;
  return (
    <Dialogue titre={titre} etape={ouverte ? etape : "confirmer"} occupe={etape === "envoi" || etape === "tourne"} onFermer={onFermer} testid="dialogue-fusion">
      {ouverte && recu ? (
        <>
          {moule && <Moule dessin={moule} depuis={donnes[0]?.rarete ?? recu.rarete} vers={recu.rarete} passer={passer} son={son} onArrive={() => setEtape((e) => (e === "tourne" ? "revele" : e))} />}
          {etape === "tourne" ? (
            <div class="boutique-dialogue-actions">
              <button
                type="button"
                class="btn btn-ghost"
                onClick={() => {
                  setPasser(true);
                  setEtape("revele");
                }}
                data-testid="fusion-passer"
              >
                Passer
              </button>
              <BoutonSon son={son} onBasculer={basculerSon} testid="fusion-son" />
            </div>
          ) : (
            <>
              <div class="tambour-sortie" data-rarete={recu.rarete} data-testid="fusion-recu" data-objet={cleDeLObjet(recu)}>
                <p class="tambour-nom">{nomDeLObjet(recu)}</p>
                <MarqueDeRarete rarete={recu.rarete} />
              </div>
              {recu.double && (
                <p class="boutique-dialogue-texte" data-testid="fusion-double">
                  Vous l'aviez déjà : ce double se fond à son tour, ou se vend au marché.
                </p>
              )}
              <div class="boutique-dialogue-actions">
                <button type="button" class="btn btn-primary" onClick={onFermer} data-testid="fusion-fermer">
                  Fermer
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {!refus && (
            <>
              <ul class="fusion-donnes" data-testid="fusion-donnes">
                {donnes.map((objet, i) => (
                  <li key={i} class="case fusion-donne" data-rarete={objet.rarete}>
                    <span class="case-image">
                      <Dessin objet={objet} place={64} />
                    </span>
                    <span class="case-nom">{nomDeLObjet(objet)}</span>
                  </li>
                ))}
              </ul>
              <p class="boutique-dialogue-texte">
                Ils sont fondus pour de bon. Vous recevez un objet <strong>{RARETES[suivante].nom}</strong>, tiré au hasard.
              </p>
            </>
          )}
          {refus && (
            <p class="form-problem" role="alert" data-testid="fusion-refus">
              {refus}
            </p>
          )}
          <div class="boutique-dialogue-actions">
            {!refus && (
              <button type="button" class="btn btn-primary" disabled={etape === "envoi"} onClick={() => void envoyer()} data-testid="fusion-confirmer">
                {etape === "envoi" ? "Fusion…" : "Fondre"}
              </button>
            )}
            <button type="button" class="btn btn-ghost" disabled={etape === "envoi"} onClick={onFermer} data-testid="fusion-annuler">
              {refus ? "Fermer" : "Annuler"}
            </button>
          </div>
        </>
      )}
    </Dialogue>
  );
}

/** L'atelier de fusion : les raretés, le creuset, puis les objets de la rareté choisie. */
export function Fusion({ fusion, onForge, onRelire }: { fusion: FusionDeLaForge; onForge: (forge: MaForge) => void; onRelire: () => Promise<void> }) {
  const [choisie, setChoisie] = useState<Rarete | null>(null);
  const [creuset, setCreuset] = useState<Creuset>([]);
  const [dialogue, setDialogue] = useState<Creuset | null>(null);
  const [annonce, setAnnonce] = useState("");

  const bouton = useRef<HTMLButtonElement>(null);
  // Le creuset vient de se remplir : les cases s'éteignent, le focus va au bouton plutôt que de se perdre.
  const rempli = creuset.length >= fusion.nombre;
  useEffect(() => {
    if (rempli && (document.activeElement === document.body || (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled))) bouton.current?.focus({ preventScroll: true });
  }, [rempli]);

  // La forge vient d'être relue : ce qui est posé doit encore valoir.
  useEffect(() => setCreuset((actuel) => creusetAJour(actuel, fusion)), [fusion]);

  const rarete = choisie ?? rareteDuCreuset(creuset) ?? rareteDeDepart(fusion);
  const libres = libresParRarete(fusion);

  if (rarete === null) {
    return (
      <div class="fusion" data-testid="fusion">
        <p class="forge-mot" data-testid="fusion-sans-objet">
          {regleDeLaRarete(ORDRE_RARETES[0]!, fusion.nombre)} Les objets de{" "}
          <a class="forge-lien" href={`${basePath()}${ADRESSE_BOUTIQUE}`}>
            la boutique
          </a>{" "}
          et des pochettes se fondent ici.
        </p>
      </div>
    );
  }

  const suivante = rareteSuivante(rarete);
  const objets = objetsDeLaRarete(fusion, rarete);
  const plein = creusetPlein(creuset, fusion);
  const manque = fusion.nombre - creuset.length;
  const raison = plein ? null : libres[rarete] < fusion.nombre ? `Il faut ${fusion.nombre} objets de cette rareté à donner : vous en avez ${libres[rarete]}.` : `Posez encore ${manque} ${manque > 1 ? "objets" : "objet"}.`;

  const changerDeRarete = (suite: Rarete) => {
    setChoisie(suite);
    if (rareteDuCreuset(creuset) !== suite) setCreuset([]);
  };

  const fondre = async (donnes: Creuset): Promise<Issue<FusionReponse>> => {
    try {
      const lue = lireFusionReponse(await call<unknown>("fusionner_objets", { p_objets: demandeDeFusion(donnes) }));
      if (!lue) return { ok: false, message: ILLISIBLE };
      onForge(lue.forge);
      setAnnonce(`Fusion faite : vous recevez ${nomDeLObjet(lue.recu)}, ${RARETES[lue.recu.rarete].nom}.`);
      return { ok: true, valeur: lue };
    } catch (e) {
      const code = e instanceof ServerError ? e.code : "network";
      // Après un refus, la forge est relue : ce qui se fond est ce que dit le serveur.
      await onRelire();
      return { ok: false, message: messageDeLaFusion(code) ?? errorMessage(code) };
    }
  };

  return (
    <div class="fusion" data-testid="fusion">
      <div class="fusion-raretes" role="group" aria-label="Rareté à fondre">
        {RARETES_A_FONDRE.map((r) => (
          <button key={r} type="button" class="chip filtre" data-rarete={r} aria-pressed={r === rarete} onClick={() => changerDeRarete(r)} data-testid={`fusion-rarete-${r}`}>
            <Losanges rang={RARETES[r].rang} />
            {RARETES[r].nom}
            <span class="filtre-nombre tnum">{libres[r]}</span>
            <span class="sr-only"> à donner</span>
          </button>
        ))}
      </div>

      <div class="fusion-creuset" data-testid="fusion-creuset">
        <ol class="fusion-places" aria-label="Le creuset">
          {Array.from({ length: fusion.nombre }, (_, place) => {
            const pose = creuset[place];
            return (
              <li key={place}>
                {pose ? (
                  <button type="button" class="case fusion-place" data-rarete={pose.rarete} onClick={() => setCreuset(reprendre(creuset, place))} data-testid="fusion-place">
                    <span class="case-image">
                      <Dessin objet={pose} place={64} />
                    </span>
                    <span class="case-nom">{nomDeLObjet(pose)}</span>
                    <span class="sr-only">, le reprendre</span>
                  </button>
                ) : (
                  <span class="fusion-place fusion-place-vide" data-testid="fusion-place-vide">
                    <span class="sr-only">Place vide</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {suivante && (
          <p class="fusion-donne-mot">
            donnent
            <span class="case fusion-recu" data-rarete={suivante} data-testid="fusion-suivante">
              <span class="fusion-recu-un">1 objet</span>
              <MarqueDeRarete rarete={suivante} />
              <span class="fusion-recu-hasard">au hasard</span>
            </span>
          </p>
        )}
      </div>

      <div class="forge-action">
        <button ref={bouton} type="button" class="btn btn-primary" disabled={!plein} aria-describedby={raison ? "fusion-raison" : undefined} onClick={() => setDialogue(creuset)} data-testid="fusion-fondre">
          Fondre ces {fusion.nombre} objets
        </button>
        {raison && (
          <p id="fusion-raison" class="forge-raison" data-testid="fusion-raison">
            {raison}
          </p>
        )}
      </div>

      <h3 id="fusion-objets" class="forge-etape">
        Vos objets de rareté {RARETES[rarete].nom}
      </h3>
      {objets.length > 0 ? (
        <div class="cases forge-cases" role="group" aria-labelledby="fusion-objets" data-testid="fusion-objets">
          {objets.map((objet) => {
            const poses = dansLeCreuset(creuset, objet);
            const reste = resteAPoser(creuset, objet);
            const garde = objet.libres < objet.quantite;
            return (
              <button
                key={cleDeLObjet(objet)}
                type="button"
                class="case forge-case fusion-case"
                data-rarete={objet.rarete}
                data-pose={poses > 0 ? "" : undefined}
                disabled={plein || reste === 0}
                title={garde ? "Votre Gaulois le porte, ou il est gravé : un exemplaire reste à vous." : undefined}
                onClick={() => setCreuset(poser(creuset, objet, fusion))}
                data-testid="fusion-objet"
              >
                <span class="case-image">
                  <Dessin objet={objet} />
                </span>
                <span class="case-nom">{nomDeLObjet(objet)}</span>
                <span class="fusion-compte">
                  {exemplaires(objet.quantite)}
                  {garde && ", 1 gardé"}
                  {poses > 0 && `, ${poses} dans le creuset`}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p class="forge-mot" data-testid="fusion-rarete-vide">
          {regleDeLaRarete(rarete, fusion.nombre)}
        </p>
      )}

      {dialogue && suivante && <DialogueFusion creuset={dialogue} suivante={suivante} fondre={() => fondre(dialogue)} onFermer={() => setDialogue(null)} />}
      <p class="sr-only" role="status" data-testid="fusion-annonce">
        {annonce}
      </p>
    </div>
  );
}
