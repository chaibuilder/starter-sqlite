import { registerCustomBlocks } from '@/blocks'
import { getChaiBuilder } from '@/chaibuilder.server'
import { registerProjectFonts } from '@/fonts'
import { ChaiPageCSS, RenderChaiBlocks } from 'chaipro/nextjs/render'
import { PreviewBanner } from 'chaipro/nextjs/render-client'
import { loadWebBlocks } from 'chaipro/web-blocks'
import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { isConfigured } from '@/lib/is-configured'

registerProjectFonts()
loadWebBlocks()
registerCustomBlocks()

export const dynamic = 'force-static'

type PageProps = {
  params: Promise<{ slug?: string[] }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const getSlugFromParams = (slug?: string[]) =>
  slug && slug.length > 0 ? `/${slug.join('/')}` : '/'

export const generateMetadata = async (props: PageProps): Promise<Metadata> => {
  // Before setup there is no database to read a page from. This is reachable at
  // build time, where middleware does not run.
  if (!isConfigured()) return { title: 'Set up your site' }

  const { slug: slugParams } = await props.params
  const slug = getSlugFromParams(slugParams)
  const cb = await getChaiBuilder(props)
  const metadataPayload = await cb.getPageMetadataPayload(slug)
  return await cb.generateMetaData(metadataPayload)
}

export default async function Page(props: PageProps) {
  // Rendered only when this deployment has not been set up yet; visitors are
  // redirected to `/setup` by middleware, but the build still prerenders here.
  if (!isConfigured()) {
    return (
      <html lang="en">
        <body>
          <p>
            This site has not been set up yet. <a href="/setup">Finish setup</a>.
          </p>
        </body>
      </html>
    )
  }

  const { slug: slugParams } = await props.params
  const slug = getSlugFromParams(slugParams)
  const cb = await getChaiBuilder(props)
  const { isEnabled } = await draftMode()
  const { page, settings, pageData, pageProps } = await cb.getPagePayload(slug)

  return (
    <html className={`scroll-smooth`} lang={page.lang}>
      <head>
        <ChaiPageCSS page={page} />
      </head>
      <body className={`font-body antialiased`}>
        <PreviewBanner show={isEnabled} />
        <RenderChaiBlocks pageData={pageData} settings={settings} page={page} pageProps={pageProps} />
      </body>
    </html>
  )
}
