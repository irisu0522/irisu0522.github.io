// ==========================================
// test_mode.js : 訓練・効果測定モードの専用ロジック
// ==========================================

const TestManager = { 
    modeType: 'nearest', 
    question: null, 
    isActive: false, 
    elements: [], 
    fireMarker: null, 
    fireCircle: null, 
    excavatePool: [], 
    hitCount: 0, 
    missCount: 0, 
    missLimit: 5, 
    userTapsForNearest: [] 
};

window.selectTestMode = function(mode) {
    TestManager.modeType = mode;
    ['nearest', 'excavate', 'target'].forEach(m => {
        let btn = document.getElementById('btn-mode-' + m); 
        btn.style.background = '#f1f5f9'; 
        btn.style.color = '#475569'; 
        btn.style.border = '1px solid #cbd5e1'; 
        document.getElementById('setup-' + m).style.display = 'none';
    });
    let activeBtn = document.getElementById('btn-mode-' + mode); 
    activeBtn.style.background = '#e83e8c'; 
    activeBtn.style.color = 'white'; 
    activeBtn.style.border = 'none'; 
    document.getElementById('setup-' + mode).style.display = 'block';
};

window.execTestMode = function() { 
    if (TestManager.modeType === 'nearest') initNearestTest(); 
    else if (TestManager.modeType === 'excavate') initExcavateTest(); 
    else initTargetTest(); 
};

function startTestUI() {
    State.appMode = 'test';
    document.getElementById('test-setup-modal').style.display = 'none'; 
    document.getElementById('main-side-btns').style.display = 'none'; 
    document.getElementById('top-info-container').style.display = 'none'; 
    document.getElementById('test-header').style.display = 'block';
    renderMarkers([], true); 
    targetMarkersGroup.clearLayers();
}

window.quitTestMode = function() {
    if(TestManager.fireMarker) { map.removeLayer(TestManager.fireMarker); TestManager.fireMarker = null; }
    if(TestManager.fireCircle) { map.removeLayer(TestManager.fireCircle); TestManager.fireCircle = null; }
    map.off('click', onMapClickForNearest); 
    map.off('click', onMapClickForExcavate); 
    map.off('click', onMapClickForTarget);
    
    TestManager.elements.forEach(el => map.removeLayer(el)); 
    TestManager.elements = [];
    targetMarkersGroup.clearLayers();
    
    document.getElementById('test-header').style.display = 'none'; 
    document.getElementById('test-result-modal').style.display = 'none'; 
    document.getElementById('test-setup-modal').style.display = 'none';
    document.getElementById('main-side-btns').style.display = 'flex'; 
    document.getElementById('top-info-container').style.display = 'flex';
    
    State.appMode = 'view_water'; 
    let badge = document.getElementById('current-mode-badge');
    badge.innerText = '👀 水利 閲覧'; 
    badge.style.backgroundColor = '#3b82f6';
    
    if (!map.hasLayer(markersGroup)) map.addLayer(markersGroup);
    switchSearchTab('water');
};

