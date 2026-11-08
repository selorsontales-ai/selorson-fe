<script lang="ts">
	/**
	 * The studio workspace: toolbar, item list, canvas, inspector, 3D preview.
	 *
	 * This is the dynamic-import boundary — Svelte Flow and Three.js are only
	 * ever reached through here, so the rest of the admin loads none of it.
	 */
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { onDestroy, onMount } from 'svelte';
	import { toast_error, toast_success } from '$lib/stores/admin.svelte';
	import { fetchAssets } from '$lib/world-assets/api';
	import type { WorldAsset } from '$lib/world-assets/types';
	import type { ResolvedAsset, WorldNode } from '$lib/world/types';
	import { fetchRevisions, publishWorld, restoreRevision } from './api';
	import Inspector from './Inspector.svelte';
	import StudioCanvas from './StudioCanvas.svelte';
	import { regionSlugOf, Studio } from './studio.svelte';
	import {
		KIND_COLORS,
		KIND_ICONS,
		KIND_LABELS,
		type BorderTool,
		type RevisionSummary,
		type StudioMode,
		type StudioNodeKind
	} from './types';

	const studio = new Studio();
	onDestroy(() => studio.dispose());

	let mode = $state<StudioMode>('map');
	let visibleKinds = $state<StudioNodeKind[]>([]);
	let focus = $state(false);
	let borderTool = $state<BorderTool>('none');
	let borderTarget = $state<string | null>(null);
	let backdropOpacity = $state(0.8);
	let search = $state('');
	let showPreview = $state(false);
	let showHistory = $state(false);
	let mobileListOpen = $state(false);
	let mobileInspectorOpen = $state(false);
	let revisions = $state<RevisionSummary[]>([]);
	let canvas = $state<StudioCanvas | undefined>();
	let PreviewCanvas = $state<typeof import('$lib/world/engine/WorldCanvas.svelte').default | null>(
		null
	);

	/** Focus mode earns its keep above this many nodes; below it, hiding confuses. */
	const FOCUS_AUTO_THRESHOLD = 80;

	/**
	 * Asset catalogue, kept here so the 3D preview can resolve slot bindings the
	 * same way the server does for readers. Without it the author would bind a
	 * model and see no change, which reads as the binding not working.
	 */
	let assetsBySlug = $state(new Map<string, WorldAsset>());

	onMount(async () => {
		await studio.load();
		if (studio.entries.length > FOCUS_AUTO_THRESHOLD) focus = true;
		const catalogue = await fetchAssets();
		assetsBySlug = new Map(catalogue.assets.map((a) => [a.slug, a]));
	});

	function resolveBindings(
		bindings: Record<string, string> | undefined
	): Record<string, ResolvedAsset> | undefined {
		if (!bindings) return undefined;
		const out: Record<string, ResolvedAsset> = {};
		for (const [slot, slug] of Object.entries(bindings)) {
			const asset = assetsBySlug.get(slug);
			if (!asset) continue;
			out[slot] = {
				url: asset.file_url,
				format: asset.file_format,
				transform: asset.transform,
				v: Math.floor(new Date(asset.updated_at).getTime() / 1000)
			};
		}
		return Object.keys(out).length ? out : undefined;
	}

	let filtered = $derived(
		studio.entries.filter((e) => {
			if (visibleKinds.length && !visibleKinds.includes(e.kind)) return false;
			if (!search.trim()) return true;
			return e.item.name.toLowerCase().includes(search.trim().toLowerCase());
		})
	);

	let unplacedLocationsCount = $derived(
		studio.entries.filter(
			(e) =>
				(e.kind === 'region' || e.kind === 'place') &&
				(typeof e.layout?.lat !== 'number' || typeof e.layout?.lng !== 'number')
		).length
	);

	function toggleKind(kind: StudioNodeKind) {
		visibleKinds = visibleKinds.includes(kind)
			? visibleKinds.filter((k) => k !== kind)
			: [...visibleKinds, kind];
	}

	function handleSelectBorderRegion(slugValue: string) {
		const slug = slugValue || null;
		borderTarget = slug;
		if (!slug) return;
		const matched = studio.regions.find((r) => regionSlugOf(r) === slug);
		if (matched && !matched.layout?.slug) {
			studio.patchNode(matched.item.id, { slug });
		}
	}

	function handleAutoPlaceAll() {
		const placedCount = studio.autoPlaceUnplacedLocations();
		if (placedCount > 0) {
			toast_success(`Đã tự dàn tọa độ gợi ý cho ${placedCount} địa danh/vùng đất.`);
		} else {
			toast_success('Tất cả địa danh và vùng đất đều đã có tọa độ.');
		}
	}

	/**
	 * Lay the graph out by hand-off to dagre.
	 *
	 * Only ever on request. Running it automatically would overwrite the
	 * arrangement the author built, and spatial memory — "Sindark is top right" —
	 * is what makes a node editor usable at all.
	 */
	async function tidyGraph() {
		const dagre = await import('@dagrejs/dagre');
		const graph = new dagre.graphlib.Graph();
		graph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 120 });
		graph.setDefaultEdgeLabel(() => ({}));

		for (const entry of studio.entries) {
			graph.setNode(String(entry.item.id), { width: 180, height: 44 });
		}
		for (const edge of studio.doc.edges) {
			if (studio.byId.has(edge.source) && studio.byId.has(edge.target)) {
				graph.setEdge(String(edge.source), String(edge.target));
			}
		}
		dagre.layout(graph);

		for (const entry of studio.entries) {
			const node = graph.node(String(entry.item.id));
			if (node) {
				studio.patchNode(entry.item.id, {
					graph: { x: Math.round(node.x), y: Math.round(node.y) }
				});
			}
		}
		toast_success('Đã dọn gọn đồ thị');
	}

	async function doPublish() {
		await studio.save();
		if (studio.saveState === 'conflict' || studio.saveState === 'error') {
			toast_error(studio.saveMessage ?? 'Chưa lưu được bản nháp');
			return;
		}
		const res = await publishWorld(studio.draftUpdatedAt);
		if (res.success) {
			toast_success(`Đã publish. Đồng bộ ${res.data.links_synced} liên kết.`);
			studio.publishedAt = res.data.published_at;
			studio.adoptTimestamp(res.data.draft_updated_at);
			revisions = await fetchRevisions();
		} else {
			toast_error('Publish thất bại');
		}
	}

	async function openHistory() {
		showHistory = !showHistory;
		if (showHistory) revisions = await fetchRevisions();
	}

	async function doRestore(id: number) {
		if (!confirm('Kéo phiên bản này về bản nháp? Bản nháp hiện tại sẽ bị thay.')) return;
		const res = await restoreRevision(id, studio.draftUpdatedAt);
		if (res.success) {
			studio.adoptDoc(res.data.doc, res.data.updated_at);
			toast_success('Đã khôi phục vào bản nháp');
		} else {
			toast_error('Khôi phục thất bại');
		}
	}

	async function togglePreview() {
		showPreview = !showPreview;
		if (showPreview && !PreviewCanvas) {
			PreviewCanvas = (await import('$lib/world/engine/WorldCanvas.svelte')).default;
		}
	}

	/** The draft, shaped as the reader-facing engine expects it. */
	let previewNodes = $derived(
		studio.placed.map((entry) => {
			const layout = entry.layout ?? {};
			return {
				id: entry.item.id,
				slug: (layout.slug as string) ?? String(entry.item.id),
				name: entry.item.name,
				category: entry.item.category,
				kind: layout.kind ?? (entry.kind === 'region' ? 'region' : 'poi'),
				region: (layout.region as string) ?? null,
				lat: layout.lat as number,
				lng: layout.lng as number,
				alt: (layout.alt as number) ?? 0,
				terrain: (layout.terrain as string) ?? null,
				scene: (layout.scene as string) ?? 'orbit',
				// The author sees their own world whole — reveal gating is a
				// reader concern and would only get in the way here.
				state: 'revealed',
				v: 0,
				description: entry.item.description,
				image_url: entry.item.image_url,
				chapters: [],
				palette: layout.palette as string[] | undefined,
				assets: resolveBindings(layout.assets as Record<string, string> | undefined)
			} as WorldNode & { lat: number; lng: number };
		})
	);

	let previewQuality = $state<import('$lib/world/quality').QualitySettings | null>(null);
	$effect(() => {
		if (showPreview && !previewQuality) {
			import('$lib/world/quality').then(({ resolveQuality }) => {
				previewQuality = resolveQuality();
			});
		}
	});

	let saveLabel = $derived(
		{
			idle: 'Đã đồng bộ',
			dirty: 'Có thay đổi chưa lưu',
			saving: 'Đang lưu…',
			saved: 'Đã lưu nháp',
			conflict: 'Xung đột — cần tải lại',
			error: 'Lưu lỗi'
		}[studio.saveState]
	);
