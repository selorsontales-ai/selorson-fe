/**
 * Dynamic Reference-Frame Multi-Sector Cosmology (`Chặng 1A` v2.0),
 * Era Timeline Scrubber & Worldline Divergence Model for Selorson V3 `/world`.
 *
 * Strictly free of Three.js imports so SSR, HUD components, and Node unit tests
 * (`tests/world-map.test.mjs`) can import and verify all pure astronomical &
 * narrative logic deterministically.
 */

import type { Journey, LocationDetail, RegionDetail, RevealState, WorldNode } from './types';

export type CosmicSectorId = 'akunalia_sector' | 'solar_system';

export type CelestialBodyId =
	// Sector 1: Origin Sector Akunalia (Deep-space independent star system)
	| 'akunalia_star'
	| 'akunalia'
	| 'akunalia_moon_major'
	| 'akunalia_moon_minor'
	// Sector 2: Solar System (Sun + all 8 planets + Earth's Moon)
	| 'sun'
	| 'mercury'
	| 'venus'
	| 'earth'
	| 'moon'
	| 'mars'
	| 'jupiter'
	| 'saturn'
	| 'uranus'
	| 'neptune';

export type CelestialBodyKind = 'star' | 'terrestrial' | 'gas_giant' | 'ice_giant' | 'moon';
export type WorldTier = 0 | 1;
export type WorldTimeline = 1 | 2;
export type SupportedWorldLocale = 'vi' | 'en';

export interface LocalizedText {
	vi: string;
	en: string;
}

export interface CelestialTelemetry {
	classification: LocalizedText;
	radiusLabel: LocalizedText;
	orbitPeriodLabel: LocalizedText;
	temperatureLabel: LocalizedText;
	atmosphereLabel: LocalizedText;
}

export interface CelestialBodySpec {
	id: CelestialBodyId;
	sector: CosmicSectorId;
	kind: CelestialBodyKind;
	/** Scene-space radius when rendered. */
	radius: number;
	/** Axial obliquity in degrees (`23.44°` Earth, `26.73°` Saturn, `97.77°` Uranus, etc.). */
	axialTiltDeg: number;
	/** Self-rotation angular speed (`rad / sec` in idle view). */
	spinSpeed: number;
	/** Initial rotation around tilted spin axis (`rad`) so iconic hemisphere faces camera. */
	initialRotationY: number;
	/** Parent body for Keplerian orbit (`null` for central sector star). */
	orbitParentId: CelestialBodyId | null;
	/** Semi-major axis in scene units. */
	orbitSemiMajor: number;
	/** Orbital eccentricity `[0..0.25]`. */
	orbitEccentricity: number;
	/** Orbital inclination relative to sector ecliptic (`deg`). */
	orbitInclinationDeg: number;
	/** Longitude of ascending node (`deg`) for 3D orbital variety. */
	orbitAscendingNodeDeg: number;
	/** Full orbital period in simulation seconds (`0` for stationary central star). */
	orbitPeriodSec: number;
	/** Initial orbital phase (`rad`) at `t = 0`. */
	initialPhaseRad: number;
	/** Optimal camera distance multiplier (`multiplier * radius`) when locked at `(0,0,0)`. */
	orbitDistanceFactor: number;
	/** True for `akunalia` and `earth` which host narrative regions, places, and eras. */
	hasNarrativeMap: boolean;
	hasRings?: boolean;
	icon: string;
	accent: string;
	name: LocalizedText;
	shortName: LocalizedText;
	badge: LocalizedText;
	summary: LocalizedText;
	telemetry: CelestialTelemetry;
}

export interface CosmicSectorSpec {
	id: CosmicSectorId;
	starId: CelestialBodyId;
	defaultBodyId: CelestialBodyId;
	overviewCamPos: [number, number, number];
	overviewMaxDist: number;
	icon: string;
	accent: string;
	name: LocalizedText;
	subtitle: LocalizedText;
	bodyOrder: CelestialBodyId[];
}

export interface BodyFrameState {
	id: CelestialBodyId;
	/** Absolute sector-barycentric position `P_i(t)`. */
	barycentricPos: [number, number, number];
	/** Relative position `X_i(t) = P_i(t) - O(t)` in the active reference frame (`[0,0,0]` for selected body!). */
	relativePos: [number, number, number];
	/** Unit direction vector from this body toward its sector's host star (`[0,1,0]` for the star itself). */
	starDir: [number, number, number];
}

export interface SectorSnapshot {
	sector: CosmicSectorId;
	referenceBodyId: CelestialBodyId | null;
	originBarycentric: [number, number, number];
	starRelativePos: [number, number, number];
	bodies: Record<CelestialBodyId, BodyFrameState>;
}

export interface WorldEraDef {
	id: string;
	planet: CelestialBodyId;
	yearLabel: LocalizedText;
	title: LocalizedText;
	subtitle: LocalizedText;
	/** Optical-quantum wavelength in nm (`380..700`), or null for full/black spectrum. */
	wavelengthNm: number | null;
	color: string;
	/** Minimum chapter required to unlock full details (`Spoiler-safe Fog of War`). */
	unlockChapter: number;
	/** Optional focal coordinate on the globe when selecting this era. */
	focusLatLng?: { lat: number; lng: number };
	/** Sub-harmonic added to the 6-decimal Divergence readout. */
	divergenceMicroOffset: number;
}

export interface SingularityDef {
	/** Negative synthetic ID (`-101 .. -108`, `-201 .. -210`) so it never collides with positive DB `library_items.id`. */
	id: number;
	slug: string;
	planet: 'akunalia' | 'earth';
	kind: 'region' | 'landmark';
	region: string | null;
	era: string;
	lat: number;
	lng: number;
	alt: number;
	terrain: string;
	color: string;
	wavelengthNm: number | null;
	unlockChapter: number;
	isSingularity: boolean;
	name: LocalizedText;
	rumoredName: LocalizedText;
	description: LocalizedText;
	timeline2Note?: LocalizedText;
}

/** Chapter threshold before Worldline 2 resonance details are unshielded. */
export const TIMELINE_2_UNLOCK_CHAPTER = 18;

export const COSMIC_SECTORS: Record<CosmicSectorId, CosmicSectorSpec> = {
	akunalia_sector: {
		id: 'akunalia_sector',
		starId: 'akunalia_star',
		defaultBodyId: 'akunalia',
		overviewCamPos: [0, 46, 98],
		overviewMaxDist: 210,
		icon: '✨',
		accent: '#38bdf8',
		name: {
			vi: 'Tinh Vực Akunalia',
			en: 'Akunalia Sector'
		},
		subtitle: {
			vi: 'Vùng tinh vân sâu biệt lập · Quê hương khởi nguyên Saga II',
			en: 'Independent deep-space nebula · Origin homeworld of Saga II'
		},
		bodyOrder: ['akunalia', 'akunalia_star', 'akunalia_moon_major', 'akunalia_moon_minor']
	},
	solar_system: {
		id: 'solar_system',
		starId: 'sun',
		defaultBodyId: 'earth',
		overviewCamPos: [0, 74, 168],
		overviewMaxDist: 340,
		icon: '☀️',
		accent: '#fbbf24',
		name: {
			vi: 'Hệ Mặt Trời',
			en: 'Solar System'
		},
		subtitle: {
			vi: 'Mặt Trời & 8 hành tinh · Trái Đất Đa Kỷ Nguyên Saga I',
			en: 'The Sun & 8 planets · Multi-Era Earth of Saga I'
		},
		bodyOrder: [
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
		]
	}
};

export const SECTOR_ORDER: CosmicSectorId[] = ['akunalia_sector', 'solar_system'];
export const COSMIC_SECTOR_ORDER: CosmicSectorId[] = SECTOR_ORDER;

export const SECTOR_BODIES: Record<CosmicSectorId, CelestialBodyId[]> = {
	akunalia_sector: COSMIC_SECTORS.akunalia_sector.bodyOrder,
	solar_system: COSMIC_SECTORS.solar_system.bodyOrder
};

export function isCosmicSectorId(val: string | null | undefined): val is CosmicSectorId {
	return Boolean(val && Object.prototype.hasOwnProperty.call(COSMIC_SECTORS, val));
}

export function isCelestialBodyId(val: string | null | undefined): val is CelestialBodyId {
	return Boolean(val && Object.prototype.hasOwnProperty.call(CELESTIAL_BODIES, val));
}

