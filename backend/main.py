import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

HERE = Path(__file__).parent

# ---------------- Load everything once ----------------
model = xgb.XGBClassifier()
model.load_model(HERE / "xgb_model.json")
FEATS = json.load(open(HERE / "feature_list.json"))
LOOKUP = json.load(open(HERE / "team_stats.json"))
METRICS = json.load(open(HERE / "metrics.json"))
TIERS = json.load(open(HERE / "tiers.json"))["tiers"]

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

LOWER_IS_BETTER = {"TOV", "PF"}

CATEGORIES = {
    "Scoring": ["PTS", "FGM", "FG3M", "FTM"],
    "Shooting": ["FG_PCT", "FG3_PCT", "FT_PCT"],
    "Ball control": ["AST", "TOV"],
    "Rebounding": ["OREB", "DREB"],
    "Defense": ["STL", "BLK", "PF"],
    "Form": ["PLUS_MINUS"],
}
CATEGORIES = {c: [s for s in stats if s in BASE_STATS] for c, stats in CATEGORIES.items()}
PROFILE_STATS = [s for stats in CATEGORIES.values() for s in stats]


# ---------------- Helpers ----------------
def tier_for(conf: float):
    for t in TIERS:
        if t["min"] <= conf < t["max"]:
            return t
    return TIERS[-1]


def make_row(h: dict, a: dict) -> pd.DataFrame:
    return pd.DataFrame([{f"{s}_DIFF": h[s] - a[s] for s in BASE_STATS}])[FEATS]


def fmt_value(stat: str, v: float) -> str:
    return f"{v * 100:.1f}%" if stat.endswith("_PCT") else f"{v:.1f}"


def fmt_diff(stat: str, d: float) -> str:
    return f"{abs(d) * 100:.1f} pts" if stat.endswith("_PCT") else f"{abs(d):.1f}"


# ---- Percentiles across the 30 teams (0 = worst, 100 = best) ----
def _build_percentiles():
    raw = {a: {} for a in TEAMS}
    n = len(TEAMS)
    for s in BASE_STATS:
        vals = np.array([TEAMS[a]["stats"][s] for a in TEAMS])
        for a in TEAMS:
            v = TEAMS[a]["stats"][s]
            raw[a][s] = float((vals < v).sum() / max(n - 1, 1) * 100)
    return raw


PCT = _build_percentiles()


def good_pct(abbr: str, stat: str) -> float:
    p = PCT[abbr][stat]
    return 100 - p if stat in LOWER_IS_BETTER else p


def category_scores(abbr: str) -> dict:
    return {
        c: round(float(np.mean([good_pct(abbr, s) for s in stats])), 1)
        for c, stats in CATEGORIES.items() if stats
    }


# ---- 30x30 heatmap, computed once at startup ----
def _build_heatmap():
    abbrs = sorted(TEAMS, key=lambda x: TEAMS[x]["name"])
    n = len(abbrs)
    idx = {a: i for i, a in enumerate(abbrs)}
    rows, pairs = [], []
    for h in abbrs:
        for a in abbrs:
            if h == a:
                continue
            hs, as_ = TEAMS[h]["stats"], TEAMS[a]["stats"]
            rows.append({f"{s}_DIFF": hs[s] - as_[s] for s in BASE_STATS})
            pairs.append((h, a))
    probs = model.predict_proba(pd.DataFrame(rows)[FEATS])[:, 1]

    matrix = [[None] * n for _ in range(n)]
    for (h, a), p in zip(pairs, probs):
        matrix[idx[h]][idx[a]] = round(float(p), 4)

    # Rating = average win chance against every other team, half at home, half away
    ratings = []
    for t in abbrs:
        i = idx[t]
        home_wins = [matrix[i][j] for j in range(n) if j != i]
        away_wins = [1 - matrix[j][i] for j in range(n) if j != i]
        r = (np.mean(home_wins) + np.mean(away_wins)) / 2 * 100
        ratings.append({"abbr": t, "name": TEAMS[t]["name"], "rating": round(float(r), 1)})
    ratings.sort(key=lambda x: x["rating"], reverse=True)
    for rank, r in enumerate(ratings, 1):
        r["rank"] = rank

    scored = sorted(zip(pairs, probs), key=lambda x: x[1])

    def item(pair, p):
        h, a = pair
        return {"home": h, "away": a, "home_win_probability": round(float(p), 4)}

    return {
        "teams": [{"abbr": a, "name": TEAMS[a]["name"], "team_id": TEAMS[a]["team_id"]} for a in abbrs],
        "matrix": matrix,
        "ratings": ratings,
        "most_home_favored": [item(p, v) for p, v in reversed(scored[-5:])],
        "most_road_favored": [item(p, v) for p, v in scored[:5]],
        "stats_as_of": LOOKUP["as_of"],
    }


