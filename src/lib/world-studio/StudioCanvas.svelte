<script lang="ts">
	/**
	 * The one canvas, in two modes.
	 *
	 * *Map* mode pins each node to its coordinate over the same equirectangular
	 * artwork the globe uses, and turns on the border layer. *Graph* mode frees
	 * the positions and turns on ports and wires. One viewport, one selection,
	 * one set of pan/zoom/undo behaviours — rather than two canvases that would
	 * each need their own.
	 */
	import {
		Background,
		Controls,
		MiniMap,
		SvelteFlow,
		ViewportPortal,
		useSvelteFlow,
		type Connection,
		type Edge,
		type Node
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { ASSET_BASE } from '$lib/world/config';
	import BorderLayer from './BorderLayer.svelte';
	import EntityNode from './nodes/EntityNode.svelte';
	import { MAP_HEIGHT, MAP_WIDTH, clampLngLat, lngLatToXY, round, xyToLngLat } from './projection';
	import type { Studio } from './studio.svelte';
	import {
		KIND_COLORS,
		edgeRule,
		type BorderTool,
		type StudioMode,
		type StudioNodeKind
	} from './types';

	interface Props {
		studio: Studio;
		mode: StudioMode;
		/** Kinds currently shown; empty means all. */
		visibleKinds: StudioNodeKind[];
		/** Show only the selection and its neighbours. */
		focus: boolean;
		borderTool: BorderTool;
		/** Region slug whose outline is being drawn or edited. */
		borderTarget: string | null;
		backdropOpacity: number;
		onmessage?: (text: string) => void;
	}

	let {
		studio,
		mode,
		visibleKinds,
		focus,
		borderTool,
		borderTarget,
		backdropOpacity,
		onmessage
	}: Props = $props();

	const nodeTypes = { entity: EntityNode };
	const { screenToFlowPosition } = useSvelteFlow();

	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);

	/** Ring under construction, in `[lng, lat]`. */
	let drafting = $state<number[][]>([]);
	let selectedVertex = $state<number | null>(null);

	let focusSet = $derived(
		focus && studio.selectedId !== null ? studio.neighbours(studio.selectedId) : null
	);

	let visible = $derived(
		new Set(visibleKinds.length === 0 ? (Object.keys(KIND_COLORS) as StudioNodeKind[]) : visibleKinds)
	);

	/**
	 * Rebuild the flow arrays from the document.
	 *
	 * Runs on every document change, including the one a drag just caused. That
	 * is deliberate: the position recomputed from the new coordinate is exactly
	 * where the node was dropped, so there is no visible correction — and the
	 * document stays the single source of truth rather than the canvas.
	 */
	$effect(() => {
		const mapMode = mode === 'map';
		const built: Node[] = [];

		for (const entry of studio.entries) {
			if (!visible.has(entry.kind)) continue;
			const layout = entry.layout ?? {};
			const placed = typeof layout.lat === 'number' && typeof layout.lng === 'number';

			// A node with no coordinate has nowhere to be on the map.
			if (mapMode && !placed) continue;

			const position = mapMode
				? lngLatToXY(layout.lng as number, layout.lat as number)
				: (layout.graph ?? { x: 0, y: 0 });

			built.push({
				id: String(entry.item.id),
				type: 'entity',
				position,
				selected: studio.selectedId === entry.item.id,
				draggable: !(mapMode && borderTool !== 'none'),
				data: {
					label: entry.item.name,
					kind: entry.kind,
					imageUrl: entry.item.image_url,
					mapMode,
					muted: focusSet ? !focusSet.has(entry.item.id) : false,
					unplaced: !placed,
					alt: typeof layout.alt === 'number' ? layout.alt : 0
				}
			});
		}

		nodes = built;

		edges =
			mapMode
				? []
				: studio.doc.edges
						.filter((e) => {
							const from = studio.byId.get(e.source);
							const to = studio.byId.get(e.target);
							if (!from || !to) return false;
							if (!visible.has(from.kind) || !visible.has(to.kind)) return false;
							if (focusSet && !(focusSet.has(e.source) && focusSet.has(e.target))) return false;
							return true;
						})
						.map((e) => ({
							id: `${e.source}-${e.target}-${e.role}`,
							source: String(e.source),
							target: String(e.target),
							label: edgeRule(
								studio.byId.get(e.source)!.kind,
								studio.byId.get(e.target)!.kind
							)?.label ?? e.role,
							animated: e.role === 'found_at',
							style: `stroke:${KIND_COLORS[studio.byId.get(e.source)!.kind]}`
						}));
	});

	// ── node interaction ──

	function handleDragStop(event: { targetNode: Node | null }) {
		const node = event.targetNode;
		if (!node) return;
		const id = Number(node.id);

		if (mode === 'map') {
			const raw = xyToLngLat(node.position.x, node.position.y);
			const { lng, lat } = clampLngLat(raw.lng, raw.lat);
			studio.patchNode(id, { lng: round(lng), lat: round(lat) });
		} else {
			studio.patchNode(id, {
				graph: { x: Math.round(node.position.x), y: Math.round(node.position.y) }
			});
		}
	}

	function handleConnect(connection: Connection) {
		const from = studio.byId.get(Number(connection.source));
		const to = studio.byId.get(Number(connection.target));
		if (!from || !to) return;

		const rule = edgeRule(from.kind, to.kind);
		if (!rule) {
			// Refuse rather than store something with no meaning.
			onmessage?.(
				`Không nối được ${from.kind} → ${to.kind}. Xem bảng quan hệ hợp lệ ở panel bên phải.`
			);
			return;
		}

		if (rule.role === 'belongs_to') {
			// "belongs to a region" is a property of the place, not a free edge.
			const slug = to.layout?.slug;
			if (!slug) {
				onmessage?.('Vùng đất này chưa có slug. Đặt slug trước khi gán địa điểm vào.');
				return;
			}
			studio.patchNode(from.item.id, { region: slug });
			onmessage?.(`${from.item.name} → thuộc ${to.item.name}`);
			return;
		}

		studio.addEdge({ source: from.item.id, target: to.item.id, role: rule.role });
		onmessage?.(`${from.item.name} ${rule.label} ${to.item.name}`);
	}

	function handleEdgeClick(event: { edge: Edge }) {
		// Ids are `source-target-role`; the role is rejoined rather than taken as
		// one segment, so a role containing a dash cannot corrupt the lookup.
		const [source, target, ...rest] = event.edge.id.split('-');
		studio.removeEdge({
			source: Number(source),
			target: Number(target),
			role: rest.join('-')
		});
		onmessage?.('Đã xoá liên kết');
	}

	// ── border drawing ──

	function handlePaneClick(event: { event: MouseEvent | TouchEvent }) {
		if (mode !== 'map' || borderTool !== 'draw' || !borderTarget) {
			studio.selectedId = null;
			return;
		}
		const source = event.event;
		if (!(source instanceof MouseEvent)) return;

		const flow = screenToFlowPosition({ x: source.clientX, y: source.clientY });
		const raw = xyToLngLat(flow.x, flow.y);
		const { lng, lat } = clampLngLat(raw.lng, raw.lat);

		// Clicking near the first vertex closes the ring.
		if (drafting.length >= 3) {
			const first = lngLatToXY(drafting[0][0], drafting[0][1]);
			const distance = Math.hypot(flow.x - first.x, flow.y - first.y);
			if (distance < 40) {
				commitRing();
				return;
			}
		}
		drafting = [...drafting, [round(lng), round(lat)]];
	}

	export function commitRing() {
		if (!borderTarget || drafting.length < 3) {
			drafting = [];
			return;
		}
		const existing = studio.doc.borders[borderTarget];
		studio.setBorder(borderTarget, {
			rings: [...(existing?.rings ?? []), drafting],
			color: existing?.color
		});
		onmessage?.(`Đã thêm một vòng ${drafting.length} đỉnh`);
		drafting = [];
	}

	export function cancelRing() {
		drafting = [];
	}

	export function undoVertex() {
		drafting = drafting.slice(0, -1);
	}

	function insertVertex(ringIndex: number, afterIndex: number, lng: number, lat: number) {
		if (!borderTarget) return;
		const border = studio.doc.borders[borderTarget];
		if (!border) return;
		const rings = border.rings.map((ring, index) => {
			if (index !== ringIndex) return ring;
			const next = [...ring];
			next.splice(afterIndex + 1, 0, [round(lng), round(lat)]);
			return next;
		});
		studio.setBorder(borderTarget, { ...border, rings });
	}

	/** Drag a vertex: track on the window so it keeps up outside the circle. */
	function startVertexDrag(index: number, event: PointerEvent) {
		if (!borderTarget) return;
		event.stopPropagation();
		selectedVertex = index;

		const move = (moveEvent: PointerEvent) => {
			const flow = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
			const raw = xyToLngLat(flow.x, flow.y);
			const { lng, lat } = clampLngLat(raw.lng, raw.lat);
			const border = studio.doc.borders[borderTarget];
			if (!border) return;
			const rings = border.rings.map((ring, ringIndex) =>
				ringIndex === 0
					? ring.map((point, i) => (i === index ? [round(lng), round(lat)] : point))
					: ring
			);
			studio.setBorder(borderTarget, { ...border, rings });
		};

		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	export function deleteSelectedVertex() {
		if (!borderTarget || selectedVertex === null) return;
		const border = studio.doc.borders[borderTarget];
		if (!border || !border.rings[0]) return;
		if (border.rings[0].length <= 3) {
			onmessage?.('Một vòng phải có ít nhất 3 đỉnh');
			return;
		}
		const rings = border.rings.map((ring, index) =>
			index === 0 ? ring.filter((_, i) => i !== selectedVertex) : ring
		);
		studio.setBorder(borderTarget, { ...border, rings });
		selectedVertex = null;
	}

	let regionNames = $derived(
		Object.fromEntries(
			studio.regions
				.filter((r) => r.layout?.slug)
				.map((r) => [r.layout!.slug as string, r.item.name])
		)
	);

	let backdrop = $derived(`${ASSET_BASE}/textures/akunalia-color-4k.jpg`);
</script>

<div class="canvas" class:drawing={borderTool === 'draw'}>
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		fitView
		minZoom={0.05}
		maxZoom={4}
		colorMode="dark"
		nodesConnectable={mode === 'graph'}
		elementsSelectable
		onnodedragstop={handleDragStop}
		onnodeclick={({ node }) => (studio.selectedId = Number(node.id))}
		onedgeclick={handleEdgeClick}
		onconnect={handleConnect}
		onpaneclick={handlePaneClick}
	>
		<Background bgColor="#060d16" patternColor="rgba(255,255,255,0.06)" gap={mode === 'map' ? 128 : 24} />
		<Controls />
		<MiniMap
			nodeColor={(node) => KIND_COLORS[(node.data as { kind: StudioNodeKind }).kind]}
			bgColor="rgba(6,13,22,0.9)"
		/>

		{#if mode === 'map'}
			<ViewportPortal target="back">
				<img
					class="backdrop"
					src={backdrop}
					alt=""
					width={MAP_WIDTH}
					height={MAP_HEIGHT}
					style="opacity:{backdropOpacity}"
					draggable="false"
				/>
				<BorderLayer
					borders={studio.doc.borders}
					names={regionNames}
					editing={borderTool === 'none' ? null : borderTarget}
					{drafting}
					{selectedVertex}
					onvertexdown={startVertexDrag}
					oninsert={insertVertex}
				/>
			</ViewportPortal>
		{/if}
	</SvelteFlow>
</div>

<style>
	.canvas {
		position: absolute;
		inset: 0;
	}
	.canvas.drawing :global(.svelte-flow__pane) {
		cursor: crosshair;
	}

	.backdrop {
		position: absolute;
		top: 0;
		left: 0;
		max-width: none;
		pointer-events: none;
		user-select: none;
	}

	:global(.svelte-flow__minimap) {
		border-radius: 8px;
	}
</style>
