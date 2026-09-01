<script setup lang="ts">
import axios from 'axios'
import * as echarts from 'echarts'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const chartRef = ref<HTMLElement | null>(null)
const barChartRef = ref<HTMLElement | null>(null)
const rankChartRef = ref<HTMLElement | null>(null)

const showFlowChart = ref(true)
const showBarChart = ref(true)
const showRankChart = ref(true)

const totalEnter = ref(0)
const totalExit = ref(0)

let chartInstance: echarts.ECharts | null = null
let barChartInstance: echarts.ECharts | null = null
let rankChartInstance: echarts.ECharts | null = null

let rankChartTimer: ReturnType<typeof setInterval> | null = null
let flowChartTimer: ReturnType<typeof setInterval> | null = null

// 客流接口基础地址
// const BASE_API_URL = 'https://br.yziic.com:19563'
const BASE_API_URL = '/api'

// 接口鉴权 key
const SP_KEY =
  'e27c3780e7069bda7082a23a489d77587ce309583ed99253f66e1d9833ed1a1d0b5ce86dc6714e9974cf258589139d7b1855e8c9fa2f2c1175ee123a95a23e9b0c23584b8b61f46a98ca0e38d5e58c985832712d6fb1cb56d247ed60d262da1d538a'

// 公共请求头
const SP_HEADERS = {
  'sp-key': SP_KEY,
}

// 计算图表字号：以 1920 宽为基准缩放，超宽屏下放大
const chartFontSize = Math.min(
  Math.max(10, Math.round(window.innerWidth / 1920 * 10)),
  22
)

interface RealDataItem {
  groupName: string
  enter: number
  exit: number
  groupId: string
  statisticsTime: string
}

interface ApiResponse {
  code: number
  msg: string
  data: {
    totalEnter: number
    totalExit: number
    realdata: RealDataItem[]
  }
}

// --- 数据接口请求方法 ---
const getRealTimeData = async (): Promise<ApiResponse['data'] | null> => {
  try {
    const response = await axios.get<ApiResponse>('/api/getRealTimeData', {
      headers: SP_HEADERS
    })
    if (response.data.code === 0 && response.data.data) {
      return response.data.data
    }
    return null
  } catch (error) {
    console.error('获取实时数据失败:', error)
    return null
  }
}

// 获取某日各小时数据
const getHourlyData = async (date?: string) => {
  try {
    const url = `${BASE_API_URL}/getHourlyData`
    const params = date ? { date } : {}
    const response = await axios.get(url, { 
      params,
      headers: SP_HEADERS, // 新增鉴权头 
      })
    if (response.data.code === 0 && response.data.data) {
      return response.data.data
    }
    return null
  } catch (error) {
    console.error('获取小时数据失败:', error)
    return null
  }
}

// 获取近7天数据
const getWeeklyData = async () => {
  try {
    const url = `${BASE_API_URL}/getWeeklyData`
    const response = await axios.get(url, {
      headers: SP_HEADERS, // 新增鉴权头
    })
    if (response.data.code === 0 && response.data.data) {
      return response.data.data
    }
    return null
  } catch (error) {
    console.error('获取近7天数据失败:', error)
    return null
  }
}

// --- 图表初始化与更新逻辑 ---
const initChart = async () => {
  if (!chartRef.value) {
    return
  }
  chartInstance = echarts.init(chartRef.value)
  await updateFlowChart()
}

const updateFlowChart = async () => {
  if (!chartInstance) {
    return
  }
  const hourlyData = await getHourlyData()
  if (!hourlyData || hourlyData.length === 0) {
    return
  }

  // 聚合计算每个小时的总进入人数
  const hours = hourlyData.map((item: any) => `${item.hour}:00`)
  const totalEnters = hourlyData.map((item: any) =>
    item.groups.reduce((sum: number, group: any) => sum + group.enter, 0)
  )

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}: {c} 人',
    },
    grid: {
      left: '15%',
      right: '10%',
      top: '30%',
      bottom: '20%',
    },
    xAxis: {
      type: 'category',
      data: hours,
      axisLine: { lineStyle: { color: '#fff' } },
      axisLabel: { color: '#fff', fontSize: chartFontSize },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#fff' } },
      axisLabel: { color: '#fff', fontSize: chartFontSize },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
    },
    series: [
      {
        name: '实时人流',
        type: 'line',
        data: totalEnters,
        lineStyle: {
          color: '#00d4ff',
          width: 2,
          type: 'solid',
        },
        itemStyle: {
          color: '#00d4ff',
          shadowBlur: 10,
          shadowColor: '#00d4ff',
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
            { offset: 1, color: 'rgba(0, 212, 255, 0.05)' },
          ]),
        },
        symbol: 'circle',
        symbolSize: 6,
      },
    ],
  }
  chartInstance.setOption(option)
}

