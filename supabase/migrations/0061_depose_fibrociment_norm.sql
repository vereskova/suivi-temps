-- The source table's "Depose Fibrociment" cell (280m) had no jours value —
-- left deliberately unmapped until now. The user has since given the real
-- figure directly: 200m -> 1 jour (single measured point, like Pose/Dépose
-- Bac acier and Démonter panneau — no second point to derive a rate from).
-- Purely a reference value: no checklist line exists for this, and the
-- checklist item set is fixed (no new lines get added), so it's not wired
-- into computeDelaiFills like the others.
insert into commercial_duration_norms (code, label, label_ru, unit, mode, checklist_hint, position) values
  ('depose_fibrociment', 'Dépose Fibrociment', 'Dépose Fibrociment', 'm', 'step',
   'Valeur de référence uniquement — aucune ligne de checklist pour ce poste.', 11);

insert into commercial_duration_norm_points (norm_id, x, y, position)
select id, 200, 1, 1 from commercial_duration_norms where code = 'depose_fibrociment';
