// ==========================================
// api.js : GASとの通信・データ連携を専門に扱うファイル
// ==========================================

const CONFIG = {
    // 🌟 最新のGASデプロイURL
    GAS_API_URL: "https://script.google.com/macros/s/AKfycbw4kvzRzNjkOF2lKulHVtoqml0mjP1GQHBvNVD9mXq05ipvMsZaiRC6GCAYXqmOtmzD/exec",
    EDIT_MODE_PIN: "1190"
};

// GAS特有のキャッシュ(古いデータ)読み込みを回避するURLジェネレーター
function getFetchUrl(baseAction) {
    return `${CONFIG.GAS_API_URL}?action=${baseAction}&t=${Date.now()}`;
}

// 起動時のデータ一括読み込み処理
async function loadData() {
    try {
        if (!CONFIG.GAS_API_URL || !CONFIG.GAS_API_URL.startsWith("http")) throw new Error("GASのURLが設定されていません。");
        // GASのリダイレクト仕様に対応するため redirect: 'follow' を必須設定
        const response = await fetch(getFetchUrl("get_data"), { method: 'GET', redirect: 'follow', headers: { 'Accept': 'application/json' } }); 
        if (!response.ok) throw new Error(`通信エラー (${response.status})`);

        const textData = await response.text(); 
        let result = JSON.parse(textData);
        
        // グローバル変数(State)にデータを格納
        State.allData = result.data || []; 
        State.targetsData = result.targets || []; 
        State.areaMapping = result.mapping || {};   
        State.currentFilteredData = [...State.allData]; 
        State.currentTargetFilteredData = [...State.targetsData];
        
        // 画面のUI更新
        document.getElementById('view-count-badge').innerText = `👁️ 閲覧数: ${result.viewCount || 0}`;
        document.getElementById('data-update-date').innerText = `📅 データ最終更新日: ${result.updateDate || "未設定"}`;
        
        // 検索用ドロップダウンの構築
        let areas = [...new Set(State.allData.map(row => row["地区"]).filter(a => a))].sort(); 
        setupAreaDropdowns(areas);

        let jurisdictions = [...new Set(State.targetsData.map(t => t["管轄署"]).filter(Boolean))].sort();
        let testJSelect = document.getElementById('test-jurisdiction-select'); let searchJSelect = document.getElementById('filter-target-jurisdiction');
        jurisdictions.forEach(j => { testJSelect.appendChild(new Option(j, j)); searchJSelect.appendChild(new Option(j, j)); });

        let targetTypes = [...new Set(State.targetsData.map(t => t["種別"]).filter(Boolean))].sort();
        let testTSelect = document.getElementById('test-target-type-select'); let searchTSelect = document.getElementById('filter-target-type');
        targetTypes.forEach(t => { testTSelect.appendChild(new Option(t, t)); searchTSelect.appendChild(new Option(t, t)); });

        // もしローディング中にモード選択が予約されていれば、そのモードに入る
        if (State.pendingMode) { 
            document.getElementById('loading').style.display = 'none'; 
            enterApp(State.pendingMode); 
        }
    } catch (error) { 
        console.error(error); 
        document.getElementById('data-update-date').innerText = "📅 データの取得に失敗しました";
        showMessage(`データの読み込みに失敗しました。\n\n【詳細】\n${error.message}`); 
        document.getElementById('loading').innerText = "❌ 読み込みエラー"; 
    }
}

// 現場からの点検結果送信処理
window.submitReport = async function(id) {
    let btn = document.getElementById("btn-" + id);
    let resultVal = document.getElementById("input-result-" + id).value; 
    let errorVal = document.getElementById("input-error-" + id).value; 
    let paintVal = document.getElementById("input-paint-" + id).value; 
    let commentVal = document.getElementById("input-comment-" + id).value;
    
    btn.disabled = true; btn.innerText = "送信中...";
    
    let requestUrl = `${CONFIG.GAS_API_URL}?action=update&id=${encodeURIComponent(id)}&result=${encodeURIComponent(resultVal)}&error=${encodeURIComponent(errorVal)}&paint=${encodeURIComponent(paintVal)}&comment=${encodeURIComponent(commentVal)}&t=${Date.now()}`;
    
    try {
        let res = await (await fetch(requestUrl, { redirect: 'follow' })).json();
        if (res.status === "Success") {
            btn.innerText = "送信完了！"; btn.style.backgroundColor = "#28a745";
            let targetIndex = State.allData.findIndex(row => row["水利番号"] === id);
            if (targetIndex !== -1) {
                let today = new Date(); 
                State.allData[targetIndex]["前回調査日"] = `${today.getFullYear()}/${("0" + (today.getMonth() + 1)).slice(-2)}/${("0" + today.getDate()).slice(-2)}`;
                State.allData[targetIndex]["要調査"] = "点検済"; 
                State.allData[targetIndex]["点検結果"] = resultVal; 
                State.allData[targetIndex]["異常の種類"] = errorVal; 
                State.allData[targetIndex]["塗装レベル"] = paintVal; 
                State.allData[targetIndex]["コメント"] = commentVal;
            }
            setTimeout(() => { map.closePopup(); execSearch(true); }, 1500);
        } else { 
            showMessage("送信エラー: " + res.message); 
            btn.disabled = false; btn.innerText = "送信失敗（再試行）"; 
        }
    } catch (err) { 
        showMessage("送信に失敗しました。電波状態を確認してください。"); 
        btn.disabled = false; btn.innerText = "スプレッドシートへ送信"; 
    }
};

// 不具合・要望の送信処理
window.submitReportForm = async function() {
    let typeVal = document.getElementById("report-type").value;
    let contentVal = document.getElementById("report-content").value.trim();
    
    if (!contentVal) {
        showMessage("内容を入力してください。");
        return;
    }
    
    let btn = document.getElementById("submit-report-btn");
    btn.disabled = true;
    btn.innerText = "送信中...";
    
    let requestUrl = `${CONFIG.GAS_API_URL}?action=report&type=${encodeURIComponent(typeVal)}&content=${encodeURIComponent(contentVal)}&t=${Date.now()}`;
    
    try {
        let res = await (await fetch(requestUrl, { redirect: 'follow' })).json();
        if (res.status === "Success") {
            showMessage("報告を送信しました。ご協力ありがとうございます！");
            document.getElementById("report-content").value = "";
            document.getElementById("report-modal").style.display = 'none';
        } else {
            showMessage("送信エラー: " + res.message);
        }
    } catch (err) {
        showMessage("送信に失敗しました。電波状態を確認してください。");
    } finally {
        btn.disabled = false;
        btn.innerText = "送信する";
    }
};
