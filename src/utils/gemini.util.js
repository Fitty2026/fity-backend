import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import 'dotenv/config';

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-lite",
    generationConfig: {
        temperature: 0.1 
    }
});

const bufferToGenerativePart = (buffer, mimeType) => {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
};

export const analyzeWithGemini = async ({ images, ratios, userSelectedBodyType }) => { 
    try {
        const imageParts = images.map(img => bufferToGenerativePart(img.buffer, img.mimeType));
        const targetBodyType = userSelectedBodyType || "미설정";
        console.log(`🤖 [Gemini 호출] 유저 선택 체형: ${targetBodyType}`);
        
        const prompt = `
당신은 최고의 패션 스타일리스트이자 정밀 체형 분석 AI입니다.
사용자의 사진 3장과 MediaPipe 비율 데이터(어깨/골반 비율: ${ratios?.shoulderToPelvisRatio || 1.1})를 바탕으로 사용자의 체형을 분석하세요.

[🚨 1순위 필수 확인: 3장 모두 전신 포함 여부 🚨]
입력된 사진 3장을 각각 철저히 검사하세요. 
정면, 측면, 후면의 전신이 '3장 모두'에 빠짐없이 온전히 포함되어 있어야 합니다.
만약 사진 3장 중 단 한 장이라도 사람이 없거나, 신체 일부가 잘려 있거나, 구도(정면/측면/후면)를 알아볼 수 없다면 분석을 즉각 중단하고 반드시 아래 JSON만 반환하세요.
{
  "isPersonDetected": false
}

[🚨 절대 엄수: 사전 선택된 체형 강제 지시사항 🚨]
* 사용자가 사전에 선택한 대분류 체형은 '${targetBodyType}' 입니다.
* 반드시 사용자가 선택한 대분류에 해당하는 상세 체형 중 하나를 골라 "bodyType" 필드에 출력하세요.
  - STRAIGHT 선택 시: SLIM_STRAIGHT, STANDARD_STRAIGHT, SOFT_STRAIGHT 중 택 1
  - WAVE 선택 시: SLIM_WAVE, CURVY_WAVE, SOFT_WAVE 중 택 1
  - NATURAL 선택 시: SLIM_NATURAL, FRAME_NATURAL, ATHLETIC_NATURAL 중 택 1
* 사전 선택과 모순되는 체형은 절대 반환하지 마세요.

[분석 지시사항]
3장의 사진 모두 전신이 온전하게 잘 인식되었다면, 한국인 평균 체형을 기준으로 가장 현실적이고 오차 없는 추정치(Float, 소수점 첫째자리)를 계산하세요. 
상체 비율(upperBodyRatio)과 하체 비율(lowerBodyRatio)의 합은 무조건 100이 되어야 합니다.
응답은 반드시 아래 JSON 형식이어야 하며, 마크다운(\`\`\`json)이나 다른 설명은 절대 포함하지 마세요.

{
  "isPersonDetected": true,
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
    "bodyType": "(위에서 지시한 상세 체형 9가지 중 1개)",
    "upperBodyRatio": (정수 비율),
    "lowerBodyRatio": (정수 비율),
    "bodyBalance": "(UPPER_BODY_DEVELOPED, BALANCED, LOWER_BODY_DEVELOPED 중 택1)",
    "shoulderWidth": "(NARROW, AVERAGE, WIDE 중 택1)",
    "frameSize": "(SMALL, MEDIUM, LARGE 중 택1)"
  }
}`;

        const result = await model.generateContent([prompt, ...imageParts]);
        const text = result.response.text();

        const cleanJsonText = text.replace(/```json|```/g, "").trim();
        const parsedData = JSON.parse(cleanJsonText);

        if (parsedData.isPersonDetected === false) {
            throw new Error("PERSON_NOT_DETECTED"); 
        }

        return parsedData;

    } catch (error) {
        console.error("🔥 [Gemini] 분석 실패:", error);
        throw error; 
    }
};