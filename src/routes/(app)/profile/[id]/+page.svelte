<script lang="ts">
	import { api, apiUpload } from '$lib/api';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getUser, isAuthenticated } from '$lib/stores/auth.svelte';
	import { fetchStatus, getStatus, toggleBlock, toggleFollow, reportUser } from '$lib/stores/social.svelte';
	import { openChatWithUser } from '$lib/stores/chat.svelte';
	import ProfileSettings from '$lib/components/profile/ProfileSettings.svelte';
	import ImageCropper from '$lib/components/ui/ImageCropper.svelte';

	let { data } = $props();

	let profile = $state<any>(data.profile);
	let loading = $state(false);
	let isSelf = $derived(getUser()?.id != null && getUser()?.id === profile?.id);
	let avatarUploading = $state(false);
	let activeTab = $state<'about' | 'activity' | 'settings'>('about');
	let activity = $state<any>(null);
	let showReport = $state(false);
	let reportReason = $state('');
	let showActions = $state(false);
	let avatarCropSrc = $state('');
	let showAvatarCrop = $state(false);

	// Synchronize when navigating between profiles
	$effect(() => {
		profile = data.profile;
	});

	onMount(async () => {
		const id = page.params.id;
		if (!profile) {
			try {
				const profRes = await api<any>(`/profile/${id}`);
				profile = profRes.data;
			} catch { profile = null; }
		}

		try {
			if (isAuthenticated() && !isSelf) {
				await fetchStatus(Number(id));
			}
		} catch { /* ignore */ }
		
		loading = false;
	});

	async function handleFollow() {
		if (!profile) return;
		await toggleFollow(profile.id);
		// Refresh profile
		const r = await api<any>(`/profile/${profile.id}`);
		profile = r.data;
	}

	async function handleBlock() {
		if (!profile) return;
		await toggleBlock(profile.id);
	}

	async function handleReport() {
		if (!profile || !reportReason.trim()) return;
		await reportUser(profile.id, reportReason);
		showReport = false;
		reportReason = '';
	}

	async function loadActivity() {
		if (!profile || activity) return;
		try {
			const r = await api<any>(`/profile/${profile.id}/activity`);
			activity = r.data;
		} catch {}
	}

	function switchTab(tab: 'about' | 'activity' | 'settings') {
		activeTab = tab;
		if (tab === 'activity') loadActivity();
	}

	function onAvatarFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 5 * 1024 * 1024) { alert('Ảnh tối đa 5MB'); return; }
		avatarCropSrc = URL.createObjectURL(file);
		showAvatarCrop = true;
		input.value = '';
	}

	async function handleCroppedAvatarUpload(blob: Blob) {
		avatarUploading = true;
		showAvatarCrop = false;
		try {
			const file = new File([blob], 'avatar.webp', { type: 'image/webp' });
			const formData = new FormData();
			formData.append('avatar', file);
			const res = await apiUpload<{ url: string }>('/upload/avatar', formData);
			if (res.success && res.data?.url) profile = { ...profile, avatar: res.data.url };
		} catch {}
		avatarUploading = false;
		avatarCropSrc = '';
	}

	function timeAgo(d: string) {
		const diff = Date.now() - new Date(d).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		return `${Math.floor(h / 24)}d ago`;
	}
</script>

<svelte:head><title>{profile?.name || 'Profile'} — Selorson</title></svelte:head>

