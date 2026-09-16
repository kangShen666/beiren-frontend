/**
 * modelColUnified.js —— v3 最终版（可直接整体替换）
 *
 * 新增能力（相对 v2）：
 * 1. 前向标定偏移 forwardOffsetDeg：修正 glb 车头/人头建模轴与 Cesium 正北的夹角，
 *    解决"车横着滑、不朝运动方向"的问题；
 * 2. 相机固定朝向表 camHeadingConfig 可配置化，按新地图重新标定即可；
 * 3. 跳变/限速保护：相邻锚点隐含速度超过 maxSpeedMps，或单次跳变超过 maxJumpM
 *    → 直接 snap 到新位置（不做插值），消除"模型从一处快速滑到另一处"的瞬移观感；
 * 4. 插值时长随距离自适应（0.6~2 秒），远距离移动更自然；
 * 5. 低速目标不更新朝向，避免原地抖动摇头。
 */
import * as Cesium from "cesium"

const TYPE_MAP = {
  1: "car",
  2: "person",
  car: "car",
  person: "person",
}

/**
 * 相机固定朝向标定表：
 * key = cameraName, value = [direction===1 时的朝向°, direction===2 时的朝向°]
 * 标定的是"车头指向的罗盘方位角"（正北=0，顺时针）。
 * ★★ 以下为示例值，请按第六节标定步骤对新地图实测校准后替换 ★★
 */
const CAM_HEADING_CONFIG = {
  51: [150, -30],
  55: [150, -30],
  52: [235, 55],
  53: [235, 55],
  54: [235, 55],
  59: [235, 55],
  11456: [55, 235],
  11457: [55, 235],
  11458: [55, 235],
  814: [55, 235],
  903: [150, -30],
  5353: [145, 55],
  5357: [145, 55],
}

const DEFAULTS = {
  channelKey: "ch",
  resolveType: cls => TYPE_MAP[cls] || "car",
  /** 高度函数：按数据决定初始/更新高度（xuting 用它区分一楼/二楼） */
  positionHeight: () => 0,
  carModelUri: "/model/silver.glb",
  personModelUri: "/model/man/walk.gltf",
  modelScale: 0.9,
  labelText: null, // (d) => string | null，需要标签时再开
  camHeadingConfig: CAM_HEADING_CONFIG,

  /* ===== 前向标定偏移（deg，绕竖轴补角） =====
     * silver.glb 车头若默认朝东(+X)填 90；朝南填 180；朝西填 -90。walk.gltf 同理。
     * 标定方法见文末第六节。 */
  carForwardOffsetDeg: 0,
  personForwardOffsetDeg: 0,

  /** 位移迟滞阈值（米）：与锚点距离超过它才更新。量化噪声大的通道调大（1.5~2） */
  moveThreshold: 1.2,

  /* ===== 跳变/限速保护 ===== */
  /** 单次位移超过该值(米)视为跳变 → snap 不插值 */
  maxJumpM: 40,
  /** 相邻两次锚点的隐含速度超过该值(m/s)视为数据跳变 → snap */
  maxSpeedMps: 15,
  /** 运动方向朝向的最小速度(m/s)：低于它不更新朝向（防低速抖动摇头） */
  minSpeedForHeading: 0.8,

  /** 超时先隐藏（毫秒） */
  staleHideTimeout: 4000,
  /** 超时物理删除（毫秒），必须 > staleHideTimeout */
  removeTimeout: 10000,
  /** 单层最大同时跟踪目标数，超出忽略新 id */
  maxTargets: 260,
  debug: false,
}

/** 小范围经纬度近似测距（米） */
function approxDistMeters(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * 111320
  const dLon = (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180)
  return Math.sqrt(dLon * dLon + dLat * dLat)
}

/** 同类告警 1 秒最多打一条，避免高频刷屏拖垮主线程 */
const warnGate = { last: 0, msg: "" }
function warnOnce(msg) {
  const now = Date.now()
  if (msg === warnGate.msg && now - warnGate.last < 1000) { return }
  warnGate.last = now
  warnGate.msg = msg
  console.warn(msg)
}

/* ============================ 单个目标 ============================ */

