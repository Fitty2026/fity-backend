import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  errorFormat: 'minimal',
});

//CLOSET-01
export const requestSyncService = async (userId, platformName, isAgreed) => {
    //임시 1번 유저 만드는 코드이므로 나중에 없앨 예정
    await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId }
    });

    // 유저 동의 기록 저장
    await prisma.consentLog.create({
        data: {
            userId: userId,
            target: platformName,
            isAgreed: isAgreed
        }
    });

    //쇼핑 플랫폼 정보 조회
    const platform = await prisma.shoppingPlatform.upsert({
        where: { platformName: platformName },
        update: {},
        create: { platformName: platformName }
    });

    //연동 세션 생성
    const session = await prisma.importSession.create({
        data: {
            userId: userId,
            platformId: platform.id,
            status: "PROCESSING"
        }
    });

    return {
        sync_id: session.id,
        platform: platform.platformName,
        status: session.status
    };
};

//CLOSET-02
export const requestItemRegistration = async (userId, category, importType, imageUrl, name, size) => {
    
    //Image Asset생성
    const newImage = await prisma.imageAsset.create({
        data: {
            imageUrl: imageUrl 
        }
    });

    //이미지 에셋에서 이미지 id받으면 아이템 목록 생성
    const newItem = await prisma.closetItem.create({
        data: {
            userId: userId,
            imageId: newImage.id,
            name: name,
            size: size,
            category: category,
            importType: importType
        }
    });
    return {
        item_id: newItem.id,
        name: newItem.name,
        size: newItem.size,
        category: newItem.category,
        import_type: newItem.importType
    };
};

//CLOSET-03
export const requestItemList = async (userId, category, keyword) => {
    const whereCondition = { userId: userId };
    if (category) {
        whereCondition.category = category;
    }
    if (keyword) {
        whereCondition.name = {
            contains: keyword
        };
    }
    const items = await prisma.closetItem.findMany({
        where: whereCondition,
        include: {
            imageAsset: true 
        },
        orderBy: {
            createdAt: 'desc' 
        }
    });

    return items.map(item => ({
        item_id: item.id,
        name: item.name,
        size: item.size,
        category: item.category,
        import_type: item.importType,
        image_url: item.imageAsset?.imageUrl || null 
    }));
};

export const requestItemUpdate = async (itemId, name, size, category, importType, tags) => {
    
    const updateData = {
        name: name,
        size: size,
        category: category,
        importType: importType
    };

    //태그수정
    if (tags !== undefined) {
        updateData.tags = {
            deleteMany: {},
            create: tags.map(tag => ({ tagName: tag })) 
        };
    }
    const updatedItem = await prisma.closetItem.update({
        where: { id: itemId },
        data: updateData,
        include: {
            tags: true
        }
    });

    return {
        item_id: updatedItem.id,
        name: updatedItem.name,
        size: updatedItem.size,
        category: updatedItem.category,
        import_type: updatedItem.importType,
        tags: updatedItem.tags.map(t => t.tagName), 
        updated_at: updatedItem.updatedAt
    };
};

//CLOSET-06 아이템 삭제
export const requestItemDelete = async (itemId) => {
    await prisma.closetItem.delete({
        where: { 
            id: itemId 
        }
    });

    return true;
};