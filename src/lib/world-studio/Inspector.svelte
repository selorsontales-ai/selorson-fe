<script lang="ts">
	/**
	 * Properties of the selected item.
	 *
	 * Layout only. Name, description and artwork stay in the ordinary library
	 * form — the two never write the same field, so neither can clobber the
	 * other. A link across is offered instead.
	 */
	import {
		NODE_KINDS,
		SCENE_KINDS,
		SCENE_LABELS,
		TERRAIN_KINDS,
		TERRAIN_LABELS
	} from '$lib/world/terrains';
	import type { WorldPart } from '$lib/world/types';
	import AssetSlots from './AssetSlots.svelte';
	import { regionSlugOf, slugify, type Studio } from './studio.svelte';
	import { EDGE_RULES, KIND_ICONS, KIND_LABELS } from './types';

	interface Props {
		studio: Studio;
		onfocus3d?: (id: number) => void;
	}

	let { studio, onfocus3d }: Props = $props();

	let entry = $derived(studio.selected);
	let layout = $derived(entry?.layout ?? {});
	let placed = $derived(typeof layout.lat === 'number' && typeof layout.lng === 'number');

	const PART_PRESETS = [
		{ id: 'base', label: 'Nền đá / Bệ móng' },
		{ id: 'body', label: 'Thân công trình chính' },
		{ id: 'roof', label: 'Mái vòm / Đỉnh mái' },
		{ id: 'spire', label: 'Ngọn tháp cao' },
		{ id: 'arch', label: 'Cổng vòm cổ' },
		{ id: 'crystal', label: 'Lõi tinh thể năng lượng' },
		{ id: 'ring', label: 'Vòng hào quang lơ lửng' },
		{ id: 'foliage', label: 'Thảm thực vật / Tán rừng' }
	];

	function patch(patchValue: Record<string, unknown>) {
		if (!entry) return;
		studio.patchNode(entry.item.id, patchValue);
	}

	function num(raw: string): number | undefined {
		if (raw.trim() === '') return undefined;
		const value = Number(raw);
		return Number.isFinite(value) ? value : undefined;
	}

	/** Place an unplaced item at its suggested coordinates (near parent region or deterministic spread). */
	function placeSuggested() {
		if (!entry) return;
		const coords = studio.suggestedCoordsFor(entry.item.id);
		patch({
			slug: layout.slug || slugify(entry.item.name, entry.item.id),
			lat: coords.lat,
			lng: coords.lng
		});
	}

	function handleSelectRegion(slugValue: string) {
		const slug = slugValue || undefined;
		if (slug) {
			const matched = studio.regions.find((r) => regionSlugOf(r) === slug);
			if (matched && !matched.layout?.slug) {
				studio.patchNode(matched.item.id, { slug });
			}
		}
		patch({ region: slug });
	}

	let partsMode = $state<'visual' | 'json'>('visual');
	let partsList = $state<WorldPart[]>([]);
	let partsText = $state('');
	let partsError = $state('');
	let partsFor = $state<number | null>(null);

	// Reseed the parts state when a different item is selected.
	$effect(() => {
		if (!entry || entry.item.id === partsFor) return;
		partsFor = entry.item.id;
		const rawParts = Array.isArray(layout.parts) ? (layout.parts as WorldPart[]) : [];
		partsList = rawParts.map((p) => ({
			id: p.id || 'body',
			label: p.label ?? '',
			lore: p.lore ?? '',
			chapter: p.chapter,
			dir: p.dir
		}));
		partsText = rawParts.length ? JSON.stringify(rawParts, null, 2) : '';
		partsError = '';
	});

	function syncVisualPartsToDoc(nextParts: WorldPart[]) {
		partsList = nextParts;
		const cleaned = nextParts
			.filter((p) => p.id.trim().length > 0)
			.map((p) => {
				const out: WorldPart = {
					id: p.id.trim(),
					label: p.label?.trim() || p.id.trim(),
					dir: p.dir ?? [0, 1.5, 0]
				};
				if (p.lore?.trim()) out.lore = p.lore.trim();
				if (typeof p.chapter === 'number' && Number.isFinite(p.chapter)) out.chapter = p.chapter;
				return out;
			});
		partsText = cleaned.length ? JSON.stringify(cleaned, null, 2) : '';
		patch({ parts: cleaned.length ? cleaned : undefined });
	}

	function addVisualPart(presetId = 'roof') {
		const preset = PART_PRESETS.find((p) => p.id === presetId);
		const next: WorldPart[] = [
			...partsList,
			{
				id: presetId,
				label: preset?.label ?? 'Bộ phận mới',
				dir: [0, 1.5, 0],
				lore: ''
			}
		];
		syncVisualPartsToDoc(next);
	}

	function updateVisualPart(index: number, partial: Partial<WorldPart>) {
		const next = partsList.map((item, i) => (i === index ? { ...item, ...partial } : item));
		syncVisualPartsToDoc(next);
	}

	function removeVisualPart(index: number) {
		const next = partsList.filter((_, i) => i !== index);
		syncVisualPartsToDoc(next);
	}

	function commitParts() {
		if (!partsText.trim()) {
			partsList = [];
			patch({ parts: undefined });
			partsError = '';
			return;
		}
		try {
			const parsed = JSON.parse(partsText);
			if (!Array.isArray(parsed)) throw new Error('Phải là một mảng');
			partsList = parsed;
			patch({ parts: parsed });
			partsError = '';
		} catch (err) {
			partsError = err instanceof Error ? err.message : 'JSON không hợp lệ';
		}
	}

	let allowedTargets = $derived(
		entry ? EDGE_RULES.filter((r) => r.from === entry.kind) : []
	);
