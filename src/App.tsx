// App.tsx — Root component with tab navigation
//
// Server data is stored HERE (not in individual screens) so that
// real token counts persist when switching between tabs.

import { useState, useEffect } from "react";
import { McpServerInfo, readMcpConfigs } from "./lib/tauri";
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

  // Shared server state — persists across tab switches
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshServers = async () => {
    try {
      const data = await readMcpConfigs();
      // Preserve real_tokens from previous scan if server still exists
      setServers((prev) => {
        const prevMap = new Map(prev.map((s) => [s.name, s]));
        return data.map((s) => ({
          ...s,
          real_tokens: prevMap.get(s.name)?.real_tokens ?? s.real_tokens,
          tool_count: prevMap.get(s.name)?.tool_count ?? s.tool_count,
        }));
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshServers();
  }, []);

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
        {activeTab === "audit" && (
          <Audit
            servers={servers}
            setServers={setServers}
            loading={loading}
          />
        )}
        {activeTab === "toggle" && (
          <Toggle
            servers={servers}
            refreshServers={refreshServers}
          />
        )}
        {activeTab === "profiles" && (
          <Profiles refreshServers={refreshServers} />
        )}
      </div>
    </div>
  );
}

export default App;
