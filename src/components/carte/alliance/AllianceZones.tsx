/**
 * Les zones que l'alliance doit prendre, dessinées pixel par pixel par l'encadrement de GAL et par les joueurs alliés pour
 * leur clan, chacune dans la couleur du clan qui la prend. Chacune se compte sur la vraie carte, au dernier relevé : ce que l'alliance en tient déjà, la terre neutre
 * qui reste et les pixels des autres clans, avec les troupes à prévoir selon les règles du jeu
 * (`src/lib/clanmap/economy.ts`).
 *
 * Le dessin (13 novembre 2026, « que les outils soient mieux compris ») : quatre gros boutons illustrés, une phrase pour
 * l'outil choisi, quatre tailles en mots, et le dessin en cours dans la couleur du clan choisi. Le pinceau et le rectangle
 * ne passent jamais sur une autre zone (« impossible de repasser sur une zone déjà existante ») ; le serveur le vérifie.
 *
 * Qui dessine : l'encadrement de GAL, toute zone ; depuis la migration 20261113000700, un joueur allié, les zones de son
 * clan seulement. Le serveur le dit (`can_draw`, `can_edit` de chaque zone) et revérifie chaque écriture ; un serveur plus
 * ancien ne le dit pas, et le dessin reste alors à l'encadrement.
 */
import { useEffect, useState } from "preact/hooks";
import { bilanZone, declarationAncienne, suffisance, troupesDeZone, type BilanZone } from "../../../lib/alliance/bilan";
import { couleurDeZone } from "../../../lib/alliance/couleurs";
import { CADRE_MAX, encoderBits, masqueDeLaZone, type Masque } from "../../../lib/alliance/masque";
import { ETATS_ZONE, type ZoneLigne } from "../../../lib/alliance/types";
import { ENEMY_PIXEL_BASE_TROOPS, NEUTRAL_PIXEL_TROOPS, RULES_CHECKED_ON, TROOPS_PER_CAP } from "../../../lib/clanmap/economy";
import type { IconePartieNom } from "../../../lib/icones-parties";
import { ServerError, call } from "../../../lib/compte/api";
import type { EcranAlliance, EtatDessin, Outil } from "../../../scripts/alliance-ecran";
import IconePartie from "../../compte/IconePartie";
import { Problem, messageIn } from "../../compte/common";
import { Barre, Pastille, TableauZone, useTextes, type Contexte } from "./commun";

/**
 * Les troupes déclarées pour une zone, et si elles suffisent pour ce qui reste à prendre (demande du pilote, 13 novembre
 * 2026). Rien ne s'écrit pour une zone déjà toute à nous.
 */
function Suffisance({ zone, bilan, ctx }: { zone: ZoneLigne; bilan: BilanZone; ctx: Contexte }) {
  const t = useTextes();
  const s = suffisance(bilan, 0);
  if (s.besoin === 0) return null;
  const clans = [...ctx.notres];
  const d = troupesDeZone(zone.tag, clans, ctx.donnees.troops ?? []);
  if (!d) return <p class="carte-aide">{zone.tag ? t.pasDeclareZone(zone.tag) : t.aucuneDeclarationZone}</p>;
  const r = suffisance(bilan, d.troupes);
  const quand = t.dateHeure(d.plusAncienne);
  const verdict = r.manque > 0 ? (r.exact ? t.manque(t.nombre(r.manque)) : t.manqueAuMoins(t.nombre(r.manque))) : r.exact ? t.assez : t.assezMinimum;
  return (
    <p class="carte-aide" data-testid="zone-suffisance">
      {zone.tag ? t.troupesZone(t.nombre(d.troupes), quand) : t.troupesZoneAlliance(t.nombre(d.troupes), d.declares, d.clans, quand)}
      {declarationAncienne(d.plusAncienne, new Date()) ? ` ${t.declarationAncienneZone}` : ""} {verdict}
    </p>
  );
}

