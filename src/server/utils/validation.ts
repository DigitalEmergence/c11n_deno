/**
 * Validates email format using regex
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates URL format
 */
export function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a value is not null, undefined, or empty string
 */
export function validateRequired(value: any): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Validates string length is within min/max bounds
 */
export function validateLength(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

/**
 * Sanitizes input by trimming and removing potentially dangerous characters
 */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>\"']/g, "");
}

/**
 * Validates deployment name format for Cloud Run
 * Cloud Run service names must be lowercase letters, numbers, and hyphens
 */
export function validateDeploymentName(name: string): boolean {
  const nameRegex = /^[a-z0-9-]+$/;
  return nameRegex.test(name) && name.length >= 1 && name.length <= 63;
}

/**
 * Validates GCP project ID format
 * GCP project IDs must be 6-30 chars, lowercase letters, numbers, and hyphens
 */
export function validateGCPProjectId(projectId: string): boolean {
  const projectRegex = /^[a-z0-9-]{6,30}$/;
  return projectRegex.test(projectId);
}

/**
 * Validates port number is within valid range
 */
export function validatePort(port: string | number): boolean {
  const portNum = typeof port === 'string' ? parseInt(port) : port;
  return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
}

/**
 * Validates GitHub username format
 */
export function validateGitHubUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]){0,38}$/;
  return usernameRegex.test(username);
}

/**
 * Validates GitHub repository name format
 */
export function validateGitHubRepoName(repoName: string): boolean {
  const repoRegex = /^[a-zA-Z0-9._-]+$/;
  return repoRegex.test(repoName) && repoName.length <= 100;
}

/**
 * Validates JSphere config name format
 */
export function validateJSphereConfigName(name: string): boolean {
  const configRegex = /^[a-zA-Z0-9_-]+$/;
  return configRegex.test(name) && name.length >= 1 && name.length <= 50;
}

/**
 * Validates GitHub token format (basic check)
 */
export function validateGitHubToken(token: string): boolean {
  // GitHub personal access tokens start with ghp_, gho_, ghu_, or ghs_
  const tokenRegex = /^gh[pous]_[a-zA-Z0-9]{36}$/;
  return tokenRegex.test(token);
}

/**
 * Validates password strength
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  
  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates JSON string format
 */
