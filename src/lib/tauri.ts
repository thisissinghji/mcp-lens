// lib/tauri.ts — Typed wrappers around ALL Tauri commands

import { invoke } from "@tauri-apps/api/core";

// ── Types ────────────────────────────────────────────────────────

export interface McpServerInfo {
  name: string;
  source: "user" | "project" | "plugin" | "claude-desktop" | "cursor" | "windsurf" | "vscode-copilot";
  source_path: string;
  command: string;
  args: string[];
  env_keys: string[];
  estimated_tokens: number;
  real_tokens: number | null;    // null = not scanned yet
  tool_count: number | null;     // null = not scanned yet
}

export interface RealTokenResult {
  tool_count: number;
  token_count: number;
  tools: ToolDetail[];
  error?: string;
}

export interface ToolDetail {
  name: string;
  description: string;
  tokens: number;
}

export interface ProfileSummary {
  name: string;
  server_count: number;
  server_names: string[];
}

// ── Config Commands ──────────────────────────────────────────────

export async function readMcpConfigs(): Promise<McpServerInfo[]> {
  return invoke<McpServerInfo[]>("read_mcp_configs");
}

export async function countRealTokens(
  command: string,
  args: string[]
): Promise<RealTokenResult> {
  return invoke<RealTokenResult>("count_real_tokens", { command, args });
}

// ── Toggle Commands ──────────────────────────────────────────────

export async function toggleServer(
  serverName: string,
  enabled: boolean,
  configPath: string
): Promise<string> {
  return invoke<string>("toggle_server", {
    request: { server_name: serverName, enabled, config_path: configPath },
  });
}

export async function getDisabledServers(): Promise<McpServerInfo[]> {
  return invoke<McpServerInfo[]>("get_disabled_servers");
}

// ── Profile Commands ─────────────────────────────────────────────

export async function listProfiles(): Promise<ProfileSummary[]> {
  return invoke<ProfileSummary[]>("list_profiles");
}

export async function saveProfile(name: string, selectedServers: string[]): Promise<string> {
  return invoke<string>("save_profile", { name, selectedServers });
}

export async function applyProfile(name: string): Promise<string> {
  return invoke<string>("apply_profile", { name });
}

export async function deleteProfile(name: string): Promise<string> {
  return invoke<string>("delete_profile", { name });
}
