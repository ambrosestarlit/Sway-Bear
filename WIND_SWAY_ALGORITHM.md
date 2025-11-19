# 風揺れエフェクト 技術仕様書

## 概要

画像に自然な風揺れアニメーションを適用するエフェクトシステムの完全仕様です。
WebGLを使用した高速なメッシュ変形により、リアルタイムプレビューと高品質な出力を実現します。

---

## アルゴリズム概要

### 基本原理

1. 画像を縦方向に分割してメッシュを生成
2. 各分割点に対してサイン波による揺れを計算
3. 上部ほど固定、下部ほど大きく揺れる非線形減衰を適用
4. WebGLで変形メッシュをレンダリング

### 座標系

- 原点：画像の中心
- X軸：右方向が正
- Y軸：下方向が正（WebGL描画時は反転）
- 画像サイズ：width × height（ピクセル単位）

---

## パラメータ仕様

### 基本パラメータ

#### 1. divisions（分割数）
- **型**: Integer
- **範囲**: 1 ～ 50
- **デフォルト**: 15
- **説明**: 縦方向のメッシュ分割数。大きいほど滑らかだが重くなる
- **推奨値**:
  - 軽量: 10
  - 標準: 15-20
  - 高品質: 25-30

#### 2. angle（揺れ角度）
- **型**: Float
- **範囲**: 0° ～ 360°
- **デフォルト**: 30°
- **説明**: 最大揺れ角度（振幅）
- **変換**: `F = Math.PI * angle / 180`（ラジアンに変換）

#### 3. period（揺れ周期）
- **型**: Float
- **範囲**: 0.01 ～ 10.0 秒
- **デフォルト**: 2.0 秒
- **説明**: 1サイクルの揺れにかかる時間
- **変換**: `c = 2π / period`（角周波数）

#### 4. phaseShift（揺れズレ）
- **型**: Float
- **範囲**: -360° ～ 360°
- **デフォルト**: 90°
- **説明**: 上下の分割点間の位相差
- **変換**: `d = 2 * phaseShift * π / 180`
- **効果**: 正の値で波打つ動き、0で一斉に揺れる

#### 5. center（センター角度）
- **型**: Float
- **範囲**: -180° ～ 180°
- **デフォルト**: 0°
- **説明**: 揺れの中心角度（左右への傾き）
- **変換**: `CNT = center * π / 180`

### 固定範囲パラメータ

#### 6. topFixed（上固定長）
- **型**: Float
- **範囲**: 0 ～ 100 %
- **デフォルト**: 10%
- **説明**: 画像上部の固定する割合
- **計算**: `dL = topFixed * 0.01 * height`

#### 7. bottomFixed（下固定長）
- **型**: Float
- **範囲**: 0 ～ 100 %
- **デフォルト**: 10%
- **説明**: 画像下部の固定する割合
- **計算**: `dL2 = bottomFixed * 0.01 * height`

#### 8. fromBottom（下から揺れる）
- **型**: Boolean
- **デフォルト**: false
- **説明**: trueの場合、上下の固定長を入れ替え
- **処理**: `if (fromBottom) { [dL, dL2] = [dL2, dL] }`

### ランダム揺れパラメータ

#### 9. randomSwing（ランダム揺れ）
- **型**: Boolean
- **デフォルト**: true
- **説明**: 揺れ角度をランダムに変動させる

#### 10. randomPattern（ランダムパターン）
- **型**: Integer
- **範囲**: 0 ～ 50
- **デフォルト**: 5
- **説明**: ランダムシードのバリエーション

#### 11. seed（シード値）
- **型**: Integer
- **範囲**: 1 ～ 99999
- **デフォルト**: 12345
- **説明**: 疑似乱数生成のシード値

### 軸モードパラメータ

#### 12. axisMode（軸モード有効化）
- **型**: Boolean
- **デフォルト**: false
- **説明**: 特定位置を軸として固定するモード

#### 13. axisPosition（軸位置）
- **型**: Float
- **範囲**: 0 ～ 100 %
- **デフォルト**: 50%
- **説明**: 軸の縦位置（0=上端、100=下端）

#### 14. axisStrength（揺れ強度）
- **型**: Float
- **範囲**: 0 ～ 100
- **デフォルト**: 0
- **説明**: 軸付近の揺れ強度（0=完全固定、100=通常揺れ）

