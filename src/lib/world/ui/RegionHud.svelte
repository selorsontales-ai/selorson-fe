<script lang="ts">
	/** Overlay for a region: its places, its visitors, and the way back up. */
	import * as m from '$lib/paraglide/messages';
		import type { WorldNode } from '../types';
	import { isExploredState, isUnlockedState } from '../world-utils';

	interface Props {
		region: WorldNode;
		places: WorldNode[];
		visitors: WorldNode[];
		selected: WorldNode | null;
		onselect: (node: WorldNode | null) => void;
	}

	let { region, places, visitors, selected, onselect }: Props = $props();

	let visible = $derived(places.filter((p) => p.state !== 'hidden'));
	let mobileListOpen = $state(false);

	function selectPlace(node: WorldNode | null) {
		onselect(node);
		if (node) mobileListOpen = false;
	}

	function label(node: WorldNode): string {
		return node.name ?? m.world_unknown_place();
	}
</script>

<div class="hud">
	<header class="panel top-bar">
		<a class="back" href="/world?focus={encodeURIComponent(region.slug)}">
			← {m.world_back_to_globe()}
		</a>
		<h1 class="region-name">{label(region)}</h1>
		<button
			type="button"
			class="mobile-list-toggle"
			class:active={mobileListOpen}
			onclick={() => (mobileListOpen = !mobileListOpen)}
		>
			📋 {m.world_places()} ({visible.length})
		</button>
		{#if isExploredState(region.state)}
			<span class="explored-chip">{m.rhud_explored()}</span>
		{/if}
		{#if region.id > 0}
			<a class="dossier-chip" href="/library?id={region.id}">{m.rhud_region_dossier()}</a>
		{/if}
	</header>

	<aside class="panel list-panel" class:mobile-open={mobileListOpen}>
		<h2 class="panel-head">{m.world_places()} ({visible.length})</h2>
		<ul class="node-list">
			{#each visible as place (place.id)}
				<li>
					<button
						class="node-btn"
						class:active={selected?.id === place.id}
						class:explored={isExploredState(place.state)}
						class:dim={!isUnlockedState(place.state)}
						onclick={() => selectPlace(place)}
					>
						<span>{label(place)}</span>
						{#if isExploredState(place.state)}
							<span class="explored-mark" title={m.rhud_visited()}>✓</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>

		{#if visitors.length}
			<h2 class="panel-head visitors-head">{m.world_visitors()} ({visitors.length})</h2>
			<ul class="visitor-list">
				{#each visitors as person (person.id)}
					<li>
						<a class="visitor" href="/world/journey/{person.id}">
							{#if person.image_url}
								<img src={person.image_url} alt={label(person)} />
							{:else}
								<span class="visitor-dot" style="background:{person.color ?? '#2fe36b'}"></span>
							{/if}
							<span class="visitor-name">{label(person)}</span>
							<span class="visitor-go">🧭</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	{#if selected}
		<section class="panel detail-panel">
			<button class="close" onclick={() => onselect(null)} aria-label="close">×</button>
			<div class="detail-badges">
				{#if selected.terrain}
					<span class="terrain-badge">⛰️ {selected.terrain}</span>
				{/if}
				{#if isExploredState(selected.state)}
					<span class="explored-chip">{m.rhud_explored()}</span>
				{/if}
			</div>
			<h2 class="detail-title">{label(selected)}</h2>
			{#if isUnlockedState(selected.state)}
				{#if selected.image_url}
					<img class="detail-img" src={selected.image_url} alt={label(selected)} />
				{/if}
				{#if selected.description}
					<p class="detail-desc">{selected.description}</p>
				{/if}
				{#if selected.chapters?.length}
					<div class="chapters-block">
						<span class="detail-meta">{m.world_appears_in()}</span>
						<div class="ch-pills">
							{#each selected.chapters as chNum (chNum)}
								<a href="/stories/{chNum}" class="ch-pill">Ch.{chNum}</a>
							{/each}
						</div>
					</div>
				{/if}
				<a class="enter-btn" href="/world/{region.slug}/{selected.slug}">
					🏔️ {m.world_enter_place()}
				</a>
				{#if selected.id > 0}
					<a class="dossier-btn" href="/library?id={selected.id}">
						{m.rhud_encyclopedia_dossier()}
					</a>
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
		--color-text-primary: #f1f5f9;
		--color-text-secondary: #cbd5e1;
		--color-text-muted: #94a3b8;
		color: #f1f5f9;
	}
	.panel {
		pointer-events: auto;
		background: rgba(8, 14, 24, 0.78);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg, 12px);
		padding: 1rem;
		color: #f1f5f9;
	}
	.top-bar {
		grid-column: 1 / -1;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: 0.85rem;
		flex-wrap: wrap;
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
		flex: 1;
	}
	.explored-chip {
		font-size: 0.7rem;
		color: #34d399;
		background: rgba(52, 211, 153, 0.14);
		border: 1px solid rgba(52, 211, 153, 0.3);
		padding: 0.18rem 0.55rem;
		border-radius: 999px;
		font-weight: 600;
	}
	.dossier-chip {
		font-size: 0.76rem;
		color: #7dd3fc;
		background: rgba(56, 189, 248, 0.12);
		border: 1px solid rgba(56, 189, 248, 0.3);
		padding: 0.28rem 0.68rem;
		border-radius: 999px;
		text-decoration: none;
		font-weight: 600;
	}
	.dossier-chip:hover {
		background: rgba(56, 189, 248, 0.22);
	}
	.mobile-list-toggle {
		display: none;
		background: rgba(56, 189, 248, 0.14);
		border: 1px solid rgba(56, 189, 248, 0.35);
		color: #e2e8f0;
		font-size: 0.74rem;
		font-weight: 600;
		padding: 0.28rem 0.65rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.mobile-list-toggle.active {
		background: var(--color-brand-500, #0c713d);
		border-color: #34d399;
		color: #fff;
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
		display: flex;
		align-items: center;
		justify-content: space-between;
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
	.node-btn.explored {
		border-left-color: #34d399;
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
	.explored-mark {
		color: #34d399;
		font-weight: 700;
		font-size: 0.78rem;
	}

	.visitor {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.55rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		font-size: 0.82rem;
		text-decoration: none;
		transition: background 0.18s, transform 0.18s;
	}
	.visitor:hover {
		background: rgba(255, 255, 255, 0.1);
		transform: translateX(3px);
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
	.visitor-name {
		flex: 1;
	}
	.visitor-go {
		font-size: 0.78rem;
		opacity: 0.75;
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
	.detail-badges {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 0.35rem;
	}
	.terrain-badge {
		font-size: 0.68rem;
		color: #38bdf8;
		background: rgba(56, 189, 248, 0.12);
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
	}
	.detail-title {
		font-size: 1.1rem;
		margin: 0 0 0.75rem;
		padding-right: 1.5rem;
	}
	.detail-img {
		width: 100%;
		max-height: 11rem;
		object-fit: cover;
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
		display: block;
		font-size: 0.78rem;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.45rem;
	}
	.chapters-block {
		margin-bottom: 0.75rem;
	}
	.ch-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.ch-pill {
		font-size: 0.72rem;
		padding: 0.18rem 0.5rem;
		border-radius: 999px;
		background: rgba(56, 189, 248, 0.14);
		border: 1px solid rgba(56, 189, 248, 0.3);
		color: #7dd3fc;
		text-decoration: none;
		font-weight: 600;
	}
	.chapter-link {
		display: block;
		text-align: center;
		margin-top: 0.45rem;
		font-size: 0.8rem;
		color: var(--color-brand-300, #4ade80);
	}
	.enter-btn {
		display: block;
		width: 100%;
		margin: 0.5rem 0 0.45rem;
		padding: 0.6rem;
		border-radius: 6px;
		background: var(--color-brand-500, #0c713d);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
	}
	.enter-btn:hover {
		filter: brightness(1.15);
	}
	.dossier-btn {
		display: block;
		width: 100%;
		padding: 0.52rem;
		border-radius: 6px;
		border: 1px solid rgba(56, 189, 248, 0.35);
		background: rgba(56, 189, 248, 0.1);
		color: #7dd3fc;
		font-size: 0.82rem;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
	}
	.dossier-btn:hover {
		background: rgba(56, 189, 248, 0.2);
	}

	@media (max-width: 1024px) {
		.hud {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr;
			padding: 0.6rem;
			gap: 0.6rem;
		}
		.mobile-list-toggle {
			display: inline-flex;
			align-items: center;
			gap: 0.25rem;
		}
		.top-bar {
			grid-column: 1;
			grid-row: 1;
		}
		.list-panel {
			grid-column: 1;
			grid-row: 2;
			max-height: 40dvh;
			display: none;
		}
		.list-panel.mobile-open {
			display: block;
		}
		.detail-panel {
			grid-column: 1;
			grid-row: 3;
			align-self: end;
			max-height: 45dvh;
		}
	}
</style>
