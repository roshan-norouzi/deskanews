import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { isOrganizationAssignablePermission } from '@deska/shared';

export function IsOrganizationAssignablePermission(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isOrganizationAssignablePermission',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value == null) return true;
          if (Array.isArray(value)) {
            return value.every((item) => typeof item === 'string' && isOrganizationAssignablePermission(item));
          }
          return typeof value === 'string' && isOrganizationAssignablePermission(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${String(args.property)} شامل سطح دسترسی نامعتبر است`;
        },
      },
    });
  };
}
