/**
 * Contrôle les salons Discord du robot à chaque passage, sans rien poster, lancé par la GitHub Action.
 *   npm run salons:verifier
 * Avec SUPABASE_URL et SUPABASE_SECRET_KEY : les liens réglés dans la Direction, et le contrôle noté pour elle.
 * Sans réglage, les secrets DISCORD_WEBHOOK_GAZETTE et DISCORD_WEBHOOK_ENCADREMENT. Voir src/lib/salon-lien.ts.
 */
import { checkSalons } from "../src/lib/salon-lien";

try {
  if (!(await checkSalons({ env: process.env, fetch, log: console.log }))) process.exitCode = 1;
} catch (e) {
  // Le message d'une erreur ne contient jamais de lien : il est retiré au cas où.
  console.log(`::warning::Salons Discord : ${(e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "…")}`);
  process.exitCode = 1;
}
