"""
MediBridge Connect — Automated Backend Test Suite

Covers Modules A–E from the QA Test Plan:
  A. Authentication & Session Management
  B. Consultation Flow (request → accept → end)
  C. Real-time Chat & Translation (REST path)
  D. Audio Upload (structure only — requires mic input for full test)
  E. Security (XSS, auth guards)

Usage:
    # With backend running on localhost:8000
    python tests/test_backend.py

    # Or via pytest
    pytest tests/test_backend.py -v
"""

import time
import uuid
import requests

BASE_URL = "http://localhost:8000"


# ═══════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════
def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def signup(role: str, name: str | None = None) -> dict:
    """Create a new user and return { token, user }."""
    email = f"test_{role}_{uuid.uuid4().hex[:8]}@example.com"
    body = {
        "email": email,
        "password": "Test@12345",
        "full_name": name or f"Test {role.title()}",
        "role": role,
    }
    r = requests.post(f"{BASE_URL}/auth/signup", json=body)
    assert r.status_code == 201, f"Signup failed ({r.status_code}): {r.text}"
    data = r.json()
    assert "access_token" in data
    assert data["user"]["role"] == role
    return {"token": data["access_token"], "user": data["user"], "email": email}


# ═══════════════════════════════════════════════════════════════════════
#  Module A — Authentication & Session Management
# ═══════════════════════════════════════════════════════════════════════
class TestModuleA:
    """A1–A4: Signup, Login, /me, Token isolation."""

    def test_a1_health_check(self):
        r = requests.get(f"{BASE_URL}/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] in ("healthy", "degraded")
        assert data["database"] == "connected"
        print("  ✅ A0 — Health check passed (DB connected)")

    def test_a1_doctor_signup(self):
        doc = signup("doctor", "Dr. TestDoc")
        assert doc["user"]["full_name"] == "Dr. TestDoc"
        print("  ✅ A1 — Doctor signup")

    def test_a2_patient_signup(self):
        pat = signup("patient", "Test Patient")
        assert pat["user"]["full_name"] == "Test Patient"
        print("  ✅ A2 — Patient signup")

    def test_a3_login(self):
        # signup then login with same creds
        email = f"login_test_{uuid.uuid4().hex[:6]}@example.com"
        pwd = "Login@12345"
        requests.post(f"{BASE_URL}/auth/signup", json={
            "email": email, "password": pwd,
            "full_name": "Login Tester", "role": "patient",
        })
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "email": email, "password": pwd,
        })
        assert r.status_code == 200, f"Login failed: {r.text}"
        assert "access_token" in r.json()
        print("  ✅ A3 — Login with existing credentials")

    def test_a3_bad_password(self):
        email = f"badpw_{uuid.uuid4().hex[:6]}@example.com"
        requests.post(f"{BASE_URL}/auth/signup", json={
            "email": email, "password": "GoodPass1",
            "full_name": "PW Tester", "role": "patient",
        })
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "email": email, "password": "WrongPass",
        })
        assert r.status_code == 401
        print("  ✅ A3b — Bad password returns 401")

    def test_a4_me_endpoint(self):
        p = signup("patient")
        r = requests.get(f"{BASE_URL}/auth/me", headers=_auth_header(p["token"]))
        assert r.status_code == 200
        assert r.json()["id"] == p["user"]["id"]
        print("  ✅ A4 — /auth/me returns correct user")

    def test_a4_no_token(self):
        r = requests.get(f"{BASE_URL}/auth/me")
        assert r.status_code in (401, 403)
        print("  ✅ A4b — /auth/me without token returns 401/403")

    def test_a4_session_isolation(self):
        """Two different tokens get two different users."""
        doc = signup("doctor")
        pat = signup("patient")
        r1 = requests.get(f"{BASE_URL}/auth/me", headers=_auth_header(doc["token"])).json()
        r2 = requests.get(f"{BASE_URL}/auth/me", headers=_auth_header(pat["token"])).json()
        assert r1["id"] != r2["id"]
        assert r1["role"] == "doctor"
        assert r2["role"] == "patient"
        print("  ✅ A4c — Token isolation (different tokens → different users)")


