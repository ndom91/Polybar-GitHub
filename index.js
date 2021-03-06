#!/usr/bin/env node

const polybarHelpers = require('polybar-helpers')
const notifier = require('node-notifier')
const { Octokit } = require('@octokit/rest')
const path = require('path')
const fs = require('fs')
const homedir = require('os').homedir();
const url = require('url');

const falidArgv = () => {
	console.log('Usage: polybar-github .env/github GH_TOKEN TIME/s MODE NOTIFICATION')
	return ''
}

const allMode = {
	'all': {
		id: 'all',
		showParticipating: false,
		print: (notification) => `${notification.all}`
	},
	'all+participating': {
		id: 'all+participating',
		showParticipating: false,
		print: (notification) => `${notification.all} (${notification.participating})`
	},
	'participating': {
		id: 'participating',
		showParticipating: true,
		print: (notification) => `${notification.participating}`
	}
}
const selectMode = (mode) => {
	return allMode[mode]
}

var config = {}
config.file = process.argv[2] || falidArgv()
config.token = process.argv[3] || falidArgv()
config.time = process.argv[4] || falidArgv()
config.mode = selectMode(process.argv[5] || 'all+participating')
config.notification = process.argv[6] || 'true'
config.notification = config.notification == 'true' ? true : false
config.eventsFile = path.join(homedir, ".config/polybar/.env/github")

const github = new Octokit({
	debug: false,
	auth: config.token
})

const sendNotification = (id, title, type, url) => {
	if (!config.notification) {
		return false
	}
	// console.log(id);
	return notifier.notify({
		title: `GH#${id} - ${type}`,
		category: 'polybar-github',
		icon: path.join(__dirname, 'github.png'),
		open: url,
		message: title,
		time: 4
	});
}

const buildUrl = (notification) => {
	const notificationApiUrl = url.parse(notification.url);
	const pathSegments = notificationApiUrl.pathname
		.split('/')
		.filter((seg) => { return !['', 'repos'].includes(seg); })
		.map((seg) => { return seg === 'pulls' ? 'pull' : seg; })
		.join('/');
	return `https://github.com/${pathSegments}`;
}

var notifications = 'Offline'
var processIds = []
const main = async () => {
	while (true) {
		var showParticipating = config.mode.showParticipating
		if (showParticipating == 'true') {
			showParticipating = true
		} else {
			showParticipating = false
		}

		var result = await github.activity.listNotificationsForAuthenticatedUser({
			per_page: 50,
			participating: showParticipating
		}).catch((e) => {
			return false
		})
		if (result) {
			notifications = result.data.reduce((_, notification) => {
				if (!processIds.includes(notification.id)) {
					processIds.push(notification.id)
					if (config.mode.id == 'all') {
						sendNotification(
							notification.id,
							notification.subject.title,
							notification.subject.type,
							buildUrl(notification)
						)
					} else {
						if (notification.reason != 'subscribed') {
							sendNotification(
								notification.id,
								notification.subject.title,
								notification.subject.type,
								buildUrl(notification)
							)
						}
					}
				}
				_.all.push(notification)
				if (notification.reason != 'subscribed') {
					_.participating.push(notification)
				}
				return _
			}, {
				all: [],
				participating: []
			})

			if (notifications.all.length >= 50) {
				notifications.all = `+${notifications.all.length}`
			} else {
				notifications.all = `${notifications.all.length}`
			}
			if (notifications.participating.length >= 50) {
				notifications.participating = `+${notifications.participating.length}`
			} else {
				notifications.participating = `${notifications.participating.length}`
			}
			notifications = config.mode.print(notifications)
		}
		// console.log(notifications)
		await new Promise((resolve) => setTimeout(
			resolve,
			(Number(config.time) * 1000)
		))
	}
}

// Check for existence of given eventsFile
function checkEventsFile(name) {
  try {
    fs.readFile(name)
  } catch (error) {
    fs.writeFileSync(name, '')
  }
}

main()
polybarHelpers(
	(app) => {
		checkEventsFile(config.eventsFile)
		app.file(config.eventsFile)
		app.on(['right', 'middle', 'left'], (ctx) => {
			// console.log(ctx.event)
			if (ctx.event == 'right') {
				config.mode = selectMode('all')
			} else if (ctx.event == 'middle') {
				config.mode = selectMode('all+participating')
			} else if (ctx.event == 'left') {
				config.mode = selectMode('participating')
			}
		})
		app.error((msg, ctx) => {
			console.error(msg, ctx)
		})
	}
)
