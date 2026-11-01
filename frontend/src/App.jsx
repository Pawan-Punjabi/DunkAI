import { useState } from "react";
import Predictor from "./Predictor";
import { Performance, Insights, About } from "./Pages";

const TABS = ["Predictor", "Performance", "Insights", "About"];

export default function App() {
  const [tab, setTab] = useState("Predictor");
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-title text-5xl sm:text-6xl">DUNK<span className="text-yellow-400">AI</span></h1>
      <p className="text-neutral-400 mb-6">NBA game outcome prediction with XGBoost</p>

      <nav className="flex flex-wrap gap-2 mb-8">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded ${tab === t ? "bg-yellow-400 text-black font-bold" : "bg-[#1f1f1f]"}`}>
            {t}
          </button>))}
      </nav>

      {tab === "Predictor" && <Predictor />}
      {tab === "Performance" && <Performance />}
      {tab === "Insights" && <Insights />}
      {tab === "About" && <About />}

      <footer className="mt-12 pt-4 border-t border-neutral-700 text-xs text-neutral-400">
        Academic project. For learning only, not for betting.
      </footer>
    </div>
  );
}