<script lang="ts">
	import AdminCrudTable from '$lib/components/admin/AdminCrudTable.svelte';
	import { adminGet, adminPost, adminDelete, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let items = $state<Record<string, unknown>[]>([]);
	let importingBundle = $state(false);

	// Trạng thái Hộp thoại Đồng bộ Chương Chữ & Thực thể trực tiếp từ Co-Writer trên cùng máy
	let showLocalSyncModal = $state(false);
	let loadingCatalog = $state(false);
	let syncingLocal = $state(false);
	let catalog = $state<any>(null);

	let selectedChapterRef = $state('none'); // e.g. "canon:3" | "draft:7" | "writer:1" | "none"
	let targetChapterNo = $state(1);
	let syncEntities = $state(true);
	let uploadEntityImages = $state(true);

	const columns = [
		{ key: 'id', label: 'ID' },
		{ key: 'chapter_number', label: 'Số' },
		{ key: 'title', label: 'Tiêu đề' },
		{ key: 'prose_summary', label: 'Độ dài Chữ' },
		{ key: 'status', label: 'Trạng thái Chương', type: 'status' as const },
		{ key: 'created_at', label: 'Ngày tạo', type: 'date' as const }
	];

	async function fetchItems() {
		try {
			const r = await adminGet<Record<string, unknown>[]>('/admin/chapters');
			if (r.success && Array.isArray(r.data)) {
				items = r.data.map((ch) => {
					const blocks = Array.isArray(ch.content_blocks) ? ch.content_blocks : [];
					const pCount = blocks.filter((b: any) => b?.type === 'paragraph').length;
					const words = String(ch.content || '')
						.trim()
						.split(/\s+/)
						.filter(Boolean).length;
					const prose_summary =
						words > 0 ? `${words.toLocaleString('vi-VN')} từ (${pCount} đoạn)` : pCount > 0 ? `${pCount} đoạn` : 'Chưa có chữ';
					return { ...ch, prose_summary };
				});
			}
		} catch {}
	}

	function goToEditor(item: Record<string, unknown>) {
		goto(`/admin/chapters/${item.id}`);
	}

	function goToCreate() {
		goto('/admin/chapters/new');
	}

	async function deleteItem(item: Record<string, unknown>) {
		if (!confirm('Xóa chương này?')) return;
		try {
			await adminDelete(`/admin/chapters/${item.id}`);
			toast_success('Đã xóa.');
			fetchItems();
		} catch {
			toast_error('Lỗi');
		}
	}

	async function openLocalCoWriterModal() {
		showLocalSyncModal = true;
		loadingCatalog = true;
		try {
			const res = await adminGet<any>('/admin/sync/cowriter/local');
			if (res.success && res.data) {
				catalog = res.data;
				if (catalog.available) {
					if (catalog.canon_chapters?.length > 0) {
						const first = catalog.canon_chapters[0];
						selectedChapterRef = `canon:${first.id}`;
						targetChapterNo = first.chapter_no || 1;
					} else if (catalog.draft_chapters?.length > 0) {
						const first = catalog.draft_chapters[0];
						selectedChapterRef = `draft:${first.id}`;
						targetChapterNo = first.chapter_no || 1;
					} else {
						selectedChapterRef = 'none';
					}
				}
			} else {
				toast_error(res.message || 'Không kiểm tra được dữ liệu Co-Writer trên máy');
			}
		} catch {
			toast_error('Lỗi khi đọc danh mục Co-Writer trên máy');
		}
		loadingCatalog = false;
	}

	function onChapterRefChange() {
		if (!catalog || selectedChapterRef === 'none') return;
		const [kind, rawId] = selectedChapterRef.split(':');
		const id = Number(rawId);
		const list =
			kind === 'canon'
				? catalog.canon_chapters
				: kind === 'draft'
					? catalog.draft_chapters
					: catalog.writer_sessions;
		const found = (list || []).find((x: any) => x.id === id);
		if (found?.chapter_no) {
			targetChapterNo = Number(found.chapter_no);
		}
	}

	async function handleRunLocalSync() {
		if (selectedChapterRef === 'none' && !syncEntities) {
			toast_error('Hãy chọn ít nhất 1 Chương Chữ hoặc Thực thể để đồng bộ.');
			return;
		}
		syncingLocal = true;
		try {
			let chapter_source_kind = 'none';
			let chapter_source_id: number | null = null;
			if (selectedChapterRef !== 'none') {
				const [k, rawId] = selectedChapterRef.split(':');
				chapter_source_kind = k;
				chapter_source_id = Number(rawId);
			}
			const res = await adminPost<any>('/admin/sync/cowriter/local', {
				chapter_source_kind,
				chapter_source_id,
				chapter_number: targetChapterNo,
				manga_episode_id: null,
				manga_bw_episode_id: null,
				sync_entities: syncEntities,
				upload_entity_images: uploadEntityImages
			});
			if (res.success && res.data) {
				const d = res.data;
				toast_success(
					`Đồng bộ Chương Chữ thành công (Chế độ Nháp): Chương #${d.chapter_number || targetChapterNo} · +${d.created_entities ?? 0} thực thể mới · ${d.attached_tags ?? 0} tags!`
				);
				showLocalSyncModal = false;
				await fetchItems();
			}
		} finally {
			syncingLocal = false;
		}
	}

	async function compressBase64Image(rawB64: string, maxDim = 1280, quality = 0.85): Promise<string> {
		if (!rawB64 || rawB64.length < 450_000) return rawB64;
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				let w = img.naturalWidth || img.width;
				let h = img.naturalHeight || img.height;
				if (w <= 0 || h <= 0) {
					resolve(rawB64);
					return;
				}
				if (Math.max(w, h) > maxDim) {
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
				ctx.drawImage(img, 0, 0, w, h);
				const dataUrl = canvas.toDataURL('image/jpeg', quality);
				const idx = dataUrl.indexOf(';base64,');
				resolve(idx >= 0 ? dataUrl.slice(idx + 8) : rawB64);
			};
			img.onerror = () => resolve(rawB64);
			const clean = rawB64.includes(';base64,') ? rawB64 : `data:image/png;base64,${rawB64}`;
			img.src = clean;
		});
	}

	async function handleImportCoWriterBundle(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importingBundle = true;
		try {
			const text = await file.text();
			const payload = JSON.parse(text);
			// Trang Quản lý Chapters chỉ xử lý Chương chữ + Thực thể Thư viện (bỏ qua phần Manga để xử lý bên trang Manga)
			delete payload.manga;

			if (Array.isArray(payload.entities)) {
				for (const ent of payload.entities) {
					if (typeof ent.image_base64 === 'string' && ent.image_base64.length > 450_000) {
						ent.image_base64 = await compressBase64Image(ent.image_base64, 1280, 0.85);
					}
				}
			}

			const res = await adminPost<any>('/admin/sync/cowriter', payload);
			if (res.success && res.data) {
				const d = res.data;
				toast_success(
					`Đã nhập Chương Chữ #${d.chapter_number || '?'} (Nháp) · +${d.created_entities ?? 0} thực thể mới · ${d.attached_tags ?? 0} tags!`
				);
				await fetchItems();
			}
		} catch {
			toast_error('File JSON không hợp lệ hoặc lỗi xử lý gói dữ liệu');
		}
		importingBundle = false;
		input.value = '';
	}

	onMount(fetchItems);
