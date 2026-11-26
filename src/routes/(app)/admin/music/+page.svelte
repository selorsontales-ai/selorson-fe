<script lang="ts">
	import AdminCrudTable from "$lib/components/admin/AdminCrudTable.svelte";
	import AdminModal from "$lib/components/admin/AdminModal.svelte";
	import CmsEnTranslationFields from "$lib/components/admin/CmsEnTranslationFields.svelte";
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		adminUpload,
		extractCmsLocaleFields,
		saveCmsLocaleFields,
		toast_success,
		toast_error,
	} from "$lib/stores/admin.svelte";
	import { onMount } from "svelte";

	const ALBUM_EN_SPECS = [
		{ key: "title", label: "Tên album (EN)", placeholder: "English album title..." },
		{ key: "description", label: "Mô tả album (EN)", placeholder: "English album description...", multiline: true, rows: 2 },
	];
	const TRACK_EN_SPECS = [
		{ key: "title", label: "Tên bài hát (EN)", placeholder: "English track title..." },
		{ key: "artist", label: "Nghệ sĩ (EN)", placeholder: "Artist name in English..." },
	];

	// ── State ──
	let activeTab = $state<"albums" | "tracks">("albums");
	let albums = $state<Record<string, unknown>[]>([]);
	let tracks = $state<Record<string, unknown>[]>([]);
	let showForm = $state(false);
	let editing = $state<Record<string, unknown> | null>(null);

	// Upload state
	let uploadingImage = $state(false);
	let uploadingAudio = $state(false);
	let imageInput = $state<HTMLInputElement>();
	let audioInput = $state<HTMLInputElement>();

	// Forms
	let albumForm = $state({
		title: "",
		description: "",
		cover_image: "",
		display_order: 0,
		is_active: false,
	});
	let trackForm = $state({
		title: "",
		album_id: 0,
		artist: "",
		file_path: "",
		track_number: 1,
		duration: 0,
		is_active: false,
	});
	let albumEnFields = $state<Record<string, string>>({ title: "", description: "" });
	let hadAlbumEn = $state(false);
	let trackEnFields = $state<Record<string, string>>({ title: "", artist: "" });
	let hadTrackEn = $state(false);

	// ── Table Columns ──
	const albumColumns = [
		{ key: "id", label: "ID" },
		{ key: "title", label: "Album" },
		{ key: "en_badge", label: "Bản EN" },
		{ key: "display_order", label: "Thứ tự" },
		{ key: "is_active", label: "Active", type: "boolean" as const },
	];
	const trackColumns = [
		{ key: "id", label: "ID" },
		{ key: "track_number", label: "#" },
		{ key: "title", label: "Bài hát" },
		{ key: "en_badge", label: "Bản EN" },
		{ key: "artist", label: "Nghệ sĩ" },
		{ key: "album_id", label: "Album ID" },
		{ key: "duration", label: "Giây" },
		{ key: "is_active", label: "Active", type: "boolean" as const },
	];

	// ── Fetch ──
	async function fetchAlbums() {
		try {
			const r = await adminGet<Record<string, unknown>[]>(
				"/admin/music/albums",
			);
			if (r.success && Array.isArray(r.data)) {
				albums = r.data.map((row) => {
					const hasEn = extractCmsLocaleFields(row, ["title", "description"]).hasExisting;
					return { ...row, en_badge: hasEn ? "🇬🇧 Có EN" : "—" };
				});
			}
		} catch {
			/* empty */
		}
	}
	async function fetchTracks() {
		try {
			const r = await adminGet<Record<string, unknown>[]>(
				"/admin/music/tracks",
			);
			if (r.success && Array.isArray(r.data)) {
				tracks = r.data.map((row) => {
					const hasEn = extractCmsLocaleFields(row, ["title", "artist"]).hasExisting;
					return { ...row, en_badge: hasEn ? "🇬🇧 Có EN" : "—" };
				});
			}
		} catch {
			/* empty */
		}
	}

	// ── Album CRUD ──
	function handleCreateAlbum() {
		editing = null;
		albumForm = {
			title: "",
			description: "",
			cover_image: "",
			display_order: 0,
			is_active: false,
		};
		albumEnFields = { title: "", description: "" };
		hadAlbumEn = false;
		showForm = true;
	}
	function handleEditAlbum(item: Record<string, unknown>) {
		editing = item;
		albumForm = {
			title: (item.title as string) ?? "",
			description: (item.description as string) ?? "",
			cover_image: (item.cover_image as string) ?? "",
			display_order: (item.display_order as number) ?? 0,
			is_active: (item.is_active as boolean) ?? false,
		};
		const ex = extractCmsLocaleFields(item, ["title", "description"]);
		albumEnFields = ex.values;
		hadAlbumEn = ex.hasExisting;
		showForm = true;
	}
	async function handleSaveAlbum() {
		try {
			if (editing) {
				const r = await adminPut<any>(`/admin/music/albums/${editing.id}`, albumForm);
				if (!r.success) return;
				await saveCmsLocaleFields("music_album", Number(editing.id), albumEnFields, hadAlbumEn);
				toast_success("Cập nhật album thành công!");
			} else {
				const r = await adminPost<any>("/admin/music/albums", albumForm);
				if (!r.success) return;
				await saveCmsLocaleFields("music_album", Number(r.data?.id), albumEnFields, false);
				toast_success("Tạo album thành công!");
			}
			showForm = false;
			fetchAlbums();
		} catch {
			toast_error("Lỗi lưu album");
		}
	}
	async function handleDeleteAlbum(item: Record<string, unknown>) {
		if (!confirm("Xóa album này?")) return;
		try {
			await adminDelete(`/admin/music/albums/${item.id}`);
			toast_success("Đã xóa album.");
			fetchAlbums();
		} catch {
			toast_error("Lỗi xóa album");
		}
	}

	// ── Track CRUD ──
	function nextTrackNumberForAlbum(albumId: number): number {
		const albumTracks = tracks.filter((t) => Number(t.album_id) === Number(albumId));
		return albumTracks.length + 1;
	}

	function handleCreateTrack() {
		editing = null;
		const defaultAlbumId = (albums[0]?.id as number) ?? 0;
		trackForm = {
			title: "",
			album_id: defaultAlbumId,
			artist: "",
			file_path: "",
			track_number: nextTrackNumberForAlbum(defaultAlbumId),
			duration: 0,
			is_active: false,
		};
		trackEnFields = { title: "", artist: "" };
		hadTrackEn = false;
		showForm = true;
	}
	function handleEditTrack(item: Record<string, unknown>) {
		editing = item;
		trackForm = {
			title: (item.title as string) ?? "",
			album_id: (item.album_id as number) ?? 0,
			artist: (item.artist as string) ?? "",
			file_path: (item.file_path as string) ?? "",
			track_number: (item.track_number as number) ?? 1,
			duration: (item.duration as number) ?? 0,
			is_active: (item.is_active as boolean) ?? false,
		};
		const ex = extractCmsLocaleFields(item, ["title", "artist"]);
		trackEnFields = ex.values;
		hadTrackEn = ex.hasExisting;
		showForm = true;
	}
	async function handleSaveTrack() {
		try {
			if (editing) {
				const r = await adminPut<any>(`/admin/music/tracks/${editing.id}`, trackForm);
				if (!r.success) return;
				await saveCmsLocaleFields("music_track", Number(editing.id), trackEnFields, hadTrackEn);
				toast_success("Cập nhật track thành công!");
			} else {
				const r = await adminPost<any>("/admin/music/tracks", trackForm);
				if (!r.success) return;
				await saveCmsLocaleFields("music_track", Number(r.data?.id), trackEnFields, false);
				toast_success("Tạo track thành công!");
			}
			showForm = false;
			fetchTracks();
		} catch {
			toast_error("Lỗi lưu track");
		}
	}
	async function handleDeleteTrack(item: Record<string, unknown>) {
		if (!confirm("Xóa track này?")) return;
		try {
			await adminDelete(`/admin/music/tracks/${item.id}`);
			toast_success("Đã xóa track.");
			fetchTracks();
		} catch {
			toast_error("Lỗi xóa track");
		}
	}

	// ── Upload: Cover (Cloudinary) ──
	async function handleUploadCover(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		uploadingImage = true;
		try {
			const fd = new FormData();
			fd.append("image", file);
			fd.append("folder", "music");
			const r = await adminUpload<{ url: string }>("/upload/image", fd);
			if (r.success) {
				albumForm.cover_image = r.data.url;
				toast_success("Upload cover thành công!");
			}
		} catch {
			toast_error("Upload cover thất bại");
		} finally {
			uploadingImage = false;
		}
	}

	// ── Upload: Audio (Cloudflare R2 / Local Media) ──
	function detectAudioFileDuration(file: File) {
		try {
			const tempUrl = URL.createObjectURL(file);
			const probe = new Audio();
			probe.preload = "metadata";
			probe.onloadedmetadata = () => {
				if (Number.isFinite(probe.duration) && probe.duration > 0) {
					trackForm.duration = Math.round(probe.duration);
				}
				URL.revokeObjectURL(tempUrl);
			};
			probe.onerror = () => URL.revokeObjectURL(tempUrl);
			probe.src = tempUrl;
		} catch {
			/* ignore */
		}
	}

	async function handleUploadAudio(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		detectAudioFileDuration(file);
		uploadingAudio = true;
		try {
			const fd = new FormData();
			fd.append("audio", file);
			const r = await adminUpload<{
				url: string;
				key: string;
				size: number;
			}>("/upload/audio", fd);
			if (r.success) {
				trackForm.file_path = r.data.url;
				if (!trackForm.title.trim()) {
					trackForm.title = file.name.replace(/\.[^/.]+$/, "");
				}
				toast_success("Upload nhạc thành công!");
			}
		} catch {
			toast_error("Upload nhạc thất bại");
		} finally {
			uploadingAudio = false;
		}
	}

	onMount(() => {
		fetchAlbums();
		fetchTracks();
	});