// --- 🔥 5ヶ所当てテスト ---
function initNearestTest() {
    let area = document.getElementById('test-area-select').value; 
    let pool = State.allData.filter(row => (area === "" || row["地区"] === area) && row["緯度"] && row["経度"]);
    
    if(pool.length < 5) return showMessage(`この地区には水利が ${pool.length} 件しかありません。最低5件以上必要です。`);
    
    let base = pool[Math.floor(Math.random() * pool.length)];
    let fireLat = parseFloat(base["緯度"]) + (Math.random() - 0.5) * 0.002; 
    let fireLng = parseFloat(base["経度"]) + (Math.random() - 0.5) * 0.002; 
    let fireLatLng = L.latLng(fireLat, fireLng);
    
    let allInRadius = pool.map(r => ({ row: r, dist: map.distance(fireLatLng, L.latLng(r["緯度"], r["経度"])) })).filter(r => r.dist <= 200).sort((a, b) => a.dist - b.dist);
    let targetCount = Math.min(5, allInRadius.length);
    
    if (targetCount === 0) { 
        allInRadius = pool.map(r => ({ row: r, dist: map.distance(fireLatLng, L.latLng(r["緯度"], r["経度"])) })).sort((a, b) => a.dist - b.dist); 
        targetCount = Math.min(5, allInRadius.length); 
    }
    
    TestManager.question = { fireLat: fireLat, fireLng: fireLng, targets: allInRadius.slice(0, targetCount), allInRadius: allInRadius };
    TestManager.isActive = false; 
    TestManager.elements = [];
    
    if(TestManager.fireCircle) { map.removeLayer(TestManager.fireCircle); TestManager.fireCircle = null; }
    startTestUI(); 
    map.on('click', onMapClickForNearest); 
    showNearestQuestion();
}

window.retryNearestTest = function() { 
    TestManager.elements.forEach(el => map.removeLayer(el)); 
    TestManager.elements = []; 
    targetMarkersGroup.clearLayers(); 
    showNearestQuestion(); 
};

function showNearestQuestion() {
    TestManager.userTapsForNearest = []; 
    let q = TestManager.question;
    
    document.getElementById('test-progress').innerText = `🔥 火災周辺5ヶ所当てテスト`; 
    document.getElementById('test-question').innerText = `半径200m以内の水利を【 ${q.targets.length}ヶ所 】タップせよ！`; 
    document.getElementById('test-instruction').innerHTML = `<span style="color:#f59e0b;">現在：0 / ${q.targets.length} ヶ所 指定完了</span>`;
    
    if(TestManager.fireMarker) map.removeLayer(TestManager.fireMarker); 
    if(TestManager.fireCircle) map.removeLayer(TestManager.fireCircle);
    
    TestManager.fireMarker = L.marker([q.fireLat, q.fireLng], { icon: L.divIcon({ className: 'marker-fire-wrapper', html: '<div class="marker-fire-anim">🔥</div>', iconSize: [34, 34], iconAnchor: [17, 34] }) }).addTo(map);
    TestManager.fireCircle = L.circle([q.fireLat, q.fireLng], { radius: 200, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15, dashArray: '5, 5' }).addTo(map);
    
    map.setView([q.fireLat, q.fireLng], 16); 
    renderTargetMarkersForTest(L.latLng(q.fireLat, q.fireLng));
    setTimeout(() => { TestManager.isActive = true; }, 300);
}

function onMapClickForNearest(e) {
    if(!TestManager.isActive) return; 
    let q = TestManager.question; 
    TestManager.userTapsForNearest.push(e.latlng);
    
    let userMarker = L.circleMarker(e.latlng, {radius: 8, color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2}).addTo(map); 
    TestManager.elements.push(userMarker);
    document.getElementById('test-instruction').innerHTML = `<span style="color:#f59e0b;">現在：${TestManager.userTapsForNearest.length} / ${q.targets.length} ヶ所 指定完了</span>`;
    
    if(TestManager.userTapsForNearest.length >= q.targets.length) { 
        TestManager.isActive = false; 
        showNearestAnswers(q, TestManager.userTapsForNearest); 
    }
}