</script>

<svelte:head><title>Admin - Quản lý Chapters</title></svelte:head>

<div class="chapters-sync-banner">
	<div class="sync-banner-info">
		<strong>🔄 Đồng bộ Chương Truyện Chữ & Tags Thư Viện từ Co-Writer</strong>
		<span>
			Làm sạch tự động định dạng Markdown sang HTML chuẩn sách in, lưu ở trạng thái <strong>Nháp</strong> và tự động gắn sẵn toàn bộ Tags nhân vật / địa danh. (Quản lý Manga nằm riêng ở mục <a href="/admin/manga">🎨 Manga</a>).
		</span>
	</div>
	<div class="sync-banner-actions">
		<button type="button" class="sync-local-btn" onclick={openLocalCoWriterModal}>
			⚡ Lấy Chương Chữ từ Co-Writer (Cùng máy)
		</button>
		<label class="sync-upload-btn" title="Dùng khi mang gói .json từ máy khác sang">
			{importingBundle ? '⏳ Đang nạp gói .json...' : '📥 Nhập gói .json (Khác máy)'}
			<input
				type="file"
				accept=".json"
				style="display:none"
				disabled={importingBundle}
				onchange={handleImportCoWriterBundle}
			/>
		</label>
	</div>
</div>

<AdminCrudTable
	title="📖 Quản lý Chapters (Truyện Chữ)"
	{columns}
	{items}
	showCreate
	showActions
	showDelete
	oncreate={goToCreate}
	onedit={goToEditor}
	ondelete={deleteItem}
