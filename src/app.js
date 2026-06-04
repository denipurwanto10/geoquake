import L from 'leaflet'
import 'leaflet.heat'

// ─── Config ───────────────────────────────────────────────────────────────────
const BMKG_LIST_URL = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json'
const REFRESH_INTERVAL = 60
const PROXY_URL = 'https://api.allorigins.win/get?url='

// ─── State ────────────────────────────────────────────────────────────────────
let map = null
let markers = []
let heatLayer = null
let quakeData = []
let activeIndex = 0
let refreshTimer = null
let countdownInterval = null
let countdownSec = REFRESH_INTERVAL
let heatmapMode = false
let activeFilters = new Set(['micro','minor','light','moderate','strong','major'])
let seismoCtx = null
let seismoAnim = null
let seismoPhase = 0
let notifPermission = false
let prevLatestId = null

// ─── Mag helpers ─────────────────────────────────────────────────────────────
export function getMagColor(mag) {
  const m = parseFloat(mag)
  if (m < 3.0) return '#4fc3f7'
  if (m < 4.0) return '#81c784'
  if (m < 5.0) return '#fff176'
  if (m < 6.0) return '#ffb74d'
  if (m < 7.0) return '#ef5350'
  return '#b71c1c'
}
function getMagSize(mag) {
  const m = parseFloat(mag)
  if (m < 3.0) return 10
  if (m < 4.0) return 14
  if (m < 5.0) return 18
  if (m < 6.0) return 24
  if (m < 7.0) return 32
  return 42
}
function getMagClass(mag) {
  const m = parseFloat(mag)
  if (m < 3.0) return 'Mikro'
  if (m < 4.0) return 'Minor'
  if (m < 5.0) return 'Ringan'
  if (m < 6.0) return 'Sedang'
  if (m < 7.0) return 'Kuat'
  return 'MAJOR'
}
function getMagBucket(mag) {
  const m = parseFloat(mag)
  if (m < 3.0) return 'micro'
  if (m < 4.0) return 'minor'
  if (m < 5.0) return 'light'
  if (m < 6.0) return 'moderate'
  if (m < 7.0) return 'strong'
  return 'major'
}

// ─── Depth classifier ────────────────────────────────────────────────────────
function getDepthInfo(kedalaman) {
  const match = kedalaman ? kedalaman.match(/(\d+)/) : null
  const km = match ? parseInt(match[1]) : 0
  if (km <= 60) return { label: 'Dangkal', color: '#ef5350', desc: '≤ 60 km — risiko kerusakan tinggi' }
  if (km <= 300) return { label: 'Menengah', color: '#ffb74d', desc: '60–300 km' }
  return { label: 'Dalam', color: '#4fc3f7', desc: '> 300 km — relatif aman di permukaan' }
}

