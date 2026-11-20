'use strict'

const test = require('brittle')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadContract, createInstance } = require('@tetherto/mdk-worker')

const dir = path.join(__dirname, '..', '..', 'workers', 'v1-pool')
const { createServer } = require(path.join(dir, 'mock', 'server'))

const KINDS = [
  { kind: 'emcd', port: 15065, apiPath: '/pool/v1', accounts: ['emcd'] },
  { kind: 'spiderpool', port: 15066, accounts: ['spider'] },
  { kind: 'foundry', port: 15067, accounts: ['foundry'] }
]

for (const { kind, ...opts } of KINDS) {
  test(`v1-pool bridge - ${kind} reads its pool through the vendor mock`, async (t) => {
    const mock = createServer({ kind, host: '127.0.0.1', ...opts })
    await mock.ready
    t.teardown(() => mock.exit())

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v1-pool-'))
    t.teardown(() => fs.rmSync(tmp, { recursive: true, force: true }))

    const { entries } = await loadContract(dir)
    const instance = createInstance({
      dir,
      entries,
      device: { id: `${kind}-pool-worker`, opts: { kind, host: '127.0.0.1', ...opts, tickMs: 3600000, dbPath: path.join(tmp, 'db') }, env: {}, config: {} }
    })

    t.is(typeof await instance.telemetry.get('hashrate')(), 'number')
    t.is(typeof await instance.telemetry.get('workers_online')(), 'number')
    const stats = await instance.telemetry.get('stats')()
    t.ok(stats, 'stats ext data')
  })
}

test('v1-pool bridge - rejects an unknown pool kind', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v1-pool-'))
  t.teardown(() => fs.rmSync(tmp, { recursive: true, force: true }))

  const { entries } = await loadContract(dir)
  const instance = createInstance({ dir, entries, device: { id: 'x', opts: { kind: 'nope', dbPath: path.join(tmp, 'db') }, env: {}, config: {} } })
  await t.exception(instance.telemetry.get('hashrate')(), /ERR_POOL_KIND_INVALID/)
})

// The vendor pool services keep timers for their device's lifetime, which a
// worker process never outlives, so the run ends once every test has reported.
// brittle has already set a failing exit code by then.
test('v1-pool bridge - end the run', (t) => {
  t.pass()
  setImmediate(() => process.exit())
})
