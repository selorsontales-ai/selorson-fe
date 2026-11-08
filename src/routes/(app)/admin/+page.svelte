<!-- Admin Dashboard — Stats overview + Unified Publish Moderation Station -->
<script lang="ts">
	import {
		adminGet,
		adminPost,
		toast_success,
		toast_error,
		formatDateTime
	} from '$lib/stores/admin.svelte';
	import {
		buildBatchPublishPayload,
		formatCategoryMeta,
		type PublishQueueData
	} from '$lib/home/home-hub';
	import { onMount } from 'svelte';

	interface DashboardStats {
		users: { total: number; online: number; new_today: number; active?: number; banned?: number };
		content: {
			chapters: number;
			published_chapters?: number;
			draft_chapters?: number;
			draft_manga?: number;
			videos: number;
			albums: number;
		};
		cms: {
			hero_slides: number;
			future_projects: number;
			pending_library?: number;
			total_library?: number;
		};
		support: { contacts_pending: number; contacts_total: number; messages_today: number };
		newsletter: { active: number; total: number };
		publish_queue?: {
			draft_chapters: number;
			draft_manga: number;
			pending_library: number;
			total_pending: number;
		};
	}

	let loading = $state(true);
	let stats = $state<DashboardStats | null>(null);
	let queue = $state<PublishQueueData>({
		draft_chapters: [],
		draft_manga: [],
		pending_library: [],
		draft_translations: [],
		counts: {
			draft_chapters: 0,
			draft_manga: 0,
			pending_library: 0,
			draft_translations: 0,
			total_pending: 0
		}
	});

	let activeQueueTab = $state<'all' | 'chapters' | 'translations' | 'manga' | 'library'>('all');
	let selectedChapterIds = $state<number[]>([]);
	let selectedTranslationIds = $state<number[]>([]);
	let selectedMangaChapterIds = $state<number[]>([]);
	let selectedLibraryIds = $state<number[]>([]);
	let publishingBatch = $state(false);

	let batchSummary = $derived(
		buildBatchPublishPayload(
			selectedChapterIds,
			selectedMangaChapterIds,
			selectedLibraryIds,
			'publish',
			selectedTranslationIds
		)
	);

	let totalPendingCount = $derived(
		queue.draft_chapters.length +
			(queue.draft_translations?.length ?? 0) +
			queue.draft_manga.length +
			queue.pending_library.length
	);

	async function loadDashboardAndQueue() {
		try {
			const [dashRes, queueRes] = await Promise.all([
				adminGet<DashboardStats>('/admin/dashboard'),
				adminGet<PublishQueueData>('/admin/publish-queue')
			]);
			if (dashRes.success && dashRes.data) {
				stats = dashRes.data;
			}
			if (queueRes.success && queueRes.data) {
				queue = {
					draft_chapters: queueRes.data.draft_chapters ?? [],
					draft_manga: queueRes.data.draft_manga ?? [],
					pending_library: queueRes.data.pending_library ?? [],
					draft_translations: queueRes.data.draft_translations ?? [],
					counts: queueRes.data.counts
				};
				// Clean up stale selections
				const validCh = new Set(queue.draft_chapters.map((c) => c.id));
				const validTr = new Set((queue.draft_translations ?? []).map((t) => t.id));
				const validMg = new Set(queue.draft_manga.map((m) => m.chapter_id));
				const validLb = new Set(queue.pending_library.map((l) => l.id));
				selectedChapterIds = selectedChapterIds.filter((id) => validCh.has(id));
				selectedTranslationIds = selectedTranslationIds.filter((id) => validTr.has(id));
				selectedMangaChapterIds = selectedMangaChapterIds.filter((id) => validMg.has(id));
				selectedLibraryIds = selectedLibraryIds.filter((id) => validLb.has(id));
			}
		} catch {
			// ignore
		} finally {
			loading = false;
		}
	}

	function selectAllPending() {
		if (activeQueueTab === 'chapters') {
			selectedChapterIds = queue.draft_chapters.map((c) => c.id);
		} else if (activeQueueTab === 'translations') {
			selectedTranslationIds = (queue.draft_translations ?? []).map((t) => t.id);
		} else if (activeQueueTab === 'manga') {
			selectedMangaChapterIds = queue.draft_manga.map((m) => m.chapter_id);
		} else if (activeQueueTab === 'library') {
			selectedLibraryIds = queue.pending_library.map((l) => l.id);
		} else {
			selectedChapterIds = queue.draft_chapters.map((c) => c.id);
			selectedTranslationIds = (queue.draft_translations ?? []).map((t) => t.id);
			selectedMangaChapterIds = queue.draft_manga.map((m) => m.chapter_id);
			selectedLibraryIds = queue.pending_library.map((l) => l.id);
		}
	}

	function clearSelection() {
		selectedChapterIds = [];
		selectedTranslationIds = [];
		selectedMangaChapterIds = [];
		selectedLibraryIds = [];
	}

	async function handlePublishSelected() {
		if (batchSummary.totalSelected === 0 || publishingBatch) return;
		publishingBatch = true;
		try {
			const res = await adminPost<any>('/admin/publish-batch', {
				chapter_ids: batchSummary.chapter_ids,
				translation_ids: batchSummary.translation_ids,
				manga_chapter_ids: batchSummary.manga_chapter_ids,
				library_item_ids: batchSummary.library_item_ids,
				action: 'publish'
			});
			if (res.success && res.data) {
				const d = res.data;
				toast_success(
					`Đã xuất bản thành công: ${d.updated_chapters ?? 0} Chương chữ · ${d.updated_translations ?? 0} Bản dịch · ${d.updated_manga ?? 0} Bản Manga · ${d.updated_library ?? 0} Thực thể!`
				);
				clearSelection();
				await loadDashboardAndQueue();
			} else {
				toast_error(res.message || 'Không thể xuất bản hàng loạt');
			}
		} catch {
			toast_error('Lỗi khi xuất bản hàng loạt');
		} finally {
			publishingBatch = false;
		}
	}

	async function quickPublishSingle(
		kind: 'chapter' | 'translation' | 'manga' | 'library',
		id: number,
		label: string
	) {
		if (publishingBatch) return;
		publishingBatch = true;
		try {
			const res = await adminPost<any>('/admin/publish-batch', {
				chapter_ids: kind === 'chapter' ? [id] : [],
				translation_ids: kind === 'translation' ? [id] : [],
				manga_chapter_ids: kind === 'manga' ? [id] : [],
				library_item_ids: kind === 'library' ? [id] : [],
				action: 'publish'
			});
			if (res.success) {
				toast_success(`Đã xuất bản công khai: ${label}!`);
				await loadDashboardAndQueue();
			} else {
				toast_error(res.message || 'Lỗi xuất bản');
			}
		} catch {
			toast_error('Lỗi kết nối khi xuất bản');
		} finally {
			publishingBatch = false;
		}
	}

	onMount(() => {
		loadDashboardAndQueue();
	});
