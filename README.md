# City Survey Demo

Responsive demonstration of a survey app backed by `testData.json` and `testData.geojson`.

- Chart.js: gender percentage bar chart and favorite-number scatter plot.
- Leaflet: GeoJSON city map.
- Nominatim/OpenStreetMap: city/state geocoding for this prototype.
- `worker.js`: Test-2-style Cloudflare Worker for GitHub writes.

The browser is read-only until `WRITE_API_URL` in `app.js` points to a deployed Worker. The Worker needs a GitHub secret named `GITHUB_TOKEN` and should be configured for the repository containing this app/data.

The U.S. Census Geocoder is authoritative but its current geocoding API is address-oriented, so this city/state-only prototype uses Nominatim instead.
