// ==========================================
// app.js : UIとアプリのメインロジック (State管理)
// ==========================================

function showMessage(msg) {
    document.getElementById('custom-alert-msg').innerText = msg;
    document.getElementById('custom-alert').style.display = 'flex';
}

function parseLocalDate(dateStr) {
    if (!dateStr || dateStr === "00年00月00日" || dateStr === "0") return new Date(2000, 0, 1);
    let s = String(dateStr).trim(); 
    const parts = s.split(/[-/]/);
    if (parts.length >= 3) { return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)); }
    let d = new Date(s); return isNaN(d.getTime()) ? new Date(2000, 0, 1) : d;
}

// 🌟 全体の状態管理
const State = {
    allData: [], currentFilteredData: [], targetsData: [], currentTargetFilteredData: [],
    areaMapping: {}, appMode: 'view', searchTab: 'water', isTracking: false,
    currentLocationMarker: null, pendingMode: null
};

// api.js で定義されている loadData を実行
if (CONFIG.GAS_API_URL && CONFIG.GAS_API_URL.indexOf("http") === 0) { loadData(); }

// --- UI操作関数群 ---
window.promptPasscode = function() { document.getElementById('pin-input').value = ''; document.getElementById('pin-modal').style.display = 'flex'; };
window.closePinModal = function() { document.getElementById('pin-modal').style.display = 'none'; };
window.checkPin = function() {
    if (document.getElementById('pin-input').value === CONFIG.EDIT_MODE_PIN) { document.getElementById('pin-modal').style.display = 'none'; startApp('edit'); } 
    else { showMessage("❌ 暗証番号が違います。"); document.getElementById('pin-input').value = ''; }
};

window.toggleForm = function(id) { 
    let form = document.getElementById("form-" + id); 
    form.style.display = (form.style.display === "block") ? "none" : "block"; 
};

function setupAreaDropdowns(areas) {
    let areaDropdown = document.getElementById('filter-area-dropdown');
    areaDropdown.innerHTML = '<label><input type="checkbox" id="area-all-checkbox" checked onchange="toggleAllAreas(this.checked)"> <b>🌐 すべて選択</b></label>';
    areas.forEach(area => { areaDropdown.innerHTML += `<label><input type="checkbox" class="area-checkbox" value="${area}" checked onchange="updateAreaBtnText()"> ${area}</label>`; });
    updateAreaBtnText();
    let testAreaSelect = document.getElementById('test-area-select'); testAreaSelect.innerHTML = '<option value="">すべての地区（広域テスト）</option>';
    areas.forEach(area => { testAreaSelect.appendChild(new Option(area, area)); });
}

window.startApp = function(mode) {
    if (State.allData.length === 0) { State.pendingMode = mode; document.getElementById('loading').style.display = 'block'; return; }
    enterApp(mode);
};

function enterApp(mode) {
    State.appMode = mode; 
    document.getElementById('mode-overlay').style.display = 'none'; 
    document.getElementById('top-info-container').style.display = 'flex'; 
    let badge = document.getElementById('current-mode-badge');
    
    if (mode === 'view_water') { 
        badge.innerText = '👀 水利 閲覧'; badge.style.backgroundColor = '#3b82f6'; 
    } else if (mode === 'view_target') { 
        badge.innerText = '📍 目標物 閲覧'; badge.style.backgroundColor = '#10b981'; 
    } else if (mode === 'edit') { 
        badge.innerText = '🛠️ 水利 点検'; badge.style.backgroundColor = '#ef4444'; 
    }
    
    // map.js のオブジェクトを利用
    setTimeout(() => {
        map.invalidateSize();
        if (mode === 'view_target') {
            if (map.hasLayer(markersGroup)) map.removeLayer(markersGroup);
            if (!map.hasLayer(targetMarkersGroup)) map.addLayer(targetMarkersGroup);
            switchSearchTab('target'); 
        } else {
            if (!map.hasLayer(markersGroup)) map.addLayer(markersGroup);
            switchSearchTab('water'); 
        }
        map.locate({setView: true, maxZoom: 17}); 
    }, 100);
}

