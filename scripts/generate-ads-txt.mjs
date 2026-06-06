import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public", "ads.txt");

const client = (process.env.VITE_ADSENSE_CLIENT || "").trim();
const match = client.match(/^ca-pub-(\d+)$/i);

if (!match) {
  console.warn(
    "[ads.txt] VITE_ADSENSE_CLIENT is missing or invalid — skipped (set ca-pub-… on Vercel for production)."
  );
  process.exit(0);
}

const pubId = `pub-${match[1]}`;
const line = `google.com, ${pubId}, DIRECT, f08c47fec0942fa0`;
writeFileSync(outPath, `${line}\n`, "utf8");
console.log(`[ads.txt] Wrote ${outPath} (${pubId})`);
