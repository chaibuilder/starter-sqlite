import { getChaiBuilder } from '@/chaibuilder.server'
import { createChaiMcpRouteHandlers } from 'chaipro/mcp'

type ChaiMcpRouteOptions = Parameters<typeof createChaiMcpRouteHandlers>[0]

/**
 * Model Context Protocol (MCP) endpoint for this site, mounted at `/api/mcp`.
 *
 * Point an MCP client (Claude, Cursor, VS Code, …) at `<your-site>/api/mcp` and authenticate
 * with a ChaiBuilder API key. The agent then acts with exactly the permissions of that key —
 * an unauthenticated request is refused with a 401 rather than falling back to a browser
 * session, so an open admin tab can never be used to drive tool calls.
 *
 * @see https://www.chaibuilder.com/docs/ai/mcp-setup
 */
const handlers = createChaiMcpRouteHandlers({
  serverInfo: {
    name: 'chaibuilder',
    version: '1.0.0',
  },
  // The instance is typed against this app's resolved config; the MCP handler only needs the
  // shared `ChaiBuilderInstance<any>` surface, so we widen the resolver to its expected type.
  getChaiBuilder: ((request) =>
    getChaiBuilder({}, request)) as ChaiMcpRouteOptions['getChaiBuilder'],
})

export const { GET, POST, DELETE } = handlers
