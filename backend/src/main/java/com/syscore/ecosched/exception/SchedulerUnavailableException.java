package com.syscore.ecosched.exception;

/** The C scheduler program is missing, crashed, timed out or printed something unexpected (HTTP 503). */
public class SchedulerUnavailableException extends RuntimeException {
    public SchedulerUnavailableException(String message) { super(message); }
    public SchedulerUnavailableException(String message, Throwable cause) { super(message, cause); }
}
