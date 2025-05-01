/**
 * @description: webRTC工具函数，用于处理WebRTC连接和媒体流。
 */

import { ref } from 'vue';

// 信令服务器地址，在实际项目中应该替换为真实的信令服务器
const SIGNALING_SERVER = 'wss://your-signaling-server.com';

// 存储连接状态
export const connectionState = ref('disconnected');
// 存储传输进度
export const transferProgress = ref(0);
// 存储连接ID，用于标识当前连接
export const connectionId = ref('');
// 文件传输是否完成
export const isTransferComplete = ref(false);

// 存储 RTCPeerConnection 实例
let peerConnection: RTCPeerConnection | null = null;
// 存储数据通道
let dataChannel: RTCDataChannel | null = null;
// 存储 WebSocket 连接
let signalSocket: WebSocket | null = null;

// 存储文件信息
let fileInfo = {
  name: '',
  size: 0,
  type: ''
};

// 存储文件分块
const CHUNK_SIZE = 16 * 1024; // 16KB
let fileChunks: ArrayBuffer[] = [];
let currentChunk = 0;

/**
 * 生成随机ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * 初始化WebRTC连接
 */
export function initRTC() {
  connectionState.value = 'initializing';
  
  // 生成连接ID
  connectionId.value = generateId();
  
  // 创建并配置 RTCPeerConnection
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  peerConnection = new RTCPeerConnection(config);
  
  // 监听ICE候选
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal({
        type: 'candidate',
        candidate: event.candidate,
        id: connectionId.value
      });
    }
  };
  
  // 监听连接状态变化
  peerConnection.onconnectionstatechange = () => {
    connectionState.value = peerConnection?.connectionState || 'disconnected';
    
    if (peerConnection?.connectionState === 'disconnected' || 
        peerConnection?.connectionState === 'failed') {
      closeConnection();
    }
  };
  
  // 初始化信令服务器连接
  connectToSignalingServer();
  
  return connectionId.value;
}

/**
 * 连接到信令服务器
 */
function connectToSignalingServer() {
  try {
    signalSocket = new WebSocket(SIGNALING_SERVER);
    
    signalSocket.onopen = () => {
      console.log('已连接到信令服务器');
    };
    
    signalSocket.onmessage = (event) => {
      const signal = JSON.parse(event.data);
      handleSignal(signal);
    };
    
    signalSocket.onerror = (error) => {
      console.error('信令服务器连接错误:', error);
      connectionState.value = 'failed';
    };
    
    signalSocket.onclose = () => {
      console.log('信令服务器连接关闭');
    };
  } catch (error) {
    console.error('连接信令服务器失败:', error);
    connectionState.value = 'failed';
  }
}

/**
 * 发送信令
 */
function sendSignal(signal: any) {
  if (signalSocket && signalSocket.readyState === WebSocket.OPEN) {
    signalSocket.send(JSON.stringify(signal));
  }
}

/**
 * 处理信令
 */
function handleSignal(signal: any) {
  if (!peerConnection) return;
  
  switch(signal.type) {
    case 'offer':
      peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer))
        .then(() => peerConnection!.createAnswer())
        .then(answer => peerConnection!.setLocalDescription(answer))
        .then(() => {
          sendSignal({
            type: 'answer',
            answer: peerConnection!.localDescription,
            id: connectionId.value
          });
        })
        .catch(error => console.error('处理offer信令错误:', error));
      break;
      
    case 'answer':
      peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer))
        .catch(error => console.error('处理answer信令错误:', error));
      break;
      
    case 'candidate':
      peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate))
        .catch(error => console.error('处理candidate信令错误:', error));
      break;
      
    case 'ready':
      // 远程对等方已准备好接收文件
      if (dataChannel) {
        sendFileInfo();
      }
      break;
      
    case 'file-received':
      // 文件已成功接收
      isTransferComplete.value = true;
      transferProgress.value = 100;
      connectionState.value = 'completed';
      break;
  }
}

/**
 * 创建用于发送文件的数据通道
 */
export function createSenderDataChannel() {
  if (!peerConnection) {
    initRTC();
  }
  
  dataChannel = peerConnection!.createDataChannel('fileTransfer', {
    ordered: true
  });
  
  setupDataChannel();
  
  // 创建并发送offer
  peerConnection!.createOffer()
    .then(offer => peerConnection!.setLocalDescription(offer))
    .then(() => {
      sendSignal({
        type: 'offer',
        offer: peerConnection!.localDescription,
        id: connectionId.value
      });
    })
    .catch(error => console.error('创建offer失败:', error));
}

/**
 * 设置数据通道事件监听
 */
