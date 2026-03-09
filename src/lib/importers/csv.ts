import Papa from "papaparse";

/**
 * Production CSV parser (supports quoted fields, newlines in quotes, BOM, etc.)
 *
 * NOTE: We intentionally keep everything as strings; exchange adapters handle
 * numeric parsing + normalization.
 */
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleaned = text.replace(/^\uFEFF/, "");

  const parsed = Papa.parse<Record<string, unknown>>(cleaned, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => String(h ?? "").replace(/^\uFEFF/, "").trim(),
  });

  const headers = (parsed.meta.fields ?? []).map((h) => String(h).trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];

  for (const row of parsed.data ?? []) {
    if (!row || typeof row !== "object") continue;
    const out: Record<string, string> = {};
    for (const h of headers) {
      const v = (row as Record<string, unknown>)[h];
      out[h] = v == null ? "" : String(v);
    }
    rows.push(out);
  }

  return { headers, rows };
}

/** SHA-256 hex digest (used for file hashes and import fingerprints) */
export async function hashString(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Back-compat alias */
export const hashFile = hashString;
