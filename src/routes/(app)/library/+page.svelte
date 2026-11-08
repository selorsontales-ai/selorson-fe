<script lang="ts">
	import { api } from '$lib/api';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import CommentsSection from '$lib/components/ui/CommentsSection.svelte';
	import { formatCategoryLabel, formatEntryRoleLabel } from '$lib/i18n-labels';

	const LOCAL_PROGRESS_KEY = 'selorson_reading_progress';
	const SPOILER_SHIELD_KEY = 'selorson_library_spoiler_shield';

	interface LibraryItem {
		id: number;
		category: string;
		name: string;
		description?: string | null;
		image_url?: string | null;
		image_ratio?: string | null;
		story_link?: string | null;
		coordinates?: string | null;
		terrain?: string | null;
		extra_data?: Record<string, any> | null;
		display_order: number;
		aliases?: string[];
		role?: string | null;
		first_chapter?: number | null;
		appearance_count?: number;
		chapter_numbers?: number[];
		linked_count?: number;
		has_3d_location?: boolean;
		world_target_url?: string | null;
		link_role?: string;
		link_direction?: string;
	}

	interface ChapterAppearance {
		id: number;
		chapter_number: number;
		title: string;
		entry_role: string;
		is_debut: boolean;
		has_manga: boolean;
		user_progress?: {
			last_position: number;
			is_completed: boolean;
		} | null;
	}

	const categories = () => [
		{ key: '', bucket: 'all', label: m.lib_cat_all(), icon: '📚' },
		{ key: 'character', bucket: 'character', label: m.world_characters(), icon: '👤' },
		{ key: 'location', bucket: 'location', label: m.lib_cat_location(), icon: '🗺️' },
		{ key: 'item', bucket: 'item', label: m.lib_cat_item(), icon: '🔮' },
		{ key: 'faction', bucket: 'faction', label: m.lib_factions(), icon: '🏛️' },
		{ key: 'creature', bucket: 'creature', label: m.lib_creatures(), icon: '🐉' },
		{ key: 'lore', bucket: 'lore', label: m.lib_cat_lore(), icon: '📜' }
	];

	let categoryLabels = $derived<Record<string, string>>({
		character: m.cat_character(),
		main_character: m.lib_cat_main_char(),
		side_character: m.lib_supporting_character(),
		location: m.cat_location(),
		item: m.lib_relic_item(),
		artifact: m.lib_artifact_relic(),
		weapon: m.lib_weapon(),
		faction: m.lib_faction_organization(),
		organization: m.cat_organization(),
		creature: m.cat_creature(),
		magic: m.lib_ancient_magic_skill(),
		event: m.lib_historical_event(),
		concept: m.lib_concept_law(),
		lore: m.lib_cat_lore()
	});

	const categoryIcons: Record<string, string> = {
		character: '👤',
		main_character: '👑',
		side_character: '👤',
		location: '🏔️',
		item: '🔮',
		artifact: '✨',
		weapon: '⚔️',
		faction: '🏛️',
		organization: '🏛️',
		creature: '🐉',
		magic: '⚡',
		event: '⏳',
		concept: '🌌',
		lore: '📜'
	};

	let entryRoleLabels = $derived<Record<string, string>>({
		first_appearance: m.lib_debut_chapter_2(),
		debut: m.lib_debut_chapter_2(),
		protagonist: m.lib_central_protagonist(),
		appears: m.lib_direct_appearance(),
		mentioned: m.lib_mentioned(),
		location: m.lib_setting_location()
	});

	let allItems = $state<LibraryItem[]>([]);
	let loading = $state(true);
	let activeCategory = $state('');
	let searchQuery = $state('');
	let sortBy = $state<'order' | 'appearances' | 'first_chapter' | 'name'>('order');
	let chapterFilter = $state<number | null>(null);

	// Spoiler Shield state
	let spoilerShieldEnabled = $state(true);
	let userMaxReadChapter = $state<number>(0);
	let customSpoilerCap = $state<number | null>(null);
	let unlockedSpoilerIds = $state<Record<number, boolean>>({});
	let localProgressByChapterNum = $state<Record<number, number>>({});

	// Dossier Modal & History state
	let selectedItem = $state<LibraryItem | null>(null);
	let dossierLoading = $state(false);
	let dossierLinkedItems = $state<LibraryItem[]>([]);
	let dossierChapters = $state<ChapterAppearance[]>([]);
	let dossierHistory = $state<LibraryItem[]>([]);
	let lightboxImage = $state<{ url: string; title: string } | null>(null);
	let copiedLink = $state(false);

	let effectiveSpoilerChapter = $derived(
		customSpoilerCap !== null ? customSpoilerCap : userMaxReadChapter
	);

	function canonicalBucket(cat: string): string {
		const c = (cat || '').trim();
		if (c === 'character' || c === 'main_character' || c === 'side_character') return 'character';
		if (c === 'location') return 'location';
		if (c === 'item' || c === 'artifact' || c === 'weapon') return 'item';
		if (c === 'faction' || c === 'organization') return 'faction';
		if (c === 'creature') return 'creature';
		if (c === 'lore' || c === 'concept' || c === 'event' || c === 'magic') return 'lore';
		return c;
	}

	function extractAliases(item: LibraryItem): string[] {
		if (Array.isArray(item.aliases) && item.aliases.length > 0) {
			return item.aliases;
		}
		const raw = item.extra_data?.aliases;
		if (Array.isArray(raw)) {
			return raw.map((s) => String(s).trim()).filter(Boolean);
		}
		if (typeof raw === 'string' && raw.trim()) {
			return raw
				.split(/[,;|]/)
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return [];
	}

	function extractRole(item: LibraryItem): string | null {
		if (item.role && item.role.trim()) return item.role.trim();
		const r = item.extra_data?.role;
		return typeof r === 'string' && r.trim() ? r.trim() : null;
	}

	function extractFirstChapter(item: LibraryItem): number | null {
		if (typeof item.first_chapter === 'number' && item.first_chapter > 0) {
			return item.first_chapter;
		}
		const raw = item.extra_data?.first_chapter;
		if (typeof raw === 'number' && raw > 0) return raw;
		if (typeof raw === 'string') {
			const matched = raw.match(/\d+/);
			if (matched) {
				const n = parseInt(matched[0], 10);
				if (n > 0) return n;
			}
		}
		return null;
	}

	let categoryCounts = $derived.by(() => {
		const counts: Record<string, number> = { all: allItems.length };
		for (const item of allItems) {
			const b = canonicalBucket(item.category);
			counts[b] = (counts[b] || 0) + 1;
		}
		return counts;
	});

	let availableChapters = $derived.by(() => {
		const set = new Set<number>();
		for (const item of allItems) {
			const fc = extractFirstChapter(item);
			if (fc && fc > 0) set.add(fc);
			for (const ch of item.chapter_numbers || []) {
				if (ch > 0) set.add(ch);
			}
		}
		return Array.from(set).sort((a, b) => a - b);
	});

	let filteredItems = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		const cat = activeCategory.trim();

		const list = allItems.filter((item) => {
			if (cat && canonicalBucket(item.category) !== cat) {
				return false;
			}
			const chNums = item.chapter_numbers || [];
			const firstCh = extractFirstChapter(item);
			if (chapterFilter !== null) {
				if (!chNums.includes(chapterFilter) && firstCh !== chapterFilter) {
					return false;
				}
			}
			if (q) {
				const nameMatch = item.name.toLowerCase().includes(q);
				const descMatch = (item.description || '').toLowerCase().includes(q);
				const roleMatch = (extractRole(item) || '').toLowerCase().includes(q);
				const aliasMatch = extractAliases(item).some((a) => a.toLowerCase().includes(q));
				const terrainMatch = (item.terrain || '').toLowerCase().includes(q);
				const catLabelMatch = (categoryLabels[item.category] || item.category)
					.toLowerCase()
					.includes(q);

				// Hỗ trợ gõ "ch.1", "ch 1", "chương 1"
				let chQueryMatch = false;
				const chMatch = q.match(/^(?:chương|chuong|ch\.?)\s*(\d+)$/i);
				if (chMatch) {
					const targetNum = parseInt(chMatch[1], 10);
					chQueryMatch = chNums.includes(targetNum) || firstCh === targetNum;
				}

				if (
					!nameMatch &&
					!descMatch &&
					!roleMatch &&
					!aliasMatch &&
					!terrainMatch &&
					!catLabelMatch &&
					!chQueryMatch
				) {
					return false;
				}
			}
			return true;
		});

		const sorted = [...list];
		if (sortBy === 'appearances') {
			sorted.sort(
				(a, b) =>
					(b.appearance_count || 0) - (a.appearance_count || 0) ||
					a.display_order - b.display_order ||
					a.name.localeCompare(b.name, 'vi')
			);
		} else if (sortBy === 'first_chapter') {
			sorted.sort((a, b) => {
				const fa = extractFirstChapter(a) ?? 999999;
				const fb = extractFirstChapter(b) ?? 999999;
				return fa - fb || a.display_order - b.display_order || a.name.localeCompare(b.name, 'vi');
			});
		} else if (sortBy === 'name') {
			sorted.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
		} else {
			sorted.sort((a, b) => a.display_order - b.display_order || a.id - b.id);
		}

		return sorted;
	});

	function isSpoilerLocked(item: LibraryItem): boolean {
		if (!spoilerShieldEnabled) return false;
		if (unlockedSpoilerIds[item.id]) return false;
		const cap = effectiveSpoilerChapter;
		if (!cap || cap <= 0) return false;
		const firstCh = extractFirstChapter(item);
		if (!firstCh || firstCh <= 0) return false;
		return firstCh > cap;
	}

	function unlockItemSpoiler(itemId: number, e?: MouseEvent) {
		if (e) e.stopPropagation();
		unlockedSpoilerIds = { ...unlockedSpoilerIds, [itemId]: true };
	}

	function toggleSpoilerShield() {
		spoilerShieldEnabled = !spoilerShieldEnabled;
		try {
			localStorage.setItem(SPOILER_SHIELD_KEY, spoilerShieldEnabled ? '1' : '0');
		} catch {}
	}

	function loadLocalReadingProgress() {
		try {
			const savedShield = localStorage.getItem(SPOILER_SHIELD_KEY);
			if (savedShield === '0') spoilerShieldEnabled = false;
			const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				let maxCh = 0;
				const byNum: Record<number, number> = {};
				for (const [key, val] of Object.entries(parsed)) {
					const num = Number((val as any)?.chapter_number || key);
					const pos = Number((val as any)?.last_position ?? val ?? 0);
					if (Number.isFinite(num) && num > 0 && pos > 0) {
						byNum[num] = pos;
						if (num > maxCh) maxCh = num;
					}
				}
				localProgressByChapterNum = byNum;
				if (maxCh > userMaxReadChapter) {
					userMaxReadChapter = maxCh;
				}
			}
		} catch {}
	}

	function resolveAspectRatio(ratio?: string | null): string {
		if (!ratio) return '1 / 1';
		const clean = ratio.trim();
		if (clean === '16:9') return '16 / 9';
		if (clean === '4:3') return '4 / 3';
		if (clean === '3:4') return '3 / 4';
		if (clean === '9:16') return '3 / 4';
		return '1 / 1';
	}

	function splitDescriptionParagraphs(text?: string | null): string[] {
		if (!text) return [];
		return text
			.split(/\n+/)
			.map((line) => line.trim())
			.filter(Boolean);
	}

	function getChapterReadStatus(ch: ChapterAppearance): {
		percent: number;
		completed: boolean;
	} | null {
		if (ch.user_progress) {
			return {
				percent: ch.user_progress.last_position,
				completed: ch.user_progress.is_completed || ch.user_progress.last_position >= 95
			};
		}
		const localPos = localProgressByChapterNum[ch.chapter_number];
		if (typeof localPos === 'number' && localPos > 0) {
			return {
				percent: localPos,
				completed: localPos >= 95
			};
		}
		return null;
	}

	let activeDossierRequestId = 0;
	let lastSyncedUrlId: string | null = null;
	let initialLoaded = $state(false);

	function syncUrlQueryParam(itemId: number | null) {
		try {
			const nextIdStr = itemId ? String(itemId) : null;
			lastSyncedUrlId = nextIdStr;
			const url = new URL(window.location.href);
			if (nextIdStr) {
				url.searchParams.set('id', nextIdStr);
			} else {
				url.searchParams.delete('id');
			}
			replaceState(url.pathname + url.search + url.hash, {});
		} catch {}
	}

	async function openDossier(itemOrId: LibraryItem | number, pushToHistory = false, syncUrl = true) {
		const reqId = ++activeDossierRequestId;
		const targetId = typeof itemOrId === 'number' ? itemOrId : itemOrId.id;
		const existing =
			typeof itemOrId === 'object'
				? itemOrId
				: allItems.find((x) => x.id === targetId) || null;

		if (pushToHistory && selectedItem && selectedItem.id !== targetId) {
			dossierHistory = [...dossierHistory, selectedItem];
		} else if (!pushToHistory) {
			dossierHistory = [];
		}

		if (existing) {
			selectedItem = existing;
		}
		dossierLoading = true;
		dossierLinkedItems = [];
		dossierChapters = [];
		copiedLink = false;
		if (syncUrl) {
			syncUrlQueryParam(targetId);
		} else {
			lastSyncedUrlId = String(targetId);
		}

		try {
			const res = await api<any>(`/library/${targetId}`);
			if (reqId !== activeDossierRequestId) return;
			if (res?.success && res.data?.item) {
				selectedItem = res.data.item;
				dossierLinkedItems = res.data.linked_items || [];
				dossierChapters = res.data.chapters || [];
				if (
					typeof res.data.read_up_to === 'number' &&
					res.data.read_up_to > userMaxReadChapter
				) {
					userMaxReadChapter = res.data.read_up_to;
				}
			}
		} catch {}
		if (reqId === activeDossierRequestId) {
			dossierLoading = false;
		}
	}

	function goBackDossierHistory() {
		if (dossierHistory.length === 0) return;
		const prev = dossierHistory[dossierHistory.length - 1];
		dossierHistory = dossierHistory.slice(0, -1);
		openDossierWithoutResettingHistory(prev);
	}

	async function openDossierWithoutResettingHistory(item: LibraryItem) {
		const reqId = ++activeDossierRequestId;
		selectedItem = item;
		dossierLoading = true;
		dossierLinkedItems = [];
		dossierChapters = [];
		copiedLink = false;
		syncUrlQueryParam(item.id);
		try {
			const res = await api<any>(`/library/${item.id}`);
			if (reqId !== activeDossierRequestId) return;
			if (res?.success && res.data?.item) {
				selectedItem = res.data.item;
				dossierLinkedItems = res.data.linked_items || [];
				dossierChapters = res.data.chapters || [];
			}
		} catch {}
		if (reqId === activeDossierRequestId) {
			dossierLoading = false;
		}
	}

	function closeDossier(syncUrl = true) {
		++activeDossierRequestId;
		selectedItem = null;
		dossierLoading = false;
		dossierHistory = [];
		if (syncUrl) {
			syncUrlQueryParam(null);
		} else {
			lastSyncedUrlId = null;
		}
	}

	async function copyDossierLink() {
		if (!selectedItem) return;
		try {
			const shareUrl = `${window.location.origin}/library?id=${selectedItem.id}`;
			await navigator.clipboard.writeText(shareUrl);
			copiedLink = true;
			setTimeout(() => {
				copiedLink = false;
			}, 2200);
		} catch {}
	}

	function resetAllFilters() {
		activeCategory = '';
		searchQuery = '';
		sortBy = 'order';
		chapterFilter = null;
	}

	async function fetchAllLibraryItems() {
		loading = true;
		try {
			const res = await api<any>('/library');
			allItems = res.data || [];
			const readUpTo = (res.meta as any)?.read_up_to;
			if (typeof readUpTo === 'number' && readUpTo > userMaxReadChapter) {
				userMaxReadChapter = readUpTo;
			}
		} catch {
			allItems = [];
		}
		loading = false;
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (lightboxImage) {
				lightboxImage = null;
				return;
			}
			if (selectedItem) {
				closeDossier();
			}
		}
	}

	onMount(async () => {
		loadLocalReadingProgress();

		const initQ = page.url.searchParams.get('q');
		const initCat = page.url.searchParams.get('category');

		if (initQ) searchQuery = initQ;
		if (initCat) activeCategory = initCat;

		await fetchAllLibraryItems();
		initialLoaded = true;
	});

	$effect(() => {
		if (!initialLoaded) return;
		const urlId = page.url.searchParams.get('id');
		if (urlId === lastSyncedUrlId) return;

		if (urlId) {
			const parsedId = parseInt(urlId, 10);
			if (Number.isFinite(parsedId) && parsedId > 0) {
				openDossier(parsedId, false, false);
			}
		} else if (selectedItem) {
			closeDossier(false);
		}
	});
