-- Adds the "classe" (coefficient) sub-field of the convention collective classification,
-- shown alongside "classification" (groupe d'emploi, A-I) on the bulletin de paie —
-- e.g. "Groupe : A" / "Classe : 1". `classification` alone drives préavis computation
-- (lib/documents/preavis.ts expects a bare A-I letter); `classe` is display-only, surfaced
-- in generated contracts for legal/professional completeness.
alter table employees add column if not exists classe text;
