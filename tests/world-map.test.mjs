import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

import {
	isUnlockedState,
	isExploredState,
	resolveWorldNodeTargetUrl,
	findNodeByFocusParam,
	filterWorldNodes,
	latLngToSvgPoint,
	geoJsonGeometryToSvgPath
} from '../src/lib/world/world-utils.ts';

test('isUnlockedState and isExploredState handle all 4 RevealState variants without locking explored nodes', () => {
	assert.equal(isUnlockedState('revealed'), true);
	assert.equal(isUnlockedState('explored'), true);
	assert.equal(isUnlockedState('rumored'), false);
	assert.equal(isUnlockedState('hidden'), false);

	assert.equal(isExploredState('explored'), true);
	assert.equal(isExploredState('revealed'), false);
	assert.equal(isExploredState('rumored'), false);
});

test('resolveWorldNodeTargetUrl routes regions, locations, and characters to their exact 3D scenes', () => {
	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 1,
			slug: 'annamland',
			kind: 'region',
			category: 'location',
			region: null
		}),
		'/world/annamland'
	);

	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 2,
			slug: 'tinh-that-eryndor',
			kind: 'landmark',
			category: 'location',
			region: 'eryndor'
		}),
		'/world/eryndor/tinh-that-eryndor'
	);

	// Standalone location without parent region falls back to /world/_/{slug}
	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 3,
			slug: 'rung-dau-rai',
			kind: 'poi',
			category: 'location',
			region: null
		}),
		'/world/_/rung-dau-rai'
	);

	assert.equal(
		resolveWorldNodeTargetUrl({
			id: 4,
			slug: 'hokabe-pha',
			kind: 'character',
			category: 'main_character',
			region: null
		}),
		'/world/journey/4'
	);
});

test('findNodeByFocusParam matches by numeric id, slug, and accent-insensitive Vietnamese name', () => {
	const nodes = [
		{ id: 10, slug: 'annamland', name: 'An Nam Lĩnh' },
		{ id: 25, slug: 'dinh-meru', name: 'Đỉnh Meru' }
	];

	assert.equal(findNodeByFocusParam(nodes, '25')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'dinh-meru')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'Đỉnh Meru')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'dinh meru')?.id, 25);
	assert.equal(findNodeByFocusParam(nodes, 'unknown'), null);
});

test('filterWorldNodes supports kind filtering and chapter syntax search', () => {
	const sample = [
		{
			id: 1,
			slug: 'eryndor',
			name: 'Thánh Đô Eryndor',
			kind: 'region',
			category: 'location',
			terrain: 'citadel',
			region: null,
			chapters: [1, 2, 6]
		},
		{
			id: 2,
			slug: 'rung-dau-rai',
			name: 'Rừng Dầu Rái',
			kind: 'poi',
			category: 'location',
			terrain: 'forest',
			region: 'nam-bo',
			chapters: [3, 7]
		},
		{
			id: 3,
			slug: 'darkin-tenka',
			name: 'Darkin Tenka',
			kind: 'character',
			category: 'main_character',
			terrain: null,
			region: null,
			chapters: [2, 6]
		}
	];

	assert.equal(filterWorldNodes(sample, '', 'region').length, 1);
	assert.equal(filterWorldNodes(sample, '', 'location').length, 1);
	assert.equal(filterWorldNodes(sample, '', 'character').length, 1);
	assert.equal(filterWorldNodes(sample, 'dau rai', 'all')[0]?.id, 2);
	assert.equal(filterWorldNodes(sample, 'Ch.3', 'all')[0]?.id, 2);
	assert.equal(filterWorldNodes(sample, 'chương 6', 'all').length, 2);
});

test('latLngToSvgPoint and geoJsonGeometryToSvgPath project equirectangular coordinates accurately', () => {
	assert.deepEqual(latLngToSvgPoint(0, 0, 1000, 500), { x: 500, y: 250 });
	assert.deepEqual(latLngToSvgPoint(90, -180, 1000, 500), { x: 0, y: 0 });
	assert.deepEqual(latLngToSvgPoint(-90, 180, 1000, 500), { x: 1000, y: 500 });

	const pathStr = geoJsonGeometryToSvgPath(
		{
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[36, 0],
					[36, 18],
					[0, 0]
				]
			]
		},
		1000,
		500
	);
	assert.ok(pathStr.startsWith('M500,250 L600,250 L600,200'));
	assert.ok(pathStr.endsWith('Z'));
});

test('World HUD, Atlas 2D, and 3D Markers preserve explored state and bi-directional deep-links', () => {
	const worldHudSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/WorldHud.svelte'),
		'utf8'
	);
	const markerSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/Marker.svelte'),
		'utf8'
	);
	const atlasSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/WorldAtlas2D.svelte'),
		'utf8'
	);
	const worldPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/+page.svelte'),
		'utf8'
	);

	assert.ok(worldHudSrc.includes('isUnlockedState(selected.state)'));
	assert.ok(worldHudSrc.includes('/library?id={selected.id}'));
	assert.ok(markerSrc.includes('isUnlockedState(node.state)'));
	assert.ok(atlasSrc.includes('geoJsonGeometryToSvgPath'));
	assert.ok(worldPageSrc.includes('WorldAtlas2D'));
	assert.ok(worldPageSrc.includes('findNodeByFocusParam'));
	assert.ok(worldPageSrc.includes('/world/journey/'));
});

test('3D scenes fly camera back to HOME on deselect and world routes reload reactively on same-route navigation', () => {
	const globeSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/GlobeScene.svelte'),
		'utf8'
	);
	const regionPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/[region]/+page.svelte'),
		'utf8'
	);
	const placePageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/[region]/[slug]/+page.svelte'),
		'utf8'
	);
	const journeyPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/journey/[id]/+page.svelte'),
		'utf8'
	);
	const openWorldPageSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/WorldOpenRealm.svelte'),
		'utf8'
	);
	const apiSrc = fs.readFileSync(path.resolve('src/lib/world/api.ts'), 'utf8');

	assert.ok(globeSceneSrc.includes('hadSelection'));
	assert.ok(regionPageSrc.includes('{#key region.id}'));
	assert.ok(placePageSrc.includes('{#key detail.place.id}'));
	assert.ok(journeyPageSrc.includes('{#key journey.character.id}'));
	assert.ok(openWorldPageSrc.includes('fetchWorldChunks'));
	assert.equal(fs.existsSync(path.resolve('src/routes/(app)/open-world/+page.svelte')), false);
	assert.ok(apiSrc.includes("'/world/chunks'"));
	assert.equal(fs.existsSync(path.resolve('src/lib/world/engine/RegionScene.svelte')), false);
	assert.equal(fs.existsSync(path.resolve('src/lib/world/builders/terrain.ts')), false);
});

test('Chặng 1A: Dual-Sector Dynamic Reference-Frame Cosmos isolates Tinh Vực Akunalia & Hệ Mặt Trời and keeps active body at [0,0,0]', async () => {
	const {
		COSMIC_SECTORS,
		CELESTIAL_BODIES,
		computeSectorSnapshot,
		sampleBodyOrbitLoop,
		resolveNodePlanet,
		resolveNodeEra
	} = await import('../src/lib/world/cosmos.ts');

	// Verify all 14 celestial bodies across 2 strictly independent sectors
	assert.deepEqual(Object.keys(COSMIC_SECTORS), ['akunalia_sector', 'solar_system']);
	assert.deepEqual(COSMIC_SECTORS.akunalia_sector.bodyOrder, [
		'akunalia',
		'akunalia_star',
		'akunalia_moon_major',
		'akunalia_moon_minor'
	]);
	assert.deepEqual(COSMIC_SECTORS.solar_system.bodyOrder, [
		'sun',
		'mercury',
		'venus',
		'earth',
		'moon',
		'mars',
		'jupiter',
		'saturn',
		'uranus',
		'neptune'
	]);
	assert.equal(Object.keys(CELESTIAL_BODIES).length, 14);

	// Zero cross-sector overlap
	const akSet = new Set(COSMIC_SECTORS.akunalia_sector.bodyOrder);
	for (const solarId of COSMIC_SECTORS.solar_system.bodyOrder) {
		assert.equal(akSet.has(solarId), false, `${solarId} must not leak into akunalia_sector`);
	}

	// Dynamic Reference Frame invariant: any selected body sits at exact [0, 0, 0] for all t
	for (const t of [0, 17.5, 142.8]) {
		const akSnap = computeSectorSnapshot('akunalia_sector', t, 'akunalia');
		assert.deepEqual(akSnap.bodies.akunalia.relativePos, [0, 0, 0]);
		assert.ok(Math.hypot(...akSnap.starRelativePos) > 40, 'Host star orbits relatively around Akunalia');
		assert.ok(
			Math.abs(Math.hypot(...akSnap.bodies.akunalia.starDir) - 1) < 1e-5,
			'Akunalia starDir must be unit length'
		);

		const saturnSnap = computeSectorSnapshot('solar_system', t, 'saturn');
		assert.deepEqual(saturnSnap.bodies.saturn.relativePos, [0, 0, 0]);
		assert.ok(Math.hypot(...saturnSnap.bodies.sun.relativePos) > 80, 'Sun moves relatively when Saturn is centered');
		assert.ok(Math.hypot(...saturnSnap.bodies.earth.relativePos) > 20, 'Earth moves relatively around Saturn frame');

		// Tier 0 Sector Overview (referenceBodyId = null) centers host star at [0, 0, 0]
		const overviewSnap = computeSectorSnapshot('solar_system', t, null);
		assert.deepEqual(overviewSnap.bodies.sun.relativePos, [0, 0, 0]);
		assert.deepEqual(overviewSnap.starRelativePos, [0, 0, 0]);
	}

	// Relative Keplerian orbit loop closes cleanly and central star has empty orbit loop
	assert.deepEqual(sampleBodyOrbitLoop('sun', 32), []);
	const earthLoop = sampleBodyOrbitLoop('earth', 64);
	assert.equal(earthLoop.length, 65);
	const closureErr = Math.hypot(
		earthLoop[0][0] - earthLoop[64][0],
		earthLoop[0][1] - earthLoop[64][1],
		earthLoop[0][2] - earthLoop[64][2]
	);
	assert.ok(closureErr < 1e-6, `Orbit loop must close smoothly, got error ${closureErr}`);

	// Empty / null boundary inputs default safely to Akunalia
	assert.equal(resolveNodePlanet({ slug: '', name: null, region: null }), 'akunalia');
	assert.equal(resolveNodeEra({ slug: '', name: null, region: null }), null);

	// Explicit planet/era overrides always win over name heuristics
	assert.equal(
		resolveNodePlanet({ planet: '  EARTH ', slug: 'cintland', name: 'Cintland', region: null }),
		'earth'
	);
	assert.equal(
		resolveNodePlanet({ planet: 'akunalia', slug: 'olympus-gate', name: 'Olympus', region: null }),
		'akunalia'
	);
	assert.equal(
		resolveNodeEra({
			planet: 'earth',
			era: 'era_2500_ce',
			slug: 'custom-node',
			name: 'Custom',
			region: null
		}),
		'era_2500_ce'
	);

	// Accented Vietnamese & canonical Saga I / Akunalia names
	assert.equal(
		resolveNodePlanet({ slug: 'tabaoki-nilanda', name: 'Đỉnh Tuyết Sơn Tabaoki', region: null }),
		'akunalia'
	);
	assert.equal(
		resolveNodePlanet({ slug: 'rung-dau-rai', name: 'Rừng Dầu Rái Nam Bộ', region: null }),
		'earth'
	);
	assert.equal(
		resolveNodeEra({ slug: 'rung-dau-rai', name: 'Rừng Dầu Rái Nam Bộ', region: null }),
		'era_2000_ce'
	);
	assert.equal(
		resolveNodeEra({ slug: 'dinh-meru', name: 'Đỉnh Meru', region: 'an-do' }),
		'era_300_bce'
	);
	assert.equal(
		resolveNodeEra({ slug: 'dun-scaith', name: 'Pháo đài Dún Scáith', region: null }),
		'era_1000_bce'
	);
	assert.equal(
		resolveNodeEra({ slug: 'den-co-kyoto', name: 'Đền cổ Kyoto', region: null }),
		'era_1850_ce'
	);
	assert.equal(
		resolveNodeEra({ slug: 'tang-dem-tro-xam', name: 'Tầng Đệm Tro Xám', region: null }),
		'era_2500_ce'
	);
});

