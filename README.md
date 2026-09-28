# GeoQuake

GeoQuake adalah aplikasi web untuk menampilkan dan memantau data gempa bumi menggunakan data dari BMKG.

Aplikasi ini menampilkan lokasi gempa pada peta, magnitudo, kedalaman, waktu kejadian, wilayah, potensi tsunami, serta beberapa statistik dari data gempa yang diterima.

## Features
 
* Menampilkan data gempa terbaru dari BMKG
* Peta interaktif menggunakan Leaflet
* Marker gempa berdasarkan magnitudo
* Heatmap aktivitas gempa
* Filter berdasarkan magnitudo
* Statistik gempa
* Grafik distribusi magnitudo
* Informasi detail setiap gempa
* Informasi potensi tsunami
* Browser notification untuk gempa dengan magnitudo tertentu
* Auto refresh data setiap 60 detik

## Tech Stack

* JavaScript
* Vite
* Leaflet
* Leaflet.heat
* Axios
* OpenStreetMap
* CARTO
* BMKG Earthquake API

## Data

Data gempa yang digunakan berasal dari BMKG.

Endpoint yang digunakan:

```text
https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json
```

Data yang ditampilkan di aplikasi mengikuti data yang tersedia dari BMKG.

## Project Structure

```text
geoquake/
├── public/
├── src/
│   ├── app.js
│   ├── main.js
│   └── style.css
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

## Installation

Pastikan Node.js dan npm sudah terinstall.

Clone repository:

```bash
git clone https://github.com/denipurwanto10/geoquake.git
```

Masuk ke folder project:

```bash
cd geoquake
```

Install dependencies:

```bash
npm install
```

Jalankan development server:

```bash
npm run dev
```

Setelah itu buka alamat yang diberikan oleh Vite, biasanya:

```text
http://localhost:5173
```

## Build

Untuk membuat production build:

```bash
npm run build
```

Untuk menjalankan hasil build secara lokal:

```bash
npm run preview
```

## Map

Peta menggunakan Leaflet dengan OpenStreetMap dan CARTO sebagai sumber basemap.

Tampilan awal peta berfokus pada wilayah Indonesia.

```text
Latitude  : -2.5
Longitude : 118
Zoom      : 5
```

Ukuran marker menyesuaikan dengan magnitudo gempa. Gempa yang lebih besar akan ditampilkan dengan marker yang lebih besar.

## Magnitude Filter

Gempa dapat difilter berdasarkan kelompok magnitudo:

```text
< 3
3 - 4
4 - 5
5 - 6
6 - 7
7+
```

Filter ini dapat digunakan untuk mengatur gempa yang ditampilkan pada peta dan heatmap.

## Earthquake Depth

Kedalaman gempa dikelompokkan menjadi:

| Kedalaman   | Kategori |
| ----------- | -------- |
| ≤ 60 km     | Dangkal  |
| 60 - 300 km | Menengah |
| > 300 km    | Dalam    |

Pengelompokan ini digunakan untuk kebutuhan tampilan dan informasi pada aplikasi.

## Notification

GeoQuake menggunakan Browser Notification API untuk memberikan notifikasi ketika terdapat gempa baru dengan magnitudo ≥ 5.0.

Notifikasi membutuhkan izin dari browser.

## Auto Refresh

Data akan diperbarui secara otomatis setiap 60 detik.

Selain itu, data juga dapat diperbarui secara manual melalui tombol refresh yang tersedia pada aplikasi.

## Disclaimer

GeoQuake dibuat untuk kebutuhan visualisasi dan monitoring data gempa.

Aplikasi ini bukan merupakan sistem peringatan dini gempa resmi. Informasi yang ditampilkan bergantung pada data yang tersedia dari BMKG.

Untuk informasi resmi mengenai gempa dan potensi tsunami, gunakan informasi dari BMKG dan pihak berwenang terkait.

## Data & Attribution

Data gempa:

**BMKG — Badan Meteorologi, Klimatologi, dan Geofisika**

Data peta:

**OpenStreetMap contributors**

Basemap:

**CARTO**
