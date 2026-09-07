-- Surface de toiture (m²), saisie une fois par dossier comme puissance/
-- longueur de câble — nécessaire pour auto-remplir "Pose /depose fille sur
-- face" (filet posé sous bac acier, par surface) par correspondance de
-- libellé, la même logique que pour puissance_kwc/longueur_cable_m.
alter table commercial_cases add column if not exists surface_toiture_m2 numeric(8,2);
