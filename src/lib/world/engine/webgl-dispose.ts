/**
 * Bộ dọn tài nguyên GPU cho Three.js (Kế hoạch VRAM v2 · Đợt C · C1 — chép từ Akunarch app/ui/src/lib/webgl/dispose.ts, không import chéo repo).
 *
 * `WebGLRenderer.dispose()` KHÔNG xóa texture/buffer đã upload — VRAM chỉ được trả khi từng
 * tài nguyên phát sự kiện `dispose` trong lúc renderer còn sống. Vì vậy mọi sân khấu phải gọi
 * các hàm dưới đây TRƯỚC khi tháo renderer. Tuyệt đối không dùng `forceContextLoss()`.
 */
import type { BufferGeometry, Material, Object3D, Texture } from 'three';

type Disposable = { dispose: () => void };

function isTexture(v: unknown): v is Texture {
	return Boolean(v && (v as Texture).isTexture);
}

function disposeTextureOnce(tex: Texture, seen: Set<unknown>) {
	if (seen.has(tex)) return;
	seen.add(tex);
	tex.dispose();
}

/** Giải phóng mọi texture gắn trên material (mọi thuộc tính `*Map` + uniforms của ShaderMaterial) rồi chính material. */
export function disposeMaterialDeep(mat: Material, seen: Set<unknown> = new Set()) {
	if (!mat || seen.has(mat)) return;
	seen.add(mat);
	const record = mat as unknown as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		const v = record[key];
		if (isTexture(v)) disposeTextureOnce(v, seen);
	}
	const uniforms = record.uniforms as Record<string, { value?: unknown }> | undefined;
	if (uniforms) {
		for (const u of Object.values(uniforms)) {
			const val = u?.value;
			if (isTexture(val)) disposeTextureOnce(val, seen);
			else if (Array.isArray(val)) for (const item of val) if (isTexture(item)) disposeTextureOnce(item, seen);
		}
	}
	mat.dispose();
}

export interface DisposeOptions {
	/** Bỏ qua cả cây con của object này (vd. SparkRenderer được dọn riêng bằng `disposeSparkRenderer`). */
	skip?: (obj: Object3D) => boolean;
}

/**
 * Dọn cả cây Object3D: geometry, material (đơn/mảng, dùng chung chỉ dọn 1 lần), InstancedMesh,
 * shadow map của đèn, object tùy biến có `dispose()` (vd. SplatMesh). Với Scene: nền, environment rồi `clear()`.
 */
export function disposeObject3DDeep(root: Object3D, opts: DisposeOptions = {}, seen: Set<unknown> = new Set()) {
	if (!root) return;
	const visit = (obj: Object3D) => {
		if (opts.skip?.(obj)) return;
		for (const child of obj.children) visit(child);
		if (seen.has(obj)) return;
		seen.add(obj);

		const o = obj as Object3D & {
			geometry?: BufferGeometry;
			material?: Material | Material[];
			isMesh?: boolean;
			isLine?: boolean;
			isPoints?: boolean;
			isLight?: boolean;
			isInstancedMesh?: boolean;
			dispose?: () => void;
		};
		if (o.geometry && !seen.has(o.geometry)) {
			seen.add(o.geometry);
			o.geometry.dispose();
		}
		if (o.material) {
			const mats = Array.isArray(o.material) ? o.material : [o.material];
			for (const m of mats) disposeMaterialDeep(m, seen);
		}
		const isDrawable = o.isMesh || o.isLine || o.isPoints;
		if (typeof o.dispose === 'function' && (o.isLight || o.isInstancedMesh || !isDrawable)) {
			// DirectionalLight/SpotLight/PointLight.dispose() → shadow.dispose() (shadow map RT);
			// InstancedMesh.dispose(); SplatMesh và object tùy biến khác.
			o.dispose();
		}
	};
	visit(root);

	const scene = root as Object3D & { isScene?: boolean; background?: unknown; environment?: unknown };
	if (scene.isScene) {
		if (isTexture(scene.background)) disposeTextureOnce(scene.background, seen);
		if (isTexture(scene.environment)) disposeTextureOnce(scene.environment, seen);
		scene.background = null;
		scene.environment = null;
		root.clear();
	}
}

/** `EffectComposer.dispose()` chỉ dọn renderTarget1/2 + copyPass — phải dọn từng pass (UnrealBloomPass có chuỗi mip riêng). */
export function disposeComposer(composer: { passes: Array<Partial<Disposable>>; dispose: () => void } | null) {
	if (!composer) return;
	for (const pass of composer.passes) pass.dispose?.();
	composer.dispose();
}

/**
 * SparkRenderer (@sparkjsdev/spark 0.1.10) không có `dispose()`. Dọn PackedSplats của các accumulator,
 * các SparkViewpoint, geometry và material của chính nó — KHÔNG dọn texture trong uniforms vì
 * `SparkRenderer.EMPTY_SPLAT_TEXTURE` là texture tĩnh dùng chung giữa các phiên.
 */
export function disposeSparkRenderer(spark: Object3D | null) {
	if (!spark) return;
	const s = spark as Object3D & {
		active?: { splats?: Partial<Disposable> };
		freeAccumulators?: Array<{ splats?: Partial<Disposable> }>;
		defaultView?: Partial<Disposable>;
		viewpoint?: Partial<Disposable>;
		autoViewpoints?: Array<Partial<Disposable>>;
		geometry?: BufferGeometry;
		material?: Material | Material[];
	};
	const seen = new Set<unknown>();
	const once = (d: Partial<Disposable> | undefined) => {
		if (!d || seen.has(d)) return;
		seen.add(d);
		d.dispose?.();
	};
	once(s.active?.splats);
	for (const acc of s.freeAccumulators ?? []) once(acc?.splats);
	once(s.defaultView);
	once(s.viewpoint);
	for (const vp of s.autoViewpoints ?? []) once(vp);
	s.geometry?.dispose();
	const mats = Array.isArray(s.material) ? s.material : s.material ? [s.material] : [];
	for (const m of mats) m.dispose();
	spark.removeFromParent();
}
