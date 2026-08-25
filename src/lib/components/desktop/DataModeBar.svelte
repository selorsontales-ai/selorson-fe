<script lang="ts">
	import { getDataMode, switchDataMode } from "$lib/desktop-mode.svelte";

	let confirming = $state(false);
	let switching = $state(false);
	let error = $state<string | null>(null);

	const status = $derived(getDataMode());
	const isProduction = $derived(status?.mode === "production");

	async function apply(mode: "local" | "production") {
		if (switching) return;
		switching = true;
		error = null;
		const failure = await switchDataMode(mode);
		if (failure) {
			error = failure;
			switching = false;
			confirming = false;
		}
	}
</script>

{#if status}
	<div class="bar" class:production={isProduction}>
		<span class="label">
			{#if isProduction}
				<span class="dot" aria-hidden="true"></span>
				DỮ LIỆU THẬT
			{:else}
				<span class="dot quiet" aria-hidden="true"></span>
				chế độ thử — máy của tôi
			{/if}
		</span>

		{#if status.fell_back}
			<span class="warn">
				Đã yêu cầu dữ liệu thật nhưng thiếu tệp cấu hình, đang chạy dữ liệu
				thử
			</span>
		{/if}

		<span class="spacer"></span>

		{#if isProduction}
			<button onclick={() => apply("local")} disabled={switching}>
				{switching ? "Đang khởi động lại..." : "Sang chế độ thử"}
			</button>
		{:else if status.production_configured}
			<button onclick={() => (confirming = true)} disabled={switching}>
				Sang dữ liệu thật
			</button>
		{/if}
	</div>

	{#if error}
		<div class="bar error-bar">{error}</div>
	{/if}
{/if}

{#if confirming}
	<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="switch-title">
		<div class="sheet">
			<h2 id="switch-title">Chuyển sang dữ liệu thật?</h2>
			<p>
				App sẽ khởi động lại và kết nối tới cơ sở dữ liệu của trang web. Từ
				lúc đó, mọi thay đổi đều có hiệu lực ngay với người đọc.
			</p>
			<p class="muted">
				Phiên đăng nhập ở chế độ thử vẫn được giữ, không phải đăng nhập lại
				khi quay về.
			</p>
			<div class="sheet-actions">
				<button class="go" onclick={() => apply("production")} disabled={switching}>
					{switching ? "Đang khởi động lại..." : "Chuyển và khởi động lại"}
				</button>
				<button
					class="btn-ghost"
					onclick={() => (confirming = false)}
					disabled={switching}>Ở lại chế độ thử</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.32rem 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		background: var(--color-surface-100);
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-surface-300);
		position: relative;
		z-index: 60;
	}

	/* Loud on purpose. This is the only always-present reminder of which
	   database is on the other end of every click. */
	.bar.production {
		background: linear-gradient(90deg, #7d2618, #b03824 55%, #7d2618);
		background-size: 200% 100%;
		color: #ffe6e0;
		border-bottom-color: #d9412e;
		animation: drift 9s ease-in-out infinite;
		text-transform: uppercase;
		font-weight: 500;
	}

	.label {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #ff7a60;
		animation: blink 1.8s ease-in-out infinite;
		flex-shrink: 0;
	}

	.dot.quiet {
		background: var(--color-surface-400);
		animation: none;
	}

	.warn {
		color: var(--color-accent-gold);
		text-transform: none;
		letter-spacing: 0.02em;
	}

	.spacer {
		flex: 1;
	}

	.bar button {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		padding: 0.22rem 0.7rem;
		border-radius: var(--radius-sm);
		border: 1px solid currentColor;
		background: transparent;
		color: inherit;
		cursor: pointer;
		opacity: 0.85;
		transition: all 0.2s var(--ease-spring);
		white-space: nowrap;
	}

	.bar button:hover:not(:disabled) {
		opacity: 1;
		background: rgba(255, 255, 255, 0.12);
	}

	.bar button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error-bar {
		background: rgba(196, 62, 42, 0.16);
		color: #ff8a75;
		text-transform: none;
		letter-spacing: 0.02em;
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 9998;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: rgba(6, 6, 10, 0.72);
		backdrop-filter: blur(6px);
		animation: fadeOverlay 0.22s var(--ease-spring) both;
	}

	.sheet {
		width: min(100%, 30rem);
		padding: 1.6rem;
		border-radius: var(--radius-lg);
		background: linear-gradient(
			135deg,
			rgba(30, 20, 20, 0.94),
			rgba(18, 18, 26, 0.9)
		);
		border: 1px solid rgba(196, 62, 42, 0.3);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		animation: sheetIn 0.32s var(--ease-spring) both;
	}

	.sheet h2 {
		font-family: var(--font-serif);
		font-size: 1.3rem;
		font-weight: 700;
		margin: 0;
		color: var(--color-text-primary);
	}

	.sheet p {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.sheet p.muted {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.sheet-actions {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}

	.go {
		padding: 0.6rem 1.3rem;
		border: none;
		border-radius: var(--radius-md);
		background: linear-gradient(135deg, #c43e2a, #a3301f);
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.25s var(--ease-spring);
	}

	.go:hover:not(:disabled) {
		box-shadow: 0 0 24px rgba(196, 62, 42, 0.45);
		transform: translateY(-1px);
	}

	.go:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	@keyframes drift {
		0%,
		100% {
			background-position: 0% 0;
		}
		50% {
			background-position: 100% 0;
		}
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
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
		.bar.production,
		.dot,
		.overlay,
		.sheet {
			animation: none;
		}
	}
</style>
