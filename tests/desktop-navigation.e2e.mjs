import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Builder, By } from 'selenium-webdriver';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(
	process.env.TAURI_APP_PATH || path.join(HERE, '..', 'src-tauri', 'target', 'release', 'app.exe')
);
const DRIVER_BIN = process.env.TAURI_DRIVER_BIN || 'tauri-driver';
const API_PORT = 8001;
const DRIVER_PORT = 4444;
const NOW = '2026-01-01T00:00:00.000Z';

const adminUser = {
	id: 1,
	username: 'admin',
	name: 'E2E Admin',
	nickname: null,
	email: 'admin@example.test',
	role: 'admin',
	status: 'active',
	avatar: null,
	cover_image: null,
	cover_position: 50,
	phone_number: null,
	biography: 'Packaged desktop navigation smoke test',
	hobbies: null,
	occupation: null,
	birthday: null,
	gender: null,
	address: null,
	privacy_settings: {},
	is_online: true,
	has_password: true,
	email_verified_at: NOW,
	two_factor_enabled: false,
	created_at: NOW,
	followers_count: 0,
	following_count: 0
};

const conversation = {
	id: 7,
	other_user: {
		id: 2,
		name: 'Test User',
		username: 'test-user',
		avatar: null,
		is_online: true
	},
	last_message: 'Hello',
	last_message_at: NOW,
	unread: 1
};

const message = {
	id: 70,
	sender_id: 2,
	message: 'Hello',
	created_at: NOW
};

function sendJson(request, response, data) {
	const origin = request.headers.origin;
	response.writeHead(200, {
		'Access-Control-Allow-Origin': origin || '*',
		'Access-Control-Allow-Credentials': 'true',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
		'Content-Type': 'application/json; charset=utf-8'
	});
	response.end(JSON.stringify({ success: true, data }));
}

async function startMockApi() {
	const sockets = new Set();
	const server = http.createServer((request, response) => {
		if (request.method === 'OPTIONS') {
			sendJson(request, response, null);
			return;
		}

		const pathname = new URL(request.url || '/', `http://127.0.0.1:${API_PORT}`).pathname;
		if (pathname === '/api/v1/chat/stream') {
			const origin = request.headers.origin;
			response.writeHead(200, {
				'Access-Control-Allow-Origin': origin || '*',
				'Access-Control-Allow-Credentials': 'true',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'Content-Type': 'text/event-stream'
			});
			response.write(': ready\n\n');
			return;
		}

		if (pathname === '/api/v1/auth/me') {
			sendJson(request, response, adminUser);
		} else if (pathname === '/api/v1/runtime/capabilities') {
			sendJson(request, response, {
				target: 'desktop',
				runner_mode: 'desktop',
				co_writer_read: true,
				co_writer_write: true,
				local_source_scan: true,
				runner_jobs: true,
				embedding_rebuild: true,
				snapshot_create: true,
				cms_draft_push: true,
				cms_publish: false
			});
		} else if (pathname === '/api/v1/profile/1') {
			sendJson(request, response, adminUser);
		} else if (pathname === '/api/v1/auth/devices' || pathname === '/api/v1/social/blocked') {
			sendJson(request, response, []);
		} else if (pathname === '/api/v1/chat/conversations') {
			sendJson(request, response, [conversation]);
		} else if (pathname === '/api/v1/chat/conversations/7/messages') {
			sendJson(request, response, [message]);
		} else if (pathname === '/api/v1/admin/dashboard') {
			sendJson(request, response, {
				users: { total: 1, online: 1, new_today: 0 },
				content: { chapters: 0, videos: 0, albums: 0 },
				cms: { hero_slides: 0, future_projects: 0 },
				support: { contacts_pending: 0, contacts_total: 0, messages_today: 0 },
				newsletter: { active: 0, total: 0 }
			});
		} else {
			sendJson(request, response, []);
		}
	});

	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});
	server.on('upgrade', (_request, socket) => socket.destroy());

	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(API_PORT, '127.0.0.1', resolve);
	});

	return async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => server.close(resolve));
	};
}

