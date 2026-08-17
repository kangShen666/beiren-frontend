import * as Cesium from "cesium";
class ModelColMen {
    constructor(viewer) {
        this.viewer = viewer;
        this.eleIds = [];// id
        this.eles = [];// 车对象
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
    }
    async getpopleext(id) {
        try {
            const res = await axios({
                method: 'post',
                url: '/sinlogin/UserManage/selectUser',
                baseURL: '/sinlogin',
                params: {
                    Gpsid: id, // 拼接的参数，类似 GET 请求
                },
            });


            return res.data.idName
        } catch (error) {
        }
    }
    //更新数据 skip=30
    update(data, skip = 5) {
        this.cnt += 1;//1234567910
        // console.log(data, "1111111111111");

        if (this.cnt % skip != 0) return;//36912
        // console.log(this.viewer);
        // return
        let interval = 0;
        if (!this.lastDate) {
            this.lastDate = new Date().getTime();
        } else {
            const cDate = new Date().getTime();
            interval = (cDate - this.lastDate) / 1000 + 1;//时间差
            this.lastDate = cDate;
        }
        // data为array[{id:,lng:,lat},{id:,lng:,lat}]
        let nIds = [];
        let persons = data
        let camStr = localStorage.getItem('camList');
        let camList = JSON.parse(camStr)

        //系数
        persons.forEach(async d => {
            // const xy_scale = 10000000000;
            const id = d.id;
            const type = d.class
            const direction = d.direction
            nIds.push(id);
            // const xlat = d.target.x / xy_scale;
            // const ylnt = d.target.y / xy_scale;
            // const z = d.target.z
            // const position = Cesium.Cartesian3.fromDegrees(parseFloat(d.target.x / xy_scale), parseFloat(d.target.y / xy_scale), 0.3);
            const position = Cesium.Cartesian3.fromDegrees(d.x, d.y, 0);
            // const position = Cesium.Cartesian3.fromDegrees(116.462645, 39.946704, 10);

            // return
            // let point = [lon, lat];
            let polygon = [
                [1, 1],
                [1, 2],
                [2, 3],
                [3, 1]
            ];


            if (this.eleIds.includes(id)) {//判断是否有这个ID车，有给车加数据  没有else创建车 eleIds只存id
                let el = this.getById(id);
                if (el) {
                    let indexa = this.eles.findIndex(item => item.id == id)
                    if (this.eles[indexa].text == null) {
                        this.eles[indexa].text = this.cartext
                    }
                    el.addPosition(position, interval);
                }
            } else {
                this.eles.push(new Model(id, this.viewer, type, position, '', direction)); //eles数组 数组里新的model对象   新建model 地点不对为空
                this.eleIds.push(id);  //eleIds   id
            }




        });
        //  [{}]
        //删除无效数据
        //   console.log("------------------id数组-----------"+this.eleIds.length)
        for (let i = 0; i < this.eleIds.length; i++) {
            const id = this.eleIds[i];
            //    console.log("----------"+id+"-------id数组-----------"+this.eleIds[i])
            if (!nIds.includes(id)) {  //nIds没有这个id 会删除
                //删除
                // console.log("删除无效数据" + id)
                this.removeById(id);
                //delete this.eleIds[i];
                this.eleIds.splice(this.eleIds.indexOf(id), 1)
            }
            // console.log("---------------" + id + "-id数组长度长度长度-----------" + this.eleIds.length)
            // console.log("---------------" + id + "-model对象数组长度长度长度-----------" + this.eles.length)
            // console.log("----/////////////////////////////////////////////////////////-----------")
        }

    }



    getById(id) {
        // console.log("---------------" + id + "-model对象数组长度长度长度-----------" + this.eles.length)
        for (let i = 0; i < this.eles.length; i++) { //model对象数组
            const el = this.eles[i];
            // console.log("--------------model对象数组-------------" + this.eles[i])
            if (el.id == id) return el;
        }
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
                this.eles[i].remove();
                //   delete this.eles[i];
                // console.log("--------------model对象del------------" + this.eles.slice(this.eles.findIndex(item => item.id == id), 1))

                this.eles.splice(this.eles.findIndex(item => item.id == id), 1)
                //   this.eles.splice(this.eles.indexOf(id), 1)
            };
        }
    }
}
// 创建人模型
class Model {

    constructor(id, viewer, type, position, text, direction) {
        this.viewer = viewer;
        this.type = type;
        this.position = position;
        this.id = id;
        this.text = text;
        this.direction = direction;
        // 初始方向（车头朝北）

        if (this.type !== "car") {
            return 0; // 非车模型不旋转
        }
        var initialHeading;
        // 根据direction设置旋转角度
        if (this.direction == 1) {
            initialHeading = Cesium.Math.toRadians(150); // 90度转换为弧度
        } else if (this.direction == 2) {
            initialHeading = Cesium.Math.toRadians(-30); // 90度转换为弧度
        }



        const initialOrientation = Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(initialHeading, 0, 0)
        );
        // if (type == "car") {
        //     this.animateEntity = this.viewer.entities.add({
        //         // 添加人形对应的视频数据

        //         position: position,
        //         orientation: initialOrientation,
        //         id: id,
        //         model: {
        //             // speed: 2,
        //             uri: "/model/jc.glb",  //人
        //             scale: 0.9
        //         },
        //     });
        // } else 
        if (type == "person") {
            this.animateEntity = this.viewer.entities.add({
                // 添加人形对应的视频数据

                position: position,
                // orientation: initialOrientation,
                id: id,
                model: {
                    // speed: 2,
                    uri: "/model/man/walk.gltf",  //人
                    scale: 3,
                    // color: new Cesium.Color(255, 0, 0, 1),
                },
            });
        }
console.log("ren",this.position,111111111111111111111111111111111111111);

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
        this.property.addSample(currentTime.clone(), this.modelPositon);
        this.animateEntity.position = this.property;
        this.animateEntity.orientation = new Cesium.VelocityOrientationProperty(this.property);

    }

    // 清除点位
    remove() {
        if (this.animateEntity) {
            this.viewer.entities.remove(this.animateEntity);
            this.animateEntity = undefined;
        }
    }
}
export default ModelColMen