// ─── Time relative ───────────────────────────────────────────────────────────
function relativeTime(tanggal, jam) {
  try {
    // BMKG format: "01-Jun-2025" and "20:15:34 WIB"
    const dateStr = tanggal + ' ' + (jam || '').replace(' WIB','').replace(' WITA','').replace(' WIT','')
    const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11}
    const parts = tanggal.split('-')
    if (parts.length !== 3) return jam || ''
    const [d, monStr, y] = parts
    const mon = months[monStr]
    if (mon === undefined) return jam || ''
    const timeParts = (jam||'').replace(/ WI[TB]A?/,'').split(':')
    const dt = new Date(parseInt(y), mon, parseInt(d),
      parseInt(timeParts[0]||0), parseInt(timeParts[1]||0), parseInt(timeParts[2]||0))
    const diffMs = Date.now() - dt.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Baru saja'
    if (diffMin < 60) return `${diffMin} menit lalu`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH} jam lalu`
    const diffD = Math.floor(diffH / 24)
    return `${diffD} hari lalu`
  } catch(e) { return jam || '' }
}

// ─── Map init ─────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { center: [-2.5, 118], zoom: 5, zoomControl: true })

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map)
}

// ─── Marker creation ──────────────────────────────────────────────────────────
function createMarker(quake, index) {
  const lat = parseFloat(quake.Lintang)
  const lon = parseFloat(quake.Bujur)
  const mag = parseFloat(quake.Magnitude)
  const color = getMagColor(mag)
  const size = getMagSize(mag)
  const isLatest = index === 0
  const depthInfo = getDepthInfo(quake.Kedalaman)

  const pulseHtml = isLatest ? `
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:${size+20}px;height:${size+20}px;border-radius:50%;border:2px solid ${color};
      animation:ripple-out 2s ease-out infinite;pointer-events:none;"></div>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:${size+40}px;height:${size+40}px;border-radius:50%;border:1px solid ${color};
      animation:ripple-out 2s ease-out 0.5s infinite;pointer-events:none;"></div>
  ` : ''

  const icon = L.divIcon({
    className: '',
    html: `
      <style>@keyframes ripple-out{0%{transform:translate(-50%,-50%) scale(1);opacity:.7}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}</style>
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${pulseHtml}
        <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};
          opacity:${isLatest?0.95:0.75};border:2px solid rgba(255,255,255,0.3);
          box-shadow:0 0 ${isLatest?16:8}px ${color}80;cursor:pointer;"></div>
      </div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -(size/2+8)],
  })

  const marker = L.marker([lat, lon], { icon })
  const tsunamiHtml = quake.Potensi && quake.Potensi.toLowerCase().includes('tsunami')
    ? `<div class="popup-tsunami"><div class="tsunami-badge yes">⚠ POTENSI TSUNAMI</div></div>`
    : `<div class="popup-tsunami"><div class="tsunami-badge no">✓ TIDAK ADA POTENSI TSUNAMI</div></div>`

  const relTime = relativeTime(quake.Tanggal, quake.Jam)

  marker.bindPopup(`
    <div class="popup-content">
      <div class="popup-mag-row">
        <div class="popup-mag-num" style="color:${color}">${quake.Magnitude}</div>
        <div>
          <div class="popup-mag-label">MAGNITUDO</div>
          <div style="font-family:'Space Mono',monospace;font-size:10px;color:${color}">${getMagClass(mag)}</div>
        </div>
      </div>
      <div class="popup-field">
        <div class="popup-field-label">Lokasi</div>
        <div class="popup-field-value">${quake.Wilayah || quake.Keterangan}</div>
      </div>
      <div class="popup-field">
        <div class="popup-field-label">Kedalaman</div>
        <div class="popup-field-value">
          ${quake.Kedalaman}
          <span style="margin-left:6px;padding:1px 6px;border-radius:2px;font-size:9px;font-family:'Space Mono',monospace;
            background:${depthInfo.color}22;color:${depthInfo.color};border:1px solid ${depthInfo.color}44;">
            ${depthInfo.label}
          </span>
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:9px;color:#3d5168;margin-top:2px;">${depthInfo.desc}</div>
      </div>
      <div class="popup-field">
        <div class="popup-field-label">Koordinat</div>
        <div class="popup-field-value">${quake.Lintang}, ${quake.Bujur}</div>
      </div>
      <div class="popup-field">
        <div class="popup-field-label">Waktu</div>
        <div class="popup-field-value">${quake.Tanggal} — ${quake.Jam}</div>
        <div style="font-family:'Space Mono',monospace;font-size:10px;color:#00e5ff;margin-top:2px;">${relTime}</div>
      </div>
      ${tsunamiHtml}
    </div>
  `, { maxWidth: 300, className: 'custom-popup' })

  marker.on('click', () => setActive(index))
  return marker
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
function renderHeatmap(quakes) {
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null }
  const points = quakes.map(q => {
    const lat = parseFloat(q.Lintang)
    const lon = parseFloat(q.Bujur)
    const intensity = parseFloat(q.Magnitude) / 9
    return [lat, lon, intensity]
  }).filter(p => !isNaN(p[0]) && !isNaN(p[1]))
  heatLayer = L.heatLayer(points, {
    radius: 45, blur: 30, maxZoom: 10,
    gradient: { 0.2:'#4fc3f7', 0.4:'#81c784', 0.6:'#fff176', 0.75:'#ffb74d', 0.9:'#ef5350', 1.0:'#b71c1c' }
  }).addTo(map)
}

// ─── Filter quakes ────────────────────────────────────────────────────────────
function getFilteredQuakes() {
  return quakeData.filter(q => activeFilters.has(getMagBucket(q.Magnitude)))
}

// ─── Render markers ───────────────────────────────────────────────────────────
function renderMarkers(quakes) {
  markers.forEach(m => map.removeLayer(m))
  markers = []
  const filtered = quakes.filter(q => activeFilters.has(getMagBucket(q.Magnitude)))
  filtered.forEach((quake, i) => {
    try {
      const origIndex = quakes.indexOf(quake)
      const marker = createMarker(quake, origIndex)
      marker.addTo(map)
      markers.push(marker)
    } catch(e) { console.warn('Marker error:', e) }
  })
}

