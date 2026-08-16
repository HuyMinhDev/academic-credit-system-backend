-- =========================================================
-- 1. users
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    birth_day       DATE,
    gender          VARCHAR(10),
    role            VARCHAR(50) NOT NULL DEFAULT 'student',
    avatar          VARCHAR(500),
    wallet_address  VARCHAR(42),
    deleted_by      INTEGER NOT NULL DEFAULT 0,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_is_deleted
    ON users (is_deleted);

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users (role);

INSERT INTO "public"."users" ("id", "name", "email", "password", "phone", "birth_day", "gender", "role", "avatar", "wallet_address", "deleted_by", "is_deleted", "deleted_at", "created_at", "updated_at") VALUES
(1, 'Admin', 'admin@gmail.com', '$2b$10$G5rGNI95LX.f6w0lJUCPEu6Dv7742sIRx7VtN1kfJpOO2LEzrJPOK', '0123456789', '2003-01-10', 'Male', 'admin', 'https://res.cloudinary.com/dczjneexr/image/upload/v1758479133/images/lzsb0hcsu6wn41pzjowp.jpg', '0xbe30ab8dadd07629ed8a6275e130a116a1ac4f0d', 0, 'f', NULL, '2026-07-27 18:18:12.730765+00', '2026-07-27 18:18:12.730765+00'),
(4, 'Nguyễn Minh Hoàng', 'huy@gmail.com', '$2b$10$1AjGBKKmErI5Kluikg3aqeS8krnqAvH9rYiM7iBe2XSHm8e1XI4Ia', '0912345678', '2000-10-01', 'Male', 'student', 'https://cdn.example.com/avatar.jpg', '0x290861455c508193064fa10a6dd8a4a35860deb8', 0, 'f', '2026-07-27 18:46:30.801+00', '2026-07-27 18:34:55.862+00', '2026-07-27 18:45:40.365+00'),
(5, 'user1', 'user1@gmail.com', '$2b$10$db1.ghNayD8nh6yiDcVsCejp1DDUqyRQNYryGJmRIPFEySN8DG7RK', '0912345678', '2000-10-01', 'Male', 'student', 'https://cdn.example.com/avatar.jpg', '0x5eeda158943ca57ec70ed41b73cc6c7491d4f9ba', 0, 'f', NULL, '2026-08-03 19:09:40.553+00', '2026-08-03 19:09:40.553+00');


-- =========================================================
-- 2. Bảng organizations — Cơ sở đào tạo
-- =========================================================

CREATE TABLE IF NOT EXISTS organizations (
    id                      SERIAL PRIMARY KEY,
    code                    VARCHAR(50)  NOT NULL UNIQUE,          -- Mã trường: "HCMUE", "HUST"
    name                    VARCHAR(255) NOT NULL,
    address                 TEXT,
    tax_code                VARCHAR(50),                          -- Mã số thuế
    representative_name     VARCHAR(255),                          -- Người đại diện pháp lý
    representative_email    VARCHAR(255),
    representative_phone    VARCHAR(50),

    -- Ví admin on-chain (đã grant DEFAULT_ADMIN_ROLE + ISSUER_ROLE)
    admin_wallet_address    VARCHAR(42)  NOT NULL UNIQUE,          -- 0x... (check EIP-55 checksum)
    admin_wallet_bound_at   TIMESTAMPTZ,
    admin_wallet_bound_by   INTEGER      REFERENCES users(id),    -- User trong bảng users đã verify ví này

    -- Soft delete
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    deleted_by              INTEGER      NOT NULL DEFAULT 0,
    deleted_at              TIMESTAMPTZ,

    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by              INTEGER      REFERENCES users(id),

    CONSTRAINT chk_admin_wallet_format CHECK (
        admin_wallet_address ~ '^0x[a-fA-F0-9]{40}$'
    )
);

CREATE INDEX idx_organizations_active ON organizations(is_active);
CREATE INDEX idx_organizations_admin_wallet ON organizations(admin_wallet_address);


-- =========================================================
-- 3. Bảng certificates — Chứng chỉ - ánh xạ on-chain
-- =========================================================

