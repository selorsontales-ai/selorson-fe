<script lang="ts">
	import {
		isAuthenticated,
		getUser,
		getToken,
	} from "$lib/stores/auth.svelte";
	import { PUBLIC_API_BASE } from "$env/static/public";
	import {
		setup2FA,
		verify2FA,
		disable2FA,
		generateBackupCodes,
		is2FAEnabled,
		get2FASecret,
		get2FAQr,
		getBackupCodes,
		is2FALoading,
	} from "$lib/stores/security.svelte";
	import { goto } from "$app/navigation";
	import { getLocale, setLocale } from "$lib/paraglide/runtime";
	import {
		isChatWidgetHidden,
		setChatWidgetHidden,
	} from "$lib/stores/support.svelte";
	import * as m from "$lib/paraglide/messages";
	import { dateLocale } from '$lib/i18n-labels';
	import QRCode from "qrcode";

	let totpCode = $state("");
	let show2FASetup = $state(false);
	let saving = $state(false);
	let message = $state("");
	let showPassword = $state(false);
	let qrCodeDataUrl = $state("");

	// Password
	let currentPass = $state("");
	let newPass = $state("");
	let confirmPass = $state("");

	// Email verification
	let emailCodeSent = $state(false);
	let emailCode = $state("");

	// Devices
	let devices = $state<any[]>([]);


	$effect(() => {
		const uri = get2FAQr();
		if (uri && show2FASetup) {
			QRCode.toDataURL(uri, {
				width: 160,
				margin: 2,
				color: { dark: "#111827", light: "#ffffff" },
			})
				.then((url) => (qrCodeDataUrl = url))
				.catch((err) => console.error(err));
		} else {
			qrCodeDataUrl = "";
		}
	});

	// Data export
	let exporting = $state(false);

	// Delete account
	let showDeleteConfirm = $state(false);
	let deletePassword = $state("");
	let deleteConfirmText = $state("");
	let deleteTotpCode = $state("");

	async function apiFetch(endpoint: string, options: RequestInit = {}) {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
			...((options.headers as Record<string, string>) || {}),
		};
		const token = getToken();
		if (token) headers["Authorization"] = `Bearer ${token}`;
		const res = await fetch(`${PUBLIC_API_BASE}${endpoint}`, {
			...options,
			headers,
			credentials: "include",
		});
		return res.json();
	}

	async function changePassword() {
		if (newPass !== confirmPass) {
			message = m.settings_err_pass_mismatch();
			return;
		}
		saving = true;
		message = "";
		try {
			const r = await apiFetch("/auth/change-password", {
				method: "PUT",
				body: JSON.stringify({
					current_password: currentPass,
					new_password: newPass,
				}),
			});
			message = r.success
				? m.settings_success_pass()
				: r.message || m.settings_err_default();
			if (r.success) {
				currentPass = "";
				newPass = "";
				confirmPass = "";
			}
		} catch {
			message = m.settings_err_sys();
		} finally {
			saving = false;
		}
	}

	async function sendEmailCode() {
		try {
			await apiFetch("/auth/email/send-code", { method: "POST" });
			emailCodeSent = true;
			message = m.settings_success_code();
		} catch {
			message = m.settings_err_default();
		}
	}

	async function verifyEmail() {
		try {
			const r = await apiFetch("/auth/email/verify", {
				method: "POST",
				body: JSON.stringify({ code: emailCode }),
			});
			message = r.success
				? m.settings_success_verify()
				: m.settings_err_code();
		} catch {
			message = m.settings_err_default();
		}
	}

	let devicesUnavailable = $state(false);
	let devicesFetched = false;

	async function fetchDevices() {
		try {
			const r = await apiFetch("/auth/devices");
			if (r.success) {
				devices = r.data;
			} else {
				devicesUnavailable = true;
			}
		} catch {
			devicesUnavailable = true;
		}
	}

	async function revokeDevice(id: number) {
		try {
			await apiFetch(`/auth/devices/${id}`, { method: "DELETE" });
			devices = devices.filter((d) => d.id !== id);
			message = m.settings_success_revoke();
		} catch {
			message = m.settings_err_default();
		}
	}

	async function exportData() {
		exporting = true;
		try {
			const r = await apiFetch("/account/export", { method: "POST" });
			if (r.success) {
				const blob = new Blob([JSON.stringify(r.data, null, 2)], {
					type: "application/json",
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "selorson-data-export.json";
				a.click();
				URL.revokeObjectURL(url);
				message = m.settings_success_export();
			}
		} catch {
			message = m.settings_err_default();
		} finally {
			exporting = false;
		}
	}

	async function deleteAccount() {
		if (deleteConfirmText !== "DELETE") return;
		try {
			const r = await apiFetch("/account", {
				method: "DELETE",
				body: JSON.stringify({
					password: deletePassword,
					confirmation: deleteConfirmText,
					code: deleteTotpCode,
				}),
			});
			if (r.success) {
				message = m.settings_success_delete();
				goto("/");
			}
		} catch {
			message = m.settings_err_delete();
		}
	}

	function formatDate(d: string | null) {
		if (!d) return "—";
		return new Date(d).toLocaleDateString(dateLocale(), {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	// Reactively fetch devices when user becomes authenticated
	// (onMount fires before fetchMe() completes, so we use $effect instead)
	$effect(() => {
		if (isAuthenticated() && !devicesFetched) {
			devicesFetched = true;
			fetchDevices();
		}
	});
</script>

<svelte:head><title>{m.settings_title()} — Selorson</title></svelte:head>

<div class="settings-page">
	<h1>{m.settings_title()}</h1>
	<p class="page-sub">{@html m.settings_desc({ id: getUser()?.id || 0 })}</p>

	{#if !isAuthenticated()}<p class="muted">{m.settings_req_login()}</p>
	{:else}
		{#if message}<div class="toast-msg">{message}</div>{/if}
		<div class="settings-grid">
			<!-- Language -->
			<section class="card">
				<h2>🌐 {m.settings_language()}</h2>
				<p class="hint">{m.settings_language_desc()}</p>
				<div class="lang-options">
					<button
						class="btn-export"
						class:active={getLocale() === "vi"}
						onclick={() => setLocale("vi")}>🇻🇳 Tiếng Việt</button
					>
					<button
						class="btn-export"
						class:active={getLocale() === "en"}
						onclick={() => setLocale("en")}>🇬🇧 English</button
					>
				</div>
			</section>

			<!-- UI Options -->
			<section class="card">
				<h2>{m.settings_appearance_widgets()}</h2>
				<p class="hint">
					{m.settings_customize_your_display_experience_on()}
				</p>
				<div class="setting-item">
					<div>
						<strong>{m.settings_support_chat_button()}</strong>
						<p class="hint">
							{m.settings_show_the_support_chat_button()}
						</p>
					</div>
					<button
						class="btn-toggle"
						class:active={!isChatWidgetHidden()}
						onclick={() =>
							setChatWidgetHidden(!isChatWidgetHidden())}
					>
						{!isChatWidgetHidden()
							? m.settings_enabled()
							: m.settings_disabled()}
					</button>
				</div>
			</section>

			<!-- Password -->
			<section class="card">
				<h2>
					🔑 {getUser()?.has_password
						? m.settings_pwd_change()
						: m.settings_pwd_create()}
				</h2>
				{#if getUser()?.has_password}<label
						>{m.settings_pwd_current()}
						<div class="pwd-wrap">
							<input
								type={showPassword ? "text" : "password"}
								bind:value={currentPass}
								placeholder="••••••••"
							/><button
								type="button"
								class="pwd-toggle"
								onclick={() => (showPassword = !showPassword)}
								>{showPassword ? "🙈" : "👁️"}</button
							>
						</div></label
					>{/if}
				<label
					>{m.settings_pwd_new()}
					<div class="pwd-wrap">
						<input
							type={showPassword ? "text" : "password"}
							bind:value={newPass}
							placeholder="••••••••"
						/><button
							type="button"
							class="pwd-toggle"
							onclick={() => (showPassword = !showPassword)}
							>{showPassword ? "🙈" : "👁️"}</button
						>
					</div></label
				>
				<label
					>{m.settings_pwd_confirm()}
					<div class="pwd-wrap">
						<input
							type={showPassword ? "text" : "password"}
							bind:value={confirmPass}
							placeholder="••••••••"
						/><button
							type="button"
							class="pwd-toggle"
							onclick={() => (showPassword = !showPassword)}
							>{showPassword ? "🙈" : "👁️"}</button
						>
					</div></label
				>
				<button
					class="btn-save danger-bg"
					onclick={changePassword}
					disabled={saving}
					>🔑 {getUser()?.has_password
						? m.settings_pwd_change()
						: m.settings_pwd_create()}</button
				>
			</section>

			<!-- Email Verification -->
			<section class="card">
				<h2>{m.settings_email_title()}</h2>
				<div class="status-row">
					<span
						class="status-badge"
						class:verified={getUser()?.email_verified_at}
						>{getUser()?.email_verified_at
							? m.settings_status_verified()
							: m.settings_status_unverified()}</span
					>
					<span class="status-email">{getUser()?.email}</span>
				</div>
				{#if !getUser()?.email_verified_at}
					<p class="hint">{m.settings_email_desc()}</p>
					{#if emailCodeSent}<label
							>{m.settings_email_code()}<input
								bind:value={emailCode}
								placeholder={m.settings_placeholder_6_code()}
								maxlength="6"
							/></label
						>{/if}
					<button
						class="btn-save"
						onclick={() =>
							emailCodeSent ? verifyEmail() : sendEmailCode()}
						>{emailCodeSent
							? m.settings_btn_verify_code()
							: m.settings_btn_send_code()}</button
					>
				{/if}
			</section>

			<!-- 2FA -->
			<section class="card">
				<h2>{m.settings_2fa_title()}</h2>
				<div class="status-row">
					<span class="status-badge" class:verified={is2FAEnabled()}
						>{is2FAEnabled()
							? m.settings_status_enabled()
							: m.settings_status_disabled()}</span
					>
				</div>
				<p class="hint">{m.settings_2fa_desc()}</p>
				{#if is2FAEnabled()}
					<div class="tfa-actions">
						<button
							class="btn-export"
							onclick={() => generateBackupCodes(totpCode)}
							disabled={is2FALoading() || totpCode.length !== 6}
							>{m.settings_btn_backup()}</button
						>
						<div class="tfa-disable">
							<input
								type="text"
								bind:value={totpCode}
								placeholder={m.settings_placeholder_6_code()}
								maxlength="6"
							/><button
								class="btn-danger"
								onclick={() => disable2FA(totpCode)}
								disabled={is2FALoading()}
								>{m.settings_btn_disable_2fa()}</button
							>
						</div>
					</div>
					{#if getBackupCodes().length > 0}<div class="backup-codes">
							<h4>{m.settings_backup_title()}</h4>
							<div class="codes-grid">
								{#each getBackupCodes() as code}<span
										class="backup-code">{code}</span
									>{/each}
							</div>
						</div>{/if}
				{:else if show2FASetup && get2FASecret()}
					<div class="tfa-setup">
						<p class="hint">{m.settings_2fa_scan()}</p>
						{#if qrCodeDataUrl}
							<img
								src={qrCodeDataUrl}
								alt="QR Code"
								class="tfa-qr"
							/>
						{/if}
						<p class="hint secret-hint">
							{m.settings_2fa_secret_hint()}
						</p>
						<div class="tfa-secret">
							<code>{get2FASecret()}</code>
						</div>
						<div class="tfa-verify">
							<input
								type="text"
								bind:value={totpCode}
								placeholder={m.settings_placeholder_6_code()}
								maxlength="6"
							/><button
								class="btn-save"
								onclick={async () => {
									const r = await verify2FA(totpCode);
									message = r.success
										? m.settings_success_2fa()
										: r.message || m.settings_err_default();
									if (r.success) {
										totpCode = "";
										show2FASetup = false;
									}
								}}
								disabled={is2FALoading() ||
									totpCode.length !== 6}
								>{m.settings_btn_confirm()}</button
							>
						</div>
					</div>
				{:else}
					<button
						class="btn-save"
						onclick={async () => {
							await setup2FA();
							show2FASetup = true;
						}}
						disabled={is2FALoading()}
						>{is2FALoading()
							? m.settings_btn_creating()
							: m.settings_btn_enable_2fa()}</button
					>
				{/if}
			</section>

			<!-- Devices -->
			<section class="card">
				<h2>📱 {m.settings_device_title()}</h2>
				{#if devicesUnavailable}
					<p class="hint">{m.settings_device_unavail()}</p>
				{:else if devices.length > 0}
					<div class="device-list">
						{#each devices as d}
							<div class="device-item">
								<div class="device-info">
									<span class="device-name"
										>{d.name ||
											m.settings_device_browser()}</span
									>
									<!-- A device row now outlives the session that
									     created it, so "first signed in here" and
									     "still in use" are different facts. The
									     second is the one that shows a session
									     nobody remembers opening. -->
									<span class="device-date"
										>{d.last_used_at
											? m.settings_device_lastused()
											: m.settings_device_login()}
										{formatDate(
											d.last_used_at ?? d.created_at,
										)}</span
									>
								</div>
								{#if d.is_current}<span class="current-badge"
										>{m.settings_device_current()}</span
									>
								{:else}<button
										class="btn-revoke"
										onclick={() => revokeDevice(d.id)}
										>{m.settings_btn_logout()}</button
									>{/if}
							</div>
						{/each}
					</div>
				{:else}<p class="hint">{m.settings_loading()}</p>{/if}
			</section>

			<!-- Data Export -->
			<section class="card">
				<h2>{m.settings_export_title()}</h2>
				<p class="hint">{m.settings_export_desc()}</p>
				<button
					class="btn-export"
					disabled={exporting}
					onclick={exportData}
					>{exporting
						? m.settings_btn_exporting()
						: m.settings_btn_export()}</button
				>
			</section>

			<!-- Delete Account -->
			<section class="card card-danger">
				<h2>{m.settings_delete_title()}</h2>
				<p class="hint danger-text">{m.settings_delete_desc()}</p>
				{#if showDeleteConfirm}
					<label
						>{m.settings_delete_pwd()}
						<div class="pwd-wrap">
							<input
								type={showPassword ? "text" : "password"}
								bind:value={deletePassword}
								placeholder="••••••••"
							/><button
								type="button"
								class="pwd-toggle"
								onclick={() => (showPassword = !showPassword)}
								>{showPassword ? "🙈" : "👁️"}</button
							>
						</div></label
					>
					{#if getUser()?.two_factor_enabled}
						<label
							>{m.settings_placeholder_6_code()}<input
								type="text"
								inputmode="numeric"
								bind:value={deleteTotpCode}
								maxlength="6"
								placeholder="123456"
							/></label
						>
					{/if}
					<label
						>{m.settings_delete_confirm_label()}<input
							bind:value={deleteConfirmText}
							placeholder="DELETE"
						/></label
					>
					<div class="delete-actions">
						<button
							class="btn-danger"
							disabled={deleteConfirmText !== "DELETE" ||
								(getUser()?.has_password && deletePassword.length === 0) ||
								(getUser()?.two_factor_enabled && deleteTotpCode.length !== 6)}
							onclick={deleteAccount}
							>{m.settings_btn_delete_forever()}</button
						>
						<button
							class="btn-export"
							onclick={() => (showDeleteConfirm = false)}
							>{m.settings_btn_cancel()}</button
						>
					</div>
				{:else}<button
						class="btn-danger"
						onclick={() => (showDeleteConfirm = true)}
						>{m.settings_delete_title()}</button
					>{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.settings-page {
		max-width: 900px;
		margin: clamp(1.25rem, 3vw, 2rem) auto;
		padding: 0 clamp(0.85rem, 3vw, 1.5rem);
	}
	h1 {
		font-size: 1.75rem;
		font-weight: 800;
		margin-bottom: 0.5rem;
	}
	.page-sub {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin-bottom: 2rem;
	}
	.page-sub :global(.profile-link) {
		color: var(--color-brand-400);
		font-weight: 600;
		text-decoration: none;
	}
	.page-sub :global(.profile-link:hover) {
		text-decoration: underline;
	}
	.muted {
		color: var(--color-text-muted);
		text-align: center;
		padding: 3rem;
	}
	.settings-grid {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.toast-msg {
		background: rgba(12, 113, 61, 0.15);
		border: 1px solid rgba(12, 113, 61, 0.3);
		color: var(--color-brand-300);
		padding: 0.65rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.85rem;
	}
	.card {
		background: var(--color-surface-100);
		border-radius: 1rem;
		padding: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.04);
		transition: border-color 0.3s;
	}
	.card:hover {
		border-color: rgba(255, 255, 255, 0.08);
	}
	.card h2 {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-brand-400);
		margin: 0 0 1.25rem;
	}
	.card-danger {
		border-color: rgba(220, 38, 38, 0.15);
	}
	label {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}
	input {
		display: block;
		width: 100%;
		padding: 0.75rem;
		margin-top: 0.375rem;
		border: 2px solid rgba(255, 255, 255, 0.06);
		border-radius: 0.625rem;
		font-size: 0.875rem;
		font-family: inherit;
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		transition: all 0.2s;
	}
	input:focus {
		outline: none;
		border-color: var(--color-brand-500);
		box-shadow: 0 0 0 4px rgba(12, 113, 61, 0.1);
	}
	.status-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.status-badge {
		padding: 0.375rem 0.75rem;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		background: rgba(245, 158, 11, 0.1);
		color: #fbbf24;
	}
	.status-badge.verified {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
	}
	.status-email {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
	.hint {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
		line-height: 1.5;
	}
	.danger-text {
		color: #fca5a5;
	}
	.btn-save {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #0c713d, #085a30);
		color: #fff;
		border: none;
		border-radius: 0.625rem;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-save:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(12, 113, 61, 0.3);
	}
	.btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
	.btn-save.danger-bg {
		background: linear-gradient(135deg, #dc2626, #991b1b);
	}
	.btn-export {
		padding: 0.625rem 1rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: var(--color-text-secondary);
		border-radius: 0.625rem;
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.btn-export:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-danger {
		padding: 0.625rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #f87171;
		border-radius: 0.625rem;
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.btn-danger:hover {
		background: rgba(239, 68, 68, 0.2);
	}
	.btn-revoke {
		padding: 0.375rem 0.75rem;
		background: none;
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 0.375rem;
		color: #f87171;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-revoke:hover {
		background: rgba(239, 68, 68, 0.1);
	}
	.device-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.device-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--color-surface-200);
		border-radius: 0.625rem;
	}
	.device-info {
		flex: 1;
		min-width: 180px;
	}
	.device-name {
		display: block;
		font-weight: 600;
		font-size: 0.875rem;
	}
	.device-date {
		display: block;
		font-size: 0.68rem;
		color: var(--color-text-muted);
	}
	.current-badge {
		padding: 0.25rem 0.625rem;
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
		font-size: 0.68rem;
		font-weight: 600;
		border-radius: 1rem;
	}
	.delete-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.tfa-actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}
	.tfa-disable {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.tfa-disable input {
		flex: 1 1 180px;
	}
	.tfa-setup {
		padding: 0.75rem 0;
	}
	.tfa-qr {
		display: block;
		margin: 0 0 1rem;
		border-radius: 8px;
		background: #fff;
		padding: 0.25rem;
		width: 160px;
		height: 160px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}
	.secret-hint {
		margin-bottom: 0.5rem;
		font-size: 0.8rem;
	}
	.tfa-secret {
		font-size: 1rem;
		color: var(--color-text-primary);
		margin-bottom: 1.5rem;
		text-align: center;
		letter-spacing: 2px;
	}
	.tfa-secret code {
		display: inline-block;
		max-width: 100%;
		overflow-wrap: anywhere;
		background: rgba(255, 255, 255, 0.06);
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		font-size: 0.9rem;
	}
	.tfa-verify {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.tfa-verify input {
		flex: 1 1 180px;
	}
	.backup-codes {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 8px;
	}
	.backup-codes h4 {
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}
	.codes-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.35rem;
	}
	.backup-code {
		font-family: monospace;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.4rem 0.5rem;
		background: var(--color-surface-200);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		text-align: center;
		color: var(--color-text-primary);
		letter-spacing: 1px;
	}
	.lang-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.lang-options .btn-export.active {
		background: rgba(12, 113, 61, 0.15);
		border-color: var(--color-brand-500);
		color: var(--color-brand-300);
	}
	.setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 12px;
	}
	.setting-item strong {
		font-size: 0.9rem;
	}
	.setting-item .hint {
		margin: 0;
		font-size: 0.8rem;
		margin-top: 0.25rem;
	}
	.btn-toggle {
		padding: 0.5rem 1rem;
		border-radius: 20px;
		border: none;
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
		background: rgba(255, 255, 255, 0.1);
		color: var(--color-text-secondary);
		transition: all 0.2s;
	}
	.btn-toggle.active {
		background: var(--color-brand-500);
		color: white;
	}
	@media (max-width: 640px) {
		.card {
			padding: 1.15rem;
		}
		.codes-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