<section class="profile-page">
	{#if loading}
		<div class="loading">Đang tải...</div>
	{:else if !profile}
		<div class="empty"><h3>Không tìm thấy người dùng</h3></div>
	{:else}
		<div class="cover-area">
			{#if profile.cover_image}
				<img src={profile.cover_image} alt="Cover" class="cover-img" style="object-position:center {profile.cover_position || 50}%" />
			{:else}
				<div class="cover-img default-cover"></div>
			{/if}
		</div>

		<div class="profile-container">
			<div class="profile-header">
				<div class="header-top">
					<div class="avatar-wrapper">
						<div class="avatar-ring">
							<div class="avatar">
								{#if profile.avatar}
									<img src={profile.avatar} alt={profile.name} />
								{:else}
									<div class="avatar-ph">{profile.name?.charAt(0).toUpperCase()}</div>
								{/if}
							</div>
						</div>
						{#if isSelf}
							<label class="avatar-upload-btn" title="Đổi avatar">
								<input type="file" accept="image/*" onchange={onAvatarFileSelected} hidden />
								{avatarUploading ? '⏳' : '📷'}
							</label>
						{:else}
							<span class="online-dot" class:online={profile.is_online}></span>
						{/if}
					</div>

					<div class="actions-wrapper">
						{#if !isSelf && isAuthenticated()}
							{@const status = getStatus(profile.id)}
							<div class="actions">
								<button class="action-btn message" onclick={() => openChatWithUser(profile.id)}>💬 Nhắn tin</button>
								<button class="action-btn follow" class:following={status?.is_following} onclick={handleFollow}>
									{status?.is_following ? 'Đang theo dõi' : 'Theo dõi'}
								</button>
								<div class="more-actions">
									<button class="action-btn more-btn" onclick={() => showActions = !showActions}>⋮</button>
									{#if showActions}
										<div class="actions-dropdown">
											<button onclick={handleBlock}>{status?.is_blocked ? '✅ Bỏ chặn' : '🚫 Chặn'}</button>
											<button onclick={() => { showReport = true; showActions = false; }}>⚠️ Báo cáo</button>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div class="header-info">
					<div class="name-row">
						<h1>{profile.nickname || profile.name}</h1>
						{#if profile.role !== 'user'}
							<span class="role-badge">{profile.role}</span>
						{/if}
					</div>
					<span class="username">@{profile.username}</span>

					{#if profile.biography}
						<p class="bio">{profile.biography}</p>
					{/if}

					<div class="meta-row">
						<button class="stat-btn">
							<strong>{profile.followers_count || 0}</strong> <span class="stat-label">người theo dõi</span>
						</button>
						<button class="stat-btn">
							<strong>{profile.following_count || 0}</strong> <span class="stat-label">đang theo dõi</span>
						</button>
						<span class="stat-item join-date">
							📅 Đã tham gia {new Date(profile.created_at).toLocaleDateString('vi-VN')}
						</span>
					</div>
				</div>

				<!-- Tabs -->
				<div class="tabs-nav">
					<button class="tab-btn" class:active={activeTab === 'about'} onclick={() => switchTab('about')}>
						<span class="tab-icon">📋</span> <span class="tab-text">Tổng quan</span>
						{#if activeTab === 'about'}<span class="tab-indicator"></span>{/if}
					</button>
					<button class="tab-btn" class:active={activeTab === 'activity'} onclick={() => switchTab('activity')}>
						<span class="tab-icon">⚡</span> <span class="tab-text">Hoạt động</span>
						{#if activeTab === 'activity'}<span class="tab-indicator"></span>{/if}
					</button>
					{#if isSelf}
						<button class="tab-btn" class:active={activeTab === 'settings'} onclick={() => switchTab('settings')}>
							<span class="tab-icon">⚙️</span> <span class="tab-text">Cài đặt</span>
							{#if activeTab === 'settings'}<span class="tab-indicator"></span>{/if}
						</button>
					{/if}
				</div>
			</div>

			<div class="tab-content">
				{#if activeTab === 'about'}
					<div class="glass-card inner-content">
						<div class="detail-grid">
							{#if profile.hobbies}
								<div class="detail"><span class="detail-label">🎮 Sở thích</span><p>{profile.hobbies}</p></div>
							{/if}
							{#if profile.gender}
								<div class="detail"><span class="detail-label">👤 Giới tính</span><p>{profile.gender === 'male' ? 'Nam' : profile.gender === 'female' ? 'Nữ' : 'Khác'}</p></div>
							{/if}
						</div>
						{#if !profile.hobbies && !profile.gender}
							<p class="no-info">Chưa có thông tin bổ sung</p>
						{/if}
					</div>
				{:else if activeTab === 'activity'}
					<div class="glass-card inner-content">
						{#if !activity}
							<p class="no-info">Đang tải...</p>
						{:else if activity.comments?.length === 0 && activity.reading_progress?.length === 0}
							<p class="no-info">Chưa có hoạt động gần đây</p>
						{:else}
							{#if activity.comments?.length > 0}
								<h4>💬 Bình luận gần đây</h4>
								{#each activity.comments as c}
									<div class="activity-item">
										<p>"{c.content}"</p>
										<span class="activity-meta">{c.target_type} · {timeAgo(c.created_at)}</span>
									</div>
								{/each}
							{/if}
							{#if activity.reading_progress?.length > 0}
								<h4 style="margin-top:1rem">📖 Đang đọc</h4>
								{#each activity.reading_progress as p}
									<div class="activity-item">
										<p>Chapter #{p.chapter_id} — Vị trí: {p.position}</p>
										<span class="activity-meta">{timeAgo(p.updated_at)}</span>
									</div>
								{/each}
							{/if}
						{/if}
					</div>
				{:else if activeTab === 'settings'}
					<ProfileSettings />
				{/if}
			</div>
		</div>

		<!-- Report Modal -->
		{#if showReport}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal-overlay" onmousedown={() => showReport = false}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="modal-card" onmousedown={(e) => e.stopPropagation()}>
					<h3>🚩 Báo cáo người dùng</h3>
					<select bind:value={reportReason}>
						<option value="">-- Chọn lý do --</option>
						<option value="spam">Spam</option>
						<option value="harassment">Quấy rối</option>
						<option value="inappropriate">Nội dung không phù hợp</option>
						<option value="other">Khác</option>
					</select>
					<div class="modal-actions">
						<button class="btn-ghost-sm" onclick={() => showReport = false}>Hủy</button>
						<button class="btn-danger-sm" onclick={handleReport} disabled={!reportReason}>Gửi báo cáo</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</section>

{#if showAvatarCrop}
	<ImageCropper imageSrc={avatarCropSrc} aspectRatio={1} onCrop={handleCroppedAvatarUpload} onCancel={() => { showAvatarCrop = false; avatarCropSrc = ''; }} />
{/if}

<style>
	.profile-page { min-height: 70vh; }
	.loading, .empty { text-align: center; padding: 4rem; color: var(--color-text-muted); }

	/* Cover */
	.cover-area { position: relative; height: 320px; overflow: hidden; width: 100%; }
	.cover-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
	.cover-area:hover .cover-img { transform: scale(1.02); }
	.default-cover { background: linear-gradient(135deg, #0c713d 0%, #064e2b 40%, #1a1a2e 100%); }

	/* Container */
	.profile-container { max-width: 960px; margin: 0 auto; position: relative; z-index: 10; }

	/* Header */
	.profile-header { padding: 0 1.5rem; }
	.header-top { display: flex; justify-content: space-between; align-items: flex-end; margin-top: -70px; margin-bottom: 1rem; }

	/* Avatar */
	.avatar-wrapper { position: relative; }
	.avatar-ring { padding: 6px; border-radius: 50%; background: var(--color-surface-50); display: inline-block; }
	.avatar { width: 140px; height: 140px; border-radius: 50%; border: 4px solid var(--color-surface-100); overflow: hidden; background: var(--color-surface-200); display: flex; align-items: center; justify-content: center; }
	.avatar img { width: 100%; height: 100%; object-fit: cover; }
	.avatar-ph { font-size: 3rem; font-weight: 800; color: var(--color-brand-400); }

	.online-dot { position: absolute; bottom: 15px; right: 15px; width: 20px; height: 20px; border-radius: 50%; background: #64748b; border: 4px solid var(--color-surface-50); }
	.online-dot.online { background: #22c55e; }

	.avatar-upload-btn { position: absolute; bottom: 15px; right: -5px; width: 32px; height: 32px; border-radius: 50%; background: var(--color-surface-200); border: 2px solid var(--color-surface-50); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
	.avatar-upload-btn:hover { background: var(--color-brand-500); transform: scale(1.1); color: #fff; }

	/* Actions */
	.actions-wrapper { margin-bottom: 0.5rem; }
	.actions { display: flex; gap: 0.75rem; }
	.action-btn { padding: 0.625rem 1.5rem; border-radius: 2rem; font-weight: 600; font-size: 0.9375rem; cursor: pointer; transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 0.375rem; font-family: inherit; }
	.action-btn.follow { background: var(--color-brand-500); color: #fff; border: none; }
	.action-btn.follow:hover { background: var(--color-brand-600); transform: translateY(-1px); }
	.action-btn.follow.following { background: transparent; color: var(--color-brand-400); border: 1px solid var(--color-brand-500); }
	.action-btn.message { background: var(--color-surface-200); color: var(--color-text-primary); text-decoration: none; }
	.action-btn.message:hover { background: var(--color-surface-300); }
	:global(html[data-theme='light']) .action-btn { border-color: #e2e8f0; }
	:global(html[data-theme='light']) .action-btn.message { background: #fff; color: #334155; }
	:global(html[data-theme='light']) .action-btn.message:hover { background: #f1f5f9; }

	.more-actions { position: relative; }
	.more-btn { width: 40px; padding: 0 !important; justify-content: center; font-size: 1.25rem; font-weight: 700; background: var(--color-surface-200); color: var(--color-text-secondary); }
	.more-btn:hover { background: var(--color-surface-300); }

	.actions-dropdown { position: absolute; top: calc(100% + 6px); right: 0; background: var(--color-surface-100); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 0.35rem; min-width: 150px; z-index: 50; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
	.actions-dropdown button { display: block; width: 100%; text-align: left; padding: 0.75rem 1rem; background: none; border: none; color: var(--color-text-secondary); cursor: pointer; font-size: 0.875rem; border-radius: 0.5rem; font-weight: 500; transition: background 0.15s; }
	.actions-dropdown button:hover { background: rgba(255,255,255,0.05); color: var(--color-text-primary); }
	:global(html[data-theme='light']) .actions-dropdown { background: #fff; border-color: #e2e8f0; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
	:global(html[data-theme='light']) .actions-dropdown button:hover { background: #f8fafc; }

	/* Info */
	.header-info { padding-top: 0; }
	.name-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.name-row h1 { font-size: 1.875rem; font-weight: 800; margin: 0; color: var(--color-text-primary); }
	.username { color: var(--color-text-muted); font-size: 1.0625rem; font-weight: 500; display: block; margin-top: 0.25rem; }
	.role-badge { padding: 0.125rem 0.625rem; background: linear-gradient(135deg, #ffd700, #ffaa00); color: #0c713d; border-radius: 1rem; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
	.bio { color: var(--color-text-secondary); line-height: 1.6; margin: 1rem 0 0; max-width: 600px; font-size: 0.9375rem; }

	.meta-row { display: flex; align-items: center; gap: 1.5rem; margin-top: 1rem; flex-wrap: wrap; }
	.stat-btn { background: none; border: none; font-size: 0.9375rem; color: var(--color-text-primary); padding: 0; display: flex; gap: 0.375rem; align-items: center; }
	.stat-btn strong { font-weight: 700; color: var(--color-brand-400); }
	.stat-label { color: var(--color-text-muted); font-weight: 400; }
	.stat-item { font-size: 0.9375rem; color: var(--color-text-muted); display: flex; align-items: center; gap: 0.375rem; }

	/* Tabs Nav */
	.tabs-nav { display: flex; gap: 1.5rem; margin-top: 2rem; border-bottom: 1px solid rgba(255,255,255,0.06); overflow-x: auto; }
	:global(html[data-theme='light']) .tabs-nav { border-bottom-color: #e2e8f0; }
	.tab-btn { display: flex; align-items: center; gap: 0.5rem; padding: 1rem 0; border: none; background: transparent; color: var(--color-text-muted); font-size: 1rem; font-weight: 600; cursor: pointer; position: relative; transition: color 0.2s; white-space: nowrap; font-family: inherit; }
	.tab-btn:hover { color: var(--color-text-primary); }
	.tab-btn.active { color: var(--color-brand-400); }
	.tab-indicator { position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--color-brand-500); border-top-left-radius: 3px; border-top-right-radius: 3px; }

	/* Tab Content */
	.tab-content { padding: 1.5rem; margin-bottom: 3rem; }
	.inner-content { padding: 1.5rem; }
	.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	.detail-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 0.25rem; display: block; }
	.detail p { font-size: 0.9rem; color: var(--color-text-secondary); margin: 0; }
	.no-info { text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 1rem; margin: 0; }

	.activity-item { padding: 0.75rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
	.activity-item p { font-size: 0.85rem; color: var(--color-text-secondary); margin: 0 0 0.25rem; }
	.activity-meta { font-size: 0.72rem; color: var(--color-text-muted); }
	h4 { font-size: 0.9rem; font-weight: 600; margin: 0 0 0.5rem; color: var(--color-text-primary); }

	/* Modals */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; }
	.modal-card { background: var(--color-surface-100); border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem; padding: 1.5rem; max-width: 400px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	:global(html[data-theme='light']) .modal-card { background: #fff; border-color: #e2e8f0; }
	.modal-card h3 { margin: 0 0 1rem; font-size: 1.125rem; }
	.modal-card select { width: 100%; padding: 0.625rem; background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.5rem; color: var(--color-text-primary); font-family: inherit; margin-bottom: 1rem; }
	:global(html[data-theme='light']) .modal-card select { background: #f8fafc; border-color: #e2e8f0; }
	.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
	.btn-ghost-sm { padding: 0.5rem 1rem; background: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 0.5rem; color: var(--color-text-secondary); cursor: pointer; font-family: inherit; font-weight: 500; }
	.btn-danger-sm { padding: 0.5rem 1rem; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 0.5rem; color: #f87171; cursor: pointer; font-family: inherit; font-weight: 600; }
	.btn-danger-sm:disabled { opacity: 0.4; cursor: not-allowed; }
	:global(html[data-theme='light']) .btn-ghost-sm { border-color: #e2e8f0; color: #64748b; }

	@media (max-width: 640px) {
		.cover-area { height: 180px; }
		.header-top { margin-top: -50px; flex-direction: column; align-items: center; gap: 1rem; }
		.avatar { width: 100px; height: 100px; }
		.avatar-ring { padding: 4px; }
		.name-row { justify-content: center; }
		.name-row h1 { font-size: 1.5rem; }
		.header-info { text-align: center; }
		.meta-row { justify-content: center; flex-direction: column; gap: 0.75rem; }
		.actions-wrapper { width: 100%; display: flex; justify-content: center; }
		.tabs-nav { gap: 1rem; justify-content: center; }
	}
</style>
