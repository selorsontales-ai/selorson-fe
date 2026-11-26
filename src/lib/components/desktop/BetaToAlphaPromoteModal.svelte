<script lang="ts">
	import { adminGet, adminPost, toast_success, toast_error } from '$lib/stores/admin.svelte';
	import { untrack } from 'svelte';

	interface Props {
		open?: boolean;
		onclose: () => void;
		onpromoted?: () => void;
	}

	let { open = true, onclose, onpromoted }: Props = $props();

	let loading = $state(true);
	let promoting = $state(false);
	let preview = $state<any>(null);
	let errorMsg = $state<string | null>(null);
	let lastResult = $state<any>(null);

	let selectedChapters = $state<number[]>([]);
	let chapterPublishMode = $state<'keep_beta' | 'force_published' | 'force_draft'>('keep_beta');
	let translationPublishMode = $state<'keep_beta' | 'force_published' | 'force_draft'>('keep_beta');
	let mangaPublishMode = $state<'keep_beta' | 'force_published' | 'force_draft'>('keep_beta');
	let entityMode = $state<'linked_and_active' | 'all' | 'active_only' | 'selected' | 'none'>('linked_and_active');
	let selectedEntityIds = $state<number[]>([]);
	let entitySearch = $state('');
	let syncShowcase = $state(false);
	let syncMusic = $state(false);

	async function loadPreview() {
		loading = true;
		errorMsg = null;
		try {
			const res = await adminGet<any>('/admin/promote/preview');
			if (res.success && res.data) {
				preview = res.data;
				const changedChs = (res.data.chapters || [])
					.filter((c: any) => c.action !== 'identical')
					.map((c: any) => Number(c.chapter_number));
				selectedChapters =
					changedChs.length > 0
						? changedChs
						: (res.data.chapters || []).map((c: any) => Number(c.chapter_number));
			} else {
				errorMsg = res.message || 'Không tải được bản so sánh Beta ↔ Alpha';
			}
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Lỗi kết nối khi so sánh Beta ↔ Alpha';
		}
		loading = false;
	}

	function toggleChapter(chNo: number) {
		if (selectedChapters.includes(chNo)) {
			selectedChapters = selectedChapters.filter((n) => n !== chNo);
		} else {
			selectedChapters = [...selectedChapters, chNo].sort((a, b) => a - b);
		}
	}

	function toggleEntity(id: number) {
		if (selectedEntityIds.includes(id)) {
			selectedEntityIds = selectedEntityIds.filter((x) => x !== id);
		} else {
			selectedEntityIds = [...selectedEntityIds, id];
		}
	}

	const filteredEntities = $derived.by(() => {
		const list: any[] = preview?.entities || [];
		const q = entitySearch.trim().toLowerCase();
		if (!q) return list;
		return list.filter(
			(e) =>
				String(e.name || '').toLowerCase().includes(q) ||
				String(e.category || '').toLowerCase().includes(q) ||
				String(e.cowriter_key || '').toLowerCase().includes(q)
		);
	});

	async function handleExecute() {
		if (
			selectedChapters.length === 0 &&
			entityMode === 'none' &&
			!syncShowcase &&
			!syncMusic
		) {
			toast_error('Hãy chọn ít nhất 1 Chương, Thực thể, Trang chủ hoặc Nhạc OST để đẩy lên Alpha.');
			return;
		}
		promoting = true;
		errorMsg = null;
		lastResult = null;
		try {
			const res = await adminPost<any>('/admin/promote/execute', {
				chapter_numbers: selectedChapters,
				chapter_publish_mode: chapterPublishMode,
				translation_publish_mode: translationPublishMode,
				manga_publish_mode: mangaPublishMode,
				entity_mode: entityMode,
				entity_ids: selectedEntityIds,
				sync_showcase: syncShowcase,
				sync_music: syncMusic
			});
			if (res.success && res.data) {
				lastResult = res.data;
				toast_success('Đã đẩy dữ liệu chọn lọc từ Beta lên Alpha thành công!');
				await loadPreview();
				onpromoted?.();
			} else {
				errorMsg = res.message || 'Không thể đẩy dữ liệu lên Alpha';
				toast_error(errorMsg);
			}
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Lỗi trong quá trình đẩy dữ liệu lên Alpha';
			toast_error(errorMsg);
		}
		promoting = false;
	}

	$effect(() => {
		if (open) {
			untrack(() => {
				loadPreview();
			});
		}
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && !promoting && e.key === 'Escape') {
			onclose();
		}
	}}
