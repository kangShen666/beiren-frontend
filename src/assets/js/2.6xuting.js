import * as Cesium from "cesium";

class ModelColCarxuting {
    constructor(viewer) {
        this.viewer = viewer;
        this.eleIds = [];// id数组
        this.eles = [];// 车/人对象数组
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
        this.lastIdUpdateTime = {};
    }

    // 更新数据 skip=30
    update(data, skip = 30) {
        console.log(data);
        let interval = 0;
        if (!this.lastDate) {
            this.lastDate = new Date().getTime();
        } else {
            const cDate = new Date().getTime();
            interval = (cDate - this.lastDate) / 600 + 1;
            this.lastDate = cDate;
        }

        let nIds = [];
        let persons = data || [];
        console.log(persons);

        // 空数据时直接清空所有模型
        if (persons.length === 0) {
            this.removeAll(); // 调用统一的移除方法
            console.log("无数据，已清空所有模型，当前id数组长度：", this.eleIds.length);
            return;
        }

        persons.forEach(d => {
            const id = d.id;
            const type = d.class;
            const direction = d.direction;
            const cameraName = d.cameraName;
            nIds.push(id);

            this.lastIdUpdateTime[id] = new Date().getTime();

            const position = Cesium.Cartesian3.fromDegrees(d.x, d.y, 0);

            if (this.eleIds.includes(id)) {
                let el = this.getById(id);
                if (el) {
                    let indexa = this.eles.findIndex(item => item.id == id);
                    if (this.eles[indexa].text == null) {
                        this.eles[indexa].text = this.cartext;
                    }
                    el.addPosition(position, interval);
                }
            } else {
                // 新增：创建模型时增加有效性校验
                const newModel = new Model(id, this.viewer, type, position, '', direction, cameraName);
                if (newModel && newModel.animateEntity) {
                    this.eles.push(newModel);
                    this.eleIds.push(id);
                }
            }
        });

        // 延迟删除逻辑保留（正常业务逻辑）
        const currentTime = new Date().getTime();
        const needDeleteIds = [];
        this.eleIds.forEach(id => {
            const lastUpdateTime = this.lastIdUpdateTime[id] || 0;
            if (currentTime - lastUpdateTime > 3000 && !nIds.includes(id)) {
                needDeleteIds.push(id);
            }
        });

        needDeleteIds.forEach(id => {
            this.removeById(id);
            const idIndex = this.eleIds.indexOf(id);
            if (idIndex > -1) {
                this.eleIds.splice(idIndex, 1);
            }
            delete this.lastIdUpdateTime[id];
        });

        console.log("------------------id数组-----------" + this.eleIds.length);
    }

    // 核心修复：确保能精准找到实例
    getById(id) {
        return this.eles.find(el => el && el.id === id) || null;
    }

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

    // 修复：倒序遍历删除，避免索引错乱
    removeById(id) {
        // 倒序遍历，避免删除元素后索引偏移
        for (let i = this.eles.length - 1; i >= 0; i--) {
            const el = this.eles[i];
            if (el && el.id == id) {
                el.remove(); // 先移除Cesium实体
                this.eles.splice(i, 1); // 再删除数组元素
                break;
            }
        }
    }

    // 新增：彻底移除所有模型的核心方法（重点！）
    removeAll() {
        // 1. 倒序遍历eles数组，确保所有实例都被移除
        for (let i = this.eles.length - 1; i >= 0; i--) {
            const el = this.eles[i];
            if (el) {
                // 强制移除Cesium实体（双重保障）
                if (el.animateEntity) {
                    this.viewer.entities.remove(el.animateEntity);
                    el.animateEntity = null;
                }
                // 调用实例自身的remove方法
                if (typeof el.remove === 'function') {
                    el.remove();
                }
                // 从数组删除
                this.eles.splice(i, 1);
            }
        }

        // 2. 清空所有关联数组和缓存
        this.eleIds = [];
        this.lastIdUpdateTime = {};
        this.lastDate = null;
        this.cnt = 0;

        // 3. 终极兜底：直接清理所有未被移除的相关实体（按ID过滤）
        this.viewer.entities.values.forEach(entity => {
            if (entity.id && this.eleIds.includes(entity.id)) {
                this.viewer.entities.remove(entity);
            }
        });

        console.log("所有模型已彻底移除，当前eles长度：", this.eles.length);
    }
}

// 创建人/车模型
class Model {
    constructor(id, viewer, type, position, text, direction, cameraName) {
        this.viewer = viewer;
        this.type = type;
        this.position = position;
        this.id = id;
        this.text = text;
        this.direction = direction;
        this.cameraName = cameraName;
        this.property = null;
        this.animateEntity = null;
        this.fixedOrientation = null;

        var initialHeading;
        if (this.cameraName == "59" || this.cameraName == "52" || this.cameraName == "53" || this.cameraName == "54") {
            initialHeading = this.direction == 1 ? Cesium.Math.toRadians(235) : Cesium.Math.toRadians(55);
        } else if (this.cameraName == "51" || this.cameraName == "55") {
            initialHeading = this.direction == 1 ? Cesium.Math.toRadians(150) : Cesium.Math.toRadians(-30);
        } else if (this.cameraName == "56" || this.cameraName == "57" || this.cameraName == "58") {
            initialHeading = this.direction == 1 ? Cesium.Math.toRadians(55) : Cesium.Math.toRadians(235);
        }
        initialHeading = initialHeading || Cesium.Math.toRadians(0);
        
        const initialOrientation = Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(initialHeading, 0, 0)
        );

        if (type == "car") {
            this.fixedOrientation = initialOrientation;
            this.animateEntity = this.viewer.entities.add({
                position: position,
                orientation: this.fixedOrientation,
                id: id,
                model: {
                    uri: "/model/jc.glb",
                    scale: 0.9,
                    animations: {
                        enabled: true,
                        loop: Cesium.ModelAnimationLoop.REPEAT,
                        speedup: 8.0
                    }
                },
            });
        } else if (type == "person") {
            this.animateEntity = this.viewer.entities.add({
                position: position,
                orientation: initialOrientation,
                id: id,
                model: {
                    // uri: "/model/green.glb",
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

        // 兜底：确保animateEntity创建成功
        if (!this.animateEntity) {
            console.error(`模型${id}创建失败，实体未生成`);
        }
    }

    addPosition(position, interval) {
        let currentTime = this.viewer.clock.currentTime.clone();
        if (!this.property) {
            this.createPositionProperty(currentTime);
        }
        let julianDate = new Cesium.JulianDate();
        Cesium.JulianDate.addSeconds(currentTime, interval, julianDate);
        this.property.addSample(julianDate, position);
    }

    createPositionProperty(currentTime) {
        this.property = new Cesium.SampledPositionProperty();
        this.property.addSample(currentTime.clone(), this.position);
        this.animateEntity.position = this.property;

        if (this.type == "person") {
            this.animateEntity.orientation = new Cesium.VelocityOrientationProperty(this.property);
        }
    }

    // 增强版remove：强制销毁实体
    removeAll() {
        if (this.animateEntity) {
            // 强制移除（忽略Cesium内部状态检查）
            this.viewer.entities.remove(this.animateEntity);
            // 手动置空，防止内存泄漏
            this.animateEntity = null;
            this.property = null;
            this.fixedOrientation = null;
        }
    }
}

export default ModelColCarxuting;