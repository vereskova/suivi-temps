-- Free-form single badge per employee (emoji + short label), independent of
-- the team-chef crown — e.g. "🚗 Permis B", "🎓 Nouveau", "🗣️ Parle français".
-- Only one active at a time by design (no separate badges table needed).
alter table employees add column if not exists badge_emoji text;
alter table employees add column if not exists badge_label text;
