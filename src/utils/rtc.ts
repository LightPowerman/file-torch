/**
 * @description: webRTC工具函数，用于处理WebRTC连接和媒体流。
 * 特别适配局域网文件传输场景，支持点对点大文件传输。
 */

import { ref, reactive } from "vue";

// --- 信令消息类型定义 (新增) ---
export type SignalMessage =
  | { type: "offer"; payload: RTCSessionDescriptionInit }
  | { type: "answer"; payload: RTCSessionDescriptionInit }
  | { type: "candidate"; payload: RTCIceCandidateInit | RTCIceCandidate }; // 允许多种类型

// --- 用于存储信令发送回调 (新增) ---
let sendSignalMessageCallback: ((message: SignalMessage) => void) | null = null;

// 分片大小：64KB，可根据实际网络情况调整
const CHUNK_SIZE = 64 * 1024;

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

// 连接状态
export const connectionState = ref<"disconnected" | "connecting" | "connected">(
  "disconnected"
);

// 传输进度
export const transferProgress = reactive({
  current: 0,
  total: 0,
  percentage: 0,
  fileName: "",
  speed: 0 // 速度 (bytes/s)
});

// 存储连接相关对象
const rtcObjects = reactive({
  peerConnection: null as RTCPeerConnection | null,
  dataChannel: null as RTCDataChannel | null
  // 注意：不再需要手动管理 pendingCandidates，因为我们会立即发送
  // pendingCandidates: [] as RTCIceCandidate[]
});

// 传输控制
const transferControl = reactive({
  fileReader: null as FileReader | null,
  receivedBuffers: [] as ArrayBuffer[],
  receivedSize: 0,
  fileSize: 0,
  fileName: "",
  fileType: "",
  startTime: 0,
  isReceiving: false
});

/**
 * 初始化WebRTC连接
 * @param onSignalMessageToSend 当有信令消息需要发送时调用的回调函数 (新增)
 * @param iceServers ICE服务器配置，局域网环境可传入空数组
 * @returns 返回初始化信息
 */

export const initializeConnection = (
  onSignalMessageToSend: (message: SignalMessage) => void, // 新增参数
  iceServers: RTCIceServer[] = []
) => {
  // 存储回调函数 (新增)
  sendSignalMessageCallback = onSignalMessageToSend;

  // 创建RTCPeerConnection对象
  rtcObjects.peerConnection = new RTCPeerConnection({
    iceServers
  });

  connectionState.value = "connecting";

  // 监听ICE候选者
  rtcObjects.peerConnection.onicecandidate = event => {
    if (event.candidate && sendSignalMessageCallback) {
      // rtcObjects.pendingCandidates.push(event.candidate);

      // 直接通过回调发送 Candidate (修改)
      sendSignalMessageCallback({
        type: "candidate",
        payload: event.candidate.toJSON() // 使用 toJSON() 获取可序列化的对象
      });
    }
  };

  // 监听连接状态变化
  rtcObjects.peerConnection.onconnectionstatechange = () => {
    if (rtcObjects.peerConnection) {
      if (rtcObjects.peerConnection.connectionState === "connected") {
        connectionState.value = "connected";
      } else if (
        ["disconnected", "failed", "closed"].includes(
          rtcObjects.peerConnection.connectionState
        )
      ) {
        connectionState.value = "disconnected";
      }
    }
  };

  // 返回的接口中不再需要 getPendingCandidates 和 clearPendingCandidates (修改)
  return {
    createOffer,
    createAnswer,
    setRemoteDescription, // 需要导出 setRemoteDescription 供外部调用
    addIceCandidate,
    closeConnection
    // getPendingCandidates: () => [...rtcObjects.pendingCandidates],
    // clearPendingCandidates: () => {
    //   rtcObjects.pendingCandidates = [];
    // }
  };
};

/**
 * 创建发送方数据通道
 * @param channelId 通道标识
 * @returns 数据通道对象
 */
export const createSenderChannel = (channelId: string = "fileTransfer") => {
  if (!rtcObjects.peerConnection) {
    throw new Error("请先初始化RTCPeerConnection");
  }

  // 创建数据通道
  rtcObjects.dataChannel = rtcObjects.peerConnection.createDataChannel(
    channelId,
    {
      ordered: true // 保证数据有序传输
    }
  );

  // 设置数据通道事件监听
  setupDataChannelEvents(rtcObjects.dataChannel);

  return rtcObjects.dataChannel;
};

/**
 * 接收方监听数据通道
 */
export const listenForDataChannel = () => {
  if (!rtcObjects.peerConnection) {
    throw new Error("请先初始化RTCPeerConnection");
  }

  // 监听远程数据通道
  rtcObjects.peerConnection.ondatachannel = event => {
    rtcObjects.dataChannel = event.channel;
    setupDataChannelEvents(rtcObjects.dataChannel);
  };
};

/**
 * 设置数据通道事件
 * @param channel 数据通道
 */
