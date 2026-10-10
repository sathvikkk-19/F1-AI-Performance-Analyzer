import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from backend.config import Config
from backend.extensions import db

from backend.routes.strategy_routes import strategy_bp
from backend.routes.team_routes import team_bp
from backend.routes.driver_routes import driver_bp
from backend.routes.circuit_routes import circuit_bp
from backend.routes.auth_routes import auth_bp
from backend.routes.career_routes import career_bp
from backend.routes.admin_routes import admin_bp


BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

app = Flask(__name__)

app.config.from_object(Config)

app.secret_key = Config.SECRET_KEY

CORS(
    app,
    supports_credentials=True
)

db.init_app(app)

app.register_blueprint(strategy_bp)
app.register_blueprint(team_bp)
app.register_blueprint(driver_bp)
app.register_blueprint(circuit_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(career_bp)
app.register_blueprint(admin_bp)


@app.route("/")
def home():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return send_from_directory(FRONTEND_DIR, "index.html")
    return jsonify({
        "message": "F1 AI Engine Backend",
        "status": "running"
    })


@app.route("/api/health")
def health():
    return jsonify({
        "status": "healthy"
    })


@app.route("/<path:filename>")
def serve_frontend_files(filename):
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.exists(file_path):
        return send_from_directory(FRONTEND_DIR, filename)
    return jsonify({"error": f"File '{filename}' not found."}), 404


with app.app_context():
    db.create_all()


if __name__ == "__main__":
    app.run(
        debug=True,
        port=5000
    )
