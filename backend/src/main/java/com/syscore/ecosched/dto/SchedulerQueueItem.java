package com.syscore.ecosched.dto;

import java.time.LocalDateTime;

/** One row of GET /api/scheduler/queue: a pending request in the order the C scheduler will dispatch it. */
public class SchedulerQueueItem {
    private final int rank;
    private final Long requestId;
    private final Integer priority;
    private final LocalDateTime requestTime;
    private final String location;
    private final String status = "PENDING";

    public SchedulerQueueItem(int rank, Long requestId, Integer priority, LocalDateTime requestTime, String location) {
        this.rank = rank;
        this.requestId = requestId;
        this.priority = priority;
        this.requestTime = requestTime;
        this.location = location;
    }
    public int getRank() { return rank; }
    public Long getRequestId() { return requestId; }
    public Integer getPriority() { return priority; }
    public LocalDateTime getRequestTime() { return requestTime; }
    public String getLocation() { return location; }
    public String getStatus() { return status; }
}
