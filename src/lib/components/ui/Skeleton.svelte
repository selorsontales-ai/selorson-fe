<script lang="ts">
	let { lines = 3, width = '100%' } = $props<{ lines?: number; width?: string }>();
</script>

<div class="skeleton-wrap" style:width={width}>
	{#each Array(lines) as _, i}
		<div class="skeleton-line" style:width={i === lines - 1 ? '60%' : '100%'}></div>
	{/each}
</div>

<style>
	.skeleton-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.skeleton-line {
		height: 14px;
		border-radius: 6px;
		background: linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s ease-in-out infinite;
	}
</style>