</script>

<svelte:head><title>Admin Dashboard — Selorson</title></svelte:head>

<div class="admin-dashboard">
	<h1 class="page-title">📊 Admin Dashboard</h1>
	<p class="page-subtitle">Tổng quan hệ thống & Trạm Kiểm Duyệt Xuất Bản Selorson V3</p>

	{#if loading}
		<div class="loading">Đang tải thống kê & hàng đợi xuất bản...</div>
	{:else}
		<!-- Stats Cards -->
		<div class="stats-grid">
			<div class="stat-card stat-users">
				<div class="stat-header">
					<span class="stat-icon">👥</span>
					<span class="stat-trend">📥 +{stats?.users?.new_today ?? 0} hôm nay</span>
				</div>
				<span class="stat-value">{stats?.users?.total ?? 0}</span>
				<span class="stat-label">Tổng Users</span>
				<div class="stat-footer">
					<span class="online-dot"></span> {stats?.users?.online ?? 0} đang online
				</div>
			</div>

			<div class="stat-card stat-content">
				<div class="stat-header">
					<span class="stat-icon">📖</span>
					{#if (stats?.content?.draft_chapters ?? 0) > 0}
						<span class="stat-badge warn">{stats?.content?.draft_chapters} nháp</span>
					{/if}
				</div>
				<span class="stat-value">{stats?.content?.chapters ?? 0}</span>
				<span class="stat-label">Chapters</span>
				<div class="stat-footer">
					✅ {stats?.content?.published_chapters ?? stats?.content?.chapters ?? 0} đã xuất bản
				</div>
			</div>

			<div class="stat-card stat-library">
				<div class="stat-header">
					<span class="stat-icon">📚</span>
					{#if (stats?.cms?.pending_library ?? 0) > 0}
						<span class="stat-badge warn">{stats?.cms?.pending_library} ẩn</span>
					{/if}
				</div>
				<span class="stat-value">{stats?.cms?.total_library ?? 0}</span>
				<span class="stat-label">Thực Thể Thư Viện</span>
				<div class="stat-footer">
					⏳ {stats?.cms?.pending_library ?? 0} chờ kiểm duyệt
				</div>
			</div>

			<div class="stat-card stat-media">
				<div class="stat-header"><span class="stat-icon">🎬</span></div>
				<span class="stat-value">{stats?.content?.videos ?? 0}</span>
				<span class="stat-label">Videos</span>
			</div>

			<div class="stat-card stat-music">
				<div class="stat-header"><span class="stat-icon">🎵</span></div>
				<span class="stat-value">{stats?.content?.albums ?? 0}</span>
				<span class="stat-label">Albums</span>
			</div>

			<div class="stat-card stat-support">
				<div class="stat-header">
					<span class="stat-icon">✉️</span>
					{#if (stats?.support?.contacts_pending ?? 0) > 0}
						<span class="stat-badge">{stats?.support?.contacts_pending}</span>
					{/if}
				</div>
				<span class="stat-value">{stats?.support?.contacts_total ?? 0}</span>
				<span class="stat-label">Contacts</span>
				{#if (stats?.support?.contacts_pending ?? 0) > 0}
					<div class="stat-footer warning">⚠️ {stats?.support?.contacts_pending} chờ xử lý</div>
				{/if}
			</div>

			<div class="stat-card stat-newsletter">
				<div class="stat-header"><span class="stat-icon">📰</span></div>
				<span class="stat-value">{stats?.newsletter?.active ?? 0}</span>
				<span class="stat-label">Subscribers</span>
				<div class="stat-footer">📊 {stats?.newsletter?.total ?? 0} tổng cộng</div>
			</div>
		</div>

		<!-- Hạng mục 7: Trạm Kiểm Duyệt & Xuất Bản Nhanh (Co-Writer Drafts -> Published) -->
		<section class="publish-station">
			<div class="station-head">
				<div>
					<h2>🚀 Trạm Kiểm Duyệt & Xuất Bản Nhanh (`Draft → Published`)</h2>
					<p>
						Toàn bộ Chương chữ, Bản Manga và Thực thể Thư viện đồng bộ từ <strong>Co-Writer</strong> đều tập kết tại đây ở trạng thái <strong>Nháp</strong> để bạn duyệt và xuất bản chỉ với 1 cú nhấp chuột.
					</p>
				</div>

				<div class="station-actions">
					{#if totalPendingCount > 0}
						<button type="button" class="btn-select-all" onclick={selectAllPending}>
							☑️ Chọn tất cả ({totalPendingCount})
						</button>
						{#if batchSummary.totalSelected > 0}
							<button type="button" class="btn-clear-sel" onclick={clearSelection}>
								Bỏ chọn
							</button>
						{/if}
						<button
							type="button"
							class="btn-batch-publish"
							disabled={batchSummary.totalSelected === 0 || publishingBatch}
							onclick={handlePublishSelected}
						>
							{publishingBatch
								? '⏳ Đang xuất bản...'
								: `✨ Xuất bản mục đã chọn (${batchSummary.totalSelected})`}
						</button>
					{/if}
				</div>
			</div>

			<div class="station-tabs">
				<button
					type="button"
					class:active={activeQueueTab === 'all'}
					onclick={() => (activeQueueTab = 'all')}
				>
					Tất cả chờ duyệt ({totalPendingCount})
				</button>
				<button
					type="button"
					class:active={activeQueueTab === 'chapters'}
					onclick={() => (activeQueueTab = 'chapters')}
				>
					📖 Chương Chữ Nháp ({queue.draft_chapters.length})
				</button>
				<button
					type="button"
					class:active={activeQueueTab === 'translations'}
					onclick={() => (activeQueueTab = 'translations')}
				>
					🌐 Bản Dịch Nháp ({queue.draft_translations?.length ?? 0})
				</button>
				<button
					type="button"
					class:active={activeQueueTab === 'manga'}
					onclick={() => (activeQueueTab = 'manga')}
				>
					🎨 Bản Manga Nháp ({queue.draft_manga.length})
				</button>
				<button
					type="button"
					class:active={activeQueueTab === 'library'}
					onclick={() => (activeQueueTab = 'library')}
				>
					📚 Thực Thể Chờ Duyệt ({queue.pending_library.length})
				</button>
			</div>

			{#if totalPendingCount === 0}
				<div class="station-empty">
					<span>🎉</span>
					<div>
						<strong>Không có bản nháp nào đang chờ duyệt!</strong>
						<p>
							Toàn bộ Chương chữ, Bản Manga và Thực thể Thư viện đều đã được xuất bản công khai.
						</p>
					</div>
				</div>
			{:else}
				<div class="queue-sections">
					<!-- 1. Draft Chapters -->
					{#if (activeQueueTab === 'all' || activeQueueTab === 'chapters') && queue.draft_chapters.length > 0}
						<div class="queue-group">
							<div class="queue-group-title">
								<span>📖 Chương Truyện Chữ Đang Ở Chế Độ Nháp ({queue.draft_chapters.length})</span>
								<a href="/admin/chapters">Quản lý tất cả chương →</a>
							</div>
							<div class="queue-list">
								{#each queue.draft_chapters as ch (ch.id)}
									<div class="queue-item">
										<label class="queue-check">
											<input
												type="checkbox"
												value={ch.id}
												bind:group={selectedChapterIds}
											/>
											<div class="queue-info">
												<div class="queue-title-row">
													<span class="q-badge ch">Chương {ch.chapter_number}</span>
													<strong>{ch.title}</strong>
												</div>
												<span class="queue-meta">
													{(ch.word_count ?? 0).toLocaleString('vi-VN')} từ (~{ch.reading_time_min ?? 1} phút đọc) · Cập nhật {formatDateTime(ch.updated_at || '')}
												</span>
											</div>
										</label>
										<div class="queue-row-actions">
											<a href="/admin/chapters/{ch.id}" class="btn-q-edit">✏️ Sửa</a>
											<button
												type="button"
												class="btn-q-pub"
												disabled={publishingBatch}
												onclick={() =>
													quickPublishSingle(
														'chapter',
														ch.id,
														`Chương ${ch.chapter_number}: ${ch.title}`
													)}
											>
												🚀 Publish
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- 1B. Draft Chapter Translations (EN / N locales) -->
					{#if (activeQueueTab === 'all' || activeQueueTab === 'translations') && (queue.draft_translations?.length ?? 0) > 0}
						<div class="queue-group">
							<div class="queue-group-title">
								<span>🌐 Bản Dịch Chương Đang Ở Chế Độ Nháp ({queue.draft_translations?.length ?? 0})</span>
								<a href="/admin/chapters">Quản lý tất cả chương →</a>
							</div>
							<div class="queue-list">
								{#each queue.draft_translations ?? [] as tr (tr.id)}
									<div class="queue-item">
										<label class="queue-check">
											<input
												type="checkbox"
												value={tr.id}
												bind:group={selectedTranslationIds}
											/>
											<div class="queue-info">
												<div class="queue-title-row">
													<span class="q-badge ch">{tr.locale.toUpperCase()} · Ch.{tr.chapter_number}</span>
													<strong>{tr.title}</strong>
												</div>
												<span class="queue-meta">
													{(tr.word_count ?? 0).toLocaleString('vi-VN')} từ · Cập nhật {formatDateTime(tr.updated_at || '')}
												</span>
											</div>
										</label>
										<div class="queue-row-actions">
											<a href="/admin/chapters/{tr.chapter_id}?lang={tr.locale}" class="btn-q-edit">✏️ Sửa bản {tr.locale.toUpperCase()}</a>
											<button
												type="button"
												class="btn-q-pub"
												disabled={publishingBatch}
												onclick={() =>
													quickPublishSingle(
														'translation',
														tr.id,
														`Bản ${tr.locale.toUpperCase()} Chương ${tr.chapter_number}: ${tr.title}`
													)}
											>
												🚀 Publish
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- 2. Draft Manga -->
					{#if (activeQueueTab === 'all' || activeQueueTab === 'manga') && queue.draft_manga.length > 0}
						<div class="queue-group">
							<div class="queue-group-title">
								<span>🎨 Bản Manga Đang Ở Chế Độ Nháp ({queue.draft_manga.length})</span>
								<a href="/admin/manga">Mở Xưởng Manga →</a>
							</div>
							<div class="queue-list">
								{#each queue.draft_manga as mg (mg.chapter_id)}
									<div class="queue-item">
										<label class="queue-check">
											<input
												type="checkbox"
												value={mg.chapter_id}
												bind:group={selectedMangaChapterIds}
											/>
											<div class="queue-info">
												<div class="queue-title-row">
													<span class="q-badge mg">Manga Ch.{mg.chapter_number}</span>
													<strong>{mg.title}</strong>
												</div>
												<span class="queue-meta">
													🎨 Màu: {mg.color_count ?? 0} trang · 🖋️ Đen trắng: {mg.bw_count ?? 0} trang · Tổng {mg.total_pages ?? 0} trang ({mg.reading_mode === 'paged' ? 'Lật trang' : 'Cuộn dọc'})
												</span>
											</div>
										</label>
										<div class="queue-row-actions">
											<a href="/admin/manga/{mg.chapter_id}" class="btn-q-edit">🎨 Xem / Sửa</a>
											<button
												type="button"
												class="btn-q-pub"
												disabled={publishingBatch}
												onclick={() =>
													quickPublishSingle(
														'manga',
														mg.chapter_id,
														`Manga Chương ${mg.chapter_number}`
													)}
											>
												🚀 Publish
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- 3. Pending Library Entities -->
					{#if (activeQueueTab === 'all' || activeQueueTab === 'library') && queue.pending_library.length > 0}
						<div class="queue-group">
							<div class="queue-group-title">
								<span>📚 Thực Thể Thư Viện Đang Ẩn / Chờ Duyệt ({queue.pending_library.length})</span>
								<a href="/admin/library">Mở Thư Viện →</a>
							</div>
							<div class="queue-list">
								{#each queue.pending_library as item (item.id)}
									{@const cat = formatCategoryMeta(item.category)}
									<div class="queue-item">
										<label class="queue-check">
											<input
												type="checkbox"
												value={item.id}
												bind:group={selectedLibraryIds}
											/>
											<div class="queue-info">
												<div class="queue-title-row">
													<span class="q-badge lb">{cat.icon} {cat.label}</span>
													<strong>{item.name}</strong>
													{#if item.first_chapter}
														<span class="q-ch-tag">Ch.{item.first_chapter}</span>
													{/if}
												</div>
												<span class="queue-meta">
													{#if item.role}{item.role} · {/if}
													{#if item.aliases && item.aliases.length > 0}
														Bí danh: {item.aliases.join(', ')} ·
													{/if}
													{item.description || 'Chưa có mô tả'}
												</span>
											</div>
										</label>
										<div class="queue-row-actions">
											<a href="/admin/library" class="btn-q-edit">✏️ Chi tiết</a>
											<button
												type="button"
												class="btn-q-pub"
												disabled={publishingBatch}
												onclick={() =>
													quickPublishSingle('library', item.id, item.name)}
											>
												🚀 Publish
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- System Info -->
		<div class="info-row">
			<div class="info-card">
				<h3>🖥️ Hệ Thống</h3>
				<ul>
					<li><strong>Backend:</strong> Rust (Axum + SeaORM + Redis Cache)</li>
					<li><strong>Frontend:</strong> SvelteKit 5 + Tauri Desktop</li>
					<li><strong>Database:</strong> PostgreSQL (Alpha Cloud / Beta Portable)</li>
					<li><strong>Đồng bộ Sáng tác:</strong> Co-Writer Direct SQLite & JSON Bundle</li>
				</ul>
			</div>
			<div class="info-card">
				<h3>📋 Quy Trình Xuất Bản Chuẩn (`Draft-First`)</h3>
				<p>
					Khi đồng bộ từ <strong>Co-Writer</strong>, mọi Chương chữ, Tập Manga và Thực thể Thư viện luôn ở chế độ Nháp/Ẩn. Bạn có thể kiểm tra lại nội dung và nhấn <strong>✨ Xuất bản mục đã chọn</strong> ngay tại Trạm Kiểm Duyệt phía trên.
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.admin-dashboard {
		max-width: 1200px;
	}
	.page-title {
		font-size: 1.75rem;
		font-weight: 800;
		color: var(--color-text-primary);
		margin: 0;
	}
	.page-subtitle {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin: 0.25rem 0 2rem;
	}
	.loading {
		text-align: center;
		padding: 3rem;
		color: var(--color-text-muted);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(195px, 1fr));
		gap: 1.15rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		padding: 1.25rem 1.4rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		transition: all 0.3s ease;
		position: relative;
		overflow: hidden;
	}
	:global(html[data-theme='light']) .stat-card {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.04);
	}
	.stat-card:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-glow);
	}

	.stat-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-brand-500), var(--color-brand-300));
	}
	.stat-support::before {
		background: linear-gradient(90deg, #f59e0b, #fbbf24);
	}

	.stat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.stat-icon {
		font-size: 1.75rem;
	}
	.stat-trend {
		font-size: 0.6875rem;
		color: #34d399;
		font-weight: 600;
	}
	.stat-badge {
		background: #ef4444;
		color: #fff;
		font-size: 0.625rem;
		font-weight: 700;
		padding: 0.125rem 0.5rem;
		border-radius: 1rem;
		min-width: 20px;
		text-align: center;
	}
	.stat-badge.warn {
		background: rgba(245, 158, 11, 0.2);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.35);
	}
	.stat-value {
		font-size: 2.15rem;
		font-weight: 800;
		color: var(--color-brand-300);
		display: block;
		line-height: 1;
	}
	:global(html[data-theme='light']) .stat-value {
		color: var(--color-brand-500);
	}
	.stat-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		display: block;
		margin-top: 0.25rem;
	}
	.stat-footer {
		font-size: 0.6875rem;
		color: #34d399;
		margin-top: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.stat-footer.warning {
		color: #fbbf24;
	}
	.online-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #34d399;
		display: inline-block;
	}

	/* Publish Station */
	.publish-station {
		background: var(--color-surface-100);
		border: 1px solid rgba(16, 185, 129, 0.25);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		margin-bottom: 2rem;
	}
	:global(html[data-theme='light']) .publish-station {
		background: #fff;
		border-color: rgba(12, 113, 61, 0.2);
	}
	.station-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.15rem;
	}
	.station-head h2 {
		font-size: 1.2rem;
		font-weight: 800;
		margin: 0 0 0.25rem;
		color: var(--color-text-primary);
	}
	.station-head p {
		font-size: 0.82rem;
		color: var(--color-text-secondary);
		margin: 0;
		max-width: 680px;
		line-height: 1.5;
	}
	.station-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.btn-select-all,
	.btn-clear-sel {
		padding: 0.5rem 0.9rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-surface-200);
		color: var(--color-text-primary);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-batch-publish {
		padding: 0.55rem 1.1rem;
		border-radius: 0.5rem;
		border: none;
		background: linear-gradient(135deg, #0c713d, #059669);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-batch-publish:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.station-tabs {
		display: flex;
		gap: 0.45rem;
		flex-wrap: wrap;
		margin-bottom: 1.15rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.station-tabs button {
		padding: 0.42rem 0.85rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--color-surface-200);
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.station-tabs button.active {
		background: var(--color-brand-500);
		border-color: var(--color-brand-500);
		color: #fff;
	}

	.station-empty {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 1.25rem;
		border-radius: 0.75rem;
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.2);
	}
	.station-empty span {
		font-size: 1.75rem;
	}
	.station-empty strong {
		display: block;
		font-size: 0.9rem;
		color: var(--color-text-primary);
	}
	.station-empty p {
		margin: 0.15rem 0 0;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.queue-sections {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.queue-group-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-text-secondary);
		margin-bottom: 0.55rem;
	}
	.queue-group-title a {
		color: var(--color-brand-400);
		text-decoration: none;
		font-size: 0.78rem;
	}
	.queue-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		max-height: 320px;
		overflow-y: auto;
	}
	.queue-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.9rem;
		border-radius: 0.6rem;
		background: var(--color-surface-200);
		border: 1px solid rgba(255, 255, 255, 0.05);
	}
	.queue-check {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		cursor: pointer;
		flex: 1;
		min-width: 0;
	}
	.queue-check input {
		margin-top: 0.2rem;
		accent-color: var(--color-brand-500);
	}
	.queue-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.queue-title-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.queue-title-row strong {
		font-size: 0.86rem;
		color: var(--color-text-primary);
	}
	.q-badge {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
	}
	.q-badge.ch {
		background: rgba(16, 185, 129, 0.16);
		color: #34d399;
	}
	.q-badge.mg {
		background: rgba(168, 85, 247, 0.16);
		color: #c084fc;
	}
	.q-badge.lb {
		background: rgba(6, 182, 212, 0.16);
		color: #22d3ee;
	}
	.q-ch-tag {
		font-size: 0.68rem;
		padding: 0.08rem 0.4rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--color-text-muted);
	}
	.queue-meta {
		font-size: 0.74rem;
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.queue-row-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}
	.btn-q-edit {
		padding: 0.32rem 0.65rem;
		border-radius: 0.4rem;
		background: rgba(255, 255, 255, 0.06);
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.74rem;
		font-weight: 600;
	}
	.btn-q-pub {
		padding: 0.34rem 0.7rem;
		border-radius: 0.4rem;
		border: none;
		background: rgba(16, 185, 129, 0.18);
		color: #34d399;
		font-size: 0.74rem;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-q-pub:hover:not(:disabled) {
		background: #059669;
		color: #fff;
	}

	.info-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}
	.info-card {
		background: var(--color-surface-100);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
	}
	:global(html[data-theme='light']) .info-card {
		background: #fff;
		border-color: rgba(0, 0, 0, 0.04);
	}
	.info-card h3 {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 0.75rem;
	}
	.info-card ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.info-card li {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		padding: 0.375rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}
	:global(html[data-theme='light']) .info-card li {
		border-bottom-color: rgba(0, 0, 0, 0.04);
	}
	.info-card li:last-child {
		border-bottom: none;
	}
	.info-card p {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		line-height: 1.7;
		margin: 0;
	}

	@media (max-width: 768px) {
		.info-row {
			grid-template-columns: 1fr;
		}
		.queue-item {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
