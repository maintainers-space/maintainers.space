export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const appUrl = (config.public.appUrl as string).replace(/\/$/, '')

  if (!appUrl) {
    throw createError({
      statusCode: 503,
      statusMessage: 'NUXT_PUBLIC_APP_URL is not set, so no client_id can be published.'
    })
  }

  setResponseHeader(event, 'content-type', 'application/json')
  setResponseHeader(event, 'cache-control', 'public, max-age=3600')

  return {
    client_id: `${appUrl}/client-metadata.json`,
    client_name: 'maintainers.space',
    client_uri: appUrl,
    redirect_uris: [`${appUrl}/oauth/callback`],
    scope: chatScope(config.public.colibriAppviewUrl),
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true
  }
})
