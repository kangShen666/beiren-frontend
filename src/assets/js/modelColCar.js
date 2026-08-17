import * as Cesium from "cesium";

class ModelCol {
    constructor(viewer) {
        this.viewer = viewer;
        this.eleIds = [];        // 已创建模型的ID数组
        this.eles = [];          // 模型实例数组
        this.cartext = null;
        this.cam1 = {};
        this.cam2 = {};
        this.plate_trig_contour = [
            [121.7871397351, 31.3546211387],
            [121.7870451224, 31.3546222572],
            [121.7870378774, 31.3544564523],
            [121.7871345648, 31.3544610000]
        ];
        this.cnt = 0;
        this.lastDate = null;
        this.lastIdUpdateTime = {}; // 记录每个ID最后更新时间
        // 新增：类型映射表（适配数字类型的class字段）
        this.typeMap = {
            1: "car",    // 数字1对应车辆
            2: "person", // 数字2对应行人（可根据实际情况调整）
            "1": "car",  // 兼容字符串"1"
            "2": "person",
            "car": "car",
            "person": "person"
        };
    }

    // 计算两个经纬度坐标之间的地表距离（单位：米）
    calculateDistance(lon1, lat1, lon2, lat2) {
        // 使用Cesium的椭球表面距离计算方法
        const carto1 = Cesium.Cartesian3.fromDegrees(lon1, lat1, 0);
        const carto2 = Cesium.Cartesian3.fromDegrees(lon2, lat2, 0);
        return Cesium.Cartesian3.distance(carto1, carto2);
    }