# ═══════════════════════════════════════════════════════════════════════
#  Module B — Consultation Flow
# ═══════════════════════════════════════════════════════════════════════
class TestModuleB:
    """B1–B3: Request → Accept → End session."""

    def test_b_full_flow(self):
        # Setup: create doctor + patient
        doc = signup("doctor", "Dr. Flow")
        pat = signup("patient", "Patient Flow")

        # B1: Patient requests consultation
        r = requests.post(
            f"{BASE_URL}/consultations/request",
            json={"patient_language": "es"},
            headers=_auth_header(pat["token"]),
        )
        assert r.status_code == 201, f"Request failed: {r.text}"
        session = r.json()
        session_id = session["id"]
        assert session["status"] == "waiting"
        assert session["patient_language"] == "es"
        print("  ✅ B1 — Patient requested consultation")

        # B1b: Duplicate prevention
        r_dup = requests.post(
            f"{BASE_URL}/consultations/request",
            json={"patient_language": "es"},
            headers=_auth_header(pat["token"]),
        )
        assert r_dup.status_code == 409, "Duplicate session should be blocked"
        print("  ✅ B1b — Duplicate session prevented (409)")

        # B2: Doctor sees the session
        r = requests.get(
            f"{BASE_URL}/consultations/",
            headers=_auth_header(doc["token"]),
        )
        assert r.status_code == 200
        sessions = r.json()
        found = any(s["id"] == session_id for s in sessions)
        assert found, "Doctor should see the waiting session"
        print("  ✅ B2 — Doctor sees incoming request")

        # B3: Doctor accepts
        r = requests.put(
            f"{BASE_URL}/consultations/{session_id}/accept",
            json={"doctor_language": "en"},
            headers=_auth_header(doc["token"]),
        )
        assert r.status_code == 200, f"Accept failed: {r.text}"
        accepted = r.json()
        assert accepted["status"] == "active"
        assert accepted["doctor_id"] is not None
        print("  ✅ B3 — Doctor accepted session (status=active)")

        # B3b: Get individual session
        r = requests.get(
            f"{BASE_URL}/consultations/{session_id}",
            headers=_auth_header(doc["token"]),
        )
        assert r.status_code == 200
        detail = r.json()
        assert detail["patient"] is not None
        assert detail["doctor"] is not None
        print("  ✅ B3b — Session detail includes patient & doctor objects")

        # End session
        r = requests.put(
            f"{BASE_URL}/consultations/{session_id}/end",
            json={"summary": "Test summary from automated test."},
            headers=_auth_header(doc["token"]),
        )
        assert r.status_code == 200
        ended = r.json()
        assert ended["status"] == "completed"
        assert ended["summary"] == "Test summary from automated test."
        print("  ✅ B3c — Session ended with summary")

    def test_b_patient_cannot_accept(self):
        pat = signup("patient")
        # Create a session, then try self-accepting
        r = requests.post(
            f"{BASE_URL}/consultations/request",
            json={},
            headers=_auth_header(pat["token"]),
        )
        sid = r.json()["id"]
        r = requests.put(
            f"{BASE_URL}/consultations/{sid}/accept",
            json={},
            headers=_auth_header(pat["token"]),
        )
        assert r.status_code == 403
        print("  ✅ B — Patient cannot accept (403)")


