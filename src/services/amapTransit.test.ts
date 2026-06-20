import { describe, expect, it } from 'vitest';
import { NonGroundBusLineError, createAmapTransitService } from './amapTransit';
import type { AmapGlobal } from '../types/amap';

describe('createAmapTransitService', () => {
  it('caches line detail lookups by line key', async () => {
    let lineSearchCalls = 0;
    const amap = makeFakeAmap({
      lineInfo: {
        id: 'L1',
        name: '24路',
        type: '普通公交',
        path: '116.1,39.1;116.2,39.2',
      },
      onLineSearch: () => {
        lineSearchCalls += 1;
      },
    });

    const service = createAmapTransitService(amap, '北京');
    const line = { id: 'L1', name: '24路', startStop: '左家庄', endStop: '北京站', location: null };

    await service.getLineDetail(line);
    await service.getLineDetail(line);

    expect(lineSearchCalls).toBe(1);
    expect(service.getCachedLineDetail(line)?.name).toBe('24路');
  });

  it('rejects non-ground transit line detail', async () => {
    const amap = makeFakeAmap({
      lineInfo: {
        id: 'M2',
        name: '地铁2号线',
        type: '地铁',
        path: '116.1,39.1;116.2,39.2',
      },
    });

    const service = createAmapTransitService(amap, '北京');
    const line = { id: 'M2', name: '地铁2号线', startStop: '西直门', endStop: '西直门', location: null };

    await expect(service.getLineDetail(line)).rejects.toBeInstanceOf(NonGroundBusLineError);
  });

  it('returns nearby stations sorted by distance', async () => {
    const amap = makeFakeAmap({
      lineInfo: {
        id: 'L1',
        name: '24路',
        type: '普通公交',
        path: '116.1,39.1;116.2,39.2',
      },
      stationInfo: [
        { id: 'FAR', name: '远站(公交站)', location: '116.50,39.90', buslines: [{ id: 'L1', name: '24路' }] },
        { id: 'NEAR', name: '近站(公交站)', location: '116.401,39.900', buslines: [{ id: 'L2', name: '117路' }] },
      ],
    });

    const service = createAmapTransitService(amap, '北京');
    const stations = await service.searchNearbyStations([116.4, 39.9]);

    expect(stations.map((station) => station.id)).toEqual(['NEAR', 'FAR']);
    expect(stations[0].distanceMeters).toBeLessThan(stations[1].distanceMeters ?? 0);
  });
});

function makeFakeAmap({
  lineInfo,
  onLineSearch,
  stationInfo = [],
}: {
  lineInfo: Record<string, unknown>;
  onLineSearch?: () => void;
  stationInfo?: Record<string, unknown>[];
}): AmapGlobal {
  class StationSearch {
    search(_keyword: string, callback: (status: string, result: unknown) => void) {
      callback('complete', { stationInfo });
    }

    searchNearBy(_keyword: string, _center: unknown, _radius: number, callback: (status: string, result: unknown) => void) {
      callback('complete', { stationInfo });
    }
  }

  class LineSearch {
    searchById(_id: string, callback: (status: string, result: unknown) => void) {
      onLineSearch?.();
      callback('complete', { lineInfo: [lineInfo] });
    }

    search(_keyword: string, callback: (status: string, result: unknown) => void) {
      onLineSearch?.();
      callback('complete', { lineInfo: [lineInfo] });
    }
  }

  class PlaceSearch {
    searchNearBy(_keyword: string, _center: unknown, _radius: number, callback: (status: string, result: unknown) => void) {
      callback('no_data', {});
    }
  }

  return {
    Map: class {},
    Marker: class {},
    Text: class {},
    Polyline: class {},
    InfoWindow: class {},
    Pixel: class {},
    Size: class {},
    StationSearch,
    LineSearch,
    PlaceSearch,
    plugin: (_names: string[] | string, callback: () => void) => callback(),
  } as unknown as AmapGlobal;
}
