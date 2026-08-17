import * as Cesium from "cesium";
import axios from "axios";

class ModelCol {
    constructor(viewer) {
        this.viewer = viewer;
        this.eleIds = [];
        this.eles = [];
        this.cartext = null;
        this.cam1 = {};
        this.cam2 = {};
        this.lastDate = null;
        this.plate_trig_contour = [
            [121.7871397351, 31.3546211387],
            [121.7870451224, 31.3546222572],
            [121.7870378774, 31.3544564523],
            [121.7871345648, 31.3544610000]
        ];
        this.cnt = 0;
    }

    async update(data, skip = 10) {
        this.cnt += 1;
        if (this.cnt % skip !== 0) return;

        let interval = 0;
        const currentTime = Date.now();
        if (!this.lastDate) {
            this.lastDate = currentTime;
        } else {
            interval = (currentTime - this.lastDate) / 1000 + 1;
            this.lastDate = currentTime;
        }

        const nIds = [];
        const persons = data || [];

        for (const d of persons) {
            if (!d || !d.id) continue;
            const id = d.id;
            const type = d.class || "person";
            //    console.log("-------最新经纬度",d.x,d.y,d.id)
            if (d.class == "person")
                console.log(d.x,d.y,d.id,d.class)
            nIds.push(id);
            const position = Cesium.Cartesian3.fromDegrees(
                d.x || 0,
                d.y || 0,
                0
            );

            if (this.eleIds.includes(id)) {
                const el = this.getById(id);
                if (el) {
                    if (!el.text) el.text = this.cartext;
                    el.addPosition(position, interval);
                }
            } else {
               
                // 新增：从数据中获取direction属性
                const direction = d.direction || 0;
                const newModel = new Model(id, this.viewer, type, position, '', direction);
                this.eles.push(newModel);
                this.eleIds.push(id);
            }
        }

        this.removeInvalidModels(nIds);
    }

    removeInvalidModels(validIds) {
        for (let i = this.eleIds.length - 1; i >= 0; i--) {
            const id = this.eleIds[i];
            if (!id || !validIds.includes(id)) {
                // console.log(`移除无效模型：ID=${id}`);
                this.removeById(id);
                this.eleIds.splice(i, 1);
            }
        }

        if (this.eles.length !== this.eleIds.length) {
            console.warn("模型列表与ID列表长度不一致，执行容错清理");
            this.syncModelAndIds();
        }
    }

    syncModelAndIds() {
        const validModels = [];
        const validIds = [];
        for (const model of this.eles) {
            if (model && model.id && this.eleIds.includes(model.id)) {
                validModels.push(model);
                validIds.push(model.id);
            }
        }
        this.eles = validModels;
        this.eleIds = validIds;
    }

    getById(id) {
        if (!id) return null;
        return this.eles.find(el => el && el.id === id) || null;
    }

    removeById(id) {
        if (!id) return;
        const index = this.eles.findIndex(el => el && el.id === id);
        if (index !== -1) {
            const model = this.eles[index];
            model.remove();
            this.eles.splice(index, 1);
            // console.log(`成功移除模型：ID=${id}`);
        }
    }

    pointInPolygon(point, polygon) {
        let x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            let xi = polygon[i][0], yi = polygon[i][1];
            let xj = polygon[j][0], yj = polygon[j][1];
            let intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}

class Model {
    constructor(id, viewer, type, position, text, direction = 0) {
        this.viewer = viewer;
        this.modelPositon = position || Cesium.Cartesian3.ZERO;
        this.id = id;
        this.text = text;
        this.type = type || "person";
        this.direction = direction; // 新增：存储方向参数
        this.animateEntity = null;
        this.property = null;
        
        this.createEntity();
    }

    // 计算旋转角度的方法
    getRotationAngle() {
        if (this.type !== "car") {
            return 0; // 非车模型不旋转
        }
        
        // 根据direction设置旋转角度
        if (this.direction == 1) {
            return 150; // 旋转150度
        } else if (this.direction == 2) {
            return -30; // 旋转50度
        }
        
        return 180; // 默认旋转180度
    }

    createEntity() {
        const modelUri = this.type === "car" 
            ? "/model/jc.glb" 
            : "/model/man/walk.gltf";

        // 创建实体配置
        const entityConfig = {
            position: this.modelPositon,
            id: this.id,
            model: {
                uri: modelUri,
                scale: 1.0
            }
        };

        // 如果是车模型，根据direction添加不同的旋转
        if (this.type === "car") {
            const rotationAngle = this.getRotationAngle();
            
            // 方法1：使用model.rotation属性
            entityConfig.model.rotation = Cesium.Math.toRadians(rotationAngle);
            
            // console.log(`创建车模型：ID=${this.id}，direction=${this.direction}，旋转角度=${rotationAngle}度`);
        } else {
            // console.log(`创建人模型：ID=${this.id}`);
        }

        this.animateEntity = this.viewer.entities.add(entityConfig);
    }
    
    // 备选方法：使用模型矩阵
    applyCarRotation(entityConfig) {
        const rotationAngle = this.getRotationAngle();
        
        // 创建旋转矩阵
        const rotation = Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(rotationAngle));
        
        // 创建模型矩阵
        const translation = Cesium.Cartesian3.clone(this.modelPositon);
        const scale = new Cesium.Cartesian3(1.0, 1.0, 1.0);
        const modelMatrix = Cesium.Matrix4.fromTranslationRotationScale(
            translation,
            rotation,
            scale
        );
        
        entityConfig.model.modelMatrix = modelMatrix;
    }

    addPosition(position, interval) {
        if (!position || interval <= 0) return;
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
        this.property.addSample(currentTime.clone(), this.modelPositon);
        this.animateEntity.position = this.property;
        
        // 根据类型设置不同的方向
        if (this.type === "car") {
            // 车模型：保持固定方向
            const rotationAngle = this.getRotationAngle();
            this.animateEntity.orientation = new Cesium.ConstantProperty(
                Cesium.Transforms.headingPitchRollQuaternion(
                    this.modelPositon,
                    new Cesium.HeadingPitchRoll(
                        Cesium.Math.toRadians(rotationAngle), // 使用计算的角度
                        0, // pitch
                        0  // roll
                    )
                )
            );
        } else {
            // 人模型：跟随速度方向
            this.animateEntity.orientation = new Cesium.VelocityOrientationProperty(this.property);
        }
    }

    remove() {
        if (this.animateEntity) {
            this.viewer.entities.remove(this.animateEntity);
            this.animateEntity = undefined;
        }
        this.property = null;
    }
}

export default ModelCol;