const initBarChart = async () => {
  if (!barChartRef.value) {
    return
  }
  barChartInstance = echarts.init(barChartRef.value)
  await updateBarChart()
}

const updateBarChart = async () => {
  if (!barChartInstance) {
    return
  }
  const weeklyData = await getWeeklyData()
  if (!weeklyData || weeklyData.length === 0) {
    return
  }

  // 聚合计算每天的总进入人数，提取日期(MM-DD)
  const dates = weeklyData.map((item: any) => item.date.substring(5))
  const totalEnters = weeklyData.map((item: any) =>
    item.groups.reduce((sum: number, group: any) => sum + group.enter, 0)
  )

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}: {c} 人',
    },
    grid: {
      left: '15%',
      right: '10%',
      top: '30%',
      bottom: '20%',
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: '#fff' } },
      axisLabel: { color: '#fff', fontSize: chartFontSize },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#fff' } },
      axisLabel: { color: '#fff', fontSize: chartFontSize },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
    },
    series: [
      {
        name: '每日人流',
        type: 'bar',
        data: totalEnters,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 212, 255, 0.6)' },
            { offset: 1, color: 'rgba(0, 212, 255, 0.2)' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '50%',
      },
    ],
  }
  barChartInstance.setOption(option)
}

const initRankChart = async () => {
  if (!rankChartRef.value) {
    return
  }
  rankChartInstance = echarts.init(rankChartRef.value)
  await updateRankChart()
}

const updateRankChart = async () => {
  if (!rankChartInstance) {
    return
  }
  const data = await getRealTimeData()
  if (!data || !data.realdata) {
    return
  }
  totalEnter.value = data.totalEnter
  totalExit.value = data.totalExit

  const uniqueData = data.realdata.reduce((acc, item) => {
    const existing = acc.find(d => d.groupId === item.groupId)
    if (!existing) {
      acc.push(item)
    }
    return acc
  }, [] as RealDataItem[])

  uniqueData.sort((a, b) => b.enter - a.enter)

  const names = uniqueData.map((item) => {
    const name = item.groupName.replace('总客流统计组', '').replace('客流', '').replace('全局场馆', '')
    return name.length > 8 ? `${name.substring(0, 8)}...` : name
  })

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const index = params[0].dataIndex
        const item = uniqueData[index]
        return `<div style="padding: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">${item.groupName}</div>
          <div>进入: <span style="color: #00d4ff;">${item.enter}</span> 人</div>
          <div>离开: <span style="color: #ff6b6b;">${item.exit}</span> 人</div>
          <div>当前: <span style="color: #52c41a;">${item.enter - item.exit}</span> 人</div>
        </div>`
      },
    },
    legend: {
      data: ['进入人数', '离开人数'],
      textStyle: { color: '#fff', fontSize: chartFontSize },
      top: '18%',
      left: 'center',
    },
    grid: {
      left: '12%',
      right: '8%',
      top: '30%',
      bottom: '10%',
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLine: { lineStyle: { color: '#fff' } },
      axisLabel: { color: '#fff', fontSize: chartFontSize, interval: 0 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#fff' } },
      axisLabel: { color: '#fff', fontSize: chartFontSize },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
    },
    title: [
      {
        text: `总进入: ${data.totalEnter}`,
        left: '3%',
        top: '20%',
        textStyle: {
          color: '#00d4ff',
          fontSize: chartFontSize,
          fontWeight: 'bold',
          textShadowColor: 'rgba(0, 212, 255, 0.5)',
          textShadowBlur: 5,
        },
      },
      {
        text: `总离开: ${data.totalExit}`,
        right: '3%',
        top: '18%',
        textStyle: {
          color: '#ff6b6b',
          fontSize: chartFontSize,
          fontWeight: 'bold',
          textShadowColor: 'rgba(255, 107, 107, 0.5)',
          textShadowBlur: 5,
        },
      },
    ],
    series: [
      {
        name: '进入人数',
        type: 'bar',
        data: uniqueData.map(item => item.enter),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 212, 255, 0.8)' },
            { offset: 1, color: 'rgba(0, 212, 255, 0.2)' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '22%',
      },
      {
        name: '离开人数',
        type: 'bar',
        data: uniqueData.map(item => item.exit),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(255, 107, 107, 0.8)' },
            { offset: 1, color: 'rgba(255, 107, 107, 0.2)' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        barWidth: '22%',
      },
    ],
  }
  rankChartInstance.setOption(option)
}