#### 15. axisRange（影響範囲）
- **型**: Float
- **範囲**: 1 ～ 100 %
- **デフォルト**: 30%
- **説明**: 軸から何%の範囲まで減衰させるか

---

## 実装アルゴリズム

### ステップ1: パラメータの前処理

```javascript
// 分割数の正規化
let N = Math.floor(divisions);
if (N < 1) N = 1;
if (N > 50) N = 50;

// 横分割数（固定）
const M = 8;

// 角度をラジアンに変換
const F = Math.PI * angle / 180;
const c = 2 * Math.PI / period;
const d = 2 * phaseShift * Math.PI / 180;
const CNT = center * Math.PI / 180;

// 固定長の計算
let dL = topFixed * 0.01 * height;
let dL2 = bottomFixed * 0.01 * height;

// 下から揺れる場合は入れ替え
if (fromBottom) {
    [dL, dL2] = [dL2, dL];
}

// 固定長の範囲チェック
if (dL < 0) dL = 0;
if (dL > height) dL = height;
if (dL2 < 0) dL2 = 0;
if (dL2 > height - dL) dL2 = height - dL;

// 実際に揺れる長さ
const L = height - dL - dL2;
```

### ステップ2: ランダム揺れの計算

```javascript
let currentF = F;

if (randomSwing) {
    // 現在の周期数と小数部分
    const s = time / period;
    const n1 = Math.floor(s);
    const frac = s - n1;
    
    // 4点のランダム値を取得
    const f0 = getRandomValue(n1 - 1, seed, randomPattern) * F;
    const f1 = getRandomValue(n1, seed, randomPattern) * F;
    const f2 = getRandomValue(n1 + 1, seed, randomPattern) * F;
    const f3 = getRandomValue(n1 + 2, seed, randomPattern) * F;
    
    // キュービック補間で滑らかに変化
    currentF = cubicInterpolation(frac, f0, f1, f2, f3);
}

// ランダム値生成関数
function getRandomValue(n, baseSeed, pattern) {
    const seed = Math.abs(10 + pattern) + n;
    const x = Math.sin(seed * baseSeed) * 10000;
    return (x - Math.floor(x)); // 0-1の範囲
}

// キュービック補間
function cubicInterpolation(t, p0, p1, p2, p3) {
    const t2 = t * t;
    const t3 = t2 * t;
    
    const a0 = p3 - p2 - p0 + p1;
    const a1 = p0 - p1 - a0;
    const a2 = p2 - p0;
    const a3 = p1;
    
    return a0 * t3 + a1 * t2 + a2 * t + a3;
}
```

### ステップ3: 中心線の計算

```javascript
const centerX = [];
const centerY = [];
const h2 = height / 2;

// 初期点（画像上端）
centerX[0] = 0;
centerY[0] = -h2;

// 各分割点の座標を計算
for (let i = 1; i <= N; i++) {
    const ratio = i / N; // 0-1の範囲
    
    // 軸モードの減衰計算
    let axisMultiplier = 1.0;
    if (axisMode) {
        const axisPos = axisPosition / 100;
        
        // 軸より上の部分のみ処理
        if (ratio < axisPos) {
            const distanceFromAxis = axisPos - ratio;
            const range = axisRange / 100;
            
            if (distanceFromAxis < range) {
                const normalizedDist = distanceFromAxis / range;
                // スムーズな減衰カーブ
                const decayFactor = Math.pow(1 - normalizedDist, 2);
                // 揺れ強度を適用
                axisMultiplier = (axisStrength / 100) + 
                                 decayFactor * (1.0 - axisStrength / 100);
            }
        }
    }
    
    // 揺れ角度の計算
    // (1 - Math.pow(1 - ratio, 4)) で下部ほど大きく揺れる
    const Si = (currentF * Math.sin(c * time - i * d / N) + CNT) * 
               (1 - Math.pow(1 - ratio, 4)) * axisMultiplier;
    
    // X座標は前の点からの相対移動
    centerX[i] = centerX[i - 1] + Math.sin(Si) * (L / N);
    
    // Y座標は上端からの絶対位置
    centerY[i] = -h2 + (dL + L * ratio);
}
```

### ステップ4: 2Dメッシュグリッドの生成

```javascript
const gridX = [];
const gridY = [];

for (let i = 0; i <= N; i++) {
    gridX[i] = [];
    gridY[i] = [];
    
    for (let j = 0; j <= M; j++) {
        const xRatio = (j / M) - 0.5; // -0.5 to 0.5
        
        // 中心線から横方向に展開
        gridX[i][j] = centerX[i] + xRatio * width;
        gridY[i][j] = centerY[i];
    }
}
```