/>

{#if open}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="promote-backdrop" onclick={() => !promoting && onclose()}>
	<div class="promote-modal" onclick={(e) => e.stopPropagation()}>
		<div class="promote-header">
			<div>
				<span class="eyebrow">TRẠM XUẤT BẢN CHỌN LỌC · BETA → ALPHA</span>
				<h2>🚀 Đẩy dữ liệu đã duyệt lên Alpha (Production)</h2>
			</div>
			<button type="button" class="close-btn" onclick={onclose} disabled={promoting}>✕</button>
		</div>

		{#if loading}
			<div class="loading-box">
				⏳ Đang kết nối cơ sở dữ liệu Alpha và so sánh chênh lệch với Beta...
			</div>
		{:else if errorMsg && !preview}
			<div class="error-box">
				<strong>⚠️ Chưa thể kết nối Alpha:</strong>
				<p>{errorMsg}</p>
			</div>
		{:else if preview}
			<div class="target-meta">
				<span>🗄️ Máy chủ Alpha: <code>{preview.alpha_db_host}</code></span>
				<span>☁️ Thư mục Cloudinary chuẩn: <code>{preview.cloudinary_folder}/&#123;manga|library|chapters|showcase&#125;</code></span>
				<span class="safe-tag">🛡️ Bảo toàn 100% Users, Comments & Tiến độ đọc trên Alpha</span>
			</div>

			{#if promoting}
				<div class="promoting-banner">
					<strong>⏳ Đang thực thi xuất bản từ Beta lên Alpha...</strong>
					<span>Hệ thống đang chuẩn hóa ảnh lên Cloudinary Alpha (<code>selorson-v3/...</code>) và đồng bộ cơ sở dữ liệu. Vui lòng giữ hộp thoại này trong giây lát...</span>
				</div>
			{/if}

			{#if lastResult}
				<div class="result-banner">
					<strong>✅ Kết quả xuất bản vừa thực hiện:</strong>
					<div class="result-grid">
						<span>📖 Chương mới: <b>+{lastResult.chapters_created}</b> · Cập nhật: <b>{lastResult.chapters_updated}</b></span>
						<span>🏛️ Thực thể mới: <b>+{lastResult.entities_created}</b> · Cập nhật: <b>{lastResult.entities_updated}</b></span>
						<span>🏷️ Tags gắn chương: <b>{lastResult.tags_synced}</b> · 🌐 Bản dịch đồng bộ: <b>{lastResult.translations_synced ?? 0}</b></span>
						<span>☁️ Ảnh đẩy lên Cloudinary: <b>{lastResult.media_uploaded}</b> (tái sử dụng cache: <b>{lastResult.media_reused_from_cache}</b> · dọn ảnh cũ: <b>{lastResult.old_media_cleaned}</b>)</span>
						<span>⚡ Xóa Cache Redis Alpha: <b>{lastResult.alpha_redis_flushed ? 'Thành công' : 'Bỏ qua'}</b></span>
					</div>
				</div>
			{/if}

			{#if errorMsg}
				<div class="error-box"><p>{errorMsg}</p></div>
			{/if}

			<div class="promote-body">
				<!-- 1. CHƯƠNG TRUYỆN & MANGA -->
				<div class="section-card">
					<div class="section-head">
						<div>
							<h3>1. Chương Truyện Chữ & Tập Manga ({selectedChapters.length}/{preview.chapters?.length || 0} chương đã chọn)</h3>
							<p class="sub">
								Tự động đẩy ảnh <code>local-media</code> vào đúng thư mục <code>{preview.cloudinary_folder}/manga/ch-XXX/&#123;color|bw&#125;/pXX_&lt;sha8&gt;</code>
							</p>
						</div>
						<div class="quick-btns">
							<button
								type="button"
								class="mini-btn"
								onclick={() => (selectedChapters = (preview.chapters || []).map((c: any) => Number(c.chapter_number)))}
							>
								Chọn tất cả
							</button>
							<button type="button" class="mini-btn" onclick={() => (selectedChapters = [])}>
								Bỏ chọn
							</button>
						</div>
					</div>

					<div class="chapter-list">
						{#each preview.chapters || [] as ch (ch.chapter_number)}
							<label class="ch-row" class:selected={selectedChapters.includes(ch.chapter_number)}>
								<input
									type="checkbox"
									checked={selectedChapters.includes(ch.chapter_number)}
									onchange={() => toggleChapter(ch.chapter_number)}
								/>
								<div class="ch-main">
									<div class="ch-title-line">
										<strong>Chương {ch.chapter_number}: {ch.title}</strong>
										{#if ch.action === 'create'}
											<span class="badge create">+ Mới trên Alpha</span>
										{:else if ch.action === 'update'}
											<span class="badge update">↻ Có cập nhật</span>
										{:else}
											<span class="badge identical">✓ Đã đồng bộ</span>
										{/if}
										{#if ch.en_diff}
											<span class="badge update">🇬🇧 EN mới/cập nhật</span>
										{/if}
									</div>
									<div class="ch-meta-line">
										<span>📝 {Number(ch.word_count || 0).toLocaleString('vi-VN')} từ (Beta: <b>{ch.beta_status}</b>{ch.alpha_status ? ` · Alpha: ${ch.alpha_status}` : ''})</span>
										<span>🇬🇧 EN: <b>{ch.en_status ? `${ch.en_status} (${Number(ch.en_word_count || 0).toLocaleString('vi-VN')} từ)` : 'chưa dịch'}</b></span>
										<span>🎨 Manga: <b>{ch.manga_pages_count}</b> trang ({ch.manga_status || 'không có'})</span>
										<span>🏷️ Tags: <b>{ch.tags_count}</b></span>
										{#if ch.pending_media_uplift_count > 0}
											<span class="uplift-pill">☁️ {ch.pending_media_uplift_count} ảnh chờ chuẩn hóa Cloudinary</span>
										{/if}
									</div>
								</div>
							</label>
						{/each}
					</div>

					<div class="mode-row">
						<label>
							<span>Trạng thái Chương chữ (VI) khi lên Alpha:</span>
							<select bind:value={chapterPublishMode}>
								<option value="keep_beta">Giữ nguyên như trên Beta</option>
								<option value="force_published">Xuất bản ngay (Published)</option>
								<option value="force_draft">Đặt làm Nháp (Draft)</option>
							</select>
						</label>
						<label>
							<span>Trạng thái Bản dịch EN khi lên Alpha:</span>
							<select bind:value={translationPublishMode}>
								<option value="keep_beta">Giữ nguyên như trên Beta (An toàn)</option>
								<option value="force_published">Xuất bản ngay (Published)</option>
								<option value="force_draft">Đặt làm Nháp (Draft)</option>
							</select>
						</label>
						<label>
							<span>Trạng thái Tập Manga khi lên Alpha:</span>
							<select bind:value={mangaPublishMode}>
								<option value="keep_beta">Giữ nguyên như trên Beta</option>
								<option value="force_published">Xuất bản ngay (Published)</option>
								<option value="force_draft">Đặt làm Nháp (Draft)</option>
							</select>
						</label>
					</div>
				</div>

				<!-- 2. THỰC THỂ THƯ VIỆN -->
				<div class="section-card">
					<div class="section-head">
						<div>
							<h3>2. Thực thể Thư viện & Bản đồ Thế giới (Beta: {preview.entities_summary?.total_beta || 0} · Alpha: {preview.entities_summary?.total_alpha || 0})</h3>
							<p class="sub">
								+{preview.entities_summary?.create_count || 0} mục mới · ~{preview.entities_summary?.update_count || 0} mục cập nhật · {preview.entities_summary?.active_count || 0} mục đang hiển thị công khai · {preview.entities_summary?.pending_media_uplift_count || 0} ảnh chờ đẩy vào <code>{preview.cloudinary_folder}/library/&lt;category&gt;/&lt;key&gt;_&lt;sha8&gt;</code>
							</p>
						</div>
					</div>

					<div class="entity-mode-options">
						<label class="radio-card" class:active={entityMode === 'linked_and_active'}>
							<input type="radio" name="entityMode" value="linked_and_active" bind:group={entityMode} />
							<div>
								<strong>Chỉ đẩy Thực thể gắn với Chương đã chọn & đang bật Hiển thị (Khuyên dùng)</strong>
								<span>An toàn chuẩn Draft-First: chỉ đồng bộ thực thể đã duyệt (`is_active = true`) thuộc các chương được tích chọn ở trên.</span>
							</div>
						</label>
						<label class="radio-card" class:active={entityMode === 'all'}>
							<input type="radio" name="entityMode" value="all" bind:group={entityMode} />
							<div>
								<strong>Đẩy toàn bộ {preview.entities_summary?.total_beta || 0} Thực thể</strong>
								<span>Đảm bảo mọi Tags chương đều gắn đủ; thực thể nào đang ẩn (Nháp) trên Beta vẫn tiếp tục ẩn trên Alpha.</span>
							</div>
						</label>
						<label class="radio-card" class:active={entityMode === 'active_only'}>
							<input type="radio" name="entityMode" value="active_only" bind:group={entityMode} />
							<div>
								<strong>Chỉ đẩy Thực thể đang bật Hiển thị công khai ({preview.entities_summary?.active_count || 0} mục)</strong>
								<span>Bỏ qua các thực thể đang ở trạng thái ẩn (`is_active = false`).</span>
							</div>
						</label>
						<label class="radio-card" class:active={entityMode === 'selected'}>
							<input type="radio" name="entityMode" value="selected" bind:group={entityMode} />
							<div>
								<strong>Tự chọn lẻ từng Thực thể ({selectedEntityIds.length} mục đã chọn)</strong>
								<span>Mở danh sách tìm kiếm và tích chọn thủ công từng thực thể.</span>
							</div>
						</label>
						<label class="radio-card" class:active={entityMode === 'none'}>
							<input type="radio" name="entityMode" value="none" bind:group={entityMode} />
							<div>
								<strong>Không đẩy Thực thể trong lượt này</strong>
								<span>Chỉ cập nhật nội dung Chương chữ / Manga.</span>
							</div>
						</label>
					</div>

					{#if entityMode === 'selected'}
						<div class="entity-picker">
							<input
								type="text"
								class="search-input"
								placeholder="Tìm tên nhân vật, địa danh, cowriter_key..."
								bind:value={entitySearch}
							/>
							<div class="entity-scroll">
								{#each filteredEntities as ent (ent.id)}
									<label class="ent-item">
										<input
											type="checkbox"
											checked={selectedEntityIds.includes(ent.id)}
											onchange={() => toggleEntity(ent.id)}
										/>
										<span class="ent-name">{ent.name}</span>
										<span class="ent-cat">{ent.category}</span>
										{#if ent.is_active}
											<span class="badge identical">Hiển thị</span>
										{/if}
										{#if ent.needs_uplift}
											<span class="uplift-pill">☁️ Ảnh local</span>
										{/if}
									</label>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- 3. TRANG CHỦ, PHIM & NHẠC OST -->
				<div class="section-card compact">
					<label class="showcase-toggle">
						<input type="checkbox" bind:checked={syncShowcase} />
						<div>
							<strong>3. Đồng bộ Trang chủ & Phim đã duyệt (Slides: {preview.showcase_summary?.beta_hero_slides || 0} · Cột mốc: {preview.showcase_summary?.beta_milestones || 0} · Dự án: {preview.showcase_summary?.beta_future_projects || 0} · Video/Intro: {preview.showcase_summary?.beta_videos || 0})</strong>
							<span>Chỉ đẩy các Slide, Cột mốc và Video đang bật Hiển thị (`is_active = true`), tự động đẩy tệp video local lên Cloudflare R2 Alpha.</span>
						</div>
					</label>
					<label class="showcase-toggle" style="margin-top: 0.65rem;">
						<input type="checkbox" bind:checked={syncMusic} />
						<div>
							<strong>4. Đồng bộ Nhạc nền OST đã duyệt (Albums: {preview.showcase_summary?.beta_music_albums || 0} · Tracks: {preview.showcase_summary?.beta_music_tracks || 0})</strong>
							<span>Chỉ đẩy các Album & Bản nhạc đang bật Hiển thị (`is_active = true`), tự động nâng cấp tệp âm thanh lên Cloudflare R2 Alpha.</span>
						</div>
					</label>
				</div>
			</div>
		{/if}

		<div class="promote-footer">
			<button type="button" class="btn-secondary" onclick={onclose} disabled={promoting}>
				Đóng
			</button>
			{#if preview}
				<button type="button" class="btn-primary" onclick={handleExecute} disabled={promoting}>
					{promoting
						? '⏳ Đang đẩy ảnh lên Cloudinary & đồng bộ Alpha...'
						: '🚀 Thực thi Xuất bản lên Alpha'}
				</button>
			{/if}
		</div>
	</div>
</div>
{/if}

<style>
	.promote-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		background: rgba(5, 7, 14, 0.82);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: clamp(0.65rem, 2.5vw, 1.25rem);
	}
	.promote-modal {
		width: min(100%, 56rem);
		max-height: calc(100dvh - 1.5rem);
		background: #121521;
		border: 1px solid rgba(99, 102, 241, 0.32);
		border-radius: 16px;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		color: #e2e8f0;
	}
	.promote-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1.15rem 1.4rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(99, 102, 241, 0.08);
	}
	.eyebrow {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		color: #a5b4fc;
		display: block;
		margin-bottom: 0.2rem;
	}
	.promote-header h2 {
		margin: 0;
		font-size: 1.18rem;
		color: #f8fafc;
	}
	.close-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.2rem 0.5rem;
	}
	.target-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
		padding: 0.7rem 1.4rem;
		background: rgba(15, 23, 42, 0.75);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		font-size: 0.8rem;
		color: #cbd5e1;
	}
	.target-meta code {
		color: #93c5fd;
		background: rgba(30, 41, 59, 0.8);
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
	}
	.safe-tag {
		color: #86efac;
		font-weight: 600;
	}
	.promoting-banner {
		margin: 0.7rem 1.4rem 0;
		padding: 0.85rem 1rem;
		border-radius: 0.65rem;
		background: rgba(245, 158, 11, 0.14);
		border: 1px solid rgba(245, 158, 11, 0.45);
		font-size: 0.82rem;
		color: #fde68a;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.promoting-banner code {
		color: #fff;
		font-family: var(--font-mono);
	}
	.promote-body {
		padding: 1.1rem 1.4rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.section-card {
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.section-card.compact {
		padding: 0.8rem 1.1rem;
	}
	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}
	.section-head h3 {
		margin: 0;
		font-size: 0.96rem;
		color: #f1f5f9;
	}
	.section-head .sub {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		color: #94a3b8;
	}
	.quick-btns {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}
	.mini-btn {
		padding: 0.28rem 0.6rem;
		font-size: 0.75rem;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: #cbd5e1;
		cursor: pointer;
	}
	.chapter-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.ch-row {
		display: flex;
		align-items: flex-start;
		gap: 0.7rem;
		padding: 0.65rem 0.8rem;
		border-radius: 9px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(15, 23, 42, 0.45);
		cursor: pointer;
	}
	.ch-row.selected {
		border-color: rgba(99, 102, 241, 0.45);
		background: rgba(99, 102, 241, 0.1);
	}
	.ch-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.ch-title-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.88rem;
	}
	.ch-meta-line {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		font-size: 0.77rem;
		color: #94a3b8;
	}
	.badge {
		font-size: 0.7rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		font-weight: 600;
	}
	.badge.create {
		background: rgba(34, 197, 94, 0.18);
		color: #86efac;
	}
	.badge.update {
		background: rgba(245, 158, 11, 0.18);
		color: #fcd34d;
	}
	.badge.identical {
		background: rgba(148, 163, 184, 0.16);
		color: #cbd5e1;
	}
	.uplift-pill {
		background: rgba(56, 189, 248, 0.16);
		color: #7dd3fc;
		padding: 0.08rem 0.45rem;
		border-radius: 6px;
		font-size: 0.72rem;
	}
	.mode-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
		padding-top: 0.35rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}
	.mode-row label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: #cbd5e1;
	}
	.mode-row select,
	.search-input {
		padding: 0.45rem 0.65rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: #0f172a;
		color: #f8fafc;
		font-size: 0.82rem;
	}
	.entity-mode-options {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.radio-card {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		padding: 0.55rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(15, 23, 42, 0.4);
		cursor: pointer;
	}
	.radio-card.active {
		border-color: rgba(99, 102, 241, 0.45);
		background: rgba(99, 102, 241, 0.1);
	}
	.radio-card div {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
	}
	.radio-card strong {
		font-size: 0.84rem;
		color: #f1f5f9;
	}
	.radio-card span {
		font-size: 0.76rem;
		color: #94a3b8;
	}
	.entity-picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.entity-scroll {
		max-height: 180px;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.35rem;
		padding: 0.4rem;
		background: rgba(15, 23, 42, 0.6);
		border-radius: 8px;
	}
	.ent-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		padding: 0.25rem 0.4rem;
		border-radius: 6px;
		cursor: pointer;
	}
	.ent-name {
		font-weight: 600;
		color: #e2e8f0;
	}
	.ent-cat {
		font-size: 0.7rem;
		color: #94a3b8;
	}
	.showcase-toggle {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		cursor: pointer;
	}
	.showcase-toggle div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.showcase-toggle strong {
		font-size: 0.85rem;
	}
	.showcase-toggle span {
		font-size: 0.76rem;
		color: #94a3b8;
	}
	.result-banner {
		margin: 0.8rem 1.4rem 0;
		padding: 0.75rem 1rem;
		background: rgba(22, 163, 74, 0.14);
		border: 1px solid rgba(34, 197, 94, 0.35);
		border-radius: 10px;
		font-size: 0.82rem;
	}
	.result-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
		margin-top: 0.35rem;
		color: #dcfce7;
	}
	.loading-box,
	.error-box {
		padding: 1.5rem;
		text-align: center;
		font-size: 0.9rem;
	}
	.error-box {
		color: #fca5a5;
	}
	.promote-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 0.95rem 1.4rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(15, 23, 42, 0.8);
	}
	.btn-secondary {
		padding: 0.55rem 1.1rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: transparent;
		color: #cbd5e1;
		cursor: pointer;
	}
	.btn-primary {
		padding: 0.55rem 1.25rem;
		border-radius: 8px;
		border: none;
		background: linear-gradient(135deg, #4f46e5, #7c3aed);
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}
	.btn-primary:disabled,
	.btn-secondary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.promote-header,
		.target-meta,
		.promote-body,
		.promote-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}
		.promoting-banner,
		.result-banner {
			margin-left: 1rem;
			margin-right: 1rem;
		}
		.section-head {
			flex-direction: column;
			align-items: stretch;
			gap: 0.6rem;
		}
		.quick-btns {
			flex-wrap: wrap;
		}
		.mode-row {
			grid-template-columns: 1fr;
		}
		.entity-scroll {
			grid-template-columns: 1fr;
		}
		.promote-footer {
			flex-direction: column-reverse;
		}
		.promote-footer button {
			width: 100%;
		}
	}
</style>