// ─── Render sidebar list ──────────────────────────────────────────────────────
function renderList(quakes) {
  const list = document.getElementById('quake-list')
  if (!list) return

  list.innerHTML = quakes.map((q, i) => {
    const mag = parseFloat(q.Magnitude)
    const color = getMagColor(mag)
    const tsunamiIcon = q.Potensi && q.Potensi.toLowerCase().includes('tsunami')
      ? `<span style="color:#ef5350;font-size:9px;margin-left:4px;">⚠</span>` : ''
    const depthInfo = getDepthInfo(q.Kedalaman)
    const relTime = relativeTime(q.Tanggal, q.Jam)

    return `
      <div class="quake-item ${i === activeIndex ? 'active' : ''}" data-index="${i}">
        <div class="quake-item-num">${i + 1}</div>
        <div class="quake-item-mag" style="color:${color}">${q.Magnitude}</div>
        <div class="quake-item-info">
          <div class="quake-item-loc">${q.Wilayah || q.Keterangan}${tsunamiIcon}</div>
          <div class="quake-item-meta">
            <span style="color:${depthInfo.color}">${depthInfo.label}</span>
            · ${q.Kedalaman}
            · <span style="color:#00e5ff">${relTime}</span>
          </div>
        </div>
      </div>`
  }).join('')

  list.querySelectorAll('.quake-item').forEach(el => {
    el.addEventListener('click', () => setActive(parseInt(el.dataset.index)))
  })
}

// ─── Update hero ──────────────────────────────────────────────────────────────
function updateHero(quake) {
  const mag = parseFloat(quake.Magnitude)
  const color = getMagColor(mag)
  const depthInfo = getDepthInfo(quake.Kedalaman)
  const relTime = relativeTime(quake.Tanggal, quake.Jam)

  const set = (id, val, style) => {
    const el = document.getElementById(id)
    if (el) { el.textContent = val; if (style) Object.assign(el.style, style) }
  }
  set('hero-mag', quake.Magnitude, { color })
  set('hero-loc', quake.Wilayah || quake.Keterangan)
  set('hero-depth', quake.Kedalaman)
  set('hero-time', relTime, { color: '#00e5ff' })

  const depthEl = document.getElementById('hero-depth-class')
  if (depthEl) {
    depthEl.textContent = depthInfo.label
    depthEl.style.color = depthInfo.color
    depthEl.style.borderColor = depthInfo.color
  }

  const tsunamiEl = document.getElementById('hero-tsunami')
  if (tsunamiEl) {
    const has = quake.Potensi && quake.Potensi.toLowerCase().includes('tsunami')
    tsunamiEl.innerHTML = has
      ? `<div class="tsunami-badge yes">⚠ POTENSI TSUNAMI</div>`
      : `<div class="tsunami-badge no">✓ TIDAK ADA POTENSI TSUNAMI</div>`
  }
}

// ─── Update stats ─────────────────────────────────────────────────────────────
function updateStats(quakes) {
  const maxMag = Math.max(...quakes.map(q => parseFloat(q.Magnitude || 0)))
  const tsunamiCount = quakes.filter(q => q.Potensi && q.Potensi.toLowerCase().includes('tsunami')).length
  const shallowCount = quakes.filter(q => {
    const m = q.Kedalaman ? q.Kedalaman.match(/(\d+)/) : null
    return m && parseInt(m[1]) <= 60
  }).length

  const s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
  s('stat-today', quakes.length)
  s('stat-maxmag', maxMag.toFixed(1))
  s('stat-tsunami', tsunamiCount)
  s('stat-shallow', shallowCount)

  const lastUpdate = document.getElementById('last-update-time')
  if (lastUpdate) {
    lastUpdate.textContent = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  }

  renderCharts(quakes)
}

// ─── Charts ───────────────────────────────────────────────────────────────────
function renderCharts(quakes) {
  renderMagChart(quakes)
  renderDepthChart(quakes)
}

