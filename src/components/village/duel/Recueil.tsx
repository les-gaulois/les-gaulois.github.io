import { useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import { Icone, Px } from "../../jeu/Pixels";
import { motionAllowed } from "../../../lib/fx/motion";
import { urlDeLaPlanche } from "../../../lib/jeu/dans-la-page";
import { iconeDeRarete } from "../../../lib/jeu/icones-de-rarete";
import { grille } from "../../../lib/jeu/planche";
import {
  EMPLACEMENTS_DE_LA_MAIN,
  NOMS_DES_EMPLACEMENTS,
  NOMS_DES_RANGS,
  RANGS_DE_CARTE,
  cartesDeLEmplacement,
  compteDeLaCollection,
  ouTrouver,
  ouTrouverEnMots,
  type EmplacementDeLaMain,
  type RangDeCarte,
  type Source,
} from "../../../lib/village/ecran-duel";
import { AURAS, ROLES, enGris, faceDeCarte, iconeDeMot, silhouette, tuileDeRole } from "./dessins-des-cartes";
import { dessinDeLaCarte, ficheDe, nomDEmplacement, type Fiche, type MoteurDuDuel } from "./moteur";
import { SON } from "./sons-du-duel";

/**
 * Le recueil des cartes du duel (chantier 1 du 22 novembre 2026), repris de la maquette validée par le pilote : toutes les
 * cartes, emplacement par emplacement, filtrées par rareté, la carte choisie en grand avec sa finition qui suit le doigt, sa
 * fiche ; puis les mots-clés et les panoplies. Les cartes sont les vrais objets du membre : celles qu'il n'a pas sont
 * grisées, avec où les trouver (la boutique, un booster, le pass).
 *
 * C'est aussi le tiroir où l'on change une carte de sa main (`choix`) : seulement les cartes de l'emplacement, et
 * seulement celles qu'on a peuvent se prendre, sous la bourse.
 */

/** L'image d'une carte, une fois par carte et par état (grisée ou non). */
export function urlDeLaCarte(m: MoteurDuDuel, id: string, gris = false): string {
  return urlDeLaPlanche(`duel-carte|${id}|${gris}`, () => {
    const d = dessinDeLaCarte(m, m.carte(id));
    return gris ? enGris(faceDeCarte({ ...d, dessin: d.dessin ? silhouette(d.dessin) : null })) : faceDeCarte(d);
  });
}
const urlDuRole = (e: EmplacementDeLaMain, m: MoteurDuDuel): string => {
  const role = m.carte(cartesDeLEmplacement(m.catalogue, e)[0]!).role;
  return urlDeLaPlanche(`duel-role|${role}`, () => tuileDeRole(role));
};

/** Où trouver une carte : l'icône de la partie du jeu, son mot, son adresse (le lien y mène). */
const SOURCES: Readonly<Record<Source, { icone: "boutique" | "pochettes" | "sentier"; mot: string; ancre: string }>> = {
  boutique: { icone: "boutique", mot: "Boutique", ancre: "#boutique" },
  booster: { icone: "pochettes", mot: "Booster", ancre: "#pochettes" },
  pass: { icone: "sentier", mot: "Pass", ancre: "#sentier" },
};
const TOUTES_LES_SOURCES = ["boutique", "booster", "pass"] as const;

/** La fiche d'une carte, en phrases, avec ses icônes. */
export function TexteDeLaFiche({ fiche }: { fiche: Fiche }) {
  return (
    <div class="dl-texte-fiche">
      <p class="dl-f-nom">
        <b>{fiche.nom}</b> <span>{fiche.sous}</span>
      </p>
      {fiche.lignes.map((l, i) => {
        const ic = l.icone;
        const url = !ic ? null : "role" in ic ? urlDeLaPlanche(`duel-role|${ic.role}`, () => tuileDeRole(ic.role)) : urlDeLaPlanche(`duel-mot|${ic.mot}|${ic.unique}`, () => iconeDeMot(ic.mot, ic.unique));
        return (
          <p key={i} class={`dl-f-ligne ${l.ton ? `dl-f-${l.ton}` : ""}`}>
            {url && <i style={{ backgroundImage: url }} aria-hidden="true" />}
            <span>
              <b>{l.gras}</b> {l.texte}
            </span>
          </p>
        );
      })}
    </div>
  );
}

/** Une carte en grand, qui penche vers le doigt ; au repos, elle se balance doucement. */
export function GrandeCarte({ m, id, gris = false, classe = "" }: { m: MoteurDuDuel; id: string; gris?: boolean; classe?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const carte = m.carte(id);
  const bouge = (ev: PointerEvent): void => {
    const g = el.current;
    if (!g || !motionAllowed()) return;
    const r = g.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    g.classList.add("dl-tenue");
    g.style.setProperty("--dl-mx", u.toFixed(3));
    g.style.setProperty("--dl-my", v.toFixed(3));
    g.style.setProperty("--ry", `${((u - 0.5) * 30).toFixed(1)}deg`);
    g.style.setProperty("--rx", `${((0.5 - v) * 24).toFixed(1)}deg`);
    g.style.setProperty("--dl-ang", (u * 200 + v * 120).toFixed(0));
  };
  return (
    <div
      ref={el}
      class={`dl-grande ${gris ? "dl-gris" : ""} ${classe}`}
      data-r={gris ? undefined : carte.r}
      style={`--rc:${AURAS[carte.r]}`}
      role="img"
      aria-label={`${dessinDeLaCarte(m, carte).nom}, en grand${gris ? ", pas encore à toi" : ""}`}
      onPointerMove={bouge}
      onPointerDown={bouge}
      onPointerLeave={() => el.current?.classList.remove("dl-tenue")}
    >
      <i style={{ backgroundImage: urlDeLaCarte(m, id, gris) }} />
      <span class="dl-c-fini" />
      <span class="dl-c-eclats" />
    </div>
  );
}

type Vue = EmplacementDeLaMain | "mots" | "panoplies";

export interface ChoixDuRecueil {
  emplacement: EmplacementDeLaMain;
  /** La carte de la main qu'on remplace. */
  actuelle: string;
  /** Ce que la bourse laisse pour cet emplacement, une fois les quatre autres payées. */
  reste: number;
  onPrendre: (id: string) => void;
}

/**
 * Le recueil. `aMoi` : les cartes du membre ; `null` tant qu'elles ne se savent pas (seules celles de base sont sûres, les
 * autres ne se grisent pas encore). `choix` : le tiroir d'une carte de la main.
 */
export function Recueil({ m, aMoi, choix = null }: { m: MoteurDuDuel; aMoi: ReadonlySet<string> | null; choix?: ChoixDuRecueil | null }) {
  const [vue, setVue] = useState<Vue>(choix?.emplacement ?? "arme");
  const [rarete, setRarete] = useState<RangDeCarte | null>(null);
  // « Seulement mes cartes » ou « seulement celles à trouver » ; aucune des deux : tout.
  const [tri, setTri] = useState<"a-moi" | "a-trouver" | null>(null);
  const emplacement: EmplacementDeLaMain = choix?.emplacement ?? (vue === "mots" || vue === "panoplies" ? "arme" : vue);
  const liste = useMemo(
    () => cartesDeLEmplacement(m.catalogue, emplacement, rarete).filter((id) => !aMoi || tri === null || (tri === "a-moi") === aMoi.has(id)),
    [m, emplacement, rarete, tri, aMoi],
  );
  const [sel, setSel] = useState<string>(choix?.actuelle ?? liste[0] ?? "");
  const choisie = liste.includes(sel) ? sel : (liste[0] ?? sel);
  const aLui = (id: string): boolean => (aMoi ? aMoi.has(id) : true);
  const compte = aMoi ? compteDeLaCollection(m.catalogue, aMoi, emplacement) : null;

  const onglet = (cle: Vue, mot: string, image: string | null, actif: boolean): JSX.Element => (
    <button
      key={cle}
      type="button"
      class="dl-onglet"
      aria-pressed={actif}
      aria-label={mot}
      title={mot}
      onClick={() => {
        SON.clic();
        setVue(cle);
      }}
    >
      {image ? <i style={{ backgroundImage: image }} aria-hidden="true" /> : <span>{mot}</span>}
    </button>
  );

  const cartes = vue !== "mots" && vue !== "panoplies";
  const carte = choisie ? m.carte(choisie) : null;
  const prenable = !!choix && !!carte && aLui(choisie) && carte.c <= choix.reste;
  const trop = !!choix && !!carte && carte.c > choix.reste;
  const titre = choix ? `CHANGER : ${NOMS_DES_EMPLACEMENTS[choix.emplacement]}` : "LE RECUEIL";

  return (
    <div class={`dl-recueil ${choix ? "dl-recueil-choix" : ""}`} data-testid="duel-recueil">
      <div class="dl-r-tete">
        <h3 class="dl-r-titre">
          <Px t={titre} couleur="texte" />
        </h3>
        {!choix && (
          <div class="dl-r-onglets" role="group" aria-label="Ce que montre le recueil">
            {EMPLACEMENTS_DE_LA_MAIN.map((e) => onglet(e, `${nomDEmplacement(e)} : ${ROLES[m.carte(cartesDeLEmplacement(m.catalogue, e)[0]!).role].nom.toLowerCase()}`, urlDuRole(e, m), vue === e))}
            {onglet("mots", "Mots-clés", null, vue === "mots")}
            {onglet("panoplies", "Panoplies", null, vue === "panoplies")}
          </div>
        )}
        {cartes && (
          <div class="dl-r-raretes" role="group" aria-label="Rareté">
            {[null, ...RANGS_DE_CARTE].map((r) => {
              const nom = r === null ? "Toutes les raretés" : NOMS_DES_RANGS[r];
              const icone = r === null || r === "base" ? null : urlDeLaPlanche(`rarete|${r}`, () => iconeDeRarete(r));
              return (
                <button
                  key={r ?? "toutes"}
                  type="button"
                  class="dl-rarete"
                  aria-pressed={rarete === r}
                  aria-label={nom}
                  title={nom}
                  onClick={() => {
                    SON.clic();
                    setRarete(r);
                  }}
                >
                  {icone ? <i style={{ backgroundImage: icone }} aria-hidden="true" /> : <span aria-hidden="true">{r === null ? "tout" : "base"}</span>}
                </button>
              );
            })}
          </div>
        )}
        {cartes && aMoi && !choix && (
          <div class="dl-r-raretes" role="group" aria-label="Mes cartes ou celles à trouver">
            {(
              [
                ["a-moi", "Seulement mes cartes", "à moi"],
                ["a-trouver", "Seulement les cartes à trouver", "à trouver"],
              ] as const
            ).map(([cle, nom, court]) => (
              <button
                key={cle}
                type="button"
                class="dl-rarete"
                aria-pressed={tri === cle}
                aria-label={nom}
                title={nom}
                data-testid={`duel-tri-${cle}`}
                onClick={() => {
                  SON.clic();
                  setTri(tri === cle ? null : cle);
                }}
              >
                <span aria-hidden="true">{court}</span>
              </button>
            ))}
          </div>
        )}
        {compte && cartes && (
          <p class="dl-r-compte">
            <Px t={`${compte.a} SUR ${compte.total}`} couleur="doux" dit={`${compte.a} cartes à toi sur ${compte.total} pour cet emplacement`} />
          </p>
        )}
      </div>
      {vue === "mots" && (
        <div class="dl-r-page">
          <h4>Les mots-clés</h4>
          {Object.entries(m.mots)
            .filter(([, d]) => !d.unique)
            .map(([k, d]) => (
              <p key={k} class="dl-f-ligne">
                <i style={{ backgroundImage: urlDeLaPlanche(`duel-mot|${k}|false`, () => iconeDeMot(k, false)) }} aria-hidden="true" />
                <span>
                  <b>{d.nom}.</b> {d.phrase.replace("{n}", "N")}
                </span>
              </p>
            ))}
          <p class="dl-f-note">N : le chiffre écrit sur la carte.</p>
          <h4>Les effets des cartes uniques</h4>
          {Object.entries(m.mots)
            .filter(([, d]) => d.unique)
            .map(([k, d]) => (
              <p key={k} class="dl-f-ligne">
                <i style={{ backgroundImage: urlDeLaPlanche(`duel-mot|${k}|true`, () => iconeDeMot(k, true)) }} aria-hidden="true" />
                <span>
                  <b>{d.nom}.</b> {d.phrase.replace("{n}", "N")}
                </span>
              </p>
            ))}
        </div>
      )}
      {vue === "panoplies" && (
        <div class="dl-r-page">
          <h4>Les panoplies</h4>
          {Object.entries(m.panoplies).map(([k, p]) => (
            <p key={k} class="dl-f-panoplie">
              <b>{p.nom}</b> ({p.pieces} pièces en main). {p.phrase}
            </p>
          ))}
          <h4>Les lieux</h4>
          <p class="dl-f-note">La bannière du Gaulois défié est le lieu du duel. Son effet vaut pour les deux.</p>
          {Object.entries(m.lieux).map(([k, l]) => (
            <p key={k} class="dl-f-panoplie">
              <b>Bannières « {k} ».</b> {l.phrase}
            </p>
          ))}
          <h4>Les compagnons</h4>
          <p class="dl-f-note">Un petit effet, le même pour tous, selon la famille du familier, jamais selon sa rareté.</p>
          {Object.entries(m.compagnons).map(([k, l]) => (
            <p key={k} class="dl-f-panoplie">
              <b>{k}.</b> {l.phrase}
            </p>
          ))}
        </div>
      )}
      {cartes && (
        <div class="dl-r-corps">
          <div class="dl-r-grille" role="group" aria-label={`Les cartes : ${nomDEmplacement(emplacement)}`}>
            {liste.map((id) => {
              const c = m.carte(id);
              const gris = !aLui(id);
              const cher = !!choix && c.c > choix.reste;
              return (
                <button
                  key={id}
                  type="button"
                  class={`dl-mini ${gris ? "dl-gris" : ""} ${cher ? "dl-trop" : ""}`}
                  data-r={gris ? undefined : c.r}
                  data-testid={`duel-carte-${id}`}
                  style={`--rc:${AURAS[c.r]}`}
                  aria-pressed={id === choisie}
                  aria-label={`${dessinDeLaCarte(m, c).nom}, ${NOMS_DES_RANGS[c.r].toLowerCase()}, prix ${c.c}${gris ? ", pas encore à toi" : ""}${cher ? ", dépasse la bourse" : ""}`}
                  onClick={() => {
                    SON.survol();
                    setSel(id);
                  }}
                  onPointerMove={(ev) => {
                    const b = ev.currentTarget;
                    const r = b.getBoundingClientRect();
                    b.style.setProperty("--dl-mx", ((ev.clientX - r.left) / r.width).toFixed(2));
                    b.style.setProperty("--dl-my", ((ev.clientY - r.top) / r.height).toFixed(2));
                  }}
                >
                  <i style={{ backgroundImage: urlDeLaCarte(m, id, gris) }} aria-hidden="true" />
                  <span class="dl-c-fini" />
                  <span class="dl-c-eclats" />
                </button>
              );
            })}
          </div>
          {carte && (
            <aside class="dl-r-cote" aria-live="polite">
              <div class="dl-r-vitrine">
                <GrandeCarte key={choisie} m={m} id={choisie} gris={!aLui(choisie)} />
              </div>
              <div class="dl-r-infos">
                <TexteDeLaFiche fiche={ficheDe(m, carte)} />
                {aMoi && aLui(choisie) && !choix && <p class="dl-r-a-moi">À toi.</p>}
                {!aLui(choisie) && (
                  <div class="dl-r-trouver">
                    <p>
                      <b>Pas encore à toi.</b> {ouTrouverEnMots(carte.r)}
                    </p>
                    {carte.r !== "base" && (
                      <span class="dl-r-sources">
                        {TOUTES_LES_SOURCES.map((s) =>
                          ouTrouver(carte.r).includes(s) ? (
                            <a key={s} class="dl-r-source" href={SOURCES[s].ancre} title={SOURCES[s].mot} data-testid={`duel-source-${s}`}>
                              <Icone nom={SOURCES[s].icone} />
                              <span class="dl-r-source-mot">{SOURCES[s].mot}</span>
                            </a>
                          ) : (
                            <span key={s} class="dl-r-source dl-r-eteinte" aria-hidden="true">
                              <Icone nom={SOURCES[s].icone} />
                              <span class="dl-r-source-mot">{SOURCES[s].mot}</span>
                            </span>
                          ),
                        )}
                      </span>
                    )}
                  </div>
                )}
                {choix && trop && <p class="dl-f-alerte">Dépasse la bourse : il te reste {choix.reste} points pour cet emplacement.</p>}
                {choix && (
                  <button
                    type="button"
                    class="jeu-btn jeu-n9 jeu-btn-ic dl-btn dl-grand dl-prendre"
                    disabled={!prenable}
                    aria-label="Prendre cette carte"
                    data-mot="Prendre cette carte"
                    data-testid="duel-prendre"
                    onClick={() => {
                      if (!prenable) {
                        SON.vide();
                        return;
                      }
                      choix.onPrendre(choisie);
                    }}
                  >
                    <i class="jeu-pic" style={{ "--i": urlDeLaPlanche("duel-ic|coche|true", () => COCHE()) } as JSX.CSSProperties} />
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

const COCHE = () =>
  grille(["................", "................", "................", ".............ww.", "............www.", "...........www..", "..........www...", ".ww......www....", ".www....www.....", "..www..www......", "...wwwwww.......", "....wwww........", ".....ww.........", "................", "................", "................"], { w: "#231503" });
