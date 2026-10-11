package com.syscore.ecosched.entity;

/** Life cycle of a pickup request. */
public enum RequestStatus {
    PENDING,
    ASSIGNED,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED
}