CREATE TABLE IF NOT EXISTS certificates (
    id                              SERIAL PRIMARY KEY,

    -- Liên kết on-chain (mapping từ tokenId)
    token_id                        BIGINT       NOT NULL UNIQUE,    -- uint256 từ CertificateManager
    chain_id                        INTEGER      NOT NULL DEFAULT 11155111,  -- Sepolia = 11155111
    contract_address                VARCHAR(42)  NOT NULL,           -- Địa chỉ CertificateManager đã deploy

    -- Hash on-chain (bytes32 dạng hex 0x...)
    certificate_code_hash           CHAR(66)     NOT NULL,           -- keccak256(mã chứng chỉ)
    document_hash                   CHAR(66)     NOT NULL,           -- keccak256(file PDF gốc)

    -- Mã chứng nhận plaintext (chỉ lưu ở DB để search; on-chain chỉ có hash)
    certificate_code                VARCHAR(100) NOT NULL,           -- "BC-2026-0001"

    -- Người nhận
    holder_user_id                  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    holder_wallet_address           VARCHAR(42)  NOT NULL,           -- ví nhận NFT

    -- Cơ sở cấp
    organization_id                 INTEGER      NOT NULL REFERENCES organizations(id),

    -- Người cấp (là admin_wallet_address của organization)
    issuer_wallet_address           VARCHAR(42)  NOT NULL,

    -- Thời gian
    issued_at                       TIMESTAMPTZ  NOT NULL,           -- block.timestamp
    expires_at                      TIMESTAMPTZ,                     -- NULL = không thời hạn

    -- Trạng thái (sync từ on-chain: struct Certificate.status)
    status                          VARCHAR(20)  NOT NULL DEFAULT 'Active'
                                    CHECK (status IN ('Active', 'Revoked', 'Replaced')),
    revoked_at                      TIMESTAMPTZ,
    revoked_by_wallet               VARCHAR(42),
    revocation_reason_hash          CHAR(66),                        -- bytes32 hex

    -- Liên kết renew (theo CertificateManager.revokeCertificate & renewCertificate)
    previous_token_id               BIGINT       REFERENCES certificates(token_id),
    replacement_token_id            BIGINT       REFERENCES certificates(token_id),

    -- Metadata
    metadata_uri                    VARCHAR(500) NOT NULL,           -- ipfs://... (bắt buộc IPFS)
    metadata_ipfs_cid               VARCHAR(100),                    -- extracted từ URI để query nhanh

    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Một mã chứng nhận chỉ phát hành 1 lần (mirror on-chain mapping certificateCodeUsed)
    CONSTRAINT uniq_code_hash_per_chain UNIQUE (chain_id, contract_address, certificate_code_hash)
);

CREATE INDEX idx_certs_holder            ON certificates(holder_wallet_address);
CREATE INDEX idx_certs_holder_user       ON certificates(holder_user_id);
CREATE INDEX idx_certs_organization      ON certificates(organization_id);
CREATE INDEX idx_certs_status            ON certificates(status);
CREATE INDEX idx_certs_code              ON certificates(certificate_code);
CREATE INDEX idx_certs_expires_at        ON certificates(expires_at);
CREATE INDEX idx_certs_issued_at         ON certificates(issued_at DESC);


-- =========================================================
-- 4. Bảng certificate_metadata — Nội dung chứng chỉ off-chain
-- =========================================================

