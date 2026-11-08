<!--
	Thẻ thông báo toàn cục.

	Mount đúng một lần ở `src/routes/+layout.svelte`, đọc thẳng từ store nên mọi
	nơi chỉ cần gọi `toast_success()` / `toast_error()` / `showToast()` của
	`$lib/stores/admin.svelte` là hiện, không cần truyền prop hay bind gì cả.
-->
<script lang="ts">
	import { getToasts, dismissToast } from '$lib/stores/admin.svelte';
	import * as m from '$lib/paraglide/messages';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';

	let toasts = $derived(getToasts());

	const ICON = { success: '✓', error: '✕', info: 'i' } as const;
</script>

{#if toasts.length > 0}
	<div class="toast-container" role="status" aria-live="polite">
		{#each toasts as toast (toast.id)}
			<div
				class="toast toast-{toast.type}"
				animate:flip={{ duration: 220 }}
				in:fly={{ x: 24, duration: 220 }}
				out:fly={{ x: 24, duration: 160 }}
			>
				<span class="toast-icon">{ICON[toast.type]}</span>
				<span class="toast-message">{toast.message}</span>
				<button class="toast-close" aria-label={m.toast_close_aria()} onclick={() => dismissToast(toast.id)}>×</button>
				<!-- Vạch đếm ngược khớp với 3.5s trong store. -->
				<span class="toast-timer"></span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: calc(72px + env(safe-area-inset-top, 0px));
		right: 1.25rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: min(360px, calc(100vw - 2.5rem));
		pointer-events: none;
	}

	.toast {
		position: relative;
		overflow: hidden;
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.7rem 0.85rem;
		border-radius: 12px;
		border: 1px solid var(--toast-line);
		background: var(--color-surface-100);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
		font-size: 0.85rem;
		color: var(--color-text-primary);
	}

	.toast-icon {
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 0.7rem;
		font-weight: 700;
		color: #fff;
		background: var(--toast-accent);
	}

	.toast-message {
		flex: 1;
		min-width: 0;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.toast-close {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
		padding: 0 0.15rem;
	}
	.toast-close:hover { color: var(--color-text-primary); }

	.toast-timer {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: 100%;
		background: var(--toast-accent);
		transform-origin: left;
		animation: toast-countdown 3.5s linear forwards;
	}

	.toast-success { --toast-accent: #22c55e; --toast-line: rgba(34, 197, 94, 0.35); }
	.toast-error { --toast-accent: #ef4444; --toast-line: rgba(239, 68, 68, 0.35); }
	.toast-info { --toast-accent: #3b82f6; --toast-line: rgba(59, 130, 246, 0.35); }

	@keyframes toast-countdown {
		from { transform: scaleX(1); }
		to { transform: scaleX(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.toast-timer { animation: none; opacity: 0.4; }
	}

	@media (max-width: 600px) {
		.toast-container {
			left: 1rem;
			right: 1rem;
			max-width: none;
		}
	}
</style>
