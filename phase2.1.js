/* Syria Weather Pro — Phase 2.1
   Loaded AFTER Leaflet and BEFORE the existing inline application script.
   It preserves the existing Phase 1 code and adds:
   - real Open-Meteo model selection (Best Match / ECMWF / GFS / GEM)
   - persistent model choice
   - RainViewer radar using the live weather-maps.json feed
   - radar attribution
   - compact model/radar controls
*/
(() => {
  'use strict';

  const MODEL_KEY = 'sy_weather_model_v1';
  const MODEL_CONFIG = {
    best_match: { label: 'Best Match', api: null, desc: 'اختيار تلقائي' },
    ecmwf:     { label: 'ECMWF', api: 'ecmwf_ifs', desc: 'ECMWF IFS' },
    gfs:       { label: 'GFS', api: 'ncep_gfs_seamless', desc: 'NOAA GFS' },
    gem:       { label: 'GEM', api: 'cmc_gem_seamless', desc: 'Canada GEM' }
  };

  let selectedModel = localStorage.getItem(MODEL_KEY) || 'best_match';
  if (!MODEL_CONFIG[selectedModel]) selectedModel = 'best_match';

  // Capture the Leaflet map when the existing app creates it.
  let appMap = null;
  if (window.L && L.Map && L.Map.prototype.initialize) {
    const originalInitialize = L.Map.prototype.initialize;
    L.Map.prototype.initialize = function (...args) {
      const result = originalInitialize.apply(this, args);
      if (args[0] === 'leafletMap' || (this._container && this._container.id === 'leafletMap')) {
        appMap = this;
        setTimeout(() => window.dispatchEvent(new CustomEvent('syria-weather-map-ready')), 0);
      }
      return result;
    };
  }

  // Intercept only the existing Open-Meteo forecast requests.
  // This means the current Phase 1 weather renderer continues to work unchanged.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    let url = '';
    try {
      url = typeof input === 'string' ? input : input.url;
    } catch (_) {}

    if (url && url.includes('api.open-meteo.com/v1/forecast')) {
      try {
        const u = new URL(url);
        u.searchParams.delete('models');
        const cfg = MODEL_CONFIG[selectedModel];
        if (cfg && cfg.api) u.searchParams.set('models', cfg.api);
        input = u.toString();
      } catch (_) {}
    }

    // Keep geocoding at 5 results for a cleaner mobile search.
    if (url && url.includes('geocoding-api.open-meteo.com/v1/search')) {
      try {
        const u = new URL(url);
        u.searchParams.set('count', '5');
        input = u.toString();
      } catch (_) {}
    }

    return nativeFetch(input, init);
  };

  function injectStyles() {
    if (document.getElementById('phase21Styles')) return;
    const style = document.createElement('style');
    style.id = 'phase21Styles';
    style.textContent = `
      .phase21-model{
        display:flex;align-items:center;gap:7px;margin:0 0 10px;
        padding:8px 10px;border:1px solid var(--card-border);
        background:rgba(255,255,255,.08);border-radius:14px;
      }
      .phase21-model-label{font-size:11px;color:var(--text-dim);white-space:nowrap}
      .phase21-model select{
        flex:1;min-width:0;border:1px solid var(--card-border);
        border-radius:10px;background:#20263a;color:#fff;
        padding:7px 9px;font:700 12px Cairo,system-ui,sans-serif;
        outline:none;
      }
      .phase21-model select option{background:#20263a;color:#fff}
      .phase21-radar{
        position:absolute;z-index:1000;left:10px;top:10px;
        border:1px solid rgba(255,255,255,.35);border-radius:12px;
        background:rgba(15,20,35,.88);color:#fff;padding:8px 11px;
        font:700 12px Cairo,system-ui,sans-serif;cursor:pointer;
        box-shadow:0 4px 16px rgba(0,0,0,.25);
      }
      .phase21-radar.active{background:#ffd166;color:#241a00}
      .phase21-radar:disabled{opacity:.6;cursor:wait}
      .phase21-radar-note{
        margin-top:5px;text-align:center;font-size:10px;color:var(--text-dim)
      }
      .phase21-source{
        display:inline-flex;align-items:center;gap:5px;margin-top:7px;
        font-size:10.5px;color:var(--text-dim)
      }
      .phase21-dot{width:6px;height:6px;border-radius:50%;background:#ffd166}
      @media(max-width:390px){
        .phase21-model-label{display:none}
        .phase21-model select{font-size:11px}
      }
    `;
    document.head.appendChild(style);
  }

  function modelControl() {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || document.getElementById('phase21ModelRow')) return;

    const row = document.createElement('div');
    row.id = 'phase21ModelRow';
    row.className = 'phase21-model';
    row.innerHTML = `
      <span class="phase21-model-label">النموذج</span>
      <select id="phase21ModelSelect" aria-label="اختيار نموذج الطقس">
        <option value="best_match">⭐ Best Match — تلقائي</option>
        <option value="ecmwf">🇪🇺 ECMWF — IFS</option>
        <option value="gfs">🇺🇸 GFS — NOAA</option>
        <option value="gem">🇨🇦 GEM — Canada</option>
      </select>
    `;

    // Put the model selector immediately below the top bar, without disturbing the existing controls.
    const tabs = document.querySelector('.tabs');
    if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(row, tabs);

    const select = document.getElementById('phase21ModelSelect');
    select.value = selectedModel;

    select.addEventListener('change', () => {
      selectedModel = select.value;
      localStorage.setItem(MODEL_KEY, selectedModel);
      updateModelSource();
      const refresh = document.getElementById('refreshTop');
      if (refresh) refresh.click();
    });
  }

  function updateModelSource() {
    const footer = document.querySelector('.footer-note');
    if (!footer) return;
    const cfg = MODEL_CONFIG[selectedModel];
    footer.innerHTML =
      `البيانات مقدّمة من Open-Meteo · <span class="phase21-source"><span class="phase21-dot"></span>${cfg.label} · ${cfg.desc}</span>`;
  }

  // RainViewer radar. We fetch the live API manifest and use its latest "past" frame.
  let radarLayer = null;
  let radarBusy = false;

  async function loadRadar() {
    if (!appMap || radarBusy) return;
    radarBusy = true;
    const button = document.getElementById('phase21Radar');
    if (button) {
      button.disabled = true;
      button.textContent = '⏳ جاري تحميل الرادار';
    }

    try {
      const res = await nativeFetch('https://api.rainviewer.com/public/weather-maps.json', {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('rainviewer_manifest_failed');
      const data = await res.json();

      const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
      const frame = past[past.length - 1];
      if (!frame || !data.host || !frame.path) throw new Error('rainviewer_no_frame');

      const tileUrl =
        data.host + frame.path +
        '/256/{z}/{x}/{y}/2/1_1.png';

      if (radarLayer) {
        appMap.removeLayer(radarLayer);
        radarLayer = null;
      }

      radarLayer = L.tileLayer(tileUrl, {
        opacity: 0.72,
        minZoom: 0,
        maxZoom: 7,
        maxNativeZoom: 7,
        tileSize: 256,
        attribution: 'Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>'
      });

      radarLayer.addTo(appMap);
      appMap.fitBounds(appMap.getBounds(), { animate: false });
      if (button) {
        button.disabled = false;
        button.classList.add('active');
        button.textContent = '🌧️ إخفاء الرادار';
      }
    } catch (err) {
      console.error('Phase 2.1 RainViewer:', err);
      if (button) {
        button.disabled = false;
        button.textContent = '🌧️ تعذّر تحميل الرادار';
        setTimeout(() => {
          if (button && !radarLayer) button.textContent = '🌧️ رادار المطر';
        }, 2500);
      }
    } finally {
      radarBusy = false;
    }
  }

  function toggleRadar() {
    if (!appMap) return;
    const button = document.getElementById('phase21Radar');

    if (radarLayer) {
      appMap.removeLayer(radarLayer);
      radarLayer = null;
      if (button) {
        button.classList.remove('active');
        button.textContent = '🌧️ رادار المطر';
      }
      return;
    }

    loadRadar();
  }

  function addRadarControl() {
    if (!appMap || !document.getElementById('leafletMap')) return;
    const mapBox = document.getElementById('leafletMap');
    const parent = mapBox.parentElement;
    if (!parent || document.getElementById('phase21Radar')) return;

    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const button = document.createElement('button');
    button.id = 'phase21Radar';
    button.className = 'phase21-radar';
    button.type = 'button';
    button.textContent = '🌧️ رادار المطر';
    button.addEventListener('click', toggleRadar);
    parent.appendChild(button);

    const note = document.createElement('div');
    note.className = 'phase21-radar-note';
    note.textContent = 'الرادار يعرض أحدث صورة رادارية متاحة؛ وليس توقعًا مستقبليًا.';
    parent.appendChild(note);
  }

  function onMapReady() {
    addRadarControl();
  }

  injectStyles();
  modelControl();
  updateModelSource();

  window.addEventListener('syria-weather-map-ready', onMapReady);

  // In case the map already exists before the custom event is observed.
  setTimeout(() => {
    if (appMap) onMapReady();
  }, 0);
})();
