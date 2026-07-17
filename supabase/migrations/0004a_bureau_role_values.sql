-- Run this FIRST, on its own, before 0004b — Postgres won't let ALTER TYPE ...
-- ADD VALUE run in the same multi-statement batch as other DDL.
alter type bureau_role add value if not exists 'hotel';
alter type bureau_role add value if not exists 'depot';
alter type bureau_role add value if not exists 'formation_officer';
alter type bureau_role add value if not exists 'marketing';
