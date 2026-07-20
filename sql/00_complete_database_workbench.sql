-- Travela FULL database + LARGE seed for MySQL Workbench
-- Clean version: includes voucher booking, pickup points, user-specific notifications, review reply status.
-- Run directly in MySQL Workbench. Demo password for all accounts: 123456

DROP DATABASE IF EXISTS travela_full_mvc;
CREATE DATABASE travela_full_mvc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE travela_full_mvc;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
SET SQL_SAFE_UPDATES = 0;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20) UNIQUE NULL,
  identity_number VARCHAR(30) UNIQUE NULL,
  birth_date DATE NULL,
  password_hash VARCHAR(255) NULL,
  google_id VARCHAR(255) UNIQUE NULL,
  auth_provider VARCHAR(30) NOT NULL DEFAULT 'local',
  avatar_url VARCHAR(500) NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  status ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
  member_points INT UNSIGNED NOT NULL DEFAULT 0,
  member_tier ENUM('bronze','silver','gold','diamond') NOT NULL DEFAULT 'bronze',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE destinations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  province VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'Vietnam',
  description TEXT NULL,
  cover_image VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tours (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(220) NOT NULL,
  slug VARCHAR(240) NOT NULL UNIQUE,
  destination_id BIGINT UNSIGNED NOT NULL,
  tour_type ENUM('group','private') NOT NULL DEFAULT 'group',
  tour_theme ENUM('beach','mountain','city','culture','adventure','eco','family','luxury','other') NOT NULL DEFAULT 'other',
  duration_days SMALLINT UNSIGNED NOT NULL,
  duration_nights SMALLINT UNSIGNED NOT NULL,
  hotel_stars TINYINT UNSIGNED NULL,
  base_price_adult DECIMAL(12,2) NOT NULL,
  base_price_child DECIMAL(12,2) NOT NULL,
  max_capacity_default INT UNSIGNED NOT NULL DEFAULT 30,
  short_description VARCHAR(500) NULL,
  full_description LONGTEXT NULL,
  status ENUM('draft','published','inactive') NOT NULL DEFAULT 'published',
  is_trending BOOLEAN NOT NULL DEFAULT FALSE,
  is_best_deal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tours_destination FOREIGN KEY(destination_id) REFERENCES destinations(id)
) ENGINE=InnoDB;

CREATE TABLE tour_media (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  media_type ENUM('image','video') NOT NULL DEFAULT 'image',
  file_url VARCHAR(500) NOT NULL,
  is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_itinerary (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  day_number SMALLINT UNSIGNED NOT NULL,
  item_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  title VARCHAR(220) NOT NULL,
  description TEXT NULL,
  location_name VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tour_day_order(tour_id, day_number, item_order),
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_departures (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  departure_date DATE NOT NULL,
  end_date DATE NOT NULL,
  adult_price DECIMAL(12,2) NOT NULL,
  child_price DECIMAL(12,2) NOT NULL,
  total_slots INT UNSIGNED NOT NULL,
  booked_slots INT UNSIGNED NOT NULL DEFAULT 0,
  held_slots INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('open','full','closed','departed','completed','cancelled') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE,
  CHECK (booked_slots + held_slots <= total_slots)
) ENGINE=InnoDB;

CREATE TABLE tour_policies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  policy_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_accommodations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  accommodation_type VARCHAR(50) NOT NULL,
  star_rating TINYINT UNSIGNED NULL,
  address VARCHAR(255) NULL,
  description TEXT NULL,
  price_per_night DECIMAL(12,2) NULL,
  image_url VARCHAR(500) NULL,
  amenities TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_transports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL DEFAULT 'Phương tiện tour',
  transport_type VARCHAR(50) NOT NULL,
  provider VARCHAR(150) NULL,
  origin VARCHAR(150) NULL,
  destination_label VARCHAR(150) NULL,
  duration_hours DECIMAL(8,2) NULL,
  price DECIMAL(12,2) NULL,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vouchers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  member_tier ENUM('bronze','silver','gold','diamond') NOT NULL DEFAULT 'bronze',
  discount_type ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  discount_value DECIMAL(12,2) NOT NULL,
  max_discount DECIMAL(12,2) NULL,
  min_order_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  quota INT UNSIGNED NOT NULL DEFAULT 0,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_vouchers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  voucher_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_voucher(user_id, voucher_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tour_pickup_points (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tour_id BIGINT UNSIGNED NOT NULL,
  departure_id BIGINT UNSIGNED NULL,
  province VARCHAR(100) NOT NULL,
  name VARCHAR(180) NOT NULL,
  address VARCHAR(255) NOT NULL,
  pickup_time TIME NULL,
  note TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
  FOREIGN KEY (departure_id) REFERENCES tour_departures(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_code VARCHAR(50) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  tour_id BIGINT UNSIGNED NOT NULL,
  departure_id BIGINT UNSIGNED NOT NULL,
  voucher_id BIGINT UNSIGNED NULL,
  voucher_code VARCHAR(50) NULL,
  pickup_point_id BIGINT UNSIGNED NULL,
  pickup_name VARCHAR(180) NULL,
  pickup_address VARCHAR(255) NULL,
  pickup_time TIME NULL,
  pickup_note TEXT NULL,
  adult_count INT NOT NULL DEFAULT 1,
  child_count INT NOT NULL DEFAULT 0,
  original_amount DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  final_amount DECIMAL(12,2) NOT NULL,
  booking_status ENUM('draft','pending_payment','waiting_confirmation','confirmed','cancelled','expired','completed') NOT NULL DEFAULT 'pending_payment',
  hold_expires_at DATETIME NULL,
  contact_name VARCHAR(150) NOT NULL,
  contact_email VARCHAR(150) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(tour_id) REFERENCES tours(id),
  FOREIGN KEY(departure_id) REFERENCES tour_departures(id),
  FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL,
  FOREIGN KEY(pickup_point_id) REFERENCES tour_pickup_points(id) ON DELETE SET NULL,
  KEY idx_booking_user(user_id),
  KEY idx_booking_status(booking_status),
  KEY idx_booking_departure(departure_id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  payment_method ENUM('momo','vnpay','card','bank_transfer','cash') NOT NULL,
  payment_status ENUM('pending','waiting_confirmation','paid','failed','expired','refunded') NOT NULL DEFAULT 'pending',
  amount DECIMAL(12,2) NOT NULL,
  internal_transaction_code VARCHAR(80) NOT NULL UNIQUE,
  gateway_transaction_id VARCHAR(120) NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE booking_guests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(20) NULL,
  guest_type VARCHAR(20) NOT NULL,
  id_number VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE guides (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED UNIQUE NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(150) NULL,
  identity_number VARCHAR(20) NULL,
  languages VARCHAR(255) NULL,
  experience_years TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE guide_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guide_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  tour_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'assigned',
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE refund_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  reason TEXT NOT NULL,
  refund_amount DECIMAL(12,2) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note TEXT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  tour_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  admin_reply TEXT NULL,
  admin_reply_at DATETIME NULL,
  status ENUM('pending','approved','rejected','hidden') NOT NULL DEFAULT 'approved',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE favorite_tours (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  tour_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fav(user_id,tour_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_behaviors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  tour_id BIGINT UNSIGNED NULL,
  action VARCHAR(50) NOT NULL,
  score INT NOT NULL DEFAULT 1,
  keyword VARCHAR(255) NULL,
  meta JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(tour_id) REFERENCES tours(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE faqs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question VARCHAR(255) NOT NULL,
  answer TEXT NOT NULL,
  topic VARCHAR(80) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  display_order INT NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  handled_by BIGINT UNSIGNED NULL,
  admin_reply TEXT NULL,
  replied_at DATETIME NULL,
  reply_email_sent_at DATETIME NULL,
  reply_email_error VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(handled_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE contact_email_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contact_id BIGINT UNSIGNED NOT NULL,
  admin_user_id BIGINT UNSIGNED NULL,
  recipient_email VARCHAR(150) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body_preview TEXT NULL,
  provider VARCHAR(50) DEFAULT 'smtp',
  send_status VARCHAR(30) DEFAULT 'sent',
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  error_message VARCHAR(255) NULL,
  FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  message VARCHAR(500) NULL,
  content TEXT NOT NULL,
  target_role ENUM('all','admin','user') NOT NULL DEFAULT 'user',
  target_user_id BIGINT UNSIGNED NULL,
  is_published BOOLEAN DEFAULT TRUE,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notification_reads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_read(notification_id,user_id),
  FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE chat_conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NULL,
  summary TEXT NULL,
  last_intent VARCHAR(100) NULL,
  memory_json JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE chat_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(20) NOT NULL,
  content LONGTEXT NOT NULL,
  intent VARCHAR(100) NULL,
  meta JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE booking_status_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  action_type VARCHAR(50) NOT NULL,
  old_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'system',
  reason TEXT NULL,
  note TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  FOREIGN KEY(changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE revoked_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

DELIMITER $$
CREATE TRIGGER trg_departure_no_overbook BEFORE UPDATE ON tour_departures
FOR EACH ROW BEGIN
  IF NEW.booked_slots + NEW.held_slots > NEW.total_slots THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Không đủ số lượng chỗ trống cho tour này';
  END IF;
END$$
DELIMITER ;

SET FOREIGN_KEY_CHECKS=1;


INSERT INTO users(full_name,email,phone,identity_number,password_hash,role,member_points,member_tier) VALUES
('Admin Travela','admin@travela.vn','0900000000','079200000001','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','admin',9999,'diamond'),
('Nguyễn Minh Anh','minhanh@gmail.com','0901000001','079200000011','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',120,'bronze'),
('Trần Gia Bảo','giabao@gmail.com','0901000002','079200000012','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',850,'silver'),
('Lê Hoàng Vy','hoangvy@gmail.com','0901000003','079200000013','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2400,'gold'),
('Phạm Quốc Huy','quochuy@gmail.com','0901000004','079200000014','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',5600,'diamond'),
('Võ Hoàng Phương','user006@travela.vn','0902000006','792026000006','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1808,'gold'),
('Đặng Anh Uyên','user007@travela.vn','0902000007','792026000007','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',7889,'diamond'),
('Bùi Bảo An','user008@travela.vn','0902000008','792026000008','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',58,'bronze'),
('Đỗ Nhật Khoa','user009@travela.vn','0902000009','792026000009','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1019,'silver'),
('Hồ Hà Phương','user010@travela.vn','0902000010','792026000010','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2356,'gold'),
('Ngô Gia Uyên','user011@travela.vn','0902000011','792026000011','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',6977,'diamond'),
('Dương Quốc An','user012@travela.vn','0902000012','792026000012','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',40,'bronze'),
('Lý Ngọc Khoa','user013@travela.vn','0902000013','792026000013','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1145,'silver'),
('Mai Khánh Phương','user014@travela.vn','0902000014','792026000014','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2699,'gold'),
('Phan Thu Uyên','user015@travela.vn','0902000015','792026000015','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',8060,'diamond'),
('Nguyễn Minh An','user016@travela.vn','0902000016','792026000016','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',449,'bronze'),
('Trần Thanh Khoa','user017@travela.vn','0902000017','792026000017','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1053,'silver'),
('Lê Thảo Phương','user018@travela.vn','0902000018','792026000018','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3171,'gold'),
('Phạm Hải Uyên','user019@travela.vn','0902000019','792026000019','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',5039,'diamond'),
('Hoàng Phúc An','user020@travela.vn','0902000020','792026000020','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',200,'bronze'),
('Huỳnh Tuấn Khoa','user021@travela.vn','0902000021','792026000021','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',561,'silver'),
('Võ Hoàng Phương','user022@travela.vn','0902000022','792026000022','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2588,'gold'),
('Đặng Anh Uyên','user023@travela.vn','0902000023','792026000023','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',8296,'diamond'),
('Bùi Bảo An','user024@travela.vn','0902000024','792026000024','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',482,'bronze'),
('Đỗ Nhật Khoa','user025@travela.vn','0902000025','792026000025','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1313,'silver'),
('Hồ Hà Phương','user026@travela.vn','0902000026','792026000026','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2114,'gold'),
('Ngô Gia Uyên','user027@travela.vn','0902000027','792026000027','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',7176,'diamond'),
('Dương Quốc An','user028@travela.vn','0902000028','792026000028','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',157,'bronze'),
('Lý Ngọc Khoa','user029@travela.vn','0902000029','792026000029','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',928,'silver'),
('Mai Khánh Phương','user030@travela.vn','0902000030','792026000030','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2501,'gold'),
('Phan Thu Uyên','user031@travela.vn','0902000031','792026000031','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',4135,'diamond'),
('Nguyễn Minh An','user032@travela.vn','0902000032','792026000032','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',401,'bronze'),
('Trần Thanh Khoa','user033@travela.vn','0902000033','792026000033','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1211,'silver'),
('Lê Thảo Phương','user034@travela.vn','0902000034','792026000034','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3132,'gold'),
('Phạm Hải Uyên','user035@travela.vn','0902000035','792026000035','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',5711,'diamond'),
('Hoàng Phúc An','user036@travela.vn','0902000036','792026000036','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',252,'bronze'),
('Huỳnh Tuấn Khoa','user037@travela.vn','0902000037','792026000037','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1248,'silver'),
('Võ Hoàng Phương','user038@travela.vn','0902000038','792026000038','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2895,'gold'),
('Đặng Anh Uyên','user039@travela.vn','0902000039','792026000039','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',6342,'diamond'),
('Bùi Bảo An','user040@travela.vn','0902000040','792026000040','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',21,'bronze'),
('Đỗ Nhật Khoa','user041@travela.vn','0902000041','792026000041','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1125,'silver'),
('Hồ Hà Phương','user042@travela.vn','0902000042','792026000042','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3073,'gold'),
('Ngô Gia Uyên','user043@travela.vn','0902000043','792026000043','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',6759,'diamond'),
('Dương Quốc An','user044@travela.vn','0902000044','792026000044','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',210,'bronze'),
('Lý Ngọc Khoa','user045@travela.vn','0902000045','792026000045','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',670,'silver'),
('Mai Khánh Phương','user046@travela.vn','0902000046','792026000046','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3309,'gold'),
('Phan Thu Uyên','user047@travela.vn','0902000047','792026000047','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',8007,'diamond'),
('Nguyễn Minh An','user048@travela.vn','0902000048','792026000048','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',152,'bronze'),
('Trần Thanh Khoa','user049@travela.vn','0902000049','792026000049','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1405,'silver'),
('Lê Thảo Phương','user050@travela.vn','0902000050','792026000050','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1860,'gold'),
('Phạm Hải Uyên','user051@travela.vn','0902000051','792026000051','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3598,'diamond'),
('Hoàng Phúc An','user052@travela.vn','0902000052','792026000052','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',258,'bronze'),
('Huỳnh Tuấn Khoa','user053@travela.vn','0902000053','792026000053','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',788,'silver'),
('Võ Hoàng Phương','user054@travela.vn','0902000054','792026000054','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2256,'gold'),
('Đặng Anh Uyên','user055@travela.vn','0902000055','792026000055','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',4528,'diamond'),
('Bùi Bảo An','user056@travela.vn','0902000056','792026000056','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',363,'bronze'),
('Đỗ Nhật Khoa','user057@travela.vn','0902000057','792026000057','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1421,'silver'),
('Hồ Hà Phương','user058@travela.vn','0902000058','792026000058','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2317,'gold'),
('Ngô Gia Uyên','user059@travela.vn','0902000059','792026000059','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',6780,'diamond'),
('Dương Quốc An','user060@travela.vn','0902000060','792026000060','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',41,'bronze'),
('Lý Ngọc Khoa','user061@travela.vn','0902000061','792026000061','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',666,'silver'),
('Mai Khánh Phương','user062@travela.vn','0902000062','792026000062','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1709,'gold'),
('Phan Thu Uyên','user063@travela.vn','0902000063','792026000063','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',4331,'diamond'),
('Nguyễn Minh An','user064@travela.vn','0902000064','792026000064','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',196,'bronze'),
('Trần Thanh Khoa','user065@travela.vn','0902000065','792026000065','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',712,'silver'),
('Lê Thảo Phương','user066@travela.vn','0902000066','792026000066','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2016,'gold'),
('Phạm Hải Uyên','user067@travela.vn','0902000067','792026000067','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',4506,'diamond'),
('Hoàng Phúc An','user068@travela.vn','0902000068','792026000068','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',69,'bronze'),
('Huỳnh Tuấn Khoa','user069@travela.vn','0902000069','792026000069','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',995,'silver'),
('Võ Hoàng Phương','user070@travela.vn','0902000070','792026000070','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3035,'gold'),
('Đặng Anh Uyên','user071@travela.vn','0902000071','792026000071','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',4822,'diamond'),
('Bùi Bảo An','user072@travela.vn','0902000072','792026000072','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',274,'bronze'),
('Đỗ Nhật Khoa','user073@travela.vn','0902000073','792026000073','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',650,'silver'),
('Hồ Hà Phương','user074@travela.vn','0902000074','792026000074','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3052,'gold'),
('Ngô Gia Uyên','user075@travela.vn','0902000075','792026000075','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',4245,'diamond'),
('Dương Quốc An','user076@travela.vn','0902000076','792026000076','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',366,'bronze'),
('Lý Ngọc Khoa','user077@travela.vn','0902000077','792026000077','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1430,'silver'),
('Mai Khánh Phương','user078@travela.vn','0902000078','792026000078','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',2590,'gold'),
('Phan Thu Uyên','user079@travela.vn','0902000079','792026000079','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',5327,'diamond'),
('Nguyễn Minh An','user080@travela.vn','0902000080','792026000080','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',323,'bronze'),
('Trần Thanh Khoa','user081@travela.vn','0902000081','792026000081','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',745,'silver'),
('Lê Thảo Phương','user082@travela.vn','0902000082','792026000082','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',1964,'gold'),
('Phạm Hải Uyên','user083@travela.vn','0902000083','792026000083','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',3737,'diamond'),
('Hoàng Phúc An','user084@travela.vn','0902000084','792026000084','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',24,'bronze'),
('Huỳnh Tuấn Khoa','user085@travela.vn','0902000085','792026000085','$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC','user',698,'silver');

INSERT INTO destinations(name,province,description,cover_image,status) VALUES
('Phú Quốc','Kiên Giang','Đảo ngọc với biển xanh, resort và Grand World.','https://picsum.photos/seed/dest-1/1200/800','active'),
('Nha Trang','Khánh Hòa','Thành phố biển sôi động, đảo đẹp, nhiều hoạt động gia đình.','https://picsum.photos/seed/dest-2/1200/800','active'),
('Đà Lạt','Lâm Đồng','Thành phố ngàn hoa, khí hậu mát mẻ, phù hợp nghỉ dưỡng.','https://picsum.photos/seed/dest-3/1200/800','active'),
('Đà Nẵng','Đà Nẵng','Biển Mỹ Khê, Bà Nà Hills, Hội An lân cận.','https://picsum.photos/seed/dest-4/1200/800','active'),
('Cần Thơ','Cần Thơ','Miền Tây sông nước, chợ nổi Cái Răng và vườn trái cây.','https://picsum.photos/seed/dest-5/1200/800','active'),
('Sa Pa','Lào Cai','Núi rừng Tây Bắc, ruộng bậc thang, săn mây.','https://picsum.photos/seed/dest-6/1200/800','active'),
('Hạ Long','Quảng Ninh','Vịnh biển di sản, du thuyền và hang động đẹp.','https://picsum.photos/seed/dest-7/1200/800','active'),
('Hội An','Quảng Nam','Phố cổ, đèn lồng và ẩm thực miền Trung.','https://picsum.photos/seed/dest-8/1200/800','active'),
('Huế','Thừa Thiên Huế','Cố đô, di tích triều Nguyễn và ẩm thực cung đình.','https://picsum.photos/seed/dest-9/1200/800','active'),
('Mũi Né','Bình Thuận','Đồi cát, biển đẹp và resort nghỉ dưỡng.','https://picsum.photos/seed/dest-10/1200/800','active'),
('Quy Nhơn','Bình Định','Biển xanh, Kỳ Co, Eo Gió và hải sản.','https://picsum.photos/seed/dest-11/1200/800','active'),
('Ninh Bình','Ninh Bình','Tràng An, Tam Cốc và cảnh quan núi đá vôi.','https://picsum.photos/seed/dest-12/1200/800','active'),
('Hà Giang','Hà Giang','Cao nguyên đá, đèo Mã Pì Lèng, mùa hoa tam giác mạch.','https://picsum.photos/seed/dest-13/1200/800','active'),
('Mộc Châu','Sơn La','Đồi chè, thác Dải Yếm và khí hậu mát mẻ.','https://picsum.photos/seed/dest-14/1200/800','active'),
('Buôn Ma Thuột','Đắk Lắk','Cà phê, voi, thác Dray Nur và văn hóa Tây Nguyên.','https://picsum.photos/seed/dest-15/1200/800','active'),
('Côn Đảo','Bà Rịa - Vũng Tàu','Biển hoang sơ, lặn ngắm san hô và di tích lịch sử.','https://picsum.photos/seed/dest-16/1200/800','active'),
('Vũng Tàu','Bà Rịa - Vũng Tàu','Biển gần Sài Gòn, nghỉ dưỡng cuối tuần.','https://picsum.photos/seed/dest-17/1200/800','active'),
('Tây Ninh','Tây Ninh','Núi Bà Đen và trải nghiệm cáp treo.','https://picsum.photos/seed/dest-18/1200/800','active'),
('An Giang','An Giang','Rừng tràm Trà Sư, Châu Đốc, núi Sam.','https://picsum.photos/seed/dest-19/1200/800','active'),
('Cà Mau','Cà Mau','Mũi Cà Mau, rừng ngập mặn và miền sông nước.','https://picsum.photos/seed/dest-20/1200/800','active');

INSERT INTO tours(code,name,slug,destination_id,tour_theme,duration_days,duration_nights,hotel_stars,base_price_adult,base_price_child,max_capacity_default,short_description,full_description,is_trending,is_best_deal) VALUES
('TV011D4','Tour Nghỉ dưỡng Phú Quốc 4N3Đ','tour-nghỉ-dưỡng-phú-quốc-4n3d-1',1,'culture',4,3,4,5210000,3750000,30,'Lịch trình Phú Quốc phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Phú Quốc có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV012D3','Tour Văn hóa Phú Quốc 3N2Đ','tour-văn-hóa-phú-quốc-3n2d-2',1,'family',3,2,3,4950000,3560000,35,'Lịch trình Phú Quốc phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Phú Quốc có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV013D2','Tour Eco Phú Quốc 2N1Đ','tour-eco-phú-quốc-2n1d-3',1,'mountain',2,1,3,4690000,3370000,45,'Lịch trình Phú Quốc phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Phú Quốc có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV021D4','Tour Văn hóa Nha Trang 4N3Đ','tour-văn-hóa-nha-trang-4n3d-4',2,'luxury',4,3,4,5380000,3870000,30,'Lịch trình Nha Trang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Nha Trang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV022D3','Tour Eco Nha Trang 3N2Đ','tour-eco-nha-trang-3n2d-5',2,'city',3,2,3,5120000,3680000,30,'Lịch trình Nha Trang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Nha Trang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV023D2','Tour Family Nha Trang 2N1Đ','tour-family-nha-trang-2n1d-6',2,'adventure',2,1,3,4860000,3490000,24,'Lịch trình Nha Trang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Nha Trang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV031D4','Tour Eco Đà Lạt 4N3Đ','tour-eco-dà-lạt-4n3d-7',3,'beach',4,3,4,5550000,3990000,28,'Lịch trình Đà Lạt phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Đà Lạt có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV032D3','Tour Family Đà Lạt 3N2Đ','tour-family-dà-lạt-3n2d-8',3,'culture',3,2,3,5290000,3800000,24,'Lịch trình Đà Lạt phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Đà Lạt có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV033D2','Tour Premium Đà Lạt 2N1Đ','tour-premium-dà-lạt-2n1d-9',3,'family',2,1,3,5030000,3620000,28,'Lịch trình Đà Lạt phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Đà Lạt có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV041D4','Tour Family Đà Nẵng 4N3Đ','tour-family-dà-nẵng-4n3d-10',4,'eco',4,3,4,5720000,4110000,35,'Lịch trình Đà Nẵng phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Đà Nẵng có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV042D3','Tour Premium Đà Nẵng 3N2Đ','tour-premium-dà-nẵng-3n2d-11',4,'luxury',3,2,3,5460000,3930000,28,'Lịch trình Đà Nẵng phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Đà Nẵng có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV043D2','Tour Khám phá Đà Nẵng 2N1Đ','tour-khám-phá-dà-nẵng-2n1d-12',4,'city',2,1,3,5200000,3740000,30,'Lịch trình Đà Nẵng phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Đà Nẵng có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV051D4','Tour Premium Cần Thơ 4N3Đ','tour-premium-cần-thơ-4n3d-13',5,'mountain',4,3,4,5890000,4240000,28,'Lịch trình Cần Thơ phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Cần Thơ có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV052D3','Tour Khám phá Cần Thơ 3N2Đ','tour-khám-phá-cần-thơ-3n2d-14',5,'beach',3,2,3,5630000,4050000,35,'Lịch trình Cần Thơ phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Cần Thơ có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV053D2','Tour Nghỉ dưỡng Cần Thơ 2N1Đ','tour-nghỉ-dưỡng-cần-thơ-2n1d-15',5,'culture',2,1,3,5370000,3860000,40,'Lịch trình Cần Thơ phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Cần Thơ có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV061D4','Tour Khám phá Sa Pa 4N3Đ','tour-khám-phá-sa-pa-4n3d-16',6,'adventure',4,3,4,6060000,4360000,40,'Lịch trình Sa Pa phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Sa Pa có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV062D3','Tour Nghỉ dưỡng Sa Pa 3N2Đ','tour-nghỉ-dưỡng-sa-pa-3n2d-17',6,'eco',3,2,3,5800000,4170000,24,'Lịch trình Sa Pa phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Sa Pa có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV063D2','Tour Văn hóa Sa Pa 2N1Đ','tour-văn-hóa-sa-pa-2n1d-18',6,'luxury',2,1,3,5540000,3980000,35,'Lịch trình Sa Pa phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Sa Pa có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV071D4','Tour Nghỉ dưỡng Hạ Long 4N3Đ','tour-nghỉ-dưỡng-hạ-long-4n3d-19',7,'family',4,3,4,6230000,4480000,45,'Lịch trình Hạ Long phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hạ Long có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV072D3','Tour Văn hóa Hạ Long 3N2Đ','tour-văn-hóa-hạ-long-3n2d-20',7,'mountain',3,2,3,5970000,4290000,30,'Lịch trình Hạ Long phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hạ Long có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,1),
('TV073D2','Tour Eco Hạ Long 2N1Đ','tour-eco-hạ-long-2n1d-21',7,'beach',2,1,3,5710000,4110000,45,'Lịch trình Hạ Long phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hạ Long có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV081D4','Tour Văn hóa Hội An 4N3Đ','tour-văn-hóa-hội-an-4n3d-22',8,'city',4,3,4,6400000,4600000,24,'Lịch trình Hội An phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hội An có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV082D3','Tour Eco Hội An 3N2Đ','tour-eco-hội-an-3n2d-23',8,'adventure',3,2,3,6140000,4420000,45,'Lịch trình Hội An phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hội An có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV083D2','Tour Family Hội An 2N1Đ','tour-family-hội-an-2n1d-24',8,'eco',2,1,3,5880000,4230000,24,'Lịch trình Hội An phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hội An có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV091D4','Tour Eco Huế 4N3Đ','tour-eco-huế-4n3d-25',9,'culture',4,3,4,6570000,4730000,35,'Lịch trình Huế phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Huế có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV092D3','Tour Family Huế 3N2Đ','tour-family-huế-3n2d-26',9,'family',3,2,3,6310000,4540000,45,'Lịch trình Huế phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Huế có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV093D2','Tour Premium Huế 2N1Đ','tour-premium-huế-2n1d-27',9,'mountain',2,1,3,6050000,4350000,28,'Lịch trình Huế phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Huế có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV101D4','Tour Family Mũi Né 4N3Đ','tour-family-mũi-né-4n3d-28',10,'luxury',4,3,4,6740000,4850000,35,'Lịch trình Mũi Né phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Mũi Né có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV102D3','Tour Premium Mũi Né 3N2Đ','tour-premium-mũi-né-3n2d-29',10,'city',3,2,3,6480000,4660000,28,'Lịch trình Mũi Né phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Mũi Né có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV103D2','Tour Khám phá Mũi Né 2N1Đ','tour-khám-phá-mũi-né-2n1d-30',10,'adventure',2,1,3,6220000,4470000,35,'Lịch trình Mũi Né phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Mũi Né có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV111D4','Tour Premium Quy Nhơn 4N3Đ','tour-premium-quy-nhơn-4n3d-31',11,'beach',4,3,4,6910000,4970000,45,'Lịch trình Quy Nhơn phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Quy Nhơn có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV112D3','Tour Khám phá Quy Nhơn 3N2Đ','tour-khám-phá-quy-nhơn-3n2d-32',11,'culture',3,2,3,6650000,4780000,30,'Lịch trình Quy Nhơn phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Quy Nhơn có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV113D2','Tour Nghỉ dưỡng Quy Nhơn 2N1Đ','tour-nghỉ-dưỡng-quy-nhơn-2n1d-33',11,'family',2,1,3,6390000,4600000,24,'Lịch trình Quy Nhơn phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Quy Nhơn có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV121D4','Tour Khám phá Ninh Bình 4N3Đ','tour-khám-phá-ninh-bình-4n3d-34',12,'eco',4,3,4,7080000,5090000,45,'Lịch trình Ninh Bình phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Ninh Bình có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV122D3','Tour Nghỉ dưỡng Ninh Bình 3N2Đ','tour-nghỉ-dưỡng-ninh-bình-3n2d-35',12,'luxury',3,2,3,6820000,4910000,35,'Lịch trình Ninh Bình phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Ninh Bình có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV123D2','Tour Văn hóa Ninh Bình 2N1Đ','tour-văn-hóa-ninh-bình-2n1d-36',12,'city',2,1,3,6560000,4720000,35,'Lịch trình Ninh Bình phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Ninh Bình có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV131D4','Tour Nghỉ dưỡng Hà Giang 4N3Đ','tour-nghỉ-dưỡng-hà-giang-4n3d-37',13,'mountain',4,3,4,7250000,5220000,35,'Lịch trình Hà Giang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hà Giang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV132D3','Tour Văn hóa Hà Giang 3N2Đ','tour-văn-hóa-hà-giang-3n2d-38',13,'beach',3,2,3,6990000,5030000,45,'Lịch trình Hà Giang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hà Giang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV133D2','Tour Eco Hà Giang 2N1Đ','tour-eco-hà-giang-2n1d-39',13,'culture',2,1,3,6730000,4840000,24,'Lịch trình Hà Giang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Hà Giang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV141D4','Tour Văn hóa Mộc Châu 4N3Đ','tour-văn-hóa-mộc-châu-4n3d-40',14,'adventure',4,3,4,7420000,5340000,45,'Lịch trình Mộc Châu phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Mộc Châu có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,1),
('TV142D3','Tour Eco Mộc Châu 3N2Đ','tour-eco-mộc-châu-3n2d-41',14,'eco',3,2,3,7160000,5150000,28,'Lịch trình Mộc Châu phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Mộc Châu có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV143D2','Tour Family Mộc Châu 2N1Đ','tour-family-mộc-châu-2n1d-42',14,'luxury',2,1,3,6900000,4960000,28,'Lịch trình Mộc Châu phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Mộc Châu có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV151D4','Tour Eco Buôn Ma Thuột 4N3Đ','tour-eco-buôn-ma-thuột-4n3d-43',15,'family',4,3,4,7590000,5460000,28,'Lịch trình Buôn Ma Thuột phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Buôn Ma Thuột có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV152D3','Tour Family Buôn Ma Thuột 3N2Đ','tour-family-buôn-ma-thuột-3n2d-44',15,'mountain',3,2,3,7330000,5270000,24,'Lịch trình Buôn Ma Thuột phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Buôn Ma Thuột có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV153D2','Tour Premium Buôn Ma Thuột 2N1Đ','tour-premium-buôn-ma-thuột-2n1d-45',15,'beach',2,1,3,7070000,5090000,28,'Lịch trình Buôn Ma Thuột phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Buôn Ma Thuột có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV161D4','Tour Family Côn Đảo 4N3Đ','tour-family-côn-dảo-4n3d-46',16,'city',4,3,4,7760000,5580000,40,'Lịch trình Côn Đảo phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Côn Đảo có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV162D3','Tour Premium Côn Đảo 3N2Đ','tour-premium-côn-dảo-3n2d-47',16,'adventure',3,2,3,7500000,5400000,35,'Lịch trình Côn Đảo phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Côn Đảo có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV163D2','Tour Khám phá Côn Đảo 2N1Đ','tour-khám-phá-côn-dảo-2n1d-48',16,'eco',2,1,3,7240000,5210000,45,'Lịch trình Côn Đảo phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Côn Đảo có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV171D4','Tour Premium Vũng Tàu 4N3Đ','tour-premium-vũng-tàu-4n3d-49',17,'culture',4,3,4,7930000,5700000,28,'Lịch trình Vũng Tàu phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Vũng Tàu có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV172D3','Tour Khám phá Vũng Tàu 3N2Đ','tour-khám-phá-vũng-tàu-3n2d-50',17,'family',3,2,3,7670000,5520000,40,'Lịch trình Vũng Tàu phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Vũng Tàu có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV173D2','Tour Nghỉ dưỡng Vũng Tàu 2N1Đ','tour-nghỉ-dưỡng-vũng-tàu-2n1d-51',17,'mountain',2,1,3,7410000,5330000,40,'Lịch trình Vũng Tàu phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Vũng Tàu có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV181D4','Tour Khám phá Tây Ninh 4N3Đ','tour-khám-phá-tây-ninh-4n3d-52',18,'luxury',4,3,4,8100000,5830000,35,'Lịch trình Tây Ninh phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Tây Ninh có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV182D3','Tour Nghỉ dưỡng Tây Ninh 3N2Đ','tour-nghỉ-dưỡng-tây-ninh-3n2d-53',18,'city',3,2,3,7840000,5640000,45,'Lịch trình Tây Ninh phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Tây Ninh có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV183D2','Tour Văn hóa Tây Ninh 2N1Đ','tour-văn-hóa-tây-ninh-2n1d-54',18,'adventure',2,1,3,7580000,5450000,30,'Lịch trình Tây Ninh phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Tây Ninh có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV191D4','Tour Nghỉ dưỡng An Giang 4N3Đ','tour-nghỉ-dưỡng-an-giang-4n3d-55',19,'beach',4,3,4,8270000,5950000,28,'Lịch trình An Giang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour An Giang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,0),
('TV192D3','Tour Văn hóa An Giang 3N2Đ','tour-văn-hóa-an-giang-3n2d-56',19,'culture',3,2,3,8010000,5760000,40,'Lịch trình An Giang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour An Giang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,1),
('TV193D2','Tour Eco An Giang 2N1Đ','tour-eco-an-giang-2n1d-57',19,'family',2,1,3,7750000,5580000,40,'Lịch trình An Giang phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour An Giang có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV201D4','Tour Văn hóa Cà Mau 4N3Đ','tour-văn-hóa-cà-mau-4n3d-58',20,'eco',4,3,4,8440000,6070000,28,'Lịch trình Cà Mau phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Cà Mau có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV202D3','Tour Eco Cà Mau 3N2Đ','tour-eco-cà-mau-3n2d-59',20,'luxury',3,2,3,8180000,5880000,24,'Lịch trình Cà Mau phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Cà Mau có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',0,0),
('TV203D2','Tour Family Cà Mau 2N1Đ','tour-family-cà-mau-2n1d-60',20,'city',2,1,3,7920000,5700000,24,'Lịch trình Cà Mau phù hợp gia đình, nhóm bạn và khách hàng Việt.','Tour Cà Mau có lịch trình, ảnh, đánh giá, đặt chỗ, voucher, điểm đón và gợi ý AI.',1,1);

INSERT INTO tour_media(tour_id,file_url,is_cover,display_order)
SELECT id, CONCAT('https://picsum.photos/seed/tour-cover-', id, '/900/600'), 1, 1 FROM tours
UNION ALL
SELECT id, CONCAT('https://picsum.photos/seed/tour-gallery-', id, '-2/900/600'), 0, 2 FROM tours
UNION ALL
SELECT id, CONCAT('https://picsum.photos/seed/tour-gallery-', id, '-3/900/600'), 0, 3 FROM tours;


INSERT INTO tour_itinerary(tour_id,day_number,item_order,title,description,location_name)
SELECT t.id, d.day_number, 1,
       CONCAT('Ngày ', d.day_number, ': Trải nghiệm nổi bật'),
       CASE d.day_number
         WHEN 1 THEN 'Đón khách, di chuyển, nhận phòng và tham quan nhẹ.'
         WHEN 2 THEN 'Tham quan điểm chính, ăn uống đặc sản địa phương.'
         WHEN 3 THEN 'Tự do trải nghiệm, mua đặc sản và chụp ảnh.'
         ELSE 'Kết thúc chương trình, trả khách tại điểm hẹn.'
       END,
       dest.name
FROM tours t
JOIN destinations dest ON dest.id=t.destination_id
JOIN (SELECT 1 day_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) d ON d.day_number <= t.duration_days;


INSERT INTO tour_departures(tour_id,departure_date,end_date,adult_price,child_price,total_slots,booked_slots,held_slots,status)
SELECT t.id,
       DATE_ADD('2026-05-10', INTERVAL (seq.n*21 + (t.id % 6)) DAY),
       DATE_ADD(DATE_ADD('2026-05-10', INTERVAL (seq.n*21 + (t.id % 6)) DAY), INTERVAL t.duration_days-1 DAY),
       t.base_price_adult,
       t.base_price_child,
       t.max_capacity_default,
       0,0,'open'
FROM tours t
JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) seq;


INSERT INTO tour_policies(tour_id,policy_type,content,display_order)
SELECT id,'cancel_policy','Có thể gửi yêu cầu hoàn tiền trước ngày khởi hành, admin duyệt theo chính sách dịch vụ.',1 FROM tours
UNION ALL SELECT id,'included','Bao gồm xe du lịch, hướng dẫn viên, vé tham quan cơ bản và bảo hiểm du lịch.',2 FROM tours
UNION ALL SELECT id,'note','Giá tour có thể thay đổi theo mùa cao điểm và tình trạng phòng.',3 FROM tours;

INSERT INTO tour_accommodations(tour_id,name,accommodation_type,star_rating,address,description,price_per_night,image_url,amenities,status)
SELECT id, CONCAT('Travela Partner Hotel ', id), 'hotel', COALESCE(hotel_stars,3), 'Trung tâm điểm đến', 'Khách sạn đối tác phục vụ đoàn tour.', base_price_adult*0.18, CONCAT('https://picsum.photos/seed/hotel-',id,'/900/600'), 'Wifi, ăn sáng, hồ bơi, gần trung tâm', 'active' FROM tours;

INSERT INTO tour_transports(tour_id,name,transport_type,provider,origin,destination_label,duration_hours,price,description,image_url,status)
SELECT t.id, CONCAT('Xe/Vé tour ', t.code), CASE WHEN t.tour_theme IN ('beach','luxury') THEN 'plane' ELSE 'bus' END, 'Travela Transport', 'TP.HCM', d.name, t.duration_days*2.5, t.base_price_adult*0.12, 'Phương tiện được sắp xếp theo lịch trình tour.', CONCAT('https://picsum.photos/seed/transport-',t.id,'/900/600'), 'active'
FROM tours t JOIN destinations d ON d.id=t.destination_id;

INSERT INTO vouchers(code,name,description,member_tier,discount_type,discount_value,max_discount,min_order_amount,start_date,end_date,quota,status) VALUES
('BRONZE5','Giảm 5% cho hạng Đồng','Ưu đãi giảm 5% cho hạng đồng khi đặt tour Travela.','bronze','percent',5,200000,1000000,'2026-01-01','2026-12-31',500,'active'),
('SILVER8','Giảm 8% cho hạng Bạc','Ưu đãi giảm 8% cho hạng bạc khi đặt tour Travela.','silver','percent',8,400000,2000000,'2026-01-01','2026-12-31',300,'active'),
('GOLD12','Giảm 12% cho hạng Vàng','Ưu đãi giảm 12% cho hạng vàng khi đặt tour Travela.','gold','percent',12,800000,3000000,'2026-01-01','2026-12-31',200,'active'),
('DIAMOND15','Giảm 15% cho hạng Kim cương','Ưu đãi giảm 15% cho hạng kim cương khi đặt tour Travela.','diamond','percent',15,1500000,5000000,'2026-01-01','2026-12-31',100,'active'),
('BRONZE1X','Voucher bronze ưu đãi 6% #1','Ưu đãi tự động cho thành viên hạng bronze.','bronze','percent',6,600000,1000000,'2026-01-01','2026-12-31',160,'active'),
('BRONZE2X','Voucher bronze ưu đãi 7% #2','Ưu đãi tự động cho thành viên hạng bronze.','bronze','percent',7,700000,2000000,'2026-01-01','2026-12-31',140,'active'),
('BRONZE3X','Voucher bronze ưu đãi 8% #3','Ưu đãi tự động cho thành viên hạng bronze.','bronze','percent',8,800000,3000000,'2026-01-01','2026-12-31',120,'active'),
('BRONZE4X','Voucher bronze ưu đãi 9% #4','Ưu đãi tự động cho thành viên hạng bronze.','bronze','percent',9,900000,4000000,'2026-01-01','2026-12-31',100,'active'),
('SILVER1X','Voucher silver ưu đãi 9% #1','Ưu đãi tự động cho thành viên hạng silver.','silver','percent',9,900000,1000000,'2026-01-01','2026-12-31',160,'active'),
('SILVER2X','Voucher silver ưu đãi 10% #2','Ưu đãi tự động cho thành viên hạng silver.','silver','percent',10,1000000,2000000,'2026-01-01','2026-12-31',140,'active'),
('SILVER3X','Voucher silver ưu đãi 11% #3','Ưu đãi tự động cho thành viên hạng silver.','silver','percent',11,1100000,3000000,'2026-01-01','2026-12-31',120,'active'),
('SILVER4X','Voucher silver ưu đãi 12% #4','Ưu đãi tự động cho thành viên hạng silver.','silver','percent',12,1200000,4000000,'2026-01-01','2026-12-31',100,'active'),
('GOLD1X','Voucher gold ưu đãi 12% #1','Ưu đãi tự động cho thành viên hạng gold.','gold','percent',12,1200000,1000000,'2026-01-01','2026-12-31',160,'active'),
('GOLD2X','Voucher gold ưu đãi 13% #2','Ưu đãi tự động cho thành viên hạng gold.','gold','percent',13,1300000,2000000,'2026-01-01','2026-12-31',140,'active'),
('GOLD3X','Voucher gold ưu đãi 14% #3','Ưu đãi tự động cho thành viên hạng gold.','gold','percent',14,1400000,3000000,'2026-01-01','2026-12-31',120,'active'),
('GOLD4X','Voucher gold ưu đãi 15% #4','Ưu đãi tự động cho thành viên hạng gold.','gold','percent',15,1500000,4000000,'2026-01-01','2026-12-31',100,'active'),
('DIAMOND1X','Voucher diamond ưu đãi 15% #1','Ưu đãi tự động cho thành viên hạng diamond.','diamond','percent',15,1500000,1000000,'2026-01-01','2026-12-31',160,'active'),
('DIAMOND2X','Voucher diamond ưu đãi 16% #2','Ưu đãi tự động cho thành viên hạng diamond.','diamond','percent',16,1600000,2000000,'2026-01-01','2026-12-31',140,'active'),
('DIAMOND3X','Voucher diamond ưu đãi 17% #3','Ưu đãi tự động cho thành viên hạng diamond.','diamond','percent',17,1700000,3000000,'2026-01-01','2026-12-31',120,'active'),
('DIAMOND4X','Voucher diamond ưu đãi 18% #4','Ưu đãi tự động cho thành viên hạng diamond.','diamond','percent',18,1800000,4000000,'2026-01-01','2026-12-31',100,'active');

INSERT IGNORE INTO user_vouchers(user_id,voucher_id) SELECT u.id, v.id FROM users u JOIN vouchers v ON v.member_tier=u.member_tier WHERE u.role='user' AND v.status='active';


INSERT INTO tour_pickup_points(tour_id, departure_id, province, name, address, pickup_time, note, status)
SELECT t.id, td.id, d.province, CONCAT('Điểm đón trung tâm ', d.province), CONCAT('Trung tâm ', d.province), '06:00:00', 'Vui lòng có mặt trước giờ đón 15 phút.', 'active'
FROM tour_departures td JOIN tours t ON t.id=td.tour_id JOIN destinations d ON d.id=t.destination_id;

INSERT INTO tour_pickup_points(tour_id, departure_id, province, name, address, pickup_time, note, status)
SELECT t.id, td.id, 'TP.HCM', 'Nhà văn hóa Thanh Niên', '04 Phạm Ngọc Thạch, Quận 1, TP.HCM', '04:30:00', 'Điểm đón dành cho khách xuất phát từ TP.HCM.', 'active'
FROM tour_departures td JOIN tours t ON t.id=td.tour_id JOIN destinations d ON d.id=t.destination_id
WHERE d.province IN ('Lâm Đồng','Bình Thuận','Bà Rịa - Vũng Tàu','Tây Ninh','An Giang','Cần Thơ','Cà Mau','Kiên Giang','Đắk Lắk');

INSERT INTO tour_pickup_points(tour_id, departure_id, province, name, address, pickup_time, note, status)
SELECT t.id, td.id, 'Cần Thơ', 'Bến xe Cần Thơ', '91B Nguyễn Văn Linh, Cần Thơ', '05:00:00', 'Phù hợp khách ở Cần Thơ hoặc khu vực miền Tây.', 'active'
FROM tour_departures td JOIN tours t ON t.id=td.tour_id JOIN destinations d ON d.id=t.destination_id
WHERE d.province IN ('An Giang','Cần Thơ','Cà Mau','Kiên Giang');

INSERT INTO tour_pickup_points(tour_id, departure_id, province, name, address, pickup_time, note, status)
SELECT t.id, td.id, 'Khác', 'Liên hệ tư vấn điểm đón phù hợp', 'Travela sẽ liên hệ xác nhận điểm đón sau khi đặt tour', NULL, 'Dành cho khách không ở gần các điểm đón có sẵn.', 'active'
FROM tour_departures td JOIN tours t ON t.id=td.tour_id;

INSERT INTO guides(full_name,phone,email,identity_number,languages,experience_years,status) VALUES
('HDV Phạm Hoàng Dũng','0912000001','hdv01@travela.vn','079300000001','Tiếng Việt, Tiếng Anh',12,'active'),
('HDV Hoàng Quốc Linh','0912000002','hdv02@travela.vn','079300000002','Tiếng Việt, Tiếng Trung',3,'active'),
('HDV Huỳnh Thảo Oanh','0912000003','hdv03@travela.vn','079300000003','Tiếng Việt, Tiếng Hàn',10,'active'),
('HDV Võ Bảo Sơn','0912000004','hdv04@travela.vn','079300000004','Tiếng Việt, Tiếng Nhật',4,'active'),
('HDV Đặng Khánh Uyên','0912000005','hdv05@travela.vn','079300000005','Tiếng Việt',8,'active'),
('HDV Bùi Phúc Đạt','0912000006','hdv06@travela.vn','079300000006','Tiếng Việt, Tiếng Anh',5,'active'),
('HDV Đỗ Hà Bình','0912000007','hdv07@travela.vn','079300000007','Tiếng Việt, Tiếng Trung',5,'active'),
('HDV Hồ Minh Hân','0912000008','hdv08@travela.vn','079300000008','Tiếng Việt, Tiếng Hàn',2,'active'),
('HDV Ngô Hoàng My','0912000009','hdv09@travela.vn','079300000009','Tiếng Việt, Tiếng Nhật',6,'active'),
('HDV Dương Quốc Phương','0912000010','hdv10@travela.vn','079300000010','Tiếng Việt',5,'active'),
('HDV Lý Thảo Trang','0912000011','hdv11@travela.vn','079300000011','Tiếng Việt, Tiếng Anh',6,'active'),
('HDV Mai Bảo Vy','0912000012','hdv12@travela.vn','079300000012','Tiếng Việt, Tiếng Trung',10,'active'),
('HDV Phan Khánh Nhi','0912000013','hdv13@travela.vn','079300000013','Tiếng Việt, Tiếng Hàn',5,'active'),
('HDV Nguyễn Phúc Chi','0912000014','hdv14@travela.vn','079300000014','Tiếng Việt, Tiếng Nhật',11,'active'),
('HDV Trần Hà Khoa','0912000015','hdv15@travela.vn','079300000015','Tiếng Việt',7,'active'),
('HDV Lê Minh Nam','0912000016','hdv16@travela.vn','079300000016','Tiếng Việt, Tiếng Anh',6,'active'),
('HDV Phạm Hoàng Quân','0912000017','hdv17@travela.vn','079300000017','Tiếng Việt, Tiếng Trung',10,'active'),
('HDV Hoàng Quốc Tú','0912000018','hdv18@travela.vn','079300000018','Tiếng Việt, Tiếng Hàn',8,'active'),
('HDV Huỳnh Thảo Yến','0912000019','hdv19@travela.vn','079300000019','Tiếng Việt, Tiếng Nhật',4,'active'),
('HDV Võ Bảo An','0912000020','hdv20@travela.vn','079300000020','Tiếng Việt',2,'active'),
('HDV Đặng Khánh Dũng','0912000021','hdv21@travela.vn','079300000021','Tiếng Việt, Tiếng Anh',7,'active'),
('HDV Bùi Phúc Linh','0912000022','hdv22@travela.vn','079300000022','Tiếng Việt, Tiếng Trung',9,'active'),
('HDV Đỗ Hà Oanh','0912000023','hdv23@travela.vn','079300000023','Tiếng Việt, Tiếng Hàn',12,'active'),
('HDV Hồ Minh Sơn','0912000024','hdv24@travela.vn','079300000024','Tiếng Việt, Tiếng Nhật',11,'active'),
('HDV Ngô Hoàng Uyên','0912000025','hdv25@travela.vn','079300000025','Tiếng Việt',10,'active'),
('HDV Dương Quốc Đạt','0912000026','hdv26@travela.vn','079300000026','Tiếng Việt, Tiếng Anh',8,'active'),
('HDV Lý Thảo Bình','0912000027','hdv27@travela.vn','079300000027','Tiếng Việt, Tiếng Trung',10,'active'),
('HDV Mai Bảo Hân','0912000028','hdv28@travela.vn','079300000028','Tiếng Việt, Tiếng Hàn',4,'active'),
('HDV Phan Khánh My','0912000029','hdv29@travela.vn','079300000029','Tiếng Việt, Tiếng Nhật',10,'active'),
('HDV Nguyễn Phúc Phương','0912000030','hdv30@travela.vn','079300000030','Tiếng Việt',4,'active');

INSERT INTO bookings(booking_code,user_id,tour_id,departure_id,adult_count,child_count,original_amount,discount_amount,final_amount,booking_status,hold_expires_at,contact_name,contact_email,contact_phone,note) VALUES
('BK2026X0001',2,1,1,2,0,13180000,0,13180000,'confirmed',NULL,'Khách Demo 001','minhanh@gmail.com','0988000001','Seed booking demo lớn'),
('BK2026X0002',3,5,21,2,1,6070000,0,6070000,'confirmed',NULL,'Khách Demo 002','giabao@gmail.com','0988000002','Seed booking demo lớn'),
('BK2026X0003',4,3,11,1,1,5780000,0,5780000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 003','hoangvy@gmail.com','0988000003','Seed booking demo lớn'),
('BK2026X0004',30,1,4,2,0,5180000,0,5180000,'waiting_confirmation',NULL,'Khách Demo 004','user030@travela.vn','0988000004','Seed booking demo lớn'),
('BK2026X0005',37,1,5,3,1,9634800,0,9634800,'cancelled',NULL,'Khách Demo 005','user037@travela.vn','0988000005','Seed booking demo lớn'),
('BK2026X0006',44,2,6,1,0,2680000,0,2680000,'confirmed',NULL,'Khách Demo 006','user044@travela.vn','0988000006','Seed booking demo lớn'),
('BK2026X0007',51,2,7,2,0,5360000,0,5360000,'completed',NULL,'Khách Demo 007','user051@travela.vn','0988000007','Seed booking demo lớn'),
('BK2026X0008',58,2,8,3,0,8040000,0,8040000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 008','user058@travela.vn','0988000008','Seed booking demo lớn'),
('BK2026X0009',65,2,9,1,0,2680000,0,2680000,'waiting_confirmation',NULL,'Khách Demo 009','user065@travela.vn','0988000009','Seed booking demo lớn'),
('BK2026X0010',72,2,10,2,1,7289600,0,7289600,'cancelled',NULL,'Khách Demo 010','user072@travela.vn','0988000010','Seed booking demo lớn'),
('BK2026X0011',79,3,11,3,0,8310000,0,8310000,'confirmed',NULL,'Khách Demo 011','user079@travela.vn','0988000011','Seed booking demo lớn'),
('BK2026X0012',2,3,12,1,0,2770000,0,2770000,'completed',NULL,'Khách Demo 012','minhanh@gmail.com','0988000012','Seed booking demo lớn'),
('BK2026X0013',9,3,13,2,0,5540000,0,5540000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 013','user009@travela.vn','0988000013','Seed booking demo lớn'),
('BK2026X0014',16,3,14,3,0,8310000,0,8310000,'waiting_confirmation',NULL,'Khách Demo 014','user016@travela.vn','0988000014','Seed booking demo lớn'),
('BK2026X0015',23,3,15,1,1,4764400,0,4764400,'cancelled',NULL,'Khách Demo 015','user023@travela.vn','0988000015','Seed booking demo lớn'),
('BK2026X0016',30,4,16,2,0,5720000,0,5720000,'confirmed',NULL,'Khách Demo 016','user030@travela.vn','0988000016','Seed booking demo lớn'),
('BK2026X0017',37,4,17,3,0,8580000,0,8580000,'completed',NULL,'Khách Demo 017','user037@travela.vn','0988000017','Seed booking demo lớn'),
('BK2026X0018',44,4,18,1,0,2860000,0,2860000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 018','user044@travela.vn','0988000018','Seed booking demo lớn'),
('BK2026X0019',51,4,19,2,0,5720000,0,5720000,'waiting_confirmation',NULL,'Khách Demo 019','user051@travela.vn','0988000019','Seed booking demo lớn'),
('BK2026X0020',58,4,20,3,1,10639200,0,10639200,'cancelled',NULL,'Khách Demo 020','user058@travela.vn','0988000020','Seed booking demo lớn'),
('BK2026X0021',65,5,21,1,0,2950000,0,2950000,'confirmed',NULL,'Khách Demo 021','user065@travela.vn','0988000021','Seed booking demo lớn'),
('BK2026X0022',72,5,22,2,0,5900000,0,5900000,'completed',NULL,'Khách Demo 022','user072@travela.vn','0988000022','Seed booking demo lớn'),
('BK2026X0023',79,5,23,3,0,8850000,0,8850000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 023','user079@travela.vn','0988000023','Seed booking demo lớn'),
('BK2026X0024',2,5,24,1,0,2950000,0,2950000,'waiting_confirmation',NULL,'Khách Demo 024','minhanh@gmail.com','0988000024','Seed booking demo lớn'),
('BK2026X0025',9,5,25,2,1,8024000,0,8024000,'cancelled',NULL,'Khách Demo 025','user009@travela.vn','0988000025','Seed booking demo lớn'),
('BK2026X0026',16,6,26,3,0,9120000,0,9120000,'confirmed',NULL,'Khách Demo 026','user016@travela.vn','0988000026','Seed booking demo lớn'),
('BK2026X0027',23,6,27,1,0,3040000,0,3040000,'completed',NULL,'Khách Demo 027','user023@travela.vn','0988000027','Seed booking demo lớn'),
('BK2026X0028',30,6,28,2,0,6080000,0,6080000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 028','user030@travela.vn','0988000028','Seed booking demo lớn'),
('BK2026X0029',37,6,29,3,0,9120000,0,9120000,'waiting_confirmation',NULL,'Khách Demo 029','user037@travela.vn','0988000029','Seed booking demo lớn'),
('BK2026X0030',44,6,30,1,1,5228800,0,5228800,'cancelled',NULL,'Khách Demo 030','user044@travela.vn','0988000030','Seed booking demo lớn'),
('BK2026X0031',51,7,31,2,0,6260000,0,6260000,'confirmed',NULL,'Khách Demo 031','user051@travela.vn','0988000031','Seed booking demo lớn'),
('BK2026X0032',58,7,32,3,0,9390000,0,9390000,'completed',NULL,'Khách Demo 032','user058@travela.vn','0988000032','Seed booking demo lớn'),
('BK2026X0033',65,7,33,1,0,3130000,0,3130000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 033','user065@travela.vn','0988000033','Seed booking demo lớn'),
('BK2026X0034',72,7,34,2,0,6260000,0,6260000,'waiting_confirmation',NULL,'Khách Demo 034','user072@travela.vn','0988000034','Seed booking demo lớn'),
('BK2026X0035',79,7,35,3,1,11643600,0,11643600,'cancelled',NULL,'Khách Demo 035','user079@travela.vn','0988000035','Seed booking demo lớn'),
('BK2026X0036',2,8,36,1,0,3220000,0,3220000,'confirmed',NULL,'Khách Demo 036','minhanh@gmail.com','0988000036','Seed booking demo lớn'),
('BK2026X0037',9,8,37,2,0,6440000,0,6440000,'completed',NULL,'Khách Demo 037','user009@travela.vn','0988000037','Seed booking demo lớn'),
('BK2026X0038',16,8,38,3,0,9660000,0,9660000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 038','user016@travela.vn','0988000038','Seed booking demo lớn'),
('BK2026X0039',23,8,39,1,0,3220000,0,3220000,'waiting_confirmation',NULL,'Khách Demo 039','user023@travela.vn','0988000039','Seed booking demo lớn'),
('BK2026X0040',30,8,40,2,1,8758400,0,8758400,'cancelled',NULL,'Khách Demo 040','user030@travela.vn','0988000040','Seed booking demo lớn'),
('BK2026X0041',37,9,41,3,0,9930000,0,9930000,'confirmed',NULL,'Khách Demo 041','user037@travela.vn','0988000041','Seed booking demo lớn'),
('BK2026X0042',44,9,42,1,0,3310000,0,3310000,'completed',NULL,'Khách Demo 042','user044@travela.vn','0988000042','Seed booking demo lớn'),
('BK2026X0043',51,9,43,2,0,6620000,0,6620000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 043','user051@travela.vn','0988000043','Seed booking demo lớn'),
('BK2026X0044',58,9,44,3,0,9930000,0,9930000,'waiting_confirmation',NULL,'Khách Demo 044','user058@travela.vn','0988000044','Seed booking demo lớn'),
('BK2026X0045',65,9,45,1,1,5693200,0,5693200,'cancelled',NULL,'Khách Demo 045','user065@travela.vn','0988000045','Seed booking demo lớn'),
('BK2026X0046',72,10,46,2,0,6800000,0,6800000,'confirmed',NULL,'Khách Demo 046','user072@travela.vn','0988000046','Seed booking demo lớn'),
('BK2026X0047',79,10,47,3,0,10200000,0,10200000,'completed',NULL,'Khách Demo 047','user079@travela.vn','0988000047','Seed booking demo lớn'),
('BK2026X0048',2,10,48,1,0,3400000,0,3400000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 048','minhanh@gmail.com','0988000048','Seed booking demo lớn'),
('BK2026X0049',9,10,49,2,0,6800000,0,6800000,'waiting_confirmation',NULL,'Khách Demo 049','user009@travela.vn','0988000049','Seed booking demo lớn'),
('BK2026X0050',16,10,50,3,1,12648000,0,12648000,'cancelled',NULL,'Khách Demo 050','user016@travela.vn','0988000050','Seed booking demo lớn'),
('BK2026X0051',23,11,51,1,0,3490000,0,3490000,'confirmed',NULL,'Khách Demo 051','user023@travela.vn','0988000051','Seed booking demo lớn'),
('BK2026X0052',30,11,52,2,0,6980000,0,6980000,'completed',NULL,'Khách Demo 052','user030@travela.vn','0988000052','Seed booking demo lớn'),
('BK2026X0053',37,11,53,3,0,10470000,0,10470000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 053','user037@travela.vn','0988000053','Seed booking demo lớn'),
('BK2026X0054',44,11,54,1,0,3490000,0,3490000,'waiting_confirmation',NULL,'Khách Demo 054','user044@travela.vn','0988000054','Seed booking demo lớn'),
('BK2026X0055',51,11,55,2,1,9492800,0,9492800,'cancelled',NULL,'Khách Demo 055','user051@travela.vn','0988000055','Seed booking demo lớn'),
('BK2026X0056',58,12,56,3,0,10740000,0,10740000,'confirmed',NULL,'Khách Demo 056','user058@travela.vn','0988000056','Seed booking demo lớn'),
('BK2026X0057',65,12,57,1,0,3580000,0,3580000,'completed',NULL,'Khách Demo 057','user065@travela.vn','0988000057','Seed booking demo lớn'),
('BK2026X0058',72,12,58,2,0,7160000,0,7160000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 058','user072@travela.vn','0988000058','Seed booking demo lớn'),
('BK2026X0059',79,12,59,3,0,10740000,0,10740000,'waiting_confirmation',NULL,'Khách Demo 059','user079@travela.vn','0988000059','Seed booking demo lớn'),
('BK2026X0060',2,12,60,1,1,6157600,0,6157600,'cancelled',NULL,'Khách Demo 060','minhanh@gmail.com','0988000060','Seed booking demo lớn'),
('BK2026X0061',9,13,61,2,0,7340000,0,7340000,'confirmed',NULL,'Khách Demo 061','user009@travela.vn','0988000061','Seed booking demo lớn'),
('BK2026X0062',16,13,62,3,0,11010000,0,11010000,'completed',NULL,'Khách Demo 062','user016@travela.vn','0988000062','Seed booking demo lớn'),
('BK2026X0063',23,13,63,1,0,3670000,0,3670000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 063','user023@travela.vn','0988000063','Seed booking demo lớn'),
('BK2026X0064',30,13,64,2,0,7340000,0,7340000,'waiting_confirmation',NULL,'Khách Demo 064','user030@travela.vn','0988000064','Seed booking demo lớn'),
('BK2026X0065',37,13,65,3,1,13652400,0,13652400,'cancelled',NULL,'Khách Demo 065','user037@travela.vn','0988000065','Seed booking demo lớn'),
('BK2026X0066',44,14,66,1,0,3760000,0,3760000,'confirmed',NULL,'Khách Demo 066','user044@travela.vn','0988000066','Seed booking demo lớn'),
('BK2026X0067',51,14,67,2,0,7520000,0,7520000,'completed',NULL,'Khách Demo 067','user051@travela.vn','0988000067','Seed booking demo lớn'),
('BK2026X0068',58,14,68,3,0,11280000,0,11280000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 068','user058@travela.vn','0988000068','Seed booking demo lớn'),
('BK2026X0069',65,14,69,1,0,3760000,0,3760000,'waiting_confirmation',NULL,'Khách Demo 069','user065@travela.vn','0988000069','Seed booking demo lớn'),
('BK2026X0070',72,14,70,2,1,10227200,0,10227200,'cancelled',NULL,'Khách Demo 070','user072@travela.vn','0988000070','Seed booking demo lớn'),
('BK2026X0071',79,15,71,3,0,11550000,0,11550000,'confirmed',NULL,'Khách Demo 071','user079@travela.vn','0988000071','Seed booking demo lớn'),
('BK2026X0072',2,15,72,1,0,3850000,0,3850000,'completed',NULL,'Khách Demo 072','minhanh@gmail.com','0988000072','Seed booking demo lớn'),
('BK2026X0073',9,15,73,2,0,7700000,0,7700000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 073','user009@travela.vn','0988000073','Seed booking demo lớn'),
('BK2026X0074',16,15,74,3,0,11550000,0,11550000,'waiting_confirmation',NULL,'Khách Demo 074','user016@travela.vn','0988000074','Seed booking demo lớn'),
('BK2026X0075',23,15,75,1,1,6622000,0,6622000,'cancelled',NULL,'Khách Demo 075','user023@travela.vn','0988000075','Seed booking demo lớn'),
('BK2026X0076',30,16,76,2,0,7880000,0,7880000,'confirmed',NULL,'Khách Demo 076','user030@travela.vn','0988000076','Seed booking demo lớn'),
('BK2026X0077',37,16,77,3,0,11820000,0,11820000,'completed',NULL,'Khách Demo 077','user037@travela.vn','0988000077','Seed booking demo lớn'),
('BK2026X0078',44,16,78,1,0,3940000,0,3940000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 078','user044@travela.vn','0988000078','Seed booking demo lớn'),
('BK2026X0079',51,16,79,2,0,7880000,0,7880000,'waiting_confirmation',NULL,'Khách Demo 079','user051@travela.vn','0988000079','Seed booking demo lớn'),
('BK2026X0080',58,16,80,3,1,14656800,0,14656800,'cancelled',NULL,'Khách Demo 080','user058@travela.vn','0988000080','Seed booking demo lớn');

INSERT INTO bookings(booking_code,user_id,tour_id,departure_id,adult_count,child_count,original_amount,discount_amount,final_amount,booking_status,hold_expires_at,contact_name,contact_email,contact_phone,note) VALUES
('BK2026X0081',65,17,81,1,0,4030000,0,4030000,'confirmed',NULL,'Khách Demo 081','user065@travela.vn','0988000081','Seed booking demo lớn'),
('BK2026X0082',72,17,82,2,0,8060000,0,8060000,'completed',NULL,'Khách Demo 082','user072@travela.vn','0988000082','Seed booking demo lớn'),
('BK2026X0083',79,17,83,3,0,12090000,0,12090000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 083','user079@travela.vn','0988000083','Seed booking demo lớn'),
('BK2026X0084',2,17,84,1,0,4030000,0,4030000,'waiting_confirmation',NULL,'Khách Demo 084','minhanh@gmail.com','0988000084','Seed booking demo lớn'),
('BK2026X0085',9,17,85,2,1,10961600,0,10961600,'cancelled',NULL,'Khách Demo 085','user009@travela.vn','0988000085','Seed booking demo lớn'),
('BK2026X0086',16,18,86,3,0,12360000,0,12360000,'confirmed',NULL,'Khách Demo 086','user016@travela.vn','0988000086','Seed booking demo lớn'),
('BK2026X0087',23,18,87,1,0,4120000,0,4120000,'completed',NULL,'Khách Demo 087','user023@travela.vn','0988000087','Seed booking demo lớn'),
('BK2026X0088',30,18,88,2,0,8240000,0,8240000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 088','user030@travela.vn','0988000088','Seed booking demo lớn'),
('BK2026X0089',37,18,89,3,0,12360000,0,12360000,'waiting_confirmation',NULL,'Khách Demo 089','user037@travela.vn','0988000089','Seed booking demo lớn'),
('BK2026X0090',44,18,90,1,1,7086400,0,7086400,'cancelled',NULL,'Khách Demo 090','user044@travela.vn','0988000090','Seed booking demo lớn'),
('BK2026X0091',51,19,91,2,0,8420000,0,8420000,'confirmed',NULL,'Khách Demo 091','user051@travela.vn','0988000091','Seed booking demo lớn'),
('BK2026X0092',58,19,92,3,0,12630000,0,12630000,'completed',NULL,'Khách Demo 092','user058@travela.vn','0988000092','Seed booking demo lớn'),
('BK2026X0093',65,19,93,1,0,4210000,0,4210000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 093','user065@travela.vn','0988000093','Seed booking demo lớn'),
('BK2026X0094',72,19,94,2,0,8420000,0,8420000,'waiting_confirmation',NULL,'Khách Demo 094','user072@travela.vn','0988000094','Seed booking demo lớn'),
('BK2026X0095',79,19,95,3,1,15661200,0,15661200,'cancelled',NULL,'Khách Demo 095','user079@travela.vn','0988000095','Seed booking demo lớn'),
('BK2026X0096',2,20,96,1,0,4300000,0,4300000,'confirmed',NULL,'Khách Demo 096','minhanh@gmail.com','0988000096','Seed booking demo lớn'),
('BK2026X0097',9,20,97,2,0,8600000,0,8600000,'completed',NULL,'Khách Demo 097','user009@travela.vn','0988000097','Seed booking demo lớn'),
('BK2026X0098',16,20,98,3,0,12900000,0,12900000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 098','user016@travela.vn','0988000098','Seed booking demo lớn'),
('BK2026X0099',23,20,99,1,0,4300000,0,4300000,'waiting_confirmation',NULL,'Khách Demo 099','user023@travela.vn','0988000099','Seed booking demo lớn'),
('BK2026X0100',30,20,100,2,1,11696000,0,11696000,'cancelled',NULL,'Khách Demo 100','user030@travela.vn','0988000100','Seed booking demo lớn'),
('BK2026X0101',37,21,101,3,0,13170000,0,13170000,'confirmed',NULL,'Khách Demo 101','user037@travela.vn','0988000101','Seed booking demo lớn'),
('BK2026X0102',44,21,102,1,0,4390000,0,4390000,'completed',NULL,'Khách Demo 102','user044@travela.vn','0988000102','Seed booking demo lớn'),
('BK2026X0103',51,21,103,2,0,8780000,0,8780000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 103','user051@travela.vn','0988000103','Seed booking demo lớn'),
('BK2026X0104',58,21,104,3,0,13170000,0,13170000,'waiting_confirmation',NULL,'Khách Demo 104','user058@travela.vn','0988000104','Seed booking demo lớn'),
('BK2026X0105',65,21,105,1,1,7550800,0,7550800,'cancelled',NULL,'Khách Demo 105','user065@travela.vn','0988000105','Seed booking demo lớn'),
('BK2026X0106',72,22,106,2,0,8960000,0,8960000,'confirmed',NULL,'Khách Demo 106','user072@travela.vn','0988000106','Seed booking demo lớn'),
('BK2026X0107',79,22,107,3,0,13440000,0,13440000,'completed',NULL,'Khách Demo 107','user079@travela.vn','0988000107','Seed booking demo lớn'),
('BK2026X0108',2,22,108,1,0,4480000,0,4480000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 108','minhanh@gmail.com','0988000108','Seed booking demo lớn'),
('BK2026X0109',9,22,109,2,0,8960000,0,8960000,'waiting_confirmation',NULL,'Khách Demo 109','user009@travela.vn','0988000109','Seed booking demo lớn'),
('BK2026X0110',16,22,110,3,1,16665600,0,16665600,'cancelled',NULL,'Khách Demo 110','user016@travela.vn','0988000110','Seed booking demo lớn'),
('BK2026X0111',23,23,111,1,0,4570000,0,4570000,'confirmed',NULL,'Khách Demo 111','user023@travela.vn','0988000111','Seed booking demo lớn'),
('BK2026X0112',30,23,112,2,0,9140000,0,9140000,'completed',NULL,'Khách Demo 112','user030@travela.vn','0988000112','Seed booking demo lớn'),
('BK2026X0113',37,23,113,3,0,13710000,0,13710000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 113','user037@travela.vn','0988000113','Seed booking demo lớn'),
('BK2026X0114',44,23,114,1,0,4570000,0,4570000,'waiting_confirmation',NULL,'Khách Demo 114','user044@travela.vn','0988000114','Seed booking demo lớn'),
('BK2026X0115',51,23,115,2,1,12430400,0,12430400,'cancelled',NULL,'Khách Demo 115','user051@travela.vn','0988000115','Seed booking demo lớn'),
('BK2026X0116',58,24,116,3,0,13980000,0,13980000,'confirmed',NULL,'Khách Demo 116','user058@travela.vn','0988000116','Seed booking demo lớn'),
('BK2026X0117',65,24,117,1,0,4660000,0,4660000,'completed',NULL,'Khách Demo 117','user065@travela.vn','0988000117','Seed booking demo lớn'),
('BK2026X0118',72,24,118,2,0,9320000,0,9320000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 118','user072@travela.vn','0988000118','Seed booking demo lớn'),
('BK2026X0119',79,24,119,3,0,13980000,0,13980000,'waiting_confirmation',NULL,'Khách Demo 119','user079@travela.vn','0988000119','Seed booking demo lớn'),
('BK2026X0120',2,24,120,1,1,8015200,0,8015200,'cancelled',NULL,'Khách Demo 120','minhanh@gmail.com','0988000120','Seed booking demo lớn'),
('BK2026X0121',9,25,121,2,0,9500000,0,9500000,'confirmed',NULL,'Khách Demo 121','user009@travela.vn','0988000121','Seed booking demo lớn'),
('BK2026X0122',16,25,122,3,0,14250000,0,14250000,'completed',NULL,'Khách Demo 122','user016@travela.vn','0988000122','Seed booking demo lớn'),
('BK2026X0123',23,25,123,1,0,4750000,0,4750000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 123','user023@travela.vn','0988000123','Seed booking demo lớn'),
('BK2026X0124',30,25,124,2,0,9500000,0,9500000,'waiting_confirmation',NULL,'Khách Demo 124','user030@travela.vn','0988000124','Seed booking demo lớn'),
('BK2026X0125',37,25,125,3,1,17670000,0,17670000,'cancelled',NULL,'Khách Demo 125','user037@travela.vn','0988000125','Seed booking demo lớn'),
('BK2026X0126',44,26,126,1,0,4840000,0,4840000,'confirmed',NULL,'Khách Demo 126','user044@travela.vn','0988000126','Seed booking demo lớn'),
('BK2026X0127',51,26,127,2,0,9680000,0,9680000,'completed',NULL,'Khách Demo 127','user051@travela.vn','0988000127','Seed booking demo lớn'),
('BK2026X0128',58,26,128,3,0,14520000,0,14520000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 128','user058@travela.vn','0988000128','Seed booking demo lớn'),
('BK2026X0129',65,26,129,1,0,4840000,0,4840000,'waiting_confirmation',NULL,'Khách Demo 129','user065@travela.vn','0988000129','Seed booking demo lớn'),
('BK2026X0130',72,26,130,2,1,13164800,0,13164800,'cancelled',NULL,'Khách Demo 130','user072@travela.vn','0988000130','Seed booking demo lớn'),
('BK2026X0131',79,27,131,3,0,14790000,0,14790000,'confirmed',NULL,'Khách Demo 131','user079@travela.vn','0988000131','Seed booking demo lớn'),
('BK2026X0132',2,27,132,1,0,4930000,0,4930000,'completed',NULL,'Khách Demo 132','minhanh@gmail.com','0988000132','Seed booking demo lớn'),
('BK2026X0133',9,27,133,2,0,9860000,0,9860000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 133','user009@travela.vn','0988000133','Seed booking demo lớn'),
('BK2026X0134',16,27,134,3,0,14790000,0,14790000,'waiting_confirmation',NULL,'Khách Demo 134','user016@travela.vn','0988000134','Seed booking demo lớn'),
('BK2026X0135',23,27,135,1,1,8479600,0,8479600,'cancelled',NULL,'Khách Demo 135','user023@travela.vn','0988000135','Seed booking demo lớn'),
('BK2026X0136',30,28,136,2,0,10040000,0,10040000,'confirmed',NULL,'Khách Demo 136','user030@travela.vn','0988000136','Seed booking demo lớn'),
('BK2026X0137',37,28,137,3,0,15060000,0,15060000,'completed',NULL,'Khách Demo 137','user037@travela.vn','0988000137','Seed booking demo lớn'),
('BK2026X0138',44,28,138,1,0,5020000,0,5020000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 138','user044@travela.vn','0988000138','Seed booking demo lớn'),
('BK2026X0139',51,28,139,2,0,10040000,0,10040000,'waiting_confirmation',NULL,'Khách Demo 139','user051@travela.vn','0988000139','Seed booking demo lớn'),
('BK2026X0140',58,28,140,3,1,18674400,0,18674400,'cancelled',NULL,'Khách Demo 140','user058@travela.vn','0988000140','Seed booking demo lớn'),
('BK2026X0141',65,29,141,1,0,5110000,0,5110000,'confirmed',NULL,'Khách Demo 141','user065@travela.vn','0988000141','Seed booking demo lớn'),
('BK2026X0142',72,29,142,2,0,10220000,0,10220000,'completed',NULL,'Khách Demo 142','user072@travela.vn','0988000142','Seed booking demo lớn'),
('BK2026X0143',79,29,143,3,0,15330000,0,15330000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 143','user079@travela.vn','0988000143','Seed booking demo lớn'),
('BK2026X0144',2,29,144,1,0,5110000,0,5110000,'waiting_confirmation',NULL,'Khách Demo 144','minhanh@gmail.com','0988000144','Seed booking demo lớn'),
('BK2026X0145',9,29,145,2,1,13899200,0,13899200,'cancelled',NULL,'Khách Demo 145','user009@travela.vn','0988000145','Seed booking demo lớn'),
('BK2026X0146',16,30,146,3,0,15600000,0,15600000,'confirmed',NULL,'Khách Demo 146','user016@travela.vn','0988000146','Seed booking demo lớn'),
('BK2026X0147',23,30,147,1,0,5200000,0,5200000,'completed',NULL,'Khách Demo 147','user023@travela.vn','0988000147','Seed booking demo lớn'),
('BK2026X0148',30,30,148,2,0,10400000,0,10400000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 148','user030@travela.vn','0988000148','Seed booking demo lớn'),
('BK2026X0149',37,30,149,3,0,15600000,0,15600000,'waiting_confirmation',NULL,'Khách Demo 149','user037@travela.vn','0988000149','Seed booking demo lớn'),
('BK2026X0150',44,30,150,1,1,8944000,0,8944000,'cancelled',NULL,'Khách Demo 150','user044@travela.vn','0988000150','Seed booking demo lớn'),
('BK2026X0151',51,31,151,2,0,10580000,0,10580000,'confirmed',NULL,'Khách Demo 151','user051@travela.vn','0988000151','Seed booking demo lớn'),
('BK2026X0152',58,31,152,3,0,15870000,0,15870000,'completed',NULL,'Khách Demo 152','user058@travela.vn','0988000152','Seed booking demo lớn'),
('BK2026X0153',65,31,153,1,0,5290000,0,5290000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 153','user065@travela.vn','0988000153','Seed booking demo lớn'),
('BK2026X0154',72,31,154,2,0,10580000,0,10580000,'waiting_confirmation',NULL,'Khách Demo 154','user072@travela.vn','0988000154','Seed booking demo lớn'),
('BK2026X0155',79,31,155,3,1,19678800,0,19678800,'cancelled',NULL,'Khách Demo 155','user079@travela.vn','0988000155','Seed booking demo lớn'),
('BK2026X0156',2,32,156,1,0,5380000,0,5380000,'confirmed',NULL,'Khách Demo 156','minhanh@gmail.com','0988000156','Seed booking demo lớn'),
('BK2026X0157',9,32,157,2,0,10760000,0,10760000,'completed',NULL,'Khách Demo 157','user009@travela.vn','0988000157','Seed booking demo lớn'),
('BK2026X0158',16,32,158,3,0,16140000,0,16140000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 158','user016@travela.vn','0988000158','Seed booking demo lớn'),
('BK2026X0159',23,32,159,1,0,5380000,0,5380000,'waiting_confirmation',NULL,'Khách Demo 159','user023@travela.vn','0988000159','Seed booking demo lớn'),
('BK2026X0160',30,32,160,2,1,14633600,0,14633600,'cancelled',NULL,'Khách Demo 160','user030@travela.vn','0988000160','Seed booking demo lớn');

INSERT INTO bookings(booking_code,user_id,tour_id,departure_id,adult_count,child_count,original_amount,discount_amount,final_amount,booking_status,hold_expires_at,contact_name,contact_email,contact_phone,note) VALUES
('BK2026X0161',37,33,161,3,0,16410000,0,16410000,'confirmed',NULL,'Khách Demo 161','user037@travela.vn','0988000161','Seed booking demo lớn'),
('BK2026X0162',44,33,162,1,0,5470000,0,5470000,'completed',NULL,'Khách Demo 162','user044@travela.vn','0988000162','Seed booking demo lớn'),
('BK2026X0163',51,33,163,2,0,10940000,0,10940000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 163','user051@travela.vn','0988000163','Seed booking demo lớn'),
('BK2026X0164',58,33,164,3,0,16410000,0,16410000,'waiting_confirmation',NULL,'Khách Demo 164','user058@travela.vn','0988000164','Seed booking demo lớn'),
('BK2026X0165',65,33,165,1,1,9408400,0,9408400,'cancelled',NULL,'Khách Demo 165','user065@travela.vn','0988000165','Seed booking demo lớn'),
('BK2026X0166',72,34,166,2,0,11120000,0,11120000,'confirmed',NULL,'Khách Demo 166','user072@travela.vn','0988000166','Seed booking demo lớn'),
('BK2026X0167',79,34,167,3,0,16680000,0,16680000,'completed',NULL,'Khách Demo 167','user079@travela.vn','0988000167','Seed booking demo lớn'),
('BK2026X0168',2,34,168,1,0,5560000,0,5560000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 168','minhanh@gmail.com','0988000168','Seed booking demo lớn'),
('BK2026X0169',9,34,169,2,0,11120000,0,11120000,'waiting_confirmation',NULL,'Khách Demo 169','user009@travela.vn','0988000169','Seed booking demo lớn'),
('BK2026X0170',16,34,170,3,1,20683200,0,20683200,'cancelled',NULL,'Khách Demo 170','user016@travela.vn','0988000170','Seed booking demo lớn'),
('BK2026X0171',23,35,171,1,0,5650000,0,5650000,'confirmed',NULL,'Khách Demo 171','user023@travela.vn','0988000171','Seed booking demo lớn'),
('BK2026X0172',30,35,172,2,0,11300000,0,11300000,'completed',NULL,'Khách Demo 172','user030@travela.vn','0988000172','Seed booking demo lớn'),
('BK2026X0173',37,35,173,3,0,16950000,0,16950000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 173','user037@travela.vn','0988000173','Seed booking demo lớn'),
('BK2026X0174',44,35,174,1,0,5650000,0,5650000,'waiting_confirmation',NULL,'Khách Demo 174','user044@travela.vn','0988000174','Seed booking demo lớn'),
('BK2026X0175',51,35,175,2,1,15368000,0,15368000,'cancelled',NULL,'Khách Demo 175','user051@travela.vn','0988000175','Seed booking demo lớn'),
('BK2026X0176',58,36,176,3,0,17220000,0,17220000,'confirmed',NULL,'Khách Demo 176','user058@travela.vn','0988000176','Seed booking demo lớn'),
('BK2026X0177',65,36,177,1,0,5740000,0,5740000,'completed',NULL,'Khách Demo 177','user065@travela.vn','0988000177','Seed booking demo lớn'),
('BK2026X0178',72,36,178,2,0,11480000,0,11480000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 178','user072@travela.vn','0988000178','Seed booking demo lớn'),
('BK2026X0179',79,36,179,3,0,17220000,0,17220000,'waiting_confirmation',NULL,'Khách Demo 179','user079@travela.vn','0988000179','Seed booking demo lớn'),
('BK2026X0180',2,36,180,1,1,9872800,0,9872800,'cancelled',NULL,'Khách Demo 180','minhanh@gmail.com','0988000180','Seed booking demo lớn'),
('BK2026X0181',9,37,181,2,0,11660000,0,11660000,'confirmed',NULL,'Khách Demo 181','user009@travela.vn','0988000181','Seed booking demo lớn'),
('BK2026X0182',16,37,182,3,0,17490000,0,17490000,'completed',NULL,'Khách Demo 182','user016@travela.vn','0988000182','Seed booking demo lớn'),
('BK2026X0183',23,37,183,1,0,5830000,0,5830000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 183','user023@travela.vn','0988000183','Seed booking demo lớn'),
('BK2026X0184',30,37,184,2,0,11660000,0,11660000,'waiting_confirmation',NULL,'Khách Demo 184','user030@travela.vn','0988000184','Seed booking demo lớn'),
('BK2026X0185',37,37,185,3,1,21687600,0,21687600,'cancelled',NULL,'Khách Demo 185','user037@travela.vn','0988000185','Seed booking demo lớn'),
('BK2026X0186',44,38,186,1,0,5920000,0,5920000,'confirmed',NULL,'Khách Demo 186','user044@travela.vn','0988000186','Seed booking demo lớn'),
('BK2026X0187',51,38,187,2,0,11840000,0,11840000,'completed',NULL,'Khách Demo 187','user051@travela.vn','0988000187','Seed booking demo lớn'),
('BK2026X0188',58,38,188,3,0,17760000,0,17760000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 188','user058@travela.vn','0988000188','Seed booking demo lớn'),
('BK2026X0189',65,38,189,1,0,5920000,0,5920000,'waiting_confirmation',NULL,'Khách Demo 189','user065@travela.vn','0988000189','Seed booking demo lớn'),
('BK2026X0190',72,38,190,2,1,16102400,0,16102400,'cancelled',NULL,'Khách Demo 190','user072@travela.vn','0988000190','Seed booking demo lớn'),
('BK2026X0191',79,39,191,3,0,18030000,0,18030000,'confirmed',NULL,'Khách Demo 191','user079@travela.vn','0988000191','Seed booking demo lớn'),
('BK2026X0192',2,39,192,1,0,6010000,0,6010000,'completed',NULL,'Khách Demo 192','minhanh@gmail.com','0988000192','Seed booking demo lớn'),
('BK2026X0193',9,39,193,2,0,12020000,0,12020000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 193','user009@travela.vn','0988000193','Seed booking demo lớn'),
('BK2026X0194',16,39,194,3,0,18030000,0,18030000,'waiting_confirmation',NULL,'Khách Demo 194','user016@travela.vn','0988000194','Seed booking demo lớn'),
('BK2026X0195',23,39,195,1,1,10337200,0,10337200,'cancelled',NULL,'Khách Demo 195','user023@travela.vn','0988000195','Seed booking demo lớn'),
('BK2026X0196',30,40,196,2,0,12200000,0,12200000,'confirmed',NULL,'Khách Demo 196','user030@travela.vn','0988000196','Seed booking demo lớn'),
('BK2026X0197',37,40,197,3,0,18300000,0,18300000,'completed',NULL,'Khách Demo 197','user037@travela.vn','0988000197','Seed booking demo lớn'),
('BK2026X0198',44,40,198,1,0,6100000,0,6100000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 198','user044@travela.vn','0988000198','Seed booking demo lớn'),
('BK2026X0199',51,40,199,2,0,12200000,0,12200000,'waiting_confirmation',NULL,'Khách Demo 199','user051@travela.vn','0988000199','Seed booking demo lớn'),
('BK2026X0200',58,40,200,3,1,22692000,0,22692000,'cancelled',NULL,'Khách Demo 200','user058@travela.vn','0988000200','Seed booking demo lớn'),
('BK2026X0201',65,41,201,1,0,6190000,0,6190000,'confirmed',NULL,'Khách Demo 201','user065@travela.vn','0988000201','Seed booking demo lớn'),
('BK2026X0202',72,41,202,2,0,12380000,0,12380000,'completed',NULL,'Khách Demo 202','user072@travela.vn','0988000202','Seed booking demo lớn'),
('BK2026X0203',79,41,203,3,0,18570000,0,18570000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 203','user079@travela.vn','0988000203','Seed booking demo lớn'),
('BK2026X0204',2,41,204,1,0,6190000,0,6190000,'waiting_confirmation',NULL,'Khách Demo 204','minhanh@gmail.com','0988000204','Seed booking demo lớn'),
('BK2026X0205',9,41,205,2,1,16836800,0,16836800,'cancelled',NULL,'Khách Demo 205','user009@travela.vn','0988000205','Seed booking demo lớn'),
('BK2026X0206',16,42,206,3,0,18840000,0,18840000,'confirmed',NULL,'Khách Demo 206','user016@travela.vn','0988000206','Seed booking demo lớn'),
('BK2026X0207',23,42,207,1,0,6280000,0,6280000,'completed',NULL,'Khách Demo 207','user023@travela.vn','0988000207','Seed booking demo lớn'),
('BK2026X0208',30,42,208,2,0,12560000,0,12560000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 208','user030@travela.vn','0988000208','Seed booking demo lớn'),
('BK2026X0209',37,42,209,3,0,18840000,0,18840000,'waiting_confirmation',NULL,'Khách Demo 209','user037@travela.vn','0988000209','Seed booking demo lớn'),
('BK2026X0210',44,42,210,1,1,10801600,0,10801600,'cancelled',NULL,'Khách Demo 210','user044@travela.vn','0988000210','Seed booking demo lớn'),
('BK2026X0211',51,43,211,2,0,12740000,0,12740000,'confirmed',NULL,'Khách Demo 211','user051@travela.vn','0988000211','Seed booking demo lớn'),
('BK2026X0212',58,43,212,3,0,19110000,0,19110000,'completed',NULL,'Khách Demo 212','user058@travela.vn','0988000212','Seed booking demo lớn'),
('BK2026X0213',65,43,213,1,0,6370000,0,6370000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 213','user065@travela.vn','0988000213','Seed booking demo lớn'),
('BK2026X0214',72,43,214,2,0,12740000,0,12740000,'waiting_confirmation',NULL,'Khách Demo 214','user072@travela.vn','0988000214','Seed booking demo lớn'),
('BK2026X0215',79,43,215,3,1,23696400,0,23696400,'cancelled',NULL,'Khách Demo 215','user079@travela.vn','0988000215','Seed booking demo lớn'),
('BK2026X0216',2,44,216,1,0,6460000,0,6460000,'confirmed',NULL,'Khách Demo 216','minhanh@gmail.com','0988000216','Seed booking demo lớn'),
('BK2026X0217',9,44,217,2,0,12920000,0,12920000,'completed',NULL,'Khách Demo 217','user009@travela.vn','0988000217','Seed booking demo lớn'),
('BK2026X0218',16,44,218,3,0,19380000,0,19380000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 218','user016@travela.vn','0988000218','Seed booking demo lớn'),
('BK2026X0219',23,44,219,1,0,6460000,0,6460000,'waiting_confirmation',NULL,'Khách Demo 219','user023@travela.vn','0988000219','Seed booking demo lớn'),
('BK2026X0220',30,44,220,2,1,17571200,0,17571200,'cancelled',NULL,'Khách Demo 220','user030@travela.vn','0988000220','Seed booking demo lớn'),
('BK2026X0221',37,45,221,3,0,19650000,0,19650000,'confirmed',NULL,'Khách Demo 221','user037@travela.vn','0988000221','Seed booking demo lớn'),
('BK2026X0222',44,45,222,1,0,6550000,0,6550000,'completed',NULL,'Khách Demo 222','user044@travela.vn','0988000222','Seed booking demo lớn'),
('BK2026X0223',51,45,223,2,0,13100000,0,13100000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 223','user051@travela.vn','0988000223','Seed booking demo lớn'),
('BK2026X0224',58,45,224,3,0,19650000,0,19650000,'waiting_confirmation',NULL,'Khách Demo 224','user058@travela.vn','0988000224','Seed booking demo lớn'),
('BK2026X0225',65,45,225,1,1,11266000,0,11266000,'cancelled',NULL,'Khách Demo 225','user065@travela.vn','0988000225','Seed booking demo lớn'),
('BK2026X0226',72,46,226,2,0,13280000,0,13280000,'confirmed',NULL,'Khách Demo 226','user072@travela.vn','0988000226','Seed booking demo lớn'),
('BK2026X0227',79,46,227,3,0,19920000,0,19920000,'completed',NULL,'Khách Demo 227','user079@travela.vn','0988000227','Seed booking demo lớn'),
('BK2026X0228',2,46,228,1,0,6640000,0,6640000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 228','minhanh@gmail.com','0988000228','Seed booking demo lớn'),
('BK2026X0229',9,46,229,2,0,13280000,0,13280000,'waiting_confirmation',NULL,'Khách Demo 229','user009@travela.vn','0988000229','Seed booking demo lớn'),
('BK2026X0230',16,46,230,3,1,24700800,0,24700800,'cancelled',NULL,'Khách Demo 230','user016@travela.vn','0988000230','Seed booking demo lớn'),
('BK2026X0231',23,47,231,1,0,6730000,0,6730000,'confirmed',NULL,'Khách Demo 231','user023@travela.vn','0988000231','Seed booking demo lớn'),
('BK2026X0232',30,47,232,2,0,13460000,0,13460000,'completed',NULL,'Khách Demo 232','user030@travela.vn','0988000232','Seed booking demo lớn'),
('BK2026X0233',37,47,233,3,0,20190000,0,20190000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 233','user037@travela.vn','0988000233','Seed booking demo lớn'),
('BK2026X0234',44,47,234,1,0,6730000,0,6730000,'waiting_confirmation',NULL,'Khách Demo 234','user044@travela.vn','0988000234','Seed booking demo lớn'),
('BK2026X0235',51,47,235,2,1,18305600,0,18305600,'cancelled',NULL,'Khách Demo 235','user051@travela.vn','0988000235','Seed booking demo lớn'),
('BK2026X0236',58,48,236,3,0,20460000,0,20460000,'confirmed',NULL,'Khách Demo 236','user058@travela.vn','0988000236','Seed booking demo lớn'),
('BK2026X0237',65,48,237,1,0,6820000,0,6820000,'completed',NULL,'Khách Demo 237','user065@travela.vn','0988000237','Seed booking demo lớn'),
('BK2026X0238',72,48,238,2,0,13640000,0,13640000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 238','user072@travela.vn','0988000238','Seed booking demo lớn'),
('BK2026X0239',79,48,239,3,0,20460000,0,20460000,'waiting_confirmation',NULL,'Khách Demo 239','user079@travela.vn','0988000239','Seed booking demo lớn'),
('BK2026X0240',2,48,240,1,1,11730400,0,11730400,'cancelled',NULL,'Khách Demo 240','minhanh@gmail.com','0988000240','Seed booking demo lớn');

INSERT INTO bookings(booking_code,user_id,tour_id,departure_id,adult_count,child_count,original_amount,discount_amount,final_amount,booking_status,hold_expires_at,contact_name,contact_email,contact_phone,note) VALUES
('BK2026X0241',9,49,241,2,0,13820000,0,13820000,'confirmed',NULL,'Khách Demo 241','user009@travela.vn','0988000241','Seed booking demo lớn'),
('BK2026X0242',16,49,242,3,0,20730000,0,20730000,'completed',NULL,'Khách Demo 242','user016@travela.vn','0988000242','Seed booking demo lớn'),
('BK2026X0243',23,49,243,1,0,6910000,0,6910000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 243','user023@travela.vn','0988000243','Seed booking demo lớn'),
('BK2026X0244',30,49,244,2,0,13820000,0,13820000,'waiting_confirmation',NULL,'Khách Demo 244','user030@travela.vn','0988000244','Seed booking demo lớn'),
('BK2026X0245',37,49,245,3,1,25705200,0,25705200,'cancelled',NULL,'Khách Demo 245','user037@travela.vn','0988000245','Seed booking demo lớn'),
('BK2026X0246',44,50,246,1,0,7000000,0,7000000,'confirmed',NULL,'Khách Demo 246','user044@travela.vn','0988000246','Seed booking demo lớn'),
('BK2026X0247',51,50,247,2,0,14000000,0,14000000,'completed',NULL,'Khách Demo 247','user051@travela.vn','0988000247','Seed booking demo lớn'),
('BK2026X0248',58,50,248,3,0,21000000,0,21000000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 248','user058@travela.vn','0988000248','Seed booking demo lớn'),
('BK2026X0249',65,50,249,1,0,7000000,0,7000000,'waiting_confirmation',NULL,'Khách Demo 249','user065@travela.vn','0988000249','Seed booking demo lớn'),
('BK2026X0250',72,50,250,2,1,19040000,0,19040000,'cancelled',NULL,'Khách Demo 250','user072@travela.vn','0988000250','Seed booking demo lớn'),
('BK2026X0251',79,51,251,3,0,21270000,0,21270000,'confirmed',NULL,'Khách Demo 251','user079@travela.vn','0988000251','Seed booking demo lớn'),
('BK2026X0252',2,51,252,1,0,7090000,0,7090000,'completed',NULL,'Khách Demo 252','minhanh@gmail.com','0988000252','Seed booking demo lớn'),
('BK2026X0253',9,51,253,2,0,14180000,0,14180000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 253','user009@travela.vn','0988000253','Seed booking demo lớn'),
('BK2026X0254',16,51,254,3,0,21270000,0,21270000,'waiting_confirmation',NULL,'Khách Demo 254','user016@travela.vn','0988000254','Seed booking demo lớn'),
('BK2026X0255',23,51,255,1,1,12194800,0,12194800,'cancelled',NULL,'Khách Demo 255','user023@travela.vn','0988000255','Seed booking demo lớn'),
('BK2026X0256',30,52,256,2,0,14360000,0,14360000,'confirmed',NULL,'Khách Demo 256','user030@travela.vn','0988000256','Seed booking demo lớn'),
('BK2026X0257',37,52,257,3,0,21540000,0,21540000,'completed',NULL,'Khách Demo 257','user037@travela.vn','0988000257','Seed booking demo lớn'),
('BK2026X0258',44,52,258,1,0,7180000,0,7180000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 258','user044@travela.vn','0988000258','Seed booking demo lớn'),
('BK2026X0259',51,52,259,2,0,14360000,0,14360000,'waiting_confirmation',NULL,'Khách Demo 259','user051@travela.vn','0988000259','Seed booking demo lớn'),
('BK2026X0260',58,52,260,3,1,26709600,0,26709600,'cancelled',NULL,'Khách Demo 260','user058@travela.vn','0988000260','Seed booking demo lớn'),
('BK2026X0261',65,53,261,1,0,7270000,0,7270000,'confirmed',NULL,'Khách Demo 261','user065@travela.vn','0988000261','Seed booking demo lớn'),
('BK2026X0262',72,53,262,2,0,14540000,0,14540000,'completed',NULL,'Khách Demo 262','user072@travela.vn','0988000262','Seed booking demo lớn'),
('BK2026X0263',79,53,263,3,0,21810000,0,21810000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 263','user079@travela.vn','0988000263','Seed booking demo lớn'),
('BK2026X0264',2,53,264,1,0,7270000,0,7270000,'waiting_confirmation',NULL,'Khách Demo 264','minhanh@gmail.com','0988000264','Seed booking demo lớn'),
('BK2026X0265',9,53,265,2,1,19774400,0,19774400,'cancelled',NULL,'Khách Demo 265','user009@travela.vn','0988000265','Seed booking demo lớn'),
('BK2026X0266',16,54,266,3,0,22080000,0,22080000,'confirmed',NULL,'Khách Demo 266','user016@travela.vn','0988000266','Seed booking demo lớn'),
('BK2026X0267',23,54,267,1,0,7360000,0,7360000,'completed',NULL,'Khách Demo 267','user023@travela.vn','0988000267','Seed booking demo lớn'),
('BK2026X0268',30,54,268,2,0,14720000,0,14720000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 268','user030@travela.vn','0988000268','Seed booking demo lớn'),
('BK2026X0269',37,54,269,3,0,22080000,0,22080000,'waiting_confirmation',NULL,'Khách Demo 269','user037@travela.vn','0988000269','Seed booking demo lớn'),
('BK2026X0270',44,54,270,1,1,12659200,0,12659200,'cancelled',NULL,'Khách Demo 270','user044@travela.vn','0988000270','Seed booking demo lớn'),
('BK2026X0271',51,55,271,2,0,14900000,0,14900000,'confirmed',NULL,'Khách Demo 271','user051@travela.vn','0988000271','Seed booking demo lớn'),
('BK2026X0272',58,55,272,3,0,22350000,0,22350000,'completed',NULL,'Khách Demo 272','user058@travela.vn','0988000272','Seed booking demo lớn'),
('BK2026X0273',65,55,273,1,0,7450000,0,7450000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 273','user065@travela.vn','0988000273','Seed booking demo lớn'),
('BK2026X0274',72,55,274,2,0,14900000,0,14900000,'waiting_confirmation',NULL,'Khách Demo 274','user072@travela.vn','0988000274','Seed booking demo lớn'),
('BK2026X0275',79,55,275,3,1,27714000,0,27714000,'cancelled',NULL,'Khách Demo 275','user079@travela.vn','0988000275','Seed booking demo lớn'),
('BK2026X0276',2,56,276,1,0,7540000,0,7540000,'confirmed',NULL,'Khách Demo 276','minhanh@gmail.com','0988000276','Seed booking demo lớn'),
('BK2026X0277',9,56,277,2,0,15080000,0,15080000,'completed',NULL,'Khách Demo 277','user009@travela.vn','0988000277','Seed booking demo lớn'),
('BK2026X0278',16,56,278,3,0,22620000,0,22620000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 278','user016@travela.vn','0988000278','Seed booking demo lớn'),
('BK2026X0279',23,56,279,1,0,7540000,0,7540000,'waiting_confirmation',NULL,'Khách Demo 279','user023@travela.vn','0988000279','Seed booking demo lớn'),
('BK2026X0280',30,56,280,2,1,20508800,0,20508800,'cancelled',NULL,'Khách Demo 280','user030@travela.vn','0988000280','Seed booking demo lớn'),
('BK2026X0281',37,57,281,3,0,22890000,0,22890000,'confirmed',NULL,'Khách Demo 281','user037@travela.vn','0988000281','Seed booking demo lớn'),
('BK2026X0282',44,57,282,1,0,7630000,0,7630000,'completed',NULL,'Khách Demo 282','user044@travela.vn','0988000282','Seed booking demo lớn'),
('BK2026X0283',51,57,283,2,0,15260000,0,15260000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 283','user051@travela.vn','0988000283','Seed booking demo lớn'),
('BK2026X0284',58,57,284,3,0,22890000,0,22890000,'waiting_confirmation',NULL,'Khách Demo 284','user058@travela.vn','0988000284','Seed booking demo lớn'),
('BK2026X0285',65,57,285,1,1,13123600,0,13123600,'cancelled',NULL,'Khách Demo 285','user065@travela.vn','0988000285','Seed booking demo lớn'),
('BK2026X0286',72,58,286,2,0,15440000,0,15440000,'confirmed',NULL,'Khách Demo 286','user072@travela.vn','0988000286','Seed booking demo lớn'),
('BK2026X0287',79,58,287,3,0,23160000,0,23160000,'completed',NULL,'Khách Demo 287','user079@travela.vn','0988000287','Seed booking demo lớn'),
('BK2026X0288',2,58,288,1,0,7720000,0,7720000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 288','minhanh@gmail.com','0988000288','Seed booking demo lớn'),
('BK2026X0289',9,58,289,2,0,15440000,0,15440000,'waiting_confirmation',NULL,'Khách Demo 289','user009@travela.vn','0988000289','Seed booking demo lớn'),
('BK2026X0290',16,58,290,3,1,28718400,0,28718400,'cancelled',NULL,'Khách Demo 290','user016@travela.vn','0988000290','Seed booking demo lớn'),
('BK2026X0291',23,59,291,1,0,7810000,0,7810000,'confirmed',NULL,'Khách Demo 291','user023@travela.vn','0988000291','Seed booking demo lớn'),
('BK2026X0292',30,59,292,2,0,15620000,0,15620000,'completed',NULL,'Khách Demo 292','user030@travela.vn','0988000292','Seed booking demo lớn'),
('BK2026X0293',37,59,293,3,0,23430000,0,23430000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 293','user037@travela.vn','0988000293','Seed booking demo lớn'),
('BK2026X0294',44,59,294,1,0,7810000,0,7810000,'waiting_confirmation',NULL,'Khách Demo 294','user044@travela.vn','0988000294','Seed booking demo lớn'),
('BK2026X0295',51,59,295,2,1,21243200,0,21243200,'cancelled',NULL,'Khách Demo 295','user051@travela.vn','0988000295','Seed booking demo lớn'),
('BK2026X0296',58,60,296,3,0,23700000,0,23700000,'confirmed',NULL,'Khách Demo 296','user058@travela.vn','0988000296','Seed booking demo lớn'),
('BK2026X0297',65,60,297,1,0,7900000,0,7900000,'completed',NULL,'Khách Demo 297','user065@travela.vn','0988000297','Seed booking demo lớn'),
('BK2026X0298',72,60,298,2,0,15800000,0,15800000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 298','user072@travela.vn','0988000298','Seed booking demo lớn'),
('BK2026X0299',79,60,299,3,0,23700000,0,23700000,'waiting_confirmation',NULL,'Khách Demo 299','user079@travela.vn','0988000299','Seed booking demo lớn'),
('BK2026X0300',2,60,300,1,1,13588000,0,13588000,'cancelled',NULL,'Khách Demo 300','minhanh@gmail.com','0988000300','Seed booking demo lớn'),
('BK2026X0301',9,1,1,2,0,5180000,0,5180000,'confirmed',NULL,'Khách Demo 301','user009@travela.vn','0988000301','Seed booking demo lớn'),
('BK2026X0302',16,1,2,3,0,7770000,0,7770000,'completed',NULL,'Khách Demo 302','user016@travela.vn','0988000302','Seed booking demo lớn'),
('BK2026X0303',23,1,3,1,0,2590000,0,2590000,'pending_payment',DATE_ADD(NOW(), INTERVAL 15 MINUTE),'Khách Demo 303','user023@travela.vn','0988000303','Seed booking demo lớn');


UPDATE bookings b
JOIN (
  SELECT tour_id, departure_id, MIN(id) AS pickup_point_id
  FROM tour_pickup_points
  WHERE status='active'
  GROUP BY tour_id, departure_id
) x ON x.tour_id=b.tour_id AND x.departure_id=b.departure_id
JOIN tour_pickup_points pp ON pp.id=x.pickup_point_id
SET b.pickup_point_id=pp.id,
    b.pickup_name=pp.name,
    b.pickup_address=pp.address,
    b.pickup_time=pp.pickup_time,
    b.pickup_note=pp.note;

UPDATE bookings b
JOIN users u ON u.id=b.user_id
JOIN user_vouchers uv ON uv.user_id=u.id AND uv.status='available'
JOIN vouchers v ON v.id=uv.voucher_id AND v.member_tier=u.member_tier
SET b.voucher_id=v.id,
    b.voucher_code=v.code,
    b.discount_amount=LEAST(ROUND(b.original_amount*v.discount_value/100,0),COALESCE(v.max_discount,ROUND(b.original_amount*v.discount_value/100,0))),
    b.final_amount=b.original_amount-LEAST(ROUND(b.original_amount*v.discount_value/100,0),COALESCE(v.max_discount,ROUND(b.original_amount*v.discount_value/100,0)))
WHERE b.id % 4 = 0 AND b.original_amount >= v.min_order_amount;

UPDATE user_vouchers uv
JOIN bookings b ON b.user_id=uv.user_id AND b.voucher_id=uv.voucher_id
SET uv.status='used', uv.used_at=NOW()
WHERE b.booking_status IN ('confirmed','completed');

UPDATE vouchers v
SET used_count=(SELECT COUNT(*) FROM bookings b WHERE b.voucher_id=v.id AND b.booking_status IN ('confirmed','completed'));


INSERT INTO payments(booking_id,payment_method,payment_status,amount,internal_transaction_code,paid_at)
SELECT b.id,
       CASE b.id % 4 WHEN 0 THEN 'momo' WHEN 1 THEN 'vnpay' WHEN 2 THEN 'bank_transfer' ELSE 'card' END,
       CASE
         WHEN b.booking_status IN ('confirmed','completed') THEN 'paid'
         WHEN b.booking_status='waiting_confirmation' THEN 'waiting_confirmation'
         WHEN b.booking_status='pending_payment' THEN 'pending'
         WHEN b.booking_status='cancelled' THEN 'failed'
         ELSE 'pending'
       END,
       b.final_amount,
       CONCAT('TXN-', b.booking_code),
       CASE WHEN b.booking_status IN ('confirmed','completed') THEN NOW() ELSE NULL END
FROM bookings b;


INSERT INTO booking_guests(booking_id,full_name,date_of_birth,gender,guest_type,id_number)
SELECT b.id, CONCAT(b.contact_name, ' - Người lớn 1'), '1995-01-10', 'male', 'adult', CONCAT('AD', b.id, '01') FROM bookings b
UNION ALL
SELECT b.id, CONCAT(b.contact_name, ' - Người lớn 2'), '1993-03-12', 'female', 'adult', CONCAT('AD', b.id, '02') FROM bookings b WHERE b.adult_count>=2
UNION ALL
SELECT b.id, CONCAT(b.contact_name, ' - Người lớn 3'), '1991-06-15', 'male', 'adult', CONCAT('AD', b.id, '03') FROM bookings b WHERE b.adult_count>=3
UNION ALL
SELECT b.id, CONCAT(b.contact_name, ' - Trẻ em 1'), '2016-08-20', 'female', 'child', CONCAT('CH', b.id, '01') FROM bookings b WHERE b.child_count>=1;


UPDATE tour_departures td
LEFT JOIN (
  SELECT departure_id,
         SUM(CASE WHEN booking_status IN ('confirmed','completed','waiting_confirmation') THEN adult_count+child_count ELSE 0 END) AS booked,
         SUM(CASE WHEN booking_status='pending_payment' THEN adult_count+child_count ELSE 0 END) AS held
  FROM bookings GROUP BY departure_id
) x ON x.departure_id=td.id
SET td.booked_slots=LEAST(COALESCE(x.booked,0), td.total_slots),
    td.held_slots=LEAST(COALESCE(x.held,0), GREATEST(td.total_slots-LEAST(COALESCE(x.booked,0),td.total_slots),0));


INSERT INTO guide_assignments(guide_id,booking_id,tour_id,start_date,end_date,status,note)
SELECT ((b.id-1) % 30)+1, b.id, b.tour_id, td.departure_date, td.end_date, 'assigned', 'HDV chính của đoàn'
FROM bookings b JOIN tour_departures td ON td.id=b.departure_id
WHERE b.booking_status IN ('confirmed','completed') AND b.id <= 150;

INSERT INTO refund_requests(booking_id,user_id,reason,refund_amount,status,admin_note,reviewed_by,reviewed_at)
SELECT b.id,b.user_id,'Gia đình có việc đột xuất nên không đi được.',b.final_amount,
       CASE b.id%3 WHEN 0 THEN 'pending' WHEN 1 THEN 'approved' ELSE 'rejected' END,
       CASE b.id%3 WHEN 0 THEN NULL WHEN 1 THEN 'Đã duyệt hoàn theo chính sách.' ELSE 'Không đủ điều kiện hoàn.' END,
       CASE WHEN b.id%3=0 THEN NULL ELSE 1 END,
       CASE WHEN b.id%3=0 THEN NULL ELSE NOW() END
FROM bookings b WHERE b.booking_status='cancelled' LIMIT 40;

INSERT INTO reviews(user_id,tour_id,booking_id,rating,comment,admin_reply,admin_reply_at,status)
SELECT b.user_id,b.tour_id,b.id,
       4 + (b.id % 2),
       CASE b.id%4 WHEN 0 THEN 'Tour rất tốt, điểm đón rõ ràng và HDV nhiệt tình.' WHEN 1 THEN 'Lịch trình ổn, thanh toán tiện, gia đình rất hài lòng.' WHEN 2 THEN 'Điểm tham quan đẹp, khách sạn sạch sẽ.' ELSE 'Dịch vụ ổn, sẽ quay lại đặt tour.' END,
       CASE WHEN b.id%3=0 THEN 'Cảm ơn anh/chị đã tin tưởng Travela. Rất mong được đồng hành trong chuyến đi tiếp theo.' ELSE NULL END,
       CASE WHEN b.id%3=0 THEN NOW() ELSE NULL END,
       'approved'
FROM bookings b WHERE b.booking_status IN ('confirmed','completed') LIMIT 120;

INSERT IGNORE INTO favorite_tours(user_id,tour_id)
SELECT u.id, ((u.id*3 + seq.n) % 60)+1
FROM users u
JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2) seq
WHERE u.role='user';

INSERT INTO user_behaviors(user_id,tour_id,action,score,keyword,meta)
SELECT u.id, ((u.id*5 + seq.n) % 60)+1,
       CASE seq.n WHEN 0 THEN 'view' WHEN 1 THEN 'favorite' WHEN 2 THEN 'search' ELSE 'booking' END,
       CASE seq.n WHEN 0 THEN 1 WHEN 1 THEN 3 WHEN 2 THEN 2 ELSE 6 END,
       CASE seq.n WHEN 0 THEN 'biển' WHEN 1 THEN 'miền tây' WHEN 2 THEN 'săn mây' ELSE 'gia đình' END,
       JSON_OBJECT('source','seed')
FROM users u
JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) seq
WHERE u.role='user';

INSERT INTO faqs(question,answer,topic,display_order) VALUES
('Thanh toán QR hoạt động như thế nào?','Khi bấm đặt tour, hệ thống tạo phiên thanh toán, hiện QR trên web. Quét QR sẽ chuyển sang trang mô phỏng thanh toán thành công và gửi email xác nhận.','payment',1),
('Người dùng có cần CCCD không?','Có. Người dùng vẫn đăng ký được nếu chưa có ngày sinh, nhưng trước khi đặt tour cần có số điện thoại và CCCD.','booking',2),
('Nếu hướng dẫn viên bận đột xuất thì sao?','Admin có thể đổi hướng dẫn viên khác còn rảnh trong ngày tour và thông báo lại cho khách hàng.','guide',3),
('Voucher được áp dụng khi nào?','Voucher được kiểm tra khi tạo booking và chỉ đánh dấu đã dùng khi booking đã thanh toán hoặc xác nhận thành công.','voucher',4),
('Điểm đón được chọn như thế nào?','Khách chọn điểm đón trong form đặt tour. Nếu không phù hợp, khách chọn liên hệ tư vấn để nhân viên xác nhận lại.','pickup',5);

INSERT INTO contacts(user_id,full_name,email,phone,subject,message,status,handled_by,admin_reply,replied_at,reply_email_sent_at)
SELECT u.id,u.full_name,u.email,u.phone,
       CASE u.id%3 WHEN 0 THEN 'Tư vấn tour gia đình' WHEN 1 THEN 'Hỏi về điểm đón' ELSE 'Hỏi về voucher' END,
       'Tôi cần tư vấn thêm trước khi đặt tour.',
       CASE u.id%4 WHEN 0 THEN 'new' WHEN 1 THEN 'processing' ELSE 'replied' END,
       CASE WHEN u.id%4 IN (2,3) THEN 1 ELSE NULL END,
       CASE WHEN u.id%4 IN (2,3) THEN 'Travela đã tiếp nhận và sẽ hỗ trợ anh/chị trong thời gian sớm nhất.' ELSE NULL END,
       CASE WHEN u.id%4 IN (2,3) THEN NOW() ELSE NULL END,
       CASE WHEN u.id%4 IN (2,3) THEN NOW() ELSE NULL END
FROM users u WHERE u.role='user' LIMIT 45;

INSERT INTO contact_email_logs(contact_id,admin_user_id,recipient_email,subject,body_preview,send_status,sent_at)
SELECT c.id,1,c.email,CONCAT('Phản hồi: ',c.subject),LEFT(c.admin_reply,200),'sent',NOW()
FROM contacts c WHERE c.admin_reply IS NOT NULL;

INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by) VALUES
('Chào mừng đến Travela','Hệ thống tour AI đã sẵn sàng.','Bạn có thể tìm tour bằng văn bản, giọng nói, hình ảnh và nhận gợi ý cá nhân hóa.','all',NULL,1,1),
('Ưu đãi tháng này','Voucher mới đã được thêm vào tài khoản.','Hãy kiểm tra ví voucher để áp dụng khi đặt tour.','user',NULL,1,1),
('Thông báo admin','Có booking và liên hệ mới cần xử lý.','Vui lòng kiểm tra dashboard quản trị.','admin',NULL,1,1);

INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by)
SELECT 'Nhắc lịch khởi hành tour',
       CONCAT('Tour ', t.name, ' của bạn sắp khởi hành.'),
       CONCAT('Tour ', t.name, ' sẽ khởi hành ngày ', DATE_FORMAT(td.departure_date,'%d/%m/%Y'),
              '. Điểm đón: ', COALESCE(b.pickup_name,'Travela sẽ liên hệ xác nhận'),
              '. Địa chỉ: ', COALESCE(b.pickup_address,'Đang cập nhật'),
              '. Thời gian đón: ', COALESCE(TIME_FORMAT(b.pickup_time,'%H:%i'),'Travela sẽ liên hệ'),
              '. Vui lòng có mặt trước giờ đón 15 phút.'),
       'user', b.user_id, 1, 1
FROM bookings b JOIN tours t ON t.id=b.tour_id JOIN tour_departures td ON td.id=b.departure_id
WHERE b.user_id IS NOT NULL AND b.booking_status IN ('confirmed','waiting_confirmation','completed')
LIMIT 120;

INSERT INTO notification_reads(notification_id,user_id)
SELECT n.id, u.id FROM notifications n JOIN users u ON u.role='user'
WHERE n.target_role IN ('all','user') AND (n.target_user_id IS NULL OR n.target_user_id=u.id) AND (n.id+u.id)%7=0
LIMIT 200;

INSERT INTO chat_conversations(user_id,title,summary,last_intent,memory_json)
SELECT u.id, CONCAT('Tư vấn tour cho ', u.full_name), 'Khách hỏi về tour, voucher và điểm đón.', 'tour_search', JSON_OBJECT('preferred','family')
FROM users u WHERE u.role='user' LIMIT 30;

INSERT INTO chat_messages(conversation_id,role,content,intent,meta)
SELECT c.id,'user','Tôi muốn tìm tour phù hợp cho gia đình.', 'tour_search', JSON_OBJECT('seed',true) FROM chat_conversations c
UNION ALL
SELECT c.id,'assistant','Travela gợi ý các tour gia đình, có thể áp dụng voucher và chọn điểm đón khi đặt tour.', 'tour_recommendation', JSON_OBJECT('seed',true) FROM chat_conversations c;

INSERT INTO booking_status_logs(booking_id,payment_id,action_type,old_status,new_status,changed_by_user_id,source,reason,note)
SELECT b.id,p.id,'seed_status',NULL,b.booking_status,1,'system','Seed dữ liệu demo','Tạo log trạng thái booking mẫu'
FROM bookings b LEFT JOIN payments p ON p.booking_id=b.id;

UPDATE reviews
SET admin_reply='Cảm ơn anh/chị đã tin tưởng Travela. Rất mong được đồng hành trong các chuyến đi tiếp theo.', admin_reply_at=NOW()
WHERE id IN (1,2,3,4,5);


-- =========================================================
-- EXTRA HUGE SEED ADD-ON
-- Mục tiêu: dữ liệu nhiều hơn seed ban đầu, nhưng vẫn giữ cấu trúc mới:
-- voucher trong booking, điểm đón, notification theo từng user.
-- =========================================================

-- Thêm user demo từ 086 đến 250
INSERT INTO users(full_name,email,phone,identity_number,password_hash,role,member_points,member_tier,status,auth_provider)
SELECT 
  CONCAT('Khách Travela ', LPAD(seq.n,3,'0')) AS full_name,
  CONCAT('user', LPAD(seq.n,3,'0'), '@travela.vn') AS email,
  CONCAT('0903', LPAD(seq.n,6,'0')) AS phone,
  CONCAT('792026', LPAD(seq.n,6,'0')) AS identity_number,
  '$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC' AS password_hash,
  'user' AS role,
  (seq.n * 137) % 9000 AS member_points,
  CASE seq.n % 4 WHEN 0 THEN 'bronze' WHEN 1 THEN 'silver' WHEN 2 THEN 'gold' ELSE 'diamond' END AS member_tier,
  'active',
  'local'
FROM (
  SELECT ones.i + tens.i*10 + hundreds.i*100 AS n
  FROM (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
  CROSS JOIN (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2) hundreds
) seq
WHERE seq.n BETWEEN 86 AND 250;

-- Thêm tour từ 061 đến 140
INSERT INTO tours(code,name,slug,destination_id,tour_theme,duration_days,duration_nights,hotel_stars,base_price_adult,base_price_child,max_capacity_default,short_description,full_description,is_trending,is_best_deal,status)
SELECT
  CONCAT('TV', LPAD(seq.n,3,'0'), 'N', 2 + (seq.n % 4)) AS code,
  CONCAT(
    CASE seq.n % 6
      WHEN 0 THEN 'Tour Biển Đảo '
      WHEN 1 THEN 'Tour Gia Đình '
      WHEN 2 THEN 'Tour Văn Hóa '
      WHEN 3 THEN 'Tour Nghỉ Dưỡng '
      WHEN 4 THEN 'Tour Khám Phá '
      ELSE 'Tour Premium '
    END,
    d.name, ' ', 2 + (seq.n % 4), 'N', 1 + (seq.n % 3), 'Đ'
  ) AS name,
  CONCAT('tour-extra-', LPAD(seq.n,3,'0'), '-', LOWER(REPLACE(REPLACE(d.name,' ','-'),'Đ','D'))) AS slug,
  d.id AS destination_id,
  CASE seq.n % 8
    WHEN 0 THEN 'beach'
    WHEN 1 THEN 'mountain'
    WHEN 2 THEN 'city'
    WHEN 3 THEN 'culture'
    WHEN 4 THEN 'adventure'
    WHEN 5 THEN 'eco'
    WHEN 6 THEN 'family'
    ELSE 'luxury'
  END AS tour_theme,
  2 + (seq.n % 4) AS duration_days,
  1 + (seq.n % 4) AS duration_nights,
  CASE seq.n % 3 WHEN 0 THEN 3 WHEN 1 THEN 4 ELSE 5 END AS hotel_stars,
  2500000 + (seq.n * 85000) AS base_price_adult,
  1800000 + (seq.n * 65000) AS base_price_child,
  24 + (seq.n % 25) AS max_capacity_default,
  CONCAT('Lịch trình demo nhiều dữ liệu cho ', d.name, ', có voucher, điểm đón và lịch khởi hành.'),
  CONCAT('Tour seed lớn cho hệ thống Travela: ', d.name, '. Dữ liệu dùng để test tìm kiếm, booking, dashboard, voucher, điểm đón, notification và mail xác nhận.'),
  seq.n % 5 = 0,
  seq.n % 7 = 0,
  'published'
FROM (
  SELECT ones.i + tens.i*10 + hundreds.i*100 AS n
  FROM (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
  CROSS JOIN (SELECT 0 i UNION ALL SELECT 1) hundreds
) seq
JOIN destinations d ON d.id = 1 + (seq.n % 20)
WHERE seq.n BETWEEN 61 AND 140;

-- Media cho tour mới
INSERT INTO tour_media(tour_id,media_type,file_url,is_cover,display_order)
SELECT t.id,'image',CONCAT('https://picsum.photos/seed/extra-cover-',t.id,'/900/600'),1,1
FROM tours t WHERE t.code LIKE 'TV0%' OR t.code LIKE 'TV1%';

INSERT INTO tour_media(tour_id,media_type,file_url,is_cover,display_order)
SELECT t.id,'image',CONCAT('https://picsum.photos/seed/extra-gallery-',t.id,'-',seq.n,'/900/600'),0,seq.n
FROM tours t
JOIN (SELECT 2 n UNION ALL SELECT 3 UNION ALL SELECT 4) seq
WHERE t.id > 60;

-- Lịch trình chi tiết theo số ngày
INSERT IGNORE INTO tour_itinerary(tour_id,day_number,item_order,title,description,location_name)
SELECT t.id, d.day_number, 1,
       CONCAT('Ngày ', d.day_number, ': ', CASE d.day_number WHEN 1 THEN 'Khởi hành và nhận phòng' WHEN 2 THEN 'Tham quan điểm nổi bật' WHEN 3 THEN 'Trải nghiệm địa phương' WHEN 4 THEN 'Tự do mua sắm' ELSE 'Kết thúc hành trình' END),
       CONCAT('Ăn sáng, tham quan, chụp ảnh, trải nghiệm dịch vụ và nghỉ đêm theo chương trình ngày ', d.day_number, '.'),
       dest.name
FROM tours t
JOIN destinations dest ON dest.id=t.destination_id
JOIN (SELECT 1 day_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) d ON d.day_number <= t.duration_days
WHERE t.id > 60;

-- Lịch khởi hành cho tour mới: 8 lịch/tour
INSERT INTO tour_departures(tour_id,departure_date,end_date,adult_price,child_price,total_slots,booked_slots,held_slots,status)
SELECT t.id,
       DATE_ADD('2026-10-01', INTERVAL (seq.n*10 + (t.id % 9)) DAY),
       DATE_ADD(DATE_ADD('2026-10-01', INTERVAL (seq.n*10 + (t.id % 9)) DAY), INTERVAL t.duration_days - 1 DAY),
       t.base_price_adult + (seq.n * 50000),
       t.base_price_child + (seq.n * 35000),
       t.max_capacity_default,
       0,
       0,
       'open'
FROM tours t
JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) seq
WHERE t.id > 60;

INSERT INTO tour_policies(tour_id,policy_type,content,display_order)
SELECT t.id,'cancel_policy','Có thể gửi yêu cầu hoàn tiền trước ngày khởi hành, admin duyệt theo chính sách dịch vụ.',1 FROM tours t WHERE t.id > 60
UNION ALL
SELECT t.id,'included','Bao gồm xe du lịch, hướng dẫn viên, vé tham quan cơ bản, bảo hiểm du lịch và hỗ trợ điểm đón.',2 FROM tours t WHERE t.id > 60
UNION ALL
SELECT t.id,'note','Lịch trình có thể thay đổi nhẹ tùy thời tiết nhưng vẫn đảm bảo đủ điểm tham quan chính.',3 FROM tours t WHERE t.id > 60;

INSERT INTO tour_accommodations(tour_id,name,accommodation_type,star_rating,address,description,price_per_night,image_url,amenities,status)
SELECT t.id, CONCAT('Travela Hotel Partner ', t.id), 'hotel', COALESCE(t.hotel_stars,3), 'Khu trung tâm điểm đến',
       'Khách sạn đối tác sạch đẹp, phù hợp đoàn khách Việt.',
       600000 + (t.id % 8) * 150000,
       CONCAT('https://picsum.photos/seed/hotel-',t.id,'/800/500'),
       'Wifi, Ăn sáng, Máy lạnh, Lễ tân 24/7',
       'active'
FROM tours t WHERE t.id > 60;

INSERT INTO tour_transports(tour_id,name,transport_type,provider,origin,destination_label,duration_hours,price,description,image_url,status)
SELECT t.id, CONCAT('Phương tiện tour ', t.code),
       CASE t.tour_theme WHEN 'beach' THEN 'plane' WHEN 'city' THEN 'bus' ELSE 'bus' END,
       'Travela Transport',
       'TP.HCM',
       d.name,
       2 + (t.id % 8),
       300000 + (t.id % 10) * 70000,
       'Phương tiện được sắp xếp theo lịch trình tour.',
       CONCAT('https://picsum.photos/seed/transport-',t.id,'/800/500'),
       'active'
FROM tours t JOIN destinations d ON d.id=t.destination_id
WHERE t.id > 60;

-- Điểm đón cho mọi lịch khởi hành chưa có điểm đón
INSERT INTO tour_pickup_points(tour_id,departure_id,province,name,address,pickup_time,note,status)
SELECT td.tour_id, td.id, dest.province,
       CONCAT('Điểm đón trung tâm ', dest.province),
       CONCAT('Trung tâm ', dest.province),
       '06:00:00',
       'Vui lòng có mặt trước giờ đón 15 phút.',
       'active'
FROM tour_departures td
JOIN tours t ON t.id=td.tour_id
JOIN destinations dest ON dest.id=t.destination_id
WHERE NOT EXISTS (SELECT 1 FROM tour_pickup_points pp WHERE pp.departure_id=td.id);

INSERT INTO tour_pickup_points(tour_id,departure_id,province,name,address,pickup_time,note,status)
SELECT td.tour_id, td.id, 'TP.HCM', 'Nhà văn hóa Thanh Niên', '04 Phạm Ngọc Thạch, Quận 1, TP.HCM',
       '04:30:00', 'Điểm đón dành cho khách xuất phát từ TP.HCM.', 'active'
FROM tour_departures td
JOIN tours t ON t.id=td.tour_id
WHERE t.id > 60;

INSERT INTO tour_pickup_points(tour_id,departure_id,province,name,address,pickup_time,note,status)
SELECT td.tour_id, td.id, 'Khác', 'Liên hệ tư vấn điểm đón phù hợp',
       'Travela sẽ liên hệ xác nhận điểm đón sau khi đặt tour',
       NULL, 'Dành cho khách không ở gần các điểm đón có sẵn.', 'active'
FROM tour_departures td
JOIN tours t ON t.id=td.tour_id
WHERE t.id > 60;

-- Gán thêm voucher cho các user mới
INSERT IGNORE INTO user_vouchers(user_id,voucher_id)
SELECT u.id, v.id
FROM users u
JOIN vouchers v ON v.member_tier=u.member_tier
WHERE u.role='user' AND u.status='active';

-- Thêm booking lớn từ lịch khởi hành mới
INSERT INTO bookings(
  booking_code,user_id,tour_id,departure_id,
  voucher_id,voucher_code,
  pickup_point_id,pickup_name,pickup_address,pickup_time,pickup_note,
  adult_count,child_count,original_amount,discount_amount,final_amount,
  booking_status,hold_expires_at,contact_name,contact_email,contact_phone,note
)
SELECT
  CONCAT('BK2026H', LPAD(x.rn,4,'0')),
  u.id,
  td.tour_id,
  td.id,
  v.id,
  v.code,
  pp.id,
  pp.name,
  pp.address,
  pp.pickup_time,
  pp.note,
  1 + (x.rn % 3),
  x.rn % 2,
  ((1 + (x.rn % 3)) * td.adult_price) + ((x.rn % 2) * td.child_price),
  CASE WHEN x.rn % 4 = 0 THEN LEAST(ROUND((((1 + (x.rn % 3)) * td.adult_price) + ((x.rn % 2) * td.child_price)) * v.discount_value / 100,0), COALESCE(v.max_discount,999999999)) ELSE 0 END,
  (((1 + (x.rn % 3)) * td.adult_price) + ((x.rn % 2) * td.child_price))
    - CASE WHEN x.rn % 4 = 0 THEN LEAST(ROUND((((1 + (x.rn % 3)) * td.adult_price) + ((x.rn % 2) * td.child_price)) * v.discount_value / 100,0), COALESCE(v.max_discount,999999999)) ELSE 0 END,
  CASE x.rn % 7
    WHEN 0 THEN 'pending_payment'
    WHEN 1 THEN 'waiting_confirmation'
    WHEN 2 THEN 'confirmed'
    WHEN 3 THEN 'completed'
    WHEN 4 THEN 'cancelled'
    WHEN 5 THEN 'confirmed'
    ELSE 'completed'
  END,
  CASE WHEN x.rn % 7 = 0 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE) ELSE NULL END,
  u.full_name,
  u.email,
  u.phone,
  'Seed booking cực lớn có voucher và điểm đón'
FROM (
  SELECT td.id AS departure_id, ROW_NUMBER() OVER (ORDER BY td.id) AS rn
  FROM tour_departures td
  JOIN tours t ON t.id=td.tour_id
  WHERE t.id > 60
) x
JOIN tour_departures td ON td.id=x.departure_id
JOIN users u ON u.id = 2 + (x.rn % 249)
LEFT JOIN (
  SELECT user_id, MIN(voucher_id) AS voucher_id
  FROM user_vouchers
  GROUP BY user_id
) uv ON uv.user_id=u.id
LEFT JOIN vouchers v ON v.id=uv.voucher_id
JOIN tour_pickup_points pp ON pp.departure_id=td.id
WHERE pp.id = (SELECT MIN(pp2.id) FROM tour_pickup_points pp2 WHERE pp2.departure_id=td.id)
  AND x.rn <= 640;

-- Payment cho booking lớn
INSERT INTO payments(booking_id,payment_method,payment_status,amount,internal_transaction_code,paid_at)
SELECT b.id,
       CASE b.id % 5 WHEN 0 THEN 'momo' WHEN 1 THEN 'vnpay' WHEN 2 THEN 'card' WHEN 3 THEN 'bank_transfer' ELSE 'cash' END,
       CASE b.booking_status
         WHEN 'confirmed' THEN 'paid'
         WHEN 'completed' THEN 'paid'
         WHEN 'waiting_confirmation' THEN 'waiting_confirmation'
         WHEN 'pending_payment' THEN 'pending'
         WHEN 'cancelled' THEN 'failed'
         ELSE 'pending'
       END,
       b.final_amount,
       CONCAT('TXN-', b.booking_code),
       CASE WHEN b.booking_status IN ('confirmed','completed') THEN NOW() ELSE NULL END
FROM bookings b
WHERE b.booking_code LIKE 'BK2026H%';

-- Khách đi kèm cho booking lớn
INSERT INTO booking_guests(booking_id,full_name,date_of_birth,gender,guest_type,id_number)
SELECT b.id, CONCAT(b.contact_name, ' - Khách ', seq.n),
       DATE_SUB(CURDATE(), INTERVAL (20 + ((b.id+seq.n)%35)) YEAR),
       CASE (b.id+seq.n)%2 WHEN 0 THEN 'male' ELSE 'female' END,
       CASE WHEN seq.n <= b.adult_count THEN 'adult' ELSE 'child' END,
       CONCAT('GUEST', b.id, LPAD(seq.n,2,'0'))
FROM bookings b
JOIN (SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) seq
WHERE b.booking_code LIKE 'BK2026H%'
  AND seq.n <= b.adult_count + b.child_count;

-- Cập nhật số slot theo booking
UPDATE tour_departures td
LEFT JOIN (
  SELECT departure_id,
         SUM(CASE WHEN booking_status IN ('confirmed','completed','waiting_confirmation') THEN adult_count + child_count ELSE 0 END) AS booked,
         SUM(CASE WHEN booking_status='pending_payment' THEN adult_count + child_count ELSE 0 END) AS held
  FROM bookings
  GROUP BY departure_id
) x ON x.departure_id=td.id
SET td.booked_slots=LEAST(COALESCE(x.booked,0), td.total_slots),
    td.held_slots=LEAST(COALESCE(x.held,0), GREATEST(td.total_slots-LEAST(COALESCE(x.booked,0),td.total_slots),0));

-- Đánh giá nhiều dữ liệu
INSERT INTO reviews(user_id,tour_id,booking_id,rating,comment,admin_reply,admin_reply_at,status)
SELECT b.user_id,b.tour_id,b.id,
       4 + (b.id % 2),
       CASE b.id % 5
         WHEN 0 THEN 'Tour rất ổn, lịch trình hợp lý và điểm đón rõ ràng.'
         WHEN 1 THEN 'HDV nhiệt tình, khách sạn sạch, thanh toán thuận tiện.'
         WHEN 2 THEN 'Gia đình tôi rất hài lòng, sẽ đặt lại lần sau.'
         WHEN 3 THEN 'Voucher áp dụng tốt, email xác nhận đầy đủ thông tin.'
         ELSE 'Điểm đón dễ tìm, thông báo trước ngày đi rất hữu ích.'
       END,
       CASE WHEN b.id % 3 = 0 THEN 'Cảm ơn anh/chị đã đánh giá. Travela rất mong được phục vụ trong chuyến đi tiếp theo.' ELSE NULL END,
       CASE WHEN b.id % 3 = 0 THEN NOW() ELSE NULL END,
       CASE WHEN b.id % 9 = 0 THEN 'pending' ELSE 'approved' END
FROM bookings b
WHERE b.booking_code LIKE 'BK2026H%' AND b.booking_status IN ('confirmed','completed')
LIMIT 420;

-- Favorite và hành vi người dùng nhiều hơn
INSERT IGNORE INTO favorite_tours(user_id,tour_id)
SELECT u.id, t.id
FROM users u
JOIN tours t ON (u.id + t.id) % 37 = 0
WHERE u.role='user'
LIMIT 800;

INSERT INTO user_behaviors(user_id,tour_id,action,score,keyword,meta)
SELECT u.id, t.id,
       CASE (u.id+t.id)%5 WHEN 0 THEN 'view' WHEN 1 THEN 'search' WHEN 2 THEN 'favorite' WHEN 3 THEN 'booking' ELSE 'compare' END,
       CASE (u.id+t.id)%5 WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 6 ELSE 2 END,
       CASE t.tour_theme WHEN 'beach' THEN 'biển' WHEN 'mountain' THEN 'săn mây' WHEN 'culture' THEN 'văn hóa' WHEN 'family' THEN 'gia đình' ELSE 'du lịch' END,
       JSON_OBJECT('source','extra_huge_seed')
FROM users u JOIN tours t ON (u.id*t.id)%43=0
WHERE u.role='user'
LIMIT 1200;

-- Liên hệ và log email nhiều hơn
INSERT INTO contacts(user_id,full_name,email,phone,subject,message,status,handled_by,admin_reply,replied_at,reply_email_sent_at)
SELECT u.id,u.full_name,u.email,u.phone,
       CASE u.id%4 WHEN 0 THEN 'Hỏi voucher' WHEN 1 THEN 'Hỏi điểm đón' WHEN 2 THEN 'Hỏi lịch khởi hành' ELSE 'Tư vấn tour gia đình' END,
       'Tôi cần tư vấn thêm trước khi đặt tour.',
       CASE u.id%5 WHEN 0 THEN 'new' WHEN 1 THEN 'processing' ELSE 'replied' END,
       CASE WHEN u.id%5 IN (2,3,4) THEN 1 ELSE NULL END,
       CASE WHEN u.id%5 IN (2,3,4) THEN 'Travela đã tiếp nhận và phản hồi thông tin cho anh/chị.' ELSE NULL END,
       CASE WHEN u.id%5 IN (2,3,4) THEN NOW() ELSE NULL END,
       CASE WHEN u.id%5 IN (2,3,4) THEN NOW() ELSE NULL END
FROM users u WHERE u.role='user' AND u.id > 85;

INSERT INTO contact_email_logs(contact_id,admin_user_id,recipient_email,subject,body_preview,send_status,sent_at)
SELECT c.id,1,c.email,CONCAT('Phản hồi: ',c.subject),LEFT(c.admin_reply,200),'sent',NOW()
FROM contacts c WHERE c.admin_reply IS NOT NULL
ON DUPLICATE KEY UPDATE sent_at=VALUES(sent_at);

-- Notification riêng cho khách có booking
INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by)
SELECT 'Nhắc lịch khởi hành tour',
       CONCAT('Tour ', t.name, ' của bạn sắp khởi hành.'),
       CONCAT('Tour ', t.name, ' sẽ khởi hành ngày ', DATE_FORMAT(td.departure_date,'%d/%m/%Y'),
              '. Điểm đón: ', COALESCE(b.pickup_name,'Travela sẽ liên hệ xác nhận'),
              '. Địa chỉ: ', COALESCE(b.pickup_address,'Đang cập nhật'),
              '. Thời gian đón: ', COALESCE(TIME_FORMAT(b.pickup_time,'%H:%i'),'Travela sẽ liên hệ'),
              '. Vui lòng có mặt trước giờ đón 15 phút.'),
       'user', b.user_id, 1, 1
FROM bookings b
JOIN tours t ON t.id=b.tour_id
JOIN tour_departures td ON td.id=b.departure_id
WHERE b.booking_code LIKE 'BK2026H%' AND b.booking_status IN ('confirmed','waiting_confirmation','completed')
LIMIT 500;

-- Chat demo nhiều hơn
INSERT INTO chat_conversations(user_id,title,summary,last_intent,memory_json)
SELECT u.id, CONCAT('Tư vấn du lịch cho ', u.full_name), 'Khách hỏi về tour, voucher, điểm đón và chính sách hoàn tiền.', 'tour_search', JSON_OBJECT('seed','extra_huge')
FROM users u WHERE u.role='user' AND u.id > 85 LIMIT 120;

INSERT INTO chat_messages(conversation_id,role,content,intent,meta)
SELECT c.id,'user','Tôi muốn tìm tour phù hợp, có voucher và điểm đón gần nơi ở.', 'tour_search', JSON_OBJECT('seed',true) FROM chat_conversations c WHERE c.id > 30
UNION ALL
SELECT c.id,'assistant','Travela có thể gợi ý tour phù hợp, kiểm tra voucher và hiển thị điểm đón khi anh/chị đặt tour.', 'tour_recommendation', JSON_OBJECT('seed',true) FROM chat_conversations c WHERE c.id > 30;

-- Log trạng thái cho booking mới
INSERT INTO booking_status_logs(booking_id,payment_id,action_type,old_status,new_status,changed_by_user_id,source,reason,note)
SELECT b.id,p.id,'seed_status',NULL,b.booking_status,1,'system','Seed dữ liệu cực lớn','Tạo log trạng thái booking mẫu có voucher/điểm đón'
FROM bookings b
LEFT JOIN payments p ON p.booking_id=b.id
WHERE b.booking_code LIKE 'BK2026H%';

-- Chốt mật khẩu toàn bộ tài khoản local về cùng một hash đã test dùng cho 123456
UPDATE users
SET password_hash='$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC',
    auth_provider='local',
    status='active'
WHERE email IS NOT NULL;
SET SQL_SAFE_UPDATES = 1;

-- Final check
SELECT 'users' AS table_name, COUNT(*) AS total FROM users
UNION ALL SELECT 'destinations', COUNT(*) FROM destinations
UNION ALL SELECT 'tours', COUNT(*) FROM tours
UNION ALL SELECT 'tour_departures', COUNT(*) FROM tour_departures
UNION ALL SELECT 'tour_pickup_points', COUNT(*) FROM tour_pickup_points
UNION ALL SELECT 'vouchers', COUNT(*) FROM vouchers
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'booking_guests', COUNT(*) FROM booking_guests
UNION ALL SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'contacts', COUNT(*) FROM contacts;

INSERT IGNORE INTO user_vouchers(user_id, voucher_id, status, created_at)
SELECT 
  u.id,
  v.id,
  'available',
  NOW()
FROM users u
JOIN vouchers v 
  ON v.member_tier = u.member_tier
WHERE u.role = 'user'
  AND v.status = 'active'
  AND CURDATE() BETWEEN v.start_date AND v.end_date;


SELECT user_id, action, tour_id, score, keyword, created_at
FROM user_behaviors
ORDER BY created_at DESC
LIMIT 300;


DELETE FROM user_behaviors
WHERE user_id IN (2, 341);
SELECT user_id, action, tour_id, score, keyword, created_at
FROM user_behaviors
WHERE user_id IN (2, 341)
ORDER BY created_at DESC;

SELECT 
  t.id,
  t.name,
  t.destination_id,
  d.name AS destination_name,
  t.tour_theme,
  t.status,
  t.is_trending,
  t.is_best_deal
FROM tours t
LEFT JOIN destinations d ON d.id = t.destination_id
WHERE t.id IN (101, 8);


CREATE TABLE IF NOT EXISTS rag_documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_type VARCHAR(50) NOT NULL,
  source_id BIGINT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  metadata JSON NULL,
  embedding JSON NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rag_source(source_type, source_id),
  INDEX idx_rag_status(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


INSERT INTO faqs (question, answer, topic, status, created_at, updated_at)
VALUES
(
  'Chính sách hoàn tiền của Travela như thế nào?',
  'Travela hỗ trợ gửi yêu cầu hoàn tiền trong vòng 48 giờ sau khi đặt tour và chỉ áp dụng khi còn ít nhất 3 ngày trước ngày khởi hành. Booking phải ở trạng thái đã thanh toán hoặc đã xác nhận. Các booking đã hủy, đã hoàn thành, đã hoàn tiền, chưa thanh toán hoặc đã có yêu cầu hoàn tiền đang xử lý sẽ không đủ điều kiện gửi yêu cầu mới. Yêu cầu hoàn tiền cần được admin kiểm tra và duyệt trước khi cập nhật trạng thái.',
  'refund_policy',
  'active',
  NOW(),
  NOW()
),
(
  'Tôi có thể hủy tour và hoàn tiền không?',
  'Bạn có thể gửi yêu cầu hoàn tiền nếu booking được tạo chưa quá 48 giờ, đã thanh toán hoặc đã xác nhận, và ngày khởi hành còn cách hiện tại ít nhất 3 ngày. Nếu đơn không thỏa các điều kiện này, hệ thống sẽ không hỗ trợ gửi yêu cầu hoàn tiền tự động.',
  'refund_policy',
  'active',
  NOW(),
  NOW()
),
(
  'Hủy tour sát ngày khởi hành có được hoàn tiền không?',
  'Travela không hỗ trợ hoàn tiền nếu thời điểm hủy còn dưới 3 ngày trước ngày khởi hành. Quy định này giúp hệ thống đảm bảo chi phí giữ chỗ, hướng dẫn viên, khách sạn và phương tiện đã được chuẩn bị trước.',
  'refund_policy',
  'active',
  NOW(),
  NOW()
);
SET SQL_SAFE_UPDATES = 1;
UPDATE tour_policies
SET content = 'Khách có thể gửi yêu cầu hoàn tiền trong vòng 48 giờ sau khi đặt tour. Chỉ hỗ trợ hoàn tiền khi còn ít nhất 3 ngày trước ngày khởi hành. Booking cần ở trạng thái đã thanh toán hoặc đã xác nhận. Yêu cầu hoàn tiền cần admin kiểm tra và duyệt trước khi cập nhật trạng thái.'
WHERE LOWER(policy_type) LIKE '%cancel%'
   OR LOWER(policy_type) LIKE '%refund%'
   OR content LIKE '%hoàn tiền%'
   OR content LIKE '%hủy%';
   
   

SET @user_id := 343;

SET @departure_id := (
  SELECT td.id
  FROM tour_departures td
  WHERE td.status = 'open'
    AND td.booked_slots + td.held_slots < td.total_slots
  ORDER BY td.id DESC
  LIMIT 1
);

SET @tour_id := (
  SELECT tour_id
  FROM tour_departures
  WHERE id = @departure_id
);

SET @pickup_id := (
  SELECT id
  FROM tour_pickup_points
  WHERE departure_id = @departure_id
    AND status = 'active'
  ORDER BY id ASC
  LIMIT 1
);

SET @booking_code := CONCAT('BKTEST', UNIX_TIMESTAMP());
SET @payment_code := CONCAT('DH', UNIX_TIMESTAMP());

INSERT INTO bookings (
  booking_code,
  user_id,
  tour_id,
  departure_id,
  pickup_point_id,
  pickup_name,
  pickup_address,
  pickup_time,
  pickup_note,
  adult_count,
  child_count,
  original_amount,
  discount_amount,
  final_amount,
  booking_status,
  hold_expires_at,
  contact_name,
  contact_email,
  contact_phone,
  note
)
SELECT
  @booking_code,
  @user_id,
  @tour_id,
  @departure_id,
  pp.id,
  pp.name,
  pp.address,
  pp.pickup_time,
  pp.note,
  1,
  0,
  1000,
  0,
  1000,
  'pending_payment',
  DATE_ADD(NOW(), INTERVAL 15 MINUTE),
  u.full_name,
  u.email,
  COALESCE(u.phone, '0900000000'),
  'Booking test SePay 1000 dong'
FROM users u
LEFT JOIN tour_pickup_points pp ON pp.id = @pickup_id
WHERE u.id = @user_id;

SET @booking_id := LAST_INSERT_ID();

INSERT INTO payments (
  booking_id,
  payment_method,
  payment_status,
  amount,
  internal_transaction_code,
  paid_at
)
VALUES (
  @booking_id,
  'bank_transfer',
  'pending',
  1000,
  @payment_code,
  NULL
);

UPDATE tour_departures
SET held_slots = held_slots + 1
WHERE id = @departure_id;

INSERT INTO booking_status_logs (
  booking_id,
  payment_id,
  action_type,
  old_status,
  new_status,
  changed_by_user_id,
  source,
  reason,
  note
)
VALUES (
  @booking_id,
  LAST_INSERT_ID(),
  'test_payment',
  NULL,
  'pending_payment',
  @user_id,
  'system',
  'Create SePay test booking 1000 VND',
  CONCAT('Payment code: ', @payment_code)
);

SELECT
  b.id AS booking_id,
  b.booking_code,
  b.user_id,
  b.final_amount,
  b.booking_status,
  p.internal_transaction_code,
  p.amount,
  p.payment_status
FROM bookings b
JOIN payments p ON p.booking_id = b.id
WHERE b.id = @booking_id;

USE travela_full_mvc;

SET @user_id := 343;

SET @booking_id := (
  SELECT b.id
  FROM bookings b
  WHERE b.user_id = @user_id
    AND b.note LIKE '%Booking test SePay%'
    AND b.booking_status = 'pending_payment'
  ORDER BY b.id DESC
  LIMIT 1
);

UPDATE bookings
SET original_amount = 2000,
    discount_amount = 0,
    final_amount = 2000,
    note = 'Booking test SePay 2000 dong'
WHERE id = @booking_id;

UPDATE payments
SET amount = 2000
WHERE booking_id = @booking_id
  AND payment_status = 'pending';

SELECT
  b.id AS booking_id,
  b.booking_code,
  b.final_amount,
  b.booking_status,
  p.internal_transaction_code,
  p.amount,
  p.payment_status
FROM bookings b
JOIN payments p ON p.booking_id = b.id
WHERE b.id = @booking_id;


INSERT IGNORE INTO user_vouchers(user_id, voucher_id)
SELECT u.id, v.id
FROM users u
JOIN vouchers v ON v.member_tier = u.member_tier
WHERE u.role = 'user'
  AND u.status = 'active'
  AND v.status = 'active'
  AND v.start_date <= CURDATE()
  AND v.end_date >= CURDATE();
  


CREATE TABLE IF NOT EXISTS `recommendation_user_factors` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `vector` JSON NOT NULL,
  `trained_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `recommendation_user_factors_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `recommendation_tour_factors` (
  `tour_id` BIGINT UNSIGNED NOT NULL,
  `vector` JSON NOT NULL,
  `trained_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tour_id`),
  CONSTRAINT `recommendation_tour_factors_tour_id_fkey`
    FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `tour_embeddings` (
  `tour_id` BIGINT UNSIGNED NOT NULL,
  `text_embedding` JSON NULL,
  `image_embedding` JSON NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tour_id`),
  CONSTRAINT `tour_embeddings_tour_id_fkey`
    FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `recommendation_metric_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `model_name` VARCHAR(100) NOT NULL,
  `precision_at_10` DOUBLE NULL,
  `recall_at_10` DOUBLE NULL,
  `ndcg_at_10` DOUBLE NULL,
  `coverage` DOUBLE NULL,
  `diversity` DOUBLE NULL,
  `novelty` DOUBLE NULL,
  `map_at_10` DOUBLE NULL,
  `meta` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `recommendation_metric_runs_model_name_created_at_idx` (`model_name`, `created_at`)
);

SELECT JSON_ARRAYAGG(
  JSON_OBJECT(
    'modelName', model_name,
    'precisionAt10', precision_at_10,
    'recallAt10', recall_at_10,
    'ndcgAt10', ndcg_at_10,
    'coverage', coverage,
    'diversity', diversity
  )
) AS metrics_json
FROM (
  SELECT *
  FROM recommendation_metric_runs
  ORDER BY created_at DESC
  LIMIT 5
) AS latest_metrics;


ALTER TABLE chat_conversations
  ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'user' AFTER user_id;

CREATE INDEX idx_chat_conversations_user_scope_updated
  ON chat_conversations(user_id, scope, updated_at);
  
SET SQL_SAFE_UPDATES = 0;
UPDATE tour_media
SET file_url = CASE 
  WHEN tour_id % 8 = 0 THEN 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80'
  WHEN tour_id % 8 = 1 THEN 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80'
  WHEN tour_id % 8 = 2 THEN 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80'
  WHEN tour_id % 8 = 3 THEN 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=80'
  WHEN tour_id % 8 = 4 THEN 'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1200&q=80'
  WHEN tour_id % 8 = 5 THEN 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=1200&q=80'
  WHEN tour_id % 8 = 6 THEN 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80'
  ELSE 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80'
END
WHERE file_url LIKE 'https://picsum.photos/%';

CREATE TABLE IF NOT EXISTS review_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id BIGINT UNSIGNED NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  media_type VARCHAR(30) NOT NULL DEFAULT 'image',
  display_order INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_review_media_review_order (review_id, display_order),
  CONSTRAINT fk_review_media_review
    FOREIGN KEY (review_id) REFERENCES reviews(id)
    ON DELETE CASCADE
);

ALTER TABLE users
  MODIFY role ENUM('admin','user','guide') NOT NULL DEFAULT 'user';

ALTER TABLE notifications
  MODIFY target_role ENUM('all','admin','user','guide') NOT NULL DEFAULT 'user';
  
  ALTER TABLE refund_requests
  ADD COLUMN refund_bank_name VARCHAR(100) NULL AFTER refund_amount,
  ADD COLUMN refund_account_no VARCHAR(50) NULL AFTER refund_bank_name,
  ADD COLUMN refund_account_name VARCHAR(150) NULL AFTER refund_account_no,
  ADD COLUMN refund_qr_url VARCHAR(500) NULL AFTER refund_account_name;
  CREATE INDEX refund_requests_refund_account_no_idx
  ON refund_requests(refund_account_no);
  
  
  SET SQL_SAFE_UPDATES = 1;
  INSERT INTO users (
  full_name,
  email,
  phone,
  identity_number,
  password_hash,
  role,
  status,
  auth_provider,
  member_points,
  member_tier,
  created_at,
  updated_at
)
SELECT
  g.full_name,
  g.email,
  g.phone,
  g.identity_number,
  '$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC',
  'guide',
  'active',
  'local',
  0,
  'bronze',
  NOW(),
  NOW()
FROM guides g
WHERE g.email IS NOT NULL
  AND g.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.email = g.email
  );

-- 4. Nếu trước đó đã có user trùng email HDV thì cập nhật role thành guide
UPDATE users u
JOIN guides g ON g.email = u.email
SET
  u.full_name = g.full_name,
  u.phone = g.phone,
  u.identity_number = g.identity_number,
  u.password_hash = '$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC',
  u.role = 'guide',
  u.status = 'active',
  u.auth_provider = 'local',
  u.updated_at = NOW()
WHERE g.email IS NOT NULL;

-- 5. Gắn guides.user_id với users.id
UPDATE guides g
JOIN users u ON u.email = g.email
SET g.user_id = u.id
WHERE g.email IS NOT NULL;

-- 6. Kiểm tra kết quả
SELECT
  g.id AS guide_id,
  g.full_name AS guide_name,
  g.email AS guide_email,
  g.user_id,
  u.id AS user_id,
  u.email AS login_email,
  u.role,
  u.status
FROM guides g
LEFT JOIN users u ON u.id = g.user_id
ORDER BY g.id;




-- seed
-- =========================================================
-- Travela realistic dataset patch
-- Chạy SAU file seed hiện tại để đổi dữ liệu demo cho giống website du lịch thật hơn.
-- Không đổi cấu trúc bảng, chỉ cập nhật dữ liệu hiển thị.
-- =========================================================

USE travela_full_mvc;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

DROP TEMPORARY TABLE IF EXISTS tmp_real_user_names;
CREATE TEMPORARY TABLE tmp_real_user_names(seq INT PRIMARY KEY, full_name VARCHAR(150), email_slug VARCHAR(120));
INSERT INTO tmp_real_user_names(seq, full_name, email_slug) VALUES
(1,'Nguyễn Minh Anh','nguyen.minh.anh'),
(2,'Trần Gia Bảo','tran.gia.bao'),
(3,'Lê Hoàng Vy','le.hoang.vy'),
(4,'Phạm Quốc Huy','pham.quoc.huy'),
(5,'Võ Thanh Tâm','vo.thanh.tam'),
(6,'Đặng Ngọc Hân','dang.ngoc.han'),
(7,'Bùi Quang Khải','bui.quang.khai'),
(8,'Đỗ Nhật Linh','do.nhat.linh'),
(9,'Hồ Thiên An','ho.thien.an'),
(10,'Ngô Gia Hân','ngo.gia.han'),
(11,'Dương Bảo Ngọc','duong.bao.ngoc'),
(12,'Lý Minh Khang','ly.minh.khang'),
(13,'Mai Khánh Linh','mai.khanh.linh'),
(14,'Phan Thu Uyên','phan.thu.uyen'),
(15,'Nguyễn Minh Quân','nguyen.minh.quan'),
(16,'Trần Thanh Khoa','tran.thanh.khoa'),
(17,'Lê Thảo Phương','le.thao.phuong'),
(18,'Phạm Hải Đăng','pham.hai.dang'),
(19,'Hoàng Phúc An','hoang.phuc.an'),
(20,'Huỳnh Tuấn Kiệt','huynh.tuan.kiet'),
(21,'Võ Hoàng Phương','vo.hoang.phuong'),
(22,'Đặng Anh Thư','dang.anh.thu'),
(23,'Bùi Bảo An','bui.bao.an'),
(24,'Đỗ Nhật Khoa','do.nhat.khoa'),
(25,'Hồ Hà Phương','ho.ha.phuong'),
(26,'Ngô Gia Uyên','ngo.gia.uyen'),
(27,'Dương Quốc An','duong.quoc.an'),
(28,'Lý Ngọc Khoa','ly.ngoc.khoa'),
(29,'Mai Khánh Phương','mai.khanh.phuong'),
(30,'Phan Quỳnh Như','phan.quynh.nhu'),
(31,'Nguyễn Hoàng Nam','nguyen.hoang.nam'),
(32,'Trần Bảo Châu','tran.bao.chau'),
(33,'Lê Gia Huy','le.gia.huy'),
(34,'Phạm Ngọc Mai','pham.ngoc.mai'),
(35,'Hoàng Minh Trí','hoang.minh.tri'),
(36,'Huỳnh Anh Duy','huynh.anh.duy'),
(37,'Võ Thị Mỹ Duyên','vo.thi.my.duyen'),
(38,'Đặng Phương Nam','dang.phuong.nam'),
(39,'Bùi Thiên Phúc','bui.thien.phuc'),
(40,'Đỗ Khánh Vân','do.khanh.van'),
(41,'Hồ Quốc Việt','ho.quoc.viet'),
(42,'Ngô Thùy Trang','ngo.thuy.trang'),
(43,'Dương Minh Nhật','duong.minh.nhat'),
(44,'Lý Anh Khoa','ly.anh.khoa'),
(45,'Mai Tường Vy','mai.tuong.vy'),
(46,'Phan Hoàng Long','phan.hoang.long'),
(47,'Nguyễn Bảo Trâm','nguyen.bao.tram'),
(48,'Trần Minh Thư','tran.minh.thu'),
(49,'Lê Quốc Bảo','le.quoc.bao'),
(50,'Phạm Hoài An','pham.hoai.an'),
(51,'Hoàng Gia Linh','hoang.gia.linh'),
(52,'Huỳnh Thanh Bình','huynh.thanh.binh');

SET @real_user_name_count := (SELECT COUNT(*) FROM tmp_real_user_names);
UPDATE users u
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM users
  WHERE role = 'user'
) x ON x.id = u.id
JOIN tmp_real_user_names n 
  ON n.seq = MOD(x.rn - 1, @real_user_name_count) + 1
SET
  u.full_name = n.full_name,
  u.email = CONCAT(n.email_slug, '.', LPAD(u.id, 3, '0'), '@travela.vn'),
  u.phone = CONCAT('09', LPAD(10000000 + u.id, 8, '0')),
  u.identity_number = CONCAT('0792', LPAD(202600000 + u.id, 9, '0'))
WHERE u.role = 'user';

UPDATE bookings b
JOIN users u ON u.id = b.user_id
SET
  b.contact_name = u.full_name,
  b.contact_email = u.email,
  b.contact_phone = u.phone
WHERE b.user_id IS NOT NULL;

UPDATE booking_guests bg
JOIN bookings b ON b.id = bg.booking_id
SET bg.full_name = CONCAT(b.contact_name, CASE bg.guest_type WHEN 'child' THEN ' - Bé đi cùng' ELSE ' - Khách đi cùng' END, ' ', bg.id);

DROP TEMPORARY TABLE IF EXISTS tmp_real_guides;
CREATE TEMPORARY TABLE tmp_real_guides(seq INT PRIMARY KEY, full_name VARCHAR(150), languages VARCHAR(255), note TEXT, years TINYINT UNSIGNED);
INSERT INTO tmp_real_guides(seq, full_name, languages, note, years) VALUES
(1,'Nguyễn Hoàng Dũng','Tiếng Việt, Tiếng Anh','Chuyên tuyến miền Trung, kinh nghiệm dẫn đoàn gia đình',12),
(2,'Trần Quốc Linh','Tiếng Việt, Tiếng Trung','Chuyên tour văn hóa, phố cổ và khách đoàn',9),
(3,'Lê Thảo Oanh','Tiếng Việt, Tiếng Hàn','Chuyên tuyến Đà Lạt, Nha Trang, nghỉ dưỡng',10),
(4,'Phạm Bảo Sơn','Tiếng Việt, Tiếng Nhật','Chuyên tour lịch sử, di sản và doanh nghiệp',8),
(5,'Hoàng Khánh Uyên','Tiếng Việt, Tiếng Anh','Chuyên tour miền Tây, trải nghiệm địa phương',7),
(6,'Võ Phúc Đạt','Tiếng Việt, Tiếng Anh','Chuyên tuyến biển đảo Phú Quốc, Côn Đảo',6),
(7,'Đặng Hà Bình','Tiếng Việt, Tiếng Trung','Chuyên tour cao nguyên, săn mây, trekking nhẹ',5),
(8,'Bùi Minh Hân','Tiếng Việt, Tiếng Hàn','Chuyên tour gia đình và khách trẻ',4),
(9,'Đỗ Hoàng My','Tiếng Việt, Tiếng Nhật','Chuyên tuyến Huế, Hội An, Đà Nẵng',6),
(10,'Hồ Quốc Phương','Tiếng Việt','Chuyên tour ngắn ngày khởi hành TP.HCM',5),
(11,'Ngô Thảo Trang','Tiếng Việt, Tiếng Anh','Chuyên tuyến Tây Bắc, Hà Giang, Sa Pa',8),
(12,'Dương Bảo Vy','Tiếng Việt, Tiếng Trung','Chuyên tuyến miền Tây và hành hương',10),
(13,'Lý Khánh Nhi','Tiếng Việt, Tiếng Hàn','Chuyên tour nghỉ dưỡng cao cấp',5),
(14,'Mai Phúc Chi','Tiếng Việt, Tiếng Nhật','Chuyên tour di sản, văn hóa và ẩm thực',11),
(15,'Phan Hà Khoa','Tiếng Việt','Chuyên tour học sinh, sinh viên và teambuilding',7),
(16,'Nguyễn Minh Nam','Tiếng Việt, Tiếng Anh','Chuyên tour miền Bắc, Ninh Bình, Hạ Long',6),
(17,'Trần Hoàng Quân','Tiếng Việt, Tiếng Trung','Chuyên tour đoàn doanh nghiệp',9),
(18,'Lê Quốc Tú','Tiếng Việt, Tiếng Hàn','Chuyên tuyến biển miền Trung',8),
(19,'Phạm Thảo Yến','Tiếng Việt, Tiếng Nhật','Chuyên tour cao cấp và khách quốc tế',6),
(20,'Hoàng Bảo An','Tiếng Việt','Chuyên tuyến Vũng Tàu, Tây Ninh, An Giang',5),
(21,'Huỳnh Khánh Dũng','Tiếng Việt, Tiếng Anh','Chuyên tour khám phá thiên nhiên',7),
(22,'Võ Phúc Linh','Tiếng Việt, Tiếng Trung','Chuyên tour lễ hội và văn hóa địa phương',9),
(23,'Đặng Hà Oanh','Tiếng Việt, Tiếng Hàn','Chuyên tour gia đình, người lớn tuổi',12),
(24,'Bùi Minh Sơn','Tiếng Việt, Tiếng Nhật','Chuyên tour biển đảo và lặn ngắm san hô',11),
(25,'Đỗ Hoàng Uyên','Tiếng Việt','Chuyên tuyến miền Tây sông nước',10),
(26,'Hồ Quốc Đạt','Tiếng Việt, Tiếng Anh','Chuyên tour trekking nhẹ và chụp ảnh',8),
(27,'Ngô Thảo Bình','Tiếng Việt, Tiếng Trung','Chuyên tuyến Đà Nẵng - Hội An - Huế',10),
(28,'Dương Bảo Hân','Tiếng Việt, Tiếng Hàn','Chuyên tour nghỉ dưỡng, resort',4),
(29,'Lý Khánh My','Tiếng Việt, Tiếng Nhật','Chuyên tour văn hóa, bảo tàng, di tích',10),
(30,'Mai Phúc Phương','Tiếng Việt','Chuyên tour khởi hành hằng tuần từ TP.HCM',6);

UPDATE guides g
JOIN tmp_real_guides r ON r.seq = g.id
SET
  g.full_name = r.full_name,
  g.phone = CONCAT('0912', LPAD(g.id, 6, '0')),
  g.email = CONCAT('guide', LPAD(g.id, 2, '0'), '@travela.vn'),
  g.languages = r.languages,
  g.experience_years = r.years,
  g.note = r.note,
  g.status = 'active'
WHERE g.id BETWEEN 1 AND 30;

UPDATE tours t
JOIN destinations d ON d.id = t.destination_id
SET t.tour_theme =
  CASE
    WHEN d.name IN ('Phú Quốc','Nha Trang','Hạ Long','Mũi Né','Quy Nhơn','Côn Đảo','Vũng Tàu') THEN
      CASE MOD(t.id,3) WHEN 0 THEN 'beach' WHEN 1 THEN 'family' ELSE 'luxury' END
    WHEN d.name IN ('Đà Lạt','Sa Pa','Hà Giang','Mộc Châu','Ninh Bình') THEN
      CASE MOD(t.id,3) WHEN 0 THEN 'mountain' WHEN 1 THEN 'eco' ELSE 'adventure' END
    WHEN d.name IN ('Đà Nẵng','Hội An','Huế') THEN
      CASE MOD(t.id,3) WHEN 0 THEN 'culture' WHEN 1 THEN 'city' ELSE 'family' END
    WHEN d.name IN ('Cần Thơ','An Giang','Cà Mau','Buôn Ma Thuột') THEN
      CASE MOD(t.id,3) WHEN 0 THEN 'eco' WHEN 1 THEN 'culture' ELSE 'family' END
    WHEN d.name = 'Tây Ninh' THEN
      CASE MOD(t.id,3) WHEN 0 THEN 'culture' WHEN 1 THEN 'adventure' ELSE 'family' END
    ELSE 'other'
  END;

UPDATE tours t
JOIN destinations d ON d.id = t.destination_id
SET
  t.name = CONCAT(
    CASE t.tour_theme
      WHEN 'beach' THEN 'Kỳ nghỉ biển '
      WHEN 'mountain' THEN 'Chinh phục '
      WHEN 'city' THEN 'City tour '
      WHEN 'culture' THEN 'Dấu ấn văn hóa '
      WHEN 'adventure' THEN 'Hành trình khám phá '
      WHEN 'eco' THEN 'Trải nghiệm thiên nhiên '
      WHEN 'family' THEN 'Du lịch gia đình '
      WHEN 'luxury' THEN 'Nghỉ dưỡng cao cấp '
      ELSE 'Tour '
    END,
    d.name, ' ', t.duration_days, 'N', t.duration_nights, 'Đ'
  ),
  t.short_description = CONCAT(
    CASE t.tour_theme
      WHEN 'beach' THEN 'Lịch trình nghỉ dưỡng biển, check-in đẹp, phù hợp gia đình và nhóm bạn tại '
      WHEN 'mountain' THEN 'Lịch trình thiên nhiên, săn mây, chụp ảnh và trải nghiệm khí hậu vùng cao tại '
      WHEN 'city' THEN 'Lịch trình tham quan thành phố, mua sắm và thưởng thức ẩm thực địa phương tại '
      WHEN 'culture' THEN 'Lịch trình tìm hiểu văn hóa, di tích, kiến trúc và đặc sản tại '
      WHEN 'adventure' THEN 'Lịch trình khám phá năng động, nhiều điểm check-in và trải nghiệm mới tại '
      WHEN 'eco' THEN 'Lịch trình xanh, gần thiên nhiên, phù hợp khách thích trải nghiệm địa phương tại '
      WHEN 'family' THEN 'Lịch trình nhẹ nhàng, điểm đón rõ ràng, phù hợp gia đình có trẻ nhỏ tại '
      WHEN 'luxury' THEN 'Lịch trình nghỉ dưỡng khách sạn tốt, dịch vụ thoải mái và riêng tư tại '
      ELSE 'Lịch trình du lịch trọn gói tại '
    END,
    d.name, '.'
  ),
  t.full_description = CONCAT(
    'Tour ', d.name, ' được Travela thiết kế theo lịch khởi hành cố định, có hướng dẫn viên theo đoàn, điểm đón rõ ràng, khách sạn đối tác, phương tiện phù hợp và hỗ trợ đặt chỗ trực tuyến. ',
    'Khách có thể chọn ngày khởi hành, áp dụng voucher, theo dõi số chỗ còn lại và nhận thông báo trước ngày đi.'
  ),
  t.is_trending = CASE WHEN MOD(t.id, 5) = 0 OR d.name IN ('Đà Lạt','Phú Quốc','Đà Nẵng','Tây Ninh') THEN 1 ELSE 0 END,
  t.is_best_deal = CASE WHEN MOD(t.id, 7) = 0 OR d.name IN ('Cần Thơ','Vũng Tàu','Mũi Né') THEN 1 ELSE 0 END;

DELETE FROM tour_itinerary;
DROP TEMPORARY TABLE IF EXISTS tmp_itinerary_template;
CREATE TEMPORARY TABLE tmp_itinerary_template(destination_name VARCHAR(150), day_number INT, title VARCHAR(220), description TEXT, location_name VARCHAR(200), PRIMARY KEY(destination_name, day_number));
INSERT INTO tmp_itinerary_template(destination_name, day_number, title, description, location_name) VALUES
('Phú Quốc',1,'Đến Phú Quốc - Grand World','Đón khách tại sân bay/bến tàu, dùng bữa trưa, nhận phòng. Buổi chiều tham quan Grand World, ngắm hoàng hôn và tự do khám phá phố đi bộ.','Grand World Phú Quốc'),
('Phú Quốc',2,'Nam đảo - Cáp treo Hòn Thơm','Tham quan cơ sở ngọc trai, di chuyển đến ga An Thới, trải nghiệm cáp treo Hòn Thơm và vui chơi tại công viên nước theo chương trình.','Hòn Thơm'),
('Phú Quốc',3,'VinWonders - Safari hoặc nghỉ dưỡng biển','Khách chọn vui chơi VinWonders, Safari hoặc nghỉ dưỡng tại bãi biển. Buổi tối tự do thưởng thức hải sản địa phương.','Bãi Sao / VinWonders'),
('Phú Quốc',4,'Chợ Dương Đông - Mua đặc sản','Tham quan chợ Dương Đông, mua nước mắm, hồ tiêu, đặc sản Phú Quốc và trả khách tại sân bay/bến tàu.','Chợ Dương Đông'),
('Phú Quốc',5,'Tạm biệt đảo ngọc','Ăn sáng, tự do tắm biển, làm thủ tục trả phòng và kết thúc hành trình.','Phú Quốc'),
('Nha Trang',1,'Khởi hành đến Nha Trang - Biển Trần Phú','Đón khách, nhận phòng, tham quan Tháp Trầm Hương và dạo biển Trần Phú. Buổi tối tự do khám phá phố biển.','Biển Trần Phú'),
('Nha Trang',2,'Tour đảo - Hòn Mun - Làng Chài','Lên cano tham quan vịnh Nha Trang, trải nghiệm lặn ngắm san hô, dùng bữa trưa hải sản và nghỉ ngơi tại bãi tắm.','Vịnh Nha Trang'),
('Nha Trang',3,'VinWonders hoặc tắm bùn khoáng','Tự chọn vui chơi VinWonders Nha Trang hoặc trải nghiệm tắm bùn khoáng. Buổi chiều mua đặc sản yến sào, nem Ninh Hòa.','VinWonders Nha Trang'),
('Nha Trang',4,'Chùa Long Sơn - Tháp Bà Ponagar','Tham quan Chùa Long Sơn, Tháp Bà Ponagar, mua quà lưu niệm và kết thúc chương trình.','Tháp Bà Ponagar'),
('Nha Trang',5,'Tự do nghỉ dưỡng','Ăn sáng, tự do tắm biển, trả phòng và tiễn khách.','Nha Trang'),
('Đà Lạt',1,'Đến Đà Lạt - Quảng trường Lâm Viên','Đón khách, di chuyển lên Đà Lạt, tham quan Quảng trường Lâm Viên, Hồ Xuân Hương và nhận phòng khách sạn.','Quảng trường Lâm Viên'),
('Đà Lạt',2,'Langbiang - Vườn hoa thành phố','Tham quan Langbiang, vườn hoa thành phố, nhà thờ Domaine de Marie. Buổi tối tự do dạo chợ đêm Đà Lạt.','Langbiang'),
('Đà Lạt',3,'Cầu Đất - Chụp ảnh săn mây','Khởi hành sớm đến Cầu Đất, check-in đồi chè, quán cà phê view núi và tham quan khu nông trại công nghệ cao.','Cầu Đất'),
('Đà Lạt',4,'Thác Datanla - Mua đặc sản','Trải nghiệm máng trượt Datanla, mua dâu tây, mứt, atiso và kết thúc chương trình.','Thác Datanla'),
('Đà Lạt',5,'Tự do cà phê và trả phòng','Ăn sáng, tự do tham quan quán cà phê địa phương, trả phòng và tiễn khách.','Đà Lạt'),
('Đà Nẵng',1,'Đà Nẵng - Biển Mỹ Khê','Đón khách, nhận phòng, dạo biển Mỹ Khê và tham quan cầu Rồng, cầu Tình Yêu vào buổi tối.','Biển Mỹ Khê'),
('Đà Nẵng',2,'Bà Nà Hills - Cầu Vàng','Tham quan Bà Nà Hills, Cầu Vàng, làng Pháp và khu vui chơi trong nhà. Dùng buffet theo chương trình.','Bà Nà Hills'),
('Đà Nẵng',3,'Ngũ Hành Sơn - Hội An','Tham quan Ngũ Hành Sơn, làng đá mỹ nghệ Non Nước, chiều di chuyển Hội An ngắm đèn lồng và thưởng thức đặc sản.','Hội An'),
('Đà Nẵng',4,'Sơn Trà - Chợ Hàn','Tham quan bán đảo Sơn Trà, chùa Linh Ứng, mua đặc sản tại chợ Hàn và kết thúc hành trình.','Bán đảo Sơn Trà'),
('Đà Nẵng',5,'Tự do nghỉ dưỡng','Ăn sáng, tự do tắm biển hoặc mua sắm trước khi trả phòng.','Đà Nẵng'),
('Cần Thơ',1,'Đến Cần Thơ - Bến Ninh Kiều','Đón khách, nhận phòng, tham quan Bến Ninh Kiều, cầu đi bộ và thưởng thức ẩm thực miền Tây.','Bến Ninh Kiều'),
('Cần Thơ',2,'Chợ nổi Cái Răng - Vườn trái cây','Dậy sớm đi chợ nổi Cái Răng, thưởng thức hủ tiếu trên ghe, tham quan lò hủ tiếu và vườn trái cây.','Chợ nổi Cái Răng'),
('Cần Thơ',3,'Nhà cổ Bình Thủy - Cồn Sơn','Tham quan nhà cổ Bình Thủy, trải nghiệm làm bánh dân gian, xem cá lóc bay tại Cồn Sơn.','Cồn Sơn'),
('Cần Thơ',4,'Mua đặc sản miền Tây','Mua bánh pía, khô cá, trái cây theo mùa và kết thúc chương trình.','Cần Thơ'),
('Cần Thơ',5,'Tạm biệt Tây Đô','Ăn sáng, tự do dạo phố, trả phòng và tiễn khách.','Cần Thơ'),
('Sa Pa',1,'Lào Cai - Thị trấn Sa Pa','Đón khách, di chuyển đến Sa Pa, nhận phòng, tham quan nhà thờ đá và quảng trường trung tâm.','Nhà thờ đá Sa Pa'),
('Sa Pa',2,'Fansipan - Bản Cát Cát','Trải nghiệm cáp treo Fansipan, tham quan bản Cát Cát, tìm hiểu văn hóa H''Mông và chụp ảnh ruộng bậc thang.','Fansipan'),
('Sa Pa',3,'Hàm Rồng - Chợ Sa Pa','Tham quan núi Hàm Rồng, vườn lan, cổng trời và mua đặc sản Tây Bắc.','Núi Hàm Rồng'),
('Sa Pa',4,'Tạm biệt Sa Pa','Ăn sáng, tự do cà phê view núi, trả phòng và khởi hành về điểm hẹn.','Sa Pa'),
('Sa Pa',5,'Săn mây tự do','Khởi hành sớm săn mây, chụp ảnh và kết thúc hành trình.','Sa Pa'),
('Hạ Long',1,'Đến Hạ Long - Bãi Cháy','Đón khách, nhận phòng, dạo biển Bãi Cháy và tham quan khu phố đêm Hạ Long.','Bãi Cháy'),
('Hạ Long',2,'Du thuyền vịnh Hạ Long','Lên du thuyền tham quan hang Sửng Sốt, đảo Titop, chèo kayak và dùng bữa trên tàu.','Vịnh Hạ Long'),
('Hạ Long',3,'Bảo tàng Quảng Ninh - Sun World','Tham quan bảo tàng Quảng Ninh, vui chơi Sun World hoặc tự do nghỉ dưỡng.','Bảo tàng Quảng Ninh'),
('Hạ Long',4,'Chợ Hạ Long - Mua đặc sản','Mua chả mực, hải sản khô, trả phòng và tiễn khách.','Chợ Hạ Long'),
('Hạ Long',5,'Tự do ngắm vịnh','Ăn sáng, tự do chụp ảnh vịnh trước khi kết thúc chương trình.','Hạ Long'),
('Hội An',1,'Đến Hội An - Phố cổ','Đón khách, nhận phòng, tham quan chùa Cầu, nhà cổ Tấn Ký và phố đèn lồng buổi tối.','Phố cổ Hội An'),
('Hội An',2,'Rừng dừa Bảy Mẫu - Làng gốm Thanh Hà','Trải nghiệm thúng chai tại rừng dừa Bảy Mẫu, tham quan làng gốm Thanh Hà và thưởng thức món địa phương.','Rừng dừa Bảy Mẫu'),
('Hội An',3,'Biển An Bàng - Lớp nấu ăn','Tự do tắm biển An Bàng hoặc tham gia lớp nấu ăn món Quảng theo chương trình.','Biển An Bàng'),
('Hội An',4,'Mua quà - Kết thúc tour','Mua đèn lồng, bánh đậu xanh, trả phòng và tiễn khách.','Hội An'),
('Hội An',5,'Tự do phố cổ','Ăn sáng, tự do dạo phố cổ và kết thúc hành trình.','Hội An'),
('Huế',1,'Đến Huế - Sông Hương','Đón khách, nhận phòng, tham quan cầu Trường Tiền và nghe ca Huế trên sông Hương vào buổi tối.','Sông Hương'),
('Huế',2,'Đại Nội - Chùa Thiên Mụ','Tham quan Đại Nội, chùa Thiên Mụ, lăng Khải Định và thưởng thức ẩm thực cung đình.','Đại Nội Huế'),
('Huế',3,'Lăng Tự Đức - Làng hương Thủy Xuân','Tham quan lăng Tự Đức, làng hương Thủy Xuân, chụp ảnh áo dài và mua đặc sản mè xửng.','Làng hương Thủy Xuân'),
('Huế',4,'Chợ Đông Ba - Tiễn khách','Mua đặc sản tại chợ Đông Ba, trả phòng và kết thúc chương trình.','Chợ Đông Ba'),
('Huế',5,'Tự do cà phê cố đô','Ăn sáng, tự do dạo thành phố Huế trước khi trả phòng.','Huế'),
('Mũi Né',1,'Đến Mũi Né - Resort biển','Đón khách, nhận phòng resort, tự do tắm biển và thưởng thức hải sản buổi tối.','Mũi Né'),
('Mũi Né',2,'Bàu Trắng - Đồi cát bay','Khởi hành tham quan Bàu Trắng, đồi cát bay, suối Tiên và làng chài Mũi Né.','Bàu Trắng'),
('Mũi Né',3,'Nghỉ dưỡng biển - Chụp ảnh','Tự do nghỉ dưỡng tại resort, trải nghiệm thể thao biển hoặc chụp ảnh hoàng hôn.','Biển Mũi Né'),
('Mũi Né',4,'Mua nước mắm - Tiễn khách','Mua nước mắm Phan Thiết, thanh long, trả phòng và kết thúc chương trình.','Phan Thiết'),
('Mũi Né',5,'Tự do resort','Ăn sáng, tự do tắm biển trước khi trả phòng.','Mũi Né');

INSERT INTO tmp_itinerary_template(destination_name, day_number, title, description, location_name) VALUES
('Quy Nhơn',1,'Đến Quy Nhơn - Eo Gió','Đón khách, tham quan Eo Gió, Tịnh xá Ngọc Hòa và nhận phòng khách sạn.','Eo Gió'),
('Quy Nhơn',2,'Kỳ Co - Lặn ngắm san hô','Di chuyển cano ra Kỳ Co, tắm biển, lặn ngắm san hô và dùng bữa hải sản.','Kỳ Co'),
('Quy Nhơn',3,'Tháp Đôi - Ghềnh Ráng','Tham quan Tháp Đôi, Ghềnh Ráng Tiên Sa, mộ Hàn Mặc Tử và mua đặc sản.','Ghềnh Ráng'),
('Quy Nhơn',4,'Tạm biệt Quy Nhơn','Ăn sáng, tự do dạo biển, trả phòng và tiễn khách.','Quy Nhơn'),
('Quy Nhơn',5,'Tự do biển xanh','Tự do nghỉ dưỡng và chụp ảnh trước khi kết thúc chương trình.','Quy Nhơn'),
('Ninh Bình',1,'Đến Ninh Bình - Hoa Lư','Đón khách, tham quan cố đô Hoa Lư, nhận phòng và thưởng thức đặc sản dê núi.','Hoa Lư'),
('Ninh Bình',2,'Tràng An - Hang Múa','Đi thuyền Tràng An, tham quan Hang Múa, leo bậc đá ngắm toàn cảnh Tam Cốc.','Tràng An'),
('Ninh Bình',3,'Tam Cốc - Bích Động','Tham quan Tam Cốc, chùa Bích Động, mua cơm cháy và đặc sản địa phương.','Tam Cốc'),
('Ninh Bình',4,'Tạm biệt Ninh Bình','Ăn sáng, tự do chụp ảnh, trả phòng và kết thúc chương trình.','Ninh Bình'),
('Ninh Bình',5,'Tự do nghỉ dưỡng xanh','Tự do đạp xe quanh làng quê, trả phòng và tiễn khách.','Ninh Bình'),
('Hà Giang',1,'Hà Giang - Cột mốc Km0','Đón khách, di chuyển đến Hà Giang, check-in cột mốc Km0 và nghỉ đêm tại thành phố.','Cột mốc Km0'),
('Hà Giang',2,'Quản Bạ - Yên Minh - Đồng Văn','Tham quan núi đôi Quản Bạ, rừng thông Yên Minh, dốc Thẩm Mã và phố cổ Đồng Văn.','Đồng Văn'),
('Hà Giang',3,'Mã Pì Lèng - Sông Nho Quế','Chinh phục đèo Mã Pì Lèng, đi thuyền sông Nho Quế và ngắm hẻm Tu Sản.','Sông Nho Quế'),
('Hà Giang',4,'Dinh Vua Mèo - Trở về','Tham quan dinh Vua Mèo, mua đặc sản vùng cao và kết thúc hành trình.','Dinh Vua Mèo'),
('Hà Giang',5,'Chợ phiên vùng cao','Tham quan chợ phiên nếu đúng ngày, dùng bữa địa phương và tiễn khách.','Hà Giang'),
('Mộc Châu',1,'Đến Mộc Châu - Đồi chè','Đón khách, tham quan đồi chè trái tim, nhận phòng và thưởng thức đặc sản bê chao.','Đồi chè Mộc Châu'),
('Mộc Châu',2,'Thác Dải Yếm - Cầu kính','Tham quan thác Dải Yếm, cầu kính tình yêu và vườn dâu theo mùa.','Thác Dải Yếm'),
('Mộc Châu',3,'Rừng thông Bản Áng - Nông trại bò sữa','Dạo rừng thông Bản Áng, tham quan nông trại bò sữa và mua sữa chua, chè đặc sản.','Bản Áng'),
('Mộc Châu',4,'Tạm biệt Mộc Châu','Ăn sáng, tự do chụp ảnh, trả phòng và kết thúc chương trình.','Mộc Châu'),
('Mộc Châu',5,'Tự do săn ảnh mùa hoa','Tự do chụp ảnh hoa mận, hoa cải hoặc đồi chè theo mùa.','Mộc Châu'),
('Buôn Ma Thuột',1,'Đến Buôn Ma Thuột - Bảo tàng cà phê','Đón khách, tham quan Bảo tàng Thế giới Cà phê, nhận phòng và thưởng thức cà phê địa phương.','Bảo tàng Cà phê'),
('Buôn Ma Thuột',2,'Buôn Đôn - Hồ Lắk','Tham quan Buôn Đôn, cầu treo, tìm hiểu văn hóa Ê Đê và ngắm cảnh Hồ Lắk.','Buôn Đôn'),
('Buôn Ma Thuột',3,'Thác Dray Nur - Làng cà phê','Khám phá thác Dray Nur, chụp ảnh thiên nhiên và mua cà phê rang xay.','Thác Dray Nur'),
('Buôn Ma Thuột',4,'Mua đặc sản Tây Nguyên','Mua cà phê, mật ong, tiêu, trả phòng và kết thúc chương trình.','Buôn Ma Thuột'),
('Buôn Ma Thuột',5,'Tự do cà phê phố núi','Ăn sáng, tự do thưởng thức cà phê trước khi tiễn khách.','Buôn Ma Thuột'),
('Côn Đảo',1,'Đến Côn Đảo - Nghỉ dưỡng biển','Đón khách tại sân bay/bến tàu, nhận phòng, tự do tắm biển và dạo thị trấn Côn Sơn.','Côn Sơn'),
('Côn Đảo',2,'Hòn Bảy Cạnh - Lặn ngắm san hô','Đi cano tham quan đảo, lặn ngắm san hô và nghỉ dưỡng tại bãi biển hoang sơ.','Hòn Bảy Cạnh'),
('Côn Đảo',3,'Di tích lịch sử Côn Đảo','Tham quan nhà tù Côn Đảo, nghĩa trang Hàng Dương và các điểm di tích lịch sử.','Nghĩa trang Hàng Dương'),
('Côn Đảo',4,'Mua đặc sản - Tiễn khách','Mua hạt bàng, hải sản khô, trả phòng và kết thúc chương trình.','Côn Đảo'),
('Côn Đảo',5,'Tự do biển hoang sơ','Ăn sáng, tự do tắm biển trước khi trả phòng.','Côn Đảo'),
('Vũng Tàu',1,'Đến Vũng Tàu - Bãi Sau','Đón khách, nhận phòng, tắm biển Bãi Sau và thưởng thức hải sản buổi tối.','Bãi Sau'),
('Vũng Tàu',2,'Tượng Chúa Kitô - Hải đăng','Tham quan tượng Chúa Kitô, ngọn hải đăng, Bạch Dinh và tự do cà phê biển.','Tượng Chúa Kitô'),
('Vũng Tàu',3,'Marina - Hồ Mây','Check-in bến du thuyền Marina hoặc vui chơi khu du lịch Hồ Mây theo chương trình.','Marina Vũng Tàu'),
('Vũng Tàu',4,'Mua đặc sản - Trở về','Mua bánh bông lan trứng muối, hải sản khô và kết thúc chương trình.','Vũng Tàu'),
('Vũng Tàu',5,'Tự do cuối tuần','Ăn sáng, tự do tắm biển trước khi trả phòng.','Vũng Tàu'),
('Tây Ninh',1,'Khởi hành Tây Ninh - Tòa Thánh Cao Đài','Đón khách, tham quan Tòa Thánh Cao Đài, tìm hiểu kiến trúc tôn giáo đặc trưng và dùng bữa trưa địa phương.','Tòa Thánh Cao Đài'),
('Tây Ninh',2,'Núi Bà Đen - Cáp treo Sun World','Trải nghiệm cáp treo lên Núi Bà Đen, viếng chùa Bà, check-in tượng Phật Bà và ngắm toàn cảnh Tây Ninh.','Núi Bà Đen'),
('Tây Ninh',3,'Hồ Dầu Tiếng - Ma Thiên Lãnh','Tham quan Hồ Dầu Tiếng, khu Ma Thiên Lãnh, chụp ảnh thiên nhiên và thưởng thức đặc sản bánh tráng phơi sương.','Hồ Dầu Tiếng'),
('Tây Ninh',4,'Mua đặc sản Tây Ninh','Mua bánh tráng, muối tôm, trả khách tại điểm hẹn và kết thúc chương trình.','Tây Ninh'),
('Tây Ninh',5,'Tự do hành hương','Ăn sáng, tự do viếng chùa hoặc mua sắm trước khi kết thúc hành trình.','Tây Ninh'),
('An Giang',1,'Đến Châu Đốc - Núi Sam','Đón khách, tham quan miếu Bà Chúa Xứ Núi Sam, nhận phòng và dùng bữa tối địa phương.','Núi Sam'),
('An Giang',2,'Rừng tràm Trà Sư','Đi xuồng trong rừng tràm Trà Sư, ngắm chim trời, bèo xanh và thưởng thức món miền Tây.','Rừng tràm Trà Sư'),
('An Giang',3,'Làng Chăm - Chợ Châu Đốc','Tham quan làng Chăm Châu Giang, chợ Châu Đốc và mua mắm đặc sản.','Chợ Châu Đốc'),
('An Giang',4,'Tạm biệt An Giang','Ăn sáng, trả phòng, mua quà và kết thúc chương trình.','An Giang'),
('An Giang',5,'Tự do hành hương','Tự do viếng chùa hoặc tham quan thêm theo nhu cầu đoàn.','An Giang'),
('Cà Mau',1,'Đến Cà Mau - Thành phố cuối trời','Đón khách, nhận phòng, tham quan trung tâm Cà Mau và thưởng thức đặc sản cua Cà Mau.','Cà Mau'),
('Cà Mau',2,'Mũi Cà Mau - Cột mốc tọa độ','Di chuyển đến Đất Mũi, check-in cột mốc tọa độ quốc gia và ngắm rừng ngập mặn.','Mũi Cà Mau'),
('Cà Mau',3,'Rừng U Minh Hạ','Tham quan rừng U Minh Hạ, trải nghiệm sông nước, thưởng thức cá đồng và mật ong rừng.','U Minh Hạ'),
('Cà Mau',4,'Mua đặc sản - Tiễn khách','Mua tôm khô, ba khía, cua Cà Mau, trả phòng và kết thúc chương trình.','Cà Mau'),
('Cà Mau',5,'Tự do miền sông nước','Ăn sáng, tự do dạo phố và tiễn khách.','Cà Mau');

INSERT INTO tour_itinerary(tour_id, day_number, item_order, title, description, location_name)
SELECT
  t.id,
  n.day_number,
  1,
  CONCAT('Ngày ', n.day_number, ': ', it.title),
  it.description,
  it.location_name
FROM tours t
JOIN destinations d ON d.id = t.destination_id
JOIN (
  SELECT 1 AS day_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
) n ON n.day_number <= t.duration_days
JOIN tmp_itinerary_template it ON it.destination_name = d.name AND it.day_number = n.day_number;

DROP TEMPORARY TABLE IF EXISTS tmp_transport_template;
CREATE TEMPORARY TABLE tmp_transport_template(
  destination_name VARCHAR(150) PRIMARY KEY,
  transport_type VARCHAR(50),
  provider VARCHAR(150),
  origin VARCHAR(150),
  destination_label VARCHAR(150),
  duration_hours DECIMAL(8,2),
  description TEXT
);
INSERT INTO tmp_transport_template(destination_name, transport_type, provider, origin, destination_label, duration_hours, description) VALUES
('Phú Quốc','plane','Vietnam Airlines / Vietjet Air','TP.HCM','Sân bay Phú Quốc',1.10,'Bao gồm vé máy bay khứ hồi TP.HCM - Phú Quốc, xe du lịch đời mới đưa đón theo chương trình.'),
('Nha Trang','bus','Xe giường nằm Phương Trang / Limousine 9 chỗ','TP.HCM','Nha Trang',8.00,'Xe giường nằm hoặc limousine tùy lịch khởi hành, có nước suối và khăn lạnh.'),
('Đà Lạt','bus','Limousine Thành Bưởi / Phương Trang','TP.HCM','Đà Lạt',7.00,'Xe limousine/giường nằm chất lượng cao, khởi hành đêm hoặc sáng sớm theo lịch tour.'),
('Đà Nẵng','plane','Vietnam Airlines / Vietjet Air','TP.HCM','Sân bay Đà Nẵng',1.30,'Vé máy bay khứ hồi và xe du lịch đưa đón tại Đà Nẵng.'),
('Cần Thơ','bus','Xe du lịch Travela 29-45 chỗ','TP.HCM','Cần Thơ',3.50,'Xe du lịch máy lạnh, ghế bật, phù hợp đoàn gia đình và khách nhóm.'),
('Sa Pa','train','Tàu hỏa Hà Nội - Lào Cai + xe trung chuyển','Hà Nội','Sa Pa',8.00,'Tàu đêm đến Lào Cai, sau đó xe trung chuyển lên thị trấn Sa Pa.'),
('Hạ Long','bus','Xe limousine Hà Nội - Hạ Long','Hà Nội','Hạ Long',3.00,'Xe limousine cao cấp đưa đón cao tốc Hà Nội - Hạ Long.'),
('Hội An','plane','Vietnam Airlines / Bamboo Airways','TP.HCM','Đà Nẵng - Hội An',1.30,'Bay đến Đà Nẵng, xe du lịch đưa đoàn về Hội An và tham quan theo lịch trình.'),
('Huế','plane','Vietnam Airlines / Vietjet Air','TP.HCM','Sân bay Phú Bài',1.25,'Vé máy bay khứ hồi TP.HCM - Huế và xe du lịch đưa đón tại điểm tham quan.'),
('Mũi Né','bus','Xe du lịch Travela / Limousine Bình Thuận','TP.HCM','Mũi Né',4.00,'Xe du lịch máy lạnh đi cao tốc Dầu Giây - Phan Thiết.'),
('Quy Nhơn','plane','Vietnam Airlines / Vietjet Air','TP.HCM','Sân bay Phù Cát',1.20,'Vé máy bay khứ hồi và xe du lịch đưa đón Quy Nhơn - Kỳ Co - Eo Gió.'),
('Ninh Bình','bus','Xe limousine Hà Nội - Ninh Bình','Hà Nội','Ninh Bình',2.00,'Xe limousine ghế rộng, đưa đón theo tuyến Hoa Lư - Tràng An - Tam Cốc.'),
('Hà Giang','bus','Xe giường nằm Hà Nội - Hà Giang','Hà Nội','Hà Giang',6.50,'Xe giường nằm đêm và xe du lịch địa phương tham quan cao nguyên đá.'),
('Mộc Châu','bus','Xe limousine Hà Nội - Mộc Châu','Hà Nội','Mộc Châu',4.00,'Xe limousine ghế ngả, di chuyển theo quốc lộ 6 đến Mộc Châu.'),
('Buôn Ma Thuột','bus','Xe giường nằm Kumho Samco / Long Vân','TP.HCM','Buôn Ma Thuột',8.00,'Xe giường nằm hoặc limousine đi Buôn Ma Thuột, có trung chuyển theo lịch tour.'),
('Côn Đảo','plane','Vietnam Airlines / Bamboo Airways','TP.HCM','Sân bay Côn Đảo',1.00,'Vé máy bay khứ hồi TP.HCM - Côn Đảo và xe đưa đón tại đảo.'),
('Vũng Tàu','bus','Xe limousine Hoa Mai / Toàn Thắng','TP.HCM','Vũng Tàu',2.50,'Xe limousine tuyến TP.HCM - Vũng Tàu, đón tại điểm hẹn trung tâm.'),
('Tây Ninh','bus','Xe du lịch Travela 29 chỗ','TP.HCM','Tây Ninh',2.50,'Xe du lịch máy lạnh đi Tây Ninh, phục vụ hành trình Tòa Thánh Cao Đài - Núi Bà Đen.'),
('An Giang','bus','Xe du lịch Travela / Huệ Nghĩa','TP.HCM','Châu Đốc',6.00,'Xe giường nằm hoặc xe du lịch máy lạnh đi Châu Đốc - An Giang.'),
('Cà Mau','bus','Xe giường nằm Phương Trang / Travela Bus','TP.HCM','Cà Mau',8.50,'Xe giường nằm chất lượng cao đi Cà Mau, có điểm dừng nghỉ theo hành trình.');

UPDATE tour_transports tt
JOIN tours t ON t.id = tt.tour_id
JOIN destinations d ON d.id = t.destination_id
JOIN tmp_transport_template tr ON tr.destination_name = d.name
SET
  tt.name = CONCAT(
    CASE tr.transport_type
      WHEN 'plane' THEN 'Vé máy bay khứ hồi - '
      WHEN 'train' THEN 'Tàu hỏa và xe trung chuyển - '
      ELSE 'Xe du lịch/limousine - '
    END,
    d.name
  ),
  tt.transport_type = tr.transport_type,
  tt.provider = tr.provider,
  tt.origin = tr.origin,
  tt.destination_label = tr.destination_label,
  tt.duration_hours = tr.duration_hours,
  tt.price = CASE tr.transport_type
    WHEN 'plane' THEN 1200000 + MOD(t.id, 6) * 180000
    WHEN 'train' THEN 650000 + MOD(t.id, 5) * 90000
    ELSE 280000 + MOD(t.id, 7) * 60000
  END,
  tt.description = tr.description,
  tt.status = 'active';

DROP TEMPORARY TABLE IF EXISTS tmp_hotel_template;
CREATE TEMPORARY TABLE tmp_hotel_template(destination_name VARCHAR(150) PRIMARY KEY, hotel_name VARCHAR(180));
INSERT INTO tmp_hotel_template(destination_name, hotel_name) VALUES
('Phú Quốc','Seashells Phú Quốc Hotel & Spa'),
('Nha Trang','Liberty Central Nha Trang Hotel'),
('Đà Lạt','TTC Hotel Premium Đà Lạt'),
('Đà Nẵng','Mường Thanh Luxury Đà Nẵng'),
('Cần Thơ','Sheraton Cần Thơ'),
('Sa Pa','KK Sapa Hotel'),
('Hạ Long','Mường Thanh Luxury Hạ Long'),
('Hội An','Laluna Hội An Riverside Hotel'),
('Huế','ÊMM Hotel Huế'),
('Mũi Né','The Cliff Resort & Residences Mũi Né'),
('Quy Nhơn','FLC City Hotel Beach Quy Nhơn'),
('Ninh Bình','Ninh Bình Hidden Charm Hotel'),
('Hà Giang','Phoenix Hotel Hà Giang'),
('Mộc Châu','Mường Thanh Holiday Mộc Châu'),
('Buôn Ma Thuột','Mường Thanh Luxury Buôn Ma Thuột'),
('Côn Đảo','The Secret Côn Đảo'),
('Vũng Tàu','Fusion Suites Vũng Tàu'),
('Tây Ninh','Melia Vinpearl Tây Ninh'),
('An Giang','Victoria Châu Đốc Hotel'),
('Cà Mau','Mường Thanh Luxury Cà Mau');

UPDATE tour_accommodations a
JOIN tours t ON t.id = a.tour_id
JOIN destinations d ON d.id = t.destination_id
JOIN tmp_hotel_template h ON h.destination_name = d.name
SET
  a.name = h.hotel_name,
  a.accommodation_type = 'hotel',
  a.star_rating = COALESCE(t.hotel_stars, 3),
  a.address = CONCAT('Khu trung tâm ', d.name),
  a.description = CONCAT('Khách sạn đối tác tại ', d.name, ', phòng sạch, vị trí thuận tiện, phù hợp lịch trình đoàn.'),
  a.price_per_night = 550000 + MOD(t.id, 8) * 180000,
  a.amenities = 'Wifi, ăn sáng, máy lạnh, lễ tân 24/7, hỗ trợ giữ hành lý',
  a.status = 'active';

DROP TEMPORARY TABLE IF EXISTS tmp_pickup_template;
CREATE TEMPORARY TABLE tmp_pickup_template(province VARCHAR(100) PRIMARY KEY, pickup_name VARCHAR(180), pickup_address VARCHAR(255), pickup_time TIME);
INSERT INTO tmp_pickup_template(province, pickup_name, pickup_address, pickup_time) VALUES
('Kiên Giang','Cảng tàu/Sân bay Phú Quốc','Sân bay Phú Quốc hoặc cảng Bãi Vòng, TP. Phú Quốc','08:30:00'),
('Khánh Hòa','Quảng trường 2/4 Nha Trang','Trần Phú, Lộc Thọ, Nha Trang','07:00:00'),
('Lâm Đồng','Quảng trường Lâm Viên','Đường Trần Quốc Toản, Phường 10, Đà Lạt','07:30:00'),
('Đà Nẵng','Công viên Biển Đông','Võ Nguyên Giáp, Sơn Trà, Đà Nẵng','07:30:00'),
('Cần Thơ','Bến Ninh Kiều','Đường Hai Bà Trưng, Ninh Kiều, Cần Thơ','06:00:00'),
('Lào Cai','Nhà thờ đá Sa Pa','Thị trấn Sa Pa, Lào Cai','07:00:00'),
('Quảng Ninh','Cổng Sun World Hạ Long','Hạ Long, Quảng Ninh','07:30:00'),
('Quảng Nam','Bưu điện Hội An','06 Trần Hưng Đạo, Hội An','07:30:00'),
('Thừa Thiên Huế','Nhà hát Sông Hương','Lê Lợi, TP. Huế','07:30:00'),
('Bình Thuận','Lotte Mart Phan Thiết','Khu đô thị Hùng Vương, Phan Thiết','07:30:00'),
('Bình Định','Quảng trường Nguyễn Tất Thành','An Dương Vương, Quy Nhơn','07:30:00'),
('Ninh Bình','Bến thuyền Tràng An','Tràng An, Ninh Bình','07:30:00'),
('Hà Giang','Cột mốc Km0 Hà Giang','TP. Hà Giang','07:00:00'),
('Sơn La','Khách sạn Mường Thanh Mộc Châu','Hoàng Quốc Việt, Mộc Châu','07:30:00'),
('Đắk Lắk','Ngã sáu Buôn Ma Thuột','Trung tâm TP. Buôn Ma Thuột','07:30:00'),
('Bà Rịa - Vũng Tàu','Bãi Sau Vũng Tàu','Thùy Vân, TP. Vũng Tàu','07:30:00'),
('Tây Ninh','Tòa Thánh Cao Đài Tây Ninh','Phạm Hộ Pháp, Hòa Thành, Tây Ninh','07:00:00'),
('An Giang','Miếu Bà Chúa Xứ Núi Sam','Phường Núi Sam, Châu Đốc, An Giang','07:00:00'),
('Cà Mau','Quảng trường Thanh Niên Cà Mau','Đường Trần Hưng Đạo, TP. Cà Mau','07:30:00');

UPDATE tour_pickup_points pp
JOIN tours t ON t.id = pp.tour_id
JOIN destinations d ON d.id = t.destination_id
JOIN tmp_pickup_template p ON p.province = d.province
SET
  pp.name = p.pickup_name,
  pp.address = p.pickup_address,
  pp.pickup_time = p.pickup_time,
  pp.note = 'Vui lòng có mặt trước giờ đón 15 phút. Hướng dẫn viên sẽ gọi xác nhận trước ngày khởi hành.'
WHERE pp.province = d.province OR pp.name LIKE 'Điểm đón trung tâm%';

UPDATE tour_pickup_points
SET
  name = 'Nhà văn hóa Thanh Niên',
  address = '04 Phạm Ngọc Thạch, Phường Bến Nghé, Quận 1, TP.HCM',
  pickup_time = '04:30:00',
  note = 'Điểm đón trung tâm TP.HCM, phù hợp khách khởi hành từ Sài Gòn.'
WHERE province = 'TP.HCM';

UPDATE reviews r
JOIN users u ON u.id = r.user_id
SET r.comment = CASE MOD(r.id, 5)
  WHEN 0 THEN 'Lịch trình rõ ràng, hướng dẫn viên nhiệt tình, điểm đón dễ tìm.'
  WHEN 1 THEN 'Gia đình tôi rất hài lòng, khách sạn sạch và di chuyển đúng giờ.'
  WHEN 2 THEN 'Tour phù hợp giá tiền, có thông báo trước ngày khởi hành rất tiện.'
  WHEN 3 THEN 'Điểm tham quan đẹp, ăn uống ổn, đặt tour và thanh toán khá nhanh.'
  ELSE 'Dịch vụ tốt, nhân viên hỗ trợ nhanh, sẽ tiếp tục đặt tour trên Travela.'
END
WHERE r.user_id IS NOT NULL;

UPDATE contacts c
JOIN users u ON u.id = c.user_id
SET
  c.full_name = u.full_name,
  c.email = u.email,
  c.phone = u.phone,
  c.subject = CASE MOD(c.id,4)
    WHEN 0 THEN 'Tư vấn tour gia đình dịp cuối tuần'
    WHEN 1 THEN 'Cần xác nhận điểm đón gần nhà'
    WHEN 2 THEN 'Hỏi lịch khởi hành và số chỗ còn lại'
    ELSE 'Hỗ trợ áp dụng voucher khi đặt tour'
  END,
  c.message = 'Tôi cần Travela tư vấn thêm để chọn tour phù hợp trước khi đặt.'
WHERE c.user_id IS NOT NULL;

UPDATE notifications n
SET
  n.title = REPLACE(n.title, 'Nhắc lịch khởi hành tour', 'Nhắc lịch khởi hành'),
  n.message = REPLACE(n.message, 'Tour ', 'Chuyến đi '),
  n.content = REPLACE(n.content, 'Vui lòng có mặt trước giờ đón 15 phút.', 'Anh/chị vui lòng có mặt trước giờ đón 15 phút để hướng dẫn viên hỗ trợ làm thủ tục.')
WHERE n.title LIKE '%khởi hành%';

SET SQL_SAFE_UPDATES = 1;
SELECT 'users' AS table_name, COUNT(*) AS total FROM users
UNION ALL SELECT 'guides', COUNT(*) FROM guides
UNION ALL SELECT 'tours', COUNT(*) FROM tours
UNION ALL SELECT 'tour_itinerary', COUNT(*) FROM tour_itinerary
UNION ALL SELECT 'tour_transports', COUNT(*) FROM tour_transports
UNION ALL SELECT 'tour_pickup_points', COUNT(*) FROM tour_pickup_points;




-- 1) Hành khách thường dùng của người dùng
CREATE TABLE IF NOT EXISTS saved_travelers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  relationship VARCHAR(50) NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(20) NULL,
  guest_type ENUM('adult','child','infant') NOT NULL DEFAULT 'adult',
  id_type ENUM('cccd','passport','birth_certificate','other') NULL,
  id_number VARCHAR(50) NULL,
  nationality VARCHAR(80) NOT NULL DEFAULT 'Việt Nam',
  phone VARCHAR(20) NULL,
  dietary_notes VARCHAR(500) NULL,
  health_notes VARCHAR(500) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_saved_travelers_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_saved_travelers_user(user_id),
  INDEX idx_saved_travelers_name(user_id, full_name)
) ENGINE=InnoDB;

-- 2) Một chuyến vận hành tương ứng một lịch khởi hành
CREATE TABLE IF NOT EXISTS trip_operations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  departure_id BIGINT UNSIGNED NOT NULL UNIQUE,
  guide_id BIGINT UNSIGNED NULL,
  operation_status ENUM('preparing','ready','boarding','departed','in_progress','completed','cancelled') NOT NULL DEFAULT 'preparing',
  meeting_note TEXT NULL,
  vehicle_info VARCHAR(255) NULL,
  emergency_phone VARCHAR(20) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(departure_id) REFERENCES tour_departures(id) ON DELETE CASCADE,
  FOREIGN KEY(guide_id) REFERENCES guides(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_trip_operations_guide(guide_id, operation_status)
) ENGINE=InnoDB;

-- 3) Check-in từng hành khách trong booking
CREATE TABLE IF NOT EXISTS passenger_checkins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_operation_id BIGINT UNSIGNED NOT NULL,
  booking_guest_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','present','late','absent','cancelled') NOT NULL DEFAULT 'pending',
  checked_in_at DATETIME NULL,
  checked_in_by BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
  FOREIGN KEY(booking_guest_id) REFERENCES booking_guests(id) ON DELETE CASCADE,
  FOREIGN KEY(checked_in_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uk_trip_guest(trip_operation_id, booking_guest_id),
  INDEX idx_checkin_status(trip_operation_id, status)
) ENGINE=InnoDB;

-- 4) Nhật ký hành trình
CREATE TABLE IF NOT EXISTS journey_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_operation_id BIGINT UNSIGNED NOT NULL,
  guide_id BIGINT UNSIGNED NOT NULL,
  log_type ENUM('departure','arrival','activity','hotel','meal','schedule_change','general') NOT NULL DEFAULT 'general',
  title VARCHAR(220) NOT NULL,
  content TEXT NULL,
  location_name VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  media_urls JSON NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
  FOREIGN KEY(guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  INDEX idx_journey_trip_time(trip_operation_id, occurred_at)
) ENGINE=InnoDB;

-- 5) Ticket sự cố
CREATE TABLE IF NOT EXISTS incident_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_code VARCHAR(40) NOT NULL UNIQUE,
  trip_operation_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  booking_guest_id BIGINT UNSIGNED NULL,
  reported_by_guide_id BIGINT UNSIGNED NULL,
  assigned_admin_id BIGINT UNSIGNED NULL,
  category ENUM('customer','vehicle','hotel','restaurant','health','weather','schedule','security','other') NOT NULL DEFAULT 'other',
  severity ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  status ENUM('open','acknowledged','in_progress','resolved','closed','rejected') NOT NULL DEFAULT 'open',
  title VARCHAR(220) NOT NULL,
  description TEXT NOT NULL,
  location_name VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  evidence_urls JSON NULL,
  resolution TEXT NULL,
  acknowledged_at DATETIME NULL,
  resolved_at DATETIME NULL,
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY(booking_guest_id) REFERENCES booking_guests(id) ON DELETE SET NULL,
  FOREIGN KEY(reported_by_guide_id) REFERENCES guides(id) ON DELETE SET NULL,
  FOREIGN KEY(assigned_admin_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_incident_trip(trip_operation_id, status),
  INDEX idx_incident_admin(assigned_admin_id, status),
  INDEX idx_incident_severity(severity, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS incident_ticket_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_ticket_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  comment TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(incident_ticket_id) REFERENCES incident_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_incident_comments(incident_ticket_id, created_at)
) ENGINE=InnoDB;

-- 6) Thông báo theo đoàn và người nhận cụ thể
CREATE TABLE IF NOT EXISTS trip_broadcasts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_operation_id BIGINT UNSIGNED NOT NULL,
  sender_user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(220) NOT NULL,
  content TEXT NOT NULL,
  channel ENUM('in_app','email','both') NOT NULL DEFAULT 'in_app',
  pickup_point_id BIGINT UNSIGNED NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(pickup_point_id) REFERENCES tour_pickup_points(id) ON DELETE SET NULL,
  INDEX idx_broadcast_trip(trip_operation_id, sent_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trip_broadcast_recipients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_broadcast_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  booking_id BIGINT UNSIGNED NOT NULL,
  delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'sent',
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(trip_broadcast_id) REFERENCES trip_broadcasts(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  UNIQUE KEY uk_broadcast_booking(trip_broadcast_id, booking_id)
) ENGINE=InnoDB;

-- 7) Báo cáo sau tour
CREATE TABLE IF NOT EXISTS trip_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_operation_id BIGINT UNSIGNED NOT NULL UNIQUE,
  guide_id BIGINT UNSIGNED NOT NULL,
  actual_guest_count INT UNSIGNED NOT NULL DEFAULT 0,
  absent_guest_count INT UNSIGNED NOT NULL DEFAULT 0,
  vehicle_rating TINYINT UNSIGNED NULL,
  hotel_rating TINYINT UNSIGNED NULL,
  restaurant_rating TINYINT UNSIGNED NULL,
  itinerary_rating TINYINT UNSIGNED NULL,
  summary TEXT NOT NULL,
  incidents_summary TEXT NULL,
  extra_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  extra_cost_note TEXT NULL,
  recommendations TEXT NULL,
  status ENUM('draft','submitted','reviewed') NOT NULL DEFAULT 'submitted',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  admin_note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
  FOREIGN KEY(guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 8) Hồ sơ năng lực HDV
CREATE TABLE IF NOT EXISTS guide_competencies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guide_id BIGINT UNSIGNED NOT NULL,
  competency_type ENUM('language','route','skill','certificate') NOT NULL,
  name VARCHAR(180) NOT NULL,
  level VARCHAR(50) NULL,
  certificate_no VARCHAR(100) NULL,
  issued_by VARCHAR(180) NULL,
  issued_date DATE NULL,
  expiry_date DATE NULL,
  document_url VARCHAR(500) NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  FOREIGN KEY(verified_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_guide_competency(guide_id, competency_type)
) ENGINE=InnoDB;

-- Khởi tạo chuyến vận hành cho các lịch đã có booking hợp lệ
INSERT INTO trip_operations(departure_id, guide_id, operation_status, emergency_phone, created_by)
SELECT DISTINCT b.departure_id,
       (SELECT ga.guide_id FROM guide_assignments ga WHERE ga.booking_id=b.id ORDER BY ga.id LIMIT 1),
       CASE td.status WHEN 'completed' THEN 'completed' WHEN 'departed' THEN 'in_progress' ELSE 'preparing' END,
       '1900 6868', 1
FROM bookings b
JOIN tour_departures td ON td.id=b.departure_id
WHERE b.booking_status IN ('confirmed','completed','waiting_confirmation')
ON DUPLICATE KEY UPDATE updated_at=CURRENT_TIMESTAMP;

-- Tạo trạng thái check-in ban đầu cho toàn bộ khách thuộc đoàn
INSERT IGNORE INTO passenger_checkins(trip_operation_id, booking_guest_id, status)
SELECT op.id, bg.id, 'pending'
FROM trip_operations op
JOIN bookings b ON b.departure_id=op.departure_id
JOIN booking_guests bg ON bg.booking_id=b.id
WHERE b.booking_status IN ('confirmed','completed','waiting_confirmation');

ALTER TABLE guides
MODIFY COLUMN identity_number VARCHAR(30) NULL;

ALTER TABLE guides
ADD UNIQUE KEY uk_guides_identity_number(identity_number);

ALTER TABLE notifications
MODIFY COLUMN target_role ENUM('all','admin','user','guide')
NOT NULL DEFAULT 'user';

USE travela_full_mvc;

ALTER TABLE users
  ADD COLUMN dietary_notes TEXT NULL AFTER birth_date,
  ADD COLUMN health_notes TEXT NULL AFTER dietary_notes;
  
  
SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE users
  ADD COLUMN password_changed_at DATETIME NULL,
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME NULL,
  ADD COLUMN last_login_at DATETIME NULL,
  ADD COLUMN last_login_ip VARCHAR(50) NULL;

ALTER TABLE booking_guests
  ADD COLUMN saved_traveler_id BIGINT UNSIGNED NULL,
  ADD COLUMN nationality VARCHAR(80) NULL,
  ADD COLUMN phone VARCHAR(20) NULL,
  ADD COLUMN dietary_notes VARCHAR(500) NULL,
  ADD COLUMN health_notes VARCHAR(500) NULL,
  ADD COLUMN allergy_notes VARCHAR(500) NULL,
  ADD COLUMN emergency_contact_name VARCHAR(150) NULL,
  ADD COLUMN emergency_contact_phone VARCHAR(20) NULL;

CREATE TABLE IF NOT EXISTS trip_checklist_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_operation_id BIGINT UNSIGNED NOT NULL,
 category VARCHAR(50) NOT NULL, title VARCHAR(220) NOT NULL, description TEXT NULL,
 is_required BOOLEAN NOT NULL DEFAULT TRUE, status VARCHAR(30) NOT NULL DEFAULT 'pending', due_at DATETIME NULL,
 completed_by BIGINT UNSIGNED NULL, completed_at DATETIME NULL, note TEXT NULL, display_order INT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_trip_checklist_status(trip_operation_id,status),
 CONSTRAINT fk_checklist_operation FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
 CONSTRAINT fk_checklist_user FOREIGN KEY(completed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, supplier_code VARCHAR(50) NOT NULL UNIQUE, name VARCHAR(220) NOT NULL,
 supplier_type VARCHAR(50) NOT NULL, tax_code VARCHAR(30) NULL UNIQUE, representative VARCHAR(150) NULL,
 phone VARCHAR(20) NULL, email VARCHAR(150) NULL, address VARCHAR(500) NULL, province VARCHAR(100) NULL,
 bank_account VARCHAR(100) NULL, bank_name VARCHAR(150) NULL, rating DECIMAL(3,2) NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'active', note TEXT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_supplier_type_status(supplier_type,status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS supplier_contacts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, supplier_id BIGINT UNSIGNED NOT NULL, full_name VARCHAR(150) NOT NULL,
 position VARCHAR(100) NULL, phone VARCHAR(20) NULL, email VARCHAR(150) NULL, is_primary BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_supplier_contact(supplier_id),
 CONSTRAINT fk_supplier_contact FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS supplier_services (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, supplier_id BIGINT UNSIGNED NOT NULL, service_code VARCHAR(50) NULL,
 name VARCHAR(220) NOT NULL, service_type VARCHAR(80) NOT NULL, unit VARCHAR(50) NULL, unit_price DECIMAL(12,2) NULL,
 description TEXT NULL, status VARCHAR(30) NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_supplier_service(supplier_id,service_type),
 CONSTRAINT fk_supplier_service FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS supplier_contracts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, supplier_id BIGINT UNSIGNED NOT NULL, contract_code VARCHAR(80) NOT NULL UNIQUE,
 title VARCHAR(220) NOT NULL, start_date DATE NOT NULL, end_date DATE NULL, file_url VARCHAR(500) NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'active', note TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_supplier_contract(supplier_id,status),
 CONSTRAINT fk_supplier_contract FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS trip_supplier_bookings (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_operation_id BIGINT UNSIGNED NOT NULL, supplier_id BIGINT UNSIGNED NOT NULL,
 supplier_service_id BIGINT UNSIGNED NULL, service_date DATETIME NULL, quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
 unit_price DECIMAL(12,2) NOT NULL DEFAULT 0, total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
 status VARCHAR(30) NOT NULL DEFAULT 'pending', confirmation_code VARCHAR(100) NULL, contact_name VARCHAR(150) NULL,
 contact_phone VARCHAR(20) NULL, note TEXT NULL, confirmed_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_trip_supplier_status(trip_operation_id,status), KEY idx_supplier_date(supplier_id,service_date),
 CONSTRAINT fk_trip_supplier_operation FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
 CONSTRAINT fk_trip_supplier FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
 CONSTRAINT fk_trip_supplier_service FOREIGN KEY(supplier_service_id) REFERENCES supplier_services(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS departure_change_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, request_code VARCHAR(50) NOT NULL UNIQUE, booking_id BIGINT UNSIGNED NOT NULL,
 requested_by BIGINT UNSIGNED NOT NULL, old_departure_id BIGINT UNSIGNED NOT NULL, new_departure_id BIGINT UNSIGNED NOT NULL,
 reason TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', old_amount DECIMAL(12,2) NOT NULL,
 new_amount DECIMAL(12,2) NULL, price_difference DECIMAL(12,2) NULL, admin_note TEXT NULL,
 reviewed_by BIGINT UNSIGNED NULL, reviewed_at DATETIME NULL, completed_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_departure_change_booking(booking_id,status), KEY idx_departure_change_new(new_departure_id,status),
 CONSTRAINT fk_dc_booking FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
 CONSTRAINT fk_dc_requester FOREIGN KEY(requested_by) REFERENCES users(id),
 CONSTRAINT fk_dc_old FOREIGN KEY(old_departure_id) REFERENCES tour_departures(id),
 CONSTRAINT fk_dc_new FOREIGN KEY(new_departure_id) REFERENCES tour_departures(id),
 CONSTRAINT fk_dc_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS electronic_tickets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ticket_code VARCHAR(60) NOT NULL UNIQUE, booking_id BIGINT UNSIGNED NOT NULL,
 booking_guest_id BIGINT UNSIGNED NOT NULL, departure_id BIGINT UNSIGNED NOT NULL, qr_token_hash VARCHAR(64) NOT NULL UNIQUE,
 status VARCHAR(30) NOT NULL DEFAULT 'active', issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NULL,
 checked_in_at DATETIME NULL, cancelled_at DATETIME NULL, cancellation_reason TEXT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_guest_departure_ticket(booking_guest_id,departure_id), KEY idx_ticket_booking(booking_id,status),
 CONSTRAINT fk_ticket_booking FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
 CONSTRAINT fk_ticket_guest FOREIGN KEY(booking_guest_id) REFERENCES booking_guests(id) ON DELETE CASCADE,
 CONSTRAINT fk_ticket_departure FOREIGN KEY(departure_id) REFERENCES tour_departures(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ticket_scan_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ticket_id BIGINT UNSIGNED NOT NULL, trip_operation_id BIGINT UNSIGNED NULL,
 scanned_by BIGINT UNSIGNED NULL, scan_result VARCHAR(30) NOT NULL, scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 device_info VARCHAR(255) NULL, ip_address VARCHAR(50) NULL, note VARCHAR(500) NULL,
 KEY idx_ticket_scan(ticket_id,scanned_at), CONSTRAINT fk_scan_ticket FOREIGN KEY(ticket_id) REFERENCES electronic_tickets(id) ON DELETE CASCADE,
 CONSTRAINT fk_scan_operation FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE SET NULL,
 CONSTRAINT fk_scan_user FOREIGN KEY(scanned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trip_itinerary_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_operation_id BIGINT UNSIGNED NOT NULL,
 source_itinerary_item_id BIGINT UNSIGNED NULL, day_number SMALLINT UNSIGNED NOT NULL, item_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
 planned_start_at DATETIME NULL, planned_end_at DATETIME NULL, actual_start_at DATETIME NULL, actual_end_at DATETIME NULL,
 title VARCHAR(220) NOT NULL, description TEXT NULL, location_name VARCHAR(255) NULL, status VARCHAR(30) NOT NULL DEFAULT 'planned',
 change_reason TEXT NULL, updated_by BIGINT UNSIGNED NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uk_trip_itinerary_order(trip_operation_id,day_number,item_order), KEY idx_trip_itinerary_status(trip_operation_id,status),
 CONSTRAINT fk_trip_itinerary_operation FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
 CONSTRAINT fk_trip_itinerary_source FOREIGN KEY(source_itinerary_item_id) REFERENCES tour_itinerary(id) ON DELETE SET NULL,
 CONSTRAINT fk_trip_itinerary_user FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS itinerary_change_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_operation_id BIGINT UNSIGNED NOT NULL, itinerary_item_id BIGINT UNSIGNED NULL,
 requested_by BIGINT UNSIGNED NOT NULL, change_type VARCHAR(30) NOT NULL, old_data JSON NULL, proposed_data JSON NOT NULL,
 reason TEXT NOT NULL, is_emergency BOOLEAN NOT NULL DEFAULT FALSE, status VARCHAR(30) NOT NULL DEFAULT 'pending',
 reviewed_by BIGINT UNSIGNED NULL, reviewed_at DATETIME NULL, admin_note TEXT NULL, applied_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_itinerary_change(trip_operation_id,status),
 CONSTRAINT fk_ic_operation FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
 CONSTRAINT fk_ic_item FOREIGN KEY(itinerary_item_id) REFERENCES trip_itinerary_items(id) ON DELETE SET NULL,
 CONSTRAINT fk_ic_requester FOREIGN KEY(requested_by) REFERENCES users(id),
 CONSTRAINT fk_ic_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trip_documents (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_operation_id BIGINT UNSIGNED NOT NULL, document_type VARCHAR(50) NOT NULL,
 title VARCHAR(220) NOT NULL, description TEXT NULL, file_name VARCHAR(255) NOT NULL, file_url VARCHAR(500) NOT NULL,
 mime_type VARCHAR(100) NULL, file_size INT UNSIGNED NULL, visibility VARCHAR(30) NOT NULL DEFAULT 'admin_guide', version INT NOT NULL DEFAULT 1,
 uploaded_by BIGINT UNSIGNED NULL, uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_trip_document(trip_operation_id,document_type),
 CONSTRAINT fk_document_operation FOREIGN KEY(trip_operation_id) REFERENCES trip_operations(id) ON DELETE CASCADE,
 CONSTRAINT fk_document_user FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS guide_availabilities (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, guide_id BIGINT UNSIGNED NOT NULL, availability_type VARCHAR(30) NOT NULL,
 start_at DATETIME NOT NULL, end_at DATETIME NOT NULL, all_day BOOLEAN NOT NULL DEFAULT TRUE, reason VARCHAR(500) NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'active', created_by BIGINT UNSIGNED NULL, approved_by BIGINT UNSIGNED NULL,
 approved_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_guide_availability(guide_id,start_at,end_at),
 CONSTRAINT fk_availability_guide FOREIGN KEY(guide_id) REFERENCES guides(id) ON DELETE CASCADE,
 CONSTRAINT fk_availability_creator FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
 CONSTRAINT fk_availability_approver FOREIGN KEY(approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_sessions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, session_id VARCHAR(64) NOT NULL UNIQUE, user_id BIGINT UNSIGNED NOT NULL,
 refresh_token_hash VARCHAR(64) NOT NULL UNIQUE, device_name VARCHAR(150) NULL, device_type VARCHAR(50) NULL,
 browser VARCHAR(100) NULL, operating_system VARCHAR(100) NULL, ip_address VARCHAR(50) NULL, user_agent VARCHAR(500) NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'active', last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at DATETIME NOT NULL, revoked_at DATETIME NULL, revoke_reason VARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_session_user(user_id,status), KEY idx_session_expiry(expires_at),
 CONSTRAINT fk_session_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS password_histories (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, password_hash VARCHAR(255) NOT NULL,
 changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, changed_by BIGINT UNSIGNED NULL, change_reason VARCHAR(100) NULL,
 KEY idx_password_history(user_id,changed_at), CONSTRAINT fk_password_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 CONSTRAINT fk_password_changer FOREIGN KEY(changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS operational_alerts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, alert_code VARCHAR(50) NOT NULL UNIQUE, alert_type VARCHAR(80) NOT NULL,
 severity VARCHAR(20) NOT NULL DEFAULT 'warning', trip_operation_id BIGINT UNSIGNED NULL, departure_id BIGINT UNSIGNED NULL,
 booking_id BIGINT UNSIGNED NULL, guide_id BIGINT UNSIGNED NULL, title VARCHAR(220) NOT NULL, message TEXT NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'open', detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, due_at DATETIME NULL,
 assigned_to BIGINT UNSIGNED NULL, acknowledged_by BIGINT UNSIGNED NULL, acknowledged_at DATETIME NULL,
 resolved_by BIGINT UNSIGNED NULL, resolved_at DATETIME NULL, resolution_note TEXT NULL, deduplication_key VARCHAR(255) NULL,
 metadata JSON NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_alert_status(status,severity), KEY idx_alert_departure(departure_id,status), KEY idx_alert_assignee(assigned_to,status), KEY idx_alert_dedupe(deduplication_key)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS operational_alert_rules (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, alert_type VARCHAR(80) NOT NULL UNIQUE, enabled BOOLEAN NOT NULL DEFAULT TRUE,
 threshold_value DECIMAL(12,2) NULL, threshold_unit VARCHAR(30) NULL, check_interval INT NOT NULL DEFAULT 60, config JSON NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS incident_attachments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, incident_ticket_id BIGINT UNSIGNED NOT NULL, uploaded_by BIGINT UNSIGNED NULL,
 file_name VARCHAR(255) NOT NULL, file_url VARCHAR(500) NOT NULL, mime_type VARCHAR(100) NULL, file_size INT UNSIGNED NULL,
 attachment_type VARCHAR(50) NOT NULL DEFAULT 'evidence', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_incident_attachment(incident_ticket_id), CONSTRAINT fk_incident_attachment FOREIGN KEY(incident_ticket_id) REFERENCES incident_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS incident_status_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, incident_ticket_id BIGINT UNSIGNED NOT NULL, old_status VARCHAR(30) NULL,
 new_status VARCHAR(30) NOT NULL, changed_by BIGINT UNSIGNED NULL, reason TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_incident_status_log(incident_ticket_id,created_at),
 CONSTRAINT fk_incident_status_ticket FOREIGN KEY(incident_ticket_id) REFERENCES incident_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS trip_report_expenses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, trip_report_id BIGINT UNSIGNED NOT NULL, expense_type VARCHAR(50) NOT NULL,
 description VARCHAR(500) NOT NULL, amount DECIMAL(12,2) NOT NULL, receipt_url VARCHAR(500) NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending', reviewed_by BIGINT UNSIGNED NULL, reviewed_at DATETIME NULL,
 review_note TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_report_expense(trip_report_id,status), CONSTRAINT fk_report_expense FOREIGN KEY(trip_report_id) REFERENCES trip_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_user_id BIGINT UNSIGNED NULL, action VARCHAR(100) NOT NULL,
 entity_type VARCHAR(80) NOT NULL, entity_id VARCHAR(80) NULL, old_data JSON NULL, new_data JSON NULL,
 ip_address VARCHAR(50) NULL, user_agent VARCHAR(500) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_audit_entity(entity_type,entity_id), KEY idx_audit_actor(actor_user_id,created_at)
) ENGINE=InnoDB;

INSERT IGNORE INTO operational_alert_rules(alert_type,threshold_value,threshold_unit,config) VALUES
('guide_not_assigned',3,'days',JSON_OBJECT('severity','high')),
('guide_not_accepted',2,'days',JSON_OBJECT('severity','warning')),
('low_guest_count',10,'passengers',JSON_OBJECT('severity','warning')),
('unpaid_booking',24,'hours',JSON_OBJECT('severity','warning')),
('refund_overdue',48,'hours',JSON_OBJECT('severity','high')),
('notification_not_sent',24,'hours',JSON_OBJECT('severity','warning'));

SET FOREIGN_KEY_CHECKS=1;

-- Chạy một lần nếu dữ liệu seed cũ có tên dạng:
-- "Nguyễn Văn A - Khách đi cùng 301"
-- Câu lệnh chỉ xóa phần hậu tố seed, không xóa tên thật.
SET SQL_SAFE_UPDATES = 0;
UPDATE booking_guests
SET full_name = TRIM(SUBSTRING_INDEX(full_name, ' - Khách đi cùng', 1))
WHERE full_name LIKE '% - Khách đi cùng%';

UPDATE booking_guests
SET full_name = TRIM(SUBSTRING_INDEX(full_name, ' - Người lớn', 1))
WHERE full_name REGEXP ' - Người lớn [0-9]+$';

UPDATE booking_guests
SET full_name = TRIM(SUBSTRING_INDEX(full_name, ' - Trẻ em', 1))
WHERE full_name REGEXP ' - Trẻ em [0-9]+$';

SELECT id, booking_id, full_name, guest_type
FROM booking_guests
ORDER BY booking_id, id
LIMIT 200;


SELECT
  a.guide_id,
  g.full_name,
  a.id AS assignment_1,
  b.id AS assignment_2,
  ta.name AS tour_1,
  tb.name AS tour_2,
  a.start_date AS start_1,
  a.end_date AS end_1,
  b.start_date AS start_2,
  b.end_date AS end_2
FROM guide_assignments a
JOIN guide_assignments b
  ON b.guide_id = a.guide_id
 AND b.id > a.id
 AND a.start_date <= b.end_date
 AND a.end_date >= b.start_date
JOIN guides g ON g.id = a.guide_id
JOIN tours ta ON ta.id = a.tour_id
JOIN tours tb ON tb.id = b.tour_id
WHERE a.status NOT IN ('cancelled', 'rejected')
  AND b.status NOT IN ('cancelled', 'rejected')
ORDER BY a.guide_id, a.start_date;


SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- PHẦN 1 - SAO LƯU DỮ LIỆU CŨ
-- =====================================================================

DROP TABLE IF EXISTS guide_assignments_backup_before_reseed;
CREATE TABLE guide_assignments_backup_before_reseed AS
SELECT * FROM guide_assignments;

DROP TABLE IF EXISTS trip_operations_backup_before_reseed;
CREATE TABLE trip_operations_backup_before_reseed AS
SELECT * FROM trip_operations;

-- Bảng ghi nhận các lịch khởi hành chưa tìm được HDV rảnh.
CREATE TABLE IF NOT EXISTS guide_assignment_seed_warnings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    departure_id BIGINT UNSIGNED NOT NULL,
    tour_id BIGINT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    warning_message VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_seed_warning_departure (departure_id),
    KEY idx_seed_warning_date (start_date, end_date)
) ENGINE=InnoDB;

TRUNCATE TABLE guide_assignment_seed_warnings;

-- Đảm bảo bảng lịch bận tồn tại.
CREATE TABLE IF NOT EXISTS guide_availabilities (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guide_id BIGINT UNSIGNED NOT NULL,
    availability_type ENUM(
        'available',
        'unavailable',
        'leave',
        'training',
        'personal'
    ) NOT NULL DEFAULT 'unavailable',
    start_at DATETIME NOT NULL,
    end_at DATETIME NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT TRUE,
    reason VARCHAR(500) NULL,
    status ENUM('pending','active','rejected','cancelled')
        NOT NULL DEFAULT 'active',
    created_by BIGINT UNSIGNED NULL,
    approved_by BIGINT UNSIGNED NULL,
    approved_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_guide_availability_guide
        FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE,
    KEY idx_guide_availability_range (guide_id, start_at, end_at),
    KEY idx_guide_availability_status (status, availability_type)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- PHẦN 2 - LÀM SẠCH TÊN HÀNH KHÁCH SEED
-- =====================================================================

UPDATE booking_guests
SET full_name = TRIM(SUBSTRING_INDEX(full_name, ' - Khách đi cùng', 1))
WHERE full_name LIKE '% - Khách đi cùng%';

UPDATE booking_guests
SET full_name = TRIM(SUBSTRING_INDEX(full_name, ' - Người lớn', 1))
WHERE full_name LIKE '% - Người lớn%';

UPDATE booking_guests
SET full_name = TRIM(SUBSTRING_INDEX(full_name, ' - Trẻ em', 1))
WHERE full_name LIKE '% - Trẻ em%';

-- Nếu nhiều khách cùng booking bị trùng tên sau khi làm sạch,
-- thêm hậu tố thứ tự để dễ phân biệt nhưng không dùng mã booking.
DROP TEMPORARY TABLE IF EXISTS tmp_guest_name_order;
CREATE TEMPORARY TABLE tmp_guest_name_order AS
SELECT
    id,
    booking_id,
    full_name,
    ROW_NUMBER() OVER (
        PARTITION BY booking_id, full_name
        ORDER BY id
    ) AS rn,
    COUNT(*) OVER (
        PARTITION BY booking_id, full_name
    ) AS total_same_name
FROM booking_guests;

UPDATE booking_guests bg
JOIN tmp_guest_name_order x ON x.id = bg.id
SET bg.full_name = CASE
    WHEN x.total_same_name > 1
        THEN CONCAT(x.full_name, ' ', x.rn)
    ELSE x.full_name
END;

DROP TEMPORARY TABLE IF EXISTS tmp_guest_name_order;

-- =====================================================================
-- PHẦN 3 - XÓA PHÂN CÔNG SEED CŨ
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM guide_assignments;

-- Không xóa trip_operations để giữ nhật ký/sự cố cũ.
-- Chỉ đưa guide_id về NULL trước khi đồng bộ lại.
UPDATE trip_operations
SET guide_id = NULL,
    updated_at = NOW();

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- PHẦN 4 - TẠO DANH SÁCH LỊCH KHỞI HÀNH CẦN PHÂN CÔNG
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS tmp_departures_to_assign;

CREATE TEMPORARY TABLE tmp_departures_to_assign (
    row_num INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    departure_id BIGINT UNSIGNED NOT NULL,
    booking_id BIGINT UNSIGNED NOT NULL,
    tour_id BIGINT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    passenger_count INT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uk_tmp_departure (departure_id)
) ENGINE=InnoDB;

-- Chỉ lấy booking đã xác nhận hoặc hoàn thành.
-- Mỗi departure lấy một booking đại diện để tương thích cấu trúc cũ
-- của guide_assignments đang có booking_id.
INSERT INTO tmp_departures_to_assign (
    departure_id,
    booking_id,
    tour_id,
    start_date,
    end_date,
    passenger_count
)
SELECT
    b.departure_id,
    MIN(b.id) AS representative_booking_id,
    b.tour_id,
    td.departure_date,
    td.end_date,
    SUM(b.adult_count + b.child_count) AS passenger_count
FROM bookings b
JOIN tour_departures td
    ON td.id = b.departure_id
WHERE b.booking_status IN ('confirmed', 'completed')
  AND td.status NOT IN ('cancelled')
GROUP BY
    b.departure_id,
    b.tour_id,
    td.departure_date,
    td.end_date
ORDER BY
    td.departure_date,
    td.end_date,
    b.departure_id;

-- =====================================================================
-- PHẦN 5 - PROCEDURE TỰ ĐỘNG CHỌN HDV RẢNH
-- =====================================================================

DROP PROCEDURE IF EXISTS reseed_guide_assignments_no_overlap;

DELIMITER $$

CREATE PROCEDURE reseed_guide_assignments_no_overlap()
BEGIN
    DECLARE v_done INT DEFAULT 0;

    DECLARE v_departure_id BIGINT UNSIGNED;
    DECLARE v_booking_id BIGINT UNSIGNED;
    DECLARE v_tour_id BIGINT UNSIGNED;
    DECLARE v_start_date DATE;
    DECLARE v_end_date DATE;
    DECLARE v_passenger_count INT UNSIGNED;

    DECLARE v_selected_guide_id BIGINT UNSIGNED DEFAULT NULL;
    DECLARE v_assignment_status VARCHAR(30);

    DECLARE departure_cursor CURSOR FOR
        SELECT
            departure_id,
            booking_id,
            tour_id,
            start_date,
            end_date,
            passenger_count
        FROM tmp_departures_to_assign
        ORDER BY start_date, end_date, departure_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN departure_cursor;

    departure_loop: LOOP
        FETCH departure_cursor INTO
            v_departure_id,
            v_booking_id,
            v_tour_id,
            v_start_date,
            v_end_date,
            v_passenger_count;

        IF v_done = 1 THEN
            LEAVE departure_loop;
        END IF;

        SET v_selected_guide_id = NULL;

        -- Chọn HDV active có ít phân công nhất và không bị giao lịch.
        SET v_selected_guide_id = (
            SELECT g.id
            FROM guides g
            WHERE g.status = 'active'

              -- Không giao với assignment đã tạo trong lần reseed này.
              AND NOT EXISTS (
                  SELECT 1
                  FROM guide_assignments ga
                  WHERE ga.guide_id = g.id
                    AND ga.status NOT IN (
                        'cancelled',
                        'rejected',
                        'completed'
                    )
                    AND ga.start_date <= v_end_date
                    AND ga.end_date >= v_start_date
              )

              -- Không giao với lịch bận cá nhân.
              AND NOT EXISTS (
                  SELECT 1
                  FROM guide_availabilities gav
                  WHERE gav.guide_id = g.id
                    AND gav.status = 'active'
                    AND gav.availability_type IN (
                        'unavailable',
                        'leave',
                        'training',
                        'personal'
                    )
                    AND DATE(gav.start_at) <= v_end_date
                    AND DATE(gav.end_at) >= v_start_date
              )

            ORDER BY
                (
                    SELECT COUNT(*)
                    FROM guide_assignments ga_count
                    WHERE ga_count.guide_id = g.id
                ) ASC,
                g.experience_years DESC,
                g.id ASC
            LIMIT 1
        );

        IF v_selected_guide_id IS NULL THEN
            INSERT INTO guide_assignment_seed_warnings (
                departure_id,
                tour_id,
                start_date,
                end_date,
                warning_message
            )
            VALUES (
                v_departure_id,
                v_tour_id,
                v_start_date,
                v_end_date,
                CONCAT(
                    'Không tìm thấy HDV rảnh cho lịch khởi hành #',
                    v_departure_id,
                    ' từ ',
                    DATE_FORMAT(v_start_date, '%d/%m/%Y'),
                    ' đến ',
                    DATE_FORMAT(v_end_date, '%d/%m/%Y')
                )
            );
        ELSE
            SET v_assignment_status = CASE
                WHEN v_end_date < CURDATE() THEN 'completed'
                WHEN v_start_date <= CURDATE()
                 AND v_end_date >= CURDATE() THEN 'in_progress'
                ELSE 'assigned'
            END;

            INSERT INTO guide_assignments (
                guide_id,
                booking_id,
                tour_id,
                start_date,
                end_date,
                status,
                note,
                created_at,
                updated_at
            )
            VALUES (
                v_selected_guide_id,
                v_booking_id,
                v_tour_id,
                v_start_date,
                v_end_date,
                v_assignment_status,
                CONCAT(
                    'Seed lại tự động cho lịch khởi hành #',
                    v_departure_id,
                    ' - ',
                    v_passenger_count,
                    ' hành khách'
                ),
                NOW(),
                NOW()
            );
        END IF;
    END LOOP;

    CLOSE departure_cursor;
END$$

DELIMITER ;

CALL reseed_guide_assignments_no_overlap();

DROP PROCEDURE IF EXISTS reseed_guide_assignments_no_overlap;

-- =====================================================================
-- PHẦN 6 - ĐỒNG BỘ TRIP OPERATIONS
-- =====================================================================

-- Tạo TripOperation cho departure chưa có.
INSERT INTO trip_operations (
    departure_id,
    guide_id,
    operation_status,
    meeting_note,
    vehicle_info,
    emergency_phone,
    started_at,
    completed_at,
    created_by,
    created_at,
    updated_at
)
SELECT
    b.departure_id,
    ga.guide_id,
    CASE
        WHEN ga.status = 'completed' THEN 'completed'
        WHEN ga.status = 'in_progress' THEN 'in_progress'
        ELSE 'preparing'
    END AS operation_status,
    CONCAT(
        'Tập trung theo điểm đón đã chọn. HDV phụ trách: ',
        g.full_name
    ),
    'Phương tiện sẽ được điều hành xác nhận trước ngày khởi hành',
    g.phone,
    CASE
        WHEN ga.status IN ('in_progress','completed')
            THEN TIMESTAMP(ga.start_date, '06:00:00')
        ELSE NULL
    END,
    CASE
        WHEN ga.status = 'completed'
            THEN TIMESTAMP(ga.end_date, '20:00:00')
        ELSE NULL
    END,
    1,
    NOW(),
    NOW()
FROM guide_assignments ga
JOIN bookings b
    ON b.id = ga.booking_id
JOIN guides g
    ON g.id = ga.guide_id
LEFT JOIN trip_operations op
    ON op.departure_id = b.departure_id
WHERE op.id IS NULL;

-- Đồng bộ Guide và trạng thái cho TripOperation đã tồn tại.
UPDATE trip_operations op
JOIN (
    SELECT
        b.departure_id,
        ga.guide_id,
        ga.status
    FROM guide_assignments ga
    JOIN bookings b ON b.id = ga.booking_id
) x ON x.departure_id = op.departure_id
SET
    op.guide_id = x.guide_id,
    op.operation_status = CASE
        WHEN x.status = 'completed' THEN 'completed'
        WHEN x.status = 'in_progress' THEN 'in_progress'
        ELSE 'preparing'
    END,
    op.updated_at = NOW();

-- =====================================================================
-- PHẦN 7 - TẠO DANH SÁCH ĐIỂM DANH
-- =====================================================================

-- Tạo check-in cho mọi hành khách thuộc cùng departure của operation.
INSERT IGNORE INTO passenger_checkins (
    trip_operation_id,
    booking_guest_id,
    status,
    checked_in_at,
    checked_in_by,
    note,
    created_at,
    updated_at
)
SELECT
    op.id,
    bg.id,
    CASE
        WHEN op.operation_status = 'completed' THEN 'present'
        ELSE 'pending'
    END,
    CASE
        WHEN op.operation_status = 'completed'
            THEN TIMESTAMP(td.departure_date, '05:45:00')
        ELSE NULL
    END,
    NULL,
    CASE
        WHEN op.operation_status = 'completed'
            THEN 'Dữ liệu điểm danh seed cho chuyến đã hoàn thành'
        ELSE NULL
    END,
    NOW(),
    NOW()
FROM trip_operations op
JOIN tour_departures td
    ON td.id = op.departure_id
JOIN bookings b
    ON b.departure_id = td.id
   AND b.booking_status IN ('confirmed', 'completed')
JOIN booking_guests bg
    ON bg.booking_id = b.id;

-- Xóa check-in không còn thuộc departure của operation.
DELETE pc
FROM passenger_checkins pc
JOIN trip_operations op
    ON op.id = pc.trip_operation_id
JOIN booking_guests bg
    ON bg.id = pc.booking_guest_id
JOIN bookings b
    ON b.id = bg.booking_id
WHERE b.departure_id <> op.departure_id;

-- =====================================================================
-- PHẦN 8 - TẠO LỊCH BẬN MẪU KHÔNG XUNG ĐỘT
-- =====================================================================

-- Chỉ xóa lịch bận do script seed trước đó tạo.
DELETE FROM guide_availabilities
WHERE reason LIKE '[SEED] %';

-- Mỗi HDV có một ngày nghỉ mẫu sau lịch phân công cuối cùng 3-4 ngày.
INSERT INTO guide_availabilities (
    guide_id,
    availability_type,
    start_at,
    end_at,
    all_day,
    reason,
    status,
    created_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
)
SELECT
    g.id,
    CASE g.id % 3
        WHEN 0 THEN 'leave'
        WHEN 1 THEN 'personal'
        ELSE 'training'
    END,
    TIMESTAMP(
        DATE_ADD(
            COALESCE(MAX(ga.end_date), CURDATE()),
            INTERVAL 3 + (g.id % 2) DAY
        ),
        '00:00:00'
    ),
    TIMESTAMP(
        DATE_ADD(
            COALESCE(MAX(ga.end_date), CURDATE()),
            INTERVAL 3 + (g.id % 2) DAY
        ),
        '23:59:59'
    ),
    TRUE,
    CASE g.id % 3
        WHEN 0 THEN '[SEED] Nghỉ phép cá nhân'
        WHEN 1 THEN '[SEED] Có việc cá nhân'
        ELSE '[SEED] Tham gia đào tạo nghiệp vụ'
    END,
    'active',
    g.user_id,
    1,
    NOW(),
    NOW(),
    NOW()
FROM guides g
LEFT JOIN guide_assignments ga
    ON ga.guide_id = g.id
WHERE g.status = 'active'
GROUP BY
    g.id,
    g.user_id;

-- =====================================================================
-- PHẦN 9 - CẬP NHẬT SLOT DEPARTURE TỪ BOOKING
-- =====================================================================

UPDATE tour_departures td
LEFT JOIN (
    SELECT
        departure_id,
        SUM(
            CASE
                WHEN booking_status IN (
                    'confirmed',
                    'completed',
                    'waiting_confirmation'
                )
                THEN adult_count + child_count
                ELSE 0
            END
        ) AS booked,
        SUM(
            CASE
                WHEN booking_status = 'pending_payment'
                THEN adult_count + child_count
                ELSE 0
            END
        ) AS held
    FROM bookings
    GROUP BY departure_id
) x ON x.departure_id = td.id
SET
    td.booked_slots = LEAST(
        COALESCE(x.booked, 0),
        td.total_slots
    ),
    td.held_slots = LEAST(
        COALESCE(x.held, 0),
        GREATEST(
            td.total_slots
            - LEAST(COALESCE(x.booked, 0), td.total_slots),
            0
        )
    );

-- =====================================================================
-- PHẦN 10 - KIỂM TRA KẾT QUẢ
-- =====================================================================

-- 10.1. Số lượng phân công đã tạo.
SELECT
    COUNT(*) AS total_assignments_after_reseed
FROM guide_assignments;

-- 10.2. Các departure chưa tìm được HDV.
SELECT
    *
FROM guide_assignment_seed_warnings
ORDER BY start_date, departure_id;

-- 10.3. Kiểm tra một departure có nhiều assignment hay không.
SELECT
    b.departure_id,
    COUNT(*) AS assignment_count
FROM guide_assignments ga
JOIN bookings b ON b.id = ga.booking_id
GROUP BY b.departure_id
HAVING COUNT(*) > 1;

-- Kết quả đúng: 0 dòng.

-- 10.4. Kiểm tra Guide bị trùng lịch.
SELECT
    a.guide_id,
    g.full_name,
    a.id AS assignment_1,
    b.id AS assignment_2,
    ta.name AS tour_1,
    tb.name AS tour_2,
    a.start_date AS start_1,
    a.end_date AS end_1,
    b.start_date AS start_2,
    b.end_date AS end_2
FROM guide_assignments a
JOIN guide_assignments b
    ON b.guide_id = a.guide_id
   AND b.id > a.id
   AND a.start_date <= b.end_date
   AND a.end_date >= b.start_date
JOIN guides g
    ON g.id = a.guide_id
JOIN tours ta
    ON ta.id = a.tour_id
JOIN tours tb
    ON tb.id = b.tour_id
WHERE a.status NOT IN ('cancelled', 'rejected', 'completed')
  AND b.status NOT IN ('cancelled', 'rejected', 'completed')
ORDER BY
    a.guide_id,
    a.start_date;

-- Kết quả đúng: 0 dòng.

-- 10.5. Kiểm tra assignment giao với lịch bận.
SELECT
    ga.id AS assignment_id,
    ga.guide_id,
    g.full_name,
    t.name AS tour_name,
    ga.start_date,
    ga.end_date,
    gav.start_at AS busy_start,
    gav.end_at AS busy_end,
    gav.reason
FROM guide_assignments ga
JOIN guides g
    ON g.id = ga.guide_id
JOIN tours t
    ON t.id = ga.tour_id
JOIN guide_availabilities gav
    ON gav.guide_id = ga.guide_id
   AND gav.status = 'active'
   AND gav.availability_type IN (
       'unavailable',
       'leave',
       'training',
       'personal'
   )
   AND DATE(gav.start_at) <= ga.end_date
   AND DATE(gav.end_at) >= ga.start_date
WHERE ga.status NOT IN ('cancelled', 'rejected', 'completed');

-- Kết quả đúng: 0 dòng.

-- 10.6. Danh sách phân công dễ kiểm tra.
SELECT
    ga.id AS assignment_id,
    g.id AS guide_id,
    g.full_name AS guide_name,
    b.departure_id,
    t.name AS tour_name,
    ga.start_date,
    ga.end_date,
    ga.status,
    ga.note
FROM guide_assignments ga
JOIN guides g
    ON g.id = ga.guide_id
JOIN bookings b
    ON b.id = ga.booking_id
JOIN tours t
    ON t.id = ga.tour_id
ORDER BY
    ga.start_date,
    g.id;

-- 10.7. Số hành khách/check-in theo chuyến.
SELECT
    op.id AS operation_id,
    op.departure_id,
    g.full_name AS guide_name,
    COUNT(pc.id) AS passenger_count,
    SUM(pc.status = 'present') AS present_count,
    SUM(pc.status = 'late') AS late_count,
    SUM(pc.status = 'absent') AS absent_count,
    SUM(pc.status = 'pending') AS pending_count
FROM trip_operations op
LEFT JOIN guides g
    ON g.id = op.guide_id
LEFT JOIN passenger_checkins pc
    ON pc.trip_operation_id = op.id
GROUP BY
    op.id,
    op.departure_id,
    g.full_name
ORDER BY op.departure_id;

SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS seed_execution_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seed_code VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500) NULL,
    executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Không xóa dữ liệu cũ. Chỉ ghi nhận lần chạy.
INSERT INTO seed_execution_logs(seed_code, description)
VALUES (
    CONCAT('REALISTIC_OPERATIONAL_', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s')),
    'Bổ sung booking, hành khách, check-in, nhật ký, sự cố, cảnh báo và báo cáo vận hành'
);

-- =====================================================================
-- 1. CHỌN CÁC LỊCH KHỞI HÀNH ĐỂ BỔ SUNG KHÁCH
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS tmp_real_departures;

CREATE TEMPORARY TABLE tmp_real_departures (
    row_num INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    departure_id BIGINT UNSIGNED NOT NULL UNIQUE,
    tour_id BIGINT UNSIGNED NOT NULL,
    departure_date DATE NOT NULL,
    end_date DATE NOT NULL,
    adult_price DECIMAL(12,2) NOT NULL,
    child_price DECIMAL(12,2) NOT NULL,
    total_slots INT UNSIGNED NOT NULL,
    current_confirmed INT UNSIGNED NOT NULL DEFAULT 0,
    target_passengers INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

-- Chọn tối đa 18 lịch:
-- - Không bị hủy
-- - Còn chỗ
-- - Ưu tiên lịch có ít khách để màn hình điều hành nhìn thực tế hơn
INSERT INTO tmp_real_departures (
    departure_id,
    tour_id,
    departure_date,
    end_date,
    adult_price,
    child_price,
    total_slots,
    current_confirmed,
    target_passengers
)
SELECT
    td.id,
    td.tour_id,
    td.departure_date,
    td.end_date,
    td.adult_price,
    td.child_price,
    td.total_slots,
    COALESCE(x.confirmed_guests, 0),
    LEAST(
        td.total_slots - 2,
        18 + (td.id % 11)
    ) AS target_passengers
FROM tour_departures td
LEFT JOIN (
    SELECT
        b.departure_id,
        SUM(
            CASE
                WHEN b.booking_status IN ('confirmed', 'completed', 'waiting_confirmation')
                THEN b.adult_count + b.child_count
                ELSE 0
            END
        ) AS confirmed_guests
    FROM bookings b
    GROUP BY b.departure_id
) x ON x.departure_id = td.id
WHERE td.status NOT IN ('cancelled', 'full')
  AND td.total_slots >= 20
  AND COALESCE(x.confirmed_guests, 0) < LEAST(td.total_slots - 2, 18 + (td.id % 11))
ORDER BY
    ABS(DATEDIFF(td.departure_date, CURDATE())) ASC,
    COALESCE(x.confirmed_guests, 0) ASC,
    td.id ASC
LIMIT 18;

-- =====================================================================
-- 2. PROCEDURE TẠO BOOKING VÀ HÀNH KHÁCH ĐẾN ĐỦ MỤC TIÊU
-- =====================================================================

DROP PROCEDURE IF EXISTS seed_realistic_bookings;

DELIMITER $$

CREATE PROCEDURE seed_realistic_bookings()
BEGIN
    DECLARE v_done INT DEFAULT 0;

    DECLARE v_departure_id BIGINT UNSIGNED;
    DECLARE v_tour_id BIGINT UNSIGNED;
    DECLARE v_departure_date DATE;
    DECLARE v_end_date DATE;
    DECLARE v_adult_price DECIMAL(12,2);
    DECLARE v_child_price DECIMAL(12,2);
    DECLARE v_total_slots INT UNSIGNED;
    DECLARE v_current INT UNSIGNED;
    DECLARE v_target INT UNSIGNED;

    DECLARE v_booking_seq INT DEFAULT 1;
    DECLARE v_user_id BIGINT UNSIGNED;
    DECLARE v_pickup_id BIGINT UNSIGNED;
    DECLARE v_pickup_name VARCHAR(180);
    DECLARE v_pickup_address VARCHAR(255);
    DECLARE v_pickup_time TIME;
    DECLARE v_pickup_note TEXT;

    DECLARE v_adult_count INT;
    DECLARE v_child_count INT;
    DECLARE v_group_size INT;
    DECLARE v_original_amount DECIMAL(12,2);
    DECLARE v_discount_amount DECIMAL(12,2);
    DECLARE v_final_amount DECIMAL(12,2);
    DECLARE v_booking_status VARCHAR(30);
    DECLARE v_booking_code VARCHAR(50);
    DECLARE v_booking_id BIGINT UNSIGNED;
    DECLARE v_guest_index INT;
    DECLARE v_full_name VARCHAR(150);
    DECLARE v_contact_name VARCHAR(150);
    DECLARE v_contact_email VARCHAR(150);
    DECLARE v_contact_phone VARCHAR(20);

    DECLARE dep_cursor CURSOR FOR
        SELECT
            departure_id,
            tour_id,
            departure_date,
            end_date,
            adult_price,
            child_price,
            total_slots,
            current_confirmed,
            target_passengers
        FROM tmp_real_departures
        ORDER BY departure_date, departure_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN dep_cursor;

    dep_loop: LOOP
        FETCH dep_cursor INTO
            v_departure_id,
            v_tour_id,
            v_departure_date,
            v_end_date,
            v_adult_price,
            v_child_price,
            v_total_slots,
            v_current,
            v_target;

        IF v_done = 1 THEN
            LEAVE dep_loop;
        END IF;

        SET v_booking_seq = 1;

        booking_loop: WHILE v_current < v_target DO

            -- Nhóm 2-4 người, nhưng không vượt mục tiêu/capacity.
            SET v_group_size = 2 + ((v_departure_id + v_booking_seq) % 3);

            IF v_current + v_group_size > v_target THEN
                SET v_group_size = v_target - v_current;
            END IF;

            IF v_current + v_group_size > v_total_slots THEN
                SET v_group_size = v_total_slots - v_current;
            END IF;

            IF v_group_size <= 0 THEN
                LEAVE booking_loop;
            END IF;

            SET v_child_count =
                CASE
                    WHEN v_group_size >= 3 AND MOD(v_departure_id + v_booking_seq, 3) = 0 THEN 1
                    WHEN v_group_size = 4 AND MOD(v_departure_id + v_booking_seq, 5) = 0 THEN 2
                    ELSE 0
                END;

            SET v_adult_count = v_group_size - v_child_count;

            -- Chọn user thật đang active, xoay vòng để mỗi chuyến có nhiều khách khác nhau.
            SELECT u.id, u.full_name, u.email, u.phone
            INTO v_user_id, v_contact_name, v_contact_email, v_contact_phone
            FROM users u
            WHERE u.role = 'user'
              AND u.status = 'active'
            ORDER BY MOD(u.id + v_departure_id + v_booking_seq, 97), u.id
            LIMIT 1;

            -- Chọn điểm đón đúng tour/departure; nếu chưa có thì lấy điểm đón theo tour.
            SET v_pickup_id = NULL;
            SET v_pickup_name = NULL;
            SET v_pickup_address = NULL;
            SET v_pickup_time = NULL;
            SET v_pickup_note = NULL;

            SELECT
                pp.id,
                pp.name,
                pp.address,
                pp.pickup_time,
                pp.note
            INTO
                v_pickup_id,
                v_pickup_name,
                v_pickup_address,
                v_pickup_time,
                v_pickup_note
            FROM tour_pickup_points pp
            WHERE pp.tour_id = v_tour_id
              AND pp.status = 'active'
              AND (pp.departure_id = v_departure_id OR pp.departure_id IS NULL)
            ORDER BY
                CASE WHEN pp.departure_id = v_departure_id THEN 0 ELSE 1 END,
                pp.id
            LIMIT 1;

            SET v_original_amount =
                v_adult_count * v_adult_price +
                v_child_count * v_child_price;

            SET v_discount_amount =
                CASE
                    WHEN MOD(v_booking_seq, 5) = 0
                    THEN LEAST(300000, ROUND(v_original_amount * 0.05, 0))
                    ELSE 0
                END;

            SET v_final_amount = v_original_amount - v_discount_amount;

            SET v_booking_status =
                CASE
                    WHEN v_end_date < CURDATE() THEN 'completed'
                    WHEN v_departure_date <= CURDATE() AND v_end_date >= CURDATE() THEN 'confirmed'
                    WHEN MOD(v_booking_seq, 7) = 0 THEN 'waiting_confirmation'
                    ELSE 'confirmed'
                END;

            SET v_booking_code = CONCAT(
                'REAL2026-',
                LPAD(v_departure_id, 4, '0'),
                '-',
                LPAD(v_booking_seq, 3, '0')
            );

            INSERT IGNORE INTO bookings (
                booking_code,
                user_id,
                tour_id,
                departure_id,
                pickup_point_id,
                pickup_name,
                pickup_address,
                pickup_time,
                pickup_note,
                adult_count,
                child_count,
                original_amount,
                discount_amount,
                final_amount,
                booking_status,
                hold_expires_at,
                contact_name,
                contact_email,
                contact_phone,
                note,
                created_at,
                updated_at
            )
            VALUES (
                v_booking_code,
                v_user_id,
                v_tour_id,
                v_departure_id,
                v_pickup_id,
                COALESCE(v_pickup_name, 'Điểm đón trung tâm'),
                COALESCE(v_pickup_address, 'Địa chỉ sẽ được Travela xác nhận'),
                COALESCE(v_pickup_time, '06:00:00'),
                COALESCE(v_pickup_note, 'Vui lòng có mặt trước giờ đón 15 phút.'),
                v_adult_count,
                v_child_count,
                v_original_amount,
                v_discount_amount,
                v_final_amount,
                v_booking_status,
                NULL,
                v_contact_name,
                v_contact_email,
                COALESCE(v_contact_phone, CONCAT('0987', LPAD(v_user_id, 6, '0'))),
                '[REALISTIC_SEED] Booking bổ sung cho dữ liệu vận hành thực tế',
                DATE_SUB(
                    TIMESTAMP(v_departure_date, '09:00:00'),
                    INTERVAL 14 + MOD(v_booking_seq, 25) DAY
                ),
                NOW()
            );

            SELECT id
            INTO v_booking_id
            FROM bookings
            WHERE booking_code = v_booking_code
            LIMIT 1;

            -- Thanh toán tương ứng.
            INSERT IGNORE INTO payments (
                booking_id,
                payment_method,
                payment_status,
                amount,
                internal_transaction_code,
                gateway_transaction_id,
                paid_at,
                created_at,
                updated_at
            )
            VALUES (
                v_booking_id,
                CASE MOD(v_booking_seq, 4)
                    WHEN 0 THEN 'momo'
                    WHEN 1 THEN 'vnpay'
                    WHEN 2 THEN 'bank_transfer'
                    ELSE 'card'
                END,
                CASE
                    WHEN v_booking_status IN ('confirmed', 'completed') THEN 'paid'
                    WHEN v_booking_status = 'waiting_confirmation' THEN 'waiting_confirmation'
                    ELSE 'pending'
                END,
                v_final_amount,
                CONCAT('REAL-TXN-', v_booking_code),
                CONCAT('GW-', LPAD(v_booking_id, 10, '0')),
                CASE
                    WHEN v_booking_status IN ('confirmed', 'completed')
                    THEN DATE_SUB(
                        TIMESTAMP(v_departure_date, '09:00:00'),
                        INTERVAL 13 + MOD(v_booking_seq, 20) DAY
                    )
                    ELSE NULL
                END,
                NOW(),
                NOW()
            );

            -- Log trạng thái booking.
            INSERT INTO booking_status_logs (
                booking_id,
                payment_id,
                action_type,
                old_status,
                new_status,
                changed_by_user_id,
                source,
                reason,
                note,
                created_at
            )
            SELECT
                v_booking_id,
                p.id,
                'realistic_seed_created',
                NULL,
                v_booking_status,
                1,
                'system',
                'Tạo dữ liệu demo vận hành thực tế',
                'Booking có đủ khách, điểm đón và thanh toán',
                NOW()
            FROM payments p
            WHERE p.booking_id = v_booking_id
            LIMIT 1;

            -- Danh sách hành khách.
            SET v_guest_index = 1;

            guest_loop: WHILE v_guest_index <= v_group_size DO

                SET v_full_name =
                    CASE MOD(v_booking_id + v_guest_index, 20)
                        WHEN 0 THEN 'Nguyễn Hoàng Minh'
                        WHEN 1 THEN 'Trần Ngọc Anh'
                        WHEN 2 THEN 'Lê Quốc Bảo'
                        WHEN 3 THEN 'Phạm Thu Hà'
                        WHEN 4 THEN 'Võ Minh Khang'
                        WHEN 5 THEN 'Đặng Hải Yến'
                        WHEN 6 THEN 'Bùi Gia Huy'
                        WHEN 7 THEN 'Đỗ Khánh Linh'
                        WHEN 8 THEN 'Hồ Thanh Tùng'
                        WHEN 9 THEN 'Ngô Bảo Trâm'
                        WHEN 10 THEN 'Dương Minh Phúc'
                        WHEN 11 THEN 'Lý Thảo Vy'
                        WHEN 12 THEN 'Mai Quốc Đạt'
                        WHEN 13 THEN 'Phan Ngọc Mai'
                        WHEN 14 THEN 'Huỳnh Anh Tuấn'
                        WHEN 15 THEN 'Tạ Minh Châu'
                        WHEN 16 THEN 'Đinh Gia Hân'
                        WHEN 17 THEN 'Cao Đức Long'
                        WHEN 18 THEN 'Vũ Hoài Thương'
                        ELSE 'Trương Nhật Nam'
                    END;

                -- Thêm số thứ tự nhỏ nếu cùng tên trong một booking.
                SET v_full_name = CONCAT(v_full_name, ' ', v_guest_index);

                INSERT INTO booking_guests (
                    booking_id,
                    full_name,
                    date_of_birth,
                    gender,
                    guest_type,
                    id_number,
                    nationality,
                    phone,
                    dietary_notes,
                    health_notes,
                    allergy_notes,
                    emergency_contact_name,
                    emergency_contact_phone,
                    created_at,
                    updated_at
                )
                VALUES (
                    v_booking_id,
                    v_full_name,
                    CASE
                        WHEN v_guest_index > v_adult_count
                        THEN DATE_SUB(
                            CURDATE(),
                            INTERVAL 6 + MOD(v_booking_id + v_guest_index, 8) YEAR
                        )
                        ELSE DATE_SUB(
                            CURDATE(),
                            INTERVAL 22 + MOD(v_booking_id + v_guest_index, 35) YEAR
                        )
                    END,
                    CASE MOD(v_booking_id + v_guest_index, 3)
                        WHEN 0 THEN 'female'
                        WHEN 1 THEN 'male'
                        ELSE 'other'
                    END,
                    CASE
                        WHEN v_guest_index > v_adult_count THEN 'child'
                        ELSE 'adult'
                    END,
                    CASE
                        WHEN v_guest_index <= v_adult_count
                        THEN CONCAT('079', LPAD(v_booking_id * 10 + v_guest_index, 9, '0'))
                        ELSE NULL
                    END,
                    'Việt Nam',
                    CASE
                        WHEN v_guest_index <= v_adult_count
                        THEN CONCAT('097', LPAD(MOD(v_booking_id * 17 + v_guest_index, 10000000), 7, '0'))
                        ELSE NULL
                    END,
                    CASE
                        WHEN MOD(v_booking_id + v_guest_index, 11) = 0
                        THEN 'Ăn chay'
                        WHEN MOD(v_booking_id + v_guest_index, 13) = 0
                        THEN 'Không ăn hải sản'
                        ELSE NULL
                    END,
                    CASE
                        WHEN MOD(v_booking_id + v_guest_index, 17) = 0
                        THEN 'Dễ say xe, cần ngồi hàng ghế đầu'
                        WHEN MOD(v_booking_id + v_guest_index, 19) = 0
                        THEN 'Tiền sử huyết áp, cần nghỉ đúng giờ'
                        ELSE NULL
                    END,
                    CASE
                        WHEN MOD(v_booking_id + v_guest_index, 23) = 0
                        THEN 'Dị ứng đậu phộng'
                        ELSE NULL
                    END,
                    v_contact_name,
                    COALESCE(v_contact_phone, '0900000000'),
                    NOW(),
                    NOW()
                );

                SET v_guest_index = v_guest_index + 1;
            END WHILE guest_loop;

            SET v_current = v_current + v_group_size;
            SET v_booking_seq = v_booking_seq + 1;
        END WHILE booking_loop;

    END LOOP dep_loop;

    CLOSE dep_cursor;
END$$

DELIMITER ;

CALL seed_realistic_bookings();

DROP PROCEDURE IF EXISTS seed_realistic_bookings;

-- =====================================================================
-- 3. ĐỒNG BỘ SỐ CHỖ
-- =====================================================================

UPDATE tour_departures td
LEFT JOIN (
    SELECT
        departure_id,
        SUM(
            CASE
                WHEN booking_status IN ('confirmed', 'completed', 'waiting_confirmation')
                THEN adult_count + child_count
                ELSE 0
            END
        ) AS booked,
        SUM(
            CASE
                WHEN booking_status = 'pending_payment'
                THEN adult_count + child_count
                ELSE 0
            END
        ) AS held
    FROM bookings
    GROUP BY departure_id
) x ON x.departure_id = td.id
SET
    td.booked_slots = LEAST(COALESCE(x.booked, 0), td.total_slots),
    td.held_slots = LEAST(
        COALESCE(x.held, 0),
        GREATEST(td.total_slots - LEAST(COALESCE(x.booked, 0), td.total_slots), 0)
    ),
    td.status = CASE
        WHEN td.status = 'cancelled' THEN 'cancelled'
        WHEN td.end_date < CURDATE() THEN 'completed'
        WHEN td.departure_date <= CURDATE() AND td.end_date >= CURDATE() THEN 'departed'
        WHEN LEAST(COALESCE(x.booked, 0), td.total_slots) >= td.total_slots THEN 'full'
        ELSE 'open'
    END;

-- =====================================================================
-- 4. TẠO/ĐỒNG BỘ TRIP OPERATIONS
-- =====================================================================

INSERT INTO trip_operations (
    departure_id,
    guide_id,
    operation_status,
    meeting_note,
    vehicle_info,
    emergency_phone,
    started_at,
    completed_at,
    created_by,
    created_at,
    updated_at
)
SELECT
    td.id,
    (
        SELECT ga.guide_id
        FROM guide_assignments ga
        JOIN bookings gb ON gb.id = ga.booking_id
        WHERE gb.departure_id = td.id
          AND ga.status NOT IN ('cancelled', 'rejected')
        ORDER BY ga.id
        LIMIT 1
    ),
    CASE
        WHEN td.status = 'completed' THEN 'completed'
        WHEN td.status = 'departed' THEN 'in_progress'
        WHEN DATEDIFF(td.departure_date, CURDATE()) <= 1 THEN 'ready'
        ELSE 'preparing'
    END,
    CONCAT(
        'Tập trung tại ',
        COALESCE(
            (
                SELECT MIN(b.pickup_name)
                FROM bookings b
                WHERE b.departure_id = td.id
                  AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
            ),
            'điểm đón đã đăng ký'
        ),
        '. Có mặt trước giờ xe chạy 15 phút.'
    ),
    CASE MOD(td.id, 4)
        WHEN 0 THEN 'Xe 45 chỗ - 51B-123.45 - Tài xế Nguyễn Văn Thành'
        WHEN 1 THEN 'Xe 29 chỗ - 51B-678.90 - Tài xế Trần Quốc Hùng'
        WHEN 2 THEN 'Xe limousine 18 chỗ - 51F-246.80 - Tài xế Lê Minh Đức'
        ELSE 'Xe 35 chỗ - 51B-135.79 - Tài xế Phạm Anh Tuấn'
    END,
    '1900 6868',
    CASE
        WHEN td.status IN ('departed','completed')
        THEN TIMESTAMP(td.departure_date, '06:00:00')
        ELSE NULL
    END,
    CASE
        WHEN td.status = 'completed'
        THEN TIMESTAMP(td.end_date, '20:00:00')
        ELSE NULL
    END,
    1,
    NOW(),
    NOW()
FROM tour_departures td
JOIN tmp_real_departures x ON x.departure_id = td.id
ON DUPLICATE KEY UPDATE
    guide_id = COALESCE(VALUES(guide_id), trip_operations.guide_id),
    operation_status = VALUES(operation_status),
    meeting_note = VALUES(meeting_note),
    vehicle_info = VALUES(vehicle_info),
    emergency_phone = VALUES(emergency_phone),
    started_at = VALUES(started_at),
    completed_at = VALUES(completed_at),
    updated_at = NOW();

-- =====================================================================
-- 5. CHECK-IN HÀNH KHÁCH
-- =====================================================================

INSERT IGNORE INTO passenger_checkins (
    trip_operation_id,
    booking_guest_id,
    status,
    checked_in_at,
    checked_in_by,
    note,
    created_at,
    updated_at
)
SELECT
    op.id,
    bg.id,
    CASE
        WHEN op.operation_status = 'completed' THEN
            CASE MOD(bg.id, 20)
                WHEN 0 THEN 'absent'
                WHEN 1 THEN 'late'
                WHEN 2 THEN 'late'
                ELSE 'present'
            END
        WHEN op.operation_status IN ('boarding','departed','in_progress') THEN
            CASE MOD(bg.id, 12)
                WHEN 0 THEN 'absent'
                WHEN 1 THEN 'late'
                ELSE 'present'
            END
        ELSE 'pending'
    END,
    CASE
        WHEN op.operation_status = 'completed' THEN
            TIMESTAMP(td.departure_date, ADDTIME('05:40:00', SEC_TO_TIME(MOD(bg.id, 35) * 60)))
        WHEN op.operation_status IN ('boarding','departed','in_progress') THEN
            NOW()
        ELSE NULL
    END,
    g.user_id,
    CASE
        WHEN MOD(bg.id, 20) = 0 THEN 'Khách báo hủy sát giờ do lý do cá nhân'
        WHEN MOD(bg.id, 12) = 1 THEN 'Khách đến trễ khoảng 10 phút'
        WHEN bg.health_notes IS NOT NULL THEN CONCAT('Lưu ý sức khỏe: ', bg.health_notes)
        WHEN bg.dietary_notes IS NOT NULL THEN CONCAT('Lưu ý ăn uống: ', bg.dietary_notes)
        ELSE NULL
    END,
    NOW(),
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN bookings b
    ON b.departure_id = op.departure_id
   AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
JOIN booking_guests bg ON bg.booking_id = b.id
LEFT JOIN guides g ON g.id = op.guide_id;

-- Nếu đã có check-in pending từ script cũ, cập nhật trạng thái cho tour đã/đang chạy.
UPDATE passenger_checkins pc
JOIN trip_operations op ON op.id = pc.trip_operation_id
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN booking_guests bg ON bg.id = pc.booking_guest_id
LEFT JOIN guides g ON g.id = op.guide_id
SET
    pc.status = CASE
        WHEN op.operation_status = 'completed' THEN
            CASE MOD(bg.id, 20)
                WHEN 0 THEN 'absent'
                WHEN 1 THEN 'late'
                WHEN 2 THEN 'late'
                ELSE 'present'
            END
        WHEN op.operation_status IN ('boarding','departed','in_progress') THEN
            CASE MOD(bg.id, 12)
                WHEN 0 THEN 'absent'
                WHEN 1 THEN 'late'
                ELSE 'present'
            END
        ELSE pc.status
    END,
    pc.checked_in_at = CASE
        WHEN op.operation_status IN ('completed','boarding','departed','in_progress')
        THEN COALESCE(pc.checked_in_at, TIMESTAMP(td.departure_date, '05:50:00'))
        ELSE pc.checked_in_at
    END,
    pc.checked_in_by = COALESCE(pc.checked_in_by, g.user_id),
    pc.updated_at = NOW()
WHERE op.operation_status IN ('completed','boarding','departed','in_progress');

-- =====================================================================
-- 6. CHECKLIST THỰC TẾ
-- =====================================================================

INSERT IGNORE INTO trip_checklist_items (
    trip_operation_id,
    category,
    title,
    description,
    is_required,
    status,
    due_at,
    completed_by,
    completed_at,
    note,
    display_order,
    created_at,
    updated_at
)
SELECT
    op.id,
    tpl.category,
    tpl.title,
    tpl.description,
    TRUE,
    CASE
        WHEN op.operation_status IN ('in_progress','completed') THEN 'completed'
        WHEN tpl.display_order <= 4 THEN 'completed'
        WHEN tpl.display_order = 5 AND MOD(op.id, 4) = 0 THEN 'in_progress'
        ELSE 'pending'
    END,
    DATE_SUB(TIMESTAMP(td.departure_date, '06:00:00'), INTERVAL tpl.hours_before HOUR),
    CASE
        WHEN op.operation_status IN ('in_progress','completed') OR tpl.display_order <= 4
        THEN 1
        ELSE NULL
    END,
    CASE
        WHEN op.operation_status IN ('in_progress','completed') OR tpl.display_order <= 4
        THEN DATE_SUB(TIMESTAMP(td.departure_date, '06:00:00'), INTERVAL tpl.hours_before - 1 HOUR)
        ELSE NULL
    END,
    CASE tpl.display_order
        WHEN 1 THEN 'Đã đối chiếu danh sách booking và thông tin khách.'
        WHEN 2 THEN 'Nhà xe xác nhận phương tiện và tài xế.'
        WHEN 3 THEN 'Khách sạn xác nhận số lượng phòng.'
        WHEN 4 THEN 'Bảo hiểm đã được kích hoạt cho đoàn.'
        WHEN 5 THEN 'Đang rà soát khách có lưu ý ăn uống/sức khỏe.'
        ELSE NULL
    END,
    tpl.display_order,
    NOW(),
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN (
    SELECT 'passenger' category, 'Đối chiếu danh sách hành khách' title,
           'Kiểm tra họ tên, giấy tờ, số điện thoại và ghi chú đặc biệt.' description,
           48 hours_before, 1 display_order
    UNION ALL
    SELECT 'transport', 'Xác nhận xe và tài xế',
           'Kiểm tra biển số xe, số ghế, số điện thoại tài xế.', 36, 2
    UNION ALL
    SELECT 'hotel', 'Xác nhận phòng khách sạn',
           'Đối chiếu số phòng, loại phòng và giờ nhận phòng.', 30, 3
    UNION ALL
    SELECT 'insurance', 'Kích hoạt bảo hiểm đoàn',
           'Đảm bảo toàn bộ hành khách đã có thông tin bảo hiểm.', 24, 4
    UNION ALL
    SELECT 'health', 'Rà soát lưu ý sức khỏe và ăn uống',
           'Lập danh sách khách dị ứng, ăn chay, say xe hoặc có bệnh nền.', 18, 5
    UNION ALL
    SELECT 'communication', 'Gửi thông báo tập trung',
           'Gửi điểm đón, thời gian và số điện thoại HDV cho khách.', 12, 6
    UNION ALL
    SELECT 'document', 'Chuẩn bị danh sách đoàn bản in',
           'In danh sách khách, booking và số liên hệ khẩn cấp.', 6, 7
) tpl
ON 1 = 1
WHERE NOT EXISTS (
    SELECT 1
    FROM trip_checklist_items ci
    WHERE ci.trip_operation_id = op.id
      AND ci.title = tpl.title
);

-- =====================================================================
-- 7. NHẬT KÝ HÀNH TRÌNH
-- =====================================================================

INSERT INTO journey_logs (
    trip_operation_id,
    guide_id,
    log_type,
    title,
    content,
    location_name,
    media_urls,
    occurred_at,
    created_at,
    updated_at
)
SELECT
    op.id,
    op.guide_id,
    jl.log_type,
    jl.title,
    jl.content,
    d.name,
    JSON_ARRAY(
        CONCAT('https://picsum.photos/seed/journey-', op.id, '-', jl.seq, '/1000/700')
    ),
    CASE
        WHEN jl.seq = 1 THEN TIMESTAMP(td.departure_date, '06:10:00')
        WHEN jl.seq = 2 THEN TIMESTAMP(td.departure_date, '11:45:00')
        WHEN jl.seq = 3 THEN TIMESTAMP(td.departure_date, '14:30:00')
        ELSE TIMESTAMP(td.end_date, '17:30:00')
    END,
    NOW(),
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN tours t ON t.id = td.tour_id
JOIN destinations d ON d.id = t.destination_id
JOIN (
    SELECT 1 seq, 'departure' log_type, 'Đoàn đã khởi hành' title,
           'HDV hoàn tất điểm danh, phổ biến nội quy và đoàn khởi hành đúng kế hoạch.' content
    UNION ALL
    SELECT 2, 'meal', 'Đoàn dùng bữa trưa',
           'Nhà hàng phục vụ đúng số lượng. Các suất ăn chay và dị ứng được tách riêng.'
    UNION ALL
    SELECT 3, 'activity', 'Hoàn thành điểm tham quan chính',
           'Đoàn tham quan an toàn, khách tập trung đúng giờ và tiếp tục lịch trình.'
    UNION ALL
    SELECT 4, 'arrival', 'Kết thúc hành trình',
           'Đoàn về điểm trả khách, HDV kiểm tra hành lý và xác nhận kết thúc chuyến.'
) jl ON 1 = 1
WHERE op.guide_id IS NOT NULL
  AND op.operation_status IN ('in_progress','completed')
  AND NOT EXISTS (
      SELECT 1
      FROM journey_logs old
      WHERE old.trip_operation_id = op.id
        AND old.title = jl.title
  );

-- =====================================================================
-- 8. THÔNG BÁO ĐOÀN
-- =====================================================================

INSERT INTO trip_broadcasts (
    trip_operation_id,
    sender_user_id,
    title,
    content,
    channel,
    pickup_point_id,
    sent_at,
    created_at
)
SELECT
    op.id,
    COALESCE(g.user_id, 1),
    bc.title,
    bc.content,
    bc.channel,
    CASE WHEN bc.seq = 1 THEN (
        SELECT MIN(b.pickup_point_id)
        FROM bookings b
        WHERE b.departure_id = op.departure_id
          AND b.pickup_point_id IS NOT NULL
    ) ELSE NULL END,
    CASE
        WHEN bc.seq = 1 THEN DATE_SUB(TIMESTAMP(td.departure_date, '06:00:00'), INTERVAL 1 DAY)
        WHEN bc.seq = 2 THEN DATE_SUB(TIMESTAMP(td.departure_date, '06:00:00'), INTERVAL 2 HOUR)
        ELSE TIMESTAMP(td.departure_date, '12:00:00')
    END,
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
LEFT JOIN guides g ON g.id = op.guide_id
JOIN (
    SELECT 1 seq, 'Nhắc giờ tập trung' title,
           'Quý khách vui lòng có mặt tại điểm đón trước giờ khởi hành 15 phút. Mang theo giấy tờ tùy thân và kiểm tra hành lý.' content,
           'both' channel
    UNION ALL
    SELECT 2, 'Xe sắp đến điểm đón',
           'Xe và hướng dẫn viên đang di chuyển đến điểm đón. Quý khách vui lòng giữ điện thoại để tiện liên lạc.',
           'in_app'
    UNION ALL
    SELECT 3, 'Cập nhật lịch dùng bữa',
           'Đoàn sẽ dùng bữa theo lịch. Khách có yêu cầu ăn chay hoặc dị ứng vui lòng báo lại cho hướng dẫn viên.',
           'in_app'
) bc ON 1 = 1
WHERE NOT EXISTS (
    SELECT 1
    FROM trip_broadcasts old
    WHERE old.trip_operation_id = op.id
      AND old.title = bc.title
);

INSERT IGNORE INTO trip_broadcast_recipients (
    trip_broadcast_id,
    user_id,
    booking_id,
    delivery_status,
    error_message,
    created_at
)
SELECT
    tb.id,
    b.user_id,
    b.id,
    CASE
        WHEN MOD(b.id, 29) = 0 THEN 'failed'
        ELSE 'sent'
    END,
    CASE
        WHEN MOD(b.id, 29) = 0 THEN 'Thiết bị khách hàng chưa đăng ký nhận thông báo'
        ELSE NULL
    END,
    NOW()
FROM trip_broadcasts tb
JOIN trip_operations op ON op.id = tb.trip_operation_id
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN bookings b
    ON b.departure_id = op.departure_id
   AND b.booking_status IN ('confirmed','completed','waiting_confirmation');

-- =====================================================================
-- 9. SỰ CỐ THỰC TẾ
-- =====================================================================

INSERT IGNORE INTO incident_tickets (
    ticket_code,
    trip_operation_id,
    booking_id,
    booking_guest_id,
    reported_by_guide_id,
    assigned_admin_id,
    category,
    severity,
    status,
    title,
    description,
    location_name,
    evidence_urls,
    resolution,
    acknowledged_at,
    resolved_at,
    closed_at,
    created_at,
    updated_at
)
SELECT
    CONCAT('INC-REAL-', LPAD(op.id, 6, '0'), '-', s.seq),
    op.id,
    (
        SELECT MIN(b.id)
        FROM bookings b
        WHERE b.departure_id = op.departure_id
          AND b.booking_status IN ('confirmed','completed')
    ),
    CASE
        WHEN s.category IN ('customer','health') THEN (
            SELECT MIN(bg.id)
            FROM bookings b
            JOIN booking_guests bg ON bg.booking_id = b.id
            WHERE b.departure_id = op.departure_id
              AND b.booking_status IN ('confirmed','completed')
        )
        ELSE NULL
    END,
    op.guide_id,
    1,
    s.category,
    s.severity,
    CASE
        WHEN op.operation_status = 'completed' THEN
            CASE s.seq
                WHEN 1 THEN 'resolved'
                WHEN 2 THEN 'closed'
                ELSE 'resolved'
            END
        WHEN s.severity IN ('high','critical') THEN 'in_progress'
        ELSE 'acknowledged'
    END,
    s.title,
    s.description,
    d.name,
    JSON_ARRAY(
        CONCAT('https://picsum.photos/seed/incident-', op.id, '-', s.seq, '/1000/700')
    ),
    CASE
        WHEN op.operation_status = 'completed' THEN s.resolution
        WHEN s.severity = 'low' THEN s.resolution
        ELSE NULL
    END,
    DATE_ADD(TIMESTAMP(td.departure_date, '08:00:00'), INTERVAL s.seq HOUR),
    CASE
        WHEN op.operation_status = 'completed' OR s.severity = 'low'
        THEN DATE_ADD(TIMESTAMP(td.departure_date, '08:00:00'), INTERVAL s.seq + 2 HOUR)
        ELSE NULL
    END,
    CASE
        WHEN op.operation_status = 'completed' AND s.seq = 2
        THEN DATE_ADD(TIMESTAMP(td.departure_date, '08:00:00'), INTERVAL s.seq + 4 HOUR)
        ELSE NULL
    END,
    DATE_ADD(TIMESTAMP(td.departure_date, '07:30:00'), INTERVAL s.seq HOUR),
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN tours t ON t.id = td.tour_id
JOIN destinations d ON d.id = t.destination_id
JOIN (
    SELECT 1 seq, 'vehicle' category, 'medium' severity,
           'Xe đến điểm đón chậm 15 phút' title,
           'Mật độ giao thông cao khiến xe đến điểm đón trễ. HDV đã chủ động gọi điện thông báo cho khách.' description,
           'Điều hành liên hệ nhà xe, cập nhật thời gian mới và đoàn khởi hành sau 15 phút.' resolution
    UNION ALL
    SELECT 2, 'health', 'high',
           'Khách có dấu hiệu say xe và tụt huyết áp',
           'Một hành khách chóng mặt, buồn nôn trong quá trình di chuyển. HDV cho khách nghỉ và kiểm tra tình trạng sức khỏe.',
           'Đưa khách đến cơ sở y tế gần nhất kiểm tra. Khách ổn định và tiếp tục hành trình.'
    UNION ALL
    SELECT 3, 'hotel', 'medium',
           'Khách sạn giao thiếu một phòng',
           'Khách sạn xác nhận nhầm số lượng phòng, đoàn thiếu một phòng đôi khi làm thủ tục nhận phòng.',
           'Khách sạn bố trí phòng tương đương và miễn phí nâng hạng cho khách bị ảnh hưởng.'
    UNION ALL
    SELECT 4, 'weather', 'low',
           'Mưa lớn ảnh hưởng điểm tham quan ngoài trời',
           'Thời tiết mưa lớn, HDV đề xuất đổi thứ tự điểm tham quan để đảm bảo an toàn.',
           'Chuyển sang điểm tham quan trong nhà và lùi hoạt động ngoài trời sang buổi chiều.'
) s ON s.seq <= CASE
    WHEN MOD(op.id, 5) = 0 THEN 4
    WHEN MOD(op.id, 3) = 0 THEN 2
    WHEN MOD(op.id, 2) = 0 THEN 1
    ELSE 0
END
WHERE op.guide_id IS NOT NULL;

-- Bình luận xử lý sự cố.
INSERT INTO incident_ticket_comments (
    incident_ticket_id,
    user_id,
    comment,
    is_internal,
    created_at
)
SELECT
    it.id,
    1,
    CASE it.status
        WHEN 'acknowledged' THEN 'Trung tâm điều hành đã tiếp nhận và đang xác minh thông tin.'
        WHEN 'in_progress' THEN 'Đã liên hệ nhà cung cấp và hướng dẫn viên để phối hợp xử lý.'
        WHEN 'resolved' THEN 'Sự cố đã được xử lý. Vui lòng tiếp tục theo dõi hành khách.'
        WHEN 'closed' THEN 'Đã đóng ticket sau khi xác nhận với hướng dẫn viên.'
        ELSE 'Đã ghi nhận ticket.'
    END,
    TRUE,
    DATE_ADD(it.created_at, INTERVAL 15 MINUTE)
FROM incident_tickets it
WHERE it.ticket_code LIKE 'INC-REAL-%'
  AND NOT EXISTS (
      SELECT 1
      FROM incident_ticket_comments c
      WHERE c.incident_ticket_id = it.id
        AND c.user_id = 1
  );

-- Lịch sử trạng thái sự cố.
INSERT INTO incident_status_logs (
    incident_ticket_id,
    old_status,
    new_status,
    changed_by,
    reason,
    created_at
)
SELECT
    it.id,
    NULL,
    'open',
    NULL,
    'HDV tạo ticket sự cố từ ứng dụng điều hành.',
    it.created_at
FROM incident_tickets it
WHERE it.ticket_code LIKE 'INC-REAL-%'
  AND NOT EXISTS (
      SELECT 1
      FROM incident_status_logs l
      WHERE l.incident_ticket_id = it.id
        AND l.new_status = 'open'
  );

INSERT INTO incident_status_logs (
    incident_ticket_id,
    old_status,
    new_status,
    changed_by,
    reason,
    created_at
)
SELECT
    it.id,
    'open',
    CASE
        WHEN it.status IN ('resolved','closed') THEN 'acknowledged'
        ELSE it.status
    END,
    1,
    'Admin tiếp nhận và phân công xử lý.',
    COALESCE(it.acknowledged_at, DATE_ADD(it.created_at, INTERVAL 15 MINUTE))
FROM incident_tickets it
WHERE it.ticket_code LIKE 'INC-REAL-%'
  AND it.status <> 'open'
  AND NOT EXISTS (
      SELECT 1
      FROM incident_status_logs l
      WHERE l.incident_ticket_id = it.id
        AND l.new_status IN ('acknowledged','in_progress')
  );

INSERT INTO incident_status_logs (
    incident_ticket_id,
    old_status,
    new_status,
    changed_by,
    reason,
    created_at
)
SELECT
    it.id,
    'acknowledged',
    it.status,
    1,
    COALESCE(it.resolution, 'Hoàn tất xử lý theo phương án điều hành.'),
    COALESCE(it.resolved_at, it.closed_at, NOW())
FROM incident_tickets it
WHERE it.ticket_code LIKE 'INC-REAL-%'
  AND it.status IN ('resolved','closed')
  AND NOT EXISTS (
      SELECT 1
      FROM incident_status_logs l
      WHERE l.incident_ticket_id = it.id
        AND l.new_status = it.status
  );

-- =====================================================================
-- 10. CẢNH BÁO VẬN HÀNH
-- =====================================================================

INSERT IGNORE INTO operational_alerts (
    alert_code,
    alert_type,
    severity,
    trip_operation_id,
    departure_id,
    booking_id,
    guide_id,
    title,
    message,
    status,
    detected_at,
    due_at,
    assigned_to,
    acknowledged_by,
    acknowledged_at,
    resolved_by,
    resolved_at,
    resolution_note,
    deduplication_key,
    metadata,
    created_at,
    updated_at
)
SELECT
    CONCAT('ALERT-REAL-LOW-GUEST-', td.id),
    'low_guest_count',
    'warning',
    op.id,
    td.id,
    NULL,
    op.guide_id,
    'Số lượng khách thấp trước ngày khởi hành',
    CONCAT(
        'Lịch khởi hành ',
        DATE_FORMAT(td.departure_date, '%d/%m/%Y'),
        ' hiện có ',
        td.booked_slots,
        '/',
        td.total_slots,
        ' khách. Cần theo dõi khả năng ghép đoàn hoặc điều chỉnh phương tiện.'
    ),
    CASE WHEN td.departure_date < CURDATE() THEN 'resolved' ELSE 'open' END,
    NOW(),
    DATE_SUB(TIMESTAMP(td.departure_date, '06:00:00'), INTERVAL 3 DAY),
    1,
    CASE WHEN td.departure_date < CURDATE() THEN 1 ELSE NULL END,
    CASE WHEN td.departure_date < CURDATE() THEN NOW() ELSE NULL END,
    CASE WHEN td.departure_date < CURDATE() THEN 1 ELSE NULL END,
    CASE WHEN td.departure_date < CURDATE() THEN NOW() ELSE NULL END,
    CASE WHEN td.departure_date < CURDATE() THEN 'Chuyến đã hoàn tất.' ELSE NULL END,
    CONCAT('low_guest_count:', td.id),
    JSON_OBJECT(
        'bookedSlots', td.booked_slots,
        'totalSlots', td.total_slots,
        'occupancyRate', ROUND(td.booked_slots * 100 / td.total_slots, 2)
    ),
    NOW(),
    NOW()
FROM tour_departures td
JOIN tmp_real_departures x ON x.departure_id = td.id
JOIN trip_operations op ON op.departure_id = td.id
WHERE td.booked_slots < 12;

INSERT IGNORE INTO operational_alerts (
    alert_code,
    alert_type,
    severity,
    trip_operation_id,
    departure_id,
    booking_id,
    guide_id,
    title,
    message,
    status,
    detected_at,
    due_at,
    assigned_to,
    deduplication_key,
    metadata,
    created_at,
    updated_at
)
SELECT
    CONCAT('ALERT-REAL-CHECKLIST-', op.id),
    'checklist_incomplete',
    CASE
        WHEN DATEDIFF(td.departure_date, CURDATE()) <= 1 THEN 'high'
        ELSE 'warning'
    END,
    op.id,
    td.id,
    NULL,
    op.guide_id,
    'Checklist chuẩn bị chưa hoàn tất',
    CONCAT(
        'Chuyến ',
        t.name,
        ' còn ',
        SUM(ci.status <> 'completed'),
        ' đầu việc chưa hoàn thành.'
    ),
    'open',
    NOW(),
    DATE_SUB(TIMESTAMP(td.departure_date, '06:00:00'), INTERVAL 6 HOUR),
    1,
    CONCAT('checklist_incomplete:', op.id),
    JSON_OBJECT(
        'pendingItems', SUM(ci.status <> 'completed'),
        'departureDate', td.departure_date
    ),
    NOW(),
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN tours t ON t.id = td.tour_id
JOIN trip_checklist_items ci ON ci.trip_operation_id = op.id
WHERE td.departure_date >= CURDATE()
GROUP BY op.id, td.id, t.name, op.guide_id
HAVING SUM(ci.status <> 'completed') > 0;

INSERT IGNORE INTO operational_alerts (
    alert_code,
    alert_type,
    severity,
    trip_operation_id,
    departure_id,
    booking_id,
    guide_id,
    title,
    message,
    status,
    detected_at,
    due_at,
    assigned_to,
    deduplication_key,
    metadata,
    created_at,
    updated_at
)
SELECT
    CONCAT('ALERT-REAL-INCIDENT-', it.id),
    'incident_high_severity',
    CASE WHEN it.severity = 'critical' THEN 'critical' ELSE 'high' END,
    it.trip_operation_id,
    op.departure_id,
    it.booking_id,
    it.reported_by_guide_id,
    CONCAT('Sự cố mức ', UPPER(it.severity), ': ', it.title),
    it.description,
    CASE
        WHEN it.status IN ('resolved','closed') THEN 'resolved'
        ELSE 'open'
    END,
    it.created_at,
    DATE_ADD(it.created_at, INTERVAL 30 MINUTE),
    1,
    CONCAT('incident_high:', it.id),
    JSON_OBJECT(
        'ticketCode', it.ticket_code,
        'category', it.category,
        'severity', it.severity
    ),
    NOW(),
    NOW()
FROM incident_tickets it
JOIN trip_operations op ON op.id = it.trip_operation_id
WHERE it.ticket_code LIKE 'INC-REAL-%'
  AND it.severity IN ('high','critical');

-- =====================================================================
-- 11. BÁO CÁO KẾT THÚC TOUR
-- =====================================================================

INSERT INTO trip_reports (
    trip_operation_id,
    guide_id,
    actual_guest_count,
    absent_guest_count,
    vehicle_rating,
    hotel_rating,
    restaurant_rating,
    itinerary_rating,
    summary,
    incidents_summary,
    extra_cost,
    extra_cost_note,
    recommendations,
    status,
    submitted_at,
    reviewed_by,
    reviewed_at,
    admin_note,
    created_at,
    updated_at
)
SELECT
    op.id,
    op.guide_id,
    SUM(pc.status IN ('present','late')),
    SUM(pc.status = 'absent'),
    4 + MOD(op.id, 2),
    4 + MOD(op.id + 1, 2),
    4 + MOD(op.id, 2),
    4 + MOD(op.id + 1, 2),
    CONCAT(
        'Chuyến đi hoàn thành đúng kế hoạch. Đoàn có ',
        SUM(pc.status IN ('present','late')),
        ' khách tham gia, ',
        SUM(pc.status = 'late'),
        ' khách đến trễ và ',
        SUM(pc.status = 'absent'),
        ' khách vắng. Khách hàng hợp tác tốt, lịch trình cơ bản đúng tiến độ.'
    ),
    CASE
        WHEN COUNT(DISTINCT it.id) > 0
        THEN CONCAT(
            'Ghi nhận ',
            COUNT(DISTINCT it.id),
            ' sự cố; các sự cố đã được xử lý và không ảnh hưởng lớn đến toàn đoàn.'
        )
        ELSE 'Không có sự cố đáng kể.'
    END,
    CASE
        WHEN MOD(op.id, 3) = 0 THEN 850000
        WHEN MOD(op.id, 3) = 1 THEN 350000
        ELSE 0
    END,
    CASE
        WHEN MOD(op.id, 3) = 0 THEN 'Chi phí mua thuốc, nước uống và hỗ trợ y tế cho khách.'
        WHEN MOD(op.id, 3) = 1 THEN 'Chi phí bồi dưỡng tài xế do thay đổi lộ trình.'
        ELSE NULL
    END,
    'Nên nhắc khách tập trung sớm hơn 20 phút, kiểm tra kỹ lưu ý sức khỏe trước ngày đi và xác nhận phòng khách sạn lần cuối trước 24 giờ.',
    CASE WHEN MOD(op.id, 4) = 0 THEN 'reviewed' ELSE 'submitted' END,
    TIMESTAMP(td.end_date, '21:00:00'),
    CASE WHEN MOD(op.id, 4) = 0 THEN 1 ELSE NULL END,
    CASE WHEN MOD(op.id, 4) = 0 THEN DATE_ADD(TIMESTAMP(td.end_date, '21:00:00'), INTERVAL 1 DAY) ELSE NULL END,
    CASE WHEN MOD(op.id, 4) = 0 THEN 'Báo cáo đầy đủ. Đã xác nhận chi phí phát sinh.' ELSE NULL END,
    NOW(),
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN passenger_checkins pc ON pc.trip_operation_id = op.id
LEFT JOIN incident_tickets it ON it.trip_operation_id = op.id
WHERE op.operation_status = 'completed'
  AND op.guide_id IS NOT NULL
GROUP BY op.id, op.guide_id, td.end_date
ON DUPLICATE KEY UPDATE
    actual_guest_count = VALUES(actual_guest_count),
    absent_guest_count = VALUES(absent_guest_count),
    vehicle_rating = VALUES(vehicle_rating),
    hotel_rating = VALUES(hotel_rating),
    restaurant_rating = VALUES(restaurant_rating),
    itinerary_rating = VALUES(itinerary_rating),
    summary = VALUES(summary),
    incidents_summary = VALUES(incidents_summary),
    extra_cost = VALUES(extra_cost),
    extra_cost_note = VALUES(extra_cost_note),
    recommendations = VALUES(recommendations),
    status = VALUES(status),
    updated_at = NOW();

INSERT INTO trip_report_expenses (
    trip_report_id,
    expense_type,
    description,
    amount,
    receipt_url,
    status,
    reviewed_by,
    reviewed_at,
    review_note,
    created_at
)
SELECT
    tr.id,
    CASE MOD(tr.id, 3)
        WHEN 0 THEN 'medical'
        WHEN 1 THEN 'transport'
        ELSE 'meal'
    END,
    CASE MOD(tr.id, 3)
        WHEN 0 THEN 'Mua thuốc và hỗ trợ kiểm tra sức khỏe cho hành khách'
        WHEN 1 THEN 'Phụ phí thay đổi lộ trình và thời gian tài xế'
        ELSE 'Bổ sung suất ăn cho hành khách phát sinh'
    END,
    CASE MOD(tr.id, 3)
        WHEN 0 THEN 450000
        WHEN 1 THEN 350000
        ELSE 220000
    END,
    CONCAT('https://picsum.photos/seed/receipt-', tr.id, '/900/1200'),
    CASE WHEN tr.status = 'reviewed' THEN 'approved' ELSE 'pending' END,
    CASE WHEN tr.status = 'reviewed' THEN 1 ELSE NULL END,
    CASE WHEN tr.status = 'reviewed' THEN NOW() ELSE NULL END,
    CASE WHEN tr.status = 'reviewed' THEN 'Chi phí hợp lệ, đã đối chiếu hóa đơn.' ELSE NULL END,
    NOW()
FROM trip_reports tr
JOIN trip_operations op ON op.id = tr.trip_operation_id
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
WHERE tr.extra_cost > 0
  AND NOT EXISTS (
      SELECT 1
      FROM trip_report_expenses e
      WHERE e.trip_report_id = tr.id
        AND e.description = CASE MOD(tr.id, 3)
            WHEN 0 THEN 'Mua thuốc và hỗ trợ kiểm tra sức khỏe cho hành khách'
            WHEN 1 THEN 'Phụ phí thay đổi lộ trình và thời gian tài xế'
            ELSE 'Bổ sung suất ăn cho hành khách phát sinh'
        END
  );

-- =====================================================================
-- 12. THÔNG BÁO CÁ NHÂN CHO KHÁCH VÀ ADMIN
-- =====================================================================

INSERT INTO notifications (
    title,
    message,
    content,
    target_role,
    target_user_id,
    is_published,
    created_by,
    created_at,
    updated_at
)
SELECT
    'Xác nhận thông tin chuyến đi',
    CONCAT('Tour ', t.name, ' của bạn đã được xác nhận.'),
    CONCAT(
        'Mã booking ',
        b.booking_code,
        '. Ngày khởi hành ',
        DATE_FORMAT(td.departure_date, '%d/%m/%Y'),
        '. Điểm đón: ',
        COALESCE(b.pickup_name, 'Travela sẽ liên hệ'),
        ' lúc ',
        COALESCE(TIME_FORMAT(b.pickup_time, '%H:%i'), 'đang cập nhật'),
        '. Vui lòng kiểm tra danh sách hành khách và ghi chú sức khỏe.'
    ),
    'user',
    b.user_id,
    TRUE,
    1,
    NOW(),
    NOW()
FROM bookings b
JOIN tours t ON t.id = b.tour_id
JOIN tour_departures td ON td.id = b.departure_id
WHERE b.booking_code LIKE 'REAL2026-%'
  AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
  AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.target_user_id = b.user_id
        AND n.content LIKE CONCAT('%', b.booking_code, '%')
  );

INSERT INTO notifications (
    title,
    message,
    content,
    target_role,
    target_user_id,
    is_published,
    created_by,
    created_at,
    updated_at
)
SELECT
    'Có sự cố vận hành cần theo dõi',
    CONCAT(it.ticket_code, ' - ', it.title),
    CONCAT(
        'Mức độ: ', it.severity,
        '. Trạng thái: ', it.status,
        '. Nội dung: ', it.description
    ),
    'admin',
    1,
    TRUE,
    1,
    NOW(),
    NOW()
FROM incident_tickets it
WHERE it.ticket_code LIKE 'INC-REAL-%'
  AND it.status IN ('open','acknowledged','in_progress')
  AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.target_user_id = 1
        AND n.content LIKE CONCAT('%', it.ticket_code, '%')
  );

-- =====================================================================
-- 13. AUDIT LOG
-- =====================================================================

INSERT INTO audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    ip_address,
    user_agent,
    created_at
)
SELECT
    1,
    'REALISTIC_SEED_CREATED',
    'trip_operation',
    CAST(op.id AS CHAR),
    NULL,
    JSON_OBJECT(
        'departureId', op.departure_id,
        'operationStatus', op.operation_status,
        'passengerCount', (
            SELECT COUNT(*)
            FROM passenger_checkins pc
            WHERE pc.trip_operation_id = op.id
        ),
        'incidentCount', (
            SELECT COUNT(*)
            FROM incident_tickets it
            WHERE it.trip_operation_id = op.id
        )
    ),
    '127.0.0.1',
    'MySQL Workbench realistic seed',
    NOW()
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
WHERE NOT EXISTS (
    SELECT 1
    FROM audit_logs al
    WHERE al.action = 'REALISTIC_SEED_CREATED'
      AND al.entity_type = 'trip_operation'
      -- Thêm COLLATE ở đây để đồng bộ chuẩn mã hóa với cột entity_id
      AND al.entity_id = CAST(op.id AS CHAR) COLLATE utf8mb4_unicode_ci
);

SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

-- =====================================================================
-- 14. TRUY VẤN KIỂM TRA KẾT QUẢ
-- =====================================================================

-- 14.1. Số khách theo từng lịch khởi hành đã seed
SELECT
    td.id AS departure_id,
    t.name AS tour_name,
    td.departure_date,
    td.end_date,
    td.total_slots,
    td.booked_slots,
    td.held_slots,
    ROUND(td.booked_slots * 100 / td.total_slots, 2) AS occupancy_percent,
    COUNT(DISTINCT b.id) AS booking_count,
    COUNT(DISTINCT bg.id) AS guest_count
FROM tmp_real_departures x
JOIN tour_departures td ON td.id = x.departure_id
JOIN tours t ON t.id = td.tour_id
LEFT JOIN bookings b
    ON b.departure_id = td.id
   AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
LEFT JOIN booking_guests bg ON bg.booking_id = b.id
GROUP BY
    td.id,
    t.name,
    td.departure_date,
    td.end_date,
    td.total_slots,
    td.booked_slots,
    td.held_slots
ORDER BY td.departure_date, td.id;

-- 14.2. Tổng hợp vận hành từng chuyến
SELECT
    op.id AS operation_id,
    t.name AS tour_name,
    td.departure_date,
    op.operation_status,
    g.full_name AS guide_name,
    COUNT(DISTINCT pc.id) AS passengers,
    SUM(pc.status = 'present') AS present_count,
    SUM(pc.status = 'late') AS late_count,
    SUM(pc.status = 'absent') AS absent_count,
    COUNT(DISTINCT it.id) AS incident_count,
    COUNT(DISTINCT jl.id) AS journey_log_count,
    COUNT(DISTINCT tb.id) AS broadcast_count
FROM trip_operations op
JOIN tmp_real_departures x ON x.departure_id = op.departure_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN tours t ON t.id = td.tour_id
LEFT JOIN guides g ON g.id = op.guide_id
LEFT JOIN passenger_checkins pc ON pc.trip_operation_id = op.id
LEFT JOIN incident_tickets it ON it.trip_operation_id = op.id
LEFT JOIN journey_logs jl ON jl.trip_operation_id = op.id
LEFT JOIN trip_broadcasts tb ON tb.trip_operation_id = op.id
GROUP BY
    op.id,
    t.name,
    td.departure_date,
    op.operation_status,
    g.full_name
ORDER BY td.departure_date, op.id;

-- 14.3. Sự cố vừa tạo
SELECT
    it.ticket_code,
    t.name AS tour_name,
    it.category,
    it.severity,
    it.status,
    it.title,
    it.resolution,
    it.created_at
FROM incident_tickets it
JOIN trip_operations op ON op.id = it.trip_operation_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN tours t ON t.id = td.tour_id
WHERE it.ticket_code LIKE 'INC-REAL-%'
ORDER BY it.created_at DESC, it.id DESC;

-- 14.4. Cảnh báo đang mở
SELECT
    alert_code,
    alert_type,
    severity,
    title,
    status,
    due_at
FROM operational_alerts
WHERE alert_code LIKE 'ALERT-REAL-%'
ORDER BY
    FIELD(severity, 'critical','high','warning','info'),
    due_at,
    id;

-- 14.5. Báo cáo tour đã hoàn thành
SELECT
    tr.id,
    t.name AS tour_name,
    tr.actual_guest_count,
    tr.absent_guest_count,
    tr.extra_cost,
    tr.status,
    tr.submitted_at
FROM trip_reports tr
JOIN trip_operations op ON op.id = tr.trip_operation_id
JOIN tour_departures td ON td.id = op.departure_id
JOIN tours t ON t.id = td.tour_id
JOIN tmp_real_departures x ON x.departure_id = td.id
ORDER BY tr.submitted_at DESC;



SET @target_guests_per_departure = 10;

-- Các trạng thái booking được tính là khách thật của đoàn.
-- pending_payment / expired / cancelled không đưa vào danh sách đoàn.
DROP TEMPORARY TABLE IF EXISTS tmp_valid_bookings;

CREATE TEMPORARY TABLE tmp_valid_bookings AS
SELECT
    b.id AS booking_id,
    b.departure_id,
    b.tour_id,
    b.user_id,
    b.booking_code,
    b.created_at,
    ROW_NUMBER() OVER (
        PARTITION BY b.departure_id
        ORDER BY
            CASE b.booking_status
                WHEN 'completed' THEN 1
                WHEN 'confirmed' THEN 2
                WHEN 'waiting_confirmation' THEN 3
                ELSE 9
            END,
            b.id
    ) AS booking_order,
    COUNT(*) OVER (PARTITION BY b.departure_id) AS booking_count
FROM bookings b
JOIN users u
    ON u.id = b.user_id
   AND u.role = 'user'
   AND u.status = 'active'
WHERE b.booking_status IN ('confirmed', 'completed', 'waiting_confirmation');

ALTER TABLE tmp_valid_bookings
    ADD PRIMARY KEY (booking_id),
    ADD INDEX idx_tmp_valid_departure (departure_id);

-- Chỉ xử lý lịch có ít nhất một booking hợp lệ.
DROP TEMPORARY TABLE IF EXISTS tmp_departure_targets;

CREATE TEMPORARY TABLE tmp_departure_targets AS
SELECT
    td.id AS departure_id,
    td.tour_id,
    td.total_slots,
    LEAST(@target_guests_per_departure, td.total_slots) AS target_guests,
    COUNT(vb.booking_id) AS booking_count
FROM tour_departures td
JOIN tmp_valid_bookings vb
    ON vb.departure_id = td.id
WHERE td.status <> 'cancelled'
GROUP BY td.id, td.tour_id, td.total_slots;

ALTER TABLE tmp_departure_targets
    ADD PRIMARY KEY (departure_id);

-- =====================================================================
-- 2. PHÂN BỔ 10 KHÁCH CHO CÁC BOOKING ĐANG CÓ
-- =====================================================================
-- Ví dụ chuyến có 5 booking:
--   2 + 2 + 2 + 2 + 2 = 10 khách
--
-- Chuyến có 8 booking:
--   2 booking đầu có 2 khách, 6 booking còn lại có 1 khách.
--
-- Chuyến có >10 booking:
--   10 booking đầu có 1 khách; các booking còn lại không được tính vào đoàn
--   và được chuyển sang cancelled để không làm sai booked_slots.

DROP TEMPORARY TABLE IF EXISTS tmp_booking_allocations;

CREATE TEMPORARY TABLE tmp_booking_allocations AS
SELECT
    vb.booking_id,
    vb.departure_id,
    vb.booking_order,
    vb.booking_count,
    dt.target_guests,
    CASE
        WHEN vb.booking_order > dt.target_guests THEN 0
        ELSE
            FLOOR(dt.target_guests / vb.booking_count)
            + CASE
                WHEN vb.booking_order <= MOD(dt.target_guests, vb.booking_count)
                THEN 1
                ELSE 0
              END
    END AS allocated_guests
FROM tmp_valid_bookings vb
JOIN tmp_departure_targets dt
    ON dt.departure_id = vb.departure_id;

ALTER TABLE tmp_booking_allocations
    ADD PRIMARY KEY (booking_id),
    ADD INDEX idx_tmp_alloc_departure (departure_id);

-- Booking dư khi một lịch có hơn 10 booking được loại khỏi đoàn.
UPDATE bookings b
JOIN tmp_booking_allocations a
    ON a.booking_id = b.id
SET
    b.booking_status = 'cancelled',
    b.note = CONCAT(
        COALESCE(NULLIF(b.note, ''), ''),
        CASE WHEN b.note IS NULL OR b.note = '' THEN '' ELSE '\n' END,
        '[SEED_10_GUESTS] Booking không nằm trong 10 khách demo của lịch khởi hành.'
    ),
    b.updated_at = NOW()
WHERE a.allocated_guests = 0;

-- =====================================================================
-- 3. XÓA KHÁCH SEED CŨ CỦA CÁC BOOKING ĐƯỢC XỬ LÝ
-- =====================================================================
-- Không xóa dữ liệu người dùng thật một cách mù quáng.
-- Chỉ xóa:
--   - khách có tên dạng "... - Bé đi cùng ..."
--   - khách có tên kết thúc bằng số do seed cũ tạo;
--   - hoặc khách thuộc booking có ghi chú seed demo.
--
-- Nếu toàn bộ database hiện tại đều là seed, có thể bỏ phần điều kiện cuối
-- và xóa toàn bộ booking_guests thuộc tmp_booking_allocations.

DELETE bg
FROM booking_guests bg
JOIN bookings b ON b.id = bg.booking_id
JOIN tmp_booking_allocations a ON a.booking_id = b.id
WHERE
    b.note LIKE '%Seed booking demo%'
    OR b.note LIKE '%[REALISTIC_SEED]%'
    OR bg.full_name REGEXP ' - Bé đi cùng [0-9]+$'
    OR bg.full_name REGEXP ' [0-9]+$';

-- =====================================================================
-- 4. TẠO DANH SÁCH KHÁCH TỪ USERS HIỆN CÓ
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS tmp_active_users;

CREATE TEMPORARY TABLE tmp_active_users AS
SELECT
    u.id,
    u.full_name,
    u.phone,
    u.identity_number,
    u.birth_date,
    ROW_NUMBER() OVER (ORDER BY u.id) AS user_order,
    COUNT(*) OVER () AS total_users
FROM users u
WHERE u.role = 'user'
  AND u.status = 'active';

ALTER TABLE tmp_active_users
    ADD PRIMARY KEY (id),
    ADD UNIQUE INDEX uk_tmp_user_order (user_order);

-- Bảng số 1..10.
DROP TEMPORARY TABLE IF EXISTS tmp_numbers;

CREATE TEMPORARY TABLE tmp_numbers (
    n INT NOT NULL PRIMARY KEY
);

INSERT INTO tmp_numbers(n)
VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10);

-- Mỗi booking nhận đúng allocated_guests khách.
-- Khách đầu tiên ưu tiên chính user chủ booking.
-- Khách tiếp theo lấy vòng từ users đang có, tránh tạo tên giả kiểu "Khách 1".
-- MySQL không cho tham chiếu lại cùng một TEMPORARY TABLE trong một câu lệnh.
-- Vì vậy tách thành 2 câu INSERT: khách chính và khách đi cùng.

-- 4.1. Khách đầu tiên của booking là chính user chủ booking.
INSERT INTO booking_guests (
    booking_id,
    full_name,
    date_of_birth,
    gender,
    guest_type,
    id_number,
    nationality,
    phone,
    dietary_notes,
    health_notes,
    allergy_notes,
    emergency_contact_name,
    emergency_contact_phone,
    created_at,
    updated_at
)
SELECT
    b.id,
    owner.full_name,
    COALESCE(
        owner.birth_date,
        DATE_SUB(CURDATE(), INTERVAL 22 + MOD(owner.id + b.id, 35) YEAR)
    ),
    CASE MOD(owner.id, 2)
        WHEN 0 THEN 'female'
        ELSE 'male'
    END,
    'adult',
    owner.identity_number,
    'Việt Nam',
    owner.phone,
    CASE
        WHEN MOD(owner.id + b.id, 17) = 0 THEN 'Ăn chay'
        WHEN MOD(owner.id + b.id, 19) = 0 THEN 'Không ăn hải sản'
        ELSE NULL
    END,
    CASE
        WHEN MOD(owner.id + b.id, 23) = 0 THEN 'Dễ say xe, ưu tiên ngồi phía trước'
        WHEN MOD(owner.id + b.id, 29) = 0 THEN 'Cần nghỉ đúng giờ do huyết áp'
        ELSE NULL
    END,
    CASE
        WHEN MOD(owner.id + b.id, 31) = 0 THEN 'Dị ứng đậu phộng'
        ELSE NULL
    END,
    owner.full_name,
    owner.phone,
    NOW(),
    NOW()
FROM bookings b
JOIN tmp_booking_allocations a
    ON a.booking_id = b.id
   AND a.allocated_guests > 0
JOIN users owner
    ON owner.id = b.user_id
WHERE NOT EXISTS (
    SELECT 1
    FROM booking_guests existed
    WHERE existed.booking_id = b.id
      AND existed.full_name = owner.full_name
);

-- 4.2. Tạo một bảng tạm riêng cho khách đi cùng để tránh lỗi 1137.
DROP TEMPORARY TABLE IF EXISTS tmp_guest_user_pool;

CREATE TEMPORARY TABLE tmp_guest_user_pool AS
SELECT
    u.id,
    u.full_name,
    u.phone,
    u.identity_number,
    u.birth_date,
    ROW_NUMBER() OVER (ORDER BY u.id) AS user_order
FROM users u
WHERE u.role = 'user'
  AND u.status = 'active';

ALTER TABLE tmp_guest_user_pool
    ADD PRIMARY KEY (id),
    ADD UNIQUE INDEX uk_tmp_guest_user_order (user_order);

SET @active_user_count = (
    SELECT COUNT(*)
    FROM users
    WHERE role = 'user'
      AND status = 'active'
);

INSERT INTO booking_guests (
    booking_id,
    full_name,
    date_of_birth,
    gender,
    guest_type,
    id_number,
    nationality,
    phone,
    dietary_notes,
    health_notes,
    allergy_notes,
    emergency_contact_name,
    emergency_contact_phone,
    created_at,
    updated_at
)
SELECT
    b.id,
    guest_user.full_name,
    COALESCE(
        guest_user.birth_date,
        DATE_SUB(
            CURDATE(),
            INTERVAL 22 + MOD(guest_user.id + nums.n + b.id, 35) YEAR
        )
    ),
    CASE MOD(guest_user.id, 2)
        WHEN 0 THEN 'female'
        ELSE 'male'
    END,
    'adult',
    guest_user.identity_number,
    'Việt Nam',
    guest_user.phone,
    CASE
        WHEN MOD(guest_user.id + b.id, 17) = 0 THEN 'Ăn chay'
        WHEN MOD(guest_user.id + b.id, 19) = 0 THEN 'Không ăn hải sản'
        ELSE NULL
    END,
    CASE
        WHEN MOD(guest_user.id + b.id, 23) = 0 THEN 'Dễ say xe, ưu tiên ngồi phía trước'
        WHEN MOD(guest_user.id + b.id, 29) = 0 THEN 'Cần nghỉ đúng giờ do huyết áp'
        ELSE NULL
    END,
    CASE
        WHEN MOD(guest_user.id + b.id, 31) = 0 THEN 'Dị ứng đậu phộng'
        ELSE NULL
    END,
    owner.full_name,
    owner.phone,
    NOW(),
    NOW()
FROM bookings b
JOIN tmp_booking_allocations a
    ON a.booking_id = b.id
   AND a.allocated_guests > 1
JOIN users owner
    ON owner.id = b.user_id
JOIN tmp_numbers nums
    ON nums.n BETWEEN 2 AND a.allocated_guests
JOIN tmp_guest_user_pool guest_user
    ON guest_user.user_order = 1 + MOD(
        b.id * 7 + a.departure_id * 11 + nums.n * 13,
        @active_user_count
    )
WHERE guest_user.id <> b.user_id
  AND NOT EXISTS (
      SELECT 1
      FROM booking_guests existed
      WHERE existed.booking_id = b.id
        AND existed.full_name = guest_user.full_name
  );

-- Trường hợp user chủ booking không nằm trong tmp_active_users do dữ liệu bất thường,
-- thêm lại chính chủ để booking không bị rỗng.
INSERT INTO booking_guests (
    booking_id,
    full_name,
    date_of_birth,
    gender,
    guest_type,
    id_number,
    nationality,
    phone,
    emergency_contact_name,
    emergency_contact_phone,
    created_at,
    updated_at
)
SELECT
    b.id,
    u.full_name,
    COALESCE(u.birth_date, DATE_SUB(CURDATE(), INTERVAL 30 YEAR)),
    'other',
    'adult',
    u.identity_number,
    'Việt Nam',
    u.phone,
    u.full_name,
    u.phone,
    NOW(),
    NOW()
FROM bookings b
JOIN tmp_booking_allocations a
    ON a.booking_id = b.id
   AND a.allocated_guests > 0
JOIN users u
    ON u.id = b.user_id
WHERE NOT EXISTS (
    SELECT 1
    FROM booking_guests bg
    WHERE bg.booking_id = b.id
);

-- =====================================================================
-- 5. ĐỒNG BỘ SỐ NGƯỜI VÀ GIÁ BOOKING
-- =====================================================================

UPDATE bookings b
JOIN (
    SELECT
        bg.booking_id,
        SUM(bg.guest_type = 'adult') AS adult_count,
        SUM(bg.guest_type = 'child') AS child_count,
        COUNT(*) AS total_guests
    FROM booking_guests bg
    JOIN tmp_booking_allocations a
        ON a.booking_id = bg.booking_id
       AND a.allocated_guests > 0
    GROUP BY bg.booking_id
) g ON g.booking_id = b.id
JOIN tour_departures td ON td.id = b.departure_id
SET
    b.adult_count = g.adult_count,
    b.child_count = g.child_count,
    b.original_amount =
        g.adult_count * td.adult_price
        + g.child_count * td.child_price,
    b.discount_amount = LEAST(
        b.discount_amount,
        g.adult_count * td.adult_price
        + g.child_count * td.child_price
    ),
    b.final_amount =
        (
            g.adult_count * td.adult_price
            + g.child_count * td.child_price
        ) - LEAST(
            b.discount_amount,
            g.adult_count * td.adult_price
            + g.child_count * td.child_price
        ),
    b.note = CONCAT(
        COALESCE(NULLIF(b.note, ''), ''),
        CASE WHEN b.note IS NULL OR b.note = '' THEN '' ELSE '\n' END,
        '[SEED_10_GUESTS] Đã bổ sung hành khách từ danh sách users hiện có.'
    ),
    b.updated_at = NOW();

-- Đồng bộ payment của booking đã thanh toán/xác nhận.
UPDATE payments p
JOIN bookings b ON b.id = p.booking_id
JOIN tmp_booking_allocations a ON a.booking_id = b.id
SET
    p.amount = b.final_amount,
    p.updated_at = NOW()
WHERE p.payment_status IN (
    'pending',
    'waiting_confirmation',
    'paid'
);

-- =====================================================================
-- 6. ĐỒNG BỘ booked_slots / held_slots CỦA LỊCH KHỞI HÀNH
-- =====================================================================

UPDATE tour_departures td
LEFT JOIN (
    SELECT
        b.departure_id,
        SUM(
            CASE
                WHEN b.booking_status IN (
                    'confirmed',
                    'completed',
                    'waiting_confirmation'
                )
                THEN b.adult_count + b.child_count
                ELSE 0
            END
        ) AS booked_guests,
        SUM(
            CASE
                WHEN b.booking_status = 'pending_payment'
                THEN b.adult_count + b.child_count
                ELSE 0
            END
        ) AS held_guests
    FROM bookings b
    GROUP BY b.departure_id
) x ON x.departure_id = td.id
SET
    td.booked_slots = LEAST(COALESCE(x.booked_guests, 0), td.total_slots),
    td.held_slots = LEAST(
        COALESCE(x.held_guests, 0),
        GREATEST(
            td.total_slots - LEAST(COALESCE(x.booked_guests, 0), td.total_slots),
            0
        )
    ),
    td.status = CASE
        WHEN td.status = 'cancelled' THEN 'cancelled'
        WHEN td.end_date < CURDATE() THEN 'completed'
        WHEN td.departure_date <= CURDATE()
             AND td.end_date >= CURDATE() THEN 'departed'
        WHEN LEAST(COALESCE(x.booked_guests, 0), td.total_slots)
             >= td.total_slots THEN 'full'
        ELSE 'open'
    END,
    td.updated_at = NOW();

-- =====================================================================
-- 7. CHUẨN HÓA PHÂN CÔNG HDV: 1 LỊCH KHỞI HÀNH = 1 PHÂN CÔNG ACTIVE
-- =====================================================================
-- Schema hiện tại bắt guide_assignments phải có booking_id.
-- Vì vậy ta dùng booking nhỏ nhất của lịch làm booking đại diện.
-- Backend phải lấy toàn bộ booking cùng departure_id, không chỉ booking đại diện.

DROP TEMPORARY TABLE IF EXISTS tmp_active_assignment_rank;

CREATE TEMPORARY TABLE tmp_active_assignment_rank AS
SELECT
    ga.id AS assignment_id,
    b.departure_id,
    ga.guide_id,
    ga.status,
    ROW_NUMBER() OVER (
        PARTITION BY b.departure_id
        ORDER BY
            CASE ga.status
                WHEN 'in_progress' THEN 1
                WHEN 'accepted' THEN 2
                WHEN 'confirmed' THEN 3
                WHEN 'assigned' THEN 4
                WHEN 'issue' THEN 5
                ELSE 9
            END,
            ga.updated_at DESC,
            ga.id DESC
    ) AS assignment_rank
FROM guide_assignments ga
JOIN bookings b ON b.id = ga.booking_id
WHERE ga.status IN (
    'assigned',
    'accepted',
    'in_progress',
    'confirmed',
    'issue'
);

ALTER TABLE tmp_active_assignment_rank
    ADD PRIMARY KEY (assignment_id),
    ADD INDEX idx_tmp_assignment_departure (departure_id);

-- Các phân công active trùng cùng lịch được đánh dấu replaced.
UPDATE guide_assignments ga
JOIN tmp_active_assignment_rank ranked
    ON ranked.assignment_id = ga.id
SET
    ga.status = 'replaced',
    ga.note = CONCAT(
        COALESCE(NULLIF(ga.note, ''), ''),
        CASE WHEN ga.note IS NULL OR ga.note = '' THEN '' ELSE '\n' END,
        '[NORMALIZE_ASSIGNMENT] Đã gộp phân công theo lịch khởi hành; '
        'phân công này không còn là bản active.'
    ),
    ga.updated_at = NOW()
WHERE ranked.assignment_rank > 1;

-- Đổi booking_id của phân công được giữ lại về booking đại diện.
UPDATE guide_assignments ga
JOIN tmp_active_assignment_rank ranked
    ON ranked.assignment_id = ga.id
   AND ranked.assignment_rank = 1
JOIN (
    SELECT
        b.departure_id,
        MIN(b.id) AS representative_booking_id
    FROM bookings b
    WHERE b.booking_status IN (
        'confirmed',
        'completed',
        'waiting_confirmation'
    )
    GROUP BY b.departure_id
) representative
    ON representative.departure_id = ranked.departure_id
SET
    ga.booking_id = representative.representative_booking_id,
    ga.tour_id = (
        SELECT b2.tour_id
        FROM bookings b2
        WHERE b2.id = representative.representative_booking_id
    ),
    ga.start_date = (
        SELECT td.departure_date
        FROM bookings b3
        JOIN tour_departures td ON td.id = b3.departure_id
        WHERE b3.id = representative.representative_booking_id
    ),
    ga.end_date = (
        SELECT td.end_date
        FROM bookings b4
        JOIN tour_departures td ON td.id = b4.departure_id
        WHERE b4.id = representative.representative_booking_id
    ),
    ga.note = CONCAT(
        COALESCE(NULLIF(ga.note, ''), ''),
        CASE WHEN ga.note IS NULL OR ga.note = '' THEN '' ELSE '\n' END,
        '[NORMALIZE_ASSIGNMENT] Phân công đại diện cho toàn bộ lịch khởi hành.'
    ),
    ga.updated_at = NOW();

-- Trip operation cũng phải trỏ đến đúng guide đang active của departure.
UPDATE trip_operations op
JOIN (
    SELECT
        b.departure_id,
        ga.guide_id
    FROM guide_assignments ga
    JOIN bookings b ON b.id = ga.booking_id
    WHERE ga.status IN (
        'assigned',
        'accepted',
        'in_progress',
        'confirmed',
        'issue'
    )
) active_guide
    ON active_guide.departure_id = op.departure_id
SET
    op.guide_id = active_guide.guide_id,
    op.updated_at = NOW();

-- =====================================================================
-- 8. ĐỒNG BỘ CHECK-IN THEO TẤT CẢ BOOKING CÙNG LỊCH KHỞI HÀNH
-- =====================================================================

INSERT IGNORE INTO passenger_checkins (
    trip_operation_id,
    booking_guest_id,
    status,
    checked_in_at,
    checked_in_by,
    note,
    created_at,
    updated_at
)
SELECT
    op.id,
    bg.id,
    'pending',
    NULL,
    g.user_id,
    CASE
        WHEN bg.health_notes IS NOT NULL
            THEN CONCAT('Sức khỏe: ', bg.health_notes)
        WHEN bg.dietary_notes IS NOT NULL
            THEN CONCAT('Ăn uống: ', bg.dietary_notes)
        ELSE NULL
    END,
    NOW(),
    NOW()
FROM trip_operations op
JOIN bookings b
    ON b.departure_id = op.departure_id
   AND b.booking_status IN (
       'confirmed',
       'completed',
       'waiting_confirmation'
   )
JOIN booking_guests bg
    ON bg.booking_id = b.id
LEFT JOIN guides g
    ON g.id = op.guide_id;

SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

-- =====================================================================
-- 9. TRUY VẤN KIỂM TRA
-- =====================================================================

-- Mỗi lịch khoảng 10 khách và có nhiều booking.
SELECT
    td.id AS departure_id,
    t.name AS tour_name,
    td.departure_date,
    COUNT(DISTINCT b.id) AS booking_count,
    COUNT(DISTINCT bg.id) AS guest_count,
    td.booked_slots,
    td.total_slots
FROM tour_departures td
JOIN tours t ON t.id = td.tour_id
LEFT JOIN bookings b
    ON b.departure_id = td.id
   AND b.booking_status IN (
       'confirmed',
       'completed',
       'waiting_confirmation'
   )
LEFT JOIN booking_guests bg
    ON bg.booking_id = b.id
GROUP BY
    td.id,
    t.name,
    td.departure_date,
    td.booked_slots,
    td.total_slots
ORDER BY td.departure_date, td.id;

-- Kiểm tra mỗi lịch chỉ có một phân công HDV active.
SELECT
    b.departure_id,
    t.name AS tour_name,
    td.departure_date,
    COUNT(*) AS active_assignment_count,
    GROUP_CONCAT(
        CONCAT(g.full_name, ' [', ga.status, ']')
        ORDER BY ga.id
        SEPARATOR ', '
    ) AS guides
FROM guide_assignments ga
JOIN bookings b ON b.id = ga.booking_id
JOIN tour_departures td ON td.id = b.departure_id
JOIN tours t ON t.id = b.tour_id
JOIN guides g ON g.id = ga.guide_id
WHERE ga.status IN (
    'assigned',
    'accepted',
    'in_progress',
    'confirmed',
    'issue'
)
GROUP BY b.departure_id, t.name, td.departure_date
HAVING COUNT(*) >= 1
ORDER BY td.departure_date, b.departure_id;

-- Kiểm tra một phân công phải nhìn thấy toàn bộ booking/khách của departure.
SELECT
    ga.id AS assignment_id,
    g.full_name AS guide_name,
    td.id AS departure_id,
    t.name AS tour_name,
    COUNT(DISTINCT all_b.id) AS booking_count,
    COUNT(DISTINCT bg.id) AS passenger_count
FROM guide_assignments ga
JOIN guides g ON g.id = ga.guide_id
JOIN bookings representative_b ON representative_b.id = ga.booking_id
JOIN tour_departures td ON td.id = representative_b.departure_id
JOIN tours t ON t.id = representative_b.tour_id
LEFT JOIN bookings all_b
    ON all_b.departure_id = representative_b.departure_id
   AND all_b.booking_status IN (
       'confirmed',
       'completed',
       'waiting_confirmation'
   )
LEFT JOIN booking_guests bg ON bg.booking_id = all_b.id
WHERE ga.status IN (
    'assigned',
    'accepted',
    'in_progress',
    'confirmed',
    'issue'
)
GROUP BY
    ga.id,
    g.full_name,
    td.id,
    t.name
ORDER BY td.departure_date, ga.id;




SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

SET @TARGET_GUESTS := 10;

-- ---------------------------------------------------------------------
-- 1. Kiểm tra đủ user để tạo 10 người khác nhau
-- ---------------------------------------------------------------------
SELECT COUNT(*) INTO @ACTIVE_USER_COUNT
FROM users
WHERE role = 'user'
  AND status = 'active';

-- Nếu nhỏ hơn 10, script vẫn chạy nhưng không thể bảo đảm 10 tên khác nhau.
SELECT
  @ACTIVE_USER_COUNT AS active_user_count,
  CASE
    WHEN @ACTIVE_USER_COUNT >= @TARGET_GUESTS
      THEN 'OK - đủ user để mỗi chuyến có 10 người khác nhau'
    ELSE 'CẢNH BÁO - số user active nhỏ hơn 10'
  END AS validation_message;

-- ---------------------------------------------------------------------
-- 2. Booking hợp lệ và thứ tự booking trong mỗi departure
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_seed_booking_rank;

CREATE TEMPORARY TABLE tmp_seed_booking_rank AS
SELECT
  b.id AS booking_id,
  b.departure_id,
  b.tour_id,
  b.user_id,
  ROW_NUMBER() OVER (
    PARTITION BY b.departure_id
    ORDER BY b.id
  ) AS booking_order,
  COUNT(*) OVER (
    PARTITION BY b.departure_id
  ) AS booking_count
FROM bookings b
WHERE b.booking_status IN (
  'confirmed',
  'completed',
  'waiting_confirmation'
);

ALTER TABLE tmp_seed_booking_rank
  ADD PRIMARY KEY (booking_id),
  ADD INDEX idx_tmp_seed_booking_departure (departure_id, booking_order);

-- ---------------------------------------------------------------------
-- 3. Tạo 10 vị trí khách cho mỗi departure
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_seed_numbers;

CREATE TEMPORARY TABLE tmp_seed_numbers (
  slot_no INT NOT NULL PRIMARY KEY
);

INSERT INTO tmp_seed_numbers(slot_no)
VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10);

DROP TEMPORARY TABLE IF EXISTS tmp_seed_guest_slots;

CREATE TEMPORARY TABLE tmp_seed_guest_slots AS
SELECT
  d.departure_id,
  n.slot_no,
  1 + MOD(n.slot_no - 1, LEAST(d.booking_count, @TARGET_GUESTS)) AS booking_order
FROM (
  SELECT
    departure_id,
    MAX(booking_count) AS booking_count
  FROM tmp_seed_booking_rank
  GROUP BY departure_id
) d
JOIN tmp_seed_numbers n
  ON n.slot_no <= @TARGET_GUESTS;

ALTER TABLE tmp_seed_guest_slots
  ADD PRIMARY KEY (departure_id, slot_no),
  ADD INDEX idx_tmp_seed_slot_booking (departure_id, booking_order);

-- ---------------------------------------------------------------------
-- 4. Pool user được đánh số một lần
-- Không dùng lại cùng TEMPORARY TABLE trong subquery nên không lỗi 1137.
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_seed_user_pool;

CREATE TEMPORARY TABLE tmp_seed_user_pool AS
SELECT
  u.id AS user_id,
  u.full_name,
  u.phone,
  u.identity_number,
  u.birth_date,
  u.dietary_notes,
  u.health_notes,
  ROW_NUMBER() OVER (ORDER BY u.id) AS user_order
FROM users u
WHERE u.role = 'user'
  AND u.status = 'active';

ALTER TABLE tmp_seed_user_pool
  ADD PRIMARY KEY (user_id),
  ADD UNIQUE INDEX uk_tmp_seed_user_order (user_order);

-- ---------------------------------------------------------------------
-- 5. Materialize kế hoạch khách.
-- Công thức user_order tăng liên tiếp theo slot_no, do đó nếu có >=10 user
-- thì trong cùng departure sẽ không lặp user.
-- ---------------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_seed_guest_plan;

CREATE TEMPORARY TABLE tmp_seed_guest_plan AS
SELECT
  s.departure_id,
  s.slot_no,
  br.booking_id,
  up.user_id,
  up.full_name,
  up.phone,
  up.identity_number,
  up.birth_date,
  up.dietary_notes,
  up.health_notes
FROM tmp_seed_guest_slots s
JOIN tmp_seed_booking_rank br
  ON br.departure_id = s.departure_id
 AND br.booking_order = s.booking_order
JOIN tmp_seed_user_pool up
  ON up.user_order =
     1 + MOD(
       (s.departure_id * 17) + s.slot_no - 2,
       @ACTIVE_USER_COUNT
     );

ALTER TABLE tmp_seed_guest_plan
  ADD PRIMARY KEY (departure_id, slot_no),
  ADD INDEX idx_tmp_seed_plan_booking (booking_id),
  ADD INDEX idx_tmp_seed_plan_user (departure_id, user_id);

-- ---------------------------------------------------------------------
-- 6. Backup danh sách khách trước khi thay
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS booking_guests_backup_before_unique_seed;

CREATE TABLE booking_guests_backup_before_unique_seed AS
SELECT bg.*
FROM booking_guests bg
JOIN tmp_seed_booking_rank br
  ON br.booking_id = bg.booking_id;

-- ---------------------------------------------------------------------
-- 7. Gỡ liên kết phụ thuộc trước khi xóa guest cũ
-- ---------------------------------------------------------------------
UPDATE incident_tickets it
JOIN booking_guests bg
  ON bg.id = it.booking_guest_id
JOIN tmp_seed_booking_rank br
  ON br.booking_id = bg.booking_id
SET it.booking_guest_id = NULL
WHERE it.booking_guest_id IS NOT NULL;

DELETE pc
FROM passenger_checkins pc
JOIN booking_guests bg
  ON bg.id = pc.booking_guest_id
JOIN tmp_seed_booking_rank br
  ON br.booking_id = bg.booking_id;

DELETE et
FROM electronic_tickets et
JOIN booking_guests bg
  ON bg.id = et.booking_guest_id
JOIN tmp_seed_booking_rank br
  ON br.booking_id = bg.booking_id;

DELETE bg
FROM booking_guests bg
JOIN tmp_seed_booking_rank br
  ON br.booking_id = bg.booking_id;

-- ---------------------------------------------------------------------
-- 8. Thêm lại đúng 10 khách khác nhau cho mỗi departure
-- ---------------------------------------------------------------------
INSERT INTO booking_guests (
  booking_id,
  full_name,
  date_of_birth,
  gender,
  guest_type,
  id_number,
  nationality,
  phone,
  dietary_notes,
  health_notes,
  allergy_notes,
  emergency_contact_name,
  emergency_contact_phone,
  created_at,
  updated_at
)
SELECT
  gp.booking_id,
  gp.full_name,
  COALESCE(
    gp.birth_date,
    DATE_SUB(
      CURDATE(),
      INTERVAL 22 + MOD(gp.user_id + gp.slot_no, 35) YEAR
    )
  ),
  CASE MOD(gp.user_id, 2)
    WHEN 0 THEN 'female'
    ELSE 'male'
  END,
  'adult',
  gp.identity_number,
  'Việt Nam',
  gp.phone,
  gp.dietary_notes,
  gp.health_notes,
  CASE
    WHEN MOD(gp.user_id + gp.departure_id, 31) = 0
      THEN 'Dị ứng đậu phộng'
    ELSE NULL
  END,
  owner.full_name,
  owner.phone,
  NOW(),
  NOW()
FROM tmp_seed_guest_plan gp
JOIN bookings b
  ON b.id = gp.booking_id
LEFT JOIN users owner
  ON owner.id = b.user_id;

-- ---------------------------------------------------------------------
-- 9. Đồng bộ số lượng và giá từng booking
-- ---------------------------------------------------------------------
UPDATE bookings b
JOIN (
  SELECT
    bg.booking_id,
    COUNT(*) AS guest_count
  FROM booking_guests bg
  JOIN tmp_seed_booking_rank br
    ON br.booking_id = bg.booking_id
  GROUP BY bg.booking_id
) x
  ON x.booking_id = b.id
JOIN tour_departures td
  ON td.id = b.departure_id
SET
  b.adult_count = x.guest_count,
  b.child_count = 0,
  b.original_amount = x.guest_count * td.adult_price,
  b.discount_amount = LEAST(
    b.discount_amount,
    x.guest_count * td.adult_price
  ),
  b.final_amount =
    (x.guest_count * td.adult_price)
    - LEAST(
        b.discount_amount,
        x.guest_count * td.adult_price
      ),
  b.updated_at = NOW();

UPDATE payments p
JOIN bookings b
  ON b.id = p.booking_id
JOIN tmp_seed_booking_rank br
  ON br.booking_id = b.id
SET
  p.amount = b.final_amount,
  p.updated_at = NOW()
WHERE p.payment_status IN (
  'pending',
  'waiting_confirmation',
  'paid'
);

-- ---------------------------------------------------------------------
-- 10. Đồng bộ booked_slots / held_slots
-- ---------------------------------------------------------------------
UPDATE tour_departures td
LEFT JOIN (
  SELECT
    b.departure_id,
    SUM(
      CASE
        WHEN b.booking_status IN (
          'confirmed',
          'completed',
          'waiting_confirmation'
        )
        THEN b.adult_count + b.child_count
        ELSE 0
      END
    ) AS booked_guests,
    SUM(
      CASE
        WHEN b.booking_status = 'pending_payment'
        THEN b.adult_count + b.child_count
        ELSE 0
      END
    ) AS held_guests
  FROM bookings b
  GROUP BY b.departure_id
) x
  ON x.departure_id = td.id
SET
  td.booked_slots = LEAST(
    COALESCE(x.booked_guests, 0),
    td.total_slots
  ),
  td.held_slots = LEAST(
    COALESCE(x.held_guests, 0),
    GREATEST(
      td.total_slots
      - LEAST(COALESCE(x.booked_guests, 0), td.total_slots),
      0
    )
  ),
  td.updated_at = NOW();

-- ---------------------------------------------------------------------
-- 11. Tạo lại check-in cho toàn bộ booking cùng departure
-- ---------------------------------------------------------------------
INSERT IGNORE INTO passenger_checkins (
  trip_operation_id,
  booking_guest_id,
  status,
  checked_in_at,
  checked_in_by,
  note,
  created_at,
  updated_at
)
SELECT
  op.id,
  bg.id,
  'pending',
  NULL,
  guide_user.id,
  CASE
    WHEN bg.health_notes IS NOT NULL
      THEN CONCAT('Sức khỏe: ', bg.health_notes)
    WHEN bg.dietary_notes IS NOT NULL
      THEN CONCAT('Ăn uống: ', bg.dietary_notes)
    ELSE NULL
  END,
  NOW(),
  NOW()
FROM trip_operations op
JOIN bookings b
  ON b.departure_id = op.departure_id
 AND b.booking_status IN (
   'confirmed',
   'completed',
   'waiting_confirmation'
 )
JOIN booking_guests bg
  ON bg.booking_id = b.id
LEFT JOIN guides g
  ON g.id = op.guide_id
LEFT JOIN users guide_user
  ON guide_user.id = g.user_id;

SET SQL_SAFE_UPDATES = 1;

-- ---------------------------------------------------------------------
-- 12. Kiểm tra
-- ---------------------------------------------------------------------

-- Không được có tên trùng trong cùng departure.
SELECT
  b.departure_id,
  bg.full_name,
  COUNT(*) AS duplicate_count
FROM booking_guests bg
JOIN bookings b
  ON b.id = bg.booking_id
WHERE b.booking_status IN (
  'confirmed',
  'completed',
  'waiting_confirmation'
)
GROUP BY b.departure_id, bg.full_name
HAVING COUNT(*) > 1;

-- Kết quả đúng: 0 dòng nếu có ít nhất 10 user active.

-- Mỗi departure phải có khoảng 10 khách.
SELECT
  td.id AS departure_id,
  t.name AS tour_name,
  td.departure_date,
  COUNT(DISTINCT b.id) AS booking_count,
  COUNT(bg.id) AS guest_count,
  td.booked_slots,
  td.total_slots
FROM tour_departures td
JOIN tours t
  ON t.id = td.tour_id
LEFT JOIN bookings b
  ON b.departure_id = td.id
 AND b.booking_status IN (
   'confirmed',
   'completed',
   'waiting_confirmation'
 )
LEFT JOIN booking_guests bg
  ON bg.booking_id = b.id
GROUP BY
  td.id,
  t.name,
  td.departure_date,
  td.booked_slots,
  td.total_slots
ORDER BY td.departure_date, td.id;


USE travela_full_mvc;
SET NAMES utf8mb4;
SET SQL_SAFE_UPDATES = 0;

CREATE TABLE IF NOT EXISTS guide_competencies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guide_id BIGINT UNSIGNED NOT NULL,
  competency_type ENUM('language','route','skill','certificate') NOT NULL,
  name VARCHAR(180) NOT NULL,
  level VARCHAR(80) NULL,
  certificate_no VARCHAR(100) NULL,
  issued_by VARCHAR(180) NULL,
  issued_date DATE NULL,
  expiry_date DATE NULL,
  document_url VARCHAR(500) NULL,
  note TEXT NULL,
  verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_guide_competencies_guide (guide_id, competency_type),
  KEY idx_guide_competencies_status (verification_status),
  CONSTRAINT fk_guide_competencies_guide FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  CONSTRAINT fk_guide_competencies_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_guide_competency_columns;
DELIMITER $$
CREATE PROCEDURE add_guide_competency_columns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='note') THEN
    ALTER TABLE guide_competencies ADD COLUMN note TEXT NULL AFTER document_url;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='verification_status') THEN
    ALTER TABLE guide_competencies ADD COLUMN verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending' AFTER note;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='verified_by') THEN
    ALTER TABLE guide_competencies ADD COLUMN verified_by BIGINT UNSIGNED NULL AFTER verification_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='verified_at') THEN
    ALTER TABLE guide_competencies ADD COLUMN verified_at DATETIME NULL AFTER verified_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='rejection_reason') THEN
    ALTER TABLE guide_competencies ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER verified_at;
  END IF;
END$$
DELIMITER ;
CALL add_guide_competency_columns();
DROP PROCEDURE IF EXISTS add_guide_competency_columns;

-- Chuyển dữ liệu cũ từ cột verified (nếu bảng cũ có cột này).
SET @has_verified_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='guide_competencies'
    AND COLUMN_NAME='verified'
);

SET @sync_old_verified_sql := IF(
  @has_verified_column > 0,
  "UPDATE guide_competencies SET verification_status=CASE WHEN verified=1 THEN 'verified' ELSE 'pending' END WHERE verification_status='pending'",
  "SELECT 1"
);
PREPARE sync_old_verified_stmt FROM @sync_old_verified_sql;
EXECUTE sync_old_verified_stmt;
DEALLOCATE PREPARE sync_old_verified_stmt;

SET SQL_SAFE_UPDATES = 0;


-- Tìm một tài khoản Admin để làm người xác minh dữ liệu seed.
SET @admin_id := (
  SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id LIMIT 1
);

-- Mỗi HDV có ít nhất 4 hồ sơ: ngoại ngữ, tuyến điểm, kỹ năng và chứng chỉ.
INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'language','Tiếng Anh giao tiếp',
  CASE MOD(g.id,4) WHEN 0 THEN 'IELTS 6.5' WHEN 1 THEN 'B2' WHEN 2 THEN 'C1' ELSE 'Giao tiếp tốt' END,
  CONCAT('ENG-',LPAD(g.id,5,'0')),
  'British Council Việt Nam',
  DATE_SUB(CURDATE(),INTERVAL 2 + MOD(g.id,4) YEAR),
  DATE_ADD(CURDATE(),INTERVAL 2 YEAR),
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-english.pdf'),
  'Có khả năng giao tiếp và hỗ trợ khách quốc tế.',
  'verified',@admin_id,NOW(),NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='language' AND gc.name='Tiếng Anh giao tiếp'
);

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'route',
  CASE MOD(g.id,5)
    WHEN 0 THEN 'Tuyến miền Trung - Huế - Đà Nẵng - Hội An'
    WHEN 1 THEN 'Tuyến Tây Bắc - Sa Pa - Hà Giang'
    WHEN 2 THEN 'Tuyến biển đảo - Phú Quốc - Nha Trang'
    WHEN 3 THEN 'Tuyến Tây Nguyên - Đà Lạt - Buôn Ma Thuột'
    ELSE 'Tuyến miền Tây - Cần Thơ - Châu Đốc'
  END,
  'Chuyên sâu',NULL,'Travela Training Center',
  DATE_SUB(CURDATE(),INTERVAL 1 YEAR),NULL,
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-route.jpg'),
  'Đã dẫn nhiều đoàn và nắm rõ tuyến điểm, nhà cung cấp, phương án dự phòng.',
  'verified',@admin_id,NOW(),NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='route'
);

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'skill','Sơ cứu và xử lý tình huống khẩn cấp','Khá',
  CONCAT('FA-',LPAD(g.id,5,'0')),'Hội Chữ thập đỏ Việt Nam',
  DATE_SUB(CURDATE(),INTERVAL 10 MONTH),DATE_ADD(CURDATE(),INTERVAL 26 MONTH),
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-first-aid.pdf'),
  'Biết sơ cứu cơ bản, xử lý say xe, tụt huyết áp và liên hệ y tế.',
  CASE WHEN MOD(g.id,4)=0 THEN 'pending' ELSE 'verified' END,
  CASE WHEN MOD(g.id,4)=0 THEN NULL ELSE @admin_id END,
  CASE WHEN MOD(g.id,4)=0 THEN NULL ELSE NOW() END,
  NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='skill' AND gc.name='Sơ cứu và xử lý tình huống khẩn cấp'
);

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'certificate','Thẻ hướng dẫn viên du lịch nội địa','Còn hiệu lực',
  CONCAT('HDV-',YEAR(CURDATE()),'-',LPAD(g.id,6,'0')),
  'Sở Du lịch',
  DATE_SUB(CURDATE(),INTERVAL 1 YEAR),DATE_ADD(CURDATE(),INTERVAL 4 YEAR),
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-card.pdf'),
  'Thẻ hướng dẫn viên phục vụ công tác kiểm tra và phân công.',
  CASE
    WHEN MOD(g.id,7)=0 THEN 'rejected'
    WHEN MOD(g.id,3)=0 THEN 'pending'
    ELSE 'verified'
  END,
  CASE WHEN MOD(g.id,7)=0 OR MOD(g.id,3)=0 THEN NULL ELSE @admin_id END,
  CASE WHEN MOD(g.id,7)=0 OR MOD(g.id,3)=0 THEN NULL ELSE NOW() END,
  CASE WHEN MOD(g.id,7)=0 THEN 'Minh chứng bị mờ, cần tải lại ảnh rõ hai mặt thẻ.' ELSE NULL END,
  NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='certificate' AND gc.name='Thẻ hướng dẫn viên du lịch nội địa'
);

-- Đồng bộ ô Ngoại ngữ & Kỹ năng từ các hồ sơ đã xác minh.
UPDATE guides g
LEFT JOIN (
  SELECT
    guide_id,
    GROUP_CONCAT(
      CASE WHEN level IS NULL OR level='' THEN name ELSE CONCAT(name,' (',level,')') END
      ORDER BY FIELD(competency_type,'language','skill'),name
      SEPARATOR ', '
    ) AS verified_profile
  FROM guide_competencies
  WHERE verification_status='verified'
    AND competency_type IN ('language','skill')
  GROUP BY guide_id
) x ON x.guide_id=g.id
SET g.languages=x.verified_profile,
    g.updated_at=NOW()
WHERE g.status='active';

SELECT
  g.id AS guide_id,
  g.full_name,
  COUNT(gc.id) AS competency_count,
  SUM(gc.verification_status='pending') AS pending_count,
  SUM(gc.verification_status='verified') AS verified_count,
  SUM(gc.verification_status='rejected') AS rejected_count,
  g.languages
FROM guides g
LEFT JOIN guide_competencies gc ON gc.guide_id=g.id
GROUP BY g.id,g.full_name,g.languages
ORDER BY g.id;


CREATE TABLE IF NOT EXISTS guide_competencies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guide_id BIGINT UNSIGNED NOT NULL,
  competency_type ENUM('language','route','skill','certificate') NOT NULL,
  name VARCHAR(180) NOT NULL,
  level VARCHAR(80) NULL,
  certificate_no VARCHAR(100) NULL,
  issued_by VARCHAR(180) NULL,
  issued_date DATE NULL,
  expiry_date DATE NULL,
  document_url VARCHAR(500) NULL,
  note TEXT NULL,
  verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_guide_competencies_guide (guide_id, competency_type),
  KEY idx_guide_competencies_status (verification_status),
  CONSTRAINT fk_guide_competencies_guide FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  CONSTRAINT fk_guide_competencies_verifier FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_guide_competency_columns;
DELIMITER $$
CREATE PROCEDURE add_guide_competency_columns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='note') THEN
    ALTER TABLE guide_competencies ADD COLUMN note TEXT NULL AFTER document_url;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='verification_status') THEN
    ALTER TABLE guide_competencies ADD COLUMN verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending' AFTER note;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='verified_by') THEN
    ALTER TABLE guide_competencies ADD COLUMN verified_by BIGINT UNSIGNED NULL AFTER verification_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='verified_at') THEN
    ALTER TABLE guide_competencies ADD COLUMN verified_at DATETIME NULL AFTER verified_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='guide_competencies' AND COLUMN_NAME='rejection_reason') THEN
    ALTER TABLE guide_competencies ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER verified_at;
  END IF;
END$$
DELIMITER ;
CALL add_guide_competency_columns();
DROP PROCEDURE IF EXISTS add_guide_competency_columns;

-- Chuyển dữ liệu cũ từ cột verified (nếu bảng cũ có cột này).
SET @has_verified_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='guide_competencies'
    AND COLUMN_NAME='verified'
);

SET @sync_old_verified_sql := IF(
  @has_verified_column > 0,
  "UPDATE guide_competencies SET verification_status=CASE WHEN verified=1 THEN 'verified' ELSE 'pending' END WHERE verification_status='pending'",
  "SELECT 1"
);
PREPARE sync_old_verified_stmt FROM @sync_old_verified_sql;
EXECUTE sync_old_verified_stmt;
DEALLOCATE PREPARE sync_old_verified_stmt;

SET SQL_SAFE_UPDATES = 0;


USE travela_full_mvc;
SET NAMES utf8mb4;

-- Tìm một tài khoản Admin để làm người xác minh dữ liệu seed.
SET @admin_id := (
  SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id LIMIT 1
);

-- Mỗi HDV có ít nhất 4 hồ sơ: ngoại ngữ, tuyến điểm, kỹ năng và chứng chỉ.
INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'language','Tiếng Anh giao tiếp',
  CASE MOD(g.id,4) WHEN 0 THEN 'IELTS 6.5' WHEN 1 THEN 'B2' WHEN 2 THEN 'C1' ELSE 'Giao tiếp tốt' END,
  CONCAT('ENG-',LPAD(g.id,5,'0')),
  'British Council Việt Nam',
  DATE_SUB(CURDATE(),INTERVAL 2 + MOD(g.id,4) YEAR),
  DATE_ADD(CURDATE(),INTERVAL 2 YEAR),
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-english.pdf'),
  'Có khả năng giao tiếp và hỗ trợ khách quốc tế.',
  'verified',@admin_id,NOW(),NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='language' AND gc.name='Tiếng Anh giao tiếp'
);

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'route',
  CASE MOD(g.id,5)
    WHEN 0 THEN 'Tuyến miền Trung - Huế - Đà Nẵng - Hội An'
    WHEN 1 THEN 'Tuyến Tây Bắc - Sa Pa - Hà Giang'
    WHEN 2 THEN 'Tuyến biển đảo - Phú Quốc - Nha Trang'
    WHEN 3 THEN 'Tuyến Tây Nguyên - Đà Lạt - Buôn Ma Thuột'
    ELSE 'Tuyến miền Tây - Cần Thơ - Châu Đốc'
  END,
  'Chuyên sâu',NULL,'Travela Training Center',
  DATE_SUB(CURDATE(),INTERVAL 1 YEAR),NULL,
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-route.jpg'),
  'Đã dẫn nhiều đoàn và nắm rõ tuyến điểm, nhà cung cấp, phương án dự phòng.',
  'verified',@admin_id,NOW(),NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='route'
);

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'skill','Sơ cứu và xử lý tình huống khẩn cấp','Khá',
  CONCAT('FA-',LPAD(g.id,5,'0')),'Hội Chữ thập đỏ Việt Nam',
  DATE_SUB(CURDATE(),INTERVAL 10 MONTH),DATE_ADD(CURDATE(),INTERVAL 26 MONTH),
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-first-aid.pdf'),
  'Biết sơ cứu cơ bản, xử lý say xe, tụt huyết áp và liên hệ y tế.',
  CASE WHEN MOD(g.id,4)=0 THEN 'pending' ELSE 'verified' END,
  CASE WHEN MOD(g.id,4)=0 THEN NULL ELSE @admin_id END,
  CASE WHEN MOD(g.id,4)=0 THEN NULL ELSE NOW() END,
  NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='skill' AND gc.name='Sơ cứu và xử lý tình huống khẩn cấp'
);

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'certificate','Thẻ hướng dẫn viên du lịch nội địa','Còn hiệu lực',
  CONCAT('HDV-',YEAR(CURDATE()),'-',LPAD(g.id,6,'0')),
  'Sở Du lịch',
  DATE_SUB(CURDATE(),INTERVAL 1 YEAR),DATE_ADD(CURDATE(),INTERVAL 4 YEAR),
  CONCAT('https://example.com/minh-chung/guide-',g.id,'-card.pdf'),
  'Thẻ hướng dẫn viên phục vụ công tác kiểm tra và phân công.',
  CASE
    WHEN MOD(g.id,7)=0 THEN 'rejected'
    WHEN MOD(g.id,3)=0 THEN 'pending'
    ELSE 'verified'
  END,
  CASE WHEN MOD(g.id,7)=0 OR MOD(g.id,3)=0 THEN NULL ELSE @admin_id END,
  CASE WHEN MOD(g.id,7)=0 OR MOD(g.id,3)=0 THEN NULL ELSE NOW() END,
  CASE WHEN MOD(g.id,7)=0 THEN 'Minh chứng bị mờ, cần tải lại ảnh rõ hai mặt thẻ.' ELSE NULL END,
  NOW(),NOW()
FROM guides g
WHERE g.status='active'
AND NOT EXISTS (
  SELECT 1 FROM guide_competencies gc
  WHERE gc.guide_id=g.id AND gc.competency_type='certificate' AND gc.name='Thẻ hướng dẫn viên du lịch nội địa'
);

-- Đồng bộ ô Ngoại ngữ & Kỹ năng từ các hồ sơ đã xác minh.
UPDATE guides g
LEFT JOIN (
  SELECT
    guide_id,
    GROUP_CONCAT(
      CASE WHEN level IS NULL OR level='' THEN name ELSE CONCAT(name,' (',level,')') END
      ORDER BY FIELD(competency_type,'language','skill'),name
      SEPARATOR ', '
    ) AS verified_profile
  FROM guide_competencies
  WHERE verification_status='verified'
    AND competency_type IN ('language','skill')
  GROUP BY guide_id
) x ON x.guide_id=g.id
SET g.languages=x.verified_profile,
    g.updated_at=NOW()
WHERE g.status='active';

SELECT
  g.id AS guide_id,
  g.full_name,
  COUNT(gc.id) AS competency_count,
  SUM(gc.verification_status='pending') AS pending_count,
  SUM(gc.verification_status='verified') AS verified_count,
  SUM(gc.verification_status='rejected') AS rejected_count,
  g.languages
FROM guides g
LEFT JOIN guide_competencies gc ON gc.guide_id=g.id
GROUP BY g.id,g.full_name,g.languages
ORDER BY g.id;


INSERT INTO suppliers (
  supplier_code,name,supplier_type,tax_code,representative,phone,email,address,
  province,bank_account,bank_name,rating,status,note
) VALUES
('SUP-HOTEL-001','Khách sạn Mường Thanh Luxury Đà Nẵng','hotel','0401551234','Nguyễn Hoài Nam','0905123001','sales.danang@muongthanh.vn','270 Võ Nguyên Giáp, Ngũ Hành Sơn','Đà Nẵng','19036789001','Vietcombank',4.7,'active','Đối tác lưu trú đoàn 4-5 sao.'),
('SUP-HOTEL-002','Sa Pa Horizon Hotel','hotel','5300782211','Lê Thu Hương','0912234002','booking@sapahorizon.vn','018 Phạm Xuân Huân, Sa Pa','Lào Cai','1028899002','VietinBank',4.5,'active','Phù hợp đoàn gia đình và khách quốc tế.'),
('SUP-HOTEL-003','Phú Quốc Ocean Pearl Resort','hotel','1702210908','Trần Minh Quân','0909234003','contract@oceanpearl.vn','99 Trần Hưng Đạo, Dương Đông','Kiên Giang','668899003','ACB',4.8,'active','Resort biển, có phòng gia đình.'),
('SUP-HOTEL-004','Hạ Long Bay View Hotel','hotel','5702098812','Phạm Ngọc Mai','0988234004','sales@halongbayview.vn','Đường Hạ Long, Bãi Cháy','Quảng Ninh','1903777004','Vietcombank',4.4,'active','Có phòng đoàn và buffet sáng.'),
('SUP-HOTEL-005','Đà Lạt Pine Hill Hotel','hotel','5801997701','Võ Thanh Sơn','0938234005','booking@pinehilldalat.vn','12 Trần Phú, Phường 3','Lâm Đồng','0600885005','Sacombank',4.6,'active','Khách sạn trung tâm, bãi đỗ xe 45 chỗ.'),
('SUP-TRANS-001','Công ty Vận tải Du lịch Thành Công','transport','0314551200','Đỗ Quốc Việt','0903111001','dieuhoanh@thanhcongbus.vn','25 Quốc lộ 13, Thủ Đức','TP. Hồ Chí Minh','007100111001','Vietcombank',4.6,'active','Xe 16, 29 và 45 chỗ; hỗ trợ trực 24/7.'),
('SUP-TRANS-002','Limousine Mekong Travel','transport','1801772202','Nguyễn Văn Khải','0918111002','booking@mekonglimo.vn','91 Nguyễn Văn Cừ','Cần Thơ','1100222002','BIDV',4.5,'active','Limousine 9-18 chỗ tuyến miền Tây.'),
('SUP-TRANS-003','Đông Bắc Tourist Bus','transport','5701883303','Bùi Đức Long','0988111003','ops@dongbacbus.vn','Bãi Cháy','Quảng Ninh','2200333003','MB Bank',4.4,'active','Xe đoàn Hạ Long, Ninh Bình, Hà Nội.'),
('SUP-TRANS-004','Central Vietnam Coach','transport','0401664404','Lê Minh Tâm','0905111004','dispatch@centralcoach.vn','Cẩm Lệ','Đà Nẵng','3300444004','Techcombank',4.7,'active','Xe đời mới, tài xế tuyến Huế - Đà Nẵng - Hội An.'),
('SUP-REST-001','Nhà hàng Hải Sản Biển Đông','restaurant','0401775501','Trần Thị Lan','0905444001','sales@biendongrestaurant.vn','Võ Nguyên Giáp, Sơn Trà','Đà Nẵng','4400555001','VietinBank',4.6,'active','Nhận đoàn 150 khách, có suất chay và thực đơn dị ứng.'),
('SUP-REST-002','Nhà hàng Cơm Niêu Đà Lạt','restaurant','5801886602','Nguyễn Thảo Vy','0918444002','group@comnieudalat.vn','Hồ Tùng Mậu','Lâm Đồng','5500666002','Agribank',4.5,'active','Thực đơn đoàn, hỗ trợ trẻ em.'),
('SUP-REST-003','Nhà hàng Hương Việt Sa Pa','restaurant','5301997703','Vàng A Chư','0982444003','booking@huongvietsapa.vn','Xuân Viên, Sa Pa','Lào Cai','6600777003','BIDV',4.4,'active','Món địa phương, hỗ trợ suất ăn không cay.'),
('SUP-REST-004','Mekong Garden Restaurant','restaurant','1802008804','Phạm Gia Hân','0907444004','event@mekonggarden.vn','Ninh Kiều','Cần Thơ','7700888004','ACB',4.7,'active','Sức chứa 200 khách, bến tàu gần nhà hàng.'),
('SUP-ATTR-001','Sun World Ba Na Hills','attraction','0401770011','Phòng Kinh doanh Đoàn','02363791234','group@banahills.com.vn','Hòa Vang','Đà Nẵng','8800990011','Vietcombank',4.8,'active','Vé đoàn và hỗ trợ HDV.'),
('SUP-ATTR-002','Khu du lịch Fansipan Legend','attraction','5301880022','Bộ phận Đoàn','02143818888','group@fansipanlegend.vn','Sa Pa','Lào Cai','9900110022','BIDV',4.8,'active','Cáp treo, combo đoàn và ưu tiên đặt trước.'),
('SUP-ATTR-003','VinWonders Phú Quốc','attraction','1701990033','Nguyễn Thanh Bình','02973566666','b2b@vinwonders.vn','Gành Dầu','Kiên Giang','1010220033','Techcombank',4.9,'active','Vé B2B cho đoàn gia đình.'),
('SUP-INS-001','Bảo hiểm Bảo Việt Du lịch','insurance','0100112233','Phạm Quốc Anh','1900558899','travel@baoviet.com.vn','Lê Thái Tổ, Hoàn Kiếm','Hà Nội','2020330011','Vietcombank',4.8,'active','Bảo hiểm du lịch nội địa và quốc tế.'),
('SUP-INS-002','PVI Travel Care','insurance','0101445566','Lê Hồng Nhung','1900545458','travelcare@pvi.com.vn','Cầu Giấy','Hà Nội','3030440022','BIDV',4.7,'active','Cấp chứng nhận điện tử theo danh sách đoàn.'),
('SUP-OTHER-001','Dịch vụ Y tế Du lịch An Tâm','other','0312667788','BS. Nguyễn Minh Khoa','0909777888','hotline@antammedical.vn','Quận 3','TP. Hồ Chí Minh','4040550033','MB Bank',4.6,'active','Hỗ trợ y tế đoàn, túi sơ cứu và hotline 24/7.')
ON DUPLICATE KEY UPDATE
  name=VALUES(name), supplier_type=VALUES(supplier_type), representative=VALUES(representative),
  phone=VALUES(phone), email=VALUES(email), address=VALUES(address), province=VALUES(province),
  rating=VALUES(rating), status=VALUES(status), note=VALUES(note), updated_at=NOW();

SELECT supplier_type, COUNT(*) AS total, ROUND(AVG(rating),2) AS avg_rating
FROM suppliers GROUP BY supplier_type ORDER BY supplier_type;


SET SQL_SAFE_UPDATES = 0;

-- Bảng này đã có trong migration operational expansion. Khối CREATE giúp
-- script không lỗi nếu bạn chưa chạy migration thủ công trước đó.
CREATE TABLE IF NOT EXISTS departure_change_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(50) NOT NULL UNIQUE,
  booking_id BIGINT UNSIGNED NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  old_departure_id BIGINT UNSIGNED NOT NULL,
  new_departure_id BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  old_amount DECIMAL(12,2) NOT NULL,
  new_amount DECIMAL(12,2) NULL,
  price_difference DECIMAL(12,2) NULL,
  admin_note TEXT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_departure_change_booking(booking_id,status),
  KEY idx_departure_change_new(new_departure_id,status),
  CONSTRAINT fk_dc_booking FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_dc_requester FOREIGN KEY(requested_by) REFERENCES users(id),
  CONSTRAINT fk_dc_old FOREIGN KEY(old_departure_id) REFERENCES tour_departures(id),
  CONSTRAINT fk_dc_new FOREIGN KEY(new_departure_id) REFERENCES tour_departures(id),
  CONSTRAINT fk_dc_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

DROP TEMPORARY TABLE IF EXISTS tmp_change_candidates;
CREATE TEMPORARY TABLE tmp_change_candidates AS
SELECT
  b.id AS booking_id,
  b.user_id AS requested_by,
  b.departure_id AS old_departure_id,
  nd.id AS new_departure_id,
  b.final_amount AS old_amount,
  (b.adult_count * nd.adult_price + b.child_count * nd.child_price) AS new_amount,
  ROW_NUMBER() OVER (
    PARTITION BY b.id
    ORDER BY
      ABS(DATEDIFF(nd.departure_date, od.departure_date)),
      nd.departure_date,
      nd.id
  ) AS candidate_rank
FROM bookings b
JOIN tour_departures od ON od.id = b.departure_id
JOIN tour_departures nd
  ON nd.tour_id = b.tour_id
 AND nd.id <> b.departure_id
 AND nd.status NOT IN ('cancelled','full','completed')
 AND nd.departure_date > CURDATE()
WHERE b.user_id IS NOT NULL
  AND b.booking_status IN ('confirmed','waiting_confirmation','completed')
  AND NOT EXISTS (
    SELECT 1
    FROM departure_change_requests r
    WHERE r.booking_id = b.id
      AND r.status IN ('pending','awaiting_payment')
  );

ALTER TABLE tmp_change_candidates
  ADD INDEX idx_tmp_change_booking (booking_id, candidate_rank);

-- Tạo tối đa 30 yêu cầu. 18 pending để Admin thao tác, phần còn lại làm lịch sử.
INSERT INTO departure_change_requests (
  request_code,
  booking_id,
  requested_by,
  old_departure_id,
  new_departure_id,
  reason,
  status,
  old_amount,
  new_amount,
  price_difference,
  admin_note,
  reviewed_by,
  reviewed_at,
  completed_at,
  created_at,
  updated_at
)
SELECT
  CONCAT('DCR-SEED-', LPAD(c.booking_id, 8, '0')),
  c.booking_id,
  c.requested_by,
  c.old_departure_id,
  c.new_departure_id,
  CASE MOD(c.booking_id, 6)
    WHEN 0 THEN 'Khách có lịch công tác đột xuất, muốn chuyển sang ngày khởi hành kế tiếp.'
    WHEN 1 THEN 'Gia đình có việc bận và cần đổi sang lịch phù hợp hơn.'
    WHEN 2 THEN 'Khách muốn đi cùng nhóm bạn đã đặt ở lịch khác.'
    WHEN 3 THEN 'Ngày khởi hành cũ trùng lịch khám sức khỏe.'
    WHEN 4 THEN 'Khách thay đổi kế hoạch nghỉ phép.'
    ELSE 'Khách đề nghị đổi lịch do lý do cá nhân.'
  END,
  CASE
    WHEN MOD(c.booking_id, 10) IN (0,1,2,3,4,5) THEN 'pending'
    WHEN MOD(c.booking_id, 10) = 6 THEN 'awaiting_payment'
    WHEN MOD(c.booking_id, 10) IN (7,8) THEN 'rejected'
    ELSE 'completed'
  END,
  c.old_amount,
  c.new_amount,
  c.new_amount - c.old_amount,
  CASE
    WHEN MOD(c.booking_id, 10) IN (7,8)
      THEN 'Lịch mới không còn đủ chỗ hoặc không đáp ứng điều kiện đổi lịch.'
    WHEN MOD(c.booking_id, 10) = 9
      THEN 'Đã xác nhận đổi lịch và thông báo cho khách hàng.'
    WHEN MOD(c.booking_id, 10) = 6
      THEN 'Khách cần thanh toán phần chênh lệch trước khi hoàn tất.'
    ELSE NULL
  END,
  CASE WHEN MOD(c.booking_id, 10) >= 6 THEN 1 ELSE NULL END,
  CASE WHEN MOD(c.booking_id, 10) >= 6 THEN DATE_SUB(NOW(), INTERVAL MOD(c.booking_id, 12) DAY) ELSE NULL END,
  CASE WHEN MOD(c.booking_id, 10) = 9 THEN DATE_SUB(NOW(), INTERVAL MOD(c.booking_id, 8) DAY) ELSE NULL END,
  DATE_SUB(NOW(), INTERVAL MOD(c.booking_id, 20) DAY),
  NOW()
FROM tmp_change_candidates c
WHERE c.candidate_rank = 1
ORDER BY c.booking_id DESC
LIMIT 30
ON DUPLICATE KEY UPDATE
  new_departure_id = VALUES(new_departure_id),
  reason = VALUES(reason),
  old_amount = VALUES(old_amount),
  new_amount = VALUES(new_amount),
  price_difference = VALUES(price_difference),
  updated_at = NOW();

SET SQL_SAFE_UPDATES = 1;

-- Kiểm tra kết quả
SELECT
  r.id,
  r.request_code,
  b.booking_code,
  t.name AS tour_name,
  od.departure_date AS old_date,
  nd.departure_date AS new_date,
  r.status,
  r.price_difference,
  r.reason,
  r.created_at
FROM departure_change_requests r
JOIN bookings b ON b.id = r.booking_id
JOIN tours t ON t.id = b.tour_id
JOIN tour_departures od ON od.id = r.old_departure_id
JOIN tour_departures nd ON nd.id = r.new_departure_id
WHERE r.request_code LIKE 'DCR-SEED-%'
ORDER BY FIELD(r.status,'pending','awaiting_payment','rejected','completed'), r.created_at DESC;



ALTER TABLE tour_accommodations
ADD COLUMN supplier_id BIGINT UNSIGNED NULL
AFTER tour_id;

ALTER TABLE tour_accommodations
ADD CONSTRAINT fk_tour_accommodations_supplier
FOREIGN KEY (supplier_id)
REFERENCES suppliers(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX idx_tour_accommodations_supplier
ON tour_accommodations(supplier_id);


ALTER TABLE tour_transports
ADD COLUMN supplier_id BIGINT UNSIGNED NULL
AFTER tour_id;

ALTER TABLE tour_transports
ADD CONSTRAINT fk_tour_transports_supplier
FOREIGN KEY (supplier_id)
REFERENCES suppliers(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX idx_tour_transports_supplier
ON tour_transports(supplier_id);


SET SQL_SAFE_UPDATES = 0;

-- Chuẩn hóa dữ liệu cũ trước khi đổi ENUM.
UPDATE guide_availabilities
SET availability_type = 'unavailable'
WHERE availability_type IS NULL
   OR availability_type = ''
   OR availability_type NOT IN (
     'available',
     'unavailable',
     'leave',
     'training',
     'personal'
   );

UPDATE guide_availabilities
SET status = CASE
  WHEN status IN ('approved', 'verified') THEN 'active'
  WHEN status IN ('denied') THEN 'rejected'
  WHEN status IN ('deleted', 'inactive') THEN 'cancelled'
  WHEN status IN ('pending', 'active', 'rejected', 'cancelled') THEN status
  ELSE 'pending'
END;

ALTER TABLE guide_availabilities
  MODIFY availability_type ENUM(
    'available',
    'unavailable',
    'leave',
    'training',
    'personal'
  ) NOT NULL DEFAULT 'unavailable',
  MODIFY status ENUM(
    'pending',
    'active',
    'rejected',
    'cancelled'
  ) NOT NULL DEFAULT 'pending';

-- Thêm index phục vụ trang admin duyệt.
CREATE INDEX idx_guide_availability_status_type
ON guide_availabilities(status, availability_type);

SET SQL_SAFE_UPDATES = 1;


SET SQL_SAFE_UPDATES = 0;

-- Đồng bộ dữ liệu cũ.
UPDATE guide_competencies
SET verification_status = CASE
  WHEN verified = 1 THEN 'verified'
  WHEN verification_status = 'rejected' THEN 'rejected'
  ELSE 'pending'
END
WHERE verification_status IS NULL
   OR verification_status = ''
   OR verification_status = 'pending';

-- Sau khi backend đã chuyển sang verification_status,
-- có thể bỏ cột verified cũ.
ALTER TABLE guide_competencies
DROP COLUMN verified;

SET SQL_SAFE_UPDATES = 1;


SET SQL_SAFE_UPDATES = 0;

-- Chuẩn hóa loại lịch trước khi chuyển sang ENUM.
UPDATE guide_availabilities
SET availability_type = 'unavailable'
WHERE availability_type IS NULL
   OR TRIM(availability_type) = ''
   OR availability_type NOT IN (
       'available',
       'unavailable',
       'leave',
       'training',
       'personal'
   );

-- Chuẩn hóa trạng thái cũ.
UPDATE guide_availabilities
SET status = CASE
    WHEN status IN ('approved', 'verified') THEN 'active'
    WHEN status IN ('denied') THEN 'rejected'
    WHEN status IN ('deleted', 'inactive') THEN 'cancelled'
    WHEN status IN ('pending', 'active', 'rejected', 'cancelled') THEN status
    ELSE 'pending'
END;

ALTER TABLE guide_availabilities
    MODIFY availability_type ENUM(
        'available',
        'unavailable',
        'leave',
        'training',
        'personal'
    ) NOT NULL DEFAULT 'unavailable',
    MODIFY status ENUM(
        'pending',
        'active',
        'rejected',
        'cancelled'
    ) NOT NULL DEFAULT 'pending';

-- Chỉ tạo index nếu chưa tồn tại.
SET @has_status_type_index := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'guide_availabilities'
      AND INDEX_NAME = 'idx_guide_availability_status_type'
);

SET @create_status_type_index_sql := IF(
    @has_status_type_index = 0,
    'CREATE INDEX idx_guide_availability_status_type
     ON guide_availabilities(status, availability_type)',
    'SELECT 1'
);

PREPARE create_status_type_index_stmt
FROM @create_status_type_index_sql;

EXECUTE create_status_type_index_stmt;
DEALLOCATE PREPARE create_status_type_index_stmt;

SET SQL_SAFE_UPDATES = 1;


SET SQL_SAFE_UPDATES = 0;

-- =========================================================
-- SEED YÊU CẦU LỊCH BẬN HDV ĐANG CHỜ ADMIN DUYỆT
-- =========================================================

-- Xóa dữ liệu pending seed cũ của đoạn script này để có thể chạy lại.
DELETE FROM guide_availabilities
WHERE reason LIKE '[PENDING_SEED] %'
  AND status = 'pending';

-- =========================================================
-- 1. YÊU CẦU NGHỈ CÁ NHÂN
-- Mỗi HDV một yêu cầu, đặt sau lịch phân công cuối cùng.
-- =========================================================

INSERT INTO guide_availabilities (
    guide_id,
    availability_type,
    start_at,
    end_at,
    all_day,
    reason,
    status,
    created_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
)
SELECT
    g.id,
    CASE MOD(g.id, 3)
        WHEN 0 THEN 'leave'
        WHEN 1 THEN 'personal'
        ELSE 'unavailable'
    END AS availability_type,

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 7 + MOD(g.id, 5) DAY
        ),
        '00:00:00'
    ) AS start_at,

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 7 + MOD(g.id, 5) DAY
        ),
        '23:59:59'
    ) AS end_at,

    TRUE,

    CASE MOD(g.id, 3)
        WHEN 0 THEN '[PENDING_SEED] Xin nghỉ phép để giải quyết việc gia đình'
        WHEN 1 THEN '[PENDING_SEED] Có việc cá nhân không thể nhận tour'
        ELSE '[PENDING_SEED] Không thể nhận lịch tour trong ngày đã đăng ký'
    END AS reason,

    'pending',
    g.user_id,
    NULL,
    NULL,
    NOW(),
    NOW()

FROM guides g
LEFT JOIN guide_assignments ga
    ON ga.guide_id = g.id
WHERE g.status = 'active'
  AND g.user_id IS NOT NULL
GROUP BY
    g.id,
    g.user_id;

-- =========================================================
-- 2. YÊU CẦU THAM GIA ĐÀO TẠO
-- Tạo thêm một yêu cầu khác cho mỗi HDV.
-- =========================================================

INSERT INTO guide_availabilities (
    guide_id,
    availability_type,
    start_at,
    end_at,
    all_day,
    reason,
    status,
    created_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
)
SELECT
    g.id,
    'training',

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 18 + MOD(g.id, 6) DAY
        ),
        '08:00:00'
    ) AS start_at,

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 18 + MOD(g.id, 6) DAY
        ),
        '17:00:00'
    ) AS end_at,

    FALSE,
    '[PENDING_SEED] Tham gia khóa đào tạo nghiệp vụ hướng dẫn viên',
    'pending',
    g.user_id,
    NULL,
    NULL,
    NOW(),
    NOW()

FROM guides g
LEFT JOIN guide_assignments ga
    ON ga.guide_id = g.id
WHERE g.status = 'active'
  AND g.user_id IS NOT NULL
GROUP BY
    g.id,
    g.user_id;

-- =========================================================
-- 3. TẠO THÊM MỘT SỐ YÊU CẦU NGẮN THEO GIỜ
-- Chỉ áp dụng cho HDV có id chia hết cho 4.
-- =========================================================

INSERT INTO guide_availabilities (
    guide_id,
    availability_type,
    start_at,
    end_at,
    all_day,
    reason,
    status,
    created_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
)
SELECT
    g.id,
    'personal',

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 29 + MOD(g.id, 4) DAY
        ),
        '13:00:00'
    ),

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 29 + MOD(g.id, 4) DAY
        ),
        '18:00:00'
    ),

    FALSE,
    '[PENDING_SEED] Xin nghỉ buổi chiều để giải quyết công việc cá nhân',
    'pending',
    g.user_id,
    NULL,
    NULL,
    NOW(),
    NOW()

FROM guides g
LEFT JOIN guide_assignments ga
    ON ga.guide_id = g.id
WHERE g.status = 'active'
  AND g.user_id IS NOT NULL
  AND MOD(g.id, 4) = 0
GROUP BY
    g.id,
    g.user_id;

SET SQL_SAFE_UPDATES = 1;



START TRANSACTION;

-- ============================================================
-- 1. BỔ SUNG 4 LOẠI ĐIỂM ĐÓN CHO MỖI LỊCH KHỞI HÀNH
--    - Điểm đón địa phương
--    - Nhà văn hóa Thanh Niên, TP.HCM
--    - Bến xe Cần Thơ
--    - Liên hệ tư vấn
-- ============================================================

-- 1.1 Điểm đón địa phương, tự xác định theo tỉnh/thành của điểm đến.
INSERT INTO tour_pickup_points
(
    tour_id,
    departure_id,
    province,
    name,
    address,
    pickup_time,
    note,
    status,
    created_at,
    updated_at
)
SELECT
    td.tour_id,
    td.id,
    d.province,
    CASE
        WHEN d.province = 'Kiên Giang' THEN 'Cảng tàu/Sân bay Phú Quốc'
        WHEN d.province = 'Khánh Hòa' THEN 'Quảng trường 2/4 Nha Trang'
        WHEN d.province = 'Lâm Đồng' THEN 'Quảng trường Lâm Viên'
        WHEN d.province = 'Đà Nẵng' THEN 'Công viên Biển Đông'
        WHEN d.province = 'Cần Thơ' THEN 'Bến Ninh Kiều'
        WHEN d.province = 'Lào Cai' THEN 'Nhà thờ đá Sa Pa'
        WHEN d.province = 'Quảng Ninh' THEN 'Cổng Sun World Hạ Long'
        WHEN d.province = 'Quảng Nam' THEN 'Bưu điện Hội An'
        WHEN d.province IN ('Thừa Thiên Huế', 'Huế') THEN 'Nhà hát Sông Hương'
        WHEN d.province = 'Bình Thuận' THEN 'Lotte Mart Phan Thiết'
        WHEN d.province = 'Bình Định' THEN 'Quảng trường Nguyễn Tất Thành'
        WHEN d.province = 'Ninh Bình' THEN 'Bến thuyền Tràng An'
        WHEN d.province = 'Hà Giang' THEN 'Cột mốc Km0 Hà Giang'
        WHEN d.province = 'Sơn La' THEN 'Khách sạn Mường Thanh Mộc Châu'
        WHEN d.province = 'Đắk Lắk' THEN 'Ngã sáu Buôn Ma Thuột'
        WHEN d.province = 'Bà Rịa - Vũng Tàu' THEN 'Bãi Sau Vũng Tàu'
        WHEN d.province = 'Tây Ninh' THEN 'Tòa Thánh Cao Đài Tây Ninh'
        WHEN d.province = 'An Giang' THEN 'Miếu Bà Chúa Xứ Núi Sam'
        WHEN d.province = 'Cà Mau' THEN 'Quảng trường Thanh Niên Cà Mau'
        ELSE CONCAT('Điểm đón trung tâm ', d.province)
    END,
    CASE
        WHEN d.province = 'Kiên Giang' THEN 'Sân bay Phú Quốc hoặc cảng Bãi Vòng, TP. Phú Quốc'
        WHEN d.province = 'Khánh Hòa' THEN 'Trần Phú, Lộc Thọ, Nha Trang'
        WHEN d.province = 'Lâm Đồng' THEN 'Đường Trần Quốc Toản, Phường 10, Đà Lạt'
        WHEN d.province = 'Đà Nẵng' THEN 'Võ Nguyên Giáp, Sơn Trà, Đà Nẵng'
        WHEN d.province = 'Cần Thơ' THEN 'Đường Hai Bà Trưng, Ninh Kiều, Cần Thơ'
        WHEN d.province = 'Lào Cai' THEN 'Thị trấn Sa Pa, Lào Cai'
        WHEN d.province = 'Quảng Ninh' THEN 'Hạ Long, Quảng Ninh'
        WHEN d.province = 'Quảng Nam' THEN '06 Trần Hưng Đạo, Hội An'
        WHEN d.province IN ('Thừa Thiên Huế', 'Huế') THEN 'Lê Lợi, TP. Huế'
        WHEN d.province = 'Bình Thuận' THEN 'Khu đô thị Hùng Vương, Phan Thiết'
        WHEN d.province = 'Bình Định' THEN 'An Dương Vương, Quy Nhơn'
        WHEN d.province = 'Ninh Bình' THEN 'Tràng An, Ninh Bình'
        WHEN d.province = 'Hà Giang' THEN 'Trung tâm TP. Hà Giang'
        WHEN d.province = 'Sơn La' THEN 'Hoàng Quốc Việt, Mộc Châu'
        WHEN d.province = 'Đắk Lắk' THEN 'Trung tâm TP. Buôn Ma Thuột'
        WHEN d.province = 'Bà Rịa - Vũng Tàu' THEN 'Thùy Vân, TP. Vũng Tàu'
        WHEN d.province = 'Tây Ninh' THEN 'Phạm Hộ Pháp, Hòa Thành, Tây Ninh'
        WHEN d.province = 'An Giang' THEN 'Phường Núi Sam, Châu Đốc, An Giang'
        WHEN d.province = 'Cà Mau' THEN 'Đường Trần Hưng Đạo, TP. Cà Mau'
        ELSE CONCAT('Trung tâm ', d.province)
    END,
    '06:00:00',
    'Vui lòng có mặt trước giờ đón ít nhất 15 phút.',
    'active',
    NOW(),
    NOW()
FROM tour_departures td
JOIN tours t ON t.id = td.tour_id
JOIN destinations d ON d.id = t.destination_id
WHERE NOT EXISTS (
    SELECT 1
    FROM tour_pickup_points p
    WHERE p.departure_id = td.id
      AND p.province = d.province
      AND p.status = 'active'
);

-- 1.2 Điểm đón TP.HCM.
INSERT INTO tour_pickup_points
(
    tour_id, departure_id, province, name, address,
    pickup_time, note, status, created_at, updated_at
)
SELECT
    td.tour_id,
    td.id,
    'TP.HCM',
    'Nhà văn hóa Thanh Niên',
    '04 Phạm Ngọc Thạch, Phường Bến Nghé, Quận 1, TP.HCM',
    '04:30:00',
    'Xe khởi hành đúng giờ; hành khách có mặt trước 20 phút.',
    'active',
    NOW(),
    NOW()
FROM tour_departures td
WHERE NOT EXISTS (
    SELECT 1
    FROM tour_pickup_points p
    WHERE p.departure_id = td.id
      AND p.province = 'TP.HCM'
      AND p.name = 'Nhà văn hóa Thanh Niên'
);

-- 1.3 Điểm đón Cần Thơ.
INSERT INTO tour_pickup_points
(
    tour_id, departure_id, province, name, address,
    pickup_time, note, status, created_at, updated_at
)
SELECT
    td.tour_id,
    td.id,
    'Cần Thơ',
    'Bến xe Cần Thơ',
    '91B Nguyễn Văn Linh, Hưng Lợi, Ninh Kiều, Cần Thơ',
    '03:30:00',
    'Nhân viên Travela sẽ gọi xác nhận trước ngày khởi hành.',
    'active',
    NOW(),
    NOW()
FROM tour_departures td
WHERE NOT EXISTS (
    SELECT 1
    FROM tour_pickup_points p
    WHERE p.departure_id = td.id
      AND p.province = 'Cần Thơ'
      AND p.name = 'Bến xe Cần Thơ'
);

-- 1.4 Điểm đón linh hoạt.
INSERT INTO tour_pickup_points
(
    tour_id, departure_id, province, name, address,
    pickup_time, note, status, created_at, updated_at
)
SELECT
    td.tour_id,
    td.id,
    'Khác',
    'Liên hệ tư vấn điểm đón phù hợp',
    'Travela sẽ liên hệ xác nhận điểm đón sau khi đặt tour',
    NULL,
    'Điểm đón thực tế phụ thuộc tuyến xe và khu vực của khách.',
    'active',
    NOW(),
    NOW()
FROM tour_departures td
WHERE NOT EXISTS (
    SELECT 1
    FROM tour_pickup_points p
    WHERE p.departure_id = td.id
      AND p.province = 'Khác'
      AND p.name = 'Liên hệ tư vấn điểm đón phù hợp'
);

-- ============================================================
-- 2. TẠO HỒ SƠ HƯỚNG DẪN VIÊN DEMO
--    user_id để NULL nên không cần tạo tài khoản/mật khẩu.
-- ============================================================
INSERT INTO guides
(
    user_id, full_name, phone, email, identity_number,
    languages, experience_years, status, note,
    created_at, updated_at
)
SELECT NULL, 'Nguyễn Minh Hải', '0909001001', 'guide.seed01@travela.vn', '079201000001',
       'Tiếng Việt, Tiếng Anh', 6, 'active', 'HDV seed cho dữ liệu điều hành và sự cố.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM guides WHERE email = 'guide.seed01@travela.vn');

INSERT INTO guides
(user_id, full_name, phone, email, identity_number, languages, experience_years, status, note, created_at, updated_at)
SELECT NULL, 'Trần Thu Trang', '0909001002', 'guide.seed02@travela.vn', '079201000002',
       'Tiếng Việt, Tiếng Anh, Tiếng Trung', 5, 'active', 'HDV seed cho dữ liệu điều hành và sự cố.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM guides WHERE email = 'guide.seed02@travela.vn');

INSERT INTO guides
(user_id, full_name, phone, email, identity_number, languages, experience_years, status, note, created_at, updated_at)
SELECT NULL, 'Lê Quốc Bảo', '0909001003', 'guide.seed03@travela.vn', '079201000003',
       'Tiếng Việt, Tiếng Anh', 8, 'active', 'HDV seed cho dữ liệu điều hành và sự cố.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM guides WHERE email = 'guide.seed03@travela.vn');

INSERT INTO guides
(user_id, full_name, phone, email, identity_number, languages, experience_years, status, note, created_at, updated_at)
SELECT NULL, 'Phạm Ngọc Anh', '0909001004', 'guide.seed04@travela.vn', '079201000004',
       'Tiếng Việt, Tiếng Hàn', 4, 'active', 'HDV seed cho dữ liệu điều hành và sự cố.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM guides WHERE email = 'guide.seed04@travela.vn');

INSERT INTO guides
(user_id, full_name, phone, email, identity_number, languages, experience_years, status, note, created_at, updated_at)
SELECT NULL, 'Võ Hoàng Nam', '0909001005', 'guide.seed05@travela.vn', '079201000005',
       'Tiếng Việt, Tiếng Anh', 7, 'active', 'HDV seed cho dữ liệu điều hành và sự cố.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM guides WHERE email = 'guide.seed05@travela.vn');

INSERT INTO guides
(user_id, full_name, phone, email, identity_number, languages, experience_years, status, note, created_at, updated_at)
SELECT NULL, 'Đặng Mỹ Linh', '0909001006', 'guide.seed06@travela.vn', '079201000006',
       'Tiếng Việt, Tiếng Anh, Tiếng Nhật', 5, 'active', 'HDV seed cho dữ liệu điều hành và sự cố.', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM guides WHERE email = 'guide.seed06@travela.vn');

-- ============================================================
-- 3. CHUẨN HÓA MỘT SỐ BOOKING DEMO THÀNH ĐÃ XÁC NHẬN
-- ============================================================
UPDATE bookings
SET booking_status = 'confirmed',
    hold_expires_at = NULL,
    updated_at = NOW()
WHERE booking_code IN (
    'BK1781254525128',
    'BK1781259599316',
    'BK1781323941285',
    'BK1781324440363',
    'BK1782567206942',
    'BK1782569626638',
    'BK1782569979453',
    'BK1782816398217',
    'BK1782825493894',
    'BK1782825596376',
    'BK1782828238901',
    'REAL2026-0027-001'
);

-- Cập nhật booking dùng điểm đón địa phương đúng với departure.
UPDATE bookings b
JOIN tour_departures td ON td.id = b.departure_id
JOIN tours t ON t.id = td.tour_id
JOIN destinations d ON d.id = t.destination_id
JOIN tour_pickup_points p
  ON p.departure_id = b.departure_id
 AND p.province = d.province
 AND p.status = 'active'
SET b.pickup_point_id = p.id,
    b.pickup_name = p.name,
    b.pickup_address = p.address,
    b.pickup_time = p.pickup_time,
    b.pickup_note = p.note,
    b.updated_at = NOW()
WHERE b.booking_code IN (
    'BK1781254525128',
    'BK1781259599316',
    'BK1781323941285',
    'BK1781324440363',
    'BK1782567206942',
    'BK1782569626638',
    'BK1782569979453',
    'BK1782816398217',
    'BK1782825493894',
    'BK1782825596376',
    'BK1782828238901',
    'REAL2026-0027-001'
);

-- ============================================================
-- 4. TẠO 12 PHÂN CÔNG CÓ SỰ CỐ
--    start_date/end_date dùng ngày tương lai để hiện ở màn hình demo.
-- ============================================================

-- Sự cố 1: hỏng xe.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT
    g.id, b.id, b.tour_id,
    DATE_ADD(CURDATE(), INTERVAL 1 DAY),
    DATE_ADD(CURDATE(), INTERVAL 3 DAY),
    'issue',
    'Xe đưa đón gặp sự cố kỹ thuật trên đường. HDV đã liên hệ nhà xe thay thế và cập nhật thời gian cho khách.',
    NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed01@travela.vn'
WHERE b.booking_code = 'BK1781254525128'
  AND NOT EXISTS (
      SELECT 1 FROM guide_assignments ga
      WHERE ga.booking_id = b.id AND ga.status = 'issue'
  );

-- Sự cố 2: khách bị say xe/sức khỏe.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 2 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY),
       'issue',
       'Một hành khách có dấu hiệu say xe và tụt huyết áp. HDV đã sơ cứu, bố trí nghỉ ngơi và theo dõi sức khỏe.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed02@travela.vn'
WHERE b.booking_code = 'BK1781259599316'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 3: thất lạc hành lý.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 3 DAY), DATE_ADD(CURDATE(), INTERVAL 5 DAY),
       'issue',
       'Khách báo thất lạc một kiện hành lý tại điểm trung chuyển. HDV đã lập biên bản và làm việc với đơn vị vận chuyển.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed03@travela.vn'
WHERE b.booking_code = 'BK1781323941285'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 4: thời tiết xấu.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 4 DAY), DATE_ADD(CURDATE(), INTERVAL 6 DAY),
       'issue',
       'Mưa lớn làm gián đoạn lịch tham quan ngoài trời. HDV đề xuất lịch trình thay thế trong nhà và chờ điều phối duyệt.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed04@travela.vn'
WHERE b.booking_code = 'BK1781324440363'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 5: khách sạn thiếu phòng.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 5 DAY), DATE_ADD(CURDATE(), INTERVAL 7 DAY),
       'issue',
       'Khách sạn báo thiếu phòng so với xác nhận ban đầu. HDV đang phối hợp chuyển khách sang cơ sở tương đương.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed05@travela.vn'
WHERE b.booking_code = 'BK1782567206942'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 6: điểm tham quan đóng cửa.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 6 DAY), DATE_ADD(CURDATE(), INTERVAL 8 DAY),
       'issue',
       'Điểm tham quan tạm đóng cửa để bảo trì. HDV đã đề xuất điểm thay thế cùng mức dịch vụ.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed06@travela.vn'
WHERE b.booking_code = 'BK1782569626638'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 7: khách đi lạc.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 9 DAY),
       'issue',
       'Một hành khách tách đoàn và mất liên lạc trong thời gian ngắn. HDV đã tìm thấy khách và nhắc lại quy định tập trung.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed01@travela.vn'
WHERE b.booking_code = 'BK1782569979453'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 8: chậm giờ đón.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 8 DAY), DATE_ADD(CURDATE(), INTERVAL 10 DAY),
       'issue',
       'Xe đến điểm đón trễ 45 phút do ùn tắc. HDV đã thông báo khách và điều chỉnh thời gian ăn sáng.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed02@travela.vn'
WHERE b.booking_code = 'BK1782816398217'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 9: khách phản ánh suất ăn.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 9 DAY), DATE_ADD(CURDATE(), INTERVAL 11 DAY),
       'issue',
       'Một số khách phản ánh suất ăn không đúng ghi chú dị ứng. HDV đã đổi món và báo nhà hàng rà soát.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed03@travela.vn'
WHERE b.booking_code = 'BK1782825493894'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 10: phương tiện hoạt động bị hủy.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 12 DAY),
       'issue',
       'Hoạt động tàu/thuyền bị hủy do điều kiện an toàn. HDV đang chờ phương án thay thế từ điều hành.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed04@travela.vn'
WHERE b.booking_code = 'BK1782825596376'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 11: khách mất giấy tờ.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 11 DAY), DATE_ADD(CURDATE(), INTERVAL 13 DAY),
       'issue',
       'Khách báo mất giấy tờ tùy thân. HDV đã hướng dẫn khai báo và liên hệ cơ quan chức năng địa phương.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed05@travela.vn'
WHERE b.booking_code = 'BK1782828238901'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- Sự cố 12: tai nạn nhẹ.
INSERT INTO guide_assignments
(guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at)
SELECT g.id, b.id, b.tour_id,
       DATE_ADD(CURDATE(), INTERVAL 12 DAY), DATE_ADD(CURDATE(), INTERVAL 14 DAY),
       'issue',
       'Khách bị trượt ngã nhẹ tại điểm tham quan. HDV đã sơ cứu, ghi nhận sự việc và theo dõi tình trạng khách.',
       NOW(), NOW()
FROM bookings b
JOIN guides g ON g.email = 'guide.seed06@travela.vn'
WHERE b.booking_code = 'REAL2026-0027-001'
  AND NOT EXISTS (SELECT 1 FROM guide_assignments ga WHERE ga.booking_id = b.id AND ga.status = 'issue');

-- ============================================================
-- 5. GHI LOG CHO CÁC BOOKING ĐƯỢC ĐƯA VÀO DEMO SỰ CỐ
-- ============================================================
INSERT INTO booking_status_logs
(
    booking_id, payment_id, action_type, old_status, new_status,
    changed_by_user_id, source, reason, note, created_at
)
SELECT
    b.id,
    NULL,
    'seed_incident_demo',
    NULL,
    b.booking_status,
    NULL,
    'mysql_seed',
    'Khởi tạo dữ liệu demo tour có sự cố',
    'Booking được dùng để hiển thị ở màn hình điều hành chuyến đi.',
    NOW()
FROM bookings b
WHERE b.booking_code IN (
    'BK1781254525128',
    'BK1781259599316',
    'BK1781323941285',
    'BK1781324440363',
    'BK1782567206942',
    'BK1782569626638',
    'BK1782569979453',
    'BK1782816398217',
    'BK1782825493894',
    'BK1782825596376',
    'BK1782828238901',
    'REAL2026-0027-001'
)
AND NOT EXISTS (
    SELECT 1
    FROM booking_status_logs l
    WHERE l.booking_id = b.id
      AND l.action_type = 'seed_incident_demo'
);

COMMIT;

-- ============================================================
-- 6. CÂU LỆNH KIỂM TRA SAU KHI CHẠY
-- ============================================================

-- Danh sách chuyến đi có sự cố.
SELECT
    ga.id,
    ga.status,
    ga.note,
    ga.start_date,
    ga.end_date,
    g.full_name AS guide_name,
    g.phone AS guide_phone,
    b.booking_code,
    b.booking_status,
    b.pickup_name,
    b.pickup_address,
    t.name AS tour_name
FROM guide_assignments ga
JOIN guides g ON g.id = ga.guide_id
JOIN bookings b ON b.id = ga.booking_id
JOIN tours t ON t.id = ga.tour_id
WHERE ga.status = 'issue'
ORDER BY ga.start_date, ga.id;

-- Số điểm đón theo lịch khởi hành.
SELECT
    td.id AS departure_id,
    t.name AS tour_name,
    COUNT(p.id) AS pickup_point_count
FROM tour_departures td
JOIN tours t ON t.id = td.tour_id
LEFT JOIN tour_pickup_points p
       ON p.departure_id = td.id
      AND p.status = 'active'
GROUP BY td.id, t.name
ORDER BY td.id;


ALTER TABLE guide_availabilities
  ADD COLUMN guide_assignment_id BIGINT UNSIGNED NULL AFTER guide_id,
  ADD INDEX idx_guide_availability_assignment (guide_assignment_id),
  ADD CONSTRAINT fk_guide_availability_assignment
    FOREIGN KEY (guide_assignment_id)
    REFERENCES guide_assignments(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;


CREATE TABLE `guide_credentials` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guide_id` BIGINT UNSIGNED NOT NULL,
  `credential_type` VARCHAR(30) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `issuer` VARCHAR(180) NULL,
  `level` VARCHAR(100) NULL,
  `file_url` VARCHAR(500) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `review_note` VARCHAR(500) NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `guide_credentials_guide_id_status_idx` (`guide_id`, `status`),
  INDEX `guide_credentials_type_status_idx` (`credential_type`, `status`),
  CONSTRAINT `guide_credentials_guide_id_fkey`
    FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;




SET SQL_SAFE_UPDATES = 0;

-- ------------------------------------------------------------
-- 1. Bổ sung guide_assignment_id cho guide_availabilities nếu thiếu
-- ------------------------------------------------------------
SET @has_guide_assignment_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guide_availabilities'
    AND COLUMN_NAME = 'guide_assignment_id'
);

SET @sql_add_column := IF(
  @has_guide_assignment_id = 0,
  'ALTER TABLE guide_availabilities
     ADD COLUMN guide_assignment_id BIGINT UNSIGNED NULL AFTER guide_id,
     ADD INDEX idx_guide_availability_assignment (guide_assignment_id)',
  'SELECT ''guide_assignment_id đã tồn tại'' AS message'
);

PREPARE stmt_add_column FROM @sql_add_column;
EXECUTE stmt_add_column;
DEALLOCATE PREPARE stmt_add_column;

SET @has_fk := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'guide_availabilities'
    AND CONSTRAINT_NAME = 'fk_guide_availability_assignment'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_add_fk := IF(
  @has_fk = 0,
  'ALTER TABLE guide_availabilities
     ADD CONSTRAINT fk_guide_availability_assignment
     FOREIGN KEY (guide_assignment_id)
     REFERENCES guide_assignments(id)
     ON DELETE SET NULL',
  'SELECT ''Foreign key guide_assignment_id đã tồn tại'' AS message'
);

PREPARE stmt_add_fk FROM @sql_add_fk;
EXECUTE stmt_add_fk;
DEALLOCATE PREPARE stmt_add_fk;

-- ------------------------------------------------------------
-- 2. Backfill các yêu cầu "không thể nhận tour" cũ theo HDV và thời gian
-- Chỉ gắn khi tìm được đúng 1 assignment trùng khoảng thời gian.
-- ------------------------------------------------------------
UPDATE guide_availabilities av
JOIN (
  SELECT
    av2.id AS availability_id,
    MIN(ga.id) AS assignment_id,
    COUNT(*) AS matched_count
  FROM guide_availabilities av2
  JOIN guide_assignments ga
    ON ga.guide_id = av2.guide_id
   AND ga.status IN ('assigned', 'accepted', 'in_progress', 'issue')
   AND TIMESTAMP(ga.start_date, '00:00:00') <= av2.end_at
   AND TIMESTAMP(ga.end_date, '23:59:59') >= av2.start_at
  WHERE av2.guide_assignment_id IS NULL
    AND av2.availability_type = 'unavailable'
    AND (
      LOWER(COALESCE(av2.reason, '')) LIKE '%không thể nhận%'
      OR LOWER(COALESCE(av2.reason, '')) LIKE '%khong the nhan%'
      OR LOWER(COALESCE(av2.reason, '')) LIKE '%bận tour%'
      OR LOWER(COALESCE(av2.reason, '')) LIKE '%ban tour%'
    )
  GROUP BY av2.id
  HAVING COUNT(*) = 1
) matched
  ON matched.availability_id = av.id
SET av.guide_assignment_id = matched.assignment_id;

-- ------------------------------------------------------------
-- 3. Seed 6 ticket sự cố cho MỖI chuyến hiện có
-- ------------------------------------------------------------
INSERT INTO incident_tickets (
    ticket_code,
    trip_operation_id,
    booking_id,
    booking_guest_id,
    reported_by_guide_id,
    assigned_admin_id,
    category,
    severity,
    status,
    title,
    description,
    location_name,
    evidence_urls,
    resolution,
    acknowledged_at,
    resolved_at,
    created_at,
    updated_at
)
SELECT
    CONCAT(
        'SEED-INC-',
        LPAD(op.id, 6, '0'),
        '-',
        LPAD(seed.seq, 2, '0')
    ),
    op.id,
    (
        SELECT MIN(b.id)
        FROM bookings b
        WHERE b.departure_id = op.departure_id
          AND b.booking_status IN (
              'confirmed',
              'completed',
              'waiting_confirmation'
          )
    ),
    NULL,
    op.guide_id,
    (
        SELECT MIN(u.id)
        FROM users u
        WHERE u.role = 'admin'
    ),
    seed.category,
    seed.severity,
    seed.ticket_status,
    seed.title,
    CONCAT(
        seed.description,
        ' Chuyến: ',
        COALESCE(t.name, CONCAT('Tour #', td.tour_id)),
        '. Mã vận hành: ',
        CONCAT('OP-', LPAD(op.id, 6, '0')),
        '.'
    ),
    COALESCE(d.name, d.province, 'Điểm đến của tour'),
    JSON_ARRAY(),
    CASE
        WHEN seed.ticket_status IN ('resolved', 'closed')
            THEN seed.resolution_text
        ELSE NULL
    END,
    CASE
        WHEN seed.ticket_status IN (
            'acknowledged',
            'in_progress',
            'resolved',
            'closed'
        )
            THEN DATE_SUB(NOW(), INTERVAL (seed.seq + 1) HOUR)
        ELSE NULL
    END,
    CASE
        WHEN seed.ticket_status IN ('resolved', 'closed')
            THEN DATE_SUB(NOW(), INTERVAL seed.seq HOUR)
        ELSE NULL
    END,
    DATE_SUB(NOW(), INTERVAL seed.seq DAY),
    NOW()
FROM trip_operations op
JOIN tour_departures td
    ON td.id = op.departure_id
JOIN tours t
    ON t.id = td.tour_id
LEFT JOIN destinations d
    ON d.id = t.destination_id
JOIN (
    SELECT
        1 AS seq,
        'vehicle' AS category,
        'high' AS severity,
        'open' AS ticket_status,
        'Xe đến điểm đón chậm' AS title,
        'Xe du lịch đến điểm đón chậm hơn kế hoạch, hướng dẫn viên cần điều hành khách chờ tại khu vực an toàn.' AS description,
        NULL AS resolution_text
    UNION ALL
    SELECT
        2,
        'customer',
        'medium',
        'acknowledged',
        'Hành khách đến trễ',
        'Một hành khách báo sẽ đến trễ, hướng dẫn viên đã liên hệ và cập nhật thời gian chờ.',
        NULL
    UNION ALL
    SELECT
        3,
        'health',
        'high',
        'in_progress',
        'Khách có dấu hiệu mệt',
        'Khách có dấu hiệu chóng mặt khi di chuyển, đoàn đã dừng nghỉ và theo dõi tình trạng sức khỏe.',
        NULL
    UNION ALL
    SELECT
        4,
        'restaurant',
        'medium',
        'resolved',
        'Nhà hàng phục vụ chậm',
        'Bữa ăn được phục vụ chậm so với lịch trình dự kiến.',
        'Đã làm việc với nhà hàng và điều chỉnh thời gian hoạt động tiếp theo.'
    UNION ALL
    SELECT
        5,
        'weather',
        'low',
        'closed',
        'Mưa ảnh hưởng lịch tham quan',
        'Thời tiết mưa nhẹ làm thay đổi thứ tự một số hoạt động ngoài trời.',
        'Đã chuyển hoạt động trong nhà lên trước và đảm bảo đủ nội dung chương trình.'
    UNION ALL
    SELECT
        6,
        'schedule',
        'medium',
        'resolved',
        'Điều chỉnh thời gian tham quan',
        'Điểm tham quan đông khách nên đoàn cần điều chỉnh thứ tự ghé thăm.',
        'Đã đổi thứ tự lịch trình và thông báo cho toàn bộ hành khách.'
) seed ON 1 = 1
WHERE NOT EXISTS (
    SELECT 1
    FROM incident_tickets old
    WHERE old.ticket_code = CONCAT(
        'SEED-INC-',
        LPAD(op.id, 6, '0'),
        '-',
        LPAD(seed.seq, 2, '0')
    )
);

-- ------------------------------------------------------------
-- 4. Seed 7 thông báo đoàn cho MỖI chuyến hiện có
-- ------------------------------------------------------------
INSERT INTO trip_broadcasts (
  trip_operation_id,
  sender_user_id,
  title,
  content,
  channel,
  pickup_point_id,
  sent_at,
  created_at
)
SELECT
  op.id,
  COALESCE(
    g.user_id,
    (SELECT MIN(u.id) FROM users u WHERE u.role = 'admin')
  ),
  seed.title,
  CONCAT(
    seed.content,
    ' Tour: ',
    COALESCE(t.name, CONCAT('Tour #', td.tour_id)),
    '.'
  ),
  seed.channel,
  CASE
    WHEN seed.seq IN (1, 2) THEN (
      SELECT MIN(b.pickup_point_id)
      FROM bookings b
      WHERE b.departure_id = op.departure_id
        AND b.pickup_point_id IS NOT NULL
    )
    ELSE NULL
  END,
  DATE_SUB(NOW(), INTERVAL seed.seq HOUR),
  DATE_SUB(NOW(), INTERVAL seed.seq HOUR)
FROM trip_operations op
JOIN tour_departures td
  ON td.id = op.departure_id
JOIN tours t
  ON t.id = td.tour_id
LEFT JOIN guides g
  ON g.id = op.guide_id
JOIN (
  SELECT
    1 AS seq,
    'Nhắc giờ tập trung' AS title,
    'Quý khách vui lòng có mặt tại điểm đón trước giờ hẹn 15 phút và mang theo giấy tờ tùy thân.' AS content,
    'both' AS channel
  UNION ALL
  SELECT
    2,
    'Xe sắp đến điểm đón',
    'Xe và hướng dẫn viên đang di chuyển đến điểm đón. Quý khách vui lòng giữ điện thoại để tiện liên hệ.',
    'in_app'
  UNION ALL
  SELECT
    3,
    'Đoàn đã khởi hành',
    'Đoàn đã khởi hành đúng kế hoạch. Quý khách vui lòng thắt dây an toàn và bảo quản tư trang.',
    'in_app'
  UNION ALL
  SELECT
    4,
    'Cập nhật thời gian dùng bữa',
    'Đoàn sẽ dùng bữa theo lịch. Khách có yêu cầu ăn chay, dị ứng hoặc kiêng kỵ vui lòng báo hướng dẫn viên.',
    'in_app'
  UNION ALL
  SELECT
    5,
    'Nhắc giờ tập trung tham quan',
    'Quý khách vui lòng có mặt tại điểm tập trung đúng giờ để không ảnh hưởng lịch trình chung.',
    'in_app'
  UNION ALL
  SELECT
    6,
    'Thông báo nhận phòng',
    'Hướng dẫn viên đang hoàn tất thủ tục nhận phòng. Quý khách chuẩn bị giấy tờ và kiểm tra hành lý.',
    'in_app'
  UNION ALL
  SELECT
    7,
    'Nhắc kiểm tra hành lý',
    'Trước khi rời khách sạn hoặc xe, quý khách vui lòng kiểm tra hành lý và tư trang cá nhân.',
    'both'
) seed ON 1 = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM trip_broadcasts old
  WHERE old.trip_operation_id = op.id
    AND old.title = seed.title
);

-- ------------------------------------------------------------
-- 5. Tạo người nhận cho các thông báo đoàn vừa seed
-- ------------------------------------------------------------
INSERT IGNORE INTO trip_broadcast_recipients (
  trip_broadcast_id,
  user_id,
  booking_id,
  delivery_status,
  error_message,
  created_at
)
SELECT
  tb.id,
  b.user_id,
  b.id,
  'sent',
  NULL,
  NOW()
FROM trip_broadcasts tb
JOIN trip_operations op
  ON op.id = tb.trip_operation_id
JOIN bookings b
  ON b.departure_id = op.departure_id
 AND b.booking_status IN (
   'confirmed',
   'completed',
   'waiting_confirmation'
 )
WHERE b.user_id IS NOT NULL
  AND tb.title IN (
    'Nhắc giờ tập trung',
    'Xe sắp đến điểm đón',
    'Đoàn đã khởi hành',
    'Cập nhật thời gian dùng bữa',
    'Nhắc giờ tập trung tham quan',
    'Thông báo nhận phòng',
    'Nhắc kiểm tra hành lý'
  );

-- ------------------------------------------------------------
-- 6. Seed thông báo cá nhân cho HDV để kiểm tra chuông thông báo
-- target_role dùng 'user' vì đã có target_user_id cụ thể.
-- ------------------------------------------------------------
INSERT INTO notifications (
  title,
  message,
  content,
  target_role,
  target_user_id,
  is_published,
  created_by,
  created_at,
  updated_at
)
SELECT
  CONCAT(
    'Cập nhật chuyến ',
    'OP-',
    LPAD(op.id, 6, '0')
  ),
  'Có cập nhật mới trong trung tâm điều hành.',
  CONCAT(
    'Tour ',
    COALESCE(t.name, CONCAT('#', td.tour_id)),
    ' đã có dữ liệu sự cố và thông báo đoàn mẫu. ',
    'Vui lòng mở mục Điều hành chuyến đi để kiểm tra.'
  ),
  'user',
  g.user_id,
  TRUE,
  (SELECT MIN(u.id) FROM users u WHERE u.role = 'admin'),
  DATE_SUB(NOW(), INTERVAL (op.id MOD 5) HOUR),
  NOW()
FROM trip_operations op
JOIN tour_departures td
  ON td.id = op.departure_id
JOIN tours t
  ON t.id = td.tour_id
JOIN guides g
  ON g.id = op.guide_id
WHERE g.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM notifications n
    WHERE n.target_user_id = g.user_id
      AND n.title = CONCAT(
        'Cập nhật chuyến ',
        'OP-',
        LPAD(op.id, 6, '0')
      )
  );

-- ------------------------------------------------------------
-- 7. Kiểm tra kết quả
-- ------------------------------------------------------------
SELECT
  op.id AS trip_operation_id,
  CONCAT('OP-', LPAD(op.id, 6, '0')) AS operation_code,
  t.name AS tour_name,
  COUNT(DISTINCT it.id) AS incident_count,
  COUNT(DISTINCT tb.id) AS broadcast_count
FROM trip_operations op
JOIN tour_departures td
  ON td.id = op.departure_id
JOIN tours t
  ON t.id = td.tour_id
LEFT JOIN incident_tickets it
  ON it.trip_operation_id = op.id
LEFT JOIN trip_broadcasts tb
  ON tb.trip_operation_id = op.id
GROUP BY
  op.id,
  td.tour_id,
  t.name
ORDER BY op.id DESC;

SELECT
  av.id,
  av.guide_id,
  av.guide_assignment_id,
  av.availability_type,
  av.status,
  av.start_at,
  av.end_at,
  av.reason
FROM guide_availabilities av
ORDER BY av.created_at DESC
LIMIT 30;

SELECT
    id,
    trip_operation_id,
    title,
    content,
    pickup_point_id,
    sent_at,
    created_at
FROM trip_broadcasts
ORDER BY created_at DESC, id DESC
LIMIT 30;

SET SQL_SAFE_UPDATES = 0;

UPDATE booking_guests bg
JOIN (
    SELECT
        booking_id,
        MIN(id) AS first_guest_id
    FROM booking_guests
    GROUP BY booking_id
) first_guest
    ON first_guest.first_guest_id = bg.id
JOIN bookings b
    ON b.id = bg.booking_id
JOIN users u
    ON u.id = b.user_id
SET
    bg.full_name = u.full_name,
    bg.phone = COALESCE(u.phone, bg.phone),
    bg.id_number = COALESCE(
        u.identity_number,
        bg.id_number
    ),
    bg.date_of_birth = COALESCE(
        u.birth_date,
        bg.date_of_birth
    ),
    bg.emergency_contact_name = u.full_name,
    bg.emergency_contact_phone = u.phone,
    bg.updated_at = NOW()
WHERE b.user_id IS NOT NULL;

SET SQL_SAFE_UPDATES = 1;


SET @final_admin_id := (
  SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id LIMIT 1
);

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'language','Tiếng Anh giao tiếp','B2',
  CONCAT('ENG-',LPAD(g.id,5,'0')),'Travela Training Center',
  DATE_SUB(CURDATE(),INTERVAL 1 YEAR),DATE_ADD(CURDATE(),INTERVAL 2 YEAR),
  CONCAT('https://picsum.photos/seed/guide-language-',g.id,'/1000/700'),
  'Năng lực ngoại ngữ mẫu đã được xác minh.',
  'verified',@final_admin_id,NOW(),NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
  AND NOT EXISTS (
    SELECT 1 FROM guide_competencies gc
    WHERE gc.guide_id=g.id AND gc.competency_type='language'
  );

INSERT INTO guide_competencies (
  guide_id,competency_type,name,level,certificate_no,issued_by,
  issued_date,expiry_date,document_url,note,verification_status,
  verified_by,verified_at,rejection_reason,created_at,updated_at
)
SELECT
  g.id,'certificate','Thẻ hướng dẫn viên du lịch nội địa','Còn hiệu lực',
  CONCAT('HDV-',YEAR(CURDATE()),'-',LPAD(g.id,6,'0')),'Sở Du lịch',
  DATE_SUB(CURDATE(),INTERVAL 1 YEAR),DATE_ADD(CURDATE(),INTERVAL 4 YEAR),
  CONCAT('https://picsum.photos/seed/guide-card-',g.id,'/1000/700'),
  'Chứng chỉ mẫu phục vụ kiểm thử màn hình hồ sơ hướng dẫn viên.',
  'verified',@final_admin_id,NOW(),NULL,NOW(),NOW()
FROM guides g
WHERE g.status='active'
  AND NOT EXISTS (
    SELECT 1 FROM guide_competencies gc
    WHERE gc.guide_id=g.id AND gc.competency_type='certificate'
  );



ALTER TABLE notifications
  MODIFY COLUMN target_role ENUM('all','admin','user','guide')
  NOT NULL DEFAULT 'user';
  
DELETE nr
FROM notification_reads nr
JOIN notifications n
    ON n.id = nr.notification_id
WHERE n.target_user_id = @user_id
  AND (
      LOWER(n.title) LIKE '%silver%'
      OR LOWER(n.title) LIKE '%gold%'
      OR LOWER(n.title) LIKE '%lên hạng%'
      OR LOWER(n.content) LIKE '%silver%'
      OR LOWER(n.content) LIKE '%gold%'
  );
  
  DELETE FROM notifications
WHERE target_user_id = @user_id
  AND (
      LOWER(title) LIKE '%silver%'
      OR LOWER(title) LIKE '%gold%'
      OR LOWER(title) LIKE '%lên hạng%'
      OR LOWER(content) LIKE '%silver%'
      OR LOWER(content) LIKE '%gold%'
  );
  
  SET SQL_SAFE_UPDATES = 0;

UPDATE users
SET member_tier = CASE
    WHEN member_points >= 4000 THEN 'diamond'
    WHEN member_points >= 1500 THEN 'gold'
    WHEN member_points >= 500 THEN 'silver'
    ELSE 'bronze'
END
WHERE role = 'user';

SET SQL_SAFE_UPDATES = 0;

SELECT
    g.id,
    g.full_name,
    g.email,
    g.user_id
FROM guides g
WHERE g.user_id IS NULL;

INSERT INTO users (
    full_name,
    email,
    phone,
    identity_number,
    password_hash,
    role,
    status,
    auth_provider,
    member_points,
    member_tier
)
SELECT
    g.full_name,
    g.email,
    g.phone,
    g.identity_number,
    '$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC',
    'guide',
    'active',
    'local',
    0,
    'bronze'
FROM guides g
LEFT JOIN users u ON u.email = g.email
WHERE g.user_id IS NULL
  AND g.email IS NOT NULL
  AND u.id IS NULL;
  
UPDATE guides g
JOIN users u ON u.email = g.email
SET g.user_id = u.id
WHERE g.user_id IS NULL;

UPDATE users u
JOIN guides g ON g.user_id = u.id
SET u.role = 'guide'
WHERE u.role <> 'guide';

UPDATE guides g
JOIN users u ON u.id = g.user_id
SET
    g.full_name = u.full_name,
    g.email = u.email,
    g.phone = u.phone,
    g.identity_number = u.identity_number,
    g.updated_at = NOW()
WHERE
    NOT (g.full_name <=> u.full_name)
    OR NOT (g.email <=> u.email)
    OR NOT (g.phone <=> u.phone)
    OR NOT (g.identity_number <=> u.identity_number);
    
ALTER TABLE guides
ADD UNIQUE KEY uk_guides_email(email),
ADD UNIQUE KEY uk_guides_phone(phone);

UPDATE guide_assignments
SET
    note = TRIM(
        REPLACE(
            REPLACE(
                REPLACE(
                    COALESCE(note, ''),
                    '[NORMALIZE_ASSIGNMENT] Đã gộp phân công theo lịch khởi hành; phân công này không còn là bản active.',
                    'Phân công này đã được thay thế bởi hướng dẫn viên khác.'
                ),
                '[NORMALIZE_ASSIGNMENT] Đã gộp phân công theo lịch khởi hành; phân công này không còn là bản active',
                'Phân công này đã được thay thế bởi hướng dẫn viên khác.'
            ),
            '[NORMALIZE_ASSIGNMENT]',
            ''
        )
    ),
    updated_at = NOW()
WHERE status = 'replaced'
   OR note LIKE '%[NORMALIZE_ASSIGNMENT]%';


-- Phân công được giữ lại làm phân công chính của cả lịch khởi hành.
UPDATE guide_assignments
SET
    note = TRIM(
        REPLACE(
            REPLACE(
                COALESCE(note, ''),
                '[NORMALIZE_ASSIGNMENT] Phân công đại diện cho toàn bộ lịch khởi hành.',
                'Phân công chính đại diện cho toàn bộ khách của lịch khởi hành.'
            ),
            '[NORMALIZE_ASSIGNMENT]',
            ''
        )
    ),
    updated_at = NOW()
WHERE note LIKE '%Phân công đại diện cho toàn bộ lịch khởi hành%'
   OR note LIKE '%[NORMALIZE_ASSIGNMENT]%';


-- Xóa dòng trống thừa do REPLACE.
UPDATE guide_assignments
SET
    note = TRIM(
        REPLACE(
            REPLACE(
                REPLACE(note, CONCAT(CHAR(13), CHAR(10), CHAR(13), CHAR(10)), CONCAT(CHAR(13), CHAR(10))),
                CONCAT(CHAR(10), CHAR(10)),
                CHAR(10)
            ),
            CONCAT(CHAR(13), CHAR(13)),
            CHAR(13)
        )
    )
WHERE note IS NOT NULL;


-- Chuẩn hóa ghi chú cho mọi phân công replaced chưa có mô tả rõ ràng.
UPDATE guide_assignments
SET
    note = 'Phân công này đã được thay thế bởi hướng dẫn viên khác.',
    updated_at = NOW()
WHERE status = 'replaced'
  AND (
      note IS NULL
      OR TRIM(note) = ''
      OR note LIKE '%NORMALIZE_ASSIGNMENT%'
  );


-- =========================================================
-- 2. LÀM SẠCH LỊCH BẬN HƯỚNG DẪN VIÊN
-- =========================================================

UPDATE guide_availabilities
SET
    reason = TRIM(
        REPLACE(
            REPLACE(
                REPLACE(
                    COALESCE(reason, ''),
                    '[PENDING_SEED]',
                    ''
                ),
                '[SEED]',
                ''
            ),
            '  ',
            ' '
        )
    ),
    updated_at = NOW()
WHERE reason LIKE '%[SEED]%'
   OR reason LIKE '%[PENDING_SEED]%';


-- Chuẩn hóa các nội dung mẫu cũ.
UPDATE guide_availabilities
SET
    reason = CASE
        WHEN LOWER(reason) LIKE '%tham gia khóa đào tạo nghiệp vụ%'
            THEN 'Tham gia khóa đào tạo nghiệp vụ hướng dẫn viên'

        WHEN LOWER(reason) LIKE '%tham gia đào tạo nghiệp vụ%'
            THEN 'Tham gia đào tạo nghiệp vụ'

        WHEN LOWER(reason) LIKE '%xin nghỉ buổi chiều%'
            THEN 'Xin nghỉ buổi chiều để giải quyết công việc cá nhân'

        WHEN LOWER(reason) LIKE '%có việc cá nhân%'
            THEN 'Có việc cá nhân'

        WHEN LOWER(reason) LIKE '%nghỉ phép cá nhân%'
            THEN 'Nghỉ phép cá nhân'

        ELSE TRIM(reason)
    END,
    updated_at = NOW()
WHERE reason IS NOT NULL;


-- =========================================================
-- 3. LÀM SẠCH GHI CHÚ ĐIỂM DANH
-- =========================================================

UPDATE passenger_checkins
SET
    note = 'Điểm danh tự động cho chuyến đi đã hoàn thành',
    updated_at = NOW()
WHERE note = 'Dữ liệu điểm danh seed cho chuyến đã hoàn thành'
   OR note LIKE '%điểm danh seed%';


-- =========================================================
-- 4. LÀM SẠCH NHẬT KÝ HÀNH TRÌNH MẪU
-- =========================================================

UPDATE journey_logs
SET
    title = TRIM(
        REPLACE(
            REPLACE(title, '[SEED]', ''),
            '[DEMO]',
            ''
        )
    ),
    content = CASE
        WHEN content IS NULL THEN NULL
        ELSE TRIM(
            REPLACE(
                REPLACE(content, '[SEED]', ''),
                '[DEMO]',
                ''
            )
        )
    END,
    updated_at = NOW()
WHERE title LIKE '%[SEED]%'
   OR title LIKE '%[DEMO]%'
   OR content LIKE '%[SEED]%'
   OR content LIKE '%[DEMO]%';


-- =========================================================
-- 5. LÀM SẠCH GHI CHÚ BOOKING VÀ LOG BOOKING MẪU
-- =========================================================

UPDATE bookings
SET
    note = TRIM(
        REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(
                        COALESCE(note, ''),
                        'Seed booking demo lớn',
                        'Booking dữ liệu mẫu'
                    ),
                    'Seed booking cực lớn có voucher và điểm đón',
                    'Booking mẫu có voucher và điểm đón'
                ),
                'Seed booking cực lớn',
                'Booking dữ liệu mẫu'
            ),
            '[SEED]',
            ''
        )
    ),
    updated_at = NOW()
WHERE note LIKE '%Seed%'
   OR note LIKE '%[SEED]%';


UPDATE booking_status_logs
SET
    reason = CASE
        WHEN reason = 'Seed dữ liệu demo'
            THEN 'Khởi tạo dữ liệu booking mẫu'

        WHEN reason = 'Seed dữ liệu cực lớn'
            THEN 'Khởi tạo dữ liệu booking mẫu'

        ELSE TRIM(
            REPLACE(
                REPLACE(COALESCE(reason, ''), '[SEED]', ''),
                'Seed',
                'Khởi tạo'
            )
        )
    END,

    note = CASE
        WHEN note = 'Tạo log trạng thái booking mẫu'
            THEN 'Khởi tạo lịch sử trạng thái booking'

        WHEN note = 'Tạo log trạng thái booking mẫu có voucher/điểm đón'
            THEN 'Khởi tạo lịch sử trạng thái booking có voucher và điểm đón'

        ELSE TRIM(
            REPLACE(
                REPLACE(COALESCE(note, ''), '[SEED]', ''),
                'Seed',
                'Khởi tạo'
            )
        )
    END
WHERE reason LIKE '%Seed%'
   OR reason LIKE '%[SEED]%'
   OR note LIKE '%Seed%'
   OR note LIKE '%[SEED]%';


-- =========================================================
-- 6. LÀM SẠCH GHI CHÚ SỰ CỐ VÀ CẢNH BÁO MẪU
-- =========================================================

UPDATE incident_tickets
SET
    title = TRIM(
        REPLACE(
            REPLACE(title, '[SEED]', ''),
            '[DEMO]',
            ''
        )
    ),
    description = TRIM(
        REPLACE(
            REPLACE(description, '[SEED]', ''),
            '[DEMO]',
            ''
        )
    ),
    updated_at = NOW()
WHERE title LIKE '%[SEED]%'
   OR title LIKE '%[DEMO]%'
   OR description LIKE '%[SEED]%'
   OR description LIKE '%[DEMO]%';


UPDATE operational_alerts
SET
    title = TRIM(
        REPLACE(
            REPLACE(title, '[SEED]', ''),
            '[DEMO]',
            ''
        )
    ),
    message = TRIM(
        REPLACE(
            REPLACE(message, '[SEED]', ''),
            '[DEMO]',
            ''
        )
    )
WHERE title LIKE '%[SEED]%'
   OR title LIKE '%[DEMO]%'
   OR message LIKE '%[SEED]%'
   OR message LIKE '%[DEMO]%';


COMMIT;

SET SQL_SAFE_UPDATES = 0;

DELETE FROM guide_availabilities
WHERE created_by IN (
    SELECT user_id
    FROM guides
    WHERE user_id IS NOT NULL
)
AND (
    reason IN (
        'Có việc cá nhân',
        'Nghỉ phép cá nhân',
        'Tham gia đào tạo nghiệp vụ',
        'Tham gia khóa đào tạo nghiệp vụ hướng dẫn viên',
        'Xin nghỉ buổi chiều để giải quyết công việc cá nhân'
    )
    OR reason LIKE '[SEED]%'
    OR reason LIKE '[PENDING_SEED]%'
);

INSERT INTO guide_availabilities (
    guide_id,
    guide_assignment_id,
    availability_type,
    start_at,
    end_at,
    all_day,
    reason,
    status,
    created_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
)
SELECT
    g.id,
    NULL,

    CASE MOD(g.id, 3)
        WHEN 0 THEN 'leave'
        WHEN 1 THEN 'personal'
        ELSE 'training'
    END,

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 3 + MOD(g.id, 2) DAY
        ),
        '00:00:00'
    ),

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 3 + MOD(g.id, 2) DAY
        ),
        '23:59:59'
    ),

    TRUE,

    CASE MOD(g.id, 3)
        WHEN 0 THEN 'Nghỉ phép cá nhân'
        WHEN 1 THEN 'Có việc cá nhân'
        ELSE 'Tham gia đào tạo nghiệp vụ'
    END,

    'active',
    g.user_id,
    1,
    NOW(),
    NOW(),
    NOW()

FROM guides g

LEFT JOIN guide_assignments ga
    ON ga.guide_id = g.id

WHERE g.status = 'active'
  AND g.user_id IS NOT NULL

GROUP BY
    g.id,
    g.user_id;
    
    
    INSERT INTO guide_availabilities (
    guide_id,
    guide_assignment_id,
    availability_type,
    start_at,
    end_at,
    all_day,
    reason,
    status,
    created_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
)
SELECT
    g.id,
    NULL,
    'training',

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 18 + MOD(g.id, 6) DAY
        ),
        '08:00:00'
    ),

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 18 + MOD(g.id, 6) DAY
        ),
        '17:00:00'
    ),

    FALSE,
    'Tham gia khóa đào tạo nghiệp vụ hướng dẫn viên',
    'pending',
    g.user_id,
    NULL,
    NULL,
    NOW(),
    NOW()

FROM guides g

LEFT JOIN guide_assignments ga
    ON ga.guide_id = g.id

WHERE g.status = 'active'
  AND g.user_id IS NOT NULL

GROUP BY
    g.id,
    g.user_id;
    
INSERT INTO guide_availabilities (
    guide_id,
    guide_assignment_id,
    availability_type,
    start_at,
    end_at,
    all_day,
    reason,
    status,
    created_by,
    approved_by,
    approved_at,
    created_at,
    updated_at
)
SELECT
    g.id,
    NULL,
    'personal',

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 29 + MOD(g.id, 4) DAY
        ),
        '13:00:00'
    ),

    TIMESTAMP(
        DATE_ADD(
            GREATEST(
                CURDATE(),
                COALESCE(MAX(ga.end_date), CURDATE())
            ),
            INTERVAL 29 + MOD(g.id, 4) DAY
        ),
        '18:00:00'
    ),

    FALSE,
    'Xin nghỉ buổi chiều để giải quyết công việc cá nhân',
    'pending',
    g.user_id,
    NULL,
    NULL,
    NOW(),
    NOW()

FROM guides g

LEFT JOIN guide_assignments ga
    ON ga.guide_id = g.id

WHERE g.status = 'active'
  AND g.user_id IS NOT NULL
  AND MOD(g.id, 4) = 0

GROUP BY
    g.id,
    g.user_id;
    
    
    
USE travela_full_mvc;
SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. TẠO THÊM 60 TÀI KHOẢN VÀ HỒ SƠ HƯỚNG DẪN VIÊN MỚI
-- =====================================================================

-- Tạo bảng tạm chứa 60 số thứ tự (từ 41 đến 100)
DROP TEMPORARY TABLE IF EXISTS tmp_seq_guides;
CREATE TEMPORARY TABLE tmp_seq_guides (n INT PRIMARY KEY);
INSERT INTO tmp_seq_guides(n)
SELECT a.i + b.i * 10 FROM 
(SELECT 0 i UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a
CROSS JOIN 
(SELECT 0 i UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
WHERE a.i + b.i * 10 BETWEEN 41 AND 100;

-- 1.1 Thêm vào bảng users
INSERT INTO users (
    full_name, email, phone, identity_number, password_hash, 
    role, status, auth_provider, member_points, member_tier, created_at, updated_at
)
SELECT
    CONCAT('HDV Travela Pro ', n),
    CONCAT('guide.pro.', n, '@travela.vn'),
    CONCAT('0988', LPAD(n, 6, '0')),
    CONCAT('0792011', LPAD(n, 5, '0')),
    '$2b$10$1J1M099OCjYoDHgVnQdtmukX0KvtIjlxey1e1eEEEK9AFAcR2wVvC', -- Password: 123456
    'guide',
    'active',
    'local',
    0,
    'bronze',
    NOW(), NOW()
FROM tmp_seq_guides s
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.email = CONCAT('guide.pro.', s.n, '@travela.vn')
);

-- 1.2 Thêm vào bảng guides
INSERT INTO guides (
    user_id, full_name, phone, email, identity_number, 
    languages, experience_years, status, note, created_at, updated_at
)
SELECT
    u.id,
    u.full_name,
    u.phone,
    u.email,
    u.identity_number,
    CASE MOD(s.n, 4)
        WHEN 0 THEN 'Tiếng Việt, Tiếng Anh'
        WHEN 1 THEN 'Tiếng Việt, Tiếng Trung'
        WHEN 2 THEN 'Tiếng Việt, Tiếng Hàn'
        ELSE 'Tiếng Việt, Tiếng Anh, Tiếng Nhật'
    END,
    3 + MOD(s.n, 8), -- Kinh nghiệm từ 3 đến 10 năm
    'active',
    'HDV bổ sung số lượng lớn để đảm bảo vận hành mùa cao điểm',
    NOW(), NOW()
FROM tmp_seq_guides s
JOIN users u ON u.email = CONCAT('guide.pro.', s.n, '@travela.vn')
WHERE NOT EXISTS (
    SELECT 1 FROM guides g WHERE g.email = u.email
);

-- 1.3 Thêm Competencies (Năng lực / Thẻ HDV) cho các HDV mới để hợp lệ
SET @admin_id := (SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id LIMIT 1);

INSERT INTO guide_competencies (
    guide_id, competency_type, name, level, certificate_no, issued_by,
    issued_date, expiry_date, document_url, note, verification_status,
    verified_by, verified_at, created_at, updated_at
)
SELECT 
    g.id, 'language', 'Tiếng Anh giao tiếp', 'B2', CONCAT('ENG-PRO-', g.id), 'Travela Training',
    DATE_SUB(CURDATE(), INTERVAL 1 YEAR), DATE_ADD(CURDATE(), INTERVAL 2 YEAR), 
    CONCAT('https://picsum.photos/seed/lang-', g.id, '/800/600'), 'Cấp tự động', 'verified', @admin_id, NOW(), NOW(), NOW()
FROM guides g WHERE g.email LIKE 'guide.pro.%' 
AND NOT EXISTS (SELECT 1 FROM guide_competencies gc WHERE gc.guide_id = g.id AND gc.competency_type = 'language');

INSERT INTO guide_competencies (
    guide_id, competency_type, name, level, certificate_no, issued_by,
    issued_date, expiry_date, document_url, note, verification_status,
    verified_by, verified_at, created_at, updated_at
)
SELECT 
    g.id, 'certificate', 'Thẻ hướng dẫn viên du lịch nội địa', 'Còn hiệu lực', CONCAT('HDV-PRO-', g.id), 'Sở Du lịch',
    DATE_SUB(CURDATE(), INTERVAL 1 YEAR), DATE_ADD(CURDATE(), INTERVAL 4 YEAR), 
    CONCAT('https://picsum.photos/seed/card-', g.id, '/800/600'), 'Cấp tự động', 'verified', @admin_id, NOW(), NOW(), NOW()
FROM guides g WHERE g.email LIKE 'guide.pro.%' 
AND NOT EXISTS (SELECT 1 FROM guide_competencies gc WHERE gc.guide_id = g.id AND gc.competency_type = 'certificate');

-- =====================================================================
-- 2. TÌM CÁC LỊCH KHỞI HÀNH (DEPARTURES) ĐANG THIẾU HDV
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS tmp_missing_assignments;
CREATE TEMPORARY TABLE tmp_missing_assignments AS
SELECT
    td.id AS departure_id,
    MIN(b.id) AS representative_booking_id,
    td.tour_id,
    td.departure_date AS start_date,
    td.end_date
FROM tour_departures td
JOIN bookings b ON b.departure_id = td.id
WHERE b.booking_status IN ('confirmed', 'completed', 'waiting_confirmation')
  -- Tìm những lịch KHÔNG CÓ phân công HDV nào đang active/completed
  AND NOT EXISTS (
      SELECT 1 FROM guide_assignments ga
      JOIN bookings b2 ON b2.id = ga.booking_id
      WHERE b2.departure_id = td.id
        AND ga.status IN ('assigned', 'accepted', 'in_progress', 'completed', 'issue')
  )
GROUP BY td.id, td.tour_id, td.departure_date, td.end_date;

ALTER TABLE tmp_missing_assignments ADD PRIMARY KEY (departure_id);

-- =====================================================================
-- 3. TỰ ĐỘNG PHÂN CÔNG HDV MỚI VÀO CÁC LỊCH TRỐNG
-- =====================================================================

DROP PROCEDURE IF EXISTS fill_missing_guide_assignments;
DELIMITER $$

CREATE PROCEDURE fill_missing_guide_assignments()
BEGIN
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_departure_id BIGINT UNSIGNED;
    DECLARE v_booking_id BIGINT UNSIGNED;
    DECLARE v_tour_id BIGINT UNSIGNED;
    DECLARE v_start_date DATE;
    DECLARE v_end_date DATE;
    DECLARE v_guide_id BIGINT UNSIGNED;

    DECLARE cur CURSOR FOR SELECT departure_id, representative_booking_id, tour_id, start_date, end_date FROM tmp_missing_assignments;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO v_departure_id, v_booking_id, v_tour_id, v_start_date, v_end_date;
        IF v_done THEN LEAVE read_loop; END IF;

        -- Tìm 1 HDV đang rảnh (Active, Không cấn lịch Assignment, Không cấn lịch Availability)
        SET v_guide_id = (
            SELECT g.id FROM guides g
            WHERE g.status = 'active'
              -- Check cấn lịch tour
              AND NOT EXISTS (
                  SELECT 1 FROM guide_assignments ga
                  WHERE ga.guide_id = g.id
                    AND ga.status IN ('assigned', 'accepted', 'in_progress', 'completed', 'issue')
                    AND ga.start_date <= v_end_date
                    AND ga.end_date >= v_start_date
              )
              -- Check cấn lịch nghỉ phép
              AND NOT EXISTS (
                  SELECT 1 FROM guide_availabilities gav
                  WHERE gav.guide_id = g.id
                    AND gav.status = 'active'
                    AND gav.availability_type IN ('unavailable', 'leave', 'training', 'personal')
                    AND DATE(gav.start_at) <= v_end_date
                    AND DATE(gav.end_at) >= v_start_date
              )
            -- Ưu tiên những người có ít tour nhất để chia đều việc
            ORDER BY (SELECT COUNT(*) FROM guide_assignments ga2 WHERE ga2.guide_id = g.id) ASC, RAND()
            LIMIT 1
        );

        IF v_guide_id IS NOT NULL THEN
            INSERT INTO guide_assignments (
                guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at
            )
            VALUES (
                v_guide_id, v_booking_id, v_tour_id, v_start_date, v_end_date,
                CASE
                    WHEN v_end_date < CURDATE() THEN 'completed'
                    WHEN v_start_date <= CURDATE() AND v_end_date >= CURDATE() THEN 'in_progress'
                    ELSE 'assigned'
                END,
                '[AUTO_FILL] Phân công đại diện cho toàn bộ lịch khởi hành sau khi bổ sung HDV.',
                NOW(), NOW()
            );
            
            -- Xóa cảnh báo cũ nếu có
            DELETE FROM guide_assignment_seed_warnings WHERE departure_id = v_departure_id;
        ELSE
            -- Ghi đè cảnh báo nếu vẫn thiếu (thường sẽ không xảy ra vì đã thêm 60 người)
            INSERT IGNORE INTO guide_assignment_seed_warnings (departure_id, tour_id, start_date, end_date, warning_message)
            VALUES (v_departure_id, v_tour_id, v_start_date, v_end_date, 'Vẫn thiếu HDV ngay cả khi đã add thêm 60 HDV mới.');
        END IF;

    END LOOP;
    CLOSE cur;
END$$

DELIMITER ;

-- Thực thi hàm
CALL fill_missing_guide_assignments();

-- Dọn dẹp
DROP PROCEDURE IF EXISTS fill_missing_guide_assignments;

-- =====================================================================
-- 4. ĐỒNG BỘ LẠI BẢNG VẬN HÀNH (TRIP_OPERATIONS)
-- =====================================================================

UPDATE trip_operations op
JOIN (
    SELECT 
        b.departure_id, 
        ga.guide_id
    FROM guide_assignments ga
    JOIN bookings b ON b.id = ga.booking_id
    WHERE ga.status IN ('assigned', 'accepted', 'in_progress', 'completed', 'issue')
) active_guide ON active_guide.departure_id = op.departure_id
SET 
    op.guide_id = active_guide.guide_id,
    op.updated_at = NOW()
WHERE op.guide_id IS NULL OR op.guide_id <> active_guide.guide_id;

SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

SET SQL_SAFE_UPDATES = 0;

-- 1. Tạo bảng tạm chứa 60 tên thật cho Hướng dẫn viên
DROP TEMPORARY TABLE IF EXISTS tmp_real_guide_names;
CREATE TEMPORARY TABLE tmp_real_guide_names (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150),
    email_slug VARCHAR(120)
);

INSERT INTO tmp_real_guide_names (full_name, email_slug) VALUES
('Nguyễn Thế Anh', 'nguyen.the.anh'),
('Trần Thái Bình', 'tran.thai.binh'),
('Hoàng Thu Cúc', 'hoang.thu.cuc'),
('Lê Việt Dũng', 'le.viet.dung'),
('Phạm Đăng Khoa', 'pham.dang.khoa'),
('Vũ Quốc Cường', 'vu.quoc.cuong'),
('Đặng Thùy Dương', 'dang.thuy.duong'),
('Bùi Gia Trí', 'bui.gia.tri'),
('Ngô Tường Vy', 'ngo.tuong.vy'),
('Hồ Bích Ngọc', 'ho.bich.ngoc'),
('Lý Thành Hưng', 'ly.thanh.hung'),
('Mai Tấn Phát', 'mai.tan.phat'),
('Phan Trung Kiên', 'phan.trung.kien'),
('Trịnh Trọng Tín', 'trinh.trong.tin'),
('Đinh Bích Điệp', 'dinh.bich.diep'),
('Dương Trọng Tấn', 'duong.trong.tan'),
('Lưu Hoàng Vũ', 'luu.hoang.vu'),
('Lương Mai Anh', 'luong.mai.anh'),
('Vương Bảo Hân', 'vuong.bao.han'),
('Đỗ Khắc Cường', 'do.khac.cuong'),
('Nguyễn Diễm Quỳnh', 'nguyen.diem.quynh'),
('Trần Đức Tài', 'tran.duc.tai'),
('Lê Xuân Trường', 'le.xuan.truong'),
('Phạm Quỳnh Hương', 'pham.quynh.huong'),
('Vũ Cẩm Thu', 'vu.cam.thu'),
('Đặng Thanh Tùng', 'dang.thanh.tung'),
('Bùi Đức Hải', 'bui.duc.hai'),
('Ngô Minh Phương', 'ngo.minh.phuong'),
('Hồ Thành Đạt', 'ho.thanh.dat'),
('Lâm Thúy Nga', 'lam.thuy.nga'),
('Phùng Thiên Bảo', 'phung.thien.bao'),
('Tô Mai Trang', 'to.mai.trang'),
('Châu Quốc Huy', 'chau.quoc.huy'),
('Khương Thu Hà', 'khuong.thu.ha'),
('Trương Tuyết Mai', 'truong.tuyet.mai'),
('Phan Minh Đăng', 'phan.minh.dang'),
('Nguyễn Thu Thủy', 'nguyen.thu.thuy'),
('Trần Công Lý', 'tran.cong.ly'),
('Lê Thái Bảo', 'le.thai.bao'),
('Phạm Việt Hùng', 'pham.viet.hung'),
('Vũ Ngọc Sơn', 'vu.ngoc.son'),
('Đặng Thu Thảo', 'dang.thu.thao'),
('Bùi Hoàng Lâm', 'bui.hoang.lam'),
('Ngô Bảo Châu', 'ngo.bao.chau'),
('Hồ Ngọc Diệp', 'ho.ngoc.diep'),
('Đinh Thanh Trúc', 'dinh.thanh.truc'),
('Lương Đức Thiện', 'luong.duc.thien'),
('Đỗ Phương Nam', 'do.phuong.nam'),
('Nguyễn Hữu Trí', 'nguyen.huu.tri'),
('Trần Quang Khải', 'tran.quang.khai'),
('Lê Minh Hoàng', 'le.minh.hoang'),
('Phạm Thùy Linh', 'pham.thuy.linh'),
('Vũ Đức Vượng', 'vu.duc.vuong'),
('Đặng Tuấn Anh', 'dang.tuan.anh'),
('Bùi Minh Triết', 'bui.minh.triet'),
('Ngô Thanh Hương', 'ngo.thanh.huong'),
('Hồ Trung Đức', 'ho.trung.duc'),
('Lâm Gia Huy', 'lam.gia.huy'),
('Nguyễn Hải Đăng', 'nguyen.hai.dang'),
('Trần Bảo Ngọc', 'tran.bao.ngoc');

-- 2. Đánh số thứ tự cho các HDV 'Travela Pro' vừa được tạo để map với tên thật
DROP TEMPORARY TABLE IF EXISTS tmp_guides_to_update;
CREATE TEMPORARY TABLE tmp_guides_to_update AS
SELECT 
    g.id AS guide_id, 
    u.id AS user_id, 
    ROW_NUMBER() OVER(ORDER BY g.id) AS rn
FROM guides g
JOIN users u ON u.email = g.email
WHERE g.email LIKE 'guide.pro.%';

-- 3. Cập nhật thông tin thực tế vào bảng users
UPDATE users u
JOIN tmp_guides_to_update tu ON u.id = tu.user_id
JOIN tmp_real_guide_names tn ON tn.id = tu.rn
SET 
    u.full_name = tn.full_name,
    u.email = CONCAT(tn.email_slug, '.', tu.guide_id, '@travela.vn'),
    u.updated_at = NOW();

-- 4. Cập nhật thông tin thực tế vào bảng guides và xóa ghi chú ảo
UPDATE guides g
JOIN tmp_guides_to_update tu ON g.id = tu.guide_id
JOIN tmp_real_guide_names tn ON tn.id = tu.rn
SET 
    g.full_name = tn.full_name,
    g.email = CONCAT(tn.email_slug, '.', tu.guide_id, '@travela.vn'),
    g.note = NULL,
    g.updated_at = NOW();

-- 5. Xóa các bảng tạm và hoàn tất
DROP TEMPORARY TABLE IF EXISTS tmp_guides_to_update;
DROP TEMPORARY TABLE IF EXISTS tmp_real_guide_names;

SET SQL_SAFE_UPDATES = 1;

SELECT 
    op.id AS operation_id,
    td.id AS departure_id,
    t.code AS tour_code,
    t.name AS tour_name,
    td.departure_date,
    td.end_date,
    td.booked_slots AS so_khach_da_dat,
    op.operation_status
FROM trip_operations op
JOIN tour_departures td ON td.id = op.departure_id
JOIN tours t ON t.id = td.tour_id
WHERE op.guide_id IS NULL
  AND td.status NOT IN ('cancelled')
  AND td.booked_slots > 0
ORDER BY td.departure_date ASC;


USE travela_full_mvc;


SET SQL_SAFE_UPDATES = 0;

-- 1. Phân công HDV ngẫu nhiên cho CÁC BOOKING HỢP LỆ bị sót chưa có HDV
INSERT INTO guide_assignments (
    guide_id, booking_id, tour_id, start_date, end_date, status, note, created_at, updated_at
)
SELECT 
    (SELECT id FROM guides WHERE status = 'active' ORDER BY RAND() LIMIT 1) AS guide_id,
    b.id,
    b.tour_id,
    td.departure_date,
    td.end_date,
    CASE 
        WHEN td.end_date < CURDATE() THEN 'completed'
        WHEN td.departure_date <= CURDATE() AND td.end_date >= CURDATE() THEN 'in_progress'
        ELSE 'assigned'
    END,
    'Phân công tự động cho các booking bị sót HDV',
    NOW(), 
    NOW()
FROM bookings b
JOIN tour_departures td ON td.id = b.departure_id
WHERE b.booking_status IN ('confirmed', 'completed', 'waiting_confirmation')
  -- Lọc ra những booking hiện tại chưa có dữ liệu trong bảng guide_assignments
  AND NOT EXISTS (
      SELECT 1 
      FROM guide_assignments ga 
      WHERE ga.booking_id = b.id
  );

-- 2. Đồng bộ lại mã HDV lên bảng vận hành (trip_operations) để API có thể đọc được
UPDATE trip_operations op
JOIN bookings b ON b.departure_id = op.departure_id
JOIN guide_assignments ga ON ga.booking_id = b.id
SET op.guide_id = ga.guide_id
WHERE op.guide_id IS NULL;

SET SQL_SAFE_UPDATES = 1;


SET SQL_SAFE_UPDATES = 0;
START TRANSACTION;

SET @departure_id := 16;
SET @guide_id := 35;

-- Chọn một booking đại diện hợp lệ.
SET @representative_booking_id := (
    SELECT MIN(b.id)
    FROM bookings b
    WHERE b.departure_id = @departure_id
      AND b.booking_status IN (
          'confirmed',
          'waiting_confirmation',
          'completed'
      )
);

SET @tour_id := (
    SELECT b.tour_id
    FROM bookings b
    WHERE b.id = @representative_booking_id
);

SET @start_date := (
    SELECT td.departure_date
    FROM tour_departures td
    WHERE td.id = @departure_id
);

SET @end_date := (
    SELECT td.end_date
    FROM tour_departures td
    WHERE td.id = @departure_id
);

-- 1. Đưa toàn bộ phân công đang hoạt động của lịch này về replaced.
UPDATE guide_assignments ga
JOIN bookings b
    ON b.id = ga.booking_id
SET
    ga.status = 'replaced',
    ga.note = CASE
        WHEN ga.note IS NULL OR TRIM(ga.note) = ''
        THEN 'Phân công cũ đã được thay thế khi chuẩn hóa theo lịch khởi hành.'
        ELSE CONCAT(
            TRIM(ga.note),
            CHAR(10),
            'Phân công cũ đã được thay thế khi chuẩn hóa theo lịch khởi hành.'
        )
    END,
    ga.updated_at = NOW()
WHERE b.departure_id = @departure_id
  AND ga.status IN (
      'assigned',
      'accepted',
      'confirmed',
      'in_progress',
      'issue'
  );

-- 2. Tạo một phân công chính duy nhất cho cả lịch.
INSERT INTO guide_assignments (
    guide_id,
    booking_id,
    tour_id,
    start_date,
    end_date,
    status,
    note,
    created_at,
    updated_at
)
VALUES (
    @guide_id,
    @representative_booking_id,
    @tour_id,
    @start_date,
    @end_date,
    'assigned',
    'Phân công chính đại diện cho toàn bộ khách của lịch khởi hành.',
    NOW(),
    NOW()
);

-- 3. Đồng bộ HDV sang bảng vận hành.
UPDATE trip_operations
SET
    guide_id = @guide_id,
    operation_status = CASE
        WHEN operation_status IN ('completed', 'cancelled')
        THEN operation_status
        ELSE 'preparing'
    END,
    updated_at = NOW()
WHERE departure_id = @departure_id;

COMMIT;
SET SQL_SAFE_UPDATES = 1;



SELECT
    b.id AS booking_id,
    b.booking_code,
    b.departure_id,
    booking_ga.status AS booking_assignment_status,
    booking_ga.guide_id AS old_booking_guide_id,
    op.guide_id AS departure_guide_id,
    g.full_name AS departure_guide_name
FROM bookings b
LEFT JOIN guide_assignments booking_ga
    ON booking_ga.booking_id = b.id
LEFT JOIN trip_operations op
    ON op.departure_id = b.departure_id
LEFT JOIN guides g
    ON g.id = op.guide_id
WHERE b.booking_code = 'BK1782828238901';


DROP TEMPORARY TABLE IF EXISTS tmp_seed_schedule;
CREATE TEMPORARY TABLE tmp_seed_schedule (
    seed_no INT PRIMARY KEY,
    tour_id BIGINT UNSIGNED NOT NULL,
    departure_date DATE NOT NULL
);

/*
Chọn 16 tour published đầu tiên.
Có thể thay các tour_id trong bảng tạm sau khi tạo nếu cần.
*/
INSERT INTO tmp_seed_schedule (seed_no, tour_id, departure_date)
SELECT
    x.seed_no,
    x.tour_id,
    x.departure_date
FROM (
    SELECT
        ROW_NUMBER() OVER (ORDER BY t.id) AS seed_no,
        t.id AS tour_id,
        CASE ROW_NUMBER() OVER (ORDER BY t.id)
            WHEN 1  THEN '2026-08-18'
            WHEN 2  THEN '2026-08-18'
            WHEN 3  THEN '2026-08-18'
            WHEN 4  THEN '2026-08-18'
            WHEN 5  THEN '2026-08-19'
            WHEN 6  THEN '2026-08-19'
            WHEN 7  THEN '2026-08-19'
            WHEN 8  THEN '2026-08-19'
            WHEN 9  THEN '2026-08-25'
            WHEN 10 THEN '2026-08-28'
            WHEN 11 THEN '2026-09-18'
            WHEN 12 THEN '2026-09-18'
            WHEN 13 THEN '2026-09-18'
            WHEN 14 THEN '2026-09-19'
            WHEN 15 THEN '2026-09-19'
            WHEN 16 THEN '2026-09-19'
        END AS departure_date
    FROM tours t
    WHERE t.status = 'published'
    ORDER BY t.id
    LIMIT 16
) x;

/*
1. Tạo lịch khởi hành.
*/
INSERT INTO tour_departures (
    tour_id,
    departure_date,
    end_date,
    adult_price,
    child_price,
    total_slots,
    booked_slots,
    held_slots,
    status,
    created_at,
    updated_at
)
SELECT
    s.tour_id,
    s.departure_date,
    DATE_ADD(
        s.departure_date,
        INTERVAL (GREATEST(t.duration_days, 1) - 1) DAY
    ),
    t.base_price_adult,
    t.base_price_child,
    GREATEST(t.max_capacity_default, 20),
    0,
    0,
    'open',
    NOW(),
    NOW()
FROM tmp_seed_schedule s
JOIN tours t ON t.id = s.tour_id
WHERE NOT EXISTS (
    SELECT 1
    FROM tour_departures td
    WHERE td.tour_id = s.tour_id
      AND td.departure_date = s.departure_date
);

/*
2. Lấy lại đúng các departure vừa tạo hoặc đã tồn tại.
*/
DROP TEMPORARY TABLE IF EXISTS tmp_seed_departures;
CREATE TEMPORARY TABLE tmp_seed_departures AS
SELECT
    s.seed_no,
    td.id AS departure_id,
    td.tour_id,
    td.departure_date,
    td.end_date,
    td.adult_price,
    td.child_price
FROM tmp_seed_schedule s
JOIN tour_departures td
  ON td.tour_id = s.tour_id
 AND td.departure_date = s.departure_date;

/*
3. Xếp danh sách user active để gán vào booking.
*/
DROP TEMPORARY TABLE IF EXISTS tmp_active_users;
CREATE TEMPORARY TABLE tmp_active_users AS
SELECT
    u.id,
    u.full_name,
    u.email,
    u.phone,
    ROW_NUMBER() OVER (ORDER BY u.id) AS rn
FROM users u
WHERE u.role = 'user'
  AND u.status = 'active';

SET @user_count := (SELECT COUNT(*) FROM tmp_active_users);

/*
Mỗi departure có:
- Nhóm A: 4 người lớn + 1 trẻ em = 5 khách
- Nhóm B: 3 người lớn + 2 trẻ em = 5 khách
*/
DROP TEMPORARY TABLE IF EXISTS tmp_booking_groups;
CREATE TEMPORARY TABLE tmp_booking_groups (
    group_code CHAR(1) PRIMARY KEY,
    adult_count INT NOT NULL,
    child_count INT NOT NULL,
    user_offset INT NOT NULL
);

INSERT INTO tmp_booking_groups VALUES
('A', 4, 1, 0),
('B', 3, 2, 20);

/*
4. Tạo booking confirmed.
*/
INSERT INTO bookings (
    booking_code,
    user_id,
    tour_id,
    departure_id,
    voucher_id,
    voucher_code,
    pickup_point_id,
    pickup_name,
    pickup_address,
    pickup_time,
    pickup_note,
    adult_count,
    child_count,
    original_amount,
    discount_amount,
    final_amount,
    booking_status,
    hold_expires_at,
    contact_name,
    contact_email,
    contact_phone,
    note,
    created_at,
    updated_at
)
SELECT
    CONCAT(
        'BKAUGSEP26-',
        DATE_FORMAT(d.departure_date, '%m%d'),
        '-',
        d.departure_id,
        '-',
        g.group_code
    ),
    u.id,
    d.tour_id,
    d.departure_id,
    NULL,
    NULL,
    NULL,
    CASE
        WHEN MOD(d.seed_no, 4) = 0 THEN 'Văn phòng Travela trung tâm'
        WHEN MOD(d.seed_no, 4) = 1 THEN 'Bến xe trung tâm'
        WHEN MOD(d.seed_no, 4) = 2 THEN 'Quảng trường trung tâm'
        ELSE 'Khách sạn trung tâm'
    END,
    CASE
        WHEN MOD(d.seed_no, 4) = 0 THEN 'Điểm đón trung tâm do Travela xác nhận'
        WHEN MOD(d.seed_no, 4) = 1 THEN 'Cổng chính bến xe trung tâm'
        WHEN MOD(d.seed_no, 4) = 2 THEN 'Khu vực cổng chính quảng trường'
        ELSE 'Sảnh khách sạn trung tâm'
    END,
    '06:30:00',
    'Vui lòng có mặt trước giờ đón 15 phút.',
    g.adult_count,
    g.child_count,
    (
        d.adult_price * g.adult_count
        + d.child_price * g.child_count
    ),
    0,
    (
        d.adult_price * g.adult_count
        + d.child_price * g.child_count
    ),
    'confirmed',
    NULL,
    u.full_name,
    u.email,
    COALESCE(u.phone, CONCAT('0999', LPAD(u.id, 6, '0'))),
    CONCAT(
        'Seed demo tháng ',
        MONTH(d.departure_date),
        '/2026, nhóm ',
        g.group_code,
        ', tổng 5 khách.'
    ),
    DATE_SUB(NOW(), INTERVAL (d.seed_no + IF(g.group_code = 'B', 1, 0)) DAY),
    NOW()
FROM tmp_seed_departures d
CROSS JOIN tmp_booking_groups g
JOIN tmp_active_users u
  ON u.rn = (
      MOD(
          (d.seed_no - 1) + g.user_offset,
          @user_count
      ) + 1
  )
WHERE @user_count > 0
  AND NOT EXISTS (
      SELECT 1
      FROM bookings b
      WHERE b.booking_code = CONCAT(
          'BKAUGSEP26-',
          DATE_FORMAT(d.departure_date, '%m%d'),
          '-',
          d.departure_id,
          '-',
          g.group_code
      )
  );

/*
5. Tạo 5 hành khách cho mỗi booking seed.
*/
DROP TEMPORARY TABLE IF EXISTS tmp_guest_numbers;
CREATE TEMPORARY TABLE tmp_guest_numbers (
    guest_no INT PRIMARY KEY
);

INSERT INTO tmp_guest_numbers VALUES
(1), (2), (3), (4), (5);

INSERT INTO booking_guests (
    booking_id,
    full_name,
    date_of_birth,
    gender,
    guest_type,
    id_number,
    created_at,
    updated_at
)
SELECT
    b.id,
    CASE
        WHEN n.guest_no = 1 THEN b.contact_name
        ELSE CONCAT('Khách ', n.guest_no, ' - ', b.booking_code)
    END,
    CASE
        WHEN n.guest_no <= b.adult_count
            THEN DATE_SUB('1995-01-01', INTERVAL (n.guest_no * 500) DAY)
        ELSE DATE_SUB('2018-01-01', INTERVAL (n.guest_no * 90) DAY)
    END,
    CASE WHEN MOD(n.guest_no, 2) = 0 THEN 'female' ELSE 'male' END,
    CASE
        WHEN n.guest_no <= b.adult_count THEN 'adult'
        ELSE 'child'
    END,
    CONCAT('AUGSEP26-', b.id, '-', n.guest_no),
    NOW(),
    NOW()
FROM bookings b
JOIN tmp_seed_departures d
  ON d.departure_id = b.departure_id
CROSS JOIN tmp_guest_numbers n
WHERE b.booking_code LIKE 'BKAUGSEP26-%'
  AND NOT EXISTS (
      SELECT 1
      FROM booking_guests bg
      WHERE bg.booking_id = b.id
  );

/*
6. Tạo payment đã thanh toán.
Đúng thứ tự cột theo schema payments hiện tại.
*/
INSERT INTO payments (
    booking_id,
    payment_method,
    payment_status,
    amount,
    internal_transaction_code,
    gateway_transaction_id,
    paid_at,
    created_at,
    updated_at
)
SELECT
    b.id,
    CASE MOD(b.id, 4)
        WHEN 0 THEN 'momo'
        WHEN 1 THEN 'vnpay'
        WHEN 2 THEN 'bank_transfer'
        ELSE 'card'
    END,
    'paid',
    b.final_amount,
    CONCAT('TXN-AUGSEP26-', b.id),
    CONCAT('GW-AUGSEP26-', b.id),
    DATE_ADD(b.created_at, INTERVAL 10 MINUTE),
    b.created_at,
    NOW()
FROM bookings b
JOIN tmp_seed_departures d
  ON d.departure_id = b.departure_id
WHERE b.booking_code LIKE 'BKAUGSEP26-%'
  AND NOT EXISTS (
      SELECT 1
      FROM payments p
      WHERE p.booking_id = b.id
         OR p.internal_transaction_code = CONCAT('TXN-AUGSEP26-', b.id)
  );

/*
7. Tạo log confirmed.
*/
INSERT INTO booking_status_logs (
    booking_id,
    payment_id,
    action_type,
    old_status,
    new_status,
    changed_by_user_id,
    source,
    reason,
    note,
    created_at
)
SELECT
    b.id,
    p.id,
    'seed_confirm',
    'waiting_confirmation',
    'confirmed',
    1,
    'system',
    'Tạo dữ liệu demo lịch tháng 8 và tháng 9 năm 2026',
    'Booking demo đã thanh toán và xác nhận.',
    p.paid_at
FROM bookings b
JOIN tmp_seed_departures d
  ON d.departure_id = b.departure_id
JOIN payments p
  ON p.booking_id = b.id
WHERE b.booking_code LIKE 'BKAUGSEP26-%'
  AND NOT EXISTS (
      SELECT 1
      FROM booking_status_logs l
      WHERE l.booking_id = b.id
        AND l.action_type = 'seed_confirm'
  );

/*
8. Đồng bộ booked_slots.
Mỗi departure seed sẽ có tổng 10 khách.
*/
UPDATE tour_departures td
JOIN tmp_seed_departures d
  ON d.departure_id = td.id
LEFT JOIN (
    SELECT
        b.departure_id,
        SUM(b.adult_count + b.child_count) AS total_guests
    FROM bookings b
    WHERE b.booking_status IN (
        'confirmed',
        'completed',
        'waiting_confirmation'
    )
    GROUP BY b.departure_id
) x ON x.departure_id = td.id
SET
    td.booked_slots = LEAST(
        COALESCE(x.total_guests, 0),
        td.total_slots
    ),
    td.held_slots = 0,
    td.status = CASE
        WHEN COALESCE(x.total_guests, 0) >= td.total_slots THEN 'full'
        ELSE 'open'
    END,
    td.updated_at = NOW();

/*
Không tạo guide_assignments.
Không tạo trip_operations.
Nhờ đó các departure mới vẫn là "Chưa phân công HDV".
*/

DROP TEMPORARY TABLE IF EXISTS tmp_guest_numbers;
DROP TEMPORARY TABLE IF EXISTS tmp_booking_groups;
DROP TEMPORARY TABLE IF EXISTS tmp_active_users;
DROP TEMPORARY TABLE IF EXISTS tmp_seed_departures;
DROP TEMPORARY TABLE IF EXISTS tmp_seed_schedule;

COMMIT;

SET SQL_SAFE_UPDATES = 0;

/*
============================================================
KIỂM TRA KẾT QUẢ
============================================================
*/
SELECT
    td.id AS departure_id,
    t.code AS tour_code,
    t.name AS tour_name,
    td.departure_date,
    td.end_date,
    COUNT(DISTINCT b.id) AS booking_count,
    COALESCE(SUM(b.adult_count + b.child_count), 0) AS total_guests,
    td.booked_slots,
    td.held_slots,
    td.total_slots,
    td.status,
    COUNT(DISTINCT p.id) AS paid_payments
FROM tour_departures td
JOIN tours t
  ON t.id = td.tour_id
LEFT JOIN bookings b
  ON b.departure_id = td.id
 AND b.booking_code LIKE 'BKAUGSEP26-%'
LEFT JOIN payments p
  ON p.booking_id = b.id
 AND p.payment_status = 'paid'
WHERE td.departure_date BETWEEN '2026-08-01' AND '2026-09-30'
  AND EXISTS (
      SELECT 1
      FROM bookings bx
      WHERE bx.departure_id = td.id
        AND bx.booking_code LIKE 'BKAUGSEP26-%'
  )
GROUP BY
    td.id,
    t.code,
    t.name,
    td.departure_date,
    td.end_date,
    td.booked_slots,
    td.held_slots,
    td.total_slots,
    td.status
ORDER BY td.departure_date, td.id;

UPDATE guide_assignments
SET note = TRIM(
    REGEXP_REPLACE(
        note,
        'Seed lại tự động cho lịch khởi hành #[0-9]+ - ([0-9]+) hành khách',
        'Phân công hướng dẫn viên phụ trách đoàn gồm \\\\1 hành khách.'
    )
)
WHERE note LIKE '%Seed lại tự động cho lịch khởi hành%';

UPDATE guide_assignments
SET note = TRIM(
    REPLACE(
        note,
        'Phân công đại diện cho toàn bộ lịch khởi hành.',
        ''
    )
)
WHERE note LIKE '%Phân công đại diện cho toàn bộ lịch khởi hành.%';

UPDATE guide_assignments
SET note = 'Phân công hướng dẫn viên phụ trách toàn bộ khách của lịch khởi hành.'
WHERE note LIKE '[AUTO_FILL]%';

SELECT
    @@global.time_zone AS global_timezone,
    @@session.time_zone AS session_timezone,
    NOW() AS mysql_now,
    UTC_TIMESTAMP() AS utc_now;
    

DROP PROCEDURE IF EXISTS apply_vietnam_timestamp_defaults;
DROP PROCEDURE IF EXISTS apply_vietnam_updated_at_defaults;

SET SESSION time_zone = '+07:00';

CREATE TABLE IF NOT EXISTS timezone_alter_errors (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    error_code INT NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

TRUNCATE TABLE timezone_alter_errors;

DELIMITER $$

CREATE PROCEDURE apply_vietnam_updated_at_defaults()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_table_name VARCHAR(255);
    DECLARE v_column_type VARCHAR(255);
    DECLARE v_is_nullable VARCHAR(3);

    DECLARE v_error_code INT DEFAULT NULL;
    DECLARE v_error_message TEXT DEFAULT NULL;

    DECLARE cur CURSOR FOR
        SELECT
            c.TABLE_NAME,
            c.COLUMN_TYPE,
            c.IS_NULLABLE
        FROM information_schema.COLUMNS c
        INNER JOIN information_schema.TABLES t
            ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
           AND t.TABLE_NAME = c.TABLE_NAME
        WHERE c.TABLE_SCHEMA = DATABASE()
          AND c.COLUMN_NAME = 'updated_at'
          AND c.DATA_TYPE IN ('datetime', 'timestamp')
          AND t.TABLE_TYPE = 'BASE TABLE'

          -- Không chỉnh các bảng backup hoặc bảng kỹ thuật
          AND c.TABLE_NAME NOT LIKE '%backup%'
          AND c.TABLE_NAME NOT LIKE '%_backup_%'
          AND c.TABLE_NAME NOT IN (
              '_prisma_migrations',
              'timezone_migrations',
              'timezone_alter_errors'
          )
        ORDER BY c.TABLE_NAME;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;

    read_loop: LOOP
        FETCH cur
        INTO v_table_name, v_column_type, v_is_nullable;

        IF done = 1 THEN
            LEAVE read_loop;
        END IF;

        BEGIN
            DECLARE alter_failed BOOLEAN DEFAULT FALSE;

            DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
            BEGIN
                SET alter_failed = TRUE;

                GET DIAGNOSTICS CONDITION 1
                    v_error_code = MYSQL_ERRNO,
                    v_error_message = MESSAGE_TEXT;

                INSERT INTO timezone_alter_errors (
                    table_name,
                    column_name,
                    error_code,
                    error_message
                )
                VALUES (
                    v_table_name,
                    'updated_at',
                    v_error_code,
                    v_error_message
                );
            END;

            /*
             * Làm sạch dữ liệu ngày 0000-00-00 trước.
             * YEAR(updated_at) = 0 giúp không phải ghi trực tiếp literal
             * '0000-00-00 00:00:00' trong điều kiện.
             */
            IF v_is_nullable = 'YES' THEN
                SET @cleanup_sql = CONCAT(
                    'UPDATE `',
                    REPLACE(v_table_name, '`', '``'),
                    '` ',
                    'SET `updated_at` = NULL ',
                    'WHERE `updated_at` IS NOT NULL ',
                    'AND YEAR(`updated_at`) = 0'
                );
            ELSE
                SET @cleanup_sql = CONCAT(
                    'UPDATE `',
                    REPLACE(v_table_name, '`', '``'),
                    '` ',
                    'SET `updated_at` = CURRENT_TIMESTAMP ',
                    'WHERE YEAR(`updated_at`) = 0'
                );
            END IF;

            PREPARE cleanup_stmt FROM @cleanup_sql;
            EXECUTE cleanup_stmt;
            DEALLOCATE PREPARE cleanup_stmt;

            IF alter_failed = FALSE THEN
                IF v_is_nullable = 'YES' THEN
                    SET @alter_sql = CONCAT(
                        'ALTER TABLE `',
                        REPLACE(v_table_name, '`', '``'),
                        '` MODIFY COLUMN `updated_at` ',
                        v_column_type,
                        ' NULL DEFAULT CURRENT_TIMESTAMP ',
                        'ON UPDATE CURRENT_TIMESTAMP'
                    );
                ELSE
                    SET @alter_sql = CONCAT(
                        'ALTER TABLE `',
                        REPLACE(v_table_name, '`', '``'),
                        '` MODIFY COLUMN `updated_at` ',
                        v_column_type,
                        ' NOT NULL DEFAULT CURRENT_TIMESTAMP ',
                        'ON UPDATE CURRENT_TIMESTAMP'
                    );
                END IF;

                PREPARE alter_stmt FROM @alter_sql;
                EXECUTE alter_stmt;
                DEALLOCATE PREPARE alter_stmt;
            END IF;
        END;
    END LOOP;

    CLOSE cur;
END$$

DELIMITER ;

CALL apply_vietnam_updated_at_defaults();

DROP PROCEDURE apply_vietnam_updated_at_defaults;


UPDATE users
SET member_tier = CASE
  WHEN member_points >= 4000 THEN 'diamond'
  WHEN member_points >= 1500 THEN 'gold'
  WHEN member_points >= 500 THEN 'silver'
  ELSE 'bronze'
END
WHERE role = 'user';


USE travela_full_mvc;

SET SESSION time_zone = '+07:00';
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

/* ============================================================
   1. TẠO DANH SÁCH BOOKING CHƯA ĐƯỢC CỘNG ĐIỂM
   ============================================================ */

DROP TEMPORARY TABLE IF EXISTS tmp_missing_membership_rewards;

CREATE TEMPORARY TABLE tmp_missing_membership_rewards (
    booking_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    booking_code VARCHAR(50) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    old_booking_status VARCHAR(50) NOT NULL,
    end_date DATE NOT NULL,
    reward_points INT NOT NULL DEFAULT 100
);

/* Chỉ lấy:
   - tour đã kết thúc;
   - booking confirmed hoặc completed;
   - có payment paid;
   - chưa có log membership_reward.
*/
INSERT INTO tmp_missing_membership_rewards (
    booking_id,
    booking_code,
    user_id,
    old_booking_status,
    end_date,
    reward_points
)
SELECT DISTINCT
    b.id,
    b.booking_code,
    b.user_id,
    b.booking_status,
    td.end_date,
    100
FROM bookings b
INNER JOIN tour_departures td
    ON td.id = b.departure_id
WHERE b.user_id IS NOT NULL
  AND b.booking_status IN ('confirmed', 'completed')
  AND td.end_date < CURDATE()

  AND EXISTS (
      SELECT 1
      FROM payments p
      WHERE p.booking_id = b.id
        AND p.payment_status = 'paid'
  )

  AND NOT EXISTS (
      SELECT 1
      FROM booking_status_logs l
      WHERE l.booking_id = b.id
        AND l.action_type = 'membership_reward'
  );

/* ============================================================
   2. KIỂM TRA DANH SÁCH TRƯỚC KHI CỘNG
   ============================================================ */

SELECT
    r.booking_id,
    r.booking_code,
    r.user_id,
    r.old_booking_status,
    r.end_date,
    r.reward_points,
    u.member_points AS current_points,
    u.member_tier AS current_tier
FROM tmp_missing_membership_rewards r
INNER JOIN users u
    ON u.id = r.user_id
ORDER BY r.end_date DESC, r.booking_id;

/* ============================================================
   3. CHUYỂN CONFIRMED SANG COMPLETED
   ============================================================ */

UPDATE bookings b
INNER JOIN tmp_missing_membership_rewards r
    ON r.booking_id = b.id
SET
    b.booking_status = 'completed',
    b.hold_expires_at = NULL,
    b.updated_at = NOW()
WHERE b.booking_status = 'confirmed';

/* ============================================================
   4. CỘNG ĐIỂM THEO TỪNG USER
   Một user có nhiều booking thì cộng 100 điểm cho mỗi booking.
   ============================================================ */

UPDATE users u
INNER JOIN (
    SELECT
        user_id,
        SUM(reward_points) AS points_to_add
    FROM tmp_missing_membership_rewards
    GROUP BY user_id
) x
    ON x.user_id = u.id
SET
    u.member_points = COALESCE(u.member_points, 0) + x.points_to_add,
    u.updated_at = NOW()
WHERE u.role = 'user';

/* ============================================================
   5. TÍNH LẠI HẠNG THÀNH VIÊN
   ============================================================ */

UPDATE users u
INNER JOIN (
    SELECT DISTINCT user_id
    FROM tmp_missing_membership_rewards
) x
    ON x.user_id = u.id
SET
    u.member_tier = CASE
        WHEN u.member_points >= 4000 THEN 'diamond'
        WHEN u.member_points >= 1500 THEN 'gold'
        WHEN u.member_points >= 500 THEN 'silver'
        ELSE 'bronze'
    END,
    u.updated_at = NOW();

/* ============================================================
   6. GHI LOG TỰ ĐỘNG HOÀN THÀNH
   Chỉ áp dụng booking ban đầu là confirmed.
   ============================================================ */

INSERT INTO booking_status_logs (
    booking_id,
    payment_id,
    action_type,
    old_status,
    new_status,
    changed_by_user_id,
    source,
    reason,
    note,
    created_at
)
SELECT
    r.booking_id,
    NULL,
    'auto_complete',
    'confirmed',
    'completed',
    NULL,
    'system',
    'Trip end date has passed',
    'Tự động hoàn thành booking sau ngày kết thúc chuyến đi.',
    NOW()
FROM tmp_missing_membership_rewards r
WHERE r.old_booking_status = 'confirmed'
  AND NOT EXISTS (
      SELECT 1
      FROM booking_status_logs l
      WHERE l.booking_id = r.booking_id
        AND l.action_type = 'auto_complete'
  );

/* ============================================================
   7. GHI LOG CHỐNG CỘNG TRÙNG
   ============================================================ */

INSERT INTO booking_status_logs (
    booking_id,
    payment_id,
    action_type,
    old_status,
    new_status,
    changed_by_user_id,
    source,
    reason,
    note,
    created_at
)
SELECT
    r.booking_id,
    NULL,
    'membership_reward',
    r.old_booking_status,
    'completed',
    NULL,
    'system',
    'Reward points after completed paid trip',
    CONCAT(
        'Cộng ',
        r.reward_points,
        ' điểm thành viên cho booking ',
        r.booking_code,
        '.'
    ),
    NOW()
FROM tmp_missing_membership_rewards r
WHERE NOT EXISTS (
    SELECT 1
    FROM booking_status_logs l
    WHERE l.booking_id = r.booking_id
      AND l.action_type = 'membership_reward'
);

/* ============================================================
   8. TẠO THÔNG BÁO
   ============================================================ */

INSERT INTO notifications (
    title,
    message,
    content,
    target_role,
    target_user_id,
    is_published,
    created_by,
    created_at,
    updated_at
)
SELECT
    'Cộng điểm sau chuyến đi',
    CONCAT(
        'Bạn được cộng ',
        r.reward_points,
        ' điểm thành viên.'
    ),
    CONCAT(
        'Booking ',
        r.booking_code,
        ' đã hoàn thành. ',
        'Travela đã cộng ',
        r.reward_points,
        ' điểm thành viên. ',
        'Tổng điểm hiện tại: ',
        u.member_points,
        '. Hạng thành viên: ',
        u.member_tier,
        '.'
    ),
    'user',
    r.user_id,
    TRUE,
    NULL,
    NOW(),
    NOW()
FROM tmp_missing_membership_rewards r
INNER JOIN users u
    ON u.id = r.user_id;

/* ============================================================
   9. XEM KẾT QUẢ SAU KHI CỘNG
   ============================================================ */

SELECT
    r.booking_id,
    r.booking_code,
    r.user_id,
    b.booking_status,
    r.reward_points,
    u.member_points AS points_after_reward,
    u.member_tier AS tier_after_reward,
    EXISTS (
        SELECT 1
        FROM booking_status_logs l
        WHERE l.booking_id = r.booking_id
          AND l.action_type = 'membership_reward'
    ) AS rewarded
FROM tmp_missing_membership_rewards r
INNER JOIN bookings b
    ON b.id = r.booking_id
INNER JOIN users u
    ON u.id = r.user_id
ORDER BY r.user_id, r.booking_id;

/* Tổng cộng */
SELECT
    COUNT(*) AS total_rewarded_bookings,
    COUNT(DISTINCT user_id) AS total_rewarded_users,
    SUM(reward_points) AS total_points_added
FROM tmp_missing_membership_rewards;

COMMIT;

DROP TEMPORARY TABLE IF EXISTS tmp_missing_membership_rewards;




SET NAMES utf8mb4;
SET SESSION time_zone = '+07:00';
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

-- ------------------------------------------------------------
-- 1. Xem trước các yêu cầu hoàn tiền đang thiếu thông tin
-- ------------------------------------------------------------
SELECT
    rr.id AS refund_id,
    b.booking_code,
    COALESCE(u.full_name, b.contact_name, 'Khách hàng Travela') AS customer_name,
    rr.status,
    rr.refund_amount,
    rr.refund_bank_name,
    rr.refund_account_no,
    rr.refund_account_name,
    rr.refund_qr_url
FROM refund_requests rr
INNER JOIN bookings b
    ON b.id = rr.booking_id
LEFT JOIN users u
    ON u.id = COALESCE(rr.user_id, b.user_id)
WHERE NULLIF(TRIM(rr.refund_bank_name), '') IS NULL
   OR NULLIF(TRIM(rr.refund_account_no), '') IS NULL
   OR NULLIF(TRIM(rr.refund_account_name), '') IS NULL
ORDER BY rr.id;

-- ------------------------------------------------------------
-- 2. Tạo bảng tạm chứa dữ liệu ngân hàng giả lập giống thật
-- ------------------------------------------------------------
DROP TEMPORARY TABLE IF EXISTS tmp_refund_bank_seed;

CREATE TEMPORARY TABLE tmp_refund_bank_seed (
    refund_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    bank_name VARCHAR(100) NOT NULL,
    account_no VARCHAR(50) NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    qr_url VARCHAR(500) NULL
);

INSERT INTO tmp_refund_bank_seed (
    refund_id,
    bank_name,
    account_no,
    account_name,
    qr_url
)
SELECT
    rr.id,

    CASE MOD(COALESCE(rr.user_id, b.user_id, rr.id), 8)
        WHEN 0 THEN 'Vietcombank'
        WHEN 1 THEN 'BIDV'
        WHEN 2 THEN 'VietinBank'
        WHEN 3 THEN 'Agribank'
        WHEN 4 THEN 'MB Bank'
        WHEN 5 THEN 'Techcombank'
        WHEN 6 THEN 'ACB'
        ELSE 'Sacombank'
    END AS bank_name,

    CASE MOD(COALESCE(rr.user_id, b.user_id, rr.id), 8)
        WHEN 0 THEN CONCAT(
            '102',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
        WHEN 1 THEN CONCAT(
            '215',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
        WHEN 2 THEN CONCAT(
            '711',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
        WHEN 3 THEN CONCAT(
            '130',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
        WHEN 4 THEN CONCAT(
            '068',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
        WHEN 5 THEN CONCAT(
            '190',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
        WHEN 6 THEN CONCAT(
            '668',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
        ELSE CONCAT(
            '060',
            LPAD(
                MOD(
                    COALESCE(rr.user_id, b.user_id, 0) * 100000 + rr.id,
                    1000000000
                ),
                9,
                '0'
            )
        )
    END AS account_no,

    UPPER(
        TRIM(
            COALESCE(
                NULLIF(u.full_name, ''),
                NULLIF(b.contact_name, ''),
                CONCAT('KHACH HANG TRAVELA ', rr.id)
            )
        )
    ) AS account_name,

    CONCAT(
        '/uploads/refunds/qr/refund-',
        rr.id,
        '.png'
    ) AS qr_url

FROM refund_requests rr
INNER JOIN bookings b
    ON b.id = rr.booking_id
LEFT JOIN users u
    ON u.id = COALESCE(rr.user_id, b.user_id)
WHERE NULLIF(TRIM(rr.refund_bank_name), '') IS NULL
   OR NULLIF(TRIM(rr.refund_account_no), '') IS NULL
   OR NULLIF(TRIM(rr.refund_account_name), '') IS NULL
   OR NULLIF(TRIM(rr.refund_qr_url), '') IS NULL;

-- ------------------------------------------------------------
-- 3. Kiểm tra dữ liệu chuẩn bị cập nhật
-- ------------------------------------------------------------
SELECT
    rr.id AS refund_id,
    b.booking_code,
    seed.bank_name,
    seed.account_no,
    seed.account_name,
    seed.qr_url
FROM tmp_refund_bank_seed seed
INNER JOIN refund_requests rr
    ON rr.id = seed.refund_id
INNER JOIN bookings b
    ON b.id = rr.booking_id
ORDER BY rr.id;

-- ------------------------------------------------------------
-- 4. Bổ sung đúng các trường còn thiếu
-- ------------------------------------------------------------
UPDATE refund_requests rr
INNER JOIN tmp_refund_bank_seed seed
    ON seed.refund_id = rr.id
SET
    rr.refund_bank_name = COALESCE(
        NULLIF(TRIM(rr.refund_bank_name), ''),
        seed.bank_name
    ),
    rr.refund_account_no = COALESCE(
        NULLIF(TRIM(rr.refund_account_no), ''),
        seed.account_no
    ),
    rr.refund_account_name = COALESCE(
        NULLIF(TRIM(rr.refund_account_name), ''),
        seed.account_name
    ),
    rr.refund_qr_url = COALESCE(
        NULLIF(TRIM(rr.refund_qr_url), ''),
        seed.qr_url
    ),
    rr.updated_at = NOW();

-- ------------------------------------------------------------
-- 5. Kiểm tra kết quả sau cập nhật
-- ------------------------------------------------------------
SELECT
    rr.id AS refund_id,
    b.booking_code,
    COALESCE(u.full_name, b.contact_name, 'Khách hàng Travela') AS customer_name,
    rr.status,
    rr.refund_amount,
    rr.refund_bank_name,
    rr.refund_account_no,
    rr.refund_account_name,
    rr.refund_qr_url,
    rr.updated_at
FROM refund_requests rr
INNER JOIN bookings b
    ON b.id = rr.booking_id
LEFT JOIN users u
    ON u.id = COALESCE(rr.user_id, b.user_id)
WHERE rr.id IN (
    SELECT refund_id
    FROM tmp_refund_bank_seed
)
ORDER BY rr.id;

COMMIT;

DROP TEMPORARY TABLE IF EXISTS tmp_refund_bank_seed;

SET SQL_SAFE_UPDATES = 1;

-- Chạy trên đúng database Travela.
-- Script an toàn để chạy lại: CREATE TABLE IF NOT EXISTS + INSERT ... ON DUPLICATE KEY UPDATE.

CREATE TABLE IF NOT EXISTS destination_landmarks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  destination_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  normalized_name VARCHAR(180) NOT NULL,
  aliases JSON NULL,
  description TEXT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_destination_landmark (destination_id, normalized_name),
  KEY idx_destination_landmark_normalized (normalized_name),
  KEY idx_destination_landmark_destination (destination_id),
  CONSTRAINT destination_landmarks_ibfk_1
    FOREIGN KEY (destination_id) REFERENCES destinations(id)
    ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tây Ninh
INSERT INTO destination_landmarks
(destination_id, name, normalized_name, aliases, description, status)
SELECT d.id, 'Núi Bà Đen', 'nui ba den',
       JSON_ARRAY('núi bà đen','nui ba den','bà đen','ba den','black virgin mountain'),
       'Địa danh du lịch nổi tiếng tại tỉnh Tây Ninh.', 'active'
FROM destinations d
WHERE LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%tây ninh%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%tay ninh%'
ORDER BY d.id LIMIT 1
ON DUPLICATE KEY UPDATE name=VALUES(name), aliases=VALUES(aliases), description=VALUES(description), status='active';

INSERT INTO destination_landmarks
(destination_id, name, normalized_name, aliases, description, status)
SELECT d.id, 'Tòa Thánh Cao Đài Tây Ninh', 'toa thanh cao dai tay ninh',
       JSON_ARRAY('tòa thánh tây ninh','toa thanh tay ninh','tòa thánh cao đài','cao dai holy see'),
       'Công trình tôn giáo nổi tiếng tại Tây Ninh.', 'active'
FROM destinations d
WHERE LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%tây ninh%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%tay ninh%'
ORDER BY d.id LIMIT 1
ON DUPLICATE KEY UPDATE name=VALUES(name), aliases=VALUES(aliases), description=VALUES(description), status='active';

-- An Giang
INSERT INTO destination_landmarks
(destination_id, name, normalized_name, aliases, description, status)
SELECT d.id, 'Miếu Bà Chúa Xứ Núi Sam', 'mieu ba chua xu nui sam',
       JSON_ARRAY('miếu bà chúa xứ','mieu ba chua xu','núi sam','nui sam','châu đốc','chau doc'),
       'Địa danh hành hương nổi tiếng tại Châu Đốc, An Giang.', 'active'
FROM destinations d
WHERE LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%an giang%'
ORDER BY d.id LIMIT 1
ON DUPLICATE KEY UPDATE name=VALUES(name), aliases=VALUES(aliases), description=VALUES(description), status='active';

-- Ninh Bình
INSERT INTO destination_landmarks
(destination_id, name, normalized_name, aliases, description, status)
SELECT d.id, 'Quần thể danh thắng Tràng An', 'trang an',
       JSON_ARRAY('tràng an','trang an','khu du lịch tràng an','ninh bình','ninh binh'),
       'Quần thể danh thắng tại Ninh Bình.', 'active'
FROM destinations d
WHERE LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%ninh bình%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%ninh binh%'
ORDER BY d.id LIMIT 1
ON DUPLICATE KEY UPDATE name=VALUES(name), aliases=VALUES(aliases), description=VALUES(description), status='active';

-- Đà Nẵng
INSERT INTO destination_landmarks
(destination_id, name, normalized_name, aliases, description, status)
SELECT d.id, 'Bà Nà Hills', 'ba na hills',
       JSON_ARRAY('bà nà hills','ba na hills','bà nà','ba na','cầu vàng','cau vang','golden bridge'),
       'Khu du lịch nổi tiếng tại Đà Nẵng.', 'active'
FROM destinations d
WHERE LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%đà nẵng%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%da nang%'
ORDER BY d.id LIMIT 1
ON DUPLICATE KEY UPDATE name=VALUES(name), aliases=VALUES(aliases), description=VALUES(description), status='active';

-- Cần Thơ
INSERT INTO destination_landmarks
(destination_id, name, normalized_name, aliases, description, status)
SELECT d.id, 'Chợ nổi Cái Răng', 'cho noi cai rang',
       JSON_ARRAY('chợ nổi cái răng','cho noi cai rang','cái răng','cai rang','floating market'),
       'Chợ nổi đặc trưng của thành phố Cần Thơ.', 'active'
FROM destinations d
WHERE LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%cần thơ%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%can tho%'
ORDER BY d.id LIMIT 1
ON DUPLICATE KEY UPDATE name=VALUES(name), aliases=VALUES(aliases), description=VALUES(description), status='active';

-- Bình Thuận / Mũi Né
INSERT INTO destination_landmarks
(destination_id, name, normalized_name, aliases, description, status)
SELECT d.id, 'Bàu Trắng', 'bau trang',
       JSON_ARRAY('bàu trắng','bau trang','đồi cát bàu trắng','doi cat bau trang','đồi cát trắng','white sand dunes'),
       'Đồi cát và hồ nước nổi tiếng tại Bình Thuận.', 'active'
FROM destinations d
WHERE LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%bình thuận%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%binh thuan%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%mũi né%'
   OR LOWER(CONCAT(d.name, ' ', d.province)) LIKE '%mui ne%'
ORDER BY d.id LIMIT 1
ON DUPLICATE KEY UPDATE name=VALUES(name), aliases=VALUES(aliases), description=VALUES(description), status='active';

SELECT dl.id, dl.name AS landmark, d.name AS destination, d.province, dl.aliases
FROM destination_landmarks dl
JOIN destinations d ON d.id = dl.destination_id
ORDER BY d.province, dl.name;


INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Hòn Thơm',
    'hon thom',
    JSON_ARRAY(
        'hòn thơm',
        'hon thom',
        'cáp treo hòn thơm',
        'cap treo hon thom',
        'sun world hòn thơm',
        'sun world hon thom',
        'đảo hòn thơm',
        'hon thom island'
    ),
    'Địa danh biển đảo và khu vui chơi nổi tiếng tại Phú Quốc, Kiên Giang.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%phú quốc%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%phu quoc%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%kiên giang%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%kien giang%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%phú quốc%'
          OR LOWER(d.name) LIKE '%phu quoc%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   2. NHA TRANG - KHÁNH HÒA
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Tháp Bà Ponagar',
    'thap ba ponagar',
    JSON_ARRAY(
        'tháp bà ponagar',
        'thap ba ponagar',
        'tháp bà po nagar',
        'thap ba po nagar',
        'po nagar',
        'ponagar',
        'tháp chăm nha trang',
        'cham towers nha trang'
    ),
    'Quần thể kiến trúc Chăm Pa nổi tiếng tại thành phố Nha Trang, Khánh Hòa.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%nha trang%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%khánh hòa%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%khanh hoa%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%nha trang%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   3. ĐÀ LẠT - LÂM ĐỒNG
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Núi Langbiang',
    'nui langbiang',
    JSON_ARRAY(
        'núi langbiang',
        'nui langbiang',
        'langbiang',
        'lang biang',
        'đỉnh langbiang',
        'dinh langbiang',
        'langbiang mountain'
    ),
    'Ngọn núi và điểm tham quan nổi tiếng tại Đà Lạt, Lâm Đồng.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%đà lạt%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%da lat%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%dalat%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%lâm đồng%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%lam dong%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%đà lạt%'
          OR LOWER(d.name) LIKE '%da lat%'
          OR LOWER(d.name) LIKE '%dalat%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   4. ĐÀ NẴNG
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Bà Nà Hills',
    'ba na hills',
    JSON_ARRAY(
        'bà nà hills',
        'ba na hills',
        'bà nà',
        'ba na',
        'cầu vàng',
        'cau vang',
        'golden bridge',
        'sun world bà nà hills',
        'sun world ba na hills'
    ),
    'Khu du lịch nổi tiếng với Cầu Vàng tại thành phố Đà Nẵng.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%đà nẵng%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%da nang%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%danang%'
ORDER BY d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   5. CẦN THƠ
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Chợ nổi Cái Răng',
    'cho noi cai rang',
    JSON_ARRAY(
        'chợ nổi cái răng',
        'cho noi cai rang',
        'cái răng',
        'cai rang',
        'chợ nổi cần thơ',
        'cho noi can tho',
        'cai rang floating market',
        'floating market'
    ),
    'Chợ nổi đặc trưng của vùng sông nước Cần Thơ.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%cần thơ%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%can tho%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%cantho%'
ORDER BY d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   6. SA PA - LÀO CAI
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Đỉnh Fansipan',
    'dinh fansipan',
    JSON_ARRAY(
        'đỉnh fansipan',
        'dinh fansipan',
        'fansipan',
        'phan xi păng',
        'phan xi pang',
        'nóc nhà đông dương',
        'noc nha dong duong',
        'fansipan mountain'
    ),
    'Đỉnh núi cao nổi tiếng tại Sa Pa, Lào Cai.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%sa pa%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%sapa%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%lào cai%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%lao cai%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%sa pa%'
          OR LOWER(d.name) LIKE '%sapa%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   7. HẠ LONG - QUẢNG NINH
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Vịnh Hạ Long',
    'vinh ha long',
    JSON_ARRAY(
        'vịnh hạ long',
        'vinh ha long',
        'hạ long bay',
        'ha long bay',
        'halong bay',
        'vịnh đá vôi',
        'du thuyền hạ long',
        'du thuyen ha long'
    ),
    'Di sản thiên nhiên nổi tiếng tại Quảng Ninh.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%hạ long%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%ha long%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%halong%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%quảng ninh%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%quang ninh%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%hạ long%'
          OR LOWER(d.name) LIKE '%ha long%'
          OR LOWER(d.name) LIKE '%halong%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   8. HỘI AN - QUẢNG NAM
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Phố cổ Hội An',
    'pho co hoi an',
    JSON_ARRAY(
        'phố cổ hội an',
        'pho co hoi an',
        'hội an',
        'hoi an',
        'hoian',
        'chùa cầu',
        'chua cau',
        'đèn lồng hội an',
        'den long hoi an',
        'hoi an ancient town'
    ),
    'Khu phố cổ nổi tiếng tại Quảng Nam.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%hội an%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%hoi an%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%hoian%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%hội an%'
          OR LOWER(d.name) LIKE '%hoi an%'
          OR LOWER(d.name) LIKE '%hoian%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   9. HUẾ
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Đại Nội Huế',
    'dai noi hue',
    JSON_ARRAY(
        'đại nội huế',
        'dai noi hue',
        'đại nội',
        'dai noi',
        'kinh thành huế',
        'kinh thanh hue',
        'hoàng thành huế',
        'hoang thanh hue',
        'hue imperial city',
        'cố đô huế',
        'co do hue'
    ),
    'Quần thể kiến trúc cung đình nổi tiếng tại cố đô Huế.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%huế%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%hue%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%thừa thiên%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%thua thien%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%huế%'
          OR LOWER(d.name) LIKE '%hue%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   10. MŨI NÉ - BÌNH THUẬN
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Bàu Trắng',
    'bau trang',
    JSON_ARRAY(
        'bàu trắng',
        'bau trang',
        'đồi cát bàu trắng',
        'doi cat bau trang',
        'đồi cát trắng',
        'doi cat trang',
        'white sand dunes',
        'bình thuận sand dunes',
        'mui ne sand dunes'
    ),
    'Đồi cát và hồ nước nổi tiếng tại Bình Thuận, gần khu vực Mũi Né.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%mũi né%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%mui ne%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%bình thuận%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%binh thuan%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%mũi né%'
          OR LOWER(d.name) LIKE '%mui ne%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   11. QUY NHƠN - BÌNH ĐỊNH
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Kỳ Co',
    'ky co',
    JSON_ARRAY(
        'kỳ co',
        'ky co',
        'bãi kỳ co',
        'bai ky co',
        'biển kỳ co',
        'bien ky co',
        'ky co beach',
        'đảo kỳ co',
        'dao ky co'
    ),
    'Bãi biển nổi tiếng tại Quy Nhơn, Bình Định.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%quy nhơn%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%quy nhon%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%bình định%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%binh dinh%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%quy nhơn%'
          OR LOWER(d.name) LIKE '%quy nhon%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   12. NINH BÌNH
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Quần thể danh thắng Tràng An',
    'trang an',
    JSON_ARRAY(
        'tràng an',
        'trang an',
        'khu du lịch tràng an',
        'khu du lich trang an',
        'quần thể danh thắng tràng an',
        'quan the danh thang trang an',
        'trang an scenic landscape complex'
    ),
    'Quần thể danh thắng nổi tiếng tại tỉnh Ninh Bình.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%ninh bình%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%ninh binh%'
ORDER BY d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   13. HÀ GIANG
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Đèo Mã Pì Lèng',
    'deo ma pi leng',
    JSON_ARRAY(
        'đèo mã pì lèng',
        'deo ma pi leng',
        'mã pì lèng',
        'ma pi leng',
        'mã pí lèng',
        'ma pi leng pass',
        'hẻm vực tu sản',
        'hem vuc tu san',
        'sông nho quế',
        'song nho que'
    ),
    'Cung đèo nổi tiếng trên cao nguyên đá Hà Giang.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%hà giang%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%ha giang%'
ORDER BY d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   14. MỘC CHÂU - SƠN LA
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Đồi chè trái tim Mộc Châu',
    'doi che trai tim moc chau',
    JSON_ARRAY(
        'đồi chè trái tim',
        'doi che trai tim',
        'đồi chè mộc châu',
        'doi che moc chau',
        'đồi chè trái tim mộc châu',
        'doi che trai tim moc chau',
        'mộc châu tea hill',
        'moc chau tea hill'
    ),
    'Đồi chè nổi tiếng tại cao nguyên Mộc Châu, Sơn La.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%mộc châu%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%moc chau%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%mộc châu%'
          OR LOWER(d.name) LIKE '%moc chau%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   15. BUÔN MA THUỘT - ĐẮK LẮK
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Thác Dray Nur',
    'thac dray nur',
    JSON_ARRAY(
        'thác dray nur',
        'thac dray nur',
        'dray nur',
        'thác vợ',
        'thac vo',
        'dray nur waterfall',
        'thác đắk lắk',
        'thac dak lak'
    ),
    'Thác nước nổi tiếng gần thành phố Buôn Ma Thuột, Đắk Lắk.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%buôn ma thuột%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%buon ma thuot%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%đắk lắk%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%dak lak%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%buôn ma thuột%'
          OR LOWER(d.name) LIKE '%buon ma thuot%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   16. CÔN ĐẢO
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Nhà tù Côn Đảo',
    'nha tu con dao',
    JSON_ARRAY(
        'nhà tù côn đảo',
        'nha tu con dao',
        'nhà tù phú hải',
        'nha tu phu hai',
        'chuồng cọp côn đảo',
        'chuong cop con dao',
        'con dao prison',
        'di tích côn đảo',
        'di tich con dao'
    ),
    'Di tích lịch sử nổi tiếng tại Côn Đảo.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%côn đảo%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%con dao%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%côn đảo%'
          OR LOWER(d.name) LIKE '%con dao%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   17. VŨNG TÀU
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Tượng Chúa Kitô Vua',
    'tuong chua kito vua',
    JSON_ARRAY(
        'tượng chúa kitô vua',
        'tuong chua kito vua',
        'tượng chúa vũng tàu',
        'tuong chua vung tau',
        'tượng chúa dang tay',
        'tuong chua dang tay',
        'christ of vung tau',
        'christ the king statue'
    ),
    'Tượng Chúa Kitô Vua nổi tiếng tại thành phố Vũng Tàu.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%vũng tàu%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%vung tau%'
ORDER BY
    CASE
        WHEN LOWER(d.name) LIKE '%vũng tàu%'
          OR LOWER(d.name) LIKE '%vung tau%' THEN 0
        ELSE 1
    END,
    d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   18. TÂY NINH
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Núi Bà Đen',
    'nui ba den',
    JSON_ARRAY(
        'núi bà đen',
        'nui ba den',
        'bà đen',
        'ba den',
        'đỉnh núi bà đen',
        'dinh nui ba den',
        'cáp treo núi bà đen',
        'cap treo nui ba den',
        'black virgin mountain',
        'sun world ba den mountain'
    ),
    'Ngọn núi và khu du lịch nổi tiếng tại tỉnh Tây Ninh.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%tây ninh%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%tay ninh%'
ORDER BY d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   19. AN GIANG
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Rừng tràm Trà Sư',
    'rung tram tra su',
    JSON_ARRAY(
        'rừng tràm trà sư',
        'rung tram tra su',
        'trà sư',
        'tra su',
        'rừng tràm an giang',
        'rung tram an giang',
        'tra su cajuput forest',
        'tra su forest',
        'tịnh biên',
        'tinh bien'
    ),
    'Khu rừng ngập nước và điểm du lịch sinh thái nổi tiếng tại An Giang.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%an giang%'
ORDER BY d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   20. CÀ MAU
   ========================================================= */
INSERT INTO destination_landmarks (
    destination_id,
    name,
    normalized_name,
    aliases,
    description,
    status
)
SELECT
    d.id,
    'Mũi Cà Mau',
    'mui ca mau',
    JSON_ARRAY(
        'mũi cà mau',
        'mui ca mau',
        'đất mũi cà mau',
        'dat mui ca mau',
        'đất mũi',
        'dat mui',
        'cột mốc tọa độ quốc gia',
        'cot moc toa do quoc gia',
        'cape ca mau',
        'ca mau cape'
    ),
    'Điểm cực Nam và biểu tượng du lịch nổi tiếng của tỉnh Cà Mau.',
    'active'
FROM destinations d
WHERE
    LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%cà mau%'
    OR LOWER(CONCAT_WS(' ', d.name, d.province)) LIKE '%ca mau%'
ORDER BY d.id
LIMIT 1
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    aliases = VALUES(aliases),
    description = VALUES(description),
    status = 'active';


/* =========================================================
   KIỂM TRA KẾT QUẢ
   ========================================================= */

SELECT
    dl.id,
    dl.name AS landmark,
    dl.normalized_name,
    d.id AS destination_id,
    d.name AS destination,
    d.province,
    dl.aliases,
    dl.status
FROM destination_landmarks dl
JOIN destinations d
    ON d.id = dl.destination_id
ORDER BY d.id, dl.name;


/* Kiểm tra điểm đến nào chưa có địa danh */
SELECT
    d.id,
    d.name,
    d.province
FROM destinations d
LEFT JOIN destination_landmarks dl
    ON dl.destination_id = d.id
    AND dl.status = 'active'
WHERE dl.id IS NULL
ORDER BY d.id;