class Target {
  constructor(rawId, entityId, viewer, opts, d, lon, lat) {
    this.rawId = rawId
    this.entityId = entityId
    this.viewer = viewer
    this.opts = opts

    this.type = opts.resolveType(d.class)
    this.direction = d.direction || 0
    this.cameraName = d.cameraName || ""
    this.height = opts.positionHeight(d)

    // 该模型的前向标定偏移（弧度）。实际 heading = 目标方位角 + 此偏移
    this.forwardOffset = Cesium.Math.toRadians(
      this.type === "person" ? opts.personForwardOffsetDeg : opts.carForwardOffsetDeg,
    )

    // 锚点 = 上次真正采用的位置（迟滞判断的固定基准）
    this.anchorLon = lon
    this.anchorLat = lat
    this.anchorTime = Date.now() // 锚点时间：用于隐含速度计算

    // 插值状态（经纬度线性插值，小范围足够精确）
    this.fromLon = lon
    this.fromLat = lat
    this.toLon = lon
    this.toLat = lat
    this.moveStart = null
    this.moving = false
    this.moveDur = opts.moveDuration || 1.0
    this.curCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, this.height)

    // 上一帧位置：用于计算运动方位角
    this.prevLon = lon
    this.prevLat = lat

    this.heading = 0 // 当前罗盘方位角（未加前向偏移）
    this.lastSeen = Date.now()
    this.staleHidden = false
    this.fixedHeading = this.computeFixedHeading()
    this.entity = this.createEntity()
  }

  /** direction 1/2 的车辆固定朝向：查可配置标定表；未命中返回 null → 用运动朝向 */
  computeFixedHeading() {
    if (this.type !== "car") { return null }
    const dir = Number(this.direction) // 统一转数字
    if (dir !== 1 && dir !== 2) { return null }
    const pair = this.opts.camHeadingConfig[this.cameraName]
    if (!pair) { return null }
    return Cesium.Math.toRadians(dir === 1 ? pair[0] : pair[1])
  }

  /** 统一生成朝向 Property：固定角用 ConstantProperty（零开销），动态角用 CallbackProperty */
  makeOrientationProp() {
    if (this.fixedHeading !== null) {
      // ★ 固定表角度是「模型空间标定值」，当年标定时就含模型轴偏差，
      //   直接使用，不加 forwardOffset（加了就会像 v3 那样把竖车转成横车）
      const q = Cesium.Transforms.headingPitchRollQuaternion(
        this.curCartesian,
        new Cesium.HeadingPitchRoll(this.fixedHeading, 0, 0),
      )
      return new Cesium.ConstantProperty(q)
    }
    return new Cesium.CallbackProperty(time => this.getOrient(time), false)
  }

  createEntity() {
    const isPerson = this.type === "person"
    const labelOptions = {
      font: "14pt 微软雅黑",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -30),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300),
      show: !!this.opts.labelText,
    }
    if (this.opts.labelText) {
      labelOptions.text = String(this.opts.labelText({ id: this.rawId }) ?? "")
    }

    const entityOptions = {
      id: this.entityId,
      position: new Cesium.CallbackProperty(time => this.getPos(time), false),
      label: labelOptions,
      orientation: this.makeOrientationProp(),
      model: {
        uri: isPerson ? this.opts.personModelUri : this.opts.carModelUri,
        scale: this.opts.modelScale,
        minimumPixelSize: 32,
        maximumScale: 10000,
        runAnimations: true,
        show: true,
      },
    }
    return this.viewer.entities.add(entityOptions)
  }

  /** CallbackProperty：当前位置。移动中线性插值，结束后收敛并固化缓存对象 */
  getPos(time) {
    if (!this.moving) { return this.curCartesian }
    const t = Cesium.JulianDate.secondsDifference(time, this.moveStart) / this.moveDur
    if (t >= 1) {
      this.moving = false
      this.curCartesian = Cesium.Cartesian3.fromDegrees(this.toLon, this.toLat, this.height)
      return this.curCartesian
    }
    if (t <= 0) { return this.curCartesian }
    this.curCartesian = Cesium.Cartesian3.fromDegrees(
      this.fromLon + (this.toLon - this.fromLon) * t,
      this.fromLat + (this.toLat - this.fromLat) * t,
      this.height,
    )
    return this.curCartesian
  }

  getOrient(_time) {
    // ★ 动态朝向：atan2 算出的是「地理方位角」（正北=0），
    //   必须叠加 forwardOffset 才能对齐 glb 的建模车头轴 → 修正"横移"
    return Cesium.Transforms.headingPitchRollQuaternion(
      this.curCartesian,
      new Cesium.HeadingPitchRoll(this.heading + this.forwardOffset, 0, 0),
    )
  }

  /** 每帧数据到达：刷新活跃时间；若处于"超时隐藏"状态则直接恢复（无删建闪烁） */
  seen(now) {
    this.lastSeen = now
    if (this.staleHidden) { this.setVisible(true) }
  }

  /** direction/cameraName 变化会影响固定朝向，按需切换 Property */
  applyDirection(direction, cameraName) {
    this.direction = direction
    this.cameraName = cameraName
    const fh = this.computeFixedHeading()
    if (fh === this.fixedHeading) { return }
    this.fixedHeading = fh
    this.entity.orientation = this.makeOrientationProp()
  }

  /**
   * 更新位置（带跳变/限速保护）
   * @param {number} lon
   * @param {number} lat 新坐标纬度
   * @param {number} height   新高度
   * @param {number} now      本次消息时间戳（ms），用于隐含速度计算
   */
  moveTo(lon, lat, height, now) {
    const dist = approxDistMeters(this.anchorLon, this.anchorLat, lon, lat)

    // ===== 跳变/限速保护：隐含速度超限 或 单次位移超限 → snap =====
    const dt = Math.max(0.2, (now - this.anchorTime) / 1000)
    const impliedSpeed = dist / dt
    const isJump = dist > this.opts.maxJumpM || impliedSpeed > this.opts.maxSpeedMps

    // ===== 更新运动方位角（未加前向偏移的地理方位角） =====
    const dLon = lon - this.prevLon
    const dLat = lat - this.prevLat
    if (Math.abs(dLon) + Math.abs(dLat) > 1e-9) {
      // 低速微移不更新朝向，避免原地摇头
      if (dist / dt >= this.opts.minSpeedForHeading) {
        this.heading = Math.atan2(
          dLon * Math.cos((lat * Math.PI) / 180),
          dLat,
        )
      }
    }
    this.prevLon = lon
    this.prevLat = lat

    // 刷新锚点
    this.anchorLon = lon
    this.anchorLat = lat
    this.anchorTime = now
    this.height = height

    if (isJump) {
      // ★ snap：瞬间到位，中途插值状态全部作废（数据本来就是跳的，硬平滑更假）
      this.fromLon = lon
      this.fromLat = lat
      this.toLon = lon
      this.toLat = lat
      this.moving = false
      this.curCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, height)
      if (this.fixedHeading !== null) {
        // 固定角车 snap 后同步刷新 ConstantProperty 里的四元数
        this.entity.orientation = this.makeOrientationProp()
      }
      return
    }

    // ===== 正常平滑插值：时长随距离自适应（远距离给更久，观感自然） =====
    this.moveDur = Math.min(2.0, Math.max(0.6, dist / 12))

    // 从当前插值中的位置出发（保证多段移动连续）
    let curLon = this.anchorLon
    let curLat = this.anchorLat
    if (this.moving) {
      const t = Math.min(
        1,
        Math.max(
          0,
          Cesium.JulianDate.secondsDifference(
            this.viewer.clock.currentTime,
            this.moveStart,
          ) / this.moveDur,
        ),
      )
      curLon = this.fromLon + (this.toLon - this.fromLon) * t
      curLat = this.fromLat + (this.toLat - this.fromLat) * t
    }
    this.fromLon = curLon
    this.fromLat = curLat
    this.toLon = lon
    this.toLat = lat
    this.moveStart = this.viewer.clock.currentTime.clone()
    this.moving = true
  }

  setVisible(v) {
    this.staleHidden = !v
    this.entity.show = v
  }

  destroy() {
    try {
      this.viewer.entities.remove(this.entity)
    }
    catch {
      /* ignore */
    }
    this.entity = null
    this.viewer = null
  }
}