const handleResize = () => {
  chartInstance?.resize()
  barChartInstance?.resize()
  rankChartInstance?.resize()
}

onMounted(() => {
  initChart()
  initBarChart()
  initRankChart()
  window.addEventListener('resize', handleResize)

  // 每30秒刷新排行图
  rankChartTimer = setInterval(() => {
    if (showRankChart.value && rankChartInstance) {
      updateRankChart()
    }
  }, 30000)

  // 每60秒刷新折线图(实时人流)
  flowChartTimer = setInterval(() => {
    if (showFlowChart.value && chartInstance) {
      updateFlowChart()
    }
  }, 60000)
})

watch(showFlowChart, (val) => {
  if (val) {
    nextTick(() => {
      initChart()
    })
  } else {
    chartInstance?.dispose()
    chartInstance = null
  }
})

watch(showBarChart, (val) => {
  if (val) {
    nextTick(() => {
      initBarChart()
    })
  } else {
    barChartInstance?.dispose()
    barChartInstance = null
  }
})

watch(showRankChart, (val) => {
  if (val) {
    nextTick(() => {
      initRankChart()
    })
  } else {
    rankChartInstance?.dispose()
    rankChartInstance = null
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  barChartInstance?.dispose()
  rankChartInstance?.dispose()
  if (rankChartTimer) {
    clearInterval(rankChartTimer)
    rankChartTimer = null
  }
  if (flowChartTimer) {
    clearInterval(flowChartTimer)
    flowChartTimer = null
  }
})
</script>

<template>
  <div class="data-panel">
    <!-- 左上：用户信息统计 -->
    <div class="data-card data-card--top-left">
      <div class="card-title user-title">用户信息统计</div>
      <div class="data-card__content">
        <div class="data-grid">
          <div class="data-grid__item data-grid__item--1">
            <div class="grid-label">总进入</div>
            <div class="grid-value">{{ totalEnter }}</div>
          </div>
          <div class="data-grid__item data-grid__item--2">
            <div class="grid-label">总离开</div>
            <div class="grid-value">{{ totalExit }}</div>
          </div>
          <div class="data-grid__item data-grid__item--3">
            <div class="grid-label">现有人数</div>
            <div class="grid-value">{{ totalEnter - totalExit }}</div>
          </div>
          <div class="data-grid__item data-grid__item--4">
            <!-- 预留空位 -->
          </div>
        </div>
      </div>
    </div>

    <!-- 左下：实时人流趋势 -->
    <div class="data-card data-card--bottom-left">
      <div class="card-title">实时人流趋势</div>
      <div class="data-card__content">
        <div class="chart-toggle">
          <span>显示图表</span>
          <div class="toggle-switch" :class="{ active: showFlowChart }" @click="showFlowChart = !showFlowChart"></div>
        </div>
        <div v-if="showFlowChart" ref="chartRef" class="flow-chart"></div>
      </div>
    </div>

    <!-- 右上：每日人流统计 -->
    <div class="data-card data-card--top-right">
      <div class="card-title">每日人流统计</div>
      <div class="data-card__content">
        <div class="chart-toggle">
          <span>显示图表</span>
          <div class="toggle-switch" :class="{ active: showBarChart }" @click="showBarChart = !showBarChart"></div>
        </div>
        <div v-if="showBarChart" ref="barChartRef" class="flow-chart"></div>
      </div>
    </div>

    <!-- 右下：展位聚集人数排行 -->
    <div class="data-card data-card--bottom-right">
      <div class="card-title">展位聚集人数排行</div>
      <div class="data-card__content">
        <div class="chart-toggle">
          <span>显示图表</span>
          <div class="toggle-switch" :class="{ active: showRankChart }" @click="showRankChart = !showRankChart"></div>
        </div>
        <div v-if="showRankChart" ref="rankChartRef" class="flow-chart"></div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.data-panel {
  position: absolute;
  top: 6vw;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 8;
  height: calc(100vh - 6vw);
  pointer-events: none;
  // 标题样式变量
  --title-font-size: 1.5vw;
  --title-top: 6%;
  --title-left: 12%;
}

.data-card {
  position: absolute;
  overflow: hidden;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: auto;
  // 每个模块独立控制大小的CSS变量
  --card-width: 26vw;
  --card-height: calc(38% - 0.5vw);
  width: var(--card-width);
  height: var(--card-height);

  // 统一标题样式
  .card-title {
    position: absolute;
    top: var(--title-top);
    left: var(--title-left);
    color: #fff;
    font-size: var(--title-font-size);
    font-weight: bold;
    text-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
    z-index: 10;
    pointer-events: none;
    white-space: nowrap;
  }

  .user-title {
    top: 17%;
    left: 20%;
  }

  &__content {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }
}

.chart-toggle {
  position: absolute;
  top: 1vw;
  right: 1vw;
  display: flex;
  align-items: center;
  gap: 0.5vw;
  z-index: 2;

  span {
    color: #fff;
    font-size: 12px;
  }

  .toggle-switch {
    width: 2.4vw;
    height: 1.2vw;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 0.6vw;
    position: relative;
    cursor: pointer;
    transition: background 0.3s;

    &::after {
      content: '';
      position: absolute;
      top: 0.1vw;
      left: 0.1vw;
      width: 1vw;
      height: 1vw;
      background: #fff;
      border-radius: 50%;
      transition: left 0.3s;
    }

    &.active {
      background: rgba(0, 212, 255, 0.6);

      &::after {
        left: 1.3vw;
      }
    }
  }
}

/* 左上模块 */
.data-card--top-left {
  --card-width: 32vw;
  --card-height: 50%;
  left: -2vw;
  top: -2vw;
  align-items: flex-end;
  justify-content: space-evenly;
  // 请确保此处替换为不包含文字的纯背景图
  background-image: url('@/assets/1/左上.png');

  // data-grid独立控制（4个小模块容器）
  --grid-width: 50%;
  --grid-height: 42%;
  --grid-gap: 0.6vw;
  --grid-item-label-gap: 0.15vw;

  // 4个小模块独立控制（可以分别调整每个模块的大小和字体）
  // 模块1：总进入
  --item1-width: 90%;
  --item1-height: 90%;
  --item1-label-size: 0.55vw;
  --item1-value-size: 1vw;
  --item1-label-color: rgba(255, 255, 255, 0.7);
  --item1-value-color: #fff;
  --item1-value-shadow: 0 0 6px rgba(0, 212, 255, 0.5);

  // 模块2：总离开
  --item2-width: 90%;
  --item2-height: 90%;
  --item2-label-size: 0.55vw;
  --item2-value-size: 1vw;
  --item2-label-color: rgba(255, 255, 255, 0.7);
  --item2-value-color: #fff;
  --item2-value-shadow: 0 0 6px rgba(0, 212, 255, 0.5);

  // 模块3：现有人数
  --item3-width: 90%;
  --item3-height: 90%;
  --item3-label-size: 0.55vw;
  --item3-value-size: 1vw;
  --item3-label-color: rgba(255, 255, 255, 0.7);
  --item3-value-color: #fff;
  --item3-value-shadow: 0 0 6px rgba(0, 212, 255, 0.5);

  // 模块4：空
  --item4-width: 90%;
  --item4-height: 90%;

  .data-grid {
    width: var(--grid-width);
    height: var(--grid-height);
    margin-top: 3vw;
    grid-column-gap: var(--grid-gap);
    grid-row-gap: 0.3vw;
  }

  .data-grid__item {
    justify-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    // 默认值（可被子类覆盖）
    --item-width: 100%;
    --item-height: 100%;
    --item-label-size: 0.7vw;
    --item-value-size: 1.2vw;
    --item-label-color: rgba(255, 255, 255, 0.7);
    --item-value-color: #fff;
    --item-value-shadow: 0 0 8px rgba(0, 212, 255, 0.6);

    width: var(--item-width);
    height: var(--item-height);

    .grid-label {
      color: var(--item-label-color);
      font-size: var(--item-label-size);
      margin-bottom: var(--grid-item-label-gap);
    }

    .grid-value {
      color: var(--item-value-color);
      font-size: var(--item-value-size);
      font-weight: bold;
      text-shadow: var(--item-value-shadow);
    }

    // 每个模块可以单独覆盖样式
    &--1 {
      width: var(--item1-width);
      height: var(--item1-height);

      .grid-label {
        color: var(--item1-label-color);
        font-size: var(--item1-label-size);
      }

      .grid-value {
        color: var(--item1-value-color);
        font-size: var(--item1-value-size);
        text-shadow: var(--item1-value-shadow);
      }
    }

    &--2 {
      width: var(--item2-width);
      height: var(--item2-height);

      .grid-label {
        color: var(--item2-label-color);
        font-size: var(--item2-label-size);
      }

      .grid-value {
        color: var(--item2-value-color);
        font-size: var(--item2-value-size);
        text-shadow: var(--item2-value-shadow);
      }
    }

    &--3 {
      width: var(--item3-width);
      height: var(--item3-height);

      .grid-label {
        color: var(--item3-label-color);
        font-size: var(--item3-label-size);
      }

      .grid-value {
        color: var(--item3-value-color);
        font-size: var(--item3-value-size);
        text-shadow: var(--item3-value-shadow);
      }
    }

    &--4 {
      width: var(--item4-width);
      height: var(--item4-height);
    }
  }
}

/* 左下模块 */
.data-card--bottom-left {
  --card-width: 26vw;
  --card-height: calc(38% - 0.5vw);
  left: 1vw;
  bottom: 2vw;
  // 请确保此处替换为不包含文字的纯背景图
  background-image: url('@/assets/1/右上.png');
}

/* 右上模块 */
.data-card--top-right {
  --card-width: 26vw;
  --card-height: calc(38% - 0.5vw);
  right: 1vw;
  top: 0;
  // 请确保此处替换为不包含文字的纯背景图
  background-image: url('@/assets/1/右上.png');
}

/* 右下模块 */
.data-card--bottom-right {
  --card-width: 26vw;
  --card-height: calc(38% - 0.5vw);
  right: 1vw;
  bottom: 2vw;
  // 请确保此处替换为不包含文字的纯背景图
  background-image: url('@/assets/1/右上.png');

  .total-data-bottom {
    position: absolute;
    top: 1.5vw;
    left: 1.5vw;
    display: flex;
    gap: 2vw;
    z-index: 2;

    .total-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;

      .total-label {
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.7vw;
        margin-bottom: 0.2vw;
      }

      .total-value {
        color: #00d4ff;
        font-size: 1.2vw;
        font-weight: bold;
        text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
      }
    }
  }
}

