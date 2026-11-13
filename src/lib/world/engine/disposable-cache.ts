/**
 * Kế hoạch VRAM v2 · Đợt C · C1 — cache Promise theo key, giải phóng được tài nguyên GPU.
 *
 * `purge()` dispose NGAY (đồng bộ) mọi mục đã nạp xong — phải gọi trong lúc WebGLRenderer còn sống,
 * vì sau `renderer.dispose()` three không còn tìm được texture GL để xóa. Mục đang nạp dở được
 * dispose khi về. Không dispose trùng.
 */
export class DisposablePromiseCache<K, V> {
	private pending = new Map<K, Promise<V | null>>();
	private settled = new Map<K, V | null>();
	private readonly release: (value: V) => void;

	constructor(release: (value: V) => void) {
		this.release = release;
	}

	get size(): number {
		return this.pending.size;
	}

	getOrCreate(key: K, factory: () => Promise<V | null>): Promise<V | null> {
		const cached = this.pending.get(key);
		if (cached) return cached;
		const promise = factory();
		this.pending.set(key, promise);
		promise.then(
			(value) => {
				if (this.pending.get(key) === promise) this.settled.set(key, value);
				else if (value) this.release(value); // về sau khi đã purge
			},
			() => {}
		);
		return promise;
	}

	purge(): void {
		for (const value of this.settled.values()) if (value) this.release(value);
		// Mục đang nạp: nhánh `then` trong getOrCreate tự dispose khi về (pending không còn trỏ tới nó)
		this.pending.clear();
		this.settled.clear();
	}
}
