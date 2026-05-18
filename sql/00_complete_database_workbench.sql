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

