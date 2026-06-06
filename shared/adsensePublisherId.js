/**
 * Accept AdSense publisher IDs as ca-pub-… or pub-… (quotes stripped).
 * @param {string | undefined | null} raw
 * @returns {{ caClient: string, pubId: string } | null}
 */
export function parseAdsensePublisherId(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!value) return null;

  let match = value.match(/^ca-pub-(\d+)$/i);
  if (match) {
    return { caClient: `ca-pub-${match[1]}`, pubId: `pub-${match[1]}` };
  }

  match = value.match(/^pub-(\d+)$/i);
  if (match) {
    return { caClient: `ca-pub-${match[1]}`, pubId: `pub-${match[1]}` };
  }

  return null;
}
