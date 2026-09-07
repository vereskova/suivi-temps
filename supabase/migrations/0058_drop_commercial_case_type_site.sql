-- type_site (from 0057) was a manual per-dossier "type de site" selector.
-- Turned out to be the wrong model: the norms table's categories are
-- actual clients (Agricole/HML, Advanced Energie/LT/Feedgy), and "ombrière"
-- isn't a site type to pick at all — Pose SI/Pose PPV simply auto-fill
-- whenever the dossier's checklist happens to contain those lines. No code
-- reads this column any more.
alter table commercial_cases drop column if exists type_site;
