export function rtcVidoe(vdo: any, url: string) {
  let webrtc: any, webrtcSendChannel: any
  startPlay()
  function startPlay() {
    webrtc = new RTCPeerConnection({
      sdpSemantics: "unified-plan",
    } as any)
    webrtc.onnegotiationneeded = handleNegotiationNeeded
    webrtc.ontrack = function (event: any) {
      vdo.srcObject = event.streams[0]
      vdo.play()
    }
    webrtc.addTransceiver("video", {
      direction: "sendrecv",
    })
    webrtcSendChannel = webrtc.createDataChannel("foo")

    webrtcSendChannel.onclose = () => {
      startPlay()
    }
    let webrtcSendChannel: any
    let webrtcSendChannelInterval: any
    webrtcSendChannel.onopen = () => {
      webrtcSendChannel.send("ping")
      webrtcSendChannelInterval = 0
      webrtcSendChannelInterval = setInterval(() => {
        webrtcSendChannel.send("ping")
      }, 1000)
    }

    webrtcSendChannel.onmessage = (e: any) => console.log(e.data)
  }
  async function handleNegotiationNeeded() {
    const offer = await webrtc.createOffer()
    await webrtc.setLocalDescription(offer)
    $.post(
      url,
      {
        data: btoa(webrtc.localDescription.sdp),
      },
      (data: any) => {
        try {
          webrtc.setRemoteDescription(
            new RTCSessionDescription({
              type: "answer",
              sdp: atob(data),
            }),
          )
        }
        catch (e) {
          console.warn(e)
        }
      },
    )
  }

  vdo.addEventListener("loadeddata", () => {
    vdo.play()
  })

  vdo.addEventListener("error", () => {
    console.log("video1 err.")
  })
}
