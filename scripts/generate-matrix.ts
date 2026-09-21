import fs from 'fs'
import path from 'path'
import { forgeList } from '../app/lib/forges/index.js' // We'll run this via tsx so imports work

const allFeatures = [
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
      // @ts-ignore
      const hasFeature = provider.features && provider.features[feature]
      row += (hasFeature ? '✅' : '❌') + ' | '
    }
    md += row + '\n'
  }

  const outputPath = path.join(process.cwd(), 'FORGE_MATRIX.md')
  fs.writeFileSync(outputPath, md)
  console.log(`Generated matrix at ${outputPath}`)
}

generateMatrix()
