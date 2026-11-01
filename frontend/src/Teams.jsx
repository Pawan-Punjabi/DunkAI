import { useEffect, useState } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
import { getJSON } from "./api";
import { Logo, Select, useTeams, StatsNote } from "./shared";

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function Teams() {
  const { teams, asOf, error: teamsError } = useTeams();
  const [abbr, setAbbr] = useState("");
  const [p, setP] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abbr) { setP(null); return; }
    setError("");
    getJSON(`/team/${abbr}`).then(setP).catch((e) => setError(e.message));
  }, [abbr]);

  const radar = p ? Object.entries(p.categories).map(([category, score]) => ({ category, score })) : [];
  const Chip = ({ s, good }) => (
    <li className="flex justify-between rounded bg-[#1f1f1f] px-3 py-2 text-sm">
      <span>{s.label}</span>
      <span className={good ? "text-yellow-400" : "text-neutral-400"}>
        {s.display} · {ordinal(s.rank)} of 30
      </span>
    </li>
  );

  return (
    <div>
      <div className="max-w-sm">
        <Select label="Team" value={abbr} onChange={setAbbr} teams={teams} />
      </div>
      {(error || teamsError) && <p className="mt-3 text-red-400">{error || teamsError}</p>}

      {p && (
        <div className="mt-6">
          <div className="flex items-center gap-4">
            <Logo id={p.team_id} size="h-20 w-20" />
            <div>
              <h2 className="font-title text-4xl">{p.name}</h2>
              <p className="text-neutral-400 text-sm">
                DunkAI model rating <span className="text-yellow-400 font-bold">{p.model_rating}</span>
                {" "}(#{p.rating_rank} of 30) · last game in data {p.last_game}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mt-6">
            <div className="h-72">
              <ResponsiveContainer>
                <RadarChart data={radar} outerRadius="70%">
                  <PolarGrid stroke="#555" />
                  <PolarAngleAxis dataKey="category" stroke="#ddd" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" stroke="#F5C518" fill="#F5C518" fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h3 className="text-yellow-400 uppercase text-sm mb-2">Strengths</h3>
              <ul className="space-y-2 mb-4">
                {p.strengths.length ? p.strengths.map((s) => <Chip key={s.stat} s={s} good />)
                  : <li className="text-sm text-neutral-400">No standout strengths in the last 10 games.</li>}
              </ul>
              <h3 className="text-yellow-400 uppercase text-sm mb-2">Weaknesses</h3>
              <ul className="space-y-2">
                {p.weaknesses.length ? p.weaknesses.map((s) => <Chip key={s.stat} s={s} />)
                  : <li className="text-sm text-neutral-400">No clear weaknesses in the last 10 games.</li>}
              </ul>
            </div>
          </div>

          <h3 className="font-title text-2xl mt-8 text-yellow-400">ALL STATS VS THE LEAGUE</h3>
          <p className="text-sm text-neutral-400 mb-3">
            Last-10-game averages. The bar shows league standing (full = best). For turnovers and fouls, fewer is better.
          </p>
          <div className="space-y-2">
            {p.stats.map((s) => (
              <div key={s.stat} className="text-sm">
                <div className="flex justify-between">
                  <span>{s.label}</span>
                  <span className="text-neutral-300">{s.display} · {ordinal(s.rank)}</span>
                </div>
                <div className="h-2 rounded bg-neutral-700 overflow-hidden">
                  <div className="h-full bg-yellow-400" style={{ width: `${s.percentile}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <StatsNote asOf={asOf} />
    </div>
  );
}