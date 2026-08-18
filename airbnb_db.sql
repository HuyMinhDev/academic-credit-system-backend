
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

    -- Supported roles in the current business model.
    role            VARCHAR(50) NOT NULL DEFAULT 'student'
                    CHECK (role IN ('super_admin', 'school_admin', 'student')),

    -- super_admin: NULL
    -- school_admin/student: must belong to one organization.
    -- FK to organizations is added after organizations is created.
    organization_id INTEGER,

    avatar          VARCHAR(500),

    -- Optional cached/current primary wallet.
    -- Full wallet binding/audit history is stored in wallet_bindings.
    wallet_address  VARCHAR(42),

    -- Soft delete
    deleted_by      INTEGER REFERENCES users(id),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_users_role_organization CHECK (
        (role = 'super_admin' AND organization_id IS NULL)
        OR
        (role IN ('school_admin', 'student') AND organization_id IS NOT NULL)
    ),

    CONSTRAINT chk_users_wallet_format CHECK (
        wallet_address IS NULL
        OR wallet_address ~ '^0x[a-fA-F0-9]{40}$'
    ),

    -- Required for composite foreign keys from certificates:
    -- (user_id, organization_id) must match the certificate organization.
    CONSTRAINT uniq_users_id_organization UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_users_is_deleted
    ON users (is_deleted);

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users (role);

CREATE INDEX IF NOT EXISTS idx_users_organization
    ON users (organization_id);

CREATE INDEX IF NOT EXISTS idx_users_organization_role
    ON users (organization_id, role);


-- =========================================================
-- 2. organizations — Cơ sở đào tạo
-- =========================================================

