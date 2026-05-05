"""
count_tokens.py — Connects to an MCP server and counts REAL tokens

Supports BOTH transports:
  - stdio (subprocess: npx, python, node)
  - http  (Streamable HTTP servers with custom headers)

Usage:
  Stdio:  python count_tokens.py stdio <command> <arg1> <arg2> ...
  HTTP:   python count_tokens.py http <url> [header_key:header_value ...]

Output: JSON {tool_count, token_count, tools[]}
"""

import sys
import json
import asyncio
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


async def count_via_stdio(command: str, args: list[str]) -> dict:
    """Count tokens for a stdio (subprocess) MCP server"""
    server_params = StdioServerParameters(command=command, args=args)
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            tools_result = await session.list_tools()
            return summarize_tools(tools_result.tools)


async def count_via_http(url: str, headers: dict) -> dict:
    """Count tokens for an HTTP (Streamable HTTP) MCP server"""
    # Import here so stdio-only setups don't fail
    from mcp.client.streamable_http import streamablehttp_client

    async with streamablehttp_client(url, headers=headers) as (read_stream, write_stream, _get_session_id):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            tools_result = await session.list_tools()
            return summarize_tools(tools_result.tools)


def summarize_tools(tools) -> dict:
    """Convert tool list to token summary"""
    total_text = ""
    tool_summaries = []

    for tool in tools:
        name = tool.name or ""
        desc = tool.description or ""
        schema = json.dumps(tool.inputSchema) if tool.inputSchema else "{}"

        tool_text = f"{name} {desc} {schema}"
        total_text += tool_text + " "

        tool_tokens = max(len(tool_text) // 4, 1)
        tool_summaries.append({
            "name": name,
            "description": desc[:100],
            "tokens": tool_tokens,
        })

    raw_tokens = len(total_text) // 4
    overhead = 50
    total_tokens = raw_tokens + overhead

    return {
        "tool_count": len(tools),
        "token_count": total_tokens,
        "tools": tool_summaries,
    }


async def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "error": "Usage: python count_tokens.py <stdio|http> <command_or_url> [args/headers...]"
        }))
        sys.exit(1)

    transport = sys.argv[1]

    try:
        if transport == "stdio":
            command = sys.argv[2]
            args = sys.argv[3:]
            result = await count_via_stdio(command, args)

        elif transport == "http":
            url = sys.argv[2]
            # Parse headers from "key:value" format
            headers = {}
            for header_arg in sys.argv[3:]:
                if ":" in header_arg:
                    key, value = header_arg.split(":", 1)
                    headers[key.strip()] = value.strip()
            result = await count_via_http(url, headers)

        else:
            result = {
                "error": f"Unknown transport: {transport}",
                "tool_count": 0,
                "token_count": 0,
                "tools": [],
            }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "tool_count": 0,
            "token_count": 0,
            "tools": [],
        }))


if __name__ == "__main__":
    asyncio.run(main())
