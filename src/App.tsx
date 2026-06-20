import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NonGroundBusLineError, createAmapTransitService, type TransitSearchService } from './services/amapTransit';
import { loadAmapJsApi } from './services/amapLoader';
import { TransitPanel } from './components/TransitPanel';
import { lineKey, toLngLatTuple } from './domain/transit';
import type { AmapGlobal, AmapMap, AmapOverlay } from './types/amap';
import type {
  AsyncState,
  BusLineDetail,
  BusLineSummary,
  LineLoadState,
  LngLatTuple,
  StationCandidate,
} from './types/transit';
import './styles.css';

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY?.trim() ?? '';
const AMAP_SECURITY_JS_CODE = import.meta.env.VITE_AMAP_SECURITY_JS_CODE?.trim() ?? '';
const AMAP_CITY = import.meta.env.VITE_AMAP_CITY?.trim() || '北京';
const DEFAULT_BEIJING_CENTER: LngLatTuple = [116.397428, 39.90923];
const SHOW_ALL_LIMIT = 50;
const SHOW_ALL_CONCURRENCY = 3;
const NEARBY_STATION_RADIUS_METERS = 1500;

interface LayerStore {
  currentLocation: AmapOverlay | null;
  station: AmapOverlay | null;
  route: AmapOverlay[];
  stops: AmapOverlay[];
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const amapRef = useRef<AmapGlobal | null>(null);
  const mapRef = useRef<AmapMap | null>(null);
  const serviceRef = useRef<TransitSearchService | null>(null);
  const layersRef = useRef<LayerStore>({ currentLocation: null, station: null, route: [], stops: [] });

  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<AsyncState>('idle');
  const [searchError, setSearchError] = useState('');
  const [stations, setStations] = useState<StationCandidate[]>([]);
  const [selectedStation, setSelectedStation] = useState<StationCandidate | null>(null);
  const [activeLineKey, setActiveLineKey] = useState('');
  const [lineStates, setLineStates] = useState<Record<string, LineLoadState>>({});
  const [isShowingAll, setIsShowingAll] = useState(false);
  const hasRequiredAmapConfig = Boolean(AMAP_KEY && AMAP_SECURITY_JS_CODE);
  const [mapState, setMapState] = useState<AsyncState>(hasRequiredAmapConfig ? 'loading' : 'idle');
  const [mapError, setMapError] = useState('');
  const [locateState, setLocateState] = useState<AsyncState>('idle');
  const [locateError, setLocateError] = useState('');

  const isConfigured = hasRequiredAmapConfig;
  const canLocate = isConfigured && mapState === 'success';
  const lines = useMemo(() => selectedStation?.buslines.slice(0, SHOW_ALL_LIMIT) ?? [], [selectedStation]);

  useEffect(() => {
    if (!hasRequiredAmapConfig || !mapContainerRef.current) return;

    let disposed = false;

    loadAmapJsApi({ key: AMAP_KEY, securityJsCode: AMAP_SECURITY_JS_CODE })
      .then((amap) => {
        if (disposed || !mapContainerRef.current) return;
        amapRef.current = amap;
        const map = new amap.Map(mapContainerRef.current, {
          zoom: 12,
          center: DEFAULT_BEIJING_CENTER,
          viewMode: '2D',
          resizeEnable: true,
        });

        if (amap.Scale) map.addControl?.(new amap.Scale());
        if (amap.ToolBar) map.addControl?.(new amap.ToolBar({ position: 'RB' }));

        mapRef.current = map;
        serviceRef.current = createAmapTransitService(amap, AMAP_CITY);
        setMapState('success');
      })
      .catch((error: Error) => {
        setMapState('error');
        setMapError(error.message);
      });

    return () => {
      disposed = true;
      clearAllLayers(layersRef.current);
      mapRef.current?.remove?.();
      mapRef.current = null;
      serviceRef.current = null;
      amapRef.current = null;
    };
  }, [hasRequiredAmapConfig]);

  const handleSearch = useCallback(async () => {
    const keyword = query.trim();
    if (!keyword || !serviceRef.current) return;

    setSearchState('loading');
    setSearchError('');
    setStations([]);
    setSelectedStation(null);
    setActiveLineKey('');
    setLineStates({});
    clearRouteLayers(layersRef.current);
    clearStationLayer(layersRef.current);

    try {
      const result = await serviceRef.current.searchStations(keyword);
      setStations(result);
      setSearchState('success');
    } catch (error) {
      setSearchState('error');
      setSearchError(error instanceof Error ? error.message : '查询失败');
    }
  }, [query]);

  const handleSelectStation = useCallback((station: StationCandidate) => {
    setSelectedStation(station);
    setActiveLineKey('');
    setLineStates({});
    clearRouteLayers(layersRef.current);
    drawStationMarker(amapRef.current, mapRef.current, layersRef.current, station);
  }, []);

