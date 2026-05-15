<script lang="ts">
	import { api } from '$lib/api';

	let email = $state('');
	let status = $state<'idle' | 'loading' | 'success' | 'error'>('idle');
	let message = $state('');

	async function subscribe() {
		if (!email || !email.includes('@')) {
			status = 'error';
			message = 'Vui lòng nhập email hợp lệ';
			return;
		}
		status = 'loading';
		try {
			const res = await api<any>('/public/newsletter/subscribe', {
				method: 'POST',
				body: { email },
			});
			status = res.success ? 'success' : 'error';
			message = res.message || '';
			if (res.success) email = '';
		} catch (e: any) {
			status = 'error';
			message = e.message || 'Có lỗi xảy ra';
		}
	}
</script>

<div class="newsletter-box">
	<div class="newsletter-icon">📬</div>
	<h3>Đăng ký nhận tin</h3>
	<p>Nhận thông báo chapter mới, cập nhật tính năng và tin tức hấp dẫn.</p>

	{#if status === 'success'}
		<div class="nl-msg success">{message}</div>
	{:else}
		<form class="nl-form" onsubmit={(e) => { e.preventDefault(); subscribe(); }}>
			<input
				type="email"
				bind:value={email}
				placeholder="your@email.com"
				disabled={status === 'loading'}
			/>
			<button type="submit" class="btn-brand" disabled={status === 'loading'}>
				{status === 'loading' ? '...' : 'Đăng ký'}
			</button>
		</form>
		{#if status === 'error'}
			<div class="nl-msg error">{message}</div>
		{/if}
	{/if}
</div>

<style>
	.newsletter-box {
		text-align: center;
		padding: 2rem 1.5rem;
		background: linear-gradient(135deg, rgba(12,113,61,.08), rgba(6,182,212,.06));
		border: 1px solid rgba(12,113,61,.12);
		border-radius: var(--radius-lg);
	}
	.newsletter-icon { font-size: 1.75rem; margin-bottom: 0.5rem; }
	h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; }
	p { font-size: 0.82rem; color: var(--color-text-muted); margin-bottom: 1rem; max-width: 360px; margin-inline: auto; }
	.nl-form { display: flex; gap: 0.4rem; max-width: 380px; margin: 0 auto; }
	input {
		flex: 1; padding: 0.55rem 0.75rem;
		background: var(--color-surface-200); border: 1px solid rgba(255,255,255,.08);
		border-radius: var(--radius-sm); color: var(--color-text-primary);
		font-family: inherit; font-size: 0.85rem;
	}
	input:focus { outline: none; border-color: var(--color-brand-500); }
	.nl-msg { font-size: 0.8rem; margin-top: 0.5rem; padding: 0.35rem 0.6rem; border-radius: 4px; display: inline-block; }
	.nl-msg.success { background: rgba(34,197,94,.1); color: #22c55e; }
	.nl-msg.error { background: rgba(239,68,68,.1); color: #f87171; }
</style>