test('Chặng 1A: Temporal Divergence Meter, Akunalia Canon Nodes & Earth Singularities enforce Spoiler-safe Fog of War and VI/EN output', async () => {
	const {
		TIMELINE_2_UNLOCK_CHAPTER,
		computeTemporalRevealState,
		isTimeline2Unshielded,
		formatDivergenceValue,
		buildAkunaliaCanonNodes,
		buildEarthSingularityNodes,
		filterNodesForPlanetAndEra
	} = await import('../src/lib/world/cosmos.ts');

	// Boundary checks for Spoiler-safe Fog of War
	assert.equal(computeTemporalRevealState(1, null), 'revealed');
	assert.equal(computeTemporalRevealState(1, 0), 'revealed');
	assert.equal(computeTemporalRevealState(5, 1), 'rumored');
	assert.equal(computeTemporalRevealState(6, 1), 'hidden');

	assert.equal(isTimeline2Unshielded(null), false);
	assert.equal(isTimeline2Unshielded(TIMELINE_2_UNLOCK_CHAPTER - 1), false);
	assert.equal(isTimeline2Unshielded(TIMELINE_2_UNLOCK_CHAPTER), true);

	const t1Ak = formatDivergenceValue(1, 'ak_origin', 'akunalia', 1);
	assert.match(t1Ak.value, /^0\.337\d{3}%$/);
	assert.equal(t1Ak.shielded, false);

	const t2Shielded = formatDivergenceValue(2, 'era_1000_bce', 'earth', 3);
	assert.match(t2Shielded.value, /^1\.0\d{5}%$/);
	assert.equal(t2Shielded.shielded, true);

	const t2Open = formatDivergenceValue(2, 'era_1000_bce', 'earth', TIMELINE_2_UNLOCK_CHAPTER);
	assert.equal(t2Open.shielded, false);

	// Akunalia Canon Landmarks materialize cleanly with Tabaoki, Behadona, Zyberon, Crescent Sea, Eldarin
	const akVi = buildAkunaliaCanonNodes('vi', 1, 1, new Set());
	assert.ok(akVi.length >= 6);
	assert.ok(akVi.some((n) => n.name?.includes('Tabaoki')));
	assert.ok(akVi.some((n) => n.name?.includes('Behadona')));
	assert.ok(akVi.some((n) => n.name?.includes('Zyberon')));
	assert.ok(akVi.some((n) => n.name?.includes('Hồ Bán Nguyệt')));
	assert.ok(akVi.some((n) => n.name?.includes('Eldarin')));

	// Guest/Ch.1 reader sees Ch.1 singularity unlocked, Ch.10 rumored with null description
	const viNodes = buildEarthSingularityNodes('vi', 2, 1, new Set());
	assert.equal(viNodes.length, 8);
	const namBo = viNodes.find((n) => n.slug === 'singularity-nam-bo-forest');
	const greyAsh = viNodes.find((n) => n.slug === 'singularity-grey-ash-buffer');
	assert.equal(namBo?.state, 'revealed');
	assert.ok(namBo?.description && !namBo.description.includes('⚡')); // Shielded at Ch.1!
	assert.equal(greyAsh?.state, 'rumored');
	assert.equal(greyAsh?.description, null);

	// Reader past Ch.18 on Timeline 2 sees unshielded cross-era resonance notes in English too
	const enNodes = buildEarthSingularityNodes(
		'en',
		2,
		TIMELINE_2_UNLOCK_CHAPTER,
		new Set(['singularity-nam-bo-forest'])
	);
	assert.equal(enNodes.length, 7); // Deduplicated existing slug
	const olympusEn = enNodes.find((n) => n.slug === 'singularity-samos-olympus');
	assert.equal(olympusEn?.state, 'revealed');
	assert.ok(olympusEn?.name?.includes('Mount Olympus'));
	assert.ok(olympusEn?.description?.includes('⚡'));

	// Eryndor/Saqqara bridges both 3000 BCE and 2000 CE eras; non-narrative planets return []
	const era3000 = filterNodesForPlanetAndEra(viNodes, 'earth', 'era_3000_bce', 1);
	assert.equal(era3000.length, 1);
	assert.equal(era3000[0]?.slug, 'singularity-eryndor-saqqara');
	assert.deepEqual(filterNodesForPlanetAndEra(viNodes, 'saturn', 'all', 1), []);
});

function readJpegDimensions(buf) {
	assert.equal(buf[0], 0xff);
	assert.equal(buf[1], 0xd8);
	let pos = 2;
	while (pos < buf.length) {
		while (pos < buf.length && buf[pos] === 0xff) pos++;
		const marker = buf[pos++];
		if (marker === 0xd9 || marker === 0xda) break;
		const segLen = buf.readUInt16BE(pos);
		if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
			return {
				height: buf.readUInt16BE(pos + 3),
				width: buf.readUInt16BE(pos + 5)
			};
		}
		pos += segLen;
	}
	throw new Error('JPEG SOF marker not found');
}

function decodeRgbaPng8(buf) {
	assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
	const width = buf.readUInt32BE(16);
	const height = buf.readUInt32BE(20);
	const idatChunks = [];
	let offset = 8;
	while (offset < buf.length) {
		const len = buf.readUInt32BE(offset);
		const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
		if (type === 'IDAT') {
			idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
		} else if (type === 'IEND') {
			break;
		}
		offset += 12 + len;
	}
	const raw = zlib.inflateSync(Buffer.concat(idatChunks));
	const bpp = 4;
	const stride = width * bpp;
	const pixels = new Uint8Array(height * stride);

	const paeth = (a, b, c) => {
		const p = a + b - c;
		const pa = Math.abs(p - a);
		const pb = Math.abs(p - b);
		const pc = Math.abs(p - c);
		if (pa <= pb && pa <= pc) return a;
		return pb <= pc ? b : c;
	};

	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const rowIn = y * (stride + 1) + 1;
		const rowOut = y * stride;
		const prevRow = (y - 1) * stride;
		for (let i = 0; i < stride; i++) {
			const x = raw[rowIn + i];
			const a = i >= bpp ? pixels[rowOut + i - bpp] : 0;
			const b = y > 0 ? pixels[prevRow + i] : 0;
			const c = y > 0 && i >= bpp ? pixels[prevRow + i - bpp] : 0;
			let val = x;
			if (filter === 1) val = (x + a) & 0xff;
			else if (filter === 2) val = (x + b) & 0xff;
			else if (filter === 3) val = (x + ((a + b) >> 1)) & 0xff;
			else if (filter === 4) val = (x + paeth(a, b, c)) & 0xff;
			pixels[rowOut + i] = val;
		}
	}
	return { width, height, pixels };
}

