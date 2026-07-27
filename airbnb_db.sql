-- Xóa bảng cũ nếu tồn tại
DROP TABLE IF EXISTS `Comments`;
DROP TABLE IF EXISTS `Bookings`;
DROP TABLE IF EXISTS `Rooms`;
DROP TABLE IF EXISTS `Locations`;
DROP TABLE IF EXISTS `Users`;
DROP TABLE IF EXISTS `Favorites`;

-- Bảng Users
CREATE TABLE `Users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(50),
  `birth_day` VARCHAR(50),
  `gender` VARCHAR(10),
  `role` VARCHAR(50),
  `avatar` VARCHAR(500),
  `deleted_by` INT NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Bảng Locations
CREATE TABLE `Locations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `location_name` VARCHAR(255) NOT NULL,
  `province` VARCHAR(255),
  `country` VARCHAR(255),
  `image` VARCHAR(500),
  `deleted_by` INT NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Bảng Rooms
CREATE TABLE `Rooms` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `room_name` VARCHAR(255) NOT NULL,
  `guest_count` INT,
  `bedroom_count` INT,
  `bed_count` INT,
  `bathroom_count` INT,
  `description` VARCHAR(1000),
  `price` INT,
  `washing_machine` BOOLEAN DEFAULT 0,
  `iron` BOOLEAN DEFAULT 0,
  `tv` BOOLEAN DEFAULT 0,
  `air_conditioner` BOOLEAN DEFAULT 0,
  `wifi` BOOLEAN DEFAULT 0,
  `kitchen` BOOLEAN DEFAULT 0,
  `parking` BOOLEAN DEFAULT 0,
  `pool` BOOLEAN DEFAULT 0,
  `desk` BOOLEAN DEFAULT 0,
  `image` VARCHAR(500),
  `location_id` INT,
  `deleted_by` INT NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `rooms_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `Locations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Bảng Bookings
