import json
import os
from pathlib import Path

import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

HERE = Path(__file__).parent

# ---- Load everything once, at startup ----
model = xgb.XGBClassifier()
model.load_model(HERE / "xgb_model.json")
FEATS = json.load(open(HERE / "feature_list.json"))
LOOKUP = json.load(open(HERE / "team_stats.json"))
METRICS = json.load(open(HERE / "metrics.json"))

TEAMS = {t["abbr"]: t for t in LOOKUP["teams"]}
BASE_STATS = [f.replace("_DIFF", "") for f in FEATS]

NICE = {
    "PLUS_MINUS": "Recent point margin", "PTS": "Points scored",
    "FG_PCT": "Field goal %", "FG3_PCT": "3-point %", "FT_PCT": "Free throw %",
    "FGM": "Field goals made", "FGA": "Field goals attempted",
    "FG3M": "3-pointers made", "FG3A": "3-pointers attempted",
    "FTM": "Free throws made", "FTA": "Free throws attempted",
    "AST": "Assists", "TOV": "Turnovers", "OREB": "Offensive rebounds",
    "DREB": "Defensive rebounds", "REB": "Total rebounds",
    "STL": "Steals", "BLK": "Blocks", "PF": "Personal fouls",
}

app = FastAPI(title="NBA Game Outcome Prediction API")

# Comma-separated list of allowed website addresses, set as an environment variable.
origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    home: str  # team abbreviation, e.g. "BOS"
    away: str  # team abbreviation, e.g. "LAL"


@app.get("/health")
def health():
    return {"status": "ok", "stats_as_of": LOOKUP["as_of"], "teams": len(TEAMS)}


@app.get("/teams")
def teams():
    return {
        "stats_as_of": LOOKUP["as_of"],
        "teams": sorted(
            [{"team_id": t["team_id"], "abbr": t["abbr"], "name": t["name"],
              "last_game": t["last_game"]} for t in TEAMS.values()],
            key=lambda x: x["name"],
        ),
    }


@app.get("/metrics")
def metrics():
    return METRICS


@app.post("/predict")
def predict(req: PredictRequest):
    home, away = req.home.upper().strip(), req.away.upper().strip()

    if home == away:
        raise HTTPException(status_code=400, detail="Home and away teams must be different.")
    for abbr in (home, away):
        if abbr not in TEAMS:
            raise HTTPException(status_code=404, detail=f"Unknown team: {abbr}")

    h, a = TEAMS[home]["stats"], TEAMS[away]["stats"]
    row = pd.DataFrame([{f"{s}_DIFF": h[s] - a[s] for s in BASE_STATS}])[FEATS]

    prob_home = float(model.predict_proba(row)[:, 1][0])

    # Per-feature contributions (last column is the model's bias term, so drop it)
    contribs = model.get_booster().predict(xgb.DMatrix(row), pred_contribs=True)[0][:-1]
    factors = []
    for feat, c in zip(FEATS, contribs):
        base = feat.replace("_DIFF", "")
        factors.append({
            "feature": feat,
            "label": NICE.get(base, base),
            "difference": round(float(row[feat].iloc[0]), 3),  # home minus away
            "impact": round(float(c), 4),
            "favors": "home" if c > 0 else "away",
        })
    factors.sort(key=lambda f: abs(f["impact"]), reverse=True)

    winner = home if prob_home >= 0.5 else away
    confidence = prob_home if prob_home >= 0.5 else 1 - prob_home

    return {
        "home": TEAMS[home]["name"], "away": TEAMS[away]["name"],
        "home_abbr": home, "away_abbr": away,
        "home_win_probability": round(prob_home, 4),
        "away_win_probability": round(1 - prob_home, 4),
        "predicted_winner": winner,
        "confidence": round(confidence, 4),
        "top_factors": factors[:6],
        "stats_as_of": LOOKUP["as_of"],
        "disclaimer": "Academic project. Not for betting.",
    }