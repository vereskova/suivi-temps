-- VOLDIS : rattacher un mouvement bancaire à un locataire même sans échéance correspondante
-- (ex. loyers payés mais jamais saisis dans Rentila, dépôts, remboursements). Sert aussi à
-- « apprendre » : les mouvements déjà rattachés servent de modèle pour proposer le locataire des suivants.
alter table voldis_bank_transactions add column if not exists tenant_id uuid references voldis_tenants(id) on delete set null;
create index if not exists voldis_bank_tx_tenant_idx on voldis_bank_transactions (tenant_id);