window.switchSearchTab = function(tabName, skipSearch) {
    State.searchTab = tabName;
    document.getElementById('tab-water').classList.toggle('active', tabName === 'water'); document.getElementById('tab-target').classList.toggle('active', tabName === 'target');
    document.getElementById('filter-group-water').classList.toggle('active', tabName === 'water'); document.getElementById('filter-group-target').classList.toggle('active', tabName === 'target');
    setTimeout(() => { map.invalidateSize(); }, 50); 
    if (!skipSearch) execSearch(false);
};

window.toggleAllAreas = function(isChecked) { document.querySelectorAll('.area-checkbox').forEach(cb => cb.checked = isChecked); updateAreaBtnText(); };
window.updateAreaBtnText = function() {
    let checkboxes = document.querySelectorAll('.area-checkbox'); let checkedBoxes = document.querySelectorAll('.area-checkbox:checked');
    let btn = document.getElementById('filter-area-btn'); let allCheckbox = document.getElementById('area-all-checkbox');
    if(allCheckbox) { allCheckbox.checked = (checkboxes.length === checkedBoxes.length); }
    if (checkedBoxes.length === checkboxes.length) btn.innerText = '🌐 すべての地区'; else if (checkedBoxes.length === 0) btn.innerText = '⚠️ 地区未選択'; else if (checkedBoxes.length === 1) btn.innerText = '📍 ' + checkedBoxes[0].value; else btn.innerText = `📍 ${checkedBoxes.length}地区を選択中`;
};

// --- リスト表示関連 ---
function updateListTable(data, type) {
    let thead = document.getElementById('table-head'); let tbody = document.getElementById('table-body'); tbody.innerHTML = ''; 
    document.getElementById('list-count').innerText = data.length; document.getElementById('table-count').innerText = data.length;
    if (type === 'water') {
        thead.innerHTML = '<tr><th>水利番号</th><th>地区</th><th>種別</th><th>区分</th><th>前回調査日</th><th>要調査</th><th>点検結果</th><th>異常の種類</th><th>コメント</th></tr>';
        data.forEach(row => {
            let tr = document.createElement('tr'); let badgeClass = (row["要調査"] === "要点検") ? "badge-alert" : "badge-ok"; let categoryText = isPublicWater(row["水利番号"]) ? "公設" : "私設";
            tr.innerHTML = `<td style="font-weight:bold;">${row["水利番号"]}</td><td>${row["地区"] || "-"}</td><td>${row["水利種別"]}</td><td>${categoryText}</td><td style="font-weight:bold; color:#0369a1;">${row["前回調査日"] || "未実施"}</td><td><span class="badge ${badgeClass}">${row["要調査"]}</span></td><td>${row["点検結果"] || "-"}</td><td>${row["異常の種類"] || "-"}</td><td style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row["コメント"] || "-"}</td>`;
            tr.addEventListener('click', () => { 
                if (row["緯度"] && row["経度"]) { 
                    document.getElementById('list-container').style.display = 'none';
                    map.setView([row["緯度"], row["経度"]], 18);
                    setTimeout(() => { 
                        markersGroup.eachLayer(marker => { 
                            if (marker.getLatLng().lat == row["緯度"] && marker.getLatLng().lng == row["経度"]) {
                                markersGroup.zoomToShowLayer(marker, () => marker.openPopup());
                            } 
                        }); 
                    }, 300); 
                } 
            });
            tbody.appendChild(tr);
        });
    } else {
        thead.innerHTML = '<tr><th>目標物名称</th><th>種別</th><th>管轄署</th><th>住所</th></tr>';
        data.forEach(row => {
            let color = getTargetColor(row["種別"]);
            let tr = document.createElement('tr'); tr.innerHTML = `<td style="font-weight:bold; color:${color};">${row["名称"]}</td><td>${row["種別"] || "-"}</td><td>${row["管轄署"] || "-"}</td><td>${row["住所"] || "-"}</td>`;
            tr.addEventListener('click', () => { 
                if (row["緯度"] && row["経度"]) { 
                    document.getElementById('list-container').style.display = 'none';
                    map.setView([row["緯度"], row["経度"]], 17);
                    setTimeout(() => { 
                        targetMarkersGroup.eachLayer(marker => { 
                            if (marker.getLatLng().lat == row["緯度"] && marker.getLatLng().lng == row["経度"]) {
                                targetMarkersGroup.zoomToShowLayer(marker, () => marker.openPopup());
                            } 
                        }); 
                    }, 300); 
                } 
            });
            tbody.appendChild(tr);
        });
    }
}

