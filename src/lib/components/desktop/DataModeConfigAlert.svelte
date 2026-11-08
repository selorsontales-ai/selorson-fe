<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	// The app started without database credentials. The embedded backend dies on
	// its own thread when that happens, so every page below renders its empty
	// state and looks merely idle. This bar is the only thing that separates
	// "there is no data yet" from "this window can never load anything".
	import { getConfigProblem } from "$lib/desktop-mode.svelte";
	
	const problem = $derived(getConfigProblem());
	let copied = $state(false);

	// The path is long, exact, and the whole fix. Retyping it from a screenshot
	// is where people give up, so it is one click instead.
	async function copyPath() {
		if (!problem) return;
		const path = problem.split("\n").pop()?.trim();
		if (!path) return;
		try {
			await navigator.clipboard.writeText(path);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}
</script>

{#if problem}
	<div class="bar" role="alert">
		<span class="mark" aria-hidden="true">!</span>
		<div class="body">
			<strong>{m.ui_app_is_running_without_backend()}</strong>
			<span class="detail">{problem.split("\n")[0]}</span>
			<code class="path">{problem.split("\n").pop()}</code>
		</div>
		<button type="button" onclick={copyPath}>
			{copied ? m.ui_copied() : m.ui_copy_path()}
		</button>
	</div>
{/if}

<style>
	/* Fixed and not dismissible: the condition it reports does not go away while
	   the app is open, and a bar you can close is one you close and forget. */
	.bar {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 9000;
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.7rem 1.1rem;
		background: #2a1408;
		border-top: 1px solid rgba(240, 160, 64, 0.45);
		box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.45);
		font-size: 0.82rem;
		color: #f4e3cc;
	}

	.mark {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 50%;
		background: var(--color-accent-gold, #f0c040);
		color: #2a1408;
		font-weight: 800;
		line-height: 1;
	}

	.body {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.6rem;
		min-width: 0;
		flex: 1;
	}

	.detail {
		color: rgba(244, 227, 204, 0.75);
	}

	/* The path is the payload, so it survives a narrow window rather than being
	   clipped: wrapping mid-path is ugly, losing the tail is useless. */
	.path {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.75rem;
		color: var(--color-accent-gold, #f0c040);
		overflow-wrap: anywhere;
	}

	button {
		flex-shrink: 0;
		padding: 0.36rem 0.8rem;
		border-radius: 999px;
		border: 1px solid rgba(240, 160, 64, 0.5);
		background: transparent;
		color: var(--color-accent-gold, #f0c040);
		font-size: 0.75rem;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	button:hover {
		background: rgba(240, 160, 64, 0.16);
	}
</style>