const setupDataChannelEvents = (channel: RTCDataChannel) => {
  channel.onopen = () => {
    console.log("数据通道已打开");
    connectionState.value = "connected";
  };

  channel.onclose = () => {
    console.log("数据通道已关闭");
    connectionState.value = "disconnected";
  };

  channel.onerror = error => {
    console.error("数据通道错误:", error);
  };

  // 接收数据
  channel.onmessage = event => {
    const data = event.data;

    // 如果是字符串，则为控制消息
    if (typeof data === "string") {
      const message = JSON.parse(data);

      // 文件开始传输消息
      if (message.type === "file-start") {
        transferControl.fileName = message.fileName;
        transferControl.fileSize = message.fileSize;
        transferControl.fileType = message.fileType;
        transferControl.receivedBuffers = [];
        transferControl.receivedSize = 0;
        transferControl.isReceiving = true;
        transferControl.startTime = Date.now();

        // 更新UI
        transferProgress.current = 0;
        transferProgress.total = message.fileSize;
        transferProgress.percentage = 0;
        transferProgress.fileName = message.fileName;

        console.log(
          `开始接收文件: ${message.fileName}, 大小: ${message.fileSize} 字节`
        );
      }
      // 文件结束传输消息
      else if (message.type === "file-end") {
        // 将所有接收到的buffer合并成一个完整的文件
        const fileData = new Blob(transferControl.receivedBuffers, {
          type: transferControl.fileType
        });

        // 创建下载链接
        const url = URL.createObjectURL(fileData);
        const a = document.createElement("a");
        a.href = url;
        a.download = transferControl.fileName;
        a.click();
        URL.revokeObjectURL(url);

        // 重置状态
        transferControl.receivedBuffers = [];
        transferControl.receivedSize = 0;
        transferControl.isReceiving = false;

        console.log(`文件 ${transferControl.fileName} 接收完成`);
      }
    }
    // 如果是二进制数据（ArrayBuffer），则为文件数据块
    else if (data instanceof ArrayBuffer) {
      if (transferControl.isReceiving) {
        transferControl.receivedBuffers.push(data);
        transferControl.receivedSize += data.byteLength;

        // 计算传输速度
        const elapsedTime = (Date.now() - transferControl.startTime) / 1000; // 秒
        transferProgress.speed = Math.round(
          transferControl.receivedSize / elapsedTime
        );

        // 更新进度
        transferProgress.current = transferControl.receivedSize;
        transferProgress.percentage = Math.round(
          (transferControl.receivedSize / transferControl.fileSize) * 100
        );
      }
    }
  };
};

/**
 * 发送文件
 * @param file 要发送的文件
 * @returns 发送状态的Promise
 */
export const sendFile = (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (
      !rtcObjects.dataChannel ||
      rtcObjects.dataChannel.readyState !== "open"
    ) {
      reject(new Error("数据通道未打开"));
      return;
    }

    const fileReader = new FileReader();
    const fileName = file.name;
    const fileSize = file.size;
    const fileType = file.type;
    let offset = 0;

    transferControl.fileReader = fileReader;
    transferControl.startTime = Date.now();

    // 更新UI状态
    transferProgress.fileName = fileName;
    transferProgress.total = fileSize;
    transferProgress.current = 0;
    transferProgress.percentage = 0;

    // 发送文件信息
    rtcObjects.dataChannel.send(
      JSON.stringify({
        type: "file-start",
        fileName,
        fileSize,
        fileType
      })
    );

    // 读取完成后发送数据
    fileReader.onload = e => {
      if (
        rtcObjects.dataChannel?.readyState === "open" &&
        e.target?.result instanceof ArrayBuffer
      ) {
        rtcObjects.dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;

        // 计算传输速度
        const elapsedTime = (Date.now() - transferControl.startTime) / 1000; // 秒
        transferProgress.speed = Math.round(offset / elapsedTime);

        // 更新进度
        transferProgress.current = offset;
        transferProgress.percentage = Math.round((offset / fileSize) * 100);

        // 继续读取文件下一块
        if (offset < fileSize) {
          readSlice(offset);
        } else {
          // 发送文件结束消息
          rtcObjects.dataChannel.send(
            JSON.stringify({
              type: "file-end"
            })
          );
          resolve(true);
        }
      }
    };

    fileReader.onerror = error => {
      console.error("文件读取错误:", error);
      reject(error);
    };

    // 读取文件分片
    const readSlice = (o: number) => {
      const slice = file.slice(offset, o + CHUNK_SIZE);
      fileReader.readAsArrayBuffer(slice);
    };

    // 开始读取第一块
    readSlice(0);
  });
};

/**
 * 取消文件传输
 */
export const cancelFileTransfer = () => {
  if (
    transferControl.fileReader &&
    transferControl.fileReader.readyState === 1
  ) {
    transferControl.fileReader.abort();
  }

  // 发送取消消息
  if (rtcObjects.dataChannel && rtcObjects.dataChannel.readyState === "open") {
    rtcObjects.dataChannel.send(
      JSON.stringify({
        type: "file-cancel"
      })
    );
  }

  // 重置状态
  transferControl.receivedBuffers = [];
  transferControl.receivedSize = 0;
  transferControl.isReceiving = false;
};