function renderMagChart(quakes) {
  const canvas = document.getElementById('mag-chart')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height

  const bins = [
    { label: '<3', min: 0, max: 3, color: '#4fc3f7' },
    { label: '3-4', min: 3, max: 4, color: '#81c784' },
    { label: '4-5', min: 4, max: 5, color: '#fff176' },
    { label: '5-6', min: 5, max: 6, color: '#ffb74d' },
    { label: '6-7', min: 6, max: 7, color: '#ef5350' },
    { label: '7+', min: 7, max: 99, color: '#b71c1c' },
  ]
  bins.forEach(b => {
    b.count = quakes.filter(q => {
      const m = parseFloat(q.Magnitude)
      return m >= b.min && m < b.max
    }).length
  })
  const maxCount = Math.max(...bins.map(b => b.count), 1)

  ctx.clearRect(0, 0, W, H)
  const padL = 28, padR = 8, padT = 8, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const barW = chartW / bins.length
  const barGap = 4

  // Grid lines
  ctx.strokeStyle = '#1e2d40'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padT + chartH - (i / 4) * chartH
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke()
    ctx.fillStyle = '#3d5168'
    ctx.font = '8px Space Mono, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(Math.round((i / 4) * maxCount), padL - 4, y + 3)
  }

  bins.forEach((b, i) => {
    const barH = maxCount > 0 ? (b.count / maxCount) * chartH : 0
    const x = padL + i * barW + barGap / 2
    const y = padT + chartH - barH
    const w = barW - barGap

    // Bar fill
    const grad = ctx.createLinearGradient(0, y, 0, padT + chartH)
    grad.addColorStop(0, b.color)
    grad.addColorStop(1, b.color + '44')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, barH)

    // Count label on top of bar
    if (b.count > 0) {
      ctx.fillStyle = b.color
      ctx.font = 'bold 9px Space Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(b.count, x + w / 2, y - 3)
    }

    // X label
    ctx.fillStyle = '#7a95b0'
    ctx.font = '8px Space Mono, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(b.label, x + w / 2, H - padB + 12)
  })
}

function renderDepthChart(quakes) {
  const canvas = document.getElementById('depth-chart')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height

  const categories = [
    { label: 'Dangkal', color: '#ef5350', count: 0 },
    { label: 'Menengah', color: '#ffb74d', count: 0 },
    { label: 'Dalam', color: '#4fc3f7', count: 0 },
  ]
  quakes.forEach(q => {
    const m = q.Kedalaman ? q.Kedalaman.match(/(\d+)/) : null
    const km = m ? parseInt(m[1]) : 0
    if (km <= 60) categories[0].count++
    else if (km <= 300) categories[1].count++
    else categories[2].count++
  })

  const total = quakes.length || 1
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2 - 10, cy = H / 2, r = Math.min(W, H) / 2 - 8
  let startAngle = -Math.PI / 2

  categories.forEach(cat => {
    const slice = (cat.count / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, startAngle, startAngle + slice)
    ctx.closePath()
    ctx.fillStyle = cat.color + 'cc'
    ctx.fill()
    ctx.strokeStyle = '#0b1018'
    ctx.lineWidth = 2
    ctx.stroke()
    startAngle += slice
  })

  // Donut hole
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
  ctx.fillStyle = '#0f1520'
  ctx.fill()

  // Total in center
  ctx.fillStyle = '#e8edf3'
  ctx.font = 'bold 14px Rajdhani, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(total, cx, cy - 4)
  ctx.font = '7px Space Mono, monospace'
  ctx.fillStyle = '#3d5168'
  ctx.fillText('TOTAL', cx, cy + 8)

  // Legend
  const legendX = W - 72
  categories.forEach((cat, i) => {
    const ly = 14 + i * 20
    ctx.fillStyle = cat.color
    ctx.fillRect(legendX, ly, 8, 8)
    ctx.fillStyle = '#7a95b0'
    ctx.font = '8px Space Mono, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`${cat.label} (${cat.count})`, legendX + 12, ly)
  })
}

// ─── Seismograph ──────────────────────────────────────────────────────────────
function initSeismograph() {
  const canvas = document.getElementById('seismo-canvas')
  if (!canvas) return
  seismoCtx = canvas.getContext('2d')
  animateSeismo()
}

let seismoData = []
const SEISMO_LEN = 200