/* ============================ 通道模型层工厂 ============================ */

export default function createModelCol(viewer, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  /** rawId -> Target（Map，O(1) 查找/更新） */
  const targets = new Map()

  function update(data) {
    if (!Array.isArray(data) || data.length === 0) { return } // 空帧不动作，交给超时逻辑
    const now = Date.now()
    const seen = new Set()

    // 批量操作包裹事件挂起，避免每个 add/remove 触发一次中间渲染（闪烁来源之一）
    viewer.entities.suspendEvents()
    try {
      for (const d of data) {
        const id = d?.id
        if (id === undefined || id === null) { continue }
        seen.add(id)

        const lon = Number(d.x)
        const lat = Number(d.y)
        if (
          !Number.isFinite(lon)
          || !Number.isFinite(lat)
          || lon < -180
          || lon > 180
          || lat < -90
          || lat > 90
        ) {
          warnOnce(
            `[ModelCol:${opts.channelKey}] 无效坐标已忽略 id=${id} x=${d.x} y=${d.y}`,
          )
          continue
        }

        const t = targets.get(id)
        if (!t) {
          if (targets.size >= opts.maxTargets) { continue } // 目标数上限保护
          const target = new Target(
            id,
            `${opts.channelKey}:${id}`,
            viewer,
            opts,
            d,
            lon,
            lat,
          )
          targets.set(id, target)
          target.seen(now)
          continue
        }

        t.seen(now)
        if (t.type !== opts.resolveType(d.class)) { continue } // 类型突变视为脏数据
        t.applyDirection(d.direction || 0, d.cameraName || "")

        // 与「锚点」比较的迟滞阈值，抑制 float32 量化噪声
        if (
          approxDistMeters(t.anchorLon, t.anchorLat, lon, lat)
          >= opts.moveThreshold
        ) {
          t.moveTo(lon, lat, opts.positionHeight(d), now)
        }
      }

      // 两段式超时：先隐藏（目标可无闪烁重现），超时更久才物理删除
      for (const [id, t] of targets) {
        if (seen.has(id)) { continue }
        const idle = now - t.lastSeen
        if (!t.staleHidden && idle > opts.staleHideTimeout) { t.setVisible(false) }
        if (idle > opts.removeTimeout) {
          t.destroy()
          targets.delete(id)
          if (opts.debug) { console.log(`[ModelCol:${opts.channelKey}] 移除超时目标 ${id}`) }
        }
      }
    }
    finally {
      viewer.entities.resumeEvents()
    }
  }

  function removeAll() {
    // 只清理本通道自己创建的实体（命名空间隔离），不再全局扫描误删
    viewer.entities.suspendEvents()
    try {
      for (const t of targets.values()) { t.destroy() }
    }
    finally {
      viewer.entities.resumeEvents()
    }
    targets.clear()
  }

  return { update, removeAll }
}

