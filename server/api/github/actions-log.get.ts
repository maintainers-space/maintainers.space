/**
 * Same-origin proxy for a single GitHub Actions job's raw log.
 *
 * `api.github.com/.../logs` redirects to a signed blob-storage URL whose CORS
 * headers are locked to GitHub's own origin, so a direct browser fetch is
 * blocked regardless of authentication. Proxying it through Nitro sidesteps
 * this — server-to-server requests aren't subject to CORS at all.
 *
 * `GET /api/github/actions-log?owner=&repo=&jobId=` (Authorization header required)
 */
export default defineEventHandler(async (event) => {
  const { owner, repo, jobId } = getQuery(event)
  if (!owner || !repo || !jobId) {
    throw createError({ statusCode: 400, statusMessage: 'owner, repo and jobId are required.' })
  }
  const auth = getHeader(event, 'authorization')
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Missing Authorization header.' })

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return await proxyText(
    event,
    `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`,
    {
      Authorization: auth,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  )
})
