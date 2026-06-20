export type AmapGlobal = {
  Map: new (container: HTMLElement | string, options?: Record<string, unknown>) => AmapMap;
  Marker: new (options: Record<string, unknown>) => AmapOverlay;
  Text: new (options: Record<string, unknown>) => AmapOverlay;
  Polyline: new (options: Record<string, unknown>) => AmapOverlay;
  InfoWindow: new (options: Record<string, unknown>) => { open: (map: AmapMap, position?: unknown) => void };
  Pixel: new (x: number, y: number) => unknown;
  Size: new (width: number, height: number) => unknown;
  StationSearch: new (options: Record<string, unknown>) => AmapStationSearch;
  LineSearch: new (options: Record<string, unknown>) => AmapLineSearch;
  PlaceSearch: new (options: Record<string, unknown>) => AmapPlaceSearch;
  Scale?: new () => unknown;
  ToolBar?: new (options?: Record<string, unknown>) => unknown;
  convertFrom?: (
    lnglat: unknown,
    type: 'gps' | 'baidu' | 'mapbar',
    callback: (status: string, result: unknown) => void,
  ) => void;
  plugin: (names: string[] | string, callback: () => void) => void;
};

export type AmapMap = {
  addControl?: (control: unknown) => void;
  remove?: () => void;
  setFitView?: (overlays?: AmapOverlay[], immediately?: boolean, avoid?: number[]) => void;
  setCenter?: (center: unknown) => void;
  setZoom?: (zoom: number) => void;
};

export type AmapOverlay = {
  setMap: (map: AmapMap | null) => void;
  on?: (eventName: string, handler: (event: unknown) => void) => void;
  getPosition?: () => unknown;
};

export type AmapStationSearch = {
  search: (keyword: string, callback: (status: string, result: unknown) => void) => void;
  searchById?: (id: string, callback: (status: string, result: unknown) => void) => void;
  searchNearBy?: (
    keyword: string,
    center: unknown,
    radius: number,
    callback: (status: string, result: unknown) => void,
  ) => void;
};

export type AmapLineSearch = {
  search: (keyword: string, callback: (status: string, result: unknown) => void) => void;
  searchById?: (id: string, callback: (status: string, result: unknown) => void) => void;
};

export type AmapPlaceSearch = {
  searchNearBy: (
    keyword: string,
    center: unknown,
    radius: number,
    callback: (status: string, result: unknown) => void,
  ) => void;
};

declare global {
  interface Window {
    AMap?: AmapGlobal;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
      serviceHost?: string;
    };
  }
}
