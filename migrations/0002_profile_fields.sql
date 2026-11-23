-- Add lightweight claimable profile fields (one-line stance & contact preference)
ALTER TABLE actors ADD COLUMN IF NOT EXISTS one_line_stance TEXT;
ALTER TABLE actors ADD COLUMN IF NOT EXISTS contact_preference TEXT;
