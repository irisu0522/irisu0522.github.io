// ==========================================
// map.js : Leaflet地図の制御・描画を専門に扱うファイル
// ==========================================

// --- 地図タイルの設定 ---
const googleRoad = L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=ja&x={x}&y={y}&z={z}', { attribution: '© Google', maxZoom: 21 });
const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&hl=ja&x={x}&y={y}&z={z}', { attribution: '© Google', maxZoom: 21 });
const gsiStd = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', { attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>", maxZoom: 18 });
const gsiPale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>", maxZoom: 18 });

// --- 地図の初期化 ---
const map = L.map('map', { center: [34.2305, 135.1705], zoom: 14, layers: [googleRoad] });

// --- クラスターグループの設定 ---
let markersGroup = L.markerClusterGroup({ disableClusteringAtZoom: 16, maxClusterRadius: 50 }); 
let targetMarkersGroup = L.markerClusterGroup({ disableClusteringAtZoom: 16, maxClusterRadius: 60 });

// --- レイヤーコントロールの追加 ---
const baseMaps = { "Google マップ": googleRoad, "Google 航空写真": googleSatellite, "地理院地図 (標準)": gsiStd, "地理院地図 (淡色：見易い)": gsiPale };
const overlays = { "🚰 水利ピン": markersGroup, "📍 目標物ラベル": targetMarkersGroup };
L.control.layers(baseMaps, overlays, { position: 'topright' }).addTo(map);

// --- 凡例（Legend）とテストモード起動の隠しコマンド ---
const legend = L.control({position: 'bottomleft'});
legend.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = `
        <div style="background: rgba(255,255,255,0.9); padding: 8px; border-radius: 5px; box-shadow: 0 0 15px rgba(0,0,0,0.2); font-size: 11px; margin-bottom: 20px; margin-left: 10px; cursor: pointer;">
            <b style="font-size:12px; color:#1e293b;">📍 ピンの見方</b><br>
            <span style="color:#ff3b30; font-size:14px;">●</span> 消火栓<br>
            <span style="color:#007aff; font-size:14px;">■</span> 防火水槽<br>
            <span style="color:#ffcc00; font-weight:bold;">⚠️</span> 点滅は「要点検」
        </div>
    `;
    L.DomEvent.disableClickPropagation(div); 
    
    // 隠しコマンド（3回タップでテストモード）
    let tapCount = 0; let lastTap = 0;
    div.addEventListener('click', function(e) {
        let now = Date.now();
        if (now - lastTap < 500) { 
            tapCount++;
            if (tapCount === 3) { 
                if (State.appMode !== 'test') document.getElementById('test-setup-modal').style.display = 'flex'; 
                tapCount = 0; 
            }
        } else { tapCount = 1; }
        lastTap = now;
    });
    return div;
};
legend.addTo(map);

// --- GPSトラッキングのイベント設定 ---
map.on('locationfound', function(e) { 
    if (State.currentLocationMarker) map.removeLayer(State.currentLocationMarker); 
    State.currentLocationMarker = L.circleMarker(e.latlng, { 
        radius: 8, 
        fillColor: State.isTracking ? "#28a745" : "#007bff", 
        color: "#ffffff", 
        weight: 2, 
        opacity: 1, 
        fillOpacity: 0.9 
    }).addTo(map).bindPopup("<b>現在地</b>"); 
});

map.on('dragstart', function() { 
    if (State.isTracking) { 
        State.isTracking = false; 
        map.stopLocate(); 
        let btn = document.getElementById('gps-btn'); 
        btn.classList.remove('tracking'); 
        btn.innerHTML = '<span class="btn-icon">📍</span><span class="btn-text pc-only">現在地</span><span class="btn-text sp-only">現在地</span>'; 
    } 
});

// --- ヘルパー関数 ---
function isPublicWater(suiriNumber) {
    let str = String(suiriNumber || "");
    if (!str || !str.includes("-")) return true; 
    let parts = str.split("-"); 
    return parts.length > 1 && parts[1].trim().length > 0 && parts[1].trim().charAt(0) !== "6";
}

function getTargetColor(type) {
    if (!type) return '#64748b'; 
    if (type.includes('交差点')) return '#3b82f6'; 
    if (type.includes('幼') || type.includes('保') || type.includes('学')) return '#ec4899'; 
    if (type.includes('ヘリ') || type.includes('消防')) return '#f59e0b'; 
    if (type.includes('病院') || type.includes('医療') || type.includes('医大')) return '#10b981'; 
    if (type.includes('警察') || type.includes('交番')) return '#8b5cf6'; 
    return '#64748b'; 
}