test('Chặng 1A: AAA 4096x2048 Albedo JPGs, 2048x1024 RGBA PNGs (Alpha=255), GeoJSONs, and Rule #34 Subtext compliance are valid', async () => {
	for (const jpgRel of [
		'static/world/data/akunalia-albedo-4k.jpg',
		'static/world/data/earth-albedo-4k.jpg'
	]) {
		const dims = readJpegDimensions(fs.readFileSync(path.resolve(jpgRel)));
		assert.equal(dims.width, 4096, `${jpgRel} must be 4096px wide`);
		assert.equal(dims.height, 2048, `${jpgRel} must be 2048px tall`);
	}

	const pngFiles = [
		'static/world/data/akunalia-elevation-sdf.png',
		'static/world/data/akunalia-normal-spec.png',
		'static/world/data/earth-elevation-sdf.png',
		'static/world/data/earth-normal-spec.png'
	];

	for (const rel of pngFiles) {
		const buf = fs.readFileSync(path.resolve(rel));
		// Verify PNG magic signature + IHDR 2048x1024 8-bit RGBA (colorType = 6)
		assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${rel} PNG signature`);
		assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `${rel} IHDR chunk`);
		assert.equal(buf.readUInt32BE(16), 2048, `${rel} width`);
		assert.equal(buf.readUInt32BE(20), 1024, `${rel} height`);
		assert.equal(buf.readUInt8(24), 8, `${rel} bit depth`);
		assert.equal(buf.readUInt8(25), 6, `${rel} RGBA color type`);

		// Decode all 2,097,152 RGBA pixels to guarantee Alpha === 255 everywhere
		const { width, height, pixels } = decodeRgbaPng8(buf);
		const totalPx = width * height;
		let minAlpha = 255;
		let landPx = 0;
		for (let p = 0; p < totalPx; p++) {
			const idx = p * 4;
			if (pixels[idx + 3] < minAlpha) minAlpha = pixels[idx + 3];
			if (rel.includes('elevation')) {
				const h16 = (pixels[idx] * 256 + pixels[idx + 1]) / 65535.0;
				if (h16 > 0.25) landPx++;
			}
		}
		assert.equal(
			minAlpha,
			255,
			`${rel} must keep Alpha === 255 on every pixel so HTML5 Canvas never zeroes RGB`
		);
		if (rel.includes('elevation')) {
			const landRatio = landPx / totalPx;
			assert.ok(
				landRatio > 0.22 && landRatio < 0.55,
				`${rel} expected realistic land ratio in (0.22..0.55), got ${landRatio.toFixed(4)}`
			);
		}
	}

	const manifest = JSON.parse(
		fs.readFileSync(path.resolve('static/world/data/world-manifest.json'), 'utf8')
	);
	assert.equal(manifest.version, 2);
	assert.equal(manifest.seaLevelNormalized, 0.25);
	assert.deepEqual(manifest.albedoResolution, [4096, 2048]);
	assert.deepEqual(manifest.dataResolution, [2048, 1024]);
	assert.equal(manifest.planets.akunalia.albedo, 'akunalia-albedo-4k.jpg');
	assert.equal(manifest.planets.earth.continentsGeojson, 'earth-continents.geojson');

	const regionsGeo = JSON.parse(
		fs.readFileSync(path.resolve('static/world/regions.geojson'), 'utf8')
	);
	assert.equal(regionsGeo.type, 'FeatureCollection');
	assert.ok(regionsGeo.features.length >= 6);
	const slugs = new Set(regionsGeo.features.map((f) => f.properties?.region));
	for (const expected of [
		'tabaoki-nilanda',
		'zyberon-basin',
		'crescent-sea',
		'eldarin-highlands',
		'sky-archipelago'
	]) {
		assert.ok(slugs.has(expected), `regions.geojson missing ${expected}`);
		const feature = regionsGeo.features.find((f) => f.properties?.region === expected);
		const svgPath = geoJsonGeometryToSvgPath(feature.geometry, 1000, 500);
		assert.ok(svgPath.length > 20, `${expected} SVG path should not be empty`);
	}

	const earthGeo = JSON.parse(
		fs.readFileSync(path.resolve('static/world/data/earth-continents.geojson'), 'utf8')
	);
	assert.equal(earthGeo.type, 'FeatureCollection');
	assert.ok(earthGeo.features.length >= 1);
	const earthPath = geoJsonGeometryToSvgPath(earthGeo.features[0].geometry, 1000, 500);
	assert.ok(earthPath.length > 500, 'Earth continental GeoJSON must produce detailed SVG outlines');

	// Rule #34 (Subtext Only) & zero legacy akunalia-color-4k.jpg dependency checks
	for (const rel of [
		'src/lib/world/config.ts',
		'src/lib/world/cosmos.ts',
		'src/lib/world/ui/CosmicTimelineHud.svelte',
		'messages/vi.json',
		'messages/en.json'
	]) {
		const content = fs.readFileSync(path.resolve(rel), 'utf8');
		assert.ok(!/steins\s*;\s*gate/i.test(content), `Rule #34 Steins;Gate violation in ${rel}`);
		assert.ok(!/\bchaldeas\b/i.test(content), `Rule #34 CHALDEAS violation in ${rel}`);
		assert.ok(
			!/\b(nietzsche|dostoevsky|zhuangzi|kant|rawls)\b/i.test(content),
			`Rule #34 philosopher name violation in ${rel}`
		);
		assert.ok(
			!content.includes('akunalia-color-4k.jpg'),
			`${rel} must not reference discarded 2D illustration akunalia-color-4k.jpg`
		);
	}

	const { CELESTIAL_BODIES, WORLD_ERAS, EARTH_SINGULARITIES, resolveNodePlanet, resolveNodeEra } =
		await import('../src/lib/world/cosmos.ts');
	assert.equal(CELESTIAL_BODIES.earth.name.en, 'Multi-Era Earth');
	assert.ok(
		WORLD_ERAS.earth.some((e) => e.title.en.includes('Ash-Buffer Stratum')),
		'Expected locked glossary term Ash-Buffer Stratum'
	);
	assert.ok(
		EARTH_SINGULARITIES.some((s) => s.rumoredName.en.includes('Non-Reflective Veil')),
		'Expected locked glossary term Non-Reflective Veil'
	);
	assert.equal(
		resolveNodePlanet({ slug: 'dipterocarp-forest', name: 'Southern Vietnam', region: null }),
		'earth'
	);
	assert.equal(
		resolveNodeEra({ slug: 'ash-buffer-2485', name: 'Ash-Buffer Stratum', region: null }),
		'era_2500_ce'
	);
});

test('Chặng 1A: Zero clay/toy geometry, subtle vertex relief, ACES+Bloom pipeline, GLSL shaders & Light-Mode HUD contrast hold', async () => {
	const configSrc = fs.readFileSync(path.resolve('src/lib/world/config.ts'), 'utf8');
	const ampMatch = configSrc.match(/PLANET_ELEVATION_AMP\s*=\s*([0-9.]+)/);
	const radMatch = configSrc.match(/GLOBE_RADIUS\s*=\s*([0-9.]+)/);
	assert.ok(ampMatch && radMatch, 'config.ts must define PLANET_ELEVATION_AMP and GLOBE_RADIUS');
	const reliefRatio = Number(ampMatch[1]) / Number(radMatch[1]);
	assert.ok(
		reliefRatio >= 0.008 && reliefRatio <= 0.015,
		`Expected subtle planetary relief in [0.8%..1.5%], got ${(reliefRatio * 100).toFixed(2)}%`
	);

	// Verify 100% elimination of clay/toy geometry, neon coastline outlines, and fixed rainbow conduit
	const planetEcologySrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/PlanetEcology.svelte'),
		'utf8'
	);
	const planetSrc = fs.readFileSync(path.resolve('src/lib/world/engine/Planet.svelte'), 'utf8');
	const globeSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/GlobeScene.svelte'),
		'utf8'
	);
	const shaderSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/planet-shaders.ts'),
		'utf8'
	);

	for (const [name, src] of [
		['PlanetEcology.svelte', planetEcologySrc],
		['Planet.svelte', planetSrc],
		['GlobeScene.svelte', globeSceneSrc],
		['planet-shaders.ts', shaderSrc]
	]) {
		assert.ok(!src.includes('ConeGeometry'), `${name} must not use toy ConeGeometry`);
		assert.ok(!src.includes('DodecahedronGeometry'), `${name} must not use DodecahedronGeometry`);
		assert.ok(!src.includes('surfWave'), `${name} must not contain cartoon surfWave outline`);
		assert.ok(!src.includes('breakerEdge'), `${name} must not contain cartoon breakerEdge outline`);
		assert.ok(!src.includes('conduitCoreGeo'), `${name} must not contain fixed Rainbow TubeGeometry`);
		assert.ok(!src.includes('EldarinPrismCore'), `${name} must not mount legacy EldarinPrismCore`);
		assert.ok(!src.includes('#00f0ff'), `${name} must not wash planets with cyan #00f0ff fill light`);
	}

	assert.equal(
		fs.existsSync(path.resolve('src/lib/world/engine/EldarinPrismCore.svelte')),
		false,
		'Legacy EldarinPrismCore.svelte must stay deleted'
	);
	assert.ok(globeSceneSrc.includes('EffectComposer'), 'GlobeScene must wire EffectComposer');
	assert.ok(globeSceneSrc.includes('UnrealBloomPass'), 'GlobeScene must wire UnrealBloomPass');
	assert.ok(globeSceneSrc.includes('OutputPass'), 'GlobeScene must wire ACES OutputPass');

	// Verify North-South tangent orientation is right-handed (`cross(unitN, localEast)` = +Y North)
	assert.ok(
		shaderSrc.includes('cross(unitN, localEast)'),
		'Terrain vertex shader must compute localNorth = normalize(cross(unitN, localEast))'
	);

	let totalShaderPairs = 0;
	const pairRegex =
		/vertexShader:\s*(?:\/\* glsl \*\/\s*)?`([\s\S]*?)`\s*,\s*fragmentShader:\s*(?:\/\* glsl \*\/\s*)?`([\s\S]*?)`/g;
	let match;
	while ((match = pairRegex.exec(shaderSrc)) !== null) {
		totalShaderPairs += 1;
		const vert = match[1];
		const frag = match[2];

		assert.ok(
			/void\s+main\s*\(\s*\)/.test(vert),
			`Shader pair #${totalShaderPairs} vertex missing main()`
		);
		assert.ok(
			/void\s+main\s*\(\s*\)/.test(frag),
			`Shader pair #${totalShaderPairs} fragment missing main()`
		);
		assert.ok(
			/gl_Position\s*=/.test(vert),
			`Shader pair #${totalShaderPairs} vertex missing gl_Position`
		);
		assert.ok(
			/gl_FragColor\s*=/.test(frag),
			`Shader pair #${totalShaderPairs} fragment missing gl_FragColor`
		);
		assert.ok(
			frag.includes('#include <tonemapping_fragment>') &&
				frag.includes('#include <colorspace_fragment>'),
			`Shader pair #${totalShaderPairs} fragment must include Three.js tonemapping + colorspace chunks`
		);

		for (const [stageName, code] of [
			['vertex', vert],
			['fragment', frag]
		]) {
			const clean = code.replace(/\$\{GLSL_COMMON\}/g, '');
			const openBraces = (clean.match(/\{/g) || []).length;
			const closeBraces = (clean.match(/\}/g) || []).length;
			assert.equal(
				openBraces,
				closeBraces,
				`Unbalanced {} in pair #${totalShaderPairs} ${stageName}`
			);

			const openParens = (clean.match(/\(/g) || []).length;
			const closeParens = (clean.match(/\)/g) || []).length;
			assert.equal(
				openParens,
				closeParens,
				`Unbalanced () in pair #${totalShaderPairs} ${stageName}`
			);

			// Every pow(...) call in GLSL must clamp its base (or use a clamped identifier) to avoid HLSL/ANGLE NaN
			const powCalls = [...clean.matchAll(/\bpow\s*\(([^,]+),/g)].map((m) => m[1].trim());
			for (const baseExpr of powCalls) {
				assert.ok(
					baseExpr.startsWith('clamp(') || /^[a-zA-Z_]\w*$/.test(baseExpr),
					`Unclamped pow(${baseExpr}, ...) in pair #${totalShaderPairs} ${stageName}`
				);
			}
		}

		const extractVaryings = (code) =>
			[...code.matchAll(/varying\s+(\w+\s+\w+)\s*;/g)]
				.map((m) => m[1].replace(/\s+/g, ' ').trim())
				.sort();

		assert.deepEqual(
			extractVaryings(vert),
			extractVaryings(frag),
			`Varying mismatch between vertex and fragment in shader pair #${totalShaderPairs}`
		);
	}

	assert.equal(totalShaderPairs, 9, 'Expected all 9 AAA cosmic/planetary GLSL shader pairs');

	// Verify both high and medium quality tiers enable 3D vertex displacement while low disables it
	const { resolveQuality } = await import('../src/lib/world/quality.ts');
	assert.equal(resolveQuality(new URLSearchParams('q=high')).displacement, true);
	assert.equal(resolveQuality(new URLSearchParams('q=medium')).displacement, true);
	assert.equal(resolveQuality(new URLSearchParams('q=low')).displacement, false);

	// Verify 3D Timeline 2 Olympus -> Meru trajectory is spoiler-gated on unshieldedTimeline2
	assert.ok(
		planetEcologySrc.includes('!unshieldedTimeline2'),
		'PlanetEcology.svelte must gate dietThanTienArc on unshieldedTimeline2'
	);

	// Verify all dark cosmic HUD overlays override Light-Mode --color-text-primary so text is never black-on-black
	for (const hudRel of [
		'src/lib/world/ui/WorldHud.svelte',
		'src/lib/world/ui/RegionHud.svelte',
		'src/lib/world/ui/LocationHud.svelte',
		'src/lib/world/ui/JourneyHud.svelte'
	]) {
		const hudSrc = fs.readFileSync(path.resolve(hudRel), 'utf8');
		assert.ok(
			hudSrc.includes('--color-text-primary: #f1f5f9'),
			`${hudRel} must lock light foreground variables over dark HUD glass`
		);
	}
});

