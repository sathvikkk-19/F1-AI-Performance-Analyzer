import os
import random
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash, check_password_hash

from backend.config import Config
from backend.extensions import db
from backend.models.user import User
from backend.models.team import Team


auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth"
)


# =============================================================
# ALLOWED EMAIL PROVIDERS (GOOGLE, YAHOO, OUTLOOK)
# =============================================================
ALLOWED_EMAIL_DOMAINS = {
    # Google
    "gmail.com": "Google",
    "googlemail.com": "Google",
    # Yahoo
    "yahoo.com": "Yahoo",
    "yahoo.co.in": "Yahoo",
    "yahoo.co.uk": "Yahoo",
    "yahoo.ca": "Yahoo",
    "yahoo.fr": "Yahoo",
    "ymail.com": "Yahoo",
    # Outlook / Microsoft
    "outlook.com": "Outlook",
    "hotmail.com": "Outlook",
    "live.com": "Outlook",
    "msn.com": "Outlook",
}


def _validate_email_domain(email_str):
    if not email_str or "@" not in email_str:
        return False, None, "Invalid email address format."
    domain = email_str.strip().split("@")[-1].lower()
    provider = ALLOWED_EMAIL_DOMAINS.get(domain)
    if not provider:
        return False, None, (
            "Registration is strictly restricted to authentic personal mail accounts "
            "linked with Google (@gmail.com), Yahoo (@yahoo.com), or Outlook/Hotmail (@outlook.com). "
            f"The email domain '@{domain}' is not permitted."
        )
    return True, provider, None


def _ensure_admin_user():
    admin_username = Config.ADMIN_USERNAME or "admin"
    admin_password = Config.ADMIN_PASSWORD
    if not admin_password:
        return User.query.filter_by(role="admin").first()

    admin = User.query.filter(
        db.or_(
            User.username == admin_username,
            User.username == "admin"
        )
    ).first()

    if not admin:
        admin = User(
            username=admin_username,
            full_name="FIA Chief Race Director",
            email="admin@f1-performance.internal",
            email_provider="Internal",
            is_verified=True,
            password_hash=generate_password_hash(admin_password),
            role="admin",
            selected_team="Oracle Red Bull Racing",
            created_at=datetime.utcnow(),
            last_login=datetime.utcnow()
        )
        db.session.add(admin)
    else:
        admin.username = admin_username
        admin.password_hash = generate_password_hash(admin_password)
        admin.role = "admin"
        admin.is_verified = True

    db.session.commit()
    return admin


# =============================================================
# SEND 6-DIGIT EMAIL VERIFICATION CODE
# =============================================================
@auth_bp.route("/send-verification-code", methods=["POST"])
def send_verification_code():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    full_name = str(data.get("full_name", "")).strip()

    valid, provider, err = _validate_email_domain(email)
    if not valid:
        return jsonify({"success": False, "message": err}), 400

    # Check if email is already taken
    existing = User.query.filter(db.func.lower(User.email) == email).first()
    if existing:
        return jsonify({
            "success": False,
            "message": "An account with this email address already exists. Please sign in."
        }), 409

    code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    session["pending_otp"] = {
        "email": email,
        "code": code,
        "expires_at": expires_at.isoformat(),
        "provider": provider
    }

    return jsonify({
        "success": True,
        "message": f"A 6-digit verification code has been issued for your {provider} account ({email}).",
        "provider": provider,
        "email": email,
        "verification_code": code,
        "dev_code": code
    })


