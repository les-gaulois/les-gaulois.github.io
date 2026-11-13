/**
 * Les alliances au dernier relevé de la carte : la nôtre en grand (territoire, place, troupes déclarées, puis ses clans en
 * tableau, chacun dans sa couleur), les autres en une ligne chacune. OpenFront ne donne pas les troupes au site : elles sont
 * écrites comme des déclarations, avec leur auteur et leur heure.
 */
import { useState } from "preact/hooks";
import { lireTroupes, troupesDeLAlliance } from "../../../lib/alliance/bilan";
import { call } from "../../../lib/compte/api";
import { Problem, messageIn } from "../../compte/common";
import { Pastille, useTextes, type Contexte, type ModeCouleurs } from "./commun";

/** Une seule déclaration pour tous les clans qu'on peut déclarer : un allié, le sien ; l'encadrement, ceux de notre alliance. */
function Declaration({ clans, ctx }: { clans: string[]; ctx: Contexte }) {
  const t = useTextes();
  const [tag, setTag] = useState(clans[0] ?? "");
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const choisi = clans.includes(tag) ? tag : (clans[0] ?? "");
  const declare = ctx.donnees.troops?.find((d) => d.tag === choisi) ?? null;

  const envoyer = async (troupes: number | null) => {
    setBusy(true);
    setErreur(null);
    try {
      await call("declare_alliance_troops", { p_tag: choisi, p_troops: troupes });
      setTexte("");
      await ctx.relire();
    } catch (e) {
      setErreur(e);
    } finally {
      setBusy(false);
    }
  };

  const nombre = lireTroupes(texte, t.langue);
  return (
    <form
      class="alliance-declarer"
      data-testid="alliance-declarer"
      onSubmit={(e) => {
        e.preventDefault();
        if (nombre !== null) void envoyer(nombre);
      }}
    >
      <p class="font-semibold">{t.declarerTitre}</p>
      <div class="alliance-ligne">
        {clans.length > 1 ? (
          <span class="alliance-champ">
            <label for="troupes-clan" class="text-sm">
              {t.clan}
            </label>
            <select id="troupes-clan" class="field" value={choisi} onChange={(e) => setTag(e.currentTarget.value)}>
              {clans.map((c) => (
                <option value={c}>{c}</option>
              ))}
            </select>
          </span>
        ) : null}
        <span class="alliance-champ alliance-champ-large">
          <label for="troupes-nombre" class="text-sm">
            {clans.length > 1 ? t.troupesAujourdhui : `${choisi} · ${t.troupesAujourdhui}`}
          </label>
          <input id="troupes-nombre" class="field tnum" inputMode="numeric" autocomplete="off" maxLength={17} placeholder={t.nombre(1_500_000)} value={texte} onInput={(e) => setTexte(e.currentTarget.value)} />
        </span>
        <button type="submit" class="btn btn-primary" disabled={busy || nombre === null}>
          {t.declarer}
        </button>
      </div>
      {declare && (
        <div class="alliance-a-part">
          <button type="button" class="btn btn-ghost !min-h-10 !py-1.5 !text-sm" disabled={busy} onClick={() => void envoyer(null)}>
            {t.retirerDeclaration} · {choisi}
          </button>
        </div>
      )}
      <Problem message={erreur === null ? null : messageIn(erreur, t.langue)} />
    </form>
  );
}

