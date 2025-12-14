// 直接设置API基础URL为相对路径，确保始终使用当前域名和端口
const API_BASE_URL = '/api';

// 当前选中的图片ID
let currentImageId = null;

// 初始化页面
// 页面加载完成后执行的初始化操作
// 参数：
//   无
// 返回值：
//   无
window.addEventListener('DOMContentLoaded', function() {
    // 监听文件选择事件，显示预览
    const imageInput = document.getElementById('imageInput');
    imageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const preview = document.getElementById('imagePreview');
                const img = document.createElement('img');
                img.src = e.target.result;
                preview.innerHTML = '';
                preview.appendChild(img);
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
    
    // 监听搜索框回车事件
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchImages();
        }
    });

    // 监听操作类型选择变化
    const operationSelect = document.getElementById('testOperation');
    if (operationSelect) {
        operationSelect.addEventListener('change', function() {
            const operation = this.value;
            updateDynamicFields(operation);
        });
        
        // 初始加载时显示对应操作的字段
        updateDynamicFields(operationSelect.value);
    }
});

// 显示消息
// 显示一条带有指定类型的消息，3秒后自动消失
// 参数：
//   message - 要显示的消息内容
//   type - 消息类型，可选值：info、success、error
// 返回值：
//   无
function showMessage(message, type) {
    // 创建消息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    // 添加到容器顶部
    const container = document.querySelector('.container');
    container.insertBefore(messageDiv, container.firstChild);
    
    // 3秒后自动移除
    setTimeout(function() {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
}

// 上传图片
// 将选择的图片上传到服务器
// 参数：
//   无
// 返回值：
//   无
async function uploadImage() {
    const imageInput = document.getElementById('imageInput');
    const file = imageInput.files[0];
    
    if (!file) {
        showMessage('请先选择一张图片', 'error');
        return;
    }
    
    try {
        // 显示加载状态
        showMessage('正在上传图片...', 'info');
        
        // 将图片转换为Base64
        const base64Image = await fileToBase64(file);
        
        // 计算文件SHA256哈希值
        let fileSha256;
        try {
            fileSha256 = await computeFileSha256(file);
            console.log('文件SHA256计算成功:', fileSha256);
        } catch (hashError) {
            console.error('文件SHA256计算失败:', hashError);
            // 如果SHA256计算失败，生成一个模拟哈希值，确保上传流程能够继续
            // 实际项目中可以根据需求选择抛出错误或使用模拟值
            const timestamp = Date.now();
            fileSha256 = `simulated_${timestamp}_${Math.floor(Math.random() * 10000)}`;
            console.warn(`使用模拟SHA256值: ${fileSha256}`);
        }
        
        // 生成文件唯一标识符（格式：file_{file_sha256前16位}_{4位随机数}）
        // 提取file_sha256的前16位字符
        const sha256Prefix = fileSha256.slice(0, 16);
        // 生成4位随机数
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        // 按照指定格式拼接file_id
        const fileId = `file_${sha256Prefix}_${randomNum}`;
        
        // 获取当前时间（UTC格式）
        const fileUploadTime = new Date().toISOString();
        
        // 获取用户出口IP地址
        const fileUploadIp = await getUserIpAddress();
        
        // 构造请求数据（符合服务器期望的格式和datainfos规则）
        const requestData = {
            file_type: file.type, // 使用完整的MIME类型，如image/jpeg、image/png等
            operation: 'add',
            data: {
                file_id: fileId,
                file_name: file.name,
                file_type: file.type,
                file_sha256: fileSha256,
                file_description: `上传的图片: ${file.name}`,
                file_upload_time: fileUploadTime,
                file_upload_user: 'current_user', // 实际项目中应从登录信息获取
                file_upload_ip: fileUploadIp, // 使用真实获取的出口IP地址
                file_roles: ['user'], // 实际项目中应根据用户角色设置
                file_status: 'active',
                file_content: base64Image
            }
        };
        
        // 发送请求 - 使用v1版本
        const response = await fetch(`${API_BASE_URL}/v1/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('图片上传成功!', 'success');
            // 清空输入和预览
            imageInput.value = '';
            document.getElementById('imagePreview').style.display = 'none';
            // 刷新图片列表
            loadImages();
        } else {
            throw new Error(result.message || '上传失败');
        }
    } catch (error) {
        showMessage(`上传失败: ${error.message}`, 'error');
        console.error('上传图片错误:', error);
    }
}

// 获取用户出口IP地址
// 通过调用外部服务获取用户的公网IP地址
// 参数：
//   无
// 返回值：
//   Promise<string> - 用户的公网IP地址
async function getUserIpAddress() {
    // 使用AWS的IP检查服务，该服务返回纯文本格式的IP地址
    const ipServices = [
        'https://checkip.amazonaws.com/', // 主服务
        'https://ifconfig.me/ip' // 备用服务
    ];
    
    for (const serviceUrl of ipServices) {
        try {
            // 设置超时，防止请求卡住
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(serviceUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                continue; // 尝试下一个服务
            }
            
            // 处理不同服务的响应格式
            if (serviceUrl === 'https://checkip.amazonaws.com/') {
                // AWS服务返回纯文本IP
                const ip = await response.text();
                return ip.trim();
            } else if (serviceUrl.includes('ipify.org')) {
                // ipify.org返回JSON格式
                const data = await response.json();
                return data.ip;
            } else {
                // 其他服务返回纯文本
                const ip = await response.text();
                return ip.trim();
            }
        } catch (error) {
            console.error(`从${serviceUrl}获取IP地址失败:`, error);
            // 继续尝试下一个服务
        }
    }
    
    // 如果所有服务都失败，返回一个默认值
    console.warn('所有IP获取服务都失败，使用默认值');
    return '127.0.0.1';
}

// 计算文件SHA256哈希值
// 使用Web Crypto API计算文件的SHA256哈希值
// 参数：
//   file - 要计算哈希值的文件对象
// 返回值：
//   Promise<string> - 文件的SHA256哈希值（十六进制字符串）
async function computeFileSha256(file) {
    return new Promise((resolve, reject) => {
        try {
            // 使用Web Crypto API计算真实的SHA256哈希值
            const reader = new FileReader();
            reader.onload = async function(e) {
                const arrayBuffer = e.target.result;
                
                try {
                    // 使用Web Crypto API计算SHA256哈希
                    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                    // 将ArrayBuffer转换为Uint8Array
                    const hashArray = new Uint8Array(hashBuffer);
                    // 将Uint8Array转换为十六进制字符串
                    const hashHex = Array.from(hashArray)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                    resolve(hashHex);
                } catch (cryptoError) {
                    reject(new Error(`哈希计算失败: ${cryptoError.message}`));
                }
            };
            reader.onerror = function(e) {
                reject(new Error(`文件读取失败: ${e.target.error?.message || '未知错误'}`));
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            reject(new Error(`计算哈希值时出错: ${error.message}`));
        }
    });
}

// 将文件转换为Base64
// 将文件对象转换为Base64编码的字符串
// 参数：
//   file - 要转换的文件对象
// 返回值：
//   Promise<string> - Base64编码的文件内容
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        reader.onerror = function(e) {
            reject(new Error('文件读取失败'));
        };
        reader.readAsDataURL(file);
    });
}

// 加载图片列表
// 从服务器获取图片列表并显示
// 参数：
//   无
// 返回值：
//   无
async function loadImages() {
    try {
        // 显示加载状态
        const imageList = document.getElementById('imageList');
        imageList.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading"></div> 正在加载图片...</div>';
        
        // 构造请求数据（符合服务器期望的格式）
        const showAll = document.getElementById('showAllCheckbox').checked;
        const requestData = {
            file_type: 'all',  // 获取所有类型的文件，包括img2dicom
            operation: 'check',       // 操作类型
            data: {},                 // 重要：data字段是必填的，不能为空
            where_conditions: showAll ? null : [  // showAll为true时设置为null
                {
                    field: 'is_del',
                    operator: '=',
                    value: false
                }
            ],
            audit: false
        };
        
        // 发送请求 - 使用v1版本
        const response = await fetch(`${API_BASE_URL}/v1/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            renderImageList(result.data || []);
        } else {
            throw new Error(result.message || '加载失败');
        }
    } catch (error) {
        showMessage(`加载图片列表失败: ${error.message}`, 'error');
        console.error('加载图片列表错误:', error);
        document.getElementById('imageList').innerHTML = `<div style="text-align: center; color: red; padding: 20px;">加载失败: ${error.message}</div>`;
    }
}

// 搜索图片
// 根据搜索关键词从服务器获取匹配的图片列表
// 参数：
//   无
// 返回值：
//   无
async function searchImages() {
    try {
        const searchInput = document.getElementById('searchInput');
        const keyword = searchInput.value.trim();
        
        if (!keyword) {
            loadImages();
            return;
        }
        
        // 显示加载状态
        const imageList = document.getElementById('imageList');
        imageList.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading"></div> 正在搜索图片...</div>';
        
        // 构造请求数据（符合服务器期望的格式）
        const showAll = document.getElementById('showAllCheckbox').checked;
        
        // 构建条件数组
        let where_conditions = [];
        
        // 添加删除状态条件
        if (!showAll) {
            where_conditions.push({
                field: 'is_del',
                operator: '=',
                value: false
            });
        }
        
        // 添加搜索条件
        where_conditions.push({
            field: 'file_name',
            operator: 'LIKE',
            value: `%${keyword}%`
        });
        
        const requestData = {
            file_type: 'all', // 获取所有类型的文件，包括img2dicom
            operation: 'check',
            data: {},                 // 重要：data字段是必填的，不能为空
            where_conditions: where_conditions.length > 0 ? where_conditions : null,
            audit: false
        };
        
        // 发送请求 - 使用v1版本
        const response = await fetch(`${API_BASE_URL}/v1/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            renderImageList(result.data || []);
        } else {
            throw new Error(result.message || '搜索失败');
        }
    } catch (error) {
        showMessage(`搜索图片失败: ${error.message}`, 'error');
        console.error('搜索图片错误:', error);
        document.getElementById('imageList').innerHTML = `<div style="text-align: center; color: red; padding: 20px;">搜索失败: ${error.message}</div>`;
    }
}

// 渲染图片列表
// 将图片数据渲染为HTML列表
// 参数：
//   images - 图片数据数组
// 返回值：
//   无
function renderImageList(images) {
    const imageList = document.getElementById('imageList');
    
    if (images.length === 0) {
        imageList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">没有找到图片</div>';
        return;
    }
    
    const html = images.map(image => {
        // 使用正确的删除状态字段
        const isDeleted = image.is_del || false;
        
        // 使用正确的图片内容字段名
        // 对于img2dicom和dicom类型，优先使用dicom_content作为预览
        let imageContent = '';
        if (image.file_type === 'img2dicom' || image.file_type === 'dicom') {
            imageContent = image.dicom_content || image.file_content || image.image_content || '';
        } else {
            imageContent = image.file_content || image.image_content || '';
        }
        
        // 获取唯一标识
        const itemId = image.id || image.file_id;
        
        return `
            <div class="image-item" data-id="${itemId}">
                <div class="image-item-info">
                    <div>名称: ${image.file_name || '未知'}</div>
                    <div>类型: ${image.file_type || 'unknown'}</div>
                    <div>大小: ${formatFileSize(image.file_size || 0)}</div>
                    <div>ID: ${itemId}</div>
                    ${isDeleted ? '<div style="color: red;">已删除</div>' : ''}
                </div>
                <div style="cursor: pointer;" onclick="showImageDetail('${itemId}')">
                    ${imageContent ? `<img src="${imageContent}" alt="${image.file_name}" onclick="event.stopPropagation()">` : '<div style="height: 150px; background-color: #eee; display: flex; align-items: center; justify-content: center; color: #999;">无预览</div>'}
                </div>
                <div class="image-item-actions">
                    <button onclick="event.stopPropagation(); showImageDetail('${itemId}')">详情</button>
                    ${!isDeleted ? `<button onclick="event.stopPropagation(); editImage('${itemId}')">修改</button>` : '<button disabled>修改</button>'}
                    <button onclick="event.stopPropagation(); deleteImage('${itemId}', ${isDeleted})">${isDeleted ? '真实删除' : '标记删除'}</button>
                </div>
            </div>
        `;
    }).join('');
    
    imageList.innerHTML = html;
}

// 格式化文件大小
// 将字节数格式化为可读的文件大小（如KB、MB等）
// 参数：
//   bytes - 文件大小（字节）
// 返回值：
//   string - 格式化后的文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 显示图片详情
// 根据ID从服务器获取图片详情并显示
// 参数：
//   id - 图片ID
// 返回值：
//   无
async function showImageDetail(id) {
    try {
        // 验证id是否有效
        if (!id || isNaN(id)) {
            showMessage('无效的图片ID', 'error');
            return;
        }
        
        currentImageId = id;
        
        // 显示加载状态
        const detailSection = document.getElementById('detailSection');
        const imageDetail = document.getElementById('imageDetail');
        imageDetail.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading"></div> 正在加载详情...</div>';
        detailSection.style.display = 'block';
        
        // 构造请求数据（符合服务器期望的格式）
        const requestData = {
            file_type: 'all', // 获取所有类型的文件，包括img2dicom
            operation: 'check',
            data: {},                 // 重要：data字段是必填的，不能为空
            where_conditions: [
                {
                    field: 'id',
                    operator: '=',
                    value: id
                }
            ],
            audit: true
        };
        
        // 发送请求 - 使用v1版本
        const response = await fetch(`${API_BASE_URL}/v1/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            const image = result.data[0];
            renderImageDetail(image);
        } else {
            throw new Error(result.message || '未找到图片详情');
        }
    } catch (error) {
        showMessage(`加载图片详情失败: ${error.message}`, 'error');
        console.error('加载图片详情错误:', error);
    }
}

// 渲染图片详情
// 将图片详情数据渲染为HTML
// 参数：
//   image - 图片详情数据
// 返回值：
//   无
function renderImageDetail(image) {
    const imageDetail = document.getElementById('imageDetail');
    const isDeleted = image.is_del || false;
    
    // 使用正确的图片内容字段名
    // 对于img2dicom和dicom类型，优先使用dicom_content作为预览
    let imageContent = '';
    if (image.file_type === 'img2dicom' || image.file_type === 'dicom') {
        imageContent = image.dicom_content || image.file_content || image.image_content || '';
    } else {
        imageContent = image.file_content || image.image_content || '';
    }
    
    const html = `
        <div class="detail-image">
            ${imageContent ? `<img src="${imageContent}" alt="${image.file_name}">` : '<div style="height: 300px; background-color: #eee; display: flex; align-items: center; justify-content: center; color: #999;">无预览</div>'}
        </div>
        <div class="detail-info">
            <strong>ID:</strong>
            <span>${image.id}</span>
            
            <strong>名称:</strong>
            <span>${image.file_name || '未知'}</span>
            
            <strong>类型:</strong>
            <span>${image.file_type || 'unknown'}</span>
            
            <strong>大小:</strong>
            <span>${formatFileSize(image.file_size || 0)}</span>
            
            <strong>描述:</strong>
            <span>${image.description || '无描述'}</span>
            
            <strong>创建时间:</strong>
            <span>${formatDateTime(image.created_at)}</span>
            
            <strong>更新时间:</strong>
            <span>${formatDateTime(image.updated_at)}</span>
            
            <strong>状态:</strong>
            <span style="color: ${isDeleted ? 'red' : 'green'}">${isDeleted ? '已删除' : '正常'}</span>
            
            ${image.deleted_at ? `
                <strong>删除时间:</strong>
                <span>${formatDateTime(image.deleted_at)}</span>
            ` : ''}
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-start;">
            ${!isDeleted ? `<button onclick="editImage(${image.id})">修改图片</button>` : ''}
            <button onclick="hideImageDetail()">关闭详情</button>
        </div>
    `;
    
    imageDetail.innerHTML = html;
}

// 隐藏图片详情
// 隐藏图片详情区域
// 参数：
//   无
// 返回值：
//   无
function hideImageDetail() {
    document.getElementById('detailSection').style.display = 'none';
    currentImageId = null;
}

// 编辑图片
// 根据ID从服务器获取图片详情并显示编辑表单
// 参数：
//   id - 图片ID
// 返回值：
//   无
async function editImage(id) {
    try {
        // 验证id是否有效
        if (!id || isNaN(id)) {
            showMessage('无效的图片ID', 'error');
            return;
        }
        
        currentImageId = id;
        
        // 显示加载状态
        const editSection = document.getElementById('editSection');
        const editForm = document.getElementById('editForm');
        editForm.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="loading"></div> 正在加载编辑表单...</div>';
        editSection.style.display = 'block';
        
        // 获取图片详情（符合服务器期望的格式）
        const requestData = {
            file_type: 'image', // 统一使用file_type字段，替换旧的table_name
            operation: 'check',
            data: {},                 // 重要：data字段是必填的，不能为空
            where_conditions: [
                {
                    field: 'id',
                    operator: '=',
                    value: id
                }
            ],
            audit: true
        };
        
        const response = await fetch(`${API_BASE_URL}/v1/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            const image = result.data[0];
            renderEditForm(image);
        } else {
            throw new Error(result.message || '未找到图片详情');
        }
    } catch (error) {
        showMessage(`加载编辑表单失败: ${error.message}`, 'error');
        console.error('加载编辑表单错误:', error);
    }
}

// 渲染编辑表单
// 将图片详情数据渲染为编辑表单
// 参数：
//   image - 图片详情数据
// 返回值：
//   无
function renderEditForm(image) {
    const editForm = document.getElementById('editForm');
    
    const html = `
        <div class="form-group">
            <label for="editFileName">文件名称:</label>
            <input type="text" id="editFileName" value="${image.file_name || ''}" placeholder="请输入文件名称">
        </div>
        
        <div class="form-group">
            <label for="editFileType">文件类型:</label>
            <input type="text" id="editFileType" value="${image.file_type || ''}" placeholder="请输入文件类型">
        </div>
        
        <div class="form-group">
            <label for="editDescription">描述:</label>
            <textarea id="editDescription" placeholder="请输入描述">${image.description || ''}</textarea>
        </div>
        
        <div class="form-group">
            <label for="editContent">图片内容:</label>
            <input type="file" id="editContent" accept="image/*">
            <div style="margin-top: 10px; font-size: 12px; color: #666;">提示: 如不选择新图片，将保留原有图片内容</div>
        </div>
        
        <div class="edit-actions">
            <button onclick="saveImageChanges()">保存修改</button>
            <button onclick="cancelEdit()">取消编辑</button>
        </div>
    `;
    
    editForm.innerHTML = html;
}

// 保存图片修改
// 将编辑后的图片数据保存到服务器
// 参数：
//   无
// 返回值：
//   无
async function saveImageChanges() {
    if (!currentImageId) {
        showMessage('未选择要修改的图片', 'error');
        return;
    }
    
    try {
        const editFileName = document.getElementById('editFileName').value.trim();
        const editFileType = document.getElementById('editFileType').value.trim();
        const editDescription = document.getElementById('editDescription').value.trim();
        const editContent = document.getElementById('editContent').files[0];
        
        // 验证必填项
        if (!editFileName) {
            showMessage('文件名称不能为空', 'error');
            return;
        }
        
        // 显示加载状态
        showMessage('正在保存修改...', 'info');
        
        // 构建更新数据
        let update_data = {
            file_name: editFileName,
            file_type: editFileType || undefined,
            file_description: editDescription || undefined
        };
        
        // 如果选择了新文件，更新相关字段
        if (editContent) {
            const base64Image = await fileToBase64(editContent);
            let fileSha256;
            
            try {
                fileSha256 = await computeFileSha256(editContent);
                console.log('文件SHA256计算成功:', fileSha256);
            } catch (hashError) {
                console.error('文件SHA256计算失败:', hashError);
                // 如果SHA256计算失败，生成一个模拟哈希值，确保更新流程能够继续
                const timestamp = Date.now();
                fileSha256 = `simulated_${timestamp}_${Math.floor(Math.random() * 10000)}`;
                console.warn(`使用模拟SHA256值: ${fileSha256}`);
            }
            
            update_data = {
                ...update_data,
                file_content: base64Image,
                file_sha256: fileSha256,
                file_upload_time: new Date().toISOString()
            };
        }
        
        const requestData = {
            file_type: 'image', // 统一使用file_type字段，替换旧的table_name
            operation: 'update',
            where_conditions: [
                {
                    field: 'id',
                    operator: '=',
                    value: currentImageId
                }
            ],
            data: update_data
        };
        
        // 发送请求 - 使用v1版本
        const response = await fetch(`${API_BASE_URL}/v1/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('图片修改成功!', 'success');
            cancelEdit();
            hideImageDetail();
            loadImages();
        } else {
            throw new Error(result.message || '修改失败');
        }
    } catch (error) {
        showMessage(`修改图片失败: ${error.message}`, 'error');
        console.error('修改图片错误:', error);
    }
}

// 取消编辑
// 取消编辑操作，隐藏编辑表单
// 参数：
//   无
// 返回值：
//   无
function cancelEdit() {
    document.getElementById('editSection').style.display = 'none';
    currentImageId = null;
}

// 删除图片
// 标记删除或永久删除图片
// 参数：
//   id - 图片ID
//   isDeleted - 是否已删除（true表示已删除，执行永久删除；false表示未删除，执行标记删除）
// 返回值：
//   无
async function deleteImage(id, isDeleted) {
    const confirmMessage = isDeleted ? '确定要永久删除这张图片吗？此操作不可恢复！' : '确定要标记删除这张图片吗？';
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        // 显示加载状态
        showMessage(`正在${isDeleted ? '永久删除' : '标记删除'}图片...`, 'info');
        
        // 构造请求数据（符合服务器期望的格式）
        let requestData;
        
        // 注意：服务器只支持 'add', 'check', 'update', 'isdel' 四个操作类型
        // 真实删除和标记删除都使用 'isdel' 操作，通过不同的配置来区分
        requestData = {
            file_type: 'image', // 统一使用file_type字段，替换旧的table_name
            operation: 'isdel',
            data: {},                 // 重要：data字段是必填的，不能为空
            where_conditions: [
                {
                    field: 'id',
                    operator: '=',
                    value: id
                }
            ],
            soft_delete_config: {
                field: 'is_del',
                value: 'true'
            }
        };
        
        // 发送请求 - 使用v1版本
        const response = await fetch(`${API_BASE_URL}/v1/isdel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            showMessage(`图片${isDeleted ? '永久删除' : '标记删除'}成功!`, 'success');
            loadImages();
            // 如果当前显示的是被删除的图片，关闭详情
            if (currentImageId === id) {
                hideImageDetail();
                cancelEdit();
            }
        } else {
            throw new Error(result.message || '删除失败');
        }
    } catch (error) {
        showMessage(`删除图片失败: ${error.message}`, 'error');
        console.error('删除图片错误:', error);
    }
}

// 格式化日期时间
// 将ISO格式的日期时间字符串格式化为可读的日期时间
// 参数：
//   dateString - ISO格式的日期时间字符串
// 返回值：
//   string - 格式化后的日期时间
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// 测试数据写入（全局函数）
// 测试向服务器写入数据
// 参数：
//   无
// 返回值：
//   无
window.testAddData = async function() {
    try {
        // 获取输入值
        const tableNameInput = document.getElementById('testTableName');
        const dataJsonInput = document.getElementById('testDataJson');
        
        const tableName = tableNameInput.value.trim();
        const dataJsonStr = dataJsonInput.value.trim();
        
        if (!tableName) {
            showMessage('请输入表名', 'error');
            return;
        }
        
        if (!dataJsonStr) {
            showMessage('请输入JSON数据', 'error');
            return;
        }
        
        // 解析JSON数据
        let data;
        try {
            data = JSON.parse(dataJsonStr);
        } catch (parseError) {
            showMessage('JSON格式错误', 'error');
            return;
        }
        
        // 确保数据符合datainfos规则，特别是file_sha256字段
        const processedData = { ...data };
        
        // 如果是resources表且包含文件内容，确保有file_sha256字段
        if (tableName === 'resources' && processedData.content && !processedData.file_sha256) {
            console.warn('测试数据中缺少file_sha256字段，将生成模拟值');
            // 生成模拟的file_sha256值
            processedData.file_sha256 = `test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            // 同时确保其他必需字段存在
            if (!processedData.file_id) {
                // 按照指定格式生成file_id：file_{file_sha256前16位}_{4位随机数}
                const sha256Prefix = processedData.file_sha256.slice(0, 16);
                const randomNum = Math.floor(1000 + Math.random() * 9000);
                processedData.file_id = `file_${sha256Prefix}_${randomNum}`;
            }
            if (!processedData.file_upload_time) {
                processedData.file_upload_time = new Date().toISOString();
            }
            if (!processedData.file_upload_user) {
                processedData.file_upload_user = 'test_user';
            }
            if (!processedData.file_upload_ip) {
                // 获取真实的用户出口IP地址
                processedData.file_upload_ip = await getUserIpAddress();
            }
            if (!processedData.file_roles) {
                processedData.file_roles = ['test_role'];
            }
            if (!processedData.file_status) {
                processedData.file_status = 'active';
            }
            // 转换字段名以符合datainfos规则
            if (processedData.content && !processedData.file_content) {
                processedData.file_content = processedData.content;
                delete processedData.content;
            }
            if (processedData.description && !processedData.file_description) {
                processedData.file_description = processedData.description;
                delete processedData.description;
            }
        }
        
        // 显示加载状态
        showMessage('正在测试数据写入...', 'info');
        
        // 构造请求数据
        const requestData = {
            file_type: processedData.file_type || tableName, // 使用完整的MIME类型或表名
            operation: 'add',
            data: processedData
        };
        
        // 发送请求 - 使用v1版本
        const response = await fetch(`${API_BASE_URL}/v1/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误! 状态: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('数据写入成功!', 'success');
            // 清空输入
            tableNameInput.value = '';
            dataJsonInput.value = '';
        } else {
            throw new Error(result.message || '写入失败');
        }
    } catch (error) {
        showMessage(`写入失败: ${error.message}`, 'error');
        console.error('测试数据写入错误:', error);
    }
}



// 更新动态表单字段和操作指南，根据选择的操作类型显示
// 根据选择的操作类型显示对应的表单字段和操作指南
// 参数：
//   operation - 操作类型，可选值：add、check、update、isdel
// 返回值：
//   无
function updateDynamicFields(operation) {
    // 隐藏所有动态字段
    document.getElementById('checkFields').style.display = 'none';
    document.getElementById('updateFields').style.display = 'none';
    document.getElementById('isdelFields').style.display = 'none';
    
    // 显示对应的动态字段
    switch(operation) {
        case 'check':
            document.getElementById('checkFields').style.display = 'block';
            break;
        case 'update':
            document.getElementById('updateFields').style.display = 'block';
            break;
        case 'isdel':
            document.getElementById('isdelFields').style.display = 'block';
            break;
        default:
            break;
    }
    
    // 更新操作指南显示
    const guideItems = document.querySelectorAll('.guide-item');
    guideItems.forEach(item => {
        if (item.dataset.operation === operation) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
    
    // 更新文件输入的描述文本，根据操作类型
    const fileInputLabel = document.querySelector('label[for="testFileTypeFile"]');
    const fileInputHelp = document.querySelector('label[for="testFileTypeFile"] + div');
    
    // 只在元素存在时才设置textContent
    if (fileInputLabel && fileInputHelp) {
        if (operation === 'update') {
            fileInputLabel.textContent = '选择文件 (用于update操作，可选，更新图片内容):';
            fileInputHelp.textContent = '支持所有文件类型，会根据选择的file_type处理。如不选择新文件，将保留原有图片内容';
        } else {
            fileInputLabel.textContent = '选择文件 (用于add操作):';
            fileInputHelp.textContent = '支持所有文件类型，会根据选择的file_type处理';
        }
    }
}

// 显示check操作的结果，允许选择要更新的数据
// 显示查询结果列表，允许用户选择要更新的数据
// 参数：
//   data - 查询结果数据数组
// 返回值：
//   无
function displayCheckResults(data) {
    const checkResultsDiv = document.getElementById('checkResults');
    const checkResultsListDiv = document.getElementById('checkResultsList');
    
    if (!Array.isArray(data) || data.length === 0) {
        checkResultsListDiv.innerHTML = '<div style="color: #666; padding: 10px;">没有找到匹配的数据</div>';
        checkResultsDiv.style.display = 'block';
        return;
    }
    
    // 生成结果列表HTML
    const resultsHtml = data.map((item, index) => {
        // 生成简短的预览信息
        const previewInfo = [];
        if (item.file_id) previewInfo.push(`ID: ${item.file_id}`);
        if (item.file_name) previewInfo.push(`名称: ${item.file_name}`);
        if (item.file_type) previewInfo.push(`类型: ${item.file_type}`);
        if (item.id) previewInfo.push(`数据库ID: ${item.id}`);
        
        return `
            <div class="check-result-item" data-index="${index}" data-item='${JSON.stringify(item)}'>
                <div class="check-result-info">
                    <div class="check-result-preview">${previewInfo.join(' | ')}</div>
                    <div class="check-result-actions">
                        <button onclick="selectItemForUpdate(${index}, '${JSON.stringify(item).replace(/'/g, "&#39;")}')">选择更新</button>
                        <button onclick="viewItemDetails('${JSON.stringify(item).replace(/'/g, "&#39;")}')">查看详情</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    checkResultsListDiv.innerHTML = resultsHtml;
    checkResultsDiv.style.display = 'block';
}

// 选择要更新的数据
// 选择查询结果中的一项进行更新
// 参数：
//   index - 数据在结果数组中的索引
//   itemStr - 数据对象的JSON字符串
// 返回值：
//   无
function selectItemForUpdate(index, itemStr) {
    try {
        const item = JSON.parse(itemStr);
        
        // 将选择的item数据填充到表单中
        const dataJsonInput = document.getElementById('testFileTypeData');
        
        // 构建更新数据格式，包含where_conditions
        const updateData = {
            where_conditions: [
                {
                    field: item.id ? 'id' : 'file_id',
                    operator: '=',
                    value: item.id || item.file_id
                }
            ],
            // 填充部分字段作为默认更新数据
            file_name: item.file_name,
            file_description: item.file_description || '',
            file_roles: item.file_roles || ['user']
        };
        
        dataJsonInput.value = JSON.stringify(updateData, null, 2);
        
        // 切换到update操作
        const operationSelect = document.getElementById('testOperation');
        operationSelect.value = 'update';
        updateDynamicFields('update');
        
        // 显示提示
        showMessage('已选择数据，现在可以修改JSON数据或上传新文件进行更新', 'info');
    } catch (error) {
        console.error('选择更新数据失败:', error);
        showMessage('选择更新数据失败', 'error');
    }
}

// 查看数据详情
// 显示数据的详细信息
// 参数：
//   itemStr - 数据对象的JSON字符串
// 返回值：
//   无
function viewItemDetails(itemStr) {
    try {
        const item = JSON.parse(itemStr);
        
        // 显示详情模态框
        const detailHtml = `
            <div class="modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;">
                <div class="modal-content" style="background-color: white; padding: 20px; border-radius: 8px; max-width: 80%; max-height: 80%; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3>数据详情</h3>
                        <button onclick="this.closest('.modal').remove();" style="background-color: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">关闭</button>
                    </div>
                    <pre style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(item, null, 2)}</pre>
                </div>
            </div>
        `;
        
        // 添加到body
        document.body.insertAdjacentHTML('beforeend', detailHtml);
    } catch (error) {
        console.error('查看详情失败:', error);
        showMessage('查看详情失败', 'error');
    }
}

// 测试基于file_type的API端点（全局函数）
// 测试不同file_type的API端点
// 参数：
//   无
// 返回值：
//   无
window.testFileTypeApi = async function() {
    try {
        // 获取输入值
        const fileTypeSelect = document.getElementById('testFileType');
        const operationSelect = document.getElementById('testOperation');
        const fileInput = document.getElementById('testFileTypeFile');
        const tableNameInput = document.getElementById('testFileTypeTableName');
        const dataJsonInput = document.getElementById('testFileTypeData');
        const resultDiv = document.getElementById('testFileTypeResult');
        
        // 获取动态字段的值
        const checkAuditCheckbox = document.getElementById('checkAudit');
        const isdelFieldInput = document.getElementById('isdelField');
        const isdelValueInput = document.getElementById('isdelValue');
        
        const fileType = fileTypeSelect.value;
        const operation = operationSelect.value;
        const selectedFile = fileInput.files[0];
        const tableName = tableNameInput.value.trim();
        const dataJsonStr = dataJsonInput.value.trim();
        // 获取额外参数
        const audit = checkAuditCheckbox ? checkAuditCheckbox.checked : false;
        const isdelField = isdelFieldInput ? isdelFieldInput.value : 'is_del';
        const isdelValue = isdelValueInput ? isdelValueInput.value : 'true';
        
        // 解析用户提供的JSON数据（可选）
        let userData = {};
        if (dataJsonStr) {
            try {
                userData = JSON.parse(dataJsonStr);
            } catch (parseError) {
                showMessage('JSON格式错误', 'error');
                return;
            }
        }
        
        // 显示加载状态
        showMessage('正在测试基于file_type的API...', 'info');
        
        // 初始化请求数据
        // 根据文件类型和实际文件，正确拼合file_type值
        let requestFileType = fileType;
        if (operation === 'add' && selectedFile) {
            // 对于添加操作，如果有选择文件且不是特殊类型，使用文件的实际MIME类型
            if (fileType === 'img2dicom') {
                // img2dicom是特殊类型，保持file_type为img2dicom
                requestFileType = 'img2dicom';
            } else {
                requestFileType = selectedFile.type;
            }
        }
        let requestData = {
            file_type: requestFileType, 
            operation: operation,
            data: {}
        };
        
        // 如果是add或update操作且选择了文件，处理文件上传
        if ((operation === 'add' || operation === 'update') && selectedFile) {
            // 将文件转换为Base64
            const base64Content = await fileToBase64(selectedFile);
            
            // 计算文件SHA256哈希值
            let fileSha256;
            try {
                fileSha256 = await computeFileSha256(selectedFile);
                console.log('文件SHA256计算成功:', fileSha256);
            } catch (hashError) {
                console.error('文件SHA256计算失败:', hashError);
                // 如果SHA256计算失败，生成一个模拟哈希值
                const timestamp = Date.now();
                fileSha256 = `simulated_${timestamp}_${Math.floor(Math.random() * 10000)}`;
                console.warn(`使用模拟SHA256值: ${fileSha256}`);
            }
            
            // 获取当前时间（UTC格式）
            const fileUploadTime = new Date().toISOString();
            
            // 获取用户出口IP地址
            const fileUploadIp = await getUserIpAddress();
            
            // 构建文件相关元数据
            const fileMetadata = {
                file_name: selectedFile.name,
                file_type: selectedFile.type, // 使用文件的实际MIME类型，如image/png、image/jpeg等
                file_size: selectedFile.size,
                file_sha256: fileSha256,
                file_upload_time: fileUploadTime,
                file_upload_user: 'current_user', // 实际项目中应从登录信息获取
                file_upload_ip: fileUploadIp
            };
            
            // 处理img2dicom类型的特殊要求
            if (fileType === 'img2dicom') {
                console.log('处理img2dicom类型的文件上传');
                
                // 根据img2dicom.rule.md要求，设置特殊字段
                Object.assign(fileMetadata, {
                    image_content: base64Content, // 将图片内容存储到image_content字段
                    dicom_path: '', // 初始化为空，后端会填充
                    dicom_content: '' // 初始化为空，后端会填充
                });
            } else {
                // 普通文件类型，使用file_content字段
                fileMetadata.file_content = base64Content;
            }
            
            // 合并文件元数据和用户提供的数据（用户数据优先级更高）
            if (operation === 'add') {
                // 对于add操作，生成完整的文件元数据
                // 生成文件唯一标识符（格式：file_{file_sha256前16位}_{4位随机数}）
                const sha256Prefix = fileSha256.slice(0, 16);
                const randomNum = Math.floor(1000 + Math.random() * 9000);
                const fileId = `file_${sha256Prefix}_${randomNum}`;
                
                const fullMetadata = {
                    file_id: fileId,
                    file_roles: ['user'], // 实际项目中应根据用户角色设置
                    file_status: 'active',
                    ...fileMetadata
                };
                
                requestData.data = {
                    ...fullMetadata,
                    ...userData
                };
            } else {
                // 对于update操作，只合并文件相关字段
                requestData.data = {
                    ...userData,
                    ...fileMetadata
                };
            }
        } else {
            // 对于非add/update操作或未选择文件的情况，直接使用用户提供的数据
            requestData.data = userData;
            
            // 验证是否提供了必要的数据
            if (Object.keys(requestData.data).length === 0) {
                showMessage(`请提供JSON数据${operation === 'add' ? '或选择文件' : ''}`, 'error');
                return;
            }
        }
        
        // 构建API URL，格式：/api/{version}/{operation}
        const apiUrl = `${API_BASE_URL}/v1/${operation}`;
        console.log('构建的API URL:', apiUrl);
        console.log('API_BASE_URL配置:', API_BASE_URL);
        console.log('fileType:', fileType);
        console.log('operation:', operation);
        console.log('audit:', audit);
        console.log('isdelField:', isdelField);
        console.log('isdelValue:', isdelValue);
        
        // API URL使用相对路径，无需检查协议
        console.log('使用相对路径API URL:', apiUrl);
        
        // 添加用户选择的额外参数
        if (operation === 'check') {
            // check操作的audit参数
            requestData.audit = audit;
        } else if (operation === 'isdel') {
            // isdel操作的soft_delete_config参数
            requestData.soft_delete_config = {
                field: isdelField,
                value: isdelValue
            };
        }
        
        // 处理不同操作类型的特殊要求
        if (operation === 'check') {
            // check操作：data可以为空，主要使用where_conditions查询
            // 如果没有提供where_conditions，允许空条件查询所有数据
            if (!requestData.where_conditions) {
                requestData.where_conditions = [];
            }
        } else if (operation === 'update') {
            // update操作：需要明确区分where_conditions和要更新的数据
            // 如果用户只提供了data，引导用户正确使用格式
            if (!requestData.where_conditions) {
                // 检查data中是否包含where_conditions字段
                if (requestData.data.where_conditions) {
                    // 分离where_conditions和要更新的数据
                    requestData.where_conditions = requestData.data.where_conditions;
                    delete requestData.data.where_conditions;
                } else if (Object.keys(requestData.data).length > 0) {
                    // 如果没有明确提供where_conditions，使用id作为默认条件
                    if (requestData.data.id) {
                        requestData.where_conditions = [{
                            field: 'id',
                            operator: '=',
                            value: requestData.data.id
                        }];
                    } else {
                        showMessage('update操作需要提供where_conditions或包含id字段来指定要更新的记录', 'error');
                        return;
                    }
                }
            }
            
            // 确保有要更新的数据
            if (Object.keys(requestData.data).length === 0) {
                showMessage('update操作需要提供data参数来指定要更新的数据', 'error');
                return;
            }
        } else if (operation === 'isdel') {
            // isdel操作：需要where_conditions来指定要删除的记录
            if (!requestData.where_conditions && Object.keys(requestData.data).length > 0) {
                // 如果用户没有提供where_conditions，但提供了data，则使用data中的字段作为条件
                requestData.where_conditions = Object.keys(requestData.data).map(key => ({
                    field: key,
                    operator: '=',
                    value: requestData.data[key]
                }));
            } else if (!requestData.where_conditions) {
                showMessage('isdel操作需要提供where_conditions来指定要删除的记录', 'error');
                return;
            }
        }
        
        // 发送请求
        try {
            console.log('开始发送请求...');
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            console.log('请求发送成功，等待响应...');
            
            // 获取响应状态和内容
            const statusText = `${response.status} ${response.statusText}`;
            console.log('响应状态:', statusText);
            
            let resultContent;
            try {
                resultContent = await response.json();
                console.log('响应数据(JSON):', resultContent);
            } catch (parseError) {
                resultContent = await response.text();
                console.log('响应数据(文本):', resultContent);
            }
            
            // 显示结果
        const resultHtml = `
            <h3>请求结果</h3>
            <div style="margin-bottom: 10px;">
                <strong>请求URL:</strong> ${apiUrl}
            </div>
            <div style="margin-bottom: 10px;">
                <strong>请求方法:</strong> POST
            </div>
            <div style="margin-bottom: 10px;">
                <strong>响应状态:</strong> <span style="color: ${response.ok ? 'green' : 'red'}">${statusText}</span>
            </div>
            <div style="margin-bottom: 10px;">
                <strong>请求数据:</strong>
                <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(requestData, null, 2)}</pre>
            </div>
            <div>
                <strong>响应数据:</strong>
                <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent, null, 2)}</pre>
            </div>
        `;
        
        resultDiv.innerHTML = resultHtml;
        resultDiv.style.display = 'block';
        
        // 处理check操作的结果，显示可选择的记录列表
        if (response.ok && operation === 'check' && typeof resultContent === 'object' && resultContent.success && resultContent.data) {
            displayCheckResults(resultContent.data);
        } else {
            // 隐藏check结果区域
            document.getElementById('checkResults').style.display = 'none';
        }
        
        // 滚动到结果区域
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        if (response.ok) {
            showMessage('API测试成功!', 'success');
        } else {
            showMessage('API测试失败!', 'error');
        }
        } catch (fetchError) {
            console.error('请求发送失败:', fetchError);
            
            // 显示详细的错误信息
            const errorHtml = `
                <h3>请求失败</h3>
                <div style="margin-bottom: 10px;">
                    <strong>请求URL:</strong> ${apiUrl}
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>请求方法:</strong> POST
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>错误类型:</strong> <span style="color: red;">${fetchError.name}</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>错误信息:</strong> <span style="color: red;">${fetchError.message}</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>请求数据:</strong>
                    <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(requestData, null, 2)}</pre>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>错误详情:</strong>
                    <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; color: red;">${JSON.stringify(fetchError, Object.getOwnPropertyNames(fetchError), 2)}</pre>
                </div>
                <div style="margin-top: 15px; padding: 10px; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 4px; color: #856404;">
                    <strong>调试建议:</strong><br>
                    1. 确认后端服务是否正在运行<br>
                    2. 检查API URL是否正确<br>
                    3. 检查网络连接<br>
                    4. 查看浏览器开发者工具的Network和Console标签页获取更多信息
                </div>
            `;
            
            resultDiv.innerHTML = errorHtml;
            resultDiv.style.display = 'block';
            
            // 滚动到结果区域
            resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            showMessage(`API请求失败: ${fetchError.message}`, 'error');
        }
    } catch (error) {
        showMessage(`API测试失败: ${error.message}`, 'error');
        console.error('基于file_type的API测试错误:', error);
    }
}