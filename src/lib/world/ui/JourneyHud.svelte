<script lang="ts">
	/**
	 * Overlay for a journey: the timeline along the bottom, and what happened at
	 * the current stop on the right.
	 *
	 * The timeline is the reading device. Each notch is a chapter; stepping
	 * through it is stepping through the story, and every stop offers the way
	 * back into the chapter it came from.
	 */
	import * as m from '$lib/paraglide/messages';
	import type { JourneyStop, WorldNode } from '../types';

	interface Props {
		character: WorldNode;
		/** Unlocked stops, in chapter order — same indices the scene uses. */
		stops: JourneyStop[];
		/** Stops beyond the reader's progress, shown as a locked tail. */
		lockedCount: number;
		index: number;
		playing: boolean;
		onindex: (value: number) => void;
		onplay: (value: boolean) => void;
	}

	let { character, stops, lockedCount, index, playing, onindex, onplay }: Props = $props();

	let current = $derived(stops[Math.min(index, stops.length - 1)] ?? null);
	let colour = $derived(character.color ?? '#2fe36b');

	function label(node: WorldNode): string {
		return node.name ?? m.world_unknown_place();
	}
</script>

<div class="hud">
	<header class="panel top-bar">
		<a class="back" href="/world">← {m.world_back_to_globe()}</a>
		{#if character.image_url}
			<img class="face" src={character.image_url} alt={label(character)} />
		{:else}
			<span class="face dot" style="background:{colour}"></span>
		{/if}
		<h1 class="who">
			<span class="who-label">{m.world_journey_of()}</span>
			{label(character)}
		</h1>
	</header>

	{#if current}
		<section class="panel detail-panel">
			<p class="stop-index">
				{m.world_journey_stop()}
				{index + 1}/{stops.length}
			</p>
			<h2 class="stop-title">
				{m.world_chapter()}
				{current.chapter_number}{current.chapter_title ? ` — ${current.chapter_title}` : ''}
			</h2>
			<p class="stop-role">{current.role}</p>

			{#if current.places.length}
				<ul class="place-list">
					{#each current.places as place (place.id)}
						<li>
							<span class="place-name">{label(place)}</span>
							{#if place.description}
								<span class="place-desc">{place.description}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if current.acquired.length}
				<h3 class="acquired-head">{m.world_acquired()}</h3>
				<ul class="acquired-list">
					{#each current.acquired as item (item.id)}
						<li class="acquired">
							{#if item.image_url}
								<img src={item.image_url} alt={item.name} />
							{:else}
								<span class="acquired-dot"></span>
							{/if}
							<span>{item.name}</span>
							<span class="acquired-role">{item.role}</span>
						</li>
					{/each}
				</ul>
			{/if}

			<a class="chapter-link" href="/stories/{current.chapter_number}">
				{m.world_read_chapter()}
				{current.chapter_number}
			</a>
		</section>
	{/if}

	<footer class="panel timeline">
		<button
			class="play"
			onclick={() => onplay(!playing)}
			aria-label={playing ? m.world_pause() : m.world_play()}
		>
			{playing ? '❚❚' : '▶'}
		</button>

		<ol class="notches" style="--journey-color:{colour}">
			{#each stops as stop, i (stop.chapter_id)}
				<li>
					<button
						class="notch"
						class:done={i < index}
						class:active={i === index}
						onclick={() => onindex(i)}
						title="{m.world_chapter()} {stop.chapter_number}"
						aria-label="{m.world_chapter()} {stop.chapter_number}"
					>
						<span class="notch-num">{stop.chapter_number}</span>
					</button>
				</li>
			{/each}
			{#each Array(lockedCount) as _, i (i)}
				<li>
					<span class="notch locked" title={m.world_chapter_locked()}>?</span>
				</li>
			{/each}
		</ol>
	</footer>
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		z-index: 5;
		pointer-events: none;
		display: grid;
		grid-template-columns: 1fr minmax(0, 22rem);
		grid-template-rows: auto 1fr auto;
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
		gap: 0.85rem;
		padding: 0.6rem 1rem;
	}
	.back {
		font-size: 0.82rem;
		color: var(--color-brand-300, #4ade80);
		text-decoration: none;
		white-space: nowrap;
	}
	.face {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		object-fit: cover;
		flex: none;
	}
	.face.dot {
		display: inline-block;
	}
	.who {
		font-size: 1.02rem;
		margin: 0;
	}
	.who-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted, #94a3b8);
		display: block;
	}

	.detail-panel {
		grid-column: 2;
		grid-row: 2;
		overflow-y: auto;
		max-height: 100%;
		align-self: start;
	}
	.stop-index {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.3rem;
	}
	.stop-title {
		font-size: 1rem;
		margin: 0 0 0.2rem;
		line-height: 1.4;
	}
	.stop-role {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-accent-purple, #8b5cf6);
		margin: 0 0 0.8rem;
	}

	.place-list,
	.acquired-list {
		list-style: none;
		margin: 0 0 0.9rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.place-name {
		display: block;
		font-size: 0.88rem;
		font-weight: 600;
	}
	.place-desc {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 0.8rem;
		line-height: 1.55;
		color: var(--color-text-muted, #94a3b8);
	}

	.acquired-head {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.5rem;
	}
	.acquired {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
	}
	.acquired img {
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 4px;
		object-fit: cover;
	}
	.acquired-dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: #ffb703;
		display: inline-block;
	}
	.acquired-role {
		margin-left: auto;
		font-size: 0.68rem;
		color: var(--color-text-muted, #94a3b8);
	}

	.chapter-link {
		display: inline-block;
		font-size: 0.82rem;
		color: var(--color-brand-300, #4ade80);
	}

	.timeline {
		grid-column: 1 / -1;
		grid-row: 3;
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.6rem 1rem;
	}
	.play {
		width: 2.2rem;
		height: 2.2rem;
		flex: none;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: transparent;
		color: var(--color-text-primary, #e2e8f0);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.play:hover {
		border-color: #ffb703;
		color: #ffb703;
	}

	.notches {
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0;
		padding: 0 0 0.15rem;
		overflow-x: auto;
		flex: 1;
	}
	.notch {
		min-width: 2rem;
		height: 1.75rem;
		padding: 0 0.35rem;
		border-radius: 5px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.04);
		color: var(--color-text-muted, #94a3b8);
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background 0.18s, border-color 0.18s, color 0.18s;
	}
	.notch:hover {
		border-color: var(--journey-color);
		color: var(--color-text-primary, #e2e8f0);
	}
	.notch.done {
		border-color: var(--journey-color);
		color: var(--journey-color);
	}
	.notch.active {
		background: var(--journey-color);
		border-color: var(--journey-color);
		color: #04121a;
		font-weight: 700;
	}
	.notch.locked {
		cursor: default;
		opacity: 0.4;
		border-style: dashed;
	}
	.notch-num {
		pointer-events: none;
	}

	@media (max-width: 900px) {
		.hud {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr auto;
			padding: 0.6rem;
			gap: 0.6rem;
		}
		.detail-panel {
			grid-column: 1;
			grid-row: 2;
			align-self: end;
			max-height: 45vh;
		}
		.timeline {
			grid-column: 1;
			grid-row: 3;
		}
	}
</style>
