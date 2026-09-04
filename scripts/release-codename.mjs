const codenames = [
  'Alpheratz',
  'Caph',
  'Diphda',
  'Errai',
  'Furud',
  'Gacrux',
  'Hamal',
  'Izar',
  'Jabbah',
  'Keid',
  'Lesath',
  'Menkar',
  'Nashira',
  'Okul',
  'Pherkad',
  'Rasalhague',
  'Sadr',
  'Talitha',
  'Unukalhai',
  'Vindemiatrix',
  'Wasat',
  'Yed Prior',
  'Zaniah'
]

function parseSemanticVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version
    )
  if (!match) throw new TypeError(`Invalid semantic version: ${version}`)

  const prerelease = match[4]?.split('.')
  if (
    prerelease?.some(
      (identifier) =>
        /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0')
    )
  ) {
    throw new TypeError(`Invalid semantic version: ${version}`)
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease
  }
}

export function codenameForVersion(version) {
  const { major, minor } = parseSemanticVersion(version)
  const index = (major * 31 + minor - 1) % codenames.length
  return codenames.at(index)
}

export function isMinorRelease(previousVersion, nextVersion) {
  const previous = parseSemanticVersion(previousVersion)
  const next = parseSemanticVersion(nextVersion)
  return next.major === previous.major && next.minor > previous.minor
}

export function isVersionPromotion(previousVersion, nextVersion) {
  const previous = parseSemanticVersion(previousVersion)
  const next = parseSemanticVersion(nextVersion)
  const previousCore = [previous.major, previous.minor, previous.patch]
  const nextCore = [next.major, next.minor, next.patch]

  for (const [index, value] of nextCore.entries()) {
    if (value !== previousCore[index]) return value > previousCore[index]
  }

  if (!previous.prerelease) return false
  if (!next.prerelease) return true

  const length = Math.max(previous.prerelease.length, next.prerelease.length)
  for (let index = 0; index < length; index++) {
    const previousIdentifier = previous.prerelease[index]
    const nextIdentifier = next.prerelease[index]
    if (previousIdentifier === undefined) return true
    if (nextIdentifier === undefined) return false
    if (previousIdentifier === nextIdentifier) continue

    const previousNumeric = /^\d+$/.test(previousIdentifier)
    const nextNumeric = /^\d+$/.test(nextIdentifier)
    if (previousNumeric && nextNumeric) return Number(nextIdentifier) > Number(previousIdentifier)
    if (previousNumeric !== nextNumeric) return !nextNumeric
    return nextIdentifier > previousIdentifier
  }

  return false
}
