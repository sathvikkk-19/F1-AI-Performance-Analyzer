import json
from datetime import datetime
from backend.extensions import db


class Career(db.Model):
    __tablename__ = "careers"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    team_name = db.Column(db.String(100), nullable=False)
    team_id = db.Column(db.Integer, nullable=True)
    driver_id = db.Column(db.Integer, nullable=True)
    driver_name = db.Column(db.String(100), nullable=True)
    season = db.Column(db.Integer, default=2026)
    current_round = db.Column(db.Integer, default=1)
    started = db.Column(db.Boolean, default=False)
    season_completed = db.Column(db.Boolean, default=False)
    development_points = db.Column(db.Integer, default=20)
    upgrades_json = db.Column(db.Text, default="{}")
    baseline_car_json = db.Column(db.Text, default="{}")
    season_result_json = db.Column(db.Text, default="{}")
    last_reward_json = db.Column(db.Text, default="{}")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship("User", back_populates="career")

    def get_upgrades(self):
        try:
            return json.loads(self.upgrades_json or "{}")
        except Exception:
            return {}

    def set_upgrades(self, val):
        self.upgrades_json = json.dumps(val or {})

    def get_baseline_car(self):
        try:
            return json.loads(self.baseline_car_json or "{}")
        except Exception:
            return {}

    def set_baseline_car(self, val):
        self.baseline_car_json = json.dumps(val or {})

    def get_season_result(self):
        try:
            return json.loads(self.season_result_json or "{}")
        except Exception:
            return {"races": [], "driver_standings": [], "constructor_standings": []}

    def set_season_result(self, val):
        self.season_result_json = json.dumps(val or {})

    def get_last_reward(self):
        try:
            return json.loads(self.last_reward_json or "{}")
        except Exception:
            return None

    def set_last_reward(self, val):
        self.last_reward_json = json.dumps(val) if val else "{}"

    def to_dict(self):
        season_res = self.get_season_result()
        races = season_res.get("races", [])
        driver_standings = season_res.get("driver_standings", [])
        
        my_driver_standing = None
        for d in driver_standings:
            if self.driver_id is not None and str(d.get("driver_id")) == str(self.driver_id):
                my_driver_standing = d
                break
            elif self.driver_name and str(d.get("driver", "")).strip().lower() == str(self.driver_name).strip().lower():
                my_driver_standing = d
                break

        return {
            "id": self.id,
            "user_id": self.user_id,
            "team": self.team_name,
            "team_id": self.team_id,
            "driver_id": self.driver_id,
            "driver_name": self.driver_name,
            "season": self.season,
            "current_round": self.current_round,
            "started": self.started,
            "season_completed": self.season_completed,
            "development_points": self.development_points,
            "upgrades": self.get_upgrades(),
            "baseline_car": self.get_baseline_car(),
            "season_result": season_res,
            "last_development_reward": self.get_last_reward(),
            "completed_races_count": len(races),
            "driver_points": my_driver_standing.get("points", 0) if my_driver_standing else 0,
            "driver_position": my_driver_standing.get("position") if my_driver_standing else None,
            "driver_wins": my_driver_standing.get("wins", 0) if my_driver_standing else 0,
            "driver_podiums": my_driver_standing.get("podiums", 0) if my_driver_standing else 0,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
