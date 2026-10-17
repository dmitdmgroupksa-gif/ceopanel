"""Bridge regressions without a live ERP; native ERP tests still run on staging."""
import importlib.util
import json
import hashlib
import hmac
import pathlib
import sys
import types
import unittest
from unittest.mock import patch

frappe = types.ModuleType("frappe")
frappe.whitelist = lambda **kwargs: lambda fn: fn
frappe.parse_json = lambda value: value
frappe.PermissionError = PermissionError
frappe.DoesNotExistError = KeyError
def fail(message, error=ValueError):
    raise error(message)
frappe.throw = fail
sys.modules["frappe"] = frappe
workflow = types.ModuleType("frappe.model.workflow")
workflow.apply_workflow = workflow.get_transitions = lambda *args: None
sys.modules["frappe.model.workflow"] = workflow
spec = importlib.util.spec_from_file_location("bridge", pathlib.Path(__file__).parents[1] / "ceopanel_bridge" / "api.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class Doc:
    def __init__(self, **values):
        self.values = values
        self.name = values.get("name")
        self.docstatus = values.get("docstatus", 0)
    def get(self, key):
        return self.values.get(key)
    def as_dict(self):
        return dict(self.values)

class DiscoveryTests(unittest.TestCase):
    def test_optional_missing_app_does_not_block_child_schema_discovery(self):
        version_module = types.ModuleType("frappe.utils.change_log")
        version_module.get_versions = lambda: {"frappe": {"version": "fixture"}}
        child = types.SimpleNamespace(fieldname="qty", label="Quantity", fieldtype="Float", options=None, reqd=1, read_only=0, permlevel=0, allow_on_submit=0)
        table = types.SimpleNamespace(fieldname="items", label="Items", fieldtype="Table", options="Sales Order Item", reqd=1, read_only=0, permlevel=0, allow_on_submit=0)
        def get_meta(doctype):
            if doctype == "Missing HR Type":
                raise KeyError(doctype)
            return types.SimpleNamespace(fields=[table] if doctype == "Sales Order" else [child], permissions=[])
        with patch.dict(sys.modules, {"frappe.utils.change_log": version_module}), \
             patch.object(bridge, "authenticated"), \
             patch.object(bridge, "config", return_value={"modules": [{"id": "leave", "doctype": "Missing HR Type"}, {"id": "orders", "doctype": "Sales Order"}]}), \
             patch.object(frappe, "only_for", create=True), \
             patch.object(frappe, "get_list", return_value=[], create=True), \
             patch.object(frappe, "get_meta", side_effect=get_meta, create=True):
            result = bridge.discovery()
        self.assertEqual(result["schemas"]["leave"]["state"], "missing_doctype")
        self.assertEqual(result["schemas"]["orders"]["fields"][0]["fields"][0]["name"], "qty")

class ChildValidationTests(unittest.TestCase):
    fields = [{"name": "items", "type": "table", "fields": [{"name": "quantity", "type": "number"}]}]
    def setUp(self):
        self.row = Doc(name="ROW-1", quantity=2, rate=125, warehouse="Private Warehouse", parent="ORDER-1", parenttype="Sales Order", parentfield="items", docstatus=0)
        self.doc = Doc(items=[self.row])
    def test_partial_edit_preserves_server_owned_and_hidden_child_fields(self):
        result = bridge.checked_values({"items": [{"_row_id": "ROW-1", "quantity": 3}]}, self.fields, self.doc)
        self.assertEqual(result["items"][0], {**self.row.as_dict(), "quantity": 3})
    def test_child_identity_must_belong_to_parent(self):
        with self.assertRaises(PermissionError):
            bridge.checked_values({"items": [{"_row_id": "OTHER", "quantity": 3}]}, self.fields, self.doc)
    def test_duplicate_child_identity_is_rejected(self):
        with self.assertRaises(PermissionError):
            bridge.checked_values({"items": [{"_row_id": "ROW-1"}, {"_row_id": "ROW-1"}]}, self.fields, self.doc)
    def test_read_only_and_system_fields_cannot_be_supplied(self):
        for key in ("name", "flags", "parent", "ignore_permissions"):
            with self.assertRaises(PermissionError):
                bridge.checked_values({key: "changed"}, [{"name": key, "type": "text"}], self.doc)
    def test_invalid_child_rows_are_rejected(self):
        with self.assertRaises(ValueError):
            bridge.checked_values({"items": [None]}, self.fields, self.doc)

class ReportValidationTests(unittest.TestCase):
    def setUp(self):
        self.report_module = types.ModuleType("frappe.desk.query_report")
        sys.modules["frappe.desk.query_report"] = self.report_module
        self.config = {"reports": [{"id": "sales", "erpName": "Verified Sales", "readValidated": True, "companyField": "company", "filters": [{"name": "company", "type": "text", "readOnly": True}]}]}
    def run_report(self, result, filters=None):
        self.report_module.run = lambda *args, **kwargs: result
        with patch.object(bridge, "company_access"), patch.object(bridge, "config", return_value=self.config):
            return bridge.report("sales", "Durar", filters)
    def test_native_total_row_is_separate_from_records(self):
        data = self.run_report({"columns": [{"fieldname": "amount"}], "result": [[10], [20], [30]], "add_total_row": True}, {"company": "Durar"})
        self.assertEqual(data["rows"], [{"amount": 10}, {"amount": 20}])
        self.assertEqual(data["totalRow"], {"amount": 30})
        self.assertEqual(sum(row["amount"] for row in data["rows"]), 30)
    def test_cross_company_report_filter_is_rejected(self):
        with self.assertRaises(PermissionError):
            self.run_report({"columns": [], "result": []}, {"company": "Other"})
    def test_short_report_rows_and_empty_results_are_safe(self):
        self.assertEqual(self.run_report({"columns": [{"fieldname": "amount"}], "result": [[]]})["rows"], [{"amount": None}])
        self.assertEqual(self.run_report({"columns": [], "result": None})["rows"], [])
    def test_company_filters_override_neither_defaults_nor_prepared_snapshots(self):
        def run(name, **kwargs):
            self.assertEqual(kwargs["filters"], {"company": "Durar"})
            self.assertFalse(kwargs["are_default_filters"])
            self.assertTrue(kwargs["ignore_prepared_report"])
            return {"columns": [], "result": []}
        self.report_module.run = run
        with patch.object(bridge, "company_access"), patch.object(bridge, "config", return_value=self.config):
            bridge.report("sales", "Durar")

class DashboardValidationTests(unittest.TestCase):
    def test_company_cannot_be_overridden_and_report_defaults_are_disabled(self):
        report_module = types.ModuleType("frappe.desk.query_report")
        called = []
        def run(name, **kwargs):
            called.append(kwargs)
            return {"ceopanel_dashboard": {"company": "Durar", "dashboardId": "sales"}}
        report_module.run = run
        configuration = {"dashboards": {"sales": {"mappingValidated": True, "roles": ["Manager"], "report": "Verified Sales"}}}
        with patch.dict(sys.modules, {"frappe.desk.query_report": report_module}), patch.object(bridge, "company_access"), patch.object(bridge, "config", return_value=configuration), patch.object(frappe, "get_roles", return_value=["Manager"], create=True):
            with self.assertRaises(PermissionError):
                bridge.dashboard("sales", "Durar", {"company": "Other"})
            self.assertEqual(called, [])
            with self.assertRaises(ValueError):
                bridge.dashboard("sales", "Durar", [])
            bridge.dashboard("sales", "Durar", {"from": "2026-10-01"})
        self.assertEqual(called[0]["filters"], {"from": "2026-10-01", "company": "Durar"})
        self.assertFalse(called[0]["are_default_filters"])
        self.assertTrue(called[0]["ignore_prepared_report"])

class FieldProjectionTests(unittest.TestCase):
    def test_create_permissions_are_projected_for_a_create_only_user(self):
        field = types.SimpleNamespace(fieldtype="Data", read_only=False, allow_on_submit=False)
        meta = types.SimpleNamespace(get_field=lambda name: field)
        with patch.object(frappe, "get_meta", return_value=meta, create=True), patch.object(bridge, "permitted_fields", side_effect=lambda dt, parent=None, permission_type="read": {"title"} if permission_type in ("read", "create") else set()):
            fields = [{"name": "title", "type": "text"}]
            self.assertTrue(bridge.project_fields(fields, "Task")[0]["readOnly"])
            self.assertFalse(bridge.project_fields(fields, "Task", permission_type="create")[0]["readOnly"])

class ExecutionAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.actor, self.company, self.proposal = "manager@example.com", "درر", "proposal-1"
        self.payload = json.dumps({"kind": "create", "module": "customers", "values": {"customer_name": "عميل"}}, ensure_ascii=False, separators=(",", ":"))
        self.timestamp = 1780000000
        signed = {"actor": self.actor, "company": self.company, "payloadHash": hashlib.sha256(self.payload.encode()).hexdigest(), "proposal": self.proposal, "timestamp": self.timestamp}
        signature = hmac.new(b"receipt-test-secret", ("ceopanel.execute.v1:" + json.dumps(signed, ensure_ascii=False, separators=(",", ":"))).encode(), hashlib.sha256).hexdigest()
        self.authorization = {"timestamp": self.timestamp, "signature": signature}
    def verify(self, payload=None, actor=None, now=None, authorization=None):
        with patch.object(frappe, "conf", types.SimpleNamespace(get=lambda key: "receipt-test-secret"), create=True), patch.object(frappe, "session", types.SimpleNamespace(user=actor or self.actor), create=True), patch.object(bridge.time, "time", return_value=now or self.timestamp):
            return bridge.verify_execution_authorization(self.proposal, self.company, payload or self.payload, authorization or self.authorization)
    def test_exact_unicode_payload_and_approver_are_authorized(self):
        self.verify()
    def test_changed_payload_or_erp_actor_is_rejected(self):
        for kwargs in ({"payload": self.payload + " "}, {"actor": "another@example.com"}):
            with self.assertRaises(PermissionError):
                self.verify(**kwargs)
    def test_expired_or_missing_authorization_is_rejected(self):
        for kwargs in ({"now": self.timestamp + 61}, {"authorization": {"signature": "invalid"}}):
            with self.assertRaises(PermissionError):
                self.verify(**kwargs)

if __name__ == "__main__":
    unittest.main()
