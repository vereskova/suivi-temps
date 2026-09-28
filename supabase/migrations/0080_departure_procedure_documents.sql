-- Optional, detailed départ paperwork — TRARIEUX Vincent's rupture
-- conventionnelle is the trigger: the single generic "Rupture / Sortie"
-- category was never enough to track the real 5-document rupture
-- conventionnelle sequence (convocation, convention, récépissé, portabilité,
-- CERFA) versus the 1-document démission sequence, plus the 3 documents
-- common to both on the actual last day (certificat de travail, solde de
-- tout compte, AER). Deliberately opt-in per registre entry — most active
-- employees have no départ underway, so this must stay invisible until RH
-- picks a procedure for that person's current period.
alter table document_categories add column if not exists departure_procedure text
  check (departure_procedure in ('rupture_conventionnelle', 'demission', 'commun'));

insert into document_categories
  (code, label, sort_order, sensitive, requires_expiry, foreigners_only, per_period, departure_procedure)
values
  ('convocation_entretien',    'Convocation entretien',                                    90, false, false, false, true, 'rupture_conventionnelle'),
  ('convention_rupture',       'Convention de rupture conventionnelle',                    91, false, false, false, true, 'rupture_conventionnelle'),
  ('recepisse_rupture',        'Récépissé de rupture conventionnelle',                     92, false, false, false, true, 'rupture_conventionnelle'),
  ('notification_portabilite', 'Notification portabilité prévoyance et frais de santé',    93, false, false, false, true, 'rupture_conventionnelle'),
  ('cerfa_homologation',       'CERFA — demande d''homologation',                          94, false, false, false, true, 'rupture_conventionnelle'),
  ('lettre_demission',         'Lettre de démission',                                      95, false, false, false, true, 'demission'),
  ('certificat_travail',       'Certificat de travail',                                    96, false, false, false, true, 'commun'),
  ('solde_tout_compte',        'Reçu pour solde de tout compte',                           97, false, false, false, true, 'commun'),
  ('attestation_aer',          'AER (attestation employeur)',                              98, false, false, false, true, 'commun')
on conflict (code) do nothing;

-- Which of the two procedures this employee's current départ follows — null
-- means "no départ procedure started yet", the block stays collapsed behind
-- a "+ Ajouter" prompt in Dossier salarié.
alter table registre_unique_personnel add column if not exists procedure_depart text
  check (procedure_depart in ('rupture_conventionnelle', 'demission'));
