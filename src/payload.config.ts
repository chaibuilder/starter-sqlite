import { postgresAdapter } from '@payloadcms/db-postgres'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { chaiBuilderPlugin, chaiBuilderSchemaHook } from 'chaipro/payload'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { Blog } from './collections/Blog'
import { BlogCategories } from './collections/BlogCategories'
import { FormSubmissions } from './collections/FormSubmissions'
import { Media } from './collections/Media'
import { SiteConfig } from './collections/SiteConfig'
import { Users } from './collections/Users'

import { getAdminRoute } from '@/utilities/adminRoute'
import { getAppStoragePrefix } from '@/utilities/getAppStoragePrefix'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Placeholder connection used when DATABASE_URL is unset. A fresh deployment
 * (e.g. "Deploy to Vercel" with no environment variables) must still boot far
 * enough to serve `/setup`; every other route is redirected there by
 * `src/proxy.ts`, so this connection is never actually opened. It points at
 * localhost on purpose: if something does try to use it the connection is
 * refused immediately rather than hanging on a DNS lookup.
 */
const PLACEHOLDER_DATABASE_URL = 'postgres://chai:chai@127.0.0.1:5432/chai-placeholder'
const PLACEHOLDER_SECRET = 'chai-unconfigured-placeholder-secret'

export type PayloadConfigOverrides = {
  /** Database connection string to use instead of `DATABASE_URL`. */
  database?: { url: string }
  secret?: string
}

/**
 * Media uploads only survive a redeploy when object storage is configured; the
 * `/setup` status page surfaces this so the user is not silently losing files.
 */
export const mediaStorageActive = Boolean(
  process.env.BUCKET_NAME && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
)

/**
 * Resolve which database to connect to.
 *
 * A Postgres connection string carries its own credentials, so an override
 * replaces the environment's connection outright — there is nothing to merge.
 */
export function resolveDatabase(override?: { url: string }): { url: string } {
  if (override) return { url: override.url }
  return { url: process.env.DATABASE_URL || PLACEHOLDER_DATABASE_URL }
}

/**
 * Builds the Payload config. The overrides let the `/setup` wizard boot a
 * throwaway instance against credentials the user has just typed in, before
 * those credentials exist as environment variables on the deployment.
 */
export function buildPayloadConfig(overrides: PayloadConfigOverrides = {}) {
  const { url: databaseUrl } = resolveDatabase(overrides.database)
  const secret = overrides.secret || process.env.PAYLOAD_SECRET || PLACEHOLDER_SECRET

  return buildConfig({
    routes: {
      admin: getAdminRoute(),
    },
    localization: {
      defaultLocale: 'en',
      locales: ['en'],
      fallback: true,
    },
    admin: {
      user: Users.slug,
      importMap: {
        baseDir: path.resolve(dirname),
      },
      meta: {
        titleSuffix: '| ChaiBuilder',
        description: 'ChaiBuilder CMS',
        icons: [
          {
            rel: 'icon',
            type: 'image/svg+xml',
            url: '/favicon.svg',
          },
        ],
        openGraph: {
          title: 'ChaiBuilder',
          siteName: 'ChaiBuilder',
          images: [
            {
              url: '/favicon.svg',
              width: 48,
              height: 48,
            },
          ],
        },
      },
      components: {
        providers: ['chaipro/payload/client#IframeBridge'],
        graphics: {
          Logo: '@/components/admin/Logo#Logo',
          Icon: '@/components/admin/Icon#Icon',
        },
        views: {
          login: {
            Component: '@/components/CustomLoginView#CustomLoginView',
          },
        },
      },
      theme: 'dark',
    },
    collections: [Users, Blog, BlogCategories, Media, SiteConfig, FormSubmissions],
    globals: [],
    editor: lexicalEditor(),
    secret,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
    db: postgresAdapter({
      pool: {
        connectionString: databaseUrl,
      },
      push: process.env.PAYLOAD_DB_PUSH === 'true',
      beforeSchemaInit: [chaiBuilderSchemaHook],
      // The `location` point field on Site Config becomes a `geometry(Point)`
      // column on Postgres, which the server only understands once PostGIS is
      // installed. Payload issues `CREATE EXTENSION IF NOT EXISTS` on connect;
      // it is named here so the requirement is visible rather than inferred from
      // a field three files away. Hosted providers ship PostGIS but leave it off
      // by default — `describeDbError` explains the failure if it is missing.
      extensions: ['postgis'],
      idType: 'uuid',
      transactionOptions: {},
      migrationDir: path.resolve(dirname, 'migrations'),
      // Deliberately no `prodMigrations`: it migrates on every production
      // `payload.init`, including during `next build`. Against a database whose
      // schema came from Drizzle push, that hits an interactive "data loss will
      // occur" prompt which has nothing to answer it, and the build hangs.
      // `/setup` migrates explicitly instead; upgrades run `payload migrate`.
    }),
    sharp,
    plugins: [
      seoPlugin({
        collections: ['blog', 'site-config'],
        uploadsCollection: 'media',
        generateTitle: ({ doc }) => doc?.title || doc?.name || '',
        generateDescription: ({ doc }) => doc?.excerpt || doc?.tagline || doc?.title || '',
        tabbedUI: true,
      }),
      chaiBuilderPlugin({
        revalidateCollections: ['blog'],
        appCollections: [
          'blog',
          'blog-categories',
          'media',
          'site-config',
          'form-submissions',
        ],
      }),
      // Local disk uploads do not survive a redeploy on serverless hosts, so S3
      // is registered whenever the bucket credentials are present. The app key
      // is required too, since the storage prefix is derived from it.
      ...(mediaStorageActive && process.env.CHAIBUILDER_APP_KEY
        ? [
            s3Storage({
              collections: {
                media: { prefix: getAppStoragePrefix() },
              },
              bucket: process.env.BUCKET_NAME!,
              config: {
                credentials: {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
                },
                region: process.env.S3_REGION || 'auto',
                endpoint: process.env.S3_ENDPOINT || undefined,
              },
            }),
          ]
        : []),
    ],
  })
}

export default buildPayloadConfig()
