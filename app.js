// 風揺れエフェクト エディター
class WindSwayEditor {
    constructor() {
        // キャンバス
        this.canvas = document.getElementById('previewCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 画像データ
        this.images = [];
        this.selectedImageIndex = 0;
        this.draggedIndex = null;
        this.dragOverIndex = null;
        
        // アニメーション設定
        this.fps = 30;
        this.duration = 5; // 秒
        this.currentTime = 0;
        this.isPlaying = false;
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        
        // ズーム設定
        this.zoom = 1.0;
        
        // 風揺れ設定
        this.windShake = {
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
            pins: [] // 複数ピンの配列
        };
        
        // ピンモード用の状態
        this.pinMode = false;
        this.pinRange = 20; // デフォルトの影響範囲
        this.pinElements = []; // DOM要素の配列
        
        // WebGL関連
        this.windShakeCanvas = null;
        this.windShakeGL = null;
        this.windShakeProgram = null;
        this.windShakeProgramInfo = null;
        
        // 書き出し設定
        this.exportSettings = {
            resolution: '1920x1080',
            customWidth: 1920,
            customHeight: 1080
        };
        
        // 書き出し制御
        this.isExporting = false;
        this.exportCancelled = false;
        
        this.initializeEventListeners();
        this.initializeCanvas();
        this.updatePreview();
    }
    
    initializeEventListeners() {
        // 画像読み込み
        document.getElementById('loadImagesBtn').addEventListener('click', () => {
            document.getElementById('imageInput').click();
        });
        
        document.getElementById('imageInput').addEventListener('change', (e) => {
            this.loadImages(e.target.files);
        });
        
        // 再生コントロール
        document.getElementById('playBtn').addEventListener('click', () => this.play());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        
        // タイムラインスライダー
        document.getElementById('timelineSlider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.currentTime = (value / 100) * this.duration;
            this.updatePreview();
            this.updateTimeDisplay();
        });
        
        // ズームコントロール
        document.getElementById('zoomFitBtn').addEventListener('click', () => this.zoomFit());
        document.getElementById('zoom100Btn').addEventListener('click', () => this.setZoom(1.0));
        document.getElementById('zoomSlider').addEventListener('input', (e) => {
            this.setZoom(parseFloat(e.target.value) / 100);
        });
        
        // FPS設定
        document.getElementById('fpsSelect').addEventListener('change', (e) => {
            this.fps = parseInt(e.target.value);
        });
        
        // 再生時間設定
        document.getElementById('durationInput').addEventListener('input', (e) => {
            this.duration = parseFloat(e.target.value);
            this.updateTimeDisplay();
        });
        
        // プリセット選択
        document.getElementById('presetSelect').addEventListener('change', (e) => {
            this.applyPreset(e.target.value);
        });
        
        // 風揺れパラメータスライダー
        this.setupSlider('divisions', (value) => {
            this.windShake.divisions = parseInt(value);
            this.updatePreview();
        });
        
        this.setupSlider('angle', (value) => {
            this.windShake.angle = parseFloat(value);
            this.updatePreview();
        });
        
        this.setupSlider('period', (value) => {
            this.windShake.period = parseFloat(value);
            this.updatePreview();
        });
        
        this.setupSlider('phaseShift', (value) => {
            this.windShake.phaseShift = parseFloat(value);
            this.updatePreview();
        });
        
        this.setupSlider('center', (value) => {
            this.windShake.center = parseFloat(value);
            this.updatePreview();
        });
        
        this.setupSlider('topFixed', (value) => {
            this.windShake.topFixed = parseFloat(value);
            this.updatePreview();
        });
        
        this.setupSlider('bottomFixed', (value) => {
            this.windShake.bottomFixed = parseFloat(value);
            this.updatePreview();
        });
        
        this.setupSlider('randomPattern', (value) => {
            this.windShake.randomPattern = parseInt(value);
            this.updatePreview();
        });
        
        this.setupSlider('seed', (value) => {
            this.windShake.seed = parseInt(value);
            this.updatePreview();
        });
        
        // ピンモード
        document.getElementById('pinModeCheck').addEventListener('change', (e) => {
            const enabled = e.target.checked;
            const controls = document.getElementById('pinModeControls');
            controls.style.display = enabled ? 'block' : 'none';
            
            if (!enabled) {
                this.pinMode = false;
                this.windShake.pins = [];
                this.removeAllPins();
                document.getElementById('addPinBtn').classList.remove('active');
            }
            
            this.updatePreview();
        });
        
        document.getElementById('addPinBtn').addEventListener('click', () => {
            this.pinMode = !this.pinMode;
            const btn = document.getElementById('addPinBtn');
            
            if (this.pinMode) {
                btn.classList.add('active');
                btn.textContent = '➕ 画像をクリックしてピンを追加中...';
                this.canvas.style.cursor = 'crosshair';
            } else {
                btn.classList.remove('active');
                btn.textContent = '➕ 画像をクリックしてピンを追加';
                this.canvas.style.cursor = 'default';
            }
        });
        
        document.getElementById('pinRangeSlider').addEventListener('input', (e) => {
            this.pinRange = parseFloat(e.target.value);
            document.getElementById('pinRangeValue').textContent = e.target.value;
            
            // すべてのピンの範囲を更新
            for (const pin of this.windShake.pins) {
                pin.range = this.pinRange;
            }
            
            this.updatePinList();
            this.updatePreview();
        });
        
        // キャンバスクリックでピンを配置
        this.canvas.addEventListener('click', (e) => {
            if (this.pinMode && this.images.length > 0) {
                this.addPin(e);
            }
        });
        
        // チェックボックス
        document.getElementById('fromBottomCheck').addEventListener('change', (e) => {
            this.windShake.fromBottom = e.target.checked;
            this.updatePreview();
        });
        
        document.getElementById('randomSwingCheck').addEventListener('change', (e) => {
            this.windShake.randomSwing = e.target.checked;
            this.updatePreview();
        });
        
        // 解像度設定
        document.getElementById('resolutionSelect').addEventListener('change', (e) => {
            this.exportSettings.resolution = e.target.value;
            const customRow = document.getElementById('customResolutionRow');
            if (e.target.value === 'custom') {
                customRow.style.display = 'block';
            } else {
                customRow.style.display = 'none';
            }
        });
        
        document.getElementById('customWidthInput').addEventListener('input', (e) => {
            this.exportSettings.customWidth = parseInt(e.target.value);
        });
        
        document.getElementById('customHeightInput').addEventListener('input', (e) => {
            this.exportSettings.customHeight = parseInt(e.target.value);
        });
        
        // 書き出し
        document.getElementById('exportBtn').addEventListener('click', () => this.exportSequence());
        document.getElementById('cancelExportBtn').addEventListener('click', () => this.cancelExport());
    }
    