/>

{#if showLocalSyncModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="sync-modal-overlay" onclick={() => !syncingLocal && (showLocalSyncModal = false)}>
		<div class="sync-modal-card" onclick={(e) => e.stopPropagation()}>
			<div class="sync-modal-head">
				<h3>⚡ Đồng bộ Chương Truyện Chữ từ Co-Writer</h3>
				<button
					type="button"
					class="sync-close-btn"
					disabled={syncingLocal}
					onclick={() => (showLocalSyncModal = false)}>✕</button
				>
			</div>

			{#if loadingCatalog}
				<p class="sync-status-msg">⏳ Đang đọc kho dữ liệu Co-Writer trên máy...</p>
			{:else if !catalog?.available}
				<div class="sync-unavailable">
					<p>{catalog?.message || 'Không tìm thấy kho dữ liệu Co-Writer trên máy này.'}</p>
					<p>Nếu Co-Writer nằm ở máy khác, bạn hãy dùng nút <strong>📥 Nhập gói .json (Khác máy)</strong>.</p>
				</div>
			{:else}
				<div class="sync-form">
					<div class="sync-db-badge">
						📂 Đã kết nối kho Co-Writer: <code>{catalog.db_path}</code> ({catalog.entities_count} thực thể · {catalog.sketches_count} ảnh mẫu)
					</div>

					<label class="sync-field">
						<span>1. Chọn Chương Truyện Chữ muốn lấy (sẽ lưu ở trạng thái <strong>Nháp</strong>):</span>
						<select bind:value={selectedChapterRef} onchange={onChapterRefChange}>
							<option value="none">— Không lấy chương chữ (Chỉ đồng bộ Thực thể Thư viện) —</option>
							{#if catalog.canon_chapters?.length > 0}
								<optgroup label="✅ Chương đã duyệt (Canon)">
									{#each catalog.canon_chapters as c}
										<option value="canon:{c.id}">
											Chương {c.chapter_no}: {c.title || 'Không tiêu đề'} ({c.word_count} từ)
										</option>
									{/each}
								</optgroup>
							{/if}
							{#if catalog.draft_chapters?.length > 0}
								<optgroup label="📝 Bản thảo (Drafts)">
									{#each catalog.draft_chapters as d}
										<option value="draft:{d.id}">
											[Bản thảo #{d.id}] Chương {d.chapter_no}: {d.title || 'Không tiêu đề'} ({d.word_count} từ)
										</option>
									{/each}
								</optgroup>
							{/if}
							{#if catalog.writer_sessions?.length > 0}
								<optgroup label="✍️ Phiên Xưởng viết">
									{#each catalog.writer_sessions as w}
										<option value="writer:{w.id}">
											[Phiên #{w.id}] Chương {w.chapter_no}: {w.title || 'Không tiêu đề'} ({w.chars} ký tự)
										</option>
									{/each}
								</optgroup>
							{/if}
						</select>
					</label>

					<label class="sync-field">
						<span>2. Số chương đích trên Selorson:</span>
						<input type="number" min="1" bind:value={targetChapterNo} />
					</label>

					<div class="sync-checks">
						<label class="sync-check-row">
							<input type="checkbox" bind:checked={syncEntities} />
							<span>
								Đồng bộ danh bạ Nhân vật & Địa danh vào Thư Viện (mặc định <strong>Đang ẩn / Chưa Publish</strong>) và tự động gắn sẵn toàn bộ Tags vào chương
							</span>
						</label>
						{#if syncEntities}
							<label class="sync-check-row">
								<input type="checkbox" bind:checked={uploadEntityImages} />
								<span>Kèm ảnh Character Sheet cho các nhân vật xuất hiện trong chương (nếu Thư Viện chưa có ảnh)</span>
							</label>
						{/if}
					</div>

					<div class="sync-modal-footer">
						<button
							type="button"
							class="btn-cancel"
							disabled={syncingLocal}
							onclick={() => (showLocalSyncModal = false)}
						>
							Hủy
						</button>
						<button
							type="button"
							class="btn-confirm-sync"
							disabled={syncingLocal}
							onclick={handleRunLocalSync}
						>
							{syncingLocal ? '⏳ Đang đồng bộ Chương Chữ...' : '🚀 Đồng bộ Chương Chữ (Nháp)'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.chapters-sync-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.9rem 1.25rem;
		margin-bottom: 1rem;
		border-radius: 0.75rem;
		background: rgba(12, 113, 61, 0.08);
		border: 1px solid rgba(12, 113, 61, 0.25);
	}
	.sync-banner-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.sync-banner-info strong {
		font-size: 0.9rem;
		color: var(--color-text-primary);
	}
	.sync-banner-info span {
		font-size: 0.78rem;
		color: var(--color-text-secondary);
	}
	.sync-banner-info a {
		color: var(--color-brand-400);
		font-weight: 700;
		text-decoration: none;
	}
	.sync-banner-info a:hover {
		text-decoration: underline;
	}
	.sync-banner-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.sync-local-btn {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		background: linear-gradient(135deg, var(--color-brand-500), #059669);
		border: none;
		color: #fff;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}
	.sync-local-btn:hover {
		filter: brightness(1.1);
	}
	.sync-upload-btn {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		background: var(--color-surface-200);
		border: 1px solid var(--color-border);
		color: var(--color-text-primary);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.sync-upload-btn:hover {
		border-color: var(--color-brand-500);
	}

	/* Modal */
	.sync-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.68);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.sync-modal-card {
		background: var(--color-surface-100);
		border: 1px solid var(--color-border);
		border-radius: 0.85rem;
		width: 600px;
		max-width: 95vw;
		padding: 1.35rem 1.5rem;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
	}
	.sync-modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	.sync-modal-head h3 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--color-text-primary);
	}
	.sync-close-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 1.1rem;
		cursor: pointer;
	}
	.sync-status-msg {
		padding: 1.5rem 0;
		text-align: center;
		color: var(--color-text-secondary);
	}
	.sync-unavailable {
		padding: 1rem;
		border-radius: 0.5rem;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		font-size: 0.85rem;
	}
	.sync-form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.sync-db-badge {
		padding: 0.55rem 0.75rem;
		border-radius: 0.5rem;
		background: rgba(12, 113, 61, 0.1);
		border: 1px solid rgba(12, 113, 61, 0.25);
		font-size: 0.78rem;
		color: var(--color-text-secondary);
	}
	.sync-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.82rem;
		color: var(--color-text-secondary);
	}
	.sync-field select,
	.sync-field input {
		padding: 0.55rem 0.7rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.85rem;
	}
	.sync-checks {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.65rem 0.8rem;
		border-radius: 0.5rem;
		background: var(--color-surface-200);
	}
	.sync-check-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.sync-check-row input {
		margin-top: 0.2rem;
		accent-color: var(--color-brand-500);
	}
	.sync-modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 0.5rem;
	}
	.btn-cancel {
		padding: 0.5rem 1rem;
		border-radius: 0.45rem;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.btn-confirm-sync {
		padding: 0.5rem 1.15rem;
		border-radius: 0.45rem;
		border: none;
		background: linear-gradient(135deg, var(--color-brand-500), #059669);
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-confirm-sync:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
