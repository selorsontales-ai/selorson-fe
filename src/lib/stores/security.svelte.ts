import { api } from '$lib/api';

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

export async function generateBackupCodes() {
	isLoading2FA = true;
	try {
		const res = await api<any>('/auth/2fa/backup-codes', { method: 'POST' });
		if (res.success) backupCodes = res.data.backup_codes;
		return res;
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