test('Chặng 1A Reviewer Regressions: Rule #36 Southern vocabulary, Canon coord snapping, localized HUD badges, drag-safe 360° orbit & low-profile telemetry pins', async () => {
	const cosmosSrc = fs.readFileSync(path.resolve('src/lib/world/cosmos.ts'), 'utf8');
	assert.ok(!cosmosSrc.includes('Quả cầu'), 'Rule #36: cosmos.ts must use Trái cầu instead of Quả cầu');
	assert.ok(!cosmosSrc.includes('vàng nhạt'), 'Rule #36: cosmos.ts must use vàng lợt instead of vàng nhạt');
	assert.ok(cosmosSrc.includes('Trái cầu plasma'), 'Expected Southern Vietnamese Trái cầu plasma');
	assert.ok(cosmosSrc.includes('tầng mây vàng lợt'), 'Expected Southern Vietnamese tầng mây vàng lợt');

	const {
		CELESTIAL_BODIES,
		alignNodeWithCanonCoordinates
	} = await import('../src/lib/world/cosmos.ts');

	// Verify Solar System outer orbits fit cleanly within Tier 0 overview
	assert.ok(
		CELESTIAL_BODIES.neptune.orbitSemiMajor <= 135,
		`Neptune orbitSemiMajor (${CELESTIAL_BODIES.neptune.orbitSemiMajor}) must stay compact enough for full 8-planet Solar System framing`
	);
	assert.ok(
		CELESTIAL_BODIES.saturn.orbitDistanceFactor >= 4.2,
		'Saturn orbitDistanceFactor must leave wide margin for Cassini rings'
	);
	assert.ok(
		CELESTIAL_BODIES.sun.orbitDistanceFactor >= 4.0,
		'Sun orbitDistanceFactor must leave full margin for 1.68R solar corona'
	);

	// Verify alignNodeWithCanonCoordinates snaps estimated DB coordinates onto exact Canon landmarks
	const snappedTabaoki = alignNodeWithCanonCoordinates({
		id: 42,
		slug: 'day-nui-tabaoki',
		name: 'Dãy núi Tabaoki',
		category: 'location',
		kind: 'region',
		region: null,
		lat: -12,
		lng: -98,
		alt: 0,
		estimated_coords: true,
		terrain: null,
		scene: 'orbit',
		state: 'revealed',
		v: 1
	});
	assert.equal(snappedTabaoki.lat, 47.5);
	assert.equal(snappedTabaoki.lng, 18.5);
	assert.equal(snappedTabaoki.estimated_coords, false);

	// Curated custom coordinates (`estimated_coords: false`) on non-canonical slugs remain untouched
	const customNode = alignNodeWithCanonCoordinates({
		id: 77,
		slug: 'custom-harbor',
		name: 'Bến Cảng Mới',
		category: 'location',
		kind: 'poi',
		region: null,
		lat: -15.5,
		lng: 42.2,
		alt: 0,
		estimated_coords: false,
		terrain: 'plains',
		scene: 'orbit',
		state: 'revealed',
		v: 1
	});
	assert.equal(customNode.lat, -15.5);
	assert.equal(customNode.lng, 42.2);

	// Verify WorldHud never leaks raw region slugs or raw kind/terrain enum strings
	const worldHudSrc = fs.readFileSync(path.resolve('src/lib/world/ui/WorldHud.svelte'), 'utf8');
	assert.ok(!worldHudSrc.includes('>{loc.region}<'), 'WorldHud must localize loc.region via regionLabel()');
	assert.ok(!worldHudSrc.includes('>{selected.kind}<'), 'WorldHud must localize selected.kind via kindLabel()');
	assert.ok(!worldHudSrc.includes('{selected.terrain}<'), 'WorldHud must localize selected.terrain via terrainLabel()');
	assert.ok(worldHudSrc.includes('regionLabel(loc.region)'));
	assert.ok(worldHudSrc.includes('kindLabel(selected.kind)'));
	assert.ok(worldHudSrc.includes('terrainLabel(selected.terrain)'));

	// Verify GlobeScene background click filters pointer drags and never calls unconditional flyHome() when selected is null
	const globeSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/GlobeScene.svelte'),
		'utf8'
	);
	assert.ok(
		globeSceneSrc.includes('Math.hypot(cx - bgDownX, cy - bgDownY)'),
		'GlobeScene background sphere must ignore OrbitControls drag releases'
	);
	assert.ok(
		!/onclick=\{\(\)\s*=>\s*\{\s*onselect\?\.\(null\);\s*flyHome\(\);/s.test(globeSceneSrc),
		'GlobeScene background sphere must not yank manual 360° orbits back with unconditional flyHome()'
	);

	// Verify Marker.svelte uses low-profile orbital telemetry reticles rather than oversized plastic cylinders
	const markerSrc = fs.readFileSync(path.resolve('src/lib/world/engine/Marker.svelte'), 'utf8');
	const needleMatch = markerSrc.match(/let\s+needleHeight\s*=\s*\$derived\(([^;]+)\)/);
	assert.ok(needleMatch, 'Marker.svelte must define compact needleHeight');
	const heights = [...needleMatch[1].matchAll(/[0-9]+\.[0-9]+/g)].map((m) => Number(m[0]));
	assert.ok(
		heights.length > 0 && heights.every((h) => h <= 0.35),
		`Marker needleHeight values (${heights.join(', ')}) must stay <= 0.35 to never poke out like plastic toothpicks`
	);
	assert.ok(markerSrc.includes('AdditiveBlending'), 'Marker.svelte should render crisp additive telemetry reticles');

	// Verify procedural planet generator computes macro_slope from smooth macro_elev2 rather than slope*360 cliff mud
	const genPySrc = fs.readFileSync(path.resolve('scripts/generate_aaa_planets.py'), 'utf8');
	assert.ok(
		!/hypot\([^)]+\)\s*\*\s*3[0-9]{2}/.test(genPySrc),
		'generate_aaa_planets.py must never multiply noisy elevation gradients by 360 (causes muddy grey continents)'
	);
	assert.ok(genPySrc.includes('macro_slope2'), 'generate_aaa_planets.py must separate macro_slope2 from micro-detail');
});

test('Chặng 1A Round 2: Canon sub-route resolvers, boundary edge cases, HUD-safe viewOffset framing, Atlas 2D label collision avoidance & shader artifact removal', async () => {
	const {
		CELESTIAL_BODIES,
		buildCanonCharacters,
		resolveCanonRegionDetail,
		resolveCanonLocationDetail,
		resolveCanonJourneyDetail
	} = await import('../src/lib/world/cosmos.ts');

	// Valid VI / EN Canon sub-routes + nullable locale edge cases
	const charsVi = buildCanonCharacters(undefined);
	const charsEn = buildCanonCharacters('en-US');
	assert.equal(charsVi.length, 2);
	assert.equal(charsEn.length, 2);
	assert.ok(charsVi.some((c) => c.id === -301 && c.name === 'Hokabe Pha'));
	assert.ok(charsEn.some((c) => c.id === -302 && c.description?.includes('hieroglyphs')));

	const tabaokiVi = resolveCanonRegionDetail('tabaoki-nilanda', null);
	assert.ok(tabaokiVi, 'tabaoki-nilanda Canon region detail must resolve');
	assert.equal(tabaokiVi.region.slug, 'tabaoki-nilanda');
	assert.ok(tabaokiVi.places.some((p) => p.slug === 'behadona-nilanda'));

	const behadonaEn = resolveCanonLocationDetail('behadona-nilanda', 'en');
	assert.ok(behadonaEn, 'behadona-nilanda Canon location detail must resolve');
	assert.equal(behadonaEn.region?.slug, 'tabaoki-nilanda');
	assert.ok(behadonaEn.place.name.includes('Behadona'));

	const earthPlace = resolveCanonLocationDetail('singularity-nam-bo-forest', 'vi');
	assert.ok(earthPlace, 'Earth singularity location detail must resolve');
	assert.equal(earthPlace.region, null);

	const phaJourney = resolveCanonJourneyDetail(-301, 'vi');
	assert.ok(phaJourney && phaJourney.stops.length >= 2, 'Hokabe Pha Canon journey must resolve');
	const tenkaJourney = resolveCanonJourneyDetail(-302, 'en');
	assert.ok(tenkaJourney && tenkaJourney.stops.length >= 2, 'Darkin Tenka Canon journey must resolve');

	// Boundary / unknown / empty edge cases must return null cleanly without throwing
	assert.equal(resolveCanonRegionDetail('', 'vi'), null);
	assert.equal(resolveCanonRegionDetail('non-existent-region', 'vi'), null);
	assert.equal(resolveCanonRegionDetail('behadona-nilanda', 'vi'), null); // landmark is not a region
	assert.equal(resolveCanonLocationDetail('', 'vi'), null);
	assert.equal(resolveCanonLocationDetail('tabaoki-nilanda', 'vi'), null); // region is not a place
	assert.equal(resolveCanonLocationDetail('unknown-place', 'en'), null);
	assert.equal(resolveCanonJourneyDetail(0, 'vi'), null);
	assert.equal(resolveCanonJourneyDetail(999999, 'vi'), null);
	assert.equal(resolveCanonJourneyDetail(Number.NaN, 'vi'), null);

	// Camera framing & HUD clearance checks
	assert.ok(CELESTIAL_BODIES.akunalia.orbitDistanceFactor >= 3.3);
	assert.ok(CELESTIAL_BODIES.earth.orbitDistanceFactor >= 3.3);
	assert.ok(CELESTIAL_BODIES.sun.orbitDistanceFactor >= 4.8);
	assert.ok(CELESTIAL_BODIES.saturn.orbitDistanceFactor >= 5.2);

	const globeSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/GlobeScene.svelte'),
		'utf8'
	);
	assert.ok(
		globeSceneSrc.includes('setViewOffset') && globeSceneSrc.includes('clearViewOffset'),
		'GlobeScene must frame [0,0,0] cleanly above the bottom HUD bar via PerspectiveCamera.setViewOffset'
	);

	// WorldAtlas2D collision-free label placement mathematical verification at 100% zoom
	const { computeAtlasLabelPlacements } = await import('../src/lib/world/world-utils.ts');
	const { buildAkunaliaCanonNodes, buildEarthSingularityNodes, TIMELINE_2_UNLOCK_CHAPTER } =
		await import('../src/lib/world/cosmos.ts');

	const assertZeroOverlap = (placements, contextName) => {
		const entries = [...placements.entries()];
		assert.ok(entries.length >= 4, `${contextName} should place primary labels`);
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				const a = entries[i][1].box;
				const b = entries[j][1].box;
				const ox = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
				const oy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
				assert.equal(
					ox * oy,
					0,
					`${contextName}: SVG label #${entries[i][0]} ("${entries[i][1].text}") overlaps #${entries[j][0]} ("${entries[j][1].text}")`
				);
			}
		}
	};

	const akAll = buildAkunaliaCanonNodes('vi', 1, 20, new Set());
	const akPlacements = computeAtlasLabelPlacements({
		regions: akAll.filter((n) => n.kind === 'region'),
		locations: akAll.filter((n) => n.kind !== 'region'),
		zoom: 1
	});
	assertZeroOverlap(akPlacements, 'Akunalia 100% zoom');
	assert.equal(
		akAll.filter((n) => n.kind === 'region').every((r) => akPlacements.has(r.id)),
		true,
		'Every Akunalia Canon region must receive a non-overlapping label at 100% zoom'
	);

	const earthAll = buildEarthSingularityNodes('vi', 2, TIMELINE_2_UNLOCK_CHAPTER, new Set());
	const earthPlacements = computeAtlasLabelPlacements({
		regions: [],
		locations: earthAll,
		zoom: 1
	});
	assertZeroOverlap(earthPlacements, 'Earth 100% zoom');

	// Dense co-located cluster edge case: zero passive overlaps even when 12 pins share nearly identical coordinates
	const denseLocs = Array.from({ length: 12 }, (_, idx) => ({
		id: 5000 + idx,
		slug: `dense-${idx}`,
		name: `Trạm Quan Trắc Vùng Lõi Số ${idx + 1}`,
		category: 'location',
		kind: 'poi',
		region: null,
		lat: 19.5 + (idx % 3) * 0.25,
		lng: 24.8 + Math.floor(idx / 3) * 0.25,
		alt: 0,
		estimated_coords: false,
		terrain: 'citadel',
		scene: 'orbit',
		state: 'revealed',
		v: 1
	}));
	const densePlacements = computeAtlasLabelPlacements({
		regions: [],
		locations: denseLocs,
		zoom: 1
	});
	assertZeroOverlap(densePlacements, 'Dense 12-pin cluster edge case');
	assert.deepEqual(
		computeAtlasLabelPlacements({ regions: [], locations: [], zoom: 1 }).size,
		0
	);

	const atlasSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/WorldAtlas2D.svelte'),
		'utf8'
	);
	assert.ok(
		atlasSrc.includes('computeAtlasLabelPlacements'),
		'WorldAtlas2D must wire computeAtlasLabelPlacements'
	);

	// Round 2 shader artifact checks (no radar bullseye sin(dCres * 92) and no sin(az * 28) aurora stripes)
	const shaderSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/planet-shaders.ts'),
		'utf8'
	);
	assert.ok(
		!shaderSrc.includes('dCres * 92'),
		'planet-shaders.ts must not superimpose concentric radar bullseye rings on Crescent Moon Sea'
	);
	const genPySrc = fs.readFileSync(path.resolve('scripts/generate_aaa_planets.py'), 'utf8');
	assert.ok(
		!genPySrc.includes('28.0 * az') && !genPySrc.includes('az * 28'),
		'generate_aaa_planets.py must not render periodic sin(28*az) striped polar auroras'
	);
});

