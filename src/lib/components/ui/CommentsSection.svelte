<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { isAuthenticated, getUser } from '$lib/stores/auth.svelte';

	let { commentableType = 'chapter', commentableId = 0 } = $props();

	let comments = $state<any[]>([]);
	let newComment = $state('');
	let replyTo = $state<number | null>(null);
	let replyText = $state('');
	let loading = $state(true);

	onMount(() => fetchComments());

	async function fetchComments() {
		loading = true;
		try {
			const res = await api<any>(`/comments/${commentableType}/${commentableId}`);
			comments = res.data || [];
		} catch { comments = []; }
		loading = false;
	}

	async function submitComment() {
		if (!newComment.trim()) return;
		try {
			await api('/comments', {
				method: 'POST',
				body: { commentable_type: commentableType, commentable_id: commentableId, content: newComment },
			});
			newComment = '';
			await fetchComments();
		} catch {}
	}

	async function submitReply(parentId: number) {
		if (!replyText.trim()) return;
		try {
			await api('/comments', {
				method: 'POST',
				body: { commentable_type: commentableType, commentable_id: commentableId, content: replyText, parent_id: parentId },
			});
			replyTo = null;
			replyText = '';
			await fetchComments();
		} catch {}
	}

	async function deleteComment(id: number) {
		if (!confirm('Xóa bình luận này?')) return;
		try {
			await api(`/comments/${id}`, { method: 'DELETE' });
			await fetchComments();
		} catch {}
	}

	function timeAgo(date: string) {
		const diff = Date.now() - new Date(date).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'vừa xong';
		if (mins < 60) return `${mins} phút trước`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs} giờ trước`;
		return `${Math.floor(hrs / 24)} ngày trước`;
	}
</script>

<div class="comments-section">
	<h3 class="comments-title">💬 Bình luận ({comments.length})</h3>

	{#if isAuthenticated()}
		<div class="comment-form">
			<div class="comment-avatar">
				{#if getUser()?.avatar}
					<img src={getUser()?.avatar} alt="" />
				{:else}
					<div class="avatar-ph">{getUser()?.name?.charAt(0)}</div>
				{/if}
			</div>
			<div class="comment-input-wrap">
				<input type="text" bind:value={newComment} placeholder="Viết bình luận..."
					onkeydown={(e) => { if (e.key === 'Enter') submitComment(); }} />
				<button class="send-btn" onclick={submitComment} disabled={!newComment.trim()}>Gửi</button>
			</div>
		</div>
	{:else}
		<p class="login-prompt">Đăng nhập để bình luận</p>
	{/if}

	{#if loading}
		<div class="loading-comments">Đang tải...</div>
	{:else}
		<div class="comment-list">
			{#each comments as comment}
				<div class="comment-item">
					<div class="comment-avatar-small">
						{#if comment.user?.avatar}
							<img src={comment.user.avatar} alt="" />
						{:else}
							<div class="avatar-ph-sm">{comment.user?.name?.charAt(0) || '?'}</div>
						{/if}
					</div>
					<div class="comment-body">
						<div class="comment-header">
							<strong>{comment.user?.name || 'Unknown'}</strong>
							<span class="comment-time">{timeAgo(comment.created_at)}</span>
						</div>
						<p class="comment-text">{comment.content}</p>
						<div class="comment-actions">
							{#if isAuthenticated()}
								<button class="action-btn" onclick={() => { replyTo = replyTo === comment.id ? null : comment.id; }}>
									{replyTo === comment.id ? 'Hủy' : 'Trả lời'}
								</button>
							{/if}
							{#if getUser()?.id === comment.user_id || getUser()?.role === 'admin'}
								<button class="action-btn delete" onclick={() => deleteComment(comment.id)}>Xóa</button>
							{/if}
						</div>

						{#if replyTo === comment.id}
							<div class="reply-form">
								<input type="text" bind:value={replyText} placeholder="Trả lời..."
									onkeydown={(e) => { if (e.key === 'Enter') submitReply(comment.id); }} />
								<button class="send-btn-sm" onclick={() => submitReply(comment.id)}>Gửi</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.comments-section { margin-top: 2rem; }
	.comments-title { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; }

	.comment-form { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; }
	.comment-avatar img, .comment-avatar .avatar-ph { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
	.avatar-ph { display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-brand-500), var(--color-accent-cyan)); color: #fff; font-weight: 700; font-size: 0.85rem; width: 36px; height: 36px; border-radius: 50%; }
	.comment-input-wrap { flex: 1; display: flex; gap: 0.5rem; }
	.comment-input-wrap input { flex: 1; background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; padding: 0.5rem 0.75rem; color: var(--color-text-primary); font-size: 0.85rem; }
	.send-btn { padding: 0.5rem 1rem; background: linear-gradient(135deg, #0c713d, #06b6d4); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.8rem; }
	.send-btn:disabled { opacity: 0.4; }

	.login-prompt { text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 1rem; }
	.loading-comments { text-align: center; color: var(--color-text-muted); padding: 1rem; }

	.comment-list { display: flex; flex-direction: column; gap: 1rem; }
	.comment-item { display: flex; gap: 0.65rem; }
	.comment-avatar-small img, .avatar-ph-sm { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.avatar-ph-sm { display: flex; align-items: center; justify-content: center; background: var(--color-surface-300); color: var(--color-text-muted); font-size: 0.7rem; font-weight: 700; width: 30px; height: 30px; border-radius: 50%; }
	.comment-body { flex: 1; }
	.comment-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.15rem; }
	.comment-header strong { font-size: 0.85rem; }
	.comment-time { font-size: 0.7rem; color: var(--color-text-muted); }
	.comment-text { font-size: 0.85rem; line-height: 1.5; color: var(--color-text-secondary); }
	.comment-actions { display: flex; gap: 0.75rem; margin-top: 0.35rem; }
	.action-btn { background: none; border: none; color: var(--color-text-muted); font-size: 0.75rem; cursor: pointer; padding: 0; }
	.action-btn:hover { color: var(--color-brand-400); }
	.action-btn.delete:hover { color: #f87171; }

	.reply-form { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.reply-form input { flex: 1; background: rgba(0,0,0,.15); border: 1px solid rgba(255,255,255,.06); border-radius: 6px; padding: 0.35rem 0.6rem; color: var(--color-text-primary); font-size: 0.8rem; }
	.send-btn-sm { padding: 0.35rem 0.75rem; background: var(--color-brand-500); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; }
</style>
