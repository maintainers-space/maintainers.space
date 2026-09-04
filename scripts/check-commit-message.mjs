import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const conventionalCommit =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?!?: [a-z0-9].+/

export function isConventionalCommit(message) {
  return conventionalCommit.test(message.split('\n', 1)[0])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const messagePath = process.argv[2]
  const message = messagePath ? readFileSync(messagePath, 'utf8') : ''

  if (!isConventionalCommit(message)) {
    console.error('Commit message must use: type(scope): lowercase imperative subject')
    process.exitCode = 1
  }
}
