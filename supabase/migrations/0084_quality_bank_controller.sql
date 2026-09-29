-- Second, separate bank — the per-employee БАНК (cap 3000, already in
-- payroll_extras) is each worker's OWN deferred bonus. This one is the
-- COMPANY-WIDE "Банк качества" (cap 10000) fed by controller pénalités:
-- whenever a worker's own БАНК takes a deduction (Контроль 1/2/3), that
-- deducted amount splits 25% straight to the controller's own pay that
-- same month, 75% into this shared pool. When the pool reaches 10000, the
-- 5 workers with (fewest pénalités, most BONUS équipe) over the whole
-- accumulation period split it 30/25/20/15/10%, then the pool resets.
-- Confirmed with the user: one shared company-wide pool (not per équipe),
-- one fixed controller for now (CIOBANU Valeriu), full automation on save.

alter table payroll_extras add column if not exists controle_bonus_recu numeric(9,2) not null default 0;
alter table payroll_extras add column if not exists banque_qualite_prime numeric(9,2) not null default 0;

create table company_quality_bank (
  id uuid primary key default gen_random_uuid(),
  current_total numeric(10,2) not null default 0,
  period_start date not null default current_date,
  updated_at timestamptz not null default now()
);
insert into company_quality_bank (current_total, period_start) values (0, current_date);

create table quality_bank_payouts (
  id uuid primary key default gen_random_uuid(),
  payout_date date not null default current_date,
  total_distributed numeric(10,2) not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now()
);

create table quality_bank_payout_winners (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references quality_bank_payouts(id) on delete cascade,
  employee_id uuid not null references employees(id),
  rank integer not null check (rank between 1 and 5),
  share_pct numeric(4,1) not null,
  amount numeric(9,2) not null,
  total_penalites numeric(10,2) not null,
  total_bonus numeric(10,2) not null
);

create trigger company_quality_bank_set_updated_at before update on company_quality_bank
  for each row execute function set_updated_at();

alter table company_quality_bank enable row level security;
alter table quality_bank_payouts enable row level security;
alter table quality_bank_payout_winners enable row level security;

create policy company_quality_bank_admin_only on company_quality_bank for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy company_quality_bank_comptable on company_quality_bank for all using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);

create policy quality_bank_payouts_admin_only on quality_bank_payouts for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy quality_bank_payouts_comptable on quality_bank_payouts for all using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);

create policy quality_bank_payout_winners_admin_only on quality_bank_payout_winners for all using (
  current_role_name() = 'rh_admin'
) with check (
  current_role_name() = 'rh_admin'
);
create policy quality_bank_payout_winners_comptable on quality_bank_payout_winners for all using (
  current_role_name() = 'comptable'
) with check (
  current_role_name() = 'comptable'
);

grant select, insert, update, delete on company_quality_bank to authenticated, service_role;
grant select, insert, update, delete on quality_bank_payouts to authenticated, service_role;
grant select, insert, update, delete on quality_bank_payout_winners to authenticated, service_role;