function animateSeismo() {
  const canvas = document.getElementById('seismo-canvas')
  if (!canvas || !seismoCtx) return

  const W = canvas.width, H = canvas.height
  const mid = H / 2

  // Generate new data point
  let noise = (Math.random() - 0.5) * 4
  if (quakeData.length > 0) {
    const mag = parseFloat(quakeData[0]?.Magnitude || 0)
    noise += Math.sin(seismoPhase * 0.3) * (mag - 2) * 2
    noise += Math.sin(seismoPhase * 0.7) * (mag - 3)
    noise += Math.sin(seismoPhase * 1.3) * Math.random() * (mag - 2)
  }
  seismoPhase++
  seismoData.push(noise)
  if (seismoData.length > SEISMO_LEN) seismoData.shift()

  seismoCtx.clearRect(0, 0, W, H)

  // Background grid
  seismoCtx.strokeStyle = 'rgba(30,45,64,0.5)'
  seismoCtx.lineWidth = 0.5
  for (let y = 0; y < H; y += H/4) {
    seismoCtx.beginPath(); seismoCtx.moveTo(0, y); seismoCtx.lineTo(W, y); seismoCtx.stroke()
  }
  seismoCtx.beginPath(); seismoCtx.moveTo(0, mid); seismoCtx.lineTo(W, mid)
  seismoCtx.strokeStyle = 'rgba(0,229,255,0.15)'; seismoCtx.stroke()

  // Waveform
  if (seismoData.length > 1) {
    seismoCtx.beginPath()
    seismoData.forEach((val, i) => {
      const x = (i / SEISMO_LEN) * W
      const y = mid + val * 3
      i === 0 ? seismoCtx.moveTo(x, y) : seismoCtx.lineTo(x, y)
    })
    const grad = seismoCtx.createLinearGradient(0, 0, W, 0)
    grad.addColorStop(0, 'rgba(0,229,255,0.1)')
    grad.addColorStop(0.7, 'rgba(0,229,255,0.6)')
    grad.addColorStop(1, '#00e5ff')
    seismoCtx.strokeStyle = grad
    seismoCtx.lineWidth = 1.5
    seismoCtx.stroke()

    // Leading dot
    const lastX = ((seismoData.length - 1) / SEISMO_LEN) * W
    const lastY = mid + seismoData[seismoData.length-1] * 3
    seismoCtx.beginPath()
    seismoCtx.arc(lastX, lastY, 3, 0, Math.PI*2)
    seismoCtx.fillStyle = '#00e5ff'
    seismoCtx.fill()
  }

  seismoAnim = requestAnimationFrame(animateSeismo)
}

// ─── Notification ─────────────────────────────────────────────────────────────
async function requestNotifPermission() {
  if (!('Notification' in window)) return
  const perm = await Notification.requestPermission()
  notifPermission = perm === 'granted'
  updateNotifBtn()
}

function updateNotifBtn() {
  const btn = document.getElementById('notif-btn')
  if (!btn) return
  if (notifPermission) {
    btn.textContent = '🔔 NOTIF ON'
    btn.style.borderColor = '#81c784'
    btn.style.color = '#81c784'
  } else {
    btn.textContent = '🔕 NOTIF'
    btn.style.borderColor = ''
    btn.style.color = ''
  }
}

function sendNotification(quake) {
  if (!notifPermission) return
  const mag = parseFloat(quake.Magnitude)
  if (mag < 5.0) return
  new Notification(`🌍 Gempa M${quake.Magnitude} — ${getMagClass(mag)}`, {
    body: `${quake.Wilayah || quake.Keterangan}\nKedalaman: ${quake.Kedalaman}`,
    icon: '/vite.svg',
  })
}

// ─── Toggle heatmap ───────────────────────────────────────────────────────────
function toggleHeatmap() {
  heatmapMode = !heatmapMode
  const btn = document.getElementById('heatmap-btn')
  if (heatmapMode) {
    markers.forEach(m => map.removeLayer(m))
    renderHeatmap(quakeData)
    if (btn) { btn.textContent = '● MARKER'; btn.classList.add('active') }
  } else {
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null }
    renderMarkers(quakeData)
    if (btn) { btn.textContent = '◉ HEATMAP'; btn.classList.remove('active') }
  }
}

// ─── Filter toggle ────────────────────────────────────────────────────────────
function toggleFilter(bucket) {
  if (activeFilters.has(bucket)) {
    if (activeFilters.size === 1) return // keep at least one
    activeFilters.delete(bucket)
  } else {
    activeFilters.add(bucket)
  }
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const b = btn.dataset.bucket
    btn.classList.toggle('inactive', !activeFilters.has(b))
  })
  if (!heatmapMode) renderMarkers(quakeData)
  else renderHeatmap(getFilteredQuakes())
}

