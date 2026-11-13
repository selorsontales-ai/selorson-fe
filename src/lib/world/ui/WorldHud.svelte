<script lang="ts">
	/**
	 * Overlay for the Multi-Planet Cosmic Space (Tầng 0), Living 3D Globe (Tầng 1)
	 * & 2D Atlas: celestial/temporal controls, searchable region/location/character
	 * directory on the left, rich detail & deep-links on the right, and exploration
	 * progress along the bottom.
	 */
	import { currentLocale } from '$lib/i18n-labels';
	import * as m from '$lib/paraglide/messages';
	import { isDesktop } from '$lib/platform';
	import {
		AKUNALIA_CANON_NODES,
		CELESTIAL_BODIES,
		pickText,
		type CelestialBodyId,
		type CosmicSectorId,
		type WorldTier,
		type WorldTimeline
	} from '../cosmos';
	import type { WorldNode, WorldProgress } from '../types';
	import {
		filterWorldNodes,
		isExploredState,
		isUnlockedState
	} from '../world-utils';
	import CosmicTimelineHud from './CosmicTimelineHud.svelte';

	interface Props {
		regions: WorldNode[];
		locations: WorldNode[];
		/** Characters whose journeys the reader may follow. */
		characters: WorldNode[];
		progress: WorldProgress;
		selected: WorldNode | null;
		spaceMode?: 'clockwork' | 'open';
		viewMode?: '3d' | '2d';
		webglAvailable?: boolean;
		tier?: WorldTier;
		activePlanet?: CelestialBodyId;
		eraId?: string;
		timeline?: WorldTimeline;
		effectiveReadUpTo?: number | null;
		daylightMode?: boolean;
		prismMomentActive?: boolean;
		onselect: (node: WorldNode | null) => void;
		onenter: (node: WorldNode) => void;
		onspacetoggle?: (mode: 'clockwork' | 'open') => void;
		ontogglemode?: (mode: '3d' | '2d') => void;
		onsettier?: (tier: WorldTier) => void;
		onselectplanet?: (planet: CelestialBodyId) => void;
		onselectsector?: (sector: CosmicSectorId) => void;
		onselectera?: (eraId: string, focus?: { lat: number; lng: number }) => void;
		onsettimeline?: (timeline: WorldTimeline) => void;
		ontoggledaylight?: (enabled: boolean) => void;
		ontoggleprism?: (enabled: boolean) => void;
	}

	let {
		regions,
		locations,
		characters,
		progress,
		selected,
		spaceMode = 'clockwork',
		viewMode = '3d',
		webglAvailable = true,
		tier = 1,
		activePlanet = 'akunalia',
		eraId = 'all',
		timeline = 1,
		effectiveReadUpTo = null,
		daylightMode = false,
		prismMomentActive = false,
		onselect,
		onenter,
		onspacetoggle,
		ontogglemode,
		onsettier,
		onselectplanet,
		onselectsector,
		onselectera,
		onsettimeline,
		ontoggledaylight,
		ontoggleprism
	}: Props = $props();

	let searchQuery = $state('');
	let kindFilter = $state<'all' | 'region' | 'location' | 'character'>('all');
	let mobileListOpen = $state(false);
	let locale = $derived(currentLocale());
	let isEn = $derived(locale.toLowerCase().startsWith('en'));
	let hasNarrativeMap = $derived(Boolean(CELESTIAL_BODIES[activePlanet]?.hasNarrativeMap));
	let isCosmicOverview = $derived(tier === 0 && webglAvailable && viewMode === '3d');
	let hideSurfaceSidebar = $derived(isCosmicOverview || !hasNarrativeMap);

	function selectNode(node: WorldNode | null) {
		onselect(node);
		if (node) mobileListOpen = false;
	}

	let visibleRegions = $derived(
		filterWorldNodes(
			regions.filter((r) => r.state !== 'hidden'),
			searchQuery,
			kindFilter
		)
	);

	let visibleLocations = $derived(
		filterWorldNodes(
			locations.filter((l) => l.state !== 'hidden'),
			searchQuery,
			kindFilter
		)
	);

	let visibleCharacters = $derived(
		filterWorldNodes(
			characters.filter((c) => c.state !== 'hidden'),
			searchQuery,
			kindFilter
		)
	);

	/** Places belonging to the selected region, so the panel can list them. */
	let childPlaces = $derived(
		selected?.kind === 'region'
			? locations.filter((l) => l.region === selected.slug && l.state !== 'hidden')
			: []
	);

	function label(node: WorldNode): string {
		return node.name ?? m.world_unknown_place();
	}

	const KIND_LABELS: Record<string, { vi: string; en: string }> = {
		region: { vi: 'Vùng địa lý', en: 'Region' },
		landmark: { vi: 'Thắng cảnh', en: 'Landmark' },
		poi: { vi: 'Địa điểm', en: 'Location' },
		location: { vi: 'Địa điểm', en: 'Location' },
		character: { vi: 'Nhân vật', en: 'Character' },
		legend: { vi: 'Huyền tích', en: 'Legend' }
	};

	const TERRAIN_LABELS: Record<string, { vi: string; en: string }> = {
		'alpine-obsidian': { vi: 'Tuyết sơn hắc diện thạch', en: 'Obsidian Glacier' },
		alpine: { vi: 'Tuyết sơn cao nguyên', en: 'Alpine Peaks' },
		'river-plain': { vi: 'Đồng bằng đại giang', en: 'Alluvial Plains' },
		sanctuary: { vi: 'Thánh địa hoàng triều', en: 'Imperial Sanctuary' },
		'abyssal-sea': { vi: 'Nội hải kết giới', en: 'Ward Lagoon' },
		'highland-forest': { vi: 'Rừng cao nguyên thần năng', en: 'Luminous Highlands' },
		village: { vi: 'Thánh thôn thung lũng', en: 'Valley Village' },
		archipelago: { vi: 'Quần đảo rạn ngọc', en: 'Jade Archipelago' },
		forest: { vi: 'Rừng đại ngàn', en: 'Ancient Forest' },
		ruins: { vi: 'Di tích cổ đại', en: 'Ancient Ruins' },
		shrine: { vi: 'Đền cổ', en: 'Sacred Shrine' },
		cliffs: { vi: 'Vách đá sương mù', en: 'Sea Cliffs' },
		megalith: { vi: 'Vòng cự thạch', en: 'Megalithic Ring' },
		bastion: { vi: 'Thành lũy tầng đệm', en: 'Bastion' },
		desert: { vi: 'Sa mạc cát vàng', en: 'Desert' },
		mountain: { vi: 'Dãy núi cao', en: 'Mountain Range' },
		plains: { vi: 'Đồng bằng', en: 'Plains' },
		ocean: { vi: 'Đại dương', en: 'Ocean' },
		city: { vi: 'Kinh thành', en: 'Citadel' }
	};

	function prettifySlug(raw: string): string {
		return raw
			.replace(/[-_]+/g, ' ')
			.replace(/\b\w/g, (ch) => ch.toUpperCase());
	}

	function regionLabel(regionSlug: string | null | undefined): string {
		if (!regionSlug) return '';
		const match = regions.find((r) => r.slug === regionSlug && r.name);
		if (match?.name) return match.name;
		const canon = AKUNALIA_CANON_NODES.find((d) => d.slug === regionSlug);
		if (canon) return pickText(canon.name, locale);
		return prettifySlug(regionSlug);
	}

	function kindLabel(kind: string | null | undefined): string {
		if (!kind) return '';
		const entry = KIND_LABELS[kind.toLowerCase()];
		if (entry) return isEn ? entry.en : entry.vi;
		return prettifySlug(kind);
	}

	function terrainLabel(terrain: string | null | undefined): string {
		if (!terrain) return '';
		const entry = TERRAIN_LABELS[terrain.toLowerCase()];
		if (entry) return isEn ? entry.en : entry.vi;
		return prettifySlug(terrain);
	}

	function stateLabel(node: WorldNode): string | null {
		if (isExploredState(node.state)) return m.rhud_explored();
		if (node.state === 'rumored') return m.world_state_rumored();
		if (node.state === 'hidden') return m.world_state_hidden();
		return null;
	}