function showNearestAnswers(q, userTaps) {
    let limitDist = document.getElementById('test-hard-mode').checked ? 10 : 20; 
    let pairs = [];
    
    for(let i=0; i<q.targets.length; i++) {
        let tLatLng = L.latLng(q.targets[i].row["緯度"], q.targets[i].row["経度"]);
        for(let j=0; j<userTaps.length; j++) { pairs.push({ aIdx: i, uIdx: j, dist: map.distance(tLatLng, userTaps[j]), targetLatlng: tLatLng }); }
    }
    pairs.sort((a,b) => a.dist - b.dist);
    
    let usedA = new Set(); let usedU = new Set(); let results = [];
    pairs.forEach(p => { if(!usedA.has(p.aIdx) && !usedU.has(p.uIdx)) { usedA.add(p.aIdx); usedU.add(p.uIdx); results.push(p); } });
    
    let roundCorrect = 0;
    results.forEach(p => {
        let isCorrect = p.dist <= limitDist; if(isCorrect) roundCorrect++;
        let ansIcon = L.divIcon({ className: (q.targets[p.aIdx].row["水利種別"] === "消火栓") ? 'marker-hydrant' : 'marker-tank', iconSize: [24, 24], iconAnchor: [12, 12] });
        TestManager.elements.push(L.marker(p.targetLatlng, {icon: ansIcon}).addTo(map));
        if(!isCorrect) TestManager.elements.push(L.marker(userTaps[p.uIdx], {icon: L.divIcon({ className: 'marker-miss', html: '❌', iconSize: [20, 20], iconAnchor: [10, 10] })}).addTo(map));
    });
    
    for(let j=0; j<userTaps.length; j++) {
        if(!usedU.has(j)) TestManager.elements.push(L.marker(userTaps[j], {icon: L.divIcon({ className: 'marker-miss', html: '❌', iconSize: [20, 20], iconAnchor: [10, 10] })}).addTo(map));
    }
    
    q.allInRadius.forEach(item => {
        let r = item.row; let isTarget = q.targets.some(t => t.row["水利番号"] === r["水利番号"]);
        if (!isTarget) {
            let ansIcon = L.divIcon({ className: (r["水利種別"] === "消火栓") ? 'marker-hydrant' : 'marker-tank', iconSize: [24, 24], iconAnchor: [12, 12] });
            TestManager.elements.push(L.marker([r["緯度"], r["経度"]], {icon: ansIcon, opacity: 0.5}).addTo(map));
        }
    });
    
    let allLatLngs = [...userTaps, ...q.allInRadius.map(t => L.latLng(t.row["緯度"], t.row["経度"])), L.latLng(q.fireLat, q.fireLng)]; 
    map.fitBounds(L.latLngBounds(allLatLngs), {padding: [50,50], maxZoom: 18});
    
    document.getElementById('test-instruction').innerHTML = `<div style="margin-bottom: 8px;"><span style="color:#10b981; font-size:14px; background:#fff; padding:3px 10px; border-radius:10px;">${q.targets.length}ヶ所中 ${roundCorrect}ヶ所正解！</span></div><div style="display: flex; gap: 10px; justify-content: center;"><button onclick="retryNearestTest()" style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">🔄 もう一度</button><button onclick="initNearestTest()" style="padding: 6px 12px; background: #e83e8c; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">▶️ 次の問題</button></div>`;
}

// --- 🗺️ 全発掘テスト ---
function initExcavateTest() {
    let bounds = map.getBounds(); 
    TestManager.excavatePool = State.allData.filter(row => row["緯度"] && row["経度"] && bounds.contains(L.latLng(row["緯度"], row["経度"])));
    
    if (TestManager.excavatePool.length === 0) return showMessage("画面に映っている範囲に水利がありません。");
    
    TestManager.missLimit = parseInt(document.getElementById('test-miss-limit').value); 
    TestManager.hitCount = 0; 
    TestManager.missCount = 0; 
    TestManager.isActive = false; 
    TestManager.elements = []; 
    TestManager.excavatePool.forEach(q => q.excavated = false); 
    
    startTestUI(); 
    updateExcavateHeader(); 
    map.on('click', onMapClickForExcavate); 
    renderTargetMarkersForTest(map.getCenter());
    setTimeout(() => { TestManager.isActive = true; }, 500);
}

