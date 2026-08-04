<script lang="ts">
	/**
	 * The production asset library.
	 *
	 * Feeds the 3D world; readers never see it. Built to be added to over years:
	 * drop files in, tag them, record where they came from. Provenance is asked
	 * for at import because it cannot be reconstructed later — an asset whose
	 * author was never written down cannot be credited, and cannot safely ship.
	 */
	import { toast_error, toast_success } from '$lib/stores/admin.svelte';
	import {
		createAsset,
		fetchAssets,
		fetchCredits,
		importAssets,
		retireAsset,
		updateAsset,
		uploadAssetFile,
		type AssetDraft,
		type CreditsReport
	} from '$lib/world-assets/api';
	import {
		ASSET_KINDS,
		ASSET_KIND_LABELS,
		LICENSES,
		formatSize,
		needsCredit,
		type WorldAsset
	} from '$lib/world-assets/types';
	import { onMount } from 'svelte';

	let assets = $state<WorldAsset[]>([]);
	let tags = $state<string[]>([]);
	let loading = $state(true);

	let filterKind = $state('');
	let filterTag = $state('');
	let search = $state('');
	let showInactive = $state(false);

	let editing = $state<WorldAsset | null>(null);
	let showForm = $state(false);
	let uploading = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let showImport = $state(false);
	let importText = $state('');
	let credits = $state<CreditsReport | null>(null);
	let showCredits = $state(false);

	const emptyForm = (): AssetDraft & { tagText: string; transformText: string } => ({
		name: '',
		slug: '',
		kind: 'model',
		file_url: '',
		file_format: null,
		file_size: null,
		thumbnail_url: '',
		license: 'own',
		source_name: '',
		source_url: '',
		attribution: '',
		tags: [],
		transform: null,
		meta: null,
		is_active: true,
		tagText: '',
		transformText: ''
	});

	let form = $state(emptyForm());

	async function reload() {
		loading = true;
		const cat = await fetchAssets({
			kind: filterKind || undefined,
			tag: filterTag || undefined,
			q: search || undefined,
			includeInactive: showInactive
		});
		assets = cat.assets;
		tags = cat.tags;
		loading = false;
	}

	onMount(reload);

	function openCreate() {
		editing = null;
		form = emptyForm();
		showForm = true;
	}

	function openEdit(asset: WorldAsset) {
		editing = asset;
		form = {
			name: asset.name,
			slug: asset.slug,
			kind: asset.kind,
			file_url: asset.file_url,
			file_format: asset.file_format,
			file_size: asset.file_size,
			thumbnail_url: asset.thumbnail_url ?? '',
			license: asset.license ?? '',
			source_name: asset.source_name ?? '',
			source_url: asset.source_url ?? '',
			attribution: asset.attribution ?? '',
			tags: asset.tags,
			transform: asset.transform,
			meta: asset.meta,
			is_active: asset.is_active,
			tagText: asset.tags.join(', '),
			transformText: asset.transform ? JSON.stringify(asset.transform, null, 2) : ''
		};
		showForm = true;
	}

	async function handleUpload(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true;
		const result = await uploadAssetFile(file);
		uploading = false;
		if (!result) {
			toast_error('Upload thất bại — kiểm tra định dạng và dung lượng');
			return;
		}
		form.file_url = result.url;
		form.file_format = result.format;
		form.file_size = result.size;
		// A file dropped in with no name yet gets the filename, minus extension.
		if (!form.name.trim()) form.name = file.name.replace(/\.[^.]+$/, '');
		toast_success(`Đã tải lên ${formatSize(result.size)}`);
	}

	async function save() {
		if (!form.file_url.trim()) {
			toast_error('Chưa có file — hãy tải lên hoặc dán URL');
			return;
		}

		let transform = form.transform;
		if (form.transformText.trim()) {
			try {
				transform = JSON.parse(form.transformText);
			} catch {
				toast_error('Transform không phải JSON hợp lệ');
				return;
			}
		} else {
			transform = null;
		}

		const draft: AssetDraft = {
			name: form.name,
			slug: form.slug || undefined,
			kind: form.kind,
			file_url: form.file_url,
			file_format: form.file_format,
			file_size: form.file_size,
			thumbnail_url: form.thumbnail_url || null,
			license: form.license || null,
			source_name: form.source_name || null,
			source_url: form.source_url || null,
			attribution: form.attribution || null,
			tags: form.tagText
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean),
			transform,
			meta: form.meta,
			is_active: form.is_active
		};

		const res = editing ? await updateAsset(editing.id, draft) : await createAsset(draft);
		if (res.success) {
			toast_success(editing ? 'Đã cập nhật' : 'Đã thêm asset');
			showForm = false;
			reload();
		} else {
			toast_error('Lưu thất bại');
		}
	}

	async function retire(asset: WorldAsset) {
		if (!confirm(`Ẩn "${asset.name}"? Các chỗ đang dùng sẽ mất mô hình này.`)) return;
		const res = await retireAsset(asset.id);
		if (res.success) {
			toast_success('Đã ẩn');
			reload();
		}
	}

	async function runImport() {
		let parsed: AssetDraft[];
		try {
			const raw = JSON.parse(importText);
			parsed = Array.isArray(raw) ? raw : raw.assets;
			if (!Array.isArray(parsed)) throw new Error('Cần một mảng');
		} catch (err) {
			toast_error(err instanceof Error ? err.message : 'JSON không hợp lệ');
			return;
		}

		const res = await importAssets(parsed);
		if (res.success) {
			const { created, updated, failed } = res.data;
			toast_success(`Thêm ${created}, cập nhật ${updated}${failed.length ? `, lỗi ${failed.length}` : ''}`);
			showImport = false;
			importText = '';
			reload();
		} else {
			toast_error('Nhập thất bại');
		}
	}

	async function openCredits() {
		showCredits = true;
		const res = await fetchCredits();
		if (res.success) credits = res.data;
	}
