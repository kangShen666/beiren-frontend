<script setup lang="ts">
import {
  CaretBottom,
  CaretRight,
  FolderRemove,
  VideoCameraFilled,
} from '@element-plus/icons-vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

// ============ 类型定义 ============
interface BaseMenuItem {
  id: number
  title: string
  status: boolean
}

interface CameraItem extends BaseMenuItem {
  lat: number
  lon: number
  height: number
  url: string
}

interface SubMenuItem extends BaseMenuItem {
  showCaretRight: boolean
  children: CameraItem[]
  lat?: number
  lon?: number
  height?: number
  url?: string
}

interface TopLevelMenuItem extends BaseMenuItem {
  children: SubMenuItem[]
}

interface Point {
  id: number
  category: number
  subCategory: number
  name: string
  lat: number
  lon: number
  url: string
}

interface MenuPosition {
  top: number
  left: number
}

// ============ 事件定义 ============
const emits = defineEmits<{
  toggle: [title: string, item: CameraItem]
  close: []
  text: []
  flyto: [item: Point]
  zhang: [title: string]
}>()

// ============ 常量定义 ============
const MENU_CONFIG = {
  WIDTH: 3.625 * 16, // rem转px
  HEIGHT: 6.25 * 16,
  MIN_BORDER: 25,
  MAX_POSITION: {
    RIGHT: 1500,
    BOTTOM: 210,
  },
  DEFAULT_HEIGHT: 50,
  RESET_POSITION: { top: 25, left: 25 },
} as const

// ============ 响应式数据 ============
const menuList = ref<TopLevelMenuItem[]>([
  {
    id: 1,
    title: '罗湖口岸',
    status: false,
    children: [
      {
        id: 0,
        title: '1号线',
        status: false,
        showCaretRight: true,
        children: [],
        lat: 121.4737,
        lon: 31.2304,
        height: 50,
        url: 'http://example.com/stream1.m3u8',
      },
      {
        id: 1,
        title: '2号线',
        status: false,
        showCaretRight: true,
        children: [],
        lat: 121.4456,
        lon: 31.2100,
        height: 40,
        url: 'http://example.com/stream2.m3u8',
      },
    ],
  },
  {
    id: 2,
    title: '福田口岸',
    status: false,
    children: [
      {
        id: 3,
        title: '1号线',
        status: false,
        showCaretRight: true,
        children: [],
        lat: 116.4074,
        lon: 39.9042,
        height: 60,
        url: 'http://example.com/stream3.m3u8',
      },
    ],
  },
  {
    id: 3,
    title: '南油口岸',
    status: true,
    children: [],
  },
])

const menuPosition = ref<MenuPosition>(MENU_CONFIG.RESET_POSITION)
const isLoading = ref(false)
const error = ref<string | null>(null)

// ============ 计算属性 ============
const menuStyle = computed(() => ({
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
}))

// ============ 拖拽功能 ============
const useDraggable = () => {
  let isDragging = false
  let offsetX = 0
  let offsetY = 0

  const startDrag = (event: MouseEvent) => {
    isDragging = true
    offsetX = event.clientX - menuPosition.value.left
    offsetY = event.clientY - menuPosition.value.top

    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', stopDrag)
    document.body.style.userSelect = 'none' // 防止拖拽时选中文本
  }

  const onDrag = (event: MouseEvent) => {
    if (!isDragging) {
      return
    }

    let newLeft = event.clientX - offsetX
    let newTop = event.clientY - offsetY

    // 边界检查和限制
    const { innerWidth, innerHeight } = window
    const maxLeft = innerWidth - MENU_CONFIG.WIDTH

    // 超出边界时重置位置
    if (newLeft > MENU_CONFIG.MAX_POSITION.RIGHT || newTop > MENU_CONFIG.MAX_POSITION.BOTTOM) {
      menuPosition.value = { ...MENU_CONFIG.RESET_POSITION }
      return
    }

    // 限制拖拽范围
    newLeft = Math.max(0, Math.min(newLeft, maxLeft))
    newTop = Math.max(0, Math.min(newTop, innerHeight - 100))

    menuPosition.value = { left: newLeft, top: newTop }
  }

  const stopDrag = () => {
    isDragging = false
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
    document.body.style.userSelect = '' // 恢复文本选择
  }

  return { startDrag }
}

