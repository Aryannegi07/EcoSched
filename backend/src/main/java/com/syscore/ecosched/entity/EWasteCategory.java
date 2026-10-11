package com.syscore.ecosched.entity;

/** Type of e-waste. Must match the CHECK constraint in database/schema.sql. */
public enum EWasteCategory {
    LAPTOP,
    MOBILE,
    TABLET,
    BATTERY,
    TV_MONITOR,
    APPLIANCE,
    ACCESSORY,
    OTHER
}
