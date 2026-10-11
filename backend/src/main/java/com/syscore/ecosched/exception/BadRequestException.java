package com.syscore.ecosched.exception;

/** Thrown when the request breaks a business rule -> HTTP 400. */
public class BadRequestException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public BadRequestException(String message) {
        super(message);
    }
}
