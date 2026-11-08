<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { goto } from '$app/navigation';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import { getUser, getToken } from '$lib/stores/auth.svelte';
	import { getStatus, fetchStatus, toggleFollow } from '$lib/stores/social.svelte';
	import { openChatWithUser } from '$lib/stores/chat.svelte';
	import { formatRoleBadge, formatReaderRank } from '$lib/i18n-labels';

	interface Props {
		open: boolean;
		userId?: number | string | null;
		initialUser?: any;
		onClose: () => void;
	}

	let { open, userId = null, initialUser = null, onClose }: Props = $props();

	let currentUser = $derived(getUser());
	let profile = $state<any>(null);
	let loading = $state(false);
	let followBusy = $state(false);

	let resolvedId = $derived(profile?.id ?? initialUser?.id ?? (typeof userId === 'number' ? userId : Number(userId) || null));
	let isSelf = $derived(Boolean(currentUser && resolvedId && Number(currentUser.id) === Number(resolvedId)));
	let status = $derived(resolvedId ? getStatus(Number(resolvedId)) : null);

	$effect(() => {
		if (!open) return;
		const key = userId ?? initialUser?.id ?? initialUser?.username;
		if (initialUser) {
			profile = { ...initialUser };
		}
		if (key) {
			loadQuickProfile(key);
		}
	});

	async function loadQuickProfile(key: number | string) {
		loading = true;
		try {
			const headers: Record<string, string> = { Accept: 'application/json' };
			const token = getToken();
			if (token) headers['Authorization'] = `Bearer ${token}`;
			const res = await fetch(`${PUBLIC_API_BASE}/profile/${encodeURIComponent(String(key))}`, { headers });
			const json = await res.json();
			if (json?.success && json.data) {
				profile = json.data;
				if (currentUser && json.data.id && Number(currentUser.id) !== Number(json.data.id)) {
					await fetchStatus(Number(json.data.id));
				}
			}
		} catch {
			// keep initialUser fallback if network fails
		} finally {
			loading = false;
		}
	}

	async function handleFollow() {
		if (!resolvedId || followBusy) return;
		followBusy = true;
		try {
			await toggleFollow(Number(resolvedId));
		} finally {
			followBusy = false;
		}
	}

	function openFullProfile() {
		const target = profile?.id ?? userId ?? initialUser?.username;
		onClose();
		if (target) goto(`/profile/${target}`);
	}

	function openDirectMessage() {
		if (!resolvedId) return;
		onClose();
		openChatWithUser(Number(resolvedId));
	}
</script>

