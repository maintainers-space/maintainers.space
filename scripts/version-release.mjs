import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

import { codenameForVersion, isMinorRelease } from './release-codename.mjs'

const packagePath = new URL('../package.json', import.meta.url)
const changelogPath = new URL('../CHANGELOG.md', import.meta.url)
const previousVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version

execFileSync('pnpm', ['exec', 'changeset', 'version'], { stdio: 'inherit' })

const nextVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version

if (isMinorRelease(previousVersion, nextVersion)) {
  const heading = `## ${nextVersion}\n`
  const changelog = readFileSync(changelogPath, 'utf8')
  const codename = codenameForVersion(nextVersion)

  if (!changelog.includes(heading)) {
    throw new Error(`Could not find ${heading.trim()} in CHANGELOG.md`)
  }

  writeFileSync(
    changelogPath,
    changelog.replace(heading, `${heading}\n> Internal codename: **${codename}**\n`)
  )
}