// --- 検索・抽出処理 ---
function execSearch(skipFit) {
    if (State.searchTab === 'water') {
        let selectedCategory = document.getElementById('filter-category').value; let selectedAreas = Array.from(document.querySelectorAll('.area-checkbox:checked')).map(cb => cb.value); let isAllAreas = document.querySelectorAll('.area-checkbox').length === selectedAreas.length; let selectedStatus = document.getElementById('filter-status').value; let selectedError = document.getElementById('filter-error').value; let selectedPaint = document.getElementById('filter-paint').value; let keyword = document.getElementById('search-text').value.trim().toLowerCase(); let filterDateVal = document.getElementById('filter-date').value; let filterDateCond = document.getElementById('filter-date-cond').value; let filterDateTime = filterDateVal ? parseLocalDate(filterDateVal).getTime() : null;
        State.currentFilteredData = State.allData.filter(row => {
            let isPublic = isPublicWater(row["水利番号"]); let matchCategory = (selectedCategory === "") || (selectedCategory === "公設" && isPublic) || (selectedCategory === "私設" && !isPublic); let matchArea = isAllAreas || selectedAreas.includes(row["地区"]); let matchStatus = (selectedStatus === "") || (row["要調査"] === selectedStatus);
            let matchError = true; if (selectedError === "異常あり") matchError = (row["異常の種類"] !== "" && row["異常の種類"] !== "なし"); else if (selectedError !== "") matchError = (row["異常の種類"] === selectedError); 
            let matchPaint = (selectedPaint === "") || (row["塗装レベル"] === selectedPaint);
            let matchDate = true; if (filterDateTime && row["前回調査日"]) { let rowDateTime = parseLocalDate(row["前回調査日"]).getTime(); if (filterDateCond === "before") matchDate = (rowDateTime <= filterDateTime); else if (filterDateCond === "after") matchDate = (rowDateTime >= filterDateTime); }
            let matchKeyword = true; if (keyword !== "") matchKeyword = (row["水利番号"] + row["水利種別"] + (row["コメント"] || "")).toLowerCase().includes(keyword);
            return matchCategory && matchArea && matchStatus && matchError && matchPaint && matchDate && matchKeyword;
        });
        renderMarkers(State.currentFilteredData, skipFit); updateListTable(State.currentFilteredData, 'water');
    } else {
        let selectedJuri = document.getElementById('filter-target-jurisdiction').value; let selectedType = document.getElementById('filter-target-type').value; let keyword = document.getElementById('filter-target-name').value.trim().toLowerCase();
        State.currentTargetFilteredData = State.targetsData.filter(row => {
            let matchJuri = (selectedJuri === "" || row["管轄署"] === selectedJuri); let matchType = (selectedType === "" || row["種別"] === selectedType); let matchKeyword = (keyword === "" || (row["名称"] || "").toLowerCase().includes(keyword));
            return matchJuri && matchType && matchKeyword;
        });
        renderTargetMarkers(State.currentTargetFilteredData, skipFit); updateListTable(State.currentTargetFilteredData, 'target');
    }
    if (window.innerWidth <= 600) document.getElementById('search-panel').style.display = 'none';
}

