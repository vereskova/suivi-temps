-- Lets a visit include a one-off checklist item beyond the 20 standard
-- components (e.g. something specific to that repair), without polluting
-- vehicle_maintenance_components — the fixed reference list every future
-- visit's checklist starts from. component_code becomes optional; a custom
-- item carries its own free-text label instead. Multiple NULL
-- component_code rows per visit are fine — Postgres treats NULLs as
-- distinct for the existing unique (visit_id, component_code) constraint.
alter table vehicle_maintenance_visit_items alter column component_code drop not null;
alter table vehicle_maintenance_visit_items add column if not exists custom_label text;
alter table vehicle_maintenance_visit_items add constraint vehicle_maintenance_visit_items_code_or_label
  check (component_code is not null or custom_label is not null);