  const handleLocate = useCallback(async () => {
    if (!hasRequiredAmapConfig) {
      setLocateState('error');
      setLocateError('缺少高德地图配置');
      return;
    }

    if (!serviceRef.current || !amapRef.current || !mapRef.current) {
      setLocateState('error');
      setLocateError('地图仍在加载，请稍后再试');
      return;
    }

    setLocateState('loading');
    setLocateError('');
    setSearchError('');
    setSearchState('loading');
    setStations([]);
    setSelectedStation(null);
    setActiveLineKey('');
    setLineStates({});
    clearRouteLayers(layersRef.current);
    clearStationLayer(layersRef.current);

    try {
      const gpsLocation = await requestBrowserLocation();
      const amapLocation = await convertGpsToAmapLocation(amapRef.current, gpsLocation);
      drawCurrentLocationMarker(amapRef.current, mapRef.current, layersRef.current, amapLocation);

      const nearbyStations = await serviceRef.current.searchNearbyStations(amapLocation, NEARBY_STATION_RADIUS_METERS);
      if (nearbyStations.length === 0) {
        throw new Error('当前位置附近没有找到公交站');
      }

      const nearestStation = nearbyStations[0];
      setQuery(nearestStation.name);
      setStations(nearbyStations);
      setSelectedStation(nearestStation);
      drawStationMarker(amapRef.current, mapRef.current, layersRef.current, nearestStation);
      fitLocatedStationView(mapRef.current, layersRef.current);
      setSearchState('success');
      setLocateState('success');
    } catch (error) {
      setSearchState('idle');
      setLocateState('error');
      setLocateError(error instanceof Error ? error.message : '定位失败');
    }
  }, [hasRequiredAmapConfig]);

  const handleSelectLine = useCallback(async (line: BusLineSummary) => {
    if (!serviceRef.current) return;
    const key = lineKey(line);

    setActiveLineKey(key);
    setLineStates((prev) => ({ ...prev, [key]: { status: 'loading' } }));

    try {
      const detail = await serviceRef.current.getLineDetail(line);
      clearRouteLayers(layersRef.current);
      drawLineDetail(amapRef.current, mapRef.current, layersRef.current, detail, { withStops: true, emphasis: true });
      fitRouteView(mapRef.current, layersRef.current);
      setLineStates((prev) => ({ ...prev, [key]: { status: 'loaded' } }));
    } catch (error) {
      const status = error instanceof NonGroundBusLineError ? 'skipped' : 'error';
      setLineStates((prev) => ({
        ...prev,
        [key]: { status, message: error instanceof Error ? error.message : '线路加载失败' },
      }));
    }
  }, []);

  const handleShowAll = useCallback(async () => {
    if (!serviceRef.current || lines.length === 0) return;
    setIsShowingAll(true);
    setActiveLineKey('');
    clearRouteLayers(layersRef.current);

    await runWithConcurrency(lines, SHOW_ALL_CONCURRENCY, async (line) => {
      const key = lineKey(line);
      setLineStates((prev) => ({ ...prev, [key]: { status: 'loading' } }));
      try {
        const detail = await serviceRef.current?.getLineDetail(line);
        if (!detail) return;
        drawLineDetail(amapRef.current, mapRef.current, layersRef.current, detail, { withStops: false, emphasis: false });
        setLineStates((prev) => ({ ...prev, [key]: { status: 'loaded' } }));
      } catch (error) {
        const status = error instanceof NonGroundBusLineError ? 'skipped' : 'error';
        setLineStates((prev) => ({
          ...prev,
          [key]: { status, message: error instanceof Error ? error.message : '线路加载失败' },
        }));
      }
    });

    fitRouteView(mapRef.current, layersRef.current);
    setIsShowingAll(false);
  }, [lines]);

  const handleClear = useCallback(() => {
    clearRouteLayers(layersRef.current);
    setActiveLineKey('');
    setLineStates({});
    if (selectedStation) {
      drawStationMarker(amapRef.current, mapRef.current, layersRef.current, selectedStation);
    }
  }, [selectedStation]);

  return (
    <main className="app-shell">
      <div className="map-stage" ref={mapContainerRef}>
        {!hasRequiredAmapConfig && <MapOverlayMessage title="等待配置" message="填入高德 Key 和安全密钥后即可加载地图。" />}
        {mapState === 'loading' && <MapOverlayMessage title="加载地图" message="正在连接高德地图 JS API。" />}
        {mapState === 'error' && <MapOverlayMessage title="地图加载失败" message={mapError} />}
      </div>
      <TransitPanel
        city={AMAP_CITY}
        isConfigured={isConfigured}
        query={query}
        searchState={searchState}
        searchError={searchError}
        stations={stations}
        selectedStation={selectedStation}
        lines={lines}
        activeLineKey={activeLineKey}
        lineStates={lineStates}
        isShowingAll={isShowingAll}
        canLocate={canLocate}
        locateState={locateState}
        locateError={locateError}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        onLocate={handleLocate}
        onSelectStation={handleSelectStation}
        onSelectLine={handleSelectLine}
        onShowAll={handleShowAll}
        onClear={handleClear}
      />
    </main>
  );
}

function MapOverlayMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="map-overlay-message" role="status">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

function drawCurrentLocationMarker(
  amap: AmapGlobal | null,
  map: AmapMap | null,
  layers: LayerStore,
  location: LngLatTuple,
) {
  if (!amap || !map) return;
  layers.currentLocation?.setMap(null);

  layers.currentLocation = new amap.Marker({
    map,
    position: location,
    anchor: 'center',
    zIndex: 90,
    content: '<div class="current-location-marker"></div>',
  });
}

function drawStationMarker(
  amap: AmapGlobal | null,
  map: AmapMap | null,
  layers: LayerStore,
  station: StationCandidate,
) {
  if (!amap || !map || !station.location) return;
  clearStationLayer(layers);

  layers.station = new amap.Marker({
    map,
    position: station.location,
    anchor: 'bottom-center',
    zIndex: 80,
    content: `<div class="station-marker"><span>${escapeHtml(station.name)}</span></div>`,
  });

  map.setCenter?.(station.location);
  map.setZoom?.(15);
}

function drawLineDetail(
  amap: AmapGlobal | null,
  map: AmapMap | null,
  layers: LayerStore,
  detail: BusLineDetail,
  options: { withStops: boolean; emphasis: boolean },
) {
  if (!amap || !map || detail.path.length === 0) return;

  const polyline = new amap.Polyline({
    map,
    path: detail.path,
    strokeColor: detail.color,
    strokeOpacity: options.emphasis ? 0.94 : 0.56,
    strokeWeight: options.emphasis ? 8 : 4,
    isOutline: true,
    outlineColor: '#ffffff',
    borderWeight: options.emphasis ? 3 : 1,
    zIndex: options.emphasis ? 52 : 36,
  });
  layers.route.push(polyline);

  if (options.withStops) {
    detail.viaStops.forEach((stop, index) => {
      if (!stop.location) return;
      const isEndpoint = index === 0 || index === detail.viaStops.length - 1;
      const marker = new amap.Marker({
        map,
        position: stop.location,
        anchor: 'center',
        zIndex: isEndpoint ? 70 : 55,
        content: `<div class="${isEndpoint ? 'endpoint-dot' : 'stop-dot'}"></div>`,
      });
      layers.stops.push(marker);
    });
  }
}

function clearAllLayers(layers: LayerStore) {
  layers.currentLocation?.setMap(null);
  layers.currentLocation = null;
  clearStationLayer(layers);
  clearRouteLayers(layers);
}

function clearStationLayer(layers: LayerStore) {
  layers.station?.setMap(null);
  layers.station = null;
}

function clearRouteLayers(layers: LayerStore) {
  [...layers.route, ...layers.stops].forEach((overlay) => overlay.setMap(null));
  layers.route = [];
  layers.stops = [];
}

function fitRouteView(map: AmapMap | null, layers: LayerStore) {
  const overlays = [...layers.route, ...layers.stops, ...(layers.station ? [layers.station] : [])];
  if (overlays.length > 0) {
    map?.setFitView?.(overlays, false, [80, 420, 80, 80]);
  }
}

function fitLocatedStationView(map: AmapMap | null, layers: LayerStore) {
  const overlays = [layers.currentLocation, layers.station].filter((overlay): overlay is AmapOverlay => Boolean(overlay));
  if (overlays.length > 0) {
    map?.setFitView?.(overlays, false, [80, 420, 120, 80]);
  }
}

function requestBrowserLocation(): Promise<LngLatTuple> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('当前浏览器不支持定位'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      (error) => reject(new Error(describeGeolocationError(error))),
      {
        enableHighAccuracy: true,
        maximumAge: 5 * 60 * 1000,
        timeout: 10 * 1000,
      },
    );
  });
}

function convertGpsToAmapLocation(amap: AmapGlobal, gpsLocation: LngLatTuple): Promise<LngLatTuple> {
  if (!amap.convertFrom) return Promise.resolve(gpsLocation);

  return new Promise((resolve) => {
    amap.convertFrom?.(gpsLocation, 'gps', (status, result) => {
      const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
      const locations = Array.isArray(record.locations) ? record.locations : [];
      const converted = toLngLatTuple(locations[0]);
      resolve(status === 'complete' && converted ? converted : gpsLocation);
    });
  });
}

function describeGeolocationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return '定位权限被拒绝';
  if (error.code === error.POSITION_UNAVAILABLE) return '无法获取当前位置';
  if (error.code === error.TIMEOUT) return '定位超时，请重试';
  return error.message || '定位失败';
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}
