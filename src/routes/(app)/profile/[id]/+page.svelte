<script lang="ts">
	import { api, apiUpload } from '$lib/api';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getUser, isAuthenticated } from '$lib/stores/auth.svelte';
	import {
		fetchStatus,
		getStatus,
		toggleBlock,
		toggleFollow,
		reportUser,
		fetchFollowers,
		fetchFollowing
	} from '$lib/stores/social.svelte';
	import { openChatWithUser } from '$lib/stores/chat.svelte';
	import { playTrack } from '$lib/stores/audio.svelte';
	import ProfileSettings from '$lib/components/profile/ProfileSettings.svelte';
	import ImageCropper from '$lib/components/ui/ImageCropper.svelte';
	import * as m from '$lib/paraglide/messages';
	import { dateLocale, formatRoleBadge, formatReaderRank } from '$lib/i18n-labels';

	let { data }: { data: { profile: any | null } } = $props();
	let profile = $state<any | null>(null);
	let loading = $state(false);
	let isSelf = $derived(getUser()?.id != null && profile?.id != null && Number(getUser()?.id) === Number(profile?.id));
	let avatarUploading = $state(false);
	let coverUploading = $state(false);
	let activeTab = $state<'about' | 'activity' | 'settings'>('about');
	let activity = $state<any>(null);
	let activityLoading = $state(false);
	let showReport = $state(false);
	let reportReason = $state('');
	let reportDescription = $state('');
	let reportNotice = $state('');
	let showActions = $state(false);
	let avatarCropSrc = $state('');
	let showAvatarCrop = $state(false);

	// Followers / Following Modal state
	let followModalType = $state<'followers' | 'following' | null>(null);
	let followModalUsers = $state<any[]>([]);
	let followModalLoading = $state(false);

	let lastLoadedKey = $state<string>('');

	$effect(() => {
		const routeKey = page.params.id || '';
		if (data.profile && (String(data.profile.id) === routeKey || data.profile.username === routeKey)) {
			profile = data.profile;
		}
		if (routeKey && routeKey !== lastLoadedKey) {
			lastLoadedKey = routeKey;
			activeTab = 'about';
			activity = null;
			followModalType = null;
			hydrateProfile(routeKey);
		}
	});

	async function hydrateProfile(key: string) {
		loading = !profile;
		try {
			const profRes = await api<any>(`/profile/${encodeURIComponent(key)}`);
			if (profRes?.data) {
				profile = profRes.data;
			}
		} catch {
			if (!profile) profile = null;
		} finally {
			loading = false;
		}

		if (profile?.id) {
			if (isAuthenticated() && Number(getUser()?.id) !== Number(profile.id)) {
				try {
					await fetchStatus(Number(profile.id));
				} catch {}
			}
			loadActivity(profile.id);
		}
	}

	async function handleFollow() {
		if (!profile) return;
		const res = await toggleFollow(profile.id);
		if (res && !res.success && res.message) {
			alert(res.message);
			return;
		}
		const r = await api<any>(`/profile/${profile.id}`);
		if (r?.data) profile = r.data;
	}

	async function handleBlock() {
		if (!profile) return;
		showActions = false;
		await toggleBlock(profile.id);
		const r = await api<any>(`/profile/${profile.id}`);
		if (r?.data) profile = r.data;
	}

	async function handleReport() {
		if (!profile || !reportReason.trim()) return;
		const res = await reportUser(profile.id, reportReason, reportDescription.trim() || undefined);
		reportNotice = res?.message || m.uprofile_report_submitted();
		setTimeout(() => {
			showReport = false;
			reportReason = '';
			reportDescription = '';
			reportNotice = '';
		}, 1200);
	}

	async function loadActivity(targetId = profile?.id) {
		if (!targetId) return;
		activityLoading = true;
		try {
			const r = await api<any>(`/profile/${targetId}/activity`);
			if (r?.data) activity = r.data;
		} catch {
			activity = { comments: [], reading_progress: [], favorite_tracks: [], world_visits: [] };
		} finally {
			activityLoading = false;
		}
	}

	function switchTab(tab: 'about' | 'activity' | 'settings') {
		activeTab = tab;
		if (tab === 'activity' && !activity) loadActivity();
	}

	async function openFollowModal(kind: 'followers' | 'following') {
		if (!profile?.id) return;
		followModalType = kind;
		followModalLoading = true;
		followModalUsers = [];
		try {
			const res = kind === 'followers' ? await fetchFollowers(profile.id) : await fetchFollowing(profile.id);
			if (res?.success && Array.isArray(res.data?.users)) {
				followModalUsers = res.data.users;
			}
		} catch {
			followModalUsers = [];
		} finally {
			followModalLoading = false;
		}
	}

	function onAvatarFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 5 * 1024 * 1024) {
			alert(m.profile_err_avatar_size());
			return;
		}
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

	async function onCoverFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > 8 * 1024 * 1024) {
			alert(m.uprofile_cover_image_must_be_under());
			return;
		}
		coverUploading = true;
		try {
			const formData = new FormData();
			formData.append('cover', file);
			const res = await apiUpload<{ url: string }>('/upload/cover', formData);
			if (res.success && res.data?.url) {
				profile = { ...profile, cover_image: res.data.url };
			}
		} catch {}
		coverUploading = false;
		input.value = '';
	}

	function timeAgo(d: string) {
		const diff = Date.now() - new Date(d).getTime();
		const mins = Math.max(1, Math.floor(diff / 60000));
		if (mins < 60) return m.profile_time_ago_m({ m: mins });
		const h = Math.floor(mins / 60);
		if (h < 24) return m.profile_time_ago_h({ h });
		return m.profile_time_ago_d({ d: Math.floor(h / 24) });
	}
