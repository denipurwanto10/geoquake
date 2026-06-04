import './style.css'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { initApp } from './app.js'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

document.querySelector('#app').innerHTML = `
  <!-- Loading -->
  <div class="loading-screen" id="loading-screen">
    <div class="loading-title">GEOQUAKE</div>
    <div class="loading-sub">Menghubungkan ke server BMKG...</div>
    <div class="loading-bar"><div class="loading-bar-fill"></div></div>
  </div>

  <!-- Header -->
  <header id="header">
    <div class="header-brand">
      <div class="brand-icon">
        <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="18" r="17" stroke="#2a3f58" stroke-width="1.5"/>
          <circle cx="18" cy="18" r="12" stroke="#00e5ff" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
          <circle cx="18" cy="18" r="5" fill="#00e5ff" opacity="0.9"/>
          <line x1="18" y1="1" x2="18" y2="8" stroke="#00e5ff" stroke-width="1.5" opacity="0.6"/>
          <line x1="18" y1="28" x2="18" y2="35" stroke="#00e5ff" stroke-width="1.5" opacity="0.6"/>
          <line x1="1" y1="18" x2="8" y2="18" stroke="#00e5ff" stroke-width="1.5" opacity="0.6"/>
          <line x1="28" y1="18" x2="35" y2="18" stroke="#00e5ff" stroke-width="1.5" opacity="0.6"/>
          <polyline points="4,22 8,14 12,20 16,10 18,18 20,8 24,16 28,12 32,18" stroke="#ef5350" stroke-width="1.5" fill="none" opacity="0.8"/>
        </svg>
      </div>
      <div class="brand-text">
        <h1>GeoQuake</h1>
        <span>Seismic Monitor</span>
      </div>
    </div>

    <!-- Seismograph -->
    <div class="seismo-wrap">
      <canvas id="seismo-canvas" width="200" height="44"></canvas>
    </div>

    <div class="header-divider"></div>

    <div class="header-stats">
      <div class="stat-item">
        <span class="stat-label">Terdata</span>
        <span class="stat-value accent" id="stat-today">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Mag. Maks</span>
        <span class="stat-value warning" id="stat-maxmag">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Tsunami</span>
        <span class="stat-value danger" id="stat-tsunami">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Gempa Dangkal</span>
        <span class="stat-value" style="color:#ef5350" id="stat-shallow">—</span>
      </div>
    </div>

    <div class="header-right">
      <div class="refresh-indicator">
        <div class="pulse-dot" id="pulse-dot"></div>
        <span id="refresh-timer">LIVE</span>
      </div>
      <button class="tool-btn" id="notif-btn">🔕 NOTIF</button>
      <button class="tool-btn active" id="heatmap-btn">◉ HEATMAP</button>
      <button class="refresh-btn" id="refresh-btn">↺ REFRESH</button>
    </div>
  </header>

  <!-- Map -->
  <div id="map-container">
    <div id="map"></div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <span class="filter-label">FILTER MAG:</span>
      <button class="filter-btn" data-bucket="micro" style="--fc:#4fc3f7">&lt;3</button>
      <button class="filter-btn" data-bucket="minor" style="--fc:#81c784">3-4</button>
      <button class="filter-btn" data-bucket="light" style="--fc:#fff176">4-5</button>
      <button class="filter-btn" data-bucket="moderate" style="--fc:#ffb74d">5-6</button>
      <button class="filter-btn" data-bucket="strong" style="--fc:#ef5350">6-7</button>
      <button class="filter-btn" data-bucket="major" style="--fc:#b71c1c">7+</button>
    </div>

    <div class="map-overlay-tl">
      <div class="map-badge"><strong>Wilayah:</strong> INDONESIA &amp; SEKITARNYA</div>
      <div class="map-badge"><strong>Update:</strong> <span id="last-update-time">—</span></div>
    </div>
    <div class="legend-panel">
      <div class="legend-title">Skala Magnitudo</div>
      <div class="legend-items">
        <div class="legend-item"><div class="legend-dot" style="background:#4fc3f7"></div> &lt; 3.0 — Mikro</div>
        <div class="legend-item"><div class="legend-dot" style="background:#81c784"></div> 3.0 – 3.9 — Minor</div>
        <div class="legend-item"><div class="legend-dot" style="background:#fff176"></div> 4.0 – 4.9 — Ringan</div>
        <div class="legend-item"><div class="legend-dot" style="background:#ffb74d"></div> 5.0 – 5.9 — Sedang</div>
        <div class="legend-item"><div class="legend-dot" style="background:#ef5350"></div> 6.0 – 6.9 — Kuat</div>
        <div class="legend-item"><div class="legend-dot" style="background:#b71c1c"></div> ≥ 7.0 — Major</div>
      </div>
    </div>
  </div>

  <!-- Sidebar -->
  <aside id="sidebar">
    <!-- Charts panel -->
    <div class="charts-panel">
      <div class="chart-block">
        <div class="chart-title">DISTRIBUSI MAGNITUDO</div>
        <canvas id="mag-chart" width="160" height="90"></canvas>
      </div>
      <div class="chart-block">
        <div class="chart-title">KLASIFIKASI KEDALAMAN</div>
        <canvas id="depth-chart" width="170" height="90"></canvas>
      </div>
    </div>

    <div class="sidebar-header">
      <div class="sidebar-title">15 Gempa Terbaru</div>
    </div>

    <!-- Latest hero -->
    <div class="latest-hero" id="latest-hero">
      <div class="hero-mag" id="hero-mag">—</div>
      <div class="hero-loc" id="hero-loc">Memuat data...</div>
      <div class="hero-meta">
        <div class="hero-meta-item">
          <span class="hero-meta-label">Kedalaman</span>
          <span class="hero-meta-val" id="hero-depth">—</span>
        </div>
        <div class="hero-meta-item">
          <span class="hero-meta-label">Klasifikasi</span>
          <span class="hero-meta-val depth-class" id="hero-depth-class">—</span>
        </div>
        <div class="hero-meta-item">
          <span class="hero-meta-label">Waktu Relatif</span>
          <span class="hero-meta-val" id="hero-time" style="color:#00e5ff">—</span>
        </div>
      </div>
      <div id="hero-tsunami"></div>
    </div>

    <div class="countdown-bar">
      <div class="countdown-fill" id="countdown-fill" style="width:100%"></div>
    </div>

    <div class="quake-list-wrapper">
      <div id="quake-list">
        <div style="padding:24px 20px;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px;">
          MEMUAT DATA...
        </div>
      </div>
    </div>
  </aside>
`

initApp()
