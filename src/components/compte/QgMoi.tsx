import { basePath } from "../../lib/compte/api";
import { memberOfPseudo, type QgTools } from "../../lib/compte/outils";
import { fmtDayAndTime, fmtInt } from "../../lib/format";
import type { StoredMembers } from "../../lib/schemas";
import type { ClanWeekFile } from "../../lib/semaine-du-clan";
import { Result } from "../MyPlace";
import { Loading } from "./common";
import { PartieTete } from "./Onglets";

/**
 * « Moi » : sa place dans le clan sans taper son pseudo, puisque le site connaît déjà le membre. Le pseudo vient du serveur
 * (le pseudo d'aujourd'hui dans la liste officielle, `get_qg_tools`) ; les chiffres, des données publiques du site, comme
 * « Ma place dans le clan » de l'accueil. `undefined` : en lecture ; `null` : fichier illisible.
 */
export default function QgMoi({ me, members, file }: { me: QgTools["me"]; members: StoredMembers | null | undefined; file: ClanWeekFile | null | undefined }) {
  const base = basePath();
  const member = members ? memberOfPseudo(members.members, me.pseudo) : null;
  const gained = member?.publicId && file?.gains ? file.gains.wins[member.publicId] : undefined;

  let body;
  if (me.pseudo === null) {
    body = (
      <p class="card mt-6 max-w-3xl p-5" data-testid="qg-moi-absent">
        Le site ne trouve pas votre pseudo dans la liste du clan. <a href={`${base}/compte`}>Mon compte</a>
      </p>
    );
  } else if (members === undefined) {
    body = (
      <div class="mt-6">
        <Loading />
      </div>
    );
  } else if (members === null || member === null) {
    body = <p class="card mt-6 max-w-3xl p-5 text-muted [overflow-wrap:anywhere]">{me.pseudo} : pas de données pour ce membre.</p>;
  } else {
    body = (
      <div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div class="card p-5">
          <Result members={members.members} member={member} />
        </div>
        <div class="grid gap-4">
          {gained !== undefined && file?.gains && (
            <div class="card p-5" data-testid="qg-moi-semaine">
              <p class="text-sm font-semibold text-muted">Cette semaine</p>
              <p class="console-valeur font-display text-4xl font-extrabold tnum">
                +{fmtInt(gained)} <span class="text-xl text-muted">{gained > 1 ? "victoires" : "victoire"}</span>
              </p>
              <p class="tnum mt-1 text-sm text-muted">
                Depuis le relevé du {fmtDayAndTime(file.gains.since)}, jusqu'au {fmtDayAndTime(file.gains.until)}.
              </p>
            </div>
          )}
          {me.gg > 0 && (
            <div class="card p-5" data-testid="qg-moi-gg">
              <p class="text-sm font-semibold text-muted">GG reçus cette semaine</p>
              <p class="console-valeur font-display text-4xl font-extrabold tnum">{me.gg}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="moi-titre" data-testid="qg-moi">
      <PartieTete id="moi-titre" title="Ma place dans le clan" />
      {body}
    </section>
  );
}
