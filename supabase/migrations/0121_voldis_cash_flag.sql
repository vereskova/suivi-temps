-- VOLDIS : отметка "получено наличными" у платежа (Remy и другие, не проходят через банк).
alter table voldis_charges add column if not exists paid_cash boolean not null default false;
