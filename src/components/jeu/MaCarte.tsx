import { useEffect, useState } from "preact/hooks";
import { basePath, call } from "../../lib/compte/api";
import { tenueDuServeur, type Tenue } from "../../lib/gaulois";
import { cheminDesPaliers, NOMS_DES_INSIGNES } from "../../lib/jeu/paliers-de-victoires";
import { lireChiffresDuJoueur, pointsDuServeur, tauxDeVictoire, victoiresEnMots, type ChiffresDeCarte, type LectureDesChiffres } from "../../lib/jeu/chiffres-de-carte";
import { nombreEcrit } from "../../lib/jeu/ecriture";
import { fmtDate, fmtDateTime, fmtPct } from "../../lib/format";
import { cadreParId } from "../../lib/village/cadres";
import { finitionParId, lireMesCartes, type FinitionDuRayon } from "../../lib/village/cartes";
import { lireMesCadres } from "../../lib/village/cadres";
import { familierDe, lireMesFamiliers, type Familier } from "../../lib/village/familiers";
import type { CadreDeCarte } from "../../lib/fx/cadres-carte";
import { Loading, Problem } from "../compte/common";
import { BANNIERE_CHOISIE } from "../village/Bannieres";
import { CarteAnimee } from "../village/CarteAnimee";
import InsigneDeSaison from "../village/InsigneDeSaison";
import { InsignesDuDuelDuMembre } from "../village/duel-tableau/InsigneDuDuel";
import type { InsigneDuPass } from "../../lib/village/contrat";
import { Compteur, Icone, Insigne, Px } from "./Pixels";

/**
 * « Ma carte », la première partie du jeu « Mon Gaulois » (21 novembre 2026, fiche de projet et maquette validées par le
 * pilote) : la carte du joueur, la même que celle du podium de l'accueil, de sa fiche et de /macarte (son Gaulois, son
 * familier, sa bannière, le cadre et la finition achetés, `CarteAnimee`), et ses vrais chiffres de clan, ceux de sa fiche
 * (`src/lib/jeu/chiffres-de-carte.ts`) : victoires et défaites sous le tag, avec la barre vers le prochain des quatorze
 * paliers et leurs insignes ; série et record ; utilité moyenne, 100 étant la part moyenne d'un Gaulois ; niveau OpenFront
 * et prestige, tout le jeu. Les points rapportés au clan ne paraissent que si le serveur les donne au joueur.
 *
 * Rien d'inventé : un membre sans pseudo public a sa carte, sans chiffres ; un chiffre absent ne s'écrit pas (pas de zéro) ;
 * la date du relevé est écrite. Ni note globale, ni Elo, ni valeur tirée des cosmétiques.
 */

/** Ce qui fait la carte du joueur, lu au serveur. */
export interface CarteDuJoueur {
  tenue: Tenue | null;
  banniere: string | null;
  finition: FinitionDuRayon | null;
  cadre: CadreDeCarte | null;
  familier: Familier | null;
}

const SANS_CARTE: CarteDuJoueur = { tenue: null, banniere: null, finition: null, cadre: null, familier: null };

/**
 * La carte du joueur : relue à l'ouverture, chaque fois que `relire` change (le retour sur « Ma carte », après un achat),
 * quand il enregistre sa tenue ou choisit une bannière. Chaque fonction du serveur est lue à part : une en panne n'empêche
 * pas les autres. */
export function useCarteDuJoueur(actif: boolean, relire: number): CarteDuJoueur | null {
  const [carte, setCarte] = useState<CarteDuJoueur | null>(null);
  const [fois, setFois] = useState(0);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    const lire = <T,>(fn: string, lecture: (r: unknown) => T | null): Promise<T | null> => call<unknown>(fn).then(lecture, () => null);
    void Promise.all([
      lire("get_mon_gaulois", tenueDuServeur),
      lire("get_mes_bannieres", (r) => {
        const porte = typeof r === "object" && r !== null ? (r as { porte?: unknown }).porte : null;
        return typeof porte === "string" && /^[a-z]+(-[a-z]+)*$/.test(porte) ? porte : null;
      }),
      lire("get_mes_cartes", (r) => finitionParId(lireMesCartes(r)?.porte ?? null)),
      lire("get_mes_cadres", (r) => cadreParId(lireMesCadres(r)?.porte ?? null)?.id ?? null),
      lire("get_mes_familiers", (r) => familierDe(lireMesFamiliers(r)?.porte ?? null)),
    ]).then(([tenue, banniere, finition, cadre, familier]) => {
      if (!vivant) return;
      setCarte({ ...SANS_CARTE, tenue, banniere, finition, cadre: (cadre as CadreDeCarte | null) ?? null, familier });
    });
    return () => {
      vivant = false;
    };
  }, [actif, relire, fois]);
  useEffect(() => {
    const encore = (): void => setFois((n) => n + 1);
    window.addEventListener("gal:gaulois-enregistre", encore);
    window.addEventListener(BANNIERE_CHOISIE, encore);
    return () => {
      window.removeEventListener("gal:gaulois-enregistre", encore);
      window.removeEventListener(BANNIERE_CHOISIE, encore);
    };
  }, []);
  return carte;
}