/** Les tailles du pinceau et de la gomme, en pixels de côté, de « Fin » à « Très gros ». */
const TAILLES = [1, 5, 13, 25] as const;
const OUTILS: { id: Outil; icone: IconePartieNom }[] = [
  { id: "main", icone: "fleches" },
  { id: "crayon", icone: "pinceau" },
  { id: "rectangle", icone: "cadre" },
  { id: "gomme", icone: "gomme" },
];

/** Un clic de trop perd le dessin : le bouton demande une confirmation, et se désarme quand on le quitte. */
function EnDeuxTemps({ busy, texte, confirmer, aria, ariaConfirmer, onConfirm }: { busy: boolean; texte: string; confirmer: string; aria?: string; ariaConfirmer?: string; onConfirm: () => void }) {
  const [arme, setArme] = useState(false);
  return (
    <button
      type="button"
      class="btn btn-ghost !min-h-10 !py-1.5 !text-sm"
      disabled={busy}
      aria-label={arme ? ariaConfirmer : aria}
      onBlur={() => setArme(false)}
      onClick={() => {
        if (arme) onConfirm();
        else setArme(true);
      }}
    >
      {arme ? confirmer : texte}
    </button>
  );
}

/**
 * Pour l'encadrement : l'état d'une zone (à prendre, en cours, tenue, abandonnée) et sa place dans l'ordre des priorités
 * (migration 20261113001000, idée choisie par le pilote le 13 novembre 2026). Le serveur annonce un changement d'état sur
 * Discord, si le salon de l'alliance est réglé dans la Direction. `ordre` : les zones dans l'ordre reçu du serveur.
 */
