import { useEffect, useState } from "react";
import { getJSON } from "./api";

const pc = (v) => (v * 100).toFixed(2) + "%";

export function Performance() {
  const [m, setM] = useState(null);
  useEffect(() => { getJSON("/metrics").then(setM).catch(() => {}); }, []);
  if (!m) return <p>Loading metrics...</p>;
  const x = m.xgb, b = m.baseline;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Test accuracy", pc(x.accuracy)], ["Baseline", pc(b.accuracy)],
          ["Gain", "+" + (m.xgb_gain_over_baseline * 100).toFixed(2) + " pts"],
          ["Brier score", x.brier.toFixed(4)]].map(([k, v]) => (
          <div key={k} className="rounded bg-[#1f1f1f] p-4">
            <p className="text-xs text-yellow-400 uppercase">{k}</p>
            <p className="font-title text-3xl">{v}</p>
          </div>))}
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-yellow-400 text-left">
          <tr><th>Model</th><th>Accuracy</th><th>Precision (Home)</th><th>Recall (Home)</th><th>Macro F1</th><th>Brier</th></tr>
        </thead>
        <tbody>
          <tr className="border-t border-neutral-700"><td>Naive baseline</td><td>{pc(b.accuracy)}</td>
            <td>{b.precision_home.toFixed(2)}</td><td>{b.recall_home.toFixed(2)}</td>
            <td>{b.macro_f1.toFixed(2)}</td><td>{b.brier.toFixed(4)}</td></tr>
          <tr className="border-t border-neutral-700"><td>XGBoost</td><td>{pc(x.accuracy)}</td>
            <td>{x.precision_home.toFixed(2)}</td><td>{x.recall_home.toFixed(2)}</td>
            <td>{x.macro_f1.toFixed(2)}</td><td>{x.brier.toFixed(4)}</td></tr>
        </tbody>
      </table>
      <p className="text-sm text-neutral-400 mt-2">Evaluated on {m.test_games} unseen games (the last 20% by date).</p>

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <img className="rounded bg-white" src="/charts/confusion_matrix.png" alt="Confusion matrix" />
        <img className="rounded bg-white" src="/charts/calibration_curve.png" alt="Calibration curve" />
      </div>
    </div>
  );
}

export function Insights() {
  return (
    <div>
      <p className="mb-4 text-neutral-300">
        Recent point margin (plus/minus) is the single most important signal, followed by points and shooting percentage.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <img className="rounded bg-white" src="/charts/feature_importance.png" alt="Feature importance" />
        <img className="rounded bg-white" src="/charts/shap_importance.png" alt="SHAP importance" />
        <img className="rounded bg-white" src="/charts/shap_summary.png" alt="SHAP summary" />
        <img className="rounded bg-white" src="/charts/correlation_with_target.png" alt="Correlations" />
      </div>
    </div>
  );
}

export function About() {
  const Item = ({ t, children }) => (
    <div className="mb-5"><h3 className="text-yellow-400 uppercase">{t}</h3><p className="text-neutral-200">{children}</p></div>);
  return (
    <div>
      <Item t="Problem">NBA games are high-variance, and expert opinion is subjective. This project builds a reproducible, data-driven baseline for predicting whether the home team wins.</Item>
      <Item t="Data">Team game logs from the official NBA Stats API (2016-17 to 2025-26 regular seasons), split chronologically: first 80% to train, last 20% to test.</Item>
      <Item t="Method">Each team's last-10-game averages (shifted by one game so no current-game stats leak in), converted to home-minus-away differentials for 19 stats, then fed to a tuned XGBoost classifier.</Item>
      <Item t="Limitations">The model uses no injury, rest or travel information, and it favors home teams more than road teams. Stats are updated manually, so check the "stats as of" date.</Item>
      <Item t="Future scope">Pre-game injury designations, rest days, and air miles traveled.</Item>
      <Item t="Builder">Pawan D Punjabi, B.Tech CSE (DS/ML), Navrachana University.</Item>
    </div>
  );
}