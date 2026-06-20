import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransitPanel } from './TransitPanel';
import type { BusLineSummary, StationCandidate } from '../types/transit';

const lines: BusLineSummary[] = [
  { id: 'L1', name: '24路(左家庄--北京站)', startStop: '左家庄', endStop: '北京站', location: null },
  { id: 'L2', name: '117路', startStop: '红庙路口东', endStop: '五路居', location: null },
];

const stations: StationCandidate[] = [
  {
    id: 'S1',
    name: '东直门',
    location: [116.433, 39.941],
    adcode: '110101',
    citycode: '010',
    buslines: lines,
  },
  {
    id: 'S2',
    name: '东直门',
    location: [116.434, 39.942],
    adcode: '110102',
    citycode: '010',
    buslines: [lines[0]],
  },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof TransitPanel>> = {}) {
  const props: React.ComponentProps<typeof TransitPanel> = {
    city: '北京',
    isConfigured: true,
    query: '东直门',
    searchState: 'idle',
    searchError: '',
    stations: [],
    selectedStation: null,
    lines: [],
    activeLineKey: '',
    lineStates: {},
    isShowingAll: false,
    canLocate: true,
    locateState: 'idle',
    locateError: '',
    onQueryChange: vi.fn(),
    onSearch: vi.fn(),
    onLocate: vi.fn(),
    onSelectStation: vi.fn(),
    onSelectLine: vi.fn(),
    onShowAll: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };

  return { props, ...render(<TransitPanel {...props} />) };
}

describe('TransitPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn(() => ({
        matches: true,
        media: '(max-width: 720px)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    });
  });

  it('shows missing key guidance', () => {
    renderPanel({ isConfigured: false, canLocate: false });
    expect(screen.getByText(/缺少高德 Key/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /搜索/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /定位最近站/ })).toBeDisabled();
  });

  it('shows empty search state', () => {
    renderPanel({ searchState: 'success', stations: [] });
    expect(screen.getByText('没有找到匹配站点。')).toBeInTheDocument();
  });

  it('renders duplicate station candidates with disambiguating adcodes', () => {
    const { props } = renderPanel({ searchState: 'success', stations });
    const stationSection = screen.getByText('站点候选').closest('section');
    expect(stationSection).not.toBeNull();
    expect(within(stationSection as HTMLElement).getAllByRole('button', { name: /东直门/ })).toHaveLength(2);
    fireEvent.click(within(stationSection as HTMLElement).getAllByRole('button', { name: /东直门/ })[1]);
    expect(props.onSelectStation).toHaveBeenCalledWith(stations[1]);
  });

  it('calls line selection and marks active line', () => {
    const { props } = renderPanel({
      selectedStation: stations[0],
      lines,
      activeLineKey: 'L1',
      lineStates: { L1: { status: 'loaded' } },
    });

    const activeLine = screen.getByRole('button', { name: /24路/ });
    expect(activeLine).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /117路/ }));
    expect(props.onSelectLine).toHaveBeenCalledWith(lines[1]);
  });

  it('exposes show-all action only when lines exist', () => {
    const { props, rerender } = renderPanel();
    expect(screen.getByRole('button', { name: /显示全部/ })).toBeDisabled();

    rerender(<TransitPanel {...props} selectedStation={stations[0]} lines={lines} />);
    const button = screen.getByRole('button', { name: /显示全部/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(props.onShowAll).toHaveBeenCalledTimes(1);
  });

  it('calls locate from the locate action and shows errors', () => {
    const { props, rerender } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /定位最近站/ }));
    expect(props.onLocate).toHaveBeenCalledTimes(1);

    rerender(<TransitPanel {...props} locateState="error" locateError="定位权限被拒绝" />);
    expect(screen.getByText('定位权限被拒绝')).toBeInTheDocument();
  });

  it('expands the mobile sheet with keyboard controls', () => {
    renderPanel();
    const panel = screen.getByLabelText('公交站牌线路查询') as HTMLElement;
    const handle = screen.getByLabelText('上下拖拽面板');

    fireEvent.keyDown(handle, { key: 'End' });

    expect(panel.style.getPropertyValue('--sheet-height')).toBe('92dvh');
  });

  it('drags the mobile sheet and snaps to a compact height', () => {
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    renderPanel();
    const panel = screen.getByLabelText('公交站牌线路查询') as HTMLElement;

    fireEvent.touchStart(panel, { touches: [{ clientY: 500 }] });
    fireEvent.touchMove(panel, { touches: [{ clientY: 800 }] });
    fireEvent.touchEnd(panel);

    expect(panel.style.getPropertyValue('--sheet-height')).toBe('18dvh');
  });
});
