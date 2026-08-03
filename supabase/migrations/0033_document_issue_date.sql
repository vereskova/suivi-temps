-- Two problems with the upload-time date modal:
-- 1. Carte BTP has no expiry at all — it's a card with a creation date
--    printed on it, nothing to renew. requires_expiry wrongly forced an
--    expiry-date prompt for it.
-- 2. For titre de séjour / passeport / habilitation, the modal only ever
--    asked for the expiry date, which then got used both for valid_until
--    (correct — that's what drives the Échéances overdue tracking) AND for
--    the document's filename (wrong — the filename should reflect when the
--    document was actually issued, not when it stops being valid).
--
-- requires_issue_date is deliberately independent of requires_expiry: a
-- category can ask for an issue date, an expiry date, both, or neither.
alter table document_categories add column if not exists requires_issue_date boolean not null default false;

update document_categories set requires_issue_date = true
  where code in ('titre_visa', 'passeport', 'habilitation', 'carte_btp');

update document_categories set requires_expiry = false where code = 'carte_btp';
