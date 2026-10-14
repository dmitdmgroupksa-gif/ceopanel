"""Install on staging first. A matching ceopanel_config in site_config.json is required.
No ignore_permissions flags, arbitrary methods, SQL reports, or model supplied DocTypes.
"""
import json
import hashlib
import hmac
from datetime import datetime
import frappe
from frappe.model.workflow import apply_workflow, get_transitions


def config():
    value = frappe.conf.get("ceopanel_config") or {}
    return json.loads(value) if isinstance(value, str) else value


def authenticated():
    if frappe.session.user == "Guest":
        frappe.throw("Sign in required", frappe.PermissionError)


def company_access(company):
    authenticated()
    if not company or not frappe.has_permission("Company", "read", doc=company):
        frappe.throw("Company access denied", frappe.PermissionError)


def mapping(module, company, write=False):
    company_access(company)
    found = next((m for m in config().get("modules", []) if m["id"] == module), None)
    if not found or not found.get("readValidated") or (write and not found.get("writeValidated")):
        frappe.throw("Module awaits validation", frappe.PermissionError)
    return found


def permitted_fields(doctype, parenttype=None, permission_type="read"):
    return set(frappe.get_meta(doctype).get_permitted_fieldnames(parenttype=parenttype, user=frappe.session.user, permission_type=permission_type))


def project_fields(fields, doctype, parenttype=None):
    allowed = permitted_fields(doctype, parenttype)
    writable = permitted_fields(doctype, parenttype, "write")
    result = []
    meta = frappe.get_meta(doctype)
    for field in fields:
        df = meta.get_field(field["name"])
        if field["name"] not in allowed or not df or df.fieldtype in ("Password", "Attach", "Attach Image"):
            continue
        item = dict(field)
        item["readOnly"] = bool(item.get("readOnly") or df.read_only or field["name"] not in writable)
        item["allowOnSubmit"] = bool(item.get("allowOnSubmit") and df.allow_on_submit)
        if df.fieldtype == "Table":
            item["fields"] = project_fields(field.get("fields", []), df.options, parenttype or doctype)
        result.append(item)
    return result


def load_doc(m, name, company, perm="read", expected=None):
    doc = frappe.get_doc(m["doctype"], name)
    doc.check_permission(perm)
    if m.get("companyField") and doc.get(m["companyField"]) != company:
        frappe.throw("Record company mismatch", frappe.PermissionError)
    if expected and str(doc.modified) != expected:
        frappe.throw("Record changed; reload before continuing", frappe.TimestampMismatchError)
    return doc


def values_for(doc, fields):
    result = {}
    for f in fields:
        value = doc.get(f["name"])
        result[f["name"]] = [dict(values_for(row, f.get("fields", [])), _row_id=row.name) for row in value or []] if f["type"] == "table" else bool(value) if f["type"] == "check" else value
    return result


def envelope(doc, fields):
    allowed = set(next((m.get("workflowActions", []) for m in config().get("modules", []) if m["doctype"] == doc.doctype), []))
    transitions = get_transitions(doc) if allowed else []
    return {"name": doc.name, "modified": str(doc.modified), "docstatus": doc.docstatus, "values": values_for(doc, fields), "workflowActions": [t.action for t in transitions if t.action in allowed]}


@frappe.whitelist()
def csrf():
    authenticated()
    from frappe.sessions import get_csrf_token
    return get_csrf_token()


@frappe.whitelist()
def roles():
    authenticated()
    return frappe.get_roles(frappe.session.user)


@frappe.whitelist()
def schema(module, company):
    m = mapping(module, company)
    meta = frappe.get_meta(m["doctype"])
    fields = project_fields(m.get("fields", []), m["doctype"])
    # Get permissions server-side. Record-specific checks still run on every read/write.
    permissions = {key: bool(frappe.has_permission(m["doctype"], perm)) for key, perm in (("read", "read"), ("create", "create"), ("edit", "write"), ("submit", "submit"), ("cancel", "cancel"))}
    for key in ("create", "edit", "submit", "cancel"):
        permissions[key] = permissions[key] and bool(m.get("writeValidated"))
    if frappe.db.exists("Workflow", {"document_type": m["doctype"], "is_active": 1}):
        permissions["submit"] = permissions["cancel"] = False
    return {"module": {k: m.get(k) for k in ("id", "title", "doctype", "description", "custom")}, "ready": True, "fields": fields, "columns": [{"key": "name", "label": "Record"}] + [{"key": f["name"], "label": f["label"]} for f in fields if f["type"] != "table"][:5], "permissions": permissions, "companyField": m.get("companyField"), "submittable": bool(meta.is_submittable), "workflowActions": m.get("workflowActions", []) if m.get("writeValidated") else []}


