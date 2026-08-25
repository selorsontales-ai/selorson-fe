<script lang="ts">
	import { getDataMode, openSwitchPrompt } from "$lib/desktop-mode.svelte";

	const status = $derived(getDataMode());
	const isAlpha = $derived(status?.mode === "production");
	// Alpha was asked for and could not be honoured. Saying so is the whole
	// point: without it the app just appears in Beta for no stated reason, and
	// the only visible symptom is that the mode "changed by itself".
	const fellBack = $derived(status?.fell_back === true);
	// Beta can only be left when there is somewhere to go.
	const canSwitch = $derived(isAlpha || status?.production_configured === true);
</script>

{#if status}
	<button
		class="badge"
		class:alpha={isAlpha}
		class:warn={fellBack}
		type="button"
		disabled={!canSwitch && !fellBack}
		onclick={openSwitchPrompt}
		title={isAlpha
			? "Alpha — dữ liệu thật của trang web. Bấm để sang Beta."
			: fellBack
				? `Đã yêu cầu Alpha nhưng thiếu tệp cấu hình, đang chạy Beta.\nCần tạo: ${status.config_path.replace(/backend\.env$/, "backend.production.env")}`
				: canSwitch
					? "Beta — dữ liệu trên máy này. Bấm để sang Alpha."
					: "Beta — dữ liệu trên máy này. Chưa cấu hình Alpha."}
	>
		<span class="dot" aria-hidden="true"></span>
		{isAlpha ? "Alpha" : fellBack ? "Beta — thiếu cấu hình Alpha" : "Beta"}
	</button>
{/if}

<style>
	/* Sits in the brand lockup, so it borrows the wordmark's weight and sits on
	   its optical centre rather than announcing itself as a control. */
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.14rem 0.5rem 0.16rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.78);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		line-height: 1;
		cursor: pointer;
		transition: all 0.22s var(--ease-spring);
		white-space: nowrap;
		align-self: center;
	}

	.badge:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.16);
		border-color: rgba(255, 255, 255, 0.32);
		color: #fff;
	}

	.badge:disabled {
		cursor: default;
		opacity: 0.7;
	}

	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
	}

	/* The word "Alpha" does not say "real data" on its own, so the colour is
	   what carries the meaning. Red, filled, and breathing — unmistakable at a
	   glance even when the label is not read. */
	.badge.alpha {
		background: linear-gradient(135deg, #d1452f, #a3301f);
		border-color: rgba(255, 140, 120, 0.55);
		color: #fff;
		box-shadow: 0 0 0 0 rgba(209, 69, 47, 0.5);
		animation: alphaPulse 2.8s ease-in-out infinite;
	}

	.badge.alpha:hover {
		background: linear-gradient(135deg, #e3523b, #b83726);
		border-color: rgba(255, 170, 150, 0.8);
	}

	.badge.alpha .dot {
		background: #ffd9d1;
		animation: dotPulse 2.8s ease-in-out infinite;
	}

	/* Neither of the two normal states: something was asked for and could not
	   be given. Amber rather than red — nothing is at risk, but the app is not
	   in the mode it was told to be in. */
	.badge.warn {
		background: rgba(240, 192, 64, 0.16);
		border-color: rgba(240, 192, 64, 0.55);
		color: var(--color-accent-gold);
	}

	.badge.warn:hover:not(:disabled) {
		background: rgba(240, 192, 64, 0.26);
		border-color: rgba(240, 192, 64, 0.8);
		color: var(--color-accent-gold);
	}

	.badge.warn .dot {
		background: var(--color-accent-gold);
		animation: dotPulse 1.6s ease-in-out infinite;
	}

	@keyframes alphaPulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(209, 69, 47, 0.45);
		}
		50% {
			box-shadow: 0 0 0 5px rgba(209, 69, 47, 0);
		}
	}

	@keyframes dotPulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.badge.alpha,
		.badge.alpha .dot {
			animation: none;
		}
	}
</style>
