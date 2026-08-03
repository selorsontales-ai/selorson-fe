<script lang="ts">
	/**
	 * Places a library item on the 3D map.
	 *
	 * Writes into `extra_data.world`. Common fields get real inputs; everything
	 * else stays editable as raw JSON, and any key this form does not know about
	 * is preserved on save. That is what lets new art fields (a sprite sheet, a
	 * model variant) be added from here without waiting for a code change.
	 */
	import {
		NODE_KINDS,
		SCENE_KINDS,
		SCENE_LABELS,
		TERRAIN_KINDS,
		TERRAIN_LABELS
	} from '$lib/world/terrains';

	interface Props {
		/** Full `extra_data` for the item, bound back out on every edit. */
		extraData: Record<string, unknown> | null;
		/** Item id (or null when creating) — re-seeds the form when it changes. */
		itemKey: string | number | null;
	}

	let { extraData = $bindable(), itemKey }: Props = $props();

	type WorldCfg = Record<string, unknown>;

	let world = $state<WorldCfg>({});
	/** Non-`world` keys of extra_data — carried through untouched. */
	let otherExtra = $state<Record<string, unknown>>({});
	/** Keys of `world` this form has no input for; edited as JSON. */
	let advancedText = $state('');
	let advancedError = $state('');
	let lastKey = $state<string | number | null | undefined>(undefined);

	const KNOWN = [
		'kind',
		'slug',
		'region',
		'lat',
		'lng',
		'alt',
		'terrain',
		'scene',
		'unlock_chapter',
		'palette',
		'model',
		'color'
	];

	// Re-seed when a different item is opened, not on every keystroke.
	$effect(() => {
		if (itemKey === lastKey) return;
		lastKey = itemKey;

		const source = (extraData ?? {}) as Record<string, unknown>;
		const incoming = (source.world ?? {}) as WorldCfg;

		world = { ...incoming };
		otherExtra = Object.fromEntries(Object.entries(source).filter(([k]) => k !== 'world'));

		const rest = Object.fromEntries(Object.entries(incoming).filter(([k]) => !KNOWN.includes(k)));
		advancedText = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
		advancedError = '';
	});

	/** Rebuild `extra_data` from the form. Empty values are dropped, not stored as null. */
	function commit() {
		const cfg: WorldCfg = {};
		for (const key of KNOWN) {
			const value = world[key];
			if (value === '' || value === null || value === undefined) continue;
			if (Array.isArray(value) && value.length === 0) continue;
			cfg[key] = value;
		}

		if (advancedText.trim()) {
			try {
				const extra = JSON.parse(advancedText);
				advancedError = '';
				Object.assign(cfg, extra);
			} catch (err) {
				advancedError = err instanceof Error ? err.message : 'JSON không hợp lệ';
				return;
			}
		} else {
			advancedError = '';
		}

		const next = { ...otherExtra };
		if (Object.keys(cfg).length) next.world = cfg;
		extraData = Object.keys(next).length ? next : null;
	}

	function setNumber(key: string, raw: string) {
		world[key] = raw === '' ? undefined : Number(raw);
		commit();
	}

	function setText(key: string, raw: string) {
		world[key] = raw === '' ? undefined : raw;
		commit();
	}

	let paletteText = $derived(Array.isArray(world.palette) ? (world.palette as string[]).join(', ') : '');

	function setPalette(raw: string) {
		const colors = raw
			.split(',')
			.map((c) => c.trim())
			.filter(Boolean);
		world.palette = colors.length ? colors : undefined;
		commit();
	}

	let isCharacter = $derived(world.kind === 'character');
	let isRegion = $derived(world.kind === 'region');
</script>

