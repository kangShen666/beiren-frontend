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
            const id = d.id;
            const type = d.class;
            const direction = d.direction;
            const cameraName = d.cameraName;
            nIds.push(id);

            // 更新该ID的最后活跃时间
            this.lastIdUpdateTime[id] = new Date().getTime();

            const position = Cesium.Cartesian3.fromDegrees(parseFloat(d.x.toFixed(5)), parseFloat(d.y.toFixed(5)), 0);
            // console.log(parseFloat(d.x.toFixed(8)), parseFloat(d.y.toFixed(8)));

            // 已存在的模型：更新位置
            if (this.eleIds.includes(id)) {
                const el = this.getById(id);
                if (el) {
                    // 补全text属性（如果未设置）
                    if (!el.text) el.text = this.cartext;
                    el.addPosition(position, interval);
                }
            }
            // 新模型：创建实例
            else {
                const newModel = new Model(id, this.viewer, type, position, '', direction, cameraName);
                if (newModel && newModel.animateEntity) {
                    this.eles.push(newModel);
                    this.eleIds.push(id);
                    console.log(`新增模型ID: ${id}，当前总数: ${this.eleIds.length}`);
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
            console.log(`删除超时模型ID: ${id}，剩余总数: ${this.eleIds.length}`);
        });

        console.log("当前有效模型ID数量:", this.eleIds.length);
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

        // 3. 兜底：清理Viewer中残留的实体（按ID过滤）
        this.viewer.entities.values.forEach(entity => {
            if (entity.id && this.lastIdUpdateTime[entity.id] !== undefined) {
                this.viewer.entities.remove(entity);
            }
        });

        console.log("所有模型已彻底移除，当前实例数：", this.eles.length);
    }
}

// 模型类（核心修改：1.direction1/2不修改朝向 2.新增direction0按运动轨迹调整朝向）
class Model {
    constructor(id, viewer, type, position, text, direction, cameraName) {
        this.viewer = viewer;
        this.type = type;
        this.position = position;
        this.id = id;
        this.text = text;
        this.direction = direction; // 新增0值支持
        this.cameraName = cameraName;
        this.property = null;          // 位置插值属性
        this.animateEntity = null;     // Cesium实体
        this.fixedOrientation = null;  // 固定朝向（仅direction1/2的车辆使用）

        // ========== 核心修改1：删除false，让direction1/2的朝向逻辑生效 ==========
        let initialHeading = Cesium.Math.toRadians(0); 
        if (this.direction == 1 || this.direction == 2) { // 移除了无效的false判断
            if (this.cameraName == "59" || this.cameraName == "52" || this.cameraName == "53" || this.cameraName == "54") {
                if (this.direction == 1) {
                    initialHeading = Cesium.Math.toRadians(235);
                } else if (this.direction == 2) {
                    initialHeading = Cesium.Math.toRadians(55); // 现在能正确生效
                }
            } else if (this.cameraName == "51" || this.cameraName == "55") {
                if (this.direction == 1) {
                    initialHeading = Cesium.Math.toRadians(150);
                } else if (this.direction == 2) {
                    initialHeading = Cesium.Math.toRadians(-30);
                }
            } else if (this.cameraName == "56" || this.cameraName == "57" || this.cameraName == "58") {
                if (this.direction == 1) {
                    initialHeading = Cesium.Math.toRadians(55);
                } else if (this.direction == 2) {
                    initialHeading = Cesium.Math.toRadians(235);
                }
            }
        }
        // direction0时，初始朝向仍为0，后续按运动轨迹自动调整
        const initialOrientation = Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(initialHeading, 0, 0)
        );

        // 创建车辆模型
        if (type === "car") {
            // ========== 核心修改2：仅direction1/2设置固定朝向 ==========
            if (this.direction == 1 || this.direction == 2) {
                this.fixedOrientation = initialOrientation;
            }
            this.animateEntity = this.viewer.entities.add({
                position: position,
                orientation: this.fixedOrientation || undefined, // direction0时暂不设置orientation
                id: id,
                // ========== 核心修改3：添加车模型ID标题 ==========
                label: {
                    text: id.toString(), // 显示模型ID
                    font: '14pt 微软雅黑', // 字体样式
                    fillColor: Cesium.Color.WHITE, // 填充色
                    outlineColor: Cesium.Color.BLACK, // 描边色
                    outlineWidth: 2, // 描边宽度
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE, // 填充+描边
                    pixelOffset: new Cesium.Cartesian2(0, -30), // 标题在模型上方30像素
                    eyeOffset: new Cesium.Cartesian3(0, 0, 0),
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER, // 水平居中
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM, // 垂直底部对齐
                    scaleByDistance: new Cesium.NearFarScalar(100, 1, 2000, 0.5), // 距离缩放（近大远小）
                    show: true // 显示标题
                },
                model: {
                    uri: "/model/silver.glb",
                    scale: 0.9,
                    animations: {
                        enabled: true,
                        loop: Cesium.ModelAnimationLoop.REPEAT,
                        speedup: 8.0
                    }
                },
            });
        }
        // 创建行人模型
        else if (type === "person") {
            this.animateEntity = this.viewer.entities.add({
                position: position,
                orientation: initialOrientation,
                id: id,
                model: {
                    uri: "/model/man/walk.gltf",
                    scale: 0.9,
                    minimumPixelSize: 16,
                    maximumScale: 10000,
                    animations: {
                        enabled: true,
                        loop: Cesium.ModelAnimationLoop.REPEAT,
                        speedup: 8.0
                    }
                },
            });
        }

        // 校验实体创建结果
        if (!this.animateEntity) {
            console.error(`模型${id}创建失败，实体未生成`);
        }
    }

    // 更新模型位置（插值）
    addPosition(position, interval) {
        let currentTime = this.viewer.clock.currentTime.clone();
        if (!this.property) {
            this.createPositionProperty(currentTime);
        }
        const julianDate = Cesium.JulianDate.addSeconds(currentTime, interval, new Cesium.JulianDate());
        this.property.addSample(julianDate, position);
    }

    // ========== 核心修改点3：新增direction0的车辆按运动轨迹调整朝向 ==========
    // 创建位置插值属性
    createPositionProperty(currentTime) {
        this.property = new Cesium.SampledPositionProperty();
        this.property.addSample(currentTime.clone(), this.position);
        this.animateEntity.position = this.property;

        // 行人模型 或 direction为0的车辆模型：根据速度自动调整朝向（运动轨迹）
        if (this.type === "person" || (this.type == "car" && this.direction == 0)) {
            this.animateEntity.orientation = new Cesium.VelocityOrientationProperty(this.property);
        }
    }

    // 统一的移除方法（彻底释放资源）
    removeAll() {
        // 移除Cesium实体（核心）
        if (this.animateEntity) {
            this.viewer.entities.remove(this.animateEntity);
        }
        // 释放内存，防止泄漏
        this.property = null;
        this.fixedOrientation = null;
        this.animateEntity = null;
        this.viewer = null;
    }
}

export default ModelCol;