<script lang="ts">
	/**
	 * Bàn Kiểm Duyệt Thế Giới & Cổng Mở 3D (`Open Sync Gateway`).
	 *
	 * Thay thế trình dựng World Studio nặng trước đây bằng trạm kiểm duyệt gọn nhẹ:
	 * nhận gói địa danh / Intro Video / Gói 3D Desktop / Visual Novel từ ứng dụng
	 * Studio riêng ở trạng thái Nháp (`is_active = false`), xem trước, sửa thông tin
	 * song ngữ VI/EN, duyệt xuất bản và đẩy lên Alpha.
	 */
	import { onMount } from 'svelte';
	import {
		adminGet,
		adminPost,
		adminPut,
		toast_error,
		toast_success
	} from '$lib/stores/admin.svelte';
	import { supportsDataModes } from '$lib/app-flavor';
	import BetaToAlphaPromoteModal from '$lib/components/desktop/BetaToAlphaPromoteModal.svelte';
	import { resolveNodePlanet } from '$lib/world/cosmos';

	interface EnTranslation {
		name: string;
		description: string | null;
		role: string | null;
		aliases: string[] | null;
	}

	interface WorldPlaceRow {
		id: number;
		slug: string;
		name: string;
		category: string;
		description: string | null;
		image_url: string | null;
		image_ratio: string | null;
		story_link: string | null;
		coordinates: string | null;
		terrain: string | null;
		extra_data: Record<string, any> | null;
		world: Record<string, any>;
		display_order: number;
		is_active: boolean;
		en_translation: EnTranslation | null;
		updated_at: string;
	}

	interface OverviewSummary {
		total_places: number;
		published_places: number;
		pending_places: number;
		total_chunks?: number;
		published_chunks?: number;
		pending_chunks?: number;
		with_intro_video: number;
		with_desktop_pack: number;
		with_vn_episode: number;
		total_videos: number;
	}

	let loading = $state(true);
	let syncingJson = $state(false);
	let batchPublishing = $state(false);
	let savingEdit = $state(false);
	let showPromoteModal = $state(false);

	let items = $state<WorldPlaceRow[]>([]);
	let summary = $state<OverviewSummary>({
		total_places: 0,
		published_places: 0,
		pending_places: 0,
		total_chunks: 0,
		published_chunks: 0,
		pending_chunks: 0,
		with_intro_video: 0,
		with_desktop_pack: 0,
		with_vn_episode: 0,
		total_videos: 0
	});
	let storageMode = $state('local');

	let modeFilter = $state<'all' | 'clockwork' | 'chunks'>('all');
	let planetFilter = $state<'all' | 'akunalia' | 'earth'>('all');
	let statusFilter = $state<'all' | 'pending' | 'active'>('all');
	let searchQuery = $state('');

	let editingItem = $state<WorldPlaceRow | null>(null);
	let editForm = $state({
		name: '',
		slug: '',
		planet: 'akunalia',
		region: '',
		lat: '',
		lng: '',
		unlock_chapter: '',
		description: '',
		image_url: '',
		intro_video_url: '',
		desktop_pack_url: '',
		desktop_pack_version: '',
		vn_episode_url: '',
		vn_episode_title: '',
		is_active: false,
		en_name: '',
		en_description: ''
	});

	let fileInputEl = $state<HTMLInputElement | null>(null);

	function detectPlanet(row: WorldPlaceRow): 'akunalia' | 'earth' {
		return resolveNodePlanet({
			planet: row.world?.planet,
			slug: row.slug,
			name: row.name,
			region: row.world?.region ?? null
		});
	}

	function previewHref(row: WorldPlaceRow): string {
		if (row.category === 'world_chunk') {
			return '/world?space=open';
		}
		if (row.world?.kind === 'region') {
			return `/world/${encodeURIComponent(row.slug)}`;
		}
		const reg = (row.world?.region || '_').trim() || '_';
		return `/world/${encodeURIComponent(reg)}/${encodeURIComponent(row.slug)}`;
	}

	let filteredItems = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return items.filter((row) => {
			if (modeFilter === 'clockwork' && row.category === 'world_chunk') return false;
			if (modeFilter === 'chunks' && row.category !== 'world_chunk') return false;
			if (planetFilter !== 'all' && detectPlanet(row) !== planetFilter) return false;
			if (statusFilter === 'pending' && row.is_active) return false;
			if (statusFilter === 'active' && !row.is_active) return false;
			if (!q) return true;
			return (
				row.name.toLowerCase().includes(q) ||
				row.slug.toLowerCase().includes(q) ||
				(row.description ?? '').toLowerCase().includes(q) ||
				(row.en_translation?.name ?? '').toLowerCase().includes(q)
			);
		});
	});

	let pendingInFiltered = $derived(filteredItems.filter((r) => !r.is_active));

	async function loadOverview() {
		loading = true;
		try {
			const res = await adminGet<{
				summary: OverviewSummary;
				storage_mode: string;
				items: WorldPlaceRow[];
			}>('/admin/world/overview');
			if (res.success && res.data) {
				summary = res.data.summary;
				storageMode = res.data.storage_mode || 'local';
				items = res.data.items || [];
			} else {
				toast_error(res.message || 'Không tải được danh sách Thế Giới');
			}
		} catch {
			toast_error('Lỗi kết nối khi tải danh sách Thế Giới');
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadOverview();
	});

	async function handleImportStudioJson(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		syncingJson = true;
		try {
			const rawText = await file.text();
			const parsed = JSON.parse(rawText);
			const res = await adminPost<any>('/admin/sync/world-studio', parsed);
			if (res.success) {
				const d = res.data || {};
				const chunkMsg =
					(d.created_chunks ?? 0) + (d.updated_chunks ?? 0) > 0
						? `, ${d.created_chunks ?? 0} ô mới / ${d.updated_chunks ?? 0} ô cập nhật`
						: '';
				toast_success(
					`Đã nhận gói Studio: +${d.created_locations ?? 0} mới, cập nhật ${d.updated_locations ?? 0} địa danh${chunkMsg}, ${d.synced_videos ?? 0} video (Trạng thái Nháp)!`
				);
				await loadOverview();
			} else {
				toast_error(res.message || 'Gói JSON không hợp lệ');
			}
		} catch (err) {
			toast_error(err instanceof Error ? `Lỗi đọc JSON: ${err.message}` : 'Lỗi nhập gói JSON');
		} finally {
			syncingJson = false;
		}
	}

	async function togglePublishRow(row: WorldPlaceRow) {
		const nextActive = !row.is_active;
		try {
			const res = await adminPut(`/admin/library/${row.id}`, {
				name: row.name,
				category: row.category,
				description: row.description,
				image_url: row.image_url,
				image_ratio: row.image_ratio ?? '16:9',
				display_order: row.display_order ?? 0,
				is_active: nextActive,
				extra_data: row.extra_data
			});
			if (res.success) {
				toast_success(
					nextActive
						? `Đã xuất bản "${row.name}" lên Bản đồ /world!`
						: `Đã chuyển "${row.name}" về Nháp!`
				);
				await loadOverview();
			} else {
				toast_error(res.message || 'Không đổi được trạng thái');
			}
		} catch {
			toast_error('Lỗi cập nhật trạng thái xuất bản');
		}
	}

	async function publishFilteredPending() {
		const ids = pendingInFiltered.map((r) => r.id);
		if (!ids.length || batchPublishing) return;
		if (!confirm(`Xuất bản công khai ${ids.length} địa danh đang chờ duyệt lên /world?`)) return;

		batchPublishing = true;
		try {
			const res = await adminPost<any>('/admin/publish-batch', {
				chapter_ids: [],
				manga_chapter_ids: [],
				library_item_ids: ids,
				action: 'publish'
			});
			if (res.success) {
				toast_success(`Đã duyệt xuất bản ${ids.length} địa danh!`);
				await loadOverview();
			} else {
				toast_error(res.message || 'Lỗi xuất bản hàng loạt');
			}
		} catch {
			toast_error('Lỗi xuất bản hàng loạt');
		} finally {
			batchPublishing = false;
		}
	}

	function openEditModal(row: WorldPlaceRow) {
		editingItem = row;
		const w = row.world ?? {};
		editForm = {
			name: row.name ?? '',
			slug: w.slug ?? row.slug ?? '',
			planet: detectPlanet(row),
			region: w.region ?? '',
			lat: w.lat !== undefined && w.lat !== null ? String(w.lat) : '',
			lng: w.lng !== undefined && w.lng !== null ? String(w.lng) : '',
			unlock_chapter:
				w.unlock_chapter !== undefined && w.unlock_chapter !== null
					? String(w.unlock_chapter)
					: '',
			description: row.description ?? '',
			image_url: row.image_url ?? '',
			intro_video_url: w.intro_video_url ?? '',
			desktop_pack_url: w.desktop_pack_url ?? '',
			desktop_pack_version: w.desktop_pack_version ?? '',
			vn_episode_url: w.vn_episode_url ?? '',
			vn_episode_title: w.vn_episode_title ?? '',
			is_active: row.is_active,
			en_name: row.en_translation?.name ?? '',
			en_description: row.en_translation?.description ?? ''
		};
	}

	async function saveEditModal() {
		if (!editingItem || savingEdit) return;
		if (!editForm.name.trim()) {
			toast_error('Tên địa danh không được để trống.');
			return;
		}
		if (editForm.en_description.trim() && !editForm.en_name.trim()) {
			toast_error('Vui lòng nhập Tên Tiếng Anh (EN) khi có mô tả EN.');
			return;
		}

		savingEdit = true;
		try {
			const baseExtra: Record<string, any> = editingItem.extra_data
				? { ...editingItem.extra_data }
				: {};
			const nextWorld: Record<string, any> = baseExtra.world ? { ...baseExtra.world } : {};

			const setOrDelete = (key: string, val: unknown) => {
				if (val === '' || val === null || val === undefined || Number.isNaN(val)) {
					delete nextWorld[key];
				} else {
					nextWorld[key] = val;
				}
			};

			setOrDelete('slug', editForm.slug.trim());
			setOrDelete('planet', editForm.planet);
			setOrDelete('region', editForm.region.trim());
			setOrDelete('lat', editForm.lat.trim() === '' ? undefined : Number(editForm.lat));
			setOrDelete('lng', editForm.lng.trim() === '' ? undefined : Number(editForm.lng));
			setOrDelete(
				'unlock_chapter',
				editForm.unlock_chapter.trim() === '' ? undefined : Number(editForm.unlock_chapter)
			);
			setOrDelete('intro_video_url', editForm.intro_video_url.trim());
			setOrDelete('desktop_pack_url', editForm.desktop_pack_url.trim());
			setOrDelete('desktop_pack_version', editForm.desktop_pack_version.trim());
			setOrDelete('vn_episode_url', editForm.vn_episode_url.trim());
			setOrDelete('vn_episode_title', editForm.vn_episode_title.trim());

			baseExtra.world = nextWorld;

			const putRes = await adminPut(`/admin/library/${editingItem.id}`, {
				name: editForm.name.trim(),
				category: editingItem.category,
				description: editForm.description.trim() || null,
				image_url: editForm.image_url.trim() || null,
				image_ratio: editingItem.image_ratio ?? '16:9',
				display_order: editingItem.display_order ?? 0,
				is_active: editForm.is_active,
				extra_data: baseExtra
			});

			if (!putRes.success) {
				toast_error(putRes.message || 'Lỗi khi lưu địa danh');
				return;
			}

			if (editForm.en_name.trim() || editingItem.en_translation) {
				await adminPut(`/admin/library/${editingItem.id}/translations/en`, {
					name: editForm.en_name.trim(),
					role: editingItem.en_translation?.role ?? '',
					aliases: Array.isArray(editingItem.en_translation?.aliases)
						? editingItem.en_translation.aliases.join(', ')
						: '',
					description: editForm.en_description.trim()
				});
			}

			toast_success('Đã lưu cập nhật địa danh & tài nguyên Cổng 3D!');
			editingItem = null;
			await loadOverview();
		} catch {
			toast_error('Lỗi kết nối khi lưu địa danh');
		} finally {
			savingEdit = false;
		}
	}
