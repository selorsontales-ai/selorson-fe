<script lang="ts">
	import { onMount } from 'svelte';
	import { isAuthenticated, getUser, getToken } from '$lib/stores/auth.svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import {
		setup2FA, verify2FA, disable2FA, generateBackupCodes,
		is2FAEnabled, get2FASecret, get2FAQr, getBackupCodes, is2FALoading
	} from '$lib/stores/security.svelte';
	import { goto } from '$app/navigation';

	let totpCode = $state('');
	let show2FASetup = $state(false);
	let saving = $state(false);
	let message = $state('');

	// Password
	let currentPass = $state('');
	let newPass = $state('');
	let confirmPass = $state('');

	// Email verification
	let emailCodeSent = $state(false);
	let emailCode = $state('');

	// Devices
	let devices = $state<any[]>([]);

	// Data export
	let exporting = $state(false);

	// Delete account
	let showDeleteConfirm = $state(false);
	let deletePassword = $state('');
	let deleteConfirmText = $state('');

	async function apiFetch(endpoint: string, options: RequestInit = {}) {
		const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers as Record<string, string> || {}) };
		const token = getToken();
		if (token) headers['Authorization'] = `Bearer ${token}`;
		const res = await fetch(`${PUBLIC_API_BASE}${endpoint}`, { ...options, headers });
		return res.json();
	}

	async function changePassword() {
		if (newPass !== confirmPass) { message = '❌ Mật khẩu xác nhận không khớp'; return; }
		saving = true; message = '';
		try {
			const r = await apiFetch('/auth/change-password', { method: 'PUT', body: JSON.stringify({ current_password: currentPass, new_password: newPass }) });
			message = r.success ? '✅ Đổi mật khẩu thành công!' : r.message || 'Lỗi';
			if (r.success) { currentPass = ''; newPass = ''; confirmPass = ''; }
		} catch { message = 'Lỗi hệ thống'; } finally { saving = false; }
	}

	async function sendEmailCode() {
		try { await apiFetch('/auth/email/send-code', { method: 'POST' }); emailCodeSent = true; message = '📩 Mã đã gửi đến email!'; } catch { message = 'Lỗi'; }
	}

	async function verifyEmail() {
		try { const r = await apiFetch('/auth/email/verify', { method: 'POST', body: JSON.stringify({ code: emailCode }) }); message = r.success ? '✅ Email đã xác thực!' : 'Sai mã'; } catch { message = 'Lỗi'; }
	}

	let devicesUnavailable = $state(false);

	async function fetchDevices() {
		try { const r = await apiFetch('/auth/devices'); if (r.success) devices = r.data; else devicesUnavailable = true; } catch { devicesUnavailable = true; }
	}

	async function revokeDevice(id: number) {
		try { await apiFetch(`/auth/devices/${id}`, { method: 'DELETE' }); devices = devices.filter(d => d.id !== id); message = '✅ Đã đăng xuất thiết bị'; } catch { message = 'Lỗi'; }
	}

	async function exportData() {
		exporting = true;
		try {
			const r = await apiFetch('/account/export', { method: 'POST' });
			if (r.success) {
				const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a'); a.href = url; a.download = 'selorson-data-export.json'; a.click();
				URL.revokeObjectURL(url);
				message = '✅ Đã xuất dữ liệu!';
			}
		} catch { message = 'Lỗi'; } finally { exporting = false; }
	}

	async function deleteAccount() {
		if (deleteConfirmText !== 'DELETE') return;
		try {
			const r = await apiFetch('/account', { method: 'DELETE', body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmText }) });
			if (r.success) { message = '✅ Tài khoản đã xóa.'; goto('/'); }
		} catch { message = 'Lỗi — kiểm tra mật khẩu'; }
	}

	function formatDate(d: string | null) { if (!d) return '—'; return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

	onMount(() => { if (isAuthenticated()) fetchDevices(); });
</script>

<svelte:head><title>Cài Đặt Hệ Thống — Selorson</title></svelte:head>

<div class="settings-page">
	<h1>⚙️ Cài Đặt Hệ Thống</h1>
	<p class="page-sub">Quản lý bảo mật, thiết bị và tài khoản. Để chỉnh sửa thông tin cá nhân, vào <a href="/profile/{getUser()?.id}" class="profile-link">trang cá nhân</a> → tab ⚙️ Cài đặt.</p>

	{#if !isAuthenticated()}<p class="muted">Bạn cần đăng nhập để truy cập.</p>
	{:else}
		{#if message}<div class="toast-msg">{message}</div>{/if}
		<div class="settings-grid">

			<!-- Password -->
			<section class="card">
				<h2>🔑 {getUser()?.has_password ? 'Đổi Mật Khẩu' : 'Tạo Mật Khẩu'}</h2>
				{#if getUser()?.has_password}<label>Mật khẩu hiện tại<input type="password" bind:value={currentPass} placeholder="••••••••" /></label>{/if}
				<label>Mật khẩu mới<input type="password" bind:value={newPass} placeholder="••••••••" /></label>
				<label>Xác nhận mật khẩu mới<input type="password" bind:value={confirmPass} placeholder="••••••••" /></label>
				<button class="btn-save danger-bg" onclick={changePassword} disabled={saving}>🔑 {getUser()?.has_password ? 'Đổi mật khẩu' : 'Tạo mật khẩu'}</button>
			</section>

			<!-- Email Verification -->
			<section class="card">
				<h2>📧 Xác Thực Email</h2>
				<div class="status-row">
					<span class="status-badge" class:verified={getUser()?.email_verified_at}>{getUser()?.email_verified_at ? '✅ Đã xác thực' : '⚠️ Chưa xác thực'}</span>
					<span class="status-email">{getUser()?.email}</span>
				</div>
				{#if !getUser()?.email_verified_at}
					<p class="hint">Xác thực email để bảo vệ tài khoản và nhận thông báo.</p>
					{#if emailCodeSent}<label>Mã xác thực<input bind:value={emailCode} placeholder="Nhập mã 6 số" maxlength="6" /></label>{/if}
					<button class="btn-save" onclick={() => emailCodeSent ? verifyEmail() : sendEmailCode()}>{emailCodeSent ? '✅ Xác nhận mã' : '📩 Gửi mã xác thực'}</button>
				{/if}
			</section>

			<!-- 2FA -->
			<section class="card">
				<h2>🔐 Xác Thực Hai Bước (2FA)</h2>
				<div class="status-row">
					<span class="status-badge" class:verified={is2FAEnabled()}>{is2FAEnabled() ? '✅ Đã bật' : '❌ Chưa bật'}</span>
				</div>
				<p class="hint">Bảo vệ tài khoản bằng ứng dụng Authenticator (Google Authenticator, Authy...)</p>
				{#if is2FAEnabled()}
					<div class="tfa-actions">
						<button class="btn-export" onclick={() => generateBackupCodes()}>📋 Mã dự phòng</button>
						<div class="tfa-disable"><input type="text" bind:value={totpCode} placeholder="Nhập mã 6 số" maxlength="6" /><button class="btn-danger" onclick={() => disable2FA(totpCode)} disabled={is2FALoading()}>❌ Tắt 2FA</button></div>
					</div>
					{#if getBackupCodes().length > 0}<div class="backup-codes"><h4>Mã dự phòng:</h4><div class="codes-grid">{#each getBackupCodes() as code}<span class="backup-code">{code}</span>{/each}</div></div>{/if}
				{:else if show2FASetup && get2FASecret()}
					<div class="tfa-setup">
						<p class="hint">Quét mã QR bằng ứng dụng xác thực:</p>
						<div class="tfa-secret">Mã: <code>{get2FASecret()}</code></div>
						<div class="tfa-verify"><input type="text" bind:value={totpCode} placeholder="Nhập mã 6 số" maxlength="6" /><button class="btn-save" onclick={async () => { const r = await verify2FA(totpCode); message = r.success ? '✅ 2FA đã bật!' : r.message||'Lỗi'; if(r.success){totpCode='';show2FASetup=false;}}} disabled={is2FALoading() || totpCode.length !== 6}>Xác nhận</button></div>
					</div>
				{:else}
					<button class="btn-save" onclick={async () => { await setup2FA(); show2FASetup = true; }} disabled={is2FALoading()}>{is2FALoading() ? 'Đang tạo...' : '🔐 Bật 2FA'}</button>
				{/if}
			</section>

			<!-- Devices -->
			<section class="card">
				<h2>📱 Thiết Bị Đang Đăng Nhập</h2>
				{#if devicesUnavailable}
					<p class="hint">⚠️ Tính năng quản lý thiết bị chưa khả dụng.</p>
				{:else if devices.length > 0}
					<div class="device-list">
						{#each devices as d}
							<div class="device-item">
								<div class="device-info">
									<span class="device-name">{d.name || 'Trình duyệt'}</span>
									<span class="device-date">Đăng nhập: {formatDate(d.created_at)}</span>
								</div>
								{#if d.is_current}<span class="current-badge">Hiện tại</span>
								{:else}<button class="btn-revoke" onclick={() => revokeDevice(d.id)}>Đăng xuất</button>{/if}
							</div>
						{/each}
					</div>
				{:else}<p class="hint">Đang tải...</p>{/if}
			</section>

			<!-- Data Export -->
			<section class="card">
				<h2>📤 Xuất Dữ Liệu</h2>
				<p class="hint">Tải xuống toàn bộ dữ liệu cá nhân (GDPR/PDPA). File có hiệu lực 24 giờ.</p>
				<button class="btn-export" disabled={exporting} onclick={exportData}>{exporting ? '⏳ Đang xuất...' : '📤 Xuất dữ liệu'}</button>
			</section>

			<!-- Delete Account -->
			<section class="card card-danger">
				<h2>🗑️ Xóa Tài Khoản</h2>
				<p class="hint danger-text">Hành động không thể hoàn tác. Tài khoản bị vô hiệu hóa ngay, dữ liệu xóa sau 30 ngày.</p>
				{#if showDeleteConfirm}
					<label>Mật khẩu<input type="password" bind:value={deletePassword} placeholder="••••••••" /></label>
					<label>Nhập "DELETE" để xác nhận<input bind:value={deleteConfirmText} placeholder="DELETE" /></label>
					<div class="delete-actions">
						<button class="btn-danger" disabled={deleteConfirmText !== 'DELETE'} onclick={deleteAccount}>🗑️ Xóa vĩnh viễn</button>
						<button class="btn-export" onclick={() => showDeleteConfirm = false}>Hủy</button>
					</div>
				{:else}<button class="btn-danger" onclick={() => showDeleteConfirm = true}>🗑️ Xóa tài khoản</button>{/if}
			</section>

		</div>
	{/if}
</div>

<style>
	.settings-page{max-width:900px;margin:2rem auto;padding:0 1.5rem}
	h1{font-size:1.75rem;font-weight:800;margin-bottom:.5rem}
	.page-sub{font-size:.875rem;color:var(--color-text-muted);margin-bottom:2rem}
	.profile-link{color:var(--color-brand-400);font-weight:600;text-decoration:none}
	.profile-link:hover{text-decoration:underline}
	.muted{color:var(--color-text-muted);text-align:center;padding:3rem}
	.settings-grid{display:flex;flex-direction:column;gap:1.5rem}
	.toast-msg{background:rgba(12,113,61,.15);border:1px solid rgba(12,113,61,.3);color:var(--color-brand-300);padding:.65rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.85rem}
	.card{background:var(--color-surface-100);border-radius:1rem;padding:2rem;border:1px solid rgba(255,255,255,.04);transition:border-color .3s}
	.card:hover{border-color:rgba(255,255,255,.08)}
	.card h2{font-size:1.125rem;font-weight:700;color:var(--color-brand-400);margin:0 0 1.25rem}
	.card-danger{border-color:rgba(220,38,38,.15)}
	label{display:block;font-size:.8rem;font-weight:600;color:var(--color-text-muted);margin-bottom:1rem}
	input{display:block;width:100%;padding:.75rem;margin-top:.375rem;border:2px solid rgba(255,255,255,.06);border-radius:.625rem;font-size:.875rem;font-family:inherit;background:var(--color-surface-200);color:var(--color-text-primary);transition:all .2s}
	input:focus{outline:none;border-color:var(--color-brand-500);box-shadow:0 0 0 4px rgba(12,113,61,.1)}
	.status-row{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap}
	.status-badge{padding:.375rem .75rem;border-radius:1rem;font-size:.75rem;font-weight:600;background:rgba(245,158,11,.1);color:#fbbf24}
	.status-badge.verified{background:rgba(34,197,94,.1);color:#22c55e}
	.status-email{font-size:.875rem;color:var(--color-text-muted)}
	.hint{font-size:.8rem;color:var(--color-text-muted);margin:0 0 1rem;line-height:1.5}
	.danger-text{color:#fca5a5}
	.btn-save{padding:.75rem 1.5rem;background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;border:none;border-radius:.625rem;font-weight:600;font-size:.875rem;cursor:pointer;transition:all .2s}
	.btn-save:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(12,113,61,.3)}
	.btn-save:disabled{opacity:.5;cursor:not-allowed;transform:none}
	.btn-save.danger-bg{background:linear-gradient(135deg,#dc2626,#991b1b)}
	.btn-export{padding:.625rem 1rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:var(--color-text-secondary);border-radius:.625rem;font-weight:600;font-size:.8rem;cursor:pointer}
	.btn-export:disabled{opacity:.5;cursor:not-allowed}
	.btn-danger{padding:.625rem 1rem;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:.625rem;font-weight:600;font-size:.8rem;cursor:pointer}
	.btn-danger:hover{background:rgba(239,68,68,.2)}
	.btn-revoke{padding:.375rem .75rem;background:none;border:1px solid rgba(239,68,68,.3);border-radius:.375rem;color:#f87171;font-size:.75rem;font-weight:600;cursor:pointer}
	.btn-revoke:hover{background:rgba(239,68,68,.1)}
	.device-list{display:flex;flex-direction:column;gap:.75rem}
	.device-item{display:flex;align-items:center;gap:.75rem;padding:.75rem;background:var(--color-surface-200);border-radius:.625rem}
	.device-info{flex:1}
	.device-name{display:block;font-weight:600;font-size:.875rem}
	.device-date{display:block;font-size:.68rem;color:var(--color-text-muted)}
	.current-badge{padding:.25rem .625rem;background:rgba(34,197,94,.1);color:#22c55e;font-size:.68rem;font-weight:600;border-radius:1rem}
	.delete-actions{display:flex;align-items:center;gap:.75rem;margin-top:.5rem}
	.tfa-actions{display:flex;flex-direction:column;gap:.75rem;margin-top:.75rem}
	.tfa-disable{display:flex;gap:.5rem}.tfa-disable input{flex:1}
	.tfa-setup{padding:.75rem 0}
	.tfa-secret{font-size:.8rem;color:var(--color-text-secondary);margin-bottom:.75rem;word-break:break-all}
	.tfa-secret code{background:rgba(255,255,255,.06);padding:.15rem .4rem;border-radius:4px;font-size:.78rem}
	.tfa-verify{display:flex;gap:.5rem}.tfa-verify input{flex:1}
	.backup-codes{margin-top:.75rem;padding:.75rem;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.04);border-radius:8px}
	.backup-codes h4{font-size:.85rem;margin-bottom:.5rem}
	.codes-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.35rem}
	.backup-code{font-family:monospace;font-size:.8rem;padding:.3rem .5rem;background:rgba(0,0,0,.2);border-radius:4px;text-align:center;color:var(--color-accent-gold)}
	@media(max-width:640px){.card{padding:1.5rem}}
</style>