export default function AllianceVue({ ctx, mode, setMode }: { ctx: Contexte; mode: ModeCouleurs; setMode: (m: ModeCouleurs) => void }) {
  const t = useTextes();
  const { donnees, totaux, couleursClans } = ctx;
  const ours = donnees.ours ?? null;
  const access = donnees.access;
  const notre = totaux.find((a) => a.id === ours) ?? null;
  const autres = totaux.filter((a) => a.id !== ours).sort((a, b) => a.rang - b.rang);
  const troupes = notre ? troupesDeLAlliance(notre.clans.map((c) => c.tag), donnees.troops ?? []) : null;
  const declarables = notre ? notre.clans.map((c) => c.tag).filter((tag) => ctx.staff || (access.kind === "allie" && access.tag === tag)) : [];

  return (
    <div data-testid="alliance-vue">
      {(
        <div class="alliance-mode" role="group" aria-label={t.couleursCarte}>
          <span class="carte-petit text-muted" aria-hidden="true">
            {t.couleursCarte}
          </span>
          {(["clans", "alliances", "tout"] as const).map((m) => (
            <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "clans" ? t.modeClans : m === "alliances" ? t.modeAlliances : t.modeTout}
            </button>
          ))}
        </div>
      )}

      {notre && troupes && (
        <section class="carte-bloc" aria-labelledby={`alliance-${notre.id}`} data-testid="alliance-carte">
          <h3 id={`alliance-${notre.id}`}>
            <Pastille couleur={notre.color} />
            {notre.name}{" "}
            <span class="alliance-marque">{t.notreAlliance}</span>
          </h3>
          <dl class="alliance-kpis">
            <div>
              <dt>{t.territoire}</dt>
              <dd class="alliance-kpi tnum">{t.nombre(notre.pixels)}</dd>
              <dd class="carte-petit text-muted tnum">
                {t.pixels} · {t.partDesTerres(t.pct(notre.part))}
              </dd>
            </div>
            {totaux.length > 1 && (
              <div>
                <dt>{t.place}</dt>
                <dd class="alliance-kpi tnum">{t.placeSur(notre.rang, totaux.length)}</dd>
              </div>
            )}
            <div>
              <dt>{t.troupesDeclarees}</dt>
              <dd class="alliance-kpi tnum" data-testid="alliance-troupes">
                {troupes.declares > 0 ? t.nombre(troupes.total) : "—"}
              </dd>
              <dd class="carte-petit text-muted">{troupes.declares > 0 ? t.parClans(troupes.declares, troupes.clans) : t.aucuneDeclaration}</dd>
            </div>
          </dl>

          <table class="alliance-table tnum">
            <thead>
              <tr>
                <th scope="col">{t.clan}</th>
                <th scope="col">{t.territoire}</th>
                <th scope="col">{t.troupesDeclarees}</th>
              </tr>
            </thead>
            <tbody>
              {notre.clans.map((c) => {
                const declare = donnees.troops?.find((d) => d.tag === c.tag) ?? null;
                return (
                  <tr>
                    <th scope="row">
                      <Pastille couleur={couleursClans.get(c.tag) ?? 0} />
                      {c.tag}
                    </th>
                    <td>{t.nombre(c.pixels)}</td>
                    <td>
                      {declare ? (
                        <>
                          {t.nombre(declare.troops)}
                          <span class="alliance-table-detail">{t.declarePar(declare.by, t.dateHeure(declare.at))}</span>
                        </>
                      ) : (
                        <span class="text-muted">{t.nonDeclare}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p class="carte-aide">{t.troupesAide}</p>
          {declarables.length > 0 && <Declaration clans={declarables} ctx={ctx} />}
        </section>
      )}

      {autres.length > 0 && (
        <section class="carte-bloc" aria-labelledby="alliance-autres">
          <h3 id="alliance-autres">{t.autresAlliances}</h3>
          <ul class="alliance-autres">
            {autres.map((a) => (
              <li data-testid="alliance-carte">
                <span class="alliance-autres-nom">
                  <Pastille couleur={a.color} />
                  <strong>{a.name}</strong>
                </span>
                <span class="alliance-autres-chiffre tnum">
                  {t.nombre(a.pixels)} <span class="text-muted">{t.pixels}</span>
                </span>
                <span class="alliance-autres-detail text-muted tnum">
                  {t.placeSeule(a.rang)} · {a.clans.map((c) => c.tag).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p class="carte-aide tnum">{t.releve(t.dateHeure(ctx.film.fetchedAt))}</p>
    </div>
  );
}