@frappe.whitelist()
def records(module, company, search="", offset=0, limit=20):
    m = mapping(module, company)
    offset, limit = int(offset), int(limit)
    if offset < 0 or limit < 1 or limit > 100 or len(search) > 200:
        frappe.throw("Invalid query")
    filters = {m["companyField"]: company} if m.get("companyField") else {}
    if search:
        filters["name"] = ["like", "%" + search + "%"]
    rows = frappe.get_list(m["doctype"], fields=["name"], filters=filters, start=offset, page_length=limit + 1, order_by="modified desc")
    fields = project_fields(m.get("fields", []), m["doctype"])
    return {"records": [envelope(load_doc(m, r.name, company), fields) for r in rows[:limit]], "hasMore": len(rows) > limit}


@frappe.whitelist()
def record(module, company, name):
    m = mapping(module, company)
    return envelope(load_doc(m, name, company), project_fields(m.get("fields", []), m["doctype"]))


@frappe.whitelist()
def links(module, company, field, search=""):
    m = mapping(module, company)
    if not frappe.has_permission(m["doctype"], "read") or len(search) > 200:
        frappe.throw("Link access denied", frappe.PermissionError)
    fields = project_fields(m.get("fields", []), m["doctype"])
    meta = frappe.get_meta(m["doctype"])
    parts = field.split(".")
    if len(parts) > 2:
        frappe.throw("Invalid field path")
    for index, part in enumerate(parts):
        definition = next((f for f in fields if f["name"] == part), None)
        df = meta.get_field(part)
        if not definition or not df:
            frappe.throw("Field access denied", frappe.PermissionError)
        if index < len(parts) - 1:
            if df.fieldtype != "Table":
                frappe.throw("Invalid child field")
            fields, meta = definition.get("fields", []), frappe.get_meta(df.options)
    if df.fieldtype != "Link":
        frappe.throw("Field is not a configured Link")
    filters = {"name": ["like", "%" + search + "%"]}
    if frappe.get_meta(df.options).has_field("company"):
        filters["company"] = company
    return [r.name for r in frappe.get_list(df.options, filters=filters, fields=["name"], page_length=20)]


def checked_values(values, fields, doc=None):
    values = frappe.parse_json(values)
    if not isinstance(values, dict):
        frappe.throw("Invalid fields")
    definitions = {f["name"]: f for f in fields}
    result = {}
    for key, value in values.items():
        if key not in definitions or definitions[key].get("readOnly") or key in ("doctype", "docstatus", "owner", "modified", "ignore_permissions", "name"):
            frappe.throw("Field access denied", frappe.PermissionError)
        f = definitions[key]
        if doc and doc.docstatus == 1 and not f.get("allowOnSubmit"):
            frappe.throw("Submitted field cannot be changed", frappe.PermissionError)
        if f["type"] == "table":
            if not isinstance(value, list) or len(value) > 200:
                frappe.throw("Invalid child rows")
            existing = {r.name: r for r in (doc.get(key) or [])} if doc else {}
            seen = set()
            cleaned = []
            for row in value:
                row = dict(row)
                row_id = row.pop("_row_id", None)
                if row_id and (row_id not in existing or row_id in seen):
                    frappe.throw("Child row identity mismatch", frappe.PermissionError)
                seen.add(row_id) if row_id else None
                row_values = checked_values(row, f.get("fields", []))
                if row_id:
                    row_values["name"] = row_id
                cleaned.append(row_values)
            result[key] = cleaned
        else:
            if isinstance(value, (dict, list)):
                frappe.throw("Invalid scalar value")
            result[key] = value
    return result