</script>

<div class="hud" class:cosmic-mode={hideSurfaceSidebar}>
	<div class="top-controls">
		<CosmicTimelineHud
			part="top"
			tier={viewMode === '3d' ? tier : 1}
			{activePlanet}
			{eraId}
			{timeline}
			{effectiveReadUpTo}
			webglAvailable={webglAvailable && viewMode === '3d'}
			onsettier={(nextTier) => onsettier?.(nextTier)}
			onselectplanet={(planet) => onselectplanet?.(planet)}
			onselectsector={(sec) => onselectsector?.(sec)}
			onselectera={(nextEra, focus) => onselectera?.(nextEra, focus)}
			onsettimeline={(nextTl) => onsettimeline?.(nextTl)}
		/>

		<div class="top-right-actions">
			{#if isDesktop && onspacetoggle}
				<div
					class="mode-switch space-switch"
					role="group"
					aria-label={isEn ? '3D World Mode' : 'Chế độ Bản đồ 3D'}
				>
					<button
						type="button"
						class="mode-btn"
						class:active={spaceMode === 'clockwork'}
						onclick={() => onspacetoggle('clockwork')}
					>
						{isEn ? 'Clockwork' : 'Sa bàn'}
					</button>
					<button
						type="button"
						class="mode-btn"
						class:active={spaceMode === 'open'}
						onclick={() => onspacetoggle('open')}
					>
						{isEn ? 'Open World' : 'Thế giới mở'}
					</button>
				</div>
			{/if}
			{#if !hideSurfaceSidebar}
				<button
					type="button"
					class="mobile-list-toggle"
					class:active={mobileListOpen}
					onclick={() => (mobileListOpen = !mobileListOpen)}
				>
					📋 {m.world_regions()} / {m.world_places()}
				</button>
			{/if}
			{#if webglAvailable && viewMode === '3d'}
				{#if ontoggledaylight}
					<button
						type="button"
						class="cosmic-fx-btn daylight-btn"
						class:active={daylightMode}
						aria-pressed={daylightMode}
						data-testid="toggle-daylight-mode"
						title={m.world_lighting_tooltip()}
						onclick={() => ontoggledaylight(!daylightMode)}
					>
						{daylightMode ? m.world_lighting_daylight() : m.world_lighting_cinematic()}
					</button>
				{/if}
				{#if ontoggleprism}
					<button
						type="button"
						class="cosmic-fx-btn prism-btn"
						class:active={prismMomentActive}
						aria-pressed={prismMomentActive}
						data-testid="toggle-prism-moment"
						title={m.world_prism_moment_tooltip()}
						onclick={() => ontoggleprism(!prismMomentActive)}
					>
						{m.world_prism_moment_btn()}
					</button>
				{/if}
			{/if}
			{#if webglAvailable && ontogglemode && hasNarrativeMap}
				<div class="mode-switch" role="group" aria-label={m.whud_map_display_mode()}>
					<button
						type="button"
						class="mode-btn"
						class:active={viewMode === '3d'}
						onclick={() => ontogglemode('3d')}
					>
						🌐 3D Globe
					</button>
					<button
						type="button"
						class="mode-btn"
						class:active={viewMode === '2d'}
						onclick={() => ontogglemode('2d')}
					>
						🗺️ Atlas 2D
					</button>
				</div>
			{/if}
			{#if selected}
				<button type="button" class="reset-cam-btn" onclick={() => onselect(null)}>
					{m.whud_planet_overview()}
				</button>
			{/if}
			<a class="library-shortcut" href="/library">{m.whud_encyclopedia()}</a>
		</div>
	</div>

	{#if !hideSurfaceSidebar}
	<aside class="panel list-panel" class:mobile-open={mobileListOpen}>
		<div class="search-box">
			<input
				type="search"
				class="search-input"
				placeholder={m.whud_search_regions_places_ch_1()}
				bind:value={searchQuery}
			/>
			<div class="filter-pills">
				<button
					type="button"
					class="f-pill"
					class:active={kindFilter === 'all'}
					onclick={() => (kindFilter = 'all')}
				>
					{m.lib_cat_all()}
				</button>
				<button
					type="button"
					class="f-pill"
					class:active={kindFilter === 'region'}
					onclick={() => (kindFilter = 'region')}
				>
					🗺️ {m.whud_regions()} ({regions.filter((r) => r.state !== 'hidden').length})
				</button>
				<button
					type="button"
					class="f-pill"
					class:active={kindFilter === 'location'}
					onclick={() => (kindFilter = 'location')}
				>
					📍 {m.whud_places()} ({locations.filter((l) => l.state !== 'hidden').length})
				</button>
				{#if characters.length}
					<button
						type="button"
						class="f-pill"
						class:active={kindFilter === 'character'}
						onclick={() => (kindFilter = 'character')}
					>
						🧭 ({characters.length})
					</button>
				{/if}
			</div>
		</div>

		{#if visibleRegions.length}
			<h2 class="panel-head">{m.world_regions()} ({visibleRegions.length})</h2>
			<ul class="node-list">
				{#each visibleRegions as region (region.id)}
					<li>
						<button
							class="node-btn"
							class:active={selected?.id === region.id}
							class:explored={isExploredState(region.state)}
							class:dim={!isUnlockedState(region.state)}
							onclick={() => selectNode(region)}
						>
							<span class="node-name">{label(region)}</span>
							{#if stateLabel(region)}
								<span class="node-state" class:explored-text={isExploredState(region.state)}>
									{stateLabel(region)}
								</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if visibleLocations.length}
			<h2 class="panel-head" class:journeys-head={visibleRegions.length > 0}>
				📍 {m.world_places()} ({visibleLocations.length})
			</h2>
			<ul class="node-list">
				{#each visibleLocations as loc (loc.id)}
					<li>
						<button
							class="node-btn loc-btn"
							class:active={selected?.id === loc.id}
							class:explored={isExploredState(loc.state)}
							class:dim={!isUnlockedState(loc.state)}
							onclick={() => selectNode(loc)}
						>
							<span class="node-name">{label(loc)}</span>
							<div class="node-sub-row">
								{#if typeof loc.wavelength_nm === 'number'}
									<span class="node-region-tag">λ {loc.wavelength_nm} nm</span>
								{:else if loc.region}
									<span class="node-region-tag">{regionLabel(loc.region)}</span>
								{:else if loc.terrain}
									<span class="node-region-tag">{terrainLabel(loc.terrain)}</span>
								{/if}
								{#if stateLabel(loc)}
									<span class="node-state" class:explored-text={isExploredState(loc.state)}>
										{stateLabel(loc)}
									</span>
								{/if}
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if visibleCharacters.length}
			<h2 class="panel-head journeys-head">{m.world_journeys()} ({visibleCharacters.length})</h2>
			<ul class="node-list">
				{#each visibleCharacters as person (person.id)}
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

		{#if !visibleRegions.length && !visibleLocations.length && !visibleCharacters.length}
			<p class="empty-filter">{m.whud_no_coordinates_match_the_search()}</p>
		{/if}
	</aside>
	{/if}

	{#if selected}
		<section class="panel detail-panel">
			<button class="close" onclick={() => onselect(null)} aria-label="close">×</button>
			<div class="detail-badges">
				{#if selected.is_singularity}
					<span class="singularity-badge">💠 {m.world_singularity_badge()}</span>
				{:else}
					<span class="detail-kind">{kindLabel(selected.kind)}</span>
				{/if}
				{#if typeof selected.wavelength_nm === 'number'}
					<span class="wavelength-badge">
						λ {m.world_wavelength_badge({ nm: String(selected.wavelength_nm) })}
					</span>
				{:else if selected.terrain}
					<span class="detail-terrain">⛰️ {terrainLabel(selected.terrain)}</span>
				{/if}
				{#if isExploredState(selected.state)}
					<span class="explored-badge">{m.whud_visited()}</span>
				{/if}
			</div>
			<h2 class="detail-title">{label(selected)}</h2>

			{#if isUnlockedState(selected.state)}
				{#if selected.image_url}
					<img class="detail-img" src={selected.image_url} alt={label(selected)} />
				{/if}
				{#if selected.description}
					<p class="detail-desc" style="white-space: pre-line;">{selected.description}</p>
				{/if}
				{#if selected.chapters?.length}
					<div class="detail-chapters-block">
						<span class="detail-meta">{m.world_appears_in()}</span>
						<div class="chapter-pills">
							{#each selected.chapters as chNum (chNum)}
								<a href="/stories/{chNum}" class="ch-pill">Ch.{chNum}</a>
							{/each}
						</div>
					</div>
				{/if}
				{#if childPlaces.length}
					<div class="child-section">
						<span class="detail-meta">{m.whud_places_in_region()} ({childPlaces.length}):</span>
						<ul class="child-list">
							{#each childPlaces as place (place.id)}
								<li class="child-row">
									<button class="child-btn" onclick={() => onselect(place)}>
										<span>{label(place)}</span>
										{#if isExploredState(place.state)}
											<span class="explored-text">✓</span>
										{/if}
									</button>
									{#if isUnlockedState(place.state)}
										<button
											class="child-enter-btn"
											title={m.whud_enter_this_place()}
											onclick={() => onenter(place)}
										>
											→
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="detail-actions">
					<button class="enter-btn" onclick={() => onenter(selected)}>
						{#if selected.kind === 'region'}
							🗺️ {m.world_enter_region()}
						{:else}
							🏔️ {m.world_enter_place()}
						{/if}
					</button>
					{#if selected.id > 0}
						<a class="dossier-btn" href="/library?id={selected.id}">
							{m.rhud_encyclopedia_dossier()}
						</a>
					{:else if selected.chapters?.length}
						<a class="dossier-btn" href="/stories/{selected.chapters[0]}">
							{m.world_open_singularity_chapter({ chapter: String(selected.chapters[0]) })}
						</a>
					{/if}
					{#if selected.story_link}
						<a class="chapter-link" href={selected.story_link}>{m.world_read_chapter()}</a>
					{/if}
				</div>
			{:else}
				<p class="detail-locked">{m.world_locked_hint()}</p>
				<a class="dossier-btn secondary" href="/stories">
					{m.whud_read_chapters_to_unlock_this()}
				</a>
			{/if}
		</section>
	{/if}

	<div class="bottom-stack">
		<CosmicTimelineHud
			part="dock"
			tier={viewMode === '3d' ? tier : 1}
			{activePlanet}
			{eraId}
			{timeline}
			{effectiveReadUpTo}
			webglAvailable={webglAvailable && viewMode === '3d'}
			onsettier={(nextTier) => onsettier?.(nextTier)}
			onselectplanet={(planet) => onselectplanet?.(planet)}
			onselectsector={(sec) => onselectsector?.(sec)}
			onselectera={(nextEra, focus) => onselectera?.(nextEra, focus)}
			onsettimeline={(nextTl) => onsettimeline?.(nextTl)}
		/>

		<footer class="panel progress-panel">
			<span class="progress-label">
				{m.world_progress()}
				<strong>{progress.percent}%</strong>
				<span class="progress-count">({progress.revealed}/{progress.placed})</span>
			</span>
			{#if typeof progress.explored === 'number' && progress.explored > 0}
				<span class="explored-summary">
					✓ {m.whud_explored()} <strong>{progress.explored}/{progress.placed}</strong>
				</span>
			{/if}
			<div class="progress-track">
				<div class="progress-fill" style="width:{progress.percent}%"></div>
			</div>
			{#if progress.is_guest}
				<span class="progress-hint">{m.world_guest_hint()}</span>
			{/if}
		</footer>
	</div>
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		z-index: 5;
		pointer-events: none;
		display: grid;
		grid-template-columns: minmax(0, 18.5rem) 1fr minmax(0, 21.5rem);
		grid-template-rows: auto 1fr auto;
		gap: 0.7rem;
		padding: 0.75rem 0.95rem;
		--color-text-primary: #f1f5f9;
		--color-text-secondary: #cbd5e1;
		--color-text-muted: #94a3b8;
		color: #f1f5f9;
	}

	.top-controls {
		grid-column: 2 / -1;
		grid-row: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
		pointer-events: none;
	}

	.hud.cosmic-mode .top-controls {
		grid-column: 1 / -1;
	}

	.top-right-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-left: auto;
		pointer-events: none;
	}

	.mode-switch,
	.cosmic-fx-btn,
	.reset-cam-btn,
	.library-shortcut,
	.mobile-list-toggle {
		pointer-events: auto;
	}

	.cosmic-fx-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		background: rgba(8, 14, 24, 0.84);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(148, 163, 184, 0.24);
		color: #e2e8f0;
		font-size: 0.74rem;
		font-weight: 600;
		padding: 0.38rem 0.72rem;
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			color 0.2s ease,
			box-shadow 0.2s ease;
		white-space: nowrap;
	}
	.cosmic-fx-btn:hover {
		background: rgba(15, 23, 42, 0.92);
		border-color: rgba(248, 250, 252, 0.36);
		color: #fff;
	}
	.daylight-btn.active {
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(250, 204, 21, 0.18));
		border-color: rgba(251, 191, 36, 0.72);
		color: #fef3c7;
		box-shadow: 0 0 14px rgba(251, 191, 36, 0.24);
	}
	.prism-btn.active {
		background: linear-gradient(
			135deg,
			rgba(244, 63, 94, 0.22),
			rgba(56, 189, 248, 0.24),
			rgba(168, 85, 247, 0.26)
		);
		border-color: rgba(192, 132, 252, 0.72);
		color: #f8fafc;
		box-shadow: 0 0 16px rgba(168, 85, 247, 0.28);
	}

	.mobile-list-toggle {
		display: none;
		background: rgba(8, 14, 24, 0.88);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(56, 189, 248, 0.35);
		color: #e2e8f0;
		font-size: 0.76rem;
		font-weight: 600;
		padding: 0.4rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.mobile-list-toggle.active {
		background: var(--color-brand-500, #0c713d);
		border-color: #34d399;
		color: #fff;
	}

	.mode-switch {
		display: inline-flex;
		background: rgba(8, 14, 24, 0.82);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		padding: 0.2rem;
		gap: 0.2rem;
	}

	.mode-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.18s, color 0.18s;
	}
	.mode-btn.active {
		background: var(--color-brand-500, #0c713d);
		color: #fff;
	}

	.reset-cam-btn,
	.library-shortcut {
		background: rgba(8, 14, 24, 0.82);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: #e2e8f0;
		font-size: 0.78rem;
		font-weight: 500;
		padding: 0.42rem 0.8rem;
		border-radius: 999px;
		cursor: pointer;
		text-decoration: none;
		transition: border-color 0.18s, color 0.18s;
	}
	.reset-cam-btn:hover,
	.library-shortcut:hover {
		border-color: #38bdf8;
		color: #38bdf8;
	}

	.panel {
		pointer-events: auto;
		background: rgba(8, 14, 24, 0.82);
		backdrop-filter: blur(14px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-lg, 12px);
		padding: 0.9rem;
		color: #f1f5f9;
	}

	.list-panel {
		grid-column: 1;
		grid-row: 1 / 3;
		overflow-y: auto;
		max-height: 100%;
		display: flex;
		flex-direction: column;
	}
	.detail-panel {
		grid-column: 3;
		grid-row: 2;
		overflow-y: auto;
		max-height: 100%;
		position: relative;
	}
	.bottom-stack {
		grid-column: 1 / -1;
		grid-row: 3;
		display: flex;
		flex-direction: column;
		gap: 0.48rem;
		pointer-events: none;
	}
	.progress-panel {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.55rem 0.95rem;
	}

	.search-box {
		margin-bottom: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.search-input {
		width: 100%;
		padding: 0.45rem 0.65rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: #f8fafc;
		font-size: 0.8rem;
		outline: none;
	}
	.search-input:focus {
		border-color: #38bdf8;
	}

	.filter-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.28rem;
	}

	.f-pill {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #94a3b8;
		font-size: 0.7rem;
		padding: 0.22rem 0.5rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.f-pill.active {
		background: rgba(12, 113, 61, 0.35);
		border-color: #34d399;
		color: #ecfdf5;
		font-weight: 600;
	}

	.panel-head {
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.55rem;
	}

	.node-list,
	.child-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.node-btn,
	.child-btn {
		width: 100%;
		text-align: left;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid transparent;
		border-left: 3px solid var(--color-brand-500, #0c713d);
		border-radius: 6px;
		padding: 0.48rem 0.65rem;
		color: #f1f5f9;
		font: inherit;
		font-size: 0.84rem;
		cursor: pointer;
		transition: background 0.18s, border-color 0.18s, transform 0.18s;
	}
	.node-btn.loc-btn {
		border-left-color: #0ea5e9;
	}
	.node-btn.explored {
		border-left-color: #34d399;
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

	.node-sub-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		margin-top: 0.15rem;
	}
	.node-region-tag {
		font-size: 0.66rem;
		color: #38bdf8;
		opacity: 0.85;
	}

	.journeys-head {
		margin-top: 1.1rem;
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
		font-weight: 500;
	}
	.node-state {
		display: block;
		font-size: 0.68rem;
		color: var(--color-text-muted, #94a3b8);
		margin-top: 0.1rem;
	}
	.explored-text {
		color: #34d399;
		font-weight: 600;
	}
	.empty-filter {
		font-size: 0.8rem;
		color: #94a3b8;
		text-align: center;
		padding: 1rem 0;
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
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.35rem;
		padding-right: 1.5rem;
	}
	.detail-kind {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-accent-purple, #8b5cf6);
		background: rgba(139, 92, 246, 0.15);
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
	}
	.detail-terrain {
		font-size: 0.68rem;
		color: #38bdf8;
		background: rgba(56, 189, 248, 0.12);
		padding: 0.15rem 0.45rem;
		border-radius: 999px;
	}
	.singularity-badge {
		font-size: 0.68rem;
		font-weight: 700;
		color: #f0abfc;
		background: rgba(168, 85, 247, 0.18);
		border: 1px solid rgba(192, 132, 252, 0.4);
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
	}
	.wavelength-badge {
		font-size: 0.68rem;
		font-weight: 600;
		color: #bae6fd;
		background: rgba(14, 165, 233, 0.16);
		border: 1px solid rgba(56, 189, 248, 0.35);
		padding: 0.15rem 0.48rem;
		border-radius: 999px;
	}
	.explored-badge {
		font-size: 0.68rem;
		color: #34d399;
		background: rgba(52, 211, 153, 0.14);
		border: 1px solid rgba(52, 211, 153, 0.3);
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		font-weight: 600;
	}

	.detail-title {
		font-size: 1.15rem;
		margin: 0 0 0.65rem;
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
		font-size: 0.76rem;
		color: var(--color-text-muted, #94a3b8);
		margin: 0 0 0.4rem;
	}

	.detail-chapters-block {
		margin-bottom: 0.75rem;
	}
	.chapter-pills {
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
	.ch-pill:hover {
		background: rgba(56, 189, 248, 0.28);
	}

	.child-section {
		margin-bottom: 0.75rem;
	}
	.child-row {
		display: flex;
		gap: 0.3rem;
	}
	.child-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.child-enter-btn {
		padding: 0 0.65rem;
		border-radius: 6px;
		border: 1px solid rgba(52, 211, 153, 0.35);
		background: rgba(12, 113, 61, 0.25);
		color: #34d399;
		cursor: pointer;
		font-weight: 700;
	}
	.child-enter-btn:hover {
		background: rgba(12, 113, 61, 0.45);
	}

	.detail-actions {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-top: 0.5rem;
	}

	.enter-btn {
		display: block;
		width: 100%;
		padding: 0.6rem;
		border: none;
		border-radius: 6px;
		background: var(--color-brand-500, #0c713d);
		color: #fff;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
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
	.dossier-btn.secondary {
		margin-top: 0.5rem;
	}

	.chapter-link {
		display: inline-block;
		margin-top: 0.2rem;
		font-size: 0.8rem;
		color: var(--color-brand-300, #4ade80);
		text-align: center;
	}

	.progress-label,
	.explored-summary {
		font-size: 0.8rem;
		color: var(--color-text-muted, #94a3b8);
	}
	.explored-summary strong {
		color: #34d399;
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

	@media (max-width: 1024px) {
		.hud {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto 1fr auto;
			padding: 0.55rem;
			gap: 0.5rem;
		}
		.mobile-list-toggle {
			display: inline-flex;
			align-items: center;
			gap: 0.3rem;
		}
		.top-controls {
			grid-column: 1;
			grid-row: 1;
			justify-content: flex-start;
		}
		.top-right-actions {
			margin-left: 0;
		}
		.list-panel {
			grid-column: 1;
			grid-row: 2;
			max-height: 40dvh;
			display: none;
		}
		.list-panel.mobile-open {
			display: flex;
		}
		.detail-panel {
			grid-column: 1;
			grid-row: 3;
			align-self: end;
			max-height: 40dvh;
		}
		.bottom-stack {
			grid-column: 1;
			grid-row: 4;
			gap: 0.4rem;
		}
		.progress-panel {
			padding: 0.45rem 0.75rem;
			gap: 0.45rem 0.8rem;
		}
	}
</style>
