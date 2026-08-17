<template>
  <div class="main-container">
    <!-- Camera List -->
    <div id="camera-list">

      <div class="fixed-header">

        <div class="current-window-indicator">
          <span>Current Window: {{ currentWindowIndex + 1 }}</span>
        </div>

        <!-- 新增：搜索框 -->
        <div class="search-container">
          <input type="text" v-model="searchKeyword" placeholder="Search camera name..." class="camera-search-input"
            @input="handleSearch" />
          <button v-if="searchKeyword" @click="clearSearch" class="clear-search-btn">
            ×
          </button>
        </div>
      </div>


      <div class="scrollable-list">

        <ul>
          <!-- 修改：遍历过滤后的摄像头列表 -->
          <li v-for="camera in filteredCameraData" :key="camera.id" @click="selectCamera(camera)" :class="{
            'hovered': isHovered(camera),
            'selected': isSelectedInAnyWindow(camera),
            'current-active': isSelected(camera, currentWindowIndex)
          }" @mouseenter="hoverCamera(camera)" @mouseleave="resetHover">
            <span class="camera-name">{{ camera.name }}</span>
            <span v-if="isSelectedInAnyWindow(camera)" class="window-indicators">
              <span v-for="windowIndex in getSelectedWindows(camera)" :key="windowIndex"
                :class="['window-tag', { 'active': windowIndex === currentWindowIndex }]">
                {{ windowIndex + 1 }}
              </span>
            </span>
          </li>
          <!-- 新增：无搜索结果提示 -->
          <li v-if="filteredCameraData.length === 0 && searchKeyword" class="no-result">
            <span>No cameras found</span>
          </li>
        </ul>
      </div>

    </div>

    <!-- 其余原有代码保持不变 -->
    <div id="camera-view">
      <div id="player" style="width: 100%;height: 100%;"></div>
    </div>

    <div class="controls">
      <button @click="arrangeWindow(1)">1 Camera</button>
      <button @click="arrangeWindow(2)">4 Cameras</button>
      <button @click="arrangeWindow(3)">9 Cameras</button>
      <button @click="arrangeWindow(4)">16 Cameras</button>
      <button @click="wholeFullScreen">Full Screen</button>
      <button @click="stopAllVideos" class="stop-all-btn">Stop All</button>
    </div>

    <div class="headerTitle">
      <HeaderTitles HeaderTitle="Live Surveillance"
        logoImg="https://assets.easyv.cloud/data/img/9249/287457/z0ab97lz7b_1624414212539_s3mxqkms2u.png" />
    </div>
  </div>
</template>

<script setup>
import HeaderTitles from '@/components/Cesium/Mainlayout/headerTitle.vue'
import { ref, computed, onMounted, nextTick, onBeforeUnmount, shallowRef } from 'vue';
const IS_MOVE_DEVICE = document.body.clientWidth < 992 // 是否移动设备
import { fetchCameraUrl } from '@/service/api/carema'
import { request } from '@/service/axios';
import { useRoute, useRouter } from "vue-router";
import { getHuaWeiLogin, getHuaWeiDeviceList, getHaiKangDeviceList } from '@/service/wialon/api'

const router = useRouter()
const hoveredCamera = ref(null);  // 用于存储当前被悬停的相机
const player = shallowRef(null);  // 使用 shallowRef 优化性能
let cameraData = ref([])          // 相机列表原始数据
let routerlist = ref(false)       // 侧边栏菜单状态
let routerlists = ref(false)      // 二级菜单状态

// 新增：搜索相关响应式数据
const searchKeyword = ref('');    // 搜索关键词

// 存储每个宫格的选中相机
const selectedCameras = ref([]);
// 存储每个宫格的视频流URL
const cameraUrls = ref([]);
// 当前选中的宫格索引
const currentWindowIndex = ref(0);

// URL缓存映射，避免重复请求
const urlCache = new Map();
// 防抖函数，优化频繁操作
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// 初始化九宫格的选中状态
for (let i = 0; i < 16; i++) {
  selectedCameras.value[i] = null;
  cameraUrls.value[i] = '';
}