function ReglageZone({ zone, ordre, relire }: { zone: ZoneLigne; ordre: readonly number[]; relire: () => Promise<void> }) {
  const t = useTextes();
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const i = ordre.indexOf(zone.id);
  const agir = async (fonction: string, args: Record<string, unknown>) => {
    setBusy(true);
    setErreur(null);
    try {
      await call(fonction, args);
      await relire();
    } catch (e) {
      setErreur(messageIn(e, t.langue));
    } finally {
      setBusy(false);
    }
  };
  const deplacer = (pas: -1 | 1) => {
    const n = [...ordre];
    const j = i + pas;
    if (i < 0 || j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    void agir("order_alliance_zones", { p_ids: n });
  };
  return (
    <div class="alliance-reglage" data-testid="zone-reglage">
      <div class="alliance-mode" role="group" aria-label={t.etatZoneAria(zone.title)}>
        <span class="carte-petit text-muted" aria-hidden="true">
          {t.etatZone}
        </span>
        {ETATS_ZONE.map((e) => (
          <button type="button" aria-pressed={zone.state === e} aria-disabled={busy ? "true" : undefined} onClick={() => !busy && zone.state !== e && void agir("set_alliance_zone_state", { p_id: zone.id, p_state: e })}>
            {t.etats[e]}
          </button>
        ))}
      </div>
      {ordre.length > 1 && i >= 0 && (
        <div class="alliance-ligne mt-2">
          <span class="carte-petit text-muted tnum">{t.priorite(i + 1, ordre.length)}</span>
          <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" aria-disabled={busy || i === 0 ? "true" : undefined} aria-label={t.monterAria(zone.title)} onClick={() => !busy && deplacer(-1)}>
            <span aria-hidden="true">↑</span> {t.monter}
          </button>
          <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" aria-disabled={busy || i === ordre.length - 1 ? "true" : undefined} aria-label={t.descendreAria(zone.title)} onClick={() => !busy && deplacer(1)}>
            <span aria-hidden="true">↓</span> {t.descendre}
          </button>
        </div>
      )}
      <Problem message={erreur} />
    </div>
  );
}

interface Edition {
  id: number | null;
  titre: string;
  tag: string;
}

export default function AllianceZones({
  ctx,
  ecran,
  selection,
  choisir,
  edition,
  setEdition,
}: {
  ctx: Contexte;
  ecran: EcranAlliance;
  selection: number | null;
  choisir: (id: number | null, viser: boolean) => void;
  edition: Edition | null;
  setEdition: (e: Edition | null) => void;
}) {
  const t = useTextes();
  const { donnees, releve, etat, notres, bilans, couleursClans } = ctx;
  const zones = donnees.zones ?? [];
  const clansNotres = [...notres].sort((a, b) => (a === "GAL" ? -1 : b === "GAL" ? 1 : a.localeCompare(b)));
  const sansAlliance = (donnees.ours ?? null) === null;
  // Un allié dessine pour son clan, et pour lui seul : le choix du clan lui est fixé.
  const clanDeLAllie = donnees.access.kind === "allie" ? donnees.access.tag : null;
  const peutDessiner = ctx.staff || (clanDeLAllie !== null && donnees.can_draw === true);
  const peutModifier = (z: ZoneLigne) => ctx.staff || (clanDeLAllie !== null && z.can_edit === true);
  // L'ordre des priorités : celui des zones reçues, que le serveur range par leur place.
  const ordre = zones.map((z) => z.id);
  const [outil, setOutil] = useState<Outil>("crayon");
  const [taille, setTaille] = useState<number>(TAILLES[1]);
  const [dessin, setDessin] = useState<EtatDessin>({ pixels: 0, cadre: null, tropGrand: false, annulable: false, retires: 0 });
  const [apercu, setApercu] = useState<BilanZone | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const couleurEdition = couleurDeZone(edition?.tag ? edition.tag : null, couleursClans);

  // Le dessin en cours se compte à chaque geste fini. GAL est toujours des nôtres dans un bilan.
  useEffect(() => {
    const pourBilan = new Set([...notres, "GAL"]);
    ecran.onDessin = (e) => {
      setDessin(e);
      const m = e.pixels > 0 ? ecran.masqueEdite() : null;
      setApercu(m && etat ? bilanZone(m, etat.valeurs, etat.width, releve.clans, pourBilan) : null);
    };
  }, [ecran, etat, releve, notres]);

  useEffect(() => {
    if (edition) ecran.choisirOutil(outil, taille);
  }, [ecran, edition, outil, taille]);

  // Le dessin prend la couleur du clan choisi, dès qu'on le change.
  useEffect(() => {
    if (edition) ecran.colorerDessin(couleurEdition);
  }, [ecran, edition, couleurEdition]);

  const commencer = (zone: ZoneLigne | null) => {
    setErreur(null);
    const masque: Masque | null = zone ? masqueDeLaZone(zone) : null;
    const tag = zone?.tag ?? clanDeLAllie ?? "";
    setEdition({ id: zone?.id ?? null, titre: zone?.title ?? "", tag });
    choisir(zone?.id ?? null, zone !== null);
    ecran.editer(masque, couleurDeZone(tag || null, couleursClans), zone?.id ?? null);
    setOutil(zone ? "main" : "crayon");
  };

  const abandonner = () => {
    ecran.finirEdition();
    setEdition(null);
    setApercu(null);
    setErreur(null);
  };

  const enregistrer = async () => {
    if (!edition) return;
    const m = ecran.masqueEdite();
    if (!m) {
      setErreur(t.zoneVide);
      return;
    }
    if (m.w * m.h > CADRE_MAX) {
      setErreur(t.tropGrand);
      return;
    }
    setBusy(true);
    setErreur(null);
    try {
      const r = await call<{ id: number }>("save_alliance_zone", {
        p_id: edition.id,
        p_title: edition.titre,
        p_tag: edition.tag || null,
        p_x: m.x,
        p_y: m.y,
        p_w: m.w,
        p_h: m.h,
        p_mask: encoderBits(m.bits),
      });
      ecran.finirEdition();
      setEdition(null);
      setApercu(null);
      await ctx.relire();
      choisir(r.id, false);
    } catch (e) {
      setErreur(messageIn(e, t.langue));
      // Une autre zone enregistrée entre-temps : la carte se relit, et ses pixels quittent le dessin.
      if (e instanceof ServerError && e.code === "zone_overlap") void ctx.relire();
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (id: number) => {
    setBusy(true);
    setErreur(null);
    try {
      await call("delete_alliance_zone", { p_id: id });
      if (selection === id) choisir(null, false);
      await ctx.relire();
    } catch (e) {
      setErreur(messageIn(e, t.langue));
    } finally {
      setBusy(false);
    }
  };

  if (edition) {
    const tailleVisible = outil === "crayon" || outil === "gomme";
    return (
      <section aria-labelledby="zone-edition-titre" data-testid="zone-edition">
        <h3 id="zone-edition-titre">{edition.id === null ? t.titreNouvelleZone : t.titreModifierZone}</h3>
        <form
          class="mt-3 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enregistrer();
          }}
        >
          <div class="alliance-deux">
            <div>
              <label for="zone-titre" class="text-sm font-semibold">
                {t.nomZone}
              </label>
              <input id="zone-titre" class="field mt-1" required minLength={2} maxLength={40} value={edition.titre} onInput={(e) => setEdition({ ...edition, titre: e.currentTarget.value })} />
            </div>
            {ctx.staff ? (
              <div>
                <label for="zone-clan" class="text-sm font-semibold">
                  {t.pourQui}
                </label>
                <div class="alliance-choix-clan mt-1">
                  <Pastille couleur={couleurEdition} />
                  <select id="zone-clan" class="field" value={edition.tag} onChange={(e) => setEdition({ ...edition, tag: e.currentTarget.value })}>
                    <option value="">{t.touteLAlliance}</option>
                    {clansNotres.map((tag) => (
                      <option value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              // Un allié : la zone est celle de son clan, sans choix.
              <div data-testid="zone-clan-fixe">
                <p class="text-sm font-semibold">{t.pourQui}</p>
                <p class="alliance-choix-clan alliance-clan-fixe mt-1">
                  <Pastille couleur={couleurEdition} />
                  <strong>{edition.tag || t.touteLAlliance}</strong>
                </p>
              </div>
            )}
          </div>

          <fieldset class="alliance-outils-dessin">
            <legend class="text-sm font-semibold">{t.outil}</legend>
            <div class="alliance-boutons-outils">
              {OUTILS.map((o) => (
                <label class="alliance-bouton-outil" data-outil={o.id}>
                  <input type="radio" name="zone-outil" value={o.id} checked={outil === o.id} onChange={() => setOutil(o.id)} />
                  <IconePartie nom={o.icone} classe="alliance-icone-outil" />
                  <span>{t.outils[o.id]}</span>
                </label>
              ))}
            </div>
            <p class="alliance-astuce" aria-live="polite" data-testid="zone-astuce">
              {t.aideOutil[outil]}
            </p>
          </fieldset>

          {tailleVisible && (
            <fieldset class="alliance-outils-dessin">
              <legend class="text-sm font-semibold">{t.taille}</legend>
              <div class="alliance-tailles">
                {TAILLES.map((n, i) => (
                  <label class="alliance-bouton-taille">
                    <input type="radio" name="zone-taille" value={String(n)} checked={taille === n} onChange={() => setTaille(n)} />
                    <i aria-hidden="true" style={{ width: `${0.375 + i * 0.25}rem`, height: `${0.375 + i * 0.25}rem` }}></i>
                    <span>{t.tailles[i]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div class="alliance-ligne">
            <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" disabled={!dessin.annulable} onClick={() => ecran.annulerGeste()} aria-keyshortcuts="Control+Z">
              <span aria-hidden="true">↶</span> {t.annulerGeste}
            </button>
            <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" disabled={dessin.pixels === 0} onClick={() => ecran.effacerTout()}>
              {t.toutEffacer}
            </button>
          </div>

          <div class="alliance-compte" aria-live="polite" data-testid="zone-compte">
            <p>
              <span class="alliance-kpi tnum">{t.nombre(dessin.pixels)}</span>
              <span class="text-muted">{t.pixelsDessines}</span>
            </p>
            {dessin.tropGrand && <p class="form-problem">{t.tropGrand}</p>}
            {dessin.retires > 0 && (
              <p class="carte-aide" data-testid="zone-retires">
                {t.retiresAutreZone(dessin.retires)}
              </p>
            )}
            {apercu && <TableauZone bilan={apercu} t={t} />}
          </div>

          <div>
            <button type="submit" class="btn btn-primary" disabled={busy || dessin.pixels === 0 || dessin.tropGrand || edition.titre.trim().length < 2}>
              {t.enregistrer}
            </button>
          </div>
          <Problem message={erreur} />
          {/* Abandonner perd le dessin : à part, sous un filet, et en deux temps. */}
          <div class="alliance-a-part">
            <EnDeuxTemps busy={busy} texte={t.abandonner} confirmer={t.abandonnerConfirmer} onConfirm={abandonner} />
          </div>
        </form>
      </section>
    );
  }

  return (
    <div data-testid="alliance-zones">
      {!etat && <p class="form-problem">{t.sansEtatZones}</p>}
      {ctx.staff && etat && sansAlliance && <p class="carte-aide">{t.rangerGal}</p>}
      {peutDessiner && etat && !sansAlliance && (
        <button type="button" class="btn btn-primary" onClick={() => commencer(null)} data-testid="zone-nouvelle">
          <span aria-hidden="true">+</span> {t.nouvelleZone}
        </button>
      )}
      {zones.length > 0 && (
        <ul class="alliance-zones">
          {zones.map((z) => {
            const bilan = bilans.get(z.id) ?? null;
            const couleur = couleurDeZone(z.tag, couleursClans);
            const choisie = selection === z.id;
            return (
              <li key={z.id} class="alliance-zone" data-choisie={choisie ? "" : undefined} data-etat={z.state} data-testid="zone">
                <button type="button" class="alliance-zone-tete" aria-expanded={choisie} onClick={() => choisir(choisie ? null : z.id, !choisie)}>
                  <span class="alliance-zone-nom">
                    <Pastille couleur={couleur} />
                    <span>
                      <strong>{z.title}</strong>
                      <span class="alliance-zone-clan">
                        {z.tag ?? t.touteLAlliance}
                        {z.state ? ` · ${t.etats[z.state]}` : ""}
                      </span>
                    </span>
                  </span>
                  {bilan && (
                    <span class="alliance-zone-part tnum">
                      {t.pct(bilan.part)} <span class="alliance-zone-prise">{t.prise}</span>
                    </span>
                  )}
                </button>
                {bilan && <Barre part={bilan.part} couleur={couleur} />}
                {choisie && (
                  <div class="alliance-zone-detail">
                    {bilan && <TableauZone bilan={bilan} t={t} />}
                    {bilan && <Suffisance zone={z} bilan={bilan} ctx={ctx} />}
                    {ctx.evolution?.zones.get(z.id) && (
                      <p class="carte-aide" data-testid="zone-24h">
                        {t.zone24h(ctx.evolution.zones.get(z.id)!.pris, ctx.evolution.zones.get(z.id)!.perdus, t.nombre)}
                      </p>
                    )}
                    <p class="carte-aide">{t.misAJour(t.dateHeure(z.updated_at), z.by)}</p>
                    {ctx.staff && z.state !== undefined && <ReglageZone zone={z} ordre={ordre} relire={ctx.relire} />}
                    {peutModifier(z) && etat && (
                      <div class="alliance-ligne mt-2">
                        <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" onClick={() => commencer(z)}>
                          {t.modifier}
                        </button>
                        <span class="alliance-a-part">
                          <EnDeuxTemps busy={busy} texte={t.supprimer} confirmer={t.confirmerSuppression} aria={t.supprimerAria(z.title)} ariaConfirmer={t.confirmerSuppressionAria(z.title)} onConfirm={() => void supprimer(z.id)} />
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Problem message={erreur} />
      {zones.length > 0 && etat && (
        <p class="carte-aide tnum">
          {t.releve(t.dateHeure(releve.fetchedAt))} {t.regles(t.nombre(NEUTRAL_PIXEL_TROOPS), t.nombre(ENEMY_PIXEL_BASE_TROOPS), t.jour(`${RULES_CHECKED_ON}T12:00:00Z`))} {t.parCapsule(t.nombre(TROOPS_PER_CAP))}
        </p>
      )}
    </div>
  );
}
