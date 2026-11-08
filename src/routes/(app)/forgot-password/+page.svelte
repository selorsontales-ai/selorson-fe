<script lang="ts">
	import { api } from '$lib/api';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';

	let step = $state<'email' | 'code' | 'reset'>('email');
	let email = $state('');
	let code = $state('');
	let password = $state('');
	let confirmPw = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let showPassword = $state(false);

	async function sendCode() {
		error = '';
		if (!email) { error = m.forgot_err_enter_email(); return; }
		loading = true;
		try {
			await api('/auth/forgot-password', { method: 'POST', body: { email } });
			step = 'code';
			success = m.forgot_msg_code_sent();
		} catch (e: any) { error = e.message || m.forgot_err_generic(); }
		loading = false;
	}

	async function verifyCode() {
		error = '';
		if (!code || code.length !== 6) { error = m.forgot_err_code_6(); return; }
		loading = true;
		try {
			const res = await api<any>('/auth/verify-reset-code', { method: 'POST', body: { email, code } });
			if (res.data?.verified) {
				step = 'reset';
				success = m.forgot_msg_code_valid();
			}
		} catch (e: any) { error = e.message || m.forgot_err_code_invalid(); }
		loading = false;
	}

	async function resetPassword() {
		error = '';
		if (password.length < 8) { error = m.forgot_err_min_pass(); return; }
		if (password !== confirmPw) { error = m.forgot_err_pass_mismatch(); return; }
		loading = true;
		try {
			await api('/auth/reset-password', { method: 'POST', body: { email, code, password } });
			success = m.forgot_msg_reset_ok();
			setTimeout(() => goto('/'), 2000);
		} catch (e: any) { error = e.message || m.forgot_err_generic(); }
		loading = false;
	}
</script>

<svelte:head><title>{m.forgot_title()} — Selorson</title></svelte:head>

<div class="forgot-page">
	<div class="forgot-card glass-card">
		<h1>🔑 {m.forgot_title()}</h1>

		<!-- Step Indicator -->
		<div class="steps">
			<span class="step" class:active={step === 'email'} class:done={step !== 'email'}>{m.forgot_step_email()}</span>
			<span class="step-line"></span>
			<span class="step" class:active={step === 'code'} class:done={step === 'reset'}>{m.forgot_step_verify()}</span>
			<span class="step-line"></span>
			<span class="step" class:active={step === 'reset'}>{m.forgot_step_new_pass()}</span>
		</div>

		{#if error}<div class="msg error">{error}</div>{/if}
		{#if success}<div class="msg success">{success}</div>{/if}

		{#if step === 'email'}
			<label>{m.forgot_registered_email()}
				<input type="email" bind:value={email} placeholder="email@example.com" />
			</label>
			<button class="btn-brand full" onclick={sendCode} disabled={loading}>
				{loading ? m.forgot_sending() : m.forgot_send_code()}
			</button>

		{:else if step === 'code'}
			<label>{m.forgot_code_6_label()}
				<input type="text" bind:value={code} placeholder="123456" maxlength="6" />
			</label>
			<button class="btn-brand full" onclick={verifyCode} disabled={loading}>
				{loading ? m.forgot_verifying() : m.forgot_verify_btn()}
			</button>
			<button class="link-btn" onclick={() => { step = 'email'; error = ''; success = ''; }}>{m.forgot_resend()}</button>

		{:else}
			<label>{m.forgot_new_pass_label()}
				<div class="pwd-wrap">
					<input type={showPassword ? 'text' : 'password'} bind:value={password} placeholder={m.forgot_ph_password()} />
					<button type="button" class="pwd-toggle" onclick={() => showPassword = !showPassword}>{showPassword ? '🙈' : '👁️'}</button>
				</div>
			</label>
			<label>{m.auth_label_confirm_password()}
				<div class="pwd-wrap">
					<input type={showPassword ? 'text' : 'password'} bind:value={confirmPw} placeholder={m.forgot_ph_confirm()} />
					<button type="button" class="pwd-toggle" onclick={() => showPassword = !showPassword}>{showPassword ? '🙈' : '👁️'}</button>
				</div>
			</label>
			<button class="btn-brand full" onclick={resetPassword} disabled={loading}>
				{loading ? m.forgot_changing() : m.forgot_change_btn()}
			</button>
		{/if}

		<a href="/" class="back-link">{m.err404_home()}</a>
	</div>
</div>

<style>
	.forgot-page{min-height:70vh;display:flex;align-items:center;justify-content:center;padding:clamp(1rem,4vw,2rem)}
	.forgot-card{width:420px;max-width:100%;padding:clamp(1.25rem,4vw,2rem)}
	h1{font-size:1.4rem;font-weight:700;text-align:center;margin-bottom:1.5rem}
	.steps{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.35rem;margin-bottom:1.5rem}
	.step{font-size:.72rem;font-weight:600;color:var(--color-text-muted);padding:.2rem .5rem;border-radius:4px;transition:all .2s}
	.step.active{color:var(--color-brand-400);background:rgba(12,113,61,.1)}
	.step.done{color:var(--color-text-secondary)}
	.step-line{width:clamp(12px,4vw,24px);height:1px;background:var(--color-surface-400)}
	label{display:block;font-size:.82rem;color:var(--color-text-muted);margin-bottom:.75rem}
	input{display:block;width:100%;padding:.6rem;margin-top:.25rem;background:var(--color-surface-200);border:1px solid rgba(255,255,255,.08);border-radius:var(--radius-sm);color:var(--color-text-primary);font-family:inherit;font-size:.9rem}
	input:focus{outline:none;border-color:var(--color-brand-500)}
	.full{width:100%;margin-top:.25rem}
	.msg{font-size:.82rem;padding:.5rem .75rem;border-radius:var(--radius-sm);margin-bottom:.75rem}
	.msg.error{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2)}
	.msg.success{background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2)}
	.link-btn{background:none;border:none;color:var(--color-text-muted);font-size:.8rem;cursor:pointer;margin-top:.5rem;padding:0}
	.link-btn:hover{color:var(--color-brand-400)}
	.back-link{display:block;text-align:center;margin-top:1.25rem;font-size:.82rem;color:var(--color-text-muted);text-decoration:none}
	.back-link:hover{color:var(--color-brand-400)}
</style>
