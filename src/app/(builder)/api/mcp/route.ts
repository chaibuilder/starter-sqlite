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
  // A refused request reaches the client as a bare 401/403, and MCP clients then fall back to
  // an OAuth flow this site does not offer, which buries the cause. Say why in the server log
  // (never the key itself) so a failing connection can be diagnosed from the host's logs.
  onAuthFailure: ({ reason, request, userId, missingPermission }) => {
    let cause: string
    if (reason === 'forbidden') {
      cause = `user ${userId} lacks the "${missingPermission}" permission`
    } else if (!request.headers.get('authorization')) {
      cause = 'no Authorization header was sent'
    } else if (!userId) {
      cause =
        'the API key did not match any user: check the key, that "Enable API Key" is saved on ' +
        'the user, and that `payload migrate` has been run against this database'
    } else {
      cause = `user ${userId} is not an active member of this site (CHAIBUILDER_APP_KEY)`
    }
    console.warn(`[mcp] Refused ${request.method} /api/mcp: ${cause}.`)
  },
})

export const { GET, POST, DELETE } = handlers
