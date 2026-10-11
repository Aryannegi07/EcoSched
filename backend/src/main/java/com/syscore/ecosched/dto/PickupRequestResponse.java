package com.syscore.ecosched.dto;

import com.syscore.ecosched.entity.PickupRequest;
import com.syscore.ecosched.entity.RequestStatus;

import java.time.LocalDateTime;

/** JSON returned for a pickup request: request_id, user_id, item_id, location, priority, request_time, status, team_id. */
public class PickupRequestResponse {

    private Long requestId;
    private Long userId;
    private Long itemId;
    private String location;
    private Integer priority;
    private LocalDateTime requestTime;
    private RequestStatus status;
    private Long teamId;   // null until a team is assigned

    public static PickupRequestResponse from(PickupRequest r) {
        PickupRequestResponse dto = new PickupRequestResponse();
        dto.requestId = r.getRequestId();
        dto.userId = r.getUser().getUserId();
        dto.itemId = r.getItem().getItemId();
        dto.location = r.getLocation();
        dto.priority = r.getPriority();
        dto.requestTime = r.getRequestTime();
        dto.status = r.getStatus();
        dto.teamId = (r.getTeam() == null) ? null : r.getTeam().getTeamId();
        return dto;
    }

    public Long getRequestId() { return requestId; }
    public Long getUserId() { return userId; }
    public Long getItemId() { return itemId; }
    public String getLocation() { return location; }
    public Integer getPriority() { return priority; }
    public LocalDateTime getRequestTime() { return requestTime; }
    public RequestStatus getStatus() { return status; }
    public Long getTeamId() { return teamId; }
}
