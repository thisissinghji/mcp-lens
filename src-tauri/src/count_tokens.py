"""
count_tokens.py — Connects to an MCP server and counts REAL tokens

Uses the official MCP SDK client — no manual protocol handling needed.
SDK handles all the JSON-RPC + stdio transport details.

Usage: python count_tokens.py <command> <arg1> <arg2> ...
Output: JSON with tool_count, token_count, and tool details
"""

import sys
import json
import asyncio
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


async def count_server_tokens(command: str, args: list[str]) -> dict:
    """
    MCP server start karo, tool list lo, tokens count karo, band karo.
    """
    try:
        # Server parameters define karo
        server_params = StdioServerParameters(
            command=command,
            args=args,
        )

        # stdio_client = MCP SDK ka built-in client
        # Ye server ko subprocess mein start karta hai,
        # initialize handshake karta hai, aur session deta hai
        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                # Initialize — MCP protocol ka handshake
                await session.initialize()

                # YAHI MAIN LINE HAI — server se tool list maango
                tools_result = await session.list_tools()
                tools = tools_result.tools

                # Har tool ka text collect karo
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

                # Total tokens: ~4 chars per token + overhead
                raw_tokens = len(total_text) // 4
                overhead = 50
                total_tokens = raw_tokens + overhead

                return {
                    "tool_count": len(tools),
                    "token_count": total_tokens,
                    "tools": tool_summaries,
                }

    except Exception as e:
        return {
            "error": str(e),
            "tool_count": 0,
            "token_count": 0,
            "tools": [],
        }


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python count_tokens.py <command> <args...>"}))
        sys.exit(1)

    command = sys.argv[1]
    args = sys.argv[2:]

    result = await count_server_tokens(command, args)
    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main())
