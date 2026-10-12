// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../src/workers/service-worker.js', import.meta.url), 'utf8');
function worker() {
  const listeners = {}, shown = [], opened = [], closed = [];
  const state = {clients: [], shown, opened, closed};
  const self = {
    location: {origin: 'https://calls.reactive.team'},
    addEventListener: (name, handler) => {listeners[name] = handler;},
    clients: {
      matchAll: async () => state.clients,
      openWindow: async url => opened.push(url),
      claim: async () => {},
    },
    registration: {
      showNotification: async (title, options) => shown.push({title, options}),
      getNotifications: async ({tag}) => shown.filter(n => tag === undefined || n.options.tag === tag)
        .map(n => ({close: () => closed.push(n.options.tag)})),
      pushManager: {getSubscription: async () => ({options: {userVisibleOnly: false}})},
    },
    skipWaiting: async () => {},
  };
  runInNewContext(source, {self, URL, console: {info(){},log(){},debug(){},warn(){},error(){}}, location: {host: 'calls.reactive.team'}});
  state.send = async (name, event) => {
    let done;
    listeners[name]({...event, waitUntil: promise => {done = promise;}});
    await done;
  };
  return state;
}
test('incoming push without a tab carries a room target and stable cancellation tag', async () => {
  const w = worker();
  await w.send('push', {data: {json: () => ({app:'spreed', id:'abc12345', nid:12, subject:'Incoming call\nYuri'})}});
  assert.equal(w.shown[0].title, 'Incoming call');
  assert.equal(w.shown[0].options.data.roomToken, 'abc12345');
  assert.equal(w.shown[0].options.tag, 'nid12');
  await w.send('push', {data: {json: () => ({delete:true,nid:12})}});
  assert.deepEqual(w.closed, ['nid12']);
});
test('notification click opens the Talk room when no tab exists', async () => {
  const w = worker();
  await w.send('notificationclick', {notification: {data:{roomToken:'abc12345'}, close(){}}});
  assert.deepEqual(w.opened, ['https://calls.reactive.team/index.php/call/abc12345']);
});
test('click reuses and focuses an existing origin tab', async () => {
  const w = worker(), visits = [];
  w.clients = [{url:'https://calls.reactive.team/apps/files/', navigate:async url=>visits.push(url),focus:async()=>visits.push('focus')}];
  await w.send('notificationclick', {notification:{data:{roomToken:'abc12345'},close(){}}});
  assert.deepEqual(visits, ['https://calls.reactive.team/index.php/call/abc12345','focus']);
  assert.equal(w.opened.length, 0);
});
test('invalid room data cannot navigate away from our origin', async () => {
  const w = worker();
  await w.send('notificationclick', {notification:{data:{roomToken:'https://evil.example/'},close(){}}});
  assert.deepEqual(w.opened, ['https://calls.reactive.team/index.php/apps/spreed/']);
});
