<script lang="ts">
	/**
	 * Overlay for a place: the disassembly slider, the part list, and the lore
	 * each part carries.
	 *
	 * The slider is the primary control — dragging it apart is the gesture the
	 * whole scene exists for — so it gets the full width of the bottom edge
	 * rather than being buried in a panel.
	 */
	import * as m from '$lib/paraglide/messages';
	import type { ScenePart, PlaceChapterRef, WorldNode } from '../types';

	interface Props {
		place: WorldNode;
		region: WorldNode | null;
		neighbours: WorldNode[];
		chapters: PlaceChapterRef[];
		parts: ScenePart[];
		explode: number;
		detached: string[];
		selectedPart: string | null;
		xray: boolean;
		onexplode: (value: number) => void;
		ontoggledetach: (id: string) => void;
		onselectpart: (id: string | null) => void;
		onxray: (value: boolean) => void;
	}

	let {
		place,
		region,
		neighbours,
		chapters,
		parts,
		explode,
		detached,
		selectedPart,
		xray,
		onexplode,
		ontoggledetach,
		onselectpart,
		onxray
	}: Props = $props();

	let current = $derived(parts.find((p) => p.id === selectedPart) ?? null);
	let backHref = $derived(region ? `/world/${region.slug}` : '/world');
	let installed = $derived(parts.length - detached.length);

	function label(node: WorldNode): string {
		return node.name ?? m.world_unknown_place();
	}

	/** Chapter the reader can actually open — locked ones are not linkable. */
	function chapterHref(number: number | null): string | null {
		if (number == null) return null;
		const match = chapters.find((c) => c.chapter_number === number);
		if (!match || match.locked) return null;
		return `/stories/${number}`;
	}
</script>

