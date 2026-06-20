import {
  AlertCircle,
  Bus,
  Layers,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Moon,
  Route,
  Search,
  Sun,
} from 'lucide-react';
import { CSSProperties, FormEvent, KeyboardEvent, PointerEvent, TouchEvent, useRef, useState } from 'react';
import { formatLineDirection, lineKey } from '../domain/transit';
import type { AsyncState, BusLineSummary, LineLoadState, StationCandidate } from '../types/transit';

const MOBILE_SHEET_MIN_HEIGHT = 16;
const MOBILE_SHEET_COMPACT_HEIGHT = 18;
const MOBILE_SHEET_DEFAULT_HEIGHT = MOBILE_SHEET_COMPACT_HEIGHT;
const MOBILE_SHEET_MAX_HEIGHT = 92;
const MOBILE_SHEET_SNAP_POINTS = [MOBILE_SHEET_COMPACT_HEIGHT, 68, 92];
const SHEET_DRAG_THRESHOLD_PX = 8;

export type MapTheme = 'day' | 'night';

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
  theme: MapTheme;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onLocate: () => void;
  onToggleTheme: () => void;
  onSelectStation: (station: StationCandidate) => void;
  onSelectLine: (line: BusLineSummary) => void;
  onShowAll: () => void;
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
  theme,
  onQueryChange,
  onSearch,
  onLocate,
  onToggleTheme,
  onSelectStation,
  onSelectLine,
  onShowAll,
}: TransitPanelProps) {
  const isSearching = searchState === 'loading';
  const isLocating = locateState === 'loading';
  const canSearch = isConfigured && query.trim().length > 0 && !isSearching;
  const canUseLocate = canLocate && !isLocating;
  const canShowAll = lines.length > 0 && !isShowingAll;
  const [sheetHeight, setSheetHeight] = useState(MOBILE_SHEET_DEFAULT_HEIGHT);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const suppressNextClickRef = useRef(false);
  const dragStartRef = useRef<{
    pointerId?: number;
    startY: number;
    lastY: number;
    startHeight: number;
    dragging: boolean;
    scrollTarget: HTMLElement | null;
  } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSearch) onSearch();
  }

  function collapseSheet() {
    setSheetHeight(MOBILE_SHEET_COMPACT_HEIGHT);
    scrollAreaRef.current?.scrollTo?.({ top: 0 });
  }

  function handleShowAllClick() {
    if (!canShowAll) return;
    collapseSheet();
    onShowAll();
  }

  function handlePanelPointerDown(event: PointerEvent<HTMLElement>) {
    if (!isMobileViewport() || (event.pointerType === 'mouse' && event.button !== 0)) return;

    beginSheetDrag(event.clientY, event.currentTarget, event.target, event.pointerId);
    if (event.pointerId !== undefined) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  }

  function handlePanelPointerMove(event: PointerEvent<HTMLElement>) {
    const dragStart = dragStartRef.current;
    if (!dragStart || !isSamePointer(dragStart.pointerId, event.pointerId)) return;

    updateSheetDrag(event.clientY, event);
  }

  function handlePanelPointerEnd(event: PointerEvent<HTMLElement>) {
    const dragStart = dragStartRef.current;
    if (!dragStart || !isSamePointer(dragStart.pointerId, event.pointerId)) return;

    if (event.pointerId !== undefined && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    finishSheetDrag();
  }

  function handlePanelTouchStart(event: TouchEvent<HTMLElement>) {
    if (!isMobileViewport() || event.touches.length !== 1) return;
    beginSheetDrag(event.touches[0].clientY, event.currentTarget, event.target);
  }

  function handlePanelTouchMove(event: TouchEvent<HTMLElement>) {
    if (!dragStartRef.current || event.touches.length !== 1) return;
    updateSheetDrag(event.touches[0].clientY, event);
  }

  function handlePanelTouchEnd() {
    if (!dragStartRef.current) return;
    finishSheetDrag();
  }

  function beginSheetDrag(clientY: number, panel: EventTarget, target: EventTarget, pointerId?: number) {
    dragStartRef.current = {
      pointerId,
      startY: clientY,
      lastY: clientY,
      startHeight: sheetHeight,
      dragging: false,
      scrollTarget: findScrollableTarget(panel, target, scrollAreaRef.current),
    };
  }

  function updateSheetDrag(clientY: number, event: { preventDefault: () => void }) {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const totalDeltaY = clientY - dragStart.startY;
    const stepDeltaY = clientY - dragStart.lastY;
    const nextRawHeight = dragStart.startHeight - (totalDeltaY / viewportHeight) * 100;
    const nextHeight = clamp(nextRawHeight, MOBILE_SHEET_MIN_HEIGHT, MOBILE_SHEET_MAX_HEIGHT);

    if (!dragStart.dragging && Math.abs(totalDeltaY) >= SHEET_DRAG_THRESHOLD_PX) {
      dragStart.dragging = true;
      suppressNextClickRef.current = true;
      setIsDraggingSheet(true);
    }

    if (!dragStart.dragging) return;

    event.preventDefault();
    setSheetHeight(nextHeight);

    if (nextRawHeight > MOBILE_SHEET_MAX_HEIGHT && stepDeltaY < 0) {
      dragStart.scrollTarget?.scrollBy?.({ top: -stepDeltaY });
    }
    if (nextRawHeight < MOBILE_SHEET_MIN_HEIGHT && stepDeltaY > 0) {
      dragStart.scrollTarget?.scrollBy?.({ top: -stepDeltaY });
    }

    dragStart.lastY = clientY;
  }

  function finishSheetDrag() {
    dragStartRef.current = null;
    setSheetHeight((currentHeight) => nearestSnapPoint(currentHeight));
    setIsDraggingSheet(false);
  }

  function handlePanelClickCapture(event: React.MouseEvent<HTMLElement>) {
    if (!suppressNextClickRef.current) return;
    suppressNextClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
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
      onPointerDown={handlePanelPointerDown}
      onPointerMove={handlePanelPointerMove}
      onPointerUp={handlePanelPointerEnd}
      onPointerCancel={handlePanelPointerEnd}
      onTouchStart={handlePanelTouchStart}
      onTouchMove={handlePanelTouchMove}
      onTouchEnd={handlePanelTouchEnd}
      onTouchCancel={handlePanelTouchEnd}
      onClickCapture={handlePanelClickCapture}
    >
      <button
        className="sheet-drag-handle"
        type="button"
        title="拖拽面板"
        aria-label="上下拖拽面板"
        onKeyDown={handleSheetKeyDown}
      >
        <span />
      </button>

      <div className="panel-scroll-area" ref={scrollAreaRef}>
        <div className="panel-header">
          <div className="panel-title">
            <p className="eyebrow">PMap · {city}</p>
            <h1>公交直达</h1>
          </div>
          <div className="panel-actions">
            <button
              className="theme-toggle"
              type="button"
              onClick={onToggleTheme}
              title={theme === 'day' ? '切换夜间模式' : '切换日间模式'}
              aria-label={theme === 'day' ? '切换夜间模式' : '切换日间模式'}
            >
              {theme === 'day' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <div className="route-counter" aria-label={`当前站点 ${lines.length} 条线路`}>
              <strong>{lines.length}</strong>
              <span>线路</span>
            </div>
          </div>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <label htmlFor="station-query">搜索站牌</label>
          <div className="search-row">
            <input
              id="station-query"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="输入公交站名"
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

        {selectedStation && (
          <section className="current-station" aria-label="当前站点">
            <span>当前站点</span>
            <strong>{selectedStation.name}</strong>
            <small>{lines.length} 条可直达线路</small>
          </section>
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
            <span>可直达线路</span>
          </div>

          <div className="action-row">
            <button
              className="show-all-button"
              type="button"
              onClick={handleShowAllClick}
              disabled={!canShowAll}
              title="显示全部线路"
            >
              {isShowingAll ? <LoaderCircle className="spin" size={18} /> : <Layers size={18} />}
              <span>{isShowingAll ? '绘制中' : '显示全部'}</span>
              <small>{lines.length > 0 ? `${lines.length} 条线路` : '选择站点后可用'}</small>
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
      </div>
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

function isMobileViewport(): boolean {
  return window.matchMedia?.('(max-width: 720px)').matches ?? window.innerWidth <= 720;
}

function isSamePointer(startPointerId: number | undefined, eventPointerId: number | undefined): boolean {
  return startPointerId === undefined || eventPointerId === undefined || startPointerId === eventPointerId;
}

function findScrollableTarget(
  panelTarget: EventTarget,
  eventTarget: EventTarget,
  fallback: HTMLElement | null,
): HTMLElement | null {
  if (!(panelTarget instanceof HTMLElement) || !(eventTarget instanceof HTMLElement)) return fallback;

  let current: HTMLElement | null = eventTarget;
  while (current && current !== panelTarget) {
    if (isVerticallyScrollable(current)) return current;
    current = current.parentElement;
  }

  return fallback;
}

function isVerticallyScrollable(element: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(element).overflowY;
  return /(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight;
}