.flow-chart {
  width: 100%;
  height: 100%;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 0.8vw;
  width: 80%;
  height: 70%;
  margin-top: 3vw;

  &__item {
    width: 100%;
    height: 100%;
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center;
    border-radius: 0.3vw;

    &--1 {
      background-image: url('@/assets/1/矩形 1.png');
    }

    &--2 {
      background-image: url('@/assets/1/矩形 2.png');
    }

    &--3 {
      background-image: url('@/assets/1/矩形 3.png');
    }

    &--4 {
      background-image: url('@/assets/1/矩形 4.png');
    }
  }
}

/* 响应式：移动端 */
@media screen and (max-width: 768px) {
  .data-panel {
    top: 10vw;
    height: calc(100vh - 10vw);
    // 移动端使用固定像素
    --title-font-size: 14px;
    --title-top: 8px;
    --title-left: 10px;
  }

  .data-card {
    border-radius: 8px;
  }

  // 每个模块独立控制大小
  .data-card--bottom-left {
    --card-width: 40vw;
    --card-height: calc(30% - 0.5vw);
  }

  .data-card--top-right {
    --card-width: 40vw;
    --card-height: calc(30% - 0.5vw);
  }

  .data-card--bottom-right {
    --card-width: 40vw;
    --card-height: calc(30% - 0.5vw);
  }

  .data-card--top-left {
    --card-width: 45vw;
    --card-height: 40%;
  }

  .chart-toggle span {
    font-size: 10px;
  }

  .toggle-switch {
    width: 3vw;
    height: 1.5vw;

    &::after {
      width: 1.3vw;
      height: 1.3vw;
      top: 0.1vw;
      left: 0.1vw;
    }

    &.active::after {
      left: 1.6vw;
    }
  }
}