    // 更新数据 skip=30
    update(data, skip = 30) {
        // console.log("更新数据:", data);
        let interval = 0;
        // 计算时间间隔（用于位置插值）
        if (!this.lastDate) {
            this.lastDate = new Date().getTime();
        } else {
            const cDate = new Date().getTime();
            interval = (cDate - this.lastDate) / 600 + 1;
            this.lastDate = cDate;
        }

        const nIds = [];          // 本次更新的ID集合
        const persons = data || [];

        // 空数据时直接清空所有模型
        if (persons.length === 0) {
            this.removeAll();
            console.log("无数据，已清空所有模型，当前id数组长度：", this.eleIds.length);
            return;
        }

        // 1. 处理新增/更新的模型
        persons.forEach(d => {
            // 关键修复1：增加数据合法性校验
            if (!d.id || d.x === undefined || d.y === undefined) {
                console.warn("数据不完整，跳过创建模型:", d);
                return;
            }
            
            const id = d.id;
            // 关键修复2：使用类型映射表转换数字类型的class字段
            const originalType = d.class;
            const type = this.typeMap[originalType] || "car"; // 未知类型默认按车辆处理
            const direction = d.direction || 0; // 关键修复3：设置默认方向，避免undefined
            const cameraName = d.cameraName || "";
            
            // 打印类型转换日志，方便调试
            if (originalType !== type) {
                console.log(`模型${id}类型转换: ${originalType} -> ${type}`);
            }
            
            nIds.push(id);

            // 更新该ID的最后活跃时间
            this.lastIdUpdateTime[id] = new Date().getTime();

            // 关键修复4：修复坐标转换的精度问题，增加异常捕获
            let position;
            try {
                const lon = parseFloat(d.x);
                const lat = parseFloat(d.y);
                // 校验坐标有效性
                if (isNaN(lon) || isNaN(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                    console.warn(`坐标无效，跳过模型${id}:`, d.x, d.y);
                    return;
                }

                position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
            } catch (e) {
                console.error(`坐标转换失败，模型${id}:`, e);
                return;
            }

            // 已存在的模型：更新位置
            if (this.eleIds.includes(id)) {
                const el = this.getById(id);
                if (el) {
                    // ========== 新增：距离判断逻辑 ==========
                    // 获取模型当前位置的经纬度
                    const currentPosition = el.animateEntity?.position?.getValue(this.viewer.clock.currentTime) || el.position;
                    if (currentPosition) {
                        // 将笛卡尔坐标转换为经纬度
                        const cartographic = Cesium.Cartographic.fromCartesian(currentPosition);
                        const currentLon = Cesium.Math.toDegrees(cartographic.longitude);
                        const currentLat = Cesium.Math.toDegrees(cartographic.latitude);
                        
                        // 计算新坐标与当前坐标的距离（米）
                        const distance = this.calculateDistance(currentLon, currentLat, parseFloat(d.x), parseFloat(d.y));
                        
                        // 距离小于等于1米，不更新位置，直接返回
                        if (distance <= 1) {
                            // console.log(`模型${id}移动距离${distance.toFixed(2)}米，小于1米，保持不动`);
                            return;
                        }
                    }
                    // ========== 距离判断逻辑结束 ==========

                    // 补全text属性（如果未设置）
                    if (!el.text) el.text = this.cartext;
                    el.addPosition(position, interval);
                }
            }
            // 新模型：创建实例
            else {
                try {
                    const newModel = new Model(id, this.viewer, type, position, '', direction, cameraName);
                    // 关键修复5：调整实体有效性判断逻辑
                    if (newModel && newModel.animateEntity && newModel.animateEntity.id !== undefined) {
                        this.eles.push(newModel);
                        this.eleIds.push(id);
                        // console.log(`新增模型ID: ${id}，类型: ${type}，当前总数: ${this.eleIds.length}`);
                    } else {
                        // console.error(`模型${id}实体创建无效`, newModel);
                    }
                } catch (e) {
                    // console.error(`创建模型${id}失败:`, e);
                }
            }
        });

        // 2. 延迟删除逻辑（核心修复）
        // 规则：3秒未更新 且 不在本次更新列表中的ID，执行删除
        const currentTime = new Date().getTime();
        const needDeleteIds = [];

        // 遍历所有已存在的ID，筛选需要删除的
        this.eleIds.forEach(id => {
            const lastUpdate = this.lastIdUpdateTime[id] || 0;
            const isTimeout = currentTime - lastUpdate > 3000; // 3秒超时
            const isNotInNewData = !nIds.includes(id);

            if (isTimeout && isNotInNewData) {
                needDeleteIds.push(id);
            }
        });

        // 批量删除超时且未更新的模型
        needDeleteIds.forEach(id => {
            this.removeById(id);
            // 从ID数组中移除（使用filter保证准确性，避免indexOf的坑）
            this.eleIds = this.eleIds.filter(item => item !== id);
            // 删除时间记录
            delete this.lastIdUpdateTime[id];
            // console.log(`删除超时模型ID: ${id}，剩余总数: ${this.eleIds.length}`);
        });

        // console.log("当前有效模型ID数量:", this.eleIds.length);
    }

    // 根据ID精准查找模型实例
    getById(id) {
        return this.eles.find(el => el && el.id === id) || null;
    }

    // 点是否在多边形内（保留原逻辑）
    pointInPolygon(point, polygon) {
        let x = point[0], y = point[1];
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            let xi = polygon[i][0], yi = polygon[i][1];
            let xj = polygon[j][0], yj = polygon[j][1];

            let intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    };

    // 根据ID删除模型（修复索引错乱问题）
    removeById(id) {
        // 倒序遍历，避免删除元素后索引偏移
        for (let i = this.eles.length - 1; i >= 0; i--) {
            const el = this.eles[i];
            if (el && el.id === id) {
                // 强制释放模型资源
                el.removeAll();
                // 从数组中移除
                this.eles.splice(i, 1);
                break;
            }
        }
    }

    // 移除所有模型（彻底释放资源）
    removeAll() {
        // 1. 倒序遍历删除所有模型实例
        for (let i = this.eles.length - 1; i >= 0; i--) {
            const el = this.eles[i];
            if (el) {
                el.removeAll(); // 调用实例的移除方法
                this.eles.splice(i, 1);
            }
        }

        // 2. 清空所有缓存和状态
        this.eleIds = [];
        this.lastIdUpdateTime = {};
        this.lastDate = null;
        this.cnt = 0;

        // 3. 兜底：清理Viewer中残留的实体（优化判断逻辑）
        this.viewer.entities.values.forEach(entity => {
            if (entity.id && typeof entity.id === 'number' && !this.eleIds.includes(entity.id)) {
                this.viewer.entities.remove(entity);
            }
        });

        // console.log("所有模型已彻底移除，当前实例数：", this.eles.length);
    }
}

// 模型类（核心修改：修复实体创建失败问题 + 新增label距离显示控制）
class Model {
    constructor(id, viewer, type, position, text, direction, cameraName) {
        this.viewer = viewer;
        this.type = type;
        this.position = position;
        this.id = id;
        this.text = text;
        this.direction = direction || 0; // 确保direction有默认值
        this.cameraName = cameraName || "";
        this.property = null;          // 位置插值属性
        this.animateEntity = null;     // Cesium实体
        this.fixedOrientation = null;  // 固定朝向（仅direction1/2的车辆使用）

        // 关键修复6：增加前置校验
        if (!viewer || !position) {
            console.error(`模型${id}创建失败：viewer或position为空`);
            return;
        }

        // 计算初始朝向
        let initialHeading = Cesium.Math.toRadians(0); 
        if (this.direction == 1 || this.direction == 2) {
            if (["59", "52", "53", "54"].includes(this.cameraName)) {
                initialHeading = this.direction == 1 ? Cesium.Math.toRadians(235) : Cesium.Math.toRadians(55);
            } else if (["51", "55"].includes(this.cameraName)) {
                initialHeading = this.direction == 1 ? Cesium.Math.toRadians(150) : Cesium.Math.toRadians(-30);
            } else if (["56", "57", "58"].includes(this.cameraName)) {
                initialHeading = this.direction == 1 ? Cesium.Math.toRadians(55) : Cesium.Math.toRadians(235);
            }
        }
        
        const initialOrientation = Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(initialHeading, 0, 0)
        );