</script>

<svelte:head><title>{m.lib_seo_title()}</title></svelte:head>
<svelte:window onkeydown={handleGlobalKeydown} />

<section class="lib-page">
	<section class="page-hero">
		<div class="hero-glow"></div>
		<div class="hero-content">
			<span class="codex-eyebrow">✨ {m.lib_akunalia_encyclopedia()}</span>
			<h1>{m.lib_list_title()}</h1>
			<p class="hero-tagline">{m.lib_list_subtitle()}</p>

			<div class="hero-stats-row">
				<div class="stat-pill">
					<strong>{allItems.length}</strong>
					<span>{m.lib_entity_dossiers()}</span>
				</div>
				<div class="stat-pill">
					<strong>{categoryCounts.character || 0}</strong>
					<span>{m.world_characters()}</span>
				</div>
				<div class="stat-pill">
					<strong>{categoryCounts.location || 0}</strong>
					<span>{m.lib_locations()}</span>
				</div>
				<a class="world-cta" href="/world">🌍 {m.lib_enter_world()}</a>
			</div>
		</div>
	</section>

	<div class="lib-content">
		<!-- Control Bar: Search + Sort + Chapter Filter + Spoiler Shield -->
		<div class="codex-toolbar glass-card">
			<div class="toolbar-top">
				<div class="search-box">
					<span class="search-icon">🔍</span>
					<input
						type="text"
						class="search-input"
						placeholder={m.lib_search_by_name_alias_role()}
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button
							type="button"
							class="clear-search-btn"
							onclick={() => (searchQuery = '')}
							title={m.lib_clear_search()}
						>
							✕
						</button>
					{/if}
				</div>

				<div class="toolbar-controls">
					{#if availableChapters.length > 0}
						<select
							class="codex-select"
							value={chapterFilter === null ? '' : String(chapterFilter)}
							onchange={(e) => {
								const v = (e.currentTarget as HTMLSelectElement).value;
								chapterFilter = v ? parseInt(v, 10) : null;
							}}
							title={m.lib_filter_entities_by_chapter()}
						>
							<option value="">📖 {m.lib_all_chapters()}</option>
							{#each availableChapters as chNum}
								<option value={String(chNum)}>{m.world_chapter()} {chNum}</option>
							{/each}
						</select>
					{/if}

					<select class="codex-select" bind:value={sortBy} title={m.lib_sort_entities()}>
						<option value="order">✨ {m.reader_theme_default()}</option>
						<option value="appearances">🔥 {m.lib_most_appearances()}</option>
						<option value="first_chapter">📖 {m.lib_by_debut_chapter()}</option>
						<option value="name">🔤 {m.lib_name_a_z()}</option>
					</select>
				</div>
			</div>

			<!-- Category Pills with Live Counts -->
			<div class="filters">
				{#each categories() as cat}
					{@const count = categoryCounts[cat.bucket] || 0}
					{#if cat.key === '' || count > 0}
						<button
							type="button"
							class="filter-btn"
							class:active={activeCategory === cat.key}
							onclick={() => (activeCategory = cat.key)}
						>
							<span>{cat.icon} {cat.label}</span>
							<span class="cat-count">{count}</span>
						</button>
					{/if}
				{/each}
			</div>

			<!-- Spoiler Shield Bar -->
			<div class="spoiler-bar">
				<div class="spoiler-left">
					<button
						type="button"
						class="shield-toggle"
						class:active={spoilerShieldEnabled}
						onclick={toggleSpoilerShield}
					>
						<span class="shield-dot"></span>
						🛡️ {m.lib_spoiler_shield()} <strong>{spoilerShieldEnabled ? m.lib_on() : m.lib_off()}</strong>
					</button>

					{#if spoilerShieldEnabled}
						<div class="spoiler-cap-ctrl">
							<span class="spoiler-hint">
								{#if effectiveSpoilerChapter > 0}
									{m.lib_hide_descriptions_of_entities_debuting()} <strong>{m.world_chapter()} {effectiveSpoilerChapter}</strong>
								{:else}
									{m.lib_select_your_current_chapter_cap()}
								{/if}
							</span>
							<div class="cap-stepper">
								<button
									type="button"
									class="step-btn"
									onclick={() => {
										const base = effectiveSpoilerChapter || 1;
										customSpoilerCap = Math.max(0, base - 1);
									}}
									title={m.lib_decrease_chapter_cap()}
								>
									−
								</button>
								<span class="cap-value">
									{effectiveSpoilerChapter > 0 ? `Ch. ${effectiveSpoilerChapter}` : m.lib_no_cap()}
								</span>
								<button
									type="button"
									class="step-btn"
									onclick={() => {
										const base = effectiveSpoilerChapter || 0;
										customSpoilerCap = base + 1;
									}}
									title={m.lib_increase_chapter_cap()}
								>
									+
								</button>
								{#if customSpoilerCap !== null && customSpoilerCap !== userMaxReadChapter}
									<button
										type="button"
										class="reset-cap-btn"
										onclick={() => (customSpoilerCap = null)}
										title={m.lib_restore_to_automatic_reading_progress()}
									>
										{m.lib_auto()}
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<div class="results-counter">
					{m.lib_showing()} <strong>{filteredItems.length}</strong> / {allItems.length} {m.lib_entities()}
					{#if activeCategory || searchQuery || chapterFilter !== null}
						<button type="button" class="reset-filter-link" onclick={resetAllFilters}>
							{m.lib_clear_filters()}
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Items Grid -->
		{#if loading}
			<div class="grid">
				{#each Array(6) as _}
					<div class="skel"></div>
				{/each}
			</div>
		{:else if filteredItems.length === 0}
			<div class="empty glass-card">
				<span>📚</span>
				<h3>
					{allItems.length === 0
						? m.lib_empty_title()
						: m.lib_no_entities_match_the_current()}
				</h3>
				{#if activeCategory || searchQuery || chapterFilter !== null}
					<button type="button" class="btn-reset-empty" onclick={resetAllFilters}>
						{m.lib_view_all_entities()}
					</button>
				{/if}
			</div>
		{:else}
			<div class="grid">
				{#each filteredItems as item (item.id)}
					{@const aliases = extractAliases(item)}
					{@const role = extractRole(item)}
					{@const firstCh = extractFirstChapter(item)}
					{@const locked = isSpoilerLocked(item)}
					<div
						class="glass-card item-card"
						role="button"
						tabindex="0"
						onclick={() => openDossier(item, false)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								openDossier(item, false);
							}
						}}
					>
						<div class="item-visual" style="aspect-ratio: {resolveAspectRatio(item.image_ratio)}">
							{#if item.image_url}
								<img
									src={item.image_url}
									alt={item.name}
									loading="lazy"
									class:blurred-img={locked}
								/>
							{:else}
								<div class="item-placeholder" data-bucket={canonicalBucket(item.category)}>
									<span class="placeholder-icon">
										{categoryIcons[item.category] || '✨'}
									</span>
									<span class="placeholder-letter">{item.name.slice(0, 1).toUpperCase()}</span>
								</div>
							{/if}

							<div class="visual-badges">
								<span class="item-cat">
									{categoryIcons[item.category] || '📌'}
									{categoryLabels[item.category] || item.category}
								</span>
								{#if item.has_3d_location || item.category === 'location'}
									<span class="badge-3d" title={m.lib_available_on_3d_world_map()}>🌍 3D</span>
								{/if}
							</div>

							{#if firstCh}
								<span class="debut-badge" title={m.lib_first_appearance_chapter()}>
									🌟 Ch.{firstCh}
								</span>
							{/if}
						</div>

						<div class="item-body">
							{#if role}
								<span class="item-role">{formatEntryRoleLabel(role)}</span>
							{/if}
							<h3>{item.name}</h3>

							{#if aliases.length > 0}
								<div class="alias-chips">
									{#each aliases.slice(0, 2) as alias}
										<span class="alias-chip">{alias}</span>
									{/each}
									{#if aliases.length > 2}
										<span class="alias-chip more">+{aliases.length - 2}</span>
									{/if}
								</div>
							{/if}

							{#if locked}
								<div class="spoiler-card-mask">
									<p class="spoiler-msg">
										🔒 {m.lib_entity_debuts_in()} <strong>{m.world_chapter()} {firstCh}</strong>
									</p>
									<button
										type="button"
										class="unlock-inline-btn"
										onclick={(e) => unlockItemSpoiler(item.id, e)}
									>
										{m.lib_unlock_preview()}
									</button>
								</div>
							{:else if item.description}
								<p class="item-desc">{item.description}</p>
							{:else}
								<p class="item-desc muted">{m.lib_click_to_view_detailed_dossier()}</p>
							{/if}

							<div class="item-footer">
								<div class="footer-metrics">
									{#if (item.appearance_count || 0) > 0}
										<span class="metric-tag" title={m.lib_published_chapter_appearances()}>
											📖 {item.appearance_count} {m.lib_ch()}
										</span>
									{/if}
									{#if (item.linked_count || 0) > 0}
										<span class="metric-tag" title={m.lib_linked_entities()}>
											🔗 {item.linked_count} {m.lib_links()}
										</span>
									{/if}
								</div>
								<span class="open-dossier-hint">{m.lib_details()}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>

<!-- Interactive Lore Dossier Modal -->
{#if selectedItem}
	{@const dAliases = extractAliases(selectedItem)}
	{@const dRole = extractRole(selectedItem)}
	{@const dFirstCh = extractFirstChapter(selectedItem)}
	{@const dLocked = isSpoilerLocked(selectedItem)}
	{@const paragraphs = splitDescriptionParagraphs(selectedItem.description)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="dossier-overlay" onclick={() => closeDossier()}>
		<div class="dossier-modal glass-card" onclick={(e) => e.stopPropagation()}>
			<!-- Top Navigation Bar -->
			<div class="dossier-topbar">
				<div class="topbar-left">
					{#if dossierHistory.length > 0}
						{@const prevItem = dossierHistory[dossierHistory.length - 1]}
						<button type="button" class="back-history-btn" onclick={goBackDossierHistory}>
							← {m.lib_back_to()} {prevItem.name}
						</button>
					{:else}
						<span class="dossier-kicker">📜 {m.lib_akunalia_encyclopedia_dossier()}</span>
					{/if}
				</div>

				<div class="topbar-right">
					<button
						type="button"
						class="share-link-btn"
						onclick={copyDossierLink}
						title={m.lib_copy_direct_link_to_this()}
					>
						{copiedLink ? m.lib_link_copied() : m.lib_copy_link()}
					</button>
					<button
						type="button"
						class="close-dossier-btn"
						onclick={() => closeDossier()}
						title={m.lib_close_esc()}
					>
						✕
					</button>
				</div>
			</div>

			<div class="dossier-scroll-body">
				<!-- Hero Section -->
				<div class="dossier-hero">
					<div class="dossier-portrait-col">
						{#if selectedItem.image_url}
							<button
								type="button"
								class="portrait-frame"
								onclick={() =>
									(lightboxImage = {
										url: selectedItem!.image_url!,
										title: selectedItem!.name
									})}
								title={m.lib_click_to_enlarge_portrait()}
							>
								<img src={selectedItem.image_url} alt={selectedItem.name} />
								<span class="zoom-hint">{m.lib_zoom()}</span>
							</button>
						{:else}
							<div
								class="portrait-placeholder"
								data-bucket={canonicalBucket(selectedItem.category)}
							>
								<span class="big-icon">{categoryIcons[selectedItem.category] || '✨'}</span>
								<span class="big-letter">{selectedItem.name.slice(0, 1).toUpperCase()}</span>
							</div>
						{/if}
					</div>

					<div class="dossier-meta-col">
						<div class="dossier-badges">
							<span class="item-cat">
								{categoryIcons[selectedItem.category] || '📌'}
								{categoryLabels[selectedItem.category] || selectedItem.category}
							</span>
							{#if dRole}
								<span class="role-badge">{formatEntryRoleLabel(dRole)}</span>
							{/if}
							{#if dFirstCh}
								<span class="debut-pill">🌟 {m.lib_debut_chapter()} {dFirstCh}</span>
							{/if}
							{#if selectedItem.terrain}
								<span class="terrain-pill">⛰️ {m.lib_terrain()} {selectedItem.terrain}</span>
							{/if}
						</div>

						<h2 class="dossier-title">{selectedItem.name}</h2>

						{#if dAliases.length > 0}
							<div class="dossier-aliases">
								<span class="alias-label">{m.lib_aliases_titles()}</span>
								<div class="alias-chips">
									{#each dAliases as alias}
										<span class="alias-chip">{alias}</span>
									{/each}
								</div>
							</div>
						{/if}

						<div class="dossier-quick-actions">
							{#if dFirstCh}
								<a href="/stories/{dFirstCh}" class="action-btn primary">
									📖 {m.lib_read_debut_chapter()} (Ch. {dFirstCh})
								</a>
							{/if}
							{#if selectedItem.story_link}
								<a href={selectedItem.story_link} class="action-btn secondary">
									{m.lib_go_to_linked_chapter()}
								</a>
							{/if}
							{#if selectedItem.has_3d_location || selectedItem.category === 'location'}
								<a href={selectedItem.world_target_url || `/world?focus=${selectedItem.id}`} class="action-btn world">
									{m.lib_locate_on_3d_map()}
								</a>
							{:else if selectedItem.category === 'character' || selectedItem.category === 'main_character' || selectedItem.category === 'side_character'}
								<a href={selectedItem.world_target_url || `/world/journey/${selectedItem.id}`} class="action-btn world">
									{m.lib_track_3d_journey()}
								</a>
							{/if}
						</div>
					</div>
				</div>

				<!-- Biography / Description Section -->
				<section class="dossier-section">
					<h3>{m.lib_world_lore_dossier_notes()}</h3>
					{#if dLocked}
						<div class="dossier-spoiler-box">
							<div class="spoiler-box-info">
								<strong>🔒 {m.lib_content_protected_by_spoiler_shield()}</strong>
								<p>
									{m.lib_this_entity_debuts_in()} <strong>{m.world_chapter()} {dFirstCh}</strong> ({m.lib_your_current_shield_cap_chapter()} {effectiveSpoilerChapter}).
								</p>
							</div>
							<button
								type="button"
								class="action-btn primary"
								onclick={() => unlockItemSpoiler(selectedItem!.id)}
							>
								{m.lib_unlock_full_dossier()}
							</button>
						</div>
					{:else if paragraphs.length > 0}
						<div class="dossier-prose">
							{#each paragraphs as p}
								<p>{p}</p>
							{/each}
						</div>
					{:else}
						<p class="muted-note">{m.lib_no_detailed_lore_description_available()}</p>
					{/if}
				</section>

				<!-- Connected Lore Graph (2-way Linked Entities) -->
				{#if dossierLoading}
					<div class="dossier-loading-row">
						<span class="spinner-sm"></span> {m.lib_loading_linked_entities_chapter_chronicle()}
					</div>
				{:else}
					{#if dossierLinkedItems.length > 0}
						<section class="dossier-section">
							<h3>🔗 {m.lib_connected_entities_network()} ({dossierLinkedItems.length})</h3>
							<div class="linked-entities-grid">
								{#each dossierLinkedItems as linked (linked.id)}
									<button
										type="button"
										class="linked-entity-card"
										onclick={() => openDossier(linked, true)}
									>
										{#if linked.image_url}
											<img
												src={linked.image_url}
												alt={linked.name}
												class="linked-avatar"
												loading="lazy"
											/>
										{:else}
											<div class="linked-avatar placeholder">
												{categoryIcons[linked.category] || '✨'}
											</div>
										{/if}
										<div class="linked-info">
											<span class="linked-cat">
												{categoryLabels[linked.category] || linked.category}
												{#if linked.link_role}
													· {formatEntryRoleLabel(linked.link_role)}
												{/if}
											</span>
											<strong>{linked.name}</strong>
											{#if linked.role}
												<span class="linked-role">{formatEntryRoleLabel(linked.role)}</span>
											{/if}
										</div>
										<span class="linked-arrow">→</span>
									</button>
								{/each}
							</div>
						</section>
					{/if}

					<!-- Chronicle Footprints: Published Chapters Appearing -->
					{#if dossierChapters.length > 0}
						<section class="dossier-section">
							<h3>📑 {m.lib_chronicle_footprints()} ({dossierChapters.length} {m.lib_chapters_appearing()})</h3>
							<div class="appearances-list">
								{#each dossierChapters as ch (ch.id)}
									{@const status = getChapterReadStatus(ch)}
									<div class="appearance-row">
										<div class="app-main">
											<span class="app-ch-num">Ch. {ch.chapter_number}</span>
											<div class="app-titles">
												<a href="/stories/{ch.chapter_number}" class="app-ch-title">
													{ch.title}
												</a>
												<div class="app-badges">
													{#if ch.is_debut}
														<span class="app-badge debut">{m.lib_debut()}</span>
													{:else if ch.entry_role && entryRoleLabels[ch.entry_role]}
														<span class="app-badge role">{entryRoleLabels[ch.entry_role]}</span>
													{/if}
													{#if status}
														<span class="app-badge read" class:done={status.completed}>
															{status.completed ? m.lib_completed() : `⏳ ${m.lib_reading()} ${status.percent}%`}
														</span>
													{/if}
												</div>
											</div>
										</div>

										<div class="app-actions">
											<a href="/stories/{ch.chapter_number}" class="app-btn read-text">
												{m.lib_read_prose()}
											</a>
											{#if ch.has_manga}
												<a
													href="/stories/{ch.chapter_number}?tab=manga"
													class="app-btn read-manga"
												>
													🎨 Manga
												</a>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/if}
				{/if}

				<!-- Entity Comments & Reader Theories -->
				<section class="dossier-section dossier-comments">
					{#key selectedItem.id}
						<CommentsSection commentableType="library" commentableId={selectedItem.id} />
					{/key}
				</section>
			</div>
		</div>
	</div>
{/if}

<!-- Fullscreen Image Lightbox -->
{#if lightboxImage}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="lightbox-overlay" onclick={() => (lightboxImage = null)}>
		<button type="button" class="lightbox-close" onclick={() => (lightboxImage = null)}>✕</button>
		<div class="lightbox-figure" onclick={(e) => e.stopPropagation()}>
			<img src={lightboxImage.url} alt={lightboxImage.title} />
			<span class="lightbox-caption">{lightboxImage.title}</span>
		</div>
	</div>
{/if}

<style>
	.lib-page {
		min-height: 75vh;
	}
	.lib-content {
		max-width: 1160px;
		margin: 0 auto;
		padding: 0 1.5rem 6rem;
	}

	/* ===== Hero ===== */
	.page-hero {
		position: relative;
		text-align: center;
		padding: 3.5rem 2rem 2.5rem;
		background: var(--color-surface-0);
		overflow: hidden;
		margin-bottom: 1.75rem;
	}
	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 780px;
		margin: 0 auto;
	}
	.codex-eyebrow {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: var(--color-brand-400);
		background: rgba(12, 113, 61, 0.14);
		border: 1px solid rgba(12, 113, 61, 0.35);
		padding: 0.28rem 0.85rem;
		border-radius: 999px;
		margin-bottom: 0.75rem;
	}
	.page-hero h1 {
		font-size: 2.5rem;
		font-weight: 800;
		color: var(--color-text-primary);
		margin: 0 0 0.4rem;
	}
	.hero-tagline {
		color: var(--color-text-muted);
		font-size: 1.02rem;
		margin: 0;
		font-weight: 400;
	}
	.hero-stats-row {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.4rem;
	}
	.stat-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.42rem 0.9rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 0.82rem;
		color: var(--color-text-secondary);
	}
	.stat-pill strong {
		color: var(--color-brand-300);
		font-size: 0.92rem;
	}
	.world-cta {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem 1.25rem;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--color-brand-500), #06b6d4);
		color: #fff;
		font-size: 0.86rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			transform 0.2s var(--ease-spring),
			filter 0.2s;
	}
	.world-cta:hover {
		transform: translateY(-2px);
		filter: brightness(1.1);
	}
	.hero-glow {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 80% 60% at 50% 30%, rgba(12, 113, 61, 0.15), transparent),
			radial-gradient(ellipse 60% 50% at 80% 50%, rgba(6, 182, 212, 0.08), transparent);
		pointer-events: none;
	}

	/* ===== Codex Toolbar ===== */
	.codex-toolbar {
		padding: 1.25rem;
		margin-bottom: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.toolbar-top {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.search-box {
		flex: 1 1 min(100%, 280px);
		position: relative;
		display: flex;
		align-items: center;
	}
	.search-icon {
		position: absolute;
		left: 0.9rem;
		font-size: 0.9rem;
		pointer-events: none;
		opacity: 0.7;
	}
	.search-input {
		width: 100%;
		padding: 0.65rem 2.2rem 0.65rem 2.4rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.88rem;
		font-family: inherit;
		transition: border-color 0.2s;
	}
	.search-input:focus {
		outline: none;
		border-color: var(--color-brand-500);
	}
	.clear-search-btn {
		position: absolute;
		right: 0.65rem;
		background: transparent;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.2rem 0.4rem;
	}
	.toolbar-controls {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.codex-select {
		padding: 0.62rem 0.9rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.84rem;
		font-family: inherit;
		cursor: pointer;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.filter-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.42rem 0.85rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.02);
		color: var(--color-text-muted);
		font-size: 0.82rem;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}
	.filter-btn:hover {
		border-color: var(--color-brand-500);
		color: var(--color-text-primary);
	}
	.filter-btn.active {
		background: rgba(12, 113, 61, 0.18);
		border-color: var(--color-brand-500);
		color: var(--color-brand-300);
		font-weight: 600;
	}
	.cat-count {
		font-size: 0.7rem;
		padding: 0.08rem 0.42rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-text-secondary);
	}

	/* ===== Spoiler Bar ===== */
	.spoiler-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		font-size: 0.8rem;
	}
	.spoiler-left {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.shield-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.32rem 0.75rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		cursor: pointer;
		font-family: inherit;
	}
	.shield-toggle.active {
		border-color: rgba(16, 185, 129, 0.45);
		background: rgba(16, 185, 129, 0.1);
		color: #6ee7b7;
	}
	.shield-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-text-muted);
	}
	.shield-toggle.active .shield-dot {
		background: #10b981;
		box-shadow: 0 0 8px #10b981;
	}
	.spoiler-cap-ctrl {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		color: var(--color-text-muted);
	}
	.cap-stepper {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: var(--color-surface-200);
		padding: 0.15rem 0.35rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.step-btn {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-text-primary);
		cursor: pointer;
		font-weight: 700;
		line-height: 1;
	}
	.step-btn:hover {
		background: var(--color-brand-500);
		color: #fff;
	}
	.cap-value {
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--color-text-primary);
		padding: 0 0.35rem;
	}
	.reset-cap-btn {
		background: transparent;
		border: none;
		color: var(--color-brand-400);
		font-size: 0.74rem;
		cursor: pointer;
		padding: 0 0.3rem;
	}
	.results-counter {
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.reset-filter-link {
		background: transparent;
		border: none;
		color: var(--color-brand-400);
		font-size: 0.78rem;
		cursor: pointer;
		text-decoration: underline;
		font-family: inherit;
	}

	/* ===== Cards Grid ===== */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 1.35rem;
	}
	.item-card {
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		cursor: pointer;
		transition:
			transform 0.22s var(--ease-spring),
			border-color 0.22s,
			box-shadow 0.22s;
	}
	.item-card:hover {
		transform: translateY(-4px);
		border-color: rgba(12, 113, 61, 0.55);
		box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.55);
	}
	.item-visual {
		position: relative;
		width: 100%;
		max-height: 250px;
		background: var(--color-surface-200);
		overflow: hidden;
	}
	.item-visual img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition:
			transform 0.35s var(--ease-spring),
			filter 0.25s;
	}
	.item-visual img.blurred-img {
		filter: blur(8px) brightness(0.75);
	}
	.item-card:hover .item-visual img:not(.blurred-img) {
		transform: scale(1.05);
	}
	.item-placeholder {
		width: 100%;
		height: 100%;
		min-height: 190px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: radial-gradient(
			circle at 30% 30%,
			rgba(12, 113, 61, 0.28),
			rgba(15, 23, 42, 0.92)
		);
		position: relative;
	}
	.item-placeholder[data-bucket='location'] {
		background: radial-gradient(
			circle at 30% 30%,
			rgba(6, 182, 212, 0.28),
			rgba(15, 23, 42, 0.92)
		);
	}
	.item-placeholder[data-bucket='item'] {
		background: radial-gradient(
			circle at 30% 30%,
			rgba(245, 158, 11, 0.26),
			rgba(15, 23, 42, 0.92)
		);
	}
	.item-placeholder[data-bucket='faction'] {
		background: radial-gradient(
			circle at 30% 30%,
			rgba(139, 92, 246, 0.28),
			rgba(15, 23, 42, 0.92)
		);
	}
	.placeholder-icon {
		font-size: 2.2rem;
		z-index: 1;
	}
	.placeholder-letter {
		position: absolute;
		font-size: 5.5rem;
		font-weight: 900;
		color: rgba(255, 255, 255, 0.05);
		user-select: none;
	}
	.visual-badges {
		position: absolute;
		top: 0.65rem;
		left: 0.65rem;
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		z-index: 2;
	}
	.item-cat {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #e2e8f0;
		padding: 0.2rem 0.55rem;
		background: rgba(15, 23, 42, 0.78);
		backdrop-filter: blur(6px);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
	}
	.badge-3d {
		font-size: 0.68rem;
		font-weight: 700;
		color: #67e8f9;
		padding: 0.2rem 0.5rem;
		background: rgba(8, 51, 68, 0.85);
		border: 1px solid rgba(6, 182, 212, 0.4);
		border-radius: 999px;
	}
	.debut-badge {
		position: absolute;
		bottom: 0.6rem;
		right: 0.6rem;
		font-size: 0.7rem;
		font-weight: 700;
		color: #fde68a;
		background: rgba(15, 23, 42, 0.82);
		border: 1px solid rgba(251, 191, 36, 0.35);
		padding: 0.18rem 0.55rem;
		border-radius: 999px;
		z-index: 2;
	}

	.item-body {
		padding: 1.15rem;
		display: flex;
		flex-direction: column;
		flex: 1;
	}
	.item-role {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-brand-400);
		margin-bottom: 0.2rem;
	}
	.item-body h3 {
		font-size: 1.06rem;
		font-weight: 700;
		margin: 0 0 0.4rem;
		color: var(--color-text-primary);
	}
	.alias-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-bottom: 0.55rem;
	}
	.alias-chip {
		font-size: 0.7rem;
		padding: 0.12rem 0.48rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: var(--color-text-secondary);
	}
	.alias-chip.more {
		color: var(--color-brand-300);
	}
	.item-desc {
		font-size: 0.82rem;
		color: var(--color-text-muted);
		line-height: 1.55;
		margin: 0 0 0.9rem;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
	}
	.item-desc.muted {
		font-style: italic;
		opacity: 0.65;
	}
	.spoiler-card-mask {
		background: rgba(15, 23, 42, 0.6);
		border: 1px dashed rgba(251, 191, 36, 0.35);
		border-radius: var(--radius-md);
		padding: 0.65rem;
		margin-bottom: 0.85rem;
		text-align: center;
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.4rem;
	}
	.spoiler-msg {
		font-size: 0.76rem;
		color: #fde68a;
		margin: 0;
	}
	.unlock-inline-btn {
		align-self: center;
		padding: 0.25rem 0.65rem;
		font-size: 0.74rem;
		border-radius: 999px;
		border: 1px solid rgba(251, 191, 36, 0.4);
		background: rgba(251, 191, 36, 0.12);
		color: #fde68a;
		cursor: pointer;
		font-family: inherit;
	}
	.unlock-inline-btn:hover {
		background: rgba(251, 191, 36, 0.22);
	}

	.item-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.65rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		font-size: 0.74rem;
	}
	.footer-metrics {
		display: flex;
		gap: 0.55rem;
		color: var(--color-text-muted);
	}
	.open-dossier-hint {
		color: var(--color-brand-400);
		font-weight: 600;
	}

	/* ===== Dossier Modal ===== */
	.dossier-overlay {
		position: fixed;
		inset: 0;
		z-index: 1100;
		background: rgba(3, 7, 18, 0.82);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: clamp(0.65rem, 2.5vw, 1.25rem);
	}
	.dossier-modal {
		width: 100%;
		max-width: 880px;
		max-height: calc(100dvh - 1.5rem);
		display: flex;
		flex-direction: column;
		padding: 0;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.14);
		box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8);
	}
	.dossier-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.85rem clamp(0.9rem, 3vw, 1.35rem);
		background: rgba(15, 23, 42, 0.85);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.dossier-kicker {
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--color-brand-400);
	}
	.back-history-btn {
		padding: 0.32rem 0.75rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: var(--color-text-primary);
		font-size: 0.78rem;
		cursor: pointer;
		font-family: inherit;
	}
	.back-history-btn:hover {
		border-color: var(--color-brand-400);
	}
	.topbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.share-link-btn {
		padding: 0.32rem 0.75rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: var(--color-text-secondary);
		font-size: 0.76rem;
		cursor: pointer;
		font-family: inherit;
	}
	.close-dossier-btn {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.05);
		color: var(--color-text-primary);
		cursor: pointer;
		font-size: 0.95rem;
	}
	.dossier-scroll-body {
		padding: clamp(1rem, 3vw, 1.5rem);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.dossier-hero {
		display: grid;
		grid-template-columns: 220px 1fr;
		gap: 1.5rem;
		align-items: start;
	}
	.portrait-frame {
		position: relative;
		width: 100%;
		aspect-ratio: 3 / 4;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-200);
		padding: 0;
		cursor: zoom-in;
	}
	.portrait-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.zoom-hint {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
	}
	.portrait-placeholder {
		width: 100%;
		aspect-ratio: 3 / 4;
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: radial-gradient(
			circle at 30% 30%,
			rgba(12, 113, 61, 0.35),
			rgba(15, 23, 42, 0.95)
		);
		border: 1px solid rgba(255, 255, 255, 0.1);
		position: relative;
	}
	.big-icon {
		font-size: 3rem;
		z-index: 1;
	}
	.big-letter {
		position: absolute;
		font-size: 6.5rem;
		font-weight: 900;
		color: rgba(255, 255, 255, 0.05);
	}
	.dossier-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-bottom: 0.65rem;
	}
	.role-badge {
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: rgba(12, 113, 61, 0.18);
		color: var(--color-brand-300);
		border: 1px solid rgba(12, 113, 61, 0.4);
	}
	.debut-pill {
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: rgba(251, 191, 36, 0.14);
		color: #fde68a;
		border: 1px solid rgba(251, 191, 36, 0.35);
	}
	.terrain-pill {
		font-size: 0.72rem;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		background: rgba(6, 182, 212, 0.14);
		color: #67e8f9;
	}
	.dossier-title {
		font-size: 1.75rem;
		font-weight: 800;
		margin: 0 0 0.75rem;
		color: var(--color-text-primary);
	}
	.dossier-aliases {
		margin-bottom: 1rem;
	}
	.alias-label {
		display: block;
		font-size: 0.76rem;
		color: var(--color-text-muted);
		margin-bottom: 0.35rem;
	}
	.dossier-quick-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1rem;
	}
	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem 1rem;
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
		font-family: inherit;
	}
	.action-btn.primary {
		background: var(--color-brand-500);
		color: #fff;
	}
	.action-btn.secondary {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.14);
		color: var(--color-text-primary);
	}
	.action-btn.world {
		background: linear-gradient(135deg, #0891b2, #2563eb);
		color: #fff;
	}

	.dossier-section {
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 1.25rem;
	}
	.dossier-section h3 {
		font-size: 1.02rem;
		font-weight: 700;
		margin: 0 0 0.85rem;
		color: var(--color-text-primary);
	}
	.dossier-prose p {
		font-size: 0.94rem;
		line-height: 1.75;
		color: var(--color-text-secondary);
		margin: 0 0 0.85rem;
	}
	.dossier-spoiler-box {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1.1rem;
		border-radius: var(--radius-md);
		background: rgba(251, 191, 36, 0.08);
		border: 1px dashed rgba(251, 191, 36, 0.4);
	}
	.spoiler-box-info strong {
		color: #fde68a;
		display: block;
		margin-bottom: 0.25rem;
	}
	.spoiler-box-info p {
		margin: 0;
		font-size: 0.84rem;
		color: var(--color-text-secondary);
	}

	/* Linked Entities Grid */
	.linked-entities-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.75rem;
	}
	.linked-entity-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.85rem;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: var(--color-text-primary);
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		transition:
			border-color 0.2s,
			background 0.2s;
	}
	.linked-entity-card:hover {
		border-color: var(--color-brand-400);
		background: rgba(12, 113, 61, 0.12);
	}
	.linked-avatar {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--color-surface-300);
	}
	.linked-avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
	}
	.linked-info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}
	.linked-cat {
		font-size: 0.68rem;
		color: var(--color-text-muted);
	}
	.linked-info strong {
		font-size: 0.88rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.linked-role {
		font-size: 0.72rem;
		color: var(--color-brand-300);
	}
	.linked-arrow {
		color: var(--color-text-muted);
		font-weight: 700;
	}

	/* Appearances List */
	.appearances-list {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.appearance-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.7rem 0.95rem;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.07);
	}
	.app-main {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.app-ch-num {
		font-size: 0.78rem;
		font-weight: 700;
		padding: 0.25rem 0.6rem;
		border-radius: var(--radius-sm);
		background: rgba(12, 113, 61, 0.2);
		color: var(--color-brand-300);
	}
	.app-titles {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.app-ch-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-primary);
		text-decoration: none;
	}
	.app-ch-title:hover {
		color: var(--color-brand-400);
	}
	.app-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.app-badge {
		font-size: 0.68rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
	}
	.app-badge.debut {
		background: rgba(251, 191, 36, 0.15);
		color: #fde68a;
	}
	.app-badge.role {
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text-secondary);
	}
	.app-badge.read {
		background: rgba(56, 189, 248, 0.14);
		color: #7dd3fc;
	}
	.app-badge.read.done {
		background: rgba(16, 185, 129, 0.16);
		color: #6ee7b7;
	}
	.app-actions {
		display: flex;
		gap: 0.45rem;
	}
	.app-btn {
		font-size: 0.76rem;
		font-weight: 600;
		padding: 0.32rem 0.7rem;
		border-radius: 999px;
		text-decoration: none;
	}
	.app-btn.read-text {
		background: rgba(255, 255, 255, 0.07);
		color: var(--color-text-primary);
	}
	.app-btn.read-manga {
		background: rgba(139, 92, 246, 0.2);
		color: #c4b5fd;
		border: 1px solid rgba(139, 92, 246, 0.35);
	}

	/* Lightbox */
	.lightbox-overlay {
		position: fixed;
		inset: 0;
		z-index: 1200;
		background: rgba(0, 0, 0, 0.92);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}
	.lightbox-close {
		position: fixed;
		top: 1.25rem;
		right: 1.25rem;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		font-size: 1.1rem;
		cursor: pointer;
	}
	.lightbox-figure {
		margin: 0;
		max-width: 90vw;
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}
	.lightbox-figure img {
		max-width: 100%;
		max-height: 80vh;
		object-fit: contain;
		border-radius: var(--radius-md);
	}
	.lightbox-caption {
		color: var(--color-text-secondary);
		font-size: 0.92rem;
	}

	.skel {
		aspect-ratio: 3 / 4;
		background: linear-gradient(
			90deg,
			var(--color-surface-200) 25%,
			var(--color-surface-300) 50%,
			var(--color-surface-200) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: var(--radius-lg);
	}
	.empty {
		text-align: center;
		padding: 4rem 1.5rem;
		color: var(--color-text-muted);
	}
	.empty span {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.75rem;
	}
	.empty h3 {
		font-size: 1.1rem;
		color: var(--color-text-secondary);
		margin: 0 0 1rem;
	}
	.btn-reset-empty {
		padding: 0.5rem 1.1rem;
		border-radius: 999px;
		border: 1px solid var(--color-brand-500);
		background: rgba(12, 113, 61, 0.15);
		color: var(--color-brand-300);
		cursor: pointer;
		font-family: inherit;
	}

	@media (max-width: 680px) {
		.dossier-hero {
			grid-template-columns: 1fr;
		}
		.portrait-frame,
		.portrait-placeholder {
			max-width: 220px;
			margin: 0 auto;
		}
	}
</style>
