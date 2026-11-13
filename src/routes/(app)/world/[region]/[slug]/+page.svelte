<script lang="ts">
	/**
	 * L3 — Lightweight Web Location Showcase & Ecosystem Gateway Stage.
	 *
	 * Heavy `.glb` authoring & open-world 3D live in the dedicated Ecosystem
	 * Studio Desktop App; Web `/world/[region]/[slug]` stays instant, displaying
	 * synced Concept Art / Preview Gallery, GoT-style Intro Video, bilingual
	 * architectural strata lore (`parts`), and Desktop 3D Pack / VN Episode links.
	 */
	import { page } from '$app/state';
	import { currentLocale } from '$lib/i18n-labels';
	import * as m from '$lib/paraglide/messages';
	import { fetchLocation, markVisited } from '$lib/world/api';
	import {
		alignNodeWithCanonCoordinates,
		resolveCanonLocationDetail,
		resolveNodePlanet
	} from '$lib/world/cosmos';
	import type { LocationDetail, ScenePart, WorldNode } from '$lib/world/types';
	import LocationHud from '$lib/world/ui/LocationHud.svelte';
	import ClockworkPackViewer from '$lib/world/ui/ClockworkPackViewer.svelte';
	import { isClockworkGlb } from '$lib/world/engine/clockwork-pack';
	import { isDesktop } from '$lib/platform';
	import { onMount, untrack } from 'svelte';

	let slug = $derived(page.params.slug ?? '');

	let detail = $state<LocationDetail | null>(null);
	let loading = $state(true);
	let notFound = $state(false);

	let selectedPart = $state<string | null>(null);
	let activeMediaTab = $state<'gallery' | 'video' | 'clockwork'>('gallery');
	let activeGalleryIdx = $state(0);
	let loadedSlug = $state<string | null>(null);
	let loadedSearch = $state<string>('');
	let loadedLocale = $state<string>('vi');

	let parts = $derived<ScenePart[]>(
		(detail?.place.parts ?? []).map((p) => ({
			id: p.id,
			label: p.label,
			lore: p.lore ?? null,
			chapter: p.chapter ?? null
		}))
	);

	let galleryImages = $derived.by(() => {
		const p = detail?.place;
		if (!p) return [];
		const list: string[] = [];
		if (p.image_url?.trim()) list.push(p.image_url.trim());
		for (const u of p.preview_gallery ?? []) {
			const clean = u?.trim();
			if (clean && !list.includes(clean)) list.push(clean);
		}
		return list;
	});

	function extractYoutubeEmbed(url: string | null | undefined): string | null {
		if (!url) return null;
		const trimmed = url.trim();
		const m1 = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
		return m1 ? `https://www.youtube.com/embed/${m1[1]}?rel=0` : null;
	}

	function applyInitialQueryParams(params: URLSearchParams) {
		selectedPart = null;
		const rawPart = params.get('part');
		if (rawPart && rawPart.trim()) {
			selectedPart = rawPart.trim();
		}
		if (params.get('media') === 'video') {
			activeMediaTab = 'video';
		}
	}

	function syncDefaultMediaTab(place: WorldNode) {
		activeGalleryIdx = 0;
		const hasGallery = Boolean(place.image_url?.trim() || place.preview_gallery?.length);
		if (!hasGallery && place.intro_video_url?.trim()) {
			activeMediaTab = 'video';
		} else {
			activeMediaTab = 'gallery';
		}
	}

	async function loadLocationData(targetSlug: string) {
		if (!targetSlug) return;
		loading = true;
		notFound = false;

		const searchParams = new URLSearchParams(location.search);
		loadedSearch = location.search;
		const lang = currentLocale();

		try {
			const loadedDetail = await fetchLocation(targetSlug);
			const alignedPlace = alignNodeWithCanonCoordinates(loadedDetail.place, lang);
			detail = {
				...loadedDetail,
				place: alignedPlace
			};
			syncDefaultMediaTab(alignedPlace);
			applyInitialQueryParams(searchParams);
			loadedSlug = targetSlug;
			loadedLocale = lang;
			void markVisited(loadedDetail.place.id);
		} catch {
			const canonFallback = resolveCanonLocationDetail(targetSlug, lang);
			if (canonFallback) {
				detail = canonFallback;
				syncDefaultMediaTab(canonFallback.place);
				applyInitialQueryParams(searchParams);
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
		void loadLocationData(slug);
	});

	$effect(() => {
		const currentSlug = slug;
		if (loadedSlug !== null && currentSlug && currentSlug !== loadedSlug) {
			void loadLocationData(currentSlug);
		}
	});

	$effect(() => {
		const currentSlug = slug;
		const currentSearch = page.url.search;
		untrack(() => {
			if (loadedSlug !== null && currentSlug === loadedSlug && currentSearch !== loadedSearch) {
				loadedSearch = currentSearch;
				applyInitialQueryParams(new URLSearchParams(currentSearch));
			}
		});
	});

	$effect(() => {
		void page.url.href;
		const lang = currentLocale();
		untrack(() => {
			if (!loadedSlug || !detail || lang === loadedLocale) return;
			loadedLocale = lang;
			if (detail.place.id < 0) {
				const refreshed = resolveCanonLocationDetail(loadedSlug, lang);
				if (refreshed) {
					detail = refreshed;
				}
			} else {
				detail = {
					...detail,
					place: alignNodeWithCanonCoordinates(detail.place, lang)
				};
			}
		});
	});
</script>

<svelte:head>
	<title>{detail?.place.name ?? m.world_title()} — Selorson</title>
</svelte:head>

<section class="place-page">
	{#if loading}
		<div class="place-msg"><span class="spinner"></span>{m.world_loading()}</div>
	{:else if notFound || !detail}
		<div class="place-msg">
			<p>{m.world_place_not_found()}</p>
			<a class="fallback-link" href="/world">{m.world_back_to_globe()}</a>
		</div>
	{:else}
		{@const place = detail.place}
		{@const accent = place.color ?? '#38bdf8'}
		{@const ytEmbed = extractYoutubeEmbed(place.intro_video_url)}
		{@const isEn = currentLocale() === 'en'}
		{@const hasLeftSidebar =
			parts.length > 0 ||
			(detail.visitors?.length ?? 0) > 0 ||
			(detail.linked_items?.length ?? 0) > 0 ||
			detail.neighbours.length > 0}
		{#key detail.place.id}
			<div class="stage" style="--place-accent: {accent};">
				<div class="place-2d-backdrop">
					{#if galleryImages.length > 0}
						<img
							src={galleryImages[activeGalleryIdx] ?? galleryImages[0]}
							alt=""
							class="backdrop-img"
						/>
					{/if}
					<div class="backdrop-radial"></div>
				</div>

				<div class="showcase-center" class:no-left-panel={!hasLeftSidebar}>
					{#if activeMediaTab === 'clockwork' && isDesktop && isClockworkGlb(place.clockwork_pack_url)}
						<div class="media-frame">
							<ClockworkPackViewer url={place.clockwork_pack_url ?? ''} title={place.name ?? ''} />
						</div>
					{:else if activeMediaTab === 'video' && place.intro_video_url}
						<div class="media-frame video-frame">
							{#if ytEmbed}
								<iframe
									src={ytEmbed}
									title={place.name ?? 'Intro Video'}
									frameborder="0"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowfullscreen
								></iframe>
							{:else}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video src={place.intro_video_url} controls preload="metadata" playsinline></video>
							{/if}
						</div>
					{:else if galleryImages.length > 0}
						<div class="media-frame">
							<img
								src={galleryImages[activeGalleryIdx] ?? galleryImages[0]}
								alt={place.name ?? ''}
								class="showcase-hero-img"
							/>
							{#if galleryImages.length > 1}
								<div class="gallery-thumbs">
									{#each galleryImages as imgUrl, idx (imgUrl)}
										<button
											type="button"
											class="thumb-btn"
											class:active={activeGalleryIdx === idx}
											onclick={() => (activeGalleryIdx = idx)}
										>
											<img src={imgUrl} alt="" />
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<div class="cosmic-emblem-card">
							<div class="emblem-orbit">
								<span class="emblem-planet-tag">
									{resolveNodePlanet(place) === 'earth'
										? isEn
											? '🌍 Multi-Era Earth'
											: '🌍 Trái Đất Đa Kỷ Nguyên'
										: isEn
											? '🪐 Planet Akunalia'
											: '🪐 Hành Tinh Akunalia'}
								</span>
								{#if place.wavelength_nm}
									<span class="emblem-wave">{place.wavelength_nm} nm</span>
								{/if}
							</div>
							<h2 class="emblem-title">{place.name ?? m.world_unknown_place()}</h2>
							{#if place.lat !== null && place.lng !== null}
								<p class="emblem-coords">
									{place.lat.toFixed(2)}°, {place.lng.toFixed(2)}°
									{#if place.terrain} · {place.terrain}{/if}
								</p>
							{/if}
							<p class="emblem-sync-note">
								{isEn
									? '🎬 Awaiting Intro Film & 3D Architecture Gallery sync from Ecosystem Studio.'
									: '🎬 Đang chờ đồng bộ Video Intro & Ảnh kiến trúc 3D từ App Studio mới.'}
							</p>
						</div>
					{/if}
				</div>

				<LocationHud
					{place}
					region={detail.region}
					neighbours={detail.neighbours}
					chapters={detail.chapters}
					visitors={detail.visitors ?? []}
					linkedItems={detail.linked_items ?? []}
					{parts}
					{selectedPart}
					{activeMediaTab}
					hasGallery={galleryImages.length > 0}
					hasClockwork={isDesktop && isClockworkGlb(place.clockwork_pack_url)}
					onselectpart={(id) => (selectedPart = id)}
					onmediatab={(tab) => (activeMediaTab = tab)}
				/>
			</div>
		{/key}
	{/if}
</section>

<style>
	.place-page {
		position: relative;
		width: 100%;
		height: calc(100vh - 4rem);
		min-height: 34rem;
		background: #060d15;
		overflow: hidden;
	}
	.stage {
		position: absolute;
		inset: 0;
	}
	.place-2d-backdrop {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, #0e2238 0%, #050b12 100%);
	}
	.backdrop-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.22;
		filter: blur(18px) saturate(1.15);
		transform: scale(1.06);
	}
	.backdrop-radial {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			circle at 50% 48%,
			color-mix(in srgb, var(--place-accent, #38bdf8) 18%, transparent) 0%,
			rgba(5, 11, 18, 0.78) 72%
		);
	}
	.showcase-center {
		position: absolute;
		inset: 4.5rem 24.5rem 4.6rem 19.5rem;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
	}
	.media-frame {
		position: relative;
		width: 100%;
		height: 100%;
		max-width: 64rem;
		border-radius: 14px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(6, 12, 20, 0.82);
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
		display: flex;
		flex-direction: column;
	}
	.showcase-hero-img {
		width: 100%;
		flex: 1;
		min-height: 0;
		object-fit: contain;
		background: #050a11;
	}
	.video-frame iframe,
	.video-frame video {
		width: 100%;
		height: 100%;
		background: #000;
	}
	.gallery-thumbs {
		display: flex;
		gap: 0.45rem;
		padding: 0.5rem 0.7rem;
		background: rgba(8, 14, 24, 0.92);
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		overflow-x: auto;
	}
	.thumb-btn {
		width: 3.8rem;
		height: 2.5rem;
		padding: 0;
		border-radius: 6px;
		overflow: hidden;
		border: 1.5px solid rgba(255, 255, 255, 0.16);
		background: #0b1320;
		cursor: pointer;
		flex-shrink: 0;
		opacity: 0.68;
	}
	.thumb-btn.active {
		border-color: #ffb703;
		opacity: 1;
	}
	.thumb-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.cosmic-emblem-card {
		width: 100%;
		max-width: 44rem;
		max-height: 100%;
		overflow-y: auto;
		padding: 1.6rem 1.8rem;
		border-radius: 16px;
		background: rgba(8, 15, 26, 0.72);
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in srgb, var(--place-accent, #38bdf8) 38%, rgba(255, 255, 255, 0.1));
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
		color: #f1f5f9;
	}
	.emblem-orbit {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex-wrap: wrap;
		margin-bottom: 0.65rem;
	}
	.emblem-planet-tag,
	.emblem-wave {
		font-size: 0.72rem;
		padding: 0.22rem 0.65rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #e2e8f0;
	}
	.emblem-wave {
		color: var(--place-accent, #38bdf8);
		border-color: color-mix(in srgb, var(--place-accent, #38bdf8) 50%, transparent);
	}
	.emblem-title {
		margin: 0 0 0.35rem;
		font-size: 1.3rem;
		line-height: 1.35;
	}
	.emblem-coords {
		margin: 0 0 1rem;
		font-size: 0.78rem;
		color: #94a3b8;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	.showcase-center.no-left-panel {
		left: 1.5rem;
	}
	.emblem-sync-note {
		margin: 0.4rem 0 0;
		padding: 0.65rem 0.85rem;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px dashed rgba(255, 255, 255, 0.16);
		font-size: 0.84rem;
		color: #94a3b8;
		line-height: 1.5;
	}
	.place-msg {
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

	@media (max-width: 1200px) {
		.showcase-center {
			inset: 4.5rem 21rem 4.5rem 17rem;
		}
	}
	@media (max-width: 1024px) {
		.showcase-center {
			inset: 4.2rem 0.7rem 4.2rem 0.7rem;
		}
	}
</style>
