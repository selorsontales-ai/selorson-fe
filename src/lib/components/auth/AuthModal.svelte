<!-- Auth Modal — Login / Register / Forgot Password / Reset Password / Verify Email -->
<script lang="ts">
	import { login, register, forgotPassword, resetPassword, verifyEmail, resendVerification } from '$lib/stores/auth.svelte';
	import { loginWithGoogle, loginWithFacebook, isOAuthLoading } from '$lib/stores/security.svelte';

	let { open = $bindable(false) } = $props();

	let mode = $state<'login' | 'register' | 'forgot' | 'reset' | 'verify'>('login');
	let loading = $state(false);
	let error = $state('');
	let successMsg = $state('');

	// Form fields
	let email = $state('');
	let password = $state('');
	let name = $state('');
	let username = $state('');
	let passwordConfirm = $state('');
	let rememberMe = $state(false);

	// Forgot password fields
	let resetCode = $state('');
	let newPassword = $state('');

	// Email verification
	let verifyCode = $state('');
	let resendCooldown = $state(0);
	let newPasswordConfirm = $state('');

	function resetForm() {
		password = '';
		name = '';
		username = '';
		passwordConfirm = '';
		resetCode = '';
		newPassword = '';
		newPasswordConfirm = '';
		verifyCode = '';
		error = '';
		successMsg = '';
	}

	function switchMode(m: 'login' | 'register' | 'forgot' | 'reset' | 'verify') {
		mode = m;
		resetForm();
	}

	// ---- Login ----
	async function handleLogin(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		try {
			const res = await login(email, password, rememberMe);
			if (res.requires_2fa) {
				// TODO: Show 2FA form (future)
				error = 'Tài khoản yêu cầu xác thực 2 bước. Tính năng này sẽ sớm được hỗ trợ.';
				return;
			}
			open = false;
			resetForm();
		} catch (err: any) {
			error = err.message || 'Đã xảy ra lỗi';
		} finally {
			loading = false;
		}
	}

	// ---- Register ----
	async function handleRegister(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		if (password !== passwordConfirm) {
			error = 'Mật khẩu xác nhận không khớp';
			loading = false;
			return;
		}
		try {
			await register({ name, username, email, password, password_confirmation: passwordConfirm });
			// Switch to email verification mode instead of closing
			mode = 'verify';
			verifyCode = '';
			error = '';
			successMsg = 'Tài khoản đã tạo thành công! Kiểm tra email để lấy mã xác nhận.';
		} catch (err: any) {
			error = err.message || 'Đã xảy ra lỗi';
		} finally {
			loading = false;
		}
	}

	// ---- Forgot Password (Step 1: Send code) ----
	async function handleForgot(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		try {
			await forgotPassword(email);
			successMsg = 'Mã xác nhận đã được gửi đến email của bạn!';
			// Auto switch to reset mode after 1.5s
			setTimeout(() => {
				switchMode('reset');
			}, 1500);
		} catch (err: any) {
			error = err.message || 'Đã xảy ra lỗi';
		} finally {
			loading = false;
		}
	}

	// ---- Reset Password (Step 2: Enter code + new password) ----
	async function handleReset(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		if (newPassword !== newPasswordConfirm) {
			error = 'Mật khẩu xác nhận không khớp';
			loading = false;
			return;
		}
		if (newPassword.length < 8) {
			error = 'Mật khẩu phải có ít nhất 8 ký tự';
			loading = false;
			return;
		}
		try {
			await resetPassword(email, resetCode, newPassword);
			successMsg = 'Đổi mật khẩu thành công! Đang chuyển về đăng nhập...';
			setTimeout(() => {
				switchMode('login');
			}, 2000);
		} catch (err: any) {
			error = err.message || 'Mã không đúng hoặc đã hết hạn';
		} finally {
			loading = false;
		}
	}

	// ---- Verify Email ----
	async function handleVerifyEmail(e: Event) {
		e.preventDefault();
		loading = true;
		error = '';
		try {
			await verifyEmail(email, verifyCode);
			successMsg = 'Email đã được xác nhận thành công! 🎉';
			setTimeout(() => {
				open = false;
				resetForm();
				mode = 'login';
			}, 1500);
		} catch (err: any) {
			error = err.message || 'Mã không đúng hoặc đã hết hạn';
		} finally {
			loading = false;
		}
	}

	async function handleResendVerification() {
		if (resendCooldown > 0) return;
		loading = true;
		error = '';
		try {
			await resendVerification(email);
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

	function handleBackdrop() {
		if (!loading) {
			open = false;
			resetForm();
			mode = 'login';
		}
	}

	// Modal titles
	const titles: Record<string, string> = {
		login: 'Đăng nhập',
		register: 'Tạo tài khoản',
		forgot: 'Quên mật khẩu',
		reset: 'Đặt lại mật khẩu',
		verify: 'Xác nhận email',
	};
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onmousedown={handleBackdrop}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onmousedown={(e) => e.stopPropagation()}>
			<!-- Header -->
			<div class="modal-header">
				<h2>{titles[mode]}</h2>
				<button class="close-btn" onclick={() => handleBackdrop()} aria-label="Close">✕</button>
			</div>

			<!-- Tab Switcher (only login/register) -->
			{#if mode === 'login' || mode === 'register'}
				<div class="tab-switcher">
					<button class="tab" class:active={mode === 'login'} onclick={() => switchMode('login')}>
						Đăng nhập
					</button>
					<button
						class="tab"
						class:active={mode === 'register'}
						onclick={() => switchMode('register')}
					>
						Đăng ký
					</button>
				</div>
			{/if}

			<!-- Success -->
			{#if successMsg}
				<div class="success-msg">{successMsg}</div>
			{/if}

			<!-- Error -->
			{#if error}
				<div class="error-msg">{error}</div>
			{/if}

			<!-- ════════════ LOGIN FORM ════════════ -->
			{#if mode === 'login'}
				<form onsubmit={handleLogin}>
					<div class="field">
						<label for="auth-email">Email</label>
						<input
							id="auth-email"
							type="email"
							bind:value={email}
							placeholder="email@example.com"
							required
						/>
					</div>
					<div class="field">
						<label for="auth-password">Mật khẩu</label>
						<input
							id="auth-password"
							type="password"
							bind:value={password}
							placeholder="••••••••"
							required
							minlength="8"
						/>
					</div>

					<!-- Remember Me + Forgot Password -->
					<div class="login-options">
						<label class="remember-label">
							<input type="checkbox" bind:checked={rememberMe} />
							<span>Ghi nhớ đăng nhập</span>
						</label>
						<button type="button" class="forgot-link" onclick={() => switchMode('forgot')}>
							Quên mật khẩu?
						</button>
					</div>

					<button class="btn-brand submit-btn" type="submit" disabled={loading}>
						{#if loading}
							<span class="spinner"></span>
						{:else}
							Đăng nhập
						{/if}
					</button>
				</form>

				<!-- Social Login -->
				<div class="divider"><span>hoặc</span></div>
				<div class="social-buttons">
					<button class="social-btn google" onclick={loginWithGoogle} disabled={isOAuthLoading()}>
						<svg width="18" height="18" viewBox="0 0 18 18"
							><path
								d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
								fill="#4285F4"
							/><path
								d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
								fill="#34A853"
							/><path
								d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
								fill="#FBBC05"
							/><path
								d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
								fill="#EA4335"
							/></svg
						>
						Đăng nhập với Google
					</button>
					<button
						class="social-btn facebook"
						onclick={loginWithFacebook}
						disabled={isOAuthLoading()}
					>
						<svg width="18" height="18" viewBox="0 0 18 18"
							><path
								d="M18 9a9 9 0 10-10.406 8.89v-6.29H5.309V9h2.285V7.017c0-2.257 1.344-3.504 3.4-3.504.985 0 2.015.176 2.015.176v2.215h-1.135c-1.118 0-1.467.694-1.467 1.406V9h2.496l-.399 2.6h-2.097v6.29A9.003 9.003 0 0018 9z"
								fill="#1877F2"
							/></svg
						>
						Đăng nhập với Facebook
					</button>
				</div>

			<!-- ════════════ REGISTER FORM ════════════ -->
			{:else if mode === 'register'}
				<form onsubmit={handleRegister}>
					<div class="field">
						<label for="auth-name">Tên hiển thị</label>
						<input
							id="auth-name"
							type="text"
							bind:value={name}
							placeholder="Nguyễn Văn A"
							required
						/>
					</div>
					<div class="field">
						<label for="auth-username">Tên người dùng</label>
						<input
							id="auth-username"
							type="text"
							bind:value={username}
							placeholder="nguyenvana"
							required
							minlength="3"
						/>
					</div>
					<div class="field">
						<label for="auth-email-reg">Email</label>
						<input
							id="auth-email-reg"
							type="email"
							bind:value={email}
							placeholder="email@example.com"
							required
						/>
					</div>
					<div class="field">
						<label for="auth-password-reg">Mật khẩu</label>
						<input
							id="auth-password-reg"
							type="password"
							bind:value={password}
							placeholder="••••••••"
							required
							minlength="8"
						/>
					</div>
					<div class="field">
						<label for="auth-password-confirm">Xác nhận mật khẩu</label>
						<input
							id="auth-password-confirm"
							type="password"
							bind:value={passwordConfirm}
							placeholder="••••••••"
							required
						/>
					</div>
					<button class="btn-brand submit-btn" type="submit" disabled={loading}>
						{#if loading}
							<span class="spinner"></span>
						{:else}
							Tạo tài khoản
						{/if}
					</button>
				</form>

			<!-- ════════════ FORGOT PASSWORD (Step 1) ════════════ -->
			{:else if mode === 'forgot'}
				<p class="mode-description">
					Nhập email đã đăng ký, chúng tôi sẽ gửi mã xác nhận để đặt lại mật khẩu.
				</p>
				<form onsubmit={handleForgot}>
					<div class="field">
						<label for="forgot-email">Email</label>
						<input
							id="forgot-email"
							type="email"
							bind:value={email}
							placeholder="email@example.com"
							required
						/>
					</div>
					<button class="btn-brand submit-btn" type="submit" disabled={loading}>
						{#if loading}
							<span class="spinner"></span>
						{:else}
							Gửi mã xác nhận
						{/if}
					</button>
				</form>

				<button class="back-link" onclick={() => switchMode('login')}>← Quay lại đăng nhập</button>

			<!-- ════════════ RESET PASSWORD (Step 2) ════════════ -->
			{:else if mode === 'reset'}
				<p class="mode-description">
					Nhập mã 6 chữ số đã gửi đến <strong>{email}</strong> và mật khẩu mới.
				</p>
				<form onsubmit={handleReset}>
					<div class="field">
						<label for="reset-code">Mã xác nhận</label>
						<input
							id="reset-code"
							type="text"
							bind:value={resetCode}
							placeholder="123456"
							required
							maxlength="6"
							pattern="[0-9]{6}"
							inputmode="numeric"
							class="code-input"
						/>
					</div>
					<div class="field">
						<label for="reset-password">Mật khẩu mới</label>
						<input
							id="reset-password"
							type="password"
							bind:value={newPassword}
							placeholder="••••••••"
							required
							minlength="8"
						/>
					</div>
					<div class="field">
						<label for="reset-password-confirm">Xác nhận mật khẩu</label>
						<input
							id="reset-password-confirm"
							type="password"
							bind:value={newPasswordConfirm}
							placeholder="••••••••"
							required
						/>
					</div>
					<button class="btn-brand submit-btn" type="submit" disabled={loading}>
						{#if loading}
							<span class="spinner"></span>
						{:else}
							Đổi mật khẩu
						{/if}
					</button>
				</form>

				<button class="back-link" onclick={() => switchMode('forgot')}>← Gửi lại mã</button>

				<!-- ════════════ VERIFY EMAIL (After Register) ════════════ -->
				{:else if mode === 'verify'}
					<div class="verify-illustration">📧</div>
					<p class="mode-description">
						Nhập mã 6 chữ số đã gửi đến <strong>{email}</strong> để xác nhận tài khoản.
					</p>
					<form onsubmit={handleVerifyEmail}>
						<div class="field">
							<label for="verify-code">Mã xác nhận</label>
							<input
								id="verify-code"
								type="text"
								bind:value={verifyCode}
								placeholder="123456"
								required
								maxlength="6"
								pattern="[0-9]{6}"
								inputmode="numeric"
								class="code-input"
								autocomplete="one-time-code"
							/>
						</div>
						<button class="btn-brand submit-btn" type="submit" disabled={loading}>
							{#if loading}
								<span class="spinner"></span>
							{:else}
								Xác nhận email
							{/if}
						</button>
					</form>

					<div class="verify-actions">
						<button
							class="resend-btn"
							onclick={handleResendVerification}
							disabled={resendCooldown > 0 || loading}
						>
							{#if resendCooldown > 0}
								Gửi lại mã ({resendCooldown}s)
							{:else}
								📩 Gửi lại mã
							{/if}
						</button>
						<button class="back-link" onclick={() => { open = false; resetForm(); mode = 'login'; }}>
							Bỏ qua, xác nhận sau
						</button>
					</div>
			{/if}

			<!-- Footer hint -->
			{#if mode === 'login' || mode === 'register'}
				<p class="modal-footer-text">
					{#if mode === 'login'}
						Chưa có tài khoản? <button class="link-btn" onclick={() => switchMode('register')}
							>Đăng ký ngay</button
						>
					{:else}
						Đã có tài khoản? <button class="link-btn" onclick={() => switchMode('login')}
							>Đăng nhập</button
						>
					{/if}
				</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.2s ease;
	}

	.modal-content {
		width: 100%;
		max-width: 420px;
		max-height: 90vh;
		overflow-y: auto;
		background: linear-gradient(135deg, rgba(26, 26, 37, 0.95), rgba(18, 18, 26, 0.98));
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-xl);
		padding: 2rem;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
		animation: slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.modal-header h2 {
		font-size: 1.4rem;
		font-weight: 700;
		background: linear-gradient(135deg, var(--color-text-primary), var(--color-brand-300));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text-muted);
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.close-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: var(--color-text-primary);
	}

	/* Tabs */
	.tab-switcher {
		display: flex;
		gap: 0.25rem;
		background: var(--color-surface-100);
		border-radius: var(--radius-md);
		padding: 0.25rem;
		margin-bottom: 1.25rem;
	}

	.tab {
		flex: 1;
		padding: 0.5rem;
		border: none;
		border-radius: calc(var(--radius-md) - 2px);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab.active {
		background: var(--color-surface-300);
		color: var(--color-text-primary);
	}

	/* Messages */
	.error-msg {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #f87171;
		font-size: 0.82rem;
		padding: 0.6rem 0.875rem;
		border-radius: var(--radius-sm);
		margin-bottom: 1rem;
	}

	.success-msg {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.3);
		color: #4ade80;
		font-size: 0.82rem;
		padding: 0.6rem 0.875rem;
		border-radius: var(--radius-sm);
		margin-bottom: 1rem;
	}

	.mode-description {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin-bottom: 1.25rem;
	}

	/* Form */
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.field label {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.field input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: var(--color-surface-100);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9rem;
		font-family: inherit;
		outline: none;
		transition: border-color 0.2s;
		box-sizing: border-box;
	}

	.field input:focus {
		border-color: var(--color-brand-500);
		box-shadow: 0 0 0 3px rgba(12, 113, 61, 0.15);
	}

	.field input::placeholder {
		color: var(--color-text-muted);
	}

	/* Code input */
	.code-input {
		text-align: center;
		font-size: 1.5rem !important;
		font-weight: 700;
		letter-spacing: 0.3em;
		font-family: 'JetBrains Mono', monospace;
	}

	/* Login options row */
	.login-options {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: -0.25rem;
	}

	.remember-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.remember-label input[type='checkbox'] {
		width: 15px;
		height: 15px;
		accent-color: var(--color-brand-500);
		cursor: pointer;
	}

	.forgot-link {
		background: none;
		border: none;
		color: var(--color-brand-400);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
		transition: color 0.2s;
	}
	.forgot-link:hover {
		color: var(--color-brand-300);
		text-decoration: underline;
	}

	/* Back link */
	.back-link {
		display: block;
		margin-top: 1rem;
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
		transition: color 0.2s;
	}
	.back-link:hover {
		color: var(--color-text-primary);
	}

	.submit-btn {
		width: 100%;
		padding: 0.75rem;
		margin-top: 0.5rem;
		font-size: 0.95rem;
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		display: inline-block;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Footer */
	.modal-footer-text {
		text-align: center;
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-top: 1.25rem;
	}

	.link-btn {
		background: none;
		border: none;
		color: var(--color-brand-400);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.link-btn:hover {
		color: var(--color-brand-300);
	}

	/* Animations */
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(16px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Divider */
	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.25rem 0;
	}
	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
	}
	.divider span {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Social Buttons */
	.social-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.social-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.65rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
		color: var(--color-text-primary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}
	.social-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.15);
	}
	.social-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.social-btn.google:hover {
		border-color: rgba(66, 133, 244, 0.3);
	}
	.social-btn.facebook:hover {
		border-color: rgba(24, 119, 242, 0.3);
	}

	/* Verify Email */
	.verify-illustration {
		text-align: center;
		font-size: 3rem;
		margin-bottom: 0.75rem;
		animation: floatEmoji 2s ease-in-out infinite;
	}
	@keyframes floatEmoji {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-6px); }
	}
	.verify-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.resend-btn {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--color-brand-400);
		font-size: 0.82rem;
		font-weight: 500;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}
	.resend-btn:hover:not(:disabled) {
		background: rgba(12, 113, 61, 0.1);
		border-color: var(--color-brand-500);
	}
	.resend-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
