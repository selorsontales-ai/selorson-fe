import { PUBLIC_API_BASE } from '$env/static/public';
import { tokenRefreshChannel, tokenStorageKey } from '$lib/session-storage';
import { sync2FAState } from './security.svelte';

// ---- Types ----

export interface User {
	id: number;
	username: string;
	name: string;
	nickname: string | null;
	email: string;
	role: 'user' | 'manager' | 'admin';
	status: string;
	avatar: string | null;
	cover_image: string | null;
	cover_position?: number;
	phone_number?: string | null;
	biography?: string | null;
	hobbies?: string | null;
	occupation?: string | null;
	birthday?: string | null;
	gender?: string | null;
	address?: string | null;
	privacy_settings?: Record<string, boolean> | null;
	is_online: boolean;
	has_password: boolean;
	email_verified_at: string | null;
	two_factor_enabled: boolean;
	created_at: string;
}

interface AuthState {
	user: User | null;
	token: string | null;
	loading: boolean;
}

// ---- Reactive State ----

let state = $state<AuthState>({
	user: null,
	token: null,
	loading: true,
});

// ---- Helpers ----

function saveToken(token: string) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(tokenStorageKey(), token);
	}
}

function clearToken() {
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(tokenStorageKey());
	}
}

function loadToken(): string | null {
	if (typeof localStorage !== 'undefined') {
		return localStorage.getItem(tokenStorageKey());
	}
	return null;
}

async function authFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...(options.headers as Record<string, string> || {}),
	};

	if (state.token) {
		headers['Authorization'] = `Bearer ${state.token}`;
	}

	const res = await fetch(`${PUBLIC_API_BASE}${endpoint}`, {
		...options,
		headers,
		credentials: 'include',
	});

	const json = await res.json();
	if (!res.ok || !json.success) {
		throw { status: res.status, ...json };
	}
	return json;
}

// ---- Actions ----

export async function register(data: {
	name: string;
	username: string;
	email: string;
	password: string;
	password_confirmation: string;
}) {
	const res: any = await authFetch('/auth/register', {
		method: 'POST',
		body: JSON.stringify(data),
	});

	// No JWT returned — user must verify email first
	return res;
}

export async function login(email: string, password: string, rememberMe: boolean = false) {
	const res: any = await authFetch('/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password, remember_me: rememberMe }),
	});

	// Check if 2FA is required
	if (res.requires_2fa) {
		return res; // Frontend will handle showing 2FA form
	}

	state.token = res.data.token;
	state.user = res.data.user;
	saveToken(res.data.token);
	return res;
}

// ---- Forgot Password Flow ----

export async function forgotPassword(email: string) {
	const res: any = await authFetch('/auth/forgot-password', {
		method: 'POST',
		body: JSON.stringify({ email }),
	});
	return res;
}

export async function verifyResetCode(email: string, code: string) {
	const res: any = await authFetch('/auth/verify-reset-code', {
		method: 'POST',
		body: JSON.stringify({ email, code }),
	});
	return res;
}

export async function resetPassword(email: string, code: string, password: string) {
	const res: any = await authFetch('/auth/reset-password', {
		method: 'POST',
		body: JSON.stringify({ email, code, password }),
	});
	return res;
}

// ---- Email Verification Flow ----

export async function verifyEmail(email: string, code: string) {
	const res: any = await authFetch('/auth/verify-email', {
		method: 'POST',
		body: JSON.stringify({ email, code }),
	});
	// Update local user state to reflect verified email
	if (res.success && state.user) {
		state.user = { ...state.user, email_verified_at: new Date().toISOString() };
	}
	return res;
}

export async function resendVerification(email: string) {
	const res: any = await authFetch('/auth/resend-verification', {
		method: 'POST',
		body: JSON.stringify({ email }),
	});
	return res;
}

export async function logout() {
	try {
		await authFetch('/auth/logout', { method: 'POST' });
	} catch {
		// ignore — logout even if API fails
	}
	state.user = null;
	state.token = null;
	clearToken();
}

export async function fetchMe() {
	state.loading = true;
	try {
		const res: any = await authFetch('/auth/me');
		state.user = res.data;
		sync2FAState(res.data);
	} catch {
		// Token invalid — clear
		state.user = null;
		state.token = null;
		clearToken();
	} finally {
		state.loading = false;
	}
}

export function initAuth() {
	const token = loadToken();
	if (token) {
		state.token = token;
		void fetchMe();
	} else if (typeof window !== 'undefined') {
		state.loading = true;
		void import('../api')
			.then(async ({ restoreSession }) => {
				if (await restoreSession()) {
					await fetchMe();
				} else {
					state.loading = false;
				}
			})
			.catch(() => {
				state.loading = false;
			});
	} else {
		state.loading = false;
	}

	// Listen for token refresh from other tabs
	if (typeof BroadcastChannel !== 'undefined') {
		try {
			const bc = new BroadcastChannel(tokenRefreshChannel());
			bc.onmessage = (event) => {
				if (event.data?.token) {
					state.token = event.data.token;
					saveToken(event.data.token);
				}
			};
		} catch {
			// BroadcastChannel not supported
		}
	}
}

export function setAuth(token: string, user: User) {
	state.token = token;
	state.user = user;
	saveToken(token);
}

/** Called by api.ts interceptor after a successful token refresh. */
export function updateToken(newToken: string) {
	state.token = newToken;
	saveToken(newToken);
}

export function updateUser(user: User) {
	state.user = user;
}

// ---- Getters (exported as functions for reactivity) ----

export function getUser(): User | null {
	return state.user;
}

export function getToken(): string | null {
	return state.token;
}

export function isAuthenticated(): boolean {
	return state.user !== null;
}

export function isAdmin(): boolean {
	return state.user?.role === 'admin';
}

export function isManager(): boolean {
	return state.user?.role === 'manager' || state.user?.role === 'admin';
}

export function isLoading(): boolean {
	return state.loading;
}

export function isEmailVerified(): boolean {
	return state.user?.email_verified_at !== null && state.user?.email_verified_at !== undefined;
}
