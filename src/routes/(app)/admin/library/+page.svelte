<script lang="ts">
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import CmsEnTranslationFields from '$lib/components/admin/CmsEnTranslationFields.svelte';
	import WorldPlacementFields from '$lib/components/admin/WorldPlacementFields.svelte';
	import BetaToAlphaPromoteModal from '$lib/components/desktop/BetaToAlphaPromoteModal.svelte';
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		adminUpload,
		toast_success,
		toast_error
	} from '$lib/stores/admin.svelte';
	import { onMount } from 'svelte';

	interface LibraryItemRow {
		id: number;
		name: string;
		category: string;
		description?: string | null;
		image_url?: string | null;
		image_ratio?: string | null;
		display_order: number;
		is_active: boolean;
		extra_data?: Record<string, unknown> | null;
		translations?: Record<
			string,
			{
				name?: string;
				description?: string | null;
				role?: string | null;
				aliases?: string[];
			}
		>;
		[key: string]: unknown;
	}

	const LIB_EN_SPECS = [
		{
			key: 'name',
			label: 'Tên thực thể Tiếng Anh (EN — bắt buộc nếu bật bản dịch EN)',
			placeholder: 'VD: Dipterocarp Forest, Hokabe Pha...'
		},
		{
			key: 'role',
			label: 'Vai trò / Phân loại phụ (EN)',
			placeholder: 'VD: Protagonist, Origin Zone, Ancient Relic...'
		},
		{
			key: 'aliases',
			label: 'Bí danh Tiếng Anh (cách nhau bằng dấu phẩy — dùng gạch chân tra cứu trong câu văn EN)',
			placeholder: 'VD: Southern Woods, The Blind Wanderer'
		},
		{
			key: 'description',
			label: 'Mô tả thực thể (EN)',
			placeholder: 'Mô tả tiếng Anh hiển thị trong Thư Viện Thế Giới & Bản Đồ 3D...',
			multiline: true,
			rows: 4
		}
	];

	let items = $state<LibraryItemRow[]>([]);
	let loading = $state(true);
	let showForm = $state(false);
	let editing = $state<LibraryItemRow | null>(null);
	let uploadingImage = $state(false);
	let imageInput = $state<HTMLInputElement>();
	let syncFileInput = $state<HTMLInputElement>();
	let syncingBundle = $state(false);
	let syncingLocal = $state(false);
	let showPromoteModal = $state(false);

	// Filters (World-Bible style)
	let searchQuery = $state('');
	let categoryFilter = $state('all');
	let statusFilter = $state<'all' | 'pending' | 'active'>('all');

	const CATEGORIES = [
		{ value: 'all', label: 'Tất cả', icon: '🌐' },
		{ value: 'character', label: 'Nhân vật', icon: '👤' },
		{ value: 'location', label: 'Địa điểm', icon: '🗺️' },
		{ value: 'world_chunk', label: 'Ô Thế Giới Mở', icon: '🧭' },
		{ value: 'item', label: 'Vật phẩm', icon: '⚔️' },
		{ value: 'faction', label: 'Thế lực', icon: '🏛️' },
		{ value: 'creature', label: 'Sinh vật', icon: '🐉' },
		{ value: 'magic', label: 'Cổ pháp / Kỹ năng', icon: '✨' },
		{ value: 'event', label: 'Sự kiện', icon: '⏳' },
		{ value: 'concept', label: 'Khái niệm', icon: '🔮' },
		{ value: 'lore', label: 'Truyền thuyết / Lore', icon: '📜' }
	];

	function categoryLabel(cat: string): string {
		return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
	}

	function categoryIcon(cat: string): string {
		return CATEGORIES.find((c) => c.value === cat)?.icon ?? '📦';
	}

	function getAliases(item: LibraryItemRow): string[] {
		const raw = item.extra_data?.aliases;
		if (Array.isArray(raw)) {
			return raw.map((x) => String(x).trim()).filter(Boolean);
		}
		return [];
	}

	function getRole(item: LibraryItemRow): string {
		const r = item.extra_data?.role;
		return typeof r === 'string' ? r : '';
	}

	function getFirstChapter(item: LibraryItemRow): number | null {
		const fc = item.extra_data?.first_chapter;
		const n = Number(fc);
		return Number.isFinite(n) && n > 0 ? n : null;
	}

	function getCowriterKey(item: LibraryItemRow): string {
		const k = item.extra_data?.cowriter_key;
		return typeof k === 'string' ? k : '';
	}

	let pendingCount = $derived(items.filter((i) => !i.is_active).length);
	let activeCount = $derived(items.filter((i) => i.is_active).length);
	let batchPublishingLore = $state(false);

	let filteredItems = $derived(
		items.filter((item) => {
			if (statusFilter === 'pending' && item.is_active) return false;
			if (statusFilter === 'active' && !item.is_active) return false;
			if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
			if (!searchQuery.trim()) return true;
			const q = searchQuery.trim().toLowerCase();
			const inName = item.name.toLowerCase().includes(q);
			const inDesc = (item.description ?? '').toLowerCase().includes(q);
			const inAliases = getAliases(item).some((a) => a.toLowerCase().includes(q));
			const inRole = getRole(item).toLowerCase().includes(q);
			const inKey = getCowriterKey(item).toLowerCase().includes(q);
			const enTr = item.translations?.en;
			const inEn =
				(enTr?.name ?? '').toLowerCase().includes(q) ||
				(enTr?.role ?? '').toLowerCase().includes(q) ||
				(Array.isArray(enTr?.aliases) &&
					enTr.aliases.some((a) => String(a).toLowerCase().includes(q)));
			return inName || inDesc || inAliases || inRole || inKey || inEn;
		})
	);

	let pendingInFiltered = $derived(filteredItems.filter((i) => !i.is_active));

	async function publishFilteredPendingLore() {
		const ids = pendingInFiltered.map((i) => i.id);
		if (ids.length === 0 || batchPublishingLore) return;
		if (
			!confirm(
				`Xuất bản công khai ${ids.length} thực thể Thư viện đang ẩn (theo bộ lọc hiện tại) ra Thư Viện & Bản Đồ 3D?`
			)
		)
			return;
		batchPublishingLore = true;
		try {
			const res = await adminPost<any>('/admin/publish-batch', {
				chapter_ids: [],
				manga_chapter_ids: [],
				library_item_ids: ids,
				action: 'publish'
			});
			if (res.success) {
				toast_success(
					`Đã xuất bản công khai ${res.data?.updated_library ?? ids.length} thực thể Thư viện!`
				);
				await fetchItems();
			} else {
				toast_error(res.message || 'Lỗi khi xuất bản hàng loạt');
			}
		} catch {
			toast_error('Lỗi khi xuất bản hàng loạt');
		} finally {
			batchPublishingLore = false;
		}
	}

	const emptyForm = () => ({
		name: '',
		category: 'character',
		description: '',
		image_url: '',
		image_ratio: '1:1',
		display_order: 0,
		is_active: false,
		aliasesText: '',
		role: '',
		first_chapter: '' as string | number,
		cowriter_key: '',
		extra_data: null as Record<string, unknown> | null
	});

	let form = $state(emptyForm());
	let enFields = $state<Record<string, string>>({
		name: '',
		role: '',
		aliases: '',
		description: ''
	});
	let hadExistingEn = $state(false);

	async function fetchItems() {
		loading = true;
		try {
			const r = await adminGet<LibraryItemRow[]>('/admin/library');
			if (r.success && Array.isArray(r.data)) {
				items = r.data;
			}
		} catch {}
		loading = false;
	}

	function openCreate() {
		editing = null;
		form = emptyForm();
		enFields = { name: '', role: '', aliases: '', description: '' };
		hadExistingEn = false;
		showForm = true;
	}

	function openEdit(item: LibraryItemRow) {
		editing = item;
		const extra = item.extra_data ? { ...item.extra_data } : null;
		form = {
			name: item.name ?? '',
			category: item.category ?? 'character',
			description: item.description ?? '',
			image_url: item.image_url ?? '',
			image_ratio: item.image_ratio ?? '1:1',
			display_order: item.display_order ?? 0,
			is_active: item.is_active ?? false,
			aliasesText: getAliases(item).join(', '),
			role: getRole(item),
			first_chapter: getFirstChapter(item) ?? '',
			cowriter_key: getCowriterKey(item),
			extra_data: extra
		};
		const en = item.translations?.en;
		enFields = {
			name: en?.name ?? '',
			role: en?.role ?? '',
			aliases: Array.isArray(en?.aliases) ? en.aliases.join(', ') : '',
			description: en?.description ?? ''
		};
		hadExistingEn = Boolean(
			en?.name?.trim() || en?.role?.trim() || en?.description?.trim() || en?.aliases?.length
		);
		showForm = true;
	}

	function buildPayload() {
		const baseExtra: Record<string, unknown> = form.extra_data ? { ...form.extra_data } : {};
		const aliases = form.aliasesText
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		baseExtra.aliases = aliases;

		if (form.role.trim()) {
			baseExtra.role = form.role.trim();
		} else {
			delete baseExtra.role;
		}

		const fc = Number(form.first_chapter);
		if (Number.isFinite(fc) && fc > 0) {
			baseExtra.first_chapter = fc;
		} else {
			delete baseExtra.first_chapter;
		}

		if (form.cowriter_key.trim()) {
			baseExtra.cowriter_key = form.cowriter_key.trim();
		} else {
			delete baseExtra.cowriter_key;
		}

		return {
			name: form.name.trim(),
			category: form.category,
			description: form.description,
			image_url: form.image_url || null,
			image_ratio: form.image_ratio,
			display_order: Number(form.display_order) || 0,
			is_active: form.is_active,
			extra_data: baseExtra
		};
	}

	async function syncLibraryEnTranslation(itemId: number | undefined | null) {
		const id = Number(itemId);
		if (!Number.isFinite(id) || id <= 0) return;
		const hasAny =
			Boolean(enFields.name?.trim()) ||
			Boolean(enFields.role?.trim()) ||
			Boolean(enFields.aliases?.trim()) ||
			Boolean(enFields.description?.trim());
		if (!hasAny && !hadExistingEn) return;
		if (hasAny && !enFields.name?.trim()) {
			toast_error('Nếu nhập bản dịch Tiếng Anh cho thực thể, vui lòng điền Tên thực thể (EN).');
			return;
		}
		await adminPut(`/admin/library/${id}/translations/en`, {
			name: enFields.name ?? '',
			role: enFields.role ?? '',
			aliases: enFields.aliases ?? '',
			description: enFields.description ?? ''
		});
	}

	async function saveItem() {
		try {
			const payload = buildPayload();
			if (editing) {
				const r = await adminPut<any>(`/admin/library/${editing.id}`, payload);
				if (!r.success) {
					toast_error(r.message || 'Lỗi cập nhật');
					return;
				}
				await syncLibraryEnTranslation(editing.id);
				toast_success('Đã cập nhật thực thể Thư viện!');
			} else {
				const r = await adminPost<any>('/admin/library', payload);
				if (!r.success) {
					toast_error(r.message || 'Lỗi tạo mới');
					return;
				}
				await syncLibraryEnTranslation(Number(r.data?.id));
				toast_success('Đã tạo thực thể mới!');
			}
			showForm = false;
			fetchItems();
		} catch {
			toast_error('Lỗi khi lưu');
		}
	}

	async function togglePublish(item: LibraryItemRow) {
		const nextState = !item.is_active;
		try {
			const r = await adminPut(`/admin/library/${item.id}`, {
				name: item.name,
				category: item.category,
				description: item.description,
				image_url: item.image_url,
				image_ratio: item.image_ratio ?? '1:1',
				display_order: item.display_order ?? 0,
				is_active: nextState
			});
			if (r.success) {
				item.is_active = nextState;
				toast_success(
					nextState
						? `Đã xuất bản "${item.name}" ra Thư Viện & Bản Đồ!`
						: `Đã chuyển "${item.name}" về trạng thái Ẩn (Chờ duyệt).`
				);
			} else {
				toast_error(r.message || 'Không đổi được trạng thái');
			}
		} catch {
			toast_error('Lỗi kết nối');
		}
	}

	async function deleteItem(item: LibraryItemRow) {
		if (!confirm(`Xóa "${item.name}" khỏi Thư Viện?`)) return;
		try {
			await adminDelete(`/admin/library/${item.id}`);
			toast_success('Đã xóa thực thể.');
			fetchItems();
		} catch {
			toast_error('Lỗi khi xóa');
		}
	}

	async function uploadImage(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (!f) return;
		uploadingImage = true;
		try {
			const fd = new FormData();
			fd.append('image', f);
			fd.append('folder', 'library');
			const r = await adminUpload<{ url: string }>('/upload/image', fd);
			if (r.success) {
				form.image_url = r.data.url;
				toast_success('Upload hình thành công!');
			} else {
				toast_error(r.message || 'Upload lỗi');
			}
		} catch {
			toast_error('Upload lỗi');
		} finally {
			uploadingImage = false;
		}
	}

	async function compressBase64Image(rawB64: string, maxDim = 1280, quality = 0.85): Promise<string> {
		if (!rawB64 || rawB64.length < 450_000) return rawB64;
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				let w = img.naturalWidth || img.width;
				let h = img.naturalHeight || img.height;
				if (w > maxDim || h > maxDim) {
					const scale = maxDim / Math.max(w, h);
					w = Math.max(1, Math.round(w * scale));
					h = Math.max(1, Math.round(h * scale));
				}
				const canvas = document.createElement('canvas');
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve(rawB64);
					return;
				}
				ctx.fillStyle = '#0d1315';
				ctx.fillRect(0, 0, w, h);
				ctx.drawImage(img, 0, 0, w, h);
				const dataUrl = canvas.toDataURL('image/jpeg', quality);
				const idx = dataUrl.indexOf(';base64,');
				resolve(idx >= 0 ? dataUrl.slice(idx + 8) : rawB64);
			};
			img.onerror = () => resolve(rawB64);
			const clean = rawB64.startsWith('data:')
				? rawB64
				: `data:image/png;base64,${rawB64}`;
			img.src = clean;
		});
	}

	async function handleSyncLocalCowriter() {
		syncingLocal = true;
		try {
			const res = await adminPost<{
				created_entities: number;
				updated_entities: number;
				chapter_number?: number;
				attached_tags: number;
				manga_pages_synced: number;
			}>('/admin/sync/cowriter/local', {
				chapter_source_kind: 'none',
				chapter_source_id: null,
				chapter_number: null,
				manga_episode_id: null,
				manga_reading_mode: null,
				sync_entities: true,
				upload_entity_images: true
			});
			if (res.success && res.data) {
				const d = res.data;
				toast_success(
					`Đã lấy trực tiếp Danh bạ Thế giới từ Co-Writer! Tạo mới (Ẩn): ${d.created_entities}, Cập nhật: ${d.updated_entities}.`
				);
				fetchItems();
			} else {
				toast_error(res.message || 'Không lấy được dữ liệu từ Co-Writer trên máy này');
			}
		} catch {
			toast_error('Lỗi khi đọc dữ liệu Co-Writer nội bộ');
		} finally {
			syncingLocal = false;
		}
	}

	async function handleImportCowriterBundle(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (!f) return;
		syncingBundle = true;
		try {
			const text = await f.text();
			const payload = JSON.parse(text);
			// Tự động nén các ảnh PNG quá nặng (> 450KB Base64) trong gói .json cũ (ví dụ gói 330MB)
			if (Array.isArray(payload.entities)) {
				for (const ent of payload.entities) {
					if (typeof ent.image_base64 === 'string' && ent.image_base64.length > 450_000) {
						ent.image_base64 = await compressBase64Image(ent.image_base64, 1280, 0.85);
					}
				}
			}
			if (payload.manga) {
				for (const key of ['pages', 'color_pages', 'bw_pages'] as const) {
					const list = payload.manga[key];
					if (Array.isArray(list)) {
						for (const pg of list) {
							if (typeof pg?.image_base64 === 'string' && pg.image_base64.length > 650_000) {
								pg.image_base64 = await compressBase64Image(pg.image_base64, 1600, 0.88);
							}
						}
					}
				}
			}
			const res = await adminPost<{
				created_entities: number;
				updated_entities: number;
				chapter_number?: number;
				attached_tags: number;
				manga_pages_synced: number;
			}>('/admin/sync/cowriter', payload);
			if (res.success && res.data) {
				const d = res.data;
				toast_success(
					`Đồng bộ thành công! Thực thể mới (Ẩn): ${d.created_entities}, Cập nhật: ${d.updated_entities}` +
						(d.chapter_number
							? `, Chương ${d.chapter_number} (Nháp, ${d.attached_tags} tags, ${d.manga_pages_synced} trang Manga)`
							: '')
				);
				fetchItems();
			} else {
				toast_error(res.message || 'Đồng bộ thất bại');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'File JSON không hợp lệ';
			toast_error(`Lỗi đọc gói JSON: ${msg}`);
		} finally {
			syncingBundle = false;
			if (syncFileInput) syncFileInput.value = '';
		}
	}

	onMount(fetchItems);
</script>

<svelte:head><title>Admin — Thư Viện & Thế Giới</title></svelte:head>

<div class="lib-admin-page">
	<header class="lib-header">
		<div>
			<h2>📚 Thư Viện & Thực Thể Thế Giới</h2>
			<p class="subtitle">
				Trung tâm quản lý Nhân vật, Địa danh, Vật phẩm, Thế lực — kết nối trực tiếp với Tags chương truyện và Bản đồ 3D.
			</p>
		</div>
		<div class="header-actions">
			<button
				type="button"
				class="btn-sync-local"
				onclick={handleSyncLocalCowriter}
				disabled={syncingLocal}
				title="Đọc trực tiếp co_writer.db trên máy tính này mà không cần xuất/nhập file .json"
			>
				{syncingLocal ? '⏳ Đang lấy từ Co-Writer...' : '⚡ Lấy trực tiếp từ Co-Writer (Cùng máy)'}
			</button>
			<input
				type="file"
				accept=".json"
				bind:this={syncFileInput}
				onchange={handleImportCowriterBundle}
				style="display:none"
			/>
			<button
				type="button"
				class="btn-sync"
				onclick={() => syncFileInput?.click()}
				disabled={syncingBundle}
				title="Dùng khi chuyển gói dữ liệu từ máy tính khác sang"
			>
				{syncingBundle ? '⏳ Đang nhập gói...' : '📥 Nhập gói .json (Khác máy)'}
			</button>
			<button
				type="button"
				class="btn-promote-alpha"
				onclick={() => (showPromoteModal = true)}
				title="Đẩy chọn lọc Thực thể Thư viện, Bản đồ 3D & Chương truyện từ Beta lên Alpha"
			>
				🚀 Đẩy lên Alpha
			</button>
			<button type="button" class="btn-create" onclick={openCreate}>+ Thêm Thực Thể</button>
		</div>
	</header>

	{#if showPromoteModal}
		<BetaToAlphaPromoteModal
			open={showPromoteModal}
			onclose={() => (showPromoteModal = false)}
			onpromoted={fetchItems}
		/>
	{/if}

	<!-- Thanh lọc Trạng thái & Danh mục (Kiểu Kinh Thánh Thế Giới) -->
	<div class="filter-panel">
		<div class="status-tabs">
			<button
				type="button"
				class="status-tab"
				class:active={statusFilter === 'all'}
				onclick={() => (statusFilter = 'all')}
			>
				Tất cả ({items.length})
			</button>
			<button
				type="button"
				class="status-tab pending"
				class:active={statusFilter === 'pending'}
				onclick={() => (statusFilter = 'pending')}
			>
				⏳ Chờ duyệt / Đang ẩn ({pendingCount})
			</button>
			<button
				type="button"
				class="status-tab published"
				class:active={statusFilter === 'active'}
				onclick={() => (statusFilter = 'active')}
			>
				✅ Đã xuất bản ({activeCount})
			</button>

			{#if pendingInFiltered.length > 0}
				<button
					type="button"
					class="btn-batch-publish-lore"
					disabled={batchPublishingLore}
					onclick={publishFilteredPendingLore}
				>
					{batchPublishingLore
						? '⏳ Đang xuất bản...'
						: `✨ Xuất bản ${pendingInFiltered.length} thực thể đang lọc`}
				</button>
			{/if}
		</div>

		<div class="filter-bar">
			<div class="category-chips">
				{#each CATEGORIES as cat}
					<button
						type="button"
						class="cat-chip"
						class:active={categoryFilter === cat.value}
						onclick={() => (categoryFilter = cat.value)}
					>
						<span>{cat.icon}</span>
						<span>{cat.label}</span>
					</button>
				{/each}
			</div>

			<div class="search-box">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="🔍 Tìm theo tên, bí danh (aliases), vai trò..."
				/>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="empty-box">Đang tải dữ liệu Thư viện...</div>
	{:else if filteredItems.length === 0}
		<div class="empty-box">
			Không có thực thể nào khớp bộ lọc hiện tại.
		</div>
	{:else}
		<div class="entity-grid">
			{#each filteredItems as item (item.id)}
				{@const aliases = getAliases(item)}
				{@const role = getRole(item)}
				{@const firstCh = getFirstChapter(item)}
				<div class="entity-card" class:is-pending={!item.is_active}>
					<div class="card-thumb">
						{#if item.image_url}
							<img src={item.image_url} alt={item.name} loading="lazy" />
						{:else}
							<div class="thumb-placeholder">
								<span>{categoryIcon(item.category)}</span>
								<small>Chưa có hình</small>
							</div>
						{/if}
						<span class="cat-badge">{categoryIcon(item.category)} {categoryLabel(item.category)}</span>
					</div>

					<div class="card-body">
						<div class="card-title-row">
							<h3>{item.name}</h3>
							<div style="display:flex;gap:0.35rem;align-items:center;">
								{#if item.translations?.en?.name}
									<span class="en-lib-badge" title="Tên EN: {item.translations.en.name}">🇬🇧 EN</span>
								{/if}
								{#if firstCh}
									<span class="first-ch-badge" title="Chương xuất hiện đầu tiên">Ch.{firstCh}</span>
								{/if}
							</div>
						</div>

						{#if role}
							<div class="role-line">{role}</div>
						{/if}

						{#if aliases.length > 0}
							<div class="alias-list">
								{#each aliases as alias}
									<span class="alias-pill">{alias}</span>
								{/each}
							</div>
						{/if}

						<p class="desc-preview">
							{item.description || 'Chưa có mô tả chi tiết.'}
						</p>

						<div class="card-footer">
							<button
								type="button"
								class="status-toggle"
								class:published={item.is_active}
								onclick={() => togglePublish(item)}
								title="Bấm để chuyển đổi trạng thái Ẩn / Xuất bản"
							>
								{item.is_active ? '✅ Đã Publish' : '⏳ Đang ẩn (Nháp)'}
							</button>

							<div class="card-actions">
								<button type="button" class="btn-edit" onclick={() => openEdit(item)}>
									✏️ Sửa / Hình
								</button>
								<button type="button" class="btn-del" onclick={() => deleteItem(item)}>
									🗑️
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<AdminModal bind:open={showForm} title={editing ? `Sửa: ${editing.name}` : 'Tạo Thực Thể Thư Viện'} size="lg">
	<form
		class="lib-form"
		onsubmit={(e) => {
			e.preventDefault();
			saveItem();
		}}
	>
		<div class="form-row-2">
			<div class="field">
				<label>
					Tên chính *
					<input bind:value={form.name} placeholder="VD: Kael, Thành Cổ Solis..." required />
				</label>
			</div>
			<div class="field">
				<label>
					Danh mục
					<select bind:value={form.category}>
						<option value="character">👤 Nhân vật (Character)</option>
						<option value="location">🗺️ Địa điểm (Location)</option>
						<option value="world_chunk">🧭 Ô Thế Giới Mở (World Chunk)</option>
						<option value="item">⚔️ Vật phẩm (Item)</option>
						<option value="faction">🏛️ Thế lực / Tổ chức (Faction)</option>
						<option value="creature">🐉 Sinh vật (Creature)</option>
						<option value="magic">✨ Cổ pháp / Kỹ năng (Magic)</option>
						<option value="event">⏳ Sự kiện lịch sử (Event)</option>
						<option value="concept">🔮 Khái niệm / Quy luật (Concept)</option>
						<option value="lore">📜 Truyền thuyết / Lore</option>
					</select>
				</label>
			</div>
		</div>

		<div class="form-row-3">
			<div class="field">
				<label>
					Bí danh / Tên gọi khác (cách nhau bằng dấu phẩy)
					<input
						bind:value={form.aliasesText}
						placeholder="VD: Kẻ Săn Đêm, Hoàng Tử Bóng Tối"
					/>
				</label>
				<small class="hint">Dùng để tự động nhận diện và gắn Tag khi nhập chương truyện.</small>
			</div>
			<div class="field">
				<label>
					Vai trò / Phân loại phụ
					<input bind:value={form.role} placeholder="VD: Nhân vật chính, Cổ vật..." />
				</label>
			</div>
			<div class="field">
				<label>
					Chương xuất hiện đầu
					<input type="number" min="1" bind:value={form.first_chapter} placeholder="VD: 1" />
				</label>
			</div>
		</div>

		<div class="field">
			<label>
				Mô tả thực thể
				<textarea bind:value={form.description} placeholder="Mô tả hiển thị trong Thư Viện..." rows="4"></textarea>
			</label>
		</div>

		<div class="form-row-2">
			<div class="field">
				<label>
					Hình ảnh Thư Viện
					<div class="upload-row">
						<input
							type="file"
							bind:this={imageInput}
							accept="image/*"
							onchange={uploadImage}
							style="display:none"
						/>
						<button type="button" class="btn-upload" onclick={() => imageInput?.click()}>
							{uploadingImage ? '⏳ Đang tải...' : '📤 Upload hình'}
						</button>
						<input bind:value={form.image_url} placeholder="Hoặc dán URL hình ảnh..." />
					</div>
				</label>
				{#if form.image_url}
					<img src={form.image_url} alt="Preview" class="preview-thumb" />
				{/if}
			</div>

			<div class="field">
				<label>
					Tỉ lệ khung hình
					<select bind:value={form.image_ratio}>
						<option value="1:1">1:1 (Vuông)</option>
						<option value="3:4">3:4 (Chân dung)</option>
						<option value="4:3">4:3 (Ngang vừa)</option>
						<option value="16:9">16:9 (Phong cảnh)</option>
					</select>
				</label>
				<label style="margin-top:0.5rem">
					Thứ tự hiển thị
					<input bind:value={form.display_order} type="number" placeholder="0" />
				</label>
				<label style="margin-top:0.5rem">
					Mã đồng bộ Co-Writer (Tự động)
					<input bind:value={form.cowriter_key} placeholder="VD: character:kael" />
				</label>
			</div>
		</div>

		<WorldPlacementFields bind:extraData={form.extra_data} itemKey={(editing?.id as number) ?? 'new'} />

		<CmsEnTranslationFields
			bind:fields={enFields}
			specs={LIB_EN_SPECS}
			title="🇬🇧 Bản dịch Tiếng Anh cho Thực Thể (EN — Thư Viện & Gạch chân Lore)"
		/>

		<label class="checkbox-label">
			<input type="checkbox" bind:checked={form.is_active} />
			<span>✅ Xuất bản công khai trên Thư Viện & Bản Đồ 3D (Bỏ chọn để giữ ở trạng thái Nháp/Ẩn)</span>
		</label>

		<div class="form-actions">
			<button type="button" class="btn-cancel" onclick={() => (showForm = false)}>Hủy</button>
			<button type="submit" class="btn-save">{editing ? 'Lưu cập nhật' : 'Tạo thực thể'}</button>
		</div>
	</form>
</AdminModal>

<style>
	.lib-admin-page {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.lib-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.lib-header h2 {
		margin: 0;
		font-size: 1.4rem;
	}
	.subtitle {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}
	.header-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.btn-create {
		background: linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600));
		color: #fff;
		border: none;
		padding: 0.55rem 1rem;
		border-radius: var(--radius-md);
		font-weight: 600;
		cursor: pointer;
	}
	.btn-sync-local {
		background: linear-gradient(135deg, #d97706, #b45309);
		color: #fff;
		border: 1px solid rgba(251, 191, 36, 0.45);
		padding: 0.55rem 1rem;
		border-radius: var(--radius-md);
		font-weight: 600;
		cursor: pointer;
	}
	.btn-sync-local:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.btn-sync {
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		padding: 0.55rem 1rem;
		border-radius: var(--radius-md);
		font-weight: 600;
		cursor: pointer;
	}
	.btn-sync:hover {
		border-color: var(--color-brand-400);
	}
	.btn-promote-alpha {
		background: linear-gradient(135deg, #c43e2a, #991b1b);
		color: #fff;
		border: 1px solid rgba(248, 113, 113, 0.45);
		padding: 0.55rem 1rem;
		border-radius: var(--radius-md);
		font-weight: 700;
		cursor: pointer;
	}
	.btn-promote-alpha:hover {
		filter: brightness(1.08);
	}

	.filter-panel {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.status-tabs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 0.75rem;
	}
	.status-tab {
		background: var(--color-surface-200);
		border: 1px solid transparent;
		color: var(--color-text-secondary);
		padding: 0.4rem 0.85rem;
		border-radius: var(--radius-md);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}
	.status-tab.active {
		background: var(--color-brand-500);
		color: #fff;
	}
	.status-tab.pending.active {
		background: #d97706;
		color: #fff;
	}
	.btn-batch-publish-lore {
		margin-left: auto;
		padding: 0.42rem 0.95rem;
		border-radius: var(--radius-md);
		border: none;
		background: linear-gradient(135deg, #0c713d, #059669);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-batch-publish-lore:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.filter-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.category-chips {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.cat-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.cat-chip.active {
		border-color: var(--color-brand-400);
		background: rgba(12, 113, 61, 0.15);
		color: var(--color-brand-400);
		font-weight: 600;
	}
	.search-box {
		flex: 1 1 min(100%, 240px);
		min-width: 0;
		max-width: 360px;
	}
	.search-box input {
		width: 100%;
		padding: 0.45rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.85rem;
	}

	.entity-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 1rem;
	}
	.entity-card {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: transform 0.15s ease, border-color 0.15s ease;
	}
	.entity-card.is-pending {
		border-color: rgba(217, 119, 6, 0.45);
	}
	.entity-card:hover {
		transform: translateY(-2px);
	}
	.card-thumb {
		position: relative;
		height: 160px;
		background: var(--color-surface-200);
		overflow: hidden;
	}
	.card-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		gap: 0.25rem;
	}
	.thumb-placeholder span {
		font-size: 2rem;
	}
	.cat-badge {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		font-size: 0.72rem;
		backdrop-filter: blur(4px);
	}
	.card-body {
		padding: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		flex: 1;
	}
	.card-title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	.card-title-row h3 {
		margin: 0;
		font-size: 1.05rem;
	}
	.first-ch-badge {
		font-size: 0.72rem;
		padding: 0.1rem 0.45rem;
		border-radius: 6px;
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-weight: 600;
	}
	.role-line {
		font-size: 0.78rem;
		color: var(--color-brand-400);
		font-weight: 600;
	}
	.alias-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.alias-pill {
		font-size: 0.7rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
	}
	.desc-preview {
		margin: 0;
		font-size: 0.82rem;
		color: var(--color-text-muted);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
	}
	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--color-border);
		margin-top: auto;
	}
	.status-toggle {
		padding: 0.3rem 0.65rem;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid rgba(217, 119, 6, 0.5);
		background: rgba(217, 119, 6, 0.12);
		color: #f59e0b;
	}
	.status-toggle.published {
		border-color: rgba(16, 185, 129, 0.4);
		background: rgba(16, 185, 129, 0.12);
		color: #10b981;
	}
	.card-actions {
		display: flex;
		gap: 0.35rem;
	}
	.btn-edit,
	.btn-del {
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.78rem;
		cursor: pointer;
	}
	.btn-del:hover {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}
	.empty-box {
		padding: 3rem;
		text-align: center;
		background: var(--color-surface-100);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
		color: var(--color-text-muted);
	}

	/* Form styles */
	.lib-form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.form-row-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.form-row-3 {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 0.75rem;
	}
	.field label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.82rem;
		font-weight: 600;
	}
	.field input,
	.field select,
	.field textarea {
		padding: 0.5rem 0.65rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.85rem;
	}
	.hint {
		font-size: 0.73rem;
		color: var(--color-text-muted);
	}
	.upload-row {
		display: flex;
		gap: 0.5rem;
	}
	.upload-row input {
		flex: 1;
	}
	.btn-upload {
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface-300);
		color: var(--color-text-primary);
		cursor: pointer;
		white-space: nowrap;
	}
	.preview-thumb {
		margin-top: 0.5rem;
		max-height: 120px;
		border-radius: var(--radius-sm);
		object-fit: cover;
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.88rem;
		font-weight: 600;
		cursor: pointer;
	}
	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.btn-cancel {
		padding: 0.5rem 1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.btn-save {
		padding: 0.5rem 1.25rem;
		border-radius: var(--radius-sm);
		border: none;
		background: var(--color-brand-500);
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}
	.en-lib-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.1rem 0.42rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
		background: rgba(59, 130, 246, 0.16);
		color: #93c5fd;
		border: 1px solid rgba(59, 130, 246, 0.32);
		white-space: nowrap;
	}
	@media (max-width: 768px) {
		.form-row-2,
		.form-row-3 {
			grid-template-columns: 1fr;
		}
	}
</style>
