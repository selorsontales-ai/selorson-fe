<!-- Admin Hero Slides -->
<script lang="ts">
	import AdminCrudTable from "$lib/components/admin/AdminCrudTable.svelte";
	import AdminModal from "$lib/components/admin/AdminModal.svelte";
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

	let items = $state<Record<string, unknown>[]>([]);
	let showForm = $state(false);
	let editing = $state<Record<string, unknown> | null>(null);
	let uploadingImage = $state(false);
	let imageInput = $state<HTMLInputElement>();

	let form = $state({
		title: "",
		description: "",
		image_url: "",
		button_text: "",
		link_url: "",
		display_order: 0,
		is_active: true,
	});

	const columns = [
		{ key: "id", label: "ID" },
		{ key: "title", label: "Tiêu đề" },
		{ key: "image_url", label: "Hình", type: "truncate" as const },
		{ key: "display_order", label: "Thứ tự" },
		{ key: "is_active", label: "Kích hoạt", type: "boolean" as const },
	];

	async function fetchItems() {
		try {
			const res =
				await adminGet<Record<string, unknown>[]>("/admin/hero-slides");
			if (res.success) items = res.data;
		} catch {
			/* empty */
		}
	}

	function openCreate() {
		editing = null;
		form = {
			title: "",
			description: "",
			image_url: "",
			button_text: "",
			link_url: "",
			display_order: 0,
			is_active: true,
		};
		showForm = true;
	}

	function openEdit(item: Record<string, unknown>) {
		editing = item;
		form = {
			title: (item.title as string) ?? "",
			description: (item.description as string) ?? "",
			image_url: (item.image_url as string) ?? "",
			button_text: (item.button_text as string) ?? "",
			link_url: (item.link_url as string) ?? "",
			display_order: (item.display_order as number) ?? 0,
			is_active: (item.is_active as boolean) ?? true,
		};
		showForm = true;
	}

	async function saveItem() {
		try {
			if (editing) {
				await adminPut(`/admin/hero-slides/${editing.id}`, form);
				toast_success("Cập nhật thành công!");
			} else {
				await adminPost("/admin/hero-slides", form);
				toast_success("Tạo mới thành công!");
			}
			showForm = false;
			fetchItems();
		} catch {
			toast_error("Có lỗi xảy ra.");
		}
	}

	async function deleteItem(item: Record<string, unknown>) {
		if (!confirm("Bạn chắc chắn muốn xóa?")) return;
		try {
			await adminDelete(`/admin/hero-slides/${item.id}`);
			toast_success("Đã xóa.");
			fetchItems();
		} catch {
			toast_error("Không thể xóa.");
		}
	}

	async function uploadImage(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		uploadingImage = true;
		try {
			const fd = new FormData();
			fd.append("image", file);
			fd.append("folder", "heroes");
			const res = await adminUpload<{ url: string }>("/upload/image", fd);
			if (res.success) {
				form.image_url = res.data.url;
				toast_success("Upload hình thành công!");
			}
		} catch {
			toast_error("Upload hình thất bại.");
		} finally {
			uploadingImage = false;
		}
	}

	onMount(fetchItems);
</script>

<svelte:head><title>Admin - Hero Slides</title></svelte:head>

<AdminCrudTable
	title="🎠 Quản lý Hero Slides"
	{columns}
	{items}
	showCreate
	showActions
	showDelete
	oncreate={openCreate}
	onedit={openEdit}
	ondelete={deleteItem}
/>

<AdminModal
	bind:open={showForm}
	title={editing ? "Chỉnh sửa Slide" : "Tạo Slide mới"}
>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			saveItem();
		}}
	>
		<input bind:value={form.title} placeholder="Tiêu đề" required />
		<div class="upload-row">
			<input
				type="file"
				bind:this={imageInput}
				accept="image/*"
				onchange={uploadImage}
				style="display:none"
			/>
			<button
				type="button"
				class="btn-upload"
				onclick={() => imageInput?.click()}
			>
				{uploadingImage ? "⏳ Đang tải..." : "📤 Upload hình"}
			</button>
			<input
				bind:value={form.image_url}
				placeholder="URL hình (auto-fill sau upload)"
				required
			/>
		</div>
		{#if form.image_url}
			<img src={form.image_url} alt="Preview" class="preview-thumb" />
		{/if}
		<input
			bind:value={form.button_text}
			placeholder="Text nút (tùy chọn)"
		/>
		<input bind:value={form.link_url} placeholder="Link URL (tùy chọn)" />
		<textarea bind:value={form.description} placeholder="Mô tả" rows="3"
		></textarea>
		<input
			bind:value={form.display_order}
			placeholder="Thứ tự"
			type="number"
		/>
		<label class="checkbox-label">
			<input type="checkbox" bind:checked={form.is_active} /> Kích hoạt
		</label>
		<div class="form-actions">
			<button
				type="button"
				class="btn-cancel"
				onclick={() => (showForm = false)}>Hủy</button
			>
			<button type="submit" class="btn-save"
				>{editing ? "Cập nhật" : "Tạo"}</button
			>
		</div>
	</form>
</AdminModal>
