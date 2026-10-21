DROP INDEX one_pending_source_approval;
CREATE UNIQUE INDEX one_pending_source_approval ON finance_approvals(kind,source_id) WHERE status='pending' OR (kind<>'vendor_payment' AND status='approved');
