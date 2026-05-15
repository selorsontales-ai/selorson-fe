<script lang="ts">
	import { getUser, getToken } from '$lib/stores/auth.svelte';
	import { apiUpload } from '$lib/api';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import { onMount } from 'svelte';
	import ImageCropper from '$lib/components/ui/ImageCropper.svelte';

	let saving = $state(false);
	let savingPrivacy = $state(false);
	let message = $state('');

	// Profile fields
	let form = $state({ name: '', nickname: '', biography: '', occupation: '', hobbies: '', phone_number: '', birthday: '', gender: '', address: '' });

	// Privacy
	const privacyItems = [
		{ key: 'show_email', label: 'Hiển thị email' },
		{ key: 'show_phone', label: 'Hiển thị số điện thoại' },
		{ key: 'show_bio', label: 'Hiển thị tiểu sử' },
		{ key: 'show_hobbies', label: 'Hiển thị sở thích' },
		{ key: 'show_occupation', label: 'Hiển thị nghề nghiệp' },
		{ key: 'show_birthday', label: 'Hiển thị ngày sinh' },
		{ key: 'show_gender', label: 'Hiển thị giới tính' },
		{ key: 'show_address', label: 'Hiển thị địa chỉ' },
		{ key: 'show_online_status', label: 'Hiển thị trạng thái online' },
		{ key: 'private_account', label: 'Tài khoản riêng tư' },
	];
	let privacy = $state<Record<string, boolean>>({});

	// Avatar
	let avatarPreview = $state('');
	let uploadingAvatar = $state(false);
	let avatarFile = $state<File | null>(null);
	let avatarInput: HTMLInputElement;
	let avatarCropSrc = $state('');
	let showAvatarCrop = $state(false);

	// Cover
	let coverPreview = $state('');
	let uploadingCover = $state(false);
	let coverFile = $state<File | null>(null);
	let coverInput: HTMLInputElement;
	let coverCropSrc = $state('');
	let showCoverCrop = $state(false);

	// Blocked
	let blockedUsers = $state<any[]>([]);
	let loadingBlocked = $state(true);
	let unblocking = $state<number | null>(null);

	async function apiFetch(endpoint: string, options: RequestInit = {}) {
		const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers as Record<string, string> || {}) };
		const token = getToken(); if (token) headers['Authorization'] = `Bearer ${token}`;
		const res = await fetch(`${PUBLIC_API_BASE}${endpoint}`, { ...options, headers });
		return res.json();
	}

	onMount(async () => {
		const u = getUser();
		if (u) {
			form = { name: u.name || '', nickname: (u as any).nickname || '', biography: (u as any).biography || '', occupation: (u as any).occupation || '', hobbies: (u as any).hobbies || '', phone_number: (u as any).phone_number || '', birthday: (u as any).birthday || '', gender: (u as any).gender || '', address: (u as any).address || '' };
			const p = (u as any).privacy || {};
			privacyItems.forEach(i => privacy[i.key] = p[i.key] ?? false);
		}
		try { const r = await apiFetch('/social/blocked'); if (r.success) blockedUsers = r.data; } catch {} finally { loadingBlocked = false; }
	});

	async function saveProfile() {
		saving = true; message = '';
		try { const r = await apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(form) }); message = r.success ? '✅ Đã lưu!' : r.message || 'Lỗi'; } catch { message = 'Lỗi'; } finally { saving = false; }
	}

	async function savePrivacy() {
		savingPrivacy = true;
		try { const r = await apiFetch('/auth/privacy', { method: 'PUT', body: JSON.stringify(privacy) }); message = r.success ? '✅ Quyền riêng tư đã lưu!' : 'Lỗi'; } catch { message = 'Lỗi'; } finally { savingPrivacy = false; }
	}

	function onAvatarSelect(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		avatarCropSrc = URL.createObjectURL(file);
		showAvatarCrop = true;
		(e.target as HTMLInputElement).value = '';
	}
	function handleAvatarCrop(blob: Blob) {
		avatarFile = new File([blob], 'avatar.webp', { type: 'image/webp' });
		avatarPreview = URL.createObjectURL(blob);
		showAvatarCrop = false;
	}
	function cancelAvatarCrop() { showAvatarCrop = false; avatarCropSrc = ''; }

	async function uploadAvatar() {
		if (!avatarFile) return; uploadingAvatar = true;
		try {
			const fd = new FormData();
			fd.append('avatar', avatarFile);
			const res = await apiUpload<{ url: string }>('/upload/avatar', fd);
			message = '✅ Avatar cập nhật!';
			avatarFile = null;
			if (res.success && res.data?.url) avatarPreview = res.data.url;
		} catch { message = 'Lỗi upload'; } finally { uploadingAvatar = false; }
	}

	async function deleteAvatar() {
		if (!confirm('Xóa ảnh đại diện?')) return;
		try { await apiFetch('/auth/avatar', { method: 'DELETE' }); message = '✅ Đã xóa avatar'; } catch { message = 'Lỗi'; }
	}

	function onCoverSelect(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		coverCropSrc = URL.createObjectURL(file);
		showCoverCrop = true;
		(e.target as HTMLInputElement).value = '';
	}
	function handleCoverCrop(blob: Blob) {
		coverFile = new File([blob], 'cover.webp', { type: 'image/webp' });
		coverPreview = URL.createObjectURL(blob);
		showCoverCrop = false;
	}
	function cancelCoverCrop() { showCoverCrop = false; coverCropSrc = ''; }

	async function uploadCover() {
		if (!coverFile) return; uploadingCover = true;
		try {
			const fd = new FormData();
			fd.append('image', coverFile);
			fd.append('folder', 'covers');
			const res = await apiUpload<{ url: string }>('/upload/image', fd);
			if (res.success && res.data?.url) {
				await apiFetch('/profile/me', { method: 'PUT', body: JSON.stringify({ cover_image: res.data.url }) });
				message = '✅ Ảnh bìa cập nhật!';
				coverPreview = res.data.url;
			} else {
				message = 'Lỗi xử lý ảnh bìa';
			}
			coverFile = null;
		} catch { message = 'Lỗi upload'; } finally { uploadingCover = false; }
	}

	async function deleteCover() {
		if (!confirm('Xóa ảnh bìa?')) return;
		try { await apiFetch('/auth/cover', { method: 'DELETE' }); message = '✅ Đã xóa ảnh bìa'; } catch { message = 'Lỗi'; }
	}

	async function unblockUser(userId: number) {
		unblocking = userId;
		try { const r = await apiFetch(`/social/block/${userId}`, { method: 'POST' }); if (r.success) { blockedUsers = blockedUsers.filter(u => u.id !== userId); message = '✅ Đã bỏ chặn!'; } } catch { message = 'Lỗi'; } finally { unblocking = null; }
	}
