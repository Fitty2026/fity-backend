import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const genAI = new GoogleGenerativeAI("AQ.Ab8RN6IJT8XziHv-QYwEDfYtCUzJL2w9EwGQ0mT7MygPyvlK8A");
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

const bufferToGenerativePart = (buffer, mimeType) => {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
};

export const analyzeWithGemini = async ({ images, ratios }) => {
    try {
        const imageParts = images.map(img => bufferToGenerativePart(img.buffer, img.mimeType));
        
        const prompt = `
당신은 최고의 패션 스타일리스트이자 정밀 체형 분석 AI입니다.
사용자의 정면, 측면, 후면 사진 3장과 MediaPipe 비율 데이터(어깨/골반 비율: ${ratios?.shoulderToPelvisRatio || 1.1})를 바탕으로 사용자의 체형을 분석하세요.

[필수 조건]
2D 이미지이므로 실제 cm는 정확히 알 수 없으나, 한국인 평균 체형을 기준으로 가장 현실적이고 오차 없는 추정치(Float, 소수점 첫째자리)를 계산해 내세요. 
응답은 반드시 아래 JSON 형식이어야 하며, 마크다운(\`\`\`json)이나 다른 설명은 절대 포함하지 마세요.

{
  "measurements": {
    "shoulderWidth": 38.0,
    "chestCircumference": 85.0,
    "waistCircumference": 67.0,
    "hipCircumference": 92.0,
    "upperBodyLength": 61.0,
    "lowerBodyLength": 61.0,
    "legLength": 61.0
  },
  "bodyTypeResult": {
    "bodyType": "(SLIM_STRAIGHT, STRAIGHT, WAVE, NATURAL 중 택1)",
    "bodyTypeName": "(슬림 스트레이트, 스트레이트 체형, 웨이브 체형, 내추럴 체형 중 택1)",
    "description": "전체적으로 균형이 좋고 슬림한 체형이에요",
    "celebrities": ["강민경", "크리스탈", "차정원"],
    "upperBodyRatio": (정수 비율, 예: 47),
    "lowerBodyRatio": (정수 비율, 예: 53),
    "bodyBalance": "(UPPER_BODY_DEVELOPED, BALANCED, LOWER_BODY_DEVELOPED 중 택1)",
    "shoulderWidth": "(NARROW, AVERAGE, WIDE 중 택1)",
    "frameSize": "(SMALL, MEDIUM, LARGE 중 택1)"
  }
}`;

        const result = await model.generateContent([prompt, ...imageParts]);
        const text = result.response.text();

        const cleanJsonText = text.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanJsonText);

    } catch (error) {
        console.error("🔥 [Gemini] 분석 실패:", error);
        throw new Error("AI 체형 분석 통신 중 문제가 발생했습니다.");
    }
};