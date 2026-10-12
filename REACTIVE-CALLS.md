# Reactive Calls Notifications overlay

Base: upstream `v35.0.1` (app version 8.0.0, Nextcloud 35).
Branch: `codex/reactive-calls-webpush`.

Changes:

- Talk background notifications carry a validated room target; click opens or
  focuses the local `/index.php/call/<token>` page.
- Cancellation uses the same `nid` tag for one, multiple and all notifications.
- Subscription activation reaches every controlled tab, including the tab that
  registered it when another tab is focused.
- Initialization also runs when the async Vue component mounts after window load.
  Service worker updates bypass the HTTP cache.
- Reload reuses a matching Chrome subscription without changing its
  `userVisibleOnly` option. A new subscription retains the upstream fallback.
- Remove logging of push subscription objects and public VAPID keys.

Build outside runtime, with Node 24 and npm 11.3:

```sh
npm ci --ignore-scripts
npm run build
node --test tests/service-worker.test.mjs tests/webpush-service.test.mjs
npx eslint src/services/webPushService.js src/workers/service-worker.js
```

The lockfile was reconciled because the upstream lock was missing picomatch.
The `js/` release assets and their license notices are included with the source.
Deployment verifies the SHA-256 of each pinned asset. No credentials are part
of this repository. Test code checks worker navigation, cancellation, activation,
key rotation, subscription reuse and Chrome's visible-push fallback; it does not
replace a real browser/phone push acceptance test.

AGPL notices are retained. Full corresponding source is in this public fork.
Other components: [server](https://github.com/YuriJo/server),
[Talk/web](https://github.com/YuriJo/spreed),
[signaling](https://github.com/YuriJo/nextcloud-spreed-signaling),
[Android](https://github.com/YuriJo/talk-android). Their original licenses apply.
