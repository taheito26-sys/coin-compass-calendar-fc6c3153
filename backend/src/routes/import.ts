import { Hono } from "hono";
import type { Env } from "../types";
import { authMiddleware } from "../middleware/auth";

type LookupBody = {
  fingerprint_hashes?: string[];
  native_ids?: string[];
};

type RecordBody = {
  file_name: string;
  file_hash: string;
  source_exchange: string;
  source_export_type: string;
  parsed_count: number;
  accepted_new_count: number;
  already_imported_count: number;
  warning_count: number;
  invalid_count: number;
  conflict_count: number;
  persisted_count: number;
  failed_count: number;
  rows: Array<{
    source_row_index: number;
    status: string;
    message?: string | null;
    fingerprint_hash?: string | null;
    native_id?: string | null;
    canonical_json?: string | null;
    transaction_id?: string | null;
  }>;
};

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use("/*", authMiddleware);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** POST /api/import/lookup */
app.post("/lookup", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<LookupBody>();

  const fpHashes = (body.fingerprint_hashes || []).filter(Boolean);
  const nativeIds = (body.native_ids || []).filter(Boolean);

  const existingFingerprints: Record<string, { native_id: string | null; canonical_json: string | null }> = {};
  const existingByNativeId: Record<string, { fingerprint_hash: string; canonical_json: string | null }> = {};

  // D1 binding limits: chunk requests
  for (const ch of chunk(fpHashes, 100)) {
    const placeholders = ch.map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT fingerprint_hash, native_id, canonical_json FROM import_row_fingerprints WHERE user_id = ? AND fingerprint_hash IN (${placeholders})`,
    )
      .bind(userId, ...ch)
      .all<{ fingerprint_hash: string; native_id: string | null; canonical_json: string | null }>();

    for (const r of results || []) {
      existingFingerprints[r.fingerprint_hash] = { native_id: r.native_id ?? null, canonical_json: r.canonical_json ?? null };
    }
  }

  for (const ch of chunk(nativeIds, 100)) {
    const placeholders = ch.map(() => "?").join(",");
    const { results } = await c.env.DB.prepare(
      `SELECT native_id, fingerprint_hash, canonical_json FROM import_row_fingerprints WHERE user_id = ? AND native_id IN (${placeholders})`,
    )
      .bind(userId, ...ch)
      .all<{ native_id: string; fingerprint_hash: string; canonical_json: string | null }>();

    for (const r of results || []) {
      if (!r.native_id) continue;
      existingByNativeId[r.native_id] = { fingerprint_hash: r.fingerprint_hash, canonical_json: r.canonical_json ?? null };
    }
  }

  return c.json({ existingFingerprints, existingByNativeId });
});

/** POST /api/import/record */
app.post("/record", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<RecordBody>();

  if (!body.file_name || !body.file_hash) return c.json({ error: "Missing file_name or file_hash" }, 400);
  if (!Array.isArray(body.rows)) return c.json({ error: "rows must be an array" }, 400);

  const batchId = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO import_batches (id, user_id, file_name, file_hash, source_exchange, source_export_type, parsed_count, accepted_new_count, already_imported_count, warning_count, invalid_count, conflict_count, persisted_count, failed_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      batchId,
      userId,
      body.file_name,
      body.file_hash,
      body.source_exchange ?? null,
      body.source_export_type ?? null,
      body.parsed_count ?? 0,
      body.accepted_new_count ?? 0,
      body.already_imported_count ?? 0,
      body.warning_count ?? 0,
      body.invalid_count ?? 0,
      body.conflict_count ?? 0,
      body.persisted_count ?? 0,
      body.failed_count ?? 0,
    )
    .run();

  // Insert rows (audit)
  const now = new Date().toISOString();
  for (const row of body.rows.slice(0, 20_000)) {
    await c.env.DB.prepare(
      `INSERT INTO import_rows (id, batch_id, user_id, source_row_index, status, message, fingerprint_hash, native_id, canonical_json, transaction_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        batchId,
        userId,
        row.source_row_index ?? 0,
        row.status ?? "unknown",
        row.message ?? null,
        row.fingerprint_hash ?? null,
        row.native_id ?? null,
        row.canonical_json ?? null,
        row.transaction_id ?? null,
        now,
      )
      .run();

    // Persist fingerprints only when a transaction was actually created
    if (row.transaction_id && row.fingerprint_hash) {
      try {
        await c.env.DB.prepare(
          `INSERT INTO import_row_fingerprints (id, user_id, fingerprint_hash, native_id, source_exchange, source_export_type, canonical_json, transaction_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            crypto.randomUUID(),
            userId,
            row.fingerprint_hash,
            row.native_id ?? null,
            body.source_exchange ?? null,
            body.source_export_type ?? null,
            row.canonical_json ?? null,
            row.transaction_id,
            now,
          )
          .run();
      } catch {
        // ignore duplicates (idempotent)
      }
    }
  }

  return c.json({ ok: true, batch_id: batchId }, 201);
});

export default app;
