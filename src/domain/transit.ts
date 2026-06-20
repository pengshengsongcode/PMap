import type {
  BusLineDetail,
  BusLineSummary,
  LngLatTuple,
  StationCandidate,
  ViaStop,
} from '../types/transit';

const NON_GROUND_BUS_KEYWORDS = ['地铁', '轻轨', '磁悬浮', '轮渡', '索道', '机场线'];

const DEFAULT_LINE_COLORS = [
  '#0f766e',
  '#2563eb',
  '#c2410c',
  '#7c3aed',
  '#be123c',
  '#047857',
  '#b45309',
  '#4338ca',
];

type LooseRecord = Record<string, unknown>;

export function isGroundBusType(type = ''): boolean {
  return !NON_GROUND_BUS_KEYWORDS.some((keyword) => type.includes(keyword));
}

export function toLngLatTuple(value: unknown): LngLatTuple | null {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 2) {
    return toFiniteTuple(value[0], value[1]);
  }

  if (typeof value === 'string') {
    const [lng, lat] = value.split(',');
    return toFiniteTuple(lng, lat);
  }

  if (typeof value === 'object') {
    const record = value as LooseRecord;
    const lng = typeof record.getLng === 'function' ? record.getLng() : record.lng ?? record.longitude;
    const lat = typeof record.getLat === 'function' ? record.getLat() : record.lat ?? record.latitude;
    return toFiniteTuple(lng, lat);
  }

  return null;
}

export function parsePath(value: unknown): LngLatTuple[] {
  if (!value) return [];

  if (typeof value === 'string') {
    return value
      .split(';')
      .map((item) => toLngLatTuple(item))
      .filter((item): item is LngLatTuple => Boolean(item));
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toLngLatTuple(item))
      .filter((item): item is LngLatTuple => Boolean(item));
  }

  return [];
}

export function normalizeBusLineSummary(raw: unknown): BusLineSummary {
  const record = asRecord(raw);
  return {
    id: readString(record.id),
    name: readString(record.name),
    startStop: readString(record.start_stop ?? record.startStop),
    endStop: readString(record.end_stop ?? record.endStop),
    location: toLngLatTuple(record.location),
  };
}

export function normalizeStation(raw: unknown): StationCandidate {
  const record = asRecord(raw);
  const rawBusLines = Array.isArray(record.buslines) ? record.buslines : [];
  const buslines = dedupeBusLines(rawBusLines.map(normalizeBusLineSummary)).filter((line) =>
    isGroundBusType(line.name),
  );

  return {
    id: readString(record.id),
    name: readString(record.name),
    location: toLngLatTuple(record.location),
    adcode: readString(record.adcode),
    citycode: readString(record.citycode),
    buslines,
  };
}

export function normalizeStationsFromResult(result: unknown): StationCandidate[] {
  const record = asRecord(result);
  const stationInfo = record.stationInfo ?? record.busstops ?? [];
  const stations = Array.isArray(stationInfo) ? stationInfo : [];
  return stations
    .map(normalizeStation)
    .filter((station) => station.name && station.buslines.length > 0)
    .sort(compareStationCandidatePriority);
}

export function readPoisFromResult(result: unknown): unknown[] {
  const record = asRecord(result);
  const poiList = asRecord(record.poiList);
  const pois = poiList.pois ?? record.pois ?? [];
  return Array.isArray(pois) ? pois : [];
}

export function normalizePoiAsStation(raw: unknown): StationCandidate {
  const record = asRecord(raw);
  return {
    id: readString(record.id),
    name: readString(record.name),
    location: toLngLatTuple(record.location),
    adcode: readString(record.adcode),
    citycode: readString(record.citycode),
    buslines: [],
  };
}

export function normalizeLineDetail(raw: unknown, fallback?: BusLineSummary): BusLineDetail {
  const record = asRecord(raw);
  const path = parsePath(record.path ?? record.polyline);
  const viaStops = normalizeViaStops(record.via_stops ?? record.busstops);
  const basicPrice = readString(record.basic_price);
  const totalPrice = readString(record.total_price);
  const name = readString(record.name) || fallback?.name || '';
  const id = readString(record.id) || fallback?.id || lineKey(fallback);
  const type = readString(record.type);

  return {
    id,
    name,
    type,
    path,
    viaStops,
    startTime: readString(record.stime ?? record.start_time),
    endTime: readString(record.etime ?? record.end_time),
    price: totalPrice || basicPrice,
    color: normalizeLineColor(readString(record.uicolor), id || name),
    startStop: readString(record.start_stop ?? record.startStop) || fallback?.startStop || '',
    endStop: readString(record.end_stop ?? record.endStop) || fallback?.endStop || '',
  };
}

