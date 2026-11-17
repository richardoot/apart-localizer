import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { lazyModule } from '../common/lazy-module'

/** Le serveur et le transport du SDK MCP. */
export interface McpSdk {
  McpServer: typeof McpServer
  StreamableHTTPServerTransport: typeof StreamableHTTPServerTransport
}

/**
 * Le SDK MCP (avec ajv et la conversion des schémas), chargé à la première
 * requête /mcp (ADR 0048) : un démarrage à froid pour l'application web ne
 * le paie pas.
 */
export const mcpSdk = lazyModule<McpSdk>(() => {
  /* eslint-disable @typescript-eslint/no-require-imports -- chargement différé voulu */
  const server = require('@modelcontextprotocol/sdk/server/mcp.js') as Pick<
    McpSdk,
    'McpServer'
  >
  const transport =
    require('@modelcontextprotocol/sdk/server/streamableHttp.js') as Pick<
      McpSdk,
      'StreamableHTTPServerTransport'
    >
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    McpServer: server.McpServer,
    StreamableHTTPServerTransport: transport.StreamableHTTPServerTransport,
  }
})
