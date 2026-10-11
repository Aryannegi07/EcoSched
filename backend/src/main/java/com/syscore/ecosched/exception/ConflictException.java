package com.syscore.ecosched.exception;

/** Thrown when the request clashes with existing data (duplicates etc.) -> HTTP 409. */
public class ConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ConflictException(String message) {
        super(message);
    }
}
