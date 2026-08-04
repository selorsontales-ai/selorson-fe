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
	import AssetSlots from './AssetSlots.svelte';
	import { slugify, type Studio } from './studio.svelte';
	import { EDGE_RULES, KIND_ICONS, KIND_LABELS } from './types';

	interface Props {
		studio: Studio;
		onfocus3d?: (id: number) => void;
	}

	let { studio, onfocus3d }: Props = $props();

	let entry = $derived(studio.selected);
	let layout = $derived(entry?.layout ?? {});
	let placed = $derived(typeof layout.lat === 'number' && typeof layout.lng === 'number');

	function patch(patchValue: Record<string, unknown>) {
		if (!entry) return;
		studio.patchNode(entry.item.id, patchValue);
	}

	function num(raw: string): number | undefined {
		if (raw.trim() === '') return undefined;
		const value = Number(raw);
		return Number.isFinite(value) ? value : undefined;
	}

	/** Put an unplaced item somewhere visible so it can be dragged into place. */
	function placeAtCentre() {
		if (!entry) return;
		patch({ lat: 0, lng: 0 });
	}

	let partsText = $state('');
	let partsError = $state('');
	let partsFor = $state<number | null>(null);

	// Reseed the JSON box when a different item is selected, not on every keystroke.
	$effect(() => {
		if (!entry || entry.item.id === partsFor) return;
		partsFor = entry.item.id;
		partsText = layout.parts ? JSON.stringify(layout.parts, null, 2) : '';
		partsError = '';
	});

	function commitParts() {
		if (!partsText.trim()) {
			patch({ parts: undefined });
			partsError = '';
			return;
		}
		try {
			const parsed = JSON.parse(partsText);
			if (!Array.isArray(parsed)) throw new Error('Phải là một mảng');
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
			<span class="kind" style="--c:{KIND_ICONS[entry.kind]}">
				{KIND_ICONS[entry.kind]}
				{KIND_LABELS[entry.kind]}
			</span>
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
						onchange={(e) => patch({ region: e.currentTarget.value || undefined })}
					>
						<option value="">— chưa gán —</option>
						{#each studio.regions as region (region.item.id)}
							{#if region.layout?.slug}
								<option value={region.layout.slug}>{region.item.name}</option>
							{/if}
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
				<p class="hint">Mục này chưa có toạ độ nên không hiện trên bản đồ.</p>
				<button type="button" onclick={placeAtCentre}>Đặt lên bản đồ</button>
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
				<h3>Bộ phận tháo lắp</h3>
				<textarea
					rows="7"
					bind:value={partsText}
					onblur={commitParts}
					placeholder={'[\n  { "id": "roof", "label": "Mái tháp", "lore": "…", "chapter": 34 }\n]'}
				></textarea>
				{#if partsError}<p class="error">{partsError}</p>{/if}
				<small>Bỏ trống thì công trình vẫn tháo lắp được, chỉ dùng tên mặc định.</small>
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
		width: 20rem;
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
	.group h3 {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #94a3b8;
		margin: 0;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	label small {
		color: #94a3b8;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.row {
		display: flex;
		gap: 0.4rem;
	}
	.row input {
		flex: 1;
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