HEATMAP = _build_heatmap()
RATING = {r["abbr"]: r for r in HEATMAP["ratings"]}


# ---- Explanation of one matchup ----
def explain(home: str, away: str, h: dict | None = None, a: dict | None = None):
    h = h or TEAMS[home]["stats"]
    a = a or TEAMS[away]["stats"]
    row = make_row(h, a)
    prob_home = float(model.predict_proba(row)[:, 1][0])
    contribs = model.get_booster().predict(xgb.DMatrix(row), pred_contribs=True)[0][:-1]
    factors = []
    for feat, c in zip(FEATS, contribs):
        base = feat.replace("_DIFF", "")
        factors.append({
            "feature": feat,
            "label": NICE.get(base, base),
            "difference": round(float(row[feat].iloc[0]), 4),  # home minus away
            "impact": round(float(c), 4),
            "favors": "home" if c > 0 else "away",
        })
    factors.sort(key=lambda f: abs(f["impact"]), reverse=True)
    return prob_home, factors


def build_story(home, away, prob_home, confidence, tier_name, factors):
    win_side = "home" if prob_home >= 0.5 else "away"
    winner = home if win_side == "home" else away
    loser = away if win_side == "home" else home
    pro = [f for f in factors if f["favors"] == win_side][:3]
    con = [f for f in factors if f["favors"] != win_side][:2]

    def desc(f):
        base = f["feature"].replace("_DIFF", "")
        d = f["difference"]
        if abs(d) < 1e-9:
            return f["label"].lower()
        who = home if d > 0 else away
        return f"{f['label'].lower()} ({who} higher by {fmt_diff(base, d)})"

    def join(items):
        items = [desc(i) for i in items]
        return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]

    text = f"{TEAMS[winner]['name']} is the model's pick at {confidence:.0%} ({tier_name} tier)."
    if pro:
        text += f" The main reasons are {join(pro)}."
    if con:
        text += f" Working for {TEAMS[loser]['name']}: {join(con)}."
    if confidence < 0.58:
        text += " This is a close call, so an upset would not be surprising."
    return text


# ---------------- App ----------------
app = FastAPI(title="NBA Game Outcome Prediction API")

origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    home: str
    away: str


class WhatIfRequest(BaseModel):
    home: str
    away: str
    side: str = "home"                 # which team's stats to change: "home" or "away"
    changes: dict[str, float] = {}     # e.g. {"FG3M": 3, "FG_PCT": 2}  (percent stats in points)


def check_teams(home: str, away: str):
    home, away = home.upper().strip(), away.upper().strip()
    if home == away:
        raise HTTPException(status_code=400, detail="Home and away teams must be different.")
    for abbr in (home, away):
        if abbr not in TEAMS:
            raise HTTPException(status_code=404, detail=f"Unknown team: {abbr}")
    return home, away


@app.get("/")
def root():
    return {"name": "DunkAI API", "docs": "/docs"}


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


@app.get("/tiers")
def tiers():
    return {"tiers": TIERS}


@app.get("/heatmap")
def heatmap():
    return HEATMAP


