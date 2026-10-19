import os
from dotenv import load_dotenv

BASE_DIR = os.path.abspath(
    os.path.dirname(__file__)
)

PROJECT_ROOT = os.path.abspath(
    os.path.join(BASE_DIR, "..")
)

# Load private local environment file (.env is git-ignored for security)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

DATABASE_PATH = os.path.join(
    BASE_DIR,
    "..",
    "database",
    "f1.db"
)


class Config:

    SQLALCHEMY_DATABASE_URI = (
        "sqlite:///"
        + os.path.abspath(DATABASE_PATH)
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SECRET_KEY = os.environ.get(
        "F1_SECRET_KEY",
        "f1-ai-engine-development-secret-change-before-deployment"
    )

    # Exclusive Admin Access Credentials & Master Passkey
    # Sourced strictly from local .env or system environment variables.
    # No sensitive administrator credentials or passkeys are hardcoded in the codebase.
    ADMIN_USERNAME = os.environ.get("F1_ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("F1_ADMIN_PASSWORD", "")
    ADMIN_PASSKEY = os.environ.get("F1_ADMIN_PASSKEY", "")
