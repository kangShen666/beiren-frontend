import axios from 'axios'
import { readonly, ref } from 'vue'

/** ===== 接口基础配置（统一维护，换环境只改这里） ===== */
export const FLOW_API_BASE = '/api'
export const FLOW_API_HEADERS = {
  'sp-key': 'e27c3780e7069bda7082a23a489d77587ce309583ed99253f66e1d9833ed1a1d0b5ce86dc6714e9974cf258589139d7b1855e8c9fa2f2c1175ee123a95a23e9b0c23584b8b61f46a98ca0e38d5e58c985832712d6fb1cb56d247ed60d262da1d538a',
}

export interface RealDataItem {
  groupName: string
  enter: number
  exit: number
  groupId: string
  statisticsTime: string
}

export interface FlowArea {
  groupId: string
  rawName: string // 原始名称
  groupName: string // 清洗后的短名称
  enter: number
  exit: number
  current: number // 当前在场人数 enter - exit（不为负）
}

export interface FlowSnapshot {
  totalEnter: number
  totalExit: number
  totalCurrent: number
  areas: FlowArea[]
  updateTime: string // 最近一次成功刷新时间
}

const emptySnapshot = (): FlowSnapshot => ({
  totalEnter: 0,
  totalExit: 0,
  totalCurrent: 0,
  areas: [],
  updateTime: '',
})

/** ===== 模块级单例：所有调用方共享同一份数据、同一个定时器 ===== */
const loading = ref(false)
const errorMsg = ref('')
const snapshot = ref<FlowSnapshot>(emptySnapshot())

let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0
let fetching = false

/** 名称清洗：与 DataPanel 原逻辑保持一致 */
const normalizeName = (name: string) =>
  name.replace('总客流统计组', '').replace('客流统计', '').replace('客流', '').replace('全局场馆', '').trim()

/**
 * 去重：按原始 groupName 去重（样例数据里同名区域存在多个 groupId，
 * 取 statisticsTime 最新的一条，避免同区域人数被重复累加）
 */
const dedupe = (list: RealDataItem[]) => {
  const map = new Map<string, RealDataItem>()
  list.forEach((item) => {
    const old = map.get(item.groupName)
    if (!old || new Date(item.statisticsTime).getTime() > new Date(old.statisticsTime).getTime()) { map.set(item.groupName, item) }
  })
  return [...map.values()]
}

const fetchOnce = async () => {
  if (fetching) { return }
  fetching = true
  loading.value = true
  try {
    const res = await axios.get(`${FLOW_API_BASE}/getRealTimeData`, {
      headers: FLOW_API_HEADERS,
      timeout: 10_000,
    })
    if (res.data?.code === 0 && res.data?.data) {
      const d = res.data.data as { totalEnter?: number, totalExit?: number, realdata?: RealDataItem[] }
      const totalEnter = d.totalEnter ?? 0
      const totalExit = d.totalExit ?? 0
      snapshot.value = {
        totalEnter,
        totalExit,
        totalCurrent: Math.max(0, totalEnter - totalExit),
        areas: dedupe(d.realdata ?? []).map(item => ({
          groupId: item.groupId,
          rawName: item.groupName,
          groupName: normalizeName(item.groupName),
          enter: item.enter ?? 0,
          exit: item.exit ?? 0,
          current: Math.max(0, (item.enter ?? 0) - (item.exit ?? 0)),
        })),
        updateTime: new Date().toLocaleTimeString(),
      }
      errorMsg.value = ''
    }
  }
  catch (e) {
    errorMsg.value = '实时人流数据获取失败'
    console.error('[useFlowData] 获取实时人流数据失败:', e)
  }
  finally {
    fetching = false
    loading.value = false
  }
}

/**
 * 共享实时人流数据源
 * - DataPanel 图表 / Cesium 标签 共用一次轮询，接口只打一份
 * - 引用计数：第一个订阅者触发【立即拉取 + 30s 轮询】；全部退订后自动停止
 */
export function useFlowData(intervalMs = 30_000) {
  const subscribe = () => {
    subscribers++
    if (!timer) {
      fetchOnce()
      timer = setInterval(fetchOnce, intervalMs)
    }
  }
  const unsubscribe = () => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
  return {
    snapshot, // 整体替换式更新，watch 即可感知
    loading: readonly(loading),
    errorMsg: readonly(errorMsg),
    subscribe,
    unsubscribe,
    refresh: fetchOnce,
  }
}
