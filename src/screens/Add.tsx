// screens/Add.tsx — Add new MCP servers
// Two sections: Marketplace (catalog) + Custom (manual form)

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AddServerRequest,
  McpServerInfo,
  MarketplaceEntry,
  addServer,
  fetchMarketplace,
} from "../lib/tauri";

interface AddProps {
  servers: McpServerInfo[];
  refreshServers: () => Promise<void>;
}

type Section = "marketplace" | "custom";

export default function Add({ servers, refreshServers }: AddProps) {
  const [section, setSection] = useState<Section>("marketplace");
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  const showMessage = (text: string, type: "ok" | "err" = "ok") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div className="px-12 py-10 max-w-[860px] mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-[11px] uppercase tracking-[0.15em] text-[var(--color-ink-3)] mb-2">
          Add MCP Server
        </h2>
        <p className="text-[13px] text-[var(--color-ink-2)]">
          Install from the marketplace or add a custom server.
        </p>
      </div>

      {/* ── Section toggle ─────────────────────────────── */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[var(--color-paper)] w-fit">
        <button
          onClick={() => setSection("marketplace")}
          className={`text-[11px] font-medium uppercase tracking-wider px-4 py-1.5 rounded-md transition-colors cursor-pointer ${
            section === "marketplace"
              ? "bg-[var(--color-canvas)] text-[var(--color-ink)]"
              : "text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]"
          }`}
        >
          Quick Install
        </button>
        <button
          onClick={() => setSection("custom")}
          className={`text-[11px] font-medium uppercase tracking-wider px-4 py-1.5 rounded-md transition-colors cursor-pointer ${
            section === "custom"
              ? "bg-[var(--color-canvas)] text-[var(--color-ink)]"
              : "text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]"
          }`}
        >
          Custom
        </button>
      </div>

      {/* ── Message ─────────────────────────────────────── */}
      <AnimatePresence>
        {message && (
          <motion.div
            className={`mb-4 px-4 py-2 rounded-md text-[12px] border ${
              message.type === "ok"
                ? "border-[#4ade8040] text-[#4ade80] bg-[#4ade8010]"
                : "border-[var(--color-signal)]30 text-[var(--color-signal)] bg-[var(--color-signal-bg)]"
            }`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active section ─────────────────────────────── */}
      {section === "marketplace" ? (
        <Marketplace
          existingServers={servers}
          refreshServers={refreshServers}
          showMessage={showMessage}
        />
      ) : (
        <CustomForm
          existingServers={servers}
          refreshServers={refreshServers}
          showMessage={showMessage}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MARKETPLACE SECTION
   ═══════════════════════════════════════════════════════════════ */

function Marketplace({
  existingServers,
  refreshServers,
  showMessage,
}: {
  existingServers: McpServerInfo[];
  refreshServers: () => Promise<void>;
  showMessage: (text: string, type?: "ok" | "err") => void;
}) {
  const [entries, setEntries] = useState<MarketplaceEntry[]>([]);
  const [source, setSource] = useState<"github" | "fallback" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installEntry, setInstallEntry] = useState<MarketplaceEntry | null>(null);

  const installedNames = new Set(existingServers.map((s) => s.name));

  useEffect(() => {
    fetchMarketplace()
      .then((res) => {
        setEntries(res.entries);
        setSource(res.source);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-[var(--color-ink-3)]">Loading marketplace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-[var(--color-signal)]">{error}</p>
      </div>
    );
  }

  return (
    <>
      {source === "fallback" && (
        <p className="text-[10px] text-[var(--color-ink-4)] mb-4">
          Showing built-in catalog (offline mode).
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {entries.map((entry) => {
          const isInstalled = installedNames.has(entry.name) || installedNames.has(entry.id);
          return (
            <motion.div
              key={entry.id}
              className="p-4 rounded-lg bg-[var(--color-paper)] border border-[var(--color-rule)]"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[14px] font-medium text-[var(--color-ink)]">
                    {entry.name}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)] mt-0.5">
                    {entry.category} · {entry.transport}
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-[var(--color-ink-3)] mb-3 leading-relaxed">
                {entry.description}
              </p>
              {isInstalled ? (
                <span className="text-[10px] uppercase tracking-wider text-[#4ade80]">
                  ● Installed
                </span>
              ) : (
                <button
                  onClick={() => setInstallEntry(entry)}
                  className="text-[10px] font-medium uppercase tracking-wider px-3 py-1 rounded-md bg-[var(--color-ink)] text-[var(--color-canvas)] hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Install
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── Browse-more footer ─────────────────────────── */}
      <p className="text-[11px] text-[var(--color-ink-3)] mt-8 pt-4 border-t border-[var(--color-rule)] text-center">
        Looking for more?{" "}
        <button
          onClick={() => openUrl("https://mcp.so")}
          className="text-[var(--color-ink)] underline underline-offset-2 hover:opacity-80 cursor-pointer"
        >
          mcp.so
        </button>
        {" or "}
        <button
          onClick={() => openUrl("https://github.com/punkpeye/awesome-mcp-servers")}
          className="text-[var(--color-ink)] underline underline-offset-2 hover:opacity-80 cursor-pointer"
        >
          awesome-mcp-servers
        </button>
        {" — then add via the Custom tab."}
      </p>

      {/* Install modal */}
      <AnimatePresence>
        {installEntry && (
          <InstallModal
            entry={installEntry}
            onClose={() => setInstallEntry(null)}
            onInstalled={async () => {
              await refreshServers();
              showMessage(`${installEntry.name} installed`);
              setInstallEntry(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Install Modal ──────────────────────────────────────────── */

function InstallModal({
  entry,
  onClose,
  onInstalled,
}: {
  entry: MarketplaceEntry;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [serverName, setServerName] = useState(entry.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    setError(null);
    // Validate required fields
    for (const f of entry.fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`${f.label} is required`);
        return;
      }
    }

    setInstalling(true);
    try {
      // Replace placeholders in templates
      const replace = (s: string) =>
        s.replace(/\$\{(\w+)\}/g, (_, k) => values[k] ?? "");

      const replaceObj = (obj?: Record<string, string>) => {
        if (!obj) return undefined;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          out[k] = replace(v);
        }
        return out;
      };

      const req: AddServerRequest = {
        name: serverName.trim(),
        transport: entry.transport,
        command: entry.command,
        args: entry.args?.map(replace),
        env: replaceObj(entry.env),
        url: entry.url ? replace(entry.url) : undefined,
        headers: replaceObj(entry.headers),
      };

      await addServer(req);
      onInstalled();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-[var(--color-canvas)] border border-[var(--color-rule)] rounded-xl p-6 max-w-md w-full"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-semibold text-[var(--color-ink)] mb-1">
          Install {entry.name}
        </h3>
        <p className="text-[12px] text-[var(--color-ink-3)] mb-5">
          {entry.description}
        </p>

        {/* Server name field */}
        <Field
          label="Server Name"
          description="How this server appears in your config"
          required
        >
          <input
            type="text"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-[var(--color-paper)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)] outline-none focus:border-[var(--color-rule-bold)]"
          />
        </Field>

        {/* Marketplace fields */}
        {entry.fields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            description={f.description}
            required={f.required}
          >
            <input
              type={f.secret ? "password" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              placeholder={f.secret ? "••••••••" : ""}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-paper)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)] outline-none focus:border-[var(--color-rule-bold)] font-mono"
            />
          </Field>
        ))}

        {entry.homepage && (
          <p className="text-[10px] text-[var(--color-ink-4)] mb-4">
            Docs: {entry.homepage}
          </p>
        )}

        {error && (
          <div className="mb-3 px-3 py-2 rounded-md text-[12px] border border-[var(--color-signal)]/30 text-[var(--color-signal)] bg-[var(--color-signal-bg)]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-rule)]">
          <button
            onClick={onClose}
            disabled={installing}
            className="text-[11px] px-4 py-1.5 rounded-md text-[var(--color-ink-3)] hover:text-[var(--color-ink)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="text-[11px] font-medium uppercase tracking-wider px-4 py-1.5 rounded-md bg-[var(--color-ink)] text-[var(--color-canvas)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {installing ? "Installing..." : "Install"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CUSTOM FORM SECTION
   ═══════════════════════════════════════════════════════════════ */

function CustomForm({
  existingServers,
  refreshServers,
  showMessage,
}: {
  existingServers: McpServerInfo[];
  refreshServers: () => Promise<void>;
  showMessage: (text: string, type?: "ok" | "err") => void;
}) {
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("npx");
  const [argsList, setArgsList] = useState<string[]>([""]);
  const [envList, setEnvList] = useState<{ key: string; value: string; secret: boolean }[]>([]);
  const [url, setUrl] = useState("");
  const [headersList, setHeadersList] = useState<{ key: string; value: string; secret: boolean }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const ALLOWED_COMMANDS = ["npx", "node", "python", "python3", "uvx", "bun", "deno"];

  const handleSubmit = async () => {
    if (!name.trim()) {
      showMessage("Server name is required", "err");
      return;
    }
    if (existingServers.some((s) => s.name === name.trim())) {
      showMessage(`Server '${name}' already exists`, "err");
      return;
    }

    setSubmitting(true);
    try {
      const cleanArgs = argsList.map((a) => a.trim()).filter((a) => a.length > 0);
      const cleanEnv: Record<string, string> = {};
      for (const e of envList) {
        if (e.key.trim() && e.value.trim()) cleanEnv[e.key.trim()] = e.value;
      }
      const cleanHeaders: Record<string, string> = {};
      for (const h of headersList) {
        if (h.key.trim() && h.value.trim()) cleanHeaders[h.key.trim()] = h.value;
      }

      const req: AddServerRequest =
        transport === "stdio"
          ? {
              name: name.trim(),
              transport: "stdio",
              command,
              args: cleanArgs.length > 0 ? cleanArgs : undefined,
              env: Object.keys(cleanEnv).length > 0 ? cleanEnv : undefined,
            }
          : {
              name: name.trim(),
              transport,
              url: url.trim(),
              headers: Object.keys(cleanHeaders).length > 0 ? cleanHeaders : undefined,
            };

      await addServer(req);
      await refreshServers();
      showMessage(`Server '${req.name}' added`);

      // Reset form
      setName("");
      setArgsList([""]);
      setEnvList([]);
      setUrl("");
      setHeadersList([]);
    } catch (e) {
      showMessage(String(e), "err");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-xl p-6">
      {/* Transport selector */}
      <Field label="Transport" required>
        <div className="flex gap-2">
          {(["stdio", "http", "sse"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTransport(t)}
              className={`text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                transport === t
                  ? "bg-[var(--color-ink)] text-[var(--color-canvas)]"
                  : "bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      {/* Name */}
      <Field label="Name" required description="Letters, numbers, dash, underscore only">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-server"
          className="w-full px-3 py-2 rounded-md bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)] outline-none focus:border-[var(--color-rule-bold)]"
        />
      </Field>

      {transport === "stdio" ? (
        <>
          {/* Command */}
          <Field label="Command" required>
            <select
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)] outline-none cursor-pointer"
            >
              {ALLOWED_COMMANDS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          {/* Args */}
          <Field label="Arguments" description="One argument per row">
            <DynamicList
              items={argsList}
              onChange={setArgsList}
              placeholder="argument"
            />
          </Field>

          {/* Env vars */}
          <Field label="Environment Variables" description="Optional. Mark as secret to use password field">
            <KeyValueList items={envList} onChange={setEnvList} keyPlaceholder="KEY" />
          </Field>
        </>
      ) : (
        <>
          {/* URL */}
          <Field label="URL" required description="https://... or http://...">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="w-full px-3 py-2 rounded-md bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)] outline-none focus:border-[var(--color-rule-bold)] font-mono"
            />
          </Field>

          {/* Headers */}
          <Field label="Headers" description="e.g. Authorization, X-API-Key">
            <KeyValueList items={headersList} onChange={setHeadersList} keyPlaceholder="Header-Name" />
          </Field>
        </>
      )}

      <div className="flex justify-end pt-3 border-t border-[var(--color-rule)]">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="text-[11px] font-medium uppercase tracking-wider px-5 py-2 rounded-md bg-[var(--color-ink)] text-[var(--color-canvas)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Adding..." : "Add Server"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REUSABLE FORM COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

function Field({
  label,
  description,
  required,
  children,
}: {
  label: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-3)] mb-1.5">
        {label} {required && <span className="text-[var(--color-signal)]">*</span>}
      </label>
      {children}
      {description && (
        <p className="text-[10px] text-[var(--color-ink-4)] mt-1">{description}</p>
      )}
    </div>
  );
}

function DynamicList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
            className="flex-1 px-3 py-1.5 rounded-md bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)] outline-none focus:border-[var(--color-rule-bold)] font-mono"
          />
          <button
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="px-2 text-[var(--color-ink-4)] hover:text-[var(--color-signal)] cursor-pointer"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ""])}
        className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] hover:text-[var(--color-ink)] cursor-pointer"
      >
        + Add row
      </button>
    </div>
  );
}

function KeyValueList({
  items,
  onChange,
  keyPlaceholder,
}: {
  items: { key: string; value: string; secret: boolean }[];
  onChange: (items: { key: string; value: string; secret: boolean }[]) => void;
  keyPlaceholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={item.key}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, key: e.target.value };
              onChange(next);
            }}
            placeholder={keyPlaceholder ?? "key"}
            className="w-1/3 px-3 py-1.5 rounded-md bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[12px] text-[var(--color-ink)] outline-none font-mono"
          />
          <input
            type={item.secret ? "password" : "text"}
            value={item.value}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, value: e.target.value };
              onChange(next);
            }}
            placeholder="value"
            className="flex-1 px-3 py-1.5 rounded-md bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[12px] text-[var(--color-ink)] outline-none font-mono"
          />
          <button
            onClick={() => {
              const next = [...items];
              next[i] = { ...item, secret: !item.secret };
              onChange(next);
            }}
            className={`text-[9px] uppercase tracking-wider px-2 rounded-md cursor-pointer ${
              item.secret
                ? "bg-[var(--color-ink-2)] text-[var(--color-canvas)]"
                : "bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[var(--color-ink-3)]"
            }`}
            title="Toggle secret"
          >
            🔒
          </button>
          <button
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="px-2 text-[var(--color-ink-4)] hover:text-[var(--color-signal)] cursor-pointer"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { key: "", value: "", secret: false }])}
        className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] hover:text-[var(--color-ink)] cursor-pointer"
      >
        + Add row
      </button>
    </div>
  );
}