window.downloadCSV = function() {
    if (State.searchTab === 'water') {
        if (State.currentFilteredData.length === 0) return showMessage("リストが空です");
        let csvContent = "\uFEFF水利番号,地区,水利種別,設置区分,前回調査日,要調査,点検結果,異常の種類,塗装レベル,コメント\r\n"; State.currentFilteredData.forEach(row => { let catText = isPublicWater(row["水利番号"]) ? "公設" : "私設"; csvContent += [row["水利番号"], row["地区"]||"-", row["水利種別"], catText, row["前回調査日"]||"未実施", row["要調査"], row["点検結果"]||"-", row["異常の種類"]||"-", row["塗装レベル"]||"-", (row["コメント"]||"-").replace(/,/g, "，")].join(",") + "\r\n"; });
        let link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })); link.download = `地水利点検リスト_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else {
        if (State.currentTargetFilteredData.length === 0) return showMessage("リストが空です");
        let csvContent = "\uFEFF目標物名称,種別,管轄署,住所\r\n"; State.currentTargetFilteredData.forEach(row => { csvContent += [row["名称"]||"-", row["種別"]||"-", row["管轄署"]||"-", row["住所"]||"-"].join(",") + "\r\n"; });
        let link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })); link.download = `目標物リスト_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
};
window.printReport = function() { document.getElementById('print-date').innerText = `${new Date().getFullYear()}年${new Date().getMonth()+1}月${new Date().getDate()}日`; window.print(); };

