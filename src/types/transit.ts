export type LngLatTuple = [number, number];

export interface BusLineSummary {
  id: string;
  name: string;
  startStop: string;
  endStop: string;
  location: LngLatTuple | null;
}

export interface StationCandidate {
  id: string;
  name: string;
  location: LngLatTuple | null;
  adcode: string;
  citycode: string;
  buslines: BusLineSummary[];
  distanceMeters?: number;
}

export interface ViaStop {
  id: string;
  name: string;
  location: LngLatTuple | null;
  sequence: number | null;
}

export interface BusLineDetail {
  id: string;
  name: string;
  type: string;
  path: LngLatTuple[];
  viaStops: ViaStop[];
  startTime: string;
  endTime: string;
  price: string;
  color: string;
  startStop: string;
  endStop: string;
}

export type AsyncState = 'idle' | 'loading' | 'success' | 'error';

export type LineStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'skipped';

export interface LineLoadState {
  status: LineStatus;
  message?: string;
}
