import { getChaiBuilder } from '@/chaibuilder.server'
import { NextRequest } from 'next/server'
import type { ChaiBuilderRouteProps } from 'chaipro/nextjs/server'

export async function POST(req: NextRequest, props: ChaiBuilderRouteProps) {
  const body = await req.json()
  // ponytail: NextRequest vs package Request typing
  const cb = await getChaiBuilder(props, req as any)
  return cb.handleHttpAction(body)
}
