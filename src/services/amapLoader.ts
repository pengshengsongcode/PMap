import type { AmapGlobal } from '../types/amap';

const AMAP_SCRIPT_ID = 'amap-js-api-v2';
const DEFAULT_PLUGINS = ['AMap.StationSearch', 'AMap.LineSearch', 'AMap.PlaceSearch', 'AMap.Scale', 'AMap.ToolBar'];

export interface AmapLoaderOptions {
  key: string;
  securityJsCode?: string;
  plugins?: string[];
}

let loadingPromise: Promise<AmapGlobal> | null = null;

export function loadAmapJsApi(options: AmapLoaderOptions): Promise<AmapGlobal> {
  if (!options.key) {
    return Promise.reject(new Error('缺少 VITE_AMAP_KEY'));
  }

  if (window.AMap) {
    return ensureAmapPlugins(window.AMap, options.plugins ?? DEFAULT_PLUGINS).then(() => window.AMap as AmapGlobal);
  }

  if (options.securityJsCode) {
    window._AMapSecurityConfig = {
      ...window._AMapSecurityConfig,
      securityJsCode: options.securityJsCode,
    };
  }

  if (!loadingPromise) {
    loadingPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(AMAP_SCRIPT_ID) as HTMLScriptElement | null;
      const script = existingScript ?? document.createElement('script');

      script.id = AMAP_SCRIPT_ID;
      script.async = true;
      script.onerror = () => reject(new Error('高德地图脚本加载失败'));
      script.onload = () => {
        if (!window.AMap) {
          reject(new Error('高德地图脚本加载后未找到 AMap'));
          return;
        }
        ensureAmapPlugins(window.AMap, options.plugins ?? DEFAULT_PLUGINS)
          .then(() => resolve(window.AMap as AmapGlobal))
          .catch(reject);
      };

      if (!existingScript) {
        const params = new URLSearchParams({
          v: '2.0',
          key: options.key,
          plugin: (options.plugins ?? DEFAULT_PLUGINS).join(','),
        });
        script.src = `https://webapi.amap.com/maps?${params.toString()}`;
        document.head.appendChild(script);
      }
    });
  }

  return loadingPromise;
}

export function ensureAmapPlugins(amap: AmapGlobal, plugins: string[]): Promise<void> {
  return new Promise((resolve) => {
    amap.plugin(plugins, resolve);
  });
}
