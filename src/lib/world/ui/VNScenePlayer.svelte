<script lang="ts">
	/**
	 * VNScenePlayer.svelte (Svelte 5 Runes)
	 * Trình phát Visual Novel Đa Nhánh Song Ngữ (VI / EN) cho Selorson V3 (/world & Thế Giới Mở).
	 * Đọc trực tiếp gói `vn_episode_<slug>.zip` (giải nén chuẩn Web `DecompressionStream('deflate-raw')`)
	 * hoặc `episode.json`, phát giọng lồng tiếng cục bộ (VieNeu-TTS / OmniVoice), nhạc nền BGM,
	 * điểm chạm soi cổ vật (Hotspots), thẻ bách khoa TIPS, Mảnh Ký Ức và rẽ nhánh lựa chọn.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { currentLocale } from '$lib/i18n-labels';

	interface VnCharacterCast {
		id: string;
		name_vi: string;
		name_en: string;
		voice_vi?: string;
		voice_en?: string;
		portrait_path?: string | null;
		accent_color?: string;
	}

	interface VnHotspot {
		id: string;
		x_pct: number;
		y_pct: number;
		label_vi: string;
		label_en: string;
		inspect_vi: string;
		inspect_en: string;
		unlock_tip_id?: string | null;
	}

	interface VnChoiceOption {
		id: string;
		label_vi: string;
		label_en: string;
		target_node_id: string;
		grant_shard_id?: string | null;
	}

	interface VnDialogueNode {
		id: string;
		speaker_id: string;
		expression?: string;
		text_vi: string;
		text_en: string;
		backdrop_path?: string | null;
		voice_vi_path?: string | null;
		voice_en_path?: string | null;
		bgm_override_path?: string | null;
		next_node_id?: string | null;
		choices?: VnChoiceOption[];
		hotspots?: VnHotspot[];
		unlock_tip_ids?: string[];
		unlock_shard_id?: string | null;
	}

	interface VnTipEntry {
		id: string;
		term_vi: string;
		term_en: string;
		body_vi: string;
		body_en: string;
	}

	interface VnMemoryShard {
		id: string;
		title_vi: string;
		title_en: string;
		echo_vi: string;
		echo_en: string;
		chapter_hint?: number | null;
	}

	interface VnEpisodeDocument {
		schema_version?: string;
		slug: string;
		title_vi: string;
		title_en: string;
		synopsis_vi?: string;
		synopsis_en?: string;
		entry_node_id: string;
		bgm_path?: string | null;
		default_backdrop_path?: string | null;
		cast?: VnCharacterCast[];
		nodes: VnDialogueNode[];
		tips?: VnTipEntry[];
		memory_shards?: VnMemoryShard[];
		archive_asset_map?: Record<string, string>;
	}

	interface Props {
		episodeUrl: string;
		fallbackBackdropUrl?: string | null;
		fallbackTitle?: string | null;
		onclose: () => void;
	}

	let {
		episodeUrl,
		fallbackBackdropUrl = null,
		fallbackTitle = null,
		onclose
	}: Props = $props();

	let lang = $state<'vi' | 'en'>(currentLocale() === 'en' ? 'en' : 'vi');
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let episode = $state<VnEpisodeDocument | null>(null);
	let currentNodeId = $state<string>('');
	let historyIds = $state<string[]>([]);

	let unlockedTipIds = $state<string[]>([]);
	let unlockedShardIds = $state<string[]>([]);
	let activeHotspot = $state<VnHotspot | null>(null);
	let codexTab = $state<'none' | 'tips' | 'shards'>('none');
	let autoVoice = $state(true);
	let bgmMuted = $state(false);
	let voicePlaying = $state(false);

	let blobUrlByRelPath = new Map<string, string>();
	let createdObjectUrls: string[] = [];
	let voiceAudio: HTMLAudioElement | null = null;
	let bgmAudio: HTMLAudioElement | null = null;
	let activeBgmSrc = '';

	let currentNode = $derived.by<VnDialogueNode | null>(() => {
		if (!episode || !episode.nodes?.length) return null;
		return (
			episode.nodes.find((n) => n.id === currentNodeId) ??
			episode.nodes.find((n) => n.id === episode?.entry_node_id) ??
			episode.nodes[0] ??
			null
		);
	});

	let activeSpeaker = $derived.by<VnCharacterCast | null>(() => {
		if (!episode || !currentNode) return null;
		return (episode.cast ?? []).find((c) => c.id === currentNode?.speaker_id) ?? null;
	});

	let unlockedTips = $derived.by<VnTipEntry[]>(() => {
		if (!episode?.tips) return [];
		return episode.tips.filter((t) => unlockedTipIds.includes(t.id));
	});

	let unlockedShards = $derived.by<VnMemoryShard[]>(() => {
		if (!episode?.memory_shards) return [];
		return episode.memory_shards.filter((s) => unlockedShardIds.includes(s.id));
	});

	function guessMimeType(name: string): string {
		const lower = name.toLowerCase();
		if (lower.endsWith('.wav')) return 'audio/wav';
		if (lower.endsWith('.mp3')) return 'audio/mpeg';
		if (lower.endsWith('.ogg')) return 'audio/ogg';
		if (lower.endsWith('.flac')) return 'audio/flac';
		if (lower.endsWith('.png')) return 'image/png';
		if (lower.endsWith('.webp')) return 'image/webp';
		if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
		if (lower.endsWith('.json')) return 'application/json';
		return 'application/octet-stream';
	}

	async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
		const ds = new DecompressionStream('deflate-raw');
		const writer = ds.writable.getWriter();
		const copy = new Uint8Array(compressed.byteLength);
		copy.set(compressed);
		await writer.write(copy);
		await writer.close();
		const reader = ds.readable.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				chunks.push(value);
				total += value.byteLength;
			}
		}
		const out = new Uint8Array(total);
		let offset = 0;
		for (const c of chunks) {
			out.set(c, offset);
			offset += c.byteLength;
		}
		return out;
	}

	async function unpackZipBundle(buffer: ArrayBuffer): Promise<VnEpisodeDocument> {
		const bytes = new Uint8Array(buffer);
		const view = new DataView(buffer);

		// Locate End of Central Directory (0x06054b50)
		let eocdOffset = -1;
		const minSearch = Math.max(0, bytes.length - 65557);
		for (let i = bytes.length - 22; i >= minSearch; i--) {
			if (view.getUint32(i, true) === 0x06054b50) {
				eocdOffset = i;
				break;
			}
		}
		if (eocdOffset < 0) {
			throw new Error('Invalid VN ZIP archive: missing Central Directory.');
		}

		const totalEntries = view.getUint16(eocdOffset + 10, true);
		const cdOffset = view.getUint32(eocdOffset + 16, true);
		const decoder = new TextDecoder('utf-8');

		let ptr = cdOffset;
		let parsedEpisode: VnEpisodeDocument | null = null;

		for (let idx = 0; idx < totalEntries; idx++) {
			if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) {
				break;
			}
			const method = view.getUint16(ptr + 10, true);
			const compSize = view.getUint32(ptr + 20, true);
			const nameLen = view.getUint16(ptr + 28, true);
			const extraLen = view.getUint16(ptr + 30, true);
			const commentLen = view.getUint16(ptr + 32, true);
			const localHeaderOffset = view.getUint32(ptr + 42, true);

			const entryName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
			ptr += 46 + nameLen + extraLen + commentLen;

			if (entryName.endsWith('/')) continue;
			if (
				localHeaderOffset + 30 > bytes.length ||
				view.getUint32(localHeaderOffset, true) !== 0x04034b50
			) {
				continue;
			}
			const localNameLen = view.getUint16(localHeaderOffset + 26, true);
			const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
			const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
			const rawSlice = bytes.subarray(dataStart, dataStart + compSize);

			let fileBytes: Uint8Array;
			if (method === 0) {
				fileBytes = rawSlice;
			} else if (method === 8) {
				fileBytes = await inflateRawBytes(rawSlice);
			} else {
				continue;
			}

			if (entryName === 'episode.json' || entryName.endsWith('/episode.json')) {
				parsedEpisode = JSON.parse(decoder.decode(fileBytes)) as VnEpisodeDocument;
			} else {
				const copyBuf = new Uint8Array(fileBytes.byteLength);
				copyBuf.set(fileBytes);
				const blob = new Blob([copyBuf], { type: guessMimeType(entryName) });
				const objUrl = URL.createObjectURL(blob);
				createdObjectUrls.push(objUrl);
				blobUrlByRelPath.set(entryName.replace(/\\/g, '/'), objUrl);
			}
		}

		if (!parsedEpisode) {
			throw new Error('Archive does not contain episode.json.');
		}
		return parsedEpisode;
	}

	function resolveBundledAsset(rawPath: string | null | undefined): string | null {
		if (!rawPath || !rawPath.trim()) return null;
		const trimmed = rawPath.trim();
		const mappedRel = episode?.archive_asset_map?.[trimmed];
		if (mappedRel) {
			const hit = blobUrlByRelPath.get(mappedRel.replace(/\\/g, '/'));
			if (hit) return hit;
		}
		const directHit = blobUrlByRelPath.get(trimmed.replace(/\\/g, '/'));
		if (directHit) return directHit;

		const baseName = trimmed.split(/[\\/]/).pop() ?? '';
		if (baseName) {
			for (const [relKey, url] of blobUrlByRelPath.entries()) {
				if (relKey.endsWith(`/${baseName}`) || relKey === baseName) {
					return url;
				}
			}
		}

		if (
			trimmed.startsWith('http://') ||
			trimmed.startsWith('https://') ||
			trimmed.startsWith('/') ||
			trimmed.startsWith('blob:') ||
			trimmed.startsWith('data:')
		) {
			return trimmed;
		}
		return null;
	}

	let stageBackdropUrl = $derived.by<string | null>(() => {
		return (
			resolveBundledAsset(currentNode?.backdrop_path) ??
			resolveBundledAsset(episode?.default_backdrop_path) ??
			fallbackBackdropUrl
		);
	});

	let speakerPortraitUrl = $derived.by<string | null>(() => {
		return resolveBundledAsset(activeSpeaker?.portrait_path);
	});

	function unlockNodeDiscoveries(node: VnDialogueNode | null) {
		if (!node) return;
		if (node.unlock_tip_ids?.length) {
			const next = new Set(unlockedTipIds);
			for (const id of node.unlock_tip_ids) {
				if (id) next.add(id);
			}
			unlockedTipIds = Array.from(next);
		}
		if (node.unlock_shard_id) {
			if (!unlockedShardIds.includes(node.unlock_shard_id)) {
				unlockedShardIds = [...unlockedShardIds, node.unlock_shard_id];
			}
		}
	}

	function playCurrentVoice() {
		if (!currentNode) return;
		if (voiceAudio) {
			voiceAudio.pause();
			voiceAudio = null;
			voicePlaying = false;
		}
		const rawVoice =
			lang === 'en'
				? currentNode.voice_en_path || currentNode.voice_vi_path
				: currentNode.voice_vi_path || currentNode.voice_en_path;
		const src = resolveBundledAsset(rawVoice);
		if (!src) return;

		const audio = new Audio(src);
		audio.volume = 0.95;
		audio.onplay = () => {
			voicePlaying = true;
		};
		audio.onended = () => {
			voicePlaying = false;
		};
		audio.onerror = () => {
			voicePlaying = false;
		};
		voiceAudio = audio;
		void audio.play().catch(() => {
			voicePlaying = false;
		});
	}

	function syncBgmForNode(node: VnDialogueNode | null) {
		const desired =
			resolveBundledAsset(node?.bgm_override_path) ?? resolveBundledAsset(episode?.bgm_path);
		if (!desired) return;
		if (bgmAudio && activeBgmSrc === desired) {
			bgmAudio.muted = bgmMuted;
			return;
		}
		if (bgmAudio) {
			bgmAudio.pause();
			bgmAudio = null;
		}
		activeBgmSrc = desired;
		const bgm = new Audio(desired);
		bgm.loop = true;
		bgm.volume = 0.26;
		bgm.muted = bgmMuted;
		bgmAudio = bgm;
		void bgm.play().catch(() => {});
	}

	function goToNode(targetId: string, pushHistory = true) {
		if (!episode) return;
		const target = episode.nodes.find((n) => n.id === targetId);
		if (!target) return;
		if (pushHistory && currentNodeId) {
			historyIds = [...historyIds, currentNodeId];
		}
		activeHotspot = null;
		currentNodeId = target.id;
		unlockNodeDiscoveries(target);
		syncBgmForNode(target);
		if (autoVoice) {
			playCurrentVoice();
		}
	}

	function advanceLinear() {
		if (!currentNode) return;
		if (currentNode.choices && currentNode.choices.length > 0) return;
		if (currentNode.next_node_id) {
			goToNode(currentNode.next_node_id, true);
		}
	}

	function chooseOption(choice: VnChoiceOption) {
		if (choice.grant_shard_id && !unlockedShardIds.includes(choice.grant_shard_id)) {
			unlockedShardIds = [...unlockedShardIds, choice.grant_shard_id];
		}
		goToNode(choice.target_node_id, true);
	}

	function stepBack() {
		if (historyIds.length === 0) return;
		const prev = historyIds[historyIds.length - 1];
		historyIds = historyIds.slice(0, -1);
		goToNode(prev, false);
	}

	function restartEpisode() {
		if (!episode) return;
		historyIds = [];
		activeHotspot = null;
		const startId = episode.entry_node_id || episode.nodes[0]?.id || '';
		goToNode(startId, false);
	}

	function inspectHotspot(hs: VnHotspot) {
		activeHotspot = hs;
		if (hs.unlock_tip_id && !unlockedTipIds.includes(hs.unlock_tip_id)) {
			unlockedTipIds = [...unlockedTipIds, hs.unlock_tip_id];
		}
	}

	function toggleLanguage(nextLang: 'vi' | 'en') {
		if (lang === nextLang) return;
		lang = nextLang;
		if (autoVoice) {
			playCurrentVoice();
		}
	}

	function toggleBgmMute() {
		bgmMuted = !bgmMuted;
		if (bgmAudio) {
			bgmAudio.muted = bgmMuted;
		}
	}

	async function loadEpisodeBundle() {
		loading = true;
		loadError = null;
		try {
			const resp = await fetch(episodeUrl);
			if (!resp.ok) {
				throw new Error(`HTTP ${resp.status}`);
			}
			const buf = await resp.arrayBuffer();
			const bytes = new Uint8Array(buf);
			const isZip =
				bytes.length >= 4 &&
				bytes[0] === 0x50 &&
				bytes[1] === 0x4b &&
				bytes[2] === 0x03 &&
				bytes[3] === 0x04;

			const doc = isZip
				? await unpackZipBundle(buf)
				: (JSON.parse(new TextDecoder('utf-8').decode(bytes)) as VnEpisodeDocument);

			episode = doc;
			const firstId = doc.entry_node_id || doc.nodes?.[0]?.id || '';
			currentNodeId = firstId;
			const startNode = doc.nodes?.find((n) => n.id === firstId) ?? doc.nodes?.[0] ?? null;
			unlockNodeDiscoveries(startNode);
			syncBgmForNode(startNode);
			if (autoVoice && startNode) {
				setTimeout(() => playCurrentVoice(), 120);
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function cleanupMedia() {
		if (voiceAudio) {
			voiceAudio.pause();
			voiceAudio = null;
		}
		if (bgmAudio) {
			bgmAudio.pause();
			bgmAudio = null;
		}
		for (const u of createdObjectUrls) {
			URL.revokeObjectURL(u);
		}
		createdObjectUrls = [];
		blobUrlByRelPath.clear();
	}

	onMount(() => {
		void loadEpisodeBundle();
		const onKey = (ev: KeyboardEvent) => {
			if (ev.key === 'Escape') {
				onclose();
			} else if (ev.key === ' ' || ev.key === 'Enter') {
				if (codexTab === 'none' && !activeHotspot && !(currentNode?.choices?.length)) {
					ev.preventDefault();
					advanceLinear();
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	onDestroy(() => {
		cleanupMedia();
	});
</script>

<div class="vn-modal-overlay" role="dialog" aria-modal="true" aria-label={fallbackTitle ?? 'Visual Novel'}>
	<div class="vn-stage-shell">
		{#if stageBackdropUrl}
			<img src={stageBackdropUrl} alt="" class="vn-backdrop" />
		{/if}
		<div class="vn-vignette"></div>

		<header class="vn-topbar">
			<div class="vn-brand">
				<span class="vn-pill">Visual Novel 3D</span>
				<h2>
					{#if episode}
						{lang === 'en' ? episode.title_en || episode.title_vi : episode.title_vi}
					{:else}
						{fallbackTitle ?? (lang === 'en' ? 'Visual Novel Episode' : 'Tập Visual Novel')}
					{/if}
				</h2>
			</div>

			<div class="vn-controls">
				<div class="lang-switch">
					<button
						type="button"
						class:active={lang === 'vi'}
						onclick={() => toggleLanguage('vi')}
					>
						VI
					</button>
					<button
						type="button"
						class:active={lang === 'en'}
						onclick={() => toggleLanguage('en')}
					>
						EN
					</button>
				</div>

				<button
					type="button"
					class="vn-tool-btn"
					class:active={voicePlaying}
					onclick={() => playCurrentVoice()}
					title={lang === 'en' ? 'Replay Voiceover' : 'Nghe lại giọng lồng tiếng'}
				>
					🔊 {lang === 'en' ? 'Voice' : 'Giọng đọc'}
				</button>

				<button
					type="button"
					class="vn-tool-btn"
					class:active={!bgmMuted}
					onclick={toggleBgmMute}
				>
					{bgmMuted ? '🔇 BGM' : '🎵 BGM'}
				</button>

				<button
					type="button"
					class="vn-tool-btn"
					class:active={codexTab === 'tips'}
					onclick={() => (codexTab = codexTab === 'tips' ? 'none' : 'tips')}
				>
					📘 TIPS ({unlockedTips.length}/{episode?.tips?.length ?? 0})
				</button>

				<button
					type="button"
					class="vn-tool-btn"
					class:active={codexTab === 'shards'}
					onclick={() => (codexTab = codexTab === 'shards' ? 'none' : 'shards')}
				>
					✦ {lang === 'en' ? 'Shards' : 'Ký Ức'} ({unlockedShards.length}/{episode?.memory_shards?.length ?? 0})
				</button>

				<button type="button" class="vn-tool-btn" onclick={restartEpisode}>
					↺ {lang === 'en' ? 'Restart' : 'Từ đầu'}
				</button>

				<button type="button" class="vn-close-btn" onclick={onclose} aria-label="Close">
					✕
				</button>
			</div>
		</header>

		{#if loading}
			<div class="vn-center-card">
				<div class="vn-spinner"></div>
				<p>{lang === 'en' ? 'Unpacking Visual Novel stage & voiceover...' : 'Đang mở gói Trường quay Visual Novel & giọng lồng tiếng...'}</p>
			</div>
		{:else if loadError || !episode || !currentNode}
			<div class="vn-center-card">
				<h3>{lang === 'en' ? 'Unable to open Visual Novel pack' : 'Không đọc được gói Visual Novel'}</h3>
				<p>{loadError ?? 'Empty episode'}</p>
				<button type="button" class="vn-choice-btn" onclick={onclose}>
					{lang === 'en' ? 'Return to World' : 'Quay lại Thế Giới'}
				</button>
			</div>
		{:else}
			<!-- Relic Inspection Hotspots -->
			{#if currentNode.hotspots && currentNode.hotspots.length > 0}
				<div class="vn-hotspot-layer">
					{#each currentNode.hotspots as hs (hs.id)}
						<button
							type="button"
							class="vn-hotspot-pin"
							style="left: {hs.x_pct}%; top: {hs.y_pct}%;"
							onclick={() => inspectHotspot(hs)}
						>
							<span class="pin-ring"></span>
							<span class="pin-label">{lang === 'en' ? hs.label_en : hs.label_vi}</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if speakerPortraitUrl}
				<div class="vn-portrait-wrap">
					<img src={speakerPortraitUrl} alt="" class="vn-portrait" />
				</div>
			{/if}

			{#if activeHotspot}
				<aside class="vn-inspect-card">
					<div class="inspect-head">
						<span class="vn-pill">{lang === 'en' ? 'Relic Inspection' : 'Soi Cổ Vật'}</span>
						<button type="button" class="vn-mini-close" onclick={() => (activeHotspot = null)}>✕</button>
					</div>
					<h3>{lang === 'en' ? activeHotspot.label_en : activeHotspot.label_vi}</h3>
					<p>{lang === 'en' ? activeHotspot.inspect_en : activeHotspot.inspect_vi}</p>
				</aside>
			{/if}

			{#if codexTab !== 'none'}
				<aside class="vn-codex-drawer">
					<div class="inspect-head">
						<h3>
							{codexTab === 'tips'
								? lang === 'en'
									? 'Unlocked Lore TIPS'
									: 'Thẻ Tri Thức TIPS Đã Mở'
								: lang === 'en'
									? 'Recovered Memory Shards'
									: 'Mảnh Ký Ức Thu Thập'}
						</h3>
						<button type="button" class="vn-mini-close" onclick={() => (codexTab = 'none')}>✕</button>
					</div>
					{#if codexTab === 'tips'}
						{#if unlockedTips.length === 0}
							<p class="codex-empty">
								{lang === 'en'
									? 'Inspect glowing hotspots or continue reading to unlock lore notes.'
									: 'Chạm vào các điểm sáng cổ vật hoặc đọc tiếp thoại để mở thẻ tri thức.'}
							</p>
						{:else}
							<div class="codex-list">
								{#each unlockedTips as tip (tip.id)}
									<article class="codex-entry">
										<h4>{lang === 'en' ? tip.term_en : tip.term_vi}</h4>
										<p>{lang === 'en' ? tip.body_en : tip.body_vi}</p>
									</article>
								{/each}
							</div>
						{/if}
					{:else if unlockedShards.length === 0}
						<p class="codex-empty">
							{lang === 'en'
								? 'Make branching choices to recover hidden memory shards.'
								: 'Đưa ra lựa chọn ở các ngã rẽ để thu thập Mảnh Ký Ức ẩn.'}
						</p>
					{:else}
						<div class="codex-list">
							{#each unlockedShards as sh (sh.id)}
								<article class="codex-entry shard">
									<h4>✦ {lang === 'en' ? sh.title_en : sh.title_vi}</h4>
									<p>{lang === 'en' ? sh.echo_en : sh.echo_vi}</p>
								</article>
							{/each}
						</div>
					{/if}
				</aside>
			{/if}

			{#if currentNode.choices && currentNode.choices.length > 0}
				<div class="vn-choices-rack">
					{#each currentNode.choices as ch (ch.id)}
						<button type="button" class="vn-choice-btn" onclick={() => chooseOption(ch)}>
							<span class="choice-diamond">◆</span>
							<span>{lang === 'en' ? ch.label_en : ch.label_vi}</span>
						</button>
					{/each}
				</div>
			{/if}

			<footer class="vn-dialogue-box">
				<div class="vn-speaker-row">
					<span
						class="vn-speaker-badge"
						style="--spk-color: {activeSpeaker?.accent_color ?? '#6ee7b7'};"
					>
						{#if activeSpeaker}
							{lang === 'en' ? activeSpeaker.name_en : activeSpeaker.name_vi}
						{:else}
							{currentNode.speaker_id}
						{/if}
					</span>
					{#if currentNode.expression}
						<span class="vn-expr-tag">{currentNode.expression}</span>
					{/if}
				</div>

				<p class="vn-dialogue-text">
					{lang === 'en' ? currentNode.text_en || currentNode.text_vi : currentNode.text_vi}
				</p>

				<div class="vn-dialogue-footer">
					<button
						type="button"
						class="vn-nav-btn"
						disabled={historyIds.length === 0}
						onclick={stepBack}
					>
						← {lang === 'en' ? 'Back' : 'Lùi lại'}
					</button>

					{#if !(currentNode.choices && currentNode.choices.length > 0)}
						{#if currentNode.next_node_id}
							<button type="button" class="vn-nav-btn primary" onclick={advanceLinear}>
								{lang === 'en' ? 'Continue →' : 'Tiếp tục →'}
							</button>
						{:else}
							<button type="button" class="vn-nav-btn finish" onclick={onclose}>
								✦ {lang === 'en' ? 'End Episode' : 'Khép lại cảnh'}
							</button>
						{/if}
					{:else}
						<span class="vn-branch-hint">
							{lang === 'en' ? 'Choose a path above' : 'Chọn một hướng rẽ phía trên'}
						</span>
					{/if}
				</div>
			</footer>
		{/if}
	</div>
</div>

<style>
	.vn-modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgba(3, 7, 15, 0.88);
		backdrop-filter: blur(12px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.vn-stage-shell {
		position: relative;
		width: min(92vw, 76rem);
		height: min(88vh, 46rem);
		border-radius: 18px;
		overflow: hidden;
		background: #050b16;
		border: 1px solid rgba(110, 231, 183, 0.32);
		box-shadow: 0 28px 80px rgba(0, 0, 0, 0.72);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		color: #f8fafc;
	}
	.vn-backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 0;
	}
	.vn-vignette {
		position: absolute;
		inset: 0;
		z-index: 1;
		background:
			linear-gradient(180deg, rgba(4, 9, 20, 0.72) 0%, rgba(4, 9, 20, 0.14) 38%, rgba(4, 9, 20, 0.88) 100%);
		pointer-events: none;
	}
	.vn-topbar {
		position: relative;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.85rem 1.15rem;
		background: rgba(6, 12, 24, 0.72);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
	}
	.vn-brand {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	.vn-brand h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}
	.vn-pill {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: rgba(16, 185, 129, 0.2);
		border: 1px solid rgba(110, 231, 183, 0.45);
		color: #6ee7b7;
	}
	.vn-controls {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.lang-switch {
		display: inline-flex;
		border-radius: 999px;
		padding: 0.14rem;
		background: rgba(15, 23, 42, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.15);
	}
	.lang-switch button {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.22rem 0.55rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.lang-switch button.active {
		background: #059669;
		color: #fff;
	}
	.vn-tool-btn {
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(15, 23, 42, 0.72);
		color: #cbd5e1;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.vn-tool-btn.active,
	.vn-tool-btn:hover {
		border-color: #6ee7b7;
		color: #ecfdf5;
	}
	.vn-close-btn {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(15, 23, 42, 0.8);
		color: #f1f5f9;
		cursor: pointer;
	}
	.vn-center-card {
		position: relative;
		z-index: 4;
		margin: auto;
		padding: 2rem;
		border-radius: 16px;
		background: rgba(8, 15, 28, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.12);
		text-align: center;
		max-width: 28rem;
	}
	.vn-spinner {
		width: 2rem;
		height: 2rem;
		margin: 0 auto 0.8rem;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.18);
		border-top-color: #34d399;
		animation: vnspin 0.8s linear infinite;
	}
	@keyframes vnspin {
		to {
			transform: rotate(360deg);
		}
	}
	.vn-hotspot-layer {
		position: absolute;
		inset: 3.5rem 0 11.5rem 0;
		z-index: 3;
		pointer-events: none;
	}
	.vn-hotspot-pin {
		position: absolute;
		transform: translate(-50%, -50%);
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		background: rgba(6, 18, 32, 0.82);
		border: 1px solid rgba(251, 191, 36, 0.75);
		color: #fde68a;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 0 18px rgba(251, 191, 36, 0.35);
	}
	.pin-ring {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: #fbbf24;
	}
	.vn-portrait-wrap {
		position: absolute;
		right: 4%;
		bottom: 10.5rem;
		z-index: 2;
		max-height: 58%;
		pointer-events: none;
	}
	.vn-portrait {
		max-height: 24rem;
		object-fit: contain;
		filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.65));
	}
	.vn-inspect-card,
	.vn-codex-drawer {
		position: absolute;
		top: 4.3rem;
		right: 1.2rem;
		z-index: 6;
		width: min(24rem, calc(100% - 2.4rem));
		max-height: calc(100% - 16rem);
		overflow-y: auto;
		padding: 1rem 1.15rem;
		border-radius: 14px;
		background: rgba(8, 15, 28, 0.92);
		border: 1px solid rgba(110, 231, 183, 0.38);
		backdrop-filter: blur(14px);
	}
	.inspect-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.55rem;
	}
	.inspect-head h3,
	.vn-inspect-card h3 {
		margin: 0.25rem 0 0.45rem;
		font-size: 0.98rem;
	}
	.vn-inspect-card p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.6;
		color: #e2e8f0;
	}
	.vn-mini-close {
		background: transparent;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		font-size: 1rem;
	}
	.codex-empty {
		font-size: 0.83rem;
		color: #94a3b8;
		line-height: 1.55;
	}
	.codex-list {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	.codex-entry {
		padding: 0.65rem 0.8rem;
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.78);
		border-left: 3px solid #34d399;
	}
	.codex-entry.shard {
		border-left-color: #38bdf8;
	}
	.codex-entry h4 {
		margin: 0 0 0.3rem;
		font-size: 0.86rem;
		color: #ecfdf5;
	}
	.codex-entry p {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.55;
		color: #cbd5e1;
	}
	.vn-choices-rack {
		position: relative;
		z-index: 5;
		margin: auto auto 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		width: min(38rem, calc(100% - 2.5rem));
	}
	.vn-choice-btn {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.75rem 1.1rem;
		border-radius: 12px;
		background: rgba(10, 20, 36, 0.88);
		border: 1px solid rgba(110, 231, 183, 0.45);
		color: #f8fafc;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
		transition: transform 0.15s, background 0.15s;
	}
	.vn-choice-btn:hover {
		background: rgba(16, 185, 129, 0.24);
		transform: translateY(-1px);
	}
	.choice-diamond {
		color: #6ee7b7;
	}
	.vn-dialogue-box {
		position: relative;
		z-index: 5;
		margin: 0 1rem 1rem;
		padding: 1.05rem 1.35rem;
		border-radius: 16px;
		background: rgba(7, 13, 25, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.14);
		backdrop-filter: blur(16px);
	}
	.vn-speaker-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.5rem;
	}
	.vn-speaker-badge {
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--spk-color, #6ee7b7);
	}
	.vn-expr-tag {
		font-size: 0.68rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		color: #94a3b8;
	}
	.vn-dialogue-text {
		margin: 0 0 0.85rem;
		font-size: 1rem;
		line-height: 1.68;
		color: #f1f5f9;
		min-height: 3.2rem;
	}
	.vn-dialogue-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.vn-nav-btn {
		padding: 0.42rem 0.95rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(15, 23, 42, 0.75);
		color: #cbd5e1;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.vn-nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.vn-nav-btn.primary {
		background: linear-gradient(135deg, #059669, #10b981);
		border-color: transparent;
		color: #fff;
	}
	.vn-nav-btn.finish {
		background: rgba(56, 189, 248, 0.22);
		border-color: rgba(56, 189, 248, 0.55);
		color: #bae6fd;
	}
	.vn-branch-hint {
		font-size: 0.78rem;
		color: #94a3b8;
	}
</style>