/**
 * 创建连接提议（发送方调用）
 * @returns Promise<void>
 */
export const createOffer = async (): Promise<void> => {
  if (!rtcObjects.peerConnection) {
    throw new Error("请先初始化RTCPeerConnection");
  }
  if (!sendSignalMessageCallback) {
    throw new Error("信令发送回调未设置");
  }

  // 创建发送方数据通道，确保在创建 Offer 前存在
  if (!rtcObjects.dataChannel) {
    createSenderChannel(); // 如果还没有，就创建默认的
    console.log("Data channel created by offerer");
  }
  // 确保监听数据通道也设置好，以防万一（虽然主要是接收方用）
  listenForDataChannel();

  const offer = await rtcObjects.peerConnection.createOffer();
  await rtcObjects.peerConnection.setLocalDescription(offer);
  console.log("发送 Offer:", offer);
  // 通过回调发送 Offer (修改)
  sendSignalMessageCallback({ type: "offer", payload: offer });
  // 不再返回 offer
};

/**
 * 创建连接应答（接收方调用）
 * @param offer 收到的SDP提议
 * @returns Promise<void>
 */
export const createAnswer = async (
  offer: RTCSessionDescriptionInit
): Promise<void> => {
  if (!rtcObjects.peerConnection) {
    throw new Error("请先初始化RTCPeerConnection");
  }
  if (!sendSignalMessageCallback) {
    throw new Error("信令发送回调未设置");
  }

  // 接收方需要监听数据通道事件
  listenForDataChannel();

  await rtcObjects.peerConnection.setRemoteDescription(
    new RTCSessionDescription(offer)
  );
  const answer = await rtcObjects.peerConnection.createAnswer();
  await rtcObjects.peerConnection.setLocalDescription(answer);
  // 通过回调发送 Answer (修改)
  sendSignalMessageCallback({ type: "answer", payload: answer });
};

/**
 * 设置远程描述（用于接收方设置 Offer 或 发送方设置 Answer）
 * 注意：此函数现在需要由外部代码在收到信令消息后调用
 * @param description SDP 描述 (Offer 或 Answer)
 */
export const setRemoteDescription = async (
  description: RTCSessionDescriptionInit
): Promise<void> => {
  if (!rtcObjects.peerConnection) {
    throw new Error("请先初始化RTCPeerConnection");
  }

  try {
    await rtcObjects.peerConnection.setRemoteDescription(
      new RTCSessionDescription(description)
    );
    console.log("Remote description 设置成功:", description.type);
  } catch (error) {
    console.error("设置 remote description 失败:", error, description);
    // 根据需要进行错误处理，例如关闭连接或通知用户
    throw error; // 重新抛出错误，让调用者知道
  }
};

/**
 * 添加ICE候选者 (用于处理从信令收到的 Candidate)
 * 注意：此函数现在需要由外部代码在收到信令消息后调用
 * @param candidate ICE候选者
 */
export const addIceCandidate = async (
  candidate: RTCIceCandidateInit | RTCIceCandidate // 接受两种类型
): Promise<void> => {
  if (!rtcObjects.peerConnection) {
    throw new Error("请先初始化RTCPeerConnection");
  }

  // 确保远程描述已经设置，否则 addIceCandidate 会报错
  if (!rtcObjects.peerConnection.remoteDescription) {
    console.warn(
      "尝试在设置 remote description 之前添加 ICE candidate，可能导致错误。将延迟添加。"
    );
    // 实际应用中可能需要将 candidate 暂存起来，等 remoteDescription 设置后再添加
    // 这里为了简化，暂时只打印警告
    // return; // 可以考虑先返回，或者尝试添加（可能会失败）
  }

  try {
    // 如果传入的是 RTCIceCandidate 对象，直接使用；否则创建新的
    const rtcCandidate =
      candidate instanceof RTCIceCandidate
        ? candidate
        : new RTCIceCandidate(candidate);
    await rtcObjects.peerConnection.addIceCandidate(rtcCandidate);
    console.log("ICE Candidate 添加成功");
  } catch (error: any) {
    console.error("添加 ICE Candidate 失败:", error, candidate);
    // 忽略 'Could not add ICE candidate' 错误有时是必要的，特别是当对等方状态不匹配时
    if (!error.message.includes("Could not add ICE candidate")) {
      throw error; // 重新抛出其他类型的错误
    }
  }
};

/**
 * 关闭连接
 */
export const closeConnection = (): void => {
  if (rtcObjects.dataChannel) {
    rtcObjects.dataChannel.close();
    rtcObjects.dataChannel = null;
  }

  if (rtcObjects.peerConnection) {
    rtcObjects.peerConnection.close();
    rtcObjects.peerConnection = null;
  }

  // 重置回调 (新增)
  sendSignalMessageCallback = null;

  connectionState.value = "disconnected";
  transferProgress.current = 0;
  transferProgress.total = 0;
  transferProgress.percentage = 0;
  transferProgress.fileName = "";
  transferProgress.speed = 0;
  console.log("连接已关闭");
};
