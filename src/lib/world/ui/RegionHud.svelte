<script lang="ts">
	/** Overlay for a region: its places, its visitors, and the way back up. */
	import * as m from '$lib/paraglide/messages';
	import type { WorldNode } from '../types';

	interface Props {
		region: WorldNode;
		places: WorldNode[];
		visitors: WorldNode[];
		selected: WorldNode | null;
		onselect: (node: WorldNode | null) => void;
	}

	let { region, places, visitors, selected, onselect }: Props = $props();

	let visible = $derived(places.filter((p) => p.state !== 'hidden'));

	function label(node: WorldNode): string {
		return node.name ?? m.world_unknown_place();
	}
</script>

<div class="hud">
	<header class="panel top-bar">
		<a class="back" href="/world">← {m.world_back_to_globe()}</a>
		<h1 class="region-name">{label(region)}</h1>
	</header>

	<aside class="panel list-panel">
		<h2 class="panel-head">{m.world_places()} ({visible.length})</h2>
		<ul class="node-list">
			{#each visible as place (place.id)}
				<li>
					<button
						class="node-btn"
						class:active={selected?.id === place.id}
						class:dim={place.state !== 'revealed'}
						onclick={() => onselect(place)}
					>
						{label(place)}
					</button>
				</li>
			{/each}
		</ul>

		{#if visitors.length}
			<h2 class="panel-head visitors-head">{m.world_visitors()}</h2>
			<ul class="visitor-list">
				{#each visitors as person (person.id)}
					<li class="visitor">
						{#if person.image_url}
							<img src={person.image_url} alt={label(person)} />
						{:else}
							<span class="visitor-dot" style="background:{person.color ?? '#2fe36b'}"></span>
						{/if}
						<span>{label(person)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	{#if selected}
		<section class="panel detail-panel">
			<button class="close" onclick={() => onselect(null)} aria-label="close">×</button>
			<h2 class="detail-title">{label(selected)}</h2>
			{#if selected.state === 'revealed'}
				{#if selected.image_url}
					<img class="detail-img" src={selected.image_url} alt={label(selected)} />
				{/if}
				{#if selected.description}
					<p class="detail-desc">{selected.description}</p>
				{/if}
				{#if selected.chapters?.length}
					<p class="detail-meta">{m.world_appears_in()} {selected.chapters.join(', ')}</p>
				{/if}
				{#if selected.story_link}
					<a class="chapter-link" href={selected.story_link}>{m.world_read_chapter()}</a>
				{/if}
			{:else}
				<p class="detail-locked">{m.world_locked_hint()}</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		z-index: 5;
		pointer-events: none;
		display: grid;
		grid-template-columns: minmax(0, 18rem) 1fr minmax(0, 21rem);
		grid-template-rows: auto 1fr;
		gap: 1rem;
		padding: 1rem;
	}
	.panel {
		pointer-events: auto;
		background: rgba(8, 14, 24, 0.78);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg, 12px);
		padding: 1rem;
		color: var(--color-text-primary, #e2e8f0);
	}
	.top-bar {
		grid-column: 1 / -1;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.65rem 1rem;
	}
	.back {
		font-size: 0.82rem;
		color: var(--color-brand-300, #4ade80);
		text-decoration: none;
		white-space: nowrap;
	}
	.region-name {
		font-size: 1.05rem;
		margin: 0;
	}

	.list-panel {
		grid-column: 1;
		grid-row: 2;
		overflow-y: auto;
		max-height: 100%;
	}
	.detail-panel {
		grid-column: 3;
		grid-row: 2;
		overflow-y: auto;
		max-height: 100%;
		position: relative;
	}

	.panel-head {
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.75rem;
	}
	.visitors-head {
		margin-top: 1.25rem;
	}

	.node-list,
	.visitor-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.node-btn {
		width: 100%;
		text-align: left;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid transparent;
		border-left: 3px solid var(--color-brand-500, #0c713d);
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		color: inherit;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		transition: background 0.18s, transform 0.18s;
	}
	.node-btn:hover {
		background: rgba(255, 255, 255, 0.09);
		transform: translateX(3px);
	}
	.node-btn.active {
		background: rgba(255, 183, 3, 0.16);
		border-left-color: #ffb703;
	}
	.node-btn.dim {
		opacity: 0.55;
		border-left-color: #475569;
	}

	.visitor {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}
	.visitor img {
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		object-fit: cover;
	}
	.visitor-dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		display: inline-block;
	}

	.close {
		position: absolute;
		top: 0.5rem;
		right: 0.65rem;
		background: none;
		border: none;
		color: var(--color-text-muted, #94a3b8);
		font-size: 1.4rem;
		line-height: 1;
		cursor: pointer;
	}
	.detail-title {
		font-size: 1.1rem;
		margin: 0 0 0.75rem;
		padding-right: 1.5rem;
	}
	.detail-img {
		width: 100%;
		border-radius: 8px;
		margin-bottom: 0.75rem;
	}
	.detail-desc {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--color-text-secondary, #cbd5e1);
		margin: 0 0 0.75rem;
	}
	.detail-meta,
	.detail-locked {
		font-size: 0.78rem;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.5rem;
	}
	.chapter-link {
		font-size: 0.8rem;
		color: var(--color-brand-300, #4ade80);
	}

	@media (max-width: 900px) {
		.hud {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr;
			padding: 0.6rem;
			gap: 0.6rem;
		}
		.top-bar {
			grid-column: 1;
			grid-row: 1;
		}
		.list-panel {
			grid-column: 1;
			grid-row: 2;
			max-height: 8rem;
		}
		.detail-panel {
			grid-column: 1;
			grid-row: 3;
			align-self: end;
			max-height: 45vh;
		}
	}
</style>
