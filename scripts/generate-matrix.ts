import fs from 'fs'
import path from 'path'
import { forgeList } from '../app/lib/forges/index.js' // We'll run this via tsx so imports work
import type { ForgeFeatureMatrix } from '../app/types/features.js'

const allFeatures: (keyof ForgeFeatureMatrix)[] = [
  'repoRead',
  'codeRead',
  'commitRead',
  'issueRead',
  'pullRead',
  'discussionRead',
  'actionRead',
  'search',
  'notificationRead',
  'write',
  'activityRead'
]

function generateMatrix() {
  const providers = forgeList

  let md = '# Forge Feature Matrix\n\n'
  md +=
    'This document is automatically generated to show which features are supported by which forge providers.\n\n'

  // Table Header
  md += '| Feature | ' + providers.map((p) => p.label).join(' | ') + ' |\n'
  md += '|---------|' + providers.map(() => '---').join('|') + '|\n'

  // Table Rows
  for (const feature of allFeatures) {
    let row = `| **${feature}** | `
    for (const provider of providers) {
      const group = provider.features[feature]
      // A group is "supported" only when the provider declares it with at least
      // one method; an omitted or empty group means the capability is unavailable.
      const hasFeature = !!group && Object.keys(group).length > 0
      row += (hasFeature ? '✅' : '❌') + ' | '
    }
    md += row + '\n'
  }

  const outputPath = path.join(process.cwd(), 'FORGE_MATRIX.md')
  fs.writeFileSync(outputPath, md)
  console.log(`Generated matrix at ${outputPath}`)
}

generateMatrix()
