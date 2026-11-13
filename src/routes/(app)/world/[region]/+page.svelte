<script lang="ts">
	/**
	 * L2 — Clockwork Region Stage (`⚙️ Sa Bàn Cơ Khí Vùng`).
	 *
	 * Replaces the legacy extruded flat polygon slab (`RegionScene`) with a clean
	 * showcase stage ready to receive Region Intro Video, Concept Art Gallery, and
	 * Desktop Clockwork Tabletop Packs pushed from the Ecosystem Studio App.
	 */
	import { page } from '$app/state';
	import { isDesktop } from '$lib/platform';
	import { currentLocale } from '$lib/i18n-labels';
	import * as m from '$lib/paraglide/messages';
	import { fetchRegion, markVisited } from '$lib/world/api';
	import {
		mergeRegionDetailWithCanon,
		resolveCanonRegionDetail,
		resolveNodePlanet
	} from '$lib/world/cosmos';
	import type { RegionDetail, WorldNode } from '$lib/world/types';
	import RegionHud from '$lib/world/ui/RegionHud.svelte';
	import { findNodeByFocusParam, isUnlockedState } from '$lib/world/world-utils';
	import { onMount, untrack } from 'svelte';

	let slug = $derived(page.params.region ?? '');

	let detail = $state<RegionDetail | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	let selected = $state<WorldNode | null>(null);
	let activeMediaTab = $state<'gallery' | 'video'>('gallery');
	let activeGalleryIdx = $state(0);
	let loadedSlug = $state<string | null>(null);
	let loadedLocale = $state<string>('');

	let galleryImages = $derived.by(() => {
		const r = detail?.region;
		if (!r) return [];
		const list: string[] = [];
		if (r.image_url?.trim()) list.push(r.image_url.trim());
		for (const u of r.preview_gallery ?? []) {
			const clean = u?.trim();
			if (clean && !list.includes(clean)) list.push(clean);
		}
		return list;
	});

	let visiblePlaces = $derived(
		(detail?.places ?? []).filter((p) => p.state !== 'hidden')
	);

	function extractYoutubeEmbed(url: string | null | undefined): string | null {
		if (!url) return null;
		const trimmed = url.trim();
		const m1 = trimmed.match(
			/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/
		);
		return m1 ? `https://www.youtube.com/embed/${m1[1]}?rel=0` : null;
	}

	function syncDefaultMediaTab(regionNode: WorldNode) {
		activeGalleryIdx = 0;
		const hasGallery = Boolean(regionNode.image_url?.trim() || regionNode.preview_gallery?.length);
		if (!hasGallery && regionNode.intro_video_url?.trim()) {
			activeMediaTab = 'video';
		} else {
			activeMediaTab = 'gallery';
		}
	}

	async function loadRegionData(targetSlug: string) {
		if (!targetSlug) return;
		loading = true;
		notFound = false;
		selected = null;
		const lang = currentLocale();
		const params = new URLSearchParams(location.search);

		try {
			const loadedDetail = await fetchRegion(targetSlug);
			const merged = mergeRegionDetailWithCanon(loadedDetail, targetSlug, lang);
			detail = merged;
			syncDefaultMediaTab(merged.region);
			loadedSlug = targetSlug;
			loadedLocale = lang;
			void markVisited(loadedDetail.region.id);

			const focusParam = params.get('focus') ?? params.get('id');
			if (focusParam) {
				const matched = findNodeByFocusParam(merged.places, focusParam);
				if (matched && matched.state !== 'hidden') {
					selected = matched;
				}
			}
		} catch {
			const canonFallback = resolveCanonRegionDetail(targetSlug, lang);
			if (canonFallback) {
				detail = canonFallback;
				syncDefaultMediaTab(canonFallback.region);
				loadedSlug = targetSlug;
				loadedLocale = lang;
			} else {
				notFound = true;
			}
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadRegionData(slug);
	});

	$effect(() => {
		const currentSlug = slug;
		if (loadedSlug !== null && currentSlug && currentSlug !== loadedSlug) {
			void loadRegionData(currentSlug);
		}
	});

	$effect(() => {
		void page.url.href;
		const lang = currentLocale();
		untrack(() => {
			if (!loadedSlug || !detail || lang === loadedLocale) return;
			loadedLocale = lang;
			if (detail.region.id < 0) {
				const refreshed = resolveCanonRegionDetail(loadedSlug, lang);
				if (refreshed) detail = refreshed;
			} else {
				detail = mergeRegionDetailWithCanon(detail, loadedSlug, lang);
			}
		});
	});