# ═══════════════════════════════════════════════════════════════════════
#  Module C — Chat (REST send endpoint)
# ═══════════════════════════════════════════════════════════════════════
class TestModuleC:
    """C1–C2: Send message via REST, verify persistence & translation kick-off."""

    def test_c_send_and_retrieve(self):
        doc = signup("doctor", "Dr. Chat")
        pat = signup("patient", "Patient Chat")

        # Create + accept session
        r = requests.post(
            f"{BASE_URL}/consultations/request",
            json={"patient_language": "es"},
            headers=_auth_header(pat["token"]),
        )
        sid = r.json()["id"]
        requests.put(
            f"{BASE_URL}/consultations/{sid}/accept",
            json={"doctor_language": "en"},
            headers=_auth_header(doc["token"]),
        )

        # C1: Patient sends a message via REST
        r = requests.post(
            f"{BASE_URL}/chat/{sid}/send",
            json={"content": "Hola doctor, tengo fiebre", "sender_language": "es"},
            headers=_auth_header(pat["token"]),
        )
        assert r.status_code == 201, f"Send failed: {r.text}"
        msg = r.json()
        assert msg["content"] == "Hola doctor, tengo fiebre"
        assert msg["sender_id"] == pat["user"]["id"]
        print("  ✅ C1 — Patient sent message via REST")

        # C1b: Doctor sends a reply
        r = requests.post(
            f"{BASE_URL}/chat/{sid}/send",
            json={"content": "How long have you had the fever?", "sender_language": "en"},
            headers=_auth_header(doc["token"]),
        )
        assert r.status_code == 201
        print("  ✅ C1b — Doctor replied via REST")

        # C2: Retrieve messages — both should appear
        # Small delay to let background translation fire
        time.sleep(2)
        r = requests.get(
            f"{BASE_URL}/chat/{sid}/messages",
            headers=_auth_header(pat["token"]),
        )
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 2, f"Expected >=2 messages, got {len(msgs)}"
        print(f"  ✅ C2 — Retrieved {len(msgs)} messages")

        # Check translation was attempted (may be unavailable if no AI key)
        patient_msg = next(m for m in msgs if m["sender_id"] == pat["user"]["id"])
        if patient_msg["translated_content"]:
            print(f"  ✅ C2b — Translation present: '{patient_msg['translated_content']}'")
        else:
            print("  ⚠️  C2b — Translation is null (AI service may be unavailable)")

        # End session for cleanup
        requests.put(
            f"{BASE_URL}/consultations/{sid}/end",
            json={},
            headers=_auth_header(doc["token"]),
        )

    def test_c_non_participant_blocked(self):
        doc = signup("doctor")
        pat = signup("patient")
        outsider = signup("patient", "Outsider")

        r = requests.post(
            f"{BASE_URL}/consultations/request",
            json={},
            headers=_auth_header(pat["token"]),
        )
        sid = r.json()["id"]
        requests.put(
            f"{BASE_URL}/consultations/{sid}/accept",
            json={},
            headers=_auth_header(doc["token"]),
        )

        # Outsider tries to read messages
        r = requests.get(
            f"{BASE_URL}/chat/{sid}/messages",
            headers=_auth_header(outsider["token"]),
        )
        assert r.status_code == 403
        print("  ✅ C — Non-participant blocked from reading messages (403)")

        # Outsider tries to send
        r = requests.post(
            f"{BASE_URL}/chat/{sid}/send",
            json={"content": "I should not be here"},
            headers=_auth_header(outsider["token"]),
        )
        assert r.status_code == 403
        print("  ✅ C — Non-participant blocked from sending messages (403)")


