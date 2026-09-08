-- Real quantity per checklist line, alongside unite (0064): price_ht is now
-- read as the UNIT price HT ("prix unitaire HT"), Total HT = quantite ×
-- price_ht — computed in the app, never stored. Every existing row keeps
-- exactly its current total since quantite defaults to 1.
alter table commercial_case_items add column if not exists quantite numeric not null default 1;