CREATE TABLE `Bookings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `room_id` INT NOT NULL,
  `check_in` DATETIME NOT NULL,
  `check_out` DATETIME NOT NULL,
  `guest_quantity` INT,
  `user_id` INT NOT NULL,
  `deleted_by` INT NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `room_id` (`room_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `Rooms` (`id`),
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Bảng Comments
CREATE TABLE `Comments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `room_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `comment_date` DATETIME NOT NULL,
  `content` VARCHAR(1000),
  `rating` INT,
  `deleted_by` INT NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `room_id` (`room_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `Rooms` (`id`),
  CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Bảng Favorites
CREATE TABLE `Favorites` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `room_id` INT NOT NULL,
  `deleted_by` INT NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_room` (`user_id`, `room_id`),
  CONSTRAINT `favorites_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `favorites_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `Rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO Users (
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
  0,
  NOW(),
  NOW()
);

INSERT INTO Locations (location_name, province, country, image, created_at, updated_at)
VALUES ('Nha Trang Beach', 'Khánh Hòa', 'Vietnam', 'https://cdn.myapp.com/uploads/locations/nha-trang.jpg', NOW(), NOW());

INSERT INTO Locations (location_name, province, country, image, created_at, updated_at)
VALUES 
('Ha Long Bay', 'Quảng Ninh', 'Vietnam', 'https://cdn.myapp.com/uploads/locations/ha-long-bay.jpg', NOW(), NOW()),

('Sa Pa Town', 'Lào Cai', 'Vietnam', 'https://cdn.myapp.com/uploads/locations/sa-pa.jpg', NOW(), NOW()),

('Phu Quoc Island', 'Kiên Giang', 'Vietnam', 'https://cdn.myapp.com/uploads/locations/phu-quoc.jpg', NOW(), NOW());


INSERT INTO Rooms (
  room_name,
  guest_count,
  bedroom_count,
  bed_count,
  bathroom_count,
  description,
  price,
  washing_machine,
  iron,
  tv,
  air_conditioner,
  wifi,
  kitchen,
  parking,
  pool,
  desk,
  image,
  location_id,
  deleted_by,
  is_deleted,
  created_at,
  updated_at
)
VALUES (
  'Deluxe Ocean View Room',
  4,                -- guest_count
  2,                -- bedroom_count
  2,                -- bed_count
  2,                -- bathroom_count
  'Phòng view biển cao cấp, có ban công và đầy đủ tiện nghi.',
  1500000,          -- price (VNĐ)
  1,                -- washing_machine
  1,                -- iron
  1,                -- tv
  1,                -- air_conditioner
  1,                -- wifi
  1,                -- kitchen
  1,                -- parking
  1,                -- pool
  1,                -- desk
  'https://cdn.myapp.com/uploads/rooms/ocean-view.jpg',
  1,                -- location_id
  0,
  0,
  NOW(),
  NOW()
);

INSERT INTO Rooms (
  room_name,
  guest_count,
  bedroom_count,
  bed_count,
  bathroom_count,
  description,
  price,
  washing_machine,
  iron,
  tv,
  air_conditioner,
  wifi,
  kitchen,
  parking,
  pool,
  desk,
  image,
  location_id,
  deleted_by,
  is_deleted,
  created_at,
  updated_at
)
VALUES
-- 1. Luxury Bay View Suite (Ha Long Bay)
(
  'Luxury Bay View Suite',
  3, 1, 1, 1,
  'Phòng suite nhìn ra vịnh Hạ Long với cửa sổ lớn, nội thất gỗ cao cấp và phòng tắm riêng.',
  1800000,
  1, 1, 1, 1, 1,
  1, 1, 1, 1,
  'https://cdn.myapp.com/uploads/rooms/halong-suite.jpg',
  2,
  0, 0,
  NOW(), NOW()
),

-- 2. Mountain View Studio (Sa Pa Town)
(
  'Mountain View Studio',
  2, 1, 1, 1,
  'Phòng studio nhỏ gọn tại trung tâm Sa Pa, có ban công hướng núi Fansipan và lò sưởi ấm áp.',
  950000,
  0, 1, 1, 1, 1,
  0, 1, 0, 1,
  'https://cdn.myapp.com/uploads/rooms/sapa-mountain-view.jpg',
  3,
  0, 0,
  NOW(), NOW()
),

-- 3. Beachfront Villa (Phu Quoc Island)
(
  'Beachfront Villa',
  6, 3, 3, 2,
  'Biệt thự cao cấp sát biển Phú Quốc, có hồ bơi riêng, bếp hiện đại và sân BBQ.',
  3200000,
  1, 1, 1, 1, 1,
  1, 1, 1, 1,
  'https://cdn.myapp.com/uploads/rooms/phuquoc-villa.jpg',
  4,
  0, 0,
  NOW(), NOW()
),

-- 4. Family Seaside Apartment (Ha Long Bay)
(
  'Family Seaside Apartment',
  5, 2, 2, 2,
  'Căn hộ thích hợp cho gia đình, có phòng khách riêng và tầm nhìn ra biển Hạ Long.',
  2100000,
  1, 1, 1, 1, 1,
  1, 1, 1, 1,
  'https://cdn.myapp.com/uploads/rooms/halong-family.jpg',
  2,
  0, 0,
  NOW(), NOW()
),

-- 5. Traditional Wooden Lodge (Sa Pa Town)
(
  'Traditional Wooden Lodge',
  3, 1, 2, 1,
  'Nhà gỗ kiểu truyền thống Sa Pa, nằm giữa rừng thông, phù hợp nghỉ dưỡng và chụp ảnh.',
  850000,
  0, 0, 1, 0, 1,
  0, 1, 0, 1,
  'https://cdn.myapp.com/uploads/rooms/sapa-wooden-lodge.jpg',
  3,
  0, 0,
  NOW(), NOW()
);

DROP TABLE IF EXISTS `Bookings`;

CREATE TABLE `Bookings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `room_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `check_in` DATETIME NOT NULL,
  `check_out` DATETIME NOT NULL,
  `guest_quantity` INT DEFAULT 1,
  `total_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `note` VARCHAR(1000),

  `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',

  `confirmed_at` DATETIME NULL DEFAULT NULL,
  `cancelled_at` DATETIME NULL DEFAULT NULL,

  `cancel_reason` VARCHAR(500) NULL DEFAULT NULL,

  `deleted_by` INT NOT NULL DEFAULT 0,
  `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,

  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  -- Khóa ngoại
  KEY `room_id` (`room_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `Rooms` (`id`),
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `Users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


ALTER TABLE Bookings
ADD COLUMN is_deleted_user TINYINT(1) NOT NULL DEFAULT 0,
ADD COLUMN is_deleted_admin TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE Bookings
ADD COLUMN cancelled_by ENUM('user', 'admin') NULL DEFAULT NULL AFTER cancel_reason,
MODIFY COLUMN cancel_reason VARCHAR(500) NULL DEFAULT NULL,
MODIFY COLUMN cancelled_at DATETIME NULL DEFAULT NULL;
