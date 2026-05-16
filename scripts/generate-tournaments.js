const fs = require('fs')
const path = require('path')

const tournamentsDir = path.join(__dirname, '..', 'data', 'tournaments')
const outputFile = path.join(__dirname, '..', 'src', 'generated', 'tournaments.ts')

const files = fs.readdirSync(tournamentsDir).filter(f => f.endsWith('.json'))

const imports = files.map((f, i) => {
  return `import t${i} from '@data/tournaments/${f}'`
}).join('\n')

const output = `// Auto-generated - do not edit manually
// Run: node scripts/generate-tournaments.js
import type { Tournament } from '@/lib/types'

${imports}

export const tournaments = [
${files.map((_, i) => `  t${i},`).join('\n')}
] as unknown as Tournament[]
`

const outputDir = path.dirname(outputFile)
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

fs.writeFileSync(outputFile, output)
console.log(`Generated tournaments index with ${files.length} tournaments`)
