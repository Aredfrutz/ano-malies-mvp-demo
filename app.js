// 1. Initialize Supabase (REPLACE THESE WITH YOUR ACTUAL KEYS)
const SUPABASE_URL = 'https://evrgiezhxrudluogyzeg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2cmdpZXpoeHJ1ZGx1b2d5emVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NDE1NDUsImV4cCI6MjEwOTAxNzU0NX0.wXBi9-pmU9R9mbwKZlhRxf0B77itA3ZO3P3BkN765D4';
const supabaseClient = SUPABASE_ANON_KEY === '******'
    ? null
    : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const formStatus = document.getElementById('formStatus');

function showFormStatus(message, isError = false) {
    formStatus.textContent = message;
    formStatus.classList.toggle('text-danger', isError);
    formStatus.classList.toggle('text-success', !isError);
}

if (!supabaseClient) {
    showFormStatus('Add your Supabase anon key in app.js to enable report submission.', true);
}

// 2. Initialize Leaflet Map using the official Gulod boundary geometry.
const gulodBoundary = window.GULOD_BOUNDARY;
const gulodBounds = L.latLngBounds(gulodBoundary);
const gulodCoords = gulodBounds.getCenter();
const map = L.map('map', {
    center: gulodCoords,
    zoom: 17,
    minZoom: 17,
    maxZoom: 22,
    zoomSnap: 0.5,
    maxBounds: gulodBounds.pad(0.18),
    maxBoundsViscosity: 1.0
});

const mapTileUrl = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
const tileLayerOptions = {
    maxZoom: 22,
    attribution: '&copy; Google Maps &middot; Boundary &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
};
L.tileLayer(mapTileUrl, {
    ...tileLayerOptions,
    className: 'gulod-blurred-tiles'
}).addTo(map);

const sharpMapPane = map.createPane('gulodSharpPane');
sharpMapPane.classList.add('gulod-sharp-pane');
sharpMapPane.style.zIndex = '210';
L.tileLayer(mapTileUrl, {
    ...tileLayerOptions,
    pane: 'gulodSharpPane'
}).addTo(map);

const gulodOutline = document.createElement('canvas');
gulodOutline.className = 'gulod-outline';
gulodOutline.setAttribute('aria-hidden', 'true');
map.getContainer().appendChild(gulodOutline);

function updateGulodClip() {
    const size = map.getSize();
    sharpMapPane.style.width = `${size.x}px`;
    sharpMapPane.style.height = `${size.y}px`;
    const points = gulodBoundary.map(coordinate => {
        const containerPoint = map.latLngToContainerPoint(coordinate);
        const layerPoint = map.latLngToLayerPoint(coordinate);
        return {
            x: containerPoint.x,
            y: containerPoint.y,
            clipX: layerPoint.x,
            clipY: layerPoint.y
        };
    });
    sharpMapPane.style.clipPath = `polygon(${points.map(point => `${point.clipX}px ${point.clipY}px`).join(', ')})`;

    const pixelRatio = window.devicePixelRatio || 1;
    if (gulodOutline.width !== size.x * pixelRatio || gulodOutline.height !== size.y * pixelRatio) {
        gulodOutline.width = size.x * pixelRatio;
        gulodOutline.height = size.y * pixelRatio;
    }
    const context = gulodOutline.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size.x, size.y);
    context.beginPath();
    points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.strokeStyle = '#426cf5';
    context.lineWidth = 3;
    context.stroke();
}

map.on('move zoom resize', updateGulodClip);
updateGulodClip();

// Variables to hold markers
let tempPin = null;
let reportMarkers = L.layerGroup().addTo(map);

function isInsideGulod(point) {
    const [latitude, longitude] = point;
    let inside = false;

    for (let i = 0, j = gulodBoundary.length - 1; i < gulodBoundary.length; j = i++) {
        const [currentLat, currentLng] = gulodBoundary[i];
        const [previousLat, previousLng] = gulodBoundary[j];
        const crosses = (currentLng > longitude) !== (previousLng > longitude)
            && latitude < (previousLat - currentLat) * (longitude - currentLng)
                / (previousLng - currentLng) + currentLat;

        if (crosses) inside = !inside;
    }

    return inside;
}

// 3. Handle Map Clicks (Placing a temporary pin)
map.on('click', function(e) {
    if (!isInsideGulod([e.latlng.lat, e.latlng.lng])) {
        showFormStatus('Choose a location inside the Gulod boundary.', true);
        return;
    }

    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);

    // Auto-fill sidebar form
    document.getElementById('lat').value = lat;
    document.getElementById('lng').value = lng;
    document.getElementById('errorMsg').classList.add('d-none');

    // Place or move temporary pin
    if (tempPin) {
        tempPin.setLatLng(e.latlng);
    } else {
        tempPin = L.marker(e.latlng, {
            icon: L.divIcon({
                className: '',
                html: '<span class="temp-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>',
                iconSize: [38, 38],
                iconAnchor: [19, 34],
                popupAnchor: [0, -32]
            })
        }).addTo(map);
    }
});

