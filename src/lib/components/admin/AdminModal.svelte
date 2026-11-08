<!-- AdminModal.svelte — Reusable modal for admin forms -->
<script lang="ts">
	import { fly, fade } from 'svelte/transition';

	interface Props {
		open: boolean;
		title: string;
		size?: 'sm' | 'md' | 'lg';
		onclose?: () => void;
		children: import('svelte').Snippet;
	}

	let { open = $bindable(), title, size = 'md', onclose, children }: Props = $props();

	function handleClose() {
		open = false;
		onclose?.();
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) handleClose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" transition:fade={{ duration: 200 }} onmousedown={handleOverlayClick}>
		<div class="modal-card {size}" transition:fly={{ y: 20, duration: 250 }}>
			<div class="modal-header">
				<h3>{title}</h3>
				<button class="modal-close-btn" onclick={handleClose}>✕</button>
			</div>
			<div class="modal-body">
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 99999;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal-card {
		background: var(--color-surface-100);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-xl);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		width: 100%;
	}

	:global(html[data-theme='light']) .modal-card {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.08);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.modal-card.sm { max-width: 400px; }
	.modal-card.md { max-width: 540px; }
	.modal-card.lg { max-width: 720px; }

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: clamp(0.9rem, 2.5vw, 1.25rem) clamp(1rem, 3vw, 1.5rem);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	:global(html[data-theme='light']) .modal-header {
		border-bottom-color: rgba(0, 0, 0, 0.06);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-brand-300);
	}

	:global(html[data-theme='light']) .modal-header h3 {
		color: var(--color-brand-500);
	}

	.modal-close-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		background: var(--color-surface-300);
		cursor: pointer;
		font-size: 0.875rem;
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.modal-close-btn:hover {
		background: var(--color-surface-400);
		color: var(--color-text-primary);
	}

	.modal-body {
		padding: clamp(1rem, 3vw, 1.5rem);
	}

	/* ---- Form Elements inside modal ---- */
	.modal-body :global(form) {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.modal-body :global(input),
	.modal-body :global(textarea),
	.modal-body :global(select) {
		width: 100%;
		padding: 0.75rem;
		border: 2px solid var(--color-surface-300);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-family: inherit;
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		transition: border-color 0.2s;
	}

	:global(html[data-theme='light']) .modal-body :global(input),
	:global(html[data-theme='light']) .modal-body :global(textarea),
	:global(html[data-theme='light']) .modal-body :global(select) {
		background: #f9fafb;
		border-color: #e5e7eb;
		color: #333;
	}

	.modal-body :global(input:focus),
	.modal-body :global(textarea:focus),
	.modal-body :global(select:focus) {
		outline: none;
		border-color: var(--color-brand-500);
	}

	.modal-body :global(.field) {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.modal-body :global(.field label) {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.modal-body :global(.form-actions) {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.modal-body :global(.btn-cancel) {
		padding: 0.625rem 1.25rem;
		background: var(--color-surface-300);
		color: var(--color-text-secondary);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.modal-body :global(.btn-cancel:hover) {
		background: var(--color-surface-400);
	}

	.modal-body :global(.btn-save) {
		padding: 0.625rem 1.25rem;
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600));
		color: #fff;
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.modal-body :global(.btn-save:hover) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(12, 113, 61, 0.3);
	}

	.modal-body :global(.btn-save:disabled) {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.modal-body :global(.checkbox-label) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text-primary);
		cursor: pointer;
	}

	.modal-body :global(.checkbox-label input) {
		width: auto;
		accent-color: var(--color-brand-500);
	}

	.modal-body :global(.upload-row) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.modal-body :global(.btn-upload) {
		padding: 0.5rem 1rem;
		background: linear-gradient(135deg, #6366f1, #4f46e5);
		color: #fff;
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.2s;
		align-self: flex-start;
	}

	.modal-body :global(.btn-upload:hover) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
	}

	.modal-body :global(.preview-thumb) {
		width: 100%;
		max-height: 160px;
		object-fit: cover;
		border-radius: var(--radius-md);
		margin-top: 0.25rem;
		border: 2px solid var(--color-surface-300);
	}
</style>