// 新增：计算属性 - 过滤后的摄像头列表（模糊搜索）
const filteredCameraData = computed(() => {
  if (!searchKeyword.value) {
    return cameraData.value; // 无搜索关键词时返回全部
  }
  // 转换为小写实现不区分大小写的模糊搜索
  const keyword = searchKeyword.value.toLowerCase().trim();
  return cameraData.value.filter(camera =>
    camera.name.toLowerCase().includes(keyword)
  );
});

// 新增：处理搜索输入（防抖优化）
const handleSearch = debounce(() => {
  // 搜索逻辑由计算属性自动处理，这里可添加额外逻辑
  console.log('Searching for:', searchKeyword.value);
}, 300); // 300ms防抖，避免频繁过滤

// 新增：清空搜索
const clearSearch = () => {
  searchKeyword.value = '';
};

// 优化后的获取视频流URL函数
const GetHKCCameraUrl = async (id, windowIndex) => {
  try {
    // 检查缓存
    if (urlCache.has(id)) {
      cameraUrls.value[windowIndex] = urlCache.get(id);
      console.log(`宫格 ${windowIndex} 使用缓存视频流URL:`, urlCache.get(id));
      return;
    }

    const res = await fetchCameraUrl(id);
    const url = res.data.url;

    // 缓存URL
    urlCache.set(id, url);
    cameraUrls.value[windowIndex] = url;

    console.log(`宫格 ${windowIndex} 获取新视频流URL:`, url);
  } catch (error) {
    console.error(`获取宫格 ${windowIndex} 视频流时发生错误：`, error);
    // 错误处理逻辑，如提示用户
  }
};

// 防抖优化的选择相机函数
const selectCamera = debounce(async (camera, windowIndex = currentWindowIndex.value) => {
  // 检查当前点击的相机是否已经在当前窗口被选中
  if (selectedCameras.value[windowIndex]?.id === camera.id) {
    // 如果已经选中，则取消当前窗口的选择
    selectedCameras.value[windowIndex] = null;
    cameraUrls.value[windowIndex] = '';

    // 停止当前宫格的视频播放
    if (player.value) {
      try {
        await player.value.JS_Stop(windowIndex);
        console.log(`宫格 ${windowIndex} 视频停止播放`);
      } catch (e) {
        console.error(`宫格 ${windowIndex} 停止播放失败:`, e);
      }
    }
    return;
  }

  // 如果未选中或选中的是不同相机，则选择新相机
  selectedCameras.value[windowIndex] = camera;

  // 并行执行URL获取和视频播放
  await Promise.all([
    GetHKCCameraUrl(camera.id, windowIndex),
    // 小延迟确保URL已设置
    new Promise(resolve => setTimeout(resolve, 50))
  ]);

  // 在指定宫格播放视频
  await realplay(windowIndex);
}, 200); // 200ms防抖

// 批量停止所有视频的函数
const stopAllVideos = async () => {
  const stopPromises = [];

  for (let i = 0; i < 16; i++) {
    if (selectedCameras.value[i] && player.value) {
      stopPromises.push(
        player.value.JS_Stop(i).then(
          () => {
            console.log(`宫格 ${i} 视频停止播放`);
            selectedCameras.value[i] = null;
            cameraUrls.value[i] = '';
          },
          (e) => {
            console.error(`宫格 ${i} 停止播放失败:`, e);
          }
        )
      );
    } else {
      selectedCameras.value[i] = null;
      cameraUrls.value[i] = '';
    }
  }

  // 等待所有停止操作完成
  await Promise.allSettled(stopPromises);
};

// 鼠标悬停时设置相机
const hoverCamera = (camera) => {
  hoveredCamera.value = camera;
};

// 鼠标移开时重置悬停状态
const resetHover = () => {
  hoveredCamera.value = null;
};

// 判断是否悬停
const isHovered = (camera) => {
  return hoveredCamera.value === camera;
};

// 判断是否选中
const isSelected = (camera, windowIndex) => {
  return selectedCameras.value[windowIndex]?.id === camera.id;
};

// 判断相机是否在任何窗口中被选中
const isSelectedInAnyWindow = (camera) => {
  return selectedCameras.value.some(selectedCamera =>
    selectedCamera?.id === camera.id
  );
};

// 获取相机被选中的所有窗口索引
const getSelectedWindows = (camera) => {
  const windows = [];
  selectedCameras.value.forEach((selectedCamera, index) => {
    if (selectedCamera?.id === camera.id) {
      windows.push(index);
    }
  });
  return windows;
};

