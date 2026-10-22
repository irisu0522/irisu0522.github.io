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

// パスワード入力後にどのモードを開くか覚えておくための変数
let pendingPinMode = 'edit';

window.promptPasscode = function(mode) { 
    pendingPinMode = mode || 'edit'; 
    document.getElementById('pin-input').value = ''; 
    document.getElementById('pin-modal').style.display = 'flex'; 
};
window.closePinModal = function() { document.getElementById('pin-modal').style.display = 'none'; };
window.checkPin = function() {
    if (document.getElementById('pin-input').value === CONFIG.EDIT_MODE_PIN) { 
        document.getElementById('pin-modal').style.display = 'none'; 
        startApp(pendingPinMode); // 記憶したモードで開始する
    } 
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
    } else if (mode === 'photo_only') { 
        badge.innerText = '📸 非番パトロール'; badge.style.backgroundColor = '#8b5cf6'; 
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
        // ★変更1：「写真」という見出し（th）を増やしました
        thead.innerHTML = '<tr><th>水利番号</th><th>地区</th><th>種別</th><th>区分</th><th>前回調査日</th><th>写真</th><th>要調査</th><th>点検結果</th><th>異常の種類</th><th>コメント</th></tr>';
        
        data.forEach(row => {
            let tr = document.createElement('tr'); 
            let badgeClass = (row["要調査"] === "要点検") ? "badge-alert" : "badge-ok"; 
            let categoryText = isPublicWater(row["水利番号"]) ? "公設" : "私設";
            
            // ★追加：写真がある場合、小さなサムネイル画像を作る
            let photoHtml = '<span style="color:#94a3b8; font-size:10px;">未添付</span>';
            let farImg = row["遠景写真"] || row["近景写真"]; // どちらかがあれば表示
            if (farImg) {
                let match = farImg.match(/\/d\/(.*?)\//);
                if (match && match[1]) {
                    let thumbUrl = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
                    // 写真タップ時は拡大（openImageModal）し、地図ジャンプ（stopPropagation）は防ぐ
                    photoHtml = `<img src="${thumbUrl}" style="width:35px; height:35px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid #cbd5e1;" onclick="event.stopPropagation(); if(typeof openImageModal === 'function') openImageModal('${thumbUrl}')" onerror="this.style.display='none'">`;
                }
            }

            // ★変更2：<td>${photoHtml}</td> を列の中に追加しました
            tr.innerHTML = `<td style="font-weight:bold;">${row["水利番号"]}</td><td>${row["地区"] || "-"}</td><td>${row["水利種別"]}</td><td>${categoryText}</td><td style="font-weight:bold; color:#0369a1;">${row["前回調査日"] || "未実施"}</td><td style="text-align:center; vertical-align:middle;">${photoHtml}</td><td><span class="badge ${badgeClass}">${row["要調査"]}</span></td><td>${row["点検結果"] || "-"}</td><td>${row["異常の種類"] || "-"}</td><td style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${row["コメント"] || "-"}</td>`;
            
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
        let selectedCategory = document.getElementById('filter-category').value; 
        let selectedAreas = Array.from(document.querySelectorAll('.area-checkbox:checked')).map(cb => cb.value); 
        let isAllAreas = document.querySelectorAll('.area-checkbox').length === selectedAreas.length; 
        let selectedStatus = document.getElementById('filter-status').value; 
        let selectedError = document.getElementById('filter-error').value; 
        let selectedPaint = document.getElementById('filter-paint').value; 
        let keyword = document.getElementById('search-text').value.trim().toLowerCase(); 
        let filterDateVal = document.getElementById('filter-date').value; 
        let filterDateCond = document.getElementById('filter-date-cond').value; 
        let filterDateTime = filterDateVal ? parseLocalDate(filterDateVal).getTime() : null;
        
        // ★追加：写真フィルターの値を取得（HTMLに追加するまでは空扱い）
        let filterPhotoEl = document.getElementById('filter-photo');
        let selectedPhoto = filterPhotoEl ? filterPhotoEl.value : "";

        State.currentFilteredData = State.allData.filter(row => {
            let isPublic = isPublicWater(row["水利番号"]); 
            let matchCategory = (selectedCategory === "") || (selectedCategory === "公設" && isPublic) || (selectedCategory === "私設" && !isPublic); 
            let matchArea = isAllAreas || selectedAreas.includes(row["地区"]); 
            let matchStatus = (selectedStatus === "") || (row["要調査"] === selectedStatus);
            let matchError = true; 
            if (selectedError === "異常あり") matchError = (row["異常の種類"] !== "" && row["異常の種類"] !== "なし"); 
            else if (selectedError !== "") matchError = (row["異常の種類"] === selectedError); 
            let matchPaint = (selectedPaint === "") || (row["塗装レベル"] === selectedPaint);
            let matchDate = true; 
            if (filterDateTime && row["前回調査日"]) { 
                let rowDateTime = parseLocalDate(row["前回調査日"]).getTime(); 
                if (filterDateCond === "before") matchDate = (rowDateTime <= filterDateTime); 
                else if (filterDateCond === "after") matchDate = (rowDateTime >= filterDateTime); 
            }
            let matchKeyword = true; 
            if (keyword !== "") matchKeyword = (row["水利番号"] + row["水利種別"] + (row["コメント"] || "")).toLowerCase().includes(keyword);
            
            // ★追加：写真の有無で判定（写真URLか更新日のどれかがあれば「あり」とする）
            let hasPhoto = !!(row["遠景写真"] || row["近景写真"] || row["写真更新日"]);
            let matchPhoto = true;
            if (selectedPhoto === "あり") matchPhoto = hasPhoto;
            else if (selectedPhoto === "なし") matchPhoto = !hasPhoto;

            return matchCategory && matchArea && matchStatus && matchError && matchPaint && matchDate && matchKeyword && matchPhoto;
        });
        renderMarkers(State.currentFilteredData, skipFit); updateListTable(State.currentFilteredData, 'water');
    } else {
        let selectedJuri = document.getElementById('filter-target-jurisdiction').value; 
        let selectedType = document.getElementById('filter-target-type').value; 
        let keyword = document.getElementById('filter-target-name').value.trim().toLowerCase();
        State.currentTargetFilteredData = State.targetsData.filter(row => {
            let matchJuri = (selectedJuri === "" || row["管轄署"] === selectedJuri); 
            let matchType = (selectedType === "" || row["種別"] === selectedType); 
            let matchKeyword = (keyword === "" || (row["名称"] || "").toLowerCase().includes(keyword));
            return matchJuri && matchType && matchKeyword;
        });
        renderTargetMarkers(State.currentTargetFilteredData, skipFit); updateListTable(State.currentTargetFilteredData, 'target');
    }
    if (window.innerWidth <= 600) document.getElementById('search-panel').style.display = 'none';
}
// --- Excel出力機能（復活） ---
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

// --- ★新機能：PDF台帳出力機能 ---
window.printReport = function() { 
    if (State.searchTab !== 'water' || State.currentFilteredData.length === 0) {
        return showMessage("出力する水利データがありません。リストを抽出してください。");
    }

    let container = document.getElementById('pdf-report-container');
    container.innerHTML = ''; // 一旦中身を空にする
    let todayStr = `${new Date().getFullYear()}年${new Date().getMonth()+1}月${new Date().getDate()}日`;

    // 抽出されている水利データを1件ずつ台帳化する
    State.currentFilteredData.forEach((row, index) => {
        let categoryText = isPublicWater(row["水利番号"]) ? "公設" : "私設";
        let isAlert = row["要調査"] === "要点検" ? "🔴 要点検" : "🟢 点検済";

        // 写真URLの変換処理
        let farImgUrl = row["遠景写真"] ? getDriveImageUrl(row["遠景写真"]) : "";
        let nearImgUrl = row["近景写真"] ? getDriveImageUrl(row["近景写真"]) : "";
        let photoDateStr = row["写真更新日"] ? `（更新：${row["写真更新日"]}）` : "";

        let photoHtml = '';
        if (farImgUrl || nearImgUrl) {
            photoHtml = `<div class="pdf-photo-area">`;
            if (farImgUrl) photoHtml += `<div class="pdf-photo-box"><div class="pdf-photo-label">📸 遠景写真 ${photoDateStr}</div><img src="${farImgUrl}"></div>`;
            if (nearImgUrl) photoHtml += `<div class="pdf-photo-box"><div class="pdf-photo-label">📸 近景写真（異常箇所） ${photoDateStr}</div><img src="${nearImgUrl}"></div>`;
            photoHtml += `</div>`;
        } else {
            photoHtml = `<div style="text-align:center; padding: 40px; color:#94a3b8; border: 1px dashed #cbd5e1;">写真データは添付されていません</div>`;
        }

        // 1件分のHTMLを作成
        let pageHtml = `
            <div class="pdf-page">
                <div class="pdf-header">
                    <h1 class="pdf-title">地水利 点検・調査台帳</h1>
                    <div class="pdf-date">出力日：${todayStr}</div>
                </div>
                <table class="pdf-table">
                    <tr><th>水利番号</th><td style="font-weight:bold; font-size:16px;">${row["水利番号"]}</td></tr>
                    <tr><th>地区 / 設置区分</th><td>${row["地区"] || "-"} / ${categoryText}</td></tr>
                    <tr><th>水利種別</th><td>${row["水利種別"]}</td></tr>
                    <tr><th>点検状況</th><td style="font-weight:bold;">${isAlert} (前回調査日: ${row["前回調査日"] || "未実施"})</td></tr>
                    <tr><th>点検結果 / 異常</th><td>${row["点検結果"] || "-"} / ${row["異常の種類"] || "-"}</td></tr>
                    <tr><th>コメント</th><td>${row["コメント"] || "-"}</td></tr>
                </table>
                ${photoHtml}
            </div>
        `;
        container.innerHTML += pageHtml;
    });

    // データのセットが終わったら、ブラウザの印刷機能を呼び出す
    setTimeout(() => { window.print(); }, 500); 
};
// --- DOM読み込み後のイベント設定 ---
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', function(e) {
        let container = document.getElementById('filter-area-container'); let dropdown = document.getElementById('filter-area-dropdown');
        if (container && dropdown && !container.contains(e.target)) dropdown.style.display = 'none';
    });

    document.getElementById('search-toggle-btn').onclick = function() { let panel = document.getElementById('search-panel'); if (panel.style.display === 'flex') { panel.style.display = 'none'; this.classList.remove('tracking'); } else { panel.style.display = 'flex'; this.classList.add('tracking'); } };
    document.getElementById('search-btn').onclick = function() { execSearch(false); };
    document.getElementById('reset-btn').onclick = function() { 
       // 新しいコード
        if (State.searchTab === 'water') { document.getElementById('filter-category').value = ""; toggleAllAreas(true); document.getElementById('filter-status').value = ""; document.getElementById('filter-error').value = ""; document.getElementById('filter-paint').value = ""; document.getElementById('filter-photo').value = ""; document.getElementById('filter-date').value = ""; document.getElementById('filter-date-cond').value = "before"; document.getElementById('search-text').value = ""; }
        else { document.getElementById('filter-target-jurisdiction').value = ""; document.getElementById('filter-target-type').value = ""; document.getElementById('filter-target-name').value = ""; }
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