export const CELESTIAL_BODIES: Record<CelestialBodyId, CelestialBodySpec> = {
	// ═══════════════════════════════════════════════════════════════════════════
	// SECTOR 1: ORIGIN SECTOR AKUNALIA (Deep Space — Independent Star System)
	// ═══════════════════════════════════════════════════════════════════════════
	akunalia_star: {
		id: 'akunalia_star',
		sector: 'akunalia_sector',
		kind: 'star',
		radius: 6.8,
		axialTiltDeg: 7.2,
		spinSpeed: 0.016,
		initialRotationY: 0,
		orbitParentId: null,
		orbitSemiMajor: 0,
		orbitEccentricity: 0,
		orbitInclinationDeg: 0,
		orbitAscendingNodeDeg: 0,
		orbitPeriodSec: 0,
		initialPhaseRad: 0,
		orbitDistanceFactor: 4.85,
		hasNarrativeMap: false,
		icon: '🌟',
		accent: '#fde68a',
		name: { vi: 'Sao Chủ Khởi Nguyên', en: 'Primordial Host Star' },
		shortName: { vi: 'Sao Khởi Nguyên', en: 'Origin Star' },
		badge: { vi: 'Sao Quang Phổ Trắng-Vàng · F8V', en: 'Golden-White Star · Class F8V' },
		summary: {
			vi: 'Ngôi sao cổ xưa nơi vùng vũ trụ sâu biệt lập, tỏa bức xạ quang phổ trắng-vàng nuôi dưỡng mạng lưới Hạt Thần Năng trên khắp hành tinh Akunalia.',
			en: 'An ancient golden-white star in deep space whose radiant spectrum sustains the Divine Particle ley-network across Akunalia.'
		},
		telemetry: {
			classification: { vi: 'Sao dãy chính F8V', en: 'F8V Main-Sequence Star' },
			radiusLabel: { vi: '1.18 R☉ (~821.000 km)', en: '1.18 R☉ (~821,000 km)' },
			orbitPeriodLabel: { vi: 'Tâm trọng trường tinh vực', en: 'Sector Barycenter' },
			temperatureLabel: { vi: '6.180 K (Quang quyển)', en: '6,180 K (Photosphere)' },
			atmosphereLabel: { vi: 'Plasma Hydro – Heli & Nhật hoa', en: 'Hydrogen–Helium Plasma & Corona' }
		}
	},
	akunalia: {
		id: 'akunalia',
		sector: 'akunalia_sector',
		kind: 'terrestrial',
		radius: 5.0,
		axialTiltDeg: 21.5,
		spinSpeed: 0.025,
		initialRotationY: -2.02,
		orbitParentId: 'akunalia_star',
		orbitSemiMajor: 64.0,
		orbitEccentricity: 0.025,
		orbitInclinationDeg: 1.6,
		orbitAscendingNodeDeg: 18.0,
		orbitPeriodSec: 420,
		initialPhaseRad: -0.88,
		orbitDistanceFactor: 3.45,
		hasNarrativeMap: true,
		hasRings: true,
		icon: '🪐',
		accent: '#38bdf8',
		name: { vi: 'Hành Tinh Akunalia', en: 'Planet Akunalia' },
		shortName: { vi: 'Akunalia', en: 'Akunalia' },
		badge: { vi: 'Quê Hương Khởi Nguyên · Saga II', en: 'Origin Homeworld · Saga II' },
		summary: {
			vi: 'Hành tinh khởi nguyên với dãy tuyết sơn hắc diện thạch Tabaoki, đại giang Behadona chảy qua đồng bằng Nilanda, đại đền ngũ giác Zyberon, nội hải Hồ Bán Nguyệt bốn tầng kết giới và cao nguyên Eldarin rực sáng mạch Hạt Thần Năng.',
			en: 'The ancestral world crowned by obsidian-and-snow Mount Tabaoki, the Behadona River winding across Nilanda, the Pentagonal Temple of Zyberon, the four-warded Crescent Moon Sea, and Eldarin’s luminous Divine Particle veins.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh đất đá giàu Thần Năng', en: 'Terrestrial Origin World' },
			radiusLabel: { vi: '6.840 km (1.07 R⊕)', en: '6,840 km (1.07 R⊕)' },
			orbitPeriodLabel: { vi: '384 ngày chuẩn', en: '384 Standard Days' },
			temperatureLabel: { vi: '-38°C → +34°C (Ôn hòa)', en: '-38°C → +34°C (Temperate)' },
			atmosphereLabel: { vi: 'Nitơ – Oxy & Bụi Tinh Thể Thần Năng', en: 'N₂ – O₂ & Crystalline Aether Mist' }
		}
	},
	akunalia_moon_major: {
		id: 'akunalia_moon_major',
		sector: 'akunalia_sector',
		kind: 'moon',
		radius: 1.08,
		axialTiltDeg: 4.5,
		spinSpeed: 0.018,
		initialRotationY: 0.6,
		orbitParentId: 'akunalia',
		orbitSemiMajor: 14.8,
		orbitEccentricity: 0.03,
		orbitInclinationDeg: 6.8,
		orbitAscendingNodeDeg: 42.0,
		orbitPeriodSec: 78,
		initialPhaseRad: 2.15,
		orbitDistanceFactor: 3.8,
		hasNarrativeMap: false,
		icon: '🌕',
		accent: '#cbd5e1',
		name: { vi: 'Đại Nguyệt Ngân Bạch', en: 'Greater Silver Moon' },
		shortName: { vi: 'Đại Nguyệt', en: 'Greater Moon' },
		badge: { vi: 'Vệ Tinh Tự Nhiên Nội Quỹ Đạo', en: 'Inner Natural Satellite' },
		summary: {
			vi: 'Vệ tinh đá bazan và thạch anh bạc điều phối thủy triều của Nội Hải Hồ Bán Nguyệt cùng dòng chảy đại giang Behadona.',
			en: 'Silvery basalt-and-quartz natural moon governing the tides of the Crescent Moon Sea and the Behadona delta.'
		},
		telemetry: {
			classification: { vi: 'Vệ tinh đá silicat khóa triều', en: 'Tidally Locked Silicate Moon' },
			radiusLabel: { vi: '1.920 km', en: '1,920 km' },
			orbitPeriodLabel: { vi: '29.4 ngày Akunalia', en: '29.4 Akunalia Days' },
			temperatureLabel: { vi: '-145°C → +65°C', en: '-145°C → +65°C' },
			atmosphereLabel: { vi: 'Ngoại quyển bụi tinh thể cực mỏng', en: 'Trace Crystalline Exosphere' }
		}
	},
	akunalia_moon_minor: {
		id: 'akunalia_moon_minor',
		sector: 'akunalia_sector',
		kind: 'moon',
		radius: 0.66,
		axialTiltDeg: 11.0,
		spinSpeed: 0.032,
		initialRotationY: -1.1,
		orbitParentId: 'akunalia',
		orbitSemiMajor: 21.8,
		orbitEccentricity: 0.06,
		orbitInclinationDeg: -12.4,
		orbitAscendingNodeDeg: 135.0,
		orbitPeriodSec: 128,
		initialPhaseRad: -1.85,
		orbitDistanceFactor: 4.2,
		hasNarrativeMap: false,
		icon: '🌘',
		accent: '#67e8f9',
		name: { vi: 'Tiểu Nguyệt Băng Tinh', en: 'Crystalline Minor Moon' },
		shortName: { vi: 'Tiểu Nguyệt', en: 'Minor Moon' },
		badge: { vi: 'Vệ Tinh Băng Ngoại Quỹ Đạo', en: 'Outer Icy Satellite' },
		summary: {
			vi: 'Vệ tinh băng lam nhỏ quay nghiêng ngoài vành bụi tinh thể của Akunalia, phản chiếu ánh sáng xanh ngọc dịu nhẹ trong những đêm không mây.',
			en: 'An inclined icy moon beyond Akunalia’s gossamer crystal dust ring, casting a pale cyan shimmer on clear nights.'
		},
		telemetry: {
			classification: { vi: 'Vệ tinh băng – khoáng thạch', en: 'Cryo-Mineral Satellite' },
			radiusLabel: { vi: '980 km', en: '980 km' },
			orbitPeriodLabel: { vi: '54.2 ngày Akunalia', en: '54.2 Akunalia Days' },
			temperatureLabel: { vi: '-168°C → -82°C', en: '-168°C → -82°C' },
			atmosphereLabel: { vi: 'Chân không băng giá', en: 'Cryogenic Vacuum' }
		}
	},

	// ═══════════════════════════════════════════════════════════════════════════
	// SECTOR 2: SOLAR SYSTEM (Sun + All 8 Planets + Moon)
	// ═══════════════════════════════════════════════════════════════════════════
	sun: {
		id: 'sun',
		sector: 'solar_system',
		kind: 'star',
		radius: 7.5,
		axialTiltDeg: 7.25,
		spinSpeed: 0.014,
		initialRotationY: 0,
		orbitParentId: null,
		orbitSemiMajor: 0,
		orbitEccentricity: 0,
		orbitInclinationDeg: 0,
		orbitAscendingNodeDeg: 0,
		orbitPeriodSec: 0,
		initialPhaseRad: 0,
		orbitDistanceFactor: 4.95,
		hasNarrativeMap: false,
		icon: '☀️',
		accent: '#fbbf24',
		name: { vi: 'Mặt Trời (Thái Dương)', en: 'The Sun (Sol)' },
		shortName: { vi: 'Mặt Trời', en: 'Sun' },
		badge: { vi: 'Sao Lùn Vàng G2V · Tâm Hệ Mặt Trời', en: 'G2V Yellow Dwarf · Solar Center' },
		summary: {
			vi: 'Trái cầu plasma nhiệt hạch khổng lồ với các ô đối lưu sôi sục, vết đen từ trường và vành nhật hoa rực sáng giữ 8 hành tinh chuyển động trên quỹ đạo.',
			en: 'Thermonuclear plasma sphere of seething granulation cells, magnetic sunspots, and blazing solar corona binding all eight planets in orbit.'
		},
		telemetry: {
			classification: { vi: 'Sao lùn vàng dãy chính G2V', en: 'G2V Main-Sequence Star' },
			radiusLabel: { vi: '696.340 km (109 R⊕)', en: '696,340 km (109 R⊕)' },
			orbitPeriodLabel: { vi: '~230 triệu năm quanh Ngân Hà', en: '~230 Myr Galactic Orbit' },
			temperatureLabel: { vi: '5.778 K (Bề mặt) · 15 triệu K (Lõi)', en: '5,778 K (Surface) · 15M K (Core)' },
			atmosphereLabel: { vi: '73.5% Hydro · 24.9% Heli', en: '73.5% Hydrogen · 24.9% Helium' }
		}
	},
	mercury: {
		id: 'mercury',
		sector: 'solar_system',
		kind: 'terrestrial',
		radius: 1.55,
		axialTiltDeg: 0.03,
		spinSpeed: 0.011,
		initialRotationY: 0.4,
		orbitParentId: 'sun',
		orbitSemiMajor: 19.5,
		orbitEccentricity: 0.12,
		orbitInclinationDeg: 3.8,
		orbitAscendingNodeDeg: 48.0,
		orbitPeriodSec: 64,
		initialPhaseRad: 0.95,
		orbitDistanceFactor: 3.6,
		hasNarrativeMap: false,
		icon: '🪨',
		accent: '#94a3b8',
		name: { vi: 'Sao Thủy (Mercury)', en: 'Mercury' },
		shortName: { vi: 'Sao Thủy', en: 'Mercury' },
		badge: { vi: 'Hành Tinh Thứ 1 · Lõi Sắt & Hố Va Chạm', en: '1st Planet · Cratered Iron World' },
		summary: {
			vi: 'Hành tinh trong cùng gần Mặt Trời nhất, bề mặt chằng chịt hố thiên thạch cổ đại như bồn địa Caloris và chênh lệch nhiệt độ ngày đêm khắc nghiệt.',
			en: 'The innermost rocky planet scarred by ancient impact basins and extreme day-to-night thermal swings.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh đất đá (0.39 AU)', en: 'Terrestrial Planet (0.39 AU)' },
			radiusLabel: { vi: '2.439,7 km (0.38 R⊕)', en: '2,439.7 km (0.38 R⊕)' },
			orbitPeriodLabel: { vi: '87,97 ngày Trái Đất', en: '87.97 Earth Days' },
			temperatureLabel: { vi: '-180°C (Đêm) → +430°C (Ngày)', en: '-180°C (Night) → +430°C (Day)' },
			atmosphereLabel: { vi: 'Ngoại quyển siêu loãng (Na, O₂, He)', en: 'Ultra-thin Exosphere (Na, O₂, He)' }
		}
	},
	venus: {
		id: 'venus',
		sector: 'solar_system',
		kind: 'terrestrial',
		radius: 2.95,
		axialTiltDeg: 177.36,
		spinSpeed: -0.008,
		initialRotationY: 1.2,
		orbitParentId: 'sun',
		orbitSemiMajor: 30.5,
		orbitEccentricity: 0.01,
		orbitInclinationDeg: 2.2,
		orbitAscendingNodeDeg: 76.0,
		orbitPeriodSec: 102,
		initialPhaseRad: 2.35,
		orbitDistanceFactor: 3.4,
		hasNarrativeMap: false,
		icon: '💛',
		accent: '#fcd34d',
		name: { vi: 'Sao Kim (Venus)', en: 'Venus' },
		shortName: { vi: 'Sao Kim', en: 'Venus' },
		badge: { vi: 'Hành Tinh Thứ 2 · Khí Quyển Siêu Quay', en: '2nd Planet · Super-Rotating Clouds' },
		summary: {
			vi: 'Được bao phủ hoàn toàn bởi những dải mây axit sulfuric vàng kem phản chiếu ánh nắng chói lòa và tự quay nghịch chiều quanh trục.',
			en: 'Shrouded in brilliant golden-cream sulfuric acid cloud bands spinning in retrograde super-rotation.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh đất đá (0.72 AU)', en: 'Terrestrial Planet (0.72 AU)' },
			radiusLabel: { vi: '6.051,8 km (0.95 R⊕)', en: '6,051.8 km (0.95 R⊕)' },
			orbitPeriodLabel: { vi: '224,7 ngày Trái Đất', en: '224.7 Earth Days' },
			temperatureLabel: { vi: '+464°C (Hiệu ứng nhà kính)', en: '+464°C (Runaway Greenhouse)' },
			atmosphereLabel: { vi: '96.5% CO₂ · 3.5% N₂ (92 bar)', en: '96.5% CO₂ · 3.5% N₂ (92 bar)' }
		}
	},
	earth: {
		id: 'earth',
		sector: 'solar_system',
		kind: 'terrestrial',
		radius: 4.65,
		axialTiltDeg: 23.44,
		spinSpeed: 0.026,
		initialRotationY: -2.05,
		orbitParentId: 'sun',
		orbitSemiMajor: 46.0,
		orbitEccentricity: 0.017,
		orbitInclinationDeg: 0.0,
		orbitAscendingNodeDeg: 0.0,
		orbitPeriodSec: 150,
		initialPhaseRad: -0.88,
		orbitDistanceFactor: 3.45,
		hasNarrativeMap: true,
		icon: '🌍',
		accent: '#34d399',
		name: { vi: 'Trái Đất Đa Kỷ Nguyên', en: 'Multi-Era Earth' },
		shortName: { vi: 'Trái Đất', en: 'Earth' },
		badge: { vi: 'Hành Tinh Thứ 3 · 8 Dị Điểm Saga I', en: '3rd Planet · 8 Singularities of Saga I' },
		summary: {
			vi: 'Viên ngọc xanh của Hệ Mặt Trời trải dài từ 3000 TCN đến thế kỷ XXVI, nơi các mảnh thiên thạch cùng chất liệu Lăng Kính rớt xuống các nền văn minh và cộng hưởng theo bước sóng quang phổ.',
			en: 'Blue marble of the Solar System spanning 3000 BCE to the 26th century, where Prism-born meteorite shards fell across civilizations in spectral resonance.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh đại dương sống (1.00 AU)', en: 'Oceanic Terrestrial World (1.00 AU)' },
			radiusLabel: { vi: '6.371,0 km (1.00 R⊕)', en: '6,371.0 km (1.00 R⊕)' },
			orbitPeriodLabel: { vi: '365,256 ngày', en: '365.256 Days' },
			temperatureLabel: { vi: 'Trung bình +15°C (-89°C → +56°C)', en: 'Mean +15°C (-89°C → +56°C)' },
			atmosphereLabel: { vi: '78% N₂ · 21% O₂ · 1% Ar & H₂O', en: '78% N₂ · 21% O₂ · 1% Ar & H₂O' }
		}
	},
	moon: {
		id: 'moon',
		sector: 'solar_system',
		kind: 'moon',
		radius: 1.18,
		axialTiltDeg: 6.68,
		spinSpeed: 0.016,
		initialRotationY: 0.8,
		orbitParentId: 'earth',
		orbitSemiMajor: 12.6,
		orbitEccentricity: 0.055,
		orbitInclinationDeg: 5.14,
		orbitAscendingNodeDeg: 125.0,
		orbitPeriodSec: 46,
		initialPhaseRad: 2.25,
		orbitDistanceFactor: 3.7,
		hasNarrativeMap: false,
		icon: '🌙',
		accent: '#e2e8f0',
		name: { vi: 'Mặt Trăng (Luna)', en: 'The Moon (Luna)' },
		shortName: { vi: 'Mặt Trăng', en: 'Moon' },
		badge: { vi: 'Vệ Tinh Tự Nhiên Duy Nhất Của Trái Đất', en: 'Earth’s Natural Satellite' },
		summary: {
			vi: 'Thiên thể đồng hành khóa triều với các biển bazan tối Maria, hố Tycho tỏa tia sáng và khoảnh khắc Nhật Thực định mệnh nối hai kỷ nguyên.',
			en: 'Tidally locked companion of dark basaltic maria, rayed craters, and the fateful solar eclipse bridging distant epochs.'
		},
		telemetry: {
			classification: { vi: 'Vệ tinh tự nhiên (384.400 km)', en: 'Natural Satellite (384,400 km)' },
			radiusLabel: { vi: '1.737,4 km (0.27 R⊕)', en: '1,737.4 km (0.27 R⊕)' },
			orbitPeriodLabel: { vi: '27,32 ngày (Khóa triều 1:1)', en: '27.32 Days (1:1 Synchronous)' },
			temperatureLabel: { vi: '-173°C (Đêm) → +127°C (Ngày)', en: '-173°C (Night) → +127°C (Day)' },
			atmosphereLabel: { vi: 'Chân không regolith', en: 'Hard Vacuum / Regolith' }
		}
	},
	mars: {
		id: 'mars',
		sector: 'solar_system',
		kind: 'terrestrial',
		radius: 2.55,
		axialTiltDeg: 25.19,
		spinSpeed: 0.025,
		initialRotationY: -0.9,
		orbitParentId: 'sun',
		orbitSemiMajor: 66.0,
		orbitEccentricity: 0.07,
		orbitInclinationDeg: 1.85,
		orbitAscendingNodeDeg: 49.5,
		orbitPeriodSec: 210,
		initialPhaseRad: -1.95,
		orbitDistanceFactor: 3.4,
		hasNarrativeMap: false,
		icon: '🔴',
		accent: '#fb7185',
		name: { vi: 'Sao Hỏa (Mars)', en: 'Mars' },
		shortName: { vi: 'Sao Hỏa', en: 'Mars' },
		badge: { vi: 'Hành Tinh Thứ 4 · Hành Tinh Đỏ', en: '4th Planet · The Red Planet' },
		summary: {
			vi: 'Thế giới hoang mạc oxit sắt đỏ rực mang hẻm vực Valles Marineris khổng lồ, núi lửa Olympus Mons và hai chỏm băng CO₂ trắng xóa ở hai cực.',
			en: 'Rust-red desert world carved by Valles Marineris, Olympus Mons, dark Syrtis basalt plains, and twin polar ice caps.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh đất đá (1.52 AU)', en: 'Terrestrial Planet (1.52 AU)' },
			radiusLabel: { vi: '3.389,5 km (0.53 R⊕)', en: '3,389.5 km (0.53 R⊕)' },
			orbitPeriodLabel: { vi: '686,98 ngày Trái Đất', en: '686.98 Earth Days' },
			temperatureLabel: { vi: 'Trung bình -63°C (-140°C → +20°C)', en: 'Mean -63°C (-140°C → +20°C)' },
			atmosphereLabel: { vi: '95.3% CO₂ · 2.7% N₂ · Bụi mịn', en: '95.3% CO₂ · 2.7% N₂ · Fine Dust' }
		}
	},
	jupiter: {
		id: 'jupiter',
		sector: 'solar_system',
		kind: 'gas_giant',
		radius: 6.2,
		axialTiltDeg: 3.13,
		spinSpeed: 0.045,
		initialRotationY: 1.98,
		orbitParentId: 'sun',
		orbitSemiMajor: 79.0,
		orbitEccentricity: 0.048,
		orbitInclinationDeg: 1.3,
		orbitAscendingNodeDeg: 100.5,
		orbitPeriodSec: 300,
		initialPhaseRad: 0.62,
		orbitDistanceFactor: 3.55,
		hasNarrativeMap: false,
		icon: '🟠',
		accent: '#fdba74',
		name: { vi: 'Sao Mộc (Jupiter)', en: 'Jupiter' },
		shortName: { vi: 'Sao Mộc', en: 'Jupiter' },
		badge: { vi: 'Hành Tinh Thứ 5 · Hành Tinh Khí Khổng Lồ', en: '5th Planet · King of Gas Giants' },
		summary: {
			vi: 'Hành tinh lớn nhất Hệ Mặt Trời với những dải mây amoniac cuồn cuộn đối chiều và cơn siêu bão Vết Đỏ Lớn tồn tại hàng thế kỷ.',
			en: 'Colossal gas giant banded by counter-streaming ammonia cloud belts and the centuries-old Great Red Spot anticyclone.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh khí khổng lồ (5.20 AU)', en: 'Gas Giant (5.20 AU)' },
			radiusLabel: { vi: '69.911 km (10.97 R⊕)', en: '69,911 km (10.97 R⊕)' },
			orbitPeriodLabel: { vi: '11,86 năm Trái Đất', en: '11.86 Earth Years' },
			temperatureLabel: { vi: '-108°C (Đỉnh tầng mây 1 bar)', en: '-108°C (1-bar Cloud Tops)' },
			atmosphereLabel: { vi: '89.8% H₂ · 10.2% He · NH₃', en: '89.8% H₂ · 10.2% He · NH₃' }
		}
	},
	saturn: {
		id: 'saturn',
		sector: 'solar_system',
		kind: 'gas_giant',
		radius: 5.35,
		axialTiltDeg: 26.73,
		spinSpeed: 0.041,
		initialRotationY: 0.25,
		orbitParentId: 'sun',
		orbitSemiMajor: 97.0,
		orbitEccentricity: 0.054,
		orbitInclinationDeg: 2.48,
		orbitAscendingNodeDeg: 113.7,
		orbitPeriodSec: 390,
		initialPhaseRad: -2.38,
		orbitDistanceFactor: 5.35,
		hasNarrativeMap: false,
		hasRings: true,
		icon: '🪐',
		accent: '#fde047',
		name: { vi: 'Sao Thổ (Saturn)', en: 'Saturn' },
		shortName: { vi: 'Sao Thổ', en: 'Saturn' },
		badge: { vi: 'Hành Tinh Thứ 6 · Kiệt Tác Vành Đai Cassini', en: '6th Planet · Jewel of the Rings' },
		summary: {
			vi: 'Nổi bật với hệ thống vành đai băng – bụi lộng lẫy bị chia cắt bởi khe hở Cassini, xuyên sáng dưới ánh Mặt Trời và đổ bóng sắc nét lên tầng mây vàng lợt.',
			en: 'Crowned by translucent crystalline ice rings split by the Cassini Division, scattering sunlight and casting crisp shadows across golden clouds.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh khí khổng lồ (9.58 AU)', en: 'Ringed Gas Giant (9.58 AU)' },
			radiusLabel: { vi: '58.232 km · Vành đai rộng 282.000 km', en: '58,232 km · 282,000 km Ring Span' },
			orbitPeriodLabel: { vi: '29,45 năm Trái Đất', en: '29.45 Earth Years' },
			temperatureLabel: { vi: '-139°C (Đỉnh mây)', en: '-139°C (Cloud Tops)' },
			atmosphereLabel: { vi: '96.3% H₂ · 3.25% He · Vành băng H₂O', en: '96.3% H₂ · 3.25% He · H₂O Ice Rings' }
		}
	},
	uranus: {
		id: 'uranus',
		sector: 'solar_system',
		kind: 'ice_giant',
		radius: 3.85,
		axialTiltDeg: 97.77,
		spinSpeed: -0.033,
		initialRotationY: 0.3,
		orbitParentId: 'sun',
		orbitSemiMajor: 114.0,
		orbitEccentricity: 0.047,
		orbitInclinationDeg: 0.77,
		orbitAscendingNodeDeg: 74.0,
		orbitPeriodSec: 490,
		initialPhaseRad: 2.15,
		orbitDistanceFactor: 3.95,
		hasNarrativeMap: false,
		hasRings: true,
		icon: '🩵',
		accent: '#67e8f9',
		name: { vi: 'Sao Thiên Vương (Uranus)', en: 'Uranus' },
		shortName: { vi: 'Thiên Vương', en: 'Uranus' },
		badge: { vi: 'Hành Tinh Thứ 7 · Người Khổng Lồ Băng Nằm Nghiêng', en: '7th Planet · Sideways Ice Giant' },
		summary: {
			vi: 'Hành tinh băng xanh ngọc bích với trục tự quay nghiêng tới 97.8° như đang lăn dọc trên mặt phẳng quỹ đạo cùng hệ vành đai mảnh thẳng đứng.',
			en: 'Cyan-jade ice giant rolling on its side at a 97.8° axial tilt, encircled by delicate vertical dark-ice rings.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh băng khổng lồ (19.2 AU)', en: 'Ice Giant (19.2 AU)' },
			radiusLabel: { vi: '25.362 km (3.98 R⊕)', en: '25,362 km (3.98 R⊕)' },
			orbitPeriodLabel: { vi: '84,02 năm Trái Đất', en: '84.02 Earth Years' },
			temperatureLabel: { vi: '-197°C (Lạnh nhất Hệ Mặt Trời)', en: '-197°C (Coldest Planetary Tropopause)' },
			atmosphereLabel: { vi: '83% H₂ · 15% He · 2.3% CH₄ (Mêtan)', en: '83% H₂ · 15% He · 2.3% Methane (CH₄)' }
		}
	},
	neptune: {
		id: 'neptune',
		sector: 'solar_system',
		kind: 'ice_giant',
		radius: 3.75,
		axialTiltDeg: 28.32,
		spinSpeed: 0.036,
		initialRotationY: -0.6,
		orbitParentId: 'sun',
		orbitSemiMajor: 130.0,
		orbitEccentricity: 0.009,
		orbitInclinationDeg: 1.77,
		orbitAscendingNodeDeg: 131.8,
		orbitPeriodSec: 590,
		initialPhaseRad: 1.52,
		orbitDistanceFactor: 3.55,
		hasNarrativeMap: false,
		icon: '🔵',
		accent: '#60a5fa',
		name: { vi: 'Sao Hải Vương (Neptune)', en: 'Neptune' },
		shortName: { vi: 'Hải Vương', en: 'Neptune' },
		badge: { vi: 'Hành Tinh Thứ 8 · Đại Dương Gió Siêu Thanh', en: '8th Planet · Supersonic Azure Giant' },
		summary: {
			vi: 'Hành tinh ngoài cùng xanh lam thẳm dữ dội nhất Hệ Mặt Trời, nơi những dải mây băng mêtan trắng xóa bị quật đi bởi luồng gió vượt vận tốc âm thanh.',
			en: 'Deep-cobalt outermost giant whipped by supersonic winds, bright white methane-ice cirrus streaks, and dark storm vortices.'
		},
		telemetry: {
			classification: { vi: 'Hành tinh băng khổng lồ (30.1 AU)', en: 'Ice Giant (30.1 AU)' },
			radiusLabel: { vi: '24.622 km (3.86 R⊕)', en: '24,622 km (3.86 R⊕)' },
			orbitPeriodLabel: { vi: '164,8 năm Trái Đất', en: '164.8 Earth Years' },
			temperatureLabel: { vi: '-201°C · Gió 2.100 km/h', en: '-201°C · 2,100 km/h Winds' },
			atmosphereLabel: { vi: '80% H₂ · 19% He · 1.5% CH₄', en: '80% H₂ · 19% He · 1.5% CH₄' }
		}
	}
};

