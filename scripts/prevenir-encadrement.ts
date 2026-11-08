/**
 * Prévient l'encadrement, sur un salon Discord privé, des demandes d'adhésion qui attendent. Lancé par la GitHub Action.
 *   npm run encadrement:prevenir
 * Avec SUPABASE_URL, SUPABASE_SECRET_KEY et DISCORD_WEBHOOK_ENCADREMENT. Sans eux, ne fait rien.
 * Le message ne contient ni nom ni identifiant : voir src/lib/encadrement-discord.ts.
 */
import { createClient } from "@supabase/supabase-js";
import { clan } from "../config/clan";
import { sendStaffNotice, type StaffDigest } from "../src/lib/encadrement-discord";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SECRET_KEY"];
const webhook = process.env["DISCORD_WEBHOOK_ENCADREMENT"];
if (!webhook?.trim()) {
  console.log("Pas de DISCORD_WEBHOOK_ENCADREMENT : rien à envoyer.");
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
