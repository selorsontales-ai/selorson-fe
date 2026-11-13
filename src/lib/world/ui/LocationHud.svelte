<script lang="ts">
	/**
	 * Overlay for a place: architectural strata lore (`parts`), synced Intro Video
	 * & Gallery switcher, Ecosystem Desktop 3D Pack / VN Episode gateway links,
	 * connected characters & artifacts, and an integrated reader discussion drawer.
	 */
	import CommentsSection from '$lib/components/ui/CommentsSection.svelte';
	import { currentLocale } from '$lib/i18n-labels';
	import * as m from '$lib/paraglide/messages';
	import { resolveNodePlanet } from '../cosmos';
	import type { ScenePart, PlaceChapterRef, WorldNode } from '../types';
	import { resolveWorldNodeTargetUrl } from '../world-utils';
	import VNScenePlayer from './VNScenePlayer.svelte';

	interface LinkedItemRef {
		id: number;
		name: string;
		category: string;
		image_url: string | null;
		role: string;
	}

	interface Props {
		place: WorldNode;
		region: WorldNode | null;
		neighbours: WorldNode[];
		chapters: PlaceChapterRef[];
		visitors?: WorldNode[];
		linkedItems?: LinkedItemRef[];
		parts: ScenePart[];
		selectedPart: string | null;
		activeMediaTab?: 'gallery' | 'video' | 'clockwork';
		/** Akunarch P0: có gói sa bàn cơ khí .glb và đang ở app desktop. */
		hasClockwork?: boolean;
		hasGallery?: boolean;
		onselectpart: (id: string | null) => void;
		onmediatab?: (tab: 'gallery' | 'video' | 'clockwork') => void;
	}

	let {
		place,
		region,
		neighbours,
		chapters,
		visitors = [],
		linkedItems = [],
		parts,
		selectedPart,
		activeMediaTab = 'gallery',
		hasGallery = false,
		hasClockwork = false,
		onselectpart,
		onmediatab
	}: Props = $props();

	let current = $derived(parts.find((p) => p.id === selectedPart) ?? null);
	let hasSidebarContent = $derived(
		parts.length > 0 || visitors.length > 0 || linkedItems.length > 0 || neighbours.length > 0
	);
	let backHref = $derived(
		region
			? `/world/${region.slug}`
			: resolveNodePlanet(place) === 'earth'
				? `/world?body=earth&focus=${encodeURIComponent(place.slug)}`
				: `/world?focus=${encodeURIComponent(place.slug)}`
	);
	let showComments = $state(false);
	let showVnPlayer = $state(false);
	let mobileListOpen = $state(false);
	let mobileInfoOpen = $state(false);

	function label(node: WorldNode): string {
		return node.name ?? m.world_unknown_place();
	}

	function formatPackSize(bytes: number | null | undefined): string {
		if (!bytes || bytes <= 0) return '';
		const mb = bytes / (1024 * 1024);
		return mb >= 1024 ? ` · ${(mb / 1024).toFixed(2)} GB` : ` · ${mb.toFixed(1)} MB`;
	}

	function chapterSuffix(c: PlaceChapterRef): string {
		const raw = c.title?.trim();
		if (!raw) return '';
		const cleaned = raw.replace(/^(?:chương|chapter)\s+\d+\s*[:\-–—]\s*/i, '').trim();
		if (!cleaned) return '';
		const norm = cleaned.toLowerCase();
		const localizedPrefix = `${m.world_chapter()} ${c.chapter_number}`.trim().toLowerCase();
		if (
			norm === localizedPrefix ||
			norm === `chương ${c.chapter_number}` ||
			norm === `chapter ${c.chapter_number}`
		) {
			return '';
		}
		return ` — ${cleaned}`;
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
		{#if parts.length > 0}
			<button
				type="button"
				class="chip mobile-parts-toggle"
				class:on={mobileListOpen}
				onclick={() => {
					mobileListOpen = !mobileListOpen;
					if (mobileListOpen) mobileInfoOpen = false;
				}}
			>
				📋 {m.world_parts()} ({parts.length})
			</button>
		{/if}
		{#if place.description || chapters.length}
			<button
				type="button"
				class="chip mobile-info-toggle"
				class:on={mobileInfoOpen && !current && !showComments}
				onclick={() => {
					if (current) onselectpart(null);
					if (showComments) showComments = false;
					mobileInfoOpen = !mobileInfoOpen;
					if (mobileInfoOpen) mobileListOpen = false;
				}}
			>
				📜 {currentLocale() === 'en' ? 'Lore' : 'Thuyết minh'}
			</button>
		{/if}
		{#if hasGallery && place.intro_video_url}
			<button
				type="button"
				class="chip"
				class:on={activeMediaTab === 'gallery'}
				onclick={() => onmediatab?.('gallery')}
			>
				🖼️ {currentLocale() === 'en' ? 'Concept Art' : 'Ảnh kiến trúc'}
			</button>
		{/if}
		{#if place.intro_video_url}
			<button
				type="button"
				class="chip"
				class:on={activeMediaTab === 'video'}
				onclick={() => onmediatab?.('video')}
			>
				🎬 {currentLocale() === 'en' ? 'Intro Film' : 'Phim Intro'}
			</button>
		{/if}
		{#if hasClockwork}
			<button
				type="button"
				class="chip"
				class:on={activeMediaTab === 'clockwork'}
				data-testid="clockwork-tab"
				onclick={() => onmediatab?.('clockwork')}
			>
				⚙ {currentLocale() === 'en' ? 'Clockwork Tabletop' : 'Sa bàn cơ khí'}
			</button>
		{/if}
		{#if place.id > 0}
			<a class="chip link-chip" href="/library?id={place.id}">
				{m.lhud_encyclopedia_dossier()}
			</a>
			<button
				class="chip"
				class:on={showComments}
				onclick={() => (showComments = !showComments)}
			>
				{m.lhud_discussion_2()}
			</button>
		{/if}
	</header>

	{#if hasSidebarContent}
		<aside class="panel list-panel" class:mobile-open={mobileListOpen}>
			{#if parts.length > 0}
				<h2 class="panel-head">
					{m.world_parts()}
					<span class="count">{parts.length}</span>
				</h2>

				<ul class="part-list">
					{#each parts as part (part.id)}
						<li>
							<button
								class="part-btn"
								class:active={selectedPart === part.id}
								onclick={() => {
									const next = selectedPart === part.id ? null : part.id;
									onselectpart(next);
									if (next) mobileListOpen = false;
								}}
							>
								<span class="part-name">{part.label}</span>
								{#if part.lore}<span class="part-dot" title={m.world_has_lore()}>✦</span>{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if visitors.length}
				<h2 class="panel-head" class:neighbours-head={parts.length > 0}>
					🧭 {m.lhud_related_characters()} ({visitors.length})
				</h2>
				<ul class="neighbour-list">
					{#each visitors as person (person.id)}
						<li>
							<a class="neighbour" href="/world/journey/{person.id}">
								🧭 {label(person)}
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			{#if linkedItems.length}
				<h2
					class="panel-head"
					class:neighbours-head={parts.length > 0 || visitors.length > 0}
				>
					🔗 {m.lhud_linked_entities()} ({linkedItems.length})
				</h2>
				<ul class="neighbour-list">
					{#each linkedItems as item (item.id)}
						<li>
							<a class="neighbour" href="/library?id={item.id}">
								✦ {item.name}
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			{#if neighbours.length}
				<h2
					class="panel-head"
					class:neighbours-head={parts.length > 0 || visitors.length > 0 || linkedItems.length > 0}
				>
					{m.world_nearby()}
				</h2>
				<ul class="neighbour-list">
					{#each neighbours as n (n.id)}
						<li>
							{#if n.state === 'hidden'}
								<span class="neighbour dim">{label(n)}</span>
							{:else}
								<a class="neighbour" href={resolveWorldNodeTargetUrl(n)}>{label(n)}</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	{/if}

	{#if showComments}
		<section class="panel detail-panel comments-drawer">
			<button class="close" onclick={() => (showComments = false)} aria-label="close">×</button>
			<h2 class="detail-title">💬 {m.lhud_discussion()} {label(place)}</h2>
			<CommentsSection commentableType="library" commentableId={place.id} />
		</section>
	{:else if current}
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
		</section>
	{:else if place.description || chapters.length}
		<section class="panel detail-panel overview-panel" class:mobile-open={mobileInfoOpen}>
			<button
				type="button"
				class="close mobile-close"
				onclick={() => (mobileInfoOpen = false)}
				aria-label="close"
			>
				×
			</button>
			<h2 class="detail-title">{label(place)}</h2>
			{#if place.image_url}
				<img class="detail-img" src={place.image_url} alt={label(place)} />
			{/if}
			{#if place.description}
				<p class="detail-lore">{place.description}</p>
			{/if}
			{#if chapters.length}
				<ul class="chapter-list">
					{#each chapters as c (c.chapter_id)}
						<li>
							{#if c.locked}
								<span class="chapter dim">{m.world_chapter()} {c.chapter_number}</span>
							{:else}
								<a class="chapter" href="/stories/{c.chapter_number}">
									📖 {m.world_chapter()} {c.chapter_number}{chapterSuffix(c)}
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<footer class="panel explode-bar gateway-bar">
		<span class="gateway-meta">
			{#if place.lat !== null && place.lng !== null}
				📍 {place.lat.toFixed(2)}°, {place.lng.toFixed(2)}°
			{/if}
			{#if parts.length > 0}
				· 🏛️ {parts.length} {currentLocale() === 'en' ? 'architectural strata' : 'tầng cấu trúc'}
			{/if}
		</span>
		<div class="explode-actions">
			{#if place.desktop_pack_url}
				<a
					class="chip gateway-cta"
					href={place.desktop_pack_url}
					target="_blank"
					rel="noopener noreferrer"
				>
					🎮 {currentLocale() === 'en' ? '3D World Pack' : 'Gói Thế Giới 3D Desktop'}
					{#if place.desktop_pack_version}v{place.desktop_pack_version}{/if}{formatPackSize(
						place.desktop_pack_size
					)}
				</a>
			{/if}
			{#if place.vn_episode_url}
				<button
					type="button"
					class="chip gateway-cta"
					onclick={() => (showVnPlayer = true)}
				>
					🎭 {place.vn_episode_title ||
						(currentLocale() === 'en' ? 'Play Visual Novel' : 'Chơi Tập Visual Novel')}
				</button>
			{/if}
			<a class="chip" href={backHref}>
				🌐 {m.world_back_to_globe()}
			</a>
		</div>
	</footer>

	{#if showVnPlayer && place.vn_episode_url}
		<VNScenePlayer
			episodeUrl={place.vn_episode_url}
			fallbackBackdropUrl={place.image_url}
			fallbackTitle={place.vn_episode_title || label(place)}
			onclose={() => (showVnPlayer = false)}
		/>
	{/if}
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		z-index: 5;
		pointer-events: none;
		display: grid;
		grid-template-columns: minmax(0, 18rem) 1fr minmax(0, 23rem);
		grid-template-rows: auto 1fr auto;
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
		gap: 0.75rem;
		flex-wrap: wrap;
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
	.part-dot {
		color: #ffb703;
		font-size: 0.7rem;
	}

	.neighbour {
		font-size: 0.82rem;
		color: var(--color-brand-300, #4ade80);
		text-decoration: none;
	}
	.neighbour:hover {
		text-decoration: underline;
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
	.detail-img {
		width: 100%;
		max-height: 10rem;
		object-fit: cover;
		border-radius: 8px;
		margin-bottom: 0.65rem;
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
	.explode-actions {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.gateway-bar {
		justify-content: space-between;
	}
	.gateway-meta {
		font-size: 0.78rem;
		color: var(--color-text-muted, #94a3b8);
	}
	.gateway-cta {
		border-color: rgba(255, 183, 3, 0.55);
		background: rgba(255, 183, 3, 0.14);
		color: #fbbf24;
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
		text-decoration: none;
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
	.link-chip {
		border-color: rgba(56, 189, 248, 0.35);
		color: #7dd3fc;
	}
	.link-chip:hover {
		border-color: #38bdf8;
		color: #e0f2fe;
	}
	.mobile-parts-toggle,
	.mobile-info-toggle,
	.mobile-close {
		display: none;
	}

	@media (max-width: 1024px) {
		.hud {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr auto;
			padding: 0.6rem;
			gap: 0.6rem;
		}
		.mobile-parts-toggle,
		.mobile-info-toggle {
			display: inline-flex;
			align-items: center;
			gap: 0.25rem;
		}
		.mobile-close {
			display: block;
		}
		.top-bar {
			grid-column: 1;
			grid-row: 1;
			padding: 0.55rem 0.8rem;
			gap: 0.45rem 0.55rem;
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
			max-height: 36dvh;
		}
		.overview-panel {
			display: none;
		}
		.overview-panel.mobile-open {
			display: block;
		}
		.explode-bar {
			grid-column: 1;
			grid-row: 4;
			padding: 0.55rem 0.75rem;
			gap: 0.5rem 0.75rem;
		}
	}

	@media (max-width: 768px) {
		.place-name {
			flex: 1 1 100%;
			order: 2;
			font-size: 0.92rem;
			line-height: 1.28;
		}
		.chip {
			padding: 0.28rem 0.62rem;
			font-size: 0.72rem;
		}
	}
</style>
