-- Add unique constraint for transaction idempotency
-- Only enforces uniqueness when external_id is not null (D1 treats NULLs as distinct)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_external_id
  ON transactions(user_id, external_id);
