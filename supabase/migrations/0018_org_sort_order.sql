-- Manual drag-and-drop ordering of a chantier employee's tile within their
-- team's Organigramme column. NULL means "no manual order set yet" — those
-- employees fall back to alphabetical (by last_name) after everyone who
-- does have an explicit order. Scoped to Organigramme display only — does
-- not affect ordering anywhere else (Paie, Employés, etc.).
alter table employees add column if not exists org_sort_order integer;