@app.get("/team/{abbr}")
def team_profile(abbr: str):
    abbr = abbr.upper().strip()
    if abbr not in TEAMS:
        raise HTTPException(status_code=404, detail=f"Unknown team: {abbr}")
    t = TEAMS[abbr]

    stats = []
    for s in PROFILE_STATS:
        goodness = good_pct(abbr, s)
        rank = 1 + sum(1 for o in TEAMS if good_pct(o, s) > goodness)
        stats.append({
            "stat": s, "label": NICE.get(s, s),
            "display": fmt_value(s, t["stats"][s]),
            "percentile": round(goodness, 1),
            "rank": rank,
            "lower_is_better": s in LOWER_IS_BETTER,
        })
    ordered = sorted(stats, key=lambda x: x["percentile"], reverse=True)

    return {
        "abbr": abbr, "name": t["name"], "team_id": t["team_id"],
        "last_game": t["last_game"], "stats_as_of": LOOKUP["as_of"],
        "model_rating": RATING[abbr]["rating"], "rating_rank": RATING[abbr]["rank"],
        "categories": category_scores(abbr),
        "strengths": [s for s in ordered[:3] if s["percentile"] >= 60],
        "weaknesses": [s for s in ordered[::-1][:3] if s["percentile"] <= 40],
        "stats": stats,
    }


@app.post("/predict")
def predict(req: PredictRequest):
    home, away = check_teams(req.home, req.away)
    prob_home, factors = explain(home, away)

    win_side = "home" if prob_home >= 0.5 else "away"
    winner = home if win_side == "home" else away
    confidence = prob_home if win_side == "home" else 1 - prob_home

    t = tier_for(confidence)
    underdog = away if win_side == "home" else home
    underdog_prob = 1 - confidence
    underdog_side = "away" if win_side == "home" else "home"
    underdog_reasons = [f for f in factors if f["favors"] == underdog_side][:3]

    hc, ac = category_scores(home), category_scores(away)
    breakdown = [{"category": c, "home": hc[c], "away": ac[c]} for c in hc]

    return {
        "home": TEAMS[home]["name"], "away": TEAMS[away]["name"],
        "home_abbr": home, "away_abbr": away,
        "home_win_probability": round(prob_home, 4),
        "away_win_probability": round(1 - prob_home, 4),
        "predicted_winner": winner,
        "confidence": round(confidence, 4),
        "tier": t["name"],
        "tier_accuracy": t["accuracy"],
        "tier_games": t["games"],
        "underdog": underdog,
        "underdog_probability": round(underdog_prob, 4),
        "upset_watch": underdog_prob >= 0.40,
        "underdog_reasons": underdog_reasons,
        "top_factors": factors[:6],
        "breakdown": breakdown,
        "story": build_story(home, away, prob_home, confidence, t["name"], factors),
        "stats_as_of": LOOKUP["as_of"],
        "disclaimer": "Academic project. Not for betting.",
    }


@app.post("/whatif")
def whatif(req: WhatIfRequest):
    home, away = check_teams(req.home, req.away)
    if req.side not in ("home", "away"):
        raise HTTPException(status_code=400, detail="side must be 'home' or 'away'.")

    h, a = dict(TEAMS[home]["stats"]), dict(TEAMS[away]["stats"])
    target = h if req.side == "home" else a

    applied = {}
    for stat, delta in req.changes.items():
        if stat not in BASE_STATS:
            raise HTTPException(status_code=400, detail=f"Unknown stat: {stat}")
        if abs(delta) < 1e-9:
            continue
        real = delta / 100 if stat.endswith("_PCT") else delta  # percent stats arrive in points
        target[stat] = target[stat] + real
        applied[stat] = delta

    base_prob = float(model.predict_proba(make_row(TEAMS[home]["stats"], TEAMS[away]["stats"]))[:, 1][0])
    new_prob, factors = explain(home, away, h, a)

    return {
        "home_abbr": home, "away_abbr": away, "side": req.side, "applied": applied,
        "base_home_win_probability": round(base_prob, 4),
        "new_home_win_probability": round(new_prob, 4),
        "change": round(new_prob - base_prob, 4),
        "winner_flipped": (base_prob >= 0.5) != (new_prob >= 0.5),
        "top_factors": factors[:5],
        "note": "Shows the model's sensitivity, not a guarantee. Real stats move together.",
    }