</script>

<svelte:head><title>{profile?.name || 'Profile'} — Selorson</title></svelte:head>

<section class="profile-page">
	{#if loading && !profile}
		<div class="loading">{m.profile_loading()}</div>
	{:else if !profile}
		<div class="empty"><h3>{m.profile_not_found()}</h3></div>
	{:else}
		{@const stats = profile.stats || {}}
		{@const status = getStatus(profile.id)}
		<div class="cover-area">
			{#if profile.cover_image}
				<img src={profile.cover_image} alt="Cover" class="cover-img" style="object-position:center {profile.cover_position || 50}%" />
			{:else}
				<div class="cover-img default-cover"></div>
			{/if}
			{#if isSelf}
				<label class="cover-upload-btn" title={m.uprofile_change_profile_cover()}>
					<input type="file" accept="image/*" onchange={onCoverFileSelected} hidden />
					{coverUploading ? m.uprofile_uploading() : m.uprofile_change_cover()}
				</label>
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
							<label class="avatar-upload-btn" title={m.profile_change_avatar()}>
								<input type="file" accept="image/*" onchange={onAvatarFileSelected} hidden />
								{avatarUploading ? '⏳' : '📷'}
							</label>
						{:else}
							<span class="online-dot" class:online={profile.is_online} title={profile.is_online ? m.ui_online() : m.uprofile_offline()}></span>
						{/if}
					</div>

					<div class="actions-wrapper">
						{#if !isSelf && isAuthenticated()}
							<div class="actions">
								{#if !profile.blocked_relation && !status?.is_blocked && !status?.is_blocked_by}
									<button class="action-btn message" onclick={() => openChatWithUser(profile.id)}>
										{m.profile_btn_message()}
									</button>
									<button class="action-btn follow" class:following={status?.is_following} onclick={handleFollow}>
										{status?.is_following ? `✓ ${m.profile_btn_following()}` : `+ ${m.profile_btn_follow()}`}
									</button>
								{/if}
								<div class="more-actions">
									<button class="action-btn more-btn" onclick={() => (showActions = !showActions)} aria-label={m.uprofile_options()}>⋮</button>
									{#if showActions}
										<div class="actions-dropdown">
											<button onclick={handleBlock}>
												{status?.is_blocked || profile.is_blocked ? m.profile_btn_unblock() : m.profile_btn_block()}
											</button>
											<button onclick={() => { showReport = true; showActions = false; }}>
												{m.profile_btn_report()}
											</button>
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
						{#if profile.role && profile.role !== 'user'}
							<span class="role-badge">{formatRoleBadge(profile.role, true)}</span>
						{:else if stats.reader_rank || stats.reader_title}
							<span class="rank-badge">✨ {formatReaderRank(stats.reader_rank || stats.reader_title, profile.role)}</span>
						{/if}
					</div>
					<span class="username">
						@{profile.username}
						{#if profile.nickname && profile.name && profile.nickname !== profile.name}
							· {profile.name}
						{/if}
					</span>

					{#if profile.blocked_relation}
						<div class="privacy-banner blocked">
							{m.uprofile_this_profile_is_restricted_due()}
						</div>
					{:else if profile.private_account && !isSelf}
						<div class="privacy-banner">
							🔒 {m.uprofile_this_account_is_set_to()} <strong>{m.uprofile_private()}</strong>. {m.uprofile_only_basic_information_is_shown()}
						</div>
					{:else if profile.biography}
						<p class="bio">{profile.biography}</p>
					{/if}

					<div class="meta-row">
						<button class="stat-btn clickable" onclick={() => openFollowModal('followers')}>
							<strong>{profile.followers_count || 0}</strong>
							<span class="stat-label">{m.profile_followers()}</span>
						</button>
						<button class="stat-btn clickable" onclick={() => openFollowModal('following')}>
							<strong>{profile.following_count || 0}</strong>
							<span class="stat-label">{m.profile_following()}</span>
						</button>
						{#if profile.created_at}
							<span class="stat-item join-date">
								{m.profile_joined({ date: new Date(profile.created_at).toLocaleDateString(dateLocale()) })}
							</span>
						{/if}
					</div>

					<!-- Reader & Explorer Adventure Showcase Bar -->
					{#if !profile.blocked_relation && (!profile.private_account || isSelf)}
						<div class="showcase-strip">
							<div class="showcase-pill">
								<span class="s-icon">📖</span>
								<div>
									<strong>{stats.chapters_read ?? 0}</strong>
									<span>{m.uprofile_chapters_read()}</span>
								</div>
							</div>
							<div class="showcase-pill">
								<span class="s-icon">🧭</span>
								<div>
									<strong>{stats.world_visited ?? 0}</strong>
									<span>{m.uprofile_3d_places_visited()}</span>
								</div>
							</div>
							<div class="showcase-pill">
								<span class="s-icon">💬</span>
								<div>
									<strong>{stats.comments_count ?? 0}</strong>
									<span>{m.ui_comments()}</span>
								</div>
							</div>
							<div class="showcase-pill">
								<span class="s-icon">🎵</span>
								<div>
									<strong>{stats.favorite_tracks_count ?? 0}</strong>
									<span>{m.uprofile_favorite_tracks()}</span>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Tabs -->
				<div class="tabs-nav">
					<button class="tab-btn" class:active={activeTab === 'about'} onclick={() => switchTab('about')}>
						<span class="tab-icon">📋</span> <span class="tab-text">{m.profile_tab_about()}</span>
						{#if activeTab === 'about'}<span class="tab-indicator"></span>{/if}
					</button>
					<button class="tab-btn" class:active={activeTab === 'activity'} onclick={() => switchTab('activity')}>
						<span class="tab-icon">⚡</span> <span class="tab-text">{m.profile_tab_activity()}</span>
						{#if activeTab === 'activity'}<span class="tab-indicator"></span>{/if}
					</button>
					{#if isSelf}
						<button class="tab-btn" class:active={activeTab === 'settings'} onclick={() => switchTab('settings')}>
							<span class="tab-icon">⚙️</span> <span class="tab-text">{m.profile_tab_settings()}</span>
							{#if activeTab === 'settings'}<span class="tab-indicator"></span>{/if}
						</button>
					{/if}
				</div>
			</div>

			<div class="tab-content">
				{#if activeTab === 'about'}
					<div class="about-stack">
						<div class="glass-card inner-content">
							<h4 class="section-heading">{m.uprofile_reader_information()}</h4>
							{#if profile.blocked_relation}
								<p class="no-info">{m.uprofile_detailed_information_is_unavailable()}</p>
							{:else}
								<div class="detail-grid">
									{#if profile.occupation}
										<div class="detail">
											<span class="detail-label">💼 {m.uprofile_occupation_role()}</span>
											<p>{profile.occupation}</p>
										</div>
									{/if}
									{#if profile.hobbies}
										<div class="detail">
											<span class="detail-label">{m.profile_hobbies()}</span>
											<p>{profile.hobbies}</p>
										</div>
									{/if}
									{#if profile.gender}
										<div class="detail">
											<span class="detail-label">{m.profile_gender()}</span>
											<p>
												{profile.gender === 'male'
													? m.profile_gender_male()
													: profile.gender === 'female'
														? m.profile_gender_female()
														: m.profile_gender_other()}
											</p>
										</div>
									{/if}
									{#if profile.birthday}
										<div class="detail">
											<span class="detail-label">🎂 {m.settings_label_birthday()}</span>
											<p>{profile.birthday}</p>
										</div>
									{/if}
									{#if profile.address}
										<div class="detail">
											<span class="detail-label">📍 {m.uprofile_location()}</span>
											<p>{profile.address}</p>
										</div>
									{/if}
									{#if profile.email}
										<div class="detail">
											<span class="detail-label">✉️ {m.uprofile_contact_email()}</span>
											<p>{profile.email}</p>
										</div>
									{/if}
									{#if profile.phone_number}
										<div class="detail">
											<span class="detail-label">📞 {m.uprofile_phone()}</span>
											<p>{profile.phone_number}</p>
										</div>
									{/if}
								</div>
								{#if !profile.occupation && !profile.hobbies && !profile.gender && !profile.birthday && !profile.address && !profile.email && !profile.phone_number}
									<p class="no-info">{m.profile_no_info()}</p>
								{/if}
							{/if}
						</div>

						{#if activity?.world_visits?.length > 0}
							<div class="glass-card inner-content">
								<h4 class="section-heading">{m.uprofile_3d_world_exploration_footprints()}</h4>
								<div class="badge-chips">
									{#each activity.world_visits as w}
										<a href={w.target_url || `/world?focus=${w.id || w.location_id}`} class="world-chip">
											<span class="chip-icon">🪐</span>
											<div>
												<strong>{w.name || `${m.cat_location()} #${w.location_id || w.id}`}</strong>
												{#if w.terrain || w.visit_count}
													<small>
														{w.terrain ? `${w.terrain} · ` : ''}{w.visit_count ? `${w.visit_count} ${m.uprofile_visits()}` : ''}{w.visited_at ? ` · ${timeAgo(w.visited_at)}` : ''}
													</small>
												{:else if w.visited_at}
													<small>{timeAgo(w.visited_at)}</small>
												{/if}
											</div>
										</a>
									{/each}
								</div>
							</div>
						{/if}

						{#if activity?.favorite_tracks?.length > 0}
							<div class="glass-card inner-content">
								<h4 class="section-heading">{m.uprofile_favorite_melodies()}</h4>
								<div class="tracks-grid">
									{#each activity.favorite_tracks as t}
										<a
											href={t.target_url || `/music?track=${t.id}`}
											class="track-pill"
											onclick={(e) => {
												if (t.file_path) {
													e.preventDefault();
													playTrack(t, activity.favorite_tracks, true);
												}
											}}
											title={m.uprofile_click_to_play_now_or()}
										>
											<span class="track-icon">▶</span>
											<div class="track-meta">
												<strong>{t.title}</strong>
												{#if t.artist}
													<span>{t.artist}</span>
												{/if}
											</div>
										</a>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{:else if activeTab === 'activity'}
					<div class="glass-card inner-content">
						{#if activityLoading && !activity}
							<p class="no-info">{m.profile_loading()}</p>
						{:else if !activity || (activity.comments?.length === 0 && activity.reading_progress?.length === 0 && (!activity.watch_progress || activity.watch_progress.length === 0) && (!activity.world_visits || activity.world_visits.length === 0))}
							<p class="no-info">{m.profile_no_activity()}</p>
						{:else}
							{#if activity.reading_progress?.length > 0}
								<h4 class="section-heading">{m.uprofile_recent_reading_progress()}</h4>
								<div class="activity-list">
									{#each activity.reading_progress as p}
										<a href={p.target_url || `/stories/${p.chapter_number || p.chapter_id}`} class="activity-card">
											<div class="act-main">
												<strong>
													{m.world_chapter()} {p.chapter_number ?? p.chapter_id}{p.chapter_title ? `: ${p.chapter_title}` : ''}
												</strong>
												<span class="act-badge">
													{p.is_completed ? m.uprofile_completed() : `${m.uprofile_read()} ${Math.round(p.scroll_percent || p.position || 0)}%`}
												</span>
											</div>
											{#if p.updated_at}
												<span class="activity-meta">{timeAgo(p.updated_at)}</span>
											{/if}
										</a>
									{/each}
								</div>
							{/if}

							{#if activity.watch_progress?.length > 0}
								<h4 class="section-heading" style="margin-top:1.5rem">{m.uprofile_recently_watched_episodes()}</h4>
								<div class="activity-list">
									{#each activity.watch_progress as wp}
										<a href={wp.target_url || `/videos?ep=${wp.video_id}`} class="activity-card">
											<div class="act-main">
												<strong>
													{wp.episode_number ? `${m.uprofile_ep()} ${wp.episode_number}: ` : ''}{wp.video_name || `Video #${wp.video_id}`}
												</strong>
												<span class="act-badge">
													{wp.completed ? m.uprofile_watched() : `${m.uprofile_watching()} (${wp.last_position || 0}s)`}
												</span>
											</div>
											{#if wp.updated_at}
												<span class="activity-meta">{timeAgo(wp.updated_at)}</span>
											{/if}
										</a>
									{/each}
								</div>
							{/if}

							{#if activity.comments?.length > 0}
								<h4 class="section-heading" style="margin-top:1.5rem">{m.profile_recent_comments()}</h4>
								<div class="activity-list">
									{#each activity.comments as c}
										<a href={c.target_url || '#'} class="activity-card">
											<p class="comment-quote">"{c.content}"</p>
											<div class="act-footer">
												<span class="act-target">📍 {c.target_title || c.target_type}</span>
												<span class="activity-meta">{timeAgo(c.created_at)}</span>
											</div>
										</a>
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				{:else if activeTab === 'settings'}
					<ProfileSettings onProfileSaved={(updated) => (profile = { ...profile, ...updated })} />
				{/if}
			</div>
		</div>

		<!-- Followers / Following Modal -->
		{#if followModalType}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal-overlay" onmousedown={() => (followModalType = null)}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="modal-card follow-modal" onmousedown={(e) => e.stopPropagation()}>
					<div class="modal-head">
						<h3>{followModalType === 'followers' ? `${m.profile_followers()} (${profile.followers_count || 0})` : `${m.profile_following()} (${profile.following_count || 0})`}</h3>
						<button class="close-x" onclick={() => (followModalType = null)}>✕</button>
					</div>
					{#if followModalLoading}
						<p class="no-info">{m.profile_loading()}</p>
					{:else if followModalUsers.length === 0}
						<p class="no-info">{m.uprofile_no_members_in_this_list()}</p>
					{:else}
						<div class="follow-user-list">
							{#each followModalUsers as u (u.id)}
								<button
									class="follow-user-row"
									onclick={() => {
										followModalType = null;
										goto(`/profile/${u.id}`);
									}}
								>
									<div class="f-avatar-wrap">
										{#if u.avatar}
											<img src={u.avatar} alt={u.name} class="f-avatar" />
										{:else}
											<div class="f-avatar-ph">{(u.name || u.username || 'U')[0].toUpperCase()}</div>
										{/if}
										{#if u.is_online}
											<span class="f-online"></span>
										{/if}
									</div>
									<div class="f-info">
										<div class="f-name-line">
											<strong>{u.nickname || u.name}</strong>
											<span>@{u.username}</span>
										</div>
										{#if u.biography}
											<p class="f-bio">{u.biography}</p>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Report Modal -->
		{#if showReport}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal-overlay" onmousedown={() => (showReport = false)}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="modal-card" onmousedown={(e) => e.stopPropagation()}>
					<h3>{m.profile_report_title()}</h3>
					<select bind:value={reportReason}>
						<option value="">{m.profile_report_reason_select()}</option>
						<option value="spam">{m.profile_report_reason_spam()}</option>
						<option value="harassment">{m.profile_report_reason_harass()}</option>
						<option value="inappropriate">{m.profile_report_reason_inapp()}</option>
						<option value="other">{m.profile_report_reason_other()}</option>
					</select>
					<textarea
						class="report-textarea"
						rows="3"
						maxlength="500"
						placeholder={m.uprofile_describe_the_violation_in_detail()}
						bind:value={reportDescription}
					></textarea>
					{#if reportNotice}
						<p class="report-feedback">{reportNotice}</p>
					{/if}
					<div class="modal-actions">
						<button class="btn-ghost-sm" onclick={() => (showReport = false)}>{m.profile_report_cancel()}</button>
						<button class="btn-danger-sm" onclick={handleReport} disabled={!reportReason}>{m.profile_report_submit()}</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</section>

{#if showAvatarCrop}
	<ImageCropper
		imageSrc={avatarCropSrc}
		aspectRatio={1}
		onCrop={handleCroppedAvatarUpload}
		onCancel={() => {
			showAvatarCrop = false;
			avatarCropSrc = '';
		}}
	/>
{/if}

<style>
	.profile-page { min-height: 70vh; }
	.loading, .empty { text-align: center; padding: 4rem; color: var(--color-text-muted); }

	/* Cover */
	.cover-area { position: relative; height: 300px; overflow: hidden; width: 100%; }
	.cover-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
	.cover-area:hover .cover-img { transform: scale(1.02); }
	.default-cover { background: linear-gradient(135deg, #0c713d 0%, #064e2b 40%, #1a1a2e 100%); }
	.cover-upload-btn {
		position: absolute;
		bottom: 14px;
		right: 18px;
		background: rgba(15, 23, 42, 0.75);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #f8fafc;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.45rem 0.9rem;
		border-radius: 99px;
		cursor: pointer;
		transition: all 0.2s;
	}
	.cover-upload-btn:hover {
		background: rgba(251, 191, 36, 0.88);
		color: #09090b;
		border-color: #fbbf24;
	}

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

	.avatar-upload-btn { position: absolute; bottom: 15px; right: -5px; width: 34px; height: 34px; border-radius: 50%; background: var(--color-surface-200); border: 2px solid var(--color-surface-50); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
	.avatar-upload-btn:hover { background: var(--color-brand-500); transform: scale(1.1); color: #fff; }

	/* Actions */
	.actions-wrapper { margin-bottom: 0.5rem; }
	.actions { display: flex; gap: 0.75rem; }
	.action-btn { padding: 0.625rem 1.35rem; border-radius: 2rem; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 0.375rem; font-family: inherit; }
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

	.actions-dropdown { position: absolute; top: calc(100% + 6px); right: 0; background: var(--color-surface-100); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 0.35rem; min-width: 160px; z-index: 50; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
	.actions-dropdown button { display: block; width: 100%; text-align: left; padding: 0.75rem 1rem; background: none; border: none; color: var(--color-text-secondary); cursor: pointer; font-size: 0.875rem; border-radius: 0.5rem; font-weight: 500; transition: background 0.15s; }
	.actions-dropdown button:hover { background: rgba(255,255,255,0.05); color: var(--color-text-primary); }
	:global(html[data-theme='light']) .actions-dropdown { background: #fff; border-color: #e2e8f0; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
	:global(html[data-theme='light']) .actions-dropdown button:hover { background: #f8fafc; }

	/* Info */
	.header-info { padding-top: 0; }
	.name-row { display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; }
	.name-row h1 { font-size: 1.875rem; font-weight: 800; margin: 0; color: var(--color-text-primary); }
	.username { color: var(--color-text-muted); font-size: 1rem; font-weight: 500; display: block; margin-top: 0.25rem; }
	.role-badge { padding: 0.18rem 0.7rem; background: linear-gradient(135deg, #ffd700, #ffaa00); color: #0c713d; border-radius: 1rem; font-size: 0.72rem; font-weight: 700; }
	.rank-badge {
		padding: 0.2rem 0.75rem;
		background: rgba(251, 191, 36, 0.14);
		border: 1px solid rgba(251, 191, 36, 0.35);
		color: #fbbf24;
		border-radius: 99px;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.bio { color: var(--color-text-secondary); line-height: 1.65; margin: 1rem 0 0; max-width: 680px; font-size: 0.95rem; white-space: pre-line; }

	.privacy-banner {
		margin-top: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: rgba(251, 191, 36, 0.08);
		border: 1px solid rgba(251, 191, 36, 0.25);
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}
	.privacy-banner.blocked {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.28);
		color: #fca5a5;
	}

	.meta-row { display: flex; align-items: center; gap: 1.5rem; margin-top: 1rem; flex-wrap: wrap; }
	.stat-btn { background: none; border: none; font-size: 0.9375rem; color: var(--color-text-primary); padding: 0.25rem 0.5rem; margin-left: -0.5rem; border-radius: 0.5rem; display: flex; gap: 0.375rem; align-items: center; transition: background 0.15s; }
	.stat-btn.clickable { cursor: pointer; }
	.stat-btn.clickable:hover { background: rgba(255, 255, 255, 0.06); }
	.stat-btn strong { font-weight: 700; color: var(--color-brand-400); }
	.stat-label { color: var(--color-text-muted); font-weight: 400; }
	.stat-item { font-size: 0.9rem; color: var(--color-text-muted); display: flex; align-items: center; gap: 0.375rem; }

	/* Adventure Showcase Strip */
	.showcase-strip {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
		margin-top: 1.25rem;
	}
	.showcase-pill {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.85rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.s-icon { font-size: 1.35rem; }
	.showcase-pill div { display: flex; flex-direction: column; }
	.showcase-pill strong { font-size: 1.05rem; font-weight: 700; color: var(--color-text-primary); }
	.showcase-pill span { font-size: 0.75rem; color: var(--color-text-muted); }

	/* Tabs Nav */
	.tabs-nav { display: flex; gap: 1.5rem; margin-top: 1.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); overflow-x: auto; }
	:global(html[data-theme='light']) .tabs-nav { border-bottom-color: #e2e8f0; }
	.tab-btn { display: flex; align-items: center; gap: 0.5rem; padding: 1rem 0; border: none; background: transparent; color: var(--color-text-muted); font-size: 1rem; font-weight: 600; cursor: pointer; position: relative; transition: color 0.2s; white-space: nowrap; font-family: inherit; }
	.tab-btn:hover { color: var(--color-text-primary); }
	.tab-btn.active { color: var(--color-brand-400); }
	.tab-indicator { position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--color-brand-500); border-top-left-radius: 3px; border-top-right-radius: 3px; }

	/* Tab Content */
	.tab-content { padding: clamp(1rem, 3vw, 1.5rem) clamp(0.85rem, 3vw, 1.5rem); margin-bottom: 3rem; }
	.about-stack { display: flex; flex-direction: column; gap: 1.25rem; }
	.inner-content { padding: clamp(1rem, 3vw, 1.5rem); }
	.section-heading { font-size: 0.95rem; font-weight: 700; margin: 0 0 1rem; color: var(--color-text-primary); }
	.detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.1rem; }
	.detail-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 0.25rem; display: block; }
	.detail p { font-size: 0.92rem; color: var(--color-text-secondary); margin: 0; }
	.no-info { text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 1rem; margin: 0; }

	.badge-chips { display: flex; flex-wrap: wrap; gap: 0.65rem; }
	.world-chip {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.9rem;
		border-radius: 0.75rem;
		background: rgba(56, 189, 248, 0.08);
		border: 1px solid rgba(56, 189, 248, 0.22);
		color: var(--color-text-primary);
		text-decoration: none;
		transition: transform 0.15s;
	}
	.world-chip:hover { transform: translateY(-2px); border-color: #38bdf8; }
	.world-chip div { display: flex; flex-direction: column; }
	.world-chip strong { font-size: 0.85rem; }
	.world-chip small { font-size: 0.7rem; color: var(--color-text-muted); }

	.tracks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
	.track-pill {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.65rem 0.9rem;
		border-radius: 0.75rem;
		background: rgba(251, 191, 36, 0.07);
		border: 1px solid rgba(251, 191, 36, 0.2);
		color: var(--color-text-primary);
		text-decoration: none;
		transition: all 0.15s;
	}
	.track-pill:hover { border-color: #fbbf24; transform: translateY(-1px); }
	.track-meta { display: flex; flex-direction: column; overflow: hidden; }
	.track-meta strong { font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.track-meta span { font-size: 0.72rem; color: var(--color-text-muted); }

	.activity-list { display: flex; flex-direction: column; gap: 0.65rem; }
	.activity-card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.85rem 1rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.06);
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, background 0.15s;
	}
	.activity-card:hover {
		border-color: rgba(251, 191, 36, 0.35);
		background: rgba(255, 255, 255, 0.04);
	}
	.act-main { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.act-main strong { font-size: 0.9rem; color: var(--color-text-primary); }
	.act-badge { font-size: 0.75rem; color: #fbbf24; background: rgba(251, 191, 36, 0.12); padding: 0.15rem 0.55rem; border-radius: 99px; }
	.comment-quote { font-size: 0.88rem; color: var(--color-text-secondary); margin: 0; font-style: italic; }
	.act-footer { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
	.act-target { font-size: 0.76rem; color: var(--color-brand-400); font-weight: 500; }
	.activity-meta { font-size: 0.72rem; color: var(--color-text-muted); }

	/* Modals */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem; }
	.modal-card { background: var(--color-surface-100); border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem; padding: 1.5rem; max-width: 440px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
	.follow-modal { max-height: 75vh; display: flex; flex-direction: column; }
	.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
	.modal-head h3 { margin: 0; font-size: 1.05rem; }
	.close-x { background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 1.1rem; }
	.follow-user-list { overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; }
	.follow-user-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.65rem;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		color: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.follow-user-row:hover { border-color: rgba(251, 191, 36, 0.4); }
	.f-avatar-wrap { position: relative; flex-shrink: 0; }
	.f-avatar, .f-avatar-ph { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
	.f-avatar-ph { background: rgba(251, 191, 36, 0.2); color: #fbbf24; display: flex; align-items: center; justify-content: center; font-weight: 700; }
	.f-online { position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; border: 2px solid var(--color-surface-100); }
	.f-info { flex: 1; min-width: 0; }
	.f-name-line { display: flex; align-items: center; gap: 0.4rem; }
	.f-name-line strong { font-size: 0.88rem; color: var(--color-text-primary); }
	.f-name-line span { font-size: 0.75rem; color: var(--color-text-muted); }
	.f-bio { font-size: 0.76rem; color: var(--color-text-secondary); margin: 2px 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	:global(html[data-theme='light']) .modal-card { background: #fff; border-color: #e2e8f0; }
	.modal-card h3 { margin: 0 0 1rem; font-size: 1.125rem; }
	.modal-card select, .report-textarea { width: 100%; padding: 0.625rem; background: var(--color-surface-200); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.5rem; color: var(--color-text-primary); font-family: inherit; margin-bottom: 0.85rem; box-sizing: border-box; }
	.report-feedback { font-size: 0.82rem; color: #4ade80; margin: 0 0 0.75rem; }
	:global(html[data-theme='light']) .modal-card select, :global(html[data-theme='light']) .report-textarea { background: #f8fafc; border-color: #e2e8f0; }
	.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
	.btn-ghost-sm { padding: 0.5rem 1rem; background: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 0.5rem; color: var(--color-text-secondary); cursor: pointer; font-family: inherit; font-weight: 500; }
	.btn-danger-sm { padding: 0.5rem 1rem; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 0.5rem; color: #f87171; cursor: pointer; font-family: inherit; font-weight: 600; }
	.btn-danger-sm:disabled { opacity: 0.4; cursor: not-allowed; }
	:global(html[data-theme='light']) .btn-ghost-sm { border-color: #e2e8f0; color: #64748b; }

	@media (max-width: 768px) {
		.showcase-strip { grid-template-columns: repeat(2, 1fr); }
	}
	@media (max-width: 640px) {
		.cover-area { height: 190px; }
		.profile-header { padding: 0 1rem; }
		.header-top { margin-top: -50px; flex-direction: column; align-items: center; gap: 1rem; }
		.avatar { width: 100px; height: 100px; }
		.avatar-ring { padding: 4px; }
		.name-row { justify-content: center; }
		.name-row h1 { font-size: 1.5rem; }
		.header-info { text-align: center; }
		.meta-row { justify-content: center; gap: 1rem; }
		.actions-wrapper { width: 100%; display: flex; justify-content: center; }
		.actions { flex-wrap: wrap; justify-content: center; }
		.tabs-nav { gap: 1rem; justify-content: flex-start; padding-inline: 0.25rem; }
	}
	@media (max-width: 480px) {
		.showcase-strip { grid-template-columns: 1fr; }
	}
</style>