CREATE TABLE IF NOT EXISTS organizations (
    id                      SERIAL PRIMARY KEY,

    -- Mã tổ chức/trường: HUST, HCMUE, ...
    code                    VARCHAR(50)  NOT NULL UNIQUE,
    name                    VARCHAR(255) NOT NULL,
    address                 TEXT,
    tax_code                VARCHAR(50),

    -- Người đại diện pháp lý / thông tin liên hệ
    representative_name     VARCHAR(255),
    representative_email    VARCHAR(255),
    representative_phone    VARCHAR(50),

    -- Trạng thái
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Soft delete
    deleted_by              INTEGER      REFERENCES users(id),
    deleted_at              TIMESTAMPTZ,

    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- User tạo organization.
    -- Theo business rule, backend phải đảm bảo user này có role = super_admin.
    created_by              INTEGER      NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_organizations_active
    ON organizations (is_active);

CREATE INDEX IF NOT EXISTS idx_organizations_created_by
    ON organizations (created_by);


-- users.organization_id được tạo trước để giải quyết vòng phụ thuộc
-- users -> organizations -> users(created_by).
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_organization;

ALTER TABLE users
    ADD CONSTRAINT fk_users_organization
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE RESTRICT;


-- =========================================================
-- 3. certificates — Chứng chỉ / ánh xạ on-chain
-- =========================================================

CREATE TABLE IF NOT EXISTS certificates (
    id                              SERIAL PRIMARY KEY,

    -- Liên kết on-chain
    token_id                        BIGINT       NOT NULL UNIQUE,
    chain_id                        INTEGER      NOT NULL DEFAULT 11155111, -- Sepolia
    contract_address                VARCHAR(42)  NOT NULL,                  -- CertificateManager

    -- Hash on-chain (bytes32 dạng 0x + 64 hex chars)
    certificate_code_hash           CHAR(66)     NOT NULL,
    document_hash                   CHAR(66)     NOT NULL,

    -- Mã chứng nhận plaintext để search ở DB.
    certificate_code                VARCHAR(100) NOT NULL,

    -- Người nhận.
    -- Theo business rule: phải là student.
    holder_user_id                  INTEGER      NOT NULL,
    holder_wallet_address           VARCHAR(42)  NOT NULL,

    -- Tổ chức cấp chứng chỉ.
    organization_id                 INTEGER      NOT NULL REFERENCES organizations(id),

    -- Người cấp.
    -- Theo business rule: phải là school_admin của cùng organization.
    issuer_user_id                  INTEGER      NOT NULL,
    issuer_wallet_address           VARCHAR(42)  NOT NULL,

    -- Thời gian
    issued_at                       TIMESTAMPTZ  NOT NULL,
    expires_at                      TIMESTAMPTZ,

    -- Trạng thái mirror từ on-chain.
    status                          VARCHAR(20)  NOT NULL DEFAULT 'Active'
                                    CHECK (status IN ('Active', 'Revoked', 'Replaced')),

    revoked_at                      TIMESTAMPTZ,
    revoked_by_wallet               VARCHAR(42),
    revocation_reason_hash          CHAR(66),

    -- Liên kết revoke/renew/replacement.
    previous_token_id               BIGINT,
    replacement_token_id            BIGINT,

    -- Metadata
    metadata_uri                    VARCHAR(500) NOT NULL,
    metadata_ipfs_cid               VARCHAR(100),

    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Một mã chứng nhận chỉ phát hành 1 lần trên cùng chain + contract.
    CONSTRAINT uniq_code_hash_per_chain
        UNIQUE (chain_id, contract_address, certificate_code_hash),

    CONSTRAINT chk_certificate_contract_wallet_format CHECK (
        contract_address ~ '^0x[a-fA-F0-9]{40}$'
    ),

    CONSTRAINT chk_holder_wallet_format CHECK (
        holder_wallet_address ~ '^0x[a-fA-F0-9]{40}$'
    ),

    CONSTRAINT chk_issuer_wallet_format CHECK (
        issuer_wallet_address ~ '^0x[a-fA-F0-9]{40}$'
    ),

    CONSTRAINT chk_revoked_by_wallet_format CHECK (
        revoked_by_wallet IS NULL
        OR revoked_by_wallet ~ '^0x[a-fA-F0-9]{40}$'
    ),

    CONSTRAINT chk_certificate_code_hash_format CHECK (
        certificate_code_hash ~ '^0x[a-fA-F0-9]{64}$'
    ),

    CONSTRAINT chk_document_hash_format CHECK (
        document_hash ~ '^0x[a-fA-F0-9]{64}$'
    ),

    CONSTRAINT chk_revocation_reason_hash_format CHECK (
        revocation_reason_hash IS NULL
        OR revocation_reason_hash ~ '^0x[a-fA-F0-9]{64}$'
    ),

    -- DB-level guarantee:
    -- holder must belong to the same organization as the certificate.
    CONSTRAINT fk_certificate_holder_same_organization
        FOREIGN KEY (holder_user_id, organization_id)
        REFERENCES users(id, organization_id)
        ON DELETE RESTRICT,

    -- DB-level guarantee:
    -- issuer must belong to the same organization as the certificate.
    CONSTRAINT fk_certificate_issuer_same_organization
        FOREIGN KEY (issuer_user_id, organization_id)
        REFERENCES users(id, organization_id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_certificate_previous_token
        FOREIGN KEY (previous_token_id)
        REFERENCES certificates(token_id)
        ON DELETE SET NULL,

    CONSTRAINT fk_certificate_replacement_token
        FOREIGN KEY (replacement_token_id)
        REFERENCES certificates(token_id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_certs_holder
    ON certificates (holder_wallet_address);

CREATE INDEX IF NOT EXISTS idx_certs_holder_user
    ON certificates (holder_user_id);

CREATE INDEX IF NOT EXISTS idx_certs_issuer_user
    ON certificates (issuer_user_id);

CREATE INDEX IF NOT EXISTS idx_certs_organization
    ON certificates (organization_id);

CREATE INDEX IF NOT EXISTS idx_certs_status
    ON certificates (status);

CREATE INDEX IF NOT EXISTS idx_certs_code
    ON certificates (certificate_code);

CREATE INDEX IF NOT EXISTS idx_certs_expires_at
    ON certificates (expires_at);

CREATE INDEX IF NOT EXISTS idx_certs_issued_at
    ON certificates (issued_at DESC);


-- =========================================================
-- 4. certificate_metadata — Nội dung chứng chỉ off-chain
-- =========================================================

CREATE TABLE IF NOT EXISTS certificate_metadata (
    id                              SERIAL PRIMARY KEY,

    certificate_id                  INTEGER      NOT NULL UNIQUE
                                    REFERENCES certificates(id)
                                    ON DELETE CASCADE,

    -- Nội dung hiển thị, không ghi trực tiếp lên on-chain.
    holder_full_name                VARCHAR(255) NOT NULL,
    student_code                    VARCHAR(50),
    program_name                    VARCHAR(255) NOT NULL,
    major                           VARCHAR(255),
    degree_type                     VARCHAR(100),
    classification                  VARCHAR(50),
    gpa                             NUMERIC(4,2),
    graduation_year                 INTEGER,
    issue_decision_number           VARCHAR(100),
    issue_date                      DATE,

    -- Snapshot metadata JSON/IPFS để audit.
    metadata_json                   JSONB,
    metadata_ipfs_hash              VARCHAR(100),
    metadata_pinned_at              TIMESTAMPTZ,

    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_metadata_gpa CHECK (
        gpa IS NULL OR (gpa >= 0 AND gpa <= 10)
    )
);

CREATE INDEX IF NOT EXISTS idx_metadata_holder_name
    ON certificate_metadata (holder_full_name);

CREATE INDEX IF NOT EXISTS idx_metadata_student_code
    ON certificate_metadata (student_code);

CREATE INDEX IF NOT EXISTS idx_metadata_program
    ON certificate_metadata (program_name);

CREATE INDEX IF NOT EXISTS idx_metadata_graduation
    ON certificate_metadata (graduation_year);


-- =========================================================
-- 5. certificate_events — Lịch sử + on-chain tx log
-- =========================================================

CREATE TABLE IF NOT EXISTS certificate_events (
    id                              BIGSERIAL PRIMARY KEY,

    certificate_id                  INTEGER
                                    REFERENCES certificates(id)
                                    ON DELETE SET NULL,

    token_id                        BIGINT       NOT NULL,

    -- Mirror events của CertificateManager.
    event_type                      VARCHAR(20)  NOT NULL
                                    CHECK (event_type IN ('Issued', 'Renewed', 'Revoked')),

    -- Liên kết on-chain
    tx_hash                         CHAR(66)     NOT NULL,
    block_number                    BIGINT       NOT NULL,
    block_timestamp                 TIMESTAMPTZ  NOT NULL,
    log_index                       INTEGER      NOT NULL,
    chain_id                        INTEGER      NOT NULL,

    -- Actor on-chain.
    actor_wallet_address            VARCHAR(42)  NOT NULL,

    -- User trong hệ thống thực hiện hành động, nếu xác định được.
    actor_user_id                   INTEGER      REFERENCES users(id),

    -- Payload event.
    payload                         JSONB        NOT NULL,
    reason_hash                     CHAR(66),

    indexed_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uniq_event_per_tx
        UNIQUE (chain_id, tx_hash, log_index),

    CONSTRAINT chk_event_tx_hash_format CHECK (
        tx_hash ~ '^0x[a-fA-F0-9]{64}$'
    ),

    CONSTRAINT chk_event_actor_wallet_format CHECK (
        actor_wallet_address ~ '^0x[a-fA-F0-9]{40}$'
    ),

    CONSTRAINT chk_event_reason_hash_format CHECK (
        reason_hash IS NULL
        OR reason_hash ~ '^0x[a-fA-F0-9]{64}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_events_token_id
    ON certificate_events (token_id);

CREATE INDEX IF NOT EXISTS idx_events_type
    ON certificate_events (event_type);

CREATE INDEX IF NOT EXISTS idx_events_block
    ON certificate_events (block_number DESC);

CREATE INDEX IF NOT EXISTS idx_events_actor
    ON certificate_events (actor_wallet_address);

CREATE INDEX IF NOT EXISTS idx_events_actor_user
    ON certificate_events (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_events_timestamp
    ON certificate_events (block_timestamp DESC);

ALTER TABLE certificate_events
ADD COLUMN IF NOT EXISTS reason TEXT;


-- =========================================================
-- 6. wallet_bindings — Audit liên kết ví ↔ user
-- =========================================================

CREATE TABLE IF NOT EXISTS wallet_bindings (
    id                              SERIAL PRIMARY KEY,

    user_id                         INTEGER      NOT NULL
                                    REFERENCES users(id)
                                    ON DELETE CASCADE,

    wallet_address                  VARCHAR(42)  NOT NULL,

    -- Verification chống chiếm ví.
    verification_method             VARCHAR(20)  NOT NULL
                                    CHECK (
                                        verification_method IN ('Signature', 'OTP', 'Manual')
                                    ),

    verification_proof              TEXT,
    verified_at                     TIMESTAMPTZ  NOT NULL,

    -- Một user có thể có nhiều ví nhưng chỉ một ví primary đang active.
    is_primary                      BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active                       BOOLEAN      NOT NULL DEFAULT TRUE,

    bound_by                        INTEGER      REFERENCES users(id),
    unbound_at                      TIMESTAMPTZ,
    unbound_by                      INTEGER      REFERENCES users(id),

    created_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_wallet_binding_format CHECK (
        wallet_address ~ '^0x[a-fA-F0-9]{40}$'
    )
);

-- Mỗi user chỉ có 1 ví primary đang active.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_primary_wallet_per_user
    ON wallet_bindings (user_id)
    WHERE is_primary = TRUE AND is_active = TRUE;

-- Một wallet đang active chỉ được bind cho 1 user.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_wallet_address
    ON wallet_bindings (LOWER(wallet_address))
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_wallet_bindings_address
    ON wallet_bindings (wallet_address);

CREATE INDEX IF NOT EXISTS idx_wallet_bindings_user
    ON wallet_bindings (user_id);


-- =========================================================
-- 7. Seed super_admin
-- =========================================================

INSERT INTO users (
    id,
    name,
    email,
    password,
    phone,
    birth_day,
    gender,
    role,
    organization_id,
    avatar,
    wallet_address,
    deleted_by,
    is_deleted,
    deleted_at,
    created_at,
    updated_at
)
VALUES (
    1,
    'Super Admin',
    'admin@gmail.com',
    '$2b$10$G5rGNI95LX.f6w0lJUCPEu6Dv7742sIRx7VtN1kfJpOO2LEzrJPOK',
    '0123456789',
    '2003-01-10',
    'Male',
    'super_admin',
    NULL,
    'https://res.cloudinary.com/dczjneexr/image/upload/v1758479133/images/lzsb0hcsu6wn41pzjowp.jpg',
    '0xbe30ab8dadd07629ed8a6275e130a116a1ac4f0d',
    NULL,
    FALSE,
    NULL,
    '2026-07-27 18:18:12.730765+00',
    '2026-07-27 18:18:12.730765+00'
)
ON CONFLICT (email) DO NOTHING;

-- Ensure SERIAL sequence continues after the explicit seed id.
SELECT setval(
    pg_get_serial_sequence('users', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM users), 1),
    TRUE
);


-- =========================================================
-- 8. Recommended backend transaction:
--    super_admin creates organization + initial school_admin
-- =========================================================
--
-- BEGIN;
--
-- INSERT INTO organizations (
--     code,
--     name,
--     address,
--     tax_code,
--     representative_name,
--     representative_email,
--     representative_phone,
--     created_by
-- )
-- VALUES (
--     'ORG-001',
--     'Đại học Bách Khoa Hà Nội',
--     'Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội',
--     '0101234567',
--     'Nguyễn Văn A',
--     'admin@hust.edu.vn',
--     '0912345678',
--     1 -- super_admin id
-- )
-- RETURNING id;
--
-- -- Assume returned organization id = :organization_id
--
-- INSERT INTO users (
--     name,
--     email,
--     password,
--     phone,
--     role,
--     organization_id,
--     wallet_address
-- )
-- VALUES (
--     'School Admin HUST',
--     'schooladmin@hust.edu.vn',
--     '<BCRYPT_HASH_FROM_BACKEND>',
--     '0912345678',
--     'school_admin',
--     :organization_id,
--     '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
-- );
--
-- COMMIT;
--
-- IMPORTANT:
-- Backend authorization must check:
--   1) Only super_admin can create/update/deactivate organizations.
--   2) school_admin can manage only users where
--      users.organization_id = school_admin.organization_id.
--   3) When creating students, role must be 'student' and organization_id
--      must equal the school_admin organization.
--   4) When issuing certificates:
--        issuer.role = 'school_admin'
--        holder.role = 'student'
--        issuer.organization_id = holder.organization_id
--        certificate.organization_id = issuer.organization_id
--
-- The composite foreign keys in certificates enforce the same-organization
-- requirement at database level; role checks remain backend business rules.
-- =========================================================


UPDATE users
SET organization_id = 2
WHERE id = 4
  AND role = 'student'
  AND is_deleted = false;