// 获取摄像头列表并初始化数据
const videoplayer = async () => {
  try {
    const res = await getHaiKangDeviceList()
    if (res.status === true) {
      const TransformedData = res.data.cameras.map((item) => ({
        id: item.cameraIndexCode,
        name: item.cameraName,
      }));
      cameraData.value = TransformedData;
    }
  } catch (error) {
    console.error('获取摄像头列表时发生错误：', error);
  }
};

// 优化后的播放器初始化
const initPlayer = async () => {
  await nextTick();

  // 优化播放器配置
  player.value = new JSPlugin({
    szId: 'player',
    szBasePath: '/demo',
    iMaxSplit: 16,
    iCurrentSplit: 4, // 默认使用4宫格模式
    openDebug: false, // 关闭调试模式提升性能
    // 添加性能优化配置
    bWndFull: true,
    iPackageType: 2,
    iDecodeType: 1,
    bHardDecode: true, // 启用硬件解码
    oStyle: {
      border: "#f21461",
      borderSelect: "#f21461",
      background: "#000",
    },
  });

  // 插件选中窗口回调，更新当前宫格索引
  player.value.JS_SetWindowControlCallback({
    windowEventSelect: function (iWndIndex) {
      currentWindowIndex.value = iWndIndex;
      console.log(`当前选中窗口: ${iWndIndex}`);
      const playerContainer = document.querySelector(`#player-container-${iWndIndex}`);
      if (playerContainer) {
        playerContainer.style.setProperty('border', '1px solid red', 'important');
      }
    }
  });
};

// 防抖优化的窗口大小调整
const resizeHandler = debounce(() => {
  if (player.value) {
    player.value.JS_Resize();
  }
}, 100);

const initSize = async () => {
  window.addEventListener('resize', resizeHandler);
};

onBeforeUnmount(() => {
  // 清理资源
  window.removeEventListener('resize', resizeHandler);
  // 清空缓存
  urlCache.clear();
  // 停止所有视频
  stopAllVideos();
});

// 切换页面相机的显示数
const arrangeWindow = async (splitNum) => {
  const totalWindows = splitNum * splitNum;

  try {
    await player.value.JS_ArrangeWindow(splitNum);
    console.log(`arrangeWindow to ${splitNum}x${splitNum} success`);

    // 停止超出范围的视频
    for (let i = totalWindows; i < 16; i++) {
      if (selectedCameras.value[i] && player.value) {
        try {
          await player.value.JS_Stop(i);
        } catch (e) {
          console.error(`停止宫格 ${i} 失败:`, e);
        }
        selectedCameras.value[i] = null;
        cameraUrls.value[i] = '';
      }
    }
  } catch (e) {
    console.error('切换宫格失败:', e);
  }
};

// 整体全屏
const wholeFullScreen = async () => {
  try {
    await player.value.JS_FullScreenDisplay(true);
    console.log(`wholeFullScreen success`);
  } catch (e) {
    console.error('全屏失败:', e);
  }
};

// 优化后的播放函数
const realplay = async (windowIndex = currentWindowIndex.value) => {
  const url = cameraUrls.value[windowIndex];
  if (!url) {
    console.warn(`宫格 ${windowIndex} 没有可用的视频流URL`);
    return;
  }

  try {
    // 优化播放参数
    const playOptions = {
      playURL: url,
      mode: 0,
      streamType: 1,        // 主码流
      transType: 1,         // TCP传输
      gpuType: 0,           // 启用GPU加速
      wndType: 0,           // 实时流
      bVoiceTalk: false,    // 关闭对讲
      openAudio: true,      // 开启音频
      volume: 50,           // 音量设置
      rotate: 0,            // 不旋转
      recordType: 0,        // 不录像
      snapDir: '',          // 截图目录
      captureFile: '',      // 录像文件
      bReturnUrl: false     // 不返回URL
    };

    await player.value.JS_Play(url, playOptions, windowIndex);
    console.log(`宫格 ${windowIndex} 视频播放成功`);
  } catch (e) {
    console.error(`宫格 ${windowIndex} 视频播放失败:`, e);
    // 重试机制
    setTimeout(() => realplay(windowIndex), 1000);
  }
};

// 切换页面
const navigateView = (roterName) => {
  router.push(roterName);
  routerlist.value = false;
};

