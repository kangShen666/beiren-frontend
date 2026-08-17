import * as Cesium from "cesium";

class ModelCol {
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
        // 新增：存储每个id最后一次更新的时间戳，key=id，value=时间戳（ms）
        this.lastIdUpdateTime = {};
    }

    //更新数据 skip=30
    update(data, skip = 1) {
        this.cnt += 1;
        if (this.cnt % skip !== 0) return;

        let interval = 0;
        if (!this.lastDate) {
            this.lastDate = new Date().getTime();
        } else {
            const cDate = new Date().getTime();
            interval = (cDate - this.lastDate) / 1000 + 1;//时间差
            this.lastDate = cDate;
        }

        let nIds = [];
        let persons = data;
        // 移除无效的async（forEach不支持async/await，此处无await操作，可删除）
        persons.forEach(d => {
            const id = d.id;
            const type = d.class;
            const direction = d.direction;
            const cameraName = d.cameraName;
            nIds.push(id);

            // 关键：刷新当前id的最后更新时间戳
            this.lastIdUpdateTime[id] = new Date().getTime();

            const position = Cesium.Cartesian3.fromDegrees(d.x, d.y, 0);

            if (this.eleIds.includes(id)) {//已有该ID，更新位置
                let el = this.getById(id);
                if (el) {
                    let indexa = this.eles.findIndex(item => item.id == id);
                    if (this.eles[indexa].text == null) {
                        this.eles[indexa].text = this.cartext;
                    }
                    el.addPosition(position, interval);
                }
            } else {
                // 新增ID，创建模型并记录
                this.eles.push(new Model(id, this.viewer, type, position, '', direction, cameraName));
                this.eleIds.push(id);
            }
        });

        // 核心修改：延迟删除（3秒无更新则删除）
        const currentTime = new Date().getTime();
        const needDeleteIds = []; // 先收集需要删除的id，避免遍历中修改数组索引错乱

        // 遍历所有已存在的id，判断是否超过3秒无更新
        this.eleIds.forEach(id => {
            const lastUpdateTime = this.lastIdUpdateTime[id] || 0;
            // 超过3000ms（3秒）且当前帧无该id，标记为需要删除
            if (currentTime - lastUpdateTime > 3000 && !nIds.includes(id)) {
                needDeleteIds.push(id);
            }
        });

        // 批量删除标记的id
        needDeleteIds.forEach(id => {
            this.removeById(id);
            // 从eleIds中移除
            const idIndex = this.eleIds.indexOf(id);
            if (idIndex > -1) {
                this.eleIds.splice(idIndex, 1);
            }
            // 移除该id的最后更新时间记录（可选，优化内存）
            delete this.lastIdUpdateTime[id];
        });

        console.log("------------------id数组-----------" + this.eleIds.length);
    }

    getById(id) {
        for (let i = 0; i < this.eles.length; i++) {
            const el = this.eles[i];
            if (el.id == id) return el;
        }
        return null; // 增加返回null，避免无匹配时返回undefined
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

    removeById(id) {
        for (let i = 0; i < this.eles.length; i++) {
            const el = this.eles[i];
            if (el.id == id) {
                el.remove();
                this.eles.splice(i, 1);
                break; // 找到并删除后跳出循环，避免重复遍历
            }
        }
    }
}

// 创建人/车模型
class Model {
    constructor(id, viewer, type, position, text, direction, cameraName) {
        this.viewer = viewer;
        this.type = type;
        this.position = position; // 修正原代码潜在的变量名笔误
        this.id = id;
        this.text = text;
        this.direction = direction;
        this.cameraName = cameraName;
        this.property = null; // 提前声明属性
        this.animateEntity = null; // 提前声明属性
        this.fixedOrientation = null; // 新增：保存车模型固定朝向的实例属性
        // 计算初始朝向
        let initialHeading;
        if (this.cameraName == "59" || this.cameraName == "52" || this.cameraName == "53" || this.cameraName == "54") {
            initialHeading = this.direction == 1 ? Cesium.Math.toRadians(235) : Cesium.Math.toRadians(55);
        } else if (this.cameraName == "51" || this.cameraName == "55") {
            initialHeading = this.direction == 1 ? Cesium.Math.toRadians(150) : Cesium.Math.toRadians(-30);
        } else if (this.cameraName == "56" || this.cameraName == "57" || this.cameraName == "58") {
            initialHeading = this.direction == 1 ? Cesium.Math.toRadians(55) : Cesium.Math.toRadians(235);
        }
        initialHeading = initialHeading || Cesium.Math.toRadians(0);

        // 初始朝向四元数
        const initialOrientation = Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(initialHeading, 0, 0)
        );

        if (type == "car") {
            // 保存车模型初始朝向为实例属性，永久保留
            this.fixedOrientation = initialOrientation;
            this.animateEntity = this.viewer.entities.add({
                position: position,
                orientation: this.fixedOrientation, // 使用固定朝向
                id: id,
                model: {
                    uri: "/model/jc.glb",
                    scale: 0.9,
                     animations: {
                        enabled: true, // 启用模型自身动画
                        loop: Cesium.ModelAnimationLoop.REPEAT, // 循环播放
                        speedup: 8.0 // 动画播放速度
                    }
                },
            });
        } else if (type == "person") {
            this.animateEntity = this.viewer.entities.add({
                position: position,
                orientation: initialOrientation, // 人模型保留初始朝向
                id: id,
                model: {
                    uri: "/model/man/walk.gltf",
                    scale: 0.9,
                    minimumPixelSize: 16,
                    maximumScale: 10000,
                     animations: {
                        enabled: true, // 启用动画
                        loop: Cesium.ModelAnimationLoop.REPEAT, // 无限循环播放
                        speedup: 8.0, // 动画速度（可根据需求调整，如1.5更快）
                        // 可选：指定播放的动画名称（如果模型有多个动画）
                        // names: ["walk"] 
                    }
                },
            });
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

        // 核心修改：仅对人模型设置VelocityOrientationProperty，车模型不设置（保持固定朝向）
        if (this.type == "person") {
            this.animateEntity.orientation = new Cesium.VelocityOrientationProperty(this.property);
        }
        // 车模型跳过orientation赋值，保持初始化时的fixedOrientation不变
    }

    // 清除点位
    remove() {
        if (this.animateEntity && this.viewer.entities.contains(this.animateEntity)) {
            this.viewer.entities.remove(this.animateEntity);
            this.animateEntity = undefined;
        }
    }
}

export default ModelCol;