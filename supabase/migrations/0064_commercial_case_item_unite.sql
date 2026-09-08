-- Real per-line unit ("toit", "KWC", "semaine"...), separate from Délai
-- prévu — matches how Sinao's real quotes show Quantité/Unité/P.U HT, and
-- feeds the Sinao push's "unity" field instead of the hardcoded "forfait".
alter table commercial_case_items add column if not exists unite text;