@frappe.whitelist(methods=["POST"])
def save(module, company, values, name=None, expectedModified=None):
    m = mapping(module, company, write=True)
    fields = project_fields(m.get("fields", []), m["doctype"])
    if name and not expectedModified:
        frappe.throw("Expected version required")
    doc = load_doc(m, name, company, "write", expectedModified) if name else frappe.new_doc(m["doctype"])
    values = frappe.parse_json(values)
    if m.get("companyField") and isinstance(values, dict):
        supplied_company = values.pop(m["companyField"], None)
        if supplied_company and supplied_company != company:
            frappe.throw("Record company mismatch", frappe.PermissionError)
    cleaned = checked_values(values, fields, doc)
    if m.get("companyField"):
        cleaned[m["companyField"]] = company
    doc.update(cleaned)
    doc.save()  # native permissions, validation, and atomic timestamp checks
    return envelope(doc, fields)


@frappe.whitelist(methods=["POST"])
def action(module, company, name, action, expectedModified):
    m = mapping(module, company, write=True)
    if not expectedModified:
        frappe.throw("Expected version required")
    doc = load_doc(m, name, company, "write", expectedModified)
    has_workflow = frappe.db.exists("Workflow", {"document_type": m["doctype"], "is_active": 1})
    if action in ("submit", "cancel") and not has_workflow:
        doc.check_permission(action)
        doc.submit() if action == "submit" else doc.cancel()
    elif action in m.get("workflowActions", []):
        doc = apply_workflow(doc, action)
    else:
        frappe.throw("Use a configured native workflow transition", frappe.PermissionError)
    return envelope(doc, project_fields(m.get("fields", []), m["doctype"]))


@frappe.whitelist()
def ai_records(module, company, search=""):
    m = mapping(module, company)
    allowed = set(m.get("aiFields", []))
    if not allowed or any(any(word in f.lower() for word in ("password", "secret", "token", "bank_account", "iban", "salary", "national_id")) for f in allowed):
        frappe.throw("AI fields await approval", frappe.PermissionError)
    result = records(module, company, search, 0, 20)
    for row in result["records"]:
        row["values"] = {k: v for k, v in row["values"].items() if k in allowed and not isinstance(v, (dict, list))}
    return {"source": m["doctype"], "company": company, "retrievedAt": str(frappe.utils.now_datetime()), **result}


@frappe.whitelist()
def report(report, company, filters=None):
    company_access(company)
    m = next((r for r in config().get("reports", []) if r["id"] == report and r.get("readValidated")), None)
    if not m:
        frappe.throw("Report awaits validation", frappe.PermissionError)
    filters = checked_values(filters or {}, m.get("filters", []))
    if m.get("companyField"):
        filters[m["companyField"]] = company
    from frappe.desk.query_report import run
    result = run(m["erpName"], filters=filters)
    columns = [{"key": c.get("fieldname") or str(i), "label": c.get("label") or c.get("fieldname") or str(i)} if isinstance(c, dict) else {"key": str(i), "label": c.split(":")[0]} for i, c in enumerate(result.get("columns", []))]
    rows = [{c["key"]: row.get(c["key"]) if isinstance(row, dict) else row[i] for i, c in enumerate(columns)} for row in result.get("result", [])]
    return {"columns": columns, "rows": rows}


@frappe.whitelist()
def dashboard(dashboard, company, period):
    company_access(company)
    m = config().get("dashboards", {}).get(dashboard)
    if not m or not m.get("mappingValidated") or not set(m.get("roles", [])).intersection(frappe.get_roles()):
        frappe.throw("Dashboard access denied", frappe.PermissionError)
    # Installed report must explicitly produce the CEO DashboardData contract;
    # its company KPI definitions are supplied and validated during discovery.
    from frappe.desk.query_report import run
    output = run(m["report"], filters={"company": company, **frappe.parse_json(period)})
    data = output.get("ceopanel_dashboard")
    if not data or data.get("company") != company or data.get("dashboardId") != dashboard:
        frappe.throw("Report must return validated ceopanel_dashboard data")
    return data