</script>

<div class="profile-settings">
	{#if message}<div class="toast-msg">{message}</div>{/if}

	<!-- Edit Profile -->
	<section class="card">
		<h3>✏️ Chỉnh sửa thông tin</h3>
		<div class="form-grid">
			<label>Tên hiển thị<input bind:value={form.name} placeholder="Tên của bạn" /></label>
			<label>Biệt danh<input bind:value={form.nickname} placeholder="Biệt danh" /></label>
			<label>Nghề nghiệp<input bind:value={form.occupation} /></label>
			<label>Sở thích<input bind:value={form.hobbies} /></label>
			<label>Số điện thoại<input bind:value={form.phone_number} /></label>
			<label>Ngày sinh<input type="date" bind:value={form.birthday} /></label>
			<label>Giới tính<select bind:value={form.gender}><option value="">-- Chọn --</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></label>
			<label>Địa chỉ<input bind:value={form.address} /></label>
		</div>
		<label class="full">Tiểu sử<textarea bind:value={form.biography} rows="3" placeholder="Giới thiệu bản thân..."></textarea></label>
		<button class="btn-save" onclick={saveProfile} disabled={saving}>{saving ? '⏳ Đang lưu...' : '💾 Lưu thông tin'}</button>
	</section>

	<!-- Avatar & Cover -->
	<section class="card">
		<h3>🖼️ Hình đại diện và Ảnh bìa</h3>
		<div class="media-row">
			<div class="media-block">
				<span class="media-label">Avatar</span>
				<div class="avatar-upload">
					<div class="avatar-preview">
						{#if avatarPreview || getUser()?.avatar}<img src={avatarPreview || getUser()?.avatar} alt="Avatar" />{:else}<span class="avatar-fallback">{getUser()?.name?.charAt(0).toUpperCase()}</span>{/if}
					</div>
					<div class="media-actions">
						<input type="file" accept="image/*" bind:this={avatarInput} onchange={onAvatarSelect} style="display:none" />
						<button class="btn-upload" onclick={() => avatarInput?.click()}>📷 Chọn hình</button>
						{#if avatarFile}<button class="btn-upload btn-confirm" onclick={uploadAvatar} disabled={uploadingAvatar}>{uploadingAvatar ? '⏳...' : '✅ Tải lên'}</button>{/if}
						{#if getUser()?.avatar && !avatarFile}<button class="btn-upload btn-delete" onclick={deleteAvatar}>🗑️ Xóa</button>{/if}
					</div>
				</div>
			</div>
			<div class="media-block">
				<span class="media-label">Ảnh bìa</span>
				<div class="cover-upload">
					<div class="cover-preview" style="background-image:url({coverPreview || (getUser() as any)?.cover_image || ''});{!(coverPreview || (getUser() as any)?.cover_image) ? 'background:linear-gradient(135deg,#0c713d,#064e2b,#1a1a2e)' : ''}"></div>
					<div class="media-actions">
						<input type="file" accept="image/*" bind:this={coverInput} onchange={onCoverSelect} style="display:none" />
						<button class="btn-upload" onclick={() => coverInput?.click()}>🖼️ Chọn bìa</button>
						{#if coverFile}<button class="btn-upload btn-confirm" onclick={uploadCover} disabled={uploadingCover}>{uploadingCover ? '⏳...' : '✅ Tải lên'}</button>{/if}
						{#if (getUser() as any)?.cover_image && !coverFile}<button class="btn-upload btn-delete" onclick={deleteCover}>🗑️ Xóa</button>{/if}
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Privacy -->
	<section class="card">
		<h3>🔒 Quyền riêng tư</h3>
		<div class="toggle-grid">
			{#each privacyItems as item}
				<label class="toggle-label"><input type="checkbox" bind:checked={privacy[item.key]} /><span>{item.label}</span></label>
			{/each}
		</div>
		<button class="btn-save" onclick={savePrivacy} disabled={savingPrivacy}>{savingPrivacy ? '⏳...' : '🔒 Lưu quyền riêng tư'}</button>
	</section>

	<!-- Blocked Users -->
	<section class="card">
		<h3>🚫 Người dùng đã chặn</h3>
		{#if loadingBlocked}<p class="hint">Đang tải...</p>
		{:else if blockedUsers.length === 0}<p class="hint">✅ Bạn chưa chặn ai.</p>
		{:else}
			<div class="blocked-list">
				{#each blockedUsers as user}
					<div class="blocked-item">
						<div class="blocked-avatar">
							{#if user.avatar}<img src={user.avatar} alt="" />{:else}<span>{user.name?.charAt(0) || '?'}</span>{/if}
						</div>
						<div class="blocked-info"><a href="/profile/{user.username}" class="blocked-name">{user.name}</a><span class="blocked-username">@{user.username}</span></div>
						<button class="btn-unblock" onclick={() => unblockUser(user.id)} disabled={unblocking === user.id}>{unblocking === user.id ? '⏳...' : '✅ Bỏ chặn'}</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

{#if showAvatarCrop}
	<ImageCropper imageSrc={avatarCropSrc} aspectRatio={1} onCrop={handleAvatarCrop} onCancel={cancelAvatarCrop} />
{/if}

{#if showCoverCrop}
	<ImageCropper imageSrc={coverCropSrc} aspectRatio={3} onCrop={handleCoverCrop} onCancel={cancelCoverCrop} />
{/if}

<style>
	.profile-settings{max-width:900px}
	.toast-msg{background:rgba(12,113,61,.15);border:1px solid rgba(12,113,61,.3);color:var(--color-brand-300);padding:.65rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.85rem}
	.card{background:var(--color-surface-100);border-radius:1rem;padding:2rem;border:1px solid rgba(255,255,255,.04);margin-bottom:1.5rem;transition:border-color .3s}
	.card:hover{border-color:rgba(255,255,255,.08)}
	.card h3{font-size:1.125rem;font-weight:700;color:var(--color-brand-400);margin:0 0 1.5rem}
	.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.5rem}
	label{display:block;font-size:.8rem;font-weight:600;color:var(--color-text-muted);margin-bottom:.5rem}
	.full{margin-bottom:1.5rem}
	input,select,textarea{display:block;width:100%;padding:.75rem 1rem;margin-top:.35rem;border:2px solid rgba(255,255,255,.06);border-radius:.75rem;font-size:.875rem;font-family:inherit;background:var(--color-surface-200);color:var(--color-text-primary);transition:all .2s}
	input:focus,select:focus,textarea:focus{outline:none;border-color:var(--color-brand-500);box-shadow:0 0 0 4px rgba(12,113,61,.1)}
	textarea{resize:vertical;min-height:60px}
	select{appearance:auto}
	.btn-save{padding:.875rem 1.75rem;background:linear-gradient(135deg,#0c713d,#085a30);color:#fff;border:none;border-radius:.75rem;font-weight:600;font-size:.9rem;cursor:pointer;transition:all .2s}
	.btn-save:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(12,113,61,.2)}
	.btn-save:disabled{opacity:.5;cursor:not-allowed;transform:none}
	.media-row{display:grid;grid-template-columns:auto 1fr;gap:2.5rem;margin-bottom:1.5rem}
	.media-block .media-label{display:block;font-size:.8rem;font-weight:600;color:var(--color-text-muted);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.05em}
	.avatar-upload{display:flex;align-items:center;gap:1.25rem}
	.avatar-preview{width:72px;height:72px;border-radius:50%;overflow:hidden;background:var(--color-surface-300);display:flex;align-items:center;justify-content:center;border:3px solid rgba(12,113,61,.2);flex-shrink:0}
	.avatar-preview img{width:100%;height:100%;object-fit:cover}
	.avatar-fallback{font-size:1.5rem;font-weight:800;color:var(--color-brand-400)}
	.cover-upload{display:flex;align-items:flex-end;gap:1rem}
	.cover-preview{width:200px;height:80px;border-radius:.5rem;background-size:cover;background-position:center;flex-shrink:0;border:2px solid rgba(255,255,255,.08)}
	.media-actions{display:flex;gap:.5rem;flex-wrap:wrap}
	.btn-upload{padding:.5rem 1rem;border:2px solid rgba(255,255,255,.08);border-radius:.5rem;background:var(--color-surface-200);color:var(--color-text-secondary);font-size:.8rem;font-weight:600;cursor:pointer;transition:all .15s}
	.btn-upload:hover{border-color:var(--color-brand-500)}
	.btn-confirm{background:var(--color-brand-500);color:#fff;border-color:var(--color-brand-500)}
	.btn-confirm:disabled{opacity:.5}
	.btn-delete{color:#ef4444;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.05)}
	.btn-delete:hover{background:#ef4444;color:#fff;border-color:#ef4444}
	.toggle-grid{display:grid;grid-template-columns:1fr 1fr;gap:.625rem;margin-bottom:1.25rem}
	.toggle-label{display:flex;align-items:center;gap:.625rem;cursor:pointer;font-size:.875rem;padding:.5rem .75rem;border-radius:.5rem;transition:background .2s;color:var(--color-text-secondary)}
	.toggle-label:hover{background:rgba(12,113,61,.04)}
	.toggle-label input[type="checkbox"]{width:18px;height:18px;accent-color:var(--color-brand-500);cursor:pointer}
	.hint{font-size:.85rem;color:var(--color-text-muted);text-align:center;padding:1rem}
	.blocked-list{display:flex;flex-direction:column;gap:.75rem}
	.blocked-item{display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--color-surface-200);border-radius:.75rem}
	.blocked-avatar{width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--color-surface-300);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700;font-size:.875rem;color:var(--color-brand-400)}
	.blocked-avatar img{width:100%;height:100%;object-fit:cover}
	.blocked-info{flex:1;min-width:0}
	.blocked-name{font-weight:600;font-size:.875rem;color:var(--color-text-primary);text-decoration:none;display:block}
	.blocked-name:hover{color:var(--color-brand-400)}
	.blocked-username{font-size:.75rem;color:var(--color-text-muted)}
	.btn-unblock{padding:.5rem 1rem;border:1px solid rgba(255,255,255,.08);border-radius:.5rem;background:var(--color-surface-100);color:var(--color-brand-400);font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap}
	.btn-unblock:hover{background:var(--color-brand-500);color:#fff;border-color:var(--color-brand-500)}
	.btn-unblock:disabled{opacity:.5;cursor:not-allowed}
	@media(max-width:640px){.form-grid,.toggle-grid{grid-template-columns:1fr}.media-row{grid-template-columns:1fr;gap:1.5rem}}
</style>
