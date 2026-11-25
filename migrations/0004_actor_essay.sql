-- Allow standalone profiles to store a Markdown written position before or alongside a flowchart
ALTER TABLE actors ADD COLUMN IF NOT EXISTS essay_markdown TEXT;