onMounted(async () => {
  try {
    // 并行执行初始化任务
    await Promise.all([
      videoplayer(),
      nextTick().then(() => initSize()),
    ]);

    // 初始化播放器
    await initPlayer();

    console.log('组件初始化完成');
  } catch (error) {
    console.error('组件初始化失败:', error);
  }
});
</script>

<style scoped lang="scss">
.main-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  background-color: rgb(35, 38, 48);
  overflow: hidden;

  // 硬件加速优化
  transform: translateZ(0);
  will-change: transform;
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.7;
  }
}

#camera-list {
  width: 200px;
  background-color: rgba(28, 57, 77, 0.1);
  // overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;

  ::-webkit-scrollbar {
    display: none;
  }

  .fixed-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: rgba(28, 57, 77, 0.1); // 与父容器保持一致

    .current-window-indicator {
      background-color: rgba(59, 130, 246, 0.9);
      color: white;
      padding: 8px 12px;
      text-align: center;
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 5px;
      border-radius: 0 0 8px 8px;

      span {
        display: inline-block;
      }
    }

    // 新增：搜索框样式
    .search-container {
      position: relative;
      padding: 8px 10px;
      margin-bottom: 5px;

      .camera-search-input {
        width: 100%;
        padding: 6px 10px 6px 12px;
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 4px;
        background-color: rgba(28, 57, 77, 0.5);
        color: #fff;
        font-size: 12px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.2s ease;

        &::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        &:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 4px rgba(59, 130, 246, 0.4);
        }
      }

      .clear-search-btn {
        position: absolute;
        right: 15px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        font-size: 16px;
        cursor: pointer;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;

        &:hover {
          color: #fff;
        }
      }
    }
  }

  // 新增：可滚动列表样式
  .scrollable-list {
    height: calc(100vh - 80px); // 根据实际情况调整高度，确保有足够空间显示固定头部
    overflow-y: auto;
    overflow-x: hidden;

    // 隐藏滚动条但保持功能
    -ms-overflow-style: none;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    ul {
      width: 100%;
      border-radius: 10px;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        width: 100%;
        min-height: 50px;
        background-color: #2d3645;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #ccc;
        border: 2px solid transparent;
        transition: all 0.2s ease; // 减少动画时间提升响应速度
        margin-bottom: 2px;
        position: relative;
        padding: 8px 12px;

        // 硬件加速优化
        transform: translateZ(0);
        will-change: transform, background-color, border-color;

        .camera-name {
          flex: 1;
          text-align: center;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .window-indicators {
          display: flex;
          gap: 4px;
          margin-left: 8px;

          .window-tag {
            background-color: rgba(59, 130, 246, 0.7);
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            min-width: 16px;
            text-align: center;

            &.active {
              background-color: #fbbf24;
              color: #1f2937;
              animation: pulse 2s infinite;
            }
          }
        }

        &:hover {
          background-color: rgba(240, 240, 240, 0.1);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.3);
        }

        // 悬停状态（鼠标移入但未选中）
        &.hovered:not(.selected) {
          background-color: rgba(99, 150, 243, 0.2);
          color: #fff;
          border-color: rgba(99, 150, 243, 0.5);
          transform: translateX(5px) translateZ(0);
        }

        // 在任何窗口中被选中的状态
        &.selected {
          background-color: rgba(59, 130, 246, 0.8);
          color: #fff;
          border-color: rgba(29, 78, 216, 0.8);
          font-weight: bold;
          transform: translateX(6px) translateZ(0);
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);

          &::after {
            content: '';
            position: absolute;
            left: -2px;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 60%;
            background-color: #3b82f6;
            border-radius: 0 2px 2px 0;
          }
        }

        // 当前活动窗口的相机（特殊高亮）
        &.current-active {
          background-color: #3b82f6;
          border-color: #1d4ed8;
          transform: translateX(10px) translateZ(0);
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.6);

          &::after {
            background-color: #fbbf24;
            width: 4px;
            height: 70%;
          }

          &:hover {
            background-color: #2563eb;
            border-color: #1e40af;
          }
        }
      }

      // 新增：无搜索结果样式
      .no-result {
        display: flex;
        justify-content: center;
        align-items: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;
        background-color: transparent;
        border: none;
        cursor: default;
        transform: none !important;

        &:hover {
          background-color: transparent;
          border-color: transparent;
          color: rgba(255, 255, 255, 0.5);
        }
      }
    }
  }
}

