import { describe, expect, it } from 'vitest';
import {
  describeAmapFailure,
  isGroundBusType,
  normalizeLineDetail,
  normalizeStation,
  parsePath,
} from './transit';

describe('transit domain helpers', () => {
  it('normalizes station data and deduplicates bus lines', () => {
    const station = normalizeStation({
      id: 'BV1',
      name: '东直门',
      location: '116.433,39.941',
      adcode: '110101',
      citycode: '010',
      buslines: [
        { id: 'L1', name: '24路', start_stop: '左家庄', end_stop: '北京站' },
        { id: 'L1', name: '24路', start_stop: '左家庄', end_stop: '北京站' },
        { id: 'M2', name: '地铁2号线', start_stop: '西直门', end_stop: '西直门' },
      ],
    });

    expect(station.location).toEqual([116.433, 39.941]);
    expect(station.buslines).toHaveLength(1);
    expect(station.buslines[0].name).toBe('24路');
  });

  it('parses line detail from AMap-like data', () => {
    const detail = normalizeLineDetail(
      {
        id: 'L24',
        name: '24路(左家庄--北京站)',
        type: '普通公交',
        path: '116.1,39.1;116.2,39.2',
        via_stops: [
          { id: 'S1', name: '左家庄', location: [116.1, 39.1], sequence: '1' },
          { id: 'S2', name: '北京站', location: [116.2, 39.2], sequence: '2' },
        ],
        stime: '05:00',
        etime: '23:00',
        total_price: '2',
        uicolor: '0f766e',
      },
      { id: 'L24', name: '24路', startStop: '左家庄', endStop: '北京站', location: null },
    );

    expect(detail.path).toEqual([
      [116.1, 39.1],
      [116.2, 39.2],
    ]);
    expect(detail.viaStops[0].sequence).toBe(1);
    expect(detail.color).toBe('#0f766e');
  });

  it('filters non-ground transit types', () => {
    expect(isGroundBusType('普通公交')).toBe(true);
    expect(isGroundBusType('机场大巴')).toBe(true);
    expect(isGroundBusType('地铁')).toBe(false);
    expect(isGroundBusType('磁悬浮列车')).toBe(false);
  });

  it('maps AMap statuses to user-facing messages', () => {
    expect(describeAmapFailure('no_data', {})).toBe('没有查到相关结果');
    expect(describeAmapFailure('error', { info: 'INVALID_USER_KEY' })).toBe('INVALID_USER_KEY');
  });

  it('drops invalid path points', () => {
    expect(parsePath('116.1,39.1;bad;116.2,39.2')).toEqual([
      [116.1, 39.1],
      [116.2, 39.2],
    ]);
  });
});
