-- Per-item planning window and pricing for the commercial checklist. The
-- original schema (0026) only tracked status/note per line; the commercial
-- team asked for a planned start/end date and a price (HT, with the TTC
-- derived from a per-line VAT rate) on each checklist item, editable inline
-- and shown both on-screen and in the generated documents.
alter table commercial_case_items
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date date,
  add column if not exists price_ht numeric,
  add column if not exists vat_rate numeric not null default 20;
