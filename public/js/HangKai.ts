import { ElMessage } from "element-plus";
import { reactive, ref } from "vue";
import "../../public/js/WebVideoCtrl";
export const selectedChannel = ref(null);
let g_iWndIndex: number = 0;
export let videoFlag = ref(false)
export var data = reactive({
  // ip: sessionStorage.getItem("newIp"), //你的ip
  ip: "192.168.0.174",
  port: "80",
  userName: "admin", //账号
  //password: 'Haishi@123', //密码
  password: "Sinotoon@123",
  szStartTime: "",
  szEndTime: "",
});
// rtsp://admin:Sinotoon%40123@172.16.55.113:554/stream
const PlaybackTime = reactive({
  szStartTime: "",
  szEndTime: "",
});
export const channels = ref<any>([]);
const ptzSpeed = ref(3);
const g_bPTZAuto = ref(false);
// 使用计算属性来动态生成设备标识符
const szDeviceIdentify = ref(data.ip + "_" + data.port);
// 初始化插件参数及插入插件
export const init = (width,height,e) => {
  // console.log(WebVideoCtrl,1111111);
  // return

  WebVideoCtrl.I_InitPlugin({
    bWndFull: true, //是否支持单窗口双击全屏，默认支持 true:支持 false:不支持
    iWndowType: 1,
    cbSelWnd: function (xmlDoc: Document) {
      g_iWndIndex = parseInt($(xmlDoc).find("SelectWnd").eq(0).text(), 10);
    },
    cbDoubleClickWnd: function () { },
    cbEvent: (iEventType: Number, iParam1: any) => {
      if (2 == iEventType) {
        // 回放正常结束
        console.log("窗口" + iParam1 + "回放结束！");
      } else if (-1 == iEventType) {
        console.log("设备" + iParam1 + "网络错误！");
      }
    },
    cbInitPluginComplete: function () {
      
      WebVideoCtrl.I_InsertOBJECTPlugin("divPlugin").then(
        () => {
          // 检查插件是否最新
          WebVideoCtrl.I_CheckPluginVersion().then((bFlag: boolean) => {
            if (bFlag) {
              alert(
                "检测到新的插件版本,双击开发包目录里的HCWebSDKPlugin.exe升级!"
              );
            } else {
              videoFlag.value = true
              console.log("初始化成功");
              login(true, width, height, true, e.yuzhiwei, e.ip)
            }
          });
        },
        (error) => {
          // alertWithDownload(
          //   "插件初始化失败,请确认是否已安装插件;如果未安装,请点击确定下载并安装插件.",
          //   "../../public/js/HCWebSDKPlugin.exe"
          // );
          console.log(error);
          
          console.log("初始化失败");
        }
      );
    },
  });
};
function alertWithDownload(message: any, downloadUrl: any) {
  // 创建覆盖层
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
  overlay.style.zIndex = "999";
  document.body.appendChild(overlay);

  // 创建自定义弹窗
  const customAlert = document.createElement("div");
  customAlert.style.position = "fixed";
  customAlert.style.left = "50%";
  customAlert.style.top = "50%";
  customAlert.style.transform = "translate(-50%, -50%)";
  customAlert.style.padding = "20px";
  customAlert.style.backgroundColor = "white";
  customAlert.style.borderRadius = "8px";
  customAlert.style.boxShadow = "0px 2px 10px rgba(0, 0, 0, 0.1)";
  customAlert.style.zIndex = "1000";
  customAlert.style.width = "300px";
  customAlert.style.fontSize = "16px";
  customAlert.style.textAlign = "center";
  customAlert.style.fontFamily = "Arial, sans-serif";
  document.body.appendChild(customAlert);

  // 添加消息文本
  const alertMessage = document.createElement("p");
  alertMessage.textContent = message;
  alertMessage.style.margin = "20px 0";
  customAlert.appendChild(alertMessage);

  // 按钮容器
  const buttonContainer = document.createElement("div");
  buttonContainer.style.display = "flex";
  buttonContainer.style.justifyContent = "space-around";
  buttonContainer.style.marginTop = "20px";
  customAlert.appendChild(buttonContainer);

  // 添加“确定”按钮
  const confirmButton = document.createElement("button");
  confirmButton.textContent = "确定";
  confirmButton.style.padding = "10px 20px";
  confirmButton.style.border = "none";
  confirmButton.style.borderRadius = "4px";
  confirmButton.style.backgroundColor = "#007BFF";
  confirmButton.style.color = "white";
  confirmButton.style.cursor = "pointer";
  confirmButton.onclick = function () {
    hideCustomAlert();
  };
  buttonContainer.appendChild(confirmButton);

  // 添加“下载”按钮
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "下载";
  downloadButton.style.padding = "10px 20px";
  downloadButton.style.border = "none";
  downloadButton.style.borderRadius = "4px";
  downloadButton.style.backgroundColor = "#007BFF";
  downloadButton.style.color = "white";
  downloadButton.style.cursor = "pointer";
  downloadButton.onclick = function () {
    triggerDownload(downloadUrl);
    hideCustomAlert();
  };
  buttonContainer.appendChild(downloadButton);
}