</script>

<svelte:head>
	<title>{detail?.region.name ?? m.world_title()} — Selorson</title>
</svelte:head>

<section class="region-page">
	{#if loading}
		<div class="region-msg"><span class="spinner"></span>{m.world_loading()}</div>
	{:else if notFound || !detail}
		<div class="region-msg">
			<p>{m.world_region_not_found()}</p>
			<a class="fallback-link" href="/world">{m.world_back_to_globe()}</a>
		</div>
	{:else}
		{@const region = detail.region}
		{@const planet = resolveNodePlanet(region)}
		{@const ytEmbed = extractYoutubeEmbed(region.intro_video_url)}
		{@const packUrl = region.clockwork_pack_url || region.desktop_pack_url}
		<div class="stage">
			{#key region.id}
				<div class="region-showcase" class:with-right={Boolean(selected)}>
					{#if galleryImages.length > 0}
						<img src={galleryImages[0]} alt="" class="ambient-bg" />
					{/if}
					<div class="ambient-vignette"></div>

					<div class="showcase-center">
						{#if (galleryImages.length > 0 && region.intro_video_url) || packUrl}
							<div class="media-toolbar">
								{#if galleryImages.length > 0}
									<button
										type="button"
										class="media-tab"
										class:active={activeMediaTab === 'gallery'}
										onclick={() => (activeMediaTab = 'gallery')}
									>
										🖼️ Concept ({galleryImages.length})
									</button>
								{/if}
								{#if region.intro_video_url}
									<button
										type="button"
										class="media-tab"
										class:active={activeMediaTab === 'video'}
										onclick={() => (activeMediaTab = 'video')}
									>
										🎬 Intro Sa Bàn
									</button>
								{/if}
								{#if packUrl && isDesktop}
									<a
										href={packUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="media-tab pack-cta"
									>
										⚙️ Mở Sa Bàn Cơ Khí 3D
										{#if region.clockwork_pack_version || region.desktop_pack_version}
											<small>v{region.clockwork_pack_version || region.desktop_pack_version}</small>
										{/if}
									</a>
								{/if}
							</div>
						{/if}

						{#if activeMediaTab === 'video' && region.intro_video_url}
							<div class="video-frame-wrap">
								{#if ytEmbed}
									<iframe
										src={ytEmbed}
										title={region.name ?? 'Region Intro'}
										frameborder="0"
										allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
										allowfullscreen
										class="showcase-video"
									></iframe>
								{:else}
									<!-- svelte-ignore a11y_media_has_caption -->
									<video
										src={region.intro_video_url}
										controls
										playsinline
										poster={galleryImages[0] ?? undefined}
										class="showcase-video"
									></video>
								{/if}
							</div>
						{:else if galleryImages.length > 0}
							<div class="gallery-frame-wrap">
								<img
									src={galleryImages[activeGalleryIdx] ?? galleryImages[0]}
									alt={region.name ?? ''}
									class="showcase-hero-img"
								/>
								{#if galleryImages.length > 1}
									<div class="gallery-thumbs">
										{#each galleryImages as gUrl, idx (gUrl)}
											<button
												type="button"
												class="thumb-btn"
												class:active={idx === activeGalleryIdx}
												onclick={() => (activeGalleryIdx = idx)}
											>
												<img src={gUrl} alt="" />
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{:else}
							<div class="region-emblem-card">
								<div class="emblem-badges">
									<span class="planet-pill" class:earth={planet === 'earth'}>
										{planet === 'earth'
											? currentLocale() === 'en'
												? '🌍 Multi-Era Earth'
												: '🌍 Trái Đất Đa Kỷ Nguyên'
											: currentLocale() === 'en'
												? '🪐 Planet Akunalia'
												: '🪐 Hành Tinh Akunalia'}
									</span>
									<span class="clockwork-pill">
										⚙️ {currentLocale() === 'en' ? 'Clockwork Region' : 'Vùng Sa Bàn Cơ Khí'}
									</span>
								</div>
								<h2>{region.name}</h2>
								{#if region.description}
									<p class="emblem-desc">{region.description}</p>
								{/if}

								{#if visiblePlaces.length > 0}
									<div class="quick-places">
										<span class="quick-label">
											{currentLocale() === 'en'
												? `Landmarks in this region (${visiblePlaces.length})`
												: `Công trình tiêu biểu trong vùng (${visiblePlaces.length})`}
										</span>
										<div class="quick-place-grid">
											{#each visiblePlaces as place (place.id)}
												{#if isUnlockedState(place.state)}
													<a class="quick-place-btn" href="/world/{region.slug}/{place.slug}">
														<span>🏛️ {place.name}</span>
														<span class="go-arrow">→</span>
													</a>
												{:else}
													<button
														type="button"
														class="quick-place-btn locked"
														onclick={() => (selected = place)}
													>
														<span>🔒 {place.name}</span>
													</button>
												{/if}
											{/each}
										</div>
									</div>
								{/if}

								<p class="emblem-sync-note">
									{currentLocale() === 'en'
										? '⚙️ Waiting for Clockwork Tabletop & Intro Video sync from the new Studio App.'
										: '⚙️ Đang chờ đồng bộ Sa bàn Cơ khí Vùng & Video Intro từ App Studio mới.'}
								</p>
							</div>
						{/if}
					</div>
				</div>
			{/key}
			<RegionHud
				region={detail.region}
				places={detail.places}
				visitors={detail.visitors}
				{selected}
				onselect={(node) => (selected = node)}
			/>
		</div>
	{/if}
</section>

<style>
	.region-page {
		position: relative;
		width: 100%;
		height: calc(100vh - 4rem);
		min-height: 32rem;
		background: #050a14;
		overflow: hidden;
	}
	.stage {
		position: absolute;
		inset: 0;
	}
	.region-showcase {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4.5rem 2rem 2rem 20rem;
		overflow: hidden;
	}
	.region-showcase.with-right {
		padding-right: 22.5rem;
	}
	@media (max-width: 1024px) {
		.region-showcase,
		.region-showcase.with-right {
			padding: 4.4rem 1rem 1.5rem;
		}
	}
	.ambient-bg {
		position: absolute;
		inset: -5%;
		width: 110%;
		height: 110%;
		object-fit: cover;
		opacity: 0.18;
		filter: blur(26px) saturate(1.2);
		pointer-events: none;
	}
	.ambient-vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			rgba(10, 22, 38, 0.35) 0%,
			rgba(4, 8, 16, 0.94) 80%
		);
		pointer-events: none;
	}
	.showcase-center {
		position: relative;
		z-index: 2;
		width: 100%;
		max-width: 50rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.85rem;
	}
	.media-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
	}
	.media-tab {
		padding: 0.42rem 0.9rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 600;
		background: rgba(15, 23, 42, 0.82);
		border: 1px solid rgba(148, 163, 184, 0.25);
		color: #cbd5e1;
		cursor: pointer;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.media-tab.active {
		background: rgba(245, 158, 11, 0.18);
		border-color: rgba(251, 191, 36, 0.55);
		color: #fde68a;
	}
	.media-tab.pack-cta {
		background: rgba(16, 185, 129, 0.16);
		border-color: rgba(52, 211, 153, 0.45);
		color: #6ee7b7;
	}
	.video-frame-wrap,
	.gallery-frame-wrap {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.65rem;
	}
	.showcase-video {
		width: 100%;
		aspect-ratio: 16 / 9;
		max-height: 62vh;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: #000;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
	}
	.showcase-hero-img {
		max-width: 100%;
		max-height: 58vh;
		object-fit: contain;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
	}
	.gallery-thumbs {
		display: flex;
		gap: 0.45rem;
		overflow-x: auto;
		max-width: 100%;
		padding: 0.2rem;
	}
	.thumb-btn {
		width: 4.2rem;
		height: 2.7rem;
		padding: 0;
		border-radius: 8px;
		overflow: hidden;
		border: 2px solid transparent;
		opacity: 0.62;
		cursor: pointer;
		background: #0f172a;
	}
	.thumb-btn.active {
		border-color: #fbbf24;
		opacity: 1;
	}
	.thumb-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.region-emblem-card {
		width: 100%;
		max-width: 40rem;
		padding: 1.65rem 1.8rem;
		border-radius: 18px;
		background: rgba(10, 18, 32, 0.84);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(251, 191, 36, 0.22);
		box-shadow: 0 22px 55px rgba(0, 0, 0, 0.55);
		color: #f1f5f9;
	}
	.emblem-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-bottom: 0.7rem;
	}
	.planet-pill,
	.clockwork-pill {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.2rem 0.62rem;
		border-radius: 999px;
	}
	.planet-pill {
		background: rgba(245, 158, 11, 0.16);
		border: 1px solid rgba(251, 191, 36, 0.4);
		color: #fde68a;
	}
	.planet-pill.earth {
		background: rgba(56, 189, 248, 0.16);
		border: 1px solid rgba(56, 189, 248, 0.4);
		color: #bae6fd;
	}
	.clockwork-pill {
		background: rgba(148, 163, 184, 0.14);
		border: 1px solid rgba(148, 163, 184, 0.3);
		color: #e2e8f0;
	}
	.region-emblem-card h2 {
		margin: 0 0 0.65rem;
		font-size: 1.4rem;
		line-height: 1.3;
	}
	.emblem-desc {
		margin: 0 0 1.1rem;
		font-size: 0.9rem;
		line-height: 1.68;
		color: #cbd5e1;
	}
	.quick-places {
		margin-top: 0.9rem;
		padding-top: 0.9rem;
		border-top: 1px solid rgba(148, 163, 184, 0.15);
	}
	.quick-label {
		display: block;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #94a3b8;
		margin-bottom: 0.55rem;
	}
	.quick-place-grid {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.quick-place-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		padding: 0.62rem 0.9rem;
		border-radius: 10px;
		background: rgba(30, 41, 59, 0.65);
		border: 1px solid rgba(251, 191, 36, 0.22);
		color: #f8fafc;
		font-size: 0.86rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.quick-place-btn:hover {
		background: rgba(245, 158, 11, 0.16);
		border-color: rgba(251, 191, 36, 0.55);
	}
	.quick-place-btn.locked {
		border-color: rgba(148, 163, 184, 0.2);
		color: #94a3b8;
	}
	.go-arrow {
		color: #fbbf24;
		font-weight: 700;
	}
	.emblem-sync-note {
		margin: 1rem 0 0;
		padding-top: 0.8rem;
		border-top: 1px dashed rgba(148, 163, 184, 0.18);
		font-size: 0.78rem;
		color: #94a3b8;
	}
	.region-msg {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary, #cbd5e1);
	}
	.fallback-link {
		padding: 0.55rem 1.1rem;
		border: 1px solid var(--color-brand-500, #0c713d);
		border-radius: 999px;
		color: var(--color-brand-300, #4ade80);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.spinner {
		width: 1.6rem;
		height: 1.6rem;
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-top-color: var(--color-brand-500, #0c713d);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
