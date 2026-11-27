<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		acknowledgeProductionData,
		getDataMode,
		switchDataMode,
	} from "$lib/desktop-mode.svelte";
	
	let leaving = $state(false);
	let switching = $state(false);
	let error = $state<string | null>(null);
	let enterBtn = $state<HTMLButtonElement | null>(null);

	const status = $derived(getDataMode());

	onMount(() => {
		enterBtn?.focus();
	});

	function enter() {
		leaving = true;
		// Let the exit animation finish before the app behind it appears.
		setTimeout(acknowledgeProductionData, 260);
	}

	async function goLocal() {
		if (switching) return;
		switching = true;
		error = null;
		const failure = await switchDataMode("local");
		if (failure) {
			error = failure;
			switching = false;
		}
	}
</script>

<div class="gate" class:leaving role="dialog" aria-modal="true" aria-labelledby="gate-title">
	<div class="aura" aria-hidden="true"></div>
	<div class="grain" aria-hidden="true"></div>

	<div class="card">
		<div class="badge" style="--i: 0">
			<span class="dot" aria-hidden="true"></span>
			{m.ui_live_production_mode()}
		</div>

		<h1 id="gate-title" style="--i: 1">{m.ui_you_are_opening_live_production()}</h1>

		<p class="lede" style="--i: 2">
			{m.ui_every_change_in_this_session()}
		</p>

		<dl class="facts" style="--i: 3">
			<div>
				<dt>{m.ui_database()}</dt>
				<dd>{m.ui_production_database()}</dd>
			</div>
			<div>
				<dt>{m.ui_newsletter()}</dt>
				<dd>{m.ui_handled_by_server_this_desktop()}</dd>
			</div>
		</dl>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<div class="actions" style="--i: 4">
			<button class="enter" bind:this={enterBtn} onclick={enter} disabled={switching}>
				{m.ui_i_understand_continue()}
			</button>
			<button class="btn-ghost" onclick={goLocal} disabled={switching}>
				{switching ? m.ui_restarting() : m.ui_switch_to_local_beta_mode()}
			</button>
		</div>

		{#if status}
			<p class="path" style="--i: 5">{status.config_path}</p>
		{/if}
	</div>
</div>

<style>
	.gate {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: var(--color-surface-0);
		overflow: hidden;
		animation: gateIn 0.35s var(--ease-spring) both;
	}

	.gate.leaving {
		animation: gateOut 0.26s var(--ease-spring) both;
	}

	/* A slow breathing glow: the danger is a state you are sitting inside,
	   not an alert that fires once. */
	.aura {
		position: absolute;
		width: min(120vw, 1100px);
		height: min(120vw, 1100px);
		border-radius: 50%;
		background: radial-gradient(
			circle,
			rgba(196, 62, 42, 0.22) 0%,
			rgba(196, 62, 42, 0.08) 42%,
			transparent 68%
		);
		animation: breathe 7s ease-in-out infinite;
		pointer-events: none;
	}

	.grain {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			rgba(255, 255, 255, 0.014) 0 1px,
			transparent 1px 3px
		);
		pointer-events: none;
	}

	.card {
		position: relative;
		width: min(100%, 34rem);
		padding: clamp(1.5rem, 4vw, 2.5rem);
		border-radius: var(--radius-lg);
		background: linear-gradient(
			135deg,
			rgba(30, 20, 20, 0.86),
			rgba(18, 18, 26, 0.72)
		);
		backdrop-filter: blur(18px);
		border: 1px solid rgba(196, 62, 42, 0.28);
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
	}

	/* Each line arrives just after the one above it, so the eye is walked down
	   the consequence before it reaches the buttons. */
	.card > :global(*) {
		animation: riseIn 0.5s var(--ease-spring) both;
		animation-delay: calc(0.06s * var(--i, 0) + 0.1s);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		align-self: flex-start;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.16em;
		color: #ff8a75;
		background: rgba(196, 62, 42, 0.14);
		border: 1px solid rgba(196, 62, 42, 0.3);
		padding: 0.35rem 0.7rem;
		border-radius: var(--radius-sm);
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #e8543c;
		animation: blink 1.8s ease-in-out infinite;
	}

	h1 {
		font-family: var(--font-serif);
		font-size: clamp(1.6rem, 4vw, 2.1rem);
		font-weight: 700;
		line-height: 1.2;
		margin: 0;
		color: #f8fafc;
		text-wrap: balance;
	}

	.lede {
		margin: 0;
		color: rgba(241, 245, 249, 0.84);
		line-height: 1.65;
	}

	.facts {
		margin: 0;
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem 1rem;
		border-radius: var(--radius-md);
		background: rgba(0, 0, 0, 0.28);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.facts > div {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
	}

	.facts dt {
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(203, 213, 225, 0.68);
		min-width: 7.5rem;
		flex-shrink: 0;
	}

	.facts dd {
		margin: 0;
		font-size: 0.9rem;
		color: #f1f5f9;
	}

	.error {
		margin: 0;
		font-size: 0.88rem;
		color: #ff8a75;
		background: rgba(196, 62, 42, 0.12);
		border-left: 2px solid #e8543c;
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius-sm);
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 0.15rem;
	}

	.enter {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.7rem 1.6rem;
		border: none;
		border-radius: var(--radius-md);
		background: linear-gradient(135deg, #c43e2a, #a3301f);
		color: #fff;
		font-weight: 600;
		font-size: 0.92rem;
		cursor: pointer;
		transition: all 0.25s var(--ease-spring);
	}

	.enter:hover:not(:disabled) {
		background: linear-gradient(135deg, #d94c36, #b83726);
		box-shadow: 0 0 26px rgba(196, 62, 42, 0.45);
		transform: translateY(-1px);
	}

	.btn-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.7rem 1.25rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.05);
		color: rgba(241, 245, 249, 0.88);
		font-weight: 500;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-ghost:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.3);
		color: #fff;
	}

	.enter:disabled,
	.btn-ghost:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.path {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: rgba(203, 213, 225, 0.62);
		word-break: break-all;
	}

	@keyframes gateIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes gateOut {
		from {
			opacity: 1;
			transform: scale(1);
		}
		to {
			opacity: 0;
			transform: scale(1.015);
		}
	}

	@keyframes riseIn {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes breathe {
		0%,
		100% {
			transform: scale(0.94);
			opacity: 0.75;
		}
		50% {
			transform: scale(1.06);
			opacity: 1;
		}
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
			box-shadow: 0 0 0 0 rgba(232, 84, 60, 0.55);
		}
		50% {
			opacity: 0.55;
			box-shadow: 0 0 0 5px rgba(232, 84, 60, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.gate,
		.gate.leaving,
		.card > :global(*),
		.aura,
		.dot {
			animation: none;
		}
	}
</style>
