import { useEffect, useState } from "react";
import { getJSON } from "./api";

function color(p) {
  if (p == null) return "#1f1f1f";
  return p >= 0.5
    ? `rgba(245,197,24,${0.12 + (p - 0.5) * 2 * 0.88})`
    : `rgba(120,160,255,${0.12 + (0.5 - p) * 2 * 0.88})`;
}

export default function Heatmap() {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON("/heatmap").then(setD).catch(() => setError("Could not reach the server. Try again in a minute."));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!d) return <p>Loading matchup grid...</p>;

  const nameOf = (a) => d.teams.find((t) => t.abbr === a)?.name ?? a;
  const sp = sel ? d.matrix[sel.i][sel.j] : null;
  const Pair = ({ m }) => (
    <li className="flex justify-between rounded bg-[#1f1f1f] px-3 py-2 text-sm">
      <span>{m.home} (home) vs {m.away}</span>
      <span className="text-yellow-400">{Math.round(m.home_win_probability * 100)}% home</span>
    </li>
  );

  return (
    <div>
      <p className="text-neutral-300 mb-3">
        Every possible game, with the home team down the side and the away team across the top.
        Yellow means the home team is favored; blue means the visitor is favored. Tap a cell for details.
      </p>

      <div className="overflow-x-auto rounded bg-[#1a1a1a] p-2">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#1a1a1a] text-[10px] text-neutral-500 text-left pr-2">HOME ↓ / AWAY →</th>
              {d.teams.map((t) => (
                <th key={t.abbr} className="p-0 pb-1">
                  <div className="text-[10px] text-neutral-300" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>{t.abbr}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.teams.map((r, i) => (
              <tr key={r.abbr}>
                <th className="sticky left-0 bg-[#1a1a1a] text-[10px] text-neutral-300 text-left pr-2 font-normal">{r.abbr}</th>
                {d.teams.map((c, j) => {
                  const p = d.matrix[i][j];
                  const active = sel && sel.i === i && sel.j === j;
                  return (
                    <td key={c.abbr}
                      title={p == null ? "" : `${r.abbr} home vs ${c.abbr}: ${Math.round(p * 100)}% home`}
                      onClick={() => p != null && setSel({ i, j })}
                      style={{ background: color(p), width: 22, height: 22, outline: active ? "2px solid #fff" : "none", cursor: p == null ? "default" : "pointer" }} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && sp != null && (
        <div className="mt-4 rounded bg-yellow-400 text-black p-4">
          <p className="font-title text-2xl">
            {nameOf(d.teams[sel.i].abbr)} (home) vs {nameOf(d.teams[sel.j].abbr)}
          </p>
          <p>Home win probability {Math.round(sp * 100)}% · Away {Math.round((1 - sp) * 100)}%</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6 mt-8">
        <div>
          <h3 className="font-title text-2xl text-yellow-400 mb-2">MOST HOME-FAVORED</h3>
          <ul className="space-y-2">{d.most_home_favored.map((m, i) => <Pair key={i} m={m} />)}</ul>
        </div>
        <div>
          <h3 className="font-title text-2xl text-yellow-400 mb-2">STRONGEST ROAD FAVORITES</h3>
          <ul className="space-y-2">{d.most_road_favored.map((m, i) => <Pair key={i} m={m} />)}</ul>
        </div>
      </div>

      <h3 className="font-title text-2xl text-yellow-400 mt-8 mb-1">DUNKAI MODEL RATINGS</h3>
      <p className="text-sm text-neutral-400 mb-3">
        Average win chance against all 29 other teams (half at home, half away). This is how the model sees each team, not an official ranking.
      </p>
      <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {d.ratings.map((r) => (
          <li key={r.abbr} className="flex justify-between border-b border-neutral-800 py-1">
            <span><span className="text-neutral-500 mr-2">{r.rank}.</span>{r.name}</span>
            <span className="text-yellow-400">{r.rating}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-neutral-400">Team stats as of {d.stats_as_of}.</p>
    </div>
  );
}