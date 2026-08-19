import { getChaiBuilder } from '@/chaibuilder.server'
import { NextRequest } from 'next/server'
import {
  isMultipartActionRequest,
  parseMultipartActionBody,
  toActionErrorPayload,
  type ChaiBuilderRouteProps,
  type HttpChaiActionBody,
} from 'chaipro/nextjs/server'

export async function POST(req: NextRequest, props: ChaiBuilderRouteProps) {
  let body: HttpChaiActionBody

  try {
    body = isMultipartActionRequest(req)
      ? await parseMultipartActionBody(req)
      : ((await req.json()) as HttpChaiActionBody)
  } catch (error) {
    const payload = toActionErrorPayload(error)
    return Response.json({ ok: false, error: payload }, { status: payload.status })
  }

  const cb = await getChaiBuilder(props, req as any)
  return cb.handleHttpAction(body)
}