// --- 水利ピンの描画処理 ---
function renderMarkers(dataToRender, skipFit) {
    markersGroup.clearLayers(); 
    if (State.appMode === 'test') return;
    
    dataToRender.forEach(function(row) {
        if (!row["緯度"] || !row["経度"]) return;
        
        let isAlert = (row["要調査"] === "要点検"); 
        let className = (row["水利種別"] === "消火栓") ? "marker-hydrant" : "marker-tank"; 
        if (isAlert) className += " alert-marker";
        
        let customIcon = L.divIcon({ className: className, iconSize: [24, 24], iconAnchor: [12, 12] }); 
        let categoryText = isPublicWater(row["水利番号"]) ? "公設" : "私設";
        
        let popupContent = `<div class="popup-title">${row["水利種別"]} (${row["水利番号"]})</div>${isAlert ? `<div class="popup-alert">⚠️ 要点検</div>` : ''}<table class="popup-table"><tr><th>地区</th><td>${row["地区"] || "-"}</td></tr><tr><th>区分</th><td>${categoryText}</td></tr><tr><th>前回点検</th><td>${row["前回調査日"] || "未実施"}</td></tr><tr><th>点検結果</th><td>${row["点検結果"] || "未入力"}</td></tr><tr><th>異常の種類</th><td>${row["異常の種類"] || "-"}</td></tr><tr><th>塗装レベル</th><td>${row["塗装レベル"] || "-"}</td></tr><tr><th>コメント</th><td>${row["コメント"] || "-"}</td></tr></table>`;
        
        if (State.appMode === 'edit') {
            popupContent += `<button class="form-toggle" onclick="toggleForm('${row["水利番号"]}')">📝 点検結果を入力する</button><div class="input-form" id="form-${row["水利番号"]}"><div class="form-group"><label>点検結果</label><select id="input-result-${row["水利番号"]}"><option value="点検済">点検済（良好）</option><option value="要対応">要対応（不備あり）</option><option value="未実施">未点検</option></select></div><div class="form-group"><label>異常の種類</label><select id="input-error-${row["水利番号"]}"><option value="なし">異常なし</option><option value="蓋開閉困難">蓋開閉困難</option><option value="土没">土没</option><option value="水没">水没</option><option value="バルブ開閉不良">バルブ開閉不良</option><option value="道路陥没（大）">道路陥没（大）</option><option value="道路陥没（小）">道路陥没（小）</option><option value="塗装剥がれ">塗装剥がれ</option><option value="塗装間違い">塗装間違い</option><option value="その他">その他</option></select></div><div class="form-group"><label>塗装レベル</label><select id="input-paint-${row["水利番号"]}"><option value="100%">100%</option><option value="50%">50%</option><option value="0%">0%</option></select></div><div class="form-group"><label>コメント</label><input type="text" id="input-comment-${row["水利番号"]}" placeholder="状況など"></div><button class="form-submit-btn" id="btn-${row["水利番号"]}" onclick="submitReport('${row["水利番号"]}')">スプレッドシートへ送信</button></div>`;
        }
        L.marker([row["緯度"], row["経度"]], {icon: customIcon}).bindPopup(popupContent).addTo(markersGroup);
    });
    
    if (!skipFit && State.searchTab === 'water') { 
        if (markersGroup.getLayers().length > 0) { map.fitBounds(markersGroup.getBounds(), { padding: [50, 50], maxZoom: 17 }); }
    }
}

// --- 目標物ピンの描画処理 ---
function renderTargetMarkers(dataToRender, skipFit) {
    targetMarkersGroup.clearLayers(); 
    if (State.appMode === 'test') return;
    
    dataToRender.forEach(function(row) {
        if (!row["緯度"] || !row["経度"]) return;
        
        let color = getTargetColor(row["種別"]); 
        let iconHtml = `<div class="marker-target-wrapper"><div class="marker-target-label" style="border-left: 4px solid ${color}; color: #0f172a; border-color: ${color};">${row["名称"]}</div></div>`;
        let customIcon = L.divIcon({ className: 'marker-target-container', html: iconHtml, iconSize: [0, 0] });
        let popupContent = `<div class="popup-title target" style="border-bottom-color:${color};">${row["名称"]}</div><table class="popup-table"><tr><th>種別</th><td>${row["種別"] || "-"}</td></tr><tr><th>管轄署</th><td>${row["管轄署"] || "-"}</td></tr><tr><th>住所</th><td>${row["住所"] || "-"}</td></tr></table>`;
        
        L.marker([row["緯度"], row["経度"]], {icon: customIcon, zIndexOffset: 1000}).bindPopup(popupContent).addTo(targetMarkersGroup);
    });
    
    if (!skipFit && State.searchTab === 'target') {
        if (targetMarkersGroup.getLayers().length > 0) { map.fitBounds(targetMarkersGroup.getBounds(), { padding: [50, 50], maxZoom: 16 }); }
    }
}

// --- テスト用の特殊マーカー描画処理 ---
function renderTargetMarkersForTest(centerLatLng) {
    targetMarkersGroup.clearLayers();
    let pool = State.targetsData.filter(row => {
        if (!row["緯度"] || !row["経度"]) return false;
        return map.distance(centerLatLng, L.latLng(row["緯度"], row["経度"])) < 1500;
    });
    
    pool.forEach(function(row) {
        let color = getTargetColor(row["種別"]); 
        let safeName = (row["名称"] || "").replace(/'/g, "\\'"); 
        let iconHtml = `<div class="marker-target-wrapper"><div class="marker-target-label test-hidden-label" onclick="this.innerText='${safeName}'; this.style.borderColor='${color}'; this.style.borderLeft='4px solid ${color}'; this.style.color='#0f172a'; this.classList.remove('test-hidden-label'); event.stopPropagation();"></div></div>`;
        let customIcon = L.divIcon({ className: 'marker-target-container', html: iconHtml, iconSize: [0, 0] });
        let marker = L.marker([row["緯度"], row["経度"]], {icon: customIcon, zIndexOffset: 900}).addTo(targetMarkersGroup);
        TestManager.elements.push(marker);
    });
}
