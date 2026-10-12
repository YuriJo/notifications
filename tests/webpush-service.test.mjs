// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../src/services/webPushService.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export \{[\s\S]*?\}\s*$/, '')
function service(environment = {}) {
  const posts = []
  class BrowserBytes extends Uint8Array {
    toBase64() { return Buffer.from(this).toString('base64url') }
  }
  const context = vm.createContext({ Uint8Array: BrowserBytes, FormData, console: { log() {} },
    axios: { get: async () => ({ data: { ocs: { data: { vapid: 'AQID' } } } }), post: async (path, data) => { posts.push({ path, data }); return { status: 200 } } },
    generateOcsUrl: path => path, ...environment,
  })
  vm.runInContext(source, context)
  return { register: vm.runInContext('registerPush', context), afterLoad: vm.runInContext('afterWindowLoad', context), posts }
}
const sub = (key = [1, 2, 3]) => ({ endpoint: 'https://push.example.test/fixture', options: { applicationServerKey: new Uint8Array(key), userVisibleOnly: true }, getKey: () => new Uint8Array([4, 5, 6]) })
test('a reload reuses the Chrome subscription and registers it without changing visibility options', async () => {
  const { register, posts } = service()
  await register({ pushManager: { getSubscription: async () => sub(), subscribe: async () => { throw Error('must reuse existing subscription') } } })
  assert.equal(posts.length, 1)
  assert.equal(posts[0].data.get('endpoint'), 'https://push.example.test/fixture')
})
test('a changed VAPID key unsubscribes and creates a new subscription', async () => {
  const { register, posts } = service(); let removed = false; let created = false
  const old = { ...sub([9, 9, 9]), unsubscribe: async () => { removed = true } }
  await register({ pushManager: { getSubscription: async () => old, subscribe: async () => { assert.equal(removed, true); created = true; return sub() } } })
  assert.equal(created, true); assert.equal(posts.length, 1)
})
test('a first Chrome subscription retries with userVisibleOnly when silent push is refused', async () => {
  const { register, posts } = service(); const attempts = []
  await register({ pushManager: { getSubscription: async () => null, subscribe: async options => { attempts.push(options.userVisibleOnly); if (!options.userVisibleOnly) { const e = Error('requires visible push'); e.name = 'NotAllowedError'; throw e } return sub() } } })
  assert.deepEqual(attempts, [false, true]); assert.equal(posts.length, 1)
})

test('an async component mounted after window load initializes immediately', () => {
  let started = 0
  const { afterLoad } = service({ document: { readyState: 'complete' }, window: { addEventListener() { throw Error('load already happened') } } })
  afterLoad(() => { started++ }); assert.equal(started, 1)
})
test('a component mounted before window load initializes once on load', () => {
  let callback; let once; let started = 0
  const { afterLoad } = service({ document: { readyState: 'loading' }, window: { addEventListener(event, handler, options) { assert.equal(event, 'load'); callback = handler; once = options.once } } })
  afterLoad(() => { started++ }); assert.equal(started, 0); assert.equal(once, true); callback(); assert.equal(started, 1)
})