test('Chặng 1B-1: Oren-Nayar zero-plastic planetary shaders, Daylight Observation, Prism Dispersion Moment & AAA disassemblable temple-of-zyberon', async () => {
	// 1. Planetary Zero-Plastic (Oren-Nayar, zero land specular, Cavity AO, fwidth multi-octave normals)
	const shaderSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/planet-shaders.ts'),
		'utf8'
	);
	assert.ok(
		shaderSrc.includes('float orenNayarDiffuse('),
		'planet-shaders.ts must implement microfacet Oren-Nayar diffuse on land'
	);
	assert.ok(
		shaderSrc.includes('float ggxWaterSpecular('),
		'planet-shaders.ts must implement physical GGX specular for liquid water'
	);
	assert.ok(
		!shaderSrc.includes('mix(0.28'),
		'planet-shaders.ts must not damp plains/forest normal amplitude down to 0.28'
	);
	assert.ok(
		shaderSrc.includes('if (isWater > 0.01)') && shaderSrc.includes('fwidth(vLocalUnit)'),
		'planet-shaders.ts must gate GGX specular strictly to isWater and filter multi-octave detail normals via fwidth'
	);
	assert.ok(
		shaderSrc.includes('bakedCavityAO') && shaderSrc.includes('horizonAO'),
		'planet-shaders.ts must combine baked Cavity AO and Horizon self-occlusion'
	);
	assert.ok(
		shaderSrc.includes('uniform float uDaylightMode;'),
		'planet-shaders.ts must wire uDaylightMode across planetary shaders'
	);

	const genPySrc = fs.readFileSync(path.resolve('scripts/generate_aaa_planets.py'), 'utf8');
	assert.ok(
		genPySrc.includes('def compute_cavity_ao('),
		'generate_aaa_planets.py must bake multi-scale topographic Cavity AO'
	);

	// 2. Daylight Observation & Prism Dispersion Moment HUD + Scene wiring
	const globeSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/GlobeScene.svelte'),
		'utf8'
	);
	assert.ok(
		globeSceneSrc.includes('daylightMode') && globeSceneSrc.includes('updateCameraObliqueSun'),
		'GlobeScene.svelte must support camera-locked ~32° oblique sun in Daylight Observation mode'
	);
	assert.ok(
		globeSceneSrc.includes('PrismDispersionMoment'),
		'GlobeScene.svelte must mount PrismDispersionMoment when prismMomentActive is enabled'
	);

	const prismSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/PrismDispersionMoment.svelte'),
		'utf8'
	);
	assert.ok(
		prismSrc.includes('NOOP_RAYCAST') &&
			prismSrc.includes('SPECTRAL_RAYS') &&
			['red-700', 'orange-600', 'gold-580', 'green-530', 'blue-470', 'indigo-430', 'violet-380'].every(
				(band) => prismSrc.includes(band)
			),
		'PrismDispersionMoment.svelte must disperse all 7 spectral wavelengths without intercepting planet clicks'
	);

	const worldHudSrc = fs.readFileSync(path.resolve('src/lib/world/ui/WorldHud.svelte'), 'utf8');
	assert.ok(
		worldHudSrc.includes('data-testid="toggle-daylight-mode"') &&
			worldHudSrc.includes('data-testid="toggle-prism-moment"'),
		'WorldHud.svelte must expose Daylight Observation and Prism Dispersion toggle controls'
	);

	// 3. Canon registration for temple-of-zyberon (zero legacy hardcoded parts; fresh parts come from Studio)
	const { resolveCanonLocationDetail, resolveCanonRegionDetail } = await import(
		'../src/lib/world/cosmos.ts'
	);

	const zyberonVi = resolveCanonLocationDetail('temple-of-zyberon', 'vi');
	const zyberonEn = resolveCanonLocationDetail('temple-of-zyberon', 'en');
	assert.ok(zyberonVi && zyberonEn, 'temple-of-zyberon must resolve in both VI and EN');
	assert.equal(zyberonVi.place.region, 'zyberon-basin');
	assert.equal(zyberonVi.place.model, undefined, 'Lightweight Web /world must not bundle static .glb models');
	assert.equal(zyberonVi.place.parts, undefined, 'Legacy hardcoded parts must be completely removed');
	assert.notEqual(zyberonVi.place.name, zyberonEn.place.name);

	const zyberonRegion = resolveCanonRegionDetail('zyberon-basin', 'vi');
	assert.ok(
		zyberonRegion?.places.some((p) => p.slug === 'temple-of-zyberon'),
		'zyberon-basin region must list temple-of-zyberon among its places'
	);

	// 4. Heavy 3D authoring, static .glb/draco bloat, & legacy procedural block builders cleanly stripped
	assert.ok(!fs.existsSync(path.resolve('static/world/models')), 'static/world/models must be removed');
	assert.ok(!fs.existsSync(path.resolve('static/world/textures')), 'static/world/textures must be removed');
	assert.ok(!fs.existsSync(path.resolve('static/world/hdri')), 'static/world/hdri must be removed');
	assert.ok(!fs.existsSync(path.resolve('static/draco')), 'static/draco WASM bloat must be removed');
	assert.ok(!fs.existsSync(path.resolve('src/lib/world/builders/kit.ts')), 'builders/kit.ts must be removed');
	assert.ok(!fs.existsSync(path.resolve('src/lib/world/builders/index.ts')), 'builders/index.ts must be removed');
	assert.ok(!fs.existsSync(path.resolve('src/lib/world/terrains.ts')), 'terrains.ts must be removed');
	assert.ok(!fs.existsSync(path.resolve('src/lib/world/engine/LocationCanvas.svelte')));
	assert.ok(!fs.existsSync(path.resolve('src/lib/world/engine/LocationScene.svelte')));
	assert.ok(!fs.existsSync(path.resolve('src/lib/world/engine/models.svelte.ts')));

	const showcasePageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/[region]/[slug]/+page.svelte'),
		'utf8'
	);
	const showcaseHudSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/LocationHud.svelte'),
		'utf8'
	);
	assert.ok(
		showcasePageSrc.includes('intro_video_url') &&
			showcasePageSrc.includes('preview_gallery') &&
			showcaseHudSrc.includes('desktop_pack_url') &&
			showcaseHudSrc.includes('vn_episode_url'),
		'L3 location showcase page + HUD must render Intro Video, Preview Gallery, Desktop 3D Pack, and VN Episode gateway links'
	);
});