.controls {
  position: fixed;
  top: 10px;
  left: 76%;
  z-index: 10000;

  button {
    margin-left: 1px;
    padding: 8px 8px;
    cursor: pointer;
    border: 1px solid #ccc;
    background: #f4f4f4;
    font-size: 14px;
    transition: all 0.2s ease;
    border-radius: 4px;
  }

  .stop-all-btn {
    background-color: #dc2626;
    color: white;
    border-color: #b91c1c;

    &:hover {
      background-color: #b91c1c;
    }
  }
}

#camera-view {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px;
  margin-top: 60px;
  height: calc(100vh - 70px);
  overflow: hidden;

  // 硬件加速优化
  transform: translateZ(0);
  will-change: transform;

  .grid-container {
    width: 100%;
    height: 100%;
    display: grid;
    gap: 5px;
    background-color: #000;
    padding: 5px;
    border-radius: 8px;
  }

  .grid-item {
    background-color: #1a1a1a;
    border: 2px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: hidden;

    &.active {
      border-color: #3b82f6;
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);
    }

    &:hover {
      border-color: rgba(59, 130, 246, 0.3);
      background-color: #2a2a2a;
    }

    .window-player {
      width: 100%;
      height: 100%;
      background-color: #000;
      overflow: hidden;
    }
  }
}

.camera-item {
  border: 1px solid #ccc;
  padding: 10px;
  box-sizing: border-box;
  text-align: center;
  margin-bottom: 10px;
  height: 35vh;
  width: 30%;
}

.headerTitle {
  position: absolute;
  top: 0;
  right: 0;
  width: 90%;
  height: 8%;
  z-index: 999;
}

:deep(.sub-wnd) {
  border: 1px solid rgb(52, 52, 52) !important;
}

.Device {
  position: absolute;
  left: 15%;
  top: 10px;
  width: 320px;
  height: 38px;
  z-index: 9999;
  font-family: 微软雅黑;
  border-radius: 0px;
  border: 2px solid rgba(129, 169, 212, 0.2);
  background: rgb(25, 30, 40);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;

  span {
    margin-left: 10px;
  }
}

.routerlist {
  position: absolute;
  top: 37px;
  left: 14.5%;
  bottom: -39px;
  z-index: 10000000;

  ul {
    width: 320px;
    height: 150px;
    display: flex;
    justify-content: space-between;
    flex-direction: column;
    margin-top: 25px;
    margin-left: 10px;

    li {
      width: 320px;
      height: 38px;
      font-family: 微软雅黑;
      border-radius: 0px;
      border: 2px solid rgba(129, 169, 212, 0.2);
      background: rgb(25, 30, 40);
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      transition: all 0.2s ease;
    }
  }
}

@media screen and (width: 1500px) and (max-height: 1000px) {
  #camera-view {
    margin-left: 20px;
  }

  .Device {
    position: absolute;
    left: 15%;
    top: 10px;
    width: 300px;
    height: 38px;
    z-index: 9999;
    font-family: 微软雅黑;
    border-radius: 0px;
    border: 2px solid rgba(129, 169, 212, 0.2);
    background: rgb(25, 30, 40);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;

    span {
      margin-left: 10px;
    }
  }

  .routerlist ul li {
    width: 300px;
  }

  .controls {
    position: fixed;
    top: 10px !important;
    left: 76%;
    z-index: 10000;

    button {
      margin-left: 1px;
      width: 85px;
      font-size: 11px;
    }
  }
}

@media screen and (max-width: 1920px) and (max-height: 965px) {
  .controls {
    position: fixed;
    top: 10px;
    left: 76%;
    z-index: 10000;

    button {
      margin-left: 1px;
      width: 85px;
      font-size: 11px;
    }
  }
}

// 适配小屏幕相机列表文字换行
@media screen and (max-width: 1200px) {
  #camera-list {
    width: 180px;
  }

  #camera-list .camera-name {
    font-size: 10px;
  }

  // 适配小屏幕搜索框
  #camera-list .search-container {
    padding: 6px 8px;
  }

  #camera-list .camera-search-input {
    font-size: 11px;
    padding: 5px 8px;
  }
}
</style>