// ─── Set active quake ─────────────────────────────────────────────────────────
function setActive(index) {
  activeIndex = index
  const quake = quakeData[index]
  if (!quake) return
  updateHero(quake)
  renderList(quakeData)
  const lat = parseFloat(quake.Lintang), lon = parseFloat(quake.Bujur)
  if (!isNaN(lat) && !isNaN(lon)) {
    map.flyTo([lat, lon], 8, { duration: 1.2 })
    const markerIdx = markers.findIndex((m,i) => {
      const ll = m.getLatLng()
      return Math.abs(ll.lat - lat) < 0.001 && Math.abs(ll.lng - lon) < 0.001
    })
    if (markerIdx >= 0) setTimeout(() => markers[markerIdx].openPopup(), 1200)
  }
}

// ─── Fetch BMKG ───────────────────────────────────────────────────────────────
async function fetchBMKG() {
  try {
    const res = await fetch(BMKG_LIST_URL, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json?.Infogempa?.gempa || []
  } catch(e) {
    const proxyRes = await fetch(PROXY_URL + encodeURIComponent(BMKG_LIST_URL))
    const proxyJson = await proxyRes.json()
    const data = JSON.parse(proxyJson.contents)
    return data?.Infogempa?.gempa || []
  }
}

// ─── Load data ────────────────────────────────────────────────────────────────
async function loadData() {
  const refreshBtn = document.getElementById('refresh-btn')
  const pulseDot = document.getElementById('pulse-dot')
  if (refreshBtn) refreshBtn.disabled = true
  if (pulseDot) pulseDot.style.animation = 'none'

  try {
    const gempa = await fetchBMKG()
    if (!gempa || gempa.length === 0) throw new Error('Data kosong')

    quakeData = gempa.slice(0, 15)

    // Check for new quake notification
    const newId = quakeData[0]?.Tanggal + quakeData[0]?.Jam
    if (prevLatestId && newId !== prevLatestId) sendNotification(quakeData[0])
    prevLatestId = newId

    if (heatmapMode) renderHeatmap(quakeData)
    else renderMarkers(quakeData)

    renderList(quakeData)
    updateHero(quakeData[0])
    updateStats(quakeData)

    const loading = document.getElementById('loading-screen')
    if (loading && !loading.classList.contains('fade-out')) {
      loading.classList.add('fade-out')
      setTimeout(() => loading.remove(), 600)
    }
    removeErrorToast()
  } catch(err) {
    console.error('BMKG fetch error:', err)
    showErrorToast('Gagal memuat data BMKG. Mencoba ulang...')
    const loading = document.getElementById('loading-screen')
    if (loading) {
      const sub = loading.querySelector('.loading-sub')
      if (sub) sub.textContent = 'Koneksi gagal. Retrying...'
    }
  } finally {
    if (refreshBtn) refreshBtn.disabled = false
    if (pulseDot) pulseDot.style.animation = ''
  }
}

// ─── Error toast ──────────────────────────────────────────────────────────────
function showErrorToast(msg) {
  removeErrorToast()
  const mc = document.getElementById('map-container')
  if (!mc) return
  const toast = document.createElement('div')
  toast.className = 'error-toast'; toast.id = 'error-toast'; toast.textContent = msg
  mc.appendChild(toast)
  setTimeout(removeErrorToast, 5000)
}
function removeErrorToast() {
  const t = document.getElementById('error-toast'); if (t) t.remove()
}

// ─── Countdown ────────────────────────────────────────────────────────────────
function startCountdown() {
  countdownSec = REFRESH_INTERVAL
  clearInterval(countdownInterval)
  countdownInterval = setInterval(() => {
    countdownSec--
    const fill = document.getElementById('countdown-fill')
    const timer = document.getElementById('refresh-timer')
    if (fill) fill.style.width = `${(countdownSec / REFRESH_INTERVAL) * 100}%`
    if (timer) timer.textContent = `${countdownSec}s`
    if (countdownSec <= 0) { clearInterval(countdownInterval); if (timer) timer.textContent = 'LIVE' }
  }, 1000)
}

function startAutoRefresh() {
  clearInterval(refreshTimer)
  startCountdown()
  refreshTimer = setInterval(async () => { await loadData(); startCountdown() }, REFRESH_INTERVAL * 1000)
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initApp() {
  initMap()
  await loadData()
  startAutoRefresh()
  initSeismograph()

  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    clearInterval(refreshTimer); clearInterval(countdownInterval)
    await loadData(); startAutoRefresh()
  })
  document.getElementById('heatmap-btn')?.addEventListener('click', toggleHeatmap)
  document.getElementById('notif-btn')?.addEventListener('click', requestNotifPermission)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleFilter(btn.dataset.bucket))
  })
}