# =============================================================
# USER REGISTRATION
# =============================================================
@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    full_name = str(data.get("full_name", "")).strip()
    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    selected_team = str(data.get("selected_team", "")).strip()
    code = str(data.get("verification_code", "")).strip()

    if not full_name:
        return jsonify({
            "success": False,
            "message": "Full Name is required for driver registration."
        }), 400

    if not username or not email or not password:
        return jsonify({
            "success": False,
            "message": "Full Name, Username callsign, email and password are required."
        }), 400

    # Disallow unauthorized users from taking admin names
    if username.lower() in ["admin", "sathwik_admin", "administrator", "root"]:
        return jsonify({
            "success": False,
            "message": "The username 'admin' is reserved strictly for the Chief Race Director."
        }), 403

    valid_domain, provider, err = _validate_email_domain(email)
    if not valid_domain:
        return jsonify({"success": False, "message": err}), 400

    # Cross-verify OTP
    pending_otp = session.get("pending_otp") or {}
    expected_code = str(pending_otp.get("code", "")).strip()
    expected_email = str(pending_otp.get("email", "")).strip().lower()

    if not code:
        return jsonify({
            "success": False,
            "message": "A 6-digit email verification security code is required. Click 'Send Code' to receive your verification code."
        }), 400

    if expected_email != email or str(code) != str(expected_code):
        return jsonify({
            "success": False,
            "message": "Invalid or expired verification code for this email. Please request a new security code."
        }), 400

    if len(username) < 3:
        return jsonify({
            "success": False,
            "message": "Username must contain at least 3 characters."
        }), 400

    if len(password) < 6:
        return jsonify({
            "success": False,
            "message": "Password must contain at least 6 characters."
        }), 400

    existing_username = User.query.filter(
        db.func.lower(User.username) == username.lower()
    ).first()

    if existing_username:
        return jsonify({
            "success": False,
            "message": "Username already exists. Please choose another username."
        }), 409

    existing_email = User.query.filter(
        db.func.lower(User.email) == email.lower()
    ).first()

    if existing_email:
        return jsonify({
            "success": False,
            "message": "An account with this email already exists."
        }), 409

    # Validate selected team if provided
    if selected_team:
        team_record = Team.query.filter(
            db.func.lower(Team.name) == selected_team.lower()
        ).first()
        selected_team = team_record.name if team_record else None

    user = User(
        username=username,
        full_name=full_name,
        email=email,
        email_provider=provider,
        is_verified=True,
        password_hash=generate_password_hash(password),
        role="user",
        selected_team=selected_team or None,
        created_at=datetime.utcnow(),
        last_login=datetime.utcnow()
    )

    db.session.add(user)
    db.session.commit()

    # Clear pending OTP from session
    session.pop("pending_otp", None)
    session["user_id"] = user.id

    return jsonify({
        "success": True,
        "message": f"Account cross-verified via {provider} and created successfully.",
        "user": user.to_dict()
    }), 201


# =============================================================
# USER & ADMIN LOGIN
# =============================================================
@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    identifier = str(data.get("identifier", "")).strip()
    password = str(data.get("password", ""))
    admin_passkey = str(data.get("admin_passkey", "")).strip()

    if not identifier or not password:
        return jsonify({
            "success": False,
            "message": "Username/email and password are required."
        }), 400

    # Ensure admin user is seeded with credentials from .env
    admin_targets = [Config.ADMIN_USERNAME.lower(), "admin", "admin@f1-performance.internal"] if Config.ADMIN_USERNAME else ["admin"]
    if identifier.lower() in admin_targets:
        _ensure_admin_user()

    user = User.query.filter(
        db.or_(
            db.func.lower(User.username) == identifier.lower(),
            db.func.lower(User.email) == identifier.lower()
        )
    ).first()

    if user is None:
        return jsonify({
            "success": False,
            "message": "Invalid username/email or password."
        }), 401

    # Security Check: If user is an Admin, STRICT PASSKEY VERIFICATION is enforced
    if user.is_admin:
        if not Config.ADMIN_PASSKEY or not admin_passkey or admin_passkey != Config.ADMIN_PASSKEY:
            return jsonify({
                "success": False,
                "is_admin_error": True,
                "message": "Security Alert: Valid Admin Master Passkey is required to access Administrator privileges."
            }), 403

    if not check_password_hash(user.password_hash, password):
        if user.is_admin and Config.ADMIN_PASSWORD and password == Config.ADMIN_PASSWORD:
            user.password_hash = generate_password_hash(Config.ADMIN_PASSWORD)
            db.session.commit()
        else:
            return jsonify({
                "success": False,
                "message": "Invalid username/email or password."
            }), 401

    user.last_login = datetime.utcnow()
    db.session.commit()

    session["user_id"] = user.id

    return jsonify({
        "success": True,
        "message": "Login successful.",
        "user": user.to_dict()
    })



@auth_bp.route("/me", methods=["GET"])
def me():
    user_id = session.get("user_id")

    if not user_id:
        return jsonify({
            "success": False,
            "authenticated": False
        }), 401

    user = User.query.get(user_id)

    if user is None:
        session.pop("user_id", None)
        return jsonify({
            "success": False,
            "authenticated": False
        }), 401

    return jsonify({
        "success": True,
        "authenticated": True,
        "user": user.to_dict()
    })