const { startDrag } = useDraggable()

// ============ 数据加载 ============
const loadThirdLevelData = async (): Promise<void> => {
  if (isLoading.value) {
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const response = await fetch('/points.json')

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: Point[] = await response.json()

    if (!Array.isArray(data)) {
      throw new TypeError('Invalid data format: expected array')
    }

    // 清空现有的三级菜单数据
    menuList.value.forEach((topLevel) => {
      topLevel.children.forEach((subLevel) => {
        subLevel.children = []
      })
    })

    // 添加新的三级菜单数据
    data.forEach((point: Point) => {
      const categoryId = Number(point.category)
      const subIndex = Number(point.subCategory)

      if (Number.isNaN(categoryId) || Number.isNaN(subIndex)) {
        console.warn('Invalid category or subCategory:', point)
        return
      }

      const topLevel = menuList.value.find(item => item.id === categoryId)
      const subLevel = topLevel?.children?.[subIndex]
      if (subLevel) {
        subLevel.children.push({
          id: point.id,
          title: point.name,
          lat: Number(point.lat) || 0,
          lon: Number(point.lon) || 0,
          height: MENU_CONFIG.DEFAULT_HEIGHT,
          url: point.url || '',
          status: false,
        })
      }
    })
  }
  catch (err) {
    const errorMessage = err instanceof Error ? err.message : '未知错误'
    error.value = `加载三级菜单失败: ${errorMessage}`
    console.error('加载三级菜单失败:', err)
  }
  finally {
    isLoading.value = false
  }
}

// ============ 菜单操作 ============
const close = () => {
  emits('close')
}

const toggleMenu = (index: number) => {
  if (index < 0 || index >= menuList.value.length) {
    return
  }
  menuList.value[index].status = !menuList.value[index].status
}

const toggleSubMenu = (index: number, subIndex: number) => {
  const topLevel = menuList.value[index]
  if (!topLevel?.children) {
    return
  }

  const subMenu = topLevel.children[subIndex]
  if (!subMenu) {
    return
  }

  // 特殊逻辑处理
  if (subIndex === 0) {
    emits('text')
  }

  subMenu.status = !subMenu.status
  subMenu.showCaretRight = !subMenu.status
}

const handleCameraClick = (item: Point) => {
  emits('flyto', item)
}

// ============ 生命周期 ============
onMounted(() => {
  loadThirdLevelData()
})

onUnmounted(() => {
  // 清理可能存在的事件监听器
  document.removeEventListener('mousemove', () => { })
  document.removeEventListener('mouseup', () => { })
})

// ============ 暴露给父组件的方法 ============
defineExpose({
  refreshData: loadThirdLevelData,
  resetPosition: () => {
    menuPosition.value = { ...MENU_CONFIG.RESET_POSITION }
  },
})
</script>

<template>
  <div class="menu" :style="menuStyle">
    <i class="icon" title="关闭菜单" @click="close"></i>
    <span class="menu-title" title="拖拽移动菜单" @mousedown="startDrag">
      深圳口岸
    </span>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading">
      加载中...
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error" :title="error">
      加载失败
    </div>

    <!-- 菜单内容 -->
    <div v-else class="camera-scroll">
      <ul class="camera-box">
        <li v-for="(item, index) in menuList" :key="`top-${item.id}`">
          <div class="level1" :title="item.title" @click="toggleMenu(index)">
            <el-icon class="menu-icon">
              <CaretRight />
            </el-icon>
            <el-icon class="menu-icon">
              <FolderRemove />
            </el-icon>
            <span class="menu-text">{{ item.title }}</span>
          </div>

          <ul v-show="item.status" class="sub-menu">
            <li v-for="(subItem, subIndex) in item.children" :key="`sub-${subItem.id}`">
              <div class="level2" :title="subItem.title" @click="toggleSubMenu(index, subIndex)">
                <el-icon class="menu-icon">
                  <CaretRight v-if="subItem.showCaretRight" />
                  <CaretBottom v-else />
                </el-icon>
                <el-icon class="menu-icon folder-icon">
                  <FolderRemove />
                </el-icon>
                <span class="menu-text">{{ subItem.title }}</span>
              </div>

              <ul v-show="subItem.status" class="camera-list">
                <li v-for="childItem in subItem.children" :key="`camera-${childItem.id}`" class="level3"
                    :title="`${childItem.title} - 点击查看摄像头`" @click="handleCameraClick({
                      id: childItem.id,
                      category: item.id,
                      subCategory: subItem.id,
                      name: childItem.title,
                      lat: childItem.lat,
                      lon: childItem.lon,
                      url: childItem.url,
                    })"
                >
                  <el-icon class="menu-icon camera-icon">
                    <VideoCameraFilled />
                  </el-icon>
                  <span class="menu-text">{{ childItem.title }}</span>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
  width: 3.625rem;
  height: 6.25rem;
  background-image: url(@/assets/img/border_2.png);
  background-repeat: no-repeat;
  background-size: 3.625rem 6.25rem;
  z-index: 10;
  box-sizing: border-box;
  color: #fff;
  user-select: none;
}

