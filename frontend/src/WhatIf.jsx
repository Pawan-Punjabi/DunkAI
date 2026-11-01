import { useEffect, useState } from "react";
import { getJSON } from "./api";
import { Select, useTeams, StatsNote } from "./shared";

const KNOBS = [
  { stat: "PLUS_MINUS", label: "Point margin (per game)", min: -10, max: 10, step: 0.5, unit: "" },
  { stat: "FG3M", label: "3-pointers made", min: -5, max: 5, step: 0.5, unit: "" },
  { stat: "FG_PCT", label: "Field goal %", min: -5, max: 5, step: 0.5, unit: " pts" },
  { stat: "AST", label: "Assists", min: -6, max: 6, step: 0.5, unit: "" },
  { stat: "REB", label: "Total rebounds", min: -8, max: 8, step: 0.5, unit: "" },
  { stat: "TOV", label: "Turnovers", min: -5, max: 5, step: 0.5, unit: "" },
  { stat: "STL", label: "Steals", min: -3, max: 3, step: 0.5, unit: "" },
  { stat: "BLK", label: "Blocks", min: -3, max: 3, step: 0.5, unit: "" },
];
const ZERO = Object.fromEntries(KNOBS.map((k) => [k.stat, 0]));

export default function WhatIf() {
  const { teams, asOf, error: teamsError } = useTeams();
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [side, setSide] = useState("home");
  const [vals, setVals] = useState(ZERO);
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!home || !away) { setRes(null); return; }
    const timer = setTimeout(() => {
      setError("");
      getJSON("/whatif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home, away, side, changes: vals }),
      }).then(setRes).catch((e) => { setRes(null); setError(e.message); });
    }, 300);
    return () => clearTimeout(timer);
  }, [home, away, side, vals]);

  const target = side === "home" ? home : away;
  const base = res ? Math.round(res.base_home_win_probability * 100) : 0;
  const now = res ? Math.round(res.new_home_win_probability * 100) : 0;
  const delta = res ? res.change * 100 : 0;
  const changed = Object.values(vals).some((v) => v !== 0);

  return (
    <div>
      <p className="text-neutral-300 mb-4">
        Pick a matchup, then change one team's recent numbers and watch the model's win probability move.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Select label="Home team" value={home} onChange={setHome} teams={teams} />
        <Select label="Away team" value={away} onChange={setAway} teams={teams} />
      </div>
      {(error || teamsError) && <p className="mt-3 text-red-400">{error || teamsError}</p>}

      {home && away && (
        <>
          <div className="mt-5 flex gap-2 items-center">
            <span className="text-sm text-neutral-400">Adjust:</span>
            {["home", "away"].map((s) => (
              <button key={s} onClick={() => setSide(s)}
                className={`px-3 py-1 rounded text-sm ${side === s ? "bg-yellow-400 text-black font-bold" : "bg-[#1f1f1f]"}`}>
                {s === "home" ? home : away} ({s})
              </button>
            ))}
            <button onClick={() => setVals(ZERO)} className="ml-auto text-sm text-yellow-400 underline">Reset</button>
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-4">
            {KNOBS.map((k) => (
              <label key={k.stat} className="block text-sm">
                <div className="flex justify-between">
                  <span>{k.label}</span>
                  <span className={vals[k.stat] ? "text-yellow-400" : "text-neutral-400"}>
                    {vals[k.stat] > 0 ? "+" : ""}{vals[k.stat]}{k.unit}
                  </span>
                </div>
                <input type="range" min={k.min} max={k.max} step={k.step} value={vals[k.stat]}
                  onChange={(e) => setVals({ ...vals, [k.stat]: parseFloat(e.target.value) })}
                  className="w-full accent-yellow-400" />
              </label>
            ))}
          </div>

          {res && (
            <div className="mt-6 rounded bg-[#1f1f1f] p-4">
              <p className="text-xs text-yellow-400 uppercase">Home win probability ({home})</p>
              <div className="flex items-end gap-4">
                <p className="font-title text-5xl">{now}%</p>
                <p className={`text-lg ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-neutral-400"}`}>
                  {changed ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts vs baseline ${base}%` : "baseline"}
                </p>
              </div>
              <div className="relative h-4 rounded bg-neutral-600 mt-3 overflow-hidden">
                <div className="absolute h-full bg-yellow-400 transition-all duration-300" style={{ width: `${now}%` }} />
                <div className="absolute h-full w-0.5 bg-white" style={{ left: `${base}%` }} title="baseline" />
              </div>
              {res.winner_flipped && (
                <p className="mt-3 text-yellow-300 font-bold">
                  These changes flip the model's pick to {res.new_home_win_probability >= 0.5 ? home : away}.
                </p>
              )}
              {changed && (
                <p className="mt-2 text-sm text-neutral-400">
                  Changes applied to {target} only.
                </p>
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-neutral-400">
            This shows the model's sensitivity, not cause and effect. Real stats move together (more 3s usually means more points),
            so changing one at a time can describe a team that wouldn't exist.
          </p>
        </>
      )}
      <StatsNote asOf={asOf} />
    </div>
  );
}