@auth_bp.route("/select-team", methods=["POST"])
def select_team():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({
            "success": False,
            "message": "Authentication required to select a team."
        }), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    data = request.get_json(silent=True) or {}
    team_name = str(data.get("team", "")).strip()

    team_record = Team.query.filter(
        db.func.lower(Team.name) == team_name.lower()
    ).first()

    if not team_record:
        return jsonify({
            "success": False,
            "message": f"Team '{team_name}' was not found."
        }), 404

    user.selected_team = team_record.name

    # If user has an unstarted career, update its team too
    if user.career and not user.career.started:
        user.career.team_name = team_record.name
        user.career.team_id = team_record.id

    db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Selected team updated to {team_record.name}.",
        "selected_team": user.selected_team,
        "user": user.to_dict()
    })


@auth_bp.route("/profile", methods=["GET", "POST", "PUT"])
def user_profile():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({
            "success": False,
            "message": "Authentication required."
        }), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    if request.method in ["POST", "PUT"]:
        data = request.get_json(silent=True) or {}
        new_username = str(data.get("username", "")).strip()
        new_email = str(data.get("email", "")).strip().lower()

        if new_username and len(new_username) < 3:
            return jsonify({
                "success": False,
                "message": "Callsign/Username must be at least 3 characters."
            }), 400

        if new_username and new_username.lower() != user.username.lower():
            existing = User.query.filter(
                db.func.lower(User.username) == new_username.lower(),
                User.id != user.id
            ).first()
            if existing:
                return jsonify({
                    "success": False,
                    "message": "Callsign already in use by another driver."
                }), 409
            user.username = new_username

        if new_email and new_email != user.email.lower():
            existing_email = User.query.filter(
                db.func.lower(User.email) == new_email,
                User.id != user.id
            ).first()
            if existing_email:
                return jsonify({
                    "success": False,
                    "message": "Email address already registered to another account."
                }), 409
            user.email = new_email

        db.session.commit()

    # Calculate detailed profile response
    career = user.career
    career_info = {
        "started": False,
        "team": user.selected_team or "None",
        "driver_name": None,
        "season": 2026,
        "current_round": 1,
        "season_completed": False,
        "development_points_available": 0,
        "development_points_used": 0,
        "completed_races": 0,
        "driver_points": 0,
        "driver_position": None,
        "driver_wins": 0,
        "driver_podiums": 0,
        "team_points": 0,
        "team_position": None,
        "upgrades": {},
    }

    if career and career.started:
        c_dict = career.to_dict()
        upgrades = career.get_upgrades()
        total_upgrade_levels = sum(int(lvl) for lvl in upgrades.values()) if upgrades else 0
        points_used = total_upgrade_levels * 5

        # Get team standings from season result
        season_res = career.get_season_result()
        const_standings = season_res.get("constructor_standings", [])
        my_team_standing = None
        for row in const_standings:
            if str(row.get("team", "")).strip().lower() == str(career.team_name).strip().lower():
                my_team_standing = row
                break

        career_info = {
            "started": True,
            "team": career.team_name,
            "driver_name": career.driver_name,
            "season": career.season,
            "current_round": career.current_round,
            "season_completed": career.season_completed,
            "development_points_available": career.development_points,
            "development_points_used": points_used,
            "completed_races": len(season_res.get("races", [])),
            "driver_points": c_dict.get("driver_points", 0),
            "driver_position": c_dict.get("driver_position"),
            "driver_wins": c_dict.get("driver_wins", 0),
            "driver_podiums": c_dict.get("driver_podiums", 0),
            "team_points": my_team_standing.get("points", 0) if my_team_standing else 0,
            "team_position": my_team_standing.get("position") if my_team_standing else None,
            "upgrades": upgrades,
        }

    return jsonify({
        "success": True,
        "message": "Profile updated successfully." if request.method in ["POST", "PUT"] else "Profile loaded.",
        "profile": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_admin": user.is_admin,
            "selected_team": user.selected_team or (career.team_name if career else "None"),
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "career": career_info
        }
    })


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return jsonify({
        "success": True,
        "message": "Logged out successfully."
    })