async function waitForPort(port, attempts = 80) {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const open = await new Promise((resolve) => {
			const socket = net.createConnection({ host: '127.0.0.1', port });
			socket.once('connect', () => {
				socket.destroy();
				resolve(true);
			});
			socket.once('error', () => resolve(false));
		});
		if (open) return;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`tauri-driver did not listen on port ${port}`);
}

async function visibleElement(driver, selector, timeout = 15_000) {
	return driver.wait(async () => {
		const elements = await driver.findElements(By.css(selector));
		for (const element of elements) {
			if (await element.isDisplayed()) return element;
		}
		return false;
	}, timeout, `No visible element matched ${selector}`);
}

async function waitForPath(driver, expected, timeout = 15_000) {
	await driver.wait(
		async () => (await driver.executeScript('return window.location.pathname')) === expected,
		timeout,
		`Desktop route did not reach ${expected}`
	);
}

async function bodyText(driver) {
	return driver.findElement(By.css('body')).getText();
}

async function openUserRoute(driver, href, expectedPath) {
	(await visibleElement(driver, '#user-menu-btn')).click();
	(await visibleElement(driver, `a[href="${href}"]`)).click();
	await waitForPath(driver, expectedPath);
}

test('packaged desktop navigates profile, settings, messages and admin', { timeout: 120_000 }, async () => {
	assert.ok(fs.existsSync(APP_PATH), `Packaged Tauri executable was not found: ${APP_PATH}`);

	const stopMockApi = await startMockApi();
	const driverProcess = spawn(DRIVER_BIN, ['--port', String(DRIVER_PORT)], {
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});
	let driverLog = '';
	driverProcess.stdout.on('data', (chunk) => { driverLog += chunk.toString(); });
	driverProcess.stderr.on('data', (chunk) => { driverLog += chunk.toString(); });

	let driver;
	try {
		await waitForPort(DRIVER_PORT);
		driver = await new Builder()
			.usingServer(`http://127.0.0.1:${DRIVER_PORT}/`)
			.withCapabilities({
				browserName: 'wry',
				'tauri:options': { application: APP_PATH }
			})
			.build();

		await driver.wait(
			async () => (await driver.executeScript('return document.readyState')) === 'complete',
			20_000
		);
		await driver.executeScript(
			"window.localStorage.setItem('selorson_token', 'desktop-e2e-token')"
		);
		await driver.navigate().refresh();
		await visibleElement(driver, '#user-menu-btn', 20_000);

		await openUserRoute(driver, '/profile/1', '/profile/1');
		await driver.wait(async () => (await bodyText(driver)).includes('E2E Admin'), 15_000);

		await openUserRoute(driver, '/settings', '/settings');
		assert.doesNotMatch(await bodyText(driver), /Application error|404|Không tìm thấy trang/i);

		await openUserRoute(driver, '/admin', '/admin');
		await driver.wait(async () => (await bodyText(driver)).includes('Admin Dashboard'), 15_000);

		(await visibleElement(driver, '.pchat-tab-wrap')).click();
		(await visibleElement(driver, '.pchat-conv')).click();
		const chatWindow = await visibleElement(driver, '.pchat-win');
		await driver.wait(async () => (await chatWindow.getText()).includes('Hello'), 15_000);
		(await visibleElement(driver, 'a[href^="/messages?conv="]')).click();
		await waitForPath(driver, '/messages');
		await driver.wait(async () => (await bodyText(driver)).includes('Hello'), 15_000);

		const currentUrl = new URL(await driver.getCurrentUrl());
		const appBase = `${currentUrl.protocol}//${currentUrl.host}`;
		for (const route of ['/profile/1', '/settings', '/messages?conv=7', '/admin']) {
			await driver.get(appBase + route);
			await waitForPath(driver, route.split('?')[0]);
			const text = await bodyText(driver);
			assert.ok(text.trim().length > 0, `Route ${route} rendered an empty page`);
			assert.doesNotMatch(text, /Application error|404|Không tìm thấy trang/i);
		}
	} catch (error) {
		throw new Error(`${error.message}\n--- tauri-driver ---\n${driverLog}`, { cause: error });
	} finally {
		if (driver) await driver.quit().catch(() => {});
		driverProcess.kill();
		await stopMockApi();
	}
});