function hideCustomAlert() {
  const overlay = document.querySelector('div[style*="z-index: 999"]');
  const customAlert = document.querySelector('div[style*="z-index: 1000"]');
  if (overlay) document.body.removeChild(overlay);
  if (customAlert) document.body.removeChild(customAlert);
}

function triggerDownload(url: any) {
  fetch(url)
    .then((response) => response.blob())
    .then((blob) => {
      const downloadLink = document.createElement("a");
      const url = window.URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = "HCWebSDKPlugin.exe"; // 提取文件名作为下载名
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(url);
    })
    .catch((error) => console.error("Download failed:", error));
}
// ip登录
export const login = (
  show?: boolean,
  num?: any,
  num2?: any,
  GoPreset?: boolean,
  index?: number,
  ip?: string,
) => {
  // data.ip = ip;
  console.log(data);

  // WebVideoCtrl.I_Resize(num -300, num2-200);
  WebVideoCtrl.I_Login(ip, 1, data.port, data.userName, data.password, {
    timeout: 3000,
    success: function () {
      setTimeout(async function () {
        setTimeout(function () {
          // clickGoPreset(index,ip);
          setTimeout(function () {
            if (show) {
              clickStartRealPlay(ip,index);
              console.log('登录成功');
            }
          }, 1000);
        }, 1000);

        getDevicePort(`${ip}_${data.port}`);
        getChannelInfo();
        if (GoPreset) {
        }
      }, 10);
      // getDevicePort(`${data.ip}_${data.port}`); //获取端口
    },
    error: function (error: any) {
      console.log(error);
    },
  });
};
interface DevicePort {
  iDevicePort: number;
  iHttpPort: number;
  iRtspPort: number;
  // 根据需要可以添加更多属性
}
// 获取端口
export const getDevicePort = (szDeviceIdentify: string) => {
  if (!szDeviceIdentify) {
    return;
  }
  WebVideoCtrl.I_GetDevicePort(szDeviceIdentify).then(
    (oPort: DevicePort) => {
      console.log("获取端口成功", oPort);
    },
    (oError: any) => {
      ElMessage.error(oError.errorMsg);
    }
  );
};