// Les points rapportés au clan, s'ils viennent un jour du serveur : demandés une fois par page, pas à chaque retour.
let pointsDemandes: Promise<ReturnType<typeof pointsDuServeur>> | null = null;

/** Les chiffres du joueur : `/village/chiffres.json` (construction du site), sous le pseudo de son profil OpenFront lié. */
function useChiffres(pseudo: string | null | undefined) {
  const [lu, setLu] = useState<LectureDesChiffres | "lecture">("lecture");
  const [points, setPoints] = useState<ReturnType<typeof pointsDuServeur>>(null);
  const [fois, setFois] = useState(0);
  useEffect(() => {
    let vivant = true;
    void fetch(`${basePath()}/village/chiffres.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (raw: unknown) => vivant && setLu(lireChiffresDuJoueur(raw, pseudo)),
        () => vivant && setLu({ kind: "illisible" }),
      );
    pointsDemandes ??= call<unknown>("get_mes_stateres").then(pointsDuServeur, () => null);
    void pointsDemandes.then((p) => vivant && setPoints(p));
    return () => {
      vivant = false;
    };
  }, [pseudo, fois]);
  return { lu, points, relire: () => setFois((n) => n + 1) };
}

/** Une ligne de chiffres : icône, nom, ce qui est à droite, puis la barre ou le compteur, et une phrase en lettres du site. */
function Ligne({ icone, nom, cote, children, dit, phrase, testid }: { icone: preact.ComponentChildren; nom: string; cote?: preact.ComponentChildren; children: preact.ComponentChildren; dit: string; phrase?: string | null; testid: string }) {
  return (
    <div class="jeu-stat" data-testid={testid}>
      {icone}
      <Px t={nom} couleur="texte" muet classe="jeu-stat-nom" />
      {cote && <span class="jeu-stat-cote">{cote}</span>}
      <div class="jeu-stat-corps" aria-hidden="true">
        {children}
      </div>
      <p class="sr-only">{dit}</p>
      {phrase && (
        <p class="jeu-stat-dit" aria-hidden="true">
          {phrase}
        </p>
      )}
    </div>
  );
}

/**
 * Une barre : un tube, son plein (`part` de 0 à 1), à sa vraie part dès l'affichage (une animation ne change jamais une
 * valeur), et le chiffre toujours calé à droite, dans la partie sombre (revue de Claude Fable 5.2, 21 novembre 2026).
 */
function Barre({ part, teinte, texte, crans = false, repere }: { part: number; teinte: "or" | "bleu" | "vert" | "violet"; texte: string; crans?: boolean; repere?: number }) {
  return (
    <div class="jeu-tube jeu-n9">
      <div class={`jeu-plein jeu-n9 jeu-plein-${teinte} ${part <= 0 ? "jeu-plein-vide" : ""}`} style={`--part:${Math.max(0, Math.min(1, part))}`} />
      {crans && <div class="jeu-crans" />}
      {repere !== undefined && <i class="jeu-repere" style={`--x:${repere}`} />}
      <Px t={texte} couleur="creme" relief="cerne" muet classe="jeu-px-fin" />
    </div>
  );
}

/** Les chiffres d'une carte. */
function MesChiffres({ c, points, utiliteLe }: { c: ChiffresDeCarte; points: ReturnType<typeof pointsDuServeur>; utiliteLe: string | null }) {
  const chemin = cheminDesPaliers(c.victoires);
  const taux = tauxDeVictoire(c);
  const vers = chemin.suivant;
  const serie = c.serie;
  const record = c.record;
  const pions = Math.min(15, Math.max(5, record?.victoires ?? 0, serie?.victoires ?? 0));
  const u = c.utilite;
  const n = c.niveau;
  return (
    <>
      <Ligne
        testid="ma-carte-victoires"
        icone={chemin.atteint ? <Insigne rang={chemin.atteint.rang} nom={`Palier de ${nombreEcrit(chemin.atteint.seuil)} victoires : ${NOMS_DES_INSIGNES[chemin.atteint.rang]}`} /> : <Icone nom="victoire" />}
        nom="Victoires"
        dit={`${victoiresEnMots(c.victoires)} sous le tag${vers ? `, prochain palier à ${nombreEcrit(vers.seuil)}` : ", dernier palier atteint"} ; ${nombreEcrit(c.defaites)} ${c.defaites > 1 ? "défaites" : "défaite"}${taux !== null ? `, ${fmtPct(taux)} de victoires` : ""}.`}
        phrase={`${nombreEcrit(c.defaites)} ${c.defaites > 1 ? "défaites" : "défaite"} sous le tag${taux !== null ? `, ${fmtPct(taux)} de victoires` : ""}`}
      >
        <Barre part={chemin.part} teinte="or" texte={vers ? `${nombreEcrit(c.victoires)} / ${nombreEcrit(vers.seuil)}` : nombreEcrit(c.victoires)} />
        {vers && <Insigne rang={vers.rang} eteint nom={`Prochain palier : ${nombreEcrit(vers.seuil)} victoires`} classe="jeu-stat-suivant" />}
      </Ligne>
      {points && (
        <Ligne
          testid="ma-carte-points"
          icone={<Icone nom="points" />}
          nom="Points au clan"
          dit={`${nombreEcrit(points.points)} points rapportés au clan par vos parties depuis le ${fmtDate(points.depuis)}, comptés en entier comme pour les statères.`}
          phrase={`Par vos parties depuis le ${fmtDate(points.depuis)}, comptés en entier comme pour les statères`}
        >
          <Compteur n={points.points} dit={`${nombreEcrit(points.points)} points`} />
        </Ligne>
      )}
      {serie && (
        <Ligne
          testid="ma-carte-serie"
          icone={<Icone nom="flamme" />}
          nom="Série"
          cote={record ? <Px t={`Record ${record.victoires}`} couleur="doux" muet /> : undefined}
          dit={`Série en cours : ${serie.auMoins ? "au moins " : ""}${victoiresEnMots(serie.victoires)} d'affilée sous le tag, au relevé du ${fmtDateTime(serie.releve)}${record ? ` ; record : ${record.auMoins ? "au moins " : ""}${victoiresEnMots(record.victoires)}, sur les parties lues depuis le ${fmtDate(record.luesDepuis)}` : ""}.`}
          phrase={`${serie.auMoins ? "Au moins " : ""}${victoiresEnMots(serie.victoires)} d'affilée au relevé du ${fmtDateTime(serie.releve)}${record ? ` ; record${record.auMoins ? " d'au moins " : " de "}${victoiresEnMots(record.victoires)} depuis le ${fmtDate(record.luesDepuis)}` : ""}`}
        >
          <span class="jeu-pions">
            {Array.from({ length: pions }, (_, i) => (
              <i key={i} data-allume={i < serie.victoires ? "" : undefined} />
            ))}
          </span>
        </Ligne>
      )}
      {u && (
        <Ligne
          testid="ma-carte-utilite"
          icone={<Icone nom="utilite" />}
          nom="Utilité"
          dit={`Utilité moyenne : ${nombreEcrit(u.moyenne)}, sur ${nombreEcrit(u.parties)} ${u.parties > 1 ? "parties" : "partie"} à revoir ; 100 est la part moyenne d'un Gaulois${utiliteLe ? `, à jour du ${fmtDateTime(utiliteLe)}` : ""}.`}
          phrase={`Moyenne sur ${nombreEcrit(u.parties)} ${u.parties > 1 ? "parties" : "partie"} à revoir ; 100 : la part moyenne d'un Gaulois${utiliteLe ? `, à jour du ${fmtDateTime(utiliteLe)}` : ""}`}
        >
          <Barre part={u.moyenne / 200} teinte="vert" texte={nombreEcrit(u.moyenne)} repere={0.5} />
        </Ligne>
      )}
      {n && (
        <Ligne
          testid="ma-carte-niveau"
          icone={<Icone nom="niveau" />}
          nom="Niveau"
          cote={<Px t={n.legende ? "Légende" : n.prestige > 0 ? `Prestige ${n.prestige}` : "Sans prestige"} couleur="doux" muet />}
          dit={n.legende ? "Compte OpenFront : Légende, tout le jeu." : `Compte OpenFront, tout le jeu : niveau ${n.niveau} sur 100, ${n.prestige > 0 ? `prestige ${n.prestige}` : "sans prestige"}.`}
          phrase="Compte OpenFront, tout le jeu"
        >
          <Barre part={n.legende ? 1 : n.niveau / 100} teinte="violet" crans texte={n.legende ? "Légende" : `${n.niveau} / 100`} />
        </Ligne>
      )}
    </>
  );
}

