package com.syscore.ecosched.dto;

import java.time.LocalDateTime;
import java.util.List;

/** Result of POST /api/scheduler/run. */
public class SchedulerRunResponse {

    public static class Assignment {
        private final Long requestId;
        private final Long teamId;
        private final String teamName;
        private final Integer priority;
        private final LocalDateTime requestTime;
        private final String location;
        /** State written to MySQL by this run (read back from the saved entities). */
        private final String requestStatus;
        private final String teamStatus;
        private final Long teamCurrentTask;

        public Assignment(Long requestId, Long teamId, String teamName, Integer priority,
                          LocalDateTime requestTime, String location,
                          String requestStatus, String teamStatus, Long teamCurrentTask) {
            this.requestStatus = requestStatus;
            this.teamStatus = teamStatus;
            this.teamCurrentTask = teamCurrentTask;
            this.requestId = requestId;
            this.teamId = teamId;
            this.teamName = teamName;
            this.priority = priority;
            this.requestTime = requestTime;
            this.location = location;
        }
        public Long getRequestId() { return requestId; }
        public Long getTeamId() { return teamId; }
        public String getTeamName() { return teamName; }
        public Integer getPriority() { return priority; }
        public LocalDateTime getRequestTime() { return requestTime; }
        public String getLocation() { return location; }
        public String getRequestStatus() { return requestStatus; }
        public String getTeamStatus() { return teamStatus; }
        public Long getTeamCurrentTask() { return teamCurrentTask; }
    }

    private final int pendingBefore;   // pending requests the scheduler saw at the start of the run
    private final int assignedCount;
    private final int pendingCount;
    private final int availableTeams;
    private final int busyTeams;
    private final List<Assignment> assignments;
    private final String message;
    private final LocalDateTime ranAt;

    public SchedulerRunResponse(int pendingBefore, int assignedCount, int pendingCount, int availableTeams, int busyTeams,
                                List<Assignment> assignments, String message) {
        this.pendingBefore = pendingBefore;
        this.assignedCount = assignedCount;
        this.pendingCount = pendingCount;
        this.availableTeams = availableTeams;
        this.busyTeams = busyTeams;
        this.assignments = assignments;
        this.message = message;
        this.ranAt = LocalDateTime.now();
    }

    public int getPendingBefore() { return pendingBefore; }
    public int getAssignedCount() { return assignedCount; }
    public int getPendingCount() { return pendingCount; }
    public int getAvailableTeams() { return availableTeams; }
    public int getBusyTeams() { return busyTeams; }
    public List<Assignment> getAssignments() { return assignments; }
    public String getMessage() { return message; }
    public LocalDateTime getRanAt() { return ranAt; }
}
