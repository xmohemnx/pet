ALTER TABLE finance_approvals DROP CONSTRAINT finance_approvals_kind_source_id_key;
CREATE UNIQUE INDEX one_pending_source_approval ON finance_approvals(kind,source_id) WHERE kind<>'vendor_payment' OR status='pending';
ALTER TABLE purchase_orders ADD UNIQUE(id,clinic_id),
 ADD CHECK(status='ordered' OR received_quantity=quantity),ADD CHECK(status<>'paid' OR paid_minor=quantity*unit_cost);
ALTER TABLE inventory_layers ADD UNIQUE(id,clinic_id);
ALTER TABLE purchase_receipts ADD FOREIGN KEY(po_id,clinic_id) REFERENCES purchase_orders(id,clinic_id),ADD FOREIGN KEY(layer_id,clinic_id) REFERENCES inventory_layers(id,clinic_id);
ALTER TABLE vendor_payments ADD FOREIGN KEY(po_id,clinic_id) REFERENCES purchase_orders(id,clinic_id);
ALTER TABLE inventory_requests ADD FOREIGN KEY(layer_id,clinic_id) REFERENCES inventory_layers(id,clinic_id),ADD CHECK(status='pending' OR approved_by IS NOT NULL);
ALTER TABLE inventory_transfers ADD FOREIGN KEY(source_layer,clinic_id) REFERENCES inventory_layers(id,clinic_id),ADD FOREIGN KEY(target_layer,clinic_id) REFERENCES inventory_layers(id,clinic_id);
CREATE FUNCTION guard_inventory_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inventory request is permanent' USING ERRCODE='23514'; END IF;
 IF OLD.status<>'pending' OR (to_jsonb(NEW)-'status'-'approved_by') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'approved_by') THEN
 RAISE EXCEPTION 'Inventory request is immutable after decision' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER inventory_request_integrity BEFORE UPDATE OR DELETE ON inventory_requests FOR EACH ROW EXECUTE FUNCTION guard_inventory_request();
