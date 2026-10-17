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
    
    // 写真ファイルの取得（新しく追加した部分）
    let farFile = document.getElementById("input-far-" + id).files[0];
    let nearFile = document.getElementById("input-near-" + id).files[0];
    
    btn.disabled = true; 
    btn.innerText = "送信中... (写真がある場合は数秒かかります)";
    btn.style.backgroundColor = "#f59e0b"; // 処理中オレンジ
    
    try {
        // ① もし写真があれば、圧縮してPOST送信（先ほど作ったGASのdoPostへ）
        if (farFile || nearFile) {
            let farBase64 = await resizeImageBase64(farFile);
            let nearBase64 = await resizeImageBase64(nearFile);
            
            let photoPayload = {
                action: "upload_photos",
                id: id,
                farImage: farBase64,
                nearImage: nearBase64
            };
            
            await fetch(CONFIG.GAS_API_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(photoPayload)
            });
        }

        // ② 今まで通りの文字データの送信（GET送信）
        let requestUrl = `${CONFIG.GAS_API_URL}?action=update&id=${encodeURIComponent(id)}&result=${encodeURIComponent(resultVal)}&error=${encodeURIComponent(errorVal)}&paint=${encodeURIComponent(paintVal)}&comment=${encodeURIComponent(commentVal)}&t=${Date.now()}`;
        
        let res = await (await fetch(requestUrl)).json();
        
        if (res.status === "Success") {
            btn.innerText = "送信完了！"; 
            btn.style.backgroundColor = "#28a745"; // 成功グリーン
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
// 画像を自動で圧縮する関数（長辺800px・画質70%にリサイズ）
async function resizeImageBase64(file) {
    return new Promise((resolve) => {
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_SIZE = 800; // スマホで十分綺麗に見えるサイズ
                let width = img.width, height = img.height;
                
                if (width > height) {
                    if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                } else {
                    if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    });
}