<fieldset class="world-fields">
	<legend>🌍 Vị trí trên bản đồ 3D</legend>
	<p class="hint">
		Bỏ trống toạ độ nếu mục này chưa lên bản đồ. Nhân vật không cần toạ độ — hành trình của họ
		lấy từ chương truyện.
	</p>

	<div class="grid">
		<label>
			Loại nút
			<select value={(world.kind as string) ?? ''} onchange={(e) => setText('kind', e.currentTarget.value)}>
				<option value="">— chưa đặt —</option>
				{#each NODE_KINDS as kind}
					<option value={kind}>{kind}</option>
				{/each}
			</select>
		</label>

		<label>
			Slug (URL)
			<input
				value={(world.slug as string) ?? ''}
				placeholder="sindark"
				oninput={(e) => setText('slug', e.currentTarget.value)}
			/>
		</label>

		{#if !isRegion}
			<label>
				Thuộc vùng (slug)
				<input
					value={(world.region as string) ?? ''}
					placeholder="annamland"
					oninput={(e) => setText('region', e.currentTarget.value)}
				/>
			</label>
		{/if}

		<label>
			Vĩ độ (lat)
			<input
				type="number"
				step="0.0001"
				value={(world.lat as number) ?? ''}
				placeholder="14.2"
				oninput={(e) => setNumber('lat', e.currentTarget.value)}
			/>
		</label>

		<label>
			Kinh độ (lng)
			<input
				type="number"
				step="0.0001"
				value={(world.lng as number) ?? ''}
				placeholder="108.3"
				oninput={(e) => setNumber('lng', e.currentTarget.value)}
			/>
		</label>

		<label>
			Độ cao (alt)
			<input
				type="number"
				step="0.01"
				value={(world.alt as number) ?? ''}
				placeholder="0"
				oninput={(e) => setNumber('alt', e.currentTarget.value)}
			/>
			<small>0 = mặt đất · 0.18 = đảo bay như Skyland · âm = vực thẳm</small>
		</label>

		{#if !isCharacter}
			<label>
				Địa hình
				<select
					value={(world.terrain as string) ?? ''}
					onchange={(e) => setText('terrain', e.currentTarget.value)}
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
					value={(world.scene as string) ?? ''}
					onchange={(e) => setText('scene', e.currentTarget.value)}
				>
					<option value="">— xoay ngắm —</option>
					{#each SCENE_KINDS as scene}
						<option value={scene}>{SCENE_LABELS[scene]}</option>
					{/each}
				</select>
			</label>
		{/if}

		<label>
			Mở khoá từ chương
			<input
				type="number"
				value={(world.unlock_chapter as number) ?? ''}
				placeholder="tự động"
				oninput={(e) => setNumber('unlock_chapter', e.currentTarget.value)}
			/>
			<small>Bỏ trống = lấy chương đầu tiên mục này xuất hiện</small>
		</label>

		<label>
			Bảng màu
			<input
				value={paletteText}
				placeholder="#0b1a12, #2fe36b"
				oninput={(e) => setPalette(e.currentTarget.value)}
			/>
		</label>

		<label>
			Mô hình 3D (.glb)
			<input
				value={(world.model as string) ?? ''}
				placeholder="world/models/sindark.glb"
				oninput={(e) => setText('model', e.currentTarget.value)}
			/>
			<small>Có mô hình thì dùng mô hình, không có thì tự dựng từ địa hình</small>
		</label>

		{#if isCharacter}
			<label>
				Màu hành trình
				<input
					value={(world.color as string) ?? ''}
					placeholder="#2fe36b"
					oninput={(e) => setText('color', e.currentTarget.value)}
				/>
			</label>
		{/if}
	</div>

	<details class="advanced">
		<summary>Trường nâng cao (JSON)</summary>
		<p class="hint">
			Dành cho khoá chưa có ô riêng — <code>sprite_sheet</code>, <code>anim</code>,
			<code>parts</code>… Nội dung ở đây được giữ nguyên khi lưu.
		</p>
		<textarea
			rows="6"
			bind:value={advancedText}
			onblur={commit}
			placeholder={'{\n  "sprite_sheet": "world/chars/aria.png",\n  "sprite_dirs": 8\n}'}
		></textarea>
		{#if advancedError}
			<p class="error">JSON lỗi: {advancedError}</p>
		{/if}
	</details>
</fieldset>

<style>
	.world-fields {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 0.9rem 1rem 1rem;
		margin: 1rem 0;
	}
	legend {
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0 0.4rem;
	}
	.hint {
		font-size: 0.75rem;
		opacity: 0.7;
		margin: 0 0 0.75rem;
		line-height: 1.5;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.7rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.78rem;
	}
	label small {
		font-size: 0.68rem;
		opacity: 0.6;
		line-height: 1.4;
	}
	.advanced {
		margin-top: 0.9rem;
	}
	.advanced summary {
		cursor: pointer;
		font-size: 0.78rem;
		opacity: 0.85;
	}
	.advanced textarea {
		width: 100%;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}
	.error {
		color: #f87171;
		font-size: 0.75rem;
		margin: 0.35rem 0 0;
	}
</style>
