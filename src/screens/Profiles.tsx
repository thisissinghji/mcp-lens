import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  McpServerInfo,
  ProfileSummary,
  readMcpConfigs,
  getDisabledServers,
  listProfiles,
  saveProfile,
  applyProfile,
  deleteProfile,
} from "../lib/tauri";

export default function Profiles() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [allServers, setAllServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  // Profile creation state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());

  const loadData = async () => {
    try {
      const [profileList, enabled, disabled] = await Promise.all([
        listProfiles(),
        readMcpConfigs(),
        getDisabledServers(),
      ]);
      setProfiles(profileList);
      // Merge enabled + disabled, but remove duplicates by name
      const seen = new Set<string>();
      const merged: McpServerInfo[] = [];
      for (const s of [...enabled, ...disabled]) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          merged.push(s);
        }
      }
      setAllServers(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showMessage = (text: string, type: "ok" | "err" = "ok") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  // Start creating a new profile
  const startCreating = () => {
    setCreating(true);
    setNewName("");
    // Default: select all currently enabled servers
    const enabledNames = allServers
      .filter((s) => s.source !== "disabled")
      .map((s) => s.name);
    setSelectedServers(new Set(enabledNames));
  };

  // Toggle a server checkbox
  const toggleServerSelection = (name: string) => {
    const next = new Set(selectedServers);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedServers(next);
  };

  // Save the profile
  const handleSave = async () => {
    const name = newName.trim();
    if (!name) return;
    if (selectedServers.size === 0) {
      showMessage("At least 1 server select karo", "err");
      return;
    }

    try {
      const result = await saveProfile(name, Array.from(selectedServers));
      showMessage(result);
      setCreating(false);
      setNewName("");
      await loadData();
    } catch (e) {
      showMessage(String(e), "err");
    }
  };

  const handleApply = async (name: string) => {
    setApplying(name);
    try {
      const result = await applyProfile(name);
      showMessage(result);
      await loadData();
    } catch (e) {
      showMessage(String(e), "err");
    } finally {
      setApplying(null);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteProfile(name);
      showMessage(`Deleted "${name}"`);
      await loadData();
    } catch (e) {
      showMessage(String(e), "err");
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.15em] text-[var(--color-ink-3)] mb-2">
            MCP Profiles
          </h2>
          <p className="text-[13px] text-[var(--color-ink-2)]">
            Save server presets. One-click switch between setups.
          </p>
        </div>
        {!creating && (
          <button
            onClick={startCreating}
            className="text-[11px] font-medium uppercase tracking-wider px-4 py-2 rounded-md bg-[var(--color-ink)] text-[var(--color-canvas)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            New Profile
          </button>
        )}
      </div>

      {/* ── Message ────────────────────────────────────── */}
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

      {/* ── Create Profile Form ────────────────────────── */}
      <AnimatePresence>
        {creating && (
          <motion.div
            className="mb-8 p-5 rounded-lg bg-[var(--color-paper)] border border-[var(--color-rule)]"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {/* Profile name input */}
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Profile name (e.g., Frontend Mode)"
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-rule)] text-[13px] text-[var(--color-ink)] placeholder-[var(--color-ink-4)] outline-none focus:border-[var(--color-rule-bold)] transition-colors mb-4"
              autoFocus
            />

            {/* Server selection */}
            <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-ink-4)] mb-3">
              Select servers for this profile
            </p>

            {allServers.length === 0 ? (
              <p className="text-[12px] text-[var(--color-ink-3)] py-4">
                No servers available. Add servers to ~/.mcp.json first.
              </p>
            ) : (
              <div className="space-y-1.5 mb-4">
                {allServers.map((server) => {
                  const isSelected = selectedServers.has(server.name);
                  return (
                    <label
                      key={server.name}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-md cursor-pointer hover:bg-[var(--color-canvas)] transition-colors"
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-[var(--color-ink)] border-[var(--color-ink)]"
                            : "border-[var(--color-rule-bold)] bg-transparent"
                        }`}
                        onClick={() => toggleServerSelection(server.name)}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-canvas)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>

                      {/* Server info */}
                      <div
                        className="flex-1 flex items-center justify-between"
                        onClick={() => toggleServerSelection(server.name)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] ${isSelected ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"}`}>
                            {server.name}
                          </span>
                          <span className="text-[10px] text-[var(--color-ink-4)]">
                            {server.source}
                          </span>
                        </div>
                        <span
                          className="text-[11px] tabular-nums text-[var(--color-ink-3)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {server.estimated_tokens.toLocaleString()} tokens
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Selected count + buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--color-rule)]">
              <span className="text-[11px] text-[var(--color-ink-3)]">
                {selectedServers.size} server{selectedServers.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCreating(false)}
                  className="text-[11px] px-4 py-1.5 rounded-md text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!newName.trim() || selectedServers.size === 0}
                  className="text-[11px] font-medium uppercase tracking-wider px-4 py-1.5 rounded-md bg-[var(--color-ink)] text-[var(--color-canvas)] hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Divider ────────────────────────────────────── */}
      <div className="h-px bg-[var(--color-rule)] mb-4" />

      {/* ── Saved Profiles ─────────────────────────────── */}
      {profiles.length === 0 ? (
        <div className="text-center py-16">
          <p
            className="text-[32px] leading-none mb-3 text-[var(--color-ink-4)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            No profiles yet
          </p>
          <p className="text-[12px] text-[var(--color-ink-3)]">
            Click "New Profile" to create your first preset.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile, i) => (
            <motion.div
              key={profile.name}
              className="flex items-center justify-between py-4 px-5 rounded-lg bg-[var(--color-paper)] border border-[var(--color-rule)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
            >
              <div>
                <p className="text-[14px] font-medium text-[var(--color-ink)] mb-1">
                  {profile.name}
                </p>
                <p className="text-[11px] text-[var(--color-ink-3)]">
                  {profile.server_count} server{profile.server_count !== 1 ? "s" : ""}
                  {profile.server_names.length > 0 && (
                    <span className="text-[var(--color-ink-4)] ml-1">
                      — {profile.server_names.join(", ")}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleApply(profile.name)}
                  disabled={applying === profile.name}
                  className="px-4 py-1.5 rounded-md text-[11px] font-medium uppercase tracking-wider bg-[var(--color-ink)] text-[var(--color-canvas)] hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {applying === profile.name ? "Applying..." : "Apply"}
                </button>
                <button
                  onClick={() => handleDelete(profile.name)}
                  className="px-3 py-1.5 rounded-md text-[11px] text-[var(--color-ink-4)] hover:text-[var(--color-signal)] transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <p className="text-[10px] text-[var(--color-ink-4)] mt-6 text-center">
        Applying a profile replaces your .mcp.json. A .bak backup is created before each change.
      </p>
    </div>
  );
}
