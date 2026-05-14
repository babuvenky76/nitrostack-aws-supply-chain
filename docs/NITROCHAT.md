# NitroChat integration (placeholder)

This release focuses on **NitroStack Studio + MCP + widgets** and a standalone **web portal** for human OAuth.

## Planned work

- Wire a **NitroChat** deployment to this MCP server over HTTP/SSE (or your chosen transport) with branding aligned to your tenant.
- Map Cognito **groups → MCP RBAC** if you enable fine-grained tool access in NitroStack.
- Optional: publish the MCP app to **NitroCloud** for a single-click hosted demo.

Until then, use NitroStack Studio’s built-in chat + tool inspector against `mcp-server/` exactly like the Automotive reference.
