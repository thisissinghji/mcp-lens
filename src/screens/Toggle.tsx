// screens/Toggle.tsx — Turn MCP servers ON/OFF
//
// BUG FIX: pehle disabled servers gayab ho jaate the
// Ab hum DONO lists merge karte hain:
//   - readMcpConfigs()    → enabled servers
//   - getDisabledServers() → disabled servers (with full info)
// Dono combine → ek list mein dikhao with toggle switches

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  McpServerInfo,
  readMcpConfigs,
  getDisabledServers,
  toggleServer,
} from "../lib/tauri";

interface ToggleableServer extends McpServerInfo {
  enabled: boolean;
}

// Servers in ~/.claude.json are managed by Claude Code CLI — we don't write
// that file (it holds 47KB+ of unrelated state). Show them but block toggle.
const isReadOnlySource = (source: string) =>
  source === "claude-code-user" || source === "claude-code-local";

interface ToggleProps {
  servers: McpServerInfo[];       // from App.tsx (enabled servers)
  refreshServers: () => Promise<void>;  // reload after toggle
}

export default function Toggle({ servers: enabledServers, refreshServers }: ToggleProps) {
  const [servers, setServers] = useState<ToggleableServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Load FRESH enabled + disabled from disk every time
  // Don't rely on enabledServers prop (stale closure issue)
  // But DO use it as a real_tokens cache so we don't lose scan data
  const loadData = async () => {
    try {
      const [freshEnabled, disabled] = await Promise.all([
        readMcpConfigs(),
        getDisabledServers(),
      ]);

      // Build a real_tokens cache from App-level state
      const realTokensMap = new Map(
        enabledServers
          .filter((s) => s.real_tokens !== null)
          .map((s) => [s.name, { real_tokens: s.real_tokens, tool_count: s.tool_count }])
      );

      const applyCache = (s: McpServerInfo): McpServerInfo => {
        const cached = realTokensMap.get(s.name);
        return cached
          ? { ...s, real_tokens: cached.real_tokens, tool_count: cached.tool_count }
          : s;
      };

      const seen = new Set<string>();
      const merged: ToggleableServer[] = [];
      for (const s of freshEnabled) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          merged.push({ ...applyCache(s), enabled: true });
        }
      }
      for (const s of disabled) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          merged.push({ ...applyCache(s), enabled: false });
        }
      }

      // Sort: enabled first, then by tokens descending
      merged.sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return (b.real_tokens ?? b.estimated_tokens) - (a.real_tokens ?? a.estimated_tokens);
      });

      setServers(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Use real tokens when available, otherwise estimated
  const getTokens = (s: ToggleableServer) => s.real_tokens ?? s.estimated_tokens;

  const activeServers = servers.filter((s) => s.enabled);
  const totalActive = activeServers.reduce(
    (sum, s) => sum + getTokens(s),
    0
  );
  const totalAll = servers.reduce((sum, s) => sum + getTokens(s), 0);
  const savedTokens = totalAll - totalActive;

  // Handle toggle
  const handleToggle = async (server: ToggleableServer) => {
    setToggling(server.name);
    setMessage(null);

    try {
      // For disabled servers, source_path points to disabled file
      // We need to use the actual .mcp.json path
      const configPath = server.enabled
        ? server.source_path
        : "~/.mcp.json";

      await toggleServer(server.name, !server.enabled, configPath);

      // Show feedback
      setMessage(
        `${server.name} ${server.enabled ? "disabled" : "enabled"}`
      );
      setTimeout(() => setMessage(null), 2000);

      // Reload: refresh App-level state, then reload toggle list
      await refreshServers();
      await loadData();
    } catch (e) {
      setMessage(`Error: ${e}`);
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p className="text-sm text-[var(--color-ink-3)]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="px-12 py-10 max-w-[860px] mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-[11px] uppercase tracking-[0.15em] text-[var(--color-ink-3)] mb-2">
          Active token cost
        </h2>
        <div className="flex items-baseline gap-4">
          <motion.span
            className="text-5xl leading-none"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-ink)",
            }}
            key={totalActive}
            initial={{ opacity: 0.5, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, type: "spring" }}
          >
            {totalActive.toLocaleString()}
          </motion.span>
          <span className="text-sm text-[var(--color-ink-3)]">
            tokens at startup
          </span>
        </div>

        {savedTokens > 0 && (
          <motion.p
            className="text-[12px] mt-2 flex items-center gap-1.5"
            style={{ color: "#4ade80" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
            {savedTokens.toLocaleString()} tokens saved by disabling servers
          </motion.p>
        )}
      </div>

      {/* ── Status message ─────────────────────────────── */}
      <AnimatePresence>
        {message && (
          <motion.div
            className="mb-4 px-4 py-2 rounded-md text-[12px] bg-[var(--color-paper)] text-[var(--color-ink-2)] border border-[var(--color-rule)]"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Divider ────────────────────────────────────── */}
      <div className="h-px bg-[var(--color-rule)] mb-4" />

      {/* ── Server toggle list ─────────────────────────── */}
      {servers.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-3)] text-center py-16">
          No MCP servers found. Add servers to ~/.mcp.json first.
        </p>
      ) : (
        <div className="space-y-2">
          {servers.map((server, i) => {
            const isToggling = toggling === server.name;
            const readOnly = isReadOnlySource(server.source);

            return (
              <motion.div
                key={`${server.name}-${server.enabled}`}
                className="flex items-center justify-between py-4 px-4 rounded-lg border transition-all duration-200"
                style={{
                  backgroundColor: server.enabled
                    ? "var(--color-paper)"
                    : "transparent",
                  borderColor: "var(--color-rule)",
                  opacity: server.enabled ? 1 : 0.45,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: server.enabled ? 1 : 0.45 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
              >
                {/* Left: server info */}
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-[13px] font-medium"
                      style={{
                        color: server.enabled
                          ? "var(--color-ink)"
                          : "var(--color-ink-3)",
                        textDecoration: server.enabled ? "none" : "line-through",
                      }}
                    >
                      {server.name}
                    </span>
                    <span className="text-[10px] text-[var(--color-ink-4)] bg-[var(--color-canvas)] px-1.5 py-px rounded">
                      {server.source}
                    </span>
                    {readOnly && (
                      <span
                        className="text-[10px] text-[var(--color-ink-4)] border border-[var(--color-rule)] px-1.5 py-px rounded"
                        title="Managed by Claude Code CLI — toggle via `claude mcp remove`"
                      >
                        read-only
                      </span>
                    )}
                    {!server.enabled && (
                      <span className="text-[10px] text-[var(--color-ink-4)]">
                        disabled
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[12px] tabular-nums"
                    style={{
                      fontFamily: "var(--font-display)",
                      color: server.enabled
                        ? "var(--color-ink-2)"
                        : "var(--color-ink-4)",
                    }}
                  >
                    {getTokens(server).toLocaleString()} tokens
                  </span>
                </div>

                {/* Right: toggle switch */}
                <button
                  onClick={() => !readOnly && handleToggle(server)}
                  disabled={isToggling || readOnly}
                  title={readOnly ? "Managed by Claude Code CLI" : undefined}
                  className={`
                    relative w-11 h-6 rounded-full transition-colors duration-200
                    cursor-pointer disabled:cursor-not-allowed
                    ${server.enabled ? "bg-[#4ade80]" : "bg-[var(--color-rule-bold)]"}
                    ${readOnly ? "opacity-40" : ""}
                  `}
                >
                  <motion.div
                    className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm"
                    animate={{ left: server.enabled ? "22px" : "3px" }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <p className="text-[10px] text-[var(--color-ink-4)] mt-6 text-center">
        Changes are written to your .mcp.json config. A .bak backup is created
        automatically. Restart Claude Code for changes to take effect.
      </p>
    </div>
  );
}
