-- حذف کامل داده‌ها و جداول ماژول‌های خارج از هسته و منابع انسانی.
-- این مهاجرت عمداً اجرا نشده است؛ پیش از استقرار از پایگاه داده نسخه پشتیبان بگیرید.
DROP TABLE IF EXISTS
  "SurveyResponse", "SurveyQuestion", "Survey", "EmailCampaign", "SmsCampaign", "MarketingEvent",
  "CourseEnrollment", "CourseLesson", "Course", "BlogPost", "WebsitePage",
  "MaintenanceRequest", "QualityInspection", "WorkOrder", "BomLine", "BillOfMaterial",
  "Appointment", "FieldServiceOrder", "HelpdeskTicket", "ProjectTask", "ProjectMilestone", "Project",
  "PurchaseOrderLine", "PurchaseOrder", "StockMove", "StockQuant", "Warehouse", "Product",
  "DashboardWidget", "Dashboard", "ReportDefinition"
  CASCADE;

DELETE FROM "RolePermission"
WHERE permission NOT LIKE 'platform.%'
  AND permission NOT LIKE 'dashboard.%'
  AND permission NOT LIKE 'settings.%'
  AND permission NOT LIKE 'users.%'
  AND permission NOT LIKE 'roles.%'
  AND permission NOT LIKE 'modules.%'
  AND permission NOT LIKE 'contacts.%'
  AND permission NOT LIKE 'documents.%'
  AND permission NOT LIKE 'calendar.%'
  AND permission NOT LIKE 'hr.%';

DELETE FROM "TenantModule" WHERE "moduleId" IN (
  SELECT id FROM "ModuleDefinition" WHERE id NOT IN ('contacts', 'documents', 'calendar', 'hr')
);
DELETE FROM "ModuleDefinition" WHERE id NOT IN ('contacts', 'documents', 'calendar', 'hr');
DELETE FROM "NumberSequence" WHERE code IN ('product', 'warehouse', 'stock_move', 'purchase_order', 'project', 'ticket', 'work_order');