### ステップ5: バウンディングボックスの計算と中心調整

```javascript
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;

// バウンディングボックスを計算
for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= M; j++) {
        minX = Math.min(minX, gridX[i][j]);
        maxX = Math.max(maxX, gridX[i][j]);
        minY = Math.min(minY, gridY[i][j]);
        maxY = Math.max(maxY, gridY[i][j]);
    }
}

// バウンディングボックスの中心
const CX = (maxX + minX) * 0.5;
const CY = (maxY + minY) * 0.5;

// 中心を原点に調整
const worldPositions = [];
const texCoords = [];

for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= M; j++) {
        const xRatio = j / M;
        const yRatio = i / N;
        
        // 位置座標（中心が原点）
        worldPositions.push(
            gridX[i][j] - CX,
            gridY[i][j] - CY
        );
        
        // テクスチャ座標（0-1）
        texCoords.push(xRatio, yRatio);
    }
}
```

### ステップ6: インデックスバッファの生成

```javascript
const indices = [];

for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
        const topLeft = i * (M + 1) + j;
        const topRight = topLeft + 1;
        const bottomLeft = (i + 1) * (M + 1) + j;
        const bottomRight = bottomLeft + 1;
        
        // 三角形1
        indices.push(topLeft, bottomLeft, topRight);
        
        // 三角形2
        indices.push(topRight, bottomLeft, bottomRight);
    }
}
```

---

## WebGL実装

### 頂点シェーダー

```glsl
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
```

### フラグメントシェーダー

```glsl
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_image;

void main() {
    gl_FragColor = texture2D(u_image, v_texCoord);
}
```

### レンダリング処理

```javascript
// キャンバスサイズ設定（余白を追加）
const padding = 100;
const canvasWidth = (maxX - minX) + padding * 2;
const canvasHeight = (maxY - minY) + padding * 2;

canvas.width = canvasWidth;
canvas.height = canvasHeight;
gl.viewport(0, 0, canvasWidth, canvasHeight);

// クリアとブレンド設定
gl.clearColor(0, 0, 0, 0);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

// 位置データを正規化座標に変換
const normalizedPositions = [];
for (let i = 0; i < worldPositions.length; i += 2) {
    const x = worldPositions[i];
    const y = worldPositions[i + 1];
    
    // キャンバス中心を原点とした正規化座標
    normalizedPositions.push(
        (x / (canvasWidth / 2)),
        -(y / (canvasHeight / 2))  // Y軸反転
    );
}

// バッファ設定と描画
// ... (標準的なWebGLバッファ設定)

gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

// 結果をメインキャンバスに描画
mainCtx.drawImage(
    glCanvas, 
    -canvasWidth / 2, 
    -canvasHeight / 2, 
    canvasWidth, 
    canvasHeight
);
```

---

## プリセット定義

### gentle_breeze（優しい風）
```javascript
{
    divisions: 10,
    angle: 15,
    period: 3.0,
    phaseShift: 90,
    center: 0,
    topFixed: 10,
    bottomFixed: 10,
    fromBottom: false,
    randomSwing: false,
    randomPattern: 0,
    seed: 12345,
    axisMode: false,
    axisPosition: 50,
    axisStrength: 0,
    axisRange: 30
}
```

### moderate_wind（普通の風）
```javascript
{
    divisions: 15,
    angle: 30,
    period: 2.0,
    phaseShift: 90,
    center: 0,
    topFixed: 10,
    bottomFixed: 10,
    fromBottom: false,
    randomSwing: true,
    randomPattern: 5,
    seed: 12345,
    axisMode: false,
    axisPosition: 50,
    axisStrength: 0,
    axisRange: 30
}
```

### strong_wind（強い風）
```javascript
{
    divisions: 20,
    angle: 60,
    period: 1.5,
    phaseShift: 120,
    center: 15,
    topFixed: 15,
    bottomFixed: 5,
    fromBottom: false,
    randomSwing: true,
    randomPattern: 10,
    seed: 12345,
    axisMode: false,
    axisPosition: 50,
    axisStrength: 0,
    axisRange: 30
}
```

