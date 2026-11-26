<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { handleOAuthCallback, login2FA } from '$lib/stores/security.svelte';
	import { setAuth } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';

	let error = $state<string | null>(null);
	let requires2FA = $state(false);
	let tempToken = $state('');
	let totpCode = $state('');
	let submitting2FA = $state(false);
	let totpError = $state<string | null>(null);

	onMount(async () => {
		const provider = $page.params.provider as string;
		const code = $page.url.searchParams.get('code');
		const state = $page.url.searchParams.get('state');

		if (!code) {
			error = m.oauth_err_missing_code();
			setTimeout(() => goto('/'), 3000);
			return;
		}

		try {
			const res: any = await handleOAuthCallback(provider, code, state);
			const issuedTempToken = res?.data?.temp_token ?? res?.temp_token;
			if (res?.requires_2fa && issuedTempToken) {
				requires2FA = true;
				tempToken = issuedTempToken;
				return;
			}
			if (res.success && res.data?.token) {
				setAuth(res.data.token, res.data.user);
				error = m.oauth_success_redirect();
				setTimeout(() => goto('/'), 1000);
			} else {
				error = res.message || m.oauth_err_failed();
				setTimeout(() => goto('/'), 3000);
			}
		} catch (err: any) {
			error = err.message || m.oauth_err_system();
			setTimeout(() => goto('/'), 3000);
		}
	});

	async function submitOAuth2FA(e: Event) {
		e.preventDefault();
		if (!totpCode.trim() || submitting2FA) return;
		submitting2FA = true;
		totpError = null;
		try {
			const res = await login2FA(tempToken, totpCode.trim());
			if (res?.success && res.data?.token) {
				setAuth(res.data.token, res.data.user);
				goto('/');
			} else {
				totpError = res?.message || 'Mã xác thực 2FA không hợp lệ.';
			}
		} catch (err: any) {
			totpError = err?.message || m.oauth_err_system();
		} finally {
			submitting2FA = false;
		}
	}
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh] px-4">
	{#if requires2FA}
		<form
			onsubmit={submitOAuth2FA}
			class="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/90 p-6 shadow-xl"
		>
			<h2 class="text-lg font-bold text-white mb-2">🔐 Xác thực 2 lớp (2FA)</h2>
			<p class="text-sm text-zinc-400 mb-4">
				Nhập mã 6 chữ số từ ứng dụng Authenticator (hoặc mã dự phòng) để hoàn tất đăng nhập.
			</p>
			{#if totpError}
				<p class="text-sm text-red-400 mb-3">{totpError}</p>
			{/if}
			<input
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				bind:value={totpCode}
				placeholder="000000"
				class="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2.5 text-center text-lg tracking-widest text-white mb-4"
			/>
			<button
				type="submit"
				disabled={submitting2FA || !totpCode.trim()}
				class="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 font-semibold text-white transition"
			>
				{submitting2FA ? 'Đang xác minh…' : 'Xác nhận đăng nhập'}
			</button>
		</form>
	{:else if error}
		<div class="text-red-500 font-semibold mb-4 text-center">
			<p>{error}</p>
			<p class="text-sm mt-2 font-normal">{m.oauth_redirecting_home()}</p>
		</div>
	{:else}
		<div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
		<span class="mt-4 text-muted-foreground font-medium animate-pulse">{m.oauth_processing()}</span>
	{/if}
</div>