</script>

<svelte:head><title>Admin - Âm Nhạc — Selorson</title></svelte:head>

<!-- Tab Bar -->
<div class="tab-bar">
	<button
		class:active={activeTab === "albums"}
		onclick={() => (activeTab = "albums")}>🎵 Albums</button
	>
	<button
		class:active={activeTab === "tracks"}
		onclick={() => (activeTab = "tracks")}>🎶 Tracks</button
	>
</div>

<!-- Table -->
{#if activeTab === "albums"}
	<AdminCrudTable
		title="🎵 Quản lý Albums"
		columns={albumColumns}
		items={albums}
		showCreate
		showActions
		showDelete
		oncreate={handleCreateAlbum}
		onedit={handleEditAlbum}
		ondelete={handleDeleteAlbum}
	/>
{:else}
	<AdminCrudTable
		title="🎶 Quản lý Tracks"
		columns={trackColumns}
		items={tracks}
		showCreate
		showActions
		showDelete
		oncreate={handleCreateTrack}
		onedit={handleEditTrack}
		ondelete={handleDeleteTrack}
	/>
{/if}

<!-- Modal Form -->
<AdminModal
	bind:open={showForm}
	title={activeTab === "albums"
		? editing
			? "Sửa Album"
			: "Tạo Album Mới"
		: editing
			? "Sửa Track"
			: "Tạo Track Mới"}
>
	{#if activeTab === "albums"}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSaveAlbum();
			}}
		>
			<div class="form-group">
				<label for="album-title">Tên album</label>
				<input
					id="album-title"
					bind:value={albumForm.title}
					placeholder="Tên album"
					required
				/>
			</div>

			<!-- Cover Upload (Cloudinary) -->
			<div class="form-group">
				<label for="album-cover-file">Hình nền</label>
				<div class="upload-row">
					<input
						id="album-cover-file"
						type="file"
						bind:this={imageInput}
						accept="image/*"
						onchange={handleUploadCover}
						style="display:none"
					/>
					<button
						type="button"
						class="btn-upload"
						onclick={() => imageInput?.click()}
						disabled={uploadingImage}
					>
						{uploadingImage ? "⏳ Đang tải..." : "📤 Upload hình"}
					</button>
					<input
						id="album-cover-input"
						aria-label="URL Hình nền"
						bind:value={albumForm.cover_image}
						placeholder="Hoặc dán URL ảnh"
					/>
				</div>
				{#if albumForm.cover_image}
					<img
						src={albumForm.cover_image}
						alt="Album cover preview"
						class="preview-thumb"
					/>
				{/if}
			</div>

			<div class="form-group">
				<label for="album-desc">Mô tả</label>
				<textarea
					id="album-desc"
					bind:value={albumForm.description}
					placeholder="Mô tả album"
					rows="2"
				></textarea>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="album-order">Thứ tự</label>
					<input
						id="album-order"
						bind:value={albumForm.display_order}
						type="number"
					/>
				</div>
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={albumForm.is_active} />
					Kích hoạt
				</label>
			</div>

			<CmsEnTranslationFields bind:fields={albumEnFields} specs={ALBUM_EN_SPECS} />

			<div class="form-actions">
				<button
					type="button"
					class="btn-cancel"
					onclick={() => (showForm = false)}>Hủy</button
				>
				<button type="submit" class="btn-save"
					>{editing ? "Cập nhật" : "Tạo mới"}</button
				>
			</div>
		</form>
	{:else}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSaveTrack();
			}}
		>
			<div class="form-group">
				<label for="track-title">Tên bài hát</label>
				<input
					id="track-title"
					bind:value={trackForm.title}
					placeholder="Tên bài hát"
					required
				/>
			</div>

			<div class="form-group">
				<label for="track-artist">Nghệ sĩ</label>
				<input
					id="track-artist"
					bind:value={trackForm.artist}
					placeholder="Tên nghệ sĩ"
				/>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="track-album">Album</label>
					<select id="track-album" bind:value={trackForm.album_id}>
						{#each albums as a}
							<option value={a.id}>{a.title}</option>
						{/each}
					</select>
				</div>
				<div class="form-group">
					<label for="track-num">Số thứ tự</label>
					<input
						id="track-num"
						bind:value={trackForm.track_number}
						type="number"
					/>
				</div>
			</div>

			<!-- Audio Upload (Cloudflare R2) -->
			<div class="form-group">
				<label for="track-audio-file">File nhạc</label>
				<div class="upload-row">
					<input
						id="track-audio-file"
						type="file"
						bind:this={audioInput}
						accept="audio/*"
						onchange={handleUploadAudio}
						style="display:none"
					/>
					<button
						type="button"
						class="btn-upload audio-btn"
						onclick={() => audioInput?.click()}
						disabled={uploadingAudio}
					>
						{uploadingAudio
							? "⏳ Đang tải lên R2..."
							: "🎵 Upload nhạc"}
					</button>
					<input
						id="track-audio-input"
						aria-label="URL File nhạc"
						bind:value={trackForm.file_path}
						placeholder="Hoặc dán URL audio"
					/>
				</div>
				{#if trackForm.file_path}
					<div class="audio-preview">
						<span class="audio-label">🎧 Xem trước:</span>
						<!-- svelte-ignore a11y_media_has_caption -->
						<audio
							controls
							src={trackForm.file_path}
							preload="metadata"
							onloadedmetadata={(e) => {
								const el = e.currentTarget as HTMLAudioElement;
								if (Number.isFinite(el.duration) && el.duration > 0 && !trackForm.duration) {
									trackForm.duration = Math.round(el.duration);
								}
							}}
						></audio>
					</div>
				{/if}
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="track-duration">Thời lượng (giây)</label>
					<input
						id="track-duration"
						bind:value={trackForm.duration}
						type="number"
						placeholder="0"
					/>
				</div>
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={trackForm.is_active} />
					Kích hoạt
				</label>
			</div>

			<CmsEnTranslationFields bind:fields={trackEnFields} specs={TRACK_EN_SPECS} />

			<div class="form-actions">
				<button
					type="button"
					class="btn-cancel"
					onclick={() => (showForm = false)}>Hủy</button
				>
				<button type="submit" class="btn-save"
					>{editing ? "Cập nhật" : "Tạo mới"}</button
				>
			</div>
		</form>
	{/if}
</AdminModal>

<style>
	/* Tab Bar */
	.tab-bar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}
	.tab-bar button {
		padding: 0.75rem 1.25rem;
		background: var(--color-surface-200);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		cursor: pointer;
		color: var(--color-text-muted);
		transition: all 0.2s;
	}
	.tab-bar button.active {
		background: var(--color-brand-500);
		color: #fff;
	}
	.tab-bar button:hover:not(.active) {
		background: var(--color-surface-300);
	}

	/* Form Groups */
	.form-group {
		margin-bottom: 1rem;
	}
	.form-group label {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: 0.35rem;
	}
	.form-group input,
	.form-group select,
	.form-group textarea {
		width: 100%;
		padding: 0.6rem 0.75rem;
		background: var(--color-surface-200);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.875rem;
	}
	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--color-brand-500);
	}
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: end;
	}

	/* Upload Row */
	.upload-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.upload-row input {
		flex: 1;
	}
	.btn-upload {
		padding: 0.6rem 1rem;
		background: rgba(12, 113, 61, 0.15);
		border: 1px solid rgba(12, 113, 61, 0.3);
		border-radius: var(--radius-md);
		color: var(--color-brand-300);
		font-weight: 600;
		font-size: 0.82rem;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s;
	}
	.btn-upload:hover:not(:disabled) {
		background: rgba(12, 113, 61, 0.25);
	}
	.btn-upload:disabled {
		opacity: 0.5;
		cursor: wait;
	}
	.btn-upload.audio-btn {
		background: rgba(6, 182, 212, 0.15);
		border-color: rgba(6, 182, 212, 0.3);
		color: var(--color-accent-cyan);
	}
	.btn-upload.audio-btn:hover:not(:disabled) {
		background: rgba(6, 182, 212, 0.25);
	}

	/* Preview */
	.preview-thumb {
		margin-top: 0.5rem;
		max-width: 120px;
		max-height: 120px;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.08);
		object-fit: cover;
	}
	.audio-preview {
		margin-top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(6, 182, 212, 0.05);
		border: 1px solid rgba(6, 182, 212, 0.15);
		border-radius: var(--radius-md);
	}
	.audio-label {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-accent-cyan);
		white-space: nowrap;
	}
	.audio-preview audio {
		flex: 1;
		height: 36px;
	}

	/* Checkbox */
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	/* Actions */
	.form-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}
	.btn-cancel {
		padding: 0.6rem 1.25rem;
		background: var(--color-surface-200);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		font-weight: 500;
		cursor: pointer;
	}
	.btn-save {
		padding: 0.6rem 1.25rem;
		background: var(--color-brand-500);
		border: none;
		border-radius: var(--radius-md);
		color: #fff;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-save:hover {
		background: var(--color-brand-600);
	}
</style>