export default function MaCarte({
  carte,
  pseudo,
  nom,
  insignesDeSaison = [],
  versLeVestiaire,
}: {
  carte: CarteDuJoueur | null;
  pseudo: string | null | undefined;
  /** Le nom sur la plaque de la carte. */
  nom: string | null;
  /** Les insignes des saisons du pass dont le membre a pris le dernier palier (`get_mon_sentier`), le plus récent d'abord. */
  insignesDeSaison?: readonly InsigneDuPass[];
  versLeVestiaire: () => void;
}) {
  const { lu, points, relire } = useChiffres(pseudo);
  const fond = carte?.banniere ? `--banniere:url("${basePath()}/bannieres/${carte.banniere}.png")` : undefined;
  const releve = lu !== "lecture" && lu.kind === "lus" ? lu.liste : null;
  return (
    <div class="jeu-carte" data-testid="ma-carte">
      <div class="jeu-carte-gauche">
        {carte === null ? (
          <Loading label="Lecture de votre carte…" />
        ) : carte.tenue ? (
          <CarteAnimee tenue={carte.tenue} fond={fond} finition={carte.finition} cadre={carte.cadre} familier={carte.familier} classe={`jeu-carte-carte ${carte.cadre ? "jeu-carte-cadree" : ""}`} nom={nom} />
        ) : null}
        {/* Les insignes gagnés, sous la carte (22-23 novembre 2026) : celui de chaque saison du pass finie jusqu'au dernier
            palier, et celui du duelliste de la semaine (`InsignesDuDuelDuMembre`, lu au serveur). Chacun ne paraît qu'une
            fois gagné, avec son nom pour les lecteurs d'écran ; sans aucun, la plaque ne paraît pas. */}
        <div class="jeu-carte-pied">
          <div class="jeu-carte-insignes jeu-bulle jeu-n9" data-testid="ma-carte-insignes">
            {insignesDeSaison.map((i) => (
              <InsigneDeSaison key={i.saison} saison={i.saison} echelle={2} />
            ))}
            <InsignesDuDuelDuMembre echelle={2} />
          </div>
          <button type="button" class="jeu-btn jeu-n9" onClick={versLeVestiaire} data-testid="ma-carte-habiller">
            <Px t="Habiller" couleur="encre" dit="Habiller mon Gaulois" />
          </button>
        </div>
      </div>
      <section class="jeu-chiffres jeu-panneau jeu-n9" aria-labelledby="ma-carte-chiffres" data-testid="ma-carte-chiffres">
        <h3 id="ma-carte-chiffres" class="jeu-ruban jeu-n9">
          <Px t="Mes chiffres" couleur="creme" relief="ombre" />
        </h3>
        {lu === "lecture" ? (
          <Loading label="Lecture de vos chiffres…" />
        ) : lu.kind === "lus" ? (
          <>
            <MesChiffres c={lu.chiffres} points={points} utiliteLe={lu.utilite} />
            <p class="jeu-chiffres-note" data-testid="ma-carte-source">
              Les parties sous le tag de « {pseudo} », comme sur sa fiche{releve ? `, relevées le ${fmtDateTime(releve)}` : ""}.
            </p>
          </>
        ) : lu.kind === "illisible" ? (
          <Problem message="Les chiffres ne répondent pas pour l'instant." onRetry={relire} />
        ) : (
          <p class="jeu-carte-sans" data-testid="ma-carte-sans-chiffres">
            {pseudo ? `Pas de chiffres : la liste du clan n'a pas de fiche publique au seul nom de « ${pseudo} », le pseudo de votre profil OpenFront lié.` : "Pas de chiffres : votre compte n'a pas encore de profil OpenFront lié."}
          </p>
        )}
      </section>
    </div>
  );
}
