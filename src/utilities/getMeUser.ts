import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import type { User } from '../payload-types'
import { buildOriginURL } from './getURL'

export const getMeUser = async (args?: {
  nullUserRedirect?: string
  validUserRedirect?: string
}): Promise<{
  token: string
  user: User
}> => {
  const { nullUserRedirect, validUserRedirect } = args || {}
  const cookieStore = await cookies()
  const token = cookieStore.get('payload-token')?.value
  const requestHeaders = await headers()
  const origin = buildOriginURL({
    host: requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'),
    forwardedProto: requestHeaders.get('x-forwarded-proto') ?? 'http',
  })

  const meUserReq = await fetch(`${origin}/api/users/me`, {
    headers: {
      Authorization: `JWT ${token}`,
    },
  })

  const {
    user,
  }: {
    user: User
  } = await meUserReq.json()

  if (validUserRedirect && meUserReq.ok && user) {
    redirect(validUserRedirect)
  }

  if (nullUserRedirect && (!meUserReq.ok || !user)) {
    redirect(nullUserRedirect)
  }

  // Token will exist here because if it doesn't the user will be redirected
  return {
    token: token!,
    user,
  }
}
