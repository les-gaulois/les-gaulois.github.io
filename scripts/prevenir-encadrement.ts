/**
 * Prévient l'encadrement, sur un salon Discord privé, des demandes d'adhésion qui attendent. Lancé par la GitHub Action.
 *   npm run encadrement:prevenir
 * Avec SUPABASE_URL, SUPABASE_SECRET_KEY et le lien du salon de l'encadrement, réglé dans Direction > Discord, sinon le
 * secret DISCORD_WEBHOOK_ENCADREMENT. Sans eux, ne fait rien.
 * Le message ne contient ni nom ni identifiant : voir src/lib/encadrement-discord.ts.
 */
import { createClient } from "@supabase/supabase-js";
import { clan } from "../config/clan";
import { sendStaffNotice, type StaffDigest } from "../src/lib/encadrement-discord";
import { salonLink } from "../src/lib/salon-lien";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
// Le lien réglé dans la Direction, sinon le secret DISCORD_WEBHOOK_ENCADREMENT : voir src/lib/salon-lien.ts.
const { link: webhook, warning: linkWarning } = await salonLink("encadrement");
if (linkWarning) console.log(`Encadrement : ${linkWarning}.`);
if (!webhook) {
  console.log("Pas de lien pour le salon de l'encadrement, ni dans la Direction ni dans DISCORD_WEBHOOK_ENCADREMENT : rien à envoyer.");
  process.exit(0);
}
if (!url || !key) {
  console.log("Pas de SUPABASE_URL ou de SUPABASE_SECRET_KEY : rien à faire.");
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const { data, error } = await sb.rpc("staff_digest");
  if (error) throw new Error(`staff_digest : ${error.message}`);
  const result = await sendStaffNotice({
    webhook,
    digest: data as StaffDigest,
    now: new Date(),
    siteUrl: clan.links.site,
    fetch,
    log: console.log,
    note: async (state) => {
      const { error: noteError } = await sb.rpc("note_staff_notice", { p_newest_id: state.newest_id, p_reminded_at: state.reminded_at });
      if (noteError) throw new Error(`note_staff_notice : ${noteError.message}`);
    },
  });
  if (result === "failed" || result === "invalid") process.exitCode = 1;
} catch (e) {
  console.log(`::warning::Encadrement : ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
