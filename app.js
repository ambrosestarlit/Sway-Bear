// 風揺れエフェクト エディター
class WindSwayEditor {
    constructor() {
        // キャンバス
        this.canvas = document.getElementById('previewCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 画像データ（フォルダ対応）
        this.layers = []; // { type: 'image'|'folder', ... }
        this.selectedLayerIndices = []; // 複数選択
        this.selectedChildLayer = null; // フォルダー内の選択されたレイヤー
        this.draggedIndex = null;
        this.dragOverIndex = null;
        this.nextLayerId = 0;
        
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
            seed: 12345
            // pins はレイヤー/フォルダごとに管理
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
        
        // フォルダにまとめる
        document.getElementById('createFolderBtn').addEventListener('click', () => {
            this.createFolderFromSelection();
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
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('angle', (value) => {
            this.windShake.angle = parseFloat(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('period', (value) => {
            this.windShake.period = parseFloat(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('phaseShift', (value) => {
            this.windShake.phaseShift = parseFloat(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('center', (value) => {
            this.windShake.center = parseFloat(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('topFixed', (value) => {
            this.windShake.topFixed = parseFloat(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('bottomFixed', (value) => {
            this.windShake.bottomFixed = parseFloat(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('randomPattern', (value) => {
            this.windShake.randomPattern = parseInt(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        this.setupSlider('seed', (value) => {
            this.windShake.seed = parseInt(value);
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        // ピンモード
        document.getElementById('pinModeCheck').addEventListener('change', (e) => {
            const enabled = e.target.checked;
            const controls = document.getElementById('pinModeControls');
            controls.style.display = enabled ? 'block' : 'none';
            
            if (!enabled) {
                this.pinMode = false;
                // ピンデータは保持する（削除しない）
                this.removeAllPinElements(); // DOM要素だけを削除
                document.getElementById('addPinBtn').classList.remove('active');
            } else {
                // ピンモード有効化時に現在のレイヤーのピンを表示
                this.showCurrentLayerPins();
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
            if (this.pinMode && this.layers.length > 0) {
                this.addPin(e);
            }
        });
        
        // チェックボックス
        document.getElementById('fromBottomCheck').addEventListener('change', (e) => {
            this.windShake.fromBottom = e.target.checked;
            this.saveCurrentLayerParameters();
            this.updatePreview();
        });
        
        document.getElementById('randomSwingCheck').addEventListener('change', (e) => {
            this.windShake.randomSwing = e.target.checked;
            this.saveCurrentLayerParameters();
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
        const newLayers = [];
        
        for (const file of files) {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            await new Promise((resolve) => {
                img.onload = () => {
                    newLayers.push({
                        type: 'image',
                        id: this.nextLayerId++,
                        img: img,
                        name: file.name,
                        width: img.width,
                        height: img.height,
                        url: url,
                        effectEnabled: false,
                        pinMode: false,
                        pins: [], // レイヤー固有のピン配列
                        visible: true,
                        // レイヤー固有の風揺れパラメーター
                        windShake: {
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
                            seed: 12345
                        }
                    });
                    resolve();
                };
                img.src = url;
            });
        }
        
        this.layers = this.layers.concat(newLayers);
        this.updateImageList();
        
        if (this.layers.length > 0 && this.selectedLayerIndices.length === 0) {
            this.selectedLayerIndices = [0];
            this.loadCurrentLayerParameters(); // 最初のレイヤーのパラメーターを読み込む
            this.zoomFit();
        }
        
        this.updatePreview();
    }
    
    updateImageList() {
        const imageList = document.getElementById('imageList');
        
        if (this.layers.length === 0) {
            imageList.innerHTML = '<p class="empty-message">画像が読み込まれていません</p>';
            document.getElementById('createFolderBtn').disabled = true;
            return;
        }
        
        // 複数選択ボタンの有効/無効
        document.getElementById('createFolderBtn').disabled = this.selectedLayerIndices.length < 2;
        
        imageList.innerHTML = '';
        
        // レイヤーを逆順で表示（下のレイヤーが手前）
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            
            if (layer.type === 'folder') {
                this.renderFolderItem(imageList, layer, i);
            } else {
                this.renderImageItem(imageList, layer, i);
            }
        }
    }
    
    renderFolderItem(container, folder, index) {
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder-item';
        folderDiv.dataset.index = index;
        folderDiv.dataset.type = 'folder';
        folderDiv.draggable = true; // ドラッグ可能にする
        
        // 選択されている場合はハイライト
        const isSelected = this.selectedLayerIndices.includes(index);
        if (isSelected) {
            folderDiv.classList.add('multi-selected');
        }
        
        folderDiv.innerHTML = `
            <div class="folder-header">
                <span class="folder-toggle ${folder.collapsed ? 'collapsed' : ''}">▼</span>
                <div class="folder-info">
                    <div class="folder-name">📁 ${folder.name}</div>
                    <div class="folder-count">${folder.children.length}個のアイテム</div>
                </div>
                <div class="folder-controls">
                    <div class="folder-effect-toggle">
                        <input type="checkbox" class="folder-effect-checkbox" data-index="${index}" ${folder.effectEnabled ? 'checked' : ''}>
                        <label>🍃</label>
                    </div>
                    <button class="visibility-toggle ${folder.visible ? '' : 'hidden'}" data-index="${index}" data-type="folder">
                        ${folder.visible ? '👁️' : '🚫'}
                    </button>
                    <button class="ungroup-folder-btn" data-index="${index}" title="フォルダを解除">📂</button>
                </div>
            </div>
            <div class="folder-children ${folder.collapsed ? 'collapsed' : ''}"></div>
        `;
        
        const header = folderDiv.querySelector('.folder-header');
        const toggle = folderDiv.querySelector('.folder-toggle');
        const childrenContainer = folderDiv.querySelector('.folder-children');
        
        // ドラッグイベント（フォルダー用）
        folderDiv.addEventListener('dragstart', (e) => {
            this.draggedIndex = index;
            folderDiv.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        folderDiv.addEventListener('dragend', (e) => {
            folderDiv.classList.remove('dragging');
            this.draggedIndex = null;
            this.clearDragOverStyles();
        });
        
        folderDiv.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (this.draggedIndex !== null && this.draggedIndex !== index) {
                this.clearDragOverStyles();
                folderDiv.classList.add('drag-over');
                this.dragOverIndex = index;
            }
        });
        
        folderDiv.addEventListener('dragleave', (e) => {
            folderDiv.classList.remove('drag-over');
        });
        
        folderDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            
            if (this.draggedIndex !== null && this.draggedIndex !== index) {
                const draggedItem = this.layers[this.draggedIndex];
                this.layers.splice(this.draggedIndex, 1);
                
                let newIndex = index;
                if (this.draggedIndex < index) {
                    newIndex--;
                }
                
                this.layers.splice(newIndex, 0, draggedItem);
                
                // 選択インデックスを更新
                this.selectedLayerIndices = this.selectedLayerIndices.map(i => {
                    if (i === this.draggedIndex) return newIndex;
                    if (i > this.draggedIndex && i <= newIndex) return i - 1;
                    if (i < this.draggedIndex && i >= newIndex) return i + 1;
                    return i;
                });
                
                this.updateImageList();
                this.updatePreview();
            }
        });
        
        // フォルダ折りたたみ
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            folder.collapsed = !folder.collapsed;
            toggle.classList.toggle('collapsed');
            childrenContainer.classList.toggle('collapsed');
        });
        
        // フォルダークリックで選択
        header.addEventListener('click', (e) => {
            // チェックボックスやボタンのクリックは除外
            if (e.target.closest('.folder-effect-toggle') || 
                e.target.closest('.visibility-toggle') || 
                e.target.closest('.ungroup-folder-btn') ||
                e.target.closest('.folder-toggle')) {
                return;
            }
            
            // トップレベルのフォルダーを選択
            this.selectedChildLayer = null; // フォルダー内の選択をクリア
            
            if (e.shiftKey) {
                // Shift+クリックで複数選択
                const idx = this.selectedLayerIndices.indexOf(index);
                if (idx !== -1) {
                    this.selectedLayerIndices.splice(idx, 1);
                } else {
                    this.selectedLayerIndices.push(index);
                }
            } else {
                // 通常クリックで単一選択
                this.selectedLayerIndices = [index];
            }
            
            this.updateImageList();
            
            // 選択したフォルダーのパラメーターを読み込む
            this.loadCurrentLayerParameters();
            
            // ピンモードが有効な場合、選択したフォルダーのピンを表示
            if (document.getElementById('pinModeCheck').checked) {
                this.showCurrentLayerPins();
                this.updatePinList();
            }
        });
        
        // フォルダエフェクトチェックボックス
        const effectCheckbox = folderDiv.querySelector('.folder-effect-checkbox');
        effectCheckbox.addEventListener('change', (e) => {
            e.stopPropagation();
            folder.effectEnabled = e.target.checked;
            this.updatePreview();
        });
        
        // 表示/非表示トグル
        const visibilityBtn = folderDiv.querySelector('.visibility-toggle[data-type="folder"]');
        visibilityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            folder.visible = !folder.visible;
            this.updateImageList();
            this.updatePreview();
        });
        
        // フォルダ解除
        const ungroupBtn = folderDiv.querySelector('.ungroup-folder-btn');
        ungroupBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.ungroupFolder(index);
        });
        
        // 子要素をレンダリング
        for (let i = folder.children.length - 1; i >= 0; i--) {
            const child = folder.children[i];
            // フォルダー内のレイヤーにもchildオブジェクトを渡す
            this.renderImageItem(childrenContainer, child, -1, true, child);
        }
        
        container.appendChild(folderDiv);
    }
    
    renderImageItem(container, imageData, index, isInFolder = false, childLayer = null) {
        const item = document.createElement('div');
        item.className = 'image-item';
        if (!isInFolder) {
            item.dataset.index = index;
            item.dataset.type = 'image';
            item.draggable = true;
        }
        
        // フォルダー内のレイヤーも選択可能にする
        const actualLayer = childLayer || imageData;
        const isSelected = !isInFolder && this.selectedLayerIndices.includes(index);
        const isChildSelected = isInFolder && this.selectedChildLayer === actualLayer;
        
        if (isSelected || isChildSelected) {
            item.classList.add('multi-selected');
        }
        
        item.innerHTML = `
            ${!isInFolder ? '<div class="drag-handle">⋮⋮</div>' : ''}
            <img src="${imageData.url}" class="image-thumbnail" alt="${imageData.name}">
            <div class="image-info">
                <div class="image-name">${imageData.name}</div>
                <div class="image-size">${imageData.width} × ${imageData.height}</div>
            </div>
            <div class="image-controls">
                <div class="effect-toggle">
                    <input type="checkbox" class="effect-checkbox" ${imageData.effectEnabled ? 'checked' : ''}>
                    <label>🍃 エフェクト</label>
                </div>
                ${!isInFolder ? `
                    <button class="visibility-toggle ${imageData.visible ? '' : 'hidden'}" data-index="${index}">
                        ${imageData.visible ? '👁️' : '🚫'}
                    </button>
                ` : ''}
            </div>
            ${!isInFolder ? `<button class="remove-image-btn" data-index="${index}">×</button>` : ''}
        `;
        
        if (!isInFolder) {
            // ドラッグイベント
            item.addEventListener('dragstart', (e) => {
                this.draggedIndex = index;
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
                
                if (this.draggedIndex !== null && this.draggedIndex !== index) {
                    this.clearDragOverStyles();
                    item.classList.add('drag-over');
                    this.dragOverIndex = index;
                }
            });
            
            item.addEventListener('dragleave', (e) => {
                item.classList.remove('drag-over');
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                
                if (this.draggedIndex !== null && this.draggedIndex !== index) {
                    const draggedItem = this.layers[this.draggedIndex];
                    this.layers.splice(this.draggedIndex, 1);
                    
                    let newIndex = index;
                    if (this.draggedIndex < index) {
                        newIndex--;
                    }
                    
                    this.layers.splice(newIndex, 0, draggedItem);
                    
                    // 選択インデックスを更新
                    this.selectedLayerIndices = this.selectedLayerIndices.map(i => {
                        if (i === this.draggedIndex) return newIndex;
                        if (i > this.draggedIndex && i <= newIndex) return i - 1;
                        if (i < this.draggedIndex && i >= newIndex) return i + 1;
                        return i;
                    });
                    
                    this.updateImageList();
                    this.updatePreview();
                }
                
                this.clearDragOverStyles();
            });
            
            // クリックで選択（複数選択対応）
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-image-btn') ||
                    e.target.classList.contains('visibility-toggle') ||
                    e.target.classList.contains('effect-checkbox')) {
                    return;
                }
                
                // トップレベルのレイヤーを選択
                this.selectedChildLayer = null; // フォルダー内の選択をクリア
                
                if (e.shiftKey) {
                    // Shift+クリックで複数選択
                    const idx = this.selectedLayerIndices.indexOf(index);
                    if (idx !== -1) {
                        this.selectedLayerIndices.splice(idx, 1);
                    } else {
                        this.selectedLayerIndices.push(index);
                    }
                } else {
                    // 通常クリックで単一選択
                    this.selectedLayerIndices = [index];
                }
                
                this.updateImageList();
                
                // 選択したレイヤーのパラメーターを読み込む
                this.loadCurrentLayerParameters();
                
                // ピンモードが有効な場合、選択したレイヤーのピンを表示
                if (document.getElementById('pinModeCheck').checked) {
                    this.showCurrentLayerPins();
                    this.updatePinList();
                }
            });
            
            // エフェクトチェックボックス
            const effectCheckbox = item.querySelector('.effect-checkbox');
            effectCheckbox.addEventListener('change', (e) => {
                e.stopPropagation();
                imageData.effectEnabled = e.target.checked;
                this.updatePreview();
            });
            
            // 表示/非表示トグル
            const visibilityBtn = item.querySelector('.visibility-toggle');
            if (visibilityBtn) {
                visibilityBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    imageData.visible = !imageData.visible;
                    this.updateImageList();
                    this.updatePreview();
                });
            }
            
            // 削除ボタン
            const removeBtn = item.querySelector('.remove-image-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeImage(index);
                });
            }
        } else {
            // フォルダ内のアイテム
            // クリックで選択
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('effect-checkbox')) {
                    return;
                }
                
                // フォルダー内のレイヤーを選択
                this.selectedLayerIndices = []; // トップレベルの選択をクリア
                this.selectedChildLayer = actualLayer;
                
                this.updateImageList();
                
                // 選択したレイヤーのパラメーターを読み込む
                this.loadLayerParameters(actualLayer);
                
                // ピンモードが有効な場合、選択したレイヤーのピンを表示
                if (document.getElementById('pinModeCheck').checked) {
                    this.showLayerPins(actualLayer);
                    this.updatePinListForLayer(actualLayer);
                }
            });
            
            const effectCheckbox = item.querySelector('.effect-checkbox');
            effectCheckbox.addEventListener('change', (e) => {
                e.stopPropagation();
                imageData.effectEnabled = e.target.checked;
                this.updatePreview();
            });
        }
        
        container.appendChild(item);
    }
    
    clearDragOverStyles() {
        const items = document.querySelectorAll('.image-item');
        items.forEach(item => item.classList.remove('drag-over'));
    }
    
    // 現在選択されているレイヤーまたはフォルダを取得
    getCurrentSelectedLayer() {
        // フォルダー内のレイヤーが選択されている場合
        if (this.selectedChildLayer) {
            return this.selectedChildLayer;
        }
        
        // トップレベルのレイヤー/フォルダーが選択されている場合
        if (this.selectedLayerIndices.length === 0) return null;
        return this.layers[this.selectedLayerIndices[0]];
    }
    
    // 指定されたレイヤーのパラメーターを読み込む
    loadLayerParameters(layer) {
        if (!layer || !layer.windShake) {
            // デフォルト値を表示
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
                seed: 12345
            };
        } else {
            // レイヤーのパラメーターをコピー
            this.windShake = { ...layer.windShake };
        }
        
        // UIを更新
        this.updateParameterUI();
    }
    
    // 指定されたレイヤーのピンを表示
    showLayerPins(layer) {
        if (!layer || !layer.pins) return;
        
        this.removeAllPinElements();
        
        for (const pin of layer.pins) {
            this.addPinElement(pin);
        }
    }
    
    // 指定されたレイヤーのピンリストを更新
    updatePinListForLayer(layer) {
        const pinList = document.getElementById('pinList');
        
        if (!layer || !layer.pins || layer.pins.length === 0) {
            pinList.innerHTML = '<p style="text-align: center; color: var(--biscuit); padding: 10px; font-size: 12px;">ピンが配置されていません</p>';
            return;
        }
        
        pinList.innerHTML = '';
        
        for (const pin of layer.pins) {
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
    
    // 現在のレイヤーのパラメーターをUIに読み込む
    loadCurrentLayerParameters() {
        const layer = this.getCurrentSelectedLayer();
        if (!layer || !layer.windShake) {
            // デフォルト値を表示
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
                seed: 12345
            };
        } else {
            // レイヤーのパラメーターをコピー
            this.windShake = { ...layer.windShake };
        }
        
        // UIを更新
        this.updateParameterUI();
    }
    
    // パラメーターUIを更新
    updateParameterUI() {
        document.getElementById('divisionsSlider').value = this.windShake.divisions;
        document.getElementById('divisionsValue').textContent = this.windShake.divisions;
        
        document.getElementById('angleSlider').value = this.windShake.angle;
        document.getElementById('angleValue').textContent = this.windShake.angle;
        
        document.getElementById('periodSlider').value = this.windShake.period;
        document.getElementById('periodValue').textContent = this.windShake.period.toFixed(1);
        
        document.getElementById('phaseShiftSlider').value = this.windShake.phaseShift;
        document.getElementById('phaseShiftValue').textContent = this.windShake.phaseShift;
        
        document.getElementById('centerSlider').value = this.windShake.center;
        document.getElementById('centerValue').textContent = this.windShake.center;
        
        document.getElementById('topFixedSlider').value = this.windShake.topFixed;
        document.getElementById('topFixedValue').textContent = this.windShake.topFixed;
        
        document.getElementById('bottomFixedSlider').value = this.windShake.bottomFixed;
        document.getElementById('bottomFixedValue').textContent = this.windShake.bottomFixed;
        
        document.getElementById('fromBottomCheck').checked = this.windShake.fromBottom;
        document.getElementById('randomSwingCheck').checked = this.windShake.randomSwing;
        
        document.getElementById('randomPatternSlider').value = this.windShake.randomPattern;
        document.getElementById('randomPatternValue').textContent = this.windShake.randomPattern;
        
        document.getElementById('seedSlider').value = this.windShake.seed;
        document.getElementById('seedValue').textContent = this.windShake.seed;
    }
    
    // 現在のレイヤーのパラメーターを保存
    saveCurrentLayerParameters() {
        const layer = this.getCurrentSelectedLayer();
        if (!layer) return;
        
        // レイヤーにパラメーターを保存
        layer.windShake = { ...this.windShake };
    }
    
    // 現在のレイヤーのピンを表示
    showCurrentLayerPins() {
        const layer = this.getCurrentSelectedLayer();
        if (!layer || !layer.pins) return;
        
        this.removeAllPinElements();
        
        for (const pin of layer.pins) {
            this.addPinElement(pin);
        }
    }
    
    // すべてのピンDOM要素を削除（データは保持）
    removeAllPinElements() {
        this.pinElements.forEach(el => el.remove());
        this.pinElements = [];
        
        const pinList = document.getElementById('pinList');
        pinList.innerHTML = '<p>ピンが配置されていません</p>';
    }
    
    removeImage(index) {
        URL.revokeObjectURL(this.layers[index].url);
        this.layers.splice(index, 1);
        
        // 選択インデックスを更新
        this.selectedLayerIndices = this.selectedLayerIndices
            .map(i => i > index ? i - 1 : i)
            .filter(i => i !== index && i < this.layers.length);
        
        if (this.selectedLayerIndices.length === 0 && this.layers.length > 0) {
            this.selectedLayerIndices = [Math.max(0, this.layers.length - 1)];
        }
        
        this.updateImageList();
        this.updatePreview();
    }
    
    play() {
        if (this.isPlaying) return;
        if (this.layers.length === 0) return;
        
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
        const flatLayers = this.getFlattenedLayers();
        if (flatLayers.length === 0) return;
        
        const container = document.getElementById('canvasContainer');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // 最大画像サイズを計算
        let maxWidth = 0;
        let maxHeight = 0;
        for (const layer of flatLayers) {
            if (layer.visible) {
                maxWidth = Math.max(maxWidth, layer.width);
                maxHeight = Math.max(maxHeight, layer.height);
            }
        }
        
        if (maxWidth === 0 || maxHeight === 0) return;
        
        const scaleX = containerWidth / maxWidth;
        const scaleY = containerHeight / maxHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9;
        
        this.setZoom(scale);
    }
    
    updateCanvasTransform() {
        this.canvas.style.transform = `scale(${this.zoom})`;
    }
    
    addPin(e) {
        if (this.layers.length === 0) return;
        
        const layer = this.getCurrentSelectedLayer();
        if (!layer) {
            alert('レイヤーを選択してください');
            return;
        }
        
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
        
        // 現在のレイヤー/フォルダにピンを追加
        layer.pins.push(pin);
        
        // 視覚的にピンを表示
        this.addPinElement(pin);
        
        // ピンリストを更新
        this.updatePinList();
        
        // プレビュー更新
        this.updatePreview();
    }
    
    addPinElement(pin) {
        const container = document.getElementById('canvasContainer');
        const pinElement = document.createElement('img');
        pinElement.className = 'axis-pin';
        
        // ランダムにクマの色を選択
        const colors = ['01', '02', '03', '04', '05'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        pinElement.src = `pins/papet-${randomColor}.png`;
        pinElement.style.width = '40px';
        pinElement.style.height = '40px';
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
        const layer = this.getCurrentSelectedLayer();
        if (!layer || !layer.pins) return;
        
        // データから削除
        const index = layer.pins.findIndex(p => p.id === pinId);
        if (index !== -1) {
            layer.pins.splice(index, 1);
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
        const layer = this.getCurrentSelectedLayer();
        
        if (!layer || !layer.pins || layer.pins.length === 0) {
            pinList.innerHTML = '<p style="text-align: center; color: var(--biscuit); padding: 10px; font-size: 12px;">ピンが配置されていません</p>';
            return;
        }
        
        pinList.innerHTML = '';
        
        for (const pin of layer.pins) {
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
        const flatLayers = this.getFlattenedLayers();
        
        if (flatLayers.length === 0) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        // 揺れの角度から最大バウンディングボックスを計算
        let maxCanvasWidth = 0;
        let maxCanvasHeight = 0;
        
        for (const layer of flatLayers) {
            if (!layer.visible) continue;
            
            let currentWidth = layer.width;
            let currentHeight = layer.height;
            
            // レイヤー自身のエフェクトの最大範囲
            if (layer.effectEnabled && layer.windShake) {
                const angle = layer.windShake.angle || 0;
                const angleRad = angle * Math.PI / 180;
                const maxSwayWidth = currentHeight * Math.sin(angleRad);
                currentWidth = layer.width + Math.abs(maxSwayWidth) * 2;
                currentHeight = layer.height * 1.1; // 縦方向の余裕
            }
            
            // 親フォルダーのエフェクトの最大範囲
            if (layer.parentFolders && layer.parentFolders.length > 0) {
                for (const folder of layer.parentFolders) {
                    if (folder.effectEnabled && folder.windShake) {
                        const angle = folder.windShake.angle || 0;
                        const angleRad = angle * Math.PI / 180;
                        const maxSwayWidth = currentHeight * Math.sin(angleRad);
                        currentWidth += Math.abs(maxSwayWidth) * 2;
                        currentHeight *= 1.1;
                    }
                }
            }
            
            // padding を追加
            const padding = 200;
            currentWidth += padding;
            currentHeight += padding;
            
            maxCanvasWidth = Math.max(maxCanvasWidth, currentWidth);
            maxCanvasHeight = Math.max(maxCanvasHeight, currentHeight);
        }
        
        // キャンバスサイズを最大範囲に設定
        this.canvas.width = Math.ceil(maxCanvasWidth);
        this.canvas.height = Math.ceil(maxCanvasHeight);
        
        // 背景をクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // レイヤーを順番に描画
        for (const layer of flatLayers) {
            if (!layer.visible) continue;
            
            const img = layer.img;
            
            this.ctx.save();
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            
            // エフェクトなしの場合はそのまま描画
            if (!layer.effectEnabled && (!layer.parentFolders || layer.parentFolders.length === 0 || !layer.parentFolders.some(f => f.effectEnabled))) {
                this.ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
            } else {
                // エフェクトありの場合は、applyWindShakeWebGLが直接描画
                let currentImg = img;
                let currentWidth = layer.width;
                let currentHeight = layer.height;
                
                // レイヤー自身のエフェクト
                if (layer.effectEnabled) {
                    this.applyWindShakeWebGL(this.ctx, currentImg, currentWidth, currentHeight, this.currentTime, layer);
                    
                    // 次のエフェクトのために、結果をキャプチャ
                    if (layer.parentFolders && layer.parentFolders.some(f => f.effectEnabled)) {
                        // 親フォルダーのエフェクトもある場合は、現在の結果を一時キャンバスに保存
                        const ws = {
                            ...(layer.windShake || this.windShake),
                            pins: layer.pins || []
                        };
                        const meshData = this.createWindShakeMeshWithBounds(ws, currentWidth, currentHeight, this.currentTime);
                        const padding = 200;
                        const resultWidth = meshData.bounds.width * 1.2 + padding * 2;
                        const resultHeight = meshData.bounds.height * 1.2 + padding * 2;
                        
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = resultWidth;
                        tempCanvas.height = resultHeight;
                        const tempCtx = tempCanvas.getContext('2d');
                        tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
                        this.applyWindShakeWebGL(tempCtx, currentImg, currentWidth, currentHeight, this.currentTime, layer);
                        
                        currentImg = tempCanvas;
                        currentWidth = resultWidth;
                        currentHeight = resultHeight;
                    } else {
                        this.ctx.restore();
                        continue;
                    }
                }
                
                // 親フォルダーのエフェクトを順番に適用
                if (layer.parentFolders && layer.parentFolders.length > 0) {
                    for (const folder of layer.parentFolders) {
                        if (folder.effectEnabled) {
                            if (layer.parentFolders.indexOf(folder) === layer.parentFolders.length - 1) {
                                // 最後のフォルダーは直接描画
                                this.applyWindShakeWebGL(this.ctx, currentImg, currentWidth, currentHeight, this.currentTime, folder);
                            } else {
                                // 途中のフォルダーは一時キャンバスに描画
                                const ws = {
                                    ...(folder.windShake || this.windShake),
                                    pins: folder.pins || []
                                };
                                const meshData = this.createWindShakeMeshWithBounds(ws, currentWidth, currentHeight, this.currentTime);
                                const padding = 200;
                                const resultWidth = meshData.bounds.width * 1.2 + padding * 2;
                                const resultHeight = meshData.bounds.height * 1.2 + padding * 2;
                                
                                const tempCanvas = document.createElement('canvas');
                                tempCanvas.width = resultWidth;
                                tempCanvas.height = resultHeight;
                                const tempCtx = tempCanvas.getContext('2d');
                                tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
                                this.applyWindShakeWebGL(tempCtx, currentImg, currentWidth, currentHeight, this.currentTime, folder);
                                
                                currentImg = tempCanvas;
                                currentWidth = resultWidth;
                                currentHeight = resultHeight;
                            }
                        }
                    }
                }
            }
            
            this.ctx.restore();
        }
    }
    
    // WebGLで風揺れエフェクトを適用
    applyWindShakeWebGL(ctx, img, width, height, localTime, layer) {
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
        
        // レイヤー固有のwindShakeパラメーターとピンを使用
        const ws = {
            ...(layer.windShake || this.windShake), // レイヤーのパラメーターを優先
            pins: layer.pins || [] // レイヤー固有のピン
        };
        
        // メッシュを生成してバウンディングボックスを取得
        const meshData = this.createWindShakeMeshWithBounds(ws, width, height, localTime);
        
        // バウンディングボックスのサイズを計算（余裕を持たせる）
        const padding = 200;
        const canvasWidth = meshData.bounds.width * 1.2 + padding * 2; // 1.2倍して余裕を持たせる
        const canvasHeight = meshData.bounds.height * 1.2 + padding * 2;
        
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
            const flatLayers = this.getFlattenedLayers();
            let maxWidth = 0;
            let maxHeight = 0;
            for (const layer of flatLayers) {
                maxWidth = Math.max(maxWidth, layer.width);
                maxHeight = Math.max(maxHeight, layer.height);
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
        const flatLayers = this.getFlattenedLayers();
        
        if (flatLayers.length === 0) {
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
            
            // 最大画像サイズを計算（揺れの角度から最大範囲を計算）
            let maxWidth = 0;
            let maxHeight = 0;
            
            for (const layer of flatLayers) {
                if (!layer.visible) continue;
                
                let layerWidth = layer.width;
                let layerHeight = layer.height;
                
                // エフェクトが有効な場合、揺れの角度から最大範囲を計算
                if (layer.effectEnabled && layer.windShake) {
                    const angle = layer.windShake.angle || 0;
                    const angleRad = angle * Math.PI / 180;
                    const maxSwayWidth = layerHeight * Math.sin(angleRad);
                    layerWidth = layer.width + Math.abs(maxSwayWidth) * 2;
                    layerHeight = layer.height * 1.1;
                }
                
                // 親フォルダーのエフェクトも考慮
                if (layer.parentFolders && layer.parentFolders.length > 0) {
                    for (const folder of layer.parentFolders) {
                        if (folder.effectEnabled && folder.windShake) {
                            const angle = folder.windShake.angle || 0;
                            const angleRad = angle * Math.PI / 180;
                            const maxSwayWidth = layerHeight * Math.sin(angleRad);
                            layerWidth += Math.abs(maxSwayWidth) * 2;
                            layerHeight *= 1.1;
                        }
                    }
                }
                
                // padding を追加
                const padding = 200;
                layerWidth += padding;
                layerHeight += padding;
                
                maxWidth = Math.max(maxWidth, layerWidth);
                maxHeight = Math.max(maxHeight, layerHeight);
            }
            
            if (maxWidth === 0 || maxHeight === 0) continue;
            
            const scale = Math.min(
                resolution.width / maxWidth,
                resolution.height / maxHeight
            );
            
            // 全レイヤーを順番に描画
            for (const layer of flatLayers) {
                if (!layer.visible) continue;
                
                const img = layer.img;
                
                exportCtx.save();
                exportCtx.translate(resolution.width / 2, resolution.height / 2);
                exportCtx.scale(scale, scale);
                
                // エフェクトなしの場合はそのまま描画
                if (!layer.effectEnabled && (!layer.parentFolders || layer.parentFolders.length === 0 || !layer.parentFolders.some(f => f.effectEnabled))) {
                    exportCtx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
                } else {
                    // エフェクトありの場合
                    let currentImg = img;
                    let currentWidth = layer.width;
                    let currentHeight = layer.height;
                    
                    // レイヤー自身のエフェクト
                    if (layer.effectEnabled) {
                        this.applyWindShakeWebGL(exportCtx, currentImg, currentWidth, currentHeight, time, layer);
                        
                        // 親フォルダーのエフェクトもある場合は、結果をキャプチャ
                        if (layer.parentFolders && layer.parentFolders.some(f => f.effectEnabled)) {
                            const ws = {
                                ...(layer.windShake || this.windShake),
                                pins: layer.pins || []
                            };
                            const meshData = this.createWindShakeMeshWithBounds(ws, currentWidth, currentHeight, time);
                            const padding = 200;
                            const resultWidth = meshData.bounds.width * 1.2 + padding * 2;
                            const resultHeight = meshData.bounds.height * 1.2 + padding * 2;
                            
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = resultWidth;
                            tempCanvas.height = resultHeight;
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
                            this.applyWindShakeWebGL(tempCtx, currentImg, currentWidth, currentHeight, time, layer);
                            
                            currentImg = tempCanvas;
                            currentWidth = resultWidth;
                            currentHeight = resultHeight;
                        } else {
                            exportCtx.restore();
                            continue;
                        }
                    }
                    
                    // 親フォルダーのエフェクトを順番に適用
                    if (layer.parentFolders && layer.parentFolders.length > 0) {
                        for (const folder of layer.parentFolders) {
                            if (folder.effectEnabled) {
                                if (layer.parentFolders.indexOf(folder) === layer.parentFolders.length - 1) {
                                    // 最後のフォルダーは直接描画
                                    this.applyWindShakeWebGL(exportCtx, currentImg, currentWidth, currentHeight, time, folder);
                                } else {
                                    // 途中のフォルダーは一時キャンバスに描画
                                    const ws = {
                                        ...(folder.windShake || this.windShake),
                                        pins: folder.pins || []
                                    };
                                    const meshData = this.createWindShakeMeshWithBounds(ws, currentWidth, currentHeight, time);
                                    const padding = 200;
                                    const resultWidth = meshData.bounds.width * 1.2 + padding * 2;
                                    const resultHeight = meshData.bounds.height * 1.2 + padding * 2;
                                    
                                    const tempCanvas = document.createElement('canvas');
                                    tempCanvas.width = resultWidth;
                                    tempCanvas.height = resultHeight;
                                    const tempCtx = tempCanvas.getContext('2d');
                                    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
                                    this.applyWindShakeWebGL(tempCtx, currentImg, currentWidth, currentHeight, time, folder);
                                    
                                    currentImg = tempCanvas;
                                    currentWidth = resultWidth;
                                    currentHeight = resultHeight;
                                }
                            }
                        }
                    }
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
    
    // レイヤーをフラットに展開（レンダリング用）
    getFlattenedLayers() {
        const flattened = [];
        
        const traverse = (layers, parentFolders) => {
            for (const layer of layers) {
                if (layer.type === 'folder') {
                    if (layer.visible) {
                        // フォルダ情報を親フォルダリストに追加
                        const newParentFolders = [...parentFolders, layer];
                        traverse(layer.children, newParentFolders);
                    }
                } else if (layer.type === 'image') {
                    if (layer.visible) {
                        flattened.push({
                            ...layer,
                            parentFolders: parentFolders // 親フォルダのリストを保持
                        });
                    }
                }
            }
        };
        
        traverse(this.layers, []);
        return flattened;
    }
    
    // フォルダにまとめる機能
    createFolderFromSelection() {
        if (this.selectedLayerIndices.length < 2) {
            alert('2つ以上のレイヤーを選択してください');
            return;
        }
        
        // 選択されたレイヤーを取得
        const selectedLayers = this.selectedLayerIndices
            .map(index => ({ index, layer: this.layers[index] }))
            .sort((a, b) => a.index - b.index);
        
        // フォルダを作成
        const folder = {
            type: 'folder',
            id: this.nextLayerId++,
            name: 'フォルダ ' + (this.layers.filter(l => l.type === 'folder').length + 1),
            children: selectedLayers.map(item => item.layer),
            effectEnabled: false,
            pinMode: false,
            pins: [], // フォルダ固有のピン配列
            visible: true,
            collapsed: false,
            // フォルダ固有の風揺れパラメーター
            windShake: {
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
                seed: 12345
            }
        };
        
        // 元のレイヤーを削除（後ろから）
        for (let i = selectedLayers.length - 1; i >= 0; i--) {
            this.layers.splice(selectedLayers[i].index, 1);
        }
        
        // フォルダを挿入（最初の選択位置に）
        this.layers.splice(selectedLayers[0].index, 0, folder);
        
        // 選択をクリア
        this.selectedLayerIndices = [];
        
        this.updateImageList();
        this.updatePreview();
    }
    
    // フォルダを解除
    ungroupFolder(folderIndex) {
        const folder = this.layers[folderIndex];
        if (folder.type !== 'folder') return;
        
        // フォルダを削除
        this.layers.splice(folderIndex, 1);
        
        // 子要素を展開
        for (let i = 0; i < folder.children.length; i++) {
            this.layers.splice(folderIndex + i, 0, folder.children[i]);
        }
        
        this.updateImageList();
        this.updatePreview();
    }
}

// アプリケーションを初期化
const app = new WindSwayEditor();