/* 响应式：3840*1080 超宽屏 */
@media screen and (min-width: 3840px) and (height: 1080px) {
  .data-panel {
    top: 4vw;
    height: calc(100vh - 4vw);
    // 宽屏下调小字号，防止文字过大
    --title-font-size: 0.8vw;
    --title-top: 6%;
    --title-left: 10%;

    .data-card {
      .user-title {
        top: 18%;
        left: 18%;
      }
    }
  }

  // 每个模块独立控制大小
  .data-card--bottom-left {
    --card-width: 19vw;
    --card-height: calc(40% - 0.5vw);
  }

  .data-card--top-right {
    --card-width: 19vw;
    --card-height: calc(40% - 0.5vw);
  }

  .data-card--bottom-right {
    --card-width: 19vw;
    --card-height: calc(40% - 0.5vw);
  }

  .data-card--top-left {
    --card-width: 24vw;
    --card-height: 52%;
    left: -1.5vw;
    --grid-width: 48%;
    --grid-height: 40%;
    --grid-gap: 2vw;
    --grid-item-label-gap: 0.12vw;

    // 4个小模块独立控制
    --item1-width: 88%;
    --item1-height: 88%;
    --item1-label-size: 0.4vw;
    --item1-value-size: 0.85vw;

    --item2-width: 88%;
    --item2-height: 88%;
    --item2-label-size: 0.4vw;
    --item2-value-size: 0.85vw;

    --item3-width: 88%;
    --item3-height: 88%;
    --item3-label-size: 0.4vw;
    --item3-value-size: 0.85vw;

    --item4-width: 88%;
    --item4-height: 88%;
    --item4-label-size: 0.4vw;
    --item4-value-size: 0.85vw;
  }

  .chart-toggle {
    top: 0.4vw;
    right: 0.8vw;

    span {
      font-size: 0.4vw;
    }
  }

  .toggle-switch {
    width: 2vw;
    height: 1vw;

    &::after {
      width: 0.8vw;
      height: 0.8vw;
      top: 0.1vw;
      left: 0.1vw;
    }

    &.active::after {
      left: 1.1vw;
    }
  }
}