<div class="hud">
	<header class="panel top-bar">
		<a class="back" href={backHref}>
			← {region ? label(region) : m.world_back_to_globe()}
		</a>
		<h1 class="place-name">{label(place)}</h1>
		<button
			class="chip"
			class:on={xray}
			onclick={() => onxray(!xray)}
			aria-pressed={xray}
		>
			{m.world_xray()}
		</button>
	</header>

	<aside class="panel list-panel">
		<h2 class="panel-head">
			{m.world_parts()}
			<span class="count">{installed}/{parts.length}</span>
		</h2>

		{#if parts.length === 0}
			<p class="muted">{m.world_parts_empty()}</p>
		{:else}
			<ul class="part-list">
				{#each parts as part (part.id)}
					{@const off = detached.includes(part.id)}
					<li>
						<button
							class="part-btn"
							class:active={selectedPart === part.id}
							class:off
							onclick={() => onselectpart(selectedPart === part.id ? null : part.id)}
						>
							<span class="part-name">{part.label}</span>
							{#if part.lore}<span class="part-dot" title={m.world_has_lore()}>✦</span>{/if}
						</button>
						<button
							class="detach-btn"
							class:off
							onclick={() => ontoggledetach(part.id)}
							aria-label={off ? m.world_reattach() : m.world_detach()}
						>
							{off ? '↓' : '↑'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if neighbours.length}
			<h2 class="panel-head neighbours-head">{m.world_nearby()}</h2>
			<ul class="neighbour-list">
				{#each neighbours as n (n.id)}
					<li>
						{#if n.state === 'hidden' || !region}
							<span class="neighbour dim">{label(n)}</span>
						{:else}
							<a class="neighbour" href="/world/{region.slug}/{n.slug}">{label(n)}</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	{#if current}
		<section class="panel detail-panel">
			<button class="close" onclick={() => onselectpart(null)} aria-label="close">×</button>
			<h2 class="detail-title">{current.label}</h2>
			{#if current.lore}
				<p class="detail-lore">{current.lore}</p>
			{:else}
				<p class="muted">{m.world_part_no_lore()}</p>
			{/if}
			{#if chapterHref(current.chapter)}
				<a class="chapter-link" href={chapterHref(current.chapter)}>
					{m.world_read_chapter()} {current.chapter}
				</a>
			{/if}
			<button class="detach-wide" onclick={() => ontoggledetach(current.id)}>
				{detached.includes(current.id) ? m.world_reattach() : m.world_detach()}
			</button>
		</section>
	{:else if place.description}
		<section class="panel detail-panel">
			<h2 class="detail-title">{label(place)}</h2>
			<p class="detail-lore">{place.description}</p>
			{#if chapters.length}
				<ul class="chapter-list">
					{#each chapters as c (c.chapter_id)}
						<li>
							{#if c.locked}
								<span class="chapter dim">{m.world_chapter()} {c.chapter_number}</span>
							{:else}
								<a class="chapter" href="/stories/{c.chapter_number}">
									{m.world_chapter()} {c.chapter_number} — {c.title}
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<footer class="panel explode-bar">
		<label class="explode-label" for="explode-range">
			{m.world_disassemble()}
			<strong>{Math.round(explode * 100)}%</strong>
		</label>
		<input
			id="explode-range"
			class="explode-range"
			type="range"
			min="0"
			max="100"
			value={Math.round(explode * 100)}
			oninput={(e) => onexplode(Number(e.currentTarget.value) / 100)}
		/>
		<div class="explode-actions">
			<button class="chip" onclick={() => onexplode(0)}>{m.world_assemble_all()}</button>
			<button class="chip" onclick={() => onexplode(1)}>{m.world_disassemble_all()}</button>
		</div>
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
		gap: 1rem;
		padding: 0.65rem 1rem;
	}
	.back {
		font-size: 0.82rem;
		color: var(--color-brand-300, #4ade80);
		text-decoration: none;
		white-space: nowrap;
	}
	.place-name {
		font-size: 1.05rem;
		margin: 0;
		flex: 1;
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
	.explode-bar {
		grid-column: 1 / -1;
		grid-row: 3;
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.7rem 1rem;
	}

	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.75rem;
	}
	.neighbours-head {
		margin-top: 1.25rem;
	}
	.count {
		font-size: 0.7rem;
		color: #ffb703;
		letter-spacing: 0;
	}
	.muted {
		font-size: 0.78rem;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.5rem;
		line-height: 1.5;
	}

	.part-list,
	.neighbour-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.part-list li {
		display: flex;
		gap: 0.3rem;
	}
	.part-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
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
	.part-btn:hover {
		background: rgba(255, 255, 255, 0.09);
		transform: translateX(3px);
	}
	.part-btn.active {
		background: rgba(255, 183, 3, 0.16);
		border-left-color: #ffb703;
	}
	.part-btn.off {
		opacity: 0.6;
		border-left-style: dashed;
	}
	.part-dot {
		color: #ffb703;
		font-size: 0.7rem;
	}

	.detach-btn {
		width: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 6px;
		background: transparent;
		color: var(--color-text-muted, #94a3b8);
		font: inherit;
		cursor: pointer;
	}
	.detach-btn:hover {
		border-color: #ffb703;
		color: #ffb703;
	}
	.detach-btn.off {
		border-color: #ffb703;
		color: #ffb703;
	}

	.neighbour {
		font-size: 0.82rem;
		color: var(--color-brand-300, #4ade80);
		text-decoration: none;
	}
	.neighbour.dim {
		color: var(--color-text-muted, #94a3b8);
		opacity: 0.6;
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
		font-size: 1.05rem;
		margin: 0 0 0.7rem;
		padding-right: 1.5rem;
	}
	.detail-lore {
		font-size: 0.86rem;
		line-height: 1.65;
		color: var(--color-text-secondary, #cbd5e1);
		margin: 0 0 0.8rem;
	}
	.chapter-link,
	.chapter {
		font-size: 0.8rem;
		color: var(--color-brand-300, #4ade80);
		text-decoration: none;
	}
	.chapter.dim {
		color: var(--color-text-muted, #94a3b8);
		opacity: 0.6;
	}
	.chapter-list {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.detach-wide {
		width: 100%;
		margin-top: 0.9rem;
		padding: 0.55rem;
		border: 1px solid rgba(255, 183, 3, 0.5);
		border-radius: 6px;
		background: rgba(255, 183, 3, 0.12);
		color: #ffb703;
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.detach-wide:hover {
		background: rgba(255, 183, 3, 0.22);
	}

	.explode-label {
		font-size: 0.8rem;
		color: var(--color-text-muted, #94a3b8);
		white-space: nowrap;
	}
	.explode-label strong {
		color: #ffb703;
		margin-left: 0.3rem;
	}
	.explode-range {
		flex: 1;
		min-width: 10rem;
		accent-color: #ffb703;
	}
	.explode-actions {
		display: flex;
		gap: 0.4rem;
	}

	.chip {
		padding: 0.35rem 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 999px;
		background: transparent;
		color: var(--color-text-muted, #94a3b8);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.chip:hover {
		border-color: #ffb703;
		color: #ffb703;
	}
	.chip.on {
		background: rgba(255, 183, 3, 0.18);
		border-color: #ffb703;
		color: #ffb703;
	}

	@media (max-width: 900px) {
		.hud {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr auto;
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
			max-height: 9rem;
		}
		.detail-panel {
			grid-column: 1;
			grid-row: 3;
			align-self: end;
			max-height: 40vh;
		}
		.explode-bar {
			grid-column: 1;
			grid-row: 4;
		}
	}
</style>
