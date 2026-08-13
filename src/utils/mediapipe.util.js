import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { createCanvas, loadImage } from 'canvas';

let poseLandmarkerInstance = null;

const initializeMediaPipe = async () => {
    if (poseLandmarkerInstance) return poseLandmarkerInstance;

    console.log("⏳ [MediaPipe] AI 포즈 모델 초기화 중... (초기 1회만 실행)");
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    poseLandmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "CPU"
        },
        runningMode: "IMAGE",
        numPoses: 1
    });

    console.log("✅ [MediaPipe] 모델 초기화 완료!");
    return poseLandmarkerInstance;
};

const calculateDistance = (point1, point2) => {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
};

export const extractBodyLandmarks = async (imagePath) => {
    try {
        console.log(`📸 [MediaPipe] 1차 뼈대 추출 시작 (메모리 버퍼 스캔 중...)`);
        
        const poseLandmarker = await initializeMediaPipe();

        const image = await loadImage(imageBuffer);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, image.width, image.height);

        const result = poseLandmarker.detect(imageData);

        if (!result.landmarks || result.landmarks.length === 0) {
            throw new Error("사진에서 사람의 관절을 인식하지 못했습니다.");
        }

        const landmarks = result.landmarks[0];

        // 11: 왼쪽 어깨, 12: 오른쪽 어깨
        // 23: 왼쪽 골반, 24: 오른쪽 골반
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        // 어깨 너비와 골반 너비 계산
        const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);
        const pelvisWidth = calculateDistance(leftHip, rightHip);

        // 어깨 대비 골반 비율 계산
        const shoulderToPelvisRatio = parseFloat((shoulderWidth / pelvisWidth).toFixed(2));
        
        // 허리가 잘록한지 여부 (골반 너비 대비 어깨 15%)
        const isWaistNarrow = shoulderToPelvisRatio > 1.15;

        console.log(`📊 [MediaPipe 계산 완료] 어깨/골반 비율: ${shoulderToPelvisRatio}`);

        return {
            shoulderToPelvisRatio,
            isWaistNarrow
        };

    } catch (error) {
        console.error("🔥 [MediaPipe] 추출 에러:", error.message);
        return { shoulderToPelvisRatio: 1.15, isWaistNarrow: true };
    }
};