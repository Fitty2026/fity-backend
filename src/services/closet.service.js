//SCR-CLO-001
exports.saveImportType = (importType) => {
    console.log(`등록방식: ${importType}`);
    return{
        closet_import_type: importType
    };
};

//SCR-CLO-004
exports.updateItemTags = (itemId, tagValues) => {
    console.log(`아이템ID: ${itemId}, 업데이트된 태그: ${tagValues}`);
    return{
        closet_items:[
            {
                item_id: Number(itemId),
                status: "active"
            }
        ],
        item_tags: tagValues
    };
};

//SCR-CLO-005
exports.fetchClosetList = (filter, sort, search) => {
    console.log(`요청된 쿼리 filter: ${filter}, sort: ${sort}, search: ${search}`);
    return{
        category_count: {
            TOTAL: 12,
            TOP: 5,
            BOTTOM: 4,
            OUTER: 1,
            SHOES: 2
        },
        closet_items:[
            {
                item_id: 1,
                image_url: "1번아이템url.jpg",
                category:  "TOP",
                tags: ["캐주얼", "검은색"],
                created_at: "2026-07-11"
            },
            {
                item_id: 2,
                image_url: "2번아이템url.jpg",
                category:"BOTTOM",
                tags:["데님", "와이드"],
                created_at: "2026-07-10"
            }
        ]
    };
};