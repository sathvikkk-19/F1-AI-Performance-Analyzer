from backend.extensions import db
from datetime import datetime


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    username = db.Column(
        db.String(80),
        unique=True,
        nullable=False
    )

    email = db.Column(
        db.String(120),
        unique=True,
        nullable=False
    )

    password_hash = db.Column(
        db.String(255),
        nullable=False
    )

    role = db.Column(
        db.String(20),
        default="user",
        nullable=False
    )

    selected_team = db.Column(
        db.String(100),
        nullable=True
    )

    last_login = db.Column(
        db.DateTime,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    career = db.relationship(
        "Career",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )

    @property
    def is_admin(self):
        return (self.role or "").lower() == "admin" or (self.username or "").lower() == "admin"

    def to_dict(self, include_career=True):
        data = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": "admin" if self.is_admin else (self.role or "user"),
            "is_admin": self.is_admin,
            "selected_team": self.selected_team,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "has_career": bool(self.career and self.career.started)
        }

        if include_career and self.career:
            data["career"] = self.career.to_dict()

        return data
