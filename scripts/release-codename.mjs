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

export function codenameForVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new TypeError(`Invalid semantic version: ${version}`)

  const major = Number(match[1])
  const minor = Number(match[2])
  const index = (major * 31 + minor - 1) % codenames.length
  return codenames.at(index)
}

export function isMinorRelease(previousVersion, nextVersion) {
  const previous = previousVersion.split('.').map(Number)
  const next = nextVersion.split('.').map(Number)
  return next[0] === previous[0] && next[1] > previous[1]
}