@frappe.whitelist(methods=["POST"])
def execute_proposal(proposal, company, payload):
    company_access(company)
    if not isinstance(proposal, str) or len(proposal) != 36:
        frappe.throw("Invalid proposal identity")
    if not frappe.conf.get("ceopanel_receipt_secret"):
        frappe.throw("Receipt verification awaits configuration")
    # Durable receipt in ERP's transaction prevents duplicate creates/side effects.
    receipt = "ceopanel-proposal-" + proposal
    frappe.db.get_value("Company", company, "name", for_update=True)
    if frappe.db.exists("Comment", {"comment_type": "Info", "reference_doctype": "Company", "reference_name": company, "subject": receipt}):
        return proposal_receipt(proposal, company)
    p = frappe.parse_json(payload)
    if p["kind"] in ("create", "update"):
        result = save(p["module"], company, p.get("values"), p.get("name") if p["kind"] == "update" else None, p.get("modified"))
    elif p["kind"] == "workflow":
        result = action(p["module"], company, p["name"], p["action"], p["modified"])
    elif p["kind"] == "message" and p.get("channel") == "email":
        if not config().get("channels", {}).get("email"):
            frappe.throw("Email awaits validation", frappe.PermissionError)
        frappe.only_for(config().get("emailSendRoles") or ["System Manager"])
        m = mapping(p["module"], company)
        contact = load_doc(m, p["name"], company, expected=p.get("modified"))
        field = m.get("messageFields", {}).get("email")
        if not field or field not in permitted_fields(m["doctype"]) or contact.get(field) != p.get("recipient"):
            frappe.throw("Recipient mismatch", frappe.PermissionError)
        from html import escape
        frappe.sendmail(recipients=[p["recipient"]], subject="Durar Masagh", message=escape(p["text"]).replace("\n", "<br>"), now=False)
        result = {"name": contact.name, "modified": str(contact.modified)}
    else:
        frappe.throw("Channel execution awaits validation")
    # Only a minimal receipt is retained; business data stays permission checked.
    receipt_payload = {"proposal": proposal, "module": p["module"], "name": result["name"], "modified": result["modified"], "company": company}
    canonical = json.dumps(receipt_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    receipt_data = {"receipt": receipt_payload, "signature": hmac.new(frappe.conf.ceopanel_receipt_secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()}
    frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Company", "reference_name": company, "subject": receipt, "content": json.dumps(receipt_data)}).insert()
    return receipt_data


@frappe.whitelist()
def proposal_receipt(proposal, company):
    company_access(company)
    name = frappe.db.get_value("Comment", {"comment_type": "Info", "reference_doctype": "Company", "reference_name": company, "subject": "ceopanel-proposal-" + proposal}, "name")
    if not name:
        return None
    receipt = frappe.get_doc("Comment", name)
    data = json.loads(receipt.content)
    payload = data.get("receipt") or {}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    secret = frappe.conf.get("ceopanel_receipt_secret")
    if not secret or payload.get("proposal") != proposal or payload.get("company") != company or not hmac.compare_digest(data.get("signature", ""), hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()):
        frappe.throw("Receipt verification failed", frappe.PermissionError)
    m = mapping(payload["module"], company)
    load_doc(m, payload["name"], company)
    return data


@frappe.whitelist()
def discovery():
    authenticated()
    frappe.only_for("System Manager")
    from frappe.utils.change_log import get_versions
    workflows = frappe.get_list("Workflow", filters={"is_active": 1}, fields=["name", "document_type", "workflow_state_field"], page_length=1000)
    schemas = {}
    for m in config().get("modules", []):
        meta = frappe.get_meta(m["doctype"])
        schemas[m["id"]] = {"doctype": m["doctype"], "fields": [{"name": f.fieldname, "label": f.label, "type": f.fieldtype, "options": f.options, "required": f.reqd, "readOnly": f.read_only, "permlevel": f.permlevel} for f in meta.fields], "permissions": meta.permissions}
    return {"versions": get_versions(), "companies": frappe.get_list("Company", fields=["name", "default_currency"]), "schemas": schemas, "customDocTypes": frappe.get_list("DocType", filters={"custom": 1}, fields=["name", "module"], page_length=1000), "reports": frappe.get_list("Report", fields=["name", "ref_doctype", "report_type"], page_length=1000), "workflows": [{**w, "states": frappe.get_doc("Workflow", w.name).states, "transitions": frappe.get_doc("Workflow", w.name).transitions} for w in workflows]}
