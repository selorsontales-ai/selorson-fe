<!-- Email Verification Banner — shown for logged-in users with unverified email -->
<script lang="ts">
	import { getUser, isAuthenticated, isEmailVerified, verifyEmail, resendVerification } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';

	let showVerifyForm = $state(false);
	let verifyCode = $state('');
	let loading = $state(false);
	let error = $state('');
	let successMsg = $state('');
	let resendCooldown = $state(0);
	let dismissed = $state(false);

	async function handleVerify(e: Event) {
		e.preventDefault();
		const user = getUser();
		if (!user) return;
		loading = true;
		error = '';
		try {
			await verifyEmail(user.email, verifyCode);
			successMsg = 'Email đã xác nhận thành công! 🎉';
			setTimeout(() => { dismissed = true; }, 1500);
		} catch (err: any) {
			error = err.message || 'Mã không đúng hoặc đã hết hạn';
		} finally {
			loading = false;
		}
	}

	async function handleResend() {
		const user = getUser();
		if (!user || resendCooldown > 0) return;
		loading = true;
		error = '';
		try {
			await resendVerification(user.email);
			successMsg = 'Mã mới đã được gửi!';
			resendCooldown = 60;
			const timer = setInterval(() => {
				resendCooldown--;
				if (resendCooldown <= 0) clearInterval(timer);
			}, 1000);
		} catch (err: any) {
			error = err.message || 'Không thể gửi lại mã';
		} finally {
			loading = false;
		}
	}
</script>

{#if isAuthenticated() && !isEmailVerified() && !dismissed}
	<div class="verify-banner">
		<div class="verify-banner-inner">
			{#if !showVerifyForm}
				<div class="banner-row">
					<span class="banner-icon">📧</span>
					<span class="banner-text">
						Email <strong>{getUser()?.email}</strong> chưa được xác nhận.
					</span>
					<button class="banner-btn" onclick={() => showVerifyForm = true}>
						Xác nhận ngay
					</button>
					<button class="banner-dismiss" onclick={() => dismissed = true} aria-label="Đóng">✕</button>
				</div>
			{:else}
				{#if successMsg}
					<div class="banner-success">{successMsg}</div>
				{/if}
				{#if error}
					<div class="banner-error">{error}</div>
				{/if}
				<form class="banner-form" onsubmit={handleVerify}>
					<input
						type="text"
						bind:value={verifyCode}
						placeholder={m.verify_ph_code()}
						maxlength="6"
						pattern="[0-9]{6}"
						inputmode="numeric"
						required
						class="banner-input"
					/>
					<button class="banner-btn" type="submit" disabled={loading}>
						{loading ? '...' : 'Xác nhận'}
					</button>
					<button
						type="button"
						class="banner-resend"
						onclick={handleResend}
						disabled={resendCooldown > 0 || loading}
					>
						{resendCooldown > 0 ? m.verify_resend_wait({ n: resendCooldown }) : m.verify_resend()}
					</button>
					<button class="banner-dismiss" onclick={() => showVerifyForm = false} aria-label="Thu gọn">←</button>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	.verify-banner {
		background: linear-gradient(90deg, rgba(234, 179, 8, 0.12), rgba(234, 179, 8, 0.06));
		border-bottom: 1px solid rgba(234, 179, 8, 0.2);
		padding: 0.6rem 1.5rem;
		animation: slideDown 0.3s ease;
	}
	@keyframes slideDown {
		from { opacity: 0; transform: translateY(-100%); }
		to { opacity: 1; transform: translateY(0); }
	}
	.verify-banner-inner {
		max-width: 1280px;
		margin: 0 auto;
	}
	.banner-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.banner-icon {
		font-size: 1.1rem;
	}
	.banner-text {
		font-size: 0.84rem;
		color: var(--color-text-secondary);
		flex: 1;
	}
	.banner-text strong {
		color: var(--color-text-primary);
	}
	.banner-btn {
		padding: 0.35rem 0.85rem;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-accent-cyan));
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}
	.banner-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(12, 113, 61, 0.3);
	}
	.banner-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.banner-dismiss {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.25rem;
		transition: color 0.2s;
	}
	.banner-dismiss:hover {
		color: var(--color-text-primary);
	}
	.banner-form {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.banner-input {
		width: 120px;
		padding: 0.35rem 0.6rem;
		background: var(--color-surface-100);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: var(--color-text-primary);
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-align: center;
		font-family: 'JetBrains Mono', monospace;
		outline: none;
	}
	.banner-input:focus {
		border-color: var(--color-brand-500);
		box-shadow: 0 0 0 2px rgba(12, 113, 61, 0.15);
	}
	.banner-resend {
		background: none;
		border: none;
		color: var(--color-brand-400);
		font-size: 0.78rem;
		cursor: pointer;
		font-family: inherit;
		transition: color 0.2s;
	}
	.banner-resend:hover:not(:disabled) {
		color: var(--color-brand-300);
		text-decoration: underline;
	}
	.banner-resend:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.banner-success {
		font-size: 0.82rem;
		color: #4ade80;
		margin-bottom: 0.4rem;
	}
	.banner-error {
		font-size: 0.82rem;
		color: #f87171;
		margin-bottom: 0.4rem;
	}
	@media (max-width: 768px) {
		.banner-row {
			gap: 0.4rem;
		}
		.banner-text {
			font-size: 0.78rem;
			flex-basis: 100%;
		}
	}
</style>
