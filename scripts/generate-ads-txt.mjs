import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseAdsensePublisherId } from "../shared/adsensePublisherId.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public", "ads.txt");

const parsed = parseAdsensePublisherId(process.env.VITE_ADSENSE_CLIENT);

if (!parsed) {
  console.warn(
    "[ads.txt] VITE_ADSENSE_CLIENT is missing or invalid — skipped. Use ca-pub-XXXXXXXX or pub-XXXXXXXX on Vercel (Production)."
  );
  process.exit(0);
}

const line = `google.com, ${parsed.pubId}, DIRECT, f08c47fec0942fa0`;
writeFileSync(outPath, `${line}\n`, "utf8");
console.log(`[ads.txt] Wrote ${outPath} (${parsed.pubId})`);
