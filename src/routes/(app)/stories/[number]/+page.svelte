<script lang="ts">
	import { api } from '$lib/api';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isAuthenticated } from '$lib/stores/auth.svelte';
	import * as m from '$lib/paraglide/messages';
	import CommentsSection from '$lib/components/ui/CommentsSection.svelte';
	import StoryContent from '$lib/components/story/StoryContent.svelte';
	import MangaReader from '$lib/components/story/MangaReader.svelte';
	import { extractMangaConfig } from '$lib/story/manga-blocks';
	import { quickToggleReaderMusic, getIsPlaying, getCurrentTrack } from '$lib/stores/audio.svelte';
	import { dateLocale, formatCategoryLabel, formatEntryRoleLabel } from '$lib/i18n-labels';

	const LOCAL_PROGRESS_KEY = 'selorson_reading_progress';
	const PALATINO_FONT = "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif";

	let chapter = $state<any>(null);
	let chapterStats = $state<{ word_count?: number; reading_time_min?: number }>({});
	let translationFallback = $state(false);
	let prevCh = $state<number | null>(null);
	let nextCh = $state<number | null>(null);
	let libraryTags = $state<any[]>([]);
	let linkedChapters = $state<any[]>([]);
	let selectedLoreItem = $state<any | null>(null);
	let readerTab = $state<'prose' | 'manga'>('prose');
	let requestedEdition = $derived<'color' | 'bw' | undefined>(
		page.url.searchParams.get('edition') === 'bw'
			? 'bw'
			: page.url.searchParams.get('edition') === 'color'
				? 'color'
				: undefined
	);
	let loading = $state(true);
	let error = $state('');
	let scrollProgress = $state(0);
	let initialSavedPosition = $state(0);
	let resumeBannerPercent = $state<number | null>(null);
	let articleBodyEl = $state<HTMLElement | null>(null);

	// Quick TOC Drawer & Quick Lore Drawer states
	let showTocDrawer = $state(false);
	let tocChapters = $state<any[]>([]);
	let tocLoading = $state(false);
	let tocSearch = $state('');
	let tocOnlyManga = $state(false);
	let tocSortDesc = $state(false);
	let tocProgressMap = $state<Record<number, number>>({});
	let showLoreDrawer = $state(false);

	let mangaConfig = $derived(chapter ? extractMangaConfig(chapter.content_blocks) : null);
	let hasPublishedManga = $derived(
		Boolean(
			mangaConfig &&
				mangaConfig.manga_status === 'published' &&
				(mangaConfig.pages.length > 0 ||
					mangaConfig.color_pages.length > 0 ||
					mangaConfig.bw_pages.length > 0)
		)
	);

	// Reader settings (persisted in localStorage + synced to /stories/settings when logged in)
	let fontSize = $state(18);
	let lineHeight = $state(1.8);
	let maxWidth = $state(720);
	let fontFamily = $state(PALATINO_FONT);
	let theme = $state('default');
	let enableLoreHighlight = $state(true);
	let showSettings = $state(false);
	let settingsLoaded = $state(false);
	let settingsSyncTimer: ReturnType<typeof setTimeout> | null = null;

	// ─── Smart Auto-Read & Focus Pacing Engine ───
	let autoScrolling = $state(false);
	let autoReadPaused = $state(false);
	let autoReadMode = $state<'paragraph' | 'glide'>('paragraph');
	let autoReadWpm = $state(210); // Words per minute for Paragraph Spotlight mode
	let glideSpeedPxPerSec = $state(24); // Pixels per second for Smooth Glide mode
	let spotlightDimInactive = $state(true);
	let activeBlockIndex = $state<number | null>(null);
	let spotlightProgress = $state(0);
	let showAutoReadPanel = $state(false);

	let rafId: number | null = null;
	let lastFrameTime = 0;
	let stepElapsedMs = 0;
	let stepDurationMs = 3000;
	let glideSubpixelCarry = 0;
	let programmaticScrollUntil = 0;

	// Progress save debounce
	let saveProgressTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSentPosition = -1;

	let fontOptions = $derived([
		{ value: PALATINO_FONT, label: m.reader_book_print_palatino() },
		{ value: "Cambria, 'Palatino Linotype', 'Times New Roman', serif", label: m.reader_clear_serif_cambria() },
		{ value: 'Georgia, serif', label: 'Georgia (Serif)' },
		{ value: 'Inter', label: 'Inter (Sans)' },
		{ value: 'Merriweather, serif', label: 'Merriweather' },
		{ value: 'Lora, serif', label: 'Lora' },
		{ value: "'Times New Roman', Times, serif", label: m.reader_classic_times_new_roman() },
		{ value: '"Roboto Mono", monospace', label: 'Roboto Mono' },
		{ value: '"Cinzel Decorative", serif', label: 'Cinzel Decorative' },
		{ value: '"Uncial Antiqua", cursive', label: 'Uncial Antiqua' },
		{ value: '"Metamorphous", serif', label: 'Metamorphous' },
		{ value: '"IM Fell English", serif', label: 'IM Fell English' }
	]);

	let categoryLabels = $derived<Record<string, string>>({
		character: m.reader_character(),
		location: m.reader_location(),
		faction: m.reader_faction(),
		item: m.reader_item(),
		creature: m.reader_creature(),
		magic: m.reader_magic(),
		event: m.reader_event(),
		concept: m.reader_concept()
	});

	let themes = $derived([
		{ id: 'default', name: m.reader_theme_default(), bg: 'transparent', color: 'inherit', preview: '#1e293b', previewText: '#c8d6e5' },
		{ id: 'cowriter-dark', name: m.reader_soft_dark_co_writer(), bg: '#121e20', color: '#f3f1e4', preview: '#121e20', previewText: '#f3f1e4' },
		{ id: 'sepia', name: m.reader_theme_sepia(), bg: '#f5e6c8', color: '#5b4636', preview: '#f5e6c8', previewText: '#5b4636' },
		{ id: 'mint', name: m.reader_theme_mint(), bg: '#e8f5e9', color: '#2e5a3a', preview: '#e8f5e9', previewText: '#2e5a3a' },
		{ id: 'sky', name: m.reader_theme_sky(), bg: '#e3f2fd', color: '#1a3a5c', preview: '#e3f2fd', previewText: '#1a3a5c' },
		{ id: 'lavender', name: m.reader_theme_lavender(), bg: '#f3e5f5', color: '#4a2560', preview: '#f3e5f5', previewText: '#4a2560' },
		{ id: 'night', name: m.reader_theme_night(), bg: '#0f0f1a', color: '#b8c0d0', preview: '#0f0f1a', previewText: '#b8c0d0' },
		{ id: 'classic', name: m.reader_theme_classic(), bg: '#2a1f0e', color: '#f5e6c8', preview: '#2a1f0e', previewText: '#c8a84b' }
	]);

	let wpmOptions = $derived([
		{ value: 160, label: m.reader_relaxed_160_wpm() },
		{ value: 210, label: m.reader_natural_210_wpm() },
		{ value: 270, label: m.reader_fast_270_wpm() },
		{ value: 340, label: m.reader_speed_340_wpm() }
	]);

	let glideSpeedOptions = $derived([
		{ value: 16, label: m.reader_gentle_16_px_s() },
		{ value: 24, label: m.reader_balanced_24_px_s() },
		{ value: 34, label: m.reader_fast_34_px_s() },
		{ value: 46, label: m.reader_very_fast_46_px_s() }
	]);

	function readLocalProgressMap(): Record<string, any> {
		if (typeof localStorage === 'undefined') return {};
		try {
			const raw = localStorage.getItem(LOCAL_PROGRESS_KEY);
			return raw ? JSON.parse(raw) || {} : {};
		} catch {
			return {};
		}
	}

	function writeLocalProgress(ch: any, position: number) {
		if (typeof localStorage === 'undefined' || !ch) return;
		try {
			const map = readLocalProgressMap();
			const clamped = Math.max(0, Math.min(100, Math.round(position)));
			const key = String(ch.chapter_number || ch.id);
			const prev = map[key];
			// Không ghi đè về 0 nếu trước đó đã có tiến độ
			if (clamped === 0 && prev && Number(prev.last_position) > 0) return;

			map[key] = {
				chapter_id: ch.id,
				chapter_number: ch.chapter_number,
				chapter_title: ch.title,
				mode: readerTab === 'manga' ? 'manga' : 'text',
				has_manga: hasPublishedManga,
				last_position: clamped,
				is_completed: clamped >= 95,
				updated_at: new Date().toISOString()
			};
			localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map));
			tocProgressMap = { ...tocProgressMap, [ch.chapter_number]: clamped };
		} catch {}
	}

	function getSavedPositionForChapter(ch: any, serverProgress: any): number {
		const serverPos = Number(serverProgress?.last_position ?? 0);
		const map = readLocalProgressMap();
		const localEntry =
			map[String(ch?.chapter_number)] ||
			Object.values(map).find((it: any) => Number(it?.chapter_id) === Number(ch?.id));
		const localPos = Number(localEntry?.last_position ?? 0);
		return Math.max(serverPos, localPos);
	}

	onMount(() => {
		const saved = localStorage.getItem('selorson_reader');
		if (saved) {
			try {
				const s = JSON.parse(saved);
				fontSize = s.fontSize || 18;
				lineHeight = s.lineHeight || 1.8;
				maxWidth = s.maxWidth || 720;
				fontFamily = s.fontFamily || PALATINO_FONT;
				theme = s.theme || 'default';
				if (typeof s.enableLoreHighlight === 'boolean') enableLoreHighlight = s.enableLoreHighlight;
				if (s.autoReadMode === 'paragraph' || s.autoReadMode === 'glide') autoReadMode = s.autoReadMode;
				if (s.autoReadWpm) autoReadWpm = s.autoReadWpm;
				if (s.glideSpeedPxPerSec) glideSpeedPxPerSec = s.glideSpeedPxPerSec;
				if (typeof s.spotlightDimInactive === 'boolean') spotlightDimInactive = s.spotlightDimInactive;
			} catch {}
		}
		settingsLoaded = true;

		if (isAuthenticated()) {
			api<any>('/stories/settings')
				.then((res) => {
					const rs = res?.data;
					if (rs && typeof rs === 'object' && !localStorage.getItem('selorson_reader')) {
						if (rs.fontSize) fontSize = rs.fontSize;
						if (rs.lineHeight) lineHeight = rs.lineHeight;
						if (rs.maxWidth) maxWidth = rs.maxWidth;
						if (rs.fontFamily) fontFamily = rs.fontFamily;
						if (rs.theme) theme = rs.theme;
					}
				})
				.catch(() => {});
		}

		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('wheel', handleUserWheel, { passive: true });
		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('wheel', handleUserWheel);
			stopAutoScroll();
			if (saveProgressTimer) clearTimeout(saveProgressTimer);
			if (settingsSyncTimer) clearTimeout(settingsSyncTimer);
		};
	});

	let lastLoadedNumber = $state<string | null>(null);
	$effect(() => {
		const num = page.params.number;
		if (num && num !== lastLoadedNumber) {
			lastLoadedNumber = num;
			stopAutoScroll();
			loadChapter(num);
		}
	});

	async function loadChapter(numParam?: string) {
		if (saveProgressTimer) {
			clearTimeout(saveProgressTimer);
			saveProgressTimer = null;
		}
		loading = true;
		error = '';
		translationFallback = false;
		resumeBannerPercent = null;
		initialSavedPosition = 0;
		lastSentPosition = -1;
		readerTab =
			page.url.searchParams.get('tab') === 'manga' ||
			page.url.searchParams.get('mode') === 'manga'
				? 'manga'
				: 'prose';
		selectedLoreItem = null;
		showTocDrawer = false;
		showLoreDrawer = false;

		try {
			const num = numParam ?? page.params.number;
			const res = await api<any>(`/chapters/${num}`);
			if (!res?.success || !res?.data?.chapter) {
				error = m.reader_not_found();
				loading = false;
				return;
			}
			chapter = res.data.chapter;
			chapterStats = res.data.chapter_stats || {};
			translationFallback = Boolean(res.data.translation_fallback);
			prevCh = res.data.prev_chapter;
			nextCh = res.data.next_chapter;
			libraryTags = Array.isArray(res.data.library_tags) ? res.data.library_tags : [];
			linkedChapters = Array.isArray(res.data.linked_chapters) ? res.data.linked_chapters : [];
			const loadedManga = extractMangaConfig(chapter.content_blocks);
			const loadedHasPublishedManga = Boolean(
				loadedManga &&
					loadedManga.manga_status === 'published' &&
					(loadedManga.pages.length > 0 ||
						loadedManga.color_pages.length > 0 ||
						loadedManga.bw_pages.length > 0)
			);
			if (!loadedHasPublishedManga) {
				readerTab = 'prose';
			} else if (page.url.searchParams.get('tab') === 'manga') {
				readerTab = 'manga';
			}

			const savedPos = getSavedPositionForChapter(chapter, res.data.user_progress);
			initialSavedPosition = savedPos;

			if (savedPos === 0 && isAuthenticated() && chapter) {
				saveProgressToServer(chapter.id, 0, false);
			}
		} catch {
			error = m.reader_not_found();
		}
		loading = false;

		await tick();
		if (chapter && readerTab === 'prose' && initialSavedPosition > 5 && initialSavedPosition < 98) {
			setTimeout(() => {
				scrollToSavedPercentage(initialSavedPosition);
				resumeBannerPercent = initialSavedPosition;
			}, 140);
		} else if (chapter && readerTab === 'prose') {
			window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
		}
	}

	function scrollToSavedPercentage(pct: number) {
		if (typeof window === 'undefined') return;
		programmaticScrollUntil = performance.now() + 700;
		if (articleBodyEl) {
			const rect = articleBodyEl.getBoundingClientRect();
			const articleTop = window.scrollY + rect.top;
			const scrollableArticle = Math.max(0, articleBodyEl.offsetHeight - window.innerHeight * 0.65);
			const targetY = articleTop + (scrollableArticle * pct) / 100;
			window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
		} else {
			const h = document.documentElement;
			const total = h.scrollHeight - h.clientHeight;
			if (total > 0) {
				window.scrollTo({ top: (total * pct) / 100, behavior: 'smooth' });
			}
		}
		scrollProgress = pct;
	}

	async function restartFromBeginning() {
		resumeBannerPercent = null;
		initialSavedPosition = 0;
		scrollProgress = 0;
		programmaticScrollUntil = performance.now() + 600;
		window.scrollTo({ top: 0, behavior: 'smooth' });
		if (chapter) {
			if (typeof localStorage !== 'undefined') {
				const map = readLocalProgressMap();
				delete map[String(chapter.chapter_number)];
				localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map));
			}
			if (isAuthenticated()) {
				await saveProgressToServer(chapter.id, 0, true);
			}
		}
	}

	async function saveProgressToServer(chapterId: number, position: number, forceReset = false) {
		if (!isAuthenticated()) return;
		try {
			await api(`/chapters/${chapterId}/progress`, {
				method: 'POST',
				body: { position: Math.max(0, Math.min(100, Math.round(position))), force_reset: forceReset }
			});
		} catch {}
	}

	function scheduleSaveProgress(position: number) {
		if (!chapter) return;
		const targetChapterId = Number(chapter.id);
		const clamped = Math.max(0, Math.min(100, Math.round(position)));
		writeLocalProgress(chapter, clamped);

		if (!isAuthenticated() || !targetChapterId) return;
		if (Math.abs(clamped - lastSentPosition) < 2 && clamped < 95) return;

		if (saveProgressTimer) clearTimeout(saveProgressTimer);
		saveProgressTimer = setTimeout(() => {
			if (!chapter || Number(chapter.id) !== targetChapterId) return;
			lastSentPosition = clamped;
			saveProgressToServer(targetChapterId, clamped, false);
		}, 950);
	}

	function handleMangaProgress(pct: number) {
		scrollProgress = pct;
		scheduleSaveProgress(pct);
	}

	function handleScroll() {
		if (!chapter || loading) return;
		let pct = 0;
		if (readerTab === 'prose' && articleBodyEl) {
			const rect = articleBodyEl.getBoundingClientRect();
			const articleTop = window.scrollY + rect.top;
			const totalArticleScroll = Math.max(1, articleBodyEl.offsetHeight - window.innerHeight * 0.6);
			const currentOffset = window.scrollY - articleTop;
			pct = Math.round((currentOffset / totalArticleScroll) * 100);
		} else {
			const h = document.documentElement;
			const total = h.scrollHeight - h.clientHeight;
			pct = total > 0 ? Math.round((h.scrollTop / total) * 100) : 0;
		}
		pct = Math.max(0, Math.min(100, pct));
		if (pct >= 95) pct = 100;
		scrollProgress = pct;

		if (pct > 0) {
			scheduleSaveProgress(pct);
		}
	}

	function saveSettings() {
		if (!settingsLoaded || typeof localStorage === 'undefined') return;
		const payload = {
			fontSize,
			lineHeight,
			maxWidth,
			fontFamily,
			theme,
			enableLoreHighlight,
			autoReadMode,
			autoReadWpm,
			glideSpeedPxPerSec,
			spotlightDimInactive
		};
		localStorage.setItem('selorson_reader', JSON.stringify(payload));

		if (isAuthenticated()) {
			if (settingsSyncTimer) clearTimeout(settingsSyncTimer);
			settingsSyncTimer = setTimeout(() => {
				api('/stories/settings', { method: 'PUT', body: { settings: payload } }).catch(() => {});
			}, 1200);
		}
	}

	$effect(() => {
		fontSize;
		lineHeight;
		maxWidth;
		fontFamily;
		theme;
		enableLoreHighlight;
		autoReadMode;
		autoReadWpm;
		glideSpeedPxPerSec;
		spotlightDimInactive;
		saveSettings();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// SMART AUTO-READ ENGINE (Chế độ Nhịp Đoạn Văn Spotlight + Trôi Lụa 60/120fps)
	// ═══════════════════════════════════════════════════════════════════════════

	function getStepElements(): HTMLElement[] {
		if (!articleBodyEl) return [];
		return Array.from(articleBodyEl.querySelectorAll<HTMLElement>('[data-step-index]'));
	}

	function findBlockClosestToGoldenEye(): number {
		const els = getStepElements();
		if (els.length === 0) return 0;
		const goldenY = window.innerHeight * 0.34;
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < els.length; i++) {
			const rect = els[i].getBoundingClientRect();
			const center = rect.top + Math.min(rect.height * 0.4, 80);
			const dist = Math.abs(center - goldenY);
			if (dist < bestDist) {
				bestDist = dist;
				bestIdx = i;
			}
		}
		return bestIdx;
	}

	function computeStepDurationMs(idx: number): number {
		const els = getStepElements();
		const el = els[idx];
		if (!el) return 3000;
		const words = Math.max(1, Number(el.getAttribute('data-word-count') || 18));
		if (el.tagName.toLowerCase() === 'figure') {
			return 3600;
		}
		// Thời gian đọc dựa theo số từ + 650ms nhịp thở tự nhiên giữa hai đoạn
		const rawMs = (words / Math.max(100, autoReadWpm)) * 60000 + 650;
		return Math.max(1800, Math.min(18000, Math.round(rawMs)));
	}

	function scrollBlockIntoGoldenEye(idx: number) {
		const els = getStepElements();
		const el = els[idx];
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const goldenTop = window.innerHeight * 0.3;
		const targetScrollY = window.scrollY + rect.top - goldenTop;
		programmaticScrollUntil = performance.now() + 550;
		window.scrollTo({
			top: Math.max(0, targetScrollY),
			behavior: 'smooth'
		});
	}

	function activateSpotlightBlock(idx: number) {
		const els = getStepElements();
		if (els.length === 0) {
			autoReadMode = 'glide';
			return;
		}
		const clamped = Math.max(0, Math.min(els.length - 1, idx));
		activeBlockIndex = clamped;
		stepElapsedMs = 0;
		spotlightProgress = 0;
		stepDurationMs = computeStepDurationMs(clamped);
		scrollBlockIntoGoldenEye(clamped);
	}

	function toggleAutoScroll() {
		if (autoScrolling) {
			stopAutoScroll();
		} else {
			startAutoScroll();
		}
	}

	function togglePauseAutoRead() {
		if (!autoScrolling) return;
		autoReadPaused = !autoReadPaused;
		lastFrameTime = performance.now();
	}

	function pauseAutoReadIfActive() {
		if (autoScrolling && !autoReadPaused) {
			autoReadPaused = true;
		}
	}

	function startAutoScroll() {
		stopAutoScroll();
		autoScrolling = true;
		autoReadPaused = false;
		showAutoReadPanel = true;
		glideSubpixelCarry = 0;

		if (autoReadMode === 'paragraph') {
			const startIdx = findBlockClosestToGoldenEye();
			activateSpotlightBlock(startIdx);
		} else {
			activeBlockIndex = null;
		}

		lastFrameTime = performance.now();
		rafId = requestAnimationFrame(autoReadTick);
	}

	function autoReadTick(now: number) {
		if (!autoScrolling) return;
		const dt = Math.min(100, Math.max(0, now - lastFrameTime));
		lastFrameTime = now;

		if (!autoReadPaused && !selectedLoreItem && !showTocDrawer && !showLoreDrawer) {
			if (autoReadMode === 'paragraph') {
				const els = getStepElements();
				if (els.length === 0) {
					autoReadMode = 'glide';
				} else {
					if (activeBlockIndex === null) {
						activateSpotlightBlock(findBlockClosestToGoldenEye());
					} else {
						stepElapsedMs += dt;
						spotlightProgress = Math.min(100, (stepElapsedMs / stepDurationMs) * 100);
						if (stepElapsedMs >= stepDurationMs) {
							if (activeBlockIndex + 1 < els.length) {
								activateSpotlightBlock(activeBlockIndex + 1);
							} else {
								stopAutoScroll();
								return;
							}
						}
					}
				}
			} else {
				// Chế độ Trôi Lụa (Sub-pixel Smooth Glide 60/120fps)
				activeBlockIndex = null;
				const deltaPx = (glideSpeedPxPerSec * dt) / 1000 + glideSubpixelCarry;
				const wholePx = Math.trunc(deltaPx);
				glideSubpixelCarry = deltaPx - wholePx;

				if (wholePx !== 0) {
					window.scrollBy(0, wholePx);
				}

				if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
					stopAutoScroll();
					return;
				}
			}
		}

		rafId = requestAnimationFrame(autoReadTick);
	}

	function switchAutoReadMode(nextMode: 'paragraph' | 'glide') {
		autoReadMode = nextMode;
		if (autoScrolling) {
			if (nextMode === 'paragraph') {
				activateSpotlightBlock(findBlockClosestToGoldenEye());
			} else {
				activeBlockIndex = null;
				spotlightProgress = 0;
			}
		}
	}

	function stepSpotlight(delta: number) {
		if (!autoScrolling || autoReadMode !== 'paragraph') return;
		const current = activeBlockIndex ?? findBlockClosestToGoldenEye();
		activateSpotlightBlock(current + delta);
	}

	function stopAutoScroll() {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		autoScrolling = false;
		autoReadPaused = false;
		activeBlockIndex = null;
		spotlightProgress = 0;
		showAutoReadPanel = false;
	}

	function handleUserWheel(e: WheelEvent) {
		if (!autoScrolling || autoReadPaused) return;
		if (performance.now() < programmaticScrollUntil) return;
		// Khi độc giả chủ động lăn chuột ngược lên để đọc lại câu trên -> tự động tạm dừng
		if (e.deltaY < -18) {
			autoReadPaused = true;
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// QUICK TOC DRAWER & KEYBOARD SHORTCUTS
	// ═══════════════════════════════════════════════════════════════════════════

	async function openTocDrawer() {
		pauseAutoReadIfActive();
		showTocDrawer = true;
		const localMap = readLocalProgressMap();
		const byNum: Record<number, number> = { ...tocProgressMap };
		for (const item of Object.values(localMap) as any[]) {
			if (item?.chapter_number) {
				byNum[Number(item.chapter_number)] = Number(item.last_position || 0);
			}
		}
		tocProgressMap = byNum;

		if (tocChapters.length === 0) {
			tocLoading = true;
			try {
				const [chRes, progRes] = await Promise.all([
					api<any>('/chapters?page=1&per_page=200&sort=asc'),
					isAuthenticated() ? api<any>('/stories/progress').catch(() => null) : Promise.resolve(null)
				]);
				if (Array.isArray(chRes?.data)) {
					tocChapters = chRes.data;
				}
				if (Array.isArray(progRes?.data)) {
					const merged = { ...tocProgressMap };
					for (const p of progRes.data) {
						if (p.chapter_number) {
							merged[Number(p.chapter_number)] = Math.max(
								merged[Number(p.chapter_number)] || 0,
								Number(p.last_position || 0)
							);
						}
					}
					tocProgressMap = merged;
				}
			} catch {}
			tocLoading = false;
		}

		await tick();
		const activeEl = document.getElementById(`toc-ch-${chapter?.chapter_number}`);
		if (activeEl) {
			activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	let filteredTocChapters = $derived.by(() => {
		const q = tocSearch.trim().toLowerCase();
		let list = tocChapters.filter((c) => {
			if (tocOnlyManga && !c.has_manga) return false;
			if (!q) return true;
			return (
				String(c.chapter_number) === q ||
				`chương ${c.chapter_number}`.includes(q) ||
				`chapter ${c.chapter_number}`.includes(q) ||
				`ch. ${c.chapter_number}`.includes(q) ||
				c.title?.toLowerCase().includes(q)
			);
		});
		if (tocSortDesc) {
			list = [...list].sort((a, b) => b.chapter_number - a.chapter_number);
		}
		return list;
	});

	function handleWindowKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
			if (e.key === 'Escape') {
				(target as HTMLElement).blur();
			}
			return;
		}

		if (e.key === 'Escape') {
			if (selectedLoreItem) {
				selectedLoreItem = null;
				return;
			}
			if (showTocDrawer) {
				showTocDrawer = false;
				return;
			}
			if (showLoreDrawer) {
				showLoreDrawer = false;
				return;
			}
			if (showSettings) {
				showSettings = false;
				return;
			}
			if (autoScrolling) {
				stopAutoScroll();
				return;
			}
		}

		if (e.key === 'm' || e.key === 'M') {
			e.preventDefault();
			if (showTocDrawer) showTocDrawer = false;
			else openTocDrawer();
			return;
		}

		if (autoScrolling && e.key === ' ') {
			e.preventDefault();
			togglePauseAutoRead();
			return;
		}

		if (autoScrolling && autoReadMode === 'paragraph') {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				stepSpotlight(1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				stepSpotlight(-1);
				return;
			}
		}

		// Phím ← / → chuyển chương khi đang đọc Truyện chữ (không xung đột với lật trang Manga)
		if (readerTab === 'prose' && !selectedLoreItem && !showTocDrawer) {
			if (e.key === 'ArrowLeft' && prevCh) {
				e.preventDefault();
				goto(`/stories/${prevCh}`);
			} else if (e.key === 'ArrowRight' && nextCh) {
				e.preventDefault();
				goto(`/stories/${nextCh}`);
			}
		}
	}

	function getThemeStyle() {
		const t = themes.find((th) => th.id === theme);
		if (!t || t.id === 'default') return '';

		let borderStyle = '1px solid rgba(0,0,0,.06)';
		if (t.id === 'night') borderStyle = '1px solid rgba(255,255,255,.06)';
		if (t.id === 'classic') borderStyle = '1px solid rgba(200,168,75,.3)';

		return `background:${t.bg};color:${t.color};border-radius:1rem;padding:clamp(1.1rem, 4vw, 2.5rem) clamp(1rem, 4.5vw, 2.5rem);border:${borderStyle};`;
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<svelte:head>
	<title>{chapter ? `Ch. ${chapter.chapter_number}: ${chapter.title}` : m.reader_loading()} — Selorson</title>
	{#if chapter}
		<meta name="description" content="{chapter.title} — Selorson Stories" />
	{/if}
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Merriweather:wght@400;700&display=swap" rel="stylesheet" />
	<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&family=Uncial+Antiqua&family=Metamorphous&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />
</svelte:head>

<!-- Scroll Progress -->
<div class="progress-bar" style:width="{scrollProgress}%"></div>

<section class="reader-page">
	{#if loading}
		<div class="loading-state">
			<div class="spinner-lg"></div>
			<p>{m.reader_loading()}</p>
		</div>
	{:else if error}
		<div class="error-state">
			<span class="error-icon">😔</span>
			<h3>{error}</h3>
			<a href="/stories" class="btn-brand">{m.reader_back_list()}</a>
		</div>
	{:else if chapter}
		<article class="reader" style:max-width="{readerTab === 'manga' ? Math.max(maxWidth, 860) : maxWidth}px">
			<header class="reader-header">
				<div class="header-top-links">
					<a href="/stories" class="back-link">{m.reader_back_list()}</a>
					<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
						<button
							type="button"
							class="toc-trigger-pill"
							onclick={() => quickToggleReaderMusic()}
							title={getCurrentTrack() ? `${m.reader_bgm_3()} ${getCurrentTrack()?.title}` : m.reader_play_ost_background_music_while_2()}
						>
							{getIsPlaying() ? m.reader_playing_bgm() : m.reader_bgm()}
						</button>
						<button type="button" class="toc-trigger-pill" onclick={openTocDrawer} title={m.reader_open_quick_toc_key_m()}>
							{m.reader_chapter_index_2()}
						</button>
					</div>
				</div>
				<span class="ch-num">Chapter {chapter.chapter_number}</span>
				<h1>{chapter.title}</h1>
				<div class="header-meta-row">
					<time>
						{new Date(chapter.created_at).toLocaleDateString(dateLocale(), {
							year: 'numeric',
							month: 'long',
							day: 'numeric'
						})}
					</time>
					{#if chapterStats.reading_time_min}
						<span class="meta-dot">·</span>
						<span>⏱️ ~{chapterStats.reading_time_min} {m.stories_min_read()}</span>
					{/if}
					{#if chapterStats.word_count}
						<span class="meta-dot">·</span>
						<span>{chapterStats.word_count.toLocaleString(dateLocale())} {m.reader_words()}</span>
					{/if}
				</div>
			</header>

			<!-- Dual-Mode Switcher: Prose vs Manga -->
			{#if hasPublishedManga && mangaConfig}
				<div class="mode-switcher">
					<button
						type="button"
						class="mode-switch-btn"
						class:active={readerTab === 'prose'}
						onclick={() => (readerTab = 'prose')}
					>
						{m.reader_read_prose()}
					</button>
					<button
						type="button"
						class="mode-switch-btn manga-tab"
						class:active={readerTab === 'manga'}
						onclick={() => {
							stopAutoScroll();
							readerTab = 'manga';
						}}
					>
						{m.reader_read_manga()}
					</button>
				</div>
			{/if}

			{#if readerTab === 'prose'}
				<!-- Sticky Toolbar Wrapper -->
				<div class="toolbar-sticky-wrapper">
					<!-- Reading Toolbar -->
					<div class="reading-toolbar">
						<!-- Quick TOC Button -->
						<button
							type="button"
							class="tool-btn pill-btn"
							class:active={showTocDrawer}
							onclick={openTocDrawer}
							title={m.reader_open_quick_toc_shortcut_m()}
						>
							{m.reader_toc_2()}
						</button>

						<!-- Font Size -->
						<div class="toolbar-group">
							<button
								class="tool-btn"
								onclick={() => {
									fontSize = Math.max(12, fontSize - 2);
								}}
								title={m.reader_font_smaller()}
							>
								A-
							</button>
							<span class="font-size-label">{fontSize}px</span>
							<button
								class="tool-btn"
								onclick={() => {
									fontSize = Math.min(32, fontSize + 2);
								}}
								title={m.reader_font_larger()}
							>
								A+
							</button>
						</div>

						<!-- Font Family -->
						<div class="toolbar-group">
							<select class="font-select" bind:value={fontFamily}>
								{#each fontOptions as f}
									<option value={f.value}>{f.label}</option>
								{/each}
							</select>
						</div>

						<!-- Themes -->
						<div class="toolbar-group">
							{#each themes as t}
								<button
									class="theme-btn"
									class:active={theme === t.id}
									style="background:{t.preview};color:{t.previewText}"
									title={t.name}
									onclick={() => (theme = t.id)}
								>
									Aa
								</button>
							{/each}
						</div>

						<!-- Smart Auto-Read Controls -->
						<div class="toolbar-group auto-scroll-group">
							<button
								type="button"
								class="tool-btn pill-btn"
								class:active={autoScrolling}
								onclick={toggleAutoScroll}
								title={autoScrolling ? m.reader_stop_auto_read_esc() : m.reader_start_smart_auto_read()}
							>
								{autoScrolling ? m.reader_reading() : m.reader_auto_read()}
							</button>
							{#if autoScrolling}
								<button
									type="button"
									class="tool-btn"
									class:active={autoReadPaused}
									onclick={togglePauseAutoRead}
									title={m.reader_pause_resume_space()}
								>
									{autoReadPaused ? '▶' : '⏸'}
								</button>
							{/if}
							<button
								type="button"
								class="tool-btn"
								class:active={showAutoReadPanel}
								onclick={() => (showAutoReadPanel = !showAutoReadPanel)}
								title={m.reader_customize_auto_read_settings()}
							>
								⚡
							</button>
						</div>

						<!-- Quick Lore Entities Trigger -->
						{#if libraryTags.length > 0}
							<button
								type="button"
								class="tool-btn pill-btn lore-pill"
								class:active={showLoreDrawer}
								onclick={() => {
									pauseAutoReadIfActive();
									showLoreDrawer = !showLoreDrawer;
								}}
								title={m.reader_quick_view_entities_in_this()}
							>
								🏷️ {m.reader_entities()} ({libraryTags.length})
							</button>
						{/if}

						<!-- Quick Background Music Toggle -->
						<button
							type="button"
							class="tool-btn pill-btn"
							class:active={getIsPlaying()}
							onclick={() => quickToggleReaderMusic()}
							title={getCurrentTrack()
								? `${getIsPlaying() ? m.world_pause() : m.reader_resume()}: ${getCurrentTrack()?.title}`
								: m.reader_play_ost_background_music_while()}
						>
							{getIsPlaying() ? m.reader_bgm_2() : m.reader_bgm()}
						</button>

						<!-- Settings (Width, Line height, Lore underline) -->
						<button
							class="tool-btn"
							onclick={() => (showSettings = !showSettings)}
							title={m.reader_settings()}
							class:active={showSettings}
						>
							⚙️
						</button>
					</div>

					<!-- Smart Auto-Read Control Panel -->
					{#if showAutoReadPanel || autoScrolling}
						<div class="autoread-panel glass-card">
							<div class="autoread-mode-tabs">
								<button
									type="button"
									class="ar-mode-btn"
									class:active={autoReadMode === 'paragraph'}
									onclick={() => switchAutoReadMode('paragraph')}
									title={m.reader_page_stays_100_still_while()}
								>
									{m.reader_paragraph_pace_still_eye_friendly()}
								</button>
								<button
									type="button"
									class="ar-mode-btn"
									class:active={autoReadMode === 'glide'}
									onclick={() => switchAutoReadMode('glide')}
									title={m.reader_continuous_60_120fps_sub_pixel()}
								>
									{m.reader_smooth_glide_60fps()}
								</button>
							</div>

							{#if autoReadMode === 'paragraph'}
								<div class="autoread-controls-row">
									<div class="ar-speed-chips">
										{#each wpmOptions as opt}
											<button
												type="button"
												class="ar-chip"
												class:active={autoReadWpm === opt.value}
												onclick={() => {
													autoReadWpm = opt.value;
													if (autoScrolling && activeBlockIndex !== null) {
														stepDurationMs = computeStepDurationMs(activeBlockIndex);
													}
												}}
											>
												{opt.label}
											</button>
										{/each}
									</div>

									<div class="ar-step-actions">
										{#if autoScrolling}
											<button
												type="button"
												class="ar-step-btn"
												onclick={() => stepSpotlight(-1)}
												title={m.reader_previous_paragraph()}
											>
												{m.reader_prev_para()}
											</button>
											<button
												type="button"
												class="ar-step-btn"
												onclick={() => stepSpotlight(1)}
												title={m.reader_next_paragraph()}
											>
												{m.reader_next_para()}
											</button>
										{/if}
										<label class="ar-focus-toggle" title={m.reader_dim_surrounding_paragraphs_to_focus()}>
											<input type="checkbox" bind:checked={spotlightDimInactive} />
											<span>{m.reader_spotlight_active_paragraph()}</span>
										</label>
									</div>
								</div>
								<p class="autoread-hint">
									{@html m.reader_page_stays_still_while_you()}
								</p>
							{:else}
								<div class="autoread-controls-row">
									<div class="ar-speed-chips">
										{#each glideSpeedOptions as opt}
											<button
												type="button"
												class="ar-chip"
												class:active={glideSpeedPxPerSec === opt.value}
												onclick={() => (glideSpeedPxPerSec = opt.value)}
											>
												{opt.label}
											</button>
										{/each}
									</div>
									<label class="ar-slider-label">
										<span>{m.reader_speed()} {glideSpeedPxPerSec} px/s</span>
										<input type="range" min="10" max="60" step="2" bind:value={glideSpeedPxPerSec} />
									</label>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Extended Settings Panel -->
					{#if showSettings}
						<div class="reader-settings glass-card">
							<label>
								<span>{m.reader_line_height()}</span>
								<input type="range" min="1.4" max="2.4" step="0.1" bind:value={lineHeight} />
								<span class="val">{lineHeight}</span>
							</label>
							<label>
								<span>{m.reader_width()}</span>
								<input type="range" min="500" max="1000" step="20" bind:value={maxWidth} />
								<span class="val">{maxWidth}px</span>
							</label>
							<label class="lore-toggle-label">
								<input type="checkbox" bind:checked={enableLoreHighlight} />
								<span>{m.reader_underline_lore_entities_inline_within()}</span>
							</label>
						</div>
					{/if}

					<!-- Inline Quick Lore Drawer (dropped from sticky toolbar) -->
					{#if showLoreDrawer && libraryTags.length > 0}
						<div class="toolbar-lore-drawer glass-card">
							<div class="tld-head">
								<strong>🏷️ {m.reader_entities_in_chapter({ num: chapter.chapter_number })}</strong>
								<button type="button" class="tld-close" onclick={() => (showLoreDrawer = false)}>✕</button>
							</div>
							<div class="tld-chips">
								{#each libraryTags as tag (tag.id)}
									<button
										type="button"
										class="tld-chip"
										onclick={() => {
											selectedLoreItem = tag;
											showLoreDrawer = false;
										}}
									>
										<span>{(categoryLabels[tag.category] || '📌').slice(0, 2)}</span>
										<strong>{tag.name}</strong>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Translation Fallback Notice (Option 1: Untranslated chapter in EN mode) -->
			{#if translationFallback && readerTab === 'prose'}
				<div class="translation-fallback-banner glass-card" role="status">
					<span>{m.reader_translation_fallback_notice()}</span>
				</div>
			{/if}

			<!-- Auto-Resume Notification Banner -->
			{#if resumeBannerPercent !== null && readerTab === 'prose'}
				<div class="resume-toast glass-card">
					<span>📍 {m.reader_restored_reading_position_at()} <strong>{resumeBannerPercent}%</strong></span>
					<div class="resume-toast-actions">
						<button type="button" class="resume-reset-btn" onclick={restartFromBeginning}>
							{m.reader_restart_from_beginning()}
						</button>
						<button type="button" class="resume-close-btn" onclick={() => (resumeBannerPercent = null)}>
							✕
						</button>
					</div>
				</div>
			{/if}

			<!-- Chapter Navigation (Top) -->
			<nav class="chapter-nav-top">
				{#if prevCh}
					<a href="/stories/{prevCh}" class="nav-btn prev" title={m.reader_shortcut_2()}>{m.reader_prev_ch()}</a>
				{:else}
					<span class="nav-btn prev disabled">{m.reader_prev_ch()}</span>
				{/if}
				<button type="button" class="nav-btn toc-mid" onclick={openTocDrawer}>
					📑 Ch. {chapter.chapter_number}
				</button>
				{#if nextCh}
					<a href="/stories/{nextCh}" class="nav-btn next" title={m.reader_shortcut()}>{m.reader_next_ch()}</a>
				{:else}
					<span class="nav-btn next disabled">{m.reader_next_ch()}</span>
				{/if}
			</nav>

			{#if readerTab === 'manga' && hasPublishedManga && mangaConfig}
				<MangaReader
					manga={mangaConfig}
					initialEdition={requestedEdition}
					initialProgressPercent={initialSavedPosition}
					onProgressChange={handleMangaProgress}
				/>
			{:else}
				<div
					bind:this={articleBodyEl}
					class="reader-content reader-article-body"
					style:font-size="{fontSize}px"
					style:line-height="{lineHeight}"
					style:font-family="{fontFamily}"
					style="{getThemeStyle()}"
				>
					<StoryContent
						blocks={chapter.content_blocks}
						contentHtml={chapter.content_html}
						content={chapter.content}
						emptyText={m.reader_no_content()}
						loreItems={libraryTags}
						{enableLoreHighlight}
						onSelectLore={(item) => {
							pauseAutoReadIfActive();
							selectedLoreItem = item;
						}}
						activeBlockIndex={autoScrolling && autoReadMode === 'paragraph' ? activeBlockIndex : null}
						{spotlightProgress}
						{spotlightDimInactive}
						onSelectBlock={(idx) => {
							if (autoScrolling && autoReadMode === 'paragraph') {
								activateSpotlightBlock(idx);
							}
						}}
					/>
				</div>
			{/if}

			{#if chapter.author_note}
				<div class="author-note glass-card">
					<h4>{m.reader_author_note()}</h4>
					<p>{chapter.author_note}</p>
				</div>
			{/if}

			<!-- Library Entities Appearing in Chapter -->
			{#if libraryTags.length > 0}
				<section class="chapter-lore-section glass-card">
					<div class="lore-sec-header">
						<h4>🏷️ {m.reader_world_dossiers_appearing_in_this()} ({libraryTags.length})</h4>
						<a href="/library" class="lore-all-link">{m.reader_open_library()}</a>
					</div>
					<div class="lore-tags-grid">
						{#each libraryTags as tag (tag.id)}
							<button
								type="button"
								class="lore-tag-card"
								onclick={() => {
									pauseAutoReadIfActive();
									selectedLoreItem = tag;
								}}
							>
								{#if tag.image_url}
									<img src={tag.image_url} alt={tag.name} class="lore-tag-avatar" loading="lazy" />
								{:else}
									<div class="lore-tag-avatar placeholder">
										{(categoryLabels[tag.category] || '📌').slice(0, 2)}
									</div>
								{/if}
								<div class="lore-tag-meta">
									<span class="lore-tag-cat">{formatCategoryLabel(tag.category, true)}</span>
									<strong class="lore-tag-name">{tag.name}</strong>
									{#if tag.extra_data?.role}
										<span class="lore-tag-role">{formatEntryRoleLabel(tag.extra_data.role)}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Linked Chapters -->
			{#if linkedChapters.length > 0}
				<section class="chapter-links-section glass-card">
					<h4>🔗 {m.reader_related_chapters()} ({linkedChapters.length})</h4>
					<div class="linked-ch-list">
						{#each linkedChapters as lc (lc.id)}
							<a href="/stories/{lc.chapter_number}" class="linked-ch-chip">
								<span class="lc-num">Ch. {lc.chapter_number}</span>
								<span class="lc-title">{lc.title}</span>
								{#if lc.link_note}
									<span class="lc-note">— {lc.link_note}</span>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Chapter Navigation (Bottom) -->
			<nav class="chapter-nav">
				{#if prevCh}
					<a href="/stories/{prevCh}" class="btn-ghost">← Ch. {prevCh}</a>
				{:else}
					<span class="btn-ghost disabled">{m.reader_end_of_story()}</span>
				{/if}
				<div class="bottom-mid-actions">
					<button type="button" class="btn-ghost" onclick={openTocDrawer}>{m.reader_quick_toc()}</button>
					<a href="/stories" class="btn-ghost">{m.reader_toc()}</a>
				</div>
				{#if nextCh}
					<a href="/stories/{nextCh}" class="btn-brand">Ch. {nextCh} →</a>
				{:else}
					<span class="end-note">{m.reader_latest_ch()}</span>
				{/if}
			</nav>

			<!-- Scroll % indicator -->
			<div class="scroll-indicator">
				{#if autoScrolling}
					<span class="auto-dot" class:paused={autoReadPaused}></span>
				{/if}
				{scrollProgress}%
			</div>

			<!-- Comments Section -->
			{#if chapter}
				<CommentsSection commentableType="chapter" commentableId={chapter.id} />
			{/if}
		</article>
	{/if}
</section>

<!-- Quick TOC Drawer -->
{#if showTocDrawer}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="toc-drawer-overlay" onclick={() => (showTocDrawer = false)}>
		<div class="toc-drawer glass-card" onclick={(e) => e.stopPropagation()}>
			<div class="toc-drawer-header">
				<div>
					<h3>{m.reader_chapter_index()}</h3>
					<span class="toc-subtitle">{tocChapters.length} {m.reader_published_chapters()}</span>
				</div>
				<button type="button" class="toc-close-btn" onclick={() => (showTocDrawer = false)}>✕</button>
			</div>

			<div class="toc-drawer-controls">
				<input
					type="text"
					class="toc-search-input"
					placeholder={m.reader_quick_search_chapter_number_or()}
					bind:value={tocSearch}
				/>
				<div class="toc-filter-row">
					<button
						type="button"
						class="toc-chip"
						class:active={!tocOnlyManga}
						onclick={() => (tocOnlyManga = false)}
					>
						{m.lib_cat_all()}
					</button>
					<button
						type="button"
						class="toc-chip"
						class:active={tocOnlyManga}
						onclick={() => (tocOnlyManga = true)}
					>
						{m.stories_with_manga()}
					</button>
					<button
						type="button"
						class="toc-chip sort-btn"
						onclick={() => (tocSortDesc = !tocSortDesc)}
					>
						{tocSortDesc ? m.reader_newest() : m.reader_oldest()}
					</button>
				</div>
			</div>

			<div class="toc-drawer-list">
				{#if tocLoading}
					<p class="toc-empty">{m.reader_loading_chapters()}</p>
				{:else if filteredTocChapters.length === 0}
					<p class="toc-empty">{m.reader_no_matching_chapters_found()}</p>
				{:else}
					{#each filteredTocChapters as item (item.id)}
						{@const isCurrent = Number(item.chapter_number) === Number(chapter?.chapter_number)}
						{@const itemPct = tocProgressMap[item.chapter_number] ?? 0}
						<a
							id="toc-ch-{item.chapter_number}"
							href="/stories/{item.chapter_number}"
							class="toc-item"
							class:current={isCurrent}
							onclick={() => (showTocDrawer = false)}
						>
							<div class="toc-item-main">
								<span class="toc-ch-num">Ch. {item.chapter_number}</span>
								<span class="toc-ch-title">{item.title}</span>
							</div>
							<div class="toc-item-badges">
								{#if item.has_manga}
									<span class="toc-manga-tag" title={m.reader_has_manga_edition()}>🎨</span>
								{/if}
								{#if isCurrent}
									<span class="toc-status current">{m.reader_current()}</span>
								{:else if itemPct >= 95}
									<span class="toc-status done">✓</span>
								{:else if itemPct > 0}
									<span class="toc-status reading">{itemPct}%</span>
								{/if}
							</div>
						</a>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Quick Lore Modal -->
{#if selectedLoreItem}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="lore-modal-overlay" onclick={() => (selectedLoreItem = null)}>
		<div class="lore-modal glass-card" onclick={(e) => e.stopPropagation()}>
			<button type="button" class="lore-modal-close" onclick={() => (selectedLoreItem = null)}>✕</button>
			<div class="lore-modal-body">
				{#if selectedLoreItem.image_url}
					<img src={selectedLoreItem.image_url} alt={selectedLoreItem.name} class="lore-modal-img" />
				{/if}
				<div class="lore-modal-info">
					<span class="lore-tag-cat">{formatCategoryLabel(selectedLoreItem.category, true)}</span>
					<h3>{selectedLoreItem.name}</h3>
					{#if selectedLoreItem.extra_data?.role}
						<p class="lore-modal-role">{formatEntryRoleLabel(selectedLoreItem.extra_data.role)}</p>
					{/if}
					{#if Array.isArray(selectedLoreItem.extra_data?.aliases) && selectedLoreItem.extra_data.aliases.length > 0}
						<p class="lore-modal-aliases">
							<strong>{m.reader_aliases()}</strong> {selectedLoreItem.extra_data.aliases.join(', ')}
						</p>
					{/if}
					{#if selectedLoreItem.description}
						<p class="lore-modal-desc">{selectedLoreItem.description}</p>
					{/if}
					<div class="lore-modal-actions">
						<a href="/library?id={selectedLoreItem.id}" class="btn-ghost">{m.reader_full_dossier_in_library()}</a>
						{#if selectedLoreItem.category === 'location' || selectedLoreItem.extra_data?.world}
							<a href="/world?focus={selectedLoreItem.id}" class="btn-brand">{m.lib_locate_on_3d_map()}</a>
						{:else if selectedLoreItem.category === 'character' || selectedLoreItem.category === 'main_character' || selectedLoreItem.category === 'side_character'}
							<a href="/world/journey/{selectedLoreItem.id}" class="btn-brand">{m.reader_3d_character_journey()}</a>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.progress-bar {
		position: fixed;
		top: 0;
		left: 0;
		height: 3px;
		z-index: 999;
		background: linear-gradient(90deg, var(--color-brand-500), var(--color-accent-cyan));
		transition: width 0.1s ease;
	}
	.reader-page {
		margin: 0 auto;
		padding: 2rem 1.5rem 6rem;
	}
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		gap: 1rem;
		text-align: center;
		color: var(--color-text-muted);
	}
	.spinner-lg {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-surface-300);
		border-top-color: var(--color-brand-400);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.error-state {
		text-align: center;
		padding: 4rem;
	}
	.error-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.5rem;
	}
	.error-state h3 {
		margin-bottom: 1rem;
		color: var(--color-text-secondary);
	}

	.reader {
		max-width: 720px;
		margin: 0 auto;
		transition: max-width 0.3s ease;
	}
	.reader-header {
		margin-bottom: 1.5rem;
		text-align: center;
	}
	.header-top-links {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.85rem;
		flex-wrap: wrap;
	}
	.back-link {
		font-size: 0.82rem;
		color: var(--color-text-muted);
		text-decoration: none;
		transition: color 0.2s;
	}
	.back-link:hover {
		color: var(--color-brand-400);
	}
	.toc-trigger-pill {
		padding: 0.25rem 0.7rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.18s;
	}
	.toc-trigger-pill:hover {
		border-color: var(--color-brand-400);
		color: var(--color-brand-400);
	}
	.ch-num {
		display: block;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-brand-400);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin: 1.25rem 0 0.5rem;
	}
	.reader-header h1 {
		font-size: clamp(1.5rem, 4vw, 2.25rem);
		font-weight: 800;
		line-height: 1.2;
		margin-bottom: 0.5rem;
	}
	.header-meta-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}
	.meta-dot {
		opacity: 0.5;
	}

	/* ─── Mode Switcher (Prose vs Manga) ─── */
	.mode-switcher {
		display: flex;
		justify-content: center;
		gap: 0.65rem;
		margin-bottom: 1.25rem;
	}
	.mode-switch-btn {
		padding: 0.6rem 1.25rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-100);
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}
	.mode-switch-btn.active {
		background: var(--color-brand-500);
		color: #fff;
		border-color: var(--color-brand-500);
		box-shadow: 0 4px 14px rgba(12, 113, 61, 0.3);
	}
	.mode-switch-btn.manga-tab.active {
		background: linear-gradient(135deg, #9333ea, #6366f1);
		border-color: #9333ea;
		box-shadow: 0 4px 14px rgba(147, 51, 234, 0.35);
	}

	/* ─── Sticky Toolbar Wrapper ─── */
	.toolbar-sticky-wrapper {
		position: sticky;
		top: 64px;
		z-index: 50;
		margin-bottom: 1rem;
	}
	/* ─── Reading Toolbar ─── */
	.reading-toolbar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.9rem;
		background: var(--color-surface-100);
		border-radius: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		flex-wrap: wrap;
		backdrop-filter: blur(12px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}
	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.tool-btn {
		min-width: 32px;
		height: 32px;
		padding: 0 0.45rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.375rem;
		background: var(--color-surface-200);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-text-muted);
		transition: all 0.2s;
	}
	.tool-btn.pill-btn {
		padding: 0 0.65rem;
		white-space: nowrap;
	}
	.tool-btn.lore-pill {
		color: #6ee7b7;
		border-color: rgba(16, 185, 129, 0.28);
	}
	.tool-btn:hover {
		border-color: var(--color-brand-500);
		color: var(--color-brand-400);
	}
	.tool-btn.active {
		background: var(--color-brand-500);
		color: #fff;
		border-color: var(--color-brand-500);
	}
	.font-size-label {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		min-width: 32px;
		text-align: center;
	}

	/* Font Select */
	.font-select {
		padding: 0.375rem 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.375rem;
		background: var(--color-surface-200);
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		outline: none;
		transition: border-color 0.2s;
		font-family: inherit;
	}
	.font-select:focus {
		border-color: var(--color-brand-500);
	}

	/* Theme Buttons */
	.theme-btn {
		width: 26px;
		height: 26px;
		border-radius: 0.375rem;
		border: 2px solid rgba(255, 255, 255, 0.08);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.625rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.theme-btn.active {
		border-color: var(--color-brand-500);
		transform: scale(1.12);
		box-shadow: 0 0 0 2px rgba(12, 113, 61, 0.3);
	}

	/* ─── Smart Auto-Read Control Panel ─── */
	.autoread-panel {
		margin-top: 0.5rem;
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		border: 1px solid rgba(16, 185, 129, 0.28);
	}
	.autoread-mode-tabs {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.ar-mode-btn {
		flex: 1;
		min-width: 180px;
		padding: 0.45rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.18s;
	}
	.ar-mode-btn.active {
		background: linear-gradient(135deg, #0c713d, #0d9488);
		border-color: #10b981;
		color: #fff;
	}
	.autoread-controls-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.ar-speed-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.ar-chip {
		padding: 0.3rem 0.6rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--color-surface-200);
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}
	.ar-chip.active {
		background: var(--color-brand-500);
		border-color: var(--color-brand-500);
		color: #fff;
	}
	.ar-step-actions {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.ar-step-btn {
		padding: 0.28rem 0.6rem;
		border-radius: 0.4rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}
	.ar-step-btn:hover {
		border-color: var(--color-brand-400);
		color: var(--color-text-primary);
	}
	.ar-focus-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.74rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.ar-slider-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	.autoread-hint {
		margin: 0;
		font-size: 0.72rem;
		color: var(--color-text-muted);
	}

	/* Extended Settings */
	.reader-settings {
		margin: 0;
		padding: 0.75rem 1rem;
		margin-top: 0.5rem;
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.reader-settings label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.76rem;
		color: var(--color-text-muted);
		flex: 1;
		min-width: 170px;
	}
	.reader-settings .lore-toggle-label {
		flex-basis: 100%;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.reader-settings input[type='range'] {
		flex: 1;
		accent-color: var(--color-brand-500);
	}
	.val {
		font-size: 0.72rem;
		font-weight: 600;
		min-width: 38px;
		text-align: right;
	}

	/* Toolbar Lore Drawer */
	.toolbar-lore-drawer {
		margin-top: 0.5rem;
		padding: 0.85rem 1rem;
	}
	.tld-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.55rem;
		font-size: 0.8rem;
		color: var(--color-text-primary);
	}
	.tld-close {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
	}
	.tld-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.tld-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.32rem 0.65rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.76rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.tld-chip:hover {
		border-color: var(--color-brand-400);
		background: rgba(16, 185, 129, 0.12);
	}

	/* Resume Toast Banner */
	.resume-toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 1rem;
		margin-bottom: 1rem;
		border: 1px solid rgba(16, 185, 129, 0.35);
		background: rgba(12, 113, 61, 0.14);
		font-size: 0.82rem;
		color: var(--color-text-primary);
	}
	.resume-toast-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.resume-reset-btn {
		padding: 0.25rem 0.65rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(255, 255, 255, 0.06);
		color: #6ee7b7;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.resume-close-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.85rem;
	}

	/* Top nav */
	.chapter-nav-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}
	.nav-btn {
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 600;
		transition: all 0.2s;
	}
	.nav-btn.prev {
		color: var(--color-text-secondary);
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	.nav-btn.prev:hover {
		border-color: var(--color-brand-500);
		color: var(--color-brand-400);
	}
	.nav-btn.toc-mid {
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		border: 1px solid rgba(255, 255, 255, 0.08);
		cursor: pointer;
	}
	.nav-btn.toc-mid:hover {
		border-color: var(--color-brand-400);
		color: var(--color-text-primary);
	}
	.nav-btn.next {
		background: linear-gradient(135deg, var(--color-brand-500), rgba(12, 113, 61, 0.8));
		color: #fff;
		border: none;
	}
	.nav-btn.next:hover:not(.disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(12, 113, 61, 0.25);
	}
	.nav-btn.disabled,
	.btn-ghost.disabled {
		opacity: 0.35;
		cursor: not-allowed;
		pointer-events: none;
	}

	/* Reader Content */
	.reader-content {
		font-family: var(--font-serif);
		color: var(--color-text-primary);
		transition: all 0.3s ease;
	}
	.reader-content :global(p) {
		margin-bottom: 1.2em;
		text-align: justify;
		text-indent: 2em;
	}
	.reader-content :global(h2),
	.reader-content :global(h3) {
		margin: 2em 0 0.75em;
		font-family: var(--font-sans);
		font-weight: 700;
	}
	.reader-content :global(blockquote) {
		border-left: 3px solid var(--color-brand-500);
		padding-left: 1em;
		margin: 1.5em 0;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.author-note {
		padding: 1.25rem;
		margin: 2rem 0 1.25rem;
	}
	.author-note h4 {
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
	}
	.author-note p {
		font-size: 0.88rem;
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	/* ─── Chapter Lore Tags & Linked Chapters ─── */
	.chapter-lore-section,
	.chapter-links-section {
		padding: 1.25rem;
		margin: 1.5rem 0;
	}
	.lore-sec-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.9rem;
	}
	.lore-sec-header h4,
	.chapter-links-section h4 {
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0;
	}
	.chapter-links-section h4 {
		margin-bottom: 0.75rem;
	}
	.lore-all-link {
		font-size: 0.78rem;
		color: var(--color-brand-400);
		text-decoration: none;
		font-weight: 600;
	}
	.lore-tags-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.65rem;
	}
	.lore-tag-card {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.55rem 0.7rem;
		border-radius: 0.65rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		text-align: left;
		cursor: pointer;
		transition: all 0.15s;
		color: inherit;
	}
	.lore-tag-card:hover {
		border-color: var(--color-brand-500);
		background: rgba(12, 113, 61, 0.08);
		transform: translateY(-1px);
	}
	.lore-tag-avatar {
		width: 42px;
		height: 42px;
		border-radius: 0.5rem;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--color-surface-200);
	}
	.lore-tag-avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.15rem;
	}
	.lore-tag-meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.lore-tag-cat {
		font-size: 0.66rem;
		color: var(--color-brand-400);
		font-weight: 700;
		text-transform: uppercase;
	}
	.lore-tag-name {
		font-size: 0.85rem;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lore-tag-role {
		font-size: 0.72rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.linked-ch-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.linked-ch-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.8rem;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		text-decoration: none;
		font-size: 0.82rem;
		color: var(--color-text-primary);
		transition: all 0.15s;
	}
	.linked-ch-chip:hover {
		border-color: var(--color-brand-500);
		color: var(--color-brand-400);
	}
	.lc-num {
		font-weight: 700;
		color: var(--color-brand-400);
	}
	.lc-note {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	/* ─── Quick TOC Drawer ─── */
	.toc-drawer-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		z-index: 220;
		display: flex;
		justify-content: flex-end;
	}
	.toc-drawer {
		width: min(400px, 92vw);
		height: 100dvh;
		border-radius: 1rem 0 0 1rem;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		background: var(--color-surface-100);
	}
	.toc-drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.toc-drawer-header h3 {
		margin: 0;
		font-size: 1.1rem;
	}
	.toc-subtitle {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
	.toc-close-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1.15rem;
		cursor: pointer;
	}
	.toc-drawer-controls {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.toc-search-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.82rem;
		outline: none;
	}
	.toc-filter-row {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.toc-chip {
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.74rem;
		font-weight: 600;
		cursor: pointer;
	}
	.toc-chip.active {
		background: var(--color-brand-500);
		border-color: var(--color-brand-500);
		color: #fff;
	}
	.toc-chip.sort-btn {
		margin-left: auto;
	}
	.toc-drawer-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-right: 0.25rem;
	}
	.toc-empty {
		text-align: center;
		color: var(--color-text-muted);
		font-size: 0.84rem;
		padding: 2rem 0;
	}
	.toc-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.65rem 0.8rem;
		border-radius: 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.02);
		text-decoration: none;
		color: var(--color-text-primary);
		transition: all 0.15s;
	}
	.toc-item:hover {
		border-color: var(--color-brand-400);
		background: rgba(12, 113, 61, 0.08);
	}
	.toc-item.current {
		border-color: #10b981;
		background: rgba(16, 185, 129, 0.14);
	}
	.toc-item-main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.toc-ch-num {
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--color-brand-400);
		text-transform: uppercase;
	}
	.toc-ch-title {
		font-size: 0.85rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.toc-item-badges {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
	}
	.toc-manga-tag {
		font-size: 0.78rem;
	}
	.toc-status {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
	}
	.toc-status.current {
		background: #10b981;
		color: #fff;
	}
	.toc-status.done {
		background: rgba(16, 185, 129, 0.15);
		color: #34d399;
	}
	.toc-status.reading {
		background: rgba(245, 158, 11, 0.16);
		color: #fbbf24;
	}

	/* ─── Quick Lore Modal ─── */
	.lore-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 230;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.25rem;
	}
	.lore-modal {
		position: relative;
		max-width: 540px;
		width: 100%;
		padding: 1.5rem;
	}
	.lore-modal-close {
		position: absolute;
		top: 0.85rem;
		right: 0.85rem;
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1.1rem;
		cursor: pointer;
	}
	.lore-modal-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.lore-modal-img {
		width: 100%;
		max-height: 260px;
		object-fit: cover;
		border-radius: 0.65rem;
	}
	.lore-modal-info h3 {
		margin: 0.25rem 0;
		font-size: 1.25rem;
	}
	.lore-modal-role {
		font-size: 0.82rem;
		color: var(--color-brand-400);
		margin: 0 0 0.5rem;
	}
	.lore-modal-aliases {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0 0 0.5rem;
	}
	.lore-modal-desc {
		font-size: 0.88rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		white-space: pre-line;
		margin: 0 0 1rem;
	}
	.lore-modal-actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.lore-modal-actions a {
		text-decoration: none;
	}

	.chapter-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}
	.bottom-mid-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.chapter-nav a {
		text-decoration: none;
	}
	.end-note {
		font-size: 0.82rem;
		color: var(--color-text-muted);
		font-style: italic;
	}

	.scroll-indicator {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--color-surface-200);
		color: var(--color-text-muted);
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.3rem 0.55rem;
		border-radius: var(--radius-sm);
		opacity: 0.82;
	}
	.auto-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #10b981;
		box-shadow: 0 0 6px #10b981;
	}
	.auto-dot.paused {
		background: #f59e0b;
		box-shadow: none;
	}

	@media (max-width: 600px) {
		.toolbar-sticky-wrapper {
			top: 58px;
		}
		.reading-toolbar {
			gap: 0.35rem;
			padding: 0.45rem 0.55rem;
			flex-wrap: wrap;
			justify-content: center;
		}
		.theme-btn {
			width: 24px;
			height: 24px;
			font-size: 0.55rem;
		}
		.tool-btn {
			height: 28px;
			font-size: 0.68rem;
		}
		.font-select {
			font-size: 0.68rem;
			padding: 0.25rem 0.375rem;
		}
		.reader-settings {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}
		.resume-toast {
			flex-wrap: wrap;
		}
		.chapter-nav {
			flex-direction: column;
			gap: 0.75rem;
		}
		.chapter-nav-top {
			flex-wrap: wrap;
		}
		.reader-content :global(p) {
			text-indent: 1.25em;
		}
	}

	.translation-fallback-banner {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		margin: 0.85rem 0;
		padding: 0.72rem 1rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(200, 168, 75, 0.32);
		background: rgba(200, 168, 75, 0.08);
		color: var(--color-text-secondary);
		font-size: 0.86rem;
		line-height: 1.45;
	}
</style>