export const CELESTIAL_ORDER: CelestialBodyId[] = [
	...COSMIC_SECTORS.akunalia_sector.bodyOrder,
	...COSMIC_SECTORS.solar_system.bodyOrder
];

export function resolveSectorOfBody(bodyId: CelestialBodyId): CosmicSectorId {
	return CELESTIAL_BODIES[bodyId]?.sector ?? 'akunalia_sector';
}

/**
 * Solve local 3D Keplerian orbital offset relative to `orbitParentId` at time `t` (seconds).
 */
export function solveKeplerOffset(
	spec: CelestialBodySpec,
	timeSec: number
): [number, number, number] {
	if (!spec.orbitParentId || spec.orbitSemiMajor <= 0 || spec.orbitPeriodSec <= 0) {
		return [0, 0, 0];
	}

	const meanAnomaly =
		spec.initialPhaseRad + ((Math.PI * 2) / spec.orbitPeriodSec) * timeSec;
	const e = spec.orbitEccentricity;
	// 3-step Newton-Raphson solver for Kepler's equation `M = E - e sin(E)`
	let E = meanAnomaly;
	for (let k = 0; k < 3; k++) {
		E = E - (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
	}

	const a = spec.orbitSemiMajor;
	const b = a * Math.sqrt(Math.max(0.01, 1 - e * e));
	const xOrb = a * (Math.cos(E) - e);
	const zOrb = b * Math.sin(E);

	const inc = (spec.orbitInclinationDeg * Math.PI) / 180;
	const node = (spec.orbitAscendingNodeDeg * Math.PI) / 180;

	const cosI = Math.cos(inc);
	const sinI = Math.sin(inc);
	const cosN = Math.cos(node);
	const sinN = Math.sin(node);

	// Rotate orbital plane by inclination `inc` then ascending node `node`
	const y1 = -zOrb * sinI;
	const z1 = zOrb * cosI;

	const x = xOrb * cosN - z1 * sinN;
	const z = xOrb * sinN + z1 * cosN;
	return [x, y1, z];
}

/**
 * Sample closed 3D orbital ellipse points around a body's parent (in scene units)
 * for crisp relative orbit guide lines.
 */
export function sampleBodyOrbitLoop(
	bodyId: CelestialBodyId,
	segments = 128
): Array<[number, number, number]> {
	const spec = CELESTIAL_BODIES[bodyId];
	if (!spec || !spec.orbitParentId || spec.orbitSemiMajor <= 0) return [];
	const pts: Array<[number, number, number]> = [];
	for (let i = 0; i <= segments; i++) {
		const fakeTime = (i / segments) * spec.orbitPeriodSec;
		pts.push(solveKeplerOffset(spec, fakeTime));
	}
	return pts;
}

/**
 * Pure Dynamic Reference-Frame Solver (`Hệ Quy Chiếu Thiên Thể Tương Đối`):
 *
 * - When `referenceBodyId` is provided (`Tier 1`), `O(t) = P_selected(t)`, so
 *   `relativePos` of `referenceBodyId` is identically `[0, 0, 0]` for all `t`,
 *   while every other body in that sector moves smoothly along `P_i(t) - P_selected(t)`!
 * - When `referenceBodyId === null` (`Tier 0` Sector Overview), `O(t) = P_star(t) = [0, 0, 0]`.
 * - Sectors are strictly isolated: `akunalia_sector` and `solar_system` never mix.
 */
export function computeSectorSnapshot(
	sector: CosmicSectorId,
	timeSec: number,
	referenceBodyId: CelestialBodyId | null
): SectorSnapshot {
	const sectorSpec = COSMIC_SECTORS[sector];
	const barycentric = {} as Record<CelestialBodyId, [number, number, number]>;

	function evalBarycentric(id: CelestialBodyId): [number, number, number] {
		if (barycentric[id]) return barycentric[id];
		const spec = CELESTIAL_BODIES[id];
		const local = solveKeplerOffset(spec, timeSec);
		if (spec.orbitParentId) {
			const parentPos = evalBarycentric(spec.orbitParentId);
			const total: [number, number, number] = [
				parentPos[0] + local[0],
				parentPos[1] + local[1],
				parentPos[2] + local[2]
			];
			barycentric[id] = total;
			return total;
		}
		barycentric[id] = local;
		return local;
	}

	for (const id of sectorSpec.bodyOrder) {
		evalBarycentric(id);
	}

	const validRef =
		referenceBodyId && CELESTIAL_BODIES[referenceBodyId]?.sector === sector
			? referenceBodyId
			: null;
	const origin: [number, number, number] = validRef
		? [...barycentric[validRef]]
		: [...barycentric[sectorSpec.starId]];

	const starBary = barycentric[sectorSpec.starId];
	const starRelativePos: [number, number, number] = [
		starBary[0] - origin[0],
		starBary[1] - origin[1],
		starBary[2] - origin[2]
	];

	const bodies = {} as Record<CelestialBodyId, BodyFrameState>;
	for (const id of sectorSpec.bodyOrder) {
		const bp = barycentric[id];
		const rel: [number, number, number] =
			validRef === id
				? [0, 0, 0]
				: [bp[0] - origin[0], bp[1] - origin[1], bp[2] - origin[2]];

		let starDir: [number, number, number] = [0, 1, 0];
		if (id !== sectorSpec.starId) {
			const dx = starBary[0] - bp[0];
			const dy = starBary[1] - bp[1];
			const dz = starBary[2] - bp[2];
			const len = Math.hypot(dx, dy, dz) || 1;
			starDir = [dx / len, dy / len, dz / len];
		}

		bodies[id] = {
			id,
			barycentricPos: bp,
			relativePos: rel,
			starDir
		};
	}

	return {
		sector,
		referenceBodyId: validRef,
		originBarycentric: origin,
		starRelativePos,
		bodies
	};
}

export const WORLD_ERAS: Partial<Record<CelestialBodyId, WorldEraDef[]>> = {
	akunalia: [
		{
			id: 'ak_origin',
			planet: 'akunalia',
			yearLabel: { vi: 'Kỷ Khởi Nguyên', en: 'Origin Epoch' },
			title: {
				vi: 'Cao Nguyên Eldarin & Thánh Thôn Cưu Mang',
				en: 'Eldarin Highlands & Sanctuary Village'
			},
			subtitle: {
				vi: 'Mạch Hạt Thần Năng nguyên sơ nuôi dưỡng cao nguyên phía Tây trước biến cố phân ly.',
				en: 'Primordial Divine Particle ley-lines nurturing the western plateaus before the sundering.'
			},
			wavelengthNm: 555,
			color: '#34d399',
			unlockChapter: 1,
			focusLatLng: { lat: 26.5, lng: -80.5 },
			divergenceMicroOffset: 108
		},
		{
			id: 'ak_imperial',
			planet: 'akunalia',
			yearLabel: { vi: 'Kỷ Hoàng Triều', en: 'Imperial Age' },
			title: {
				vi: 'Đỉnh Tabaoki · Đại Giang Behadona · Đền Ngũ Giác Zyberon',
				en: 'Mount Tabaoki · Behadona River · Pentagonal Temple of Zyberon'
			},
			subtitle: {
				vi: 'Từ tuyết sơn hắc diện thạch Tabaoki xuôi theo dòng Behadona qua đồng bằng Nilanda tới đại đền ngũ giác.',
				en: 'From snow-and-obsidian Mount Tabaoki down the Behadona River across Nilanda to the Pentagonal Temple.'
			},
			wavelengthNm: 580,
			color: '#f59e0b',
			unlockChapter: 1,
			focusLatLng: { lat: 28.5, lng: 19.5 },
			divergenceMicroOffset: 412
		},
		{
			id: 'ak_return',
			planet: 'akunalia',
			yearLabel: { vi: 'Kỷ Quy Hồi', en: 'Epoch of Return' },
			title: {
				vi: 'Khai Môn Akunalia · Nội Hải Hồ Bán Nguyệt',
				en: 'Gate of Akunalia · Crescent Moon Sea'
			},
			subtitle: {
				vi: 'Bốn vòng kết giới xanh ngọc giữa lòng Hồ Bán Nguyệt nơi 7 dải quang phổ hội tụ trở về quê hương.',
				en: 'Four emerald barrier rings across the Crescent Moon Sea where seven spectral streams converge homeward.'
			},
			wavelengthNm: 530,
			color: '#14b8a6',
			unlockChapter: 30,
			focusLatLng: { lat: 8.2, lng: 46.8 },
			divergenceMicroOffset: 777
		}
	],
	earth: [
		{
			id: 'era_3000_bce',
			planet: 'earth',
			yearLabel: { vi: '~3000 TCN', en: '~3000 BCE' },
			title: {
				vi: 'Ai Cập Cổ Đại · Thần Quyền Nguyên Sơ',
				en: 'Ancient Egypt · Primordial Theocracy'
			},
			subtitle: {
				vi: 'Mật độ Hạt Thần Năng cực đại dọc sông Nile và các văn bản chữ tượng hình cổ.',
				en: 'Peak Divine Particle density along the Nile and ancient hieroglyphic sanctums.'
			},
			wavelengthNm: null,
			color: '#c084fc',
			unlockChapter: 6,
			focusLatLng: { lat: 29.87, lng: 31.22 },
			divergenceMicroOffset: 901
		},
		{
			id: 'era_1000_bce',
			planet: 'earth',
			yearLabel: { vi: '~1000–800 TCN', en: '~1000–800 BCE' },
			title: {
				vi: 'Dún Scáith & Đỉnh Olympus',
				en: 'Dún Scáith & Mount Olympus'
			},
			subtitle: {
				vi: 'Kỷ nguyên Hoàng Hôn Chư Thần từ sương mù Bắc Âu – Celtic tới đảo cổ Samos.',
				en: 'Twilight of the Gods stretching from misty Celtic fortresses to Samos and Olympus.'
			},
			wavelengthNm: 405,
			color: '#818cf8',
			unlockChapter: 8,
			focusLatLng: { lat: 40.09, lng: 22.36 },
			divergenceMicroOffset: 405
		},
		{
			id: 'era_300_bce',
			planet: 'earth',
			yearLabel: { vi: '~300 TCN', en: '~300 BCE' },
			title: {
				vi: 'Lưu Vực Sông Hằng & Đỉnh Meru',
				en: 'Ganges Basin & Mount Meru'
			},
			subtitle: {
				vi: 'Lò luyện thép Wootz phương Nam và dãy tuyết sơn thiêng sừng sững.',
				en: 'Crucible Wootz steel forges beneath towering Himalayan peaks.'
			},
			wavelengthNm: 580,
			color: '#eab308',
			unlockChapter: 5,
			focusLatLng: { lat: 28.65, lng: 81.2 },
			divergenceMicroOffset: 580
		},
		{
			id: 'era_510_ce',
			planet: 'earth',
			yearLabel: { vi: '497–527 SCN', en: '497–527 CE' },
			title: {
				vi: 'Rừng Sồi Stonehenge & Đỉnh Đạo Gia',
				en: 'Stonehenge Oaks & Daoist Peaks'
			},
			subtitle: {
				vi: 'Hạt Thần Năng lắng vào nội giới, ngôn linh cổ ngữ và đạo lý tự nhiên.',
				en: 'Divine Particles recede inward into arcane word-craft and contemplative stillness.'
			},
			wavelengthNm: 470,
			color: '#38bdf8',
			unlockChapter: 9,
			focusLatLng: { lat: 51.18, lng: -1.83 },
			divergenceMicroOffset: 470
		},
		{
			id: 'era_1850_ce',
			planet: 'earth',
			yearLabel: { vi: '1850–1868 SCN', en: '1850–1868 CE' },
			title: {
				vi: 'Đền Cổ Kyoto · Tâm Kiếm Bakumatsu',
				en: 'Kyoto Shrines · Bakumatsu Blade'
			},
			subtitle: {
				vi: 'Thời buổi giao thời cuối Mạc phủ nơi thần khí cô đọng trong lưỡi kiếm và chữ Tâm.',
				en: 'Late-Edo upheaval where remnants of divine resonance sleep in steel and spirit.'
			},
			wavelengthNm: 700,
			color: '#ef4444',
			unlockChapter: 4,
			focusLatLng: { lat: 35.01, lng: 135.77 },
			divergenceMicroOffset: 700
		},
		{
			id: 'era_2000_ce',
			planet: 'earth',
			yearLabel: { vi: '1999–2017 SCN', en: '1999–2017 CE' },
			title: {
				vi: 'Rừng Dầu Rái Nam Bộ & Tĩnh Thất Eryndor',
				en: 'Nam Bo Dipterocarp Forest & Eryndor'
			},
			subtitle: {
				vi: 'Đêm mưa thiên thạch rớt xuống rừng già phương Nam và tầng ngầm thí nghiệm cổ ngữ.',
				en: 'The monsoon night of falling shards in southern Vietnam and subterranean Eryndor.'
			},
			wavelengthNm: 530,
			color: '#22c55e',
			unlockChapter: 1,
			focusLatLng: { lat: 11.42, lng: 107.18 },
			divergenceMicroOffset: 530
		},
		{
			id: 'era_2500_ce',
			planet: 'earth',
			yearLabel: { vi: '2485–2515 SCN', en: '2485–2515 CE' },
			title: {
				vi: 'Tầng Đệm Tro Xám · Thế Kỷ XXVI',
				en: 'Ash-Buffer Stratum · 26th Century'
			},
			subtitle: {
				vi: 'Bầu trời mây xám 500 năm của vật lý sóng âm và giao thoa lượng tử.',
				en: 'Five-century overcast horizon of acoustic physics and quantum wave interference.'
			},
			wavelengthNm: 600,
			color: '#f97316',
			unlockChapter: 10,
			focusLatLng: { lat: 39.74, lng: -104.99 },
			divergenceMicroOffset: 600
		}
	]
};

/**
 * Canonical Saga II Regions & Landmarks on *Akunalia*, anchored to the exact
 * coordinates of the procedural tectonic globe (`generate_aaa_planets.py`).
 */
export const AKUNALIA_CANON_NODES: SingularityDef[] = [
	{
		id: -201,
		slug: 'tabaoki-nilanda',
		planet: 'akunalia',
		kind: 'region',
		region: null,
		era: 'ak_imperial',
		lat: 47.5,
		lng: 18.5,
		alt: 0.022,
		terrain: 'alpine-obsidian',
		color: '#38bdf8',
		wavelengthNm: null,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Dãy Tuyết Sơn & Hắc Diện Thạch Tabaoki',
			en: 'Mount Tabaoki Obsidian & Snow Cordillera'
		},
		rumoredName: {
			vi: 'Tuyết Sơn Phương Bắc Akunalia',
			en: 'Northern Cordillera of Akunalia'
		},
		description: {
			vi: 'Sống lưng kiến tạo sừng sững phía Bắc đại lục trung tâm Akunalia với những vách đá hắc diện thạch đen tuyền xuyên thủng băng tuyết vĩnh cửu, nơi khởi nguồn của dòng đại giang Behadona.',
			en: 'Towering northern cordillera of central Akunalia where sheer black obsidian cliffs pierce eternal glaciers and feed the headwaters of the Behadona River.'
		}
	},
	{
		id: -202,
		slug: 'behadona-nilanda',
		planet: 'akunalia',
		kind: 'landmark',
		region: 'tabaoki-nilanda',
		era: 'ak_imperial',
		lat: 28.5,
		lng: 19.5,
		alt: 0.008,
		terrain: 'river-plain',
		color: '#2dd4bf',
		wavelengthNm: null,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Bến Đò Sương Mù Đại Giang Behadona & Đồng Bằng Nilanda',
			en: 'Misty Ferry Crossing of the Behadona River & Nilanda Plains'
		},
		rumoredName: {
			vi: 'Bến Đò Sương Mù Châu Thổ',
			en: 'Misty River-Basin Crossing'
		},
		description: {
			vi: 'Khúc bến đò cổ phủ sương lam lợt nơi dòng đại giang Behadona xanh ngọc băng qua bãi bồi phù sa Nilanda trước khi đổ về Nội Hải Hồ Bán Nguyệt — điểm dừng tĩnh lặng có cổng đá ranh giới sinh tử, lầu đèn sương mù và con đò gỗ của Ông Lái Đò.',
			en: 'Mist-shrouded ancient ferry crossing where the luminous jade Behadona River winds past the fertile alluvial banks of the Nilanda Plains toward the Crescent Moon Sea — anchored by a border stone archway, a lantern pavilion, and the Ferryman’s carved wooden skiff.'
		}
	},
	{
		id: -203,
		slug: 'zyberon-basin',
		planet: 'akunalia',
		kind: 'region',
		region: null,
		era: 'ak_imperial',
		lat: 19.5,
		lng: 24.8,
		alt: 0.012,
		terrain: 'sanctuary',
		color: '#f59e0b',
		wavelengthNm: 580,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Kinh Đô & Đại Đền Ngũ Giác Zyberon',
			en: 'Imperial Capital & Pentagonal Temple of Zyberon'
		},
		rumoredName: {
			vi: 'Đại Đền Ngũ Giác Trung Tâm',
			en: 'Central Pentagonal Sanctuary'
		},
		description: {
			vi: 'Bồn địa hoàng triều rực rỡ sa thạch vàng ban ngày, nhưng khi màn đêm phủ xuống lại lộ rõ mạng mạch ánh sáng đỏ-vàng hội tụ về tòa Đại Đền Ngũ Giác mang cấu trúc chữ Vương (王) ở chính tâm.',
			en: 'Golden sandstone imperial basin by day whose night hemisphere reveals a crimson-gold arterial network converging into the glowing Pentagonal Temple (王).'
		}
	},
	{
		id: -204,
		slug: 'crescent-sea',
		planet: 'akunalia',
		kind: 'region',
		region: null,
		era: 'ak_return',
		lat: 8.2,
		lng: 46.8,
		alt: 0.006,
		terrain: 'abyssal-sea',
		color: '#14b8a6',
		wavelengthNm: 530,
		unlockChapter: 1,
		isSingularity: true,
		name: {
			vi: 'Nội Hải Hồ Bán Nguyệt · Bốn Tầng Kết Giới',
			en: 'Crescent Moon Sea · Four-Layer Ward'
		},
		rumoredName: {
			vi: 'Nội Hải Hình Trăng Khuyết',
			en: 'Crescent-Shaped Inland Sea'
		},
		description: {
			vi: 'Vùng nội hải khổng lồ mang dáng trăng lưỡi liềm phát quang xanh ngọc nhìn rõ từ quỹ đạo vũ trụ, nơi bốn vòng gợn sóng kết giới đồng tâm canh giữ vực thẳm dẫn xuống tầng thế giới ngầm Animal World.',
			en: 'Vast crescent-moon inland sea glowing emerald-turquoise from orbit, where four concentric harmonic ward-rings guard the abyssal passage to Animal World.'
		}
	},
	{
		id: -205,
		slug: 'eldarin-highlands',
		planet: 'akunalia',
		kind: 'region',
		region: null,
		era: 'ak_origin',
		lat: 26.5,
		lng: -80.5,
		alt: 0.016,
		terrain: 'highland-forest',
		color: '#34d399',
		wavelengthNm: 555,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Cao Nguyên Eldarin & Rừng Thần Năng',
			en: 'Eldarin Highlands & Luminous Canopy'
		},
		rumoredName: {
			vi: 'Cao Nguyên Phương Tây',
			en: 'Western Emerald Plateaus'
		},
		description: {
			vi: 'Đại lục phương Tây yên bình với dãy núi sương mù, những dòng suối ngọc trong vắt, rừng cổ thụ xanh lục bảo và mạng mạch Hạt Thần Năng nguyên sơ sáng rực suốt nửa tối hành tinh.',
			en: 'Serene western continent of misty ridges, crystal jade streams, silver-emerald forests, and dense Divine Particle ley-lines illuminating the planetary night.'
		}
	},
	{
		id: -206,
		slug: 'eldarin-sanctuary-village',
		planet: 'akunalia',
		kind: 'landmark',
		region: 'eldarin-highlands',
		era: 'ak_origin',
		lat: 19.5,
		lng: -73.0,
		alt: 0.01,
		terrain: 'village',
		color: '#6ee7b7',
		wavelengthNm: null,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Thánh Thôn Chân Đèo Eldarin & Cổ Thụ Mạch Thần Năng',
			en: 'Sanctuary Village of Lower Eldarin & Lifestream Elder Tree'
		},
		rumoredName: {
			vi: 'Thung Lũng Lửa Ấm Eldarin',
			en: 'Warm Hearth Valley of Eldarin'
		},
		description: {
			vi: 'Thôn nhỏ yên bình nép bên thung lũng suối ngọc phía nam cao nguyên Eldarin — nơi có cầu đá rêu phong, miếu đá mái vòm cuốn cầu nguyện, mái nhà gỗ ấm ánh lửa bếp từng cưu mang Eryndra Lumielle và gốc đại cổ thụ phát quang lam ngọc vươn bộ rễ ôm trọn hồ nước suối thần năng.',
			en: 'Tranquil valley hamlet nestled beside crystal streams in southern Eldarin — featuring a mossy stone arch bridge, a vaulted stone prayer shrine, the warm hearth cottage that sheltered Eryndra Lumielle, and a bioluminescent cyan-jade Elder Tree whose roots cradle a glowing Lifestream spring pool.'
		}
	},
	{
		id: -207,
		slug: 'sky-archipelago',
		planet: 'akunalia',
		kind: 'region',
		region: null,
		era: 'ak_origin',
		lat: 10.8,
		lng: 114.2,
		alt: 0.014,
		terrain: 'archipelago',
		color: '#67e8f9',
		wavelengthNm: 470,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Quần Đảo Thiên Không & Rạn Ngọc Phương Đông',
			en: 'Eastern Sky Archipelago & Jade Atolls'
		},
		rumoredName: {
			vi: 'Vòng Cung Quần Đảo Sương Mây',
			en: 'Cloud-Wrapped Island Arc'
		},
		description: {
			vi: 'Chuỗi quần đảo núi lửa phủ sương mây và rạn san hô xanh ngọc trải dài giữa đại dương phía Đông Akunalia.',
			en: 'Scattered volcanic island clusters and turquoise coral lagoons wreathed in ocean mist across Akunalia’s eastern sea.'
		}
	},
	{
		id: -208,
		slug: 'temple-of-zyberon',
		planet: 'akunalia',
		kind: 'landmark',
		region: 'zyberon-basin',
		era: 'ak_imperial',
		lat: 16.4,
		lng: 27.9,
		alt: 0.013,
		terrain: 'sanctuary',
		color: '#fbbf24',
		wavelengthNm: 580,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Đại Đền Ngũ Giác Zyberon & Hòn Đá Phong Ấn',
			en: 'Pentagonal Temple of Zyberon & The Sealing Stone'
		},
		rumoredName: {
			vi: 'Đại Đền Trung Tâm & Khối Đá Đen',
			en: 'Central Sanctuary & Black Monolith'
		},
		description: {
			vi: 'Quần thể thánh điện năm cạnh bằng sa thạch vàng lợt và đồng cổ rực rỡ giữa kinh đô Akunalia, nơi dòng người hành hương rửa mặt bên giếng cổ, khoác áo choàng đồng phục rồi đặt tay lên Hòn Đá Phong Ấn đen để trút bỏ mọi cơn đau — mà không hay biết tầng ngầm bên dưới đang âm thầm rút cạn sinh khí theo mạng mạch chữ Vương (王).',
			en: 'Monumental pentagonal sanctuary of pale-gold sandstone and antique bronze at the heart of Akunalia’s capital, where pilgrims wash at the ancient well, don uniform robes, and touch the Black Sealing Stone to erase all pain — unaware the subterranean 王 conduits beneath are siphoning their vitality.'
		}
	},
	{
		id: -209,
		slug: 'crescent-ward-altar',
		planet: 'akunalia',
		kind: 'landmark',
		region: 'crescent-sea',
		era: 'ak_return',
		lat: 5.4,
		lng: 49.6,
		alt: 0.006,
		terrain: 'abyssal-sea',
		color: '#14b8a6',
		wavelengthNm: 530,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Đài Phong Ấn Bốn Tầng Nội Hải Hồ Bán Nguyệt',
			en: 'Four-Tiered Ward Altar of the Crescent Moon Sea'
		},
		rumoredName: {
			vi: 'Đài Kết Giới Đáy Biển Ngọc',
			en: 'Emerald Seabed Ward Altar'
		},
		description: {
			vi: 'Đài tế cổ bốn tầng vòng đá đồng tâm chìm giữa lòng Nội Hải Hồ Bán Nguyệt xanh lục bảo — nơi bốn trụ đá trăng khuyết dẫn triều, tấm bia tiên tri hai lớp chữ và trái cầu lõi xoáy phong ấn trấn giữ khe vực thẳm dẫn xuống Thế Giới Linh Thú.',
			en: 'Submerged four-ringed sanctuary at the heart of the emerald Crescent Moon Sea — where four crescent-horn monoliths, a dual-inscribed prophecy stele, and a suspended abyssal vortex core seal the chasm leading down to Animal World.'
		}
	},
	{
		id: -210,
		slug: 'sky-sanctum-spire',
		planet: 'akunalia',
		kind: 'landmark',
		region: 'sky-archipelago',
		era: 'ak_origin',
		lat: 5.4,
		lng: 119.8,
		alt: 0.018,
		terrain: 'archipelago',
		color: '#38bdf8',
		wavelengthNm: 470,
		unlockChapter: 1,
		isSingularity: false,
		name: {
			vi: 'Đảo Bay Tinh Thể & Tháp Phong Lôi Thiên Không',
			en: 'Crystalline Floating Isle & Sky-Tempest Sanctum Spire'
		},
		rumoredName: {
			vi: 'Tháp Thu Lôi Giữa Biển Mây',
			en: 'Cloud-Sea Lightning Spire'
		},
		description: {
			vi: 'Khối đảo đá bazan chóp ngược mọc đầy tinh thể thạch anh lam lơ lửng ngay trên đầm san hô ngọc bích phương Đông — nơi những nhịp cầu vòm nối mây, vòng hỗn thiên nghi đồng cổ và ngọn tháp cẩm thạch thu hội lôi quang Hạt Thần Năng giữa tầng trời.',
			en: 'Levitating inverted-cone basalt isle studded with azure quartz crystals above an eastern turquoise coral lagoon — crowned by cloud-spanning stone archways, a bronze armillary astrolabe, and a storm-harvesting marble spire.'
		}
	}
];