CREATE TABLE IF NOT EXISTS certificate_metadata (
    id                              SERIAL PRIMARY KEY,
    certificate_id                  INTEGER      NOT NULL UNIQUE REFERENCES certificates(id) ON DELETE CASCADE,

    -- Nội dung hiển thị (không lên on-chain, chỉ lưu DB)
    holder_full_name                VARCHAR(255) NOT NULL,            -- "Nguyễn Văn A"
    student_code                    VARCHAR(50),                     -- Mã SV
    program_name                    VARCHAR(255) NOT NULL,            -- "Kỹ sư CNTT"
    major                           VARCHAR(255),                     -- "Trí tuệ nhân tạo"
    degree_type                     VARCHAR(100),                     -- "Kỹ sư" / "Cử nhân" / "Chứng chỉ"
    classification                  VARCHAR(50),                      -- "Xuất sắc" / "Giỏi" / "Khá"
    gpa                             NUMERIC(4,2),                     -- 3.65
    graduation_year                 INTEGER,
    issue_decision_number           VARCHAR(100),                     -- Số quyết định tốt nghiệp
    issue_date                      DATE,

    -- Metadata JSON lưu trên IPFS (snapshot để audit)
    metadata_json                   JSONB,                            -- mirror file IPFS
    metadata_ipfs_hash              VARCHAR(100),                     -- CID v1
    metadata_pinned_at              TIMESTAMPTZ,

    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metadata_holder_name   ON certificate_metadata(holder_full_name);
CREATE INDEX idx_metadata_program       ON certificate_metadata(program_name);
CREATE INDEX idx_metadata_graduation    ON certificate_metadata(graduation_year);

-- =========================================================
-- 5. Bảng certificate_events — Lịch sử + on-chain tx log
-- =========================================================
CREATE TABLE IF NOT EXISTS certificate_events (
    id                              BIGSERIAL PRIMARY KEY,

    certificate_id                  INTEGER      REFERENCES certificates(id) ON DELETE SET NULL,
    token_id                        BIGINT       NOT NULL,            -- denormalized để query nhanh

    -- Loại event (mirror 3 events của CertificateManager)
    event_type                      VARCHAR(20)  NOT NULL
                                    CHECK (event_type IN ('Issued', 'Renewed', 'Revoked')),

    -- Liên kết on-chain
    tx_hash                         CHAR(66)     NOT NULL UNIQUE,     -- transaction hash
    block_number                    BIGINT       NOT NULL,
    block_timestamp                 TIMESTAMPTZ  NOT NULL,
    log_index                       INTEGER      NOT NULL,
    chain_id                        INTEGER      NOT NULL,

    -- Actor on-chain
    actor_wallet_address            VARCHAR(42)  NOT NULL,

    -- Payload từ event (raw + parsed)
    payload                         JSONB        NOT NULL,
    reason_hash                     CHAR(66),                          -- chỉ có ở Revoked

    -- BE-side metadata
    indexed_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uniq_event_per_tx UNIQUE (chain_id, tx_hash, log_index)
);

CREATE INDEX idx_events_token_id     ON certificate_events(token_id);
CREATE INDEX idx_events_type         ON certificate_events(event_type);
CREATE INDEX idx_events_block        ON certificate_events(block_number DESC);
CREATE INDEX idx_events_actor        ON certificate_events(actor_wallet_address);
CREATE INDEX idx_events_timestamp    ON certificate_events(block_timestamp DESC);

-- =========================================================
-- 6. Bảng wallet_bindings — Audit liên kết ví ↔ use
-- =========================================================
CREATE TABLE IF NOT EXISTS wallet_bindings (
    id                              SERIAL PRIMARY KEY,

    user_id                         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address                  VARCHAR(42)  NOT NULL,

    -- Verification (chống chiếm ví)
    verification_method             VARCHAR(20)  NOT NULL
                                    CHECK (verification_method IN ('Signature', 'OTP', 'Manual')),
    verification_proof              TEXT,                            -- chữ ký message, OTP code hash, v.v.
    verified_at                     TIMESTAMPTZ  NOT NULL,

    is_primary                      BOOLEAN      NOT NULL DEFAULT FALSE,  -- 1 user có thể có nhiều ví
    is_active                       BOOLEAN      NOT NULL DEFAULT TRUE,

    bound_by                        INTEGER      REFERENCES users(id),     -- Admin duyệt nếu method = Manual
    unbound_at                      TIMESTAMPTZ,
    unbound_by                      INTEGER      REFERENCES users(id),

    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_wallet_format CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$')
);

-- Mỗi user chỉ có 1 ví primary
CREATE UNIQUE INDEX uniq_primary_wallet_per_user
    ON wallet_bindings(user_id) WHERE is_primary = TRUE AND is_active = TRUE;

CREATE INDEX idx_wallet_bindings_address ON wallet_bindings(wallet_address);
CREATE INDEX idx_wallet_bindings_user    ON wallet_bindings(user_id);