</script>

<div class="studio">
	<header class="toolbar">
		<div class="modes">
			<button
				type="button"
				class="mobile-drawer-toggle"
				class:on={mobileListOpen}
				onclick={() => {
					mobileListOpen = !mobileListOpen;
					if (mobileListOpen) mobileInspectorOpen = false;
				}}
				title="Danh sách thực thể"
			>
				📋 Danh sách
			</button>
			<button class:on={mode === 'map'} onclick={() => (mode = 'map')}>🗺️ Bản đồ</button>
			<button class:on={mode === 'graph'} onclick={() => (mode = 'graph')}>🕸️ Đồ thị</button>
			<button
				type="button"
				class="mobile-drawer-toggle"
				class:on={mobileInspectorOpen}
				onclick={() => {
					mobileInspectorOpen = !mobileInspectorOpen;
					if (mobileInspectorOpen) mobileListOpen = false;
				}}
				title="Thuộc tính mục đang chọn"
			>
				⚙️ Thuộc tính
			</button>
		</div>

		<div class="filters">
			{#each Object.keys(KIND_LABELS) as kind (kind)}
				{@const k = kind as StudioNodeKind}
				<button
					class="chip"
					class:on={visibleKinds.length === 0 || visibleKinds.includes(k)}
					style="--c:{KIND_COLORS[k]}"
					onclick={() => toggleKind(k)}
					title={KIND_LABELS[k]}
				>
					{KIND_ICONS[k]}
				</button>
			{/each}
			<button class="chip wide" class:on={focus} onclick={() => (focus = !focus)}>
				Tập trung
			</button>
			<button
				class="chip wide"
				class:on={studio.showDraftItems}
				onclick={() => (studio.showDraftItems = !studio.showDraftItems)}
				title="Hiển thị cả các thực thể Nháp đồng bộ từ Co-Writer"
			>
				{studio.showDraftItems ? '👁️ Cả mục Nháp' : '✓ Chỉ mục đã duyệt'}
			</button>
		</div>

		{#if mode === 'map'}
			<div class="border-tools">
				<select
					value={borderTarget ?? ''}
					onchange={(e) => handleSelectBorderRegion(e.currentTarget.value)}
				>
					<option value="">— chọn vùng để vẽ ranh giới —</option>
					{#each studio.regions as region (region.item.id)}
						<option value={regionSlugOf(region)}>{region.item.name}</option>
					{/each}
				</select>
				<button
					class="chip wide"
					class:on={borderTool === 'draw'}
					disabled={!borderTarget}
					onclick={() => (borderTool = borderTool === 'draw' ? 'none' : 'draw')}
				>
					✏️ Vẽ
				</button>
				<button
					class="chip wide"
					class:on={borderTool === 'edit'}
					disabled={!borderTarget}
					onclick={() => (borderTool = borderTool === 'edit' ? 'none' : 'edit')}
				>
					⚙️ Sửa đỉnh
				</button>
				{#if borderTool === 'draw'}
					<button class="chip wide" onclick={() => canvas?.undoVertex()}>↶ Bỏ đỉnh</button>
					<button class="chip wide" onclick={() => canvas?.commitRing()}>✓ Đóng vòng</button>
					<button class="chip wide" onclick={() => canvas?.cancelRing()}>✕ Huỷ</button>
				{:else if borderTool === 'edit'}
					<button class="chip wide" onclick={() => canvas?.deleteSelectedVertex()}>
						🗑 Xoá đỉnh
					</button>
				{/if}
				{#if unplacedLocationsCount > 0}
					<button
						class="chip wide"
						onclick={handleAutoPlaceAll}
						title="Tự động dàn tọa độ gợi ý cho các địa danh/vùng đất chưa xếp"
					>
						🧭 Dàn tọa độ ({unplacedLocationsCount})
					</button>
				{/if}
				<label class="opacity">
					Nền
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						bind:value={backdropOpacity}
					/>
				</label>
			</div>
		{:else}
			<button class="chip wide" onclick={tidyGraph}>🧹 Dọn gọn</button>
		{/if}

		<div class="spacer"></div>

		<span class="save-state" class:warn={studio.saveState === 'conflict' || studio.saveState === 'error'}>
			{saveLabel}
		</span>
		<button class="chip wide" onclick={() => studio.save()}>💾 Lưu</button>
		<button class="chip wide" class:on={showPreview} onclick={togglePreview}>👁 Xem 3D</button>
		<button class="chip wide" onclick={openHistory}>🕘 Lịch sử</button>
		<button class="publish" onclick={doPublish}>Publish</button>
	</header>

	{#if studio.saveState === 'conflict'}
		<div class="banner">
			{studio.saveMessage}
			<button onclick={() => studio.load()}>Tải lại bản nháp</button>
		</div>
	{/if}

	<div class="body" class:mobile-inspector-open={mobileInspectorOpen}>
		<aside class="list" class:mobile-open={mobileListOpen}>
			<input class="search" placeholder="Tìm trong thư viện…" bind:value={search} />
			<ul>
				{#each filtered as entry (entry.item.id)}
					<li>
						<button
							class="item"
							class:on={studio.selectedId === entry.item.id}
							style="--c:{KIND_COLORS[entry.kind]}"
							onclick={() => {
								studio.selectedId = entry.item.id;
								mobileListOpen = false;
							}}
						>
							<span class="item-icon">{KIND_ICONS[entry.kind]}</span>
							<span class="item-name">{entry.item.name}</span>
							{#if !entry.item.is_active}
								<span class="draft-pill" title="Mục nháp (chưa bật xuất bản)">Nháp</span>
							{/if}
							{#if typeof entry.layout?.lat !== 'number'}
								<span class="unplaced" title="Chưa có toạ độ">○</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
			<p class="count">{filtered.length}/{studio.entries.length} mục</p>
		</aside>

		<main class="stage">
			{#if studio.loading}
				<div class="stage-msg">Đang tải bản nháp…</div>
			{:else if studio.loadError}
				<div class="stage-msg">{studio.loadError}</div>
			{:else}
				<SvelteFlowProvider>
					<StudioCanvas
						bind:this={canvas}
						{studio}
						{mode}
						{visibleKinds}
						{focus}
						{borderTool}
						{borderTarget}
						{backdropOpacity}
						onmessage={(text) => toast_success(text)}
					/>
				</SvelteFlowProvider>
			{/if}

			{#if showPreview && PreviewCanvas && previewQuality}
				<div class="preview">
					<span class="preview-title">Xem trước bản nháp</span>
					<PreviewCanvas
						nodes={previewNodes}
						quality={previewQuality}
						selected={studio.selected
							? (previewNodes.find((n) => n.id === studio.selectedId) ?? null)
							: null}
						onselect={(node) => (studio.selectedId = node?.id ?? null)}
					/>
				</div>
			{/if}

			{#if showHistory}
				<div class="history">
					<header>
						<strong>Lịch sử publish</strong>
						<button onclick={() => (showHistory = false)}>✕</button>
					</header>
					{#if revisions.length === 0}
						<p class="empty">Chưa publish lần nào.</p>
					{:else}
						<ul>
							{#each revisions as rev (rev.id)}
								<li>
									<div>
										<strong>{rev.label ?? `#${rev.id}`}</strong>
										<small>
											{new Date(rev.published_at).toLocaleString('vi-VN')} ·
											{rev.counts.nodes} nút · {rev.counts.borders} ranh giới ·
											{rev.counts.edges} liên kết
										</small>
									</div>
									<button onclick={() => doRestore(rev.id)}>Khôi phục</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</main>

		<Inspector
			{studio}
			onfocus3d={(id) => {
				studio.selectedId = id;
				if (!showPreview) togglePreview();
			}}
		/>
	</div>
</div>

<style>
	.studio {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 4rem);
		background: #060d16;
		color: #e2e8f0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(8, 14, 24, 0.95);
	}
	.spacer {
		flex: 1;
	}

	.modes button,
	.chip,
	.publish {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 0.35rem 0.6rem;
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.modes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.mobile-drawer-toggle {
		display: none;
	}
	.modes button.on {
		background: rgba(255, 183, 3, 0.18);
		border-color: #ffb703;
		color: #ffb703;
	}

	.filters,
	.border-tools {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.chip {
		--c: #64748b;
		min-width: 2rem;
		text-align: center;
		opacity: 0.45;
	}
	.chip.on {
		opacity: 1;
		border-color: var(--c);
	}
	.chip.wide {
		min-width: auto;
		opacity: 1;
	}
	.chip:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.chip:hover:not(:disabled) {
		border-color: #ffb703;
	}

	.border-tools select {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 6px;
		padding: 0.35rem;
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
		max-width: 13rem;
	}
	.opacity {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		color: #94a3b8;
	}
	.opacity input {
		width: 5rem;
		accent-color: #ffb703;
	}

	.save-state {
		font-size: 0.72rem;
		color: #94a3b8;
	}
	.save-state.warn {
		color: #f87171;
	}
	.publish {
		background: #0c713d;
		border-color: #0c713d;
		font-weight: 600;
		color: #fff;
	}
	.publish:hover {
		filter: brightness(1.2);
	}

	.banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.9rem;
		background: rgba(248, 113, 113, 0.15);
		border-bottom: 1px solid rgba(248, 113, 113, 0.4);
		font-size: 0.78rem;
	}
	.banner button {
		background: transparent;
		border: 1px solid #f87171;
		border-radius: 5px;
		color: #f87171;
		font: inherit;
		font-size: 0.72rem;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
	}

	.body {
		flex: 1;
		display: flex;
		min-height: 0;
		position: relative;
	}

	.list {
		width: 15.5rem;
		flex: none;
		display: flex;
		flex-direction: column;
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(8, 14, 24, 0.85);
	}
	.search {
		margin: 0.6rem;
		padding: 0.35rem 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 5px;
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
	}
	.list ul {
		list-style: none;
		margin: 0;
		padding: 0 0.4rem;
		overflow-y: auto;
		flex: 1;
	}
	.item {
		--c: #64748b;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		border-left: 3px solid var(--c);
		border-radius: 4px;
		padding: 0.3rem 0.45rem;
		margin-bottom: 0.15rem;
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.item:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.item.on {
		background: rgba(255, 183, 3, 0.16);
	}
	.item-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.draft-pill {
		font-size: 0.62rem;
		padding: 0.05rem 0.32rem;
		border-radius: 99px;
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
		border: 1px solid rgba(251, 191, 36, 0.35);
		flex: none;
	}
	.unplaced {
		color: #64748b;
		font-size: 0.7rem;
	}
	.count {
		margin: 0;
		padding: 0.4rem 0.6rem;
		font-size: 0.68rem;
		color: #94a3b8;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.stage-msg {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #94a3b8;
		font-size: 0.85rem;
	}

	.preview {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		width: min(22rem, calc(100% - 1.5rem));
		height: min(15rem, 45%);
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: #02050e;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
	}
	.preview-title {
		position: absolute;
		top: 0.4rem;
		left: 0.6rem;
		z-index: 2;
		font-size: 0.68rem;
		color: #94a3b8;
		pointer-events: none;
	}

	.history {
		position: absolute;
		right: 0.75rem;
		top: 0.75rem;
		width: min(23rem, calc(100% - 1.5rem));
		max-height: 60%;
		overflow-y: auto;
		background: rgba(8, 14, 24, 0.96);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 10px;
		padding: 0.75rem;
		font-size: 0.78rem;
		z-index: 25;
	}
	.history header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.history header button {
		background: none;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.history ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.history li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.history small {
		display: block;
		color: #94a3b8;
		font-size: 0.68rem;
		margin-top: 0.1rem;
	}
	.history li button {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 5px;
		padding: 0.25rem 0.5rem;
		color: inherit;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.history .empty {
		color: #94a3b8;
		margin: 0;
	}

	@media (max-width: 1100px) {
		.mobile-drawer-toggle {
			display: inline-flex;
			align-items: center;
		}
		.list {
			display: none;
			position: absolute;
			top: 0;
			left: 0;
			bottom: 0;
			width: min(17rem, 85vw);
			z-index: 30;
			background: rgba(8, 14, 24, 0.97);
			box-shadow: 12px 0 32px rgba(0, 0, 0, 0.55);
		}
		.list.mobile-open {
			display: flex;
		}
		.body :global(.inspector) {
			display: none;
			position: absolute;
			top: 0;
			right: 0;
			bottom: 0;
			width: min(21rem, 88vw);
			z-index: 30;
			background: rgba(8, 14, 24, 0.97);
			box-shadow: -12px 0 32px rgba(0, 0, 0, 0.55);
		}
		.body.mobile-inspector-open :global(.inspector) {
			display: block;
		}
	}
</style>
