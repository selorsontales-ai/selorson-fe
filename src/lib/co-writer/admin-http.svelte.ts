import type { ApiResponse } from '$lib/api';
import {
	allowsCapability,
	type RuntimeCapabilities,
	type RuntimeCapabilityKey
} from '$lib/runtime';
import {
	adminGet,
	adminPost as rawAdminPost,
	adminPut as rawAdminPut,
	adminDelete as rawAdminDelete
} from '$lib/stores/admin.svelte';

// ═══════════════════════════════════════════════
//  HTTP có kiểm năng lực runtime cho Co-Writer
// ═══════════════════════════════════════════════
// Deploy phục vụ bản snapshot chỉ đọc. Chặn ở client không thay được việc
// backend mới là nơi quyết định, nhưng nó biến một cú 403 khó hiểu thành
// một câu tiếng Việt nói rõ máy này không được phép làm gì — và nó chặn
// trước khi request rời máy.

export class CoWriterHttp {
	capabilities = $state<RuntimeCapabilities | null>(null);

	allows(capability: RuntimeCapabilityKey): boolean {
		return allowsCapability(this.capabilities, capability);
	}

	denied<T>(capability: RuntimeCapabilityKey): ApiResponse<T> {
		const target = this.capabilities?.target ?? 'unknown';
		return {
			success: false,
			data: null as T,
			message: `Runtime target ${target} không cho phép ${capability}.`
		};
	}

	get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
		return adminGet<T>(endpoint);
	}

	async post<T = unknown>(
		endpoint: string,
		body?: unknown,
		capability: RuntimeCapabilityKey = 'co_writer_write'
	): Promise<ApiResponse<T>> {
		if (!this.allows(capability)) return this.denied<T>(capability);
		return rawAdminPost<T>(endpoint, body);
	}

	async put<T = unknown>(
		endpoint: string,
		body?: unknown,
		capability: RuntimeCapabilityKey = 'co_writer_write'
	): Promise<ApiResponse<T>> {
		if (!this.allows(capability)) return this.denied<T>(capability);
		return rawAdminPut<T>(endpoint, body);
	}

	async del<T = unknown>(
		endpoint: string,
		body?: unknown,
		capability: RuntimeCapabilityKey = 'co_writer_write'
	): Promise<ApiResponse<T>> {
		if (!this.allows(capability)) return this.denied<T>(capability);
		return rawAdminDelete<T>(endpoint, body);
	}
}

/**
 * Việc mà một tab cần nhờ phần còn lại của trang làm.
 *
 * Ba tab không gọi thẳng vào nhau. Lưu một entity đổi số liệu ở thanh trạng
 * thái, và lưu chương ở Xưởng Viết đổi timeline ở Biên Niên Sử — hai việc
 * đó đi qua đây, nên phụ thuộc giữa các tab là danh sách đọc được thay vì
 * một mạng lưới ngầm.
 */
export interface CoWriterHooks {
	/** Số liệu tài liệu/chunk/entity/chương ở đầu trang đã cũ. */
	refreshStatus: () => void | Promise<void>;
	/** Nhật ký chương vừa đổi; Biên Niên Sử phải nạp lại timeline. */
	refreshChapterLogs: () => void | Promise<void>;
	/** Profile/generation embedding vừa đổi hoặc re-index vừa hoàn tất. */
	refreshEmbedding?: () => void | Promise<void>;
}
