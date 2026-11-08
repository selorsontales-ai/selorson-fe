<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { goto } from '$app/navigation';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import {
		fetchNotificationFeed,
		getNotificationFeed,
		getUnreadInteractionCount,
		getUnreadNotificationCount,
		getUnreadSystemCount,
		isFeedLoading,
		markNotificationsRead,
		voteOnNotification,
		type NotificationFeedItem
	} from '$lib/stores/engagement.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { dateLocale, formatNotificationText } from '$lib/i18n-labels';

	let open = $state(false);
	let activeTab = $state<'all' | 'interaction' | 'system'>('all');
	let votingId = $state<number | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	let allItems = $derived(getNotificationFeed());
	let filteredItems = $derived(
		activeTab === 'all'
			? allItems
			: allItems.filter((item) => item.category === activeTab)
	);
	let unreadTotal = $derived(getUnreadNotificationCount());
	let unreadInteraction = $derived(getUnreadInteractionCount());
	let unreadSystem = $derived(getUnreadSystemCount());

	function toggleDropdown() {
		open = !open;
		if (open && isAuthenticated()) {
			void fetchNotificationFeed();
		}
	}

	async function handleItemClick(item: NotificationFeedItem) {
		if (!item.is_read) {
			void markNotificationsRead([item.key], false);
		}
		if (item.target_url) {
			open = false;
			await goto(item.target_url);
		}
	}

	async function handlePollVote(
		event: MouseEvent,
		notificationId: number,
		optionId: number,
		itemKey: string
	) {
		event.stopPropagation();
		if (votingId !== null) return;
		votingId = notificationId;
		try {
			await voteOnNotification(notificationId, optionId);
			void markNotificationsRead([itemKey], false);
		} finally {
			votingId = null;
		}
	}

	function iconForKind(kind: NotificationFeedItem['kind']): string {
		switch (kind) {
			case 'comment_reply':
				return '💬';
			case 'comment_like':
				return '❤️';
			case 'new_follower':
				return '👤';
			case 'new_chapter':
				return '📖';
			case 'poll':
				return '📊';
			default:
				return '📢';
		}
	}

	function formatTimeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return m.notif_just_now();
		if (mins < 60) return m.notif_time_mins_ago({ mins });
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return m.notif_time_hrs_ago({ hrs });
		const days = Math.floor(hrs / 24);
		if (days < 30) return m.notif_time_days_ago({ days });
		return new Date(dateStr).toLocaleDateString(dateLocale());
	}

	onMount(() => {
		if (isAuthenticated()) {
			void fetchNotificationFeed();
		}
		pollTimer = setInterval(() => {
			if (isAuthenticated() && document.visibilityState === 'visible') {
				void fetchNotificationFeed();
			}
		}, 45000);
	});

	$effect(() => {
		if (isAuthenticated()) {
			void fetchNotificationFeed();
		}
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
</script>

<div class="notif-bell-wrap">
	<button
		type="button"
		class="notif-bell-btn"
		class:has-unread={unreadTotal > 0}
		onclick={toggleDropdown}
		title={m.notif_notifications_activity()}
		aria-label={m.notif_notifications()}
	>
		<span class="bell-icon">🔔</span>
		{#if unreadTotal > 0}
			<span class="unread-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
		{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="notif-backdrop" onmousedown={() => (open = false)}></div>

		<div class="notif-dropdown" role="dialog" aria-label={m.notif_notification_center()}>
			<div class="notif-header">
				<div class="notif-title-group">
					<h4>🔔 {m.notif_notifications()}</h4>
					{#if unreadTotal > 0}
						<span class="unread-pill">{unreadTotal} {m.notif_new()}</span>
					{/if}
				</div>
				{#if unreadTotal > 0}
					<button
						type="button"
						class="mark-all-btn"
						onclick={() => markNotificationsRead([], true)}
					>
						✓ {m.notif_mark_all_read()}
					</button>
				{/if}
			</div>

			<div class="notif-tabs">
				<button
					type="button"
					class="notif-tab"
					class:active={activeTab === 'all'}
					onclick={() => (activeTab = 'all')}
				>
					{m.lib_cat_all()}
				</button>
				<button
					type="button"
					class="notif-tab"
					class:active={activeTab === 'interaction'}
					onclick={() => (activeTab = 'interaction')}
				>
					{m.notif_interactions()}
					{#if unreadInteraction > 0}
						<span class="tab-count">{unreadInteraction}</span>
					{/if}
				</button>
				<button
					type="button"
					class="notif-tab"
					class:active={activeTab === 'system'}
					onclick={() => (activeTab = 'system')}
				>
					{m.notif_system()}
					{#if unreadSystem > 0}
						<span class="tab-count">{unreadSystem}</span>
					{/if}
				</button>
			</div>

			<div class="notif-list">
				{#if isFeedLoading() && allItems.length === 0}
					<div class="notif-empty">{m.notif_loading_notifications()}</div>
				{:else if filteredItems.length === 0}
					<div class="notif-empty">
						{m.notif_no_notifications_in_this_category()}
					</div>
				{:else}
					{#each filteredItems as item (item.key)}
						{@const totalVotes =
							item.vote?.options?.reduce((acc, o) => acc + (o.vote_count || 0), 0) || 0}
						{@const formatted = formatNotificationText({
							type: item.kind,
							title: item.title,
							description: item.content,
							actor_name: item.actor?.name,
							context_label: item.context_label
						})}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="notif-card"
							class:unread={!item.is_read}
							class:clickable={Boolean(item.target_url)}
							onclick={() => handleItemClick(item)}
						>
							<div class="notif-avatar">
								{#if item.actor?.avatar}
									<img src={item.actor.avatar} alt={item.actor.name} />
									<span class="kind-mini-badge">{iconForKind(item.kind)}</span>
								{:else}
									<div class="kind-circle">{iconForKind(item.kind)}</div>
								{/if}
							</div>

							<div class="notif-body">
								<div class="notif-meta-row">
									{#if formatted.context_label}
										<span class="context-chip">{formatted.context_label}</span>
									{/if}
									<span class="notif-time">{formatTimeAgo(item.created_at)}</span>
									{#if !item.is_read}
										<span class="unread-dot" title={m.notif_unread()}></span>
									{/if}
								</div>

								<p class="notif-item-title">{formatted.title}</p>
								{#if formatted.description}
									<p class="notif-item-desc">{formatted.description}</p>
								{/if}

								{#if item.vote && item.vote.options?.length}
									<div class="poll-box">
										{#each item.vote.options as opt (opt.id)}
											{@const pct =
												totalVotes > 0
													? Math.round(((opt.vote_count || 0) * 100) / totalVotes)
													: 0}
											{@const isChosen = item.vote.user_voted === opt.id}
											<button
												type="button"
												class="poll-opt"
												class:chosen={isChosen}
												disabled={votingId === item.id}
												onclick={(e) => handlePollVote(e, item.id, opt.id, item.key)}
											>
												<span class="poll-bar" style="width: {pct}%"></span>
												<span class="poll-text">
													{isChosen ? '✓ ' : ''}{opt.option_text}
												</span>
												<span class="poll-pct">{pct}% ({opt.vote_count || 0})</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.notif-bell-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
	}
	.notif-bell-btn {
		position: relative;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: var(--color-text-primary);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.18s, border-color 0.18s, transform 0.15s;
	}
	.notif-bell-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(56, 189, 248, 0.35);
	}
	.notif-bell-btn.has-unread {
		border-color: rgba(251, 191, 36, 0.45);
	}
	.bell-icon {
		font-size: 1rem;
		line-height: 1;
	}
	.unread-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border-radius: 999px;
		background: linear-gradient(135deg, #ef4444, #f97316);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 800;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 6px rgba(239, 68, 68, 0.45);
	}

	.notif-backdrop {
		position: fixed;
		inset: 0;
		z-index: 95;
	}
	.notif-dropdown {
		position: absolute;
		top: calc(100% + 0.55rem);
		right: 0;
		width: min(24rem, calc(100vw - 1.5rem));
		max-height: 30rem;
		background: rgba(11, 18, 31, 0.96);
		backdrop-filter: blur(18px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		box-shadow: 0 18px 42px rgba(0, 0, 0, 0.55);
		z-index: 100;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.notif-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.75rem 0.95rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.notif-title-group {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.notif-title-group h4 {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 700;
		color: #f8fafc;
	}
	.unread-pill {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 1px 7px;
		border-radius: 999px;
		background: rgba(251, 191, 36, 0.16);
		color: #fcd34d;
	}
	.mark-all-btn {
		border: none;
		background: transparent;
		color: #38bdf8;
		font-size: 0.74rem;
		font-weight: 600;
		cursor: pointer;
	}
	.mark-all-btn:hover {
		text-decoration: underline;
	}

	.notif-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.45rem 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(255, 255, 255, 0.02);
	}
	.notif-tab {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.74rem;
		font-weight: 600;
		padding: 0.32rem 0.45rem;
		border-radius: 8px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}
	.notif-tab.active {
		background: rgba(12, 113, 61, 0.28);
		color: #4ade80;
	}
	.tab-count {
		font-size: 0.65rem;
		padding: 0 5px;
		border-radius: 999px;
		background: rgba(239, 68, 68, 0.22);
		color: #fca5a5;
	}

	.notif-list {
		overflow-y: auto;
		max-height: 23rem;
		display: flex;
		flex-direction: column;
	}
	.notif-empty {
		padding: 2rem 1rem;
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.82rem;
	}

	.notif-card {
		display: flex;
		gap: 0.7rem;
		padding: 0.75rem 0.9rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: background 0.15s;
	}
	.notif-card.clickable {
		cursor: pointer;
	}
	.notif-card:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.notif-card.unread {
		background: rgba(12, 113, 61, 0.1);
	}
	.notif-card.unread:hover {
		background: rgba(12, 113, 61, 0.16);
	}

	.notif-avatar {
		position: relative;
		width: 2.25rem;
		height: 2.25rem;
		flex-shrink: 0;
	}
	.notif-avatar img {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		object-fit: cover;
	}
	.kind-mini-badge {
		position: absolute;
		bottom: -3px;
		right: -3px;
		font-size: 0.68rem;
		background: #0f172a;
		border-radius: 50%;
		padding: 1px;
	}
	.kind-circle {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: rgba(56, 189, 248, 0.12);
		border: 1px solid rgba(56, 189, 248, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.95rem;
	}

	.notif-body {
		flex: 1;
		min-width: 0;
	}
	.notif-meta-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.2rem;
	}
	.context-chip {
		font-size: 0.66rem;
		font-weight: 600;
		color: #7dd3fc;
		background: rgba(56, 189, 248, 0.12);
		padding: 1px 6px;
		border-radius: 999px;
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.notif-time {
		font-size: 0.68rem;
		color: var(--color-text-muted);
		margin-left: auto;
	}
	.unread-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #4ade80;
		flex-shrink: 0;
	}
	.notif-item-title {
		margin: 0 0 0.18rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #f1f5f9;
		line-height: 1.35;
	}
	.notif-item-desc {
		margin: 0;
		font-size: 0.76rem;
		color: var(--color-text-secondary);
		line-height: 1.42;
		word-break: break-word;
	}

	.poll-box {
		margin-top: 0.45rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.poll-opt {
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.32rem 0.55rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: #e2e8f0;
		font-size: 0.73rem;
		cursor: pointer;
		text-align: left;
	}
	.poll-opt.chosen {
		border-color: #4ade80;
		color: #4ade80;
		font-weight: 700;
	}
	.poll-bar {
		position: absolute;
		inset: 0 auto 0 0;
		background: rgba(56, 189, 248, 0.15);
		pointer-events: none;
	}
	.poll-opt.chosen .poll-bar {
		background: rgba(74, 222, 128, 0.18);
	}
	.poll-text,
	.poll-pct {
		position: relative;
		z-index: 1;
	}
	.poll-pct {
		font-size: 0.68rem;
		color: var(--color-text-muted);
	}

	@media (max-width: 640px) {
		.notif-dropdown {
			position: fixed;
			top: calc(var(--header-height, 64px) + 0.5rem);
			left: 0.75rem;
			right: 0.75rem;
			width: auto;
			max-height: calc(100dvh - 5.5rem);
		}
		.notif-list {
			max-height: calc(100dvh - 11rem);
		}
	}
</style>
