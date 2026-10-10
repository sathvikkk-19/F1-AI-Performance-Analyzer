import sqlite3
import os
from werkzeug.security import generate_password_hash
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "f1.db")

def run_migration():
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Update users table columns
    cur.execute("PRAGMA table_info(users)")
    existing_cols = [c[1] for c in cur.fetchall()]
    print("Current columns in users table:", existing_cols)

    if "role" not in existing_cols:
        print("Adding 'role' column to users table...")
        cur.execute("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'")

    if "selected_team" not in existing_cols:
        print("Adding 'selected_team' column to users table...")
        cur.execute("ALTER TABLE users ADD COLUMN selected_team VARCHAR(100)")

    if "last_login" not in existing_cols:
        print("Adding 'last_login' column to users table...")
        cur.execute("ALTER TABLE users ADD COLUMN last_login DATETIME")

    # 2. Create careers table if not exists
    print("Ensuring careers table exists...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS careers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            team_name VARCHAR(100) NOT NULL,
            team_id INTEGER,
            driver_id INTEGER,
            driver_name VARCHAR(100),
            season INTEGER DEFAULT 2026,
            current_round INTEGER DEFAULT 1,
            started BOOLEAN DEFAULT 0,
            season_completed BOOLEAN DEFAULT 0,
            development_points INTEGER DEFAULT 20,
            upgrades_json TEXT DEFAULT '{}',
            baseline_car_json TEXT DEFAULT '{}',
            season_result_json TEXT DEFAULT '{}',
            last_reward_json TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)

    # 3. Seed/ensure default admin user
    cur.execute("SELECT id, username, password_hash, role FROM users WHERE username = 'admin'")
    admin_row = cur.fetchone()
    admin_pw_hash = generate_password_hash("f1admin2026")
    now_iso = datetime.utcnow().isoformat()

    if admin_row is None:
        print("Seeding default admin user (admin / f1admin2026)...")
        cur.execute("""
            INSERT INTO users (username, email, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, ("admin", "admin@f1.com", admin_pw_hash, "admin", now_iso))
    else:
        print("Updating existing admin user credentials and role...")
        cur.execute("""
            UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?
        """, (admin_pw_hash, admin_row[0]))

    conn.commit()
    conn.close()
    print("Migration completed successfully.")

if __name__ == "__main__":
    run_migration()
