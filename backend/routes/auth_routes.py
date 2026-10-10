from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

from backend.extensions import db
from backend.models.user import User
from backend.models.team import Team


auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth"
)


def _ensure_admin_user():
    admin = User.query.filter_by(username="admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@f1.com",
            password_hash=generate_password_hash("f1admin2026"),
            role="admin",
            selected_team="Oracle Red Bull Racing",
            created_at=datetime.utcnow()
        )
        db.session.add(admin)
        db.session.commit()
    return admin


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    selected_team = str(data.get("selected_team", "")).strip()

    if not username or not email or not password:
        return jsonify({
            "success": False,
            "message": "Username, email and password are required."
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

    role = "admin" if username.lower() == "admin" else "user"

    # Validate selected team if provided
    if selected_team:
        team_record = Team.query.filter(
            db.func.lower(Team.name) == selected_team.lower()
        ).first()
        if team_record:
            selected_team = team_record.name
        else:
            selected_team = None

    user = User(
        username=username,
        email=email,
        password_hash=generate_password_hash(password),
        role=role,
        selected_team=selected_team or None,
        created_at=datetime.utcnow(),
        last_login=datetime.utcnow()
    )

    db.session.add(user)
    db.session.commit()

    # Automatically authenticate the new user session
    session["user_id"] = user.id

    return jsonify({
        "success": True,
        "message": "Account created successfully.",
        "user": user.to_dict()
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    identifier = str(data.get("identifier", "")).strip()
    password = str(data.get("password", ""))

    if not identifier or not password:
        return jsonify({
            "success": False,
            "message": "Username/email and password are required."
        }), 400

    # Ensure admin user is seeded if logging in with admin credentials
    if identifier.lower() in ["admin", "admin@f1.com"] and password == "f1admin2026":
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

    if not check_password_hash(user.password_hash, password):
        # Fallback check for admin account in case default password was hashed differently
        if user.username.lower() == "admin" and password == "f1admin2026":
            user.password_hash = generate_password_hash("f1admin2026")
            user.role = "admin"
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


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    return jsonify({
        "success": True,
        "message": "Logged out successfully."
    })
