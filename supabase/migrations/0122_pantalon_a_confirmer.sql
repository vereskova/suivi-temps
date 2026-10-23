-- Tailles / équipement : taille de pantalon provisoire (ex. « L » converti en 46) à faire confirmer par le salarié.
alter table employee_equipment_sizes
  add column if not exists pantalon_a_confirmer boolean not null default false;
