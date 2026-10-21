-- Банк качества : paiement PAR ÉQUIPE (fin janvier / fin septembre), décision du 21/10/2026.
-- Avant : à 10000 €, 5 salariés (30/25/20/15/10 %). Maintenant : sans plafond ; à la date de
-- paiement les équipes sont classées par pénalités, les 3 pires sont exclues, les autres se
-- partagent le pool par rang, puis la part de chaque équipe est répartie entre ses membres au
-- prorata des jours travaillés. On garde la table quality_bank_payout_winners (une ligne par
-- salarié payé) en y ajoutant l'équipe et les jours.
alter table quality_bank_payout_winners drop constraint if exists quality_bank_payout_winners_rank_check;
alter table quality_bank_payout_winners add constraint quality_bank_payout_winners_rank_check check (rank between 1 and 50);
alter table quality_bank_payout_winners alter column share_pct type numeric(5,2);
alter table quality_bank_payout_winners add column if not exists team_id uuid references teams(id);
alter table quality_bank_payout_winners add column if not exists team_name text;
alter table quality_bank_payout_winners add column if not exists days_worked numeric(6,1);