// 4. Color Mapping function for Categories
function getColorForCategory(category) {
    switch(category) {
        case 'Weather & Environmental Hazards': return '#3388ff';
        case 'Infrastructure & Pavement Issues': return '#ff7800';
        case 'Public Safety & Utilities': return '#e31a1c';
        case 'Waste Management & Sanitation': return '#8c510a';
        case 'Community Mobility Obstructions': return '#984ea3';
        default: return '#808080';
    }
}

function getCategoryIcon(category) {
    if (category === 'Weather & Environmental Hazards') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>';
    }
    if (category === 'Infrastructure & Pavement Issues') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17 6-6 4 4 8-9M15 6h6v6"/></svg>';
    }
    if (category === 'Public Safety & Utilities') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>';
    }
    if (category === 'Waste Management & Sanitation') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14l-2-8H7l-2 8Zm3 0v2m8-2v2M8 9l1-4h6l1 4M7 13h.01M17 13h.01"/></svg>';
}

function getCategoryIconClass(category) {
    switch(category) {
        case 'Weather & Environmental Hazards': return 'weather';
        case 'Infrastructure & Pavement Issues': return 'infra';
        case 'Public Safety & Utilities': return 'safety';
        case 'Waste Management & Sanitation': return 'waste';
        case 'Community Mobility Obstructions': return 'mobility';
        default: return 'mobility';
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

// 5. Fetch and Render Existing Reports from Supabase
async function fetchReports() {
    if (!supabaseClient) return;
    reportMarkers.clearLayers(); // Clear existing markers before refresh

    const { data, error } = await supabaseClient
        .from('hazard_reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching reports:', error);
        showFormStatus(`Unable to load reports: ${error.message}`, true);
        return;
    }

    data.forEach(report => {
        // Calculate time elapsed
        const submitted = new Date(report.created_at);
        const now = new Date();
        const diffHrs = Math.floor((now - submitted) / (1000 * 60 * 60));
        let timeString = diffHrs < 1 ? 'Just now' : `${diffHrs} hours ago`;
        if (diffHrs > 24) timeString = `${Math.floor(diffHrs/24)} days ago`;

        const categoryClass = getCategoryIconClass(report.category);
        const icon = L.divIcon({
            className: '',
            html: `<span class="report-marker ${categoryClass}" style="color:${getColorForCategory(report.category)}">${getCategoryIcon(report.category)}</span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 32],
            popupAnchor: [0, -29]
        });
        if (!isInsideGulod([report.lat, report.lng])) return;

        const marker = L.marker([report.lat, report.lng], { icon });

        const popupContent = `
            <div class="report-popup">
                <div class="popup-heading">
                    <span class="popup-category-icon ${categoryClass}">${getCategoryIcon(report.category)}</span>
                    <div>
                        <h3 class="popup-title">${escapeHtml(report.category)}</h3>
                        <p class="popup-name">Reported by ${escapeHtml(report.reporter_name || 'Community member')}</p>
                    </div>
                </div>
                <p class="popup-description">${escapeHtml(report.description)}</p>
                <div class="popup-meta">
                    <span class="popup-status">${escapeHtml(report.status || 'Pending')}</span>
                    <span>${escapeHtml(timeString)}</span>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('mouseover', function () { this.openPopup(); });
        reportMarkers.addLayer(marker);
    });
}

// 6. Handle Form Submission
document.getElementById('reportForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!supabaseClient) {
        showFormStatus('Add your Supabase anon key in app.js before submitting.', true);
        return;
    }

    const category = document.getElementById('category').value;
    const reporterName = document.getElementById('userName').value.trim();
    const description = document.getElementById('description').value;
    const lat = document.getElementById('lat').value;
    const lng = document.getElementById('lng').value;
    const btn = document.getElementById('submitBtn');

    if (!lat || !lng) {
        document.getElementById('errorMsg').classList.remove('d-none');
        return;
    }
    document.getElementById('errorMsg').classList.add('d-none');

    // Disable button to prevent double-submitting
    btn.disabled = true;
    btn.innerText = 'Submitting...';
    showFormStatus('Submitting your report...');

    try {
        const { error } = await supabaseClient
            .from('hazard_reports')
            .insert([{
                category,
                reporter_name: reporterName,
                description,
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            }]);

        if (error) throw error;

        this.reset();
        document.getElementById('lat').value = '';
        document.getElementById('lng').value = '';
        if (tempPin) { map.removeLayer(tempPin); tempPin = null; }
        showFormStatus('Report submitted successfully.');
        await fetchReports();
    } catch (error) {
        console.error('Error submitting report:', error);
        showFormStatus(`Unable to submit report: ${error.message}`, true);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Submit Report';
    }
});

// 7. Initial Data Load
fetchReports();