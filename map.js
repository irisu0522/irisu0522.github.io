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

// --- ★追加：進入可否エリア用レイヤー（水利ピンより背面に配置） ---
map.createPane('accessPane');
map.getPane('accessPane').style.zIndex = 350; // 通常のピン(600)より後ろに固定
let accessAreasGroup = L.featureGroup().addTo(map);

// --- レイヤーコントロールの追加 ---
const baseMaps = { "Google マップ": googleRoad, "Google 航空写真": googleSatellite, "地理院地図 (標準)": gsiStd, "地理院地図 (淡色：見易い)": gsiPale };
const overlays = { "🚰 水利ピン": markersGroup, "📍 目標物ラベル": targetMarkersGroup, "🚒 進入可否": accessAreasGroup };
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

// ★Googleドライブの共有URLを、直接画像を表示するURLに変換する関数（最新版・抜け道ルート）
function getDriveImageUrl(url) {
    if (!url) return "";
    let match = url.match(/\/d\/(.*?)\//);
    if (match && match[1]) {
        // ▼▼▼ 抜け道ルート（Google CDN）に変更 ▼▼▼
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    return url;
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
        
        // ★追加：写真のURLを画像表示用に変換
        let farImageUrl = getDriveImageUrl(row["遠景写真"]);
        let nearImageUrl = getDriveImageUrl(row["近景写真"]);

        // ポップアップの基本情報
        let popupContent = `<div class="popup-title">${row["水利種別"]} (${row["水利番号"]})</div>${isAlert ? `<div class="popup-alert">⚠️ 要点検</div>` : ''}<table class="popup-table"><tr><th>地区</th><td>${row["地区"] || "-"}</td></tr><tr><th>区分</th><td>${categoryText}</td></tr><tr><th>前回点検</th><td>${row["前回調査日"] || "未実施"}</td></tr><tr><th>写真更新</th><td>${row["写真更新日"] || "未添付"}</td></tr><tr><th>点検結果</th><td>${row["点検結果"] || "未入力"}</td></tr><tr><th>異常の種類</th><td>${row["異常の種類"] || "-"}</td></tr><tr><th>塗装レベル</th><td>${row["塗装レベル"] || "-"}</td></tr><tr><th>コメント</th><td>${row["コメント"] || "-"}</td></tr></table>`;
        
       // ★変更：写真が登録されていれば、画像と「写真更新日」を表示（タップで拡大）
        if (farImageUrl || nearImageUrl) {
            let photoDateStr = row["写真更新日"] ? `<span style="font-size:9px; font-weight:normal;">(${row["写真更新日"]})</span>` : "";
            popupContent += `<div style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">`;
            if (farImageUrl) {
                // ▼▼▼ referrerpolicy="no-referrer" を追加 ▼▼▼
                popupContent += `<div style="flex: 1; min-width: 45%;"><div style="font-size: 10px; color: #666; margin-bottom: 2px;">📸 遠景 ${photoDateStr}</div><img src="${farImageUrl}" referrerpolicy="no-referrer" style="width: 100%; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;" onclick="openImageModal('${farImageUrl}')" onerror="this.parentNode.style.display='none'"></div>`;
            }
            if (nearImageUrl) {
                // ▼▼▼ referrerpolicy="no-referrer" を追加 ▼▼▼
                popupContent += `<div style="flex: 1; min-width: 45%;"><div style="font-size: 10px; color: #666; margin-bottom: 2px;">📸 近景 ${photoDateStr}</div><img src="${nearImageUrl}" referrerpolicy="no-referrer" style="width: 100%; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;" onclick="openImageModal('${nearImageUrl}')" onerror="this.parentNode.style.display='none'"></div>`;
            }
            popupContent += `</div>`;
        }
        
       // 点検入力フォーム（点検モード or 非番パトロールモードの時だけ表示）
        if (State.appMode === 'edit' || State.appMode === 'photo_only') {
            let isPhotoMode = (State.appMode === 'photo_only');
            
            popupContent += `
            <button class="form-toggle" onclick="toggleForm('${row["水利番号"]}')">${isPhotoMode ? '📸 写真を追加する' : '✏️ 点検結果を入力する'}</button>
            <div class="input-form" id="form-${row["水利番号"]}">
                
                <!-- 非番モードでは以下の入力枠を丸ごと隠す -->
                <div style="${isPhotoMode ? 'display:none;' : ''}">
                    <div class="form-group">
                        <label>点検結果</label>
                        <select id="input-result-${row["水利番号"]}">
                            <option value="写真のみ追加" ${isPhotoMode ? 'selected' : ''}>📸 写真のみ追加（点検日は更新しない）</option>
                            <option value="点検済（良好）" ${!isPhotoMode ? 'selected' : ''}>✅ 点検済（良好）</option>
                            <option value="要調査">⚠️ 要調査（要対応）</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>異常の種類</label>
<select id="input-error-${row["水利番号"]}">
    <option value="異常なし">✅ 異常なし</option>
    <option value="蓋開閉困難">🔧 蓋開閉困難</option>
    <option value="土没">🍂 土没</option>
    <option value="水没">💧 水没</option>
    <option value="バルブ不良">⚙️ バルブ不良</option>
    <option value="陥没 (大)">🕳️ 陥没 (大)</option>
    <option value="陥没 (小)">🕳️ 陥没 (小)</option>
    <option value="塗装剥がれ">🎨 塗装剥がれ</option>
    <option value="塗装間違い">❌ 塗装間違い</option>
    <option value="その他">❓ その他</option>
</select>
                    </div>
                    <div class="form-group">
                        <label>塗装レベル</label>
                        <select id="input-paint-${row["水利番号"]}"><option value="100%">100%</option><option value="50%">50%</option><option value="0%">0%</option></select>
                    </div>
                    <div class="form-group">
                        <label>コメント</label>
                        <input type="text" id="input-comment-${row["水利番号"]}" placeholder="状況など">
                    </div>
                </div>
                
                <div class="form-group" style="margin-top:10px;">
                    <label style="color:#0369a1;">📸 遠景写真（全体）</label>
                    <input type="file" id="input-far-${row['水利番号']}" accept="image/*" style="font-size:11px; padding:5px; background:#fff; border:1px solid #ccc; width:100%; box-sizing:border-box;">
                </div>
                <div class="form-group">
                    <label style="color:#0369a1;">📸 近景写真（異常箇所）</label>
                    <input type="file" id="input-near-${row['水利番号']}" accept="image/*" style="font-size:11px; padding:5px; background:#fff; border:1px solid #ccc; width:100%; box-sizing:border-box;">
                </div>
                
                <button class="form-submit-btn" id="btn-${row["水利番号"]}" onclick="submitReport('${row["水利番号"]}')">スプレッドシートへ送信</button>
            </div>
            `;
        }

    L.marker([row["緯度"], row["経度"]], {icon: customIcon}).bindPopup(popupContent, { closeOnClick: false, autoClose: false }).addTo(markersGroup);
  });

  if (!skipFit && State.searchTab === 'water') {
      if (markersGroup.getLayers().length > 0) { map.fitBounds(markersGroup.getBounds(), { padding: [50, 50], maxZoom: 17 }); }
  }
}
// --- 目標物ピンの描画処理（undefined対策版） ---
function renderTargetMarkers(dataToRender, skipFit) {
    targetMarkersGroup.clearLayers(); 
    if (State.appMode === 'test') return;
    
    dataToRender.forEach(function(row) {
        if (!row["緯度"] || !row["経度"]) return;
        
        let color = getTargetColor(row["種別"]); 
        let iconHtml = `<div class="marker-target-wrapper"><div class="marker-target-label" style="border-left: 4px solid ${color}; color: #0f172a; border-color: ${color};">${row["名称"]}</div></div>`;
        let customIcon = L.divIcon({ className: 'marker-target-container', html: iconHtml, iconSize: [0, 0] });
        
        // 基本情報（undefinedを未添付に変換）
        let photoDateDisplay = (row["写真更新日"] && row["写真更新日"] !== "undefined") ? row["写真更新日"] : "未添付";
        let popupContent = `<div class="popup-title target" style="border-bottom-color:${color};">${row["名称"]}</div><table class="popup-table"><tr><th>種別</th><td>${row["種別"] || "-"}</td></tr><tr><th>管轄署</th><td>${row["管轄署"] || "-"}</td></tr><tr><th>住所</th><td>${row["住所"] || "-"}</td></tr><tr><th>写真更新</th><td>${photoDateDisplay}</td></tr></table>`;
        
        // ★追加：写真がある場合の表示（写真データが存在する時のみ実行）
        if (row["写真"] && row["写真"] !== "undefined") {
            let targetImgUrl = getDriveImageUrl(row["写真"]);
            if (targetImgUrl && targetImgUrl !== "undefined") {
                let photoDateStr = (row["写真更新日"] && row["写真更新日"] !== "undefined") ? `<span style="font-size:9px; font-weight:normal;">(${row["写真更新日"]})</span>` : "";
                popupContent += `<div style="margin-top: 10px;"><div style="font-size: 10px; color: #666; margin-bottom: 2px;">📸 写真 ${photoDateStr}</div><img src="${targetImgUrl}" referrerpolicy="no-referrer" style="width: 100%; border-radius: 4px; border: 1px solid #ddd; cursor: pointer;" onclick="openImageModal('${targetImgUrl}')" onerror="this.parentNode.style.display='none'"></div>`;
            }
        }

        // ★追加：点検・パトロールモードの時だけ「写真追加フォーム」を表示
        if (State.appMode === 'edit' || State.appMode === 'photo_only') {
            let safeId = String(row["名称"]).replace(/[^a-zA-Z0-9ぁ-んァ-ヶ亜-熙]/g, ""); 
            if (!safeId) safeId = "unknown"; // 名称が記号だけの場合の安全対策
            popupContent += `
            <button class="form-toggle" onclick="toggleForm('target-${safeId}')">📸 写真を追加する</button>
            <div class="input-form" id="form-target-${safeId}">
                <div class="form-group">
                    <label style="color:#0369a1;">📸 目標物の写真</label>
                    <input type="file" id="input-target-photo-${safeId}" accept="image/*" style="font-size:11px; padding:5px; background:#fff; border:1px solid #ccc; width:100%; box-sizing:border-box;">
                </div>
                <button class="form-submit-btn" id="btn-target-${safeId}" onclick="submitTargetPhoto('${row["名称"]}', '${safeId}')">スプレッドシートへ送信</button>
            </div>
            `;
        }
        
        L.marker([row["緯度"], row["経度"]], {icon: customIcon, zIndexOffset: 1000}).bindPopup(popupContent, { closeOnClick: false, autoClose: false }).addTo(targetMarkersGroup);
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
// --- ★追加：画像を画面いっぱいに拡大表示する機能 ---
function openImageModal(imgUrl) {
    let modal = document.getElementById('image-modal');
    if (!modal) {
        // 初回のみ、拡大用の黒い背景画面を作る
        modal = document.createElement('div');
        modal.id = 'image-modal';
        modal.style.cssText = 'display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center; flex-direction:column;';
        
        // 閉じるボタンと、大きい写真を入れる枠
        // ▼▼▼ <img> タグに referrerpolicy="no-referrer" を追加 ▼▼▼
        modal.innerHTML = `
            <span style="position:absolute; top:20px; right:30px; color:white; font-size:35px; font-weight:bold; cursor:pointer;" onclick="document.getElementById('image-modal').style.display='none'">&times;</span>
            <img id="image-modal-img" referrerpolicy="no-referrer" style="max-width:95%; max-height:85%; object-fit:contain; border-radius:8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
        `;
        // 黒い背景をタップしても閉じるようにする
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.style.display = 'none';
        });
        document.body.appendChild(modal);
    }
    // タップされた写真のURLをセットして、画面に表示！
    document.getElementById('image-modal-img').src = imgUrl;
    modal.style.display = 'flex';
}
// ==========================================
// 🚒 進入可否エリア（線・円・多角形）描画・作図機能
// ==========================================

const ACCESS_CATEGORIES = {
    blue:   { label: '🔵 大型車両可能',   color: '#2563eb', placeholder: '例：見た目は狭いが大型進入可' },
    green:  { label: '🟢 中型車両可能',   color: '#16a34a', placeholder: '例：中型ポンプ車まで進入可' },
    yellow: { label: '🟡 救急車ギリギリ', color: '#f59e0b', placeholder: '例：幅員2.1m・夜間路駐注意' },
    red:    { label: '🔴 車両進入不能',   color: '#dc2626', placeholder: '例：幅員1.5m・ホース延長のみ' },
    purple: { label: '🟣 その他（自由）', color: '#9333ea', placeholder: '例：奥の空き地で転回可能' }
};

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// --- 右上コントロール（登録者フィルタ＆作図ボタン） ---
const accessControl = L.control({ position: 'topright' });
accessControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'access-map-controls');
    div.style.cssText = 'display:flex; flex-direction:column; gap:6px; align-items:flex-end; margin-top:6px;';
    div.innerHTML = `
        <select id="access-author-filter" onchange="onChangeAccessAuthorFilter(this.value)"
            style="background:#fff; color:#1e293b; border:2px solid #cbd5e1; border-radius:6px; padding:6px 8px; font-size:12px; font-weight:bold; box-shadow:0 2px 6px rgba(0,0,0,0.2); max-width:150px; cursor:pointer;">
            <option value="ALL">🚒 進入可否: 全員</option>
        </select>
        <button id="access-draw-start-btn" onclick="openAccessShapeMenu()"
            style="display:none; background:#8b5cf6; color:#fff; border:2px solid #fff; border-radius:8px; padding:8px 12px; font-size:13px; font-weight:bold; box-shadow:0 3px 8px rgba(0,0,0,0.3); cursor:pointer;">
            ✏️ 作図する
        </button>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
};
accessControl.addTo(map);

window.toggleAccessDrawButton = function(show) {
    const btn = document.getElementById('access-draw-start-btn');
    if (btn) btn.style.display = show ? 'block' : 'none';
};

// --- 登録者フィルタの選択肢を更新 ---
window.updateAccessAuthorFilter = function() {
    const select = document.getElementById('access-author-filter');
    if (!select) return;
    const savedMe = localStorage.getItem('suiri_access_author') || '';
    const authors = [...new Set((State.accessAreasData || []).map(r => String(r["登録者"] || "匿名").trim()).filter(Boolean))].sort();
    const currentVal = State.accessAuthorFilter || 'ALL';

    select.innerHTML = '<option value="ALL">🚒 進入可否: 全員</option>';
    if (savedMe) {
        select.innerHTML += `<option value="ME">👤 自分のみ (${escapeHtml(savedMe)})</option>`;
    }
    authors.forEach(a => {
        if (a !== savedMe) {
            select.innerHTML += `<option value="${escapeHtml(a)}">👤 ${escapeHtml(a)}</option>`;
        }
    });
    select.value = ([...select.options].some(o => o.value === currentVal)) ? currentVal : 'ALL';
};

window.onChangeAccessAuthorFilter = function(val) {
    State.accessAuthorFilter = val;
    renderAccessAreas();
};

// --- 進入可否エリアの地図描画 ---
window.renderAccessAreas = function() {
    accessAreasGroup.clearLayers();
    if (State.appMode === 'test') return;
    const list = State.accessAreasData || [];
    const savedMe = localStorage.getItem('suiri_access_author') || '';
    const filterVal = State.accessAuthorFilter || 'ALL';

    list.forEach(row => {
        const author = String(row["登録者"] || "匿名").trim();
        if (filterVal === 'ME') {
            if (!savedMe || author !== savedMe) return;
        } else if (filterVal !== 'ALL') {
            if (author !== filterVal) return;
        }

        const cat = ACCESS_CATEGORIES[row["区分"]] || ACCESS_CATEGORIES.purple;
        const shape = row["図形"];
        let coords;
        try { coords = (typeof row["座標"] === 'string') ? JSON.parse(row["座標"]) : row["座標"]; } catch (e) { return; }
        if (!coords) return;

        let layer = null;
        if (shape === 'line' && Array.isArray(coords) && coords.length >= 2) {
            layer = L.polyline(coords, { pane: 'accessPane', color: cat.color, weight: 6, opacity: 0.85 });
        } else if (shape === 'circle' && Array.isArray(coords) && coords.length === 2) {
            const r = Number(row["半径"]) || 30;
            layer = L.circle(coords, { pane: 'accessPane', radius: r, color: cat.color, weight: 3, fillColor: cat.color, fillOpacity: 0.22 });
        } else if (shape === 'polygon' && Array.isArray(coords) && coords.length >= 3) {
            layer = L.polygon(coords, { pane: 'accessPane', color: cat.color, weight: 3, fillColor: cat.color, fillOpacity: 0.22 });
        }
        if (!layer) return;

        const memoHtml = row["メモ"] ? escapeHtml(row["メモ"]).replace(/\n/g, '<br>') : '（メモなし）';
        const deleteBtnHtml = (State.appMode === 'photo_only')
            ? `<button onclick="confirmDeleteAccessArea('${escapeHtml(row["ID"])}')" style="width:100%; margin-top:10px; padding:8px; background:#ef4444; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🗑️ この図形を削除</button>`
            : '';

        const popupHtml = `
            <div style="min-width:190px; font-size:13px;">
                <div style="font-weight:bold; font-size:14px; color:${cat.color}; border-bottom:2px solid ${cat.color}; padding-bottom:4px; margin-bottom:6px;">
                    ${cat.label}
                </div>
                <div style="margin-bottom:6px; color:#1e293b; line-height:1.4;">${memoHtml}</div>
                <div style="font-size:11px; color:#64748b;">
                    👤 登録者: ${escapeHtml(author)}<br>
                    📅 更新日: ${escapeHtml(row["更新日"] || "-")}
                </div>
                ${deleteBtnHtml}
            </div>
        `;
        layer.bindPopup(popupHtml).addTo(accessAreasGroup);
    });
};