export function chooseBestLineInfo(rawLineInfo: unknown[], summary: BusLineSummary): unknown | null {
  if (rawLineInfo.length === 0) return null;
  const byId = rawLineInfo.find((item) => readString(asRecord(item).id) === summary.id);
  if (byId) return byId;

  const summaryBaseName = baseLineName(summary.name);
  const byName = rawLineInfo.find((item) => baseLineName(readString(asRecord(item).name)) === summaryBaseName);
  if (byName) return byName;

  return rawLineInfo[0];
}

export function readLineInfosFromResult(result: unknown): unknown[] {
  const record = asRecord(result);
  const lineInfo = record.lineInfo ?? record.LineInfo ?? record.buslines ?? [];
  return Array.isArray(lineInfo) ? lineInfo : [];
}

export function lineKey(line: Pick<BusLineSummary, 'id' | 'name' | 'startStop' | 'endStop'> | undefined): string {
  if (!line) return '';
  return line.id || `${line.name}-${line.startStop}-${line.endStop}`;
}

export function describeAmapFailure(status: string, result: unknown): string {
  if (status === 'no_data') return '没有查到相关结果';
  const record = asRecord(result);
  const message = readString(record.info ?? record.message);
  return message || '高德服务暂时不可用';
}

export function baseLineName(name: string): string {
  return name.replace(/[（(].*$/, '').trim();
}

export function dedupeBusLines(lines: BusLineSummary[]): BusLineSummary[] {
  const seen = new Set<string>();
  const result: BusLineSummary[] = [];

  for (const line of lines) {
    const key = lineKey(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }

  return result;
}

export function formatLineDirection(line: Pick<BusLineSummary, 'startStop' | 'endStop'>): string {
  if (!line.startStop && !line.endStop) return '方向待确认';
  if (!line.startStop) return `开往 ${line.endStop}`;
  if (!line.endStop) return `始发 ${line.startStop}`;
  return `${line.startStop} → ${line.endStop}`;
}

export function sortStationsByDistance(stations: StationCandidate[], origin: LngLatTuple): StationCandidate[] {
  return stations
    .filter((station) => station.location)
    .map((station) => ({
      ...station,
      distanceMeters: distanceInMeters(origin, station.location as LngLatTuple),
    }))
    .sort((a, b) => (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY));
}

export function distanceInMeters(from: LngLatTuple, to: LngLatTuple): number {
  const earthRadiusMeters = 6371008.8;
  const fromLat = toRadians(from[1]);
  const toLat = toRadians(to[1]);
  const deltaLat = toRadians(to[1] - from[1]);
  const deltaLng = toRadians(to[0] - from[0]);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function dedupeStations(stations: StationCandidate[]): StationCandidate[] {
  const seen = new Set<string>();
  const result: StationCandidate[] = [];

  for (const station of stations) {
    const key = station.id || `${station.name}-${station.location?.join(',')}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(station);
  }

  return result;
}

function compareStationCandidatePriority(a: StationCandidate, b: StationCandidate): number {
  return stationCandidateScore(b) - stationCandidateScore(a);
}

function stationCandidateScore(station: StationCandidate): number {
  let score = station.buslines.length;
  if (station.name.includes('公交站')) score += 1000;
  if (station.name.includes('枢纽')) score += 300;
  if (station.name.includes('地铁站') && !station.name.includes('公交站')) score -= 500;
  return score;
}

function normalizeViaStops(value: unknown): ViaStop[] {
  const stops = Array.isArray(value) ? value : [];
  return stops.map((item, index) => {
    const record = asRecord(item);
    return {
      id: readString(record.id),
      name: readString(record.name),
      location: toLngLatTuple(record.location),
      sequence: toNullableNumber(record.sequence) ?? index + 1,
    };
  });
}

function normalizeLineColor(rawColor: string, seed: string): string {
  if (/^#[0-9a-f]{6}$/i.test(rawColor)) return rawColor;
  const color = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return DEFAULT_LINE_COLORS[stableHash(seed) % DEFAULT_LINE_COLORS.length];
}

function stableHash(value: string): number {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toFiniteTuple(lng: unknown, lat: unknown): LngLatTuple | null {
  const lngNumber = Number(lng);
  const latNumber = Number(lat);
  if (!Number.isFinite(lngNumber) || !Number.isFinite(latNumber)) return null;
  return [lngNumber, latNumber];
}

function toNullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' ? (value as LooseRecord) : {};
}
