<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import {
		closeSwitchPrompt,
		getDataMode,
		switchDataMode,
	} from "$lib/desktop-mode.svelte";
	import BetaToAlphaPromoteModal from "$lib/components/desktop/BetaToAlphaPromoteModal.svelte";
	
	let switching = $state(false);
	let showPromoteModal = $state(false);
	let error = $state<string | null>(null);

	const status = $derived(getDataMode());
	const toAlpha = $derived(status?.mode !== "production");

	async function apply() {
		if (switching) return;
		switching = true;
		error = null;
		const failure = await switchDataMode(toAlpha ? "production" : "local");
		if (failure) {
			error = failure;
			switching = false;
		}
	}
</script>

{#if showPromoteModal}
	<BetaToAlphaPromoteModal
		open={showPromoteModal}
		onclose={() => {
			showPromoteModal = false;
			closeSwitchPrompt();
		}}
	/>
{:else}
	<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="switch-title">
		<div class="sheet" class:to-alpha={toAlpha}>
			<span class="eyebrow">{toAlpha ? "Beta → Alpha" : "Alpha → Beta"}</span>

			<h2 id="switch-title">
				{toAlpha
					? m.ui_switch_to_live_production_data()
					: m.ui_switch_back_to_local_machine()}
			</h2>

			{#if toAlpha}
				<p>
					{m.ui_the_app_will_restart_and_2()}
				</p>
			{:else}
				<p>
					{m.ui_the_app_will_restart_and()}
				</p>
			{/if}

			<p class="muted">
				{m.ui_your_login_session_in_the()}
			</p>

			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}

			{#if toAlpha}
				<button
					type="button"
					class="promote-btn"
					onclick={() => (showPromoteModal = true)}
					disabled={switching}
				>
					{m.ui_selectively_push_data_to_alpha()}
				</button>
			{/if}

			<div class="actions">
				<button class="go" class:danger={toAlpha} onclick={apply} disabled={switching}>
					{switching
						? m.ui_restarting()
						: m.ui_switch_and_restart()}
				</button>
				<button class="btn-ghost" onclick={closeSwitchPrompt} disabled={switching}>
					{m.ui_stay_here()}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 9998;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: rgba(6, 6, 10, 0.74);
		backdrop-filter: blur(6px);
		animation: fadeOverlay 0.22s var(--ease-spring) both;
	}

	.sheet {
		width: min(100%, 30rem);
		padding: 1.6rem;
		border-radius: var(--radius-lg);
		background: linear-gradient(
			135deg,
			rgba(26, 26, 37, 0.95),
			rgba(18, 18, 26, 0.92)
		);
		border: 1px solid rgba(255, 255, 255, 0.09);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		animation: sheetIn 0.32s var(--ease-spring) both;
	}

	.sheet.to-alpha {
		border-color: rgba(196, 62, 42, 0.34);
		background: linear-gradient(
			135deg,
			rgba(32, 21, 20, 0.95),
			rgba(18, 18, 26, 0.92)
		);
	}

	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.sheet.to-alpha .eyebrow {
		color: #ff8a75;
	}

	h2 {
		font-family: var(--font-serif);
		font-size: 1.3rem;
		font-weight: 700;
		margin: 0;
		color: var(--color-text-primary);
		text-wrap: balance;
	}

	p {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	p.muted {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	p.error {
		font-size: 0.88rem;
		color: #ff8a75;
		background: rgba(196, 62, 42, 0.12);
		border-left: 2px solid #e8543c;
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius-sm);
	}

	.promote-btn {
		width: 100%;
		padding: 0.65rem 1rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(245, 158, 11, 0.45);
		background: linear-gradient(
			135deg,
			rgba(217, 119, 6, 0.25),
			rgba(180, 83, 9, 0.18)
		);
		color: #fde68a;
		font-weight: 700;
		font-size: 0.86rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.promote-btn:hover:not(:disabled) {
		background: linear-gradient(
			135deg,
			rgba(217, 119, 6, 0.38),
			rgba(180, 83, 9, 0.28)
		);
		transform: translateY(-1px);
	}

	.actions {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}

	.go {
		padding: 0.6rem 1.3rem;
		border: none;
		border-radius: var(--radius-md);
		background: linear-gradient(
			135deg,
			var(--color-brand-500),
			var(--color-brand-600)
		);
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.25s var(--ease-spring);
	}

	.go.danger {
		background: linear-gradient(135deg, #c43e2a, #a3301f);
	}

	.go:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 0 24px rgba(12, 113, 61, 0.4);
	}

	.go.danger:hover:not(:disabled) {
		box-shadow: 0 0 24px rgba(196, 62, 42, 0.45);
	}

	.go:disabled,
	.btn-ghost:disabled,
	.promote-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	@keyframes fadeOverlay {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes sheetIn {
		from {
			opacity: 0;
			transform: translateY(16px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.overlay,
		.sheet {
			animation: none;
		}
	}
</style>