// --- DOM読み込み後のイベント設定 ---
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', function(e) {
        let container = document.getElementById('filter-area-container'); let dropdown = document.getElementById('filter-area-dropdown');
        if (container && dropdown && !container.contains(e.target)) dropdown.style.display = 'none';
    });

    document.getElementById('search-toggle-btn').onclick = function() { let panel = document.getElementById('search-panel'); if (panel.style.display === 'flex') { panel.style.display = 'none'; this.classList.remove('tracking'); } else { panel.style.display = 'flex'; this.classList.add('tracking'); } };
    document.getElementById('search-btn').onclick = function() { execSearch(false); };
    document.getElementById('reset-btn').onclick = function() { 
        if (State.searchTab === 'water') { document.getElementById('filter-category').value = ""; toggleAllAreas(true); document.getElementById('filter-status').value = ""; document.getElementById('filter-error').value = ""; document.getElementById('filter-paint').value = ""; document.getElementById('filter-date').value = ""; document.getElementById('filter-date-cond').value = "before"; document.getElementById('search-text').value = ""; } 
        else { document.getElementById('filter-target-jurisdiction').value = ""; document.getElementById('filter-target-type').value = ""; document.getElementById('filter-target-name').value = ""; }
        execSearch(false); 
    };

    document.getElementById('survey-btn').onclick = function() { 
        if (!map.hasLayer(markersGroup)) map.addLayer(markersGroup);
        switchSearchTab('water', true); 
        document.getElementById('filter-category').value = "公設"; toggleAllAreas(true); document.getElementById('filter-status').value = ""; document.getElementById('filter-error').value = ""; document.getElementById('filter-paint').value = ""; document.getElementById('filter-date').value = `${new Date().getFullYear()}-05-01`; document.getElementById('filter-date-cond').value = "before"; document.getElementById('search-text').value = ""; document.getElementById('search-panel').style.display = 'flex'; 
        execSearch(false); 
    };
    
    document.getElementById('list-toggle-btn').onclick = function() {
        let container = document.getElementById('list-container');
        if (container.style.display !== 'flex') {
            if (State.searchTab === 'water') updateListTable(State.currentFilteredData, 'water');
            else updateListTable(State.currentTargetFilteredData, 'target');
            container.style.display = 'flex';
        } else {
            container.style.display = 'none';
        }
    };

    document.getElementById('list-close-btn').onclick = function() {
        document.getElementById('list-container').style.display = 'none';
    };

    document.getElementById('today-list-btn').onclick = function() { 
        if (!map.hasLayer(markersGroup)) map.addLayer(markersGroup);
        switchSearchTab('water', true); 
        let today = new Date(); 
        let mm = ("0" + (today.getMonth() + 1)).slice(-2);
        let dd = ("0" + today.getDate()).slice(-2);
        let todayStr1 = `${today.getFullYear()}/${mm}/${dd}`; 
        let todayStr2 = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`; 
        State.currentFilteredData = State.allData.filter(row => row["前回調査日"] === todayStr1 || row["前回調査日"] === todayStr2); 
        renderMarkers(State.currentFilteredData, false); 
        updateListTable(State.currentFilteredData, 'water'); 
        
        document.getElementById('list-container').style.display = 'flex'; 
        if (window.innerWidth <= 600) document.getElementById('search-panel').style.display = 'none'; 
    };

    document.getElementById('gps-btn').onclick = function() { 
        let btn = document.getElementById('gps-btn'); 
        if (State.isTracking) { 
            State.isTracking = false; map.stopLocate(); btn.classList.remove('tracking'); btn.innerHTML = '<span class="btn-icon">📍</span><span class="btn-text pc-only">現在地</span><span class="btn-text sp-only">現在地</span>'; 
        } else { 
            State.isTracking = true; btn.classList.add('tracking'); btn.innerHTML = '<span class="btn-icon">🟢</span><span class="btn-text pc-only">追従中</span><span class="btn-text sp-only">追従中</span>'; map.locate({setView: true, maxZoom: 18, watch: true, enableHighAccuracy: true}); 
        } 
    };
});

// --- テストモード ロジック (現状維持) ---
const TestManager = { modeType: 'nearest', question: null, isActive: false, elements: [], fireMarker: null, fireCircle: null, excavatePool: [], hitCount: 0, missCount: 0, missLimit: 5, userTapsForNearest: [] };

window.selectTestMode = function(mode) {
    TestManager.modeType = mode;
    ['nearest', 'excavate', 'target'].forEach(m => {
        let btn = document.getElementById('btn-mode-' + m); btn.style.background = '#f1f5f9'; btn.style.color = '#475569'; btn.style.border = '1px solid #cbd5e1'; document.getElementById('setup-' + m).style.display = 'none';
    });
    let activeBtn = document.getElementById('btn-mode-' + mode); activeBtn.style.background = '#e83e8c'; activeBtn.style.color = 'white'; activeBtn.style.border = 'none'; document.getElementById('setup-' + mode).style.display = 'block';
};

window.execTestMode = function() { if (TestManager.modeType === 'nearest') initNearestTest(); else if (TestManager.modeType === 'excavate') initExcavateTest(); else initTargetTest(); };

function startTestUI() {
    State.appMode = 'test';
    document.getElementById('test-setup-modal').style.display = 'none'; document.getElementById('main-side-btns').style.display = 'none'; document.getElementById('top-info-container').style.display = 'none'; document.getElementById('test-header').style.display = 'block';
    renderMarkers([], true); targetMarkersGroup.clearLayers();
}

window.quitTestMode = function() {
    if(TestManager.fireMarker) { map.removeLayer(TestManager.fireMarker); TestManager.fireMarker = null; }
    if(TestManager.fireCircle) { map.removeLayer(TestManager.fireCircle); TestManager.fireCircle = null; }
    map.off('click', onMapClickForNearest); map.off('click', onMapClickForExcavate); map.off('click', onMapClickForTarget);
    TestManager.elements.forEach(el => map.removeLayer(el)); TestManager.elements = [];
    targetMarkersGroup.clearLayers();
    
    document.getElementById('test-header').style.display = 'none'; document.getElementById('test-result-modal').style.display = 'none'; document.getElementById('test-setup-modal').style.display = 'none';
    document.getElementById('main-side-btns').style.display = 'flex'; document.getElementById('top-info-container').style.display = 'flex';
    State.appMode = 'view_water'; document.getElementById('current-mode-badge').innerText = '👀 水利 閲覧'; document.getElementById('current-mode-badge').style.backgroundColor = '#3b82f6';
    
    if (!map.hasLayer(markersGroup)) map.addLayer(markersGroup);
    switchSearchTab('water');
};

function initNearestTest() {
    let area = document.getElementById('test-area-select').value; let pool = State.allData.filter(row => (area === "" || row["地区"] === area) && row["緯度"] && row["経度"]);
    if(pool.length < 5) return showMessage(`この地区には水利が ${pool.length} 件しかありません。最低5件以上必要です。`);
    let base = pool[Math.floor(Math.random() * pool.length)];
    let fireLat = parseFloat(base["緯度"]) + (Math.random() - 0.5) * 0.002; let fireLng = parseFloat(base["経度"]) + (Math.random() - 0.5) * 0.002; let fireLatLng = L.latLng(fireLat, fireLng);
    let allInRadius = pool.map(r => ({ row: r, dist: map.distance(fireLatLng, L.latLng(r["緯度"], r["経度"])) })).filter(r => r.dist <= 200).sort((a, b) => a.dist - b.dist);
    let targetCount = Math.min(5, allInRadius.length);
    if (targetCount === 0) { allInRadius = pool.map(r => ({ row: r, dist: map.distance(fireLatLng, L.latLng(r["緯度"], r["経度"])) })).sort((a, b) => a.dist - b.dist); targetCount = Math.min(5, allInRadius.length); }
    TestManager.question = { fireLat: fireLat, fireLng: fireLng, targets: allInRadius.slice(0, targetCount), allInRadius: allInRadius };
    TestManager.isActive = false; TestManager.elements = [];
    if(TestManager.fireCircle) { map.removeLayer(TestManager.fireCircle); TestManager.fireCircle = null; }
    startTestUI(); map.on('click', onMapClickForNearest); showNearestQuestion();
}
window.retryNearestTest = function() { TestManager.elements.forEach(el => map.removeLayer(el)); TestManager.elements = []; targetMarkersGroup.clearLayers(); showNearestQuestion(); }
function showNearestQuestion() {
    TestManager.userTapsForNearest = []; let q = TestManager.question;
    document.getElementById('test-progress').innerText = `🔥 火災周辺5ヶ所当てテスト`; document.getElementById('test-question').innerText = `半径200m以内の水利を【 ${q.targets.length}ヶ所 】タップせよ！`; document.getElementById('test-instruction').innerHTML = `<span style="color:#f59e0b;">現在：0 / ${q.targets.length} ヶ所 指定完了</span>`;
    if(TestManager.fireMarker) map.removeLayer(TestManager.fireMarker); if(TestManager.fireCircle) map.removeLayer(TestManager.fireCircle);
    TestManager.fireMarker = L.marker([q.fireLat, q.fireLng], { icon: L.divIcon({ className: 'marker-fire-wrapper', html: '<div class="marker-fire-anim">🔥</div>', iconSize: [34, 34], iconAnchor: [17, 34] }) }).addTo(map);
    TestManager.fireCircle = L.circle([q.fireLat, q.fireLng], { radius: 200, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15, dashArray: '5, 5' }).addTo(map);
    map.setView([q.fireLat, q.fireLng], 16); 
    renderTargetMarkersForTest(L.latLng(q.fireLat, q.fireLng));
    setTimeout(() => { TestManager.isActive = true; }, 300);
}
function onMapClickForNearest(e) {
    if(!TestManager.isActive) return; let q = TestManager.question; TestManager.userTapsForNearest.push(e.latlng);
    let userMarker = L.circleMarker(e.latlng, {radius: 8, color: '#ffffff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2}).addTo(map); TestManager.elements.push(userMarker);
    document.getElementById('test-instruction').innerHTML = `<span style="color:#f59e0b;">現在：${TestManager.userTapsForNearest.length} / ${q.targets.length} ヶ所 指定完了</span>`;
    if(TestManager.userTapsForNearest.length >= q.targets.length) { TestManager.isActive = false; showNearestAnswers(q, TestManager.userTapsForNearest); }
}
function showNearestAnswers(q, userTaps) {
    let limitDist = document.getElementById('test-hard-mode').checked ? 10 : 20; let pairs = [];
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
    let allLatLngs = [...userTaps, ...q.allInRadius.map(t => L.latLng(t.row["緯度"], t.row["経度"])), L.latLng(q.fireLat, q.fireLng)]; map.fitBounds(L.latLngBounds(allLatLngs), {padding: [50,50], maxZoom: 18});
    document.getElementById('test-instruction').innerHTML = `<div style="margin-bottom: 8px;"><span style="color:#10b981; font-size:14px; background:#fff; padding:3px 10px; border-radius:10px;">${q.targets.length}ヶ所中 ${roundCorrect}ヶ所正解！</span></div><div style="display: flex; gap: 10px; justify-content: center;"><button onclick="retryNearestTest()" style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">🔄 もう一度</button><button onclick="initNearestTest()" style="padding: 6px 12px; background: #e83e8c; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">▶️ 次の問題</button></div>`;
}

