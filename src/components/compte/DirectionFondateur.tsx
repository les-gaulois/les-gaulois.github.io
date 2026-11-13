/** L'onglet Fondateur de la Direction, que seul le fondateur voit. */
import { useEffect, useState } from "preact/hooks";
import { call } from "../../lib/compte/api";
import { ROLE_LABELS, type MemberRow, type Role } from "../../lib/compte/types";
import { Loading, Problem, Success, useRun } from "./common";
import { PartieTete } from "./Onglets";

/** Le fondateur transmet son rôle. Il faut retaper le nom : on ne revient pas seul en arrière. */
export default function DirectionFondateur({ onDone }: { onDone: () => Promise<void> }) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [target, setTarget] = useState("");
  const [typed, setTyped] = useState("");
  const { busy, error, done, run } = useRun(onDone);

  useEffect(() => {
    call<{ rows: MemberRow[] }>("list_members", { p_limit: 500 })
      .then((data) => setMembers(data.rows.filter((m) => m.status === "validated" && m.role !== "founder")))
      .catch(() => setMembers([]));
  }, []);

  const chosen = members?.find((m) => m.user_id === target);

  return (
    <section aria-labelledby="founder-title" data-testid="direction-founder">
      <PartieTete id="founder-title" title="Transmettre le rôle de fondateur">
        <p>Vous devenez admin, et seul le nouveau fondateur pourra vous rendre ce rôle.</p>
      </PartieTete>
      <div class="card mt-6 max-w-2xl p-5">
        {members === null ? (
          <Loading />
        ) : members.length === 0 ? (
          <p class="text-muted">Aucun autre membre validé pour l'instant.</p>
        ) : (
          <form
            class="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => call("transfer_founder", { p_user: target }), "Rôle transmis.");
            }}
          >
            <div>
              <label for="heir" class="text-sm font-semibold">
                Nouveau fondateur
              </label>
              <select
                id="heir"
                class="field mt-1"
                required
                value={target}
                onChange={(e) => {
                  setTarget(e.currentTarget.value);
                  setTyped("");
                }}
              >
                <option value="">Choisir un membre</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} ({ROLE_LABELS[m.role as Role]})
                  </option>
                ))}
              </select>
            </div>
            {chosen && (
              <div>
                <label for="heir-confirm" class="text-sm font-semibold">
                  Retapez « {chosen.name} » pour confirmer
                </label>
                <input id="heir-confirm" class="field mt-1" autocomplete="off" value={typed} onInput={(e) => setTyped(e.currentTarget.value)} />
              </div>
            )}
            <div>
              <button type="submit" class="btn btn-ghost" disabled={busy || !chosen || typed !== chosen.name}>
                Transmettre le rôle
              </button>
            </div>
          </form>
        )}
        <Problem message={error} />
        {done && <Success message={done} />}
      </div>
    </section>
  );
}
