<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import {
		adminGet,
		adminPost,
		adminPut,
		adminDelete,
		adminUpload,
		toast_success,
		toast_error,
	} from "$lib/stores/admin.svelte";
	import { onMount } from "svelte";
	import AdminChapterEditor from "$lib/components/admin/AdminChapterEditor.svelte";

	let chapterId = $derived(page.params.id || "new");
	let isEdit = $derived(chapterId !== "new");

	let loading = $state(true);
	let chapterData = $state<any>(null);

	onMount(async () => {
		if (isEdit) {
			try {
				// We now use the new /edit endpoint which returns chapter + assets + tags + links
				const r = await adminGet<any>(
					`/admin/chapters/${chapterId}/edit`,
				);
				if (r.success) {
					chapterData = r.data;
				} else {
					toast_error("Không tìm thấy chương");
					goto("/admin/chapters");
				}
			} catch {
				toast_error("Lỗi khi tải dữ liệu");
				goto("/admin/chapters");
			}
		}
		loading = false;
	});

	async function saveChapter(payload: any) {
		try {
			// 1. Process Pending Local Uploads FIRST
			if (
				payload.assets &&
				payload.assets.length > 0 &&
				payload.pendingUploads
			) {
				const pendingMap: Map<string, File> = payload.pendingUploads;
				let contentBlocksStr = JSON.stringify(payload.content_blocks);
				let contentHtmlStr = payload.content_html || "";

				for (let i = 0; i < payload.assets.length; i++) {
					const asset = payload.assets[i];
					if (asset.id < 0) {
						// Temporary local asset
						const blobUrl = asset.cloudinary_url;
						const file = pendingMap.get(blobUrl);
						if (file) {
							// Upload to Cloudinary now
							const formData = new FormData();
							formData.append("file", file);
							formData.append("folder", "chapters");
							const uploadRes = await adminUpload<any>(
								"/upload/image",
								formData,
							);

							if (uploadRes.success && uploadRes.data) {
								const realUrl = uploadRes.data.url;
								// Update the asset object
								payload.assets[i].cloudinary_url = realUrl;
								payload.assets[i].cloudinary_public_id =
									uploadRes.data.public_id;
								payload.assets[i].width =
									uploadRes.data.width || 0;
								payload.assets[i].height =
									uploadRes.data.height || 0;

								// Replace blob URL in strings
								contentBlocksStr = contentBlocksStr
									.split(blobUrl)
									.join(realUrl);
								contentHtmlStr = contentHtmlStr
									.split(blobUrl)
									.join(realUrl);
							}
						}
					}
				}

				// Restore updated content to payload
				payload.content_blocks = JSON.parse(contentBlocksStr);
				payload.content_html = contentHtmlStr;

				// Important: Remove pendingUploads from payload before sending to backend
				delete payload.pendingUploads;
			}

			// 2. Save Chapter
			let idToSync = chapterId;
			if (isEdit) {
				await adminPut(`/admin/chapters/${chapterId}`, payload);
			} else {
				const res = await adminPost<any>("/admin/chapters", payload);
				if (res.success && res.data && res.data.id) {
					idToSync = res.data.id.toString();
				}
			}

			// 3. Sync Tags, Links, and Assets
			if (idToSync !== "new") {
				if (payload.tags) {
					const tagPayload = payload.tags.map((t: any) => ({
						library_item_id: t.library_item_id,
						role: t.role,
					}));
					await adminPost(
						`/admin/chapters/${idToSync}/tags`,
						tagPayload,
					);
				}
				if (payload.links) {
					const linkPayload = payload.links.map((l: any) => ({
						linked_chapter_id: l.linked_chapter_id,
						link_type: l.link_type,
					}));
					await adminPost(
						`/admin/chapters/${idToSync}/links`,
						linkPayload,
					);
				}

				// Sync Assets
				if (payload.assets) {
					// 1. Save all uploaded temporary assets
					for (const asset of payload.assets) {
						if (asset.id < 0) {
							const assetPayload = {
								cloudinary_url: asset.cloudinary_url,
								cloudinary_public_id:
									asset.cloudinary_public_id,
								filename: asset.filename,
								size: asset.size,
								width: asset.width || 0,
								height: asset.height || 0,
								mime_type: asset.mime_type,
							};
							const res = await adminPost<any>(
								`/admin/chapters/${idToSync}/assets`,
								assetPayload,
							);
							if (!res.success)
								toast_error(
									`Lỗi lưu hình: ${res.message || "Không xác định"}`,
								);
						}
					}

					// 2. Auto-recover ghost images (images in content_blocks but missing from database)
					// This happens if a previous save failed after updating the blocks but before syncing assets.
					const existingUrls = payload.assets
						.filter((a: any) => a.id > 0)
						.map((a: any) => a.cloudinary_url);
					const newlyAddedUrls = payload.assets
						.filter((a: any) => a.id < 0)
						.map((a: any) => a.cloudinary_url);
					const allKnownUrls = new Set([
						...existingUrls,
						...newlyAddedUrls,
					]);

					for (const block of payload.content_blocks || []) {
						if (block.type === "image" && block.images) {
							for (const img of block.images) {
								if (
									img.cloudinary_url &&
									img.cloudinary_url.startsWith("http") &&
									!allKnownUrls.has(img.cloudinary_url)
								) {
									// Found a ghost image! Let's save it to the library.
									const ghostPayload = {
										cloudinary_url: img.cloudinary_url,
										cloudinary_public_id:
											img.cloudinary_public_id ||
											"recovered",
										filename:
											img.filename ||
											"recovered-image.jpg",
										size: img.size || 0,
										width: img.width || 0,
										height: img.height || 0,
										mime_type:
											img.mime_type || "image/jpeg",
									};
									const res = await adminPost<any>(
										`/admin/chapters/${idToSync}/assets`,
										ghostPayload,
									);
									if (res.success)
										allKnownUrls.add(img.cloudinary_url); // Prevent duplicate inserts
								}
							}
						}
					}
				}
			}

			toast_success(
				isEdit ? "Đã cập nhật chương!" : "Đã tạo chương mới!",
			);
			setTimeout(() => {
				goto("/admin/chapters");
			}, 1500);
		} catch {
			toast_error("Lỗi khi lưu chương");
		}
	}
</script>

<svelte:head>
	<title>{isEdit ? "Sửa Chương" : "Tạo Chương Mới"} — Admin</title>
</svelte:head>

{#if loading}
	<div class="editor-loading">
		<div class="spinner"></div>
		<p>Đang tải dữ liệu chương...</p>
	</div>
{:else if isEdit && chapterData}
	<AdminChapterEditor
		{chapterId}
		initialTitle={chapterData.chapter.title}
		initialContent={chapterData.chapter.content}
		initialBlocks={chapterData.chapter.content_blocks}
		initialStatus={chapterData.chapter.status}
		initialChapterNumber={chapterData.chapter.chapter_number}
		initialAuthorNote={chapterData.chapter.author_note}
		initialAssets={chapterData.assets}
		initialTags={chapterData.library_tags}
		initialLinks={chapterData.links}
		onsave={saveChapter}
	/>
{:else if !isEdit}
	<AdminChapterEditor chapterId="new" onsave={saveChapter} />
{/if}

<style>
	.editor-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 60vh;
		color: var(--color-text-muted);
		gap: 1rem;
	}
	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--color-surface-200);
		border-top-color: var(--color-brand-500);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
