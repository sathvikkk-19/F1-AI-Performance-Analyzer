from flask import Blueprint, jsonify, request, session
from backend.extensions import db
from backend.models.user import User
from backend.models.career import Career


admin_bp = Blueprint(
    "admin",
    __name__,
    url_prefix="/api/admin"
)


def _check_admin():
    user_id = session.get("user_id")
    if not user_id:
        return None, (jsonify({"success": False, "message": "Authentication required."}), 401)
    
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return None, (jsonify({"success": False, "message": "Admin privileges required."}), 403)

    return user, None


@admin_bp.route("/users", methods=["GET"])
def get_all_users():
    admin_user, err = _check_admin()
    if err:
        return err

    users = User.query.order_by(User.created_at.desc()).all()
    user_list = []

    total_races = 0
    active_careers = 0
    team_counts = {}

    for u in users:
        u_dict = u.to_dict(include_career=False)
        career_obj = u.career
        if career_obj and career_obj.started:
            active_careers += 1
            career_dict = career_obj.to_dict()
            u_dict["career"] = career_dict
            total_races += career_dict.get("completed_races_count", 0)
        else:
            u_dict["career"] = None

        if u.selected_team:
            team_counts[u.selected_team] = team_counts.get(u.selected_team, 0) + 1

        user_list.append(u_dict)

    return jsonify({
        "success": True,
        "admin": admin_user.username,
        "stats": {
            "total_users": len(users),
            "active_careers": active_careers,
            "total_races_simulated": total_races,
            "team_distribution": team_counts
        },
        "users": user_list
    })


@admin_bp.route("/user/<int:user_id>", methods=["GET"])
def get_user_details(user_id):
    admin_user, err = _check_admin()
    if err:
        return err

    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    return jsonify({
        "success": True,
        "user": user.to_dict(include_career=True)
    })


@admin_bp.route("/user/<int:user_id>/reset-career", methods=["POST"])
def reset_user_career(user_id):
    admin_user, err = _check_admin()
    if err:
        return err

    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    if user.career:
        db.session.delete(user.career)
        db.session.commit()

    return jsonify({
        "success": True,
        "message": f"Career reset for user {user.username}."
    })
