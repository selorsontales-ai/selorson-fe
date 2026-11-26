import { api } from '$lib/api';
import { PUBLIC_API_BASE } from '$env/static/public';

// ─── 2FA Store ───

let twoFactorEnabled = $state(false);
let twoFactorSecret = $state('');
let twoFactorQr = $state('');
let backupCodes = $state<string[]>([]);
let isLoading2FA = $state(false);

export function is2FAEnabled() { return twoFactorEnabled; }
export function get2FASecret() { return twoFactorSecret; }
export function get2FAQr() { return twoFactorQr; }
export function getBackupCodes() { return backupCodes; }
export function is2FALoading() { return isLoading2FA; }

/** Sync 2FA state from user object (called after fetchMe). */
export function sync2FAState(user: { two_factor_enabled?: boolean } | null) {
	if (user && typeof user.two_factor_enabled === 'boolean') {
		twoFactorEnabled = user.two_factor_enabled;
	}
}

export async function setup2FA() {
	isLoading2FA = true;
	try {
		const res = await api<any>('/auth/2fa/setup', { method: 'POST' });
		twoFactorSecret = res.data.secret;
		twoFactorQr = res.data.otpauth_uri;
		return res;
	} finally { isLoading2FA = false; }
}

export async function verify2FA(code: string) {
	isLoading2FA = true;
	try {
		const res = await api<any>('/auth/2fa/verify', { method: 'POST', body: { code } });
		if (res.success) twoFactorEnabled = true;
		return res;
	} finally { isLoading2FA = false; }
}

export async function disable2FA(code: string) {
	isLoading2FA = true;
	try {
		const res = await api<any>('/auth/2fa/disable', { method: 'POST', body: { code } });
		if (res.success) {
			twoFactorEnabled = false;
			twoFactorSecret = '';
			twoFactorQr = '';
		}
		return res;
	} finally { isLoading2FA = false; }
}

export async function generateBackupCodes(code: string) {
	isLoading2FA = true;
	try {
		const res = await api<any>('/auth/2fa/backup-codes', {
			method: 'POST',
			body: { code }
		});
		if (res.success) backupCodes = res.data.backup_codes;
		return res;
	} finally { isLoading2FA = false; }
}

/**
 * Complete 2FA login: POST /auth/2fa/login with temp_token + TOTP code.
 * Returns { success, data: { token, user } } on success.
 */
export async function login2FA(tempToken: string, code: string): Promise<any> {
	isLoading2FA = true;
	try {
		const res = await fetch(`${PUBLIC_API_BASE}/auth/2fa/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ temp_token: tempToken, code }),
			credentials: 'include',
		});
		const rawText = await res.text();
		try {
			return rawText ? JSON.parse(rawText) : { success: false, message: `HTTP ${res.status}` };
		} catch {
			return {
				success: false,
				message: rawText
					? `Máy chủ từ chối yêu cầu (HTTP ${res.status}): ${rawText.slice(0, 180)}`
					: `Lỗi máy chủ (HTTP ${res.status})`
			};
		}
	} finally { isLoading2FA = false; }
}

// ─── OAuth Store ───

let oauthLoading = $state(false);
export function isOAuthLoading() { return oauthLoading; }

export async function loginWithGoogle() {
	oauthLoading = true;
	try {
		const res = await api<any>('/auth/oauth/google');
		if (res.success && res.data.redirect_url) {
			window.location.href = res.data.redirect_url;
		}
	} finally { oauthLoading = false; }
}

export async function loginWithFacebook() {
	oauthLoading = true;
	try {
		const res = await api<any>('/auth/oauth/facebook');
		if (res.success && res.data.redirect_url) {
			window.location.href = res.data.redirect_url;
		}
	} finally { oauthLoading = false; }
}

export async function handleOAuthCallback(provider: string, code: string, state: string | null) {
	oauthLoading = true;
	try {
		const res = await api<any>(`/auth/oauth/${provider}/callback`, {
			method: 'POST',
			body: { code, state },
		});
		return res;
	} finally { oauthLoading = false; }
}
