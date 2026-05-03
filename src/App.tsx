// App.tsx — Root component with tab navigation
//
// 3 screens:
//   Audit    → see token bloat (read-only view)
//   Toggle   → turn servers on/off
//   Profiles → save/load named configs

import { useState } from "react";
import Audit from "./screens/Audit";
import Toggle from "./screens/Toggle";
import Profiles from "./screens/Profiles";

type Tab = "audit" | "toggle" | "profiles";

const TABS: { id: Tab; label: string }[] = [
  { id: "audit", label: "Audit" },
  { id: "toggle", label: "Toggle" },
  { id: "profiles", label: "Profiles" },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("audit");

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Tab bar ──────────────────────────────────────── */}
      <nav className="flex items-center gap-1 px-12 pt-6 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              text-[12px] font-medium uppercase tracking-[0.15em] px-4 py-2 rounded-md
              transition-colors duration-100 cursor-pointer
              ${
                activeTab === tab.id
                  ? "bg-[var(--color-paper)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]"
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Active screen ────────────────────────────────── */}
      <div className="flex-1">
        {activeTab === "audit" && <Audit />}
        {activeTab === "toggle" && <Toggle />}
        {activeTab === "profiles" && <Profiles />}
      </div>
    </div>
  );
}

export default App;
