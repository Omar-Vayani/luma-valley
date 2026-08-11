/**
 * bench — measure what the simulation actually costs on this machine.
 *
 * Runs the real simulation headlessly at several population sizes and
 * settings, and reports milliseconds per tick plus the save size. Rendering is
 * not included: this is the CPU cost the browser has to fit alongside drawing,
 * so a tick budget well under the frame budget is what you want.
 *
 *   npm run bench
 *   npm run bench -- --ticks 3000 --pops 8,16,24
 */
import { performance } from 'node:perf_hooks'
import os from 'node:os'

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const TICKS = Number(arg('ticks', '2000'))
const POPS = arg('pops', '8,16,24').split(',').map(Number)
const SIM_HZ = 6

const { createSim } = await import('../src/lab/sim.ts')
const { saveSim } = await import('../src/lab/save.ts')

function runOnce({ population, aiBatchSize, lodNear }) {
  const sim = createSim(1234)
  sim.settings.populationCap = Math.max(population, sim.settings.populationCap)
  sim.settings.aiBatchSize = aiBatchSize
  sim.settings.lodNear = lodNear
  for (let i = 0; i < population; i++) {
    const angle = (i / population) * Math.PI * 2
    sim.spawnCreature(undefined, Math.cos(angle) * 14, Math.sin(angle) * 14)
  }
  // warm up so JIT compilation is not counted as simulation cost
  for (let i = 0; i < 200; i++) sim.tick()

  const started = performance.now()
  for (let i = 0; i < TICKS; i++) sim.tick()
  const elapsed = performance.now() - started

  const msPerTick = elapsed / TICKS
  const saveKb = Buffer.byteLength(JSON.stringify(saveSim(sim))) / 1024
  const alive = sim.creatures.filter((c) => c.alive).length
  return {
    msPerTick,
    saveKb,
    alive,
    perCreatureKb: alive > 0 ? saveKb / alive : 0,
    budgetUsed: (msPerTick * SIM_HZ) / 16.67, // share of a 60fps frame budget
  }
}

const rows = []
for (const population of POPS) {
  for (const [label, opts] of [
    ['low', { aiBatchSize: 2, lodNear: 20 }],
    ['medium', { aiBatchSize: 4, lodNear: 28 }],
    ['high', { aiBatchSize: 6, lodNear: 36 }],
  ]) {
    const result = runOnce({ population, ...opts })
    rows.push({ population, preset: label, ...result })
  }
}

console.log(`\nLuma Haven simulation benchmark`)
console.log(`node ${process.version} · ${os.cpus()[0]?.model ?? 'unknown cpu'} · ${TICKS} ticks per run\n`)
console.log('pop  preset  ms/tick  sim load @6Hz  alive  save KB  KB/creature')
for (const r of rows) {
  console.log(
    `${String(r.population).padEnd(4)} ${r.preset.padEnd(7)} ${r.msPerTick.toFixed(3).padStart(7)}` +
    `  ${(r.budgetUsed * 100).toFixed(1).padStart(11)}%` +
    `  ${String(r.alive).padStart(5)}  ${r.saveKb.toFixed(1).padStart(7)}  ${r.perCreatureKb.toFixed(1).padStart(11)}`,
  )
}

const worst = rows.reduce((a, b) => (a.budgetUsed >= b.budgetUsed ? a : b))
console.log(
  `\nHeaviest run: ${worst.population} Luma on ${worst.preset} uses ` +
  `${(worst.budgetUsed * 100).toFixed(1)}% of one 60 FPS frame budget for simulation.`,
)
console.log('Rendering is measured separately in-game with the F3 overlay.\n')