        try {
            // ========== 核心修改：定义label配置（统一应用到车和人） ==========
            const labelOptions = {
                // text: id.toString(),
                font: '14pt 微软雅黑',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -30),
                eyeOffset: new Cesium.Cartesian3(0, 0, 0),
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                // 移除scaleByDistance，改用distanceDisplayCondition精确控制显示
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300), // 0-500米显示，超过500米隐藏
                show: true
            };

            // 创建车辆模型
            if (type === "car") {
                // 设置固定朝向
                if (this.direction == 1 || this.direction == 2) {
                    this.fixedOrientation = initialOrientation;
                }
                
                // 关键修复7：优化实体创建逻辑，确保必选属性完整
                this.animateEntity = this.viewer.entities.add({
                    id: id, // 显式设置ID，确保唯一性
                    position: position,
                    orientation: this.fixedOrientation || undefined,
                    label: labelOptions, // 使用统一的label配置
                    model: {
                        uri: "/model/silver.glb",
                        scale: 0.9,
                        minimumPixelSize: 32, // 增大最小像素尺寸，确保模型可见
                        maximumScale: 10000,
                        allowPicking: true, // 允许拾取，方便调试
                        runAnimations: true,
                        animations: {
                            enabled: true,
                            loop: Cesium.ModelAnimationLoop.REPEAT,
                            speedup: 8.0
                        },
                        show: true // 显式设置显示模型
                    },
                });
            }
            // 创建行人模型
            else if (type === "person") {
                this.animateEntity = this.viewer.entities.add({
                    id: id, // 显式设置ID
                    position: position,
                    orientation: initialOrientation,
                    label: labelOptions, // 使用统一的label配置（行人也应用500米显示规则）
                    model: {
                        uri: "/model/man/walk.gltf",
                        scale: 0.9,
                        minimumPixelSize: 32,
                        maximumScale: 10000,
                        allowPicking: true,
                        runAnimations: true,
                        animations: {
                            enabled: true,
                            loop: Cesium.ModelAnimationLoop.REPEAT,
                            speedup: 8.0
                        },
                        show: true
                    },
                });
            } else {
                console.warn(`模型${id}类型不支持: ${type}`);
                return;
            }

            // 验证实体是否真的创建成功
            if (!this.animateEntity) {
                console.error(`模型${id}实体创建返回null`);
            } else {
                // 关键修复8：强制刷新实体显示
                this.animateEntity.show = true;
                if (this.animateEntity.model) {
                    this.animateEntity.model.show = true;
                }
                // console.log(`模型${id}实体创建成功，类型: ${type}，模型URI: ${this.animateEntity.model?.uri}`);
            }

        } catch (e) {
            // console.error(`模型${id}创建异常:`, e);
            this.animateEntity = null;
        }
    }

    // 更新模型位置（插值）
    addPosition(position, interval) {
        // 增加参数校验
        if (!position || isNaN(interval)) return;
        
        let currentTime = this.viewer.clock.currentTime.clone();
        if (!this.property) {
            this.createPositionProperty(currentTime);
        }
        const julianDate = Cesium.JulianDate.addSeconds(currentTime, interval, new Cesium.JulianDate());
        this.property.addSample(julianDate, position);
    }

    // 创建位置插值属性
    createPositionProperty(currentTime) {
        if (!currentTime) return;
        
        this.property = new Cesium.SampledPositionProperty();
        this.property.addSample(currentTime.clone(), this.position);
        this.animateEntity.position = this.property;

        // 行人模型 或 direction为0的车辆模型：根据速度自动调整朝向
        if (this.type === "person" || (this.type == "car" && this.direction == 0)) {
            this.animateEntity.orientation = new Cesium.VelocityOrientationProperty(this.property);
        }
    }

    // 统一的移除方法（彻底释放资源）
    removeAll() {
        try {
            // 移除Cesium实体
            if (this.animateEntity) {
                this.viewer.entities.remove(this.animateEntity);
            }
        } catch (e) {
            console.error(`移除模型${this.id}失败:`, e);
        }
        // 释放内存
        this.property = null;
        this.fixedOrientation = null;
        this.animateEntity = null;
        this.viewer = null;
    }
}

export default ModelCol;