test('Chặng 1B-1 Reviewer Regressions: Coaxial zero-collision strata, live DB Canon part merging, sea-ice specular exclusion, Non-Color normal bake & monotonic prism subsidence', async () => {
	const {
		resolveCanonLocationDetail,
		alignNodeWithCanonCoordinates,
		mergeRegionDetailWithCanon
	} = await import('../src/lib/world/cosmos.ts');

	// 1. Default Canon node carries zero legacy hardcoded parts
	const zyberon = resolveCanonLocationDetail('temple-of-zyberon', 'vi');
	assert.equal(zyberon?.place.parts, undefined, 'Canon nodes must carry zero hardcoded legacy parts');

	// 2. Live DB node with Vietnamese name + curated coords (`estimated_coords: false`) + Studio-synced `parts`
	// must keep curated lat/lng and pass through Studio `parts` untouched
	const alignedLiveTemple = alignNodeWithCanonCoordinates(
		{
			id: 512,
			slug: 'dai-den-zyberon',
			name: 'Đại Đền Ngũ Giác Zyberon',
			category: 'location',
			kind: 'location',
			region: 'zyberon-basin',
			lat: -7.12,
			lng: 29.44,
			alt: 0,
			estimated_coords: false,
			terrain: 'citadel',
			scene: 'showcase',
			model: null,
			parts: [
				{
					id: 'studio_clockwork_core',
					dir: [0, 0, 0],
					label: 'Khối Đá Đen Tùy Chỉnh',
					lore: 'Mô tả tùy chỉnh từ Studio mới.'
				}
			],
			state: 'revealed',
			v: 3
		},
		'vi'
	);
	assert.equal(alignedLiveTemple.lat, -7.12, 'Curated DB latitude must be preserved');
	assert.equal(alignedLiveTemple.lng, 29.44, 'Curated DB longitude must be preserved');
	assert.equal(alignedLiveTemple.model, null, 'Default lightweight Canon node has no static .glb');
	assert.equal(alignedLiveTemple.parts?.length, 1, 'Only Studio-synced DB parts should be present');
	assert.equal(alignedLiveTemple.parts?.[0]?.label, 'Khối Đá Đen Tùy Chỉnh');

	// 3. mergeRegionDetailWithCanon injects missing Canon landmarks (`temple-of-zyberon`) into live 200 OK region payload
	const mergedRegion = mergeRegionDetailWithCanon(
		{
			region: {
				id: 19,
				slug: 'zyberon-basin',
				name: 'Bồn Địa Hoàng Triều Zyberon',
				category: 'location',
				kind: 'region',
				region: null,
				lat: -8.0,
				lng: 28.0,
				alt: 0,
				terrain: 'citadel',
				scene: 'region',
				state: 'revealed',
				v: 1
			},
			places: [
				{
					id: 88,
					slug: 'custom-market-gate',
					name: 'Cổng Chợ Đông Kinh',
					category: 'location',
					kind: 'poi',
					region: 'zyberon-basin',
					lat: -8.4,
					lng: 28.6,
					alt: 0,
					terrain: 'citadel',
					scene: 'showcase',
					state: 'revealed',
					v: 1
				}
			]
		},
		'zyberon-basin',
		'vi'
	);
	assert.ok(
		mergedRegion.places.some((p) => p.slug === 'custom-market-gate'),
		'Existing live DB region places must be preserved'
	);
	assert.ok(
		mergedRegion.places.some((p) => p.slug === 'temple-of-zyberon' && p.parts === undefined),
		'mergeRegionDetailWithCanon must inject temple-of-zyberon without legacy hardcoded parts'
	);

	// 4. Polar sea-ice specular exclusion + opposite-azimuth Daylight sky-dome fill
	const genPySrc = fs.readFileSync(path.resolve('scripts/generate_aaa_planets.py'), 'utf8');
	assert.ok(
		!genPySrc.includes('(~land_mask) | (spec_mask'),
		'generate_aaa_planets.py must not overwrite spec_mask=0 on frozen polar sea ice via (~land_mask)'
	);
	const shaderSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/planet-shaders.ts'),
		'utf8'
	);
	assert.ok(
		shaderSrc.includes('smoothstep(0.66, 0.80, blueChan)') && shaderSrc.includes('L_fill'),
		'planet-shaders.ts must keep coastline bilinear interpolation dry (<0.66) and fill opposite-azimuth Daylight limb via L_fill'
	);

	// 5. PrismDispersionMoment monotonic subsidence
	const prismSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/PrismDispersionMoment.svelte'),
		'utf8'
	);
	assert.ok(
		!prismSrc.includes('% CYCLE_DURATION') &&
			prismSrc.includes('float subside =') &&
			prismSrc.includes('meteorHeadsData'),
		'PrismDispersionMoment.svelte must progress monotonically and subside cleanly without infinite modulo looping'
	);
});

test('Chặng 1B-1 Round 2 Reviewer Regressions: ?body= query param, continuous prism exit stream, linearAlbedo Minnaert limb darkening & LocationHud showcase gateway', async () => {
	const worldPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/+page.svelte'),
		'utf8'
	);
	assert.ok(
		worldPageSrc.includes("params.get('planet') ?? params.get('body')"),
		'world/+page.svelte must accept both ?planet= and ?body= query parameters'
	);

	const locPageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/[region]/[slug]/+page.svelte'),
		'utf8'
	);
	assert.ok(
		locPageSrc.includes('activeMediaTab') && locPageSrc.includes('extractYoutubeEmbed'),
		'L3 location showcase page must support switching between gallery and Intro Video modes'
	);

	const prismSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/PrismDispersionMoment.svelte'),
		'utf8'
	);
	assert.ok(
		prismSrc.includes('refractedStream') && !prismSrc.includes('distBehind > 0.42) discard'),
		'PrismDispersionMoment.svelte must sustain a continuous refracted stream out of PRISM_ORIGIN while the incident beam feeds the crystal'
	);

	const shadersSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/planet-shaders.ts'),
		'utf8'
	);
	assert.ok(
		shadersSrc.includes('linearAlbedo = pow(albedoClamped, vec3(2.2))') &&
			shadersSrc.includes('linearRingCol') &&
			shadersSrc.includes('limbDarkening'),
		'planet-shaders.ts must linearize procedural SolarBody/ring sRGB palettes and apply Minnaert limb darkening so Daylight Observation never blows out white'
	);

	const locHudSrc = fs.readFileSync(
		path.resolve('src/lib/world/ui/LocationHud.svelte'),
		'utf8'
	);
	assert.ok(
		locHudSrc.includes('chapterSuffix(c)') &&
			locHudSrc.includes('mobile-info-toggle') &&
			locHudSrc.includes('overview-panel') &&
			locHudSrc.includes('gateway-bar'),
		'LocationHud.svelte must deduplicate generic chapter labels, collapse mobile overview card, and render gateway-bar CTAs'
	);
});

test('Chặng 1B-1 Desktop Tauri HiDPI Crispness: Hardware tier classification & DPR-synced EffectComposer across lightweight canvases', async () => {
	const { classifyHardwareTier } = await import('../src/lib/world/quality.ts');

	// 1. Desktop hardware tier classification when navigator.deviceMemory is undefined (Firefox/Safari/WebKit)
	assert.equal(
		classifyHardwareTier({ memory: undefined, cores: 8, coarsePointer: false }),
		'high',
		'Desktop browsers without Blink navigator.deviceMemory must still qualify for high tier (2x DPR + shadows)'
	);
	assert.equal(classifyHardwareTier({ memory: 2, cores: 8, coarsePointer: false }), 'low');
	assert.equal(
		classifyHardwareTier({ memory: 8, cores: 8, coarsePointer: false, saveData: true }),
		'low'
	);
	assert.equal(classifyHardwareTier({ memory: 8, cores: 8, coarsePointer: true }), 'medium');

	// 6. Verify lightweight *Canvas.svelte wrappers & GlobeScene.svelte DPR-synced EffectComposer
	for (const canvasRel of [
		'src/lib/world/engine/WorldCanvas.svelte',
		'src/lib/world/engine/JourneyCanvas.svelte'
	]) {
		const src = fs.readFileSync(path.resolve(canvasRel), 'utf8');
		assert.ok(
			src.includes('dpr={[1, quality.pixelRatio]}') && !src.includes('window.devicePixelRatio'),
			`${canvasRel} must pass reactive [1, quality.pixelRatio] tuple to Threlte Canvas rather than freezing window.devicePixelRatio on mount`
		);
	}

	const qualitySrc = fs.readFileSync(path.resolve('src/lib/world/quality.ts'), 'utf8');
	assert.ok(
		qualitySrc.includes('cachedHasWebGL') &&
			qualitySrc.includes("powerPreference: 'high-performance'"),
		'quality.ts must cache hasWebGL() per session and probe with matching high-performance powerPreference'
	);

	const globeSceneSrc = fs.readFileSync(
		path.resolve('src/lib/world/engine/GlobeScene.svelte'),
		'utf8'
	);
	assert.ok(
		globeSceneSrc.includes('const pixelRatio = $dpr;') &&
			globeSceneSrc.includes('syncWindowDpr') &&
			globeSceneSrc.includes('composer.setPixelRatio(pixelRatio)') &&
			!globeSceneSrc.includes('bloomPassRef.resolution.set(w, h)'),
		'GlobeScene.svelte must sync EffectComposer pixelRatio reactively via $dpr + window resize without clobbering DPR bloom resolution'
	);
});

