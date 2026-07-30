# Fitty Backend ERD

> 이 문서는 `prisma/schema.prisma`와 `prisma/migrations/*/migration.sql`을 기준으로 작성한 **현재 구현 스키마 ERD**입니다. 기획 단계의 목표 모델이 아니라, 현재 공유 브랜치에 정의된 MySQL 테이블·관계·제약조건을 나타냅니다.

![Fitty Backend ERD](./erd.png)

```mermaid
erDiagram
    USERS {
        int id PK
        string username UK "nullable, VARCHAR(30)"
        string email UK
        string password_hash "nullable, VARCHAR(60)"
        string name "nullable"
        json style_tags "nullable, legacy field"
        datetime createdAt
        datetime updatedAt
    }

    STYLE_TAGS {
        int id PK
        string code UK "VARCHAR(30)"
        string name UK "VARCHAR(50)"
        int display_order UK
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    USER_STYLE_PREFERENCES {
        int user_id PK, FK
        int style_tag_id PK, FK
        datetime created_at
    }

    BODY_PROFILES {
        int id PK
        int user_id FK, UK
        enum body_balance "nullable: UPPER_BODY_DEVELOPED, BALANCED, LOWER_BODY_DEVELOPED"
        enum shoulder_width "nullable: NARROW, AVERAGE, WIDE"
        enum frame_size "nullable: SMALL, MEDIUM, LARGE"
        datetime created_at
        datetime updated_at
    }

    IMAGE_ASSETS {
        int id PK
        int user_id FK
        enum image_type "PROFILE, BODY_PROFILE, CLOSET_ITEM, OUTFIT_RESULT"
        enum origin "USER_UPLOAD, GENERATED, FALLBACK"
        string storage_provider "VARCHAR(40)"
        string storage_key UK "VARCHAR(500)"
        string original_file_name "nullable, VARCHAR(255)"
        string mime_type "VARCHAR(100)"
        int file_size_bytes
        string checksum_sha256 "CHAR(64)"
        enum status "UPLOADING, ACTIVE, UPLOAD_FAILED, DELETE_PENDING, DELETE_FAILED, DELETED"
        datetime created_at
        datetime updated_at
        datetime deleted_at "nullable"
    }

    CLOSET_ITEMS {
        int id PK
        int user_id FK
        int image_id FK
        string name "VARCHAR(120)"
        string size "VARCHAR(60)"
        string category "VARCHAR(60)"
        string import_type "VARCHAR(60)"
        datetime created_at
        datetime updated_at
    }

    ITEM_TAGS {
        int id PK
        int closet_item_id FK
        string tag_name "VARCHAR(60)"
    }

    SHOPPING_PLATFORMS {
        int id PK
        string platform_name UK "VARCHAR(60)"
    }

    IMPORT_SESSIONS {
        int id PK
        int user_id FK
        int platform_id FK
        string status "VARCHAR(30)"
        datetime created_at
    }

    CONSENT_LOGS {
        int id PK
        int user_id FK
        string target "VARCHAR(60)"
        boolean is_agreed
        datetime created_at
    }

    OUTFIT_GENERATION_JOBS {
        int id PK
        int user_id FK
        enum status "QUEUED, PROCESSING, COMPLETED, FAILED"
        int body_profile_id FK "nullable"
        json closet_item_ids "not a foreign key"
        json style_tag_ids "not a foreign key"
        string failure_code "nullable, VARCHAR(80)"
        string failure_reason "nullable, VARCHAR(500)"
        datetime started_at "nullable"
        datetime completed_at "nullable"
        datetime created_at
        datetime updated_at
    }

    OUTFIT_RESULTS {
        int id PK
        int user_id FK
        int generation_job_id FK, UK
        string generated_image_url "VARCHAR(1000)"
        string provider "VARCHAR(80)"
        boolean fallback_used
        json recommended_closet_item_ids "not a foreign key"
        datetime created_at
    }

    SAVED_OUTFITS {
        int id PK
        int user_id FK
        int outfit_result_id FK
        string name "VARCHAR(120)"
        datetime created_at
    }

    USERS ||--o{ IMAGE_ASSETS : owns
    USERS ||--o{ CLOSET_ITEMS : owns
    IMAGE_ASSETS ||--o{ CLOSET_ITEMS : supplies
    CLOSET_ITEMS ||--o{ ITEM_TAGS : has

    USERS ||--o{ IMPORT_SESSIONS : starts
    SHOPPING_PLATFORMS ||--o{ IMPORT_SESSIONS : handles
    USERS ||--o{ CONSENT_LOGS : records

    USERS ||--o| BODY_PROFILES : has
    USERS ||--o{ USER_STYLE_PREFERENCES : selects
    STYLE_TAGS ||--o{ USER_STYLE_PREFERENCES : selected_by

    USERS ||--o{ OUTFIT_GENERATION_JOBS : requests
    BODY_PROFILES o|--o{ OUTFIT_GENERATION_JOBS : used_by
    OUTFIT_GENERATION_JOBS ||--o| OUTFIT_RESULTS : produces
    USERS ||--o{ OUTFIT_RESULTS : owns
    USERS ||--o{ SAVED_OUTFITS : saves
    OUTFIT_RESULTS ||--o{ SAVED_OUTFITS : referenced_by
```

## 핵심 관계와 제약조건

- `users`는 이미지, 옷장 아이템, 가져오기 세션, 동의 기록, 코디 생성 작업·결과·저장본을 소유합니다.
- `body_profiles.user_id`는 유일하므로 사용자당 신체 프로필은 최대 1개입니다.
- `user_style_preferences`는 `(user_id, style_tag_id)` 복합 기본키를 사용하는 사용자-스타일 태그 연결 테이블입니다.
- `outfit_results.generation_job_id`는 유일하므로 코디 생성 작업당 결과는 최대 1개입니다.
- `saved_outfits`는 `(user_id, outfit_result_id)`가 유일하므로 같은 사용자가 같은 결과를 중복 저장할 수 없습니다.
- `item_tags`는 `(closet_item_id, tag_name)`가 유일하므로 같은 옷장 아이템에 동일한 태그를 중복 등록할 수 없습니다.
- `outfit_generation_jobs.closet_item_ids`, `outfit_generation_jobs.style_tag_ids`, `outfit_results.recommended_closet_item_ids`는 JSON 값이며 관련 테이블을 참조하는 데이터베이스 외래키가 아닙니다.
- `outfit_results.generated_image_url`도 현재 `image_assets`와 외래키로 연결되어 있지 않습니다.
- `users.style_tags`는 기존 JSON 필드로 남아 있으며, 정규화된 현재 선호 관계는 `user_style_preferences`와 `style_tags`에 함께 정의되어 있습니다.

## 삭제 정책

- `user_style_preferences`의 사용자 삭제는 `CASCADE`, 스타일 태그 삭제는 `RESTRICT`입니다.
- `item_tags`는 연결된 옷장 아이템 삭제 시 `CASCADE`입니다.
- 코디 생성 작업의 신체 프로필 참조는 프로필 삭제 시 `SET NULL`입니다.
- 그 밖의 현재 외래키 관계는 모두 `RESTRICT`입니다.