// 获取通道
export function getChannelInfo() {
  const szDeviceIdentify = data.ip;
  if (null == szDeviceIdentify) {
    console.log(szDeviceIdentify);
    return;
  }
  channels.value.length = 0; // 清空现有的频道列

  // 模拟通道
  WebVideoCtrl.I_GetAnalogChannelInfo(szDeviceIdentify, {
    success: function (xmlDoc: Document) {
      const oChannels = $(xmlDoc).find("VideoInputChannel");
      oChannels.each((i: number, el: Document) => {
        const id = $(el).find("id").eq(0).text();
        let name = $(el).find("name").eq(0).text();
        if (!name) {
          name = "Camera " + (i < 9 ? "0" + (i + 1) : i + 1);
        }
        channels.value.push({ id, name, bZero: false });
      });
      console.log(szDeviceIdentify + " 获取模拟通道成功！");
    },
    error: function (oError: any) {
      console.log(
        szDeviceIdentify + " 获取模拟通道失败！",
        oError.errorCode,
        oError.errorMsg
      );
    },
  });
  // 数字通道
  WebVideoCtrl.I_GetDigitalChannelInfo(szDeviceIdentify, {
    success: function (xmlDoc: Document) {
      const oChannels = $(xmlDoc).find("InputProxyChannelStatus");
      oChannels.each((i: number, el: Document) => {
        const id = $(el).find("id").eq(0).text();
        let name = $(el).find("name").eq(0).text();
        const online = $(el).find("online").eq(0).text();
        if (online === "false") {
          return true; // 过滤禁用的数字通道
        }
        if (!name) {
          name = "IPCamera " + (i < 9 ? "0" + (i + 1) : i + 1);
        }
        channels.value.push({ id, name, bZero: false });
      });
      console.log(szDeviceIdentify + " 获取数字通道成功！");
    },
    error: function (oError: any) {
      console.log(
        szDeviceIdentify + " 获取数字通道失败！",
        oError.errorCode,
        oError.errorMsg
      );
    },
  });

  // 零通道
  WebVideoCtrl.I_GetZeroChannelInfo(szDeviceIdentify, {
    success: function (xmlDoc: Document) {
      const oChannels = $(xmlDoc).find("ZeroVideoChannel");
      oChannels.each((i: number, el: Document) => {
        const id = $(el).find("id").eq(0).text();
        let name = $(el).find("name").eq(0).text();
        if (!name) {
          name = "Zero Channel " + (i < 9 ? "0" + (i + 1) : i + 1);
        }
        if ($(el).find("enabled").eq(0).text() === "true") {
          channels.value.push({ id, name, bZero: true }); // 过滤禁用的零通道
        }
      });
      console.log(szDeviceIdentify + " 获取零通道成功！");
    },
    error: function (oError: any) {
      console.log(
        szDeviceIdentify + " 获取零通道失败！",
        oError.errorCode,
        oError.errorMsg
      );
    },
  });
}

export function clickLogout() {
  const szDeviceIdentify = data.ip;
  if (null == szDeviceIdentify) {
    return;
  }
  WebVideoCtrl.I_Logout(szDeviceIdentify).then(
    () => {
      console.log(szDeviceIdentify + " " + "退出成功！");
      clickStopRealPlay();
    },
    () => {
      console.log(szDeviceIdentify + " " + "退出失败！");
    }
  );
}

// 开始预览
export const clickStartRealPlay = (ip?: string, port?: number) => {
  const oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex);
  const startRealPlay = function () {
    WebVideoCtrl.I_StartRealPlay(`${ip}_${data.port}`, {
      iStreamType: 1,
      iChannelID: 1, //播放通道
      bZeroChannel: false,
      success: function () {
        console.log(" 开始预览成功！");
        clickGoPreset(port)
      },
      error: function (oError: any) {
        console.log(" 开始预览失败！", oError.errorMsg);
      },
    });
  };
  if (oWndInfo != null) {
    // 已经在播放了，先停止
    WebVideoCtrl.I_Stop({
      success: () => {
        startRealPlay();
      },
    });
  } else {
    startRealPlay();
  }
};



