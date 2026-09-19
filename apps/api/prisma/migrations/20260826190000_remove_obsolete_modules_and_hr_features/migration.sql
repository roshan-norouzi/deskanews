-- Remove discontinued HR features and the last obsolete module artifacts.
DROP TABLE IF EXISTS "AttendanceRecord" CASCADE;
DROP TABLE IF EXISTS "LeaveRequest" CASCADE;
DROP TABLE IF EXISTS "LeaveType" CASCADE;
DROP TABLE IF EXISTS "Payslip" CASCADE;
DROP TABLE IF EXISTS "PayrollComponent" CASCADE;
DROP TABLE IF EXISTS "EmployeeContract" CASCADE;
DROP TABLE IF EXISTS "InsuranceProfile" CASCADE;
DROP TABLE IF EXISTS "ApprovalStep" CASCADE;
DROP TABLE IF EXISTS "ApprovalRequest" CASCADE;

ALTER TABLE "Employee" DROP COLUMN IF EXISTS "salary";

DELETE FROM "RolePermission"
WHERE permission LIKE 'hr.attendance.%'
   OR permission LIKE 'hr.leave.%'
   OR permission LIKE 'hr.payroll.%'
   OR permission LIKE 'approvals.%';

DELETE FROM "CustomFieldValue"
WHERE "entityType" IN (
  'AttendanceRecord',
  'LeaveRequest',
  'LeaveType',
  'Payslip',
  'PayrollComponent',
  'EmployeeContract',
  'InsuranceProfile',
  'ApprovalRequest',
  'ApprovalStep'
);

DELETE FROM "CustomFieldDefinition"
WHERE "moduleId" NOT IN ('contacts', 'documents', 'calendar', 'hr');

DELETE FROM "ModuleDefinition"
WHERE id NOT IN ('contacts', 'documents', 'calendar', 'hr');
