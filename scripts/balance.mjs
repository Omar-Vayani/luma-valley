/**
 * balance — is an hour in Haven actually interesting?
 *
 * Runs long simulations across several seeds and reports the things that make
 * a session worth watching: does the population survive without exploding, do
 * events keep happening, is there variety in what happens, and is anybody
 * living a life rather than starving in a field.
 *
 *   npm run balance
 *   npm run balance -- --ticks 30000 --seeds 1,2,3
 *
 * One hour of play is roughly 21,600 ticks at six ticks per second.
 */
import { performance } from 'node:perf_hooks'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const TICKS = Number(arg('ticks', '21600'))
const SEEDS = arg('seeds', '1,7,42,99,2026,777').split(',').map(Number)
const POP = Number(arg('pop', '8'))
const TICKS_PER_HOUR = 21600

const { createSim } = await import('../src/lab/sim.ts')

function runSeed(seed) {
  const sim = createSim(seed)
  sim.settings.lodNear = 200
  sim.settings.aiBatchSize = 8
  for (let i = 0; i < POP; i++) {
    const angle = (i / POP) * Math.PI * 2
    sim.spawnCreature(undefined, Math.cos(angle) * 12, Math.sin(angle) * 12)
  }

  const samples = []
  const actions = new Map()
  let starvations = 0
  const started = performance.now()

  for (let t = 0; t < TICKS; t++) {
    sim.tick()
    if (t % 300 === 0) {
      const alive = sim.creatures.filter((c) => c.alive)
      samples.push({
        alive: alive.length,
        hunger: mean(alive.map((c) => c.chem.hunger)),
        purpose: mean(alive.map((c) => c.chem.purpose)),
        pleasure: mean(alive.map((c) => c.chem.pleasure)),
        couples: alive.filter((c) => c.partnerId !== null).length,
        jobs: Object.keys(sim.jobs.holders).length,
      })
      for (const c of alive) actions.set(c.action, (actions.get(c.action) ?? 0) + 1)
    }
  }
  const elapsed = performance.now() - started

  const kinds = new Map()
  for (const e of sim.stories.events) {
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1)
    if (e.kind === 'death' && e.because === 'starvation') starvations++
  }
  const alive = sim.creatures.filter((c) => c.alive)
  const deaths = sim.creatures.filter((c) => !c.alive).length
  const births = sim.creatures.filter((c) => c.parentIds.length > 0).length

  return {
    seed,
    elapsed,
    finalAlive: alive.length,
    minAlive: Math.min(...samples.map((s) => s.alive)),
    maxAlive: Math.max(...samples.map((s) => s.alive)),
    avgAlive: mean(samples.map((s) => s.alive)),
    extinctions: samples.filter((s) => s.alive === 0).length,
    avgHunger: mean(samples.map((s) => s.hunger)),
    avgPurpose: mean(samples.map((s) => s.purpose)),
    avgPleasure: mean(samples.map((s) => s.pleasure)),
    avgCouples: mean(samples.map((s) => s.couples)),
    avgJobs: mean(samples.map((s) => s.jobs)),
    births,
    deaths,
    starvations,
    // the shape of the drama: how many notable things happen per hour of play,
    // and across how many different kinds
    eventsPerHour: (sim.stories.events.length / TICKS) * TICKS_PER_HOUR,
    kindsSeen: kinds.size,
    kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]),
    topActions: [...actions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    culture: sim.culture.norms,
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

console.log(`\nLuma Haven balance — ${TICKS} ticks (${(TICKS / TICKS_PER_HOUR).toFixed(1)}h of play) × ${SEEDS.length} seeds\n`)
const results = SEEDS.map(runSeed)

console.log('seed   alive(min/avg/max)  births  deaths  starved  couples  jobs  events/h  kinds')
for (const r of results) {
  console.log(
    `${String(r.seed).padEnd(6)} ${String(r.minAlive).padStart(3)}/${r.avgAlive.toFixed(1).padStart(4)}/${String(r.maxAlive).padStart(3)}` +
    `        ${String(r.births).padStart(3)}     ${String(r.deaths).padStart(3)}      ${String(r.starvations).padStart(3)}` +
    `     ${r.avgCouples.toFixed(1).padStart(4)}  ${r.avgJobs.toFixed(1).padStart(4)}` +
    `    ${r.eventsPerHour.toFixed(0).padStart(4)}   ${String(r.kindsSeen).padStart(3)}`,
  )
}

const agg = {
  avgAlive: mean(results.map((r) => r.avgAlive)),
  minAlive: Math.min(...results.map((r) => r.minAlive)),
  extinctions: results.reduce((s, r) => s + r.extinctions, 0),
  hunger: mean(results.map((r) => r.avgHunger)),
  purpose: mean(results.map((r) => r.avgPurpose)),
  pleasure: mean(results.map((r) => r.avgPleasure)),
  eventsPerHour: mean(results.map((r) => r.eventsPerHour)),
  kinds: mean(results.map((r) => r.kindsSeen)),
  starved: results.reduce((s, r) => s + r.starvations, 0),
  deaths: results.reduce((s, r) => s + r.deaths, 0),
}

console.log(`\naverages: alive ${agg.avgAlive.toFixed(1)} · hunger ${agg.hunger.toFixed(2)} · purpose ${agg.purpose.toFixed(2)}` +
  ` · pleasure ${agg.pleasure.toFixed(2)} · ${agg.eventsPerHour.toFixed(0)} notable events per hour across ${agg.kinds.toFixed(1)} kinds`)

// what kinds of story dominate, summed over all seeds
const allKinds = new Map()
for (const r of results) for (const [k, n] of r.kinds) allKinds.set(k, (allKinds.get(k) ?? 0) + n)
const total = [...allKinds.values()].reduce((a, b) => a + b, 0)
console.log('\nstory mix:')
for (const [k, n] of [...allKinds.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(16)} ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(1).padStart(5)}%`)
}

// the judgements a human would make, stated as pass/fail
console.log('\nverdict:')
const checks = [
  ['nobody goes extinct', agg.extinctions === 0],
  ['population stays small but alive (3–20)', agg.avgAlive >= 3 && agg.avgAlive <= 20],
  ['something notable happens at least every couple of minutes', agg.eventsPerHour >= 30],
  ['the drama is varied (6+ kinds of event)', agg.kinds >= 6],
  ['death is not mostly starvation', agg.starved <= agg.deaths * 0.4],
  ['creatures are usually fed (hunger above 0.35)', agg.hunger >= 0.35],
  ['creatures have something to live for (purpose above 0.3)', agg.purpose >= 0.3],
]
let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`)
}
console.log(failed === 0 ? '\nBalanced.\n' : `\n${failed} problem(s) to tune.\n`)
process.exit(failed === 0 ? 0 : 1)
