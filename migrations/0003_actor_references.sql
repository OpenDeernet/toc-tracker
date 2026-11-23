-- Add Influences & Key Reading links onto Actor profiles
ALTER TABLE actors ADD COLUMN IF NOT EXISTS references_json JSONB NOT NULL DEFAULT '[]'::jsonb;