</script>

<aside class="inspector">
	{#if !entry}
		<div class="empty">
			<p>Chọn một mục trên canvas để sửa vị trí và quan hệ của nó.</p>
			<p class="hint">
				Tên, mô tả và ảnh sửa ở <a href="/admin/library">Quản lý Library</a> — xưởng này chỉ lo
				bố cục.
			</p>
		</div>
	{:else}
		<header class="head">
			<div class="head-meta">
				<span class="kind" style="--c:{KIND_ICONS[entry.kind]}">
					{KIND_ICONS[entry.kind]}
					{KIND_LABELS[entry.kind]}
				</span>
				{#if !entry.item.is_active}
					<span class="draft-badge">Bản nháp Co-Writer</span>
				{/if}
			</div>
			<h2>{entry.item.name}</h2>
			<a class="edit-link" href="/admin/library">Sửa nội dung ↗</a>
		</header>

		<section class="group">
			<h3>Định danh</h3>
			<label>
				Loại nút
				<select
					value={layout.kind ?? ''}
					onchange={(e) => patch({ kind: e.currentTarget.value || undefined })}
				>
					<option value="">— tự suy từ danh mục —</option>
					{#each NODE_KINDS as kind}
						<option value={kind}>{kind}</option>
					{/each}
				</select>
			</label>
			<label>
				Slug
				<div class="row">
					<input
						value={layout.slug ?? ''}
						placeholder={slugify(entry.item.name, entry.item.id)}
						oninput={(e) => patch({ slug: e.currentTarget.value || undefined })}
					/>
					<button
						type="button"
						onclick={() => patch({ slug: slugify(entry.item.name, entry.item.id) })}
					>
						Tự đặt
					</button>
				</div>
			</label>
			{#if entry.kind !== 'region'}
				<label>
					Thuộc vùng
					<select
						value={layout.region ?? ''}
						onchange={(e) => handleSelectRegion(e.currentTarget.value)}
					>
						<option value="">— chưa gán —</option>
						{#each studio.regions as region (region.item.id)}
							<option value={regionSlugOf(region)}>{region.item.name}</option>
						{/each}
					</select>
				</label>
			{/if}
		</section>

		<section class="group">
			<h3>Vị trí</h3>
			{#if placed}
				<div class="pair">
					<label>
						Vĩ độ
						<input
							type="number"
							step="0.0001"
							value={layout.lat}
							oninput={(e) => patch({ lat: num(e.currentTarget.value) })}
						/>
					</label>
					<label>
						Kinh độ
						<input
							type="number"
							step="0.0001"
							value={layout.lng}
							oninput={(e) => patch({ lng: num(e.currentTarget.value) })}
						/>
					</label>
				</div>
				<label>
					Độ cao <strong>{(layout.alt ?? 0).toFixed(2)}</strong>
					<input
						type="range"
						min="-0.2"
						max="0.4"
						step="0.01"
						value={layout.alt ?? 0}
						oninput={(e) => patch({ alt: Number(e.currentTarget.value) })}
					/>
					<small>Âm là vực thẳm · 0 là mặt đất · dương là đảo bay</small>
				</label>
				<div class="row">
					<button type="button" onclick={() => onfocus3d?.(entry.item.id)}>Bay tới trong 3D</button>
					<button type="button" class="danger" onclick={() => patch({ lat: undefined, lng: undefined })}>
						Gỡ khỏi bản đồ
					</button>
				</div>
			{:else}
				<p class="hint">Mục này chưa có toạ độ riêng trên bản đồ Studio.</p>
				<button type="button" onclick={placeSuggested}>🧭 Đặt lên bản đồ (Tọa độ gợi ý)</button>
			{/if}
		</section>

		<AssetSlots
			kind={entry.kind}
			bindings={(layout.assets as Record<string, string>) ?? {}}
			onchange={(assets) =>
				patch({ assets: Object.keys(assets).length ? assets : undefined })}
		/>

		{#if entry.kind !== 'character'}
			<section class="group">
				<h3>Dựng hình</h3>
				<label>
					Địa hình
					<select
						value={layout.terrain ?? ''}
						onchange={(e) => patch({ terrain: e.currentTarget.value || undefined })}
					>
						<option value="">— tự động —</option>
						{#each TERRAIN_KINDS as terrain}
							<option value={terrain}>{TERRAIN_LABELS[terrain]}</option>
						{/each}
					</select>
				</label>
				<label>
					Cảnh khi vào
					<select
						value={layout.scene ?? ''}
						onchange={(e) => patch({ scene: e.currentTarget.value || undefined })}
					>
						<option value="">— xoay ngắm —</option>
						{#each SCENE_KINDS as scene}
							<option value={scene}>{SCENE_LABELS[scene]}</option>
						{/each}
					</select>
				</label>
				<label>
					Mô hình .glb
					<input
						value={layout.model ?? ''}
						placeholder="world/models/sindark.glb"
						oninput={(e) => patch({ model: e.currentTarget.value || undefined })}
					/>
				</label>
			</section>
		{/if}

		<section class="group">
			<h3>Hiển thị</h3>
			<label>
				Bảng màu
				<input
					value={(layout.palette ?? []).join(', ')}
					placeholder="#0b1a12, #2fe36b"
					oninput={(e) => {
						const colors = e.currentTarget.value
							.split(',')
							.map((c) => c.trim())
							.filter(Boolean);
						patch({ palette: colors.length ? colors : undefined });
					}}
				/>
			</label>
			{#if entry.kind === 'character'}
				<label>
					Màu hành trình
					<input
						value={layout.color ?? ''}
						placeholder="#ffb703"
						oninput={(e) => patch({ color: e.currentTarget.value || undefined })}
					/>
				</label>
			{/if}
			<label>
				Mở khoá từ chương
				<input
					type="number"
					value={layout.unlock_chapter ?? ''}
					placeholder="tự động"
					oninput={(e) => patch({ unlock_chapter: num(e.currentTarget.value) })}
				/>
			</label>
		</section>

		{#if entry.kind !== 'character'}
			<section class="group">
				<div class="group-head-row">
					<h3>Bộ phận tháo lắp 3D</h3>
					<button
						type="button"
						class="mode-switch"
						onclick={() => (partsMode = partsMode === 'visual' ? 'json' : 'visual')}
					>
						{partsMode === 'visual' ? '{ } JSON' : '✨ Trực quan'}
					</button>
				</div>

				{#if partsMode === 'visual'}
					{#if partsList.length === 0}
						<small>Chưa cấu hình riêng — công trình vẫn tự động tháo lắp theo nhãn mặc định.</small>
					{:else}
						<div class="parts-cards">
							{#each partsList as part, idx (idx)}
								<div class="part-card">
									<div class="part-row">
										<select
											value={part.id}
											onchange={(e) => {
												const nextId = e.currentTarget.value;
												const preset = PART_PRESETS.find((p) => p.id === nextId);
												updateVisualPart(idx, {
													id: nextId,
													label: part.label || preset?.label || nextId
												});
											}}
										>
											{#each PART_PRESETS as preset}
												<option value={preset.id}>{preset.id} ({preset.label})</option>
											{/each}
											{#if !PART_PRESETS.some((p) => p.id === part.id)}
												<option value={part.id}>{part.id}</option>
											{/if}
										</select>
										<button
											type="button"
											class="danger icon-btn"
											title="Xoá bộ phận"
											onclick={() => removeVisualPart(idx)}
										>
											✕
										</button>
									</div>
									<input
										placeholder="Tên hiển thị (VD: Mái tháp cổ)"
										value={part.label ?? ''}
										oninput={(e) => updateVisualPart(idx, { label: e.currentTarget.value })}
									/>
									<textarea
										rows="2"
										placeholder="Bí sử / Lore của bộ phận này khi độc giả tách ra…"
										value={part.lore ?? ''}
										oninput={(e) => updateVisualPart(idx, { lore: e.currentTarget.value })}
									></textarea>
									<input
										type="number"
										placeholder="Gắn với Chương (tuỳ chọn)"
										value={part.chapter ?? ''}
										oninput={(e) => updateVisualPart(idx, { chapter: num(e.currentTarget.value) })}
									/>
								</div>
							{/each}
						</div>
					{/if}
					<button type="button" onclick={() => addVisualPart('roof')}>+ Thêm bộ phận</button>
				{:else}
					<textarea
						rows="7"
						bind:value={partsText}
						onblur={commitParts}
						placeholder={'[\n  { "id": "roof", "label": "Mái tháp", "lore": "…", "chapter": 34 }\n]'}
					></textarea>
					{#if partsError}<p class="error">{partsError}</p>{/if}
					<small>Bỏ trống thì công trình vẫn tháo lắp được, chỉ dùng tên mặc định.</small>
				{/if}
			</section>
		{/if}

		<section class="group">
			<h3>Nối được với</h3>
			{#if allowedTargets.length === 0}
				<p class="hint">Loại nút này không có quan hệ ra.</p>
			{:else}
				<ul class="rules">
					{#each allowedTargets as rule (rule.role + rule.to)}
						<li>
							<span class="rule-label">{rule.label}</span>
							<span class="rule-target">{KIND_ICONS[rule.to]} {KIND_LABELS[rule.to]}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</aside>

<style>
	.inspector {
		width: 20.5rem;
		flex: none;
		overflow-y: auto;
		background: rgba(8, 14, 24, 0.9);
		border-left: 1px solid rgba(255, 255, 255, 0.08);
		padding: 0.9rem 1rem 3rem;
		color: #e2e8f0;
		font-size: 0.8rem;
	}
	.empty {
		padding-top: 2rem;
		color: #94a3b8;
		line-height: 1.6;
	}
	.hint {
		color: #94a3b8;
		font-size: 0.75rem;
		line-height: 1.55;
	}
	.hint a,
	.edit-link {
		color: #4ade80;
	}

	.head {
		margin-bottom: 1rem;
	}
	.head-meta {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.draft-badge {
		font-size: 0.62rem;
		padding: 0.08rem 0.4rem;
		border-radius: 99px;
		background: rgba(251, 191, 36, 0.16);
		color: #fbbf24;
		border: 1px solid rgba(251, 191, 36, 0.35);
	}
	.head h2 {
		font-size: 1.02rem;
		margin: 0.15rem 0 0.3rem;
	}
	.kind {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #94a3b8;
	}
	.edit-link {
		font-size: 0.72rem;
		text-decoration: none;
	}

	.group {
		border-top: 1px solid rgba(255, 255, 255, 0.07);
		padding-top: 0.75rem;
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.group-head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
	}
	.group h3 {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #94a3b8;
		margin: 0;
	}
	.mode-switch {
		font-size: 0.66rem;
		padding: 0.18rem 0.45rem;
	}

	.parts-cards {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.part-card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.part-row {
		display: flex;
		gap: 0.35rem;
	}
	.part-row select {
		flex: 1;
		min-width: 0;
	}
	.icon-btn {
		padding: 0.2rem 0.45rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	label small,
	.group > small {
		color: #94a3b8;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.row input {
		flex: 1 1 120px;
		min-width: 0;
	}

	input,
	select,
	textarea {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 5px;
		padding: 0.35rem 0.45rem;
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
	}
	textarea {
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
		resize: vertical;
	}
	input[type='range'] {
		padding: 0;
		accent-color: #ffb703;
	}

	button {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 5px;
		padding: 0.35rem 0.6rem;
		color: inherit;
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		white-space: nowrap;
	}
	button:hover {
		border-color: #ffb703;
		color: #ffb703;
	}
	button.danger:hover {
		border-color: #f87171;
		color: #f87171;
	}

	.error {
		color: #f87171;
		font-size: 0.72rem;
		margin: 0;
	}

	.rules {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.rules li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	.rule-label {
		color: #94a3b8;
	}
</style>
