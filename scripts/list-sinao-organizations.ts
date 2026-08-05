/**
 * One-off diagnostic: dumps every organization Sinao knows about (id + name)
 * so we can build an explicit correspondence table between our
 * commercial_clients names and the real Sinao contact each one should push
 * to — instead of relying on fuzzy name search at push time, which can
 * silently match the wrong company or create a duplicate when the names
 * don't line up exactly (e.g. our "Mateos" vs Sinao's "MATEOS ELECTRICITE").
 *
 * Usage:
 *   SINAO_API_KEY=... SINAO_APP_ID=... npx tsx scripts/list-sinao-organizations.ts
 *
 * Prints "id\tname" for every organization, sorted by name. Read-only —
 * makes no changes in Sinao or in our database.
 */

const apiKey = process.env.SINAO_API_KEY;
const appId = process.env.SINAO_APP_ID;

if (!apiKey || !appId) {
  console.error("Missing SINAO_API_KEY or SINAO_APP_ID environment variables.");
  process.exit(1);
}

type SinaoOrganization = { id: number; name: string };

async function main() {
  const res = await fetch(`https://api.sinao.app/v1/apps/${appId}/organizations?limit=1000`, {
    headers: { "Api-Key": apiKey!, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`Sinao API error ${res.status}:`, body);
    process.exit(1);
  }
  const items: SinaoOrganization[] = Array.isArray(body) ? body : (body?.data ?? []);
  items
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((o) => console.log(`${o.id}\t${o.name}`));
  console.log(`\n${items.length} organisation(s) au total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