test('Nhịp 1B-2A: All 5 Akunalia regions feature AAA Draco .glb monuments with coaxial zero-collision strata, masked HDR emissiveTextures, live DB merging & Rule #36/#34 compliance', async () => {
	const {
		AKUNALIA_CANON_NODES,
		buildAkunaliaCanonNodes,
		resolveCanonRegionDetail,
		resolveCanonLocationDetail,
		alignNodeWithCanonCoordinates,
		mergeRegionDetailWithCanon
	} = await import('../src/lib/world/cosmos.ts');
	const { computeAtlasLabelPlacements } = await import('../src/lib/world/world-utils.ts');

	// 1. Preserve indices [0..7] for backward compatibility while appending -209 & -210 at [8..9]
	assert.equal(AKUNALIA_CANON_NODES.length, 10);
	assert.equal(AKUNALIA_CANON_NODES[1].slug, 'behadona-nilanda');
	assert.equal(AKUNALIA_CANON_NODES[5].slug, 'eldarin-sanctuary-village');
	assert.equal(AKUNALIA_CANON_NODES[7].slug, 'temple-of-zyberon');
	assert.equal(AKUNALIA_CANON_NODES[8].slug, 'crescent-ward-altar');
	assert.equal(AKUNALIA_CANON_NODES[9].slug, 'sky-sanctum-spire');

	const expectedMonuments = [
		{ slug: 'crescent-ward-altar', region: 'crescent-sea' },
		{ slug: 'behadona-nilanda', region: 'tabaoki-nilanda' },
		{ slug: 'eldarin-sanctuary-village', region: 'eldarin-highlands' },
		{ slug: 'sky-sanctum-spire', region: 'sky-archipelago' }
	];

	// 2. Verify canonical landmarks resolve cleanly in VI & EN with zero hardcoded legacy parts
	for (const spec of expectedMonuments) {
		const detVi = resolveCanonLocationDetail(spec.slug, 'vi');
		const detEn = resolveCanonLocationDetail(spec.slug, 'en');
		assert.ok(detVi && detEn, `${spec.slug} must resolve in both VI and EN`);
		assert.equal(detVi.place.region, spec.region);
		assert.equal(detVi.region?.slug, spec.region);
		assert.equal(detVi.place.model, undefined, `${spec.slug} lightweight web node must not carry static .glb`);
		assert.equal(detVi.place.parts, undefined, `${spec.slug} must carry zero hardcoded legacy parts`);
		assert.notEqual(detVi.place.name, detEn.place.name);
	}

	// 3. Verify 100% 5-region coverage on Akunalia (Canon + English slugs + Vietnamese Co-Writer DB region slugs)
	for (const [regionSlug, viDbSlug, viDbName] of [
		['tabaoki-nilanda', 'son-mach-tabaoki-nilanda', 'Sơn Mạch Tabaoki & Đồng Bằng Nilanda'],
		['zyberon-basin', 'bon-dia-zyberon', 'Kinh Đô & Bồn Địa Zyberon'],
		['crescent-sea', 'noi-hai-ho-ban-nguyet', 'Nội Hải Hồ Bán Nguyệt'],
		['eldarin-highlands', 'cao-nguyen-eldarin', 'Cao Nguyên Eldarin'],
		['sky-archipelago', 'quan-dao-thien-khong', 'Quần Đảo Thiên Không']
	]) {
		const canonReg = resolveCanonRegionDetail(regionSlug, 'vi');
		assert.ok(canonReg, `Canon region ${regionSlug} must resolve`);
		assert.ok(canonReg.places.length >= 1, `Canon region ${regionSlug} must expose its canonical landmark`);

		for (const [liveSlug, liveName] of [
			[regionSlug, canonReg.region.name],
			[viDbSlug, viDbName]
		]) {
			const mergedLive = mergeRegionDetailWithCanon(
				{
					region: {
						id: 900,
						slug: liveSlug,
						name: liveName,
						category: 'location',
						kind: 'region',
						region: null,
						lat: 0,
						lng: 0,
						alt: 0,
						terrain: 'plains',
						scene: 'region',
						state: 'revealed',
						v: 1
					},
					places: []
				},
				liveSlug,
				'vi'
			);
			assert.equal(
				mergedLive.region.model,
				undefined,
				`Parent region ${liveSlug} must never accidentally inherit a landmark model`
			);
			assert.ok(
				mergedLive.places.length >= 1,
				`mergeRegionDetailWithCanon(${liveSlug}) must inject its Canon landmark when missing from DB`
			);
			assert.equal(
				mergedLive.places[0].region,
				liveSlug,
				`Injected monument in ${liveSlug} must bind region="${liveSlug}"`
			);
			assert.equal(mergedLive.places[0].parts, undefined);
		}
	}

	// 4. Verify live DB Vietnamese names snap without clobbering curated coords or injecting legacy parts
	for (const [slug, name] of [
		['ben-do-behadona', 'Bến Đò Sương Mù Behadona'],
		['dai-phong-an-ban-nguyet', 'Đài Phong Ấn Hồ Bán Nguyệt'],
		['thanh-thon-eldarin', 'Thánh Thôn Chân Đèo Eldarin'],
		['dao-bay-thien-khong', 'Đảo Bay Tinh Thể & Tháp Phong Lôi']
	]) {
		const aligned = alignNodeWithCanonCoordinates(
			{
				id: 700,
				slug,
				name,
				category: 'location',
				kind: 'landmark',
				region: null,
				lat: 12.34,
				lng: 56.78,
				alt: 0,
				estimated_coords: false,
				terrain: 'sanctuary',
				scene: 'showcase',
				model: null,
				state: 'revealed',
				v: 1
			},
			'vi'
		);
		assert.equal(aligned.lat, 12.34, `${slug} curated DB lat must be preserved`);
		assert.equal(aligned.lng, 56.78, `${slug} curated DB lng must be preserved`);
		assert.equal(aligned.model, null);
		assert.equal(aligned.parts, undefined);
	}

	// 4b. Negative guard: Custom non-monument DB landmarks sharing regional words must NOT hijack monument .glb models
	for (const [slug, name] of [
		['canh-dong-lua-nilanda', 'Cánh Đồng Lúa Nilanda'],
		['thuong-nguon-song-behadona', 'Thượng Nguồn Sông Behadona'],
		['dao-bay-may-trang', 'Đảo Bay Mây Trắng Phương Đông'],
		['dai-den-mat-troi-saqqara', 'Đại Đền Mặt Trời Saqqara']
	]) {
		const aligned = alignNodeWithCanonCoordinates(
			{
				id: 710,
				slug,
				name,
				category: 'location',
				kind: 'landmark',
				region: null,
				lat: 21.5,
				lng: 44.2,
				alt: 0,
				estimated_coords: false,
				terrain: 'plains',
				scene: 'diorama',
				model: null,
				state: 'revealed',
				v: 1
			},
			'vi'
		);
		assert.ok(
			!aligned.model,
			`Custom non-monument landmark "${slug}" (${name}) must NOT falsely inherit model="${aligned.model}"`
		);
		assert.equal(
			aligned.parts,
			undefined,
			`Custom non-monument landmark "${slug}" must NOT falsely inherit monument parts`
		);
	}

	// 5. Rule #36 Southern Vietnamese vocabulary & Rule #34 Subtext sweep across all Akunalia Canon text
	const allViTexts = AKUNALIA_CANON_NODES.flatMap((n) => [
		n.name.vi,
		n.rumoredName.vi,
		n.description.vi,
		...(n.parts ?? []).flatMap((p) => [p.label.vi, p.lore.vi])
	]).join('\n');
	assert.ok(
		!/\b(nhạt|quả cầu|quả chuông|quả tim|cái bát|cái thìa|cái đĩa|cái cốc|cái ô|lúc nãy)\b/iu.test(
			allViTexts
		),
		'Rule #36 violation: Northern vocabulary detected in AKUNALIA_CANON_NODES Vietnamese text'
	);
	assert.ok(
		!/\brơi xuống\b/iu.test(allViTexts),
		'Rule #36 violation: Use Southern "rớt xuống" instead of "rơi xuống"'
	);
	assert.ok(
		!/\b(charon|styx|lethe|steins\s*;\s*gate|nietzsche|dostoevsky|zhuangzi|kant|rawls)\b/i.test(
			allViTexts
		),
		'Rule #34 violation: External mythological/philosophical name detected in Akunalia Canon text'
	);

	// 6. Verify zero 2D Atlas label collisions in both VI and EN with all 10 Akunalia Canon nodes
	for (const lang of ['vi', 'en']) {
		const nodes = buildAkunaliaCanonNodes(lang, 1, 20, new Set());
		const placements = computeAtlasLabelPlacements({
			regions: nodes.filter((n) => n.kind === 'region'),
			locations: nodes.filter((n) => n.kind !== 'region'),
			zoom: 1
		});
		const entries = [...placements.entries()];
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				const a = entries[i][1].box;
				const b = entries[j][1].box;
				const ox = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
				const oy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
				assert.equal(ox * oy, 0, `2D Atlas (${lang}) label overlap between ${entries[i][1].text} and ${entries[j][1].text}`);
			}
		}
	}

	// 7. Verify WebView2 origin-guilt-safe WebGL2 lifecycle across the 3 lightweight canvases
	const qualitySrc = fs.readFileSync(path.resolve('src/lib/world/quality.ts'), 'utf8');
	assert.ok(
		qualitySrc.includes('export function preferredPowerPreference') &&
			qualitySrc.includes('sessionStorage') &&
			!/\.loseContext\s*\(/.test(qualitySrc),
		'quality.ts must cache preferredPowerPreference in sessionStorage and never invoke synthetic loseContext()'
	);
	for (const canvasRel of [
		'src/lib/world/engine/WorldCanvas.svelte',
		'src/lib/world/engine/JourneyCanvas.svelte'
	]) {
		const cSrc = fs.readFileSync(path.resolve(canvasRel), 'utf8');
		assert.ok(
			cSrc.includes('preferredPowerPreference()') && !cSrc.includes('forceContextLoss()'),
			`${canvasRel} must use preferredPowerPreference() and avoid synthetic forceContextLoss() so Blink never blocks the origin`
		);
	}
});

