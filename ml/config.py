"""Configuration for the RestroManager recommender"""

from pathlib import Path
import os

from dotenv import load_dotenv

ML_DIR = Path(__file__).resolve().parent
SERVER_ENV_PATH = ML_DIR.parent / "server" / ".env"
ARTIFACTS_DIR = ML_DIR / "artifacts"

load_dotenv(SERVER_ENV_PATH)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "hacka47_restaurant"),
}

# Single seed used by every random step
RANDOM_STATE = 47

TOP_K = 3
N_RECOMMENDATIONS = 10
MIN_ORDERS = 200
BOOTSTRAP_SAMPLES = 1000
COOCCURRENCE_MIN_SUPPORTS = (5, 10, 20)