/* 其他高分屏适配 */
@media screen and (width: 3170px) and (height: 1622.5px) {
  .data-panel {
    top: 3vw;
    height: calc(100vh - 3vw);
    --title-font-size: 0.8vw;
    --title-top: 5%;
    --title-left: 3.5%;
  }

  // 每个模块独立控制大小
  .data-card--bottom-left {
    --card-width: 23vw;
    --card-height: calc(42% - 0.5vw);
    bottom: 1.5vw;
  }

  .data-card--top-right {
    --card-width: 23vw;
    --card-height: calc(42% - 0.5vw);
  }

  .data-card--bottom-right {
    --card-width: 23vw;
    --card-height: calc(42% - 0.5vw);
    bottom: 1.5vw;
  }

  .data-card--top-left {
    --card-width: 29vw;
    --card-height: 54%;
    left: -1.8vw;
    --grid-width: 50%;
    --grid-height: 42%;
    --grid-item-label-gap: 0.15vw;

    // 4个小模块独立控制
    --item1-width: 88%;
    --item1-height: 88%;
    --item1-label-size: 0.45vw;
    --item1-value-size: 0.95vw;

    --item2-width: 88%;
    --item2-height: 88%;
    --item2-label-size: 0.45vw;
    --item2-value-size: 0.95vw;

    --item3-width: 88%;
    --item3-height: 88%;
    --item3-label-size: 0.45vw;
    --item3-value-size: 0.95vw;

    --item4-width: 88%;
    --item4-height: 88%;
    --item4-label-size: 0.45vw;
    --item4-value-size: 0.95vw;
  }

  .chart-toggle span {
    font-size: 0.45vw;
  }

  .toggle-switch {
    width: 2.2vw;
    height: 1.1vw;

    &::after {
      width: 0.9vw;
      height: 0.9vw;
    }

    &.active::after {
      left: 1.2vw;
    }
  }
}

@media screen and (width: 3128px) and (height: 1760px) {
  .data-panel {
    top: 3vw;
    height: calc(100vh - 2.5vw);
    --title-font-size: 1.5vw;
    --title-top: 8%;
    --title-left: 12%;

    .data-card {
      .user-title {
        top: 18%;
        left: 20%;
      }
    }
  }

  // 每个模块独立控制大小
  .data-card--bottom-left {
    --card-width: 24vw;
    --card-height: calc(40% - 0.5vw);
    left: 0.5vw;
    bottom: 1vw;
  }

  .data-card--top-right {
    --card-width: 24vw;
    --card-height: calc(40% - 0.5vw);
    top: 4.5vw;
  }

  .data-card--bottom-right {
    --card-width: 24vw;
    --card-height: calc(40% - 0.5vw);
    right: 0.5vw;
    bottom: 1vw;
  }

  // 左上卡片：4个小模块需要显示全
  .data-card--top-left {
    --card-width: 30vw;
    --card-height: 52%;
    left: -2vw;
    top: 1vw;
    // data-grid缩小让4个小模块能完整显示
    --grid-width: 45%;
    --grid-height: 35%;
    --grid-gap: 1.2vw;
    --grid-item-label-gap: 0.12vw;

    // 4个小模块独立控制
    --item1-width: 85%;
    --item1-height: 85%;
    --item1-label-size: 0.42vw;
    --item1-value-size: 0.9vw;

    --item2-width: 85%;
    --item2-height: 85%;
    --item2-label-size: 0.42vw;
    --item2-value-size: 0.9vw;

    --item3-width: 85%;
    --item3-height: 85%;
    --item3-label-size: 0.42vw;
    --item3-value-size: 0.9vw;

    --item4-width: 85%;
    --item4-height: 85%;
    --item4-label-size: 0.42vw;
    --item4-value-size: 0.9vw;
  }

  .chart-toggle span {
    font-size: 0.5vw;
  }

  .toggle-switch {
    width: 2.4vw;
    height: 1.2vw;

    &::after {
      width: 1vw;
      height: 1vw;
    }

    &.active::after {
      left: 1.3vw;
    }
  }
}

