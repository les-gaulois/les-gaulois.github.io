/**
 * Les alliances au dernier relevé de la carte : le territoire de chacune, ses clans, et, pour la nôtre, les troupes que
 * ses clans déclarent. OpenFront ne donne pas les troupes au site : elles sont écrites comme des déclarations.
 */
import { useState } from "preact/hooks";
import { lireTroupes, troupesDeLAlliance } from "../../../lib/alliance/bilan";
import { call } from "../../../lib/compte/api";
import { fmtDateTime, fmtInt, fmtPct, fmtRank } from "../../../lib/format";
import { Problem, messageOf } from "../../compte/common";
import { Pastille, type Contexte } from "./commun";

function Declaration({ tag, ctx }: { tag: string; ctx: Contexte }) {
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const declare = ctx.donnees.troops?.find((t) => t.tag === tag) ?? null;

  const envoyer = async (troupes: number | null) => {
    setBusy(true);
    setErreur(null);
    try {
      await call("declare_alliance_troops", { p_tag: tag, p_troops: troupes });
      setTexte("");
      await ctx.relire();
    } catch (e) {
      setErreur(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const nombre = lireTroupes(texte);
  return (
    <form
      class="alliance-declarer"
      onSubmit={(e) => {
        e.preventDefault();
        if (nombre !== null) void envoyer(nombre);
      }}
    >
      <label for={`troupes-${tag}`} class="text-sm font-semibold">
        Troupes de {tag} aujourd'hui
      </label>
      <div class="alliance-ligne">
        <input id={`troupes-${tag}`} class="field" inputMode="numeric" autocomplete="off" maxLength={17} placeholder="1 500 000" value={texte} onInput={(e) => setTexte(e.currentTarget.value)} />
        <button type="submit" class="btn btn-ghost" disabled={busy || nombre === null}>
          Déclarer
        </button>
        {declare && (
          <button type="button" class="btn btn-ghost" disabled={busy} onClick={() => void envoyer(null)}>
            Retirer
          </button>
        )}
      </div>
      <Problem message={erreur} />
    </form>
  );
}

export default function AllianceVue({ ctx, couleursDesClans, setCouleursDesClans }: { ctx: Contexte; couleursDesClans: boolean; setCouleursDesClans: (on: boolean) => void }) {
  const { donnees, totaux } = ctx;
  const ours = donnees.ours ?? null;
  const access = donnees.access;
  // La nôtre d'abord, puis les autres du plus grand territoire au plus petit.
  const ordre = [...totaux].sort((a, b) => (a.id === ours ? -1 : b.id === ours ? 1 : a.rang - b.rang));
  const notre = totaux.find((t) => t.id === ours) ?? null;
  const troupes = notre ? troupesDeLAlliance(notre.clans.map((c) => c.tag), donnees.troops ?? []) : null;
  const peutDeclarer = (tag: string) => ctx.staff || (access.kind === "allie" && access.tag === tag);

  return (
    <div data-testid="alliance-vue">
      <p class="tnum text-muted carte-petit">Territoires au relevé du {fmtDateTime(ctx.film.fetchedAt)}.</p>
      <label class="alliance-option">
        <input type="checkbox" checked={couleursDesClans} onChange={(e) => setCouleursDesClans(e.currentTarget.checked)} />
        Colorer la carte par clan plutôt que par alliance
      </label>

      {ordre.map((a) => (
        <section class="carte-bloc" aria-labelledby={`alliance-${a.id}`} data-testid="alliance-carte">
          <h3 id={`alliance-${a.id}`}>
            <Pastille couleur={a.color} />
            {a.name}
            {a.id === ours && <span class="alliance-marque">notre alliance</span>}
          </h3>
          <p class="carte-chiffre carte-chiffre-sm tnum">{fmtInt(a.pixels)} pixels</p>
          <p class="tnum text-muted carte-petit">
            {totaux.length > 1 ? `${fmtRank(a.rang)} des ${totaux.length} alliances, ` : ""}
            {fmtPct(a.part * 100)} de la terre peinte
          </p>
          <ul class="alliance-clans tnum">
            {a.clans.map((c) => {
              const declare = a.id === ours ? (donnees.troops?.find((t) => t.tag === c.tag) ?? null) : null;
              return (
                <li>
                  <strong>{c.tag}</strong> · {c.pixels > 0 ? `${fmtInt(c.pixels)} pixels` : "aucun pixel"}
                  {a.id === ours && (
                    <span class="text-muted">
                      {" · "}
                      {declare ? `${fmtInt(declare.troops)} troupes déclarées par ${declare.by}, le ${fmtDateTime(declare.at)}` : "troupes : pas de déclaration"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {a.id === ours && troupes && (
            <>
              <p class="mt-3 font-semibold tnum" data-testid="alliance-troupes">
                {troupes.declares === 0
                  ? "Troupes de l'alliance : aucun clan n'en a déclaré."
                  : `Troupes déclarées : ${fmtInt(troupes.total)}, par ${troupes.declares} clan${troupes.declares > 1 ? "s" : ""} sur ${troupes.clans}.`}
              </p>
              <p class="carte-aide">Chaque clan déclare ses troupes lui-même : OpenFront ne les donne pas au site.</p>
              {a.clans.filter((c) => peutDeclarer(c.tag)).map((c) => (
                <Declaration tag={c.tag} ctx={ctx} />
              ))}
            </>
          )}
        </section>
      ))}
    </div>
  );
}