### flag（旗）
```javascript
{
    divisions: 25,
    angle: 45,
    period: 1.2,
    phaseShift: 180,
    center: 0,
    topFixed: 0,
    bottomFixed: 0,
    fromBottom: false,
    randomSwing: true,
    randomPattern: 15,
    seed: 12345,
    axisMode: false,
    axisPosition: 50,
    axisStrength: 0,
    axisRange: 30
}
```

### curtain（カーテン）
```javascript
{
    divisions: 30,
    angle: 25,
    period: 2.5,
    phaseShift: 90,
    center: 0,
    topFixed: 5,
    bottomFixed: 15,
    fromBottom: false,
    randomSwing: false,
    randomPattern: 0,
    seed: 12345,
    axisMode: false,
    axisPosition: 50,
    axisStrength: 0,
    axisRange: 30
}
```

### underwater（水中）
```javascript
{
    divisions: 20,
    angle: 20,
    period: 4.0,
    phaseShift: 60,
    center: 5,
    topFixed: 10,
    bottomFixed: 10,
    fromBottom: false,
    randomSwing: true,
    randomPattern: 8,
    seed: 12345,
    axisMode: false,
    axisPosition: 50,
    axisStrength: 0,
    axisRange: 30
}
```

---

## パフォーマンス最適化

### 推奨設定

| 用途 | divisions | M (横分割) | 総頂点数 |
|------|-----------|------------|----------|
| プレビュー | 10-15 | 8 | 99-144 |
| 標準品質 | 15-20 | 8 | 144-189 |
| 高品質 | 25-30 | 8 | 234-279 |

### メモリ管理

- WebGLバッファは毎フレーム削除（メモリリーク防止）
- テクスチャは使用後すぐに削除
- 一時キャンバスは再利用

### 処理の最適化

1. **メッシュ計算**: CPU側で事前計算
2. **WebGL描画**: GPU側で高速処理
3. **バウンディングボックス**: 必要最小限のキャンバスサイズ

---

## レイヤー合成

複数画像を重ねて使用する場合：

```javascript
// 各レイヤーを順番に描画
for (let layer of layers) {
    if (!layer.visible) continue;
    
    ctx.save();
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    
    if (layer.effectEnabled) {
        // 風揺れ適用
        applyWindShakeWebGL(ctx, layer.img, layer.width, layer.height, time);
    } else {
        // 通常描画
        ctx.drawImage(
            layer.img, 
            -layer.width / 2, 
            -layer.height / 2, 
            layer.width, 
            layer.height
        );
    }
    
    ctx.restore();
}
```

---

## 書き出し仕様

### 連番PNG出力

```javascript
const totalFrames = Math.ceil(duration * fps);

for (let frame = 0; frame < totalFrames; frame++) {
    const time = frame / fps;
    
    // フレームをレンダリング
    renderFrame(time);
    
    // PNGとして保存
    canvas.toBlob((blob) => {
        const filename = `frame_${String(frame).padStart(5, '0')}.png`;
        // ZIPに追加
    }, 'image/png');
}
```

### ファイル命名規則

- 単一画像: `frame_00000.png` ～ `frame_NNNNN.png`
- 複数レイヤー合成: `frame_00000.png` ～ `frame_NNNNN.png`

---

## トラブルシューティング

### 問題: 画像が下にずれる
**原因**: メッシュ生成時の座標系が合っていない
**解決**: centerY[0] = -height/2 で開始し、バウンディングボックス中心で調整

### 問題: 揺れが不自然
**原因**: 分割数が少ない、または位相差が不適切
**解決**: divisions を 15-20 に設定、phaseShift を 90-180 に調整

### 問題: パフォーマンスが悪い
**原因**: 分割数が多すぎる
**解決**: divisions を 15 以下に、または M を 4 に削減

### 問題: WebGLエラー
**原因**: コンテキスト取得失敗、またはリソース未解放
**解決**: WebGL対応確認、バッファ/テクスチャの明示的な削除

---

## ライセンス

このアルゴリズムは Starlit Timeline Editor で使用されているものです。
他のプロジェクトでの使用は自由ですが、できれば出典を明記してください。

---

## 変更履歴

- **v1.0** (2024): 初版リリース
- **v2.0** (2024): レイヤーシステム追加
- **v3.0** (2024): 軸モード機能追加

---

## 参考実装

完全な実装例は以下で確認できます：
- GitHub: [WindSway Editor](https://github.com/your-repo)
- オンラインデモ: [Demo Page](https://your-demo-url)

---

## お問い合わせ

実装に関する質問や改善提案は、GitHubのIssuesまでお願いします。
