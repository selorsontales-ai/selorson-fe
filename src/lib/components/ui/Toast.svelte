<script lang="ts">
	let toasts = $state<{id: number; message: string; type: 'success'|'error'|'info'}[]>([]);
	let counter = 0;

	export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
		const id = ++counter;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, duration);
	}
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}">
				<span class="toast-icon">
					{#if toast.type === 'success'}✅
					{:else if toast.type === 'error'}❌
					{:else}ℹ️{/if}
				</span>
				<span>{toast.message}</span>
				<button class="toast-close" onclick={() => toasts = toasts.filter(t => t.id !== toast.id)}>×</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed; top: 80px; right: 1.5rem; z-index: 9999;
		display: flex; flex-direction: column; gap: 0.5rem; max-width: 360px;
	}
	.toast {
		display: flex; align-items: center; gap: 0.5rem;
		padding: 0.75rem 1rem; border-radius: 10px;
		backdrop-filter: blur(16px);
		animation: slideIn 0.25s ease;
		font-size: 0.85rem; color: var(--color-text-primary);
	}
	.toast-success { background: rgba(34,197,94,.15); border: 1px solid rgba(34,197,94,.25); }
	.toast-error { background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.25); }
	.toast-info { background: rgba(59,130,246,.15); border: 1px solid rgba(59,130,246,.25); }
	.toast-close { background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 1.1rem; margin-left: auto; padding: 0; }
	@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
</style>