// --- 作図ステート管理 ---
const AccessDraw = {
    active: false,
    shape: null, // 'line' | 'circle' | 'polygon'
    points: [],
    radius: 30,
    tempGroup: L.featureGroup().addTo(map),
    selectedCategory: 'red'
};

// ① 図形選択ポップアップ
window.openAccessShapeMenu = function() {
    let modal = document.getElementById('access-shape-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'access-shape-modal';
        modal.style.cssText = 'display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.65); align-items:center; justify-content:center;';
        modal.innerHTML = `
            <div style="background:#fff; width:90%; max-width:320px; border-radius:12px; padding:20px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 8px; font-size:17px; color:#1e293b;">✏️ 描く図形を選択</h3>
                <p style="font-size:12px; color:#64748b; margin:0 0 16px;">※幹線道路は登録不要です</p>
                <button onclick="startAccessDrawing('line')" style="display:block; width:100%; padding:13px; margin-bottom:10px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:bold; cursor:pointer;">〰️ 線を描く（道路）</button>
                <button onclick="startAccessDrawing('circle')" style="display:block; width:100%; padding:13px; margin-bottom:10px; background:#10b981; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:bold; cursor:pointer;">⭕ 円で囲む（エリア）</button>
                <button onclick="startAccessDrawing('polygon')" style="display:block; width:100%; padding:13px; margin-bottom:14px; background:#f59e0b; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:bold; cursor:pointer;">⬟ 多角形で囲む（住宅街）</button>
                <button onclick="document.getElementById('access-shape-modal').style.display='none'" style="display:block; width:100%; padding:11px; background:#e2e8f0; color:#475569; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">キャンセル</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
};

// ② 作図モード開始＆画面下部ツールバー表示
window.startAccessDrawing = function(shape) {
    document.getElementById('access-shape-modal').style.display = 'none';
    AccessDraw.active = true;
    AccessDraw.shape = shape;
    AccessDraw.points = [];
    AccessDraw.radius = 30;
    AccessDraw.tempGroup.clearLayers();

    let bar = document.getElementById('access-draw-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'access-draw-bar';
        bar.style.cssText = 'display:none; position:fixed; bottom:15px; left:50%; transform:translateX(-50%); width:94%; max-width:420px; background:rgba(15,23,42,0.95); color:#fff; border-radius:12px; padding:12px; z-index:9998; box-shadow:0 4px 16px rgba(0,0,0,0.4); box-sizing:border-box;';
        document.body.appendChild(bar);
    }

    const guideText = (shape === 'circle')
        ? '地図をタップして中心を決め、スライダーで広さを調整'
        : (shape === 'line' ? '道路に沿って地図をタップ（2点以上）' : '囲みたいエリアの角をタップ（3点以上）');

    const sliderHtml = (shape === 'circle')
        ? `<div style="margin:8px 0; display:flex; align-items:center; gap:8px; font-size:12px;">
               <span>半径: <b id="access-radius-label">30</b>m</span>
               <input type="range" id="access-radius-slider" min="10" max="200" step="5" value="30" oninput="updateCircleRadius(this.value)" style="flex:1;">
           </div>`
        : '';

    const undoBtnHtml = (shape !== 'circle')
        ? `<button onclick="undoAccessPoint()" style="flex:1; padding:10px; background:#475569; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">↩ 1つ戻る</button>`
        : '';

    bar.innerHTML = `
        <div id="access-draw-guide" style="font-size:12px; color:#e2e8f0; margin-bottom:6px; text-align:center;">${guideText}</div>
        ${sliderHtml}
        <div style="display:flex; gap:8px; margin-top:6px;">
            ${undoBtnHtml}
            <button onclick="cancelAccessDrawing()" style="flex:1; padding:10px; background:#64748b; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">✖ 中止</button>
            <button onclick="finishAccessDrawing()" style="flex:1.2; padding:10px; background:#10b981; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">✅ 確定</button>
        </div>
    `;
    bar.style.display = 'block';
};

// 地図タップで作図点を追加
map.on('click', function(e) {
    if (!AccessDraw.active) return;
    const pt = [Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))];
    if (AccessDraw.shape === 'circle') {
        AccessDraw.points = [pt];
    } else {
        AccessDraw.points.push(pt);
    }
    redrawTempAccessShape();
});

window.updateCircleRadius = function(val) {
    AccessDraw.radius = Number(val);
    const lbl = document.getElementById('access-radius-label');
    if (lbl) lbl.innerText = val;
    redrawTempAccessShape();
};

window.undoAccessPoint = function() {
    if (AccessDraw.points.length > 0) {
        AccessDraw.points.pop();
        redrawTempAccessShape();
    }
};

function redrawTempAccessShape() {
    AccessDraw.tempGroup.clearLayers();
    AccessDraw.points.forEach(pt => {
        L.circleMarker(pt, { radius: 6, color: '#fff', weight: 2, fillColor: '#8b5cf6', fillOpacity: 1 }).addTo(AccessDraw.tempGroup);
    });
    if (AccessDraw.shape === 'line' && AccessDraw.points.length >= 2) {
        L.polyline(AccessDraw.points, { color: '#8b5cf6', weight: 5, dashArray: '6,6' }).addTo(AccessDraw.tempGroup);
    } else if (AccessDraw.shape === 'polygon' && AccessDraw.points.length >= 3) {
        L.polygon(AccessDraw.points, { color: '#8b5cf6', weight: 3, fillColor: '#8b5cf6', fillOpacity: 0.25 }).addTo(AccessDraw.tempGroup);
    } else if (AccessDraw.shape === 'circle' && AccessDraw.points.length === 1) {
        L.circle(AccessDraw.points[0], { radius: AccessDraw.radius, color: '#8b5cf6', weight: 3, fillColor: '#8b5cf6', fillOpacity: 0.25 }).addTo(AccessDraw.tempGroup);
    }
}

window.cancelAccessDrawing = function() {
    AccessDraw.active = false;
    AccessDraw.points = [];
    AccessDraw.tempGroup.clearLayers();
    const bar = document.getElementById('access-draw-bar');
    if (bar) bar.style.display = 'none';
};

// ③ 確定ボタン押下時のバリデーション＆距離チェック
window.finishAccessDrawing = function() {
    if (AccessDraw.shape === 'line') {
        if (AccessDraw.points.length < 2) return showMessage("線を引くには2点以上タップしてください。");
        let totalMeters = 0;
        for (let i = 1; i < AccessDraw.points.length; i++) {
            totalMeters += map.distance(AccessDraw.points[i - 1], AccessDraw.points[i]);
        }
        if (totalMeters >= 300) {
            if (!window.confirm(`⚠️ 線が長めです（約${Math.round(totalMeters)}m）。\n幹線道路は登録不要ですが、このまま登録へ進みますか？`)) {
                return;
            }
        }
    } else if (AccessDraw.shape === 'polygon') {
        if (AccessDraw.points.length < 3) return showMessage("多角形を作るには3点以上タップしてください。");
    } else if (AccessDraw.shape === 'circle') {
        if (AccessDraw.points.length < 1) return showMessage("地図をタップして円の中心を決めてください。");
    }
    openAccessSaveModal();
};

// ④ 区分・メモ・ニックネーム入力モーダル
function openAccessSaveModal() {
    let modal = document.getElementById('access-save-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'access-save-modal';
        modal.style.cssText = 'display:none; position:fixed; z-index:10000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.7); align-items:center; justify-content:center;';
        modal.innerHTML = `
            <div style="background:#fff; width:92%; max-width:360px; border-radius:12px; padding:18px; box-shadow:0 4px 20px rgba(0,0,0,0.35); max-height:90vh; overflow-y:auto; box-sizing:border-box;">
                <h3 style="margin:0 0 12px; font-size:16px; color:#1e293b; text-align:center;">🚒 進入可否の登録</h3>
                <div style="font-size:12px; font-weight:bold; color:#475569; margin-bottom:6px;">区分を選択：</div>
                <div id="access-cat-buttons" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;"></div>
                <div id="access-blue-warning" style="display:none; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; font-size:11px; font-weight:bold; padding:7px; border-radius:6px; margin-bottom:10px;">
                    ※幹線道路は登録不要。一見狭いが進入できる裏道のみ登録してください。
                </div>
                <div style="margin-bottom:10px;">
                    <label style="display:block; font-size:12px; font-weight:bold; color:#475569; margin-bottom:4px;">メモ（任意）：</label>
                    <textarea id="access-memo-input" rows="2" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; box-sizing:border-box;"></textarea>
                </div>
                <div style="margin-bottom:14px;">
                    <label style="display:block; font-size:12px; font-weight:bold; color:#475569; margin-bottom:4px;">登録者（ニックネーム・任意）：</label>
                    <input type="text" id="access-author-input" placeholder="未入力なら「匿名」（次回から自動入力）" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; box-sizing:border-box;">
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="document.getElementById('access-save-modal').style.display='none'" style="flex:1; padding:11px; background:#e2e8f0; color:#475569; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">戻る</button>
                    <button id="access-save-submit-btn" onclick="submitAccessArea()" style="flex:1.5; padding:11px; background:#2563eb; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">スプレッドシートへ保存</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const catBox = document.getElementById('access-cat-buttons');
    catBox.innerHTML = '';
    Object.keys(ACCESS_CATEGORIES).forEach(key => {
        const c = ACCESS_CATEGORIES[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.cat = key;
        btn.innerText = c.label;
        btn.style.cssText = `padding:9px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer; text-align:left; border:2px solid ${c.color}; background:#fff; color:#1e293b;`;
        btn.onclick = () => selectAccessCategory(key);
        catBox.appendChild(btn);
    });

    document.getElementById('access-memo-input').value = '';
    document.getElementById('access-author-input').value = localStorage.getItem('suiri_access_author') || '';
    selectAccessCategory('red');
    modal.style.display = 'flex';
}

function selectAccessCategory(key) {
    AccessDraw.selectedCategory = key;
    const cat = ACCESS_CATEGORIES[key];
    document.querySelectorAll('#access-cat-buttons button').forEach(btn => {
        const isSelected = (btn.dataset.cat === key);
        const c = ACCESS_CATEGORIES[btn.dataset.cat];
        btn.style.background = isSelected ? c.color : '#fff';
        btn.style.color = isSelected ? '#fff' : '#1e293b';
    });
    document.getElementById('access-blue-warning').style.display = (key === 'blue') ? 'block' : 'none';
    document.getElementById('access-memo-input').placeholder = cat.placeholder;
}

// ⑤ GASへ保存送信
window.submitAccessArea = async function() {
    const btn = document.getElementById('access-save-submit-btn');
    const memo = document.getElementById('access-memo-input').value.trim();
    const author = document.getElementById('access-author-input').value.trim();

    if (author) localStorage.setItem('suiri_access_author', author);

    const coordsToSend = (AccessDraw.shape === 'circle') ? AccessDraw.points[0] : AccessDraw.points;
    const payload = {
        action: 'save_access_area',
        shape: AccessDraw.shape,
        category: AccessDraw.selectedCategory,
        coords: coordsToSend,
        radius: (AccessDraw.shape === 'circle') ? AccessDraw.radius : '',
        memo: memo,
        author: author || '匿名'
    };

    btn.disabled = true;
    btn.innerText = '保存中...';

    try {
        const res = await saveAccessAreaToGAS(payload);
        if (res.success) {
            document.getElementById('access-save-modal').style.display = 'none';
            cancelAccessDrawing();
            showMessage('✅ 進入可否エリアを保存しました！');
            if (typeof refreshMapData === 'function') refreshMapData();
        } else {
            showMessage('❌ 保存エラー: ' + (res.error || res.message || '不明なエラー'));
        }
    } catch (err) {
        console.error(err);
        showMessage('❌ 通信エラーが発生しました。電波状態を確認してください。');
    } finally {
        btn.disabled = false;
        btn.innerText = 'スプレッドシートへ保存';
    }
};

// ⑥ GASへ削除送信
window.confirmDeleteAccessArea = async function(id) {
    if (!window.confirm('この進入可否図形を削除しますか？')) return;
    map.closePopup();
    try {
        const res = await deleteAccessAreaFromGAS(id);
        if (res.success) {
            showMessage('🗑️ 図形を削除しました。');
            if (typeof refreshMapData === 'function') refreshMapData();
        } else {
            showMessage('❌ 削除エラー: ' + (res.error || res.message || '不明なエラー'));
        }
    } catch (err) {
        console.error(err);
        showMessage('❌ 通信エラーが発生しました。');
    }
};
