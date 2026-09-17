import { EmployeeProfileFieldsDto } from '../../tenant/dto/employee-profile-fields.dto';

/** Personal employee information is edited by the user, never by an organization manager. */
export class UpdateEmployeeProfileDto extends EmployeeProfileFieldsDto {}