/* ============================ 附录：参数标定指南 ============================
 *
 * 【前向偏移 forwardOffsetDeg 标定（解决"横移"）】
 * 1. 临时把 carForwardOffsetDeg 设为 0，观察一辆沿明显直线移动的车：
 *    - 车头指向运动方向      → 偏移 = 0
 *    - 车头指向运动方向右侧90° → 偏移 = 90（silver.glb 大概率是这种）
 *    - 车头指向正后方        → 180
 *    - 车头指向运动方向左侧90° → -90
 * 2. 选最接近的值后再 ±5~15° 微调到视觉完全对齐。
 * 3. walk.gltf 同理标 personForwardOffsetDeg。
 *
 * 【相机固定朝向表 camHeadingConfig 标定】
 * 找一条南北向道路，direction=1 的车头实际指向罗盘 X° 就填 X；direction=2 反向。
 * 逐相机（51/52/53/55/59）各观察几辆静止车即可。
 * 若希望"在动的车全走运动朝向、只停着的车用固定表"，
 * 可把 minSpeedForHeading 调低并删除表中对应相机条目。
 *
 * 【跳变保护 maxJumpM / maxSpeedMps】
 * 若 snap 频繁触发（正常移动被切成瞬移），说明阈值过小，按现场车速调大；
 * 若仍看到长距离拖影滑行，说明阈值过大，按相机间典型切换距离的 60% 调小。
 * ======================================================================== */