function updateExcavateHeader() {
    document.getElementById('test-progress').innerText = `🎯 ターゲット：全 ${TestManager.excavatePool.length} 個`;
    let lifeText = TestManager.missLimit === 999 ? "無制限" : `残り ${TestManager.missLimit - TestManager.missCount} 回`;
    document.getElementById('test-question').innerHTML = `🔍 発見：${TestManager.hitCount} / ${TestManager.excavatePool.length} 個 &nbsp;&nbsp; <span style="color:#ef4444;">❤️ ${lifeText}</span>`;
    document.getElementById('test-instruction').innerText = "記憶を頼りに水利がありそうな場所をタップしてください！";
}

function onMapClickForExcavate(e) {
    if (!TestManager.isActive) return; 
    let limitDist = document.getElementById('test-hard-mode').checked ? 10 : 20; 
    let hitIndex = -1; let minDist = Infinity;
    
    TestManager.excavatePool.forEach((q, index) => {
        if (q.excavated) return; 
        let dist = map.distance(e.latlng, L.latLng(q["緯度"], q["経度"]));
        if (dist <= limitDist && dist < minDist) { minDist = dist; hitIndex = index; }
    });
    
    if (hitIndex !== -1) {
        let q = TestManager.excavatePool[hitIndex]; 
        q.excavated = true; 
        TestManager.hitCount++;
        let ansIcon = L.divIcon({ className: (q["水利種別"] === "消火栓") ? 'marker-hydrant' : 'marker-tank', iconSize: [24, 24], iconAnchor: [12, 12] });
        TestManager.elements.push(L.marker([q["緯度"], q["経度"]], {icon: ansIcon}).addTo(map));
    } else {
        TestManager.missCount++; 
        TestManager.elements.push(L.marker(e.latlng, {icon: L.divIcon({ className: 'marker-miss', html: '❌', iconSize: [20, 20], iconAnchor: [10, 10] })}).addTo(map));
    }
    
    updateExcavateHeader();
    if (TestManager.hitCount >= TestManager.excavatePool.length || TestManager.missCount >= TestManager.missLimit) { 
        TestManager.isActive = false; 
        let isCleared = TestManager.hitCount >= TestManager.excavatePool.length;
        document.getElementById('test-instruction').innerHTML = `<span style="color:#10b981; font-size:14px; background:#fff; padding:2px 8px; border-radius:10px; cursor:pointer;">${isCleared ? '完全制覇！' : 'ゲームオーバー！'} 地図をタップして結果へ👉</span>`;
        setTimeout(() => { map.once('click', () => showExcavateResult(isCleared)); }, 1000);
    }
}

function showExcavateResult(isCleared) {
    map.off('click', onMapClickForExcavate); 
    document.getElementById('test-header').style.display = 'none';
    let score = Math.round((TestManager.hitCount / TestManager.excavatePool.length) * 100);
    
    TestManager.excavatePool.forEach(q => {
        if (!q.excavated) {
            let ansIcon = L.divIcon({ className: ((q["水利種別"] === "消火栓") ? 'marker-hydrant' : 'marker-tank') + ' missed-marker', iconSize: [24, 24], iconAnchor: [12, 12] });
            TestManager.elements.push(L.marker([q["緯度"], q["経度"]], {icon: ansIcon}).addTo(map));
        }
    });
    
    document.getElementById('test-score-label').innerText = "発掘率"; 
    document.getElementById('test-score-display').innerText = `${score}%`; 
    document.getElementById('test-score-display').style.color = score >= 80 ? '#e83e8c' : '#f59e0b';
    document.getElementById('test-correct-display').innerText = `${TestManager.excavatePool.length}個中 ${TestManager.hitCount}個 発見！`; 
    document.getElementById('test-message-display').innerHTML = `お手つき: ${TestManager.missCount} 回<br><br>${isCleared ? "🏆 完全制覇！" : "💀 お手つき上限に達しました..."}`;
    document.getElementById('test-result-modal').style.display = 'flex';
}

