-- Creates one logical database per service in the shared local MySQL instance.
-- Each service connects only to its own database; there are no cross-database
-- foreign keys or joins anywhere in this system.
CREATE DATABASE IF NOT EXISTS order_service;
CREATE DATABASE IF NOT EXISTS inventory_service;
CREATE DATABASE IF NOT EXISTS payment_service;
CREATE DATABASE IF NOT EXISTS shipping_service;
CREATE DATABASE IF NOT EXISTS notification_service;
CREATE DATABASE IF NOT EXISTS coordinator;

-- MYSQL_USER is only auto-granted access when MYSQL_DATABASE is set (it isn't,
-- since we have six databases), so grant explicitly on each.
GRANT ALL PRIVILEGES ON order_service.* TO 'app'@'%';
GRANT ALL PRIVILEGES ON inventory_service.* TO 'app'@'%';
GRANT ALL PRIVILEGES ON payment_service.* TO 'app'@'%';
GRANT ALL PRIVILEGES ON shipping_service.* TO 'app'@'%';
GRANT ALL PRIVILEGES ON notification_service.* TO 'app'@'%';
GRANT ALL PRIVILEGES ON coordinator.* TO 'app'@'%';
FLUSH PRIVILEGES;
