import {
  AlertCircle,
  Bus,
  Layers,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Route,
  Search,
  Trash2,
} from 'lucide-react';
import { CSSProperties, FormEvent, KeyboardEvent, PointerEvent, useRef, useState } from 'react';
import { formatLineDirection, lineKey } from '../domain/transit';
import type { AsyncState, BusLineSummary, LineLoadState, StationCandidate } from '../types/transit';

const MOBILE_SHEET_MIN_HEIGHT = 16;
const MOBILE_SHEET_DEFAULT_HEIGHT = 68;
const MOBILE_SHEET_MAX_HEIGHT = 92;
const MOBILE_SHEET_SNAP_POINTS = [18, 68, 92];

interface TransitPanelProps {
  city: string;
  isConfigured: boolean;
  query: string;
  searchState: AsyncState;
  searchError: string;
  stations: StationCandidate[];
  selectedStation: StationCandidate | null;
  lines: BusLineSummary[];
  activeLineKey: string;
  lineStates: Record<string, LineLoadState>;
  isShowingAll: boolean;
  canLocate: boolean;
  locateState: AsyncState;
  locateError: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onLocate: () => void;
  onSelectStation: (station: StationCandidate) => void;
  onSelectLine: (line: BusLineSummary) => void;
  onShowAll: () => void;
  onClear: () => void;
}

