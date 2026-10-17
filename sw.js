// インストール処理
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// 現在は「アプリ化してURLバーを消す」ことがメインのため、
// オフラインキャッシュ等の複雑な処理は除いたシンプルな状態にしています。
self.addEventListener('fetch', function(event) {
  // そのままネットワークへ通信を通す
});
