import { useEffect, useRef, useState } from 'react'

// A route on an OpenStreetMap map. Leaflet (and its stylesheet) only loads
// when a map is first shown, so the rest of Daybook doesn't carry it. With no
// connection the tiles don't load, but the route line still draws.
//
// points: [lat, lon, sec, ele, newStretch] — a point marked as starting a new
// stretch (after a pause) begins a new line. `follow` keeps the newest point
// in view while tracking.

const COLOR = '#1F3A5F' // --accent; Leaflet draws on canvas/SVG and can't read CSS variables

export default function RouteMap({ points, follow = false, height = 240 }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const L = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let gone = false
    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => {
      if (gone || !box.current) return
      L.current = mod.default || mod
      map.current = L.current.map(box.current, { zoomControl: true, attributionControl: true })
      L.current.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current)
      layer.current = L.current.layerGroup().addTo(map.current)
      draw(true)
    }).catch(() => setFailed(true))
    return () => { gone = true; map.current?.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { draw(!follow) }, [points]) // eslint-disable-line react-hooks/exhaustive-deps

  function draw(fit) {
    if (!map.current || !L.current) return
    layer.current.clearLayers()
    if (!points?.length) { map.current.setView([39.5, -98.35], 3); return }
    const lines = [[]]
    for (const p of points) {
      if (p[4] && lines[lines.length - 1].length) lines.push([])
      lines[lines.length - 1].push([p[0], p[1]])
    }
    for (const l of lines) if (l.length > 1) L.current.polyline(l, { color: COLOR, weight: 4, opacity: 0.9 }).addTo(layer.current)
    const first = points[0], last = points[points.length - 1]
    L.current.circleMarker([first[0], first[1]], { radius: 6, color: '#fff', weight: 2, fillColor: '#2C7D55', fillOpacity: 1 }).addTo(layer.current)
    L.current.circleMarker([last[0], last[1]], { radius: 6, color: '#fff', weight: 2, fillColor: follow ? '#E3B23C' : '#A3341F', fillOpacity: 1 }).addTo(layer.current)
    if (follow) map.current.setView([last[0], last[1]], Math.max(map.current.getZoom() || 0, 16))
    else if (fit) map.current.fitBounds(L.current.latLngBounds(points.map((p) => [p[0], p[1]])), { padding: [20, 20], maxZoom: 17 })
  }

  if (failed) return <p className="note">The map couldn’t load. The route is still saved.</p>
  return <div ref={box} className="route-map" style={{ height }} role="img" aria-label="Map of the route" />
}
