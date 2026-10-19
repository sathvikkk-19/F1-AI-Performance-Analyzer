import json
from backend.app import app
from backend.models import User, Career
from backend.config import Config

def run_tests():
    print("=== Running Integration Tests for Secure Admin Passkey, Email OTP, and Team Career ===")
    client = app.test_client()

    # 1. Verify Admin login without passkey is BLOCKED (403 Forbidden)
    res_no_passkey = client.post("/api/auth/login", json={
        "identifier": Config.ADMIN_USERNAME,
        "password": Config.ADMIN_PASSWORD
    })
    assert res_no_passkey.status_code == 403, f"Expected 403 when passkey missing, got {res_no_passkey.status_code}"
    print("PASS: Admin login without passkey correctly blocked with 403 Forbidden.")

    # 2. Verify Admin login WITH valid passkey succeeds
    res_admin = client.post("/api/auth/login", json={
        "identifier": Config.ADMIN_USERNAME,
        "password": Config.ADMIN_PASSWORD,
        "admin_passkey": Config.ADMIN_PASSKEY
    })
    assert res_admin.status_code == 200, f"Admin login failed: {res_admin.data}"
    admin_data = res_admin.get_json()
    assert admin_data["success"] is True
    assert admin_data["user"]["is_admin"] is True
    print(f"PASS: Admin login with passkey verified for {Config.ADMIN_USERNAME}.")

    # 3. Test Email Domain Validation - Reject invalid/disposable domain
    res_invalid_email = client.post("/api/auth/send-verification-code", json={
        "email": "driver@random-temporary-domain.xyz"
    })
    assert res_invalid_email.status_code == 400
    print("PASS: Blocked non-approved email domain correctly.")

    # 4. Request 6-digit OTP code for legitimate Google Mail
    # 4. Request 6-digit OTP code for legitimate Google Mail
    import time
    test_id = int(time.time())
    test_username = f"driver_{test_id}"
    test_email = f"racer_{test_id}@gmail.com"

    client_driver = app.test_client()
    res_code = client_driver.post("/api/auth/send-verification-code", json={
        "email": test_email
    })
    assert res_code.status_code == 200, f"Expected 200, got {res_code.status_code}: {res_code.data}"
    otp_data = res_code.get_json()
    assert otp_data["success"] is True
    otp_code = otp_data.get("dev_code")
    assert otp_code is not None and len(otp_code) == 6
    print(f"PASS: 6-Digit OTP generated: {otp_code} for verified Google account.")

    # 5. Attempt registration with wrong OTP code - Should fail
    res_bad_otp = client_driver.post("/api/auth/register", json={
        "full_name": "Sathwik Kumar",
        "username": test_username,
        "email": test_email,
        "verification_code": "000000",
        "password": "SecretPassword123!",
        "selected_team": "Scuderia Ferrari HP"
    })
    assert res_bad_otp.status_code == 400
    print("PASS: Registration with incorrect verification code rejected.")

    # 6. Register with correct OTP code, Full Name, and valid team
    res_reg = client_driver.post("/api/auth/register", json={
        "full_name": "Sathwik Kumar",
        "username": test_username,
        "email": test_email,
        "verification_code": otp_code,
        "password": "SecretPassword123!",
        "selected_team": "Scuderia Ferrari HP"
    })
    if res_reg.status_code == 409:
        res_reg = client_driver.post("/api/auth/login", json={
            "identifier": "sathwik_driver_99",
            "password": "SecretPassword123!"
        })
    assert res_reg.status_code in [200, 201]
    user1 = res_reg.get_json()["user"]
    assert user1["full_name"] == "Sathwik Kumar"
    assert user1["email_provider"] == "Google"
    assert user1["is_verified"] is True
    assert user1["selected_team"] == "Scuderia Ferrari HP"
    print(f"PASS: Driver registered & verified: {user1['full_name']} (@{user1['username']}) with {user1['selected_team']}.")

    # 7. Start Career for registered driver
    res_drivers = client_driver.get("/api/career/drivers")
    assert res_drivers.status_code == 200
    drivers_list = res_drivers.get_json()["drivers"]
    res_start = client_driver.post("/api/career/start", json={
        "team": "Scuderia Ferrari HP",
        "driver_id": drivers_list[0]["id"],
        "driver_name": drivers_list[0]["name"]
    })
    assert res_start.status_code == 200
    print(f"PASS: Career mode initialized for {drivers_list[0]['name']}.")

    # 8. Simulate race & buy upgrade
    res_race = client_driver.post("/api/career/race")
    assert res_race.status_code == 200
    res_upg = client_driver.post("/api/career/upgrade", json={"component": "aero"})
    assert res_upg.status_code == 200
    print("PASS: Race simulation and upgrade applied.")

    # 9. Verify Admin view shows the verified user, full name, provider, and career telemetry
    res_admin_view = res_admin = client.get("/api/admin/users")
    assert res_admin_view.status_code == 200
    admin_overview = res_admin_view.get_json()
    assert admin_overview["stats"]["total_users"] >= 2

    matching_user = next((u for u in admin_overview["users"] if u["username"] == test_username), None)
    assert matching_user is not None
    assert matching_user["full_name"] == "Sathwik Kumar"
    assert matching_user["email_provider"] == "Google"
    assert matching_user["is_verified"] is True
    print(f"PASS: Admin user registry reflects verified user: {matching_user['full_name']} | Provider: {matching_user['email_provider']} | Verified: {matching_user['is_verified']}.")

    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    run_tests()