@media screen and (width: 11520px) and (height: 2160px) {
  .data-panel {
    top: 1.5vw;
    height: calc(100vh - 1.5vw);
    --title-font-size: 0.3vw;
    --title-top: 4%;
    --title-left: 2.5%;
  }

  // 每个模块独立控制大小
  .data-card--bottom-left {
    --card-width: 20vw;
    --card-height: calc(42% - 0.5vw);
    left: 0.5vw;
    bottom: 1vw;
  }

  .data-card--top-right {
    --card-width: 20vw;
    --card-height: calc(42% - 0.5vw);
  }

  .data-card--bottom-right {
    --card-width: 20vw;
    --card-height: calc(42% - 0.5vw);
    right: 0.5vw;
    bottom: 1vw;
  }

  .data-card--top-left {
    --card-width: 26vw;
    --card-height: 50%;
    left: -1vw;
    --grid-width: 45%;
    --grid-height: 35%;
    --grid-gap: 1.5vw;
    --grid-item-label-gap: 0.1vw;

    // 4个小模块独立控制
    --item1-width: 85%;
    --item1-height: 85%;
    --item1-label-size: 0.35vw;
    --item1-value-size: 0.8vw;

    --item2-width: 85%;
    --item2-height: 85%;
    --item2-label-size: 0.35vw;
    --item2-value-size: 0.8vw;

    --item3-width: 85%;
    --item3-height: 85%;
    --item3-label-size: 0.35vw;
    --item3-value-size: 0.8vw;

    --item4-width: 85%;
    --item4-height: 85%;
    --item4-label-size: 0.35vw;
    --item4-value-size: 0.8vw;
  }

  .chart-toggle {
    top: 0.5vw;
    right: 0.5vw;

    span {
      font-size: 0.35vw;
    }
  }

  .toggle-switch {
    width: 1.8vw;
    height: 0.9vw;

    &::after {
      width: 0.7vw;
      height: 0.7vw;
      top: 0.1vw;
      left: 0.1vw;
    }

    &.active::after {
      left: 1vw;
    }
  }
}

/* 响应式：5120px * 960px 超宽且较矮屏幕 */
@media screen and (width: 5120px) and (height: 960px) {
  .data-panel {
    top: 1.5vw;
    height: calc(100vh - 1.5vw);
    --title-font-size: 0.6vw;
    --title-top: 5%;
    --title-left: 10%;

    .data-card {
      .user-title {
        top: 18%;
        left: 20%;
      }
    }
  }

  // 每个模块独立控制大小
  .data-card--bottom-left {
    --card-width: 20vw;
    --card-height: calc(40% - 0.5vw);
    left: 1vw;
    bottom: 1vw;
  }

  .data-card--top-right {
    --card-width: 20vw;
    --card-height: calc(40% - 0.5vw);
    top: 2vw;
    right: 4vw;
  }

  .data-card--bottom-right {
    --card-width: 20vw;
    --card-height: calc(40% - 0.5vw);
    right: 4vw;
    bottom: 1vw;
  }

  .data-card--top-left {
    --card-width: 24vw;
    --card-height: 55%;
    left: -1vw;
    top: 0.5vw;

    .data-grid {
      // width: var(--grid-width);
      // height: var(--grid-height);
      margin-top: 1.2vw;

      // grid-column-gap: var(--grid-gap);
      // grid-row-gap: 0.3vw;
      .data-grid__item {
        .grid-label {
          font-size: 0.3vw;
        }

        .grid-value {
          font-size: 0.5vw;
        }
      }
    }

    --grid-width: 50%;
    --grid-height: 42%;
    --grid-gap: 1.2vw;
    --grid-item-label-gap: 0.12vw;

    // 4个小模块独立控制
    --item1-width: 85%;
    --item1-height: 85%;
    --item1-label-size: 0.42vw;
    --item1-value-size: 0.9vw;

    --item2-width: 85%;
    --item2-height: 85%;
    --item2-label-size: 0.42vw;
    --item2-value-size: 0.9vw;

    --item3-width: 85%;
    --item3-height: 85%;
    --item3-label-size: 0.42vw;
    --item3-value-size: 0.9vw;

    --item4-width: 85%;
    --item4-height: 85%;
    --item4-label-size: 0.42vw;
    --item4-value-size: 0.9vw;
  }

  .chart-toggle {
    top: 0.5vw;
    right: 1vw;

    span {
      font-size: 0.42vw;
    }
  }

  .toggle-switch {

    // width: 1vw;
    // height: 1vw;
    &::after {
      width: 0.8vw;
      height: 0.8vw;
      top: 0.1vw;
      left: 0.1vw;
    }

    &.active::after {
      left: 1.1vw;
    }
  }
}