/**
 * Canonical Saga I Singularity Beacons on *Multi-Era Earth*.
 * Rendered with strict `Spoiler-safe Fog of War` based on `read_up_to`.
 */
export const EARTH_SINGULARITIES: SingularityDef[] = [
	{
		id: -101,
		slug: 'singularity-nam-bo-forest',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_2000_ce',
		lat: 11.42,
		lng: 107.18,
		alt: 0.01,
		terrain: 'forest',
		color: '#22c55e',
		wavelengthNm: 530,
		unlockChapter: 1,
		isSingularity: true,
		name: {
			vi: 'Dị Điểm Rừng Dầu Rái Nam Bộ & Suối Đá Sừng (2000 SCN)',
			en: 'Nam Bo Dipterocarp Forest & Hornstone Stream Singularity (2000 CE)'
		},
		rumoredName: {
			vi: 'Dị Điểm Quang Phổ Lục · 530 nm',
			en: 'Green Spectral Singularity · 530 nm'
		},
		description: {
			vi: 'Quần thể rừng già miền Đông Nam Bộ trong đêm mưa lớn năm 2000 — nơi đại thụ dầu rái bạnh rễ cao vút che chở bảy phiến đá sừng bắt ngang con suối cạn, căn nhà sàn gỗ căm xe lợp ngói âm dương rêu phong ấm ánh đèn dầu của ông Chí và cậu bé Pha, cạnh hố đất bazan lưu giữ mảnh thiên thạch Lục 530 nm rớt xuống từ tầng mây.',
			en: 'Primeval dipterocarp sanctuary in eastern Nam Bo on a monsoon night of 2000 CE — where a towering buttress-rooted forest patriarch arches above seven hornstone stepping slabs across a shallow brook, sheltering Uncle Chi and young Pha’s mossy Yin-Yang tile stilt house beside the 530 nm emerald meteorite crater.'
		},
		timeline2Note: {
			vi: 'Điểm hội tụ tần số trung tâm kết nối cả 7 dải quang phổ trên sợi dây Đồng Đạo Liên Tâm.',
			en: 'Central harmonic convergence node balancing all seven spectral wavelengths along the Shared Echo.'
		}
	},
	{
		id: -102,
		slug: 'singularity-eryndor-saqqara',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_2000_ce',
		lat: 29.87,
		lng: 31.22,
		alt: 0.01,
		terrain: 'ruins',
		color: '#c084fc',
		wavelengthNm: null,
		unlockChapter: 2,
		isSingularity: true,
		name: {
			vi: 'Tĩnh Thất Đá Đen Eryndor & Tháp Thiên Văn Cát Cổ Ngữ 𓁹',
			en: 'Eryndor Obsidian Sanctum, Astronomical Spire & Hieroglyphic Sands 𓁹'
		},
		rumoredName: {
			vi: 'Dị Điểm Vô Phản Quang · Bắc Phi',
			en: 'Non-Reflective Veil Singularity · North Africa'
		},
		description: {
			vi: 'Quần thể kiến trúc cắt lớp hai tầng niên đại đồ sộ giữa sa mạc Bắc Phi: tầng trên là sân cột đá chùm búp papyrus sa thạch 3000 TCN vùi nửa mình trong cát vàng, cổng tháp đôi cùng hai cột đá phương tiêm mạ vàng trắng khắc chìm cổ ngữ Đôi Mắt Của Ra (𓁹) và ngọn tháp đồng hồ thiên văn đá đen của Eryndor; tầng ngầm bên dưới là tĩnh thất vòm gân đá đen cất giữ bàn giải mã papyrus và mảnh thiên thạch Vật Đen của Tenka.',
			en: 'Monumental two-era cutaway sanctuary in North Africa: above, a sand-drifted 3000 BCE papyrus-columned sandstone court, a twin-pylon portal flanked by electrum-tipped obelisks incised with The Eye of Ra (𓁹), and Eryndor’s buttressed dark-basalt astronomical clocktower; below, a rib-vaulted obsidian sanctum housing Tenka’s papyrus decoding chamber and light-devouring black-body meteorite shard.'
		},
		timeline2Note: {
			vi: 'Giao điểm đối chiếu giữa khảo cổ hiện đại và kỷ nguyên thần quyền 3000 TCN.',
			en: 'Cross-temporal nexus linking modern excavation chambers with 3000 BCE antiquity.'
		}
	},
	{
		id: -103,
		slug: 'singularity-kyoto-shrine',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_1850_ce',
		lat: 35.01,
		lng: 135.77,
		alt: 0.012,
		terrain: 'shrine',
		color: '#ef4444',
		wavelengthNm: 700,
		unlockChapter: 4,
		isSingularity: true,
		name: {
			vi: 'Tịnh Am Kiếm Đạo Gỗ Cổ, Lầu Chuông Đồng & Gốc Phong Đỏ Bakumatsu (1850 SCN)',
			en: 'Ancient Cypress Sword-Shrine, Bronze Belfry & Bakumatsu Crimson Maple (1850 CE)'
		},
		rumoredName: {
			vi: 'Dị Điểm Quang Phổ Đỏ · 700 nm',
			en: 'Red Spectral Singularity · 700 nm'
		},
		description: {
			vi: 'Quần thể đền cổ và tịnh am kiếm đạo thanh tịnh giữa sương thu cố đô Kyoto năm 1850 — gồm cổng gỗ bách phủ sương muối, máng đá ống trúc thanh tẩy, lầu chuông gỗ treo trái chuông đồng rêu xanh, chính điện gỗ bách năm gian rộng mở lợp mái ngói xám uốn cong vòm hiên, mười bốn thân trúc xanh bên tường đất trắng và đại thụ phong lá đỏ che bóng trên bệ kiếm cộng hưởng mảnh thiên thạch Đỏ 700 nm của Okita.',
			en: 'Classical late-Bakumatsu Kyoto sword-shrine sanctuary in autumn mist (1850 CE) — uniting a frost-weathered Myojin gate, bamboo-fed stone water basin, wooden belfry housing a patinated bronze bell, wide five-bay cypress hall beneath a curved Karahafu-and-Irimoya grey tile roof, fourteen-culm bamboo grove, and an ancient crimson maple arching above Okita’s 700 nm meteorite blade stand.'
		},
		timeline2Note: {
			vi: 'Mạch cộng hưởng giao thoa giữa thế kỷ XIX và dấu ấn đóng băng từ thế kỷ XVI.',
			en: 'Temporal resonance bridging late-Edo Kyoto with a sixteenth-century frozen vow.'
		}
	},
	{
		id: -104,
		slug: 'singularity-ganges-meru',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_300_bce',
		lat: 28.65,
		lng: 81.2,
		alt: 0.022,
		terrain: 'alpine',
		color: '#eab308',
		wavelengthNm: 580,
		unlockChapter: 5,
		isSingularity: true,
		name: {
			vi: 'Xưởng Rèn Thép Wootz Bậc Thềm Sông Hằng & Quần Phong Tuyết Sơn Meru (~300 TCN)',
			en: 'Ganga Ghat Wootz Steel Forge & Mount Meru Sanctuary of the Gods (~300 BCE)'
		},
		rumoredName: {
			vi: 'Dị Điểm Quang Phổ Vàng · 580 nm',
			en: 'Gold Spectral Singularity · 580 nm'
		},
		description: {
			vi: 'Quần thể kiến trúc cắt lớp hùng vĩ năm 300 TCN nối liền chín bậc thềm đá sa thạch, tháp đền ven bến và đôi đình vòm hoa sen bên dòng sông Hằng lung linh đèn hoa đăng phía trước với quần phong tuyết trắng Meru cùng Cung điện các vị thần sừng sững phía sau — ở giữa là xưởng tám cột đá chạm sen lợp mái vòm che bầu lò đất sét trộn trấu kín nhiệt 1.400°C nung nồi đất hình trái bầu lộ thép Wootz vàng kim, chiếc đe sắt đen bóng như đá huyền vũ chôn trên gốc me cổ thụ tự nhiên có hốc rễ giấu hộp sắt chứa mảnh thiên thạch vàng sẫm của ông Kalyan.',
			en: 'Monumental ~300 BCE cutaway uniting nine sandstone river ghat steps, a riverside Nagara temple spire, and twin lotus chhatri pavilions beside lamp-lit Ganga waters with the snow-white peaks and Sanctuary of the Gods atop Mount Meru behind — framing Master Kalyan’s lotus-pillared Chaitya forge, 1,400°C clay-and-rice-husk domed furnace with cracked gourd crucibles exposing golden Wootz steel, and basalt-black iron anvil embedded in a natural tamarind stump concealing the root-hollow iron box of the 580 nm dark-gold meteorite shard.'
		},
		timeline2Note: {
			vi: 'Tọa độ tiếp nhận luồng giao thoa xuyên không-thời gian 500 năm từ đỉnh Olympus.',
			en: 'Target coordinates of a 500-year cross-spacetime harmonic arc from Olympus.'
		}
	},
	{
		id: -105,
		slug: 'singularity-samos-olympus',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_1000_bce',
		lat: 40.09,
		lng: 22.36,
		alt: 0.018,
		terrain: 'alpine',
		color: '#a855f7',
		wavelengthNm: 380,
		unlockChapter: 8,
		isSingularity: true,
		name: {
			vi: 'Đại Điện Đỉnh Mây Olympus & Học Viện Bán Nguyệt Đảo Samos (~800 TCN)',
			en: 'Mount Olympus Pantheon Sanctuary & Samos Semicircular Academy (~800 BCE)'
		},
		rumoredName: {
			vi: 'Dị Điểm Quang Phổ Tím · 380 nm',
			en: 'Violet Spectral Singularity · 380 nm'
		},
		description: {
			vi: 'Quần thể thánh điện cẩm thạch trắng cổ điển vươn lên tầng mây biển Aegea năm 800 TCN — hội tụ Học viện cổ đại vòm cột bán nguyệt trên đảo Samos cùng mặt hồ Suối Tịnh Tâm trong vắt phía trước, mười cột đá rãnh đứng khảm đai vàng nguyệt quế, bệ đá cẩm thạch bốn chim Đại Bàng nâng cụm đá thiên thạch Tím 380 nm ở tâm đàn và Đại điện các vị thần uy nghiêm trên đỉnh núi Olympus phía Bắc.',
			en: 'Classical Parian-marble sanctuary rising above Aegean cloud shelves (~800 BCE) — uniting the semicircular colonnaded academy of Samos and mirror-still Tranquil Mind-Spring below ten fluted rotunda columns, the four-eagle marble altar cradling the 380 nm violet meteorite shard, and the towering Pantheon of the Gods crowning Mount Olympus.'
		},
		timeline2Note: {
			vi: 'Điểm khởi phát cung quỹ đạo xuyên thời không 500 năm hướng thẳng về đỉnh tuyết sơn Meru năm 300 TCN.',
			en: 'Origin anchor of the 500-year cross-spacetime trajectory launched toward Mount Meru (~300 BCE).'
		}
	},
	{
		id: -106,
		slug: 'singularity-dun-scaith',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_1000_bce',
		lat: 57.12,
		lng: -6.02,
		alt: 0.012,
		terrain: 'cliffs',
		color: '#6366f1',
		wavelengthNm: 430,
		unlockChapter: 8,
		isSingularity: true,
		name: {
			vi: 'Pháo Đài Đá Đen Dún Scáith, Cầu Vòm Vực Sóng & Đài Vũ Khí Chàm (~1000 TCN)',
			en: 'Sea-Stack Fortress Dún Scáith, Chasm Drawbridge & 430 nm Indigo Weapon Dais (~1000 BCE)'
		},
		rumoredName: {
			vi: 'Dị Điểm Quang Phổ Chàm · 430 nm',
			en: 'Indigo Spectral Singularity · 430 nm'
		},
		description: {
			vi: 'Quần thể pháo đài đá đen cổ đại Dún Scáith dựng sừng sững trên mỏm đảo đá biển biệt lập trước sóng dữ Bắc Đại Tây Dương năm 1000 TCN — nối liền đất liền bằng nhịp cầu vòm đá và cầu kéo gỗ sồi bắc ngang vực sóng sâu thẳm, bao bọc sân đá rêu luyện võ cùng đài đá xanh chạm xoắn ba vòng dựng đứng Hồng Thương của Scáthach ở trục giữa, chiếc tù và cổ bên trái và bệ đồng bốn chấu nâng mảnh thiên thạch Chàm 430 nm bên phải.',
			en: 'Ancient black-stone sea-stack citadel of Dún Scáith rising above crashing North Atlantic surf (~1000 BCE) — linked across the sea chasm by a masonry arch bridge and timber drawbridge, enclosing a windswept flagstone training yard and the triskele bluestone weapon dais where Scáthach’s Crimson Spear stands upright between a bronze-banded war horn and a four-claw bronze cradle holding the 430 nm indigo meteorite shard.'
		},
		timeline2Note: {
			vi: 'Mạch nhảy không-thời gian nối liền trường rèn luyện 1000 TCN với đài đá đỉnh Olympus 800 TCN.',
			en: 'Temporal bridge linking the 1000 BCE sea-stack training fortress with 800 BCE Mount Olympus.'
		}
	},
	{
		id: -107,
		slug: 'singularity-stonehenge-avalon',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_510_ce',
		lat: 51.18,
		lng: -1.83,
		alt: 0.01,
		terrain: 'megalith',
		color: '#38bdf8',
		wavelengthNm: 470,
		unlockChapter: 9,
		isSingularity: true,
		name: {
			vi: 'Vòng Cự Thạch Đồi Cỏ Stonehenge, Làng Cổ Nhà Tròn & Bệ Pháp Thư Avalon (497–510 SCN)',
			en: 'Hilltop Stonehenge Megalith Ring, Celtic Roundhouse Village & Avalon Grimoire Reliquary (497–510 CE)'
		},
		rumoredName: {
			vi: 'Dị Điểm Quang Phổ Lam · 470 nm',
			en: 'Blue Spectral Singularity · 470 nm'
		},
		description: {
			vi: 'Quần thể vòng cự thạch cổ đại trên đồi cỏ xanh và thánh địa pháp sư Avalon ẩn giữa sương trắng rừng sồi Anh Quốc (497–510 SCN) — dưới chân đồi là ngôi làng cổ thế kỷ V với những nếp nhà tròn mái tranh mộc mạc, bên trên là nền đá tám cạnh đặt đôi bể nước Đá Phản Chiếu, tám trụ đá lam khắc rãnh dẫn sáng, vòng cự thạch cổ trên đỉnh đồi cỏ và bệ rương đá quấn rễ sồi cổ thụ nâng sách phép Grimoire cùng mảnh thiên thạch Lam 470 nm.',
			en: 'Ancient hilltop megalithic circle and Avalon mage sanctum veiled in British oakwood mist (497–510 CE) — uniting a 5th-century foothill village of thatched Celtic roundhouses below twin mirror-water basins, eight Ogham-channeled bluestone monoliths, the hilltop Stonehenge trilithon sanctuary, and an oak-root reliquary dais holding an open arcane Grimoire and the 470 nm azure meteorite shard.'
		},
		timeline2Note: {
			vi: 'Cổng cộng hưởng không gian nối trực tiếp từ rừng sồi Anh Quốc sang đỉnh núi Đạo gia năm 527 SCN.',
			en: 'Spatial resonance gate linking misty British oakwoods directly to eastern mountain peaks in 527 CE.'
		}
	},
	{
		id: -108,
		slug: 'singularity-grey-ash-buffer',
		planet: 'earth',
		kind: 'landmark',
		region: null,
		era: 'era_2500_ce',
		lat: 39.74,
		lng: -104.99,
		alt: 0.015,
		terrain: 'bastion',
		color: '#f97316',
		wavelengthNm: 600,
		unlockChapter: 10,
		isSingularity: true,
		name: {
			vi: 'Tổ Hợp Phòng Thí Nghiệm Laser Khu 9 & Trạm Găng Tay Lõi Âm Thanh (2485 SCN)',
			en: 'Sector-9 Futuristic Laser Laboratory & FFF Sonic-Core Glove Rig (2485 CE)'
		},
		rumoredName: {
			vi: 'Dị Điểm Quang Phổ Cam · 600 nm',
			en: 'Orange Spectral Singularity · 600 nm'
		},
		description: {
			vi: 'Tổ hợp phòng thí nghiệm khoa học tương lai Khu 9 dưới tầng mây tro xám thế kỷ XXVI (2485 SCN) — phía trước cắt mở hầm lọc khí đặt chiếc lồng kính chì, bánh răng đồng xoắn ốc và dàn chuông gió của Axel & Diana; bên trên là nền đài bê tông – hợp kim titan tám cạnh đặt bàn thí nghiệm hai đồng hồ đo nơi bốn trụ laser neon xanh hội tụ tích hợp Lõi Âm Thanh và mảnh thiên thạch Cam 600 nm vào găng tay tác chiến của Unikey, bao quanh bởi sáu vòm parabol chắn sóng âm và trung tâm nghiên cứu mạng lưới tia laser Khu 9.',
			en: 'Futuristic Sector-9 scientific laser laboratory beneath the 26th-century grey-ash cloud buffer (2485 CE) — exposing Axel and Diana’s subterranean air-filtration bunker with its lead-glass containment bell and brass wind-chimes below an octagonal concrete-titanium deck, the twin-gauge laboratory bench where four neon-green laser emitters integrate the Sonic Core and 600 nm orange meteorite shard into Unikey’s tactical glove, six parabolic acoustic-shielding ribs, and the Sector-9 laser grid research complex.'
		},
		timeline2Note: {
			vi: 'Trạm bẻ pha bước sóng 600 nm sang 530 nm ngay khoảnh khắc Nhật Thực để phóng ngược về năm 2017.',
			en: 'Solar-eclipse phase-shift station bending 600 nm into 530 nm to project backward to 2017 CE.'
		}
	}
];

