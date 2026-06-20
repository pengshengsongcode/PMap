import {
  chooseBestLineInfo,
  describeAmapFailure,
  dedupeStations,
  isGroundBusType,
  lineKey,
  normalizeLineDetail,
  normalizePoiAsStation,
  normalizeStationsFromResult,
  readPoisFromResult,
  readLineInfosFromResult,
  sortStationsByDistance,
} from '../domain/transit';
import type { AmapGlobal, AmapLineSearch, AmapPlaceSearch, AmapStationSearch } from '../types/amap';
import type { BusLineDetail, BusLineSummary, LngLatTuple, StationCandidate } from '../types/transit';

export interface TransitSearchService {
  searchStations(keyword: string): Promise<StationCandidate[]>;
  searchNearbyStations(center: LngLatTuple, radiusMeters?: number): Promise<StationCandidate[]>;
  getLineDetail(summary: BusLineSummary): Promise<BusLineDetail>;
  getCachedLineDetail(summary: BusLineSummary): BusLineDetail | undefined;
}

export function createAmapTransitService(amap: AmapGlobal, city: string): TransitSearchService {
  const cityOptions = city ? { city } : {};
  const stationSearch = new amap.StationSearch({
    pageIndex: 1,
    pageSize: 50,
    ...cityOptions,
  });

  const lineSearch = new amap.LineSearch({
    pageIndex: 1,
    pageSize: 20,
    extensions: 'all',
    ...cityOptions,
  });

  const placeSearch = new amap.PlaceSearch({
    pageIndex: 1,
    pageSize: 20,
    type: '公交车站',
    ...cityOptions,
  });

  const lineCache = new Map<string, BusLineDetail>();

  return {
    searchStations(keyword) {
      return runStationSearch(stationSearch, keyword);
    },

    async searchNearbyStations(center, radiusMeters = 1200) {
      const stationsFromStationSearch = await runNearbyStationSearch(stationSearch, center, radiusMeters).catch(() => []);
      if (stationsFromStationSearch.length > 0) {
        return sortStationsByDistance(stationsFromStationSearch, center);
      }

      const stationsFromPois = await runNearbyPoiStationSearch(placeSearch, stationSearch, center, radiusMeters);
      return sortStationsByDistance(stationsFromPois, center);
    },

    async getLineDetail(summary) {
      const cacheKey = lineKey(summary);
      const cached = lineCache.get(cacheKey);
      if (cached) return cached;

      const detail = await resolveLineDetail(lineSearch, summary);
      if (!isGroundBusType(detail.type || detail.name)) {
        throw new NonGroundBusLineError(detail.name || summary.name);
      }

      lineCache.set(cacheKey, detail);
      return detail;
    },

    getCachedLineDetail(summary) {
      return lineCache.get(lineKey(summary));
    },
  };
}

function runStationSearch(
  stationSearch: AmapStationSearch,
  keyword: string,
): Promise<StationCandidate[]> {
  return new Promise((resolve, reject) => {
    stationSearch.search(keyword, (status, result) => {
      if (status === 'complete') {
        resolve(normalizeStationsFromResult(result));
        return;
      }
      if (status === 'no_data') {
        resolve([]);
        return;
      }
      reject(new Error(describeAmapFailure(status, result)));
    });
  });
}

function runNearbyStationSearch(
  stationSearch: AmapStationSearch,
  center: LngLatTuple,
  radiusMeters: number,
): Promise<StationCandidate[]> {
  if (!stationSearch.searchNearBy) return Promise.resolve([]);

  return new Promise((resolve, reject) => {
    stationSearch.searchNearBy?.('', center, radiusMeters, (status, result) => {
      if (status === 'complete') {
        resolve(normalizeStationsFromResult(result));
        return;
      }
      if (status === 'no_data') {
        resolve([]);
        return;
      }
      reject(new Error(describeAmapFailure(status, result)));
    });
  });
}

async function runNearbyPoiStationSearch(
  placeSearch: AmapPlaceSearch,
  stationSearch: AmapStationSearch,
  center: LngLatTuple,
  radiusMeters: number,
): Promise<StationCandidate[]> {
  const pois = await new Promise<StationCandidate[]>((resolve, reject) => {
    placeSearch.searchNearBy('公交站', center, radiusMeters, (status, result) => {
      if (status === 'complete') {
        resolve(readPoisFromResult(result).map(normalizePoiAsStation).filter((station) => station.name));
        return;
      }
      if (status === 'no_data') {
        resolve([]);
        return;
      }
      reject(new Error(describeAmapFailure(status, result)));
    });
  });

  const resolvedStations: StationCandidate[] = [];
  for (const poi of sortStationsByDistance(pois, center).slice(0, 8)) {
    const stations = await runStationSearch(stationSearch, poi.name);
    resolvedStations.push(...stations);
  }

  const detailedStations = dedupeStations(resolvedStations);
  return detailedStations.length > 0 ? detailedStations : dedupeStations(pois);
}

export class NonGroundBusLineError extends Error {
  constructor(lineName: string) {
    super(`${lineName || '该线路'} 不是地面公交线路`);
    this.name = 'NonGroundBusLineError';
  }
}

async function resolveLineDetail(
  lineSearch: AmapLineSearch,
  summary: BusLineSummary,
): Promise<BusLineDetail> {
  if (summary.id && typeof lineSearch.searchById === 'function') {
    try {
      return await runLineSearch(lineSearch, summary, 'id');
    } catch {
      return runLineSearch(lineSearch, summary, 'keyword');
    }
  }

  return runLineSearch(lineSearch, summary, 'keyword');
}

function runLineSearch(
  lineSearch: AmapLineSearch,
  summary: BusLineSummary,
  mode: 'id' | 'keyword',
): Promise<BusLineDetail> {
  return new Promise((resolve, reject) => {
    const callback = (status: string, result: unknown) => {
      if (status !== 'complete') {
        reject(new Error(describeAmapFailure(status, result)));
        return;
      }

      const lineInfos = readLineInfosFromResult(result);
      const matched = chooseBestLineInfo(lineInfos, summary);
      if (!matched) {
        reject(new Error('没有查到线路详情'));
        return;
      }

      const detail = normalizeLineDetail(matched, summary);
      if (detail.path.length === 0) {
        reject(new Error('线路没有可绘制路径'));
        return;
      }

      resolve(detail);
    };

    if (mode === 'id' && summary.id && typeof lineSearch.searchById === 'function') {
      lineSearch.searchById(summary.id, callback);
      return;
    }

    lineSearch.search(summary.name, callback);
  });
}