    setupSlider(name, callback) {
        const slider = document.getElementById(`${name}Slider`);
        const valueDisplay = document.getElementById(`${name}Value`);
        
        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.textContent = value;
            callback(value);
            // プリセットをカスタムに変更
            document.getElementById('presetSelect').value = 'custom';
        });
    }
    
    initializeCanvas() {
        // キャンバスサイズを初期化
        this.canvas.width = 1920;
        this.canvas.height = 1080;
    }
    
    async loadImages(files) {
        const newImages = [];
        
        for (const file of files) {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            await new Promise((resolve) => {
                img.onload = () => {
                    newImages.push({
                        img: img,
                        name: file.name,
                        width: img.width,
                        height: img.height,
                        url: url,
                        effectEnabled: false, // デフォルトはエフェクトOFF
                        visible: true
                    });
                    resolve();
                };
                img.src = url;
            });
        }
        
        this.images = this.images.concat(newImages);
        this.updateImageList();
        
        if (this.images.length > 0) {
            this.selectedImageIndex = 0;
            this.zoomFit();
        }
        
        this.updatePreview();
    }
    
    updateImageList() {
        const imageList = document.getElementById('imageList');
        
        if (this.images.length === 0) {
            imageList.innerHTML = '<p class="empty-message">画像が読み込まれていません</p>';
            return;
        }
        
        imageList.innerHTML = '';
        
        // 逆順で表示（下のレイヤーが手前）
        for (let i = this.images.length - 1; i >= 0; i--) {
            const imageData = this.images[i];
            const item = document.createElement('div');
            item.className = 'image-item';
            item.dataset.index = i;
            item.draggable = true;
            
            if (i === this.selectedImageIndex) {
                item.classList.add('selected');
            }
            
            item.innerHTML = `
                <div class="drag-handle">⋮⋮</div>
                <img src="${imageData.url}" class="image-thumbnail" alt="${imageData.name}">
                <div class="image-info">
                    <div class="image-name">${imageData.name}</div>
                    <div class="image-size">${imageData.width} × ${imageData.height}</div>
                </div>
                <div class="image-controls">
                    <div class="effect-toggle">
                        <input type="checkbox" class="effect-checkbox" data-index="${i}" ${imageData.effectEnabled ? 'checked' : ''}>
                        <label>🍃 エフェクト</label>
                    </div>
                    <button class="visibility-toggle ${imageData.visible ? '' : 'hidden'}" data-index="${i}">
                        ${imageData.visible ? '👁️' : '🚫'}
                    </button>
                </div>
                <button class="remove-image-btn" data-index="${i}">×</button>
            `;
            
            // ドラッグイベント
            item.addEventListener('dragstart', (e) => {
                this.draggedIndex = i;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
                this.draggedIndex = null;
                this.clearDragOverStyles();
            });
            
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                if (this.draggedIndex !== null && this.draggedIndex !== i) {
                    this.clearDragOverStyles();
                    item.classList.add('drag-over');
                    this.dragOverIndex = i;
                }
            });
            
            item.addEventListener('dragleave', (e) => {
                item.classList.remove('drag-over');
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                
                if (this.draggedIndex !== null && this.draggedIndex !== i) {
                    // 配列内で要素を移動
                    const draggedItem = this.images[this.draggedIndex];
                    this.images.splice(this.draggedIndex, 1);
                    
                    // ドロップ位置を調整
                    let newIndex = i;
                    if (this.draggedIndex < i) {
                        newIndex--;
                    }
                    
                    this.images.splice(newIndex, 0, draggedItem);
                    
                    // 選択インデックスを更新
                    if (this.selectedImageIndex === this.draggedIndex) {
                        this.selectedImageIndex = newIndex;
                    } else if (this.selectedImageIndex > this.draggedIndex && this.selectedImageIndex <= newIndex) {
                        this.selectedImageIndex--;
                    } else if (this.selectedImageIndex < this.draggedIndex && this.selectedImageIndex >= newIndex) {
                        this.selectedImageIndex++;
                    }
                    
                    this.updateImageList();
                    this.updatePreview();
                }
                
                this.clearDragOverStyles();
            });
            
            // クリックでレイヤー選択
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('remove-image-btn') &&
                    !e.target.classList.contains('visibility-toggle') &&
                    !e.target.classList.contains('effect-checkbox')) {
                    this.selectedImageIndex = i;
                    this.updateImageList();
                    this.updatePreview();
                }
            });
            
            // エフェクトチェックボックス
            const effectCheckbox = item.querySelector('.effect-checkbox');
            effectCheckbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.images[i].effectEnabled = e.target.checked;
                this.updatePreview();
            });
            
            // 表示/非表示トグル
            const visibilityBtn = item.querySelector('.visibility-toggle');
            visibilityBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.images[i].visible = !this.images[i].visible;
                this.updateImageList();
                this.updatePreview();
            });
            
            // 削除ボタン
            const removeBtn = item.querySelector('.remove-image-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeImage(i);
            });
            
            imageList.appendChild(item);
        }
    }
    
    clearDragOverStyles() {
        const items = document.querySelectorAll('.image-item');
        items.forEach(item => item.classList.remove('drag-over'));
    }
    
    removeImage(index) {
        URL.revokeObjectURL(this.images[index].url);
        this.images.splice(index, 1);
        
        if (this.selectedImageIndex >= this.images.length) {
            this.selectedImageIndex = Math.max(0, this.images.length - 1);
        }
        
        this.updateImageList();
        this.updatePreview();
    }
    
    play() {
        if (this.isPlaying) return;
        if (this.images.length === 0) return;
        
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        this.animate();
    }
    
    pause() {
        this.isPlaying = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    stop() {
        this.pause();
        this.currentTime = 0;
        this.updatePreview();
        this.updateTimeDisplay();
        this.updateTimelineSlider();
    }
    
    animate() {
        if (!this.isPlaying) return;
        
        const now = performance.now();
        const deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        
        this.currentTime += deltaTime;
        
        if (this.currentTime >= this.duration) {
            this.currentTime = 0; // ループ
        }
        
        this.updatePreview();
        this.updateTimeDisplay();
        this.updateTimelineSlider();
        
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
    
    updateTimeDisplay() {
        const timeDisplay = document.getElementById('timeDisplay');
        timeDisplay.textContent = `${this.currentTime.toFixed(2)}s / ${this.duration.toFixed(2)}s`;
    }
    
    updateTimelineSlider() {
        const slider = document.getElementById('timelineSlider');
        const value = (this.currentTime / this.duration) * 100;
        slider.value = value;
    }
    
    setZoom(zoom) {
        this.zoom = zoom;
        document.getElementById('zoomSlider').value = zoom * 100;
        document.getElementById('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
        this.updateCanvasTransform();
    }
    
    zoomFit() {
        if (this.images.length === 0) return;
        
        const container = document.getElementById('canvasContainer');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // 最大画像サイズを計算
        let maxWidth = 0;
        let maxHeight = 0;
        for (const imageData of this.images) {
            if (imageData.visible) {
                maxWidth = Math.max(maxWidth, imageData.width);
                maxHeight = Math.max(maxHeight, imageData.height);
            }
        }
        
        if (maxWidth === 0 || maxHeight === 0) return;
        
        const scaleX = containerWidth / maxWidth;
        const scaleY = containerHeight / maxHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9; // 90%にフィット
        
        this.setZoom(scale);
    }
    
    updateCanvasTransform() {
        this.canvas.style.transform = `scale(${this.zoom})`;
    }
    
    addPin(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // Y座標からピン位置を計算（0-100%）
        const position = (y / this.canvas.height) * 100;
        
        // ピンを追加
        const pin = {
            id: Date.now(),
            position: Math.max(0, Math.min(100, position)),
            range: this.pinRange,
            x: x,
            y: y
        };
        
        this.windShake.pins.push(pin);
        
        // 視覚的にピンを表示
        this.showPin(pin);
        
        // ピンリストを更新
        this.updatePinList();
        
        // プレビュー更新
        this.updatePreview();
    }
    
    showPin(pin) {
        const container = document.getElementById('canvasContainer');
        const pinElement = document.createElement('div');
        pinElement.className = 'axis-pin';
        pinElement.innerHTML = '📍';
        pinElement.style.fontSize = '30px';
        pinElement.dataset.pinId = pin.id;
        
        // キャンバスの位置とズームを考慮して配置
        const rect = this.canvas.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        const canvasX = rect.left - containerRect.left;
        const canvasY = rect.top - containerRect.top;
        
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;
        
        pinElement.style.left = (canvasX + pin.x * scaleX) + 'px';
        pinElement.style.top = (canvasY + pin.y * scaleY) + 'px';
        
        container.appendChild(pinElement);
        this.pinElements.push(pinElement);
    }
    
    removePin(pinId) {
        // データから削除
        const index = this.windShake.pins.findIndex(p => p.id === pinId);
        if (index !== -1) {
            this.windShake.pins.splice(index, 1);
        }
        
        // DOM要素を削除
        const pinElement = this.pinElements.find(el => el.dataset.pinId == pinId);
        if (pinElement) {
            pinElement.remove();
            this.pinElements = this.pinElements.filter(el => el !== pinElement);
        }
        
        this.updatePinList();
        this.updatePreview();
    }
    
    removeAllPins() {
        // すべてのDOMから要素削除
        for (const pinElement of this.pinElements) {
            pinElement.remove();
        }
        this.pinElements = [];
        this.updatePinList();
    }
    
    updatePinList() {
        const pinList = document.getElementById('pinList');
        
        if (this.windShake.pins.length === 0) {
            pinList.innerHTML = '<p style="text-align: center; color: var(--biscuit); padding: 10px; font-size: 12px;">ピンが配置されていません</p>';
            return;
        }
        
        pinList.innerHTML = '';
        
        for (const pin of this.windShake.pins) {
            const item = document.createElement('div');
            item.className = 'pin-item';
            
            item.innerHTML = `
                <div class="pin-info">
                    📍 位置: ${Math.round(pin.position)}% / 範囲: ${pin.range}%
                </div>
                <button class="remove-pin-btn" data-pin-id="${pin.id}">×</button>
            `;
            
            const removeBtn = item.querySelector('.remove-pin-btn');
            removeBtn.addEventListener('click', () => {
                this.removePin(pin.id);
            });
            
            pinList.appendChild(item);
        }
    }
    
    updatePreview() {
        if (this.images.length === 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        // 最大サイズを計算
        let maxWidth = 0;
        let maxHeight = 0;
        for (const imageData of this.images) {
            if (imageData.visible) {
                maxWidth = Math.max(maxWidth, imageData.width);
                maxHeight = Math.max(maxHeight, imageData.height);
            }
        }
        
        if (maxWidth === 0 || maxHeight === 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        // キャンバスサイズを最大画像サイズに合わせる
        this.canvas.width = maxWidth;
        this.canvas.height = maxHeight;
        
        // 背景をクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // レイヤーを順番に描画（配列の順番通り、最初の要素が奥、最後の要素が手前）
        for (let i = 0; i < this.images.length; i++) {
            const imageData = this.images[i];
            
            if (!imageData.visible) continue;
            
            const img = imageData.img;
            
            this.ctx.save();
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            
            // エフェクトが有効な場合は風揺れを適用、無効な場合は通常描画
            if (imageData.effectEnabled) {
                this.applyWindShakeWebGL(this.ctx, img, imageData.width, imageData.height, this.currentTime);
            } else {
                // 中央に配置して通常描画
                this.ctx.drawImage(img, -imageData.width / 2, -imageData.height / 2, imageData.width, imageData.height);
            }
            
            this.ctx.restore();
        }
    }
    
    // WebGLで風揺れエフェクトを適用
    applyWindShakeWebGL(ctx, img, width, height, localTime) {
        // 一時キャンバスでWebGL処理
        if (!this.windShakeCanvas) {
            this.windShakeCanvas = document.createElement('canvas');
            this.windShakeGL = this.windShakeCanvas.getContext('webgl', { 
                premultipliedAlpha: false,
                alpha: true 
            });
            this.initWindShakeWebGL();
        }
        
        const gl = this.windShakeGL;
        const canvas = this.windShakeCanvas;
        
        const ws = this.windShake;
        
        // メッシュを生成してバウンディングボックスを取得
        const meshData = this.createWindShakeMeshWithBounds(ws, width, height, localTime);
        
        // バウンディングボックスのサイズを計算（余裕を持たせる）
        const padding = 100;
        const canvasWidth = meshData.bounds.width + padding * 2;
        const canvasHeight = meshData.bounds.height + padding * 2;
        
        // キャンバスサイズを設定
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        gl.viewport(0, 0, canvasWidth, canvasHeight);
        
        // WebGLで描画
        this.renderWindShakeWebGL(gl, img, meshData.mesh, canvasWidth, canvasHeight);
        
        // 結果をメインキャンバスに描画（元の画像中心に配置）
        ctx.drawImage(canvas, -canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
    }
    
    // WebGL初期化
    initWindShakeWebGL() {
        const gl = this.windShakeGL;
        
        // 頂点シェーダー
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;
        
        // フラグメントシェーダー
        const fragmentShaderSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            
            void main() {
                gl_FragColor = texture2D(u_image, v_texCoord);
            }
        `;
        
        // シェーダーをコンパイル
        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        // プログラムを作成
        this.windShakeProgram = this.createProgram(gl, vertexShader, fragmentShader);
        
        // アトリビュート・ユニフォームの位置を取得
        this.windShakeProgramInfo = {
            attribLocations: {
                position: gl.getAttribLocation(this.windShakeProgram, 'a_position'),
                texCoord: gl.getAttribLocation(this.windShakeProgram, 'a_texCoord'),
            },
            uniformLocations: {
                image: gl.getUniformLocation(this.windShakeProgram, 'u_image'),
            },
        };
    }
    
    // シェーダー作成
    createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    // プログラム作成
    createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        
        return program;
    }
    
    // 風揺れメッシュを作成（バウンディングボックス付き）
    createWindShakeMeshWithBounds(ws, width, height, t) {
        let N = Math.floor(ws.divisions);
        if (N < 1) N = 1;
        if (N > 50) N = 50;
        
        const M = 8; // 横分割数
        
        const F = Math.PI * ws.angle / 180;
        const dt = ws.period;
        const c = 2 * Math.PI / dt;
        const d = 2 * ws.phaseShift * Math.PI / 180;
        const CNT = ws.center * Math.PI / 180;
        
        let dL = ws.topFixed * 0.01 * height;
        let dL2 = ws.bottomFixed * 0.01 * height;
        
        if (ws.fromBottom) {
            [dL, dL2] = [dL2, dL];
        }
        
        if (dL < 0) dL = 0;
        if (dL > height) dL = height;
        if (dL2 < 0) dL2 = 0;
        if (dL2 > height - dL) dL2 = height - dL;
        
        const L = height - dL - dL2;
        
        // ランダム揺れ
        let currentF = F;
        if (ws.randomSwing) {
            const s = t / ws.period;
            const n1 = Math.floor(s);
            const frac = s - n1;
            
            const f0 = this.getRandomValue(n1 - 1, ws.seed, ws.randomPattern) * F;
            const f1 = this.getRandomValue(n1, ws.seed, ws.randomPattern) * F;
            const f2 = this.getRandomValue(n1 + 1, ws.seed, ws.randomPattern) * F;
            const f3 = this.getRandomValue(n1 + 2, ws.seed, ws.randomPattern) * F;
            
            currentF = this.cubicInterpolation(frac, f0, f1, f2, f3);
        }
        
        // 中心線を計算
        const centerX = [];
        const centerY = [];
        
        centerX[0] = 0;
        centerY[0] = 0;
        
        for (let i = 1; i <= N; i++) {
            const ratio = i / N;
            
            // 複数ピンによる固定処理
            let pinMultiplier = 1.0;
            if (ws.pins && ws.pins.length > 0) {
                // 各ピンからの影響を計算
                let minMultiplier = 1.0;
                
                for (const pin of ws.pins) {
                    const pinPos = pin.position / 100; // 0-1に正規化
                    const distance = Math.abs(ratio - pinPos);
                    const range = pin.range / 100;
                    
                    if (distance < range) {
                        const normalizedDist = distance / range;
                        // ピン位置で完全に0、範囲外で1
                        const multiplier = Math.pow(normalizedDist, 2);
                        minMultiplier = Math.min(minMultiplier, multiplier);
                    }
                }
                
                pinMultiplier = minMultiplier;
            }
            
            const Si = (currentF * Math.sin(c * t - i * d / N) + CNT) * (1 - Math.pow(1 - ratio, 4)) * pinMultiplier;
            
            centerX[i] = centerX[i - 1] + Math.sin(Si) * (L / N);
            centerY[i] = dL + L * ratio;
        }
        
        // 2Dメッシュグリッド生成（元のソフトと同じ）
        const worldPositions = [];
        const texCoords = [];
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= M; j++) {
                const xRatio = j / M;
                const yRatio = i / N;
                
                // ワールド座標（元のソフトと完全に同じ）
                const x = centerX[i] + (xRatio - 0.5) * width;
                const y = centerY[i];
                
                // バウンディングボックス更新
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                
                worldPositions.push(x, y);
                texCoords.push(xRatio, yRatio);
            }
        }
        
        // インデックス生成
        const indices = [];
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < M; j++) {
                const topLeft = i * (M + 1) + j;
                const topRight = topLeft + 1;
                const bottomLeft = (i + 1) * (M + 1) + j;
                const bottomRight = bottomLeft + 1;
                
                indices.push(topLeft, bottomLeft, topRight);
                indices.push(topRight, bottomLeft, bottomRight);
            }
        }
        
        return {
            mesh: {
                positions: worldPositions,
                texCoords: texCoords,
                indices: indices
            },
            bounds: {
                minX: minX,
                maxX: maxX,
                minY: minY,
                maxY: maxY,
                width: maxX - minX,
                height: maxY - minY,
                centerX: (maxX + minX) / 2,
                centerY: (maxY + minY) / 2
            }
        };
    }
    
    // WebGLレンダリング
    renderWindShakeWebGL(gl, img, mesh, canvasWidth, canvasHeight) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        gl.useProgram(this.windShakeProgram);
        
        // ワールド座標をWebGL座標に変換（元のソフトと同じ）
        const glPositions = [];
        
        for (let i = 0; i < mesh.positions.length; i += 2) {
            const x = mesh.positions[i];
            const y = mesh.positions[i + 1];
            
            // キャンバス中心を原点として、WebGL座標系に変換
            const glX = (x / canvasWidth) * 2;
            const glY = -(y / canvasHeight) * 2 + 1;
            
            glPositions.push(glX, glY);
        }
        
        // 位置バッファ
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(glPositions), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.windShakeProgramInfo.attribLocations.position);
        gl.vertexAttribPointer(this.windShakeProgramInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
        
        // テクスチャ座標バッファ
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.texCoords), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.windShakeProgramInfo.attribLocations.texCoord);
        gl.vertexAttribPointer(this.windShakeProgramInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
        
        // インデックスバッファ
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW);
        
        // テクスチャ設定
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(this.windShakeProgramInfo.uniformLocations.image, 0);
        
        // 描画
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
        
        // クリーンアップ
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(texCoordBuffer);
        gl.deleteBuffer(indexBuffer);
        gl.deleteTexture(texture);
    }
    
    // ランダム値の生成
    getRandomValue(n, baseSeed, pattern) {
        const seed = Math.abs(10 + pattern) + n;
        const x = Math.sin(seed * baseSeed) * 10000;
        return (x - Math.floor(x));
    }
    
    // キュービック補間
    cubicInterpolation(t, p0, p1, p2, p3) {
        const t2 = t * t;
        const t3 = t2 * t;
        
        const a0 = p3 - p2 - p0 + p1;
        const a1 = p0 - p1 - a0;
        const a2 = p2 - p0;
        const a3 = p1;
        
        return a0 * t3 + a1 * t2 + a2 * t + a3;
    }
    
    // プリセット適用
    applyPreset(presetName) {
        if (presetName === 'custom') return;
        
        const presets = {
            gentle_breeze: {
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
                pins: []
            },
            moderate_wind: {
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
                pins: []
            },
            strong_wind: {
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
                pins: []
            },
            flag: {
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
                pins: []
            },
            curtain: {
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
                pins: []
            },
            underwater: {
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
                pins: []
            }
        };
        
        const preset = presets[presetName];
        if (!preset) return;
        
        // プリセット値を適用
        this.windShake = { ...preset };
        
        // UIを更新
        document.getElementById('divisionsSlider').value = preset.divisions;
        document.getElementById('divisionsValue').textContent = preset.divisions;
        
        document.getElementById('angleSlider').value = preset.angle;
        document.getElementById('angleValue').textContent = preset.angle;
        
        document.getElementById('periodSlider').value = preset.period;
        document.getElementById('periodValue').textContent = preset.period;
        
        document.getElementById('phaseShiftSlider').value = preset.phaseShift;
        document.getElementById('phaseShiftValue').textContent = preset.phaseShift;
        
        document.getElementById('centerSlider').value = preset.center;
        document.getElementById('centerValue').textContent = preset.center;
        
        document.getElementById('topFixedSlider').value = preset.topFixed;
        document.getElementById('topFixedValue').textContent = preset.topFixed;
        
        document.getElementById('bottomFixedSlider').value = preset.bottomFixed;
        document.getElementById('bottomFixedValue').textContent = preset.bottomFixed;
        
        document.getElementById('fromBottomCheck').checked = preset.fromBottom;
        document.getElementById('randomSwingCheck').checked = preset.randomSwing;
        
        document.getElementById('randomPatternSlider').value = preset.randomPattern;
        document.getElementById('randomPatternValue').textContent = preset.randomPattern;
        
        document.getElementById('seedSlider').value = preset.seed;
        document.getElementById('seedValue').textContent = preset.seed;
        
        // ピンをクリア
        this.windShake.pins = [];
        this.removeAllPins();
        document.getElementById('pinModeCheck').checked = false;
        document.getElementById('pinModeControls').style.display = 'none';
        
        this.updatePreview();
    }
    
    // 書き出し設定の解像度を取得
    getExportResolution() {
        const resolution = this.exportSettings.resolution;
        
        if (resolution === 'original') {
            // 最大画像サイズを使用
            let maxWidth = 0;
            let maxHeight = 0;
            for (const imageData of this.images) {
                maxWidth = Math.max(maxWidth, imageData.width);
                maxHeight = Math.max(maxHeight, imageData.height);
            }
            return { width: maxWidth, height: maxHeight };
        } else if (resolution === '1920x1080') {
            return { width: 1920, height: 1080 };
        } else if (resolution === '1280x720') {
            return { width: 1280, height: 720 };
        } else if (resolution === 'custom') {
            return {
                width: this.exportSettings.customWidth,
                height: this.exportSettings.customHeight
            };
        }
        
        return { width: 1920, height: 1080 };
    }
    
    // 連番PNG書き出し
    async exportSequence() {
        if (this.images.length === 0) {
            alert('画像が読み込まれていません。');
            return;
        }
        
        if (this.isExporting) return;
        
        this.isExporting = true;
        this.exportCancelled = false;
        
        // プログレスモーダルを表示
        document.getElementById('exportProgressModal').style.display = 'flex';
        
        const totalFrames = Math.ceil(this.duration * this.fps);
        const resolution = this.getExportResolution();
        
        // 書き出し用キャンバスを作成
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = resolution.width;
        exportCanvas.height = resolution.height;
        const exportCtx = exportCanvas.getContext('2d');
        
        const zip = new JSZip();
        const imageFolder = zip.folder('wind_sway_sequence');
        
        for (let frame = 0; frame < totalFrames; frame++) {
            if (this.exportCancelled) {
                break;
            }
            
            const time = (frame / this.fps);
            
            // キャンバスをクリア
            exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
            
            // 最大画像サイズを計算
            let maxWidth = 0;
            let maxHeight = 0;
            for (const imageData of this.images) {
                if (imageData.visible) {
                    maxWidth = Math.max(maxWidth, imageData.width);
                    maxHeight = Math.max(maxHeight, imageData.height);
                }
            }
            
            if (maxWidth === 0 || maxHeight === 0) continue;
            
            const scale = Math.min(
                resolution.width / maxWidth,
                resolution.height / maxHeight
            );
            
            // 全レイヤーを順番に描画
            for (let i = 0; i < this.images.length; i++) {
                const imageData = this.images[i];
                
                if (!imageData.visible) continue;
                
                const img = imageData.img;
                
                exportCtx.save();
                exportCtx.translate(resolution.width / 2, resolution.height / 2);
                
                if (imageData.effectEnabled) {
                    // 風揺れエフェクトを適用（スケールを考慮）
                    exportCtx.scale(scale, scale);
                    this.applyWindShakeWebGL(exportCtx, img, imageData.width, imageData.height, time);
                } else {
                    // 通常描画
                    const scaledWidth = imageData.width * scale;
                    const scaledHeight = imageData.height * scale;
                    exportCtx.drawImage(img, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
                }
                
                exportCtx.restore();
            }
            
            // PNGとして保存
            const blob = await new Promise((resolve) => {
                exportCanvas.toBlob(resolve, 'image/png');
            });
            
            const frameNumber = String(frame).padStart(5, '0');
            const filename = `frame_${frameNumber}.png`;
            
            imageFolder.file(filename, blob);
            
            // プログレス更新
            const progress = ((frame + 1) / totalFrames) * 100;
            document.getElementById('exportProgressBar').style.width = `${progress}%`;
            document.getElementById('exportProgressText').textContent = `${frame + 1} / ${totalFrames} フレーム`;
            
            // UIの更新を待つ
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        if (!this.exportCancelled) {
            // ZIPファイルを生成してダウンロード
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'wind_sway_sequence.zip';
            a.click();
            URL.revokeObjectURL(url);
        }
        
        // モーダルを閉じる
        document.getElementById('exportProgressModal').style.display = 'none';
        this.isExporting = false;
    }
    
    cancelExport() {
        this.exportCancelled = true;
    }
}

// アプリケーションを初期化
const app = new WindSwayEditor();