// 停止预览
export function clickStopRealPlay() {
  const oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex);
  if (oWndInfo != null) {
    WebVideoCtrl.I_Stop({
      success: function () {
        console.log(oWndInfo.szDeviceIdentify + " " + "停止预览成功");
      },
      error: function (oError: any) {
        console.log(
          szDeviceIdentify.value + " 停止预览失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}
// 销毁插件
export const destroyPlugin = () => {
  videoFlag.value = false
  return new Promise((resove, reject) => {
    WebVideoCtrl.I_DestroyPlugin()
      .then(() => {
        WebVideoCtrl.I_Logout(`${data.ip}_${data.port}`);
        setTimeout(() => {
          resove(1);
        }, 500);
      })
      .catch(reject);
  });
};
// 云台控制
// 模拟 WebVideoCtrl.I_GetWindowStatus 函数
function getWindowStatus(index: number) {
  return { szDeviceIdentify: `Device_${index}` };
}
export function mouseDownPTZControl(iPTZIndex: number) {
  const oWndInfo = getWindowStatus(g_iWndIndex);
  const selectedChannel = channels.value[g_iWndIndex];
  const bZeroChannel = selectedChannel ? selectedChannel.bZero : false;
  const iPTZSpeed = ptzSpeed.value;

  if (bZeroChannel) {
    // 零通道不支持云台
    console.log("零通道不支持云台");
    return;
  }

  if (oWndInfo != null) {
    let ptzSpeedValue = iPTZSpeed;
    if (9 === iPTZIndex && g_bPTZAuto.value) {
      ptzSpeedValue = 0; // 自动开启后，速度置为0可以关闭自动
    } else {
      g_bPTZAuto.value = false; // 点击其他方向，自动肯定会被关闭
    }

    WebVideoCtrl.I_PTZControl(iPTZIndex, false, {
      iPTZSpeed: ptzSpeedValue,
      success: function () {
        if (9 === iPTZIndex && g_bPTZAuto.value) {
          console.log(oWndInfo.szDeviceIdentify + " 停止云台成功！");
        } else {
          console.log(oWndInfo.szDeviceIdentify + " 开启云台成功！");
        }
        if (9 === iPTZIndex) {
          g_bPTZAuto.value = !g_bPTZAuto.value;
        }
      },
      error: function (oError: { errorCode: number; errorMsg: string }) {
        console.log(
          oWndInfo.szDeviceIdentify + " 开启云台失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}
export function mouseUpPTZControl() {
  const oWndInfo = getWindowStatus(g_iWndIndex);
  if (oWndInfo != null) {
    WebVideoCtrl.I_PTZControl(1, true, {
      success: function () {
        console.log(oWndInfo.szDeviceIdentify + " 停止云台成功！");
      },
      error: function (oError: { errorCode: number; errorMsg: string }) {
        console.log(
          oWndInfo.szDeviceIdentify + " 停止云台失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}
// 变焦
export function PTZZoomIn() {
  const oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex);
  if (oWndInfo != null) {
    WebVideoCtrl.I_PTZControl(10, false, {
      iWndIndex: g_iWndIndex,
      success: function () {
        console.log(oWndInfo.szDeviceIdentify + " 调焦+成功！");
      },
      error: function (oError: any) {
        console.log(
          oWndInfo.szDeviceIdentify + "  调焦+失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}
export function PTZZoomStop() {
  const oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex);
  if (oWndInfo != null) {
    WebVideoCtrl.I_PTZControl(11, true, {
      iWndIndex: g_iWndIndex,
      success: function () {
        console.log(oWndInfo.szDeviceIdentify + " 调焦停止成功！");
      },
      error: function (oError: any) {
        console.log(
          oWndInfo.szDeviceIdentify + "  调焦停止失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}
export function PTZZoomout() {
  const oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex);
  if (oWndInfo != null) {
    WebVideoCtrl.I_PTZControl(11, false, {
      iWndIndex: g_iWndIndex,
      success: function () {
        console.log(oWndInfo.szDeviceIdentify + " 调焦-成功！");
      },
      error: function (oError: any) {
        console.log(
          oWndInfo.szDeviceIdentify + "  调焦-失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}
// --------------------------------------录像查询---------------------------------------------------
let g_iSearchTimes = 0;

export function clickRecordSearch(iType: number) {
  const szDeviceIdentify = data.ip + "_" + data.port,
    iChannelID = 14,
    bZeroChannel = false,
    iStreamType = 1,
    szStartTime = data.szStartTime,
    szEndTime = data.szEndTime;
  if (!szStartTime || !szEndTime) {
    alert("请选择开始时间或者结束时间");
    return;
  }
  if (
    Date.parse(szEndTime.replace(/-/g, "/")) -
    Date.parse(szStartTime.replace(/-/g, "/")) <
    0
  ) {
    alert("开始时间大于结束时间");
    return;
  }
  if (null == szDeviceIdentify) {
    return;
  }
  if (bZeroChannel) {
    // 零通道不支持录像搜索
    return;
  }
  if (0 == iType) {
    // 首次搜索
    $("#searchlist").empty();
    g_iSearchTimes = 0;
  }
  //如果是前端设备，需要将搜索时间转换为UTC时间
  WebVideoCtrl.I_RecordSearch(
    szDeviceIdentify,
    iChannelID,
    szStartTime,
    szEndTime,
    {
      iStreamType: iStreamType,
      iSearchPos: g_iSearchTimes,
      success: function (xmlDoc: Document) {
        const RecordSearchStatus = $(xmlDoc)
          .find("responseStatusStrg")
          .eq(0)
          .text();
        if ("MORE" === RecordSearchStatus) {
          for (
            let i = 0, nLen = $(xmlDoc).find("searchMatchItem").length;
            i < nLen;
            i++
          ) {
            const szPlaybackURI = $(xmlDoc).find("playbackURI").eq(i).text();
            if (szPlaybackURI.indexOf("name=") < 0) {
              break;
            }
            const szStartTime = $(xmlDoc).find("startTime").eq(i).text();
            const szEndTime = $(xmlDoc).find("endTime").eq(i).text();
            const szFileName = szPlaybackURI.substring(
              szPlaybackURI.indexOf("name=") + 5,
              szPlaybackURI.indexOf("&size=")
            );
            const objTr = $("#searchlist").get(0).insertRow(-1);
            let objTd = objTr.insertCell(0);
            objTd.id = "downloadTd" + i;
            objTd.innerHTML = g_iSearchTimes + 1;
            objTd = objTr.insertCell(1);
            objTd.width = "30%";
            objTd.innerHTML = szFileName;
            objTd = objTr.insertCell(2);
            objTd.width = "30%";
            objTd.innerHTML = szStartTime.replace("T", " ").replace("Z", "");
            objTd = objTr.insertCell(3);
            objTd.width = "30%";
            objTd.innerHTML = szEndTime.replace("T", " ").replace("Z", "");
            objTd = objTr.insertCell(4);
            objTd.innerHTML =
              "<a href='javascript:;' onclick='clickStartDownloadRecord(" +
              g_iSearchTimes +
              ");'>下载</a>";
            $("#downloadTd" + g_iSearchTimes).data("fileName", szFileName);
            $("#downloadTd" + g_iSearchTimes).data(
              "playbackURI",
              szPlaybackURI
            );
            ++g_iSearchTimes;
          }
          clickRecordSearch(1); // 继续搜索
        } else if ("OK" === RecordSearchStatus) {
          const iLength = $(xmlDoc).find("searchMatchItem").length;
          for (let i = 0; i < iLength; i++) {
            const szPlaybackURI = $(xmlDoc).find("playbackURI").eq(i).text();
            if (szPlaybackURI.indexOf("name=") < 0) {
              break;
            }
            const szStartTime = $(xmlDoc).find("startTime").eq(i).text();
            const szEndTime = $(xmlDoc).find("endTime").eq(i).text();
            const szFileName = szPlaybackURI.substring(
              szPlaybackURI.indexOf("name=") + 5,
              szPlaybackURI.indexOf("&size=")
            );
            // 格式化日期时间字符串
            const formattedStartTime = szStartTime;
            const formattedEndTime = szEndTime;
            const objTr = $("#searchlist").get(0).insertRow(-1);
            let objTd = objTr.insertCell(0);
            objTd.id = "downloadTd" + i;
            objTd.innerHTML = g_iSearchTimes + 1;
            objTd = objTr.insertCell(1);
            objTd.width = "30%";
            objTd.innerHTML = szFileName;
            objTd = objTr.insertCell(2);
            objTd.width = "30%";
            objTd.innerHTML = formattedStartTime;
            objTd = objTr.insertCell(3);
            objTd.width = "30%";
            objTd.innerHTML = formattedEndTime;
            objTd = objTr.insertCell(4);
            objTd.width = "10%";
            $("#downloadTd" + g_iSearchTimes).data("fileName", szFileName);
            $("#downloadTd" + g_iSearchTimes).data(
              "playbackURI",
              szPlaybackURI
            );
            $("#downloadTd" + g_iSearchTimes).data(
              "startTime",
              formattedStartTime
            );
            $("#downloadTd" + g_iSearchTimes).data("endTime", formattedEndTime);
            ++g_iSearchTimes;
          }
          console.log(szDeviceIdentify + " 搜索录像文件成功！");

        } else if ("NO MATCHES" === RecordSearchStatus) {
          setTimeout(function () {
            g_iSearchTimes = 0;
            console.log(szDeviceIdentify + " 没有录像文件！");
          }, 50);
        }
      },
      error: function (oError: any) {
        g_iSearchTimes = 0;
        console.log(
          szDeviceIdentify + " 搜索录像文件失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    }
  );
}
// 开始回放
export function clickStartPlayback() {
  // WebVideoCtrl.I_Resize(width - 30, height)
  const oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex),
    szDeviceIdentify = data.ip,
    iRtspPort = data.port,
    iStreamType = 1,
    bZeroChannel = false,
    iChannelID = selectedChannel.value,
    szStartTime = data.szStartTime,
    szEndTime = data.szEndTime,
    bChecked = "",
    _iRet = -1;
  let szInfo = "";

  if (null == szDeviceIdentify) {
    return;
  }

  if (bZeroChannel) {
    // 零通道不支持回放
    return;
  }

  const startPlayback = function () {
    if (bChecked) {
      // 启用转码回放
      const oTransCodeParam = {
        TransFrameRate: "14", // 0：全帧率，5：1，6：2，7：4，8：6，9：8，10：10，11：12，12：16，14：15，15：18，13：20，16：22
        TransResolution: "1", // 255：Auto，3：4CIF，2：QCIF，1：CIF
        TransBitrate: "19", // 2：32K，3：48K，4：64K，5：80K，6：96K，7：128K，8：160K，9：192K，10：224K，11：256K，12：320K，13：384K，14：448K，15：512K，16：640K，17：768K，18：896K，19：1024K，20：1280K，21：1536K，22：1792K，23：2048K，24：3072K，25：4096K，26：8192K
      };
      WebVideoCtrl.I_StartPlayback(szDeviceIdentify, {
        iRtspPort: iRtspPort,
        iStreamType: iStreamType,
        iChannelID: iChannelID,
        szStartTime: szStartTime,
        szEndTime: szEndTime,
        oTransCodeParam: oTransCodeParam,
        success: function () {
          szInfo = "开始回放成功！";
          console.log(szDeviceIdentify + " " + szInfo);
        },
        error: function (oError: any) {
          szInfo = "开始回放失败！";
          console.log(
            szDeviceIdentify + szInfo,
            oError.errorCode,
            oError.errorMsg
          );
        },
      });
    } else {
      WebVideoCtrl.I_StartPlayback(szDeviceIdentify, {
        iRtspPort: iRtspPort,
        iStreamType: iStreamType,
        iChannelID: iChannelID,
        szStartTime: szStartTime,
        szEndTime: szEndTime,
        success: function () {
          szInfo = "开始回放成功！";
          console.log(szDeviceIdentify + " " + szInfo);
        },
        error: function (oError: any) {
          szInfo = "开始回放失败！";
          console.log(
            szDeviceIdentify + szInfo,
            oError.errorCode,
            oError.errorMsg
          );
        },
      });
    }
  };

  if (oWndInfo != null) {
    // 已经在播放了，先停止
    WebVideoCtrl.I_Stop({
      success: function () {
        startPlayback();
      },
    });
  } else {
    startPlayback();
  }
}










export function clickGoPreset(index: number | undefined, ip?: any) {
  console.log(index, "我是预置位");

  const oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex),
    iPresetID = index; // index 已经是 number 类型，直接使用
  if (oWndInfo != null) {
    WebVideoCtrl.I_GoPreset(iPresetID, {
      success: function () {
        // clickStartRealPlay(ip);
        ElMessage("调用预置点成功");
        console.log(oWndInfo.szDeviceIdentify + " 调用预置点成功！");
      },
      error: function (oError: any) {
        console.log(
          oWndInfo.szDeviceIdentify + " 调用预置点失败！",
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}
// 停止回放
export function clickStopPlayback() {
  var oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex),
    szInfo = "";

  if (oWndInfo != null) {
    WebVideoCtrl.I_Stop({
      success: function () {
        szInfo = "停止回放成功！";
        console.log(oWndInfo.szDeviceIdentify + " " + szInfo);
      },
      error: function (oError) {
        szInfo = "停止回放失败！";
        console.log(
          szDeviceIdentify + szInfo,
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}





// 快放
export function clickPlayFast() {
  var oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex),
    szInfo = "";

  if (oWndInfo != null) {
    WebVideoCtrl.I_PlayFast({
      success: function () {
        szInfo = "快放成功！";
        console.log(oWndInfo.szDeviceIdentify + " " + szInfo);
      },
      error: function (oError) {
        szInfo = "快放失败！";
        console.log(
          oWndInfo.szDeviceIdentify + szInfo,
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}

// 慢放
export function clickPlaySlow() {
  var oWndInfo = WebVideoCtrl.I_GetWindowStatus(g_iWndIndex),
    szInfo = "";
  if (oWndInfo != null) {
    WebVideoCtrl.I_PlaySlow({
      success: function () {
        szInfo = "慢放成功！";
        console.log(oWndInfo.szDeviceIdentify + " " + szInfo);
      },
      error: function (oError) {
        szInfo = "慢放失败！";
        console.log(
          oWndInfo.szDeviceIdentify + szInfo,
          oError.errorCode,
          oError.errorMsg
        );
      },
    });
  }
}