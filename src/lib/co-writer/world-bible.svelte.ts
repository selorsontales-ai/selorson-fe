import { showToast, toast_error, toast_success } from '$lib/stores/admin.svelte';
import type { CoWriterHooks, CoWriterHttp } from './admin-http.svelte';

// ═══════════════════════════════════════════════
//  Kinh Thánh Thế Giới — thực thể và phát hiện
// ═══════════════════════════════════════════════

export const ENTITY_TYPES = [
	{ value: 'character', label: '👤 Nhân Vật', prefix: 'CHR' },
	{ value: 'location', label: '📍 Địa Danh', prefix: 'LOC' },
	{ value: 'legend', label: '📜 Truyền Thuyết', prefix: 'LGD' },
	{ value: 'item', label: '⚔️ Vật Phẩm', prefix: 'ITM' },
	{ value: 'event', label: '⚡ Sự Kiện', prefix: 'EVT' },
	{ value: 'organization', label: '🏛️ Tổ Chức', prefix: 'ORG' }
];

export function entityIcon(type: string): string {
	return ENTITY_TYPES.find((entry) => entry.value === type)?.label?.split(' ')[0] || '📌';
}

function emptyForm() {
	return {
		entity_type: 'character',
		name: '',
		aliases: '',
		role: '',
		first_chapter: 1,
		collision_priority: 1,
		description: ''
	};
}

export class WorldBibleState {
	entities = $state<any[]>([]);
	entityFilter = $state('');
	entitySearch = $state('');
	expandedEntityIds = $state<Set<string>>(new Set());

	showEntityModal = $state(false);
	editingEntity = $state<any>(null);
	entityForm = $state(emptyForm());

	// Phát hiện thực thể từ file
	isDetecting = $state(false);
	detectedEntities = $state<any[]>([]);
	showDetectModal = $state(false);
	detectSelectedIds = $state<Set<number>>(new Set());

	filtered = $derived(
		this.entities.filter((entity) => {
			const query = this.entitySearch.trim().toLowerCase();
			if (!query) return true;
			return (
				entity.name?.toLowerCase().includes(query) ||
				entity.id?.toLowerCase().includes(query) ||
				(Array.isArray(entity.aliases) &&
					entity.aliases.some((alias: string) => alias.toLowerCase().includes(query)))
			);
		})
	);

	constructor(
		private http: CoWriterHttp,
		private hooks: CoWriterHooks
	) {}

	busy(): boolean {
		return this.isDetecting;
	}

	reset() {
		this.entities = [];
		this.expandedEntityIds = new Set();
	}

	async load() {
		const typeParam = this.entityFilter ? `?type=${this.entityFilter}` : '';
		const res = await this.http.get<any[]>(`/admin/writer/entities${typeParam}`);
		if (res.success && res.data) this.entities = res.data;
	}

	async setFilter(filter: string) {
		this.entityFilter = filter;
		await this.load();
	}

	toggleExpand(id: string) {
		const next = new Set(this.expandedEntityIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.expandedEntityIds = next;
	}

	openCreate() {
		this.editingEntity = null;
		this.entityForm = emptyForm();
		this.showEntityModal = true;
	}

	openEdit(entity: any) {
		this.editingEntity = entity;
		this.entityForm = {
			entity_type: entity.entity_type,
			name: entity.name,
			aliases: Array.isArray(entity.aliases) ? entity.aliases.join(', ') : '',
			role: entity.role || '',
			first_chapter: entity.first_chapter || 1,
			collision_priority: entity.collision_priority || 1,
			description: entity.description || ''
		};
		this.showEntityModal = true;
	}

	async save() {
		const payload = {
			...this.entityForm,
			aliases: this.entityForm.aliases
				.split(',')
				.map((alias) => alias.trim())
				.filter(Boolean)
		};

		if (this.editingEntity) {
			const res = await this.http.put(`/admin/writer/entities/${this.editingEntity.id}`, payload);
			if (res.success) {
				toast_success('Đã cập nhật entity');
				this.showEntityModal = false;
				await this.load();
			} else toast_error(res.message || 'Lỗi');
			return;
		}

		const res = await this.http.post<any>('/admin/writer/entities', payload);
		if (res.success) {
			toast_success(`Đã tạo ${res.data?.id}`);
			this.showEntityModal = false;
			await this.load();
			await this.hooks.refreshStatus();
		} else toast_error(res.message || 'Lỗi');
	}

	async remove(id: string) {
		if (!confirm(`Xóa entity ${id}?`)) return;
		const res = await this.http.del(`/admin/writer/entities/${id}`);
		if (res.success) {
			toast_success('Đã xóa');
			await this.load();
			await this.hooks.refreshStatus();
		} else toast_error(res.message || 'Lỗi');
	}

	// ─── Phát hiện thực thể ───

	handleDetectFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (loaded) => {
			const content = (loaded.target?.result as string) || '';
			this.isDetecting = true;
			const res = await this.http.post<any>('/admin/writer/entities/detect', { content });
			this.isDetecting = false;
			if (res.success && res.data) {
				this.detectedEntities = res.data;
				// Index theo mảng GỐC — filter trước rồi map index sẽ tick nhầm phần tử
				this.detectSelectedIds = new Set(
					res.data
						.map((entity: any, index: number) => (entity.is_new ? index : -1))
						.filter((index: number) => index >= 0)
				);
				this.showDetectModal = true;
				toast_success(`AI phát hiện ${res.data.length} entities`);
				if ((res as any).truncated) {
					showToast('File dài — AI chỉ phân tích ~8KB đầu tiên', 'info');
				}
			} else toast_error(res.message || 'Phát hiện thất bại');
		};
		reader.readAsText(file);
		input.value = '';
	}

	toggleDetected(index: number) {
		const next = new Set(this.detectSelectedIds);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		this.detectSelectedIds = next;
	}

	async approveDetected() {
		let added = 0;
		for (const index of this.detectSelectedIds) {
			const entity = this.detectedEntities[index];
			if (!entity || !entity.is_new) continue;
			const res = await this.http.post<any>('/admin/writer/entities', {
				entity_type: entity.entity_type,
				name: entity.name,
				aliases: entity.aliases || [],
				role: entity.role || '',
				description: entity.description || '',
				first_chapter: entity.first_chapter || 1,
				collision_priority: 1
			});
			if (res.success) added++;
		}
		this.showDetectModal = false;
		if (added > 0) {
			toast_success(`Đã thêm ${added} entities mới!`);
			await this.load();
			await this.hooks.refreshStatus();
		}
	}
}
