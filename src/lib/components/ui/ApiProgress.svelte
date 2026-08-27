<!--
	Thanh tiến trình chạy ngang đỉnh màn hình khi có request admin đang bay.

	Mount đúng một lần ở `src/routes/+layout.svelte`. Không có prop, không cần
	gọi từ đâu cả: mọi thao tác admin đều đi qua các helper trong
	`$lib/stores/admin.svelte`, và các helper đó đã tự đếm request.
-->
<script lang="ts">
	import { isBusy } from '$lib/stores/admin.svelte';

	let busy = $derived(isBusy());

	let visible = $state(false);
	/** Phần trăm đã chạy. Bò dần tới 92% rồi đứng chờ, xong việc mới vọt lên 100%. */
	let percent = $state(0);
	let finishing = $state(false);

	$effect(() => {
		if (busy) {
			visible = true;
			finishing = false;
			percent = 8;
			// Tiến chậm dần: luôn có chuyển động nhưng không bao giờ chạm vạch
			// đích khi chưa có phản hồi, nên thanh không "nói dối" người dùng.
			const tick = setInterval(() => {
				percent += (92 - percent) * 0.14;
			}, 140);
			return () => clearInterval(tick);
		}

		if (!visible) return;

		finishing = true;
		percent = 100;
		const hide = setTimeout(() => {
			visible = false;
			finishing = false;
			percent = 0;
		}, 420);
		return () => clearTimeout(hide);
	});
</script>

{#if visible}
	<div class="api-progress" class:finishing aria-hidden="true">
		<div class="bar" style="width: {percent}%"></div>
	</div>
{/if}

<style>
	.api-progress {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 10000;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}
	.api-progress.finishing { opacity: 0; }

	.bar {
		height: 100%;
		border-radius: 0 2px 2px 0;
		background: linear-gradient(
			90deg,
			var(--color-brand-600, #16a34a),
			var(--color-brand-400, #4ade80),
			var(--color-brand-600, #16a34a)
		);
		background-size: 200% 100%;
		box-shadow: 0 0 8px var(--color-brand-500, #22c55e);
		transition: width 0.28s ease-out;
		animation: sheen 1.1s linear infinite;
	}

	/* Ánh sáng trượt dọc thanh — thứ tạo cảm giác "đang chạy". */
	@keyframes sheen {
		from { background-position: 100% 0; }
		to { background-position: -100% 0; }
	}

	@media (prefers-reduced-motion: reduce) {
		.bar { animation: none; transition: none; }
	}
</style>
