-- Xóa bảng cũ nếu tồn tại

DROP TABLE IF EXISTS `Users`;


-- Bảng Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    birth_day VARCHAR(50),
    gender VARCHAR(10),
    role VARCHAR(50),
    avatar VARCHAR(500),
    deleted_by INTEGER NOT NULL DEFAULT 0,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);



INSERT INTO users (
    name,
    email,
    password,
    phone,
    birth_day,
    gender,
    avatar,
    role,
    deleted_by,
    is_deleted,
    created_at,
    updated_at
) VALUES (
    'Admin',
    'admin@gmail.com',
    '$2b$10$wR2xC7s0m4D0Gg4k9hW6qeLZufYz/TKhgV6BdPcyf8UQd5I1c/32G',
    '0123456789',
    '2003-01-10',
    'Male',
    'https://res.cloudinary.com/dczjneexr/image/upload/v1758479133/images/lzsb0hcsu6wn41pzjowp.jpg',
    'admin',
    0,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