const EARTH_KEYWORDS = [
	'nam bo',
	'dau rai',
	'dipterocarp',
	'viet nam',
	'vietnam',
	'an nam',
	'eryndor',
	'saqqara',
	'ai cap',
	'egypt',
	'nile',
	'kyoto',
	'edo',
	'bakumatsu',
	'nhat ban',
	'japan',
	'musashi',
	'meru',
	'song hang',
	'ganges',
	'an do',
	'india',
	'wootz',
	'dalit',
	'olympus',
	'samos',
	'suoi tinh tam',
	'hy lap',
	'greece',
	'tartarus',
	'dun scaith',
	'scathach',
	'gae bulg',
	'celtic',
	'bac au',
	'stonehenge',
	'avalon',
	'camelot',
	'anh quoc',
	'britain',
	'lao quan',
	'trung hoa',
	'tro xam',
	'ash-buffer',
	'ash buffer',
	'lau dai ky uc',
	'memory palace',
	'neo-babylon',
	'neo babylon',
	'hyperion',
	'chirovan',
	'trai dat',
	'multi-era earth'
];

function foldAscii(input: string | null | undefined): string {
	if (!input) return '';
	return String(input)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'd')
		.toLowerCase()
		.trim();
}

export function pickText(text: LocalizedText, locale: string | null | undefined): string {
	return locale && locale.toLowerCase().startsWith('en') ? text.en : text.vi;
}

