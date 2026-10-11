package com.syscore.ecosched.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * JSON body for POST /api/requests.
 * status, team_id and request_time are NOT accepted: the server sets them
 * (status = PENDING, team_id = null, request_time = now).
 */
public class PickupRequestCreateRequest {

    @NotNull(message = "user_id is required")
    private Long userId;

    @NotNull(message = "item_id is required")
    private Long itemId;

    @NotBlank(message = "location is required")
    @Size(max = 255, message = "location must be at most 255 characters")
    private String location;

    /** Optional. 1 to 10, higher number = higher priority. Defaults to 1. */
    @Min(value = 1, message = "priority must be between 1 and 10")
    @Max(value = 10, message = "priority must be between 1 and 10")
    private Integer priority;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Long getItemId() { return itemId; }
    public void setItemId(Long itemId) { this.itemId = itemId; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public Integer getPriority() { return priority; }
    public void setPriority(Integer priority) { this.priority = priority; }
}
