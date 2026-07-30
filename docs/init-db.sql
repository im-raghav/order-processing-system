-- Creates one logical database per service in the shared local MySQL instance.
-- Each service connects only to its own database; there are no cross-database
-- foreign keys or joins anywhere in this system.
CREATE DATABASE IF NOT EXISTS order_service;
CREATE DATABASE IF NOT EXISTS inventory_service;
CREATE DATABASE IF NOT EXISTS payment_service;
CREATE DATABASE IF NOT EXISTS shipping_service;
CREATE DATABASE IF NOT EXISTS notification_service;
CREATE DATABASE IF NOT EXISTS coordinator;
