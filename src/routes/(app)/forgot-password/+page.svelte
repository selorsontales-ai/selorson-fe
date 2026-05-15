<script lang="ts">
	import { api } from '$lib/api';
	import { goto } from '$app/navigation';

	let step = $state<'email' | 'code' | 'reset'>('email');
	let email = $state('');
	let code = $state('');
	let password = $state('');
	let confirmPw = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	async function sendCode() {
		error = '';
		if (!email) { error = 'Vui lòng nhập email'; return; }
		loading = true;
		try {
			await api('/auth/forgot-password', { method: 'POST', body: { email } });
			step = 'code';
			success = 'Mã xác nhận đã được gửi đến email của bạn.';
		} catch (e: any) { error = e.message || 'Có lỗi xảy ra'; }
		loading = false;
	}

	async function verifyCode() {
		error = '';
		if (!code || code.length !== 6) { error = 'Mã xác nhận gồm 6 chữ số'; return; }
		loading = true;
		try {
			const res = await api<any>('/auth/verify-reset-code', { method: 'POST', body: { email, code } });
			if (res.data?.verified) {
				step = 'reset';
				success = 'Mã xác nhận hợp lệ. Nhập mật khẩu mới.';
			}
		} catch (e: any) { error = e.message || 'Mã không đúng'; }
		loading = false;
	}

	async function resetPassword() {
		error = '';
		if (password.length < 8) { error = 'Mật khẩu ít nhất 8 ký tự'; return; }
		if (password !== confirmPw) { error = 'Mật khẩu không khớp'; return; }
		loading = true;
		try {
			await api('/auth/reset-password', { method: 'POST', body: { email, code, password } });
			success = 'Đổi mật khẩu thành công! Đang chuyển hướng...';
			setTimeout(() => goto('/'), 2000);
		} catch (e: any) { error = e.message || 'Có lỗi xảy ra'; }
		loading = false;
	}
</script>

<svelte:head><title>Quên mật khẩu — Selorson</title></svelte:head>

<div class="forgot-page">
	<div class="forgot-card glass-card">
		<h1>🔑 Quên mật khẩu</h1>

		<!-- Step Indicator -->
		<div class="steps">
			<span class="step" class:active={step === 'email'} class:done={step !== 'email'}>1. Email</span>
			<span class="step-line"></span>
			<span class="step" class:active={step === 'code'} class:done={step === 'reset'}>2. Xác nhận</span>
			<span class="step-line"></span>
			<span class="step" class:active={step === 'reset'}>3. Mật khẩu mới</span>
		</div>

		{#if error}<div class="msg error">{error}</div>{/if}
		{#if success}<div class="msg success">{success}</div>{/if}

		{#if step === 'email'}
			<label>Email đã đăng ký
				<input type="email" bind:value={email} placeholder="email@example.com" />
			</label>
			<button class="btn-brand full" onclick={sendCode} disabled={loading}>
				{loading ? 'Đang gửi...' : 'Gửi mã xác nhận'}
			</button>

		{:else if step === 'code'}
			<label>Mã xác nhận (6 chữ số)
				<input type="text" bind:value={code} placeholder="123456" maxlength="6" />
			</label>
			<button class="btn-brand full" onclick={verifyCode} disabled={loading}>
				{loading ? 'Đang kiểm tra...' : 'Xác nhận mã'}
			</button>
			<button class="link-btn" onclick={() => { step = 'email'; error = ''; success = ''; }}>← Gửi lại mã</button>

		{:else}
			<label>Mật khẩu mới
				<input type="password" bind:value={password} placeholder="Ít nhất 8 ký tự" />
			</label>
			<label>Xác nhận mật khẩu
				<input type="password" bind:value={confirmPw} placeholder="Nhập lại mật khẩu" />
			</label>
			<button class="btn-brand full" onclick={resetPassword} disabled={loading}>
				{loading ? 'Đang đổi...' : 'Đổi mật khẩu'}
			</button>
		{/if}

		<a href="/" class="back-link">← Về trang chủ</a>
	</div>
</div>

<style>
	.forgot-page{min-height:70vh;display:flex;align-items:center;justify-content:center;padding:2rem}
	.forgot-card{width:420px;max-width:90vw;padding:2rem}
	h1{font-size:1.4rem;font-weight:700;text-align:center;margin-bottom:1.5rem}
	.steps{display:flex;align-items:center;justify-content:center;gap:.5rem;margin-bottom:1.5rem}
	.step{font-size:.72rem;font-weight:600;color:var(--color-text-muted);padding:.2rem .5rem;border-radius:4px;transition:all .2s}
	.step.active{color:var(--color-brand-400);background:rgba(12,113,61,.1)}
	.step.done{color:var(--color-text-secondary)}
	.step-line{width:24px;height:1px;background:var(--color-surface-400)}
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