# ═══════════════════════════════════════════════════════════════════════
#  Module E — Security
# ═══════════════════════════════════════════════════════════════════════
class TestModuleE:
    """E1–E3: XSS blocking, search, auth enforcement."""

    def test_e1_xss_blocked(self):
        pat = signup("patient")
        doc = signup("doctor")

        # Create + accept session
        r = requests.post(
            f"{BASE_URL}/consultations/request",
            json={},
            headers=_auth_header(pat["token"]),
        )
        sid = r.json()["id"]
        requests.put(
            f"{BASE_URL}/consultations/{sid}/accept",
            json={},
            headers=_auth_header(doc["token"]),
        )

        # Try sending XSS payload
        r = requests.post(
            f"{BASE_URL}/chat/{sid}/send",
            json={"content": "<script>alert('Hacked')</script>"},
            headers=_auth_header(pat["token"]),
        )
        # Should be blocked (400) by XSS middleware
        assert r.status_code == 400, f"XSS should be blocked, got {r.status_code}"
        print("  ✅ E1 — XSS payload blocked (400)")

    def test_e2_search(self):
        doc = signup("doctor")
        pat = signup("patient")

        # Create session + send a keyword
        r = requests.post(
            f"{BASE_URL}/consultations/request",
            json={},
            headers=_auth_header(pat["token"]),
        )
        sid = r.json()["id"]
        requests.put(
            f"{BASE_URL}/consultations/{sid}/accept",
            json={},
            headers=_auth_header(doc["token"]),
        )
        requests.post(
            f"{BASE_URL}/chat/{sid}/send",
            json={"content": "I have a fever and headache"},
            headers=_auth_header(pat["token"]),
        )
        time.sleep(1)

        # Search for "fever"
        r = requests.get(
            f"{BASE_URL}/consultations/search/messages?q=fever",
            headers=_auth_header(pat["token"]),
        )
        assert r.status_code == 200
        results = r.json()
        assert len(results) >= 1, f"Expected search results for 'fever', got {len(results)}"
        print(f"  ✅ E2 — Search returned {len(results)} session(s) for 'fever'")

        # Detail search
        r = requests.get(
            f"{BASE_URL}/consultations/search/messages/detail?q=fever",
            headers=_auth_header(pat["token"]),
        )
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 1
        assert "fever" in msgs[0]["content"].lower()
        print(f"  ✅ E2b — Detail search returned {len(msgs)} message(s)")

    def test_e3_security_headers(self):
        r = requests.get(f"{BASE_URL}/health")
        assert "X-Content-Type-Options" in r.headers
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert "X-Frame-Options" in r.headers
        print("  ✅ E3 — Security headers present (X-Content-Type-Options, X-Frame-Options)")

    def test_e_duplicate_email(self):
        email = f"dup_{uuid.uuid4().hex[:6]}@example.com"
        requests.post(f"{BASE_URL}/auth/signup", json={
            "email": email, "password": "Pass1234",
            "full_name": "First", "role": "patient",
        })
        r = requests.post(f"{BASE_URL}/auth/signup", json={
            "email": email, "password": "Pass1234",
            "full_name": "Second", "role": "patient",
        })
        assert r.status_code == 409
        print("  ✅ E — Duplicate email signup blocked (409)")


# ═══════════════════════════════════════════════════════════════════════
#  Runner
# ═══════════════════════════════════════════════════════════════════════
def run_all():
    """Execute all test modules and report results."""
    modules = [
        ("Module A: Authentication & Session Management", TestModuleA),
        ("Module B: Consultation Flow", TestModuleB),
        ("Module C: Chat & Translation (REST)", TestModuleC),
        ("Module E: Security & Search", TestModuleE),
    ]

    total = 0
    passed = 0
    failed = 0
    failures: list[str] = []

    for module_name, cls in modules:
        print(f"\n{'─' * 60}")
        print(f"  {module_name}")
        print(f"{'─' * 60}")
        obj = cls()
        for attr in sorted(dir(obj)):
            if attr.startswith("test_"):
                total += 1
                try:
                    getattr(obj, attr)()
                    passed += 1
                except Exception as e:
                    failed += 1
                    label = attr.replace("test_", "").replace("_", " ").upper()
                    failures.append(f"  {label}: {e}")
                    print(f"  ❌ {attr}: {e}")

    print(f"\n{'═' * 60}")
    print(f"  RESULTS: {passed}/{total} passed, {failed} failed")
    print(f"{'═' * 60}")
    if failures:
        print("\nFailed tests:")
        for f in failures:
            print(f)
        return False
    else:
        print("\n🎉 ALL TESTS PASSED!")
        return True


if __name__ == "__main__":
    import sys
    success = run_all()
    sys.exit(0 if success else 1)