</script>

<svelte:head><title>Admin — Thư viện Asset 3D</title></svelte:head>

<div class="page">
	<header class="head">
		<div>
			<h1>🧰 Thư viện Asset 3D</h1>
			<p class="sub">
				Nguyên liệu dựng thế giới 3D. <strong>Độc giả không nhìn thấy mục nào ở đây</strong> —
				họ chỉ nhận về file đã được gán vào từng địa điểm, nhân vật hay vật phẩm.
			</p>
		</div>
		<div class="actions">
			<button onclick={openCredits}>📜 Ghi công</button>
			<button onclick={() => (showImport = true)}>📦 Nhập hàng loạt</button>
			<button class="primary" onclick={openCreate}>+ Thêm asset</button>
		</div>
	</header>

	<div class="filters">
		<input class="search" placeholder="Tìm theo tên hoặc slug…" bind:value={search} oninput={reload} />
		<select bind:value={filterKind} onchange={reload}>
			<option value="">Mọi loại</option>
			{#each ASSET_KINDS as kind}
				<option value={kind}>{ASSET_KIND_LABELS[kind]}</option>
			{/each}
		</select>
		<select bind:value={filterTag} onchange={reload}>
			<option value="">Mọi thẻ</option>
			{#each tags as tag}
				<option value={tag}>{tag}</option>
			{/each}
		</select>
		<label class="check">
			<input type="checkbox" bind:checked={showInactive} onchange={reload} /> Hiện cả đã ẩn
		</label>
	</div>

	{#if loading}
		<p class="muted">Đang tải…</p>
	{:else if assets.length === 0}
		<div class="empty">
			<h3>Chưa có asset nào</h3>
			<p class="muted">
				Tải lên một file <code>.glb</code> để bắt đầu, hoặc dùng "Nhập hàng loạt" nếu anh đã đẩy
				sẵn một loạt file lên R2.
			</p>
		</div>
	{:else}
		<div class="grid">
			{#each assets as asset (asset.id)}
				<article class="card" class:inactive={!asset.is_active}>
					<div class="thumb">
						{#if asset.thumbnail_url}
							<img src={asset.thumbnail_url} alt={asset.name} />
						{:else}
							<span class="thumb-fallback">{asset.kind === 'model' ? '🧊' : '🖼️'}</span>
						{/if}
						{#if needsCredit(asset.license)}
							<span class="credit-flag" title="Cần ghi công khi phát hành">©</span>
						{/if}
					</div>
					<div class="body">
						<h3>{asset.name}</h3>
						<code class="slug">{asset.slug}</code>
						<p class="meta">
							{ASSET_KIND_LABELS[asset.kind] ?? asset.kind} · {formatSize(asset.file_size)}
							{#if asset.file_format}· .{asset.file_format}{/if}
						</p>
						{#if asset.tags.length}
							<p class="tags">{#each asset.tags as tag}<span class="tag">{tag}</span>{/each}</p>
						{/if}
						<p class="license" class:warn={!asset.license}>
							{asset.license
								? (LICENSES.find((l) => l.value === asset.license)?.label ?? asset.license)
								: '⚠ chưa ghi giấy phép'}
						</p>
					</div>
					<footer>
						<button onclick={() => openEdit(asset)}>Sửa</button>
						<a href={asset.file_url} target="_blank" rel="noreferrer noopener">Tải</a>
						{#if asset.is_active}
							<button class="danger" onclick={() => retire(asset)}>Ẩn</button>
						{/if}
					</footer>
				</article>
			{/each}
		</div>
	{/if}
</div>

{#if showForm}
	<div class="modal-backdrop">
		<div class="modal">
			<header>
				<strong>{editing ? 'Sửa asset' : 'Thêm asset'}</strong>
				<button onclick={() => (showForm = false)}>✕</button>
			</header>

			<div class="modal-body">
				<div class="upload-row">
					<input
						type="file"
						bind:this={fileInput}
						accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.ktx2"
						style="display:none"
						onchange={handleUpload}
					/>
					<button onclick={() => fileInput?.click()} disabled={uploading}>
						{uploading ? '⏳ Đang tải…' : '📤 Tải file lên'}
					</button>
					<input placeholder="hoặc dán URL file" bind:value={form.file_url} />
				</div>
				{#if form.file_size}
					<p class="muted small">{formatSize(form.file_size)} · .{form.file_format}</p>
				{/if}

				<div class="pair">
					<label>Tên<input bind:value={form.name} placeholder="Kiếm bạc Annam" /></label>
					<label>Slug<input bind:value={form.slug} placeholder="tự đặt từ tên" /></label>
				</div>

				<div class="pair">
					<label>
						Loại
						<select bind:value={form.kind}>
							{#each ASSET_KINDS as kind}
								<option value={kind}>{ASSET_KIND_LABELS[kind]}</option>
							{/each}
						</select>
					</label>
					<label>Ảnh thumbnail<input bind:value={form.thumbnail_url} placeholder="URL ảnh" /></label>
				</div>

				<label>
					Thẻ <small>(phân cách bằng dấu phẩy — dùng để lọc về sau)</small>
					<input bind:value={form.tagText} placeholder="vũ khí, kiếm, chibi" />
				</label>

				<fieldset>
					<legend>Nguồn gốc &amp; giấy phép</legend>
					<p class="muted small">
						Ghi ngay lúc nhập. Sau này không dựng lại được: asset CC-BY mà không nhớ tác giả thì
						không ghi công được, và không phát hành an toàn được.
					</p>
					<div class="pair">
						<label>
							Giấy phép
							<select bind:value={form.license}>
								<option value="">— chưa rõ —</option>
								{#each LICENSES as lic}
									<option value={lic.value}>{lic.label}</option>
								{/each}
							</select>
						</label>
						<label>Nguồn<input bind:value={form.source_name} placeholder="Quaternius / Kenney / tự làm" /></label>
					</div>
					<label>Link nguồn<input bind:value={form.source_url} placeholder="https://…" /></label>
					<label>
						Ghi công
						<input bind:value={form.attribution} placeholder="Tên tác giả cần ghi khi phát hành" />
					</label>
				</fieldset>

				<label>
					Transform mặc định <small>(để asset vào thế giới là đúng cỡ, đúng chiều)</small>
					<textarea
						rows="4"
						bind:value={form.transformText}
						placeholder={'{ "scale": 0.01, "rotation": [-90, 0, 0], "offset": [0, 0, 0] }'}
					></textarea>
					<small class="muted">
						Blender xuất Z-up thì thường cần <code>rotation: [-90, 0, 0]</code>; model dựng theo
						đơn vị cm thì cần <code>scale: 0.01</code>.
					</small>
				</label>

				<label class="check">
					<input type="checkbox" bind:checked={form.is_active} /> Đang dùng
				</label>
			</div>

			<footer>
				<button onclick={() => (showForm = false)}>Huỷ</button>
				<button class="primary" onclick={save}>{editing ? 'Cập nhật' : 'Thêm'}</button>
			</footer>
		</div>
	</div>
{/if}

{#if showImport}
	<div class="modal-backdrop">
		<div class="modal">
			<header>
				<strong>Nhập hàng loạt từ manifest</strong>
				<button onclick={() => (showImport = false)}>✕</button>
			</header>
			<div class="modal-body">
				<p class="muted small">
					Dán một mảng JSON. Slug đã tồn tại sẽ được <strong>cập nhật</strong> chứ không nhân bản,
					nên xuất lại vài model rồi nhập lại là an toàn.
				</p>
				<textarea
					rows="14"
					bind:value={importText}
					placeholder={'[\n  {\n    "slug": "kiem-bac-annam",\n    "name": "Kiếm bạc Annam",\n    "kind": "model",\n    "file_url": "https://assets.selorson.com/world/assets/kiem-bac.glb",\n    "file_format": "glb",\n    "license": "own",\n    "tags": ["vũ khí", "kiếm"],\n    "transform": { "scale": 1, "rotation": [0, 0, 0] }\n  }\n]'}
				></textarea>
			</div>
			<footer>
				<button onclick={() => (showImport = false)}>Huỷ</button>
				<button class="primary" onclick={runImport}>Nhập</button>
			</footer>
		</div>
	</div>
{/if}

{#if showCredits}
	<div class="modal-backdrop">
		<div class="modal">
			<header>
				<strong>Danh sách ghi công</strong>
				<button onclick={() => (showCredits = false)}>✕</button>
			</header>
			<div class="modal-body">
				{#if !credits}
					<p class="muted">Đang tải…</p>
				{:else}
					{#if credits.missing_license.length}
						<div class="warn-box">
							<strong>⚠ {credits.missing_license.length} asset chưa ghi giấy phép.</strong>
							<p class="small">Phải điền trước khi phát hành — không rõ giấy phép là không dùng được.</p>
							<ul>
								{#each credits.missing_license as item (item.id)}
									<li>{item.name} <code>{item.slug}</code></li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if credits.credits.length === 0}
						<p class="muted">
							Không có asset nào cần ghi công — tất cả đều là CC0, tự làm, hoặc đã mua licence.
						</p>
					{:else}
						<ul class="credit-list">
							{#each credits.credits as c, i (i)}
								<li>
									<strong>{c.name}</strong>
									<span class="small">
										{c.license}
										{#if c.source_name}· {c.source_name}{/if}
										{#if c.attribution}· {c.attribution}{/if}
									</span>
									{#if c.source_url}
										<a href={c.source_url} target="_blank" rel="noreferrer noopener">nguồn</a>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					<p class="muted small">Tổng {credits.total} asset đang dùng.</p>
				{/if}
			</div>
			<footer>
				<button onclick={() => (showCredits = false)}>Đóng</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.page {
		padding: 1.25rem;
		color: var(--color-text-primary, #e2e8f0);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.head h1 {
		font-size: 1.3rem;
		margin: 0 0 0.25rem;
	}
	.sub {
		margin: 0;
		max-width: 46rem;
		font-size: 0.82rem;
		line-height: 1.6;
		color: var(--color-text-muted, #94a3b8);
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.filters {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: 1rem;
	}
	.search {
		min-width: 14rem;
	}

	button,
	input,
	select,
	textarea {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 6px;
		padding: 0.4rem 0.6rem;
		color: inherit;
		font: inherit;
		font-size: 0.82rem;
	}
	button {
		cursor: pointer;
		white-space: nowrap;
	}
	button:hover:not(:disabled) {
		border-color: #ffb703;
		color: #ffb703;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	button.primary {
		background: #0c713d;
		border-color: #0c713d;
		color: #fff;
		font-weight: 600;
	}
	button.primary:hover {
		filter: brightness(1.2);
		color: #fff;
	}
	button.danger:hover {
		border-color: #f87171;
		color: #f87171;
	}
	textarea {
		width: 100%;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		resize: vertical;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.9rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.03);
	}
	.card.inactive {
		opacity: 0.45;
	}
	.thumb {
		position: relative;
		aspect-ratio: 4 / 3;
		display: grid;
		place-items: center;
		background: #0b1420;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb-fallback {
		font-size: 2.2rem;
		opacity: 0.5;
	}
	.credit-flag {
		position: absolute;
		top: 0.35rem;
		right: 0.4rem;
		background: rgba(255, 183, 3, 0.9);
		color: #04121a;
		font-size: 0.7rem;
		font-weight: 700;
		border-radius: 4px;
		padding: 0 0.3rem;
	}
	.card .body {
		padding: 0.65rem 0.75rem;
		flex: 1;
	}
	.card h3 {
		font-size: 0.9rem;
		margin: 0 0 0.15rem;
	}
	.slug {
		font-size: 0.7rem;
		color: #4ade80;
	}
	.card .meta,
	.card .license {
		font-size: 0.72rem;
		color: var(--color-text-muted, #94a3b8);
		margin: 0.35rem 0 0;
	}
	.card .license.warn {
		color: #fbbf24;
	}
	.tags {
		margin: 0.35rem 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.tag {
		font-size: 0.66rem;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		padding: 0.05rem 0.3rem;
	}
	.card footer {
		display: flex;
		gap: 0.35rem;
		padding: 0.5rem 0.75rem 0.65rem;
	}
	.card footer a {
		font-size: 0.78rem;
		color: #4ade80;
		align-self: center;
	}

	.empty {
		padding: 3rem 1rem;
		text-align: center;
	}
	.muted {
		color: var(--color-text-muted, #94a3b8);
	}
	.small {
		font-size: 0.75rem;
		line-height: 1.55;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(2, 6, 12, 0.7);
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}
	.modal {
		width: min(46rem, 100%);
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		background: #0b1420;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 12px;
		overflow: hidden;
	}
	.modal > header,
	.modal > footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.7rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.modal > footer {
		border-bottom: none;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		justify-content: flex-end;
	}
	.modal-body {
		padding: 1rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.modal label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
	}
	.modal label small {
		font-weight: 400;
		color: var(--color-text-muted, #94a3b8);
		font-size: 0.7rem;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}
	.upload-row {
		display: flex;
		gap: 0.5rem;
	}
	.upload-row input {
		flex: 1;
	}
	fieldset {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	legend {
		font-size: 0.78rem;
		padding: 0 0.35rem;
	}

	.warn-box {
		border: 1px solid rgba(251, 191, 36, 0.5);
		background: rgba(251, 191, 36, 0.1);
		border-radius: 8px;
		padding: 0.7rem 0.85rem;
	}
	.warn-box ul {
		margin: 0.4rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.76rem;
	}
	.credit-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.credit-list li {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		font-size: 0.82rem;
	}
	.credit-list a {
		color: #4ade80;
		font-size: 0.74rem;
	}

	@media (max-width: 640px) {
		.pair {
			grid-template-columns: 1fr;
		}
	}
</style>
