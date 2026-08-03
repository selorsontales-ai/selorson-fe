<script lang="ts">
	/**
	 * World Studio.
	 *
	 * The workspace is behind a dynamic import: Svelte Flow and Three.js together
	 * are a large payload, and every other admin screen should stay clear of it.
	 */
	import { onMount } from 'svelte';

	let Shell = $state<typeof import('$lib/world-studio/StudioShell.svelte').default | null>(null);
	let failed = $state(false);

	onMount(async () => {
		try {
			Shell = (await import('$lib/world-studio/StudioShell.svelte')).default;
		} catch {
			failed = true;
		}
	});
</script>

<svelte:head><title>Admin — World Studio</title></svelte:head>

{#if Shell}
	<Shell />
{:else if failed}
	<div class="studio-msg">
		<p>Không tải được xưởng thiết kế.</p>
		<a href="/admin/library">Về Quản lý Library</a>
	</div>
{:else}
	<div class="studio-msg"><span class="spinner"></span>Đang mở xưởng…</div>
{/if}

<style>
	.studio-msg {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		height: 60vh;
		color: var(--color-text-muted, #94a3b8);
		font-size: 0.9rem;
	}
	.studio-msg a {
		color: var(--color-brand-300, #4ade80);
	}
	.spinner {
		width: 1.6rem;
		height: 1.6rem;
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-top-color: var(--color-brand-500, #0c713d);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