function initExcavateTest() {
    let bounds = map.getBounds(); TestManager.excavatePool = State.allData.filter(row => row["緯度"] && row["経度"] && bounds.contains(L.latLng(row["緯度"], row["経度"])));
    if (TestManager.excavatePool.length === 0) return showMessage("画面に映っている範囲に水利がありません。");
    TestManager.missLimit = parseInt(document.getElementById('test-miss-limit').value); TestManager.hitCount = 0; TestManager.missCount = 0; TestManager.isActive = false; TestManager.elements = []; TestManager.excavatePool.forEach(q => q.excavated = false); 
    startTestUI(); updateExcavateHeader(); map.on('click', onMapClickForExcavate); 
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
    if (!TestManager.isActive) return; let limitDist = document.getElementById('test-hard-mode').checked ? 10 : 20; let hitIndex = -1; let minDist = Infinity;
    TestManager.excavatePool.forEach((q, index) => {
        if (q.excavated) return; let dist = map.distance(e.latlng, L.latLng(q["緯度"], q["経度"]));
        if (dist <= limitDist && dist < minDist) { minDist = dist; hitIndex = index; }
    });
    if (hitIndex !== -1) {
        let q = TestManager.excavatePool[hitIndex]; q.excavated = true; TestManager.hitCount++;
        let ansIcon = L.divIcon({ className: (q["水利種別"] === "消火栓") ? 'marker-hydrant' : 'marker-tank', iconSize: [24, 24], iconAnchor: [12, 12] });
        TestManager.elements.push(L.marker([q["緯度"], q["経度"]], {icon: ansIcon}).addTo(map));
    } else {
        TestManager.missCount++; TestManager.elements.push(L.marker(e.latlng, {icon: L.divIcon({ className: 'marker-miss', html: '❌', iconSize: [20, 20], iconAnchor: [10, 10] })}).addTo(map));
    }
    updateExcavateHeader();
    if (TestManager.hitCount >= TestManager.excavatePool.length || TestManager.missCount >= TestManager.missLimit) { 
        TestManager.isActive = false; let isCleared = TestManager.hitCount >= TestManager.excavatePool.length;
        document.getElementById('test-instruction').innerHTML = `<span style="color:#10b981; font-size:14px; background:#fff; padding:2px 8px; border-radius:10px; cursor:pointer;">${isCleared ? '完全制覇！' : 'ゲームオーバー！'} 地図をタップして結果へ👉</span>`;
        setTimeout(() => { map.once('click', () => showExcavateResult(isCleared)); }, 1000);
    }
}
function showExcavateResult(isCleared) {
    map.off('click', onMapClickForExcavate); document.getElementById('test-header').style.display = 'none';
    let score = Math.round((TestManager.hitCount / TestManager.excavatePool.length) * 100);
    TestManager.excavatePool.forEach(q => {
        if (!q.excavated) {
            let ansIcon = L.divIcon({ className: ((q["水利種別"] === "消火栓") ? 'marker-hydrant' : 'marker-tank') + ' missed-marker', iconSize: [24, 24], iconAnchor: [12, 12] });
            TestManager.elements.push(L.marker([q["緯度"], q["経度"]], {icon: ansIcon}).addTo(map));
        }
    });
    document.getElementById('test-score-label').innerText = "発掘率"; document.getElementById('test-score-display').innerText = `${score}%`; document.getElementById('test-score-display').style.color = score >= 80 ? '#e83e8c' : '#f59e0b';
    document.getElementById('test-correct-display').innerText = `${TestManager.excavatePool.length}個中 ${TestManager.hitCount}個 発見！`; document.getElementById('test-message-display').innerHTML = `お手つき: ${TestManager.missCount} 回<br><br>${isCleared ? "🏆 完全制覇！" : "💀 お手つき上限に達しました..."}`;
    document.getElementById('test-result-modal').style.display = 'flex';
}

