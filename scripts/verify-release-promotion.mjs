import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { isVersionPromotion } from './release-codename.mjs'

const previousCommit = process.argv[2]
if (!/^[0-9a-f]{40}$/.test(previousCommit)) {
  throw new TypeError('A full previous commit SHA is required')
}

const previousPackage = execFileSync('git', ['show', `${previousCommit}:package.json`], {
  encoding: 'utf8'
})
const previousVersion = JSON.parse(previousPackage).version
const nextVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version

if (!isVersionPromotion(previousVersion, nextVersion)) {
  throw new Error(`Expected a version increase from ${previousVersion}, received ${nextVersion}`)
}

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
if (!changelog.split('\n').includes(`## ${nextVersion}`)) {
  throw new Error(`Could not find version ${nextVersion} in CHANGELOG.md`)
}
