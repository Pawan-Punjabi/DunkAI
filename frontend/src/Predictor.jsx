import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from "recharts";
import { getJSON } from "./api";
import { Logo, Select, useTeams, StatsNote } from "./shared";
import { makeShareBlob } from "./shareCard";

export default function Predictor() {
  const { teams, asOf, error: teamsError } = useTeams();
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");

  const idOf = (abbr) => teams.find((t) => t.abbr === abbr)?.team_id;

  async function predict() {
    setError(""); setResult(null); setLoading(true); setSlow(false);
    const timer = setTimeout(() => setSlow(true), 4000);
    try {
      const data = await getJSON("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home, away }),
      });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      clearTimeout(timer); setLoading(false); setSlow(false);
    }
  }

  async function share() {
    const blob = await makeShareBlob(result);
    const name = `dunkai-${result.away_abbr}-at-${result.home_abbr}.png`;
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "DunkAI prediction" }); return; } catch { /* cancelled: fall through to download */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  const pct = result ? Math.round(result.home_win_probability * 100) : 50;
  const chartData = result?.top_factors.map((f) => ({ name: f.label, impact: f.impact, favors: f.favors })) ?? [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-4">
        <Select label="Home team" value={home} onChange={setHome} teams={teams} />
        <Select label="Away team" value={away} onChange={setAway} teams={teams} />
      </div>

      <button onClick={predict} disabled={!home || !away || loading}
        className="mt-5 w-full rounded bg-yellow-400 text-black font-bold py-3 disabled:opacity-40">
        {loading ? "Predicting..." : "Predict winner"}
      </button>

      {slow && <p className="mt-3 text-yellow-300">Waking up the server, this can take up to a minute...</p>}
      {(error || teamsError) && <p className="mt-3 text-red-400">{error || teamsError}</p>}

      {result && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <Logo id={idOf(result.home_abbr)} />
              <p>{result.home}</p>
              <p className="text-xs text-neutral-400">HOME</p>
            </div>
            <div className="text-center">
              <p className="font-title text-5xl text-yellow-400">{result.predicted_winner}</p>
              <p className="text-neutral-300">predicted to win ({Math.round(result.confidence * 100)}%)</p>
            </div>
            <div className="text-center">
              <Logo id={idOf(result.away_abbr)} />
              <p>{result.away}</p>
              <p className="text-xs text-neutral-400">AWAY</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-sm mb-1">
              <span>{result.home_abbr} {pct}%</span><span>{100 - pct}% {result.away_abbr}</span>
            </div>
            <div className="h-4 rounded bg-neutral-600 overflow-hidden">
              <div className="h-full bg-yellow-400 transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Game story */}
          <div className="mt-6 rounded bg-[#1f1f1f] p-4 border-l-4 border-yellow-400">
            <p className="text-xs text-yellow-400 uppercase mb-1">Game story</p>
            <p className="text-neutral-200">{result.story}</p>
          </div>

          <button onClick={share}
            className="mt-3 rounded border border-yellow-400 text-yellow-400 px-4 py-2 text-sm hover:bg-yellow-400 hover:text-black">
            Share or download prediction card
          </button>

          {/* Tier + upset */}
          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <div className="rounded bg-[#1f1f1f] p-4">
              <p className="text-xs text-yellow-400 uppercase">Confidence tier</p>
              <p className="font-title text-3xl">{result.tier}</p>
              <p className="text-sm text-neutral-400">
                {result.tier_accuracy != null
                  ? `On ${result.tier_games} unseen games, picks in this tier were right ${(result.tier_accuracy * 100).toFixed(0)}% of the time.`
                  : "Not enough unseen games to measure this tier."}
              </p>
            </div>
            <div className={`rounded p-4 ${result.upset_watch ? "bg-yellow-400 text-black" : "bg-[#1f1f1f]"}`}>
              <p className={`text-xs uppercase ${result.upset_watch ? "" : "text-yellow-400"}`}>
                {result.upset_watch ? "Upset watch" : "Underdog"}
              </p>
              <p className="font-title text-3xl">{result.underdog} {Math.round(result.underdog_probability * 100)}%</p>
              <p className="text-sm">
                {result.underdog_reasons.length
                  ? "Their edge: " + result.underdog_reasons.map((r) => r.label.toLowerCase()).join(", ") + "."
                  : "No stat clearly favors them."}
              </p>
            </div>
          </div>

          {/* Matchup breakdown */}
          <h3 className="font-title text-2xl mt-8 text-yellow-400">MATCHUP BREAKDOWN</h3>
          <p className="text-sm text-neutral-400 mb-2">
            Each score ranks the team against the other 29 (100 = best in the league, 0 = worst).
          </p>
          <div className="grid sm:grid-cols-2 gap-4 items-center">
            <div className="h-80">
              <ResponsiveContainer>
                <RadarChart data={result.breakdown} outerRadius="70%">
                  <PolarGrid stroke="#555" />
                  <PolarAngleAxis dataKey="category" stroke="#ddd" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name={result.home_abbr} dataKey="home" stroke="#F5C518" fill="#F5C518" fillOpacity={0.35} />
                  <Radar name={result.away_abbr} dataKey="away" stroke="#9aa0a6" fill="#9aa0a6" fillOpacity={0.25} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {result.breakdown.map((b) => {
                const homeBetter = b.home >= b.away;
                return (
                  <div key={b.category} className="text-sm">
                    <div className="flex justify-between">
                      <span className={homeBetter ? "text-yellow-400 font-bold" : "text-neutral-400"}>{result.home_abbr} {Math.round(b.home)}</span>
                      <span className="text-neutral-300">{b.category}</span>
                      <span className={!homeBetter ? "text-yellow-400 font-bold" : "text-neutral-400"}>{Math.round(b.away)} {result.away_abbr}</span>
                    </div>
                    <div className="flex h-2 gap-1">
                      <div className="flex-1 bg-neutral-700 flex justify-end"><div className="bg-yellow-400" style={{ width: `${b.home}%` }} /></div>
                      <div className="flex-1 bg-neutral-700"><div className="bg-neutral-400 h-full" style={{ width: `${b.away}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Why */}
          <h3 className="font-title text-2xl mt-8 text-yellow-400">WHY THIS PREDICTION</h3>
          <p className="text-sm text-neutral-400 mb-2">
            Bars to the right favor the home team, bars to the left favor the away team.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" stroke="#aaa" />
                <YAxis type="category" dataKey="name" width={150} stroke="#ddd" />
                <Tooltip />
                <Bar dataKey="impact">
                  {chartData.map((d, i) => <Cell key={i} fill={d.favors === "home" ? "#F5C518" : "#888"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <StatsNote asOf={asOf} />
    </div>
  );
}