/**
 * Determine which narrative planet (`'akunalia'` or `'earth'`) a `WorldNode` belongs to.
 */
export function resolveNodePlanet(
	node: Pick<WorldNode, 'planet' | 'slug' | 'name' | 'region'>
): 'akunalia' | 'earth' {
	const explicit = (node.planet || '').toLowerCase().trim();
	if (explicit === 'earth') return 'earth';
	if (explicit === 'akunalia') return 'akunalia';

	const hay = `${foldAscii(node.slug)} ${foldAscii(node.name)} ${foldAscii(node.region)}`;
	if (EARTH_KEYWORDS.some((kw) => hay.includes(kw))) {
		return 'earth';
	}
	return 'akunalia';
}

/**
 * Resolve the canonical era ID of a `WorldNode` on its planet.
 */
export function resolveNodeEra(
	node: Pick<WorldNode, 'era' | 'slug' | 'name' | 'region' | 'planet'>
): string | null {
	if (node.era && node.era.trim()) return node.era.trim();
	const planet = resolveNodePlanet(node);

	const hay = `${foldAscii(node.slug)} ${foldAscii(node.name)} ${foldAscii(node.region)}`;
	if (planet === 'earth') {
		if (
			hay.includes('saqqara') ||
			hay.includes('3000') ||
			hay.includes('ai cap') ||
			hay.includes('egypt')
		) {
			return 'era_3000_bce';
		}
		if (
			hay.includes('olympus') ||
			hay.includes('samos') ||
			hay.includes('greece') ||
			hay.includes('dun scaith') ||
			hay.includes('celtic')
		) {
			return 'era_1000_bce';
		}
		if (
			hay.includes('meru') ||
			hay.includes('song hang') ||
			hay.includes('ganges') ||
			hay.includes('wootz') ||
			hay.includes('an do') ||
			hay.includes('india')
		) {
			return 'era_300_bce';
		}
		if (
			hay.includes('stonehenge') ||
			hay.includes('avalon') ||
			hay.includes('anh quoc') ||
			hay.includes('britain') ||
			hay.includes('lao quan')
		) {
			return 'era_510_ce';
		}
		if (
			hay.includes('kyoto') ||
			hay.includes('edo') ||
			hay.includes('bakumatsu') ||
			hay.includes('nhat ban') ||
			hay.includes('japan')
		) {
			return 'era_1850_ce';
		}
		if (
			hay.includes('tro xam') ||
			hay.includes('ash-buffer') ||
			hay.includes('ash buffer') ||
			hay.includes('hyperion') ||
			hay.includes('2485') ||
			hay.includes('2500')
		) {
			return 'era_2500_ce';
		}
		if (
			hay.includes('dau rai') ||
			hay.includes('dipterocarp') ||
			hay.includes('nam bo') ||
			hay.includes('vietnam') ||
			hay.includes('eryndor')
		) {
			return 'era_2000_ce';
		}
	}
	return null;
}