function initTargetTest() {
    let selectedJurisdiction = document.getElementById('test-jurisdiction-select').value; let selectedType = document.getElementById('test-target-type-select').value;
    let pool = State.targetsData.filter(row => {
        if (!row["緯度"] || !row["経度"]) return false; let matchJuri = (selectedJurisdiction === "" || row["管轄署"] === selectedJurisdiction); let matchType = (selectedType === "" || row["種別"] === selectedType); return matchJuri && matchType;
    });
    if(pool.length === 0) return showMessage(`指定された条件の目標物データが見つかりません。`);
    let target = pool[Math.floor(Math.random() * pool.length)];
    TestManager.question = target; TestManager.isActive = false; TestManager.elements = [];
    startTestUI(); showTargetQuestion(target); map.on('click', onMapClickForTarget);
}
function showTargetQuestion(target) {
    document.getElementById('test-progress').innerText = `📍 目標物ピンポイント当て (${target["管轄署"] || '管轄不明'})`; document.getElementById('test-question').innerText = `Q. 「${target["名称"]}」はどこ？`; document.getElementById('test-instruction').innerHTML = `<span style="color:#f59e0b;">マップ上の正しい位置を1回だけタップしてください</span>`;
    if (document.getElementById('test-jurisdiction-select').value !== "") {
        let areaHints = Object.keys(State.areaMapping).filter(key => State.areaMapping[key] === target["管轄署"]); let hintWater = State.allData.find(w => areaHints.includes(w["地区"]));
        if (hintWater) { map.setView([hintWater["緯度"], hintWater["経度"]], 13); }
    } else { map.setView([34.2305, 135.1705], 13); }
    setTimeout(() => { TestManager.isActive = true; }, 500);
}
function onMapClickForTarget(e) {
    if(!TestManager.isActive) return; TestManager.isActive = false; 
    let target = TestManager.question; let targetLatLng = L.latLng(target["緯度"], target["経度"]); let dist = map.distance(e.latlng, targetLatLng);
    let limitDist = document.getElementById('test-hard-mode').checked ? 30 : 60; let isCorrect = dist <= limitDist;
    
    let userMarker = L.marker(e.latlng, {icon: L.divIcon({ className: 'marker-miss', html: isCorrect ? '🎯' : '❌', iconSize: [24, 24], iconAnchor: [12, 12] })}).addTo(map);
    
    let color = getTargetColor(target["種別"]);
    let correctHtml = `<div class="marker-target-wrapper"><div class="marker-target-label" style="border-left: 4px solid ${color}; color: #0f172a; border-color: ${color};">${target["名称"]}</div></div>`;
    let correctIcon = L.divIcon({ className: 'marker-target-container', html: correctHtml, iconSize: [0, 0] });
    
    let ansMarker = L.marker(targetLatLng, {icon: correctIcon}).addTo(map);
    let line = L.polyline([e.latlng, targetLatLng], {color: isCorrect ? '#10b981' : '#ef4444', weight: 3, dashArray: '5, 5'}).addTo(map);
    
    TestManager.elements.push(userMarker, ansMarker, line); map.fitBounds(L.latLngBounds([e.latlng, targetLatLng]), {padding: [50, 50], maxZoom: 17});
    document.getElementById('test-instruction').innerHTML = `<div style="margin-bottom: 8px;"><span style="color:${isCorrect ? '#10b981' : '#ef4444'}; font-size:15px; font-weight:bold; background:#fff; padding:3px 10px; border-radius:10px;">${isCorrect ? '大正解🎉' : '残念！'} 誤差: ${Math.round(dist)}m (基準:${limitDist}m)</span></div><div style="display: flex; gap: 10px; justify-content: center;"><button onclick="initTargetTest()" style="padding: 8px 15px; background: #3b82f6; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">▶️ 次のクイズへ</button></div>`;
}