// --- 📍 目標物当てテスト ---
function initTargetTest() {
    let selectedJurisdiction = document.getElementById('test-jurisdiction-select').value; 
    let selectedType = document.getElementById('test-target-type-select').value;
    
    let pool = State.targetsData.filter(row => {
        if (!row["緯度"] || !row["経度"]) return false; 
        let matchJuri = (selectedJurisdiction === "" || row["管轄署"] === selectedJurisdiction); 
        let matchType = (selectedType === "" || row["種別"] === selectedType); 
        return matchJuri && matchType;
    });
    
    if(pool.length === 0) return showMessage(`指定された条件の目標物データが見つかりません。`);
    
    let target = pool[Math.floor(Math.random() * pool.length)];
    TestManager.question = target; 
    TestManager.isActive = false; 
    TestManager.elements = [];
    
    startTestUI(); 
    showTargetQuestion(target); 
    map.on('click', onMapClickForTarget);
}

function showTargetQuestion(target) {
    document.getElementById('test-progress').innerText = `📍 目標物ピンポイント当て (${target["管轄署"] || '管轄不明'})`; 
    document.getElementById('test-question').innerText = `Q. 「${target["名称"]}」はどこ？`; 
    document.getElementById('test-instruction').innerHTML = `<span style="color:#f59e0b;">マップ上の正しい位置を1回だけタップしてください</span>`;
    
    if (document.getElementById('test-jurisdiction-select').value !== "") {
        let areaHints = Object.keys(State.areaMapping).filter(key => State.areaMapping[key] === target["管轄署"]); 
        let hintWater = State.allData.find(w => areaHints.includes(w["地区"]));
        if (hintWater) { map.setView([hintWater["緯度"], hintWater["経度"]], 13); }
    } else { 
        map.setView([34.2305, 135.1705], 13); 
    }
    
    setTimeout(() => { TestManager.isActive = true; }, 500);
}

function onMapClickForTarget(e) {
    if(!TestManager.isActive) return; 
    TestManager.isActive = false; 
    
    let target = TestManager.question; 
    let targetLatLng = L.latLng(target["緯度"], target["経度"]); 
    let dist = map.distance(e.latlng, targetLatLng);
    let limitDist = document.getElementById('test-hard-mode').checked ? 30 : 60; 
    let isCorrect = dist <= limitDist;
    
    let userMarker = L.marker(e.latlng, {icon: L.divIcon({ className: 'marker-miss', html: isCorrect ? '🎯' : '❌', iconSize: [24, 24], iconAnchor: [12, 12] })}).addTo(map);
    
    let color = getTargetColor(target["種別"]);
    let correctHtml = `<div class="marker-target-wrapper"><div class="marker-target-label" style="border-left: 4px solid ${color}; color: #0f172a; border-color: ${color};">${target["名称"]}</div></div>`;
    let correctIcon = L.divIcon({ className: 'marker-target-container', html: correctHtml, iconSize: [0, 0] });
    
    let ansMarker = L.marker(targetLatLng, {icon: correctIcon}).addTo(map);
    let line = L.polyline([e.latlng, targetLatLng], {color: isCorrect ? '#10b981' : '#ef4444', weight: 3, dashArray: '5, 5'}).addTo(map);
    
    TestManager.elements.push(userMarker, ansMarker, line); 
    map.fitBounds(L.latLngBounds([e.latlng, targetLatLng]), {padding: [50, 50], maxZoom: 17});
    
    document.getElementById('test-instruction').innerHTML = `<div style="margin-bottom: 8px;"><span style="color:${isCorrect ? '#10b981' : '#ef4444'}; font-size:15px; font-weight:bold; background:#fff; padding:3px 10px; border-radius:10px;">${isCorrect ? '大正解🎉' : '残念！'} 誤差: ${Math.round(dist)}m (基準:${limitDist}m)</span></div><div style="display: flex; gap: 10px; justify-content: center;"><button onclick="initTargetTest()" style="padding: 8px 15px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">▶️ 次のクイズへ</button></div>`;
}
