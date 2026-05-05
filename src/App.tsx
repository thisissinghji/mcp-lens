// App.tsx — Root component with tab navigation

import { useState, useEffect } from "react";
import { McpServerInfo, readMcpConfigs } from "./lib/tauri";
import Audit from "./screens/Audit";
import Toggle from "./screens/Toggle";
import Profiles from "./screens/Profiles";
import Add from "./screens/Add";

type Tab = "audit" | "toggle" | "profiles" | "add";

const TABS: { id: Tab; label: string }[] = [
  { id: "audit", label: "Audit" },
  { id: "toggle", label: "Toggle" },
  { id: "profiles", label: "Profiles" },
  { id: "add", label: "+ Add" },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("audit");

  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshServers = async () => {
    try {
      const data = await readMcpConfigs();
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

      <div className="flex-1">
        {activeTab === "audit" && (
          <Audit servers={servers} setServers={setServers} loading={loading} />
        )}
        {activeTab === "toggle" && (
          <Toggle servers={servers} refreshServers={refreshServers} />
        )}
        {activeTab === "profiles" && (
          <Profiles refreshServers={refreshServers} />
        )}
        {activeTab === "add" && (
          <Add servers={servers} refreshServers={refreshServers} />
        )}
      </div>
    </div>
  );
}

export default App;
