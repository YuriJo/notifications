/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

'use strict'

/**
 * @param {string} content received by Nextcloud, splitted to be shown in UI notification
 */
function showBgNotification(content) {
	const [title, ...msg] = content.subject.split('\n')
	const roomToken = content.app === 'spreed' && /^[a-z0-9]{4,30}$/.test(content.id || '') ? content.id : ''
	const options = {
		body: msg.join('\n'),
		tag: 'nid' + content.nid,
		data: { roomToken },
	}
	return self.registration.showNotification(title, options)
}

function closeBgNotifications(content) {
	const tags = content['delete-all'] ? [undefined]
		: content['delete-multiple'] ? content.nids.map((nid) => 'nid' + nid)
			: ['nid' + content.nid]
	return Promise.all(tags.map((tag) => self.registration.getNotifications({ tag })
		.then((notifications) => notifications.forEach((notification) => notification.close()))))
}

self.addEventListener('notificationclick', function(event) {
	event.notification.close()
	const token = event.notification.data?.roomToken || ''
	const path = /^[a-z0-9]{4,30}$/.test(token) ? '/index.php/call/' + token : '/index.php/apps/spreed/'
	const url = new URL(path, self.location.origin).href
	event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
		.then(async (clients) => {
			const client = clients.find((candidate) => new URL(candidate.url).origin === self.location.origin)
			if (client) {
				await client.navigate(url)
				return client.focus()
			}
			return self.clients.openWindow(url)
		}))
})

/**
 * For Chrom* and Apple (who followed Chrome) users:
 * We need to show a silent notification that we remove to avoid being unregistered,
 * because they require userVisibleOnly=true registrations, and so forbid silent notifs.
 */
function silentNotification() {
	const tag = 'silent'
	const options = {
		silent: true,
		tag,
		body: 'This site has been updated from the background',
	}
	return self.registration.pushManager.getSubscription().then((sub) => {
		if (sub?.options.userVisibleOnly) {
			return self.registration.showNotification(location.host, options)
		}
	})
}

self.addEventListener('push', function(event) {
	console.info('Received push message')

	if (event.data) {
		const content = event.data.json()
		// Send the event to the last focused page only,
		// show a notification with the subject if we don't have any
		// active tab
		event.waitUntil(self.clients.matchAll()
			.then((clientList) => {
				const client = clientList[0]
				if (client !== undefined) {
					console.debug('Sending to client ', client)
					client.postMessage({ type: 'push', content })
					// Here, the user has an active tab, we don't need to show a notification from the sw
				} else if (content.subject) {
					console.debug('No valid client to send notif - showing bg notif')
					return showBgNotification(content)
				} else if (content.delete || content['delete-multiple'] || content['delete-all']) {
					return closeBgNotifications(content).then(silentNotification)
				} else {
					console.warn('No valid client to send notif')
					return silentNotification()
				}
			})
			.catch((err) => {
				console.error("Couldn't send message: ", err)
				return silentNotification()
			}))
	} else {
		event.waitUntil(silentNotification())
	}
})

self.addEventListener('pushsubscriptionchange', function(event) {
	console.log('Push Subscription Change', event)
	event.waitUntil(self.clients.matchAll()
		.then((clientList) => {
			const client = clientList[0]
			if (client !== undefined) {
				console.debug('Sending to client ', client)
				client.postMessage({ type: 'pushEndpoint' })
			} else {
				console.warn('No valid client to send notif')
			}
		})
		.catch((err) => {
			console.error("Couldn't send message: ", err)
		}))
})

self.addEventListener('registration', function() {
	console.log('Registered')
})

self.addEventListener('install', function(event) {
	console.log('Installed')
	// Replace currenctly active serviceWorkers with this one
	event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', function(event) {
	console.log('Activated')
	// Ensure we control the clients
	event.waitUntil(self.clients.claim())
})