{#if open && (profile || initialUser || loading)}
	{@const u = profile || initialUser || {}}
	{@const stats = u.stats || {}}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="quick-overlay"
		role="dialog"
		aria-modal="true"
		aria-label={m.ui_reader_quick_card()}
		tabindex="-1"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="quick-card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div
				class="quick-cover"
				style={u.cover_image ? `background-image:url(${u.cover_image});background-position:center ${u.cover_position || 50}%` : ''}
			>
				<button class="quick-close" onclick={onClose} aria-label={m.toast_close_aria()}>✕</button>
			</div>

			<div class="quick-body">
				<div class="quick-avatar-row">
					<div class="quick-avatar-wrap">
						{#if u.avatar}
							<img src={u.avatar} alt={u.name || 'User'} class="quick-avatar" />
						{:else}
							<div class="quick-avatar-fallback">{(u.name || u.username || 'U')[0].toUpperCase()}</div>
						{/if}
						{#if u.is_online}
							<span class="quick-online-dot" title={m.ui_online()}></span>
						{/if}
					</div>

					<div class="quick-badges">
						{#if u.role === 'admin'}
							<span class="q-badge q-badge--admin">{formatRoleBadge('admin', true)}</span>
						{:else if u.role === 'manager'}
							<span class="q-badge q-badge--manager">{formatRoleBadge('manager', true)}</span>
						{:else if stats.reader_rank || u.reader_rank || stats.reader_title || u.reader_title}
							<span class="q-badge q-badge--rank">✨ {formatReaderRank(stats.reader_rank || u.reader_rank || stats.reader_title || u.reader_title, u.role)}</span>
						{/if}
					</div>
				</div>

				<div class="quick-identity">
					<h3 class="quick-name">
						{u.name || u.username || m.role_reader_short()}
						{#if u.nickname}
							<span class="quick-nick">({u.nickname})</span>
						{/if}
					</h3>
					{#if u.username}
						<p class="quick-handle">@{u.username}</p>
					{/if}
				</div>

				{#if u.blocked_relation}
					<p class="quick-private-note">{m.ui_this_profile_is_currently_unavailable()}</p>
				{:else if u.private_account && !isSelf}
					<p class="quick-private-note">{m.ui_this_account_is_private()}</p>
				{:else}
					{#if u.biography}
						<p class="quick-bio">{u.biography}</p>
					{/if}

					{#if u.occupation || u.hobbies}
						<div class="quick-tags">
							{#if u.occupation}
								<span class="quick-tag">💼 {u.occupation}</span>
							{/if}
							{#if u.hobbies}
								<span class="quick-tag">🎯 {u.hobbies}</span>
							{/if}
						</div>
					{/if}
				{/if}

				<div class="quick-stats">
					<div class="q-stat">
						<strong>{stats.chapters_read ?? 0}</strong>
						<span>{m.ui_chapters()}</span>
					</div>
					<div class="q-stat">
						<strong>{stats.world_visited ?? 0}</strong>
						<span>{m.ui_3d_world()}</span>
					</div>
					<div class="q-stat">
						<strong>{stats.comments_count ?? 0}</strong>
						<span>{m.ui_comments()}</span>
					</div>
					<div class="q-stat">
						<strong>{status?.follower_count ?? u.followers_count ?? 0}</strong>
						<span>{m.ui_followers()}</span>
					</div>
				</div>

				<div class="quick-actions">
					<button class="q-btn q-btn--primary" onclick={openFullProfile}>
						{m.ui_view_full_profile()}
					</button>
					{#if currentUser && !isSelf && !u.blocked_relation && !status?.is_blocked && !status?.is_blocked_by}
						<button
							class="q-btn"
							class:q-btn--following={status?.is_following}
							disabled={followBusy}
							onclick={handleFollow}
						>
							{status?.is_following ? m.ui_following() : m.ui_follow()}
						</button>
						<button class="q-btn" onclick={openDirectMessage} title={m.ui_direct_message()}>
							{m.profile_btn_message()}
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.quick-overlay {
		position: fixed;
		inset: 0;
		z-index: 320;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}
	.quick-card {
		width: 100%;
		max-width: 400px;
		max-height: calc(100dvh - 2rem);
		background: var(--bg-card, #12121f);
		border: 1px solid rgba(251, 191, 36, 0.25);
		border-radius: 18px;
		overflow-x: hidden;
		overflow-y: auto;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
		animation: quickPop 0.18s ease-out;
	}
	@keyframes quickPop {
		from { opacity: 0; transform: scale(0.95) translateY(6px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
	.quick-cover {
		height: 105px;
		background: linear-gradient(135deg, #1e1b4b, #311042, #3b2506);
		background-size: cover;
		position: relative;
	}
	.quick-close {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
	}
	.quick-body {
		padding: 0 20px 20px;
	}
	.quick-avatar-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-top: -36px;
		margin-bottom: 10px;
		gap: 10px;
	}
	.quick-avatar-wrap {
		position: relative;
		flex-shrink: 0;
	}
	.quick-avatar,
	.quick-avatar-fallback {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		border: 3px solid var(--bg-card, #12121f);
		object-fit: cover;
	}
	.quick-avatar-fallback {
		background: linear-gradient(135deg, #f59e0b, #fbbf24);
		color: #09090b;
		font-weight: 800;
		font-size: 1.6rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.quick-online-dot {
		position: absolute;
		bottom: 4px;
		right: 4px;
		width: 13px;
		height: 13px;
		border-radius: 50%;
		background: #22c55e;
		border: 2px solid var(--bg-card, #12121f);
	}
	.quick-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
	.q-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 3px 9px;
		border-radius: 99px;
	}
	.q-badge--admin {
		background: rgba(239, 68, 68, 0.16);
		color: #fca5a5;
		border: 1px solid rgba(239, 68, 68, 0.35);
	}
	.q-badge--manager {
		background: rgba(59, 130, 246, 0.16);
		color: #93c5fd;
		border: 1px solid rgba(59, 130, 246, 0.35);
	}
	.q-badge--rank {
		background: rgba(251, 191, 36, 0.14);
		color: #fbbf24;
		border: 1px solid rgba(251, 191, 36, 0.32);
	}
	.quick-identity {
		margin-bottom: 10px;
	}
	.quick-name {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text-primary, #f3f4f6);
		margin: 0;
	}
	.quick-nick {
		font-size: 0.85rem;
		font-weight: 400;
		color: var(--text-muted, #9ca3af);
	}
	.quick-handle {
		font-size: 0.8rem;
		color: var(--text-muted, #9ca3af);
		margin: 2px 0 0;
	}
	.quick-bio {
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-secondary, #d1d5db);
		margin: 0 0 10px;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.quick-private-note {
		font-size: 0.82rem;
		color: var(--text-muted, #9ca3af);
		background: rgba(255, 255, 255, 0.03);
		padding: 8px 12px;
		border-radius: 8px;
		margin: 0 0 12px;
	}
	.quick-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 12px;
	}
	.quick-tag {
		font-size: 0.74rem;
		color: var(--text-secondary, #d1d5db);
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		padding: 3px 9px;
		border-radius: 8px;
	}
	.quick-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 12px;
		padding: 10px 6px;
		margin-bottom: 14px;
		text-align: center;
	}
	.q-stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.q-stat strong {
		font-size: 0.95rem;
		color: #fbbf24;
	}
	.q-stat span {
		font-size: 0.68rem;
		color: var(--text-muted, #9ca3af);
	}
	.quick-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.q-btn {
		flex: 1;
		min-width: 110px;
		padding: 8px 12px;
		border-radius: 9px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: var(--text-primary, #f3f4f6);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}
	.q-btn:hover {
		border-color: #fbbf24;
		color: #fbbf24;
	}
	.q-btn--primary {
		flex-basis: 100%;
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.12));
		border-color: rgba(251, 191, 36, 0.45);
		color: #fbbf24;
	}
	.q-btn--primary:hover {
		background: rgba(251, 191, 36, 0.28);
	}
	.q-btn--following {
		border-color: rgba(34, 197, 94, 0.4);
		color: #4ade80;
	}

	@media (max-width: 420px) {
		.quick-body {
			padding: 0 14px 16px;
		}
		.quick-stats {
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}
		.q-btn {
			min-width: calc(50% - 4px);
		}
	}
</style>
