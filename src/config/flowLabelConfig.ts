/**
 * 实时人流标签统一配置（可维护/可扩展）
 * 新增/调整区域只改这里；match 为 groupName 模糊匹配关键词，命中多个区域时人数自动求和
 */
export interface FlowLabelItem {
  key: string
  label: string // 标签上显示的区域名
  lon: number
  lat: number
  height: number // 悬挂高度（米）
  match: string[] // 匹配 useFlowData 中 groupName/rawName 的关键词
}

/** 标签整体显示缩放：0.9 → 0.3（约为原来的 1/3）；若觉得太小可调 0.35~0.4 */
export const FLOW_LABEL_SCALE = 0.3

export const FLOW_LABEL_CONFIG: FlowLabelItem[] = [
  { key: 'A馆', label: 'A馆', lon: 116.52165, lat: 39.77902, height: 14, match: ['A馆'] },
  { key: 'B馆', label: 'B馆', lon: 116.52112, lat: 39.77966, height: 14, match: ['B馆'] },
  { key: 'C馆', label: 'C馆(新)', lon: 116.52048, lat: 39.78050, height: 30, match: ['新C馆'] },
  { key: '生态连廊', label: '会客厅(连廊)', lon: 116.519617, lat: 39.778954, height: 14, match: ['生态连廊'] },
  { key: '北会议中心', label: '北会议中心', lon: 116.51885, lat: 39.77970, height: 14, match: ['北会议中心', '北人会展'] },
  { key: '会议中心南', label: '会议中心南', lon: 116.520104, lat: 39.778196, height: 14, match: ['会议中心南'] },
//   { key: 'D1馆',       label: 'D1馆',       lon: 116.51780, lat: 39.78110, height: 14, match: ['D1馆'] },
//   { key: 'D2馆',       label: 'D2馆',       lon: 116.51690, lat: 39.78180, height: 14, match: ['D2馆'] },
]

/** 接口出现配置外的新区域时的自动兜底排布（西缘自上而下，每行 3 个） */
export const FLOW_AUTO_LAYOUT = {
  startLon: 116.51730,
  startLat: 39.78090,
  dLon: 0.00042, // 每列间隔
  dLat: -0.00038, // 每行间隔
  perRow: 3,
}