.menu-title {
  display: block;
  text-align: center;
  font-weight: bold;
  color: #fff;
  font-size: 0.225rem;
  line-height: 0.85rem;
  cursor: grab;
  transition: color 0.2s ease;
}

.menu-title:active {
  cursor: grabbing;
  color: #ccc;
}

.icon {
  position: absolute;
  cursor: pointer;
  top: 0.22rem;
  right: 0.1rem;
  width: 0.35rem;
  height: 0.35rem;
  background-image: url(@/assets/img/close.png);
  background-repeat: no-repeat;
  background-size: 0.35rem 0.35rem;
  z-index: 1;
  transition: opacity 0.2s ease;
}

.icon:hover {
  opacity: 0.8;
}

.camera-box {
  margin: 0 auto;
  padding: 0 0.25rem;
  cursor: pointer;
}

.camera-scroll {
  height: 5rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.camera-scroll::-webkit-scrollbar {
  width: 2px;
}

.camera-scroll::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
}

.camera-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 1px;
}

.camera-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.menu ul {
  list-style-type: none;
  margin: 0;
  padding: 0;
}

.sub-menu {
  animation: slideDown 0.2s ease-out;
}

.camera-list {
  animation: slideDown 0.15s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }

  to {
    opacity: 1;
    max-height: 200px;
  }
}

.level1 {
  padding: 0.1rem;
  cursor: pointer;
  color: #fff;
  font-size: 0.2rem;
  font-weight: normal;
  border-radius: 0.0375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  transition: background-color 0.2s ease;
}

.level1:hover {
  background-color: #007bff;
}

.level2 {
  color: #fff;
  font-size: 0.18rem;
  padding: 0.1rem;
  margin-left: 0.1rem;
  display: flex;
  align-items: center;
  cursor: pointer;
  border-radius: 0.0375rem;
  transition: background-color 0.2s ease;
}

.level2:hover {
  background-color: #0056b3;
}

.level3 {
  color: #fff;
  font-size: 0.16rem;
  padding: 0.08rem;
  margin-left: 0.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  border-radius: 0.0375rem;
  transition: all 0.2s ease;
}

.level3:hover {
  background-color: skyblue;
  transform: translateX(2px);
}

.menu-icon {
  width: 0.2rem !important;
  height: 0.2rem !important;
  font-size: 0.2rem !important;
  margin-right: 0.1rem;
  flex-shrink: 0;
}

.folder-icon {
  margin-left: 0.05rem;
}

.camera-icon {
  color: #4caf50;
}

.menu-icon svg {
  width: 100% !important;
  height: 100% !important;
}

.menu-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 5rem;
  color: #fff;
  font-size: 0.18rem;
}

.error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 5rem;
  color: #ff6b6b;
  font-size: 0.16rem;
  cursor: pointer;
}

.error:hover {
  color: #ff5252;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .menu {
    width: 3rem;
    font-size: 0.9em;
  }

  .menu-title {
    font-size: 0.2rem;
  }

  .level1,
  .level2,
  .level3 {
    padding: 0.08rem;
  }
}
</style>