</script>

<svelte:head>
	<title>Thế Giới & Cổng 3D — Selorson Admin</title>
</svelte:head>

<div class="world-admin-page">
	<header class="page-head">
		<div>
			<span class="eyebrow">OPEN SYNC GATEWAY · REVIEW DESK</span>
			<h1>🌍 Thế Giới & Cổng Đồng Bộ 3D</h1>
			<p class="subtitle">
				Selorson chỉ giữ bản đồ vũ trụ nhẹ để xem & duyệt xuất bản. Mọi cảnh 3D nặng, Intro kiểu
				<i>Game of Thrones</i>, Visual Novel và Phim được kiến tạo ở <b>App Studio riêng</b> rồi đẩy
				sang đây qua cổng mở ở trạng thái <b>Nháp</b>.
			</p>
		</div>

		<div class="head-actions">
			<input
				bind:this={fileInputEl}
				type="file"
				accept=".json,application/json"
				hidden
				onchange={handleImportStudioJson}
			/>
			<button
				type="button"
				class="btn btn-accent"
				disabled={syncingJson}
				onclick={() => fileInputEl?.click()}
			>
				{syncingJson ? '⏳ Đang nhập gói...' : '📥 Nhập gói từ Studio (.json)'}
			</button>
			<a class="btn btn-ghost" href="/admin/videos">🎬 Quản lý Videos ({summary.total_videos})</a>
			<a class="btn btn-ghost" href="/world" target="_blank" rel="noopener">🌍 Mở Bản đồ 3D</a>
			{#if supportsDataModes}
				<button type="button" class="btn btn-alpha" onclick={() => (showPromoteModal = true)}>
					🚀 Đẩy lên Alpha
				</button>
			{/if}
		</div>
	</header>

	<section class="stats-grid">
		<div class="stat-card">
			<span class="stat-label">⚙️ Địa danh Cơ khí</span>
			<strong class="stat-value">{summary.total_places}</strong>
		</div>
		<div class="stat-card">
			<span class="stat-label">⚔️ Ô Thế Giới Mở (Chunks)</span>
			<strong class="stat-value">{summary.total_chunks ?? 0}</strong>
		</div>
		<div class="stat-card warn">
			<span class="stat-label">Chờ duyệt (Nháp)</span>
			<strong class="stat-value">{summary.pending_places + (summary.pending_chunks ?? 0)}</strong>
		</div>
		<div class="stat-card ok">
			<span class="stat-label">Đã xuất bản</span>
			<strong class="stat-value">{summary.published_places + (summary.published_chunks ?? 0)}</strong>
		</div>
		<div class="stat-card">
			<span class="stat-label">Có Gói 3D / Phim / VN</span>
			<strong class="stat-value">{summary.with_desktop_pack + summary.with_intro_video + summary.with_vn_episode}</strong>
		</div>
	</section>

	<details class="gateway-spec">
		<summary>
			🔌 Thông số Cổng Mở Đồng Bộ sẵn sàng cho App Studio mới (<code>/api/v1/admin/sync/world-studio</code>)
		</summary>
		<div class="gateway-body">
			<p>
				Chế độ lưu trữ hiện tại: <strong>{storageMode === 'local' ? 'Ổ đĩa Local (0ms copy)' : 'Cloudinary'}</strong>.
				App Studio mới có thể bắn thẳng HTTP POST kèm Bearer Token Admin (hoặc xuất file <code>.json</code> để nhập bằng nút trên):
			</p>
			<pre>POST /api/v1/admin/sync/world-studio
&#123;
  "source_app": "Selorson World &amp; VN Studio",
  "locations": [&#123;
    "source_key": "temple-of-zyberon",
    "slug": "temple-of-zyberon",
    "name": "Đại Đền Ngũ Giác Zyberon",
    "planet": "akunalia", "lat": 16.4, "lng": 27.9, "unlock_chapter": 1,
    "local_image_path": "E:/.../preview.jpg",
    "local_intro_video_path": "E:/.../zyberon_intro.mp4",
    "desktop_pack_url": "https://.../zyberon_pack.zip",
    "vn_episode_url": "https://.../vn_ep01.json",
    "en": &#123; "name": "Pentagonal Temple of Zyberon", "description": "..." &#125;
  &#125;],
  "videos": [&#123; "video_name": "Intro Akunalia", "video_type": "intro", "local_video_path": "E:/.../intro.mp4" &#125;]
&#125;</pre>
			<p class="gateway-note">
				Độc giả &amp; App Desktop tải danh sách gói mở khóa chống spoil qua:
				<code>GET /api/v1/world/packs?read_up_to=...</code>
			</p>
		</div>
	</details>

	<section class="filter-bar">
		<div class="pill-group">
			<button
				type="button"
				class="pill"
				class:active={modeFilter === 'all'}
				onclick={() => (modeFilter = 'all')}
			>
				Tất cả ({items.length})
			</button>
			<button
				type="button"
				class="pill"
				class:active={modeFilter === 'clockwork'}
				onclick={() => (modeFilter = 'clockwork')}
			>
				⚙️ Sa Bàn Cơ Khí ({summary.total_places})
			</button>
			<button
				type="button"
				class="pill"
				class:active={modeFilter === 'chunks'}
				onclick={() => (modeFilter = 'chunks')}
			>
				⚔️ Ô Thế Giới Mở ({summary.total_chunks ?? 0})
			</button>
		</div>

		<div class="pill-group">
			<button
				type="button"
				class="pill"
				class:active={planetFilter === 'all'}
				onclick={() => (planetFilter = 'all')}
			>
				Mọi hành tinh
			</button>
			<button
				type="button"
				class="pill"
				class:active={planetFilter === 'akunalia'}
				onclick={() => (planetFilter = 'akunalia')}
			>
				🪐 Akunalia
			</button>
			<button
				type="button"
				class="pill"
				class:active={planetFilter === 'earth'}
				onclick={() => (planetFilter = 'earth')}
			>
				🌍 Trái Đất
			</button>
		</div>

		<div class="pill-group">
			<button
				type="button"
				class="pill"
				class:active={statusFilter === 'all'}
				onclick={() => (statusFilter = 'all')}
			>
				Mọi trạng thái
			</button>
			<button
				type="button"
				class="pill"
				class:active={statusFilter === 'pending'}
				onclick={() => (statusFilter = 'pending')}
			>
				📝 Chờ duyệt
			</button>
			<button
				type="button"
				class="pill"
				class:active={statusFilter === 'active'}
				onclick={() => (statusFilter = 'active')}
			>
				✅ Đã xuất bản
			</button>
		</div>

		<input
			type="search"
			class="search-input"
			placeholder="Tìm tên địa danh, slug, tên Tiếng Anh..."
			bind:value={searchQuery}
		/>

		{#if pendingInFiltered.length > 0}
			<button
				type="button"
				class="btn btn-publish-batch"
				disabled={batchPublishing}
				onclick={publishFilteredPending}
			>
				✨ Duyệt xuất bản ({pendingInFiltered.length})
			</button>
		{/if}
	</section>

	{#if loading}
		<div class="empty-box">Đang tải danh sách địa danh...</div>
	{:else if filteredItems.length === 0}
		<div class="empty-box">
			Chưa có địa danh nào khớp bộ lọc. Anh có thể đồng bộ từ Co-Writer hoặc nhập gói
			<code>.json</code> từ App World Studio.
		</div>
	{:else}
		<div class="place-list">
			{#each filteredItems as row (row.id)}
				{@const planet = detectPlanet(row)}
				{@const w = row.world ?? {}}
				<article class="place-card" class:draft={!row.is_active}>
					<div class="thumb-col">
						{#if row.image_url}
							<img src={row.image_url} alt={row.name} />
						{:else}
							<div class="thumb-placeholder">{planet === 'earth' ? '🌍' : '🪐'}</div>
						{/if}
					</div>

					<div class="info-col">
						<div class="title-row">
							<h3>{row.name}</h3>
							<span class="badge" class:published={row.is_active} class:pending={!row.is_active}>
								{row.is_active ? 'Đã xuất bản' : 'Nháp · Chờ duyệt'}
							</span>
							<span class="badge planet-badge">
								{planet === 'earth' ? '🌍 Trái Đất' : '🪐 Akunalia'}
							</span>
							{#if row.en_translation?.name}
								<span class="badge en-badge">🇬🇧 EN</span>
							{/if}
						</div>

						<div class="meta-row">
							<code>/{row.slug}</code>
							{#if w.lat !== undefined && w.lng !== undefined}
								<span>📍 {Number(w.lat).toFixed(2)}°, {Number(w.lng).toFixed(2)}°</span>
							{/if}
							{#if w.unlock_chapter}
								<span>🔓 Chương {w.unlock_chapter}</span>
							{/if}
							{#if w.intro_video_url}
								<span class="res-tag video">🎬 Có Intro</span>
							{/if}
							{#if w.desktop_pack_url}
								<span class="res-tag pack">🎮 Có Pack 3D</span>
							{/if}
							{#if w.vn_episode_url}
								<span class="res-tag vn">🎭 Có Tập VN</span>
							{/if}
						</div>

						{#if row.description}
							<p class="desc-clamp">{row.description}</p>
						{/if}
					</div>

					<div class="action-col">
						<a class="btn-sm" href={previewHref(row)} target="_blank" rel="noopener">
							👁️ Xem
						</a>
						<button type="button" class="btn-sm" onclick={() => openEditModal(row)}>
							✏️ Duyệt / Sửa
						</button>
						<button
							type="button"
							class="btn-sm"
							class:primary={!row.is_active}
							onclick={() => togglePublishRow(row)}
						>
							{row.is_active ? '🙈 Về Nháp' : '✨ Xuất bản'}
						</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

{#if editingItem}
	<div class="modal-backdrop" role="presentation" onclick={() => (editingItem = null)}>
		<div
			class="modal-card"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && (editingItem = null)}
		>
			<header class="modal-head">
				<h2>✏️ Duyệt & Gắn Tài Nguyên — {editingItem.name}</h2>
				<button type="button" class="close-x" onclick={() => (editingItem = null)}>×</button>
			</header>

			<div class="modal-body">
				<div class="form-grid">
					<label>
						Tên địa danh (VI)
						<input bind:value={editForm.name} />
					</label>
					<label>
						Slug trên `/world`
						<input bind:value={editForm.slug} placeholder="temple-of-zyberon" />
					</label>
					<label>
						Hành tinh
						<select bind:value={editForm.planet}>
							<option value="akunalia">🪐 Akunalia (Saga II)</option>
							<option value="earth">🌍 Trái Đất (Saga I)</option>
						</select>
					</label>
					<label>
						Thuộc vùng (Region slug)
						<input bind:value={editForm.region} placeholder="zyberon-basin" />
					</label>
					<label>
						Vĩ độ (lat)
						<input type="number" step="0.01" bind:value={editForm.lat} />
					</label>
					<label>
						Kinh độ (lng)
						<input type="number" step="0.01" bind:value={editForm.lng} />
					</label>
					<label>
						Mở khóa từ Chương
						<input type="number" bind:value={editForm.unlock_chapter} placeholder="1" />
					</label>
					<label class="checkbox-inline">
						<input type="checkbox" bind:checked={editForm.is_active} />
						<span>Xuất bản công khai lên `/world` & Thư viện</span>
					</label>
				</div>

				<label class="full-field">
					Ảnh đại diện / Concept Art (URL)
					<input bind:value={editForm.image_url} placeholder="https://..." />
				</label>

				<label class="full-field">
					Mô tả Thuyết minh (VI)
					<textarea rows="3" bind:value={editForm.description}></textarea>
				</label>

				<fieldset class="sub-box">
					<legend>🔌 Tài nguyên nhận từ World / VN / Film Studio</legend>
					<div class="form-grid">
						<label>
							🎬 Video Intro / Phim ngắn (MP4 / YouTube)
							<input bind:value={editForm.intro_video_url} placeholder="https://.../intro.mp4" />
						</label>
						<label>
							🎮 Gói Thế Giới 3D Desktop (URL)
							<input bind:value={editForm.desktop_pack_url} placeholder="https://.../pack.zip" />
						</label>
						<label>
							Phiên bản Gói 3D
							<input bind:value={editForm.desktop_pack_version} placeholder="1.0.0" />
						</label>
						<label>
							🎭 Tập Visual Novel (URL)
							<input bind:value={editForm.vn_episode_url} placeholder="https://.../ep01.json" />
						</label>
						<label>
							Tiêu đề Tập Visual Novel
							<input bind:value={editForm.vn_episode_title} placeholder="Khúc Dạo Đầu..." />
						</label>
					</div>
				</fieldset>

				<fieldset class="sub-box">
					<legend>🇬🇧 Bản dịch Tiếng Anh (EN)</legend>
					<label class="full-field">
						Tên địa danh (EN)
						<input bind:value={editForm.en_name} placeholder="Pentagonal Temple of Zyberon" />
					</label>
					<label class="full-field">
						Mô tả (EN)
						<textarea rows="3" bind:value={editForm.en_description}></textarea>
					</label>
				</fieldset>
			</div>

			<footer class="modal-foot">
				<button type="button" class="btn btn-ghost" onclick={() => (editingItem = null)}>
					Hủy
				</button>
				<button type="button" class="btn btn-accent" disabled={savingEdit} onclick={saveEditModal}>
					{savingEdit ? '⏳ Đang lưu...' : '💾 Lưu & Cập nhật'}
				</button>
			</footer>
		</div>
	</div>
{/if}

{#if showPromoteModal}
	<BetaToAlphaPromoteModal
		open={showPromoteModal}
		onclose={() => (showPromoteModal = false)}
		onpromoted={() => loadOverview()}
	/>
{/if}

<style>
	.world-admin-page {
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
		color: #e2e8f0;
	}
	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: #38bdf8;
	}
	.page-head h1 {
		margin: 0.15rem 0 0.35rem;
		font-size: 1.45rem;
	}
	.subtitle {
		margin: 0;
		max-width: 46rem;
		font-size: 0.86rem;
		line-height: 1.55;
		color: #94a3b8;
	}
	.head-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.btn {
		padding: 0.52rem 0.95rem;
		border-radius: 8px;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		border: 1px solid rgba(255, 255, 255, 0.14);
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.btn-accent {
		background: #0c713d;
		border-color: #10b981;
		color: #fff;
	}
	.btn-ghost {
		background: rgba(255, 255, 255, 0.05);
		color: #e2e8f0;
	}
	.btn-alpha {
		background: rgba(99, 102, 241, 0.2);
		border-color: rgba(129, 140, 248, 0.5);
		color: #c7d2fe;
	}
	.btn-publish-batch {
		background: rgba(245, 158, 11, 0.18);
		border-color: #f59e0b;
		color: #fde68a;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem;
	}
	.stat-card {
		padding: 0.85rem 1rem;
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.65);
		border: 1px solid rgba(255, 255, 255, 0.08);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.stat-card.warn {
		border-color: rgba(245, 158, 11, 0.35);
	}
	.stat-card.ok {
		border-color: rgba(16, 185, 129, 0.35);
	}
	.stat-label {
		font-size: 0.75rem;
		color: #94a3b8;
	}
	.stat-value {
		font-size: 1.35rem;
		color: #f8fafc;
	}

	.gateway-spec {
		background: rgba(15, 23, 42, 0.55);
		border: 1px solid rgba(56, 189, 248, 0.25);
		border-radius: 10px;
		padding: 0.7rem 1rem;
		font-size: 0.82rem;
	}
	.gateway-spec summary {
		cursor: pointer;
		font-weight: 600;
		color: #7dd3fc;
	}
	.gateway-body {
		margin-top: 0.65rem;
		color: #cbd5e1;
	}
	.gateway-body pre {
		background: #090e17;
		padding: 0.75rem;
		border-radius: 8px;
		overflow-x: auto;
		font-size: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.gateway-note {
		margin: 0.4rem 0 0;
		font-size: 0.78rem;
		color: #94a3b8;
	}

	.filter-bar {
		display: flex;
		gap: 0.65rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.pill-group {
		display: flex;
		gap: 0.3rem;
		background: rgba(15, 23, 42, 0.6);
		padding: 0.22rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.pill {
		padding: 0.35rem 0.7rem;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: #94a3b8;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.pill.active {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		font-weight: 600;
	}
	.search-input {
		flex: 1;
		min-width: 14rem;
		padding: 0.48rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(15, 23, 42, 0.7);
		color: #f8fafc;
		font: inherit;
		font-size: 0.82rem;
	}

	.place-list {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	.place-card {
		display: grid;
		grid-template-columns: 5.5rem 1fr auto;
		gap: 0.9rem;
		align-items: center;
		padding: 0.8rem 1rem;
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.62);
		border: 1px solid rgba(255, 255, 255, 0.09);
	}
	.place-card.draft {
		border-left: 3px solid #f59e0b;
	}
	.thumb-col img,
	.thumb-placeholder {
		width: 5.5rem;
		height: 3.6rem;
		border-radius: 8px;
		object-fit: cover;
		background: #0b1322;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.4rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.title-row h3 {
		margin: 0;
		font-size: 0.98rem;
	}
	.badge {
		font-size: 0.68rem;
		padding: 0.14rem 0.5rem;
		border-radius: 999px;
		font-weight: 600;
	}
	.badge.published {
		background: rgba(16, 185, 129, 0.18);
		color: #6ee7b7;
	}
	.badge.pending {
		background: rgba(245, 158, 11, 0.2);
		color: #fcd34d;
	}
	.planet-badge {
		background: rgba(56, 189, 248, 0.15);
		color: #7dd3fc;
	}
	.en-badge {
		background: rgba(168, 85, 247, 0.18);
		color: #d8b4fe;
	}
	.meta-row {
		display: flex;
		gap: 0.65rem;
		flex-wrap: wrap;
		align-items: center;
		margin-top: 0.3rem;
		font-size: 0.76rem;
		color: #94a3b8;
	}
	.res-tag {
		padding: 0.1rem 0.45rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.08);
		color: #f1f5f9;
	}
	.desc-clamp {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		color: #cbd5e1;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.action-col {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.btn-sm {
		padding: 0.38rem 0.68rem;
		border-radius: 7px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: #e2e8f0;
		font: inherit;
		font-size: 0.76rem;
		cursor: pointer;
		text-decoration: none;
	}
	.btn-sm.primary {
		background: rgba(16, 185, 129, 0.2);
		border-color: #10b981;
		color: #a7f3d0;
	}
	.empty-box {
		padding: 2.2rem;
		text-align: center;
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.5);
		border: 1px dashed rgba(255, 255, 255, 0.14);
		color: #94a3b8;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		background: rgba(4, 8, 15, 0.8);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.modal-card {
		width: min(100%, 48rem);
		max-height: calc(100dvh - 2rem);
		background: #0f172a;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.modal-head,
	.modal-foot {
		padding: 0.9rem 1.2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.modal-foot {
		border-bottom: none;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.modal-head h2 {
		margin: 0;
		font-size: 1.02rem;
	}
	.close-x {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 1.4rem;
		cursor: pointer;
	}
	.modal-body {
		padding: 1rem 1.2rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.65rem;
	}
	.modal-body label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.78rem;
		color: #cbd5e1;
	}
	.modal-body label.checkbox-inline {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		padding-top: 1.2rem;
	}
	.modal-body input:not([type='checkbox']),
	.modal-body select,
	.modal-body textarea {
		padding: 0.45rem 0.65rem;
		border-radius: 7px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #090f1d;
		color: #f8fafc;
		font: inherit;
		font-size: 0.82rem;
	}
	.sub-box {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		padding: 0.75rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	.sub-box legend {
		font-size: 0.78rem;
		font-weight: 600;
		color: #7dd3fc;
		padding: 0 0.35rem;
	}

	@media (max-width: 768px) {
		.place-card {
			grid-template-columns: 1fr;
		}
	}
</style>
