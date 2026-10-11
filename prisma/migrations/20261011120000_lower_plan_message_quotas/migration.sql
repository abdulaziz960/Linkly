-- Lower the monthly marketing-message quota of the four capped plans.
-- Guarded by the old default so a value an admin already customised is never overwritten.
UPDATE plans SET message_quota = 500  WHERE name = 'باقة الأفراد'            AND message_quota = 1000;
UPDATE plans SET message_quota = 1500 WHERE name = 'الباقة العادية'          AND message_quota = 3000;
UPDATE plans SET message_quota = 3000 WHERE name = 'باقة المؤسسات الصغيرة'   AND message_quota = 5000;
UPDATE plans SET message_quota = 5000 WHERE name = 'باقة المؤسسات الكبيرة'   AND message_quota = 7000;
