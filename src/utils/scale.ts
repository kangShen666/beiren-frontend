// @/utils/scale.ts

// 设计稿尺寸（基准尺寸）
const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

// 防抖计时器
let resizeTimer: NodeJS.Timeout | null = null

// 获取缩放比例 - 改进版本
const getScale = (): number => {
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  // 计算宽高比例
  const scaleWidth = screenWidth / DESIGN_WIDTH
  const scaleHeight = screenHeight / DESIGN_HEIGHT

  // 使用较小的比例，确保内容完全显示
  const scale = Math.min(scaleWidth, scaleHeight)

  // 设置最小和最大缩放限制
  return Math.max(0.3, Math.min(scale, 3))
}

// 设置容器样式
interface DataViewRef {
  value: HTMLElement | null
}

export const setContainerStyle = (dataViewRef: DataViewRef): void => {
  if (!dataViewRef.value) {
    return
  }

  const scale = getScale()
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  // 计算缩放后的实际尺寸
  const scaledWidth = DESIGN_WIDTH * scale
  const scaledHeight = DESIGN_HEIGHT * scale

  // 计算居中偏移
  const offsetX = Math.max(0, (screenWidth - scaledWidth) / 2)
  const offsetY = Math.max(0, (screenHeight - scaledHeight) / 2)

  // 一次性设置所有样式，避免中间状态
  dataViewRef.value.style.cssText = `
        width: ${DESIGN_WIDTH}px;
        height: ${DESIGN_HEIGHT}px;
        transform: scale(${scale});
        transform-origin: 0 0;
        position: absolute;
        left: ${offsetX}px;
        top: ${offsetY}px;
        transition: all 0.2s ease;
        overflow: hidden !important;
        visibility: visible;
    `
}

// 创建防抖处理的resize事件处理器
export const createResizeHandler = (dataViewRef: DataViewRef) => {
  return () => {
    // 立即隐藏可能出现的滚动条
    if (dataViewRef.value) {
      dataViewRef.value.style.visibility = "hidden"
    }

    if (resizeTimer) {
      clearTimeout(resizeTimer)
    }

    resizeTimer = setTimeout(() => {
      setContainerStyle(dataViewRef)
      // 恢复显示
      if (dataViewRef.value) {
        dataViewRef.value.style.visibility = "visible"
      }
    }, 50) // 减少防抖时间，提高响应速度
  }
}

// 清理定时器
export const clearResizeTimer = (): void => {
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
}

// 移动端事件处理器
export const preventZoom = (e: TouchEvent): void => {
  if (e.touches.length > 1) {
    e.preventDefault()
  }
}

export const preventDoubleClick = (e: Event): void => {
  e.preventDefault()
}
