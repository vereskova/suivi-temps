-- Убраны старые нормы (досье по клиентам), которые заменены таблицами из письма planning@vladis.fr от 11/11/2026
-- (mo_standard / mo_lt / mo_ombriere, rate_*, tirage_cable, securite_collective, filet_sur_face).
-- Точки норм удаляются каскадом. Идемпотентно.
delete from commercial_duration_norms
  where code in ('main_doeuvre_standard', 'main_doeuvre_ombriere', 'pose_bac_acier', 'depose_bac_acier', 'demontage_panneau', 'depose_fibrociment');
