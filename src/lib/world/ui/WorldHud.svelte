<script lang="ts">
	/**
	 * Overlay for the globe: region list on the left, detail on the right,
	 * progress along the bottom. Plain DOM on top of the canvas — it stays
	 * readable, selectable and translatable, which a canvas-drawn HUD would not.
	 */
	import * as m from '$lib/paraglide/messages';
	import type { WorldNode, WorldProgress } from '../types';

	interface Props {
		regions: WorldNode[];
		locations: WorldNode[];
		/** Characters whose journeys the reader may follow. */
		characters: WorldNode[];
		progress: WorldProgress;
		selected: WorldNode | null;
		onselect: (node: WorldNode | null) => void;
		onenter: (node: WorldNode) => void;
	}

	let { regions, locations, characters, progress, selected, onselect, onenter }: Props = $props();

	/** Places belonging to the selected region, so the panel can list them. */
	let childPlaces = $derived(
		selected?.kind === 'region'
			? locations.filter((l) => l.region === selected.slug && l.state !== 'hidden')
			: []
	);

	function label(node: WorldNode): string {
		return node.name ?? m.world_unknown_place();
	}

	function stateLabel(node: WorldNode): string | null {
		if (node.state === 'rumored') return m.world_state_rumored();
		if (node.state === 'hidden') return m.world_state_hidden();
		return null;
	}
</script>

<div class="hud">
	<aside class="panel list-panel">
		<h2 class="panel-head">{m.world_regions()}</h2>
		<ul class="node-list">
			{#each regions as region (region.id)}
				<li>
					<button
						class="node-btn"
						class:active={selected?.id === region.id}
						class:dim={region.state !== 'revealed'}
						onclick={() => onselect(region)}
					>
						<span class="node-name">{label(region)}</span>
						{#if stateLabel(region)}
							<span class="node-state">{stateLabel(region)}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>

		{#if characters.length}
			<h2 class="panel-head journeys-head">{m.world_journeys()}</h2>
			<ul class="node-list">
				{#each characters as person (person.id)}
					<li>
						<a class="journey-link" href="/world/journey/{person.id}">
							{#if person.image_url}
								<img src={person.image_url} alt={label(person)} />
							{:else}
								<span class="journey-dot" style="background:{person.color ?? '#2fe36b'}"></span>
							{/if}
							<span class="journey-name">{label(person)}</span>
							<span class="journey-go">›</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	{#if selected}
		<section class="panel detail-panel">
			<button class="close" onclick={() => onselect(null)} aria-label="close">×</button>
			<h2 class="detail-title">{label(selected)}</h2>
			<p class="detail-kind">{selected.kind}</p>

			{#if selected.state === 'revealed'}
				{#if selected.image_url}
					<img class="detail-img" src={selected.image_url} alt={label(selected)} />
				{/if}
				{#if selected.description}
					<p class="detail-desc">{selected.description}</p>
				{/if}
				{#if selected.chapters?.length}
					<p class="detail-meta">
						{m.world_appears_in()}
						{selected.chapters.join(', ')}
					</p>
				{/if}
				{#if childPlaces.length}
					<ul class="child-list">
						{#each childPlaces as place (place.id)}
							<li>
								<button class="child-btn" onclick={() => onselect(place)}>
									{label(place)}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if selected.kind === 'region'}
					<button class="enter-btn" onclick={() => onenter(selected)}>
						{m.world_enter_region()}
					</button>
				{/if}
				{#if selected.story_link}
					<a class="chapter-link" href={selected.story_link}>{m.world_read_chapter()}</a>
				{/if}
			{:else}
				<p class="detail-locked">{m.world_locked_hint()}</p>
			{/if}
		</section>
	{/if}

	<footer class="panel progress-panel">
		<span class="progress-label">
			{m.world_progress()}
			<strong>{progress.percent}%</strong>
			<span class="progress-count">({progress.revealed}/{progress.placed})</span>
		</span>
		<div class="progress-track">
			<div class="progress-fill" style="width:{progress.percent}%"></div>
		</div>
		{#if progress.is_guest}
			<span class="progress-hint">{m.world_guest_hint()}</span>
		{/if}
	</footer>
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		z-index: 5;
		pointer-events: none;
		display: grid;
		grid-template-columns: minmax(0, 18rem) 1fr minmax(0, 21rem);
		grid-template-rows: 1fr auto;
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

	.list-panel {
		grid-column: 1;
		grid-row: 1;
		overflow-y: auto;
		max-height: 100%;
	}
	.detail-panel {
		grid-column: 3;
		grid-row: 1;
		overflow-y: auto;
		max-height: 100%;
		position: relative;
	}
	.progress-panel {
		grid-column: 1 / -1;
		grid-row: 2;
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.65rem 1rem;
	}

	.panel-head {
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.75rem;
	}

	.node-list,
	.child-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.node-btn,
	.child-btn {
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
		transition: background 0.18s, border-color 0.18s, transform 0.18s;
	}
	.node-btn:hover,
	.child-btn:hover {
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

	.journeys-head {
		margin-top: 1.4rem;
	}
	.journey-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.04);
		color: inherit;
		font-size: 0.82rem;
		text-decoration: none;
		transition: background 0.18s, transform 0.18s;
	}
	.journey-link:hover {
		background: rgba(255, 255, 255, 0.09);
		transform: translateX(3px);
	}
	.journey-link img {
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		object-fit: cover;
		flex: none;
	}
	.journey-dot {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		flex: none;
	}
	.journey-name {
		flex: 1;
	}
	.journey-go {
		color: var(--color-text-muted, #94a3b8);
	}

	.node-name {
		display: block;
	}
	.node-state {
		display: block;
		font-size: 0.68rem;
		color: var(--color-text-muted, #94a3b8);
		margin-top: 0.1rem;
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
		font-size: 1.15rem;
		margin: 0 0 0.15rem;
		padding-right: 1.5rem;
	}
	.detail-kind {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-accent-purple, #8b5cf6);
		margin: 0 0 0.75rem;
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
		margin: 0 0 0.75rem;
	}

	.enter-btn {
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.6rem;
		border: none;
		border-radius: 6px;
		background: var(--color-brand-500, #0c713d);
		color: #fff;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.enter-btn:hover {
		filter: brightness(1.15);
	}
	.chapter-link {
		display: inline-block;
		margin-top: 0.6rem;
		font-size: 0.8rem;
		color: var(--color-brand-300, #4ade80);
	}

	.progress-label {
		font-size: 0.8rem;
		color: var(--color-text-muted, #94a3b8);
	}
	.progress-count {
		opacity: 0.7;
	}
	.progress-track {
		flex: 1;
		min-width: 8rem;
		height: 5px;
		border-radius: 99px;
		background: rgba(255, 255, 255, 0.12);
		overflow: hidden;
	}
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--color-brand-500, #0c713d), #00f0ff);
		transition: width 0.5s ease;
	}
	.progress-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted, #94a3b8);
	}

	@media (max-width: 900px) {
		.hud {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr auto;
			padding: 0.6rem;
			gap: 0.6rem;
		}
		.list-panel {
			grid-column: 1;
			grid-row: 1;
			max-height: 8rem;
		}
		.detail-panel {
			grid-column: 1;
			grid-row: 2;
			align-self: end;
			max-height: 45vh;
		}
		.progress-panel {
			grid-column: 1;
			grid-row: 3;
		}
	}
</style>