test('Nhịp 1B-2B & 1B-2C + Open Sync Gateway: all 8/8 Earth Singularities (13/13 Universe landmarks) preserve coaxial strata lore, Rule #36/#34/#9/#10 compliance, and Admin Gateway wiring', async () => {
	const {
		AKUNALIA_CANON_NODES,
		EARTH_SINGULARITIES,
		buildEarthSingularityNodes,
		resolveCanonLocationDetail,
		alignNodeWithCanonCoordinates
	} = await import('../src/lib/world/cosmos.ts');
	const { computeAtlasLabelPlacements, resolveWorldNodeTargetUrl } = await import(
		'../src/lib/world/world-utils.ts'
	);

	// Universe-wide 13/13 landmarks check (5 Akunalia + 8 Earth), zero static .glb & zero legacy hardcoded parts
	const akunaliaLandmarks = AKUNALIA_CANON_NODES.filter((n) => n.kind === 'landmark');
	assert.equal(akunaliaLandmarks.length, 5, 'Akunalia must have all 5/5 canonical landmarks');
	assert.equal(EARTH_SINGULARITIES.length, 8, 'Earth must have all 8/8 canonical singularity landmarks');
	assert.ok(
		[...AKUNALIA_CANON_NODES, ...EARTH_SINGULARITIES].every((n) => !('model' in n) && !('parts' in n)),
		'Lightweight Web /world Canon nodes must carry zero hardcoded models or legacy parts'
	);

	const expectedEarthMonuments = [
		{ slug: 'singularity-nam-bo-forest', unlockChapter: 1 },
		{ slug: 'singularity-eryndor-saqqara', unlockChapter: 2 },
		{ slug: 'singularity-kyoto-shrine', unlockChapter: 4 },
		{ slug: 'singularity-ganges-meru', unlockChapter: 5 },
		{ slug: 'singularity-samos-olympus', unlockChapter: 8 },
		{ slug: 'singularity-dun-scaith', unlockChapter: 8 },
		{ slug: 'singularity-stonehenge-avalon', unlockChapter: 9 },
		{ slug: 'singularity-grey-ash-buffer', unlockChapter: 10 }
	];

	for (const spec of expectedEarthMonuments) {
		const canonDef = EARTH_SINGULARITIES.find((d) => d.slug === spec.slug);
		assert.ok(canonDef, `Missing ${spec.slug} in EARTH_SINGULARITIES`);
		assert.equal(canonDef.unlockChapter, spec.unlockChapter);

		// 1. Direct Canon detail resolution (/world/_/<slug>) unlocks full VI/EN name & description without leaking timeline2Note
		const detVi = resolveCanonLocationDetail(spec.slug, 'vi');
		const detEn = resolveCanonLocationDetail(spec.slug, 'en');
		assert.ok(detVi && detEn, `${spec.slug} must resolve via resolveCanonLocationDetail in VI & EN`);
		assert.equal(detVi.place.state, 'revealed', `${spec.slug} detail must materialize as revealed`);
		assert.equal(detVi.place.region, null, `${spec.slug} is a regionless Earth singularity`);
		assert.equal(detVi.region, null);
		assert.equal(resolveWorldNodeTargetUrl(detVi.place), `/world/_/${spec.slug}`);
		assert.equal(detVi.place.name, canonDef.name.vi);
		assert.equal(detEn.place.name, canonDef.name.en);
		assert.equal(detVi.place.parts, undefined, `${spec.slug} must carry zero legacy hardcoded parts`);
		assert.ok(
			detVi.place.description &&
				detVi.place.description.length > 40 &&
				!detVi.place.description.includes('⚡'),
			`${spec.slug} detail description must be populated without leaking shielded Timeline 2 notes`
		);
	}

	const { CELESTIAL_BODIES } = await import('../src/lib/world/cosmos.ts');
	assert.ok(
		CELESTIAL_BODIES.earth.badge.vi.includes('8 Dị Điểm') &&
			CELESTIAL_BODIES.earth.badge.en.includes('8 Singularities'),
		'CELESTIAL_BODIES.earth.badge must report 8 Singularities matching EARTH_SINGULARITIES.length === 8'
	);
	const desktopBuildSrc = fs.readFileSync(path.resolve('scripts/desktop-build.cjs'), 'utf8');
	assert.ok(
		desktopBuildSrc.includes('path.join(worldSubdir, "index.html")'),
		'desktop-build.cjs must mirror SPA index.html into build/world/index.html for Tauri /world reload resilience'
	);
	const placePageSrc = fs.readFileSync(
		path.resolve('src/routes/(app)/world/[region]/[slug]/+page.svelte'),
		'utf8'
	);
	assert.ok(
		placePageSrc.includes('loadedSearch') && placePageSrc.includes('page.url.search'),
		'L3 place page must reactively re-apply ?part query params on same-slug navigation'
	);

	// 4. Spoiler-safe Fog-of-War on user builds vs IS_ADMIN_FLAVOR unlock on Admin builds + ?body=earth Back-to-Globe link
	const userRead1 = buildEarthSingularityNodes('vi', 1, 1, new Set());
	assert.equal(userRead1.find((n) => n.slug === 'singularity-nam-bo-forest')?.state, 'revealed');
	assert.equal(userRead1.find((n) => n.slug === 'singularity-eryndor-saqqara')?.state, 'rumored');
	assert.equal(userRead1.find((n) => n.slug === 'singularity-kyoto-shrine')?.state, 'rumored');
	assert.equal(userRead1.find((n) => n.slug === 'singularity-ganges-meru')?.state, 'rumored');
	for (const unreadSlug of [
		'singularity-samos-olympus',
		'singularity-dun-scaith',
		'singularity-stonehenge-avalon',
		'singularity-grey-ash-buffer'
	]) {
		const unreadNode = userRead1.find((n) => n.slug === unreadSlug);
		assert.equal(unreadNode?.state, 'rumored');
		assert.equal(unreadNode?.description, null);
	}

	const adminUnlocked = buildEarthSingularityNodes('vi', 1, 999, new Set());
	for (const spec of expectedEarthMonuments) {
		const n = adminUnlocked.find((x) => x.slug === spec.slug);
		assert.equal(n?.state, 'revealed', `Admin read=999 must reveal ${spec.slug}`);
		assert.equal(n?.model, undefined);
		assert.equal(n?.parts, undefined);
	}

	const worldPageSrc = fs.readFileSync(path.resolve('src/routes/(app)/world/+page.svelte'), 'utf8');
	assert.ok(
		worldPageSrc.includes('IS_ADMIN_FLAVOR') &&
			worldPageSrc.includes('if (IS_ADMIN_FLAVOR && isAdmin()) return 999;'),
		'world/+page.svelte must unlock all singularities for authenticated Selorson Admin via IS_ADMIN_FLAVOR && isAdmin() while keeping user Fog-of-War'
	);
	const locHudSrc = fs.readFileSync(path.resolve('src/lib/world/ui/LocationHud.svelte'), 'utf8');
	assert.ok(
		locHudSrc.includes("resolveNodePlanet(place) === 'earth'") &&
			locHudSrc.includes('/world?body=earth&focus='),
		'LocationHud.svelte must route Back-to-Globe on Earth singularities to /world?body=earth&focus=<slug>'
	);

	// 5. Live Co-Writer DB Vietnamese names align cleanly without injecting legacy parts, while preserving Studio-synced parts
	for (const [slug, name] of [
		['rung-dau-rai-nam-bo', 'Rừng Dầu Rái Nam Bộ'],
		['tinh-that-eryndor', 'Tĩnh Thất Đá Đen Eryndor'],
		['tinh-am-kiem-dao-kyoto', 'Tịnh Am Kiếm Đạo Kyoto'],
		['xuong-ren-thep-wootz', 'Xưởng Rèn Thép Wootz Ven Sông'],
		['dai-da-cot-co-dinh-olympus', 'Đài Đá Cột Cổ Đỉnh Mây Olympus'],
		['dun-scaith', 'Dún Scáith'],
		['vong-dan-da-co-rung-soi', 'Vòng Đàn Đá Cổ Rừng Sồi'],
		['thanh-luy-cong-huong-am', 'Thành Lũy Cộng Hưởng Âm Tầng Đệm Tro Xám']
	]) {
		const aligned = alignNodeWithCanonCoordinates(
			{
				id: 810,
				slug,
				name,
				category: 'location',
				kind: 'landmark',
				region: null,
				lat: 15.0,
				lng: 80.0,
				alt: 0,
				estimated_coords: false,
				terrain: 'ruins',
				scene: 'showcase',
				model: null,
				state: 'revealed',
				v: 1
			},
			'vi'
		);
		assert.equal(aligned.model, null);
		assert.equal(aligned.parts, undefined, `${slug} must start clean with zero legacy parts`);
	}

	const studioSyncedKyoto = alignNodeWithCanonCoordinates(
		{
			id: 831,
			slug: 'tinh-am-kiem-dao-kyoto',
			name: 'Tịnh Am Kiếm Đạo Kyoto',
			category: 'location',
			kind: 'landmark',
			region: null,
			lat: 35.0,
			lng: 135.7,
			alt: 0,
			estimated_coords: false,
			terrain: 'shrine',
			scene: 'showcase',
			parts: [
				{
					id: 'custom_studio_extra_roof',
					dir: [0, 11.5, 0],
					label: 'Mái Studio Tùy Biến'
				}
			],
			state: 'revealed',
			v: 1
		},
		'vi'
	);
	assert.ok(
		studioSyncedKyoto.parts?.some((p) => p.id === 'custom_studio_extra_roof'),
		'Studio-synced parts in DB must pass through untouched'
	);

	// 6. Zero 2D Atlas label overlaps on Earth across all 8 singularities in both VI and EN
	for (const lang of ['vi', 'en']) {
		const earthNodes = buildEarthSingularityNodes(lang, 1, 999, new Set());
		const placements = computeAtlasLabelPlacements({
			regions: [],
			locations: earthNodes,
			zoom: 1
		});
		const entries = [...placements.entries()];
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				const a = entries[i][1].box;
				const b = entries[j][1].box;
				const ox = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
				const oy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
				assert.equal(
					ox * oy,
					0,
					`Earth 2D Atlas (${lang}) label overlap between ${entries[i][1].text} and ${entries[j][1].text}`
				);
			}
		}
	}

	// 7. Rule #36 Southern Vietnamese dialect, Rule #34 Subtext Only, and Rule #9 Copyright-Clean sweep on EARTH_SINGULARITIES
	const earthViTexts = EARTH_SINGULARITIES.flatMap((n) => [
		n.name.vi,
		n.rumoredName.vi,
		n.description.vi,
		n.timeline2Note?.vi ?? '',
		...(n.parts ?? []).flatMap((p) => [p.label.vi, p.lore.vi])
	]).join('\n');
	const earthAllTexts = EARTH_SINGULARITIES.flatMap((n) => [
		n.name.vi,
		n.name.en,
		n.description.vi,
		n.description.en,
		...(n.parts ?? []).flatMap((p) => [p.label.vi, p.label.en, p.lore.vi, p.lore.en])
	]).join('\n');

	assert.ok(
		!/\b(nhạt|quả cầu|quả chuông|quả tim|quả trứng|cái bát|cái thìa|cái đĩa|cái cốc|chậu rửa|cái ô|lúc nãy|rơi xuống)\b/iu.test(
			earthViTexts
		),
		'Rule #36 violation: Northern vocabulary detected in EARTH_SINGULARITIES Vietnamese text'
	);
	assert.ok(
		!/\b(steins\s*;\s*gate|chaldeas|charon|styx|lethe|nietzsche|dostoevsky|zhuangzi|trang tử|khổng tử|kant|rawls|evagrius)\b/iu.test(
			earthAllTexts
		),
		'Rule #34 violation: External philosophical/media reference detected in EARTH_SINGULARITIES text'
	);
	assert.ok(
		!/\b(kiyomizu|fushimi\s*inari|kinkaku|ginkaku|djoser|imhotep|khufu|giza|brihadeeswarar|angkor\s*wat|parthenon|heraion|dunscaith|english\s*heritage)\b/iu.test(
			earthAllTexts
		),
		'Rule #9 violation: Real-world specific copyrighted/protected monument name detected in EARTH_SINGULARITIES'
	);

	// 7b. Rule #10: Zero character/plot spoiler part IDs and 100% Concept Albedo Projection across the 7 re-forged monuments
	const allPartIds = [
		...AKUNALIA_CANON_NODES.flatMap((n) => (n.parts ?? []).map((p) => p.id)),
		...EARTH_SINGULARITIES.flatMap((n) => (n.parts ?? []).map((p) => p.id))
	];
	for (const bannedId of [
		'mind_spring_stylobate_and_lyre',
		'cross_era_silver_bow_dais_380nm',
		'ancient_olympus_source_tree',
		'scathach_soul_seal_undercroft',
		'gae_bulg_storm_spear_altar_430nm',
		'arya_spatial_portal_dais_470nm',
		'memory_palace_quantum_crystal_spire'
	]) {
		assert.ok(
			!allPartIds.includes(bannedId),
			`Rule #10 violation: Legacy spoiler part ID '${bannedId}' must be replaced`
		);
	}
	// 7c. Open Sync Gateway API client + BetaToAlphaPromoteModal video count wiring
	const worldApiSrc = fs.readFileSync(path.resolve('src/lib/world/api.ts'), 'utf8');
	const promoteModalSrc = fs.readFileSync(
		path.resolve('src/lib/components/desktop/BetaToAlphaPromoteModal.svelte'),
		'utf8'
	);
	assert.ok(
		worldApiSrc.includes('export async function fetchWorldPacks') &&
			worldApiSrc.includes('/world/packs'),
		'world/api.ts must expose fetchWorldPacks() for the Desktop 3D / VN client'
	);
	assert.ok(
		promoteModalSrc.includes('beta_videos'),
		'BetaToAlphaPromoteModal.svelte must display video/intro count in showcase promotion'
	);

	// 8. Verify acquireSafeWebGLContext handles ANGLE BindToCurrentSequence high-performance rejection, MSAA fallback, and total absence cleanly
	const { acquireSafeWebGLContext } = await import('../src/lib/world/quality.ts');
	const fakeCtx = { glVersion: 'webgl2-mock' };
	const calls = [];
	const mockCanvasRejectHp = {
		getContext(type, attrs) {
			calls.push({ type, powerPreference: attrs?.powerPreference, antialias: attrs?.antialias });
			if (type === 'webgl') {
				throw new Error('Must never request WebGL1 context for Three.js r163+');
			}
			if (attrs?.powerPreference === 'high-performance') return null;
			if (type === 'webgl2' && attrs?.powerPreference === 'default' && attrs?.antialias === true) {
				return fakeCtx;
			}
			return null;
		}
	};
	const fallbackRes = acquireSafeWebGLContext(mockCanvasRejectHp, {
		powerPreference: 'high-performance',
		antialias: true,
		alpha: false
	});
	assert.equal(fallbackRes.context, fakeCtx);
	assert.equal(fallbackRes.antialias, true);
	assert.ok(
		calls.length === 2 &&
			calls.every((c) => c.type === 'webgl2') &&
			calls[0].powerPreference === 'high-performance' &&
			calls[1].powerPreference === 'default',
		'acquireSafeWebGLContext must fall back from WebGL2 high-performance to WebGL2 default without touching WebGL1'
	);

	const mockCanvasNoAa = {
		getContext(type, attrs) {
			if (type === 'webgl2' && attrs?.antialias === false) return fakeCtx;
			return null;
		}
	};
	const noAaRes = acquireSafeWebGLContext(mockCanvasNoAa, {
		powerPreference: 'default',
		antialias: true,
		alpha: false
	});
	assert.equal(noAaRes.context, fakeCtx);
	assert.equal(noAaRes.antialias, false);

	const mockCanvasDead = { getContext: () => null };
	const deadRes = acquireSafeWebGLContext(mockCanvasDead, {
		powerPreference: 'default',
		antialias: true,
		alpha: false
	});
	assert.equal(deadRes.context, undefined);
	assert.equal(deadRes.antialias, false);
});