/* 响应式：5752*1076 超宽屏 */
@media screen and (min-width: 5744px) and (max-width: 5776px) and (min-height: 1064px) and (max-height: 1092px) {
  .data-panel {
    top: 1.5vw;
    height: calc(100vh - 1.5vw);

    // 标题：0.55vw ≈ 31px，在 5 米外可清晰阅读
    --title-font-size: 0.55vw;
    --title-top: 5%;
    --title-left: 10%;

    .data-card {
      .user-title {
        top: 18%;
        left: 20%;
      }
    }
  }

  // ===== 左下：实时人流趋势 =====
  .data-card--bottom-left {
    --card-width: 20vw;
    --card-height: calc(42% - 0.5vw);
    left: 1vw;
    bottom: 1vw;
  }

  // ===== 右上：每日人流统计 =====
  .data-card--top-right {
    --card-width: 20vw;
    --card-height: calc(42% - 0.5vw);
    top: 2vw;
    right: 4vw;
  }

  // ===== 右下：展位聚集人数排行 =====
  .data-card--bottom-right {
    --card-width: 20vw;
    --card-height: calc(42% - 0.5vw);
    right: 4vw;
    bottom: 1vw;

    .total-data-bottom {
      top: 1.2vw;
      left: 1.2vw;
      gap: 1.5vw;

      .total-label {
        font-size: 0.4vw;
        margin-bottom: 0.15vw;
      }

      .total-value {
        font-size: 0.85vw;
      }
    }
  }

  // ===== 左上：用户信息统计（4个小模块需完整显示） =====
  .data-card--top-left {
    --card-width: 25vw;
    --card-height: 55%;
    left: -1vw;
    top: 0.5vw;

    // grid 缩小，保证 4 个小模块完整可见
    --grid-width: 50%;
    --grid-height: 42%;
    --grid-gap: 1.2vw;
    --grid-item-label-gap: 0.12vw;

    // 4 个小模块独立控制（标签 0.38vw≈22px，数值 0.75vw≈43px）
    --item1-width: 85%;
    --item1-height: 85%;
    --item1-label-size: 0.38vw;
    --item1-value-size: 0.75vw;

    --item2-width: 85%;
    --item2-height: 85%;
    --item2-label-size: 0.38vw;
    --item2-value-size: 0.75vw;

    --item3-width: 85%;
    --item3-height: 85%;
    --item3-label-size: 0.38vw;
    --item3-value-size: 0.75vw;

    --item4-width: 85%;
    --item4-height: 85%;
    --item4-label-size: 0.38vw;
    --item4-value-size: 0.75vw;

    .data-grid {
      margin-top: 1.5vw;
    }
  }

  // ===== 图表显示开关 =====
  .chart-toggle {
    top: 0.5vw;
    right: 1vw;
    gap: 0.4vw;

    span {
      font-size: 0.42vw; // ≈ 24px
    }
  }

  .toggle-switch {
    width: 2vw;
    height: 1vw;

    &::after {
      width: 0.8vw;
      height: 0.8vw;
      top: 0.1vw;
      left: 0.1vw;
    }

    &.active::after {
      left: 1.1vw;
    }
  }
}
</style>
