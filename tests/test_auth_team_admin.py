import json
from backend.app import app
from backend.models import User, Career

def run_tests():
    print("=== Running Integration Tests for Auth, Teams, Career, and Admin ===")
    client = app.test_client()

    # 1. Verify Admin user exists and can log in with provided credentials
    res = client.post("/api/auth/login", json={"identifier": "admin", "password": "f1admin2026"})
    assert res.status_code == 200, f"Admin login failed: {res.data}"
    admin_data = res.get_json()
    assert admin_data["success"] is True
    assert admin_data["user"]["role"] == "admin"
    assert admin_data["user"]["is_admin"] is True
    print("PASS: Admin login with admin / f1admin2026 verified.")

    # 2. Register first user with Ferrari
    client_ferrari = app.test_client()
    res = client_ferrari.post("/api/auth/register", json={
        "username": "ferrari_driver_1",
        "email": "ferrari1@f1.com",
        "password": "password123",
        "selected_team": "Scuderia Ferrari HP"
    })
    # If already created in prior run, login instead
    if res.status_code == 409:
        res = client_ferrari.post("/api/auth/login", json={"identifier": "ferrari_driver_1", "password": "password123"})
    assert res.status_code in [200, 201]
    user1 = res.get_json()["user"]
    assert user1["selected_team"] == "Scuderia Ferrari HP"
    print("PASS: Registered ferrari_driver_1 with Scuderia Ferrari HP.")

    # 3. Check /api/career/drivers for ferrari_driver_1
    res = client_ferrari.get("/api/career/drivers")
    assert res.status_code == 200
    drivers_data = res.get_json()
    assert drivers_data["team"] == "Scuderia Ferrari HP"
    assert len(drivers_data["drivers"]) >= 2
    driver_id = drivers_data["drivers"][0]["id"]
    driver_name = drivers_data["drivers"][0]["name"]
    print(f"PASS: Drivers for Scuderia Ferrari HP returned: {[d['name'] for d in drivers_data['drivers']]}")

    # 4. Start Career for ferrari_driver_1
    res = client_ferrari.post("/api/career/start", json={
        "team": "Scuderia Ferrari HP",
        "driver_id": driver_id,
        "driver_name": driver_name
    })
    assert res.status_code == 200
    career1 = res.get_json()["career"]
    assert career1["team"] == "Scuderia Ferrari HP"
    assert career1["driver_name"] == driver_name
    print(f"PASS: Started career with {career1['team']} and driver {career1['driver_name']}.")

    # 5. Simulate a race for ferrari_driver_1
    res = client_ferrari.post("/api/career/race")
    assert res.status_code == 200
    race_data = res.get_json()
    assert race_data["round"] == 1
    assert race_data["next_round"] == 2
    print(f"PASS: Simulated Round 1 race for ferrari_driver_1 (Reward: {race_data.get('development_reward', {}).get('points_earned')} DP).")

    # 6. Purchase an upgrade for ferrari_driver_1
    res = client_ferrari.post("/api/career/upgrade", json={"component": "aero"})
    assert res.status_code == 200
    upgrade_res = res.get_json()
    assert upgrade_res["level"] == 1
    print(f"PASS: Purchased Aero upgrade (Level: {upgrade_res['level']}, DP remaining: {upgrade_res['development_points']}).")

    # 7. Register second user with McLaren
    client_mclaren = app.test_client()
    res = client_mclaren.post("/api/auth/register", json={
        "username": "mclaren_fan_4",
        "email": "mclaren4@f1.com",
        "password": "password456",
        "selected_team": "McLaren Mastercard"
    })
    if res.status_code == 409:
        res = client_mclaren.post("/api/auth/login", json={"identifier": "mclaren_fan_4", "password": "password456"})
    assert res.status_code in [200, 201]
    print("PASS: Registered mclaren_fan_4 with McLaren Mastercard.")

    # 8. Start career for mclaren_fan_4
    res = client_mclaren.get("/api/career/drivers")
    mcl_drivers = res.get_json()["drivers"]
    res = client_mclaren.post("/api/career/start", json={
        "team": "McLaren Mastercard",
        "driver_id": mcl_drivers[0]["id"],
        "driver_name": mcl_drivers[0]["name"]
    })
    assert res.status_code == 200
    print(f"PASS: Started McLaren career with driver {mcl_drivers[0]['name']}.")

    # 9. Verify Admin view shows all users, their distinct teams, and career telemetry!
    res = client.get("/api/admin/users")
    assert res.status_code == 200
    admin_overview = res.get_json()
    assert admin_overview["stats"]["total_users"] >= 3
    assert admin_overview["stats"]["active_careers"] >= 2
    print(f"PASS: Admin stats verified -> Total Users: {admin_overview['stats']['total_users']}, Active Careers: {admin_overview['stats']['active_careers']}, Total Races: {admin_overview['stats']['total_races_simulated']}.")
    
    # Check users list in admin view
    usernames = [u["username"] for u in admin_overview["users"]]
    assert "admin" in usernames
    assert "ferrari_driver_1" in usernames
    assert "mclaren_fan_4" in usernames
    print(f"PASS: Admin can see all users: {usernames}")

    # 10. Check Admin inspect on user 1
    u1_record = next(u for u in admin_overview["users"] if u["username"] == "ferrari_driver_1")
    assert u1_record["career"]["team"] == "Scuderia Ferrari HP"
    assert u1_record["career"]["completed_races_count"] == 1
    assert u1_record["career"]["upgrades"]["aero"] == 1
    print("PASS: Admin inspect verified exact career state (team, race count, aero upgrade).")

    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    run_tests()
