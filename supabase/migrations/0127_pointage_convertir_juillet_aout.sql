-- À EXÉCUTER SÉPARÉMENT, après 0126 et après l'envoi du courrier à l'inspection.
-- Convertit les lignes « propres » (fin 17:00 + H. supp à part) vers « vraie fin » :
-- fin = 17:00 + H. supp, total_minutes inchangé. Les lignes atypiques ne sont pas touchées.
-- Vérification avant/après : voir la requête en bas (les deux sommes doivent être égales).

update pointage_entries
set end_time = end_time + make_interval(mins => overtime_minutes),
    end_includes_overtime = true
where not is_absent
  and not end_includes_overtime
  and start_time is not null
  and end_time = time '17:00'
  and overtime_minutes > 0
  and overtime_minutes <= 360
  and coalesce(pause_minutes, 0) <= 120
  and work_date >= date '2026-07-01' and work_date < date '2026-09-01';

-- Contrôle (doit afficher 0 ligne) : total modifié ?
-- select count(*) from pointage_entries where end_includes_overtime and total_minutes <>
--   (extract(epoch from (end_time - start_time))/60)::int - coalesce(pause_minutes,0);