export function validateJSON(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates memory format for Cloud Run (e.g., "512Mi", "1Gi")
 */
export function validateMemoryFormat(memory: string): boolean {
  const memoryRegex = /^(128|256|512|1024|2048|4096|8192|16384|32768)Mi$|^(1|2|4|8|16|32)Gi$/;
  return memoryRegex.test(memory);
}

/**
 * Validates CPU format for Cloud Run (e.g., "1", "2", "4")
 */
export function validateCPUFormat(cpu: string): boolean {
  const cpuRegex = /^(1|2|4|6|8)$/;
  return cpuRegex.test(cpu);
}

/**
 * Validates GCP region format
 */
export function validateGCPRegion(region: string): boolean {
  const validRegions = [
    'us-central1', 'us-east1', 'us-east4', 'us-west1', 'us-west2', 'us-west3', 'us-west4',
    'europe-north1', 'europe-west1', 'europe-west2', 'europe-west3', 'europe-west4', 'europe-west6',
    'asia-east1', 'asia-east2', 'asia-northeast1', 'asia-northeast2', 'asia-northeast3',
    'asia-south1', 'asia-southeast1', 'asia-southeast2', 'australia-southeast1',
    'southamerica-east1'
  ];
  return validRegions.includes(region);
}

/**
 * Validates timeout value for Cloud Run (1-3600 seconds)
 */
export function validateTimeout(timeout: string | number): boolean {
  const timeoutNum = typeof timeout === 'string' ? parseInt(timeout) : timeout;
  return !isNaN(timeoutNum) && timeoutNum >= 1 && timeoutNum <= 3600;
}

/**
 * Validates concurrency value for Cloud Run (1-1000)
 */
export function validateConcurrency(concurrency: string | number): boolean {
  const concurrencyNum = typeof concurrency === 'string' ? parseInt(concurrency) : concurrency;
  return !isNaN(concurrencyNum) && concurrencyNum >= 1 && concurrencyNum <= 1000;
}

/**
 * Validates max instances value for Cloud Run (1-1000)
 */
export function validateMaxInstances(maxInstances: string | number): boolean {
  const maxInstancesNum = typeof maxInstances === 'string' ? parseInt(maxInstances) : maxInstances;
  return !isNaN(maxInstancesNum) && maxInstancesNum >= 1 && maxInstancesNum <= 1000;
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  public field?: string;
  public code?: string;

  constructor(message: string, field?: string, code?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.code = code;
  }
}

/**
 * Validates an object against a schema
 */
export function validateObject(obj: any, schema: ValidationSchema): ValidationResult {
  const errors: ValidationError[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = obj[field];

    // Check required fields
    if (rules.required && !validateRequired(value)) {
      errors.push(new ValidationError(`${field} is required`, field, 'REQUIRED'));
      continue;
    }

    // Skip validation if field is not required and empty
    if (!rules.required && !validateRequired(value)) {
      continue;
    }

    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(new ValidationError(`${field} must be of type ${rules.type}`, field, 'TYPE'));
      continue;
    }

    // String length validation
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(new ValidationError(`${field} must be at least ${rules.minLength} characters`, field, 'MIN_LENGTH'));
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(new ValidationError(`${field} must be no more than ${rules.maxLength} characters`, field, 'MAX_LENGTH'));
    }

    // Pattern validation
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(new ValidationError(`${field} format is invalid`, field, 'PATTERN'));
    }

    // Custom validation
    if (rules.validator && !rules.validator(value)) {
      errors.push(new ValidationError(`${field} is invalid`, field, 'CUSTOM'));
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(new ValidationError(`${field} must be one of: ${rules.enum.join(', ')}`, field, 'ENUM'));
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Types for validation schema
 */
export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object';
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  validator?: (value: any) => boolean;
  enum?: any[];
}

export interface ValidationSchema {
  [field: string]: ValidationRule;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Pre-defined validation schemas for common objects
 */
export const ValidationSchemas = {
  JSphereConfig: {
    name: {
      required: true,
      type: 'string' as const,
      minLength: 1,
      maxLength: 50,
      pattern: /^[a-zA-Z0-9_-]+$/
    },
    project_namespace: {
      required: true,
      type: 'string' as const,
      validator: validateGitHubUsername
    },
    project_name: {
      required: true,
      type: 'string' as const,
      validator: validateGitHubRepoName
    },
    project_auth_token: {
      required: true,
      type: 'string' as const,
      validator: validateGitHubToken
    },
    project_app_config: {
      required: true,
      type: 'string' as const,
      minLength: 1,
      maxLength: 100
    }
  },

  Deployment: {
    name: {
      required: true,
      type: 'string' as const,
      validator: validateDeploymentName
    },
    region: {
      required: true,
      type: 'string' as const,
      validator: validateGCPRegion
    },
    memory: {
      required: false,
      type: 'string' as const,
      validator: validateMemoryFormat
    },
    cpu: {
      required: false,
      type: 'string' as const,
      validator: validateCPUFormat
    }
  },

  LocalServer: {
    port: {
      required: true,
      type: 'string' as const,
      validator: (value: string) => validatePort(value)
    }
  }
};

/**
 * Utility function to validate common request bodies
 */
export function validateRequestBody(body: any, schemaName: keyof typeof ValidationSchemas): ValidationResult {
  const schema = ValidationSchemas[schemaName];
  if (!schema) {
    throw new Error(`Unknown validation schema: ${schemaName}`);
  }
  return validateObject(body, schema);
}