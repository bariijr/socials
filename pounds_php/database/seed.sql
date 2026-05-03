-- Seed data for Pounds Microfinance

-- Insert default users
INSERT INTO `users` (`email`, `password`, `firstName`, `lastName`, `phone`, `role`, `status`, `emailVerifiedAt`, `notificationPreferences`) VALUES
('superadmin@pounds.mfi', '$2y$12$abcdefghijklmnopqrstuvwxyz123456', 'Super', 'Admin', '+254700000001', 'super_admin', 'active', NOW(), '{"email":true,"sms":true,"whatsapp":false,"push":true}'),
('admin@pounds.mfi', '$2y$12$abcdefghijklmnopqrstuvwxyz123456', 'System', 'Admin', '+254700000002', 'admin', 'active', NOW(), '{"email":true,"sms":true,"whatsapp":false,"push":true}'),
('officer@pounds.mfi', '$2y$12$abcdefghijklmnopqrstuvwxyz123456', 'Loan', 'Officer', '+254700000003', 'loan_officer', 'active', NOW(), '{"email":true,"sms":true,"whatsapp":false,"push":true}'),
('borrower@pounds.mfi', '$2y$12$abcdefghijklmnopqrstuvwxyz123456', 'John', 'Doe', '+254700000004', 'user', 'active', NOW(), '{"email":true,"sms":true,"whatsapp":false,"push":true}');

-- Insert loan packages
INSERT INTO `loan_packages` (`name`, `description`, `interestRate`, `interestFrequency`, `minAmount`, `maxAmount`, `minDuration`, `maxDuration`, `processingFeePercent`, `penaltyPercent`) VALUES
('Starter Loan', 'Small loans for individuals starting out', 10.00, 'monthly', 5000, 50000, 30, 90, 5.00, 5.00),
('Business Loan', 'Medium loans for small businesses', 8.00, 'monthly', 50000, 500000, 90, 365, 5.00, 5.00),
('Premium Loan', 'Large loans for established businesses', 6.00, 'monthly', 500000, 5000000, 180, 730, 3.00, 5.00),
('Emergency Loan', 'Quick short-term loans', 15.00, 'weekly', 1000, 20000, 7, 30, 5.00, 5.00);

-- Insert default settings
INSERT INTO `settings` (`key`, `value`, `type`, `isPublic`) VALUES
('maintenance_mode', 'false', 'boolean', true),
('registration_open', 'true', 'boolean', true),
('max_active_loans_per_user', '3', 'number', false),
('min_loan_application_age_days', '0', 'number', false);
