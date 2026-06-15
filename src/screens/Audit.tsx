import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { McpServerInfo, countRealTokens } from "../lib/tauri";

const BLOAT_THRESHOLD = 5000;

const SEGMENT_COLORS = [
  "#d4d0c8", "#bbb7ad", "#a3a094", "#8c887c",
  "#767265", "#615d52", "#4d4940", "#3a3730",
  "#292622", "#1f1d19",
];

interface AuditProps {
  servers: McpServerInfo[];
  setServers: React.Dispatch<React.SetStateAction<McpServerInfo[]>>;
  loading: boolean;
}

export default function Audit({ servers, setServers, loading }: AuditProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");

  // Use real_tokens if available, otherwise estimated
  const getTokens = (s: McpServerInfo) => s.real_tokens ?? s.estimated_tokens;
  const total = servers.reduce((sum, s) => sum + getTokens(s), 0);
  const bloatCount = servers.filter(
    (s) => getTokens(s) >= BLOAT_THRESHOLD
  ).length;
  const hasRealData = servers.some((s) => s.real_tokens !== null);

  // Scan all servers for real token counts
  const handleScan = async () => {
    setScanning(true);
    const updated = [...servers];

    for (let i = 0; i < updated.length; i++) {
      const server = updated[i];
      setScanProgress(`Scanning ${server.name}... (${i + 1}/${updated.length})`);

      try {
        const result = await countRealTokens(server.name);
        if (!result.error) {
          updated[i] = {
            ...server,
            real_tokens: result.token_count,
            tool_count: result.tool_count,
          };
          setServers([...updated]);
        }
      } catch {
        // Server couldn't be scanned — keep estimate
      }
    }

    setScanProgress("");
    setScanning(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[var(--color-ink-3)] tracking-wide">
          Reading configs…
        </p>
      </div>
    );
  }


  if (servers.length === 0) return <EmptyState />;

  return (
    <div className="min-h-screen px-12 py-10 max-w-[860px] mx-auto">
      {/* ── Masthead ─────────────────────────────────────── */}
      <motion.header
        className="mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] text-[var(--color-ink-4)]">
            {servers.length} servers detected
          </span>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="text-[11px] font-medium uppercase tracking-wider px-4 py-1.5 rounded-md bg-[var(--color-paper)] border border-[var(--color-rule)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {scanning ? scanProgress : "Scan Real Tokens"}
          </button>
        </div>

        {/* Estimate vs Real banner */}
        {!hasRealData && servers.length > 0 && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-md bg-[var(--color-paper)] border border-[var(--color-rule)]">
            <span className="text-[11px] text-[var(--color-ink-3)]">
              Showing estimated token counts. Click <strong className="text-[var(--color-ink-2)]">Scan Real Tokens</strong> to connect to each server and get actual counts.
            </span>
          </div>
        )}
        {hasRealData && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-md border" style={{ borderColor: "#4ade8030", backgroundColor: "#4ade8008" }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
            <span className="text-[11px]" style={{ color: "#4ade80" }}>
              Showing real token counts from live server connections.
            </span>
          </div>
        )}

        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--color-ink-3)] mb-2">
            Tokens consumed before your first prompt
          </p>
          <motion.p
            className="leading-none"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "72px",
              color: "var(--color-ink)",
              letterSpacing: "-2px",
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {total.toLocaleString()}
          </motion.p>
        </div>

        {bloatCount > 0 && (
          <motion.p
            className="text-[12px] text-[var(--color-signal)] flex items-center gap-1.5 mt-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <span className="inline-block w-[6px] h-[6px] rounded-full bg-[var(--color-signal)]" />
            {bloatCount} server{bloatCount > 1 ? "s" : ""} exceeding{" "}
            {BLOAT_THRESHOLD.toLocaleString()} tokens
          </motion.p>
        )}
      </motion.header>

      {/* ── Stacked bar ──────────────────────────────────── */}
      <motion.div
        className="mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-4)] mb-3">
          Token distribution — hover to inspect, click to expand
        </p>

        {/* The bar — taller for easy hover targeting */}
        <div className="flex h-12 rounded overflow-hidden cursor-pointer">
          {servers.map((server, i) => {
            const pct = total > 0 ? (getTokens(server) / total) * 100 : 0;
            const isBloat = server.estimated_tokens >= BLOAT_THRESHOLD;
            const isHovered = hoveredIdx === i;
            const segmentColor = isBloat
              ? "var(--color-signal)"
              : SEGMENT_COLORS[i % SEGMENT_COLORS.length];

            return (
              <motion.div
                key={`bar-${server.source}-${server.name}`}
                className="relative"
                style={{
                  width: `${pct}%`,
                  backgroundColor: segmentColor,
                  opacity: hoveredIdx !== null && !isHovered ? 0.25 : 1,
                  transition: "opacity 0.15s ease",
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.5,
                  delay: 0.3 + i * 0.03,
                  ease: "easeOut",
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() =>
                  setExpandedIdx(expandedIdx === i ? null : i)
                }
              >
                {/* Tooltip — positioned above the bar */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[var(--color-ink)] text-[var(--color-canvas)] text-[11px] px-3 py-2 rounded-md whitespace-nowrap z-50 pointer-events-none shadow-xl"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.12 }}
                    >
                      <span className="font-semibold">{server.name}</span>
                      <span className="mx-2 opacity-30">·</span>
                      <span>
                        {getTokens(server).toLocaleString()} tokens
                      </span>
                      <span className="mx-2 opacity-30">·</span>
                      <span className="opacity-60">
                        {((server.estimated_tokens / total) * 100).toFixed(1)}%
                      </span>
                      {/* Arrow pointing down */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[var(--color-ink)]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-signal)]" />
            <span className="text-[10px] text-[var(--color-ink-3)]">
              Above threshold
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-ink-2)]" />
            <span className="text-[10px] text-[var(--color-ink-3)]">
              Normal
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Divider ──────────────────────────────────────── */}
      <div className="h-px bg-[var(--color-rule)] mb-1" />

      {/* ── Table ────────────────────────────────────────── */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-rule)]">
            <Th align="left" width="w-8">
              #
            </Th>
            <Th align="left">Server</Th>
            <Th align="left">Source</Th>
            <Th align="left">Command</Th>
            <Th align="right">Tokens</Th>
          </tr>
        </thead>
        <tbody>
          {servers.map((server, i) => {
            const tokens = getTokens(server);
            const isBloat = tokens >= BLOAT_THRESHOLD;
            const sharePct = total > 0
              ? ((tokens / total) * 100).toFixed(1)
              : "0";
            const isHovered = hoveredIdx === i;
            const isExpanded = expandedIdx === i;
            const segColor = isBloat
              ? "var(--color-signal)"
              : SEGMENT_COLORS[i % SEGMENT_COLORS.length];

            return (
              <motion.tr
                key={`row-${server.source}-${server.name}`}
                className="border-b border-[var(--color-rule)] cursor-pointer select-none"
                style={{
                  backgroundColor: isHovered
                    ? "var(--color-paper-hover)"
                    : isExpanded
                      ? "var(--color-paper)"
                      : "transparent",
                  transition: "background-color 0.1s ease",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.35 + i * 0.03 }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() =>
                  setExpandedIdx(isExpanded ? null : i)
                }
              >
                {/* Rank */}
                <td className="py-3.5 pr-4 text-[12px] text-[var(--color-ink-4)] tabular-nums w-8">
                  {i + 1}
                </td>

                {/* Name + dot + bloat badge */}
                <td className="py-3.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: segColor }}
                    />
                    <span className="text-[13px] font-medium text-[var(--color-ink)]">
                      {server.name}
                    </span>
                    {isBloat && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-signal)] bg-[var(--color-signal-bg)] px-1.5 py-0.5 rounded">
                        Bloat
                      </span>
                    )}
                  </div>

                  {/* Expanded details — visible on click */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        className="mt-2.5 ml-[18px] space-y-1.5"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <DetailRow label="Command" value={`${server.command} ${server.args.join(" ")}`} mono />
                        <DetailRow label="Config" value={server.source_path} mono />
                        {server.env_keys.length > 0 && (
                          <DetailRow
                            label="Env vars"
                            value={server.env_keys.join(", ")}
                          />
                        )}
                        <DetailRow
                          label="Share"
                          value={`${sharePct}% of total startup cost`}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </td>

                {/* Source */}
                <td className="py-3.5 pr-4 text-[12px] text-[var(--color-ink-3)] align-top">
                  {sourceLabel(server.source)}
                </td>

                {/* Command — truncated in table, full in expanded */}
                <td className="py-3.5 pr-4 align-top">
                  <span className="text-[11px] text-[var(--color-ink-4)] font-mono truncate block max-w-[180px]">
                    {server.command}
                  </span>
                </td>

                {/* Tokens */}
                <td className="py-3.5 text-right whitespace-nowrap align-top">
                  <span
                    className="text-[13px] tabular-nums font-medium"
                    style={{
                      fontFamily: "var(--font-display)",
                      color: isBloat
                        ? "var(--color-signal)"
                        : "var(--color-ink)",
                    }}
                  >
                    {tokens.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-[var(--color-ink-4)] ml-1.5">
                    {sharePct}%
                  </span>
                  {server.real_tokens !== null && (
                    <div className="text-[9px] text-[var(--color-ink-4)] mt-0.5">
                      {server.tool_count} tools · real
                    </div>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="mt-6 pt-4 border-t border-[var(--color-rule)]">
        <p className="text-[10px] text-[var(--color-ink-4)] leading-relaxed">
          Token counts are estimates based on known tool schemas. Each MCP
          server injects its tool definitions into Claude's context window at
          the start of every session — before you type anything.
        </p>
      </div>
    </div>
  );
}

/* ─── Source label formatting ────────────────────────────────── */

function sourceLabel(source: McpServerInfo["source"]): string {
  switch (source) {
    case "claude-desktop":      return "desktop";
    case "claude-code-user":    return "claude code (user)";
    case "claude-code-local":   return "claude code (local)";
    case "vscode-copilot":      return "vscode";
    default:                    return source;
  }
}

/* ─── Detail row inside expanded server ──────────────────────── */

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="text-[var(--color-ink-4)] shrink-0 w-16">
        {label}
      </span>
      <span
        className={`text-[var(--color-ink-3)] break-all ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Table header cell ──────────────────────────────────────── */

function Th({
  children,
  align = "left",
  width,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  return (
    <th
      className={`text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--color-ink-4)] py-3 pr-4 ${width ?? ""}`}
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

/* ─── Empty State ────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="min-h-screen flex items-center justify-center px-12">
      <div className="text-center max-w-xs">
        <p
          className="text-[40px] leading-none mb-4 text-[var(--color-ink-4)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          0
        </p>
        <p className="text-[13px] font-medium text-[var(--color-ink)] mb-2">
          No MCP servers detected
        </p>
        <p className="text-[12px] text-[var(--color-ink-3)] leading-relaxed">
          Add an MCP server to Claude Code, then relaunch MCP Lens to audit
          your token usage.
        </p>
      </div>
    </div>
  );
}
