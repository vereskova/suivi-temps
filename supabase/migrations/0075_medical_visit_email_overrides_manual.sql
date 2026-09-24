-- A Prevaly convocation/annulation e-mail can now overwrite a hand-entered
-- next_visit_date (previously it never did — see 0069). To keep that
-- silent-for-RH, this records what the manual value was right before an
-- e-mail replaced it, so the UI can flag it instead of hiding the change.
alter table medical_visits add column if not exists next_visit_replaced_manual_date date;
alter table medical_visits add column if not exists next_visit_replaced_manual_time time;