/**
 * Spoiler-safe Fog of War state calculator for eras and singularities.
 */
export function computeTemporalRevealState(
	unlockChapter: number,
	effectiveReadUpTo: number | null | undefined
): RevealState {
	const read = Math.max(1, Number(effectiveReadUpTo) || 1);
	if (unlockChapter <= read) return 'revealed';
	if (unlockChapter <= read + 4) return 'rumored';
	return 'hidden';
}

export function isTimeline2Unshielded(effectiveReadUpTo: number | null | undefined): boolean {
	const read = Number(effectiveReadUpTo) || 0;
	return read >= TIMELINE_2_UNLOCK_CHAPTER;
}

/**
 * Format the 6-decimal Nixie-style Temporal Divergence readout (`0.337187%` vs `1.048596%`).
 */
export function formatDivergenceValue(
	timeline: WorldTimeline,
	eraId: string,
	planet: CelestialBodyId,
	effectiveReadUpTo: number | null | undefined
): { value: string; shielded: boolean } {
	const eras = WORLD_ERAS[planet] ?? [];
	const found = eras.find((e) => e.id === eraId);
	const micro = found?.divergenceMicroOffset ?? 187;

	if (timeline === 2) {
		const unshielded = isTimeline2Unshielded(effectiveReadUpTo);
		const frac = String((48596 + micro) % 100000).padStart(5, '0');
		return {
			value: `1.0${frac}%`,
			shielded: !unshielded
		};
	}

	const base = 337000 + (micro % 1000);
	return {
		value: `0.${String(base).padStart(6, '0')}%`,
		shielded: false
	};
}

function materializeDefList(
	defs: SingularityDef[],
	locale: string,
	timeline: WorldTimeline,
	effectiveReadUpTo: number | null | undefined,
	existingSlugs: Set<string>
): Array<WorldNode & { lat: number; lng: number }> {
	const unshieldedT2 = timeline === 2 && isTimeline2Unshielded(effectiveReadUpTo);
	const out: Array<WorldNode & { lat: number; lng: number }> = [];

	for (const s of defs) {
		if (existingSlugs.has(s.slug)) continue;
		const rawState = computeTemporalRevealState(s.unlockChapter, effectiveReadUpTo);
		const state: RevealState = rawState === 'hidden' ? 'rumored' : rawState;
		const unlocked = state === 'revealed';

		const baseDesc = pickText(s.description, locale);
		const t2Note = s.timeline2Note ? pickText(s.timeline2Note, locale) : '';

		out.push({
			id: s.id,
			slug: s.slug,
			name: unlocked ? pickText(s.name, locale) : pickText(s.rumoredName, locale),
			category: 'location',
			kind: s.kind,
			region: s.region,
			lat: s.lat,
			lng: s.lng,
			alt: s.alt,
			terrain: s.terrain,
			scene: 'orbit',
			state,
			v: 3,
			description: unlocked
				? unshieldedT2 && t2Note
					? `${baseDesc}\n\n⚡ ${t2Note}`
					: baseDesc
				: null,
			chapters: [s.unlockChapter],
			palette: [s.color],
			color: s.color,
			planet: s.planet,
			era: s.era,
			wavelength_nm: s.wavelengthNm,
			is_singularity: s.isSingularity
		});
	}

	return out;
}

export function buildAkunaliaCanonNodes(
	locale: string,
	timeline: WorldTimeline,
	effectiveReadUpTo: number | null | undefined,
	existingSlugs: Set<string>
): Array<WorldNode & { lat: number; lng: number }> {
	return materializeDefList(
		AKUNALIA_CANON_NODES,
		locale,
		timeline,
		effectiveReadUpTo,
		existingSlugs
	);
}

export function buildEarthSingularityNodes(
	locale: string,
	timeline: WorldTimeline,
	effectiveReadUpTo: number | null | undefined,
	existingSlugs: Set<string>
): Array<WorldNode & { lat: number; lng: number }> {
	return materializeDefList(
		EARTH_SINGULARITIES,
		locale,
		timeline,
		effectiveReadUpTo,
		existingSlugs
	);
}

/**
 * Filter a list of placed nodes by active celestial body, era scrubber selection,
 * and timeline compatibility. Non-narrative bodies (`sun`, `saturn`, `moon`, etc.)
 * return an empty array cleanly.
 */
export function filterNodesForPlanetAndEra<T extends WorldNode>(
	nodes: T[],
	planet: CelestialBodyId,
	eraId: string,
	timeline: WorldTimeline
): T[] {
	if (planet !== 'akunalia' && planet !== 'earth') {
		return [];
	}

	return nodes.filter((node) => {
		if (resolveNodePlanet(node) !== planet) return false;
		if (node.timeline && node.timeline !== 'both' && node.timeline !== timeline) {
			return false;
		}
		if (eraId && eraId !== 'all') {
			const nodeEra = resolveNodeEra(node);
			if (
				node.slug === 'singularity-eryndor-saqqara' &&
				(eraId === 'era_3000_bce' || eraId === 'era_2000_ce')
			) {
				return true;
			}
			if (nodeEra && nodeEra !== eraId) return false;
		}
		return true;
	});
}

const CANON_COORD_MATCHERS: Array<{
	keywords: string[];
	def: SingularityDef;
	nonRegionOnly?: boolean;
	regionOnly?: boolean;
	coordsOnly?: boolean;
}> = [
	{
		keywords: ['tabaoki', 'dong bang nilanda', 'son mach tabaoki'],
		def: AKUNALIA_CANON_NODES[0],
		regionOnly: true
	},
	{
		keywords: [
			'behadona-nilanda',
			'ben do',
			'ferry crossing',
			'ong lai do',
			'ferryman',
			'suong mu behadona',
			'ben nuoc behadona'
		],
		def: AKUNALIA_CANON_NODES[1],
		nonRegionOnly: true
	},
	{ keywords: ['tabaoki', 'nilanda', 'behadona'], def: AKUNALIA_CANON_NODES[0] },
	{
		keywords: ['bon dia zyberon', 'kinh do zyberon', 'zyberon-basin'],
		def: AKUNALIA_CANON_NODES[2],
		regionOnly: true
	},
	{
		keywords: [
			'temple-of-zyberon',
			'hon da phong an',
			'sealing stone',
			'dai den ngu giac',
			'dai den zyberon',
			'den tho zyberon',
			'den ngu giac'
		],
		def: AKUNALIA_CANON_NODES[7],
		nonRegionOnly: true
	},
	{ keywords: ['zyberon', 'ngu giac'], def: AKUNALIA_CANON_NODES[2] },
	{
		keywords: ['noi hai', 'ho ban nguyet', 'crescent-sea', 'crescent moon sea'],
		def: AKUNALIA_CANON_NODES[3],
		regionOnly: true
	},
	{
		keywords: [
			'crescent-ward-altar',
			'dai phong an',
			'ward altar',
			'dai ket gioi',
			'bia tien tri',
			'bon tang ket gioi'
		],
		def: AKUNALIA_CANON_NODES[8],
		nonRegionOnly: true
	},
	{ keywords: ['ho ban nguyet', 'crescent moon', 'crescent-sea', 'ban nguyet'], def: AKUNALIA_CANON_NODES[3] },
	{
		keywords: ['cao nguyen eldarin', 'rung than nang', 'eldarin-highlands'],
		def: AKUNALIA_CANON_NODES[4],
		regionOnly: true
	},
	{
		keywords: [
			'eldarin-sanctuary',
			'thanh thon',
			'sanctuary village',
			'co thu mach than nang',
			'thon chan deo eldarin'
		],
		def: AKUNALIA_CANON_NODES[5],
		nonRegionOnly: true
	},
	{ keywords: ['eldarin'], def: AKUNALIA_CANON_NODES[4] },
	{
		keywords: ['quan dao thien khong', 'sky-archipelago', 'sky archipelago', 'ran ngoc phuong dong'],
		def: AKUNALIA_CANON_NODES[6],
		regionOnly: true
	},
	{
		keywords: [
			'sky-sanctum-spire',
			'dao bay tinh the',
			'dao bay thien khong',
			'crystalline floating isle',
			'thap phong loi',
			'thap thu loi',
			'hon thien nghi',
			'astrolabe'
		],
		def: AKUNALIA_CANON_NODES[9],
		nonRegionOnly: true
	},
	{ keywords: ['thien khong', 'sky-archipelago', 'sky archipelago', 'ran ngoc', 'dao bay'], def: AKUNALIA_CANON_NODES[6] },
	{
		keywords: [
			'singularity-nam-bo-forest',
			'rung dau rai',
			'dau rai',
			'dipterocarp',
			'choi ong chi'
		],
		def: EARTH_SINGULARITIES[0],
		nonRegionOnly: true
	},
	{ keywords: ['nam bo'], def: EARTH_SINGULARITIES[0], coordsOnly: true },
	{
		keywords: [
			'singularity-eryndor-saqqara',
			'tinh that eryndor',
			'tinh that da den',
			'eryndor sanctum',
			'eryndor obsidian',
			'thap dong ho eryndor',
			'eryndor'
		],
		def: EARTH_SINGULARITIES[1],
		nonRegionOnly: true
	},
	{ keywords: ['saqqara'], def: EARTH_SINGULARITIES[1], coordsOnly: true },
	{
		keywords: [
			'singularity-kyoto-shrine',
			'den co kyoto',
			'tinh am kiem dao',
			'kyoto shrine',
			'goc phong do',
			'bakumatsu'
		],
		def: EARTH_SINGULARITIES[2],
		nonRegionOnly: true
	},
	{ keywords: ['kyoto', 'musashi'], def: EARTH_SINGULARITIES[2], coordsOnly: true },
	{
		keywords: [
			'singularity-ganges-meru',
			'thep wootz',
			'wootz',
			'xuong ren',
			'kalyan',
			'dinh meru',
			'luu vuc song hang',
			'mount meru'
		],
		def: EARTH_SINGULARITIES[3],
		nonRegionOnly: true
	},
	{ keywords: ['meru', 'song hang', 'ganges'], def: EARTH_SINGULARITIES[3], coordsOnly: true },
	{
		keywords: [
			'singularity-samos-olympus',
			'dinh may olympus',
			'dinh olympus',
			'mount olympus',
			'dai da cot co',
			'suoi tinh tam',
			'cung bac olympus'
		],
		def: EARTH_SINGULARITIES[4],
		nonRegionOnly: true
	},
	{ keywords: ['olympus', 'samos'], def: EARTH_SINGULARITIES[4], coordsOnly: true },
	{
		keywords: [
			'singularity-dun-scaith',
			'dun scaith',
			'dun-scaith',
			'phao dai dun scaith',
			'dai thuong loi dinh',
			'gae bulg'
		],
		def: EARTH_SINGULARITIES[5],
		nonRegionOnly: true
	},
	{ keywords: ['celtic', 'bac au'], def: EARTH_SINGULARITIES[5], coordsOnly: true },
	{
		keywords: [
			'singularity-stonehenge-avalon',
			'vong dan da',
			'dan da co rung soi',
			'dan da bat giac',
			'cong khong gian stonehenge',
			'bluestone sanctuary',
			'ham nguyen duong fenrys'
		],
		def: EARTH_SINGULARITIES[6],
		nonRegionOnly: true
	},
	{ keywords: ['stonehenge', 'avalon', 'camelot'], def: EARTH_SINGULARITIES[6], coordsOnly: true },
	{
		keywords: [
			'singularity-grey-ash-buffer',
			'thanh luy cong huong am',
			'lau dai ky uc',
			'memory palace',
			'quantum-acoustic bastion',
			'ham loc khi khu 9',
			'ham loc khi tang 9',
			'tang dem tro xam'
		],
		def: EARTH_SINGULARITIES[7],
		nonRegionOnly: true
	},
	{
		keywords: ['tro xam', 'ash-buffer', 'ash buffer', 'neo-babylon', 'neo babylon', 'hyperion'],
		def: EARTH_SINGULARITIES[7],
		coordsOnly: true
	}
];

