<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { isAuthenticated, getUser } from '$lib/stores/auth.svelte';
	import UserQuickCard from '$lib/components/ui/UserQuickCard.svelte';
	import * as m from '$lib/paraglide/messages';
	import { formatRoleBadge } from '$lib/i18n-labels';
	import {
		buildCommentThreads,
		parseCommentSegments,
		wrapSelectionWithSpoiler,
		type CommentItem,
		type CommentSortMode
	} from './comment-utils';

	let { commentableType = 'chapter', commentableId = 0 } = $props();

	let comments = $state<CommentItem[]>([]);
	let newComment = $state('');
	let replyTo = $state<number | null>(null);
	let replyToName = $state<string>('');
	let replyText = $state('');
	let editingId = $state<number | null>(null);
	let editText = $state('');
	let sortMode = $state<CommentSortMode>('newest');
	let loading = $state(true);
	let submitting = $state(false);
	let selectedUser = $state<any | null>(null);
	let revealedSpoilers = $state<Record<string, boolean>>({});
	let expandedThreads = $state<Record<number, boolean>>({});
	let flaggedIds = $state<Record<number, boolean>>({});
	let highlightedCommentId = $state<number | null>(null);
	let loadedTargetKey = $state<string>('');

	let mainInputEl = $state<HTMLTextAreaElement | null>(null);

	let threads = $derived(buildCommentThreads(comments, sortMode));
	let totalCount = $derived(comments.length);

	function focusCommentFromHash() {
		if (typeof window === 'undefined') return;
		const hash = window.location.hash || '';
		const match = hash.match(/^#comment-(\d+)$/);
		if (!match) return;
		const targetId = Number(match[1]);
		if (!Number.isFinite(targetId) || targetId <= 0) return;

		const found = comments.find((c) => Number(c.id) === targetId);
		if (!found) return;

		const rootId = Number(found.root_id || found.parent_id || found.id);
		if (rootId && rootId !== targetId) {
			expandedThreads = { ...expandedThreads, [rootId]: true };
		}
		highlightedCommentId = targetId;

		requestAnimationFrame(() => {
			const el = document.getElementById(`comment-${targetId}`);
			el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	onMount(() => {
		const handleHashChange = () => focusCommentFromHash();
		window.addEventListener('hashchange', handleHashChange);
		return () => window.removeEventListener('hashchange', handleHashChange);
	});

	$effect(() => {
		const key = `${commentableType}:${commentableId}`;
		if (commentableId > 0 && key !== loadedTargetKey) {
			loadedTargetKey = key;
			replyTo = null;
			editingId = null;
			void fetchComments();
		}
	});

	async function fetchComments() {
		if (!commentableId || commentableId <= 0) {
			comments = [];
			loading = false;
			return;
		}
		loading = true;
		try {
			const res = await api<any>(
				`/comments/${commentableType}/${commentableId}?sort=${sortMode}`
			);
			comments = (res.data || []) as CommentItem[];
		} catch {
			comments = [];
		} finally {
			loading = false;
			focusCommentFromHash();
		}
	}

	function insertMainSpoiler() {
		const res = wrapSelectionWithSpoiler(
			newComment,
			mainInputEl?.selectionStart,
			mainInputEl?.selectionEnd
		);
		newComment = res.text;
		requestAnimationFrame(() => {
			if (mainInputEl) {
				mainInputEl.focus();
				mainInputEl.setSelectionRange(res.selectionStart, res.selectionEnd);
			}
		});
	}

	function insertReplySpoiler() {
		const res = wrapSelectionWithSpoiler(replyText);
		replyText = res.text;
	}

	async function submitComment() {
		if (!newComment.trim() || submitting) return;
		submitting = true;
		try {
			await api(`/comments/${commentableType}/${commentableId}`, {
				method: 'POST',
				body: { content: newComment }
			});
			newComment = '';
			await fetchComments();
		} catch {
		} finally {
			submitting = false;
		}
	}

	function openReplyBox(targetComment: CommentItem, rootId: number) {
		if (replyTo === targetComment.id) {
			replyTo = null;
			replyToName = '';
			replyText = '';
			return;
		}
		replyTo = targetComment.id;
		const author =
			targetComment.user?.nickname ||
			targetComment.user?.name ||
			targetComment.user?.username ||
			m.role_reader_short();
		replyToName = author;
		expandedThreads = { ...expandedThreads, [rootId]: true };
	}

	async function submitReply(parentId: number, rootId: number) {
		if (!replyText.trim() || submitting) return;
		submitting = true;
		try {
			await api(`/comments/${commentableType}/${commentableId}`, {
				method: 'POST',
				body: { content: replyText, parent_id: parentId }
			});
			replyTo = null;
			replyToName = '';
			replyText = '';
			expandedThreads = { ...expandedThreads, [rootId]: true };
			await fetchComments();
		} catch {
		} finally {
			submitting = false;
		}
	}

	function startEdit(comment: CommentItem) {
		editingId = comment.id;
		editText = comment.content;
	}

	async function saveEdit(commentId: number) {
		if (!editText.trim() || submitting) return;
		submitting = true;
		try {
			const res = await api<any>(`/comments/${commentId}`, {
				method: 'PUT',
				body: { content: editText }
			});
			if (res.success) {
				comments = comments.map((c) =>
					c.id === commentId
						? {
								...c,
								content: res.data?.content ?? editText.trim(),
								is_edited: true,
								updated_at: res.data?.updated_at ?? new Date().toISOString()
							}
						: c
				);
				editingId = null;
				editText = '';
			}
		} catch {
		} finally {
			submitting = false;
		}
	}

	async function toggleLike(comment: CommentItem) {
		if (!isAuthenticated()) return;
		const prevLiked = Boolean(comment.viewer_liked);
		const prevCount = Number(comment.likes_count ?? 0);
		const nextLiked = !prevLiked;
		const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));

		comments = comments.map((c) =>
			c.id === comment.id
				? { ...c, viewer_liked: nextLiked, likes_count: nextCount }
				: c
		);

		try {
			const res = await api<any>(`/comments/${comment.id}/like`, { method: 'POST' });
			if (res.success && res.data) {
				comments = comments.map((c) =>
					c.id === comment.id
						? {
								...c,
								viewer_liked: Boolean(res.data.liked),
								likes_count: Number(res.data.likes_count ?? nextCount)
							}
						: c
				);
			}
		} catch {
			comments = comments.map((c) =>
				c.id === comment.id
					? { ...c, viewer_liked: prevLiked, likes_count: prevCount }
					: c
			);
		}
	}

	async function deleteComment(id: number) {
		if (!confirm(m.cmt_delete_confirm())) return;
		try {
			await api(`/comments/${id}`, { method: 'DELETE' });
			await fetchComments();
		} catch {}
	}

	async function flagComment(id: number) {
		if (!isAuthenticated() || flaggedIds[id]) return;
		try {
			await api(`/moderation/flag/${id}`, { method: 'POST' });
			flaggedIds = { ...flaggedIds, [id]: true };
		} catch {}
	}

	function toggleSpoiler(commentId: number, segIndex: number) {
		const key = `${commentId}:${segIndex}`;
		revealedSpoilers = { ...revealedSpoilers, [key]: !revealedSpoilers[key] };
	}

	function timeAgo(date: string) {
		const diff = Date.now() - new Date(date).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return m.cmt_just_now();
		if (mins < 60) return m.cmt_mins_ago({ n: mins });
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return m.cmt_hours_ago({ n: hrs });
		return m.cmt_days_ago({ n: Math.floor(hrs / 24) });
	}
</script>

{#snippet commentCard(comment: CommentItem, rootId: number, isReply: boolean)}
	{@const cUser = comment.user || { id: comment.user_id, name: m.role_reader_short() }}
	{@const ownerId = comment.user_id ?? comment.user?.id}
	{@const canManage =
		Number(getUser()?.id) === Number(ownerId) ||
		getUser()?.role === 'admin' ||
		getUser()?.role === 'manager'}
	{@const segments = parseCommentSegments(comment.content)}

	<div
		class="comment-item"
		class:reply-item={isReply}
		class:highlighted={highlightedCommentId === comment.id}
		id="comment-{comment.id}"
	>
		<button
			type="button"
			class="comment-avatar-small clickable-user"
			onclick={() => (selectedUser = cUser)}
			title={m.cmt_view_reader_profile()}
		>
			{#if cUser.avatar}
				<img src={cUser.avatar} alt="" />
			{:else}
				<div class="avatar-ph-sm">{cUser.name?.charAt(0) || '?'}</div>
			{/if}
		</button>

		<div class="comment-body">
			<div class="comment-header">
				<button
					type="button"
					class="comment-author-btn"
					onclick={() => (selectedUser = cUser)}
				>
					<strong>{cUser.nickname || cUser.name || 'Unknown'}</strong>
					{#if cUser.username}
						<span class="comment-handle">@{cUser.username}</span>
					{/if}
				</button>
				{#if cUser.role === 'admin'}
					<span class="c-role-badge admin">{formatRoleBadge('admin', false)}</span>
				{:else if cUser.role === 'manager'}
					<span class="c-role-badge manager">{formatRoleBadge('manager', false)}</span>
				{/if}
				{#if isReply && comment.reply_to_user}
					<span class="reply-target-chip">
						↪ @{comment.reply_to_user.nickname ||
							comment.reply_to_user.name ||
							comment.reply_to_user.username}
					</span>
				{/if}
				<span class="comment-time">{timeAgo(comment.created_at)}</span>
				{#if comment.is_edited}
					<span class="edited-badge">{m.cmt_edited()}</span>
				{/if}
			</div>

			{#if editingId === comment.id}
				<div class="edit-box">
					<textarea rows="2" bind:value={editText}></textarea>
					<div class="edit-actions">
						<button
							type="button"
							class="spoiler-tool-btn"
							onclick={() => {
								editText = wrapSelectionWithSpoiler(editText).text;
							}}
						>
							🔒 {m.cmt_insert_spoiler()}
						</button>
						<button
							type="button"
							class="cancel-btn-sm"
							onclick={() => {
								editingId = null;
								editText = '';
							}}
						>
							{m.cmt_cancel()}
						</button>
						<button
							type="button"
							class="send-btn-sm"
							onclick={() => saveEdit(comment.id)}
							disabled={!editText.trim() || submitting}
						>
							{m.cmt_save()}
						</button>
					</div>
				</div>
			{:else}
				<div class="comment-text">
					{#each segments as seg, segIdx}
						{#if seg.type === 'spoiler'}
							{@const revealed = Boolean(revealedSpoilers[`${comment.id}:${segIdx}`])}
							<button
								type="button"
								class="spoiler-block"
								class:revealed
								onclick={() => toggleSpoiler(comment.id, segIdx)}
								title={revealed ? m.cmt_click_to_hide_spoiler() : m.cmt_click_to_reveal_spoiler()}
							>
								{#if revealed}
									<span class="spoiler-tag">🔓 Spoiler:</span> {seg.text}
								{:else}
									{m.cmt_hidden_spoiler_click_to_reveal()}
								{/if}
							</button>
						{:else}
							<span>{seg.text}</span>
						{/if}
					{/each}
				</div>
			{/if}

			<div class="comment-actions">
				<button
					type="button"
					class="action-btn like-btn"
					class:liked={comment.viewer_liked}
					onclick={() => toggleLike(comment)}
					disabled={!isAuthenticated()}
					title={isAuthenticated() ? m.cmt_like_comment() : m.cmt_sign_in_to_like()}
				>
					<span>{comment.viewer_liked ? '❤️' : '🤍'}</span>
					{#if (comment.likes_count ?? 0) > 0}
						<span class="like-count">{comment.likes_count}</span>
					{/if}
				</button>

				{#if isAuthenticated()}
					<button
						type="button"
						class="action-btn"
						onclick={() => openReplyBox(comment, rootId)}
					>
						{replyTo === comment.id ? m.cmt_cancel() : `💬 ${m.cmt_reply()}`}
					</button>
				{/if}

				{#if Number(getUser()?.id) === Number(ownerId)}
					<button type="button" class="action-btn" onclick={() => startEdit(comment)}>
						✏️ {m.cmt_edit()}
					</button>
				{/if}

				{#if cUser.id}
					<a href="/profile/{cUser.id}" class="action-btn profile-link">{m.nav_profile()}</a>
				{/if}

				{#if canManage}
					<button
						type="button"
						class="action-btn delete"
						onclick={() => deleteComment(comment.id)}
					>
						{m.cmt_delete()}
					</button>
				{:else if isAuthenticated()}
					<button
						type="button"
						class="action-btn report"
						onclick={() => flagComment(comment.id)}
						disabled={Boolean(flaggedIds[comment.id])}
					>
						{flaggedIds[comment.id] ? m.cmt_reported() : m.cmt_report()}
					</button>
				{/if}
			</div>

			{#if replyTo === comment.id}
				<div class="reply-form">
					<div class="reply-input-row">
						<input
							type="text"
							bind:value={replyText}
							placeholder={m.cmt_reply_placeholder_user({ name: `@${replyToName}` })}
							onkeydown={(e) => {
								if (e.key === 'Enter') void submitReply(comment.id, rootId);
							}}
						/>
						<button
							type="button"
							class="spoiler-tool-btn"
							onclick={insertReplySpoiler}
							title={m.cmt_insert_spoiler_tag()}
						>
							🔒 Spoiler
						</button>
						<button
							type="button"
							class="send-btn-sm"
							onclick={() => submitReply(comment.id, rootId)}
							disabled={!replyText.trim() || submitting}
						>
							{m.cmt_send()}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/snippet}

<div class="comments-section">
	<div class="comments-top-bar">
		<h3 class="comments-title">{m.cmt_title({ count: totalCount })}</h3>
		{#if totalCount > 1}
			<div class="sort-tabs" role="tablist" aria-label={m.cmt_sort_comments()}>
				<button
					type="button"
					class="sort-tab"
					class:active={sortMode === 'newest'}
					onclick={() => {
						sortMode = 'newest';
					}}
				>
					{m.cmt_newest()}
				</button>
				<button
					type="button"
					class="sort-tab"
					class:active={sortMode === 'top'}
					onclick={() => {
						sortMode = 'top';
					}}
				>
					{m.cmt_top()}
				</button>
				<button
					type="button"
					class="sort-tab"
					class:active={sortMode === 'oldest'}
					onclick={() => {
						sortMode = 'oldest';
					}}
				>
					{m.cmt_oldest()}
				</button>
			</div>
		{/if}
	</div>

	{#if isAuthenticated()}
		<div class="comment-form">
			<div class="comment-avatar">
				{#if getUser()?.avatar}
					<img src={getUser()?.avatar} alt="" />
				{:else}
					<div class="avatar-ph">{getUser()?.name?.charAt(0)}</div>
				{/if}
			</div>
			<div class="comment-composer">
				<textarea
					bind:this={mainInputEl}
					rows="2"
					bind:value={newComment}
					placeholder={`${m.cmt_placeholder()} ${m.cmt_supports_spoiler_spoiler_tags_to()}`}
					onkeydown={(e) => {
						if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
							e.preventDefault();
							void submitComment();
						}
					}}
				></textarea>
				<div class="composer-toolbar">
					<button
						type="button"
						class="spoiler-tool-btn"
						onclick={insertMainSpoiler}
						title={m.cmt_wrap_selected_text_in_spoiler()}
					>
						{m.cmt_hide_spoiler()}
					</button>
					<span class="composer-hint">{m.cmt_press_enter_to_send_shift()}</span>
					<button
						type="button"
						class="send-btn"
						onclick={submitComment}
						disabled={!newComment.trim() || submitting}
					>
						{m.cmt_send()}
					</button>
				</div>
			</div>
		</div>
	{:else}
		<p class="login-prompt">{m.cmt_login()}</p>
	{/if}

	{#if loading}
		<div class="loading-comments">{m.cmt_loading()}</div>
	{:else if threads.length === 0}
		<div class="empty-comments">
			{m.cmt_no_comments_yet_be_the()}
		</div>
	{:else}
		<div class="comment-list">
			{#each threads as thread (thread.root.id)}
				{@const rootId = thread.root.id}
				{@const totalReplies = thread.replies.length}
				{@const isExpanded = Boolean(expandedThreads[rootId]) || totalReplies <= 3}
				{@const visibleReplies = isExpanded ? thread.replies : thread.replies.slice(0, 2)}

				<div class="comment-thread">
					{@render commentCard(thread.root, rootId, false)}

					{#if totalReplies > 0}
						<div class="thread-replies">
							{#each visibleReplies as reply (reply.id)}
								{@render commentCard(reply, rootId, true)}
							{/each}

							{#if totalReplies > 3}
								<button
									type="button"
									class="toggle-replies-btn"
									onclick={() =>
										(expandedThreads = {
											...expandedThreads,
											[rootId]: !expandedThreads[rootId]
										})}
								>
									{#if isExpanded}
										▲ {m.cmt_collapse_replies_count({ count: totalReplies })}
									{:else}
										▼ {m.cmt_show_more_thread_replies({ count: totalReplies - visibleReplies.length })}
									{/if}
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<UserQuickCard
	open={Boolean(selectedUser)}
	userId={selectedUser?.id ?? selectedUser?.username}
	initialUser={selectedUser}
	onClose={() => (selectedUser = null)}
/>

<style>
	.comments-section {
		margin-top: 2rem;
	}
	.comments-top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.comments-title {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0;
	}
	.sort-tabs {
		display: inline-flex;
		gap: 0.25rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 999px;
		padding: 0.18rem;
	}
	.sort-tab {
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.74rem;
		font-weight: 600;
		padding: 0.28rem 0.68rem;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.sort-tab:hover {
		color: var(--color-text-primary);
	}
	.sort-tab.active {
		background: rgba(12, 113, 61, 0.28);
		color: #4ade80;
	}

	.comment-form {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}
	.comment-avatar img,
	.comment-avatar .avatar-ph {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
	}
	.avatar-ph {
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-accent-cyan));
		color: #fff;
		font-weight: 700;
		font-size: 0.85rem;
		width: 36px;
		height: 36px;
		border-radius: 50%;
	}
	.comment-composer {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		background: rgba(0, 0, 0, 0.22);
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 10px;
		padding: 0.55rem 0.7rem;
	}
	.comment-composer textarea {
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		color: var(--color-text-primary);
		font-family: inherit;
		font-size: 0.85rem;
		line-height: 1.45;
		resize: vertical;
		min-height: 2.5rem;
	}
	.composer-toolbar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		padding-top: 0.4rem;
	}
	.composer-hint {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		margin-right: auto;
	}
	.spoiler-tool-btn {
		padding: 0.26rem 0.6rem;
		border-radius: 6px;
		border: 1px solid rgba(251, 191, 36, 0.3);
		background: rgba(251, 191, 36, 0.1);
		color: #fcd34d;
		font-size: 0.73rem;
		font-weight: 600;
		cursor: pointer;
	}
	.spoiler-tool-btn:hover {
		background: rgba(251, 191, 36, 0.2);
	}
	.send-btn {
		padding: 0.42rem 0.95rem;
		background: linear-gradient(135deg, #0c713d, #06b6d4);
		color: #fff;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.8rem;
	}
	.send-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.login-prompt,
	.loading-comments,
	.empty-comments {
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		padding: 1.1rem;
	}

	.comment-list {
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
	}
	.comment-thread {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	.thread-replies {
		margin-left: 2.3rem;
		padding-left: 0.85rem;
		border-left: 2px solid rgba(56, 189, 248, 0.18);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.toggle-replies-btn {
		align-self: flex-start;
		background: rgba(56, 189, 248, 0.08);
		border: 1px solid rgba(56, 189, 248, 0.22);
		color: #7dd3fc;
		border-radius: 999px;
		padding: 0.22rem 0.68rem;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}
	.toggle-replies-btn:hover {
		background: rgba(56, 189, 248, 0.16);
	}

	.comment-item {
		display: flex;
		gap: 0.65rem;
		padding: 0.35rem 0.45rem;
		border-radius: 10px;
		transition: background 0.3s, box-shadow 0.3s;
	}
	.comment-item.highlighted {
		background: rgba(251, 191, 36, 0.12);
		box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.4);
	}
	.comment-avatar-small {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
	}
	.comment-avatar-small img,
	.avatar-ph-sm {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		transition: transform 0.15s;
	}
	.reply-item .comment-avatar-small img,
	.reply-item .avatar-ph-sm {
		width: 27px;
		height: 27px;
	}
	.comment-avatar-small:hover img,
	.comment-avatar-small:hover .avatar-ph-sm {
		transform: scale(1.08);
	}
	.avatar-ph-sm {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-300);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 700;
	}
	.comment-body {
		flex: 1;
		min-width: 0;
	}
	.comment-header {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.18rem;
		flex-wrap: wrap;
	}
	.comment-author-btn {
		background: none;
		border: none;
		padding: 0;
		color: var(--color-text-primary);
		cursor: pointer;
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		font-family: inherit;
	}
	.comment-author-btn:hover strong {
		color: #fbbf24;
		text-decoration: underline;
	}
	.comment-header strong {
		font-size: 0.85rem;
	}
	.comment-handle {
		font-size: 0.72rem;
		color: var(--color-text-muted);
	}
	.c-role-badge {
		font-size: 0.65rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 99px;
	}
	.c-role-badge.admin {
		background: rgba(239, 68, 68, 0.15);
		color: #fca5a5;
	}
	.c-role-badge.manager {
		background: rgba(59, 130, 246, 0.15);
		color: #93c5fd;
	}
	.reply-target-chip {
		font-size: 0.7rem;
		color: #38bdf8;
		background: rgba(56, 189, 248, 0.1);
		padding: 1px 6px;
		border-radius: 99px;
	}
	.comment-time {
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}
	.edited-badge {
		font-size: 0.68rem;
		color: var(--color-text-muted);
		font-style: italic;
	}
	.comment-text {
		font-size: 0.85rem;
		line-height: 1.55;
		color: var(--color-text-secondary);
		margin: 0.15rem 0 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.spoiler-block {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0.1rem 0.15rem;
		padding: 0.14rem 0.55rem;
		border-radius: 6px;
		border: 1px dashed rgba(251, 191, 36, 0.45);
		background: rgba(251, 191, 36, 0.12);
		color: #fde68a;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
	}
	.spoiler-block.revealed {
		border-style: solid;
		background: rgba(15, 23, 42, 0.75);
		color: var(--color-text-primary);
	}
	.spoiler-tag {
		color: #fbbf24;
		font-weight: 700;
		font-size: 0.73rem;
	}

	.comment-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.38rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.action-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		padding: 0;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.action-btn:hover:not(:disabled) {
		color: var(--color-brand-400);
	}
	.action-btn.like-btn.liked {
		color: #fb7185;
		font-weight: 600;
	}
	.action-btn.delete:hover {
		color: #f87171;
	}
	.action-btn.report:hover:not(:disabled) {
		color: #fbbf24;
	}

	.edit-box {
		margin-top: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.edit-box textarea {
		width: 100%;
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 6px;
		padding: 0.4rem 0.6rem;
		color: var(--color-text-primary);
		font-family: inherit;
		font-size: 0.82rem;
	}
	.edit-actions {
		display: flex;
		gap: 0.45rem;
		justify-content: flex-end;
	}
	.cancel-btn-sm {
		padding: 0.3rem 0.65rem;
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-text-secondary);
		border: none;
		border-radius: 6px;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.reply-form {
		margin-top: 0.5rem;
	}
	.reply-input-row {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.reply-input-row input {
		flex: 1;
		min-width: 180px;
		background: rgba(0, 0, 0, 0.18);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 0.35rem 0.6rem;
		color: var(--color-text-primary);
		font-size: 0.8rem;
	}
	.send-btn-sm {
		padding: 0.35rem 0.75rem;
		background: var(--color-brand-500);
		color: #fff;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.send-btn-sm:disabled {
		opacity: 0.45;
		cursor: default;
	}

	@media (max-width: 640px) {
		.thread-replies {
			margin-left: 0.85rem;
			padding-left: 0.6rem;
		}
		.comment-form {
			gap: 0.5rem;
		}
		.reply-input-row input {
			min-width: 140px;
		}
	}
</style>
