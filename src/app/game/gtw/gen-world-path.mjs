import fs from 'node:fs'
import { feature } from 'topojson-client'
import { geoAzimuthalEquidistant, geoPath } from 'd3-geo'
const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-110m.json','utf8'))
const land = feature(topo, topo.objects.land)
// North-polar azimuthal equidistant. Board is 200x200, pole at (100,100),
// latitude 0 at radius 100 (so the board reaches the equator).
const LON0 = -45, R = 100, EDGE = 80
const proj = geoAzimuthalEquidistant().rotate([-LON0, -90]).clipAngle(EDGE).scale(R / (EDGE * Math.PI / 180)).translate([100, 100]).precision(0.2)
const path = geoPath(proj).digits(1)
const d = path(land)
fs.writeFileSync('polar.txt', d)
// compare with closed form
const f = (lon, lat) => { const rho = (90 - lat) * R / EDGE; const th = (lon - LON0) * Math.PI / 180; return [100 + rho * Math.sin(th), 100 + rho * Math.cos(th)] }
for (const [lon, lat] of [[-77, 38.9], [37.6, 55.75], [150, 52], [-150, 40]]) console.log(lon, lat, proj([lon, lat]).map(v=>v.toFixed(2)).join(','), f(lon,lat).map(v=>v.toFixed(2)).join(','))
console.log('bytes', d.length)
