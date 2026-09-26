import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateBy, ValidationOptions } from 'class-validator';

/** A flat object whose values are all strings, with at most 20 keys. */
function IsStringRecord(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isStringRecord',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length <= 20 &&
          Object.entries(value).every(
            ([key, entry]) => key.trim().length > 0 && key.length <= 64 && typeof entry === 'string' && entry.length <= 256,
          ),
        defaultMessage: () => '$property must map up to 20 keys to string values',
      },
    },
    options,
  );
}

/** PUT /affiliate/configs/:platformId */
export class UpsertAffiliateConfigDto {
  /** Which AffiliateProvider builds the links, e.g. "amazon". */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  providerKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  affiliateId!: string;

  /** Extra query parameters added to every outbound link. */
  @IsOptional()
  @IsObject()
  @IsStringRecord()
  trackingParams?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