function setupDataChannel() {
  if (!dataChannel) return;
  
  dataChannel.onopen = () => {
    console.log('数据通道已打开');
    connectionState.value = 'connected';
  };
  
  dataChannel.onclose = () => {
    console.log('数据通道已关闭');
  };
  
  dataChannel.onerror = (error) => {
    console.error('数据通道错误:', error);
  };
  
  dataChannel.onmessage = handleDataChannelMessage;
}

/**
 * 处理接收到的数据通道消息
 */
function handleDataChannelMessage(event: MessageEvent) {
  const message = JSON.parse(event.data);
  
  switch(message.type) {
    case 'file-info':
      // 收到文件信息
      fileInfo = message.info;
      sendSignal({ type: 'ready', id: connectionId.value });
      break;
      
    case 'file-chunk':
      // 收到文件块
      receiveFileChunk(message.chunk, message.index, message.total);
      break;
      
    case 'file-complete':
      // 文件传输完成
      assembleFile();
      break;
  }
}

/**
 * 发送文件信息
 */
function sendFileInfo() {
  if (!dataChannel || dataChannel.readyState !== 'open') return;
  
  dataChannel.send(JSON.stringify({
    type: 'file-info',
    info: fileInfo
  }));
}

/**
 * 接收文件块
 */
function receiveFileChunk(chunk: ArrayBuffer, index: number, total: number) {
  fileChunks[index] = chunk;
  const progress = Math.round((index + 1) / total * 100);
  transferProgress.value = progress;
}

/**
 * 组装文件并下载
 */
function assembleFile() {
  const blob = new Blob(fileChunks, { type: fileInfo.type });
  fileChunks = []; // 清空缓存
  
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileInfo.name;
  a.click();
  
  // 通知发送方文件已接收
  sendSignal({
    type: 'file-received',
    id: connectionId.value
  });
  
  isTransferComplete.value = true;
  transferProgress.value = 100;
}

/**
 * 发送文件
 * @param file 要发送的文件
 */
export function sendFile(file: File) {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    console.error('数据通道未打开');
    return false;
  }
  
  isTransferComplete.value = false;
  transferProgress.value = 0;
  
  // 设置文件信息
  fileInfo = {
    name: file.name,
    size: file.size,
    type: file.type
  };
  
  // 准备发送文件
  const reader = new FileReader();
  reader.onload = (e) => {
    const fileData = e.target?.result as ArrayBuffer;
    sendFileInChunks(fileData);
  };
  
  reader.readAsArrayBuffer(file);
  return true;
}

/**
 * 分块发送文件
 */
function sendFileInChunks(fileData: ArrayBuffer) {
  const totalChunks = Math.ceil(fileData.byteLength / CHUNK_SIZE);
  currentChunk = 0;
  
  const sendNextChunk = () => {
    if (currentChunk < totalChunks) {
      const begin = currentChunk * CHUNK_SIZE;
      const end = Math.min(fileData.byteLength, begin + CHUNK_SIZE);
      const chunk = fileData.slice(begin, end);
      
      dataChannel!.send(JSON.stringify({
        type: 'file-chunk',
        chunk: chunk,
        index: currentChunk,
        total: totalChunks
      }));
      
      transferProgress.value = Math.round((currentChunk + 1) / totalChunks * 100);
      currentChunk++;
      
      // 当dataChannel的缓冲区清空时继续发送下一个块
      if (dataChannel!.bufferedAmount === 0) {
        sendNextChunk();
      } else {
        // 如果缓冲区满了，等待缓冲区清空再继续
        setTimeout(sendNextChunk, 100);
      }
    } else {
      // 所有块已发送，通知接收方文件传输完成
      dataChannel!.send(JSON.stringify({
        type: 'file-complete'
      }));
    }
  };
  
  sendNextChunk();
}

/**
 * 接收文件功能 - 初始化
 * @param id 连接ID，用于接收特定的文件传输
 */
export function initFileReceiver(id: string) {
  connectionId.value = id;
  isTransferComplete.value = false;
  transferProgress.value = 0;
  fileChunks = [];
  
  initRTC();
  
  // 监听数据通道
  peerConnection!.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };
}

/**
 * 关闭WebRTC连接
 */
export function closeConnection() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  if (signalSocket) {
    signalSocket.close();
    signalSocket = null;
  }
  
  connectionState.value = 'disconnected';
}

/**
 * 生成取件码
 */
export function generatePickupCode() {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  return code;
}

/**
 * 验证取件码
 * @param code 取件码
 */
export function validatePickupCode(code: string) {
  // 在实际应用中，这里应该向服务器验证取件码
  return new Promise<string>((resolve, reject) => {
    // 模拟验证过程
    setTimeout(() => {
      if (code && code.length === 6) {
        resolve(code);
      } else {
        reject(new Error('无效的取件码'));
      }
    }, 300);
  });
}


