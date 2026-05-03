'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message) { super(message, 400, 'VALIDATION_ERROR'); }
}

class ExternalServiceError extends AppError {
  constructor(message) { super(message, 503, 'SERVICE_UNAVAILABLE'); }
}

module.exports = { AppError, ValidationError, ExternalServiceError };
