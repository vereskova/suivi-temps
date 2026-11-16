-- VOLDIS « Location de locaux / Аренда локалей » : le comptable (бухгалтер) reçoit un accès complet,
-- comme rh_admin - plan, mois, banque (confirmation des encaissements), relances, factures/quittances,
-- documents des baux, réglages + Ajax. Policies ADDITIVES (même principe que 0015_comptable_paie_access) :
-- rien n'est retiré à rh_admin. Le lien Powens reste service_role uniquement.

create policy voldis_properties_comptable on voldis_properties for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
create policy voldis_tenants_comptable on voldis_tenants for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
create policy voldis_leases_comptable on voldis_leases for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
create policy voldis_charges_comptable on voldis_charges for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
create policy voldis_bank_tx_comptable on voldis_bank_transactions for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
create policy voldis_settings_comptable on voldis_settings for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
create policy voldis_invoices_comptable on voldis_invoices for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
create policy voldis_documents_comptable on voldis_documents for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');

create policy voldis_documents_storage_comptable on storage.objects for all using (
  bucket_id = 'voldis-documents' and current_role_name() = 'comptable'
) with check (
  bucket_id = 'voldis-documents' and current_role_name() = 'comptable'
);

-- Ajax (codes d'accès / доступы) : l'utilisatrice veut que le comptable ait accès à TOUT VOLDIS, Ajax compris.
create policy voldis_ajax_access_comptable on voldis_ajax_access for all
  using (current_role_name() = 'comptable') with check (current_role_name() = 'comptable');
