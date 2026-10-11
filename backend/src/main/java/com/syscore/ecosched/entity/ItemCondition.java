package com.syscore.ecosched.entity;

/** Condition of an e-waste item. Must match the CHECK constraint in database/schema.sql. */
public enum ItemCondition {
    WORKING,
    DAMAGED,
    NON_WORKING
}
