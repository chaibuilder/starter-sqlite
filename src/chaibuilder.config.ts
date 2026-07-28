/**
 * ChaiBuilder configuration — plain data, deliberately free of framework imports
 * (`next/headers` and friends) so scripts, CI, and the Payload CLI can import it.
 * Per-request concerns — auth, tenancy, draft, site URL — live in `chaibuilder.server.ts`.
 */
import { Blog } from '@/collections/Blog'
import config from '@payload-config'
import { createNodePgDB } from 'chaipro/db/node-pg'
import {
    asChaiBuilderGlobalProvider,
    buildChaiBuilderConfig,
    payloadMediaPlugin,
} from 'chaipro/payload'
import { aiPlugin } from 'chaipro/plugins/ai-pro/server'
import { animationPlugin } from 'chaipro/plugins/animation/server'
import { mediaSearchPlugin } from 'chaipro/plugins/media-search/server'
import { redirectsPlugin } from 'chaipro/plugins/redirects/server'
import { revisionsPlugin } from 'chaipro/plugins/revisions/server'
import { trashPlugin } from 'chaipro/plugins/trash/server'
import type { ResolvedChaiBuilderServerConfig } from 'chaipro/types'

const chaiConfig: Readonly<ResolvedChaiBuilderServerConfig> = buildChaiBuilderConfig({
  payloadConfig: config,
  db: createNodePgDB({
    // Falls back to a placeholder so a deployment with no environment variables
    // still boots and can serve `/setup`. See `src/payload.config.ts`.
    url: process.env.DATABASE_URL || 'postgres://chai:chai@127.0.0.1:5432/chai-placeholder',
  }),
  // Registering a plugin enables its feature; options carry the feature's config.
  // Plugin tables are NOT gated here — `chaiBuilderSchemaHook` injects the
  // full ChaiBuilder schema, so every plugin's tables exist (empty when
  // unregistered) and enabling a plugin later needs no migration.
  // Not registered: aiCreditsPlugin (credit billing), multilingualPlugin,
  // tenancyPlugin (core pins a single app), plansPlugin, licensingPlugin,
  // rolesPlugin (DB-backed roles), layoutPlugin, formSubmissionsPlugin (this
  // starter writes submissions to its own Payload collection).
  plugins: [
    // Payload-backed DAM (asset actions + media trash entity). Non-Payload
    // hosts would register mediaPlugin({ storage }) instead.
    payloadMediaPlugin(),
    redirectsPlugin(),
    trashPlugin(),
    mediaSearchPlugin({
      providers: [
        {
          id: 'pexels',
          filters: {
            orientation: ['default', 'landscape', 'portrait', 'square'],
            size: ['default', 'large', 'medium', 'small'],
            color: [
              'default',
              'red',
              'orange',
              'yellow',
              'green',
              'turquoise',
              'blue',
              'violet',
              'pink',
              'brown',
              'black',
              'gray',
              'white',
            ],
          },
        },
        {
          id: 'unsplash',
          filters: {
            orientation: ['default', 'landscape', 'portrait', 'squarish'],
            color: [
              'default',
              'black_and_white',
              'black',
              'white',
              'yellow',
              'orange',
              'red',
              'purple',
              'magenta',
              'green',
              'teal',
              'blue',
            ],
            order_by: ['default', 'relevant', 'latest'],
          },
        },
      ],
    }),
    aiPlugin(),
    revisionsPlugin({ drafts: true, maxRevisions: 10 }),
    animationPlugin(),
  ],
  ai: {
    models: [
      {
        id: 'zai/glm-5.2',
        name: 'GLM 5.2',
        provider: 'zai',
        multiplier: 3,
        description: '3x Credits',
        // text-only model — it cannot read images/files
        allowedFileTypes: [],
      },
      {
        id: 'google/gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        provider: 'google',
        multiplier: 3,
        description: '3x Credits',
      },
      {
        id: 'google/gemini-3-flash',
        name: 'Gemini 3 Flash',
        provider: 'google',
        multiplier: 1,
        description: '1x Credits',
      },
    ],
  },
  globalDataProvider: asChaiBuilderGlobalProvider({ slug: 'site-config' }),
  pageTypes: [
    {
      collection: Blog,
      helpText: 'A blog post page',
      dynamicSegments: '/[a-zA-Z0-9-]+',
      dataProviderDepth: 2,
    }
  ],
  collections: [Blog],
})

export default chaiConfig
