import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { getJSON, logo } from "./api";

function Logo({ id }) {
  return (
    <img src={logo(id)} alt="" className="h-16 w-16 object-contain"
         onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
  );
}

export default function Predictor() {
  const [teams, setTeams] = useState([]);
  const [asOf, setAsOf] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON("/teams").then((d) => { setTeams(d.teams); setAsOf(d.stats_as_of); })
      .catch(() => setError("Could not reach the server. It may be waking up, so try again in a minute."));
  }, []);

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

  const pct = result ? Math.round(result.home_win_probability * 100) : 50;
  const chartData = result?.top_factors.map((f) => ({
    name: f.label, impact: f.impact, favors: f.favors })) ?? [];

  const Select = ({ label, value, onChange }) => (
    <label className="flex-1">
      <span className="text-yellow-400 text-sm uppercase">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded bg-[#1f1f1f] border border-neutral-600 p-3">
        <option value="">Select team</option>
        {teams.map((t) => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}
      </select>
    </label>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-4">
        <Select label="Home team" value={home} onChange={setHome} />
        <Select label="Away team" value={away} onChange={setAway} />
      </div>

      <button onClick={predict} disabled={!home || !away || loading}
        className="mt-5 w-full rounded bg-yellow-400 text-black font-bold py-3 disabled:opacity-40">
        {loading ? "Predicting..." : "Predict winner"}
      </button>

      {slow && <p className="mt-3 text-yellow-300">Waking up the server, this can take up to a minute...</p>}
      {error && <p className="mt-3 text-red-400">{error}</p>}

      {result && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <div className="text-center"><Logo id={idOf(result.home_abbr)} /><p>{result.home}</p><p className="text-xs text-neutral-400">HOME</p></div>
            <div className="text-center">
              <p className="font-title text-5xl text-yellow-400">{result.predicted_winner}</p>
              <p className="text-neutral-300">predicted to win ({Math.round(result.confidence * 100)}%)</p>
            </div>
            <div className="text-center"><Logo id={idOf(result.away_abbr)} /><p>{result.away}</p><p className="text-xs text-neutral-400">AWAY</p></div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-sm mb-1">
              <span>{result.home_abbr} {pct}%</span><span>{100 - pct}% {result.away_abbr}</span>
            </div>
            <div className="h-4 rounded bg-neutral-600 overflow-hidden">
              <div className="h-full bg-yellow-400 transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>

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

      {asOf && (
        <p className="mt-6 text-xs text-neutral-400">
          Team stats as of {asOf}. Predictions use each team's last 10 games up to that date.
        </p>
      )}
    </div>
  );
}