<script lang="ts">
	import { page } from '$app/stores';
	import { PUBLIC_API_BASE } from '$env/static/public';

	let status = $state<'loading' | 'success' | 'error'>('loading');
	let message = $state('');

	import { onMount } from 'svelte';
	onMount(async () => {
		const token = $page.url.searchParams.get('token');
		if (!token) { status = 'error'; message = 'Token không hợp lệ'; return; }
		try {
			const res = await fetch(`${PUBLIC_API_BASE}/newsletter/unsubscribe`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});
			const data = await res.json();
			if (data.success) { status = 'success'; message = 'Bạn đã hủy đăng ký thành công.'; }
			else { status = 'error'; message = data.message || 'Có lỗi xảy ra'; }
		} catch { status = 'error'; message = 'Lỗi kết nối'; }
	});
</script>

<svelte:head><title>Hủy đăng ký — Selorson</title></svelte:head>

<div class="unsub-page">
	<div class="unsub-card">
		{#if status === 'loading'}
			<div class="spinner"></div>
			<p>Đang xử lý...</p>
		{:else if status === 'success'}
			<div class="icon">✅</div>
			<h2>Đã hủy đăng ký!</h2>
			<p>{message}</p>
			<a href="/" class="btn">← Quay về trang chủ</a>
		{:else}
			<div class="icon">❌</div>
			<h2>Lỗi</h2>
			<p>{message}</p>
			<a href="/" class="btn">← Quay về trang chủ</a>
		{/if}
	</div>
</div>

<style>
	.unsub-page { display: flex; align-items: center; justify-content: center; min-height: 60vh; padding: 2rem; }
	.unsub-card { text-align: center; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 16px; padding: 3rem 2rem; max-width: 400px; width: 100%; }
	.icon { font-size: 3rem; margin-bottom: 1rem; }
	.unsub-card h2 { font-size: 1.5rem; margin-bottom: 0.5rem; }
	.unsub-card p { color: var(--color-text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem; }
	.btn { display: inline-block; padding: 0.5rem 1.25rem; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: var(--color-text-secondary); text-decoration: none; font-size: 0.85rem; }
	.btn:hover { border-color: var(--color-brand-500); color: var(--color-text-primary); }
	.spinner { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,.1); border-top-color: var(--color-brand-500); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