export function TransitPanel({
  city,
  isConfigured,
  query,
  searchState,
  searchError,
  stations,
  selectedStation,
  lines,
  activeLineKey,
  lineStates,
  isShowingAll,
  canLocate,
  locateState,
  locateError,
  onQueryChange,
  onSearch,
  onLocate,
  onSelectStation,
  onSelectLine,
  onShowAll,
  onClear,
}: TransitPanelProps) {
  const isSearching = searchState === 'loading';
  const isLocating = locateState === 'loading';
  const canSearch = isConfigured && query.trim().length > 0 && !isSearching;
  const canUseLocate = canLocate && !isLocating;
  const canShowAll = lines.length > 0 && !isShowingAll;
  const [sheetHeight, setSheetHeight] = useState(MOBILE_SHEET_DEFAULT_HEIGHT);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const dragStartRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSearch) onSearch();
  }

  function handleSheetPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragStartRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sheetHeight,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDraggingSheet(true);
  }

  function handleSheetPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const deltaHeight = ((dragStart.startY - event.clientY) / viewportHeight) * 100;
    setSheetHeight(clamp(dragStart.startHeight + deltaHeight, MOBILE_SHEET_MIN_HEIGHT, MOBILE_SHEET_MAX_HEIGHT));
  }

  function handleSheetPointerEnd(event: PointerEvent<HTMLButtonElement>) {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragStartRef.current = null;
    setSheetHeight((currentHeight) => nearestSnapPoint(currentHeight));
    setIsDraggingSheet(false);
  }

  function handleSheetKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      setSheetHeight((currentHeight) => nearestSnapPoint(currentHeight + 18));
    }
    if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      setSheetHeight((currentHeight) => nearestSnapPoint(currentHeight - 18));
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setSheetHeight(MOBILE_SHEET_MIN_HEIGHT);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setSheetHeight(MOBILE_SHEET_MAX_HEIGHT);
    }
  }

  const panelStyle = {
    '--sheet-height': `${sheetHeight}dvh`,
  } as CSSProperties;

  return (
    <aside
      className={`transit-panel ${isDraggingSheet ? 'is-dragging' : ''}`}
      aria-label="公交站牌线路查询"
      style={panelStyle}
    >
      <button
        className="sheet-drag-handle"
        type="button"
        title="拖拽面板"
        aria-label="上下拖拽面板"
        onPointerDown={handleSheetPointerDown}
        onPointerMove={handleSheetPointerMove}
        onPointerUp={handleSheetPointerEnd}
        onPointerCancel={handleSheetPointerEnd}
        onKeyDown={handleSheetKeyDown}
      >
        <span />
      </button>

      <div className="panel-header">
        <div>
          <p className="eyebrow">{city}</p>
          <h1>公交站牌直达线路</h1>
        </div>
        <button className="icon-button" type="button" onClick={onClear} title="清空图层" aria-label="清空图层">
          <Trash2 size={18} />
        </button>
      </div>

      <form className="search-form" onSubmit={handleSubmit}>
        <label htmlFor="station-query">公交站</label>
        <div className="search-row">
          <input
            id="station-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="例如：东直门"
            autoComplete="off"
          />
          <button type="submit" disabled={!canSearch} title="搜索公交站">
            {isSearching ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}
            <span>搜索</span>
          </button>
        </div>
      </form>

      <button className="locate-button" type="button" onClick={onLocate} disabled={!canUseLocate} title="定位最近公交站">
        {isLocating ? <LoaderCircle className="spin" size={18} /> : <LocateFixed size={18} />}
        <span>{isLocating ? '定位中' : '定位最近站'}</span>
      </button>

      {!isConfigured && (
        <StatusMessage tone="warning" icon={<AlertCircle size={18} />}>
          缺少高德 Key。请在 `.env.local` 中配置 `VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_JS_CODE`。
        </StatusMessage>
      )}

      {locateState === 'error' && (
        <StatusMessage tone="danger" icon={<AlertCircle size={18} />}>
          {locateError}
        </StatusMessage>
      )}

      {searchState === 'error' && (
        <StatusMessage tone="danger" icon={<AlertCircle size={18} />}>
          {searchError}
        </StatusMessage>
      )}

      {searchState === 'success' && stations.length === 0 && (
        <StatusMessage tone="muted" icon={<MapPin size={18} />}>
          没有找到匹配站点。
        </StatusMessage>
      )}

      {stations.length > 0 && (
        <section className="panel-section">
          <div className="section-title">
            <MapPin size={16} />
            <span>站点候选</span>
          </div>
          <div className="station-list">
            {stations.map((station) => (
              <button
                className={`station-item ${selectedStation?.id === station.id ? 'active' : ''}`}
                type="button"
                key={station.id || `${station.name}-${station.location?.join(',')}`}
                onClick={() => onSelectStation(station)}
              >
                <span>{station.name}</span>
                <small>
                  {station.buslines.length} 条线路
                  {station.adcode ? ` · ${station.adcode}` : ''}
                </small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel-section route-section">
        <div className="section-title">
          <Bus size={16} />
          <span>{selectedStation ? `${selectedStation.name} 途经线路` : '途经线路'}</span>
        </div>

        <div className="action-row">
          <button type="button" onClick={onShowAll} disabled={!canShowAll} title="显示全部线路">
            {isShowingAll ? <LoaderCircle className="spin" size={18} /> : <Layers size={18} />}
            <span>{isShowingAll ? '绘制中' : '显示全部'}</span>
          </button>
          <button type="button" className="secondary" onClick={onClear} title="清空图层">
            <Trash2 size={18} />
            <span>清空</span>
          </button>
        </div>

        {selectedStation && lines.length === 0 && (
          <StatusMessage tone="muted" icon={<Route size={18} />}>
            该站点未返回地面公交线路。
          </StatusMessage>
        )}

        {!selectedStation && (
          <StatusMessage tone="muted" icon={<Route size={18} />}>
            请选择一个公交站。
          </StatusMessage>
        )}

        {lines.length > 0 && (
          <div className="line-list">
            {lines.map((line) => {
              const key = lineKey(line);
              const state = lineStates[key]?.status ?? 'idle';
              const isActive = activeLineKey === key;
              return (
                <button
                  className={`line-item ${isActive ? 'active' : ''}`}
                  type="button"
                  key={key}
                  onClick={() => onSelectLine(line)}
                  aria-pressed={isActive}
                >
                  <span className="line-badge">{line.name.replace(/[（(].*$/, '')}</span>
                  <span className="line-meta">{formatLineDirection(line)}</span>
                  <LineStateLabel state={state} message={lineStates[key]?.message} />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}

function StatusMessage({
  tone,
  icon,
  children,
}: {
  tone: 'warning' | 'danger' | 'muted';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`status-message ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

function LineStateLabel({ state, message }: { state: LineLoadState['status']; message?: string }) {
  if (state === 'idle') return null;
  if (state === 'loading') {
    return (
      <small className="line-state loading">
        <LoaderCircle className="spin" size={13} />
        加载中
      </small>
    );
  }
  if (state === 'loaded') return <small className="line-state loaded">已绘制</small>;
  if (state === 'skipped') return <small className="line-state skipped">已过滤</small>;
  return <small className="line-state error">{message || '失败'}</small>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nearestSnapPoint(value: number): number {
  return MOBILE_SHEET_SNAP_POINTS.reduce((nearest, point) => {
    return Math.abs(point - value) < Math.abs(nearest - value) ? point : nearest;
  }, MOBILE_SHEET_SNAP_POINTS[0]);
}
