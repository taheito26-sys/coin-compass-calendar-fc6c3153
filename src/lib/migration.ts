/**
 * migration.ts
 *
 * One-time migration of legacy localStorage business data to backend D1.
 * Safe and idempotent — checks migration marker before running.
 */

import type { CryptoTx, ImportedFile } from "./cryptoState";
import { hasLegacyData, markMigrationComplete } from "./cryptoState";
import {
  batchCreateTransactions,
  createImportedFile,
  isWorkerConfigured,
  type CreateTransactionInput,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetId, resolveAssetSymbol } from "@/lib/assetResolver";

export interface MigrationResult {
  migrated: boolean;
  txsMigrated: number;
  txsFailed: number;
  filesMigrated: number;
  errors: string[];
}

/**
 * Attempt to migrate legacy localStorage data to backend.
 * Returns null if no migration needed.
 */
export async function runMigration(): Promise<MigrationResult | null> {
  if (!isWorkerConfigured()) return null;

  const legacy = hasLegacyData();
  if (!legacy) return null;

  const result: MigrationResult = {
    migrated: false,
    txsMigrated: 0,
    txsFailed: 0,
    filesMigrated: 0,
    errors: [],
  };

  try {
    const assets = await getAssetCatalog(true);

    // Build transaction inputs from legacy txs
    const txInputs: CreateTransactionInput[] = [];
    for (const tx of legacy.txs) {
      const symbol = resolveAssetSymbol(tx.asset || "");
      if (!symbol) {
        result.errors.push(`Skipped tx: invalid asset "${tx.asset}"`);
        result.txsFailed++;
        continue;
      }

      const { assetId } = resolveAssetId(symbol, assets);
      if (!assetId) {
        result.errors.push(`Skipped tx: no D1 asset for "${symbol}"`);
        result.txsFailed++;
        continue;
      }

      const ts = Number(tx.ts);
      if (!Number.isFinite(ts) || ts <= 0) {
        result.errors.push(`Skipped tx: invalid timestamp`);
        result.txsFailed++;
        continue;
      }

      txInputs.push({
        asset_id: assetId,
        timestamp: new Date(ts).toISOString(),
        type: tx.type || "buy",
        qty: Math.abs(Number(tx.qty) || 0),
        unit_price: Number(tx.price) || 0,
        fee_amount: Number(tx.fee) || 0,
        fee_currency: tx.feeAsset || "USD",
        venue: undefined,
        note: tx.note || "Migrated from local storage",
        source: "migration",
      });
    }

    // Batch create transactions (up to 500 at a time)
    if (txInputs.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < txInputs.length; i += batchSize) {
        const batch = txInputs.slice(i, i + batchSize);
        try {
          const batchResult = await batchCreateTransactions(batch);
          result.txsMigrated += batchResult.created;
          result.txsFailed += batchResult.errors;
          if (batchResult.errorDetails.length > 0) {
            result.errors.push(...batchResult.errorDetails);
          }
        } catch (err: any) {
          result.errors.push(`Batch failed: ${err.message}`);
          result.txsFailed += batch.length;
        }
      }
    }

    // Migrate imported files
    for (const file of legacy.importedFiles) {
      try {
        await createImportedFile({
          file_name: file.name,
          file_hash: file.hash,
          exchange: file.exchange,
          export_type: file.exportType,
          row_count: file.rowCount,
        });
        result.filesMigrated++;
      } catch (err: any) {
        // 409 = duplicate, which is fine
        if (err.message?.includes("409") || err.message?.includes("duplicate")) {
          result.filesMigrated++;
        } else {
          result.errors.push(`File migration failed: ${file.name} - ${err.message}`);
        }
      }
    }

    // Mark migration complete even if some items failed
    markMigrationComplete();
    result.migrated = true;

    return result;
  } catch (err: any) {
    result.errors.push(`Migration error: ${err.message}`);
    return result;
  }
}