/**
 * Snap live DB nodes that match canonical Akunalia/Earth landmarks onto their exact
 * procedural terrain coordinates while preserving any custom `parts`, `intro_video_url`,
 * or `preview_gallery` synced from the Ecosystem Studio App.
 */
export function alignNodeWithCanonCoordinates<T extends WorldNode>(
	node: T,
	_locale: string = 'vi'
): T {
	const hasCuratedCoords =
		node.lat !== null &&
		node.lng !== null &&
		Number.isFinite(node.lat) &&
		node.lng !== undefined &&
		Number.isFinite(node.lng) &&
		!node.estimated_coords;

	const slugFold = foldAscii(node.slug);
	const hay = `${slugFold} ${foldAscii(node.name)}`;
	const isRegion = node.kind === 'region';

	const exactSlugDef =
		AKUNALIA_CANON_NODES.find((d) => d.slug === node.slug) ??
		EARTH_SINGULARITIES.find((d) => d.slug === node.slug);

	const matchedEntry = exactSlugDef
		? { def: exactSlugDef, coordsOnly: false }
		: CANON_COORD_MATCHERS.find((m) => {
				if (m.nonRegionOnly && isRegion) return false;
				if (m.regionOnly && !isRegion) return false;
				return m.keywords.some((kw) => hay.includes(kw));
			});

	if (!matchedEntry) return node;
	const exactDef = matchedEntry.def;
	const snapCoords = Boolean(exactSlugDef) || !hasCuratedCoords;

	return {
		...node,
		lat: snapCoords ? exactDef.lat : node.lat,
		lng: snapCoords ? exactDef.lng : node.lng,
		alt: node.alt || exactDef.alt,
		planet: node.planet || exactDef.planet,
		era: node.era || exactDef.era,
		terrain: node.terrain || exactDef.terrain,
		color: node.color || exactDef.color,
		...(node.parts && node.parts.length > 0 ? { parts: node.parts } : {}),
		estimated_coords: snapCoords ? false : node.estimated_coords
	};
}

/**
 * Canonical protagonists available for `/world/journey/[id]` 3D path visualization
 * when the local/standalone database has not yet synced character library rows.
 */
export function buildCanonCharacters(locale: string | null | undefined): WorldNode[] {
	const isEn = Boolean(locale && locale.toLowerCase().startsWith('en'));
	return [
		{
			id: -301,
			slug: 'hokabe-pha',
			name: 'Hokabe Pha',
			category: 'main_character',
			kind: 'character',
			region: null,
			lat: 11.42,
			lng: 107.18,
			alt: 0.01,
			terrain: 'forest',
			scene: 'orbit',
			state: 'revealed',
			v: 1,
			planet: 'earth',
			era: 'era_2000_ce',
			color: '#22c55e',
			chapters: [1, 3, 7],
			description: isEn
				? 'Bearer of the central 530 nm green wavelength, raised beside the rain-drenched dipterocarp canopy of southern Vietnam.'
				: 'Cậu bé lớn lên nơi xóm nghèo ven rừng dầu rái miền Đông Nam Bộ, mang tần số trung tâm 530 nm kết nối sợi dây Đồng Đạo Liên Tâm.'
		},
		{
			id: -302,
			slug: 'darkin-tenka',
			name: 'Darkin Tenka',
			category: 'main_character',
			kind: 'character',
			region: null,
			lat: 29.87,
			lng: 31.22,
			alt: 0.014,
			terrain: 'citadel',
			scene: 'orbit',
			state: 'revealed',
			v: 1,
			planet: 'earth',
			era: 'era_2000_ce',
			color: '#a855f7',
			chapters: [2, 4, 6],
			description: isEn
				? 'Silent survivor beneath the stone sanctums of Eryndor, decoding ancient hieroglyphs in the non-reflective blind spot.'
				: 'Đứa trẻ trầm lặng dưới mái đá Eryndor, âm thầm giải mã chữ tượng hình cổ trong vùng khuất vô phản quang.'
		}
	];
}

function resolveCanonicalAkunaliaRegionSlug(
	slug: string | null | undefined,
	regionNameHint?: string | null
): string | null {
	const trimmed = (slug ?? '').trim();
	if (AKUNALIA_CANON_NODES.some((d) => d.kind === 'region' && d.slug === trimmed)) {
		return trimmed;
	}
	if (
		AKUNALIA_CANON_NODES.some((d) => d.kind !== 'region' && d.slug === trimmed) ||
		EARTH_SINGULARITIES.some((d) => d.slug === trimmed)
	) {
		return null;
	}
	const hay = `${foldAscii(trimmed)} ${foldAscii(regionNameHint)}`;
	if (!hay.trim()) return null;
	const firstMatch = CANON_COORD_MATCHERS.find((m) => m.keywords.some((kw) => hay.includes(kw)));
	if (!firstMatch || firstMatch.def.kind !== 'region' || firstMatch.def.planet !== 'akunalia') {
		return null;
	}
	return firstMatch.def.slug;
}

export function resolveCanonRegionDetail(
	slug: string,
	locale: string | null | undefined,
	regionNameHint?: string | null
): RegionDetail | null {
	const lang = locale ?? 'vi';
	const canonSlug = resolveCanonicalAkunaliaRegionSlug(slug, regionNameHint);
	if (!canonSlug) return null;
	const akNodes = buildAkunaliaCanonNodes(lang, 1, 1, new Set());
	const region = akNodes.find((n) => n.kind === 'region' && n.slug === canonSlug);
	if (!region) return null;
	const places = akNodes.filter((n) => n.kind !== 'region' && n.region === canonSlug);
	return {
		region,
		places,
		visitors: []
	};
}

/**
 * Align a live backend `RegionDetail` with canonical coordinates/models and merge any
 * canonical landmarks (e.g. `temple-of-zyberon` inside `zyberon-basin`, or Vietnamese
 * Co-Writer DB region slugs like `noi-hai-ho-ban-nguyet` -> `crescent-ward-altar`) not yet in DB.
 */
export function mergeRegionDetailWithCanon(
	detail: RegionDetail,
	slug: string,
	locale: string | null | undefined
): RegionDetail {
	const lang = locale ?? 'vi';
	const alignedRegion = alignNodeWithCanonCoordinates(detail.region, lang);
	const alignedPlaces = detail.places.map((p) => alignNodeWithCanonCoordinates(p, lang));
	const canon = resolveCanonRegionDetail(
		slug || alignedRegion.slug,
		lang,
		alignedRegion.name ?? detail.region.name
	);
	if (!canon) {
		return {
			...detail,
			region: alignedRegion,
			places: alignedPlaces
		};
	}
	const targetRegionSlug = alignedRegion.slug || canon.region.slug;
	const seenSlugs = new Set(alignedPlaces.map((p) => p.slug));
	const seenModels = new Set(alignedPlaces.map((p) => p.model).filter(Boolean));
	const extraCanonPlaces = canon.places
		.filter((cp) => !seenSlugs.has(cp.slug) && (!cp.model || !seenModels.has(cp.model)))
		.map((cp) => ({ ...cp, region: targetRegionSlug }));
	return {
		...detail,
		region: alignedRegion,
		places: [...alignedPlaces, ...extraCanonPlaces]
	};
}

export function resolveCanonLocationDetail(
	slug: string,
	locale: string | null | undefined
): LocationDetail | null {
	const trimmed = (slug ?? '').trim();
	if (!trimmed || AKUNALIA_CANON_NODES.some((d) => d.kind === 'region' && d.slug === trimmed)) {
		return null;
	}
	const lang = locale ?? 'vi';
	const isEn = lang.toLowerCase().startsWith('en');
	const slugFold = foldAscii(trimmed);
	const matchedDef =
		AKUNALIA_CANON_NODES.find((d) => d.kind !== 'region' && d.slug === trimmed) ??
		EARTH_SINGULARITIES.find((d) => d.slug === trimmed) ??
		CANON_COORD_MATCHERS.find(
			(m) => !m.coordsOnly && m.def.kind !== 'region' && m.keywords.some((kw) => slugFold.includes(kw))
		)?.def;

	const readLevel = Math.max(1, matchedDef?.unlockChapter ?? 1);
	const akNodes = buildAkunaliaCanonNodes(lang, 1, readLevel, new Set());
	const earthNodes = buildEarthSingularityNodes(lang, 1, readLevel, new Set());
	const allPlaces = [...akNodes, ...earthNodes];
	const targetSlug = matchedDef?.slug ?? trimmed;
	const place = allPlaces.find(
		(n) => n.kind !== 'region' && n.slug === targetSlug && n.state !== 'hidden'
	);
	if (!place) return null;

	const region = place.region
		? (akNodes.find((r) => r.kind === 'region' && r.slug === place.region) ?? null)
		: null;
	const neighbours = place.region
		? akNodes.filter(
				(n) => n.kind !== 'region' && n.region === place.region && n.slug !== place.slug
			)
		: [];

	return {
		place,
		region,
		neighbours,
		chapters: (place.chapters ?? []).map((ch) => ({
			chapter_number: ch,
			chapter_id: ch,
			title: isEn ? `Chapter ${ch}` : `Chương ${ch}`,
			role: 'setting',
			locked: false
		})),
		visitors: []
	};
}

export function resolveCanonJourneyDetail(
	characterId: number,
	locale: string | null | undefined
): Journey | null {
	const lang = locale ?? 'vi';
	const isEn = lang.toLowerCase().startsWith('en');
	const chars = buildCanonCharacters(lang);
	const character = chars.find((c) => c.id === characterId);
	if (!character) return null;

	const earthNodes = buildEarthSingularityNodes(lang, 1, 2, new Set());
	const namBo = earthNodes.find((n) => n.slug === 'singularity-nam-bo-forest');
	const eryndor = earthNodes.find((n) => n.slug === 'singularity-eryndor-saqqara');

	if (characterId === -301 && namBo) {
		return {
			character,
			read_up_to: 3,
			stops: [
				{
					chapter_number: 1,
					chapter_id: 1,
					chapter_title: isEn
						? 'Chapter 1 · Rain Over the Dipterocarp Canopy'
						: 'Chương 1 · Mưa Đêm Rừng Dầu Rái',
					role: 'protagonist',
					places: [namBo],
					acquired: [],
					locked: false
				},
				{
					chapter_number: 3,
					chapter_id: 3,
					chapter_title: isEn
						? 'Chapter 3 · Warmth of the Forest Hamlet'
						: 'Chương 3 · Khói Bếp Xóm Ven Rừng',
					role: 'protagonist',
					places: [
						{
							...namBo,
							id: -191,
							slug: 'nam-bo-hamlet',
							name: isEn ? 'Eastern Forest Edge Hamlet' : 'Xóm Nhỏ Ven Rừng Miền Đông',
							lat: 10.96,
							lng: 106.92
						}
					],
					acquired: [],
					locked: false
				},
				{
					chapter_number: 7,
					chapter_id: 7,
					chapter_title: null,
					role: 'protagonist',
					places: [],
					acquired: [],
					locked: true
				}
			]
		};
	}

	if (characterId === -302 && eryndor) {
		return {
			character,
			read_up_to: 2,
			stops: [
				{
					chapter_number: 2,
					chapter_id: 2,
					chapter_title: isEn
						? 'Chapter 2 · Cold Stone Beneath Eryndor'
						: 'Chương 2 · Mái Đá Lạnh Eryndor',
					role: 'protagonist',
					places: [eryndor],
					acquired: [],
					locked: false
				},
				{
					chapter_number: 4,
					chapter_id: 4,
					chapter_title: null,
					role: 'protagonist',
					places: [],
					acquired: [],
					locked: true
				}
			]
		};
	}

	return null;
}


